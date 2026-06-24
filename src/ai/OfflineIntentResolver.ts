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

  // 2. 임베딩 확신 → 의미 우선.
  const embConfident = cls.confidence >= cfg.minConfidence && cls.margin >= cfg.minMargin;
  if (embConfident) {
    // 단, 임베딩이 **확신을 갖고 smalltalk**이라 했는데 정규식은 **실행형 의도**(질문/수정/생성)로
    // 보면, 약한 다국어 임베딩이 짧은 기술 구절을 잡담으로 오인했을 공산이 크다(예: "api 호출 방법"이
    // 짧은 잡담 발화와 표면적으로 비슷해 smalltalk 1등). 잡담으로 단정하면 사용자의 진짜 질문이
    // 조용히 버려지므로(지식 검색을 건너뜀), 단정 대신 되묻는다. 진짜 인사("안녕")는 정규식도
    // smalltalk이라 이 가지에 걸리지 않는다(되묻기 없이 종전대로 잡담 응답).
    if (cls.intent === 'smalltalk' && isActionableIntent(regex.intent)) {
      return {
        result: regex,
        uncertain: true,
        candidates: [regex.intent, 'smalltalk'],
        source: 'embedding',
        confidence: cls.confidence, margin: cls.margin,
        clarifyKind: 'smalltalk-vs-actionable',
      };
    }
    return {
      result: fillSlots(query, ctx, cls.intent),
      uncertain: false, candidates: [], source: 'embedding',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // 3. 임베딩 약함 + 정규식 신호 있음(비-other) → 정규식 고정밀 신호 채택.
  if (regex.intent !== 'other') {
    return {
      result: regex, uncertain: false, candidates: [], source: 'regex',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // 4. 정규식 침묵(other)이지만 임베딩이 리드(점수≥minConfidence) → 임베딩 채택(recall 보완).
  if (cls.confidence >= cfg.minConfidence) {
    return {
      result: fillSlots(query, ctx, cls.intent),
      uncertain: false, candidates: [], source: 'embedding',
      confidence: cls.confidence, margin: cls.margin,
    };
  }

  // 5. 둘 다 약함 → 되묻기. 후보 = 임베딩 top-2(+정규식 의도, 중복 제거).
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
