/**
 * ApiBindingRecipe Stage 1 단위 테스트 — 실제 라이브 픽스처(EmployeeListPage + api-spec GET /api/employees).
 * 결정론 추출·대조가 "명백한 건 매핑, 애매/없는 건 미매핑으로 정확히 분리"하는지 고정한다.
 */
import {
  extractTableColumns,
  extractResponseSchema,
  reconcile,
} from '../src/ai/ApiBindingRecipe';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

// ── 픽스처: 사용자가 붙여준 실제 파일의 테이블 부분 ──────────────────────────
const FILE = `
export default function EmployeeListPage(): React.ReactNode {
  const { data: employees } = useApi<TEmployee[]>('/api/employees');
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="x">이름</th>
            <th className="x">부서</th>
            <th className="x">직급</th>
            <th className="x">현재 투입 프로젝트</th>
            <th className="x">투입률</th>
            <th className="x">상태</th>
            <th className="x">액션</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-t">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="avatar">{emp.name[0]}</div>
                  <span className="font-medium">{emp.name}</span>
                </div>
              </td>
              <td className="py-3 px-4">{emp.dept}</td>
              <td className="py-3 px-4">{emp.grade}</td>
              <td className="py-3 px-4">{emp.project}</td>
              <td className="py-3 px-4">{emp.rate}</td>
              <td className="py-3 px-4"><StatusBadge status={emp.status} /></td>
              <td className="py-3 px-4"><button>상세</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;

// ── 픽스처: api-spec.md 의 GET /api/employees 섹션(Response JSON 예시) ────────
const SPEC = `
### GET \`/api/employees\`
직원 목록 조회.

**Query Parameters** …

**Response**
\`\`\`json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "김민준",
      "email": "minjun.kim@peoplify.com",
      "phone": "010-1001-0001",
      "department": "개발팀",
      "position": "선임 개발자",
      "hire_date": "2021-03-02",
      "employment_status": "active",
      "skills": ["Java", "Spring", "AWS"]
    }
  ],
  "meta": { "total": 18, "page": 1, "limit": 20 }
}
\`\`\`
`;

console.log('\napi-binding Stage 1 — 테이블 컬럼 추출:');
const cols = extractTableColumns(FILE);
eq(cols.map((c) => c.headerLabel), ['이름', '부서', '직급', '현재 투입 프로젝트', '투입률', '상태', '액션'], '헤더 라벨 7개 순서');
eq(cols.map((c) => c.field), ['name', 'dept', 'grade', 'project', 'rate', 'status', null], '셀 참조 필드(액션은 null)');
ok(cols.length === 7, '컬럼 7개');

console.log('\napi-binding Stage 1 — 스펙 Response 스키마 추출:');
const schema = extractResponseSchema(SPEC)!;
ok(schema !== null, '스키마 파싱 성공');
eq(schema.envelopeKey, 'data', '봉투 키 = data');
eq(schema.rowFields, ['id', 'name', 'email', 'phone', 'department', 'position', 'hire_date', 'employment_status', 'skills'], '행 필드 9개');

console.log('\napi-binding Stage 1 — 대조(reconcile):');
const rec = reconcile(cols, schema);
// 결정론은 **안전한 것만** 매핑한다: 정확일치(name) + 부분문자열(status⊂employment_status).
// 약어(dept→department, grade→position)는 억측 금지 → 미매핑으로 남겨 다음 단계(작은 모델콜)에 넘긴다.
eq(
  rec.mapping.map((m) => `${m.column.field}→${m.apiField}(${m.how})`),
  ['name→name(exact)', 'status→employment_status(fuzzy)'],
  '안전한 결정론 매핑만 (name·status)',
);
eq(rec.unmappedColumns.map((c) => c.field), ['dept', 'grade', 'project', 'rate'], '미매핑 = dept·grade·project·rate');
// 미매핑 중 dept·grade는 unusedApiFields에 후보(department·position)가 있어 모델콜로 해결 가능,
// project·rate는 후보가 없어 결국 언더스펙(되묻기) — 이 구분은 다음 단계가 unusedApiFields로 판정.
ok(rec.unusedApiFields.includes('department') && rec.unusedApiFields.includes('position'), '미사용 API필드에 dept·grade 후보(department·position) 있음');
ok(!rec.unusedApiFields.includes('name') && !rec.unusedApiFields.includes('employment_status'), '이미 매핑된 필드(name·employment_status)는 미사용에서 빠짐');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
if (fail > 0) process.exit(1);
