/**
 * locateFuzzyRegion + resolvedOk 단위 테스트 (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행).
 * 실행: node scripts/run-test-patch-grounded.mjs
 */
import { FileCreatorService, type PatchBlock } from '../src/ai/pipeline/FileCreatorService';

const svc = new FileCreatorService();
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

const FILE = [
  'type TMemberSummary = {',                 // 1
  '  name: string;',                         // 2
  '  dept: string;',                         // 3
  '};',                                      // 4
  '',                                        // 5
  'export default function ReportPage() {',  // 6
  '  return (',                              // 7
  '    <div>',                               // 8
  '      <span>{member.name}</span>',        // 9
  '      <span>{member.name}</span>',        // 10
  '    </div>',                              // 11
  '  );',                                    // 12
  '}',                                       // 13
].join('\n');
const LINES = FILE.split('\n');

console.log('locateFuzzyRegion:');

// 1. 정확 1곳 — 토큰 완전 일치, 유일 → confidence 1.0, 영역에 해당 줄 포함
{
  const r = svc.locateFuzzyRegion(LINES, 'name: string', 2, 0.6);
  check('정확 1곳 매칭', r !== null && Math.abs(r.confidence - 1) < 1e-9 && r.text.includes('name: string'),
    r ? `conf=${r.confidence}, lines=${r.startLine}~${r.endLine}` : 'null');
}

// 2. 들여쓰기/구두점 차이 흡수 (토큰 동일) → 매칭
{
  const r = svc.locateFuzzyRegion(LINES, '   };  ', 1, 0.5);
  // '};' 는 토큰이 없어 anchor가 비므로 null 이어야 한다 (식별 불가)
  check('토큰 없는 search → null', r === null, r ? JSON.stringify(r) : 'null');
}

// 3. 다중 동점 (동일한 두 줄) → null
{
  const r = svc.locateFuzzyRegion(LINES, '{member.name}', 1, 0.6);
  check('다중 동점 → null', r === null, r ? `conf=${r.confidence} line=${r.startLine}` : 'null');
}

// 4. 임계치 미달 → null
{
  const r = svc.locateFuzzyRegion(LINES, 'completelyUnrelated xyzzy foobarbaz', 2, 0.6);
  check('임계치 미달 → null', r === null, r ? `conf=${r.confidence}` : 'null');
}

// 5. 빈 search → null
{
  const r = svc.locateFuzzyRegion(LINES, '   \n  \n', 2, 0.6);
  check('빈 search → null', r === null);
}

// 6. 임계치 knob 동작 — 부분 토큰 겹침(자카드 0.5)은 0.6에서 거부, 0.4에서 허용
{
  // 실제: 'export default function ReportPage() {'(토큰 4) vs search 토큰 {function,ReportPage}(2)
  //  → 자카드 = 2/4 = 0.5
  const strict = svc.locateFuzzyRegion(LINES, 'function ReportPage() {', 1, 0.6);
  const loose = svc.locateFuzzyRegion(LINES, 'function ReportPage() {', 1, 0.4);
  check('부분겹침: 임계치 0.6 → null', strict === null, strict ? `conf=${strict.confidence}` : 'null');
  check('부분겹침: 임계치 0.4 → 매칭', loose !== null && loose.text.includes('ReportPage'),
    loose ? `conf=${loose.confidence} lines=${loose.startLine}~${loose.endLine}` : 'null');
}

console.log('\ncomputeMultiPatch.resolvedOk:');

// 7. 일부 실패해도 성공분 resolvedOk 채움, text는 atomic하게 null
{
  const patches: PatchBlock[] = [
    { search: '  name: string;', replace: '  employee_name: string;' }, // 성공
    { search: '  THIS_DOES_NOT_EXIST_ANYWHERE_xyz;', replace: '  nope;' }, // not-found
  ];
  const mp = svc.computeMultiPatch(FILE, patches);
  const ok = mp.results.find((r) => r.index === 0);
  const fail = mp.results.find((r) => r.index === 1);
  check('실패 섞임 → text=null (atomic)', mp.text === null);
  check('성공분 resolvedOk 채움', mp.resolvedOk.length === 1 && mp.resolvedOk[0].index === 0,
    JSON.stringify(mp.resolvedOk));
  check('실패 사유 not-found', fail?.success === false && fail?.reason === 'not-found');
  check('성공 patch 결과 success', ok?.success === true);
}

// 8. 전부 성공 → text 생성 + resolvedOk 전부 채움
{
  const patches: PatchBlock[] = [
    { search: '  name: string;', replace: '  employee_name: string;' },
    { search: '  dept: string;', replace: '  department: string;' },
  ];
  const mp = svc.computeMultiPatch(FILE, patches);
  check('전부 성공 → text 생성', mp.text !== null && mp.text!.includes('employee_name') && mp.text!.includes('department'));
  check('resolvedOk 전부 채움', mp.resolvedOk.length === 2);
}

console.log('\nresolveStubSection:');

const STUB_FILE = [
  'type T = { x: string };',          // 1
  '',                                 // 2
  'export function Foo() {',          // 3
  '  const a = 1;',                   // 4
  '  const b = 2;',                   // 5
  '  return a + b;',                  // 6
  '}',                                // 7
  '',                                 // 8
  'export function Bar() {',          // 9
  '  return 0;',                      // 10
  '}',                                // 11
].join('\n');

// 9. // 주석 형태 스텁 → 실제 Foo 본문 범위
{
  const r = svc.resolveStubSection(STUB_FILE, '// ... [function Foo] 원본 5줄 보존 (자리 표시자: 이 이름을 변수처럼 참조 금지)');
  check('// 스텁 → 실제 섹션 본문', r !== null && r.text.includes('export function Foo') && r.text.includes('return a + b'),
    r ? `lines=${r.startLine}~${r.endLine}` : 'null');
}

// 10. JSX 주석 형태 스텁 → 동일하게 해소 (모델이 JSX 안에서 변형한 케이스)
{
  const r = svc.resolveStubSection(STUB_FILE, '      {/* ... [function Foo] 원본 5줄 보존 (자리 표시자: 이 이름을 변수처럼 참조 금지) */}');
  check('JSX 스텁 → 실제 섹션 본문', r !== null && r.text.includes('export function Foo'),
    r ? `lines=${r.startLine}~${r.endLine}` : 'null');
}

// 11. 스텁 없는 search → null (일반 not-found는 fuzzy 경로가 처리)
{
  const r = svc.resolveStubSection(STUB_FILE, '  const a = 1;');
  check('스텁 없음 → null', r === null);
}

// 12. 존재하지 않는 섹션 스텁 → null
{
  const r = svc.resolveStubSection(STUB_FILE, '// ... [function Nonexistent] 원본 9줄 보존 (자리 표시자)');
  check('없는 섹션 스텁 → null', r === null);
}

console.log('\nextractRenameMap / applyRenameMap (1B ripple guard):');

// 13. 단순 필드 rename 추출
{
  const map = svc.extractRenameMap([{ search: '  name: string;', replace: '  employee_name: string;' }]);
  check('단일 rename 추출', map.get('name') === 'employee_name' && map.size === 1, JSON.stringify([...map]));
}

// 14. 멀티라인 다중 rename + 타입변경 동반 → rename만, 타입(string→number)은 제외
{
  const search = 'type T = {\n  name: string;\n  rate: string;\n};';
  const replace = 'type T = {\n  employee_name: string;\n  rate_pct: number;\n};';
  const map = svc.extractRenameMap([{ search, replace }]);
  check('rename 추출 + 타입변경 제외',
    map.get('name') === 'employee_name' && map.get('rate') === 'rate_pct' && !map.has('string'),
    JSON.stringify([...map]));
}

// 15. 충돌(같은 old가 다른 new) → 제외
{
  const map = svc.extractRenameMap([
    { search: 'a: string;', replace: 'b: string;' },
    { search: 'a: string;', replace: 'c: string;' },
  ]);
  check('충돌 rename 제외', !map.has('a'), JSON.stringify([...map]));
}

// 16. 구조 불일치(토큰 수 다름) → 추출 안 함
{
  const map = svc.extractRenameMap([{ search: 'name: string;', replace: 'employee_name: string; extra: number;' }]);
  check('구조 불일치 → 빈 맵', map.size === 0, JSON.stringify([...map]));
}

// 17. applyRenameMap — 식별자 단위 동시 적용, 부분문자열 오염 없음
{
  const map = new Map([['name', 'employee_name']]);
  check('소비처 rename 적용', svc.applyRenameMap('{member.name}', map) === '{member.employee_name}');
  // 부분 문자열 'name'이 'username'을 오염시키면 안 됨
  check('부분문자열 비오염', svc.applyRenameMap('const username = 1;', map) === 'const username = 1;');
}

// 18. applyRenameMap — 체이닝 없음 (a→b, b→c여도 a가 c로 가지 않음)
{
  const map = new Map([['a', 'b'], ['b', 'c']]);
  check('체이닝 없음', svc.applyRenameMap('a b', map) === 'b c');
}

console.log('\napplyMemberRename (Phase 2 결정론 리플):');

// 19. 멤버 접근만 치환, 객체 리터럴 키·독립 변수는 비건드림
{
  const map = new Map([['name', 'employee_name']]);
  const src = [
    'const obj = { name: 1 };',          // 객체 키 → 유지
    'const name = 2;',                   // 독립 변수 → 유지
    'return <td>{member.name}</td>;',    // 멤버 접근 → 치환
  ].join('\n');
  const r = svc.applyMemberRename(src, map);
  check('멤버 접근만 치환',
    r.count === 1 &&
    r.text.includes('{ name: 1 }') &&
    r.text.includes('const name = 2;') &&
    r.text.includes('member.employee_name'),
    JSON.stringify({ count: r.count, fields: r.fields }));
}

// 20. optional chaining + 경계(부분문자열) 안전
{
  const map = new Map([['name', 'employee_name']]);
  check('옵셔널 체이닝', svc.applyMemberRename('a?.name', map).text === 'a?.employee_name');
  check('경계: .names 비치환', svc.applyMemberRename('a.names', map).text === 'a.names');
}

// 21. 다중 필드 count + 단일 패스(체이닝 없음)
{
  const map = new Map([['id', 'employee_id'], ['dept', 'department']]);
  const r = svc.applyMemberRename('m.id + m.dept + m.id', map);
  check('다중 필드 count', r.count === 3 && r.text === 'm.employee_id + m.department + m.employee_id',
    JSON.stringify({ count: r.count, text: r.text }));
  const chain = svc.applyMemberRename('x.a', new Map([['a', 'b'], ['b', 'c']]));
  check('체이닝 없음(.a→.b만)', chain.text === 'x.b');
}

// 22. 빈 맵 → 무변경
{
  const r = svc.applyMemberRename('member.name', new Map());
  check('빈 맵 무변경', r.text === 'member.name' && r.count === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
