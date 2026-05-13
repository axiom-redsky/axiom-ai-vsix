import * as vscode from 'vscode';
import type { ChatPanelProvider } from '../providers/ChatPanelProvider';
import type { ChatViewProvider } from '../providers/ChatViewProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  _provider: ChatPanelProvider,
  chatProvider?: ChatViewProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('axiom-ai.reindexCorpus', () => {
      chatProvider?.startIndexBuild();
      vscode.window.showInformationMessage('Axiom AI: Corpus 인덱스 재빌드를 시작했습니다.');
    }),
  );
}
