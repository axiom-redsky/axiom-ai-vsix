/**
 * API → 기존 테이블 바인딩 레시피 — Stage 1: 결정론 스키마 추출·대조 (순수 함수, vscode/디스크 비의존).
 *
 * 배경(설계 합의): "직원 테이블에 /api/employees 적용" 같은 요청은 한 편집이 아니라 다부품 레시피다
 * (import + type + useApi + 파생 const + 로딩/에러 가드 + 테이블 셀 재바인딩). 지금 파이프라인은 이 조율을
 * 약한 모델에 통째로 떠넘겨 실패한다(실측: useApi만 넣고 테이블은 존재하지 않는 더미 필드를 계속 참조).
 *
 * Claude Code 방식을 작은 모델·토큰 제약에 맞춘 처방: **분해·대조의 똑똑함을 모델 토큰이 아니라 결정론
 * 코드로 산다.** 이 모듈은 그 토대 — 모델 0토큰으로:
 *   ① extractTableColumns  : 현재 파일의 테이블에서 (헤더 라벨 ↔ 참조 필드)를 추출
 *   ② extractResponseSchema: 스펙 섹션의 Response JSON 예시에서 (봉투 구조 + 행 필드)를 추출
 *   ③ reconcile            : 테이블 필드 ↔ API 필드를 대조 → 매핑 / 미매핑 / 미사용 API필드
 *
 * reconcile 결과가 이후 단계의 입력이다: 매핑은 결정론 재바인딩에, 미매핑(API에 아예 없음=project/rate)은
 * "추측 금지·되묻기"에, 미사용 API필드가 남는 애매한 컬럼(grade↔position 등)만 **작은 모델 1콜**(필드목록
 * 수준, 파일 아님)로 넘긴다. 즉 대부분 결정론, 모델은 안 줄어드는 의미 판단 한 조각만.
 *
 * Stage 2(조립): buildBindingCode(type+useApi<봉투벗김>+파생const+로딩/에러 가드) + rewriteMappedFields
 * (매핑대로 `item.old`→`item.new` 결정론 재바인딩). useApi는 `response.data`를 반환(봉투 벗김)하므로
 * 제네릭은 **행 배열 타입**(`useApi<TEmployee[]>`)이고 컴포넌트는 `const items = data ?? []`로 쓴다.
 */
import { generateTypeFromJson } from './JsonTypeGenerator';
import { splitIntoSections, containsExactApiPath } from './SectionExtractor';
import { splitTsSections } from './CodeSectionExtractor';
import type { ImportRequest } from './StructuralAnchor';

/** 테이블 한 컬럼 — 헤더 라벨과 그 셀이 읽는 행 필드(없으면 null: 액션 버튼 등). */
export interface ITableColumn {
  /** 0-based 컬럼 순서. */
  index: number;
  /** `<th>` 텍스트(예: "부서"). 헤더가 셀보다 적으면 ''. */
  headerLabel: string;
  /** 셀이 읽는 행 필드명(예: "dept"). 셀에 `item.X`가 없으면 null. */
  field: string | null;
}

/** 스펙 Response JSON에서 뽑은 스키마. */
export interface IResponseSchema {
  /** 행(레코드) 객체의 필드명 목록(예: ["id","name","email","department",…]). */
  rowFields: string[];
  /** 행 객체 JSON 원본(generateTypeFromJson에 그대로 넘겨 타입 생성). */
  rowJson: Record<string, unknown> | null;
  /**
   * 목록이 감싸인 봉투 키. `{ data: [...], meta }`면 "data", `{ result: [...] }`면 "result" — SI 사이트마다
   * 다르며 detectEnvelopeKey가 감지한다. 최상위가 바로 배열이면 null.
   * useApi 제네릭(`useApi<{ [key]: T[] }>`)·파생 const(`data?.[key] ?? []`) 생성에 쓴다.
   */
  envelopeKey: string | null;
}

/** 한 컬럼과 매핑된 API 필드. */
export interface IColumnMapping {
  column: ITableColumn;
  apiField: string;
  /** 'exact' = 필드명 동일 · 'fuzzy' = 정규화 후 포함관계(dept⊂department 등). */
  how: 'exact' | 'fuzzy';
}

/** 대조 결과. */
export interface IReconciliation {
  /** 결정론으로 확정된 매핑(재바인딩에 바로 사용). */
  mapping: IColumnMapping[];
  /** 필드를 참조하지만 API에 대응이 없는 컬럼(예: project·rate → 이 엔드포인트에 없음 = 언더스펙). */
  unmappedColumns: ITableColumn[];
  /** 어느 컬럼에도 매핑되지 않고 남은 API 필드(애매 컬럼을 작은 모델콜로 맞출 후보 풀). */
  unusedApiFields: string[];
}

// ── ① 테이블 컬럼 추출 ────────────────────────────────────────────────────────

/**
 * 소스에서 `.map((item) => ( … <tr> … ))` 행 템플릿을 찾아 (헤더 라벨 ↔ 셀 참조 필드)를 추출한다.
 * 테이블(`<tbody>`의 첫 `<tr>`)이 없으면 빈 배열.
 */
export function extractTableColumns(source: string): ITableColumn[] {
  const mapVar = findRowMapVar(source);
  if (!mapVar) return [];

  const headers = extractHeaderLabels(source);
  const rowCells = extractRowCells(source, mapVar);
  if (rowCells.length === 0) return [];

  return rowCells.map((cell, index) => ({
    index,
    headerLabel: headers[index] ?? '',
    field: firstItemField(cell, mapVar),
  }));
}

/**
 * 스펙 전문에서 **해당 엔드포인트의 목록(GET) 응답** 스키마를 고른다. 같은 경로에 POST/GET가 함께 있으면
 * (예: POST /api/employees 등록 · GET /api/employees 목록) 배열을 반환하는 GET 섹션을 우선한다.
 */
export function pickResponseSchema(specText: string, apiPath: string): IResponseSchema | null {
  const sections = splitIntoSections('spec', specText);
  const matching = sections.filter((s) => containsExactApiPath(s.header, apiPath));
  const ordered = [
    ...matching.filter((s) => /\bGET\b/i.test(s.header)),
    ...matching.filter((s) => !/\bGET\b/i.test(s.header)),
  ];
  for (const s of ordered) {
    const schema = extractResponseSchema(s.body);
    if (schema) return schema;
  }
  return extractResponseSchema(specText);
}

/** `<tbody>` 안 `X.map((item) =>` 의 item(행) 변수명을 찾는다(첫 매치). 조립 시 셀 재바인딩 스코프. */
export function findRowMapVar(source: string): string | null {
  const tbodyStart = source.search(/<tbody\b/);
  const scope = tbodyStart >= 0 ? source.slice(tbodyStart) : source;
  // {rows.map((emp) => ( …   ·   {rows.map((emp, i) => { …
  const m = scope.match(/\.map\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)?\s*=>/);
  return m ? m[1] : null;
}

/** `<thead>` 내 `<th>` 텍스트를 순서대로. 없으면 빈 배열. */
function extractHeaderLabels(source: string): string[] {
  const thead = matchTagBlock(source, 'thead');
  if (!thead) return [];
  const out: string[] = [];
  const re = /<th\b[^>]*>([\s\S]*?)<\/th>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(thead)) !== null) {
    out.push(m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
  }
  return out;
}

/**
 * `<tbody>`의 **첫 `<tr>`** 안 최상위 `<td>` 셀들의 내부 텍스트를 순서대로 반환한다.
 * 중첩 `<td>`는 없지만 셀 안에 `<div>` 등이 있으므로 태그 깊이로 최상위 td만 자른다.
 */
function extractRowCells(source: string, _mapVar: string): string[] {
  const tbody = matchTagBlock(source, 'tbody');
  if (!tbody) return [];
  const tr = matchTagBlock(tbody, 'tr');
  if (!tr) return [];
  return sliceTopLevelTags(tr, 'td');
}

/** 셀 텍스트에서 `item.field` 형태로 **처음 참조되는** 필드명. 없으면 null(액션 버튼 등). */
function firstItemField(cellText: string, mapVar: string): string | null {
  const re = new RegExp(`\\b${escapeRe(mapVar)}\\.([A-Za-z_$][\\w$]*)`);
  const m = cellText.match(re);
  return m ? m[1] : null;
}

// ── ② 스펙 Response 스키마 추출 ───────────────────────────────────────────────

/**
 * 스펙 섹션 텍스트(예: `### GET /api/employees` 섹션)에서 **Response** JSON 예시를 파싱해 스키마를 뽑는다.
 * 여러 ```json 블록이 있으면 "Response" 표기 뒤의 것을 우선(요청 본문 JSON과 혼동 방지).
 */
export function extractResponseSchema(specText: string): IResponseSchema | null {
  const json = parseResponseJson(specText);
  if (json === null || typeof json !== 'object') return null;

  // 봉투 해체: SI 사이트마다 목록을 감싸는 키가 다르다(data / list / result / items …). 특정 키를 하드코딩하지
  // 않고 detectEnvelopeKey로 "행 목록/단건을 담은 봉투 키"를 안전하게 감지해 벗긴다(단건 행의 우연한 배열
  // 필드를 봉투로 오인하지 않도록 보수적으로 판정).
  let rowContainer: unknown = json;
  let envelopeKey: string | null = null;
  if (!Array.isArray(json)) {
    const key = detectEnvelopeKey(json as Record<string, unknown>);
    if (key !== null) {
      rowContainer = (json as Record<string, unknown>)[key];
      envelopeKey = key;
    }
  }

  const rowJson = Array.isArray(rowContainer) ? rowContainer[0] : rowContainer;
  if (!rowJson || typeof rowJson !== 'object' || Array.isArray(rowJson)) return null;

  return {
    rowFields: Object.keys(rowJson as Record<string, unknown>),
    rowJson: rowJson as Record<string, unknown>,
    envelopeKey,
  };
}

/** 알려진 봉투(목록 래퍼) 키 — 우선순위 순. SI 관례상 목록/페이로드를 감싸는 흔한 이름들. */
const ENVELOPE_KEYS = ['data', 'list', 'items', 'result', 'results', 'rows', 'records', 'content', 'payload'];

/** 봉투 곁다리(메타/페이징) 키 — 형제가 전부 이 키뿐이면 이름 모르는 배열 키도 봉투로 인정한다(소문자 비교). */
const ENVELOPE_META_KEYS = new Set([
  'success', 'code', 'message', 'msg', 'meta', 'error', 'errors', 'status', 'statuscode',
  'timestamp', 'time', 'total', 'totalcount', 'totalelements', 'totalpages', 'count',
  'page', 'pageno', 'pagenumber', 'pagesize', 'size', 'number', 'offset', 'limit',
  'pagination', 'hasnext', 'hasprevious', 'first', 'last', 'empty', 'sort',
]);

/**
 * 응답 최상위 객체에서 **행 목록/단건을 담은 봉투 키**를 안전하게 고른다. 없으면 null(최상위가 곧 행 객체).
 * 전략(오탐 방지 우선):
 *   1) 알려진 봉투 키(data/list/result/…) 중 **배열**을 담은 첫 키 → 목록 엔드포인트(compose의 주 대상).
 *   2) 없으면 알려진 봉투 키 중 **객체**를 담은 첫 키 → 단건 봉투(`{ data: {...} }`).
 *   3) 그래도 없고 **형제가 전부 메타 키뿐**인데 배열 키가 정확히 하나면 그 키(이름 몰라도) → 봉투.
 * ⚠️ 단건 행이 우연히 배열 필드를 가진 경우(`{ id, name, skills:[…] }`)를 봉투로 오인하지 않도록,
 * 3)은 형제가 전부 메타일 때만 발동한다(id·name 같은 행 필드가 섞여 있으면 발동 안 하고 null).
 */
export function detectEnvelopeKey(obj: Record<string, unknown>): string | null {
  const isObj = (v: unknown): boolean => v !== null && typeof v === 'object' && !Array.isArray(v);
  const arrKnown = ENVELOPE_KEYS.find((k) => k in obj && Array.isArray(obj[k]));
  if (arrKnown) return arrKnown;
  const objKnown = ENVELOPE_KEYS.find((k) => k in obj && isObj(obj[k]));
  if (objKnown) return objKnown;
  const arrayKeys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));
  if (arrayKeys.length === 1) {
    const siblings = Object.keys(obj).filter((k) => k !== arrayKeys[0]);
    if (siblings.length > 0 && siblings.every((k) => ENVELOPE_META_KEYS.has(k.toLowerCase()))) {
      return arrayKeys[0];
    }
  }
  return null;
}

/** "Response" 라벨 뒤의 첫 ```json 블록을 파싱. 없으면 아무 ```json 블록. 파싱 실패 시 null. */
function parseResponseJson(specText: string): unknown {
  const blocks: Array<{ at: number; body: string }> = [];
  const re = /```json\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(specText)) !== null) blocks.push({ at: m.index, body: m[1] });
  if (blocks.length === 0) return null;

  const respIdx = specText.search(/\*\*?Response\*?\*?|^#+.*response/im);
  const ordered =
    respIdx >= 0
      ? [...blocks].sort((a, b) => rank(a.at, respIdx) - rank(b.at, respIdx))
      : blocks;

  for (const b of ordered) {
    const parsed = tryParseLooseJson(b.body);
    if (parsed !== undefined) return parsed;
  }
  return null;
}

/** Response 라벨 이후 블록을 앞순위로: 이후면 거리, 이전이면 큰 페널티. */
function rank(at: number, respIdx: number): number {
  return at >= respIdx ? at - respIdx : 1e9 + (respIdx - at);
}

/** 스펙 JSON 예시는 `...`·주석 꼬리가 붙기도 한다. 관대하게 파싱(실패 시 undefined). */
function tryParseLooseJson(body: string): unknown {
  const cleaned = body
    .replace(/\/\/[^\n]*/g, '') // 라인 주석
    .replace(/,\s*\.\.\.\s*/g, ' ') // { …, ... }
    .replace(/"\s*\.\.\.\s*"/g, '""')
    .replace(/,(\s*[}\]])/g, '$1'); // 트레일링 콤마
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

// ── ③ 대조 ────────────────────────────────────────────────────────────────────

/**
 * 테이블 컬럼(참조 필드 있는 것)을 API 응답 필드에 대조한다.
 * - exact: 필드명이 동일(정규화 후).
 * - fuzzy: 정규화 후 한쪽이 다른 쪽을 **포함**(dept⊂department, status⊂employment_status).
 * 필드 없는 컬럼(액션 등)은 무시. 매핑 안 된 참조 컬럼 = unmappedColumns(언더스펙 후보).
 */
export function reconcile(columns: ITableColumn[], schema: IResponseSchema): IReconciliation {
  const apiFields = schema.rowFields;
  const usedApi = new Set<string>();
  const mapping: IColumnMapping[] = [];
  const unmappedColumns: ITableColumn[] = [];

  for (const col of columns) {
    if (!col.field) continue; // 참조 없는 컬럼(액션 등) — 대상 아님
    const exact = apiFields.find((f) => !usedApi.has(f) && norm(f) === norm(col.field!));
    if (exact) {
      usedApi.add(exact);
      mapping.push({ column: col, apiField: exact, how: 'exact' });
      continue;
    }
    const fuzzy = apiFields.find((f) => !usedApi.has(f) && containsNorm(f, col.field!));
    if (fuzzy) {
      usedApi.add(fuzzy);
      mapping.push({ column: col, apiField: fuzzy, how: 'fuzzy' });
      continue;
    }
    unmappedColumns.push(col);
  }

  return {
    mapping,
    unmappedColumns,
    unusedApiFields: apiFields.filter((f) => !usedApi.has(f)),
  };
}

// ── Stage 2: 결정론 조립 ──────────────────────────────────────────────────────

/** 완성된 컬럼→API필드 매핑(결정론 + 모델콜 결과 합침). */
export interface IFieldRename {
  /** 테이블이 쓰던 필드(예: "dept"). */
  from: string;
  /** API 응답 필드(예: "department"). */
  to: string;
}

/** buildBindingCode 입력. */
export interface IBindingCodeInput {
  schema: IResponseSchema;
  /** API 엔드포인트(예: "/api/employees"). */
  endpoint: string;
  /** 타입 베이스 이름(접두사 제외, 예: "Employee"). deriveRootName로 뽑을 수 있다. */
  rootName: string;
  /** 목록 파생 const 이름 — 기존 더미 배열과 **같은 이름**이라야 structural이 더미를 자동 제거한다. */
  collectionVar: string;
}

/** buildBindingCode 결과 — structural 삽입 채널(hookCode/imports)에 그대로 넣는다. */
export interface IBindingCode {
  /** 모듈 스코프 type + 컴포넌트 본문 훅/파생/가드(structural이 type만 상단 hoist). */
  hookCode: string;
  imports: ImportRequest[];
  /** 생성된 타입명(예: "TEmployee"). */
  typeName: string;
}

/**
 * 스키마로 바인딩 코드를 **결정론 생성**한다(모델 0토큰). type은 generateTypeFromJson,
 * 훅은 `const { data, isPending, error } = useApi<TX[]>(endpoint)` + `const items = data ?? []`
 * + 로딩/에러 조기반환 가드. type/interface는 structural이 모듈 스코프로 hoist하고, 나머지는 컴포넌트
 * 본문에 삽입되며, `collectionVar`가 기존 더미와 같은 이름이라 더미 선언은 자동 제거된다.
 */
export function buildBindingCode(input: IBindingCodeInput): IBindingCode {
  const { schema, endpoint, rootName, collectionVar } = input;
  const typeCode = generateTypeFromJson({
    json: schema.rowJson,
    rootName,
    kind: 'type',
    source: 'chat',
  });
  const typeName = (typeCode.match(/\b(?:type|interface)\s+([A-Za-z_$][\w$]*)/) ?? [])[1] ?? `T${rootName}`;

  // ⚠️ scaffold의 useApi는 HTTP 본문을 **봉투째** 반환한다(응답 `{success, data:[...], meta}`를 안 벗김 —
  // api-client `request<T>`가 axios `response.data`(=본문 전체)를 그대로 담음). 따라서 스펙의 봉투 구조를
  // 그대로 반영해 제네릭은 `useApi<{ data: TX[] }>`로, 목록은 `data?.data ?? []`로 꺼낸다. 봉투가 없는
  // (본문이 바로 배열인) 엔드포인트면 envelopeKey=null → `useApi<TX[]>` + `data ?? []`.
  // 파생 const는 기존 더미와 이름이 겹쳐 중복 게이트에 드롭되므로, 호출부가 더미를 먼저 결정론 제거한 뒤 적용한다.
  const listType = schema.envelopeKey ? `{ ${schema.envelopeKey}: ${typeName}[] }` : `${typeName}[]`;
  const derived = schema.envelopeKey
    ? `const ${collectionVar} = data?.${schema.envelopeKey} ?? [];`
    : `const ${collectionVar} = data ?? [];`;
  const hookCode = [
    typeCode.trim(),
    '',
    `const { data, isPending, error } = useApi<${listType}>('${endpoint}');`,
    derived,
    `if (isPending) {`,
    `  return <div className="p-5 text-muted-foreground">불러오는 중…</div>;`,
    `}`,
    `if (error) {`,
    `  return <div className="p-5 text-red-500">데이터를 불러오지 못했습니다.</div>;`,
    `}`,
  ].join('\n');

  return { hookCode, imports: [{ module: '@axiom/hooks', named: ['useApi'] }], typeName };
}

/**
 * 매핑대로 소스에서 `mapVar.from` → `mapVar.to`를 **결정론 치환**한다(테이블 셀 재바인딩).
 * from===to(정확일치 컬럼, 예: name)는 건너뛴다. `mapVar`(행 변수)로 스코프가 한정돼 오치환 위험이 낮다.
 * @returns 치환된 텍스트 + 실제 바뀐 항목.
 */
export function rewriteMappedFields(
  source: string,
  renames: IFieldRename[],
  mapVar: string,
): { text: string; renamed: IFieldRename[] } {
  let text = source;
  const renamed: IFieldRename[] = [];
  for (const r of renames) {
    if (r.from === r.to) continue;
    const re = new RegExp(`\\b${escapeRe(mapVar)}\\.${escapeRe(r.from)}\\b`, 'g');
    if (re.test(text)) {
      text = text.replace(re, `${mapVar}.${r.to}`);
      renamed.push(r);
    }
  }
  return { text, renamed };
}

// ── 애매 컬럼 → API필드 매핑: 작은 모델콜(라벨+필드목록만, 파일 아님) ──────────────

/**
 * 약어 등 결정론으로 못 잡은 컬럼을 API 필드에 맞추는 **작은 모델콜** 프롬프트를 만든다.
 * 입력은 컬럼 {라벨·필드} 목록 + 후보 API필드 목록뿐 — 파일/스펙 전문 없이 수십 토큰. 출력은 JSON 매핑.
 */
export function buildFieldMappingPrompt(columns: ITableColumn[], candidateFields: string[]): string {
  const cols = columns.map((c) => ({ label: c.headerLabel, field: c.field }));
  return [
    '아래 표 컬럼을 API 응답 필드에 매핑하세요. 각 컬럼의 한글 라벨과 기존 필드명의 **의미**를 보고 가장 알맞은 API 필드를 고르세요.',
    '확신이 없으면 그 컬럼은 **생략**하세요(억지 매핑 금지).',
    '',
    `표 컬럼: ${JSON.stringify(cols)}`,
    `API 필드(이 중에서만 선택): ${JSON.stringify(candidateFields)}`,
    '',
    '설명 없이 **JSON만** 출력. 형식(키=기존 필드명, 값=선택한 API 필드): {"dept":"department","grade":"position"}',
  ].join('\n');
}

/**
 * 모델 응답에서 매핑 JSON을 뽑아 검증된 rename 목록으로 만든다.
 * - 응답의 첫 `{…}` 객체만 파싱(코드펜스·잡담 무시).
 * - 키는 ambiguousColumns의 field, 값은 candidateFields에 실재해야 채택(환각 필드 차단).
 */
export function parseFieldMapping(
  response: string,
  ambiguousColumns: ITableColumn[],
  candidateFields: string[],
): IFieldRename[] {
  const m = response.match(/\{[\s\S]*?\}/);
  if (!m) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const wantFields = new Set(ambiguousColumns.map((c) => c.field));
  const candSet = new Set(candidateFields);
  const out: IFieldRename[] = [];
  const usedTo = new Set<string>();
  for (const [from, toRaw] of Object.entries(obj)) {
    if (!wantFields.has(from)) continue;
    const to = typeof toRaw === 'string' ? toRaw : '';
    if (!to || to === from || !candSet.has(to) || usedTo.has(to)) continue;
    usedTo.add(to);
    out.push({ from, to });
  }
  return out;
}

/** 엔드포인트에서 타입 베이스 이름을 뽑는다: "/api/employees" → "Employee"(마지막 세그먼트 단수화·PascalCase). */
export function deriveRootName(endpoint: string): string {
  const seg = endpoint.split('?')[0].split('/').filter(Boolean).pop() ?? 'Item';
  const singular = seg.replace(/ies$/i, 'y').replace(/s$/i, '');
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * 모듈 스코프 `const <name> = …;` 선언을 결정론적으로 제거한다(기존 더미 배열 삭제용).
 * 파생 const가 같은 이름이라 applyStructuralEdit 중복 게이트에 드롭되는 걸 피하려고, 조립 전에 더미를
 * 먼저 없앤다. 대상이 없으면 원본 그대로.
 */
export function stripModuleConst(source: string, name: string): string {
  const target = splitTsSections(source).find((s) => s.kind === 'const' && s.name === name);
  if (!target) return source;
  const lines = source.split('\n');
  lines.splice(target.startLine - 1, target.endLine - target.startLine + 1);
  // 제거 자리에 연속 빈 줄이 생기면 하나로 접는다(깔끔한 diff).
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** `<tbody>`에서 `X.map(` 앞의 컬렉션 식별자(예: "employees")를 찾는다. 없으면 null. */
export function findRowCollectionVar(source: string): string | null {
  const tbodyStart = source.search(/<tbody\b/);
  const scope = tbodyStart >= 0 ? source.slice(tbodyStart) : source;
  const m = scope.match(/([A-Za-z_$][\w$]*)\s*\.map\(/);
  return m ? m[1] : null;
}

/**
 * 주어진 0-based 컬럼 인덱스들을 테이블에서 **결정론 제거**한다: `<thead>`의 해당 `<th>` + `<tbody>` 첫 `<tr>`의
 * 해당 최상위 `<td>`. API 응답에 대응 필드가 없는 컬럼(project·rate 등)을 사용자가 "제거" 선택했을 때, 남은
 * `{emp.project}`가 새 타입에 없어 타입에러가 나는 걸 없애기 위해 조립 전에 컬럼째 들어낸다.
 * 헤더/셀은 extractTableColumns와 같은 순서(최상위 태그 깊이 기준)라 index가 정렬된다. 대상 없으면 원본 그대로.
 */
export function removeTableColumns(source: string, indices: number[]): string {
  const drop = new Set(indices);
  if (drop.size === 0) return source;

  // region(thead/tr) 내부의 최상위 cell(th/td)들을 index로 지운다. 앞쪽 공백·개행도 함께 접어 깔끔한 diff.
  const removeCellsIn = (text: string, regionTag: string, cellTag: string): string => {
    const region = tagBlockRanges(text, regionTag)[0];
    if (!region) return text;
    let inner = text.slice(region.innerStart, region.innerEnd);
    const cells = tagBlockRanges(inner, cellTag);
    for (let i = cells.length - 1; i >= 0; i--) {
      if (!drop.has(i)) continue;
      let s = cells[i].start;
      while (s > 0 && (inner[s - 1] === ' ' || inner[s - 1] === '\t')) s--;
      if (s > 0 && inner[s - 1] === '\n') s--;
      inner = inner.slice(0, s) + inner.slice(cells[i].end);
    }
    return text.slice(0, region.innerStart) + inner + text.slice(region.innerEnd);
  };

  let result = removeCellsIn(source, 'thead', 'th');
  const tbody = tagBlockRanges(result, 'tbody')[0];
  if (tbody) {
    const inner = result.slice(tbody.innerStart, tbody.innerEnd);
    const newInner = removeCellsIn(inner, 'tr', 'td'); // tbody의 첫 tr(행 템플릿)
    result = result.slice(0, tbody.innerStart) + newInner + result.slice(tbody.innerEnd);
  }
  return result;
}

// ── 공용 헬퍼 ─────────────────────────────────────────────────────────────────

/** 필드명 정규화: 소문자 + 영숫자만(snake/camel/구분자 차이 흡수). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 정규화 후 한쪽이 다른 쪽을 **부분문자열로 포함**하고 짧은 쪽이 4자 이상일 때만 매칭.
 * (status⊂employment_status ✓). ⚠️ **약어는 일부러 안 잡는다** — `dept`는 `department`의 부분문자열이
 * 아니라(dep-artment) 약어라, subsequence로 억지로 잡으면 `rate`가 `hire_date`에 걸리는 오매칭이 난다.
 * 약어(dept→department, grade→position)는 결정론으로 억측하지 않고 **작은 모델콜(라벨+필드) 한 번**에 맡긴다
 * — 그게 Claude Code 방식의 "안 줄어드는 의미 판단만 모델에게" 원칙이다.
 */
function containsNorm(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 4 && long.includes(short);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `source`에서 **최상위(중첩 아님)** `<tag …>…</tag>` 블록들의 위치 범위를 태그 깊이 카운팅으로 반환한다.
 * start/end=여는~닫는 태그 포함 범위, innerStart/innerEnd=내부 텍스트 범위. sliceTopLevelTags의 위치판.
 */
function tagBlockRanges(source: string, tag: string): Array<{ start: number; end: number; innerStart: number; innerEnd: number }> {
  const open = new RegExp(`<${tag}\\b[^>]*?(/?)>`, 'g');
  const close = new RegExp(`</${tag}\\s*>`, 'g');
  type Tok = { at: number; end: number; kind: 'open' | 'close' | 'selfclose' };
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = open.exec(source)) !== null) {
    toks.push({ at: m.index, end: m.index + m[0].length, kind: m[1] === '/' ? 'selfclose' : 'open' });
  }
  while ((m = close.exec(source)) !== null) {
    toks.push({ at: m.index, end: m.index + m[0].length, kind: 'close' });
  }
  toks.sort((a, b) => a.at - b.at);

  const out: Array<{ start: number; end: number; innerStart: number; innerEnd: number }> = [];
  let depth = 0;
  let startAt = -1;
  let innerStart = -1;
  for (const t of toks) {
    if (t.kind === 'selfclose') {
      if (depth === 0) out.push({ start: t.at, end: t.end, innerStart: t.end, innerEnd: t.end });
      continue;
    }
    if (t.kind === 'open') {
      if (depth === 0) {
        startAt = t.at;
        innerStart = t.end;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0 && startAt >= 0) {
        out.push({ start: startAt, end: t.end, innerStart, innerEnd: t.at });
        startAt = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

/** 소스에서 `<tag …>…</tag>` 첫 블록 전체(여는·닫는 태그 포함)를 태그 깊이로 정확히 잘라 반환. */
function matchTagBlock(source: string, tag: string): string | null {
  const blocks = sliceTopLevelTags(source, tag, true);
  return blocks.length > 0 ? blocks[0] : null;
}

/**
 * `source`에서 **최상위(중첩 아님)** `<tag …>…</tag>` 블록들을 태그 깊이 카운팅으로 잘라 반환한다.
 * @param withWrapper true면 여는/닫는 태그 포함, false면 내부 텍스트만.
 */
function sliceTopLevelTags(source: string, tag: string, withWrapper = false): string[] {
  const open = new RegExp(`<${tag}\\b[^>]*?(/?)>`, 'g');
  const close = new RegExp(`</${tag}\\s*>`, 'g');
  // 여는·닫는 태그 위치를 시간순으로 스캔하며 깊이 0→1 시작, 1→0 종료 구간을 수집.
  type Tok = { at: number; end: number; kind: 'open' | 'close' | 'selfclose' };
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = open.exec(source)) !== null) {
    toks.push({ at: m.index, end: m.index + m[0].length, kind: m[1] === '/' ? 'selfclose' : 'open' });
  }
  while ((m = close.exec(source)) !== null) {
    toks.push({ at: m.index, end: m.index + m[0].length, kind: 'close' });
  }
  toks.sort((a, b) => a.at - b.at);

  const out: string[] = [];
  let depth = 0;
  let startAt = -1;
  let startInner = -1;
  for (const t of toks) {
    if (t.kind === 'selfclose') {
      if (depth === 0) out.push(withWrapper ? source.slice(t.at, t.end) : '');
      continue;
    }
    if (t.kind === 'open') {
      if (depth === 0) {
        startAt = t.at;
        startInner = t.end;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0 && startAt >= 0) {
        out.push(withWrapper ? source.slice(startAt, t.end) : source.slice(startInner, t.at));
        startAt = -1;
      }
      if (depth < 0) depth = 0; // 방어
    }
  }
  return out;
}
