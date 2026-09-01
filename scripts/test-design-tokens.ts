/**
 * 디자인 토큰(B3) 테스트 — 파싱 · 스코프 · 덮어쓰기 순서 · var 체인 · 분류 · 검색 · hover.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 B3.
 *
 * 이 하니스가 지키려는 것:
 *  ① **순서가 값을 바꾼다**(C) — `app.css`의 @import 순서를 안 지키면 테마가 덮어쓴 색을 놓친다.
 *     이건 "정렬하면 편하겠다"는 유혹에 대한 회귀 가드다.
 *  ② **라이트/다크 둘 다**(D) — 한쪽만 맞으면 절반이 거짓이다. 다크가 재정의하지 않았는데
 *     **참조한 토큰이 다크에서 바뀐** 간접 변화까지 잡아야 한다.
 *  ③ **모르면 모른다고**(E) — 못 푸는 `var()`는 지어내지 않고 원문을 남긴다.
 *  ④ **실 자료 전량 스모크**(G) — C1·B1·B2에서 매번 새 결함이 나온 그 단계. 실제 scaffold의
 *     스타일 파일로 돌려 불변식을 고정한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildTokenSet, classifyToken, findToken, groupOf, isColorValue, parseCssTokens, parseImportOrder,
  resolveValue, scopeOfSelector, searchTokens, stripComments, type ITokenFile,
} from '../src/ai/tokens/DesignTokens';
import { cssVarAt, resolveTokenHover, renderHoverMarkdown } from '../src/ai/hover/ScaffoldHover';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

// ═══ A. CSS 파싱 ═════════════════════════════════════════════════════════════
console.log('\n── A. 파싱 ──');
{
  eq(stripComments('a /* x\ny */ b').split('\n').length, 2, 'A1: 주석을 지워도 줄 수는 그대로(줄 번호 보존)');

  const css = [
    ':root {',
    '  --color-primary: #123456;',
    '  --shadow-a: 0 1px 2px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.2);',
    '}',
    '.dark {',
    '  --color-primary: #abcdef;',
    '}',
    '.some-component {',
    '  --local-only: 1px;',
    '}',
  ].join('\n');
  const decls = parseCssTokens(css, 'a.css');
  eq(decls.map((d) => `${d.name}@${d.scope}`), ['--color-primary@light', '--shadow-a@light', '--color-primary@dark'],
    'A2: 전역 자리(:root/.dark)만 채택 — 컴포넌트 지역 변수는 토큰이 아니다');
  eq(decls[0].line, 2, 'A3: 줄 번호(정의 열기가 이 값으로 이동한다)');
  ok(decls[1].value.includes('0 2px 4px'), 'A4: 여러 줄/쉼표 값도 통째로');

  eq(scopeOfSelector('@theme'), 'light', 'A5: Tailwind @theme는 라이트 자리');
  eq(scopeOfSelector('@theme inline'), 'light', 'A6: @theme inline도 마찬가지');
  eq(scopeOfSelector('.dark'), 'dark', 'A7: .dark');
  eq(scopeOfSelector('html.dark'), 'dark', 'A8: html.dark');
  eq(scopeOfSelector('[data-theme="dark"]'), 'dark', 'A9: data-theme 방식');
  eq(scopeOfSelector('@media (prefers-color-scheme: dark)'), 'dark', 'A10: OS 다크 미디어쿼리');
  eq(scopeOfSelector('.dark-blue-box'), null, 'A11: 이름에 dark가 섞인 컴포넌트는 다크가 아니다');
  eq(scopeOfSelector('.card'), null, 'A12: 평범한 선택자는 토큰 자리가 아니다');

  // 중첩 — 미디어쿼리 안의 :root
  const nested = '@media (prefers-color-scheme: dark) {\n :root {\n  --x: 1px;\n }\n}';
  eq(parseCssTokens(nested, 'b.css').map((d) => d.scope), ['dark'], 'A13: 다크 미디어쿼리 안은 다크로 상속');
}

// ═══ B. import 순서 ══════════════════════════════════════════════════════════
console.log('\n── B. app.css @import ──');
{
  const app = [
    "@import 'tailwindcss';",
    "@import './tokens/primitive.css';",
    "@import './tokens/theme-light.css';",
    "/* @import './themes/theme-example-project.css'; ← 투입 시 주석 해제 */",
    "@import './themes/theme-default.css';",
  ].join('\n');
  eq(parseImportOrder(app), ['tokens/primitive.css', 'tokens/theme-light.css', 'themes/theme-default.css'],
    'B1: 상대경로만·선언 순서대로 — ★주석 처리된 테마는 제외(안 쓰는 테마 색이 섞이면 안 된다)');
  eq(parseImportOrder("@import url('./a.css');"), ['a.css'], 'B2: url() 형태');
  eq(parseImportOrder("@import 'https://x/y.css';"), [], 'B3: 외부 URL은 읽을 수 없으므로 제외');
}

// ═══ C. 덮어쓰기 순서 ════════════════════════════════════════════════════════
console.log('\n── C. 순서가 값을 바꾼다 ──');
{
  const files: ITokenFile[] = [
    { path: 'tokens/primitive.css', text: '@theme {\n --color-brand-500: #465fff;\n}' },
    { path: 'tokens/theme-light.css', text: ':root {\n --color-primary: var(--color-brand-500);\n}' },
    // 테마가 primitive의 brand를 덮어쓴다 — 이게 실제 scaffold 구조다.
    { path: 'themes/theme-default.css', text: '@theme {\n --color-brand-500: #499ed8;\n}' },
  ];
  const set = buildTokenSet(files);
  eq(findToken(set.tokens, '--color-primary')?.light?.resolved, '#499ed8',
    'C1: ★나중 파일이 이긴다 — 테마가 덮어쓴 brand가 최종 색');
  eq(findToken(set.tokens, '--color-primary')?.light?.chain, ['--color-brand-500'], 'C2: 경유한 참조를 근거로 남긴다');

  // 순서를 뒤집으면 값이 달라진다 = 이 모듈이 순서에 의존한다는 증거(정렬 금지 회귀 가드).
  const reversed = buildTokenSet([files[2], files[0], files[1]]);
  eq(findToken(reversed.tokens, '--color-primary')?.light?.resolved, '#465fff',
    'C3: 순서를 바꾸면 값도 바뀐다(파일 목록을 정렬하면 안 되는 이유)');

  eq(findToken(set.tokens, '--color-brand-500')?.light?.file, 'themes/theme-default.css',
    'C4: 출처도 이긴 선언을 가리킨다');
}

// ═══ D. 라이트 · 다크 ════════════════════════════════════════════════════════
console.log('\n── D. 라이트/다크 ──');
{
  const set = buildTokenSet([{
    path: 't.css',
    text: [
      '@theme { --color-brand-400: #7592ff; --color-brand-500: #465fff; }',
      ':root { --color-primary: var(--color-brand-500); --radius: 8px; }',
      '.dark { --color-primary: var(--color-brand-400); }',
    ].join('\n'),
  }]);
  const primary = findToken(set.tokens, '--color-primary');
  eq(primary?.light?.resolved, '#465fff', 'D1: 라이트');
  eq(primary?.dark?.resolved, '#7592ff', 'D2: 다크는 따로 해소');
  eq(findToken(set.tokens, '--radius')?.dark, null, 'D3: 다크에서 재정의 안 하면 null("같음"이 사실)');
  eq(set.counts.overriddenInDark, 1, 'D4: 다크 재정의 개수');

  // ★ 간접 변화 — 자기는 그대로인데 **참조하는 토큰**이 다크에서 바뀌는 경우.
  const indirect = buildTokenSet([{
    path: 'i.css',
    text: [
      ':root { --base: #ffffff; --surface: var(--base); }',
      '.dark { --base: #000000; }',
    ].join('\n'),
  }]);
  eq(findToken(indirect.tokens, '--surface')?.dark?.resolved, '#000000',
    'D5: 재정의는 없지만 참조가 바뀌어 다크 값이 달라진다(놓치면 거짓말이 된다)');
}

// ═══ E. var 체인 · 모르면 모른다 ═════════════════════════════════════════════
console.log('\n── E. var 해소 ──');
{
  const table = new Map([['--a', 'var(--b)'], ['--b', '#fff']]);
  eq(resolveValue('var(--a)', table).resolved, '#fff', 'E1: 중첩 체인');
  eq(resolveValue('var(--a)', table).chain, ['--a', '--b'], 'E2: 경유 기록');
  eq(resolveValue('var(--nope)', table).resolved, 'var(--nope)', 'E3: 모르는 참조는 원문 유지(값을 지어내지 않는다)');
  eq(resolveValue('var(--nope, 12px)', table).resolved, '12px', 'E4: 대체값이 있으면 그걸 쓴다');
  eq(resolveValue('calc(var(--b) * 2)', table).resolved, 'calc(#fff * 2)', 'E5: calc는 계산하지 않고 치환만');

  const cyclic = new Map([['--x', 'var(--y)'], ['--y', 'var(--x)']]);
  ok(resolveValue('var(--x)', cyclic).resolved.includes('var('), 'E6: 순환은 끊고 남긴다(무한루프 없음)');

  eq(resolveValue('1px solid var(--b)', table).resolved, '1px solid #fff', 'E7: 값 일부만 참조여도 푼다');
}

// ═══ F. 분류 · 검색 ══════════════════════════════════════════════════════════
console.log('\n── F. 분류 · 검색 ──');
{
  ok(isColorValue('#499ed8'), 'F1: hex');
  ok(isColorValue('rgba(73, 158, 216, 0.1)'), 'F2: rgba');
  ok(isColorValue('transparent'), 'F3: 키워드');
  ok(!isColorValue('0px 1px 2px rgba(0,0,0,0.05)'), 'F4: ★그림자는 색이 아니다(안에 rgba가 있어도)');

  eq(classifyToken('--color-primary', '#fff'), 'color', 'F5: 이름 접두사 우선');
  eq(classifyToken('--shadow-theme-md', '0 1px 2px rgba(0,0,0,.1)'), 'shadow', 'F6: 그림자');
  eq(classifyToken('--background', '#f0f3f7'), 'color', 'F7: 접두사 없는 시맨틱 토큰은 값으로 판정');
  eq(classifyToken('--radius', '0.5rem'), 'size', 'F8: 크기');
  eq(classifyToken('--z-index-99', '99'), 'number', 'F9: 숫자');
  eq(classifyToken('--font-sans', "'Geist Variable', sans-serif"), 'font', 'F10: 글꼴');

  eq(groupOf('--color-brand-500'), 'color', 'F11: 그룹 = 첫 세그먼트');
  eq(groupOf('--z-index-9'), 'z-index', 'F12: 두 단어 접두사 예외');

  const set = buildTokenSet([{
    path: 's.css',
    text: ':root { --color-brand-500: #499ed8; --shadow-a: 0 1px 2px #000; --radius: 8px; }',
  }]);
  eq(searchTokens(set.tokens, 'brand').map((t) => t.name), ['--color-brand-500'], 'F13: 이름 검색');
  eq(searchTokens(set.tokens, '499ed8').map((t) => t.name), ['--color-brand-500'], 'F14: ★값으로도 찾는다');
  eq(searchTokens(set.tokens, '그림자').map((t) => t.name), ['--shadow-a'], 'F15: 한글 별칭');
  eq(searchTokens(set.tokens, '색').map((t) => t.name), ['--color-brand-500'], 'F16: 한 글자 한글 별칭');
  eq(searchTokens(set.tokens, '').length, 3, 'F17: 빈 검색은 전체');
}

// ═══ G. 실 scaffold 스모크 + hover ═══════════════════════════════════════════
console.log('\n── G. 실 자료 · hover ──');
{
  // 합성 CSS로 hover 계약을 고정하고, 실 scaffold가 있으면 그 파일로 한 번 더 돌린다.
  eq(cssVarAt('  color: var(--color-primary);', 20)?.name, '--color-primary', 'G1: var() 안에서 이름 추출');
  eq(cssVarAt('  --color-primary: #fff;', 6)?.name, '--color-primary', 'G2: 선언부에서도');
  eq(cssVarAt('  <div className="bg-brand-500">', 22), null, 'G3: ★Tailwind 클래스는 토큰이 아니다(-- 로 시작해야 한다)');
  eq(cssVarAt('  const a = 1;', 9), null, 'G4: 평범한 식별자는 아니다');

  const set = buildTokenSet([{
    path: 'tokens/theme.css',
    text: [
      '@theme { --color-brand-500: #499ed8; --color-brand-400: #64adde; }',
      ':root { --color-primary: var(--color-brand-500); }',
      '.dark { --color-primary: var(--color-brand-400); }',
    ].join('\n'),
  }]);
  const card = resolveTokenHover('  color: var(--color-primary);', 20, set.tokens);
  eq(card?.kind, 'token', 'G5: 토큰 hover 카드');
  ok(card!.body.includes('#499ed8') && card!.body.includes('#64adde'), 'G6: 라이트·다크를 함께 보여준다');
  ok(card!.body.includes('data:image/svg+xml'), 'G7: 색 견본(SVG)을 넣는다');
  eq(card?.definition?.file, 'tokens/theme.css', 'G8: 정의 파일');
  eq(resolveTokenHover('  color: var(--nope);', 18, set.tokens), null, 'G9: 모르는 토큰엔 hover 없음');
  eq(resolveTokenHover('  color: var(--color-primary);', 20, []), null, 'G10: 토큰 자료가 없으면 조용히 양보');

  const md = renderHoverMarkdown(card!);
  ok(md.includes('command:axiom-ai.openDesignTokens'), 'G11: 토큰 브라우저 딥링크');
  ok(md.includes('command:axiom-ai.openTokenDefinition'), 'G12: 정의 열기 링크');

  // ── 실 scaffold(있을 때만) ──
  const SCAFFOLD = path.join('C:', 'redsky', 'work', 'react', 'single_react_new_nicfirst', 'react-app-scaffold');
  const stylesRoot = path.join(SCAFFOLD, 'src', 'assets', 'styles');
  if (!fs.existsSync(stylesRoot)) {
    console.log('  ⏭  실 scaffold 없음 — G13~ 생략(다른 PC에서는 정상)');
  } else {
    const app = fs.readFileSync(path.join(stylesRoot, 'app.css'), 'utf8');
    const order = parseImportOrder(app);
    const files = order
      .filter((p) => fs.existsSync(path.join(stylesRoot, p)))
      .map((p) => ({ path: p, text: fs.readFileSync(path.join(stylesRoot, p), 'utf8') }));
    const real = buildTokenSet(files);

    ok(real.counts.total > 100, `G13: 실 토큰 조립 (${real.counts.total}개)`);
    ok(real.counts.colors > 100, `G14: 색 토큰 (${real.counts.colors}개)`);
    ok(real.counts.overriddenInDark > 10, `G15: 다크 재정의 (${real.counts.overriddenInDark}개)`);

    // ★ 미해소 var()가 남으면 체인 해소가 실패한 것이다 — 화면에 `var(--x)`가 그대로 뜨면 쓸모가 없다.
    const unresolved = real.tokens.filter(
      (t) => t.light?.resolved.includes('var(') || t.dark?.resolved.includes('var('),
    );
    eq(unresolved.map((t) => t.name).slice(0, 5), [], 'G16: 실 자료에서 못 푼 var() 없음');

    // 색 토큰의 최종 값은 브라우저가 색으로 읽을 수 있는 형태여야 한다(견본이 빈칸이 되지 않게).
    const badColors = real.tokens
      .filter((t) => t.kind === 'color')
      .filter((t) => !(t.light ? isColorValue(t.light.resolved) : true))
      .map((t) => `${t.name}=${t.light?.resolved}`);
    eq(badColors.slice(0, 5), [], 'G17: 색으로 분류된 토큰의 최종 값이 전부 실제 색');

    const primary = findToken(real.tokens, '--color-primary');
    ok(!!primary?.light && /^#|^rgb/.test(primary.light.resolved), `G18: --color-primary 라이트 = ${primary?.light?.resolved}`);
    ok(!!primary?.dark, 'G19: --color-primary 는 다크에서 다른 값');
  }
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
