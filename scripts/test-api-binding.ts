/**
 * ApiBindingRecipe Stage 1 단위 테스트 — 실제 라이브 픽스처(EmployeeListPage + api-spec GET /api/employees).
 * 결정론 추출·대조가 "명백한 건 매핑, 애매/없는 건 미매핑으로 정확히 분리"하는지 고정한다.
 */
import {
  extractTableColumns,
  extractResponseSchema,
  pickResponseSchema,
  reconcile,
  buildBindingCode,
  rewriteMappedFields,
  deriveRootName,
  findRowCollectionVar,
  buildFieldMappingPrompt,
  parseFieldMapping,
  stripModuleConst,
  detectEnvelopeKey,
  removeTableColumns,
} from '../src/ai/ApiBindingRecipe';
import { extractApiPaths } from '../src/ai/decompose/SectionExtractor';
import { applyStructuralEdit } from '../src/ai/apply/StructuralAnchor';

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

console.log('\napi-binding Stage 2 — 파생 이름/컬렉션:');
eq(deriveRootName('/api/employees'), 'Employee', 'deriveRootName: employees→Employee');
eq(deriveRootName('/api/companies'), 'Company', 'deriveRootName: companies→Company');
eq(findRowCollectionVar(FILE), 'employees', 'findRowCollectionVar: employees');

console.log('\napi-binding Stage 2 — 바인딩 코드 생성(결정론):');
const code = buildBindingCode({ schema, endpoint: '/api/employees', rootName: 'Employee', collectionVar: 'employees' });
eq(code.typeName, 'TEmployee', '타입명 = TEmployee');
ok(/type TEmployee = \{/.test(code.hookCode), 'type TEmployee 선언 생성');
ok(/department: string;/.test(code.hookCode) && /employment_status: string;/.test(code.hookCode), '타입에 API 필드(department·employment_status)');
ok(code.hookCode.includes("useApi<{ data: TEmployee[] }>('/api/employees')"), '봉투 반영: useApi<{ data: TEmployee[] }>(엔드포인트)');
ok(code.hookCode.includes('const { data, isPending, error } = useApi'), 'data/isPending/error 구조분해');
ok(code.hookCode.includes('const employees = data?.data ?? [];'), '봉투에서 목록 추출: const employees = data?.data ?? []');
ok(/if \(isPending\)/.test(code.hookCode) && /if \(error\)/.test(code.hookCode), '로딩/에러 가드 포함');
eq(code.imports, [{ module: '@axiom/hooks', named: ['useApi'] }], 'import useApi');

console.log('\napi-binding Stage 2 — 테이블 셀 재바인딩(결정론):');
const renames = [
  { from: 'name', to: 'name' }, // 정확 — 스킵돼야
  { from: 'dept', to: 'department' },
  { from: 'grade', to: 'position' },
  { from: 'status', to: 'employment_status' },
];
const rw = rewriteMappedFields(FILE, renames, 'emp');
ok(rw.text.includes('{emp.department}') && !rw.text.includes('{emp.dept}'), 'emp.dept → emp.department');
ok(rw.text.includes('{emp.position}') && !rw.text.includes('{emp.grade}'), 'emp.grade → emp.position');
ok(rw.text.includes('status={emp.employment_status}'), 'emp.status → emp.employment_status (prop)');
ok(rw.text.includes('{emp.name}'), 'emp.name 유지(정확일치는 미변경)');
ok(rw.text.includes('{emp.project}') && rw.text.includes('{emp.rate}'), '미매핑(project·rate)은 손대지 않음(Stage 3 되묻기 대상)');
eq(rw.renamed.map((r) => r.from), ['dept', 'grade', 'status'], '실제 치환된 3개(name 제외)');

console.log('\napi-binding Stage 2b — 애매 컬럼 매핑콜(프롬프트/파싱):');
const ambiguous = cols.filter((c) => c.field === 'dept' || c.field === 'grade');
const prompt = buildFieldMappingPrompt(ambiguous, rec.unusedApiFields);
ok(prompt.includes('"부서"') && prompt.includes('"dept"'), '프롬프트에 컬럼 라벨+필드');
ok(prompt.includes('department') && prompt.includes('position') && !prompt.includes('EmployeeListPage'), '후보 필드 포함·파일 전문 없음(작은 콜)');
// 모델이 반환했다고 가정한 응답(코드펜스·잡담 섞여도 파싱)
eq(
  parseFieldMapping('네, 매핑입니다:\n```json\n{"dept":"department","grade":"position"}\n```', ambiguous, rec.unusedApiFields),
  [{ from: 'dept', to: 'department' }, { from: 'grade', to: 'position' }],
  '유효 매핑 파싱',
);
eq(
  parseFieldMapping('{"dept":"salary","grade":"position"}', ambiguous, rec.unusedApiFields),
  [{ from: 'grade', to: 'position' }],
  '후보에 없는 환각 필드(salary)는 드롭',
);
eq(parseFieldMapping('매핑 없음', ambiguous, rec.unusedApiFields), [], '비-JSON 응답 → 빈 매핑(안전)');

// ── 통합: 실제 시작 상태(모듈 스코프 더미 배열)에서 전체 조립 ───────────────────
const FILE_DUMMY = `import { Button } from '@axiom/components/ui';

const employees = [
	{ id: 1, name: '김민준', dept: '개발팀', grade: '과장', project: 'A', rate: '100%', status: 'active' as const },
	{ id: 2, name: '이서연', dept: '디자인', grade: '대리', project: 'B', rate: '0%', status: 'bench' as const },
];

export default function EmployeeListPage(): React.ReactNode {
	return (
		<div className="p-5">
			<table className="w-full">
				<thead><tr><th>이름</th><th>부서</th><th>직급</th><th>상태</th></tr></thead>
				<tbody>
					{employees.map((emp) => (
						<tr key={emp.id}>
							<td>{emp.name}</td>
							<td>{emp.dept}</td>
							<td>{emp.grade}</td>
							<td>{emp.status}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
`;

console.log('\napi-binding — 통합 조립(rewrite + applyStructuralEdit, 결정론 end-to-end):');
// dept·grade는 모델콜이 반환했다고 가정(department·position). name은 정확일치.
const fullRenames = [
  { from: 'name', to: 'name' },
  { from: 'dept', to: 'department' },
  { from: 'grade', to: 'position' },
  { from: 'status', to: 'employment_status' },
];
const rewritten = stripModuleConst(rewriteMappedFields(FILE_DUMMY, fullRenames, 'emp').text, 'employees');
const bind = buildBindingCode({ schema, endpoint: '/api/employees', rootName: 'Employee', collectionVar: 'employees' });
const applied = applyStructuralEdit(rewritten, { hookCode: bind.hookCode, imports: bind.imports }).text;

ok(/import \{[^}]*useApi[^}]*\} from '@axiom\/hooks'/.test(applied), 'import useApi 추가됨');
ok(applied.indexOf('type TEmployee') >= 0 && applied.indexOf('type TEmployee') < applied.indexOf('export default function'), 'type TEmployee 모듈 스코프로 hoist(컴포넌트 위)');
ok(applied.includes("useApi<{ data: TEmployee[] }>('/api/employees')"), '봉투 반영 useApi 훅');
ok(applied.includes('const employees = data?.data ?? [];'), '봉투에서 목록 추출(data?.data ?? [])');
ok(!applied.includes("dept: '개발팀'"), '모듈 스코프 더미 배열 제거됨');
ok(applied.includes('{emp.department}') && applied.includes('{emp.employment_status}'), '테이블 셀이 API 필드로 재바인딩');
ok(!applied.includes('{emp.dept}') && !applied.includes('{emp.status}'), '옛 더미 필드 참조 사라짐');

// ── A2: 봉투 키 일반화(사이트마다 다른 래퍼 키를 스펙에서 감지) ───────────────────
console.log('\napi-binding A2 — detectEnvelopeKey(봉투 키 일반 감지):');
// 목록 래퍼: 알려진 키들
eq(detectEnvelopeKey({ success: true, data: [{ id: 1 }], meta: {} }), 'data', 'data 래퍼');
eq(detectEnvelopeKey({ code: 0, result: [{ id: 1 }] }), 'result', 'result 래퍼');
eq(detectEnvelopeKey({ status: 'ok', list: [{ id: 1 }], total: 3 }), 'list', 'list 래퍼');
eq(detectEnvelopeKey({ items: [{ id: 1 }], page: 1 }), 'items', 'items 래퍼');
eq(detectEnvelopeKey({ message: 'ok', payload: [{ id: 1 }] }), 'payload', 'payload 래퍼');
// 이름 모르는 배열 키 + 형제가 전부 메타 → 봉투로 인정
eq(detectEnvelopeKey({ code: 200, message: 'ok', totalCount: 5, rowset: [{ id: 1 }] }), 'rowset', '미지 키+메타 형제만 → 봉투');
// 단건 봉투(객체) 도 알려진 키면 벗김
eq(detectEnvelopeKey({ success: true, data: { id: 1, name: 'A' } }), 'data', '단건 data 봉투(객체)');
// ⚠️ 봉투 아님: 최상위가 바로 배열이면 여긴 안 옴(호출부에서 처리) — 단건 행 케이스만 여기서 검증
eq(detectEnvelopeKey({ id: 1, name: 'A', department: 'dev' }), null, '단건 행(배열/봉투 없음) → null');
// ⚠️ 오탐 방지 핵심: 단건 행이 배열 필드(skills)를 가져도 봉투로 오인 금지(id·name은 메타 아님)
eq(detectEnvelopeKey({ id: 1, name: 'A', skills: ['Java', 'AWS'] }), null, '행의 배열 필드(skills)는 봉투 아님');

console.log('\napi-binding A2 — 사이트별 봉투로 extractResponseSchema + buildBindingCode:');
// result 래퍼 사이트
const SPEC_RESULT = `
### GET \`/api/employees\`
**Response**
\`\`\`json
{ "code": 0, "result": [ { "id": 1, "name": "김", "department": "개발" } ], "totalCount": 1 }
\`\`\`
`;
const schemaResult = extractResponseSchema(SPEC_RESULT)!;
eq(schemaResult.envelopeKey, 'result', 'result 봉투 키 감지');
eq(schemaResult.rowFields, ['id', 'name', 'department'], 'result 봉투 행 필드');
const codeResult = buildBindingCode({ schema: schemaResult, endpoint: '/api/employees', rootName: 'Employee', collectionVar: 'employees' });
ok(codeResult.hookCode.includes("useApi<{ result: TEmployee[] }>('/api/employees')"), 'result 봉투 제네릭: useApi<{ result: TEmployee[] }>');
ok(codeResult.hookCode.includes('const employees = data?.result ?? [];'), 'result 봉투 목록 추출: data?.result ?? []');

// bare 배열 사이트(봉투 없음)
const SPEC_BARE = `
### GET \`/api/employees\`
**Response**
\`\`\`json
[ { "id": 1, "name": "김", "department": "개발" } ]
\`\`\`
`;
const schemaBare = extractResponseSchema(SPEC_BARE)!;
eq(schemaBare.envelopeKey, null, 'bare 배열 → envelopeKey null');
const codeBare = buildBindingCode({ schema: schemaBare, endpoint: '/api/employees', rootName: 'Employee', collectionVar: 'employees' });
ok(codeBare.hookCode.includes("useApi<TEmployee[]>('/api/employees')"), 'bare 제네릭: useApi<TEmployee[]>');
ok(codeBare.hookCode.includes('const employees = data ?? [];'), 'bare 목록 추출: data ?? []');

// ── 되묻기 "컬럼 제거": API에 없는 컬럼(project·rate)을 표에서 결정론 제거 ──────────
console.log('\napi-binding — removeTableColumns(미매핑 컬럼 되묻기 "제거"):');
// FILE 컬럼 순서: 0이름 1부서 2직급 3프로젝트 4투입률 5상태 6액션 → project(3)·rate(4) 제거
const removed = removeTableColumns(FILE, [3, 4]);
ok(!removed.includes('현재 투입 프로젝트') && !removed.includes('투입률'), '헤더 th(프로젝트·투입률) 제거');
ok(!removed.includes('{emp.project}') && !removed.includes('{emp.rate}'), '행 셀 td(emp.project·emp.rate) 제거');
// 남은 컬럼은 유지
ok(removed.includes('이름') && removed.includes('부서') && removed.includes('직급') && removed.includes('상태'), '남은 헤더 유지');
ok(removed.includes('{emp.name}') && removed.includes('{emp.dept}') && removed.includes('{emp.grade}') && removed.includes('status={emp.status}'), '남은 셀 유지');
// 헤더 수 = 셀 수 = 5 (기존 7 - 2)
eq(extractTableColumns(removed).length, 5, '제거 후 컬럼 5개');
eq(extractTableColumns(removed).map((c) => c.field), ['name', 'dept', 'grade', 'status', null], '제거 후 컬럼 순서(프로젝트·투입률 빠짐)');
// 빈 배열이면 원본 그대로
eq(removeTableColumns(FILE, []), FILE, '빈 인덱스 → 원본 그대로');

// 제거 후 조립하면 타입에러 유발 셀이 사라짐(컴파일 안전) — 통합 확인
console.log('\napi-binding — removeTableColumns 후 조립(타입에러 셀 소거 e2e):');
const rmSource = removeTableColumns(FILE_DUMMY, [/* FILE_DUMMY: 0이름 1부서 2직급 3상태 → 제거 없음 */]);
ok(rmSource === FILE_DUMMY, 'FILE_DUMMY는 미매핑 컬럼 없어 변화 없음(가드)');
// project/rate가 있는 표에서 제거 → 조립 결과에 emp.project/emp.rate 없음
const withUnmapped = removeTableColumns(FILE, [3, 4]);
const rw2 = rewriteMappedFields(withUnmapped, [
  { from: 'dept', to: 'department' },
  { from: 'grade', to: 'position' },
  { from: 'status', to: 'employment_status' },
], 'emp');
ok(!rw2.text.includes('emp.project') && !rw2.text.includes('emp.rate'), '제거+재바인딩 후 미매핑 필드 참조 완전 소거');

// ── 인라인 스펙(프롬프트 붙여넣기) → 조립 스키마 파싱 ──────────────────────────
// 회귀: compose-binding이 스펙을 **참조 파일 전용**(_loadReferencedFiles)으로만 읽어, 사용자가 스펙을
// 프롬프트에 통째로 붙여넣으면(파일 참조 없음) 첫 관문에서 탈락 → region/structural 반쪽 편집으로 새던
// 버그. 수정: specText = [프롬프트 text, ...참조파일] 로 합쳐 pickResponseSchema에 넘긴다. 이 블록은 그
// 수정이 의존하는 전제 — "파서가 인라인 프롬프트 텍스트에서 엔드포인트+응답 스키마를 뽑는다" — 를 잠근다.
console.log('\napi-binding — 인라인 스펙(프롬프트 붙여넣기) 파싱(회귀):');
// 사용자가 실제로 붙여넣은 형태: 지시문 + GET 섹션 + Response JSON 이 한 프롬프트에 인라인. 파일 참조 없음.
const INLINE_PROMPT = `직원 테이블을 다음 api 데이터로 적용해줘.

### GET \`/api/employees\`
직원 목록 조회. 페이지네이션 + 검색 지원.

**Response**
\`\`\`json
{
  "success": true,
  "data": [
    { "id": 1, "name": "김민준", "email": "minjun.kim@peoplify.com", "phone": "010-1001-0001", "department": "개발팀", "position": "선임 개발자", "hire_date": "2021-03-02", "employment_status": "active", "skills": ["Java", "Spring", "AWS"] }
  ],
  "meta": { "total": 18, "page": 1, "limit": 20 }
}
\`\`\`
`;
// 1) 엔드포인트는 인라인 텍스트에서 뽑힌다(종전에도 OK).
eq(extractApiPaths(INLINE_PROMPT), ['/api/employees'], '인라인: extractApiPaths → /api/employees');
// 2) 핵심 — 스키마도 인라인 텍스트에서 뽑혀야 조립이 발동한다(수정 지점).
const inlineSchema = pickResponseSchema(INLINE_PROMPT, '/api/employees');
ok(inlineSchema !== null, '인라인: pickResponseSchema가 프롬프트 텍스트에서 스키마 파싱');
eq(inlineSchema?.envelopeKey, 'data', '인라인: 봉투 키 = data');
eq(
  inlineSchema?.rowFields,
  ['id', 'name', 'email', 'phone', 'department', 'position', 'hire_date', 'employment_status', 'skills'],
  '인라인: 행 필드 9개',
);
// 3) 수정된 글루 재현: specText = [프롬프트 text, ...참조파일(없음=[])]. 참조 0개여도 스키마가 나와야 한다.
const specTextNoRef = [INLINE_PROMPT, ...[]].join('\n\n');
ok(
  pickResponseSchema(specTextNoRef, '/api/employees')?.rowFields.length === 9,
  '인라인+참조0: specText 합성으로도 스키마 확보(조립 발동 조건 충족)',
);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
if (fail > 0) process.exit(1);
