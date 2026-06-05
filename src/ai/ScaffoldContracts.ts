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
