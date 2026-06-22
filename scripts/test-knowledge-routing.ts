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
  // 전역 $ui.alert / $ui.confirm 다이얼로그
  { query: 'alert 사용 예제 보여줘', expect: 'utils/ui.md' },
  { query: 'confirm 확인창 띄우는 법', expect: 'utils/ui.md' },
  { query: '$ui.alert 사용법', expect: 'utils/ui.md' },
  { query: 'window.confirm 대신 뭐 써?', expect: 'utils/ui.md' },
  // 신규 공백 지식 문서(에러처리·커스텀훅·성능·테스트)
  { query: '에러 처리 어떻게 해', expect: 'patterns/error-handling.md' },
  { query: 'ErrorBoundary 폴백 UI 보여줘', expect: 'patterns/error-handling.md' },
  { query: '커스텀 훅 만드는 법', expect: 'patterns/custom-hooks.md' },
  { query: 'useDebounce 디바운스 훅', expect: 'patterns/custom-hooks.md' },
  { query: '렌더링 성능 최적화 방법', expect: 'patterns/performance.md' },
  { query: '코드 스플리팅 어떻게 해', expect: 'patterns/performance.md' },
  { query: 'storybook 스토리 작성법', expect: 'patterns/testing.md' },
  { query: '컴포넌트 테스트 모킹', expect: 'patterns/testing.md' },
  // ④ useApi 소스/구현 질문에만 core 소스 문서 매칭
  { query: 'useApi 소스 보여줘', expect: 'patterns/use-api-source.md' },
  { query: 'useApi 내부 구현 보여줘', expect: 'patterns/use-api-source.md' },
];

console.log('\nknowledge 키워드 라우팅:');
for (const c of cases) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}

// "alert 예제" 같은 일반 예제 질문이 useApi 예제로 새지 않아야 한다(greedy 키워드 회귀 방지).
console.log('\n예제 키워드 누수 방지:');
for (const q of ['alert 사용 예제 보여줘', 'router 예제 보여줘']) {
  const files = kr.matchedFiles(q);
  check(`"${q}" → use-api-example.md 비매칭`, !files.includes('patterns/use-api-example.md'), `matched=${JSON.stringify(files)}`);
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

// ④ "사용법" 질문에는 core 소스(use-api-source)가 끌려오지 않아야 한다.
console.log('\ncore 소스 누수 방지(④):');
for (const q of ['useApi 사용법 알려줘', 'useApi 어떻게 써?']) {
  const files = kr.matchedFiles(q);
  check(`"${q}" → use-api-source.md 비매칭`, !files.includes('patterns/use-api-source.md'), `matched=${JSON.stringify(files)}`);
}

// component.md greedy 키워드 정리 — useApi 질문에 컴포넌트 패턴 문서가 끌려오지 않아야 한다.
console.log('\ncomponent 패턴 누수 방지:');
for (const q of ['useApi 사용법 알려줘', 'useApi 어떻게 써?']) {
  const files = kr.matchedFiles(q);
  check(`"${q}" → react/component.md 비매칭`, !files.includes('react/component.md'), `matched=${JSON.stringify(files)}`);
}
// 단, 컴포넌트 패턴·구조·선언 순서 질문은 여전히 매칭돼야 한다.
for (const c of [
  { query: '컴포넌트 패턴 보여줘', expect: 'react/component.md' },
  { query: '컴포넌트 선언 순서 알려줘', expect: 'react/component.md' },
  { query: '훅 선언 순서가 어떻게 돼?', expect: 'react/component.md' },
]) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}

// 개별 컴포넌트 "사용법"은 일반 패턴(component.md)이 아니라 전용 문서로 라우팅돼야 한다.
console.log('\n개별 컴포넌트 → 전용 문서:');
for (const c of [
  { query: 'button 사용법 보여줘', expect: 'components/Button.md' },
  { query: 'input 사용법 알려줘', expect: 'components/Input.md' },
  { query: 'table 사용법', expect: 'components/Table.md' },
]) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
  check(`"${c.query}" → react/component.md 비매칭`, !files.includes('react/component.md'), `matched=${JSON.stringify(files)}`);
}

// "목록" 범용어 정리 — 유틸/카탈로그 "목록" 질문이 Table/list-page에 끌려가지 않아야 한다.
console.log('\n"목록" 범용어 누수 방지:');
for (const c of [
  { query: '사용할 수 있는 유틸함수 목록 보여줘', expect: 'utils/util.md' },
  { query: '유틸함수 목록', expect: 'utils/util.md' },
]) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
  check(`"${c.query}" → Table/list-page 비매칭`,
    !files.includes('components/Table.md') && !files.includes('page-templates/list-page.md'),
    `matched=${JSON.stringify(files)}`);
}
// 테이블/목록화면 질문은 여전히 정상 라우팅돼야 한다(과교정 방지).
for (const c of [
  { query: 'table 사용법', expect: 'components/Table.md' },
  { query: '목록 화면 만들어줘', expect: 'page-templates/list-page.md' },
]) {
  const files = kr.matchedFiles(c.query);
  check(`"${c.query}" → ${c.expect}`, files.includes(c.expect), `matched=${JSON.stringify(files)}`);
}
// table 질문에 list-page가 더는 새지 않아야 한다.
check('"table 사용법" → list-page.md 비매칭',
  !kr.matchedFiles('table 사용법').includes('page-templates/list-page.md'),
  JSON.stringify(kr.matchedFiles('table 사용법')));

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
