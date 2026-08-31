/**
 * CardPlanView — 매칭 결과(IActionCard + 슬롯값) → 채팅 계획 카드 뷰 셰이프 변환.
 *
 * vscode/디스크 비의존 순수 모듈 — 컨트롤러(ActionCardController)가 QuickPick·실행을 맡고,
 * "무엇을 어떻게 보여줄까"(칩·출력 미리보기·실행 라벨)는 여기서 결정한다. 테스트 가능성이 목적.
 */

import type { IActionCard, ICardMatch, TRecommendMode } from './types';
import type {
  ActionCardOutputView, ActionCardSlotView, ActionCardView, ActionCardsPayload,
} from '../../types/messages';

/** 실행 버튼 라벨 — 유형별로 "무슨 일이 일어나는지"를 말한다(§3.6: 이름 대신 결과). */
export const EXECUTE_LABEL: Record<IActionCard['action']['type'], string> = {
  template: '⏎ 이대로 만들기',
  recipe: '골격 안내 보기',
  doc: '문서 보기',
  command: '위저드 열기',
};

/** 표시 문자열의 `{{slot}}`을 확정값으로 치환한다. 미정 슬롯은 그대로 남겨 "아직 미정"이 보이게. */
export function substituteSlots(tpl: string, values: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g, (m, name: string) => values[name] ?? m);
}

/**
 * 슬롯 하나의 **인라인 편집 재료**(후보 목록·자유 입력 허용·검증 규칙)를 해석한다.
 * 워크스페이스 스캔이 필요하므로(도메인·컴포넌트) 호스트가 주입한다. 미주입이면 전부
 * 호스트 QuickPick 위임(`inline: false`) — 종전 동작.
 */
export type TSlotEditorResolver = (
  card: IActionCard,
  slot: IActionCard['slots'][number],
) => Pick<ActionCardSlotView, 'inline' | 'options' | 'allowCustom' | 'placeholder' | 'pattern' | 'patternHint'>;

export function buildSlotViews(
  card: IActionCard,
  values: Record<string, string>,
  resolveEditor?: TSlotEditorResolver,
): ActionCardSlotView[] {
  return card.slots.map((s) => ({
    name: s.name,
    label: s.label,
    value: values[s.name] ?? null,
    ...(resolveEditor ? resolveEditor(card, s) : { inline: false }),
  }));
}

export function buildOutputViews(card: IActionCard, values: Record<string, string>): ActionCardOutputView[] {
  return (card.action.outputs ?? []).map((o) => ({
    kind: o.kind,
    path: substituteSlots(o.path, values),
    ...(o.note ? { note: o.note } : {}),
  }));
}

/**
 * 출력 미리보기 해석기 — 카드의 정적 `outputs` 대신 **실행기와 같은 소스**에서 계산할 기회를 준다.
 * null을 돌려주면 정적 outputs를 쓴다.
 *
 * 왜 필요한가: 실제 출력이 워크스페이스 상태에 따라 갈리는 카드가 있다(페이지 생성 = 도메인이
 * 새로 생기면 도메인 라우터 **신규 생성** + 루트 라우터 등록까지 3개). 정적 선언은 그 분기를
 * 표현할 수 없어 미리보기가 실제보다 적게 말하게 되고, 그러면 "미리보기 = 사람 눈 검증 게이트"
 * (§3.6)라는 안전 속성이 깨진다. 카드 파일에 조건 문법을 넣는 대신 실행기에서 파생시켜
 * 미리보기와 실행이 **구조적으로 갈라질 수 없게** 한다.
 */
export type TOutputsResolver = (card: IActionCard, values: Record<string, string>) => ActionCardOutputView[] | null;

export function buildCardView(
  card: IActionCard,
  match: ICardMatch,
  values: Record<string, string>,
  resolveOutputs?: TOutputsResolver,
  resolveEditor?: TSlotEditorResolver,
): ActionCardView {
  return {
    cardId: card.id,
    icon: card.icon,
    title: card.title,
    actionType: card.action.type,
    description: card.description,
    matchedTriggers: match.matchedTriggers,
    slots: buildSlotViews(card, values, resolveEditor),
    outputs: resolveOutputs?.(card, values) ?? buildOutputViews(card, values),
    ...(card.skeleton !== undefined ? { skeleton: card.skeleton } : {}),
    executeLabel: EXECUTE_LABEL[card.action.type],
  };
}

/** 추천 한 건 전체를 webview 페이로드로. mode='none'은 호출부가 미리 걸러야 한다. */
export function buildCardsPayload(
  requestId: string,
  query: string,
  mode: Exclude<TRecommendMode, 'none'>,
  matches: ICardMatch[],
  values: Map<string, Record<string, string>>,
  resolveOutputs?: TOutputsResolver,
  resolveEditor?: TSlotEditorResolver,
  note?: string,
): ActionCardsPayload {
  return {
    requestId,
    mode,
    query,
    ...(note ? { note } : {}),
    cards: matches.map((m) =>
      buildCardView(m.card, m, values.get(m.card.id) ?? {}, resolveOutputs, resolveEditor),
    ),
  };
}

/** 실행 전 아직 값이 없는 슬롯들 — 실행기가 이것만 되묻는다("위저드 = 칩 편집기"). */
export function missingSlots(card: IActionCard, values: Record<string, string>): string[] {
  return card.slots.filter((s) => !values[s.name]).map((s) => s.name);
}
