import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { LlmService } from '../ai/LlmService';
import { EditorContextCollector } from '../ai/EditorContextCollector';
import { ScaffoldContextBuilder } from '../ai/ScaffoldContextBuilder';
import { FileCreatorService } from '../ai/FileCreatorService';
import type { AxiomAction } from '../ai/FileCreatorService';
import { computeDiffHunks } from '../ai/DiffUtil';
import { PageCreationDetector } from '../ai/PageCreationDetector';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { ChatMessage } from '../ai/types';
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
  private readonly _pendingConfirmations = new Map<string, { resolve: (approved: boolean) => void }>();

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._llm = new LlmService(_extensionUri);
    this._editorCollector = new EditorContextCollector(ExtensionConfig.getMaxFileLines());
    this._corpusOutputChannel = vscode.window.createOutputChannel('axiom-ai: Corpus');
    this._scaffoldBuilder = new ScaffoldContextBuilder(_extensionUri, this._corpusOutputChannel);
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
          await this._handleMessage(msg.text);
          break;
        case 'stopMessage':
          this._abortController?.abort();
          for (const [, entry] of this._pendingConfirmations) entry.resolve(false);
          this._pendingConfirmations.clear();
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
        case 'clearHistory':
          this._history = [];
          break;
      }
    });
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

  private async _handleMessage(text: string): Promise<void> {
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

    // 페이지 생성 인텐트 감지
    const pageIntent = this._pageCreationDetector.detect(text);
    if (pageIntent.isPageCreation && pageIntent.pageName) {
      await this._startPageCreation(pageIntent.pageName, text);
      return;
    }

    this._abortController?.abort();
    this._abortController = new AbortController();

    this._history.push({ role: 'user', content: text });

    const config = ExtensionConfig.getEffectiveLlmConfig();
    this._postStatus('컨텍스트 분석 중…');

    try {
      const editorCtx = this._editorCollector.collect();

      // .axiom/ SDD 스펙을 일반 채팅 컨텍스트에도 주입
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
          editorCtx.content = (editorCtx.content ?? '') +
            `\n\n<!-- SDD 스펙 컨텍스트 -->\n${sddSection}`;
        }
      }

      const systemPrompt = await this._scaffoldBuilder.buildSystemPrompt(editorCtx, text);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this._history,
      ];
      let fullResponse = '';
      let wasFallback = false;

      this._postStatus(`${config.model} 응답 중…`);

      for await (const token of this._llm.streamChat(
        messages,
        config,
        this._abortController.signal,
        (reason) => {
          wasFallback = true;
          console.warn(`[Axiom AI] 오프라인 폴백 활성화: ${reason}`);
        },
      )) {
        fullResponse += token;
        this._post({ type: 'token', content: token });
      }

      const hasActionBlock = fullResponse.includes('<axiom-action>');
      const isFileCtx = this._scaffoldBuilder.isFileModificationContext(text, editorCtx.filePath ?? '');

      if (!hasActionBlock && isFileCtx) {
        // axiom-action 누락: 원래 응답을 히스토리에 저장 후 자동 재시도
        this._corpusOutputChannel.appendLine(
          `[Axiom AI] ⚠️ 시나리오 C axiom-action 누락, 자동 재시도\n응답 앞부분: ${fullResponse.substring(0, 300)}`,
        );
        const cleanedFirst = this._stripActionBlock(fullResponse);
        this._history.push({ role: 'assistant', content: cleanedFirst });

        const retryResult = await this._retryForAxiomAction(
          systemPrompt, editorCtx.filePath ?? '', config,
        );

        this._post({ type: 'done' });
        this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);
        if (retryResult) {
          await this._handleAxiomAction(retryResult);
        }
        return;
      }

      const cleanedResponse = this._stripActionBlock(fullResponse);
      this._history.push({ role: 'assistant', content: cleanedResponse });
      this._post({ type: 'done' });
      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);

      await this._handleAxiomAction(fullResponse, true);
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

  // ─── axiom-action ────────────────────────────────────────────────────────────

  /**
   * axiom-action 블록을 파싱하여 파일을 생성/수정한다.
   * @returns 라우터 관련 액션이 성공적으로 처리되었으면 true
   */
  private async _handleAxiomAction(response: string, forcePageAutoWrite = false): Promise<boolean> {
    const blockRegex = /<axiom-action>([\s\S]*?)<\/axiom-action>/g;
    const actions: AxiomAction[] = [];
    const blockMatches = [...response.matchAll(blockRegex)];
    this._corpusOutputChannel.appendLine(`[Axiom AI] _handleAxiomAction: 블록 수=${blockMatches.length}`);

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

      const codeMatch = blockContent.match(/```(?:[a-z]*)\n([\s\S]*?)```/);
      if (codeMatch?.[1]) action.generatedCode = codeMatch[1].trimEnd();
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
        const diff =
          originalContent !== undefined && action.generatedCode
            ? computeDiffHunks(originalContent, action.generatedCode)
            : [];
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
   * 시나리오 C 응답에서 axiom-action 블록이 누락된 경우 자동 재시도.
   * 대화 히스토리에 재시도 요청을 추가하고 LLM에 다시 요청한다.
   * @returns 재시도 응답 전체 문자열, 실패 시 null
   */
  private async _retryForAxiomAction(
    systemPrompt: string,
    filePath: string,
    config: ReturnType<typeof ExtensionConfig.getEffectiveLlmConfig>,
  ): Promise<string | null> {
    this._post({ type: 'token', content: '\n\n---\n*파일 수정 블록 자동 재시도 중…*\n\n' });

    const domain = this._scaffoldBuilder.extractDomainFromFilePath(filePath);
    const retryMsg = `코드 수정 블록(axiom-action)이 응답에 포함되지 않았습니다.
위에서 설명한 수정 내용을 아래 형식으로만 출력해주세요 (추가 설명 없이 블록만):

<axiom-action>
{"action":"updateFile","templateType":"page","domain":"${domain ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 기존 코드 전체 + 요청된 변경사항이 반영된 완전한 파일 내용
\`\`\`
</axiom-action>`;

    this._history.push({ role: 'user', content: retryMsg });

    const retryMessages: import('../ai/types').ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this._history,
    ];

    let retryResponse = '';
    try {
      for await (const token of this._llm.streamChat(
        retryMessages,
        config,
        this._abortController?.signal,
      )) {
        retryResponse += token;
        this._post({ type: 'token', content: token });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this._corpusOutputChannel.appendLine(`[Axiom AI] 재시도 스트림 오류: ${(err as Error).message}`);
      }
      return null;
    }

    const hasBlock = retryResponse.includes('<axiom-action>');
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 재시도 결과: axiom-action ${hasBlock ? '포함' : '여전히 누락'}`,
    );

    const cleanedRetry = this._stripActionBlock(retryResponse);
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
  private async _startPageCreation(pageName: string, originalText: string): Promise<void> {
    this._history.push({ role: 'user', content: originalText });

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

    this._post({
      type: 'token',
      content: `\`${resolvedDomain}\` 도메인에 **${pageName}** 페이지를 생성합니다...\n\n`,
    });

    // 헬스체크 없이 바로 LLM 호출 시도 — _createPageWithLlm 내부에 자동 폴백 포함
    await this._createPageWithLlm(pageName, resolvedDomain);

    this._pageCreationState = null;
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
        await this._createPageOffline(pageName, domain);
        return;
      }

      const cleanedResponse = this._stripActionBlock(fullResponse);
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
   * vLLM이 오프라인일 때: axiom-action 블록을 직접 조합하여 파일을 생성한다.
   * 도메인 존재 여부에 따라 시나리오 A(2개 액션) / B(3개 액션)를 적용한다.
   */
  private async _createPageOffline(pageName: string, domain: string): Promise<void> {
    this._postStatus('오프라인 모드 — 템플릿 생성 중…');

    const wsRoot = this._getWorkspaceRoot();
    const domainExists = wsRoot
      ? fs.existsSync(path.join(wsRoot, 'src', 'domains', domain))
      : false;

    const routePath = this._toRoutePath(pageName);

    const actions = this._buildOfflinePageActions(pageName, domain, routePath, domainExists, wsRoot);

    const offlineMsg = [
      `> ⚠️ **오프라인 모드** — vLLM 서버에 연결할 수 없어 기본 템플릿으로 생성합니다.`,
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

    this._post({ type: 'token', content: offlineMsg });

    this._history.push({ role: 'assistant', content: offlineMsg });
    this._post({ type: 'done' });
    this._postStatus('⚠️ 오프라인 모드');

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
  private _appendToExistingRouter(
    existing: string,
    pageName: string,
    domain: string,
    routePath: string,
  ): string {
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

    let withImport: string;
    if (existing.includes(importLine)) {
      withImport = existing;
    } else {
      // 1순위: 마지막 Router import 뒤
      withImport = existing.replace(
        /(import \w+Router from [^\n]+\n)(?!import \w+Router)/,
        `$1${importLine}\n`,
      );
      if (withImport === existing) {
        // 2순위: const routes 선언 바로 앞
        withImport = existing.replace(/^(const routes\b)/m, `${importLine}\n$1`);
      }
    }

    const routeEntry = `  { path: '/${domain}', element: <RootLayout />, children: ${domainPascal}Router },`;

    let result = withImport.replace(/(\];)/, `${routeEntry}\n$1`);
    if (result === withImport) {
      result = withImport.replace(/^(\s*\])/m, `${routeEntry}\n$1`);
    }
    return result;
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
