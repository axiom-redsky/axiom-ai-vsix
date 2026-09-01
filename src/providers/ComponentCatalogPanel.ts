/**
 * ComponentCatalogPanel — 컴포넌트 카탈로그 패널 (계획서 §7 B1).
 *
 * "데이터는 전부 있고 UI만 없다"가 이 트랙의 전제였다. 이 패널은 **새 지식을 만들지 않는다** —
 * 이미 있는 세 자료를 한 창에 모아 사람이 훑어볼 수 있게만 한다:
 *   ① `componentPropsIndex`(자동생성) — 지금까지 모델 프롬프트에만 주입되던 prop 표
 *   ② `media/guide-docs/components/ui/*.md` — 스크린샷 있는 가이드(딥링크로 GuidePanel에 위임)
 *   ③ `knowledge/components/*.md` — 오프라인 지식 문서의 코드 예제
 *
 * 조립·검색은 순수 모듈(`ai/catalog/ComponentCatalog`)이 하고, 이 클래스는 **파일 읽기와
 * 에디터 연동**(복사·소스 열기·가이드 딥링크)만 맡는다. 검색은 웹뷰가 같은 순수 함수로
 * 직접 돌린다 — 타이핑마다 호스트를 왕복하면 훑어보는 흐름이 끊긴다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildSnippet, type ICatalogEntry } from '../ai/catalog/ComponentCatalog';
import { buildComponentInsert, computeMinimalEdit } from '../ai/catalog/ComponentInsert';
import { COMPONENT_PROPS_INDEX } from '../ai/contracts/generated/componentPropsIndex';
import { loadComponentCatalog } from './CatalogSource';
import type {
  ComponentCatalogPayload, ComponentCatalogTarget, HostToWebviewMessage, WebviewToHostMessage,
} from '../types/messages';

export class ComponentCatalogPanel {
  public static readonly viewType = 'axiom-ai.componentCatalogPanel';
  private static _current: ComponentCatalogPanel | undefined;

  /**
   * `focusEntryId`를 주면 그 부품을 펼친 상태로 연다 — hover(B2)의 "🧩 카탈로그에서 열기"가 쓰는
   * 딥링크다. 목록만 열어 놓고 사용자가 다시 찾게 하면 hover에서 넘어온 맥락이 끊긴다.
   */
  static createOrShow(extensionUri: vscode.Uri, focusEntryId?: string): void {
    if (ComponentCatalogPanel._current) {
      ComponentCatalogPanel._current._panel.reveal();
      ComponentCatalogPanel._current._postCatalog(focusEntryId);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ComponentCatalogPanel.viewType,
      '컴포넌트 카탈로그',
      // 옆 칸에 연다 — 삽입(A4)은 "코드를 보면서 부품을 고르는" 흐름이라, 카탈로그가 편집기를
      // 덮어버리면 커서가 어디 있는지 볼 수 없다.
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    ComponentCatalogPanel._current = new ComponentCatalogPanel(panel, extensionUri, focusEntryId);
  }

  private _entries: ICatalogEntry[] | null = null;
  private _knowledgeDir: string | null = null;
  /** hover 딥링크로 열렸을 때 펼쳐 보일 부품 id(웹뷰가 목록을 요청하면 함께 보낸다). */
  private _pendingFocus: string | null = null;
  /**
   * 삽입 대상 = **마지막으로 보고 있던 코드 편집기**.
   *
   * 이 패널 자체가 탭이라, 패널에 포커스가 가면 `activeTextEditor`는 비어 버린다(A3·채팅에서 이미
   * 겪은 함정). 그래서 편집기 전환·커서 이동을 구독해 **직접 기억한다** — 버튼이 "어디에 넣을지"를
   * 정확히 말할 수 있어야 사용자가 누르기 전에 확인할 수 있다.
   */
  private _target: { uri: vscode.Uri; rel: string; anchor: string; line: number; hasSelection: boolean } | null = null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    focusEntryId?: string,
  ) {
    // 웹뷰는 뜬 다음에야 목록을 요청한다 — 그때까지 딥링크 대상을 들고 있는다.
    this._pendingFocus = focusEntryId ?? null;
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      ComponentCatalogPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    // 대상 추적 — 편집기를 바꾸거나 커서를 옮기면 버튼 문구가 따라간다.
    this._captureTarget(vscode.window.activeTextEditor);
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (this._captureTarget(e)) this._postTarget();
      }),
    );
    let cursorTimer: ReturnType<typeof setTimeout> | undefined;
    this._disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (cursorTimer) clearTimeout(cursorTimer);
        cursorTimer = setTimeout(() => {
          if (this._captureTarget(e.textEditor)) this._postTarget();
        }, 200);
      }),
    );

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'componentCatalogLoad':
          this._entries = null; // 새로고침은 문서를 다시 읽는다(가이드를 편집했을 수 있다)
          this._postCatalog();
          break;
        case 'componentCatalogCopy':
          await vscode.env.clipboard.writeText(msg.text);
          this._notice(`복사했습니다 — ${msg.label}`, 'info');
          break;
        case 'componentCatalogOpenGuide':
          // 문서 렌더는 가이드 패널이 이미 잘 한다(이미지·TOC 포함). 두 벌 만들지 않는다.
          await vscode.commands.executeCommand('axiom-ai.openGuide', msg.docId);
          break;
        case 'componentCatalogOpenSource':
          await this._openSource(msg.source);
          break;
        case 'componentCatalogOpenKnowledge':
          await this._openKnowledge(msg.source);
          break;
        case 'componentCatalogInsert':
          await this._insert(msg.entryId, msg.values);
          break;
      }
    });
  }

  // ── 목록 ────────────────────────────────────────────────────────────────────

  private _postCatalog(focusEntryId?: string): void {
    // 자료 읽기는 hover(B2)와 **같은 모듈**을 쓴다 — 출처가 갈라지면 "패널엔 있는데 hover엔 없는" 부품이 생긴다.
    const source = loadComponentCatalog(this._extensionUri);
    this._knowledgeDir = source.knowledgeDir;
    if (!this._entries) this._entries = source.entries;
    const entries = this._entries;

    const focus = focusEntryId ?? this._pendingFocus;
    this._pendingFocus = null;

    const payload: ComponentCatalogPayload = {
      entries,
      counts: {
        entries: entries.length,
        components: Object.keys(COMPONENT_PROPS_INDEX).length,
        props: entries.reduce((n, e) => n + e.propCount, 0),
        guideDocs: source.guideDocs.length,
        knowledgeDocs: source.knowledgeDocs.length,
      },
      scaffoldDetected: this._detectScaffold(),
      knowledgeDir: this._knowledgeDir ? this._displayPath(this._knowledgeDir) : null,
      target: this._targetView(),
      // 있는 부품일 때만 — 없는 id를 보내면 웹뷰가 빈 상세를 띄운다.
      focusEntryId: focus && entries.some((e) => e.id === focus) ? focus : null,
    };
    this._post({ type: 'componentCatalog', payload });
  }

  // ── 삽입 대상(A4) ───────────────────────────────────────────────────────────

  /** 코드 편집기면 대상으로 기억한다. 바뀐 게 있으면 true(그때만 웹뷰에 알린다). */
  private _captureTarget(editor: vscode.TextEditor | undefined): boolean {
    if (!editor || editor.document.uri.scheme !== 'file') return false;
    // JSX를 넣는 것이라 대상은 .tsx/.jsx — 카탈로그를 열어 둔 채 .md·.json을 봐도 대상은 유지된다.
    if (!/\.(tsx|jsx)$/i.test(editor.document.uri.fsPath)) return false;

    const sel = editor.selection;
    const anchor = sel.isEmpty
      ? `line:${sel.active.line + 1}`
      : `sel:${sel.start.line + 1}-${sel.end.line + 1}`;
    const prev = this._target;
    this._target = {
      uri: editor.document.uri,
      rel: vscode.workspace.asRelativePath(editor.document.uri),
      anchor,
      line: sel.active.line + 1,
      hasSelection: !sel.isEmpty,
    };
    return !prev || prev.anchor !== anchor || prev.uri.fsPath !== this._target.uri.fsPath;
  }

  private _targetView(): ComponentCatalogTarget | null {
    const t = this._target;
    if (!t) return null;
    return { file: t.rel, line: t.line, hasSelection: t.hasSelection };
  }

  private _postTarget(): void {
    this._post({ type: 'componentCatalogTarget', target: this._targetView() });
  }

  /**
   * 고른 부품을 편집기에 넣는다 — 삽입 규칙은 레시피 실행기(A3)를 그대로 쓴다(§7 A4).
   *
   * 편집기 **버퍼**를 원문으로 쓰고 결과도 버퍼에 적용한다(디스크가 아니라): 저장 안 한 편집이
   * 있어도 덮어쓰지 않고, Ctrl+Z 한 번으로 되돌릴 수 있어야 하기 때문이다.
   */
  private async _insert(entryId: string, values: Record<string, string>): Promise<void> {
    const entry = (this._entries ?? []).find((e) => e.id === entryId);
    if (!entry?.snippet) {
      this._notice('이 부품에는 넣을 스니펫이 없습니다.', 'error');
      return;
    }
    // 폼 값이 반영된 스니펫 — **패널 미리보기와 같은 함수**를 부른다(보이는 것 = 넣는 것).
    const snippet = buildSnippet(entry, values) ?? entry.snippet;
    const target = this._target;
    if (!target) {
      this._notice('넣을 파일을 찾지 못했습니다. .tsx 파일을 열고 넣을 자리에 커서를 두세요.', 'error');
      return;
    }
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(target.uri);
    } catch {
      this._notice(`대상 파일을 열지 못했습니다: ${target.rel}`, 'error');
      return;
    }

    const source = doc.getText();
    const result = buildComponentInsert({
      source,
      snippet,
      targetFile: target.rel,
      cursorAnchor: target.anchor,
    });
    if (result.blocked || !result.text) {
      this._notice(result.blocked ?? '삽입 결과를 만들지 못했습니다.', 'error');
      return;
    }
    const edit = computeMinimalEdit(source, result.text);
    if (!edit) {
      // 멱등 — A3의 중복 삽입 방지가 "이미 있다"고 판단한 경우다. 조용히 넘기지 않고 말해 준다.
      this._notice(`${entry.name}은(는) 이미 ${target.rel} 안에 있습니다(중복 삽입 안 함).`, 'info');
      return;
    }

    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    const range = doc.validateRange(
      new vscode.Range(new vscode.Position(edit.startLine, 0), new vscode.Position(edit.endLine, 0)),
    );
    const okEdit = await editor.edit((b) => b.replace(range, edit.text));
    if (!okEdit) {
      this._notice('편집기에 적용하지 못했습니다(다른 편집과 충돌).', 'error');
      return;
    }
    // 넣은 자리를 보여준다 — 어디에 들어갔는지 눈으로 확인하고 필요하면 바로 Ctrl+Z.
    const shown = new vscode.Position(edit.startLine, 0);
    editor.selection = new vscode.Selection(shown, shown);
    editor.revealRange(new vscode.Range(shown, shown), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    const where = result.anchorLabel ?? `${target.line}줄`;
    this._notice(
      `${entry.name}을(를) ${target.rel}에 넣었습니다 — ${where}. 되돌리려면 편집기에서 Ctrl+Z.`
      + (result.summary.length > 0 ? ` (${result.summary.join(' · ')})` : ''),
      'info',
    );
  }

  // ── 에디터 연동 ─────────────────────────────────────────────────────────────

  /** props 인덱스의 `source`는 **scaffold 워크스페이스 기준** 상대경로다(추적용). */
  private async _openSource(source: string): Promise<void> {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) {
      this._notice('워크스페이스가 없어 소스를 열 수 없습니다.', 'error');
      return;
    }
    const abs = path.join(wsRoot, source);
    if (!fs.existsSync(abs)) {
      this._notice(`이 워크스페이스에는 없는 경로입니다: ${source} (scaffold 프로젝트를 연 상태에서 열어보세요)`, 'error');
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  private async _openKnowledge(source: string): Promise<void> {
    const dir = this._knowledgeDir;
    const abs = dir ? path.join(dir, path.basename(source)) : null;
    if (!abs || !fs.existsSync(abs)) {
      this._notice(`지식 문서를 찾을 수 없습니다: ${source}`, 'error');
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  private _detectScaffold(): boolean {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return !!root && fs.existsSync(path.join(root, 'src', 'domains'));
  }

  private _displayPath(abs: string): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const rel = path.relative(root, abs);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
    }
    const parts = abs.replace(/\\/g, '/').split('/');
    return parts.length <= 2 ? abs.replace(/\\/g, '/') : `…/${parts.slice(-2).join('/')}`;
  }

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'componentCatalogNotice', message, severity });
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
  <title>컴포넌트 카탈로그</title>
</head>
<body data-mode="component-catalog">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
