/**
 * 오프라인 API 바인딩 계획(Phase 2) 테스트 — 모델 없이 "매핑 테이블"이 나오는지 고정한다.
 *
 * 핵심 계약: 결정론이 확신하는 행은 채워서 주고, **애매한 행만** 사용자 선택으로 남긴다
 * (온라인에서 모델이 하던 필드 매핑 한 조각을 사람의 클릭으로 치환 — 계획서 §7 A1).
 * 픽스처는 test-api-binding.ts와 같은 실제 화면·스펙을 쓴다.
 */
import { buildBindingPlan, pickSpecDoc } from '../src/ai/actions/OfflineApiBinding';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

const FILE = `
export default function EmployeeListPage(): React.ReactNode {
  const employees = [];
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>이름</th><th>부서</th><th>직급</th><th>상태</th><th>액션</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td>{emp.name}</td>
              <td>{emp.dept}</td>
              <td>{emp.grade}</td>
              <td><StatusBadge status={emp.status} /></td>
              <td><button>상세</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;

const SPEC = `
### GET \`/api/employees\`
직원 목록 조회.

**Response**
\`\`\`json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "김민준",
      "department": "개발팀",
      "position": "선임 개발자",
      "employment_status": "active"
    }
  ],
  "meta": { "total": 18 }
}
\`\`\`
`;

console.log('\n── A. 계획 수립(정상 경로) ──');
{
  const plan = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '/api/employees' });
  eq(plan.blocked, null, 'A1: 막힘 없음');
  eq(plan.typeName, 'TEmployee', 'A2: 행 타입 이름 파생');
  eq(plan.envelopeKey, 'data', 'A3: 봉투 키 감지(useApi 제네릭 생성에 필요)');
  eq(plan.rows.length, 5, 'A4: 컬럼 수만큼 행');

  eq(plan.rows.map((r) => r.label), ['이름', '부서', '직급', '상태', '액션'], 'A5: 헤더 라벨 순서 보존');
  eq(plan.rows.map((r) => r.how), ['exact', 'choose', 'choose', 'fuzzy', 'static'], 'A6: 확신한 행만 채우고 애매한 행은 choose');

  // 결정론이 확신하는 두 종류
  eq(plan.rows[0].apiField, 'name', 'A7: exact — 이름 동일');
  eq(plan.rows[3].apiField, 'employment_status', 'A8: fuzzy — status ⊂ employment_status(교체 필요)');

  // 약어는 억측하지 않는다 — 사람이 고를 몫으로 남긴다
  eq(plan.rows[1].apiField, null, 'A9: dept는 억측 금지(department로 단정하지 않음)');
  eq(plan.rows[1].currentField, 'dept', 'A10: 현재 필드는 보여준다(무엇을 고칠지 알 수 있게)');
  eq(plan.needsChoiceCount, 2, 'A11: 사람이 판단할 행 수 = 클릭 횟수');
  eq(plan.candidateFields, ['id', 'department', 'position'], 'A12: 남은 API 필드가 선택 후보');

  // 필드를 안 읽는 컬럼은 바인딩 대상이 아니다
  eq(plan.rows[4].currentField, null, 'A13: 액션 컬럼은 static(대상 아님)');
}

console.log('\n── B. 막힘 사유(조용히 실패하지 않는다) ──');
{
  const noEp = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '  ' });
  ok(!!noEp.blocked && noEp.rows.length === 0, 'B1: 엔드포인트 미정 → 사유 명시');

  const noTable = buildBindingPlan({ source: 'export default function X() { return <div/>; }', specText: SPEC, endpoint: '/api/employees' });
  ok(!!noTable.blocked && noTable.blocked.includes('테이블'), 'B2: 테이블 없음 → 사유 명시');

  const noSpec = buildBindingPlan({ source: FILE, specText: null, endpoint: '/api/employees' });
  ok(!!noSpec.blocked && noSpec.blocked.includes('스펙'), 'B3: 스펙 없음 → 사유 명시');

  const wrongEp = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '/api/projects' });
  ok(!!wrongEp.blocked, 'B4: 스펙에 없는 엔드포인트 → 사유 명시');
}

console.log('\n── C. 스펙 문서 선택 ──');
{
  const docs = [
    { path: 'plan/readme.md', text: '# 프로젝트 개요\n관련 없는 문서' },
    { path: 'plan/api-spec.md', text: SPEC },
  ];
  eq(pickSpecDoc(docs, '/api/employees')?.path, 'plan/api-spec.md', 'C1: 파일명이 아니라 내용으로 고른다');
  eq(pickSpecDoc(docs, '/api/unknown'), null, 'C2: 어느 문서도 그 경로를 설명 못 하면 null');
  eq(pickSpecDoc([], '/api/employees'), null, 'C3: 후보 없음');
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
