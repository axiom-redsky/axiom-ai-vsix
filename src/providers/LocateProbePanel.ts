import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { locateEditRegion } from '../ai/locate/RegionEdit';
import type { WebviewToHostMessage, HostToWebviewMessage, LocateProbeResult } from '../types/messages';

/**
 * 단계별 테스트 ③ 위치찾기 — 에디터 탭(WebviewPanel) 페이지.
 *
 * 목적: 프롬프트+현재 파일을 넣으면 locate 층(스냅 사다리)이 **어느 영역을 편집 대상으로 정하고,
 * 어떤 안전 게이트 판정을 내리는지**를 보여준다. decompose 패널과 같은 원칙 — 운영 코드 미러가
 * 아니라 **export된 순수 함수 `locateEditRegion`을 직접 호출**하므로 동기화 드리프트가 없다.
 * 화면에 뜬 게이트·영역·후보 = 운영 산출물 그대로다.
 *
 *  - 판정: safety.gate(ok / ambiguous / anchor-* / snap-failed / handler-body / cross-cutting)
 *  - 앵커: bestLine·bestScore·매칭 토큰 (grep 스코어링 결과)
 *  - 후보: candidates(모델 객관식 disambiguation 입력, 최대 6) — 행의 "이 후보로 강제" 버튼이
 *    forcedRegion 재실행 = **모델 pick 시뮬레이션**(운영 RegionEditService의 재타겟과 동일 경로)
 *  - 재료: depsHeader(가지치기)·backingDecls·controlInventory 크기
 *
 * 판정·측정만 하며 파일 수정·라우팅·모델 호출은 없다(모델 무관 결정론 층).
 */
export class LocateProbePanel {
  public static readonly viewType = 'axiom-ai.locateProbePanel';
  private static _current: LocateProbePanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (LocateProbePanel._current) {
      LocateProbePanel._current._panel.reveal();
      return;
    }
    // 패널이 활성 탭이 되면 activeTextEditor가 비므로, 생성 **직전**의 활성 파일을 시드로 기억한다.
    const seedDoc = vscode.window.activeTextEditor?.document;
    const seedFile = seedDoc && seedDoc.uri.scheme === 'file' ? seedDoc.fileName : null;
    const panel = vscode.window.createWebviewPanel(
      LocateProbePanel.viewType,
      '3. 위치찾기 테스트',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    LocateProbePanel._current = new LocateProbePanel(panel, extensionUri, seedFile);
  }

  /** 패널 생성 직전~생존 중 마지막으로 활성이던 텍스트 파일(폴백 ④의 재료). */
  private _lastEditorFile: string | null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    seedEditorFile: string | null = null,
  ) {
    this._lastEditorFile = seedEditorFile;
    _panel.webview.html = this._buildHtml(_panel.webview);
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e && e.document.uri.scheme === 'file') this._lastEditorFile = e.document.fileName;
      }),
    );
    _panel.onDidDispose(() => {
      LocateProbePanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });
    _panel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'locateProbeUseActiveFile':
          this._useActiveFile();
          break;
        case 'runLocateProbe':
          this._run(msg.query, msg.filePath, msg.forcedStart, msg.forcedEnd);
          break;
      }
    });
  }

  /**
   * "열린 파일 가져오기" — 이 패널이 활성 탭이라 activeTextEditor가 비기 쉽다
   * (modify→create leak 메모리의 함정과 동일). Intent/Decompose 패널과 동일한 폴백 사슬.
   */
  private _useActiveFile(): void {
    const resolved = this._resolveEditorFile();
    if (resolved) {
      this._post({ type: 'locateProbeFilePicked', filePath: this._toWorkspaceRel(resolved) });
    } else {
      this._post({ type: 'locateProbeError', message: '열린 텍스트 파일을 찾지 못했습니다. 경로를 직접 입력하세요.' });
    }
  }

  private _resolveEditorFile(): string | null {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file') return active.fileName;
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
    if (visible) return visible.document.fileName;
    for (const group of vscode.window.tabGroups.all) {
      const input = group.activeTab?.input;
      if (input instanceof vscode.TabInputText && input.uri.scheme === 'file') return input.uri.fsPath;
    }
    if (this._lastEditorFile && fs.existsSync(this._lastEditorFile)) return this._lastEditorFile;
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
          return tab.input.uri.fsPath;
        }
      }
    }
    return null;
  }

  private _run(query: string, filePathRaw: string, forcedStart: number, forcedEnd: number): void {
    if (!query.trim()) {
      this._post({ type: 'locateProbeError', message: '프롬프트를 입력하세요.' });
      return;
    }
    const filePath = filePathRaw.trim();
    if (!filePath) {
      this._post({ type: 'locateProbeError', message: '현재 파일이 필요합니다 — locate는 파일 안에서 영역을 찾는 층입니다.' });
      return;
    }
    const abs = this._toAbsolutePath(filePath);
    let source = '';
    try {
      source = fs.readFileSync(abs, 'utf8');
    } catch {
      this._post({ type: 'locateProbeError', message: `파일을 읽지 못했습니다: ${filePath}` });
      return;
    }
    if (!/\.(tsx?|jsx?)$/i.test(abs)) {
      this._post({ type: 'locateProbeError', message: '위치찾기는 TS/TSX/JS/JSX 파일 대상입니다.' });
      return;
    }

    const forced =
      forcedStart > 0 && forcedEnd >= forcedStart ? { startLine: forcedStart, endLine: forcedEnd } : undefined;

    // ── 운영과 동일한 순수 함수 직접 호출(미러 아님) ──
    const located = locateEditRegion(source, query, forced);

    const result: LocateProbeResult = {
      query,
      file: { path: this._toWorkspaceRel(abs), chars: source.length, lines: located.lines.length },
      forced: forced ?? null,
      gate: located.safety.gate,
      gateOk: located.safety.ok,
      reason: located.safety.reason,
      bestLine: located.bestLine,
      bestScore: located.bestScore,
      matched: located.matched,
      startLine: located.startLine,
      endLine: located.endLine,
      region: located.region,
      candidates: located.candidates,
      ambiguousCandidates: located.ambiguousCandidates,
      materials: {
        depsHeaderChars: located.depsHeader.length,
        depsHeader: located.depsHeader,
        backingDeclsChars: located.backingDecls.length,
        backingDecls: located.backingDecls,
        controlInventoryChars: located.controlInventory.length,
        controlInventory: located.controlInventory,
      },
    };
    this._post({ type: 'locateProbeResult', result });
    this._post({ type: 'locateProbeDone' });
  }

  private _toAbsolutePath(rel: string): string {
    if (path.isAbsolute(rel)) return rel;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return wsRoot ? path.join(wsRoot, rel) : rel;
  }

  private _toWorkspaceRel(fileName: string): string {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return fileName;
    const rel = path.relative(wsRoot, fileName);
    return rel.startsWith('..') ? fileName.replace(/\\/g, '/') : rel.replace(/\\/g, '/');
  }

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
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>위치찾기 테스트</title>
</head>
<body data-mode="locate-probe">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
