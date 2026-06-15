import * as vscode from 'vscode';
import * as fs from 'fs';
import type { ChatMessage, LlmConfig, LlmTuning, LlmUsage } from './types';
import { FallbackStubService } from './FallbackStubService';
import { ExtensionConfig } from '../config/ExtensionConfig';

export class LlmService {
  private readonly _bundledStubsDir: string | null;
  private _stub: FallbackStubService;

  /**
   * per-call 튜닝(anti-repeat penalty)을 400으로 거부한 엔드포인트 집합(세션 캐시).
   * 한 번 거부당한 백엔드(LiteLLM→ollama 등)에는 이후 튜닝을 아예 안 실어, 매 Q&A마다 400+재시도로
   * 왕복이 두 배 되는 것을 막는다. 키는 config.endpoint.
   */
  private readonly _tuningUnsupported = new Set<string>();

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

  /** 오프라인 폴백 스텁(.stubs/*.md) 키워드 매칭 결과를 반환한다(OfflineResponder 폴백용). */
  selectStub(userText: string): string {
    return this._stub.selectStub(userText);
  }

  /** 오프라인 그룹 프레이밍 템플릿(.stubs/groups/{name}.md)을 읽는다(없으면 null). */
  loadGroupTemplate(name: string): string | null {
    return this._stub.loadGroupTemplate(name);
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
   *
   * 폐쇄망 SI는 사이트마다 모델이 다르므로 thinking 억제를 설정(injectNoThink/sendThinkingParams)으로 받고,
   * 두 가지 자동 폴백을 둔다.
   *  - 400 Bad Request(엄격한 게이트웨이가 미지 필드 거부) → thinking 파라미터를 빼고 1회 재시도.
   *  - 빈 응답(추론 토큰이 max_tokens 소진) → max_tokens를 16384로 올려 1회 재시도.
   */
  async *streamChat(
    messages: ChatMessage[],
    config: LlmConfig,
    signal?: AbortSignal,
    onFallback?: (reason: string) => void,
    onServerConnected?: () => void,
    onUsage?: (usage: LlmUsage) => void,
    tuning?: LlmTuning,
  ): AsyncGenerator<string> {
    // Ollama 네이티브는 /api/chat(줄단위 JSON), OpenAI 호환은 /v1/chat/completions(SSE).
    const isOllama = config.provider === 'ollama';
    const url = new URL(
      isOllama ? '/api/chat' : '/v1/chat/completions',
      config.endpoint,
    ).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': isOllama ? 'application/x-ndjson' : 'text/event-stream',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    Object.assign(headers, this._buildAuthHeaders(config));

    // 현재 시도에 적용할 thinking 억제 옵션·토큰·튜닝 (자동 폴백에서 조정됨)
    let sendThinkingParams = config.sendThinkingParams;
    let maxTokens = config.maxTokens;
    // 이 엔드포인트가 이전에 튜닝 파라미터를 거부했다면 처음부터 안 싣는다(왕복 절약).
    let activeTuning = this._tuningUnsupported.has(config.endpoint) ? undefined : tuning;
    const buildBody = (): string =>
      this._buildRequestBody(messages, config, { sendThinkingParams, maxTokens, tuning: activeTuning });

    console.log(`[Axiom AI] → 요청 URL: ${url} (provider=${config.provider})`);
    console.log(
      `[Axiom AI] → 모델: ${config.model}, 메시지 수: ${messages.length}, temperature: ${config.temperature}, ` +
      (isOllama
        ? `thinking 억제(think=false, 네이티브)`
        : `thinking 억제(noThink=${config.injectNoThink}, params=${sendThinkingParams})`),
    );

    // fetch 1회 시도 — 네트워크 에러 시 null 반환, AbortError는 그대로 throw
    const attemptFetch = async (): Promise<Response | null> => {
      try {
        return await fetch(url, { method: 'POST', headers, body: buildBody(), signal });
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

    // 자동 폴백 ①: 엄격한 게이트웨이가 미지(未知) JSON 필드를 거부(400)한 경우,
    // thinking 파라미터를 빼고 1회 재시도한다. (/no_think 텍스트는 무해하므로 유지)
    if (!isOllama && response.status === 400 && sendThinkingParams) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
      console.warn(
        `[Axiom AI] 400 Bad Request — thinking 파라미터를 제거하고 1회 재시도합니다. ` +
        `(서버가 미지 필드를 거부하는 듯합니다${detail ? `: ${detail}` : ''})`,
      );
      sendThinkingParams = false;
      response = await attemptFetch();
      if (response === null) {
        const reason = '네트워크 오류 (thinking 파라미터 제거 재시도 중 연결 실패)';
        console.warn(`[Axiom AI] ${reason}, 폴백 모드`);
        onFallback?.(reason);
        yield* this._stub.stream(FallbackStubService.extractUserText(messages));
        return;
      }
      console.log(`[Axiom AI] ← (재시도) 응답 상태: ${response.status} ${response.statusText}`);
    }

    // 자동 폴백 ①-b: per-call 튜닝(anti-repeat의 frequency/presence_penalty)을 백엔드가 거부(400)한 경우,
    // 튜닝 파라미터를 빼고 1회 재시도한다. OpenAI 호환 엔드포인트가 실제로는 LiteLLM→ollama 프록시면
    // ollama가 presence_penalty를 지원하지 않아 `UnsupportedParamsError` 400을 낸다. 반복 억제는
    // "있으면 좋은" 보조 튜닝이므로, 안 되는 백엔드에선 조용히 떨궈 본 응답을 살린다(설명만 못 받는 dead-end 방지).
    if (!isOllama && response.status === 400 && activeTuning) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
      console.warn(
        `[Axiom AI] 400 Bad Request — anti-repeat 튜닝 파라미터를 제거하고 1회 재시도합니다. ` +
        `(백엔드가 presence/frequency_penalty를 지원하지 않는 듯합니다${detail ? `: ${detail}` : ''})`,
      );
      activeTuning = undefined;
      this._tuningUnsupported.add(config.endpoint); // 이후 호출부터는 처음부터 안 싣는다.
      response = await attemptFetch();
      if (response === null) {
        const reason = '네트워크 오류 (튜닝 파라미터 제거 재시도 중 연결 실패)';
        console.warn(`[Axiom AI] ${reason}, 폴백 모드`);
        onFallback?.(reason);
        yield* this._stub.stream(FallbackStubService.extractUserText(messages));
        return;
      }
      console.log(`[Axiom AI] ← (튜닝 제거 재시도) 응답 상태: ${response.status} ${response.statusText}`);
    }

    // 5xx → 폴백
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

    // 스트림 소비 → content 누적치를 stats로 받는다 (provider별 포맷 분기)
    const stats = LlmService._newStreamStats();
    yield* isOllama
      ? this._consumeOllamaStream(response, stats, maxTokens, onUsage)
      : this._consumeStream(response, stats, maxTokens, onUsage);

    // 자동 폴백 ②: 빈 응답 + thinking 오버플로 → max_tokens를 올려 1회 재시도.
    // content를 한 글자도 내보내지 않았으므로 안전하게 재요청할 수 있다.
    const thinkingOverflow =
      stats.contentChars === 0 &&
      (stats.reasoningChars > 0 || (stats.finishReason === 'length' && stats.chunksReceived > 100));
    if (thinkingOverflow && maxTokens < 16384) {
      const boosted = 16384;
      console.warn(
        `[Axiom AI] 빈 응답(thinking 오버플로) 자동 복구: max_tokens ${maxTokens} → ${boosted} 로 1회 재시도합니다.`,
      );
      maxTokens = boosted;
      const retry = await attemptFetch();
      if (retry?.ok && retry.body) {
        const stats2 = LlmService._newStreamStats();
        yield* isOllama
          ? this._consumeOllamaStream(retry, stats2, maxTokens, onUsage)
          : this._consumeStream(retry, stats2, maxTokens, onUsage);
      } else {
        console.warn(`[Axiom AI] max_tokens 증액 재시도 실패 (status=${retry?.status ?? 'network'})`);
      }
    }
  }

  /** 스트림 진단 카운터 초기값 */
  private static _newStreamStats(): {
    chunksReceived: number;
    contentChunks: number;
    contentChars: number;
    reasoningChars: number;
    finishReason: string | null;
    parseErrors: number;
  } {
    return {
      chunksReceived: 0,
      contentChunks: 0,
      contentChars: 0,
      reasoningChars: 0,
      finishReason: null,
      parseErrors: 0,
    };
  }

  /**
   * SSE 응답 본문을 파싱해 content 델타를 yield 한다.
   * 진단 카운터는 stats에 누적하고, 종료 시 로그를 남긴다(빈 응답이면 원인 분류 경고).
   */
  private async *_consumeStream(
    response: Response,
    stats: ReturnType<typeof LlmService._newStreamStats>,
    effectiveMaxTokens: number,
    onUsage?: (usage: LlmUsage) => void,
  ): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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

          stats.chunksReceived++;
          try {
            const parsed = JSON.parse(data) as {
              choices?: {
                delta?: { content?: string; reasoning_content?: string; reasoning?: string };
                finish_reason?: string | null;
              }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };
            const choice = parsed.choices?.[0];
            const content = choice?.delta?.content;
            // thinking 모드 서버는 추론 토큰을 별도 필드로 흘려보낸다. 출력하지 않고 진단용으로만 집계한다.
            // vLLM은 reasoning_content, Ollama의 /v1 호환 레이어는 reasoning 으로 보낸다(필드명이 다름).
            const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
            if (reasoning) stats.reasoningChars += reasoning.length;
            if (content) {
              stats.contentChunks++;
              stats.contentChars += content.length;
              yield content;
            }
            if (choice?.finish_reason) stats.finishReason = choice.finish_reason;
            // 마지막 chunk에 usage가 들어오는 서버(vLLM, OpenAI 등) 지원
            if (parsed.usage && onUsage) {
              onUsage({
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              });
            }
          } catch {
            stats.parseErrors++;
          }
        }
      }
    } finally {
      LlmService._logStreamEnd(stats, effectiveMaxTokens);
    }
  }

  /**
   * Ollama 네이티브(/api/chat) 응답 본문을 파싱해 content 델타를 yield 한다.
   * SSE가 아니라 줄단위 JSON(NDJSON): 각 줄이 {message:{content,thinking}, done, ...} 객체다.
   * thinking은 별도 필드(message.thinking)로 오므로 출력하지 않고 진단용으로만 집계한다.
   * usage는 마지막 done:true 객체의 prompt_eval_count / eval_count 로 들어온다.
   */
  private async *_consumeOllamaStream(
    response: Response,
    stats: ReturnType<typeof LlmService._newStreamStats>,
    effectiveMaxTokens: number,
    onUsage?: (usage: LlmUsage) => void,
  ): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          stats.chunksReceived++;
          try {
            const parsed = JSON.parse(trimmed) as {
              message?: { content?: string; thinking?: string };
              done?: boolean;
              done_reason?: string;
              prompt_eval_count?: number;
              eval_count?: number;
            };
            const content = parsed.message?.content;
            const thinking = parsed.message?.thinking;
            if (thinking) stats.reasoningChars += thinking.length;
            if (content) {
              stats.contentChunks++;
              stats.contentChars += content.length;
              yield content;
            }
            if (parsed.done) {
              stats.finishReason = parsed.done_reason ?? 'stop';
              if (onUsage) {
                onUsage({
                  promptTokens: parsed.prompt_eval_count,
                  completionTokens: parsed.eval_count,
                  totalTokens:
                    (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0) || undefined,
                });
              }
            }
          } catch {
            stats.parseErrors++;
          }
        }
      }
    } finally {
      LlmService._logStreamEnd(stats, effectiveMaxTokens);
    }
  }

  /** 스트림 종료 시 진단 로그를 남긴다(빈 응답이면 원인 분류 경고). OpenAI·Ollama 파서 공용. */
  private static _logStreamEnd(
    stats: ReturnType<typeof LlmService._newStreamStats>,
    effectiveMaxTokens: number,
  ): void {
    console.log(
      `[Axiom AI] ← 스트림 종료: chunks=${stats.chunksReceived}, contentChunks=${stats.contentChunks}, ` +
      `chars=${stats.contentChars}, reasoningChars=${stats.reasoningChars}, ` +
      `finish_reason=${stats.finishReason ?? 'null'}, parseErrors=${stats.parseErrors}`,
    );
    if (stats.contentChars === 0) {
      // reasoning 토큰이 들어왔거나, length로 끊겼는데 청크가 많으면 thinking 오버플로로 판정한다.
      const isThinkingOverflow =
        stats.reasoningChars > 0 || (stats.finishReason === 'length' && stats.chunksReceived > 100);
      console.warn(
        `[Axiom AI] ⚠️ 모델이 content 토큰을 0개 출력. finish_reason=${stats.finishReason ?? 'null'}. ` +
        (isThinkingOverflow
          ? `reasoningChars=${stats.reasoningChars}, chunksReceived=${stats.chunksReceived} — thinking 모드가 ` +
            `max_tokens(${effectiveMaxTokens})를 전부 소비한 것으로 보입니다. Ollama 백엔드라면 ` +
            `axiom-ai.llm.provider 를 'ollama'로 설정해 think:false 로 추론을 끄세요. ` +
            `그 외에는 axiom-ai.llm.maxTokens를 16384 이상으로 늘리거나 모델의 thinking 설정을 점검하세요.`
          : `프롬프트가 너무 길거나 모델이 EOS를 즉시 발사한 가능성. /clear 후 더 짧은 요청으로 재시도하거나 axiom-ai.multiPatch.enabled=false 로 폴백.`),
      );
    }
  }

  /**
   * /v1/chat/completions 요청 본문을 만든다.
   * thinking 억제 옵션(injectNoThink / sendThinkingParams)과 max_tokens를 호출 시점에 반영한다.
   */
  private _buildRequestBody(
    messages: ChatMessage[],
    config: LlmConfig,
    opts: { sendThinkingParams: boolean; maxTokens: number; tuning?: LlmTuning },
  ): string {
    if (config.provider === 'ollama') {
      // Ollama 네이티브(/api/chat): thinking은 top-level think:false로만 확실히 꺼진다.
      // (/v1 호환 레이어의 enable_thinking·chat_template_kwargs·reasoning_effort는 모두 무시되어 추론이 계속됨)
      // think:false가 권위 있으므로 /no_think 텍스트 주입은 불필요·생략한다.
      // max_tokens·temperature는 OpenAI식 top-level이 아니라 options 하위로 전달한다.
      const options: Record<string, unknown> = {
        temperature: config.temperature,
        num_predict: opts.maxTokens,
      };
      // per-call 튜닝(Q&A 경로에서만 주입). 미지정이면 Modelfile/서버 기본값을 그대로 둔다.
      if (opts.tuning?.repeatPenalty != null) {
        options.repeat_penalty = opts.tuning.repeatPenalty;
      }
      return JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        think: false,
        options,
      });
    }

    const body: Record<string, unknown> = {
      model: config.model,
      // qwen3 계열은 JSON 파라미터를 무시하는 서버가 있어, 모델 레벨에서 인식하는 /no_think 소프트 스위치를 함께 쓴다.
      messages: config.injectNoThink ? LlmService._applyNoThink(messages) : messages,
      stream: true,
      temperature: config.temperature,
      max_tokens: opts.maxTokens,
      // OpenAI/vLLM 호환: 스트림 마지막 chunk에 usage를 포함시킨다. 미지원 서버는 무시한다.
      stream_options: { include_usage: true },
    };
    // per-call 튜닝(Q&A 경로에서만 주입). 표준 OpenAI 필드이나, 미지정이면 바디에 넣지 않아 종전과 동일하게 둔다.
    if (opts.tuning?.frequencyPenalty != null) {
      body.frequency_penalty = opts.tuning.frequencyPenalty;
    }
    if (opts.tuning?.presencePenalty != null) {
      body.presence_penalty = opts.tuning.presencePenalty;
    }
    if (opts.sendThinkingParams) {
      // qwen3 계열 thinking 모드 비활성화. 미지원 모델은 무시하지만, 엄격한 게이트웨이는 400을 낼 수 있어 옵션으로 둔다.
      body.enable_thinking = false;
      // vLLM qwen3 배포 환경에서 사용하는 추가 파라미터 경로
      body.chat_template_kwargs = { enable_thinking: false };
    }
    return JSON.stringify(body);
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

  /**
   * Qwen3 계열의 thinking 모드 소프트 스위치(/no_think)를 시스템 메시지에 주입한다.
   * enable_thinking JSON 파라미터를 무시하는 서버에서도 모델이 직접 인식하므로,
   * thinking 토큰이 max_tokens를 소진해 content가 0이 되는 문제를 방지한다.
   * - 이미 /no_think 가 있으면 중복 추가하지 않는다.
   * - 시스템 메시지가 없으면 맨 앞에 새로 추가한다.
   * - qwen3 미지원 모델은 일반 텍스트로 취급해 무시한다.
   */
  private static _applyNoThink(messages: ChatMessage[]): ChatMessage[] {
    const SWITCH = '/no_think';
    if (messages.some((m) => m.content.includes(SWITCH))) return messages;

    const sysIndex = messages.findIndex((m) => m.role === 'system');
    if (sysIndex === -1) {
      return [{ role: 'system', content: SWITCH }, ...messages];
    }
    return messages.map((m, i) =>
      i === sysIndex ? { ...m, content: `${m.content}\n\n${SWITCH}` } : m,
    );
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
