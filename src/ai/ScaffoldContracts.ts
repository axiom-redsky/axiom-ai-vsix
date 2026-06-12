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
}

/** `\bword\b` 매칭(정규식 메타 이스케이프). */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);
}

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
    id: 'list-table-binding',
    title: '목록 테이블에 list API 적용 — 타입+훅+테이블 재작성 (레시피)',
    // "테이블/목록에 …api 적용" 의도이거나, 편집 영역에 테이블 마크업이 있고 요청이 데이터/적용을 언급하면 발동.
    // 약한 모델이 useApi 훅만 선언하고 ① 응답 타입 선언과 ② 테이블 JSX 재작성을 빠뜨려(실측: region 편집
    // 없음 → 미사용 선언 거부 / TXxxResponse 미선언 → 의존성 거부) dead-end 나던 것을, 3부품 골격으로 낮춘다.
    applies: ({ region, query }) =>
      (/(테이블|목록|리스트|그리드|table|list|grid|행\b|로우|rows?)/i.test(query) &&
        /(api|적용|연동|바인딩|불러|가져|조회|채워|매핑|연결|붙여|보여)/i.test(query)) ||
      (/<(table|tbody|thead|Table)\b/i.test(region) && /(api|목록|데이터|적용|불러|조회|연동)/i.test(query)),
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
      `로딩/에러 표시가 필요하면 \`isPending\`·\`error\`를 쓰되, 안 쓸 거면 구조분해에서 빼세요(미사용 선언은 거부됨).`,
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
