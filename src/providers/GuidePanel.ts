import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../types/messages';
import type { ITocManifest, TGuideSource } from '../types/guide';
import { buildUncategorizedSidebar, parseFrontmatter, UNCATEGORIZED_SIDEBAR_ID } from '../guide/guideUtils';
import { createDoc, listAllDocIds, reseed, seedIfMissing } from '../guide/GuideStore';
import { ExtensionConfig } from '../config/ExtensionConfig';

/**
 * 내장 개발 가이드 뷰어 — 에디터 중앙 탭(WebviewPanel).
 *
 * 문서 저장소는 2계층: 번들 스냅샷(media/guide-docs, 읽기전용) → 워크스페이스 <axiomDir>/guide
 * (최초 오픈 시 시드 복사, 이후 편집·신규 등록·git 팀공유의 진실원). 렌더는 웹뷰(GuideApp)가 하고
 * 호스트는 fs 읽기 + 이미지 루트(asWebviewUri)만 제공한다.
 *
 * 딥링크 계약: `vscode.commands.executeCommand('axiom-ai.openGuide', docId)` — docId는 가이드 루트
 * 기준 확장자 없는 상대경로(예: 'apis/global-function/hooks/use-api'). 오프라인 추천카드의
 * doc 액션 등 외부 진입점은 이 명령만 호출하면 된다.
 */
export class GuidePanel {
  public static readonly viewType = 'axiom-ai.guidePanel';
  private static _current: GuidePanel | undefined;

  static createOrShow(extensionUri: vscode.Uri, docId?: string): void {
    if (GuidePanel._current) {
      GuidePanel._current._panel.reveal();
      if (docId) GuidePanel._current._post({ type: 'guideNavigate', docId });
      return;
    }
    const bundledDir = vscode.Uri.joinPath(extensionUri, 'media', 'guide-docs').fsPath;
    const guideDir = GuidePanel._resolveGuideDir();

    // 최초 오픈 시드 — guideDir가 이미 있으면 GuideStore가 아무것도 하지 않는다(사용자 편집 보존).
    if (guideDir && seedIfMissing(bundledDir, guideDir)) {
      vscode.window.showInformationMessage(
        `Axiom AI: 개발 가이드를 ${GuidePanel._toDisplayPath(guideDir)} 로 복사했습니다. git 커밋으로 팀과 공유하세요.`,
      );
    }

    const roots = [vscode.Uri.joinPath(extensionUri, 'dist'), vscode.Uri.file(bundledDir)];
    if (guideDir) roots.push(vscode.Uri.file(guideDir));
    const panel = vscode.window.createWebviewPanel(
      GuidePanel.viewType,
      '개발 가이드',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: roots,
      },
    );
    GuidePanel._current = new GuidePanel(panel, extensionUri, bundledDir, guideDir, docId);
  }

  /** axiomFolder 설정 변경 대응 — localResourceRoots는 생성 시 고정이라 열린 패널을 재생성한다. */
  static handleAxiomFolderChange(extensionUri: vscode.Uri): void {
    const current = GuidePanel._current;
    if (!current) return;
    const docId = current._currentDocId ?? undefined;
    current._panel.dispose();
    GuidePanel.createOrShow(extensionUri, docId);
  }

  /** 재시드 복구 명령(axiom-ai.reseedGuide) — 누락 파일만 채우기 / 번들로 전체 원복(모달 확인). */
  static async reseedInteractive(extensionUri: vscode.Uri): Promise<void> {
    const guideDir = GuidePanel._resolveGuideDir();
    if (!guideDir) {
      vscode.window.showWarningMessage('Axiom AI: 워크스페이스가 없어 가이드를 시드할 수 없습니다.');
      return;
    }
    const bundledDir = vscode.Uri.joinPath(extensionUri, 'media', 'guide-docs').fsPath;
    const pick = await vscode.window.showQuickPick(
      [
        { label: '누락 파일만 복구', description: '삭제된 파일만 번들에서 채웁니다 (수정본 보존)', mode: 'missing-only' as const },
        { label: '전체 원복', description: '⚠ 모든 가이드 파일을 번들 상태로 덮어씁니다', mode: 'overwrite' as const },
      ],
      { placeHolder: '가이드 재시드 방식을 선택하세요' },
    );
    if (!pick) return;
    if (pick.mode === 'overwrite') {
      const ok = await vscode.window.showWarningMessage(
        `${GuidePanel._toDisplayPath(guideDir)} 의 가이드 편집 내용이 모두 번들 원본으로 덮어써집니다. 계속할까요?`,
        { modal: true },
        '전체 원복',
      );
      if (ok !== '전체 원복') return;
    }
    const copied = reseed(bundledDir, guideDir, pick.mode);
    vscode.window.showInformationMessage(`Axiom AI: 가이드 재시드 완료 — ${copied}개 파일 복사.`);
    GuidePanel._current?._sendToc();
  }

  /** sdd.axiomFolder(비면 .axiom 폴백) → <axiomDir>/guide 절대경로. 워크스페이스 없으면 null. */
  private static _resolveGuideDir(): string | null {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
    if (path.isAbsolute(axiomFolder)) return path.join(axiomFolder, 'guide');
    if (!wsRoot) return null;
    return path.join(wsRoot, axiomFolder, 'guide');
  }

  private static _toDisplayPath(p: string): string {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return p;
    const rel = path.relative(wsRoot, p);
    return rel.startsWith('..') ? p : rel.replace(/\\/g, '/');
  }

  private readonly _disposables: vscode.Disposable[] = [];
  private _currentDocId: string | null = null;
  private _reloadTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _bundledDir: string,
    private readonly _guideDir: string | null,
    private readonly _initialDocId?: string,
  ) {
    _panel.webview.html = this._buildHtml(_panel.webview);
    this._registerWatcher();
    _panel.onDidDispose(() => {
      GuidePanel._current = undefined;
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      for (const d of this._disposables) d.dispose();
    });
    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'guideReady':
          this._sendToc(this._initialDocId);
          break;
        case 'guideLoadDoc':
          this._sendDoc(msg.docId);
          break;
        case 'guideEditDoc':
          await this._editDoc(msg.docId);
          break;
        case 'guideCreateDoc':
          await this._createDoc();
          break;
        case 'guideOpenExternal':
          if (/^https?:\/\//i.test(msg.url)) vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    });
  }

  // ─── 저장소 ───────────────────────────────────────────────────────────────

  /** 활성 루트 — 시드된 워크스페이스 가이드가 있으면 그쪽, 없으면 번들 읽기전용. */
  private _activeRoot(): { root: string; source: TGuideSource } {
    if (this._guideDir && fs.existsSync(this._guideDir)) return { root: this._guideDir, source: 'workspace' };
    return { root: this._bundledDir, source: 'bundled' };
  }

  private _loadToc(root: string): ITocManifest {
    try {
      const raw = fs.readFileSync(path.join(root, '_toc.json'), 'utf8');
      const parsed = JSON.parse(raw) as ITocManifest;
      if (Array.isArray(parsed.sidebars)) return parsed;
    } catch {
      /* fall through — 스캔만으로 미분류 트리 구성 */
    }
    return { version: 1, sidebars: [] };
  }

  private _sendToc(initialDocId?: string): void {
    const { root, source } = this._activeRoot();
    const toc = this._loadToc(root);
    const allIds = listAllDocIds(root);
    const orphans = buildUncategorizedSidebar(allIds, toc);
    if (orphans) toc.sidebars.push(orphans);

    const titles: Record<string, string> = {};
    for (const id of allIds) {
      try {
        const head = fs.readFileSync(path.join(root, `${id}.md`), 'utf8').slice(0, 2000);
        const { meta } = parseFrontmatter(head);
        if (meta.title) titles[id] = meta.title;
      } catch {
        /* 제목 없으면 웹뷰가 docId 말단으로 표시 */
      }
    }
    const rootUri = this._panel.webview.asWebviewUri(vscode.Uri.file(root)).toString();
    this._post({ type: 'guideToc', toc, titles, source, rootUri, initialDocId });
  }

  private _sendDoc(docId: string): void {
    const { root } = this._activeRoot();
    const file = path.join(root, `${docId}.md`);
    if (!file.startsWith(root)) return; // 경로 탈출 방지
    try {
      this._currentDocId = docId;
      this._post({ type: 'guideDoc', docId, markdown: fs.readFileSync(file, 'utf8') });
    } catch {
      this._post({ type: 'guideError', message: `문서를 읽을 수 없습니다: ${docId}` });
    }
  }

  // ─── 편집·신규 등록 ────────────────────────────────────────────────────────

  private async _editDoc(docId: string): Promise<void> {
    const { root, source } = this._activeRoot();
    if (source === 'bundled') {
      vscode.window.showWarningMessage('Axiom AI: 워크스페이스가 없어 가이드를 편집할 수 없습니다 (번들 읽기전용).');
      return;
    }
    const file = vscode.Uri.file(path.join(root, `${docId}.md`));
    await vscode.window.showTextDocument(file, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  private async _createDoc(): Promise<void> {
    const { root, source } = this._activeRoot();
    if (source === 'bundled') {
      vscode.window.showWarningMessage('Axiom AI: 워크스페이스가 없어 가이드를 등록할 수 없습니다 (번들 읽기전용).');
      return;
    }
    const title = await vscode.window.showInputBox({
      prompt: '새 가이드 제목',
      placeHolder: '예: 결재선 컴포넌트 사용 가이드',
    });
    if (!title?.trim()) return;

    const toc = this._loadToc(root);
    const picks = [
      ...toc.sidebars
        .filter((sb) => sb.id !== UNCATEGORIZED_SIDEBAR_ID)
        .map((sb) => ({ label: sb.label, sidebarId: sb.id as string | null })),
      { label: '미분류', description: '_toc.json에 등재하지 않음 (미분류 그룹에 자동 노출)', sidebarId: null },
    ];
    const pick = await vscode.window.showQuickPick(picks, { placeHolder: '등록할 사이드바 그룹을 선택하세요' });
    if (!pick) return;

    const file = createDoc(root, title.trim());
    const docId = path.relative(root, file).replace(/\\/g, '/').replace(/\.md$/, '');
    if (pick.sidebarId) this._appendToToc(root, pick.sidebarId, docId);

    await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    this._sendToc(docId);
  }

  private _appendToToc(root: string, sidebarId: string, docId: string): void {
    const tocPath = path.join(root, '_toc.json');
    try {
      const toc = JSON.parse(fs.readFileSync(tocPath, 'utf8')) as ITocManifest;
      const sb = toc.sidebars.find((s) => s.id === sidebarId);
      if (!sb) return;
      sb.items.push({ type: 'doc', id: docId });
      fs.writeFileSync(tocPath, JSON.stringify(toc, null, 2) + '\n', 'utf8');
    } catch {
      /* toc 파손 시 등재 생략 — 문서는 미분류로 노출된다 */
    }
  }

  // ─── 핫리로드 ─────────────────────────────────────────────────────────────

  /** 가이드 폴더 저장 감시 — 500ms 디바운스로 toc·현재 문서를 다시 보낸다(외부 corpus 워처와 동일 패턴). */
  private _registerWatcher(): void {
    if (!this._guideDir) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(this._guideDir), '**/*.{md,json}'),
    );
    const schedule = (): void => {
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => {
        this._sendToc();
        if (this._currentDocId) this._sendDoc(this._currentDocId);
      }, 500);
    };
    watcher.onDidChange(schedule);
    watcher.onDidCreate(schedule);
    watcher.onDidDelete(schedule);
    this._disposables.push(watcher);
  }

  // ─── 웹뷰 ─────────────────────────────────────────────────────────────────

  private _post(msg: HostToWebviewMessage): void {
    this._panel.webview.postMessage(msg);
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
             font-src ${webview.cspSource};
             img-src ${webview.cspSource} data:;" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>개발 가이드</title>
</head>
<body data-mode="guide">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
