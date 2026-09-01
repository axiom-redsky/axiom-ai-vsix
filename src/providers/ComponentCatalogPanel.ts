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
import { ExtensionConfig } from '../config/ExtensionConfig';
import { buildCatalog, type ICatalogEntry, type IRawDoc } from '../ai/catalog/ComponentCatalog';
import { COMPONENT_PROPS_INDEX } from '../ai/contracts/generated/componentPropsIndex';
import type { ComponentCatalogPayload, HostToWebviewMessage, WebviewToHostMessage } from '../types/messages';

/** 가이드 문서 중 컴포넌트 문서만 있는 하위 경로(가이드 루트 기준). */
const GUIDE_COMPONENT_DIR = ['components', 'ui'];
/** 지식 문서 중 컴포넌트 문서 하위 경로(지식 루트 기준). */
const KNOWLEDGE_COMPONENT_DIR = 'components';

export class ComponentCatalogPanel {
  public static readonly viewType = 'axiom-ai.componentCatalogPanel';
  private static _current: ComponentCatalogPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (ComponentCatalogPanel._current) {
      ComponentCatalogPanel._current._panel.reveal();
      ComponentCatalogPanel._current._postCatalog();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ComponentCatalogPanel.viewType,
      '컴포넌트 카탈로그',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    ComponentCatalogPanel._current = new ComponentCatalogPanel(panel, extensionUri);
  }

  private _entries: ICatalogEntry[] | null = null;
  private _knowledgeDir: string | null = null;

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      ComponentCatalogPanel._current = undefined;
    });

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
      }
    });
  }

  // ── 목록 ────────────────────────────────────────────────────────────────────

  private _postCatalog(): void {
    const guideDocs = this._readGuideDocs();
    const knowledgeDocs = this._readKnowledgeDocs();
    if (!this._entries) {
      this._entries = buildCatalog({ index: COMPONENT_PROPS_INDEX, guideDocs, knowledgeDocs });
    }
    const entries = this._entries;

    const payload: ComponentCatalogPayload = {
      entries,
      counts: {
        entries: entries.length,
        components: Object.keys(COMPONENT_PROPS_INDEX).length,
        props: entries.reduce((n, e) => n + e.propCount, 0),
        guideDocs: guideDocs.length,
        knowledgeDocs: knowledgeDocs.length,
      },
      scaffoldDetected: this._detectScaffold(),
      knowledgeDir: this._knowledgeDir ? this._displayPath(this._knowledgeDir) : null,
    };
    this._post({ type: 'componentCatalog', payload });
  }

  // ── 자료 읽기 ───────────────────────────────────────────────────────────────

  /**
   * 가이드 루트는 GuidePanel과 **같은 2계층**(워크스페이스 시드본 → 번들 스냅샷)을 따른다.
   * 다르게 고르면 카드에 보이는 요약과 딥링크로 열리는 문서가 갈라진다.
   */
  private _guideRoot(): string | null {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
    const seeded = path.isAbsolute(axiomFolder)
      ? path.join(axiomFolder, 'guide')
      : wsRoot ? path.join(wsRoot, axiomFolder, 'guide') : null;
    if (seeded && fs.existsSync(path.join(seeded, ...GUIDE_COMPONENT_DIR))) return seeded;

    const bundled = vscode.Uri.joinPath(this._extensionUri, 'media', 'guide-docs').fsPath;
    return fs.existsSync(bundled) ? bundled : null;
  }

  private _readGuideDocs(): IRawDoc[] {
    const root = this._guideRoot();
    if (!root) return [];
    const dir = path.join(root, ...GUIDE_COMPONENT_DIR);
    return this._readMarkdownDir(dir).map((f) => ({
      // docId = 가이드 루트 기준 확장자 없는 상대경로(openGuide 딥링크 계약).
      id: [...GUIDE_COMPONENT_DIR, path.basename(f.name, '.md')].join('/'),
      text: f.text,
    }));
  }

  /** 지식 루트도 워크스페이스(.axiom/knowledge) 우선, 없으면 번들 knowledge/. */
  private _readKnowledgeDocs(): IRawDoc[] {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
    const candidates: string[] = [];
    if (path.isAbsolute(axiomFolder)) candidates.push(path.join(axiomFolder, 'knowledge'));
    else if (wsRoot) candidates.push(path.join(wsRoot, axiomFolder, 'knowledge'));
    candidates.push(vscode.Uri.joinPath(this._extensionUri, 'knowledge').fsPath);

    for (const root of candidates) {
      const dir = path.join(root, KNOWLEDGE_COMPONENT_DIR);
      const files = this._readMarkdownDir(dir);
      if (files.length > 0) {
        this._knowledgeDir = dir;
        return files.map((f) => ({ id: `${KNOWLEDGE_COMPONENT_DIR}/${f.name}`, text: f.text }));
      }
    }
    this._knowledgeDir = null;
    return [];
  }

  /** 디렉터리의 .md를 이름순으로 읽는다(읽기 실패는 조용히 건너뛴다 — 목록은 계속 떠야 한다). */
  private _readMarkdownDir(dir: string): { name: string; text: string }[] {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md')).sort();
    } catch {
      return [];
    }
    const out: { name: string; text: string }[] = [];
    for (const name of names) {
      try {
        out.push({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') });
      } catch {
        /* 한 파일이 깨져도 나머지는 보여준다 */
      }
    }
    return out;
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
