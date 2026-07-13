/**
 * 임베딩 의미 분류기 — 쿼리와 의도별 라벨 예시의 코사인 유사도로 의도를 분류한다(LLM 불필요).
 *
 * nearest-example 방식: 의도별 **최고 유사도**를 그 의도의 점수로 본다(centroid보다 다양한 표현에 강함).
 * confidence=top1 점수, margin=top1−top2. 호출부(OfflineIntentResolver)가 임계로 게이팅한다.
 *
 * 예시/모델이 없으면 null을 돌려 정규식 폴백으로 안전하게 떨어진다.
 */

import { embed as defaultEmbed } from '../EmbeddingService';
import { cosineSimilarity } from '../VectorMath';
import { IntentExampleStore, type EmbedFn } from './IntentExampleStore';
import { IntentLinearHead } from './IntentLinearHead';
import type { IntentKind } from './IntentClassifier';

/**
 * 헤드 softmax 완화 온도 — 리졸버 중재의 확신 임계(0.42/0.05)가 의미를 갖도록 과신을 완화한다.
 * 너무 낮으면(뾰족) 틀린 픽도 확신해 오커밋, 너무 높으면(평평) 맞는 픽도 되묻기로 샌다. eval:intent로 튜닝.
 */
const HEAD_TEMPERATURE = 0.5;

export interface IntentScore {
  intent: IntentKind;
  score: number;
}

export interface ClassifyResult {
  intent: IntentKind;
  /** top-1 유사도(0~1). */
  confidence: number;
  /** top1 − top2 유사도 차. 클수록 명확. */
  margin: number;
  ranked: IntentScore[];
}

export class IntentEmbeddingClassifier {
  private readonly _head = new IntentLinearHead();
  private _headTried = false;

  constructor(
    private readonly _store: IntentExampleStore,
    private readonly _embed: EmbedFn = defaultEmbed,
  ) {}

  /** 쿼리를 분류한다. 예시/모델 미가용·임베딩 실패 시 null(→ 정규식 폴백). */
  async classify(query: string): Promise<ClassifyResult | null> {
    if (!query || !query.trim()) return null;
    const ready = await this._store.ensureReady();
    if (!ready) return null;

    let qv: number[];
    try {
      qv = await this._embed(query);
    } catch {
      return null;
    }

    // 헤드를 1회 학습(결정론). 코퍼스 임베딩이 준비된 이 시점에 학습한다.
    if (!this._headTried) {
      this._headTried = true;
      try {
        this._head.train(this._store.examples());
      } catch {
        /* 학습 실패 → 아래 1-NN 폴백 */
      }
    }

    // 기본: 학습된 선형 헤드(softmax). 미학습이면 1-NN 코사인으로 폴백.
    const headRanked = this._head.trained ? this._head.predict(qv, HEAD_TEMPERATURE) : null;
    if (headRanked && headRanked.length > 0) {
      const top = headRanked[0];
      const margin = headRanked.length > 1 ? top.score - headRanked[1].score : top.score;
      return { intent: top.intent, confidence: top.score, margin, ranked: headRanked };
    }

    const best = new Map<IntentKind, number>();
    for (const ex of this._store.examples()) {
      const s = cosineSimilarity(qv, ex.embedding);
      const cur = best.get(ex.intent);
      if (cur === undefined || s > cur) best.set(ex.intent, s);
    }
    if (best.size === 0) return null;

    const ranked: IntentScore[] = [...best.entries()]
      .map(([intent, score]) => ({ intent, score }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0];
    const margin = ranked.length > 1 ? top.score - ranked[1].score : top.score;
    return { intent: top.intent, confidence: top.score, margin, ranked };
  }
}
