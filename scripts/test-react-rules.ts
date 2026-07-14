/**
 * detectModuleScopeHookViolation / hoistModuleScopeHooks 회귀 테스트
 * (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행). 실행: node scripts/run-test-react-rules.mjs
 *
 * 루트 회귀(캡쳐 실패): 모듈 스코프에 **여러 줄 구조분해**로 생성된 useApi 가 탐지를 빠져나가
 * 함수 컴포넌트 밖에 조용히 적용되던 버그. 훅 토큰이 첫 줄이 아니라 `} = useApi(` 연속 줄에 있고
 * 그 줄의 brace depth 가 0이 아니어서 종전 라인 단위 검사가 통째로 놓쳤다.
 */
import { FileCreatorService } from '../src/ai/pipeline/FileCreatorService';
import { findDuplicateDeclarations, ensureUiComponentImports } from '../src/ai/apply/StructuralAnchor';

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

const det = (c: string): string | null => FileCreatorService.detectModuleScopeHookViolation(c);

const PREFIX = `import { useApi } from '@axiom/hooks';
const EMPLOYEES_ENDPOINT = '/api/employees' as const;
const PAGE_LIMIT = 10;
`;
const COMP = (body: string): string =>
  `export default function EmployeeListPage(): React.ReactNode {\n${body}\n  return <div />;\n}`;

console.log('\ndetectModuleScopeHookViolation:');

// 위반: 모듈 스코프 여러 줄 구조분해 useApi (캡쳐 재현 — 루트 회귀)
check(
  '여러 줄 구조분해 모듈스코프 useApi → 위반',
  !!det(PREFIX + `
const {
  data: response,
  isPending,
  refetch,
} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {
  params: { page: currentPage, department: selectedDepartment },
});

` + COMP('  const x = 1;')),
);

// 위반: 한 줄 모듈스코프 useApi (종전 동작 유지)
check('한 줄 모듈스코프 useApi → 위반', !!det(PREFIX + `const r = useApi(EMPLOYEES_ENDPOINT);\n\n` + COMP('  const x = 1;')));

// 위반: 모듈스코프 bare useEffect
check('모듈스코프 bare useEffect → 위반', !!det(PREFIX + `useEffect(() => {}, []);\n\n` + COMP('  const x = 1;')));

// 위반: 모듈스코프 배열 구조분해 useState
check('모듈스코프 배열 구조분해 useState → 위반', !!det(PREFIX + `const [p, setP] = useState(1);\n\n` + COMP('  const x = 1;')));

// 정상: 컴포넌트 안 여러 줄 구조분해 useApi (거짓양성 방지 — 핵심)
check(
  '컴포넌트 안 여러 줄 구조분해 useApi → 정상',
  !det(PREFIX + '\n' + COMP(`  const {
    data: response,
    refetch,
  } = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {
    params: { page: currentPage },
  });`)),
);

// 정상: 화살표 컴포넌트 본문 훅 (거짓양성 방지 — backtracking 함정)
check(
  '화살표 컴포넌트 본문 훅 → 정상',
  !det(PREFIX + `
const EmployeeListPage = (): React.ReactNode => {
  const [page, setPage] = useState(1);
  const {
    data,
    refetch,
  } = useApi(EMPLOYEES_ENDPOINT, { params: { page } });
  return <div />;
};
export default EmployeeListPage;`),
);

// 정상: 모듈스코프 일반 const(훅 아님)
check(
  '모듈스코프 일반 const(배열) → 정상',
  !det(PREFIX + `
const columns = [
  { key: 'name', label: '이름' },
  { key: 'dept', label: '부서' },
];

` + COMP('  const x = 1;')),
);

// 정상: 모듈스코프 타입 달린 const = useApi 가 아님(파생)
check('모듈스코프 파생 const(훅 아님) → 정상', !det(PREFIX + `const labels: Record<string, () => void> = {};\n\n` + COMP('  const x = 1;')));

console.log('\n가드 체인(캡쳐 시나리오): 탐지 → hoist 안전 거부:');
{
  const original = PREFIX + '\n' + COMP(`  const {
    data: response,
    refetch,
  } = useApi(EMPLOYEES_ENDPOINT, { params: { page: currentPage } });`);
  // 모델이 기존 useApi 를 모듈 스코프에 통째 재생성(department 추가), 원본 안의 것은 잔존 → 중복+모듈스코프
  const patched = PREFIX + `
const {
  data: response,
  refetch,
} = useApi(EMPLOYEES_ENDPOINT, { params: { page: currentPage, department: selectedDepartment } });

` + COMP(`  const {
    data: response,
    refetch,
  } = useApi(EMPLOYEES_ENDPOINT, { params: { page: currentPage } });`);

  const before = FileCreatorService.detectReactRuleViolations(original);
  const after = FileCreatorService.detectReactRuleViolations(patched);
  check('원본 위반 없음', before === null);
  check('patch 위반 탐지됨(루트 회귀)', after !== null);
  check('가드 발동(!before && after)', before === null && after !== null);
  check(
    'hoist 안전 거부(null → Full 재시도)',
    FileCreatorService.hoistModuleScopeHooks(patched) === null,
    '다중 줄 구조분해는 중복 useApi 를 만들 위험이 있어 hoist 대신 거부가 올바름',
  );
  // 보조: findDuplicateDeclarations 도 다중 줄 구조분해 중복은 못 잡음을 문서화(탐지기가 유일 방어선)
  const origD = new Set(findDuplicateDeclarations(original));
  const newD = findDuplicateDeclarations(patched).filter((d) => !origD.has(d));
  check('다중 줄 구조분해 중복은 dup-게이트가 못 잡음(탐지기가 방어) — 문서화', newD.length === 0);
}

// ─── dedupeImportLines: 중복 import 결정론 제거(모든 편집 모드 공통 길목) ───────────────
{
  const fc = new FileCreatorService();
  // 실측 버그: full 모드가 이미 있는 `import { Button }`을 또 써넣음.
  const dup = `import type React from 'react';
import { Button } from '@axiom/components/ui';
import { Button } from '@axiom/components/ui';

export default function P(): React.ReactNode { return <Button/>; }`;
  const r1 = fc.dedupeImportLines(dup);
  check('dedup: 정확히 동일한 import 1줄 제거', r1.removed === 1);
  check('dedup: 결과에 Button import 1줄만 남음',
    (r1.text.match(/import \{ Button \} from '@axiom\/components\/ui';/g) ?? []).length === 1);
  check('dedup: React import는 보존', r1.text.includes("import type React from 'react';"));

  // 따옴표·여백 정규화 후 동일하면 제거(작은따옴표↔큰따옴표, 공백 차이).
  const dupNorm = `import { useApi } from '@axiom/hooks';
import { useApi }  from "@axiom/hooks";`;
  check('dedup: 따옴표/공백만 다른 중복도 제거', fc.dedupeImportLines(dupNorm).removed === 1);

  // 서로 다른 import는 건드리지 않음(오제거 방지).
  const distinct = `import { Button } from '@axiom/components/ui';
import { Card } from '@axiom/components/ui';`;
  check('dedup: 서로 다른 named import는 보존', fc.dedupeImportLines(distinct).removed === 0);
}

// ─── normalizeUiImportPaths: 서브경로 @axiom/components/ui/xxx → 단일경로 ──────────────
{
  const fc = new FileCreatorService();
  const sub = `import { Table, TableBody, TableCell } from '@axiom/components/ui/table';`;
  const n1 = fc.normalizeUiImportPaths(sub);
  check('uiNorm: /table 서브경로를 단일경로로 교정', n1.changed === 1);
  check('uiNorm: 결과가 @axiom/components/ui 단일경로', n1.text.includes("from '@axiom/components/ui';"));
  check('uiNorm: 서브경로 흔적 없음', !n1.text.includes('components/ui/table'));

  // 여러 줄에 걸친 import·다중 서브경로도 각각 교정.
  const multi = `import {\n  Table,\n  TableRow,\n} from "@axiom/components/ui/table";\nimport { Dialog } from '@axiom/components/ui/dialog';`;
  const n2 = fc.normalizeUiImportPaths(multi);
  check('uiNorm: 멀티라인+다중 서브경로 2건 교정', n2.changed === 2);

  // 이미 단일경로면 손대지 않음(무변경).
  const ok = `import { Button } from '@axiom/components/ui';`;
  check('uiNorm: 이미 단일경로는 무변경', fc.normalizeUiImportPaths(ok).changed === 0);

  // @axiom/hooks 등 다른 모듈은 건드리지 않음.
  const hooks = `import { useApi } from '@axiom/hooks';`;
  check('uiNorm: 타 모듈(@axiom/hooks)은 불변', fc.normalizeUiImportPaths(hooks).changed === 0);
}

// ─── stripGlobalImports: 전역($ui/$util/$router) 환각 import 제거 ──────────────────────
{
  const fc = new FileCreatorService();
  // 실측 버그: 모델이 $ui를 import로 지어냄(전역이라 import 불필요).
  const g1 = fc.stripGlobalImports(`import { $ui } from '@axiom/hooks';`);
  check('glob: 전역만 있는 import 라인 삭제', g1.removed === 1 && !g1.text.includes('$ui'));

  // named 목록에 전역이 섞이면 전역만 제거하고 나머지는 보존.
  const g2 = fc.stripGlobalImports(`import { useApi, $ui } from '@axiom/hooks';`);
  check('glob: 섞인 named에서 전역만 제거', g2.removed === 1 && g2.text.includes('useApi') && !g2.text.includes('$ui'));

  // default 형태도 제거.
  const g3 = fc.stripGlobalImports(`import $router from '@axiom/router';`);
  check('glob: default 전역 import 삭제', g3.removed === 1 && g3.text.trim() === '');

  // 전역이 아닌 정상 import는 불변.
  const g4 = fc.stripGlobalImports(`import { Button } from '@axiom/components/ui';`);
  check('glob: 정상 import는 불변', g4.removed === 0);

  // 코드 본문의 $ui 사용($ui.alert)은 import가 아니므로 건드리지 않음.
  const g5 = fc.stripGlobalImports(`const f = () => $ui.alert('x');`);
  check('glob: 본문 $ui 사용은 불변', g5.removed === 0 && g5.text.includes('$ui.alert'));
}

// ─── ensureUiComponentImports: 사용된 UI 컴포넌트 import 결정론적 보강 ──────────────────────
{
  // 실측 버그: 선택 경로에서 <Button> 삽입 + import 누락 → 컴파일 깨짐. 배럴 import 없으면 새 줄 추가.
  const b1 = ensureUiComponentImports(
    `import type React from 'react';\n\nexport default function P(): React.ReactNode {\n  return (<div><Button onClick={() => {}}>x</Button></div>);\n}`,
  );
  check('ensureUI: 누락된 Button 보강(added)', b1.added.includes('Button'));
  check('ensureUI: 새 배럴 import 라인 추가', b1.text.includes("import { Button } from '@axiom/components/ui';"));
  check('ensureUI: import를 react import 뒤에 삽입', b1.text.indexOf("from 'react'") < b1.text.indexOf('@axiom/components/ui'));

  // 이미 다른 UI 컴포넌트를 배럴에서 import 중이면 그 라인에 병합(중복 라인 안 만듦).
  const b2 = ensureUiComponentImports(
    `import { Card } from '@axiom/components/ui';\n\nfunction P() { return (<Card><Button>x</Button></Card>); }`,
  );
  check('ensureUI: 기존 배럴 import에 Button 병합', b2.text.includes('Card, Button') || b2.text.includes('Button, Card'));
  check('ensureUI: 배럴 import 라인 1개만(중복 없음)', (b2.text.match(/@axiom\/components\/ui/g) || []).length === 1);

  // Table 계열(고유 prop 없어 propsIndex엔 없지만 UI_COMPONENTS 카탈로그엔 있음)도 보강.
  const b3 = ensureUiComponentImports(`function P() { return (<Table><TableRow><TableCell>x</TableCell></TableRow></Table>); }`);
  check('ensureUI: Table 계열 보강', b3.added.includes('Table') && b3.added.includes('TableRow') && b3.added.includes('TableCell'));

  // 이미 import된 컴포넌트는 보강 안 함(no-op).
  const b4 = ensureUiComponentImports(`import { Button } from '@axiom/components/ui';\nfunction P() { return (<Button>x</Button>); }`);
  check('ensureUI: 이미 import됨 → no-op', b4.added.length === 0);

  // 커스텀 컴포넌트(카탈로그에 없음, 경로 가변)는 건드리지 않음(오주입 방지).
  const b5 = ensureUiComponentImports(`function P() { return (<StatusBadge value={1} />); }`);
  check('ensureUI: 커스텀 컴포넌트는 보강 안 함', b5.added.length === 0);

  // 로컬 선언된 컴포넌트는 이미 available → 보강 안 함.
  const b6 = ensureUiComponentImports(`function Button() { return null; }\nfunction P() { return (<Button/>); }`);
  check('ensureUI: 로컬 선언 컴포넌트는 보강 안 함', b6.added.length === 0);

  // 주석 처리된 컴포넌트는 사용으로 오인하지 않음.
  const b7 = ensureUiComponentImports(`function P() { return (<div>{/* <Button/> */}</div>); }`);
  check('ensureUI: 주석 속 컴포넌트는 보강 안 함', b7.added.length === 0);
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
