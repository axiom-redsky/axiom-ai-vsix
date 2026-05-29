import * as vscode from 'vscode';
import * as fs from 'fs';
import type { ChatMessage, LlmConfig, LlmUsage } from './types';
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
   * LLM 서버가 온라인 상태인지 확인한다.
   * /v1/models가 막힌 OpenAI-compatible proxy도 있어 실제 생성 라우트까지 확인한다.
   */
  async checkHealth(config: LlmConfig): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    // 서버 종류별 헬스체크 엔드포인트 우선순위
    // GET 요청만 사용: POST /v1/chat/completions 는 인증 정책이 엔드포인트마다 달라 오탐 발생
    const probeUrls = [
      new URL('/v1/models', config.endpoint).toString(),  // OpenAI 호환 (LM Studio, vLLM, LocalAI, Ollama)
      new URL('/api/tags', config.endpoint).toString(),   // Ollama 네이티브
    ];

    try {
      const headers = this._buildAuthHeaders(config);
      for (const url of probeUrls) {
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        console.log(`[Axiom AI] 헬스체크 ${url} → ${res.status}`);
        if (res.status === 401 || res.status === 403) {
          console.warn(`[Axiom AI] 헬스체크 인증 실패: ${res.status}`);
          return false;
        }
        if (res.ok) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn(`[Axiom AI] 헬스체크 실패: ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * OpenAI 호환 /v1/chat/completions SSE 스트리밍.
   * Ollama, vLLM, LocalAI 모두 동일한 스키마를 사용한다.
   * 네트워크 오류 또는 5xx 응답 시 2초 후 1회 재시도한다.
   */
  async *streamChat(
    messages: ChatMessage[],
    config: LlmConfig,
    signal?: AbortSignal,
    onFallback?: (reason: string) => void,
    onServerConnected?: () => void,
    onUsage?: (usage: LlmUsage) => void,
  ): AsyncGenerator<string> {
    const url = new URL('/v1/chat/completions', config.endpoint).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    Object.assign(headers, this._buildAuthHeaders(config));

    const requestBody = JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      // OpenAI/vLLM 호환: 스트림 마지막 chunk에 usage를 포함시킨다.
      // 미지원 서버는 무시하므로 동작에 영향 없음.
      stream_options: { include_usage: true },
    });

    console.log(`[Axiom AI] → 요청 URL: ${url}`);
    console.log(`[Axiom AI] → 모델: ${config.model}, 메시지 수: ${messages.length}, temperature: ${config.temperature}`);

    // fetch 1회 시도 — 네트워크 에러 시 null 반환, AbortError는 그대로 throw
    const attemptFetch = async (): Promise<Response | null> => {
      try {
        return await fetch(url, { method: 'POST', headers, body: requestBody, signal });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        return null;
      }
    };

    // signal 중단을 인식하는 delay (abort 시 AbortError throw)
    const retryDelay = (ms: number): Promise<void> => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });

    // 첫 번째 시도
    let response = await attemptFetch();

    // 네트워크 에러 또는 5xx → 2초 후 1회 재시도
    if (response === null || response.status >= 500) {
      const firstFailMsg = response === null
        ? '네트워크 오류'
        : `서버 오류 ${response.status} ${response.statusText}`;
      console.warn(`[Axiom AI] ${firstFailMsg} — 2초 후 재시도합니다`);
      await retryDelay(2000);
      response = await attemptFetch();
    }

    // 재시도 후에도 네트워크 에러 → 폴백
    if (response === null) {
      const reason = '네트워크 오류 (재시도 후에도 연결 실패)';
      console.warn(`[Axiom AI] ${reason}, 폴백 모드`);
      onFallback?.(reason);
      yield* this._stub.stream(FallbackStubService.extractUserText(messages));
      return;
    }

    console.log(`[Axiom AI] ← 응답 상태: ${response.status} ${response.statusText}`);

    // 재시도 후에도 5xx → 폴백
    if (response.status >= 500) {
      const reason = `서버 오류 ${response.status} ${response.statusText} (재시도 후에도 실패)`;
      console.warn(`[Axiom AI] ${reason}, 폴백 모드 활성화`);
      onFallback?.(reason);
      yield* this._stub.stream(FallbackStubService.extractUserText(messages));
      return;
    }

    if (!response.ok) {
      throw new Error(await this._formatHttpError(response, config));
    }
    if (!response.body) {
      throw new Error('응답 스트림을 받을 수 없습니다');
    }

    onServerConnected?.();
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
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
          // 마지막 chunk에 usage가 들어오는 서버(vLLM, OpenAI 등) 지원
          if (parsed.usage && onUsage) {
            onUsage({
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
            });
          }
        } catch {
          // JSON 파싱 실패 시 무시
        }
      }
    }
  }

  private async _formatHttpError(response: Response, config: LlmConfig): Promise<string> {
    const details = await response.text().catch(() => '');
    const suffix = details.trim() ? ` (${details.trim().slice(0, 300)})` : '';

    if (response.status === 401 || response.status === 403) {
      const keyState = config.apiKey.trim()
        ? '설정된 인증 헤더가 서버에서 거부되었습니다'
        : 'API 키/인증 헤더가 비어 있습니다';
      const authHint = response.headers.get('www-authenticate')?.includes('Basic')
        ? ' 서버가 Basic Auth를 요구합니다. API 키 칸에 Basic 인증 헤더 값을 입력해주세요.'
        : ' axiom-ai.llm.apiKey 설정과 서버 인증 설정을 확인해주세요.';
      return `sLLM 인증 오류: ${response.status} ${response.statusText}. ${keyState}.${authHint}${suffix}`;
    }

    return `sLLM 서버 오류: ${response.status} ${response.statusText}${suffix}`;
  }

  private _buildAuthHeaders(config: LlmConfig): Record<string, string> {
    const apiKey = config.apiKey.trim();
    if (!apiKey) return {};

    if (/^(Bearer|Basic)\s+/i.test(apiKey)) {
      return { Authorization: apiKey };
    }

    return { Authorization: `Bearer ${apiKey}` };
  }
}
