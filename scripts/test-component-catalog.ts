/**
 * 컴포넌트 카탈로그(B1) 테스트 — 조립 · 파싱 · 스니펫 · 검색.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 B1.
 *
 * 이 하니스가 지키려는 것:
 *  ① **패밀리 묶기**(A) — Select* 10개가 목록을 잡아먹으면 "훑어보기"라는 목적 자체가 깨진다.
 *  ② **합집합**(C) — props 인덱스에 없는 문서 전용 부품(Alert·Form…)이 빠지면 부품 목록이 아니다.
 *  ③ **실 자료 전량 스모크**(F) — C1 린트에서 배운 것: 합성 케이스는 "실제 문서가 어떻게 생겼는지"를
 *     모른다. 실제 32개 가이드 + 7개 지식 문서 + 53종 인덱스로 한 번 돌려 불변식을 고정한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildCatalog, buildPropFields, buildSnippet, checkPropValue, extractExamples, findImportLine, firstParagraph,
  groupFamilies, optionalPropFields, readFrontmatter, searchCatalog, splitPascal, toKebab,
  type ICatalogEntry, type IPropsIndexEntry, type IRawDoc,
} from '../src/ai/catalog/ComponentCatalog';
import { buildComponentInsert, computeMinimalEdit } from '../src/ai/catalog/ComponentInsert';
import { COMPONENT_PROPS_INDEX } from '../src/ai/contracts/generated/componentPropsIndex';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}
const byId = (entries: ICatalogEntry[], id: string): ICatalogEntry | undefined => entries.find((e) => e.id === id);

// ═══ A. 이름·패밀리 ══════════════════════════════════════════════════════════
console.log('\n── A. 이름 쪼개기 · 패밀리 묶기 ──');
{
  eq(splitPascal('DropdownMenuSubTrigger'), ['Dropdown', 'Menu', 'Sub', 'Trigger'], 'A1: PascalCase 분해');
  eq(toKebab('SmartTable'), 'smart-table', 'A2: kebab (가이드 파일명 어휘)');
  eq(toKebab('Button Group'), 'button-group', 'A3: 공백 포함 제목도 kebab');

  const fams = groupFamilies([
    'Select', 'SelectItem', 'SelectScrollUpButton', 'SelectScrollDownButton',
    'DropdownMenuItem', 'DropdownMenuContent', 'SmartTable', 'Button',
  ]);
  eq(fams.get('Select')?.length, 4, 'A4: Select* 는 한 패밀리 (Scroll 로 쪼개지지 않는다)');
  eq(fams.get('DropdownMenu')?.length, 2, 'A5: 루트 없는 그룹은 공통 접두사가 라벨');
  ok(fams.has('SmartTable') && fams.has('Button'), 'A6: 단독 컴포넌트는 이름 그대로(Smart 로 잘리지 않는다)');
  eq(Array.from(fams.keys()).length, 4, 'A7: 패밀리 수');
}

// ═══ B. 문서 파싱 ════════════════════════════════════════════════════════════
console.log('\n── B. 문서 파싱 ──');
{
  const raw = [
    '---',
    'title: Button 컴포넌트',
    'tags: [button, 버튼, btn,',
    '       variant, 클릭]',
    'category: component',
    '---',
    '',
    '# Button 컴포넌트',
    '',
    '`@axiom/components/ui`의 버튼을 정리한다.',
    '',
    '## 임포트',
    '',
    '```typescript',
    "import { Button } from '@axiom/components/ui';",
    '```',
    '',
    '## 기본 사용 예시',
    '',
    '```tsx',
    '<Button>저장</Button>',
    '```',
  ].join('\n');

  const { fm, body } = readFrontmatter(raw);
  eq(fm.title, 'Button 컴포넌트', 'B1: frontmatter title');
  ok(fm.tags.includes('버튼') && fm.tags.includes('클릭'), 'B2: 여러 줄 tags 배열을 이어 붙인다');
  ok(body.startsWith('# Button'), 'B3: 본문에서 frontmatter 제거');
  eq(firstParagraph(body), '@axiom/components/ui의 버튼을 정리한다.', 'B4: 첫 문단 요약(헤딩 건너뜀)');
  eq(findImportLine(body), "import { Button } from '@axiom/components/ui';", 'B5: 배럴 import 한 줄');

  const ex = extractExamples(body);
  eq(ex.length, 2, 'B6: 코드블록 2개');
  eq(ex.map((e) => e.title), ['임포트', '기본 사용 예시'], 'B7: 가장 가까운 앞 헤딩이 예제 제목');
  eq(ex[1].lang, 'tsx', 'B8: 펜스 언어 보존');
  eq(ex[1].code, '<Button>저장</Button>', 'B9: 코드 본문');

  // frontmatter 없는 문서도 죽지 않는다
  const plainDoc = readFrontmatter('# Alert\n\n경고를 띄운다.');
  eq(plainDoc.fm, {}, 'B10: frontmatter 없음');
  eq(firstParagraph(plainDoc.body), '경고를 띄운다.', 'B11: 본문만 있어도 요약');

  // ★ 실 가이드 문서(MDX) 모양 — 상단이 주석 블록 + 스토리북 iframe 이다. 요약은 그 아래 문장이어야 한다.
  const mdx = [
    "{/* import AutoHeightStorybookIframe from '../../src/components/X'; */}",
    '',
    '{/*',
    '## Accordion 인터랙티브 예시',
    '<AutoHeightStorybookIframe',
    '  storyPath="/docs/ui-accordion--docs"',
    '  title="Accordion 인터랙티브 예제"',
    '  minHeight={600}',
    '/>',
    '*/}',
    '',
    '# Accordion 컴포넌트',
    '',
    '아코디언 컴포넌트입니다.',
  ].join('\n');
  eq(firstParagraph(mdx), '아코디언 컴포넌트입니다.', 'B12: MDX 주석 블록을 통째로 건너뛴다(minHeight={600} 의 } 로 일찍 풀리지 않는다)');

  const jsxBlock = ['<Iframe', '  title="예제"', '/>', '', '설명 문장.'].join('\n');
  eq(firstParagraph(jsxBlock), '설명 문장.', 'B13: 여러 줄 JSX 요소도 블록째 건너뛴다');

  // 가이드 문서는 큰따옴표 import 를 쓴다(지식 문서는 작은따옴표)
  eq(
    findImportLine('import { Tabs, TabsList } from "@axiom/components/ui";'),
    'import { Tabs, TabsList } from "@axiom/components/ui";',
    'B14: 큰따옴표 import 도 잡는다',
  );
}

// ═══ C. 카탈로그 조립 ════════════════════════════════════════════════════════
console.log('\n── C. 세 자료 합치기 ──');
{
  const index: Record<string, IPropsIndexEntry> = {
    Button: {
      import: '@axiom/components/ui',
      source: 'src/shared/lib/shadcn/ui/button.tsx',
      props: [{ name: 'variant', type: "'default' | 'outline'", required: false }],
      domNote: true,
    },
    SelectItem: {
      import: '@axiom/components/ui',
      source: 'src/shared/lib/shadcn/ui/select.tsx',
      props: [{ name: 'value', type: 'string', required: true }],
      domNote: false,
    },
    Select: {
      import: '@axiom/components/ui',
      source: 'src/shared/lib/shadcn/ui/select.tsx',
      props: [],
      domNote: false,
    },
  };
  const guideDocs: IRawDoc[] = [
    { id: 'components/ui/button-component', text: '---\ntitle: "Button"\n---\n\n# Button 컴포넌트\n\n클릭으로 동작을 실행합니다.' },
    { id: 'components/ui/alert-component', text: '---\ntitle: "Alert"\n---\n\n# Alert\n\n경고 상자입니다.' },
  ];
  const knowledgeDocs: IRawDoc[] = [
    {
      id: 'components/Button.md',
      text: '---\ntitle: Button 컴포넌트\ntags: [버튼, 클릭]\n---\n\n# Button\n\n## 예시\n\n```tsx\n<Button>저장</Button>\n```',
    },
    { id: 'components/Form.md', text: '---\ntitle: Form\ntags: [폼, 입력]\n---\n\n# Form\n\n폼 작성 규칙.' },
  ];

  const entries = buildCatalog({ index, guideDocs, knowledgeDocs });
  eq(entries.map((e) => e.id).sort(), ['alert', 'button', 'form', 'select'], 'C1: 세 자료의 합집합');

  const button = byId(entries, 'button')!;
  eq(button.origins, ['props', 'guide', 'knowledge'], 'C2: 같은 부품이면 출처가 합쳐진다');
  eq(button.guideDocId, 'components/ui/button-component', 'C3: 가이드 딥링크 docId');
  eq(button.knowledgeSource, 'components/Button.md', 'C4: 지식 문서 출처');
  eq(button.examples.length, 1, 'C5: 예제는 지식 문서에서');
  ok(button.keywords.includes('버튼'), 'C6: 한글 태그가 검색어로');

  const alert = byId(entries, 'alert')!;
  eq(alert.origins, ['guide'], 'C7: props 없는 문서 전용 부품도 목록에 남는다');
  eq(alert.members.length, 0, 'C8: 문서 전용은 members 0');
  eq(alert.summary, '경고 상자입니다.', 'C9: 요약은 가이드 본문에서');

  const select = byId(entries, 'select')!;
  eq(select.name, 'Select', 'C10: 패밀리 라벨');
  eq(select.members.map((m) => m.name), ['Select', 'SelectItem'], 'C11: 루트 먼저, 나머지는 이름순');
  eq(select.propCount, 1, 'C12: prop 합계');
  eq(select.requiredCount, 1, 'C13: 필수 prop 합계');

  // 같은 입력 → 같은 결과(목록이 열 때마다 흔들리면 훑어볼 수 없다)
  eq(JSON.stringify(buildCatalog({ index, guideDocs, knowledgeDocs })), JSON.stringify(entries), 'C14: 결정론');
}

// ═══ D. 스니펫 ═══════════════════════════════════════════════════════════════
console.log('\n── D. 빠른 스니펫 ──');
{
  const member = (name: string, props: IPropsIndexEntry['props']) => ({
    name, import: '@axiom/components/ui', source: 's.tsx', props, domNote: false, truncated: false,
  });

  eq(
    buildSnippet({ name: 'Button', members: [member('Button', [{ name: 'variant', type: "'default' | 'outline'", required: false }])], importPath: '@axiom/components/ui', importLine: null }),
    "import { Button } from '@axiom/components/ui';\n\n<Button />",
    'D1: 필수 prop 없으면 태그만(선택 prop을 지어내지 않는다)',
  );

  const snippet = buildSnippet({
    name: 'SmartTable',
    members: [member('SmartTable', [
      { name: 'columns', type: 'SmartColumns<TRow>', required: true },
      { name: 'searchable', type: 'boolean', required: true },
      { name: 'pageSize', type: 'number', required: true },
      { name: 'onRowClick', type: '(row: TRow) => void', required: true },
      { name: 'label', type: 'string', required: true },
      { name: 'rows', type: 'TRow[]', required: true },
      { name: 'density', type: "'sm' | 'lg'", required: true },
      { name: 'hidden', type: 'boolean', required: false },
    ])],
    importPath: '@axiom/components/ui',
    importLine: null,
  });
  ok(snippet!.includes('columns={columns}'), 'D2: 복합 타입은 같은 이름의 변수로');
  ok(snippet!.includes(' searchable ') || snippet!.endsWith('searchable />') || snippet!.includes('searchable '), 'D3: boolean 은 플래그로');
  ok(snippet!.includes('pageSize={0}'), 'D4: number');
  ok(snippet!.includes('onRowClick={handleRowClick}'), 'D5: 함수는 handle 접두 핸들러명');
  ok(snippet!.includes('label="값"'), 'D6: string');
  ok(snippet!.includes('rows={[]}'), 'D7: 배열');
  ok(snippet!.includes('density="sm"'), 'D8: 리터럴 유니온은 첫 값');
  ok(!snippet!.includes('hidden'), 'D9: 선택 prop 은 빠진다');

  eq(
    buildSnippet({ name: 'Native Select', members: [], importPath: null, importLine: null }),
    null,
    'D10: import 를 모르면 스니펫을 만들지 않는다(추측 금지)',
  );
  ok(
    buildSnippet({ name: 'Tabs', members: [], importPath: null, importLine: "import { Tabs } from '@axiom/components/ui';" })
      === "import { Tabs } from '@axiom/components/ui';\n\n<Tabs />",
    'D11: 문서의 import 줄만 있어도 스니펫',
  );

  ok(
    buildSnippet({
      name: 'Accordion',
      members: [member('Accordion', [{ name: 'type', type: '"single" | "multiple"', required: true }])],
      importPath: '@axiom/components/ui',
      importLine: null,
    })!.includes('type="single"'),
    'D12: 큰따옴표 리터럴 유니온도 첫 값으로(실 인덱스 표기)',
  );

  // 루트 없는 조합형 패밀리 — 아무 조각이나 대표로 세우면 엉뚱한 사용법이 된다
  eq(
    buildSnippet({
      name: 'Combobox',
      members: [member('ComboboxChip', []), member('ComboboxItem', [])],
      importPath: '@axiom/components/ui',
      importLine: "import { ComboboxItem } from '@axiom/components/ui';",
    }),
    "import { ComboboxItem } from '@axiom/components/ui';",
    'D13: 루트 없는 패밀리는 import 만 (가짜 <ComboboxChip /> 금지)',
  );
}

// ═══ E. 검색 ═════════════════════════════════════════════════════════════════
console.log('\n── E. 검색 ──');
{
  const index: Record<string, IPropsIndexEntry> = {
    Button: { import: '@axiom/components/ui', source: 'b.tsx', props: [{ name: 'variant', type: 'string', required: false }], domNote: true },
    Checkbox: { import: '@axiom/components/ui', source: 'c.tsx', props: [{ name: 'checked', type: 'boolean', required: false }], domNote: false },
    SmartTable: { import: '@axiom/components/ui', source: 's.tsx', props: [{ name: 'columns', type: 'X', required: true }], domNote: false },
  };
  const knowledgeDocs: IRawDoc[] = [
    { id: 'components/SmartTable.md', text: '---\ntitle: SmartTable\ntags: [표, 테이블, 그리드]\n---\n\n# SmartTable\n\n선언형 데이터 그리드입니다.' },
  ];
  const entries = buildCatalog({ index, knowledgeDocs });

  eq(searchCatalog(entries, '').length, 3, 'E1: 빈 질의는 전체');
  eq(searchCatalog(entries, 'button').map((e) => e.id), ['button'], 'E2: 이름 검색');
  eq(searchCatalog(entries, '표')[0].id, 'smart-table', 'E3: 한글 태그로 검색');
  eq(searchCatalog(entries, 'checked').map((e) => e.id), ['checkbox'], 'E4: prop 이름으로 검색');
  eq(searchCatalog(entries, 'zzz').length, 0, 'E5: 없는 말은 0건(억지 매칭 금지)');
  eq(searchCatalog(entries, '표 그리드').map((e) => e.id), ['smart-table'], 'E6: 토큰은 전부 걸려야 한다(AND)');
  eq(searchCatalog(entries, '표 button').length, 0, 'E7: 한 토큰이라도 빠지면 제외');
  eq(
    searchCatalog(entries, 'smart').map((e) => e.id),
    searchCatalog(entries, 'SMART').map((e) => e.id),
    'E8: 대소문자 무시',
  );
  // 이름 정확 일치가 본문 언급보다 위 (Table 이 SmartTable 본문에도 있는 상황)
  const ranked = searchCatalog(entries, 'smarttable');
  eq(ranked[0].id, 'smart-table', 'E9: 이름 정확 일치가 최상위');
}

// ═══ F. 실 자료 전량 스모크 ══════════════════════════════════════════════════
console.log('\n── F. 실 자료(가이드 32 · 지식 7 · 인덱스 53) 스모크 ──');
{
  const readDir = (dir: string, idOf: (name: string) => string): IRawDoc[] => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort()
      .map((n) => ({ id: idOf(n), text: fs.readFileSync(path.join(dir, n), 'utf8') }));
  };
  const guideDocs = readDir(
    path.join('media', 'guide-docs', 'components', 'ui'),
    (n) => `components/ui/${n.replace(/\.md$/, '')}`,
  );
  const knowledgeDocs = readDir(path.join('knowledge', 'components'), (n) => `components/${n}`);
  ok(guideDocs.length >= 30, `F1: 가이드 문서 로드 (${guideDocs.length}개)`);
  ok(knowledgeDocs.length >= 7, `F2: 지식 문서 로드 (${knowledgeDocs.length}개)`);

  const entries = buildCatalog({ index: COMPONENT_PROPS_INDEX, guideDocs, knowledgeDocs });
  const ids = entries.map((e) => e.id);
  eq(ids.length, new Set(ids).size, 'F3: id 중복 없음');
  // 12(인덱스 패밀리) + 32(가이드) − 11(겹침) + 1(Form: 지식 전용) = 34.
  ok(entries.length >= 34, `F4: 부품 ${entries.length}개 (문서 전용 포함)`);

  // 가이드 문서가 하나도 미아가 되지 않는다(파일명 ↔ 패밀리 id 규칙 회귀).
  const orphans = guideDocs.filter((d) => !entries.some((e) => e.guideDocId === d.id)).map((d) => d.id);
  eq(orphans, [], 'F5: 모든 가이드 문서가 어떤 항목에 붙는다');
  const knowledgeOrphans = knowledgeDocs.filter((d) => !entries.some((e) => e.knowledgeSource === d.id)).map((d) => d.id);
  eq(knowledgeOrphans, [], 'F6: 모든 지식 문서가 어떤 항목에 붙는다');

  // 53종이 하나도 안 빠지고 어딘가의 member 다.
  const memberNames = new Set(entries.flatMap((e) => e.members.map((m) => m.name)));
  eq(memberNames.size, Object.keys(COMPONENT_PROPS_INDEX).length, 'F7: 인덱스 53종이 모두 members 로 들어간다');

  const select = byId(entries, 'select')!;
  eq(select.members.length, 10, 'F8: Select* 10종이 한 줄로 접힌다');
  eq(select.members[0].name, 'Select', 'F9: 루트가 먼저');
  ok(byId(entries, 'dropdown-menu')!.members.length === 9, 'F10: DropdownMenu 패밀리');

  const smart = byId(entries, 'smart-table')!;
  eq(smart.origins, ['props', 'guide', 'knowledge'], 'F11: SmartTable 은 세 자료가 다 붙는다');
  ok(smart.propCount >= 37, `F12: SmartTable prop ${smart.propCount}개`);
  ok(smart.snippet !== null && smart.snippet.includes('columns={columns}'), 'F13: 필수 prop 이 스니펫에');
  ok(smart.examples.length > 0, 'F14: 지식 문서 예제');

  // 문서만 있는 부품(prop 인덱스에 없음)도 반드시 남아 있어야 한다.
  ok(byId(entries, 'alert')?.origins.join() === 'guide', 'F15: Alert = 가이드 전용 항목');
  ok(byId(entries, 'form')?.origins.includes('knowledge') === true, 'F16: Form = 지식 문서 전용 항목');

  // 실제 한글 질의 — "무엇이 위반이 아닌가"처럼, 실제로 쓸 말이 걸리는지는 실 문서로만 확인된다.
  const cases: [string, string][] = [
    ['표', 'smart-table'],
    ['버튼', 'button'],
    ['달력', 'calendar'],
    ['체크박스', 'checkbox'],
  ];
  for (const [q, expected] of cases) {
    const top = searchCatalog(entries, q)[0];
    ok(top?.id === expected, `F17: "${q}" → ${expected} (실제 top=${top?.id ?? '없음'})`);
  }

  // ★ 요약에 MDX/JSX 부스러기가 새지 않는다(실 문서 10개가 이 함정에 걸렸다).
  const junk = entries.filter((e) => /^[{<\/]|^import\s|인터랙티브 예제|storyPath/.test(e.summary)).map((e) => e.name);
  eq(junk, [], 'F19: 모든 요약이 사람이 읽는 문장으로 시작');

  // 가이드 문서가 있으면 import 줄(큰따옴표 표기 포함)을 찾아 스니펫을 만든다.
  const noSnippet = entries.filter((e) => e.guideDocId && !e.snippet).map((e) => e.name);
  eq(noSnippet, [], 'F20: 가이드 있는 부품은 전부 스니펫이 나온다');

  // payload 크기 — 웹뷰로 한 번에 내려가므로 무한정 커지면 안 된다.
  const bytes = Buffer.byteLength(JSON.stringify(entries), 'utf8');
  ok(bytes < 900_000, `F18: payload ${Math.round(bytes / 1024)}KB (< 900KB)`);
}

// ═══ G. 부품 삽입 (A4) ══════════════════════════════════════════════════════
console.log('\n── G. 커서 위치에 넣기 ──');
{
  const SRC = [
    "import { useState } from 'react';",
    '',
    'export default function EmployeePage(): React.ReactNode {',
    "  const [q, setQ] = useState('');",
    '  return (',
    '    <div className="page">',
    '      <h1>직원</h1>',
    '      <p>{q}</p>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const SNIPPET = "import { Button } from '@axiom/components/ui';\n\n<Button />";

  const r = buildComponentInsert({ source: SRC, snippet: SNIPPET, targetFile: 'a.tsx', cursorAnchor: 'line:8' });
  eq(r.blocked, null, 'G1: 화면 안 커서면 넣을 수 있다');
  ok(r.text!.includes("import { Button } from '@axiom/components/ui';"), 'G2: import 가 파일 상단에 추가된다');
  ok(r.text!.includes('<Button />'), 'G3: JSX 조각이 들어간다');
  const lines = r.text!.split('\n');
  const btn = lines.findIndex((l) => l.includes('<Button />'));
  const div = lines.findIndex((l) => l.includes('<div className="page">'));
  const close = lines.findIndex((l) => l.includes('</div>'));
  ok(btn > div && btn < close, 'G4: 화면(JSX) 안에 들어간다 — import 구역이 아니라');
  ok(lines[btn].startsWith('      '), 'G5: 앵커 줄 들여쓰기에 맞춘다');

  // ★ 멱등 — 사용자는 결과가 이상하면 반드시 다시 누른다(A3의 실측 교훈).
  const again = buildComponentInsert({ source: r.text!, snippet: SNIPPET, targetFile: 'a.tsx', cursorAnchor: 'line:8' });
  ok(again.blocked !== null || again.text === r.text, 'G6: 두 번 넣어도 늘어나지 않는다');

  // 커서가 화면 밖(import 구역)이어도 자리를 찾아 준다 — 채팅과 달리 여기서도 커서를 못 믿는다.
  const outside = buildComponentInsert({ source: SRC, snippet: SNIPPET, targetFile: 'a.tsx', cursorAnchor: 'line:1' });
  if (!outside.blocked) {
    const ol = outside.text!.split('\n');
    const ob = ol.findIndex((l) => l.includes('<Button />'));
    ok(ob > ol.findIndex((l) => l.includes('<div className="page">')), 'G7: 화면 밖 커서는 채택하지 않는다');
  } else {
    ok(true, `G7: 화면 밖 커서는 사유와 함께 막는다 — ${outside.blocked}`);
  }

  eq(
    buildComponentInsert({ source: SRC, snippet: '', targetFile: 'a.tsx' }).blocked,
    '이 부품에는 넣을 스니펫이 없습니다.',
    'G8: 스니펫 없으면 막는다',
  );
  ok(
    buildComponentInsert({ source: '', snippet: SNIPPET, targetFile: 'a.tsx' }).blocked !== null,
    'G9: 원문이 비면 막는다(사유 있음)',
  );
}
{
  // 최소 편집 — 편집기에 그대로 반영하므로 바뀐 줄만 좁혀야 Ctrl+Z 한 번이 "방금 넣은 것"이 된다.
  eq(computeMinimalEdit('a\nb\nc', 'a\nb\nc'), null, 'G10: 변화 없으면 null');
  eq(computeMinimalEdit('a\nb\nc', 'a\nX\nb\nc'), { startLine: 1, endLine: 1, text: 'X\n' }, 'G11: 순수 삽입은 0줄 구간 + 개행 포함');
  eq(computeMinimalEdit('a\nb\nc', 'a\nB\nc'), { startLine: 1, endLine: 2, text: 'B\n' }, 'G12: 한 줄 교체');
  eq(computeMinimalEdit('a\nb\nc', 'a\nb'), { startLine: 2, endLine: 3, text: '' }, 'G13: 파일 끝 삭제');
  eq(computeMinimalEdit('a\nb', 'a\nb\nc'), { startLine: 2, endLine: 2, text: 'c' }, 'G14: 파일 끝 추가는 개행을 붙이지 않는다');
  // CRLF: \r 은 줄 내용에 붙어 그대로 보존된다(줄 끝 문자를 건드리지 않는다).
  const crlf = computeMinimalEdit('a\r\nb\r\nc', 'a\r\nX\r\nb\r\nc');
  eq(crlf, { startLine: 1, endLine: 1, text: 'X\r\n' }, 'G15: CRLF 보존');
}

// ═══ H. 필수 prop 입력 폼 (A4 후속) ═════════════════════════════════════════
console.log('\n── H. 넣기 전 값 입력 ──');
{
  const member = (name: string, props: IPropsIndexEntry['props']) => ({
    name, import: '@axiom/components/ui', source: 's.tsx', props, domNote: false, truncated: false,
  });
  const entry = {
    name: 'SmartTable',
    importPath: '@axiom/components/ui',
    importLine: null,
    members: [member('SmartTable', [
      { name: 'columns', type: 'SmartColumns<TRow>', required: true },
      { name: 'searchable', type: 'boolean', required: true },
      { name: 'pageSize', type: 'number', required: true },
      { name: 'density', type: "'sm' | 'lg'", required: true },
      { name: 'title', type: 'string', required: true },
      { name: 'onRowClick', type: '(row: TRow) => void', required: true },
      { name: 'hidden', type: 'boolean', required: false },
    ])],
  };

  const fields = buildPropFields(entry);
  eq(fields.map((f) => f.name), ['columns', 'searchable', 'pageSize', 'density', 'title', 'onRowClick'], 'H1: 필수 prop만 칸이 된다');
  eq(fields.map((f) => f.control), ['text', 'checkbox', 'number', 'select', 'text', 'text'], 'H2: 칸 종류는 타입에서 유도');
  eq(fields.find((f) => f.name === 'density')?.options, ['sm', 'lg'], 'H3: 리터럴 유니온은 고르기');
  eq(fields.find((f) => f.name === 'onRowClick')?.value, 'handleRowClick', 'H4: 함수 기본값은 handle 접두 핸들러명');
  eq(buildPropFields({ name: 'Combobox', members: [member('ComboboxItem', [])] }), [], 'H5: 루트 없는 패밀리는 칸 없음');

  // ★ 값을 안 넣으면 종전과 **완전히 같다** — 폼을 무시해도 동작이 바뀌지 않는다.
  eq(buildSnippet(entry, {}), buildSnippet(entry), 'H6: 빈 값 = 기본값(종전 스니펫과 동일)');

  const filled = buildSnippet(entry, {
    columns: 'employeeColumns',
    searchable: 'false',
    pageSize: '20',
    density: 'lg',
    title: '직원 목록',
    onRowClick: 'handleSelect',
  })!;
  ok(filled.includes('columns={employeeColumns}'), 'H7: 복합 타입은 표현식 그대로');
  ok(filled.includes('searchable={false}'), 'H8: 체크 해제는 {false} 로 명시');
  ok(filled.includes('pageSize={20}'), 'H9: 숫자');
  ok(filled.includes('density="lg"'), 'H10: 고른 값');
  ok(filled.includes('title="직원 목록"'), 'H11: 문자열은 따옴표(사용자가 따옴표를 안 써도 된다)');
  ok(filled.includes('onRowClick={handleSelect}'), 'H12: 함수는 중괄호');

  // 켜진 boolean 은 속성 이름만(관용 표기)
  ok(buildSnippet(entry, { searchable: 'true' })!.includes(' searchable '), 'H13: 켜진 boolean 은 플래그');
  // 빈 문자열·공백은 기본값으로 되돌린다(빈 칸이 `title=""` 가 되지 않게)
  ok(buildSnippet(entry, { title: '   ' })!.includes('title="값"'), 'H14: 공백만 입력하면 기본값');

  // ★ 미리보기 = 실제 삽입: 패널이 그리는 문자열과 호스트가 넣는 문자열이 **같은 함수**에서 나온다.
  const preview = buildSnippet(entry, { columns: 'cols' })!;
  const inserted = buildComponentInsert({
    source: 'export default function P(): React.ReactNode {\n  return (\n    <div>\n      <h1>x</h1>\n    </div>\n  );\n}',
    snippet: preview,
    targetFile: 'p.tsx',
    cursorAnchor: 'line:4',
  });
  eq(inserted.blocked, null, 'H15: 채운 스니펫도 그대로 삽입된다');
  ok(inserted.text!.includes('columns={cols}'), 'H16: 미리보기에 보이던 값이 그대로 들어간다');
}

// ═══ I. 선택 prop + 값 점검 (A4 후속 2차 — 실측 사고) ═══════════════════════
console.log('\n── I. 선택 prop 칸 · 값 점검 ──');
{
  const member = (name: string, props: IPropsIndexEntry['props']) => ({
    name, import: '@axiom/components/ui', source: 's.tsx', props, domNote: false, truncated: false,
  });
  const entry = {
    name: 'SmartTable',
    importPath: '@axiom/components/ui',
    importLine: null,
    members: [member('SmartTable', [
      { name: 'columns', type: 'SmartColumns<TRow>', required: true },
      { name: 'pageSize', type: 'number', required: false },
      { name: 'searchable', type: 'boolean', required: false },
    ])],
  };

  // ★ 실측 사고: 필수 칸만 있으니 사용자가 `columns` 에 "employeeColumns, pageSize = 20" 을
  //   몰아넣었고 `columns={employeeColumns, pageSize = 20}` 이라는 깨진 코드가 삽입됐다.
  eq(optionalPropFields(entry).map((f) => f.name), ['pageSize', 'searchable'], 'I1: 선택 prop도 칸이 될 수 있다');
  eq(buildPropFields(entry).map((f) => f.name), ['columns'], 'I2: 기본 폼은 여전히 필수만(짧게 유지)');

  // 선택 prop은 **값을 준 것만** 붙는다 — 안 건드리면 종전과 동일.
  eq(buildSnippet(entry, {}), buildSnippet(entry), 'I3: 선택 prop 미지정이면 종전 스니펫 그대로');
  const withOpt = buildSnippet(entry, { columns: 'employeeColumns', pageSize: '20' })!;
  ok(withOpt.includes('columns={employeeColumns}'), 'I4: 필수는 그대로');
  ok(withOpt.includes('pageSize={20}'), 'I5: 추가한 선택 prop이 **각자 속성으로** 들어간다');
  ok(!withOpt.includes(','), 'I6: 한 속성에 쉼표가 섞이지 않는다(사고 재현 방지)');
  ok(buildSnippet(entry, { columns: 'c', searchable: 'true' })!.includes(' searchable '), 'I7: 선택 boolean 은 플래그로');

  // 값 점검 — 막지 않고 알린다(경고 문구는 사람 말).
  ok(checkPropValue('employeeColumns, pageSize = 20')!.includes('쉼표'), 'I8: 여러 prop을 한 칸에 넣으면 경고');
  ok(checkPropValue('pageSize = 20')!.includes('등호'), 'I9: 대입문도 경고');
  eq(checkPropValue('employeeColumns'), null, 'I10: 평범한 식별자는 조용');
  eq(checkPropValue('{ a: 1, b: 2 }'), null, 'I11: 괄호 **안**의 쉼표는 정상(객체 리터럴)');
  eq(checkPropValue('cols.filter((c) => c.visible)'), null, 'I12: 화살표 함수의 => 는 대입이 아니다');
  eq(checkPropValue("t('a, b')"), null, 'I13: 따옴표 안 쉼표는 정상');
  eq(checkPropValue('a === b'), null, 'I14: 비교 연산자는 대입이 아니다');
  eq(checkPropValue(''), null, 'I15: 빈 값은 조용(기본값으로 채워진다)');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
