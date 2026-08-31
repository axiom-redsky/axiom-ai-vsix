/**
 * 행동 카드(Action Card) Phase 0 테스트 — MiniYaml 부분집합 파서 + CardParser 검증.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §4.
 */
import { parseMiniYaml } from '../src/ai/actions/MiniYaml';
import { parseActionCard, findTriggerCollisions, splitCardFrontmatter } from '../src/ai/actions/CardParser';
import type { IActionCard } from '../src/ai/actions/types';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

// ═══ A. MiniYaml — YAML 부분집합 파서 ═══════════════════════════════════════
console.log('\n── A. MiniYaml ──');
{
  const { value, errors } = parseMiniYaml([
    'schemaVersion: 1                  # 스키마 진화 대비',
    'id: project-search-form',
    'title: "표준 검색폼 삽입"',
    'enabled: true',
    'ratio: 0.5',
    'triggers: [검색폼, 검색 조건, "a, b", search form]',
    'slots:',
    '  - name: formName',
    '    label: 폼 이름',
    '    source: text',
    '    prefillFrom: query',
    '  - name: mode',
    '    options: [list, form]',
    'action:',
    '  type: recipe',
    '  outputs: ["+ src/x.tsx"]',
  ].join('\n'));
  eq(errors, [], 'A1: 오류 없음');
  eq(value.schemaVersion, 1, 'A2: 숫자 승격 + 트레일링 주석 제거');
  eq(value.title, '표준 검색폼 삽입', 'A3: 따옴표 벗기기');
  eq(value.enabled, true, 'A4: 불리언 승격');
  eq(value.ratio, 0.5, 'A5: 소수 승격');
  eq(value.triggers, ['검색폼', '검색 조건', 'a, b', 'search form'], 'A6: 인라인 배열 — 따옴표 안 콤마 보존');
  const slots = value.slots as Array<Record<string, unknown>>;
  eq(slots.length, 2, 'A7: 객체 리스트 항목 수');
  eq(slots[0], { name: 'formName', label: '폼 이름', source: 'text', prefillFrom: 'query' }, 'A8: 리스트 항목 연속 키');
  eq(slots[1].options, ['list', 'form'], 'A9: 리스트 항목 안 인라인 배열');
  eq((value.action as Record<string, unknown>).type, 'recipe', 'A10: 중첩 객체');
}
{
  const { value, errors } = parseMiniYaml('t: "a # b"\nbad line no colon\nafter: ok');
  eq(value.t, 'a # b', 'A11: 따옴표 안 # 는 주석 아님');
  eq(errors.length, 1, 'A12: 문법 오류 보고');
  eq(value.after, 'ok', 'A13: 오류 이후 줄도 계속 파싱(fail-open)');
}
{
  const { errors } = parseMiniYaml('k: 1\nk: 2');
  ok(errors.some((e) => e.includes('중복 키')), 'A14: 중복 키 오류');
}
{
  const { value } = parseMiniYaml('list:\n  - alpha\n  - beta');
  eq(value.list, ['alpha', 'beta'], 'A15: 스칼라 리스트');
}

// ═══ B. 유효한 template 카드 (A2 페이지 위저드 원형) ═══════════════════════
console.log('\n── B. template 카드 ──');
const PAGE_CARD = `---
schemaVersion: 1
id: create-list-page
title: 목록 페이지 생성
icon: 📄
triggers: [목록, 리스트, 테이블, 조회 화면, 페이지]
preconditions: [scaffold-detected]
slots:
  - name: domain
    label: 도메인
    source: domain-list
    prefillFrom: query
  - name: pageName
    label: 이름
    source: text
    prefillFrom: query
  - name: pageType
    label: 유형
    source: enum
    options: [list, form, detail]
action:
  type: template
  template: page
  outputs: ["+ src/domains/{{domain}}/pages/{{pageName}}.tsx", "± src/domains/{{domain}}/router/index.tsx (경로 추가)"]
priority: 20
---

## 설명
스캐폴드 규약에 맞는 목록 페이지와 라우터 배선을 생성합니다.

## 비고
내부 메모.
`;
{
  const { card, issues } = parseActionCard(PAGE_CARD, { expectedId: 'create-list-page', layer: 'builtin', sourcePath: 'x/create-list-page.card.md' });
  ok(card !== null, 'B1: 카드 활성');
  eq(issues, [], 'B2: 이슈 없음 (pageType 미사용 슬롯도 template이라 경고 없음)');
  eq(card?.id, 'create-list-page', 'B3: id');
  eq(card?.priority, 20, 'B4: priority');
  eq(card?.icon, '📄', 'B5: icon');
  eq(card?.triggers.length, 5, 'B6: triggers');
  eq(card?.preconditions, ['scaffold-detected'], 'B7: preconditions');
  eq(card?.slots.map((s) => s.source), ['domain-list', 'text', 'enum'], 'B8: 슬롯 소스 3종');
  eq(card?.slots[2].options, ['list', 'form', 'detail'], 'B9: enum options');
  eq(card?.action.outputs, [
    { path: 'src/domains/{{domain}}/pages/{{pageName}}.tsx', kind: 'create' },
    { path: 'src/domains/{{domain}}/router/index.tsx', kind: 'modify', note: '경로 추가' },
  ], 'B10: outputs — +/± 마커·설명 파싱');
  eq(card?.description, '스캐폴드 규약에 맞는 목록 페이지와 라우터 배선을 생성합니다.', 'B11: ## 설명 섹션만 추출');
  eq(card?.layer, 'builtin', 'B12: 로더 부여 계층');
}
{
  // CRLF + BOM 허용
  const crlf = '﻿' + PAGE_CARD.replace(/\n/g, '\r\n');
  const { card } = parseActionCard(crlf, { expectedId: 'create-list-page' });
  ok(card !== null, 'B13: BOM+CRLF 원문도 파싱');
}

// ═══ C. 유효한 recipe 카드 (§4 예시) ════════════════════════════════════════
console.log('\n── C. recipe 카드 ──');
const RECIPE_CARD = `---
schemaVersion: 1
id: project-search-form
title: 표준 검색폼 삽입
icon: 🔍
triggers: [검색폼, 검색 조건, 조회 조건, search form]
preconditions: [file-open, scaffold-detected]
slots:
  - name: formName
    label: 폼 이름
    source: text
    prefillFrom: query
action:
  type: recipe
priority: 20
---

## 설명 (패널·카드에 표시)
우리 프로젝트 표준 검색폼. Select+Input+조회버튼 골격.

## 골격
\`\`\`tsx
const [{{formName}}Params, set{{formName}}Params] = useState<T{{formName}}Params>({});
\`\`\`
`;
{
  const { card, issues } = parseActionCard(RECIPE_CARD, { expectedId: 'project-search-form', layer: 'project' });
  ok(card !== null, 'C1: 카드 활성');
  eq(issues, [], 'C2: 이슈 없음');
  ok(card?.skeleton?.includes('{{formName}}Params') === true, 'C3: 골격 = 첫 코드펜스 내용');
  ok(card?.skeleton?.includes('```') === false, 'C4: 펜스 줄 제외');
  eq(card?.description, '우리 프로젝트 표준 검색폼. Select+Input+조회버튼 골격.', 'C5: 설명 섹션(제목 부가문 허용)');
}
{
  // 미사용 슬롯 경고는 recipe에만
  const unused = RECIPE_CARD.replace('const [{{formName}}Params, set{{formName}}Params] = useState<T{{formName}}Params>({});', 'const x = 1;');
  const { card, issues } = parseActionCard(unused, { expectedId: 'project-search-form' });
  ok(card !== null, 'C6: 미사용 슬롯은 warning — 카드 생존');
  ok(issues.some((i) => i.severity === 'warning' && i.message.includes('formName')), 'C7: 미사용 슬롯 경고');
}

// ═══ D. 검증 실패 (fail-open: 그 카드만 비활성) ═════════════════════════════
console.log('\n── D. 검증 ──');
function parseErr(raw: string, expectedId?: string) {
  return parseActionCard(raw, expectedId ? { expectedId } : {});
}
{
  const { card, issues } = parseErr('# frontmatter 없음\n본문뿐');
  ok(card === null && issues.some((i) => i.message.includes('frontmatter')), 'D1: frontmatter 없음 → 비활성');
}
{
  const noId = PAGE_CARD.replace('id: create-list-page\n', '');
  const { card, issues } = parseErr(noId);
  ok(card === null && issues.some((i) => i.field === 'id'), 'D2: id 누락 → 비활성');
}
{
  const { card, issues } = parseErr(PAGE_CARD, 'other-file-name');
  ok(card === null && issues.some((i) => i.message.includes('불일치')), 'D3: 파일명-id 불일치 → 비활성');
}
{
  const bad = PAGE_CARD.replace('type: template', 'type: wizard');
  const { card, issues } = parseErr(bad, 'create-list-page');
  ok(card === null && issues.some((i) => i.field === 'action.type'), 'D4: 모르는 action.type → 비활성');
}
{
  const noFence = RECIPE_CARD.replace(/```tsx[\s\S]*?```/, '(골격 없음)');
  const { card, issues } = parseErr(noFence, 'project-search-form');
  ok(card === null && issues.some((i) => i.message.includes('코드펜스')), 'D5: recipe 골격 없음 → 비활성');
}
{
  const noOpts = PAGE_CARD.replace('\n    options: [list, form, detail]', '');
  const { card, issues } = parseErr(noOpts, 'create-list-page');
  ok(card === null && issues.some((i) => i.message.includes('options')), 'D6: enum 슬롯 options 누락 → 비활성');
}
{
  const badSrc = PAGE_CARD.replace('source: domain-list', 'source: file-list');
  const { card, issues } = parseErr(badSrc, 'create-list-page');
  ok(card === null && issues.some((i) => i.message.includes('file-list')), 'D7: 미지원 슬롯 source → 비활성');
}
{
  const orphan = PAGE_CARD.replace('{{pageName}}', '{{pagename}}'); // 선언은 pageName
  const { card, issues } = parseErr(orphan, 'create-list-page');
  ok(card === null && issues.some((i) => i.message.includes('{{pagename}}')), 'D8: 슬롯 없는 플레이스홀더 → 비활성');
}
{
  const v2 = PAGE_CARD.replace('schemaVersion: 1', 'schemaVersion: 2');
  const { card, issues } = parseErr(v2, 'create-list-page');
  ok(card === null && issues.some((i) => i.field === 'schemaVersion'), 'D9: 미래 schemaVersion → 비활성(전방 호환)');
}
{
  const typo = PAGE_CARD.replace('icon: 📄', 'icon: 📄\nikon: x');
  const { card, issues } = parseErr(typo, 'create-list-page');
  ok(card !== null, 'D10: 모르는 최상위 필드 → 카드 생존');
  ok(issues.some((i) => i.severity === 'warning' && i.message.includes('ikon')), 'D11: 오타 필드 경고');
}
{
  const badPrio = PAGE_CARD.replace('priority: 20', 'priority: high');
  const { card, issues } = parseErr(badPrio, 'create-list-page');
  eq(card?.priority, 10, 'D12: priority 비숫자 → 경고 + 기본 10');
  ok(issues.some((i) => i.severity === 'warning' && i.field === 'priority'), 'D13: priority 경고');
}
{
  const badPre = PAGE_CARD.replace('[scaffold-detected]', '[scaffold-detected, needs-git]');
  const { card, issues } = parseErr(badPre, 'create-list-page');
  ok(card === null && issues.some((i) => i.message.includes('needs-git')), 'D14: 모르는 precondition → 비활성');
}
{
  const badPrefill = PAGE_CARD.replace('    prefillFrom: query\n  - name: pageName', '    prefillFrom: file\n  - name: pageName');
  const { card, issues } = parseErr(badPrefill, 'create-list-page');
  ok(card !== null && card.slots[0].prefillFrom === undefined, 'D15: 모르는 prefillFrom → 경고 + 프리필 생략');
  ok(issues.some((i) => i.severity === 'warning' && i.field?.includes('prefillFrom')), 'D16: prefillFrom 경고');
}
{
  const dupTrig = PAGE_CARD.replace('[목록, 리스트', '[목록, 목록, 리스트');
  const { card, issues } = parseErr(dupTrig, 'create-list-page');
  eq(card?.triggers.filter((t) => t === '목록').length, 1, 'D17: 카드 내 중복 트리거 dedupe');
  ok(issues.some((i) => i.severity === 'warning' && i.message.includes('중복 트리거')), 'D18: 중복 트리거 경고');
}
{
  const dupSlot = PAGE_CARD.replace('name: pageName', 'name: domain');
  const { card } = parseErr(dupSlot, 'create-list-page');
  ok(card === null, 'D19: 중복 슬롯 이름 → 비활성');
}
{
  const badOut = PAGE_CARD.replace('"+ src/domains/{{domain}}/pages/{{pageName}}.tsx"', '"src/domains/{{domain}}/pages/{{pageName}}.tsx"');
  const { card, issues } = parseErr(badOut, 'create-list-page');
  ok(card === null && issues.some((i) => i.field === 'action.outputs'), 'D20: outputs 마커(+/±) 누락 → 비활성');
}
{
  const noDoc = PAGE_CARD.replace('type: template\n  template: page', 'type: doc');
  const { card, issues } = parseErr(noDoc, 'create-list-page');
  ok(card === null && issues.some((i) => i.field === 'action.doc'), 'D21: doc 카드 action.doc 누락 → 비활성');
}
{
  ok(splitCardFrontmatter('본문만') === null, 'D22: splitCardFrontmatter — frontmatter 없으면 null');
}

// ═══ E. 카탈로그 트리거 충돌 ════════════════════════════════════════════════
console.log('\n── E. 트리거 충돌 ──');
function mkCard(id: string, triggers: string[], layer: IActionCard['layer']): IActionCard {
  return {
    schemaVersion: 1, id, title: id, icon: '🃏', triggers, preconditions: [], slots: [],
    action: { type: 'command', command: 'noop' }, priority: 10, description: '', layer,
  };
}
{
  const issues = findTriggerCollisions([
    mkCard('a-card', ['목록', '조회'], 'builtin'),
    mkCard('b-card', ['목록'], 'builtin'),
  ]);
  ok(issues.some((i) => i.severity === 'error' && i.cardId === 'b-card'), 'E1: 같은 계층 중복 → 나중 카드에 error');
}
{
  const issues = findTriggerCollisions([
    mkCard('a-card', ['목록'], 'builtin'),
    mkCard('p-card', ['목록'], 'project'),
  ]);
  ok(issues.every((i) => i.severity === 'warning'), 'E2: 계층 간 공유 → warning만(의도적 오버라이드 허용)');
  ok(issues.some((i) => i.message.includes('a-card') && i.message.includes('p-card')), 'E3: 관련 카드 id 명시');
}
{
  eq(findTriggerCollisions([mkCard('a-card', ['목록'], 'builtin'), mkCard('b-card', ['조회'], 'builtin')]), [], 'E4: 충돌 없음');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
