/**
 * 오프라인 지식 검색기(OfflineKnowledgeRetriever) — **오프라인 응답 전용**.
 *
 * 온라인 경로(`buildContext`)는 절대 호출하지 않는다(공유 스코어러·예산 기계 미사용).
 *
 * 설계(점수 기반 하이브리드 랭킹):
 *  - **후보 수집**: 키워드(정밀) + 파일컨텍스트(선택) + 임베딩(의미, 로컬) source 문서 합집합.
 *    청크를 고르지 않고 **문서를 통째로** 로드한다 → "맞는 문서, 틀린 청크" 실패 모드 소멸.
 *  - **점수 합산**: 각 후보에 `키워드 가산점 + 파일컨텍스트 가산점 + 의미 유사도(코사인) + show-code 보너스`를
 *    더해 정렬한다. 단어 하나(범용 키워드)가 _index 등장 순서로 1등을 강제하던 **지뢰 패턴을 제거**한다 —
 *    "목록" 같은 범용어로 매칭됐어도 **의미 점수가 낮으면 위로 못 올라온다.**
 *  - 키워드 가산점(1.0)이 의미 점수(0~1)보다 크므로 **정밀 매칭이 의미검색 노이즈를 이긴다**(provenance 유지).
 *    의미 점수는 키워드 동점자 사이의 **타이브레이커**로 작동한다(예: "유틸 목록"에서 util.md > Table.md).
 *  - 약한 로컬 임베딩을 보완: 의미만으로 정렬하지 않고 키워드 정밀도를 베이스로 둔다.
 *
 * 문서 수 상한(MAX_DOCS)만 둔다 — 오프라인 출력은 사람이 읽는 화면이라 토큰 예산 제약이 없다.
 * vscode/fs 비의존 — source 검색·문서 로드를 모두 주입(IOfflineKnowledgeDeps)으로 받는다.
 */

import type { IntentResult } from './intent/IntentClassifier';
import { parseKnowledgeDoc, type KnowledgeDoc } from './KnowledgeDoc';
import { focusKnowledgeBody } from './decompose/SectionExtractor';
import { buildFunctionSpotlight } from './decompose/FunctionSpotlight';

/** OfflineKnowledgeRetriever가 외부 자원에 접근하기 위한 주입 의존성. */
export interface IOfflineKnowledgeDeps {
  /** 키워드 정밀 라우팅 결과 source 경로(정확 용어 매칭 보장). */
  keywordSources: (query: string) => string[];
  /** 로컬 임베딩 의미 유사도 — source별 코사인 점수(0~1). 인덱스 미준비 시 빈 배열. */
  semanticScores: (query: string) => Promise<Array<{ source: string; score: number }>>;
  /** 현재 파일 내용 기반 라우팅 source 경로(import 등). fileContent 없으면 호출부가 빈 배열. */
  fileContextSources: (fileContent: string) => string[];
  /** source 경로의 원시 마크다운을 로드(없으면 null). */
  loadDoc: (source: string) => string | null;
  /**
   * 키워드·파일컨텍스트·임베딩이 **모두 비었을 때만** 호출되는 카탈로그 폴백 source.
   * scaffold 질문에 빈손 답변을 막는 안전망(예: catalog/overview.md). 미주입 시 종전 동작(빈 배열).
   * smalltalk 의도에는 호출하지 않는다(인사에 카탈로그는 부적절).
   */
  fallbackSources?: (intent: IntentResult) => string[];
}

/** 한 응답에 노출할 최대 문서 수. 오프라인은 예산이 없어 recall 우선(2~3개). */
const MAX_DOCS = 3;

/** "예제·코드·샘플 보여달라"는 show-code 의도 신호 토큰(오프라인 전용 판정). */
const SHOW_CODE_TOKENS = ['예제', 'example', '샘플', 'sample', '코드', 'code', '보여', '사용법', '사용 예'];

/**
 * 점수 가중치 — 온라인 buildContext의 라우팅 보너스(키워드 +5 / 파일 +8) 철학을 오프라인에 옮긴 값.
 *  - 키워드/파일 가산점은 의미 점수(코사인 0~1)보다 크게 둬 **정밀 매칭이 의미검색 노이즈를 이긴다.**
 *  - 의미 점수는 키워드 동점자 사이의 **타이브레이커**로만 작동(약한 로컬 임베딩을 베이스로 안 씀).
 *  - show-code 보너스는 의미 점수보다 작게 — 정밀 pattern 문서를 의미검색 example 위로 유지.
 */
const KEYWORD_BOOST = 1.0;
const FILE_BOOST = 1.2;
const SHOWCODE_BONUS = 0.25;

/** 쿼리에 명시적 "유틸/util" 의도가 있음을 알리는 신호 토큰(오프라인 전용 판정). */
const UTIL_INTENT_TOKENS = ['유틸리티', '유틸', 'util', '헬퍼', 'helper', '공통함수', '공통유틸', '$util'];

/**
 * 쿼리가 **SmartTable**(선언형 고수준 그리드)을 명시적으로 지목하는 신호 토큰(오프라인 전용 판정).
 * 이 신호가 있으면 SmartTable.md를 **형제 Table.md 위로** 끌어올린다(아래 SMARTTABLE_INTENT_BONUS).
 */
const SMARTTABLE_INTENT_TOKENS = [
  'smarttable', 'smart-table', 'smart table', '스마트테이블', '스마트 테이블',
  '스마트그리드', '스마트 그리드', '데이터테이블', '데이터 테이블', 'definecolumns',
];

/**
 * SmartTable 의도 명시 시 SmartTable.md를 **형제 Table.md 동점 위로** 끌어올리는 보너스.
 *
 * 배경: "smart table 사용법"은 SmartTable.md(키워드 'smarttable')와 Table.md(키워드 'table'이 'smarttable'의
 * 부분문자열)가 **동시 매칭**돼 KEYWORD_BOOST+SCAFFOLD_BONUS=1.4로 동점이 된다. _index 등장 순서로 Table이
 * 우연히 1등이 되던 것을(실측: 캡처에서 SmartTable이 아예 안 뜸), 사용자가 SmartTable을 명시했으면 그 문서를
 * 선두로 둔다. UTIL_INTENT_BONUS와 동일 패턴·동일 값. Table.md는 2순위로 남아 함께 노출된다.
 */
const SMARTTABLE_INTENT_BONUS = 0.6;

/**
 * scaffold 전역 `$util` 문서(utils/util.md)를 **라이브러리 문서(dayjs·date-fns 등) 위로** 끌어올리는 보너스.
 *
 * 배경(실측): "오늘날짜 유틸리티"는 dayjs.md(키워드 "날짜")와 util.md(키워드 "유틸리티")가 **동시 매칭**돼
 * KEYWORD_BOOST+SCAFFOLD_BONUS=1.4로 동점이 되고, _index 등장 순서(dayjs가 위)로 dayjs가 우연히 1등이 됐다.
 * 사용자가 "유틸/util"을 명시했다면 scaffold 컨벤션($util)을 선두로 두는 것이 옳다 — SCAFFOLD_BONUS(0.4)보다
 * 큰 값으로 동점을 확실히 깬다. dayjs/date-fns는 2~3순위로 남아 함께 노출된다(유틸 마커 없으면 동작 불변).
 */
const UTIL_INTENT_BONUS = 0.6;

/**
 * 의미(로컬 임베딩) 점수 가중치 — **노이즈 보정**.
 *
 * 실측: 약한 다국어 임베더가 `conventions/naming.md`·`spec-structure.md`·`tokens.md` 같은 일부 문서에
 * **질문과 무관하게** 0.7~0.83의 높은 코사인을 일관되게 준다(만능 고득점). 반대로 정작 정답인
 * react-reference 문서엔 0에 가까운 점수를 줄 때가 많다. 이 노이즈가 raw(0~1)로 키워드 정밀매칭(1.0)과
 * 맞먹어 정답을 밀어냈다. → 의미 점수를 절반으로 낮춰 **키워드 라우팅(신뢰 신호)을 명확히 우위**에 둔다.
 * 의미는 키워드 동점자 사이의 타이브레이커 역할만 남긴다(원래 설계 의도 복원).
 */
const SEMANTIC_WEIGHT = 0.5;

/**
 * scaffold 문서가 범용 React 레퍼런스보다 **우선되도록** 점수에 더하는 보너스(soft precedence).
 *
 * 설계 배경(실측): 처음엔 "scaffold를 항상 react-reference 위로" 하드 티어를 썼으나, 임베딩 실측에서
 * '배열' 같은 광범위 키워드로 우연히 걸린 **무관한 scaffold 노이즈**(Table·naming 등)가, 정밀하게 맞은
 * React 문서를 꼴찌로 밀어버렸다("useEffect 의존성"에 Table이 1등). 의도(데이터→useApi 같은 **진짜 충돌**)는
 * scaffold 우선이 맞지만, 노이즈가 정답을 매장하는 건 기능 목적을 깨뜨린다.
 *
 * → 하드 티어를 버리고 **점수 기반 + scaffold 보너스**로 전환한다. 단 보너스는 scaffold 문서가
 *   **진짜로 토픽 매칭(키워드 또는 파일컨텍스트)** 됐을 때만 준다 — 의미점수만 걸린 노이즈 scaffold엔
 *   주지 않는다(노이즈가 보너스까지 받아 정답을 밀어내던 실측 문제 차단). 진짜 충돌(scaffold도 키워드
 *   매칭)에선 이 보너스가 down-weight된 의미점수 차를 넘어 scaffold를 앞세운다(실측 튜닝값).
 */
const SCAFFOLD_BONUS = 0.4;

/** 범용 React 레퍼런스(react.dev 요약) source인지 — scaffold 보너스 대상 판별용 경로 태그. */
function isGenericReference(source: string): boolean {
  return source.startsWith('react-reference/');
}

/**
 * 폴백(카탈로그)으로 채웠을 때 결과 배열의 **첫 블록**으로 들어가는 안내 — 결과가 "정확 매칭"이
 * 아님을 알린다. 호출부(OfflineResponder)가 이 상수로 식별해 지식 섹션 헤딩 위에 분리 렌더한다.
 */
export const FALLBACK_HINT =
  '> 🔎 요청과 정확히 맞는 문서를 찾지 못해, 관련 가능성이 있는 scaffold 카탈로그를 대신 안내합니다.';

/** 쿼리에 show-code 의도가 있는지(코드가 곧 답인 요청). */
export function hasShowCodeIntent(query: string): boolean {
  const q = query.toLowerCase();
  return SHOW_CODE_TOKENS.some((t) => q.includes(t));
}

/** 쿼리에 명시적 "유틸/util" 의도가 있는지(scaffold $util을 라이브러리 위로 올릴지 판정). */
export function hasUtilIntent(query: string): boolean {
  const q = query.toLowerCase();
  return UTIL_INTENT_TOKENS.some((t) => q.includes(t));
}

/** 쿼리에 명시적 SmartTable 의도가 있는지(SmartTable.md를 형제 Table.md 위로 올릴지 판정). */
export function hasSmartTableIntent(query: string): boolean {
  const q = query.toLowerCase();
  return SMARTTABLE_INTENT_TOKENS.some((t) => q.includes(t));
}

/** SmartTable 가이드 문서(components/SmartTable.md)인지 — 경로 구분자 정규화 후 판별. */
function isSmartTableDoc(source: string): boolean {
  const s = source.replace(/\\/g, '/').toLowerCase();
  return s === 'components/smarttable.md' || s.endsWith('/components/smarttable.md');
}

/** scaffold 전역 $util 가이드 문서(utils/util.md)인지 — 경로 구분자 정규화 후 판별. */
function isScaffoldUtilDoc(source: string): boolean {
  const s = source.replace(/\\/g, '/').toLowerCase();
  return s === 'utils/util.md' || s.endsWith('/utils/util.md');
}

export class OfflineKnowledgeRetriever {
  constructor(private readonly _deps: IOfflineKnowledgeDeps) {}

  /**
   * 쿼리·intent에 맞는 scaffold 지식 문서들을 (출처 헤더 포함) 마크다운 블록 배열로 반환한다.
   * OfflineResponder가 `\n\n---\n\n`로 이어 "관련 scaffold 지식" 섹션을 만든다.
   * 매칭 문서가 없으면 빈 배열(호출부가 섹션 자체를 생략).
   */
  async retrieve(query: string, intent: IntentResult, fileContent = ''): Promise<string[]> {
    // 후보 수집 — 키워드(정밀) + 파일컨텍스트 + 임베딩(의미, 점수 포함).
    const keyword = this._deps.keywordSources(query);
    // 파일 컨텍스트(열린 파일의 import 컴포넌트)는 **그 파일을 수정하는 의도**에서만 유효하다.
    // 개념 질문(qna·create_page 등)에서는 열린 파일의 import(Button·Input 등)가 FILE_BOOST로
    // 키워드 정밀 매칭(create-page-guide 등 실제 답)을 밀어내는 노이즈가 된다 — 그래서 제외한다.
    const fileCtx =
      fileContent && intent.intent === 'modify_file'
        ? this._deps.fileContextSources(fileContent)
        : [];
    let semantic: Array<{ source: string; score: number }> = [];
    try {
      semantic = await this._deps.semanticScores(query);
    } catch {
      semantic = [];
    }

    const keywordSet = new Set<string>(keyword);
    const fileSet = new Set<string>(fileCtx);
    const semScore = new Map<string, number>(semantic.map((s) => [s.source, s.score]));

    // 합집합(첫 등장 순서 보존 — 점수 동점 시 타이브레이커로 사용).
    let orderedSources = dedupe([...keyword, ...fileCtx, ...semantic.map((s) => s.source)]);

    // 빈손 방지 폴백 — 정밀/의미 검색이 모두 비면 카탈로그로 보충한다(smalltalk 제외).
    let usedFallback = false;
    if (orderedSources.length === 0) {
      if (intent.intent === 'smalltalk' || !this._deps.fallbackSources) return [];
      orderedSources = dedupe(this._deps.fallbackSources(intent));
      usedFallback = orderedSources.length > 0;
    }
    if (orderedSources.length === 0) return [];

    // 문서 로드 + 파싱(통째). 원래 합집합 순서를 인덱스로 보존(동점 타이브레이커).
    const docs: KnowledgeDoc[] = [];
    for (const src of orderedSources) {
      const raw = this._deps.loadDoc(src);
      if (raw) docs.push(parseKnowledgeDoc(src, raw));
    }
    if (docs.length === 0) return [];

    // 점수 합산 후 정렬 → 상위 MAX_DOCS개 렌더. scaffold 우선은 점수의 SCAFFOLD_BONUS로 soft하게
    // 반영된다(하드 티어 X) — 진짜 충돌에선 scaffold가 동점을 깨고 이기되, 무관한 scaffold 노이즈는
    // 강한 React 정밀 매칭을 매장하지 못한다.
    const ranked = this._rankByScore(docs, query, { keywordSet, fileSet, semScore });
    let top = ranked.slice(0, MAX_DOCS);

    // React 가시성 보장(reserve): react-reference가 **키워드로 진짜 매칭**됐는데도 상위에서 밀려나면
    // (예: "훅 조건문 호출" → 흔한 '훅' 키워드의 scaffold 문서 3개가 보너스까지 받아 top3를 채움),
    // **최하위 슬롯 1개만** 그 중 최고 점수 react-reference로 교체한다. scaffold 1~2위 순서는 유지하고,
    // 의미점수만 걸린 react-reference(노이즈)에는 적용하지 않는다(키워드 매칭 = 진짜 토픽 신호일 때만).
    if (!usedFallback && !top.some((d) => isGenericReference(d.source))) {
      const bestRef = ranked.find((d) => isGenericReference(d.source) && keywordSet.has(d.source));
      if (bestRef) top = top.length < MAX_DOCS ? [...top, bestRef] : [...top.slice(0, MAX_DOCS - 1), bestRef];
    }

    const blocks = top.map((d) => this._render(d, query));
    return usedFallback ? [FALLBACK_HINT, ...blocks] : blocks;
  }

  /**
   * 후보 문서를 `키워드 가산점 + 파일컨텍스트 가산점 + 의미 유사도 + show-code 보너스` 합으로 정렬한다.
   * 단어 하나가 _index 등장 순서로 1등을 강제하던 지뢰 패턴을 제거한다 — 범용 키워드로 매칭됐어도
   * 의미 점수가 낮으면 위로 못 올라온다. 키워드 가산점(1.0)이 의미 점수(0~1)보다 커서 정밀 매칭이
   * 의미검색 노이즈를 이기고, 의미 점수는 키워드 동점자의 타이브레이커로 작동한다.
   * 동점이면 원래 합집합 순서(정밀→의미)를 유지한다(안정 정렬).
   */
  private _rankByScore(
    docs: KnowledgeDoc[],
    query: string,
    sig: { keywordSet: Set<string>; fileSet: Set<string>; semScore: Map<string, number> },
  ): KnowledgeDoc[] {
    const showCode = hasShowCodeIntent(query);
    const utilIntent = hasUtilIntent(query);
    const smartTableIntent = hasSmartTableIntent(query);
    const scoreOf = (d: KnowledgeDoc): number => {
      // 의미점수는 노이즈라 down-weight(키워드 라우팅을 명확히 우위로). 키워드 동점자 타이브레이커.
      let s = (sig.semScore.get(d.source) ?? 0) * SEMANTIC_WEIGHT;
      const routed = sig.keywordSet.has(d.source) || sig.fileSet.has(d.source);
      if (sig.keywordSet.has(d.source)) s += KEYWORD_BOOST;
      if (sig.fileSet.has(d.source)) s += FILE_BOOST;
      if (showCode && (d.kind === 'example' || d.kind === 'source')) s += SHOWCODE_BONUS;
      // 유틸 의도 명시 시 scaffold $util을 라이브러리(dayjs 등) 동점 위로 끌어올린다(컨벤션 우선).
      if (utilIntent && isScaffoldUtilDoc(d.source)) s += UTIL_INTENT_BONUS;
      // SmartTable 의도 명시 시 SmartTable.md를 형제 Table.md 동점 위로 끌어올린다.
      if (smartTableIntent && isSmartTableDoc(d.source)) s += SMARTTABLE_INTENT_BONUS;
      // soft precedence: scaffold가 **진짜 토픽 매칭(키워드/파일)** 일 때만 보너스 → 진짜 충돌에선
      // scaffold가 앞서되, 의미점수만 걸린 노이즈 scaffold는 강한 React 정밀 매칭을 매장하지 못한다.
      if (routed && !isGenericReference(d.source)) s += SCAFFOLD_BONUS;
      return s;
    };
    return docs
      .map((d, i) => ({ d, i, score: scoreOf(d) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.d);
  }

  /**
   * 문서를 렌더한다(출처 헤더 포함). 기본은 **frontmatter를 뗀 본문 통째**다 — 오프라인 출력은
   * 사람이 읽는 화면이라 토큰 예산이 없어 길이로 자르지 않는다.
   *
   * 단, **종합 레퍼런스 문서에서 쿼리가 특정 섹션을 겨냥**하면(예: "숫자 콤마 찍는 유틸") 그 섹션으로
   * 좁혀 렌더하고, 잘라낸 섹션은 라벨만 footer로 안내한다(focusKnowledgeBody). 좁힐 근거가 없으면
   * (예: "유틸리티 사용법 알려줘"처럼 분포가 평평하면) null을 받아 종전처럼 전체를 렌더한다.
   *
   * example/source 문서는 코드 전문 자체가 답이므로 좁히지 않는다(show-code 철학 유지).
   *
   * 또한 쿼리가 **세부 함수**를 겨냥하면($util 문서 한정), 해당 함수 예시 몇 개를 **맨 위에 핀**으로
   * 띄운다(buildFunctionSpotlight). 섹션 좁히기 위에 얹는 **추가** 레이어 — 핀 신호가 없으면 종전과 동일.
   */
  private _render(doc: KnowledgeDoc, query: string): string {
    const header = `## [${doc.source}]`;
    if (doc.kind === 'example' || doc.kind === 'source') {
      return `${header}\n\n${doc.body}`;
    }
    // 세부 함수 핀(문서 전체 본문 기준 추출) — 섹션 좁히기와 독립적으로 맨 위에 얹는다.
    const spotlight = buildFunctionSpotlight(doc.source, doc.body, query);
    const pin = spotlight ? `${spotlight}\n\n` : '';

    const focused = focusKnowledgeBody(doc.source, doc.body, query);
    if (!focused) return `${header}\n\n${pin}${doc.body}`;
    const note = focused.droppedLabels.length
      ? `\n\n> 📎 이 문서의 다른 섹션: ${focused.droppedLabels.join(' · ')}. ` +
        `전체가 필요하면 "전체"·"전부"처럼 넓게 물어보세요.`
      : '';
    return `${header}\n\n${pin}${focused.body}${note}`;
  }
}

/** 첫 등장 순서를 보존하며 중복 제거. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}
