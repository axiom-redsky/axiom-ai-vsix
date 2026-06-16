/**
 * 오프라인 지식 응답 골든 — **모델 비의존**.
 *
 * 실제 knowledge/*.md를 주입해 OfflineKnowledgeRetriever + KnowledgeDoc 파이프라인을
 * 결정론적으로 검증한다. 핵심 회귀: "useApi 예제 보여줘"에 frontmatter만 나오고 코드가
 * 0줄이던 버그가 재발하지 않는지(코드 통째 노출 + frontmatter 제거 + example 우선).
 *
 * 임베딩(semanticSources)은 빈 배열로 둬 인덱스 미준비 graceful 폴백 경로까지 함께 본다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseKnowledgeDoc, splitFrontmatter, deriveKind } from '../src/ai/KnowledgeDoc';
import { OfflineKnowledgeRetriever, hasShowCodeIntent } from '../src/ai/OfflineKnowledgeRetriever';
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
    semanticSources: async () => [], // 인덱스 미준비 graceful 경로
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

  // 후보 0개 → 빈 배열(섹션 생략)
  const empty = new OfflineKnowledgeRetriever({
    keywordSources: () => [], semanticSources: async () => [], fileContextSources: () => [], loadDoc,
  });
  const none = await empty.retrieve('아무 관련 없는 질문', qnaIntent);
  check('후보 0개 → 빈 배열', none.length === 0, `${none.length}`);
})();

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
