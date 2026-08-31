/**
 * OfflineApiBinding — API → 테이블 바인딩의 **계획(plan)** 계산기 (Phase 2 / 계획서 §7 A1).
 *
 * 온라인 compose binding에서 모델이 맡던 건 "필드 매핑 한 조각"뿐이고, 분해·대조는 이미 결정론이다
 * ([ApiBindingRecipe]: extractTableColumns · pickResponseSchema · reconcile · detectEnvelopeKey).
 * 오프라인에서는 그 한 조각을 **사람의 클릭**으로 치환하므로, 여기서는 모델 없이 계획만 만든다:
 *  - 명백한 행(exact/fuzzy)은 이미 채워진 상태로
 *  - 애매한 행만 후보 목록과 함께 "선택 필요"로 남겨
 * 카드가 **매핑 테이블 자체**를 보여줄 수 있게 한다(§3.6 — 위저드의 표면화, 창 전환 없음).
 *
 * 계획(buildBindingPlan) → 사용자 클릭 반영(resolveBindingChoices/decorateBindingRows) →
 * 결정론 조립(buildBindingApply)까지가 이 모듈의 범위다.
 * vscode/디스크 비의존 순수 모듈 — 파일 읽기·스펙 탐색은 호출부가 한다.
 */

import {
  extractTableColumns, extractResponseSchema, reconcile, deriveRootName,
  findRowMapVar, findRowCollectionVar, rewriteMappedFields, removeTableColumns,
  stripModuleConst, buildBindingCode,
  type IFieldRename, type IResponseSchema, type ITableColumn,
} from '../ApiBindingRecipe';
import { applyStructuralEdit } from '../apply/StructuralAnchor';
import { containsExactApiPath, splitIntoSections } from '../decompose/SectionExtractor';

/** 목록 조회 신호. 표에 뿌릴 데이터는 조회(GET)에서 온다. */
const GET_RE = /\bGET\b/i;

/**
 * 이 문서에서 **그 경로의 목록 조회(GET) 응답** 스키마를 뽑는다. 없으면 null.
 *
 * 온라인 `pickResponseSchema`는 관대하다(경로 섹션이 없으면 문서 전체에서 아무 응답 JSON이나,
 * GET이 없으면 POST 섹션이라도). "스펙 문서 하나 = 대상 엔드포인트 하나"인 조립 경로에선 합리적이지만,
 * 오프라인 계획 카드에서는 **틀린 스키마로 그럴듯하게 채우는 것**이 최악의 실패다 — 사용자는 카드에
 * 적힌 필드를 보고 승인하기 때문이다. 실측 사고: `POST /api/courses/:courseId/lessons`(강의 **등록**,
 * 입력이 배열)의 201 응답이 마침 배열이라, 직원 표 6칸을 강의 필드 3개(id·slug·title)에 매핑하라는
 * 무의미한 카드가 떴다. 그래서 여기서는 세 가지를 모두 요구한다:
 *   ① 경로가 문서에 **정확히** 등장(형제 경로 부분일치 배제)
 *   ② 그 경로 섹션이 **GET**(등록·수정 API는 목록 원천이 아니다)
 *   ③ 응답 컨테이너가 **배열**(단건 응답으로 표를 채우지 않는다)
 */
function listSchemaForGet(specText: string, endpoint: string): IResponseSchema | null {
  if (!containsExactApiPath(specText, endpoint)) return null;
  const sections = splitIntoSections('spec', specText);
  const byHeader = sections.filter((s) => containsExactApiPath(s.header, endpoint));
  // 헤더에 경로를 적는 문서(대부분)는 헤더의 메서드를 믿는다. 헤더에 경로가 없는 문서에서만
  // 본문으로 내려간다 — 헤더 후보가 있는데 본문까지 훑으면 "POST 섹션이 GET을 언급"하는 흔한
  // 상호참조에 걸려 등록 API를 목록으로 오인한다.
  const pool = byHeader.length > 0
    ? byHeader.filter((s) => GET_RE.test(s.header))
    : sections.filter((s) => containsExactApiPath(s.body, endpoint) && GET_RE.test(s.body));
  for (const s of pool) {
    const schema = extractResponseSchema(s.body);
    if (schema && schema.isList && schema.rowFields.length > 0) return schema;
  }
  return null;
}

/**
 * 스펙 없이 배선만 할 때 가정하는 봉투 키.
 * scaffold의 useApi는 HTTP 본문을 봉투째 돌려주고, 지식 문서의 계약 예제도 `{ data: T[] }`다
 * ([compose-binding-recipe]) — 근거 있는 기본값이되, 카드가 "가정"임을 밝히고 **고칠 수 있게** 한다.
 */
const ASSUMED_ENVELOPE_KEY = 'data';

/** "봉투 없음"(본문이 곧 배열) 선택지의 표시값 — 식별자와 겹치지 않는 문자열. */
export const NO_ENVELOPE = '(봉투 없음)';

/**
 * 배선 전용 모드에서 고를 수 있는 봉투 키 — SI 현장에서 흔한 이름들 + 봉투 없음.
 * 백엔드가 제각각이라 기본값(data)만 강요하면 런타임에 조용히 빈 목록이 된다(`data?.data`가 undefined).
 * 직접 입력도 허용하므로 이 목록은 "자주 쓰는 것"일 뿐 제한이 아니다.
 */
export const ENVELOPE_OPTIONS: readonly string[] = ['data', 'list', 'items', 'result', 'rows', 'content', NO_ENVELOPE];

/** 배선 전용 모드에서 코드에 남기는 한 줄 — 카드 밖으로 나가도 가정이 따라가게. */
const WIRING_TYPE_NOTE = 'TODO: 스펙 문서 없이 현재 표 기준으로 만든 타입/봉투 키 — 실제 응답에 맞게 확인';

/** 매핑 테이블 한 행 — 카드가 그대로 렌더한다. */
export interface IBindingPlanRow {
  /** 0-based 컬럼 순서 — "컬럼 제거"를 고른 행을 removeTableColumns에 넘길 때 쓴다. */
  index: number;
  /** 테이블 헤더 라벨(예: "부서"). 비어 있으면 빈 문자열. */
  label: string;
  /** 지금 셀이 읽는 필드(예: "dept"). 참조가 없으면 null. */
  currentField: string | null;
  /** 결정된 API 필드. null이면 사용자가 골라야 한다. */
  apiField: string | null;
  /**
   * 'exact'  — 필드명 동일(그대로 두면 됨)
   * 'fuzzy'  — 이름이 달라 교체 필요(dept → department)
   * 'choose' — 대응을 못 찾음. 후보 중 사용자가 선택하거나 컬럼을 빼야 한다.
   * 'static' — 필드를 안 읽는 컬럼(액션 버튼 등). 바인딩 대상 아님.
   */
  how: 'exact' | 'fuzzy' | 'choose' | 'static';
}

/**
 * 계획의 종류.
 *  - `mapped`: 스펙의 GET 목록 응답과 표를 대조한 정상 계획(필드 매핑까지).
 *  - `wiring-only`: 응답을 모르는 상태(스펙 문서 없음/그 경로 미문서화)에서 **배선만** 하는 계획.
 *    폐쇄망 SI에서 "스펙 md가 아직 없다"는 예외가 아니라 흔한 정상 상태라, 이 경우 아무 것도 못 하고
 *    막히면 카드 자체가 쓸모없어진다. 표가 쓰는 필드는 **그대로 두고** useApi 훅·로딩/에러 가드·
 *    더미 배열 제거만 결정론으로 해준다(손으로 하면 제일 지루한 부분이 정확히 이 배선이다).
 */
export type TBindingMode = 'mapped' | 'wiring-only';

export interface IBindingPlan {
  /** 계획을 세울 수 없으면 그 이유(테이블 없음·GET 목록 없음 등). 있으면 rows는 비어 있다. */
  blocked: string | null;
  mode: TBindingMode;
  /** 사용자가 알아야 할 전제(배선 전용 모드의 가정 등). 없으면 null. */
  notice: string | null;
  /** 스펙에서 읽은 응답 필드 **전부** — 카드가 그대로 보여줘서 표와 맞는지 한눈에 보이게 한다. */
  apiFields: string[];
  /**
   * 봉투 키를 사람이 고를 수 있는 상황이면 그 선택지(배선 전용 모드). 비어 있으면 고를 게 없다
   * (스펙에서 감지했으므로 — 문서가 진실의 원천일 때 추측 선택지를 주면 오히려 흔든다).
   */
  envelopeChoices: string[];
  /** 이 계획이 편집할 파일(워크스페이스 상대 경로) — 카드가 칩으로 보여준다. */
  targetFile: string | null;
  /** 대상 파일 후보(열려 있는 코드 파일). 사용자가 바꿀 수 있게 카드로 내려보낸다. */
  targetFileChoices: string[];
  endpoint: string;
  /** 생성될 행 타입 이름(예: "TEmployee"). */
  typeName: string;
  /** 응답 봉투 키 — `useApi<{ [key]: T[] }>` 생성에 쓴다. null이면 최상위가 배열. */
  envelopeKey: string | null;
  rows: IBindingPlanRow[];
  /**
   * 막혔을 때 **대신 고를 수 있는 경로**(스펙에서 실제로 목록 스키마가 나오는 것만).
   * 막힘이 막다른 길이 되지 않게 하는 계단 — 카드가 칩으로 렌더해 클릭 한 번에 계획을 다시 세운다.
   */
  suggestions: string[];
  /** 어느 컬럼에도 안 붙은 API 필드 — 'choose' 행의 선택 후보. */
  candidateFields: string[];
  /** 사람이 판단해야 하는 행 수(= 클릭이 필요한 횟수). 0이면 클릭 1번으로 실행 가능. */
  needsChoiceCount: number;
  /**
   * 추출된 응답 스키마 — 적용 시 타입 생성(generateTypeFromJson)에 그대로 쓴다.
   * **웹뷰로 보내지 않는다**(뷰 변환은 CardPlanView): 계획을 세운 그 스키마로 적용해야
   * "카드에서 본 것 = 적용된 것"이 구조적으로 보장된다.
   */
  schema: IResponseSchema | null;
}

export interface IBindingPlanInput {
  /** 현재 편집 중인 파일 원문(테이블이 들어 있는 화면). */
  source: string;
  /** API 스펙 문서 전문(없으면 null → blocked). */
  specText: string | null;
  /** 대상 엔드포인트(예: "/api/employees"). */
  endpoint: string;
  /**
   * 호스트가 문서를 뒤진 결과 — 막힘 사유를 **정확히** 쓰기 위한 재료.
   * 이게 없으면 "스펙을 못 찾음" 하나로 뭉뚱그려져, 사용자가 엉뚱한 것(스펙 파일 유무)을 의심한다.
   * 실측: `/api/courses/:courseId/lessons`는 스펙에 **있었지만** POST만 있어 목록 스키마가 없었다.
   */
  lookup?: {
    /** 훑어본 마크다운 문서 수. 0이면 "스펙 문서 자체가 없음". */
    docsScanned: number;
    /** 어느 문서든 이 경로를 **언급**은 하는지(스키마 추출 성공 여부와 별개). */
    pathMentioned: boolean;
  };
  /** 막혔을 때 제시할 대체 경로(호스트가 "실제로 바인딩 가능한 것"만 걸러 넘긴다). */
  suggestions?: string[];
  /**
   * 사용자가 고른 봉투 키(배선 전용 모드 전용, `NO_ENVELOPE`면 본문이 곧 배열).
   * 스펙이 있는 경우에는 무시한다 — 문서에서 감지한 구조가 사람의 기억보다 정확하다.
   */
  envelopeOverride?: string;
  /** `source`가 어느 파일에서 왔는지(표시·사유 문구용). */
  targetFile?: string;
  /** 대상 파일 후보 — 카드가 칩으로 바꿀 수 있게 그대로 실어 보낸다. */
  targetFileChoices?: string[];
}

/**
 * 요청 경로와 **얼마나 가까운 경로**인지로 후보를 정렬한다(앞 세그먼트 공유 수 → 길이 근접 → 사전순).
 * `/api/courses/:courseId/lessons`가 막히면 `/api/courses/:courseId`·`/api/courses`가 위로 온다 —
 * 목록을 주는 상위 리소스가 대개 정답이기 때문이다. 요청이 비어 있으면 사전순 그대로.
 */
export function rankByPathAffinity(known: string[], requested: string): string[] {
  const want = requested.split('/').filter(Boolean);
  const shared = (p: string): number => {
    const segs = p.split('/').filter(Boolean);
    let n = 0;
    while (n < segs.length && n < want.length && segs[n] === want[n]) n++;
    return n;
  };
  return known
    .filter((p) => p !== requested)
    .map((p) => ({ p, s: shared(p), d: Math.abs(p.split('/').filter(Boolean).length - want.length) }))
    .sort((a, b) => b.s - a.s || a.d - b.d || a.p.localeCompare(b.p))
    .map((x) => x.p);
}

/** 컬럼 라벨 표시용 — 헤더가 비어 있으면 필드명이라도 보여준다. */
function rowLabel(col: ITableColumn): string {
  return col.headerLabel || col.field || `열 ${col.index + 1}`;
}

/**
 * 계획을 만든다. 모델 호출 0회 — 전부 결정론.
 * 막히면 `blocked`에 사람이 읽을 사유를 담아 돌려준다(조용히 빈 결과를 주지 않는다).
 */
export function buildBindingPlan(input: IBindingPlanInput): IBindingPlan {
  const endpoint = input.endpoint.trim();
  const suggestions = input.suggestions ?? [];
  const targetFile = input.targetFile ?? null;
  const targetFileChoices = input.targetFileChoices ?? [];
  const empty = (blocked: string): IBindingPlan => ({
    blocked, mode: 'mapped', notice: null, apiFields: [], envelopeChoices: [],
    targetFile, targetFileChoices, endpoint,
    typeName: '', envelopeKey: null, rows: [], suggestions, candidateFields: [],
    needsChoiceCount: 0, schema: null,
  });

  if (!endpoint) return empty('엔드포인트가 아직 정해지지 않았습니다.');

  // 어느 파일을 봤는지 밝힌다 — "현재 파일"이라고만 하면 사용자는 자기가 보고 있는 화면을 떠올리는데,
  // 정작 카드가 본 건 방금 열어본 스펙 문서(.md)일 수 있다(실측: 버튼이 영영 안 눌리던 원인).
  const where = targetFile ? `${targetFile} 에서` : '현재 파일에서';
  if (!input.source.trim()) {
    return empty('편집할 화면 파일이 열려 있지 않습니다. 테이블이 있는 .tsx 파일을 열어주세요.');
  }
  const columns = extractTableColumns(input.source);
  if (columns.length === 0) {
    return empty(
      `${where} 목록 테이블을 찾지 못했습니다(목록.map((행) => <tr> … 형태). ` +
      '아래에서 대상 파일을 바꾸거나, 테이블이 있는 화면을 열어주세요.',
    );
  }

  if (!input.specText) {
    const lookup = input.lookup;
    // 경로가 **문서에는 있는데** GET 목록이 없다 = 대개 잘못 고른 경로(등록·수정용). 배선을 밀어붙이지 말고
    // 사실을 말하고 대안을 준다 — 여기서 추측하면 "그럴듯하게 틀린" 카드가 된다.
    if (lookup?.pathMentioned) {
      return empty(
        `스펙에 ${endpoint} 항목은 있지만 목록 조회(GET) 응답 예시가 없습니다 ` +
        '(등록·수정용이거나 단건 조회 경로로 보입니다). 목록을 돌려주는 경로로 바꿔주세요.',
      );
    }
    // 응답을 아예 모르는 경우 = 스펙 문서가 없거나 이 경로가 문서화되지 않음.
    // 폐쇄망에선 흔한 정상 상태라, 막지 말고 **할 수 있는 만큼**(배선) 한다.
    return wiringOnlyPlan(
      endpoint, columns, suggestions, lookup?.docsScanned === 0, input.envelopeOverride,
      targetFile, targetFileChoices,
    );
  }
  const schema = listSchemaForGet(input.specText, endpoint);
  if (!schema || schema.rowFields.length === 0) {
    return empty(`스펙 문서에서 ${endpoint}의 목록 조회(GET) 응답 스키마를 찾지 못했습니다.`);
  }

  const rec = reconcile(columns, schema);
  const byColumnIndex = new Map(rec.mapping.map((m) => [m.column.index, m]));

  const rows: IBindingPlanRow[] = columns.map((col) => {
    if (!col.field) {
      return { index: col.index, label: rowLabel(col), currentField: null, apiField: null, how: 'static' };
    }
    const m = byColumnIndex.get(col.index);
    if (m) {
      return { index: col.index, label: rowLabel(col), currentField: col.field, apiField: m.apiField, how: m.how };
    }
    return { index: col.index, label: rowLabel(col), currentField: col.field, apiField: null, how: 'choose' };
  });

  return {
    blocked: null,
    mode: 'mapped',
    notice: null,
    apiFields: schema.rowFields,
    // 스펙이 진실의 원천인 경우에는 봉투를 고르게 하지 않는다(추측 선택지가 확정을 흔든다).
    envelopeChoices: [],
    targetFile,
    targetFileChoices,
    endpoint,
    typeName: `T${deriveRootName(endpoint)}`,
    envelopeKey: schema.envelopeKey,
    rows,
    suggestions,
    candidateFields: rec.unusedApiFields,
    needsChoiceCount: rows.filter((r) => r.how === 'choose').length,
    schema,
  };
}

/**
 * 응답을 모를 때의 계획 — **배선만**. 표의 필드는 그대로 두고(추측 0), useApi 훅·로딩/에러 가드·
 * 더미 배열 제거만 결정론으로 한다. 타입은 지금 표가 실제로 읽는 필드로 만들고(코드가 이미
 * 가정하고 있는 그대로라 새 추측이 아니다), 봉투 키는 scaffold 계약(data)을 가정한다.
 */
function wiringOnlyPlan(
  endpoint: string, columns: ITableColumn[], suggestions: string[], noDocs: boolean,
  envelopeOverride: string | undefined,
  targetFile: string | null, targetFileChoices: string[],
): IBindingPlan {
  // 사용자가 고른 봉투가 있으면 그것, 없으면 scaffold 관례(data). "(봉투 없음)"이면 본문이 곧 배열.
  const picked = (envelopeOverride ?? '').trim();
  const envelopeKey = picked === NO_ENVELOPE ? null : (picked || ASSUMED_ENVELOPE_KEY);
  const fields = [...new Set(columns.map((c) => c.field).filter((f): f is string => !!f))];
  if (fields.length === 0) {
    return {
      blocked: '표의 셀이 어떤 필드도 읽지 않아 바인딩할 대상이 없습니다.',
      mode: 'mapped', notice: null, apiFields: [], envelopeChoices: [],
      targetFile, targetFileChoices, endpoint,
      typeName: '', envelopeKey: null, rows: [], suggestions, candidateFields: [],
      needsChoiceCount: 0, schema: null,
    };
  }
  const rows: IBindingPlanRow[] = columns.map((col) =>
    col.field
      ? { index: col.index, label: rowLabel(col), currentField: col.field, apiField: col.field, how: 'exact' }
      : { index: col.index, label: rowLabel(col), currentField: null, apiField: null, how: 'static' },
  );
  return {
    blocked: null,
    mode: 'wiring-only',
    notice:
      (noDocs
        ? '워크스페이스에 API 스펙 문서(.md)가 없어 응답 필드를 확인할 수 없습니다. '
        : `스펙 문서에 ${endpoint} 설명이 없어 응답 필드를 확인할 수 없습니다. `) +
      '표의 필드는 그대로 두고 배선만 합니다 — useApi 훅 + 로딩·에러 가드 + 더미 배열 제거. ' +
      '타입은 지금 표가 쓰는 필드로 만듭니다. ' +
      (picked
        ? `봉투 키는 고르신 ${picked}(으)로 배선합니다.`
        : `봉투 키는 scaffold 관례(${ASSUMED_ENVELOPE_KEY})로 가정했으니 응답 구조가 다르면 아래에서 바꿔주세요.`),
    apiFields: [],
    // 백엔드마다 봉투가 달라 기본값만 강요하면 런타임에 조용히 빈 목록이 된다 → 사람이 고르게 한다.
    envelopeChoices: [...ENVELOPE_OPTIONS],
    targetFile,
    targetFileChoices,
    endpoint,
    typeName: `T${deriveRootName(endpoint)}`,
    envelopeKey,
    rows,
    suggestions,
    candidateFields: [],
    needsChoiceCount: 0,
    schema: {
      rowFields: fields,
      rowJson: Object.fromEntries(fields.map((f) => [f, ''])),
      envelopeKey,
      isList: true,
    },
  };
}

// ── 사용자의 선택(클릭) 반영 ──────────────────────────────────────────────────

/**
 * 'choose' 행에서 "이 컬럼은 API에 없으니 표에서 뺀다"를 뜻하는 예약 선택값.
 *
 * 온라인 경로는 미매핑 컬럼을 QuickPick(제거/유지/취소)으로 되물었는데, 오프라인 카드에서는
 * 그 되묻기를 **같은 드롭다운의 한 항목**으로 접는다 — 창 전환 없이 매핑 테이블 안에서 끝난다.
 * ("유지"는 새 타입에 없는 필드를 남겨 컴파일이 깨지므로 선택지에서 뺀다.)
 * API 필드는 식별자라 이 표시 문자열과 충돌하지 않는다.
 */
export const REMOVE_COLUMN = '(컬럼 제거)';

/** 한 행에 대해 확정된 결정. */
type TRowDecision =
  | { kind: 'bound'; apiField: string }
  | { kind: 'remove' }
  | { kind: 'pending' }
  | { kind: 'static' };

function decideRow(
  row: IBindingPlanRow, plan: IBindingPlan, choices: Record<string, string>, taken: Set<string>,
): TRowDecision {
  if (row.how === 'static' || !row.currentField) return { kind: 'static' };
  if (row.apiField) return { kind: 'bound', apiField: row.apiField }; // 결정론이 이미 확신한 행
  const picked = (choices[row.currentField] ?? '').trim();
  if (!picked) return { kind: 'pending' };
  if (picked === REMOVE_COLUMN) return { kind: 'remove' };
  // 후보 밖 값(스펙·엔드포인트가 바뀌어 낡은 선택이 남은 경우)은 없던 일로 — 환각 필드로 바인딩하지 않는다.
  if (!plan.candidateFields.includes(picked) || taken.has(picked)) return { kind: 'pending' };
  return { kind: 'bound', apiField: picked };
}

/** 계획 + 선택 → 행별 결정(순서 보존). 앞 행이 쓴 API 필드는 뒤 행 후보에서 빠진다. */
function decideRows(plan: IBindingPlan, choices: Record<string, string>): TRowDecision[] {
  const taken = new Set<string>(plan.rows.map((r) => r.apiField).filter((f): f is string => !!f));
  return plan.rows.map((row) => {
    const d = decideRow(row, plan, choices, taken);
    if (d.kind === 'bound') taken.add(d.apiField);
    return d;
  });
}

/** 선택을 반영한 표시용 행 — 고른 값이 그 자리에 채워져 보인다(칩과 미리보기의 진실원 일치). */
export function decorateBindingRows(
  plan: IBindingPlan, choices: Record<string, string>,
): (IBindingPlanRow & { candidates?: string[] })[] {
  const decisions = decideRows(plan, choices);
  // 다른 행이 이미 가져간 필드는 후보에서 빼 **중복 배정 자체가 불가능**하게 한다(검증보다 구조로).
  const used = new Set<string>();
  decisions.forEach((d) => { if (d.kind === 'bound') used.add(d.apiField); });

  return plan.rows.map((row, i) => {
    const d = decisions[i];
    if (row.how !== 'choose') return { ...row };
    const mine = d.kind === 'bound' ? d.apiField : null;
    const candidates = [
      ...plan.candidateFields.filter((f) => !used.has(f) || f === mine),
      REMOVE_COLUMN,
    ];
    return {
      ...row,
      apiField: d.kind === 'remove' ? REMOVE_COLUMN : mine,
      candidates,
    };
  });
}

/** 확정된 결정 묶음 — 적용 단계의 입력. */
export interface IBindingDecision {
  /** 셀 재바인딩(`행.from` → `행.to`). from===to(정확일치)도 담기지만 치환 단계에서 건너뛴다. */
  renames: IFieldRename[];
  /** 표에서 뺄 컬럼 인덱스. */
  removeIndices: number[];
  /** 뺄 컬럼 라벨(사용자 보고용). */
  removedLabels: string[];
  /** 아직 정하지 않은 행의 라벨 — 하나라도 있으면 적용하지 않는다(추측 금지). */
  pendingLabels: string[];
}

export function resolveBindingChoices(plan: IBindingPlan, choices: Record<string, string>): IBindingDecision {
  const decisions = decideRows(plan, choices);
  const out: IBindingDecision = { renames: [], removeIndices: [], removedLabels: [], pendingLabels: [] };
  plan.rows.forEach((row, i) => {
    const d = decisions[i];
    if (d.kind === 'bound' && row.currentField) out.renames.push({ from: row.currentField, to: d.apiField });
    else if (d.kind === 'remove') { out.removeIndices.push(row.index); out.removedLabels.push(row.label); }
    else if (d.kind === 'pending') out.pendingLabels.push(row.label);
  });
  return out;
}

// ── 결정론 적용(모델 0회) ─────────────────────────────────────────────────────

export interface IBindingApplyInput {
  /** 적용 시점의 파일 원문(계획을 세운 원문과 같은 파일이어야 한다). */
  source: string;
  plan: IBindingPlan;
  choices: Record<string, string>;
}

export interface IBindingApplyResult {
  /** 적용할 수 없는 이유. null이면 text가 최종 파일 내용. */
  blocked: string | null;
  text: string | null;
  typeName: string;
  renames: IFieldRename[];
  removedLabels: string[];
}

/**
 * 확정된 계획을 **결정론으로 조립**해 최종 파일 텍스트를 만든다 — 온라인 `_tryComposeBinding` ⑥단계와
 * 같은 순서(컬럼 제거 → 셀 재바인딩 → 더미 배열 제거 → type·useApi·가드 structural 삽입)를 쓰되,
 * 모델콜(필드 매핑 1콜)이 있던 자리를 사용자의 클릭이 대신한다.
 *
 * 미결정 행이 하나라도 있으면 조립하지 않는다: 남은 `{행.project}`가 새 타입에 없어 컴파일이 깨지는데,
 * 그건 카드가 약속한 "미리보기 = 검증 게이트"를 배신하는 실패다.
 */
export function buildBindingApply(input: IBindingApplyInput): IBindingApplyResult {
  const { source, plan, choices } = input;
  const fail = (blocked: string): IBindingApplyResult =>
    ({ blocked, text: null, typeName: '', renames: [], removedLabels: [] });

  if (plan.blocked) return fail(plan.blocked);
  if (!plan.schema) return fail('응답 스키마를 확정하지 못했습니다.');

  const mapVar = findRowMapVar(source);
  const collectionVar = findRowCollectionVar(source);
  if (!mapVar || !collectionVar) {
    return fail('테이블 행 반복(`목록.map((행) => …)`)을 찾지 못했습니다. 파일이 바뀌었다면 다시 요청해주세요.');
  }

  const decision = resolveBindingChoices(plan, choices);
  if (decision.pendingLabels.length > 0) {
    return fail(`아직 정하지 않은 컬럼이 있습니다: ${decision.pendingLabels.join(', ')}`);
  }

  const working = removeTableColumns(source, decision.removeIndices);
  // 파생 const(`const employees = data?.data ?? []`)가 기존 더미와 이름이 겹쳐 중복 게이트에 드롭되지
  // 않도록 더미 선언을 먼저 없앤다(온라인 경로와 동일).
  const rewritten = stripModuleConst(rewriteMappedFields(working, decision.renames, mapVar).text, collectionVar);
  const bind = buildBindingCode({
    schema: plan.schema, endpoint: plan.endpoint, rootName: deriveRootName(plan.endpoint), collectionVar,
    // 추정으로 만든 타입·봉투 키라는 사실을 코드에도 남긴다(카드를 떠난 뒤에도 근거가 보이게).
    ...(plan.mode === 'wiring-only' ? { typeNote: WIRING_TYPE_NOTE } : {}),
  });
  const applied = applyStructuralEdit(rewritten, { hookCode: bind.hookCode, imports: bind.imports }).text;
  if (applied.trim() === source.trim()) return fail('적용해도 바뀌는 내용이 없습니다.');

  return {
    blocked: null,
    text: applied,
    typeName: bind.typeName,
    renames: decision.renames,
    removedLabels: decision.removedLabels,
  };
}

/**
 * 워크스페이스 문서 후보 중 **이 엔드포인트를 설명하는 스펙**을 고른다.
 * 파일 읽기는 호출부가 하고(디스크 비의존 유지), 여기서는 내용만 보고 판단한다.
 *
 * 폐쇄망 SI에서 스펙 문서 이름·위치는 제각각이라 파일명 규칙에 기대지 않고,
 * "해당 경로의 응답 스키마를 실제로 뽑을 수 있는 문서"를 정답으로 삼는다.
 */
export function pickSpecDoc(
  docs: { path: string; text: string }[],
  endpoint: string,
): { path: string; text: string } | null {
  for (const doc of docs) {
    const schema = listSchemaForGet(doc.text, endpoint);
    if (schema && schema.rowFields.length > 0) return doc;
  }
  return null;
}
