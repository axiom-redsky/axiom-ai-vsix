/** 실제 sLLM 출력(사용자 패널 실행)을 본체 runHybridRegionEdit에 흘려 적용 가부 검증. 모델 없음(출력 고정). */
import * as fs from 'fs';
import * as path from 'path';
import { runHybridRegionEdit } from '../src/ai/RegionEditService';
import { locateEditRegion } from '../src/ai/RegionEdit';

const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts', 'eval-fixtures', 'EmployeeListPage.tsx'), 'utf-8');
const query = '부서·재직상태·투입상태 select로 아래 테이블을 필터링';
const loc = locateEditRegion(source, query);

// 사용자가 패널에서 받은 실제 모델 원시 출력(앵커가 한 줄로 펼쳐진 형태 그대로 재현).
const anchor =
  'useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, { params: { page: currentPage, limit: PAGE_LIMIT, search: searchQuery || undefined } })';
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
  "\t\temployment_status: selectedStatus === 'all' ? undefined : selectedStatus,",
  "\t\tdeployment_status: selectedDeployment === 'all' ? undefined : selectedDeployment,",
  '\t},',
  '});',
].join('\n');
const modelOut = `<replace anchor="${anchor}">${replacement}</replace>\n<region>\n${loc.region}\n</region>`;

const out = await runHybridRegionEdit(source, query, async () => modelOut);

console.log('='.repeat(90));
console.log(`status=${out.status}  reason=${out.reason ?? '-'}`);
console.log(`diagnostics: ${out.diagnostics}`);
const t = out.finalText ?? '';
const params = t.includes('department: selectedDepartment') && t.includes('employment_status: selectedStatus') && t.includes('deployment_status: selectedDeployment');
const selectCount = (t.match(/<Select(?![A-Za-z0-9])/g) ?? []).length;
const constOpen = (t.match(/^\s*const \{$/gm) ?? []).length;
const srcConstOpen = (source.match(/^\s*const \{$/gm) ?? []).length;
const keptSearch = t.includes('search: searchQuery || undefined');
const pass =
  out.status === 'applied' && params && selectCount === 3 && constOpen === srcConstOpen && keptSearch;
console.log(`\n적용 검증:`);
console.log(`  params 보강(3조건): ${params}`);
console.log(`  <Select> 개수: ${selectCount} (기대 3, 중복없음)`);
console.log(`  const { 개수: ${constOpen} (원본 ${srcConstOpen} — 고아 없음)`);
console.log(`  search param 보존: ${keptSearch}`);
console.log(`\n판정: ${pass ? '✅ PASS — 멀티라인 펼침 앵커로도 적용 성공' : '❌ FAIL'}`);
process.exitCode = pass ? 0 : 1;
