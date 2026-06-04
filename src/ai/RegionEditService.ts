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
import {
  applyStructuralEdit,
  findUnresolvedReferences,
  findUnresolvedJsxComponents,
  resolveKnownImports,
  type StructuralEdit,
  type ImportRequest,
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
}

/** ```lang … ``` 코드펜스를 벗겨 순수 코드만 남긴다. */
function stripFences(s: string): string {
  const m = s.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  return (m ? m[1] : s).replace(/\s+$/, '');
}

/** 하이브리드 프롬프트 — JSX는 <region>, 새 훅/타입은 <hook>, import는 <import …/>. */
function buildHybridPrompt(
  depsHeader: string,
  region: string,
  startLine: number,
  endLine: number,
  referencedSpec?: string,
): string {
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
    `예: <hook>type TDepartmentListResponse = { success: boolean; data: TDepartment[] };\n` +
    `const { data: deptResponse } = useApi<TDepartmentListResponse>('/api/departments');\n` +
    `const departments = deptResponse?.data ?? [];</hook>\n` +
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
    specSection +
    `## 의존성 헤더 (읽기 전용)\n\`\`\`tsx\n${depsHeader}\n\`\`\`\n\n` +
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
    };
  }

  // 2) 모델 호출 (영역 + 의존성 헤더만)
  const system = buildHybridPrompt(loc.depsHeader, loc.region, loc.startLine, loc.endLine, referencedSpec);
  let modelOut: string;
  try {
    modelOut = await callModel(system, query);
  } catch (e) {
    return { status: 'error', reason: 'model-call', diagnostics: `[regionEdit] 모델 호출 실패: ${(e as Error).message}` };
  }

  // 3) 파싱: <region> + <hook>(N개) + <import …/>
  const regionMatch = modelOut.match(/<region>([\s\S]*?)<\/region>/);
  const hookMatches = [...modelOut.matchAll(/<hook>([\s\S]*?)<\/hook>/g)].map((m) => m[1].trim());
  const importMatches = [...modelOut.matchAll(/<import\s+([^>]*?)\/?>/g)].map((m) => m[1]);

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
  if (!newRegion.trim() && !hookCode.trim() && imports.length === 0) {
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
    const applied = applyStructuralEdit(composed, edit);
    composed = applied.text;
    changes.push(...applied.changes);
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
