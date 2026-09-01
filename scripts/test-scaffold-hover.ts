/**
 * Scaffold Hover(B2) 테스트 — 심볼 인식 · 오탐 가드 · 카드 조립 · 딥링크.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 B2.
 *
 * 이 하니스가 지키려는 것:
 *  ① **양보**(B·C) — hover는 아무 데서나 뜨면 안 된다. 관계없는 심볼·로컬 선언·남의 `refetch`에
 *     우리 카드를 들이대는 순간 편집기 전체가 시끄러워지고 사람들은 기능을 꺼 버린다.
 *  ② **표가 깨지지 않을 것**(D) — 유니온 타입의 `|`가 마크다운 표를 그대로 부순다(실제로 흔한 타입).
 *  ③ **실 자료 전량 스모크**(E) — C1·B1에서 배운 것: 합성 케이스는 실제 문서·실제 인덱스가 어떻게
 *     생겼는지 모른다. 특히 **딥링크는 파일이 실제로 있어야** 의미가 있다(없으면 눌러도 오류만 뜬다).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HOVER_CONTRACT_SYMBOLS, buildHoverLinks, commandLink, declaresLocally, findCatalogMember,
  importedNames, propTable, renderHoverMarkdown, resolveScaffoldHover, symbolAt, typeCell,
} from '../src/ai/hover/ScaffoldHover';
import { buildCatalog, type ICatalogEntry, type IRawDoc } from '../src/ai/catalog/ComponentCatalog';
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

/** 줄에서 `▲`가 가리키는 열에 커서를 둔 것처럼 hover를 부른다(테스트를 읽기 쉽게). */
function hoverAt(lineText: string, needle: string, source = lineText, entries: ICatalogEntry[] = []) {
  const at = lineText.indexOf(needle);
  if (at < 0) throw new Error(`테스트 오류: '${needle}' 없음 — ${lineText}`);
  return resolveScaffoldHover({ lineText, character: at + 1, source, entries });
}

// ═══ A. 커서 아래 심볼 ═══════════════════════════════════════════════════════
console.log('\n── A. 심볼 인식 ──');
{
  const line = '  const { data, refetch } = useApi<TRes>(EP);';
  eq(symbolAt(line, line.indexOf('useApi') + 2)?.word, 'useApi', 'A1: 단어 한가운데');
  eq(symbolAt(line, line.indexOf('useApi'))?.word, 'useApi', 'A2: 단어 첫 글자');
  eq(symbolAt(line, line.indexOf('useApi') + 6)?.word, 'useApi', 'A3: 단어 끝 경계');
  eq(symbolAt('   ', 1), null, 'A4: 공백에는 심볼이 없다');

  const util = '  const won = $util.number.comma(v);';
  const s1 = symbolAt(util, util.indexOf('comma') + 1)!;
  eq([s1.word, s1.member, s1.hovered], ['$util', 'number', 'comma'], 'A5: 멤버 위에서도 뿌리는 $util');
  eq(s1.memberPath, '.number.comma', 'A6: 멤버 경로 전체');
  ok(s1.call, 'A7: 곧바로 호출되는 체인(cn 가드가 쓰는 신호)');
  eq(util.slice(s1.start, s1.end), '$util', 'A8: 하이라이트 범위는 뿌리 식별자');

  // `foo().bar` — 점 앞이 식별자가 아니면 거기서 멈춘다(엉뚱한 뿌리 금지).
  const chained = 'rows.filter(fn).map(x)';
  eq(symbolAt(chained, chained.indexOf('map') + 1)?.word, 'map', 'A9: 호출 결과 뒤 멤버는 뿌리를 만들지 않는다');

  const jsx = '      <Button variant="outline">저장</Button>';
  ok(symbolAt(jsx, jsx.indexOf('Button') + 1)?.jsxTag === true, 'A10: 여는 태그');
  ok(symbolAt(jsx, jsx.lastIndexOf('Button') + 1)?.jsxTag === true, 'A11: 닫는 태그');
  ok(symbolAt('const Button = 1;', 8)?.jsxTag === false, 'A12: 태그가 아니면 false');
}

// ═══ B. 계약 카드 hover ══════════════════════════════════════════════════════
console.log('\n── B. 계약 카드 ──');
{
  const card = hoverAt('  const { data } = useApi<TRes>(EP);', 'useApi');
  eq(card?.kind, 'contract', 'B1: useApi → 계약 카드');
  eq(card?.id, 'use-api', 'B2: 카드 id');
  ok(card!.body.includes('refetch()'), 'B3: 본문은 ScaffoldContracts 카드 원문(문안을 다시 쓰지 않는다)');
  eq(card?.guideDocId, 'apis/global-function/hooks/use-api', 'B4: 가이드 딥링크');

  eq(hoverAt('  $router.push("/a");', '$router')?.id, 'router', 'B5: $router');
  eq(hoverAt('  const ok = await $ui.confirm("삭제?");', 'confirm')?.guideDocId,
    'apis/service-objects/ui/confirm-ui', 'B6: $ui는 멤버를 보고 그 문서로');
  eq(hoverAt('  await $ui.alert("저장");', '$ui')?.guideDocId,
    'apis/service-objects/ui/alert-ui', 'B7: $ui 멤버 없으면 alert 문서');
  eq(hoverAt('  const d = $util.date.format(v);', 'date')?.guideDocId,
    'apis/service-objects/util/date-util', 'B8: $util 네임스페이스별 문서');
  eq(hoverAt('  $util;', '$util')?.guideDocId, null, 'B9: 모르는 네임스페이스면 링크 없음(깨진 링크 금지)');

  // refetch — 같은 파일에 useApi가 있을 때만.
  const withApi = 'const { refetch } = useApi(EP);';
  eq(hoverAt(withApi, 'refetch')?.id, 'use-api', 'B10: useApi 파일의 refetch');
  eq(hoverAt('  await refetch();', 'refetch', 'const refetch = useQuery().refetch;'), null,
    'B11: 남의 refetch에는 참견하지 않는다');

  // cn — 두 글자 흔한 이름이라 호출 형태이거나 import 돼 있을 때만.
  eq(hoverAt("  className={cn('a', b)}", 'cn(')?.id, 'class-merge-cn', 'B12: cn( 호출');
  eq(hoverAt('  const total = cn + 1;', 'cn ', 'const cn = 3;\nconst total = cn + 1;'), null,
    'B13: 호출도 import도 아니면 양보');
  eq(hoverAt('  return cn;', 'cn', "import { cn } from '@/shared/utils/cn';\nreturn cn;")?.id,
    'class-merge-cn', 'B14: import 돼 있으면 호출이 아니어도 발동');

  eq(hoverAt('  const form = useForm<TF>({});', 'useForm')?.id, 'form-validation', 'B15: useForm');
  eq(hoverAt('  const x = whatever(1);', 'whatever'), null, 'B16: 관계없는 심볼엔 hover 없음');

  // 레지스트리 자체의 불변식 — 모델 지시문 카드를 사람 hover에 끌어오지 않았는지.
  ok(HOVER_CONTRACT_SYMBOLS.every((s) => !['date-picker', 'list-table-binding', 'smart-table-binding',
    'local-data-render', 'button-component'].includes(s.contractId)),
  'B17: 레시피·모델 지시문 카드는 hover 대상이 아니다');
}

// ═══ C. 컴포넌트 카드 hover ══════════════════════════════════════════════════
console.log('\n── C. 컴포넌트 카드 · 오탐 가드 ──');
{
  const entries = buildCatalog({
    index: {
      Button: {
        import: '@axiom/components/ui',
        source: 'src/shared/lib/shadcn/ui/button.tsx',
        domNote: true,
        props: [
          { name: 'variant', type: "'default' | 'outline' | 'ghost'", required: false },
          { name: 'size', type: "'sm' | 'lg'", required: false },
        ],
      },
      SmartTable: {
        import: '@axiom/components/ui',
        source: 'src/shared/lib/shadcn/ui/smart-table.tsx',
        domNote: false,
        props: [
          { name: 'columns', type: 'TColumn[]', required: true },
          { name: 'pageSize', type: 'number', required: false },
        ],
      },
      SelectItem: {
        import: '@axiom/components/ui',
        source: 'src/shared/lib/shadcn/ui/select.tsx',
        domNote: false,
        props: [{ name: 'value', type: 'string', required: true }],
      },
      Select: {
        import: '@axiom/components/ui',
        source: 'src/shared/lib/shadcn/ui/select.tsx',
        domNote: false,
        props: [],
      },
    },
    guideDocs: [{
      id: 'components/ui/button-component',
      text: '---\ntitle: Button 컴포넌트\ntags: [버튼]\n---\n\n버튼 부품이다.\n',
    }],
  });

  const imported = "import { Button } from '@axiom/components/ui';\n\nexport default function P() {\n  return <Button />;\n}\n";
  const c1 = hoverAt('  return <Button variant="outline" />;', 'Button', imported, entries);
  eq(c1?.kind, 'component', 'C1: JSX 태그 → 컴포넌트 카드');
  eq(c1?.id, 'button', 'C2: 카탈로그 항목 id');
  eq(c1?.guideDocId, 'components/ui/button-component', 'C3: 가이드 딥링크(카탈로그가 이미 안다)');
  eq(c1?.catalogEntryId, 'button', 'C4: 카탈로그 딥링크');
  ok(c1!.body.includes('variant'), 'C5: prop 표');
  ok(c1!.subtitle.includes('@axiom/components/ui'), 'C6: import 경로');

  eq(hoverAt("import { Button } from '@axiom/components/ui';", 'Button', imported, entries)?.id, 'button',
    'C7: import 줄에서도 뜬다');

  // 오탐 가드 — 이 파일이 직접 선언한 이름이면 남의 부품이 아니다.
  const local = 'function Button() { return null; }\nconst x = <Button />;';
  eq(hoverAt('  const x = <Button />;', 'Button', local, entries), null, 'C8: 로컬 선언이 있으면 양보');
  eq(hoverAt('  const Card = rows[0];', 'Card', 'const Card = rows[0];', entries), null,
    'C9: import도 태그도 아닌 평범한 변수엔 안 뜬다');
  eq(hoverAt('  const x = <Unknown />;', 'Unknown', "import { Unknown } from './x';", entries), null,
    'C10: 카탈로그에 없는 부품');
  eq(hoverAt('  const rows = items;', 'items', 'const rows = items;', entries), null,
    'C11: 소문자 식별자는 컴포넌트가 아니다');

  // 별칭 import — 조회는 원래 이름으로.
  const alias = "import { Button as Btn } from '@axiom/components/ui';";
  eq(hoverAt('  return <Btn />;', 'Btn', alias, entries)?.id, 'button', 'C12: 별칭은 원래 이름으로 조회');

  // ★ 동명이인 — 같은 이름을 **다른 모듈**에서 가져온 파일에 shadcn 문서를 띄우면 명백한 오답이다.
  // (실 scaffold 스모크에서 실제로 나온 것들: lucide-react의 Badge, @mui/material의 Button, vaul의 Drawer)
  const own = "import { Select } from './MyOwnSelect';";
  eq(hoverAt('  return <Select />;', 'Select', own, entries), null, 'C12b: 다른 모듈의 동명 부품엔 양보');
  eq(hoverAt('  return <Button />;', 'Button', "import { Button } from '@mui/material';", entries), null,
    'C12c: 서드파티 동명 부품에도 양보');

  // …하지만 배럴을 건너뛴 깊은 경로는 **같은 부품**이다(실 코드베이스에 실제로 있는 import 형태).
  const deep = "import { Button } from '@/shared/lib/shadcn/ui/button';";
  eq(hoverAt('  return <Button />;', 'Button', deep, entries)?.id, 'button',
    'C12d: shadcn 깊은 경로 import도 같은 부품으로 인정');

  // 패밀리 구성원 — 그 구성원의 prop을 보여준다.
  const selImport = "import { Select, SelectItem } from '@axiom/components/ui';";
  const c13 = hoverAt('    <SelectItem value="a">A</SelectItem>', 'SelectItem', selImport, entries);
  eq(c13?.title, 'SelectItem', 'C13: 제목은 hover 한 구성원');
  ok(c13!.body.includes('**value**'), 'C14: 그 구성원의 필수 prop');
  ok(c13!.body.includes('패밀리: Select'), 'C15: 형제 부품을 알려준다');

  eq(findCatalogMember(entries, 'SmartTable')?.entry.id, 'smart-table', 'C16: 이름으로 항목 찾기');
  eq(findCatalogMember(entries, '없는것'), null, 'C17: 없으면 null');
}

// ═══ D. 마크다운 조립 ════════════════════════════════════════════════════════
console.log('\n── D. 마크다운 · 딥링크 ──');
{
  // ★ 유니온 타입의 `|`는 마크다운 표를 그대로 부순다 — 실 인덱스에 흔하다.
  ok(typeCell("'a' | 'b'").includes('\\|'), 'D1: 유니온 파이프 이스케이프');
  ok(!typeCell('x'.repeat(200)).includes('\n'), 'D2: 긴 타입도 한 줄');
  ok(typeCell('x'.repeat(200)).length <= 64, 'D3: 길이 상한');
  eq(typeCell('  Record<string,\n  string>  '), 'Record<string, string>', 'D4: 줄바꿈은 공백 하나로');

  const many = Array.from({ length: 14 }, (_, i) => ({ name: `p${i}`, type: 'string', required: i === 13 }));
  const table = propTable(many);
  ok(table.split('\n').filter((l) => l.startsWith('| p')).length === 10, 'D5: 표는 10줄까지');
  ok(table.includes('**p13**'), 'D6: 필수가 위로');
  ok(table.includes('prop 4개 더 있음'), 'D7: 나머지 개수를 숨기지 않는다');
  eq(propTable([]), '', 'D8: prop이 없으면 표 자체가 없다');

  eq(commandLink('열기', 'axiom-ai.openGuide', ['a/b']),
    '[열기](command:axiom-ai.openGuide?%5B%22a%2Fb%22%5D)', 'D9: command URI 인코딩');

  const card = hoverAt('  const { data } = useApi(EP);', 'useApi')!;
  ok(buildHoverLinks(card).includes('command:axiom-ai.openGuide'), 'D10: 가이드 링크');
  eq(buildHoverLinks(card, { hasGuideDoc: () => false }), '', 'D11: 문서가 없으면 링크를 걸지 않는다');

  const md = renderHoverMarkdown(card);
  ok(md.startsWith('**'), 'D12: 제목 줄');
  ok(md.includes('react-app-scaffold 계약'), 'D13: 출처를 밝힌다');
}

// ═══ E. 실 자료 전량 스모크 ══════════════════════════════════════════════════
console.log('\n── E. 실 자료(가이드 · 지식 · 인덱스 53) 스모크 ──');
{
  const readDir = (dir: string, idOf: (name: string) => string): IRawDoc[] => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort()
      .map((n) => ({ id: idOf(n), text: fs.readFileSync(path.join(dir, n), 'utf8') }));
  };
  const guideRoot = path.join('media', 'guide-docs');
  const entries = buildCatalog({
    index: COMPONENT_PROPS_INDEX,
    guideDocs: readDir(path.join(guideRoot, 'components', 'ui'), (n) => `components/ui/${n.replace(/\.md$/, '')}`),
    knowledgeDocs: readDir(path.join('knowledge', 'components'), (n) => `components/${n}`),
  });
  ok(entries.length > 30, `E1: 실 카탈로그 조립 (${entries.length}종)`);

  const page = [
    "import { Button, SmartTable } from '@axiom/components/ui';",
    "import { useApi } from '@axiom/hooks';",
    '',
    'export default function EmployeeListPage() {',
    '  const { data, refetch } = useApi<{ data: TEmployee[] }>(EP);',
    '  return <SmartTable columns={cols} />;',
    '}',
  ].join('\n');

  const smart = hoverAt('  return <SmartTable columns={cols} />;', 'SmartTable', page, entries);
  eq(smart?.kind, 'component', 'E2: 실 인덱스의 SmartTable');
  ok((smart?.body ?? '').includes('```tsx'), 'E3: 스니펫 포함(카탈로그와 같은 buildSnippet)');

  // ★ 실 인덱스에는 긴 유니온 타입이 흔하다. 표 한 줄의 칸 구분자가 3개(= `| a | b | c |`)가 아니면
  //   그 줄은 깨진 표다 — 합성 케이스로는 안 걸리고 실제 prop 타입에서만 터진다.
  const brokenRows: string[] = [];
  for (const e of entries) {
    for (const m of e.members) {
      const line = `  <${m.name} />`;
      const card = resolveScaffoldHover({
        lineText: line, character: 4, entries,
        source: `import { ${m.name} } from '${m.import}';\n${line}`,
      });
      for (const row of (card?.body ?? '').split('\n')) {
        if (!row.startsWith('|')) continue;
        const bars = row.replace(/\\\|/g, '').match(/\|/g)?.length ?? 0;
        if (bars !== 4) brokenRows.push(`${m.name}: ${row}`);
      }
    }
  }
  eq(brokenRows.slice(0, 3), [], 'E4: 실 prop 타입으로 만든 표가 깨지지 않는다');

  const btn = hoverAt('    <Button onClick={go}>이동</Button>', 'Button', page, entries);
  eq(btn?.id, 'button', 'E5: 실 자료의 Button');
  ok((btn?.guideDocId ?? '').startsWith('components/ui/'), 'E6: 가이드 딥링크가 붙는다');

  // ★ 딥링크는 **파일이 실제로 있어야** 의미가 있다 — 없으면 눌러도 "문서를 읽을 수 없습니다"만 뜬다.
  const exists = (docId: string): boolean => fs.existsSync(path.join(guideRoot, `${docId}.md`));
  const probes: { line: string; needle: string }[] = [
    { line: 'const { data } = useApi(EP);', needle: 'useApi' },
    { line: '$router.push("/a");', needle: '$router' },
    { line: 'await $ui.alert("a");', needle: 'alert' },
    { line: 'await $ui.confirm("a");', needle: 'confirm' },
    { line: 'const d = $util.date.format(v);', needle: 'date' },
    { line: '$util.number.comma(v);', needle: 'number' },
    { line: '$util.string.mask(v);', needle: 'string' },
    { line: '$util.array.groupBy(r, "t");', needle: 'array' },
    { line: '$util.object.pick(o, ["a"]);', needle: 'object' },
    { line: '$util.finance.pmt(1);', needle: 'finance' },
  ];
  let broken = 0;
  for (const p of probes) {
    const c = hoverAt(p.line, p.needle, p.line);
    if (c?.guideDocId && !exists(c.guideDocId)) { broken++; console.log(`     ↳ 없는 문서: ${c.guideDocId}`); }
  }
  eq(broken, 0, 'E7: 계약 hover의 가이드 딥링크가 전부 실재하는 문서');

  // 컴포넌트 카드의 딥링크도 전부 실재해야 한다(카탈로그가 파일명에서 만든 docId).
  const badComponentLinks = entries
    .map((e) => e.guideDocId)
    .filter((d): d is string => typeof d === 'string')
    .filter((d) => !exists(d));
  eq(badComponentLinks, [], 'E8: 컴포넌트 카드의 가이드 딥링크도 전부 실재');

  // 전량 스모크 — 모든 부품을 JSX 태그로 hover 해도 예외 없이 카드가 나오고 마크다운이 조립된다.
  let rendered = 0;
  for (const e of entries) {
    for (const m of e.members) {
      const line = `  <${m.name} />`;
      const src = `import { ${m.name} } from '${m.import}';\n${line}`;
      const card = resolveScaffoldHover({ lineText: line, character: 4, source: src, entries });
      if (!card) continue;
      const md = renderHoverMarkdown(card, { hasGuideDoc: exists });
      if (md.length > 0) rendered++;
    }
  }
  ok(rendered >= 50, `E9: 실 부품 전량 렌더 (${rendered}종)`);

  // 계약을 **구현하는** 파일에서도 순수 층은 카드를 만든다 — 침묵 판정은 provider(워크스페이스 가드)의 몫이다.
  const b10 = importedNames("import { Button as B, type TProps } from '@axiom/components/ui';").get('B');
  ok(b10?.name === 'Button' && b10.module === '@axiom/components/ui', 'E10: 별칭 import 파싱(모듈까지)');
  ok(importedNames("import React from 'react';").get('React')?.module === 'react', 'E11: default import');
  ok(importedNames("import * as fs from 'fs';").has('fs'), 'E12: namespace import');
  ok(declaresLocally('export default function Page() {}', 'Page'), 'E13: 로컬 선언 탐지');
  ok(!declaresLocally('const pageSize = 1;', 'page'), 'E14: 부분 일치는 선언이 아니다');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
