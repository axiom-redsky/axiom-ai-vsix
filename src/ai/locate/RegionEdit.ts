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
import { splitTsSections } from '../decompose/CodeSectionExtractor';
import { tokenizeQuery } from '../decompose/SectionExtractor';
import { isCrossCutting, extractControlInventory, EDIT_INTENT_RE, mappedListVars, impliedControlTags } from '../decompose/RegionIntent';

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

/**
 * 도메인 복합명사 접미사 — 화면 섹션 라벨에 흔히 붙는 꼬리말. 어근을 분리하는 데 쓴다.
 * 조사(KOREAN_JOSA)와 같은 휴리스틱이지만 "명사+꼬리말" 복합어 전용이다.
 */
const DOMAIN_SUFFIXES = ['관리', '현황', '목록', '리스트', '이력', '내역', '정보', '상태', '대장', '조회', '등록'];

/**
 * 복합 도메인어를 어근으로 분해해 토큰을 보강한다(원본 토큰 유지). god component 에서 발견된 핵심 결함:
 * "예산관리"가 tokenizeQuery 에서 한 덩어리로 나와, 섹션 내 앵커(placeholder "예산 상태 선택", value/state)에
 * "예산"만 있는데 "예산관리"로는 0매칭 → 그 섹션이 점수를 못 얻고 전 섹션이 generic 토큰(select+상태)으로
 * 동점 → 파일 맨 위 섹션으로 추락(실측 1/64). 어근 "예산"을 더하면 그 섹션의 앵커가 점수를 얻어 동점을 깬다.
 * (접미사 "관리"가 모든 섹션 주석/타이틀에 있어도 그건 comment/title 라인이라 control 후보 점수에 안 섞인다.)
 */
function decomposeDomainCompounds(tokens: string[]): string[] {
  const out = new Set<string>(tokens);
  for (const t of tokens) {
    for (const suf of DOMAIN_SUFFIXES) {
      if (t.length > suf.length + 1 && t.endsWith(suf)) {
        out.add(t.slice(0, -suf.length)); // 어근 길이 ≥2 (위 조건이 보장)
        break; // 가장 먼저 맞는 접미사 하나만
      }
    }
  }
  return [...out];
}

export interface RegionSafety {
  ok: boolean;
  gate: 'anchor-missing' | 'anchor-comment' | 'anchor-import' | 'snap-failed' | 'cross-cutting' | 'handler-body' | 'ambiguous' | 'ok';
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
  /**
   * gate==='ambiguous' 일 때만 채워지는 후보 섹션 라벨들(없으면 빈 배열). 호출부가 "어느 구역인가요?"
   * 되묻기에 쓴다 — 사용자가 라벨을 넣어 재요청하면 복합어 분해로 정확히 라우팅된다.
   */
  ambiguousCandidates: string[];
  /**
   * 질문 토큰을 가진 상위 후보들을 완결 요소로 snap한 **distinct 영역 목록**(모델 객관식 disambiguation용).
   * 결정론 휴리스틱이 우선순위를 보편적으로 알 수 없으므로(예: '입사일' vs 흔한 'input'), 호출부가 이
   * 후보들을 모델에 객관식으로 제시해 의미적으로 고르게 한다. 라벨은 사람/모델이 읽을 영역 식별자.
   */
  candidates: RegionCandidate[];
}

/** 모델 객관식 disambiguation에 제시할 편집 영역 후보. */
export interface RegionCandidate {
  /** 1-based, 포함 */
  startLine: number;
  /** 1-based, 포함 */
  endLine: number;
  /** 사람/모델이 읽을 영역 라벨(필드 라벨 텍스트 우선, 없으면 섹션 라벨/첫 줄). */
  label: string;
  /** 그 영역을 대표한 후보 줄의 grep 점수(참고용). */
  score: number;
}

/** 문자열에서 첫 JSX 여는 태그 이름을 뽑는다(루트 태그 일치 후처리 게이트용). */
export function firstJsxTag(s: string): string | null {
  return s.match(/<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
}

/**
 * 주어진 줄 위쪽(최대 60줄)에서 사람이 읽을 **섹션 랜드마크** 라벨을 찾는다(모호 되물음용).
 * 우선순위: CardTitle → 헤딩(h1~6) → PageHeader title → JSX 섹션 주석(중괄호로 감싼 블록주석).
 * 타입/훅 코드 주석·파일 헤더는 섹션 라벨이 아니므로 제외(되물음에 쓰레기 라벨 방지). 못 찾으면 null.
 */
function sectionLabelAbove(lines: string[], fromLine1Based: number): string | null {
  for (let i = fromLine1Based - 1; i >= 0 && i >= fromLine1Based - 60; i--) {
    const t = (lines[i] ?? '').trim();
    let m = t.match(/<CardTitle[^>]*>([^<{]+)<\/CardTitle>/);
    if (m && m[1].trim()) return m[1].trim();
    m = t.match(/<h[1-6][^>]*>([^<{]+)<\/h[1-6]>/);
    if (m && m[1].trim()) return m[1].trim();
    if (/(?:PageHeader|Header)/.test(t)) {
      m = t.match(/title="([^"]+)"/);
      if (m && m[1].trim()) return m[1].trim();
    }
    // JSX 섹션 주석만(`{/* … */}`). 코드 주석(`//`·`/** */`)은 타입/훅 설명이라 섹션 라벨이 아님.
    if (/^\{\s*\/\*/.test(t)) {
      const inner = t
        .replace(/^\{\s*\/\*+/, '')
        .replace(/\*+\/\s*\}$/, '')
        .replace(/=+/g, ' ')
        .replace(/섹션\s*\d+\s*[:：]?/g, '')
        .trim();
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * 후보 영역의 사람/모델 친화 라벨을 뽑는다(객관식 disambiguation용).
 * 우선순위: 영역 내 `<label>텍스트</label>` → 영역 내 첫 JSX 텍스트 노드 → 위쪽 섹션 라벨 → 첫 줄.
 * 필드 라벨(이름·입사일 등)을 우선해, 모델이 질문어와 매칭해 정확히 고를 수 있게 한다.
 */
function regionLabel(lines: string[], snap: { startLine: number; endLine: number }): string {
  const body = lines.slice(snap.startLine - 1, snap.endLine);
  const clean = (s: string): string => s.trim().replace(/\s*\*\s*$/, '').trim();
  // 1) 영역 안 <label>텍스트</label> (필드 라벨)
  for (const ln of body) {
    const m = ln.match(/<label[^>]*>([^<{][^<]*)<\/label>/);
    if (m && m[1].trim()) return clean(m[1]);
  }
  // 2) 영역 **바로 위 형제 <label>** — `<label>부서</label><Select>…` 패턴(스냅이 컨트롤 자체일 때).
  //    이게 없으면 Select가 첫 옵션 텍스트("개발팀"·"전체")로 잘못 라벨링돼 모델이 못 고른다.
  for (let i = snap.startLine - 2; i >= 0 && i >= snap.startLine - 4; i--) {
    const m = (lines[i] ?? '').match(/<label[^>]*>([^<{][^<]*)<\/label>/);
    if (m && m[1].trim()) return clean(m[1]);
  }
  // 3) 섹션 라벨(주석/헤딩/PageHeader) — 옵션 텍스트보다 우선(예: `{/* 재직상태 필터 */}`).
  const sec = sectionLabelAbove(lines, snap.startLine);
  if (sec) return sec;
  // 4) 영역 안 첫 JSX 텍스트(최후 — 옵션 텍스트라도 없는 것보단 낫다).
  for (const ln of body) {
    const m = ln.match(/>\s*([^<>{}\n][^<>{}]*?)\s*</);
    if (m && /[가-힣A-Za-z]/.test(m[1]) && m[1].trim().length > 1) return m[1].trim();
  }
  return (body[0] ?? '').trim().slice(0, 40);
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
 * 앵커 줄이 속한 **같은 섹션** 안의 `<table>` 로 경계를 찾는다(테이블 의도 교정용).
 *
 * "테이블에 연락처 컬럼 추가"에서 새 컬럼명("연락처")이 같은 섹션의 다른 요소(상세 카드 필드 등)에
 * 우연히 매칭돼 표가 아닌 곳에 앵커되는 미스라우팅을 바로잡는다. 섹션 경계는 JSX 섹션 주석(중괄호로
 * 감싼 블록주석)으로 잡고, 그 안에서 앵커에 **가장 가까운** 표로 스냅한다(다중 표 파일 오선택 방지).
 * 섹션 주석이 없으면 파일 전체에서 가장 가까운 표(단일 컴포넌트·단일 표 케이스 커버).
 */
function findTableInSection(lines: string[], anchorLine: number): { startLine: number; endLine: number } | null {
  const isSectionComment = (s: string): boolean => /^\{\s*\/\*/.test(s.trim());
  let lo = 0;
  let hi = lines.length;
  for (let i = anchorLine - 2; i >= 0; i--) if (isSectionComment(lines[i])) { lo = i; break; }
  for (let i = anchorLine; i < lines.length; i++) if (isSectionComment(lines[i])) { hi = i; break; }
  let best = -1;
  let bestDist = Infinity;
  for (let i = lo; i < hi; i++) {
    if (/^<(table|Table)\b/.test(lines[i].trim())) {
      const d = Math.abs(i - (anchorLine - 1));
      if (d < bestDist) { bestDist = d; best = i; }
    }
  }
  return best >= 0 ? snapBlockFrom(lines, best) : null;
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
 * depsHeader 가지치기를 켜는 최소 (미가지치기) 헤더 글자 수. 이보다 얇으면 종전 전체 헤더를 유지한다.
 *
 * 트리거는 "파일 줄 수"가 아니라 **헤더가 실제로 비대한가**다. 줄 수는 헤더 크기와 느슨하게만 비례한다
 * (600줄 god component는 헤더가 클 수 있고, 1500줄이어도 얇을 수 있다). 얇은 헤더를 가지치기하면 이웃
 * 컨트롤 state 가시성(=재사용 금지 규칙의 근거)을 잃으면서 절약은 미미하다 — 그래서 비대할 때만 켠다.
 * 측정: 기존 코퍼스 픽스처 최대 헤더 ≈ 3,936자 → 6,000자면 그것들은 전체 유지(회귀 0), god component만 가지친다.
 */
const DEPS_PRUNE_MIN_HEADER_CHARS = 6000;

/** JS 예약어/흔한 비-식별 토큰 — 참조 식별자 추출 시 제외. */
const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'function', 'new', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'null',
  'undefined', 'true', 'false', 'this', 'async', 'await', 'yield', 'import', 'from', 'export',
  'default', 'as', 'type', 'interface', 'extends', 'implements', 'public', 'private', 'readonly',
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'React',
]);

/** 텍스트의 식별자 토큰 집합(예약어 제외). 훅 전이 의존성 추적·타입 참조 판정 공용. */
function identifiersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) if (!JS_KEYWORDS.has(m[0])) out.add(m[0]);
  return out;
}

/** 한 문장이 선언하는 이름들. const/let/var + 구조분해(`[a, setA]`·`{ data: x }`) 처리. */
function declaredNames(stmt: string): string[] {
  const names: string[] = [];
  for (const m of stmt.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    const decl = m[1];
    if (decl[0] === '[' || decl[0] === '{') {
      for (let part of decl.slice(1, -1).split(',')) {
        part = part.trim();
        if (decl[0] === '{' && part.includes(':')) part = part.slice(part.indexOf(':') + 1); // data: x → x
        const id = part.replace(/[=:].*$/s, '').replace(/^\.\.\./, '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(id)) names.push(id);
      }
    } else {
      names.push(decl);
    }
  }
  return names;
}

/** 한 줄의 ()/{}/[] 깊이 변화량. */
function braceDelta(s: string): number {
  let d = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '{' || ch === '[') d++;
    else if (ch === ')' || ch === '}' || ch === ']') d--;
  }
  return d;
}

/** 들여쓰기 무관, ()/{}/[] 균형으로 (이미 함수 본문 깊이에 있는) 줄들을 문장 단위로 끊는다. */
function groupStatements(lines: string[]): string[] {
  const stmts: string[] = [];
  let buf: string[] = [];
  let depth = 0;
  for (const line of lines) {
    buf.push(line);
    depth += braceDelta(line);
    const t = line.trim();
    if (depth <= 0 && (t.endsWith(';') || t.endsWith('}'))) {
      stmts.push(buf.join('\n'));
      buf = [];
      depth = 0;
    }
  }
  if (buf.length) stmts.push(buf.join('\n'));
  return stmts;
}

/**
 * 큰 파일의 컴포넌트 선언부에서 **편집 영역이 참조하는 훅/state 선언만** 남긴다(전이 폐쇄).
 *
 * god component(수십 섹션의 훅이 한 return 전에 쌓임)에서 무관한 섹션들의 훅을 떨궈 depsHeader
 * 폭주(①)를 막는다. 시드 = region이 쓰는 식별자(+ .map 목록 변수). 시드를 선언하는 문장을 잡고,
 * 그 문장이 또 쓰는 식별자를 시드에 더해 고정점까지 확장한다. useEffect는 선언이 없어도 시드를
 * 참조하면(동기화 effect 등) 남긴다. 주석은 다음 문장에 붙어 함께 유지/제거된다.
 */
function sliceRelevantHooks(hookLines: string[], region: string): string {
  // 함수 시그니처 프리픽스(`export default function …() {`)를 떼어낸다. 그 여는 `{`가 본문 내내
  // 닫히지 않아(닫는 `}`는 return 뒤) depth가 0으로 안 돌아오면 전체가 한 문장으로 뭉쳐 슬라이싱이
  // 무력화된다. 본문을 처음 여는 줄(depth가 ≥1로 올라가는 줄) 다음부터 문장 단위로 그룹화한다.
  let bodyStart = 0;
  let d = 0;
  for (let i = 0; i < hookLines.length; i++) {
    d += braceDelta(hookLines[i]);
    if (d >= 1) {
      bodyStart = i + 1;
      break;
    }
  }
  const stmts = groupStatements(hookLines.slice(bodyStart));
  const needed = identifiersIn(region);
  for (const v of mappedListVars(region)) needed.add(v); // 필터/테이블 경로: 목록 변수와 그 useApi 보존
  const keep = new Set<number>();
  let prev = -1;
  while (keep.size !== prev) {
    prev = keep.size;
    for (let i = 0; i < stmts.length; i++) {
      if (keep.has(i)) continue;
      const decl = declaredNames(stmts[i]);
      const refs = identifiersIn(stmts[i]);
      const isEffect = /\buse[A-Z]\w*Effect\b/.test(stmts[i]);
      if (decl.some((d) => needed.has(d)) || (isEffect && [...refs].some((r) => needed.has(r)))) {
        keep.add(i);
        for (const r of refs) needed.add(r);
        for (const d of decl) needed.add(d);
      }
    }
  }
  return stmts.filter((_, i) => keep.has(i)).join('\n');
}

/** region+훅슬라이스+backing이 참조하는 type/interface만(타입끼리 전이 참조 포함) 본문 배열로. */
function selectReachableTypes(typeSecs: { name: string; body: string }[], seedText: string): string[] {
  const needed = identifiersIn(seedText);
  const keep = new Set<number>();
  let prev = -1;
  while (keep.size !== prev) {
    prev = keep.size;
    typeSecs.forEach((s, i) => {
      if (keep.has(i)) return;
      if (s.name && needed.has(s.name)) {
        keep.add(i);
        for (const r of identifiersIn(s.body)) needed.add(r);
      }
    });
  }
  return typeSecs.filter((_, i) => keep.has(i)).map((s) => s.body);
}

/**
 * 이벤트 핸들러 "동작 변경"인데 그 대상이 **명명 함수**(`onClick={handleXxx}`)이고 그 함수 선언이
 * 편집 영역(region) **밖**(보통 return 이전 컴포넌트 본문)에 있는지 판정한다.
 * 이 경우 region(=JSX 요소)만으로는 handler 본문을 고칠 수 없다 — 모델은 바인딩을 인라인 화살표로
 * 갈아끼우는 파손(기존 함수 무력화)밖에 못 한다(실측: "클릭 시 alert" → 기존 handleRegisterClick 삭제·인라인화).
 * 이때 full 폴백해 파일 전체에서 함수 본문을 수정하게 한다(cross-cutting과 동일 원리 — 편집 대상이 region 밖).
 *  - 이벤트-동작 의도가 아니면(버튼 텍스트/색 변경 등) 미발동 — 그건 region이 처리.
 *  - region이 인라인 핸들러(`{() => …}`)이거나, 함수 선언이 region 안이거나, 파일에서 선언을 못 찾으면
 *    (다른 파일 import 등) 미발동(종전 동작 유지 — 오발 시에도 비용은 full 폴백뿐, 정확성 손실 없음).
 */
function detectHandlerBodyOutsideRegion(
  query: string,
  source: string,
  startLine: number,
  endLine: number,
): { ident: string; declLine: number } | null {
  if (!/클릭|누르면|누를|onclick|onchange|onsubmit|onblur|onfocus|이벤트|핸들러|handler|콜백|callback/i.test(query)) {
    return null;
  }
  const lines = source.split('\n');
  const region = lines.slice(startLine - 1, endLine).join('\n');
  // region의 on*={식별자} — 인라인(`{() =>`·`{(e) =>`·`{async`)은 제외, 맨 식별자 참조만.
  const refRe = /\bon[A-Z][A-Za-z]*\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
  const idents = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(region))) idents.add(m[1]);
  if (idents.size === 0) return null;
  for (const ident of idents) {
    const esc = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // const/let/var/function handleX (export 접두 허용).
    const declRe = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function)\\s+${esc}\\b`);
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) {
        const declLine = i + 1;
        // 선언이 region 안이면 모델이 직접 고칠 수 있으니 미발동.
        if (declLine >= startLine && declLine <= endLine) return null;
        return { ident, declLine };
      }
    }
  }
  return null;
}

/**
 * 질문 토큰으로 편집 영역을 찾고(grep→스냅), 의존성 헤더를 추출하고, splice 안전성을 판정한다.
 *
 * ① grep — 잡음 토큰 제거 후, 토큰 매칭 점수가 가장 높은 라인을 편집 중심으로 잡는다.
 * ② 스냅 — 매칭 줄을 감싸는 완결 JSX 요소(snapToElement). 실패 시 ±윈도우 폴백.
 * ③ 의존성 헤더 — import + 타입/인터페이스 + 컴포넌트 훅/state 선언부(첫 return 전까지).
 * ④ 안전 게이트 — anchor-missing(점수0)·anchor-comment·anchor-import·snap-failed.
 */
export function locateEditRegion(
  source: string,
  query: string,
  forcedRegion?: { startLine: number; endLine: number },
): LocatedRegion {
  const lines = source.split('\n');
  const baseTokens = tokenizeQuery(query)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2 && !LOCATE_STOP.has(t));
  // 복합 도메인어 어근 분해("예산관리"→+"예산") 후 한글 구조어 → 영문 컴포넌트 토큰 브리지(locate 한정).
  // 전자는 god component 섹션 라우팅(복합어가 섹션 내 앵커와 0매칭)을, 후자는 한글 질문어↔영문 컴포넌트명
  // 0매칭을 메운다. 둘 다 원본 토큰을 유지한 채 보강만 하므로 기존 매칭은 그대로다.
  const tokens = bridgeQueryTokens(decomposeDomainCompounds(baseTokens));

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

  // (우선순위 판단 — 흔한 토큰이 모인 곳 vs 특이 도메인어가 가리키는 곳 — 은 결정론 휴리스틱이 보편적으로
  //  풀 수 없다. 그 판단은 호출부의 모델 객관식 disambiguation(아래 candidates + RegionEditService)에
  //  위임한다. locate는 후보를 정확히 추리는 데 집중하고, 최종 선택은 의미를 아는 모델이 한다.)

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

  // ②.85 컨트롤 요소 앵커 — 쿼리가 컨트롤 유형(버튼/입력/셀렉트 등)을 지목했고 그 요소가 파일에 **하나뿐**
  //      이면, 토큰 점수(핸들러 이름 handleAlert·문자열 '버튼이…'에 우연히 걸린 곳)를 제치고 그 실제 요소로
  //      스냅한다. "alert 버튼의 className 빼줘"의 'alert'가 핸들러·문자열에 매칭돼 실제 <button> 대신 그리로
  //      스냅돼 snap-failed→"Button 없음" 오안내로 끝나던 문제(실측). HTML intrinsic 소문자(<button>)와
  //      컴포넌트 대문자(<Button>·shadcn)를 모두 인식한다. 둘 이상이면 어느 것인지 모호하므로 손대지 않고
  //      기존 scoring/diffuse 판정에 위임한다(오발 방지). !chosen일 때만 — locate가 이미 실패한 경우의 구제.
  if (!chosen) {
    for (const tag of impliedControlTags(query)) {
      const openRe = new RegExp(`<${tag}(?![A-Za-z0-9])`, 'i'); // intrinsic 소문자·컴포넌트 대문자 모두
      const occ: number[] = [];
      for (let i = 0; i < lines.length; i++) if (openRe.test(lines[i])) occ.push(i);
      if (occ.length !== 1) continue; // 0개(없음)·다수(모호) → 손대지 않고 기존 판정에 위임
      const s = snapBlockFrom(lines, occ[0]); // self-closing·한 줄·여러 줄 모두, 부모 climb 없이 그 요소만
      if (s) {
        chosen = { line: occ[0] + 1, score: MIN_REGION_SCORE, hit: [tag.toLowerCase()] };
        chosenSnap = s;
        break;
      }
    }
  }

  // ②.9 테이블 의도 교정 — 모든 라우팅 경로 뒤. 표가 여럿이라 ②.5(유일 표)가 못 잡았고, chosen이
  //     **표가 아닌** 요소에 스냅됐을 때(새 컬럼명 "연락처"가 같은 섹션 상세 카드에 우연 매칭 / 섹션
  //     랜드마크가 Card로 스냅). 그 앵커가 속한 섹션의 <table>로 교정한다 — 컬럼 추가의 편집 단위는 표다.
  if (chosen && chosenSnap && tokens.some((t) => TABLE_INTENT.has(t))) {
    const chosenTag = firstJsxTag(lines.slice(chosenSnap.startLine - 1, chosenSnap.endLine).join('\n'));
    if (chosenTag !== 'table' && chosenTag !== 'Table') {
      const tbl = findTableInSection(lines, chosen.line);
      if (tbl) {
        chosen = { line: tbl.startLine, score: chosen.score, hit: chosen.hit };
        chosenSnap = tbl;
      }
    }
  }

  // forcedRegion — 호출부(모델 객관식 disambiguation)가 영역을 직접 지정한 경우. 휴리스틱 선택을
  //   덮어쓰고 그 영역으로 payload를 빌드한다. 모델이 의미로 골랐으므로 모호 게이트는 우회한다.
  if (forcedRegion) {
    const fLow = lines.slice(forcedRegion.startLine - 1, forcedRegion.endLine).join('\n').toLowerCase();
    const fhit = tokens.filter((t) => fLow.includes(t));
    chosen = { line: forcedRegion.startLine, score: Math.max(MIN_REGION_SCORE, fhit.length || 1), hit: fhit };
    chosenSnap = forcedRegion;
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

  // ③ 의존성 헤더 (큰 파일은 관련성 가지치기로 ① depsHeader 폭주 차단)
  const sections = splitTsSections(source);

  // ③.5 grounding — 편집 영역이 참조하는 모듈 스코프 const 선언을 모은다(이름이 region에 등장하는 것만).
  //      depsHeader엔 top-level const가 없어, 모델이 기존 옵션 배열을 기억으로 재구성하다 항목을 흘린다
  //      (실측: 직급 select '수석 추가'에 기존 '사원' 누락). 실제 선언을 주입해 faithful 수정을 유도한다.
  //      타입 가지치기 시드로도 쓰이므로 헤더보다 먼저 계산한다.
  const backingParts: string[] = [];
  for (const s of sections) {
    if (s.kind !== 'const') continue;
    const esc = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\b`).test(region)) backingParts.push(s.body);
  }
  const backingDecls = backingParts.join('\n');

  // 컴포넌트 선언부(return 전 훅/state) 원본 줄.
  let hookLines: string[] = [];
  const comp = sections.find((s) => s.kind === 'function' && /^export\s+default\b/.test(s.body.trimStart()));
  if (comp) {
    const compLines = lines.slice(comp.startLine - 1, comp.endLine);
    const retIdx = compLines.findIndex((l) => /^\s*return\s*\(/.test(l));
    hookLines = retIdx >= 0 ? compLines.slice(0, retIdx) : compLines.slice(0, 30);
  }
  const fullHookBlock = hookLines.join('\n');

  // 전체(미가지치기) 헤더를 먼저 구성한다 — 종전 동작과 바이트 동일. 이 크기로 가지치기 여부를 정한다.
  const fullParts: string[] = [];
  for (const s of sections) {
    if (s.kind === 'import' || s.kind === 'type' || s.kind === 'interface') fullParts.push(s.body);
  }
  if (fullHookBlock) {
    fullParts.push(`// [컴포넌트 선언부 — 기존 훅/state/import 참고용. 새 코드가 이들과 충돌·중복되지 않게]\n${fullHookBlock}`);
  }
  const fullDepsHeader = fullParts.join('\n\n');

  // 헤더가 비대할 때만 가지치기. 얇은 헤더는 전체 유지(회귀 0 + 이웃 state 가시성 보존).
  const pruneDeps = fullDepsHeader.length >= DEPS_PRUNE_MIN_HEADER_CHARS;
  let depsHeader: string;
  if (!pruneDeps) {
    depsHeader = fullDepsHeader;
  } else {
    // 가지치기: import 전체(작고 "재import 금지" 신호) + region/훅/backing이 참조하는 타입만 + 훅 슬라이스.
    const hookBlock = sliceRelevantHooks(hookLines, region);
    const leanParts: string[] = [];
    for (const s of sections) if (s.kind === 'import') leanParts.push(s.body);
    const typeSecs = sections.filter((s) => s.kind === 'type' || s.kind === 'interface');
    leanParts.push(...selectReachableTypes(typeSecs, `${region}\n${hookBlock}\n${backingDecls}`));
    if (hookBlock.trim()) {
      leanParts.push(
        `// [컴포넌트 선언부 — 편집 영역이 참조하는 훅/state만 발췌(읽기 전용). 새 코드가 이들과 충돌·중복되지 않게]\n${hookBlock}`,
      );
    }
    depsHeader = leanParts.join('\n\n');
  }

  // ③.7 컨트롤 인벤토리(B) — region 밖 기존 입력 컨트롤. 모델 재생성(중복) 방지용.
  const controlInventory = snap ? extractControlInventory(source, startLine, endLine) : '';

  // 서버 params 필터 가능 여부 — 편집의도 + 컴포넌트가 useApi(params)로 서버 조회 중.
  // 이때 다중지점이어도 B(인벤토리)+C(<replace> params 보강)로 region 경로에서 성공시킨다.
  const hasServerParamsFilter = EDIT_INTENT_RE.test(query) && /useApi/.test(depsHeader) && /\bparams\s*:/.test(depsHeader);

  // ④.0 모호 동점 판정 — 도메인어 없이 generic 토큰(전 섹션 공통: select/상태/테이블 등)만으로 이긴 경우.
  //     god component 에서 사용자가 섹션을 특정하지 않으면 최고점이 수십 줄에서 동점이 되고, 정렬상
  //     맨 위 섹션이 조용히 선택돼 엉뚱한 곳을 편집한다(실측: ② "상태 select 바꿔줘" → 섹션1). 이때는
  //     단일 region 으로 의도를 표현할 수 없으므로 full 폴백(또는 호출부가 섹션 되물음)하게 막는다.
  //     분별 토큰(예: "예산")이 하나라도 승리에 기여했으면 흔하지 않아 발동하지 않는다(오발 방지).
  //     판정 핵심은 "라인 수"가 아니라 **동점 후보가 파일 전체에 퍼진 정도(spread)**다. 단일 표 안의
  //     수많은 <td>/<tr> 줄도 동점이 되지만(클러스터) 그건 한 곳이라 모호가 아니다. god component 는
  //     같은 generic 토큰이 수천 줄에 걸쳐 흩어진다. spread≥1000줄 조건이면 작은 파일(≤수백 줄)은
  //     구조적으로 발동 불가 → 단일 컴포넌트·표 편집 오발 0.
  const AMBIG_TOKEN_FREQ = 8; // 토큰이 이만큼 많은 줄에 등장하면 "흔함(비분별)"
  const AMBIG_TIES = 8; // 최고점 동점 줄 최소 개수
  const AMBIG_SPREAD = 1000; // 동점/컨트롤 후보가 이 줄 간격으로 흩어지면 "파일 전반"(작은 파일은 발동 불가)
  const AMBIG_DIFFUSE_COUNT = 5; // 지목 컨트롤이 이만큼 다수면 "어느 것인지 불명확"
  const tokenLineFreq = (tok: string): number => scored.reduce((n, s) => n + (s.hit.includes(tok) ? 1 : 0), 0);
  const topLines = scored.filter((s) => s.score === bestScore).map((s) => s.line);
  const spread = topLines.length > 1 ? Math.max(...topLines) - Math.min(...topLines) : 0;
  const allGeneric = !!chosen && chosen.hit.length > 0 && chosen.hit.every((t) => tokenLineFreq(t) >= AMBIG_TOKEN_FREQ);
  const genericTieAmbiguous = allGeneric && topLines.length >= AMBIG_TIES && spread >= AMBIG_SPREAD;

  // 무앵커 모호 — 쿼리가 컨트롤 유형(input/select/button 등)을 가리키나 **강한 앵커(2+ 토큰 동시매칭)가
  // 없고**(bestScore<2), 그 컨트롤이 파일 전반에 다수 흩어져 있을 때. "입력필드에 데이터 바인딩"처럼
  // 어느 컨트롤인지 이름이 없는 모호 쿼리가 anchor-import/snap-failed/약한 단일토큰 랜드마크로 잘못
  // 처리돼 full 실패하던 케이스(실측)를 되물음으로 전환한다. (단일토큰 우연 랜드마크는 강한 앵커가 아님.)
  const noStrongAnchor = bestScore < MIN_REGION_SCORE;
  const impliedTags = noStrongAnchor ? impliedControlTags(query) : [];
  const controlOccurrences: number[] = [];
  for (const tag of impliedTags) {
    // 대소문자 무시 — intrinsic 소문자(<button>)와 컴포넌트 대문자(<Button>) 양쪽을 센다(countTag와 동일 정책).
    const re = new RegExp(`<${tag}(?![A-Za-z0-9])`, 'i');
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) controlOccurrences.push(i + 1);
  }
  const controlSpread = controlOccurrences.length > 1 ? Math.max(...controlOccurrences) - Math.min(...controlOccurrences) : 0;
  const diffuseControl = controlOccurrences.length >= AMBIG_DIFFUSE_COUNT && controlSpread >= AMBIG_SPREAD;

  // 무앵커 모호(테이블판) — "테이블/컬럼 추가"인데 **어느 구역도 안 잡혔고**(chosen 없음) 표가 파일 전반에
  // 다수일 때. 테이블 의도는 컨트롤 태그가 아니라(CONTROL_TAGS에 없음) diffuseControl 로 안 잡혀 full 로
  // 떨어지던 유일한 회피가능 케이스(계기판 실측). 구역을 지목했으면(chosen 있음) region 유지 → 발동 안 함.
  const wantsTable = tokens.some((t) => TABLE_INTENT.has(t) || t === 'table' || t === 'grid');
  const tableOccurrences: number[] = [];
  if (!chosen && wantsTable) {
    for (let i = 0; i < lines.length; i++) if (/^<(table|Table)\b/.test(lines[i].trim())) tableOccurrences.push(i + 1);
  }
  const tableSpread = tableOccurrences.length > 1 ? Math.max(...tableOccurrences) - Math.min(...tableOccurrences) : 0;
  const diffuseTable = tableOccurrences.length >= AMBIG_DIFFUSE_COUNT && tableSpread >= AMBIG_SPREAD;

  const isAmbiguous = !forcedRegion && (genericTieAmbiguous || diffuseControl || diffuseTable);
  // diffuseControl/Table 을 우선 — 컨트롤/표 전체 목록이 generic-tie 보다 정확한 "어느 구역?" 후보를 준다.
  const ambigReason = diffuseControl
    ? `컨트롤 <${impliedTags.join('/')}> 가 파일 전반(${controlSpread}줄)에 ${controlOccurrences.length}곳 — 어느 것인지 쿼리에 이름이 없어 불명확 → 되물음.`
    : diffuseTable
      ? `테이블이 파일 전반(${tableSpread}줄)에 ${tableOccurrences.length}곳 — 어느 구역의 표인지 쿼리에 이름이 없어 불명확 → 되물음.`
      : `generic 토큰(${chosen?.hit.join(', ')})만으로 ${topLines.length}개 동점 후보가 ${spread}줄에 걸쳐 흩어짐 — 어느 섹션인지 불명확(맨 위로 추락) → 되물음.`;

  // 모호하면 후보 섹션 라벨을 모은다(되물음용). 후보 줄(주석/import 제외) 위의 섹션 랜드마크를 중복 없이.
  const candidateLines = diffuseControl ? controlOccurrences : diffuseTable ? tableOccurrences : topLines;
  const ambiguousCandidates: string[] = [];
  if (isAmbiguous) {
    const seen = new Set<string>();
    for (const ln of candidateLines) {
      if (isCommentOrImport(lines[ln - 1] ?? '')) continue; // 주석/import 줄은 섹션 앵커가 아님
      const label = sectionLabelAbove(lines, ln);
      if (label && !seen.has(label)) {
        seen.add(label);
        ambiguousCandidates.push(label);
      }
    }
  }

  // ④ 안전 게이트
  // 모호(ambiguous)를 먼저 본다 — 무앵커 모호(diffuseControl)는 anchor-import/snap-failed/anchor-missing
  // 보다 정확한 진단이라 그 게이트들을 가린다(full 떨굼 대신 되물음). generic-tie 는 snap 통과 케이스라 순서 무관.
  const hitLine = (lines[bestLine - 1] ?? '').trim();
  // 이벤트 핸들러 동작 변경 대상이 region 밖 명명 함수인지(forcedRegion=모델 명시 선택이면 존중, 미판정).
  const handlerBodyTarget = snap && !forcedRegion ? detectHandlerBodyOutsideRegion(query, source, startLine, endLine) : null;
  let safety: RegionSafety;
  if (isAmbiguous) {
    safety = { ok: false, gate: 'ambiguous', reason: ambigReason };
  } else if (bestScore <= 0) {
    safety = { ok: false, gate: 'anchor-missing', reason: `grep 점수 0 — 질문 토큰이 파일에 없음(앵커 부재). splice 시 ${bestLine}줄(보통 import)로 추락해 파일 파손 위험.` };
  } else if (/^\/\/|^\/\*|^\*/.test(hitLine)) {
    safety = { ok: false, gate: 'anchor-comment', reason: `최고 매칭(${bestLine}줄)이 주석 — 코드 앵커가 아닌 우연 일치.` };
  } else if (/^import\b/.test(hitLine)) {
    safety = { ok: false, gate: 'anchor-import', reason: `최고 매칭(${bestLine}줄)이 import 라인 — 편집 영역으로 부적합.` };
  } else if (!snap) {
    safety = { ok: false, gate: 'snap-failed', reason: `완결 JSX 요소 스냅 실패 → ±윈도우(${startLine}~${endLine})는 균형 블록이 아님. 모델 재작성 splice 시 구조 파손 위험.` };
  } else if (handlerBodyTarget) {
    safety = { ok: false, gate: 'handler-body', reason: `이벤트 핸들러 동작 변경 대상이 명명 함수 '${handlerBodyTarget.ident}'(${handlerBodyTarget.declLine}줄)이나 편집 영역(${startLine}~${endLine}) 밖 — region(JSX 요소)만으론 함수 본문을 못 고침(바인딩 인라인 교체로 기존 함수 무력화 위험) → full 폴백.` };
  } else if (isCrossCutting(query, firstJsxTag(region), region) && !hasServerParamsFilter) {
    // 다중지점(필터/정렬/연동) — 편집의도 + region 루트가 큰 컨테이너 + 지목 컨트롤이 region 밖.
    // **서버 params 필터가 가능하면(B+C 경로)** 통과시킨다: 인벤토리로 기존 컨트롤 재생성을 막고,
    // <replace>로 useApi params를 보강해 region 경로에서 성공시킨다. 서버 params가 없으면(클라만)
    // 단일 region이 표현 못 하므로 종전대로 full 폴백.
    safety = { ok: false, gate: 'cross-cutting', reason: `다중지점 편집 의도(서버 params 없음) — region 루트 <${firstJsxTag(region)}>(${startLine}~${endLine}) 컨테이너 + 지목 컨트롤 영역 밖. 단일 region 표현 불가 → full 폴백.` };
  } else {
    safety = { ok: true, gate: 'ok', reason: `코드줄 앵커(${bestLine}줄, 점수 ${bestScore}) + 완결 JSX 요소 스냅(${startLine}~${endLine}) — region/hybrid 안전.` };
  }

  // ⑤ 후보 목록 — 질문 토큰을 가진 상위 후보를 완결 요소로 snap해 distinct 영역으로 모은다(객관식용).
  //    채택 영역(chosenSnap)을 항상 포함시키고, 점수 높은 순으로 최대 6개. 호출부가 모델에 제시한다.
  const candidates: RegionCandidate[] = [];
  {
    const seen = new Set<string>();
    const seenLabel = new Set<string>();
    const push = (s: { startLine: number; endLine: number }, sc: number): void => {
      const k = `${s.startLine}-${s.endLine}`;
      if (seen.has(k)) return;
      const label = regionLabel(lines, s);
      // 같은 라벨 중복 제거 — 같은 필드를 div/컨트롤 두 레벨로 snap한 중복(입사일|입사일)은 모델이
      // 구별 못 하므로 첫(점수 높은) 것만 남긴다.
      if (seenLabel.has(label)) return;
      seen.add(k);
      seenLabel.add(label);
      candidates.push({ startLine: s.startLine, endLine: s.endLine, label, score: sc });
    };
    if (chosenSnap) push(chosenSnap, bestScore); // 채택 영역 항상 첫째
    for (const cand of scored) {
      if (cand.score < 1 || candidates.length >= 6) break;
      if (isCommentOrImport(lines[cand.line - 1] ?? '')) continue;
      const s = snapToElement(lines, cand.line);
      if (s) push(s, cand.score);
    }
  }

  return { lines, bestLine, bestScore, matched: [...matched], startLine, endLine, region, depsHeader, backingDecls, controlInventory, safety, ambiguousCandidates, candidates };
}

/**
 * 후처리 root-tag 게이트(Fix 2): 모델이 편집 영역 밖을 재작성했는지 검사한다.
 * 원본 영역의 첫 JSX 태그 ≠ 모델 출력의 첫 태그면(예: <SelectTrigger> → <Select>) splice 시
 * 중첩/고아 요소로 프랑켄 머지가 난다 → false 반환(호출부가 splice 거부, full 폴백).
 *
 * **예외(의도된 컴포넌트 교체):** `allowedRootTags`에 출력 루트 태그가 들어 있으면 통과시킨다.
 * 예: "직원 테이블을 SmartTable로 적용해줘" → 레시피 카드가 `<table>`을 `<SmartTable>`로 **교체**하라고
 * 지시하므로 루트 변경이 정상이다. 이 화이트리스트가 없으면 모델이 옳게 만든 교체를 가드가 버려 full 폴백되고,
 * 폴백 경로는 레시피 계약을 잃어 사소한 수정만 남는다(실측 버그). 화이트리스트에 없는 예상 밖 태그는 여전히 거부.
 *
 * @param allowedRootTags 루트 변경을 허용할 타깃 컴포넌트 태그들(예: ['SmartTable']). 비면 종전 동작.
 * @returns true = splice 안전, false = 거부(영역 밖 재작성)
 */
export function checkRegionRootTag(
  originalRegion: string,
  modelOutput: string,
  allowedRootTags: string[] = [],
): { ok: boolean; origTag: string | null; outTag: string | null } {
  const origTag = firstJsxTag(originalRegion);
  const outTag = modelOutput.trim() ? firstJsxTag(modelOutput) : null;
  // 의도된 교체: 출력 루트가 허용 타깃이면 루트가 바뀌어도 통과(레시피가 지정한 컴포넌트만).
  if (outTag && allowedRootTags.some((t) => t.toLowerCase() === outTag.toLowerCase())) {
    return { ok: true, origTag, outTag };
  }
  // 둘 다 JSX 태그를 가질 때만 비교한다(한쪽이 순수 로직이면 검사 보류 → ok).
  const ok = !(origTag && outTag && origTag !== outTag);
  return { ok, origTag, outTag };
}
