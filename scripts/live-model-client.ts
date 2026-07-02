/**
 * 라이브 모델 호출 공유 클라이언트 (eval 하니스 공용).
 *
 * 실 qwen3-coder 서버(vast 위 LiteLLM /v1)를 OpenAI 호환 `/v1/chat/completions`로 호출한다.
 * vscode/디스크 런타임에 의존하지 않으므로 node 배치(esbuild + vscode 스텁)에서 그대로 쓴다.
 *
 * 설정 우선순위: 환경변수 > VSCode 사용자 settings.json(axiom-ai.llm.*).
 *   AXIOM_ENDPOINT / AXIOM_MODEL / AXIOM_API_KEY
 *
 * 프롬프트 "효과"는 오프라인 eval(녹화 재생)로 측정 불가하다는 게 이 프로젝트의 반복된 교훈이다
 * (AXIOM_EDIT_REDESIGN_HANDOFF.md 원칙 #1). 이 클라이언트는 그 갭을 메우는 **실모델 배치 검증**의 토대다.
 */
import * as fs from 'fs';

export interface ModelConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

/**
 * VSCode 사용자 settings.json에서 axiom-ai.llm.* 값을 읽는다(JSONC: 주석·trailing comma 허용).
 * 환경변수가 없을 때 폴백. (probe-sliced-output.ts에서 검증된 로직 재사용.)
 */
function readVscodeSettings(): Partial<ModelConfig> {
  const appData = process.env.APPDATA;
  if (!appData) return {};
  const candidates = [
    `${appData}\\Code\\User\\settings.json`,
    `${appData}\\Code - Insiders\\User\\settings.json`,
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1');
      const json = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        endpoint: json['axiom-ai.llm.endpoint'] as string | undefined,
        model: json['axiom-ai.llm.model'] as string | undefined,
        apiKey: json['axiom-ai.llm.apiKey'] as string | undefined,
      } as Partial<ModelConfig>;
    } catch {
      /* 다음 후보 */
    }
  }
  return {};
}

/** endpoint/model/apiKey를 해석한다. endpoint·model 둘 다 없으면 null(호출부가 안내 후 종료). */
export function resolveModelConfig(): ModelConfig | null {
  const settings = readVscodeSettings();
  const endpoint = process.env.AXIOM_ENDPOINT || settings.endpoint;
  const model = process.env.AXIOM_MODEL || settings.model;
  const apiKey = (process.env.AXIOM_API_KEY || settings.apiKey || '').trim();
  if (!endpoint || !model) return null;
  return { endpoint, model, apiKey };
}

export interface CallOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** 조기 종료 문자열(예: 의도 분류의 첫 `}`). 스트리밍이 아니라 non-stream이므로 참고용 미사용. */
}

export interface CallResult {
  ok: boolean;
  text: string;
  error?: string;
  elapsedMs: number;
}

/** OpenAI 호환 /v1/chat/completions 를 non-stream으로 1회 호출한다. 예외는 CallResult.error로 포장. */
export async function callLlm(
  cfg: ModelConfig,
  system: string,
  user: string,
  opts: CallOptions = {},
): Promise<CallResult> {
  const { maxTokens = 1024, temperature = 0.2, timeoutMs = 120_000 } = opts;
  const url = new URL('/v1/chat/completions', cfg.endpoint).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    headers['Authorization'] = /^(Bearer|Basic)\s+/i.test(cfg.apiKey) ? cfg.apiKey : `Bearer ${cfg.apiKey}`;
  }
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: ac.signal,
    });
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, text: '', error: `${res.status} ${res.statusText} — ${body.slice(0, 200)}`, elapsedMs };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, text: json?.choices?.[0]?.message?.content ?? '', elapsedMs };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    const msg = (e as Error).name === 'AbortError' ? `타임아웃(${timeoutMs}ms)` : (e as Error).message;
    return { ok: false, text: '', error: msg, elapsedMs };
  } finally {
    clearTimeout(timer);
  }
}
