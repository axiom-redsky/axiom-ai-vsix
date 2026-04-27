import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { WebviewToHostMessage, HostToWebviewMessage, AxiomSettings } from '../types/messages';

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
          vscode.commands.executeCommand('axiom-ai.openChat');
          break;
        case 'clearHistory':
          vscode.commands.executeCommand('axiom-ai.clearHistory');
          break;
        case 'getSettings':
          this._handleGetSettings();
          break;
        case 'updateSettings':
          await this._handleUpdateSettings(msg.settings);
          break;
        case 'pickRagFile':
          await this._handlePickRagFile();
          break;
        case 'pickRagFolder':
          await this._handlePickRagFolder();
          break;
        case 'removeRagFile':
          await this._handleRemoveRagFile(msg.filePath);
          break;
        case 'clearRagFolder':
          await this._handleClearRagFolder();
          break;
      }
    });
  }

  clearHistory(): void {}

  // ─── Settings 핸들러 ────────────────────────────────────────────

  private _handleGetSettings(): void {
    const llm = ExtensionConfig.getLlmConfig();
    const rag = ExtensionConfig.getUserRagSources();
    const settings: AxiomSettings = {
      llm: {
        endpoint:    llm.endpoint,
        model:       llm.model,
        apiKey:      llm.apiKey,
        temperature: llm.temperature,
        maxTokens:   llm.maxTokens,
      },
      rag: {
        userRagFolder:   rag.folder,
        additionalFiles: rag.files,
      },
    };
    this._post({ type: 'settingsLoaded', settings });
  }

  private async _handleUpdateSettings(partial: Partial<AxiomSettings>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');

    if (partial.llm) {
      const llm = partial.llm;
      if (llm.endpoint   !== undefined) await cfg.update('llm.endpoint',    llm.endpoint,    vscode.ConfigurationTarget.Global);
      if (llm.model      !== undefined) await cfg.update('llm.model',       llm.model,       vscode.ConfigurationTarget.Global);
      if (llm.apiKey     !== undefined) await cfg.update('llm.apiKey',      llm.apiKey,      vscode.ConfigurationTarget.Global);
      if (llm.temperature !== undefined) await cfg.update('llm.temperature', llm.temperature, vscode.ConfigurationTarget.Global);
      if (llm.maxTokens  !== undefined) await cfg.update('llm.maxTokens',   llm.maxTokens,   vscode.ConfigurationTarget.Global);
    }

    if (partial.rag) {
      const rag = partial.rag;
      if (rag.userRagFolder   !== undefined) await cfg.update('rag.userRagFolder',  rag.userRagFolder,   vscode.ConfigurationTarget.Global);
      if (rag.additionalFiles !== undefined) await cfg.update('rag.additionalFiles', rag.additionalFiles, vscode.ConfigurationTarget.Global);
    }

    // 저장 후 최신값을 웹뷰에 다시 전송
    this._handleGetSettings();

    // 상태 배지 모델명 업데이트
    this._postStatus(ExtensionConfig.getLlmConfig().model);
  }

  private async _handlePickRagFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: false,
      filters: { 'Markdown 파일': ['md'] },
      title: 'RAG 지식 파일 선택',
    });
    if (!uris || uris.length === 0) return;

    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<string[]>('rag.additionalFiles', []);
    const toAdd = uris.map((u) => u.fsPath).filter((p) => !current.includes(p));
    if (toAdd.length === 0) return;

    await cfg.update('rag.additionalFiles', [...current, ...toAdd], vscode.ConfigurationTarget.Global);

    for (const p of toAdd) {
      this._post({ type: 'ragFileAdded', filePath: p });
    }
  }

  private async _handlePickRagFolder(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: true,
      canSelectFiles: false,
      title: 'RAG 지식 폴더 선택',
    });
    if (!uris || uris.length === 0) return;

    const folderPath = uris[0].fsPath;
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    await cfg.update('rag.userRagFolder', folderPath, vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFolderSet', folderPath });
  }

  private async _handleRemoveRagFile(filePath: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<string[]>('rag.additionalFiles', []);
    const updated = current.filter((p) => p !== filePath);
    await cfg.update('rag.additionalFiles', updated, vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFileRemoved', filePath });
  }

  private async _handleClearRagFolder(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    await cfg.update('rag.userRagFolder', '', vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFolderSet', folderPath: '' });
  }

  // ─── 내부 유틸 ──────────────────────────────────────────────────

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
