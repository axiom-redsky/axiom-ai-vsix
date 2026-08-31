/**
 * CardCatalog — 디렉터리에서 `*.card.md`를 읽어 카드 목록을 만든다 (§5 카탈로그 3계층).
 *
 * Phase 0 범위: 동기 로드 + 같은 계층 트리거 충돌 정책 적용까지.
 * `.axiom/actions/` 핫리로드·개인 카드(globalStorage)·관리 패널 배선은 Phase 3.
 *
 * node fs만 쓴다(확장 호스트는 node — vscode API 비의존이라 테스트에서 그대로 돈다).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseActionCard, findTriggerCollisions } from './CardParser';
import type { IActionCard, ICardIssue, TCardLayer } from './types';

export interface ICatalogLoadResult {
  /** 활성 카드(검증 통과 + 충돌 정책 생존). */
  cards: IActionCard[];
  /** 비활성 사유·경고 — 관리 패널 ⚠ 표시·Problems 병행용. */
  issues: ICardIssue[];
}

const CARD_EXT = '.card.md';

/**
 * 한 디렉터리의 카드를 전부 파싱한다. 파일명(`<id>.card.md`)이 기대 id가 된다.
 * fail-open: 깨진 카드는 issues에만 남고 cards에서 빠진다 — 카탈로그 전체는 산다.
 */
export function loadCardsFromDir(dir: string, layer: TCardLayer): ICatalogLoadResult {
  const cards: IActionCard[] = [];
  const issues: ICardIssue[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // 디렉터리 부재는 정상 상태일 수 있다(예: 프로젝트에 .axiom/actions 없음) — 조용히 빈 결과.
    return { cards, issues };
  }

  for (const name of entries.filter((n) => n.endsWith(CARD_EXT)).sort()) {
    const full = path.join(dir, name);
    let raw: string;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (e) {
      issues.push({ severity: 'error', message: `카드 파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`, sourcePath: full });
      continue;
    }
    const expectedId = name.slice(0, -CARD_EXT.length);
    const parsed = parseActionCard(raw, { expectedId, sourcePath: full, layer });
    issues.push(...parsed.issues);
    if (parsed.card) cards.push(parsed.card);
  }
  return { cards, issues };
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
