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
  maxTokens: 8192,
  /** 모델 컨텍스트 윈도우(토큰). 사이트별로 다른 모델이 들어오므로 설정으로 override 가능. */
  contextWindow: 32_768,
  /**
   * thinking(추론) 모드 억제 기본값. Qwen3 계열 기준 둘 다 켜둔다.
   * 사이트 투입 시 모델/게이트웨이에 맞춰 override 한다.
   */
  injectNoThink: true,
  sendThinkingParams: true,
  /** scaffold 컨벤션·패턴·문서 통합 지식 폴더 (.rag/ + corpus/ 통합) */
  knowledgePath: 'knowledge',
  maxFileLines: 200,
  rag: {
    /** 로컬 임베딩 모델 (transformers.js, 첫 실행 시 자동 다운로드 후 캐시) */
    // embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    embeddingModel: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    /** 헤더 분할 후 재분할 기준 글자 수 */
    chunkSize: 600,
    /** 슬라이딩 윈도우 오버랩 글자 수 */
    chunkOverlap: 100,
    /** 프롬프트에 삽입할 상위 청크 수 */
    topK: 5,
  },
  /**
   * 다중 patch (한 응답에 여러 <patch> 블록) 지원 기본값.
   * 모델 역량에 따라 사이트별 설정으로 override 한다.
   */
  multiPatch: {
    /** 다중 patch 출력을 허용할지 여부. false면 모델에 단일 patch만 안내한다. */
    enabled: true,
    /** 한 응답에 허용할 최대 <patch> 블록 수. qwen-35B 기준 3, 상위 모델은 6~8 권장. */
    maxPatches: 3,
    /** <search> 블록 작성 시 권장하는 전후 맥락 라인 수 */
    minContextLines: 3,
  },
  /**
   * 라인 앵커(diff) 출력 모드 기본값. 바뀐 줄만 라인번호로 지정해 출력 토큰을 줄인다.
   * 사이트별 모델 역량에 따라 설정으로 override 한다.
   */
  lineEdit: {
    /** lines 모드를 모델에 안내할지 여부. false면 기존 patch/structural/full만 사용. */
    enabled: true,
    /**
     * 각 edit에 원본 첫 줄 텍스트(anchor)를 동봉시켜 적용 전 검증할지 여부.
     * true: 라인번호 드리프트를 anchor로 자동 보정 + 조용한 오적용 차단(정확성 우선).
     * false: 순수 라인 앵커(출력 최소, 검증 없음 — 상위 모델에서만 권장).
     */
    requireAnchor: true,
    /** anchor 불일치 시 기준 라인 주변 ±N줄까지 탐색해 라인번호를 자동 보정한다. */
    anchorSearchRadius: 3,
  },
} as const;
