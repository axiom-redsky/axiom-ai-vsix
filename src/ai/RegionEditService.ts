/**
 * 영역(하이브리드) 편집 서비스 — 본체 자동판단 경로.
 *
 * "확장이 편집 영역을 결정론적으로 찾아(안전 게이트 통과 시) 그 영역만 모델에 보내 재작성 +
 *  새 훅/import는 structural 삽입"하는 호스트 주도 편집을 수행하고, **최종 전체 파일 텍스트**를
 *  반환한다. 호출부(ChatViewProvider)는 그 텍스트를 기존 full updateFile 적용 경로(컨펌·React
 *  규칙·쓰기)에 그대로 흘려보낸다 — 적용 파이프라인은 손대지 않는다.
 *
 * 안전 계약(견고성 매핑 + 라이브 검증):
 *  - 안전 게이트 미통과 → status='fallback' (호출부가 기존 full 입력 경로로).
 *  - 모델이 편집 영역 밖을 재작성(root-tag 불일치) → fallback.
 *  - 삽입 조각의 타입/훅이 최종 파일에서 해소 안 됨(의존성 폐쇄 실패) → fallback.
 *  즉 "조금이라도 의심스러우면 full" — 조용한 파일 파손을 만들지 않는다.
 */
import { locateEditRegion, checkRegionRootTag } from './RegionEdit';
import { impliedControlTags, countTag } from './RegionIntent';
import { buildContractSection } from './ScaffoldContracts';
import {
  applyStructuralEdit,
  applyReplaceBlocks,
  findUnresolvedReferences,
  findUnresolvedJsxComponents,
  findUnusedInsertedBindings,
  findDuplicateDeclarations,
  resolveKnownImports,
  type StructuralEdit,
  type ImportRequest,
  type ReplaceBlock,
} from './StructuralAnchor';

export interface RegionEditOutcome {
  /** 'applied': finalText 사용 / 'fallback': 기존 full 경로로 / 'error': 모델 호출 실패 */
  status: 'applied' | 'fallback' | 'error';
  /** status==='applied' 일 때 디스크에 쓸 최종 전체 파일 텍스트 */
  finalText?: string;
  /** 진단 로그(출력 채널용) */
  diagnostics: string;
  /** fallback/error 사유(게이트명 등) */
  reason?: string;
  /** reason==='ambiguous' 일 때 호출부가 "어느 구역?" 되물을 후보 섹션 라벨들. */
  ambiguousCandidates?: string[];
}

/**
 * region 이 사퇴(fallback)했을 때 호스트가 취할 UX를 결정하는 **단일 정책**.
 *
 * ChatViewProvider(런타임)와 full 사유 계기판(eval:bigfile)이 이 함수를 공유해 분류가 갈라지지 않게 한다
 * (분류 드리프트 = 계기판이 거짓이 됨). 반환:
 *  - 'reask-ambiguous' : 어느 구역인지 모호 → "어느 구역?" 되물음.
 *  - 'inform-absent'   : 지목한 컨트롤이 파일에 0개(수정 의도) → "대상 없음, 다른 파일?" 안내.
 *  - 'full'            : 그 외 → 기존 full 입력 경로(정당 또는 미커버 — 계기판으로 추가 판단).
 *
 * @param gate locateEditRegion 의 safety.gate (= RegionEditOutcome.reason)
 */
export type RegionDeclineUx = 'reask-ambiguous' | 'inform-absent' | 'full';
const ADD_INTENT_RE = /추가|만들|생성|넣어|새로|add|create/i;
export function classifyRegionDecline(query: string, source: string, gate: string): RegionDeclineUx {
  if (gate === 'ambiguous') return 'reask-ambiguous';
  const tags = impliedControlTags(query);
  const namedButAbsent = tags.length > 0 && tags.every((t) => countTag(source, t) === 0);
  if (namedButAbsent && !ADD_INTENT_RE.test(query)) return 'inform-absent';
  return 'full';
}

/** ```lang … ``` 코드펜스를 벗겨 순수 코드만 남긴다. */
function stripFences(s: string): string {
  const m = s.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  return (m ? m[1] : s).replace(/\s+$/, '');
}

/**
 * 하이브리드 프롬프트 — JSX는 <region>, 새 훅/타입은 <hook>, import는 <import …/>.
 *
 * 입출력 점검 패널(RegionIoProbeProvider)이 "실제 운영 경로가 모델에 보내는 분리 입력"을
 * 그대로 보여줄 수 있도록 export 한다. 패널이 프롬프트를 재구현하면 본체와 갈라져(실측됨:
 * 슬라이스 패널의 hybrid 미러가 filterSection·backingSection을 누락) 점검 결과가 거짓이 된다.
 */
export function buildHybridPrompt(
  depsHeader: string,
  region: string,
  startLine: number,
  endLine: number,
  referencedSpec?: string,
  backingDecls?: string,
  query = '',
  controlInventory = '',
): string {
  // 필터·검색 요청 + 의존성 헤더가 이미 useApi(params)로 서버 조회 중일 때만 노출하는 타깃 지침.
  // 약한 모델이 서버 params 대신 클라이언트 파괴적 필터(가져온 목록 state를 filter 결과로 덮어쓰기)나
  // 테이블 행별 Select를 창작해 의미가 깨지는 실패(실측)를 막는다. (params 없으면 클라 필터가 정당해 미노출.)
  // 트리거: 필터·검색·정렬뿐 아니라 **refetch·파라미터 추가** 요청도 같은 "서버 params 우선" 규칙 대상이다.
  // (실측: "select 변경 시 refetch에 부서 파라미터가 빠졌다" 요청은 필터 키워드가 없어 이 지침이 안 떠,
  //  모델이 refetch(params)라는 잘못된 API 사용을 창작했다 — refetch는 인자로 params를 받지 않는다.)
  // scaffold 계약 자동 주입(트리거 기반) — deps/region/query에 관련된 가이드 카드만 끼운다.
  // region 경로는 RAG/coreRules를 안 보내므로(토큰 절약), 이 압축 카드가 useApi·라우터·타입 계약을 가르친다.
  const contractSection = buildContractSection({ deps: depsHeader, region, query });
  const wantsFilter = /필터|filter|검색|search|정렬|sort|refetch|파라미터|파라메터|parameter|매개변수/i.test(query);
  const hasServerParams = /useApi/.test(depsHeader) && /\bparams\s*:/.test(depsHeader);
  const filterSection =
    wantsFilter && hasServerParams
      ? `\n**필터·검색·파라미터 구현 규칙(서버 params 우선 — 위반 시 버그):**\n` +
        `- ✅ 의존성 헤더의 \`useApi(endpoint, { params: { … } })\` 가 서버 조회입니다. 필터·검색·추가 파라미터는 그 ` +
        `**params에 조건을 추가**해 처리하세요 — 선택 state를 params에 넣으면 됩니다(useApi는 params 변경 시 자동 재조회).\n` +
        `- ✅ **기존 useApi 호출문을 통째로 수정**할 때는 \`<replace anchor="문장 안의 식별 문자열">…새 문장 전체…</replace>\` 로 출력하세요. ` +
        `확장이 그 문장을 찾아 결정론적으로 교체합니다. 예: \`<replace anchor="useApi<T>(EMPLOYEES_ENDPOINT">const { data } = useApi<T>(EMPLOYEES_ENDPOINT, { params: { …기존…, status: selectedStatus === 'all' ? undefined : selectedStatus } });</replace>\` ` +
        `(기존 params를 **하나도 빠뜨리지 말고** 전부 포함한 채 조건만 덧붙이세요. ` +
        `refetch에 인자를 넘기지 말고 — useApi의 \`params\`만 바꾸면 자동 재조회됩니다. 위 'useApi 데이터 훅' 계약 참고.)\n` +
        `- ⛔ **클라이언트 필터 금지**: \`list.filter(...)\` 결과를 가져온 목록 state에 \`setState\`로 덮어쓰지 마세요 ` +
        `(원본이 사라져 복구 불가 — 파괴적).\n` +
        `- ⛔ 테이블 **행(row)마다 새 입력 컴포넌트(<Select> 등)를 만들지 마세요**. 요청이 '필터'면 상단 필터 컨트롤만 다룹니다.\n`
      : '';
  // 컨트롤 인벤토리(B) — region 밖에 이미 있는 select/input. 모델이 "없는 줄 알고" 재생성(중복)하지 않게.
  const inventorySection = controlInventory?.trim()
    ? `## 이미 존재하는 입력 컨트롤 (재생성 금지 — 아래는 이미 파일에 있음)\n\`\`\`tsx\n${controlInventory.trim()}\n\`\`\`\n` +
      `> ❗ 위 컨트롤과 그 선택 state(예: \`selectedStatus\`)는 **이미 존재**합니다. <region>이나 <hook>에 ` +
      `다시 만들지 마세요(중복 = 적용 거부). 필터는 그 **기존 state를 useApi params에 넣어** 처리하세요(위 <replace>).\n\n`
    : '';
  // 편집 영역이 참조하는 모듈 스코프 const(예: const grades=[...]) — 항목 추가/수정 grounding.
  // depsHeader엔 top-level const가 없어 모델이 기억으로 배열을 재구성하다 기존 항목을 흘린다.
  // 실제 선언을 주입하고 "전부 보존해 재선언" 규칙을 줘, 확장의 무손실 교체가 적용되게 한다.
  const backingSection = backingDecls?.trim()
    ? `## 편집 영역이 참조하는 기존 선언 (수정 가능)\n\`\`\`tsx\n${backingDecls.trim()}\n\`\`\`\n` +
      `> ❗ 위 선언(옵션 배열 등)에 항목을 **추가·변경**해야 하면, 그 선언을 <hook>에 **기존 항목을 하나도 ` +
      `빠뜨리지 말고 전부 포함한 채** 다시 선언하세요(요청한 추가분만 덧붙임). 확장이 기존 위치에 교체 적용합니다. ` +
      `기존 항목을 지어내거나 누락하면 적용이 거부됩니다.\n\n`
    : '';
  // 참조 스펙(예: /plan/api-spec.md)이 있으면 의존성 헤더 위에 주입한다. 안 그러면 모델이
  // 응답 타입·쿼리 파라미터를 추측해(code_type·category 등) 의존성 게이트에서 full 폴백된다.
  // refResult.block 자체에 이미 "추측 금지" 경고가 들어 있고, 여기서 쿼리 파라미터 경고만 보강한다.
  const specSection = referencedSpec?.trim()
    ? `${referencedSpec.trim()}\n\n` +
      `> ❗ 위 참조 스펙이 있으면 **API 응답 타입(필드명)과 쿼리 파라미터 이름은 반드시 이 스펙에서만** 가져오세요. ` +
      `스펙에 없는 필드·파라미터(예: code_type, category 등)를 추측해 쓰지 마세요. ` +
      `useApi의 타입 인자로 쓸 \`type\`은 <hook> 안에 스펙 기준으로 함께 선언하세요(미선언 시 적용이 거부됩니다).\n\n`
    : '';
  return (
    `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.\n` +
    `아래 "의존성 헤더"는 같은 파일의 다른 부분(읽기 전용 참고)입니다. 기존 훅/state/타입/import와 충돌·중복 금지.\n\n` +
    `요청을 두 종류 출력으로 나누어 답하세요(둘 다 필요하면 둘 다 출력):\n` +
    `1) "편집 영역"의 JSX 수정 → <region>…</region> 안에 편집 영역 **전체를 다시** 쓰기. ` +
    `영역의 최상위 태그는 바꾸지 마세요(예: <Select>로 시작하면 <Select>로 끝나야 함).\n` +
    `2) 새로 필요한 훅/state/타입 → <hook>…</hook> 안에 줄 단위로(들여쓰기 없이). import → <import module="모듈" named="A, B" /> 로. ` +
    `이것들의 위치는 신경 쓰지 마세요 — 확장이 올바른 위치에 자동 삽입합니다.\n` +
    // ⚠ 예시는 의도적으로 **중립 도메인(카테고리)** 을 쓴다 — 약한 모델이 예시를 그대로 베끼는(parroting)
    //   경향이 있어, 실제 요청과 같은 도메인(부서·직원 등)으로 예시를 들면 그걸 정답으로 착각해 echo 한다
    //   (실측: 부서 필터 요청에 예시의 deptResponse/departments/'/api/departments' 가 글자그대로 출력됨).
    //   엔드포인트도 raw 문자열이 아니라 **상수**로 보여 scaffold 컨벤션을 함께 가르친다.
    `예: <hook>type TCategoryListResponse = { success: boolean; data: TCategory[] };\n` +
    `const { data: categoryResponse } = useApi<TCategoryListResponse>(CATEGORIES_ENDPOINT);\n` +
    `const categories = categoryResponse?.data ?? [];</hook>\n` +
    `\n**훅 작성 규칙(위반 시 적용 거부됨):**\n` +
    `- ⛔ useApi·useState·useEffect 등 모든 훅은 **컴포넌트 최상위에서만** 호출. \`useEffect(()=>{ useApi(...) })\`처럼 ` +
    `effect/콜백/조건문 안에서 훅을 호출하지 마세요(React Rules of Hooks 위반).\n` +
    `- ⛔ 서버 데이터를 \`useState\`+\`useEffect\`로 **복사(미러링)하지 마세요**. \`useApi\` 결과를 **파생 const**로 바로 쓰세요 ` +
    `(예: \`const items = resp?.data?.GROUP ?? [];\`). 서버 응답 목록용 새 useState/useEffect 추가 금지.\n` +
    `- ⛔ **편집하는 컨트롤의 선택값 state는 새 이름으로 — 기존 state 재사용 금지.** \`defaultValue\`로 제어 안 되던 ` +
    `select를 API화하면 그 컨트롤만의 **새 선택 state**가 필요합니다. 의존성 헤더에 이미 있는 다른 컨트롤의 state ` +
    `(예: 재직상태의 \`selectedStatus\`)를 재사용하면 두 컨트롤이 한 state를 공유해 버그가 납니다. 한글 라벨이 ` +
    `비슷해도(…상태) 합치지 말고, **새롭고 구별되는 이름**(예: 투입상태 → \`selectedDeployment\`)으로 \`useState\`를 ` +
    `<hook>에 선언하고 <region>의 value/onValueChange를 그 새 state에 묶으세요. ` +
    `(이 선택값은 UI 상태라 useState가 맞습니다 — 위 '서버 데이터 미러링 금지'는 API 응답 목록에만 해당.)\n` +
    `- ⛔ **요청한 컨트롤에 필요한 것만** 출력하세요. 의존성 헤더에 이미 있는 검색/페이지네이션/다른 select 등 ` +
    `무관한 훅·핸들러·상수(handleSearch, PAGE_LIMIT 등)를 새로 만들거나 옮기지 마세요.\n` +
    `규칙: useApi는 @axiom/hooks, UI는 @axiom/components/ui, 화면이동은 $router, 주석은 한국어.\n\n` +
    contractSection +
    filterSection +
    `\n` +
    specSection +
    `## 의존성 헤더 (읽기 전용)\n\`\`\`tsx\n${depsHeader}\n\`\`\`\n\n` +
    inventorySection +
    backingSection +
    `## 편집 영역 (원본 ${startLine}~${endLine}줄)\n\`\`\`tsx\n${region}\n\`\`\``
  );
}

/**
 * 호스트 주도 하이브리드 편집을 수행한다.
 * @param source  원본 전체 파일 텍스트(디스크 ground truth)
 * @param query   사용자 요청
 * @param callModel  (system, user) → 모델 원시 출력
 * @param referencedSpec  사용자가 메시지에 명시한 참조 파일 블록(예: /plan/api-spec.md). 응답 타입·
 *                        쿼리 파라미터를 스펙 기준으로 확정하게 해 환각·의존성 폴백을 줄인다.
 */
export async function runHybridRegionEdit(
  source: string,
  query: string,
  callModel: (system: string, user: string) => Promise<string>,
  referencedSpec?: string,
): Promise<RegionEditOutcome> {
  const loc = locateEditRegion(source, query);

  // 1) 전제조건 안전 게이트
  if (!loc.safety.ok) {
    return {
      status: 'fallback',
      reason: loc.safety.gate,
      diagnostics: `[regionEdit] 게이트 차단(${loc.safety.gate}) → full 폴백: ${loc.safety.reason}`,
      ambiguousCandidates: loc.ambiguousCandidates,
    };
  }

  // 2) 모델 호출 (영역 + 의존성 헤더만)
  const system = buildHybridPrompt(loc.depsHeader, loc.region, loc.startLine, loc.endLine, referencedSpec, loc.backingDecls, query, loc.controlInventory);
  let modelOut: string;
  try {
    modelOut = await callModel(system, query);
  } catch (e) {
    return { status: 'error', reason: 'model-call', diagnostics: `[regionEdit] 모델 호출 실패: ${(e as Error).message}` };
  }

  // 3) 파싱: <region> + <hook>(N개) + <import …/> + <replace anchor=…>(N개)
  const regionMatch = modelOut.match(/<region>([\s\S]*?)<\/region>/);
  const hookMatches = [...modelOut.matchAll(/<hook>([\s\S]*?)<\/hook>/g)].map((m) => m[1].trim());
  const importMatches = [...modelOut.matchAll(/<import\s+([^>]*?)\/?>/g)].map((m) => m[1]);
  const replaceBlocks: ReplaceBlock[] = [...modelOut.matchAll(/<replace\s+anchor\s*=\s*"([^"]*)"\s*>([\s\S]*?)<\/replace>/g)]
    .map((m) => ({ anchor: m[1].trim(), replacement: stripFences(m[2]).replace(/^\n+/, '').replace(/\s+$/, '') }))
    .filter((b) => b.anchor && b.replacement.trim());

  // 앞 빈 줄만 제거, 첫 줄 들여쓰기는 보존(.trim()은 splice를 flush-left로 만든다).
  const newRegion = regionMatch ? stripFences(regionMatch[1]).replace(/^\n+/, '').replace(/\s+$/, '') : '';
  const hookCode = hookMatches.join('\n');
  const imports: ImportRequest[] = importMatches
    .map((attrs) => {
      const mod = attrs.match(/module\s*=\s*"([^"]*)"/)?.[1] ?? '';
      const named = attrs.match(/named\s*=\s*"([^"]*)"/)?.[1];
      const def = attrs.match(/def\s*=\s*"([^"]*)"/)?.[1];
      const req: ImportRequest = { module: mod };
      if (named) req.named = named.split(',').map((s) => s.trim()).filter(Boolean);
      if (def) req.def = def;
      return req;
    })
    .filter((r) => r.module);

  // 아무 산출물도 없으면(빈 응답) full로 넘긴다 — region이 줄 수 있는 게 없음.
  if (!newRegion.trim() && !hookCode.trim() && imports.length === 0 && replaceBlocks.length === 0) {
    return { status: 'fallback', reason: 'empty-output', diagnostics: '[regionEdit] 모델 산출물 없음 → full 폴백' };
  }

  // 4) 후처리 root-tag 게이트 — 모델이 영역 밖을 재작성했으면 거부
  if (newRegion.trim()) {
    const rt = checkRegionRootTag(loc.region, newRegion);
    if (!rt.ok) {
      return {
        status: 'fallback',
        reason: 'root-tag-mismatch',
        diagnostics: `[regionEdit] 영역-밖 재작성(원본 루트 <${rt.origTag}> ≠ 출력 <${rt.outTag}>) → full 폴백`,
      };
    }
  }

  // 4.5) refetch 인자 게이트 — refetch는 TanStack Query 재조회 함수로 **params를 인자로 받지 않는다**.
  //      약한 모델이 "파라미터 추가"를 `refetch({ params: { … } })`로 잘못 구현하면(실측) 적용 시 조용히
  //      무시되는 죽은 코드가 된다 — 올바른 수정은 useApi의 params(<replace>). 원본엔 없던 refetch params가
  //      출력에 새로 생겼으면 적용하지 말고 full 폴백. (refetch({ throwOnError } 등 정당한 옵션은 params 키가
  //      없어 비대상.)
  const refetchParamsRe = /\brefetch\s*\(\s*\{[\s\S]*?\bparams\s*:/;
  if (newRegion.trim() && refetchParamsRe.test(newRegion) && !refetchParamsRe.test(loc.region)) {
    return {
      status: 'fallback',
      reason: 'refetch-params',
      diagnostics:
        `[regionEdit] refetch에 params 인자 전달(잘못된 API 사용 — refetch는 params를 받지 않음) → full 폴백. ` +
        `파라미터 변경은 useApi의 params 수정으로 해야 함.`,
    };
  }

  // region이 의미있게 바뀌었는가 — 죽은 곁다리 strip(6.8) / dead-binding 게이트(6.7) 분기에 쓴다.
  const ws = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const regionChanged = newRegion.trim() !== '' && ws(newRegion) !== ws(loc.region);
  // 삭제 의도 — 옵션 배열 등에서 항목을 빼는 요청. 이때만 const 교체 가드를 완화(새 ⊆ 기존, 환각 차단)해
  // "항목 제거" 재선언을 적용한다. 비-삭제는 무손실(superset) 유지. (실측: '이사 항목 빼줘' → grades subset 교체.)
  const removalIntent = /빼|제거|삭제|없애|지워|remove|delete/i.test(query);

  // 5) 합성: JSX 영역 splice → structural(훅/타입/import) 결정론 삽입
  const changes: string[] = [];
  let composed = source;
  if (newRegion.trim()) {
    composed = [...loc.lines.slice(0, loc.startLine - 1), newRegion, ...loc.lines.slice(loc.endLine)].join('\n');
    changes.push(`JSX 영역 splice ${loc.startLine}~${loc.endLine}줄`);
  }
  const edit: StructuralEdit = {};
  if (hookCode.trim()) edit.hookCode = hookCode;
  if (imports.length) edit.imports = imports;
  if (edit.hookCode || edit.imports) {
    // region이 실제 편집된 경우에만 죽은 곁다리 선언을 strip한다(깨끗한 출력). region 미변경 케이스는
    // strip하면 no-op로 묻혀 진단이 흐려지므로, 6.7 dead-binding 게이트가 fallback으로 처리하게 둔다.
    const applied = applyStructuralEdit(composed, edit, { stripDeadInserts: regionChanged, removalIntent });
    composed = applied.text;
    changes.push(...applied.changes);
  }

  // 5.5) <replace> — 영역 밖 기존 문장(useApi params 등) 결정론 교체(C). 앵커 미해소면 full 폴백
  //      (모델이 존재하지 않는 문장을 가리킨 것 → 적용하면 의도 누락).
  if (replaceBlocks.length > 0) {
    const rep = applyReplaceBlocks(composed, replaceBlocks);
    if (rep.unresolved.length > 0) {
      return {
        status: 'fallback',
        reason: 'replace-anchor-missing',
        diagnostics: `[regionEdit] <replace> 앵커 미해소(${rep.unresolved.join(' / ')}) → full 폴백`,
      };
    }
    composed = rep.text;
    changes.push(...rep.changes);
  }

  // 6) 의존성 폐쇄 게이트 — 삽입 훅이 참조하는 타입/훅이 최종 파일에서 해소되는지.
  //    표준 훅(useApi 등)은 import 자동 보강 후 재검사. 그래도 미해소면 full 폴백.
  if (hookCode.trim()) {
    let dep = findUnresolvedReferences(hookCode, composed);
    if (!dep.ok) {
      const autoImports = resolveKnownImports(dep.unresolved);
      if (autoImports.length > 0) {
        const patched = applyStructuralEdit(composed, { imports: autoImports });
        composed = patched.text;
        changes.push(...patched.changes);
        dep = findUnresolvedReferences(hookCode, composed);
      }
    }
    if (!dep.ok) {
      return {
        status: 'fallback',
        reason: 'unresolved-deps',
        diagnostics: `[regionEdit] 의존성 미해소(${dep.unresolved.join(', ')}) → full 폴백 / 훅조각: ${JSON.stringify(hookCode.slice(0, 200))}`,
      };
    }
  }

  // 6.5) region JSX 컴포넌트 폐쇄 게이트 — 모델이 <region>에 새 컴포넌트(<Card> 등)를 쓰고 <import>를
  //      빠뜨리면 위 hookCode 게이트가 못 잡는다(JSX는 검사 대상 아님 → 컴파일 깨짐, 실측: Card 누락).
  //      region의 PascalCase 태그를 검사해 @axiom/components/ui 카탈로그면 import 자동 보강, 그래도
  //      미해소(커스텀 컴포넌트 등)면 full 폴백.
  if (newRegion.trim()) {
    let comp = findUnresolvedJsxComponents(newRegion, composed);
    if (!comp.ok) {
      const autoImports = resolveKnownImports(comp.unresolved);
      if (autoImports.length > 0) {
        const patched = applyStructuralEdit(composed, { imports: autoImports });
        composed = patched.text;
        changes.push(...patched.changes);
        comp = findUnresolvedJsxComponents(newRegion, composed);
      }
    }
    if (!comp.ok) {
      return {
        status: 'fallback',
        reason: 'unresolved-components',
        diagnostics: `[regionEdit] region 컴포넌트 미해소(${comp.unresolved.join(', ')}) — import 불명 → full 폴백`,
      };
    }
  }

  // 6.7) 죽은 삽입 바인딩 게이트 — 모델이 안 쓰는 새 state/const를 삽입했고 **region 편집은 사실상 없을 때**만
  //      full 폴백. region/하이브리드가 표현 못 하는 편집(rename·조회용 미사용 state)에서 모델이 원본 영역은
  //      그대로 둔 채 죽은 코드만 얹어 applied로 위장하는 silent 오편집을 차단한다.
  //      ⚠ region이 실제로 바뀌었으면 죽은 hook은 곁다리 노이즈일 뿐 — 위 6.8(strip)이 이미 걷어냈으므로
  //         여기선 region 미변경 케이스만 본다(실측: '대기 옵션 추가'는 region 편집 성공, 미사용 state는 strip됨).
  if (hookCode.trim() && !regionChanged) {
    const dead = findUnusedInsertedBindings(hookCode, composed);
    if (dead.length > 0) {
      return {
        status: 'fallback',
        reason: 'dead-binding',
        diagnostics: `[regionEdit] 미사용 삽입 선언(${dead.join(' / ')}) + region 편집 없음 — region이 표현 못 하는 편집(rename 등) 의심 → full 폴백`,
      };
    }
  }

  // 6.9) 중복 선언 게이트 — 삽입 훅이 기존 식별자를 **재선언**하면(예: 정적 options 배열을 API로 바꾸며
  //      같은 이름 const 를 또 선언) 같은 스코프 중복 → TS 컴파일 에러. 모델이 "교체" 대신 "추가"한 경우다.
  //      원본엔 없던 중복이 합성 결과에 새로 생겼으면 적용하지 말고 full 폴백(조용한 파손 방지).
  if (hookCode.trim()) {
    const origDupes = new Set(findDuplicateDeclarations(source));
    const newDupes = findDuplicateDeclarations(composed).filter((d) => !origDupes.has(d));
    if (newDupes.length > 0) {
      return {
        status: 'fallback',
        reason: 'duplicate-decl',
        diagnostics: `[regionEdit] 중복 선언 발생(${newDupes.join(', ')}) — 삽입 훅이 기존 식별자를 재선언(교체 아님) → full 폴백`,
      };
    }
  }

  // 변경이 전혀 없으면(splice가 동일·structural no-op) full로 넘긴다.
  if (composed === source) {
    return { status: 'fallback', reason: 'no-op', diagnostics: '[regionEdit] 합성 결과가 원본과 동일(no-op) → full 폴백' };
  }

  return {
    status: 'applied',
    finalText: composed,
    diagnostics: `[regionEdit] 적용: ${changes.join(' / ')}`,
  };
}
