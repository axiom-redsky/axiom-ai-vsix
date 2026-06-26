/**
 * 오프라인 의도 오케스트레이터 — 임베딩 의미 분류 + 신뢰도 게이팅 + 정규식 폴백을 한데 묶는다.
 *
 * 결정 흐름(임베딩=고recall 의미, 정규식=고precision 신호의 하이브리드):
 *  1. 임베딩 분류기 실행. null(예시/모델 미가용)이면 → 정규식 폴백(종전 동작, 회귀 0).
 *  2. 임베딩이 **확신**(점수≥minConfidence AND 마진≥minMargin) → 그 의도 채택(의미 우선).
 *  3. 임베딩 약하지만 **정규식이 신호 있음**(비-other) → 정규식 채택(결정론 고정밀).
 *     실측: 임베딩이 modify↔create를 "화면/페이지" 표면어로 혼동(저마진)할 때 정규식의 동사
 *     신호("적용·바꿔·만들어")가 정확히 구분한다.
 *  4. 정규식도 침묵(other)인데 임베딩이 그래도 리드(점수≥minConfidence) → 임베딩 채택(recall 보완).
 *  5. 둘 다 약함 → uncertain=true + candidates 반환(되묻기).
 *
 * vscode/디스크 비의존 — 분류는 deps.classify로 주입받아 테스트에서 결정론적으로 검증한다.
 */

import type { IntentResult, IntentContext, IntentKind } from './IntentClassifier';
import { classifyOfflineIntent, fillSlots } from './IntentSignals';
import type { ClassifyResult } from './IntentEmbeddingClassifier';

export interface IOfflineIntentDeps {
  /** 임베딩 분류 결과(또는 null = 폴백). */
  classify: (query: string) => Promise<ClassifyResult | null>;
}

export interface IOfflineIntentThresholds {
  enabled: boolean;
  minConfidence: number;
  minMargin: number;
}

export interface OfflineIntentResolution {
  result: IntentResult;
  /** true면 호출부가 단정하지 말고 되묻는다. */
  uncertain: boolean;
  /** 되묻기 후보 의도(uncertain일 때만 채움). */
  candidates: IntentKind[];
  source: 'embedding' | 'regex';
  confidence?: number;
  margin?: number;
  /**
   * 되묻기 종류 — 호출부가 상황에 맞는 안내 문구를 고르는 데 쓴다(uncertain일 때만 의미 있음).
   *  - `'ambiguous'`: 임베딩·정규식 둘 다 약해 의도 자체가 흐릿함(기본 되묻기).
   *  - `'smalltalk-vs-actionable'`: 임베딩이 확신을 갖고 **잡담**이라 했지만 정규식은 **실행형
   *    의도**(질문·수정·생성)로 본 모순 — 약한 임베딩이 짧은 기술 구절을 잡담으로 오인한 정황.
   */
  clarifyKind?: 'ambiguous' | 'smalltalk-vs-actionable';
}

/** 정규식이 잡은 의도가 **실행형**(잡담·기타가 아닌 질문/수정/생성)인지. */
function isActionableIntent(intent: IntentKind): boolean {
  return intent === 'qna' || intent === 'modify_file' || intent === 'create_page';
}

export async function resolveOfflineIntent(
  query: string,
  ctx: IntentContext,
  deps: IOfflineIntentDeps,
  cfg: IOfflineIntentThresholds,
): Promise<OfflineIntentResolution> {
  // 정규식 베이스라인(항상 확보 — 폴백·교차검증용).
  const regex = classifyOfflineIntent(query, ctx);

  if (!cfg.enabled) {
    return { result: regex, uncertain: false, candidates: [], source: 'regex' };
  }

  let cls: ClassifyResult | null = null;
  try {
    cls = await deps.classify(query);
  } catch {
    cls = null;
  }
  if (!cls) {
    return { result: regex, uncertain: false, candidates: [], source: 'regex' };
  }

  // 헤드(임베딩) 확신 여부 — 점수·마진 둘 다 임계 이상.
  const headConfident = cls.confidence >= cfg.minConfidence && cls.margin >= cfg.minMargin;

  // ── 합의 → 채택(가장 신뢰: 의미 분류기와 결정론 신호가 같은 답) ──
  if (cls.intent === regex.intent) {
    return {
      result: fillSlots(query, ctx, cls.intent),
      uncertain: false, candidates: [], source: 'embedding',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // ── 불일치 중재(arbitration) — 정규식 strength로 "누구를 믿을지" 판단 ──

  // (0) smalltalk 안전장치: 헤드가 **확신을 갖고 smalltalk**인데 정규식은 실행형(질문/수정/생성)이면,
  //     약한 다국어 임베딩이 짧은 기술 구절을 잡담으로 오인한 정황. 단정 말고 되묻는다.
  if (headConfident && cls.intent === 'smalltalk' && isActionableIntent(regex.intent)) {
    return {
      result: regex, uncertain: true,
      candidates: [regex.intent, 'smalltalk'],
      source: 'embedding',
      confidence: cls.confidence, margin: cls.margin,
      clarifyKind: 'smalltalk-vs-actionable',
    };
  }

  // (1) create→modify 보정(결정론 가드 유지): 헤드는 create지만 자기 2순위가 modify이고, 현재 파일이
  //     열려 있고(수정 맥락 성립), 정규식도 modify로 본다 → create↔modify 흔들림. modify를 신뢰한다.
  if (
    cls.intent === 'create_page' &&
    regex.intent === 'modify_file' &&
    !!ctx.currentFile &&
    cls.ranked[1]?.intent === 'modify_file'
  ) {
    return {
      result: regex, uncertain: false, candidates: [], source: 'regex',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // (2) 정규식이 **고정밀(strong)** 신호 → 정규식 우선. 명시적 키워드로 강하게 잡았을 때만 헤드를 덮는다.
  //     (예전 step-3는 strength 무시하고 정규식이 뭐라도 말하면 덮어, 롱테일에서 정규식의 **약한 추측**이
  //      헤드의 맞는 의미 판정을 가로채던 게 핵심 회귀였다 → strong일 때로 좁힌다.)
  if (regex.strength === 'strong') {
    return {
      result: regex, uncertain: false, candidates: [], source: 'regex',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // (3) 정규식이 약함(weak/none) → 헤드가 확신이면 헤드 채택. 정규식의 약한 추측보다 의미 분류기를
  //     믿는다(롱테일 강건성의 핵심 — 새로운 말투는 정규식이 못 잡고 헤드가 이해한다).
  if (headConfident) {
    return {
      result: fillSlots(query, ctx, cls.intent),
      uncertain: false, candidates: [], source: 'embedding',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // (4) 둘 다 약함(헤드 비확신 + 정규식 weak/none) → 단정 말고 되묻기. 후보 = 헤드 top-2(+정규식).
  const candidates = [
    cls.ranked[0]?.intent,
    cls.ranked[1]?.intent,
    regex.intent !== 'other' ? regex.intent : undefined,
  ].filter((v, i, a): v is IntentKind => !!v && a.indexOf(v) === i);

  return {
    result: fillSlots(query, ctx, cls.intent),
    uncertain: candidates.length > 1, candidates,
    source: 'embedding',
    confidence: cls.confidence, margin: cls.margin,
    clarifyKind: 'ambiguous',
  };
}
