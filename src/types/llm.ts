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
}

// WebView → Extension Host
export type WebviewToHostMessage =
  | { type: 'sendMessage'; text: string }
  | { type: 'clearHistory' }
  | { type: 'ready' };

// Extension Host → WebView
export type HostToWebviewMessage =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string };
