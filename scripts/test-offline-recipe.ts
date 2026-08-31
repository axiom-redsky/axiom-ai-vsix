/**
 * 오프라인 레시피 실행기(A3) 테스트 — 골격 분할 · 삽입 계획 · 결정론 적용.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 A3.
 */
import {
  buildRecipeApply, buildRecipePlan, jsxInsertRange, locateAnchors, parseAnchorKey, scanJsxAnchors,
  splitRecipeSkeleton,
} from '../src/ai/actions/OfflineRecipeApply';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

/** 내장 date-picker 카드와 같은 모양의 골격(import + 훅 + JSX). */
const SKELETON = [
  "import { Calendar, Button } from '@axiom/components/ui';",
  '',
  'const [pickerOpen, setPickerOpen] = useState(false);',
  'const pickerRef = useRef<HTMLDivElement>(null);',
  '',
  '<div ref={pickerRef} className="relative">',
  '  <Button onClick={() => setPickerOpen((v) => !v)}>날짜</Button>',
  '</div>',
].join('\n');

const SOURCE = [
  "import React, { useState } from 'react';",
  '',
  'export default function EmployeePage(): React.ReactNode {',
  '  const [keyword, setKeyword] = useState("");',
  '  return (',
  '    <div className="page">',
  '      <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />',
  '    </div>',
  '  );',
  '}',
].join('\n');

// ═══ A. 골격 분할 ═══════════════════════════════════════════════════════════
console.log('\n── A. 골격 분할 ──');
{
  const parts = splitRecipeSkeleton(SKELETON);
  ok(parts.code.includes('useState(false)') && parts.code.includes('import {'), 'A1: 코드 채널에 import+훅');
  ok(!parts.code.includes('<div ref='), 'A2: 코드 채널에 JSX 없음');
  ok(parts.jsx.startsWith('<div ref={pickerRef}'), 'A3: JSX 채널은 최상위 여는 태그부터');
  eq(parts.importCount, 1, 'A4: import 줄 수');

  // JSX 없는 레시피(훅만)
  const hookOnly = splitRecipeSkeleton('const [a, setA] = useState(0);');
  eq([hookOnly.jsx, hookOnly.importCount], ['', 0], 'A5: JSX 없는 골격은 코드 채널만');
  // JSX만 있는 레시피
  const jsxOnly = splitRecipeSkeleton('<Button>확인</Button>');
  eq([jsxOnly.code, jsxOnly.jsx], ['', '<Button>확인</Button>'], 'A6: JSX만 있는 골격');
  // 들여쓰기된 태그는 JSX 시작이 아니다(훅 안의 JSX 조각 오탐 방지)
  const indented = splitRecipeSkeleton('const x = (\n  <div />\n);');
  eq(indented.jsx, '', 'A7: 들여쓰기된 태그는 분할점이 아니다');
}

// ═══ B. 앵커(삽입 위치) ═════════════════════════════════════════════════════
console.log('\n── B. 앵커 ──');
{
  eq(parseAnchorKey('sel:12-14'), { key: 'sel:12-14', line: 12, endLine: 14, label: '선택 영역 12~14줄을 교체' }, 'B1: 선택 영역 key');
  eq(parseAnchorKey('line:37')?.endLine, null, 'B2: 줄 key는 삽입(교체 아님)');
  eq(parseAnchorKey('sel:14-12'), null, 'B3: 역전된 범위는 무효');
  eq(parseAnchorKey('garbage'), null, 'B4: 형식 아니면 무효');

  const anchors = scanJsxAnchors(SOURCE);
  ok(anchors.length >= 1, 'B5: 화면 안 여는 태그를 후보로 수집');
  ok(anchors.every((a) => a.endLine === null), 'B6: 랜드마크는 전부 삽입(교체는 선택 영역만)');
  // ★ 루트 요소(6줄 `<div className="page">`) **앞**은 후보가 아니다 —
  //   거기 넣으면 형제 루트가 둘이 되어 JSX가 깨진다.
  ok(!anchors.some((a) => a.line <= 6), 'B7: 루트 요소 앞은 삽입 자리가 아니다');
  ok(anchors.some((a) => a.line === 7), 'B8: 루트의 자식 자리(7줄 <input>)가 후보');
  ok(!anchors.some((a) => SOURCE.split('\n')[a.line - 1].includes('</div>')), 'B9: 닫는 태그는 후보 아님');

  const range = jsxInsertRange(SOURCE)!;
  eq([range.from, range.to, range.rootLine], [7, 8, 6],
    'B10: 삽입 범위 = 루트 다음~루트 닫힘 / 교체는 루트부터 허용');
  eq(jsxInsertRange('export const x = 1;'), null, 'B11: 컴포넌트 없으면 범위 없음');
  eq(jsxInsertRange([
    'export default function P(): React.ReactNode {',
    '  return <Spinner />;',
    '}',
  ].join('\n')), null, 'B12: 자기닫힘 루트에는 자식을 넣을 수 없다');
}

// ═══ C. 계획 ════════════════════════════════════════════════════════════════
console.log('\n── C. 계획 ──');
{
  const plan = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, targetFile: 'src/A.tsx' });
  eq(plan.blocked, null, 'C1: 정상 계획');
  ok(plan.anchor !== null, 'C2: 앵커 확정(기본값=첫 후보)');
  eq([plan.importCount, plan.jsxLines], [1, 3], 'C3: 부품 요약');
  ok(plan.notice?.includes('삽입만') ?? false, 'C4: 삽입은 교체가 아니라는 사실을 먼저 밝힌다');

  // 요청 시점 커서가 기본 앵커가 된다
  const pinned = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'line:7' });
  eq(pinned.anchor?.key, 'line:7', 'C5: 붙잡은 커서 위치가 기본 앵커');
  ok(pinned.anchorChoices[0].label.includes('커서 위치'), 'C6: 커서 후보가 목록 맨 앞');

  // 선택 영역이면 교체 모드 + 안내 문구가 사라진다(정말로 교체하므로).
  // 루트(6줄)부터의 선택도 정당하다 — 루트를 통째로 바꾸면 루트는 여전히 하나다(삽입과 규칙이 다름).
  const sel = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'sel:6-8' });
  eq([sel.anchor?.key, sel.anchor?.endLine], ['sel:6-8', 8], 'C7: 선택 영역 교체 앵커(루트 포함 허용)');
  eq(sel.notice, null, 'C8: 교체 모드에는 "삽입만" 안내가 없다');
  // 화면 밖까지 걸친 선택은 거부 — `return (`·`);`를 먹으면 문법이 깨진다.
  const wideSel = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'sel:5-9' });
  ok(wideSel.anchor?.key !== 'sel:5-9', 'C7b: 화면 밖까지 걸친 선택은 채택하지 않는다');

  // 후보 밖 값은 기본값으로 되돌린다(호스트가 진실의 원천)
  const bogus = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'line:9999' });
  ok(bogus.anchor !== null && bogus.anchor.key !== 'line:9999', 'C9: 파일 밖 앵커는 기본값으로 복귀');

  // ★ 실측 사고: 요청 시점 커서가 1줄(import 구역)이라 화면 조각이 파일 맨 위에 박혔다.
  //   화면(JSX) 밖 커서는 채택하지 않고, 왜 안 썼는지 카드가 말해야 한다.
  const outside = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'line:1' });
  ok((outside.anchor?.line ?? 0) > 3, 'C15: import 구역 커서는 앵커로 쓰지 않는다');
  ok(!outside.anchorChoices.some((a) => a.key === 'line:1'), 'C16: 화면 밖 자리는 후보에도 없다');
  ok((outside.notice ?? '').includes('화면(JSX) 밖'), 'C17: 왜 커서를 안 썼는지 카드가 밝힌다');
  ok((outside.anchor?.label ?? '').includes('줄:'), 'C18: 앵커 라벨에 그 줄 코드가 보인다');

  // 커서가 화면 안이면 그대로 존중하고 라벨에 코드 미리보기를 붙인다
  const inside = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'line:7' });
  ok((inside.anchor?.label ?? '').includes('커서 위치(7줄): <input'), 'C19: 커서 라벨 = 그 줄 코드 미리보기');

  // 컴포넌트(화면)가 없는 파일이면 아무 데나 넣지 않고 막는다
  const noComp = buildRecipePlan({ source: 'export const x = 1;\n', skeleton: SKELETON, values: {} });
  ok((noComp.blocked ?? '').includes('화면(JSX)'), 'C20: 화면 없는 파일은 막고 사유를 말한다');

  // 막힘들
  eq(buildRecipePlan({ source: '', skeleton: SKELETON, values: {}, targetFile: 'src/A.tsx' }).blocked,
    '대상 파일을 읽지 못했습니다: src/A.tsx', 'C10: 원문 없음 → 사유');
  ok((buildRecipePlan({ source: SOURCE, skeleton: '', values: {} }).blocked ?? '').includes('골격이 없습니다'),
    'C11: 골격 없는 recipe 카드 → 사유');
  const pending = buildRecipePlan({
    source: SOURCE, skeleton: 'const {{name}}Ref = useRef(null);\n<div>{{name}}</div>', values: {},
  });
  eq(pending.pendingSlots, ['name'], 'C12: 미치환 슬롯을 잡아낸다');
  ok((pending.blocked ?? '').includes('name'), 'C13: 미정 값이 있으면 실행을 막는다');
  eq(buildRecipePlan({
    source: SOURCE, skeleton: 'const {{name}}Ref = useRef(null);', values: { name: 'picker' },
  }).blocked, null, 'C14: 칩이 채워지면 풀린다');
}

// ═══ D. 결정론 적용 ═════════════════════════════════════════════════════════
console.log('\n── D. 적용 ──');
{
  const plan = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'line:7' });
  const applied = buildRecipeApply({ source: SOURCE, plan, skeleton: SKELETON, values: {} });
  eq(applied.blocked, null, 'D1: 적용 성공');
  const text = applied.text ?? '';
  const lines = text.split('\n');

  // import는 본문이 아니라 파일 상단으로(hookCode 속 import hoist 계약 재사용)
  const importLine = lines.findIndex((l) => l.includes("from '@axiom/components/ui'"));
  const compLine = lines.findIndex((l) => l.includes('export default function'));
  ok(importLine >= 0 && importLine < compLine, 'D2: import가 컴포넌트 위로 hoist');
  ok(!/^\s+import\b/m.test(text), 'D3: 본문 중간에 박힌 import 없음');

  // 훅은 컴포넌트 본문에
  const hookLine = lines.findIndex((l) => l.includes('setPickerOpen'));
  ok(hookLine > compLine, 'D4: 훅은 컴포넌트 본문에 삽입');

  // JSX는 앵커 줄 앞에, 그 줄의 들여쓰기로
  const jsxLine = lines.findIndex((l) => l.includes('<div ref={pickerRef}'));
  ok(jsxLine >= 0 && lines[jsxLine].startsWith('      <div ref='), 'D5: JSX가 앵커 줄 들여쓰기에 맞춰 삽입');
  const inputLine = lines.findIndex((l) => l.includes('<input value={keyword}'));
  ok(jsxLine >= 0 && inputLine > jsxLine, 'D6: 앵커 줄(기존 input) **앞**에 들어간다');
  ok(applied.summary.some((s) => s.includes('삽입')), 'D7: 사람이 읽을 요약');

  // 선택 영역 교체 — 그 줄들이 사라지고 골격이 대신 들어간다
  const selPlan = buildRecipePlan({ source: SOURCE, skeleton: SKELETON, values: {}, cursorAnchor: 'sel:7-7' });
  const replaced = buildRecipeApply({ source: SOURCE, plan: selPlan, skeleton: SKELETON, values: {} });
  ok(!(replaced.text ?? '').includes('<input value={keyword}'), 'D8: 선택 영역은 교체된다(원본 줄 제거)');
  ok((replaced.text ?? '').includes('<div ref={pickerRef}'), 'D9: 그 자리에 골격이 들어간다');
  ok(replaced.summary.some((s) => s.includes('교체')), 'D10: 요약이 교체라고 말한다');

  // 슬롯 치환은 적용에도 그대로
  const sk = 'const {{name}}Ref = useRef(null);';
  const p2 = buildRecipePlan({ source: SOURCE, skeleton: sk, values: { name: 'picker' } });
  const a2 = buildRecipeApply({ source: SOURCE, plan: p2, skeleton: sk, values: { name: 'picker' } });
  ok((a2.text ?? '').includes('const pickerRef = useRef(null);'), 'D11: 칩 값이 치환된 채 삽입');

  // 막힌 계획은 적용하지 않는다
  const blockedPlan = buildRecipePlan({ source: '', skeleton: SKELETON, values: {} });
  ok(buildRecipeApply({ source: '', plan: blockedPlan, skeleton: SKELETON, values: {} }).text === null,
    'D12: 막힌 계획은 텍스트를 만들지 않는다');

  // 골격이 빠뜨린 import는 결정론 테이블로 보강한다(카드 작성자가 빠뜨려도 컴파일되게)
  const noImport = 'const [open, setOpen] = useState(false);\n<Badge>{open}</Badge>';
  const p4 = buildRecipePlan({ source: SOURCE, skeleton: noImport, values: {}, cursorAnchor: 'line:7' });
  const a4 = buildRecipeApply({ source: SOURCE, plan: p4, skeleton: noImport, values: {} });
  ok((a4.text ?? '').includes("from '@axiom/components/ui'"), 'D14: 골격이 안 쓴 UI 컴포넌트 import 보강');
  ok(/import React, \{[^}]*useState/.test(a4.text ?? ''), 'D15: 이미 있는 react import에 훅 병합(중복 import 없음)');

  // ★ 적용 직전 가드 — 계획이 어떻게 만들어졌든 화면 밖에는 절대 넣지 않는다(실측 사고의 마지막 방벽)
  const forged = { ...plan, anchor: { key: 'line:1', line: 1, endLine: null, label: '조작된 앵커' } };
  const guarded = buildRecipeApply({ source: SOURCE, plan: forged, skeleton: SKELETON, values: {} });
  ok((guarded.blocked ?? '').includes('화면(JSX) 밖'), 'D16: 화면 밖 앵커는 적용 단계에서도 거부');
  eq(guarded.text, null, 'D17: 거부되면 텍스트를 만들지 않는다');

  // CRLF 파일은 CRLF로 돌려준다(줄바꿈 혼용 방지)
  const crlf = SOURCE.replace(/\n/g, '\r\n');
  const p3 = buildRecipePlan({ source: crlf, skeleton: SKELETON, values: {}, cursorAnchor: 'line:7' });
  const a3 = buildRecipeApply({ source: crlf, plan: p3, skeleton: SKELETON, values: {} });
  ok((a3.text ?? '').includes('\r\n') && !/[^\r]\n/.test(a3.text ?? ''), 'D13: CRLF 보존');
}

// ═══ F. 요청 문장으로 자리 자동 찾기 (커서 수동 의존 제거) ══════════════════
console.log('\n── F. 위치 자동 제안 ──');
{
  // 날짜 입력이 들어 있는 화면 — "달력으로 바꿔줘"는 이 요소를 겨냥한다.
  const page = [
    "import React, { useState } from 'react';",
    '',
    'export default function EmployeePage(): React.ReactNode {',
    '  const [hireDate, setHireDate] = useState("");',
    '  return (',
    '    <div className="page">',
    '      <input value={keyword} />',
    '      <Input',
    '        type="date"',
    '        value={hireDate}',
    '        onChange={(e) => setHireDate(e.target.value)}',
    '      />',
    '    </div>',
    '  );',
    '}',
  ].join('\n');

  // 카드가 선언한 대상 힌트(`action.target`)가 사용자 문장과 함께 들어간다 —
  // "달력"에는 코드(`type="date"`)와 겹치는 글자가 없으므로 카드가 자기 대상을 말해줘야 한다.
  const TARGET = 'date 날짜 입력 input';
  const located = locateAnchors(page, '입사일 날짜 입력을 달력으로 바꿔줘', 'replace', TARGET);
  ok(located.length > 0, 'F1: 요청 문장만으로 자리를 찾는다(커서 불필요)');
  eq([located[0].line, located[0].endLine], [8, 12],
    'F2: ★여러 줄 컨트롤을 요소 단위로 잡는다 — 옆의 평범한 <input>(7줄)이 아니라 날짜 <Input>');
  ok(located[0].label.includes('date'), 'F3: 왜 이 자리인지 맞춘 토큰을 근거로 보여준다');
  ok(located.some((a) => a.endLine === null && a.line === 8), 'F4: 삽입 대안도 함께 제시(한 번의 클릭으로 전환)');

  const asInsert = locateAnchors(page, '입사일 날짜 입력을 달력으로 바꿔줘', 'insert', TARGET);
  eq(asInsert[0].endLine, null, 'F5: insert 카드면 삽입이 기본(순서만 바뀐다)');

  // 안전: 근거 토큰이 하나도 안 걸리면 후보를 만들지 않는다 → 커서·랜드마크로
  eq(locateAnchors(page, '안녕하세요', 'replace'), [], 'F6: 근거 없으면 자동 제안 안 함');
  eq(locateAnchors(page, '', 'replace'), [], 'F7: 빈 질문이면 자동 제안 안 함');
  // ★루트 요소는 자동 제안하지 않는다 — 교체하면 화면 전체가 사라진다.
  ok(!located.some((a) => a.line <= 6), 'F7b: 루트는 자동 제안 대상이 아니다');

  // 계획에서 우선순위: 자동 제안 > 요청 시점 커서 > 랜드마크
  const plan = buildRecipePlan({
    source: page, skeleton: SKELETON, values: {},
    query: '입사일 날짜 입력을 달력으로 바꿔줘', mode: 'replace', target: TARGET,
    cursorAnchor: 'line:7', // 커서는 엉뚱한 곳(첫 input)에 있었다
  });
  ok((plan.anchor?.endLine ?? null) !== null, 'F8: 커서가 있어도 요청으로 찾은 자리가 기본값');
  ok(plan.anchorChoices.some((a) => a.key === 'line:7'), 'F9: 커서 후보도 목록에 남는다(고를 수 있게)');

  // 사용자가 카드에서 명시적으로 고른 값은 자동 제안을 이긴다
  const chosen = buildRecipePlan({
    source: page, skeleton: SKELETON, values: {},
    query: '입사일 날짜 입력을 달력으로 바꿔줘', mode: 'replace', target: TARGET,
    cursorAnchor: 'line:7', anchorChoice: 'line:7',
  });
  eq(chosen.anchor?.key, 'line:7', 'F10: 명시적 선택이 최우선');

  // ★ 카드가 뜬 뒤 사용자가 커서를 옮기면(preferCursor) 그 자리가 자동 제안을 이긴다 —
  //   "카드를 띄워 놓고 커서를 옮겨 자리를 고른다"는 실사용 흐름.
  const moved = buildRecipePlan({
    source: page, skeleton: SKELETON, values: {},
    query: '입사일 날짜 입력을 달력으로 바꿔줘', mode: 'replace', target: TARGET,
    cursorAnchor: 'line:7', preferCursor: true,
  });
  eq(moved.anchor?.key, 'line:7', 'F11: 커서를 옮기면 그 자리가 기본값이 된다');
  ok(moved.anchorChoices.some((a) => a.key === 'sel:8-12'), 'F12: 자동 제안도 목록에 남는다(되돌릴 수 있게)');

  // 커서가 화면 밖(import 구역)이면 옮겼더라도 쓰지 않는다 — 안전 규칙이 우선.
  const movedOutside = buildRecipePlan({
    source: page, skeleton: SKELETON, values: {},
    query: '입사일 날짜 입력을 달력으로 바꿔줘', mode: 'replace', target: TARGET,
    cursorAnchor: 'line:1', preferCursor: true,
  });
  eq(movedOutside.anchor?.key, 'sel:8-12', 'F13: 화면 밖 커서는 옮겼어도 자동 제안으로 되돌아간다');
}

// ═══ E. 재실행 멱등성 (같은 카드를 두 번 넣어도 중복이 안 쌓인다) ═══════════
console.log('\n── E. 중복 방지 ──');
{
  // ★ 실측 사고: 첫 실행이 엉뚱한 자리에 넣어 다시 실행했더니, 이름 있는 선언(const·ref)은
  //   기존 중복 가드가 걸렀지만 **익명 문장(useEffect)은 그대로 또** 들어갔다.
  const skeleton = [
    "import { Badge } from '@axiom/components/ui';",
    '',
    'const [pickerOpen, setPickerOpen] = useState(false);',
    'useEffect(() => {',
    '  document.title = "x";',
    '}, []);',
    '',
    '<Badge>{pickerOpen}</Badge>',
  ].join('\n');

  const plan1 = buildRecipePlan({ source: SOURCE, skeleton, values: {}, cursorAnchor: 'line:7' });
  const once = buildRecipeApply({ source: SOURCE, plan: plan1, skeleton, values: {} });
  const applied = once.text ?? '';
  eq(once.blocked, null, 'E1: 첫 적용 성공');

  // 두 번째 실행 — 넣을 것이 하나도 없다
  const plan2 = buildRecipePlan({ source: applied, skeleton, values: {}, cursorAnchor: 'line:7' });
  ok((plan2.blocked ?? '').includes('이미'), 'E2: 두 번째 계획은 "이미 들어 있음"으로 막힌다');
  const twice = buildRecipeApply({ source: applied, plan: plan2, skeleton, values: {} });
  eq(twice.text, null, 'E3: 두 번째 적용은 아무 것도 쓰지 않는다');

  // useEffect가 한 번만 있어야 한다(익명 문장 중복의 회귀 가드)
  eq((applied.match(/document\.title = "x";/g) ?? []).length, 1, 'E4: 익명 문장은 한 번만');

  // 부분 중복 — 훅만 이미 있고 화면 조각은 없는 경우: 남은 것만 넣는다
  const hookOnly = 'const [pickerOpen, setPickerOpen] = useState(false);';
  const partialSrc = buildRecipeApply({
    source: SOURCE,
    plan: buildRecipePlan({ source: SOURCE, skeleton: hookOnly, values: {} }),
    skeleton: hookOnly,
    values: {},
  }).text ?? '';
  const partialPlan = buildRecipePlan({ source: partialSrc, skeleton, values: {}, cursorAnchor: 'line:7' });
  eq(partialPlan.blocked, null, 'E5: 일부만 있으면 막지 않는다');
  ok((partialPlan.notice ?? '').includes('중복 방지'), 'E6: 무엇을 건너뛰는지 카드가 밝힌다');
  const partial = buildRecipeApply({ source: partialSrc, plan: partialPlan, skeleton, values: {} });
  eq((partial.text ?? '').match(/const \[pickerOpen, setPickerOpen\]/g)?.length, 1, 'E7: 이미 있는 선언은 안 늘어난다');
  ok((partial.text ?? '').includes('<Badge>'), 'E8: 없던 화면 조각은 들어간다');
  ok(partial.summary.some((s) => s.includes('건너뜀')), 'E9: 요약이 건너뛴 것을 말한다');

  // 화면 조각만 이미 있는 경우 — 위치 칩은 비우고(고를 것 없음) 코드만 넣는다
  const jsxOnlySrc = buildRecipeApply({
    source: SOURCE,
    plan: buildRecipePlan({ source: SOURCE, skeleton: '<Badge>{1}</Badge>', values: {}, cursorAnchor: 'line:7' }),
    skeleton: '<Badge>{1}</Badge>',
    values: {},
  }).text ?? '';
  const jsxDup = buildRecipePlan({ source: jsxOnlySrc, skeleton: '<Badge>{1}</Badge>\n', values: {} });
  ok((jsxDup.blocked ?? '').includes('이미'), 'E10: 화면 조각만 있는 골격이 이미 있으면 막힌다');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
