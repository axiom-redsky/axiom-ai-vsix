/**
 * 오프라인 의도 분류(classifyOfflineIntent) + OfflineResponder 렌더 회귀 테스트.
 * (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행). 실행: node scripts/run-test-offline-intent.mjs
 *
 * 캡처 회귀: "현재 화면의 jsx 부분을 …EmployeeListPage.tsx 파일의 jsx로 적용해줘"(수정 요청)에
 * useState 튜토리얼이 응답되던 문제. 의도를 modify_file로 결정론 분류하고, 그룹별 프레이밍 +
 * 로컬 RAG 본문으로 응답하는지 검증한다.
 */
import { classifyOfflineIntent, extractFilePathRef } from '../src/ai/IntentSignals';
import { OfflineResponder } from '../src/ai/OfflineResponder';
import type { IntentContext } from '../src/ai/IntentClassifier';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

const withFile = (f: string | null): IntentContext => ({ currentFile: f, hasSelection: false, domains: [] });
const noFile = withFile(null);

console.log('\nclassifyOfflineIntent:');

// 캡처 사례: 현재 파일 수정 + 내용 출처 경로
{
  const q = '현재 화면의 jsx 부분을 /src/publishing/employee/pages/EmployeeListPage.tsx 파일의 jsx로 적용해줘';
  const r = classifyOfflineIntent(q, withFile('src/domains/employee/pages/EmployeeListPage.tsx'));
  check('캡처 프롬프트 → modify_file', r.intent === 'modify_file', `got ${r.intent}`);
  check('캡처 프롬프트 → targetFile=current', r.targetFile === 'current', `got ${r.targetFile}`);
  check('캡처 프롬프트 → contentSource 경로 추출',
    r.contentSource === 'src/publishing/employee/pages/EmployeeListPage.tsx', `got ${r.contentSource}`);
}

// 잡담
check('"안녕" → smalltalk', classifyOfflineIntent('안녕', noFile).intent === 'smalltalk');
check('"ㅋㅋㅋ" → smalltalk', classifyOfflineIntent('ㅋㅋㅋ', noFile).intent === 'smalltalk');

// 질문(조회·설명)
check('"useApi 사용법 알려줘" → qna', classifyOfflineIntent('useApi 사용법 알려줘', noFile).intent === 'qna');
check('"라우터는 어떻게 써?" → qna', classifyOfflineIntent('라우터는 어떻게 써?', noFile).intent === 'qna');

// 페이지 생성
{
  const r = classifyOfflineIntent('상품 목록 화면 만들어줘', noFile);
  check('"상품 목록 화면 만들어줘" → create_page', r.intent === 'create_page', `got ${r.intent}`);
}
{
  const r = classifyOfflineIntent('CatalogListPage 페이지를 만들어줘', noFile);
  check('"CatalogListPage 페이지를 만들어줘" → create_page + pageName',
    r.intent === 'create_page' && r.pageName === 'CatalogListPage', `got ${r.intent}/${r.pageName}`);
}

// 수정 동사가 잡담/질문보다 우선
check('"버튼 색 바꿔줘"(현재파일) → modify_file',
  classifyOfflineIntent('버튼 색 바꿔줘', withFile('src/domains/main/pages/MainPage.tsx')).intent === 'modify_file');

// 경로 추출 유틸
check('extractFilePathRef — 선행 슬래시 제거',
  extractFilePathRef('/src/a/B.tsx 적용') === 'src/a/B.tsx');
check('extractFilePathRef — 경로 없음 → null', extractFilePathRef('그냥 텍스트') === null);

console.log('\nOfflineResponder.respond:');

// RAG 본문이 그룹 템플릿에 주입되는지 (deps 주입으로 vscode/디스크 불필요)
const responder = new OfflineResponder({
  retrieveDocs: async (q) => (q.includes('useApi') ? ['## useApi 훅\n로컬 지식 본문'] : []),
  selectStub: () => '스텁 폴백 본문',
  loadGroupTemplate: () => null, // 내장 기본 템플릿 사용
});

await (async () => {
  const qna = await responder.respond({ query: 'useApi 사용법 알려줘', currentFile: null, currentFileContent: '' });
  check('qna 응답에 RAG 본문 포함', qna.includes('로컬 지식 본문'), qna);
  check('qna 응답에 오프라인 배지 포함', qna.includes('오프라인 모드'), qna);
  check('qna 응답에 useState 튜토리얼 없음(회귀)', !/useState\s*</.test(qna));

  const ragless = await responder.respond({ query: '무언가 설명해줘', currentFile: null, currentFileContent: '' });
  check('RAG 비었을 때 스텁 폴백', ragless.includes('스텁 폴백 본문'), ragless);

  const modify = await responder.respond({
    query: '현재 화면에 /api/employees 목록을 useApi로 적용해줘',
    currentFile: 'src/domains/employee/pages/EmployeeListPage.tsx',
    currentFileContent: 'const x = 1;',
  });
  check('modify 응답에 의도 요약(🧭) 포함', modify.includes('🧭'), modify);
  check('modify 응답에 useApi 계약 카드 포함', modify.includes('useApi'), modify);
  check('modify 응답에 미치환 placeholder 없음', !/\{\{[a-z_]+\}\}/i.test(modify), modify);

  const small = await responder.respond({ query: '안녕', currentFile: null, currentFileContent: '' });
  check('smalltalk 응답은 친근(에러창 아님)', small.includes('안녕하세요'), small);
})();

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
