import { AI_DEFAULTS } from '../ai/config';
import type { LlmConfig } from '../ai/types';

export class ExtensionConfig {
  static getLlmConfig(): LlmConfig {
    return {
      endpoint: AI_DEFAULTS.endpoint,
      apiKey: AI_DEFAULTS.apiKey,
      model: AI_DEFAULTS.model,
      temperature: AI_DEFAULTS.temperature,
      maxTokens: AI_DEFAULTS.maxTokens,
    };
  }

  static getCorpusPath(): string {
    return AI_DEFAULTS.corpusPath;
  }

  static getMaxFileLines(): number {
    return AI_DEFAULTS.maxFileLines;
  }
}
