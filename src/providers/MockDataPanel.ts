/**
 * MockDataPanel — Mock 데이터 생성기 (계획서 §7 D2).
 *
 * 백엔드가 아직 없을 때, **워크스페이스에 이미 있는 타입**으로 fixture JSON을 만든다. 모델 호출 0.
 *
 * 이 창은 D1(퍼블리싱 포팅)에 이어 **파일을 쓰는 두 번째 창**이라 같은 안전 규약을 따른다(§3.6):
 *   ① 저장될 내용을 **그대로** 먼저 보여 준다(미리보기 = 검증 게이트).
 *   ② 사람이 누를 때만 쓴다. ③ 이미 있는 파일이면 **덮어쓰기라고 밝히고** 버튼 이름도 바꾼다.
 *
 * D1과 다른 점 하나: mock은 **다시 만드는 게 정상**이다(건수를 늘리거나 타입이 바뀌면). 그래서
 * 덮어쓰기를 막지 않고 밝히기만 한다 — 대신 `public/mock/` 밖으로는 못 쓴다(경로 고정).
 *
 * 계산은 순수 모듈(`ai/mock/TypeShape`·`ai/mock/MockData`)이 하고, 여기는 읽기·쓰기만 맡는다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_MOCK_OPTIONS, ENVELOPE_KEY_CHOICES, alreadyEnvelope, generateMock, mockEndpoint,
  mockFilePath, type IMockOptions,
} from '../ai/mock/MockData';
import { shapeOfDeclaration, lookupType, type TShape } from '../ai/mock/TypeShape';
import { loadTypeSource, isTypeDocument, type ITypeSource } from './TypeSource';
import { openWorkspaceFile } from './RouterSource';
import type { HostToWebviewMessage, MockDataPayload, WebviewToHostMessage } from '../types/messages';

export class MockDataPanel {
  public static readonly viewType = 'axiom-ai.mockDataPanel';
  private static _current: MockDataPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (MockDataPanel._current) {
      MockDataPanel._current._panel.reveal();
      MockDataPanel._current._postState();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      MockDataPanel.viewType,
      'Mock 데이터',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    MockDataPanel._current = new MockDataPanel(panel, extensionUri);
  }

  private _selected: { name: string; file: string } | null = null;
  private _options: IMockOptions = { ...DEFAULT_MOCK_OPTIONS };
  private _source: ITypeSource | null = null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      MockDataPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    // 타입을 고치고 저장하면 목록·미리보기가 따라가야 한다 — 옛 모양으로 mock을 만들면 그게 제일 나쁘다.
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (isTypeDocument(doc)) {
          this._source = null;
          this._postState();
        }
      }),
      // 보고 있는 파일이 바뀌면 그 파일의 타입을 목록 맨 위로 — 지금 만지는 화면의 타입이 대개 정답이다.
      vscode.window.onDidChangeActiveTextEditor(() => this._postState()),
    );

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'mockLoad':
          this._source = null;
          this._postState();
          break;
        case 'mockSelect':
          this._selected = { name: msg.name, file: msg.file };
          this._adaptOptions();
          this._postState();
          break;
        case 'mockOptions':
          this._options = { ...this._options, ...msg.options };
          this._postState();
          break;
        case 'mockCopy':
          await vscode.env.clipboard.writeText(msg.text);
          this._notice(msg.what === 'json' ? 'JSON을 복사했습니다.' : 'useApi 코드를 복사했습니다.', 'info');
          break;
        case 'mockOpen':
          await openWorkspaceFile(msg.file, msg.line);
          break;
        case 'mockSave':
          await this._save();
          break;
      }
    });
  }

  // ── 자료 ────────────────────────────────────────────────────────────────────

  private _load(): ITypeSource {
    if (!this._source) this._source = loadTypeSource();
    return this._source;
  }

  /** 고른 타입의 모양을 푼다. 없으면 null. */
  private _shape(): { shape: TShape; issues: string[]; name: string } | null {
    const source = this._load();
    if (!this._selected) return null;
    const decl = lookupType(source.index, this._selected.name, this._selected.file);
    if (!decl) return null;
    const { shape, issues } = shapeOfDeclaration(decl, source.index);
    return { shape, issues, name: decl.name };
  }

  /**
   * 고른 타입에 맞춰 기본 옵션을 손본다.
   * ★ 타입이 **이미 봉투**면 봉투를 꺼 준다 — 그냥 두면 `data.data`가 되고, 그건 이 기능이
   * 막으려던 바로 그 실수다. 사람이 다시 켤 수는 있다(고집하지 않는다).
   */
  private _adaptOptions(): void {
    const resolved = this._shape();
    if (!resolved) return;
    const already = alreadyEnvelope(resolved.shape);
    if (already) {
      this._options = { ...this._options, envelopeKey: null, asList: false };
    } else if (resolved.shape.kind === 'array') {
      this._options = { ...this._options, asList: false };
    }
  }

  /** 편집기에서 보고 있는 파일(워크스페이스 상대경로). 없으면 null. */
  private _currentFile(source: ITypeSource): string | null {
    const fsPath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!fsPath || !source.root) return null;
    const rel = path.relative(source.root, fsPath).split(path.sep).join('/');
    return rel.startsWith('..') || path.isAbsolute(rel) ? null : rel;
  }

  private _postState(): void {
    const source = this._load();
    const currentFile = this._currentFile(source);
    const types = currentFile
      ? [...source.entries].sort((a, b) => Number(b.file === currentFile) - Number(a.file === currentFile))
      : source.entries;
    const resolved = this._shape();
    const result = resolved ? generateMock(resolved.shape, resolved.name, this._options) : null;
    const filePath = resolved ? mockFilePath(resolved.name) : null;
    const abs = filePath && source.root ? path.join(source.root, filePath) : null;

    const payload: MockDataPayload = {
      types,
      selected: this._selected,
      currentFile,
      options: this._options,
      preview: result?.text ?? null,
      generic: result?.generic ?? null,
      snippet: result?.snippet ?? null,
      filePath,
      endpoint: filePath ? mockEndpoint(filePath) : null,
      exists: !!abs && fs.existsSync(abs),
      issues: resolved?.issues ?? [],
      notices: result?.notices ?? [],
      envelopeChoices: ENVELOPE_KEY_CHOICES,
      blocked: source.root === null
        ? 'scaffold 워크스페이스를 찾지 못했습니다(`src/domains`가 있는 폴더를 여세요).'
        : source.entries.length === 0 ? '`src/` 아래에서 타입 선언을 찾지 못했습니다.' : null,
    };
    this._post({ type: 'mockData', payload });
  }

  // ── 저장 ────────────────────────────────────────────────────────────────────

  /**
   * 미리보기와 **같은 내용**을 파일로 쓴다.
   * ★ 쓰기 직전에 다시 만든다 — 화면의 미리보기는 그 사이 타입이 바뀌었을 수 있고,
   * 보이는 것과 저장되는 것이 갈라지면 미리보기가 검증 게이트 역할을 못 한다(D1과 같은 규칙).
   * `WorkspaceEdit` 한 번이라 **Ctrl+Z 한 번**으로 되돌아간다.
   */
  private async _save(): Promise<void> {
    const source = this._load();
    const resolved = this._shape();
    if (!source.root || !resolved) {
      this._notice('저장할 내용이 없습니다 — 타입을 먼저 고르세요.', 'error');
      return;
    }
    const result = generateMock(resolved.shape, resolved.name, this._options);
    const rel = mockFilePath(resolved.name);
    const abs = path.join(source.root, rel);
    const uri = vscode.Uri.file(abs);
    const existed = fs.existsSync(abs);

    const edit = new vscode.WorkspaceEdit();
    if (existed) {
      const doc = await vscode.workspace.openTextDocument(uri);
      edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), `${result.text}\n`);
    } else {
      edit.createFile(uri, { ignoreIfExists: false, overwrite: false });
      edit.insert(uri, new vscode.Position(0, 0), `${result.text}\n`);
    }

    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      this._notice('저장하지 못했습니다(다른 편집과 충돌).', 'error');
      return;
    }
    await vscode.workspace.saveAll(false);
    this._notice(
      `${existed ? '덮어썼습니다' : '저장했습니다'} — \`${rel}\`. `
      + `개발 서버에서 \`${mockEndpoint(rel)}\` 로 그대로 불러집니다. 되돌리려면 Ctrl+Z.`,
      'info',
    );
    this._postState();

    const open = await vscode.window.showInformationMessage(
      `Mock 데이터 ${existed ? '덮어쓰기' : '저장'} 완료 — ${rel}`,
      '파일 열기',
    );
    if (open) await openWorkspaceFile(rel, 1);
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'mockNotice', message, severity });
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
  <title>Mock 데이터</title>
</head>
<body data-mode="mock-data">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
