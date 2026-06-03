/**
 * 영역(region) 편집의 위치결정 + 안전 게이트.
 *
 * "약한 sLLM에게 라인 번호를 묻지 않고, 확장이 결정론적으로 편집 영역을 찾아 모델에 주고,
 *  모델이 그 블록만 재작성하면 확장이 위치 교체(splice)한다"는 전략의 위치결정 레이어다.
 * 슬라이싱 실험 패널(SliceProbeProvider)에서 견고성 매핑으로 실측·검증한 로직을 본체가
 * 재사용할 수 있도록 분리했다.
 *
 * 외부 의존성 0 (폐쇄망) — splitTsSections + tokenizeQuery + 들여쓰기 기반 스냅만 사용.
 *
 * 핵심 안전 불변식(견고성 매핑 결과):
 *  - locate가 빗나가면(주석/import 앵커·스냅 실패) splice가 엉뚱한 위치를 덮어써 "조용한 파일 파손"이
 *    난다 → `safety.ok=false`로 표시해 호출부가 full 입력으로 폴백하게 한다.
 *  - snap은 "뭔가 반환"이 아니라 "올바른 편집 단위(완결 컴포넌트 요소)"를 잡아야 한다(Fix 1).
 *  - 모델이 영역 밖을 재작성하면(루트 태그 변화) splice가 프랑켄 머지를 만든다 →
 *    splice 전 root-tag 일치를 확인한다(Fix 2: checkRegionRootTag).
 */
import { splitTsSections } from './CodeSectionExtractor';
import { tokenizeQuery } from './SectionExtractor';

/** locate 잡음 토큰 — 'api'가 useApi에, '박스/사용/적용' 등이 엉뚱한 줄에 걸려 위치를 빗나가게 한다. */
const LOCATE_STOP = new Set(['api', '박스', '사용', '적용', '현재', '화면', '해줘', '추가', 'box', '에서']);

export interface RegionSafety {
  ok: boolean;
  gate: 'anchor-missing' | 'anchor-comment' | 'anchor-import' | 'snap-failed' | 'ok';
  reason: string;
}

export interface LocatedRegion {
  /** 원본을 \n으로 split한 라인 배열(splice에 재사용) */
  lines: string[];
  /** grep 최고 매칭 라인(1-based) */
  bestLine: number;
  /** 최고 매칭 점수(매칭된 distinct 토큰 수) */
  bestScore: number;
  /** 매칭된 토큰들 */
  matched: string[];
  /** 편집 영역 시작 라인(1-based, 포함) */
  startLine: number;
  /** 편집 영역 끝 라인(1-based, 포함) */
  endLine: number;
  /** 편집 영역 텍스트 */
  region: string;
  /** 의존성 헤더(import·타입·컴포넌트 훅 선언부) — 읽기 전용 참고용 */
  depsHeader: string;
  /** region/hybrid splice 안전 판정 — ok=false면 full 입력으로 폴백 */
  safety: RegionSafety;
}

/** 문자열에서 첫 JSX 여는 태그 이름을 뽑는다(루트 태그 일치 후처리 게이트용). */
export function firstJsxTag(s: string): string | null {
  return s.match(/<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
}

/**
 * 매칭 줄을 감싸는 "완결 JSX 요소"의 경계를 들여쓰기 기반으로 찾는다(Fix 1).
 *
 * 규칙: **부모가 컴포넌트(PascalCase)면 한 단계 더 올라간다**(SelectValue→SelectTrigger→Select).
 * 부모가 소문자 DOM/레이아웃 태그(<div> 등)이거나 더 없으면 현재 요소가 "독립 컨트롤"이므로 멈춘다.
 * (서브파트 조각으로 스냅돼 모델이 영역 밖을 재작성하고 splice가 깨지던 버그를 막는다.)
 * 못 찾으면 null(호출부가 ±윈도우로 폴백).
 */
export function snapToElement(lines: string[], bestLine: number): { startLine: number; endLine: number } | null {
  const indentOf = (s: string): number => (s.match(/^[ \t]*/)?.[0].length ?? 0);
  const tagName = (s: string): string | null => s.trim().match(/^<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
  // 들여쓰기가 `indent`보다 얕은 가장 가까운 위쪽 "여는" JSX 태그(자기닫힘·닫는태그 제외)의 0-based 인덱스.
  const findOpenAbove = (fromIdx: number, indent: number): number => {
    for (let i = fromIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (indentOf(lines[i]) < indent && /^<[A-Za-z]/.test(t) && !/^<\//.test(t) && !/\/>\s*$/.test(t)) return i;
    }
    return -1;
  };

  const i0 = bestLine - 1;
  if (i0 < 0 || i0 >= lines.length) return null;

  let curLine = i0;
  let curIndent = indentOf(lines[i0]);
  let result: { startLine: number; endLine: number } | null = null;

  for (let climb = 0; climb < 6; climb++) {
    const open = findOpenAbove(curLine, curIndent);
    if (open < 0) break;
    const openIndent = indentOf(lines[open]);

    // 아래로: 같은 들여쓰기의 닫는 태그
    let close = -1;
    for (let i = open + 1; i < lines.length; i++) {
      if (indentOf(lines[i]) === openIndent && /^<\//.test(lines[i].trim())) {
        close = i;
        break;
      }
    }
    if (close < 0) break;
    if (close - open > 120) break; // 너무 큰 요소면 직전 결과 유지

    result = { startLine: open + 1, endLine: close + 1 };

    const parent = findOpenAbove(open, openIndent);
    const parentTag = parent >= 0 ? tagName(lines[parent]) : null;
    if (parentTag && /^[A-Z]/.test(parentTag)) {
      curLine = open;
      curIndent = openIndent;
      continue;
    }
    break;
  }
  return result;
}

/**
 * 질문 토큰으로 편집 영역을 찾고(grep→스냅), 의존성 헤더를 추출하고, splice 안전성을 판정한다.
 *
 * ① grep — 잡음 토큰 제거 후, 토큰 매칭 점수가 가장 높은 라인을 편집 중심으로 잡는다.
 * ② 스냅 — 매칭 줄을 감싸는 완결 JSX 요소(snapToElement). 실패 시 ±윈도우 폴백.
 * ③ 의존성 헤더 — import + 타입/인터페이스 + 컴포넌트 훅/state 선언부(첫 return 전까지).
 * ④ 안전 게이트 — anchor-missing(점수0)·anchor-comment·anchor-import·snap-failed.
 */
export function locateEditRegion(source: string, query: string): LocatedRegion {
  const lines = source.split('\n');
  const tokens = tokenizeQuery(query)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2 && !LOCATE_STOP.has(t));

  // ① grep — 모든 줄을 점수화해 후보 목록을 만든다.
  //   (단일 최고점 줄 하나만 잡으면, 토큰을 우연히 가진 비-JSX 줄 — 상태/라벨 `const`, 주석 — 에
  //    걸려 실제 <Select>를 놓치고 snap 실패→full 폴백→약한 모델 환각으로 번진다. 실측 재현됨.)
  // 한 줄 안에서 서로 substring인 토큰은 같은 텍스트 구간을 이중집계한다(예: rename "department→dept"
  // 에서 코드 `departmentName`은 'department'와 'dept'에 모두 걸려 점수 2가 됨 → 단일 control 편집으로 오인).
  // 더 긴 토큰에 포함되는 짧은 토큰을 떨궈 한 번만 센다.
  const dedupeSubstrings = (arr: string[]): string[] =>
    arr.filter((t) => !arr.some((o) => o !== t && o.includes(t)));

  const scored: { line: number; score: number; hit: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    const hit = dedupeSubstrings(tokens.filter((t) => low.includes(t)));
    if (hit.length > 0) scored.push({ line: i + 1, score: hit.length, hit });
  }
  scored.sort((a, b) => b.score - a.score || a.line - b.line); // 점수 내림차순, 동점이면 위쪽 우선

  const isCommentOrImport = (s: string): boolean =>
    /^\/\/|^\/\*|^\*/.test(s.trim()) || /^import\b/.test(s.trim());

  // region 채택 최소 점수. 단일 토큰 우연 일치(예: "검색"이 Input placeholder에, "department"가 한 셀에)는
  // region이 엉뚱한 JSX 요소를 잡게 만든다 → 서로 다른 질문 토큰이 2개 이상 모이는 줄만 region 대상으로 본다.
  const MIN_REGION_SCORE = 2;

  // ② 위치 결정: 점수 높은 후보부터 "완결 JSX 요소로 스냅되는" 첫 후보를 채택한다(score>=2 한정).
  //    스냅되는 후보 = 구조적으로 안전하게 region splice 가능한 지점. 주석/import 후보는 건너뛴다.
  let chosen: { line: number; score: number; hit: string[] } | null = null;
  let chosenSnap: { startLine: number; endLine: number } | null = null;
  for (const cand of scored) {
    if (cand.score < MIN_REGION_SCORE) break; // 정렬돼 있으므로 이후는 모두 더 낮음
    if (isCommentOrImport(lines[cand.line - 1] ?? '')) continue;
    const s = snapToElement(lines, cand.line);
    if (s) {
      chosen = cand;
      chosenSnap = s;
      break;
    }
  }

  // 스냅되는 후보가 없으면 최고점 줄을 그대로 써서(원래 동작) 안전 게이트가 적절히 차단하게 둔다.
  const top = scored[0] ?? null;
  const bestLine = chosen?.line ?? top?.line ?? 1;
  const bestScore = chosen?.score ?? top?.score ?? 0;
  const matched = new Set<string>(chosen?.hit ?? top?.hit ?? []);

  const snap = chosenSnap; // 채택 후보의 스냅(없으면 null → 게이트가 snap-failed/anchor-* 로 차단)
  const startLine = snap ? snap.startLine : Math.max(1, bestLine - 3);
  const endLine = snap ? snap.endLine : Math.min(lines.length, bestLine + 15);
  const region = lines.slice(startLine - 1, endLine).join('\n');

  // ③ 의존성 헤더
  const sections = splitTsSections(source);
  const headerParts: string[] = [];
  for (const s of sections) {
    if (s.kind === 'import' || s.kind === 'type' || s.kind === 'interface') headerParts.push(s.body);
  }
  const comp = sections.find((s) => s.kind === 'function' && /^export\s+default\b/.test(s.body.trimStart()));
  if (comp) {
    const compLines = lines.slice(comp.startLine - 1, comp.endLine);
    const retIdx = compLines.findIndex((l) => /^\s*return\s*\(/.test(l));
    const hookBlock = (retIdx >= 0 ? compLines.slice(0, retIdx) : compLines.slice(0, 30)).join('\n');
    headerParts.push(`// [컴포넌트 선언부 — 기존 훅/state/import 참고용. 새 코드가 이들과 충돌·중복되지 않게]\n${hookBlock}`);
  }
  const depsHeader = headerParts.join('\n\n');

  // ④ 안전 게이트
  const hitLine = (lines[bestLine - 1] ?? '').trim();
  let safety: RegionSafety;
  if (bestScore <= 0) {
    safety = { ok: false, gate: 'anchor-missing', reason: `grep 점수 0 — 질문 토큰이 파일에 없음(앵커 부재). splice 시 ${bestLine}줄(보통 import)로 추락해 파일 파손 위험.` };
  } else if (/^\/\/|^\/\*|^\*/.test(hitLine)) {
    safety = { ok: false, gate: 'anchor-comment', reason: `최고 매칭(${bestLine}줄)이 주석 — 코드 앵커가 아닌 우연 일치.` };
  } else if (/^import\b/.test(hitLine)) {
    safety = { ok: false, gate: 'anchor-import', reason: `최고 매칭(${bestLine}줄)이 import 라인 — 편집 영역으로 부적합.` };
  } else if (!snap) {
    safety = { ok: false, gate: 'snap-failed', reason: `완결 JSX 요소 스냅 실패 → ±윈도우(${startLine}~${endLine})는 균형 블록이 아님. 모델 재작성 splice 시 구조 파손 위험.` };
  } else {
    safety = { ok: true, gate: 'ok', reason: `코드줄 앵커(${bestLine}줄, 점수 ${bestScore}) + 완결 JSX 요소 스냅(${startLine}~${endLine}) — region/hybrid 안전.` };
  }

  return { lines, bestLine, bestScore, matched: [...matched], startLine, endLine, region, depsHeader, safety };
}

/**
 * 후처리 root-tag 게이트(Fix 2): 모델이 편집 영역 밖을 재작성했는지 검사한다.
 * 원본 영역의 첫 JSX 태그 ≠ 모델 출력의 첫 태그면(예: <SelectTrigger> → <Select>) splice 시
 * 중첩/고아 요소로 프랑켄 머지가 난다 → false 반환(호출부가 splice 거부, full 폴백).
 *
 * @returns true = splice 안전, false = 거부(영역 밖 재작성)
 */
export function checkRegionRootTag(originalRegion: string, modelOutput: string): { ok: boolean; origTag: string | null; outTag: string | null } {
  const origTag = firstJsxTag(originalRegion);
  const outTag = modelOutput.trim() ? firstJsxTag(modelOutput) : null;
  // 둘 다 JSX 태그를 가질 때만 비교한다(한쪽이 순수 로직이면 검사 보류 → ok).
  const ok = !(origTag && outTag && origTag !== outTag);
  return { ok, origTag, outTag };
}
