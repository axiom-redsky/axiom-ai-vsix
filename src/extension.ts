import * as vscode from 'vscode';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { registerCommands } from './commands/index';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewId,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  registerCommands(context, provider);
}

export function deactivate(): void {}
