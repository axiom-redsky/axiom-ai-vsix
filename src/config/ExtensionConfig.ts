import * as vscode from 'vscode';
import type { LlmConfig } from '../types/llm';

export class ExtensionConfig {
  static getLlmConfig(): LlmConfig {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    return {
      endpoint: cfg.get<string>('endpoint', 'http://localhost:11434'),
      apiKey: cfg.get<string>('apiKey', ''),
      model: cfg.get<string>('model', 'qwen2.5-coder:14b'),
      temperature: cfg.get<number>('temperature', 0.2),
      maxTokens: cfg.get<number>('maxTokens', 4096),
    };
  }

  static getCorpusPath(): string {
    return vscode.workspace.getConfiguration('axiom-ai').get<string>('corpusPath', './corpus');
  }

  static getMaxFileLines(): number {
    return vscode.workspace.getConfiguration('axiom-ai').get<number>('maxFileLines', 200);
  }
}
