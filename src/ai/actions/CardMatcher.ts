/**
 * CardMatcher — 질문 → 행동 카드 top-N + 확신도 게이트 (§3.6 계획 카드/컴팩트 리스트).
 *
 * 순수·동기 모듈. 슬롯 프리필용 목록(도메인·엔드포인트·컴포넌트)은 호출부가
 * ISlotSourceProviders로 미리 수집해 ICardMatchContext로 넘긴다 — 여기서는 스캔하지 않는다.
 *
 * 매칭 전략 (offline-retrieval-ranking 교훈 적용):
 *  - 한글에 정규식 `\b`가 안 먹으므로 **소문자·공백 압축 후 포함(includes)** 매칭.
 *  - 복합(긴) 트리거가 자연히 더 무겁게: 트리거 가중치 = 압축 길이 (복합키워드 정밀).
 *  - 한 글자 트리거는 그리디 단일어 오탐원 → 무시 (파서가 저작 시점에 경고).
 *
 * 오분류 비용이 낮다는 전제(§2-1: 틀려도 엉뚱한 카드가 보일 뿐, 실행은 사용자 클릭)가
 * 이 단순한 결정론 매칭을 정당화한다 — 정밀도 튜닝은 드라이런 하니스로.
 */

import { extractDomainFromQuery } from '../intent/IntentSignals';
import { extractApiPaths } from '../decompose/SectionExtractor';
import { LAYER_RANK } from './types';
import type {
  IActionCard, IActionCardSlot, ICardMatch, IRecommendation, TRecommendMode,
} from './types';

/** 매칭·프리필에 필요한 상황 정보 — 호출부(ChatViewProvider 등)가 수집해 전달. */
export interface ICardMatchContext {
  /** 도메인 파일이 열려 있는가 (precondition `file-open`). */
  fileOpen: boolean;
  /** react-app-scaffold 워크스페이스인가 (precondition `scaffold-detected`). */
  scaffoldDetected: boolean;
  /** ISlotSourceProviders.listDomains() 결과 — 프리필 검증·보조용(선택). */
  domains?: string[];
  /** ISlotSourceProviders.listEndpoints() 결과(선택). */
  endpoints?: string[];
  /** ISlotSourceProviders.listComponents() 결과(선택). */
  components?: string[];
}

export interface IMatcherOptions {
  /** 노출 상한. 기본 3 (§4 — 상위 2~3장만). */
  topN?: number;
  /**
   * 확신도 게이트: (top1−top2)/top1 이 이 값 이상이면 'plan'(계획 카드 1장).
   * 기본 0.5 — §10.6 "초기엔 보수적으로(애매하면 리스트)" 원칙. 드라이런으로 튜닝.
   */
  planGapRatio?: number;
}

// 계층 정렬 가점(동점일 때 상위 계층이 앞선다, §4.5 충돌 정책)은 types.ts의 LAYER_RANK를 쓴다 —
// 카탈로그의 id 오버라이드 판정과 순서가 갈리면 안 되므로 진실원은 한 곳이다.

/** 소문자화 + 공백 제거 — 한글 `\b` 함정·공백변형("검색 조건"/"검색조건")을 함께 흡수. */
function compact(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/** 토큰 하나로 인정할 최소 길이 — 1글자 토큰은 아무 데나 걸려 오탐원이 된다. */
const MIN_TOKEN_LEN = 2;

/**
 * 트리거가 질문에 걸리는지 판정한다 — **어절 단위 전부 포함**(붙어 있을 필요 없음).
 *
 * 트리거를 통째 부분문자열로 찾으면 한국어 **조사**가 매칭을 깨뜨린다:
 * 트리거 `화면 만들` vs 입력 "화면**을** 만들어줘" → 압축해도 `화면만들` ≠ `화면을만들` → 불일치.
 * 실측으로 "직원 목록 페이지 만들어줘"는 카드가 뜨고 "직원 목록 **화면을** 만들어줘"는 안 뜨는
 * 비대칭이 나왔다. 트리거를 계속 늘리는 건 두더지잡기이므로(계획서 §2-1의 경고와 같은 함정),
 * 트리거를 어절로 쪼개 **각 어절이 질문 어딘가에 있으면** 매칭으로 본다. 조사·어미 변화·어순이
 * 자연히 흡수된다("만들어줘"·"만들래"·"만들 화면" 모두 `만들` 포함).
 *
 * 느슨해지는 대신 오탐이 늘 수 있지만, 카드의 오분류 비용은 "엉뚱한 카드가 한 장 보일 뿐"이라
 * 이 트레이드오프가 성립한다(§2-1). 정밀도는 확신도 게이트와 드라이런으로 관리한다.
 */
function matchesTrigger(compactQuery: string, trigger: string): boolean {
  const tokens = trigger.trim().split(/\s+/).map(compact).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.some((tok) => tok.length < MIN_TOKEN_LEN)) return false;
  return tokens.every((tok) => compactQuery.includes(tok));
}

function meetsPreconditions(card: IActionCard, ctx: ICardMatchContext): boolean {
  for (const p of card.preconditions) {
    if (p === 'file-open' && !ctx.fileOpen) return false;
    if (p === 'scaffold-detected' && !ctx.scaffoldDetected) return false;
  }
  return true;
}

/** 쿼리 속 파일 경로 참조(원본 소스 지목)는 이름 추출 대상이 아니다 — IntentSignals와 동일 관행. */
const FILE_REF_RE = /[\w./\\-]+\.(?:tsx?|jsx?|md|json|ya?ml|css)\b/gi;
/** 두 험프 이상의 PascalCase 식별자 (예: EmployeeList). 단일 대문자 단어(API 등) 오탐 방지. */
const PASCAL_RE = /\b([A-Z][a-z0-9]+(?:[A-Z][a-zA-Z0-9]*)+)\b/;

/**
 * `prefillFrom: query` 슬롯들을 결정론 추출기로 채운다. 실패한 슬롯은 키를 만들지 않는다.
 * 틀린 프리필은 사고가 아니다 — 칩 하나 고치면 끝(§3.6 원칙 2). 그래서 과감히 채운다.
 */
export function prefillSlots(
  query: string,
  slots: IActionCardSlot[],
  ctx: ICardMatchContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  const cleaned = query.replace(FILE_REF_RE, ' ');
  const cq = compact(query);
  for (const slot of slots) {
    if (slot.prefillFrom !== 'query') continue;
    let value: string | undefined;
    switch (slot.source) {
      case 'text':
        value = cleaned.match(PASCAL_RE)?.[1];
        break;
      case 'enum':
        value = slot.options?.find((o) => cq.includes(compact(o)));
        break;
      case 'domain-list':
        // 목록 밖 값도 채운다 — "새 도메인" 생성이 정당한 경우가 있고, 칩은 편집 가능.
        value = extractDomainFromQuery(query) ?? undefined;
        break;
      case 'endpoint-list':
        value = extractApiPaths(query)[0]
          ?? (ctx.endpoints ?? []).find((e) => query.includes(e));
        break;
      case 'component-list':
        value = (ctx.components ?? []).find((c) => new RegExp(`\\b${c}\\b`).test(query));
        break;
    }
    if (value) out[slot.name] = value;
  }
  return out;
}

/**
 * 활성 카드들에 대해 질문을 매칭해 추천을 만든다.
 * 반환 matches는 점수 내림차순, 동점은 계층 → priority → id 순(결정론 정렬).
 */
export function matchCards(
  query: string,
  cards: IActionCard[],
  ctx: ICardMatchContext,
  opts: IMatcherOptions = {},
): IRecommendation {
  const topN = opts.topN ?? 3;
  const planGapRatio = opts.planGapRatio ?? 0.5;
  const cq = compact(query);

  const scored: ICardMatch[] = [];
  for (const card of cards) {
    if (!meetsPreconditions(card, ctx)) continue;
    let score = 0;
    const matchedTriggers: string[] = [];
    const seenCompact = new Set<string>(); // 공백변형 쌍("use api"/"useapi")의 이중 가산 방지
    for (const t of card.triggers) {
      const ct = compact(t);
      if (ct.length < 2) continue; // 한 글자 트리거 무시(오탐원)
      if (seenCompact.has(ct)) continue;
      if (matchesTrigger(cq, t)) {
        seenCompact.add(ct);
        score += ct.length; // 가중치는 여전히 압축 길이 — 복합 트리거가 더 무겁다
        matchedTriggers.push(t);
      }
    }
    if (score === 0) continue;
    scored.push({ card, score, matchedTriggers, prefill: prefillSlots(query, card.slots, ctx) });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      LAYER_RANK[b.card.layer] - LAYER_RANK[a.card.layer] ||
      b.card.priority - a.card.priority ||
      a.card.id.localeCompare(b.card.id),
  );

  const matches = scored.slice(0, topN);
  let mode: TRecommendMode = 'none';
  if (matches.length === 1) {
    mode = 'plan';
  } else if (matches.length >= 2) {
    const gap = (matches[0].score - matches[1].score) / matches[0].score;
    mode = gap >= planGapRatio ? 'plan' : 'list';
  }
  return { mode, matches };
}

/**
 * 트리거가 하나도 안 걸렸을 때의 **안전망** — 상황에 맞는 카드 전체를 컴팩트 리스트로 낸다.
 *
 * 왜 필요한가: 계획 카드의 안전 전제는 "오분류가 무해하다 — 틀려도 엉뚱한 카드가 하나 보일 뿐"
 * (§2-1)이다. 그런데 매칭이 **0**이면 카드가 아예 안 뜨고 호출부가 전혀 다른 파이프라인(기존
 * 페이지 생성 대화)으로 흘러가, 말투가 조금 달라진 것뿐인데 "다른 세계로 이동"하는 체감을 준다
 * (실측: "페이지 만들어줘"는 카드, "화면을 만들어줘"는 대화). 빗나감을 절벽이 아니라 계단으로
 * 만들려면 **최악의 경우도 "메뉴가 뜬다"** 로 끝나야 한다.
 *
 * 트리거 매칭의 정밀도를 높이는 것과는 별개의 축이다 — 정확도를 아무리 올려도 남은 실패가
 * 절벽이면 체감은 그대로이므로, 이 안전망이 먼저다.
 */
export function listApplicableCards(
  query: string,
  cards: IActionCard[],
  ctx: ICardMatchContext,
  opts: IMatcherOptions = {},
): IRecommendation {
  const topN = opts.topN ?? 5; // 안전망은 조금 더 넉넉히 — "뭘 할 수 있는지" 보여주는 목적
  const applicable = cards
    .filter((card) => meetsPreconditions(card, ctx))
    .sort(
      (a, b) =>
        LAYER_RANK[b.layer] - LAYER_RANK[a.layer] ||
        b.priority - a.priority ||
        a.id.localeCompare(b.id),
    )
    .slice(0, topN);

  if (applicable.length === 0) return { mode: 'none', matches: [] };
  return {
    // 근거 없는 목록이므로 항상 리스트 — 계획 카드로 단정하지 않는다(확신이 없다는 걸 그대로 표현).
    mode: 'list',
    matches: applicable.map((card) => ({
      card,
      score: 0,
      matchedTriggers: [], // 매칭 근거 없음 — 카드가 "왜 떴는지" 거짓으로 꾸미지 않는다
      prefill: prefillSlots(query, card.slots, ctx),
    })),
  };
}
