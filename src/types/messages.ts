import type { ITocManifest, TGuideSource } from './guide';

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
    /** .axiom 폴더 경로(통합설정·knowledge 저장소). 전역 settings.json(axiom-ai.sdd.axiomFolder)에 저장. */
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

// ── 오프라인 행동 카드(계획 카드) — ChatViewProvider ↔ 채팅 webview 슬림 뷰 셰이프 ──
// (웹뷰 타입 계층이 ai 계층(IActionCard 등)에 의존하지 않도록 여기 별도 정의)

export interface ActionCardSlotView {
  name: string;
  label: string;
  /** 프리필/편집된 값. null이면 미정 — 칩이 "선택"으로 표시되고 실행 시 되묻는다. */
  value: string | null;
  /**
   * true면 웹뷰가 카드 안에서 바로 편집한다(창 전환 없음). false면 칩 클릭이 호스트의
   * QuickPick으로 위임된다 — 항목이 많아 검색이 필요한 목록(컴포넌트 53종 등)이 그 경우.
   * 정책 판단은 호스트가 하고 웹뷰는 이 플래그만 따른다.
   */
  inline: boolean;
  /** 인라인 편집 시 고를 후보. 비어 있으면 자유 입력 전용. */
  options?: string[];
  /** true면 후보에 없는 값도 직접 입력할 수 있다(예: 새 도메인). */
  allowCustom?: boolean;
  /** 자유 입력 칸의 placeholder. */
  placeholder?: string;
  /** 자유 입력 검증 정규식(source 문자열). 호스트가 소유하는 규칙을 그대로 내려보낸다. */
  pattern?: string;
  /** 검증 실패 시 보여줄 안내. */
  patternHint?: string;
}

export interface ActionCardOutputView {
  /** create = `+ 신규` / modify = `± 수정` 행. */
  kind: 'create' | 'modify';
  /** 슬롯 값이 치환된 표시용 경로(미정 슬롯은 {{name}} 그대로). */
  path: string;
  note?: string;
}

export interface ActionCardView {
  cardId: string;
  icon: string;
  title: string;
  actionType: 'template' | 'recipe' | 'doc' | 'command';
  description: string;
  /** 사용자 문장에서 실제로 맞은 트리거 — 근거 하이라이트 표시용. */
  matchedTriggers: string[];
  slots: ActionCardSlotView[];
  /** template: "만들어질 것" 미리보기 행들. */
  outputs: ActionCardOutputView[];
  /** recipe: 삽입될 골격(기본 접힘 렌더). */
  skeleton?: string;
  /** 실행 버튼 라벨(유형별: 이대로 만들기/골격 보기/문서 보기/위저드 열기). */
  executeLabel: string;
}

export interface ActionCardsPayload {
  /** 이 추천 턴의 상태 키 — 칩 편집·실행 라운드트립에 사용. */
  requestId: string;
  /** plan = 계획 카드 1장(확신 높음) / list = 컴팩트 리스트(애매). */
  mode: 'plan' | 'list';
  query: string;
  /**
   * 리스트 위에 보여줄 안내 — 매칭 없이 카탈로그 안전망으로 뜬 경우 그 사실을 밝힌다.
   * "왜 이게 떴는지"를 숨기지 않기 위한 것(§3.6 원칙 3 — 근거를 보여줘라).
   */
  note?: string;
  /** 점수순. mode='plan'이면 [0]이 계획 카드, 나머지는 "다른 작업 ▾" 뒤에. */
  cards: ActionCardView[];
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
  | { type: 'runIntentProbe'; query: string; currentFile: string; hasSelection: boolean }
  | { type: 'decomposeProbeUseActiveFile' }
  | { type: 'runDecomposeProbe'; query: string; filePath: string; budget: number; selStart: number; selEnd: number; refPath: string }
  | { type: 'locateProbeUseActiveFile' }
  | { type: 'runLocateProbe'; query: string; filePath: string; forcedStart: number; forcedEnd: number }
  | { type: 'contractsProbeUseActiveFile' }
  | { type: 'runContractsProbe'; query: string; filePath: string; selStart: number; selEnd: number }
  // 오프라인 행동 카드: 칩 클릭(호스트 QuickPick 위임) / 카드 안 인라인 편집 결과 / 실행 버튼
  | { type: 'actionCardChip'; requestId: string; cardId: string; slotName: string }
  | { type: 'actionCardSlotSet'; requestId: string; cardId: string; slotName: string; value: string }
  | { type: 'actionCardExecute'; requestId: string; cardId: string }
  | { type: 'openGuide' }
  | { type: 'guideReady' }
  | { type: 'guideLoadDoc'; docId: string; anchor?: string }
  | { type: 'guideEditDoc'; docId: string }
  | { type: 'guideCreateDoc' }
  | { type: 'guideOpenExternal'; url: string };

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
  // 오프라인 행동 카드: 추천 렌더 / 칩 편집 후 슬롯 상태 갱신(경로 미리보기 재치환 포함)
  | { type: 'actionCards'; payload: ActionCardsPayload }
  | { type: 'actionCardSlots'; requestId: string; cardId: string; slots: ActionCardSlotView[]; outputs: ActionCardOutputView[] }
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
  | { type: 'intentProbeError'; message: string }
  | { type: 'decomposeProbeFilePicked'; filePath: string }
  | { type: 'decomposeProbeResult'; result: DecomposeProbeResult }
  | { type: 'decomposeProbeDone' }
  | { type: 'decomposeProbeError'; message: string }
  | { type: 'locateProbeFilePicked'; filePath: string }
  | { type: 'locateProbeResult'; result: LocateProbeResult }
  | { type: 'locateProbeDone' }
  | { type: 'locateProbeError'; message: string }
  | { type: 'contractsProbeFilePicked'; filePath: string }
  | { type: 'contractsProbeResult'; result: ContractsProbeResult }
  | { type: 'contractsProbeDone' }
  | { type: 'contractsProbeError'; message: string }
  // 내장 개발 가이드(GuidePanel ↔ GuideApp). rootUri = 이미지 상대경로 해석의 베이스(asWebviewUri 문자열).
  | { type: 'guideToc'; toc: ITocManifest; titles: Record<string, string>; source: TGuideSource; rootUri: string; initialDocId?: string }
  | { type: 'guideDoc'; docId: string; markdown: string }
  | { type: 'guideNavigate'; docId: string; anchor?: string }
  | { type: 'guideError'; message: string };

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

/** 단계별 테스트 ①의도파악 — 대상 파일 해석 드라이런의 규칙 한 단계(발화 여부 포함). */
export interface TargetResolveStep {
  rule: string;
  detail: string;
  fired: boolean;
}

/**
 * 단계별 테스트 ①의도파악 — "해석된 대상 파일" 드라이런 결과.
 * 운영 ChatViewProvider._resolveTargetFile 사슬의 미러(판정만 — 파일 열기·QuickPick 없음).
 * outcome=ask-user가 "빈손 되묻기" 지점 = 대상 파일 해석 고도화(후보 수집기)가 채울 자리.
 */
export interface TargetResolveProbe {
  /** modify_file 라우트일 때만 수행(운영 isFileCtx 게이트와 동일 취지). */
  applicable: boolean;
  outcome: 'cross-file' | 'current-file' | 'ask-user' | 'not-applicable';
  /** 확정된 대상 파일(워크스페이스 상대경로). ask-user/not-applicable이면 null. */
  targetFile: string | null;
  /** 결정 사슬 추적 — 순서대로 평가되며 fired=true인 규칙에서 확정. */
  steps: TargetResolveStep[];
  note?: string;
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
  /** 해석된 대상 파일 — 수정 라우트의 대상 파일 결정 사슬 드라이런. */
  targetResolve: TargetResolveProbe;
}

/**
 * 단계별 테스트 ②분해 — 쿼리 분해 토큰 한 개.
 * isStem=true면 한국어 조사를 벗겨 **추가**된 어근(원본 토큰도 별도 유지).
 */
export interface DecomposeToken {
  token: string;
  isStem: boolean;
}

/** 단계별 테스트 ②분해 — splitTsSections가 쪼갠 코드 섹션 한 개(+쿼리 점수·예산 포함 여부). */
export interface DecomposeSection {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  length: number;
  /** scoreCodeSections 기준 쿼리 적합도(이름 +5 / 본문 토큰 +1 / import +2 / 선택겹침 +4). */
  score: number;
  /** 예산 슬라이싱에서 원문 그대로 포함됐는지(false면 stub 자리표시자로 대체). */
  included: boolean;
}

/**
 * 단계별 테스트 ②분해 — 프롬프트에 명시한 "참조 파일"의 슬라이싱 결과(Q3 개선 시각화).
 *
 * 운영 `_loadReferencedFiles`가 큰 참조 파일을 예산에 맞게 줄일 때, 코드 파일은 앞잘림 대신
 * `extractRelevantTsSlice`(관련 섹션만)로, 마크다운은 섹션 추출로 처리한다. 이 뷰는 그 산출물과
 * **"앞잘림이었으면 잃었을 조각"**을 대조해 보여준다(전부 순수 decompose 함수 직접 호출).
 */
export interface DecomposeReference {
  path: string;
  chars: number;
  lines: number;
  kind: 'code' | 'markdown' | 'other';
  /** 이 파일에 적용한 글자 예산. */
  budget: number;
  /** 예산 이하라 통째로 주입되는가(슬라이싱 불필요). */
  wholeInjected: boolean;
  /** kind='code'일 때 — extractRelevantTsSlice 산출(운영과 동일하게 stub 접은 후). */
  code?: {
    includedCount: number;
    /** 관련도 낮아 생략된(접힌) 섹션 수. */
    skippedCount: number;
    /** stub 제거 후 실제 주입 글자 수(= 모델에 나가는 크기). budget 이하 보장. */
    injectedChars: number;
    /** 포함된 섹션 중 앞잘림 컷오프(budget 글자) **뒤**에 있던 것 = 앞잘림이었으면 잃었을 관련 조각. */
    savedFromTailCount: number;
    savedFromTailNames: string[];
    text: string;
  };
  /** kind='markdown'일 때 — splitIntoSections→scoreSections→selectByBudget 산출. */
  markdown?: {
    pickedCount: number;
    droppedCount: number;
    pickedHeaders: string[];
  };
  /** 슬라이싱 대상이 아닌 경우(비 코드/비 md, 또는 예산 이하)의 설명. */
  note?: string;
}

/**
 * 단계별 테스트 ②분해 — 프로브 1회 실행 결과. DecomposeProbePanel 전용.
 *
 * decompose 층의 두 갈래를 그대로 실행해 보여준다(전부 export된 순수 함수라 **직접 호출** — 미러 아님):
 *  - 갈래 1(쿼리 분해): tokenizeQuery(조사 어근 분해)·extractApiPaths·impliedControlTags
 *  - 갈래 2(코드·배경 분해): splitTsSections → scoreCodeSections → sliceByBudget
 *  - 참조 파일 슬라이싱(Q3): 프롬프트에 명시한 스펙/타입 파일을 예산에 맞게 관련 조각만 남김
 */
export interface DecomposeProbeResult {
  query: string;
  // ── 갈래 1: 쿼리 분해 ──
  tokens: DecomposeToken[];
  apiPaths: string[];
  controlTags: string[];
  // ── 갈래 2: 코드·배경 분해 (현재 파일이 TS/TSX일 때만) ──
  file: { path: string; chars: number; lines: number; isTs: boolean } | null;
  sections: DecomposeSection[];
  /** 예산 슬라이싱 산출물. 코드 분해가 수행됐을 때만. */
  slice: {
    budget: number;
    includedCount: number;
    skippedCount: number;
    totalChars: number;
    /** totalChars / sourceChars — 낮을수록 공격적 다이어트(입력 경량). */
    dietRatio: number;
    text: string;
  } | null;
  /** 프롬프트에 명시한 참조 파일의 슬라이싱(Q3). 참조 파일이 없으면 null. */
  reference: DecomposeReference | null;
  /** 코드 분해를 건너뛴 사유(파일 없음/비TS 등). */
  note?: string;
}

/**
 * 단계별 테스트 ③위치찾기 — 프로브 1회 실행 결과. LocateProbePanel 전용.
 *
 * locate 층의 핵심 함수 `locateEditRegion`(export 순수 함수)을 **직접 호출**한 산출물 그대로다
 * (decompose 패널과 동일 원칙 — 운영 미러 아님, 동기화 드리프트 0). 스냅 사다리의 최종 판정
 * (게이트·앵커·영역)과 모델 객관식 후보, region에 동봉되는 재료 크기를 보여준다.
 */
export interface LocateProbeResult {
  query: string;
  file: { path: string; chars: number; lines: number } | null;
  /** 강제 영역(모델 객관식 pick 시뮬레이션) — 지정 시 휴리스틱을 덮어쓰고 이 영역으로 payload 빌드. */
  forced: { startLine: number; endLine: number } | null;
  /** 안전 게이트 판정 — ok=false면 운영에선 full 폴백(ambiguous는 되묻기/모델 객관식). */
  gate: string;
  gateOk: boolean;
  reason: string;
  /** grep 앵커 — 최고 매칭 라인(1-based)·점수(distinct 토큰 수)·매칭 토큰. */
  bestLine: number;
  bestScore: number;
  matched: string[];
  /** 채택 편집 영역(1-based, 포함). */
  startLine: number;
  endLine: number;
  region: string;
  /** 모델 객관식 disambiguation 후보(최대 6, 첫째=채택 영역). */
  candidates: { startLine: number; endLine: number; label: string; score: number }[];
  /** gate==='ambiguous'일 때 되묻기용 후보 섹션 라벨. */
  ambiguousCandidates: string[];
  /** region에 동봉되는 재료 — 글자 수 계기판 + 전문(접기). */
  materials: {
    depsHeaderChars: number;
    depsHeader: string;
    backingDeclsChars: number;
    backingDecls: string;
    controlInventoryChars: number;
    controlInventory: string;
  };
  note?: string;
}

/**
 * 단계별 테스트 ④설명서 삽입 — 카드 한 장의 발동 판정. ContractsProbePanel 전용.
 *
 * 발동 근거(byQueryOnly/byDepsOnly/byRegionOnly)는 **동일한 운영 `applies` 함수를 입력만 비워
 * 재호출(ablation)** 한 결과다 — 트리거 내부를 미러하지 않으므로 드리프트 0. 셋 다 false인데
 * fired=true면 "조합 필요"(쿼리+코드가 함께 있어야 발동, 예: local-data-render).
 */
export interface ContractsProbeCard {
  id: string;
  title: string;
  /** 이 컨텍스트(deps+region+query)에서 발동했는가. */
  fired: boolean;
  /** 쿼리만으로도 발동하는가(ablation). */
  byQueryOnly: boolean;
  /** 코드(deps)만으로도 발동하는가(ablation). */
  byDepsOnly: boolean;
  /** 편집 영역(region)만으로도 발동하는가(ablation). */
  byRegionOnly: boolean;
  /** true면 편집 모드 메뉴에서 structural 제거(JSX 렌더 필요 레시피). */
  requiresPatchMode: boolean;
  /** 영역 루트를 이 컴포넌트로 통째 교체하는 레시피면 그 태그명. */
  replacesRegionRootWith: string | null;
  /** 카드 본문 글자 수(주입 비용). */
  chars: number;
}

/**
 * 단계별 테스트 ④설명서 삽입 — 프로브 1회 실행 결과. ContractsProbePanel 전용.
 *
 * contracts 층의 export 순수 함수(selectScaffoldContracts·buildContractSection·
 * buildComponentPropsSectionForRegion·estimateTokens/inputBudget)를 **직접 호출**한 산출물
 * 그대로다(②③ 패널과 동일 원칙 — 운영 미러 아님, 드리프트 0).
 *
 * ⚠ deps 주의: region 경로의 실제 deps는 locate가 가지치기한 depsHeader지만, 여기선 파일 전체를
 * deps로 쓴다(선택/full/오프라인 경로의 주입과 동일 — 발동 관찰엔 상위집합이라 보수적).
 */
export interface ContractsProbeResult {
  query: string;
  file: { path: string; chars: number; lines: number } | null;
  /** 선택 줄 범위(region 시뮬레이션). 없으면 null — full 경로처럼 region=''로 판정. */
  region: { startLine: number; endLine: number; chars: number } | null;
  /** 전 카드(레지스트리 순서) 발동 판정 — 미발동 카드도 포함(미발동 관찰용). */
  cards: ContractsProbeCard[];
  firedCount: number;
  /** buildContractSection 산출물(발동 카드 조립 섹션). */
  contractSection: { text: string; chars: number; tokens: number };
  /** 컴포넌트 prop 표 주입(존재 기반). */
  props: {
    /** prop 인덱스에 있는 감지 컴포넌트(등장 순, 주입은 앞 3개까지). */
    detected: string[];
    /** 영역에 있으나 인덱스에 없는 PascalCase 태그 — 인덱스 공백(재생성 후보) 신호. */
    unknownTags: string[];
    text: string;
    chars: number;
    tokens: number;
  };
  /** 발동 카드 중 하나라도 JSX 렌더 요구 → 편집 모드 메뉴에서 structural 제거. */
  requiresPatchMode: boolean;
  /** 영역 루트 교체 허용 화이트리스트(루트태그 게이트·프롬프트 지침에 전달). */
  swapTargets: string[];
  /** 주입 합계의 토큰 비용 — promptBudget 단일 추정기 기준. */
  budget: { totalTokens: number; usableInput: number; pct: number };
  note?: string;
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
  domainChars: number;
}
