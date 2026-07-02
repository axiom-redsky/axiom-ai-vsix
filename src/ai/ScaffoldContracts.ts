/**
 * react-app-scaffold 계약 레지스트리 — region(하이브리드) 편집 프롬프트용 **트리거 기반 자동 주입**.
 *
 * 배경: full 경로는 ScaffoldContextBuilder(coreRules + RAG)로 scaffold 가이드를 모델에 가르치지만,
 * region 경로는 토큰 절약을 위해 deps 헤더 + region + 소수 인라인 규칙만 보낸다(eval:region ~60% 절감).
 * 그 결과 약한 모델이 **useApi 계약을 모른 채** 편집해 `refetch({params})` 같은 잘못된 API를 창작했다.
 *
 * 증상마다 인라인 규칙을 늘리는 대신, 여기서 "계약 카드"(트리거 + 압축 본문)를 한 곳에 모으고,
 * deps 헤더·region·query를 스캔해 **관련 있는 카드만** region 프롬프트에 자동으로 끼워 넣는다.
 *  - 결정론적(모델/임베딩 없음) → 테스트로 회귀 고정.
 *  - 압축(카드당 ~3~5줄) + 관련 시에만 발동 → region의 토큰 절약 취지 유지.
 *  - 일반화: useApi뿐 아니라 라우터·타입 네이밍 등 scaffold 가이드 항목 전반으로 확장 가능.
 *
 * 카드 본문은 coreRules([ScaffoldContextBuilder._buildCoreRules])·knowledge/patterns/use-api.md 의
 * 축약본이다 — 두 곳이 갈라지면 모델이 모순된 지침을 받으므로, 가이드 변경 시 함께 갱신한다.
 */

/** 카드 발동 여부 판정에 쓰는 입력 — 같은 파일의 읽기 전용 컨텍스트 + 사용자 요청. */
export interface IContractContext {
  /** region 밖 같은 파일 코드(읽기 전용 deps 헤더). */
  deps: string;
  /** 모델이 재작성할 편집 영역 원본. */
  region: string;
  /** 사용자 요청 문자열. */
  query: string;
}

/** 하나의 scaffold 계약 카드. */
export interface IScaffoldContract {
  /** 안정 식별자(테스트·진단용). */
  id: string;
  /** 프롬프트에 붙는 소제목. */
  title: string;
  /** 이 컨텍스트에 이 계약이 관련 있는지(트리거). */
  applies: (ctx: IContractContext) => boolean;
  /** 주입할 압축 계약 본문(마크다운 불릿). */
  card: string;
  /**
   * 이 카드가 **편집 영역의 루트를 통째로 다른 컴포넌트로 교체**하는 레시피면 그 타깃 컴포넌트 태그명
   * (예: 'SmartTable'). 설정 시 region 루트태그 게이트가 그 태그로의 루트 변경을 허용하고(checkRegionRootTag),
   * region 프롬프트의 "최상위 태그 유지" 지침을 교체 허용으로 바꾼다. 일반 카드는 미설정(루트 변경 금지 유지).
   */
  replacesRegionRootWith?: string;
}

/** `\bword\b` 매칭(정규식 메타 이스케이프). */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);
}

/**
 * 요청이 **SmartTable**(선언형 고수준 그리드)을 명시적으로 지목하는지.
 * SmartTable 카드를 발동시키고, 동시에 순수 \<table\> 재작성을 가르치는 list-table-binding 카드는
 * 양보(비발동)시켜 두 카드가 모순된 지침을 동시에 주는 것을 막는다.
 */
function wantsSmartTable(query: string): boolean {
  // 명시적 SmartTable 지목 + "데이터 테이블/그리드"(이 스캐폴드에서 고수준 데이터 그리드 = SmartTable).
  // ⚠ 저수준 `DataTable`(영문)은 별개 컴포넌트라 영문 "data table"은 트리거에서 제외한다(한글만 채택).
  return /smart\s*-?\s*table|스마트\s*테이블|스마트\s*그리드|데이터\s*테이블|데이터\s*그리드|definecolumns/i.test(query);
}

/**
 * 요청이 **이미 파일에 존재하는 로컬 데이터 출처**(함수·상수)를 데이터로 지목하는지.
 * 예: "getArr함수 결과를 테이블로", "getArr() 결과를 …". 이런 요청은 API를 새로 만드는 게 아니라
 * 기존 로컬 데이터를 렌더하는 것이므로 list-table-binding(list API 적용) 카드를 양보시킨다
 * (안 그러면 모델이 존재하지 않는 `/api/…`와 `useApi`를 지어낸다 — 실측 버그).
 */
function referencesLocalDataSource(query: string, code: string): boolean {
  // "X함수" / "X()" 형태로 쿼리가 지목한 식별자를 뽑아, 그것이 파일에 선언돼 있으면 로컬 출처로 본다.
  const ids = [...query.matchAll(/([A-Za-z_$][\w$]*)\s*(?:함수|\(\s*\))/g)].map((m) => m[1]);
  return ids.some(
    (id) =>
      new RegExp(`\\b(?:const|let|var|function)\\s+${id}\\b`).test(code) ||
      new RegExp(`\\b${id}\\s*=[^=]`).test(code),
  );
}

/**
 * 응답 스키마 확인 게이트 — 테이블/그리드 바인딩 카드에 공통으로 덧붙인다.
 * 응답 필드 구성이 참조 스펙·열린 파일 어디에도 없으면 추측 코드를 짓는 대신 **한 번 되묻게** 한다.
 * "모를 때만 묻기"(스키마가 이미 있으면 되묻지 않음)로 불필요한 마찰을 막고, 막다른 질문이 아니라
 * 빠져나갈 길(가정해 진행)을 함께 제시한다.
 */
const SCHEMA_CONFIRM_GATE =
  `\n- ⚠ **응답 스키마 확인 게이트(모를 때만)**: 대상 \`/api/…\` 응답의 필드 구성이 ` +
  `**참조 스펙·열린 파일 어디에도 없으면**, 필드를 추측해 코드를 짓지 말고 — ` +
  `**axiom-action(편집 블록)을 출력하지 말고** 아래 톤으로 한 번만 되물으세요(추궁이 아니라 "정확히 해드리려 확인"):\n` +
  `  > "{엔드포인트} 응답 데이터의 형태를 확인하고 싶습니다. 표를 정확히 구성하려면 응답 필드 구성을 알아야 해서요 — ` +
  `① 응답 JSON 예시나 타입을 붙여주시거나 ② 스펙 파일 경로(예: \`/plan/api-spec.md\`)를 짚어주시면 그대로 반영하겠습니다. ` +
  `③ 지금 바로 진행이 필요하면 일반적인 형태로 **가정해 초안**을 만들고 가정한 필드는 주석으로 표시해 두겠습니다."\n` +
  `  · 단, 응답 스키마가 **이미 컨텍스트(참조 스펙/열린 파일의 타입)에 있으면 되묻지 말고** 바로 위 골격대로 적용하세요(불필요한 되묻기 금지).`;

/**
 * 카드 레지스트리. 배열 순서 = 프롬프트 출력 순서(결정론).
 * 새 scaffold 가이드 항목은 여기에 카드 하나를 추가하면 자동으로 트리거 주입 대상이 된다.
 */
export const SCAFFOLD_CONTRACTS: IScaffoldContract[] = [
  {
    id: 'use-api',
    title: 'useApi 데이터 훅 (@axiom/hooks)',
    // deps/region에 useApi가 있거나, 요청이 데이터 조회·refetch·파라미터를 언급하면 발동.
    applies: ({ deps, region, query }) =>
      hasWord(deps, 'useApi') ||
      hasWord(region, 'useApi') ||
      hasWord(region, 'refetch') ||
      /api|조회|불러|가져|fetch|refetch|파라미터|파라메터|parameter|매개변수|목록|데이터/i.test(query),
    card:
      `- 모든 HTTP 호출은 \`useApi\`(@axiom/hooks)로만 합니다 — \`useQuery\`/\`useMutation\`을 직접 쓰지 마세요.\n` +
      `- ⛔ **\`refetch()\`는 인자를 받지 않습니다.** TanStack Query 재조회 함수로, 인자 없이 **현재 params로 다시 가져오기**만 합니다. ` +
      `\`refetch({ params: … })\`처럼 파라미터를 인자로 넘기지 마세요(틀린 사용 — 무시됨). ` +
      `**파라미터를 바꾸려면 \`useApi(endpoint, { params: { … } })\`의 \`params\`를 수정**하면 변경 시 자동 재조회됩니다.\n` +
      `- ⛔ 서버 응답 목록을 \`useState\`+\`useEffect\`로 복사(미러링)하지 마세요 → \`const items = resp?.data ?? [];\` 처럼 ` +
      `**파생 const**로 바로 사용합니다.\n` +
      `- ⛔ 기존 훅의 구조분해 필드(\`data\`·\`isPending\`·\`error\`·\`refetch\` 등) 이름을 바꾸지 마세요.`,
  },
  {
    id: 'router',
    title: '화면 이동 ($router)',
    applies: ({ region, query }) =>
      /\$router\b|useNavigate|useHistory|\bnavigate\b/.test(region) ||
      /이동|네비|navigate|라우팅|뒤로|화면\s*전환|페이지.*이동|이동.*페이지|링크|router/i.test(query),
    card:
      `- 화면 이동은 전역 \`$router\` 객체로 합니다(import 불필요): \`$router.push('/path')\` · \`$router.replace('/path')\` · \`$router.back()\`.\n` +
      `- ⛔ \`useNavigate()\`·\`useHistory()\` 등 react-router 훅 사용 금지.`,
  },
  {
    id: 'global-ui-alerts',
    title: '알림·확인 다이얼로그 (전역 $ui)',
    // region/deps에 window.alert(confirm)·$ui가 있거나, 요청이 알림/확인 다이얼로그를 언급하면 발동.
    // 모달/팝업(Dialog 컴포넌트)은 별개라 트리거에서 제외 — alert/confirm 의미만 좁혀 잡는다.
    applies: ({ deps, region, query }) =>
      /window\s*\.\s*(alert|confirm)\s*\(/i.test(region) ||
      /window\s*\.\s*(alert|confirm)\s*\(/i.test(deps) ||
      /\$ui\b/.test(region) ||
      /\balert\b|\bconfirm\b|얼럿|컨펌|알림\s*창|알림\s*팝업|경고\s*창|확인\s*창|확인\s*팝업|메시지\s*박스/i.test(query),
    card:
      `- 알림·확인은 브라우저 기본이 아니라 전역 \`$ui\`로 합니다(import 불필요): ` +
      `\`await $ui.alert('메시지')\` · \`const ok = await $ui.confirm('메시지')\`(확인=\`true\`).\n` +
      `- ⛔ \`window.alert()\`/\`window.confirm()\`/전역 \`alert()\`/\`confirm()\` 사용 금지 — ` +
      `\`$ui\`는 디자인토큰·다크모드가 적용된 non-blocking 다이얼로그이며 \`Promise\`로 결과를 받습니다.\n` +
      `- 타입 지정 시 아이콘·색상·기본제목 자동: \`$ui.alert('저장됐습니다', { type: 'success' })\`(success|info|warning|error). ` +
      `토스트처럼 자동 닫힘: \`{ autoDismiss: 1500 }\`.`,
  },
  {
    id: 'global-util',
    title: '공통 포맷·변환 유틸 (전역 $util)',
    // region/deps에 $util이 있거나, 요청이 포맷/변환류(금액·날짜·마스킹·그룹핑 등)를 언급하면 발동.
    // bare "숫자/날짜"만으로는 발동 안 함(남발 방지) — 포맷/변환 동사와 결합될 때만.
    applies: ({ deps, region, query }) =>
      /\$util\b/.test(region) ||
      /\$util\b/.test(deps) ||
      /포맷|format|금액|통화|currency|천\s*단위|콤마|comma|쉼표|마스킹|\bmask|퍼센트|percent|한글\s*금액|축약|자리수|소수점|날짜\s*(포맷|형식|변환|계산)|숫자\s*(포맷|형식|변환)|그룹\s*핑|groupby|합계|sumby|중복\s*제거|정렬\s*(해|하)|영업일/i.test(query),
    card:
      `- 숫자·날짜·문자열·금융·객체·배열 가공은 전역 \`$util\`로 합니다(import 불필요): ` +
      `\`$util.number.comma(1234567)\`("1,234,567") · \`$util.number.currency(v)\`("…원") · \`$util.date.format(d, 'YYYY-MM-DD')\` · ` +
      `\`$util.string.mask(v, 3, 7)\` · \`$util.array.groupBy(rows, 'type')\` 등.\n` +
      `- ⛔ 수동 포맷(\`toLocaleString\`·정규식 콤마·\`Date\` 직접 슬라이싱 등)이나 \`import { numberUtil } …\` 직접 임포트 대신 전역 \`$util.*\`를 쓰세요.\n` +
      `- 네임스페이스 6종: \`number\`·\`date\`·\`string\`·\`finance\`·\`object\`·\`array\`.`,
  },
  {
    id: 'class-merge-cn',
    title: 'className 병합 (cn)',
    // 조건부/동적/문자열결합 className이나 병합 의도일 때만 발동 — 정적 className엔 발동 안 함(거의 모든 JSX 남발 방지).
    applies: ({ region, query }) =>
      /\bcn\s*\(/.test(region) ||
      /className\s*=\s*\{\s*`[^`]*\$\{/.test(region) || // 템플릿리터럴 동적 className
      /className\s*=\s*\{[^}]*(\?|&&|\+)[^}]*\}/.test(region) || // 조건부/문자열결합 className
      /조건부\s*(클래스|class|스타일)|(클래스|classname)\s*병합|동적\s*(클래스|스타일)|tailwind\s*충돌|\bcn\s*\(/i.test(query),
    card:
      `- 조건부·동적·외부주입(className prop) 클래스를 합칠 때는 \`cn()\`을 쓰세요: ` +
      `\`import { cn } from '@/shared/utils/cn';\` → \`className={cn('rounded border', disabled && 'opacity-50', className)}\`.\n` +
      `- ⛔ 템플릿리터럴/문자열 \`+\`로 클래스를 손수 잇지 마세요 — \`cn()\`은 \`clsx\`+\`tailwind-merge\`로 ` +
      `Tailwind 충돌(\`px-2\`↔\`px-4\`)을 마지막 값으로 정리합니다(정적 문자열만이면 그대로 두어도 됩니다).`,
  },
  {
    id: 'type-naming',
    title: 'TypeScript 타입 네이밍·위치',
    // 선언 형태(type Foo / interface Foo)나 타입·스펙 언급 시 발동. JSX의 type="text" 속성엔 오발동 안 함.
    applies: ({ region, query }) =>
      /\b(type|interface|enum)\s+[A-Za-z]/.test(region) ||
      /타입|인터페이스|interface|응답.*타입|요청.*타입|스펙|모델\b/i.test(query),
    card:
      `- 타입은 \`type\` + \`T\` 접두사(\`type TUser = { … }\`), 인터페이스는 \`interface\` + \`I\` 접두사(\`interface IConfig { … }\`). ` +
      `접두사 없는 \`type\`/\`interface\` 선언 금지.\n` +
      `- API 응답/요청 타입은 \`type\` + \`T\`(interface 금지). Props 타입은 \`type\`, 접두사 없음.\n` +
      `- \`type\`/\`interface\`/\`enum\`은 컴포넌트 본문 안이 아니라 \`export default function\` **바로 위(모듈 스코프)** 에 선언합니다.`,
  },
  {
    id: 'date-picker',
    title: '날짜 선택 — Calendar 드롭다운 패턴 (레시피)',
    // 요청이 Calendar/달력/날짜선택을 언급하거나, 편집 영역에 <Input type="date">가 있으면 발동.
    // 약한 모델이 컴포넌트 교체+부수훅(open state·ref·click-outside effect·JSX) 4부품을 1-shot으로
    // 코디네이트 못 해 import만 하고 멈추는 실패(실측)를, "정확한 골격"을 줘 슬롯 채우기로 낮춘다.
    applies: ({ region, query }) =>
      /\btype\s*=\s*["']date["']/.test(region) ||
      /\bCalendar\b|캘린더|달력|날짜\s*선택|날짜\s*입력|date\s*picker|date-picker|datepicker/i.test(query),
    card:
      `- \`<Input type="date">\`(또는 날짜 입력)를 \`Calendar\`(@axiom/components/ui) 드롭다운으로 바꿀 때는 ` +
      `**아래 4부품을 모두** 출력하세요 — 하나라도 빠지면 달력이 동작하지 않습니다(import만 추가하고 끝내지 마세요):\n` +
      `  1) import: \`<import module="@axiom/components/ui" named="Calendar" />\`\n` +
      `  2) \`<hook>\`에 **열림 state + 바깥영역 ref** (이 컨트롤 전용 새 이름으로): ` +
      `\`const [pickerOpen, setPickerOpen] = useState(false);\` 와 \`const pickerRef = useRef<HTMLDivElement>(null);\`\n` +
      `  3) \`<hook>\`에 **바깥 클릭 시 닫기 effect** — 이 \`useEffect\`는 미러링이 아니라 정당한 UI 패턴이므로 ` +
      `**반드시 추가**하세요: ` +
      `\`useEffect(() => { const h = (e: MouseEvent): void => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);\`\n` +
      `  4) \`<region>\`의 입력칸을 **버튼 + 조건부 Calendar**로(영역 최상위 태그는 그대로 유지): ` +
      `\`<div ref={pickerRef} className="relative"><Button variant="outline" onClick={() => setPickerOpen((v) => !v)}>{날짜값 || '날짜 선택'}</Button>{pickerOpen && <Calendar mode="single" selected={…} onSelect={(d) => { …기존 문자열 state에 반영…; setPickerOpen(false); }} />}</div>\`\n` +
      `- ⚠ 기존 날짜 문자열 state(API 전송용 \`yyyy-MM-dd\` 등)는 **그대로 유지**하고 Calendar 선택 결과를 그 state에 반영하세요 ` +
      `— 서버 전송 포맷을 깨지 않도록 새 미러 state를 만들지 마세요.`,
  },
  {
    id: 'smart-table-binding',
    title: 'SmartTable에 list API 적용 — 타입+훅+컬럼DSL+SmartTable 재작성 (레시피)',
    // 이 레시피는 영역의 <table>(또는 컨테이너 내용)을 <SmartTable/>로 통째 교체한다 → 루트태그 변경이 정상.
    replacesRegionRootWith: 'SmartTable',
    // 요청이 SmartTable(선언형 고수준 그리드)을 명시적으로 지목하면 발동.
    // region 경로는 knowledge/components/SmartTable.md 를 주입하지 않으므로(토큰 절약), 이 카드가
    // SmartTable 계약(defineColumns + <SmartTable data=… columns=…/>)을 가르친다. 미지정 시(=순수 table)는
    // list-table-binding 카드가 담당한다(wantsSmartTable로 상호 배타).
    // ⚠ 편집 영역에 **이미 <SmartTable 이 있으면** 이 "새로 바인딩" 레시피는 양보한다 — 그 경우는 "옵션 추가"
    // (exportable·selectable 등)이지 "새로 만들기"가 아니므로, 이 카드가 발동하면 모델을 base 골격
    // (<SmartTable data columns searchable/>)으로 되돌려 입력과 동일한 코드를 반환하게 만든다(실측: "변경 없음").
    // 옵션 추가는 ComponentPropsIndex의 존재 기반 prop 표가 담당한다.
    applies: ({ query, region }) => wantsSmartTable(query) && !/<SmartTable\b/.test(region),
    card:
      `- **SmartTable**(@axiom/components/ui)은 컬럼을 \`defineColumns\` 설정 맵으로 선언하는 고수준 그리드입니다. ` +
      `손으로 \`<table><tr><td>\`를 짜지 말고 **아래 3부품을 모두** 출력하세요(하나라도 빠지면 적용이 거부됩니다):\n` +
      `  1) \`<hook>\`에 **응답 타입 + useApi + 파생 목록 + 컬럼DSL**을 함께 선언 — 요소 타입(\`TXxx\`)과 응답 타입(\`TXxxResponse\`)을 ` +
      `**반드시 같은 \`<hook>\`에 선언**하세요(\`useApi<TXxxResponse>\`처럼 타입 인자만 쓰고 선언을 빠뜨리면 거부됨):\n` +
      `\`type TXxx = { id: number; … };\`  ← 필드는 **참조 스펙의 response 스키마**에서(더미 필드 추측 금지)\n` +
      `\`type TXxxResponse = { data: TXxx[] };\`  ← 스펙의 실제 응답 래퍼 형태에 맞게\n` +
      `\`const XXX_ENDPOINT = '/api/…';\`\n` +
      `\`const { data: xxxResponse } = useApi<TXxxResponse>(XXX_ENDPOINT);\`\n` +
      `\`const xxxItems = xxxResponse?.data ?? [];\`\n` +
      `\`const xxxColumns = defineColumns<TXxx>({ 필드명: '라벨', 금액필드: { label: '금액', format: 'money', align: 'right' } });\`\n` +
      `     · 맵의 **key가 곧 데이터 필드명**입니다. 문자열은 라벨 단축형, 객체는 \`{ label, format?, align?, badge? }\`. ` +
      `\`format\`은 \`'money'|'number'|'percent'|'date'|'date:YYYY.MM.DD'|'phone'\` 등(전역 \`$util\`로 자동 매핑).\n` +
      `  2) import는 두 줄: \`<import module="@axiom/components/ui" named="SmartTable, defineColumns" />\` 와 \`<import module="@axiom/hooks" named="useApi" />\`\n` +
      `  3) \`<region>\`의 기존 테이블 마크업을 **\`<SmartTable data={xxxItems} columns={xxxColumns} searchable />\`** 한 줄로 교체하세요 ` +
      `(영역 최상위 태그는 유지). 정렬·페이지네이션·검색·컬럼토글은 SmartTable이 자동 처리하므로 별도 구현하지 마세요.\n` +
      `- ⚠ \`data\`와 \`endpoint\`를 **동시에 주지 마세요**. 위처럼 useApi로 받아 \`data\`에 넘기는 클라이언트 모드가 기본입니다 ` +
      `(서버 페이징이 꼭 필요하면 \`data\` 대신 \`endpoint="/api/…"\` 한 가지만, \`select\`로 응답을 \`{ rows, total }\`로 매핑).` +
      SCHEMA_CONFIRM_GATE,
  },
  {
    id: 'list-table-binding',
    title: '목록 테이블에 list API 적용 — 타입+훅+테이블 재작성 (레시피)',
    // "테이블/목록에 …api 적용" 의도이거나, 편집 영역에 테이블 마크업이 있고 요청이 데이터/적용을 언급하면 발동.
    // 약한 모델이 useApi 훅만 선언하고 ① 응답 타입 선언과 ② 테이블 JSX 재작성을 빠뜨려(실측: region 편집
    // 없음 → 미사용 선언 거부 / TXxxResponse 미선언 → 의존성 거부) dead-end 나던 것을, 3부품 골격으로 낮춘다.
    // ⚠ SmartTable을 명시한 요청은 smart-table-binding 카드가 담당하므로 여기선 양보한다(모순 지침 방지).
    applies: ({ region, query, deps }) =>
      !wantsSmartTable(query) &&
      // 이미 있는 로컬 함수/상수를 데이터로 지목한 요청("getArr 결과를 테이블로")은 API 적용이 아니다 → 양보.
      !referencesLocalDataSource(query, `${deps}\n${region}`) &&
      // ⚠ "보여"(렌더 동사)는 API 적용 신호가 아니다 — 순수 로컬 렌더 요청까지 끌어와 useApi를 지어내던 오발동 원인이라 제외.
      ((/(테이블|목록|리스트|그리드|table|list|grid|행\b|로우|rows?)/i.test(query) &&
        /(api|적용|연동|바인딩|불러|가져|조회|채워|매핑|연결|붙여)/i.test(query)) ||
      (/<(table|tbody|thead|Table)\b/i.test(region) && /(api|목록|데이터|적용|불러|조회|연동)/i.test(query))),
    card:
      `- 테이블/목록에 list API를 적용할 때는 **아래 3부품을 모두** 출력하세요 — 훅만 넣고 멈추지 말고 ` +
      `ⓐ응답 타입 ⓑuseApi 훅 ⓒ테이블 재작성을 **한 번에**. (하나라도 빠지면 적용이 거부됩니다.)\n` +
      `  1) \`<hook>\`에 **응답 타입 + useApi + 파생 목록**을 함께 선언 — 요소 타입(\`TXxx\`)과 응답 타입(\`TXxxResponse\`)을 ` +
      `**반드시 같은 \`<hook>\`에 선언**하세요. \`useApi<TXxxResponse>\`처럼 타입 인자만 쓰고 선언을 빠뜨리면 거부됩니다:\n` +
      `\`type TXxx = { … };\`  ← 필드는 **참조 스펙의 response 스키마**에서(더미 배열 필드 추측 금지)\n` +
      `\`type TXxxResponse = { data: TXxx[] };\`  ← 스펙의 실제 응답 래퍼 형태에 맞게\n` +
      `\`const XXX_ENDPOINT = '/api/…';\`\n` +
      `\`const { data: xxxResponse } = useApi<TXxxResponse>(XXX_ENDPOINT);\`\n` +
      `\`const xxxItems = xxxResponse?.data ?? [];\`\n` +
      `  2) import는 useApi만: \`<import module="@axiom/hooks" named="useApi" />\`\n` +
      `  3) \`<region>\`의 테이블 본문을 하드코딩 배열 대신 **그 목록을 \`.map()\`** 으로 재작성하세요 ` +
      `(영역 최상위 태그·컬럼 구조는 그대로, **데이터 출처만** API 목록으로 교체):\n` +
      `\`{xxxItems.map((row) => (<tr key={row.id}>…<td>{row.필드명}</td>…</tr>))}\`\n` +
      `- ⚠ 기존 컬럼(헤더·셀 구성)은 유지하고 \`.map\` 대상만 하드코딩 배열 → \`xxxItems\`로 바꾸세요. ` +
      `로딩/에러 표시가 필요하면 \`isPending\`·\`error\`를 쓰되, 안 쓸 거면 구조분해에서 빼세요(미사용 선언은 거부됨).` +
      SCHEMA_CONFIRM_GATE,
  },
  {
    id: 'form-validation',
    title: '폼 구성·검증 (react-hook-form + zod)',
    // region에 폼 훅/리졸버가 있거나, 요청이 "폼/양식/form" + "검증/유효성/제출"을 함께 언급하면 발동.
    // bare "form"만으로는 발동 안 함(남발 방지).
    applies: ({ region, query }) =>
      /\buseForm\b|zodResolver|@hookform\/resolvers|z\.object\b/.test(region) ||
      (/폼|양식|\bform\b/i.test(query) &&
        /검증|유효성|validation|필수|required|스키마|schema|제출|submit|저장|등록/i.test(query)),
    card:
      `- 폼은 \`react-hook-form\`(\`useForm\`) + shadcn \`Form\`(\`@axiom/components/ui\`의 \`Form\`/\`FormField\`/\`FormItem\`/\`FormLabel\`/\`FormControl\`/\`FormMessage\`)으로 구성합니다.\n` +
      `- 검증은 \`zod\` 스키마 + \`zodResolver\`(\`@hookform/resolvers/zod\`): ` +
      `\`const form = useForm<TFormData>({ resolver: zodResolver(schema), defaultValues });\`. 간단하면 \`FormField\`의 \`rules\`도 가능합니다.\n` +
      `- 제출·수정은 \`useApi\`(@axiom/hooks) mutation과 연결: \`form.handleSubmit((d) => mutate(d, { onSuccess, onError }))\`. ⛔ \`useMutation\` 직접 사용 금지.`,
  },
  {
    id: 'button-component',
    // ⚠ 이 카드는 scaffold 오버라이드 규칙이다: scaffold는 raw `<button>` 대신 `<Button>`(@axiom/components/ui)을
    // 표준으로 제공한다($ui.alert가 window.alert를 대체하는 것과 같은 관계). 두 가지 실패를 겨냥한다:
    //  ① 생성: "버튼 넣어줘"에 raw `<button>`을 만드는 것(실측) → `<Button>` 선호로 교정.
    //  ② 교체: "이 버튼을 Button 컴포넌트로 변경"에 import만 추가하고 JSX `<button>`을 안 바꾸는 half-edit
    //     (실측 — date-picker와 동종의 다부품 코디네이트 실패) → import + JSX 태그교체 둘 다 강제.
    // 트리거: 편집 영역에 **소문자** raw `<button`이 있으면(대문자 `<Button`은 이미 정상이라 제외 — 케이스 민감,
    // `i` 플래그 금지), 또는 요청이 버튼 생성/교체/컴포넌트화를 언급하면 발동.
    title: '버튼은 <Button> 컴포넌트 (@axiom/components/ui)',
    applies: ({ region, deps, query }) =>
      /<button[\s/>]/.test(region) ||
      /<button[\s/>]/.test(deps) ||
      (/버튼|\bbutton\b/i.test(query) &&
        /넣|추가|만들|생성|변경|바꾸|바꿔|교체|전환|컴포넌트|component|add|create|switch|change|replace/i.test(query)),
    card:
      `- 버튼은 raw \`<button>\` 대신 scaffold의 \`<Button>\`(@axiom/components/ui)을 사용하세요 — ` +
      `디자인토큰·다크모드·포커스링이 적용된 표준 버튼입니다. import: \`import { Button } from '@axiom/components/ui';\`\n` +
      `  · variant: \`default\`(주요) | \`secondary\` | \`outline\` | \`ghost\` | \`destructive\`(삭제·위험) | \`link\`, ` +
      `size: \`sm\` | \`lg\` | \`icon\`. \`onClick\`·\`type\`·\`disabled\` 등 표준 \`<button>\` 속성을 그대로 받습니다.\n` +
      `- ⛔ 기존 \`<button>\`을 \`<Button>\`으로 **변경**할 때는 반드시 **아래 둘을 함께** 출력하세요 ` +
      `(하나라도 빠지면 화면이 바뀌지 않습니다):\n` +
      `  1) import 추가: \`import { Button } from '@axiom/components/ui';\`\n` +
      `  2) **JSX 태그 자체 교체**: \`<button …>…</button>\` → \`<Button …>…</Button>\` (여는·닫는 태그 모두). ` +
      `기존 \`onClick\`·이벤트·자식(children)은 그대로 유지하고, Tailwind 색/모양 className(\`bg-blue-500 text-white rounded\` 등)은 ` +
      `가능하면 \`variant\`로 대체하세요(대응이 불명확하면 className 유지).\n` +
      `  · ⚠ **import만 추가하고 JSX의 \`<button>\`을 그대로 두지 마세요** — import는 실제로 \`<Button>\`이 쓰일 때만 의미가 있습니다.`,
  },
  {
    id: 'handler-extraction',
    // ⚠ 이 카드는 scaffold 전용이 아니라 **일반 React 컨벤션**(핸들러 구조 보존)이다 — 사용자 요청으로 추가.
    // 규칙은 애매하지 않다: **현재 코드의 연결 구조가 결정**한다. 신규 연결 때만 방식 선택.
    // ⚠ 한계: 명명 핸들러 본문 수정 케이스는 그 함수 선언이 편집 영역(region) 안에 있어야 모델이 고칠 수 있다
    // → locate가 onXxx={식별자} 선언부를 region에 포함/재타겟해야 완전 동작(별도 작업).
    title: '이벤트 핸들러 연결 (기존 구조 보존 — 일반 React)',
    applies: ({ query }) =>
      /클릭\s*(시|하면|할\s*때|되면)|눌렀?을\s*때|누르면|버튼\s*(클릭|누|동작)|이벤트|핸들러|handler|onclick|onchange|onsubmit|on[a-z]+\s*=|함수\s*(로\s*)?(연결|분리|추출|빼)|콜백|callback/i.test(query),
    card:
      `- 이벤트 핸들러(\`onClick\`/\`onChange\`/\`onSubmit\` 등)의 동작을 바꿀 때는 ` +
      `**현재 코드의 연결 구조를 그대로 유지**하고 그 안에서 동작만 수정하세요:\n` +
      `  · 이미 **명명 함수**가 연결돼 있으면(\`onClick={handleXxx}\`) → 그 **함수 본문을 수정**하고 바인딩은 그대로 두세요. ` +
      `⛔ \`onClick={() => …}\` 인라인으로 갈아끼워 기존 함수를 무력화하지 마세요.\n` +
      `  · 이미 **인라인**이면(\`onClick={() => …}\`) → 그 **인라인을 그대로 수정**하세요(불필요하게 함수로 빼지 말 것).\n` +
      `- 핸들러가 **없어서 새로 연결**할 때만 방식을 고르되 **명명 함수 분리를 우선**하세요(\`const handleXxx = () => { … };\` 후 \`onClick={handleXxx}\`). ` +
      `단순 한 줄 동작은 인라인 화살표도 괜찮습니다.`,
  },
];

/** 주어진 컨텍스트에 발동하는 계약 카드들을 레지스트리 순서로 반환. */
export function selectScaffoldContracts(ctx: IContractContext): IScaffoldContract[] {
  return SCAFFOLD_CONTRACTS.filter((c) => {
    try {
      return c.applies(ctx);
    } catch {
      return false;
    }
  });
}

/**
 * 이 컨텍스트에서 발동한 카드 중 **영역 루트를 컴포넌트로 교체**하는 레시피들의 타깃 태그명 목록
 * (예: ['SmartTable']). region 루트태그 게이트의 화이트리스트 + 프롬프트의 교체 허용 지침에 쓴다.
 * 발동 카드가 없거나 교체형이 없으면 빈 배열(종전 동작 — 루트 변경 금지).
 */
export function componentReplacementTargets(ctx: IContractContext): string[] {
  return selectScaffoldContracts(ctx)
    .map((c) => c.replacesRegionRootWith)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/**
 * 발동한 계약 카드를 region 프롬프트에 끼울 마크다운 섹션으로 조립한다.
 * 발동 카드가 없으면 빈 문자열(섹션 자체 미출력).
 */
export function buildContractSection(ctx: IContractContext): string {
  const matched = selectScaffoldContracts(ctx);
  if (matched.length === 0) return '';
  const body = matched.map((c) => `### ${c.title}\n${c.card}`).join('\n');
  return (
    `## react-app-scaffold 계약 (이 편집에 해당 — 반드시 준수)\n` +
    `> 아래는 scaffold 가이드에서 이 파일/요청에 관련된 항목만 자동 추출한 것입니다. 위반 시 적용이 거부될 수 있습니다.\n` +
    `${body}\n\n`
  );
}
