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
import type { IntentResult } from '../src/ai/IntentClassifier';

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
})();

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
