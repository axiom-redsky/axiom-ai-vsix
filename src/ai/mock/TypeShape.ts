/**
 * 타입 모양 읽기 (계획서 §7 D2) — TypeScript 타입 선언 텍스트를 **값을 만들 수 있는 모양(IR)** 으로 옮긴다.
 *
 * ## 왜 이 층이 따로 있나
 * D2(Mock 데이터 생성기)는 `JsonTypeGenerator`(JSON → 타입)의 **역방향**이다. 역방향의 어려운 절반은
 * 값 만들기가 아니라 **타입을 읽는 것**이다: 타입은 한 파일에 다 있지 않고(`import`), 제네릭으로
 * 조립되며(`ApiResponse<TUser>`), 유니온·중첩·선택 필드가 섞여 있다.
 *
 * 그래서 읽기(이 파일)와 만들기(`MockData.ts`)를 나눴다. 이 층은 **값을 하나도 만들지 않는다** —
 * "이 타입은 이런 모양"까지만 말한다.
 *
 * ## 지키는 것
 * - **모르면 모른다고 한다**(B4에서 확정한 원칙): 해석 못 한 타입은 조용히 버리지 않고
 *   `{ kind: 'unknown', reason }` 으로 남기고 이슈 목록에 적는다. 화면이 그대로 보여 준다.
 * - **TypeScript 컴파일러를 쓰지 않는다**: 라우터 맵(B4)·디자인 토큰(B3)과 같은 결정론 텍스트 파서다.
 *   텍스트 도구(`stripComments`·`matchBracket`)는 B4 것을 **그대로 공유**한다(미러 금지).
 * - vscode·fs 비의존(텍스트만 받는다) — 단위 테스트와 웹뷰에서 그대로 호출한다.
 */

import { matchBracket, resolveModulePath, stripComments } from '../router/RouterMap';

// ── 모양(IR) ─────────────────────────────────────────────────────────────────

/** 값 하나의 모양. JSON으로 만들 수 있는 것만 있다(함수는 필드 단계에서 걸러진다). */
export type TShape =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  /** `Date` — JSON에서는 문자열이 된다. */
  | { kind: 'date' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'union'; options: TShape[] }
  | { kind: 'array'; item: TShape }
  | { kind: 'object'; name: string | null; fields: IShapeField[]; index?: TShape }
  /** `Record<string, V>` — 키를 모르는 사전. */
  | { kind: 'record'; value: TShape }
  /** 해석하지 못한 타입. **버리지 않고** 이유와 원문을 들고 있는다. */
  | { kind: 'unknown'; text: string; reason: string };

export interface IShapeField {
  name: string;
  optional: boolean;
  shape: TShape;
}

/** 파일에서 찾아낸 타입 선언 하나. */
export interface ITypeDecl {
  name: string;
  kind: 'type' | 'interface';
  /** 제네릭 매개변수 이름(`<T, K = string>` → `['T', 'K']`). */
  params: string[];
  /** `type`이면 `=` 뒤 원문, `interface`면 `{ … }` 원문. */
  body: string;
  /** `interface X extends A, B` 의 A·B 원문. */
  extendsList: string[];
  file: string;
  /** 1-based 줄 번호. */
  line: number;
  exported: boolean;
}

/** 파일 하나를 읽은 결과(선언 + import 표). */
export interface ITypeFile {
  file: string;
  decls: ITypeDecl[];
  /** 로컬 이름 → 모듈 지정자(`@/types/employee`). */
  imports: Map<string, string>;
}

/** 워크스페이스 전체 색인. */
export interface ITypeIndex {
  files: Map<string, ITypeFile>;
  /** 이름 → 그 이름의 선언들(동명이 여럿일 수 있다). */
  byName: Map<string, ITypeDecl[]>;
}

// ── 선언 수집 ────────────────────────────────────────────────────────────────

/**
 * 파일 원문에서 `type`·`interface` 선언을 모은다.
 * 주석은 먼저 지운다 — **주석 처리된 선언을 살아 있다고 말하면 안 된다**(B4에서 실제로 겪은 문제).
 * `stripComments`는 줄바꿈을 남기므로 줄 번호는 그대로다.
 */
export function collectTypeDeclarations(rawText: string, file: string): ITypeDecl[] {
  const text = stripComments(rawText);
  const out: ITypeDecl[] = [];
  const re = /(^|\n)([ \t]*)(export\s+(?:default\s+)?)?(type|interface)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const declStart = m.index + m[1].length;
    const exported = !!m[3];
    const kind = m[4] as 'type' | 'interface';
    const name = m[5];
    let i = re.lastIndex;

    // 제네릭 매개변수 `<T, K = string>`.
    const params: string[] = [];
    i = skipSpace(text, i);
    if (text[i] === '<') {
      const close = matchAngle(text, i);
      if (close < 0) continue;
      for (const p of splitTopLevelBy(text.slice(i + 1, close), ',')) {
        const pn = p.trim().match(/^([A-Za-z_$][\w$]*)/);
        if (pn) params.push(pn[1]);
      }
      i = skipSpace(text, close + 1);
    }

    if (kind === 'interface') {
      const extendsList: string[] = [];
      if (text.startsWith('extends', i)) {
        const brace = text.indexOf('{', i);
        if (brace < 0) continue;
        for (const e of splitTopLevelBy(text.slice(i + 'extends'.length, brace), ',')) {
          if (e.trim()) extendsList.push(e.trim());
        }
        i = brace;
      }
      i = skipSpace(text, i);
      if (text[i] !== '{') continue;
      const close = matchBracket(text, i);
      if (close < 0) continue;
      out.push({
        name, kind, params, extendsList,
        body: text.slice(i, close + 1),
        file, line: lineAt(text, declStart), exported,
      });
      re.lastIndex = close + 1;
      continue;
    }

    // type alias: `=` 뒤부터 최상위 `;`(또는 다음 선언 직전)까지.
    if (text[i] !== '=') continue;
    const bodyStart = i + 1;
    const bodyEnd = findStatementEnd(text, bodyStart);
    out.push({
      name, kind, params, extendsList: [],
      body: text.slice(bodyStart, bodyEnd).trim(),
      file, line: lineAt(text, declStart), exported,
    });
    re.lastIndex = bodyEnd;
  }
  return out;
}

/** 파일 하나를 읽는다(선언 + import 표). */
export function parseTypeFile(rawText: string, file: string): ITypeFile {
  const text = stripComments(rawText);
  const imports = new Map<string, string>();
  // `import type { A, B as C } from '…'` · `import D from '…'`
  for (const m of text.matchAll(/import\s+(type\s+)?([^;'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = m[2].trim();
    const module = m[3];
    const braced = clause.match(/\{([^}]*)\}/);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const named = part.trim().replace(/^type\s+/, '');
        if (!named) continue;
        const as = named.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        if (as) imports.set(as[2], module);
        else if (/^[A-Za-z_$][\w$]*$/.test(named)) imports.set(named, module);
      }
    }
    const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(,|$)/);
    if (def) imports.set(def[1], module);
    const star = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (star) imports.set(star[1], module);
  }
  return { file, decls: collectTypeDeclarations(rawText, file), imports };
}

/** 파일들을 하나의 색인으로 묶는다. */
export function buildTypeIndex(files: ITypeFile[]): ITypeIndex {
  const byFile = new Map<string, ITypeFile>();
  const byName = new Map<string, ITypeDecl[]>();
  for (const f of files) {
    byFile.set(f.file, f);
    for (const d of f.decls) {
      const list = byName.get(d.name) ?? [];
      list.push(d);
      byName.set(d.name, list);
    }
  }
  return { files: byFile, byName };
}

/**
 * 이름 하나를 선언으로 해석한다. 순서가 곧 정확도다:
 *   ① 같은 파일 → ② 그 파일이 `import`한 파일 → ③ 워크스페이스에서 **이름이 유일할 때만**.
 * ③을 유일할 때만 하는 이유: 동명 타입이 두 도메인에 있으면 아무거나 고르는 건 찍는 것이다.
 */
export function lookupType(index: ITypeIndex, name: string, fromFile: string): ITypeDecl | null {
  const own = index.files.get(fromFile)?.decls.find((d) => d.name === name);
  if (own) return own;

  const module = index.files.get(fromFile)?.imports.get(name);
  if (module) {
    const base = resolveModulePath(module, fromFile);
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      const found = index.files.get(cand)?.decls.find((d) => d.name === name);
      if (found) return found;
    }
  }

  const all = index.byName.get(name);
  if (all && all.length === 1) return all[0];
  return null;
}

// ── 타입식 → 모양 ────────────────────────────────────────────────────────────

/** 해석 중 문맥 — 제네릭 치환 환경과 재귀 방지 스택을 들고 다닌다. */
interface IParseCtx {
  index: ITypeIndex;
  issues: string[];
  /**
   * 제네릭 매개변수 이름 → 실제 인자(원문 + 그 원문이 쓰인 파일).
   * `null`이면 **인자 없이 선언만 본 자리**다(`TSmartTableProps<TRow>`를 그냥 열었을 때의 `TRow`) —
   * "찾지 못한 타입"과 다르다. 실 scaffold에서 이 둘을 뭉뚱그리면 원인이 안 보인다.
   */
  env: Map<string, { text: string; file: string } | null>;
  /** `file#name` 방문 스택(재귀 타입 차단). */
  stack: string[];
  depth: number;
}

const MAX_DEPTH = 12;

export interface IShapeResult {
  shape: TShape;
  /** 해석하지 못한 것들(화면에 그대로 보여 준다). */
  issues: string[];
}

/** 선언 하나를 모양으로 옮긴다. */
export function shapeOfDeclaration(decl: ITypeDecl, index: ITypeIndex): IShapeResult {
  const ctx: IParseCtx = { index, issues: [], env: new Map(), stack: [], depth: 0 };
  const shape = shapeOfDecl(decl, [], ctx);
  return { shape, issues: dedupe(ctx.issues) };
}

/** 타입식 원문 하나를 모양으로 옮긴다(테스트·호출부용). */
export function shapeOfExpression(expr: string, file: string, index: ITypeIndex): IShapeResult {
  const ctx: IParseCtx = { index, issues: [], env: new Map(), stack: [], depth: 0 };
  const shape = parseExpr(expr, file, ctx);
  return { shape, issues: dedupe(ctx.issues) };
}

function shapeOfDecl(decl: ITypeDecl, args: Array<{ text: string; file: string }>, ctx: IParseCtx): TShape {
  const key = `${decl.file}#${decl.name}`;
  if (ctx.stack.includes(key)) {
    ctx.issues.push(`\`${decl.name}\`은 자기 자신을 참조하는 타입이라 그 자리에서 멈췄습니다.`);
    return { kind: 'unknown', text: decl.name, reason: '재귀 타입' };
  }
  if (ctx.depth > MAX_DEPTH) {
    ctx.issues.push(`\`${decl.name}\`은 너무 깊이 중첩돼 있어 그 아래는 만들지 않았습니다.`);
    return { kind: 'unknown', text: decl.name, reason: '중첩 한도' };
  }

  const env = new Map<string, { text: string; file: string } | null>();
  decl.params.forEach((p, i) => env.set(p, args[i] ?? null));

  const saved = { env: ctx.env, stack: ctx.stack, depth: ctx.depth };
  ctx.env = env;
  ctx.stack = [...ctx.stack, key];
  ctx.depth = saved.depth + 1;

  let shape: TShape;
  if (decl.kind === 'interface') {
    const base = parseObjectBody(decl.body, decl.file, ctx, decl.name);
    shape = decl.extendsList.length > 0 ? mergeExtends(base, decl, ctx) : base;
  } else {
    shape = parseExpr(decl.body, decl.file, ctx);
    if (shape.kind === 'object' && shape.name === null) shape = { ...shape, name: decl.name };
  }

  ctx.env = saved.env;
  ctx.stack = saved.stack;
  ctx.depth = saved.depth;
  return shape;
}

/** `interface X extends A, B` — 부모 필드를 먼저 깔고 자식이 덮는다. */
function mergeExtends(own: TShape, decl: ITypeDecl, ctx: IParseCtx): TShape {
  if (own.kind !== 'object') return own;
  const fields: IShapeField[] = [];
  for (const parentExpr of decl.extendsList) {
    const parent = parseExpr(parentExpr, decl.file, ctx);
    if (parent.kind === 'object') fields.push(...parent.fields);
    else ctx.issues.push(`\`${decl.name}\`이 확장하는 \`${parentExpr.trim()}\`을 읽지 못했습니다.`);
  }
  for (const f of own.fields) {
    const at = fields.findIndex((x) => x.name === f.name);
    if (at >= 0) fields[at] = f;
    else fields.push(f);
  }
  return { ...own, fields };
}

/** 타입식 한 조각을 모양으로. 이 함수가 D2의 심장이다. */
function parseExpr(rawExpr: string, file: string, ctx: IParseCtx): TShape {
  let expr = rawExpr.trim();
  if (!expr) return { kind: 'unknown', text: rawExpr, reason: '빈 타입' };
  // 바깥 괄호 벗기기.
  while (expr.startsWith('(') && matchBracket(expr, 0) === expr.length - 1) {
    expr = expr.slice(1, -1).trim();
  }
  // 앞에 붙은 `|`(여러 줄 유니온 표기).
  if (expr.startsWith('|')) expr = expr.slice(1).trim();

  // 유니온.
  const unionParts = splitTopLevelBy(expr, '|').map((p) => p.trim()).filter(Boolean);
  if (unionParts.length > 1) {
    return { kind: 'union', options: unionParts.map((p) => parseExpr(p, file, ctx)) };
  }

  // 교차(&) — 객체끼리면 필드를 합친다.
  const andParts = splitTopLevelBy(expr, '&').map((p) => p.trim()).filter(Boolean);
  if (andParts.length > 1) {
    const shapes = andParts.map((p) => parseExpr(p, file, ctx));
    const objects = shapes.filter((s): s is Extract<TShape, { kind: 'object' }> => s.kind === 'object');
    if (objects.length > 0) {
      // 읽어 낸 객체들은 합치고, 못 읽은 쪽(라이브러리 타입 등)은 뺀다 —
      // `UseMutationResult<…> & { invalidateQueries }` 처럼 한쪽만 남의 타입인 경우가 실제로 흔하다.
      const fields: IShapeField[] = [];
      for (const o of objects) {
        for (const f of o.fields) {
          const at = fields.findIndex((x) => x.name === f.name);
          if (at >= 0) fields[at] = f;
          else fields.push(f);
        }
      }
      if (objects.length < shapes.length) {
        ctx.issues.push('교차 타입에서 읽지 못한 쪽은 빼고 나머지만 만들었습니다.');
      }
      return { kind: 'object', name: null, fields };
    }
    return shapes[0];
  }

  // 배열 접미사 `X[]`.
  if (expr.endsWith('[]')) {
    const inner = expr.slice(0, -2).trim();
    if (isBalanced(inner)) return { kind: 'array', item: parseExpr(inner, file, ctx) };
  }

  // 객체 리터럴.
  if (expr.startsWith('{') && matchBracket(expr, 0) === expr.length - 1) {
    return parseObjectBody(expr, file, ctx, null);
  }

  // 문자열·숫자·불리언 리터럴.
  const lit = parseLiteral(expr);
  if (lit) return lit;

  // 키워드.
  const keyword = KEYWORDS[expr];
  if (keyword) return keyword();
  if (expr === 'any' || expr === 'unknown' || expr === 'object' || expr === 'never' || expr === 'void') {
    return { kind: 'unknown', text: expr, reason: `\`${expr}\`은 모양을 알 수 없습니다` };
  }

  // 이름 참조(제네릭 인자 포함).
  const ref = expr.match(/^([A-Za-z_$][\w$.]*)\s*(<[\s\S]*>)?$/);
  if (!ref) return { kind: 'unknown', text: expr, reason: '읽지 못한 타입 표현' };
  const name = ref[1];
  const args = ref[2]
    ? splitTopLevelBy(ref[2].slice(1, -1), ',').map((a) => ({ text: a.trim(), file })).filter((a) => a.text)
    : [];

  // 제네릭 매개변수 자리(`T`)면 인자로 바꿔 다시 읽는다 — 인자는 **부른 쪽 파일**의 것이다.
  if (ctx.env.has(name) && args.length === 0) {
    const bound = ctx.env.get(name) ?? null;
    if (!bound) {
      // 인자가 안 정해진 자리. "못 찾았다"가 아니라 "아직 안 정했다"이고, 고치는 방법도 다르다.
      ctx.issues.push(`제네릭 자리 \`${name}\`이 비어 있습니다 — 타입 인자를 정해야 값을 만들 수 있습니다.`);
      return { kind: 'unknown', text: name, reason: '제네릭 자리' };
    }
    const savedEnv = ctx.env;
    ctx.env = new Map();
    const shape = parseExpr(bound.text, bound.file, ctx);
    ctx.env = savedEnv;
    return shape;
  }

  const builtin = parseBuiltinGeneric(name, args, ctx);
  if (builtin) return builtin;

  const decl = lookupType(ctx.index, name, file);
  if (!decl) {
    // ★ 실 프로젝트에서 못 찾는 이름의 대부분은 **남의 타입**이다(`React.ReactNode`·`ColumnDef`…).
    // 그건 우리 코드의 결함이 아니라 "데이터가 아닌 것"이라, 원인을 구분해서 말해야 고칠 방법도 갈린다.
    const external = externalModuleOf(ctx.index, name, file);
    if (external) {
      ctx.issues.push(`\`${name}\`은 외부 라이브러리(\`${external}\`) 타입이라 데이터로 만들 수 없습니다.`);
      return { kind: 'unknown', text: expr, reason: '외부 라이브러리 타입' };
    }
    if (BUILTIN_GLOBALS.has(name)) {
      ctx.issues.push(`\`${name}\`은 자바스크립트 기본 타입이라 JSON 값으로 만들지 않았습니다.`);
      return { kind: 'unknown', text: expr, reason: '기본 제공 타입' };
    }
    // 같은 파일의 **다른 선언**이 제네릭 매개변수로 쓰는 이름이면, 못 찾은 게 아니라 빈 자리다.
    if (ctx.index.files.get(file)?.decls.some((d) => d.params.includes(name))) {
      ctx.issues.push(`제네릭 자리 \`${name}\`이 비어 있습니다 — 타입 인자를 정해야 값을 만들 수 있습니다.`);
      return { kind: 'unknown', text: expr, reason: '제네릭 자리' };
    }
    ctx.issues.push(`\`${name}\` 타입을 찾지 못해 값을 만들지 못했습니다.`);
    return { kind: 'unknown', text: expr, reason: '선언을 찾지 못함' };
  }
  return shapeOfDecl(decl, args, ctx);
}

/** JSON 값으로 옮길 수 없는 자바스크립트 기본 타입들(실 scaffold에서 실제로 나온 것들). */
const BUILTIN_GLOBALS = new Set([
  'Error', 'EventTarget', 'Element', 'HTMLElement', 'Blob', 'File', 'FormData',
  'Map', 'Set', 'WeakMap', 'RegExp', 'Function', 'Parameters', 'ReturnType', 'AbortSignal',
]);

/**
 * 이 이름이 **워크스페이스 밖(라이브러리)** 것이면 그 모듈 이름을 돌려준다. 아니면 null.
 * 판정은 이름 목록이 아니라 그 파일의 `import` 표로 한다 — 목록은 프로젝트마다 틀리고 늘 낡는다.
 */
function externalModuleOf(index: ITypeIndex, name: string, file: string): string | null {
  const root = name.split('.')[0];
  const module = index.files.get(file)?.imports.get(root);
  if (module && !module.startsWith('@/') && !module.startsWith('.')) return module;
  // `React.ReactNode`·`JSX.Element`는 import 없이 쓰이기도 한다(전역 네임스페이스).
  if (!module && (root === 'React' || root === 'JSX') && name.includes('.')) return 'react';
  return null;
}

const KEYWORDS: Record<string, () => TShape> = {
  string: () => ({ kind: 'string' }),
  number: () => ({ kind: 'number' }),
  bigint: () => ({ kind: 'number' }),
  boolean: () => ({ kind: 'boolean' }),
  true: () => ({ kind: 'literal', value: true }),
  false: () => ({ kind: 'literal', value: false }),
  null: () => ({ kind: 'null' }),
  undefined: () => ({ kind: 'null' }),
  Date: () => ({ kind: 'date' }),
};

/** `Array<X>`·`Record<K,V>`·`Partial<X>` 같은 표준 제네릭. 아니면 null. */
function parseBuiltinGeneric(
  name: string,
  args: Array<{ text: string; file: string }>,
  ctx: IParseCtx,
): TShape | null {
  const arg = (i: number): TShape =>
    args[i] ? parseExpr(args[i].text, args[i].file, ctx) : { kind: 'unknown', text: name, reason: '인자 없음' };

  switch (name) {
    case 'Array':
    case 'ReadonlyArray':
      return { kind: 'array', item: arg(0) };
    case 'Record':
      return { kind: 'record', value: arg(1) };
    case 'Readonly':
    case 'NonNullable':
    case 'Promise':
      return arg(0);
    case 'Partial': {
      const inner = arg(0);
      return inner.kind === 'object'
        ? { ...inner, fields: inner.fields.map((f) => ({ ...f, optional: true })) }
        : inner;
    }
    case 'Required': {
      const inner = arg(0);
      return inner.kind === 'object'
        ? { ...inner, fields: inner.fields.map((f) => ({ ...f, optional: false })) }
        : inner;
    }
    case 'Pick':
    case 'Omit': {
      const inner = arg(0);
      if (inner.kind !== 'object') return inner;
      const keys = new Set(
        splitTopLevelBy(args[1]?.text ?? '', '|')
          .map((k) => k.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean),
      );
      const fields = inner.fields.filter((f) => (name === 'Pick' ? keys.has(f.name) : !keys.has(f.name)));
      return { ...inner, fields };
    }
    default:
      return null;
  }
}

function parseLiteral(expr: string): TShape | null {
  const str = expr.match(/^(['"`])([\s\S]*)\1$/);
  if (str) return { kind: 'literal', value: str[2] };
  if (/^-?\d+(\.\d+)?$/.test(expr)) return { kind: 'literal', value: Number(expr) };
  return null;
}

/** `{ a: string; b?: number }` 를 읽는다. 함수 멤버는 JSON에 담을 수 없어 뺀다(이슈로 남긴다). */
function parseObjectBody(body: string, file: string, ctx: IParseCtx, name: string | null): TShape {
  const trimmed = body.trim();
  const inner = trimmed.startsWith('{') ? trimmed.slice(1, -1) : trimmed;
  const fields: IShapeField[] = [];
  let index: TShape | undefined;

  for (const member of splitMembers(inner)) {
    const text = member.trim().replace(/^readonly\s+/, '');
    if (!text) continue;

    // 인덱스 시그니처 `[key: string]: V`.
    if (text.startsWith('[')) {
      const close = matchBracket(text, 0);
      const colon = close >= 0 ? text.indexOf(':', close) : -1;
      if (colon > 0) index = parseExpr(text.slice(colon + 1), file, ctx);
      continue;
    }

    const colon = topLevelIndexOf(text, ':');
    if (colon < 0) continue;
    const head = text.slice(0, colon).trim();
    // 메서드 시그니처 `foo(): void` — 값이 아니라 동작이라 뺀다.
    if (head.includes('(')) {
      ctx.issues.push(`함수 멤버 \`${head}\`는 JSON에 담을 수 없어 뺐습니다.`);
      continue;
    }
    const optional = head.endsWith('?');
    const fieldName = (optional ? head.slice(0, -1) : head).trim().replace(/^['"]|['"]$/g, '');
    if (!fieldName) continue;
    const valueExpr = text.slice(colon + 1).trim();
    if (/^\(.*\)\s*=>/.test(valueExpr)) {
      ctx.issues.push(`함수 필드 \`${fieldName}\`는 JSON에 담을 수 없어 뺐습니다.`);
      continue;
    }
    fields.push({ name: fieldName, optional, shape: parseExpr(valueExpr, file, ctx) });
  }
  return index ? { kind: 'object', name, fields, index } : { kind: 'object', name, fields };
}

// ── 텍스트 도구(타입식 전용) ─────────────────────────────────────────────────

/**
 * 최상위 구분자로 자른다(중첩 괄호·문자열 안은 무시).
 * `<`·`>`도 깊이로 세야 `Record<string, T>`의 쉼표에 속지 않는다.
 */
export function splitTopLevelBy(text: string, delim: string): string[] {
  const out: string[] = [];
  let start = 0;
  walkTokens(text, (i, ch, depth) => {
    if (depth === 0 && ch === delim) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  });
  out.push(text.slice(start));
  return out;
}

/** 최상위에서 문자 하나의 위치. 없으면 -1. */
function topLevelIndexOf(text: string, ch: string): number {
  let found = -1;
  walkTokens(text, (i, c, depth) => {
    if (found < 0 && depth === 0 && c === ch) found = i;
  });
  return found;
}

/**
 * 객체 멤버를 자른다. 구분자는 `;`·`,`뿐 아니라 **줄바꿈**이기도 하다(인터페이스는 흔히 줄로만 나눈다).
 * 단 줄바꿈은 멤버가 **완성된 뒤**에만 자른다 — 여러 줄에 걸친 유니온
 * (`status:` ⏎ `| 'a'` ⏎ `| 'b'`)을 중간에서 자르면 타입이 반쪽이 된다.
 */
export function splitMembers(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const push = (end: number): void => {
    const chunk = text.slice(start, end);
    if (chunk.trim()) out.push(chunk);
    start = end + 1;
  };
  walkTokens(text, (i, ch, depth) => {
    if (depth !== 0) return;
    if (ch === ';' || ch === ',') { push(i); return; }
    if (ch !== '\n') return;
    const chunk = text.slice(start, i).trim();
    if (!chunk || topLevelIndexOf(chunk, ':') < 0) return;
    if (/[|&:<=,(]$/.test(chunk)) return;                      // 아직 이어진다
    if (/^[|&)>]/.test(text.slice(i + 1).replace(/^\s+/, ''))) return; // 다음 줄이 이어 붙는다
    push(i);
  });
  const tail = text.slice(start);
  if (tail.trim()) out.push(tail);
  return out;
}

/** 문자열·괄호를 인식하며 훑는다(깊이를 콜백에 준다). */
function walkTokens(text: string, visit: (i: number, ch: string, depth: number) => void): void {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{' || c === '<') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}' || c === '>') {
      if (c === '>' && text[i - 1] === '=') continue; // `=>`의 `>`는 괄호가 아니다
      depth--;
      continue;
    }
    visit(i, c, depth);
  }
}

/**
 * 괄호가 다 닫혔는지. `walkTokens`의 깊이를 빌려 쓰면 안 된다 — 그 콜백은 **괄호가 아닌 글자**에서만
 * 불리므로 `ColumnDef<TRow>`처럼 괄호로 끝나는 표현의 마지막 깊이를 못 본다(실제로 이 착각 때문에
 * `ColumnDef<TRow>[]`의 `[]`를 못 떼어 "읽지 못한 타입 표현"이 됐다).
 */
function isBalanced(text: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || (c === '>' && text[i - 1] !== '=')) depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** `<`의 짝을 찾는다(`matchBracket`은 `<`를 모른다). 없으면 -1. */
function matchAngle(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '<') depth++;
    else if (c === '>') {
      if (text[i - 1] === '=') continue;
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** type alias 본문의 끝(최상위 `;` 또는 다음 선언 직전). */
function findStatementEnd(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (depth > 0) continue;
    if (c === ';') return i;
    // 세미콜론 없이 줄바꿈으로 끝나는 스타일: 다음 줄이 새 선언이면 거기서 끊는다.
    if (c === '\n' && /^\s*(export\s+)?(type|interface|const|function|import)\s/.test(text.slice(i + 1, i + 60))) {
      return i;
    }
  }
  return text.length;
}

function skipSpace(text: string, i: number): number {
  let j = i;
  while (j < text.length && /\s/.test(text[j])) j++;
  return j;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
