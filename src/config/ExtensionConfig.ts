import * as vscode from 'vscode';
import { AI_DEFAULTS } from '../ai/config';
import type { LlmConfig } from '../ai/types';

export interface RagConfig {
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
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
      model:       cfg.get<string>('llm.model',       AI_DEFAULTS.model),
      temperature: cfg.get<number>('llm.temperature', AI_DEFAULTS.temperature),
      maxTokens:   cfg.get<number>('llm.maxTokens',   AI_DEFAULTS.maxTokens),
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
