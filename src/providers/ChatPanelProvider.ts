import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { WebviewToHostMessage, HostToWebviewMessage } from '../types/messages';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.chatPanel';

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
        case 'openChat':
          // extension.ts에 등록된 axiom-ai.openChat 커맨드를 실행한다.
          // (Secondary Side Bar 이동 + 채팅 뷰 포커스 로직이 모두 포함되어 있다)
          vscode.commands.executeCommand('axiom-ai.openChat');
          break;
        case 'clearHistory':
          vscode.commands.executeCommand('axiom-ai.clearHistory');
          break;
      }
    });
  }

  clearHistory(): void {
    // ChatViewProvider의 clearHistory는 extension.ts에서 직접 호출한다.
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
      () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 62)
        ],
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
  <title>Axiom AI</title>
</head>
<body data-mode="launcher">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
