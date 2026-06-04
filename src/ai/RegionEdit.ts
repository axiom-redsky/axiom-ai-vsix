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
import { isCrossCutting, extractControlInventory, EDIT_INTENT_RE } from './RegionIntent';

/** locate 잡음 토큰 — 'api'가 useApi에, '박스/사용/적용' 등이 엉뚱한 줄에 걸려 위치를 빗나가게 한다. */
const LOCATE_STOP = new Set(['api', '박스', '사용', '적용', '현재', '화면', '해줘', '추가', 'box', '에서']);

/**
 * 한글/구어 구조어 → 코드(영문 컴포넌트·식별자) 토큰 브리지.
 *
 * locate의 grep은 `line.includes(token)` 부분일치라, 사용자가 쓰는 "셀렉트/테이블/검색"이
 * 영문 컴포넌트명(`Select`/`table`/`Search`)과 0매칭이 된다. 실제 컨트롤 줄(예:
 * `<SelectValue placeholder="재직상태 선택">`)은 한글 1토큰만 걸려 MIN_REGION_SCORE(2)를
 * 못 넘기고 full로 폴백한다(측정: anchor-comment/snap-failed 가짜 폴백의 주원인).
 * 한글 구조어를 그 줄에 실제로 있는 영문 토큰으로 확장해 점수를 메운다.
 *
 * ⚠ 값은 "분별력 있는" 토큰만. 짧거나 흔한 부분문자열은 오매칭을 부른다:
 *  - 'th'(←컬럼) → with/month 등에 걸림, 'tab'(←탭) → 'table'에 걸림, 'card'(←카드) → 'bg-card' 도배.
 *    → 이런 건 매핑하지 않는다(컬럼은 'table' 영역으로, 탭/카드는 보류).
 */
const QUERY_TOKEN_BRIDGE: Record<string, string[]> = {
  셀렉트: ['select'], 드롭다운: ['select'], 콤보박스: ['select'], 셀렉트박스: ['select'], 옵션: ['select'],
  테이블: ['table'], 컬럼: ['table'], 칼럼: ['table'],
  검색: ['search'],
  버튼: ['button'],
  입력: ['input'], 인풋: ['input'],
  필터: ['filter'],
  페이지: ['page'], 페이징: ['page'], 페이지네이션: ['page'],
  체크박스: ['checkbox'], 라디오: ['radio'], 스위치: ['switch'], 토글: ['switch'],
  뱃지: ['badge'], 배지: ['badge'],
  모달: ['dialog'], 다이얼로그: ['dialog'],
  정렬: ['sort'],
};

/**
 * locate용 토큰에 코드-인지 브리지 토큰을 보강한다(원본 토큰은 유지).
 * tokenizeQuery가 조사를 벗겨 어근을 주므로 키 정확일치가 보통이지만, 복합어
 * ("드롭다운메뉴")를 위해 `토큰이 키를 포함`도 인정한다. 중복은 Set으로 제거.
 */
function bridgeQueryTokens(tokens: string[]): string[] {
  const out = new Set<string>(tokens);
  for (const t of tokens) {
    for (const key in QUERY_TOKEN_BRIDGE) {
      if (t === key || t.includes(key)) {
        for (const mapped of QUERY_TOKEN_BRIDGE[key]) out.add(mapped);
      }
    }
  }
  return [...out];
}

export interface RegionSafety {
  ok: boolean;
  gate: 'anchor-missing' | 'anchor-comment' | 'anchor-import' | 'snap-failed' | 'cross-cutting' | 'ok';
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
  /**
   * 편집 영역이 참조하는 **모듈 스코프 const 선언**(grounding용, 없으면 ''). 예: region이 `grades.map(...)`을
   * 쓰면 `const grades = [...]`. depsHeader엔 top-level const가 안 담겨 약한 모델이 기존 옵션 배열을
   * 기억으로 재구성하다 항목을 흘린다(실측: '수석 추가'에 '사원' 누락). 실제 선언을 프롬프트에 주입해
   * faithful 수정(기존 항목 보존 + 추가)을 유도하고, 확장이 무손실 교체로 적용한다.
   */
  backingDecls: string;
  /**
   * region **밖**에 이미 있는 입력 컨트롤 1줄 인벤토리(B, 없으면 ''). depsHeader가 첫 return에서
   * 잘려 기존 select/input이 모델에 안 보이던 갭을 메운다 — 모델이 재생성(중복)하지 않게.
   */
  controlInventory: string;
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

/** 테이블 편집 의도 토큰. 컬럼 추가/정렬 등은 표 전체가 편집 단위라 per-line 점수로 도달 불가. */
const TABLE_INTENT = new Set(['테이블', '컬럼', '칼럼', '그리드']);

/**
 * 파일에 여는태그가 **정확히 하나뿐인** 요소의 경계를 결정론적으로 찾는다(구조 랜드마크 라우팅).
 *
 * "테이블에 컬럼 추가" 같은 요청은 `<table>` 여는 줄이 구조어 1토큰밖에 못 얻어 MIN_REGION_SCORE(2)를
 * 영원히 못 넘고, "투입 이력" 같은 한글이 탭·헤딩에도 있어 엉뚱한 곳에 스냅된다(측정 확증). 표가
 * 파일에 하나뿐이면 모호성이 없으므로 그 표로 직접 스냅한다. 0개·여러개면 모호 → null(건너뜀).
 */
function locateSoleElement(lines: string[], openRe: RegExp, closeRe: RegExp): { startLine: number; endLine: number } | null {
  const indentOf = (s: string): number => s.match(/^[ \t]*/)?.[0].length ?? 0;
  const opens: number[] = [];
  for (let i = 0; i < lines.length; i++) if (openRe.test(lines[i].trim())) opens.push(i);
  if (opens.length !== 1) return null; // 0개(없음) 또는 다수(모호) → 라우팅 안 함
  const o = opens[0];
  const ind = indentOf(lines[o]);
  for (let i = o + 1; i < lines.length; i++) {
    if (indentOf(lines[i]) === ind && closeRe.test(lines[i].trim())) {
      if (i - o > 200) return null; // 너무 큰 표 → region 부적합(full이 안전)
      return { startLine: o + 1, endLine: i + 1 };
    }
  }
  return null;
}

/**
 * 주어진 여는태그 줄에서 시작하는 요소의 경계를 찾는다(섹션-주석 랜드마킹 E용).
 * 자기닫힘(`<X .../>`)·한 줄 완결(`<X>…</X>`)·여러 줄(같은 들여쓰기의 `</X>`까지) 모두 처리.
 * 여는 JSX 태그가 아니거나 닫는 태그면 null.
 */
function snapBlockFrom(lines: string[], openIdx: number): { startLine: number; endLine: number } | null {
  const indentOf = (s: string): number => s.match(/^[ \t]*/)?.[0].length ?? 0;
  const t = lines[openIdx].trim();
  if (!/^<[A-Za-z]/.test(t) || /^<\//.test(t)) return null;
  if (/\/>\s*$/.test(t)) return { startLine: openIdx + 1, endLine: openIdx + 1 }; // 자기닫힘
  const tag = t.match(/^<([A-Za-z][A-Za-z0-9]*)/)?.[1];
  if (tag && new RegExp(`</${tag}>`).test(t)) return { startLine: openIdx + 1, endLine: openIdx + 1 }; // 한 줄 완결
  const ind = indentOf(lines[openIdx]);
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (indentOf(lines[i]) === ind && /^<\//.test(lines[i].trim())) {
      if (i - openIdx > 200) return null;
      return { startLine: openIdx + 1, endLine: i + 1 };
    }
  }
  return null;
}

/**
 * 매칭 토큰이 "JSX 콘텐츠"(텍스트 노드 또는 따옴표 문자열 속성값) 안에 있는지 판정한다(앵커 품질, B).
 *
 * 한글 도메인어(부서·투입률·철수예정)는 거의 항상 JSX 텍스트나 placeholder/label 같은 문자열
 * 속성에 들어 있다(영문 식별자가 아님). 이 토큰이 완결 요소로 스냅되면 1토큰이어도 고신뢰 앵커다.
 * 반대로 주석·bare 식별자 우연일치는 배제한다(따옴표/JSX 텍스트 바깥이면 false).
 */
function isContentAnchor(lineLower: string, token: string): boolean {
  const i = lineLower.indexOf(token);
  if (i < 0) return false;
  const before = lineLower.slice(0, i);
  const inDquote = (before.split('"').length - 1) % 2 === 1;
  const inSquote = (before.split("'").length - 1) % 2 === 1;
  // JSX 텍스트 영역: 토큰 직전에 닫힌 '>'가 열린 '<'보다 뒤 (= 태그 바깥의 텍스트 노드)
  const inJsxText = before.lastIndexOf('>') > before.lastIndexOf('<');
  return inDquote || inSquote || inJsxText;
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
  const baseTokens = tokenizeQuery(query)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2 && !LOCATE_STOP.has(t));
  // 한글 구조어 → 영문 컴포넌트 토큰 브리지(locate 한정). 한글 질문어가 영문 컴포넌트명과
  // 0매칭이라 실제 컨트롤 줄이 점수를 못 얻던 가짜 폴백을 메운다.
  const tokens = bridgeQueryTokens(baseTokens);

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

  // ②.5 구조 랜드마크 라우팅 — "테이블/컬럼" 의도인데 표 여는 줄이 2점을 못 얻거나(가짜 폴백),
  //     "투입 이력"이 탭·헤딩에 걸려 표 밖에 스냅됐을 때, 파일에 표가 하나뿐이면 그 표로 교정한다.
  //     (chosen이 이미 표 안이면 더 구체적 하위 타깃이므로 유지.)
  if (tokens.some((t) => TABLE_INTENT.has(t))) {
    const tbl = locateSoleElement(lines, /^<(table|Table)\b/, /^<\/(table|Table)>/);
    if (tbl) {
      const insideTable = chosen && chosen.line >= tbl.startLine && chosen.line <= tbl.endLine;
      if (!insideTable) {
        chosen = { line: tbl.startLine, score: 1, hit: ['table'] };
        chosenSnap = tbl;
      }
    }
  }

  // ②.7 앵커 품질 스코어링(B) — ≥2 "양" 기준 대신 "위치 품질". 도메인어가 JSX 콘텐츠(텍스트/문자열)
  //     에 있고 완결 요소로 스냅되면 1토큰이어도 인정한다. 단 그런 후보가 여러 요소로 흩어지면
  //     모호하므로 그대로 full에 둔다(같은 요소로 모이면 그 요소가 명확한 타깃). 컴포넌트 이름을
  //     몰라도 화면 한글로 임의 요소를 가리킬 수 있게 해 롱테일(Select/table 밖)을 커버한다.
  if (!chosen) {
    const qual: { line: number; snap: { startLine: number; endLine: number }; hit: string[] }[] = [];
    for (const cand of scored) {
      const ln = lines[cand.line - 1] ?? '';
      if (isCommentOrImport(ln)) continue;
      const low = ln.toLowerCase();
      if (!cand.hit.some((t) => isContentAnchor(low, t))) continue;
      const s = snapToElement(lines, cand.line);
      if (s) qual.push({ line: cand.line, snap: s, hit: cand.hit });
    }
    if (qual.length > 0) {
      const key = (q: { snap: { startLine: number; endLine: number } }): string => `${q.snap.startLine}-${q.snap.endLine}`;
      const k0 = key(qual[0]);
      if (qual.every((q) => key(q) === k0)) {
        chosen = { line: qual[0].line, score: Math.max(1, qual[0].hit.length), hit: qual[0].hit };
        chosenSnap = qual[0].snap;
      }
    }
  }

  // ②.8 섹션-주석 랜드마킹(E) — `{/* 직원 요약 카드 */}` 같은 사람-작성 섹션 라벨이 질문어와 맞으면
  //     노이즈로 버리지 말고 그 주석이 **바로 다음 줄에 가리키는 요소**로 스냅한다. scaffold/퍼블리싱
  //     코드는 섹션 주석이 도배돼 있어, 이를 랜드마크로 쓰면 주석이 앵커를 훔치던 폴백이 정위치로 바뀐다.
  if (!chosen) {
    const commentCands = scored.filter((c) => /^\{?\s*\/\*|^\/\//.test((lines[c.line - 1] ?? '').trim()));
    for (const c of commentCands) {
      // 주석 바로 다음(최대 2줄 내) 첫 여는 JSX 요소를 그 주석이 라벨하는 섹션으로 본다.
      let openIdx = -1;
      for (let i = c.line; i <= Math.min(c.line + 1, lines.length - 1); i++) {
        const t = (lines[i] ?? '').trim();
        if (/^<[A-Za-z]/.test(t) && !/^<\//.test(t)) { openIdx = i; break; }
      }
      if (openIdx < 0) continue;
      const s = snapBlockFrom(lines, openIdx);
      // 앵커 줄은 주석이 아니라 가리켜진 요소 줄로 보고한다(게이트가 주석으로 오인해 거부하지 않게).
      // 매칭 토큰(hit)은 주석에서 왔지만 편집 앵커는 그 섹션 요소다.
      if (s) { chosen = { line: openIdx + 1, score: c.score, hit: c.hit }; chosenSnap = s; break; }
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

  // ③.5 grounding — 편집 영역이 참조하는 모듈 스코프 const 선언을 모은다(이름이 region에 등장하는 것만).
  //      depsHeader엔 top-level const가 없어, 모델이 기존 옵션 배열을 기억으로 재구성하다 항목을 흘린다
  //      (실측: 직급 select '수석 추가'에 기존 '사원' 누락). 실제 선언을 주입해 faithful 수정을 유도한다.
  const backingParts: string[] = [];
  for (const s of sections) {
    if (s.kind !== 'const') continue;
    const esc = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\b`).test(region)) backingParts.push(s.body);
  }
  const backingDecls = backingParts.join('\n');

  // ③.7 컨트롤 인벤토리(B) — region 밖 기존 입력 컨트롤. 모델 재생성(중복) 방지용.
  const controlInventory = snap ? extractControlInventory(source, startLine, endLine) : '';

  // 서버 params 필터 가능 여부 — 편집의도 + 컴포넌트가 useApi(params)로 서버 조회 중.
  // 이때 다중지점이어도 B(인벤토리)+C(<replace> params 보강)로 region 경로에서 성공시킨다.
  const hasServerParamsFilter = EDIT_INTENT_RE.test(query) && /useApi/.test(depsHeader) && /\bparams\s*:/.test(depsHeader);

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
  } else if (isCrossCutting(query, firstJsxTag(region), region) && !hasServerParamsFilter) {
    // 다중지점(필터/정렬/연동) — 편집의도 + region 루트가 큰 컨테이너 + 지목 컨트롤이 region 밖.
    // **서버 params 필터가 가능하면(B+C 경로)** 통과시킨다: 인벤토리로 기존 컨트롤 재생성을 막고,
    // <replace>로 useApi params를 보강해 region 경로에서 성공시킨다. 서버 params가 없으면(클라만)
    // 단일 region이 표현 못 하므로 종전대로 full 폴백.
    safety = { ok: false, gate: 'cross-cutting', reason: `다중지점 편집 의도(서버 params 없음) — region 루트 <${firstJsxTag(region)}>(${startLine}~${endLine}) 컨테이너 + 지목 컨트롤 영역 밖. 단일 region 표현 불가 → full 폴백.` };
  } else {
    safety = { ok: true, gate: 'ok', reason: `코드줄 앵커(${bestLine}줄, 점수 ${bestScore}) + 완결 JSX 요소 스냅(${startLine}~${endLine}) — region/hybrid 안전.` };
  }

  return { lines, bestLine, bestScore, matched: [...matched], startLine, endLine, region, depsHeader, backingDecls, controlInventory, safety };
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
