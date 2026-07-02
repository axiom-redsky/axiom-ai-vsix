/**
 * region 편집 프롬프트 토큰 계측 — **단일 추정기(single source of truth)**.
 *
 * 목적(32k 피벗 계측): "넣을 걸 줄인다" 방향의 마지막 조각은, 실제로 조립된 프롬프트가 모델
 * 컨텍스트 예산 대비 어디쯤 쌓이는지를 **숫자로 보는 것**이다. buildHybridPrompt이 만드는 system
 * (정적 규칙 + 계약카드 + 컴포넌트 prop표 + 스펙 + 인벤토리 + depsHeader + region)의 합을 한 번도
 * 예산에 대조한 적이 없어, god component에서 조용히 예산을 넘겨 앞잘림·응답잘림이 날 여지가 있다.
 *
 * 이 모듈은 **계측 전용**이다 — 어떤 편집 동작도 바꾸지 않는다. 게이트/폴백 결정에 쓰지 않는다.
 *
 * ── 추정 정확도 ────────────────────────────────────────────────────────────
 * 폐쇄망(정확한 토크나이저 없음)이라 chars/토큰 근사를 쓴다. 혼합 한/영 코드는 영문 기준 chars/4보다
 * 토큰이 많다(한글은 글자당 ~1토큰 이상). 그래서 config.promptDiet.adaptiveBudget.charsPerToken(=3)을
 * 그대로 재사용해 **보수적으로(=토큰을 더 많게)** 잡는다 — 예산 계측은 과소추정보다 과대추정이 안전하다.
 *
 * ── 예산 분모 ──────────────────────────────────────────────────────────────
 * 컨텍스트 창은 입력+출력이 한 방을 나눠 쓴다(webview의 computeContextBudget과 동일한 원리). 분모는
 * 전체 창이 아니라 (contextWindow − 출력예약) = 모델이 답할 자리를 남긴 **실사용 입력 예산**이어야 한다.
 */
import { AI_DEFAULTS } from './config';

/** 토큰당 글자 수 — 혼합 한/영 보수적 추정(config와 동일 값). */
export const CHARS_PER_TOKEN = AI_DEFAULTS.promptDiet.adaptiveBudget.charsPerToken;

/** 텍스트의 대략 토큰 수(보수적). 정확한 토크나이저 없이 chars/charsPerToken. */
export function estimateTokens(text: string, charsPerToken: number = CHARS_PER_TOKEN): number {
  return Math.ceil(text.length / Math.max(1, charsPerToken));
}

export interface IPromptBudget {
  /** 모델 전체 컨텍스트 창(=num_ctx). */
  contextWindow: number;
  /** 출력 자리로 예약된 토큰(=max_tokens, 창의 절반으로 클램프). */
  outputReserve: number;
  /** 프롬프트(입력)가 쓸 수 있는 실사용 예산 = contextWindow − outputReserve. */
  usableInput: number;
}

/**
 * 입력(프롬프트) 예산을 계산한다. 기본값은 AI_DEFAULTS(32768 창, 8192 출력예약 → 24576 입력).
 * 사이트별 설정이 다르면 실제 값을 넘겨 그 배포 기준으로 맞춘다.
 */
export function inputBudget(
  contextWindow: number = AI_DEFAULTS.contextWindow,
  outputReserve: number = AI_DEFAULTS.maxTokens,
): IPromptBudget {
  const win = Math.max(0, contextWindow);
  // 출력예약은 [0, 창의 절반]으로 클램프(오설정에서 입력 예산이 음수/0이 되는 것 방지).
  const reserve = Math.max(0, Math.min(outputReserve, Math.floor(win / 2)));
  return { contextWindow: win, outputReserve: reserve, usableInput: Math.max(1, win - reserve) };
}

/** 추정 토큰을 입력 예산 대비 백분율로(100 초과 = 예산 초과 = 앞잘림/응답잘림 위험). 클램프 없음(초과를 보여줘야 함). */
export function budgetUsagePct(tokens: number, budget: IPromptBudget = inputBudget()): number {
  return Math.round((tokens / budget.usableInput) * 100);
}
