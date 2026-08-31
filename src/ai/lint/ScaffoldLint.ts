/**
 * Scaffold 린트 (C1) — react-app-scaffold **고유 계약**을 소스 텍스트에서 결정론으로 검사한다.
 * **순수 모듈**(vscode·디스크·모델 비의존): 입력은 파일 텍스트 한 장, 출력은 findings 배열.
 *
 * ## 왜 별도의 린트인가
 * ESLint는 언어·React 일반 규칙을 본다(scaffold의 eslint.config.js는 react-hooks 권장 세트를 켠다).
 * 반면 아래 규칙들은 **이 스캐폴드에서만 참인 계약**이라 ESLint도 tsc도 모른다 —
 * `$router`·`$ui`·`$util` 전역, `@axiom/components/ui` 단일 경로, `useApi` 봉투 계약, T/I 접두사.
 * 지금까지 이 계약들은 **편집 파이프라인의 거부 게이트**(모델 산출물에만 적용)와
 * **프롬프트 계약카드**(모델에게 가르치는 글)로만 존재했다. 사람이 직접 쓴 코드에는 아무 신호가 없었다.
 * 이 모듈은 같은 계약을 **읽기 전용 진단**으로 노출해, 모델이 있든 없든 같은 판정을 받게 한다
 * (오프라인에서도 그대로 도는, "추가 LLM 호출 없는 검증").
 *
 * ## 규칙의 출처(단일 진실원)
 * 규칙은 새로 발명하지 않았다. 전부 이미 프로젝트가 주장하던 계약이다:
 *  - `ai/contracts/ScaffoldContracts.ts` 계약카드 (use-api · router · global-ui-alerts · type-naming …)
 *  - `knowledge/patterns/use-api.md` (호출 위치 규칙 · 봉투 계약)
 *  - `knowledge/react/component.md` · `knowledge/design-system/components.md` (UI 배럴 import)
 * 계약 문구가 바뀌면 여기 규칙도 함께 갱신한다 — 갈라지면 모델과 사람이 다른 지침을 받는다.
 *
 * ## 오탐 정책
 * 파이프라인 게이트와 같은 태도: **애매하면 침묵한다.** 코드를 막는 게이트가 아니라 옆에서 알려주는
 * 진단이지만, 소음이 한 번 쌓이면 개발자는 전체를 끈다. 그래서 문자열·주석 내용은 마스킹해서 보고
 * (`maskNonCode`), 자동 수정은 **결과가 한 가지로 결정되는 모양**에만 붙인다.
 */

import { findModuleScopeHookCalls } from './ReactHookScan';

/** 진단 심각도. */
export type TLintSeverity = 'error' | 'warning' | 'info';

/** v1 규칙 id. */
export type TLintRuleId =
  | 'module-scope-hook'
  | 'refetch-args'
  | 'envelope-unwrap'
  | 'raw-http'
  | 'router-hook'
  | 'window-dialog'
  | 'ui-import-path'
  | 'type-naming';

/** 텍스트 치환 한 건. 좌표는 **0-based**(vscode.Position과 동일). */
export interface ILintEdit {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  text: string;
}

/** 결정론 자동 수정(Quick Fix). 여러 곳을 한 번에 고치는 경우가 있어 edits 배열이다. */
export interface ILintFix {
  title: string;
  edits: ILintEdit[];
}

/** 진단 한 건. 좌표는 **0-based**(vscode.Position과 동일). */
export interface ILintFinding {
  ruleId: TLintRuleId;
  severity: TLintSeverity;
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  /** 결정론 자동 수정. 결과가 한 가지로 정해지지 않는 위반에는 없다(사람이 고쳐야 한다). */
  fix?: ILintFix;
  /** 근거 지식문서 id(확장자 없는 knowledge 상대경로) — "왜 이게 규칙인가"로 잇는 딥링크. */
  docId?: string;
}

/** 규칙 메타 — 관리 UI·설정 목록이 규칙을 나열할 때 쓴다. */
export interface ILintRuleMeta {
  id: TLintRuleId;
  title: string;
  severity: TLintSeverity;
  /** 규칙의 근거가 되는 계약(계약카드 id 또는 지식문서). */
  source: string;
  docId?: string;
}

export const SCAFFOLD_LINT_RULES: readonly ILintRuleMeta[] = [
  { id: 'module-scope-hook', title: '모듈 최상위 훅 호출', severity: 'error', source: 'knowledge/patterns/use-api.md §호출 위치 규칙', docId: 'patterns/use-api' },
  { id: 'refetch-args', title: 'refetch 인자 전달', severity: 'error', source: '계약카드 use-api', docId: 'patterns/use-api' },
  { id: 'ui-import-path', title: 'UI 컴포넌트 import 경로', severity: 'error', source: 'knowledge/react/component.md', docId: 'react/component' },
  { id: 'router-hook', title: 'react-router 훅 사용', severity: 'error', source: '계약카드 router', docId: 'patterns/routing' },
  { id: 'envelope-unwrap', title: 'useApi 봉투 언랩 누락', severity: 'warning', source: 'knowledge/patterns/use-api.md §봉투 계약', docId: 'patterns/use-api' },
  { id: 'raw-http', title: 'useApi 밖 HTTP 호출', severity: 'warning', source: '계약카드 use-api', docId: 'patterns/use-api' },
  { id: 'window-dialog', title: 'window.alert / confirm', severity: 'warning', source: '계약카드 global-ui-alerts', docId: 'patterns/global-ui' },
  { id: 'type-naming', title: '타입 T/I 접두사', severity: 'warning', source: '계약카드 type-naming', docId: 'conventions/naming' },
];

export interface ILintOptions {
  /** 끌 규칙 id 목록(설정에서 온다). */
  disabledRules?: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 공통 도구
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 문자열·템플릿·주석의 **내용**을 같은 길이의 공백으로 덮은 사본을 만든다(오프셋·줄 수 보존).
 * 주석 속 `fetch(`, 문자열 속 타입 이름 같은 뻔한 오탐을 막는 1차 방어선이다.
 * 따옴표 자체는 남긴다(문자열 경계는 여전히 보여야 한다).
 *
 * 정규식 리터럴은 나눗셈과 문법적으로 구분되지 않아 다루지 않는다 — 대상(scaffold 화면 코드)에서
 * 따옴표를 품은 정규식은 사실상 없어 실익보다 오작동 위험이 크다.
 */
export function maskNonCode(text: string): string {
  const out = text.split('');
  const n = text.length;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === c) break;
        if (c !== '`' && text[j] === '\n') break; // 미종료 문자열이 파일 끝까지 먹지 않게
        j++;
      }
      blank(i + 1, j);
      i = Math.min(j + 1, n);
      continue;
    }
    i++;
  }
  return out.join('');
}

/** 0-based 오프셋 → {line, column}. */
function posOf(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, column: offset - lineStarts[lo] };
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/**
 * 스캔 1회분 컨텍스트 — 원문과 마스킹본을 함께 들고 다닌다.
 * 규칙마다 봐야 할 쪽이 다르다: 코드 토큰을 찾는 규칙은 `masked`(주석·문자열 오탐 제거),
 * import 경로처럼 **문자열 내용이 곧 대상**인 규칙은 `text`.
 */
interface IScanCtx {
  text: string;
  masked: string;
  maskedLines: string[];
  lineStarts: number[];
}

/**
 * whole-word 매칭 — `\b`보다 두 가지를 더 본다:
 *  - `$`/`_` 로 이어붙은 식별자 제외(`\b`는 `$`를 경계로 본다)
 *  - **프로퍼티 접근 제외**(`resp.data` 의 `data`). 이게 없으면 봉투 수정 `data?.data` 가 다시
 *    자기 자신을 위반으로 잡아 왕복이 안 끝난다.
 */
function isWholeWord(hay: string, start: number, len: number): boolean {
  const before = start > 0 ? hay[start - 1] : '';
  const after = start + len < hay.length ? hay[start + len] : '';
  return before !== '.' && !/[\w$]/.test(before) && !/[\w$]/.test(after);
}

// ─────────────────────────────────────────────────────────────────────────────
// 규칙
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ① 모듈 최상위 훅 호출 — 런타임 즉시 크래시. 편집 파이프라인의 쓰기 전 게이트와 **같은 탐지기**를 쓴다.
 * 자동 수정(컴포넌트 본문으로 hoist)은 파일 전체를 다시 쓰는 변환이라 호출부(vscode 레이어)가
 * `FileCreatorService.hoistModuleScopeHooks`로 제공한다 — 순수 모듈은 판정만 한다.
 */
function ruleModuleScopeHook(ctx: IScanCtx): ILintFinding[] {
  // ⚠ 마스킹본을 넘긴다. 쓰기 전 게이트는 모델이 방금 만든 코드를 원문으로 보지만, 린트는 **사람이 쓴
  //   기존 파일**을 보는데 거기엔 데모 페이지의 `const CODE = \`const [v] = useState()…\`` 같은 코드 예시
  //   템플릿 리터럴이 흔하다(실측: 실 scaffold에서 9건 중 7건이 이 오탐). 마스킹은 오프셋·줄 수를
  //   보존하므로 스퀴글 위치는 그대로다.
  return findModuleScopeHookCalls(ctx.masked).map((hit) => ({
    ruleId: 'module-scope-hook' as const,
    severity: 'error' as const,
    message:
      `\`${hit.hookName}\`이 모듈 최상위(컴포넌트 함수 밖)에서 호출됐습니다 — React Rules of Hooks 위반으로 런타임에 즉시 깨집니다. ` +
      `모든 \`use*\` 훅은 \`export default function 컴포넌트() { … }\` 본문 안, \`return\` 위에 두세요.`,
    line: hit.line,
    column: hit.column,
    endLine: hit.line,
    endColumn: hit.endColumn,
    docId: 'patterns/use-api',
  }));
}

/**
 * ② `refetch({ params: … })` — refetch는 TanStack Query 재조회 함수라 **params를 받지 않는다**.
 * 넘긴 인자는 조용히 무시되는 죽은 코드이므로 지우는 것이 정답이 하나뿐인 수정이다.
 * 파라미터를 바꾸려면 `useApi(endpoint, { params })` 쪽을 고쳐야 한다.
 *
 * 판정 어휘는 region 편집의 refetch 게이트(RegionEditService 4.5)와 맞춘다 —
 * `refetch({ throwOnError })` 같은 정당한 옵션은 `params` 키가 없어 비대상이다.
 */
function ruleRefetchArgs(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  const re = /\brefetch\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked)) !== null) {
    const openIdx = ctx.masked.indexOf('(', m.index);
    const close = matchParen(ctx.masked, openIdx);
    if (close < 0) continue;
    const argsMasked = ctx.masked.slice(openIdx + 1, close);
    if (!argsMasked.trim()) continue; // refetch() — 정상
    if (!/\bparams\s*:/.test(argsMasked)) continue; // throwOnError 등 정당한 옵션
    const start = posOf(ctx.lineStarts, m.index);
    const end = posOf(ctx.lineStarts, close + 1);
    findings.push({
      ruleId: 'refetch-args',
      severity: 'error',
      message:
        '`refetch()`는 인자를 받지 않습니다 — 넘긴 `params`는 무시되는 죽은 코드입니다. ' +
        '파라미터를 바꾸려면 `useApi(endpoint, { params: { … } })`의 `params`를 수정하세요(변경 시 자동 재조회).',
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      docId: 'patterns/use-api',
      fix: {
        title: '`refetch()` 로 인자 제거',
        edits: [{
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          text: 'refetch()',
        }],
      },
    });
  }
  return findings;
}

/** `open` 위치의 여는 괄호에 대응하는 닫는 괄호 오프셋(없으면 -1). */
function matchParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * ③ 봉투 언랩 누락 — `useApi<{ data: T[] }>`처럼 제네릭이 **봉투 객체**인데 목록을 `data` 그대로 쓰는 경우.
 *
 * scaffold의 `useApi`는 서버 응답 바디를 벗기지 않는다(knowledge/patterns/use-api.md §봉투 계약).
 * 제네릭이 `{ data: […] }`면 목록은 `data?.data`로 꺼내야 하는데, 이 실수는 **런타임에 조용히 빈 목록**이
 * 되어 화면만 비어 보인다. tsc가 잡아주는 경우도 있지만 메시지가 "Property 'map' does not exist"라
 * 개발자가 **제네릭을 배열로 되돌리는**(= 진짜 계약을 깨는) 반대 방향으로 고치기 쉬워 별도 안내가 필요하다.
 *
 * 보수적으로 판정한다: 제네릭이 **평평한 객체 리터럴**이고 그 안에 배열 필드가 **정확히 하나**일 때만.
 * (배열 필드가 여럿이면 어느 것이 목록인지 결정론으로 알 수 없다 → 침묵.)
 */
function ruleEnvelopeUnwrap(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  const declRe = /\b(?:const|let)\s*\{([^{}]*)\}\s*=\s*useApi\s*<\s*\{([^{}]*)\}\s*>\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(ctx.masked)) !== null) {
    const binding = bindingNameFor(m[1], 'data');
    if (!binding) continue;
    const arrayKeys = flatObjectTypeKeys(m[2]).filter((k) => k.isArray).map((k) => k.name);
    if (arrayKeys.length !== 1) continue;
    const key = arrayKeys[0];
    // 선언 이후 구간에서 binding을 배열처럼 쓰는 곳을 찾는다.
    const from = m.index + m[0].length;
    findings.push(...arrayUsages(ctx, binding, from, key));
  }
  return findings;
}

/** 구조분해 목록 문자열에서 `key`(또는 `key: alias`)의 실제 바인딩 이름을 찾는다. */
function bindingNameFor(destructure: string, key: string): string | null {
  for (const raw of destructure.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/);
    if (!m) continue;
    if (m[1] === key) return m[2] ?? m[1];
  }
  return null;
}

/** 평평한 객체 타입 리터럴 본문(`a: X[]; b: number`)의 필드 목록. */
function flatObjectTypeKeys(body: string): { name: string; isArray: boolean }[] {
  const out: { name: string; isArray: boolean }[] = [];
  for (const raw of body.split(/[;,]/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const type = m[2].trim();
    out.push({ name: m[1], isArray: /\[\]$/.test(type) || /^Array\s*</.test(type) });
  }
  return out;
}

/** 바인딩을 "배열처럼" 쓰는 표현들을 찾아 봉투 언랩 진단을 만든다. */
function arrayUsages(ctx: IScanCtx, binding: string, from: number, key: string): ILintFinding[] {
  const findings: ILintFinding[] = [];
  const esc = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `data ?? []` · `data || []` · `data.map(` · `data?.map(` · `data.length` · `data?.length`
  const useRe = new RegExp(`\\b${esc}\\s*(\\?\\?|\\|\\|)\\s*\\[\\s*\\]|\\b${esc}\\s*\\??\\.\\s*(map|filter|forEach|slice|length|find|some|every|reduce)\\b`, 'g');
  useRe.lastIndex = from;
  let u: RegExpExecArray | null;
  while ((u = useRe.exec(ctx.masked)) !== null) {
    if (!isWholeWord(ctx.masked, u.index, binding.length)) continue;
    const start = posOf(ctx.lineStarts, u.index);
    const end = posOf(ctx.lineStarts, u.index + binding.length);
    findings.push({
      ruleId: 'envelope-unwrap',
      severity: 'warning',
      message:
        `봉투 계약 — \`useApi\` 제네릭이 \`{ ${key}: […] }\` 이므로 \`${binding}\`는 배열이 아니라 **응답 바디 전체**입니다. ` +
        `목록은 \`${binding}?.${key}\`로 꺼내세요(예: \`const items = ${binding}?.${key} ?? [];\`). ` +
        `scaffold의 useApi는 서버 봉투를 벗기지 않습니다 — 이 상태로 두면 런타임에 조용히 빈 목록이 됩니다.`,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      docId: 'patterns/use-api',
      fix: {
        title: `\`${binding}?.${key}\` 로 봉투 열기`,
        edits: [{
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          text: `${binding}?.${key}`,
        }],
      },
    });
  }
  return findings;
}

/**
 * ④ useApi 밖 HTTP 호출 — scaffold에서 모든 HTTP 호출은 `useApi`(@axiom/hooks)로만 한다.
 * 자동 수정 없음: `fetch`를 훅으로 바꾸는 건 호출 위치·상태·에러 처리까지 함께 옮기는 구조 변경이라
 * 기계가 한 가지 정답을 고를 수 없다(모델이 있는 온라인 경로가 맡을 일).
 */
function ruleRawHttp(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  const patterns: { re: RegExp; what: string; how: string }[] = [
    { re: /(?<![.\w$])(fetch)\s*\(/g, what: '`fetch()` 직접 호출', how: '`const { data } = useApi<T>(\'/api/…\')`' },
    { re: /(?<![.\w$])(axios)\s*[.(]/g, what: 'axios 직접 호출', how: '`useApi` (내부적으로 공통 API 클라이언트를 씁니다)' },
    // ⚠ 제네릭이 있든 없든 **호출 괄호까지** 있어야 매칭한다. `<` 만 보면 JSX 산문의
    //    `<code>useQuery</code>` 가 제네릭 호출로 오인된다(실측: 실 scaffold의 useApi 설명 페이지).
    { re: /(?<![.\w$])(useQuery)\s*(?:<[^;{}]*?>)?\s*\(/g, what: '`useQuery` 직접 사용', how: '`useApi(endpoint)` (GET이면 자동으로 useQuery)' },
    { re: /(?<![.\w$])(useMutation)\s*(?:<[^;{}]*?>)?\s*\(/g, what: '`useMutation` 직접 사용', how: '`useApi(endpoint, { method: \'POST\', type: \'mutation\' })`' },
  ];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(ctx.masked)) !== null) {
      const start = posOf(ctx.lineStarts, m.index);
      const end = posOf(ctx.lineStarts, m.index + m[1].length);
      findings.push({
        ruleId: 'raw-http',
        severity: 'warning',
        message: `${p.what} — scaffold의 모든 HTTP 호출은 \`useApi\`(@axiom/hooks)로 합니다. → ${p.how}`,
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
        docId: 'patterns/use-api',
      });
    }
  }
  return findings;
}

/**
 * ⑤ react-router 훅 — 화면 이동은 전역 `$router`(import 불필요)로 한다.
 *
 * 자동 수정은 **한 줄짜리 `const nav = useNavigate();`** 모양에만 붙인다: 선언 줄을 지우고,
 * 호출부를 `$router.push/replace/back`으로 바꾸고, import 목록에서 `useNavigate`를 뺀다.
 * 그 외 모양(구조분해·재export·별칭 함수 전달 등)은 판정만 하고 사람에게 넘긴다.
 */
function ruleRouterHook(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  const re = /(?<![.\w$])(useNavigate|useHistory)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked)) !== null) {
    const hook = m[1];
    const start = posOf(ctx.lineStarts, m.index);
    const end = posOf(ctx.lineStarts, m.index + hook.length);
    const finding: ILintFinding = {
      ruleId: 'router-hook',
      severity: 'error',
      message:
        `\`${hook}()\` 대신 전역 \`$router\`를 쓰세요(import 불필요): ` +
        '`$router.push(\'/path\')` · `$router.replace(\'/path\')` · `$router.back()`.',
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      docId: 'patterns/routing',
    };
    if (hook === 'useNavigate') {
      const fix = buildNavigateFix(ctx, start.line);
      if (fix) finding.fix = fix;
    }
    findings.push(finding);
  }
  return findings;
}

/**
 * `const nav = useNavigate();` 한 줄 선언을 `$router` 호출로 갈아끼우는 수정을 만든다.
 * 선언 모양이 정확히 이 형태가 아니거나 호출부가 해석 불가한 인자를 쓰면 null(= 수동 수정).
 */
function buildNavigateFix(ctx: IScanCtx, declLine: number): ILintFix | null {
  const decl = ctx.maskedLines[declLine].match(/^(\s*)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*useNavigate\s*\(\s*\)\s*;?\s*$/);
  if (!decl) return null;
  const name = decl[2];
  const edits: ILintEdit[] = [];

  // 1) 선언 줄 삭제(다음 줄 시작까지 지워 빈 줄이 남지 않게)
  edits.push({ line: declLine, column: 0, endLine: declLine + 1, endColumn: 0, text: '' });

  // 2) 호출부 치환 — `nav(-1)` → `$router.back()`, `nav(x, { replace: true })` → `$router.replace(x)`, 그 외 push
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRe = new RegExp(`(?<![.\\w$])${esc}\\s*\\(`, 'g');
  let c: RegExpExecArray | null;
  while ((c = callRe.exec(ctx.masked)) !== null) {
    const openIdx = ctx.masked.indexOf('(', c.index);
    const close = matchParen(ctx.masked, openIdx);
    if (close < 0) return null; // 괄호가 안 닫히면 손대지 않는다
    const rawArgs = ctx.text.slice(openIdx + 1, close).trim();
    const maskedArgs = ctx.masked.slice(openIdx + 1, close);
    let replacement: string;
    if (/^-\s*1$/.test(rawArgs)) {
      replacement = '$router.back()';
    } else if (/,/.test(maskedArgs)) {
      const comma = splitTopLevelComma(maskedArgs);
      if (comma < 0) return null;
      const target = rawArgs.slice(0, comma).trim();
      const opts = maskedArgs.slice(comma + 1);
      if (!/\breplace\s*:\s*true\b/.test(opts)) return null; // state 전달 등은 기계가 옮길 수 없다
      replacement = `$router.replace(${target})`;
    } else if (rawArgs === '') {
      return null;
    } else {
      replacement = `$router.push(${rawArgs})`;
    }
    const s = posOf(ctx.lineStarts, c.index);
    const e = posOf(ctx.lineStarts, close + 1);
    edits.push({ line: s.line, column: s.column, endLine: e.line, endColumn: e.column, text: replacement });
  }

  // 3) import 목록에서 useNavigate 제거(빈 import는 줄째 삭제)
  const importEdit = buildImportSpecifierRemoval(ctx, 'useNavigate');
  if (importEdit) edits.push(importEdit);

  return { title: '`$router` 로 전환 (선언·호출부·import 정리)', edits };
}

/** 인자 문자열에서 최상위 콤마 위치(없으면 -1). */
function splitTopLevelComma(args: string): number {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}

/** named import 목록에서 지정자 하나를 빼는 편집(마지막 하나면 import 줄 전체 삭제). */
function buildImportSpecifierRemoval(ctx: IScanCtx, specifier: string): ILintEdit | null {
  for (let i = 0; i < ctx.maskedLines.length; i++) {
    const line = ctx.maskedLines[i];
    if (!/^\s*import\s*\{/.test(line)) continue;
    const open = line.indexOf('{');
    const close = line.indexOf('}', open);
    if (open < 0 || close < 0) continue;
    const names = line.slice(open + 1, close).split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.includes(specifier)) continue;
    const rest = names.filter((n) => n !== specifier);
    if (rest.length === 0) {
      return { line: i, column: 0, endLine: i + 1, endColumn: 0, text: '' };
    }
    return { line: i, column: open + 1, endLine: i, endColumn: close, text: ` ${rest.join(', ')} ` };
  }
  return null;
}

/**
 * ⑥ `window.alert` / `window.confirm` — 전역 `$ui`로 한다(디자인토큰·다크모드 적용 non-blocking 다이얼로그).
 *
 * alert만 자동 수정한다: `$ui.alert(…)`는 Promise를 돌려주지만 결과를 안 쓰는 알림이라 치환이 안전하다.
 * confirm은 **동기 boolean → Promise**로 의미가 바뀌어(`const ok = await $ui.confirm(…)`) 호출 문맥까지
 * 손봐야 하므로 자동 수정을 붙이지 않는다.
 */
function ruleWindowDialog(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  // `window.alert(` 와 전역 `alert(` 를 **각각의 대안**으로 쓴다 — 한 패턴에 optional `window.` +
  // 뒤따르는 `(?<![.\w$])` 를 붙이면 `window.` 를 소비한 직후 앞 글자가 `.` 이라 lookbehind 가 항상
  // 실패해 `window.alert(` 가 통째로 안 잡힌다(대신 `$ui.alert` 는 두 대안 모두에서 걸러진다).
  const re = /\bwindow\s*\.\s*(alert|confirm)\s*\(|(?<![.\w$])(alert|confirm)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked)) !== null) {
    const kind = m[1] ?? m[2];
    // `function alert(` · `const alert =` 같은 자체 정의는 대상 아님
    const head = ctx.masked.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(function|const|let|var|class)\s+$/.test(head)) continue;
    // 범위는 `window.alert` 전체(또는 `alert`) — 여는 괄호 앞 공백은 뺀다.
    let rel = m[0].lastIndexOf('(');
    while (rel > 0 && /\s/.test(m[0][rel - 1])) rel--;
    const start = posOf(ctx.lineStarts, m.index);
    const end = posOf(ctx.lineStarts, m.index + rel);
    const finding: ILintFinding = {
      ruleId: 'window-dialog',
      severity: 'warning',
      message: kind === 'alert'
        ? '알림은 전역 `$ui`로 합니다(import 불필요): `await $ui.alert(\'메시지\')`. `$ui`는 디자인토큰·다크모드가 적용된 non-blocking 다이얼로그입니다.'
        : '확인 창은 전역 `$ui`로 합니다: `const ok = await $ui.confirm(\'메시지\')` (확인=`true`). 동기 boolean이 아니라 Promise라 호출부도 `async`로 바꿔야 합니다.',
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      docId: 'patterns/global-ui',
    };
    if (kind === 'alert') {
      finding.fix = {
        title: '`$ui.alert(…)` 로 교체',
        edits: [{ line: start.line, column: start.column, endLine: end.line, endColumn: end.column, text: '$ui.alert' }],
      };
    }
    findings.push(finding);
  }
  return findings;
}

/**
 * ⑦ UI 컴포넌트 import 경로 — 배럴 `@axiom/components/ui` 단일 경로만 쓴다.
 * 서브경로(`@axiom/components/ui/table`)나 shadcn 내부 경로 직접 임포트는 금지다
 * (배럴이 프로젝트 오버라이드를 흡수하는 지점이라, 우회하면 커스터마이즈가 통째로 빠진다).
 */
function ruleUiImportPath(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  // ⚠ **실제 import 문**만 본다(마스킹본에서 `import` 로 시작하는 줄을 먼저 확인).
  //   경로 문자열은 마스킹되므로 값은 원문에서 읽는다. 그냥 전체 텍스트에서 `from '…'` 을 찾으면
  //   데모 페이지가 화면에 보여주는 코드 예시 문자열(`code={\`import … from "@/shared/lib/shadcn/ui/carousel"\`}`)
  //   까지 잡아 고칠 수 없는 진단이 뜬다(실측).
  const re = /\bfrom\s*(['"])([^'"\n]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.text)) !== null) {
    const spec = m[2];
    const isSubpath = spec.startsWith('@axiom/components/ui/');
    const isShadcnInner = /shadcn/.test(spec) && /\/ui(\/|$)/.test(spec);
    if (!isSubpath && !isShadcnInner) continue;
    const quoteStart = m.index + m[0].indexOf(m[1]);
    const start = posOf(ctx.lineStarts, quoteStart);
    if (!/^\s*(?:import\b|\}\s*from\b)/.test(ctx.maskedLines[start.line] ?? '')) continue;
    const end = posOf(ctx.lineStarts, quoteStart + spec.length + 2);
    findings.push({
      ruleId: 'ui-import-path',
      severity: 'error',
      message:
        `UI 컴포넌트는 배럴 \`@axiom/components/ui\` 한 경로에서만 import 합니다 — \`${spec}\` 같은 내부/서브 경로 직접 임포트는 금지입니다. ` +
        '배럴이 프로젝트 오버라이드를 흡수하는 지점이라, 우회하면 커스터마이즈가 적용되지 않습니다.',
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      docId: 'react/component',
      fix: {
        title: "`@axiom/components/ui` 로 경로 교체",
        edits: [{
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          text: `'@axiom/components/ui'`,
        }],
      },
    });
  }
  return findings;
}

/**
 * ⑧ 타입 네이밍 — `type` + `T` 접두사, `interface` + `I` 접두사.
 * Props 타입(`type UserCardProps`)은 계약상 접두사가 없으므로 검사 대상에서 뺀다.
 *
 * 자동 수정은 **파일 안의 참조까지 함께** 바꾼다(선언만 고치면 그 자리에서 컴파일이 깨진다).
 * 다른 파일에서 import 해 쓰는 타입이면 이 수정으로 그쪽이 깨질 수 있어, 제목에 범위를 밝힌다.
 */
function ruleTypeNaming(ctx: IScanCtx): ILintFinding[] {
  const findings: ILintFinding[] = [];
  // ⚠ **선언**만 잡는다 — 이름 뒤가 `=`(type) 또는 `{`/`extends`(interface)여야 한다.
  //   그냥 `type\s+Name` 으로 잡으면 여러 줄 import 의 타입 지정자(`import {⏎  type AxiosInstance,⏎ …`)가
  //   줄머리에서 매칭돼 남의 라이브러리 타입에 접두사를 요구한다(실측: 실 scaffold에서 96건 중 다수가 이것).
  const re = /^(\s*)(?:export\s+)?(?:(type)\s+([A-Za-z_$][\w$]*)\s*(?:<[^=]*>)?\s*=|(interface)\s+([A-Za-z_$][\w$]*)\s*(?:<[^{]*>)?\s*(?:extends\b|\{))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked)) !== null) {
    const kind = (m[2] ?? m[4]) as 'type' | 'interface';
    const name = m[3] ?? m[5];
    // Props 는 이름이 무슨 모양이든 전부 비대상이다.
    // 계약카드는 "Props 타입은 `type`, 접두사 없음"이라고 하지만 실 scaffold는 `interface IXxxProps` 를
    // 압도적으로 쓴다(실측 91곳). 규칙의 목적은 **접두사 누락**을 잡는 것이지 코드베이스가 이미 정착시킨
    // 스타일을 뒤집는 게 아니다 — 여기서 91건을 띄우면 팀은 린트 전체를 끈다(§오탐 정책).
    if (/Props$/.test(name)) continue;
    const want = kind === 'type' ? 'T' : 'I';
    if (name.startsWith(want) && /[A-Z]/.test(name[1] ?? '')) continue;
    // m[0]은 이제 뒤쪽(`= …` / `{`)까지 포함하므로 키워드 다음의 이름 위치를 직접 찾는다.
    const nameStart = m.index + m[0].indexOf(name, m[0].indexOf(kind) + kind.length);
    const start = posOf(ctx.lineStarts, nameStart);
    const newName = want + name;
    findings.push({
      ruleId: 'type-naming',
      severity: 'warning',
      message:
        `${kind === 'type' ? '타입은 `type` + `T` 접두사' : '인터페이스는 `interface` + `I` 접두사'}를 씁니다 — ` +
        `\`${name}\` → \`${newName}\`. (이름이 \`Props\`로 끝나는 타입은 검사하지 않습니다.)`,
      line: start.line,
      column: start.column,
      endLine: start.line,
      endColumn: start.column + name.length,
      docId: 'conventions/naming',
      fix: {
        title: `\`${newName}\` 로 이름 변경 (이 파일 안의 참조 포함)`,
        edits: renameEdits(ctx, name, newName),
      },
    });
  }
  return findings;
}

/** 파일 안의 whole-word 식별자 전부를 새 이름으로 바꾸는 편집 목록(문자열·주석 제외). */
function renameEdits(ctx: IScanCtx, from: string, to: string): ILintEdit[] {
  const edits: ILintEdit[] = [];
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(ctx.masked)) !== null) {
    if (!isWholeWord(ctx.masked, m.index, from.length)) continue;
    const s = posOf(ctx.lineStarts, m.index);
    edits.push({ line: s.line, column: s.column, endLine: s.line, endColumn: s.column + from.length, text: to });
  }
  return edits;
}

// ─────────────────────────────────────────────────────────────────────────────
// 엔트리
// ─────────────────────────────────────────────────────────────────────────────

const RULE_FNS: { id: TLintRuleId; run: (ctx: IScanCtx) => ILintFinding[] }[] = [
  { id: 'module-scope-hook', run: ruleModuleScopeHook },
  { id: 'refetch-args', run: ruleRefetchArgs },
  { id: 'envelope-unwrap', run: ruleEnvelopeUnwrap },
  { id: 'raw-http', run: ruleRawHttp },
  { id: 'router-hook', run: ruleRouterHook },
  { id: 'window-dialog', run: ruleWindowDialog },
  { id: 'ui-import-path', run: ruleUiImportPath },
  { id: 'type-naming', run: ruleTypeNaming },
];

/**
 * 소스 한 장을 scaffold 계약으로 검사한다. 규칙 하나가 예외를 던져도 나머지는 계속 돈다
 * (fail-open — 린트가 파일 하나 때문에 통째로 침묵하면 안 된다).
 * 결과는 위치 순으로 정렬해 돌려준다.
 */
export function lintScaffoldSource(text: string, opts: ILintOptions = {}): ILintFinding[] {
  const disabled = new Set(opts.disabledRules ?? []);
  const masked = maskNonCode(text);
  const ctx: IScanCtx = {
    text,
    masked,
    maskedLines: masked.split('\n'),
    lineStarts: computeLineStarts(text),
  };

  const findings: ILintFinding[] = [];
  for (const rule of RULE_FNS) {
    if (disabled.has(rule.id)) continue;
    try {
      findings.push(...rule.run(ctx));
    } catch {
      // 규칙 하나의 실패가 전체 진단을 죽이지 않게 삼킨다.
    }
  }
  findings.sort((a, b) => (a.line - b.line) || (a.column - b.column) || a.ruleId.localeCompare(b.ruleId));
  return findings;
}

/**
 * 편집들을 텍스트에 적용한 결과. 테스트·드라이런용(실제 편집기 적용은 WorkspaceEdit가 한다).
 * 뒤에서부터 적용해 앞선 편집이 뒤 좌표를 밀지 않게 한다.
 */
export function applyLintEdits(text: string, edits: readonly ILintEdit[]): string {
  const lineStarts = computeLineStarts(text);
  const offset = (line: number, column: number): number =>
    line >= lineStarts.length ? text.length : lineStarts[line] + column;
  const sorted = [...edits].sort((a, b) => offset(b.line, b.column) - offset(a.line, a.column));
  let out = text;
  for (const e of sorted) {
    out = out.slice(0, offset(e.line, e.column)) + e.text + out.slice(offset(e.endLine, e.endColumn));
  }
  return out;
}
