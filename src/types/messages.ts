// 프로젝트 설정 (SI 프로젝트 투입 시 작성, .axiom/knowledge/project-config.md 로 저장)
export interface ProjectConfig {
  projectName: string;
  designGuideUrl: string;
  publisherConventions: string;
  layoutPatterns: {
    listPage: string;
    detailPage: string;
    formPage: string;
  };
  notes: string;
}

// 설정 데이터 구조 (웹뷰 ↔ extension host 공유)
export interface AxiomSettings {
  llm: {
    endpoint: string;
    model: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
    /** 토큰 메터 분모(전체 컨텍스트 한도). 서버 한도가 아니라 표시·히스토리 트리밍 기준. */
    contextWindow: number;
    /** LLM 백엔드 종류. 연결 테스트의 자동 정렬과 동일 값. (옵셔널: 기존 메시지 하위호환) */
    provider?: 'openai' | 'ollama';
  };
  rag: {
    userRagFolder: string;
    additionalFiles: string[];
  };
  /**
   * 프로젝트 단위 설정(`<axiomFolder>/axiom.config.json`에 저장). 옵셔널 — 미존재 시 기존 동작.
   * axiomFolder만 부트스트랩이라 전역 settings.json에 저장된다.
   */
  project?: {
    /** .axiom 폴더 경로(SDD/통합설정 저장소). 전역 settings.json(axiom-ai.sdd.axiomFolder)에 저장. */
    axiomFolder: string;
    /** 실험: 영역(region/hybrid) 편집. */
    regionEdit: boolean;
    /** 실험: 조립 바인딩(compose) — API→테이블 결정론 조립. */
    composeBinding: boolean;
    /** 실험: 영역 편집 검증-교정 루프(Stage 0). */
    regionVerify: boolean;
    /** 실험: 앵커-우선 편집(Stage 1). */
    anchorFirstEdit: boolean;
    /** 실험: patch-우선 편집(경로 수렴) — in-place 수정에 patch를 주력 제시. */
    patchFirstEdit: boolean;
    /** 실험: 의도 분류기. */
    intentClassifier: boolean;
    /** 실험: 페이지 본문 LLM 생성 모드. */
    pageCreationLlmMode: boolean;
    /** 디버그: 시스템 프롬프트 전문을 출력 채널에 기록. */
    logSystemPrompt: boolean;
  };
  /**
   * 고급 튜닝 설정. 대부분 프로젝트 파일(axiom.config.json)에 저장되며,
   * thinking(injectNoThink/sendThinkingParams)만 머신 단위(전역 settings.json)다. 옵셔널 — 하위호환.
   */
  advanced?: {
    // 프롬프트 다이어트
    promptDietQnaGating: boolean;
    adaptiveBudgetEnabled: boolean;
    adaptiveBudgetFloorChars: number;
    adaptiveBudgetTargetRatio: number;
    adaptiveBudgetCharsPerToken: number;
    // 다중 patch
    multiPatchEnabled: boolean;
    multiPatchMaxPatches: number;
    multiPatchMinContextLines: number;
    multiPatchGroundedRetry: boolean;
    multiPatchFuzzyLocateThreshold: number;
    multiPatchRippleGuard: boolean;
    multiPatchAutoFullFallback: boolean;
    // 라인 편집
    lineEditEnabled: boolean;
    lineEditRequireAnchor: boolean;
    lineEditAnchorSearchRadius: number;
    // 시나리오 C
    scenarioCCompactModes: boolean;
    // Q&A 반복 억제
    qnaAntiRepeatEnabled: boolean;
    qnaAntiRepeatRepeatPenalty: number;
    qnaAntiRepeatFrequencyPenalty: number;
    qnaAntiRepeatPresencePenalty: number;
    // thinking (머신 단위 — 전역 settings.json)
    injectNoThink: boolean;
    sendThinkingParams: boolean;
    // 기타
    offlineFallback: boolean;
    requireComplianceTags: boolean;
    userStubsFolder: string;
    externalCorpusEnabled: boolean;
    validateExternalCorpus: boolean;
  };
}

// 페이지 생성 대화 상태 머신 (ChatViewProvider 내부)
export interface PageCreationState {
  /** 생성할 페이지명 (PascalCase + Page) */
  pageName: string;
  /** 도메인 후보 목록 (탐색기 스캔 결과) */
  domainCandidates: string[];
  /** 사용자 페이지 영문명 입력 대기 중 여부 (한국어 이름 요청 시 이름 되묻기 단계) */
  waitingForName?: boolean;
  /** 사용자 도메인 선택 대기 중 여부 */
  waitingForDomain: boolean;
  /** 확정된 도메인 */
  resolvedDomain: string | null;
  /** 동일 페이지 파일이 이미 존재해 덮어쓰기/다른이름/취소 응답 대기 중 여부 (충돌 안전망) */
  waitingForCollision?: boolean;
  /** 쿼리에 도메인이 명시된 경우("example 도메인에") 그 값. 이름 되묻기 라운드트립을 넘겨 유지한다. */
  explicitDomain?: string | null;
}

// /spec wizard 상태 머신 (ChatViewProvider 내부 + 웹뷰 상태 표시용)
export interface SpecWizardState {
  step: 'intent' | 'domain' | 'acceptance' | 'api' | 'exceptions' | 'review';
  partial: {
    domain?: string;
    screen?: string;
    intent?: string;
  };
  collectedSections: Record<string, string>;
}

// WebView → Extension Host
export type WebviewToHostMessage =
  | { type: 'sendMessage'; text: string; selection?: { filePath: string; startLine: number; endLine: number } }
  | { type: 'stopMessage' }
  | { type: 'clearHistory' }
  | { type: 'ready' }
  | { type: 'openChat' }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: Partial<AxiomSettings> }
  | { type: 'pickRagFile' }
  | { type: 'pickRagFolder' }
  | { type: 'removeRagFile'; filePath: string }
  | { type: 'clearRagFolder' }
  | { type: 'openRagGuide' }
  | { type: 'createRagTemplate' }
  | { type: 'loadProjectConfig' }
  | { type: 'saveProjectConfig'; config: ProjectConfig }
  | { type: 'testConnection'; llm: AxiomSettings['llm'] }
  | { type: 'pickReferenceFile' }
  | { type: 'fileConfirmApprove'; actionId: string }
  | { type: 'fileConfirmReject'; actionId: string }
  | { type: 'patchRetryFull'; recoveryId: string }
  | { type: 'patchRetryCancel'; recoveryId: string }
  | { type: 'probePickFile' }
  | { type: 'probeUseActiveFile' }
  | { type: 'runProbe'; filePath: string; query: string; budget: number; mode: ProbeMode }
  | { type: 'regionIoPickFile' }
  | { type: 'regionIoUseActiveFile' }
  | { type: 'runRegionIo'; filePath: string; query: string }
  | { type: 'intentProbeUseActiveFile' }
  | { type: 'runIntentProbe'; query: string; currentFile: string; hasSelection: boolean };

/** 슬라이싱 실험 모드: 통째로 / 잘라서 / 둘 다 / 도구 호출(CC식) / 영역 편집(grep→블록 재작성+위치 교체) */
export type ProbeMode = 'full' | 'sliced' | 'both' | 'tool' | 'region' | 'hybrid';

export interface DiffLine {
  type: 'ctx' | 'add' | 'del' | 'sep';
  oldNo?: number;
  newNo?: number;
  content: string;
}

// Extension Host → WebView
export type HostToWebviewMessage =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string }
  // 처리 단계(마일스톤) — "생각 중" 인디케이터에 체크리스트처럼 누적 표시된다(status 한 줄과 별개 채널).
  | { type: 'progress'; label: string }
  | { type: 'selectionContext'; filePath: string; startLine: number; endLine: number; selectedText: string }
  | { type: 'referenceAttached'; text: string }
  | { type: 'fileCreated'; filePath: string }
  | { type: 'fileUpdated'; filePath: string; diff?: DiffLine[] }
  | { type: 'fileError'; message: string }
  | { type: 'fileCancelled' }
  | { type: 'patchFailed'; recoveryId: string; filePath: string; searchPreview: string; failureKind?: 'patch-mismatch' | 'react-violation' }
  | { type: 'fileConfirmRequest'; actionId: string; filePath: string; diff: DiffLine[]; generatedCode: string }
  | { type: 'settingsLoaded'; settings: AxiomSettings }
  | { type: 'ragFileAdded'; filePath: string }
  | { type: 'ragFileRemoved'; filePath: string }
  | { type: 'ragFolderSet'; folderPath: string }
  | { type: 'projectConfigLoaded'; config: ProjectConfig | null }
  | { type: 'projectConfigSaved' }
  | { type: 'wizardStep'; step: SpecWizardState['step']; prompt: string }
  | { type: 'connectionTestResult'; ok: boolean; endpoint: string; detail: string }
  // outputReserve = 이 턴 요청에 실은 max_tokens(출력 자리). 토큰 메터 분모는 contextWindow가 아니라
  // (contextWindow − outputReserve) = "모델이 답할 자리를 남긴 실사용 가능 입력 예산"이어야 한다.
  // localKnowledge=true: 서버는 온라인이지만 이 턴은 로컬 지식 문서를 결정론적으로 전문 렌더해
  // LLM을 호출하지 않은 "토큰 미사용" 턴(온라인 지식 가이드). offline과 동일하게 메터를 비활성화하되
  // 라벨은 "오프라인"이 아니라 "로컬 지식"으로 표기해 연결 상태 오해를 막는다.
  | { type: 'contextInfo'; systemPromptChars: number; breakdown?: ContextBreakdown; contextWindow: number; outputReserve?: number; offline?: boolean; localKnowledge?: boolean }
  // 이번 턴은 "정독용"(scaffold 지식·가이드 전문 렌더)임을 알린다 — webview는 답변 바닥을 쫓지 않고
  // 이번 질문을 뷰포트 맨 위에 고정해 위→아래로 읽게 한다. 온라인/오프라인 무관하며 토큰 메터와 별개다.
  | { type: 'pinQuestion' }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number; totalTokens?: number; contextWindow: number; outputReserve?: number }
  | { type: 'probeFilePicked'; filePath: string }
  | {
      type: 'probeViews';
      filePath: string;
      query: string;
      original: { chars: number; lines: number };
      sliced: { chars: number; includedCount: number; skippedCount: number; text: string };
      fullText: string;
    }
  | { type: 'probeOutput'; variant: 'full' | 'sliced' | 'tool' | 'region' | 'hybrid'; status: 'ok' | 'error'; content: string; promptChars: number }
  | { type: 'probeDone' }
  | { type: 'probeError'; message: string }
  | { type: 'regionIoFilePicked'; filePath: string }
  | { type: 'regionIoInput'; input: RegionIoInput }
  | { type: 'regionIoOutput'; output: RegionIoOutput }
  | { type: 'regionIoDone' }
  | { type: 'regionIoError'; message: string }
  | { type: 'intentProbeFilePicked'; filePath: string }
  | { type: 'intentProbeResult'; result: IntentProbeResult }
  | { type: 'intentProbeDone' }
  | { type: 'intentProbeError'; message: string };

/**
 * 단계별 테스트 ①의도파악의 의도 판정 한 건 — IntentResult(src/ai/intent)와 구조 호환이지만
 * 웹뷰 타입 계층이 ai 계층에 의존하지 않도록 여기 슬림 셰이프로 둔다.
 */
export interface IntentProbeIntent {
  intent: string;
  pageName: string | null;
  domain: string | null;
  contentSource: string | null;
  targetFile: string | null;
  targetComponent: string | null;
}

/** 단계별 테스트 ①의도파악 — 프로브 1회 실행 결과. IntentProbePanel 전용. */
export interface IntentProbeResult {
  query: string;
  /** 판정에 쓰인 컨텍스트(운영 IntentContext와 동일 재료). */
  ctx: { currentFile: string | null; hasSelection: boolean; domains: string[] };
  /** 모델에 실제 전송된 분류 프롬프트(buildIntentPrompt 결과 그대로). */
  prompt: string;
  /** 모델 분류기 경로. offline=서버 연결 안 됨(운영에선 정규식 폴백과 동일 상황). */
  model: {
    status: 'ok' | 'offline' | 'parse-fail' | 'error';
    raw: string;
    elapsedMs: number;
    result: IntentProbeIntent | null;
    error?: string;
  };
  /** 정규식 통합 폴백(classifyOfflineIntent) 경로 — 항상 나온다. */
  offline: { strength: string; result: IntentProbeIntent };
  /** 운영 라우팅이 채택하는 최종 판정(S1 effectiveIntent와 동일 규칙). */
  effective: { source: 'classifier' | 'regex'; intent: string };
  /** 모델 vs 정규식 비교 — intent가 갈라지면 S1 불일치 수집 대상. */
  agreement: { comparable: boolean; intentMatch: boolean; notes: string[] };
}

/** 영역(하이브리드) 편집의 "분리된 입력" — 모델에 보내기 전 단계. RegionIoProbeProvider 전용. */
export interface RegionIoInput {
  filePath: string;
  query: string;
  sourceChars: number;
  /** 위치결정 안전 게이트 — ok=false면 운영에선 full로 폴백(모델 미호출). */
  safety: { ok: boolean; gate: string; reason: string };
  /** grep 위치결정 요약. */
  locate: { bestLine: number; bestScore: number; matched: string[]; startLine: number; endLine: number };
  /** 영역별로 분리된 입력 조각(실제 buildHybridPrompt에 들어가는 재료). */
  sections: {
    region: string;
    depsHeader: string;
    backingDecls: string;
    referencedSpec: string;
    /** region 밖 기존 입력 컨트롤 인벤토리(B) — 재생성 금지 컨텍스트. */
    controlInventory: string;
  };
  /** 실제 모델에 보낸 분리 입력(system) 전체 — 본체 buildHybridPrompt 결과 그대로. */
  systemPrompt: string;
  systemPromptChars: number;
  /** 입력(다이어트) 품질 채점 — analyzeInputQuality 결과(모델 무관, axiom 입력구성 책임 구간). */
  quality: {
    adequate: boolean;
    /** 입력/원본 문자수 비율(낮을수록 공격적 다이어트). */
    dietRatio: number;
    flags: { code: string; severity: 'high' | 'medium' | 'info'; message: string }[];
  };
}

/** 영역(하이브리드) 편집의 "출력 결과물" — 모델 원시 출력 + 영역별 파싱. */
export interface RegionIoOutput {
  status: 'ok' | 'error';
  error?: string;
  /** 모델 원시 출력 전체. */
  rawOutput: string;
  /** 원시 출력에서 파싱한 영역별 조각. */
  parsed: {
    regionFound: boolean;
    region: string;
    hooks: string[];
    imports: { module: string; named?: string[]; def?: string }[];
    /** <replace anchor=…> 블록(C) — 기존 문장 교체 채널. */
    replaces: { anchor: string; replacement: string }[];
  };
}

/** 시스템 프롬프트 구성 요소별 글자 수. UI 브레이크다운 표시용. */
export interface ContextBreakdown {
  rulesChars: number;
  fileChars: number;
  ragChars: number;
  sddChars: number;
  domainChars: number;
}
