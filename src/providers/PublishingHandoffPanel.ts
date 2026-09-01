/**
 * PublishingHandoffPanel — 퍼블리싱 핸드오프 (계획서 §7 D1).
 *
 * 지금까지의 창(B1·B3·B4)은 **읽기 전용**이었다. 이건 **파일을 쓴다** — 그래서 계획 카드의 안전 규약을
 * 그대로 따른다(§3.6): ① 무엇이 생기고 무엇이 고쳐지는지 **먼저 다 보여주고** ② 사람이 누를 때만
 * 적용하고 ③ 원본은 **건드리지 않는다**(복사).
 *
 * 계산은 순수 모듈(`ai/publishing/PublishingHandoff`)이 하고, 여기는 파일 읽기·쓰기만 맡는다.
 * 쓰기는 `WorkspaceEdit` 한 번으로 묶어 **Ctrl+Z 한 번에 되돌아가게** 한다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  planPublishingHandoff, publishingDomains, type IHandoffPlan, type IWorkspaceFile,
} from '../ai/publishing/PublishingHandoff';
import { findScaffoldRoot, openWorkspaceFile } from './RouterSource';
import type { HandoffPayload, HostToWebviewMessage, WebviewToHostMessage } from '../types/messages';

export class PublishingHandoffPanel {
  public static readonly viewType = 'axiom-ai.publishingHandoffPanel';
  private static _current: PublishingHandoffPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (PublishingHandoffPanel._current) {
      PublishingHandoffPanel._current._panel.reveal();
      PublishingHandoffPanel._current._postPlan();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PublishingHandoffPanel.viewType,
      '퍼블리싱 포팅',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    PublishingHandoffPanel._current = new PublishingHandoffPanel(panel, extensionUri);
  }

  /** 지금 고른 도메인. null이면 첫 번째. */
  private _domain: string | null = null;
  /** 고른 페이지들(비면 전부). */
  private _pages: string[] = [];
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      PublishingHandoffPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    // 퍼블리셔가 파일을 고치거나 추가하면 계획이 달라진다.
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.fsPath.replace(/\\/g, '/').includes('/src/publishing/')) this._postPlan();
      }),
    );

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'handoffLoad':
          this._postPlan();
          break;
        case 'handoffSelect':
          this._domain = msg.domain;
          this._pages = msg.pages;
          this._postPlan();
          break;
        case 'handoffOpen':
          await openWorkspaceFile(msg.file, msg.line);
          break;
        case 'handoffApply':
          await this._apply();
          break;
      }
    });
  }

  // ── 계획 ────────────────────────────────────────────────────────────────────

  /** 워크스페이스에서 읽어 계획을 만든다(파일은 안 건드린다). */
  private _buildPlan(): { plan: IHandoffPlan | null; domains: string[]; pages: string[]; root: string | null } {
    const root = findScaffoldRoot();
    if (!root) return { plan: null, domains: [], pages: [], root: null };

    const pubRoot = path.join(root, 'src', 'publishing');
    const all = walk(pubRoot, root);
    const domains = publishingDomains(all);
    if (domains.length === 0) return { plan: null, domains, pages: [], root };

    const domain = this._domain && domains.includes(this._domain) ? this._domain : domains[0];
    const publishingFiles: IWorkspaceFile[] = all
      .filter((p) => p.startsWith(`src/publishing/${domain}/`) && /\.[jt]sx?$/.test(p))
      .map((p) => ({ path: p, text: readOr(path.join(root, p)) }))
      .filter((f) => f.text !== null) as IWorkspaceFile[];

    const pages = publishingFiles
      .filter((f) => /\/pages\/.+\.[jt]sx$/.test(f.path) && !/\.stories\./.test(f.path))
      .map((f) => f.path.split('/').pop()?.replace(/\.[jt]sx$/, '') ?? '')
      .filter(Boolean)
      .sort();

    const existingPaths = walk(path.join(root, 'src', 'domains', domain), root);
    const domainRouter = path.join(root, 'src', 'domains', domain, 'router', 'index.tsx');
    const rootRouter = path.join(root, 'src', 'shared', 'router', 'index.tsx');

    const plan = planPublishingHandoff({
      domain,
      publishingFiles,
      existingPaths,
      domainRouterText: readOr(domainRouter),
      rootRouterText: readOr(rootRouter),
      onlyPages: this._pages.filter((p) => pages.includes(p)),
    });
    return { plan, domains, pages, root };
  }

  private _postPlan(): void {
    const { plan, domains, pages, root } = this._buildPlan();
    const payload: HandoffPayload = {
      domains,
      domain: plan?.domain ?? this._domain ?? domains[0] ?? null,
      pages,
      selectedPages: this._pages,
      moves: plan?.moves.map((m) => ({ from: m.from, to: m.to, kind: m.kind, conflict: m.conflict })) ?? [],
      updates: plan?.updates.map((u) => ({ path: u.path, create: u.create, note: u.note })) ?? [],
      routes: plan?.routes.map((r) => ({ component: r.component, path: r.path, name: r.name })) ?? [],
      notices: plan?.notices ?? [],
      blocked: plan?.blocked ?? (root === null
        ? 'scaffold 워크스페이스를 찾지 못했습니다(`src/domains`가 있는 폴더를 여세요).'
        : domains.length === 0 ? '`src/publishing/` 아래에 퍼블리셔 산출물이 없습니다.' : null),
    };
    this._post({ type: 'handoff', payload });
  }

  // ── 적용 ────────────────────────────────────────────────────────────────────

  /**
   * 계획대로 파일을 만들고 라우터를 고친다.
   *
   * ★ 계획을 **다시 계산해서** 적용한다 — 화면에 떠 있는 계획은 오래됐을 수 있고(그 사이 파일이
   * 바뀌었을 수 있다), 보이는 것과 적용되는 것이 갈라지면 미리보기가 검증 게이트 역할을 못 한다.
   * 쓰기는 `WorkspaceEdit` 한 번으로 묶어 되돌리기도 한 번이다.
   */
  private async _apply(): Promise<void> {
    const { plan, root } = this._buildPlan();
    if (!plan || !root) {
      this._notice('적용할 계획이 없습니다.', 'error');
      return;
    }
    if (plan.blocked) {
      this._notice(plan.blocked, 'error');
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const created: string[] = [];
    const updated: string[] = [];

    for (const move of plan.moves) {
      if (move.conflict) continue;
      const uri = vscode.Uri.file(path.join(root, move.to));
      edit.createFile(uri, { ignoreIfExists: false, overwrite: false });
      edit.insert(uri, new vscode.Position(0, 0), move.text);
      created.push(move.to);
    }

    for (const update of plan.updates) {
      const abs = path.join(root, update.path);
      const uri = vscode.Uri.file(abs);
      if (update.create) {
        edit.createFile(uri, { ignoreIfExists: false, overwrite: false });
        edit.insert(uri, new vscode.Position(0, 0), update.text);
        created.push(update.path);
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);
        edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), update.text);
        updated.push(update.path);
      }
    }

    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      this._notice('적용하지 못했습니다(파일이 이미 있거나 다른 편집과 충돌).', 'error');
      return;
    }
    // 저장까지 해 준다 — 적용해 놓고 저장을 잊으면 라우터가 반쯤 적용된 상태로 보인다.
    await vscode.workspace.saveAll(false);

    this._notice(
      `옮겼습니다 — 새 파일 ${created.length}개 · 고친 파일 ${updated.length}개. `
      + '되돌리려면 편집기에서 Ctrl+Z. 원본 `src/publishing/`은 그대로 있습니다.',
      'info',
    );
    this._postPlan();

    // 라우트가 실제로 걸렸는지는 라우터 맵이 답한다 — 바로 확인할 길을 열어 준다.
    const openMap = await vscode.window.showInformationMessage(
      `퍼블리싱 포팅 완료 — 새 파일 ${created.length}개, 고친 파일 ${updated.length}개.`,
      '라우터 맵에서 확인',
    );
    if (openMap) await vscode.commands.executeCommand('axiom-ai.openRouterMap');
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'handoffNotice', message, severity });
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
  <title>퍼블리싱 포팅</title>
</head>
<body data-mode="publishing-handoff">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** 디렉터리를 훑어 워크스페이스 기준 상대경로 목록으로. 없으면 빈 배열. */
function walk(dir: string, root: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, root, out);
    else out.push(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

function readOr(abs: string): string | null {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}
