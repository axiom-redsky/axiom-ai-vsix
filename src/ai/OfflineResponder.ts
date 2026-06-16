/**
 * 오프라인 응답기(OfflineResponder).
 *
 * AI 서버가 죽었을 때, 확정된 의도(OfflineIntentResolver)에 맞춰 그룹별 프레이밍 + **로컬 RAG
 * (knowledge/*.md)**로 react-app-scaffold 상세 지식·코드를 끌어와 입력과 연관된 도움을 준다.
 *
 * 설계:
 *  - **의도** = 프레이밍 결정(호출부가 resolvedIntent로 주입).
 *  - **지식** = 본문([retrieveDocs] → knowledge/*.md, 임베딩 폴백 OFF인 정밀 라우팅만). LLM 불필요.
 *  - **프레이밍 문구** = 편집 가능한 `.stubs/groups/{group}.md` 템플릿(핫리로드). 없으면 내장 기본값.
 *  - RAG가 비면 "관련 지식" 섹션 자체를 생략한다(엉뚱한 저관련 문서 노출 방지).
 *
 * vscode/디스크 비의존 — 외부 자원은 모두 주입(IOfflineResponderDeps)으로 받아 테스트 가능.
 */

import type { IntentResult, IntentContext } from './IntentClassifier';
import { classifyOfflineIntent, stripFileRefs } from './IntentSignals';
import { buildContractSection } from './ScaffoldContracts';

/** OfflineResponder가 외부 자원에 접근하기 위한 주입 의존성. */
export interface IOfflineResponderDeps {
  /**
   * 쿼리·확정 intent에 맞는 로컬 지식(knowledge/*.md) 블록을 반환. 미초기화/오류/무관 시 빈 배열.
   * 의미(로컬 임베딩)+키워드로 **문서를 통째로** 찾아 종류별 렌더한다(어휘 점수·예산 chopping 없음).
   * fileContent로 현재 파일의 import 기반 라우팅(useApi·Table 등 실제 사용 문서)을 보강한다.
   */
  retrieveDocs: (query: string, intent: IntentResult, fileContent: string) => Promise<string[]>;
  /** `.stubs/groups/{group}.md` 프레이밍 템플릿 본문(없으면 null → 내장 기본값). */
  loadGroupTemplate: (group: string) => string | null;
}

/** 오프라인 응답 한 건의 입력. */
export interface IOfflineRequest {
  query: string;
  /** 현재 열린 파일의 워크스페이스 상대 경로(없으면 null). */
  currentFile: string | null;
  /** 현재 파일 내용(계약 카드 트리거 + import 라우팅용). 없으면 빈 문자열. */
  currentFileContent: string;
}

const OFFLINE_BADGE = '> ⚠️ **오프라인 모드** — AI 서버에 연결할 수 없어 로컬 지식으로 답변합니다.';
const KNOWLEDGE_HEADING = '## 관련 scaffold 지식';
const TEMPLATE_HEADING = '## 화면 템플릿·패턴';

/** 그룹별 내장 기본 템플릿(`.stubs/groups/*.md`가 없을 때 사용). {{intent}}는 호출부가 별도 출력. */
const DEFAULT_TEMPLATES: Record<string, string> = {
  smalltalk:
    `{{offlineBadge}}\n\n` +
    `안녕하세요! 지금은 **오프라인 모드**라 AI 생성은 쉬어가지만, react-app-scaffold 관련 ` +
    `질문(예: "useApi 사용법 알려줘")에는 로컬 지식으로 답해 드릴 수 있어요.`,
  qna:
    `{{offlineBadge}}\n\n요청: \`{{query}}\`\n\n{{ragSections}}`,
  modify_file:
    `{{offlineBadge}}\n\n` +
    `지금은 코드를 자동으로 적용할 수 없어, 직접 수정에 필요한 정보를 모았습니다.\n\n` +
    `## 대상\n{{targetInfo}}\n\n` +
    `{{contractCards}}{{ragSections}}\n\n` +
    `## 수동 적용 체크리스트\n` +
    `- [ ] 위 계약/지식을 참고해 대상 파일을 직접 수정\n` +
    `- [ ] 타입 네이밍(I/T 접두사)·import 경로 확인\n` +
    `- [ ] 서버 복구 후 동일 요청으로 자동 적용 재시도`,
  create_page:
    `{{offlineBadge}}\n\n` +
    `새 화면 생성은 AI 서버가 필요하지만, 오프라인에서도 출발점이 될 정보를 모았습니다.\n\n` +
    `{{ragSections}}\n\n` +
    `## 다음 단계\n` +
    `- 서버 복구 후 동일 요청으로 자동 생성, 또는 \`/spec <의도>\`로 스펙 먼저 작성하세요.`,
  other:
    `{{offlineBadge}}\n\n{{ragSections}}`,
};

export class OfflineResponder {
  constructor(private readonly _deps: IOfflineResponderDeps) {}

  /**
   * 그룹에 맞는 오프라인 마크다운 응답을 만든다.
   * resolvedIntent를 주면(보통 OfflineIntentResolver가 결정) 그것을 쓰고, 없으면 정규식으로 분류한다.
   */
  async respond(req: IOfflineRequest, resolvedIntent?: IntentResult): Promise<string> {
    const ctx: IntentContext = { currentFile: req.currentFile, hasSelection: false, domains: [] };
    const intent = resolvedIntent ?? classifyOfflineIntent(req.query, ctx);

    switch (intent.intent) {
      case 'smalltalk':
        return this._render('smalltalk', { query: req.query });
      case 'create_page':
        return this._render('create_page', { query: req.query, ragSections: await this._ragSection(req, intent, TEMPLATE_HEADING) });
      case 'modify_file':
        return this._renderModifyFile(req, intent);
      case 'qna':
        return this._render('qna', { query: req.query, ragSections: await this._ragSection(req, intent, KNOWLEDGE_HEADING) });
      default:
        return this._render('other', { query: req.query, ragSections: await this._ragSection(req, intent, KNOWLEDGE_HEADING) });
    }
  }

  private async _renderModifyFile(req: IOfflineRequest, intent: IntentResult): Promise<string> {
    const ragSections = await this._ragSection(req, intent, KNOWLEDGE_HEADING);
    // 계약 카드 트리거도 경로 토큰을 떼고 본다 — "EmployeeListPage"의 "list"가 list-table 레시피를
    // 오발동시키던 회귀 차단. useApi 등은 deps(현재 파일 내용)에서 정상 발동한다.
    const contractCards = buildContractSection({ deps: req.currentFileContent, region: '', query: stripFileRefs(req.query) });

    const targetLines: string[] = [];
    targetLines.push(`- 수정 대상: ${req.currentFile ? '현재 화면' : '미특정'}`);
    if (intent.contentSource) targetLines.push(`- 내용 출처: \`${intent.contentSource}\``);
    if (intent.domain) targetLines.push(`- 도메인: \`${intent.domain}\``);

    return this._render('modify_file', {
      query: req.query,
      targetInfo: targetLines.join('\n'),
      contractCards: contractCards ? `${contractCards}\n` : '',
      ragSections,
    });
  }

  /**
   * 로컬 지식 섹션(헤딩 포함)을 만든다. 의미(로컬 임베딩)+키워드로 문서를 통째로 끌어오고,
   * 비면 빈 문자열을 돌려 "관련 지식" 섹션 자체를 생략한다(엉뚱한 저관련 문서 노출 방지).
   */
  private async _ragSection(req: IOfflineRequest, intent: IntentResult, heading: string): Promise<string> {
    const cleanQuery = stripFileRefs(req.query);
    let docs: string[] = [];
    try {
      docs = await this._deps.retrieveDocs(cleanQuery, intent, req.currentFileContent);
    } catch {
      docs = [];
    }
    if (!docs || docs.length === 0) return '';
    return `${heading}\n\n${docs.join('\n\n---\n\n')}`;
  }

  /** 템플릿(파일 우선, 없으면 내장)에 placeholder를 치환한다. */
  private _render(group: string, vars: Record<string, string>): string {
    const template = this._deps.loadGroupTemplate(group) ?? DEFAULT_TEMPLATES[group] ?? DEFAULT_TEMPLATES.other;
    const all: Record<string, string> = {
      offlineBadge: OFFLINE_BADGE,
      query: '',
      targetInfo: '',
      contractCards: '',
      ragSections: '',
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
