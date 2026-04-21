import * as vscode from 'vscode';
import type { ChatPanelProvider } from '../providers/ChatPanelProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: ChatPanelProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('axiom-ai.openChat', () => {
      vscode.commands.executeCommand('axiom-ai.chatPanel.focus');
    }),
    vscode.commands.registerCommand('axiom-ai.clearHistory', () => {
      provider.clearHistory();
      vscode.window.showInformationMessage('Axiom AI: 대화 기록이 초기화되었습니다.');
    }),
  );
}
