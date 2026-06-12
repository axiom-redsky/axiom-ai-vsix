import * as vscode from 'vscode';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SddPanelProvider } from './views/SddPanelProvider';
import { ProjectConfigProvider } from './providers/ProjectConfigProvider';
import { SliceProbeProvider } from './providers/SliceProbeProvider';
import { RegionIoProbeProvider } from './providers/RegionIoProbeProvider';
import { registerCommands } from './commands/index';
import { ExtensionConfig } from './config/ExtensionConfig';
import { AxiomIndexTracker } from './spec/AxiomIndexTracker';
import { initEmbeddingPipeline } from './ai/EmbeddingService';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
  // 통합 설정 계층 초기화(SecretStorage 핸들·apiKey 선로딩·통합 설정 파일 감시).
  // 비동기지만 즉시 await하지 않아도 안전 — 선로딩 전엔 종전(settings.json) 동작으로 폴백한다.
  void ExtensionConfig.init(context);

  const launcherProvider = new ChatPanelProvider(context.extensionUri);
  const chatProvider = new ChatViewProvider(context.extensionUri);
  const sddPanel = new SddPanelProvider();
  const projectConfigProvider = new ProjectConfigProvider(context.extensionUri);
  const sliceProbeProvider = new SliceProbeProvider(context.extensionUri);
  const regionIoProbeProvider = new RegionIoProbeProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewId,
      launcherProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewId,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerTreeDataProvider(
      SddPanelProvider.viewId,
      sddPanel,
    ),
    vscode.window.registerWebviewViewProvider(
      ProjectConfigProvider.viewId,
      projectConfigProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      SliceProbeProvider.viewId,
      sliceProbeProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      RegionIoProbeProvider.viewId,
      regionIoProbeProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // SDD 패널 + 프로젝트 설정 패널 axiomDir 초기화
  _initSddPanel(sddPanel, context);
  _initProjectConfigProvider(projectConfigProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('axiom-ai.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      try {
        await vscode.commands.executeCommand('axiom-ai.chatView.focus');
      } catch {
        await vscode.commands.executeCommand('workbench.view.extension.axiom-ai-chat-container');
      }
    }),

    vscode.commands.registerCommand('axiom-ai.clearHistory', () => {
      chatProvider.clearHistory();
      vscode.window.showInformationMessage('Axiom AI: 대화 기록이 초기화되었습니다.');
    }),
  );

  registerCommands(context, launcherProvider, chatProvider, sddPanel);

  // corpus 파일 변경 감시 등록
  chatProvider.registerCorpusWatcher(context);
  sddPanel.registerWatcher(context);

  // RAG 임베딩 인덱스를 백그라운드에서 미리 빌드 시작
  chatProvider.startIndexBuild();
  // 임베딩 모델 콜드 스타트 방지 — buildIndex 완료 여부와 무관하게 파이프라인 워밍업
  initEmbeddingPipeline().catch(() => {});

  // 설정 변경 시 SDD 패널 + 프로젝트 설정 패널 재초기화
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) {
        _initSddPanel(sddPanel, context);
        _initProjectConfigProvider(projectConfigProvider);
      }
    }),
  );

  // staleness 체크 (activate 시 1회)
  _checkStaleness();
}

function _initSddPanel(sddPanel: SddPanelProvider, context: vscode.ExtensionContext): void {
  const axiomFolder = ExtensionConfig.getSddAxiomFolder();
  if (!axiomFolder) return;

  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
    ? path.join(wsRoot, axiomFolder)
    : axiomFolder;

  sddPanel.setAxiomDir(axiomDir);
  sddPanel.registerWatcher(context);
}

function _initProjectConfigProvider(provider: ProjectConfigProvider): void {
  const axiomFolder = ExtensionConfig.getSddAxiomFolder();
  if (!axiomFolder) return;

  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
    ? path.join(wsRoot, axiomFolder)
    : axiomFolder;

  provider.setAxiomDir(axiomDir);
}

function _checkStaleness(): void {
  const axiomFolder = ExtensionConfig.getSddAxiomFolder();
  if (!axiomFolder) return;

  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) return;

  const axiomDir = path.isAbsolute(axiomFolder) ? axiomFolder : path.join(wsRoot, axiomFolder);
  const tracker = new AxiomIndexTracker(axiomDir);
  const stale = tracker.checkStaleness(wsRoot);

  if (stale.length > 0) {
    vscode.window.showWarningMessage(
      `⚠️ ${stale.length}개 스펙이 만료되었습니다. SDD 패널에서 확인해주세요.`,
      '패널 열기',
    ).then((action) => {
      if (action === '패널 열기') {
        vscode.commands.executeCommand('axiom-ai.sddPanel.focus');
      }
    });
  }
}

export function deactivate(): void {}
