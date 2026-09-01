/**
 * Mock 데이터 생성기 (계획서 §7 D2) — 타입 모양(`TypeShape`)에서 **fixture JSON**을 만든다.
 * `JsonTypeGenerator`(JSON → 타입)의 역방향이고, 모델 호출은 0이다.
 *
 * ## 왜 필요한가
 * 폐쇄망 SI에서 화면은 대개 **백엔드보다 먼저** 만든다. 타입은 이미 있는데(스펙 합의·퍼블리셔 산출물)
 * 데이터가 없어서, 개발자는 JSON을 손으로 찍는다. 그때 매번 같은 자리에서 틀린다:
 *   ① 필드 이름·중첩을 타입과 다르게 적는다 → 화면이 조용히 빈칸이 된다.
 *   ② **봉투(envelope)를 빠뜨린다** → `data?.data`가 `undefined`가 된다.
 *   ③ 20건을 만들려면 그냥 노가다다(그래서 3건만 만들고 스크롤·페이징을 못 본다).
 *
 * ## ★ 이 층이 지키는 계약 — 봉투
 * scaffold의 `useApi`는 **서버 응답 봉투를 벗기지 않는다**(`knowledge/patterns/use-api.md`).
 * 그래서 제네릭 `T`는 **응답 바디 모양 그대로**여야 한다. Mock을 만들면서 이걸 따로 적게 하면
 * 또 갈라진다 — 그래서 이 모듈은 **JSON과 `useApi<T>` 한 줄을 같은 값에서 함께 만든다**.
 * 보이는 JSON과 붙여넣는 제네릭이 구조적으로 어긋날 수 없다.
 *
 * ## 결정론
 * 같은 (타입, 옵션, 시드)면 **언제나 같은 JSON**이다. 값은 난수 생성기의 순서가 아니라
 * `시드 + 필드 경로 + 행 번호`의 해시에서 나온다 — 필드 순서가 바뀌어도 다른 필드 값이 흔들리지 않는다.
 * 다시 만들었을 때 git diff가 통째로 뒤집히면 아무도 다시 만들지 않는다.
 *
 * vscode·fs 비의존(순수 함수).
 */

import { detectEnvelopeKey } from '../ApiBindingRecipe';
import type { TShape } from './TypeShape';

export interface IMockOptions {
  /** 목록 건수(단건이면 1). */
  count: number;
  /** 값을 배열로 만들지. 타입 자체가 배열이면 꺼도 배열이 된다. */
  asList: boolean;
  /** 같은 시드 = 같은 결과. */
  seed: number;
  /** `?` 필드를 채울지. */
  includeOptional: boolean;
  /** 봉투 키(`data`). null이면 감싸지 않는다. */
  envelopeKey: string | null;
  /** 봉투에 곁다리(success·totalCount)를 넣을지. */
  envelopeMeta: boolean;
}

export const DEFAULT_MOCK_OPTIONS: IMockOptions = {
  count: 5,
  asList: true,
  seed: 1,
  includeOptional: true,
  envelopeKey: 'data',
  envelopeMeta: true,
};

export interface IMockResult {
  /** 만들어진 값(봉투 포함). */
  json: unknown;
  /** 그 값의 보기 좋은 JSON 문자열. */
  text: string;
  /** `useApi`에 넣을 제네릭 — **위 JSON과 같은 모양**이다. */
  generic: string;
  /** 붙여넣을 수 있는 `useApi` 사용 예(엔드포인트 포함). */
  snippet: string;
  /** 사람이 알아야 할 것. */
  notices: string[];
}

// ── 값 만들기 ────────────────────────────────────────────────────────────────

interface IGenCtx {
  seed: number;
  includeOptional: boolean;
  notices: string[];
  depth: number;
}

/** 중첩 배열 길이 — 위쪽 `count`와 달리 고정이다(중첩까지 늘리면 JSON이 금세 못 읽게 커진다). */
const NESTED_ARRAY_LENGTH = 2;
const MAX_DEPTH = 10;

/**
 * 모양에서 값을 만든다.
 * `path`는 값의 자리(`employees[].name`)이고, `row`는 몇 번째 행인지다 — 이 둘이 값을 정한다.
 */
export function valueOfShape(shape: TShape, path: string, row: number, ctx: IGenCtx): unknown {
  if (ctx.depth > MAX_DEPTH) return null;
  switch (shape.kind) {
    case 'string':
      return sampleString(lastSegment(path), path, row, ctx.seed);
    case 'number':
      return sampleNumber(lastSegment(path), path, row, ctx.seed);
    case 'boolean':
      return hash(`${ctx.seed}|${path}|${row}`) % 4 !== 0; // 대체로 true — 목록이 자연스럽게 보인다
    case 'date':
      return sampleDateTime(row);
    case 'null':
      return null;
    case 'literal':
      return shape.value;
    case 'union':
      return valueOfUnion(shape.options, path, row, ctx);
    case 'array': {
      const out: unknown[] = [];
      for (let i = 0; i < NESTED_ARRAY_LENGTH; i++) {
        out.push(valueOfShape(shape.item, `${path}[]`, i, { ...ctx, depth: ctx.depth + 1 }));
      }
      return out;
    }
    case 'record': {
      const out: Record<string, unknown> = {};
      for (let i = 1; i <= 2; i++) {
        out[`sample${i}`] = valueOfShape(shape.value, `${path}.sample${i}`, row, { ...ctx, depth: ctx.depth + 1 });
      }
      return out;
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const field of shape.fields) {
        if (field.optional && !ctx.includeOptional) continue;
        out[field.name] = valueOfShape(
          field.shape,
          path ? `${path}.${field.name}` : field.name,
          row,
          { ...ctx, depth: ctx.depth + 1 },
        );
      }
      if (shape.index) {
        out.sampleKey = valueOfShape(shape.index, `${path}.sampleKey`, row, { ...ctx, depth: ctx.depth + 1 });
      }
      return out;
    }
    case 'unknown':
      ctx.notices.push(`\`${path || '값'}\`은 ${shape.reason}이라 \`null\`로 뒀습니다 — 직접 채우세요.`);
      return null;
  }
}

/**
 * 유니온에서 하나를 고른다.
 * ★ **리터럴 유니온은 행마다 돌아가며 고른다** — `'대기' | '승인' | '반려'` 인데 20건이 전부 '대기'면
 * 상태별 뱃지·필터를 확인할 수 없다. 목록 mock의 값어치는 대부분 여기서 나온다.
 */
function valueOfUnion(options: TShape[], path: string, row: number, ctx: IGenCtx): unknown {
  const usable = options.filter((o) => o.kind !== 'null');
  if (usable.length === 0) return null;
  if (usable.every((o) => o.kind === 'literal')) {
    const picked = usable[Math.abs(row) % usable.length];
    return picked.kind === 'literal' ? picked.value : null;
  }
  return valueOfShape(usable[0], path, row, ctx);
}

// ── 필드 이름으로 그럴듯한 값 고르기 ─────────────────────────────────────────

/** 사람이 보는 값이라 한국어 표본을 쓴다. 값은 **일부러 가짜처럼** 보이게 둔다(진짜로 오해하면 안 된다). */
const NAMES = ['김민준', '이서연', '박도윤', '최지우', '정하준', '강서준', '조유나', '윤지호', '임하은', '한예준'];
const DEPARTMENTS = ['개발팀', '기획팀', '디자인팀', '영업팀', '인사팀', '재무팀'];
const POSITIONS = ['사원', '대리', '과장', '차장', '부장'];
const ADDRESSES = [
  '서울특별시 중구 세종대로 110',
  '경기도 성남시 분당구 판교로 235',
  '부산광역시 해운대구 센텀중앙로 90',
];
const TITLES = ['샘플 공지사항', '월간 실적 보고', '신규 계정 개설 요청', '정기 점검 안내', '테스트 게시글'];
const SENTENCES = [
  '샘플 설명 텍스트입니다. 실제 데이터가 아닙니다.',
  '표시 확인용 임시 문구입니다.',
  '레이아웃 확인을 위해 조금 더 긴 문장을 넣은 샘플 데이터입니다.',
];

/** 문자열 필드 규칙 — 위에서부터 처음 걸리는 것을 쓴다. 테스트가 이 표를 그대로 돈다. */
export const STRING_RULES: Array<{ id: string; test: RegExp; make: (row: number, key: string, name: string) => string }> = [
  { id: 'id', test: /(^|_)(id|no|seq)$|Id$|No$|Seq$|번호|아이디/i, make: (row, _k, name) => idLike(name, row) },
  { id: 'yn', test: /(yn|여부)$/i, make: (row) => (row % 3 === 2 ? 'N' : 'Y') },
  { id: 'email', test: /mail/i, make: (row) => `sample${row + 1}@example.com` },
  { id: 'phone', test: /(phone|tel|mobile|^hp$|연락처|휴대폰|전화)/i, make: (row) => `010-0000-${pad(row + 1, 4)}` },
  { id: 'url', test: /(url|link|href|homepage|주소창)/i, make: (row) => `https://example.com/sample/${row + 1}` },
  { id: 'image', test: /(image|img|thumb|photo|icon|사진|이미지)/i, make: (row) => `/images/sample-${row + 1}.png` },
  { id: 'datetime', test: /(datetime|일시|timestamp)|(At|Time)$/i, make: (row) => sampleDateTime(row) },
  { id: 'date', test: /(date|일자|날짜|ymd|dt$)/i, make: (row) => sampleDate(row) },
  { id: 'name', test: /(name|nm$|이름|성명|담당자|작성자|등록자|고객|회원|customer)/i, make: (row, key) => pick(NAMES, key, row) },
  { id: 'dept', test: /(dept|depart|부서|조직|team|팀)/i, make: (row, key) => pick(DEPARTMENTS, key, row) },
  { id: 'position', test: /(position|grade|rank|직급|직위)/i, make: (row, key) => pick(POSITIONS, key, row) },
  { id: 'address', test: /(addr|address|주소|소재지)/i, make: (row, key) => pick(ADDRESSES, key, row) },
  { id: 'title', test: /(title|subject|제목|건명)/i, make: (row, key) => pick(TITLES, key, row) },
  { id: 'text', test: /(desc|memo|content|note|remark|비고|설명|내용|사유)/i, make: (row, key) => pick(SENTENCES, key, row) },
  { id: 'code', test: /(code|^cd$|코드|구분)/i, make: (row) => `CD-${pad(row + 1, 2)}` },
];

/** 숫자 필드 규칙 — 자리가 다르면 자릿수도 달라야 표가 진짜처럼 보인다. */
export const NUMBER_RULES: Array<{ id: string; test: RegExp; make: (row: number, key: string) => number }> = [
  { id: 'id', test: /(^|_)(id|no|seq)$|Id$|No$|Seq$|번호/i, make: (row) => row + 1 },
  { id: 'money', test: /(price|amount|금액|cost|fee|salary|급여|pay|합계)/i, make: (row, key) => between(key, row, 10, 9900) * 100 },
  { id: 'rate', test: /(rate|율|percent|비율|ratio|score|점수)/i, make: (row, key) => between(key, row, 0, 100) },
  { id: 'age', test: /(age|나이|연령)/i, make: (row, key) => between(key, row, 20, 64) },
  { id: 'year', test: /(year|연도|년도)/i, make: (row, key) => between(key, row, 2024, 2026) },
  { id: 'count', test: /(count|cnt|qty|수량|개수|건수|총)/i, make: (row, key) => between(key, row, 1, 999) },
];

function sampleString(fieldName: string, path: string, row: number, seed: number): string {
  const key = `${seed}|${path}`;
  for (const rule of STRING_RULES) {
    if (rule.test.test(fieldName)) return rule.make(row, key, fieldName);
  }
  return `${fieldName || '샘플'} 샘플 ${row + 1}`;
}

function sampleNumber(fieldName: string, path: string, row: number, seed: number): number {
  const key = `${seed}|${path}`;
  for (const rule of NUMBER_RULES) {
    if (rule.test.test(fieldName)) return rule.make(row, key);
  }
  return between(key, row, 1, 999);
}

/** `empNo` → `EMP-0001`, 접두사를 못 뽑으면 `ID-0001`. */
function idLike(fieldName: string, row: number): string {
  const base = fieldName.replace(/(id|no|seq|번호|아이디)$/i, '').replace(/[^A-Za-z0-9]/g, '');
  return `${(base || 'ID').toUpperCase()}-${pad(row + 1, 4)}`;
}

/** 기준일 2026-01-01에서 하루씩. 값이 뻔해야 "가짜 데이터"임이 한눈에 보인다. */
function sampleDate(row: number): string {
  const base = Date.UTC(2026, 0, 1);
  return new Date(base + row * 86400000).toISOString().slice(0, 10);
}

function sampleDateTime(row: number): string {
  const base = Date.UTC(2026, 0, 1, 9, 0, 0);
  return `${new Date(base + row * 86400000 + row * 1800000).toISOString().slice(0, 19)}`;
}

function pick<T>(pool: T[], key: string, row: number): T {
  return pool[(hash(key) + row) % pool.length];
}

function between(key: string, row: number, min: number, max: number): number {
  return min + (hash(`${key}|${row}`) % (max - min + 1));
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** FNV-1a — 짧고 결정론적이면 충분하다(암호용이 아니다). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h | 0);
}

function lastSegment(path: string): string {
  const cleaned = path.replace(/\[\]$/, '');
  const at = cleaned.lastIndexOf('.');
  return at >= 0 ? cleaned.slice(at + 1) : cleaned;
}

// ── 이 타입이 데이터인가 ─────────────────────────────────────────────────────

/** `data` = 그대로 fixture가 된다 · `partial` = 일부는 직접 채워야 한다 · `ui` = 데이터가 아니다. */
export type TMockability = 'data' | 'partial' | 'ui';

/**
 * 이 타입으로 mock을 만들 수 있는지 가른다.
 *
 * ★ **실 scaffold가 가르쳐 준 것**: 프로젝트의 타입 262개 중 대부분은 데이터가 아니라
 * **화면 부품의 prop 타입**(`onClick`·`children: React.ReactNode`)이다. 목록에 전부 늘어놓으면
 * 정작 쓸 타입이 묻힌다 — 그래서 등급을 매겨 기본 목록은 데이터 타입만 보여 준다.
 * 숨기지는 않는다(전부 보기로 볼 수 있다) — 판단은 사람이 한다.
 */
export function mockability(shape: TShape, issues: string[]): { level: TMockability; reason: string } {
  const target = shape.kind === 'array' ? shape.item : shape;
  if (target.kind === 'unknown') return { level: 'ui', reason: target.reason };
  if (target.kind !== 'object') {
    return { level: 'partial', reason: '객체가 아니라 값 하나입니다(파일보다 스니펫에 가깝습니다).' };
  }
  if (target.fields.length === 0) {
    return { level: 'ui', reason: '값 필드가 없습니다 — 함수·화면 요소만 있는 타입입니다.' };
  }
  const unknowns = target.fields.filter((f) => f.shape.kind === 'unknown').length;
  if (unknowns / target.fields.length > 0.5) {
    return { level: 'ui', reason: '필드 절반 이상이 데이터가 아닙니다(화면 요소·함수).' };
  }
  if (unknowns > 0) return { level: 'partial', reason: `필드 ${unknowns}개는 직접 채워야 합니다.` };
  if (issues.some((i) => i.includes('제네릭 자리'))) {
    return { level: 'partial', reason: '제네릭 자리가 비어 있습니다.' };
  }
  if (issues.some((i) => i.includes('함수'))) {
    return { level: 'partial', reason: '함수 멤버는 빼고 만들었습니다.' };
  }
  return { level: 'data', reason: '전 필드를 만들 수 있습니다.' };
}

// ── 봉투 · 제네릭 · 스니펫 ───────────────────────────────────────────────────

/** 봉투로 쓸 만한 키(온라인 경로의 `detectEnvelopeKey`와 같은 어휘). */
export const ENVELOPE_KEY_CHOICES = ['data', 'list', 'items', 'result', 'content'];

/**
 * 이 타입이 **이미 봉투 모양인지** 본다(그렇다면 또 감싸면 안 된다 — `data.data.data`가 된다).
 * 판정은 온라인에서 쓰는 `detectEnvelopeKey`를 **그대로** 쓴다: 모양에서 뼈대 객체를 만들어 물어본다.
 */
export function alreadyEnvelope(shape: TShape): string | null {
  if (shape.kind !== 'object') return null;
  const probe: Record<string, unknown> = {};
  for (const f of shape.fields) {
    probe[f.name] = f.shape.kind === 'array' ? [] : f.shape.kind === 'object' ? {} : 'x';
  }
  return detectEnvelopeKey(probe);
}

/** `TEmployee` → `employee`, `IUserProfile` → `user-profile`. mock 파일 이름에 쓴다. */
export function mockFileName(typeName: string): string {
  const base = /^[TI][A-Z]/.test(typeName) ? typeName.slice(1) : typeName;
  const words = base.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [base];
  return words.map((w) => w.toLowerCase()).join('-') || 'mock';
}

/**
 * mock 파일이 놓일 자리. `public/`은 Vite가 `/`로 그대로 서빙하므로
 * **백엔드 없이도 `useApi('/mock/employee.json')`이 실제로 응답한다** — 그게 이 기능의 목적이다.
 */
export function mockFilePath(typeName: string): string {
  return `public/mock/${mockFileName(typeName)}.json`;
}

/** `public/mock/employee.json` → `/mock/employee.json` (브라우저가 부르는 주소). */
export function mockEndpoint(filePath: string): string {
  return `/${filePath.replace(/^public\//, '')}`;
}

/** JSON 모양과 **정확히 같은** `useApi` 제네릭을 만든다. */
export function buildGeneric(typeName: string, shape: TShape, options: IMockOptions): string {
  const base = options.asList || shape.kind === 'array' ? `${typeName}[]` : typeName;
  const inner = shape.kind === 'array' ? typeName : base;
  if (!options.envelopeKey) return inner;
  const fields = [
    options.envelopeMeta ? 'success: boolean' : null,
    `${options.envelopeKey}: ${inner}`,
    options.envelopeMeta ? 'totalCount: number' : null,
  ].filter(Boolean);
  return `{ ${fields.join('; ')} }`;
}

/** 붙여넣어 바로 도는 `useApi` 사용 예. 목록 꺼내는 줄까지 같이 준다(봉투를 벗기는 자리가 여기다). */
export function buildSnippet(typeName: string, shape: TShape, options: IMockOptions, endpoint: string): string {
  const generic = buildGeneric(typeName, shape, options);
  const isList = options.asList || shape.kind === 'array';
  const unwrap = options.envelopeKey
    ? `data?.${options.envelopeKey} ?? ${isList ? '[]' : 'null'}`
    : `data ?? ${isList ? '[]' : 'null'}`;
  return [
    `const { data, isLoading } = useApi<${generic}>('${endpoint}');`,
    `const ${isList ? 'rows' : 'item'} = ${unwrap};`,
  ].join('\n');
}

/**
 * 타입 모양 하나로 mock JSON + `useApi` 한 줄을 **함께** 만든다.
 * 둘이 같은 곳에서 나오므로 "보이는 JSON"과 "붙여넣는 제네릭"이 어긋날 수 없다.
 */
export function generateMock(shape: TShape, typeName: string, options: IMockOptions): IMockResult {
  const ctx: IGenCtx = { seed: options.seed, includeOptional: options.includeOptional, notices: [], depth: 0 };
  const count = Math.max(1, Math.min(500, Math.floor(options.count) || 1));

  let payload: unknown;
  if (shape.kind === 'array') {
    payload = range(count).map((i) => valueOfShape(shape.item, `${typeName}[]`, i, ctx));
  } else if (options.asList) {
    payload = range(count).map((i) => valueOfShape(shape, `${typeName}[]`, i, ctx));
  } else {
    payload = valueOfShape(shape, typeName, 0, ctx);
  }

  let json: unknown = payload;
  if (options.envelopeKey) {
    const wrapped: Record<string, unknown> = {};
    if (options.envelopeMeta) wrapped.success = true;
    wrapped[options.envelopeKey] = payload;
    if (options.envelopeMeta) wrapped.totalCount = Array.isArray(payload) ? payload.length : 1;
    json = wrapped;
  }

  const notices = [...new Set(ctx.notices)];
  const owned = alreadyEnvelope(shape);
  if (owned && options.envelopeKey) {
    notices.unshift(
      `이 타입은 이미 봉투 모양입니다(\`${owned}\` 키). 또 감싸면 \`${options.envelopeKey}.${owned}\`가 되니 봉투를 끄는 편이 맞습니다.`,
    );
  }
  if (!options.includeOptional) {
    notices.push('선택 필드(`?`)는 뺐습니다 — 화면이 `undefined`를 견디는지 보려면 이 상태가 낫습니다.');
  }

  const endpoint = mockEndpoint(mockFilePath(typeName));
  return {
    json,
    text: JSON.stringify(json, null, 2),
    generic: buildGeneric(typeName, shape, options),
    snippet: buildSnippet(typeName, shape, options, endpoint),
    notices,
  };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_v, i) => i);
}
