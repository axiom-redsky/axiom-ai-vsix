/**
 * cross-cutting 게이트 실경로 검증 — 실제 본체 runHybridRegionEdit(RegionEditService)를 그대로 호출한다.
 *
 * 게이트는 모델 호출 **전에** 작동하므로 LLM 없이 검증 가능하다. 가짜 callModel을 넣고
 * "다중지점 쿼리에선 모델이 한 번도 안 불리고 cross-cutting full 폴백" / "단일컨트롤은 모델이 불림"을
 * 대조한다. 실행: node scripts/run-probe-crosscut.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { runHybridRegionEdit } from '../src/ai/RegionEditService';

const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts', 'eval-fixtures', 'EmployeeListPage.tsx'), 'utf-8');

const CASES = [
  {
    label: '다중지점(사용자 실측)',
    query: '현재 파일에 select(부서, 재직상태, 투입상태)를 변경하면, 아래쪽 인력 리스트 테이블의 내용을 필터링 하게 적용해줘',
    expectModelCalled: false,
    expectStatus: 'fallback',
    expectReason: 'cross-cutting',
  },
  {
    label: '단일컨트롤(대조군)',
    query: '재직상태 select를 api로 바꿔줘',
    expectModelCalled: true, // 게이트 통과 → 모델 호출됨(여기선 가짜가 원본 echo)
    expectStatus: undefined, // 모델이 원본을 그대로 반환 → no-op 폴백 등 — 상태는 보지 않고 "모델 호출 여부"만 본다
    expectReason: undefined,
  },
];

let allOk = true;

for (const c of CASES) {
  let modelCalls = 0;
  // 가짜 모델: 게이트를 통과해 여기까지 오면 호출 횟수만 세고, 원본 영역을 그대로 echo한다.
  const fakeModel = async (system: string, _user: string): Promise<string> => {
    modelCalls++;
    const region = system.match(/## 편집 영역[^\n]*\n```tsx\n([\s\S]*?)\n```/)?.[1] ?? '';
    return `<region>\n${region}\n</region>`;
  };

  const out = await runHybridRegionEdit(source, c.query, fakeModel);

  const modelOk = (modelCalls > 0) === c.expectModelCalled;
  const statusOk = c.expectStatus === undefined || out.status === c.expectStatus;
  const reasonOk = c.expectReason === undefined || out.reason === c.expectReason;
  const pass = modelOk && statusOk && reasonOk;
  if (!pass) allOk = false;

  console.log('='.repeat(90));
  console.log(`■ ${c.label}`);
  console.log(`  쿼리: "${c.query}"`);
  console.log(`  모델 호출 횟수: ${modelCalls}  (기대: ${c.expectModelCalled ? '호출됨' : '0 — 게이트가 차단'})`);
  console.log(`  결과: status=${out.status}${out.reason ? ` reason=${out.reason}` : ''}`);
  console.log(`  진단: ${out.diagnostics}`);
  console.log(`  판정: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
}

console.log('='.repeat(90));
console.log(allOk
  ? '✅ cross-cutting 게이트가 다중지점을 모델 호출 0회로 full 폴백, 단일컨트롤은 모델로 통과.'
  : '❌ 게이트 동작이 기대와 다름 — 확인 필요.');
process.exitCode = allOk ? 0 : 1;
