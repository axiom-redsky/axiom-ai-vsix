import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { LlmService } from '../ai/LlmService';
import { EditorContextCollector, type EditorContext } from '../ai/EditorContextCollector';
import { ScaffoldContextBuilder } from '../ai/ScaffoldContextBuilder';
import { FileCreatorService } from '../ai/FileCreatorService';
import type { AxiomAction, LineEdit, MultiPatchResult, PatchBlock } from '../ai/FileCreatorService';
import { restoreSlicedStubs } from '../ai/CodeSectionExtractor';
import { applyStructuralEdit, findUnresolvedReferences, findDuplicateDeclarations, resolveKnownImports, type ImportRequest } from '../ai/StructuralAnchor';
import { runHybridRegionEdit, classifyRegionDecline, buildDisambiguationPrompt, parseDisambiguationPick, buildImportProvenance } from '../ai/RegionEditService';
import { impliedControlTags } from '../ai/RegionIntent';
import { computeDiffHunks } from '../ai/DiffUtil';
import {
  splitIntoSections,
  scoreSections,
  tokenizeQuery,
  selectByBudget,
  extractApiPaths,
  matchedApiPaths,
  unmatchedApiPaths,
  formatExactPathDirective,
} from '../ai/SectionExtractor';
import { PageCreationDetector } from '../ai/PageCreationDetector';
import { buildIntentPrompt, parseIntent, formatIntentForChat, type IntentResult } from '../ai/IntentClassifier';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { ChatMessage, LlmConfig, LlmTuning } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, SpecWizardState, PageCreationState, DiffLine } from '../types/messages';
import { ContextCollector } from '../spec/ContextCollector';
import { SpecGenerator } from '../spec/SpecGenerator';
import { SpecFileWriter } from '../spec/SpecFileWriter';
import { SpecScaffolder } from '../spec/SpecScaffolder';
import { AxiomIndexTracker } from '../spec/AxiomIndexTracker';
import type { SpecIndexEntry } from '../spec/AxiomIndexTracker';
import { DomainRouter } from '../spec/DomainRouter';
import { SddCorpusLoader } from '../spec/SddCorpusLoader';
import { PublishExtractor } from '../spec/PublishExtractor';

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
  private _wizardState: SpecWizardState | null = null;
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
  private readonly _fileCreator = new FileCreatorService();
  private readonly _corpusOutputChannel: vscode.OutputChannel;
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

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._llm = new LlmService(_extensionUri);
    this._editorCollector = new EditorContextCollector(ExtensionConfig.getMaxFileLines());
    this._corpusOutputChannel = vscode.window.createOutputChannel('axiom-ai: Corpus');
    this._scaffoldBuilder = new ScaffoldContextBuilder(_extensionUri, this._corpusOutputChannel);
  }

  /**
   * 디버그 플래그(axiom-ai.debug.logSystemPrompt)가 켜져 있으면, AI 서버로 전송하는
   * 시스템 프롬프트(규칙·가이드 + RAG + 현재 파일) 전문을 'axiom-ai: Prompt' 채널에 기록한다.
   * 채널은 처음 필요할 때만 생성한다.
   */
  private _logSystemPrompt(
    query: string,
    systemPrompt: string,
    breakdown?: { rulesChars: number; fileChars: number; ragChars: number; sddChars: number; domainChars: number },
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
        `구성(자): 규칙·가이드 ${breakdown.rulesChars} / 현재파일 ${breakdown.fileChars} / RAG ${breakdown.ragChars} / SDD ${breakdown.sddChars} / 도메인 ${breakdown.domainChars} · 전체 ${systemPrompt.length}`,
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
        for (const p of matchedApiPaths(sections, apiPaths)) matchedPaths.add(p);
        const picked = selectByBudget(sections, budget, 1);
        if (picked.length > 0) {
          injected = `(질문 관련 섹션 추출)\n\n${picked.map((s) => s.body).join('\n\n')}`;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] 참조 ${rel}: ${content.length}자(>${budget}) → 관련 섹션 ${picked.length}개 추출: ` +
            picked.map((s) => s.header.replace(/^#+\s*/, '').slice(0, 40)).join(' | '),
          );
        } else {
          injected = content.slice(0, budget) + `\n\n... (이하 생략 — 관련 섹션 미검출로 앞부분만 포함)`;
          this._corpusOutputChannel.appendLine(
            `[Axiom AI] 참조 ${rel}: 관련 섹션 미검출 → 앞부분 ${budget}자만 포함`,
          );
        }
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
   */
  private async _resolveTargetFile(
    userQuery: string,
    editorCtx: EditorContext,
  ): Promise<{ proceed: boolean; editorCtx: EditorContext }> {
    // 줄 선택이 있으면 사용자가 현재 파일을 명시적으로 가리킨 것 → 바로 진행
    if (editorCtx.selection) return { proceed: true, editorCtx };

    const activePath = editorCtx.available ? editorCtx.filePath : undefined;
    const activeBase = activePath
      ? (activePath.split(/[/\\]/).pop() ?? '').replace(/\.[tj]sx?$/, '')
      : '';

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

  /** 뷰가 이미 열려 있으면 포커스, 아니면 VS Code가 자동으로 resolveWebviewView를 호출한다. */
  focus(): void {
    this._view?.show(true);
  }

  clearHistory(): void {
    this._history = [];
  }

  /** corpus 파일 변경 시 RAG 인덱스를 재빌드하는 파일 와처를 등록한다. */
  registerCorpusWatcher(context: vscode.ExtensionContext): void {
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
      if (e.affectsConfiguration('axiom-ai.stubs')) {
        this._unregisterUserStubsWatcher();
        this._registerUserStubsWatcher(context);
        this._llm.reloadStubs();
      }
    });
    context.subscriptions.push(this._configChangeDisposable);
  }

  /** RAG 인덱스 빌드를 백그라운드에서 시작한다. */
  startIndexBuild(): void {
    this._scaffoldBuilder.startIndexBuild();
  }

  // ─── SDD 커맨드 진입점 ───────────────────────────────────────────────────────

  /** /spec 커맨드 처리 */
  async runSpecCommand(intent: string): Promise<void> {
    this._post({ type: 'token', content: `⚙️ 스펙 생성 중: ${intent}\n\n` });
    await this._handleSpecCommand(intent);
  }

  /** /spec update 커맨드 처리 — spec.md가 이미 열려 있어야 한다 */
  async runSpecUpdateCommand(intent: string): Promise<void> {
    this._post({ type: 'token', content: `✏️ 스펙 수정 중: ${intent}\n\n` });
    await this._handleSpecUpdate(intent);
  }

  /** "Add Screen" 원스텝 커맨드 처리 — SDD 패널 버튼에서 호출된다 */
  async runAddScreenCommand(intent: string): Promise<void> {
    this._post({ type: 'token', content: `🚀 화면 추가 중: ${intent}\n\n` });
    await this._handleSpecFast(intent);
  }

  /** 퍼블리셔 파일(HTML/TSX) → spec.md 역방향 추출 */
  async runExtractSpecCommand(filePath: string, domain?: string): Promise<void> {
    this._abortController?.abort();
    this._abortController = new AbortController();

    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) {
      this._post({ type: 'error', message: 'axiom-ai.sdd.axiomFolder 설정이 필요합니다.' });
      this._post({ type: 'done' });
      return;
    }

    const knowledgeDir = this._resolveKnowledgeDir();
    const config = ExtensionConfig.getEffectiveLlmConfig();
    const fileName = filePath.split(/[/\\]/).pop() ?? '';

    this._post({ type: 'token', content: `🔍 파일 분석 중: ${fileName}\n\n` });
    this._postStatus('스펙 추출 중…');

    try {
      const extractor = new PublishExtractor();
      const fileStructure = extractor.extractFromFile(filePath);
      if (!fileStructure) {
        this._post({ type: 'error', message: `파일을 읽을 수 없습니다: ${fileName}` });
        this._post({ type: 'done' });
        return;
      }

      // publish 키워드로 knowledge 수집 (css-mapping, markup-patterns 우선)
      const collector = new ContextCollector(axiomDir, knowledgeDir);
      const ctx = await collector.collect('publish markup css-mapping 퍼블리셔', filePath);
      if (domain) ctx.domain = domain;

      const generator = new SpecGenerator(this._llm);
      let fullSpec = '';
      let wasFallback = false;

      for await (const token of generator.generateFromFile(
        fileStructure,
        ctx,
        this._abortController.signal,
        (reason) => { wasFallback = true; console.warn(`[SDD] 역방향 추출 폴백: ${reason}`); },
      )) {
        fullSpec += token;
        this._post({ type: 'token', content: token });
      }

      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);

      let gitUser = 'unknown';
      try { gitUser = cp.execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim() || 'unknown'; } catch { /* ignore */ }

      if (wasFallback) {
        fullSpec = SpecGenerator.generateOfflineStubFromFile(filePath, ctx.domain ?? 'unknown', gitUser);
      }

      const writer = new SpecFileWriter(axiomDir);
      let parsed = writer.parseDraft(fullSpec);
      parsed = writer.applyDefaults(parsed, { status: 'draft', category: 'screen', owner: gitUser });

      if (ctx.domain && (!parsed.frontmatter.domain || parsed.frontmatter.domain === 'unknown')) {
        parsed.frontmatter.domain = ctx.domain;
        parsed = { ...parsed, raw: parsed.raw.replace(/^domain:\s*.*$/m, `domain: ${ctx.domain}`) };
      }

      const specPath = await writer.save(parsed);

      const tracker = new AxiomIndexTracker(axiomDir);
      const dom = parsed.frontmatter.domain ?? 'unknown';
      const screen = parsed.frontmatter.screen ?? 'Unknown';
      tracker.upsertSpec({
        specPath: path.relative(axiomDir, specPath).replace(/\\/g, '/'),
        linkedSourcePath: `src/domains/${dom}/pages/${screen}.tsx`,
        lastModified: new Date().toISOString().slice(0, 10),
        domain: dom,
        status: 'draft',
      });

      const wsRoot = this._getWorkspaceRoot();
      this._post({ type: 'token', content: `\n\n✅ 스펙 추출 완료: \`${path.relative(wsRoot ?? '', specPath)}\`` });
      this._post({ type: 'done' });
      this._postStatus(config.model);

    } catch (err) {
      if ((err as Error).name === 'AbortError') { this._post({ type: 'done' }); return; }
      this._post({ type: 'error', message: (err as Error).message });
      this._postStatus('오류 발생');
    }
  }

  // ─── private: 메시지 처리 ────────────────────────────────────────────────────

  private async _handleMessage(
    text: string,
    overrideSelection?: { filePath: string; startLine: number; endLine: number },
  ): Promise<void> {
    if (!this._view) return;

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

    // wizard 모드: 취소 또는 단계 처리
    if (this._wizardState) {
      if (text.trim() === '/cancel' || text.trim() === '/spec cancel') {
        this._wizardState = null;
        this._post({ type: 'token', content: '가이드 모드가 취소되었습니다. `/spec <의도>` 로 일반 생성을 시작할 수 있습니다.' });
        this._post({ type: 'done' });
        this._postStatus(ExtensionConfig.getLlmConfig().model);
        return;
      }
      await this._handleWizardStep(text);
      return;
    }

    // /spec 커맨드 분기
    if (text.startsWith('/spec ') || text === '/spec') {
      const subtext = text.slice('/spec'.length).trim();

      if (!subtext || subtext === 'help') {
        this._showSpecHelp();
        return;
      }
      if (subtext === 'guide') {
        this._showSpecGuide();
        return;
      }
      if (subtext === 'wizard') {
        await this._startSpecWizard();
        return;
      }
      if (subtext.startsWith('approve')) {
        await this._handleSpecApprove();
        return;
      }
      if (subtext.startsWith('review')) {
        await this._handleSpecReview();
        return;
      }
      if (subtext.startsWith('update ')) {
        await this._handleSpecUpdate(subtext.slice('update '.length).trim());
        return;
      }
      if (subtext.startsWith('fast ') || subtext === 'fast') {
        await this._handleSpecFast(subtext.slice('fast'.length).trim());
        return;
      }
      await this._handleSpecCommand(subtext);
      return;
    }

    // /scaffold 커맨드 분기
    if (text.startsWith('/scaffold')) {
      await this._handleScaffoldCommand();
      return;
    }

    // 의도 분류기(실험): 정규식 분기 전에 모델에게 "이게 무슨 요청이야?"를 먼저 묻고, 결과를
    // 채팅에 한 줄로 표시한다. 신뢰 가능한 분류면 그대로 라우팅하고, 분류 실패(null)·'other'면
    // 아래 기존 PageCreationDetector 정규식으로 폴백한다(회귀 0).
    let intent: IntentResult | null = null;
    if (ExtensionConfig.isIntentClassifierEnabled()) {
      this._postStatus('의도 분석 중…');
      intent = await this._classifyIntent(text);
      if (intent) {
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

    this._abortController?.abort();
    this._abortController = new AbortController();

    this._history.push({ role: 'user', content: text });

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

    let mainTimedOut = false;

    try {
      let editorCtx = this._editorCollector.collect(overrideSelection);

      // 대상 파일 선확정 — 신규 생성이 아닌 수정 요청은 코드 생성 전에 "어떤 파일을 고칠지"를
      // 결정론적 휴리스틱으로 확정한다(잘못된 파일에 라인 splice 방지).
      // 단, Q&A(조회·설명형) 질문은 buildSystemPrompt가 axiom-action 지시를 빼므로(qnaGating),
      // 후처리도 동일하게 파일 수정 흐름(타겟 확정·action 보강·patch 재시도)을 건너뛴다.
      // 그러지 않으면 설명만 한 응답을 강제로 수정 코드로 보강하려다 현재 파일을 추측한
      // <search>가 매칭 실패("patch 매칭 실패")로 이어진다.
      const isFileCtx =
        !this._scaffoldBuilder.isQnAGated(text) &&
        this._scaffoldBuilder.isFileModificationContext(text, editorCtx.filePath ?? '');
      if (isFileCtx) {
        const resolved = await this._resolveTargetFile(text, editorCtx);
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

      // .axiom/ SDD 스펙을 일반 채팅 컨텍스트에도 주입
      let sddChars = 0;
      const axiomDir = this._resolveAxiomDir();
      if (axiomDir) {
        const currentFile = editorCtx.filePath
          ? this._resolveWorkspacePath(editorCtx.filePath)
          : undefined;
        const domain = currentFile
          ? new DomainRouter(axiomDir).detectDomain(currentFile)
          : null;
        const sddEntries = new SddCorpusLoader(axiomDir).loadForDomain(domain);

        if (sddEntries.length > 0) {
          const sddSection = sddEntries
            .slice(0, 3)
            .map((e) => e.content)
            .join('\n\n---\n\n');
          const sddAppended = `\n\n<!-- SDD 스펙 컨텍스트 -->\n${sddSection}`;
          editorCtx.content = (editorCtx.content ?? '') + sddAppended;
          sddChars = sddAppended.length;
        }
      }

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

      const systemPrompt = await this._scaffoldBuilder.buildSystemPrompt(editorCtx, text);
      const rawBreakdown = this._scaffoldBuilder.lastBreakdown();
      // SDD는 fileSection에 append되므로 fileChars에서 분리해 별도 표기
      const breakdown = {
        ...rawBreakdown,
        fileChars: Math.max(0, rawBreakdown.fileChars - sddChars),
        sddChars,
      };
      this._post({
        type: 'contextInfo',
        systemPromptChars: systemPrompt.length,
        breakdown,
        contextWindow: config.contextWindow,
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

      await this._handleAxiomAction(finalResponse);
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

  // ─── /spec 서브 커맨드 ───────────────────────────────────────────────────────

  private _showSpecHelp(): void {
    const guide = [
      '📋 **SDD 스펙 가이드**',
      '',
      '**사용법**',
      '```',
      '/spec <만들고 싶은 화면 설명>',
      '```',
      '',
      '---',
      '',
      '**Case 1 — 기존 파일 수정·기능 추가**',
      '대상 `.tsx` 파일을 열고 실행하면 도메인·API 패턴을 자동으로 반영합니다.',
      '```',
      '// TransferConfirmPage.tsx 를 열고:',
      '/spec 이체 확인 화면 한도 초과 예외처리 추가',
      '/spec 로그인 화면 소셜 로그인 추가',
      '```',
      '',
      '**Case 2 — 새 화면 처음 만들기 (파일 없음)**',
      '파일이 없으면 도메인을 자동 감지할 수 없습니다.',
      '`[도메인] [화면명(PascalCase)] [기능 설명]` 형태로 입력하세요.',
      '```',
      '/spec example 도메인 AccountListPage 계좌 목록 조회',
      '/spec order 도메인 OrderDetailPage 주문 상세 및 취소 기능',
      '/spec auth 도메인 SignUpPage 회원가입, 약관 동의 포함',
      '```',
      '생성 후 `.axiom/screens/example/AccountListPage/spec.md` 에 저장되고,',
      '`/scaffold` 실행 시 `src/domains/example/pages/AccountListPage.tsx` 스텁이 생성됩니다.',
      '',
      '---',
      '',
      '**서브 커맨드**',
      '| 명령어 | 설명 |',
      '|---|---|',
      '| `/spec fast <설명>` | ⚡ 스펙 생성 + 승인 + 코드 생성 한 번에 |',
      '| `/spec <설명>` | 스펙 생성 (draft 저장) |',
      '| `/spec wizard` | 🧙 대화형 가이드로 스펙 작성 |',
      '| `/spec update <수정 내용>` | 현재 열린 spec.md AI 보조 수정 |',
      '| `/spec review` | 스펙을 리뷰 요청 상태로 전환 |',
      '| `/spec approve` | 스펙 승인 (reviewer 필드 필수) |',
      '| `/spec guide` | 📖 스펙 작성 규칙 및 구조 가이드 |',
      '| `/scaffold` | 승인된 spec.md → TSX 스텁 생성 |',
      '| `/cancel` | 🧙 wizard 모드 종료 |',
      '',
      '💡 **팁**: 구체적으로 쓸수록 수락 기준 체크리스트 품질이 올라갑니다.',
    ].join('\n');

    this._post({ type: 'token', content: guide });
    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getLlmConfig().model);
  }

  private _showSpecGuide(): void {
    const guide = [
      '📖 **스펙 파일 작성 가이드**',
      '',
      '---',
      '',
      '## Frontmatter 필드',
      '```yaml',
      'title: AccountListPage 계좌 목록 조회   # 사람이 읽기 좋은 제목',
      'category: screen                        # screen | component | api',
      'domain: example                         # 도메인 폴더명 (소문자)',
      'screen: AccountListPage                 # PascalCase 컴포넌트명',
      'owner: 홍길동                           # git user.name 자동 입력',
      'status: draft                           # ↓ 아래 status 흐름 참고',
      'complexity: L2                          # L1 | L2 | L3 (↓ 아래 등급 참고)',
      'tags: [example, account-list]           # 검색/필터용 태그',
      '# 금융 화면 추가 필수:',
      'reviewer: 이검토                        # 승인 담당자',
      'compliance-tags: [KYC, AML]             # 금융 규정 태그',
      '```',
      '',
      '**status 흐름**: `draft` → `review` → `approved` → `implemented`',
      '- `/spec review` — review 전환',
      '- `/spec approve` — approved 전환 (reviewer 필드 필수)',
      '- `/scaffold` — TSX 스텁 생성 후 자동 implemented',
      '',
      '---',
      '',
      '## 복잡도 등급 (complexity)',
      '',
      '| 등급 | 대상 | 필수 섹션 |',
      '|---|---|---|',
      '| **L1** 단순 | 정적 화면, 단순 조회 | 수락 기준 + 개요 + API + 예외 처리 |',
      '| **L2** 표준 | 목록 · 상세 · 폼 | L1 + **상태 + 이벤트** |',
      '| **L3** 복잡 | 다중 API · 복합 모달 | L2 + **컴포넌트 트리 + Props + 렌더 조건 + 폼** |',
      '',
      '---',
      '',
      '## 섹션 구조',
      '',
      '### ## 수락 기준 *(전체 필수, frontmatter 바로 다음)*',
      '```markdown',
      '## 수락 기준',
      '- [ ] 정상 상태: 계좌 목록이 카드 형태로 표시된다',
      '- [ ] 로딩 상태: API 호출 중 스켈레톤 UI가 표시된다',
      '- [ ] 빈 상태: 계좌 없을 때 "등록된 계좌가 없습니다" 안내가 표시된다',
      '- [ ] 에러 상태: 400 → 토스트, 500 → "일시적 오류" 안내',
      '```',
      '',
      '### ## 개요 *(전체 필수)*',
      '1~2줄. 화면 목적 + 핵심 데이터 흐름.',
      '```markdown',
      '## 개요',
      '계좌 목록 조회 화면. GET /api/accounts 데이터를 카드 목록으로 표시하고,',
      '계좌명/유형 필터 검색과 계좌 삭제(Dialog 확인)를 제공한다.',
      '```',
      '',
      '### ## 컴포넌트 트리 *(L3)*',
      '들여쓰기로 계층 표현. 서브컴포넌트 파일 경로 명시.',
      '```markdown',
      '## 컴포넌트 트리',
      'AccountListPage (pages/AccountListPage.tsx)',
      '├── AccountSearchForm (components/AccountSearchForm.tsx)',
      '├── AccountTable (components/AccountTable.tsx)',
      '│   └── AccountTableRow (components/AccountTableRow.tsx)',
      '└── AccountDeleteDialog (components/AccountDeleteDialog.tsx)',
      '```',
      '',
      '### ## Props *(L2+)*',
      'TypeScript interface 형태. 라우터 params는 useParams()로 별도 명시.',
      '```markdown',
      '## Props',
      '없음 (라우트 페이지)',
      '',
      '# 라우터 params가 있는 경우:',
      '라우터 params: `useParams<{ accountId: string }>()`',
      '```',
      '',
      '### ## 상태 *(L2+)*',
      'Server State(useApi)와 Local State(useState) 구분. 타입과 초기값 명시.',
      '```markdown',
      '## 상태',
      '',
      '### Server State (useApi)',
      '- `accounts`: Account[] — GET /api/accounts, 마운트 시 자동 조회',
      '- `deleteAccount`: mutation — DELETE /api/accounts/{id}',
      '',
      '### Local State (useState)',
      '- `searchName: string` — 계좌명 검색어, 초기값 \'\'',
      '- `deleteTargetId: number | null` — 삭제 확인 대상 ID, null이면 모달 닫힘',
      '```',
      '',
      '### ## 렌더 조건 *(L3)*',
      '"조건 → UI 처리" 형태. isLoading / error / empty 3단계 분기 반드시 포함.',
      '```markdown',
      '## 렌더 조건',
      '',
      '### 테이블 영역',
      '- `isLoading === true` → Skeleton (행 5개)',
      '- `error !== null` → ErrorMessage + 재시도 버튼',
      '- `data.length === 0` → EmptyState "등록된 계좌가 없습니다"',
      '- `data.length > 0` → AccountTable 렌더링',
      '',
      '### 삭제 모달',
      '- `deleteTargetId !== null` → AccountDeleteDialog 표시',
      '```',
      '',
      '### ## 이벤트 *(L2+)*',
      '"핸들러명(파라미터): 번호로 동작 순서" 형태. onSuccess/onError 포함.',
      '```markdown',
      '## 이벤트',
      '',
      '### handleDeleteClick(id: number)',
      '- deleteTargetId = id → 삭제 확인 모달 오픈',
      '',
      '### handleDeleteConfirm()',
      '1. deleteAccount.mutate({ id: deleteTargetId })',
      '2. onSuccess: invalidateQueries(\'/api/accounts\') → 목록 갱신',
      '3. onSuccess: deleteTargetId = null → 모달 닫기',
      '4. onError: Toast "삭제에 실패했습니다"',
      '```',
      '',
      '### ## API *(전체 필수)*',
      'useApi 시그니처 그대로. enabled 조건, invalidateQueries 대상 포함.',
      '```markdown',
      '## API',
      '',
      '### 계좌 목록 조회',
      '```typescript',
      'useApi<Account[]>(\'/api/accounts\', {',
      '  params: { name: searchName, type: searchType },',
      '})',
      '```',
      '- 시점: 마운트 시 자동, params 변경 시 재요청',
      '',
      '### 계좌 삭제',
      '```typescript',
      'useApi<void, { id: number }>(\'/api/accounts/:id\', { method: \'DELETE\' })',
      '```',
      '- onSuccess: invalidateQueries(\'/api/accounts\')',
      '- onError: Toast 에러 메시지',
      '```',
      '',
      '### ## 폼 *(L2+, 폼 화면만)*',
      'zod 스키마 코드블록 + 필드별 검증 표 + submit onSuccess/onError.',
      '```markdown',
      '## 폼',
      '',
      '### zod 스키마',
      '```typescript',
      'z.object({',
      '  accountName: z.string().min(1, \'계좌명은 필수입니다\').max(50),',
      '  accountType: z.enum([\'savings\', \'checking\']),',
      '})',
      '```',
      '',
      '### Submit 동작',
      '- onSuccess: form.reset() → invalidateQueries → navigate(-1)',
      '- onError(400): form.setError(\'accountName\', { message: error.message })',
      '- onError(500): Toast "저장에 실패했습니다"',
      '```',
      '',
      '### ## 예외 처리 *(전체 필수)*',
      '표 형태. 로딩/빈값/에러 3가지 기본 케이스 필수.',
      '```markdown',
      '## 예외 처리',
      '',
      '| 케이스 | 조건 | UI 처리 |',
      '|---|---|---|',
      '| 로딩 중 | `isLoading === true` | Skeleton 5행 |',
      '| 빈 목록 | `data.length === 0` | EmptyState |',
      '| 조회 에러 | `error !== null` | ErrorMessage + 재시도 버튼 |',
      '| 삭제 중 | `deleteAccount.isPending` | 버튼 disabled |',
      '```',
      '',
      '### ## 미결정 사항 *(선택)*',
      '- [ ] 형태. 승인(/spec approve) 전 반드시 해소.',
      '```markdown',
      '## 미결정 사항',
      '- [ ] 페이지네이션 방식: 서버 페이징 vs 클라이언트 페이징',
      '- [ ] 검색 자동 실행 여부: 입력 즉시 vs 버튼 클릭 시',
      '```',
      '',
      '---',
      '',
      '## 스펙 수정 방법',
      '',
      '| 방법 | 사용 시점 |',
      '|---|---|',
      '| **직접 편집** | 수락 기준 체크, 미결정 사항 해소, 간단한 수정 |',
      '| **`/spec update <내용>`** | spec.md 열고 AI에게 수정 요청 (큰 변경) |',
      '',
      '```',
      '/spec update 삭제 기능 추가, 이벤트·API·예외 처리 섹션 업데이트해줘',
      '/spec update complexity를 L3으로 올리고 컴포넌트 트리 섹션 추가해줘',
      '```',
    ].join('\n');

    this._post({ type: 'token', content: guide });
    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getLlmConfig().model);
  }

  private async _handleSpecCommand(intent: string): Promise<void> {
    const result = await this._generateAndSaveSpec(intent);
    if (!result) return;
    const wsRoot = this._getWorkspaceRoot();
    this._post({ type: 'token', content: `\n\n✅ 스펙 저장: \`${path.relative(wsRoot ?? '', result.specPath)}\`` });
    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getEffectiveLlmConfig().model);
  }

  /** 스펙 생성 → 저장까지의 핵심 로직. 성공 시 {specPath, parsed} 반환, 실패·취소 시 null */
  private async _generateAndSaveSpec(
    intent: string,
    overrideDefaults?: Partial<import('../spec/SpecFileWriter').SpecFrontmatter>,
  ): Promise<{ specPath: string; parsed: import('../spec/SpecFileWriter').ParsedSpec } | null> {
    this._abortController?.abort();
    this._abortController = new AbortController();

    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) {
      this._post({ type: 'error', message: 'axiom-ai.sdd.axiomFolder 설정이 필요합니다.' });
      this._post({ type: 'done' });
      return null;
    }

    const knowledgeDir = this._resolveKnowledgeDir();
    const currentFile = vscode.window.activeTextEditor?.document.fileName;
    const config = ExtensionConfig.getEffectiveLlmConfig();

    this._postStatus('스펙 생성 중…');

    try {
      const collector = new ContextCollector(axiomDir, knowledgeDir);
      const ctx = await collector.collect(intent, currentFile);

      // 파일 미오픈 상태일 때 intent에서 도메인 추출
      // "example 도메인 ...", "example domain ...", "example/ ..." 형태 지원
      // ※ \b는 한글 앞에서 동작하지 않으므로 (?=\s|$) 사용
      if (!ctx.domain) {
        const fromIntent =
          intent.match(/^([a-zA-Z][\w-]*)\s*(?:도메인|domain)(?=\s|$)/i)?.[1]
          ?? intent.match(/^([a-zA-Z][\w-]*)\/\s*/)?.[1];
        if (fromIntent) ctx.domain = fromIntent.toLowerCase();
      }

      const generator = new SpecGenerator(this._llm);

      let fullSpec = '';
      let wasFallback = false;
      for await (const token of generator.generate(
        intent,
        ctx,
        this._abortController.signal,
        (reason) => { wasFallback = true; console.warn(`[SDD] 폴백: ${reason}`); },
      )) {
        fullSpec += token;
        this._post({ type: 'token', content: token });
      }

      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);

      let gitUser = 'unknown';
      try { gitUser = cp.execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim() || 'unknown'; } catch { /* git 없는 환경 */ }

      if (wasFallback) {
        fullSpec = SpecGenerator.generateOfflineStub(intent, ctx.domain ?? 'unknown', gitUser);
      }

      const writer = new SpecFileWriter(axiomDir);
      let parsed = writer.parseDraft(fullSpec);
      parsed = writer.applyDefaults(parsed, {
        status: 'draft',
        category: 'screen',
        owner: gitUser,
        ...overrideDefaults,
      });

      // AI가 domain을 'unknown'으로 채우거나 누락한 경우 intent에서 추출한 값으로 강제 교정
      if (ctx.domain && (!parsed.frontmatter.domain || parsed.frontmatter.domain === 'unknown')) {
        parsed.frontmatter.domain = ctx.domain;
        parsed = {
          ...parsed,
          raw: parsed.raw.replace(/^domain:\s*.*$/m, `domain: ${ctx.domain}`),
        };
      }

      const issues = writer.validateCompliance(parsed);
      if (issues.length > 0 && !overrideDefaults) {
        const issueText = issues.map((i) => `- ${i.field}: ${i.message}`).join('\n');
        const answer = await vscode.window.showWarningMessage(
          `컴플라이언스 검증 문제:\n${issueText}\n\n계속 저장하시겠습니까?`,
          { modal: true },
          '저장',
        );
        if (answer !== '저장') return null;
      }

      const specPath = await writer.save(parsed);

      const tracker = new AxiomIndexTracker(axiomDir);
      const domain = parsed.frontmatter.domain ?? 'unknown';
      const screen = parsed.frontmatter.screen ?? 'Unknown';
      tracker.upsertSpec({
        specPath: path.relative(axiomDir, specPath).replace(/\\/g, '/'),
        linkedSourcePath: `src/domains/${domain}/pages/${screen}.tsx`,
        lastModified: new Date().toISOString().slice(0, 10),
        domain,
        status: (overrideDefaults?.status as SpecIndexEntry['status'] | undefined) ?? 'draft',
      });

      return { specPath, parsed };

    } catch (err) {
      if ((err as Error).name === 'AbortError') { this._post({ type: 'done' }); return null; }
      this._post({ type: 'error', message: (err as Error).message });
      this._postStatus('오류 발생');
      return null;
    }
  }

  /** /spec fast: 스펙 생성 → 자동 승인 → 코드 생성을 한 번에 처리 */
  private async _handleSpecFast(intent: string): Promise<void> {
    let gitUser = 'unknown';
    try { gitUser = cp.execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim() || 'unknown'; } catch { /* ignore */ }

    this._post({ type: 'token', content: `⚡ 빠른 생성 모드: 스펙 생성 → 승인 → 코드 생성\n\n` });

    const result = await this._generateAndSaveSpec(intent, {
      status: 'approved',
      reviewer: gitUser,
    });
    if (!result) return;

    const wsRoot = this._getWorkspaceRoot();
    const writer = new SpecFileWriter(this._resolveAxiomDir()!);
    writer.updateStatus(result.specPath, 'approved', gitUser);

    this._post({ type: 'token', content: `\n\n✅ 스펙 저장 + 자동 승인: \`${path.relative(wsRoot ?? '', result.specPath)}\`` });
    this._post({ type: 'token', content: `\n\n🔨 코드 생성 중…\n` });

    const scaffolder = new SpecScaffolder();
    if (!wsRoot) {
      this._post({ type: 'error', message: '워크스페이스 루트를 찾을 수 없습니다.' });
      this._post({ type: 'done' });
      return;
    }

    const targetPath = await scaffolder.generate(result.parsed, wsRoot);
    if (!targetPath) {
      this._post({ type: 'token', content: '\n\n⏭️ 코드 생성을 건너뜀.' });
    } else {
      const axiomDir = this._resolveAxiomDir()!;
      const tracker = new AxiomIndexTracker(axiomDir);
      const rel = path.relative(axiomDir, result.specPath).replace(/\\/g, '/');
      tracker.transitionStatus(rel, 'implemented', gitUser);
      writer.updateStatus(result.specPath, 'implemented', gitUser);

      this._post({ type: 'token', content: `\n\n🎉 완료!\n- 스펙: \`${path.relative(wsRoot, result.specPath)}\`\n- 코드: \`${path.relative(wsRoot, targetPath)}\`` });
    }

    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getEffectiveLlmConfig().model);
  }

  // ─── /spec wizard 대화형 가이드 ─────────────────────────────────────────────

  private async _startSpecWizard(): Promise<void> {
    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) {
      this._post({ type: 'error', message: 'axiom-ai.sdd.axiomFolder 설정이 필요합니다.' });
      this._post({ type: 'done' });
      return;
    }

    // 활성 파일에서 도메인 사전 감지
    const activeFile = vscode.window.activeTextEditor?.document.fileName;
    const detectedDomain = activeFile
      ? new DomainRouter(axiomDir).detectDomain(activeFile) ?? undefined
      : undefined;

    this._wizardState = {
      step: 'intent',
      partial: { domain: detectedDomain },
      collectedSections: {},
    };

    const domainHint = detectedDomain ? ` (현재 파일 기준: **${detectedDomain}** 도메인)` : '';
    const welcomeMsg = [
      '🧙 **스펙 작성 가이드 모드**',
      '',
      '질문에 답하면 스펙이 자동으로 완성됩니다. 언제든 `/cancel` 로 종료할 수 있습니다.',
      '',
      `---`,
      '',
      `**1단계** — 어떤 화면을 만들고 싶으신가요?${domainHint}`,
      '예: "계좌 목록 화면", "이체 확인 페이지"',
    ].join('\n');

    this._post({ type: 'token', content: welcomeMsg });
    this._post({ type: 'done' });
    this._post({ type: 'wizardStep', step: 'intent', prompt: '화면 설명을 입력하세요' });
    this._postStatus('가이드 모드 — 1/6 화면 설명');
  }

  private async _handleWizardStep(userInput: string): Promise<void> {
    if (!this._wizardState) return;
    const state = this._wizardState;

    switch (state.step) {
      case 'intent': {
        state.partial.intent = userInput;
        // 도메인이 없으면 domain 단계로
        if (!state.partial.domain) {
          state.step = 'domain';
          const axiomDir = this._resolveAxiomDir();
          const domains = axiomDir ? new DomainRouter(axiomDir).listDomains() : [];
          const domainList = domains.length > 0
            ? `\n사용 가능한 도메인: ${domains.map((d) => `\`${d}\``).join(', ')}`
            : '';
          this._post({ type: 'token', content: `\n\n**2단계** — 어느 도메인에 속하나요?${domainList}\n예: \`auth\`, \`order\`, \`account\`` });
          this._post({ type: 'done' });
          this._post({ type: 'wizardStep', step: 'domain', prompt: '도메인명을 입력하세요' });
          this._postStatus('가이드 모드 — 2/6 도메인');
        } else {
          // 도메인이 이미 감지된 경우 acceptance 단계로
          state.step = 'acceptance';
          await this._wizardAskAcceptance();
        }
        break;
      }

      case 'domain': {
        state.partial.domain = userInput.trim().toLowerCase();
        state.step = 'acceptance';
        await this._wizardAskAcceptance();
        break;
      }

      case 'acceptance': {
        state.collectedSections['acceptance'] = userInput;
        state.step = 'api';
        this._post({ type: 'token', content: '\n\n**4단계** — 어떤 API를 호출하나요? (모르면 "모름" 입력)\n예: `GET /api/accounts`, `POST /api/transfer`' });
        this._post({ type: 'done' });
        this._post({ type: 'wizardStep', step: 'api', prompt: 'API 경로를 입력하세요' });
        this._postStatus('가이드 모드 — 4/6 API');
        break;
      }

      case 'api': {
        state.collectedSections['api'] = userInput === '모름' ? 'TODO: API 경로 작성' : userInput;
        state.step = 'exceptions';
        this._post({ type: 'token', content: '\n\n**5단계** — 처리해야 할 예외 상황이 있나요? (없으면 "없음" 입력)\n예: "권한 없음, 한도 초과, 서버 오류"' });
        this._post({ type: 'done' });
        this._post({ type: 'wizardStep', step: 'exceptions', prompt: '예외 상황을 입력하세요' });
        this._postStatus('가이드 모드 — 5/6 예외처리');
        break;
      }

      case 'exceptions': {
        state.collectedSections['exceptions'] = userInput === '없음' ? '' : userInput;
        state.step = 'review';
        await this._wizardFinalize();
        break;
      }

      default:
        break;
    }
  }

  private async _wizardAskAcceptance(): Promise<void> {
    if (!this._wizardState) return;
    const { intent, domain } = this._wizardState.partial;
    this._post({
      type: 'token',
      content: `\n\n**3단계** — 이 화면에서 가장 중요한 사용자 동작을 2~3가지 설명해주세요.\n(예: "계좌 목록 조회, 계좌 삭제, 빈 목록 안내")`,
    });
    this._post({ type: 'done' });
    this._post({ type: 'wizardStep', step: 'acceptance', prompt: '주요 동작을 입력하세요' });
    this._postStatus(`가이드 모드 — 3/6 수락기준 | ${domain ?? ''} > ${intent ?? ''}`);
  }

  private async _wizardFinalize(): Promise<void> {
    if (!this._wizardState) return;
    const { partial, collectedSections } = this._wizardState;

    this._post({ type: 'token', content: '\n\n⚙️ 스펙을 생성 중입니다…\n\n' });

    const intent = [
      partial.domain ? `${partial.domain} 도메인` : '',
      partial.intent ?? '',
    ].filter(Boolean).join(' ');

    // collectedSections를 intent에 보강하여 기존 _generateAndSaveSpec 파이프라인 재활용
    const enrichedIntent = [
      intent,
      collectedSections['acceptance'] ? `\n주요 동작: ${collectedSections['acceptance']}` : '',
      collectedSections['api'] ? `\nAPI: ${collectedSections['api']}` : '',
      collectedSections['exceptions'] ? `\n예외처리: ${collectedSections['exceptions']}` : '',
    ].filter(Boolean).join('');

    this._wizardState = null;
    this._postStatus('스펙 생성 중…');

    const result = await this._generateAndSaveSpec(enrichedIntent, { status: 'draft' });
    if (!result) return;

    const wsRoot = this._getWorkspaceRoot();
    this._post({
      type: 'token',
      content: `\n\n🎉 스펙 생성 완료!\n\`${path.relative(wsRoot ?? '', result.specPath)}\`\n\n다음 단계: \`/spec review\` → \`/spec approve\` → \`/scaffold\``,
    });
    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getEffectiveLlmConfig().model);
  }

  private async _handleSpecUpdate(intent: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('spec.md')) {
      this._post({ type: 'error', message: 'spec.md 파일을 열고 실행해주세요.' });
      this._post({ type: 'done' });
      return;
    }
    // 기존 스펙 내용을 intent에 포함하여 /spec 재실행
    const existingContent = editor.document.getText();
    await this._handleSpecCommand(`${intent}\n\n기존 스펙:\n${existingContent}`);
  }

  private async _handleSpecReview(): Promise<void> {
    await this._transitionCurrentSpec('review');
  }

  private async _handleSpecApprove(): Promise<void> {
    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('spec.md')) {
      this._post({ type: 'error', message: 'spec.md 파일을 열고 실행해주세요.' });
      this._post({ type: 'done' });
      return;
    }

    const content = editor.document.getText();
    const writer = new SpecFileWriter(axiomDir);
    const parsed = writer.parseDraft(content);

    if (!parsed.frontmatter.reviewer) {
      this._post({ type: 'error', message: '승인 전 frontmatter의 reviewer 필드를 입력해주세요.' });
      this._post({ type: 'done' });
      return;
    }

    await this._transitionCurrentSpec('approved');
  }

  private async _transitionCurrentSpec(status: 'review' | 'approved'): Promise<void> {
    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('spec.md')) {
      this._post({ type: 'error', message: 'spec.md 파일을 열고 실행해주세요.' });
      this._post({ type: 'done' });
      return;
    }

    const specPath = editor.document.fileName;
    const relPath = path.relative(axiomDir, specPath).replace(/\\/g, '/');
    const tracker = new AxiomIndexTracker(axiomDir);
    const writer = new SpecFileWriter(axiomDir);

    const by = vscode.workspace.getConfiguration('axiom-ai').get<string>('user.name', 'developer');
    tracker.transitionStatus(relPath, status, by);
    writer.updateStatus(specPath, status, by);

    this._post({ type: 'token', content: `✅ 상태 변경: **${status}** (by ${by})` });
    this._post({ type: 'done' });
    this._postStatus(ExtensionConfig.getLlmConfig().model);
  }

  // ─── /scaffold 커맨드 ────────────────────────────────────────────────────────

  private async _handleScaffoldCommand(): Promise<void> {
    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) {
      this._post({ type: 'error', message: 'axiom-ai.sdd.axiomFolder 설정이 필요합니다.' });
      this._post({ type: 'done' });
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('spec.md')) {
      this._post({ type: 'error', message: 'spec.md 파일을 열고 /scaffold를 실행해주세요.' });
      this._post({ type: 'done' });
      return;
    }

    const content = editor.document.getText();
    const writer = new SpecFileWriter(axiomDir);
    const parsed = writer.parseDraft(content);

    if (parsed.frontmatter.status !== 'approved') {
      this._post({ type: 'error', message: `스펙 status가 'approved'여야 합니다. 현재: ${parsed.frontmatter.status ?? 'unknown'}` });
      this._post({ type: 'done' });
      return;
    }

    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) {
      this._post({ type: 'error', message: '워크스페이스 루트를 찾을 수 없습니다.' });
      this._post({ type: 'done' });
      return;
    }

    this._postStatus('코드 생성 중…');

    try {
      const scaffolder = new SpecScaffolder();
      const targetPath = await scaffolder.generate(parsed, wsRoot);

      if (!targetPath) { this._post({ type: 'done' }); return; }

      // implemented 상태로 전이
      const specPath = editor.document.fileName;
      const relPath = path.relative(axiomDir, specPath).replace(/\\/g, '/');
      const tracker = new AxiomIndexTracker(axiomDir);
      const by = vscode.workspace.getConfiguration('axiom-ai').get<string>('user.name', 'developer');
      tracker.transitionStatus(relPath, 'implemented', by);
      writer.updateStatus(specPath, 'implemented', by);

      const rel = path.relative(wsRoot, targetPath);
      this._post({ type: 'token', content: `🔨 코드 생성 완료: \`${rel}\`` });
      this._post({ type: 'done' });
      this._postStatus(ExtensionConfig.getLlmConfig().model);

    } catch (err) {
      this._post({ type: 'error', message: (err as Error).message });
      this._postStatus('오류 발생');
    }
  }

  // ─── 영역 편집(실험) ──────────────────────────────────────────────────────────

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

    this._postStatus('영역 편집 시도 중…');
    const outcome = await runHybridRegionEdit(source, query, callModel, refResult.block || undefined, disambiguate, referenceImports);
    this._corpusOutputChannel.appendLine(outcome.diagnostics);

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
      this._post({
        type: 'token',
        content: '\n\n> ℹ️ **영역 편집 결과가 현재 파일과 동일합니다** — 변경 없음(이미 적용된 상태일 수 있습니다).\n',
      });
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
          '>\n> 다시 시도하거나, 요청을 더 작은 단위로 나눠 보내거나 `/spec update` 명령을 사용해보세요.\n',
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

      // 페이지 생성 플로우에서는 InputBox 없이 자동 저장
      if (forcePageAutoWrite && action.templateType === 'page') {
        action.autoWrite = true;
      }

      // 1차: <patch> 래핑된 다중 쌍 파싱
      const patchBlockMatches = [...blockContent.matchAll(/<patch>\s*([\s\S]*?)\s*<\/patch>/g)];
      if (patchBlockMatches.length > 0) {
        const patches: { search: string; replace: string }[] = [];
        for (const pb of patchBlockMatches) {
          const inner = pb[1];
          const s = inner.match(/<search>\n?([\s\S]*?)<\/search>/);
          const r = inner.match(/<replace>\n?([\s\S]*?)<\/replace>/);
          if (s?.[1] !== undefined && r?.[1] !== undefined) {
            patches.push({
              search: s[1].replace(/\n$/, ''),
              replace: r[1].replace(/\n$/, ''),
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
        const replaceMatch = blockContent.match(/<replace>\n?([\s\S]*?)<\/replace>/);
        if (searchMatch?.[1] !== undefined && replaceMatch?.[1] !== undefined) {
          action.patches = [{
            search: searchMatch[1].replace(/\n$/, ''),
            replace: replaceMatch[1].replace(/\n$/, ''),
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
          if (!dep.ok) {
            this._corpusOutputChannel.appendLine(
              `[Axiom AI] ⛔ structural 의존성 미해소 (${action.filePath}): ${dep.unresolved.join(', ')}`,
            );
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

        // precomputedDiff(region 경로의 디스크 기준 diff)가 있으면 재계산을 건너뛴다 — 에디터 버퍼와
        // 디스크 합성본의 정규화 mismatch로 빈 diff가 되는 것을 막는다(확인 카드 diff 보존).
        const diff =
          precomputedDiff ??
          (originalContent !== undefined && action.generatedCode
            ? computeDiffHunks(originalContent, action.generatedCode)
            : []);
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
    if (forceFull && filePath) {
      const { originalContent } = await this._fileCreator.readFileContent({
        action: 'updateFile', templateType: 'page', domain: domain ?? '', componentName: '', filePath,
      });
      if (originalContent) {
        const sel = this._lastSelectionLineRange;
        const selNote = sel ? ` (원래 수정 요청 영역: 라인 ${sel.startLine}~${sel.endLine})` : '';
        currentFileBlock = `\n\n아래는 **현재 \`${filePath}\` 파일의 실제 전체 내용**입니다. 직전 응답을 신뢰하지 말고 반드시 이것을 기준으로 작성하세요.${selNote}\n\`\`\`${lang}\n${originalContent}\n\`\`\`\n`;
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
${currentFileBlock}
위 대화의 원래 요청을 반영해, **위 현재 파일 전체를 기준으로** 변경분을 적용한 전체 파일 내용을 출력하세요(부가 설명 없이 블록만). 현재 파일에 없는 import·훅·변수를 임의로 가정하지 말고, 실제 파일 내용만 근거로 하세요:

${fullActionBlock}`;
    } else if (mp.enabled) {
      retryMsg = `위 응답의 수정 내용을 아래 형식 중 하나로만 출력하세요(부가 설명 없이 블록만).

⚠️ **\`<search>\` 규칙: 반드시 원본 파일에 지금 존재하는 코드만. 아직 없는 코드를 \`<search>\`에 넣으면 매칭 실패.**
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
          content: `\n\n> ⚠️ 재시도 응답 시간이 초과되었습니다 (${RETRY_TIMEOUT_MS / 1000}초). 파일이 너무 크거나 모델이 느립니다. \`/spec update\` 명령을 사용해보세요.`,
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
        content: '\n\n> ⚠️ 재시도 후에도 파일 수정 블록이 생성되지 않았습니다. `/spec update` 명령을 사용해보세요.',
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

    // 페이지명을 추출하지 못했으면(순수 한국어 이름) 영문 PascalCase 이름을 먼저 되묻는다.
    if (!pageName) {
      this._pageCreationState = {
        pageName: '',
        domainCandidates: [],
        waitingForName: true,
        waitingForDomain: false,
        resolvedDomain: null,
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

    await this._promptForDomain(pageName);
  }

  /**
   * 페이지명이 확정된 뒤 대상 도메인을 결정한다(에디터 감지 → 단일/복수 도메인 선택).
   */
  private async _promptForDomain(pageName: string): Promise<void> {
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
    await this._promptForDomain(pageName);
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
        await this._createPageFromTemplate(pageName, domain, true);
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
   * @param offlineFallback true면 vLLM 연결 실패로 인한 폴백(경고 헤더), false면 의도된 템플릿 모드.
   */
  private async _createPageFromTemplate(
    pageName: string,
    domain: string,
    offlineFallback = false,
  ): Promise<void> {
    this._postStatus(offlineFallback ? '오프라인 모드 — 템플릿 생성 중…' : '템플릿 생성 중…');

    const wsRoot = this._getWorkspaceRoot();
    const domainExists = wsRoot
      ? fs.existsSync(path.join(wsRoot, 'src', 'domains', domain))
      : false;

    const routePath = this._toRoutePath(pageName);

    const actions = this._buildOfflinePageActions(pageName, domain, routePath, domainExists, wsRoot);

    const header = offlineFallback
      ? `> ⚠️ **오프라인 모드** — vLLM 서버에 연결할 수 없어 기본 템플릿으로 생성합니다.`
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
    this._postStatus(offlineFallback ? '⚠️ 오프라인 모드' : ExtensionConfig.getLlmConfig().model);

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

    const ctrl = new AbortController();
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
