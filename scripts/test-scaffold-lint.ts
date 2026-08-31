/**
 * Scaffold 린트(C1) 테스트 — 규칙 판정 · 오탐 · 자동 수정 왕복.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 C1.
 *
 * 이 하니스가 지키려는 것 두 가지:
 *  ① **오탐 0**(D 섹션) — 진단은 막지 않지만 소음이 쌓이면 개발자가 전체를 끈다.
 *  ② **수정 왕복**(E 섹션) — Quick Fix를 적용한 결과가 다시 린트하면 깨끗해야 한다.
 */
import {
  applyLintEdits, lintScaffoldSource, maskNonCode, SCAFFOLD_LINT_RULES,
  type ILintFinding, type TLintRuleId,
} from '../src/ai/lint/ScaffoldLint';
import { findModuleScopeHookCalls } from '../src/ai/lint/ReactHookScan';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}
const ids = (fs: ILintFinding[]): TLintRuleId[] => fs.map((f) => f.ruleId);
const only = (src: string, rule: TLintRuleId): ILintFinding[] =>
  lintScaffoldSource(src).filter((f) => f.ruleId === rule);

// ═══ A. 마스킹 (모든 규칙의 오탐 1차 방어선) ══════════════════════════════════
console.log('\n── A. 문자열·주석 마스킹 ──');
{
  const src = [
    "// fetch('/api/x') 는 금지다",
    "const label = 'window.alert 를 쓰지 마세요';",
    '/* useQuery(도 마찬가지 */',
    'const real = 1;',
  ].join('\n');
  const masked = maskNonCode(src);
  eq(masked.split('\n').length, 4, 'A1: 줄 수 보존');
  eq(masked.length, src.length, 'A2: 길이(오프셋) 보존');
  ok(!masked.includes('fetch('), 'A3: 한 줄 주석 내용 제거');
  ok(!masked.includes('window.alert'), 'A4: 문자열 내용 제거');
  ok(!masked.includes('useQuery('), 'A5: 블록 주석 내용 제거');
  ok(masked.includes('const real = 1;'), 'A6: 코드는 그대로');
  // 코드 줄의 문자열은 내용만 비고 따옴표(경계)는 남는다. 주석 줄은 따옴표째 사라지는 게 맞다.
  const codeLine = masked.split('\n')[1];
  ok(/^const label = '\s+';$/.test(codeLine), 'A7: 문자열은 내용만 비고 경계는 남는다');
  eq(codeLine.length, src.split('\n')[1].length, 'A7-2: 그 줄 길이도 보존');
  // 미종료 문자열이 파일 끝까지 먹지 않는다
  const broken = maskNonCode("const a = 'oops\nconst b = fetch();");
  ok(broken.includes('fetch()'), 'A8: 미종료 문자열은 그 줄에서 끝난다');
}

// ═══ B. 규칙별 판정 ═════════════════════════════════════════════════════════
console.log('\n── B. 규칙 판정 ──');
{
  // B1 모듈 최상위 훅 — 편집 게이트와 같은 탐지기
  const modScope = [
    "import { useApi } from '@axiom/hooks';",
    '',
    "const { data } = useApi<TUser[]>('/api/users');",
    '',
    'export default function Page(): React.ReactNode {',
    '  return <div />;',
    '}',
  ].join('\n');
  const f1 = only(modScope, 'module-scope-hook');
  eq(f1.length, 1, 'B1: 모듈 스코프 useApi 1건');
  eq([f1[0].line, f1[0].severity], [2, 'error'], 'B1-2: 줄·심각도');
  ok(modScope.split('\n')[f1[0].line].slice(f1[0].column, f1[0].endColumn) === 'useApi', 'B1-3: 스퀴글이 훅 이름 위');

  // 여러 줄 구조분해도 잡는다(캡쳐 실패 루트 회귀 — ReactHookScan 이관 후에도 유지)
  const multiline = [
    "import { useApi } from '@axiom/hooks';",
    'const {',
    '  data: response,',
    '  isPending,',
    "} = useApi<TUser[]>('/api/users');",
    'export default function Page() { return <div />; }',
  ].join('\n');
  eq(only(multiline, 'module-scope-hook').length, 1, 'B2: 여러 줄 구조분해 모듈스코프 훅');
  eq(findModuleScopeHookCalls(multiline)[0].line, 4, 'B2-2: 스퀴글은 `} = useApi(` 줄');

  // B3 refetch 인자
  const refetch = [
    'export default function Page() {',
    "  const { refetch } = useApi<TUser[]>('/api/users', { params: { q } });",
    '  const onSearch = () => refetch({ params: { q: keyword } });',
    '  return <div />;',
    '}',
  ].join('\n');
  const f3 = only(refetch, 'refetch-args');
  eq(f3.length, 1, 'B3: refetch({params}) 1건');
  eq(f3[0].line, 2, 'B3-2: 호출부 줄');

  // B4 봉투 언랩 누락
  const envelope = [
    'export default function Page() {',
    "  const { data } = useApi<{ data: TUser[]; total: number }>('/api/users');",
    '  const items = data ?? [];',
    '  return <div>{items.length}</div>;',
    '}',
  ].join('\n');
  const f4 = only(envelope, 'envelope-unwrap');
  eq(f4.length, 1, 'B4: 봉투 제네릭인데 data 직접 사용');
  ok(f4[0].message.includes('data?.data'), 'B4-2: 꺼내는 법을 메시지가 말한다');

  // B5 raw HTTP
  const raw = [
    'export default function Page() {',
    "  const load = () => fetch('/api/users').then((r) => r.json());",
    "  const q = useQuery({ queryKey: ['u'] });",
    '  return <div />;',
    '}',
  ].join('\n');
  eq(only(raw, 'raw-http').length, 2, 'B5: fetch + useQuery');

  // B6 react-router 훅
  const router = [
    "import { useNavigate } from 'react-router-dom';",
    'export default function Page() {',
    '  const navigate = useNavigate();',
    "  return <button onClick={() => navigate('/list')}>이동</button>;",
    '}',
  ].join('\n');
  const f6 = only(router, 'router-hook');
  eq(f6.length, 1, 'B6: useNavigate 1건');
  eq(f6[0].severity, 'error', 'B6-2: error');

  // B7 window 다이얼로그 — window.alert 와 전역 alert 둘 다
  const dialog = [
    'export default function Page() {',
    "  const a = () => window.alert('저장됨');",
    "  const b = () => { if (confirm('삭제할까요?')) remove(); };",
    '  return <div />;',
    '}',
  ].join('\n');
  const f7 = only(dialog, 'window-dialog');
  eq(f7.length, 2, 'B7: window.alert + 전역 confirm');
  ok(!!f7[0].fix && !f7[1].fix, 'B7-2: alert만 자동 수정(confirm은 의미가 바뀌어 수동)');
  eq(
    dialog.split('\n')[f7[0].line].slice(f7[0].column, f7[0].endColumn),
    'window.alert',
    'B7-3: 범위가 `window.alert` 전체',
  );

  // B8 UI import 경로
  const imports = [
    "import { Table } from '@axiom/components/ui/table';",
    "import { Button } from '@/shared/components/shadcn/components/ui/button';",
    "import { Input } from '@axiom/components/ui';",
    'export default function Page() { return <div />; }',
  ].join('\n');
  const f8 = only(imports, 'ui-import-path');
  eq(f8.length, 2, 'B8: 서브경로 + shadcn 내부경로(배럴은 정상)');

  // B9 타입 네이밍
  const types = [
    'type User = { id: number };',
    'interface Config { a: string }',
    'type TUser2 = { id: number };',
    'interface IConfig2 { a: string }',
    'type UserCardProps = { user: User };',
    'export default function Page() { return <div />; }',
  ].join('\n');
  const f9 = only(types, 'type-naming');
  eq(f9.map((f) => f.line), [0, 1], 'B9: 접두사 없는 type/interface만 (Props·정상은 제외)');
}

// ═══ C. 규칙 끄기 ═══════════════════════════════════════════════════════════
console.log('\n── C. 규칙 끄기 ──');
{
  const src = "export default function P() { const d = () => fetch('/api/x'); return <div />; }";
  eq(ids(lintScaffoldSource(src)), ['raw-http'], 'C1: 기본은 켜져 있다');
  eq(lintScaffoldSource(src, { disabledRules: ['raw-http'] }).length, 0, 'C2: 끄면 사라진다');
  eq(SCAFFOLD_LINT_RULES.length, 8, 'C3: v1 규칙 8종');
  eq(new Set(SCAFFOLD_LINT_RULES.map((r) => r.id)).size, 8, 'C4: 규칙 id 중복 없음');
}

// ═══ D. 오탐 (정상 scaffold 코드는 조용해야 한다) ════════════════════════════
console.log('\n── D. 오탐 방지 ──');
{
  const clean = [
    "import { useApi } from '@axiom/hooks';",
    "import { Table, Button } from '@axiom/components/ui';",
    '',
    'type TUser = { id: number; name: string };',
    'type UserCardProps = { user: TUser };',
    '',
    'export default function EmployeeListPage(): React.ReactNode {',
    "  const { data, isPending, refetch } = useApi<TUser[]>('/api/users', { params: { page } });",
    '  const items = data ?? [];',
    '  const onRefresh = () => refetch();',
    "  const onGo = () => $router.push('/detail');",
    "  const onSave = async () => { await $ui.alert('저장됐습니다'); };",
    '  if (isPending) return <div>로딩...</div>;',
    '  return <Table rows={items} onRefresh={onRefresh} onGo={onGo} onSave={onSave} />;',
    '}',
  ].join('\n');
  eq(ids(lintScaffoldSource(clean)), [], 'D1: 계약에 맞는 파일은 진단 0건');

  // 배열 제네릭(봉투 없는 백엔드)은 `data ?? []` 가 정답 — 봉투 규칙이 발동하면 안 된다
  ok(!ids(lintScaffoldSource(clean)).includes('envelope-unwrap'), 'D2: 배열 제네릭은 봉투 규칙 비대상');

  // 커스텀 훅 정의는 모듈 스코프 호출이 아니다
  const customHook = [
    "import { useApi } from '@axiom/hooks';",
    'export function useUsers() {',
    "  return useApi<TUser[]>('/api/users');",
    '}',
  ].join('\n');
  eq(ids(lintScaffoldSource(customHook)), [], 'D3: 커스텀 훅 정의는 위반 아님');

  // refetch() 무인자 · refetch({ throwOnError }) 는 정당
  const legitRefetch = 'export default function P() { const f = () => refetch({ throwOnError: true }); return <div />; }';
  eq(only(legitRefetch, 'refetch-args').length, 0, 'D4: params 없는 refetch 옵션은 정당');

  // `$ui.alert` · `refetch` 는 alert/fetch 규칙에 안 걸린다(식별자 경계)
  const boundary = "export default function P() { void $ui.alert('x'); void refetch(); return <div />; }";
  eq(ids(lintScaffoldSource(boundary)), [], 'D5: $ui.alert·refetch 는 오탐 아님');

  // 주석·문자열 속 위반 문구는 잡지 않는다
  const inComment = [
    '// window.alert 는 쓰지 말 것',
    "const doc = 'useNavigate() 대신 $router';",
    'export default function P() { return <div />; }',
  ].join('\n');
  eq(ids(lintScaffoldSource(inComment)), [], 'D6: 주석·문자열 속 문구는 비대상');

  // JSX 안 `type="date"` 속성이 타입 선언으로 오인되면 안 된다
  const jsxType = 'export default function P() { return <input type="date" />; }';
  eq(ids(lintScaffoldSource(jsxType)), [], 'D7: JSX type 속성은 타입 선언 아님');

  // ── 아래 D8~D11은 실 scaffold 200개 파일 스모크에서 실제로 나온 오탐이다(전부 수정 후 고정) ──

  // D8: 데모 페이지가 **화면에 보여주는 코드 예시**(템플릿 리터럴)는 코드가 아니다.
  //     실측: 이걸 안 거르면 모듈스코프 훅 9건 중 7건, UI import 2건이 전부 여기서 나왔다.
  const codeSample = [
    "import { Checkbox } from '@axiom/components/ui';",
    'const TIMING_CODE = `',
    'const [values, setValues] = useState(INITIAL_VALUES);',
    "import { Carousel } from '@/shared/lib/shadcn/ui/carousel';",
    '`;',
    'export default function P() { return <Checkbox />; }',
  ].join('\n');
  eq(ids(lintScaffoldSource(codeSample)), [], 'D8: 템플릿 리터럴 속 코드 예시는 비대상');

  // D9: 여러 줄 import 의 타입 지정자는 **선언이 아니다**(남의 라이브러리 타입에 접두사를 요구하면 안 됨).
  const typeImport = [
    "import axios, {",
    '  type AxiosInstance,',
    '  type AxiosDefaults,',
    "} from 'axios';",
    'export default function P() { return <div />; }',
  ].join('\n');
  eq(only(typeImport, 'type-naming').length, 0, 'D9: import 의 type 지정자는 타입 선언 아님');

  // D10: JSX 산문 속 `<code>useQuery</code>` 는 제네릭 호출이 아니다(호출 괄호가 있어야 위반).
  const prose = 'export default function P() { return <p><code>useQuery</code> / <code>useMutation</code>을 씁니다</p>; }';
  eq(only(prose, 'raw-http').length, 0, 'D10: JSX 산문의 훅 이름은 호출이 아님');

  // D11: 이름이 Props 로 끝나면 type·interface 모두 비대상 — 실 scaffold가 `interface IXxxProps` 로
  //      이미 정착시킨 스타일이라, 규칙이 이걸 뒤집으면 한 파일에서만 수십 건이 뜬다.
  const props = [
    'type UserCardProps = { id: number };',
    'export interface IFormFieldProps { label: string }',
    'interface DataTableProps<TData> { rows: TData[] }',
    'export default function P() { return <div />; }',
  ].join('\n');
  eq(only(props, 'type-naming').length, 0, 'D11: Props 로 끝나는 타입은 검사 안 함');
}

// ═══ E. 자동 수정 왕복 (고친 결과는 다시 린트해서 깨끗해야 한다) ═══════════════
console.log('\n── E. Quick Fix 왕복 ──');
{
  // E1 refetch 인자 제거
  const src1 = 'export default function P() { const f = () => refetch({ params: { q } }); return <div />; }';
  const fix1 = only(src1, 'refetch-args')[0].fix!;
  const out1 = applyLintEdits(src1, fix1.edits);
  ok(out1.includes('refetch()'), 'E1: refetch() 로 정리');
  eq(only(out1, 'refetch-args').length, 0, 'E1-2: 다시 린트하면 깨끗');

  // E2 UI import 경로
  const src2 = "import { Table } from '@axiom/components/ui/table';\nexport default function P() { return <Table />; }";
  const out2 = applyLintEdits(src2, only(src2, 'ui-import-path')[0].fix!.edits);
  ok(out2.startsWith("import { Table } from '@axiom/components/ui';"), 'E2: 배럴 경로로 교체');
  eq(only(out2, 'ui-import-path').length, 0, 'E2-2: 다시 린트하면 깨끗');

  // E3 타입 접두사 — 선언과 참조를 함께 바꾼다
  const src3 = [
    'type User = { id: number };',
    'export default function P() {',
    '  const u: User = { id: 1 };',
    '  const list: User[] = [u];',
    '  return <div>{list.length}</div>;',
    '}',
  ].join('\n');
  const out3 = applyLintEdits(src3, only(src3, 'type-naming')[0].fix!.edits);
  eq((out3.match(/\bTUser\b/g) ?? []).length, 3, 'E3: 선언 1 + 참조 2 전부 변경');
  ok(!/\bUser\b(?!\w)/.test(out3.replace(/TUser/g, '')), 'E3-2: 옛 이름이 남지 않는다');
  eq(only(out3, 'type-naming').length, 0, 'E3-3: 다시 린트하면 깨끗');

  // E4 봉투 언랩
  const src4 = [
    'export default function P() {',
    "  const { data } = useApi<{ data: TUser[]; total: number }>('/api/users');",
    '  const items = data ?? [];',
    '  return <div>{items.length}</div>;',
    '}',
  ].join('\n');
  const out4 = applyLintEdits(src4, only(src4, 'envelope-unwrap')[0].fix!.edits);
  ok(out4.includes('const items = data?.data ?? [];'), 'E4: data?.data 로 봉투 열기');
  eq(only(out4, 'envelope-unwrap').length, 0, 'E4-2: 다시 린트하면 깨끗');

  // E5 $router 전환 — 선언 삭제 + 호출부 치환 + import 정리
  const src5 = [
    "import { useNavigate } from 'react-router-dom';",
    'export default function P() {',
    '  const navigate = useNavigate();',
    "  const go = () => navigate('/list');",
    '  const back = () => navigate(-1);',
    "  const rep = () => navigate('/home', { replace: true });",
    '  return <div onClick={go} onDoubleClick={back} onBlur={rep} />;',
    '}',
  ].join('\n');
  const f5 = only(src5, 'router-hook')[0];
  ok(!!f5.fix, 'E5: 한 줄 선언 모양이면 자동 수정 제공');
  const out5 = applyLintEdits(src5, f5.fix!.edits);
  ok(!out5.includes('useNavigate'), 'E5-2: 선언·import 에서 사라짐');
  ok(out5.includes("$router.push('/list')"), 'E5-3: push');
  ok(out5.includes('$router.back()'), 'E5-4: back');
  ok(out5.includes("$router.replace('/home')"), 'E5-5: replace');
  eq(only(out5, 'router-hook').length, 0, 'E5-6: 다시 린트하면 깨끗');

  // E6 자동 수정이 불가능한 모양은 fix 없이 판정만 — 기계가 정답을 못 고르는 경우 침묵이 옳다
  const src6 = [
    "import { useNavigate } from 'react-router-dom';",
    'export default function P() {',
    '  const navigate = useNavigate();',
    "  const go = () => navigate('/list', { state: { from: 'here' } });",
    '  return <div onClick={go} />;',
    '}',
  ].join('\n');
  ok(!only(src6, 'router-hook')[0].fix, 'E6: state 전달은 기계가 옮길 수 없어 수동');

  // E7 window.alert 치환
  const src7 = "export default function P() { const a = () => window.alert('저장됨'); return <div onClick={a} />; }";
  const out7 = applyLintEdits(src7, only(src7, 'window-dialog')[0].fix!.edits);
  ok(out7.includes("$ui.alert('저장됨')") && !out7.includes('window.alert'), 'E7: $ui.alert 로 교체');
  eq(only(out7, 'window-dialog').length, 0, 'E7-2: 다시 린트하면 깨끗');
}

// ═══ F. 정렬·안정성 ═════════════════════════════════════════════════════════
console.log('\n── F. 정렬·안정성 ──');
{
  const messy = [
    "import { Table } from '@axiom/components/ui/table';",
    'type User = { id: number };',
    'export default function P() {',
    "  const d = () => fetch('/api/x');",
    '  return <Table onClick={d} />;',
    '}',
  ].join('\n');
  const fs = lintScaffoldSource(messy);
  const lines = fs.map((f) => f.line);
  eq(lines, [...lines].sort((a, b) => a - b), 'F1: 위치 순 정렬');
  eq(ids(fs), ['ui-import-path', 'type-naming', 'raw-http'], 'F2: 세 규칙이 함께 잡힌다');

  // 빈 파일·공백만 있는 파일에서 죽지 않는다
  eq(lintScaffoldSource('').length, 0, 'F3: 빈 파일');
  eq(lintScaffoldSource('\n\n   \n').length, 0, 'F4: 공백만');
  // 같은 입력은 같은 결과(결정론)
  eq(JSON.stringify(lintScaffoldSource(messy)), JSON.stringify(lintScaffoldSource(messy)), 'F5: 결정론');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
