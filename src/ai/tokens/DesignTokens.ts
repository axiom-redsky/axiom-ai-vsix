/**
 * 디자인 토큰 (계획서 §7 B3) — scaffold의 CSS 변수를 **사람이 읽을 수 있는 값**으로 만드는 순수 층.
 *
 * ## 왜 필요한가
 * `--color-primary` 하나를 알아내려면 지금은 파일 세 개를 손으로 따라가야 한다:
 * `theme-light.css`에서 `var(--color-brand-500)`을 찾고 → `primitive.css`에서 `#465fff`를 찾고 →
 * 그런데 `themes/theme-default.css`가 brand를 **덮어써서** 실제로는 `#499ed8`이다.
 * 편집기도 tsc도 이 체인을 풀어 주지 않는다. 이 모듈이 그 계산을 대신한다.
 *
 * ## 실제 파일이 가르쳐 준 세 가지 (전부 여기 반영돼 있다)
 * 1. **한 토큰에 값이 둘**이다 — `:root`(라이트)와 `.dark`(다크). 하나만 보여주면 절반이 거짓이 된다.
 * 2. **순서가 값을 바꾼다** — `app.css`의 `@import` 순서가 곧 덮어쓰기 순서다. 그래서 이 모듈은
 *    파일을 **받은 순서대로** 병합한다(정렬하지 않는다).
 * 3. **다크는 덮어쓰기지 전체 정의가 아니다** — `.dark`가 안 적은 토큰은 라이트 값을 그대로 쓴다.
 *
 * vscode·fs 비의존(텍스트만 받는다) — 단위 테스트와 **웹뷰**(검색·필터)에서 그대로 호출한다.
 */

/** 값이 정의된 자리. `.dark` 계열이면 dark, `:root`·`@theme` 계열이면 light. */
export type TTokenScope = 'light' | 'dark';

/** 토큰의 쓰임새 — 화면에 어떻게 그릴지(견본·그림자 미리보기·글자)를 가른다. */
export type TTokenKind = 'color' | 'shadow' | 'size' | 'font' | 'number' | 'other';

export interface ITokenDeclaration {
  /** `--color-primary` (`--` 포함). */
  name: string;
  /** 선언된 값 원문(`var(--color-brand-500)`). */
  value: string;
  scope: TTokenScope;
  /** 표시용 파일 경로(호출자가 준 그대로). */
  file: string;
  /** 1-based 줄 번호 — "소스 열기"가 그 줄로 간다. */
  line: number;
}

export interface ITokenValue {
  /** 선언 원문. */
  raw: string;
  /** `var()` 체인을 끝까지 푼 값. 못 푸는 참조는 원문 그대로 남긴다(거짓말하지 않는다). */
  resolved: string;
  /** 거쳐 온 참조들(`['--color-brand-500']`) — "왜 이 값인지"를 보여주는 근거. */
  chain: string[];
  kind: TTokenKind;
  /** 색이면 CSS에 그대로 넣을 수 있는 문자열, 아니면 null. */
  color: string | null;
  file: string;
  line: number;
}

export interface IDesignToken {
  /** `--color-primary`. */
  name: string;
  /** `color-primary` — 목록·검색용 짧은 이름. */
  label: string;
  /** 첫 세그먼트(`color`·`shadow`·`text`·`z-index`…). 목록 그룹핑 축. */
  group: string;
  kind: TTokenKind;
  light: ITokenValue | null;
  /** 다크에서 **다시 정의된** 경우에만 채워진다(같으면 null — "다크도 같다"가 사실이다). */
  dark: ITokenValue | null;
}

export interface ITokenSet {
  tokens: IDesignToken[];
  /** 읽은 파일들(순서 = 덮어쓰기 순서). */
  files: string[];
  counts: { total: number; colors: number; overriddenInDark: number };
}

// ── CSS 파싱 ─────────────────────────────────────────────────────────────────

/** 주석 제거 — 줄 번호를 지키려고 **줄바꿈은 남기고** 나머지만 공백으로 바꾼다. */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * 이 선택자가 **전역 토큰을 정의하는 자리**인가, 그렇다면 어느 테마인가.
 * 컴포넌트 선택자(`.menu-item-active` 등) 안의 변수는 그 컴포넌트의 지역 변수지 디자인 토큰이 아니다.
 */
export function scopeOfSelector(selector: string): TTokenScope | null {
  const s = selector.trim().toLowerCase();
  if (!s) return null;

  // 다크: `.dark` · `html.dark` · `.dark *` · `[data-theme="dark"]` · `@media (prefers-color-scheme: dark)`
  const isDark = (h: string): boolean =>
    /(^|\s|\.)dark(\s|$|\.|\*)/.test(h)
    || /\[data-theme=["']?dark["']?\]/.test(h)
    || /prefers-color-scheme\s*:\s*dark/.test(h);
  if (isDark(s)) return 'dark';

  if (/^@theme\b/.test(s)) return 'light'; // Tailwind v4 `@theme` / `@theme inline`
  // 라이트(기본): `:root`, `html`, `:host`, `*`
  const heads = s.split(',').map((p) => p.trim());
  if (heads.some((h) => /^(:root|html|:host|\*)$/.test(h))) return 'light';
  return null;
}

/**
 * CSS 텍스트에서 전역 토큰 선언을 뽑는다.
 *
 * 블록 중첩(`@media { :root { … } }`)을 위해 선택자 스택을 쓰고, **가장 안쪽** 블록의 선택자로 판정한다.
 * 값은 여러 줄일 수 있어(그림자) 괄호 깊이 0의 `;`까지 읽는다.
 */
export function parseCssTokens(text: string, file: string): ITokenDeclaration[] {
  const src = stripComments(text);
  const out: ITokenDeclaration[] = [];
  const stack: (TTokenScope | null)[] = [];
  let selector = '';
  let i = 0;
  let line = 1;

  const advance = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (src[k] === '\n') line++;
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === '{') {
      stack.push(scopeOfSelector(selector));
      selector = '';
      i++;
      continue;
    }
    if (ch === '}') {
      stack.pop();
      selector = '';
      i++;
      continue;
    }
    if (ch === ';') {
      selector = '';
      i++;
      continue;
    }

    // `--name: value;` — 지금 블록이 토큰 자리일 때만 채택한다.
    if (ch === '-' && src[i + 1] === '-') {
      const m = /^--([A-Za-z0-9_-]+)\s*:/.exec(src.slice(i));
      if (m) {
        // 가장 안쪽 블록이 기준이되, 조상 중 다크가 있으면 다크다
        // (`@media (prefers-color-scheme: dark) { :root { … } }`).
        const scope = stack.includes('dark')
          ? 'dark'
          : [...stack].reverse().find((sc) => sc !== null) ?? null;
        const startLine = line;
        let j = i + m[0].length;
        let depth = 0;
        let quote: string | null = null;
        while (j < src.length) {
          const c = src[j];
          if (quote) {
            if (c === quote && src[j - 1] !== '\\') quote = null;
          } else if (c === '"' || c === "'") quote = c;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
          else if ((c === ';' || c === '}') && depth <= 0) break;
          j++;
        }
        const value = src.slice(i + m[0].length, j).trim();
        if (scope && value) {
          out.push({ name: `--${m[1]}`, value: value.replace(/\s+/g, ' '), scope, file, line: startLine });
        }
        advance(i, j);
        i = j;
        selector = '';
        continue;
      }
    }

    if (ch === '\n') line++;
    selector += ch;
    i++;
  }
  return out;
}

/**
 * `app.css`가 실제로 `@import` 한 파일 목록(주석 처리된 것은 제외).
 *
 * ★ 이게 중요하다: `themes/` 폴더에는 쓰지 않는 테마 파일이 함께 들어 있고(`theme-example-project.css`)
 * 폴더를 통째로 읽으면 **활성이 아닌 테마 값**이 섞인다. 진실은 진입점의 import 목록이다.
 * 반환 순서 = 선언 순서 = 덮어쓰기 순서.
 */
export function parseImportOrder(appCss: string): string[] {
  const src = stripComments(appCss);
  const out: string[] = [];
  for (const m of src.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?/g)) {
    const spec = m[1];
    if (/^(?:https?:)?\/\//.test(spec)) continue; // 외부 URL은 읽을 수 없다
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // 패키지(tailwindcss 등)는 대상 아님
    out.push(spec.replace(/^\.\//, ''));
  }
  return out;
}

// ── 값 해석 ──────────────────────────────────────────────────────────────────

const COLOR_FUNCS = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const NAMED_COLORS = new Set(['transparent', 'currentcolor', 'white', 'black', 'inherit']);

/** 이 값이 **그 자체로 색**인가(그림자·복합값은 여기서 참이 아니다). */
export function isColorValue(value: string): boolean {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
  if (COLOR_FUNCS.test(v)) {
    // 색 함수 하나로 끝나야 색이다 — `0 1px 2px rgba(…)`(그림자)는 여기 안 걸린다.
    const close = matchingParen(v, v.indexOf('('));
    return close === v.length - 1;
  }
  return NAMED_COLORS.has(v.toLowerCase());
}

function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 이름 접두사 → 쓰임새. scaffold 토큰은 대부분 접두사가 말해 준다. */
const KIND_BY_PREFIX: { prefix: RegExp; kind: TTokenKind }[] = [
  { prefix: /^--(color|chart|sidebar)(-|$)/, kind: 'color' },
  { prefix: /^--(shadow|drop-shadow)(-|$)/, kind: 'shadow' },
  { prefix: /^--(text|radius|breakpoint|spacing|size|width|height|leading|tracking)(-|$)/, kind: 'size' },
  { prefix: /^--font(-|$)/, kind: 'font' },
  { prefix: /^--z-index(-|$)/, kind: 'number' },
];

/**
 * 쓰임새 판정 — **이름 접두사 먼저, 그다음 값 모양**.
 * 브랜드 테마의 시맨틱 토큰(`--background`·`--primary`·`--radius`)은 접두사가 없어 값으로 가려야 한다.
 */
export function classifyToken(name: string, resolved: string): TTokenKind {
  for (const r of KIND_BY_PREFIX) if (r.prefix.test(name)) return r.kind;
  const v = resolved.trim();
  if (isColorValue(v)) return 'color';
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|ch|deg)$/.test(v) || /^calc\(/.test(v)) return 'size';
  if (/^-?[\d.]+$/.test(v)) return 'number';
  if (/,/.test(v) && /[A-Za-z]/.test(v) && !/\(/.test(v)) return 'font'; // 'Geist Variable', sans-serif
  return 'other';
}

/** 값 하나를 `var()` 체인 끝까지 푼다. 못 푸는 참조는 그대로 남기고, 순환은 한 번에 끊는다. */
export function resolveValue(
  raw: string,
  table: Map<string, string>,
  seen: Set<string> = new Set(),
): { resolved: string; chain: string[] } {
  const chain: string[] = [];
  let value = raw;
  // 깊이 제한 — 이론상 순환은 seen이 막지만, 상호 참조가 섞인 CSS에서 무한 확장을 확실히 끊는다.
  for (let depth = 0; depth < 12; depth++) {
    const m = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([\s\S]*))?\)/.exec(value);
    if (!m) break;
    const ref = m[1];
    const fallback = m[2]?.trim();
    let replacement: string;
    if (seen.has(ref)) {
      break; // 순환 — 더 풀지 않고 지금 값을 그대로 둔다
    } else if (table.has(ref)) {
      seen.add(ref);
      chain.push(ref);
      replacement = table.get(ref) as string;
    } else if (fallback) {
      chain.push(`${ref}(미정의 → 대체값)`);
      replacement = fallback;
    } else {
      break; // 모르는 참조는 원문 유지 — 값을 지어내지 않는다
    }
    value = value.slice(0, m.index) + replacement + value.slice(m.index + m[0].length);
  }
  return { resolved: value.replace(/\s+/g, ' ').trim(), chain };
}

// ── 토큰 집합 조립 ────────────────────────────────────────────────────────────

export interface ITokenFile {
  /** 표시용 경로(예: `tokens/primitive.css`). */
  path: string;
  text: string;
}

/**
 * 파일들을 **받은 순서대로** 병합해 토큰 집합을 만든다(순서 = `app.css` @import 순서 = 덮어쓰기 순서).
 *
 * 다크 표는 라이트 표 **위에** 얹는다 — `.dark`는 덮어쓰기지 전체 정의가 아니므로, 다크가 안 적은
 * 토큰은 라이트 값이 그대로 쓰인다(실제 브라우저 동작과 같게).
 */
export function buildTokenSet(files: ITokenFile[]): ITokenSet {
  const declarations: ITokenDeclaration[] = [];
  for (const f of files) declarations.push(...parseCssTokens(f.text, f.path));

  // 마지막 선언이 이긴다.
  const lightDecl = new Map<string, ITokenDeclaration>();
  const darkDecl = new Map<string, ITokenDeclaration>();
  for (const d of declarations) {
    (d.scope === 'dark' ? darkDecl : lightDecl).set(d.name, d);
  }

  const lightTable = new Map<string, string>();
  for (const [name, d] of lightDecl) lightTable.set(name, d.value);
  const darkTable = new Map(lightTable);
  for (const [name, d] of darkDecl) darkTable.set(name, d.value);

  const names = new Set<string>([...lightDecl.keys(), ...darkDecl.keys()]);
  const tokens: IDesignToken[] = [];

  for (const name of names) {
    const ld = lightDecl.get(name);
    const dd = darkDecl.get(name);
    const light = ld ? toValue(ld, lightTable) : null;
    // 다크는 **다시 정의됐을 때만** 만든다. 다크에도 라이트와 같은 결과면 "차이 없음"이 사실이다.
    let dark = dd ? toValue(dd, darkTable) : null;
    if (!dd && ld) {
      // 다크에서 재정의되진 않았지만 **참조하는 토큰**이 다크에서 바뀌었을 수 있다(간접 변화).
      const indirect = toValue(ld, darkTable);
      if (light && indirect.resolved !== light.resolved) dark = indirect;
    }
    if (dark && light && dark.resolved === light.resolved && dark.raw === light.raw) dark = null;

    const kind = classifyToken(name, light?.resolved ?? dark?.resolved ?? '');
    tokens.push({
      name,
      label: name.replace(/^--/, ''),
      group: groupOf(name),
      kind,
      light: light ? { ...light, kind, color: kind === 'color' ? light.resolved : null } : null,
      dark: dark ? { ...dark, kind, color: kind === 'color' ? dark.resolved : null } : null,
    });
  }

  tokens.sort((a, b) => a.name.localeCompare(b.name));
  return {
    tokens,
    files: files.map((f) => f.path),
    counts: {
      total: tokens.length,
      colors: tokens.filter((t) => t.kind === 'color').length,
      overriddenInDark: tokens.filter((t) => t.dark !== null).length,
    },
  };
}

function toValue(d: ITokenDeclaration, table: Map<string, string>): ITokenValue {
  const { resolved, chain } = resolveValue(d.value, table, new Set([d.name]));
  return { raw: d.value, resolved, chain, kind: 'other', color: null, file: d.file, line: d.line };
}

/** 그룹 = 첫 세그먼트. `--z-index-9`는 `z-index`로 묶는다(두 단어 접두사 예외). */
export function groupOf(name: string): string {
  const bare = name.replace(/^--/, '');
  if (/^z-index/.test(bare)) return 'z-index';
  if (/^drop-shadow/.test(bare)) return 'drop-shadow';
  if (/^blue-light/.test(bare)) return 'blue-light';
  const head = bare.split('-')[0];
  return head || bare;
}

// ── 검색 ─────────────────────────────────────────────────────────────────────

/** 한글로도 찾을 수 있게 하는 최소 별칭(웹뷰 검색창이 그대로 쓴다). */
const QUERY_ALIASES: Record<string, string[]> = {
  색: ['color'], 컬러: ['color'], 색상: ['color'],
  그림자: ['shadow'], 쉐도우: ['shadow'],
  글꼴: ['font'], 폰트: ['font'], 글자: ['text', 'font'],
  크기: ['text', 'size'], 여백: ['spacing'],
  모서리: ['radius'], 반경: ['radius'], 라운드: ['radius'],
  브랜드: ['brand'], 주색: ['primary'], 배경: ['background'], 테두리: ['border'],
  경고: ['warning'], 오류: ['error'], 성공: ['success'], 회색: ['gray'],
};

/** 검색 — 이름·그룹·값 전부를 본다(`499ed8`로 찾으면 그 색을 쓰는 토큰이 나온다). */
export function searchTokens(tokens: IDesignToken[], query: string): IDesignToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens;
  const terms = q.split(/[\s,]+/).filter(Boolean);

  const expand = (t: string): string[] => [t, ...(QUERY_ALIASES[t] ?? [])];

  return tokens.filter((token) =>
    terms.every((term) =>
      expand(term).some((t) =>
        token.name.toLowerCase().includes(t)
        || token.group.toLowerCase().includes(t)
        || (token.light?.resolved.toLowerCase().includes(t) ?? false)
        || (token.light?.raw.toLowerCase().includes(t) ?? false)
        || (token.dark?.resolved.toLowerCase().includes(t) ?? false),
      ),
    ),
  );
}

/** 이름으로 하나 찾기(`--` 유무 무관). */
export function findToken(tokens: IDesignToken[], name: string): IDesignToken | null {
  const full = name.startsWith('--') ? name : `--${name}`;
  return tokens.find((t) => t.name === full) ?? null;
}
