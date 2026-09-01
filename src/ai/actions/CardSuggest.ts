/**
 * CardSuggest — **Enter 전** 입력창 위에 뜨는 실시간 추천(계획서 §3.5 형태 B).
 *
 * 형태 A(채팅 카드)와 같은 매처를 쓰되, **표시 시점이 다르면 규칙도 달라야 한다**:
 *
 *  ① **안전망을 쓰지 않는다.** Enter 후(형태 A)에는 매칭이 0이어도 카탈로그 전체를 리스트로
 *     보여주는 게 옳다 — 사용자가 이미 요청을 했고, 빈손으로 끝나면 그게 절벽이니까(§N).
 *     그러나 타이핑 **도중**에 "아무거나 목록"이 계속 떠 있으면 그건 도움이 아니라 방해다.
 *     여기서는 트리거가 실제로 걸린 것만 낸다.
 *  ② **짧은 입력에는 뜨지 않는다.** 한두 글자에 목록이 튀어나오면 시야를 가린다.
 *  ③ **슬래시 명령에는 뜨지 않는다.** `/`로 시작하면 슬래시 팔레트의 자리다(둘이 겹치면 Enter가
 *     무엇을 할지 사용자가 예측할 수 없다).
 *
 * 순수·동기 모듈 — 카탈로그·상황(ctx)은 호출부가 넘긴다. 매칭 자체는 운영과 **같은 함수**
 * (`matchCards`)라 미러가 아니다.
 */

import { matchCards } from './CardMatcher';
import type { ICardMatchContext } from './CardMatcher';
import type { IActionCard } from './types';

/** 입력창 위 목록의 한 줄 — 웹뷰가 그리는 데 필요한 최소값만. */
export interface ICardSuggestion {
  cardId: string;
  icon: string;
  title: string;
  actionType: string;
  /** 왜 떴는지(걸린 트리거). 목록 아래 근거로 그대로 보여준다 — 카드가 뜬 이유를 숨기지 않는다. */
  matchedTriggers: string[];
}

/** 이 길이 미만이면 목록을 만들지 않는다(타이핑 첫 글자에 튀어나오는 것 방지). */
export const SUGGEST_MIN_QUERY = 2;
/** 입력창 위는 좁다 — 형태 A(3장)보다 조금 적게. */
export const SUGGEST_LIMIT = 3;

export interface ISuggestOptions {
  limit?: number;
}

/**
 * 타이핑 중인 입력에 대한 추천 목록. 조건에 맞지 않으면 빈 배열(호출부는 그대로 아무것도 안 그린다).
 */
export function suggestCards(
  query: string,
  cards: IActionCard[],
  ctx: ICardMatchContext,
  opts: ISuggestOptions = {},
): ICardSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length < SUGGEST_MIN_QUERY) return [];
  if (trimmed.startsWith('/')) return [];
  if (cards.length === 0) return [];

  const limit = opts.limit ?? SUGGEST_LIMIT;
  // 안전망(listApplicableCards)은 부르지 않는다 — 위 ①.
  const rec = matchCards(trimmed, cards, ctx, { topN: limit });
  return rec.matches.map((m) => ({
    cardId: m.card.id,
    icon: m.card.icon,
    title: m.card.title,
    actionType: m.card.action.type,
    matchedTriggers: m.matchedTriggers,
  }));
}
