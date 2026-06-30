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
import { locateEditRegion, checkRegionRootTag, type RegionCandidate } from './RegionEdit';
import { impliedControlTags, countTag } from './RegionIntent';
import { buildContractSection, componentReplacementTargets } from './ScaffoldContracts';
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

/**
 * 호출부가 주입하는 "영역 객관식 disambiguation" 콜백. 결정론 locate가 추린 후보를 받아
 * 모델에게 의미적으로 고르게 하고, 고른 영역의 라인범위를 돌려준다(불확실/실패 시 null).
 */
export type RegionDisambiguator = (
  query: string,
  candidates: RegionCandidate[],
) => Promise<{ startLine: number; endLine: number } | null>;

/**
 * 호출부가 주입하는 "편집 결과 검증" 콜백(Stage 0 검증 루프의 눈). 합성된 전체 파일 텍스트를 받아
 * 타입체크하고 **새 에러 목록**을 돌려준다(각 항목 `"L:C 메시지"`). ChatViewProvider가 VSCode TS
 * 언어서버 진단으로 구현한다. 검증 불가/서버 부재 시 `ok:true`(fail-open)로 절대 편집을 막지 않는다.
 * eval/슬라이스 하니스는 미주입이라 검증 루프 자체가 작동하지 않아 종전과 바이트 동일하다.
 */
export type EditVerifier = (candidateText: string) => Promise<{ ok: boolean; errors: string[] }>;

/** <replace anchor="…">…</replace> 블록을 파싱한다(메인 파싱·검증 교정 라운드 공용). */
function parseReplaceBlocks(modelOut: string): ReplaceBlock[] {
  return [...modelOut.matchAll(/<replace\s+anchor\s*=\s*"([^"]*)"\s*>([\s\S]*?)<\/replace>/g)]
    .map((m) => ({ anchor: m[1].trim(), replacement: stripFences(m[2]).replace(/^\n+/, '').replace(/\s+$/, '') }))
    .filter((b) => b.anchor && b.replacement.trim());
}

/** 검증-교정 라운드 시스템 프롬프트 — <replace> 앵커 블록만 출력하게 강제(앵커 계약). */
export function buildVerifyCorrectionSystem(): string {
  return (
    `당신은 react-app-scaffold 전용 코딩 어시스턴트입니다. 아래 코드에 TypeScript 타입 에러가 있습니다.\n` +
    `에러를 고치기 위해 **수정할 기존 코드 조각을 그대로 인용**해 교체하세요. 출력은 오직 다음 형식만:\n` +
    `<replace anchor="파일에 실제로 있는 짧고 고유한 문자열">교체할 새 코드 전체</replace>\n` +
    `규칙:\n` +
    `- anchor는 파일에 **실제로 존재하는 문자열**이어야 합니다(없으면 적용 거부). 한 문장을 식별할 짧고 고유한 부분을 쓰세요.\n` +
    `- 에러와 무관한 코드는 건드리지 마세요. 필요한 최소 교체만 하세요.\n` +
    `- 설명·코드펜스 없이 <replace> 블록만 출력하세요. 고칠 수 없으면 아무것도 출력하지 마세요.`
  );
}

/**
 * 검증-교정 프롬프트 — 깨진 합성 결과에서 **에러 줄 주변 창만** 추려 보낸다(전체 파일 미전송 = 델타).
 * 에러 항목은 `"L:C 메시지"` 형식(verify 콜백 계약)이라 앞의 L을 파싱해 그 줄 ±3 창을 모은다.
 */
export function buildVerifyCorrectionPrompt(composed: string, errors: string[]): string {
  const lines = composed.split('\n');
  const windows: string[] = [];
  const seen = new Set<string>();
  for (const e of errors.slice(0, 8)) {
    const m = e.match(/^(\d+):\d+\s/);
    const ln = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isFinite(ln)) continue;
    const lo = Math.max(1, ln - 3);
    const hi = Math.min(lines.length, ln + 3);
    const key = `${lo}-${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = lines.slice(lo - 1, hi).map((l, i) => `${lo + i}: ${l}`).join('\n');
    windows.push(`— ${ln}번째 줄 부근:\n${snippet}`);
  }
  return (
    `## 타입 에러\n${errors.slice(0, 8).map((e) => `- ${e}`).join('\n')}\n\n` +
    `## 해당 코드(줄번호 포함, 읽기 전용 참고)\n${windows.join('\n\n')}\n\n` +
    `위 에러를 고치는 <replace> 블록만 출력하세요.`
  );
}

/**
 * 객관식 disambiguation 프롬프트 — 후보를 번호 목록으로 제시하고 번호만 받게 한다(약한 모델 친화).
 * 결정론 locate가 못 정하는 우선순위(예: '입사일' vs 흔한 'input')를 모델의 언어 이해로 메운다.
 */
export function buildDisambiguationPrompt(query: string, candidates: RegionCandidate[]): string {
  const list = candidates.map((c, i) => `${i + 1}) ${c.label} (${c.startLine}줄)`).join('\n');
  return (
    `사용자 코드 편집 요청: "${query}"\n\n` +
    `아래는 그 요청이 가리킬 수 있는 편집 영역 후보입니다. **사용자가 의도한 영역의 번호 하나만** 답하세요.\n` +
    `어느 것인지 애매하거나 후보에 없으면 0을 답하세요. 설명 없이 숫자만.\n\n` +
    `${list}\n\n답(번호만):`
  );
}

/**
 * disambiguation 모델 출력에서 고른 후보를 파싱한다. 첫 정수만 본다.
 * 1..N 범위면 해당 후보, 0/범위밖/없음이면 null(=불확실 → 호출부가 휴리스틱 유지 또는 사용자 되묻기).
 */
export function parseDisambiguationPick(output: string, candidates: RegionCandidate[]): RegionCandidate | null {
  const m = output.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (n < 1 || n > candidates.length) return null;
  return candidates[n - 1];
}

/**
 * 참조 파일이 어떤 심볼을 **어느 모듈에서, 어떤 바인딩 형태로** 가져오는지의 ground truth.
 * `kind`: 'named'=`{ X }`, 'def'=`X`(default). 모델이 default↔named를 뒤집어 환각하는 것을 교정하는 데 쓴다.
 */
export interface ImportOrigin {
  module: string;
  kind: 'named' | 'def';
}

/**
 * 참조(내용 출처) 파일들의 import 문에서 **심볼 → {모듈 경로, 바인딩 형태}** 맵을 만든다.
 *
 * region 편집이 참조 파일의 JSX를 가져올 때, 그 JSX가 쓰는 컴포넌트(PageHeader·StatusBadge 등)의
 * **정답 import는 참조 파일 맨 위에 이미 적혀 있다**(경로뿐 아니라 default/named 여부까지). 약한 모델은
 * 이를 베끼지 않고 프롬프트 예시 모듈(@axiom/components/ui)로 경로를 뭉뚱그리거나, default를 `{ }`로
 * 감싸 named로 환각한다. 이 맵을 ground truth로 써서 모델이 추측한 경로·형태를 결정론적으로 교정한다
 * (reconcileImportsWithReference).
 *
 * 별칭(`X as Y`)은 JSX에서 실제로 쓰는 **로컬명(Y)** 을 키로 둔다. type-only import는 건너뛴다.
 */
export function buildImportProvenance(refContents: string[]): Map<string, ImportOrigin> {
  const map = new Map<string, ImportOrigin>();
  const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const content of refContents) {
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      if (m[1]) continue; // `import type …` 전체는 값 심볼이 아니므로 제외
      const clause = m[2].trim();
      const mod = m[3];

      // named: { A, B as C, type D }
      const namedBlock = clause.match(/\{([\s\S]*?)\}/);
      if (namedBlock) {
        for (const part of namedBlock[1].split(',')) {
          const t = part.trim();
          if (!t || /^type\s/.test(t)) continue; // 개별 type 항목 제외
          const local = t.split(/\s+as\s+/i).pop()!.trim();
          if (/^[A-Za-z_$][\w$]*$/.test(local)) map.set(local, { module: mod, kind: 'named' });
        }
      }

      // namespace: * as NS — ImportRequest로 재현 불가하므로 형태는 def로 근사(경로 교정만 의미 있음)
      const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (ns) map.set(ns[1], { module: mod, kind: 'def' });

      // default: 이름블록·네임스페이스를 떼고 남은 선두 식별자
      const rest = clause.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '');
      const def = rest.split(',')[0]?.trim();
      if (def && /^[A-Za-z_$][\w$]*$/.test(def)) map.set(def, { module: mod, kind: 'def' });
    }
  }
  return map;
}

/**
 * 모델이 낸 import 목록을, 참조 파일에서 추출한 provenance(심볼→정답 모듈)로 교정한다.
 * 참조가 심볼을 다른 모듈로 선언했으면 그 모듈로 옮기고, 모듈별로 다시 묶는다.
 * provenance에 없는 심볼(참조가 안 가진 것)은 모델 경로를 그대로 둔다.
 *
 * @returns 교정된 imports + 사람이 읽는 교정 내역(진단 로그용).
 */
export function reconcileImportsWithReference(
  imports: ImportRequest[],
  provenance: Map<string, ImportOrigin>,
): { imports: ImportRequest[]; corrections: string[] } {
  if (provenance.size === 0 || imports.length === 0) return { imports, corrections: [] };

  const corrections: string[] = [];
  type Entry = { kind: 'named' | 'def'; symbol: string; module: string };
  const entries: Entry[] = [];
  for (const imp of imports) {
    if (imp.named) for (const s of imp.named) entries.push({ kind: 'named', symbol: s, module: imp.module });
    if (imp.def) entries.push({ kind: 'def', symbol: imp.def, module: imp.module });
  }
  for (const e of entries) {
    const truth = provenance.get(e.symbol);
    if (!truth) continue;
    // 경로 교정: 모델이 추측한 모듈 ≠ 참조의 실제 모듈
    if (truth.module !== e.module) {
      corrections.push(`${e.symbol}: ${e.module} → ${truth.module}`);
      e.module = truth.module;
    }
    // 형태 교정: default↔named 뒤집힘(참조는 `import X`인데 모델이 `import { X }`로, 또는 그 반대)
    if (truth.kind !== e.kind) {
      corrections.push(`${e.symbol}: ${e.kind === 'named' ? '{ }' : 'default'} → ${truth.kind === 'named' ? '{ }' : 'default'}`);
      e.kind = truth.kind;
    }
  }
  if (corrections.length === 0) return { imports, corrections: [] };

  // 모듈별 재그룹(named 합치고 def 보존).
  const byModule = new Map<string, { named: string[]; def?: string }>();
  for (const e of entries) {
    let g = byModule.get(e.module);
    if (!g) { g = { named: [] }; byModule.set(e.module, g); }
    if (e.kind === 'named') { if (!g.named.includes(e.symbol)) g.named.push(e.symbol); }
    else g.def = e.symbol;
  }
  const out: ImportRequest[] = [];
  for (const [module, g] of byModule) {
    const req: ImportRequest = { module };
    if (g.named.length) req.named = g.named;
    if (g.def) req.def = g.def;
    out.push(req);
  }
  return { imports: out, corrections };
}

/** ```lang … ``` 코드펜스를 벗겨 순수 코드만 남긴다. */
function stripFences(s: string): string {
  const m = s.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  return (m ? m[1] : s).replace(/\s+$/, '');
}

/**
 * <hook> 안에 모델이 잘못 끼워 넣은 **다른 채널의 제어 태그**(<replace>·<region>·<import>)를 제거한다.
 *
 * 이 태그들은 modelOut 전체에서 각자 정규식으로 이미 파싱·적용되므로(예: <replace>는 결정론 교체로 적용),
 * 훅 코드에 리터럴로 남으면 컴포넌트 본문에 **그대로 텍스트로 삽입돼 파일이 깨진다**(실측: 모델이
 * `<hook>…<replace anchor=…>…</replace></hook>`처럼 중첩 출력 → `<replace>` 텍스트가 본문에 박힘).
 * 닫는/여는 잔여 단독 태그까지 걷어내고 과도한 빈 줄을 접는다.
 */
function stripNestedControlTags(s: string): string {
  return s
    .replace(/<replace\s+anchor\s*=\s*"[^"]*"\s*>[\s\S]*?<\/replace>/g, '')
    .replace(/<region>[\s\S]*?<\/region>/g, '')
    .replace(/<import\s+[^>]*?\/?>/g, '')
    .replace(/<\/?(?:hook|region|replace|import)\b[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n');
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
  anchorFirst = false,
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
  // 영역 루트를 컴포넌트로 교체하는 레시피(예: SmartTable)가 발동했는지 — 발동 시 "최상위 태그 유지"
  // 지침을 교체 허용으로 바꾼다(가드도 같은 타깃을 화이트리스트). 일반 편집은 종전대로 루트 유지.
  const swapTargets = componentReplacementTargets({ deps: depsHeader, region, query });
  const rootTagRule =
    swapTargets.length > 0
      ? `이번 요청은 편집 영역을 **<${swapTargets[0]} …/>로 통째 교체**하는 것이 목표이므로 최상위 태그가 바뀌어도 됩니다(영역 전체를 새 컴포넌트로 대체).`
      : `영역의 최상위 태그는 바꾸지 마세요(예: <Select>로 시작하면 <Select>로 끝나야 함).`;
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
  // 앵커-우선(Stage 1, 플래그) — 작은 국소 수정은 영역 통째 재작성 대신 기존 코드를 그대로 인용해
  // <replace>로 교체하게 유도한다. 적용 레이어는 모호성 게이트로 안전(여러 곳 매칭 시 거부·재인용).
  // 약한 모델의 출력 형태에 영향을 주므로 효과는 실모델 라이브 프로브로만 검증된다(오프라인 eval 무측정).
  const anchorFirstSection = anchorFirst
    ? `\n**우선 규칙 — 작은 수정은 <replace>로(영역 통째 재작성 금지):**\n` +
      `텍스트/속성/단일 값·prop 변경, 제자리 이름변경처럼 **국소적 수정**은 바꿀 **기존 코드 조각을 그대로 인용**해 교체하세요:\n` +
      `<replace anchor="그 줄의 짧고 고유한 부분문자열">교체할 새 코드 전체</replace>\n` +
      `- anchor는 파일에서 **딱 한 곳**만 식별하는 고유 문자열이어야 합니다(여러 곳에 있으면 적용이 거부되니 더 길게 인용하세요).\n` +
      `- 요소를 **추가/삭제하거나 구조를 바꾸는** 편집만 <region>으로 영역 전체를 다시 쓰세요.\n`
    : '';
  return (
    `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.\n` +
    `아래 "의존성 헤더"는 같은 파일의 다른 부분(읽기 전용 참고)입니다. 기존 훅/state/타입/import와 충돌·중복 금지.\n\n` +
    anchorFirstSection +
    `요청을 두 종류 출력으로 나누어 답하세요(둘 다 필요하면 둘 다 출력):\n` +
    `1) "편집 영역"의 JSX 수정 → <region>…</region> 안에 편집 영역 **전체를 다시** 쓰기. ` +
    `${rootTagRule}\n` +
    `2) 새로 필요한 훅/state/타입 → <hook>…</hook> 안에 줄 단위로(들여쓰기 없이). ` +
    `<region>에서 새로 쓰는 컴포넌트·유틸의 import → <import module="모듈" named="A, B" /> **태그로만** 내보내세요. ` +
    `⛔ \`import … from …\` **문장 자체를 <hook> 안에 쓰지 마세요** — 컴포넌트 함수 본문 중간에 박혀 컴파일이 깨집니다(import는 파일 최상단에만 와야 함). ` +
    `이것들의 위치는 신경 쓰지 마세요 — 확장이 올바른 위치에 자동 삽입합니다.\n` +
    // ⚠ 예시는 의도적으로 **중립 도메인(카테고리)** 을 쓴다 — 약한 모델이 예시를 그대로 베끼는(parroting)
    //   경향이 있어, 실제 요청과 같은 도메인(부서·직원 등)으로 예시를 들면 그걸 정답으로 착각해 echo 한다
    //   (실측: 부서 필터 요청에 예시의 deptResponse/departments/'/api/departments' 가 글자그대로 출력됨).
    //   엔드포인트도 raw 문자열이 아니라 **상수**로 보여 scaffold 컨벤션을 함께 가르친다.
    `예: <hook>type TCategoryListResponse = { success: boolean; data: TCategory[] };\n` +
    `const { data: categoryResponse } = useApi<TCategoryListResponse>(CATEGORIES_ENDPOINT);\n` +
    `const categories = categoryResponse?.data ?? [];</hook>\n` +
    // import는 <hook>이 아니라 <import> 태그로 — 약한 모델이 import 문을 <hook>에 섞어 함수 본문에
    // 박던 실패(실측) 차단. 예시 컴포넌트(Badge)는 중립값이며 "실제 region에서 쓴 컴포넌트로 바꿔" 쓰라고 명시.
    `예: <region>에서 새 컴포넌트 <Badge>를 썼다면 그 import는 ` +
    `<import module="@axiom/components/ui" named="Badge" /> 로 (Badge 자리에 **실제로 쓴 컴포넌트 이름**을 넣으세요).\n` +
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
  disambiguate?: RegionDisambiguator,
  referenceImports?: Map<string, ImportOrigin>,
  verify?: EditVerifier,
  anchorFirst = false,
): Promise<RegionEditOutcome> {
  let loc = locateEditRegion(source, query);

  // 0) 영역 객관식 disambiguation — 결정론 휴리스틱은 우선순위를 보편적으로 알 수 없다(예: '입사일' vs
  //    흔한 'input'). 후보가 2개 이상이면 모델에게 의미로 고르게 하고, 고른 영역으로 재타겟한다.
  //    모델이 불확실(null)이거나 같은 영역을 고르면 휴리스틱 결과를 그대로 둔다. disambiguate 미주입
  //    (eval 하니스 등)이면 종전과 100% 동일.
  if (disambiguate && loc.candidates.length >= 2) {
    try {
      const pick = await disambiguate(query, loc.candidates);
      if (pick && (pick.startLine !== loc.startLine || pick.endLine !== loc.endLine)) {
        loc = locateEditRegion(source, query, pick);
      }
    } catch {
      /* disambiguation 실패 → 휴리스틱 결과 유지(파손 없음) */
    }
  }

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
  const system = buildHybridPrompt(loc.depsHeader, loc.region, loc.startLine, loc.endLine, referencedSpec, loc.backingDecls, query, loc.controlInventory, anchorFirst);
  let modelOut: string;
  try {
    modelOut = await callModel(system, query);
  } catch (e) {
    return { status: 'error', reason: 'model-call', diagnostics: `[regionEdit] 모델 호출 실패: ${(e as Error).message}` };
  }

  // 3) 파싱: <region> + <hook>(N개) + <import …/> + <replace anchor=…>(N개)
  const regionMatch = modelOut.match(/<region>([\s\S]*?)<\/region>/);
  // 훅 조각에서 중첩 제어 태그(<replace> 등)를 제거 — 그 태그들은 아래에서 별도 파싱·적용되므로
  // 훅에 리터럴로 남으면 본문에 텍스트로 삽입돼 깨진다. strip 후 빈 조각은 버린다.
  const hookMatches = [...modelOut.matchAll(/<hook>([\s\S]*?)<\/hook>/g)]
    .map((m) => stripNestedControlTags(m[1]).trim())
    .filter((h) => h.length > 0);
  const importMatches = [...modelOut.matchAll(/<import\s+([^>]*?)\/?>/g)].map((m) => m[1]);
  const replaceBlocks: ReplaceBlock[] = parseReplaceBlocks(modelOut);

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

  // 3.5) import 경로 교정 — 참조(내용 출처) 파일이 ground truth. 모델이 컴포넌트 import 경로를
  //   프롬프트 예시 모듈(@axiom/components/ui)로 뭉뚱그려 환각하는 것을, 참조 파일의 실제 import로
  //   결정론적으로 바로잡는다(예: PageHeader·StatusBadge를 올바른 모듈로 이동). 참조 없으면 no-op.
  let importCorrections: string[] = [];
  if (referenceImports && referenceImports.size > 0) {
    const rec = reconcileImportsWithReference(imports, referenceImports);
    imports.length = 0;
    imports.push(...rec.imports);
    importCorrections = rec.corrections;
  }

  // 아무 산출물도 없으면(빈 응답) full로 넘긴다 — region이 줄 수 있는 게 없음.
  if (!newRegion.trim() && !hookCode.trim() && imports.length === 0 && replaceBlocks.length === 0) {
    return { status: 'fallback', reason: 'empty-output', diagnostics: '[regionEdit] 모델 산출물 없음 → full 폴백' };
  }

  // 4) 후처리 root-tag 게이트 — 모델이 영역 밖을 재작성했으면 거부.
  //    단, 발동한 레시피가 영역을 특정 컴포넌트로 **의도적으로 교체**(예: <table>→<SmartTable>)하는 경우
  //    그 타깃 태그로의 루트 변경은 허용한다 — 안 그러면 모델이 옳게 만든 교체를 버리고 full 폴백돼
  //    레시피 계약을 잃는다(실측: "직원 테이블을 SmartTable로 적용"이 useApi 한 줄만 바뀌고 끝남).
  if (newRegion.trim()) {
    const swapTargets = componentReplacementTargets({ deps: loc.depsHeader, region: loc.region, query });
    const rt = checkRegionRootTag(loc.region, newRegion, swapTargets);
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

  // 4.7) region 내용손실 게이트 — 모델이 큰 영역을 재작성하라고 받고 **일부만 내고 나머지를 통째 누락**한
  //      경우를 차단한다(실측: "버튼 텍스트 바꿔줘"에 114~181줄 영역을 받아 버튼만 내고 필터바 Select들을 삭제).
  //      누락 결과는 JSX 요소를 지워도 **타입이 유효**해서 tsc 검증(Stage 0)을 통과하므로 별도 구조 가드가
  //      필요하다. 삭제/제거 의도가 아닌데 JSX 여는태그 수가 절반 미만으로 급감하면 파괴적 생략으로 보고 거부.
  //      (근본 해법은 anchor-first(<replace>) — 작은 수정에 영역 통째 재작성 자체를 안 하게 하는 것.)
  if (newRegion.trim() && regionChanged && !removalIntent) {
    // 컴포넌트 교체(예: <table>→<SmartTable>)는 여러 태그를 한 컴포넌트로 접는 게 정상 → 면제.
    const swap = componentReplacementTargets({ deps: loc.depsHeader, region: loc.region, query });
    const tagCount = (s: string): number => (s.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
    const origTags = tagCount(loc.region);
    const outTags = tagCount(newRegion);
    if (swap.length === 0 && origTags >= 6 && outTags < origTags * 0.5 && origTags - outTags >= 4) {
      return {
        status: 'fallback',
        reason: 'region-content-loss',
        diagnostics:
          `[regionEdit] 영역 재작성이 내용을 대량 누락(JSX 여는태그 ${origTags}→${outTags}) — 파괴적 생략 의심 → full 폴백. ` +
          `작은 국소 수정은 anchor-first(<replace>)를 켜면 영역 통째 재작성 없이 안전합니다.`,
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
    // region이 실제 편집된 경우에만 죽은 곁다리 선언을 strip한다(깨끗한 출력). region 미변경 케이스는
    // strip하면 no-op로 묻혀 진단이 흐려지므로, 6.7 dead-binding 게이트가 fallback으로 처리하게 둔다.
    const applied = applyStructuralEdit(composed, edit, { stripDeadInserts: regionChanged, removalIntent });
    composed = applied.text;
    changes.push(...applied.changes);
  }

  // 5.5) <replace> — 영역 밖 기존 문장(useApi params 등) 결정론 교체(C). 앵커 미해소면 full 폴백
  //      (모델이 존재하지 않는 문장을 가리킨 것 → 적용하면 의도 누락).
  if (replaceBlocks.length > 0) {
    // 5.5-가드) replace 내용손실 게이트 — region 재작성용 4.7 게이트와 같은 원칙을 <replace> 적용 경로에도
    //   건다. anchorFirst가 켜지면 모델이 작은 수정을 surgical하게 안 내고 영역 전체를 <replace>로 감싸
    //   일부 JSX를 통째 누락하는 사고가 가능한데(실측: "버튼 텍스트 바꿔줘"가 앵커 1개로 97~177줄을 잡아
    //   필터바 Select들을 삭제, tsc는 삭제를 타입유효로 봐 통과), 종전 replace 경로엔 이 가드가 없어
    //   그대로 적용됐다. 삭제 의도가 아닌데 한 블록이 JSX 여는태그를 절반↓(≥4개) 날리면 거부 → full 폴백.
    //   컴포넌트 교체(<table>→<SmartTable> 등)는 면제(태그 접힘이 정상).
    const tagCount = (s: string): number => (s.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
    const replaceGuard = removalIntent
      ? undefined
      : (oldText: string, newText: string): string | null => {
          if (componentReplacementTargets({ deps: loc.depsHeader, region: oldText, query }).length > 0) return null;
          const o = tagCount(oldText);
          const n = tagCount(newText);
          if (o >= 6 && n < o * 0.5 && o - n >= 4) {
            return `replace 내용손실(JSX 여는태그 ${o}→${n}) — 파괴적 생략 의심`;
          }
          return null;
        };
    const rep = applyReplaceBlocks(composed, replaceBlocks, replaceGuard ? { guard: replaceGuard } : undefined);
    if (rep.rejected.length > 0) {
      return {
        status: 'fallback',
        reason: 'replace-content-loss',
        diagnostics:
          `[regionEdit] <replace> 적용 거부(${rep.rejected.join(' / ')}) → full 폴백. ` +
          `앵커가 작은 수정을 넘어 큰 영역을 잡아 내용을 누락합니다. 바꿀 코드만 더 좁게 인용하세요.`,
      };
    }
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

  // 7) 검증-교정 루프(Stage 0) — verify 주입 시에만. 종전 14개 게이트는 정적 휴리스틱이라 "절반 수정"·
  //    "엉뚱한 타입" 같은 의미 오류를 못 잡고 그대로 적용했다. 적용 직전 합성 결과를 타입검증하고,
  //    새 에러가 있으면 "에러 + 깨진 코드 창"만 주고(델타) <replace> 앵커 계약으로 **1회** 교정한다.
  //    교정이 에러를 줄였을 때만 채택하고(늘면 모델이 다른 곳을 깬 것 → 원안 유지), 남은 에러는
  //    경고로 붙여 그대로 적용한다(사용자가 컨펌 카드에서 최종 판단 — 종전엔 검증 자체가 0이었음).
  let verifyNote = '';
  if (verify) {
    const v1 = await verify(composed);
    if (v1.ok) {
      verifyNote = ' / ✅ 타입검증 통과';
    } else if (v1.errors.length > 0) {
      let bestText = composed;
      let bestErrors = v1.errors;
      try {
        const fixOut = await callModel(buildVerifyCorrectionSystem(), buildVerifyCorrectionPrompt(composed, v1.errors));
        const fixBlocks = parseReplaceBlocks(fixOut);
        if (fixBlocks.length > 0) {
          const rep = applyReplaceBlocks(composed, fixBlocks);
          if (rep.unresolved.length === 0 && rep.text !== composed) {
            const v2 = await verify(rep.text);
            if (v2.errors.length < bestErrors.length) {
              bestText = rep.text;
              bestErrors = v2.errors;
              changes.push(`검증 교정(타입에러 ${v1.errors.length}→${v2.errors.length})`);
            }
          }
        }
      } catch {
        /* 교정 호출 실패 → 원안 유지(파손 없음) */
      }
      composed = bestText;
      verifyNote = bestErrors.length === 0
        ? ' / ✅ 타입검증 통과(교정)'
        : ` / ⚠️ 타입에러 ${bestErrors.length}건 잔존(확인 후 적용): ${bestErrors.slice(0, 3).join(' | ')}`;
    }
  }

  const correctionNote = importCorrections.length
    ? ` / 🔧 import 경로 교정(참조 기준): ${importCorrections.join(', ')}`
    : '';
  return {
    status: 'applied',
    finalText: composed,
    diagnostics: `[regionEdit] 적용: ${changes.join(' / ')}${correctionNote}${verifyNote}`,
  };
}
