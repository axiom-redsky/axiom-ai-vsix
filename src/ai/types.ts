export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** 모델의 컨텍스트 윈도우 크기(토큰). 폐쇄망 사이트별로 다른 모델이 들어오므로 설정값으로 받는다. */
  contextWindow: number;
}

/** OpenAI-compatible 응답의 usage 통계. 서빙 프레임워크마다 일부 필드만 줄 수 있음. */
export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
