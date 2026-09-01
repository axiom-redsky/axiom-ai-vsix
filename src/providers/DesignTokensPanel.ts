/**
 * DesignTokensPanel — 디자인 토큰 브라우저 (계획서 §7 B3).
 *
 * 컴포넌트 카탈로그(B1)와 같은 성격의 창이다: **새 지식을 만들지 않고**, 이미 워크스페이스에 있는
 * CSS를 사람이 볼 수 있는 형태로 정리해 보여준다. 다른 점은 자료가 확장 번들이 아니라
 * **열려 있는 프로젝트의 스타일 파일**이라는 것 — 그래서 퍼블리셔가 색을 바꾸면 여기도 바뀐다.
 *
 * 조립·검색은 순수 모듈(`ai/tokens/DesignTokens`)이 하고, 이 클래스는 파일 읽기와 편집기 연동
 * (복사·정의 열기·커서에 삽입)만 맡는다. 검색은 웹뷰가 같은 순수 함수로 직접 돌린다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { loadDesignTokens, isStyleDocument } from './TokenSource';
import type { DesignTokensPayload, HostToWebviewMessage, WebviewToHostMessage } from '../types/messages';

export class DesignTokensPanel {
  public static readonly viewType = 'axiom-ai.designTokensPanel';
  private static _current: DesignTokensPanel | undefined;

  /** `focusToken`(예: `--color-primary`)을 주면 그 토큰을 골라 둔 채로 연다 — hover 딥링크가 쓴다. */
  static createOrShow(extensionUri: vscode.Uri, focusToken?: string): void {
    if (DesignTokensPanel._current) {
      DesignTokensPanel._current._panel.reveal();
      DesignTokensPanel._current._postTokens(focusToken);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DesignTokensPanel.viewType,
      '디자인 토큰',
      // 카탈로그와 같은 이유로 옆 칸 — 스타일을 보면서 값을 확인하는 흐름이다.
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    DesignTokensPanel._current = new DesignTokensPanel(panel, extensionUri, focusToken);
  }

  /**
   * 토큰이 선언된 그 줄을 연다 — 패널이 떠 있지 않아도 되게 **정적**이다.
   * (hover 카드의 "📄 정의 열기"는 브라우저를 열지 않고 코드로 바로 가고 싶은 흐름이다.)
   */
  static async openDefinitionAt(file: string, line: number): Promise<void> {
    const root = loadDesignTokens().stylesRoot;
    if (!root) {
      vscode.window.showWarningMessage('디자인 토큰 파일을 찾지 못했습니다(scaffold 워크스페이스를 열어 주세요).');
      return;
    }
    // 경로는 스타일 루트 기준 상대경로(파싱할 때 붙인 그 경로)다 — 루트 밖으로 나가는 값은 거부한다.
    const abs = path.resolve(root, file);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs)) {
      vscode.window.showWarningMessage(`토큰 정의 파일을 열 수 없습니다: ${file}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const at = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(at, at);
    editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
  }

  private _pendingFocus: string | null = null;
  private _stylesRoot: string | null = null;
  /**
   * 삽입 대상 = **마지막으로 보고 있던 코드 편집기**. 이 패널도 탭이라 포커스가 오면
   * `activeTextEditor`가 비어 버린다(A4에서 이미 겪은 함정) — 그래서 직접 기억한다.
   */
  private _target: vscode.Uri | null = null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    focusToken?: string,
  ) {
    this._pendingFocus = focusToken ?? null;
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      DesignTokensPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    // 스타일 파일을 저장하면 값이 바뀐 것이다 — 새로고침을 사람이 누르게 하지 않는다.
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (isStyleDocument(doc)) this._postTokens();
      }),
    );

    // 삽입 대상 추적 — 버튼이 누르기 전에 "어디에 넣을지"를 말할 수 있어야 한다.
    this._captureTarget(vscode.window.activeTextEditor);
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (this._captureTarget(e)) this._post({ type: 'designTokensTarget', target: this._targetLabel() });
      }),
    );

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'designTokensLoad':
          this._postTokens();
          break;
        case 'designTokensCopy':
          await vscode.env.clipboard.writeText(msg.text);
          this._notice(`복사했습니다 — ${msg.text}`, 'info');
          break;
        case 'designTokensOpenDefinition':
          await DesignTokensPanel.openDefinitionAt(msg.file, msg.line);
          break;
        case 'designTokensInsert':
          await this._insertAtCursor(msg.text);
          break;
      }
    });
  }

  // ── 목록 ────────────────────────────────────────────────────────────────────

  private _postTokens(focusToken?: string): void {
    const source = loadDesignTokens();
    this._stylesRoot = source.stylesRoot;
    const focus = focusToken ?? this._pendingFocus;
    this._pendingFocus = null;

    const payload: DesignTokensPayload = {
      tokens: source.set.tokens,
      counts: source.set.counts,
      files: source.set.files,
      stylesRoot: source.stylesRoot ? this._displayPath(source.stylesRoot) : null,
      followedEntry: source.followedEntry,
      missing: source.missing,
      target: this._targetLabel(),
      focusToken: focus && source.set.tokens.some((t) => t.name === focus) ? focus : null,
    };
    this._post({ type: 'designTokens', payload });
  }

  // ── 편집기 연동 ─────────────────────────────────────────────────────────────

  /** 코드 편집기면 대상으로 기억한다(바뀌었으면 true). */
  private _captureTarget(editor: vscode.TextEditor | undefined): boolean {
    if (!editor || editor.document.uri.scheme !== 'file') return false;
    const prev = this._target?.fsPath;
    this._target = editor.document.uri;
    return prev !== this._target.fsPath;
  }

  private _targetLabel(): string | null {
    return this._target ? vscode.workspace.asRelativePath(this._target) : null;
  }

  /**
   * 고른 토큰을 **기억해 둔 편집기의 커서 자리**에 넣는다(`var(--color-primary)` 한 조각).
   * 커서 위치는 넣는 시점에 다시 읽는다 — 패널을 띄워 둔 채 자리를 옮겼을 수 있다.
   */
  private async _insertAtCursor(text: string): Promise<void> {
    const uri = this._target;
    if (!uri) {
      this._notice('넣을 파일을 찾지 못했습니다. 파일을 열고 넣을 자리에 커서를 두세요.', 'error');
      return;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
    const ok = await editor.edit((b) => {
      for (const sel of editor.selections) b.replace(sel, text);
    });
    this._notice(
      ok ? `${text} 를 ${vscode.workspace.asRelativePath(uri)} 에 넣었습니다(Ctrl+Z로 취소).`
        : '편집기에 넣지 못했습니다(다른 편집과 충돌).',
      ok ? 'info' : 'error',
    );
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  private _displayPath(abs: string): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const rel = path.relative(root, abs);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
    }
    return abs.replace(/\\/g, '/');
  }

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'designTokensNotice', message, severity });
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
  <title>디자인 토큰</title>
</head>
<body data-mode="design-tokens">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
