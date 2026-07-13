/**
 * 의도 선형 분류 헤드 — 코퍼스 임베딩 위에 학습한 다항 로지스틱 회귀(softmax).
 *
 * 동기: 1-NN("가장 가까운 예시 1개")은 margin이 얇아(새 말투에서 0.00~0.02) 리졸버 중재가 확신을
 * 못 내리고 되묻기로 빠진다. 같은 임베딩 위에 **학습된 결정경계**를 얹으면(레버1) 새 말투(롱테일)에서
 * 의미 있는 margin과 더 높은 정확도(격리 측정 81%)를 준다. 추가 모델·다운로드 없이 K×D 가중치(≈KB)만
 * 더하며, 추론은 점곱 몇 번(마이크로초)이라 LLM 같은 리소스 부담이 없다.
 *
 * 학습은 **결정론적**(0 초기화·고정 epoch/lr/lambda·풀배치 GD)이라 같은 코퍼스 → 같은 가중치다.
 * 예시 부족·차원 불일치 시 미학습 상태로 두어 호출부가 안전하게 1-NN으로 폴백하게 한다.
 */

import type { IntentExample } from './IntentExampleStore';
import type { IntentKind } from './IntentClassifier';

export interface HeadScore {
  intent: IntentKind;
  /** temperature-scaled softmax 확률(0~1). */
  score: number;
}

export interface ITrainOpts {
  lr?: number;
  epochs?: number;
  lambda?: number;
}

function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export class IntentLinearHead {
  private _classes: IntentKind[] = [];
  private _W: number[][] = [];
  private _b: number[] = [];
  private _dim = 0;
  private _trained = false;

  get trained(): boolean {
    return this._trained;
  }

  /**
   * 코퍼스 예시로 헤드를 학습한다. 클래스가 2개 미만이거나 예시가 부족하면 false(미학습 유지).
   * 임베딩은 단위 정규화 후 학습한다(코사인 기하).
   */
  train(examples: IntentExample[], opts: ITrainOpts = {}): boolean {
    const lr = opts.lr ?? 0.5;
    const epochs = opts.epochs ?? 800;
    const lambda = opts.lambda ?? 1e-3;
    if (examples.length < 2) return false;
    const classes = [...new Set(examples.map((e) => e.intent))].sort();
    if (classes.length < 2) return false;
    const D = examples[0].embedding.length;
    if (!D) return false;
    const cidx = new Map(classes.map((c, i) => [c, i]));
    const X = examples.map((e) => normalize(e.embedding));
    const y = examples.map((e) => cidx.get(e.intent)!);
    const K = classes.length;
    const N = X.length;
    const W = Array.from({ length: K }, () => new Array<number>(D).fill(0));
    const b = new Array<number>(K).fill(0);

    for (let ep = 0; ep < epochs; ep++) {
      const gW = Array.from({ length: K }, () => new Array<number>(D).fill(0));
      const gb = new Array<number>(K).fill(0);
      for (let i = 0; i < N; i++) {
        const xi = X[i];
        const logit = new Array<number>(K);
        let mx = -Infinity;
        for (let k = 0; k < K; k++) {
          logit[k] = dot(W[k], xi) + b[k];
          if (logit[k] > mx) mx = logit[k];
        }
        let Z = 0;
        for (let k = 0; k < K; k++) {
          logit[k] = Math.exp(logit[k] - mx);
          Z += logit[k];
        }
        for (let k = 0; k < K; k++) {
          const p = logit[k] / Z - (y[i] === k ? 1 : 0);
          const gWk = gW[k];
          for (let d = 0; d < D; d++) gWk[d] += p * xi[d];
          gb[k] += p;
        }
      }
      for (let k = 0; k < K; k++) {
        const wk = W[k];
        const gwk = gW[k];
        for (let d = 0; d < D; d++) wk[d] -= lr * (gwk[d] / N + lambda * wk[d]);
        b[k] -= lr * (gb[k] / N);
      }
    }

    this._classes = classes;
    this._W = W;
    this._b = b;
    this._dim = D;
    this._trained = true;
    return true;
  }

  /**
   * temperature-scaled softmax 확률을 내림차순으로 반환한다. 미학습·차원 불일치 시 null(→ 폴백).
   * temperature>1이면 확률을 덜 뾰족하게 만들어(과신 완화) 리졸버 게이팅 임계가 의미를 갖게 한다.
   */
  predict(vec: number[], temperature = 1): HeadScore[] | null {
    if (!this._trained || vec.length !== this._dim) return null;
    const x = normalize(vec);
    const T = temperature > 0 ? temperature : 1;
    const logit = this._classes.map((_, k) => (dot(this._W[k], x) + this._b[k]) / T);
    const mx = Math.max(...logit);
    const exps = logit.map((l) => Math.exp(l - mx));
    const Z = exps.reduce((a, c) => a + c, 0) || 1;
    return this._classes
      .map((intent, k) => ({ intent, score: exps[k] / Z }))
      .sort((a, b) => b.score - a.score);
  }
}
