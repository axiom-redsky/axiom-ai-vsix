/**
 * 라우터 맵 (계획서 §7 B4) — scaffold의 라우트 선언을 **"어떤 주소가 어떤 화면인지"** 로 바꾸는 순수 층.
 *
 * ## 왜 필요한가
 * 경로 하나를 알아내려면 지금은 파일을 세 번 건너뛰어야 한다: `shared/router`에서 `/example`을 찾고 →
 * `domains/example/router`에서 `ui-components/calendar`를 찾고 → `loadable(() => import(…))`에서
 * 실제 페이지 파일을 찾는다. 그리고 **정말 알고 싶은 것**은 대개 그다음이다 —
 * "이 페이지, 지금 열 수 있는 주소가 있나?" · "이 주소 누가 또 쓰나?"
 *
 * ## 실제 파일이 가르쳐 준 것들 (전부 여기 반영돼 있다)
 * 1. **주석이 진실을 바꾼다** — `//import MainRouter …` 처럼 주석 처리된 라우터가 실제로 있다.
 *    주석을 안 지우면 "연결돼 있다"고 거짓말하게 되고, 지우면 그 도메인이 **미연결**로 드러난다.
 * 2. **경로 없는 중간 계층** — `{ element: <ProtectedRoute />, children: [{ element: <RootLayout />, … }] }`.
 *    레이아웃·인증 게이트는 path가 없다. 전체 경로를 만들 때 이 계층은 건너뛰어야 한다.
 * 3. **DEV/PROD 분기** — `...(import.meta.env.DEV ? [ … ] : [ … ])`. 양쪽에 같은 경로가 들어 있으므로
 *    이걸 모르면 "중복 경로"라고 잘못 신고한다.
 * 4. **라우터 모듈의 export가 하나가 아니다** — `import AuthRouter, { protectedRoutes } from …`.
 * 5. **동적 import 자식** — `children: (await import('@/publishing/example/router')).default`.
 *
 * vscode·fs 비의존(텍스트만 받는다) — 단위 테스트와 웹뷰에서 그대로 호출한다. 모델 호출 0.
 */

/** 라우트 한 줄(트리 노드). */
export interface IRouteNode {
  /** 최종 주소(`/example/ui-components/calendar`). 경로 없는 계층은 부모 값을 그대로 물려받는다. */
  fullPath: string;
  /** 선언된 그대로의 path(`ui-components/calendar`). 경로 없는 계층이면 null. */
  rawPath: string | null;
  /** `name:` 필드(사람이 읽을 화면 이름). */
  name: string | null;
  /** `element:`의 컴포넌트 이름(`CalendarComponent`). */
  component: string | null;
  /** 그 컴포넌트가 실제로 어느 파일인지(loadable/import에서 해소). 모르면 null. */
  componentFile: string | null;
  /** 이 선언이 적힌 파일과 줄(정의 열기용). */
  file: string;
  line: number;
  /** DEV 전용 분기 안인가 / PROD 전용 분기 안인가. */
  env: 'always' | 'dev' | 'prod';
  /** `path: '*'` 폴백인가. */
  wildcard: boolean;
  /** `:id` 같은 동적 구간을 포함하는가. */
  dynamic: boolean;
  children: IRouteNode[];
}

export type TRouterIssueKind =
  | 'orphan-page'
  | 'unreachable-router'
  | 'duplicate-path'
  | 'unresolved-children'
  | 'missing-module';

export interface IRouterIssue {
  kind: TRouterIssueKind;
  /** 사람이 읽는 한 줄. */
  message: string;
  /** 관련 파일(있으면 열 수 있다). */
  file: string | null;
  line: number | null;
  /** 같이 볼 것(중복 경로의 다른 선언 위치 등). */
  detail?: string;
}

export interface IRouterMap {
  /** 진입점부터 시작하는 트리. */
  routes: IRouteNode[];
  /**
   * **실제로 열리는 화면**들(평면 목록) = element가 있는 **잎(leaf)** 노드.
   *
   * ★ 자식이 있는 노드는 화면이 아니라 **레이아웃**이다(`RootLayout`·`ProtectedRoute`). 이걸 화면으로
   * 세면 `/`가 세 번 선언된 것처럼 보여 "중복 경로"를 잘못 신고한다(실 프로젝트에서 실제로 발생).
   */
  screens: IRouteNode[];
  issues: IRouterIssue[];
  /** 진입점 파일(보통 `src/shared/router/index.tsx`). 못 찾으면 null. */
  entry: string | null;
  files: string[];
  counts: { screens: number; routes: number; issues: number; orphanPages: number };
}

// ── 텍스트 다루기 ─────────────────────────────────────────────────────────────

/**
 * 주석 제거 — **문자열 안의 `//`는 건드리지 않는다**(`'https://…'`·`'@/domains/…'`).
 * 줄 번호를 지키려고 줄바꿈은 남긴다.
 */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** `open` 위치의 여는 괄호에 대응하는 닫는 위치(문자열 인식). 없으면 -1. */
export function matchBracket(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closer = pairs[text[open]];
  if (!closer) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 최상위 쉼표로 자른다(중첩 괄호·문자열 안의 쉼표는 무시). */
export function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const tail = text.slice(start);
  if (tail.trim()) out.push(tail);
  return out;
}

/** 1-based 줄 번호. */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// ── 라우터 파일 파싱 ──────────────────────────────────────────────────────────

/** 파일이 참조하는 다른 모듈의 라우트 배열(로컬 이름 → 모듈 + export 이름). */
export interface IRouterImport {
  module: string;
  /** 가져온 export 이름. default import면 'default'. */
  imported: string;
}

export interface IParsedRouterFile {
  file: string;
  /** export 이름 → 그 배열의 원문(파싱 전). 'default'는 `export default routes`가 가리키는 배열. */
  arrays: Map<string, { text: string; offset: number }>;
  /** 로컬 이름 → 다른 라우터 모듈. */
  imports: Map<string, IRouterImport>;
  /** 로컬 이름 → 페이지 모듈 경로(loadable/직접 import). */
  components: Map<string, string>;
}

/**
 * 라우터 파일 하나를 읽는다. 배열 **원문**만 떼어 두고, 해석(자식 연결)은 나중에 한 번에 한다 —
 * 파일 간 참조가 있어 한 파일만 보고는 트리를 만들 수 없기 때문이다.
 */
export function parseRouterFile(rawText: string, file: string): IParsedRouterFile {
  const text = stripComments(rawText);
  const imports = new Map<string, IRouterImport>();
  const components = new Map<string, string>();
  const arrays = new Map<string, { text: string; offset: number }>();

  // ① import — 라우터 참조와 페이지 컴포넌트를 함께 훑는다.
  for (const m of text.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const module = m[2];
    const isRouter = /\/router(\/index)?$/.test(module) || /\/router$/.test(module);
    const braces = clause.match(/\{([\s\S]*?)\}/);
    const head = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
    if (head && /^[A-Za-z_$][\w$]*$/.test(head)) {
      if (isRouter) imports.set(head, { module, imported: 'default' });
      else components.set(head, module);
    }
    if (braces) {
      for (const part of braces[1].split(',')) {
        const t = part.trim().replace(/^type\s+/, '');
        if (!t) continue;
        const as = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        const imported = as ? as[1] : t;
        const local = as ? as[2] : t;
        if (!/^[A-Za-z_$][\w$]*$/.test(local)) continue;
        if (isRouter) imports.set(local, { module, imported });
        else components.set(local, module);
      }
    }
  }

  // ② loadable(() => import('@/…')) — scaffold의 페이지 연결 관례.
  for (const m of text.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*loadable\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]/g,
  )) {
    components.set(m[1], m[2]);
  }

  // ③ 라우트 배열 — `const routes: TAppRoute[] = [ … ]` / `export const protectedRoutes = [ … ]`.
  for (const m of text.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+?)?=\s*\[/g)) {
    const openIdx = text.indexOf('[', m.index! + m[0].length - 1);
    const close = matchBracket(text, openIdx);
    if (close < 0) continue;
    arrays.set(m[1], { text: text.slice(openIdx + 1, close), offset: openIdx + 1 });
  }

  // ④ `export default routes;` → 그 배열을 default 로도 등록.
  const def = text.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/);
  if (def && arrays.has(def[1])) arrays.set('default', arrays.get(def[1]) as { text: string; offset: number });
  // `export default [ … ]` 형태도 받는다.
  const defArr = text.match(/export\s+default\s*\[/);
  if (defArr && !arrays.has('default')) {
    const openIdx = text.indexOf('[', defArr.index!);
    const close = matchBracket(text, openIdx);
    if (close >= 0) arrays.set('default', { text: text.slice(openIdx + 1, close), offset: openIdx + 1 });
  }

  return { file, arrays, imports, components };
}

// ── 경로 계산 ─────────────────────────────────────────────────────────────────

/**
 * 부모 경로에 자식 경로를 잇는다(react-router 규칙).
 * `/`로 시작하면 절대 경로, 아니면 이어 붙인다. 경로 없는 계층은 부모를 그대로 물려준다.
 */
export function joinPath(parent: string, child: string | null): string {
  if (child === null || child === '') return parent;
  if (child.startsWith('/')) return normalizePath(child);
  const base = parent === '/' ? '' : parent.replace(/\/$/, '');
  return normalizePath(`${base}/${child}`);
}

function normalizePath(p: string): string {
  const collapsed = p.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed || '/';
}

// ── 트리 조립 ─────────────────────────────────────────────────────────────────

export interface IRouterFile {
  /** 워크스페이스 기준 상대경로(예: `src/shared/router/index.tsx`). */
  path: string;
  text: string;
}

export interface IBuildRouterMapArgs {
  files: IRouterFile[];
  /** 진입점 파일 경로. 생략하면 `shared/router`를 찾는다. */
  entry?: string;
  /** 페이지 파일 목록(고아 페이지 탐지용). 없으면 그 검사를 건너뛴다. */
  pageFiles?: string[];
}

/** `@/domains/x/router` → `src/domains/x/router` (별칭 해소). */
export function resolveModulePath(module: string, fromFile: string): string {
  if (module.startsWith('@/')) return `src/${module.slice(2)}`;
  if (module.startsWith('./') || module.startsWith('../')) {
    const dir = fromFile.split('/').slice(0, -1);
    for (const seg of module.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') dir.pop();
      else dir.push(seg);
    }
    return dir.join('/');
  }
  return module;
}

/** 모듈 경로가 가리키는 파일을 찾는다(`/index.tsx` 생략 형태를 포함). */
function findFile(files: Map<string, IParsedRouterFile>, modulePath: string): IParsedRouterFile | null {
  const candidates = [
    modulePath,
    `${modulePath}.tsx`, `${modulePath}.ts`,
    `${modulePath}/index.tsx`, `${modulePath}/index.ts`,
  ];
  for (const c of candidates) {
    const found = files.get(c);
    if (found) return found;
  }
  return null;
}

/** 라우트 객체 하나에서 뽑아낸 필드(원문 조각). */
interface IRouteFields {
  path: string | null;
  name: string | null;
  element: string | null;
  children: string | null;
  index: boolean;
}

/** `{ path: 'x', element: <A />, children: B }` 의 최상위 필드를 읽는다. */
export function parseRouteFields(objText: string): IRouteFields {
  const fields: IRouteFields = { path: null, name: null, element: null, children: null, index: false };
  for (const part of splitTopLevel(objText)) {
    const m = part.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (key === 'path') fields.path = value.replace(/^['"`]|['"`]$/g, '');
    else if (key === 'name') fields.name = value.replace(/^['"`]|['"`]$/g, '');
    else if (key === 'element') fields.element = (value.match(/<\s*([A-Za-z_$][\w$.]*)/) ?? [])[1] ?? null;
    else if (key === 'children') fields.children = value;
    else if (key === 'index') fields.index = /true/.test(value);
  }
  return fields;
}

/**
 * 배열 원문 하나를 노드 목록으로. 자식이 다른 파일이면 그 파일로 건너뛴다(재귀).
 * `seen`은 순환 참조(A가 B를, B가 A를) 방지용.
 */
function parseArray(
  arrayText: string,
  offset: number,
  owner: IParsedRouterFile,
  parentPath: string,
  env: IRouteNode['env'],
  ctx: IBuildCtx,
  seen: Set<string>,
): IRouteNode[] {
  const nodes: IRouteNode[] = [];
  let cursor = 0;
  for (const rawItem of splitTopLevel(arrayText)) {
    const itemStart = arrayText.indexOf(rawItem, cursor);
    cursor = itemStart + rawItem.length;
    const item = rawItem.trim();
    if (!item) continue;

    // ── 전개(spread) — DEV/PROD 분기이거나 다른 배열 이어붙이기.
    if (item.startsWith('...')) {
      nodes.push(...parseSpread(item, itemStart + offset, owner, parentPath, env, ctx, seen));
      continue;
    }
    if (!item.startsWith('{')) continue;

    const objInner = item.slice(1, item.lastIndexOf('}'));
    const f = parseRouteFields(objInner);
    const fullPath = joinPath(parentPath, f.path);
    const node: IRouteNode = {
      fullPath,
      rawPath: f.path,
      name: f.name,
      component: f.element,
      componentFile: f.element ? resolveComponent(owner, f.element, ctx) : null,
      file: owner.file,
      line: lineAt(ctx.sources.get(owner.file) ?? '', itemStart + offset),
      env,
      wildcard: f.path === '*',
      dynamic: /:[A-Za-z_$]/.test(fullPath),
      children: [],
    };
    if (f.children) {
      node.children = resolveChildren(f.children, itemStart + offset, owner, fullPath, env, ctx, seen);
    }
    nodes.push(node);
  }
  return nodes;
}

/** `...(cond ? [A] : [B])` · `...OtherArray` */
function parseSpread(
  item: string,
  offset: number,
  owner: IParsedRouterFile,
  parentPath: string,
  env: IRouteNode['env'],
  ctx: IBuildCtx,
  seen: Set<string>,
): IRouteNode[] {
  const body = item.replace(/^\.\.\./, '').trim();

  // ★ DEV/PROD 분기 — 양쪽에 같은 경로가 들어 있으므로 분기를 모르면 "중복"이라 잘못 신고한다.
  const ternary = body.match(/\?/);
  if (ternary) {
    const cond = body.slice(0, ternary.index).toLowerCase();
    const devFirst = /\bdev\b|import\.meta\.env\.dev/.test(cond);
    const rest = body.slice((ternary.index ?? 0) + 1);
    const branches: { text: string; env: IRouteNode['env']; at: number }[] = [];
    const trueOpen = rest.indexOf('[');
    if (trueOpen >= 0) {
      const trueClose = matchBracket(rest, trueOpen);
      if (trueClose > 0) {
        branches.push({ text: rest.slice(trueOpen + 1, trueClose), env: devFirst ? 'dev' : 'prod', at: trueOpen + 1 });
        const after = rest.slice(trueClose);
        const falseOpen = after.indexOf('[');
        if (falseOpen >= 0) {
          const falseClose = matchBracket(after, falseOpen);
          if (falseClose > 0) {
            branches.push({
              text: after.slice(falseOpen + 1, falseClose),
              env: devFirst ? 'prod' : 'dev',
              at: trueClose + falseOpen + 1,
            });
          }
        }
      }
    }
    const out: IRouteNode[] = [];
    for (const b of branches) {
      const base = offset + item.indexOf(body) + b.at;
      out.push(...parseArray(b.text, base, owner, parentPath, env === 'always' ? b.env : env, ctx, seen));
    }
    return out;
  }

  // `...OtherArray` — 같은 파일의 다른 배열이거나 import한 라우터.
  const id = body.match(/^([A-Za-z_$][\w$]*)/);
  if (id) return resolveIdentifierRoutes(id[1], offset, owner, parentPath, env, ctx, seen);
  return [];
}

/** `children:` 값 해석 — 인라인 배열 · 식별자 · 동적 import. */
function resolveChildren(
  value: string,
  offset: number,
  owner: IParsedRouterFile,
  parentPath: string,
  env: IRouteNode['env'],
  ctx: IBuildCtx,
  seen: Set<string>,
): IRouteNode[] {
  const v = value.trim();

  if (v.startsWith('[')) {
    const close = matchBracket(v, 0);
    const inner = close > 0 ? v.slice(1, close) : v.slice(1);
    return parseArray(inner, offset, owner, parentPath, env, ctx, seen);
  }

  // `(await import('@/publishing/example/router')).default`
  const dyn = v.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)?\s*\.\s*([A-Za-z_$][\w$]*)/);
  if (dyn) {
    return routesFromModule(dyn[1], dyn[2] === 'default' ? 'default' : dyn[2], owner, parentPath, env, ctx, seen, offset);
  }

  const id = v.match(/^([A-Za-z_$][\w$]*)/);
  if (id) return resolveIdentifierRoutes(id[1], offset, owner, parentPath, env, ctx, seen);

  ctx.issues.push({
    kind: 'unresolved-children',
    message: `children을 해석하지 못했습니다: ${v.slice(0, 60)}`,
    file: owner.file,
    line: lineAt(ctx.sources.get(owner.file) ?? '', offset),
  });
  return [];
}

/** 식별자가 가리키는 라우트 배열(같은 파일의 배열 또는 import한 모듈). */
function resolveIdentifierRoutes(
  name: string,
  offset: number,
  owner: IParsedRouterFile,
  parentPath: string,
  env: IRouteNode['env'],
  ctx: IBuildCtx,
  seen: Set<string>,
): IRouteNode[] {
  const imported = owner.imports.get(name);
  if (imported) {
    return routesFromModule(imported.module, imported.imported, owner, parentPath, env, ctx, seen, offset);
  }
  const local = owner.arrays.get(name);
  if (local) {
    ctx.used.add(`${owner.file}#${name}`);
    return parseArray(local.text, local.offset, owner, parentPath, env, ctx, seen);
  }
  ctx.issues.push({
    kind: 'unresolved-children',
    message: `라우트 배열 \`${name}\`을(를) 찾지 못했습니다.`,
    file: owner.file,
    line: lineAt(ctx.sources.get(owner.file) ?? '', offset),
  });
  return [];
}

function routesFromModule(
  module: string,
  exportName: string,
  owner: IParsedRouterFile,
  parentPath: string,
  env: IRouteNode['env'],
  ctx: IBuildCtx,
  seen: Set<string>,
  offset: number,
): IRouteNode[] {
  const modulePath = resolveModulePath(module, owner.file);
  const target = findFile(ctx.files, modulePath);
  if (!target) {
    ctx.issues.push({
      kind: 'missing-module',
      message: `라우터 모듈을 찾지 못했습니다: ${module}`,
      file: owner.file,
      line: lineAt(ctx.sources.get(owner.file) ?? '', offset),
    });
    return [];
  }
  const key = `${target.file}#${exportName}`;
  if (seen.has(key)) return []; // 순환 참조는 한 번만
  const array = target.arrays.get(exportName);
  if (!array) {
    ctx.issues.push({
      kind: 'unresolved-children',
      message: `${target.file}에서 export \`${exportName}\`를 찾지 못했습니다.`,
      file: owner.file,
      line: lineAt(ctx.sources.get(owner.file) ?? '', offset),
    });
    return [];
  }
  ctx.used.add(key);
  // default가 가리키는 원본 배열도 "쓰였다"고 표시(같은 배열을 이름으로도 등록해 뒀다).
  for (const [n, a] of target.arrays) if (a.offset === array.offset) ctx.used.add(`${target.file}#${n}`);

  const next = new Set(seen);
  next.add(key);
  return parseArray(array.text, array.offset, target, parentPath, env, ctx, next);
}

/** `element: <X />`의 X가 실제로 어느 파일인지. */
function resolveComponent(owner: IParsedRouterFile, name: string, ctx: IBuildCtx): string | null {
  const module = owner.components.get(name);
  if (!module) return null;
  const resolved = resolveModulePath(module, owner.file);
  ctx.referencedPages.add(resolved);
  return resolved;
}

interface IBuildCtx {
  files: Map<string, IParsedRouterFile>;
  sources: Map<string, string>;
  issues: IRouterIssue[];
  /** 실제로 트리에 들어온 배열들(`파일#export`) — 나머지는 미연결 라우터다. */
  used: Set<string>;
  /** 라우트가 가리킨 페이지 모듈(확장자 없는 경로). */
  referencedPages: Set<string>;
}

/** 진입점 후보 — scaffold 관례상 `shared/router`가 통합 지점이다. */
function pickEntry(files: IRouterFile[]): string | null {
  const shared = files.find((f) => /(^|\/)src\/shared\/router\/index\.tsx?$/.test(f.path));
  if (shared) return shared.path;
  return files.find((f) => /(^|\/)shared\/router\//.test(f.path))?.path ?? null;
}

/**
 * 라우터 맵을 만든다 — 진입점부터 훑어 트리를 만들고, 그 과정에서 **연결되지 않은 것**을 모은다.
 *
 * 미연결 판정은 "훑고 남은 것"이다. 정적 분석으로 도달 가능성을 완벽히 알 수는 없으니
 * (조건부 등록·런타임 주입), 결과는 **경고이지 오류가 아니다** — 화면에도 그렇게 적는다.
 */
export function buildRouterMap(args: IBuildRouterMapArgs): IRouterMap {
  const parsed = new Map<string, IParsedRouterFile>();
  const sources = new Map<string, string>();
  for (const f of args.files) {
    parsed.set(f.path, parseRouterFile(f.text, f.path));
    sources.set(f.path, stripComments(f.text));
  }

  const ctx: IBuildCtx = {
    files: parsed,
    sources,
    issues: [],
    used: new Set(),
    referencedPages: new Set(),
  };

  const entry = args.entry ?? pickEntry(args.files);
  const entryFile = entry ? parsed.get(entry) : null;
  const entryArray = entryFile?.arrays.get('default') ?? null;

  const routes = entryFile && entryArray
    ? (() => {
      for (const [n, a] of entryFile.arrays) if (a.offset === entryArray.offset) ctx.used.add(`${entryFile.file}#${n}`);
      return parseArray(entryArray.text, entryArray.offset, entryFile, '', 'always', ctx, new Set());
    })()
    : [];

  // ── DEV/PROD 쌍둥이 접기 ──
  // 같은 자리에 같은 화면이 dev 분기와 prod 분기에 각각 있으면, 그건 **항상 열리는 화면**이다.
  // 접지 않으면 목록이 두 배가 되고(실측: /example/* 52개가 전부 두 줄), 중복 경고까지 뜬다.
  collapseEnvTwins(routes);

  // ── 평면화 ──
  const flat: IRouteNode[] = [];
  const walk = (nodes: IRouteNode[]): void => {
    for (const n of nodes) {
      flat.push(n);
      walk(n.children);
    }
  };
  walk(routes);
  // 화면 = element가 붙은 **잎**. 자식이 있으면 레이아웃이다(위 IRouterMap.screens 주석 참고).
  const screens = flat.filter((n) => n.component !== null && !n.wildcard && n.children.length === 0);

  // ── ① 중복 경로 ── 같은 주소를 두 곳이 선언하면 먼저 선언된 쪽만 열린다.
  //     DEV/PROD 분기는 의도된 중복이므로 env가 다른 쌍은 뺀다.
  const byPath = new Map<string, IRouteNode[]>();
  for (const s of screens) {
    const list = byPath.get(s.fullPath);
    if (list) list.push(s);
    else byPath.set(s.fullPath, [s]);
  }
  for (const [path, list] of byPath) {
    if (list.length < 2) continue;
    const envs = new Set(list.map((n) => n.env));
    if (envs.size > 1 && !envs.has('always')) continue; // dev/prod 짝 — 의도된 것
    ctx.issues.push({
      kind: 'duplicate-path',
      message: `같은 주소가 ${list.length}번 선언됐습니다: ${path} (먼저 선언된 화면만 열립니다)`,
      file: list[0].file,
      line: list[0].line,
      detail: list.map((n) => `${n.file}:${n.line} → ${n.component ?? '?'}`).join(' · '),
    });
  }

  // ── ② 미연결 라우터 ── 배열은 있는데 트리에 들어오지 못한 것(주석 처리된 import가 대표적).
  for (const file of parsed.values()) {
    const seenOffsets = new Set<number>();
    for (const [name, arr] of file.arrays) {
      if (ctx.used.has(`${file.file}#${name}`)) continue;
      if (seenOffsets.has(arr.offset)) continue; // 같은 배열의 다른 이름
      // 라우트 배열처럼 생긴 것만(`path:` 또는 `element:`를 가진 객체가 있어야 한다).
      if (!/\b(path|element|index)\s*:/.test(arr.text)) continue;
      seenOffsets.add(arr.offset);
      ctx.issues.push({
        kind: 'unreachable-router',
        message: `어느 라우터에도 연결되지 않았습니다: ${file.file} 의 \`${name}\``,
        file: file.file,
        line: lineAt(sources.get(file.file) ?? '', arr.offset),
        detail: '진입점에서 import 되지 않았거나, import가 주석 처리돼 있습니다.',
      });
    }
  }

  // ── ③ 고아 페이지 ── 페이지 파일인데 열 수 있는 주소가 없는 것.
  //    ★ 원인이 두 종류다. 뭉뚱그리면 고치는 방법이 달라진다:
  //      (a) 라우터에는 적혀 있는데 **그 라우터가 연결돼 있지 않다** → 진입점에 라우터를 붙이면 된다.
  //      (b) 어떤 라우터도 이 페이지를 **언급조차 안 한다** → 라우트를 새로 적어야 한다.
  let orphanPages = 0;
  if (args.pageFiles) {
    const reachable = new Set<string>();
    for (const p of ctx.referencedPages) reachable.add(stripExt(p));
    // 파일 전체(연결 여부 무관)가 언급한 페이지 — (a)와 (b)를 가르는 기준.
    const declared = new Set<string>();
    for (const file of parsed.values()) {
      for (const module of file.components.values()) declared.add(stripExt(resolveModulePath(module, file.file)));
    }
    for (const page of args.pageFiles) {
      const key = stripExt(page);
      if (reachable.has(key)) continue;
      orphanPages++;
      const declaredOnly = declared.has(key);
      ctx.issues.push({
        kind: 'orphan-page',
        message: `열 수 있는 주소가 없습니다: ${page}`,
        file: page,
        line: 1,
        detail: declaredOnly
          ? '라우터에는 적혀 있지만 그 라우터가 진입점에 연결돼 있지 않습니다(위 "연결 안 됨" 항목을 먼저 보세요).'
          : '어떤 라우터도 이 페이지를 가리키지 않습니다(작업 중이거나, 라우트를 아직 안 적었을 수 있습니다).',
      });
    }
  }

  return {
    routes,
    screens,
    issues: ctx.issues,
    entry,
    files: args.files.map((f) => f.path),
    counts: { screens: screens.length, routes: flat.length, issues: ctx.issues.length, orphanPages },
  };
}

/**
 * `...(DEV ? [A] : [A'])` 로 양쪽 분기에 똑같이 들어간 라우트를 한 줄로 합친다.
 * 같은 부모 아래에서 **경로·컴포넌트가 같고 env만 dev/prod로 갈린** 쌍만 접는다(다르면 그대로 둔다).
 */
function collapseEnvTwins(nodes: IRouteNode[]): void {
  const seen = new Map<string, IRouteNode>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    collapseEnvTwins(n.children);
    if (n.env === 'always') continue;
    const key = `${n.fullPath}|${n.component ?? ''}|${n.rawPath ?? ''}`;
    const prev = seen.get(key);
    if (prev && prev.env !== n.env) {
      prev.env = 'always'; // 양쪽 분기에 다 있으면 결국 항상 열린다
      nodes.splice(i, 1);
      i--;
      continue;
    }
    if (!prev) seen.set(key, n);
  }
}

function stripExt(p: string): string {
  return p.replace(/\.(tsx|ts|jsx|js)$/, '').replace(/\/index$/, '');
}

// ── 검색 ─────────────────────────────────────────────────────────────────────

/** 한글로도 찾을 수 있게 하는 최소 별칭. */
const QUERY_ALIASES: Record<string, string[]> = {
  주소: ['/'], 경로: ['/'], 화면: [''], 페이지: ['page'],
  목록: ['list'], 상세: ['detail'], 등록: ['create', 'new'], 수정: ['edit'],
  로그인: ['login', 'auth'], 인증: ['auth'], 관리: ['admin'], 대시보드: ['dashboard'],
};

/** 검색 — 주소·이름·컴포넌트·파일 전부를 본다. */
export function searchRoutes(screens: IRouteNode[], query: string): IRouteNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return screens;
  const terms = q.split(/[\s,]+/).filter(Boolean);
  const expand = (t: string): string[] => [t, ...(QUERY_ALIASES[t] ?? [])];
  return screens.filter((s) =>
    terms.every((term) =>
      expand(term).some((t) =>
        s.fullPath.toLowerCase().includes(t)
        || (s.name ?? '').toLowerCase().includes(t)
        || (s.component ?? '').toLowerCase().includes(t)
        || (s.componentFile ?? '').toLowerCase().includes(t),
      ),
    ),
  );
}
