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
  // 개발자용 API 통신 = useApi (내부 callApi/api-call.md 아님)
  { query: 'api 통신하는 함수 알려줘', expect: 'patterns/use-api.md' },
  { query: '서버에서 데이터 불러오는 법', expect: 'patterns/use-api.md' },
  // 스캐폴드 공통 자산 카탈로그(목록) — 캡처 사례 "유틸 목록을 보여줘" 외 훅·컴포넌트·공통함수
  { query: '유틸 목록을 보여줘', expect: 'utils/util.md' },
  { query: '훅 목록을 보여줘', expect: 'catalog/hooks.md' },
  { query: '사용 가능한 훅 알려줘', expect: 'catalog/hooks.md' },
  { query: '컴포넌트 목록을 보여줘', expect: 'design-system/components.md' },
  { query: '공통함수 목록 보여줘', expect: 'catalog/overview.md' },
  { query: 'scaffold에 뭐가 있어?', expect: 'catalog/overview.md' },
];

console.log('\nknowledge 키워드 라우팅:');
for (const c of cases) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}

// 개발자용 일반 API 질문은 내부 클라이언트 문서(api-call.md)로 새지 않아야 한다.
console.log('\n내부 문서 누수 방지:');
for (const q of ['api 통신하는 함수 알려줘', '서버에서 데이터 불러오는 법', 'api 호출 어떻게 해']) {
  const files = kr.matchedFiles(q);
  check(`"${q}" → api-call.md 비매칭`, !files.includes('patterns/api-call.md'), `matched=${JSON.stringify(files)}`);
}
// 내부어는 여전히 내부 문서로 라우팅돼야 한다.
for (const c of [
  { query: 'callApi 내부 구현 보여줘', expect: 'patterns/api-call.md' },
  { query: 'axios 인터셉터 설정', expect: 'patterns/api-call.md' },
]) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
