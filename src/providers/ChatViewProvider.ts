import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { LlmService } from '../ai/pipeline/LlmService';
import { EditorContextCollector, type EditorContext } from '../ai/decompose/EditorContextCollector';
import { ScaffoldContextBuilder } from '../ai/ScaffoldContextBuilder';
import { FileCreatorService } from '../ai/pipeline/FileCreatorService';
import type { AxiomAction, LineEdit, MultiPatchResult, PatchBlock } from '../ai/pipeline/FileCreatorService';
import { extractRelevantTsSlice, restoreSlicedStubs, splitTsSections, stripSliceStubs } from '../ai/decompose/CodeSectionExtractor';
import { applyStructuralEdit, findUnresolvedReferences, findDuplicateDeclarations, resolveKnownImports, ensureUiComponentImports, type ImportRequest } from '../ai/apply/StructuralAnchor';
import { runHybridRegionEdit, classifyRegionDecline, buildDisambiguationPrompt, parseDisambiguationPick, buildImportProvenance, REGION_GROUNDABLE_REASONS, type RegionEditOutcome } from '../ai/pipeline/RegionEditService';
import { buildCaptureEntry, serializeCaptureLine, shouldCapture } from '../ai/pipeline/RegionCaptureRecorder';
import { crossFileSuppressionReason } from '../ai/intent/CrossFileTargeting';
import { buildContractSection } from '../ai/contracts/ScaffoldContracts';
import { buildComponentOptionsReference, detectComponentsInText } from '../ai/contracts/ComponentPropsIndex';
import {
  findRowCollectionVar,
  findRowMapVar,
  extractTableColumns,
  pickResponseSchema,
  reconcile,
  buildBindingCode,
  rewriteMappedFields,
  stripModuleConst,
  removeTableColumns,
  buildFieldMappingPrompt,
  parseFieldMapping,
  deriveRootName,
  type IFieldRename,
} from '../ai/ApiBindingRecipe';
import { impliedControlTags } from '../ai/decompose/RegionIntent';
import { computeDiffHunks } from '../ai/apply/DiffUtil';
import {
  splitIntoSections,
  scoreSections,
  tokenizeQuery,
  selectByBudget,
  extractApiPaths,
  matchedApiPaths,
  unmatchedApiPaths,
  containsExactApiPath,
  formatExactPathDirective,
  type MdSection,
} from '../ai/decompose/SectionExtractor';
import { PageCreationDetector } from '../ai/intent/PageCreationDetector';
import { buildIntentPrompt, parseIntent, formatIntentForChat, type IntentResult, type IntentKind, type IntentContext } from '../ai/intent/IntentClassifier';
import { FALLBACK_HINT } from '../ai/retrieval/OfflineKnowledgeRetriever';
import { OfflineResponder } from '../ai/retrieval/OfflineResponder';
import { ActionCardController } from './ActionCardController';
import {
  buildBindingApply, buildBindingPlan, pickSpecDoc, rankByPathAffinity, type IBindingPlan,
} from '../ai/actions/OfflineApiBinding';
import { scanSpecDocs, listEndpoints, type ISpecDoc } from '../ai/actions/SpecDocScanner';
import { buildRecipeApply, buildRecipePlan, type IRecipePlan } from '../ai/actions/OfflineRecipeApply';
import type { IActionCard } from '../ai/actions/types';
import { planJsxTransplant, isVerbatimTransplantRequest } from '../ai/retrieval/OfflineTransplant';
import { IntentExampleStore } from '../ai/intent/IntentExampleStore';
import { IntentEmbeddingClassifier } from '../ai/intent/IntentEmbeddingClassifier';
import { resolveOfflineIntent } from '../ai/intent/OfflineIntentResolver';
import { detectJsonTypeRequest, renderJsonTypeCard, type IJsonTypeRequest } from '../ai/JsonTypeGenerator';
import { fillSlots, classifyOfflineIntent } from '../ai/intent/IntentSignals';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { ChatMessage, LlmConfig, LlmTuning } from '../ai/types';
import {
  ENVELOPE_CHOICE_KEY, RECIPE_ANCHOR_CHOICE_KEY, RECIPE_CURSOR_KEY, TARGET_FILE_CHOICE_KEY,
} from '../types/messages';
import type { WebviewToHostMessage, HostToWebviewMessage, PageCreationState, DiffLine, ActionCardOutputView } from '../types/messages';

/**
 * grounded bounded retry에서 모델에 돌려주는 "실제 코드 영역" 1건.
 * 실패 patch는 locateFuzzyRegion으로, 성공 patch는 resolvedOk로 위치를 확보해 채운다.
 */
interface GroundedPatchRegion {
  /** 원본 patch 배열에서의 인덱스 */
  index: number;
  /** 모델이 직전에 의도했던 변경 결과(<replace> 원문) */
  intent: string;
  /** 해당 위치의 실제 현재 코드(<search>에 그대로 복사하도록 제시) */
  realText: string;
  /** 1-based 라인 범위(포함) — 안내용 */
  startLine: number;
  endLine: number;
}

/**
 * 우측 Secondary Side Bar에 표시되는 채팅 WebviewView 프로바이더.
 * WebviewPanel(에디터 탭)이 아닌 WebviewView(사이드바 패널)로 동작한다.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.chatView';

  private _view?: vscode.WebviewView;
  private _history: ChatMessage[] = [];
  private _abortController?: AbortController;
  private _pageCreationState: PageCreationState | null = null;
  private readonly _pageCreationDetector = new PageCreationDetector();
  private _externalWatcherDebounce: ReturnType<typeof setTimeout> | null = null;
  private _externalWatcher: vscode.FileSystemWatcher | null = null;
  private _userStubsWatcher: vscode.FileSystemWatcher | null = null;
  private _userStubsDebounce: ReturnType<typeof setTimeout> | null = null;
  private _axiomWatcher: vscode.FileSystemWatcher | null = null;
  private _configChangeDisposable?: vscode.Disposable;

  private readonly _llm: LlmService;
  private readonly _editorCollector: EditorContextCollector;
  private readonly _scaffoldBuilder: ScaffoldContextBuilder;
  private readonly _offline: OfflineResponder;
  /** 오프라인 행동 카드 컨트롤러 — 추천·칩 편집·실행(생성자에서 초기화). */
  private readonly _actionCards: ActionCardController;
  private readonly _intentExamples: IntentExampleStore;
  private readonly _intentClassifier: IntentEmbeddingClassifier;
  /** 오프라인 의도 되묻기 대기 상태 — 사용자가 번호로 의도를 고르면 해소. */
  private _offlineClarify: { query: string; editorCtx: EditorContext; candidates: IntentKind[] } | null = null;
  /** 헬스체크 단기 캐시 — 연속 턴마다 5초 프로브를 반복하지 않도록 10초간 결과를 재사용. */
  private _healthCache: { at: number; online: boolean } | null = null;
  private readonly _fileCreator = new FileCreatorService();
  private readonly _corpusOutputChannel: vscode.OutputChannel;
  /** 실패 자동 포집(experimental, 기본 OFF) JSONL 저장 디렉터리 = 확장 globalStorage. registerCorpusWatcher에서 설정. */
  private _captureDir: string | undefined;
  /** 디버그: AI로 전송하는 시스템 프롬프트 전문을 기록하는 전용 채널 (lazy 생성) */
  private _promptOutputChannel: vscode.OutputChannel | undefined;
  private readonly _pendingConfirmations = new Map<string, { resolve: (approved: boolean) => void }>();
  /**
   * patch 매칭 실패·React 규칙 위반 후 사용자 선택 대기 — recoveryId 단위로 보관.
   * reactViolation이 있으면 "Full로 재시도" 시 위반 내용을 프롬프트에 실어 모델이 훅을
   * 컴포넌트 본문 안으로 옮기도록 유도한다.
   */
  private readonly _pendingPatchRecovery = new Map<string, { filePath: string; reactViolation?: string }>();
  /**
   * 마지막 _handleMessage가 수집한 선택 영역의 라인 범위.
   * _handleAxiomAction → computeMultiPatch까지 thread하기 위한 캐시.
   * 새 메시지 처리 시작 시 갱신, 선택 없으면 undefined.
   */
  private _lastSelectionLineRange: { startLine: number; endLine: number } | undefined;
  /** 직전 사용자 요청 원문 — 재시도·후처리 게이트가 삭제 의도 판정 등에 참조(retry 지시문에 오염되지 않음). */
  private _lastUserQuery = '';

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._llm = new LlmService(_extensionUri);
    this._editorCollector = new EditorContextCollector(ExtensionConfig.getMaxFileLines());
    this._corpusOutputChannel = vscode.window.createOutputChannel('axiom-ai: Corpus');
    this._scaffoldBuilder = new ScaffoldContextBuilder(_extensionUri, this._corpusOutputChannel);
    this._offline = new OfflineResponder({
      // 오프라인 전용 지식 검색 — 의미(로컬 임베딩)+키워드로 문서를 통째로 찾아 종류별 렌더.
      // 온라인 공유 buildContext를 거치지 않는다(어휘 점수·예산 chopping 없음).
      retrieveDocs: (q, intent, content) => this._scaffoldBuilder.retrieveOfflineKnowledge(q, intent, content),
      loadGroupTemplate: (g) => this._llm.loadGroupTemplate(g),
    });
    const bundledIntents = vscode.Uri.joinPath(_extensionUri, 'intents').fsPath;
    const userIntents = ExtensionConfig.getOfflineIntentConfig().userExamplesFolder || null;
    this._intentExamples = new IntentExampleStore(
      fs.existsSync(bundledIntents) ? bundledIntents : null,
      userIntents,
    );
    this._intentClassifier = new IntentEmbeddingClassifier(this._intentExamples);
    // 오프라인 행동 카드(계획 카드) — 행동성 요청의 직접 실행을 추천+클릭 실행으로 치환.
    this._actionCards = new ActionCardController(_extensionUri, {
      post: (msg) => this._post(msg),
      renderMarkdown: (md, pin) => {
        this._postOfflineTurn();
        if (pin) this._post({ type: 'pinQuestion' });
        this._post({ type: 'token', content: md });
        this._history.push({ role: 'assistant', content: md });
        this._post({ type: 'done' });
        this._postStatus('⚠️ 오프라인 모드');
      },
      createPageFromTemplate: (name, domain) => this._createPageFromTemplate(name, domain, 'action-card'),
      previewTemplateOutputs: (templateId, values) => this._previewTemplateOutputs(templateId, values),
      normalizeTemplateSlot: (templateId, slotName, raw) =>
        templateId === 'page' && slotName === 'pageName'
          // 실행(_executeTemplate)·미리보기와 같은 정규화를 칩 값에도 적용해 셋이 항상 일치하게 한다.
          ? this._pageCreationDetector.normalizeName(raw)
          : raw,
      scanDomains: () => this._scanWorkspaceDomains(),
      scanEndpoints: () => listEndpoints(this._specDocs()),
      currentCodeFile: () => this._currentCodeFilePath(),
      currentEditorAnchor: () => this._currentEditorAnchor(),
      buildBindingPlan: (bindingId, values) => this._buildCardBindingPlan(bindingId, values),
      applyBinding: (bindingId, values, choices) => this._applyCardBinding(bindingId, values, choices),
      buildRecipePlan: (card, values, query, opts) => this._buildCardRecipePlan(card, values, query, opts),
      applyRecipe: (card, values, query, opts) => this._applyCardRecipe(card, values, query, opts),
      workspaceRoot: () => this._getWorkspaceRoot(),
    });
  }

  /**
   * 워크스페이스 스펙 후보 문서 — 짧게 캐시한다. 카드 한 장을 그리는 데 칩·계획·엔드포인트 목록이
   * 각각 스캔을 부르므로(한 턴에 여러 번) 매번 파일시스템을 훑으면 체감이 나빠진다.
   */
  private _specDocsCache: { at: number; docs: ISpecDoc[] } | null = null;

  private _specDocs(): ISpecDoc[] {
    const now = Date.now();
    if (this._specDocsCache && now - this._specDocsCache.at < 15_000) return this._specDocsCache.docs;
    const docs = scanSpecDocs(this._getWorkspaceRoot());
    this._specDocsCache = { at: now, docs };
    return docs;
  }

  /**
   * 계획 카드용 API→테이블 바인딩 계획 — 현재 파일(디스크 원문) + 스펙 문서로 매핑 테이블을 만든다.
   *
   * 원문을 에디터 버퍼가 아니라 디스크에서 읽는 이유는 region 편집과 같다: 적용도 디스크 기준이라
   * 계획과 적용이 같은 텍스트를 봐야 "카드에서 본 것 = 적용된 것"이 유지된다.
   */
  private _buildCardBindingPlan(
    bindingId: string,
    values: Record<string, string>,
    /** 이미 읽어 둔 원문(적용 경로) — 계획과 적용이 **같은 텍스트**를 보게 하려고 넘긴다. */
    preread?: { path: string; content: string },
  ): IBindingPlan | null {
    if (bindingId !== 'api-table') return null;
    // 대상 파일은 **카드가 들고 있는 값**이 우선이다. 매번 "지금 활성 편집기"를 다시 읽으면 사용자가
    // 스펙 문서를 열어보는 것만으로 카드가 .md를 보고 "테이블 없음"으로 잠긴다(실측).
    const file = preread ?? this._readCardFile(values[TARGET_FILE_CHOICE_KEY]);
    const endpoint = (values.endpoint ?? '').trim();
    const docs = this._specDocs();
    // 엔드포인트가 정해져야 스펙 문서를 고를 수 있다 — 미정이면 buildBindingPlan이 사유를 채워 돌려준다.
    const spec = endpoint ? pickSpecDoc(docs, endpoint) : null;
    return buildBindingPlan({
      // 파일을 못 읽어도 계획은 만든다 — null을 돌려주면 카드 본문이 통째로 사라져 이유가 안 보인다.
      source: file?.content ?? '',
      specText: spec?.text ?? null,
      endpoint,
      lookup: {
        docsScanned: docs.length,
        pathMentioned: !!endpoint && docs.some((d) => containsExactApiPath(d.text, endpoint)),
      },
      ...(file ? { targetFile: file.path } : {}),
      targetFileChoices: this._listOpenCodeFiles(),
      // 배선 전용 모드에서 사용자가 카드에서 고른 봉투 키(스펙이 있으면 무시된다).
      ...(values[ENVELOPE_CHOICE_KEY] ? { envelopeOverride: values[ENVELOPE_CHOICE_KEY] } : {}),
      ...(spec ? {} : { suggestions: this._suggestBindableEndpoints(docs, endpoint) }),
    });
  }

  /** 지정된 경로(없으면 현재 코드 파일)를 디스크에서 읽는다. */
  private _readCardFile(preferred?: string): { path: string; content: string } | null {
    const rel = (preferred ?? '').trim();
    if (rel) {
      try {
        return { path: rel, content: fs.readFileSync(this._resolveWorkspacePath(rel), 'utf-8') };
      } catch {
        return null; // 파일이 사라졌거나 경로가 깨짐 → 계획이 사유를 말한다
      }
    }
    return this._currentFileForCard();
  }

  /**
   * 편집기에 **열려 있는 코드 파일** 목록(활성 탭 우선). 계획 카드의 "대상 파일" 후보다.
   *
   * 워크스페이스 전체를 뒤지지 않는 이유: 지금 작업 중인 화면은 거의 항상 열려 있고, 수백 개
   * 목록은 고르기 더 어렵다. 열린 탭이 곧 "지금 하는 일"의 범위다.
   */
  private _listOpenCodeFiles(): string[] {
    const out: string[] = [];
    const add = (uri: vscode.Uri | undefined): void => {
      if (!uri || uri.scheme !== 'file' || !/\.(tsx|ts|jsx|js)$/.test(uri.fsPath)) return;
      const rel = this._toWorkspaceRelative(uri.fsPath);
      if (rel && !out.includes(rel)) out.push(rel);
    };
    add(vscode.window.activeTextEditor?.document.uri);
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input as { uri?: vscode.Uri } | undefined;
        add(input?.uri);
      }
    }
    return out;
  }

  /**
   * 막혔을 때 제시할 **실제로 바인딩 가능한** 경로들.
   *
   * "스펙에 없다"로 끝내면 막다른 길이다(실측: `/api/courses/:courseId/lessons`는 스펙에 있었지만
   * POST뿐이라 목록 스키마가 없었고, 사용자는 클릭할 것이 없었다). 스펙에서 이미 54개 경로를 알고
   * 있으므로, 요청과 가까운 순으로 몇 개만 **스키마가 실제로 나오는지 확인해** 후보로 준다
   * (전부 확인하면 큰 문서에서 비싸므로 상위 몇 개만 — 막힌 순간에만 도는 경로다).
   */
  private _suggestBindableEndpoints(docs: ISpecDoc[], endpoint: string): string[] {
    const ranked = rankByPathAffinity(listEndpoints(docs), endpoint).slice(0, 8);
    const out: string[] = [];
    for (const path of ranked) {
      if (out.length >= 4) break;
      if (pickSpecDoc(docs, path)) out.push(path);
    }
    return out;
  }

  /**
   * 계획 카드가 편집할 **코드 파일**(디스크 원문). 없으면 null.
   *
   * 편집 대상은 코드 파일이어야 한다 — 활성 편집기가 스펙 문서(.md)면 그건 "지금 보고 있는 문서"일 뿐
   * 편집 대상이 아니다. 그 경우 열린 탭의 코드 파일로 내려간다(사용자가 카드에서 바꿀 수도 있다).
   */
  private _currentFileForCard(): { path: string; content: string } | null {
    const ctx = this._editorCollector.collect();
    const candidates = [
      ...(ctx.available && ctx.filePath && /\.(tsx|ts|jsx|js)$/.test(ctx.filePath) ? [ctx.filePath] : []),
      ...this._listOpenCodeFiles(),
    ];
    for (const rel of candidates) {
      try {
        return { path: rel, content: fs.readFileSync(this._resolveWorkspacePath(rel), 'utf-8') };
      } catch {
        /* 다음 후보 */
      }
    }
    return null;
  }

  /** 카드 세션이 붙잡을 대상 파일(워크스페이스 상대 경로). 없으면 null. */
  private _currentCodeFilePath(): string | null {
    return this._currentFileForCard()?.path ?? null;
  }

  /**
   * 카드 세션이 붙잡을 **삽입 위치**(레시피 카드) — 요청 시점의 선택 영역 또는 커서 줄.
   *
   * 선택이 있으면 `sel:시작-끝`(그 영역을 교체), 없으면 `line:커서줄`(그 줄 앞에 삽입).
   * 온라인에서 모델이 하던 "어디에 넣을까"를 오프라인에서는 사용자가 이미 답해 둔 셈이다 —
   * 커서는 대개 작업하려던 자리에 있다(§2 "모델의 한 조각을 사람의 클릭으로").
   */
  private _currentEditorAnchor(): string | null {
    const ctx = this._editorCollector.collect();
    if (!ctx.available) return null;
    // 선택 영역이 있으면 그게 가장 분명한 의사표시다(비어 있으면 collector가 selection을 안 채운다).
    if (ctx.selection && ctx.selection.endLine >= ctx.selection.startLine) {
      return `sel:${ctx.selection.startLine}-${ctx.selection.endLine}`;
    }
    // 커서 줄은 **대상 파일과 같은 문서**의 편집기에서 읽는다. 채팅 입력창에 포커스가 있으면
    // activeTextEditor가 엉뚱한(또는 빈) 편집기일 수 있어, 그대로 믿으면 남의 파일 줄 번호가 실린다.
    const target = ctx.absoluteFilePath;
    const editors = [
      ...(vscode.window.activeTextEditor ? [vscode.window.activeTextEditor] : []),
      ...vscode.window.visibleTextEditors,
    ];
    for (const ed of editors) {
      if (ed.document.uri.scheme !== 'file') continue;
      if (target && path.resolve(ed.document.fileName) !== path.resolve(target)) continue;
      return `line:${ed.selection.active.line + 1}`;
    }
    // 커서를 못 읽어도 계획은 선다 — 화면(JSX) 랜드마크가 후보를 채우고, 사용자가 칩에서 고른다.
    return null;
  }

  /**
   * 레시피 카드의 삽입 계획 — 대상 파일 원문(디스크)에 골격을 어떻게 넣을지 계산한다(모델 0회).
   * 대상은 **카드가 들고 있는 파일**이 우선이다(바인딩 카드와 같은 규약 — 렌더 중에 활성 편집기가
   * 바뀌어도 계획이 흔들리지 않게).
   */
  private _buildCardRecipePlan(
    card: IActionCard,
    values: Record<string, string>,
    query: string,
    opts?: { preferCursor?: boolean },
    preread?: { path: string; content: string },
  ): IRecipePlan | null {
    if (card.action.type !== 'recipe') return null;
    const file = preread ?? this._readCardFile(values[TARGET_FILE_CHOICE_KEY]);
    return buildRecipePlan({
      source: file?.content ?? '',
      skeleton: card.skeleton ?? '',
      values,
      targetFile: file?.path ?? null,
      targetFileChoices: this._listOpenCodeFiles(),
      // 요청 문장 + 카드가 선언한 방식 → 결정론 위치 찾기가 자리를 제안한다(커서 의존 제거).
      query,
      ...(card.action.mode ? { mode: card.action.mode } : {}),
      ...(card.action.target ? { target: card.action.target } : {}),
      ...(values[RECIPE_ANCHOR_CHOICE_KEY] ? { anchorChoice: values[RECIPE_ANCHOR_CHOICE_KEY] } : {}),
      ...(values[RECIPE_CURSOR_KEY] ? { cursorAnchor: values[RECIPE_CURSOR_KEY] } : {}),
      ...(opts?.preferCursor ? { preferCursor: true } : {}),
    });
  }

  /**
   * 편집기 커서 이동 → 살아 있는 레시피 카드의 삽입 위치를 따라가게 한다.
   *
   * 사용자가 카드를 띄워 놓고 자리를 고르는 방식이 "커서를 옮겨 보는 것"이라(실측 요청),
   * 그 행동을 그대로 입력으로 받는다. 타이핑·드래그로 초당 여러 번 오므로 짧게 묶어(디바운스)
   * 마지막 위치만 반영한다.
   */
  registerCursorTracking(context: vscode.ExtensionContext): void {
    let timer: NodeJS.Timeout | undefined;
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.uri.scheme !== 'file') return;
        if (!/\.(tsx|ts|jsx|js)$/.test(e.textEditor.document.fileName)) return;
        const rel = this._toWorkspaceRelative(e.textEditor.document.fileName);
        if (!rel) return;
        const sel = e.selections[0];
        if (!sel) return;
        const key = sel.isEmpty
          ? `line:${sel.active.line + 1}`
          : `sel:${sel.start.line + 1}-${sel.end.line + 1}`;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this._actionCards.notifyCursorMoved(key, rel), 250);
      }),
      new vscode.Disposable(() => { if (timer) clearTimeout(timer); }),
    );
  }

  /**
   * 확정된 레시피 계획을 결정론 적용한다 — 카드에 보이던 골격 그대로(모델 0회).
   * 결과 텍스트는 바인딩과 같은 확인 카드·파일 쓰기 경로로 흘려보낸다.
   */
  private async _applyCardRecipe(
    card: IActionCard, values: Record<string, string>, query: string, opts?: { preferCursor?: boolean },
  ): Promise<string | null> {
    // 계획과 적용이 **같은 원문**을 보게 한 번만 읽는다(두 번 읽으면 그 사이 편집으로 갈린다).
    const file = this._readCardFile(values[TARGET_FILE_CHOICE_KEY]);
    if (!file) return '대상 파일을 읽지 못했습니다. 카드에서 대상 파일을 다시 골라주세요.';
    const plan = this._buildCardRecipePlan(card, values, query, opts, file);
    if (!plan) return '이 카드는 골격 삽입을 지원하지 않습니다.';

    const result = buildRecipeApply({ source: file.content, plan, skeleton: card.skeleton ?? '', values });
    if (result.blocked || !result.text) return result.blocked ?? '적용할 내용을 만들지 못했습니다.';

    const notice =
      `> ${card.icon} **${card.title}** — 카드의 골격을 **결정론으로 삽입**했습니다(LLM 미사용).\n` +
      result.summary.map((s) => `>\n> · ${s}`).join('');

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🧩 카드 레시피 적용 (${file.path}): card=${card.id} ${result.summary.join(' / ')}`,
    );

    await this._applyCardFileEdit(file.path, file.content, result.text, notice);
    return null;
  }

  /**
   * 확정된 매핑 테이블을 결정론 적용한다(모델 0회) — 조립은 온라인 조립 바인딩과 같은 순수 함수를 쓰고,
   * 결과 텍스트는 기존 확인 카드·파일 쓰기 경로(_handleAxiomAction)에 그대로 흘려보낸다.
   */
  private async _applyCardBinding(
    bindingId: string, values: Record<string, string>, choices: Record<string, string>,
  ): Promise<string | null> {
    // 원문은 한 번만 읽고 계획·적용이 같은 텍스트를 쓰게 한다(두 번 읽으면 그 사이 편집으로 갈릴 수 있다).
    // 대상은 **카드가 들고 있던 파일** — 실행 순간의 활성 편집기가 아니다.
    const file = this._readCardFile(values[TARGET_FILE_CHOICE_KEY]);
    if (!file) return '대상 파일을 읽지 못했습니다. 카드에서 대상 파일을 다시 골라주세요.';
    const plan = this._buildCardBindingPlan(bindingId, values, file);
    if (!plan) return `지원하지 않는 바인딩입니다: ${bindingId}`;

    const result = buildBindingApply({ source: file.content, plan, choices });
    if (result.blocked || !result.text) return result.blocked ?? '적용할 내용을 만들지 못했습니다.';

    const notice = [
      `> 🔌 **API 바인딩 적용** — \`${plan.endpoint}\` 스펙으로 \`${result.typeName}\` 타입 생성 + ` +
        `\`useApi\` 연결 + 테이블 셀 재바인딩을 **결정론으로 조립**했습니다(LLM 미사용).`,
      result.renames.some((r) => r.from !== r.to)
        ? `>\n> 🔁 필드 교체: ${result.renames.filter((r) => r.from !== r.to).map((r) => `\`${r.from}\` → \`${r.to}\``).join(', ')}`
        : '',
      result.removedLabels.length > 0
        ? `>\n> 🧹 \`${plan.endpoint}\`에 없는 컬럼 제거: ${result.removedLabels.join(', ')}`
        : '',
    ].filter(Boolean).join('\n');

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔌 카드 바인딩 적용 (${file.path}): endpoint=${plan.endpoint} type=${result.typeName} ` +
        `매핑=${result.renames.map((r) => `${r.from}→${r.to}`).join(', ') || '(정확일치만)'} ` +
        `제거=${result.removedLabels.join(', ') || '없음'}`,
    );

    await this._applyCardFileEdit(file.path, file.content, result.text, notice);
    return null;
  }

  /**
   * 카드가 만든 최종 파일 텍스트를 기존 확인·적용 경로로 흘려보낸다(오프라인 턴 프레이밍 포함).
   * diff는 호출부가 디스크 원문으로 계산해 넘긴다 — 에디터 버퍼와의 정규화 차이로 확인 카드에서
   * diff가 통째로 사라지는 것을 막기 위한 기존 규약(precomputedDiff)을 그대로 따른다.
   */
  private async _applyCardFileEdit(
    filePath: string, originalContent: string, finalText: string, notice: string,
  ): Promise<void> {
    this._postOfflineTurn();
    this._postStatus('오프라인 모드 — 결정론 적용 중…');
    this._post({ type: 'token', content: notice });
    this._history.push({ role: 'assistant', content: notice });

    const diff = computeDiffHunks(originalContent, finalText);
    const wrapped = this._wrapCodeBlockAsAxiomAction('```tsx\n' + finalText + '\n```', filePath);
    if (!wrapped) {
      this._post({ type: 'token', content: '\n\n> ⚠️ 적용 블록을 만들지 못했습니다.' });
    } else {
      await this._handleAxiomAction(wrapped, false, false, undefined, diff);
    }
    this._post({ type: 'done' });
    this._postStatus('⚠️ 오프라인 모드');
  }

  /**
   * LLM 서버가 살아 있는지 단기 캐시(10초)와 함께 확인한다.
   * 연속 채팅 턴마다 매번 5초 헬스 프로브를 돌리지 않도록 결과를 잠깐 재사용한다.
   */
  private async _isLlmOnline(config: LlmConfig): Promise<boolean> {
    const now = Date.now();
    if (this._healthCache && now - this._healthCache.at < 10_000) {
      return this._healthCache.online;
    }
    // 헬스체크는 어떤 이유로도 throw해선 안 된다 — 여기서 예외가 새면 호출부(_handleMessage)가
    // done/error를 못 보내 채팅이 "생각 중…"에서 영구히 멈춘다. 실패는 전부 "오프라인"으로 접는다.
    let online = false;
    try {
      online = await this._llm.checkHealth(config);
    } catch (err) {
      console.warn(`[Axiom AI] 헬스체크 예외 → 오프라인으로 간주: ${(err as Error).message}`);
      online = false;
    }
    this._healthCache = { at: now, online };
    return online;
  }

  /** 명령 팔레트 맨땅 진입 — 페이지 생성 위저드(순차 QuickPick, 카드 경유와 동일 실행기). */
  runCreatePageWizard(): Promise<void> {
    return this._actionCards.runPageWizard();
  }

  // ── 입력창 위 실시간 추천 (형태 B, §3.5) ────────────────────────────────────

  /**
   * 타이핑 중 추천 목록을 만들어 보낸다.
   *
   * ★**타이핑이 네트워크를 기다리게 하지 않는다**: 카드는 오프라인 전용이라(§10.1) 온라인이면
   * 목록을 내지 않아야 하는데, 헬스체크를 키 입력마다 부르면 입력이 끊긴다. 그래서 **캐시된
   * 상태만** 읽고, 캐시가 없거나 낡았으면 이번엔 빈 목록으로 답한 뒤 비동기로 캐시를 채운다
   * (다음 타이핑에서 자연히 정확해진다 — 목록이 한 박자 늦게 뜰 뿐 잘못 뜨지는 않는다).
   */
  private _suggestCards(query: string): void {
    const cached = this._healthCache;
    const fresh = !!cached && Date.now() - cached.at < 10_000;
    if (!fresh) {
      // fire-and-forget — 결과는 캐시에만 남기고 이번 응답은 기다리지 않는다.
      void this._isLlmOnline(ExtensionConfig.getEffectiveLlmConfig()).catch(() => undefined);
    }
    const offline = fresh && !cached!.online;
    // ⚠ 전제조건(file-open) 판정에 `_currentCodeFilePath()`를 쓰면 안 된다 — 그건 경로를 얻으려고
    //   **파일 본문을 통째로 읽는다**. 타이핑마다 큰 파일을 읽으면 입력이 끊긴다. 열린 탭 목록만 본다.
    const items = offline ? this._actionCards.suggest(query, this._listOpenCodeFiles().length > 0) : [];
    this._post({ type: 'cardSuggestions', payload: { query, items } });
  }

  /**
   * 목록에서 고른 카드로 **직행**한다(위저드 직행, §3.5). 사용자 말풍선은 웹뷰가 이미 붙였으므로
   * 여기서는 카드 렌더 + 히스토리·상태줄만 맡는다 — 형태 A(_handleMessage 경유)와 같은 규약.
   * 고른 카드가 사라졌으면(핫리로드·토글) 평소 흐름으로 돌린다: 빗나감은 절벽이 아니라 계단.
   */
  private async _pickCardSuggestion(cardId: string, query: string): Promise<void> {
    const fileOpen = !!this._currentCodeFilePath();
    if (!this._actionCards.recommendCard(cardId, query, fileOpen)) {
      await this._handleMessage(query);
      return;
    }
    this._postOfflineTurn();
    this._history.push({ role: 'user', content: query });
    this._history.push({ role: 'assistant', content: this._actionCards.historySummary() });
    this._lastUserQuery = query;
    this._post({ type: 'done' });
    this._postStatus('⚠️ 오프라인 모드');
  }

  /**
   * 계획 카드의 "만들어질 것" 미리보기를 **실행이 실제로 만들 액션 목록에서 그대로 파생**한다.
   *
   * 페이지 생성의 출력은 워크스페이스 상태에 갈린다 — 기존 도메인이면 2개(페이지 + 라우터 경로 추가),
   * **새 도메인이면 3개**(페이지 + 도메인 라우터 신규 + `src/shared/router/index.tsx` 루트 등록).
   * 카드 파일의 정적 outputs는 그 분기를 표현할 수 없어 실제보다 적게 말했다(실측: 루트 라우터
   * 누락 + 신규 생성을 '수정'으로 표기). 미리보기가 실제와 갈라지면 "미리보기 = 사람 눈 검증
   * 게이트"라는 계획 카드의 안전 속성이 무너지므로, 실행기와 **같은 함수**(_buildOfflinePageActions)
   * 에서 파생해 구조적으로 갈라질 수 없게 한다.
   *
   * 도메인이 아직 미정이면 null → 카드의 정적 선언(플레이스홀더 경로)으로 양보한다.
   */
  private _previewTemplateOutputs(
    templateId: string,
    values: Record<string, string>,
  ): ActionCardOutputView[] | null {
    if (templateId !== 'page') return null;
    const domain = values.domain?.trim();
    if (!domain) return null;

    const wsRoot = this._getWorkspaceRoot();
    const domainExists = wsRoot ? fs.existsSync(path.join(wsRoot, 'src', 'domains', domain)) : false;
    // 이름 미정이어도 경로 형태는 보여준다 — 실행 시 적용될 정규화를 여기서도 똑같이 적용해
    // 카드에 적힌 경로와 실제 생성 경로가 어긋나지 않게 한다.
    const pageName = values.pageName?.trim()
      ? (this._pageCreationDetector.normalizeName(values.pageName) ?? values.pageName.trim())
      : '{{pageName}}';

    const actions = this._buildOfflinePageActions(
      pageName, domain, this._toRoutePath(pageName), domainExists, wsRoot,
    );
    return actions
      .filter((a) => !!a.filePath)
      .map((a) => {
        const filePath = a.filePath!;
        const note = filePath.includes('shared/router')
          ? '루트 라우터에 도메인 등록'
          : a.templateType === 'router'
            ? (a.action === 'createFile' ? '도메인 라우터 신규' : '경로 추가')
            : undefined;
        return {
          kind: (a.action === 'createFile' ? 'create' : 'modify') as ActionCardOutputView['kind'],
          path: filePath,
          ...(note ? { note } : {}),
        };
      });
  }

  /** 의도 라벨(한국어) — 되묻기 선택지 표기용. */
  private static readonly _INTENT_LABEL: Record<IntentKind, string> = {
    create_page: '새 페이지/화면 생성',
    modify_file: '현재/기존 파일 수정',
    qna: '질문(조회·설명)',
    smalltalk: '인사·잡담',
    other: '기타',
  };

  /**
   * 오프라인 응답을 생성·스트리밍한다. 의미 분류(임베딩)+신뢰도 게이팅으로 의도를 정하고,
   * 애매하면 단정 대신 번호 선택지로 되묻는다. 확정 시 로컬 RAG(knowledge/*.md)로
   * react-app-scaffold 상세 지식을 끌어와 입력과 연관된 실질적 도움을 준다.
   * LLM 경로(타겟 확정 QuickPick·영역편집·streamChat·axiom-action 재시도)를 타지 않는다.
   */
  private async _respondOffline(text: string, editorCtx: EditorContext, notice?: string | null): Promise<void> {
    this._postOfflineTurn();
    this._postStatus('⚠️ 오프라인 모드 — 의도 분석 중…');
    // 서버가 요청을 거부해 폴백된 경우(모델명 오타 등), 사용자가 설정을 고칠 수 있도록 사유를 노출한다.
    if (notice?.trim()) {
      this._post({
        type: 'token',
        content: `> ⚠️ 서버가 요청을 처리하지 못해 오프라인 응답으로 전환합니다 — ${notice.trim()}\n> 설정의 모델명·엔드포인트를 확인해주세요.\n\n`,
      });
    }

    // JSON → 타입 생성 요청은 의도 분류 전에 결정론 술어로 가로챈다(LLM 불필요한 순수 변환).
    // 의도 분류를 거치면 "modify_file" 등 틀린 의도 라인이 먼저 노출되므로 여기서 단락한다.
    const jsonTypeReq = detectJsonTypeRequest({
      query: text,
      selectionText: editorCtx.selection?.text ?? editorCtx.selectedText ?? null,
      fileContent: editorCtx.content ?? null,
      filePath: editorCtx.filePath ?? null,
    });
    if (jsonTypeReq) {
      await this._streamJsonType(jsonTypeReq);
      return;
    }

    const cfg = ExtensionConfig.getOfflineIntentConfig();
    const resolution = await resolveOfflineIntent(
      text,
      { currentFile: editorCtx.filePath ?? null, hasSelection: !!editorCtx.selection, domains: this._scanWorkspaceDomains() },
      { classify: (q) => this._intentClassifier.classify(q) },
      { enabled: cfg.enabled, minConfidence: cfg.minConfidence, minMargin: cfg.minMargin },
    );

    // 모호 → 단정하지 말고 되묻는다(되묻기 라운드트립).
    if (resolution.uncertain && resolution.candidates.length > 1) {
      this._offlineClarify = { query: text, editorCtx, candidates: resolution.candidates };
      const lines = resolution.candidates
        .map((c, i) => `${i + 1}. ${ChatViewProvider._INTENT_LABEL[c]}`)
        .join('\n');
      // 잡담↔실행형 모순(약한 임베딩이 짧은 기술 질문을 잡담으로 오인한 정황)은 전용 안내로,
      // 그 외 일반 모호는 기존 문구로 되묻는다.
      const prompt =
        resolution.clarifyKind === 'smalltalk-vs-actionable'
          ? `> ⚠️ **오프라인 모드** — 방금 입력이 가벼운 인사·잡담인지, scaffold 사용법을 묻는 **질문**인지 ` +
            `분명하지 않습니다.\n\n` +
            `아래에서 **번호**로 골라주세요(질문이라면 조금 더 구체적으로 다시 입력해도 됩니다):\n\n${lines}\n`
          : `> ⚠️ **오프라인 모드** — 요청 의도가 명확하지 않습니다.\n\n` +
            `아래 중 무엇인가요? **번호**로 답해주세요(또는 다시 더 구체적으로 입력):\n\n${lines}\n`;
      this._post({ type: 'token', content: prompt });
      this._post({ type: 'done' });
      this._postStatus('⚠️ 오프라인 모드');
      return;
    }

    await this._streamOfflineFor(text, editorCtx, resolution.result);
  }

  /** 확정된 의도로 오프라인 응답을 생성·스트리밍한다. 의도 라인은 한 번만(잡담 제외) 출력한다. */
  private async _streamOfflineFor(
    text: string, editorCtx: EditorContext, intent: IntentResult,
  ): Promise<void> {
    this._postStatus('⚠️ 오프라인 모드 — 로컬 지식 검색 중…');
    if (intent.intent !== 'smalltalk') {
      this._post({ type: 'token', content: `\n> ${formatIntentForChat(intent)}\n` });
    }

    // 행동성 요청(생성·수정)은 직접 실행/안내 대신 **추천 카드**를 먼저 시도한다 — 자연어의
    // 역할을 "실행"에서 "추천"으로(offline-action-cards-plan §2-1). 실행은 카드 버튼 →
    // QuickPick(결정론)이 이어받고, 매칭이 없으면 기존 지식 응답으로 폴백(카드는 관문이 아니다).
    if (intent.intent === 'create_page' || intent.intent === 'modify_file') {
      // create_page는 "새로 만들겠다"는 확정 신호라, 카드가 안 잡혀도 카탈로그를 보여주는 편이
      // 지식 문서보다 낫다. modify_file은 계약 카드+RAG 응답이 실제로 유용하므로 폴백 유지.
      const fallbackToCatalog = intent.intent === 'create_page';
      if (this._actionCards.recommend(text, !!editorCtx.filePath, fallbackToCatalog)) {
        this._history.push({ role: 'assistant', content: this._actionCards.historySummary() });
        this._post({ type: 'done' });
        this._postStatus('⚠️ 오프라인 모드');
        return;
      }
      // 꺼진 카드 때문에 안 뜬 것이라면 그 사실을 밝힌다 — 토글이 채팅 결과를 조용히 바꾸면
      // 사용자는 "고장났다"고 읽는다(실측). 끄기는 정상 동작이므로 되돌리지 않고 이유만 말한다.
      const offTitles = this._actionCards.disabledMatchTitles(text, !!editorCtx.filePath);
      if (offTitles.length > 0) {
        this._post({
          type: 'token',
          content:
            `\n> 🃏 이 요청에 맞는 카드가 있지만 **꺼져 있어** 뜨지 않았습니다: ${offTitles.join(', ')}\n` +
            `> 런처의 **🃏 오프라인 행동 카드** 패널에서 켜면 다시 뜹니다.\n`,
        });
      }
    }

    let markdown: string;
    try {
      markdown = await this._offline.respond(
        { query: text, currentFile: editorCtx.filePath ?? null, currentFileContent: editorCtx.content ?? '' },
        intent,
      );
    } catch (err) {
      console.warn(`[Axiom AI] 오프라인 응답 생성 실패: ${(err as Error).message}`);
      markdown =
        '> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없습니다.\n\n서버 엔드포인트 설정을 확인하거나 잠시 후 다시 시도해주세요.';
    }
    this._post({ type: 'token', content: markdown });
    this._history.push({ role: 'assistant', content: markdown });
    this._post({ type: 'done' });
    this._postStatus('⚠️ 오프라인 모드');
  }

  /**
   * JSON → 타입 생성(오프라인 결정론)을 채팅에 스트리밍한다. scaffold 타입 규칙(T/I 접두사 등)을
   * 적용한 TypeScript 코드블록을 보여준다. LLM·디스크 편집 경로를 타지 않는다.
   */
  private async _streamJsonType(req: IJsonTypeRequest): Promise<void> {
    this._postStatus('⚠️ 오프라인 모드 — JSON으로 타입 생성 중…');
    const sourceLabel = req.source === 'chat' ? '채팅 입력' : req.source === 'selection' ? '선택 영역' : '현재 파일';
    this._post({ type: 'token', content: `\n> 🧭 의도 분석: **JSON → 타입 생성** · 소스: ${sourceLabel}\n` });
    let markdown: string;
    try {
      markdown = renderJsonTypeCard(req);
    } catch (err) {
      console.warn(`[Axiom AI] JSON 타입 생성 실패: ${(err as Error).message}`);
      markdown =
        '> ⚠️ 오프라인 모드 — JSON 파싱 또는 타입 생성에 실패했습니다.\n\nJSON 형식이 올바른지 확인해주세요.';
    }
    this._post({ type: 'token', content: markdown });
    this._history.push({ role: 'assistant', content: markdown });
    this._post({ type: 'done' });
    this._postStatus('⚠️ 오프라인 모드');
  }

  /**
   * 오프라인 의도 되묻기에 대한 사용자 응답(번호 또는 취소)을 처리한다.
   * 유효한 번호면 해당 의도로 확정해 응답하고, 아니면 안내 후 상태 유지.
   */
  private async _handleOfflineClarifyInput(input: string): Promise<void> {
    const state = this._offlineClarify;
    if (!state) return;
    const trimmed = input.trim();
    if (trimmed === '/cancel') {
      this._offlineClarify = null;
      this._post({ type: 'token', content: '되묻기를 취소했습니다.' });
      this._post({ type: 'done' });
      this._postStatus('⚠️ 오프라인 모드');
      return;
    }
    const n = parseInt(trimmed.match(/\d+/)?.[0] ?? '', 10);
    if (!Number.isInteger(n) || n < 1 || n > state.candidates.length) {
      // 번호가 아니면 새 요청으로 간주 — 되묻기 해제하고 일반 오프라인 흐름으로.
      this._offlineClarify = null;
      this._history.push({ role: 'user', content: input });
      const clarifyCtx = this._editorCollector.collect();
      this._logFileDetection(clarifyCtx);
      await this._respondOffline(input, clarifyCtx);
      return;
    }
    const chosen = state.candidates[n - 1];
    this._offlineClarify = null;
    const intent = fillSlots(
      state.query,
      { currentFile: state.editorCtx.filePath ?? null, hasSelection: !!state.editorCtx.selection, domains: this._scanWorkspaceDomains() },
      chosen,
    );
    await this._streamOfflineFor(state.query, state.editorCtx, intent);
  }

  /** 사용자 정의 의도 예시 폴더 변경 시 hot-reload. */
  private _reloadIntentExamples(): void {
    const bundledIntents = vscode.Uri.joinPath(this._extensionUri, 'intents').fsPath;
    const userIntents = ExtensionConfig.getOfflineIntentConfig().userExamplesFolder || null;
    this._intentExamples.reload(fs.existsSync(bundledIntents) ? bundledIntents : null, userIntents);
  }

  /**
   * 디버그 플래그(axiom-ai.debug.logSystemPrompt)가 켜져 있으면, AI 서버로 전송하는
   * 시스템 프롬프트(규칙·가이드 + RAG + 현재 파일) 전문을 'axiom-ai: Prompt' 채널에 기록한다.
   * 채널은 처음 필요할 때만 생성한다.
   */
  private _logSystemPrompt(
    query: string,
    systemPrompt: string,
    breakdown?: { rulesChars: number; fileChars: number; ragChars: number; domainChars: number },
  ): void {
    if (!ExtensionConfig.isLogSystemPromptEnabled()) return;
    if (!this._promptOutputChannel) {
      this._promptOutputChannel = vscode.window.createOutputChannel('axiom-ai: Prompt');
    }
    const ch = this._promptOutputChannel;
    const ts = new Date().toLocaleTimeString();
    ch.appendLine('═'.repeat(80));
    ch.appendLine(`[${ts}] 질문: ${query}`);
    if (breakdown) {
      ch.appendLine(
        `구성(자): 규칙·가이드 ${breakdown.rulesChars} / 현재파일 ${breakdown.fileChars} / RAG ${breakdown.ragChars} / 도메인 ${breakdown.domainChars} · 전체 ${systemPrompt.length}`,
      );
    } else {
      ch.appendLine(`전체 ${systemPrompt.length}자`);
    }
    ch.appendLine('─'.repeat(80));
    ch.appendLine(systemPrompt);
    ch.appendLine('');
    ch.show(true);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'ready':
          this._postStatus(ExtensionConfig.getLlmConfig().model);
          break;
        case 'sendMessage':
          await this._handleMessage(msg.text, msg.selection);
          break;
        case 'stopMessage':
          this._abortController?.abort();
          for (const [, entry] of this._pendingConfirmations) entry.resolve(false);
          this._pendingConfirmations.clear();
          this._pendingPatchRecovery.clear();
          break;
        case 'fileConfirmApprove': {
          const entry = this._pendingConfirmations.get(msg.actionId);
          if (entry) { this._pendingConfirmations.delete(msg.actionId); entry.resolve(true); }
          break;
        }
        case 'fileConfirmReject': {
          const entry = this._pendingConfirmations.get(msg.actionId);
          if (entry) { this._pendingConfirmations.delete(msg.actionId); entry.resolve(false); }
          break;
        }
        case 'patchRetryFull':
          await this._handlePatchRetryFull(msg.recoveryId);
          break;
        case 'patchRetryCancel':
          this._pendingPatchRecovery.delete(msg.recoveryId);
          this._corpusOutputChannel.appendLine(`[Axiom AI] patch 복구 취소됨 [${msg.recoveryId}]`);
          break;
        case 'clearHistory':
          this._history = [];
          break;
        case 'pickReferenceFile':
          await this._pickReferenceFile();
          break;
        case 'actionCardChip':
          await this._actionCards.handleChip(msg.requestId, msg.cardId, msg.slotName);
          break;
        case 'actionCardSlotSet':
          this._actionCards.setSlotValue(msg.requestId, msg.cardId, msg.slotName, msg.value);
          break;
        case 'actionCardBindingChoice':
          this._actionCards.setBindingChoice(msg.requestId, msg.cardId, msg.field, msg.value);
          break;
        case 'actionCardExecute':
          await this._actionCards.handleExecute(msg.requestId, msg.cardId);
          break;
        case 'cardSuggestRequest':
          this._suggestCards(msg.query);
          break;
        case 'cardSuggestPick':
          await this._pickCardSuggestion(msg.cardId, msg.query);
          break;
      }
    });

    // 에디터 선택 영역 변경 시 웹뷰에 알림
    let selectionDebounce: ReturnType<typeof setTimeout> | null = null;
    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((e) => {
      if (selectionDebounce) clearTimeout(selectionDebounce);
      selectionDebounce = setTimeout(() => {
        if (!this._view) return;
        const sel = e.selections[0];
        if (!sel || sel.isEmpty) {
          this._post({ type: 'selectionContext', filePath: '', startLine: 0, endLine: 0, selectedText: '' });
          return;
        }
        const doc = e.textEditor.document;
        // 파일(file scheme)만 선택 컨텍스트로 인정 — Output 패널·output/diff 등 가짜 에디터의
        // 텍스트 선택이 chip을 덮어써(예: "Corpus:4-51") 엉뚱한 선택으로 잡히는 것을 막는다.
        if (doc.uri.scheme !== 'file') return;
        const selectedText = doc.getText(sel).trim();
        if (!selectedText) return;
        this._post({
          type: 'selectionContext',
          filePath: vscode.workspace.asRelativePath(doc.uri),
          startLine: sel.start.line + 1,
          endLine: sel.end.line + 1,
          selectedText,
        });
      }, 150);
    });
    webviewView.onDidDispose(() => selectionDisposable.dispose());
  }

  /**
   * 사용자 메시지에 명시된 워크스페이스 파일 경로(예: `/plan/api-spec.md`, `src/.../foo.ts`,
   * `@api-spec.md`)를 감지해 해당 파일을 읽어, 프롬프트에 주입할 ground truth 블록으로 만든다.
   *
   * 모델은 파일을 열 수 없으므로 "참조 파일은 X" 라고만 적으면 그 내용을 모른다(→ 응답 스키마를
   * 추측해 엉뚱한 key로 타입을 선언). 확장이 직접 읽어 넣어야 추측 없이 정확히 반영된다.
   *
   * 후보 조건: 슬래시를 포함하거나 `@`로 시작하고, 알려진 확장자로 끝나는 토큰만(`/api/reports/x`
   * 같은 API 경로·`member.id` 같은 멤버접근은 확장자가 없어 제외). 못 찾으면 조용히 건너뛴다.
   */
  private async _loadReferencedFiles(
    text: string,
    currentFilePath?: string,
  ): Promise<{ block: string; loaded: string[]; unmatchedApiPaths: string[]; contents: string[] }> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return { block: '', loaded: [], unmatchedApiPaths: [], contents: [] };
    const root = folders[0].uri;

    const EXT = 'md|markdown|json|ya?ml|txt|ts|tsx|js|jsx|css|html?';
    const candidates = new Set<string>();
    // (a) 슬래시 포함 경로: /plan/api-spec.md, src/foo/bar.ts, ./x/y.json
    for (const m of text.matchAll(new RegExp(`@?\\/?(?:[\\w.\\-]+\\/)+[\\w.\\-]+\\.(?:${EXT})\\b`, 'gi'))) {
      candidates.add(m[0]);
    }
    // (b) @파일.확장자 (슬래시 없이도 허용): @api-spec.md
    for (const m of text.matchAll(new RegExp(`@[\\w.\\-]+\\.(?:${EXT})\\b`, 'gi'))) {
      candidates.add(m[0]);
    }
    // (c) 워크스페이스 루트 파일 — 명시적 `/` 또는 `./` 접두(디렉터리 세그먼트 없음): /api-spec.md, ./spec.md
    //     (a)는 디렉터리(`dir/`)를 요구해 루트 파일을 놓친다. 사용자가 "참조 파일은 /api-spec.md"라고
    //     명시해도 주입이 안 돼 모델이 응답 타입을 추측·미선언 → 의존성 게이트가 거부하던 dead-end의 뿌리.
    //     캐주얼 멘션(슬래시 없는 `config.js`)은 잡지 않아 보수적이다.
    for (const m of text.matchAll(new RegExp(`(?:^|[\\s'"(\`])(\\.?\\/[\\w.\\-]+\\.(?:${EXT}))\\b`, 'gi'))) {
      candidates.add(m[1]);
    }
    if (candidates.size === 0) return { block: '', loaded: [], unmatchedApiPaths: [], contents: [] };

    const PER_FILE_CAP = 8000;
    const TOTAL_CAP = 16000;
    const MAX_FILES = 5;
    const currentRel = currentFilePath
      ? currentFilePath.replace(/\\/g, '/').replace(/^\/+/, '')
      : '';
    const loaded: string[] = [];
    const blocks: string[] = [];
    let total = 0;

    const queryTokens = tokenizeQuery(text);
    const apiPaths = extractApiPaths(text);
    const matchedPaths = new Set<string>();
    const loadedContents: string[] = [];
    for (const raw of candidates) {
      if (total >= TOTAL_CAP || loaded.length >= MAX_FILES) break;
      const uri = await this._resolveReferencedFileUri(root, raw);
      if (!uri) continue;
      const rel = vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');
      if (rel === currentRel || loaded.includes(rel)) continue; // 현재 파일·중복 제외
      let content: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        content = Buffer.from(bytes).toString('utf-8');
      } catch {
        continue;
      }

      const budget = Math.min(PER_FILE_CAP, TOTAL_CAP - total);
      let injected: string;
      if (content.length <= budget) {
        injected = content;
      } else if (/\.(md|markdown)$/i.test(rel)) {
        // 큰 마크다운(예: 여러 API가 담긴 스펙)은 앞부분만 자르면 정작 필요한 섹션(파일 끝의
        // member-summary 등)이 잘려나간다. 질문 키워드로 관련 섹션을 추출해 주입한다.
        const sections = splitIntoSections(rel, content);
        scoreSections(sections, queryTokens, apiPaths);
        const matchedHere = matchedApiPaths(sections, apiPaths);
        for (const p of matchedHere) matchedPaths.add(p);

        // 정확 엔드포인트 focusing — 사용자가 특정 경로(예: `/api/employees`)를 지목했고 그 섹션이
        // 스펙에 실재하면, **그 섹션(들) + 도입부(타입/frontmatter)만** 주입하고 형제 엔드포인트 전체를
        // 버린다. 종전엔 selectByBudget이 예산까지 채워 18개(≈스펙 전체 21K자)를 주입 → 입력 토큰 폭증 +
        // 약한 모델이 형제 URL로 드리프트하던 원인. 좁혔으니 관련도 하한은 0(이미 focus됨).
        let picked: MdSection[];
        let focusNote = '';
        if (matchedHere.length > 0) {
          const exact = sections.filter((s) =>
            matchedHere.some((p) => containsExactApiPath(s.header, p)),
          );
          const intro = sections.filter((s) => s.header === '' && s.length < 1500);
          picked = selectByBudget([...intro, ...exact], budget, 0);
          const dropped = sections.length - picked.length;
          focusNote = ` (정확 엔드포인트 ${matchedHere.join(', ')} focusing — 형제 ${dropped}개 섹션 제외)`;
        } else {
          picked = selectByBudget(sections, budget, 1);
        }

        if (picked.length > 0) {
          injected = `(질문 관련 섹션 추출)\n\n${picked.map((s) => s.body).join('\n\n')}`;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] 참조 ${rel}: ${content.length}자(>${budget}) → 관련 섹션 ${picked.length}개 추출${focusNote}: ` +
            picked.map((s) => s.header.replace(/^#+\s*/, '').slice(0, 40)).join(' | '),
          );
        } else {
          injected = content.slice(0, budget) + `\n\n... (이하 생략 — 관련 섹션 미검출로 앞부분만 포함)`;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] 참조 ${rel}: 관련 섹션 미검출 → 앞부분 ${budget}자만 포함`,
          );
        }
      } else if (/\.(tsx?|jsx?)$/i.test(rel)) {
        // 큰 코드 파일(.ts/.tsx/.js/.jsx)을 앞부분만 자르면 파일 끝의 원하는 선언(타입·함수)이
        // 통째로 잘려나가 모델이 근거를 못 본다. 현재 파일에 쓰는 것과 **동일한 결정론 슬라이스**
        // (선언 분할→쿼리 점수→예산 선택, 나머지는 stub)로 관련 조각만 남긴다 — 마크다운 섹션 추출과 대칭.
        const slice = extractRelevantTsSlice(content, queryTokens, budget);
        // 참조(읽기 전용) 파일은 stub이 불필요·예산 밖 누적 위험 → 접어서 주입 크기를 예산 이하로 되돌린다.
        const lean = stripSliceStubs(slice.text);
        injected = `(질문 관련 코드 섹션 추출)\n\n${lean.text}`;
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 참조 ${rel}: ${content.length}자(>${budget}) → 관련 코드 섹션 ${slice.includedCount}개 포함(${injected.length}자), 관련 낮은 ${lean.strippedCount}개 생략`,
        );
      } else {
        injected = content.slice(0, budget) + `\n\n... (이하 ${content.length - budget}자 생략)`;
      }

      blocks.push(`## 참조: ${rel}\n\n${injected}`);
      loaded.push(rel);
      loadedContents.push(content);
      total += injected.length;
    }

    if (blocks.length === 0) return { block: '', loaded: [], unmatchedApiPaths: [], contents: [] };
    // 따옴표로 지정했으나 주입된 스펙 어디에도 없는 경로 — 사용자에게 정보성 경고 한 번
    const unmatched = unmatchedApiPaths(loadedContents, apiPaths);
    const directive = formatExactPathDirective([...matchedPaths]);
    if (matchedPaths.size > 0) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 정확 엔드포인트 지정 감지 → 우선 주입·드리프트 차단: ${[...matchedPaths].join(', ')}`,
      );
    }
    const block =
      `\n\n<!-- 참조 파일 (사용자가 메시지에서 명시) -->\n` +
      directive +
      `> ⚠️ 아래는 사용자가 참조하라고 지정한 파일의 실제 내용입니다. ` +
      `타입·필드명·스키마·API 응답 구조는 추측하지 말고 **반드시 아래 내용을 그대로 근거로** 작성하세요.\n` +
      `> ❗ **API 응답 타입의 필드명은 반드시 이 스펙의 response 스키마에서 가져오세요.** ` +
      `현재 파일에 있는 더미/샘플 데이터(하드코딩 배열·mock 객체)의 필드명이 스펙과 다르면 ` +
      `**스펙을 따르고, 더미 데이터의 필드명은 타입에 쓰지 마세요.** ` +
      `(예: 더미가 \`name\`이어도 스펙 response가 \`employee_name\`이면 타입은 \`employee_name\`)\n\n` +
      blocks.join('\n\n---\n\n');
    return { block, loaded, unmatchedApiPaths: unmatched, contents: loadedContents };
  }

  /**
   * 사용자가 따옴표/리터럴로 지정한 API 경로가 주입된 참조 스펙 어디에도 없을 때,
   * 정보성 경고를 chat에 한 번 띄운다(검증 없이 진행함을 알림). 경로가 없으면 아무것도 안 한다.
   */
  private _warnUnmatchedApiPaths(paths: string[]): void {
    if (!paths || paths.length === 0) return;
    const list = paths.map((p) => `\`${p}\``).join(', ');
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 경고: 지정 엔드포인트가 참조 스펙에 없음 → 검증 없이 진행: ${paths.join(', ')}`,
    );
    this._post({
      type: 'token',
      content:
        `\n> ⚠️ 지정하신 엔드포인트 ${list}(을)를 참조 스펙에서 찾지 못했습니다. ` +
        `URL·응답 구조를 검증 없이 진행하니, 경로 철자나 참조 파일이 맞는지 확인해 주세요.\n`,
    });
  }

  /**
   * 파일 첨부 — 파일 피커로 고른 참조 파일(API 스펙 등)의 워크스페이스 상대 경로를 `@경로` 토큰으로
   * 웹뷰 입력창에 삽입한다. 그 토큰은 전송 시 _loadReferencedFiles가 감지해 실제 내용을 ground truth로
   * 주입하므로(타입·스키마는 추측 금지), 사용자가 경로를 손으로 타이핑할 필요가 없어진다.
   */
  private async _pickReferenceFile(): Promise<void> {
    const picks = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: '참조로 첨부',
      title: 'API 스펙·참조 파일 첨부 — 타입·스키마 근거로 사용',
      filters: { '참조 파일': ['md', 'markdown', 'json', 'yaml', 'yml', 'ts', 'tsx', 'js', 'jsx', 'txt'] },
    });
    if (!picks || picks.length === 0) return;
    const tokens = picks
      .map((uri) => `@${vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')}`);
    this._view?.webview.postMessage({ type: 'referenceAttached', text: tokens.join(' ') });
  }

  /** 언급된 경로 문자열을 워크스페이스 파일 Uri로 해석한다. 직접결합→전체glob→basename glob 순. */
  private async _resolveReferencedFileUri(root: vscode.Uri, raw: string): Promise<vscode.Uri | null> {
    const rel = raw.replace(/^@/, '').replace(/^\.\//, '').replace(/^\/+/, '').trim();
    if (!rel) return null;
    // 1) 워크스페이스 루트 기준 직접 결합
    const direct = vscode.Uri.joinPath(root, rel);
    try {
      await vscode.workspace.fs.stat(direct);
      return direct;
    } catch {
      /* not found — 아래로 */
    }
    // 2) 전체 경로 glob (`**/plan/api-spec.md`)
    try {
      const matches = await vscode.workspace.findFiles(`**/${rel}`, '**/node_modules/**', 1);
      if (matches.length > 0) return matches[0];
    } catch {
      /* ignore */
    }
    // 3) basename glob — 유일하게 매칭될 때만
    const base = rel.split('/').pop();
    if (base && base !== rel) {
      try {
        const m2 = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 2);
        if (m2.length === 1) return m2[0];
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * [내용 이식 전용] 출처(.tsx) 파일을 **디스크 grounded**로 해석한다.
   *
   * 모델(IntentClassifier)이 낸 contentSource 경로는 추측이라 틀릴 수 있다(예: 현재 파일
   * `src/domains/employee/...`에서 employee→publishing만 갈아끼운 `src/domains/publishing/...`
   * 환각 — 실제 publishing은 `src/publishing/<업무>/...`). 그래서 경로 문자열을 그대로 믿지 않고,
   * 사람이 파일 찾듯 **이름으로 디스크를 glob → 폴더 힌트로 확정**한다:
   *   1) 모델 경로를 그대로 시도(정확하거나 basename 유일하면 끝 — 기존 동작 보존)
   *   2) 실패/self-match면 basename으로 전체 glob(개수 제한 없이)
   *   3) **현재 편집 대상은 출처가 될 수 없으므로 후보에서 제외**(동명 self-match 제거)
   *   4) 남은 후보를 **폴더 힌트**(사용자 쿼리 영문 토큰 + 모델 경로 디렉터리 세그먼트)로 랭킹
   *   5) 유일 최고점이면 확정, 동률·힌트 없음이면 **QuickPick으로 되묻기**(조용히 포기 금지)
   */
  private async _resolveContentSourceUri(
    query: string,
    modelPath: string,
    targetRel: string,
  ): Promise<vscode.Uri | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    const root = folders[0].uri;
    const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\/+/, '');
    const target = norm(targetRel);
    const baseLabel = norm(modelPath).split('/').pop() ?? modelPath;

    // 1) 모델 경로를 그대로 시도 — 정확하거나 basename이 유일하면 여기서 끝.
    this._postStatus(`출처 파일 찾는 중 — ${baseLabel}`);
    const literal = await this._resolveReferencedFileUri(root, modelPath);
    if (literal && norm(vscode.workspace.asRelativePath(literal)) !== target) {
      this._postStatus(`출처 확정 — ${norm(vscode.workspace.asRelativePath(literal))}`);
      return literal;
    }

    // 2) 모델 경로가 틀렸거나 self-match → basename으로 디스크 전체 조회.
    const base = norm(modelPath).split('/').pop();
    if (!base) return null;
    this._postStatus(`디스크 검색 중 — ${base}`);
    let found: vscode.Uri[];
    try {
      found = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 50);
    } catch {
      return null;
    }
    // 3) 현재 편집 대상은 출처가 될 수 없다(동명 self-match 제거).
    const pool = found.filter((u) => norm(vscode.workspace.asRelativePath(u)) !== target);
    if (pool.length === 0) return null;
    if (pool.length === 1) {
      this._postStatus(`출처 확정 — ${norm(vscode.workspace.asRelativePath(pool[0]))}`);
      return pool[0];
    }
    this._postStatus(`후보 ${pool.length}개 발견 — 폴더 힌트로 선별 중…`);

    // 4) 폴더 힌트로 랭킹 — 쿼리의 영문 토큰 + 모델 경로의 디렉터리 세그먼트가 후보 경로(파일명 제외)에
    //    많이 들어갈수록 가산. "publishing 폴더의 …" → publishing 들어간 후보가 뽑힌다.
    const stop = new Set(['src', 'pages', 'page', 'components', 'component', 'common', 'index', 'tsx', 'ts', 'jsx', 'js']);
    const baseStem = base.replace(/\.[a-z]+$/i, '').toLowerCase();
    const hints = new Set<string>();
    for (const seg of norm(modelPath).split('/').slice(0, -1)) {
      const s = seg.toLowerCase();
      if (s.length >= 3 && !stop.has(s)) hints.add(s);
    }
    for (const w of query.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
      if (!stop.has(w) && w !== baseStem) hints.add(w);
    }
    const scored = pool
      .map((u) => {
        const dir = norm(vscode.workspace.asRelativePath(u)).split('/').slice(0, -1).join('/').toLowerCase();
        let score = 0;
        for (const h of hints) if (dir.includes(h)) score++;
        return { u, score };
      })
      .sort((a, b) => b.score - a.score);

    // 5) 유일한 최고점이면 확정.
    if (scored[0].score > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
      this._postStatus(`출처 확정 — ${norm(vscode.workspace.asRelativePath(scored[0].u))}`);
      return scored[0].u;
    }

    // 동률·힌트 없음 → 조용히 포기하지 말고 되묻기(실행은 충돌 안전).
    this._postStatus(`후보가 여러 개 — 선택 대기 중…`);
    type Item = vscode.QuickPickItem & { uri: vscode.Uri };
    const items: Item[] = scored.map(({ u }) => {
      const rel = vscode.workspace.asRelativePath(u);
      return { label: rel.split(/[/\\]/).pop() ?? rel, description: rel, uri: u };
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `"${base}" 후보가 여러 개입니다 — 어떤 파일 내용을 적용할까요?`,
      matchOnDescription: true,
      ignoreFocusOut: true,
    });
    return picked?.uri ?? null;
  }

  private _requestFileConfirmation(
    actionId: string,
    filePath: string,
    diff: DiffLine[],
    generatedCode: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this._pendingConfirmations.set(actionId, { resolve });
      this._post({ type: 'fileConfirmRequest', actionId, filePath, diff, generatedCode });
    });
  }

  /**
   * 수정 대상 파일을 확정한다. 신규 생성이 아닌 수정 요청에서, 코드를 생성하기 전에
   * "어떤 파일을 고칠지"를 결정론적 휴리스틱으로 판단한다(추가 LLM 호출 없음).
   * - 줄 선택 있음 또는 쿼리가 현재 파일/컴포넌트명 명시 → 현재 파일로 바로 진행
   * - 쿼리가 다른 컴포넌트/파일을 지칭, 또는 열린 파일 없음 → 네이티브 QuickPick으로 질문
   * - 그 외(모순 단서 없음) → 현재 파일로 진행
   * ⚠ IntentProbePanel._probeTargetResolve가 이 사슬(하위 _resolveCrossFileTarget·
   *   _extractOtherFileRef·_resolveModuleToUri 포함)을 드라이런 미러 — 규칙 변경 시 동기화.
   */
  private async _resolveTargetFile(
    userQuery: string,
    editorCtx: EditorContext,
    modelTargetComponent: string | null = null,
  ): Promise<{ proceed: boolean; editorCtx: EditorContext }> {
    const activePath = editorCtx.available ? editorCtx.filePath : undefined;
    const activeBase = activePath
      ? (activePath.split(/[/\\]/).pop() ?? '').replace(/\.[tj]sx?$/, '')
      : '';

    // cross-file 재타겟: 요청이 **현재 파일이 아닌 다른 컴포넌트**를 고치라는 것이면(예: 선택 칩은
    // EmployeeListPage에 박혀 있는데 "StatusBadge 컴포넌트를 수정해줘"), 그 컴포넌트의 실제 파일을
    // import 경로로 디스크 해석해 편집 대상으로 전환한다. 대상 추출은 **모델(IntentClassifier.targetComponent)이
    // 1순위**, 모델이 없을 때만 정규식 폴백(두더지잡기 회피). 해석은 결정론(파일시스템=진실). 선택 칩보다
    // 우선한다(사용자가 명시적으로 다른 파일을 지목). 미해석/모호하면 null로 떨어져 아래 기존 흐름을 탄다.
    const crossFile = await this._resolveCrossFileTarget(userQuery, editorCtx, activeBase, modelTargetComponent);
    if (crossFile) return { proceed: true, editorCtx: crossFile };

    // 줄 선택이 있으면 사용자가 현재 파일을 명시적으로 가리킨 것 → 바로 진행
    if (editorCtx.selection) return { proceed: true, editorCtx };

    // 쿼리가 현재 파일명/컴포넌트명을 명시 → 확정
    if (activeBase && userQuery.toLowerCase().includes(activeBase.toLowerCase())) {
      return { proceed: true, editorCtx };
    }

    // 쿼리에서 다른 파일/컴포넌트 단서를 추출
    const otherRef = this._extractOtherFileRef(userQuery, activeBase);

    // 열린 파일이 있고 다른 파일 단서가 없으면 → 현재 파일로 진행 (모순 없음)
    if (activePath && !otherRef) return { proceed: true, editorCtx };

    // 모호 → 사용자에게 질문
    return this._askTargetFile(editorCtx, activePath, otherRef);
  }

  /** 쿼리에서 현재 파일과 다른 *.tsx 파일명 또는 PascalCase 컴포넌트명을 찾는다. */
  private _extractOtherFileRef(query: string, activeBase: string): string | null {
    const base = activeBase.toLowerCase();
    const fileM = query.match(/([A-Za-z0-9_]+)\.(tsx?|jsx?)\b/);
    if (fileM && fileM[1].toLowerCase() !== base) return fileM[0];
    const compRe = /\b([A-Z][a-zA-Z0-9]*(?:Page|List|Form|Detail|Modal|View|Table|Card|Panel|Dialog|Screen))\b/g;
    let m: RegExpExecArray | null;
    while ((m = compRe.exec(query)) !== null) {
      if (m[1].toLowerCase() !== base) return m[1];
    }
    return null;
  }

  /** 네이티브 QuickPick으로 수정 대상 파일을 묻는다. */
  private async _askTargetFile(
    editorCtx: EditorContext,
    activePath: string | undefined,
    otherRef: string | null,
  ): Promise<{ proceed: boolean; editorCtx: EditorContext }> {
    const CURRENT = '$(file) 현재 파일 수정';
    const OTHER = '$(folder) 다른 파일 선택…';
    const items: vscode.QuickPickItem[] = [];
    if (activePath) items.push({ label: CURRENT, description: activePath });
    items.push({ label: OTHER, description: otherRef ? `예: ${otherRef}` : undefined });

    const placeHolder = otherRef
      ? `요청이 "${otherRef}"을(를) 가리키는 듯합니다. 어떤 파일을 수정할까요?`
      : '어떤 파일을 수정할까요?';
    const picked = await vscode.window.showQuickPick(items, { placeHolder, ignoreFocusOut: true });
    if (!picked) return { proceed: false, editorCtx };
    if (picked.label === CURRENT) return { proceed: true, editorCtx };

    const newCtx = await this._pickAndCollectFile(otherRef);
    if (!newCtx) return { proceed: false, editorCtx };
    return { proceed: true, editorCtx: newCtx };
  }

  /** 워크스페이스 ts/tsx 파일 목록을 보여주고 선택된 파일을 열어 EditorContext로 재수집한다. */
  private async _pickAndCollectFile(hint: string | null): Promise<EditorContext | undefined> {
    const uris = await vscode.workspace.findFiles('src/**/*.{ts,tsx}', '**/node_modules/**', 1000);
    type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };
    const h = hint?.toLowerCase();
    const items: FileItem[] = uris
      .map((u) => {
        const rel = vscode.workspace.asRelativePath(u);
        return { label: rel.split(/[/\\]/).pop() ?? rel, description: rel, uri: u };
      })
      .sort((a, b) => {
        if (h) {
          const ha = a.label.toLowerCase().includes(h) ? 0 : 1;
          const hb = b.label.toLowerCase().includes(h) ? 0 : 1;
          if (ha !== hb) return ha - hb;
        }
        return (a.description ?? '').localeCompare(b.description ?? '');
      });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: '수정할 파일을 선택하세요',
      matchOnDescription: true,
      ignoreFocusOut: true,
    });
    if (!picked) return undefined;
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    // 활성 에디터가 바뀌었으니 컨텍스트 재수집 (새 파일엔 선택 영역 없음)
    return this._editorCollector.collect();
  }

  /**
   * 요청이 **현재 파일이 아닌 다른 컴포넌트**를 고치라는 것이면 그 컴포넌트의 실제 파일을 편집 대상으로 전환한다.
   *
   * 추출=모델 1순위 / 폴백=정규식: 대상 컴포넌트명은 모델(IntentClassifier.targetComponent)이 정한 것을
   * 먼저 쓰고, 모델이 안 주면(null·꺼짐) 쿼리에서 PascalCase를 정규식 추출하되 **현재 파일이 실제 import한
   * 심볼만** 인정한다(환각 차단). 모델이 명시한 이름은 import 안 돼 있어도 이름 자체로 해석을 시도한다
   * (모델이 본 걸 신뢰; 모호하면 _resolveModuleToUri가 null로 안전 회피).
   *
   * 해석=결정론(파일시스템=진실): 이름/모듈 스펙을 _resolveModuleToUri로 디스크 파일에 매핑. 외부 패키지나
   * 미해석·현재 파일과 동일이면 null을 돌려 호출부가 기존 흐름을 타게 한다. 해석되면 그 파일을 열어
   * EditorContext를 재수집해 반환한다(새 파일엔 선택 영역 없음 → 선택 가드 자동 해제).
   */
  private async _resolveCrossFileTarget(
    userQuery: string,
    editorCtx: EditorContext,
    activeBase: string,
    modelTargetComponent: string | null = null,
  ): Promise<EditorContext | null> {
    if (!editorCtx.available || !editorCtx.content) return null;

    const provenance = buildImportProvenance([editorCtx.content]);
    const baseLower = activeBase.toLowerCase();

    // 대상 컴포넌트명 결정 — 모델이 1순위, 없으면 정규식 폴백.
    let name: string | null = null;
    const modelName =
      modelTargetComponent && /^[A-Z][A-Za-z0-9]*$/.test(modelTargetComponent)
        ? modelTargetComponent
        : null;
    if (modelName && modelName.toLowerCase() !== baseLower) {
      // 모델이 명시 → import 그라운딩을 강제하지 않는다(모델이 본 걸 신뢰; 해석 단계가 안전망).
      name = modelName;
    } else if (!modelTargetComponent) {
      // 폴백: 쿼리에서 PascalCase 추출 + import 그라운딩(정규식은 환각 위험이 커 import된 심볼만 인정).
      const candidates = new Set<string>();
      const re = /\b([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(userQuery)) !== null) candidates.add(m[1]);
      const imported = [...candidates].filter(
        (c) => c.toLowerCase() !== baseLower && provenance.has(c),
      );
      if (imported.length === 1) name = imported[0];
    }
    if (!name) return null; // 단서 없음·모호 → 기존 흐름

    // 억제 가드: name이 편집 **대상**이 아니라 **사용/위치 기준**으로 쓰였으면 재타겟 보류(현재 파일 편집).
    //  - "X로 적용/사용/만들" = 그 컴포넌트를 쓰라는 뜻(use-as).
    //  - "X 위에/아래에 … 만들" = X는 위치 랜드마크(landmark) — 실측 오라우팅("PageHeader 위에 버튼")의 원인.
    // 경로 하드차단이 아니라 의도 정밀화 — "X를 수정/고쳐"는 억제 안 함(진짜 cross-file 편집 보존).
    const suppress = crossFileSuppressionReason(userQuery, name);
    if (suppress) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] cross-file 억제(${suppress === 'use-as' ? 'use-as "…로 적용"' : 'landmark "…위에/아래에"'}): ${name} → 현재 파일 유지`,
      );
      return null;
    }

    // import 경로가 있으면 그 모듈 스펙(정확), 없으면 이름 자체로 glob 해석.
    const moduleSpec = provenance.get(name)?.module ?? name;
    const uri = await this._resolveModuleToUri(moduleSpec, editorCtx.absoluteFilePath);
    if (!uri) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] cross-file: ${name}("${moduleSpec}") 워크스페이스 파일 해석 실패 → 현재 파일 유지`,
      );
      return null;
    }

    const rel = vscode.workspace.asRelativePath(uri);
    // 해석 결과가 현재 파일과 같으면 전환 불필요(현재 파일 수정).
    if (editorCtx.filePath && rel === editorCtx.filePath) return null;
    this._post({
      type: 'token',
      content: `\n\n> 🎯 현재 파일이 import한 **${name}** 컴포넌트를 편집 대상으로 전환합니다: \`${rel}\`\n`,
    });
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] cross-file 재타겟: ${activeBase} → ${rel} (import "${module}")`,
    );
    // 활성 에디터가 바뀌었으니 컨텍스트 재수집 (새 파일엔 선택 영역 없음 → 선택 가드 자동 해제)
    return this._editorCollector.collect();
  }

  /**
   * import 모듈 스펙(예: `@/shared/components/ui/StatusBadge`, `./StatusBadge`)을 워크스페이스 내
   * 실제 파일 URI로 해석한다. 외부 패키지(lucide-react 등)는 워크스페이스에서 못 찾으면 null.
   *
   * 전략: ① 상대경로면 현재 파일 기준 resolve → 확장자/index 탐색. ② 그 외(별칭·bare)는 basename glob으로
   * 후보를 찾고, 스펙 뒤쪽 경로 세그먼트를 가장 많이 포함하는 후보를 고른다(별칭 매핑을 tsconfig 파싱 없이
   * 견고하게 우회 — 컴포넌트 파일명은 대개 워크스페이스에서 유일하다).
   */
  private async _resolveModuleToUri(spec: string, currentAbsPath?: string): Promise<vscode.Uri | null> {
    const exts = ['.tsx', '.ts', '.jsx', '.js'];
    const tryStat = async (base: string): Promise<vscode.Uri | null> => {
      for (const e of exts) {
        const u = vscode.Uri.file(base + e);
        try { await vscode.workspace.fs.stat(u); return u; } catch { /* next */ }
      }
      for (const e of exts) {
        const u = vscode.Uri.file(path.join(base, 'index' + e));
        try { await vscode.workspace.fs.stat(u); return u; } catch { /* next */ }
      }
      return null;
    };

    // ① 상대 경로
    if (spec.startsWith('.') && currentAbsPath) {
      const resolved = await tryStat(path.resolve(path.dirname(currentAbsPath), spec));
      if (resolved) return resolved;
    }

    // ② basename glob + 뒤쪽 세그먼트 스코어링
    const base = spec.split('/').pop();
    if (!base) return null;
    let matches: vscode.Uri[] = [];
    try {
      matches = await vscode.workspace.findFiles(`**/${base}.{tsx,ts,jsx,js}`, '**/node_modules/**', 20);
    } catch {
      return null;
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // 여러 후보 → 스펙 경로 세그먼트(별칭·`.`·`..` 제외)를 가장 많이 포함하는 후보 선택. 동점이면 모호 → null.
    const segs = spec.split('/').filter((s) => s && s !== base && !s.startsWith('@') && s !== '.' && s !== '..');
    const scored = matches
      .map((u) => ({
        u,
        score: segs.filter((s) => u.path.toLowerCase().includes(s.toLowerCase())).length,
      }))
      .sort((a, b) => b.score - a.score);
    if (scored.length >= 2 && scored[0].score === scored[1].score) return null;
    return scored[0].u;
  }

  /** 뷰가 이미 열려 있으면 포커스, 아니면 VS Code가 자동으로 resolveWebviewView를 호출한다. */
  focus(): void {
    this._view?.show(true);
  }

  clearHistory(): void {
    this._history = [];
  }

  /** corpus 파일 변경 시 RAG 인덱스를 재빌드하는 파일 와처를 등록한다. */
  /**
   * [실험·기본 OFF] 영역 편집 결과를 로컬 코퍼스(JSONL)에 포집한다 — 개선 플라이휠의 연료(실제 실패 분포).
   * 폐쇄망 안전: 네트워크 0(로컬 append). 반출 민감도는 redaction 모드로 조절(RegionCaptureRecorder).
   * ⚠ 편집 흐름을 절대 막지 않는다 — 모든 예외를 삼킨다.
   */
  private _captureRegionCase(query: string, filePath: string, source: string, outcome: RegionEditOutcome): void {
    if (!ExtensionConfig.isCaptureRegionCasesEnabled()) return;
    if (!shouldCapture(outcome.status, ExtensionConfig.isCaptureRegionAppliedEnabled())) return;
    const dir = this._captureDir;
    if (!dir) return;

    let entry;
    try {
      const ux = outcome.status === 'fallback' ? classifyRegionDecline(query, source, outcome.reason ?? '') : undefined;
      entry = buildCaptureEntry(
        {
          query,
          filePath,
          source,
          status: outcome.status,
          reason: outcome.reason,
          ux,
          region: outcome.locatedRegion
            ? { start: outcome.locatedRegion.startLine, end: outcome.locatedRegion.endLine }
            : undefined,
          diagnostics: outcome.diagnostics,
        },
        new Date().toISOString(),
        ExtensionConfig.getCaptureRegionRedaction(),
      );
    } catch {
      return; // 엔트리 조립 실패는 조용히(편집을 막지 않는다)
    }

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'region-captures.jsonl'), serializeCaptureLine(entry), 'utf-8');
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 실패 포집: ${entry.id} (${entry.status}/${entry.reason ?? '-'}, redaction=${entry.redaction}) → ${dir}`,
      );
    } catch (e) {
      // 폐쇄망(VDI·로밍 프로필·GPO 잠금)에서 저장 폴더 접근 불가(EACCES/EPERM/ENOENT 등)를 **조용히
      // 삼키지 않는다** — 편집 흐름은 여전히 안 막되(모든 fs 예외 catch), 왜 파일이 안 생기는지
      // 알 수 있게 Output 채널에 한 줄 남기고 접근 가능한 경로로 돌리는 설정을 안내한다.
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] ⚠ 실패 포집 저장 불가: ${dir} — ${(e as Error)?.message ?? e}. ` +
          `설정 'axiom-ai.experimental.captureRegionDir' 로 접근 가능한 경로를 지정하세요.`,
      );
    }
  }

  /**
   * 실패 포집 JSONL 저장 디렉터리 결정(폐쇄망 대응 폴백 체인):
   *  1) 설정 override(experimental.captureRegionDir) — 절대 경로면 그대로, 상대면 워크스페이스 기준.
   *  2) 워크스페이스의 `<axiomFolder>/captures`(기본 `.axiom/captures`) — 개발자가 확실히 접근·반출
   *     가능하고 코드와 같은 반출 심사를 그대로 탄다(폐쇄망 1순위 · 회수 문제도 함께 해결).
   *  3) 확장 globalStorage — 워크스페이스가 없을 때의 최후 폴백(단일 파일 데스크톱 등).
   * globalStorage(APPDATA)가 VDI·로밍 프로필로 접근 불가·초기화되는 SI 환경 때문에 워크스페이스를 기본으로 둔다.
   */
  private _resolveCaptureDir(context: vscode.ExtensionContext): string | undefined {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const configured = ExtensionConfig.getCaptureRegionDir();
    if (configured) {
      return path.isAbsolute(configured) ? configured : wsRoot ? path.join(wsRoot, configured) : configured;
    }
    if (wsRoot) {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
      const base = path.isAbsolute(axiomFolder) ? axiomFolder : path.join(wsRoot, axiomFolder);
      return path.join(base, 'captures');
    }
    return context.globalStorageUri?.fsPath;
  }

  registerCorpusWatcher(context: vscode.ExtensionContext): void {
    // 실패 자동 포집 저장 위치 — 기본은 워크스페이스(.axiom/captures), 설정으로 override, 최후는 globalStorage.
    this._captureDir = this._resolveCaptureDir(context);

    const knowledgePath = ExtensionConfig.getKnowledgePath();
    const pattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] ?? this._extensionUri,
      `${knowledgePath}/scaffold-docs/**/*.md`,
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const rebuild = () => this._scaffoldBuilder.invalidateAndRebuild();
    context.subscriptions.push(
      watcher,
      watcher.onDidChange(rebuild),
      watcher.onDidCreate(rebuild),
      watcher.onDidDelete(rebuild),
    );

    // 외부 corpus 감시자 등록
    this._registerExternalCorpusWatcher(context);

    // 사용자 stubs 폴더 감시자 등록
    this._registerUserStubsWatcher(context);

    // .axiom/ 폴더 감시자 등록
    this._registerAxiomWatcher(context);

    // 설정 변경 시 감시자 재등록
    this._configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('axiom-ai.rag') || e.affectsConfiguration('axiom-ai.sdd')) {
        this._unregisterExternalCorpusWatcher();
        this._registerExternalCorpusWatcher(context);
        this._unregisterAxiomWatcher();
        this._registerAxiomWatcher(context);
        this._scaffoldBuilder.invalidateAndRebuild();
      }
      // 포집 저장 위치 override(또는 axiomFolder)가 바뀌면 리로드 없이 즉시 재계산한다.
      if (e.affectsConfiguration('axiom-ai.experimental.captureRegionDir') || e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) {
        this._captureDir = this._resolveCaptureDir(context);
      }
      if (e.affectsConfiguration('axiom-ai.stubs')) {
        this._unregisterUserStubsWatcher();
        this._registerUserStubsWatcher(context);
        this._llm.reloadStubs();
      }
      if (e.affectsConfiguration('axiom-ai.offlineIntent')) {
        this._reloadIntentExamples();
      }
      // LLM 연결 설정(엔드포인트·모델·provider 등)이 바뀌면 오프라인으로 고정돼 있던 토큰 메터를
      // 즉시 온라인(라이브)으로 되돌린다 — 다음 턴 헬스체크가 실제 도달 가능 여부를 재평가한다.
      if (e.affectsConfiguration('axiom-ai.llm')) {
        this.resetTokenMeter();
      }
    });
    context.subscriptions.push(this._configChangeDisposable);
  }

  /** RAG 인덱스 빌드를 백그라운드에서 시작한다. */
  startIndexBuild(): void {
    this._scaffoldBuilder.startIndexBuild();
  }

  // ─── private: 메시지 처리 ────────────────────────────────────────────────────

  private async _handleMessage(
    text: string,
    overrideSelection?: { filePath: string; startLine: number; endLine: number },
  ): Promise<void> {
    if (!this._view) return;

    // 오프라인 의도 되묻기 대기: 번호 선택 처리
    if (this._offlineClarify) {
      await this._handleOfflineClarifyInput(text);
      return;
    }

    // 페이지 생성 대화 모드: 취소 또는 도메인 선택 처리
    if (this._pageCreationState) {
      if (text.trim() === '/cancel') {
        this._pageCreationState = null;
        this._post({ type: 'token', content: '페이지 생성이 취소되었습니다.' });
        this._post({ type: 'done' });
        this._postStatus(ExtensionConfig.getLlmConfig().model);
        return;
      }
      if (this._pageCreationState.waitingForName) {
        await this._handlePageCreationNameInput(text.trim());
        return;
      }
      if (this._pageCreationState.waitingForCollision) {
        await this._handlePageCreationCollisionInput(text.trim());
        return;
      }
      if (this._pageCreationState.waitingForDomain) {
        await this._handlePageCreationDomainInput(text.trim());
        return;
      }
    }

    // ── 오프라인 계획 카드 선차단 ──────────────────────────────────────────────
    // 페이지 생성 인터셉트(_startPageCreation)와 의도 분류기 호출은 아래 사전 헬스체크보다 **앞**에
    // 있어, 서버가 죽어 있어도 곧장 "영문명 입력 대기" 실행 대화로 들어간다(= 직접 실행). 오프라인에서
    // 행동성 요청은 실행이 아니라 **추천**이어야 하므로(offline-action-cards-plan §2-1) 여기서 계획
    // 카드를 먼저 시도한다. 매칭이 없으면 종전 흐름 그대로 진행한다(카드는 관문이 아니다).
    // 온라인은 무영향 — 헬스체크가 살아 있으면 이 블록을 통째로 건너뛴다(§10.1: 카드는 오프라인 선행 실험).
    if (this._pageCreationDetector.detect(text).isPageCreation) {
      if (!(await this._isLlmOnline(ExtensionConfig.getEffectiveLlmConfig()))) {
        const offlineCtx = this._editorCollector.collect(overrideSelection);
        // 여기까지 왔으면 "행동 요청"임은 이미 확정 — 트리거가 안 걸려도 옛 대화로 떨어뜨리지 말고
        // 카탈로그 리스트로 받아낸다(빗나감을 절벽이 아니라 계단으로).
        if (this._actionCards.recommend(text, !!offlineCtx.filePath, true)) {
          this._postOfflineTurn();
          this._history.push({ role: 'user', content: text });
          this._history.push({ role: 'assistant', content: this._actionCards.historySummary() });
          this._lastUserQuery = text;
          this._post({ type: 'done' });
          this._postStatus('⚠️ 오프라인 모드');
          return;
        }
      }
    }

    // 중단 버튼(stopMessage)이 abort할 메인 컨트롤러를 의도 분석 **전에** 만들어 둔다.
    // 의도 분석(_classifyIntent)도 LLM 스트리밍이므로, 여기서 컨트롤러가 살아 있어야
    // "의도 분석 중…" 단계에서 누른 중단이 실제 스트림까지 전파된다. (예전엔 이 셋업이
    // 의도 분석 뒤에 있어, 그 구간엔 stopMessage가 닿을 컨트롤러가 없어 먹통이었다.)
    this._abortController?.abort();
    this._abortController = new AbortController();

    // 의도 분류기(실험): 정규식 분기 전에 모델에게 "이게 무슨 요청이야?"를 먼저 묻고, 결과를
    // 채팅에 한 줄로 표시한다. 신뢰 가능한 분류면 그대로 라우팅하고, 분류 실패(null)·'other'면
    // 아래 기존 PageCreationDetector 정규식으로 폴백한다(회귀 0).
    let intent: IntentResult | null = null;
    if (ExtensionConfig.isIntentClassifierEnabled()) {
      this._postStatus('의도 분석 중…');
      intent = await this._classifyIntent(text);
      this._postStep('의도 분석');
      if (intent) {
        // 온라인 create_page 충돌 안전 가드 — 오프라인 resolveOfflineIntent의 create→modify 가드와 동일 철학.
        // LLM이 create_page라 답해도, (a) 결정론 PageCreationDetector가 페이지/화면 키워드를 전혀 못 보고
        // (b) 현재 편집 가능한 파일이 열려 있으면, "getArr 함수를 하나 만들어"류를 '만들'만 보고 페이지 생성으로
        // 오분류한 것으로 판단해 **현재 파일 수정으로 되돌린다**. 회귀 방지: '페이지/화면/XxxPage' 신호가 있으면
        // regex도 isPageCreation=true라 가드가 발동하지 않아 정상 생성이 유지된다(두 분류기의 불일치일 때만 개입).
        if (intent.intent === 'create_page' && !this._pageCreationDetector.detect(text).isPageCreation) {
          const openFile = this._editorCollector.collect(overrideSelection).filePath;
          if (openFile) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] create_page 가드 발동: 페이지/화면 신호 없음 + 열린 파일(${openFile}) → modify_file로 보정`,
            );
            intent = { ...intent, intent: 'modify_file', targetFile: intent.targetFile ?? 'current' };
          }
        }
        this._post({ type: 'token', content: `\n> ${formatIntentForChat(intent)}\n` });
        if (intent.intent === 'create_page') {
          // 분류기 pageName은 방어적으로 정규화(소문자·확장자 등) — 인식 못 하면 null로 되묻기.
          const pn = intent.pageName ? this._pageCreationDetector.normalizeName(intent.pageName) : null;
          await this._startPageCreation(pn, text);
          return;
        }
        // modify_file·qna·smalltalk → 페이지 생성 분기를 건너뛰고 일반(수정/Q&A) 흐름으로.
      }
    }

    // 페이지 생성 인텐트 감지 (분류기가 생성으로 확정하지 않았을 때의 폴백/기본 경로)
    // 분류기가 create_page 외로 **확정**했으면(=null도 'other'도 아님) 정규식 생성 분기를 건너뛴다.
    const classifierRoutedAway = intent !== null && intent.intent !== 'other';
    const pageIntent = this._pageCreationDetector.detect(text);
    if (!classifierRoutedAway && pageIntent.isPageCreation) {
      // pageName이 null(순수 한국어 이름)이어도 생성 워크플로우로 진입해 영문명을 되묻는다.
      // 그러지 않으면 "직원 리스트 화면 만들어줘" 같은 요청이 파일 수정/영역 편집 경로로 새어
      // 열려 있던 도메인 파일을 엉뚱하게 수정한다.
      await this._startPageCreation(pageIntent.pageName, text);
      return;
    }

    this._history.push({ role: 'user', content: text });
    this._lastUserQuery = text;
    // D3 보존 표식 스태시를 요청 단위로 초기화 — 직전 요청의 슬라이싱 표식이 이번 요청의
    // 적용(특히 buildSystemPrompt를 안 타는 region 합성)에 새어 들어 오거부하는 것을 차단.
    this._scaffoldBuilder.clearSliceGroupGuard();

    // 히스토리가 너무 길면 오래된 메시지 제거 (최신 20개 유지)
    if (this._history.length > 20) {
      this._history = this._history.slice(this._history.length - 20);
    }

    // 누적 글자 수가 일정 한도(28K자 ≈ 9K토큰)를 넘으면 가장 오래된 메시지부터 제거
    // 시스템 프롬프트는 매 호출 새로 구성되므로 history 한도는 그것을 뺀 잔여 분만 차지하면 된다.
    const HISTORY_CHAR_BUDGET = 28_000;
    let total = this._history.reduce((sum, m) => sum + m.content.length, 0);
    while (total > HISTORY_CHAR_BUDGET && this._history.length > 2) {
      const removed = this._history.shift();
      if (removed) total -= removed.content.length;
    }

    const config = ExtensionConfig.getEffectiveLlmConfig();
    this._postStatus('컨텍스트 분석 중…');
    this._postStep('컨텍스트 분석');

    let mainTimedOut = false;

    try {
      let editorCtx = this._editorCollector.collect(overrideSelection);
      this._logFileDetection(editorCtx);

      // 사전 헬스체크 — 서버가 죽었으면 LLM 경로(타겟 확정 QuickPick·영역편집·streamChat·무의미한
      // axiom-action 재시도 데드엔드)를 전부 건너뛰고, 의도 기반 오프라인 응답(로컬 RAG)을 낸다.
      if (!(await this._isLlmOnline(config))) {
        // 이식 우선 오프라인 응답(헬스체크 실패 경로).
        await this._respondOfflineOrTransplant(text, editorCtx);
        return;
      }

      // 대상 파일 선확정 — 신규 생성이 아닌 수정 요청은 코드 생성 전에 "어떤 파일을 고칠지"를
      // 결정론적 휴리스틱으로 확정한다(잘못된 파일에 라인 splice 방지).
      // 단, Q&A(조회·설명형) 질문은 buildSystemPrompt가 axiom-action 지시를 빼므로(qnaGating),
      // 후처리도 동일하게 파일 수정 흐름(타겟 확정·action 보강·patch 재시도)을 건너뛴다.
      // 그러지 않으면 설명만 한 응답을 강제로 수정 코드로 보강하려다 현재 파일을 추측한
      // <search>가 매칭 실패("patch 매칭 실패")로 이어진다.
      // 모델 의도 분류기가 'qna'/'smalltalk'로 확정했으면 정규식 게이트를 덮어쓴다(모델 우선).
      // "선택 부분에 오류가 발생하는데 원인을 찾아줘"처럼 ?·신호어가 없는 질문은 정규식 isQnAGated가
      // 못 잡아 isFileCtx=true로 새어, 설명만 한 모델 응답을 수정 코드로 래핑해 "원본과 동일한 no-op diff"를
      // 띄우던 근본 원인. forceQnA를 isFileCtx와 buildSystemPrompt 양쪽에 흘려 프롬프트·후처리를 일치시킨다.
      const forceQnA = intent?.intent === 'qna' || intent?.intent === 'smalltalk';
      // forceQnA의 대칭 — 모델이 '수정/생성'(액션)으로 확정했으면 정규식 Q&A 신호("보여줘"·"목록" 등)에
      // 눌려 지식 가이드로 새지 않게 게이팅을 끈다. (예: "getArr 결과를 테이블로 화면에 보여줘"가
      // modify_file로 분류됐는데도 qnaGated=true가 되어 파일 수정 대신 use-api 문서를 렌더하던 버그.)
      const forceModify = intent?.intent === 'modify_file' || intent?.intent === 'create_page';
      // 모델 의도 분류기가 'modify_file'로 **확정**했으면 그 판정을 존중해 파일 수정 컨텍스트로 본다.
      // 종전엔 isFileCtx를 정규식(isFileModificationContext) + 열린 파일 경로로만 판정해서, 채팅 패널에
      // 포커스가 있어 activeTextEditor가 비면(리로드 직후 등) filePath가 없어 정규식이 false → 모델이
      // 옳게 잡은 '수정' 의도가 버려지고 **생성(createFile) 경로로 새어 기존 파일을 덮어쓰려던** 사고가 났다.
      // 파일 확정은 아래 _resolveTargetFile이 담당한다(파일 있으면 진행, 없으면 생성이 아니라 되묻기).
      const classifierSaysModify = intent?.intent === 'modify_file';

      // [S3 단일 라우터] 라우팅 결정을 하나의 `route` 변수로 수렴시킨다. 종전엔 qnaGated·isFileCtx를 각각
      // 독립 파생(§3 원칙 1의 "불리언 수프")했으나, 이제 두 게이트를 단일 route에서 alias로 도출한다.
      // route는 분류기 확신(forceQnA/forceModify/classifierSaysModify)을 반영하되, 오프라인(분류기 off)에선
      // 종전 게이트와 **바이트 동일하게** 계산돼 회귀 0(불변식 #1). 이후 분기(S4 충돌안전 되묻기 등)는
      // 개별 불리언이 아니라 이 route 하나만 소비해 결정자를 단일화한다. ④ isFileModificationContext를
      // classifyOfflineIntent로 대체하는 오프라인 단일화는 S1 실측 divergence 확보 후 S5에서 수행한다.
      const route: 'qna' | 'modify' | 'passthrough' =
        this._scaffoldBuilder.isQnAGated(text, forceQnA, forceModify)
          ? 'qna'
          : classifierSaysModify ||
              this._scaffoldBuilder.isFileModificationContext(text, editorCtx.filePath ?? '')
            ? 'modify'
            : 'passthrough';
      // 소비처 alias — 종전 이름·의미 유지(회귀 0). 두 게이트가 단일 route에서 흐른다.
      const qnaGated = route === 'qna';
      const isFileCtx = route === 'modify';

      // [S1 비파괴 측정 — 라우팅 통합 준비] 라우팅은 **바꾸지 않고**, 단일 라우터 후보 effectiveIntent
      // (분류기 확신 시 그 결과, null/other면 정규식 통합 폴백 classifyOfflineIntent)를 계산해 기존 게이트
      // (qnaGated·isFileCtx) 판정과 **어디서 갈라지는지** 출력 채널에만 기록한다. 어느 결정자가 실사용에서
      // 얼마나 충돌하는지 실측 → 다음 단계(S2~) 우선순위 데이터. (AXIOM_INTENT_ROUTING_REDESIGN.md §4)
      this._logIntentDivergence(text, intent, qnaGated, isFileCtx, editorCtx);

      // 온라인 지식 가이드 — Q&A(조회·설명)로 게이팅된 요청은, 로컬 검색기가 정밀 매칭 문서를
      // **확신**할 때 그 knowledge 문서 전문을 오프라인과 동일하게 렌더하고 LLM 합성을 건너뛴다.
      // 약한 모델이 topK 청크만 보고 짧게 요약하던 것을(캡처: 온라인 답변이 오프라인보다 빈약) 결정론
      // 문서 전문 렌더로 대체한다. 확신이 없으면(빈손·카탈로그 폴백 FALLBACK_HINT) false → 아래 기존
      // LLM 경로로 떨어져 "의도 오판 → 도움 0"을 막는다.
      if (qnaGated && ExtensionConfig.isOnlineKnowledgeAnswerEnabled()) {
        if (await this._tryOnlineKnowledgeAnswer(text, editorCtx, intent)) {
          this._post({ type: 'done' });
          this._postStatus(config.model);
          return;
        }
      }

      if (isFileCtx) {
        const resolved = await this._resolveTargetFile(text, editorCtx, intent?.targetComponent ?? null);
        if (!resolved.proceed) {
          this._post({
            type: 'token',
            content: '\n\n> 취소되었습니다. 어떤 파일을 수정할지 정해지면 다시 요청해 주세요.\n',
          });
          this._post({ type: 'done' });
          this._postStatus(config.model);
          return;
        }
        editorCtx = resolved.editorCtx;
        if (editorCtx.filePath) {
          this._postStep(`대상 파일 — ${editorCtx.filePath.split(/[\\/]/).pop()}`);
        }

        // 내용 이식(content port): 분류기가 "다른 .tsx 파일 내용을 현재 파일에 통째로 적용"으로 확정하면
        // 영역편집/모델 모드선택에 맡기지 않고 전용 경로로 처리한다. 통째 이식 의도가 부분 삽입(structural)
        // 으로 새어 의존성 게이트(예: TEmployee 미해소)에 걸리던 dead-end를 없앤다. 온라인 결정론 진입 +
        // 모델이 import만 검증·보정. 게이트 미충족이면 false → 아래 기존 흐름(영역편집/full)으로 폴백.
        if (intent && (await this._tryContentPortOnline(text, editorCtx, intent, config))) {
          this._post({ type: 'done' });
          this._postStatus(config.model);
          return;
        }

        // [실험] 조립 바인딩(compose, 기본 off): "테이블에 /api/... 적용"처럼 다부품 레시피는 약한 모델에
        // 통째로 맡기지 않고 확장이 결정론으로 조립한다(스펙 type 생성 + useApi 삽입 + 셀 재바인딩). 애매
        // 필드 매핑만 작은 모델콜. 트리거 미충족·실패면 false → region/full 기존 흐름으로 폴백(회귀 0).
        if (
          ExtensionConfig.isComposeBindingEnabled() &&
          !editorCtx.selection &&
          editorCtx.filePath &&
          /\.tsx?$/.test(editorCtx.filePath)
        ) {
          if (await this._tryComposeBinding(editorCtx.filePath, text, config)) {
            this._post({ type: 'done' });
            this._postStatus(config.model);
            return;
          }
        }

        // [실험] 영역 편집(설정 off 기본): 선택 없는 TSX 수정 요청은 확장이 편집 영역을 결정론적으로
        // 찾아 안전 게이트를 통과한 경우에만 그 영역만 모델에 보내 재작성 + 훅/import structural 삽입한다.
        // 게이트 미통과·의존성 미해소·root-tag 불일치면 handled=false → 아래 기존 full 입력 흐름으로 폴백.
        if (
          ExtensionConfig.isRegionEditEnabled() &&
          !editorCtx.selection &&
          editorCtx.filePath &&
          /\.tsx?$/.test(editorCtx.filePath)
        ) {
          const handled = await this._tryRegionEdit(editorCtx.filePath, text, config);
          if (handled) {
            this._post({ type: 'done' });
            this._postStatus(config.model);
            return;
          }
        }
      }

      this._lastSelectionLineRange = editorCtx.selection
        ? { startLine: editorCtx.selection.startLine, endLine: editorCtx.selection.endLine }
        : undefined;

      // 사용자가 메시지에 명시한 파일 경로(예: /plan/api-spec.md)를 읽어 ground truth로 주입한다.
      // 모델은 파일을 열 수 없으므로, "참조 파일은 X" 라고만 적으면 그 내용을 모른다 → 응답 스키마를
      // 추측해 엉뚱한 key로 타입을 선언한다. 확장이 직접 읽어 넣어야 추측 없이 정확히 반영된다.
      const refResult = await this._loadReferencedFiles(text, editorCtx.filePath);
      if (refResult.block) {
        editorCtx.content = (editorCtx.content ?? '') + refResult.block;
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 참조 파일 ${refResult.loaded.length}개 주입: ${refResult.loaded.join(', ')}`,
        );
        this._post({
          type: 'token',
          content: `\n\n> 📎 참조 파일 **${refResult.loaded.length}개**를 컨텍스트에 포함했습니다: ${refResult.loaded.map((f) => `\`${f}\``).join(', ')}\n`,
        });
        this._warnUnmatchedApiPaths(refResult.unmatchedApiPaths);
      }

      const systemPrompt = await this._scaffoldBuilder.buildSystemPrompt(editorCtx, text, forceQnA, forceModify);
      const breakdown = this._scaffoldBuilder.lastBreakdown();
      this._post({
        type: 'contextInfo',
        systemPromptChars: systemPrompt.length,
        breakdown,
        contextWindow: config.contextWindow,
        outputReserve: config.maxTokens,
      });
      this._logSystemPrompt(text, systemPrompt, breakdown);
      // 선택 영역 수정 턴은 이전 대화 history를 빼고 "시스템 프롬프트의 최신 현재 파일 + 이번 요청"만
      // 보낸다. 누적 history엔 직전 턴들의 옛 필드명·옛 코드(이미 디스크에서 바뀐 상태)가 남아 있고,
      // 약한 모델이 recency bias로 그 옛 내용을 신뢰해 현재 파일과 안 맞는 Frankenstein <search>를
      // 만든다(예: 옛 `id/name` + 새 `department/project_name` 혼합 → 매칭 실패). 사용자가 검증한
      // "히스토리 초기화 후 첫 프롬프트는 100% 정상"을 매 선택 수정마다 재현하는 것.
      const isSelectionEdit = isFileCtx && !!editorCtx.selection;
      const messages: ChatMessage[] = isSelectionEdit
        ? [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ]
        : [
            { role: 'system', content: systemPrompt },
            ...this._history,
          ];
      if (isSelectionEdit && this._history.length > 1) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 선택 수정 턴 — 이전 대화 history ${this._history.length - 1}건 제외, 최신 현재 파일 기준으로 처리`,
        );
      }
      let fullResponse = '';
      let wasFallback = false;
      let fallbackReason: string | null = null;

      this._postStep('AI 응답 생성');
      this._postStatus(`${config.model} 연결 중…`);

      let elapsedTimer: ReturnType<typeof setInterval> | null = null;
      let elapsedSec = 0;

      const startElapsedTimer = (phase: string) => {
        elapsedSec = 0;
        this._postStatus(`${config.model} ${phase} (0초)`);
        elapsedTimer = setInterval(() => {
          elapsedSec++;
          this._postStatus(`${config.model} ${phase} (${elapsedSec}초)`);
        }, 1000);
      };

      const clearElapsedTimer = () => {
        if (elapsedTimer) {
          clearInterval(elapsedTimer);
          elapsedTimer = null;
        }
      };

      // 메인 요청 타임아웃 (5분) — 히스토리가 길거나 LLM 응답 지연 시 무한 대기 방지
      const MAIN_TIMEOUT_MS = 300_000;
      const mainTimeoutAbort = new AbortController();
      const mainTimeoutId = setTimeout(() => {
        mainTimedOut = true;
        mainTimeoutAbort.abort();
      }, MAIN_TIMEOUT_MS);
      const mainParentSignal = this._abortController?.signal;
      const mainAbortRelay = () => mainTimeoutAbort.abort();
      mainParentSignal?.addEventListener('abort', mainAbortRelay, { once: true });

      // 반복(degenerate repetition) 억제 튜닝은 "코드 편집 턴이 아닌 산문 응답"(Q&A·조회·설명·잡담)에서만 주입한다.
      // isFileCtx===true(full/patch 코드 편집 폴백)이면 미주입 → 코드 생성 요청 바디는 종전과 바이트 동일(회귀 0).
      // 코드는 반복 토큰(className·닫는 태그·import)이 정당하므로 페널티를 적용하면 안 된다.
      const antiRepeat = ExtensionConfig.getQnaAntiRepeatConfig();
      const qnaTuning: LlmTuning | undefined =
        !isFileCtx && antiRepeat.enabled
          ? config.provider === 'ollama'
            ? { repeatPenalty: antiRepeat.repeatPenalty }
            : { frequencyPenalty: antiRepeat.frequencyPenalty, presencePenalty: antiRepeat.presencePenalty }
          : undefined;

      try {
        let firstToken = true;
        for await (const token of this._llm.streamChat(
          messages,
          config,
          mainTimeoutAbort.signal,
          (reason) => {
            wasFallback = true;
            fallbackReason = reason;
            console.warn(`[Axiom AI] 오프라인 폴백 활성화: ${reason}`);
          },
          () => startElapsedTimer('AI 생성 중…'),
          (usage) => {
            this._post({
              type: 'usage',
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              contextWindow: config.contextWindow,
              outputReserve: config.maxTokens,
            });
          },
          qnaTuning,
        )) {
          if (firstToken) {
            clearElapsedTimer();
            this._postStatus(`${config.model} 스트리밍 중…`);
            firstToken = false;
          }
          fullResponse += token;
          this._post({ type: 'token', content: token });
        }
      } finally {
        clearTimeout(mainTimeoutId);
        mainParentSignal?.removeEventListener('abort', mainAbortRelay);
        clearElapsedTimer();
      }

      // 서버 장애(헬스체크는 통과했으나 실제 호출이 네트워크/5xx로 실패)면 레거시 키워드 스텁
      // (예: .stubs/example.md "코드 예제")을 흘리지 않고 차단했다 → 사전 헬스체크가 잡은 진짜
      // 오프라인과 동일하게 의도 기반 로컬 RAG 응답(유틸·훅·컴포넌트 카탈로그 등)으로 답한다.
      if (wasFallback && !fullResponse.trim()) {
        // 이식 우선 오프라인 응답(모델 호출 실패 폴백 경로 — 헬스체크는 통과했으나 404/5xx 등으로 빈 응답).
        await this._respondOfflineOrTransplant(text, editorCtx, fallbackReason);
        return;
      }

      const hasActionBlock = /<axiom-action>[\s\S]*?<\/axiom-action>/.test(fullResponse);

      if (!hasActionBlock && isFileCtx) {
        // 1차 시도: 로컬 후처리 — 응답 본문에 코드 블록이 있으면 LLM 재호출 없이 axiom-action으로 래핑
        const locallyWrapped = this._wrapCodeBlockAsAxiomAction(
          fullResponse, editorCtx.filePath ?? '',
        );

        if (locallyWrapped) {
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] axiom-action 누락 → 로컬에서 코드 블록을 래핑하여 처리`,
          );
          this._post({
            type: 'token',
            content: '\n\n---\n> ℹ️ axiom-action 래핑이 누락되어 응답의 코드 블록을 자동 추출했습니다.\n',
          });
          const cleanedFirst = this._compressForHistory(fullResponse);
          this._history.push({ role: 'assistant', content: cleanedFirst });
          await this._handleAxiomAction(locallyWrapped);
          this._post({ type: 'done' });
          this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);
          return;
        }

        // 2차 시도: 코드 블록도 없음 → 짧은 보강 요청 (system prompt 재전송 X)
        const respLen = fullResponse.length;
        const isEmpty = respLen === 0;
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] ⚠️ 시나리오 C axiom-action·코드 블록 모두 누락 (응답 길이=${respLen}자${isEmpty ? ', EMPTY' : ''})\n` +
          `시스템 프롬프트 ${systemPrompt.length}자, 히스토리 ${this._history.length}개 메시지\n` +
          `응답 앞부분: ${fullResponse.substring(0, 300)}`,
        );
        if (isEmpty) {
          this._post({
            type: 'token',
            content:
              '\n\n> ⚠️ **모델이 빈 응답을 반환했습니다** (content 토큰 0개). ' +
              '시스템 프롬프트가 너무 길거나 모델이 즉시 EOS를 발사한 경우입니다. ' +
              '대화 기록 초기화 후 재시도하거나, `axiom-ai.multiPatch.enabled=false` 로 설정해 단일 patch 모드로 폴백해보세요. ' +
              '자세한 진단은 DevTools 콘솔의 `[Axiom AI] ← 스트림 종료` 로그를 확인하세요.\n',
          });
        }
        const cleanedFirst = this._compressForHistory(fullResponse);
        this._history.push({ role: 'assistant', content: cleanedFirst });

        const retryResult = await this._retryForAxiomAction(
          editorCtx.filePath ?? '', config,
        );

        if (retryResult) {
          await this._handleAxiomAction(retryResult);
        }
        this._post({ type: 'done' });
        this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);
        return;
      }

      // 생성(비수정) 컨텍스트에서 응답이 <axiom-action> 닫는 태그 전에 잘린 경우 —
      // 위 isFileCtx 복구 분기는 update 전용(_retryForAxiomAction은 현재 파일을 수정 대상으로 가정)
      // 이라 신규 생성엔 못 쓰고, 그대로 _handleAxiomAction에 넘기면 블록 0개로 데드엔드가 난다.
      // 같은 요청을 1회 재생성(출력 토큰 한도 상향)해 완결 블록을 노린다. 재생성도 잘리면
      // 원래 응답으로 폴백 → 기존 데드엔드 안내(무회귀).
      let finalResponse = fullResponse;
      if (!hasActionBlock && !isFileCtx && /<axiom-action>/.test(fullResponse)) {
        this._corpusOutputChannel.appendLine(
          '[Axiom AI] ⚠️ 출력 잘림 감지(생성 컨텍스트, 닫는 </axiom-action> 누락) → 1회 재생성',
        );
        const regen = await this._regenerateTruncated(messages, config);
        if (/<axiom-action>[\s\S]*?<\/axiom-action>/.test(regen)) {
          finalResponse = regen;
        }
      }

      const cleanedResponse = this._compressForHistory(finalResponse);
      this._history.push({ role: 'assistant', content: cleanedResponse });

      // axiom-action 마크업이 실제로 있을 때만 적용 파이프라인에 흘린다. 순수 Q&A(조회·설명) 응답은
      // 코드 액션이 없으므로 _handleAxiomAction의 "0-블록" 가드가 "⚠️ 파일 수정을 적용하지 못했습니다"를
      // 매번 헛발신하던 근본 원인이었다(이건 수정 요청이 아니라 설명 요청이라 경고 자체가 무의미).
      // 완결 블록(hasActionBlock) 또는 잘린 여는 태그(생성 컨텍스트 truncation 안내 대상)일 때만 호출.
      if (/<axiom-action>/.test(finalResponse)) {
        await this._handleAxiomAction(finalResponse);
      }

      // 온라인 지식 답변(코드 액션 아님)은 topK 청크만 보므로 일부만 다룰 수 있다 →
      // 프롬프트에 실제로 주입된 출처 문서를 "전체 보기" 푸터로 노출한다(결정론, 모델 비의존).
      // 오프라인 폴백(wasFallback)은 문서 전문을 이미 그대로 덤프하므로 푸터를 생략한다.
      if (!hasActionBlock && !isFileCtx && !wasFallback && fullResponse.trim()) {
        const footer = this._buildScaffoldSourcesFooter(
          this._scaffoldBuilder.lastScaffoldSources(),
        );
        if (footer) this._post({ type: 'token', content: footer });
      }

      this._post({ type: 'done' });
      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (mainTimedOut) {
          this._post({ type: 'token', content: '\n\n> ⚠️ 응답 시간이 초과되었습니다 (5분). 대화 기록을 초기화하거나 더 간단한 요청을 입력해보세요.' });
        }
        this._post({ type: 'done' });
        this._postStatus(ExtensionConfig.getEffectiveLlmConfig().model);
        return;
      }
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      this._post({ type: 'error', message });
      this._postStatus('오류 발생');
    }
  }

  /**
   * 온라인 지식 답변 하단에 붙는 "전체 보기" 푸터를 만든다. 답변은 질문과 가장 가까운
   * topK 청크만 보고 합성되므로(예: util 질문에 number만 답하고 finance/object/array 누락 가능),
   * 실제 주입된 출처 문서를 안내해 사용자가 전문을 확인하도록 한다. 결정론(모델 비의존).
   * 출처가 없으면 빈 문자열(푸터 생략).
   */
  private _buildScaffoldSourcesFooter(sources: string[]): string {
    if (!sources || sources.length === 0) return '';

    // 종합 레퍼런스 문서 → 인터랙티브 데모/전문 위치 추가 안내(있을 때만).
    const DEMO_POINTERS: Record<string, string> = {
      'utils/util.md': '🧩 `$util` 인터랙티브 예제: `src/domains/example/pages/utils/`',
    };

    const lines = [
      '\n\n---',
      '> 📚 이 답변은 질문과 가장 관련된 부분만 담고 있어 일부 내용이 빠졌을 수 있습니다. 전체는 아래 scaffold 문서를 참고하세요:',
    ];
    for (const src of sources) {
      lines.push(`> - \`${src}\``);
    }
    const demoTips = sources.map((s) => DEMO_POINTERS[s]).filter(Boolean);
    for (const tip of demoTips) {
      lines.push(`> ${tip}`);
    }
    lines.push('>');
    lines.push('> 💡 같은 질문을 **오프라인 모드**에서 하면 관련 문서 전문이 그대로 표시됩니다.');
    return lines.join('\n') + '\n';
  }

  /**
   * 온라인 Q&A 지식 가이드 — Q&A로 게이팅된 요청에서, 오프라인과 **동일한** 로컬 검색기
   * (retrieveOfflineKnowledge: 의미+키워드로 knowledge 문서를 통째로)를 온라인에서도 호출해
   * 매칭 문서 전문을 그대로 렌더한다. 약한 모델의 topK 청크 요약(빈약한 답)을 결정론 문서 전문으로
   * 대체하는 것이 목적이다.
   *
   * **안전 게이트(의도 오판 방어)**: 검색기가 정밀 매칭을 확신할 때만(빈손 아님 + 첫 블록이
   * FALLBACK_HINT(카탈로그 폴백) 아님) true를 반환하고 LLM을 건너뛴다. 확신이 없으면 false →
   * 호출부가 기존 LLM 경로를 그대로 태운다 → "Q&A로 잘못 분류됐지만 맞는 문서가 없을 때 LLM 답변을
   * 못 받는" 공백을 차단한다.
   *
   * 공유 스코어러(buildContext)·코드 편집 경로는 건드리지 않는다(온라인 수정 흐름 무영향).
   * @returns 지식 가이드를 렌더했으면 true, (확신 미달로) LLM에 맡겨야 하면 false.
   */
  private async _tryOnlineKnowledgeAnswer(
    text: string,
    editorCtx: EditorContext,
    intent: IntentResult | null,
  ): Promise<boolean> {
    // 분류기 off 등으로 intent가 없으면 qna로 가정한 최소 IntentResult를 합성한다(검색기는
    // intent.intent만 fileCtx 게이팅에 쓰며, qna는 열린 파일 import 노이즈를 제외한다).
    const effIntent: IntentResult = intent ?? {
      intent: 'qna',
      pageName: null,
      domain: null,
      contentSource: null,
      targetFile: null,
      targetComponent: null,
    };

    let docs: string[];
    try {
      docs = await this._scaffoldBuilder.retrieveOfflineKnowledge(
        text,
        effIntent,
        editorCtx.content ?? '',
      );
    } catch (err) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 온라인 지식 가이드 검색 실패 → LLM 폴백: ${(err as Error).message}`,
      );
      return false;
    }

    // 질문이 특정 컴포넌트를 지목하면(예: "Select 컴포넌트 옵션 보여줘") 그 컴포넌트의 **전체 prop**을
    // 결정론적으로 붙인다. RAG 지식문서(Select.md 등)는 '사용 패턴' 위주라 옵션 전량을 나열하지 못하는데,
    // 자동생성 인덱스(componentPropsIndex)엔 53개 컴포넌트의 완전한 prop이 있다(실측 갭: "옵션 보여줘"에
    // 문서만 렌더돼 옵션 일부만 보였다). 문서가 약해도(FALLBACK) 옵션 질문이면 이 표만으로 답한다.
    const componentRef = buildComponentOptionsReference(detectComponentsInText(text));
    const asksOptions = /옵션|속성\b|prop|option|무슨.*(있|받)|어떤.*(있|받)|전체.*(속성|prop|옵션)|목록/i.test(text);
    const docsWeak = !docs || docs.length === 0 || docs[0] === FALLBACK_HINT;

    // 문서가 약하고, (컴포넌트 지목 + 옵션 질문)도 아니면 종전대로 LLM에 맡긴다(확신 게이트 유지).
    if (docsWeak && !(componentRef && asksOptions)) return false;

    // 이 턴은 LLM을 호출하지 않는 결정론 렌더 — 토큰 메터를 "로컬 지식 · 토큰 미사용"으로 전환해
    // 화면에 쌓인 문서 전량을 토큰으로 오추정하며 막대가 오르는 오해를 막는다.
    this._postLocalKnowledgeTurn();
    // 정독용 턴 — webview가 답변 바닥이 아니라 이번 질문을 뷰포트 상단에 고정하게 한다(위→아래로 정독).
    this._post({ type: 'pinQuestion' });
    const banner =
      '> 📚 **scaffold 지식 가이드** — 로컬 문서에서 관련 사용법을 찾아 전문을 표시합니다.';
    const parts = [banner];
    if (componentRef) parts.push(componentRef); // 옵션 전량을 문서보다 위에 — "옵션 보여줘"에 바로 응답
    if (!docsWeak) parts.push(docs.join('\n\n---\n\n'));
    const md = `\n${parts.join('\n\n')}\n`;
    this._post({ type: 'token', content: md });
    this._history.push({ role: 'assistant', content: '(scaffold 지식 가이드 응답)' });
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 온라인 지식 가이드 렌더(문서 ${docsWeak ? 0 : docs.length}개${componentRef ? ' + 컴포넌트 옵션표' : ''}) — LLM 합성 생략`,
    );
    return true;
  }

  // ─── 오프라인 JSX 이식 ────────────────────────────────────────────────────────

  /**
   * [오프라인 전용] "다른 파일의 JSX를 그대로 끼워줘" 류 요청을 **모델 없이** 결정론적으로 처리한다.
   *
   * 온라인이면 영역편집(runHybridRegionEdit)이 모델로 의존성까지 봉합하지만, 서버가 죽은 오프라인에선
   * 그 봉합을 생략하고(완벽주의 게이트 OFF) 출처 .tsx의 메인 JSX를 현재 파일 메인 JSX 자리에 그대로
   * splice한 뒤, **빠진 컴포넌트/값**을 강조 경고로 고지하고 기존 적용 카드(컨펌·diff·쓰기)에 흘려보낸다.
   * dead-end(체크리스트만 주던 것) 대신 실제 적용을 가능케 한다.
   *
   * 발동 게이트(모두 충족 시): 현재 .tsx + 이식 의도 단어(동사+대상) + **출처 .tsx 참조 정확히 1개**.
   * 하나라도 어긋나면 false → 호출부가 일반 오프라인 응답으로 폴백.
   *
   * @returns true = 이식 적용 카드로 처리됨 / false = 일반 오프라인 응답 필요
   */
  /**
   * 오프라인 응답 진입점 — **이식 우선**. 다른 파일 JSX를 그대로 끼우는 요청이면 모델 없이 적용 카드를
   * 띄우고(true), 아니면 기존 의도 기반 오프라인 응답(로컬 RAG)으로 폴백한다. 사전 헬스체크 실패와
   * 모델 호출 실패(404 등) 양쪽 오프라인 경로가 이 단일 진입점을 공유해 분기가 갈라지지 않게 한다.
   */
  private async _respondOfflineOrTransplant(text: string, editorCtx: EditorContext, notice?: string | null): Promise<void> {
    this._postOfflineTurn();
    if (await this._tryOfflineTransplant(text, editorCtx, notice)) {
      this._post({ type: 'done' });
      this._postStatus('⚠️ 오프라인 모드');
      return;
    }
    await this._respondOffline(text, editorCtx, notice);
  }

  private async _tryOfflineTransplant(text: string, editorCtx: EditorContext, notice?: string | null): Promise<boolean> {
    const log = (m: string): void => this._corpusOutputChannel.appendLine(`[Axiom AI] 오프라인 이식: ${m}`);
    const filePath = editorCtx.filePath;
    if (!filePath || !/\.tsx?$/.test(filePath)) {
      log(`스킵 — 현재 파일이 .tsx 아님(${filePath ?? '열린 파일 없음'}). .tsx 페이지를 연 상태에서 요청하세요.`);
      return false;
    }
    if (!isVerbatimTransplantRequest(text)) {
      log(`스킵 — 이식 의도 단어(동사+대상) 불충족: "${text.slice(0, 60)}"`);
      return false;
    }

    // 현재 파일 — 디스크 ground truth(슬라이싱된 editorCtx.content 대신 디스크를 읽는다).
    let currentContent: string;
    try {
      currentContent = fs.readFileSync(this._resolveWorkspacePath(filePath), 'utf-8');
    } catch {
      log(`스킵 — 현재 파일 읽기 실패(${filePath})`);
      return false;
    }
    if (!currentContent.trim()) return false;

    // 출처 파일 — 메시지에 명시된 참조 .tsx 가 정확히 하나일 때만(0개/여러개면 모호 → 일반 오프라인으로).
    const refResult = await this._loadReferencedFiles(text, filePath);
    const tsxRefs = refResult.loaded
      .map((rel, i) => ({ rel, content: refResult.contents[i] }))
      .filter((x) => /\.tsx?$/.test(x.rel));
    if (tsxRefs.length !== 1) {
      log(`스킵 — 출처 .tsx 참조가 정확히 1개가 아님(${tsxRefs.length}개): [${refResult.loaded.join(', ')}]`);
      return false;
    }
    const source = tsxRefs[0];

    const plan = planJsxTransplant(currentContent, source.content);
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 오프라인 이식 시도(${source.rel} → ${filePath}): ${plan.ok ? `OK ${plan.replacedStart}~${plan.replacedEnd}줄 / 빠진 컴포넌트=[${plan.missingComponents.join(', ')}] 값=[${plan.missingValues.join(', ')}]` : `폴백(${plan.reason})`}`,
    );
    if (!plan.ok || !plan.finalText) return false;

    const diff = computeDiffHunks(currentContent, plan.finalText);
    if (diff.length === 0) return false;

    // 안내 + (있으면) 강조 경고 → 적용 카드 순으로 출력.
    const noticeLine = notice?.trim()
      ? `> ⚠️ 서버가 요청을 처리하지 못해 모델 없이 처리합니다 — ${notice.trim()}\n> 설정의 모델명·엔드포인트를 확인해주세요.\n\n`
      : `> ⚠️ **오프라인 모드** — AI 서버에 연결할 수 없어 모델 없이 처리합니다.\n\n`;
    this._post({
      type: 'token',
      content:
        noticeLine +
        `> 🧩 **JSX 이식** — 참조 파일 \`${source.rel}\`의 JSX를 현재 파일 ` +
        `${plan.replacedStart}~${plan.replacedEnd}줄에 **그대로 끼워 넣었습니다**. 아래에서 확인 후 적용하세요.\n`,
    });
    const warning = this._formatTransplantWarning(plan.missingComponents, plan.missingValues);
    if (warning) this._post({ type: 'token', content: warning });

    const wrapped = this._wrapCodeBlockAsAxiomAction('```tsx\n' + plan.finalText + '\n```', filePath);
    if (!wrapped) return false;
    this._history.push({ role: 'assistant', content: '(오프라인 JSX 이식 적용)' });
    await this._handleAxiomAction(wrapped, false, false, undefined, diff);
    return true;
  }

  // ─── 온라인 내용 이식(content port) ───────────────────────────────────────────

  /**
   * [온라인] 분류기가 "다른 .tsx 파일 내용을 현재 파일에 통째로 적용"(modify_file + contentSource(.tsx)
   * + targetFile=current)으로 확정한 요청을 전용 경로로 처리한다.
   *
   * 영역편집/모델 모드선택에 맡기면 통째 이식 의도가 부분 삽입(structural)으로 새어 의존성 게이트에
   * 걸리던 dead-end(예: 출처가 쓰는 TEmployee 타입 미해소 → patch 매칭 실패)를 없앤다. 출처 파일
   * **전체**를 베이스로 적용하므로 import·타입·훅이 빠지지 않고, 온라인이라 모델이 대상 경로 기준으로
   * import를 검증·보정한다. 모델 출력이 의심스러우면(빈/절단/export default 소실) **베이스(출처 원문)로
   * 안전 폴백**해 결코 더 나빠지지 않는다.
   *
   * @returns true = 이식 적용 카드로 처리됨 / false = 게이트 미충족 → 호출부가 기존 흐름으로 폴백
   */
  private async _tryContentPortOnline(
    text: string,
    editorCtx: EditorContext,
    intent: IntentResult,
    config: LlmConfig,
  ): Promise<boolean> {
    const log = (m: string): void => this._corpusOutputChannel.appendLine(`[Axiom AI] 내용 이식(온라인): ${m}`);

    // 게이트: modify_file + .tsx 출처 + 대상이 현재(.tsx) 파일.
    if (intent.intent !== 'modify_file' || !intent.contentSource) return false;
    if (!/\.tsx?$/.test(intent.contentSource)) return false;
    const targetPath = editorCtx.filePath;
    if (!targetPath || !/\.tsx?$/.test(targetPath)) return false;
    const curRel = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
    // targetFile은 'current' 또는 현재 파일 경로일 때만(다른 경로 지정이면 일반 흐름에 양보).
    if (intent.targetFile && intent.targetFile !== 'current') {
      const tRel = intent.targetFile.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!curRel.endsWith(tRel) && !tRel.endsWith(curRel)) {
        log(`스킵 — 대상이 현재 파일이 아님(targetFile=${intent.targetFile}, 현재=${curRel})`);
        return false;
      }
    }

    // 출처 파일 해석 — 모델 경로는 추측이라 틀릴 수 있으므로(예: src/domains/publishing/… 환각) 디스크
    // grounded 해석: 모델 경로 → 실패 시 basename 전체 glob(현재 대상 제외) → 폴더 힌트 랭킹 → 동률 QuickPick.
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return false;
    const srcUri = await this._resolveContentSourceUri(text, intent.contentSource, curRel);
    if (!srcUri) {
      log(`스킵 — 출처 파일을 찾지 못함: ${intent.contentSource}`);
      return false;
    }
    const srcRel = vscode.workspace.asRelativePath(srcUri).replace(/\\/g, '/');
    if (srcRel === curRel) {
      log(`스킵 — 출처와 대상이 동일(${srcRel})`);
      return false;
    }

    let sourceContent: string;
    let currentContent: string;
    try {
      sourceContent = Buffer.from(await vscode.workspace.fs.readFile(srcUri)).toString('utf-8');
      currentContent = fs.readFileSync(this._resolveWorkspacePath(targetPath), 'utf-8');
    } catch (e) {
      log(`스킵 — 파일 읽기 실패: ${(e as Error).message}`);
      return false;
    }
    if (!sourceContent.trim()) {
      log(`스킵 — 출처 파일이 비어 있음(${srcRel})`);
      return false;
    }

    this._postStatus('내용 이식 — import 검증 중…');
    // 베이스 = 출처 전체. 모델은 대상 경로 기준으로 import만 검증·보정(실패/의심 시 베이스로 폴백).
    const finalContent = await this._verifyPortedImports(sourceContent, srcRel, curRel, config);
    log(`적용(${srcRel} → ${curRel}): ${finalContent === sourceContent ? '원문 그대로' : 'import 보정 반영'}`);

    const diff = computeDiffHunks(currentContent, finalContent);
    if (diff.length === 0) {
      this._post({
        type: 'token',
        content: '\n\n> ℹ️ **현재 파일이 이미 출처 파일과 동일합니다** — 변경 없음.\n',
      });
      return true;
    }

    this._post({
      type: 'token',
      content:
        `\n\n> 🧩 **내용 이식** — 참조 파일 \`${srcRel}\`의 **전체 내용**을 현재 파일에 적용합니다` +
        `${finalContent === sourceContent ? '' : ' (import 검증·보정 포함)'}. 아래에서 확인 후 적용하세요.\n`,
    });

    const wrapped = this._wrapCodeBlockAsAxiomAction('```tsx\n' + finalContent + '\n```', targetPath);
    if (!wrapped) {
      log('스킵 — axiom-action 래핑 실패(코드블록 추출 불가)');
      return false;
    }
    this._history.push({ role: 'assistant', content: `(내용 이식 적용: ${srcRel} → ${curRel})` });
    await this._handleAxiomAction(wrapped, false, false, undefined, diff);
    return true;
  }

  /**
   * 이식된 출처 파일을 대상 경로 기준으로 **import만** 검증·보정한다(모델). 모델은 전체 파일을 다시
   * 내되 import 외 본문은 그대로 보존하도록 강하게 제약하고, 출력이 의심스러우면(빈/절단/구조 소실)
   * 출처 원문을 그대로 돌려준다 — 통째 적용은 보장하고 보정은 best-effort.
   */
  private async _verifyPortedImports(
    sourceContent: string,
    srcRel: string,
    targetRel: string,
    config: LlmConfig,
  ): Promise<string> {
    const system =
      '당신은 코드 이식 도우미입니다. 주어진 파일을 다른 경로로 옮길 때 깨지는 import만 바로잡고, ' +
      '나머지는 한 글자도 바꾸지 않습니다. 전체 파일을 단일 ```tsx 코드블록으로만 출력하세요.';
    const user =
      `아래 파일을 \`${srcRel}\` 에서 \`${targetRel}\` 위치로 그대로 옮깁니다.\n` +
      `규칙:\n` +
      `- 새 위치에서 깨지는 **상대경로 import**(\`./\` \`../\`)만 보정하세요.\n` +
      `- 별칭 import(\`@/\`, \`@axiom/\`)·로직·JSX·타입 선언은 **절대 변경 금지**.\n` +
      `- 새 코드·기능을 추가하지 말고, 누락 없이 **전체 파일**을 그대로 출력하세요.\n\n` +
      '```tsx\n' + sourceContent + '\n```';

    let out = '';
    try {
      const signal = this._abortController?.signal;
      for await (const token of this._llm.streamChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        config,
        signal,
        () => {},
      )) {
        out += token;
      }
    } catch {
      return sourceContent; // 모델 호출 실패 → 베이스(원문) 그대로
    }

    const m = [...out.matchAll(/```(?:tsx|ts|jsx|js|typescript|javascript)\n([\s\S]*?)```/g)].pop();
    const candidate = m ? m[1].trimEnd() : '';
    // 안전 게이트: 비었거나 / 원문엔 있던 export default가 사라졌거나 / 길이가 원문의 60% 미만(절단)
    //             이면 모델 출력을 버리고 출처 원문을 쓴다 — 통째 적용을 보장(보정은 best-effort).
    const srcHasDefault = /export\s+default/.test(sourceContent);
    const ok =
      candidate.length > 0 &&
      candidate.length >= sourceContent.length * 0.6 &&
      (!srcHasDefault || /export\s+default/.test(candidate));
    if (!ok) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 내용 이식(온라인): 모델 보정 출력 의심(길이 ${candidate.length}/${sourceContent.length}) → 출처 원문으로 폴백`,
      );
      return sourceContent;
    }
    return candidate;
  }

  /**
   * 이식 후 현재 파일에 없는 의존성(컴포넌트 import·값 선언)을 **강조 블록**으로 포맷한다.
   * 빠진 게 없으면 빈 문자열(경고 생략). 사용자가 "절반만 적용됨"을 놓치지 않게 본문과 구분되는 인용 블록.
   */
  private _formatTransplantWarning(missingComponents: string[], missingValues: string[]): string {
    const items: string[] = [];
    for (const c of missingComponents) items.push(`> - \`${c}\` _(컴포넌트 — import 필요)_`);
    for (const v of missingValues) items.push(`> - \`${v}\` _(훅/state/함수)_`);
    if (items.length === 0) return '';
    return (
      `\n> ## ⚠️ 절반만 적용됐어요\n>\n` +
      `> JSX는 붙였지만 아래가 **빠졌습니다 — 직접 채워야 동작합니다.**\n>\n` +
      `${items.join('\n')}\n>\n` +
      `> 또는 서버 복구 후 같은 요청으로 자동 완성하세요.\n`
    );
  }

  // ─── 영역 편집(실험) ──────────────────────────────────────────────────────────

  /**
   * [실험] 조립 바인딩(compose) — "테이블에 /api/… 적용" 같은 다부품 레시피를 약한 모델에 통째로
   * 맡기지 않고 확장이 **결정론으로 조립**한다. 흐름:
   *   ① 트리거: 현재 파일에 `<tbody>`+`X.map` 데이터 테이블 + 요청에 정확 엔드포인트.
   *   ② 참조 스펙에서 그 엔드포인트의 GET 응답 스키마 추출 → 테이블 컬럼과 대조(결정론).
   *   ③ 약어 등 결정론으로 못 맞춘 컬럼만 **작은 모델콜**(라벨+필드목록, 파일 아님)로 매핑.
   *   ④ rewrite(셀 재바인딩) + applyStructuralEdit(type·useApi·가드) → 최종 텍스트 → 확인 카드.
   *   ⑤ API에 없는 컬럼은 추측 금지 → 알림(되묻기). 트리거 미충족·실패 시 false → region/full 폴백(회귀 0).
   *
   * 상세/설계: 메모리 project_compose_binding_recipe. 순수 조립 로직은 `ai/ApiBindingRecipe.ts`(테스트 고정).
   */
  private async _tryComposeBinding(filePath: string, text: string, config: LlmConfig): Promise<boolean> {
    // ① 현재 파일 + 데이터 테이블 트리거
    const domain = this._scaffoldBuilder.extractDomainFromFilePath(filePath) ?? '';
    const { originalContent } = await this._fileCreator.readFileContent({
      action: 'updateFile', templateType: 'page', domain, componentName: '', filePath,
    });
    if (!originalContent) return false;
    const collectionVar = findRowCollectionVar(originalContent);
    const mapVar = findRowMapVar(originalContent);
    if (!collectionVar || !mapVar) return false;
    const columns = extractTableColumns(originalContent);
    if (columns.filter((c) => c.field).length < 2) return false; // 데이터 테이블로 보기 어려움

    // ② 엔드포인트 + 참조 스펙 → GET 응답 스키마
    const apiPaths = extractApiPaths(text);
    if (apiPaths.length === 0) return false;
    const endpoint = apiPaths[0];
    const ref = await this._loadReferencedFiles(text, filePath);
    // 스펙 소스 = 인라인 프롬프트 본문 + 참조 파일. 사용자가 스펙을 파일(@api-spec.md)로 참조하지 않고
    // 프롬프트에 **통째로 붙여넣어도**(실측: `### GET /api/employees … **Response** ```json {…}```) 응답
    // 스키마를 읽어 조립이 발동하게 한다. 파서(pickResponseSchema→extractResponseSchema)가 Response JSON
    // 블록을 텍스트에서 파싱하므로 text를 그대로 넘기면 된다. 종전엔 참조 파일 전용(ref.contents)이라
    // 인라인 붙여넣기가 첫 관문에서 탈락 → region/structural 반쪽 편집으로 새던 뿌리. 어디에도 스키마가
    // 없으면 아래 !schema에서 깔끔히 폴백(회귀 0).
    const specText = [text, ...ref.contents].join('\n\n');
    const schema = pickResponseSchema(specText, endpoint);
    if (!schema || schema.rowFields.length === 0) return false;

    // ③ 대조(결정론) — 확정 매핑 + 애매/미매핑 분리
    const rec = reconcile(columns, schema);
    if (rec.mapping.length === 0 && rec.unmappedColumns.length === 0) return false;
    const renames: IFieldRename[] = rec.mapping.map((m) => ({ from: m.column.field!, to: m.apiField }));

    // ④ 애매 컬럼(후보 있음)만 작은 모델콜로 매핑
    const ambiguous = rec.unmappedColumns.filter((c) => c.field);
    if (ambiguous.length > 0 && rec.unusedApiFields.length > 0) {
      this._post({
        type: 'token',
        content: `\n\n> 🧭 **필드 매핑 확인 중…** (\`${ambiguous.map((c) => c.field).join('`, `')}\`)\n`,
      });
      const prompt = buildFieldMappingPrompt(ambiguous, rec.unusedApiFields);
      const resp = await this._streamCollect([{ role: 'user', content: prompt }], config, 45_000);
      renames.push(...parseFieldMapping(resp, ambiguous, rec.unusedApiFields));
    }

    // ⑤ 여전히 미매핑(API에 대응 없음) = 언더스펙 → 추측 금지, **되묻기**.
    //    바로 조립하면 남은 `{emp.project}`가 새 타입에 없어 타입에러(컴파일 실패)가 나므로, 조립 전에
    //    사용자에게 제거/유지/취소를 물어 그 답대로 진행한다(설계원칙: 추론 전환 시에만 되묻기).
    const mappedFroms = new Set(renames.map((r) => r.from));
    const unresolved = ambiguous.filter((c) => !mappedFroms.has(c.field!));

    let workingSource = originalContent;
    let unresolvedMode: 'removed' | 'kept' = 'kept';
    if (unresolved.length > 0) {
      const labels = unresolved.map((c) => c.headerLabel || c.field).join(', ');
      const REMOVE = '컬럼 제거';
      const KEEP = '그대로 두기 (경고)';
      const CANCEL = '다른 API 지정 (조립 취소)';
      const picked = await vscode.window.showQuickPick(
        [
          { label: REMOVE, description: `${labels} 컬럼(헤더+셀)을 표에서 빼고 조립 — 바로 컴파일됨` },
          { label: KEEP, description: `그대로 두고 경고만 — 남는 타입에러는 직접 처리` },
          { label: CANCEL, description: `이 컬럼은 다른 엔드포인트 소관 — 조립 취소하고 다시 요청` },
        ],
        {
          placeHolder: `"${labels}" 컬럼은 ${endpoint} 응답에 없습니다. 어떻게 할까요?`,
          ignoreFocusOut: true,
        },
      );
      if (!picked || picked.label === CANCEL) {
        this._post({
          type: 'token',
          content:
            `\n\n> 🧩 조립을 취소했습니다. \`${labels}\` 데이터를 제공하는 엔드포인트를 함께 지정해 다시 요청해 주세요.\n`,
        });
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 🧩 조립 바인딩: 미매핑 컬럼(${labels}) 되묻기 → 취소`,
        );
        return true; // 처리됨(무편집) — region/full 폴백으로 흘려 잘못된 재작성을 유발하지 않는다.
      }
      if (picked.label === REMOVE) {
        workingSource = removeTableColumns(originalContent, unresolved.map((c) => c.index));
        unresolvedMode = 'removed';
      }
    }

    // ⑥ 결정론 조립: 셀 재바인딩 → 더미 배열 제거 → type·useApi·가드 삽입
    //    (파생 `const employees = data?.data ?? []`가 더미와 이름이 겹쳐 드롭되지 않도록 더미를 먼저 제거)
    const rewritten = stripModuleConst(rewriteMappedFields(workingSource, renames, mapVar).text, collectionVar);
    const rootName = deriveRootName(endpoint);
    const bind = buildBindingCode({ schema, endpoint, rootName, collectionVar });
    const applied = applyStructuralEdit(rewritten, { hookCode: bind.hookCode, imports: bind.imports }).text;
    const diff = computeDiffHunks(originalContent, applied);
    if (diff.length === 0) return false;

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🧩 조립 바인딩 (${filePath}): endpoint=${endpoint} type=${bind.typeName} ` +
        `매핑=${renames.map((r) => `${r.from}→${r.to}`).join(', ') || '(정확일치만)'} ` +
        `미매핑=${unresolved.map((c) => c.field).join(', ') || '없음'}` +
        (unresolved.length > 0 ? ` → ${unresolvedMode === 'removed' ? '컬럼 제거' : '유지(경고)'}` : ''),
    );
    this._post({
      type: 'token',
      content:
        `\n\n> 🧩 **조립 바인딩(실험)**: 참조 스펙으로 \`${bind.typeName}\` 타입 생성 + \`useApi\` 연결 + ` +
        `테이블 셀 재바인딩을 결정론으로 조립했습니다.\n`,
    });
    if (unresolved.length > 0) {
      const list = unresolved.map((c) => `\`${c.headerLabel || c.field}\``).join(', ');
      this._post({
        type: 'token',
        content:
          unresolvedMode === 'removed'
            ? `>\n> 🧹 ${list} 컬럼은 \`${endpoint}\`에 없어 **표에서 제거**했습니다.\n`
            : `>\n> ⚠️ ${list} 컬럼은 \`${endpoint}\` 응답에 **없어 그대로 뒀습니다**(추측하지 않음). ` +
              `남는 타입에러는 직접 처리하거나 다른 엔드포인트를 지정해 주세요.\n`,
      });
    }

    const wrapped = this._wrapCodeBlockAsAxiomAction('```tsx\n' + applied + '\n```', filePath);
    if (!wrapped) return false;
    this._history.push({ role: 'assistant', content: '(조립 바인딩 적용)' });
    await this._handleAxiomAction(wrapped, false, false, undefined, diff);
    return true;
  }

  /** 짧은 단발 모델콜 — 시스템/히스토리 없이 프롬프트 하나만 스트리밍 수집(필드매핑 등 작은 콜). */
  private async _streamCollect(messages: ChatMessage[], config: LlmConfig, timeoutMs: number): Promise<string> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const relay = () => abort.abort();
    this._abortController?.signal.addEventListener('abort', relay, { once: true });
    let out = '';
    try {
      for await (const token of this._llm.streamChat(messages, config, abort.signal)) out += token;
    } catch {
      /* 타임아웃·중단 → 부분/빈 결과 반환(호출부가 빈 매핑으로 안전 처리) */
    } finally {
      clearTimeout(timer);
      this._abortController?.signal.removeEventListener('abort', relay);
    }
    return out;
  }

  /**
   * [실험] 호스트 주도 영역(하이브리드) 편집을 시도한다.
   *  - 확장이 편집 영역을 결정론적으로 찾아 안전 게이트를 통과하면 그 영역만 모델에 보내 재작성하고,
   *    새 훅/import는 structural 삽입해 **최종 전체 파일 텍스트**를 만든다.
   *  - 그 텍스트를 기존 full updateFile 적용 경로(컨펌·React 규칙·쓰기)에 그대로 흘려보낸다.
   *  - 게이트 미통과·의존성 미해소·root-tag 불일치·합성 no-op이면 false → 호출부가 기존 full 흐름으로 폴백.
   *
   * @returns true = 영역 편집으로 처리됨(또는 컨펌 흐름 진입) / false = full 폴백 필요
   */
  private async _tryRegionEdit(filePath: string, query: string, config: LlmConfig): Promise<boolean> {
    // splice는 정확한 ground truth가 필요하다 — 슬라이싱 가능성이 있는 editorCtx.content 대신 디스크를 읽는다.
    let source: string;
    try {
      source = fs.readFileSync(this._resolveWorkspacePath(filePath), 'utf-8');
    } catch {
      return false; // 읽기 실패 → full 폴백
    }
    if (!source.trim()) return false;

    const signal = this._abortController?.signal;
    const callModel = async (system: string, user: string): Promise<string> => {
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      let out = '';
      for await (const token of this._llm.streamChat(messages, config, signal, () => {})) {
        out += token;
      }
      return out;
    };

    // 사용자가 메시지에 명시한 참조 파일(예: /plan/api-spec.md)을 region 경로에도 주입한다.
    // (full 경로는 line 798에서 별도 주입하지만 그건 폴백 이후라, region 모델은 스펙을 못 봐
    //  응답 타입·쿼리 파라미터를 추측 → code_type·category 환각·의존성 폴백을 유발했다.)
    const refResult = await this._loadReferencedFiles(query, filePath);
    if (refResult.block) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 영역편집: 참조 파일 ${refResult.loaded.length}개 주입: ${refResult.loaded.join(', ')}`,
      );
      this._warnUnmatchedApiPaths(refResult.unmatchedApiPaths);
    }

    // 참조(내용 출처) 파일의 import를 심볼→모듈 ground truth로 추출 → 모델의 import 경로 환각 교정용.
    // (예: 출처 파일이 PageHeader를 @axiom/components/layout에서 가져오는데 모델이 @axiom/components/ui로
    //  뭉뚱그릴 때, 출처 기준으로 결정론 교정한다.)
    const referenceImports = buildImportProvenance(refResult.contents);

    // 영역 객관식 disambiguation — 결정론 locate가 추린 후보를 모델이 의미로 고르게 한다(우선순위를
    // 휴리스틱이 보편적으로 못 정하는 문제 해소). 번호만 받는 초경량 호출이라 약한 모델도 안정적이다.
    const disambiguate = async (
      q: string,
      candidates: { startLine: number; endLine: number; label: string; score: number }[],
    ): Promise<{ startLine: number; endLine: number } | null> => {
      try {
        const prompt = buildDisambiguationPrompt(q, candidates);
        const messages: ChatMessage[] = [
          { role: 'system', content: '당신은 코드 편집 영역 선택기입니다. 후보 번호 하나만 숫자로 답하세요. 애매하면 0.' },
          { role: 'user', content: prompt },
        ];
        let out = '';
        for await (const token of this._llm.streamChat(messages, config, signal, () => {})) out += token;
        const pick = parseDisambiguationPick(out, candidates);
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 영역 disambiguation: 후보 ${candidates.length}개 → 모델 응답 ${JSON.stringify(out.trim().slice(0, 20))} → ` +
            (pick ? `선택 "${pick.label}"(${pick.startLine}~${pick.endLine})` : '불확실(휴리스틱 유지)'),
        );
        return pick ? { startLine: pick.startLine, endLine: pick.endLine } : null;
      } catch {
        return null;
      }
    };

    // 검증-교정 루프(Stage 0) — 합성 결과를 적용 직전 VSCode TS 진단으로 검증하고, 새 타입에러가
    // 있으면 모델에게 <replace> 앵커 계약으로 1회 교정시킨다. 플래그 off면 미주입 → 종전 동작.
    const verify = ExtensionConfig.isRegionVerifyEnabled()
      ? (candidateText: string): Promise<{ ok: boolean; errors: string[] }> =>
          this._verifyTextByDiagnostics(filePath, candidateText)
      : undefined;

    this._postStatus('영역 편집 시도 중…');
    const outcome = await runHybridRegionEdit(
      source, query, callModel, refResult.block || undefined, disambiguate, referenceImports, verify,
      ExtensionConfig.isAnchorFirstEditEnabled(),
    );
    this._corpusOutputChannel.appendLine(outcome.diagnostics);
    this._captureRegionCase(query, filePath, source, outcome); // 실패 자동 포집(기본 OFF)

    // region 사퇴 시 UX 분기 — 분류는 단일 정책(classifyRegionDecline)에 위임(계기판과 규칙 동기화).
    if (outcome.status === 'fallback') {
      const ux = classifyRegionDecline(query, source, outcome.reason ?? '');

      // 모호 — 비슷한 구역이 많아 어디인지 불명확. 후보 구역을 제시하며 되묻는다(구역명 재요청 → 복합어 분해 라우팅).
      if (ux === 'reask-ambiguous') {
        const cands = outcome.ambiguousCandidates ?? [];
        const SHOW = 8;
        const list = cands.slice(0, SHOW).map((c) => `\`${c}\``).join(', ');
        const more = cands.length > SHOW ? ` 외 ${cands.length - SHOW}개` : '';
        const example = cands[0] ? `\n>\n> 예: \`${cands[0]}의 ${query.trim()}\`` : '';
        this._post({
          type: 'token',
          content:
            '\n\n---\n> ❓ **어느 영역을 수정할지 모호합니다.**\n>\n' +
            (list
              ? `> 이 화면엔 비슷한 구역이 여럿 있습니다: ${list}${more}.\n>\n> 위 중 **하나를 콕 집어** 다시 요청해 주세요.${example}\n`
              : '> 이 화면엔 비슷한 구역이 여럿 있습니다. **어느 구역인지 명시**해 다시 요청해 주세요(예: "직원관리의 …").\n'),
        });
        this._history.push({ role: 'assistant', content: '(영역 모호 — 구역 명시 요청)' });
        return true; // 되물음으로 처리 완료 — full 폴백/조용한 오편집 안 함
      }

      // 대상 부재 — 지목한 컨트롤이 파일에 0개(수정 의도). 조용한 full+실패 대신 "다른 파일?/추가?" 안내.
      if (ux === 'inform-absent') {
        const tags = impliedControlTags(query);
        this._post({
          type: 'token',
          content:
            '\n\n---\n> ⚠️ **이 파일에서 수정할 대상을 찾지 못했습니다.**\n>\n' +
            `> 요청하신 \`${tags.join('/')}\` 컨트롤이 현재 파일 \`${filePath}\` 에 하나도 없습니다.\n>\n` +
            '> · 수정하려는 화면이 **다른 파일**일 수 있어요 — 그 파일을 열고 다시 요청해 주세요.\n' +
            '> · 새로 **추가**하려는 거면 "…을 추가해줘"라고 말씀해 주세요(그러면 새로 만듭니다).\n',
        });
        this._history.push({ role: 'assistant', content: '(대상 컨트롤 부재 — 파일 확인 요청)' });
        return true; // 알림으로 처리 완료 — 조용한 full 폴백/실패 안 함
      }
      // ux === 'full' → 아래 기존 full 입력 흐름으로 폴백
    }

    if (outcome.status !== 'applied' || !outcome.finalText) {
      // 경로 수렴(핸드오프 §6 ④) — "위치는 맞게 찾았으나 모델이 산출물을 망가뜨린"(content-loss·root-tag·
      // 빈출력·앵커미해소) fallback이면, 곧장 약한 full 재생성으로 떨어지지 않고 **실제 영역 텍스트만으로**
      // surgical patch를 1회 grounded 재요청한다(patch/lines 재시도와 동일 철학). 성공하면 처리 완료.
      if (await this._tryGroundedRegionRetry(filePath, outcome)) return true;
      // fallback/error → 기존 full 입력 흐름으로 (조용한 파손 대신 안전)
      return false;
    }

    // 합성 결과(source→finalText) diff를 디스크 기준으로 계산한다. 이 diff를 확인 카드에 직접
    // 넘겨(_handleAxiomAction의 precomputedDiff) 카드가 '무엇이 바뀌는지'를 보여주게 한다.
    // (예전엔 여기서 인라인 ```diff 블록을 따로 렌더했는데, 확인 카드가 열린 에디터 버퍼 기준으로
    //  재계산하다 정규화 mismatch로 빈 diff가 돼 카드엔 안 보였다 → 인라인으로 보상. 이제 카드가
    //  정확한 diff를 받으므로 인라인 중복 렌더는 제거하고, 변경 없음일 때만 사유를 안내한다.)
    const regionDiff = computeDiffHunks(source, outcome.finalText);
    if (regionDiff.length === 0) {
      // no-op → 빈 diff 확인 카드를 만들지 않고 종료(처리 완료로 간주). 카드를 만들면 아래 _handleAxiomAction
      // 의 convergence 가드가 다시 잡지만, 여기서 끝내는 편이 중복 안내 없이 깔끔하다.
      this._post({
        type: 'token',
        content: '\n\n> ℹ️ **영역 편집 결과가 현재 파일과 동일합니다** — 변경 없음(이미 적용된 상태일 수 있습니다).\n',
      });
      return true;
    }

    // 최종 전체 파일을 full updateFile로 래핑해 기존 적용 파이프라인에 흘려보낸다.
    const wrapped = this._wrapCodeBlockAsAxiomAction('```tsx\n' + outcome.finalText + '\n```', filePath);
    if (!wrapped) return false;

    this._post({
      type: 'token',
      content: `\n\n> 🧩 **영역 편집(실험)**: 편집 영역만 모델에 보내 재작성했습니다. ${outcome.diagnostics.replace('[regionEdit] ', '')}\n`,
    });
    this._history.push({ role: 'assistant', content: '(영역 편집 적용)' });
    await this._handleAxiomAction(wrapped, false, false, undefined, regionDiff);
    return true;
  }

  /**
   * 합성된 편집 결과를 적용 전에 VSCode TS 언어서버 진단으로 검증한다(Stage 0 검증 루프의 "눈").
   *
   * 디스크/열린 버퍼를 건드리지 않으려고 **같은 폴더에 임시 형제 파일**을 만들어 진단을 받는다
   * (상대 import·tsconfig paths가 원본과 동일하게 해소됨). Vite 등 번들러는 import 안 된 파일을
   * 처리하지 않아 실행 중 앱 HMR에 영향이 없다. 진단을 못 얻으면(타임아웃·서버 부재) fail-open
   * (ok:true)으로 **절대 편집을 막지 않는다**. 원본 파일이 이미 가진 에러(편집 무관)는 baseline으로
   * 빼고 새 에러만 반환한다. 반환 항목은 `"L:C 메시지"`(verify 콜백 계약).
   */
  private async _verifyTextByDiagnostics(filePath: string, candidateText: string): Promise<{ ok: boolean; errors: string[] }> {
    let tmpPath = '';
    try {
      const absPath = this._resolveWorkspacePath(filePath);
      const dir = path.dirname(absPath);
      const ext = path.extname(absPath) || '.tsx';
      tmpPath = path.join(dir, `__axiom_verify_${process.pid}_${Date.now()}${ext}`);

      // baseline — 원본이 이미 가진 에러(편집과 무관)는 제외한다. 파일이 열려 있으면 즉시 구해진다.
      const baseMsgs = new Set(
        vscode.languages.getDiagnostics(vscode.Uri.file(absPath))
          .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
          .map((d) => d.message),
      );

      fs.writeFileSync(tmpPath, candidateText, 'utf-8');
      const uri = vscode.Uri.file(tmpPath);
      await vscode.workspace.openTextDocument(uri); // TS 서버 분석 트리거
      const diags = await this._collectDiagnostics(uri, 5000);
      const errors = diags
        .filter((d) => d.severity === vscode.DiagnosticSeverity.Error && !baseMsgs.has(d.message))
        .map((d) => `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`);
      return { ok: errors.length === 0, errors };
    } catch {
      return { ok: true, errors: [] }; // fail-open — 검증 불가가 편집을 막지 않게
    } finally {
      if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch { /* noop */ } }
    }
  }

  /**
   * 주어진 URI의 진단이 "안정될 때까지" 기다렸다 반환한다. onDidChangeDiagnostics를 구독해 변경 후
   * QUIET 동안 추가 변경이 없으면 확정, 또는 하드 타임아웃에 현재 진단을 반환한다. (TS 서버는 구문→
   * 의미 진단을 여러 배치로 내보내므로 첫 배치만 보면 에러를 놓친다.)
   */
  private _collectDiagnostics(uri: vscode.Uri, timeoutMs: number): Promise<vscode.Diagnostic[]> {
    return new Promise((resolve) => {
      const QUIET = 600;
      const start = Date.now();
      const target = uri.toString();
      let lastChange = 0;
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        sub.dispose();
        clearInterval(timer);
        resolve(vscode.languages.getDiagnostics(uri));
      };
      const sub = vscode.languages.onDidChangeDiagnostics((e) => {
        if (e.uris.some((u) => u.toString() === target)) lastChange = Date.now();
      });
      const timer = setInterval(() => {
        const now = Date.now();
        if (now - start > timeoutMs) return finish();
        if (lastChange > 0 && now - lastChange > QUIET) return finish();
      }, 150);
    });
  }

  // ─── axiom-action ────────────────────────────────────────────────────────────

  /**
   * axiom-action 블록을 파싱하여 파일을 생성/수정한다.
   * @returns 라우터 관련 액션이 성공적으로 처리되었으면 true
   */
  private async _handleAxiomAction(
    response: string,
    forcePageAutoWrite = false,
    groundedRetryDone = false,
    carryPatches?: PatchBlock[],
    /**
     * region 편집 등 호출부가 이미 정확한 diff(디스크 기준)를 계산해 둔 경우 그걸 그대로 쓴다.
     * 여기서 originalContent는 '열린 에디터 버퍼'라, 디스크에서 합성한 finalText와 EOL/들여쓰기
     * 정규화가 어긋나면 1만 줄 파일이 통째로 바뀐 것처럼 보여 computeDiffHunks가 MAX_LINES 가드로
     * 빈 배열을 반환한다(확인 카드 diff 사라짐). 호출부가 단일 액션 응답일 때만 넘긴다.
     */
    precomputedDiff?: DiffLine[],
  ): Promise<boolean> {
    const blockRegex = /<axiom-action>([\s\S]*?)<\/axiom-action>/g;
    const actions: AxiomAction[] = [];
    const blockMatches = [...response.matchAll(blockRegex)];
    this._corpusOutputChannel.appendLine(`[Axiom AI] _handleAxiomAction: 블록 수=${blockMatches.length}`);

    // 게이트는 통과했는데 완결된 <axiom-action>…</axiom-action> 쌍이 하나도 없는 경우.
    // (예: 모델 응답이 잘려 닫는 태그가 빠짐) 이전에는 for 루프가 그냥 skip되어 diff·에러·재시도
    // 어느 것도 없이 무음 정지했다 → 사용자가 "결과 확인 못 하고 멈춤"을 겪는 지점.
    // 무처리로 끝내지 말고 chat창에 원인과 상황을 명시한다.
    if (blockMatches.length === 0) {
      const hasOpenTag = response.includes('<axiom-action>');
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] ⚠️ 처리할 axiom-action 블록 없음 (여는 태그 ${hasOpenTag ? '있음 → 닫는 </axiom-action> 누락(응답 잘림)' : '없음'})`,
      );
      this._post({
        type: 'token',
        content:
          '\n\n---\n> ⚠️ **파일 수정을 적용하지 못했습니다.**\n>\n' +
          (hasOpenTag
            ? '> 모델이 `<axiom-action>` 블록을 끝까지 출력하지 못했습니다 — 닫는 `</axiom-action>` 태그가 없어 응답이 중간에 잘린 것으로 보입니다.\n'
            : '> 모델 응답에서 완결된 `<axiom-action>` 코드 블록을 찾지 못했습니다.\n') +
          '>\n> 다시 시도하거나, 요청을 더 작은 단위로 나눠 보내주세요.\n',
      });
      return false;
    }

    for (const blockMatch of blockMatches) {
      const blockContent = blockMatch[1];
      const jsonMatch = blockContent.match(/(\{[^`]*?\})/s);
      if (!jsonMatch) {
        this._corpusOutputChannel.appendLine(`[Axiom AI] ⚠️ axiom-action JSON 메타데이터 파싱 실패\n블록: ${blockContent.substring(0, 200)}`);
        this._post({ type: 'fileError', message: 'axiom-action JSON 메타데이터를 찾을 수 없습니다.' });
        continue;
      }

      let action: AxiomAction;
      try {
        action = JSON.parse(jsonMatch[1].trim()) as AxiomAction;
        this._corpusOutputChannel.appendLine(`[Axiom AI] axiom-action 파싱 성공: ${JSON.stringify(action)}`);
      } catch {
        this._corpusOutputChannel.appendLine(`[Axiom AI] ⚠️ axiom-action JSON 파싱 오류: ${jsonMatch[1].substring(0, 200)}`);
        this._post({ type: 'fileError', message: 'axiom-action JSON 파싱에 실패했습니다.' });
        continue;
      }

      // 약한 모델이 시스템 프롬프트의 예시 자리표시자(`[ComponentName].tsx` 등)를 그대로
      // filePath에 베껴 넣으면 실재하지 않는 경로를 읽으려다 "파일을 읽을 수 없습니다"로 데드엔드가 난다.
      // 선택/현재 파일 수정은 정의상 지금 열린 파일이 대상이므로, 자리표시자가 끼면 활성 에디터 경로로 핀 고정한다.
      if (action.filePath && /[\[\]]/.test(action.filePath)) {
        const activeDoc = vscode.window.activeTextEditor?.document;
        const activeRel = activeDoc
          ? vscode.workspace.asRelativePath(activeDoc.uri).replace(/\\/g, '/')
          : undefined;
        if (activeRel && !/[\[\]]/.test(activeRel)) {
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] 🔧 filePath 자리표시자 감지("${action.filePath}") → 활성 파일로 교체: ${activeRel}`,
          );
          action.filePath = activeRel;
        } else {
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] ⚠️ filePath 자리표시자("${action.filePath}")인데 활성 파일을 못 찾음 — 수정 중단`,
          );
          this._post({
            type: 'fileError',
            message: `수정 대상 파일 경로가 확정되지 않았습니다(자리표시자 \`${action.filePath}\`). 수정할 파일을 열고 다시 시도해주세요.`,
          });
          continue;
        }
      }

      // 페이지 생성 플로우에서는 InputBox 없이 자동 저장
      if (forcePageAutoWrite && action.templateType === 'page') {
        action.autoWrite = true;
      }

      // 약한 모델이 닫는 태그를 틀리면(예: <replace> 블록을 </replace> 대신 </search>로 닫음)
      // 비탐욕 캡처가 잘못 들어간 제어 태그 줄까지 본문(코드)으로 빨아들여 파일에 누수된다.
      // search/replace 본문에는 제어 태그가 단독 줄로 등장할 일이 없으므로 결정론적으로 제거한다.
      const stripControlTagLines = (s: string): string =>
        s
          .split('\n')
          .filter((ln) => !/^\s*<\/?(?:search|replace|patch)>\s*$/.test(ln))
          .join('\n')
          .replace(/\n$/, '');

      // `<replace>` 관용 캡처: 약한 모델이 `</replace>`를 `</search>`·`</patch>`로 잘못 닫는 일이 잦다
      // (실측 2026-07-02: 400줄 EmployeeListPage 테이블 편집에서 3/3 mis-close → replace 미매칭 → patch 통째 드롭
      // → block-no-payload로 무편집). `</replace>`가 있으면 그대로, 없으면 `<replace>` 여는 태그 이후 ~ `</patch>`/
      // 세그먼트 끝까지를 본문으로 보고 stripControlTagLines로 새는 제어 태그 줄을 걷어낸다.
      const extractReplace = (segment: string): string | undefined => {
        const closed = segment.match(/<replace>\n?([\s\S]*?)<\/replace>/);
        if (closed?.[1] !== undefined) return closed[1];
        const openIdx = segment.indexOf('<replace>');
        if (openIdx === -1) return undefined;
        let body = segment.slice(openIdx + '<replace>'.length).replace(/^\n/, '');
        const endIdx = body.indexOf('</patch>');
        if (endIdx !== -1) body = body.slice(0, endIdx);
        return body;
      };

      // 1차: <patch> 래핑된 다중 쌍 파싱
      const patchBlockMatches = [...blockContent.matchAll(/<patch>\s*([\s\S]*?)\s*<\/patch>/g)];
      if (patchBlockMatches.length > 0) {
        const patches: { search: string; replace: string }[] = [];
        for (const pb of patchBlockMatches) {
          const inner = pb[1];
          const s = inner.match(/<search>\n?([\s\S]*?)<\/search>/);
          const rBody = extractReplace(inner);
          if (s?.[1] !== undefined && rBody !== undefined) {
            patches.push({
              search: stripControlTagLines(s[1].replace(/\n$/, '')),
              replace: stripControlTagLines(rBody.replace(/\n$/, '')),
            });
          }
        }
        if (patches.length > 0) {
          action.patches = patches;
        }
      }

      // 2차: <patch> 래핑이 없으면 bare <search>/<replace> 단일 쌍 (구 포맷 하위 호환)
      if (!action.patches) {
        const searchMatch = blockContent.match(/<search>\n?([\s\S]*?)<\/search>/);
        const replaceBody = extractReplace(blockContent);
        if (searchMatch?.[1] !== undefined && replaceBody !== undefined) {
          action.patches = [{
            search: stripControlTagLines(searchMatch[1].replace(/\n$/, '')),
            replace: stripControlTagLines(replaceBody.replace(/\n$/, '')),
          }];
        }
      }

      // 2.5차: grounded 재시도의 "성공분 carry" — 이미 원본에 매칭된 patch는 모델에 재출력시키지
      // 않고(약한 모델이 멀쩡한 patch를 망치는 것 방지) 여기서 그대로 앞에 합친다. 모델은 실패 region만
      // 다시 냈고, carryPatches는 직전 computeMultiPatch에서 성공한 원본 PatchBlock이다. 둘을 합쳐
      // computeMultiPatch를 재실행하면 — 성공분은 (파일 불변이라) 다시 매칭되고 실패분만 새로 풀린다.
      // 쓰기 atomic·겹침 검증은 그대로 적용되므로 부분 적용으로 인한 깨진 파일은 생기지 않는다.
      // 모델이 patch 모드를 유지했을 때만 합친다(full로 응답하면 그 자체가 완결된 전체 파일).
      if (carryPatches && carryPatches.length > 0 && action.patches) {
        action.patches = [...carryPatches, ...action.patches];
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] grounded 재시도: 성공분 ${carryPatches.length}개 carry + 실패분 재요청 ${action.patches.length - carryPatches.length}개 → 합쳐 ${action.patches.length}개로 재적용`,
        );
      }

      // 3차: structural 조각 — <hook>/<import> 파싱 (약한 모델용 결정론적 삽입).
      //  - patch와 함께 오면 → **혼용 모드**: 국소/선택 변경은 patch가, import·훅·타입 등 부수 삽입은
      //    structural이 담당한다(아래 patch 적용부에서 patch를 적용한 뒤 결정론적으로 끼움). mode는 patch 유지.
      //    선택 영역의 in-place 수정(patch)과 선택 밖 부수 삽입(structural)을 한 응답에서 함께 처리하는 핵심.
      //  - patch 없이 structural만 → 단독 structural 모드. 단, 선택이 활성이면 선택을 건드릴 수단이 없으므로
      //    (structural은 위치를 구조 앵커로만 정해 선택을 무시) 종전대로 억제한다.
      let suppressedStructuralForSelection = false;
      {
        const hookMatches = [...blockContent.matchAll(/<hook>\n?([\s\S]*?)<\/hook>/g)];
        const importMatches = [...blockContent.matchAll(/<import\b([^>]*?)\/?>/g)];
        if (hookMatches.length > 0 || importMatches.length > 0) {
          const hookCode = hookMatches
            .map((m) => m[1].replace(/\n+$/, ''))
            .filter((c) => c.trim())
            .join('\n') || undefined;
          const imports = importMatches
            .map((m) => this._parseImportTag(m[1]))
            .filter((x): x is ImportRequest => x !== null);

          if (action.patches) {
            // 혼용 모드 — patch 곁의 보조 삽입. mode는 patch로 두고 structural만 첨부한다.
            action.structural = { hookCode, imports: imports.length ? imports : undefined };
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 혼용 모드 (${action.filePath}): patch ${action.patches.length}개 + structural 보조 삽입 ` +
                `(hook ${hookCode ? '있음' : '없음'}, import ${imports.length}개)`,
            );
          } else if (this._lastSelectionLineRange) {
            suppressedStructuralForSelection = true;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⚠️ 선택 영역 활성 + patch 없음 — structural 단독 응답을 무시 (${action.filePath}). ` +
                `선택을 건드릴 patch가 없어 부수 삽입만 적용하면 의도가 누락됨.`,
            );
          } else {
            action.structural = { hookCode, imports: imports.length ? imports : undefined };
            action.mode = 'structural';
          }
        }
      }

      // 4차: lines 모드 — <edit from/to/after anchor>...</edit> 라인 앵커(출력 최소화).
      // patch·structural가 없을 때만 시도 (모드 혼용 방지).
      if (!action.patches && !action.structural) {
        const editMatches = [...blockContent.matchAll(/<edit\b([^>]*)>\n?([\s\S]*?)<\/edit>/g)];
        if (editMatches.length > 0) {
          const lineEdits: LineEdit[] = [];
          for (const em of editMatches) {
            const attrs = em[1];
            const content = em[2].replace(/\n$/, '');
            const num = (name: string): number | undefined => {
              const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`));
              return m ? parseInt(m[1], 10) : undefined;
            };
            const anchorM = attrs.match(/\banchor\s*=\s*"([^"]*)"/) ?? attrs.match(/\banchor\s*=\s*'([^']*)'/);
            const edit: LineEdit = {
              from: num('from'),
              to: num('to'),
              after: num('after'),
              content,
              anchor: anchorM ? anchorM[1] : undefined,
            };
            // from(치환) 또는 after(삽입) 중 하나는 있어야 유효
            if (edit.from !== undefined || edit.after !== undefined) lineEdits.push(edit);
          }
          if (lineEdits.length > 0) {
            action.lineEdits = lineEdits;
            action.mode = 'lines';
          }
        }
      }

      const codeMatch = blockContent.match(/```(?:[a-z]*)\n([\s\S]*?)```/);
      // lines 모드면 <edit> 내부에 우연히 들어간 코드펜스를 full 코드로 오인하지 않는다.
      if (codeMatch?.[1] && action.mode !== 'lines') action.generatedCode = codeMatch[1].trimEnd();

      // 선택 영역이 있어 structural 응답을 버렸는데 대체할 full 코드도 없으면,
      // 빈 generatedCode로 파일을 덮어쓰는 사고(아래 컨펌·쓰기 경로)를 막고
      // 복구 UI(Full로 재시도)로 보낸다. Full 재시도는 현재 파일을 진실의 원천으로
      // 삼아 선택 영역을 직접 수정할 수 있다.
      if (suppressedStructuralForSelection && !action.patches && !action.generatedCode) {
        this._post({
          type: 'token',
          content:
            '\n\n> ⚠️ **선택 영역은 구조 삽입(structural) 모드로 수정할 수 없습니다.** ' +
            '모델이 선택 영역 대신 컴포넌트 구조에 코드를 삽입하는 형식으로 응답했습니다. ' +
            '아래 **Full로 재시도**를 누르면 현재 파일 기준으로 선택 영역을 직접 수정합니다.\n',
        });
        this._reportPatchFailure(action.filePath, [
          '[structural-suppressed-for-selection] 선택 영역이 활성일 때는 patch/full 모드로만 수정합니다.',
        ]);
        continue;
      }

      // full 모드 updateFile TSX/TS → React 규칙 위반 조기 차단
      if (
        action.mode !== 'patch' &&
        action.mode !== 'lines' &&
        action.action === 'updateFile' &&
        action.generatedCode &&
        /\.(tsx|ts)$/.test(action.filePath)
      ) {
        const violation = FileCreatorService.detectReactRuleViolations(action.generatedCode);
        if (violation) {
          // 1차: 모듈 스코프 훅을 컴포넌트 본문으로 결정적 이동(auto-hoist) — 모델 재호출·토큰 0.
          const hoist = FileCreatorService.hoistModuleScopeHooks(action.generatedCode);
          if (hoist) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 🔧 auto-hoist (${action.filePath}): 모듈 스코프 훅 ${hoist.hoisted.length}건을 컴포넌트 본문으로 이동`,
            );
            this._post({
              type: 'token',
              content: `\n\n> 🔧 컴포넌트 함수 밖(모듈 최상위)에 생성된 훅 ${hoist.hoisted.length}건을 본문 안으로 자동 이동하고 중복을 제거했습니다.\n`,
            });
            action.generatedCode = hoist.text;
          } else {
            // 결정적 교정 불가 → dead-end 대신 "Full로 재시도" 회복 버튼 제공.
            this._reportReactViolation(action.filePath, violation);
            continue;
          }
        }
      }

      actions.push(action);
    }

    // 같은 filePath에 대한 중복 블록 제거: 첫 번째 action 타입 유지, 마지막 코드 사용
    const deduped = new Map<string, AxiomAction>();
    for (const action of actions) {
      const existing = deduped.get(action.filePath);
      if (existing) {
        this._corpusOutputChannel.appendLine(`[Axiom AI] ⚠️ 중복 axiom-action 감지 (${action.filePath}), 두 번째 블록 코드만 반영`);
        deduped.set(action.filePath, { ...existing, generatedCode: action.generatedCode });
      } else {
        deduped.set(action.filePath, action);
      }
    }
    const uniqueActions = [...deduped.values()];

    if (uniqueActions.length === 0) return false;

    let routerProcessed = false;

    for (const action of uniqueActions) {
      // updateFile 중 router/autoWrite 아닌 경우 → 컨펌 플로우
      const needsConfirm =
        action.action === 'updateFile' &&
        action.templateType !== 'router' &&
        !action.autoWrite;

      if (needsConfirm) {
        const { originalContent, error: readError } = await this._fileCreator.readFileContent(action);
        if (readError) {
          this._post({ type: 'fileError', message: readError });
          break;
        }

        // structural 모드: <hook>/<import> 조각을 splitTsSections 기준으로 결정론적 삽입.
        // 모델이 위치·search 텍스트를 만들지 않아도 되므로 약한 sLLM의 매칭 실패가 구조적으로 사라진다.
        if (action.mode === 'structural' && action.structural) {
          if (!originalContent) {
            this._post({ type: 'fileError', message: `파일을 읽을 수 없습니다: ${action.filePath}` });
            break;
          }
          const res = applyStructuralEdit(originalContent, action.structural);
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] structural 적용 (${action.filePath}):\n  ${res.changes.join('\n  ')}`,
          );
          if (res.text === originalContent) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⚠️ structural no-op (${action.filePath}) — 컴포넌트 미검출 또는 이미 존재`,
            );
            this._post({
              type: 'token',
              content:
                '\n\n> ⚠️ **삽입이 적용되지 않았습니다** (변경 없음). export default 컴포넌트를 찾지 못했거나 ' +
                '추가하려는 항목이 이미 존재합니다. patch 또는 full 모드로 다시 시도해보세요.\n',
            });
            this._reportPatchFailure(action.filePath, [`[structural no-op]\n${res.changes.join('\n')}`]);
            break;
          }
          let finalText = res.text;
          // 삽입 결과가 새 React 규칙 위반을 만들면(이론상 드묾) 결정적 교정 후, 실패 시 회복 버튼.
          if (/\.(tsx|ts)$/.test(action.filePath)) {
            const before = FileCreatorService.detectReactRuleViolations(originalContent);
            const after = FileCreatorService.detectReactRuleViolations(finalText);
            if (!before && after) {
              const hoist = FileCreatorService.hoistModuleScopeHooks(finalText);
              if (hoist) {
                finalText = hoist.text;
              } else {
                this._reportReactViolation(action.filePath, after);
                break;
              }
            }
          }

          // 의존성 폐쇄 게이트: 삽입 조각이 참조하는 타입·훅이 최종 파일에서 전부 해소되는지 검증.
          // 예) useApi<TFoo>를 넣었는데 useApi import·TFoo 선언이 없으면 컴파일이 깨지는 출력이므로
          //     디스크에 쓰지 않고 거부한다. structural은 top-level 선언을 표현할 수 없어 자주 발생한다.
          let dep = findUnresolvedReferences(action.structural.hookCode ?? '', finalText);
          if (!dep.ok) {
            // 자동 보강: 미해소 심볼 중 import 경로가 고정된 스캐폴드 표준 훅(useApi 등)은
            // 모델이 <import>를 빠뜨렸어도 확장이 결정론적으로 import를 주입해 통과시킨다.
            // 임의 타입(TFoo 등)은 보강 불가 — 재검사 후에도 남으면 그대로 거부한다.
            const autoImports = resolveKnownImports(dep.unresolved);
            if (autoImports.length > 0) {
              const patched = applyStructuralEdit(finalText, { imports: autoImports });
              finalText = patched.text;
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔧 structural import 자동 보강 (${action.filePath}):\n  ${patched.changes.join('\n  ')}`,
              );
              dep = findUnresolvedReferences(action.structural.hookCode ?? '', finalText);
            }
          }
          // 빠진 top-level 타입 선언(예: TEmployee)만 결정론적으로 채워 넣어 **full 전체 재생성을 회피**한다.
          // structural은 top-level 타입을 표현 못 해, 약한 모델이 useApi<TFoo> 훅만 내고 TFoo 선언을 빠뜨리면
          // 여기 걸린다(프롬프트로 "타입도 내라" 유도해도 약한 모델은 자주 누락 — 실측). full로 통째 재생성하는
          // 대신 **그 타입 선언만** 짧게 재요청해 모듈 스코프에 주입하면 surgical 편집을 유지한다.
          // 실패(타입 후보 없음·모델 무응답·주입 후에도 미해소)면 그대로 아래 기존 full 폴백으로 떨어진다(회귀 0).
          if (!dep.ok && !groundedRetryDone) {
            const typeDecls = await this._retryStructuralMissingTypes(
              dep.unresolved,
              ExtensionConfig.getEffectiveLlmConfig(),
            );
            if (typeDecls) {
              const injected = applyStructuralEdit(finalText, { hookCode: typeDecls });
              const recheck = findUnresolvedReferences(action.structural.hookCode ?? '', injected.text);
              if (recheck.ok) {
                finalText = injected.text;
                dep = recheck;
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] ✅ 빠진 타입 선언 주입으로 의존성 해소 — full 폴백 없이 structural 유지 (${action.filePath})`,
                );
                this._post({
                  type: 'token',
                  content: `\n\n> 🔧 **빠진 타입 선언을 채워 넣었습니다** — 전체 파일 재생성 없이 필요한 부분만 반영합니다.\n`,
                });
              } else {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] ⚠️ 타입 선언 주입 후에도 의존성 미해소 (${action.filePath}): ${recheck.unresolved.join(', ')} → full 폴백`,
                );
              }
            }
          }
          if (!dep.ok) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⛔ structural 의존성 미해소 (${action.filePath}): ${dep.unresolved.join(', ')}`,
            );
            // 자동 복구(문서 ④ — dead-end 금지) — structural은 top-level 타입 선언을 표현 못 해, 모델이
            // useApi<TFoo> 훅만 내고 TFoo 선언을 빠뜨리면 여기 걸린다. 사용자에게 "Full로 재시도"를 미루지
            // 말고, 그 버튼이 하던 일(full 모드로 타입·import까지 통째 재생성)을 **1회 자동 수행**한다.
            // 첫 패스(groundedRetryDone=false)에서만 — 재시도 결과가 또 걸리면 루프 방지 위해 카드로 폴백.
            if (!groundedRetryDone) {
              this._post({
                type: 'token',
                content:
                  `\n\n> 🔁 **삽입에 필요한 타입 선언(\`${dep.unresolved.join('`, `')}\`)이 빠져 ` +
                  `full 모드로 자동 재생성합니다…**\n`,
              });
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔁 structural 의존성 미해소 → full 자동 재시도 (${action.filePath}): ${dep.unresolved.join(', ')}`,
              );
              const fbConfig = ExtensionConfig.getEffectiveLlmConfig();
              const retry = await this._retryForAxiomAction(action.filePath, fbConfig, { forceFull: true });
              if (retry) {
                await this._handleAxiomAction(retry, false, true);
                break;
              }
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] full 자동 재시도 응답 없음 → 사용자 선택 카드로 폴백 (${action.filePath})`,
              );
            }
            this._post({
              type: 'token',
              content:
                `\n\n> ⛔ **삽입을 취소했습니다.** 추가하려는 코드가 사용하는 ` +
                `\`${dep.unresolved.join('`, `')}\` 의 선언/import가 결과 파일에 없어 ` +
                `그대로 적용하면 컴파일이 깨집니다.\n>\n> 타입 선언과 import까지 함께 넣어야 하므로 ` +
                `**full 모드로 다시 시도**해 주세요.\n`,
            });
            this._reportPatchFailure(action.filePath, [
              `[structural 의존성 미해소] 미해소 심볼: ${dep.unresolved.join(', ')}`,
            ]);
            break;
          }
          action.generatedCode = finalText;
        }

        // lines 모드: 라인 앵커 edit을 원본에 적용해 generatedCode를 미리 계산.
        // 라인번호 드리프트는 anchor로 자동 보정, 적용 실패 시 full 모드로 자동 폴백.
        if (action.mode === 'lines' && action.lineEdits && action.lineEdits.length > 0) {
          if (!originalContent) {
            this._post({ type: 'fileError', message: `파일을 읽을 수 없습니다: ${action.filePath}` });
            break;
          }
          const le = ExtensionConfig.getLineEditConfig();
          const lr = this._fileCreator.computeLineEdits(originalContent, action.lineEdits, {
            requireAnchor: le.requireAnchor,
            anchorSearchRadius: le.anchorSearchRadius,
          });
          if (lr.text === null) {
            // grounded bounded retry(lines) — patch 모드와 동일하게, 앵커 실패 부분을 실제 파일 텍스트로
            // grounding해 1회만 surgical 재요청한다. 곧장 full 재생성으로 떨어지면 약한 full 경로의 위험
            // (느림·내용 누락)을 그대로 떠안으므로, "다시 읽고 정확히 재인용"을 먼저 시도한다(=Claude Code 방식).
            // grounding 불가·부분 성공이면 false → 종전 full 폴백(회귀 0).
            if (await this._tryGroundedLineEditRetry(action, originalContent, lr.results, groundedRetryDone)) {
              break;
            }
            const failureSummary = lr.results
              .filter((r) => !r.success)
              .map((r) => `#${r.index + 1}:${r.reason}`)
              .join(', ');
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⚠️ line-edit 실패 (${action.filePath}): ${failureSummary} → full 모드로 자동 폴백`,
            );
            this._post({
              type: 'token',
              content: `\n\n> ⚠️ **라인 앵커 적용 실패** (${failureSummary}). 현재 파일을 기준으로 전체를 다시 받아 적용합니다.\n`,
            });
            // 자동 폴백: 현재 파일 기준 full 모드 재생성 → 재귀 처리.
            // full은 결정적으로 적용되므로 lines 실패로 재귀가 무한 반복되지 않는다.
            const fbConfig = ExtensionConfig.getEffectiveLlmConfig();
            const retry = await this._retryForAxiomAction(action.filePath, fbConfig, { forceFull: true });
            if (retry) await this._handleAxiomAction(retry);
            break;
          }

          // 선택 영역 가드: 변경 라인이 선택 영역 ±1 밖이면 거부 (순수 import 삽입은 면제).
          if (this._lastSelectionLineRange) {
            const sel = this._lastSelectionLineRange;
            const PADDING = 1;
            const isImportOnly = (c: string) =>
              c.split('\n').every((l) => l.trim() === '' || /^\s*import\s/.test(l));
            const violating = lr.results
              .filter((r) => r.success)
              .filter((r) => {
                const edit = action.lineEdits?.[r.index];
                if (edit && isImportOnly(edit.content)) return false;
                const s = r.startLine ?? 0;
                const e = r.endLine ?? s;
                return e < sel.startLine - PADDING || s > sel.endLine + PADDING;
              });
            if (violating.length > 0) {
              const lineNums = violating
                .map((r) => `${r.startLine}~${r.endLine}`)
                .join(', ');
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ❌ 선택 영역 위반 거부 (선택 ${sel.startLine}~${sel.endLine}): line-edit ${lineNums}`,
              );
              this._post({
                type: 'token',
                content:
                  `\n\n> ❌ **선택 영역 위반으로 거부됨**: 선택한 라인은 **${sel.startLine}~${sel.endLine}** 인데, ` +
                  `수정이 라인 **${lineNums}** 에 적용되려 했습니다. **Full로 재시도**를 선택하거나 라인 번호를 명시해 다시 요청하세요.\n`,
              });
              this._reportPatchFailure(
                action.filePath,
                violating.map((r) => `[#${r.index + 1} selection-mismatch] 라인 ${r.startLine}~${r.endLine}`),
              );
              break;
            }
          }

          // React 규칙 검증 — patch 분기와 동일하게 "새로 생긴 위반"만 차단.
          let linesText = lr.text;
          if (/\.(tsx|ts)$/.test(action.filePath)) {
            const before = FileCreatorService.detectReactRuleViolations(originalContent);
            const after = FileCreatorService.detectReactRuleViolations(linesText);
            if (!before && after) {
              const hoist = FileCreatorService.hoistModuleScopeHooks(linesText);
              if (hoist) {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 🔧 auto-hoist (${action.filePath}): line-edit 결과의 모듈 스코프 훅 ${hoist.hoisted.length}건 이동`,
                );
                linesText = hoist.text;
              } else {
                this._reportReactViolation(action.filePath, after);
                break;
              }
            }
          }
          action.generatedCode = linesText;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] line-edit 적용 완료 (${action.filePath}, ${action.lineEdits.length}개 edit)`,
          );
        }

        // patch 모드: 다중 patch를 원본 파일에 동시 적용해 generatedCode를 미리 계산
        if (action.mode === 'patch' && action.patches && action.patches.length > 0) {
          if (!originalContent) {
            this._post({ type: 'fileError', message: `파일을 읽을 수 없습니다: ${action.filePath}` });
            break;
          }
          const mp = this._fileCreator.computeMultiPatch(originalContent, action.patches, this._lastSelectionLineRange);
          if (mp.text === null) {
            // grounded bounded retry — 실패 search를 실제 파일 위치에 fuzzy 매칭해 그 실제 텍스트를
            // 모델에 돌려주고 1회만 재요청한다. 성공하면 재귀 처리되므로 dead-end UI를 건너뛴다.
            if (await this._tryGroundedPatchRetry(action, originalContent, mp, groundedRetryDone)) {
              break;
            }
            const failureSummary = mp.results
              .filter((r) => !r.success)
              .map((r) => `#${r.index + 1}:${r.reason}`)
              .join(', ');
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⚠️ multi-patch 실패 (${action.filePath}): ${failureSummary}`,
            );
            // 진단: 실패한 patch별로 search 내용과 선택 영역 주변 원본을 diff용으로 dump
            const origLines = originalContent.replace(/\r\n/g, '\n').split('\n');
            const sel = this._lastSelectionLineRange;
            for (const r of mp.results.filter((x) => !x.success)) {
              const p = action.patches?.[r.index];
              if (!p) continue;
              this._corpusOutputChannel.appendLine(
                `\n[Axiom AI] === patch #${r.index + 1} ${r.reason} 진단 ===`,
              );
              this._corpusOutputChannel.appendLine(`--- 모델이 출력한 <search> (${p.search.split('\n').length}줄) ---`);
              p.search.split('\n').forEach((ln, idx) => {
                this._corpusOutputChannel.appendLine(`SEARCH[${idx + 1}]: ${JSON.stringify(ln)}`);
              });
              if (sel) {
                const from = Math.max(0, sel.startLine - 5);
                const to = Math.min(origLines.length - 1, sel.endLine + 5);
                this._corpusOutputChannel.appendLine(
                  `--- 원본 파일 라인 ${from + 1}~${to + 1} (선택 영역 ${sel.startLine}~${sel.endLine} 주변) ---`,
                );
                for (let i = from; i <= to; i++) {
                  this._corpusOutputChannel.appendLine(`ORIG[${i + 1}]: ${JSON.stringify(origLines[i])}`);
                }
              }
            }
            // grounded 재시도로 못 푼 사유(overlap·grounding 불가 등)로 좌초 직전 — 수동 버튼을
            // 기다리지 말고 full 재생성 1회 자동 폴백(구조적으로 overlap·매칭실패가 없음). 실패 시 수동 카드로.
            if (await this._tryAutoFullFallback(action.filePath, groundedRetryDone)) {
              break;
            }
            const failedSearches = mp.results
              .filter((r) => !r.success)
              .map((r) => {
                const p = action.patches?.[r.index];
                return p ? `[#${r.index + 1} ${r.reason}]\n${p.search}` : `[#${r.index + 1} ${r.reason}]`;
              });
            this._reportPatchFailure(action.filePath, failedSearches);
            break;
          }
          // 선택 영역 가드: 실제로 변경된 라인을 diff로 추출해 검사한다.
          // patch의 search 범위가 아닌 "실제 변경된 라인"이 기준 — 모델이 search에
          // 선택 라인을 포함시켜놓고 다른 라인만 변경하는 케이스도 잡는다.
          // 변경 라인이 (선택 영역 ±1) 밖이고 import 라인이 아니면 거부한다.
          if (this._lastSelectionLineRange) {
            const sel = this._lastSelectionLineRange;
            const PADDING = 1;
            const guardCfg = ExtensionConfig.getMultiPatchConfig();
            const diff = computeDiffHunks(originalContent, mp.text);
            // LCS-diff의 false-positive 필터: del 라인의 trimmed 내용이 result에 그대로
            // 존재하면 "실제 변경"이 아니라 indent/순서 시프트로 간주 (예: <div> 들여쓰기 변경).
            const resultTrimmedSet = new Set(
              mp.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
            );

            // 1B ripple-aware: 선택 영역 안 patch의 search→replace에서 식별자 rename 맵을 추출한다.
            // 선택 밖 변경이라도 "이 rename을 적용한 결과와 글자까지 동일"하면 리플로 보고 허용한다
            // (모델이 임의 코드를 끼워넣을 수 없음 — 예측된 rename 결과와 일치할 때만 면제).
            const inSelectionPatches = guardCfg.rippleGuard
              ? mp.resolvedOk
                  .filter((o) => o.endLine + 1 >= sel.startLine - PADDING && o.startLine + 1 <= sel.endLine + PADDING)
                  .map((o) => action.patches![o.index])
              : [];
            const renameMap = guardCfg.rippleGuard
              ? this._fileCreator.extractRenameMap(inSelectionPatches)
              : new Map<string, string>();
            let rippleExempted = 0;

            // 'del' 라인의 oldNo가 "원본에서 변경된 라인"의 번호 (1-based)
            const violatingLines: Array<{ line: number; content: string }> = [];
            for (const d of diff) {
              if (d.type !== 'del' || typeof d.oldNo !== 'number') continue;
              // import 라인 변경은 면제 (예: 기존 import 옆에 새 import 추가)
              if (/^[ \t]*import\s/.test(d.content)) continue;
              // 선택 영역 ±PADDING 안이면 OK
              if (d.oldNo >= sel.startLine - PADDING && d.oldNo <= sel.endLine + PADDING) continue;
              // trimmed 내용이 결과에 그대로 존재 → 위치 시프트일 뿐 실제 변경 아님
              const trimmed = d.content.trim();
              if (trimmed.length > 0 && resultTrimmedSet.has(trimmed)) continue;
              // ripple 면제: 선택 안 rename을 이 줄에 적용한 결과가 result에 존재하면 일관된 리플.
              if (renameMap.size > 0) {
                const renamed = this._fileCreator.applyRenameMap(trimmed, renameMap);
                if (renamed !== trimmed && resultTrimmedSet.has(renamed)) {
                  rippleExempted++;
                  continue;
                }
              }
              violatingLines.push({ line: d.oldNo, content: d.content });
            }

            if (rippleExempted > 0) {
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ripple-aware: 선택 밖 변경 ${rippleExempted}줄을 rename 리플로 허용 ` +
                `(${[...renameMap].map(([o, n]) => `${o}→${n}`).join(', ')})`,
              );
            }

            if (violatingLines.length > 0) {
              const lineNums = [...new Set(violatingLines.map((v) => v.line))].sort((a, b) => a - b);
              // 모델이 **선택 영역 자체도 수정했는지** 판정 — resolvedOk 중 하나라도 선택 범위와 겹치면
              // 의도를 반영한 것이다. 이때 선택 밖 변경은 데이터 소스(useApi) 추가·이름 충돌 회피 rename 등
              // 정당한 보조 수정으로 보고 **허용**한다(잘못된 위치 방어는 아래 휴먼 confirm diff가 담당).
              // 반대로 선택은 전혀 안 건드리고 선택 밖만 바꿨다면 = 같은 토큰의 잘못된 위치 → 거부(종전).
              const addressedSelection = mp.resolvedOk.some(
                (o) => o.endLine + 1 >= sel.startLine && o.startLine + 1 <= sel.endLine,
              );
              if (addressedSelection) {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 선택 영역 외 변경 허용 (선택 ${sel.startLine}~${sel.endLine} 수정 확인됨) — 부수 변경 라인 ${lineNums.join(', ')}`,
                );
                this._post({
                  type: 'token',
                  content:
                    `\n\n> ℹ️ 선택 영역(${sel.startLine}~${sel.endLine}) 외에 라인 **${lineNums.join(', ')}** 도 함께 변경됩니다 ` +
                    `(데이터 소스 추가·이름 충돌 회피 등 부수 수정). 아래 diff에서 전체 변경을 확인하고 적용하세요.\n`,
                });
              } else {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] ❌ 선택 영역 위반 거부 (선택 ${sel.startLine}~${sel.endLine}): ` +
                  `선택은 손대지 않고 선택 밖 라인 ${lineNums.join(', ')}만 변경 — 잘못된 위치`,
                );
                violatingLines.slice(0, 5).forEach((v) => {
                  this._corpusOutputChannel.appendLine(
                    `  - 라인 ${v.line}: ${v.content.trim().slice(0, 100)}`,
                  );
                });
                // 진단: 모델이 낸 patch search/replace 원문 덤프 (거부 케이스 분석용).
                action.patches.forEach((p, idx) => {
                  this._corpusOutputChannel.appendLine(`\n[Axiom AI] === patch #${idx + 1} (selection-mismatch) 진단 ===`);
                  this._corpusOutputChannel.appendLine(`--- 모델 <search> (${p.search.split('\n').length}줄) ---`);
                  p.search.split('\n').forEach((ln, i) => this._corpusOutputChannel.appendLine(`SEARCH[${i + 1}]: ${JSON.stringify(ln)}`));
                  this._corpusOutputChannel.appendLine(`--- 모델 <replace> (${p.replace.split('\n').length}줄) ---`);
                  p.replace.split('\n').forEach((ln, i) => this._corpusOutputChannel.appendLine(`REPLACE[${i + 1}]: ${JSON.stringify(ln)}`));
                });
                const failedSearches = action.patches.map((p, idx) => {
                  return `[#${idx + 1} selection-mismatch] 모델이 선택 영역(${sel.startLine}~${sel.endLine})은 건드리지 않고 라인 ${lineNums.join(', ')}만 변경하려 함\n${p.search}`;
                });
                this._post({
                  type: 'token',
                  content:
                    `\n\n> ❌ **선택 영역 위반으로 거부됨**: 선택한 라인은 **${sel.startLine}~${sel.endLine}** 인데, ` +
                    `모델이 선택 영역은 손대지 않고 라인 **${lineNums.join(', ')}** 만 변경하려 했습니다. ` +
                    `같은 토큰이 다른 위치에도 있어 잘못된 위치를 선택한 것으로 보입니다. ` +
                    `**Full로 재시도**를 선택하거나, 라인 번호를 명시해서 다시 요청하세요 (예: "라인 ${sel.startLine}의 \`u.end_date\`만 변경해줘").\n`,
                });
                this._reportPatchFailure(action.filePath, failedSearches);
                break;
              }
            }

            // Phase 2 — 결정론적 리플: 선택 영역 rename을 소비처(멤버 접근 `.field`)에 직접 반영한다.
            // 모델이 소비처 JSX를 재구성하지 않아도 확장이 일괄 치환하므로, not-found·스텁 문제를
            // 원천 회피한다. 순수 rename만 반영되고(필드 split·타입 변경은 renameMap에 안 들어옴),
            // 그 외는 손대지 않아 사용자가 수동 확인할 수 있다.
            if (renameMap.size > 0) {
              const ripple = this._fileCreator.applyMemberRename(mp.text, renameMap);
              if (ripple.count > 0) {
                mp.text = ripple.text;
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 🔁 Phase2 리플: 소비처 멤버접근 ${ripple.count}곳 자동 치환 ` +
                  `(${ripple.fields.map((f) => `${f}→${renameMap.get(f)}`).join(', ')})`,
                );
                this._post({
                  type: 'token',
                  content:
                    `\n\n> 🔁 선택 영역 rename을 소비처 **${ripple.count}곳**(\`.${ripple.fields.join('`, `.')}\`)에 자동 반영했습니다. ` +
                    `필드 분리·타입 변경 등 단순 rename이 아닌 부분의 소비처는 수동 확인이 필요할 수 있습니다.\n`,
                });
              }
            }
          }

          // 혼용 모드: 선택/국소 변경(patch)은 mp.text에 이미 반영됐고 선택 가드도 통과했다.
          // 그 위에 import·훅·타입 등 부수 삽입을 structural로 결정론적으로 끼운다 — 이들은 선택 밖
          // (import 블록·컴포넌트 본문·모듈 스코프)이라 선택 가드와 무관하므로 가드 이후에 적용한다.
          // 모델은 안 보이는 영역의 search를 만들 필요가 없어(structural은 위치를 확장이 계산) 매칭 실패가 없다.
          if (action.structural && (action.structural.hookCode || action.structural.imports?.length)) {
            const res = applyStructuralEdit(mp.text, action.structural);
            mp.text = res.text;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 혼용 structural 삽입 (${action.filePath}):\n  ${res.changes.join('\n  ')}`,
            );

            // 의존성 폐쇄 게이트 — useApi<TFoo> 삽입 시 useApi import·TFoo 선언이 결과 파일에 없으면
            // 컴파일이 깨지는 출력이므로 거부한다. 고정 경로 스캐폴드 훅(useApi 등)은 자동 import 보강.
            let dep = findUnresolvedReferences(action.structural.hookCode ?? '', mp.text);
            if (!dep.ok) {
              const autoImports = resolveKnownImports(dep.unresolved);
              if (autoImports.length > 0) {
                const patched = applyStructuralEdit(mp.text, { imports: autoImports });
                mp.text = patched.text;
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 🔧 혼용 structural import 자동 보강 (${action.filePath}):\n  ${patched.changes.join('\n  ')}`,
                );
                dep = findUnresolvedReferences(action.structural.hookCode ?? '', mp.text);
              }
            }
            if (!dep.ok) {
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ⛔ 혼용 structural 의존성 미해소 (${action.filePath}): ${dep.unresolved.join(', ')}`,
              );
              this._post({
                type: 'token',
                content:
                  `\n\n> ⛔ **부수 삽입을 취소했습니다.** 추가하려는 코드가 쓰는 ` +
                  `\`${dep.unresolved.join('`, `')}\` 의 선언/import가 결과 파일에 없어 그대로 적용하면 컴파일이 깨집니다. ` +
                  `타입 선언과 import까지 함께 넣도록 다시 시도해주세요.\n`,
              });
              this._reportPatchFailure(action.filePath, [
                `[혼용 structural 의존성 미해소] 미해소 심볼: ${dep.unresolved.join(', ')}`,
              ]);
              break;
            }
          }

          // patch 결과 React 규칙 검증 — patch 모드는 full 모드(위 1397행)와 달리
          // detectReactRuleViolations를 거치지 않아, 모델이 모듈 최상위(컴포넌트 함수 밖)에
          // 훅을 삽입해도 무방비로 통과했다. 여기서 최종 텍스트를 검사하되, 원본에 이미
          // 있던 위반은 막지 않도록 "patch가 새로 만든 위반"만 차단한다(오탐 방지).
          if (/\.(tsx|ts)$/.test(action.filePath)) {
            const before = FileCreatorService.detectReactRuleViolations(originalContent);
            const after = FileCreatorService.detectReactRuleViolations(mp.text);
            if (!before && after) {
              // 1차: auto-hoist로 결정적 교정. 실패 시 "Full로 재시도" 회복 버튼 제공.
              const hoist = FileCreatorService.hoistModuleScopeHooks(mp.text);
              if (hoist) {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 🔧 auto-hoist (${action.filePath}): 모듈 스코프 훅 ${hoist.hoisted.length}건을 컴포넌트 본문으로 이동`,
                );
                this._post({
                  type: 'token',
                  content: `\n\n> 🔧 컴포넌트 함수 밖(모듈 최상위)에 생성된 훅 ${hoist.hoisted.length}건을 본문 안으로 자동 이동하고 중복을 제거했습니다.\n`,
                });
                mp.text = hoist.text;
              } else {
                this._reportReactViolation(action.filePath, after);
                break;
              }
            }
          }

          // 결정론적 import 정리 — 약한 모델이 patch로 이미 존재하는 import를 또 추가하는 흔한 실수
          // (예: useApi import 중복)를 제거한다. structural의 import 병합과 동일 취지를 patch 결과에도 적용.
          if (/\.(tsx|ts|jsx|js)$/.test(action.filePath)) {
            // 서브경로 UI import(@axiom/components/ui/table 등)를 단일경로로 정규화(dedupe 전)
            const uiNorm = this._fileCreator.normalizeUiImportPaths(mp.text);
            if (uiNorm.changed > 0) {
              mp.text = uiNorm.text;
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔧 UI import 경로 정규화 ${uiNorm.changed}건 → @axiom/components/ui (${action.filePath})`,
              );
            }
            // 전역($ui/$util/$router) 환각 import 제거
            const glob = this._fileCreator.stripGlobalImports(mp.text);
            if (glob.removed > 0) {
              mp.text = glob.text;
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔧 전역 객체 import ${glob.removed}건 제거($ui/$util/$router는 import 불필요) (${action.filePath})`,
              );
            }
            const dedup = this._fileCreator.dedupeImportLines(mp.text);
            if (dedup.removed > 0) {
              mp.text = dedup.text;
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔧 중복 import ${dedup.removed}줄 제거 (${action.filePath})`,
              );
              this._post({
                type: 'token',
                content: `\n\n> 🔧 이미 존재하는 import ${dedup.removed}줄을 자동 제거했습니다(중복 방지).\n`,
              });
            }
          }

          // 중복 선언 게이트 — patch 가 기존 식별자를 **재선언**(예: 기존 useApi 를 통째로 다시 생성)해
          // 같은 스코프에 중복 선언이 생기면 TS 컴파일 에러다. region 경로(RegionEditService 6.9)와 동일
          // 취지를 patch 결과에도 적용한다. 원본에 이미 있던 중복은 막지 않고 "patch 가 새로 만든 중복"만
          // 거부(오탐 방지) → 조용한 파손 대신 Full 재시도로 회복.
          if (/\.(tsx|ts)$/.test(action.filePath)) {
            const origDupes = new Set(findDuplicateDeclarations(originalContent));
            const newDupes = findDuplicateDeclarations(mp.text).filter((d) => !origDupes.has(d));
            if (newDupes.length > 0) {
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ❌ 중복 선언 발생 거부 (${action.filePath}): ${newDupes.join(', ')} — patch 가 기존 식별자를 재선언(교체 아님)`,
              );
              // 통째 재선언(patch가 기존 const를 또 만듦)은 full 재생성으로 구조적으로 해소된다 —
              // full은 파일 전체를 한 벌로 내므로 같은 이름이 2번 나올 수 없다. 수동 카드 대신 자동 1회 폴백.
              if (await this._tryAutoFullFallback(action.filePath, groundedRetryDone)) {
                break;
              }
              this._post({
                type: 'token',
                content:
                  `\n\n> ❌ **중복 선언으로 거부됨**: \`${newDupes.join('`, `')}\` 가 같은 스코프에 두 번 선언됩니다 ` +
                  `(모델이 기존 선언을 수정하지 않고 **통째로 다시 생성**한 것으로 보입니다). 그대로 적용하면 컴파일이 깨집니다. ` +
                  `**Full로 재시도**하거나, 기존 선언의 해당 부분만 바꾸도록 더 구체적으로 요청하세요 ` +
                  `(예: "기존 \`useApi\` params 에 \`department\` 한 줄만 추가해줘").\n`,
              });
              this._reportPatchFailure(action.filePath, [
                `[중복 선언] patch 가 새로 만든 중복 선언: ${newDupes.join(', ')}`,
              ]);
              break;
            }
          }

          action.generatedCode = mp.text;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] multi-patch 적용 완료 (${action.filePath}, ${action.patches.length}개 블록)`,
          );
        }

        // 그룹 보존 표식 전수 생존 검사(D3) — 뷰에 넣어준 `[보존 Ls~Le]` 표식이 full 재생성 출력에서
        // 하나라도 빠지면 그 구간(수백 줄)이 통째로 사라진 채 쓰인다. 개별 stub과 달리 폭발 반경이
        // 커서 적용 자체를 거부한다. structural은 확장이 원본에 병합해 표식이 없는 게 정상 → 제외.
        // region 합성 경로(precomputedDiff 존재)도 제외 — 원본 디스크 기반 합성이라 표식이 없는 게
        // 정상인데, 직전 요청의 슬라이싱 스태시가 남아 있으면 오거부한다(2026-07-16 라이브 관찰 2호).
        if (
          action.mode !== 'patch' &&
          action.mode !== 'lines' &&
          action.mode !== 'structural' &&
          !precomputedDiff &&
          originalContent !== undefined &&
          action.generatedCode
        ) {
          const guard = this._scaffoldBuilder.lastSliceGroupGuard();
          if (guard && guard.markers.length > 0) {
            const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase();
            const guardPath = norm(guard.filePath);
            const actionPath = norm(action.filePath);
            const samePath =
              guardPath.endsWith(actionPath) || actionPath.endsWith(guardPath);
            if (samePath) {
              const missing = guard.markers.filter((m) => !action.generatedCode!.includes(m));
              if (missing.length > 0) {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] ⛔ 보존 표식 생존 검사 실패 (${action.filePath}): ` +
                    `${missing.length}/${guard.markers.length}개 누락 — ${missing.join(', ')} → 적용 거부`,
                );
                this._post({
                  type: 'token',
                  content:
                    `\n\n> ⛔ **이 수정은 적용하지 않았습니다.** 파일이 커서 일부 구간을 보존 표식으로 접어 ` +
                    `모델에 전달했는데, 응답에서 표식 ${missing.length}개(\`${missing.join('`, `')}\`)가 사라졌습니다. ` +
                    `그대로 적용하면 해당 구간의 원본 코드가 통째로 유실됩니다. **수정할 부분만 지정**해 ` +
                    `다시 요청하시면(예: 특정 함수·영역) 안전하게 반영합니다.\n`,
                });
                this._reportPatchFailure(action.filePath, [
                  `[보존 표식 누락] ${missing.join(', ')} (${missing.length}/${guard.markers.length})`,
                ]);
                this._post({ type: 'fileCancelled' });
                break;
              }
            } else {
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ℹ️ 보존 표식 가드 건너뜀 — 대상 파일 불일치 (guard=${guard.filePath}, action=${action.filePath})`,
              );
            }
          }
        }

        // full 모드: 컨텍스트가 sliced되어 LLM이 stub 라인(`// ... (kind name 생략, NN줄)`)을
        // 그대로 출력했다면, 디스크에 쓰기 전에 원본 섹션 본문으로 복원한다 (코드 손실 방지).
        if (
          action.mode !== 'patch' &&
          action.mode !== 'lines' &&
          originalContent !== undefined &&
          action.generatedCode
        ) {
          const restored = restoreSlicedStubs(action.generatedCode, originalContent);
          if (restored.restoredCount > 0) {
            action.generatedCode = restored.text;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] full 모드 응답의 stub ${restored.restoredCount}개를 원본 코드로 복원 (${action.filePath})`,
            );
          }
          if (restored.unmatched.length > 0) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⚠️ 원본에서 찾지 못한 stub: ${restored.unmatched.join(', ')}`,
            );
          }
        }

        // 결정론적 import 중복 제거 — **모든 편집 모드 공통 길목**(full/structural/lines. patch는 위 4038에서
        // 이미 처리되나 여기서도 idempotent). 종전엔 patch 경로에만 배선돼, 약한 모델이 full 모드로 이미 존재하는
        // import를 전체 파일에 또 써넣으면(실측: `import { Button } …` 2줄) 그대로 미리보기·적용됐다. 여기서
        // 제거해 중복 import 계열을 경로 무관하게 닫는다(케이스별 대응이 아니라 길목 불변식).
        if (/\.(tsx|ts|jsx|js)$/.test(action.filePath) && action.generatedCode) {
          // 서브경로 UI import 정규화(dedupe 전) — 전 모드 공통 길목
          const uiNorm = this._fileCreator.normalizeUiImportPaths(action.generatedCode);
          if (uiNorm.changed > 0) {
            action.generatedCode = uiNorm.text;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 🔧 UI import 경로 정규화 ${uiNorm.changed}건 → @axiom/components/ui (${action.filePath}, mode=${action.mode ?? 'full'})`,
            );
          }
          // 전역($ui/$util/$router) 환각 import 제거
          const glob = this._fileCreator.stripGlobalImports(action.generatedCode);
          if (glob.removed > 0) {
            action.generatedCode = glob.text;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 🔧 전역 객체 import ${glob.removed}건 제거($ui/$util/$router는 import 불필요) (${action.filePath}, mode=${action.mode ?? 'full'})`,
            );
          }
          // 사용된 @axiom/components/ui 컴포넌트 import 결정론적 보강(normalizeUiImportPaths 뒤라야 정확). 약한 모델이
          // <Button> 등을 JSX에 넣고 import를 빠뜨리는 실패(실측: 선택 경로 버튼 삽입 → import 누락 → 컴파일 깨짐)를
          // region 게이트와 같은 취지로 patch/full/lines 공통 길목에서 주입한다(카탈로그에 있는 이름만, 커스텀 제외).
          if (/\.(tsx|jsx)$/.test(action.filePath)) {
            const uiEnsure = ensureUiComponentImports(action.generatedCode);
            if (uiEnsure.added.length > 0) {
              action.generatedCode = uiEnsure.text;
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] 🔧 누락된 UI 컴포넌트 import 보강: ${uiEnsure.added.join(', ')} → @axiom/components/ui (${action.filePath}, mode=${action.mode ?? 'full'})`,
              );
              this._post({
                type: 'token',
                content: `\n\n> 🔧 사용된 컴포넌트의 빠진 import를 자동 추가했습니다: \`${uiEnsure.added.join('`, `')}\`\n`,
              });
            }
          }
          const dedup = this._fileCreator.dedupeImportLines(action.generatedCode);
          if (dedup.removed > 0) {
            action.generatedCode = dedup.text;
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] 🔧 중복 import ${dedup.removed}줄 제거 (${action.filePath}, mode=${action.mode ?? 'full'})`,
            );
            this._post({
              type: 'token',
              content: `\n\n> 🔧 이미 존재하는 import ${dedup.removed}줄을 자동 제거했습니다(중복 방지).\n`,
            });
          }
        }

        // 중복 선언 가드 — 적용하면 컴파일이 깨지는 출력을 적용 직전에 차단한다.
        // 약한 모델이 full·region 재작성에서 기존 const(예: `const departments = …`)를 state로 바꾸며
        // 원본을 안 지워 같은 스코프에 같은 이름을 2번 선언하는 실패(실측)를 막는다. "applied != correct"
        // 의 결정론적 안전망. 원본에 이미 있던 중복은 이 편집의 책임이 아니므로 새로 생긴 것만 차단한다.
        if (/\.(tsx|ts)$/.test(action.filePath) && action.generatedCode) {
          const after = findDuplicateDeclarations(action.generatedCode);
          if (after.length > 0) {
            const before = new Set(
              originalContent ? findDuplicateDeclarations(originalContent) : [],
            );
            const introduced = after.filter((n) => !before.has(n));
            if (introduced.length > 0) {
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ⛔ 중복 선언 가드 (${action.filePath}): ${introduced.join(', ')} — 같은 스코프 2회 이상 선언(컴파일 에러) → 적용 거부`,
              );
              this._post({
                type: 'token',
                content:
                  `\n\n> ⛔ **이 수정은 적용하지 않았습니다.** \`${introduced.join('`, `')}\`(을)를 같은 스코프에서 ` +
                  `두 번 선언해, 그대로 적용하면 \`Cannot redeclare block-scoped variable\` 컴파일 에러가 납니다 ` +
                  `(기존 선언을 지우지 않고 새로 추가한 경우입니다). 기존 선언을 재사용하거나 한쪽만 남기도록 다시 시도해주세요.\n`,
              });
              this._post({ type: 'fileCancelled' });
              break;
            }
          }
        }

        // full 재생성 파괴적 누락 가드 — 긴 파일을 full 모드로 통째 다시 받을 때, 약한 모델이 중간을
        // 조용히 빠뜨려 파일이 truncate되는 사고를 적용 직전에 차단한다(이슈2: structural 의존성 미해소로
        // full 폴백된 뒤 긴 파일이 반토막 나던 위험). region 경로엔 내용손실 게이트가 있지만 full 경로엔
        // 없었다. JSX 여는태그 수·비어있지 않은 라인 수가 절반 미만으로 급감하면 파괴적 생략으로 본다.
        // 보수적 임계(큰 파일 + 심한 급감)로 정상 편집 오탐을 피하고, 삭제 의도 요청은 면제한다.
        if (
          action.mode !== 'patch' &&
          action.mode !== 'lines' &&
          originalContent !== undefined &&
          action.generatedCode
        ) {
          const removalIntent = /빼|제거|삭제|없애|지워|간소화|줄여|remove|delete|simplify/i.test(this._lastUserQuery);
          const countTags = (s: string): number => (s.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
          const countLines = (s: string): number => s.split('\n').filter((l) => l.trim() !== '').length;
          const origTags = countTags(originalContent);
          const genTags = countTags(action.generatedCode);
          const origLines = countLines(originalContent);
          const genLines = countLines(action.generatedCode);
          const suspiciousTagDrop =
            origTags >= 12 && genTags < origTags * 0.5 && origTags - genTags >= 6;
          const suspiciousLineDrop = origLines >= 200 && genLines < origLines * 0.5;
          if (!removalIntent && (suspiciousTagDrop || suspiciousLineDrop)) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⛔ full 파괴적 누락 가드 (${action.filePath}): ` +
                `라인 ${origLines}→${genLines}, JSX태그 ${origTags}→${genTags} — 통째 재생성 중 대량 누락 의심 → 적용 거부`,
            );
            this._post({
              type: 'token',
              content:
                `\n\n> ⛔ **이 수정은 적용하지 않았습니다.** 전체 재생성 결과가 현재 파일보다 크게 짧아졌습니다 ` +
                `(라인 ${origLines}→${genLines}, 요소 ${origTags}→${genTags}). 파일이 길어 모델이 일부를 ` +
                `누락한 것으로 보입니다. **수정할 부분만 지정**해 다시 요청하시면(예: 특정 함수·영역) 안전하게 반영합니다.\n`,
            });
            this._reportPatchFailure(action.filePath, [
              `[full 파괴적 누락] 라인 ${origLines}→${genLines}, JSX태그 ${origTags}→${genTags}`,
            ]);
            this._post({ type: 'fileCancelled' });
            break;
          }
        }

        // precomputedDiff(region 경로의 디스크 기준 diff)가 있으면 재계산을 건너뛴다 — 에디터 버퍼와
        // 디스크 합성본의 정규화 mismatch로 빈 diff가 되는 것을 막는다(확인 카드 diff 보존).
        const diff =
          precomputedDiff ??
          (originalContent !== undefined && action.generatedCode
            ? computeDiffHunks(originalContent, action.generatedCode)
            : []);

        // no-op 가드(방어선): full/patch/lines/structural이 모두 수렴하는 지점. 최종 생성 코드가
        // 원본과 동일하면 "수정 대기" 확인 카드를 띄우지 않는다. 질문(조회·설명)을 수정 흐름으로
        // 오인해 모델이 선택 코드를 그대로 베껴낸 경우, 원본과 똑같은 diff가 진짜 편집처럼 보이던 것을 차단.
        //
        // 두 가지를 모두 no-op으로 본다:
        //  ① diff 0건(완전 동일).
        //  ② 들여쓰기/공백만 다름 — 모델 patch의 <replace>가 원본과 내용은 같고 indent만 달라
        //     computeDiffHunks가 del+add 쌍을 만든 경우(예: <td>·</td> 재들여쓰기). del/add 라인의
        //     **trim 후 멀티셋이 동일**하면 실질 변경이 아니므로 카드를 안 띄운다(Prettier가 어차피 정규화).
        const dels = diff.filter((d) => d.type === 'del').map((d) => d.content.trim());
        const adds = diff.filter((d) => d.type === 'add').map((d) => d.content.trim());
        const whitespaceOnly =
          diff.length > 0 &&
          dels.length === adds.length &&
          [...dels].sort().join('\n') === [...adds].sort().join('\n');
        if (originalContent !== undefined && (diff.length === 0 || whitespaceOnly)) {
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] ℹ️ no-op 편집 생략 (${action.filePath}) — ${whitespaceOnly ? '공백/들여쓰기만 다름' : '생성 코드가 원본과 동일'}, 확인 카드 안 띄움`,
          );
          this._post({
            type: 'token',
            content: whitespaceOnly
              ? '\n\n> ℹ️ **실질적인 변경이 없습니다** — 들여쓰기·공백만 다를 뿐 코드 내용은 현재 파일과 동일합니다.\n'
              : '\n\n> ℹ️ **변경 사항이 없습니다** — 제안된 코드가 현재 파일과 동일합니다. ' +
                '(질문·설명 요청이었다면 위 답변을 참고하세요.)\n',
          });
          this._post({ type: 'fileCancelled' });
          break;
        }

        const actionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const approved = await this._requestFileConfirmation(
          actionId,
          action.filePath,
          diff,
          action.generatedCode ?? '',
        );
        if (!approved) {
          this._corpusOutputChannel.appendLine(`[Axiom AI] 파일 수정 거부됨: ${action.filePath}`);
          this._post({ type: 'fileCancelled' });
          break;
        }
        const result = await this._fileCreator.applyUpdate(action);
        if (result.success) {
          this._corpusOutputChannel.appendLine(`[Axiom AI] 파일 수정 완료: ${result.filePath}`);
          this._post({ type: 'fileUpdated', filePath: result.filePath!, diff: diff.length ? diff : undefined });
        } else {
          this._corpusOutputChannel.appendLine(`[Axiom AI] ⚠️ 파일 수정 실패: ${result.error}`);
          this._post({ type: 'fileError', message: result.error ?? '알 수 없는 오류' });
          break;
        }
      } else {
        // patch 모드 (router/autoWrite 경우) — 다중 patch도 동일 경로로 처리
        if (action.action === 'updateFile' && action.mode === 'patch' && action.patches && action.patches.length > 0) {
          const { originalContent } = await this._fileCreator.readFileContent(action);
          if (originalContent) {
            const mp = this._fileCreator.computeMultiPatch(originalContent, action.patches, this._lastSelectionLineRange);
            if (mp.text === null) {
              const failureSummary = mp.results
                .filter((r) => !r.success)
                .map((r) => `#${r.index + 1}:${r.reason}`)
                .join(', ');
              this._corpusOutputChannel.appendLine(
                `[Axiom AI] ⚠️ multi-patch 실패 (${action.filePath}): ${failureSummary}`,
              );
              // router가 아닌 일반 파일은 full 재생성 1회 자동 폴백(메인 경로와 동일 원칙).
              // router는 _retryForAxiomAction이 page 템플릿을 가정하므로 자동 폴백에서 제외하고 종전대로.
              if (
                action.templateType !== 'router' &&
                (await this._tryAutoFullFallback(action.filePath, groundedRetryDone))
              ) {
                break;
              }
              const failedSearches = mp.results
                .filter((r) => !r.success)
                .map((r) => {
                  const p = action.patches?.[r.index];
                  return p ? `[#${r.index + 1} ${r.reason}]\n${p.search}` : `[#${r.index + 1} ${r.reason}]`;
                });
              this._reportPatchFailure(action.filePath, failedSearches);
              if (action.templateType !== 'router') break;
            } else if (
              action.templateType !== 'router' &&
              /\.(tsx|ts)$/.test(action.filePath) &&
              !FileCreatorService.detectReactRuleViolations(originalContent) &&
              FileCreatorService.detectReactRuleViolations(mp.text)
            ) {
              // autoWrite patch 경로도 auto-hoist로 결정적 교정 후, 실패 시 회복 버튼 제공.
              const violation = FileCreatorService.detectReactRuleViolations(mp.text)!;
              const hoist = FileCreatorService.hoistModuleScopeHooks(mp.text);
              if (hoist) {
                this._corpusOutputChannel.appendLine(
                  `[Axiom AI] 🔧 auto-hoist (${action.filePath}): 모듈 스코프 훅 ${hoist.hoisted.length}건을 컴포넌트 본문으로 이동`,
                );
                action.generatedCode = hoist.text;
              } else {
                this._reportReactViolation(action.filePath, violation);
                break;
              }
            } else {
              action.generatedCode = mp.text;
            }
          }
        }

        // router / autoWrite / createFile → 기존 경로
        const result = await this._fileCreator.createFile(action);
        if (result.success) {
          if (action.templateType === 'router') routerProcessed = true;
          const isUpdate = action.action === 'updateFile';
          this._corpusOutputChannel.appendLine(`[Axiom AI] 파일 ${isUpdate ? '수정' : '생성'} 성공: ${result.filePath}`);
          if (isUpdate) {
            const diff = (result.originalContent !== undefined && action.generatedCode)
              ? computeDiffHunks(result.originalContent, action.generatedCode)
              : undefined;
            this._post({ type: 'fileUpdated', filePath: result.filePath!, diff });
          } else {
            this._post({ type: 'fileCreated', filePath: result.filePath! });
          }
        } else if (result.cancelled) {
          this._corpusOutputChannel.appendLine(`[Axiom AI] 파일 작업 취소: ${action.filePath}`);
          this._post({ type: 'fileCancelled' });
          if (action.templateType !== 'router') break;
        } else {
          this._corpusOutputChannel.appendLine(`[Axiom AI] ⚠️ 파일 작업 실패: ${result.error} (filePath=${action.filePath}, generatedCode 있음=${!!action.generatedCode})`);
          this._post({ type: 'fileError', message: result.error ?? '알 수 없는 오류' });
          if (action.templateType !== 'router') break;
        }
      }
    }

    return routerProcessed;
  }

  private _stripActionBlock(text: string): string {
    return text.replace(/<axiom-action>[\s\S]*?<\/axiom-action>/g, '').trim();
  }

  /**
   * patch 매칭 실패 시 — 자동 full 재시도로 토큰을 또 쓰는 대신
   * 사용자에게 "Full로 재시도" / "입력 수정" 선택권을 제공한다.
   * webview의 patchFailed 메시지가 두 버튼을 그려 사용자 응답을 받는다.
   *
   * 다중 patch에서는 여러 search가 실패할 수 있으므로 string[]을 받아
   * 사유 라벨과 함께 미리보기로 합친다.
   */
  private _reportPatchFailure(filePath: string, failedSearches: string[]): void {
    const recoveryId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this._pendingPatchRecovery.set(recoveryId, { filePath });
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] ⚠️ patch 매칭 실패 (${filePath}) — 사용자 선택 대기 [${recoveryId}]`,
    );
    const preview = failedSearches
      .map((s) => s.split('\n').slice(0, 6).join('\n'))
      .join('\n---\n');
    this._post({
      type: 'patchFailed',
      recoveryId,
      filePath,
      searchPreview: preview,
      failureKind: 'patch-mismatch',
    });
  }

  /**
   * React 규칙 위반(모듈 최상위 훅 호출 등)으로 저장이 차단됐을 때 — patch 매칭 실패와
   * 동일하게 "Full로 재시도" / "입력 수정" 선택지를 제공해 dead-end를 막는다.
   * 재시도 시 위반 메시지를 보강 프롬프트에 실어 모델이 훅을 컴포넌트 본문 안으로 옮기게 한다.
   */
  private _reportReactViolation(filePath: string, violation: string): void {
    const recoveryId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this._pendingPatchRecovery.set(recoveryId, { filePath, reactViolation: violation });
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] ⚠️ React 규칙 위반 차단 (${filePath}) — 사용자 선택 대기 [${recoveryId}]: ${violation}`,
    );
    this._post({
      type: 'patchFailed',
      recoveryId,
      filePath,
      searchPreview: violation,
      failureKind: 'react-violation',
    });
  }

  /**
   * 사용자가 "Full로 재시도"를 선택한 경우 호출된다.
   * system prompt 재전송 없이 누적 히스토리에 짧은 보강 메시지만 추가해 LLM 호출.
   */
  private async _handlePatchRetryFull(recoveryId: string): Promise<void> {
    const entry = this._pendingPatchRecovery.get(recoveryId);
    if (!entry) return;
    this._pendingPatchRecovery.delete(recoveryId);

    const config = ExtensionConfig.getEffectiveLlmConfig();
    // "Full로 재시도" 버튼 → 이름 그대로 full 모드를 강제하고 현재 파일을 기준으로 재생성한다.
    const result = await this._retryForAxiomAction(entry.filePath, config, {
      reactViolation: entry.reactViolation,
      forceFull: true,
    });
    if (result) {
      await this._handleAxiomAction(result);
    }
    this._post({ type: 'done' });
    this._postStatus(config.model);
  }

  /**
   * patch가 grounded 재시도로도 못 풀리는 사유(겹침 overlap, 위치 grounding 불가, react 규칙 외 실패 등)로
   * dead-end에 이르려 할 때 — 사용자의 수동 "Full로 재시도" 버튼을 기다리지 않고 **full 재생성을 1회 자동
   * 수행**한다. `_handlePatchRetryFull`(수동 버튼)이 하던 일을 자동으로 당겨오는 것.
   *
   * 왜(핵심): fragile patch 조각매칭은 overlap·매칭실패 시 **구조적으로** 반쪽 상태에 좌초하지만, full
   * 재생성은 overlap·매칭실패가 없다("Full로 재시도"가 늘 성공하는 이유). 수동 버튼은 토큰 절약이 목적이었으나
   * 약한 모델·비대 프롬프트 환경에선 dead-end 빈도가 높아, 자동 1회 폴백이 두더지잡기를 종결한다.
   * 의존성 dead-end(3660~)가 이미 같은 "수동버튼→자동 1회" 전환을 적용한 것과 동일한 원칙.
   *
   * 무한 루프 방지(정확히 1회):
   *  - 이미 grounded/full 재시도를 한 패스면(groundedRetryDone) 즉시 false → 수동 버튼으로.
   *  - full 재시도 결과는 _handleAxiomAction(groundedRetryDone=true)로 처리되므로, 그 결과가 또 patch로
   *    실패해도 다시 자동 full로 들어오지 않는다.
   *  - autoFullFallback 설정 off면 false(토큰 절약 우선 사이트는 수동 버튼 유지).
   *
   * @returns true = 자동 full 재시도를 시작·처리함(호출부는 dead-end UI 생략) / false = 수동 폴백으로.
   */
  private async _tryAutoFullFallback(filePath: string, groundedRetryDone: boolean): Promise<boolean> {
    if (groundedRetryDone) return false;
    if (!ExtensionConfig.getMultiPatchConfig().autoFullFallback) return false;
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔄 patch 매칭 실패 → full 재생성 1회 자동 폴백 (${filePath})`,
    );
    const config = ExtensionConfig.getEffectiveLlmConfig();
    const resp = await this._retryForAxiomAction(filePath, config, { forceFull: true });
    if (!resp) return false;
    // groundedRetryDone=true → 자동 full 결과가 또 patch로 실패해도 다시 자동 full로 재진입하지 않음(1회).
    await this._handleAxiomAction(resp, false, true);
    return true;
  }

  /**
   * grounded bounded retry — patch가 not-found/ambiguous로 매칭 실패했을 때, 실패 search를
   * 실제 파일 위치에 fuzzy 매칭(locateFuzzyRegion)으로 grounding하고, 그 **실제 텍스트**를
   * 모델에 돌려주어 `<search>`를 실제 코드 기준으로 재작성하게 1회만 재요청한다.
   *
   * 약한 sLLM이 기억으로 재구성한 search가 실제 파일과 어긋나 dead-end로 떨어지는 빈도를
   * 낮추는 것이 목적. Claude Code의 "read해서 정확히 안다"를 모델 없이(확장이 파일을 들고)
   * 재현하는 셈이다.
   *
   * 안전장치:
   *  - 이미 grounded 재시도를 했으면(groundedRetryDone) 즉시 false → 무한 루프 차단(정확히 1회)
   *  - 실패 사유에 not-found/ambiguous 아닌 게 섞였으면 false (overlap 등은 재위치로 안 풀림)
   *  - 실패 patch 중 하나라도 위치 grounding 실패면 false (그 변경이 조용히 누락되는 사고 방지)
   *
   * @returns true = 재시도를 시작·처리함(호출부는 dead-end UI를 생략) / false = 기존 폴백으로 가라
   */
  private async _tryGroundedPatchRetry(
    action: AxiomAction,
    originalContent: string,
    mp: MultiPatchResult,
    groundedRetryDone: boolean,
  ): Promise<boolean> {
    if (groundedRetryDone) return false;
    const cfg = ExtensionConfig.getMultiPatchConfig();
    if (!cfg.groundedRetry) return false;
    if (!action.patches || action.patches.length === 0) return false;

    const failed = mp.results.filter((r) => !r.success);
    if (failed.length === 0) return false;
    // 위치 문제(not-found/ambiguous)만 grounding 대상. overlap 등 다른 사유가 섞이면 폴백.
    if (!failed.every((r) => r.reason === 'not-found' || r.reason === 'ambiguous')) return false;

    const origLines = originalContent.replace(/\r\n/g, '\n').split('\n');

    // 실패 patch를 실제 위치로 grounding — 하나라도 못 찾으면 포기(변경 누락 방지).
    // 1순위: 스텁 섹션 해소(결정론). 모델이 스텁을 search에 넣은 경우 실제 섹션 본문을 준다.
    // 2순위: fuzzy 위치 grounding.
    const grounded: GroundedPatchRegion[] = [];
    for (const r of failed) {
      const p = action.patches[r.index];
      const stubRegion = this._fileCreator.resolveStubSection(originalContent, p.search);
      const region = stubRegion ?? this._fileCreator.locateFuzzyRegion(
        origLines, p.search, cfg.minContextLines, cfg.fuzzyLocateThreshold,
      );
      if (!region) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] grounded 재시도 포기 (${action.filePath}): patch #${r.index + 1}(${r.reason}) 위치 grounding 실패`,
        );
        return false;
      }
      if (stubRegion) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] patch #${r.index + 1}: <search>에 스텁 마커 감지 → 실제 섹션 본문(라인 ${region.startLine}~${region.endLine})으로 grounding`,
        );
      }
      grounded.push({
        // 스텁 해소된 경우 모델의 원래 <replace>도 스텁·허위 토큰을 담고 있어 신뢰할 수 없다.
        // intent를 비워 누적 히스토리의 원래 요청이 변경 의도를 전달하도록 한다.
        index: r.index, intent: stubRegion ? '' : p.replace,
        realText: region.text, startLine: region.startLine, endLine: region.endLine,
      });
    }

    // 이미 매칭된 patch는 모델에 재출력시키지 않는다 — 약한 모델이 그 과정에서 멀쩡했던 patch를
    // 망치는 것을 막기 위해, 성공분은 원본 PatchBlock 그대로 carry해 재처리 때(_handleAxiomAction)
    // 실패분과 합쳐 computeMultiPatch를 재실행한다. grounded 프롬프트엔 실패 region만 실어 모델이
    // 다시 만들 대상을 최소화한다(= "성공 매칭 간직 + 실패 region만 좁혀 재시도").
    grounded.sort((a, b) => a.index - b.index);
    const carryPatches: PatchBlock[] = [...mp.resolvedOk]
      .sort((a, b) => a.index - b.index)
      .map((o) => action.patches![o.index]);

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔁 grounded 재시도 (${action.filePath}): 실패 ${failed.length}건만 재요청(위치 grounding 성공), ` +
      `성공분 ${carryPatches.length}개는 carry해 합침`,
    );
    this._post({
      type: 'token',
      content: '\n\n> 🔁 **매칭 실패 부분의 실제 코드로 patch를 다시 만드는 중…** (현재 파일 기준, 1회)\n',
    });

    const config = ExtensionConfig.getEffectiveLlmConfig();
    const resp = await this._retryForAxiomAction(action.filePath, config, { groundedPatches: grounded });
    if (!resp) return false;
    // groundedRetryDone=true → 재시도 결과가 또 실패해도 다시 grounding하지 않고 기존 폴백으로.
    // carryPatches → 모델이 다시 낸 실패분 patch 앞에 성공분을 합쳐 atomic 재적용.
    await this._handleAxiomAction(resp, false, true, carryPatches);
    return true;
  }

  /**
   * lines 모드 앵커 실패(anchor-mismatch/out-of-range)를 patch 모드와 동일하게 grounded 재시도한다.
   *
   * 종전엔 lines 실패 시 곧장 full 재생성으로 떨어져, 약한 모델이 기억으로 재구성한 앵커가 한 번 빗나가면
   * 전체 파일을 다시 받는(느리고 내용 누락 위험 큰) 길로 갔다. 실패한 edit의 anchor를 실제 파일에 fuzzy
   * 매칭(locateFuzzyRegion)해 그 **실제 텍스트**를 모델에 돌려주고 `<patch>`로 1회만 재요청한다
   * (Claude Code의 "read해서 정확히 안다"를 모델 없이 재현 — _tryGroundedPatchRetry와 동일 철학).
   *
   * 안전장치(하나라도 어긋나면 false → 종전 full 폴백, 회귀 0):
   *  - 이미 grounded 재시도를 했으면 false(정확히 1회).
   *  - 위치 문제(anchor-mismatch/out-of-range)만 대상. 그 외 사유 섞이면 false.
   *  - **전부 실패일 때만** 시도 — 부분 성공이면 성공분을 patch 재시도로 보존하기 어려워 누락 위험 → full로.
   *  - 실패 edit에 anchor가 없거나 위치 grounding 실패면 false(변경 누락 방지).
   */
  private async _tryGroundedLineEditRetry(
    action: AxiomAction,
    originalContent: string,
    results: { index: number; success: boolean; reason?: string }[],
    groundedRetryDone: boolean,
  ): Promise<boolean> {
    if (groundedRetryDone) return false;
    const cfg = ExtensionConfig.getMultiPatchConfig();
    if (!cfg.groundedRetry) return false;
    const edits = action.lineEdits;
    if (!edits || edits.length === 0) return false;

    const failed = results.filter((r) => !r.success);
    if (failed.length === 0) return false;
    if (!failed.every((r) => r.reason === 'anchor-mismatch' || r.reason === 'out-of-range')) return false;
    // 부분 성공이면 성공분이 patch 재시도에서 누락될 수 있으므로 전부 실패일 때만(드롭 방지).
    if (failed.length !== edits.length) return false;

    const origLines = originalContent.replace(/\r\n/g, '\n').split('\n');
    const grounded: GroundedPatchRegion[] = [];
    for (const r of failed) {
      const e = edits[r.index];
      const anchor = e?.anchor?.trim();
      if (!anchor) return false; // 앵커 없으면 grounding 불가 → full
      const region = this._fileCreator.locateFuzzyRegion(
        origLines, anchor, cfg.minContextLines, cfg.fuzzyLocateThreshold,
      );
      if (!region) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] grounded(lines) 재시도 포기 (${action.filePath}): edit #${r.index + 1}(${r.reason}) 위치 grounding 실패`,
        );
        return false;
      }
      grounded.push({
        index: r.index, intent: e.content,
        realText: region.text, startLine: region.startLine, endLine: region.endLine,
      });
    }
    grounded.sort((a, b) => a.index - b.index);

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔁 grounded(lines) 재시도 (${action.filePath}): 앵커 실패 ${grounded.length}건을 실제 코드로 재요청(위치 grounding 성공)`,
    );
    this._post({
      type: 'token',
      content: '\n\n> 🔁 **매칭 실패 부분의 실제 코드로 patch를 다시 만드는 중…** (현재 파일 기준, 1회)\n',
    });

    const config = ExtensionConfig.getEffectiveLlmConfig();
    const resp = await this._retryForAxiomAction(action.filePath, config, { groundedPatches: grounded });
    if (!resp) return false;
    await this._handleAxiomAction(resp, false, true);
    return true;
  }

  /**
   * region(하이브리드) 편집의 합성 fallback을 patch/lines 와 동일하게 grounded 재시도한다 — **경로 수렴**
   * (핸드오프 §6 ④: 앵커 실패 → 다시 읽고 재인용, 절대 전체 재생성 안 함).
   *
   * 종전엔 region 합성이 실패하면(내용손실·root-tag·빈출력·앵커미해소) 무조건 full 재생성으로 떨어졌는데,
   * 그 full 경로가 약한 sLLM이 대형 단일컴포넌트 파일을 통째로 환각하는 가장 위험한 길이다. region locate는
   * 이미 **정확한 영역(실제 디스크 텍스트)**을 알고 있으므로, 그 영역만 그대로 인용해 surgical `<patch>` 로
   * 1회 재요청하면 full 환각을 피하고 국소 수정으로 수렴한다. ground truth가 이미 손에 있어 grounding 비용 0.
   *
   * 안전장치(하나라도 어긋나면 false → 종전 full 폴백, 회귀 0):
   *  - groundedRetry 설정 off면 false.
   *  - locatedRegion(영역 ground truth)이 없으면 false — locate 단계 fallback(영역 미확정)은 grounding 불가.
   *  - 사유가 REGION_GROUNDABLE_REASONS 가 아니면 false — 의존성 미해소 등 영역 밖 선언이 필요한 건 patch로
   *    못 풀어 기존 full(또는 의존성 dead-end 자동 재시도)에 맡긴다.
   *  - 재시도 결과는 _handleAxiomAction(groundedRetryDone=true)로 처리 → patch가 또 실패해도 재-grounding
   *    안 함(정확히 1회). intent는 비워 누적 히스토리의 원래 요청이 변경 의도를 전달하게 한다(stub 케이스와 동일).
   */
  private async _tryGroundedRegionRetry(
    filePath: string,
    outcome: RegionEditOutcome,
  ): Promise<boolean> {
    const cfg = ExtensionConfig.getMultiPatchConfig();
    if (!cfg.groundedRetry) return false;
    const lr = outcome.locatedRegion;
    if (!lr || !lr.text.trim()) return false;
    if (!REGION_GROUNDABLE_REASONS.has(outcome.reason ?? '')) return false;

    const grounded: GroundedPatchRegion[] = [
      { index: 0, intent: '', realText: lr.text, startLine: lr.startLine, endLine: lr.endLine },
    ];

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔁 grounded(region) 재시도 (${filePath}): region 합성 실패(${outcome.reason}) → ` +
      `실제 영역(라인 ${lr.startLine}~${lr.endLine})만으로 surgical patch 재요청 (full 재생성 회피)`,
    );
    this._post({
      type: 'token',
      content: '\n\n> 🔁 **바꿀 영역의 실제 코드만으로 patch를 다시 만드는 중…** (전체 재생성 대신, 1회)\n',
    });

    const config = ExtensionConfig.getEffectiveLlmConfig();
    const resp = await this._retryForAxiomAction(filePath, config, { groundedPatches: grounded });
    if (!resp) return false;
    await this._handleAxiomAction(resp, false, true);
    return true;
  }

  /**
   * assistant 응답을 히스토리에 저장하기 직전 호출.
   * `<axiom-action>` 제거 + 본문에 남은 큰 코드 펜스(```lang ... ```)를
   * `[코드 블록 N줄 — 파일에 반영됨]` stub으로 치환해 누적 토큰을 줄인다.
   *
   * 작은 인라인 스니펫(8줄 이하)은 설명 맥락 유지를 위해 그대로 둔다.
   */
  private _compressForHistory(text: string): string {
    const withoutAction = this._stripActionBlock(text);
    return withoutAction.replace(
      /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g,
      (_full, lang: string, body: string) => {
        const lineCount = body.split('\n').length;
        if (lineCount <= 8) return _full; // 짧은 스니펫은 유지
        const label = lang ? `${lang} ` : '';
        return `\`[${label}코드 블록 ${lineCount}줄 — 파일에 반영됨]\``;
      },
    );
  }

  /**
   * "설명만 출력하고 axiom-action 래핑은 깜빡한" 케이스를 LLM 재호출 없이 처리.
   *
   * 두 가지 누락 패턴을 감지하여 axiom-action으로 래핑한다:
   *   1. bare `<patch>...</patch>` 블록 (외곽 `<axiom-action>` 누락) → patch 모드로 래핑
   *   2. ```tsx/ts/jsx/js 코드 블록 → full 모드로 래핑 (마지막 큰 블록)
   *
   * patch 패턴이 먼저 우선 — 다중 patch 시나리오에서 모델이 가장 자주 흘리는 케이스.
   */
  /** `<import module="..." named="a, b" default="X" />` 속성을 ImportRequest로 파싱한다. */
  private _parseImportTag(attrs: string): ImportRequest | null {
    const module = attrs.match(/\bmodule\s*=\s*["']([^"']+)["']/)?.[1];
    if (!module) return null;
    const namedRaw = attrs.match(/\bnamed\s*=\s*["']([^"']*)["']/)?.[1];
    const def = attrs.match(/\bdefault\s*=\s*["']([^"']+)["']/)?.[1];
    const named = namedRaw
      ? namedRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return { module, named, def };
  }

  private _wrapCodeBlockAsAxiomAction(response: string, filePath: string): string | null {
    if (!filePath) return null;

    const domain = this._scaffoldBuilder.extractDomainFromFilePath(filePath);

    // 1차: bare <patch>...</patch> 블록 감지. 외곽 <axiom-action>이 없을 때만.
    if (!/<axiom-action>/.test(response)) {
      const patchMatches = [...response.matchAll(/<patch>\s*([\s\S]*?)\s*<\/patch>/g)];
      if (patchMatches.length > 0) {
        // 유효한 search/replace 쌍이 있는지 검증 — 어느 하나라도 통과하면 래핑
        const valid = patchMatches.some((pm) => {
          const inner = pm[1];
          return /<search>[\s\S]*?<\/search>/.test(inner) && /<replace>[\s\S]*?<\/replace>/.test(inner);
        });
        if (valid) {
          const meta = JSON.stringify({
            action: 'updateFile',
            mode: 'patch',
            templateType: 'page',
            domain: domain ?? '',
            filePath,
          });
          const patchBody = patchMatches.map((pm) => `<patch>\n${pm[1]}\n</patch>`).join('\n');
          return `<axiom-action>\n${meta}\n${patchBody}\n</axiom-action>`;
        }
      }
    }

    // 2차: ```tsx/ts/jsx/js 코드 블록 → full 모드 래핑 (기존 동작)
    const codeBlockRegex = /```(?:tsx|ts|jsx|js|typescript|javascript)\n([\s\S]*?)```/g;
    let lastMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = codeBlockRegex.exec(response)) !== null) {
      lastMatch = m;
    }
    if (!lastMatch) return null;

    const code = lastMatch[1].trimEnd();
    // 너무 짧은 스니펫은 전체 파일이 아닐 가능성 — 래핑 보류
    if (code.length < 80) return null;

    const meta = JSON.stringify({
      action: 'updateFile',
      mode: 'full',
      templateType: 'page',
      domain: domain ?? '',
      filePath,
    });

    return `<axiom-action>\n${meta}\n\`\`\`tsx\n${code}\n\`\`\`\n</axiom-action>`;
  }

  /**
   * structural 편집이 참조하는 top-level 타입(예: TEmployee)이 파일에 없어 의존성 미해소로
   * **full 전체 재생성**되기 직전에 호출한다. 그 **타입 선언만** 모델에 짧게 물어(작은 출력) 반환한다.
   * 성공하면 호출부가 structural에 주입해 전체 파일 재생성 없이 surgical 편집을 유지한다.
   *
   * - 타입 후보(PascalCase, 언더스코어 없는 식별자)만 대상 — SCREAMING_SNAKE 상수 등은 제외.
   * - 누적 history(이번 턴의 참조 스펙 포함)를 재사용하므로 스펙을 다시 주입하지 않는다.
   * - 코드펜스 제거 후 `splitTsSections`로 type/interface 선언만 걸러 반환(모델이 곁가지 코드를 붙여도 안전).
   * @returns 모듈 스코프에 주입할 `type TX = {…}` 텍스트, 또는 null(후보 없음·무응답·추출 실패).
   */
  private async _retryStructuralMissingTypes(
    unresolved: string[],
    config: ReturnType<typeof ExtensionConfig.getEffectiveLlmConfig>,
  ): Promise<string | null> {
    const typeNames = unresolved.filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n));
    if (typeNames.length === 0) return null;

    this._post({
      type: 'token',
      content: `\n\n> 🧩 **빠진 타입 선언(\`${typeNames.join('`, `')}\`)만 생성 중…** (전체 재생성 회피)\n`,
    });

    const prompt = `직전 구조적 편집이 참조한 타입 ${typeNames.map((n) => `\`${n}\``).join(', ')} 의 선언이 현재 파일에 없습니다.
그 **타입 선언만** 출력하세요. 규칙(엄수):
- 다른 코드·import·주석·설명·axiom-action 없이 TypeScript \`type\` 선언들만 코드펜스(\`\`\`ts) 하나에 담을 것.
- API 응답/요청 타입의 필드명은 **위 대화의 참조 스펙 response 스키마**를 그대로 따르고, \`T\` 접두사를 쓸 것.
- 참조가 걸린 하위 타입도 함께 선언(예: \`type TXxxResponse = { data: TXxx[] }\`).
\`\`\`ts
type ${typeNames[0]} = { /* 스펙 필드 */ };
\`\`\``;

    const messages: ChatMessage[] = [...this._history, { role: 'user', content: prompt }];
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 60_000);
    const relay = () => abort.abort();
    this._abortController?.signal.addEventListener('abort', relay, { once: true });

    let resp = '';
    try {
      for await (const token of this._llm.streamChat(messages, config, abort.signal)) {
        resp += token;
        this._post({ type: 'token', content: token });
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      this._abortController?.signal.removeEventListener('abort', relay);
    }

    // 코드펜스 제거 후 type/interface 선언만 추출 — 모델이 곁가지 코드를 붙여도 걸러진다.
    const stripped = resp.replace(/```[a-zA-Z]*\n?/g, '');
    const decls = splitTsSections(stripped)
      .filter((s) => s.kind === 'type' || s.kind === 'interface')
      .map((s) => s.body.trim())
      .filter(Boolean);
    if (decls.length === 0) return null;
    return decls.join('\n\n');
  }

  /**
   * 출력이 <axiom-action> 닫는 태그 전에 잘렸을 때(주로 출력 토큰 소진/모델 변동성) 동일 요청을
   * 1회 재생성한다. 신규 파일 생성 컨텍스트는 update 전용 폴백(_retryForAxiomAction)을 쓸 수 없어
   * 데드엔드가 났던 지점 — 여기서 같은 messages로 다시 받되 재-잘림을 줄이려 max_tokens를 끌어올린다
   * (이미 더 크면 그대로). 스트리밍을 그대로 흘려 사용자에게 진행이 보이게 한다.
   */
  private async _regenerateTruncated(
    messages: ChatMessage[],
    config: ReturnType<typeof ExtensionConfig.getEffectiveLlmConfig>,
  ): Promise<string> {
    const boosted = { ...config, maxTokens: Math.max(config.maxTokens, 16384) };
    this._post({
      type: 'token',
      content: '\n\n---\n> 🔄 **응답이 잘려 다시 생성 중…** (출력 토큰 한도를 높여 1회 재요청)\n\n',
    });
    let resp = '';
    for await (const token of this._llm.streamChat(messages, boosted, this._abortController?.signal)) {
      resp += token;
      this._post({ type: 'token', content: token });
    }
    return resp;
  }

  /**
   * 시나리오 C 응답에서 axiom-action·코드 블록 모두 누락된 경우 보강 요청.
   *
   * **system prompt를 재전송하지 않는다** — 누적된 히스토리에 짧은 가이드만 덧붙여
   * 새로운 호출의 토큰 비용을 최소화한다.
   *
   * @returns 보강 응답 전체 문자열, 실패 시 null
   */
  /**
   * full 재시도 응답에서 `<axiom-action>` 래퍼가 누락됐을 때, 본문의 코드 펜스를
   * full 모드 axiom-action 블록으로 합성한다. 약한 모델이 전체 파일을 코드 펜스로만
   * 내놓는 흔한 실패를 결정론적으로 복구한다.
   *
   * full 재시도는 대상 파일·모드·도메인이 이미 확정돼 있어 모호함이 없다.
   * 여러 펜스가 있으면 **가장 긴** 펜스를 전체 파일로 본다(부수 스니펫 회피).
   *
   * @returns 합성된 axiom-action 문자열, 추출 실패 시 null
   */
  private _synthesizeFullActionFromFence(
    response: string,
    filePath: string,
    domain: string | null,
  ): string | null {
    let best = '';
    for (const m of response.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)) {
      const code = m[1].replace(/\n$/, '');
      if (code.length > best.length) best = code;
    }
    if (!best.trim()) return null;
    const lang = /\.tsx$/.test(filePath) ? 'tsx' : /\.ts$/.test(filePath) ? 'ts' : '';
    const meta = `{"action":"updateFile","mode":"full","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}`;
    return `<axiom-action>\n${meta}\n\`\`\`${lang}\n${best}\n\`\`\`\n</axiom-action>`;
  }

  private async _retryForAxiomAction(
    filePath: string,
    config: ReturnType<typeof ExtensionConfig.getEffectiveLlmConfig>,
    opts: { reactViolation?: string; forceFull?: boolean; groundedPatches?: GroundedPatchRegion[] } = {},
  ): Promise<string | null> {
    const { reactViolation, groundedPatches } = opts;
    // "Full로 재시도" 버튼 또는 React 위반 재시도는 full 모드를 강제한다.
    // patch 재시도는 약한 모델이 원본에 없는 코드로 <search>를 또 만들어 무한 실패하기 때문이다.
    // 단, grounded 재시도는 실제 텍스트를 주입해 patch 모드를 유지한다(full 강제 안 함).
    const forceFull = !groundedPatches && (opts.forceFull || !!reactViolation);

    this._post({
      type: 'token',
      content: groundedPatches
        ? '\n\n---\n> 🔁 **매칭된 실제 코드 기준으로 patch 재작성 중…**\n\n'
        : reactViolation
        ? '\n\n---\n> 🔄 **훅 위치를 고쳐서 다시 생성 중…** (전체 파일을 full 모드로 다시 받습니다)\n\n'
        : forceFull
        ? '\n\n---\n> 🔄 **전체 파일을 다시 생성 중…** (현재 파일을 기준으로 full 모드로 받습니다)\n\n'
        : '\n\n---\n> 🔄 **파일 수정 코드 보강 요청…** (설명만 받아서 수정 코드를 별도 요청합니다)\n\n',
    });

    const domain = this._scaffoldBuilder.extractDomainFromFilePath(filePath);
    const mp = ExtensionConfig.getMultiPatchConfig();
    const lang = /\.tsx$/.test(filePath) ? 'tsx' : /\.ts$/.test(filePath) ? 'ts' : '';

    // full 모드 강제 시: 히스토리 압축으로 사라진 원본 대신 현재 파일을 다시 읽어 기준으로 제공한다.
    // patch 실패·위반 차단 시점엔 아직 디스크에 쓰지 않았으므로 "현재 파일 = 수정 대상 원본"이 보장된다.
    // 이 경로는 항상 기존 파일 수정이다(신규 파일 생성은 이 폴백으로 오지 않음).
    let currentFileBlock = '';
    // Scaffold 계약 카드(useApi 등) — region/structural 경로는 buildContractSection으로 계약을 주입하지만,
    // full 자동 폴백은 systemPrompt(coreRules)를 재전송하지 않고 압축된 _history만 보내 그 계약이 통째로
    // 유실됐다(약한 모델이 useApi 대신 생짜 fetch로 회귀하던 근본 원인). 폴백에도 관련 계약 카드를
    // 결정론적으로 재주입해 scaffold 규칙(useApi 필수 등)을 다시 가르친다. 트리거 미발동이면 빈 문자열.
    let contractBlock = '';
    // grounded 재시도는 실제 텍스트를 직접 주입하므로 제외하고, 그 외 모든 재시도(forceFull·보강·patch)에
    // 현재 파일 전체를 다시 주입한다. 재시도는 system prompt(파일 fileSection 포함)를 재전송하지 않고 _history만
    // 보내므로(4958~), currentFileBlock이 없으면 모델이 파일을 전혀 못 봐 파일명만으로 내용을 환각한다
    // (실측: 빈 EmployeeListPage.tsx에 useState/Employee/employeeService import를 지어내 <search> 매칭 실패).
    if (!groundedPatches && filePath) {
      const { originalContent } = await this._fileCreator.readFileContent({
        action: 'updateFile', templateType: 'page', domain: domain ?? '', componentName: '', filePath,
      });
      if (originalContent) {
        const sel = this._lastSelectionLineRange;
        const selNote = sel ? ` (원래 수정 요청 영역: 라인 ${sel.startLine}~${sel.endLine})` : '';
        currentFileBlock = `\n\n아래는 **현재 \`${filePath}\` 파일의 실제 전체 내용**입니다. 직전 응답을 신뢰하지 말고 반드시 이것을 기준으로 작성하세요.${selNote}\n\`\`\`${lang}\n${originalContent}\n\`\`\`\n`;
        // deps=현재 파일 + query=직전 사용자 요청으로 트리거 판정(현재 파일엔 useApi가 없어도 요청이
        // "api/데이터/조회"를 언급하면 use-api 카드가 발동한다).
        const contractSection = buildContractSection({ deps: originalContent, region: '', query: this._lastUserQuery });
        if (contractSection) {
          contractBlock = `\n\n${contractSection}\n`;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] full 폴백에 scaffold 계약 카드 재주입 (${filePath})`,
          );
        }
      }
    }

    const fullActionBlock = `<axiom-action>
{"action":"updateFile","mode":"full","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 요청이 반영된 전체 파일 내용
\`\`\`
</axiom-action>`;

    let retryMsg: string;
    if (groundedPatches && groundedPatches.length > 0) {
      // grounded 재시도 — 매칭 실패 부분의 실제 코드를 주입하고, 그 텍스트를 그대로 <search>에
      // 쓰게 한다. 모델이 기억으로 search를 재구성하지 않으므로 매칭률이 크게 오른다(patch 모드 유지).
      const regionBlocks = groundedPatches
        .map((g, i) => {
          const intentBlock = g.intent.trim()
            ? `\n→ 이 부분에 적용할 변경(직전 의도):\n\`\`\`${lang}\n${g.intent}\n\`\`\``
            : '';
          return `[#${i + 1}] 실제 현재 코드 (라인 ${g.startLine}~${g.endLine}):
\`\`\`${lang}
${g.realText}
\`\`\`${intentBlock}`;
        })
        .join('\n\n');

      retryMsg = `직전 patch의 일부 \`<search>\`가 현재 파일과 매칭되지 않았습니다. 파일이 커서 본문이 자리표시자(스텁)로 잘려 전달됐거나, 모델이 기억으로 만든 \`<search>\`가 실제 코드와 글자 단위로 달랐기 때문입니다.

아래는 수정 대상 부분의 **실제 현재 코드**입니다. 위 대화의 원래 요청을 이 실제 코드에 반영하세요. 각 부분에 대해 \`<patch>\` 블록을 출력하되, \`<search>\`에는 아래 '실제 현재 코드'에서 **바꿀 줄 주변만 그대로 복사**하세요(공백·들여쓰기 포함, 토큰을 임의로 바꾸거나 추가하지 마세요). \`<replace>\`는 변경을 반영한 결과입니다. 자리표시자(스텁) 주석은 절대 \`<search>\`에 넣지 마세요.

${regionBlocks}

위 ${groundedPatches.length}개 부분을 \`<patch>\` 블록 ${groundedPatches.length}개로 출력하세요(부가 설명 없이 블록만):
<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
<patch>
<search>위 '실제 현재 코드'에서 그대로 복사</search>
<replace>변경이 반영된 코드</replace>
</patch>
<!-- 부분마다 <patch> 블록 1개씩, 총 ${groundedPatches.length}개 -->
</axiom-action>`;
    } else if (reactViolation) {
      // React 규칙 위반 — full 모드로 전체 파일을 다시 받아 훅을 컴포넌트 본문 안으로 옮긴다.
      retryMsg = `직전 응답이 **React Rules of Hooks 위반**으로 거부되었습니다: ${reactViolation}

원인: \`useState\`/\`useApi\` 등 \`use*\` 훅을 \`export default function ComponentName(): React.ReactNode { ... }\` 블록 **바깥**(import 아래·type 선언 옆 등 모듈 최상위)에 두었습니다. 같은 훅이 모듈 스코프와 컴포넌트 본문에 **중복**으로 존재할 수도 있습니다.
${currentFileBlock}
아래 규칙으로 **full 모드로 전체 파일만** 출력하세요(patch 금지, 부가 설명 없이 블록만):
1. 모듈 최상위에 있던 모든 \`use*\` 훅 호출을 컴포넌트 함수 본문 **안쪽 최상위**(다른 훅 옆, \`return\` 위)로 이동
2. 모듈 스코프에 남은 중복 훅 선언은 **삭제** (컴포넌트 본문 안에 한 벌만 존재)
3. \`type\` 선언과 순수 상수는 모듈 스코프에 그대로 둠 (훅만 이동)

${fullActionBlock}`;
    } else if (forceFull) {
      // patch 매칭 실패 후 "Full로 재시도" — patch를 다시 쓰지 말고 현재 파일 기준 full 전체 출력.
      retryMsg = `직전 patch가 현재 파일과 매칭되지 않았습니다. 모델이 **원본에 존재하지 않는 코드**를 \`<search>\`에 넣었기 때문입니다(예: 실제로 없는 import·변수). patch를 다시 쓰지 말고 **full 모드로 전체 파일만** 출력하세요.
${currentFileBlock}${contractBlock}
위 대화의 원래 요청을 반영해, **위 현재 파일 전체를 기준으로** 변경분을 적용한 전체 파일 내용을 출력하세요(부가 설명 없이 블록만).

- 기존 코드는 실제 현재 파일 내용만 근거로 하고, 원본에 없던 import·훅·변수를 **임의로 지어내지 마세요**.
- **데이터 출처 우선순위**: 화면에 표시할 목록/데이터는 **이미 이 파일에 있는 데이터 출처**(\`getArr()\`·\`getProd()\` 같은 함수·상수·하드코딩 배열)가 있으면 **그것을 그대로 사용**하세요 — 예: "getProd 결과를 테이블로 표현" → 새 API가 아니라 기존 \`getProd()\`를 \`.map()\`으로 렌더. 사용자가 "API/엔드포인트로 **불러와·조회·연동**"을 **명시하지 않는 한** 새 \`useApi\`나 \`/api/…\` 엔드포인트를 **지어내지 마세요**(엉뚱한 엔티티·엔드포인트 환각의 주원인).
- 데이터가 파일에 없고 사용자가 실제로 API 조회를 원할 때만 \`useApi\`(@axiom/hooks)로 가져오고, 그때도 생짜 \`fetch\`/\`axios\`/\`useQuery\`/\`useState\`+\`useEffect\` 미러링은 쓰지 마세요:

${fullActionBlock}`;
    } else if (mp.enabled) {
      retryMsg = `위 응답의 수정 내용을 아래 형식 중 하나로만 출력하세요(부가 설명 없이 블록만).
${currentFileBlock}${contractBlock}
⚠️ **\`<search>\` 규칙: 반드시 위 '현재 파일의 실제 전체 내용'에 지금 존재하는 코드만 그대로 복사. 원본에 없는 import·훅·변수를 지어내면 매칭 실패.**
- import 추가: \`<search>기존 import 줄</search><replace>기존 import 줄\\n새 import 줄</replace>\`
- state/hook 추가: \`<search>기존 훅 선언 줄</search><replace>기존 훅 선언 줄\\n새 훅 선언 줄</replace>\`

국소 수정 — \`<patch>\` 블록을 1~${mp.maxPatches}개 출력:
<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
<patch>
<search>원본에 존재하는 코드(공백·들여쓰기 포함, 전후 맥락 ${mp.minContextLines}줄)</search>
<replace>교체할 새 코드</replace>
</patch>
<!-- 필요하면 <patch> 블록을 추가로 더 출력. 각 <search>는 원본 파일 기준. -->
</axiom-action>

전체 재작성이 필요하면:
<axiom-action>
{"action":"updateFile","mode":"full","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 변경사항이 반영된 전체 파일 내용
\`\`\`
</axiom-action>`;
    } else {
      retryMsg = `위 응답의 수정 내용을 아래 형식 중 하나로만 출력하세요(부가 설명 없이 블록만).
${currentFileBlock}${contractBlock}
⚠️ \`<search>\`에는 위 '현재 파일의 실제 전체 내용'에 존재하는 코드만 그대로 복사하세요(원본에 없는 코드 지어내기 금지).

연속된 한 블록만 바뀌면:
<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
<patch>
<search>원본에서 찾을 코드(공백·들여쓰기 포함, 전후 맥락 ${mp.minContextLines}줄)</search>
<replace>교체할 새 코드</replace>
</patch>
</axiom-action>

import 변경 또는 2곳 이상 수정이면:
<axiom-action>
{"action":"updateFile","mode":"full","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 변경사항이 반영된 전체 파일 내용
\`\`\`
</axiom-action>`;
    }

    this._history.push({ role: 'user', content: retryMsg });

    // system prompt 재전송 없이 누적 히스토리만으로 호출
    const retryMessages: import('../ai/types').ChatMessage[] = [
      ...this._history,
    ];

    // 재시도 전용 AbortController: 메인 중단 또는 3분 타임아웃 시 중단
    const retryAbort = new AbortController();
    const RETRY_TIMEOUT_MS = 180_000;
    let timedOut = false;
    const retryTimeoutId = setTimeout(() => {
      timedOut = true;
      retryAbort.abort();
    }, RETRY_TIMEOUT_MS);
    const mainSignal = this._abortController?.signal;
    const mainAbortHandler = () => retryAbort.abort();
    mainSignal?.addEventListener('abort', mainAbortHandler, { once: true });

    let elapsedSec = 0;
    this._postStatus(`파일 수정 재요청 중… (0초)`);
    const elapsedTimer = setInterval(() => {
      elapsedSec++;
      this._postStatus(`파일 수정 재요청 중… (${elapsedSec}초)`);
    }, 1000);

    let retryResponse = '';
    try {
      for await (const token of this._llm.streamChat(
        retryMessages,
        config,
        retryAbort.signal,
      )) {
        retryResponse += token;
        this._post({ type: 'token', content: token });
      }
    } catch (err) {
      if (timedOut) {
        this._corpusOutputChannel.appendLine(`[Axiom AI] 재시도 타임아웃 (${RETRY_TIMEOUT_MS / 1000}초 초과)`);
        this._post({
          type: 'token',
          content: `\n\n> ⚠️ 재시도 응답 시간이 초과되었습니다 (${RETRY_TIMEOUT_MS / 1000}초). 파일이 너무 크거나 모델이 느립니다. 요청을 더 작은 단위로 나눠 보내주세요.`,
        });
      } else if ((err as Error).name !== 'AbortError') {
        this._corpusOutputChannel.appendLine(`[Axiom AI] 재시도 스트림 오류: ${(err as Error).message}`);
      }
      return null;
    } finally {
      clearTimeout(retryTimeoutId);
      mainSignal?.removeEventListener('abort', mainAbortHandler);
      clearInterval(elapsedTimer);
    }

    // ⚠️ 처리부 _handleAxiomAction은 완결된 <axiom-action>…</axiom-action> '쌍'을 요구한다.
    // 게이트도 동일한 쌍 매칭으로 판정해야 한다 — 여는 태그만 보는 .includes()로 통과시키면,
    // 닫는 태그가 없는 응답을 '포함'으로 넘겨 처리부가 0개로 판정하고 무음 정지하는 불일치가 생긴다.
    let hasBlock = /<axiom-action>[\s\S]*?<\/axiom-action>/.test(retryResponse);

    // 여는 <axiom-action>는 있는데 닫는 태그가 없는 경우(약한 모델이 응답 중간에 잘림) — 끝에 닫는
    // 태그를 보정 삽입해 쌍 매칭이 되도록 복구한다. 이 복구가 없으면 위 불일치로 데드엔드(무음 정지).
    if (!hasBlock && /<axiom-action>/.test(retryResponse) && !/<\/axiom-action>/.test(retryResponse)) {
      const repaired = retryResponse.replace(/\s*$/, '') + '\n</axiom-action>';
      if (/<axiom-action>[\s\S]*?<\/axiom-action>/.test(repaired)) {
        retryResponse = repaired;
        hasBlock = true;
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 🔧 재시도: </axiom-action> 닫는 태그 누락 → 보정 삽입 (${filePath})`,
        );
      }
    }

    // full 재시도인데 모델이 <axiom-action> 래퍼를 빠뜨리고 코드 펜스만 출력한 경우(약한 모델 흔한 실패).
    // 재시도 컨텍스트는 대상 파일·모드(full)·도메인이 확정돼 있으므로, 본문의 코드 펜스를
    // full 액션으로 결정론적으로 합성해 데드엔드를 복구한다. (긴 파일에서 특히 자주 발생)
    if (!hasBlock && forceFull) {
      const synthesized = this._synthesizeFullActionFromFence(retryResponse, filePath, domain);
      if (synthesized) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 🔧 full 재시도: <axiom-action> 래퍼 누락 → 코드 펜스에서 full 액션 합성 (${filePath})`,
        );
        retryResponse = synthesized;
        hasBlock = true;
      }
    }

    // grounded 재시도인데 모델이 <axiom-action> 래퍼를 빠뜨리고 <patch> 블록만 출력한 경우 — 래핑 복구.
    if (!hasBlock && groundedPatches) {
      const wrapped = this._wrapCodeBlockAsAxiomAction(retryResponse, filePath);
      if (wrapped) {
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] 🔧 grounded 재시도: <axiom-action> 래퍼 누락 → <patch> 블록을 래핑 (${filePath})`,
        );
        retryResponse = wrapped;
        hasBlock = true;
      }
    }

    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 재시도 결과: axiom-action ${hasBlock ? '포함' : '여전히 누락'}`,
    );

    const cleanedRetry = this._compressForHistory(retryResponse);
    this._history.push({ role: 'assistant', content: cleanedRetry });

    if (!hasBlock) {
      this._post({
        type: 'token',
        content: '\n\n> ⚠️ 재시도 후에도 파일 수정 블록이 생성되지 않았습니다. 요청을 더 작은 단위로 나눠 보내주세요.',
      });
      return null;
    }

    return retryResponse;
  }

  // ─── .axiom/ watcher ─────────────────────────────────────────────────────────

  private _registerAxiomWatcher(context: vscode.ExtensionContext): void {
    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) return;
    try {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(axiomDir), '**/*.md');
      this._axiomWatcher = vscode.workspace.createFileSystemWatcher(pattern);

      // .axiom/knowledge/ 변경 시 RAG 재빌드
      const knowledgeSep = path.sep + 'knowledge' + path.sep;
      const onKnowledgeChange = (uri: vscode.Uri) => {
        if (uri.fsPath.includes(knowledgeSep)) {
          this._scaffoldBuilder.invalidateAndRebuild();
        }
      };

      context.subscriptions.push(
        this._axiomWatcher,
        this._axiomWatcher.onDidChange(onKnowledgeChange),
        this._axiomWatcher.onDidCreate(onKnowledgeChange),
        this._axiomWatcher.onDidDelete(onKnowledgeChange),
      );
    } catch {
      // axiomDir가 아직 없을 수 있음
    }
  }

  private _unregisterAxiomWatcher(): void {
    this._axiomWatcher?.dispose();
    this._axiomWatcher = null;
  }

  // ─── 외부 corpus / stubs watcher ─────────────────────────────────────────────

  private _registerExternalCorpusWatcher(context: vscode.ExtensionContext): void {
    const { folder } = ExtensionConfig.getUserRagSources();
    if (!folder) return;

    try {
      const watchPattern = new vscode.RelativePattern(vscode.Uri.file(folder), '**/*.md');
      this._externalWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

      const rebuild = () => {
        if (this._externalWatcherDebounce) clearTimeout(this._externalWatcherDebounce);
        this._externalWatcherDebounce = setTimeout(() => {
          this._corpusOutputChannel.appendLine('[hot-reload] External corpus changed, rebuilding index...');
          this._scaffoldBuilder.invalidateAndRebuild();
        }, 500);
      };

      context.subscriptions.push(
        this._externalWatcher,
        this._externalWatcher.onDidChange(rebuild),
        this._externalWatcher.onDidCreate(rebuild),
        this._externalWatcher.onDidDelete(rebuild),
      );
    } catch {
      this._corpusOutputChannel.appendLine(`[warn] 외부 corpus 감시자 등록 실패: ${folder}`);
    }
  }

  private _unregisterExternalCorpusWatcher(): void {
    if (this._externalWatcherDebounce) { clearTimeout(this._externalWatcherDebounce); this._externalWatcherDebounce = null; }
    this._externalWatcher?.dispose();
    this._externalWatcher = null;
  }

  private _registerUserStubsWatcher(context: vscode.ExtensionContext): void {
    const folder = ExtensionConfig.getUserStubsFolder();
    if (!folder) return;

    try {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(folder), '**/*.md');
      this._userStubsWatcher = vscode.workspace.createFileSystemWatcher(pattern);

      const reload = () => {
        if (this._userStubsDebounce) clearTimeout(this._userStubsDebounce);
        this._userStubsDebounce = setTimeout(() => {
          this._corpusOutputChannel.appendLine('[hot-reload] User stubs changed, reloading...');
          this._llm.reloadStubs();
        }, 500);
      };

      context.subscriptions.push(
        this._userStubsWatcher,
        this._userStubsWatcher.onDidChange(reload),
        this._userStubsWatcher.onDidCreate(reload),
        this._userStubsWatcher.onDidDelete(reload),
      );
    } catch {
      this._corpusOutputChannel.appendLine(`[warn] 사용자 stubs 감시자 등록 실패: ${folder}`);
    }
  }

  private _unregisterUserStubsWatcher(): void {
    if (this._userStubsDebounce) { clearTimeout(this._userStubsDebounce); this._userStubsDebounce = null; }
    this._userStubsWatcher?.dispose();
    this._userStubsWatcher = null;
  }

  // ─── 페이지 생성 플로우 ───────────────────────────────────────────────────────

  /**
   * 페이지 생성 플로우 진입점.
   * 도메인 자동 감지를 시도하고, 불명확하면 대화형으로 도메인을 확인한다.
   */
  private async _startPageCreation(pageName: string | null, originalText: string): Promise<void> {
    this._history.push({ role: 'user', content: originalText });

    // 사용자가 쿼리에서 도메인을 **명시**했는지("example 도메인에") 결정론적으로 추출한다. 명시했으면
    // 에디터 경로 추측·확인 되묻기를 건너뛰고 그 도메인으로 바로 진행한다(충돌 안전망은 유지).
    const explicitDomain = this._extractExplicitDomainMention(originalText);

    // 페이지명을 추출하지 못했으면(순수 한국어 이름) 영문 PascalCase 이름을 먼저 되묻는다.
    if (!pageName) {
      this._pageCreationState = {
        pageName: '',
        domainCandidates: [],
        waitingForName: true,
        waitingForDomain: false,
        resolvedDomain: null,
        explicitDomain, // 이름 되묻기 라운드트립을 넘겨 유지
      };
      this._post({
        type: 'token',
        content:
          '생성할 페이지의 **영문 이름**을 PascalCase로 입력해주세요.\n예: `EmployeeList2Page`, `AccountListPage` (취소: `/cancel`)',
      });
      this._post({ type: 'done' });
      this._postStatus('페이지 생성 — 영문명 입력 대기');
      return;
    }

    await this._promptForDomain(pageName, explicitDomain);
  }

  /**
   * 쿼리에서 도메인을 **명시적으로 지목**한 경우만 그 도메인명을 추출한다("example 도메인에"·"order 업무"·
   * "user domain"). PascalCase 페이지명 추론(ProductListPage→product)은 **배제**한다 — 이 값은 "확인
   * 되묻기 생략" 게이트라, 사용자가 도메인을 진짜로 말했을 때만 확실히 반응해야 과다추출로 엉뚱한 도메인에
   * 조용히 생성되는 사고를 막는다. 없으면 null(종전 에디터 감지·되묻기 흐름 유지).
   */
  private _extractExplicitDomainMention(text: string): string | null {
    const m = text.match(/([A-Za-z][A-Za-z0-9-]*)\s*(?:도메인|domain|업무)/i);
    return m ? m[1].toLowerCase() : null;
  }

  /**
   * 페이지명이 확정된 뒤 대상 도메인을 결정한다. 쿼리에 도메인이 명시됐으면 그대로 진행하고,
   * 아니면 에디터 감지 → 단일/복수 도메인 선택 되묻기로 폴백한다.
   */
  private async _promptForDomain(pageName: string, explicitDomain: string | null = null): Promise<void> {
    // 0. 쿼리에 도메인이 명시됐으면("example 도메인에") 확인 되묻기 없이 바로 생성으로 진행한다.
    // 사용자가 이미 도메인을 말했는데 다시 "맞나요?"를 묻는 건 스마트하지 않다(분류기도 이 슬롯을 맞힌다).
    // 파괴 방지 충돌 안전망(_maybeGenerateOrAskCollision: 파일 존재 시 되묻기)은 그대로 통과한다.
    if (explicitDomain) {
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 페이지 생성 도메인 — 쿼리 명시 "${explicitDomain}" 사용(에디터 감지·확인 되묻기 생략)`,
      );
      await this._maybeGenerateOrAskCollision(pageName, explicitDomain);
      return;
    }

    // 1. 현재 에디터 파일 경로에서 도메인 자동 감지
    const editorDomain = this._detectDomainFromEditor();

    if (editorDomain) {
      // 에디터 경로에서 도메인 감지 성공 → 확인 질문
      this._pageCreationState = {
        pageName,
        domainCandidates: [editorDomain],
        waitingForDomain: true,
        resolvedDomain: null,
      };
      this._post({
        type: 'token',
        content: `**${pageName}** 페이지를 **\`${editorDomain}\`** 도메인에 생성하겠습니다.\n\n맞으면 **네** 를 입력해주세요. 다른 도메인이라면 도메인명을 직접 입력해주세요. (취소: \`/cancel\`)`,
      });
      this._post({ type: 'done' });
      this._postStatus(`페이지 생성 대기 — ${pageName}`);
      return;
    }

    // 2. src/domains/ 스캔으로 도메인 목록 확인
    const domainList = this._scanWorkspaceDomains();

    if (domainList.length === 0) {
      // 도메인 없음 → 직접 입력 요청
      this._pageCreationState = {
        pageName,
        domainCandidates: [],
        waitingForDomain: true,
        resolvedDomain: null,
      };
      this._post({
        type: 'token',
        content: `**${pageName}** 페이지를 생성합니다.\n\n\`src/domains/\` 폴더를 찾을 수 없습니다. 생성할 도메인명을 직접 입력해주세요.\n예: \`account\`, \`order\`, \`user\` (취소: \`/cancel\`)`,
      });
      this._post({ type: 'done' });
      this._postStatus(`페이지 생성 대기 — ${pageName}`);
      return;
    }

    if (domainList.length === 1) {
      // 단일 도메인 → 확인 질문
      this._pageCreationState = {
        pageName,
        domainCandidates: domainList,
        waitingForDomain: true,
        resolvedDomain: null,
      };
      this._post({
        type: 'token',
        content: `**${pageName}** 페이지를 **\`${domainList[0]}\`** 도메인에 생성하겠습니다.\n\n맞으면 **네** 를 입력해주세요. 다른 도메인이라면 도메인명을 직접 입력해주세요. (취소: \`/cancel\`)`,
      });
      this._post({ type: 'done' });
      this._postStatus(`페이지 생성 대기 — ${pageName}`);
      return;
    }

    // 3. 복수 도메인 → 번호 선택지 제공
    const domainChoices = domainList
      .map((d, i) => `**${i + 1}.** \`${d}\``)
      .join('   ');

    this._pageCreationState = {
      pageName,
      domainCandidates: domainList,
      waitingForDomain: true,
      resolvedDomain: null,
    };
    this._post({
      type: 'token',
      content: `**${pageName}** 페이지를 어느 도메인에 생성할까요?\n\n${domainChoices}\n\n번호 또는 도메인명을 입력해주세요. (취소: \`/cancel\`)`,
    });
    this._post({ type: 'done' });
    this._postStatus(`페이지 생성 대기 — ${pageName}`);
  }

  /**
   * 영문 페이지명 되묻기 응답 처리. PascalCase로 정규화하고 Page 접미사를 보장한다.
   * 영문 식별자를 인식하지 못하면 재입력을 요청한다.
   */
  private async _handlePageCreationNameInput(input: string): Promise<void> {
    if (!this._pageCreationState) return;

    const pageName = this._pageCreationDetector.normalizeName(input);
    if (!pageName) {
      // 되묻기가 대화를 가두지 않게 한다: 영문 식별자가 하나도 없는데 **생성 요청 문장**이면
      // 사용자는 이 질문에 답한 게 아니라 새 요청을 한 것이다("직원 메인 화면 만들어"). 그대로
      // 되물으면 무슨 말을 해도 이름 질문만 반복되는 함정에 빠진다(실측). 새 요청으로 재라우팅한다.
      // (정상 답변은 영문 이름이라 normalizeName이 성공하므로 이 분기에 오지 않는다 — 충돌 없음.)
      if (this._pageCreationDetector.detect(input).isPageCreation) {
        this._pageCreationState = null;
        await this._handleMessage(input);
        return;
      }
      this._post({
        type: 'token',
        content:
          '영문 이름을 인식하지 못했습니다. PascalCase 영문으로 입력해주세요.\n예: `EmployeeList2Page`, `account-list` (취소: `/cancel`)',
      });
      this._post({ type: 'done' });
      return;
    }

    this._pageCreationState = {
      ...this._pageCreationState,
      pageName,
      waitingForName: false,
    };
    await this._promptForDomain(pageName, this._pageCreationState.explicitDomain ?? null);
  }

  /**
   * 도메인 선택/입력 응답 처리.
   * 도메인이 확정되면 vLLM 헬스체크 후 온라인/오프라인 분기로 생성을 진행한다.
   */
  private async _handlePageCreationDomainInput(input: string): Promise<void> {
    if (!this._pageCreationState) return;

    const { pageName, domainCandidates } = this._pageCreationState;
    let resolvedDomain: string | null = null;

    // "네" / "yes" → 단일 후보 자동 선택
    if (/^(네|예|yes|y)$/i.test(input) && domainCandidates.length >= 1) {
      resolvedDomain = domainCandidates[0];
    }
    // 숫자 입력 → 후보 목록 인덱스 선택
    else if (/^\d+$/.test(input)) {
      const idx = parseInt(input, 10) - 1;
      if (idx >= 0 && idx < domainCandidates.length) {
        resolvedDomain = domainCandidates[idx];
      }
    }
    // 도메인명 직접 입력 (영문 kebab-case 허용)
    else if (/^[a-z][a-z0-9-]*$/.test(input)) {
      resolvedDomain = input;
    }

    if (!resolvedDomain) {
      // 이름 되묻기와 같은 함정 방지 — 답변이 아니라 새 생성 요청이면 재라우팅한다.
      // (정상 답변은 번호·영문 도메인명이라 위에서 이미 해석돼 여기 오지 않는다.)
      if (this._pageCreationDetector.detect(input).isPageCreation) {
        this._pageCreationState = null;
        await this._handleMessage(input);
        return;
      }
      this._post({
        type: 'token',
        content: `입력을 인식하지 못했습니다. 번호(예: \`1\`) 또는 도메인명(예: \`account\`)을 입력해주세요. (취소: \`/cancel\`)`,
      });
      this._post({ type: 'done' });
      return;
    }

    this._pageCreationState = {
      ...this._pageCreationState,
      waitingForDomain: false,
      resolvedDomain,
    };

    await this._maybeGenerateOrAskCollision(pageName, resolvedDomain);
  }

  /**
   * 충돌 안전망(§4.2): 같은 페이지 파일이 이미 있으면 **묻지 않고 덮어쓰지 말고** 되묻는다.
   * 분류기/정규식이 이름을 잘못 뽑아도(예: 참조 파일명을 만들 이름으로 오인) 기존 파일 파괴를 막는
   * 마지막 방어선. 충돌이 없으면 곧바로 생성한다.
   */
  private async _maybeGenerateOrAskCollision(pageName: string, domain: string): Promise<void> {
    const wsRoot = this._getWorkspaceRoot();
    const pageRel = `src/domains/${domain}/pages/${pageName}.tsx`;
    if (wsRoot && fs.existsSync(path.join(wsRoot, pageRel))) {
      this._pageCreationState = {
        pageName,
        domainCandidates: this._pageCreationState?.domainCandidates ?? [domain],
        waitingForDomain: false,
        resolvedDomain: domain,
        waitingForCollision: true,
      };
      this._post({
        type: 'token',
        content:
          `\n> ⚠️ **\`${pageRel}\` 파일이 이미 있습니다.** 기존 파일을 실수로 덮어쓰지 않도록 확인합니다.\n>\n` +
          `> **1)** 덮어쓰기   **2)** 다른 이름   **3)** 취소 — 번호 또는 새 이름을 입력하세요. (취소: \`/cancel\`)\n`,
      });
      this._post({ type: 'done' });
      this._postStatus('페이지 생성 — 덮어쓰기 확인 대기');
      return;
    }
    await this._proceedPageGeneration(pageName, domain);
  }

  /** 도메인·이름이 확정되고 충돌이 없을 때 실제 생성으로 분기한다. */
  private async _proceedPageGeneration(pageName: string, domain: string): Promise<void> {
    this._post({
      type: 'token',
      content: `\`${domain}\` 도메인에 **${pageName}** 페이지를 생성합니다...\n\n`,
    });

    // 기본: 결정론적 템플릿(최소 스켈레톤)으로 생성 — 약한 모델의 잘못된 useApi/$router/타입 환각 차단.
    // 실험 플래그(pageCreationLlmMode)가 켜져 있으면 LLM이 본문(데이터 페치 포함)을 생성한다.
    if (ExtensionConfig.isPageCreationLlmMode()) {
      await this._createPageWithLlm(pageName, domain);
    } else {
      await this._createPageFromTemplate(pageName, domain);
    }

    this._pageCreationState = null;
  }

  /**
   * 페이지 파일 충돌 시 사용자 응답 처리: 1=덮어쓰기, 3=취소, 그 외(2 또는 새 이름)=다른 이름.
   * 새 이름은 정규화 후 다시 충돌검사를 거친다(같은 이름 재입력 시 무한 덮어쓰기 방지).
   */
  private async _handlePageCreationCollisionInput(input: string): Promise<void> {
    if (!this._pageCreationState) return;
    const { pageName, resolvedDomain } = this._pageCreationState;
    if (!resolvedDomain) {
      this._pageCreationState = null;
      return;
    }

    // 1) 덮어쓰기
    if (/^(1|덮어쓰기|덮어써|overwrite|y|yes)$/i.test(input)) {
      this._pageCreationState = { ...this._pageCreationState, waitingForCollision: false };
      await this._proceedPageGeneration(pageName, resolvedDomain);
      return;
    }
    // 3) 취소
    if (/^(3|취소|cancel|n|no)$/i.test(input)) {
      this._pageCreationState = null;
      this._post({ type: 'token', content: '페이지 생성을 취소했습니다.' });
      this._post({ type: 'done' });
      this._postStatus(ExtensionConfig.getLlmConfig().model);
      return;
    }
    // 2) 다른 이름: "2"만 입력 → 이름 되묻기 / 새 이름 직접 입력 → 정규화 후 재충돌검사
    const newName = /^2$/.test(input) ? null : this._pageCreationDetector.normalizeName(input);
    if (!newName) {
      this._pageCreationState = { ...this._pageCreationState, waitingForCollision: false, waitingForName: true };
      this._post({
        type: 'token',
        content: '새 **영문 이름**(PascalCase)을 입력해주세요. 예: `EmployeeList2Page` (취소: `/cancel`)',
      });
      this._post({ type: 'done' });
      this._postStatus('페이지 생성 — 영문명 입력 대기');
      return;
    }
    this._pageCreationState = { ...this._pageCreationState, pageName: newName, waitingForCollision: false };
    await this._maybeGenerateOrAskCollision(newName, resolvedDomain);
  }

  /**
   * vLLM이 온라인일 때: 페이지 생성 전용 시스템 프롬프트를 구성하여 LLM에 전달한다.
   */
  private async _createPageWithLlm(pageName: string, domain: string): Promise<void> {
    this._abortController?.abort();
    this._abortController = new AbortController();

    const config = ExtensionConfig.getEffectiveLlmConfig();
    this._postStatus(`${config.model} 생성 중…`);

    // 페이지 생성 전에 도메인 존재 여부를 미리 캡처한다 (LLM이 파일을 생성하면 달라지므로)
    const wsRoot = this._getWorkspaceRoot();
    const domainExistedBefore = wsRoot
      ? fs.existsSync(path.join(wsRoot, 'src', 'domains', domain))
      : false;

    try {
      const editorCtx = this._editorCollector.collect();
      const systemPrompt = await this._scaffoldBuilder.buildSystemPrompt(
        editorCtx,
        `${domain} 도메인에 ${pageName} 페이지를 만들어줘`,
      );
      this._logSystemPrompt(
        `${domain} 도메인에 ${pageName} 페이지를 만들어줘`,
        systemPrompt,
        this._scaffoldBuilder.lastBreakdown(),
      );

      const userMessage = `${domain} 도메인에 ${pageName} 페이지를 react-app-scaffold 컨벤션에 맞게 만들어줘. 컴포넌트 함수명은 반드시 ${pageName}으로 작성해줘. axiom-action 블록을 포함해줘.`;
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this._history,
        { role: 'user', content: userMessage },
      ];

      let fullResponse = '';
      let wasFallback = false;

      for await (const token of this._llm.streamChat(
        messages,
        config,
        this._abortController.signal,
        (reason) => {
          wasFallback = true;
          console.warn(`[Axiom AI] 페이지 생성 폴백: ${reason}`);
        },
      )) {
        fullResponse += token;
        this._post({ type: 'token', content: token });
      }

      if (wasFallback) {
        // 스트리밍 도중 폴백 발생 → 오프라인 템플릿으로 재시도
        this._post({ type: 'token', content: '\n\n⚠️ LLM 연결이 끊겼습니다. 오프라인 템플릿으로 생성합니다.\n\n' });
        await this._createPageFromTemplate(pageName, domain, 'offline-fallback');
        return;
      }

      const cleanedResponse = this._compressForHistory(fullResponse);
      this._history.push({ role: 'assistant', content: cleanedResponse });
      this._post({ type: 'done' });
      this._postStatus(config.model);

      // 페이지 생성 플로우: page 액션도 InputBox 없이 자동 저장
      const routerUpdated = await this._handleAxiomAction(fullResponse, true);

      // LLM이 라우터 액션을 생성하지 않은 경우 오프라인 방식으로 라우터를 연결한다
      if (!routerUpdated) {
        this._post({ type: 'token', content: '\n\n🔗 라우터 연결 중...\n' });
        await this._applyRouterFallback(pageName, domain, domainExistedBefore, wsRoot);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this._post({ type: 'done' });
        this._postStatus(ExtensionConfig.getEffectiveLlmConfig().model);
        return;
      }
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      this._post({ type: 'error', message });
      this._postStatus('오류 발생');
    }
  }

  /**
   * LLM이 라우터 액션을 생성하지 않았을 때 오프라인 방식으로 라우터를 연결한다.
   * domainExistedBefore: LLM이 페이지를 생성하기 전 도메인 폴더 존재 여부
   */
  private async _applyRouterFallback(
    pageName: string,
    domain: string,
    domainExistedBefore: boolean,
    wsRoot: string | null,
  ): Promise<void> {
    const routePath = this._toRoutePath(pageName);

    const allActions = this._buildOfflinePageActions(
      pageName,
      domain,
      routePath,
      domainExistedBefore,
      wsRoot,
    );
    const routerActions = allActions.filter((a) => a.templateType === 'router');

    for (const action of routerActions) {
      const result = await this._fileCreator.createFile(action);
      if (result.success) {
        this._post(
          action.action === 'updateFile'
            ? { type: 'fileUpdated', filePath: result.filePath! }
            : { type: 'fileCreated', filePath: result.filePath! },
        );
      } else if (!result.cancelled) {
        this._post({ type: 'fileError', message: result.error ?? '라우터 연결 실패' });
      }
    }
  }

  /**
   * 페이지 본문 + 라우터 등록을 **결정론적 템플릿**으로 생성한다(LLM 미사용).
   * 정본 최소 스켈레톤(헤더 + 플레이스홀더)을 만들어 약한 모델이 useApi 시그니처·$router import·
   * 존재하지 않는 타입을 지어내 컴파일 불가 코드를 박는 문제를 원천 차단한다.
   * 도메인 존재 여부에 따라 시나리오 A(2개 액션) / B(3개 액션)를 적용한다.
   *
   * @param mode 'intended'=의도된 템플릿 모드 / 'offline-fallback'=vLLM 연결 실패 폴백(경고 헤더) /
   *             'action-card'=사용자가 오프라인 계획 카드에서 직접 실행(승인된 행동 — 경고 아님).
   */
  private async _createPageFromTemplate(
    pageName: string,
    domain: string,
    mode: 'intended' | 'offline-fallback' | 'action-card' = 'intended',
  ): Promise<void> {
    const offlineFallback = mode === 'offline-fallback';
    const offlineTurn = mode !== 'intended';
    if (offlineTurn) this._postOfflineTurn();
    this._postStatus(offlineTurn ? '오프라인 모드 — 템플릿 생성 중…' : '템플릿 생성 중…');

    const wsRoot = this._getWorkspaceRoot();
    const domainExists = wsRoot
      ? fs.existsSync(path.join(wsRoot, 'src', 'domains', domain))
      : false;

    const routePath = this._toRoutePath(pageName);

    const actions = this._buildOfflinePageActions(pageName, domain, routePath, domainExists, wsRoot);

    const header = offlineFallback
      ? `> ⚠️ **오프라인 모드** — vLLM 서버에 연결할 수 없어 기본 템플릿으로 생성합니다.`
      : mode === 'action-card'
        ? `> 🧩 **계획대로 생성합니다** — 템플릿 기반 결정론 생성(LLM 미사용). 화면 내용은 이후 수정 요청으로 채우세요.`
        : `> 🧩 **기본 템플릿** — 최소 스켈레톤 페이지를 생성합니다. 화면 내용은 이후 수정 요청으로 채우세요.`;

    const templateMsg = [
      header,
      '',
      `**생성 파일**`,
      `- \`src/domains/${domain}/pages/${pageName}.tsx\``,
      domainExists
        ? `- \`src/domains/${domain}/router/index.tsx\` (라우터 업데이트)`
        : `- \`src/domains/${domain}/router/index.tsx\` (신규 생성)`,
      !domainExists
        ? `- \`src/shared/router/index.tsx\` (루트 라우터 업데이트)`
        : '',
    ].filter(Boolean).join('\n');

    this._post({ type: 'token', content: templateMsg });

    this._history.push({ role: 'assistant', content: templateMsg });
    this._post({ type: 'done' });
    this._postStatus(offlineTurn ? '⚠️ 오프라인 모드' : ExtensionConfig.getLlmConfig().model);

    for (const action of actions) {
      const result = await this._fileCreator.createFile(action);
      if (result.success) {
        this._post(
          action.action === 'updateFile'
            ? { type: 'fileUpdated', filePath: result.filePath! }
            : { type: 'fileCreated', filePath: result.filePath! },
        );
      } else if (result.cancelled) {
        this._post({ type: 'fileCancelled' });
        break;
      } else {
        this._post({ type: 'fileError', message: result.error ?? '파일 생성 실패' });
        break;
      }
    }
  }

  /**
   * 오프라인 페이지 생성용 axiom-action 목록을 조합한다.
   * 시나리오 A (도메인 존재): 페이지 생성 + 도메인 라우터 업데이트 (2개)
   * 시나리오 B (신규 도메인): 페이지 생성 + 도메인 라우터 신규 + 루트 라우터 업데이트 (3개)
   */
  private _buildOfflinePageActions(
    pageName: string,
    domain: string,
    routePath: string,
    domainExists: boolean,
    wsRoot: string | null,
  ): AxiomAction[] {
    // 도메인 Pascal (첫 글자 대문자) — 루트 라우터 import 이름에 사용
    const domainPascal = domain.charAt(0).toUpperCase() + domain.slice(1);

    // "AccountListPage" → "Account List" (사람이 읽기 좋은 H1 타이틀)
    const pageTitle = pageName
      .replace(/Page$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim();

    const pageCode = `import type React from 'react';

export default function ${pageName}(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">${pageTitle}</h1>
      <p className="text-muted-foreground">이 페이지의 내용을 작성하세요.</p>
    </div>
  );
}`;

    const newDomainRouterCode = `import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const ${pageName} = loadable(() => import('@/domains/${domain}/pages/${pageName}'));

const routes: TAppRoute[] = [
  {
    path: '${routePath}',
    element: <${pageName} />,
    name: '${pageName}',
  },
];

export default routes;`;

    const actions: AxiomAction[] = [
      {
        action: 'createFile',
        templateType: 'page',
        domain,
        componentName: pageName,
        filePath: `src/domains/${domain}/pages/${pageName}.tsx`,
        generatedCode: pageCode,
        autoWrite: true,
      },
    ];

    if (domainExists) {
      // 시나리오 A: 기존 도메인 라우터 업데이트
      const routerFile = wsRoot
        ? path.join(wsRoot, 'src', 'domains', domain, 'router', 'index.tsx')
        : null;
      const existingRouter = routerFile && fs.existsSync(routerFile)
        ? fs.readFileSync(routerFile, 'utf-8')
        : null;

      const updatedRouterCode = existingRouter
        ? this._appendToExistingRouter(existingRouter, pageName, domain, routePath)
        : newDomainRouterCode;

      actions.push({
        action: 'updateFile',
        templateType: 'router',
        domain,
        componentName: pageName,
        filePath: `src/domains/${domain}/router/index.tsx`,
        generatedCode: updatedRouterCode,
      });
    } else {
      // 시나리오 B: 신규 도메인 라우터 생성 + 루트 라우터 업데이트
      actions.push({
        action: 'createFile',
        templateType: 'router',
        domain,
        componentName: pageName,
        filePath: `src/domains/${domain}/router/index.tsx`,
        generatedCode: newDomainRouterCode,
      });

      const rootRouterFile = wsRoot
        ? path.join(wsRoot, 'src', 'shared', 'router', 'index.tsx')
        : null;
      const existingRootRouter = rootRouterFile && fs.existsSync(rootRouterFile)
        ? fs.readFileSync(rootRouterFile, 'utf-8')
        : null;

      const updatedRootRouter = existingRootRouter
        ? this._appendDomainToRootRouter(existingRootRouter, domain, domainPascal)
        : `import type { TAppRoute } from '@/types/router';
import RootLayout from '@/shared/components/layout/RootLayout';
import ${domainPascal}Router from '@/domains/${domain}/router';

const routes: TAppRoute[] = [
  { path: '/${domain}', element: <RootLayout />, children: ${domainPascal}Router },
  { path: '*', element: <RootLayout /> },
];

export default routes;`;

      actions.push({
        action: 'updateFile',
        templateType: 'router',
        domain,
        componentName: pageName,
        filePath: 'src/shared/router/index.tsx',
        generatedCode: updatedRootRouter,
      });
    }

    return actions;
  }

  /**
   * 기존 도메인 라우터 파일에 신규 페이지 import와 routes 항목을 추가한다.
   *
   * import 삽입 우선순위:
   * 1. 마지막 loadable import 뒤에 추가
   * 2. (폴백) `const routes` 선언 바로 앞에 추가
   *
   * route 항목 삽입 우선순위:
   * 1. `];` 앞에 추가
   * 2. (폴백) 들여쓰기된 `]` 앞에 추가
   */
  private _escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private _appendToExistingRouter(
    existing: string,
    pageName: string,
    domain: string,
    routePath: string,
  ): string {
    // 동일 path 또는 동일 컴포넌트가 이미 등록돼 있으면 중복 항목을 추가하지 않는다.
    const pathAlreadyRouted = new RegExp(
      `path:\\s*['"]${this._escapeRegExp(routePath)}['"]`,
    ).test(existing);
    const elementAlreadyRouted = new RegExp(
      `element:\\s*<${this._escapeRegExp(pageName)}\\s*/>`,
    ).test(existing);
    if (pathAlreadyRouted || elementAlreadyRouted) {
      return existing;
    }

    const loadableImportLine = `import loadable from '@loadable/component';`;
    const importLine = `const ${pageName} = loadable(() => import('@/domains/${domain}/pages/${pageName}'));`;

    let withLoadableImport: string;
    if (existing.includes(loadableImportLine)) {
      withLoadableImport = existing;
    } else {
      withLoadableImport = existing.replace(
        /^(import type \{ TAppRoute \} from ['"]@\/types\/router['"];?\r?\n)/m,
        `$1\n${loadableImportLine}\n`,
      );
      if (withLoadableImport === existing) {
        withLoadableImport = existing.replace(
          /^((?:import[^\n]*\n)+)/m,
          `$1${loadableImportLine}\n`,
        );
      }
      if (withLoadableImport === existing) {
        withLoadableImport = `${loadableImportLine}\n${existing}`;
      }
    }

    let withImport: string;
    if (withLoadableImport.includes(importLine)) {
      withImport = withLoadableImport;
    } else {
      // 1순위: 마지막 loadable import 뒤
      withImport = withLoadableImport.replace(
        /(\nconst \w+ = loadable[^\n]+\n)(?!const \w+ = loadable)/,
        `$1${importLine}\n`,
      );
      if (withImport === withLoadableImport) {
        // 2순위: const routes 선언 바로 앞
        withImport = withLoadableImport.replace(/^(const routes\b)/m, `${importLine}\n\n$1`);
      }
    }

    const routeEntry = `  {\n    path: '${routePath}',\n    element: <${pageName} />,\n    name: '${pageName}',\n  },`;

    let result = withImport.replace(/(\];)/, `${routeEntry}\n$1`);
    if (result === withImport) {
      // 폴백: 들여쓰기된 `]` (세미콜론 없는 경우)
      result = withImport.replace(/^(\s*\])/m, `${routeEntry}\n$1`);
    }
    return result;
  }

  /**
   * 루트 라우터 파일에 신규 도메인 import와 routes 항목을 추가한다.
   *
   * import 삽입 우선순위:
   * 1. 마지막 Router import 뒤에 추가
   * 2. (폴백) `const routes` 선언 바로 앞에 추가
   */
  private _appendDomainToRootRouter(
    existing: string,
    domain: string,
    domainPascal: string,
  ): string {
    const importLine = `import ${domainPascal}Router from '@/domains/${domain}/router';`;
    const routeEntry = `  { path: '/${domain}', element: <RootLayout />, children: ${domainPascal}Router },`;

    const lines = existing.split('\n');

    // 줄 단위로 "살아있는 코드"인지 판정한다(// 라인 주석과 /* */ 블록 주석을 모두 무시).
    // 사용자가 주석으로 넣어둔 import/route 때문에 중복 판정·잘못된 위치 삽입이 일어나던 것을 막는다.
    let inBlock = false;
    const isActive: boolean[] = lines.map((line) => {
      const trimmed = line.trim();
      if (inBlock) {
        if (trimmed.includes('*/')) inBlock = false;
        return false;
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlock = true;
        return false;
      }
      if (trimmed.startsWith('//')) return false;
      return true;
    });

    // ── import 추가 ──────────────────────────────────────────────────
    const alreadyImported = lines.some((l, i) => isActive[i] && l.includes(importLine));
    if (!alreadyImported) {
      // 1순위: 마지막 (활성) Router import 뒤
      let lastRouterImport = -1;
      for (let i = 0; i < lines.length; i++) {
        if (isActive[i] && /^\s*import\s+\w+Router\s+from\s+/.test(lines[i])) {
          lastRouterImport = i;
        }
      }
      if (lastRouterImport >= 0) {
        lines.splice(lastRouterImport + 1, 0, importLine);
        isActive.splice(lastRouterImport + 1, 0, true);
      } else {
        // 2순위: 활성 `const routes` 선언 바로 앞
        const routesDeclIdx = lines.findIndex(
          (l, i) => isActive[i] && /^\s*const\s+routes\b/.test(l),
        );
        const insertAt = routesDeclIdx >= 0 ? routesDeclIdx : 0;
        lines.splice(insertAt, 0, importLine);
        isActive.splice(insertAt, 0, true);
      }
    }

    // ── routes 항목 추가 ─────────────────────────────────────────────
    // 활성 `const routes ... = [` 를 찾아, 대괄호 깊이를 세서 그 배열의 닫는 `]` 직전에 삽입.
    const routesStart = lines.findIndex(
      (l, i) => isActive[i] && /^\s*const\s+routes\b[^=]*=\s*\[/.test(l),
    );
    let inserted = false;
    if (routesStart >= 0) {
      let depth = 0;
      for (let i = routesStart; i < lines.length; i++) {
        if (!isActive[i]) continue;
        for (const ch of lines[i]) {
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        if (depth <= 0) {
          // i번째 줄이 배열을 닫는다 → 그 줄 앞에 항목 삽입
          lines.splice(i, 0, routeEntry);
          inserted = true;
          break;
        }
      }
    }
    if (!inserted) {
      // 폴백: 첫 번째 활성 `];` 앞
      const closeIdx = lines.findIndex((l, i) => isActive[i] && /\];/.test(l));
      if (closeIdx >= 0) {
        lines.splice(closeIdx, 0, routeEntry);
        inserted = true;
      }
    }

    return lines.join('\n');
  }

  /** 현재 활성 에디터 파일 경로에서 도메인명을 추출한다. */
  private _detectDomainFromEditor(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const filePath = editor.document.fileName;
    const match = filePath.match(/[/\\]domains[/\\]([^/\\]+)[/\\]/);
    return match?.[1] ?? null;
  }

  /** 워크스페이스 src/domains/ 폴더를 스캔하여 도메인 목록을 반환한다. */
  /**
   * 의도 분류기(실험): 정규식 게이트 앞에서 모델에게 의도·슬롯을 먼저 묻는다.
   * region disambiguation과 같은 경량·제약 호출이라 약한 모델도 안정적이다.
   * 모델 부재·타임아웃·파싱 실패 시 null을 돌려 호출부가 기존 정규식으로 폴백하게 한다(회귀 0).
   */
  /**
   * [S1 비파괴 측정 — 라우팅 통합 준비] 단일 라우터 후보 `effectiveIntent`(분류기 확신 시 그 결과,
   * null/other면 정규식 통합 폴백 `classifyOfflineIntent`)와 **현행 게이트 판정**(qnaGated·isFileCtx)의
   * 불일치를 출력 채널에만 기록한다. **라우팅은 바꾸지 않는다** — 어느 결정자가 실사용에서 얼마나
   * 충돌하는지 실측해 다음 단계(S2~)의 우선순위를 정하기 위함. (AXIOM_INTENT_ROUTING_REDESIGN.md §4)
   */
  /**
   * [계측 — 비파괴] "현재 파일"을 어느 폴백 단계에서 잡았는지 출력 채널에 남긴다.
   * S1 라우팅측정과 같은 취지: 실사용에서 검출 오탐이 나면 어느 단계(특히 last-editor 등
   * 추정 폴백)가 범인인지 실측하는 데이터. 라우팅 동작은 바꾸지 않는다.
   */
  private _logFileDetection(editorCtx: EditorContext): void {
    try {
      const line = editorCtx.available
        ? `[Axiom AI][파일검출] 출처=${editorCtx.detectSource ?? '?'} → ${editorCtx.filePath ?? '(경로 없음)'}${editorCtx.selection ? ' (선택영역 있음)' : ''}`
        : '[Axiom AI][파일검출] 미검출 — 열린 파일 없음(빈손)';
      this._corpusOutputChannel.appendLine(line);
    } catch { /* 계측은 흐름을 막지 않는다 */ }
  }

  private _logIntentDivergence(
    query: string,
    classifierIntent: IntentResult | null,
    qnaGated: boolean,
    isFileCtx: boolean,
    editorCtx: EditorContext,
  ): void {
    try {
      const ctx: IntentContext = {
        currentFile:
          editorCtx.filePath ??
          (vscode.window.activeTextEditor
            ? this._toWorkspaceRel(vscode.window.activeTextEditor.document.fileName)
            : null),
        hasSelection: !!editorCtx.selection,
        domains: this._scanWorkspaceDomains(),
      };
      const offline = classifyOfflineIntent(query, ctx);
      // 분류기가 확신(null도 'other'도 아님)이면 그 결과, 아니면 정규식 통합 폴백이 effectiveIntent.
      const classifierConfident = classifierIntent !== null && classifierIntent.intent !== 'other';
      const eff = classifierConfident ? (classifierIntent as IntentResult) : offline;
      // effectiveIntent를 현행 두 게이트 축과 같은 의미로 환산해 비교한다.
      const effQnaGated = eff.intent === 'qna' || eff.intent === 'smalltalk';
      const effFileCtx = eff.intent === 'modify_file';
      const mism: string[] = [];
      if (effQnaGated !== qnaGated) mism.push(`qnaGated(현행=${qnaGated}↔eff=${effQnaGated})`);
      if (effFileCtx !== isFileCtx) mism.push(`isFileCtx(현행=${isFileCtx}↔eff=${effFileCtx})`);
      const tag = mism.length ? `⚠ 불일치[${mism.join(', ')}]` : '✅ 일치';
      this._corpusOutputChannel.appendLine(
        `[Axiom AI][S1 라우팅측정] ${tag} · effective=${eff.intent}(src=${classifierConfident ? 'classifier' : 'regex'})` +
          ` · classifier=${classifierIntent ? classifierIntent.intent : 'null'} · offline=${offline.intent}(${offline.strength})` +
          ` · query="${query.slice(0, 60)}"`,
      );
    } catch (err) {
      this._corpusOutputChannel.appendLine(`[Axiom AI][S1 라우팅측정] 측정 실패(무시): ${(err as Error).message}`);
    }
  }

  private async _classifyIntent(query: string): Promise<IntentResult | null> {
    const config = ExtensionConfig.getEffectiveLlmConfig();
    const editorRel = vscode.window.activeTextEditor
      ? this._toWorkspaceRel(vscode.window.activeTextEditor.document.fileName)
      : null;
    const hasSelection = !!vscode.window.activeTextEditor && !vscode.window.activeTextEditor.selection.isEmpty;

    const prompt = buildIntentPrompt(query, {
      currentFile: editorRel,
      hasSelection,
      domains: this._scanWorkspaceDomains(),
    });

    // 로컬 ctrl은 조기 종료(닫는 중괄호 수신) 용도지만, 사용자가 "의도 분석 중…" 단계에서
    // 중단을 누르면 메인 컨트롤러가 abort된다. 메인 signal을 로컬 ctrl로 relay해, 중단이 이
    // 의도 분류 스트림까지 닿게 한다. (relay 패턴은 메인 스트림/재시도 경로와 동일.)
    const ctrl = new AbortController();
    const mainSignal = this._abortController?.signal;
    const relay = () => ctrl.abort();
    if (mainSignal?.aborted) ctrl.abort();
    else mainSignal?.addEventListener('abort', relay, { once: true });
    try {
      let fellBack = false;
      let out = '';
      for await (const token of this._llm.streamChat(
        [
          { role: 'system', content: '당신은 의도 분류기입니다. JSON 한 줄만 출력하세요.' },
          { role: 'user', content: prompt },
        ],
        config,
        ctrl.signal,
        () => { fellBack = true; },
      )) {
        out += token;
        // JSON 한 줄이면 충분 — 닫는 중괄호가 오면 조기 종료(토큰 절약).
        if (out.includes('}')) { ctrl.abort(); break; }
      }
      if (fellBack) return null; // 모델 연결 끊김 → 정규식 폴백
      const result = parseIntent(out);
      this._corpusOutputChannel.appendLine(
        `[Axiom AI] 의도 분류: ${result ? JSON.stringify(result) : `파싱 실패(원문: ${out.trim().slice(0, 80)})`}`,
      );
      return result;
    } catch {
      return null;
    } finally {
      mainSignal?.removeEventListener('abort', relay);
    }
  }

  /** 절대/상대 파일 경로를 워크스페이스 상대(슬래시) 경로로 변환한다. */
  private _toWorkspaceRel(fileName: string): string {
    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return fileName;
    const rel = path.relative(wsRoot, fileName);
    return rel.startsWith('..') ? fileName : rel.replace(/\\/g, '/');
  }

  private _scanWorkspaceDomains(): string[] {
    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return [];
    const domainsDir = path.join(wsRoot, 'src', 'domains');
    if (!fs.existsSync(domainsDir)) return [];
    try {
      return fs.readdirSync(domainsDir).filter((name) =>
        fs.statSync(path.join(domainsDir, name)).isDirectory(),
      );
    } catch {
      return [];
    }
  }

  // ─── 유틸리티 ────────────────────────────────────────────────────────────────

  private _resolveAxiomDir(): string | null {
    const setting = ExtensionConfig.getSddAxiomFolder();
    if (!setting) return null;
    if (path.isAbsolute(setting)) return setting;
    const wsRoot = this._getWorkspaceRoot();
    return wsRoot ? path.join(wsRoot, setting) : null;
  }

  private _resolveKnowledgeDir(): string {
    const wsRoot = this._getWorkspaceRoot();
    const knowledgePath = ExtensionConfig.getKnowledgePath();
    if (wsRoot) {
      const candidate = path.join(wsRoot, knowledgePath);
      if (fs.existsSync(candidate)) return candidate;
    }
    return vscode.Uri.joinPath(this._extensionUri, 'knowledge').fsPath;
  }

  private _resolveWorkspacePath(relOrAbsPath: string): string {
    if (path.isAbsolute(relOrAbsPath)) return relOrAbsPath;
    const wsRoot = this._getWorkspaceRoot();
    return wsRoot ? path.join(wsRoot, relOrAbsPath) : relOrAbsPath;
  }

  /** 절대 경로 → 워크스페이스 상대 경로(POSIX 구분자). 워크스페이스 밖이면 null. */
  private _toWorkspaceRelative(absPath: string): string | null {
    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return null;
    const rel = path.relative(wsRoot, absPath);
    return !rel || rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.replace(/\\/g, '/');
  }

  private _getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  private _toRoutePath(pageName: string): string {
    return pageName
      .replace(/Page$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();
  }

  private _postStatus(text: string): void {
    this._post({ type: 'status', text });
  }

  /**
   * 처리 단계(마일스톤)를 "생각 중" 인디케이터에 체크리스트처럼 누적 표시한다. 하단 상태 한 줄
   * (_postStatus)이 매번 덮어써지는 것과 달리, 이 스텝들은 쌓여서 "지금까지 무엇을 했는지"를 보여준다
   * (Claude Code 식 진행 표시). 표시 전용 독립 채널이라 상태 바·타이머·토큰 메터에 영향 없음(회귀 0).
   * webview는 새 턴 시작 시 스텝을 비우고, 첫 토큰/완료/오류에서 정리한다.
   */
  private _postStep(label: string): void {
    this._post({ type: 'progress', label });
  }

  /**
   * 오프라인 턴 진입을 webview에 알린다. 토큰 메터는 라이브 측정(실측)이 아닌
   * "오프라인 · 토큰 미사용" 상태로 전환된다(누적 추정치로 막대가 차오르는 오해 방지).
   * 온라인 턴은 contextInfo(offline 미지정)가 발화되며 메터를 다시 라이브로 되돌린다.
   * 연결이 깜빡여도 매 턴 이 신호로 메터가 정확히 따라간다(세션 단위 플래그가 아니라 턴 단위).
   */
  private _postOfflineTurn(): void {
    this._post({
      type: 'contextInfo',
      systemPromptChars: 0,
      contextWindow: ExtensionConfig.getEffectiveLlmConfig().contextWindow,
      outputReserve: ExtensionConfig.getEffectiveLlmConfig().maxTokens,
      offline: true,
    });
  }

  /**
   * 온라인 지식 가이드 턴(서버는 온라인이나 로컬 문서를 결정론적으로 전문 렌더 → LLM 미호출)의
   * 토큰 메터 처리. 이 턴은 실제 서버 토큰을 쓰지 않고, 화면에 표시된 문서 전문도 히스토리엔
   * placeholder만 들어가 다음 턴 컨텍스트로 안 실린다. 그런데 메터의 문자 수 추정은 화면에 쌓인
   * 문서 전량을 세어 막대가 잘못 차오른다("오프라인인데 토큰이 오른다"의 실체). offline과 동일하게
   * 메터를 비활성화하되 localKnowledge로 라벨만 "로컬 지식 · 토큰 미사용"으로 구분해, 서버가
   * 죽었다는 오해를 주지 않는다. 다음 실제 온라인 턴의 contextInfo/usage가 라이브 메터를 복원한다.
   */
  private _postLocalKnowledgeTurn(): void {
    this._post({
      type: 'contextInfo',
      systemPromptChars: 0,
      contextWindow: ExtensionConfig.getEffectiveLlmConfig().contextWindow,
      outputReserve: ExtensionConfig.getEffectiveLlmConfig().maxTokens,
      offline: true,
      localKnowledge: true,
    });
  }

  /**
   * 토큰 메터를 온라인(라이브 추정) 상태로 되돌린다. 메터의 offline 표시는 턴 단위 신호라
   * 직전 오프라인 턴 이후 계속 "오프라인 · 토큰 미사용"으로 고정된다 — 사용자가 설정에서 온라인으로
   * 전환하거나 연결 테스트에 성공해도 다음 턴 전까지 갱신되지 않던 문제를 해소한다.
   * offline 플래그 없는 contextInfo를 보내 webview의 isOffline을 즉시 false로 되돌린다.
   * (실제 도달 가능 여부는 다음 턴의 헬스체크가 재평가 — 죽어 있으면 _postOfflineTurn이 다시 켠다.)
   */
  resetTokenMeter(): void {
    if (!this._view) return;
    this._post({
      type: 'contextInfo',
      systemPromptChars: 0,
      contextWindow: ExtensionConfig.getEffectiveLlmConfig().contextWindow,
      outputReserve: ExtensionConfig.getEffectiveLlmConfig().maxTokens,
    });
  }

  private _post(msg: HostToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
    );
    const nonce = Array.from(
      { length: 32 },
      () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
    ).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Axiom AI Chat</title>
</head>
<body data-mode="chat">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
