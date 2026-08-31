/**
 * ActionCardsPanel — 행동 카드 **관리 패널** (Phase 3, 계획서 §5).
 *
 * 원칙: **"편집은 파일, 관리는 패널"**. 사용자가 개발자이므로 폼 편집기를 만들지 않는다 —
 * 카드 내용은 `.card.md`를 직접 고치고(저장 즉시 핫리로드), 패널은 파일로는 못 하는 것만 한다:
 *  ① 목록      — 3계층·상태(활성/꺼짐/오류/덮임)·검증 ⚠를 한눈에
 *  ② 켜기/끄기 — 삭제 대신 비활성(상태는 설정에, 카드 파일은 불변 §4 규칙 3)
 *  ③ 새 카드   — 파서를 통과하는 스캐폴딩을 만들어 에디터로 열어줌
 *  ④ lint      — 로드 시점 검증 결과를 카드별로
 *  ⑤ 드라이런  — "이 카드가 어떤 질문에 뜨는지"를 등록 시점에 확인 (트리거 겹침으로 엉뚱한
 *     카드가 위로 오는 문제 = 오프라인 top-N 오염과 같은 부류를 저작 시점에 차단)
 *
 * 매칭은 운영과 **같은 함수**(matchCards/listApplicableCards)를 부른다 — 미러가 아니다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CardCatalogService } from './CardCatalogService';
import { matchCards, listApplicableCards, type ICardMatchContext } from '../ai/actions/CardMatcher';
import { CARD_TEMPLATE_KINDS, CARD_TEMPLATE_LABELS, type TCardTemplateKind } from '../ai/actions/CardTemplate';
import { COMPONENT_PROPS_INDEX } from '../ai/contracts/generated/componentPropsIndex';
import { listEndpoints, scanSpecDocs } from '../ai/actions/SpecDocScanner';
import type { IActionCard, ICardMatch } from '../ai/actions/types';
import type {
  ActionCatalogDryrunRow, ActionCatalogPayload, HostToWebviewMessage, WebviewToHostMessage,
} from '../types/messages';

/** 카드 id 규칙 — 파일명과 일치해야 하므로 파서와 같은 kebab-case. */
const ID_RE = /^[a-z][a-z0-9-]*$/;

export class ActionCardsPanel {
  public static readonly viewType = 'axiom-ai.actionCardsPanel';
  private static _current: ActionCardsPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (ActionCardsPanel._current) {
      ActionCardsPanel._current._panel.reveal();
      ActionCardsPanel._current._postCatalog();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ActionCardsPanel.viewType,
      // 카드는 오프라인 전용이다(§10.1 — 온라인은 자연어 실행 유지). 제목에 그 사실이 없으면
      // 온라인에서도 쓰이는 기능으로 읽힌다(사용자 지적).
      '오프라인 행동 카드 관리',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    ActionCardsPanel._current = new ActionCardsPanel(panel, extensionUri);
  }

  private readonly _catalog: CardCatalogService;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    this._catalog = new CardCatalogService(_extensionUri);
    _panel.webview.html = this._buildHtml(_panel.webview);

    // 핫리로드 — 카드 파일을 고치고 저장하면 목록·lint가 즉시 갱신된다(§8 `.axiom/knowledge` 관례 확장).
    this._disposables.push(this._catalog.watch(() => this._postCatalog()));
    // 켜기/끄기는 설정에 저장되므로, 설정을 손으로 고쳐도 패널이 따라온다.
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('axiom-ai.actionCards.disabled')) this._postCatalog();
      }),
    );

    _panel.onDidDispose(() => {
      ActionCardsPanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });

    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'actionCatalogLoad':
          this._postCatalog();
          break;
        case 'actionCatalogToggle':
          await this._toggle(msg.cardId, msg.enabled);
          break;
        case 'actionCatalogOpenCard':
          await this._openCard(msg.sourcePath);
          break;
        case 'actionCatalogNewCard':
          await this._newCard(msg.layer);
          break;
        case 'actionCatalogDryrun':
          this._dryrun(msg.query, msg.fileOpen, msg.scaffoldDetected, msg.gapRatio);
          break;
      }
    });
  }

  // ── 목록 ────────────────────────────────────────────────────────────────────

  private _postCatalog(): void {
    const view = this._catalog.load();
    const layers = this._catalog.layers();
    const counts = new Map<string, number>();
    for (const e of view.entries) counts.set(e.layer, (counts.get(e.layer) ?? 0) + 1);

    const payload: ActionCatalogPayload = {
      entries: view.entries.map((e) => ({
        cardId: e.id,
        title: e.title,
        icon: e.icon,
        layer: e.layer,
        status: e.status,
        actionType: e.actionType,
        triggers: e.triggers,
        description: e.description,
        sourcePath: e.sourcePath,
        displayPath: this._displayPath(e.sourcePath),
        issues: e.issues.map((i) => ({ severity: i.severity, message: i.message, ...(i.field ? { field: i.field } : {}) })),
        ...(e.overriddenBy ? { overriddenBy: e.overriddenBy } : {}),
      })),
      layers: layers.map((l) => ({
        layer: l.layer,
        dir: this._displayPath(l.dir),
        exists: l.exists,
        editable: l.editable,
        count: counts.get(l.layer) ?? 0,
      })),
      issues: view.issues.map((i) => ({ severity: i.severity, message: i.message, ...(i.field ? { field: i.field } : {}) })),
      context: {
        fileOpen: this._detectFileOpen(),
        scaffoldDetected: this._detectScaffold(),
        domainCount: this._scanDomains().length,
        endpointCount: this._scanEndpoints().length,
        componentCount: Object.keys(COMPONENT_PROPS_INDEX).length,
      },
    };
    this._post({ type: 'actionCatalog', payload });
  }

  private async _toggle(cardId: string, enabled: boolean): Promise<void> {
    try {
      await this._catalog.setEnabled(cardId, enabled);
    } catch (e) {
      this._notice(`설정을 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    this._postCatalog();
  }

  private async _openCard(sourcePath: string): Promise<void> {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      this._notice('카드 파일을 찾을 수 없습니다(삭제되었거나 이동됨).', 'error');
      this._postCatalog();
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourcePath));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  // ── 새 카드 만들기 ──────────────────────────────────────────────────────────

  private async _newCard(layer: 'builtin' | 'project' | 'personal'): Promise<void> {
    if (layer === 'builtin') {
      this._notice('내장 카드 계층에는 새 카드를 만들 수 없습니다.', 'error');
      return;
    }
    // `kind`는 QuickPickItem의 예약 필드(구분선)라 다른 이름으로 실어 보낸다.
    const kindPick = await vscode.window.showQuickPick(
      CARD_TEMPLATE_KINDS.map((k) => ({
        label: CARD_TEMPLATE_LABELS[k].label,
        detail: CARD_TEMPLATE_LABELS[k].detail,
        cardKind: k as TCardTemplateKind,
      })),
      { placeHolder: '어떤 종류의 카드를 만들까요?' },
    );
    if (!kindPick) return;

    const existing = new Set(this._catalog.load().entries.map((e) => e.id));
    const id = await vscode.window.showInputBox({
      prompt: '카드 id (kebab-case — 파일명 <id>.card.md 가 됩니다)',
      placeHolder: 'project-search-form',
      validateInput: (v) => {
        const t = v.trim();
        if (!t) return null;
        if (!ID_RE.test(t)) return '소문자·숫자·하이픈만, 소문자로 시작 (예: project-search-form)';
        if (existing.has(t)) return `이미 있는 카드 id입니다: ${t}`;
        return null;
      },
    });
    if (!id?.trim()) return;

    const result = this._catalog.createCard(layer, id.trim(), kindPick.cardKind);
    if ('error' in result) {
      this._notice(result.error, 'error');
      return;
    }
    this._postCatalog();
    this._notice(`카드를 만들었습니다: ${this._displayPath(result.path)} — 파일을 고치고 저장하면 바로 반영됩니다.`, 'info');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.path));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  // ── 드라이런 ────────────────────────────────────────────────────────────────

  /**
   * "이 질문에 어떤 카드가 뜨나" — 운영 매처를 그대로 호출한다(미러 금지).
   * 뜨는 것만이 아니라 **전제조건에 걸려 빠진 카드**도 함께 보여준다: 카드가 안 뜨는 신고의
   * 절반은 매칭이 아니라 상황 필터(file-open 등)이기 때문.
   */
  private _dryrun(query: string, fileOpen: boolean, scaffoldDetected: boolean, gapRatio?: number): void {
    const trimmed = query.trim();
    if (!trimmed) {
      this._notice('드라이런할 질문을 입력하세요.', 'error');
      return;
    }
    const view = this._catalog.load();
    const cards = view.cards;
    const ctx: ICardMatchContext = {
      fileOpen,
      scaffoldDetected,
      domains: this._scanDomains(),
      endpoints: this._scanEndpoints(),
      components: Object.keys(COMPONENT_PROPS_INDEX),
    };
    const opts = typeof gapRatio === 'number' && !Number.isNaN(gapRatio) ? { planGapRatio: gapRatio } : {};
    const rec = matchCards(trimmed, cards, ctx, opts);
    const fallback = listApplicableCards(trimmed, cards, ctx);

    const excluded = cards
      .map((card) => ({ card, reason: this._preconditionMiss(card, ctx) }))
      .filter((x): x is { card: IActionCard; reason: string } => x.reason !== null)
      .map((x) => ({ cardId: x.card.id, title: x.card.title, reason: x.reason }));

    // 꺼진 카드가 원래 떴을지도 함께 말한다. 활성 목록에서만 매칭하면 "매칭 없음"으로만 보여
    // 사용자는 매처가 고장났다고 읽는다(실측: 시험 삼아 끈 카드 때문에 카드가 안 뜬 사건).
    const offCards = view.entries
      .filter((e) => e.status === 'disabled' && e.card)
      .map((e) => e.card as IActionCard);
    if (offCards.length > 0) {
      for (const m of matchCards(trimmed, offCards, ctx, opts).matches) {
        excluded.push({
          cardId: m.card.id,
          title: m.card.title,
          reason: `꺼짐 — 켜면 이 질문에 뜹니다 (근거: ${m.matchedTriggers.join(', ') || '없음'})`,
        });
      }
    }

    const gap = rec.matches.length >= 2
      ? Math.round(((rec.matches[0].score - rec.matches[1].score) / rec.matches[0].score) * 100) / 100
      : null;

    this._post({
      type: 'actionCatalogDryrunResult',
      result: {
        query: trimmed,
        mode: rec.mode,
        gap,
        rows: rec.matches.map((m) => this._toRow(m)),
        excluded,
        fallback: rec.matches.length === 0 ? fallback.matches.map((m) => this._toRow(m)) : [],
      },
    });
  }

  private _toRow(m: ICardMatch): ActionCatalogDryrunRow {
    return {
      cardId: m.card.id,
      icon: m.card.icon,
      title: m.card.title,
      layer: m.card.layer,
      actionType: m.card.action.type,
      score: m.score,
      matchedTriggers: m.matchedTriggers,
      prefill: Object.entries(m.prefill).map(([name, value]) => ({ name, value })),
    };
  }

  /** 전제조건 중 못 넘긴 것(있으면 그 사유, 없으면 null). CardMatcher의 판정과 같은 어휘. */
  private _preconditionMiss(card: IActionCard, ctx: ICardMatchContext): string | null {
    if (card.preconditions.includes('file-open') && !ctx.fileOpen) return '전제조건 file-open 미충족(파일 안 열림)';
    if (card.preconditions.includes('scaffold-detected') && !ctx.scaffoldDetected) {
      return '전제조건 scaffold-detected 미충족(스캐폴드 워크스페이스 아님)';
    }
    return null;
  }

  // ── 상황 스캔 (드라이런 기본값) ─────────────────────────────────────────────

  private _workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private _detectFileOpen(): boolean {
    if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') return true;
    return vscode.window.visibleTextEditors.some((e) => e.document.uri.scheme === 'file');
  }

  private _detectScaffold(): boolean {
    const root = this._workspaceRoot();
    return !!root && fs.existsSync(path.join(root, 'src', 'domains'));
  }

  private _scanDomains(): string[] {
    const root = this._workspaceRoot();
    if (!root) return [];
    const dir = path.join(root, 'src', 'domains');
    try {
      return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory());
    } catch {
      return [];
    }
  }

  private _scanEndpoints(): string[] {
    const root = this._workspaceRoot();
    if (!root) return [];
    try {
      return listEndpoints(scanSpecDocs(root));
    } catch {
      return [];
    }
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  /** 워크스페이스 안이면 상대 경로로, 밖(내장·globalStorage)이면 뒤 두 세그먼트만. */
  private _displayPath(abs: string): string {
    const root = this._workspaceRoot();
    if (root) {
      const rel = path.relative(root, abs);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
    }
    const parts = abs.replace(/\\/g, '/').split('/');
    return parts.length <= 2 ? abs.replace(/\\/g, '/') : `…/${parts.slice(-2).join('/')}`;
  }

  private _notice(message: string, severity: 'info' | 'error'): void {
    this._post({ type: 'actionCatalogNotice', message, severity });
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
  <title>오프라인 행동 카드 관리</title>
</head>
<body data-mode="action-cards">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
