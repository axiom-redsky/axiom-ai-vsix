/**
 * AI 관련 기본값 상수.
 * - 이 파일이 단일 source of truth: ExtensionConfig fallback 값과
 *   package.json contributes.configuration default 값을 이 상수와 맞춰 관리한다.
 */
export const AI_DEFAULTS = {
  endpoint: 'https://referral-aerial-than-mathematical.trycloudflare.com',
  apiKey: '',
  model: 'qwen2.5-coder:14b',
  temperature: 0.2,
  maxTokens: 4096,
  corpusPath: './corpus',
  /** 키워드 라우팅 + 파일 컨텍스트 분석 기반 하이브리드 RAG 지식 폴더 */
  ragPath: '.rag',
  maxFileLines: 200,
  rag: {
    /** 로컬 임베딩 모델 (transformers.js, 첫 실행 시 자동 다운로드 후 캐시) */
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    /** 헤더 분할 후 재분할 기준 글자 수 */
    chunkSize: 600,
    /** 슬라이딩 윈도우 오버랩 글자 수 */
    chunkOverlap: 100,
    /** 프롬프트에 삽입할 상위 청크 수 */
    topK: 5,
  },
} as const;
