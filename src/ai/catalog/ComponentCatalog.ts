/**
 * 컴포넌트 카탈로그 (계획서 §7 B1) — **데이터는 이미 다 있고 창만 없던** 것을 하나로 모으는 순수 층.
 *
 * 세 갈래로 흩어져 있던 부품 지식을 한 목록으로 합친다:
 *  ① `componentPropsIndex`(자동생성, 53종) — prop 이름·타입·필수 여부. 지금까지 **모델 프롬프트에만**
 *     주입되고 사람이 볼 창구는 없었다.
 *  ② `media/guide-docs/components/ui/*.md`(32종) — 스크린샷까지 있는 사용 가이드. 딥링크로 연결한다.
 *  ③ `knowledge/components/*.md`(7종) — 오프라인 지식 문서. 코드 예제의 출처.
 *
 * vscode·fs 비의존(텍스트만 입력받음) — 단위 테스트와 **웹뷰**에서 그대로 호출한다.
 * (검색을 웹뷰가 직접 돌리므로 타이핑마다 호스트 왕복이 없다. 그래서 이 모듈은 순수여야 한다.)
 */

/** 이 항목이 어떤 자료에서 왔는지. 배지로 그대로 보여준다 — "없는 것"도 사실대로. */
export type TCatalogOrigin = 'props' | 'guide' | 'knowledge';

export interface ICatalogProp {
  name: string;
  type: string;
  required: boolean;
  doc?: string;
}

/** 패밀리에 속한 실제 컴포넌트 하나(예: Select 패밀리의 SelectItem). */
export interface ICatalogMember {
  name: string;
  import: string;
  source: string;
  props: ICatalogProp[];
  /** 표준 DOM 속성도 함께 받는가. */
  domNote: boolean;
  /** 생성기 상한으로 prop 목록이 잘렸는가. */
  truncated: boolean;
}

export interface ICatalogExample {
  title: string;
  lang: string;
  code: string;
}

/**
 * 목록의 한 줄 = **패밀리**(Select·SelectItem·SelectTrigger…를 한 항목으로).
 * 53종을 평평하게 늘어놓으면 Select* 10개가 목록을 잡아먹어 훑어볼 수 없다.
 */
export interface ICatalogEntry {
  /** kebab-case 식별자(가이드 문서 파일명과 같은 어휘라 매칭 키로 쓴다). */
  id: string;
  /** 표시 이름(props 인덱스가 있으면 PascalCase 패밀리명, 없으면 가이드 문서 title). */
  name: string;
  origins: TCatalogOrigin[];
  members: ICatalogMember[];
  propCount: number;
  requiredCount: number;
  /** 배럴 import 경로(예: '@axiom/components/ui'). 모르면 null. */
  importPath: string | null;
  /** 문서에 적힌 실제 import 한 줄(있으면 그대로 복사용). */
  importLine: string | null;
  /** `axiom-ai.openGuide` 딥링크용 docId(예: 'components/ui/button-component'). */
  guideDocId: string | null;
  /** 지식 문서 출처(예: 'components/Button.md'). */
  knowledgeSource: string | null;
  summary: string;
  examples: ICatalogExample[];
  /** 최소 사용 스니펫(import + 필수 prop만 채운 JSX). */
  snippet: string | null;
  /** 태그 등 짧은 검색어(한글 포함). */
  keywords: string[];
  /** 본문 앞부분 — 한글 검색이 가이드 문서에도 걸리게 하는 보조 색인. */
  searchText: string;
}

/** componentPropsIndex 항목의 모양(생성 파일을 import 하지 않고 구조만 받는다). */
export interface IPropsIndexEntry {
  import: string;
  source: string;
  props: ICatalogProp[];
  domNote: boolean;
  truncated?: boolean;
}

/** 문서 한 건의 원문(가이드=docId, 지식=source 를 id 로 준다). */
export interface IRawDoc {
  id: string;
  text: string;
}

const MAX_EXAMPLES = 8;
const MAX_EXAMPLE_CHARS = 2500;
const MAX_SEARCH_TEXT = 1200;
const MAX_SUMMARY = 200;
/** 태그 상한 — 실 문서(SmartTable)의 태그가 90개를 넘는다. 상한이 낮으면 뒤쪽 태그('표')가 통째로 사라진다. */
const MAX_KEYWORDS = 200;

// ── 이름 다루기 ────────────────────────────────────────────────────────────────

/** PascalCase 를 단어로 쪼갠다: DropdownMenuSubTrigger → [Dropdown, Menu, Sub, Trigger]. */
export function splitPascal(name: string): string[] {
  return name.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [name];
}

/** 'SmartTable' → 'smart-table' · 'Button Group' → 'button-group' (가이드 파일명 어휘와 일치). */
export function toKebab(name: string): string {
  return splitPascal(name.replace(/\s+/g, ''))
    .map((w) => w.toLowerCase())
    .join('-');
}

/**
 * 컴포넌트 이름들을 패밀리로 묶는다.
 *
 * 규칙: **첫 단어**로 모으고, 라벨은 그 그룹 전원이 공유하는 **가장 긴 단어 접두사**.
 * (DropdownMenu* 는 'DropdownMenu' 로, Select* 는 'Select' 로 — 두 컴포넌트씩 최장 공통을 찾으면
 *  SelectScrollUp/Down 이 'SelectScroll' 로 따로 떨어져 나가 Select 패밀리가 쪼개진다.)
 */
export function groupFamilies(names: string[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const n of names) {
    const head = splitPascal(n)[0] ?? n;
    const list = buckets.get(head);
    if (list) list.push(n);
    else buckets.set(head, [n]);
  }

  const families = new Map<string, string[]>();
  for (const members of buckets.values()) {
    const wordLists = members.map((m) => splitPascal(m));
    let common = wordLists[0].slice();
    for (const words of wordLists.slice(1)) {
      const next: string[] = [];
      for (let i = 0; i < Math.min(common.length, words.length); i++) {
        if (common[i] !== words[i]) break;
        next.push(common[i]);
      }
      common = next;
    }
    // 그룹이 한 컴포넌트뿐이면 이름 그대로(공통 접두사를 쓰면 SmartTable 이 Smart 가 된다).
    const label = members.length === 1 ? members[0] : common.join('') || members[0];
    families.set(label, members);
  }
  return families;
}

// ── 문서 파싱 ─────────────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** frontmatter 를 떼고 key→value 로 읽는다. `tags: [a, b,\n c]` 처럼 여러 줄인 배열도 이어 붙인다. */
export function readFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { fm: {}, body: raw.trim() };

  const fm: Record<string, string> = {};
  let key: string | null = null;
  let buf = '';
  const flush = (): void => {
    if (key) fm[key] = buf.trim().replace(/^["']|["']$/g, '');
    key = null;
    buf = '';
  };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) {
      flush();
      key = kv[1].toLowerCase();
      buf = kv[2];
    } else if (key) {
      buf += ` ${line.trim()}`; // 여러 줄에 걸친 배열 이어 붙이기
    }
  }
  flush();
  return { fm, body: raw.slice(m[0].length).trim() };
}

/** `[a, b, c]` 또는 `a, b` 형태의 frontmatter 값을 목록으로. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** 마크다운 장식을 걷어낸 평문(요약·검색 색인용). */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 본문에서 첫 설명 문단(헤딩·인용·이미지 줄 제외)을 한 줄 요약으로. */
export function firstParagraph(body: string, limit = MAX_SUMMARY): string {
  const buf: string[] = [];
  /** 여러 줄에 걸친 MDX/JSX 블록을 닫을 때까지 건너뛰는 상태(닫는 글자). */
  let closing: string | null = null;

  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    // ★ 여러 줄 MDX/JSX는 **블록째** 건너뛴다. 첫 줄만 걸러내면 속성 줄
    //   (`storyPath="…" title="… 인터랙티브 예제"`)이 그대로 요약이 된다(실측 2차).
    if (closing) {
      if (t.includes(closing)) closing = null;
      continue;
    }
    if (!t) {
      if (buf.length > 0) break;
      continue;
    }
    // 헤딩·인용·표·펜스·이미지에 더해 **MDX/JSX 줄**(`{/* … */}` · `<Iframe …/>` · import/export)도 건너뛴다.
    // 실 가이드 문서 10개가 상단 MDX import 주석으로 시작해 그게 그대로 요약이 됐다(실측 1차).
    if (/^(#{1,6}\s|>|\||```|!\[|-{3,}|:{3}|\{|<|import\s|export\s)/.test(t)) {
      if (buf.length > 0) break;
      // MDX 주석 블록 `{/* … */}` 은 안에 `}`(예: `minHeight={600}`)가 흔해서 `}`로 닫으면 너무 일찍
      // 풀린다 — 실제로 그 바람에 닫는 줄 `/>` 가 요약이 됐다. 여는 모양에 맞는 닫는 모양을 쓴다.
      if (t.startsWith('{/*') && !t.includes('*/}')) closing = '*/}';
      else if (t.startsWith('{') && !t.includes('}')) closing = '}';
      else if (t.startsWith('<') && !t.includes('>')) closing = '>';
      continue;
    }
    buf.push(t);
    if (buf.join(' ').length > limit) break;
  }
  const text = plain(buf.join(' '));
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * 문서 안의 배럴 import 한 줄(가장 먼저 나오는 `@axiom/...` import).
 * ⚠ 따옴표는 **두 종류 다** 받는다 — 지식 문서는 `'`, 가이드 문서는 `"` 를 쓴다.
 * (한쪽만 보다가 가이드 전용 부품 다수의 스니펫이 통째로 비어 있던 실측 버그.)
 */
export function findImportLine(body: string): string | null {
  const m = body.match(/^\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]@axiom\/[^'"]+['"];?\s*$/m);
  return m ? m[0].trim() : null;
}

/**
 * 본문의 펜스 코드블록을 **가장 가까운 앞 헤딩**을 제목으로 붙여 예제 목록으로 만든다.
 * (문서를 통째로 렌더하지 않고 "예제만" 훑어보게 하려는 것 — 전문은 가이드 패널이 맡는다.)
 */
export function extractExamples(body: string): ICatalogExample[] {
  const out: ICatalogExample[] = [];
  let heading = '예시';
  let fence: { lang: string; buf: string[] } | null = null;

  for (const line of body.split(/\r?\n/)) {
    if (fence) {
      if (/^\s*```\s*$/.test(line)) {
        const code = fence.buf.join('\n').trim();
        if (code) {
          out.push({
            title: heading,
            lang: fence.lang || 'tsx',
            code: code.length > MAX_EXAMPLE_CHARS ? `${code.slice(0, MAX_EXAMPLE_CHARS)}\n// …(생략)` : code,
          });
        }
        fence = null;
      } else {
        fence.buf.push(line);
      }
      continue;
    }
    const open = line.match(/^\s*```(\w*)\s*$/);
    if (open) {
      fence = { lang: open[1], buf: [] };
      continue;
    }
    const h = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (h) heading = plain(h[1]);
    if (out.length >= MAX_EXAMPLES) break;
  }
  return out.slice(0, MAX_EXAMPLES);
}

interface IParsedDoc {
  title: string;
  summary: string;
  keywords: string[];
  searchText: string;
  importLine: string | null;
  examples: ICatalogExample[];
}

function parseDoc(text: string, withExamples: boolean): IParsedDoc {
  const { fm, body } = readFrontmatter(text);
  const h1 = body.match(/^#\s+(.+)$/m);
  return {
    title: (fm.title || (h1 ? h1[1] : '')).trim(),
    summary: firstParagraph(body),
    keywords: parseList(fm.tags),
    searchText: plain(body).slice(0, MAX_SEARCH_TEXT).toLowerCase(),
    importLine: findImportLine(body),
    examples: withExamples ? extractExamples(body) : [],
  };
}

// ── 스니펫 ────────────────────────────────────────────────────────────────────

/** 필수 prop 하나를 JSX 속성 문자열로. 타입만 보고 **결정론적으로** 만든다(값 추측 금지). */
/** prop 타입에서 유도한 입력 방식 — 사람이 값을 채우는 칸의 종류. */
export type TPropControl = 'text' | 'number' | 'checkbox' | 'select';

/** 삽입 전에 값을 받는 칸 하나(A4 후속 — 자리표시자 대신 실제 값). */
export interface IPropField {
  name: string;
  type: string;
  control: TPropControl;
  /** select일 때 고를 값들(리터럴 유니온). */
  options?: string[];
  /** 기본값 — 비워 두면 이 값이 그대로 들어간다(종전 자리표시자와 같다). */
  value: string;
  doc?: string;
}

/** 리터럴 유니온이면 값 목록(따옴표는 두 종류 다 — 실 인덱스에 `"a" | "b"` 형태가 있다). */
function literalOptions(type: string): string[] | null {
  if (!type.includes('|')) return null;
  const literals = type.match(/'[^']+'|"[^"]+"/g);
  if (!literals || literals.length === 0) return null;
  return literals.map((l) => l.replace(/['"]/g, ''));
}

/** 타입만 보고 정하는 입력 방식·기본값 — 프리뷰·삽입·폼이 **같은 규칙**을 쓰게 하는 진실원. */
export function propField(prop: ICatalogProp): IPropField {
  const type = prop.type.trim();
  const base = { name: prop.name, type, ...(prop.doc ? { doc: prop.doc } : {}) };
  const options = literalOptions(type);
  if (options) return { ...base, control: 'select', options, value: options[0] };
  if (type === 'boolean') return { ...base, control: 'checkbox', value: 'true' };
  if (type === 'number') return { ...base, control: 'number', value: '0' };
  if (type.includes('=>')) {
    const stem = prop.name.replace(/^on/, '');
    return { ...base, control: 'text', value: `handle${stem.charAt(0).toUpperCase()}${stem.slice(1)}` };
  }
  if (type === 'string') return { ...base, control: 'text', value: '값' };
  if (type.endsWith('[]')) return { ...base, control: 'text', value: '[]' };
  return { ...base, control: 'text', value: prop.name };
}

/**
 * 값 하나를 JSX 속성으로 옮긴다. **문자열은 따옴표, 나머지는 중괄호** — 사용자가 친 값을
 * 그대로 표현식으로 넣는다(따옴표 규칙을 사람이 외우지 않게).
 * 빈 값은 기본값으로 되돌린다 — 빈 칸이 `label=""` 같은 무의미한 코드가 되지 않게.
 */
export function formatPropAttr(prop: ICatalogProp, raw?: string): string {
  const field = propField(prop);
  const value = (raw ?? '').trim() || field.value;

  if (field.control === 'checkbox') {
    // 참이면 플래그(`searchable`), 거짓이면 명시적으로 `{false}`.
    return value === 'false' ? `${prop.name}={false}` : prop.name;
  }
  if (field.control === 'select' || field.type === 'string') return `${prop.name}="${value}"`;
  return `${prop.name}={${value}}`;
}

/** 이 부품을 넣기 전에 채울 칸들(루트 컴포넌트의 **필수 prop만**). 없으면 빈 배열. */
export function buildPropFields(entry: { name: string; members: ICatalogMember[] }): IPropField[] {
  const root = entry.members.find((m) => m.name === entry.name) ?? null;
  return (root?.props ?? []).filter((p) => p.required).map(propField);
}

/**
 * 선택 prop 칸들 — 기본으로는 안 보이고 사용자가 **골라서 추가**한다.
 *
 * 왜 필요한가(실측): 필수 칸만 뒀더니 `pageSize` 같은 흔한 선택 prop을 넣을 자리가 없어,
 * 사용자가 `columns` 칸에 `employeeColumns, pageSize = 20`을 몰아넣었고 그대로
 * `columns={employeeColumns, pageSize = 20}` 이라는 **깨진 코드**가 삽입됐다.
 * 칸이 없으면 사람은 있는 칸에 욱여넣는다 — 그건 사용자 실수가 아니라 폼의 실패다.
 */
export function optionalPropFields(entry: { name: string; members: ICatalogMember[] }): IPropField[] {
  const root = entry.members.find((m) => m.name === entry.name) ?? null;
  return (root?.props ?? []).filter((p) => !p.required).map(propField);
}

/**
 * 값이 "prop 하나의 값"으로 말이 되는지 본다. 문제면 사람 말 경고, 아니면 null.
 * **막지는 않는다** — 표현식은 얼마든지 복잡할 수 있어 완전한 판정은 불가능하고,
 * 틀린 경고로 막는 것보다 알려주고 사람이 정하는 편이 낫다(카드의 되묻기 원칙과 같다).
 */
export function checkPropValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // 괄호·중괄호·대괄호 밖의 쉼표/대입은 "여러 prop을 한 칸에 넣은" 신호다.
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) { depth++; continue; }
    if (')]}'.includes(c)) { depth--; continue; }
    if (depth > 0) continue;
    if (c === ',') return '쉼표가 있습니다 — 한 칸에는 prop 하나의 값만 넣고, 다른 prop은 아래 [+ prop 추가]로 넣어주세요.';
    if (c === '=' && value[i + 1] !== '>' && value[i + 1] !== '=' && value[i - 1] !== '=' && value[i - 1] !== '!'
      && value[i - 1] !== '<' && value[i - 1] !== '>') {
      return '등호(=)가 있습니다 — 값만 넣어주세요(예: `20`). prop 이름은 왼쪽 칸이 이미 말합니다.';
    }
  }
  return null;
}

/**
 * 최소 사용 스니펫 = import 한 줄 + **필수 prop만** 채운 JSX.
 * 필수가 없으면 태그만 — "일단 붙여넣고 시작"하는 용도이고, 진짜 예제는 문서 쪽이 준다.
 *
 * `values`(prop 이름 → 사용자가 입력한 값)를 주면 그 값으로 채운다. **패널의 미리보기와 실제 삽입이
 * 이 한 함수를 함께 쓴다** — 두 벌이면 "보이는 것 ≠ 넣는 것"이 되고, 그건 계획 카드가 지키려던
 * 안전 속성(사람 눈 검증)을 그대로 깨뜨린다(§3.6).
 */
export function buildSnippet(entry: {
  name: string;
  members: ICatalogMember[];
  importPath: string | null;
  importLine: string | null;
}, values: Record<string, string> = {}): string | null {
  const root = entry.members.find((m) => m.name === entry.name) ?? null;
  const tag = root?.name ?? entry.name.replace(/\s+/g, '');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(tag)) return null;

  const importLine = entry.importLine
    ?? (entry.importPath ? `import { ${tag} } from '${entry.importPath}';` : null);
  if (!importLine) return null;

  // ★ 루트가 없는 조합형 패밀리(Combobox·DropdownMenu…)는 **JSX를 만들지 않는다**.
  //   members[0]을 쓰면 `<ComboboxChip />` 같은 엉뚱한 조각이 대표 사용법인 척한다(실측).
  //   그런 부품은 여러 조각을 조립해야 하므로 진짜 사용법은 가이드 문서 쪽이 답이다.
  if (!root && entry.members.length > 0) return importLine;

  // 필수는 항상, 선택은 **값을 준 것만** — 사용자가 폼에서 추가한 prop이 그대로 반영된다.
  const attrs = (root?.props ?? [])
    .filter((p) => p.required || Object.prototype.hasOwnProperty.call(values, p.name))
    .map((p) => formatPropAttr(p, values[p.name]))
    .join(' ');
  return `${importLine}\n\n${attrs ? `<${tag} ${attrs} />` : `<${tag} />`}`;
}

// ── 카탈로그 조립 ─────────────────────────────────────────────────────────────

interface IDraft {
  id: string;
  name: string;
  origins: Set<TCatalogOrigin>;
  members: ICatalogMember[];
  importPath: string | null;
  importLine: string | null;
  guideDocId: string | null;
  knowledgeSource: string | null;
  summary: string;
  examples: ICatalogExample[];
  keywords: string[];
  searchText: string;
}

function draft(id: string, name: string): IDraft {
  return {
    id,
    name,
    origins: new Set<TCatalogOrigin>(),
    members: [],
    importPath: null,
    importLine: null,
    guideDocId: null,
    knowledgeSource: null,
    summary: '',
    examples: [],
    keywords: [],
    searchText: '',
  };
}

/**
 * 세 자료를 합쳐 카탈로그를 만든다. **합집합**이다 — props 인덱스에 없는 문서 전용 부품
 * (Alert·Tabs·Form…)을 빼면 "부품 목록"이 아니라 "prop 있는 것만의 목록"이 된다.
 */
export function buildCatalog(args: {
  index: Record<string, IPropsIndexEntry>;
  guideDocs?: IRawDoc[];
  knowledgeDocs?: IRawDoc[];
}): ICatalogEntry[] {
  const drafts = new Map<string, IDraft>();
  const get = (id: string, name: string): IDraft => {
    const found = drafts.get(id);
    if (found) return found;
    const d = draft(id, name);
    drafts.set(id, d);
    return d;
  };

  // ① props 인덱스 — 패밀리로 묶는다.
  for (const [family, members] of groupFamilies(Object.keys(args.index))) {
    const d = get(toKebab(family), family);
    d.origins.add('props');
    for (const name of members) {
      const e = args.index[name];
      d.members.push({
        name,
        import: e.import,
        source: e.source,
        props: e.props,
        domNote: e.domNote,
        truncated: e.truncated === true,
      });
      d.importPath = d.importPath ?? e.import;
    }
    // 루트(패밀리명과 같은 이름) 먼저, 나머지는 이름순 — 목록 순서가 매번 같아야 한다.
    d.members.sort((a, b) => (a.name === family ? -1 : b.name === family ? 1 : a.name.localeCompare(b.name)));
  }

  // ② 가이드 문서 — 파일명이 이미 kebab 패밀리 id 다(button-group-component → button-group).
  for (const doc of args.guideDocs ?? []) {
    const base = doc.id.split('/').pop() ?? doc.id;
    const id = base.replace(/-component$/, '');
    const parsed = parseDoc(doc.text, false);
    const d = get(id, parsed.title || base);
    d.origins.add('guide');
    d.guideDocId = doc.id;
    if (!d.summary) d.summary = parsed.summary;
    if (!d.importLine) d.importLine = parsed.importLine;
    if (!d.importPath && parsed.importLine) {
      const m = parsed.importLine.match(/from\s+'([^']+)'/);
      d.importPath = m ? m[1] : null;
    }
    if (!d.searchText) d.searchText = parsed.searchText;
    d.keywords.push(...parsed.keywords);
  }

  // ③ 지식 문서 — 코드 예제의 출처(오프라인 응답이 쓰던 그 문서).
  for (const doc of args.knowledgeDocs ?? []) {
    const base = (doc.id.split('/').pop() ?? doc.id).replace(/\.md$/i, '');
    const parsed = parseDoc(doc.text, true);
    const d = get(toKebab(base), base);
    d.origins.add('knowledge');
    d.knowledgeSource = doc.id;
    d.examples = parsed.examples;
    d.importLine = parsed.importLine ?? d.importLine;
    if (!d.summary) d.summary = parsed.summary;
    if (!d.searchText) d.searchText = parsed.searchText;
    d.keywords.push(...parsed.keywords);
  }

  const entries: ICatalogEntry[] = [];
  for (const d of drafts.values()) {
    entries.push({
      id: d.id,
      name: d.name,
      origins: (['props', 'guide', 'knowledge'] as TCatalogOrigin[]).filter((o) => d.origins.has(o)),
      members: d.members,
      propCount: d.members.reduce((n, m) => n + m.props.length, 0),
      requiredCount: d.members.reduce((n, m) => n + m.props.filter((p) => p.required).length, 0),
      importPath: d.importPath,
      importLine: d.importLine,
      guideDocId: d.guideDocId,
      knowledgeSource: d.knowledgeSource,
      summary: d.summary,
      examples: d.examples,
      snippet: buildSnippet({ name: d.name, members: d.members, importPath: d.importPath, importLine: d.importLine }),
      keywords: Array.from(new Set(d.keywords.map((k) => k.toLowerCase()))).slice(0, MAX_KEYWORDS),
      searchText: d.searchText,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

// ── 검색 ─────────────────────────────────────────────────────────────────────

/** 검색어를 토큰으로. 한글·영문 혼용을 그대로 받는다. */
export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
}

/** 토큰 하나가 이 항목의 어디에 걸리는지 — 가까운 자리일수록 높은 점수(0 = 안 걸림). */
function scoreToken(entry: ICatalogEntry, token: string): number {
  const name = entry.name.toLowerCase();
  if (name === token || entry.id === token) return 100;
  if (name.startsWith(token) || entry.id.startsWith(token)) return 60;
  if (name.includes(token) || entry.id.includes(token)) return 40;
  for (const m of entry.members) {
    if (m.name.toLowerCase().includes(token)) return 30;
  }
  for (const m of entry.members) {
    for (const p of m.props) {
      if (p.name.toLowerCase().includes(token)) return 22;
    }
  }
  // 한글은 띄어쓰기 경계가 없어 부분 일치가 쉽게 오염된다('표'가 '표시'에 걸린다).
  // 그래서 **태그 정확 일치**를 본문·요약 언급보다 확실히 위에 둔다(실 문서에서 잡은 오정렬).
  if (entry.keywords.some((k) => k === token)) return 26;
  if (entry.keywords.some((k) => k.startsWith(token))) return 20;
  if (entry.keywords.some((k) => k.includes(token))) return 18;
  if (entry.summary.toLowerCase().includes(token)) return 12;
  if (entry.searchText.includes(token)) return 8;
  return 0;
}

/**
 * 검색 — 토큰은 **전부** 걸려야 하고(AND), 점수는 합산한다.
 * 빈 질의는 전체 목록(기본 정렬 유지). 동점은 이름순으로 고정해 목록이 흔들리지 않게 한다.
 */
export function searchCatalog(entries: ICatalogEntry[], query: string): ICatalogEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return entries;

  const scored: { entry: ICatalogEntry; score: number }[] = [];
  for (const entry of entries) {
    let total = 0;
    let allHit = true;
    for (const t of tokens) {
      const s = scoreToken(entry, t);
      if (s === 0) {
        allHit = false;
        break;
      }
      total += s;
    }
    if (allHit) scored.push({ entry, score: total });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.map((s) => s.entry);
}
