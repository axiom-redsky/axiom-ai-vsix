import * as vscode from 'vscode';
import * as fs from 'fs';
import type { ChatMessage, LlmConfig } from './types';
import { FallbackStubService } from './FallbackStubService';
import { ExtensionConfig } from '../config/ExtensionConfig';

export class LlmService {
  private readonly _bundledStubsDir: string | null;
  private _stub: FallbackStubService;

  constructor(extensionUri?: vscode.Uri) {
    if (extensionUri) {
      const p = vscode.Uri.joinPath(extensionUri, '.stubs').fsPath;
      this._bundledStubsDir = fs.existsSync(p) ? p : null;
    } else {
      this._bundledStubsDir = null;
    }
    const userDir = ExtensionConfig.getUserStubsFolder() || null;
    this._stub = new FallbackStubService(this._bundledStubsDir, userDir);
  }

  /** 사용자 stubs 폴더 변경 시 ChatViewProvider에서 호출 */
  reloadStubs(): void {
    const userDir = ExtensionConfig.getUserStubsFolder() || null;
    this._stub.reload(this._bundledStubsDir, userDir);
  }

  /**
   * OpenAI 호환 /v1/chat/completions SSE 스트리밍.
   * Ollama, vLLM, LocalAI 모두 동일한 스키마를 사용한다.
   */
  async *streamChat(
    messages: ChatMessage[],
    config: LlmConfig,
    signal?: AbortSignal,
    onFallback?: (reason: string) => void,
  ): AsyncGenerator<string> {
    const url = new URL('/v1/chat/completions', config.endpoint).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    console.log(`[Axiom AI] → 요청 URL: ${url}`);
    console.log(`[Axiom AI] → 모델: ${config.model}, 메시지 수: ${messages.length}, temperature: ${config.temperature}`);

    let response: Response;
    try {
      response = await fetch(url, {
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
    } catch (fetchErr) {
      if ((fetchErr as Error).name === 'AbortError') {
        throw fetchErr;
      }
      const reason = (fetchErr as Error).message;
      console.warn(`[Axiom AI] 네트워크 오류, 폴백 모드: ${reason}`);
      onFallback?.(reason);
      yield* this._stub.stream(FallbackStubService.extractUserText(messages));
      return;
    }

    console.log(`[Axiom AI] ← 응답 상태: ${response.status} ${response.statusText}`);

    if (response.status >= 500) {
      const reason = `서버 오류 ${response.status} ${response.statusText}`;
      console.warn(`[Axiom AI] ${reason}, 폴백 모드 활성화`);
      onFallback?.(reason);
      yield* this._stub.stream(FallbackStubService.extractUserText(messages));
      return;
    }

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
