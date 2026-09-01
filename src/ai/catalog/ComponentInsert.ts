/**
 * ComponentInsert — 카탈로그에서 고른 부품을 **편집기 커서 자리에 넣는다**(§7 A4).
 *
 * 새 삽입기를 만들지 않는다. 재료가 이미 양쪽에 다 있다:
 *  - **무엇을 넣을지** = 카탈로그(B1)의 스니펫(import 줄 + 필수 prop 채운 JSX)
 *  - **어디에 어떻게 넣을지** = 레시피 실행기(A3, `OfflineRecipeApply`) — 화면(JSX) 범위 검증,
 *    import hoist·보강, 중복 삽입 방지(멱등), 들여쓰기 재정렬을 이미 한다.
 *
 * 이 모듈은 그 둘을 잇는 얇은 층이다. 삽입 규칙을 여기서 다시 쓰면 "카드로 넣은 것"과
 * "카탈로그로 넣은 것"이 서로 다르게 동작한다 — A3의 실측 교훈(멱등·화면 밖 삽입 금지)을
 * 두 번 배우게 된다.
 *
 * vscode 비의존(텍스트만 다룸) — 패널이 문서 텍스트를 넘기고, 결과 텍스트를 편집기에 적용한다.
 */

import { buildRecipeApply, buildRecipePlan } from '../actions/OfflineRecipeApply';

export interface IComponentInsertResult {
  /** 넣을 수 없는 이유(사람 말). null이면 text가 결과. */
  blocked: string | null;
  /** 삽입이 반영된 파일 전문. */
  text: string | null;
  /** 패널에 보여줄 요약(무엇을 어디에 넣었는지). */
  summary: string[];
  /** 삽입 위치 라벨 — 카드와 같은 어휘("37줄 …앞에 삽입"). */
  anchorLabel: string | null;
}

export interface IComponentInsertInput {
  /** 대상 파일 원문(편집기 버퍼 그대로 — 저장 전 편집 내용까지 반영된 텍스트). */
  source: string;
  /** 카탈로그가 만든 스니펫(import + JSX). */
  snippet: string;
  /** 표시용 대상 파일 경로. */
  targetFile: string;
  /** 편집기의 커서/선택(`line:37` | `sel:12-14`). 없으면 자동 후보만으로 판단한다. */
  cursorAnchor?: string;
}

/**
 * 스니펫을 삽입한 결과 텍스트를 만든다(모델 0회).
 *
 * 커서를 **최우선**으로 둔다(`preferCursor`) — 카드와 달리 여기서는 사용자가 편집기에서 자리를
 * 잡아 놓고 카탈로그를 열어 누른 것이므로, 그 커서가 곧 "여기 넣어줘"라는 의사표시다.
 * 화면(JSX) 밖 커서를 거르는 것은 A3 규칙 그대로 — 거기서 걸리면 blocked 사유로 나온다.
 */
export function buildComponentInsert(input: IComponentInsertInput): IComponentInsertResult {
  const { source, snippet, targetFile, cursorAnchor } = input;
  if (!snippet.trim()) {
    return { blocked: '이 부품에는 넣을 스니펫이 없습니다.', text: null, summary: [], anchorLabel: null };
  }

  const plan = buildRecipePlan({
    source,
    skeleton: snippet,
    values: {},
    targetFile,
    mode: 'insert',
    ...(cursorAnchor ? { cursorAnchor, preferCursor: true } : {}),
  });
  if (plan.blocked) {
    return { blocked: plan.blocked, text: null, summary: [], anchorLabel: null };
  }

  const applied = buildRecipeApply({ source, plan, skeleton: snippet, values: {} });
  return {
    blocked: applied.blocked,
    text: applied.text,
    summary: applied.summary,
    anchorLabel: plan.anchor?.label ?? null,
  };
}

/**
 * 0-based 줄 범위 치환 하나 — **(startLine,0) ~ (endLine,0)** 구간을 `text`로 바꾸라는 뜻.
 * 그래서 `text`는 마지막 줄까지 개행을 포함한다(파일 끝을 건드리는 경우만 예외).
 */
export interface IMinimalEdit {
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * 원문 → 결과를 **바뀐 줄 구간 하나**로 좁힌다.
 *
 * 왜 전문 교체가 아닌가: 편집기에 그대로 반영하기 때문이다. 파일을 통째로 갈아끼우면 되돌리기가
 * 파일 전체 한 덩어리가 되고, 접힘·커서·스크롤이 튄다. 앞뒤 공통 줄을 깎아내면 실제로 넣은
 * 부분만 남아 Ctrl+Z 한 번이 "방금 넣은 것"에 대응한다.
 *
 * 줄 끝 문자는 건드리지 않는다(`\n`으로만 쪼개므로 CRLF의 `\r`는 줄 내용에 붙어 그대로 보존된다).
 */
export function computeMinimalEdit(oldText: string, newText: string): IMinimalEdit | null {
  if (oldText === newText) return null;
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  let start = 0;
  const maxStart = Math.min(oldLines.length, newLines.length);
  while (start < maxStart && oldLines[start] === newLines[start]) start++;

  let backOld = oldLines.length;
  let backNew = newLines.length;
  while (backOld > start && backNew > start && oldLines[backOld - 1] === newLines[backNew - 1]) {
    backOld--;
    backNew--;
  }

  const body = newLines.slice(start, backNew);
  // 파일 끝까지 바뀐 경우만 마지막 줄에 개행을 붙이지 않는다(끝에는 원래 개행이 없다).
  const atEof = backOld >= oldLines.length;
  return {
    startLine: start,
    endLine: backOld,
    text: body.length === 0 ? '' : atEof ? body.join('\n') : `${body.join('\n')}\n`,
  };
}
