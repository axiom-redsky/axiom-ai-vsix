/**
 * JSON → TypeScript 타입 생성기 (오프라인 전용, 100% 결정론).
 *
 * 배경: 오프라인 모드(AI 서버 불가)는 retrieval-only라 "입력을 보고 새 산출물을 계산"하지 못한다.
 * 그러나 JSON → TS 타입은 LLM 없이도 가능한 **순수 변환**이라 오프라인에 잘 맞는다. 이 모듈은
 *   ① **판단** detectJsonTypeRequest — "이 JSON으로 타입 만들어줘" 요청인지 결정론 술어로 가린다.
 *   ② **생성** generateTypeFromJson — react-app-scaffold 타입 규칙(T/I 접두사 등)을 적용해 타입을 만든다.
 *
 * 설계 원칙:
 *  - vscode/디스크 비의존(순수 함수) — 테스트 게이트에서 그대로 호출.
 *  - 온라인 경로(IntentKind·IntentClassifier·OfflineResponder) 무수정 — 호출부에서 short-circuit만.
 *  - 단일 샘플로 추론 불가한 것(리터럴 유니온·enum·DTO 파생)은 **추론하지 않고** string/unknown로 둔다.
 *  - optional(`?`)은 전달된 JSON의 값(null·키 누락)만으로 판정한다(사용자 합의).
 *
 * 규칙 출처: knowledge/conventions/typescript.md
 *  - `type` 선호(+`T` 접두사), 확장 필요/명시 시 `interface`(+`I` 접두사).
 *  - `any` 금지 → null/빈 배열/빈 객체는 `unknown`/`unknown[]`/`Record<string, unknown>`.
 *  - 중첩 객체는 별도 명명 타입으로 분리(hoist).
 */

/** 생성할 선언 종류 — type(기본) 또는 interface(쿼리에 명시). */
export type TJsonTypeKind = 'type' | 'interface';

/** 입력 소스 — 우선순위 캐스케이드(채팅 본문 → 선택 영역 → 현재 .json 파일). */
export type TJsonTypeSource = 'chat' | 'selection' | 'file';

/** 판단 결과 — 타입 생성에 필요한 모든 입력. */
export interface IJsonTypeRequest {
  /** 파싱된 JSON 값(객체·배열·원시 모두 허용). */
  json: unknown;
  /** 접두사 제외 PascalCase 베이스 이름(예: "User"). */
  rootName: string;
  kind: TJsonTypeKind;
  source: TJsonTypeSource;
}

/** detectJsonTypeRequest 입력 — 호출부가 채팅/에디터에서 모아 주입. */
export interface IJsonTypeSources {
  query: string;
  selectionText?: string | null;
  fileContent?: string | null;
  filePath?: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// ① 판단 (detection)
// ──────────────────────────────────────────────────────────────────────────

/**
 * "이 JSON으로 타입 만들어줘" 요청인지 판정한다.
 * **두 조건 모두** 충족해야 한다(오탐 방지):
 *   (1) 쿼리에 타입 생성 신호(타입/type/인터페이스/interface + 동작어)가 있고,
 *   (2) 채팅 본문 → 선택 영역 → 현재 .json 파일 순으로 파싱 가능한 JSON이 하나라도 있다.
 * 둘 중 하나라도 없으면 null(호출부는 기존 오프라인 흐름으로 폴백).
 */
export function detectJsonTypeRequest(sources: IJsonTypeSources): IJsonTypeRequest | null {
  const query = sources.query ?? '';
  if (!hasTypeGenSignal(query)) return null;

  const candidates: Array<[TJsonTypeSource, string]> = [['chat', query]];
  if (sources.selectionText && sources.selectionText.trim()) {
    candidates.push(['selection', sources.selectionText]);
  }
  if (sources.fileContent && isJsonFile(sources.filePath)) {
    candidates.push(['file', sources.fileContent]);
  }

  for (const [source, text] of candidates) {
    const json = extractJson(text);
    if (json !== undefined) {
      return { json, rootName: extractRootName(query) ?? 'Root', kind: detectKind(query), source };
    }
  }
  return null;
}

/** 타입 생성 신호: 타입어 + 동작어(또는 "json → type" 같은 명시 어구). */
function hasTypeGenSignal(q: string): boolean {
  if (/json\s*(을|를|으로|로)?\s*(타입|type|인터페이스|interface)/i.test(q)) return true;
  if (/to\s*(type|interface)/i.test(q)) return true;
  const hasType = /(타입|type|인터페이스|interface)/i.test(q);
  const hasAction = /(만들|생성|뽑|변환|정의|작성|구성|줘|달라|해줘|보여)/i.test(q);
  return hasType && hasAction;
}

/** interface 명시(인터페이스/interface)면 interface, 아니면 type 선호(convention). */
function detectKind(q: string): TJsonTypeKind {
  return /(인터페이스|interface)/i.test(q) ? 'interface' : 'type';
}

/** 쿼리에서 원하는 타입명을 추출한다(예: "User 타입으로", "TUser type"). 없으면 null. */
function extractRootName(q: string): string | null {
  const m = q.match(/([A-Za-z][A-Za-z0-9]*)\s*(?:타입|type|인터페이스|interface)/);
  return m ? m[1] : null;
}

function isJsonFile(filePath?: string | null): boolean {
  return !!filePath && /\.jsonc?$/i.test(filePath);
}

/** 텍스트에서 JSON을 추출한다. 펜스 블록 우선, 없으면 균형 괄호 스캔. 실패 시 undefined. */
function extractJson(text: string): unknown | undefined {
  const fence = text.match(/```(?:json|jsonc)?\s*\n?([\s\S]*?)```/i);
  if (fence) {
    const v = tryParse(fence[1]);
    if (v !== undefined) return v;
  }
  // 펜스가 없거나 펜스 내용이 JSON이 아니면, 본문에서 첫 균형 괄호 그룹을 스캔.
  return scanBalanced(text);
}

function tryParse(s: string): unknown | undefined {
  const t = s.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** 첫 '{' 또는 '['에서 시작하는 균형 괄호 substring을 찾아 JSON.parse 시도(객체/배열만 채택). */
function scanBalanced(text: string): unknown | undefined {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = matchBalanced(text, i);
    if (end < 0) continue;
    const v = tryParse(text.slice(i, end + 1));
    if (v !== undefined && typeof v === 'object' && v !== null) return v;
  }
  return undefined;
}

/** start의 괄호와 짝이 맞는 닫는 괄호 인덱스를 반환(문자열 리터럴 내부는 무시). 없으면 -1. */
function matchBalanced(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ──────────────────────────────────────────────────────────────────────────
// ② 생성 (generation)
// ──────────────────────────────────────────────────────────────────────────

interface IGenCtx {
  kind: TJsonTypeKind;
  prefix: 'T' | 'I';
  /** 선언명 → { body, isObject }. isObject=true면 interface로도 렌더 가능. */
  decls: Map<string, { body: string; isObject: boolean }>;
  /** 선언 출력 순서(의존 대상이 먼저 오도록 등록 순서 유지). */
  order: string[];
}

/**
 * JSON과 옵션을 받아 scaffold 타입 규칙을 적용한 TypeScript 선언(들)을 문자열로 생성한다.
 * 중첩 객체는 별도 명명 타입으로 hoist되며, 의존 대상이 먼저 선언된다.
 */
export function generateTypeFromJson(req: IJsonTypeRequest): string {
  const prefix: 'T' | 'I' = req.kind === 'interface' ? 'I' : 'T';
  const ctx: IGenCtx = { kind: req.kind, prefix, decls: new Map(), order: [] };
  const base = sanitizeBaseName(req.rootName, prefix);
  const rootName = prefix + base;

  const root = req.json;
  if (isPlainObject(root)) {
    if (Object.keys(root).length === 0) {
      declare(ctx, rootName, 'Record<string, unknown>', false);
    } else {
      buildObject(root, base, ctx);
    }
  } else if (Array.isArray(root)) {
    const elem = buildArray(root, base, ctx);
    declare(ctx, rootName, elem, false);
  } else {
    declare(ctx, rootName, primitiveType(root), false);
  }

  const header = '// 자동 생성 — react-app-scaffold 타입 규칙 적용';
  const blocks = ctx.order.map((name) => renderDecl(ctx, name));
  return [header, ...blocks].join('\n\n');
}

/** 한 값에 대한 TS 타입 표현식을 반환한다(객체/배열은 명명 타입을 등록하고 이름을 반환). */
function buildValue(value: unknown, base: string, ctx: IGenCtx): string {
  if (value === null) return 'unknown';
  if (Array.isArray(value)) return buildArray(value, base, ctx);
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return 'Record<string, unknown>';
    return buildObject(value, base, ctx);
  }
  return primitiveType(value);
}

/** 객체를 명명 타입으로 등록하고 그 이름(접두사 포함)을 반환한다. null 값 키는 optional. */
function buildObject(obj: Record<string, unknown>, base: string, ctx: IGenCtx): string {
  const name = ctx.prefix + base;
  const fields = Object.entries(obj).map(([key, value]) => {
    const optional = value === null; // 단일 객체: null 값만 optional 근거.
    const t = value === null ? 'unknown' : buildValue(value, base + pascal(key), ctx);
    return `  ${formatKey(key)}${optional ? '?' : ''}: ${t};`;
  });
  declare(ctx, name, `{\n${fields.join('\n')}\n}`, true);
  return name;
}

/** 배열 타입 표현식을 반환한다. 객체 배열은 키 합집합으로 명명 타입을 등록. */
function buildArray(arr: unknown[], base: string, ctx: IGenCtx): string {
  if (arr.length === 0) return 'unknown[]';

  const allObjects = arr.every(isPlainObject);
  if (allObjects) {
    const elemBase = base + 'Item';
    const name = ctx.prefix + elemBase;
    const keys = new Set<string>();
    for (const el of arr as Record<string, unknown>[]) {
      Object.keys(el).forEach((k) => keys.add(k));
    }
    const fields = [...keys].map((key) => {
      let missing = 0;
      let nulls = 0;
      const types = new Set<string>();
      for (const el of arr as Record<string, unknown>[]) {
        if (!(key in el)) { missing++; continue; }
        const v = el[key];
        if (v === null) { nulls++; continue; }
        types.add(buildValue(v, elemBase + pascal(key), ctx));
      }
      // 배열 샘플: 일부 요소에 키가 없거나 null이면 optional.
      const optional = missing > 0 || nulls > 0;
      const t = types.size === 0 ? 'unknown' : [...types].sort().join(' | ');
      return `  ${formatKey(key)}${optional ? '?' : ''}: ${t};`;
    });
    declare(ctx, name, `{\n${fields.join('\n')}\n}`, true);
    return `${name}[]`;
  }

  // 원시/혼합 배열: 요소 타입 유니온. 객체/배열 요소는 표현식으로 환원.
  const types = new Set<string>();
  arr.forEach((el, i) => types.add(buildValue(el, `${base}Item${i}`, ctx)));
  const union = [...types].sort().join(' | ');
  return types.size > 1 ? `(${union})[]` : `${union}[]`;
}

function primitiveType(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

/** 선언을 등록한다(중복 이름은 최초 정의 유지). */
function declare(ctx: IGenCtx, name: string, body: string, isObject: boolean): void {
  if (ctx.decls.has(name)) return;
  ctx.decls.set(name, { body, isObject });
  ctx.order.push(name);
}

/** 한 선언을 TS 소스로 렌더한다. interface kind면 객체 선언은 interface로, 그 외는 type alias. */
function renderDecl(ctx: IGenCtx, name: string): string {
  const d = ctx.decls.get(name)!;
  if (ctx.kind === 'interface' && d.isObject) {
    return `interface ${name} ${d.body}`;
  }
  return `type ${name} = ${d.body};`;
}

/** 접두사 제외 PascalCase 베이스 이름으로 정규화한다. 사용자가 접두사(T/I)를 붙였으면 제거(중복 방지). */
function sanitizeBaseName(raw: string, prefix: 'T' | 'I'): string {
  let s = (raw || '').replace(/[^A-Za-z0-9]/g, '');
  // "TUser"/"IConfig"처럼 접두사+대문자로 시작하면 접두사 제거(다시 붙임).
  if (s.length >= 2 && s[0] === prefix && /[A-Z]/.test(s[1])) s = s.slice(1);
  if (!s) return 'Root';
  if (/^[0-9]/.test(s)) s = 'T' + s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 키를 PascalCase 토큰으로(중첩 타입명 합성용). */
function pascal(key: string): string {
  const parts = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return joined || 'Field';
}

/** 객체 키를 TS 속성 표기로(식별자면 그대로, 아니면 따옴표). */
function formatKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ──────────────────────────────────────────────────────────────────────────
// 채팅 카드 렌더
// ──────────────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<TJsonTypeSource, string> = {
  chat: '채팅 입력',
  selection: '선택 영역',
  file: '현재 파일',
};

/** 생성 결과를 채팅에 보여줄 마크다운 카드(코드블록 + 적용 규칙/한계)로 만든다. */
export function renderJsonTypeCard(req: IJsonTypeRequest): string {
  const code = generateTypeFromJson(req);
  return [
    '> ⚠️ **오프라인 모드** — 로컬 타입 규칙으로 생성했습니다.',
    '',
    '## 타입 생성 결과',
    '```typescript',
    code,
    '```',
    '',
    '## 적용 규칙 / 한계',
    `- 입력 소스: ${SOURCE_LABEL[req.source]}`,
    `- \`${req.kind}\` 선언 + \`${req.kind === 'interface' ? 'I' : 'T'}\` 접두사 (scaffold 타입 규칙)`,
    '- optional(`?`)은 전달한 JSON의 `null`·키 누락 기준으로만 판정',
    '- 리터럴 유니온·enum은 단일 샘플로 추론 불가 → `string`/`unknown`으로 둠',
    '- 서버 복구 후 동일 요청으로 더 정교한 생성을 재시도할 수 있습니다',
    '',
  ].join('\n');
}
