import * as vscode from 'vscode';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SddPanelProvider } from './views/SddPanelProvider';
import { registerCommands } from './commands/index';
import { ExtensionConfig } from './config/ExtensionConfig';
import { AxiomIndexTracker } from './spec/AxiomIndexTracker';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
  const launcherProvider = new ChatPanelProvider(context.extensionUri);
  const chatProvider = new ChatViewProvider(context.extensionUri);
  const sddPanel = new SddPanelProvider();

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
  );

  // SDD 패널 axiomDir 초기화
  _initSddPanel(sddPanel, context);

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

  // 설정 변경 시 SDD 패널 재초기화
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) {
        _initSddPanel(sddPanel, context);
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
