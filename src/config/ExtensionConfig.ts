import * as vscode from 'vscode';
import { AI_DEFAULTS } from '../ai/config';
import type { LlmConfig } from '../ai/types';

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
}

export interface LineEditConfig {
  enabled: boolean;
  requireAnchor: boolean;
  anchorSearchRadius: number;
}

export class ExtensionConfig {
  private static _cfg() {
    return vscode.workspace.getConfiguration('axiom-ai');
  }

  static getLlmConfig(): LlmConfig {
    const cfg = ExtensionConfig._cfg();
    return {
      endpoint:    cfg.get<string>('llm.endpoint',    AI_DEFAULTS.endpoint),
      apiKey:      cfg.get<string>('llm.apiKey',      AI_DEFAULTS.apiKey),
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
    const cfg = ExtensionConfig._cfg();
    const ab = AI_DEFAULTS.promptDiet.adaptiveBudget;
    return {
      qnaGating: cfg.get<boolean>('promptDiet.qnaGating', AI_DEFAULTS.promptDiet.qnaGating),
      adaptiveBudget: {
        enabled:       cfg.get<boolean>('promptDiet.adaptiveBudget.enabled',       ab.enabled),
        floorChars:    cfg.get<number>('promptDiet.adaptiveBudget.floorChars',     ab.floorChars),
        targetRatio:   cfg.get<number>('promptDiet.adaptiveBudget.targetRatio',    ab.targetRatio),
        charsPerToken: cfg.get<number>('promptDiet.adaptiveBudget.charsPerToken',  ab.charsPerToken),
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
    const cfg = ExtensionConfig._cfg();
    return {
      enabled:         cfg.get<boolean>('multiPatch.enabled',         AI_DEFAULTS.multiPatch.enabled),
      maxPatches:      cfg.get<number>('multiPatch.maxPatches',       AI_DEFAULTS.multiPatch.maxPatches),
      minContextLines: cfg.get<number>('multiPatch.minContextLines',  AI_DEFAULTS.multiPatch.minContextLines),
    };
  }

  /**
   * 라인 앵커(diff) 출력 모드 설정. 사이트별 모델 역량에 맞춰 조정한다.
   * - qwen3.5-35B급: requireAnchor=true (조용한 오적용 차단)
   * - 상위 모델: requireAnchor=false 로 순수 라인 앵커(출력 최소) 가능
   */
  static getLineEditConfig(): LineEditConfig {
    const cfg = ExtensionConfig._cfg();
    return {
      enabled:            cfg.get<boolean>('lineEdit.enabled',            AI_DEFAULTS.lineEdit.enabled),
      requireAnchor:      cfg.get<boolean>('lineEdit.requireAnchor',      AI_DEFAULTS.lineEdit.requireAnchor),
      anchorSearchRadius: cfg.get<number>('lineEdit.anchorSearchRadius',  AI_DEFAULTS.lineEdit.anchorSearchRadius),
    };
  }

  /** 시스템 프롬프트 전문을 'axiom-ai: Prompt' 출력 채널에 기록할지 여부(디버그). */
  static isLogSystemPromptEnabled(): boolean {
    return ExtensionConfig._cfg().get<boolean>('debug.logSystemPrompt', AI_DEFAULTS.debug.logSystemPrompt);
  }

  /** 사용자가 설정한 오프라인 stubs 보강 폴더 */
  static getUserStubsFolder(): string {
    return ExtensionConfig._cfg().get<string>('stubs.userStubsFolder', '');
  }

  /** 사용자가 설정한 추가 RAG 소스 (폴더 + 개별 파일) */
  static getUserRagSources(): { folder: string; files: string[] } {
    const cfg = ExtensionConfig._cfg();
    return {
      folder: cfg.get<string>('rag.userRagFolder', ''),
      files:  cfg.get<string[]>('rag.additionalFiles', []),
    };
  }

  // ─── SDD 설정 ───────────────────────────────────────────────────────────────

  /** .axiom/ 폴더 경로 (SDD 스펙 저장소). 설정 없으면 빈 문자열 */
  static getSddAxiomFolder(): string {
    return ExtensionConfig._cfg().get<string>('sdd.axiomFolder', '');
  }

  /** 금융 컴플라이언스 필드 강제 여부 */
  static getSddRequireComplianceTags(): boolean {
    return ExtensionConfig._cfg().get<boolean>('sdd.requireComplianceTags', false);
  }

  // ─── 서버 설정 (폐쇄망 지원) ──────────────────────────────────────────────

  /** @deprecated LLM 요청 엔드포인트는 axiom-ai.llm.endpoint를 사용한다. */
  static getServerEndpoint(): string {
    return ExtensionConfig._cfg().get<string>('server.endpoint', '');
  }

  /** AI 서버 미응답 시 scaffold 기반 빈 스텁 반환 여부 */
  static isOfflineFallbackEnabled(): boolean {
    return ExtensionConfig._cfg().get<boolean>('server.offlineFallback', true);
  }

  /** 실제 LLM 요청에 사용할 설정. 확장 설정 UI의 LLM 서버 설정을 단일 source of truth로 사용한다. */
  static getEffectiveLlmConfig(): LlmConfig {
    return ExtensionConfig.getLlmConfig();
  }
}
