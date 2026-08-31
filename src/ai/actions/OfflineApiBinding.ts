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
 * vscode/디스크 비의존 순수 모듈 — 파일 읽기·스펙 탐색은 호출부가 한다.
 */

import {
  extractTableColumns, pickResponseSchema, reconcile, deriveRootName,
  type IResponseSchema, type ITableColumn,
} from '../ApiBindingRecipe';
import { containsExactApiPath } from '../decompose/SectionExtractor';

/**
 * 이 문서가 **정말 그 엔드포인트를 설명하는지** 확인한 뒤 스키마를 뽑는다.
 *
 * `pickResponseSchema`는 경로에 맞는 섹션이 없으면 문서 전체에서 아무 응답 JSON이나 뽑는
 * 관대한 폴백을 갖는다(온라인 조립 경로에선 "스펙 문서 하나 = 대상 엔드포인트 하나"라 합리적).
 * 하지만 오프라인 계획 카드는 **틀린 스키마로 바인딩하는 것**이 최악의 실패다 — 사용자는 카드에
 * 적힌 필드 목록을 보고 승인하므로, 엉뚱한 엔드포인트의 필드가 그럴듯하게 채워지면 안 된다.
 * 그래서 경로가 문서에 실제로 등장하는지부터 확인한다(형제 경로 부분일치는 배제).
 */
function schemaForEndpoint(specText: string, endpoint: string): IResponseSchema | null {
  if (!containsExactApiPath(specText, endpoint)) return null;
  return pickResponseSchema(specText, endpoint);
}

/** 매핑 테이블 한 행 — 카드가 그대로 렌더한다. */
export interface IBindingPlanRow {
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

export interface IBindingPlan {
  /** 계획을 세울 수 없으면 그 이유(테이블 없음·스펙 없음 등). 있으면 rows는 비어 있다. */
  blocked: string | null;
  endpoint: string;
  /** 생성될 행 타입 이름(예: "TEmployee"). */
  typeName: string;
  /** 응답 봉투 키 — `useApi<{ [key]: T[] }>` 생성에 쓴다. null이면 최상위가 배열. */
  envelopeKey: string | null;
  rows: IBindingPlanRow[];
  /** 어느 컬럼에도 안 붙은 API 필드 — 'choose' 행의 선택 후보. */
  candidateFields: string[];
  /** 사람이 판단해야 하는 행 수(= 클릭이 필요한 횟수). 0이면 클릭 1번으로 실행 가능. */
  needsChoiceCount: number;
}

export interface IBindingPlanInput {
  /** 현재 편집 중인 파일 원문(테이블이 들어 있는 화면). */
  source: string;
  /** API 스펙 문서 전문(없으면 null → blocked). */
  specText: string | null;
  /** 대상 엔드포인트(예: "/api/employees"). */
  endpoint: string;
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
  const empty = (blocked: string): IBindingPlan => ({
    blocked, endpoint, typeName: '', envelopeKey: null, rows: [], candidateFields: [], needsChoiceCount: 0,
  });

  if (!endpoint) return empty('엔드포인트가 아직 정해지지 않았습니다.');

  const columns = extractTableColumns(input.source);
  if (columns.length === 0) {
    return empty('현재 파일에서 목록 테이블을 찾지 못했습니다. 테이블이 있는 화면 파일을 열어주세요.');
  }

  if (!input.specText) {
    return empty(`API 스펙 문서를 찾지 못해 \`${endpoint}\`의 응답 필드를 알 수 없습니다.`);
  }
  const schema = schemaForEndpoint(input.specText, endpoint);
  if (!schema || schema.rowFields.length === 0) {
    return empty(`스펙 문서에서 \`${endpoint}\`의 응답 스키마를 찾지 못했습니다.`);
  }

  const rec = reconcile(columns, schema);
  const byColumnIndex = new Map(rec.mapping.map((m) => [m.column.index, m]));

  const rows: IBindingPlanRow[] = columns.map((col) => {
    if (!col.field) {
      return { label: rowLabel(col), currentField: null, apiField: null, how: 'static' };
    }
    const m = byColumnIndex.get(col.index);
    if (m) {
      return { label: rowLabel(col), currentField: col.field, apiField: m.apiField, how: m.how };
    }
    return { label: rowLabel(col), currentField: col.field, apiField: null, how: 'choose' };
  });

  return {
    blocked: null,
    endpoint,
    typeName: `T${deriveRootName(endpoint)}`,
    envelopeKey: schema.envelopeKey,
    rows,
    candidateFields: rec.unusedApiFields,
    needsChoiceCount: rows.filter((r) => r.how === 'choose').length,
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
    const schema = schemaForEndpoint(doc.text, endpoint);
    if (schema && schema.rowFields.length > 0) return doc;
  }
  return null;
}
