/**
 * Scaffold Hover (계획서 §7 B2) — 편집기에서 심볼 위에 마우스를 올리면 그 자리에 계약·부품 카드를 띄운다.
 *
 * ## 왜 hover인가
 * 채팅·카탈로그·린트는 전부 **사람이 먼저 움직여야** 하는 축이다: 채팅은 질문할 줄 알아야 하고,
 * 카탈로그는 찾아봐야 하고, 린트는 이미 틀린 뒤에 말한다. hover는 **묻지 않아도, 코드를 읽는 그 자리에서
 * 먼저 알려주는** 축이다 — "질문할 줄 알아야 도움받는" 채팅의 한계를 넘는 지점.
 *
 * ## 이 모듈은 새 지식을 만들지 않는다
 * 표시할 내용은 전부 이미 있는 자료를 그대로 인용한다(카드 문안을 여기서 다시 쓰면 두 벌이 갈라진다):
 *  ① `ai/contracts/ScaffoldContracts` — 계약 카드의 본문(모델 프롬프트에 주입되던 그 문장 그대로)
 *  ② `ai/catalog/ComponentCatalog` — props 표·요약·스니펫(B1 카탈로그가 쓰는 그 조립 결과 그대로)
 *  ③ 가이드 문서(`media/guide-docs`) — 딥링크만(문서 렌더는 GuidePanel이 이미 잘 한다)
 *
 * vscode·fs 비의존(문자열만 받는다) — 단위 테스트가 스텁 없이 돈다. VSCode 배선은
 * `providers/ScaffoldHoverProvider`가 맡고, 이 모듈은 **무엇을 보여줄지**만 정한다. 모델 호출 0.
 */

import { SCAFFOLD_CONTRACTS } from '../contracts/ScaffoldContracts';
import type { ICatalogEntry, ICatalogMember, ICatalogProp } from '../catalog/ComponentCatalog';
import { findToken, type IDesignToken, type ITokenValue } from '../tokens/DesignTokens';
import type { IRouteNode } from '../router/RouterMap';

/** 식별자 한 글자(전역 `$router`·`$ui`·`$util` 때문에 `$`를 포함한다). */
const WORD = /[A-Za-z0-9_$]/;
/** hover 카드에 넣을 prop 표의 최대 줄 수. 넘치면 "카탈로그에서 전체 보기"로 넘긴다. */
const MAX_PROP_ROWS = 10;
/** 표 한 칸에 넣을 타입 문자열 길이 상한(긴 유니온이 hover 폭을 밀어내는 것 방지). */
const MAX_TYPE_CHARS = 64;
/** 패밀리 형제 목록에 보여줄 개수. */
const MAX_FAMILY_MEMBERS = 6;

// ── 커서 아래 심볼 ─────────────────────────────────────────────────────────────

export interface IHoverSymbol {
  /**
   * 멤버 체인의 **뿌리** 식별자. `$util.date.format` 위 어디에 커서를 두어도 `$util`이 된다
   * (사용자가 `format`에 커서를 두는 건 "이게 뭐냐"는 뜻이지 "$util은 관심 없다"는 뜻이 아니다).
   */
  word: string;
  /** 뿌리 뒤에 이어지는 멤버 경로(`.date.format`). 없으면 ''. */
  memberPath: string;
  /** 멤버 경로의 첫 조각(`date`). 없으면 null — 가이드 문서를 멤버별로 고르는 데 쓴다. */
  member: string | null;
  /** 커서가 실제로 올려진 조각(`format`). */
  hovered: string;
  /** `<Button` · `</Button` 처럼 JSX 태그 자리인가. */
  jsxTag: boolean;
  /** 이 체인이 곧바로 호출되는가(`cn(`·`$util.number.comma(`) — 흔한 이름의 오탐 가드. */
  call: boolean;
  /** 뿌리 식별자의 줄 안 위치 — hover 하이라이트 범위. */
  start: number;
  end: number;
}

/**
 * 줄 텍스트와 열 위치에서 심볼을 뽑는다.
 *
 * 멤버 체인은 **뿌리까지 거슬러 올라간다**(`$util.date.format`의 `format`에 커서 → 뿌리 `$util`).
 * 단, `foo().bar`처럼 점 앞이 식별자가 아니면 거기서 멈춘다(엉뚱한 뿌리를 만들지 않는다).
 */
export function symbolAt(lineText: string, character: number): IHoverSymbol | null {
  if (character < 0 || character > lineText.length) return null;

  // ① 커서가 올려진 조각의 경계.
  let s = character;
  let e = character;
  while (s > 0 && WORD.test(lineText[s - 1])) s--;
  while (e < lineText.length && WORD.test(lineText[e])) e++;
  if (s === e) return null;
  const hovered = lineText.slice(s, e);

  // ② 점(.)을 타고 뿌리까지 — `.` 앞이 식별자일 때만.
  let rootStart = s;
  for (;;) {
    if (rootStart === 0 || lineText[rootStart - 1] !== '.') break;
    const dot = rootStart - 1;
    let q = dot;
    while (q > 0 && WORD.test(lineText[q - 1])) q--;
    if (q === dot) break; // `.` 앞이 식별자가 아니다 → 여기가 뿌리
    rootStart = q;
  }
  let rootEnd = rootStart;
  while (rootEnd < lineText.length && WORD.test(lineText[rootEnd])) rootEnd++;
  const word = lineText.slice(rootStart, rootEnd);

  // ③ 뿌리 뒤 멤버 경로와 호출 여부.
  const rest = lineText.slice(rootEnd);
  const chain = rest.match(/^(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+/);
  const memberPath = chain ? chain[0] : '';
  const member = memberPath ? memberPath.slice(1).split('.')[0] : null;
  const call = /^\s*\(/.test(rest.slice(memberPath.length));

  const before = lineText.slice(0, rootStart);
  const jsxTag = /<\/?\s*$/.test(before);

  return { word, memberPath, member, hovered, jsxTag, call, start: rootStart, end: rootEnd };
}

// ── 계약 심볼 표 ───────────────────────────────────────────────────────────────

/** 계약 카드 하나를 어떤 심볼에 붙일지 + 그 심볼 전용 가드·가이드 딥링크. */
export interface IHoverContractSymbol {
  /** 커서 아래 뿌리 식별자와 정확히 일치해야 하는 이름. */
  symbol: string;
  /** `SCAFFOLD_CONTRACTS`의 카드 id — 본문은 그 카드를 그대로 인용한다. */
  contractId: string;
  /** 오탐 가드(생략 = 항상 발동). 전역(`$…`)·라이브러리 훅은 충돌 위험이 없어 대부분 생략한다. */
  guard?: (source: string, sym: IHoverSymbol) => boolean;
  /** 멤버에 따라 달라지는 가이드 문서 docId(없으면 링크 생략). */
  guide?: (member: string | null) => string | null;
}

/** `$util` 네임스페이스 → 가이드 문서. 멤버를 보고 그 네임스페이스 문서로 바로 보낸다. */
const UTIL_GUIDE: Record<string, string> = {
  number: 'apis/service-objects/util/number-util',
  date: 'apis/service-objects/util/date-util',
  string: 'apis/service-objects/util/string-util',
  finance: 'apis/service-objects/util/finance-util',
  object: 'apis/service-objects/util/object-util',
  array: 'apis/service-objects/util/array-util',
};

/** `$ui` 멤버 → 가이드 문서. */
const UI_GUIDE: Record<string, string> = {
  alert: 'apis/service-objects/ui/alert-ui',
  confirm: 'apis/service-objects/ui/confirm-ui',
  dialog: 'apis/service-objects/ui/dialog-ui',
};

/**
 * hover가 계약 카드를 띄우는 심볼들.
 *
 * 고른 기준은 **"이미 사람이 읽을 수 있게 쓰인 카드"** 하나다. 표·레시피형 카드(list-table-binding,
 * date-picker, button-component 등)는 본문이 모델 지시문("axiom-action을 내세요", "…를 출력하세요")이라
 * 사람 hover에는 넣지 않는다 — 넣으려면 문안을 새로 써야 하고, 그 순간 카드가 두 벌이 된다.
 */
export const HOVER_CONTRACT_SYMBOLS: IHoverContractSymbol[] = [
  { symbol: 'useApi', contractId: 'use-api', guide: () => 'apis/global-function/hooks/use-api' },
  {
    symbol: 'refetch',
    contractId: 'use-api',
    // 아무 데서나 쓰이는 흔한 이름이라, 같은 파일에 useApi가 있을 때만 — 남의 refetch에 참견하지 않는다.
    guard: (source) => /\buseApi\b/.test(source),
    guide: () => 'apis/global-function/hooks/use-api',
  },
  { symbol: '$router', contractId: 'router', guide: () => 'apis/service-objects/router/index' },
  {
    symbol: '$ui',
    contractId: 'global-ui-alerts',
    guide: (m) => (m && UI_GUIDE[m]) || 'apis/service-objects/ui/alert-ui',
  },
  { symbol: '$util', contractId: 'global-util', guide: (m) => (m ? UTIL_GUIDE[m] ?? null : null) },
  {
    symbol: 'cn',
    contractId: 'class-merge-cn',
    // 두 글자짜리 흔한 이름이라 가드가 필수 — 호출 형태(`cn(`)이거나 실제로 import 돼 있을 때만.
    guard: (source, sym) => sym.call || importedNames(source).has('cn'),
  },
  { symbol: 'useForm', contractId: 'form-validation' },
  { symbol: 'zodResolver', contractId: 'form-validation' },
];

// ── 파일 안 사실 확인(오탐 가드) ────────────────────────────────────────────────

/** import 한 건의 바인딩 — 로컬 이름이 **무엇을, 어디서** 가져온 것인지. */
export interface IImportBinding {
  /** 원래(export 된) 이름. `import { Button as Btn }`이면 `Button`. */
  name: string;
  /** 가져온 모듈 지정자. `@axiom/components/ui` · `./MyTable` 등. */
  module: string;
}

/**
 * 이 파일이 import 하는 이름들: **로컬 바인딩 이름 → 바인딩**.
 *
 * 모듈 지정자까지 들고 있는 이유는 동명이인 때문이다 — `import { Table } from './MyTable'`인 파일의
 * `<Table>`에 shadcn Table 문서를 띄우면 그건 명백한 오답이다(실 코드베이스 스모크에서 확인한 위험).
 */
export function importedNames(source: string): Map<string, IImportBinding> {
  const out = new Map<string, IImportBinding>();
  for (const m of source.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const module = m[2];
    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const t = part.trim().replace(/^type\s+/, '');
        if (!t) continue;
        const as = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        if (as) out.set(as[2], { name: as[1], module });
        else if (/^[A-Za-z_$][\w$]*$/.test(t)) out.set(t, { name: t, module });
      }
    }
    // default / namespace import — 중괄호를 걷어낸 앞부분.
    const head = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
    const ns = head.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) out.set(ns[1], { name: ns[1], module });
    else if (/^[A-Za-z_$][\w$]*$/.test(head)) out.set(head, { name: head, module });
  }
  return out;
}

/**
 * 이 모듈에서 온 이름이 **scaffold가 제공하는 그 부품**인가.
 *
 * 배럴(`@axiom/components/ui`)만 인정하면 안 된다 — 실 코드베이스에는 배럴을 건너뛰고
 * `@/shared/lib/shadcn/ui/combobox` 처럼 깊은 경로로 가져다 쓰는 파일이 실제로 있다
 * (그건 린트 `ui-import-path`가 따로 지적할 일이고, hover까지 입을 다물 이유는 없다).
 * 반대로 `lucide-react`의 `Badge`, `@mui/material`의 `Button`, `vaul`의 `Drawer`는 **다른 물건**이라
 * 여기서 걸러진다(실 scaffold 전량 스모크에서 실제로 잡힌 동명이인들).
 */
function isScaffoldModule(module: string, importPath: string | null): boolean {
  if (importPath && module === importPath) return true;
  if (/^@axiom\//.test(module)) return true;
  return /(^|\/)(shadcn\/ui|components\/ui)(\/|$)/.test(module);
}

/**
 * 이 파일이 같은 이름을 **직접 선언**하는가. 로컬 선언이 있으면 hover를 내지 않는다 —
 * 자기 프로젝트의 `Card`를 정의해 둔 파일에서 shadcn `Card` 문서를 띄우면 그건 오답이다.
 */
export function declaresLocally(source: string, name: string): boolean {
  const id = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:default\\s+)?(?:const|let|var|function|class)\\s+${id}\\b`,
  ).test(source);
}

// ── 결과 카드 ─────────────────────────────────────────────────────────────────

export interface IHoverCard {
  kind: 'contract' | 'component' | 'token' | 'route';
  /** 계약 카드 id 또는 카탈로그 항목 id. */
  id: string;
  title: string;
  /** 제목 옆 한 줄(출처·import 경로 등). */
  subtitle: string;
  /** 마크다운 본문(링크 줄 제외 — 링크는 `buildHoverLinks`가 붙인다). */
  body: string;
  /** 가이드 딥링크 후보(문서가 실제로 있는지는 호출자가 확인한다). */
  guideDocId: string | null;
  /** 카탈로그 딥링크용 항목 id. */
  catalogEntryId: string | null;
  /** 컴포넌트 소스 상대경로(props 인덱스 기준). */
  source: string | null;
  /** 토큰 카드일 때 정의 위치(스타일 루트 기준 상대경로 + 1-based 줄) — "정의 열기" 링크용. */
  definition: { file: string; line: number } | null;
  /** hover 하이라이트 범위(줄 안 열 위치). */
  range: { start: number; end: number };
}

export interface IHoverInput {
  lineText: string;
  character: number;
  /** 파일 전체 — 오탐 가드(import·로컬 선언 확인)에만 쓴다. */
  source: string;
  /** 카탈로그(B1과 같은 조립 결과). 없으면 컴포넌트 hover는 건너뛴다. */
  entries?: ICatalogEntry[];
  /** 디자인 토큰(B3). 없으면 토큰 hover는 건너뛴다. */
  tokens?: IDesignToken[];
  /** 라우터 맵의 화면들(B4). 없으면 주소 hover는 건너뛴다. */
  screens?: IRouteNode[];
}

/**
 * 커서 아래 심볼에 띄울 카드를 고른다. 해당 없으면 null(= hover 없음, 다른 provider에 양보).
 *
 * 순서는 **계약 → 컴포넌트**다. 계약 심볼은 전역·훅이라 컴포넌트 이름과 겹치지 않고,
 * 겹친다면 계약 쪽이 더 강한 사실이다.
 */
export function resolveScaffoldHover(input: IHoverInput): IHoverCard | null {
  const sym = symbolAt(input.lineText, input.character);
  if (!sym) return null;

  const contract = resolveContractHover(sym, input.source);
  if (contract) return contract;

  const component = resolveComponentHover(sym, input.source, input.entries ?? []);
  if (component) return component;

  // 토큰은 식별자 규칙이 달라(`--color-primary`) 심볼을 따로 뽑는다.
  const token = resolveTokenHover(input.lineText, input.character, input.tokens ?? []);
  if (token) return token;

  // 주소는 따옴표 안 문자열이라 또 다르다(`$router.push('/example/blank-page')`).
  return resolveRouteHover(input.lineText, input.character, input.screens ?? []);
}

function resolveContractHover(sym: IHoverSymbol, source: string): IHoverCard | null {
  const entry = HOVER_CONTRACT_SYMBOLS.find((c) => c.symbol === sym.word);
  if (!entry) return null;
  if (entry.guard && !entry.guard(source, sym)) return null;
  const contract = SCAFFOLD_CONTRACTS.find((c) => c.id === entry.contractId);
  if (!contract) return null;

  return {
    kind: 'contract',
    id: contract.id,
    title: contract.title,
    subtitle: 'react-app-scaffold 계약',
    body: contract.card,
    guideDocId: entry.guide ? entry.guide(sym.member) : null,
    catalogEntryId: null,
    source: null,
    definition: null,
    range: { start: sym.start, end: sym.end },
  };
}

/** 카탈로그에서 이 이름의 항목·구성원을 찾는다(정확 일치만 — 부분 일치는 오탐이 된다). */
export function findCatalogMember(
  entries: ICatalogEntry[],
  name: string,
): { entry: ICatalogEntry; member: ICatalogMember | null } | null {
  for (const entry of entries) {
    const member = entry.members.find((m) => m.name === name);
    if (member) return { entry, member };
  }
  const byName = entries.find((e) => e.name === name);
  return byName ? { entry: byName, member: null } : null;
}

function resolveComponentHover(sym: IHoverSymbol, source: string, entries: ICatalogEntry[]): IHoverCard | null {
  if (entries.length === 0) return null;
  if (!/^[A-Z][A-Za-z0-9]*$/.test(sym.word)) return null; // 컴포넌트는 PascalCase

  // 이 파일이 같은 이름을 직접 선언하면 그건 남의 부품이 아니라 이 파일의 것이다.
  if (declaresLocally(source, sym.word)) return null;

  const imports = importedNames(source);
  const binding = imports.get(sym.word);
  // JSX 태그 자리이거나 import 된 이름일 때만 — 평범한 변수명 `Card`에 문서를 들이대지 않는다.
  if (!sym.jsxTag && !binding) return null;

  const found = findCatalogMember(entries, binding?.name ?? sym.word);
  if (!found) return null;

  const { entry, member } = found;
  // 같은 이름을 **다른 모듈**에서 가져왔다면 그건 이 프로젝트의 다른 부품이다(`./MyTable`의 Table).
  if (binding && !isScaffoldModule(binding.module, member?.import ?? entry.importPath)) return null;
  const shown = member ?? entry.members.find((m) => m.name === entry.name) ?? null;
  const importPath = shown?.import ?? entry.importPath;

  return {
    kind: 'component',
    id: entry.id,
    title: shown?.name ?? entry.name,
    subtitle: importPath ? `컴포넌트 · \`${importPath}\`` : '컴포넌트',
    body: renderComponentBody(entry, shown),
    guideDocId: entry.guideDocId,
    catalogEntryId: entry.id,
    source: shown?.source ?? null,
    definition: null,
    range: { start: sym.start, end: sym.end },
  };
}

// ── 디자인 토큰 hover (§7 B3) ──────────────────────────────────────────────────

/** CSS 변수 이름 한 글자 — 식별자와 달리 `-`를 포함한다(`--color-primary`). */
const CSS_VAR_CHAR = /[A-Za-z0-9_-]/;

/**
 * 커서 아래의 CSS 변수 이름(`--color-primary`). 변수가 아니면 null.
 *
 * `var(--color-primary)`의 `color` 위든 `--` 위든 같은 이름을 돌려준다. Tailwind 클래스
 * (`bg-brand-500`)처럼 `--`로 시작하지 않는 토막은 걸리지 않는다.
 */
export function cssVarAt(lineText: string, character: number): { name: string; start: number; end: number } | null {
  if (character < 0 || character > lineText.length) return null;
  let s = character;
  let e = character;
  while (s > 0 && CSS_VAR_CHAR.test(lineText[s - 1])) s--;
  while (e < lineText.length && CSS_VAR_CHAR.test(lineText[e])) e++;
  if (s === e) return null;
  const name = lineText.slice(s, e);
  if (!/^--[A-Za-z0-9_-]+$/.test(name)) return null;
  return { name, start: s, end: e };
}

/** 색 견본 — hover 마크다운에는 색을 칠할 방법이 없어 **작은 SVG 이미지**로 그린다. */
export function colorSwatch(color: string): string {
  const safe = color.replace(/"/g, "'");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">`
    + `<rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="${safe}" stroke="rgba(128,128,128,0.6)"/></svg>`;
  return `![](data:image/svg+xml;utf8,${encodeURIComponent(svg)})`;
}

/** 값 한 줄 — 견본 + 최종 값 + (참조를 거쳤으면) 그 경로. */
function tokenValueLine(label: string, v: ITokenValue): string {
  const swatch = v.color ? `${colorSwatch(v.color)} ` : '';
  const via = v.chain.length > 0 ? ` — \`${v.raw}\` 경유 ${v.chain.map((c) => `\`${c}\``).join(' → ')}` : '';
  return `- ${label} ${swatch}\`${v.resolved}\`${via}`;
}

/**
 * 디자인 토큰 카드. **라이트·다크를 함께** 보여준다 — 한쪽만 보여주면 절반이 거짓이 되고,
 * 다크에서 재정의되지 않았으면 "같음"이라고 말한다(빈칸으로 두면 모르는 것처럼 보인다).
 */
export function resolveTokenHover(lineText: string, character: number, tokens: IDesignToken[]): IHoverCard | null {
  if (tokens.length === 0) return null;
  const at = cssVarAt(lineText, character);
  if (!at) return null;
  const token = findToken(tokens, at.name);
  if (!token) return null;

  const lines: string[] = [];
  if (token.light) lines.push(tokenValueLine('라이트', token.light));
  if (token.dark) lines.push(tokenValueLine('다크  ', token.dark));
  else if (token.light) lines.push('- 다크   라이트와 같음(재정의 없음)');

  const def = token.light ?? token.dark;
  if (def) lines.push(`- 정의   \`${def.file}:${def.line}\``);

  return {
    kind: 'token',
    id: token.name,
    title: token.name,
    subtitle: `디자인 토큰 · ${token.group}`,
    body: lines.join('\n'),
    guideDocId: null,
    catalogEntryId: null,
    source: null,
    definition: def ? { file: def.file, line: def.line } : null,
    range: { start: at.start, end: at.end },
  };
}

// ── 라우트 주소 hover (§7 B4) ─────────────────────────────────────────────────

/** 커서가 들어 있는 따옴표 문자열. 문자열 안이 아니면 null. */
export function stringAt(lineText: string, character: number): { value: string; start: number; end: number } | null {
  // 따옴표 세 종류 · 이스케이프 허용 · 같은 따옴표로 닫힐 때까지.
  for (const m of lineText.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (character >= start && character <= end) return { value: m[2], start, end };
  }
  return null;
}

/**
 * 이 줄이 **화면 이동**을 하고 있는가. "없는 주소" 경고는 이때만 낸다 —
 * `'/api/employees'` 같은 API 경로에 "화면이 없다"고 말하면 그건 명백한 오답이다.
 */
export function isNavigationLine(lineText: string): boolean {
  return /\$router\s*\.\s*(push|replace)\s*\(|\bnavigate\s*\(|<\s*(Link|NavLink)\b|\bto\s*=|\bhref\s*=/.test(lineText);
}

/** 같은 뿌리를 공유하는 가까운 주소들(오타 제보에 곁들일 후보). */
function nearbyRoutes(screens: IRouteNode[], target: string): IRouteNode[] {
  const segs = target.split('/').filter(Boolean);
  const scored = screens
    .map((s) => {
      const other = s.fullPath.split('/').filter(Boolean);
      let shared = 0;
      while (shared < segs.length && shared < other.length && segs[shared] === other[shared]) shared++;
      const lastSame = segs.length > 0 && other.length > 0 && segs[segs.length - 1] === other[other.length - 1];
      return { s, score: shared * 2 + (lastSame ? 1 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.fullPath.localeCompare(b.s.fullPath));
  return scored.slice(0, 3).map((x) => x.s);
}

/** `:id` 자리를 실제 값으로 채운 주소도 그 라우트로 본다. */
function matchDynamic(screens: IRouteNode[], target: string): IRouteNode | null {
  const segs = target.split('/');
  for (const s of screens) {
    if (!s.dynamic) continue;
    const pattern = s.fullPath.split('/');
    if (pattern.length !== segs.length) continue;
    if (pattern.every((p, i) => p.startsWith(':') || p === segs[i])) return s;
  }
  return null;
}

/**
 * 주소 문자열 hover — 그 주소가 **어떤 화면인지** 알려주고, 화면 이동인데 맞는 주소가 없으면
 * 그 사실을 알린다(오타·지워진 화면을 그 자리에서 잡는다).
 */
export function resolveRouteHover(lineText: string, character: number, screens: IRouteNode[]): IHoverCard | null {
  if (screens.length === 0) return null;
  const str = stringAt(lineText, character);
  if (!str || !str.value.startsWith('/')) return null;

  const path = str.value.replace(/[?#].*$/, '').replace(/\/$/, '') || '/';
  const exact = screens.find((s) => s.fullPath === path) ?? matchDynamic(screens, path);
  const range = { start: str.start, end: str.end };

  if (exact) {
    const lines = [
      `- 화면   **${exact.name ?? exact.component ?? '(이름 없음)'}**`,
      exact.component ? `- 컴포넌트 \`${exact.component}\`` : '',
      exact.componentFile ? `- 파일   \`${exact.componentFile}\`` : '',
      `- 라우트  \`${exact.file}:${exact.line}\``,
      exact.env !== 'always'
        ? `- ⚠ **${exact.env === 'dev' ? 'DEV' : 'PROD'} 전용** 분기에만 등록돼 있습니다.`
        : '',
    ].filter(Boolean);
    return {
      kind: 'route',
      id: exact.fullPath,
      title: exact.fullPath,
      subtitle: '라우트 주소',
      body: lines.join('\n'),
      guideDocId: null,
      catalogEntryId: null,
      source: exact.componentFile,
      definition: { file: exact.file, line: exact.line },
      range,
    };
  }

  // 맞는 화면이 없다 — **화면 이동 문맥일 때만** 말한다(API 경로에 참견 금지).
  if (!isNavigationLine(lineText)) return null;
  const near = nearbyRoutes(screens, path);
  const body = [
    '- ⚠ 이 주소로 열리는 화면을 찾지 못했습니다.',
    near.length > 0 ? `- 비슷한 주소: ${near.map((n) => `\`${n.fullPath}\``).join(' · ')}` : '',
    '- 라우터에 아직 안 적었거나, 주소가 바뀌었거나, 오타일 수 있습니다.',
  ].filter(Boolean);
  return {
    kind: 'route',
    id: path,
    title: path,
    subtitle: '라우트 주소 — 화면 없음',
    body: body.join('\n'),
    guideDocId: null,
    catalogEntryId: null,
    source: null,
    definition: null,
    range,
  };
}

// ── 마크다운 조립 ──────────────────────────────────────────────────────────────

/** 표 한 칸에 안전하게 넣을 타입 문자열(유니온의 `|`가 표를 깨뜨린다 — 백틱 안에서도 깨진다). */
export function typeCell(type: string): string {
  const flat = type.replace(/\s+/g, ' ').trim();
  const cut = flat.length > MAX_TYPE_CHARS ? `${flat.slice(0, MAX_TYPE_CHARS - 1)}…` : flat;
  return cut.replace(/\|/g, '\\|');
}

/** prop 표 — 필수를 위로, 넘치면 몇 개가 더 있는지 사실대로 적는다(숨기지 않는다). */
export function propTable(props: ICatalogProp[]): string {
  if (props.length === 0) return '';
  const ordered = [...props].sort((a, b) => Number(b.required) - Number(a.required));
  const rows = ordered.slice(0, MAX_PROP_ROWS).map((p) => {
    const name = p.required ? `**${p.name}**` : p.name;
    return `| ${name} | \`${typeCell(p.type)}\` | ${p.required ? '필수' : ''} |`;
  });
  const rest = ordered.length - rows.length;
  const table = ['| prop | 타입 | |', '|---|---|---|', ...rows].join('\n');
  return rest > 0 ? `${table}\n\n— prop ${rest}개 더 있음` : table;
}

function renderComponentBody(entry: ICatalogEntry, member: ICatalogMember | null): string {
  const parts: string[] = [];
  if (entry.summary) parts.push(entry.summary);

  if (entry.snippet) parts.push(`\`\`\`tsx\n${entry.snippet}\n\`\`\``);
  else if (entry.importLine) parts.push(`\`\`\`tsx\n${entry.importLine}\n\`\`\``);

  const table = propTable(member?.props ?? []);
  if (table) parts.push(table);

  const notes: string[] = [];
  if (member && member.props.length === 0) notes.push('선언된 prop이 없습니다(표준 속성만 받습니다).');
  if (member?.domNote) notes.push('표준 DOM 속성도 함께 받습니다.');
  if (member?.truncated) notes.push('prop 목록이 잘렸습니다 — 전체는 소스를 보세요.');
  if (entry.members.length > 1) {
    const family = entry.members.map((m) => m.name);
    const head = family.slice(0, MAX_FAMILY_MEMBERS).join(' · ');
    const more = family.length > MAX_FAMILY_MEMBERS ? ` 외 ${family.length - MAX_FAMILY_MEMBERS}개` : '';
    notes.push(`패밀리: ${head}${more}`);
  }
  if (notes.length > 0) parts.push(notes.map((n) => `- ${n}`).join('\n'));

  return parts.join('\n\n');
}

/** 명령 링크 하나 — VSCode hover의 `command:` URI 형식(호출자가 `isTrusted`를 켜야 동작한다). */
export function commandLink(label: string, command: string, args?: unknown[]): string {
  const query = args && args.length > 0 ? `?${encodeURIComponent(JSON.stringify(args))}` : '';
  return `[${label}](command:${command}${query})`;
}

/**
 * 카드 아래 링크 줄. 문서가 없는데 링크를 걸면 눌렀을 때 "문서를 읽을 수 없습니다"가 뜬다 —
 * `hasGuideDoc`으로 **있는 것만** 건다(호출자가 파일 존재를 확인해 넘긴다).
 */
export function buildHoverLinks(
  card: IHoverCard,
  opts: { hasGuideDoc?: (docId: string) => boolean } = {},
): string {
  const has = opts.hasGuideDoc ?? (() => true);
  const links: string[] = [];
  if (card.guideDocId && has(card.guideDocId)) {
    links.push(commandLink('📖 가이드에서 열기', 'axiom-ai.openGuide', [card.guideDocId]));
  }
  if (card.catalogEntryId) {
    links.push(commandLink('🧩 카탈로그에서 열기', 'axiom-ai.openComponentCatalog', [card.catalogEntryId]));
  }
  if (card.kind === 'route') {
    links.push(commandLink('🗺 라우터 맵에서 열기', 'axiom-ai.openRouterMap', [card.id]));
    if (card.definition) {
      links.push(commandLink('📄 라우트 열기', 'axiom-ai.openTokenDefinition', [card.definition.file, card.definition.line]));
    }
  }
  if (card.kind === 'token') {
    links.push(commandLink('🎨 토큰 브라우저에서 열기', 'axiom-ai.openDesignTokens', [card.id]));
    if (card.definition) {
      links.push(commandLink('📄 정의 열기', 'axiom-ai.openTokenDefinition', [card.definition.file, card.definition.line]));
    }
  }
  return links.join(' · ');
}

/** hover 본문 전체(제목 줄 + 본문 + 링크 줄). provider는 이 문자열을 그대로 MarkdownString에 넣는다. */
export function renderHoverMarkdown(
  card: IHoverCard,
  opts: { hasGuideDoc?: (docId: string) => boolean } = {},
): string {
  const head = `**${card.title}** — ${card.subtitle}`;
  const links = buildHoverLinks(card, opts);
  return [head, card.body, links].filter((s) => s.length > 0).join('\n\n');
}
