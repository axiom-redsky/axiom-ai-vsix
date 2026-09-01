/**
 * LLM 서버 주소 조립 — **단일 진실원(single source of truth)**.
 *
 * 배경(SI 현장): 고객사 AI 담당자가 주는 주소의 형태가 제각각이다.
 *  - `http://10.10.20.31:8000`                      ← 기준 주소만
 *  - `http://10.10.20.31:8000/v1`                   ← /v1 까지
 *  - `http://10.10.20.31:8000/v1/chat/completions`  ← 대화 경로 통째로
 *  - `https://gw.co.kr/llm/v1/chat/completions`     ← 게이트웨이 **중간 경로(/llm)** 포함
 *
 * 종전 코드는 네 곳(LlmService·연결 테스트·모델 목록·provider 감지)에서 각각
 * `new URL('/v1/chat/completions', endpoint)` 로 조립했다. 선행 슬래시(`/`)로 시작하는 상대 참조는
 * **base의 경로를 통째로 버린다** — 그래서 `/llm` 같은 중간 경로가 조용히 사라져, 경로 접두사를 쓰는
 * 사내 게이트웨이 뒤에서는 아예 붙지 못했다. 이 모듈이 그 조립을 한 곳으로 모으고 접두사를 보존한다.
 *
 * ── 모드 ────────────────────────────────────────────────────────────────────
 * 사용자가 설정 화면에서 **직접 고른다**(추측하지 않는다).
 *  - `base`: 받은 주소를 기준 주소로 보고 뒤에 API 경로를 붙인다. (기본)
 *            꼬리에 `/v1` 등이 딸려와도 잘라내므로 위 4가지 형태를 모두 받는다.
 *  - `full`: 받은 주소를 **그대로** 대화 호출에 쓴다. 경로가 완전히 커스텀인 게이트웨이용 탈출구.
 *            이 모드에서도 모델 목록·provider 감지는 기준 주소를 추정해 시도한다(실패해도 무해).
 *
 * 순수 모듈 — vscode 의존 없음(테스트: `npm run test:llm-endpoint`).
 */

/** 엔드포인트 해석 방식. 설정 `axiom-ai.llm.endpointMode`. */
export type LlmEndpointMode = 'base' | 'full';

/**
 * 담당자가 통째로 주는 주소의 꼬리(대화·목록·감지 경로).
 * **긴 것부터** 검사한다 — `/v1/chat/completions` 가 `/v1` 보다 먼저 걸려야 한다.
 */
const KNOWN_API_SUFFIXES: readonly string[] = [
  '/v1/chat/completions',
  '/v1/completions',
  '/v1/models',
  '/api/chat',
  '/api/generate',
  '/api/tags',
  '/chat/completions',
  '/v1',
];

/** OpenAI 호환 대화 경로. */
export const PATH_OPENAI_CHAT = 'v1/chat/completions';
/** Ollama 네이티브 대화 경로. */
export const PATH_OLLAMA_CHAT = 'api/chat';
/** 모델 목록(연결 테스트 1단계). */
export const PATH_MODELS = 'v1/models';
/** Ollama 생존 확인(provider 자동 감지 신호). */
export const PATH_TAGS = 'api/tags';

/**
 * 받은 주소에서 **기준 주소**를 뽑아낸다. 중간 경로(`/llm` 등)는 보존하고 알려진 API 꼬리만 잘라낸다.
 * 잘라낼 꼬리가 없으면 뒤 슬래시만 정리해 그대로 돌려준다.
 */
export function normalizeBaseUrl(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  s = s.replace(/\/+$/, '');
  const lower = s.toLowerCase();
  for (const suffix of KNOWN_API_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      s = s.slice(0, s.length - suffix.length);
      break;
    }
  }
  return s.replace(/\/+$/, '');
}

/**
 * 기준 주소 뒤에 API 경로를 붙인다. `new URL(path, base)` 과 달리 **base의 경로를 보존**한다.
 * base가 비면 빈 문자열(호출 측이 "주소 없음"으로 처리).
 */
export function joinUrl(base: string, apiPath: string): string {
  const b = (base ?? '').replace(/\/+$/, '');
  if (!b) return '';
  const p = (apiPath ?? '').replace(/^\/+/, '');
  return p ? `${b}/${p}` : b;
}

/** 해석된 호출 주소 묶음. */
export interface IResolvedLlmUrls {
  /** 뽑아낸 기준 주소(중간 경로 포함). */
  base: string;
  /** 대화 호출 주소. `full` 모드면 사용자가 입력한 값 그대로. */
  chat: string;
  /** 모델 목록 조회 주소(기준 주소 기반). */
  models: string;
  /** Ollama 생존 확인 주소(기준 주소 기반 · provider 자동 감지용). */
  tags: string;
  /**
   * `full` 모드 여부. true면 chat은 사용자가 준 그대로이고 models·tags는 **추정**이라
   * 실패해도 설정 오류가 아니다(호출 측이 실패를 관대하게 다뤄야 한다).
   */
  verbatimChat: boolean;
}

/**
 * 설정값(주소·모드·provider)에서 실제로 호출할 주소들을 만든다.
 * 화면의 "이렇게 호출합니다" 미리보기와 실제 요청이 **같은 함수**를 쓰도록 하는 것이 이 함수의 존재 이유다.
 */
export function resolveLlmUrls(
  endpoint: string,
  mode: LlmEndpointMode,
  provider: 'openai' | 'ollama',
): IResolvedLlmUrls {
  const raw = (endpoint ?? '').trim();
  const base = normalizeBaseUrl(raw);
  const chatPath = provider === 'ollama' ? PATH_OLLAMA_CHAT : PATH_OPENAI_CHAT;
  return {
    base,
    chat: mode === 'full' ? raw : joinUrl(base, chatPath),
    models: joinUrl(base, PATH_MODELS),
    tags: joinUrl(base, PATH_TAGS),
    verbatimChat: mode === 'full',
  };
}

/** http(s) URL로 파싱되는지. 설정 화면 즉시 피드백·호출 전 가드용. */
export function isValidEndpoint(raw: string): boolean {
  const s = (raw ?? '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 주소 꼬리로 백엔드 종류를 추측한다(확정 아님 — 연결 테스트의 `/api/tags` 감지가 권위 있다).
 * 담당자가 `/api/chat` 주소를 줬다면 그 자체가 "이 서버는 Ollama다"라는 신호다.
 */
export function guessProviderFromUrl(raw: string): 'openai' | 'ollama' | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/\/+$/, '');
  if (!s) return null;
  if (s.endsWith('/api/chat') || s.endsWith('/api/generate') || s.endsWith('/api/tags')) return 'ollama';
  if (s.endsWith('/v1/chat/completions') || s.endsWith('/chat/completions') || s.endsWith('/v1')) return 'openai';
  return null;
}
