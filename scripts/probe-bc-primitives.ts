/** B+C 프리미티브 단독 검증 — extractControlInventory / applyReplaceBlocks. 모델 없음. */
import * as fs from 'fs';
import * as path from 'path';
import { extractControlInventory } from '../src/ai/RegionIntent';
import { applyReplaceBlocks } from '../src/ai/StructuralAnchor';

const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts', 'eval-fixtures', 'EmployeeListPage.tsx'), 'utf-8');
let ok = true;

// ── B: 인벤토리 (region = table 306~360 기준, select 3개 + input 1개가 밖) ──
console.log('='.repeat(80));
console.log('■ B: extractControlInventory (region 306~360 제외)');
const inv = extractControlInventory(source, 306, 360);
console.log(inv);
const bOk = ['selectedDepartment', 'selectedStatus', 'selectedDeployment'].every((s) => inv.includes(s)) && /<Input/.test(inv);
console.log(`  판정: ${bOk ? '✅ select 3개 state + Input 모두 인벤토리에 포착' : '❌ 누락'}`);
ok &&= bOk;

// ── C: useApi params 교체 ──
console.log('\n' + '='.repeat(80));
console.log('■ C: applyReplaceBlocks — useApi params에 필터 조건 보강');
const replacement = `const {
\t\tdata: response,
\t\tisPending,
\t\terror,
\t\trefetch,
\t\tisFetching,
\t} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {
\t\tparams: {
\t\t\tpage: currentPage,
\t\t\tlimit: PAGE_LIMIT,
\t\t\tsearch: searchQuery || undefined,
\t\t\tdepartment: selectedDepartment === 'all' ? undefined : selectedDepartment,
\t\t\tstatus: selectedStatus === 'all' ? undefined : selectedStatus,
\t\t\tdeployment: selectedDeployment === 'all' ? undefined : selectedDeployment,
\t\t},
\t});`;
const res = applyReplaceBlocks(source, [{ anchor: 'useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT', replacement }]);
console.log(`  unresolved: ${res.unresolved.length ? res.unresolved.join(', ') : '없음'}`);
console.log(`  changes: ${res.changes.join(' / ')}`);
// 검증: 새 param 들어갔고, 기존 단일 useApi 호출이 여전히 1개(중복 없음), search param 보존
const hasNewParams = res.text.includes('department: selectedDepartment') && res.text.includes('status: selectedStatus');
const apiCount = (res.text.match(/useApi<TEmployeeListResponse>\(EMPLOYEES_ENDPOINT/g) ?? []).length;
const keptSearch = res.text.includes('search: searchQuery || undefined');
// 구조 무결: 컴포넌트 본문 다른 부분(예: handlePageChange) 그대로
const intact = res.text.includes('const handlePageChange = (page: number) => {') && res.text.includes('export default function EmployeeListPage');
// 문장 무결성: `const {` … `= useApi` 구조가 정확히 1쌍 (중복/고아 const { 없음)
const constOpenCount = (res.text.match(/^\s*const \{$/gm) ?? []).length;
const sourceConstOpen = (source.match(/^\s*const \{$/gm) ?? []).length;
const noOrphan = constOpenCount === sourceConstOpen; // 교체로 const { 개수가 늘면 고아 발생
const cOk = res.unresolved.length === 0 && hasNewParams && apiCount === 1 && keptSearch && intact && noOrphan;
console.log(`  검증: 새params=${hasNewParams} / useApi호출수=${apiCount} / search보존=${keptSearch} / 주변무결=${intact} / const{고아없음=${noOrphan}(${sourceConstOpen}→${constOpenCount})`);
console.log(`  판정: ${cOk ? '✅ params 교체 성공(중복·손상 없음)' : '❌ 실패'}`);
ok &&= cOk;

// 교체된 useApi 문장 주변 출력(눈으로 확인)
const tl = res.text.split('\n');
const at = tl.findIndex((l) => l.includes('= useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT'));
if (at >= 0) {
  console.log('\n  --- 교체 결과(발췌) ---');
  for (let i = Math.max(0, at - 6); i <= Math.min(tl.length - 1, at + 9); i++) console.log(`  ${i + 1}| ${tl[i]}`);
}

console.log('\n' + '='.repeat(80));
console.log(ok ? '✅ B+C 프리미티브 전부 PASS' : '❌ 일부 FAIL');
process.exitCode = ok ? 0 : 1;
