/**
 * 오프라인 API 바인딩 계획(Phase 2) 테스트 — 모델 없이 "매핑 테이블"이 나오는지 고정한다.
 *
 * 핵심 계약: 결정론이 확신하는 행은 채워서 주고, **애매한 행만** 사용자 선택으로 남긴다
 * (온라인에서 모델이 하던 필드 매핑 한 조각을 사람의 클릭으로 치환 — 계획서 §7 A1).
 * 픽스처는 test-api-binding.ts와 같은 실제 화면·스펙을 쓴다.
 */
import {
  buildBindingApply, buildBindingPlan, decorateBindingRows, pickSpecDoc,
  rankByPathAffinity, resolveBindingChoices, NO_ENVELOPE, REMOVE_COLUMN,
} from '../src/ai/actions/OfflineApiBinding';
import { listEndpoints } from '../src/ai/actions/SpecDocScanner';

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

  // 스펙이 없으면 막지 않는다 — 응답을 모를 뿐 배선은 결정론으로 할 수 있다(§G 배선 전용 모드).
  const noSpec = buildBindingPlan({ source: FILE, specText: null, endpoint: '/api/employees' });
  ok(noSpec.blocked === null && noSpec.mode === 'wiring-only', 'B3: 스펙 없음 → 막힘이 아니라 배선 전용');

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

console.log('\n── D. 사용자 선택 반영(클릭이 모델콜을 대신한다) ──');
{
  const plan = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '/api/employees' });

  const one = decorateBindingRows(plan, { dept: 'department' });
  eq(one[1].apiField, 'department', 'D1: 고른 값이 그 행에 채워진다');
  eq(one[2].apiField, null, 'D2: 안 고른 행은 그대로 미정');
  // 중복 배정은 검증이 아니라 **구조**로 막는다 — 다른 행이 가져간 필드는 후보에서 사라진다.
  ok(!(one[2].candidates ?? []).includes('department'), 'D3: 이미 쓰인 필드는 다른 행 후보에서 제외');
  ok((one[1].candidates ?? []).includes('department'), 'D4: 내가 고른 값은 내 후보에 남는다(바꿀 수 있게)');
  ok((one[2].candidates ?? []).includes(REMOVE_COLUMN), 'D5: 후보 끝에 항상 "컬럼 제거"');

  const stale = decorateBindingRows(plan, { dept: 'salary' });
  eq(stale[1].apiField, null, 'D6: 후보 밖 값(낡은 선택)은 미정으로 되돌린다 — 환각 필드로 바인딩 금지');

  const decided = resolveBindingChoices(plan, { dept: 'department', grade: 'position' });
  eq(decided.pendingLabels, [], 'D7: 두 행 모두 정하면 미정 없음');
  eq(decided.renames, [
    { from: 'name', to: 'name' },
    { from: 'dept', to: 'department' },
    { from: 'grade', to: 'position' },
    { from: 'status', to: 'employment_status' },
  ], 'D8: 결정론 매핑 + 사용자 선택이 한 목록으로');

  const removed = resolveBindingChoices(plan, { dept: REMOVE_COLUMN, grade: 'position' });
  eq(removed.removeIndices, [1], 'D9: "컬럼 제거"는 컬럼 인덱스로');
  eq(removed.removedLabels, ['부서'], 'D10: 제거 대상은 라벨로 보고');

  const half = resolveBindingChoices(plan, { dept: 'department' });
  eq(half.pendingLabels, ['직급'], 'D11: 안 정한 행은 라벨로 남는다(실행 잠금 근거)');
}

console.log('\n── E. 결정론 적용(모델 0회) ──');
{
  const plan = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '/api/employees' });

  const pending = buildBindingApply({ source: FILE, plan, choices: { dept: 'department' } });
  ok(!!pending.blocked && pending.text === null, 'E1: 미정 행이 있으면 조립하지 않는다(추측 금지)');

  const res = buildBindingApply({ source: FILE, plan, choices: { dept: 'department', grade: 'position' } });
  eq(res.blocked, null, 'E2: 전부 정하면 적용 가능');
  const out = res.text ?? '';
  eq(res.typeName, 'TEmployee', 'E3: 생성된 행 타입');
  ok(out.includes('useApi<{ data: TEmployee[] }>'), 'E4: 봉투 계약대로 제네릭 생성');
  ok(out.includes('const employees = data?.data ?? []'), 'E5: 파생 const가 기존 컬렉션 이름을 유지');
  ok(!/const employees = \[\]/.test(out), 'E6: 더미 배열 선언 제거');
  ok(out.includes('{emp.department}') && out.includes('{emp.position}'), 'E7: 셀 재바인딩(선택대로)');
  ok(out.includes('emp.employment_status'), 'E8: fuzzy 행도 결정론 재바인딩');
  ok(out.includes('isPending') && out.includes('error'), 'E9: 로딩·에러 가드 포함');
  ok(/type TEmployee|interface TEmployee/.test(out), 'E10: 응답 타입 선언 삽입');

  const dropped = buildBindingApply({
    source: FILE, plan, choices: { dept: REMOVE_COLUMN, grade: 'position' },
  });
  const droppedText = dropped.text ?? '';
  eq(dropped.blocked, null, 'E11: 컬럼 제거도 적용 가능');
  ok(!droppedText.includes('<th>부서</th>'), 'E12: 제거한 컬럼의 헤더가 사라짐');
  ok(!droppedText.includes('{emp.dept}'), 'E13: 제거한 컬럼의 셀이 사라짐');
  eq(dropped.removedLabels, ['부서'], 'E14: 무엇을 뺐는지 보고');

  const blocked = buildBindingApply({
    source: FILE,
    plan: buildBindingPlan({ source: 'export default function X() { return <div/>; }', specText: SPEC, endpoint: '/api/employees' }),
    choices: {},
  });
  ok(!!blocked.blocked && blocked.text === null, 'E15: 막힌 계획은 적용도 막힘(사유 승계)');

  const noTable = buildBindingApply({ source: 'export default function X() { return <div/>; }', plan, choices: { dept: 'department', grade: 'position' } });
  ok(!!noTable.blocked && noTable.text === null, 'E16: 파일이 바뀌어 테이블이 없으면 거부');
}

console.log('\n── G. 막힘은 계단이어야 한다(사유 정밀화 + 대체 경로) ──');
{
  // 실측 회귀(nicify): `/api/courses/:courseId/lessons`는 스펙에 **있었지만** 목록 GET이 없어 막혔는데
  // "스펙 문서를 찾지 못함"이라고 안내해 사용자가 엉뚱한 곳(스펙 파일 유무)을 뒤졌고, 다음에 할 수
  // 있는 행동이 하나도 없었다. 사유를 사실대로 쪼개고, 대신 고를 경로를 함께 준다.
  const mentioned = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/courses/:courseId/lessons',
    lookup: { docsScanned: 12, pathMentioned: true },
    suggestions: ['/api/courses/:courseId', '/api/courses'],
  });
  ok(!!mentioned.blocked && mentioned.blocked.includes('목록 조회(GET) 응답'), 'G1: 경로는 있는데 목록 조회가 없음 → 그대로 말한다');
  ok(!mentioned.blocked!.includes('찾지 못했습니다') || !mentioned.blocked!.includes('스펙 문서에서'),
    'G2: "스펙 문서 없음"으로 뭉뚱그리지 않는다');
  eq(mentioned.suggestions, ['/api/courses/:courseId', '/api/courses'], 'G3: 막힘에도 다음 행동(대체 경로)을 준다');

  // 문서화되지 않은 경로 = 응답을 모르는 것 → 막지 말고 배선만(대안 경로도 함께).
  const absent = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/unknown',
    lookup: { docsScanned: 12, pathMentioned: false }, suggestions: ['/api/employees'],
  });
  eq(absent.mode, 'wiring-only', 'G4: 미문서화 경로 → 배선 전용');
  eq(absent.suggestions, ['/api/employees'], 'G4b: 배선 전용이어도 대안 경로는 준다');

  const noDocs = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/employees',
    lookup: { docsScanned: 0, pathMentioned: false },
  });
  eq(noDocs.mode, 'wiring-only', 'G5: 문서 자체가 없어도 배선은 한다');
  ok(!!noDocs.notice && noDocs.notice.includes('스펙 문서(.md)'), 'G5b: 무엇을 못 봤는지 밝힌다');
  eq(noDocs.suggestions, [], 'G6: 줄 후보가 없으면 빈 목록(꾸미지 않음)');

  // 단건 응답을 목록으로 착각한 바인딩 = 그럴듯한 오바인딩(최악의 실패) → 없는 것으로 취급.
  const singleSpec = '### POST `/api/employees`\n\n**Response `201`**\n```json\n{ "employee": { "id": 1, "name": "김" } }\n```';
  const single = buildBindingPlan({ source: FILE, specText: singleSpec, endpoint: '/api/employees' });
  ok(!!single.blocked, 'G7: 단건 응답 스키마로는 표를 채우지 않는다');

  // 근접 정렬: 상위 리소스가 위로(목록을 주는 쪽이 대개 정답)
  eq(
    rankByPathAffinity(
      ['/api/auth', '/api/courses', '/api/courses/:courseId', '/api/courses/items/:itemId/lessons'],
      '/api/courses/:courseId/lessons',
    ),
    ['/api/courses/:courseId', '/api/courses/items/:itemId/lessons', '/api/courses', '/api/auth'],
    'G8: 공유 접두사 → 길이 근접 순',
  );
  eq(rankByPathAffinity(['/api/b', '/api/a'], ''), ['/api/a', '/api/b'], 'G9: 요청 미정이면 사전순');
}

console.log('\n── H. 목록의 원천은 GET이다 ──');
{
  // 실측 사고: `POST /api/courses/:courseId/lessons`(강의 **등록**, 입력이 배열)의 201 응답이 마침
  // 배열이라, 직원 표 6칸을 강의 필드 3개에 매핑하라는 무의미한 카드가 떴다.
  const postOnly = [
    '### `POST /api/courses/:courseId/lessons`', '', '강의 덧붙이기.', '',
    '**Request**', '```jsonc', '{ "lessons": [ { "title": "Suspense" } ] }', '```', '',
    '**Response `201`**', '```jsonc', '{ "lessons": [ { "id": 62, "slug": "lesson-22", "title": "Suspense" } ] }', '```',
  ].join('\n');
  const plan = buildBindingPlan({ source: FILE, specText: postOnly, endpoint: '/api/courses/:courseId/lessons' });
  ok(!!plan.blocked, 'H1: 등록(POST) 응답으로는 표를 채우지 않는다');
  eq(pickSpecDoc([{ path: 'spec.md', text: postOnly }], '/api/courses/:courseId/lessons'), null,
    'H2: 스펙 문서 선택도 GET 목록이 있는 문서만');

  // 같은 경로에 GET 목록이 있으면 당연히 통과
  const withGet = `${postOnly}\n\n### \`GET /api/courses/:courseId/lessons\`\n\n**Response**\n\`\`\`jsonc\n{ "lessons": [ { "id": 1, "title": "t", "order": 2 } ] }\n\`\`\`\n`;
  const okPlan = buildBindingPlan({ source: FILE, specText: withGet, endpoint: '/api/courses/:courseId/lessons' });
  eq(okPlan.blocked, null, 'H3: GET 목록이 있으면 정상 계획');
  eq(okPlan.apiFields, ['id', 'title', 'order'], 'H4: 응답 필드를 카드가 그대로 보여줄 수 있게 싣는다');
  eq(okPlan.envelopeKey, 'lessons', 'H5: 리소스 이름 봉투 감지');

  // 헤더에 경로가 없는 문서(본문에만 등장)에서도 GET 신호가 있으면 읽는다
  const bodyOnly = '## 강의 목록\n\n`GET /api/lessons` 로 조회한다.\n\n**Response**\n```json\n{ "items": [ { "id": 1, "title": "t" } ] }\n```';
  const fromBody = buildBindingPlan({ source: FILE, specText: bodyOnly, endpoint: '/api/lessons' });
  eq(fromBody.blocked, null, 'H6: 헤더에 경로가 없어도 본문 GET이면 읽는다');
}

console.log('\n── I. 스펙이 없어도 쓸모 있어야 한다(배선 전용) ──');
{
  // 폐쇄망 현실: 스펙 md가 없는 프로젝트가 흔하다. 여기서 카드가 아무 것도 못 하면 기능 자체가 죽는다.
  const plan = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/employees',
    lookup: { docsScanned: 0, pathMentioned: false },
  });
  eq(plan.mode, 'wiring-only', 'I1: 스펙 없음 → 배선 전용 계획');
  eq(plan.blocked, null, 'I2: 막히지 않는다');
  eq(plan.needsChoiceCount, 0, 'I3: 물어볼 것이 없다(추측을 안 하니까)');
  eq(plan.rows.map((r) => r.how), ['exact', 'exact', 'exact', 'exact', 'static'], 'I4: 표의 필드는 전부 그대로 유지');
  eq(plan.envelopeKey, 'data', 'I5: 봉투 키는 scaffold 계약을 가정');
  ok(!!plan.notice && plan.notice.includes('가정'), 'I6: 가정을 숨기지 않고 카드에 적는다');
  eq(plan.apiFields, [], 'I7: 모르는 응답 필드를 지어내지 않는다');

  const res = buildBindingApply({ source: FILE, plan, choices: {} });
  const out = res.text ?? '';
  eq(res.blocked, null, 'I8: 바로 적용 가능(클릭 1번)');
  ok(out.includes('useApi<{ data: TEmployee[] }>'), 'I9: useApi 배선');
  ok(out.includes('const employees = data?.data ?? []'), 'I10: 더미 대신 응답에서 목록 파생');
  ok(!/const employees = \[\]/.test(out), 'I11: 더미 배열 제거');
  ok(out.includes('{emp.dept}') && out.includes('{emp.grade}'), 'I12: 표의 필드는 손대지 않는다(추측 0)');
  ok(/type TEmployee[\s\S]*dept/.test(out), 'I13: 타입은 지금 표가 쓰는 필드로');
  ok(out.includes('TODO:'), 'I14: 추정이라는 사실을 코드에도 남긴다');

  // 봉투 키는 백엔드마다 달라 가정이 틀리면 런타임에 조용히 빈 목록이 된다(`data?.data`=undefined).
  // 그래서 배선 전용 모드에서는 카드에서 바로 바꿀 수 있어야 한다.
  ok(plan.envelopeChoices.includes('data') && plan.envelopeChoices.includes(NO_ENVELOPE),
    'I16: 배선 전용이면 봉투 선택지를 준다');

  const listEnv = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/employees',
    lookup: { docsScanned: 0, pathMentioned: false }, envelopeOverride: 'list',
  });
  eq(listEnv.envelopeKey, 'list', 'I17: 고른 봉투가 계획에 반영');
  ok((buildBindingApply({ source: FILE, plan: listEnv, choices: {} }).text ?? '')
    .includes('useApi<{ list: TEmployee[] }>'), 'I18: 생성 코드도 그 봉투로');
  ok((buildBindingApply({ source: FILE, plan: listEnv, choices: {} }).text ?? '')
    .includes('const employees = data?.list ?? []'), 'I19: 파생 const도 그 봉투로');

  const bare = buildBindingPlan({
    source: FILE, specText: null, endpoint: '/api/employees',
    lookup: { docsScanned: 0, pathMentioned: false }, envelopeOverride: NO_ENVELOPE,
  });
  eq(bare.envelopeKey, null, 'I20: "봉투 없음"이면 본문이 곧 배열');
  const bareOut = buildBindingApply({ source: FILE, plan: bare, choices: {} }).text ?? '';
  ok(bareOut.includes('useApi<TEmployee[]>') && bareOut.includes('const employees = data ?? []'),
    'I21: 봉투 없는 응답 배선');

  // 스펙이 있으면 문서가 진실의 원천 — 사람의 기억으로 흔들지 않는다.
  const mapped = buildBindingPlan({ source: FILE, specText: SPEC, endpoint: '/api/employees', envelopeOverride: 'list' });
  eq(mapped.envelopeKey, 'data', 'I22: 스펙이 있으면 봉투 override 무시');
  eq(mapped.envelopeChoices, [], 'I23: 스펙이 있으면 봉투 선택지도 안 준다');

  // 표가 아무 필드도 안 읽으면 배선할 것도 없다 — 그건 정직하게 막는다.
  const noFields = buildBindingPlan({
    source: '<table><thead><tr><th>a</th></tr></thead><tbody>{rows.map((r) => (<tr><td>x</td></tr>))}</tbody></table>',
    specText: null, endpoint: '/api/x', lookup: { docsScanned: 0, pathMentioned: false },
  });
  ok(!!noFields.blocked, 'I15: 읽는 필드가 없으면 배선 대상 없음');
}

console.log('\n── J. 대상 파일은 카드가 붙잡는다 ──');
{
  // 실측: 스펙 문서(.md)를 열어보는 것만으로 카드의 "현재 파일"이 그 문서가 돼 계획이 잠겼다.
  // 사유는 **어느 파일을 봤는지** 밝혀야 하고, 카드에서 바로 바꿀 수 있어야 한다.
  const wrongFile = buildBindingPlan({
    source: '# API 명세\n\n### GET /api/employees\n', specText: SPEC, endpoint: '/api/employees',
    targetFile: 'plan/api-spec.md',
    targetFileChoices: ['src/domains/dashboard/pages/Dashboard.tsx', 'plan/api-spec.md'],
  });
  ok(!!wrongFile.blocked && wrongFile.blocked.includes('plan/api-spec.md'), 'J1: 어느 파일에서 못 찾았는지 밝힌다');
  eq(wrongFile.targetFile, 'plan/api-spec.md', 'J2: 대상 파일을 카드가 들고 있다');
  eq(wrongFile.targetFileChoices.length, 2, 'J3: 막혀도 바꿀 후보를 준다(막다른 길 금지)');

  const right = buildBindingPlan({
    source: FILE, specText: SPEC, endpoint: '/api/employees',
    targetFile: 'src/domains/dashboard/pages/Dashboard.tsx',
    targetFileChoices: ['src/domains/dashboard/pages/Dashboard.tsx'],
  });
  eq(right.blocked, null, 'J4: 올바른 파일로 바꾸면 계획이 선다');
  eq(right.targetFile, 'src/domains/dashboard/pages/Dashboard.tsx', 'J5: 정상 계획도 대상 파일을 싣는다');

  const noFile = buildBindingPlan({ source: '', specText: SPEC, endpoint: '/api/employees' });
  ok(!!noFile.blocked && noFile.blocked.includes('열려 있지 않습니다'), 'J6: 파일이 없으면 그렇게 말한다');
}

console.log('\n── F. 엔드포인트 목록(칩 후보) ──');
{
  const docs = [
    { path: 'docs/api-spec.md', text: SPEC },
    { path: 'README.md', text: '설치는 [가이드](/docs/guide/install)를 보세요. 소스는 /src/domains/main 입니다.' },
    { path: 'docs/legacy.md', text: '- POST `/employees/bulk` 일괄 등록' },
  ];
  const eps = listEndpoints(docs);
  eq(eps, ['/api/employees', '/employees/bulk'], 'F1: API 접두사 또는 HTTP 메서드 줄만 엔드포인트로');
  ok(!eps.includes('/docs/guide/install'), 'F2: 문서 링크는 후보 아님(드롭다운 오염 방지)');
  eq(listEndpoints([]), [], 'F3: 스펙 없음 = 빈 목록(자유 입력으로 남는다)');
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
