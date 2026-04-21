import * as vscode from 'vscode';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { registerCommands } from './commands/index';

export function activate(context: vscode.ExtensionContext): void {
  const launcherProvider = new ChatPanelProvider(context.extensionUri);
  const chatProvider = new ChatViewProvider(context.extensionUri);

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
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('axiom-ai.openChat', async () => {
      // chatView는 secondarySidebar의 axiom-ai-chat-container에 등록되어 있으므로
      // focus 커맨드만으로 우측 Secondary Side Bar에서 열린다.
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

  registerCommands(context, launcherProvider);

  // corpus 파일 변경 감시 등록
  chatProvider.registerCorpusWatcher(context);

  // RAG 임베딩 인덱스를 백그라운드에서 미리 빌드 시작
  // (첫 채팅 전에 준비되도록 activate 시점에 실행)
  chatProvider.startIndexBuild();
}

export function deactivate(): void {}
