/**
 * 의도 신호(Intent Signals) — vscode/디스크에 의존하지 않는 **순수 결정론** 술어 모음.
 *
 * 배경: 입력이 "수정/생성/질문/잡담" 중 무엇인지 판정하는 정규식 술어가 그동안
 * ScaffoldContextBuilder의 private 메서드(`_isSmalltalk`·`_isQnAQuery`·`_isExplicitEditOrCreate`·
 * `_extractDomainFromQuery`)에 갇혀 있었다. 오프라인 응답기(OfflineResponder)가 같은 판정을
 * 복제하면 두 곳이 갈라져 "intent routing 두더지잡기"가 재발하므로, 술어를 이 한 곳으로 모은다.
 *  - ScaffoldContextBuilder는 여기서 import해 기존 동작을 그대로 유지한다(회귀 0).
 *  - OfflineResponder는 모델 없이 `classifyOfflineIntent`로 입력을 그룹핑한다.
 *
 * 온라인용 [IntentClassifier](./IntentClassifier)(모델 위임)와 **형제** 관계: 모델이 살아 있으면
 * IntentClassifier가, 죽어 있으면 이 모듈이 같은 IntentResult 형태로 분류한다.
 */

import { PageCreationDetector } from './PageCreationDetector';
import type { IntentResult, IntentContext } from './IntentClassifier';

/**
 * 인사·감사·맞장구 등 비액션(non-actionable) 잡담인지 판단한다.
 * _isExplicitEditOrCreate가 우선 적용되는 흐름을 전제로 하므로 여기서는 짧은 인사/맞장구 신호만 본다(보수적).
 */
export function isSmalltalk(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true; // 빈 입력
  // 웃음·감탄·문장부호만으로 이뤄진 입력(ㅋㅋ, ㅎㅎ, ..., ~~)
  if (/^[ㅋㅎㅠㅜ\s~!?.,]+$/.test(trimmed) && /[ㅋㅎㅠㅜ]/.test(trimmed)) return true;
  const q = trimmed.toLowerCase();
  // 긴 문장은 실제 요청일 가능성이 높으므로, 부호·공백 제거 후 짧은 입력만 잡담 후보로 본다.
  const compact = q.replace(/[\s!.~?,'"`]/g, '');
  if (compact.length > 20) return false;
  const greetings = [
    '안녕', '하이', 'hi', 'hello', 'hey', 'ㅎㅇ', '반가', '방가',
    '고마', '감사', 'thank', 'thx', '수고', '굿', 'good job',
    '잘가', 'bye', 'ㅂㅂ', '바이', '좋아', '좋네', 'nice', '오케', 'okay', '테스트', 'test',
    '잘했', '멋지', '훌륭',
  ];
  return greetings.some((g) => q.includes(g));
}

/**
 * 조회·설명형(Q&A) 질문인지 판단한다. 코드를 보여달라거나 개념·사용법을 묻는 질문.
 * 게이팅은 isExplicitEditOrCreate가 false일 때만 적용되므로 여기서는 신호만 본다.
 */
export function isQnAQuery(query: string): boolean {
  const q = query.toLowerCase();
  const signals = [
    '보여줘', '보여 줘', '보여줄', '보여주', '알려줘', '알려 줘', '알려주',
    '설명', '뭐야', '뭔가', '무엇', '머야', '차이', '어떻게', '어떤', '왜',
    '예시', 'example', '사용법', '쓰는 법', '쓰는법', '하는 법', '하는법', '방법',
    '이란', '란?', '문서', '정의', '리스트', '목록 보여', '가능해', '가능한가',
    '있어?', '있나',
  ];
  if (signals.some((s) => q.includes(s))) return true;
  return q.trim().endsWith('?');
}

/**
 * 파일 생성/수정 의도가 명시적으로 드러나는지 판단한다(보수적: 동사·생성 패턴 기반).
 * 하나라도 걸리면 Q&A 게이팅을 적용하지 않고 기존 시나리오 지시문을 그대로 주입한다.
 */
export function isExplicitEditOrCreate(query: string): boolean {
  if (new PageCreationDetector().detect(query).isPageCreation) return true;
  const q = query.toLowerCase();
  const editVerbs = [
    '만들', '생성', '추가', '수정', '고쳐', '바꿔', '변경', '구현', '작성',
    '리팩', '삭제', '제거', '연동', '연결', '적용', '넣어', '붙여', '교체', '업데이트',
    '옮겨', '이동시', '바인딩', 'refactor', 'implement', 'create', 'make',
    'fix', 'change', 'update', 'remove', 'delete', 'rename',
  ];
  return editVerbs.some((v) => q.includes(v));
}

/**
 * 사용자 쿼리에서 도메인명을 추출한다.
 *
 * 우선순위:
 * 1. 명시적 패턴: "account 업무", "account domain", "account 도메인"
 * 2. PascalCase 페이지명 접두어: "AccountListPage" → "account"
 * 3. kebab-case 페이지명 첫 세그먼트: "account-list-page" → "account"
 */
export function extractDomainFromQuery(query: string): string | null {
  // 참조 소스 파일 경로(예: "/src/publishing/employee/pages/EmployeeListPage.tsx")는
  // "복사해 올 원본"이지 "만들 대상"이 아니다. 확장자가 붙은 파일 참조 토큰은 패턴 매칭 전에 제거한다.
  query = query.replace(/[\w./\\-]+\.(?:tsx?|jsx?|md|json|ya?ml|css)\b/gi, ' ');

  // 1순위: 명시적 도메인 언급 패턴
  const explicitPatterns = [
    /([a-zA-Z][a-zA-Z0-9-_]*)\s*업무/,
    /([a-zA-Z][a-zA-Z0-9-_]*)\s*domain/i,
    /([a-zA-Z][a-zA-Z0-9-_]*)\s*도메인/,
  ];
  for (const pattern of explicitPatterns) {
    const match = query.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }

  // 2순위: PascalCase 식별자(페이지명) 첫 번째 단어 → 도메인 추출
  const pascalMatch = query.match(/\b([A-Z][a-z]+)([A-Z][a-zA-Z0-9]*)*Page\b/);
  if (pascalMatch?.[1]) return pascalMatch[1].toLowerCase();

  // 3순위: kebab-case 페이지명 첫 세그먼트
  const kebabMatch = query.match(/\b([a-z][a-z0-9]+)(?:-[a-z0-9]+)+-page\b/);
  if (kebabMatch?.[1]) return kebabMatch[1];

  return null;
}

/** 파일 경로 참조 토큰(확장자 포함) 매칭 — 추출·제거에 공용으로 쓴다. */
const FILE_REF_RE = /[\w./\\-]+\.(?:tsx?|jsx?|md|json|ya?ml|css)\b/gi;

/** 쿼리에 적힌 파일 경로 참조(예: src/.../EmployeeListPage.tsx)의 첫 항목을 추출한다. 없으면 null. */
export function extractFilePathRef(query: string): string | null {
  const m = query.match(/[\w./\\-]+\.(?:tsx?|jsx?|md|json|ya?ml|css)\b/i);
  return m ? m[0].replace(/^\/+/, '') : null;
}

/**
 * 쿼리에서 파일 경로 참조 토큰을 제거한다(RAG 키워드 라우팅·계약 카드 매칭 전처리).
 *
 * 경로는 "복사해 올 출처"이지 검색 토픽이 아니다. 그런데 RAG 키워드 라우팅은 `q.includes(kw)`라
 * 경로 안의 일반 단어(EmployeeList**Page** → "page", Employee**List**Page → "list")가
 * page-generation·router·list-table 같은 **엉뚱한 문서/계약**을 끌어온다(캡처 회귀).
 * → 경로 토큰을 떼고 남은 의도 단어로만 라우팅한다.
 */
export function stripFileRefs(query: string): string {
  return query.replace(FILE_REF_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 모델 없이(결정론) 입력을 IntentResult 그룹으로 분류한다 — 오프라인 응답기 전용.
 *
 * 우선순위는 온라인 게이팅(isQnAGated)과 일치시킨다:
 *   페이지 생성 → 명시적 수정/생성 → 잡담 → 질문 → 불명확
 * (online: isExplicitEditOrCreate가 qna/smalltalk보다 우선)
 */
export function classifyOfflineIntent(query: string, ctx: IntentContext): IntentResult {
  const domain = extractDomainFromQuery(query);
  const fileRef = extractFilePathRef(query);

  // 1) 페이지 생성 (가장 구체적)
  const pc = new PageCreationDetector().detect(query);
  if (pc.isPageCreation) {
    return {
      intent: 'create_page',
      pageName: pc.pageName,
      domain,
      contentSource: fileRef,
      targetFile: null,
      targetComponent: null,
    };
  }

  // 2) 명시적 수정/생성 (편집 동사) — 현재 파일이 있으면 'current', 아니면 적힌 경로
  if (isExplicitEditOrCreate(query)) {
    const targetFile = ctx.currentFile ? 'current' : fileRef;
    // 경로가 곧 대상이면 contentSource로 중복 표기하지 않는다.
    const contentSource = fileRef && fileRef !== targetFile ? fileRef : null;
    return {
      intent: 'modify_file',
      pageName: null,
      domain,
      contentSource,
      targetFile,
      targetComponent: null,
    };
  }

  // 3) 잡담
  if (isSmalltalk(query)) {
    return { intent: 'smalltalk', pageName: null, domain: null, contentSource: null, targetFile: null, targetComponent: null };
  }

  // 4) 질문(조회·설명)
  if (isQnAQuery(query)) {
    return { intent: 'qna', pageName: null, domain, contentSource: fileRef, targetFile: null, targetComponent: null };
  }

  // 5) 불명확
  return { intent: 'other', pageName: null, domain, contentSource: fileRef, targetFile: null, targetComponent: null };
}
