/**
 * CardCatalogService — 행동 카드 카탈로그 3계층의 **호스트 쪽 단일 진입점** (§5, Phase 3).
 *
 * 계층(위로 갈수록 우선):
 *  ① 내장    `<extension>/media/action-cards`      — Axiom이 관리(읽기 전용)
 *  ② 프로젝트 `<workspace>/.axiom/actions`          — git 커밋으로 **팀 공유**(§5의 핵심)
 *  ③ 개인    `<globalStorage>/action-cards`        — 개인 스니펫(공유 안 됨)
 *
 * 왜 서비스로 뺐나: 카탈로그를 읽는 곳이 둘(채팅 추천 = ActionCardController, 관리 패널)인데
 * 계층 경로·켜기/끄기 규칙이 갈라지면 "패널에서 껐는데 채팅에는 뜬다" 같은 배신이 생긴다.
 * 두 곳이 **같은 함수**를 부르게 해서 구조적으로 못 갈라지게 한다.
 *
 * 켜기/끄기 상태는 **카드 파일이 아니라 설정**에 저장한다(§4 규칙 3) — 파일은 git에서 항상
 * 깨끗하게, "내가 껐다"는 상태가 팀 카드 파일에 섞이지 않게.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildCatalog, type ICatalogSource, type ICatalogView } from '../ai/actions/CardCatalog';
import { buildCardTemplate, type TCardTemplateKind } from '../ai/actions/CardTemplate';
import type { IActionCard, TCardLayer } from '../ai/actions/types';

/** 비활성 카드 id 목록을 담는 설정 키. */
const DISABLED_KEY = 'actionCards.disabled';

export interface ILayerInfo {
  layer: TCardLayer;
  dir: string;
  exists: boolean;
  /** 사용자가 카드를 새로 만들 수 있는 계층인가(내장은 익스텐션 번들이라 불가). */
  editable: boolean;
}

export class CardCatalogService {
  /** globalStorage 경로는 activate 때만 알 수 있어 한 번 심어 둔다(ExtensionConfig.init과 같은 관례). */
  private static _personalDir: string | null = null;

  static init(context: vscode.ExtensionContext): void {
    try {
      CardCatalogService._personalDir = path.join(context.globalStorageUri.fsPath, 'action-cards');
    } catch {
      // globalStorage 접근 불가(VDI·로밍 프로필 등) — 개인 계층 없이 2계층으로 동작한다.
      CardCatalogService._personalDir = null;
    }
  }

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // ── 계층 경로 ───────────────────────────────────────────────────────────────

  private _workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  /** 계층별 디렉터리 — 없는 디렉터리도 목록에 남긴다(패널이 "여기에 만들면 됩니다"를 보여줘야 하므로). */
  layers(): ILayerInfo[] {
    const out: ILayerInfo[] = [
      {
        layer: 'builtin',
        dir: vscode.Uri.joinPath(this._extensionUri, 'media', 'action-cards').fsPath,
        exists: true,
        editable: false,
      },
    ];
    const wsRoot = this._workspaceRoot();
    if (wsRoot) {
      const dir = path.join(wsRoot, '.axiom', 'actions');
      out.push({ layer: 'project', dir, exists: fs.existsSync(dir), editable: true });
    }
    if (CardCatalogService._personalDir) {
      const dir = CardCatalogService._personalDir;
      out.push({ layer: 'personal', dir, exists: fs.existsSync(dir), editable: true });
    }
    return out;
  }

  private _sources(): ICatalogSource[] {
    return this.layers().map((l) => ({ dir: l.dir, layer: l.layer }));
  }

  // ── 로드 ────────────────────────────────────────────────────────────────────

  /** 3계층 전체 — 관리 패널용(꺼진 카드·깨진 카드 포함). 디렉터리가 작아 매 호출 로드 = 공짜 핫리로드. */
  load(): ICatalogView {
    return buildCatalog(this._sources(), { disabledIds: this.disabledIds() });
  }

  /** 매칭에 쓸 활성 카드만 — 채팅 추천 경로(ActionCardController)가 쓴다. */
  activeCards(): IActionCard[] {
    const view = this.load();
    for (const entry of view.entries) {
      if (entry.status !== 'invalid') continue;
      for (const issue of entry.issues.filter((i) => i.severity === 'error')) {
        console.warn(`[Axiom AI] 행동 카드 비활성: [${entry.id}] ${issue.message} (${entry.sourcePath})`);
      }
    }
    return view.cards;
  }

  // ── 켜기/끄기 (§4 규칙 3 — 카드 파일 불변) ──────────────────────────────────

  disabledIds(): string[] {
    const raw = vscode.workspace.getConfiguration('axiom-ai').get<string[]>(DISABLED_KEY, []);
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string' && v.trim()) : [];
  }

  async setEnabled(cardId: string, enabled: boolean): Promise<void> {
    const current = new Set(this.disabledIds());
    if (enabled) current.delete(cardId);
    else current.add(cardId);
    const next = [...current].sort();
    // 워크스페이스가 열려 있으면 그 워크스페이스 한정(다른 프로젝트의 카탈로그를 건드리지 않는다),
    // 없으면 전역 — 설정 대상이 없으면 update가 실패하기 때문.
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await vscode.workspace.getConfiguration('axiom-ai').update(DISABLED_KEY, next, target);
  }

  // ── 새 카드 만들기 ──────────────────────────────────────────────────────────

  /**
   * 카드 파일을 스캐폴딩한다. 이미 있으면 만들지 않고 그 경로를 실패로 알린다(덮어쓰기 금지 —
   * 사용자가 쓴 카드를 조용히 지우는 건 이 패널이 절대 하면 안 되는 일).
   */
  createCard(layer: TCardLayer, id: string, kind: TCardTemplateKind): { path: string } | { error: string } {
    const info = this.layers().find((l) => l.layer === layer);
    if (!info) return { error: `${layer} 계층을 사용할 수 없습니다(워크스페이스 또는 저장소 없음).` };
    if (!info.editable) return { error: '내장 카드 계층에는 새 카드를 만들 수 없습니다.' };
    const target = path.join(info.dir, `${id}.card.md`);
    if (fs.existsSync(target)) return { error: `이미 있는 카드입니다: ${target}` };
    try {
      fs.mkdirSync(info.dir, { recursive: true });
      fs.writeFileSync(target, buildCardTemplate(kind, id), 'utf8');
    } catch (e) {
      return { error: `카드 파일을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { path: target };
  }

  // ── 핫리로드 감시 ───────────────────────────────────────────────────────────

  /**
   * 프로젝트·개인 카드 디렉터리를 감시한다(내장은 번들이라 안 바뀐다).
   * `.axiom/knowledge` 핫리로드(_AUTHORING)와 같은 메커니즘의 확장 (§8) — 저장하면 바로 반영.
   */
  watch(onChange: () => void): vscode.Disposable {
    const watchers: vscode.FileSystemWatcher[] = [];
    for (const info of this.layers()) {
      if (!info.editable) continue;
      try {
        const w = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(info.dir), '*.card.md'),
        );
        w.onDidChange(onChange);
        w.onDidCreate(onChange);
        w.onDidDelete(onChange);
        watchers.push(w);
      } catch {
        // 감시 실패는 치명적이지 않다 — 패널의 새로고침 버튼으로 갱신할 수 있다.
      }
    }
    return new vscode.Disposable(() => { for (const w of watchers) w.dispose(); });
  }
}
