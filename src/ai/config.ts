/**
 * AI 관련 기본값 상수.
 * - 이 파일이 단일 source of truth: ExtensionConfig fallback 값과
 *   package.json contributes.configuration default 값을 이 상수와 맞춰 관리한다.
 */
export const AI_DEFAULTS = {
  endpoint: 'https://unions-assembly-celtic-wake.trycloudflare.com',
  apiKey: '',
  model: 'qwen2.5-coder:14b-instruct-q4_k_M',
  temperature: 0.2,
  maxTokens: 4096,
  corpusPath: './corpus',
  maxFileLines: 200,
} as const;
