/**
 * 의도 분류기 (Intent Classifier)
 *
 * 입력 의도 판단을 **모델에 먼저 위임**하기 위한 순수 함수 모음. 기존 정규식 게이트
 * (PageCreationDetector·isQnAGated·isFileModificationContext)는 자연어 꼬리를 못 따라가
 * "두더지잡기"가 됐다(예: 수정 요청 속 참조 소스 파일명 `EmployeeListPage.tsx`를 만들 이름으로
 * 오인 → 신규 생성으로 오라우팅). 이 모듈은 region disambiguation과 동일한 검증된 패턴을 쓴다:
 *   ① 모델에 **극도로 제약된 출력**(작은 JSON 한 줄)만 요구하고,
 *   ② 파싱 실패/모델 부재/타임아웃이면 **null**을 돌려 호출부가 기존 정규식으로 폴백한다.
 *
 * 즉 모델이 멀쩡하면 의미로 정확히 분류하고, 모델이 헛소리하거나 꺼져 있으면 오늘과 동일하게
 * 동작한다(회귀 위험 0). 실행 레이어의 충돌 안전(덮어쓰기 되묻기 등)이 모델 오분류의 마지막
 * 방어선이므로, 이 분류 결과는 "힌트"이고 진실은 파일시스템 재검증이 쥔다.
 *
 * vscode/디스크에 의존하지 않는다(단위 테스트·eval 하니스에서 그대로 호출 가능).
 */

/** 최상위 의도 — 라우팅 분기의 단일 축. */
export type IntentKind =
  | 'create_page' // 새 페이지/화면을 만든다
  | 'modify_file' // 기존(보통 현재 열린) 파일을 고친다
  | 'qna' // 조회·설명형 질문(코드를 안 바꿈)
  | 'smalltalk' // 인사·맞장구 등 비액션
  | 'other'; // 위 어디에도 안 맞음 → 호출부가 폴백/기본 흐름

export interface IntentResult {
  intent: IntentKind;
  /** 새로 만들 페이지명(PascalCase). create_page일 때만 의미. */
  pageName: string | null;
  /** 명시된 대상 도메인(예: "employee"). 없으면 null. */
  domain: string | null;
  /** "내용 출처"로 지정한 기존 파일 경로(복사해 올 원본). 만들/고칠 대상이 아님. */
  contentSource: string | null;
  /** 고칠 대상 파일. 현재 열린 파일이면 "current", 경로 명시면 그 경로, 모르면 null. */
  targetFile: string | null;
}

export interface IntentContext {
  /** 현재 열린 파일의 워크스페이스 상대 경로(없으면 null). */
  currentFile: string | null;
  /** 에디터에 선택 영역이 있는지. */
  hasSelection: boolean;
  /** 워크스페이스 도메인 목록(src/domains/*). 모델이 도메인 슬롯을 고를 후보. */
  domains: string[];
}

const VALID_INTENTS: ReadonlySet<string> = new Set<IntentKind>([
  'create_page',
  'modify_file',
  'qna',
  'smalltalk',
  'other',
]);

/**
 * 분류 프롬프트. 출력은 **JSON 한 줄**로 강제하고, 예시는 사용자 실도메인과 겹치지 않는
 * 중립 도메인(catalog/inventory/billing)으로 둔다 — 약한 모델이 예시 도메인을 답에 그대로
 * 베끼는 parroting을 피하기 위함(메모리: few-shot parroting).
 */
export function buildIntentPrompt(query: string, ctx: IntentContext): string {
  const cur = ctx.currentFile ?? '(열린 파일 없음)';
  const sel = ctx.hasSelection ? '있음' : '없음';
  const domainList = ctx.domains.length ? ctx.domains.join(', ') : '(없음)';

  return (
    `당신은 코드 어시스턴트의 **의도 분류기**입니다. 아래 사용자 요청이 무엇을 원하는지 판단해 ` +
    `**JSON 한 줄만** 출력하세요. 설명·코드펜스 금지.\n\n` +
    `## 출력 스키마\n` +
    `{"intent": "create_page|modify_file|qna|smalltalk|other", "pageName": string|null, ` +
    `"domain": string|null, "contentSource": string|null, "targetFile": "current"|string|null}\n\n` +
    `## 필드 규칙\n` +
    `- intent: create_page=새 페이지/화면 생성, modify_file=기존(보통 현재) 파일 수정, ` +
    `qna=조회·설명 질문, smalltalk=인사·잡담, other=불명확.\n` +
    `- pageName: **새로 만들** 페이지의 PascalCase 이름. create_page가 아니면 null. ` +
    `요청에 적힌 파일경로 안의 이름(.tsx 등)은 "출처"이지 "만들 이름"이 아니므로 pageName에 넣지 마세요.\n` +
    `- domain: 명시된 대상 도메인. 후보: [${domainList}]. 불명확하면 null.\n` +
    `- contentSource: "이 파일 내용으로 채워/넣어줘"처럼 **복사해 올 원본** 파일 경로. 없으면 null.\n` +
    `- targetFile: 고칠 대상. "현재 화면/파일"이면 "current", 경로가 명시되면 그 경로, 모르면 null.\n\n` +
    `## 예시\n` +
    `요청: "상품 목록 화면 만들어줘"\n` +
    `{"intent":"create_page","pageName":null,"domain":null,"contentSource":null,"targetFile":null}\n` +
    `요청: "CatalogListPage 를 catalog 도메인에 만들어줘"\n` +
    `{"intent":"create_page","pageName":"CatalogListPage","domain":"catalog","contentSource":null,"targetFile":null}\n` +
    `요청: "현재 화면 jsx를 src/publishing/inventory/pages/StockPage.tsx 내용으로 넣어줘"\n` +
    `{"intent":"modify_file","pageName":null,"domain":null,"contentSource":"src/publishing/inventory/pages/StockPage.tsx","targetFile":"current"}\n` +
    `요청: "이 useApi 훅이 무슨 일을 해?"\n` +
    `{"intent":"qna","pageName":null,"domain":null,"contentSource":null,"targetFile":null}\n` +
    `요청: "고마워 잘 됐어"\n` +
    `{"intent":"smalltalk","pageName":null,"domain":null,"contentSource":null,"targetFile":null}\n\n` +
    `## 현재 상태\n` +
    `- 열린 파일: ${cur}\n` +
    `- 선택 영역: ${sel}\n\n` +
    `## 사용자 요청\n"${query}"\n\nJSON:`
  );
}

/**
 * 모델 출력에서 첫 JSON 객체를 뽑아 IntentResult로 검증한다.
 * intent가 유효 enum이 아니거나 JSON이 없으면 null(=호출부가 정규식 폴백).
 */
export function parseIntent(output: string): IntentResult | null {
  // 코드펜스가 섞여 와도 첫 중괄호 객체만 본다.
  const m = output.match(/\{[\s\S]*?\}/);
  if (!m) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const o = raw as Record<string, unknown>;
  const intent = typeof o.intent === 'string' ? o.intent.trim() : '';
  if (!VALID_INTENTS.has(intent)) return null;

  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t || t.toLowerCase() === 'null') return null;
    return t;
  };

  return {
    intent: intent as IntentKind,
    pageName: str(o.pageName),
    domain: str(o.domain),
    contentSource: str(o.contentSource),
    targetFile: str(o.targetFile),
  };
}

/** 분류 결과를 채팅에 보여줄 한 줄 텍스트로 만든다(확인용). */
export function formatIntentForChat(r: IntentResult): string {
  const label: Record<IntentKind, string> = {
    create_page: '새 페이지 생성',
    modify_file: '현재/기존 파일 수정',
    qna: '질문(조회·설명)',
    smalltalk: '잡담',
    other: '불명확',
  };
  const parts: string[] = [`**${label[r.intent]}**`];
  if (r.pageName) parts.push(`이름: \`${r.pageName}\``);
  if (r.domain) parts.push(`도메인: \`${r.domain}\``);
  if (r.targetFile) parts.push(`대상: ${r.targetFile === 'current' ? '현재 화면' : `\`${r.targetFile}\``}`);
  if (r.contentSource) parts.push(`내용 출처: \`${r.contentSource}\``);
  return `🧭 의도 분석: ${parts.join(' · ')}`;
}
