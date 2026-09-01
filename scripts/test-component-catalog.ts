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
  buildCatalog, buildSnippet, extractExamples, findImportLine, firstParagraph, groupFamilies,
  readFrontmatter, searchCatalog, splitPascal, toKebab,
  type ICatalogEntry, type IPropsIndexEntry, type IRawDoc,
} from '../src/ai/catalog/ComponentCatalog';
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

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
