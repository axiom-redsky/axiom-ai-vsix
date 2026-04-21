import * as vscode from 'vscode';
import { LlmService } from '../services/LlmService';
import { EditorContextCollector } from '../context/EditorContextCollector';
import { ScaffoldContextBuilder } from '../context/ScaffoldContextBuilder';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { ChatMessage, WebviewToHostMessage, HostToWebviewMessage } from '../types/llm';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.chatPanel';

  private _view?: vscode.WebviewView;
  private _history: ChatMessage[] = [];
  private _abortController?: AbortController;

  private readonly _llm = new LlmService();
  private readonly _editorCollector: EditorContextCollector;
  private readonly _scaffoldBuilder = new ScaffoldContextBuilder();

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._editorCollector = new EditorContextCollector(ExtensionConfig.getMaxFileLines());
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
          this._postStatus('준비됨');
          break;
        case 'sendMessage':
          await this._handleMessage(msg.text);
          break;
        case 'clearHistory':
          this._history = [];
          break;
      }
    });
  }

  clearHistory(): void {
    this._history = [];
  }

  private async _handleMessage(text: string): Promise<void> {
    if (!this._view) return;

    // 진행 중인 요청 취소
    this._abortController?.abort();
    this._abortController = new AbortController();

    this._history.push({ role: 'user', content: text });

    const editorCtx = this._editorCollector.collect();
    const systemPrompt = this._scaffoldBuilder.buildSystemPrompt(editorCtx);
    const config = ExtensionConfig.getLlmConfig();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this._history,
    ];

    this._postStatus(`${config.model} 응답 중…`);

    try {
      let fullResponse = '';

      for await (const token of this._llm.streamChat(messages, config, this._abortController.signal)) {
        fullResponse += token;
        this._post({ type: 'token', content: token });
      }

      this._history.push({ role: 'assistant', content: fullResponse });
      this._post({ type: 'done' });
      this._postStatus(config.model);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      this._post({ type: 'error', message: msg });
      this._postStatus('오류 발생');
    }
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
    const nonce = Array.from(
      { length: 32 },
      () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
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
             style-src ${webview.cspSource} 'unsafe-inline';" />
  <title>Axiom AI</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
