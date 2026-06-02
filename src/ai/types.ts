export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LlmProvider = 'openai' | 'ollama';

export interface LlmConfig {
  endpoint: string;
  apiKey: string;
  /**
   * LLM 백엔드 종류. 요청 경로·바디·thinking 억제 방식을 결정한다.
   * - 'openai': OpenAI 호환(/v1/chat/completions). injectNoThink·sendThinkingParams로 thinking 억제 시도.
   * - 'ollama': Ollama 네이티브(/api/chat). think:false로 thinking을 확실히 끈다(/v1 호환 레이어는 억제 파라미터를 무시).
   */
  provider: LlmProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  /** 모델의 컨텍스트 윈도우 크기(토큰). 폐쇄망 사이트별로 다른 모델이 들어오므로 설정값으로 받는다. */
  contextWindow: number;
  /**
   * thinking(추론) 모드 억제 동작. 폐쇄망 SI는 사이트마다 모델이 달라 하드코딩이 위험하므로 설정으로 받는다.
   * - injectNoThink: 시스템 프롬프트에 Qwen3 소프트 스위치 /no_think 를 주입한다. 비-Qwen 모델에선 무의미한 텍스트가 되므로 끌 수 있다.
   * - sendThinkingParams: enable_thinking·chat_template_kwargs JSON 파라미터를 전송한다. 미지 필드를 거부하는 엄격한 게이트웨이에선 끈다.
   */
  injectNoThink: boolean;
  sendThinkingParams: boolean;
}

/** OpenAI-compatible 응답의 usage 통계. 서빙 프레임워크마다 일부 필드만 줄 수 있음. */
export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
