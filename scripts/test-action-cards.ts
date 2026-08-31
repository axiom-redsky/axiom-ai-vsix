/**
 * 행동 카드(Action Card) Phase 0 테스트 — MiniYaml 부분집합 파서 + CardParser 검증.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §4.
 */
import { parseMiniYaml } from '../src/ai/actions/MiniYaml';
import { parseActionCard, findTriggerCollisions, splitCardFrontmatter } from '../src/ai/actions/CardParser';
import { matchCards, listApplicableCards, prefillSlots, type ICardMatchContext } from '../src/ai/actions/CardMatcher';
import { loadCardsFromDir, finalizeCatalog } from '../src/ai/actions/CardCatalog';
import { buildCardsPayload, buildOutputViews, buildSlotViews, missingSlots, substituteSlots } from '../src/ai/actions/CardPlanView';
import { buildBindingPlan } from '../src/ai/actions/OfflineApiBinding';
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
function mkCard(id: string, triggers: string[], layer: IActionCard['layer'], extra: Partial<IActionCard> = {}): IActionCard {
  return {
    schemaVersion: 1, id, title: id, icon: '🃏', triggers, preconditions: [], slots: [],
    action: { type: 'command', command: 'noop' }, priority: 10, description: '', layer, ...extra,
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

// ═══ F. 파서 — 한 글자 트리거 경고 ══════════════════════════════════════════
console.log('\n── F. 한 글자 트리거 ──');
{
  const single = PAGE_CARD.replace('[목록, 리스트', '[폼, 목록, 리스트');
  const { card, issues } = parseActionCard(single, { expectedId: 'create-list-page' });
  ok(card !== null, 'F1: 한 글자 트리거는 warning — 카드 생존');
  ok(issues.some((i) => i.severity === 'warning' && i.message.includes('한 글자')), 'F2: 경고 발생');
}

// ═══ G. CardMatcher — 매칭·정렬·확신도 게이트 ═══════════════════════════════
console.log('\n── G. 매칭 엔진 ──');
const CTX: ICardMatchContext = { fileOpen: true, scaffoldDetected: true };
{
  // 복합(긴) 트리거가 더 무겁다 + 확신도 게이트 plan
  const rec = matchCards('가나다라마바 해줘', [
    mkCard('long-card', ['가나다라마바'], 'builtin'),
    mkCard('short-card', ['가나'], 'builtin'),
  ], CTX);
  eq(rec.matches.map((m) => m.card.id), ['long-card', 'short-card'], 'G1: 긴 트리거 우선 정렬');
  eq(rec.matches[0].score, 6, 'G2: 가중치 = 압축 길이');
  eq(rec.mode, 'plan', 'G3: 격차 (6-2)/6=0.67 ≥ 0.5 → plan');
}
{
  // 애매하면 list (보수적 시작)
  const rec = matchCards('가나다 해줘', [
    mkCard('a-card', ['가나다'], 'builtin'),
    mkCard('b-card', ['나다'], 'builtin'),
  ], CTX);
  eq(rec.mode, 'list', 'G4: 격차 (3-2)/3=0.33 < 0.5 → list');
  const strict = matchCards('가나다 해줘', [
    mkCard('a-card', ['가나다'], 'builtin'),
    mkCard('b-card', ['나다'], 'builtin'),
  ], CTX, { planGapRatio: 0.3 });
  eq(strict.mode, 'plan', 'G5: 임계 옵션 조정 반영');
}
{
  // 단독 매칭 = plan / 무매칭 = none
  eq(matchCards('가나 해줘', [mkCard('a-card', ['가나'], 'builtin')], CTX).mode, 'plan', 'G6: 단독 매칭 → plan');
  eq(matchCards('안녕', [mkCard('a-card', ['가나'], 'builtin')], CTX).mode, 'none', 'G7: 무매칭 → none');
}
{
  // 동점 계층 가점: project > builtin
  const rec = matchCards('가나 해줘', [
    mkCard('b-builtin', ['가나'], 'builtin'),
    mkCard('p-project', ['가나'], 'project'),
  ], CTX);
  eq(rec.matches[0].card.id, 'p-project', 'G8: 동점이면 상위 계층 우선');
}
{
  // 공백변형 매칭 + 이중 가산 방지
  const rec = matchCards('검색조건 넣어줘', [mkCard('s-card', ['검색 조건'], 'builtin')], CTX);
  eq(rec.matches[0]?.score, 4, 'G9: "검색 조건" ↔ "검색조건" 공백변형 매칭');
  const dup = matchCards('useapi 알려줘', [mkCard('d-card', ['useapi', 'use api'], 'builtin')], CTX);
  eq(dup.matches[0]?.score, 6, 'G10: 압축 동형 트리거 이중 가산 방지');
}
{
  // 어절 단위 매칭 — 조사·어미·어순이 끼어도 걸린다(붙어 있을 필요 없음)
  const card = [mkCard('t-card', ['화면 만들'], 'builtin')];
  eq(matchCards('화면을 만들어줘', card, CTX).mode, 'plan', 'G14: 조사(을)가 껴도 매칭');
  eq(matchCards('화면 만들어주세요', card, CTX).mode, 'plan', 'G15: 어미 변화 흡수');
  eq(matchCards('목록 화면 하나 만들래', card, CTX).mode, 'plan', 'G16: 어절 사이 다른 말이 껴도 매칭');
  eq(matchCards('화면 보여줘', card, CTX).mode, 'none', 'G17: 어절 하나만 있으면 매칭 아님(전부 포함 필요)');
  eq(matchCards('만들어줘', card, CTX).mode, 'none', 'G18: 나머지 어절 없으면 매칭 아님');
  eq(matchCards('화면 만들어줘', [mkCard('u-card', ['화 면'], 'builtin')], CTX).mode, 'none', 'G19: 한 글자 어절 트리거는 무시(오탐원)');
}
{
  // 한 글자 트리거 무시 + precondition 필터 + topN 상한
  eq(matchCards('플랫폼 정리', [mkCard('f-card', ['폼'], 'builtin')], CTX).mode, 'none', 'G11: 한 글자 트리거 무시("플랫폼" 오탐 차단)');
  const pre = matchCards('가나 해줘', [
    mkCard('needs-file', ['가나'], 'builtin', { preconditions: ['file-open'] }),
  ], { fileOpen: false, scaffoldDetected: true });
  eq(pre.mode, 'none', 'G12: precondition 미충족 카드 제외');
  const many = matchCards('가나 해줘', [
    mkCard('c1', ['가나'], 'builtin'), mkCard('c2', ['가나'], 'builtin'),
    mkCard('c3', ['가나'], 'builtin'), mkCard('c4', ['가나'], 'builtin'),
  ], CTX);
  eq(many.matches.length, 3, 'G13: topN 기본 3 상한');
}

// ═══ H. 슬롯 프리필 ═════════════════════════════════════════════════════════
console.log('\n── H. 프리필 ──');
{
  const slots: IActionCard['slots'] = [
    { name: 'domain', label: '도메인', source: 'domain-list', prefillFrom: 'query' },
    { name: 'pageName', label: '이름', source: 'text', prefillFrom: 'query' },
    { name: 'pageType', label: '유형', source: 'enum', options: ['목록', '폼', '상세'], prefillFrom: 'query' },
  ];
  eq(prefillSlots('account 도메인에 EmployeeList 목록 페이지 만들어줘', slots, CTX),
    { domain: 'account', pageName: 'EmployeeList', pageType: '목록' }, 'H1: 도메인+PascalCase 이름+enum 동시 프리필');
  eq(prefillSlots('직원 목록 페이지 만들어줘', slots, CTX),
    { pageType: '목록' }, 'H2: 없는 것은 채우지 않음(실패 슬롯 키 없음)');
  eq(prefillSlots('src/EmployeeList.tsx 참고해서 폼 페이지', slots, CTX),
    { pageType: '폼' }, 'H3: 파일 경로 참조는 이름 후보에서 제외');
}
{
  const slots: IActionCard['slots'] = [
    { name: 'endpoint', label: '엔드포인트', source: 'endpoint-list', prefillFrom: 'query' },
    { name: 'comp', label: '컴포넌트', source: 'component-list', prefillFrom: 'query' },
  ];
  const ctx: ICardMatchContext = { ...CTX, components: ['SmartTable', 'Button'] };
  eq(prefillSlots('/api/employees 를 SmartTable로 바인딩', slots, ctx),
    { endpoint: '/api/employees', comp: 'SmartTable' }, 'H4: API 경로 리터럴+컴포넌트 목록 프리필');
  eq(prefillSlots('테이블 바인딩 해줘', slots, ctx), {}, 'H5: 신호 없으면 빈 프리필');
}

// ═══ I. 실 내장 카드 카탈로그 + 시나리오 드라이런 ═══════════════════════════
console.log('\n── I. 내장 카드 ──');
{
  const loaded = loadCardsFromDir('media/action-cards', 'builtin');
  eq(loaded.issues.filter((i) => i.severity === 'error'), [], 'I1: 내장 카드 4장 전부 검증 통과');
  eq(loaded.cards.map((c) => c.id).sort(), ['api-table-binding', 'create-page', 'insert-date-picker', 'use-api-doc'], 'I2: 카드 id 목록');
  const { cards, issues } = finalizeCatalog(loaded.cards);
  eq(issues.filter((i) => i.severity === 'error'), [], 'I3: 트리거 충돌 없음');
  eq(cards.length, 4, 'I4: 전원 생존');

  // 시나리오 1 — 계획서 장면 2: 행동성 요청 → 계획 카드
  const s1 = matchCards('직원 목록 페이지 만들어줘', cards, { fileOpen: false, scaffoldDetected: true });
  eq(s1.mode, 'plan', 'I5: "직원 목록 페이지 만들어줘" → plan');
  eq(s1.matches[0].card.id, 'create-page', 'I6: create-page 선정');
  eq(s1.matches[0].prefill, { pageType: '목록' }, 'I7: 유형 칩 프리필');
  ok(s1.matches[0].matchedTriggers.includes('목록 페이지'), 'I8: 근거 하이라이트용 트리거 기록');

  // 시나리오 2 — 파일 열림 여부가 recipe 노출을 가른다
  eq(matchCards('달력으로 바꿔줘', cards, CTX).matches[0]?.card.id, 'insert-date-picker', 'I9: 달력 → recipe 카드');
  eq(matchCards('달력으로 바꿔줘', cards, { fileOpen: false, scaffoldDetected: true }).mode, 'none', 'I10: 파일 안 열림 → recipe 제외');

  // 시나리오 3 — 바인딩 + 엔드포인트 프리필
  const s3 = matchCards('테이블에 /api/employees 바인딩해줘', cards, CTX);
  eq(s3.matches[0].card.id, 'api-table-binding', 'I11: 바인딩 카드 선정');
  eq(s3.matches[0].prefill, { endpoint: '/api/employees' }, 'I12: 엔드포인트 칩 프리필');

  // 시나리오 4 — 애매하면 컴팩트 리스트 (장면 2′)
  const s4 = matchCards('페이지 api 연동', cards, CTX);
  eq(s4.mode, 'list', 'I13: 신호 갈림 → list');
  ok(s4.matches.length >= 2, 'I14: 후보 2장 이상');

  // 시나리오 5 — doc 카드·무매칭
  eq(matchCards('useApi 사용법이 궁금해', cards, CTX).matches[0]?.card.id, 'use-api-doc', 'I15: doc 카드 매칭');
  eq(matchCards('안녕하세요', cards, CTX).mode, 'none', 'I16: 잡담 → none(기존 폴백으로)');

  // 시나리오 6 — 한국어 조사·어미가 붙어도 같은 요청은 같게 인식해야 한다(라이브에서 발각된 비대칭).
  // "페이지 만들어줘"는 뜨는데 "화면을 만들어줘"는 안 뜨던 문제의 회귀 가드.
  for (const q of [
    '직원 목록 화면을 만들어줘',
    '직원 목록 화면 만들어줘',
    '직원 목록 페이지를 만들어주세요',
    '직원 목록 페이지 만들어줘',
    '직원 목록 화면 생성해줘',
  ]) {
    const r = matchCards(q, cards, { fileOpen: false, scaffoldDetected: true });
    ok(r.matches[0]?.card.id === 'create-page', `I17: "${q}" → 페이지 생성 카드`);
  }
}

// ═══ J. 계획 카드 뷰 변환 (Phase 1) ═════════════════════════════════════════
console.log('\n── J. 계획 카드 뷰 ──');
{
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const page = cards.find((c) => c.id === 'create-page')!;

  eq(substituteSlots('src/domains/{{domain}}/pages/{{pageName}}.tsx', { domain: 'main' }),
    'src/domains/main/pages/{{pageName}}.tsx', 'J1: 미정 슬롯은 {{…}}로 남는다(미정 가시화)');

  const partial = { pageType: '목록' };
  eq(buildSlotViews(page, partial).map((s) => [s.label, s.value]),
    [['도메인', null], ['이름', null], ['유형', '목록']], 'J2: 슬롯 칩 — 미정은 null');
  eq(missingSlots(page, partial), ['domain', 'pageName'], 'J3: 실행 시 되물을 슬롯만 남는다');

  const full = { domain: 'main', pageName: 'EmployeeListPage', pageType: '목록' };
  eq(buildOutputViews(page, full), [
    { kind: 'create', path: 'src/domains/main/pages/EmployeeListPage.tsx' },
    { kind: 'modify', path: 'src/domains/main/router/index.tsx', note: '경로 추가' },
  ], 'J4: 칩이 다 차면 출력 미리보기가 실제 경로로 확정');
  eq(missingSlots(page, full), [], 'J5: 프리필 완전 → 되묻기 0(클릭 1번 실행)');

  const rec = matchCards('직원 목록 페이지 만들어줘', cards, { fileOpen: false, scaffoldDetected: true });
  const values = new Map(rec.matches.map((m) => [m.card.id, { ...m.prefill }]));
  const payload = buildCardsPayload('req-1', '직원 목록 페이지 만들어줘', 'plan', rec.matches, values);
  eq(payload.mode, 'plan', 'J6: 페이로드 모드');
  eq(payload.cards[0].cardId, 'create-page', 'J7: 계획 카드 = top1');
  eq(payload.cards[0].executeLabel, '⏎ 이대로 만들기', 'J8: template 실행 라벨');
  ok(payload.cards[0].matchedTriggers.length > 0, 'J9: 근거 트리거 전달');
  eq(payload.cards[0].slots.find((s) => s.name === 'pageType')?.value, '목록', 'J10: 프리필이 칩 값으로');

  const recipe = cards.find((c) => c.id === 'insert-date-picker')!;
  const rv = buildCardsPayload('req-2', 'x', 'plan', [{ card: recipe, score: 1, matchedTriggers: ['달력'], prefill: {} }], new Map());
  eq(rv.cards[0].executeLabel, '골격 안내 보기', 'J11: recipe 실행 라벨');
  ok(!!rv.cards[0].skeleton, 'J12: recipe 골격 전달(코드 미리보기)');
  eq(rv.cards[0].outputs, [], 'J13: recipe는 출력 행 없음');

  const docCard = cards.find((c) => c.id === 'use-api-doc')!;
  const dv = buildCardsPayload('req-3', 'x', 'plan', [{ card: docCard, score: 1, matchedTriggers: ['useapi'], prefill: {} }], new Map());
  eq(dv.cards[0].executeLabel, '문서 보기', 'J14: doc 실행 라벨');
  eq(dv.cards[0].slots, [], 'J15: doc은 슬롯 없음');
}

// ═══ K. 출력 미리보기 해석기 — 실행기 파생(정적 선언 오버라이드) ═════════════
// 실제 출력이 워크스페이스 상태로 갈리는 카드(새 도메인이면 루트 라우터까지 3개)를
// 정적 outputs로는 표현 못 해 미리보기가 실제보다 적게 말하던 결함(라이브 검증에서 발각)의 회귀 가드.
console.log('\n── K. 출력 미리보기 해석기 ──');
{
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const page = cards.find((c) => c.id === 'create-page')!;
  const match = { card: page, score: 8, matchedTriggers: ['페이지'], prefill: {} };
  const values = new Map([['create-page', { domain: 'employee', pageName: 'EmployeeList', pageType: '목록' }]]);

  // 새 도메인 시나리오(B) — 실행기가 3개 액션을 만든다고 보고하는 상황
  const newDomainRows = [
    { kind: 'create' as const, path: 'src/domains/employee/pages/EmployeeList.tsx' },
    { kind: 'create' as const, path: 'src/domains/employee/router/index.tsx', note: '도메인 라우터 신규' },
    { kind: 'modify' as const, path: 'src/shared/router/index.tsx', note: '루트 라우터에 도메인 등록' },
  ];
  const withResolver = buildCardsPayload('req-k1', 'x', 'plan', [match], values, { hooks: { outputs: () => newDomainRows } });
  eq(withResolver.cards[0].outputs, newDomainRows, 'K1: 해석기가 정적 선언을 오버라이드(루트 라우터 행 포함)');
  eq(withResolver.cards[0].outputs.length, 3, 'K2: 새 도메인이면 3행 — 실행 결과와 일치');

  // 해석기가 null(도메인 미정·미지원 템플릿) → 카드의 정적 선언으로 양보
  const fallback = buildCardsPayload('req-k2', 'x', 'plan', [match], values, { hooks: { outputs: () => null } });
  eq(fallback.cards[0].outputs, buildOutputViews(page, values.get('create-page')!), 'K3: null이면 정적 outputs로 양보');
  eq(fallback.cards[0].outputs.length, 2, 'K4: 정적 선언은 기존 도메인 기준 2행');

  // 해석기 미주입(테스트·미래 호출부)도 종전과 동일
  const none = buildCardsPayload('req-k3', 'x', 'plan', [match], values);
  eq(none.cards[0].outputs.length, 2, 'K5: 해석기 없으면 종전 동작(회귀 0)');
}

// ═══ L. 슬롯 인라인 편집 재료 ═══════════════════════════════════════════════
// "카드 안에서 바로 고르기"(§3.6 칩 편집기) — 후보가 적으면 인라인, 많으면 QuickPick 위임.
console.log('\n── L. 슬롯 편집기 ──');
{
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const page = cards.find((c) => c.id === 'create-page')!;

  // 해석기 미주입 = 전부 호스트 위임(종전 동작)
  eq(buildSlotViews(page, {}).map((s) => s.inline), [false, false, false], 'L1: 해석기 없으면 전부 QuickPick 위임');

  // 호스트 정책 시뮬레이션: 후보 12개 이하만 인라인
  const LIMIT = 12;
  const domains = ['admin', 'auth', 'dashboard', 'employee', 'example', 'main'];
  const many = Array.from({ length: 53 }, (_, i) => `Comp${i}`);
  const resolver = (_card: IActionCard, slot: IActionCard['slots'][number]) => {
    // 카드가 스스로 선언한 규칙이 source 기본값을 이긴다(운영 _slotEditor와 동일 정책).
    if (slot.pattern) {
      return { inline: true, options: [], allowCustom: true, pattern: slot.pattern, patternHint: slot.hint };
    }
    if (slot.source === 'enum') return { inline: true, options: slot.options ?? [], allowCustom: false };
    if (slot.source === 'domain-list') {
      return domains.length <= LIMIT
        ? { inline: true, options: domains, allowCustom: true, pattern: '^[a-z][a-z0-9-]*$' }
        : { inline: false };
    }
    if (slot.source === 'component-list') {
      return many.length <= LIMIT ? { inline: true, options: many } : { inline: false };
    }
    return { inline: true, options: [], allowCustom: true, placeholder: slot.label };
  };

  const views = buildSlotViews(page, { pageType: '목록' }, resolver);
  eq(views.map((s) => s.inline), [true, true, true], 'L2: 도메인(6)·이름(text)·유형(enum) 모두 인라인');
  eq(views[0].options, domains, 'L3: 도메인 후보 전달');
  eq(views[0].allowCustom, true, 'L4: 새 도메인 직접 입력 허용');
  eq(views[1].options, [], 'L5: 자유 입력은 후보 없음');
  eq(views[2].options, ['목록', '폼', '상세'], 'L6: enum 후보는 카드 선언 그대로');
  eq(views[2].allowCustom, false, 'L7: enum은 후보 밖 값 금지');
  eq(views[2].value, '목록', 'L8: 값은 편집 재료와 무관하게 유지');

  // 항목이 많은 목록은 인라인 대신 QuickPick(검색 필요)
  const compCard: IActionCard = {
    ...page, id: 'c', slots: [{ name: 'comp', label: '컴포넌트', source: 'component-list' }],
  };
  eq(buildSlotViews(compCard, {}, resolver)[0].inline, false, 'L9: 53종 컴포넌트는 QuickPick 위임');

  // 카드가 선언한 pattern/hint가 슬롯 뷰까지 전달된다(이름 칸 확장자 입력 차단의 근거).
  const nameView = views[1];
  ok(!!nameView.pattern, 'L10: 카드 선언 pattern 전달');
  ok(!!nameView.patternHint, 'L11: 카드 선언 hint 전달');
  const nameRe = new RegExp(nameView.pattern!);
  ok(!nameRe.test('Employ.tsx'), 'L12: 확장자 포함 이름 거부');
  ok(!nameRe.test('직원목록'), 'L13: 한글 이름 거부(영문 식별자 필요)');
  ok(nameRe.test('EmployeeList') && nameRe.test('employee-list'), 'L14: PascalCase·kebab 허용(정규화로 흡수)');
}

// ═══ M. 슬롯 pattern/hint 스키마 (카드가 자기 규칙을 선언) ═══════════════════
console.log('\n── M. 슬롯 검증 선언 ──');
{
  const withPattern = PAGE_CARD.replace(
    '    source: text\n    prefillFrom: query',
    '    source: text\n    prefillFrom: query\n    pattern: "^[A-Za-z][A-Za-z0-9]*$"\n    hint: "영문만"',
  );
  const { card, issues } = parseActionCard(withPattern, { expectedId: 'create-list-page' });
  eq(issues, [], 'M1: pattern/hint는 유효 필드');
  eq(card?.slots[1].pattern, '^[A-Za-z][A-Za-z0-9]*$', 'M2: pattern 파싱');
  eq(card?.slots[1].hint, '영문만', 'M3: hint 파싱');

  const badRe = PAGE_CARD.replace(
    '    source: text\n    prefillFrom: query',
    '    source: text\n    prefillFrom: query\n    pattern: "^[unclosed"',
  );
  const bad = parseActionCard(badRe, { expectedId: 'create-list-page' });
  ok(bad.card === null && bad.issues.some((i) => i.field?.includes('pattern')), 'M4: 깨진 정규식 → 카드 비활성(로드 시점 차단)');

  const hintOnly = PAGE_CARD.replace(
    '    source: text\n    prefillFrom: query',
    '    source: text\n    prefillFrom: query\n    hint: "짝 없는 힌트"',
  );
  const ho = parseActionCard(hintOnly, { expectedId: 'create-list-page' });
  ok(ho.card !== null && ho.issues.some((i) => i.severity === 'warning' && i.field?.includes('hint')), 'M5: pattern 없는 hint는 경고');

  // 실제 내장 카드도 규칙을 선언하고 있어야 한다(이번 수정의 회귀 가드).
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const realName = cards.find((c) => c.id === 'create-page')!.slots.find((s) => s.name === 'pageName')!;
  ok(!!realName.pattern && !!realName.hint, 'M6: create-page 카드가 이름 규칙을 선언');
}

// ═══ N. 카탈로그 안전망 — 매칭 0일 때 절벽 대신 계단 ═════════════════════════
// 정확도와 별개의 축: 트리거가 안 걸려도 "다른 파이프라인으로 이동"이 아니라 "메뉴가 뜬다"로 끝나야 한다.
console.log('\n── N. 카탈로그 안전망 ──');
{
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);

  // 트리거가 하나도 안 걸리는 행동 요청(말투가 카드 어휘와 어긋난 경우)
  const q = '직원 뭐시기 하나 뚝딱 뽑아줘';
  eq(matchCards(q, cards, CTX).mode, 'none', 'N1: 트리거 매칭은 0');

  const safety = listApplicableCards(q, cards, CTX);
  eq(safety.mode, 'list', 'N2: 안전망은 항상 리스트(계획 카드로 단정하지 않음)');
  eq(safety.matches.length, 4, 'N3: 상황에 맞는 카드 전부 노출');
  eq(safety.matches.every((m) => m.matchedTriggers.length === 0), true, 'N4: 근거 없음을 그대로 표기(꾸미지 않음)');
  eq(safety.matches.every((m) => m.score === 0), true, 'N5: 점수 0');

  // precondition은 안전망에서도 지켜진다 — 파일이 없으면 파일 편집 카드는 빼야 한다.
  const noFile = listApplicableCards(q, cards, { fileOpen: false, scaffoldDetected: true });
  eq(noFile.matches.some((m) => m.card.id === 'insert-date-picker'), false, 'N6: file-open 미충족 카드 제외');
  eq(noFile.matches.some((m) => m.card.id === 'create-page'), true, 'N7: 조건 맞는 카드는 유지');

  // 정렬은 계층 → priority → id (결정론)
  eq(noFile.matches.map((m) => m.card.id), ['create-page', 'use-api-doc'], 'N8: priority 내림차순 결정론 정렬');

  // 스캐폴드가 아니면 안전망도 비어야 한다(엉뚱한 워크스페이스에서 메뉴만 띄우지 않음)
  eq(listApplicableCards(q, cards, { fileOpen: true, scaffoldDetected: false }).mode, 'none', 'N9: 조건 맞는 카드 없으면 none');

  // 프리필은 안전망에서도 동작 — 고른 뒤 계획 카드로 펼치면 이미 채워져 있다.
  const pre = listApplicableCards('account 도메인에 목록 페이지', cards, CTX);
  const page = pre.matches.find((m) => m.card.id === 'create-page')!;
  eq(page.prefill, { domain: 'account', pageType: '목록' }, 'N10: 안전망도 슬롯 프리필 수행');
}

// ═══ O. binding 카드 — 매핑 테이블이 카드 본문 ═══════════════════════════════
// 계획이 워크스페이스 상태(현재 파일·스펙)로 갈리므로 정적 선언이 아니라 **호스트 파생**이다.
// K(출력 미리보기)와 같은 원칙: 카드 파일에 조건 문법을 넣지 않고 해석기로 푼다.
console.log('\n── O. binding 카드 ──');
{
  const raw = [
    '---', 'id: x-bind', 'title: 바인딩', 'triggers: [바인딩]',
    'action:', '  type: binding', '  binding: api-table', '---', '', '## 설명', '표에 API 연결',
  ].join('\n');
  const parsed = parseActionCard(raw, { expectedId: 'x-bind' });
  eq(parsed.card?.action.type, 'binding', 'O1: binding 액션 타입 파싱');
  eq(parsed.card?.action.binding, 'api-table', 'O2: 바인딩 레시피 id 보존');

  const noId = parseActionCard(raw.replace('  binding: api-table\n', ''), { expectedId: 'x-bind' });
  eq(noId.card, null, 'O3: binding id 없으면 비활성(호스트가 해석할 대상이 없음)');

  // 내장 카드가 실제로 binding으로 선언돼 있는지(카드 파일 ↔ 실행기 계약)
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const bind = cards.find((c) => c.id === 'api-table-binding')!;
  eq(bind.action.type, 'binding', 'O4: 내장 api-table-binding 카드가 binding 유형');
  eq(bind.action.binding, 'api-table', 'O5: 내장 카드의 레시피 id');

  // 계획 → 카드 뷰: 확신한 행은 채워서, 애매한 행만 후보와 함께 남는다.
  const plan = buildBindingPlan({
    source: [
      'export default function P() {',
      '  const rows = [];',
      '  return (<table><thead><tr><th>이름</th><th>부서</th></tr></thead>',
      '    <tbody>{rows.map((r) => (<tr key={r.id}><td>{r.name}</td><td>{r.dept}</td></tr>))}</tbody></table>);',
      '}',
    ].join('\n'),
    specText: '### GET `/api/employees`\n\n**Response**\n```json\n{ "data": [{ "id": 1, "name": "김", "department": "개발" }] }\n```',
    endpoint: '/api/employees',
  });
  const match = { card: bind, score: 6, matchedTriggers: ['바인딩'], prefill: { endpoint: '/api/employees' } };
  const values = new Map([['api-table-binding', { endpoint: '/api/employees' }]]);
  const payload = buildCardsPayload('req-o1', 'x', 'plan', [match], values, { hooks: { binding: () => plan } });
  const view = payload.cards[0].binding!;
  eq(view.rows.map((r) => r.how), ['exact', 'choose'], 'O6: 확신한 행/애매한 행 구분해 렌더');
  eq(view.rows[0].apiField, 'name', 'O7: 확신한 행은 채워진 채로');
  eq(view.pendingCount, 1, 'O8: 미정 행 수 = 실행 잠금 근거');
  eq(view.typeName, 'TEmployee', 'O9: 만들어질 타입 이름 노출');
  eq(view.envelopeKey, 'data', 'O10: 봉투 키 노출(useApi 제네릭 표시용)');
  ok((view.rows[1].candidates ?? []).includes('department'), 'O11: 애매한 행에 후보 제공');

  // 선택을 반영하면 그 자리가 채워지고 잠금이 풀린다(호스트가 진실의 원천).
  const chosen = buildCardsPayload('req-o2', 'x', 'plan', [match], values, {
    hooks: { binding: () => plan, choices: new Map([['api-table-binding', { dept: 'department' }]]) },
  }).cards[0].binding!;
  eq(chosen.rows[1].apiField, 'department', 'O12: 선택이 카드에 반영');
  eq(chosen.pendingCount, 0, 'O13: 다 정하면 실행 가능');

  // 해석기 미주입(비-binding 카드·테스트)은 종전과 동일 — binding 필드 자체가 없다.
  const bare = buildCardsPayload('req-o3', 'x', 'plan', [match], values);
  eq(bare.cards[0].binding, undefined, 'O14: 해석기 없으면 본문 없음(회귀 0)');
  eq(bare.cards[0].executeLabel, '⏎ 이 매핑대로 적용', 'O15: 유형별 실행 라벨');
}

// ═══ P. [다른 작업 ▾] — 계획 카드의 탈출구 ═══════════════════════════════════
// §3.6 장면 2: "틀려도 칩을 고치거나 [다른 작업 ▾]을 열면 그만". 매칭이 **한 장뿐일 때도**
// 다른 작업으로 갈 수 있어야 한다 — 라이브에서 계획 카드가 막히자(스펙에 목록 응답 없음)
// 클릭할 것이 하나도 없었다(= 빗나감이 절벽).
console.log('\n── P. 다른 작업(카탈로그 탈출구) ──');
{
  const { cards } = finalizeCatalog(loadCardsFromDir('media/action-cards', 'builtin').cards);
  const ctx: ICardMatchContext = { fileOpen: true, scaffoldDetected: true, domains: ['main'] };
  const rec = matchCards('테이블에 /api/employees 바인딩해줘', cards, ctx);
  eq(rec.mode, 'plan', 'P1: 확신 매칭 = 계획 카드 1장');
  eq(rec.matches.length, 1, 'P2: 매칭은 한 장뿐');

  const shown = new Set(rec.matches.map((m) => m.card.id));
  const more = listApplicableCards('테이블에 /api/employees 바인딩해줘', cards, ctx)
    .matches.filter((m) => !shown.has(m.card.id));
  const values = new Map(rec.matches.concat(more).map((m) => [m.card.id, { ...m.prefill }]));
  const payload = buildCardsPayload('req-p1', 'x', 'plan', rec.matches, values, { more });

  eq(payload.cards.length, 1, 'P3: 계획 카드는 그대로 한 장');
  ok((payload.moreCards ?? []).length > 0, 'P4: 매칭이 한 장이어도 다른 작업이 딸려온다');
  ok(!(payload.moreCards ?? []).some((c) => c.cardId === payload.cards[0].cardId), 'P5: 추천 카드는 중복되지 않는다');
  ok((payload.moreCards ?? []).every((c) => c.matchedTriggers.length === 0), 'P6: 근거 없음 표기 유지(꾸미지 않음)');
  ok((payload.moreCards ?? []).some((c) => c.cardId === 'create-page'), 'P7: 상황에 맞는 카드가 포함');

  // 전제조건은 다른 작업 목록에도 적용된다 — 파일이 없으면 파일 편집 카드는 안 나온다.
  const noFileCtx: ICardMatchContext = { fileOpen: false, scaffoldDetected: true, domains: ['main'] };
  const noFileMore = listApplicableCards('x', cards, noFileCtx).matches;
  ok(!noFileMore.some((m) => m.card.id === 'insert-date-picker'), 'P8: 전제조건 미충족 카드는 제외');

  // more 미주입(구 호출부·테스트) → 종전 동작
  eq(buildCardsPayload('req-p2', 'x', 'plan', rec.matches, values).moreCards, undefined, 'P9: 미주입이면 필드 없음(회귀 0)');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
