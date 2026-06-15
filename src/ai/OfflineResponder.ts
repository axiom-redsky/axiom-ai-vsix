/**
 * 오프라인 응답기(OfflineResponder).
 *
 * AI 서버가 죽었을 때, 입력을 의도 그룹으로 분류(결정론)하고 **로컬 RAG(knowledge/*.md)**로
 * react-app-scaffold 상세 지식·코드를 끌어와 입력과 연관된 실질적 도움을 준다.
 * 기존 폴백([FallbackStubService])이 키워드만 보고 엉뚱한 스니펫(useState 튜토리얼)을 주던 문제를,
 * 의도(액션) × 지식(토픽)의 합성으로 교체한다.
 *
 * 설계:
 *  - **의도** = 프레이밍 결정([classifyOfflineIntent]) — 모델 불필요.
 *  - **지식** = 본문([retrieveDocs] → knowledge/*.md) — 로컬 임베딩, LLM 불필요.
 *  - **프레이밍 문구** = 편집 가능한 `.stubs/groups/{group}.md` 템플릿(핫리로드). 없으면 내장 기본값.
 *
 * vscode/디스크에 직접 의존하지 않는다 — 외부 자원은 모두 주입(IOfflineResponderDeps)으로 받아
 * 단위 테스트에서 그대로 호출 가능하다.
 */

import type { IntentResult, IntentContext } from './IntentClassifier';
import { formatIntentForChat } from './IntentClassifier';
import { classifyOfflineIntent, stripFileRefs } from './IntentSignals';
import { buildContractSection } from './ScaffoldContracts';

/** OfflineResponder가 외부 자원에 접근하기 위한 주입 의존성. */
export interface IOfflineResponderDeps {
  /**
   * 쿼리 관련 로컬 RAG(knowledge/*.md) 섹션 블록을 반환. 미초기화/오류 시 빈 배열.
   * fileContent를 함께 받아 현재 파일의 import 기반 라우팅(useApi·Table 등 실제 사용 문서)을
   * 활성화한다. filePath는 일부러 넘기지 않는다 — `/pages/` 경로 자체가 router.md로 라우팅돼 노이즈.
   */
  retrieveDocs: (query: string, fileContent: string) => Promise<string[]>;
  /** 기존 .stubs/*.md 키워드 매칭 결과(RAG가 비었을 때 폴백). */
  selectStub: (query: string) => string;
  /** `.stubs/groups/{group}.md` 프레이밍 템플릿 본문(없으면 null → 내장 기본값). */
  loadGroupTemplate: (group: string) => string | null;
}

/** 오프라인 응답 한 건의 입력. */
export interface IOfflineRequest {
  query: string;
  /** 현재 열린 파일의 워크스페이스 상대 경로(없으면 null). */
  currentFile: string | null;
  /** 현재 파일 내용(계약 카드 트리거용 deps). 없으면 빈 문자열. */
  currentFileContent: string;
}

const OFFLINE_BADGE = '> ⚠️ **오프라인 모드** — AI 서버에 연결할 수 없어 로컬 지식으로 답변합니다.';

/** 그룹별 내장 기본 템플릿(`.stubs/groups/*.md`가 없을 때 사용). */
const DEFAULT_TEMPLATES: Record<string, string> = {
  smalltalk:
    `{{offlineBadge}}\n\n` +
    `안녕하세요! 지금은 **오프라인 모드**라 AI 생성은 쉬어가지만, react-app-scaffold 관련 ` +
    `질문(예: "useApi 사용법 알려줘")에는 로컬 지식으로 답해 드릴 수 있어요.`,
  qna:
    `{{offlineBadge}}\n\n` +
    `요청: \`{{query}}\`\n\n` +
    `## 관련 scaffold 지식\n{{ragSections}}`,
  modify_file:
    `{{offlineBadge}}\n\n` +
    `지금은 코드를 자동으로 적용할 수 없어, 직접 수정에 필요한 정보를 모았습니다.\n\n` +
    `{{intent}}\n\n` +
    `## 대상\n{{targetInfo}}\n\n` +
    `{{contractCards}}` +
    `## 관련 scaffold 지식\n{{ragSections}}\n\n` +
    `## 수동 적용 체크리스트\n` +
    `- [ ] 위 계약/지식을 참고해 대상 파일을 직접 수정\n` +
    `- [ ] 타입 네이밍(I/T 접두사)·import 경로 확인\n` +
    `- [ ] 서버 복구 후 동일 요청으로 자동 적용 재시도`,
  create_page:
    `{{offlineBadge}}\n\n` +
    `새 화면 생성은 AI 서버가 필요하지만, 오프라인에서도 출발점이 될 정보를 모았습니다.\n\n` +
    `{{intent}}\n\n` +
    `## 화면 템플릿·패턴\n{{ragSections}}\n\n` +
    `## 다음 단계\n` +
    `- 서버 복구 후 동일 요청으로 자동 생성, 또는 \`/spec <의도>\`로 스펙 먼저 작성하세요.`,
  other:
    `{{offlineBadge}}\n\n{{ragSections}}`,
};

export class OfflineResponder {
  constructor(private readonly _deps: IOfflineResponderDeps) {}

  /** 입력을 분류하고 그룹에 맞는 오프라인 마크다운 응답을 만든다. */
  async respond(req: IOfflineRequest): Promise<string> {
    const ctx: IntentContext = {
      currentFile: req.currentFile,
      hasSelection: false,
      domains: [],
    };
    const intent = classifyOfflineIntent(req.query, ctx);

    switch (intent.intent) {
      case 'smalltalk':
        return this._render('smalltalk', { query: req.query });
      case 'create_page':
        return this._renderWithRag('create_page', req, intent);
      case 'modify_file':
        return this._renderModifyFile(req, intent);
      case 'qna':
        return this._renderQna(req);
      default:
        return this._renderQna(req, 'other');
    }
  }

  private async _renderQna(req: IOfflineRequest, group: 'qna' | 'other' = 'qna'): Promise<string> {
    const ragSections = await this._ragOrStub(req);
    return this._render(group, { query: req.query, ragSections });
  }

  private async _renderWithRag(
    group: string, req: IOfflineRequest, intent: IntentResult,
  ): Promise<string> {
    const ragSections = await this._ragOrStub(req);
    return this._render(group, {
      query: req.query,
      intent: formatIntentForChat(intent),
      ragSections,
    });
  }

  private async _renderModifyFile(req: IOfflineRequest, intent: IntentResult): Promise<string> {
    const ragSections = await this._ragOrStub(req);
    // 계약 카드 트리거도 경로 토큰을 떼고 본다 — "EmployeeListPage"의 "list"가 list-table 레시피를
    // 오발동시키던 회귀 차단. useApi 등은 deps(현재 파일 내용)에서 정상 발동한다.
    const contractCards = buildContractSection({
      deps: req.currentFileContent,
      region: '',
      query: stripFileRefs(req.query),
    });
    const targetLines: string[] = [];
    if (intent.targetFile) {
      targetLines.push(`- 수정 대상: ${intent.targetFile === 'current' ? '현재 화면' : `\`${intent.targetFile}\``}`);
    }
    if (intent.contentSource) targetLines.push(`- 내용 출처: \`${intent.contentSource}\``);
    if (intent.domain) targetLines.push(`- 도메인: \`${intent.domain}\``);
    if (targetLines.length === 0) targetLines.push('- 대상 파일을 자동으로 특정하지 못했습니다.');

    return this._render('modify_file', {
      query: req.query,
      intent: formatIntentForChat(intent),
      targetInfo: targetLines.join('\n'),
      contractCards: contractCards ? `${contractCards}\n` : '',
      ragSections,
    });
  }

  /**
   * RAG 섹션을 합쳐 반환. 비었으면 기존 .stubs 키워드 매칭으로 폴백.
   * 쿼리의 파일 경로 토큰은 떼고(검색 토픽 아님) 현재 파일 내용은 import 라우팅용으로 함께 넘긴다.
   */
  private async _ragOrStub(req: IOfflineRequest): Promise<string> {
    const cleanQuery = stripFileRefs(req.query);
    let docs: string[] = [];
    try {
      docs = await this._deps.retrieveDocs(cleanQuery, req.currentFileContent);
    } catch {
      docs = [];
    }
    if (docs.length > 0) return docs.join('\n\n---\n\n');
    const stub = this._deps.selectStub(cleanQuery).trim();
    return stub || '_관련 로컬 지식을 찾지 못했습니다. 서버 복구 후 다시 시도해주세요._';
  }

  /** 템플릿(파일 우선, 없으면 내장)에 placeholder를 치환한다. */
  private _render(group: string, vars: Record<string, string>): string {
    const template = this._deps.loadGroupTemplate(group) ?? DEFAULT_TEMPLATES[group] ?? DEFAULT_TEMPLATES.other;
    const all: Record<string, string> = {
      offlineBadge: OFFLINE_BADGE,
      query: '',
      intent: '',
      targetInfo: '',
      contractCards: '',
      ragSections: '',
      plannedFiles: '',
      ...vars,
    };
    let out = template;
    for (const [k, v] of Object.entries(all)) {
      out = out.split(`{{${k}}}`).join(v ?? '');
    }
    // 미치환 placeholder 잔여 제거 + 빈 줄 정리
    out = out.replace(/\{\{[a-zA-Z_]+\}\}/g, '');
    return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
}
