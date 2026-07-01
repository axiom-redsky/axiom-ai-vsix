/**
 * 토큰 메터의 분모(단일 진실원).
 *
 * 컨텍스트 윈도우는 입력(프롬프트)과 출력(응답)이 함께 들어가는 한 방이다.
 * 막대가 입력 토큰만 재면서 분모를 전체 윈도우로 잡으면, 막대가 100%에 닿기도 전에
 * "응답이 들어갈 자리 없음" 상태가 되어 모델이 답을 못 하거나 잘린다.
 * 그래서 분모는 (윈도우 − 출력 예약) = 모델이 답할 자리를 남긴 실사용 가능 입력 예산이어야 한다.
 *
 * ── 여러 서버/모델 대응 ────────────────────────────────────────────────
 * contextWindow(=요청의 num_ctx)와 outputReserve(=요청의 max_tokens)는 둘 다 배포별
 * 설정에서 온다. 즉 여기서 상수를 박지 않는 한, SI 현장에서 어떤 모델을 붙이든 그 배포가
 * 실제 요청에 싣는 값 그대로 막대가 맞춰진다. 이 함수는 "우리가 서버에 보내는 숫자"만 쓴다.
 */

/** 출력 예약이 윈도우를 다 먹지 않도록 하는 상한(오설정 방어). */
const MAX_RESERVE_RATIO = 0.5;
/** 예산이 이 아래로 내려가면 표시가 무의미하므로 최소 바닥값. */
const MIN_USABLE_BUDGET = 1;

export interface IContextBudget {
  /** 막대·경고의 분모. (contextWindow − 유효 출력 예약) */
  usableBudget: number;
  /** 실제 적용된 출력 예약(오설정 클램프 후). */
  reserve: number;
  /** 모델 전체 컨텍스트 창(=num_ctx). 툴팁 표기·투명성용. */
  contextWindow: number;
}

/**
 * @param contextWindow 요청에 실은 num_ctx(모델 전체 창)
 * @param outputReserve 요청에 실은 max_tokens(출력 자리). 미보고 시 0으로 폴백(=종전처럼 전체 창).
 */
export function computeContextBudget(contextWindow: number, outputReserve?: number): IContextBudget {
  const win = contextWindow > 0 ? contextWindow : 0;
  // 출력 예약은 [0, 윈도우의 절반] 으로 클램프한다.
  // - max_tokens ≥ 윈도우 같은 오설정에서도 분모가 음수/0이 되지 않게 막고,
  // - 예약이 과도해 입력 예산이 사라지는 것도 방지한다.
  const reserve = Math.max(0, Math.min(outputReserve ?? 0, Math.floor(win * MAX_RESERVE_RATIO)));
  const usableBudget = Math.max(MIN_USABLE_BUDGET, win - reserve);
  return { usableBudget, reserve, contextWindow: win };
}

/** estimatedTokens 를 실사용 예산 대비 백분율(0~100)로 환산. */
export function budgetPct(estimatedTokens: number, budget: IContextBudget): number {
  return Math.min(100, Math.round((estimatedTokens / budget.usableBudget) * 100));
}
