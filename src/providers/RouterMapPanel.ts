/**
 * RouterMapPanel — 라우터 맵 (계획서 §7 B4).
 *
 * B1(부품)·B3(색)에 이어 **화면과 주소**를 보여주는 창. 자료는 열려 있는 프로젝트의 라우터 파일이라,
 * 라우트를 고치고 저장하면 이 창도 따라 바뀐다(B3와 같은 규약).
 *
 * 조립은 순수 모듈(`ai/router/RouterMap`)이 하고, 여기는 파일 읽기와 편집기 연동(정의 열기·복사)만 맡는다.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { isRouterDocument, loadRouterMap, openWorkspaceFile } from './RouterSource';
import type { HostToWebviewMessage, RouterMapPayload, WebviewToHostMessage } from '../types/messages';

export class RouterMapPanel {
  public static readonly viewType = 'axiom-ai.routerMapPanel';
  private static _current: RouterMapPanel | undefined;

  /** `focusPath`(예: `/example/blank-page`)를 주면 그 줄을 골라 둔 채 연다 — hover 딥링크가 쓴다. */
  static createOrShow(extensionUri: vscode.Uri, focusPath?: string): void {
    if (RouterMapPanel._current) {
      RouterMapPanel._current._panel.reveal();
      RouterMapPanel._current._postMap(focusPath);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      RouterMapPanel.viewType,
      '라우터 맵',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    RouterMapPanel._current = new RouterMapPanel(panel, extensionUri, focusPath);
  }

  private _pendingFocus: string | null = null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    focusPath?: string,
  ) {
    this._pendingFocus = focusPath ?? null;
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      RouterMapPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    // 라우트나 페이지 파일을 저장하면 맵이 달라진다 — 새로고침을 사람이 누르게 하지 않는다.
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (isRouterDocument(doc)) this._postMap();
      }),
      // 페이지 파일이 생기거나 지워지면 고아 목록이 바뀐다.
      vscode.workspace.onDidCreateFiles(() => this._postMap()),
      vscode.workspace.onDidDeleteFiles(() => this._postMap()),
    );

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'routerMapLoad':
          this._postMap();
          break;
        case 'routerMapCopy':
          await vscode.env.clipboard.writeText(msg.text);
          this._notice(`복사했습니다 — ${msg.text}`, 'info');
          break;
        case 'routerMapOpen':
          await openWorkspaceFile(msg.file, msg.line);
          break;
      }
    });
  }

  private _postMap(focusPath?: string): void {
    const source = loadRouterMap();
    const focus = focusPath ?? this._pendingFocus;
    this._pendingFocus = null;

    const payload: RouterMapPayload = {
      routes: source.map.routes,
      screens: source.map.screens,
      issues: source.map.issues,
      counts: source.map.counts,
      entry: source.map.entry,
      files: source.map.files,
      root: source.root ? path.basename(source.root) : null,
      empty: source.empty,
      focusPath: focus && source.map.screens.some((s) => s.fullPath === focus) ? focus : null,
    };
    this._post({ type: 'routerMap', payload });
  }

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'routerMapNotice', message, severity });
  }

  private _post(msg: HostToWebviewMessage): void {
    void this._panel.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));
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
  <title>라우터 맵</title>
</head>
<body data-mode="router-map">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
