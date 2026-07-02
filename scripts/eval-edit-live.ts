/**
 * 편집품질 **라이브** eval (Phase 2) — 실 qwen3-coder로 full/patch 편집 경로의 산출·적용 품질을 배치 판정한다.
 *
 * 왜: 의도 분류는 45/45(100%)로 끝났다(eval:intent-live). 남은 결함은 전부 **편집 산출·적용** 레이어다 —
 * 모델이 옳은 의도(modify)를 받고도 ⓐ로컬 데이터에 useApi를 환각하거나 ⓑ중복 import를 내거나 ⓒ원본에
 * 매칭 안 되는 patch를 내거나 ⓓ없는 심볼을 <search>에 넣거나 ⓔ설명만 하고 action을 안 낸다. 이 하니스는
 * 그 5가지를 실제 apply primitives(computeMultiPatch/dedupeImportLines)로 적용해 **자동 판정**한다.
 *
 * eval-e2e(region 경로)와 다른 축: 여기는 단일 컴포넌트 페이지의 **full/patch 경로**(region locate가 깨져
 * full 입력으로 가는 오늘의 실패 경로 — 메모리 project_full_vs_sliced_finding)를 측정한다.
 *
 * 실행:  npm run eval:edit-live
 *   설정: AXIOM_ENDPOINT / AXIOM_MODEL / AXIOM_API_KEY (없으면 VSCode 사용자 settings.json)
 *   옵션: AXIOM_EVAL_REPEAT=3  (약한 모델의 편집 흔들림 측정)
 *
 * ⚠️ 프롬프트 근사: 실 buildSystemPrompt는 vscode 결합이라 node 배치에서 재현 불가(핸드오프 §44) →
 * CORE_RULES_SNAPSHOT(동결 사본) + 순수 buildContractSection + 편집 포맷 지침으로 근사한다.
 */
import * as ts from 'typescript';
import { buildContractSection, contractsRequirePatchMode } from '../src/ai/ScaffoldContracts';
import { FileCreatorService } from '../src/ai/FileCreatorService';
import { resolveModelConfig, callLlm } from './live-model-client';
import {
  CORE_RULES_SNAPSHOT,
  EDIT_FORMAT_INSTRUCTIONS,
  EDIT_CASES,
  type EditCase,
  type JudgeFlag,
} from './eval-edit-corpus';

const normEol = (s: string): string => s.replace(/\r\n/g, '\n');
const fc = new FileCreatorService();

// ── 파서 (ChatViewProvider._handleAxiomAction 3265-3380 순수 복제) ────────────
// production 파서는 vscode 결합 메서드 안에 인라인이라 재사용 불가 → 정규식 로직만 그대로 옮긴다.
// 프로덕션이 바뀌면 여기도 갱신(그 드리프트가 판정 왜곡의 원인이 됨).
interface ParsedAction {
  meta: Record<string, unknown> | null;
  patches: { search: string; replace: string }[];
  generatedCode: string | null;
}
interface ParseResult {
  hasCompletedBlock: boolean;
  actions: ParsedAction[];
}

const stripControlTagLines = (s: string): string =>
  s
    .split('\n')
    .filter((ln) => !/^\s*<\/?(?:search|replace|patch)>\s*$/.test(ln))
    .join('\n')
    .replace(/\n$/, '');

// `<replace>` 관용 캡처(프로덕션 ChatViewProvider와 동일) — 약한 모델이 `</replace>`를 `</search>`·`</patch>`로
// 잘못 닫는 케이스(실측: 400줄 테이블 편집)를 살린다. `</replace>` 있으면 그대로, 없으면 여는 태그 이후 ~
// `</patch>`/끝까지를 본문으로.
const extractReplace = (segment: string): string | undefined => {
  const closed = segment.match(/<replace>\n?([\s\S]*?)<\/replace>/);
  if (closed?.[1] !== undefined) return closed[1];
  const openIdx = segment.indexOf('<replace>');
  if (openIdx === -1) return undefined;
  let body = segment.slice(openIdx + '<replace>'.length).replace(/^\n/, '');
  const endIdx = body.indexOf('</patch>');
  if (endIdx !== -1) body = body.slice(0, endIdx);
  return body;
};

function parseActions(response: string): ParseResult {
  const blockMatches = [...response.matchAll(/<axiom-action>([\s\S]*?)<\/axiom-action>/g)];
  if (blockMatches.length === 0) return { hasCompletedBlock: false, actions: [] };

  const actions: ParsedAction[] = [];
  for (const blockMatch of blockMatches) {
    const blockContent = blockMatch[1];
    const jsonMatch = blockContent.match(/(\{[^`]*?\})/s);
    let meta: Record<string, unknown> | null = null;
    if (jsonMatch) {
      try {
        meta = JSON.parse(jsonMatch[1].trim()) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }

    const patches: { search: string; replace: string }[] = [];
    const patchBlockMatches = [...blockContent.matchAll(/<patch>\s*([\s\S]*?)\s*<\/patch>/g)];
    for (const pb of patchBlockMatches) {
      const inner = pb[1];
      const s = inner.match(/<search>\n?([\s\S]*?)<\/search>/);
      const rBody = extractReplace(inner);
      if (s?.[1] !== undefined && rBody !== undefined) {
        patches.push({
          search: stripControlTagLines(s[1].replace(/\n$/, '')),
          replace: stripControlTagLines(rBody.replace(/\n$/, '')),
        });
      }
    }
    // <patch> 래핑 없으면 bare <search>/<replace> 단일 쌍
    if (patches.length === 0) {
      const searchMatch = blockContent.match(/<search>\n?([\s\S]*?)<\/search>/);
      const replaceBody = extractReplace(blockContent);
      if (searchMatch?.[1] !== undefined && replaceBody !== undefined) {
        patches.push({
          search: stripControlTagLines(searchMatch[1].replace(/\n$/, '')),
          replace: stripControlTagLines(replaceBody.replace(/\n$/, '')),
        });
      }
    }

    // full 응답: patch가 없고 meta.generatedCode 또는 코드펜스 전체 파일
    let generatedCode: string | null =
      typeof meta?.generatedCode === 'string' ? (meta.generatedCode as string) : null;
    if (patches.length === 0 && !generatedCode) {
      const fence = blockContent.match(/```(?:tsx?|jsx?)?\n([\s\S]*?)```/);
      if (fence?.[1] !== undefined) generatedCode = fence[1].replace(/\n$/, '');
    }

    actions.push({ meta, patches, generatedCode });
  }
  return { hasCompletedBlock: true, actions };
}

// ── 프롬프트 근사 (시나리오 C) ────────────────────────────────────────────────
function buildEditPrompt(c: EditCase): { system: string; user: string } {
  const contract = buildContractSection({ deps: c.fixture, region: '', query: c.query });
  const system =
    `${CORE_RULES_SNAPSHOT}\n\n` +
    (contract ? `${contract}\n` : '') +
    `${EDIT_FORMAT_INSTRUCTIONS}\n\n` +
    `## 현재 파일 (${c.filePath})\n\`\`\`tsx\n${c.fixture}\`\`\`\n`;
  return { system, user: c.query };
}

// ── 그라운딩: <search>가 원본에 글자 그대로(EOL·양끝 공백 무시) 존재하나 ──────────
function isGrounded(search: string, original: string): boolean {
  const normOrig = normEol(original);
  const normSearch = normEol(search).trim();
  if (normSearch === '') return false;
  if (normOrig.includes(normSearch)) return true;
  // 라인 단위 관대 매칭(각 라인 trim 후 순차 포함) — production computeMultiPatch도 라인 기준.
  const origLines = normOrig.split('\n').map((l) => l.trim());
  const searchLines = normSearch.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  if (searchLines.length === 0) return false;
  for (let i = 0; i + searchLines.length <= origLines.length; i++) {
    let ok = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (origLines[i + j] !== searchLines[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

const API_HALLUCINATION_RE = /\buseApi\s*[<(]|['"]\/api\//;

function parseOk(text: string): boolean {
  const sf = ts.createSourceFile('edit.tsx', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const diags = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  return diags.length === 0;
}

// ── 케이스 1회 판정 ───────────────────────────────────────────────────────────
interface Outcome {
  flags: Record<JudgeFlag, boolean>;
  applied: boolean; // 최종 텍스트가 원본과 달라졌나(실제 편집이 일어났나)
  parses: boolean | null; // 적용 결과가 TSX로 파싱되나(applied일 때만)
  note: string;
  raw?: string;
  ms: number;
  error?: string;
}

function emptyFlags(): Record<JudgeFlag, boolean> {
  return { apiHallucination: false, dupImport: false, patchUnmatched: false, ungrounded: false, proseOnly: false, renderMissing: false, duplicateTable: false, preservationBroken: false, globalImport: false, buttonMissing: false };
}

/** 모델 응답 텍스트 하나를 판정한다(모델 호출과 분리 — 셀프테스트가 canned 응답을 주입할 수 있게). */
function judgeResponse(c: EditCase, responseText: string, ms: number): Outcome {
  const flags = emptyFlags();
  const parsed = parseActions(responseText);
  const action = parsed.actions[0];
  const hasPayload = !!action && (action.patches.length > 0 || !!action.generatedCode);

  // ⓔ prose-only: 완결 블록이 없거나, 블록은 있어도 payload(patch/full)가 없음.
  if (!parsed.hasCompletedBlock || !hasPayload) {
    flags.proseOnly = true;
    return { flags, applied: false, parses: null, note: parsed.hasCompletedBlock ? 'block-no-payload' : 'no-block', raw: responseText, ms };
  }

  let applied = c.fixture;
  let note = '';

  if (action.patches.length > 0) {
    // ⓓ 그라운딩: 하나라도 원본에 없으면 ungrounded
    flags.ungrounded = action.patches.some((p) => !isGrounded(p.search, c.fixture));
    // ⓒ 매칭: computeMultiPatch atomic 결과
    const mp = fc.computeMultiPatch(c.fixture, action.patches);
    if (mp.text === null) {
      flags.patchUnmatched = true;
      const fails = mp.results.filter((x) => !x.success).map((x) => x.reason).join(',');
      note = `patch ${action.patches.length}개, 매칭실패(${fails || 'overlap'})`;
    } else {
      applied = mp.text;
      note = `patch ${action.patches.length}개 적용`;
    }
    // ⓐ api 환각: replace 텍스트 기준(로컬 데이터 케이스만)
    if (c.localData) {
      flags.apiHallucination = action.patches.some((p) => API_HALLUCINATION_RE.test(p.replace));
    }
  } else if (action.generatedCode) {
    applied = action.generatedCode;
    note = 'full 응답';
    if (c.localData) flags.apiHallucination = API_HALLUCINATION_RE.test(action.generatedCode);
  }

  // ⓑ 중복 import: dedupe가 제거한 게 있으면 모델이 중복을 냈다는 뜻
  const dedup = fc.dedupeImportLines(applied);
  flags.dupImport = dedup.removed > 0;
  if (dedup.removed > 0) note += ` · 중복import ${dedup.removed}줄`;
  applied = dedup.text;

  const didApply = normEol(applied) !== normEol(c.fixture);

  // ⓕ 렌더 누락: "테이블로 보여줘"인데 결과에 테이블 map 렌더가 없음(데이터만 선언 / no-op).
  // 판정: 테이블 태그(<table>/<Table>/<tr>/<TableRow>) + .map( 이 둘 다 있어야 "표를 그렸다"로 본다.
  if (c.expectsTableRender) {
    const hasTableTag = /<(table|Table|tr|TableRow)\b/.test(applied);
    const hasMap = /\.map\s*\(/.test(applied);
    if (!didApply || !hasTableTag || !hasMap) {
      flags.renderMissing = true;
      note += !didApply ? ' · 렌더누락(no-op)' : ` · 렌더누락(table=${hasTableTag} map=${hasMap})`;
    }
  }

  // ⓖ 중복 테이블: 원본에 이미 <Table>/<table>이 있는데, 수정하지 않고 새 테이블을 또 만들어 개수가 늘어남.
  const tableCount = (s: string): number => (s.match(/<(Table|table)\b/g) ?? []).length;
  const fixtureTables = tableCount(c.fixture);
  if (fixtureTables > 0 && tableCount(applied) > fixtureTables) {
    flags.duplicateTable = true;
    note += ` · 중복테이블(${fixtureTables}→${tableCount(applied)})`;
  }

  // ⓗ 보존 위반: 반드시 남아야 할 기존 토큰(명명 핸들러·훅 필드)이 결과에서 사라짐.
  if (c.preserveTokens && c.preserveTokens.length > 0) {
    const lost = c.preserveTokens.filter((t) => !applied.includes(t));
    if (lost.length > 0) {
      flags.preservationBroken = true;
      note += ` · 보존위반(사라짐: ${lost.join(', ')})`;
    }
  }

  // ⓘ 전역 import 환각: $ui/$util/$router는 전역이라 import 불필요한데 모델이 import를 지어냄.
  // 탐지는 프로덕션과 동일한 line-based stripGlobalImports 로직 재사용(정규식 멀티라인 오매칭 방지).
  // (라이브는 이걸로 실제 제거하지만, 하니스는 모델 raw 결함을 드러내려고 탐지만 하고 제거는 안 한다.)
  if (fc.stripGlobalImports(applied).removed > 0) {
    flags.globalImport = true;
    note += ' · 전역import환각($ui/$util/$router)';
  }

  // ⓙ 버튼 미렌더: "버튼 넣어줘"인데 <button>/<Button> JSX가 늘지 않음(핸들러만 선언 / no-op).
  if (c.expectsButtonRender) {
    const btnCount = (s: string): number => (s.match(/<(button|Button)\b/g) ?? []).length;
    if (!didApply || btnCount(applied) <= btnCount(c.fixture)) {
      flags.buttonMissing = true;
      note += !didApply ? ' · 버튼미렌더(no-op)' : ` · 버튼미렌더(${btnCount(c.fixture)}→${btnCount(applied)})`;
    }
  }

  const parses = didApply ? parseOk(applied) : null;
  return { flags, applied: didApply, parses, note, raw: responseText, ms };
}

/** 실 모델을 호출해 판정한다. */
async function runCase(cfg: ReturnType<typeof resolveModelConfig>, c: EditCase): Promise<Outcome> {
  const { system, user } = buildEditPrompt(c);
  // maxTokens는 라이브(AI_DEFAULTS=8192)와 맞춘다 — 2048은 대형 파일 patch를 잘라 파서 실패(block-no-payload)로
  // false positive를 낸다(실측: 400줄 EmployeeListPage). 하니스 충실도 = 라이브와 동일 예산.
  const r = await callLlm(cfg!, `${system}\n\n/no_think`, user, { maxTokens: 8192, temperature: 0.1 });
  if (!r.ok) return { flags: emptyFlags(), applied: false, parses: null, note: '(호출 실패)', ms: r.elapsedMs, error: r.error };
  return judgeResponse(c, r.text, r.elapsedMs);
}

// ── main ──────────────────────────────────────────────────────────────────────
const FLAG_LABEL: Record<JudgeFlag, string> = {
  apiHallucination: 'ⓐapi환각',
  dupImport: 'ⓑ중복import',
  patchUnmatched: 'ⓒ매칭실패',
  ungrounded: 'ⓓ비그라운딩',
  proseOnly: 'ⓔ설명만',
  renderMissing: 'ⓕ렌더누락',
  duplicateTable: 'ⓖ중복테이블',
  preservationBroken: 'ⓗ보존위반',
  globalImport: 'ⓘ전역import',
  buttonMissing: 'ⓙ버튼미렌더',
};

/**
 * 셀프테스트(모델 불필요) — canned 응답을 judgeResponse에 흘려 판정 로직이 옳은지 결정론으로 확인한다.
 * 실 모델 없이도 파서·apply·판정 파이프라인의 회귀를 잡는다(집에서 실모델 돌리기 전 사전 검증).
 * npm run eval:edit-live -- --selftest
 */
function selftest(): void {
  const getArr = EDIT_CASES.find((c) => c.id === 'getarr-to-table')!;
  const button = EDIT_CASES.find((c) => c.id === 'alert-button')!;

  interface ST { name: string; c: EditCase; response: string; expect: Partial<Record<JudgeFlag, boolean>>; expectApplied?: boolean }
  const suite: ST[] = [
    {
      name: 'GOOD: getArr 로컬 렌더(그라운딩·api환각 없음)',
      c: getArr,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"src/domains/product/pages/ProductListPage.tsx"}\n' +
        '<patch>\n<search>\n\t\t\t<p className="text-muted-foreground">여기에 상품을 표시합니다.</p>\n</search>\n' +
        '<replace>\n\t\t\t<table><tbody>{getArr().map((p) => (<tr key={p.id}><td>{p.name}</td><td>{p.price}</td></tr>))}</tbody></table>\n</replace>\n</patch>\n</axiom-action>',
      expect: { apiHallucination: false, ungrounded: false, patchUnmatched: false, proseOnly: false, dupImport: false },
      expectApplied: true,
    },
    {
      name: 'BAD: useApi 환각(로컬 데이터인데 새 /api/)',
      c: getArr,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        '<patch>\n<search>\n\t\t\t<p className="text-muted-foreground">여기에 상품을 표시합니다.</p>\n</search>\n' +
        '<replace>\n\t\t\tconst { data } = useApi<TProduct[]>(\'/api/products\');\n</replace>\n</patch>\n</axiom-action>',
      expect: { apiHallucination: true },
    },
    {
      name: 'BAD: 비그라운딩(<search>가 원본에 없음)',
      c: getArr,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        '<patch>\n<search>\nconst nonexistent = 42;\n</search>\n<replace>\nconst nonexistent = 43;\n</replace>\n</patch>\n</axiom-action>',
      expect: { ungrounded: true, patchUnmatched: true },
    },
    {
      name: 'BAD: 중복 import(이미 있는 Button 재추가)',
      c: button,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        "<patch>\n<search>\nimport { Button } from '@axiom/components/ui';\n</search>\n" +
        "<replace>\nimport { Button } from '@axiom/components/ui';\nimport { Button } from '@axiom/components/ui';\n</replace>\n</patch>\n</axiom-action>",
      expect: { dupImport: true },
    },
    {
      name: 'BAD: 설명만(action 블록 없음)',
      c: getArr,
      response: 'getArr 함수 결과를 테이블로 표시하려면 map을 사용하면 됩니다. 예시는 다음과 같습니다...',
      expect: { proseOnly: true },
      expectApplied: false,
    },
    {
      // 라이브 재현: API 명시 케이스가 useApi 배관만 깔고 테이블 JSX를 안 그림(structural/patch no-op).
      name: 'BAD: 렌더 누락(데이터만 선언, 테이블 JSX 없음)',
      c: EDIT_CASES.find((c) => c.id === 'emp-api-to-table')!,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        "<patch>\n<search>\n\treturn (\n</search>\n" +
        "<replace>\n\tconst { data: res } = useApi<{ data: { id: number }[] }>('/api/employees');\n\tconst employees = res?.data ?? [];\n\treturn (\n</replace>\n</patch>\n</axiom-action>",
      expect: { renderMissing: true },
    },
    {
      // GOOD 대조: API 배관 + 실제 테이블 렌더까지 → 렌더 누락 아님.
      name: 'GOOD: API 배관 + 테이블 렌더(렌더 누락 아님)',
      c: EDIT_CASES.find((c) => c.id === 'emp-api-to-table')!,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        "<patch>\n<search>\n\t\t\t<p className=\"text-muted-foreground\">이 페이지의 내용을 작성하세요.</p>\n</search>\n" +
        '<replace>\n\t\t\t<Table><TableBody>{employees.map((e) => (<TableRow key={e.id}><TableCell>{e.name}</TableCell></TableRow>))}</TableBody></Table>\n</replace>\n</patch>\n</axiom-action>',
      expect: { renderMissing: false },
    },
    {
      // BAD: 기존 <Table>이 있는데 tbody만 고치지 않고 새 <Table>을 통째로 추가 → 중복.
      name: 'BAD: 중복 테이블(기존 수정 않고 새 테이블 추가)',
      c: EDIT_CASES.find((c) => c.id === 'existing-table-edit')!,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        '<patch>\n<search>\n\t\t</div>\n</search>\n' +
        '<replace>\n\t\t\t<Table><TableBody>{getArr().map((r) => (<TableRow key={r.id}><TableCell>{r.product}</TableCell></TableRow>))}</TableBody></Table>\n\t\t</div>\n</replace>\n</patch>\n</axiom-action>',
      expect: { duplicateTable: true },
    },
    {
      // 관용 파서 회귀: 모델이 </replace>를 </search>로 잘못 닫아도 patch를 살려 적용해야 함(prose-only 아님).
      name: 'GOOD: mis-closed </replace>(→</search>) 복구',
      c: getArr,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        "<patch>\n<search>\n\t\t\t<p className=\"text-muted-foreground\">여기에 상품을 표시합니다.</p>\n</search>\n" +
        '<replace>\n\t\t\t<table><tbody>{getArr().map((p) => (<tr key={p.id}><td>{p.name}</td></tr>))}</tbody></table>\n</search>\n</patch>\n</axiom-action>',
      expect: { proseOnly: false, renderMissing: false },
      expectApplied: true,
    },
    {
      // BAD: 명명 핸들러 handleSave를 인라인 화살표로 갈아끼워 삭제 → 보존 위반.
      name: 'BAD: 핸들러 보존 위반(handleSave 삭제)',
      c: EDIT_CASES.find((c) => c.id === 'handler-preserve')!,
      response:
        '<axiom-action>\n{"actionType":"modify","filePath":"x"}\n' +
        '<patch>\n<search>\n\t\t\t<Button onClick={handleSave}>저장</Button>\n</search>\n' +
        "<replace>\n\t\t\t<Button onClick={() => { console.log('저장'); alert('저장됨'); }}>저장</Button>\n</replace>\n</patch>\n</axiom-action>",
      expect: { preservationBroken: true },
    },
  ];

  // 계약 카드 발동 가드: local-data-render 카드가 employee getArr 재현 케이스의 프롬프트에 실제로
  // 들어가는지 확인(fix가 조용히 빠지는 회귀 방지). 카드 제목 마커로 판정.
  const empCase = EDIT_CASES.find((c) => c.id === 'emp-getarr-to-table');
  let cardPass = 0;
  const cardTotal = 3;
  if (empCase) {
    const cctx = { deps: empCase.fixture, region: '', query: empCase.query };
    const sys = buildEditPrompt(empCase).system;
    if (sys.includes('로컬 데이터 렌더')) { cardPass++; console.log('✅ 계약카드: local-data-render 발동(emp getArr 프롬프트에 주입됨)'); }
    else console.log('❌ 계약카드: local-data-render 미발동 — fix가 프롬프트에 안 닿음');
    if (/절대 금지[^]*useApi/.test(sys) && sys.includes('/api/')) { cardPass++; console.log('✅ 계약카드: useApi/api 금지 지시 포함'); }
    else console.log('❌ 계약카드: useApi/api 금지 지시 누락');
    // 렌더 카드 활성 시 requiresPatchMode → structural 메뉴 제거 트리거(모델이 structural로 표 누락하던 회귀 방지)
    if (contractsRequirePatchMode(cctx)) { cardPass++; console.log('✅ 계약카드: requiresPatchMode=true (structural 메뉴 제거 트리거)'); }
    else console.log('❌ 계약카드: requiresPatchMode 미설정 — structural이 계속 제시됨');
  }

  let pass = 0;
  for (const st of suite) {
    const o = judgeResponse(st.c, st.response, 0);
    const misses: string[] = [];
    for (const f of Object.keys(st.expect) as JudgeFlag[]) {
      if (o.flags[f] !== st.expect[f]) misses.push(`${FLAG_LABEL[f]} 기대=${st.expect[f]} 실제=${o.flags[f]}`);
    }
    if (st.expectApplied !== undefined && o.applied !== st.expectApplied) {
      misses.push(`applied 기대=${st.expectApplied} 실제=${o.applied}`);
    }
    if (misses.length === 0) {
      pass++;
      console.log(`✅ ${st.name}`);
    } else {
      console.log(`❌ ${st.name}\n     ${misses.join(' · ')}\n     note=${o.note}`);
    }
  }
  console.log(`\n셀프테스트: 판정 ${pass}/${suite.length} · 계약카드 ${cardPass}/${cardTotal} 통과`);
  if (pass !== suite.length || cardPass !== cardTotal) process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }
  const cfg = resolveModelConfig();
  if (!cfg) {
    console.error('❌ endpoint/model을 찾을 수 없습니다. AXIOM_ENDPOINT/AXIOM_MODEL 또는 VSCode 설정을 확인하세요.');
    process.exit(1);
  }
  const repeat = Math.max(1, Number(process.env.AXIOM_EVAL_REPEAT ?? 1));
  console.log(`\n편집품질 라이브 eval — endpoint=${cfg.endpoint} model=${cfg.model} apiKey=${cfg.apiKey ? '있음' : '없음'} repeat=${repeat}\n`);

  const pre = await callLlm(cfg, '핑', 'ok?', { maxTokens: 4, timeoutMs: 20_000 });
  if (!pre.ok) {
    console.error(`❌ 모델 서버 연결/인증 실패: ${pre.error}`);
    if (/401|403|unauthorized|forbidden/i.test(pre.error ?? '')) {
      console.error(
        '\n👉 API 키가 필요합니다. 익스텐션은 키를 VSCode SecretStorage(암호화)에 보관하므로 스크립트가 못 읽습니다.\n' +
        '   PowerShell: $env:AXIOM_API_KEY="<키>"; npm run eval:edit-live',
      );
    }
    process.exit(1);
  }

  // 플래그별 발생 카운트(분모=repeat*케이스), 케이스별 결과 누적
  const flagTotals: Record<JudgeFlag, number> = { apiHallucination: 0, dupImport: 0, patchUnmatched: 0, ungrounded: 0, proseOnly: 0, renderMissing: 0, duplicateTable: 0, preservationBroken: 0, globalImport: 0, buttonMissing: 0 };
  let totalRuns = 0;
  let cleanRuns = 0; // 아무 결함 플래그도 없고 실제 적용된 실행
  const focusRegressions: string[] = [];

  // AXIOM_EVAL_ONLY=<id 부분문자열>로 특정 케이스만 실행(디버깅). 미설정 시 전체.
  const only = process.env.AXIOM_EVAL_ONLY;
  const cases = only ? EDIT_CASES.filter((c) => c.id.includes(only)) : EDIT_CASES;
  const rawLimit = process.env.AXIOM_EVAL_RAW ? 100_000 : 200; // AXIOM_EVAL_RAW=1이면 전체 원문

  for (const c of cases) {
    const flagHits: Record<JudgeFlag, number> = { apiHallucination: 0, dupImport: 0, patchUnmatched: 0, ungrounded: 0, proseOnly: 0, renderMissing: 0, duplicateTable: 0, preservationBroken: 0, globalImport: 0, buttonMissing: 0 };
    let cleanForCase = 0;
    let lastNote = '';
    let lastRaw: string | undefined;
    let sumMs = 0;

    for (let i = 0; i < repeat; i++) {
      const o = await runCase(cfg, c);
      totalRuns++;
      sumMs += o.ms;
      lastNote = o.note + (o.error ? ` · ${o.error}` : '') + (o.parses === false ? ' · 💥TSX깨짐' : '');
      lastRaw = o.raw;
      let anyFlag = false;
      for (const f of Object.keys(o.flags) as JudgeFlag[]) {
        if (o.flags[f]) { flagHits[f]++; flagTotals[f]++; anyFlag = true; }
      }
      const clean = !anyFlag && o.applied && o.parses !== false;
      if (clean) { cleanForCase++; cleanRuns++; }
    }

    const hitFlags = (Object.keys(flagHits) as JudgeFlag[]).filter((f) => flagHits[f] > 0);
    const allClean = cleanForCase === repeat;
    const mark = allClean ? '✅' : hitFlags.length ? '❌' : '⚠️';
    const rate = repeat > 1 ? ` [clean ${cleanForCase}/${repeat}]` : '';
    console.log(`${mark} ${c.name}${rate}`);
    if (hitFlags.length) {
      console.log(`     결함: ${hitFlags.map((f) => `${FLAG_LABEL[f]}(${flagHits[f]}/${repeat})`).join(', ')}`);
    }
    console.log(`     ${lastNote || '—'} · ${Math.round(sumMs / repeat)}ms`);
    if (!allClean && lastRaw) {
      console.log(`     원문: ${rawLimit > 1000 ? '\n' + lastRaw.trim().slice(0, rawLimit) : lastRaw.trim().slice(0, rawLimit).replace(/\n/g, ' ⏎ ')}`);
    }

    // focus 회귀: 이 케이스가 특히 노린 플래그가 하나라도 발생하면 회귀로 표기
    for (const f of c.focus) {
      if (flagHits[f] > 0) focusRegressions.push(`${c.id}:${FLAG_LABEL[f]}`);
    }
  }

  // ── 집계 ──
  const cleanRate = totalRuns ? Math.round((cleanRuns / totalRuns) * 100) : 0;
  console.log(`\n결과: clean ${cleanRuns}/${totalRuns} (${cleanRate}%)`);
  const flagLines = (Object.keys(flagTotals) as JudgeFlag[])
    .filter((f) => flagTotals[f] > 0)
    .map((f) => `${FLAG_LABEL[f]}=${flagTotals[f]}`);
  console.log(`결함 분포: ${flagLines.length ? flagLines.join(', ') : '(없음 — 전부 clean)'}`);
  if (focusRegressions.length) {
    console.log(`\n⚠️ focus 회귀(${focusRegressions.length}): ${focusRegressions.join(' / ')}`);
    console.log('   (오늘 고친 3건이 다시 새고 있음 — 회귀. eval-edit-corpus의 focus 참조.)');
  }

  // 비결정 모델이라 실패해도 exit 1로 CI를 깨지 않되, 임계 게이트는 옵션으로.
  const minClean = Number(process.env.AXIOM_EVAL_MIN_CLEAN ?? 0);
  if (minClean && cleanRate < minClean) {
    console.error(`\n❌ clean율 ${cleanRate}% < 임계 ${minClean}%`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[eval:edit-live] 실패: ${(e as Error).message}`);
  process.exit(1);
});
