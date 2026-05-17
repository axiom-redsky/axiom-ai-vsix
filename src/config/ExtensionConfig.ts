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

  static getCorpusPath(): string {
    return AI_DEFAULTS.corpusPath;
  }

  static getRagPath(): string {
    return AI_DEFAULTS.ragPath;
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
}
