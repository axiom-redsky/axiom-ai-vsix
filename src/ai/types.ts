import type { LlmEndpointMode } from './llmEndpoint';

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
  /**
   * 엔드포인트 해석 방식. 'base'면 endpoint 뒤에 API 경로를 붙이고, 'full'이면 endpoint를 대화 호출에
   * 그대로 쓴다. 조립은 src/ai/llmEndpoint.ts(resolveLlmUrls)가 단독으로 담당한다.
   */
  endpointMode: LlmEndpointMode;
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
  /**
   * 응답을 스트리밍(SSE/NDJSON)으로 받을지 여부. 기본 true — 토큰이 오는 대로 화면에 흘린다.
   * 폐쇄망 SI에서 사내 리버스 프록시·API 게이트웨이가 SSE를 버퍼링하거나 청크 전송을 막는 구성이 있는데,
   * 그때 증상은 '느림'이 아니라 **빈 응답**이다(스트림 파서가 `data:` 없는 본문을 전부 버리기 때문).
   * false면 완성된 JSON 응답 한 덩어리를 받아 파싱한다 — 타자기 효과는 없지만 그런 게이트웨이에서도 답을 받는다.
   */
  stream: boolean;
}

/**
 * 호출 시점(per-call) 샘플링 튜닝. 반복(degenerate repetition) 억제용.
 * 전역(config)이 아니라 호출자가 경로별로 선택 주입한다 — Q&A(산문)에서만 켜고,
 * 코드 편집(region/patch/full)·스펙·eval 프로브는 미전달(undefined)하여 요청 바디를 종전과 동일하게 유지한다.
 * 코드는 본질적으로 반복 토큰(className, 닫는 태그, import 줄)이 많아 반복 페널티가 정당한 구문을 망칠 수 있어,
 * 이 튜닝은 코드 생성 경로에 절대 적용하지 않는다.
 *
 * provider별로 적용 필드가 다르다(미지정 필드는 요청 바디에 넣지 않는다):
 * - ollama: repeatPenalty → options.repeat_penalty (1=off, 1.1 기본, 클수록 반복 억제)
 * - openai: frequencyPenalty / presencePenalty → body.frequency_penalty / presence_penalty (-2~2)
 */
export interface LlmTuning {
  /** Ollama: options.repeat_penalty. 1=억제 없음. 산문 anti-loop엔 1.2~1.3 권장. */
  repeatPenalty?: number;
  /** OpenAI 호환: body.frequency_penalty (-2~2). 같은 토큰 빈도에 비례해 억제. */
  frequencyPenalty?: number;
  /** OpenAI 호환: body.presence_penalty (-2~2). 이미 등장한 토큰 재등장 억제. */
  presencePenalty?: number;
}

/** OpenAI-compatible 응답의 usage 통계. 서빙 프레임워크마다 일부 필드만 줄 수 있음. */
export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
