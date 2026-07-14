/**
 * cross-cutting 게이트 + B+C(인벤토리·<replace>) 실경로 검증 — 본체 runHybridRegionEdit 그대로 호출.
 *
 * 게이트는 모델 호출 전에 작동하므로 LLM 없이 검증한다. 가짜 callModel로 다음을 본다:
 *  1) 다중지점 + 서버 params  → 게이트 통과(B+C), 모델 호출됨, <replace>로 params 보강 성공, select 중복 0
 *  2) 다중지점 + 서버 params 없음 → cross-cutting, 모델 호출 0, full 폴백
 *  3) 단일컨트롤            → 통과, 모델 호출됨
 * 실행: node scripts/run-probe-crosscut.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { runHybridRegionEdit } from '../src/ai/pipeline/RegionEditService';

const FX = (n: string): string => fs.readFileSync(path.resolve(process.cwd(), 'scripts', 'eval-fixtures', n), 'utf-8');
const employeeList = FX('EmployeeListPage.tsx');
const projectList = FX('ProjectListPage.tsx');

// 편집 영역(테이블)을 system 프롬프트에서 뽑아 그대로 echo + useApi params <replace> 추가하는 가짜 모델.
const filterModel = (capture: { system: string }) => async (system: string, _user: string): Promise<string> => {
  capture.system = system;
  const region = system.match(/## 편집 영역[^\n]*\n```tsx\n([\s\S]*?)\n```/)?.[1] ?? '';
  const replacement = [
    'const {',
    '\tdata: response,',
    '\tisPending,',
    '\terror,',
    '\trefetch,',
    '\tisFetching,',
    '} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {',
    '\tparams: {',
    '\t\tpage: currentPage,',
    '\t\tlimit: PAGE_LIMIT,',
    '\t\tsearch: searchQuery || undefined,',
    "\t\tdepartment: selectedDepartment === 'all' ? undefined : selectedDepartment,",
    "\t\tstatus: selectedStatus === 'all' ? undefined : selectedStatus,",
    "\t\tdeployment: selectedDeployment === 'all' ? undefined : selectedDeployment,",
    '\t},',
    '});',
  ].join('\n');
  return `<region>\n${region}\n</region>\n<replace anchor="useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT">\n${replacement}\n</replace>`;
};

let allOk = true;
const result = (label: string, pass: boolean, detail: string): void => {
  if (!pass) allOk = false;
  console.log('='.repeat(92));
  console.log(`■ ${label}: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(detail);
  console.log();
};

// ── 1) 다중지점 + 서버 params → B+C 경로로 성공 ──
{
  const cap = { system: '' };
  let calls = 0;
  const model = filterModel(cap);
  const out = await runHybridRegionEdit(employeeList, '부서·재직상태·투입상태 select로 아래 테이블을 필터링해줘', async (s, u) => { calls++; return model(s, u); });
  const txt = out.finalText ?? '';
  const selectCount = (txt.match(/<Select(?![A-Za-z0-9])/g) ?? []).length;
  const hasParams = txt.includes('department: selectedDepartment') && txt.includes('status: selectedStatus');
  const hasInventory = cap.system.includes('이미 존재하는 입력 컨트롤') && cap.system.includes('selectedStatus');
  const hasReplaceHint = cap.system.includes('<replace anchor=');
  const pass = calls === 1 && out.status === 'applied' && hasParams && selectCount === 3 && hasInventory && hasReplaceHint;
  result('1) 다중지점+서버params (B+C)', pass,
    `  모델호출=${calls} status=${out.status} reason=${out.reason ?? '-'}\n` +
    `  프롬프트: 인벤토리=${hasInventory} <replace>지침=${hasReplaceHint}\n` +
    `  결과: params보강=${hasParams} <Select>개수=${selectCount}(기대 3, 중복없음)\n` +
    `  진단: ${out.diagnostics}`);
}

// ── 2) 다중지점 + 서버 params 없음 → cross-cutting full 폴백, 모델 0회 ──
{
  let calls = 0;
  const out = await runHybridRegionEdit(projectList, '정렬 드롭다운으로 목록을 정렬·필터링', async () => { calls++; return ''; });
  const pass = calls === 0 && out.status === 'fallback' && out.reason === 'cross-cutting';
  result('2) 다중지점+서버params없음 (게이트 차단)', pass,
    `  모델호출=${calls}(기대 0) status=${out.status} reason=${out.reason}\n  진단: ${out.diagnostics}`);
}

// ── 3) 단일컨트롤 → 통과, 모델 호출됨 ──
{
  let calls = 0;
  const out = await runHybridRegionEdit(employeeList, '재직상태 select를 api로 바꿔줘', async (system) => {
    calls++;
    const region = system.match(/## 편집 영역[^\n]*\n```tsx\n([\s\S]*?)\n```/)?.[1] ?? '';
    return `<region>\n${region}\n</region>`;
  });
  const pass = calls === 1;
  result('3) 단일컨트롤 (통과)', pass, `  모델호출=${calls}(기대 1) status=${out.status} reason=${out.reason ?? '-'}`);
}

console.log('='.repeat(92));
console.log(allOk ? '✅ 전체 PASS — cross-cutting 게이트 + B+C 경로 동작 확인' : '❌ 일부 FAIL');
process.exitCode = allOk ? 0 : 1;
