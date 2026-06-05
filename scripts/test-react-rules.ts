/**
 * detectModuleScopeHookViolation / hoistModuleScopeHooks 회귀 테스트
 * (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행). 실행: node scripts/run-test-react-rules.mjs
 *
 * 루트 회귀(캡쳐 실패): 모듈 스코프에 **여러 줄 구조분해**로 생성된 useApi 가 탐지를 빠져나가
 * 함수 컴포넌트 밖에 조용히 적용되던 버그. 훅 토큰이 첫 줄이 아니라 `} = useApi(` 연속 줄에 있고
 * 그 줄의 brace depth 가 0이 아니어서 종전 라인 단위 검사가 통째로 놓쳤다.
 */
import { FileCreatorService } from '../src/ai/FileCreatorService';
import { findDuplicateDeclarations } from '../src/ai/StructuralAnchor';

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

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
