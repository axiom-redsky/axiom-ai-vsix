/**
 * 임베딩 벡터 수학 유틸 — RagRetriever와 IntentEmbeddingClassifier가 공유한다.
 * vscode/디스크 비의존(순수 함수).
 */

/** 코사인 유사도. 분모 0 방지용 epsilon 포함. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
