/**
 * AI 관련 기본값 상수.
 * - 이 파일이 단일 source of truth: ExtensionConfig fallback 값과
 *   package.json contributes.configuration default 값을 이 상수와 맞춰 관리한다.
 */
export const AI_DEFAULTS = {
  endpoint: 'https://referral-aerial-than-mathematical.trycloudflare.com',
  apiKey: '',
  /**
   * LLM 백엔드 종류. 요청 경로·바디·thinking 억제 방식이 달라진다.
   * - 'ollama': Ollama 네이티브(/api/chat). thinking은 top-level think:false로만 확실히 꺼진다. (기본)
   *   기본 모델 qwen3-coder가 추론(reasoning) 모델이라 /v1 호환 경로로는 thinking이 안 꺼져 빈 응답이 나기 쉽다.
   *   추론을 확실히 끄는 ollama를 기본으로 둔다. vLLM 등 OpenAI 호환 서버를 쓰면 'openai'로 override.
   * - 'openai': OpenAI 호환(/v1/chat/completions). vLLM·LM Studio·LocalAI 등.
   *   thinking 억제는 injectNoThink(/no_think) + sendThinkingParams(enable_thinking)로 시도.
   */
  provider: 'ollama',
  // 배포 하한 모델. qwen3-coder(코딩 특화, 4bit ~18~20GB → 24GB GPU 1장)을 표준으로. 사이트별 모델은 설정으로 override.
  model: 'qwen3-coder-64k',
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
    /**
     * 시스템 프롬프트에 주입할 RAG 문서 전체 글자 수 상한(ceiling).
     * 4500자 ≈ 1.8K~2K 토큰. 이 값까지 '채우는' 게 아니라, 관련도 하한을 통과한
     * 섹션만 담되 이 상한을 넘지 않게 한다(아래 minRestScore / minEmbedScore 참고).
     */
    charBudget: 4500,
    /**
     * 한 질문에 라우팅을 허용할 최대 문서(source) 수. 토큰-풍부 질문(명세 붙여넣기 등)이
     * _index.md 키워드를 무더기로 매칭시켜 수많은 문서가 'source당 대표 1개'만으로
     * 예산을 꽉 채우는 폭주를 막는다. source별 최고 점수 상위 N개만 남긴다.
     * 0 이하면 제한하지 않는다.
     */
    maxSources: 4,
    /**
     * 라우팅된 문서의 '곁가지' 섹션(대표 섹션 제외)을 컨텍스트에 추가하기 위한
     * 절대 최소 raw(보너스 이전) 쿼리 적합도. 1 = 쿼리 토큰을 최소 1개 이상 실제로 포함.
     * 0으로 두면 종전처럼 예산이 남는 한 무조건 채운다.
     */
    minRestScore: 1,
    /**
     * 곁가지 섹션의 '상대' 하한 비율. 실제 하한 = max(minRestScore, ceil(곁가지 최고점 × 비율)).
     * 토큰-풍부 질문(명세 붙여넣기 등)에서도 핵심 섹션 대비 덜 관련된 곁가지를 적응적으로 떨군다.
     * 0.5 = 최고점의 절반 미만 섹션 탈락. 1에 가까울수록 공격적(경량), 0이면 절대 하한만 사용.
     */
    restScoreRatio: 0.5,
    /**
     * 임베딩 폴백 청크를 추가하기 위한 최소 raw 적합도.
     * _embeddingResultToSections 기본 점수 2 + 토큰 매칭 1점/개 → 3 이상이면
     * 쿼리 토큰을 최소 1개 포함한 청크만 통과(기본 2짜리 노이즈 청크 차단).
     */
    minEmbedScore: 3,
  },
  /**
   * 프롬프트 다이어트 — 질문 의도에 맞지 않는 고정 지시문을 줄여 프롬프트를 경량화한다.
   * 모든 항목은 토글 가능하며, 품질 저하가 감지되면 사이트별로 끌 수 있다.
   */
  promptDiet: {
    /**
     * Q&A(조회·설명형) 질문에서 출력 모드·시나리오 지시문을 생략하고 핵심 규칙만 주입할지 여부.
     * false면 종전처럼 파일 열림 시 항상 시나리오 C 편집 지시문을 주입한다(현행 동작).
     */
    qnaGating: true,
    /**
     * 적응형 RAG 예산 — 규칙·가이드 + 현재 파일이 이미 클 때 RAG 상한(charBudget)을
     * 남은 컨텍스트에 비례해 동적으로 줄여 전체 프롬프트가 무한정 커지지 않게 한다.
     */
    adaptiveBudget: {
      /** 적응형 예산 사용 여부. false면 항상 rag.charBudget 고정 사용(현행 동작). */
      enabled: true,
      /** RAG에 최소한 보장하는 글자 수. 이 아래로는 줄이지 않는다. */
      floorChars: 1800,
      /** 전체 프롬프트 목표 상한 = contextWindow(토큰) × charsPerToken × targetRatio. */
      targetRatio: 0.45,
      /** 토큰당 대략 글자 수(혼합 한/영 보수적 추정). 전체 상한 환산에만 사용. */
      charsPerToken: 3,
    },
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
    /**
     * grounded bounded retry — patch가 not-found/ambiguous로 실패하면, 확장이 실패 search를
     * 실제 파일 위치에 fuzzy 매칭(locateFuzzyRegion)으로 grounding한 뒤, 그 실제 텍스트를
     * 모델에 돌려주어 1회만 재요청한다. 약한 sLLM이 기억으로 재구성한 search가 어긋나
     * dead-end로 떨어지는 빈도를 낮춘다. (무한 루프 방지: 정확히 1회만)
     */
    groundedRetry: true,
    /**
     * locateFuzzyRegion의 토큰 자카드 유사도 임계치(0~1). 최고점이 이 값 미만이거나
     * 유일하지 않으면 grounding을 포기하고 기존 dead-end UI로 폴백한다. 높을수록 보수적.
     */
    fuzzyLocateThreshold: 0.6,
    /**
     * ripple-aware selection guard — 선택 영역 안의 식별자 일괄 치환(rename)이 선택 밖 소비처로
     * 번지는 변경을, "선택 안 rename을 적용한 결과와 글자까지 동일할 때만" 허용한다.
     * (예: 타입 필드 name→employee_name 변경 시 컴포넌트의 member.name→member.employee_name)
     * false면 종전처럼 선택 밖 변경을 무조건 거부한다. rename 추출 실패 시에도 거부(무회귀).
     */
    rippleGuard: true,
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
  /**
   * 디버그용 기본값.
   */
  debug: {
    /**
     * AI 서버로 전송하는 시스템 프롬프트(규칙·가이드 + RAG + 파일) 전문을
     * 'axiom-ai: Prompt' 출력 채널에 기록할지 여부. 기본 off(노이즈·성능).
     */
    logSystemPrompt: false,
  },
} as const;
