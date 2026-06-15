/**
 * knowledge/_index.md 키워드 라우팅 커버리지 테스트(임베딩 불필요 — 결정론).
 * "금액 유틸" 같은 스캐폴드 기능 질문이 올바른 knowledge 문서로 라우팅되는지 보증한다.
 * 실행: node scripts/run-test-knowledge-routing.mjs
 */
import * as path from 'node:path';
import { KeywordRetriever } from '../src/ai/KeywordRetriever';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); }
}

const kr = new KeywordRetriever();
kr.initialize(path.resolve('knowledge'));

const cases: { query: string; expect: string }[] = [
  { query: '금액 표기 3자리 쉼표찍기 유틸 사용법 알려줘', expect: 'utils/util.md' },
  { query: '천 단위 콤마 어떻게 찍어?', expect: 'utils/util.md' },
  { query: '숫자 반올림 유틸 있어?', expect: 'utils/util.md' },
  { query: '문자열 마스킹 함수 알려줘', expect: 'utils/util.md' },
  { query: 'className 병합 cn 사용법', expect: 'utils/cn.md' },
  { query: 'dayjs 사용법 알려줘', expect: 'libraries/dayjs.md' },
  { query: 'useApi 사용법 알려줘', expect: 'patterns/use-api.md' },
];

console.log('\nknowledge 키워드 라우팅:');
for (const c of cases) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
