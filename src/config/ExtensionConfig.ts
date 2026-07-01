import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AI_DEFAULTS } from '../ai/config';
import type { LlmConfig } from '../ai/types';
import type { AxiomSettings } from '../types/messages';

/**
 * 통합 프로젝트 설정 파일(`<axiomFolder>/axiom.config.json`)에서 **우선** 읽는 키 집합.
 * 여기 없는 키(머신·시크릿·부트스트랩)는 종전과 100% 동일하게 VSCode 설정에서만 읽는다.
 * - 파일이 없거나 해당 키가 없으면 자동으로 VSCode 설정 → AI_DEFAULTS 순서로 폴백한다(회귀 0).
 * - 읽기·쓰기 라우팅의 단일 진실원. flat dotted key 형태로 저장한다(설정 키와 동일).
 */
const PROJECT_CONFIG_KEYS = new Set<string>([
  'sdd.requireComplianceTags',
  'server.offlineFallback',
  'rag.userRagFolder', 'rag.additionalFiles', 'rag.externalCorpusEnabled', 'rag.validateExternalCorpus',
  'stubs.userStubsFolder',
  'debug.logSystemPrompt',
  'experimental.regionEdit', 'experimental.intentClassifier', 'experimental.pageCreationLlmMode',
  'experimental.onlineKnowledgeAnswer', 'experimental.regionVerify', 'experimental.anchorFirstEdit',
  'experimental.patchFirstEdit', 'experimental.composeBinding',
  'scenarioC.compactModes',
  'promptDiet.qnaGating',
  'promptDiet.adaptiveBudget.enabled', 'promptDiet.adaptiveBudget.floorChars',
  'promptDiet.adaptiveBudget.targetRatio', 'promptDiet.adaptiveBudget.charsPerToken',
  'multiPatch.enabled', 'multiPatch.maxPatches', 'multiPatch.minContextLines',
  'multiPatch.groundedRetry', 'multiPatch.fuzzyLocateThreshold', 'multiPatch.rippleGuard',
  'lineEdit.enabled', 'lineEdit.requireAnchor', 'lineEdit.anchorSearchRadius',
  'llm.qnaAntiRepeat.enabled', 'llm.qnaAntiRepeat.repeatPenalty',
  'llm.qnaAntiRepeat.frequencyPenalty', 'llm.qnaAntiRepeat.presencePenalty',
]);

/** 통합 설정 파일명. 위치는 `<axiomFolder>/` (기본 `.axiom/`). */
const PROJECT_CONFIG_FILE = 'axiom.config.json';

/** apiKey를 보관하는 SecretStorage 키. */
const API_KEY_SECRET = 'axiom-ai.llm.apiKey';

export interface RagConfig {
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  charBudget: number;
  maxSources: number;
  minRestScore: number;
  restScoreRatio: number;
  minEmbedScore: number;
}

export interface PromptDietConfig {
  qnaGating: boolean;
  adaptiveBudget: {
    enabled: boolean;
    floorChars: number;
    targetRatio: number;
    charsPerToken: number;
  };
}

export interface MultiPatchConfig {
  enabled: boolean;
  maxPatches: number;
  minContextLines: number;
  groundedRetry: boolean;
  fuzzyLocateThreshold: number;
  rippleGuard: boolean;
}

export interface LineEditConfig {
  enabled: boolean;
  requireAnchor: boolean;
  anchorSearchRadius: number;
}

export interface QnaAntiRepeatConfig {
  enabled: boolean;
  repeatPenalty: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export class ExtensionConfig {
  private static _cfg() {
    return vscode.workspace.getConfiguration('axiom-ai');
  }

  // ─── 통합 설정 파일 + 시크릿 계층 ───────────────────────────────────────────
  // 설계: 읽기 해상도 = (프로젝트 파일) → (VSCode 설정) → (AI_DEFAULTS).
  //       파일·시크릿이 없으면 종전 동작과 바이트 동일(회귀 0).

  private static _secrets: vscode.SecretStorage | undefined;
  /** undefined = 아직 선로딩 전(설정 폴백), 그 외 = 시크릿에서 로드된 값('' 포함). */
  private static _apiKeyCache: string | undefined;
  private static _projectCfgCache: Record<string, unknown> | null = null;

  /**
   * 활성화 시 1회 호출. SecretStorage 핸들 보관 + apiKey 선로딩(+1회 마이그레이션) +
   * 통합 설정 파일 변경 감시(캐시 무효화)를 등록한다. 실패해도 종전(설정) 동작으로 폴백한다.
   */
  static async init(context: vscode.ExtensionContext): Promise<void> {
    ExtensionConfig._secrets = context.secrets;

    // 통합 설정 파일 변경 → 캐시 무효화 (워크스페이스 내 axiom.config.json 일체)
    try {
      const watcher = vscode.workspace.createFileSystemWatcher(`**/${PROJECT_CONFIG_FILE}`);
      const invalidate = () => ExtensionConfig.reloadProjectConfig();
      watcher.onDidChange(invalidate);
      watcher.onDidCreate(invalidate);
      watcher.onDidDelete(invalidate);
      context.subscriptions.push(watcher);
    } catch { /* 감시 실패는 치명적이지 않음(다음 reload 때 갱신) */ }

    // axiomFolder가 바뀌면 파일 경로가 달라지므로 캐시 무효화
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) ExtensionConfig.reloadProjectConfig();
      }),
    );

    // apiKey 선로딩 + settings.json 평문 키 1회 마이그레이션
    try {
      let secret = await context.secrets.get(API_KEY_SECRET);
      if (!secret) {
        const legacy = ExtensionConfig._cfg().get<string>('llm.apiKey', '');
        if (legacy) {
          await context.secrets.store(API_KEY_SECRET, legacy);
          secret = legacy;
          // 평문 키 제거(마이그레이션). 실패해도 폴백이 있으므로 무시.
          try { await ExtensionConfig._cfg().update('llm.apiKey', '', vscode.ConfigurationTarget.Global); } catch { /* noop */ }
        }
      }
      ExtensionConfig._apiKeyCache = secret ?? '';
    } catch { /* 시크릿 접근 실패 → 캐시 미설정 유지(설정 폴백) */ }
  }

  /** 통합 설정 파일 캐시를 비운다. 다음 읽기에서 디스크를 다시 읽는다. */
  static reloadProjectConfig(): void {
    ExtensionConfig._projectCfgCache = null;
  }

  /** `<workspace>/<axiomFolder>/axiom.config.json` 절대 경로. 워크스페이스 없으면 null. */
  private static _projectCfgPath(): string | null {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return null;
    // 부트스트랩: axiomFolder 미설정 시 scaffold 컨벤션 `.axiom`을 가정(설정 기본값은 건드리지 않음).
    const axiomFolder = ExtensionConfig._cfg().get<string>('sdd.axiomFolder', '') || '.axiom';
    const dir = path.isAbsolute(axiomFolder) ? axiomFolder : path.join(wsRoot, axiomFolder);
    return path.join(dir, PROJECT_CONFIG_FILE);
  }

  /** 통합 설정 파일을 파싱해 반환(캐시). 없거나 파싱 실패 시 빈 객체. */
  private static _projectCfg(): Record<string, unknown> {
    if (ExtensionConfig._projectCfgCache) return ExtensionConfig._projectCfgCache;
    let result: Record<string, unknown> = {};
    const p = ExtensionConfig._projectCfgPath();
    if (p && fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') result = parsed as Record<string, unknown>;
      } catch { /* 파싱 실패 → 빈 객체 */ }
    }
    ExtensionConfig._projectCfgCache = result;
    return result;
  }

  /**
   * 단일 키 해상도. 프로젝트-라우팅 키면 파일 값을 우선하고, 없으면 VSCode 설정 → fallback.
   * 프로젝트 키가 아니면 종전과 동일하게 VSCode 설정에서만 읽는다.
   */
  private static _resolve<T>(key: string, fallback: T): T {
    if (PROJECT_CONFIG_KEYS.has(key)) {
      const pc = ExtensionConfig._projectCfg();
      const v = pc[key];
      if (v !== undefined && v !== null) return v as T;
    }
    return ExtensionConfig._cfg().get<T>(key, fallback);
  }

  /** apiKey 읽기. 시크릿 선로딩 전이면 종전(설정.json) 동작으로 폴백. */
  static getApiKey(): string {
    if (ExtensionConfig._apiKeyCache !== undefined) return ExtensionConfig._apiKeyCache;
    return ExtensionConfig._cfg().get<string>('llm.apiKey', AI_DEFAULTS.apiKey);
  }

  /** apiKey 저장(시크릿). 평문이 settings.json에 남지 않도록 해당 값은 비운다. */
  static async setApiKey(value: string): Promise<void> {
    ExtensionConfig._apiKeyCache = value;
    if (ExtensionConfig._secrets) {
      try {
        if (value) await ExtensionConfig._secrets.store(API_KEY_SECRET, value);
        else await ExtensionConfig._secrets.delete(API_KEY_SECRET);
      } catch { /* noop */ }
    }
    try { await ExtensionConfig._cfg().update('llm.apiKey', '', vscode.ConfigurationTarget.Global); } catch { /* noop */ }
  }

  /**
   * 프로젝트-라우팅 키들을 통합 설정 파일에 병합 저장(파일/폴더 자동 생성).
   * @returns 저장 성공 여부(워크스페이스 없으면 false).
   */
  static async setProjectConfigValues(values: Record<string, unknown>): Promise<boolean> {
    const p = ExtensionConfig._projectCfgPath();
    if (!p) return false;
    let current: Record<string, unknown> = {};
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') current = parsed;
      }
    } catch { current = {}; }
    const merged = { ...current, ...values };
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
    ExtensionConfig._projectCfgCache = merged;
    return true;
  }

  static getLlmConfig(): LlmConfig {
    const cfg = ExtensionConfig._cfg();
    return {
      endpoint:    cfg.get<string>('llm.endpoint',    AI_DEFAULTS.endpoint),
      apiKey:      ExtensionConfig.getApiKey(),
      provider:    cfg.get<'openai' | 'ollama'>('llm.provider', AI_DEFAULTS.provider as 'openai' | 'ollama'),
      model:       cfg.get<string>('llm.model',       AI_DEFAULTS.model),
      temperature: cfg.get<number>('llm.temperature', AI_DEFAULTS.temperature),
      maxTokens:   cfg.get<number>('llm.maxTokens',   AI_DEFAULTS.maxTokens),
      contextWindow: cfg.get<number>('llm.contextWindow', AI_DEFAULTS.contextWindow),
      injectNoThink: cfg.get<boolean>('llm.thinking.injectNoThink', AI_DEFAULTS.injectNoThink),
      sendThinkingParams: cfg.get<boolean>('llm.thinking.sendThinkingParams', AI_DEFAULTS.sendThinkingParams),
    };
  }

  /** scaffold 컨벤션·패턴·문서 통합 지식 폴더 경로 */
  static getKnowledgePath(): string {
    return AI_DEFAULTS.knowledgePath;
  }

  /** @deprecated getRagPath → getKnowledgePath */
  static getRagPath(): string {
    return AI_DEFAULTS.knowledgePath;
  }

  /** @deprecated getCorpusPath → getKnowledgePath */
  static getCorpusPath(): string {
    return AI_DEFAULTS.knowledgePath;
  }

  static getMaxFileLines(): number {
    return AI_DEFAULTS.maxFileLines;
  }

  static getRagConfig(): RagConfig {
    return { ...AI_DEFAULTS.rag };
  }

  /**
   * 프롬프트 다이어트 설정. 품질 저하가 감지되면 사이트별로 qnaGating / adaptiveBudget을 끈다.
   */
  static getPromptDietConfig(): PromptDietConfig {
    const ab = AI_DEFAULTS.promptDiet.adaptiveBudget;
    return {
      qnaGating: ExtensionConfig._resolve<boolean>('promptDiet.qnaGating', AI_DEFAULTS.promptDiet.qnaGating),
      adaptiveBudget: {
        enabled:       ExtensionConfig._resolve<boolean>('promptDiet.adaptiveBudget.enabled',       ab.enabled),
        floorChars:    ExtensionConfig._resolve<number>('promptDiet.adaptiveBudget.floorChars',     ab.floorChars),
        targetRatio:   ExtensionConfig._resolve<number>('promptDiet.adaptiveBudget.targetRatio',    ab.targetRatio),
        charsPerToken: ExtensionConfig._resolve<number>('promptDiet.adaptiveBudget.charsPerToken',  ab.charsPerToken),
      },
    };
  }

  /**
   * 다중 patch 설정. 사이트별 모델 역량에 맞춰 maxPatches를 조정한다.
   * - qwen3.5-35B급(최저 사양): 3
   * - 70B급: 6
   * - 클라우드급: 8 이상
   */
  static getMultiPatchConfig(): MultiPatchConfig {
    return {
      enabled:              ExtensionConfig._resolve<boolean>('multiPatch.enabled',              AI_DEFAULTS.multiPatch.enabled),
      maxPatches:           ExtensionConfig._resolve<number>('multiPatch.maxPatches',            AI_DEFAULTS.multiPatch.maxPatches),
      minContextLines:      ExtensionConfig._resolve<number>('multiPatch.minContextLines',       AI_DEFAULTS.multiPatch.minContextLines),
      groundedRetry:        ExtensionConfig._resolve<boolean>('multiPatch.groundedRetry',        AI_DEFAULTS.multiPatch.groundedRetry),
      fuzzyLocateThreshold: ExtensionConfig._resolve<number>('multiPatch.fuzzyLocateThreshold',  AI_DEFAULTS.multiPatch.fuzzyLocateThreshold),
      rippleGuard:          ExtensionConfig._resolve<boolean>('multiPatch.rippleGuard',          AI_DEFAULTS.multiPatch.rippleGuard),
    };
  }

  /**
   * 라인 앵커(diff) 출력 모드 설정. 사이트별 모델 역량에 맞춰 조정한다.
   * - qwen3.5-35B급: requireAnchor=true (조용한 오적용 차단)
   * - 상위 모델: requireAnchor=false 로 순수 라인 앵커(출력 최소) 가능
   */
  static getLineEditConfig(): LineEditConfig {
    return {
      enabled:            ExtensionConfig._resolve<boolean>('lineEdit.enabled',            AI_DEFAULTS.lineEdit.enabled),
      requireAnchor:      ExtensionConfig._resolve<boolean>('lineEdit.requireAnchor',      AI_DEFAULTS.lineEdit.requireAnchor),
      anchorSearchRadius: ExtensionConfig._resolve<number>('lineEdit.anchorSearchRadius',  AI_DEFAULTS.lineEdit.anchorSearchRadius),
    };
  }

  /**
   * 시나리오 C(열린 파일 수정) 프롬프트 컴팩트 모드 여부. 약한 sLLM 대상 기본 on.
   * on이면 블록을 먼저 내도록 지시하고 출력 모드를 핵심 2개로 좁혀 "설명만 내고 종료" 실패를 줄인다.
   */
  static isScenarioCCompactModes(): boolean {
    return ExtensionConfig._resolve<boolean>('scenarioC.compactModes', AI_DEFAULTS.scenarioC.compactModes);
  }

  /**
   * Q&A(조회·설명형) 응답 반복 억제 튜닝. 호출자가 Q&A 경로에서만 LlmService.streamChat에 주입한다.
   * 코드 편집·스펙·eval 경로에는 전달하지 않으므로 그 경로의 요청 바디는 종전과 바이트 동일하다.
   */
  static getQnaAntiRepeatConfig(): QnaAntiRepeatConfig {
    const d = AI_DEFAULTS.qnaAntiRepeat;
    return {
      enabled:          ExtensionConfig._resolve<boolean>('llm.qnaAntiRepeat.enabled',          d.enabled),
      repeatPenalty:    ExtensionConfig._resolve<number>('llm.qnaAntiRepeat.repeatPenalty',     d.repeatPenalty),
      frequencyPenalty: ExtensionConfig._resolve<number>('llm.qnaAntiRepeat.frequencyPenalty',  d.frequencyPenalty),
      presencePenalty:  ExtensionConfig._resolve<number>('llm.qnaAntiRepeat.presencePenalty',   d.presencePenalty),
    };
  }

  /** 시스템 프롬프트 전문을 'axiom-ai: Prompt' 출력 채널에 기록할지 여부(디버그). */
  static isLogSystemPromptEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('debug.logSystemPrompt', AI_DEFAULTS.debug.logSystemPrompt);
  }

  /**
   * 실험: 영역(region/hybrid) 편집. updateFile(TSX) 요청에서 확장이 편집 영역을 결정론적으로 찾아
   * (안전 게이트 통과 시) 그 영역만 모델에 보내 재작성 + 훅/import는 structural 삽입한다. 게이트 미통과
   * 또는 의존성 미해소 시 기존 full 입력 경로로 자동 폴백한다. 폐쇄망 점진 도입을 위해 기본 off.
   */
  static isRegionEditEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.regionEdit', true);
  }

  /**
   * 실험: 조립 바인딩(compose). "테이블에 /api/... 적용" 같은 다부품 레시피를 약한 모델에 통째로
   * 떠넘기지 않고, 확장이 결정론으로 조립한다 — 참조 스펙 Response로 type 생성(generateTypeFromJson),
   * useApi 훅·파생·가드 삽입, 테이블 셀 재바인딩. 필드 매핑 중 약어 등 애매한 것만 작은 모델콜(필드목록
   * 수준)로 해결하고, API에 없는 컬럼은 추측 대신 되묻는다. 실모델(qwen3-coder) 봉투 3종·되묻기 검증 완료로
   * 기본 on 승격(2026-07-01). 트리거가 좁고(테이블+정확 엔드포인트+스펙) 미충족·실패 시 기존 흐름으로 폴백(회귀
   * 0)하며, 사이트별로 끌 수 있게 토글은 유지. 상세: 메모리 project_compose_binding_recipe.
   */
  static isComposeBindingEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.composeBinding', true);
  }

  /**
   * 실험: 영역 편집 검증-교정 루프(Stage 0). 합성된 편집 결과를 적용 직전에 VSCode TS 언어서버
   * 진단으로 검증하고, 새 타입에러가 있으면 에러+코드창을 모델에 주고 <replace> 앵커 계약으로
   * 1회 교정한다(델타 전송). 교정 후에도 남으면 경고를 붙여 그대로 적용(컨펌 카드에서 최종 판단).
   * 진단을 못 얻으면 fail-open(ok)으로 절대 편집을 막지 않는다. 종전엔 검증 0이었으므로 순수 보강.
   */
  static isRegionVerifyEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.regionVerify', true);
  }

  /**
   * 실험: 앵커-우선 편집(Stage 1). 영역 편집 프롬프트에 "작은 국소 수정(텍스트·속성·단일 값/prop·
   * 제자리 rename)은 영역 전체를 다시 쓰지 말고 바꿀 기존 코드를 그대로 인용해 <replace>로 교체"
   * 지침을 추가한다. 약한 모델의 실제 출력 형태에 영향을 주므로 **오프라인 eval로 측정 불가** —
   * 실모델(qwen3-coder) 라이브 프로브로만 검증된다. 적용 레이어는 모호성·content-loss 게이트 + literal
   * 정확매칭으로 안전하다(파괴적 replace는 거부·폴백). 사용자 결정으로 기본 ON 승격(2026-06-30).
   * 사이트별로 axiom.config.json에서 off 가능. on이어도 적용은 종전과 동일(앵커 모호/누락 시 거부·재인용).
   */
  static isAnchorFirstEditEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.anchorFirstEdit', true);
  }

  /**
   * 실험: patch-우선 편집(Stage 1/경로 수렴). 현재 파일 in-place 수정 프롬프트에서 lines 모드를 빼고
   * patch(`<search>/<replace>` literal 정확매칭 = Claude Code Edit식)를 주력으로 제시한다. lines 앵커가
   * 드리프트로 자주 빗나가 grounded 재시도로 patch 전환되던 우회를 없애고, 약한 모델의 모드 선택 부담도
   * 줄인다(structural=추가, patch=수정 2개로 압축). 모델 출력 형태에 영향 → 실모델 라이브로만 검증.
   * 적용·폴백은 종전과 동일(회귀 0). 선택 영역은 이미 patch 강제라 무영향.
   * 사용자 결정으로 기본 ON 승격(2026-06-30). 사이트별로 axiom.config.json에서 off 가능.
   */
  static isPatchFirstEditEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.patchFirstEdit', true);
  }

  /**
   * 실험: 의도 분류기. 메시지를 정규식 게이트로 분기하기 전에 모델에게 "이게 무슨 요청이야?"를
   * 먼저 물어(작은 JSON 한 줄) 분류·슬롯 추출을 위임한다. 파싱 실패·모델 부재 시 기존 정규식
   * (PageCreationDetector 등)으로 폴백하므로 회귀 위험이 없다. 분류 결과는 채팅에 한 줄로 표시한다.
   * 약한 모델 실동작은 실모델로만 검증되므로 폐쇄망 점진 도입을 위해 기본 off.
   */
  static isIntentClassifierEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.intentClassifier', true);
  }

  /**
   * 페이지 생성 시 페이지 본문을 LLM으로 생성할지 여부.
   * 기본 false(템플릿 모드): 정본 최소 스켈레톤을 결정론적으로 생성 — 약한 모델이 useApi 시그니처·
   * $router import·존재하지 않는 타입을 지어내 컴파일 불가 코드를 박는 문제를 원천 차단한다.
   * true: 실험적 LLM 생성(데이터 페치까지). 약한 모델에선 부정확할 수 있어 옵트인.
   */
  static isPageCreationLlmMode(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.pageCreationLlmMode', false);
  }

  /**
   * 온라인 지식 가이드. 온라인이어도 Q&A(조회·설명)로 게이팅된 요청이고, 로컬 검색기가
   * **정밀 매칭 문서를 확신**할 때만(카탈로그 폴백 FALLBACK_HINT 아님) 그 knowledge 문서 전문을
   * 오프라인과 동일하게 렌더하고 LLM/axiom-action을 건너뛴다. 매칭이 약하면(빈손·폴백) 기존 LLM
   * 경로로 떨어져 "의도 오판 → 도움 0"을 막는다. 공유 스코어러(buildContext) 미사용 → 온라인 코드 편집
   * 경로 무영향. 폐쇄망 점진 도입을 위해 옵트아웃 가능하도록 플래그화(기본 on).
   */
  static isOnlineKnowledgeAnswerEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('experimental.onlineKnowledgeAnswer', true);
  }

  /** 사용자가 설정한 오프라인 stubs 보강 폴더 */
  static getUserStubsFolder(): string {
    return ExtensionConfig._resolve<string>('stubs.userStubsFolder', '');
  }

  /** 사용자가 설정한 추가 RAG 소스 (폴더 + 개별 파일) */
  static getUserRagSources(): { folder: string; files: string[] } {
    return {
      folder: ExtensionConfig._resolve<string>('rag.userRagFolder', ''),
      files:  ExtensionConfig._resolve<string[]>('rag.additionalFiles', []),
    };
  }

  /**
   * 오프라인 의도 분석 설정.
   * - embeddingClassifier: 로컬 임베딩 의미 분류기 사용 여부(off면 정규식 폴백, 회귀 0).
   * - minConfidence/minMargin: 신뢰도 게이팅 임계(eval:intent로 튜닝). 미만이면 단정 대신 되묻기.
   * - userExamplesFolder: 사용자 정의 의도 예시(intents/*.md) 폴더 — 번들 예시에 더해 로드.
   */
  static getOfflineIntentConfig(): {
    enabled: boolean; minConfidence: number; minMargin: number; userExamplesFolder: string;
  } {
    return {
      enabled:            ExtensionConfig._resolve<boolean>('offlineIntent.embeddingClassifier', true),
      minConfidence:      ExtensionConfig._resolve<number>('offlineIntent.minConfidence', 0.42),
      minMargin:          ExtensionConfig._resolve<number>('offlineIntent.minMargin', 0.05),
      userExamplesFolder: ExtensionConfig._resolve<string>('offlineIntent.userExamplesFolder', ''),
    };
  }

  // ─── SDD 설정 ───────────────────────────────────────────────────────────────

  /** .axiom/ 폴더 경로 (SDD 스펙 저장소). 설정 없으면 빈 문자열 */
  static getSddAxiomFolder(): string {
    return ExtensionConfig._cfg().get<string>('sdd.axiomFolder', '');
  }

  /** 금융 컴플라이언스 필드 강제 여부 */
  static getSddRequireComplianceTags(): boolean {
    return ExtensionConfig._resolve<boolean>('sdd.requireComplianceTags', false);
  }

  // ─── 서버 설정 (폐쇄망 지원) ──────────────────────────────────────────────

  /** @deprecated LLM 요청 엔드포인트는 axiom-ai.llm.endpoint를 사용한다. */
  static getServerEndpoint(): string {
    return ExtensionConfig._cfg().get<string>('server.endpoint', '');
  }

  /** AI 서버 미응답 시 scaffold 기반 빈 스텁 반환 여부 */
  static isOfflineFallbackEnabled(): boolean {
    return ExtensionConfig._resolve<boolean>('server.offlineFallback', true);
  }

  /** 실제 LLM 요청에 사용할 설정. 확장 설정 UI의 LLM 서버 설정을 단일 source of truth로 사용한다. */
  static getEffectiveLlmConfig(): LlmConfig {
    return ExtensionConfig.getLlmConfig();
  }

  // ─── 고급 설정(UI 노출용 평탄화) ───────────────────────────────────────────

  /** 고급 튜닝 값을 평탄화해 반환(설정 패널 "고급 설정" 섹션 표시·편집용). 기존 getter 재사용. */
  static getAdvancedSettings(): NonNullable<AxiomSettings['advanced']> {
    const pd = ExtensionConfig.getPromptDietConfig();
    const mp = ExtensionConfig.getMultiPatchConfig();
    const le = ExtensionConfig.getLineEditConfig();
    const qa = ExtensionConfig.getQnaAntiRepeatConfig();
    const llm = ExtensionConfig.getLlmConfig();
    return {
      promptDietQnaGating:          pd.qnaGating,
      adaptiveBudgetEnabled:        pd.adaptiveBudget.enabled,
      adaptiveBudgetFloorChars:     pd.adaptiveBudget.floorChars,
      adaptiveBudgetTargetRatio:    pd.adaptiveBudget.targetRatio,
      adaptiveBudgetCharsPerToken:  pd.adaptiveBudget.charsPerToken,
      multiPatchEnabled:            mp.enabled,
      multiPatchMaxPatches:         mp.maxPatches,
      multiPatchMinContextLines:    mp.minContextLines,
      multiPatchGroundedRetry:      mp.groundedRetry,
      multiPatchFuzzyLocateThreshold: mp.fuzzyLocateThreshold,
      multiPatchRippleGuard:        mp.rippleGuard,
      lineEditEnabled:              le.enabled,
      lineEditRequireAnchor:        le.requireAnchor,
      lineEditAnchorSearchRadius:   le.anchorSearchRadius,
      scenarioCCompactModes:        ExtensionConfig.isScenarioCCompactModes(),
      qnaAntiRepeatEnabled:         qa.enabled,
      qnaAntiRepeatRepeatPenalty:   qa.repeatPenalty,
      qnaAntiRepeatFrequencyPenalty: qa.frequencyPenalty,
      qnaAntiRepeatPresencePenalty: qa.presencePenalty,
      injectNoThink:                llm.injectNoThink,
      sendThinkingParams:           llm.sendThinkingParams,
      offlineFallback:              ExtensionConfig.isOfflineFallbackEnabled(),
      requireComplianceTags:        ExtensionConfig.getSddRequireComplianceTags(),
      userStubsFolder:              ExtensionConfig.getUserStubsFolder(),
      externalCorpusEnabled:        ExtensionConfig._resolve<boolean>('rag.externalCorpusEnabled', true),
      validateExternalCorpus:       ExtensionConfig._resolve<boolean>('rag.validateExternalCorpus', true),
    };
  }
}
