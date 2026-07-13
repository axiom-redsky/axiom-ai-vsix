/**
 * 함수 스포트라이트(FunctionSpotlight) — **오프라인 응답 전용**.
 *
 * 섹션 좁히기([focusKnowledgeBody])가 "날짜 유틸 섹션"까지 좁혀줘도, 사용자가 "오늘날짜"처럼
 * **세부 함수**를 겨냥하면 그 섹션 안에서도 정작 원하는 함수가 한참 아래 있을 수 있다. 이 모듈은
 * 쿼리에 직접 해당하는 `$util` 함수 **몇 개만** 골라 응답 **맨 위에 핀**으로 띄운다(그 아래 전체 섹션은 유지).
 *
 * ── 매칭은 **문서 주도(doc-driven)** 다 ──
 * axiom은 scaffold 소스코드를 모르고 `knowledge/utils/util.md`만 안다. 그래서 "어느 함수가 무엇을 하는지"는
 * **문서의 함수 주석**(예: `$util.date.now();  // 오늘 현재 날짜·시각`)에 자연어로 적어 두고, 코드는 그 주석을
 * 읽어 매칭한다. 함수↔개념 연관 지식은 **문서에** 모이고(작성자가 핫리로드로 유지), 코드는 "매칭할 만한
 * 개념어"라는 **작고 안정적인 어휘**(CONCEPT_VOCAB)만 안다 — `_index` 키워드 철학을 함수 단위로 내린 것.
 *
 * 왜 어휘가 필요한가: "오늘날짜"는 공백 없이 붙어 있어 일반 토크나이저가 "오늘"을 분리하지 못한다. 어휘에
 * "오늘"을 두면 쿼리·주석 양쪽에서 부분문자열로 인식돼 `now`/`isToday`처럼 주석에 "오늘"이 적힌 함수만 잡힌다.
 * 범용 명사(날짜·숫자)는 모든 함수 주석에 흔해 변별력이 없으니 어휘에서 제외한다(과매칭 방지).
 *
 * 안전: **추가만** 한다(아래 전체 섹션은 그대로). 매칭이 변별적이지 않거나(전부 동점) 없으면 `null`(핀 생략).
 * vscode/fs 비의존(텍스트만 입력).
 */

/**
 * 핀에 띄울 최대 함수 수 — 너무 많이 걸리면 "딱 원하는 것" 느낌이 흐려져 생략한다(과광범위 가드).
 * 같은 개념의 함수 패밀리(마스킹 6종·영업일 5종 등)를 통째로 보여줄 수 있게 약간 넉넉히 둔다.
 */
const MAX_SPOTLIGHT = 8;

/**
 * 매칭에 쓰는 **개념 어휘** — 쿼리·함수 주석 양쪽에서 부분문자열로 찾는 변별력 있는 단어들.
 * 함수↔기능 연관은 코드가 아니라 **문서 주석**이 갖는다(이 목록은 "무엇을 매칭 신호로 볼지"만 정의).
 * 새 개념을 노출하려면 ① util.md 함수 주석에 그 단어를 적고 ② 여기에 한 단어만 추가하면 된다.
 * ⚠️ 범용 네임스페이스 명사(날짜·숫자·문자열·금융·객체·배열)와 과넓은 동사(추출·검증·변환·계산·비교)는
 *    **넣지 않는다** — 거의 모든 주석에 등장해 전부 동점이 되어 변별력이 없다(섹션 좁히기가 그 층을 담당).
 */
const CONCEPT_VOCAB: readonly string[] = [
  // ── date ──
  '오늘', '현재', '지금', '당일', '어제', '내일', '요일', '영업일', '주말', '공휴일',
  '만나이', '나이', '분기', '주차', '윤년', '상대시간', '며칠', '포맷', '형식', '파싱',
  '경계', '이전', '이후', '과거', '미래', '연수', '개월',
  // ── number ──
  '콤마', '천단위', '쉼표', '반올림', '버림', '절사', '올림', '절상', '퍼센트', '백분율',
  '덧셈', '뺄셈', '곱셈', '나눗셈', '부가세', '통화', '한글금액', '축약', '등락', '증감',
  // ── string ──
  '말줄임', '마스킹', '가림', '이메일', '휴대폰', '주민', '사업자', '카드', '법인', '계좌',
  '초성', '조사', '바이트', '카멜', '스네이크', '케밥', '파스칼', '이스케이프', '태그',
  'base64', '인코딩', '디코딩', '역순', '뒤집기',
  // ── finance ──
  '단리', '복리', '이자', '예금', '적금', '만기', '원리금', '상환', '대출', '환율',
  '환산', '환전', '분할', '공급가',
  // ── object ──
  '복사', '깊은복사', '깊은비교', '병합', 'merge', '경로', '선택', '제외', '정리',
  // ── array ──
  '그룹', '그룹핑', '정렬', '합계', '중복', '트리', '평면',
];

/** 한 예시 라인에서 함수 호출과 그 뒤 `//` 주석을 분리해 추출. 없으면 null. */
interface FnLine {
  fn: string;
  line: string; // 원문(트림) — 핀에 그대로 노출
  comment: string; // `//` 뒤 설명(매칭 대상)
}

/**
 * 본문에서 `$util.<ns>.<fn>(...)  // 주석` 형태의 예시 라인을 함수별로 수집한다.
 * 한 함수가 여러 번 등장하면(예: 상단 인트로 요약 + 섹션 상세) **주석이 가장 풍부한** 줄을 고른다 —
 * 인트로의 빈약한 값 주석(`// "2026-06-01"`)이 섹션의 자연어 기능 주석을 가리지 않게.
 */
function extractFnLines(body: string): FnLine[] {
  const best = new Map<string, FnLine>();
  const order: string[] = [];
  // 함수명은 영문 시작 + 영숫자(예: base64Encode). 숫자를 빼면 base64* 류를 놓친다.
  const callRe = /\$util\.[a-z]+\.([A-Za-z][A-Za-z0-9]*)\s*\(/;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(callRe);
    if (!m) continue;
    const fn = m[1];
    const ci = line.indexOf('//');
    const entry: FnLine = { fn, line, comment: ci >= 0 ? line.slice(ci + 2).trim() : '' };
    const prev = best.get(fn);
    if (!prev) order.push(fn);
    if (!prev || entry.comment.length > prev.comment.length) best.set(fn, entry);
  }
  return order.map((fn) => best.get(fn)!);
}

/**
 * 쿼리에 직접 해당하는 `$util` 함수 예시 라인들을 골라 **핀 블록**(마크다운)으로 만든다.
 * 매칭이 변별적이지 않으면(전부 동점·과광범위) `null`(핀 생략 — 기존 렌더 그대로).
 *
 * @param source 문서 출처(현재는 scaffold $util 문서에만 적용).
 * @param body   문서 전체 본문(예시 라인·주석 추출용).
 * @param query  사용자 쿼리(원문).
 */
export function buildFunctionSpotlight(source: string, body: string, query: string): string | null {
  if (!isScaffoldUtilSource(source)) return null;
  // 매칭은 **공백 무시**다 — 한국어 띄어쓰기 변형("깊은비교"~"깊은 비교", "오늘날짜"~"오늘 날짜")을 흡수한다.
  const squash = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
  const q = squash(query);

  // 쿼리에 들어 있는 개념어(활성 어휘). 하나도 없으면 핀 신호 없음.
  const active = CONCEPT_VOCAB.map(squash).filter((w) => q.includes(w));
  if (active.length === 0) return null;

  const fnLines = extractFnLines(body);
  if (fnLines.length === 0) return null;

  // 각 함수 점수 = (주석에 들어 있는 활성 개념어 수). 함수명을 쿼리에 직접 적었으면 강한 가산.
  const scored = fnLines.map((f) => {
    const c = squash(f.comment);
    let score = active.filter((w) => c.includes(w)).length;
    if (q.includes(f.fn.toLowerCase()) && f.fn.length >= 3) score += 5; // 함수명 직접 지목
    return { f, score };
  });

  const maxScore = Math.max(...scored.map((s) => s.score));
  if (maxScore === 0) return null; // 활성 개념어가 어느 주석에도 없음

  // 최고점 함수만 핀(변별 밴드). 전부 동점이거나 너무 많이 걸리면 변별력 없음 → 생략.
  const pinned = scored.filter((s) => s.score === maxScore);
  if (pinned.length === fnLines.length || pinned.length > MAX_SPOTLIGHT) return null;

  return [`> 🎯 **요청에 가장 가까운 함수**`, '', '```ts', ...pinned.map((s) => s.f.line), '```'].join('\n');
}

/** scaffold 전역 $util 가이드 문서(utils/util.md)인지 — 경로 구분자 정규화 후 판별. */
function isScaffoldUtilSource(source: string): boolean {
  const s = source.replace(/\\/g, '/').toLowerCase();
  return s === 'utils/util.md' || s.endsWith('/utils/util.md');
}
