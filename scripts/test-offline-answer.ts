/**
 * 오프라인 지식 응답 골든 — **모델 비의존**.
 *
 * 실제 knowledge/*.md를 주입해 OfflineKnowledgeRetriever + KnowledgeDoc 파이프라인을
 * 결정론적으로 검증한다. 핵심 회귀: "useApi 예제 보여줘"에 frontmatter만 나오고 코드가
 * 0줄이던 버그가 재발하지 않는지(코드 통째 노출 + frontmatter 제거 + example 우선).
 *
 * 임베딩(semanticScores)은 빈 배열로 둬 인덱스 미준비 graceful 폴백 경로까지 함께 본다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseKnowledgeDoc, splitFrontmatter, deriveKind } from '../src/ai/KnowledgeDoc';
import { OfflineKnowledgeRetriever, hasShowCodeIntent, FALLBACK_HINT } from '../src/ai/OfflineKnowledgeRetriever';
import type { IntentResult } from '../src/ai/intent/IntentClassifier';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
}

const KNOWLEDGE = path.resolve('knowledge');
const loadDoc = (source: string): string | null => {
  const abs = path.join(KNOWLEDGE, source);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
};
const qnaIntent: IntentResult = {
  intent: 'qna', pageName: null, domain: null, contentSource: null, targetFile: null, targetComponent: null,
};

console.log('KnowledgeDoc 파싱:');
{
  const raw = loadDoc('patterns/use-api-example.md');
  check('use-api-example.md 로드됨', !!raw, 'knowledge/patterns/use-api-example.md 없음');
  if (raw) {
    const doc = parseKnowledgeDoc('patterns/use-api-example.md', raw);
    check('kind=example 또는 source', doc.kind === 'example' || doc.kind === 'source', doc.kind);
    check('코드블록 추출됨', doc.codeBlocks.length > 0, `${doc.codeBlocks.length}`);
    check('body에 frontmatter 누수 없음', !/^title:\s*/m.test(doc.body) && !/^tags:\s*\[/m.test(doc.body), doc.body.slice(0, 80));
    check('body에 useApi 코드 존재', /useApi\s*[<(]/.test(doc.body), '');
    check('title 추출', doc.title.length > 0, doc.title);
  }

  // frontmatter 분리 단위
  const { fm, body } = splitFrontmatter('---\ntitle: "X"\ncategory: source\n---\n# 본문\n코드');
  check('splitFrontmatter fm 파싱', fm.title === 'X' && fm.category === 'source', JSON.stringify(fm));
  check('splitFrontmatter body 분리', body.startsWith('# 본문'), body);

  // kind 유도: 명시 override
  check('kind override(frontmatter kind 우선)',
    deriveKind({ source: 'x.md', fmKind: 'catalog', fmCategory: 'pattern', body: '', codeBlocks: [] }) === 'catalog');
  check('kind: catalog 경로 유도',
    deriveKind({ source: 'catalog/overview.md', body: '', codeBlocks: [] }) === 'catalog');

  // ② 코드블록이 커도 category/마커 없으면 example 아님(reference) — 무관 문서 오분류 방지
  const bigCode = '```ts\n' + 'const x = 1;\n'.repeat(60) + '```';
  check('큰 코드블록만으로는 example 아님(→reference)',
    deriveKind({ source: 'conventions/naming.md', body: `# 규칙\n${bigCode}`, codeBlocks: [bigCode] }) === 'reference',
    deriveKind({ source: 'conventions/naming.md', body: `# 규칙\n${bigCode}`, codeBlocks: [bigCode] }));
  check('category: pattern → pattern 유지',
    deriveKind({ source: 'patterns/error-handling.md', fmCategory: 'pattern', body: bigCode, codeBlocks: [bigCode] }) === 'pattern');
  check('"## 전체 소스" 마커 → example',
    deriveKind({ source: 'x.md', body: '## 전체 소스\n```ts\nx\n```', codeBlocks: [] }) === 'example');
}

console.log('\nhasShowCodeIntent:');
{
  check('"예제 보여줘" → true', hasShowCodeIntent('useApi 사용 예제를 보여줘'));
  check('"사용법 알려줘" → true', hasShowCodeIntent('useApi 사용법 알려줘'));
  check('"이게 뭐야" → false', !hasShowCodeIntent('이 훅이 뭐하는 거야'));
}

console.log('\nOfflineKnowledgeRetriever (실제 knowledge 주입):');
await (async () => {
  // 시나리오: 키워드가 pattern 문서를 먼저 줘도, show-code 의도면 example 문서가 앞으로.
  const retriever = new OfflineKnowledgeRetriever({
    keywordSources: () => ['patterns/use-api.md', 'patterns/use-api-example.md'],
    semanticScores: async () => [], // 인덱스 미준비 graceful 경로
    fileContextSources: () => [],
    loadDoc,
  });

  const blocks = await retriever.retrieve('useApi 사용 예제를 보여줘', qnaIntent);
  const joined = blocks.join('\n\n---\n\n');

  check('문서 블록 반환됨', blocks.length > 0, `${blocks.length}`);
  check('출력에 코드펜스 존재(코드가 답)', /```tsx?[\s\S]*useApi\s*[<(]/.test(joined), joined.slice(0, 120));
  check('출력에 frontmatter 덤프 없음', !/title:\s*"useApi/.test(joined) && !/tags:\s*\[/.test(joined), '');
  check('show-code 의도 → example 문서가 맨 앞', blocks[0].includes('[patterns/use-api-example.md]'), blocks[0].slice(0, 80));
  check('출처 헤더 형식 유지', /^## \[patterns\//.test(blocks[0]), blocks[0].slice(0, 40));

  // show-code 아닌 일반 질문은 검색 순서 존중(pattern 먼저)
  const plain = await retriever.retrieve('useApi 훅이 무슨 일을 해', qnaIntent);
  check('비-show-code → 검색 순서 존중(pattern 먼저)', plain[0].includes('[patterns/use-api.md]'), plain[0]?.slice(0, 60) ?? 'empty');

  // ① 정밀(키워드) pattern 문서가 의미검색 example/source 노이즈에 밀리지 않는다.
  // show-code('사용법')라도 키워드로 매칭된 use-api.md(pattern)가 의미검색 use-api-example/source보다 앞.
  const provRetriever = new OfflineKnowledgeRetriever({
    keywordSources: () => ['patterns/use-api.md'],                 // 정밀(키워드 가산점)
    semanticScores: async () => [                                  // 의미(가산점 없음, 점수만)
      { source: 'patterns/use-api-example.md', score: 0.5 },
      { source: 'patterns/use-api-source.md', score: 0.5 },
    ],
    fileContextSources: () => [],
    loadDoc,
  });
  const prov = await provRetriever.retrieve('useApi 사용법 알려줘', qnaIntent);
  check('① 정밀 pattern이 의미검색 코드문서보다 앞', prov[0].includes('[patterns/use-api.md]'), prov[0]?.slice(0, 60) ?? 'empty');

  // ② 점수 타이브레이크: 둘 다 키워드 매칭(동점 가산점)이면 의미 점수가 높은 문서가 앞.
  // "목록" 범용 키워드로 Table·util이 같이 잡혀도, 질문 의미에 가까운 util이 위로 와야 한다.
  const tieRetriever = new OfflineKnowledgeRetriever({
    keywordSources: () => ['components/Table.md', 'utils/util.md'], // 둘 다 키워드 매칭(동점)
    semanticScores: async () => [                                   // util이 의미적으로 더 가까움
      { source: 'utils/util.md', score: 0.6 },
      { source: 'components/Table.md', score: 0.15 },
    ],
    fileContextSources: () => [],
    loadDoc,
  });
  const tie = await tieRetriever.retrieve('유틸함수 목록 보여줘', qnaIntent);
  check('② 키워드 동점 → 의미 점수 높은 문서가 앞(util>Table)', tie[0].includes('[utils/util.md]'), tie[0]?.slice(0, 60) ?? 'empty');

  // ②' util.md(종합 레퍼런스)는 6개 네임스페이스 전체가 잘리지 않고 렌더돼야 한다.
  // (PER_DOC_CHAR_CAP 회귀 가드 — 캡이 작으면 string 뒤(finance·object·array)가 사라진다.)
  const utilBlock = tie.find((b) => b.includes('[utils/util.md]')) ?? '';
  const hasAllNs = ['$util.number', '$util.date', '$util.string', '$util.finance', '$util.object', '$util.array'].every(
    (ns) => utilBlock.includes(ns),
  );
  check('②′ util.md 6개 네임스페이스 전부 렌더(잘림 없음)', hasAllNs && !utilBlock.includes('문서가 길어'),
    hasAllNs ? 'all-ns' : 'missing-ns');

  // ②″ 섹션 좁히기(focus): "특정 부분" 의도면 util.md를 해당 네임스페이스로 좁혀 렌더한다.
  // "숫자 콤마 찍는 유틸" → 숫자 섹션만 + 잘라낸 섹션 footer. (전체 6개 덤프 방지)
  const focusRetriever = new OfflineKnowledgeRetriever({
    keywordSources: () => ['utils/util.md'],
    semanticScores: async () => [],
    fileContextSources: () => [],
    loadDoc,
  });
  const focused = await focusRetriever.retrieve('숫자 콤마 찍는 유틸리티 알려줘', qnaIntent);
  const focusBlock = focused.find((b) => b.includes('[utils/util.md]')) ?? '';
  check('②″ 특정질문 → 숫자 섹션 포함', focusBlock.includes('## 숫자 유틸'), focusBlock.slice(0, 80));
  check('②″ 특정질문 → 무관 섹션(배열·금융) 헤더 제외',
    !focusBlock.includes('## 배열 유틸') && !focusBlock.includes('## 금융 유틸'),
    focusBlock.slice(0, 120));
  check('②″ 특정질문 → 잘라낸 섹션 footer 노출', /다른 섹션:/.test(focusBlock) && /전체가 필요하면/.test(focusBlock),
    focusBlock.slice(-160));
  check('②″ 도입부($util 전역 사용법) 보존', focusBlock.includes('전역 유틸 $util') || focusBlock.includes('import 불필요'),
    focusBlock.slice(0, 120));

  // ②‴ 광범위 질문은 좁히지 않는다(분포 평평) → 6개 네임스페이스 전체 유지. (focus 과교정 가드)
  const broad = await focusRetriever.retrieve('유틸리티 사용법 알려줘', qnaIntent);
  const broadBlock = broad.find((b) => b.includes('[utils/util.md]')) ?? '';
  const broadHasAll = ['## 숫자 유틸', '## 날짜 유틸', '## 문자열 유틸', '## 금융 유틸', '## 객체 유틸', '## 배열 유틸'].every(
    (h) => broadBlock.includes(h),
  );
  check('②‴ 광범위 질문 → 전체 6개 섹션 유지(좁히지 않음)', broadHasAll && !/다른 섹션:/.test(broadBlock),
    broadHasAll ? 'all' : 'narrowed');

  // ⑨ SmartTable 의도 → SmartTable.md가 형제 Table.md 위로(SMARTTABLE_INTENT_BONUS).
  //    "smart table"은 'table' 부분문자열로 Table.md도 동시 매칭돼 동점이 되고, Table이 의미점수까지
  //    더 높아도(노이즈) SmartTable 의도 보너스로 SmartTable이 1등. Table은 2순위로 함께 노출.
  const smartTableDeps = {
    keywordSources: () => ['components/Table.md', 'components/SmartTable.md'], // 둘 다 키워드 매칭(동점), Table이 합집합서 먼저
    semanticScores: async () => [
      { source: 'components/Table.md', score: 0.6 },        // Table이 의미점수 더 높아도(노이즈)
      { source: 'components/SmartTable.md', score: 0.2 },
    ],
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const smartTable = new OfflineKnowledgeRetriever(smartTableDeps);
  const stDocs = await smartTable.retrieve('smart table 사용법 알려줘', qnaIntent);
  check('⑨ SmartTable 의도 → SmartTable.md가 1등(Table 위로)',
    stDocs[0].includes('[components/SmartTable.md]'), stDocs.map((b) => b.split('\n')[0]).join(' | '));
  check('⑨ Table.md는 2순위로 함께 노출',
    stDocs.some((b) => b.includes('[components/Table.md]')), stDocs.map((b) => b.split('\n')[0]).join(' | '));
  // ⑨' SmartTable 신호 없는 순수 "table" 질문엔 보너스 미발동(Table 선두 유지 — 과교정 방지).
  const plainTableDocs = await smartTable.retrieve('table 사용법 알려줘', qnaIntent);
  check("⑨' 순수 table 질문 → 보너스 미발동(Table 선두)",
    plainTableDocs[0].includes('[components/Table.md]'), plainTableDocs.map((b) => b.split('\n')[0]).join(' | '));

  // 후보 0개 + 폴백 미주입 → 빈 배열(섹션 생략, 종전 동작)
  const empty = new OfflineKnowledgeRetriever({
    keywordSources: () => [], semanticScores: async () => [], fileContextSources: () => [], loadDoc,
  });
  const none = await empty.retrieve('아무 관련 없는 질문', qnaIntent);
  check('후보 0개 + 폴백 미주입 → 빈 배열', none.length === 0, `${none.length}`);

  // 후보 0개 + 폴백 주입 → 카탈로그로 보충(빈손 방지) + 힌트 첫 블록
  const fallbackDeps = {
    keywordSources: () => [] as string[],
    semanticScores: async () => [] as Array<{ source: string; score: number }>,
    fileContextSources: () => [] as string[],
    loadDoc,
    fallbackSources: () => ['catalog/overview.md'],
  };
  const fb = new OfflineKnowledgeRetriever(fallbackDeps);
  const fbBlocks = await fb.retrieve('도무지 매칭 안 되는 질문', qnaIntent);
  check('빈 검색 + 폴백 → 비지 않음(빈손 방지)', fbBlocks.length > 0, `${fbBlocks.length}`);
  check('폴백 시 힌트가 첫 블록', fbBlocks[0] === FALLBACK_HINT, fbBlocks[0]?.slice(0, 40) ?? 'empty');
  check('폴백 시 카탈로그 문서 노출', fbBlocks.some((b) => b.includes('[catalog/overview.md]')), '');

  // smalltalk 의도는 폴백하지 않는다(인사에 카탈로그 부적절)
  const smalltalkIntent: IntentResult = {
    intent: 'smalltalk', pageName: null, domain: null, contentSource: null, targetFile: null, targetComponent: null,
  };
  const fbSmall = await fb.retrieve('안녕', smalltalkIntent);
  check('smalltalk → 폴백 안 함(빈 배열)', fbSmall.length === 0, `${fbSmall.length}`);

  // 정밀 검색이 맞으면 폴백 미발동(힌트 없음)
  const hitDeps = new OfflineKnowledgeRetriever({
    ...fallbackDeps,
    keywordSources: () => ['patterns/use-api.md'],
  });
  const hit = await hitDeps.retrieve('useApi 사용법', qnaIntent);
  check('정밀 검색 적중 → 힌트 없음', hit.length > 0 && hit[0] !== FALLBACK_HINT, hit[0]?.slice(0, 40) ?? 'empty');

  // ③ 파일컨텍스트 노이즈 차단(회귀): 도메인 파일을 열어둔 채 개념 질문("페이지 만드는 법")을 하면
  //    열린 파일의 import(Button·Input·Select)가 FILE_BOOST로 키워드 정밀 매칭을 밀어내던 버그.
  //    qna 의도에서는 파일컨텍스트를 쓰지 않아 키워드 문서(create-page-guide)가 그대로 떠야 한다.
  const fileNoiseDeps = {
    keywordSources: () => ['page-templates/create-page-guide.md', 'patterns/domain-structure.md'],
    semanticScores: async () => [
      { source: 'components/Button.md', score: 0.9 },
      { source: 'components/Input.md', score: 0.8 },
      { source: 'components/Select.md', score: 0.8 },
    ],
    fileContextSources: () => ['components/Button.md', 'components/Input.md', 'components/Select.md'],
    loadDoc,
  };
  const qnaFile = new OfflineKnowledgeRetriever(fileNoiseDeps);
  const qnaDocs = await qnaFile.retrieve('페이지 만드는 법 알려줘', qnaIntent, 'import { Button, Input, Select } from "@axiom/components/ui";');
  check('③ qna + 파일열림 → 키워드 문서가 뜸(create-page-guide)',
    qnaDocs.some((b) => b.includes('[page-templates/create-page-guide.md]')), qnaDocs.map((b) => b.split('\n')[0]).join(' | '));
  check('③ qna + 파일열림 → 파일 import(Button/Input/Select)는 top에 안 섞임',
    !qnaDocs[0].includes('[components/Button.md]'), qnaDocs[0]?.slice(0, 60) ?? 'empty');

  // ③' modify_file 의도에서는 파일컨텍스트가 정상 동작해야 한다(과교정 방지).
  const modifyIntent: IntentResult = {
    intent: 'modify_file', pageName: null, domain: null, contentSource: null, targetFile: null, targetComponent: null,
  };
  const modDocs = await qnaFile.retrieve('이 파일에 버튼 추가해줘', modifyIntent, 'import { Button } from "@axiom/components/ui";');
  check('③\' modify_file → 파일컨텍스트(Button) 노출 유지',
    modDocs.some((b) => b.includes('[components/Button.md]')), modDocs.map((b) => b.split('\n')[0]).join(' | '));

  // ④ 범용 React 레퍼런스(react-reference/*.md)가 오프라인에서 검색·노출된다(순수 React 질문).
  //    scaffold 키워드와 겹치지 않는 순수 개념 질문은 react-reference가 그대로 1등이어야 한다.
  const reactRefDeps = {
    keywordSources: () => ['react-reference/useEffect.md'],
    semanticScores: async () => [] as Array<{ source: string; score: number }>,
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const reactRef = new OfflineKnowledgeRetriever(reactRefDeps);
  const refDocs = await reactRef.retrieve('useEffect 의존성 배열이 뭐야', qnaIntent);
  check('④ 순수 React 질문 → react-reference 문서 노출(useEffect)',
    refDocs.some((b) => b.includes('[react-reference/useEffect.md]')), refDocs.map((b) => b.split('\n')[0]).join(' | '));
  check('④ react-reference 본문 렌더(의존성 배열 설명 포함)',
    refDocs.join('\n').includes('의존성'), refDocs[0]?.slice(0, 60) ?? 'empty');

  // ⑤ soft precedence — 진짜 충돌(둘 다 키워드 매칭, 의미 동점): scaffold 보너스(+0.3)가 동점을 깨
  //    scaffold가 앞선다. (예: "useEffect로 데이터 가져오기" → useApi가 먼저, useEffect는 보완.)
  const conflictTieDeps = {
    keywordSources: () => ['patterns/use-api.md', 'react-reference/useEffect.md'],
    semanticScores: async () => [] as Array<{ source: string; score: number }>,
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const conflictTie = new OfflineKnowledgeRetriever(conflictTieDeps);
  const tieDocs = await conflictTie.retrieve('useEffect로 데이터 가져오는 법', qnaIntent);
  check('⑤ 충돌+의미동점 → scaffold(use-api)가 앞(보너스가 동점 깸)',
    tieDocs[0].includes('[patterns/use-api.md]'), tieDocs[0]?.slice(0, 60) ?? 'empty');
  check('⑤ React 레퍼런스는 보완으로 함께 노출',
    tieDocs.some((b) => b.includes('[react-reference/useEffect.md]')), tieDocs.map((b) => b.split('\n')[0]).join(' | '));

  // ⑤′ 핵심 회귀(하드 티어 매장 버그): **무관한 scaffold 노이즈**(키워드 없이 의미만 0.25로 걸린 Table)는
  //     정밀하게 맞은 React 문서(키워드+의미 0.6)를 못 이긴다. 하드 티어였다면 Table이 1등으로 매장했다.
  //     soft에선 useEffect=1.0+0.6=1.6 > Table=0.25+0.3=0.55 → React가 1등.
  const noiseDeps = {
    keywordSources: () => ['react-reference/useEffect.md'], // React만 키워드 정밀 매칭
    semanticScores: async () => [
      { source: 'react-reference/useEffect.md', score: 0.6 },
      { source: 'components/Table.md', score: 0.25 }, // scaffold지만 무관한 의미 노이즈
    ],
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const noise = new OfflineKnowledgeRetriever(noiseDeps);
  const noiseDocs = await noise.retrieve('useEffect 의존성 배열이 뭐야', qnaIntent);
  check('⑤′ 무관한 scaffold 노이즈는 강한 React 정밀 매칭을 못 매장(React 1등)',
    isGenericRef(noiseDocs[0]) && noiseDocs[0].includes('[react-reference/useEffect.md]'),
    noiseDocs.map((b) => b.split('\n')[0]).join(' | '));

  // ⑤″ scaffold가 **진짜 강할 때**(키워드+높은 의미)는 보너스까지 더해 React보다 확실히 앞선다.
  //     use-api=1.0+0.6+0.3=1.9 > useEffect=1.0+0.55=1.55 → scaffold 1등(진짜 충돌에서 scaffold 우선).
  const strongScaffoldDeps = {
    keywordSources: () => ['patterns/use-api.md', 'react-reference/useEffect.md'],
    semanticScores: async () => [
      { source: 'patterns/use-api.md', score: 0.6 },
      { source: 'react-reference/useEffect.md', score: 0.55 },
    ],
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const strongScaffold = new OfflineKnowledgeRetriever(strongScaffoldDeps);
  const strongDocs = await strongScaffold.retrieve('서버 데이터 조회 훅', qnaIntent);
  check('⑤″ scaffold 강매칭 → React보다 앞(진짜 충돌 scaffold 우선)',
    strongDocs[0].includes('[patterns/use-api.md]'), strongDocs[0]?.slice(0, 60) ?? 'empty');

  // ⑥ 유틸 의도 우선(UTIL_INTENT_BONUS): "오늘날짜 유틸리티"는 dayjs(키워드 "날짜")와
  //    util.md(키워드 "유틸리티")가 동시 매칭돼 동점이지만, 사용자가 "유틸"을 명시했으니 $util이 선두.
  //    (종전엔 _index 등장 순서로 dayjs가 우연히 1등이던 회귀를 박는다.)
  const utilVsLibDeps = {
    keywordSources: () => ['libraries/dayjs.md', 'utils/util.md'], // dayjs가 합집합에서 먼저(동점 시 우연히 1등)
    semanticScores: async () => [] as Array<{ source: string; score: number }>,
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const utilVsLib = new OfflineKnowledgeRetriever(utilVsLibDeps);
  const utilFirst = await utilVsLib.retrieve('오늘날짜 유틸리티', qnaIntent);
  check('⑥ 유틸 의도 명시 → $util이 dayjs보다 앞', utilFirst[0].includes('[utils/util.md]'),
    utilFirst.map((b) => b.split('\n')[0]).join(' | '));
  check('⑥ dayjs는 보완으로 함께 노출', utilFirst.some((b) => b.includes('[libraries/dayjs.md]')),
    utilFirst.map((b) => b.split('\n')[0]).join(' | '));

  // ⑥′ 유틸 마커가 없으면 보너스 미발동 → 종전 동작(합집합 순서). "오늘 날짜 포맷"엔 dayjs가 먼저.
  const noUtilMarker = await utilVsLib.retrieve('오늘 날짜 포맷', qnaIntent);
  check('⑥′ 유틸 마커 없으면 보너스 미발동(dayjs 선두 유지)', noUtilMarker[0].includes('[libraries/dayjs.md]'),
    noUtilMarker.map((b) => b.split('\n')[0]).join(' | '));

  // ⑦ 복합어 분해 좁히기(expandCompoundTokens): "오늘날짜 유틸리티"는 공백으로만 쪼개면 "오늘날짜"가
  //    헤더 "## 날짜 유틸"에 매칭 못 해 전체가 노출됐다. "오늘날짜"→"날짜" 분해로 date 섹션만 좁힌다.
  const dateFocusDeps = {
    keywordSources: () => ['utils/util.md'],
    semanticScores: async () => [] as Array<{ source: string; score: number }>,
    fileContextSources: () => [] as string[],
    loadDoc,
  };
  const dateFocus = new OfflineKnowledgeRetriever(dateFocusDeps);
  const dateBlocks = await dateFocus.retrieve('오늘날짜 유틸리티', qnaIntent);
  const dateBlock = dateBlocks.find((b) => b.includes('[utils/util.md]')) ?? '';
  check('⑦ 복합어 "오늘날짜" → 날짜 섹션으로 좁힘', dateBlock.includes('## 날짜 유틸'), dateBlock.slice(0, 100));
  check('⑦ 무관 섹션(배열·금융) 헤더 제외',
    !dateBlock.includes('## 배열 유틸') && !dateBlock.includes('## 금융 유틸'), dateBlock.slice(0, 140));
  check('⑦ 잘라낸 섹션 footer 노출', /다른 섹션:/.test(dateBlock), dateBlock.slice(-160));

  // ⑧ 함수 스포트라이트(buildFunctionSpotlight): 세부 함수 겨냥 시 해당 함수 예시를 맨 위에 핀.
  //    문서 주도(주석 기반) — util.md 함수 주석의 개념어로 매칭. 광범위/무신호 쿼리는 핀 생략(오탐 0).
  const spotIdx = dateBlock.indexOf('🎯');
  const dateSecIdx = dateBlock.indexOf('## 날짜 유틸');
  check('⑧ "오늘날짜" → 핀 블록 존재', spotIdx >= 0, dateBlock.slice(0, 60));
  check('⑧ 핀이 날짜 섹션보다 위에 위치', spotIdx >= 0 && dateSecIdx >= 0 && spotIdx < dateSecIdx, `pin=${spotIdx} sec=${dateSecIdx}`);
  check('⑧ 핀에 오늘 관련 함수(now·isToday)', /\$util\.date\.now\(/.test(dateBlock) && /\$util\.date\.isToday\(/.test(dateBlock),
    dateBlock.slice(spotIdx, spotIdx + 200));
  // 핀은 변별 함수만 — 무관 함수(영업일·분기)는 핀 안에 없어야(섹션 본문엔 있을 수 있음).
  const pinOnly = spotIdx >= 0 ? dateBlock.slice(spotIdx, dateSecIdx) : '';
  check('⑧ 핀에 무관 함수(영업일·분기) 미포함', !/isBusinessDay|getQuarter/.test(pinOnly), pinOnly.slice(0, 160));

  // ⑧′ 광범위 질문은 핀 생략(focus도 안 좁힘 → 전체 6개 섹션, 핀 없음).
  const broadSpot = await dateFocus.retrieve('유틸리티 사용법 알려줘', qnaIntent);
  const broadSpotBlock = broadSpot.find((b) => b.includes('[utils/util.md]')) ?? '';
  check('⑧′ 광범위 질문 → 핀 생략', !broadSpotBlock.includes('🎯'), broadSpotBlock.slice(0, 80));

  // ⑧″ 다른 네임스페이스도 동일(콤마→number). 핀 존재 + comma 포함.
  const commaSpot = await dateFocus.retrieve('콤마 찍는 유틸리티', qnaIntent);
  const commaBlock = commaSpot.find((b) => b.includes('[utils/util.md]')) ?? '';
  check('⑧″ "콤마" → 핀에 number.comma', commaBlock.includes('🎯') && /\$util\.number\.comma\(/.test(commaBlock),
    commaBlock.slice(commaBlock.indexOf('🎯'), commaBlock.indexOf('🎯') + 160));

  // ⑧‴ 전 네임스페이스 커버리지(문서 주석 보강 회귀 가드) — 각 개념어가 올바른 함수를 핀.
  const coverage: Array<[string, RegExp]> = [
    ['요일 구하기', /\$util\.date\.dayOfWeek\(/],
    ['만나이 계산', /\$util\.date\.age\(/],
    ['부가세', /\$util\.number\.vat\(/],
    ['마스킹', /\$util\.string\.maskName\(/],
    ['base64 인코딩', /\$util\.string\.base64Encode\(/], // 함수명 숫자 회귀 가드
    ['깊은복사', /\$util\.object\.deepClone\(/],
    ['깊은비교', /\$util\.object\.deepEqual\(/],          // 공백 무시 매칭 회귀 가드
    ['대출 상환', /\$util\.finance\.monthlyPayment\(/],
    ['그룹핑', /\$util\.array\.groupBy\(/],
    ['중복제거', /\$util\.array\.uniq\(/],
  ];
  for (const [q, re] of coverage) {
    const blocks = await dateFocus.retrieve(q, qnaIntent);
    const block = blocks.find((b) => b.includes('[utils/util.md]')) ?? '';
    const pin = block.includes('🎯') ? block.slice(block.indexOf('🎯'), block.indexOf('# 전역 유틸')) : '';
    check(`⑧‴ "${q}" → 핀에 정답 함수`, re.test(pin), pin.slice(0, 160) || '(핀 없음)');
  }
})();

/** 렌더된 블록이 react-reference 출처 헤더로 시작하는지(테스트 헬퍼). */
function isGenericRef(block: string): boolean {
  return /^## \[react-reference\//.test(block);
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
