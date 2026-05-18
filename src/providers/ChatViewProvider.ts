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
import type { WebviewToHostMessage, HostToWebviewMessage } from '../types/messages';
import { ContextCollector } from '../spec/ContextCollector';
import { SpecGenerator } from '../spec/SpecGenerator';
import { SpecFileWriter } from '../spec/SpecFileWriter';
import { SpecScaffolder } from '../spec/SpecScaffolder';
import { AxiomIndexTracker } from '../spec/AxiomIndexTracker';
import { DomainRouter } from '../spec/DomainRouter';
import { SddCorpusLoader } from '../spec/SddCorpusLoader';

/**
 * 우측 Secondary Side Bar에 표시되는 채팅 WebviewView 프로바이더.
 * WebviewPanel(에디터 탭)이 아닌 WebviewView(사이드바 패널)로 동작한다.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.chatView';

  private _view?: vscode.WebviewView;
  private _history: ChatMessage[] = [];
  private _abortController?: AbortController;
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

  // ─── private: 메시지 처리 ────────────────────────────────────────────────────

  private async _handleMessage(text: string): Promise<void> {
    if (!this._view) return;

    // /spec 커맨드 분기
    if (text.startsWith('/spec ') || text === '/spec') {
      const subtext = text.slice('/spec'.length).trim();

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
      await this._handleSpecCommand(subtext || '현재 파일 스펙 생성');
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

  private async _handleSpecCommand(intent: string): Promise<void> {
    this._abortController?.abort();
    this._abortController = new AbortController();

    const axiomDir = this._resolveAxiomDir();
    if (!axiomDir) {
      this._post({ type: 'error', message: 'axiom-ai.sdd.axiomFolder 설정이 필요합니다.' });
      this._post({ type: 'done' });
      return;
    }

    const knowledgeDir = this._resolveKnowledgeDir();
    const currentFile = vscode.window.activeTextEditor?.document.fileName;
    const config = ExtensionConfig.getEffectiveLlmConfig();

    this._postStatus(`스펙 생성 중…`);

    try {
      const collector = new ContextCollector(axiomDir, knowledgeDir);
      const ctx = await collector.collect(intent, currentFile);
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

      this._post({ type: 'done' });
      this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);

      let gitUser = 'unknown';
      try { gitUser = cp.execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim() || 'unknown'; } catch { /* git 없는 환경 */ }

      // 오프라인 fallback이면 FallbackStubService 결과를 버리고 스펙 전용 스텁 사용
      if (wasFallback) {
        fullSpec = SpecGenerator.generateOfflineStub(intent, ctx.domain ?? 'unknown', gitUser);
      }

      // 누락 필드 자동 채움
      const writer = new SpecFileWriter(axiomDir);
      let parsed = writer.parseDraft(fullSpec);

      parsed = writer.applyDefaults(parsed, {
        status: 'draft',
        category: 'screen',
        owner: gitUser,
      });

      // 자동으로 채울 수 없는 필드만 경고
      const issues = writer.validateCompliance(parsed);
      if (issues.length > 0) {
        const issueText = issues.map((i) => `- ${i.field}: ${i.message}`).join('\n');
        const answer = await vscode.window.showWarningMessage(
          `컴플라이언스 검증 문제:\n${issueText}\n\n계속 저장하시겠습니까?`,
          { modal: true },
          '저장',
        );
        if (answer !== '저장') return;
      }

      // 저장
      const specPath = await writer.save(parsed);

      // .axiom-index.json 업데이트
      const tracker = new AxiomIndexTracker(axiomDir);
      const domain = parsed.frontmatter.domain ?? 'unknown';
      const screen = parsed.frontmatter.screen ?? 'Unknown';
      const wsRoot = this._getWorkspaceRoot();
      tracker.upsertSpec({
        specPath: path.relative(axiomDir, specPath).replace(/\\/g, '/'),
        linkedSourcePath: `src/domains/${domain}/pages/${screen}.tsx`,
        lastModified: new Date().toISOString().slice(0, 10),
        domain,
        status: 'draft',
      });

      this._post({ type: 'token', content: `\n\n✅ 스펙 저장: \`${path.relative(wsRoot ?? '', specPath)}\`` });
      this._post({ type: 'done' });

    } catch (err) {
      if ((err as Error).name === 'AbortError') { this._post({ type: 'done' }); return; }
      this._post({ type: 'error', message: (err as Error).message });
      this._postStatus('오류 발생');
    }
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
      context.subscriptions.push(this._axiomWatcher);
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
