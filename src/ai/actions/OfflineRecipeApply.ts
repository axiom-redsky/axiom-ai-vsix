/**
 * OfflineRecipeApply — recipe 카드의 **계획(plan)과 결정론 적용** (Phase 4 / 계획서 §7 A3).
 *
 * Phase 1~3에서 recipe 카드는 골격을 보여주고 "복사해 붙여넣으세요"로 끝났다. Phase 3가 팀이
 * 레시피 카드를 저작·공유할 수 있게 열어 놓았으므로(§5 프로젝트 계층), 실행이 없으면 카탈로그의
 * 값어치가 절반만 실현된다 — 여기서 그 꼬리를 잇는다.
 *
 * 온라인에서 모델이 하던 일은 둘이었다: ① 골격을 만들고 ② 어디에 넣을지 정한다.
 * ①은 카드가 이미 갖고 있으므로(레시피 = 확정된 골격), 오프라인에 남는 모델의 몫은 ②뿐이고
 * 그걸 **사람의 클릭**으로 치환한다 — 카드의 "삽입 위치" 칩이 그 자리다(§2 핵심 통찰).
 *
 * 조립 순서:
 *   골격 슬롯 치환 → import/훅/JSX 3분할 → JSX를 앵커에 삽입(또는 선택 영역 교체)
 *   → 나머지는 `applyStructuralEdit`(import hoist·type 분리·중복 선언 방지까지 기존 계약 그대로)
 *
 * vscode/디스크 비의존 순수 모듈 — 파일 읽기·에디터 선택 수집은 호출부(호스트)가 한다.
 */

import {
  applyStructuralEdit, computeAnchors, resolveKnownImports, splitStatements,
} from '../apply/StructuralAnchor';
import { locateTokens } from '../locate/RegionEdit';
import { substituteSlots } from './CardPlanView';
import type { TRecipeMode } from './types';

/** 골격을 세 채널로 나눈 결과. import는 훅 코드에 남겨 둔다(applyStructuralEdit가 상단으로 hoist). */
export interface IRecipeParts {
  /** import + 훅/상수/타입 — 컴포넌트 본문 채널(그 안의 import는 적용 단계에서 파일 상단으로 hoist). */
  code: string;
  /** JSX 블록(골격 맨 끝의 최상위 태그부터 끝까지). 없으면 빈 문자열. */
  jsx: string;
  /** 골격이 선언한 import 줄 수 — 카드 미리보기의 부품 요약용. */
  importCount: number;
}

/** JSX를 넣을 자리 하나. `key`가 곧 카드 드롭다운의 값이자 세션 저장값이다. */
export interface IRecipeAnchor {
  /** `sel:12-14`(선택 영역 교체) 또는 `line:37`(그 줄 앞에 삽입). */
  key: string;
  /** 1-based 시작 줄. */
  line: number;
  /** 교체 끝 줄(선택 영역일 때만). null이면 삽입. */
  endLine: number | null;
  /** 카드 칩에 표시할 사람 말. */
  label: string;
}

export interface IRecipePlan {
  /** 계획을 세울 수 없는 이유. null이면 실행 가능. */
  blocked: string | null;
  targetFile: string | null;
  targetFileChoices: string[];
  /** 아직 값이 없어 골격에 `{{…}}`가 남은 슬롯 — 있으면 실행을 잠근다. */
  pendingSlots: string[];
  importCount: number;
  codeLines: number;
  jsxLines: number;
  /** 확정된 삽입 위치. jsx가 없으면 null(훅만 넣는 레시피). */
  anchor: IRecipeAnchor | null;
  anchorChoices: IRecipeAnchor[];
  /** 슬롯이 치환된 골격 — 카드가 접어서 보여주고, 실행도 **이 텍스트**를 쓴다. */
  preview: string;
  /** 사용자가 알아야 할 전제(삽입은 교체가 아니라는 사실 등). */
  notice: string | null;
}

export interface IRecipePlanInput {
  /** 대상 파일 원문(계획과 적용이 같은 텍스트를 봐야 한다). 빈 문자열이면 blocked로 사유를 낸다. */
  source: string;
  /** 카드 본문의 골격(코드펜스 내용). */
  skeleton: string;
  /** 칩 값(슬롯 치환에 쓴다). */
  values: Record<string, string>;
  targetFile?: string | null;
  targetFileChoices?: string[];
  /**
   * 사용자 요청 문장. 있으면 **결정론 위치 찾기**(locate)로 자리를 자동 제안한다 —
   * 커서를 손으로 맞추게 하지 않기 위한 재료다(온라인 편집이 쓰는 그 층, 모델 0회).
   */
  query?: string;
  /** 카드가 선언한 방식(기본 insert). replace면 locate가 잡은 요소를 갈아끼운다. */
  mode?: TRecipeMode;
  /** 카드가 선언한 대상 힌트(`action.target`) — 위치 찾기에 사용자 문장과 함께 넘어간다. */
  target?: string;
  /**
   * 사용자가 **카드에서 명시적으로 고른** 위치 key(`sel:12-14` | `line:37`). 최우선.
   * (요청 시점 커서는 `cursorAnchor`로 따로 받는다 — 자동으로 잡은 값이 사용자의 선택이나
   *  요청으로 찾아낸 자리를 밀어내면 안 된다.)
   */
  anchorChoice?: string;
  /**
   * 요청 시점의 편집기 커서/선택(자동). 렌더마다 다시 읽지 않고 세션이 붙잡은 값이다
   * (Phase 2 4차 F5 교훈 — 화면만 옮겨도 계획이 흔들리면 안 된다).
   */
  cursorAnchor?: string;
  /**
   * true면 커서 후보를 **자동 제안보다 앞**에 둔다.
   *
   * 카드가 뜬 뒤 사용자가 **직접 커서를 옮긴 경우**에만 켠다 — 그 행동 자체가 "여기 넣어줘"라는
   * 의사표시다. 처음 떴을 때(커서를 신경 쓰지 않은 상태)는 자동 제안이 기본이어야 하므로 기본은 false.
   */
  preferCursor?: boolean;
}

/** `sel:12-14` / `line:37` → 앵커. 형식이 아니면 null(후보에 넣지 않는다). */
export function parseAnchorKey(key: string | undefined): IRecipeAnchor | null {
  const sel = /^sel:(\d+)-(\d+)$/.exec(key ?? '');
  if (sel) {
    const start = Number(sel[1]);
    const end = Number(sel[2]);
    if (start > 0 && end >= start) {
      return { key: `sel:${start}-${end}`, line: start, endLine: end, label: `선택 영역 ${start}~${end}줄을 교체` };
    }
    return null;
  }
  const at = /^line:(\d+)$/.exec(key ?? '');
  if (at && Number(at[1]) > 0) {
    const n = Number(at[1]);
    return { key: `line:${n}`, line: n, endLine: null, label: `${n}줄 앞에 삽입` };
  }
  return null;
}

/** JSX 랜드마크 후보 상한 — 많으면 고르기 더 어렵다(칩 인라인 편집 한도와 같은 정신). */
const MAX_ANCHOR_CHOICES = 10;
/** 여는 JSX 태그 한 줄. 닫는 태그(`</`)·프래그먼트 종료는 앵커가 아니다. */
const OPEN_TAG_RE = /^\s*<([A-Za-z][\w.]*)/;

/**
 * 골격을 코드/JSX로 나눈다. **골격 맨 끝의 최상위(들여쓰기 0) 여는 태그부터 끝까지**가 JSX다 —
 * 레시피 골격은 관례적으로 "import → 훅 → 화면 조각" 순으로 쓰이고(내장 date-picker 카드도 그렇다),
 * 이 규칙은 눈으로 보고 따라 쓰기 쉬운 만큼 카드 작성자가 어기기도 어렵다.
 */
export function splitRecipeSkeleton(skeleton: string): IRecipeParts {
  const lines = skeleton.replace(/\r\n/g, '\n').split('\n');
  let jsxStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && OPEN_TAG_RE.test(line)) { jsxStart = i; break; }
  }
  const code = (jsxStart < 0 ? lines : lines.slice(0, jsxStart)).join('\n').replace(/\s+$/, '');
  const jsx = jsxStart < 0 ? '' : lines.slice(jsxStart).join('\n').replace(/\s+$/, '');
  const importCount = code.split('\n').filter((l) => /^\s*import\b/.test(l)).length;
  return { code, jsx, importCount };
}

/** 골격에 남은 `{{slot}}` 이름들 — 치환되지 않은 것만. */
function unresolvedSlots(filled: string): string[] {
  const out = new Set<string>();
  for (const m of filled.matchAll(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

function preview(text: string, max = 44): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * JSX를 넣어도 **되는** 줄 범위 = 컴포넌트가 그리는 화면(return JSX) 안. 못 찾으면 null.
 *
 * 왜 범위가 필요한가(실측 사고): 요청 시점 커서가 1줄(파일 맨 위 import 구역)이었는데 그대로
 * 앵커가 되어 화면 조각이 import 위에 박혔다. 채팅에 타이핑하는 동안 커서가 어디 있는지는
 * 사용자가 신경 쓰지 않으므로, **커서를 믿되 검증은 해야 한다** — 화면 밖은 언제나 오답이다.
 */
export interface IJsxRange {
  /** **삽입** 가능한 첫 줄 = 루트 여는 태그 다음(루트 앞에 넣으면 형제 루트가 둘이 된다). */
  from: number;
  /** 마지막 줄 = 루트 닫는 태그 줄(그 앞에 넣으면 마지막 자식). */
  to: number;
  /**
   * 루트 여는 태그 줄. **교체**는 여기서부터 허용된다 — 루트를 통째로 다른 요소로 바꾸는 건
   * 루트가 하나로 유지되므로 정당하다(삽입과 달리 형제가 늘지 않는다).
   */
  rootLine: number;
}

export function jsxInsertRange(source: string): IJsxRange | null {
  const comp = computeAnchors(source).component;
  if (!comp) return null;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const end = Math.min(comp.endLine, lines.length);
  const at = (n: number): string => (lines[n - 1] ?? '').trim();

  // ① return 위치 — 화면을 그리기 시작하는 곳.
  let searchFrom = comp.startLine + 1;
  for (let n = comp.startLine; n <= end; n++) {
    if (/\breturn\s*[(<]/.test(at(n))) { searchFrom = n; break; }
  }

  // ② 루트 요소의 여는 태그 줄. **루트 앞은 삽입 자리가 아니다** — 거기 넣으면 형제 루트가 둘이 되어
  //    JSX가 깨진다("adjacent JSX elements must be wrapped"). 자식으로만 들어갈 수 있다.
  let rootLine = -1;
  for (let n = searchFrom; n <= end; n++) {
    if (/^(?:return\s*\(?\s*)?<[A-Za-z>]/.test(at(n))) { rootLine = n; break; }
  }
  if (rootLine < 0) return null;

  // ③ 루트 여는 태그가 끝나는 줄(속성이 여러 줄일 수 있다).
  let openEnd = rootLine;
  while (openEnd <= end && !/>$/.test(at(openEnd))) openEnd++;
  if (openEnd > end) return null;
  if (/\/>$/.test(at(openEnd))) return null; // 자기닫힘 루트 — 자식을 넣을 수 없다

  // ④ 루트의 닫는 태그 줄. 그 **앞**까지가 자식 자리다(닫는 태그 뒤는 루트 밖).
  let closeLine = -1;
  for (let n = end; n > openEnd; n--) {
    if (/^<\/[A-Za-z>]/.test(at(n))) { closeLine = n; break; }
  }
  const from = openEnd + 1;
  const to = closeLine > 0 ? closeLine : end - 1;
  return from <= to ? { from, to, rootLine } : null;
}

/**
 * 매칭된 줄을 감싸는 **가장 안쪽 JSX 요소**의 범위를 잡는다.
 *
 * locate의 `snapToElement`는 여러 줄 자기닫힘 요소(`<Input\n  type="date"\n/>`)를 자기 단위로 보지 못하고
 * **부모 컨테이너까지 넓힌다**(실측). 모델이 그 블록을 재작성하는 온라인 경로에선 넓어도 되지만,
 * 여기서는 그 범위를 **통째로 교체**하므로 넓어지면 화면 전체가 날아간다 — 그래서 정밀 스냅이 필요하다.
 */
export function snapElement(lines: string[], line: number): { startLine: number; endLine: number } | null {
  const at = (n: number): string => (lines[n - 1] ?? '').trim();
  // ① 시작 = 위로 올라가며 만나는 첫 여는 태그(닫는 태그를 먼저 만나면 그 요소 밖이다).
  let start = -1;
  for (let n = line; n >= 1; n--) {
    const t = at(n);
    if (/^<\/[A-Za-z]/.test(t)) return null;
    if (/^<[A-Za-z]/.test(t)) { start = n; break; }
  }
  if (start < 0) return null;
  const tag = at(start).match(/^<([A-Za-z][\w.]*)/)?.[1];
  if (!tag) return null;
  const indent = (lines[start - 1].match(/^[ \t]*/) ?? [''])[0];

  // ② 여는 태그의 끝(속성이 여러 줄일 수 있다).
  let head = start;
  while (head <= lines.length && !/>$/.test(at(head))) head++;
  if (head > lines.length) return null;
  if (/\/>$/.test(at(head))) return { startLine: start, endLine: head }; // 자기닫힘(한 줄·여러 줄)

  // ③ 자식이 있는 요소 — 같은 들여쓰기의 닫는 태그까지.
  for (let n = head + 1; n <= lines.length; n++) {
    const raw = lines[n - 1] ?? '';
    if (raw.trim() === `</${tag}>` && (raw.match(/^[ \t]*/) ?? [''])[0] === indent) {
      return { startLine: start, endLine: n };
    }
  }
  return null;
}

/**
 * 요청 문장으로 **자리를 자동으로 찾는다**(모델 0회) — 온라인 영역 편집이 쓰는 locate 층 재사용.
 *
 * 왜: 커서를 손으로 맞추게 하는 건 "모델이 하던 위치 결정을 사람에게 넘긴다"의 과잉 적용이었다
 * (사용자 지적). 위치 찾기는 **이미 결정론으로 도는 층**이 있으므로, 사람에게는 *확인*만 남기면 된다
 * (§2 핵심 통찰: 결정론 층은 이미 모델 없이 돈다).
 *
 * 안전 규약 둘:
 *  - 찾은 자리는 **가장 안쪽 요소**로 좁힌다(`snapElement`) — 넓게 잡아 교체하면 화면이 날아간다.
 *  - **루트 요소는 자동 제안하지 않는다** — 그 교체는 화면 전체 삭제다. 사용자가 편집기에서 직접
 *    루트를 선택한 경우만 허용한다(그건 명시적 의사표시다).
 */
export function locateAnchors(
  source: string,
  query: string,
  mode: TRecipeMode,
  /** 카드가 선언한 대상 힌트(`action.target`) — 사용자 문장과 함께 넘긴다. */
  target?: string,
): IRecipeAnchor[] {
  // 카드 힌트 + 사용자 문장. 서로 다른 토큰이 많이 걸린 줄이 이기므로, 둘을 합치면
  // "무엇을(카드) 어디의(사용자 문장) 것"을 함께 만족하는 줄이 자연히 위로 온다.
  const q = [target ?? '', query].filter((s) => s.trim()).join(' ');
  if (!q.trim()) return [];
  const range = jsxInsertRange(source);
  if (!range) return [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  // 어휘는 locate와 공유하고(같은 브리지·불용어), **줄 스캔은 여기서** 한다.
  // locate 본체는 "모델이 재작성할 region"을 고르는 도구라 목표가 다르다: 그쪽 bestLine은 상태
  // 선언 줄로 가기도 하고(`const [hireDate…]`), 그쪽 snap은 부모까지 넓힌다. 우리에게 필요한 건
  // "갈아끼울 요소 하나"다(실측으로 확인된 차이).
  const tokens = locateTokens(q);
  if (tokens.length === 0) return [];
  // 점수는 **줄이 아니라 요소** 단위로 센다. 여러 줄에 걸친 컨트롤은 정체(`<Input`)와 근거
  // (`type="date"`)가 다른 줄에 있어서, 줄 단위로 세면 한 토큰밖에 못 얻어 옆의 평범한
  // `<input>`(같은 1점)에 밀린다(실측). 요소로 묶어 토큰을 합치면 진짜 대상이 이긴다.
  const byElement = new Map<string, { startLine: number; endLine: number; hits: Set<string> }>();
  for (let n = range.from; n <= Math.min(range.to, lines.length); n++) {
    const low = (lines[n - 1] ?? '').toLowerCase();
    // 서로 포함관계인 토큰(date/hiredate)은 같은 구간을 두 번 세지 않게 긴 쪽만 남긴다.
    const hits = tokens
      .filter((t) => low.includes(t))
      .filter((t, _i, arr) => !arr.some((o) => o !== t && o.includes(t)));
    if (hits.length === 0) continue;
    const span = snapElement(lines, n);
    if (!span || span.startLine < range.from) continue; // 루트(또는 그 바깥) — 자동 제안 금지
    const key = `${span.startLine}-${span.endLine}`;
    const entry = byElement.get(key) ?? { startLine: span.startLine, endLine: span.endLine, hits: new Set<string>() };
    for (const h of hits) entry.hits.add(h);
    byElement.set(key, entry);
  }

  const spans = [...byElement.values()]
    .sort((a, b) => b.hits.size - a.hits.size || a.startLine - b.startLine)
    .slice(0, 3)
    .map((e) => ({ startLine: e.startLine, endLine: e.endLine, hits: [...e.hits] }));

  const out: IRecipeAnchor[] = [];

  spans.forEach((span, i) => {
    // 근거는 **그 후보가 실제로 맞춘 토큰**이어야 한다(전체 공통이 아니라) — 근거가 부풀면
    // 왜 이 자리가 위인지 설명이 거짓이 된다(§3.6 원칙 3).
    const why = span.hits.length > 0 ? `(${span.hits.join('·')})` : '';
    const where = `${preview(lines[span.startLine - 1] ?? '')} · ${span.startLine}~${span.endLine}줄`;
    const replace: IRecipeAnchor = {
      key: `sel:${span.startLine}-${span.endLine}`,
      line: span.startLine,
      endLine: span.endLine,
      label: `요청과 맞는 자리${why}: ${where} 교체`,
    };
    const insert: IRecipeAnchor = {
      key: `line:${span.startLine}`,
      line: span.startLine,
      endLine: null,
      label: `요청과 맞는 자리${why}: ${where} 앞에 삽입`,
    };
    // 첫 후보만 양쪽(교체/삽입)을 실어 한 번의 클릭으로 방식을 바꿀 수 있게 하고,
    // 나머지는 카드가 선언한 방식만 — 목록이 길어지면 고르기 더 어렵다.
    if (i === 0) out.push(...(mode === 'replace' ? [replace, insert] : [insert, replace]));
    else out.push(mode === 'replace' ? replace : insert);
  });

  return out.filter((a) => isAnchorInJsx(a, range, lines.length));
}

/** 이 앵커가 화면(JSX) 안의 정당한 자리인가 — 삽입과 교체의 허용 경계가 다르다(§ IJsxRange). */
export function isAnchorInJsx(anchor: IRecipeAnchor, range: IJsxRange | null, lineCount: number): boolean {
  if (!range) return false;
  if (anchor.line > lineCount) return false;
  if (anchor.endLine === null) return anchor.line >= range.from && anchor.line <= range.to;
  return anchor.line >= range.rootLine && anchor.endLine <= range.to && anchor.endLine >= anchor.line;
}

/** 비교용 정규화 — 들여쓰기·줄바꿈 차이를 지운다("이미 들어있나" 판정에만 쓴다). */
function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 골격 중 **이 파일에 아직 없는 것**만 남긴 결과. 재실행을 멱등하게 만드는 계산. */
export interface IRecipeDedupe {
  /** 실제로 삽입할 코드(이미 있는 문장은 빠짐). */
  code: string;
  /** 실제로 삽입할 JSX. 이미 있으면 빈 문자열. */
  jsx: string;
  /** 이미 있어서 건너뛴 문장 수. */
  skippedStatements: number;
  /** 화면 조각이 이미 파일에 있는가. */
  jsxPresent: boolean;
  /** 넣을 것이 하나도 남지 않았는가(= 이미 전부 적용됨). */
  nothingToDo: boolean;
}

/**
 * 골격에서 **이미 파일에 있는 부분을 뺀다** — 같은 카드를 두 번 실행해도 중복이 쌓이지 않게.
 *
 * 왜 필요한가(실측): 첫 실행이 엉뚱한 자리에 넣어 다시 실행했더니, 이름 있는 선언(const·ref)은
 * `applyStructuralEdit`의 중복 선언 가드가 걸러줬지만 **익명 문장(useEffect)은 그대로 또 들어갔다**.
 * 이름이 없으면 기존 가드가 볼 것이 없으므로, 여기서 **문장 원문 대조**로 막는다.
 *
 * 계획(미리보기)과 적용이 같은 함수를 써야 "카드에 보이는 것 = 적용되는 것"이 유지된다.
 */
export function dedupeAgainstSource(source: string, parts: IRecipeParts): IRecipeDedupe {
  const flat = flatten(source);
  const kept: string[] = [];
  let skippedStatements = 0;
  for (const stmt of splitStatements(parts.code)) {
    const n = flatten(stmt);
    // 빈 줄·주석만 있는 조각은 판정 대상이 아니다(그대로 둔다 — 포맷 보존).
    if (!n || /^(?:\/\/|\/\*)/.test(n)) { kept.push(stmt); continue; }
    if (flat.includes(n)) { skippedStatements++; continue; }
    kept.push(stmt);
  }
  const code = kept.join('\n').trim() ? kept.join('\n') : '';
  const jsxPresent = !!parts.jsx.trim() && flat.includes(flatten(parts.jsx));
  const jsx = jsxPresent ? '' : parts.jsx;
  return {
    code,
    jsx,
    skippedStatements,
    jsxPresent,
    nothingToDo: !code.trim() && !jsx.trim(),
  };
}

/**
 * 화면(JSX) 범위 안의 여는 태그들을 삽입 위치 후보로 모은다.
 * 범위를 못 찾으면(컴포넌트 없음) 후보도 없다 — 아무 데나 넣느니 막고 사유를 말하는 편이 낫다.
 */
export function scanJsxAnchors(source: string, limit = MAX_ANCHOR_CHOICES): IRecipeAnchor[] {
  const range = jsxInsertRange(source);
  if (!range) return [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: IRecipeAnchor[] = [];
  for (let n = range.from; n <= Math.min(range.to, lines.length); n++) {
    const line = lines[n - 1];
    if (!OPEN_TAG_RE.test(line)) continue;
    out.push({ key: `line:${n}`, line: n, endLine: null, label: `${n}줄: ${preview(line)} 앞에 삽입` });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 계획을 만든다. 모델 호출 0회.
 * 막히면 `blocked`에 사람이 읽을 사유를 담는다 — 조용히 빈 카드를 주지 않는다(Phase 2와 같은 규약).
 */
export function buildRecipePlan(input: IRecipePlanInput): IRecipePlan {
  const { source, skeleton, values } = input;
  const targetFile = input.targetFile ?? null;
  const targetFileChoices = input.targetFileChoices ?? [];
  const filled = substituteSlots(skeleton, values);
  const parts = splitRecipeSkeleton(filled);
  const pendingSlots = unresolvedSlots(filled);
  const base = {
    targetFile,
    targetFileChoices,
    pendingSlots,
    importCount: parts.importCount,
    codeLines: parts.code.trim() ? parts.code.trim().split('\n').length : 0,
    jsxLines: parts.jsx.trim() ? parts.jsx.trim().split('\n').length : 0,
    preview: filled,
  };
  const blocked = (reason: string): IRecipePlan =>
    ({ ...base, blocked: reason, anchor: null, anchorChoices: [], notice: null });

  if (!skeleton.trim()) return blocked('이 카드에는 삽입할 골격이 없습니다(본문 코드펜스 누락).');
  if (!source.trim()) {
    return blocked(
      targetFile
        ? `대상 파일을 읽지 못했습니다: ${targetFile}`
        : '편집할 코드 파일을 찾지 못했습니다. 고칠 파일을 열어주세요.',
    );
  }

  const landmarks = scanJsxAnchors(source);
  const range = jsxInsertRange(source);
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  // 요청 문장으로 찾은 자리가 **최우선 후보**다 — 사용자가 커서를 맞춰 두지 않아도 되게.
  const located = locateAnchors(source, input.query ?? '', input.mode ?? 'insert', input.target);
  // 지금 고른 자리(요청 시점의 커서/선택이 최초값)를 후보 맨 앞에 둔다 — 사용자가 방금 보고 있던
  // 자리가 가장 좋은 기본값이다. 선택 영역 교체는 오직 이 경로로만 들어온다(랜드마크는 전부 삽입).
  // 단 **화면(JSX) 범위 밖이면 채택하지 않는다**: 채팅에 타이핑하는 동안 커서는 대개 아무 데나
  // 있고(실측: 1줄 = import 구역), 그대로 넣으면 컴파일이 깨진 채로 "계획대로" 적용된다.
  const pinnedRaw = parseAnchorKey(input.cursorAnchor);
  const pinned = pinnedRaw && isAnchorInJsx(pinnedRaw, range, lines.length) ? pinnedRaw : null;
  // 커서가 화면 밖이라 못 쓴 사실은 **대안이 없을 때만** 알린다 — 요청으로 찾은 자리가 있으면 잡음이다.
  const rejectedPin = pinnedRaw && !pinned && located.length === 0 ? pinnedRaw : null;

  // 순서 = ①요청으로 찾은 자리 ②요청 시점 커서/선택 ③화면 랜드마크.
  // ①이 있으면 그게 기본값이 된다 — 커서를 신경 쓰지 않아도 대개 맞는 자리가 이미 골라져 있다.
  const cursorChoice = pinned
    ? [
        pinned.endLine === null
          // 라벨에 그 줄의 코드를 함께 보여준다 — "1줄 앞에 삽입"만으로는 그게 import 구역인지 알 수 없다.
          ? { ...pinned, label: `커서 위치(${pinned.line}줄): ${preview(lines[pinned.line - 1] ?? '')} 앞에 삽입` }
          : pinned,
      ]
    : [];
  // 사용자가 카드를 보고 커서를 옮겼으면 그게 가장 최근의 의사표시다 — 자동 제안보다 앞에 둔다.
  const choices = input.preferCursor
    ? [...cursorChoice, ...located, ...landmarks]
    : [...located, ...cursorChoice, ...landmarks];
  // 같은 줄을 가리키는 중복 후보 제거(커서가 마침 랜드마크 줄인 경우).
  const seen = new Set<string>();
  const anchorChoices = choices.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));

  const hasJsx = parts.jsx.trim().length > 0;
  if (hasJsx && anchorChoices.length === 0) {
    return blocked(
      range
        ? 'JSX를 넣을 자리를 찾지 못했습니다. 넣고 싶은 줄에 커서를 두고 다시 요청해주세요.'
        : '이 파일에서 화면(JSX)을 그리는 컴포넌트를 찾지 못해 넣을 자리가 없습니다.',
    );
  }
  // 후보 밖 값은 기본값으로 되돌린다(엔드포인트 칩과 같은 규약 — 호스트가 진실의 원천).
  const anchor = hasJsx
    ? anchorChoices.find((c) => c.key === input.anchorChoice) ?? anchorChoices[0]
    : null;

  if (pendingSlots.length > 0) {
    return { ...blocked(`아직 정하지 않은 값이 있습니다: ${pendingSlots.join(', ')}`), anchor, anchorChoices };
  }
  if (!computeAnchors(source).component && parts.code.trim()) {
    return { ...blocked('컴포넌트 함수를 찾지 못해 훅·상수를 넣을 자리가 없습니다.'), anchor, anchorChoices };
  }

  // 이미 들어 있는 부분을 뺀다 — 재실행해도 중복이 쌓이지 않게(적용과 **같은 함수**를 쓴다).
  const dedupe = dedupeAgainstSource(source, parts);
  if (dedupe.nothingToDo) {
    return {
      ...blocked('이 골격은 이미 이 파일에 들어 있습니다 — 넣을 것이 없습니다.'),
      anchor, anchorChoices,
    };
  }

  // 안내는 "왜 이 자리인가"가 먼저다 — 커서를 물린 경우 그 사실을 모르면 엉뚱한 자리로 보인다.
  const notices: string[] = [];
  if (rejectedPin) {
    notices.push(
      `요청하신 시점의 커서(${rejectedPin.line}줄)는 화면(JSX) 밖이라 쓰지 않았습니다 — ` +
      '넣을 자리를 위치 칩에서 고르거나, 편집기에서 커서를 옮긴 뒤 `지금 커서 위치`를 선택하세요.',
    );
  }
  if (dedupe.skippedStatements > 0 || dedupe.jsxPresent) {
    const parts2 = [
      dedupe.skippedStatements > 0 ? `코드 ${dedupe.skippedStatements}문장` : '',
      dedupe.jsxPresent ? '화면 조각' : '',
    ].filter(Boolean).join(' · ');
    notices.push(`이미 파일에 있는 ${parts2}은 다시 넣지 않습니다(중복 방지).`);
  }
  if (anchor && anchor.endLine === null && !dedupe.jsxPresent && hasJsx) {
    // 삽입은 교체가 아니다 — 같은 일을 하던 기존 컨트롤이 있으면 둘 다 남는다. 카드가 먼저 말해준다.
    notices.push('삽입만 합니다 — 같은 역할의 기존 요소가 있으면 그 줄을 편집기에서 선택한 뒤 실행하면 교체됩니다.');
  }

  return {
    ...base,
    // 부품 요약은 **실제로 넣을 것**만 센다 — 이미 있는 것까지 세면 미리보기가 사실과 갈라진다.
    importCount: dedupe.code.split('\n').filter((l) => /^\s*import\b/.test(l)).length,
    codeLines: dedupe.code.trim() ? dedupe.code.trim().split('\n').length : 0,
    jsxLines: dedupe.jsx.trim() ? dedupe.jsx.trim().split('\n').length : 0,
    blocked: null,
    // 넣을 JSX가 없으면(이미 있음) 위치는 의미가 없다 — 칩을 비워 "고를 것 없음"을 정직하게 보인다.
    anchor: dedupe.jsx.trim() ? anchor : null,
    anchorChoices: dedupe.jsx.trim() ? anchorChoices : [],
    notice: notices.length > 0 ? notices.join(' ') : null,
  };
}

export interface IRecipeApplyInput {
  /** 적용 시점의 원문(계획을 세운 것과 같은 텍스트여야 한다). */
  source: string;
  plan: IRecipePlan;
  skeleton: string;
  values: Record<string, string>;
}

export interface IRecipeApplyResult {
  blocked: string | null;
  text: string | null;
  /** 사람이 읽을 적용 요약(확인 카드 안내문에 쓴다). */
  summary: string[];
}

/**
 * 골격이 쓰는 심볼 중 **import가 필요한 것**을 모은다 — React 훅 호출과 PascalCase JSX 태그.
 *
 * 카드 작성자가 `import`를 빠뜨려도(예: `useState`만 쓰고 import 안 씀) 삽입한 코드가 컴파일되게
 * 하려는 것이다. 해소는 기존 결정론 테이블(`resolveKnownImports`: react 훅 + `@axiom/components/ui`
 * 카탈로그)에 맡기고, 모르는 심볼은 그냥 무시된다(추측해서 경로를 지어내지 않는다).
 */
function importableSymbols(code: string, jsx: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/\b(use[A-Z]\w*)\s*[(<]/g)) out.add(m[1]);
  for (const text of [code, jsx]) {
    for (const m of text.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) out.add(m[1]);
  }
  return [...out];
}

/** JSX 블록을 앵커 줄의 들여쓰기에 맞춰 다시 들여쓴다(상대 들여쓰기는 보존). */
function reindent(block: string, indent: string): string[] {
  const lines = block.split('\n');
  return lines.map((l) => (l.trim() ? indent + l : l));
}

/**
 * 확정된 계획을 **결정론으로 적용**해 최종 파일 텍스트를 만든다(모델 0회).
 *
 * JSX를 먼저 줄 단위로 넣고(계획이 잡은 줄 번호는 원문 기준이므로 반드시 먼저),
 * 나머지 코드는 `applyStructuralEdit`에 맡긴다 — 앵커를 스스로 다시 계산하므로 줄 이동에 안전하고,
 * import hoist·type 모듈스코프 분리·중복 선언 드롭 같은 기존 계약을 그대로 물려받는다.
 */
export function buildRecipeApply(input: IRecipeApplyInput): IRecipeApplyResult {
  const { source, plan, skeleton, values } = input;
  const fail = (blocked: string): IRecipeApplyResult => ({ blocked, text: null, summary: [] });
  if (plan.blocked) return fail(plan.blocked);

  const filled = substituteSlots(skeleton, values);
  const full = splitRecipeSkeleton(filled);
  const summary: string[] = [];

  const hasCRLF = source.includes('\r\n');
  const norm = hasCRLF ? source.replace(/\r\n/g, '\n') : source;
  let working = norm;

  // 이미 들어 있는 부분을 뺀 뒤 넣는다 — 계획이 카드에 보여준 것과 **같은 계산**이다.
  // (이름 있는 선언은 applyStructuralEdit이 걸러주지만 익명 문장(useEffect)은 여기서만 막힌다.)
  const dedupe = dedupeAgainstSource(norm, full);
  if (dedupe.nothingToDo) return fail('이 골격은 이미 이 파일에 들어 있습니다 — 넣을 것이 없습니다.');
  const parts: IRecipeParts = {
    code: dedupe.code,
    jsx: dedupe.jsx,
    importCount: dedupe.code.split('\n').filter((l) => /^\s*import\b/.test(l)).length,
  };
  if (dedupe.skippedStatements > 0) summary.push(`이미 있는 코드 ${dedupe.skippedStatements}문장은 건너뜀`);
  if (dedupe.jsxPresent) summary.push('화면 조각은 이미 있어 건너뜀');

  if (parts.jsx.trim()) {
    const anchor = plan.anchor;
    if (!anchor) return fail('JSX를 넣을 자리가 정해지지 않았습니다.');
    const lines = norm.split('\n');
    if (anchor.line < 1 || anchor.line > lines.length) {
      return fail('삽입 위치가 파일 범위를 벗어났습니다. 파일이 바뀌었다면 다시 요청해주세요.');
    }
    // 계획이 어떻게 만들어졌든 **적용 직전에 한 번 더** 화면 범위를 확인한다. 이 가드가 없으면
    // import 구역에 화면 조각을 박아 넣는 적용이 "계획대로"라는 이름으로 통과한다(실측 사고).
    if (!isAnchorInJsx(anchor, jsxInsertRange(norm), lines.length)) {
      return fail(
        `삽입 위치(${anchor.line}줄)가 컴포넌트 화면(JSX) 밖입니다 — 위치 칩에서 화면 안의 자리를 골라주세요.`,
      );
    }
    const indent = lines[anchor.line - 1].match(/^[ \t]*/)?.[0] ?? '';
    const block = reindent(parts.jsx, indent);
    if (anchor.endLine !== null) {
      const end = Math.min(anchor.endLine, lines.length);
      lines.splice(anchor.line - 1, end - anchor.line + 1, ...block);
      summary.push(`${anchor.line}~${end}줄을 골격의 화면 조각으로 교체`);
    } else {
      lines.splice(anchor.line - 1, 0, ...block);
      summary.push(`${anchor.line}줄 앞에 화면 조각 ${block.length}줄 삽입`);
    }
    working = lines.join('\n');
  }

  // 골격이 빠뜨린 import(react 훅·UI 컴포넌트)는 결정론 테이블로 보강한다. 골격이 JSX뿐이어도
  // 이 단계는 돌아야 한다 — `<Calendar/>`만 넣고 import가 없으면 그대로 컴파일이 깨진다.
  // 심볼 수집은 **골격 전체**로 한다: 중복이라 안 넣은 부분이 쓰는 import도 파일엔 있어야 한다.
  const imports = resolveKnownImports(importableSymbols(full.code, full.jsx));
  if (parts.code.trim() || imports.length > 0) {
    const applied = applyStructuralEdit(working, {
      ...(parts.code.trim() ? { hookCode: parts.code } : {}),
      ...(imports.length > 0 ? { imports } : {}),
    });
    working = applied.text;
    if (parts.importCount > 0) summary.push(`import ${parts.importCount}건을 파일 상단에 병합`);
    const hookLines = parts.code.trim().split('\n').length - parts.importCount;
    if (hookLines > 0) summary.push(`훅·상수 ${hookLines}줄을 컴포넌트 본문에 삽입`);
  }

  if (working.trim() === norm.trim()) return fail('적용해도 바뀌는 내용이 없습니다.');
  return { blocked: null, text: hasCRLF ? working.replace(/\n/g, '\r\n') : working, summary };
}
