import type { ChatMessage, LlmConfig } from '../types/llm';

export class LlmService {
  /**
   * OpenAI 호환 /v1/chat/completions SSE 스트리밍.
   * Ollama, vLLM, LocalAI 모두 동일한 스키마를 사용한다.
   */
  async *streamChat(
    messages: ChatMessage[],
    config: LlmConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const url = new URL('/v1/chat/completions', config.endpoint).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`sLLM 서버 오류: ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error('응답 스트림을 받을 수 없습니다');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // JSON 파싱 실패 시 무시
        }
      }
    }
  }
}
