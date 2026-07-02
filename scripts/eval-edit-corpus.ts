/**
 * 편집품질 라이브 eval(Phase 2) 코퍼스 — 픽스처 + coreRules 스냅샷 + 케이스.
 *
 * 왜 별도 코퍼스인가: eval-e2e는 **region 경로**(runHybridRegionEdit)만 측정한다. 오늘(2026-07-02)
 * 프로덕션에서 터진 3건은 전부 **full/patch 생성 경로**에서 났다 — 단일 컴포넌트 페이지라 region locate가
 * 깨지고 full 입력으로 가는 경로(메모리 project_full_vs_sliced_finding). 그 경로의 산출·적용 품질을
 * 자동 판정하려면 별도 픽스처·판정이 필요하다.
 *
 * ⚠️ coreRules 스냅샷 주의: 아래 CORE_RULES_SNAPSHOT은 ScaffoldContextBuilder._buildCoreRules(vscode 결합)의
 * 출력을 scaffold 기본값(react-router, 라이브러리 버전 없음)으로 **동결한 사본**이다. 실 buildSystemPrompt는
 * 워크스페이스 스캔에 의존해 node 배치에서 재현 불가(핸드오프 §44) → 순수 조각(buildContractSection)+이 스냅샷으로
 * 근사한다. _buildCoreRules를 고치면 이 스냅샷도 갱신할 것(그 드리프트를 잡는 게 CORE_RULES_SYNC_HINT).
 */

/** _buildCoreRules에서 스냅샷이 커버해야 하는 불변 규칙 앵커(프로덕션 문구가 바뀌면 스냅샷 갱신 신호). */
export const CORE_RULES_SYNC_HINT = '데이터 출처 우선순위';

/**
 * _buildCoreRules({ includeNavigation:true, includeFileScope:true }) 동결 사본.
 * 동적 부분(router 버전/라이브러리 버전)은 scaffold 기본값으로 고정.
 */
export const CORE_RULES_SNAPSHOT = `당신은 Axiom AI입니다. react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- 모든 코드는 아래 scaffold 문서의 패턴을 따라야 합니다
- createBrowserRouter 사용 금지 → 항상 createHashRouter (createAppRouter() 경유)
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- **데이터 출처 우선순위(중요)**: 화면에 목록/데이터를 표시할 때 **이미 파일에 있는 데이터 출처**(함수·상수·state — 예: \`getArr()\`가 반환하는 배열, 하드코딩 배열)가 있으면 **그것을 그대로 사용**한다. 사용자가 "API/엔드포인트로 **불러와·조회·연동**"을 **명시하지 않는 한**, \`useApi\`나 새 \`/api/…\` 엔드포인트를 **새로 만들지 말 것**. 예) "getArr 결과를 테이블로 보여줘" → 새 API가 아니라 기존 \`getArr()\`를 \`.map()\`으로 렌더. (데이터 출처가 파일에 없고 사용자가 API를 원할 때만 useApi.)
- **기존 코드 보존(중요)**: 새 \`useApi\`나 import를 추가할 때 ① 이미 있는 import를 다시 추가하지 말 것(중복), ② 기존 훅의 구조분해 필드(\`isPending\`, \`error\`, \`refetch\` 등)를 **이름 바꾸지 말 것**. 충돌이 걱정되면 **새로 추가하는 훅의 필드만** 고유 이름으로 alias한다. 기존 훅과 그 사용처는 건드리지 않는다.
- **⚠️ React Rules of Hooks 절대 준수**: \`use\`로 시작하는 모든 훅은 반드시 React 함수 컴포넌트 본문 최상위에서만 호출.
- 상대경로 임포트 금지 → UI 컴포넌트는 반드시 @axiom/components/ui 단일 경로에서 named import 사용 (예: import { Button, Input, Card } from '@axiom/components/ui';), 훅은 반드시 @axiom/hooks (예: import { useApi } from '@axiom/hooks').
- **버튼은 \`<Button>\` (@axiom/components/ui)**: 새 버튼을 만들 때 raw \`<button>\` 대신 scaffold의 \`<Button>\`을 사용한다(variant/size로 스타일).
- scaffold의 package.json에 없는 라이브러리 제안 금지
- 코드 주석은 한국어로 작성
- **화면 이동 금지 패턴**: useNavigate(), useHistory() 등 react-router 훅 사용 금지
- **화면 이동 올바른 패턴**: 전역 $router 객체 사용 (import 불필요) — $router.push('/path')
- **⚠️ 파일 생성 범위 엄수**: 사용자가 명시적으로 요청한 파일(페이지)만 생성할 것.
- **react-router import**: useParams 등 react-router 관련 훅은 반드시 \`'react-router'\`에서 import 하세요.

## TypeScript 타입 네이밍 컨벤션 (반드시 준수)
- **일반 타입**: \`type\` 키워드 + \`T\` 접두사 → \`type TUser = { ... }\`
- **인터페이스**: \`interface\` 키워드 + \`I\` 접두사 → \`interface IApiConfig { ... }\`
- **Props 타입**: \`type\` 키워드, 접두사 없음 → \`type UserCardProps = { ... }\`

## 프로젝트 스택
React 19, TypeScript, Vite 8, TanStack Query v5, shadcn/ui, TailwindCSS 4
해시 기반 라우팅 (createHashRouter), 도메인 기반 아키텍처 (core/domains/shared)`;

/**
 * 편집 산출 지침(시나리오 C 근사). 실 buildSystemPrompt의 편집 포맷 규칙을 압축해 재현한다 —
 * 판정에 필요한 것: axiom-action + <patch><search>/<replace> 포맷, 원본 그라운딩, 조각만 출력.
 */
export const EDIT_FORMAT_INSTRUCTIONS = `## 현재 열린 파일을 수정하는 방법

아래 "현재 파일"을 요청대로 수정하세요. 파일 전체를 다시 쓰지 말고 **바뀌는 부분만** \`<patch>\`로 출력합니다.

형식(정확히 이대로):
<axiom-action>
{"actionType": "modify", "filePath": "src/domains/employee/pages/EmployeeListPage.tsx"}
<patch>
<search>
(원본 파일에 지금 존재하는 코드 그대로 — 앵커. 아직 없는 코드를 넣으면 매칭 실패)
</search>
<replace>
(그 자리를 대체할 새 코드 — 기존 라인 + 추가 라인)
</replace>
</patch>
</axiom-action>

⚠️ 필수 규칙:
- \`<search>\`에는 **원본 파일에 지금 존재하는 코드만** 넣는다(없는 코드를 넣으면 매칭 실패).
- import를 추가할 땐 이미 있는 import를 다시 추가하지 말 것(중복 금지).
- 여러 곳을 고치면 \`<patch>\`를 여러 개 출력한다(각 search는 원본 기준, 라인 겹침 금지).
- 설명 문장만 내지 말고 반드시 \`<axiom-action>\` 블록을 출력한다.`;

export interface EditCase {
  id: string;
  /** 표시용 이름. */
  name: string;
  /** 픽스처 파일 원본. */
  fixture: string;
  /** 대상 파일 경로(action.filePath 근사·프롬프트 주입용). */
  filePath: string;
  /** 사용자 요청. */
  query: string;
  /**
   * 로컬 데이터 렌더 요청인가(파일에 이미 데이터 출처 존재 → 새 useApi/api 금지).
   * true면 판정 ⓐ(api 환각) 활성.
   */
  localData: boolean;
  /** 이 케이스가 특히 노리는 판정 플래그(리포트 강조용). */
  focus: JudgeFlag[];
}

/** 자동 판정 플래그 — 각각 "이 결함이 발생했나"(true=결함). */
export type JudgeFlag =
  | 'apiHallucination' // ⓐ 로컬 데이터인데 새 /api/·useApi 추가
  | 'dupImport' // ⓑ 중복 import 생성(dedupe가 제거함)
  | 'patchUnmatched' // ⓒ patch가 원본에 매칭 안 됨(atomic 실패)
  | 'ungrounded' // ⓓ 원본에 없는 심볼을 <search>에 넣음
  | 'proseOnly'; // ⓔ action 블록 없이 설명만

// ── 픽스처 1: getArr 로컬 데이터(useApi 없음) ────────────────────────────────
// 오늘 실패 재현: "getArr 결과를 테이블로 보여줘" → 새 /api/·useApi를 환각하면 안 됨.
const FIX_GETARR = `import { Button } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';

type TProduct = {
	id: number;
	name: string;
	price: number;
};

// 상품 배열을 반환하는 로컬 함수 — 데이터 출처(파일 내부)
function getArr(): TProduct[] {
	return [
		{ id: 1, name: '노트북', price: 1500000 },
		{ id: 2, name: '마우스', price: 25000 },
		{ id: 3, name: '키보드', price: 89000 },
	];
}

export default function ProductListPage(): React.ReactNode {
	return (
		<div className="p-5">
			<PageHeader title="상품 목록" />
			<p className="text-muted-foreground">여기에 상품을 표시합니다.</p>
		</div>
	);
}
`;

// ── 픽스처 2: 버튼 추가(Button 이미 import됨) ─────────────────────────────────
// 오늘 실패 재현: "alert 버튼 넣어줘" → 이미 있는 Button import를 다시 추가(중복)하면 안 됨.
const FIX_BUTTON = `import { Button } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';

export default function DashboardPage(): React.ReactNode {
	return (
		<div className="p-5">
			<PageHeader title="대시보드" />
			<div className="mt-4">
				<Button variant="outline">새로고침</Button>
			</div>
		</div>
	);
}
`;

// ── 픽스처 3: 하드코딩 배열 로컬 렌더 ─────────────────────────────────────────
// 오늘 실패 재현: "이 배열을 테이블로" → 로컬 배열을 그대로 .map() 렌더(새 API 금지).
const FIX_ARRAY = `import PageHeader from '@/shared/components/ui/PageHeader';

const rows = [
	{ code: 'A01', label: '영업부' },
	{ code: 'B02', label: '개발부' },
	{ code: 'C03', label: '기획부' },
];

export default function DeptListPage(): React.ReactNode {
	return (
		<div className="p-5">
			<PageHeader title="부서 목록" />
		</div>
	);
}
`;

export const EDIT_CASES: EditCase[] = [
  {
    id: 'getarr-to-table',
    name: 'getArr 결과를 테이블로 → 로컬 렌더(useApi 환각 X)',
    fixture: FIX_GETARR,
    filePath: 'src/domains/product/pages/ProductListPage.tsx',
    query: '현재 화면에서 getArr 함수 결과를 테이블로 화면에 보여줘',
    localData: true,
    focus: ['apiHallucination', 'ungrounded', 'proseOnly'],
  },
  {
    id: 'alert-button',
    name: 'alert 버튼 넣어줘 → 중복 import X · 그라운딩',
    fixture: FIX_BUTTON,
    filePath: 'src/domains/main/pages/DashboardPage.tsx',
    query: 'alert을 띄우는 버튼 하나 넣어줘',
    localData: false,
    focus: ['dupImport', 'ungrounded', 'proseOnly'],
  },
  {
    id: 'array-to-table',
    name: '이 배열을 테이블로 → 로컬 렌더(useApi 환각 X)',
    fixture: FIX_ARRAY,
    filePath: 'src/domains/main/pages/DeptListPage.tsx',
    query: '이 배열을 테이블로 화면에 보여줘',
    localData: true,
    focus: ['apiHallucination', 'patchUnmatched', 'proseOnly'],
  },
];
