/**
 * CardCatalog — 디렉터리에서 `*.card.md`를 읽어 카드 목록을 만든다 (§5 카탈로그 3계층).
 *
 * Phase 0 범위: 동기 로드 + 같은 계층 트리거 충돌 정책.
 * Phase 3에서 추가: 3계층 합성(`buildCatalog`) — 같은 id의 계층 오버라이드, 사용자 켜기/끄기,
 * 그리고 **관리 패널이 그릴 목록(entries)**. 패널은 활성 카드만이 아니라 꺼진 카드·깨진 카드까지
 * 봐야 하므로(그게 관리다), 매칭용 `cards`와 목록용 `entries`를 함께 돌려준다.
 *
 * node fs만 쓴다(확장 호스트는 node — vscode API 비의존이라 테스트에서 그대로 돈다).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseActionCard, findTriggerCollisions } from './CardParser';
import { LAYER_RANK, type IActionCard, type ICardIssue, type TActionType, type TCardLayer } from './types';

export interface ICatalogLoadResult {
  /** 활성 카드(검증 통과 + 충돌 정책 생존). */
  cards: IActionCard[];
  /** 비활성 사유·경고 — 관리 패널 ⚠ 표시·Problems 병행용. */
  issues: ICardIssue[];
}

/** 카드 파일 하나의 로드 결과 — 파싱에 실패해도 **행은 그릴 수 있게** 정체를 남긴다. */
export interface ICardFileLoad {
  /** 파일명 유래 id(`<id>.card.md`). 파싱 실패 시에도 이 값은 있다. */
  id: string;
  sourcePath: string;
  layer: TCardLayer;
  /** null = 검증 실패로 비활성(fail-open). 이유는 issues에. */
  card: IActionCard | null;
  issues: ICardIssue[];
}

/** 카드 한 장의 카탈로그 내 상태 (관리 패널의 한 행). */
export type TCardStatus =
  /** 매칭에 참여한다. */
  | 'active'
  /** 사용자가 껐다(설정에 id 저장 — 카드 파일은 건드리지 않는다, §4 규칙 3). */
  | 'disabled'
  /** 검증·충돌 error로 비활성 — 고쳐야 산다. */
  | 'invalid'
  /** 상위 계층의 같은 id 카드가 덮었다(§5 의도된 오버라이드). */
  | 'overridden';

export interface ICatalogEntry {
  id: string;
  title: string;
  icon: string;
  layer: TCardLayer;
  sourcePath: string;
  status: TCardStatus;
  triggers: string[];
  /** 파싱 실패면 null. */
  actionType: TActionType | null;
  description: string;
  /** 이 카드에 귀속된 검증·충돌 이슈(error/warning 모두 — 패널이 ⚠로 표시). */
  issues: ICardIssue[];
  /** 이 카드를 덮은 상위 계층(status='overridden'일 때만). */
  overriddenBy?: TCardLayer;
  /**
   * 파싱에 성공한 카드 본체(status='invalid'면 없음).
   *
   * 활성 카드는 `cards`에 있는데도 여기 붙여 두는 이유: **꺼진 카드가 원래 떴을지**를 물을 수 있어야
   * 하기 때문이다. 토글은 채팅 결과를 조용히 바꾸므로("카드가 왜 안 뜨지"의 실측 원인), 진단하는
   * 쪽이 꺼진 카드로도 매칭을 돌려볼 수 있어야 한다.
   */
  card?: IActionCard;
}

export interface ICatalogSource {
  dir: string;
  layer: TCardLayer;
}

export interface IBuildCatalogOptions {
  /** 사용자가 끈 카드 id 목록(워크스페이스 설정에 저장 — 카드 파일 불변, §4 규칙 3). */
  disabledIds?: readonly string[];
}

export interface ICatalogView {
  /** 매칭 엔진에 넘길 활성 카드. */
  cards: IActionCard[];
  /** 관리 패널 목록 — 꺼진 카드·깨진 카드·덮인 카드까지 전부. */
  entries: ICatalogEntry[];
  /** 특정 카드에 귀속되지 않는 카탈로그 수준 이슈(계층 간 트리거 공유 경고 등). */
  issues: ICardIssue[];
}

const CARD_EXT = '.card.md';

/**
 * 한 디렉터리의 카드 파일을 전부 파싱한다 — 파일 단위 결과를 그대로 돌려준다.
 * 깨진 카드도 `card: null`로 **행이 남는다**: 관리 패널이 "왜 안 뜨는지"를 보여주려면
 * 조용히 사라지면 안 된다(fail-open의 관리 UI 쪽 짝).
 */
export function loadCardFiles(dir: string, layer: TCardLayer): ICardFileLoad[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // 디렉터리 부재는 정상 상태일 수 있다(예: 프로젝트에 .axiom/actions 없음) — 조용히 빈 결과.
    return [];
  }

  const out: ICardFileLoad[] = [];
  for (const name of entries.filter((n) => n.endsWith(CARD_EXT)).sort()) {
    const full = path.join(dir, name);
    const id = name.slice(0, -CARD_EXT.length);
    let raw: string;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (e) {
      out.push({
        id, sourcePath: full, layer, card: null,
        issues: [{
          severity: 'error', cardId: id, sourcePath: full,
          message: `카드 파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`,
        }],
      });
      continue;
    }
    const parsed = parseActionCard(raw, { expectedId: id, sourcePath: full, layer });
    out.push({ id, sourcePath: full, layer, card: parsed.card, issues: parsed.issues });
  }
  return out;
}

/**
 * 한 디렉터리의 카드를 전부 파싱한다. 파일명(`<id>.card.md`)이 기대 id가 된다.
 * fail-open: 깨진 카드는 issues에만 남고 cards에서 빠진다 — 카탈로그 전체는 산다.
 */
export function loadCardsFromDir(dir: string, layer: TCardLayer): ICatalogLoadResult {
  const files = loadCardFiles(dir, layer);
  return {
    cards: files.map((f) => f.card).filter((c): c is IActionCard => c !== null),
    issues: files.flatMap((f) => f.issues),
  };
}

/**
 * 여러 계층의 카드를 합치고 트리거 충돌 정책(§4.5)을 적용한다:
 * 같은 계층 중복 = 나중 카드 비활성(error) / 계층 간 공유 = warning만(의도적 오버라이드).
 */
export function finalizeCatalog(cards: IActionCard[]): ICatalogLoadResult {
  const collisions = findTriggerCollisions(cards);
  const disabled = new Set(
    collisions.filter((i) => i.severity === 'error' && i.cardId).map((i) => i.cardId),
  );
  return { cards: cards.filter((c) => !disabled.has(c.id)), issues: collisions };
}

/**
 * 3계층 카탈로그를 합성한다 (§5) — 매칭용 활성 카드 + 관리 패널용 전체 목록.
 *
 * 해소 순서가 곧 정책이다:
 *  ① 검증 실패(파싱 error) → invalid. 그 카드만 죽고 나머지는 산다(fail-open).
 *  ② **같은 id는 상위 계층이 덮는다**(개인 > 프로젝트 > 내장). 덮인 카드는 overridden —
 *     id 충돌을 오류로 보면 "우리 프로젝트용으로 내장 카드를 갈아끼운다"(§5)가 불가능해진다.
 *     단, 덮는 쪽이 invalid면 덮지 않는다: 깨진 프로젝트 카드가 멀쩡한 내장 카드까지 끄면
 *     fail-open 원칙이 깨진다.
 *  ③ 사용자가 끈 카드 제거 → disabled. 끈 카드는 트리거도 반납한다(다음 단계에 참여하지 않음).
 *  ④ 남은 카드끼리 트리거 충돌 검사 → 같은 계층 중복은 invalid.
 */
export function buildCatalog(
  sources: readonly ICatalogSource[],
  opts: IBuildCatalogOptions = {},
): ICatalogView {
  const files = sources.flatMap((s) => loadCardFiles(s.dir, s.layer));
  const disabledIds = new Set(opts.disabledIds ?? []);

  const status = new Map<string, TCardStatus>();
  const extraIssues = new Map<string, ICardIssue[]>();
  const overriddenBy = new Map<string, TCardLayer>();
  const addIssue = (key: string, issue: ICardIssue): void => {
    const list = extraIssues.get(key) ?? [];
    list.push(issue);
    extraIssues.set(key, list);
  };
  /** entries의 키 — 같은 id가 여러 계층에 있을 수 있으므로 경로로 구분한다. */
  const keyOf = (f: ICardFileLoad): string => f.sourcePath;

  // ① 검증 실패
  const parsed: ICardFileLoad[] = [];
  for (const f of files) {
    if (!f.card) status.set(keyOf(f), 'invalid');
    else parsed.push(f);
  }

  // ② 같은 id — 상위 계층이 덮는다
  const byId = new Map<string, ICardFileLoad[]>();
  for (const f of parsed) {
    const list = byId.get(f.id) ?? [];
    list.push(f);
    byId.set(f.id, list);
  }
  const surviving: ICardFileLoad[] = [];
  for (const [id, group] of byId) {
    if (group.length === 1) { surviving.push(group[0]); continue; }
    const sorted = [...group].sort((a, b) => LAYER_RANK[b.layer] - LAYER_RANK[a.layer]);
    const winner = sorted[0];
    surviving.push(winner);
    for (const loser of sorted.slice(1)) {
      status.set(keyOf(loser), 'overridden');
      overriddenBy.set(keyOf(loser), winner.layer);
      addIssue(keyOf(loser), {
        severity: 'warning', cardId: id, sourcePath: loser.sourcePath,
        message: `같은 id의 ${winner.layer} 카드가 이 카드를 덮습니다 — 상위 계층이 우선(§5)`,
      });
    }
  }

  // ③ 사용자 토글
  const enabled = surviving.filter((f) => {
    if (!disabledIds.has(f.id)) return true;
    status.set(keyOf(f), 'disabled');
    return false;
  });

  // ④ 트리거 충돌(활성 후보끼리만)
  const collisions = findTriggerCollisions(enabled.map((f) => f.card as IActionCard));
  const collidedIds = new Set(
    collisions.filter((i) => i.severity === 'error' && i.cardId).map((i) => i.cardId as string),
  );
  const catalogIssues: ICardIssue[] = [];
  for (const issue of collisions) {
    if (!issue.cardId) { catalogIssues.push(issue); continue; }
    const owner = enabled.find((f) => f.id === issue.cardId);
    addIssue(owner ? keyOf(owner) : issue.cardId, issue);
  }

  const cards: IActionCard[] = [];
  for (const f of enabled) {
    if (collidedIds.has(f.id)) { status.set(keyOf(f), 'invalid'); continue; }
    status.set(keyOf(f), 'active');
    cards.push(f.card as IActionCard);
  }

  const entries: ICatalogEntry[] = files.map((f) => {
    const key = keyOf(f);
    const st = status.get(key) ?? 'invalid';
    return {
      id: f.id,
      title: f.card?.title ?? f.id,
      icon: f.card?.icon ?? '⚠️',
      layer: f.layer,
      sourcePath: f.sourcePath,
      status: st,
      triggers: f.card?.triggers ?? [],
      actionType: f.card?.action.type ?? null,
      description: f.card?.description ?? '',
      issues: [...f.issues, ...(extraIssues.get(key) ?? [])],
      ...(overriddenBy.has(key) ? { overriddenBy: overriddenBy.get(key) as TCardLayer } : {}),
      ...(f.card ? { card: f.card } : {}),
    };
  });
  // 목록 정렬 = 계층(내장→프로젝트→개인) → id. 파일 시스템 순서에 흔들리지 않게 결정론.
  entries.sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || a.id.localeCompare(b.id));

  return { cards, entries, issues: catalogIssues };
}
