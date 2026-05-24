import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { LlmService } from '../ai/LlmService';
import { EditorContextCollector } from '../ai/EditorContextCollector';
import { ScaffoldContextBuilder } from '../ai/ScaffoldContextBuilder';
import { FileCreatorService } from '../ai/FileCreatorService';
import type { AxiomAction } from '../ai/FileCreatorService';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { ChatMessage } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, SpecWizardState } from '../types/messages';
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
          break;
        case 'clearHistory':
          this._history = [];
          break;
      }
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

    this._abortController?.abort();
    this._abortController = new AbortController();

    this._history.push({ role: 'user', content: text });

    const config = ExtensionConfig.getLlmConfig();
    this._postStatus(`${config.model} 응답 중…`);

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

      const cleanedResponse = this._stripActionBlock(fullResponse);
      this._history.push({ role: 'assistant', content: cleanedResponse });
      this._post({ type: 'done' });
      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);

      await this._handleAxiomAction(fullResponse);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this._post({ type: 'done' });
        this._postStatus(ExtensionConfig.getLlmConfig().model);
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
      'status: draft                           # ↓ 아래 상태 흐름 참고',
      'tags: [example, account-list]           # 검색/필터용 태그',
      '# 금융 화면 추가 필수 필드:',
      'reviewer: 이검토                        # 승인 담당자',
      'compliance-tags: [KYC, AML]             # 금융 규정 태그',
      '```',
      '',
      '**status 흐름**: `draft` → `review` → `approved` → `implemented`',
      '- `draft` — 작성 중 (기본값)',
      '- `review` — 리뷰 요청. `/spec review` 로 전환',
      '- `approved` — 승인 완료. `/spec approve` 로 전환 (reviewer 필수)',
      '- `implemented` — 코드 생성 완료. `/scaffold` 실행 시 자동 전환',
      '',
      '---',
      '',
      '## 필수 섹션 구조',
      '',
      '### ## 수락 기준 *(frontmatter 바로 뒤, 필수)*',
      '4가지 케이스를 체크리스트로 작성합니다.',
      '```markdown',
      '## 수락 기준',
      '- [ ] 정상 상태: 계좌 목록이 카드 형태로 표시된다',
      '- [ ] 로딩 상태: API 호출 중 스켈레톤 UI가 표시된다',
      '- [ ] 빈 상태: 계좌 없을 때 "등록된 계좌가 없습니다" 안내가 표시된다',
      '- [ ] 에러 상태: 400/500 응답 시 토스트 메시지가 표시된다',
      '```',
      '',
      '### ## API',
      '```markdown',
      '## API',
      '- GET /api/accounts — 계좌 목록 조회',
      '- DELETE /api/accounts/{id} — 계좌 삭제',
      '```',
      '',
      '### ## 컴포넌트 구조',
      '```markdown',
      '## 컴포넌트 구조',
      '- `AccountListPage.tsx` — src/domains/example/pages/',
      '  - `AccountCard` — @axiom/components/ui',
      '  - `EmptyState` — @axiom/components/ui',
      '```',
      '',
      '### ## 예외 처리',
      '```markdown',
      '## 예외 처리',
      '- 400: "잘못된 요청입니다" 토스트',
      '- 403: 권한 없음 페이지로 리다이렉트',
      '- 500/503: "일시적 오류" 안내 + 재시도 버튼',
      '```',
      '',
      '### ## 미결정 사항 *(선택)*',
      '```markdown',
      '## 미결정 사항',
      '- 페이지네이션 방식: 무한 스크롤 vs 페이지 버튼 (기획 확인 필요)',
      '```',
      '',
      '---',
      '',
      '## 스펙 수정 방법',
      '',
      '| 방법 | 사용 시점 |',
      '|---|---|',
      '| **직접 편집** | 수락 기준 체크, 미결정 사항 해소 등 간단한 수정 |',
      '| **`/spec update <내용>`** | spec.md 열고 AI에게 수정 요청 (큰 변경) |',
      '',
      '**직접 편집 예시**',
      '```markdown',
      '# 수락 기준에 케이스 추가:',
      '- [ ] 검색 상태: 키워드 입력 시 필터링된 목록이 실시간 표시된다',
      '',
      '# status 수동 변경:',
      'status: review',
      '```',
      '',
      '**AI 보조 수정 예시**',
      '```',
      '# spec.md 파일을 열고:',
      '/spec update 페이지네이션을 무한 스크롤로 결정, 수락 기준에 추가해줘',
      '/spec update 계좌 삭제 기능 추가, API 섹션과 수락 기준 업데이트',
      '```',
      '',
      '---',
      '',
      '## 코딩 규칙 (스펙 작성 시 참고)',
      '- API 호출: `useApi(@axiom/hooks)` 훅만 사용',
      '- UI 컴포넌트: `@axiom/components/ui` 에서 import',
      '- 라우팅: `createHashRouter` + `loadable()` 적용',
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

  private async _handleAxiomAction(response: string): Promise<void> {
    const blockRegex = /<axiom-action>([\s\S]*?)<\/axiom-action>/g;
    const actions: AxiomAction[] = [];

    for (const blockMatch of response.matchAll(blockRegex)) {
      const blockContent = blockMatch[1];
      const jsonMatch = blockContent.match(/(\{[^`]*?\})/s);
      if (!jsonMatch) {
        this._post({ type: 'fileError', message: 'axiom-action JSON 메타데이터를 찾을 수 없습니다.' });
        continue;
      }

      let action: AxiomAction;
      try {
        action = JSON.parse(jsonMatch[1].trim()) as AxiomAction;
      } catch {
        this._post({ type: 'fileError', message: 'axiom-action JSON 파싱에 실패했습니다.' });
        continue;
      }

      const codeMatch = blockContent.match(/```(?:[a-z]*)\n([\s\S]*?)```/);
      if (codeMatch?.[1]) action.generatedCode = codeMatch[1].trimEnd();
      actions.push(action);
    }

    if (actions.length === 0) return;

    for (const action of actions) {
      const result = await this._fileCreator.createFile(action);
      if (result.success) {
        const isUpdate = action.action === 'updateFile';
        this._post(
          isUpdate
            ? { type: 'fileUpdated', filePath: result.filePath! }
            : { type: 'fileCreated', filePath: result.filePath! },
        );
      } else if (result.cancelled) {
        this._post({ type: 'fileCancelled' });
        if (action.templateType !== 'router') break;
      } else {
        this._post({ type: 'fileError', message: result.error ?? '알 수 없는 오류' });
      }
    }
  }

  private _stripActionBlock(text: string): string {
    return text.replace(/<axiom-action>[\s\S]*?<\/axiom-action>/g, '').trim();
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
