/**
 * 라우터 맵(B4) 테스트 — 파싱 · 중첩 · 경로 계산 · 미연결/고아 탐지 · 주소 hover.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 B4.
 *
 * 이 하니스가 지키려는 것:
 *  ① **주석이 진실을 바꾼다**(A·E) — 주석 처리된 import를 살아 있다고 읽으면 "연결됨"이라 거짓말하고,
 *     반대로 문자열 안의 `//`를 주석으로 지우면 경로가 깨진다. 둘 다 실제 파일에 있다.
 *  ② **경로 없는 계층**(C) — 레이아웃·인증 게이트는 path가 없다. 이걸 화면으로 세면 `/`가 여러 번
 *     선언된 것처럼 보여 "중복"을 잘못 신고한다(실 프로젝트에서 실제로 발생한 오탐).
 *  ③ **DEV/PROD 분기**(D) — 양쪽에 같은 경로가 들어 있다. 모르면 목록이 두 배가 되고 중복 경고가 뜬다.
 *  ④ **모르면 모른다고**(F) — 해석 못 한 children·없는 모듈은 조용히 버리지 않고 이슈로 남긴다.
 *  ⑤ **실 프로젝트 스모크**(H) — 합성 케이스는 실제 라우터가 어떻게 생겼는지 모른다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildRouterMap, joinPath, matchBracket, parseRouteFields, parseRouterFile, resolveModulePath,
  searchRoutes, splitTopLevel, stripComments, type IRouterFile,
} from '../src/ai/router/RouterMap';
import { isNavigationLine, resolveRouteHover, renderHoverMarkdown, stringAt } from '../src/ai/hover/ScaffoldHover';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

/** 테스트용 라우터 파일 묶음 만들기. */
function files(...entries: [string, string][]): IRouterFile[] {
  return entries.map(([p, text]) => ({ path: p, text }));
}

// ═══ A. 텍스트 다루기 ════════════════════════════════════════════════════════
console.log('\n── A. 주석 · 괄호 · 분리 ──');
{
  eq(stripComments("const a = '@/domains/x'; // 주석").trim(), "const a = '@/domains/x';",
    'A1: ★문자열 안의 `//`는 주석이 아니다(경로가 깨지면 전부 어긋난다)');
  eq(stripComments('a\n// 지움\nb').split('\n').length, 3, 'A2: 줄 수는 그대로(줄 번호 보존)');
  eq(stripComments('/* x\ny */z').split('\n').length, 2, 'A3: 블록 주석도 줄 보존');
  ok(stripComments("//import Main from '@/domains/main/router';").trim() === '',
    'A4: ★주석 처리된 import는 없는 것 — 이게 "연결 안 됨"의 근거다');

  eq(matchBracket('[a, [b], c]', 0), 10, 'A5: 중첩 괄호 짝');
  eq(matchBracket("['a]', b]", 0), 8, 'A6: 문자열 안의 괄호는 안 센다');
  eq(splitTopLevel('a, {b, c}, d').length, 3, 'A7: 최상위 쉼표만');
  eq(splitTopLevel("'a,b', c").length, 2, 'A8: 문자열 안 쉼표는 안 센다');
}

// ═══ B. 라우터 파일 파싱 ═════════════════════════════════════════════════════
console.log('\n── B. 파일 파싱 ──');
{
  const src = [
    "import type { TAppRoute } from '@/types/router';",
    "import loadable from '@loadable/component';",
    "import ExampleRouter from '@/domains/example/router';",
    "import AuthRouter, { protectedRoutes as Protected } from '@/domains/auth/router';",
    "//import MainRouter from '@/domains/main/router';",
    "const BlankPage = loadable(() => import('@/domains/example/pages/BlankPage'));",
    'const routes: TAppRoute[] = [',
    "  { path: 'blank', element: <BlankPage />, name: '빈 페이지' },",
    '];',
    'export default routes;',
  ].join('\n');
  const parsed = parseRouterFile(src, 'src/shared/router/index.tsx');

  eq(parsed.imports.get('ExampleRouter')?.module, '@/domains/example/router', 'B1: 라우터 default import');
  eq(parsed.imports.get('Protected')?.imported, 'protectedRoutes', 'B2: ★이름 있는 export도 라우트 배열이다');
  eq(parsed.imports.has('MainRouter'), false, 'B3: ★주석 처리된 import는 없다');
  eq(parsed.components.get('BlankPage'), '@/domains/example/pages/BlankPage', 'B4: loadable 페이지 연결');
  ok(parsed.arrays.has('routes') && parsed.arrays.has('default'), 'B5: `export default routes`를 default로도 등록');

  const fields = parseRouteFields("path: 'x', element: <Page />, name: '이름', children: Foo");
  eq([fields.path, fields.element, fields.name, fields.children], ['x', 'Page', '이름', 'Foo'], 'B6: 필드 추출');

  eq(resolveModulePath('@/domains/x/router', 'src/shared/router/index.tsx'), 'src/domains/x/router', 'B7: @ 별칭');
  eq(resolveModulePath('./sub', 'src/a/b/index.tsx'), 'src/a/b/sub', 'B8: 상대 경로');
}

// ═══ C. 경로 계산 · 경로 없는 계층 ═══════════════════════════════════════════
console.log('\n── C. 경로 계산 ──');
{
  eq(joinPath('/example', 'blank'), '/example/blank', 'C1: 이어 붙이기');
  eq(joinPath('/', 'x'), '/x', 'C2: 루트 아래');
  eq(joinPath('/a', '/b'), '/b', 'C3: `/`로 시작하면 절대 경로');
  eq(joinPath('/a', null), '/a', 'C4: ★경로 없는 계층은 부모를 물려받는다');
  eq(joinPath('/a/', 'b/'), '/a/b', 'C5: 슬래시 정리');

  // 레이아웃 두 겹을 지나 도달하는 실제 모양.
  const map = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      [
        "import Dash from '@/domains/dash/router';",
        'const routes = [',
        '  { path: "/", element: <ProtectedRoute />, children: [{ element: <RootLayout />, children: Dash }] },',
        '];',
        'export default routes;',
      ].join('\n'),
    ], [
      'src/domains/dash/router/index.tsx',
      [
        "import loadable from '@loadable/component';",
        "const Dashboard = loadable(() => import('@/domains/dash/pages/Dashboard'));",
        'const routes = [{ path: "/", element: <Dashboard />, name: "대시보드" }];',
        'export default routes;',
      ].join('\n'),
    ]),
  });
  eq(map.screens.map((s) => s.fullPath), ['/'], 'C6: 레이아웃 두 겹을 지나 화면 하나');
  eq(map.screens[0].name, '대시보드', 'C7: 이름은 잎에서');
  eq(map.screens[0].componentFile, 'src/domains/dash/pages/Dashboard', 'C8: 화면 파일까지 해소');
  eq(map.issues.filter((i) => i.kind === 'duplicate-path').length, 0,
    'C9: ★레이아웃은 화면이 아니다 — `/`가 세 번 나와도 중복이 아니다(실 프로젝트 오탐 재현 방지)');
}

// ═══ D. DEV/PROD 분기 ════════════════════════════════════════════════════════
console.log('\n── D. DEV/PROD 분기 ──');
{
  const map = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      [
        "import loadable from '@loadable/component';",
        "const A = loadable(() => import('@/domains/x/pages/A'));",
        "const B = loadable(() => import('@/domains/x/pages/B'));",
        'const routes = [',
        '  ...(import.meta.env.DEV',
        '    ? [{ path: "/x", element: <A /> }, { path: "/only-dev", element: <B /> }]',
        '    : [{ path: "/x", element: <A /> }]),',
        '];',
        'export default routes;',
      ].join('\n'),
    ]),
  });
  eq(map.screens.map((s) => `${s.fullPath}[${s.env}]`), ['/x[always]', '/only-dev[dev]'],
    'D1: ★양쪽 분기에 다 있으면 한 줄(always) · 한쪽만 있으면 그 표시');
  eq(map.issues.filter((i) => i.kind === 'duplicate-path').length, 0, 'D2: 분기 쌍은 중복이 아니다');
}

// ═══ E. 미연결 라우터 · 고아 페이지 ══════════════════════════════════════════
console.log('\n── E. 연결 안 됨 · 주소 없음 ──');
{
  const map = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      [
        "import Live from '@/domains/live/router';",
        "//import Dead from '@/domains/dead/router';",
        'const routes = [{ path: "/live", element: <RootLayout />, children: Live }];',
        'export default routes;',
      ].join('\n'),
    ], [
      'src/domains/live/router/index.tsx',
      [
        "import loadable from '@loadable/component';",
        "const LivePage = loadable(() => import('@/domains/live/pages/LivePage'));",
        'const routes = [{ path: "list", element: <LivePage />, name: "목록" }];',
        'export default routes;',
      ].join('\n'),
    ], [
      'src/domains/dead/router/index.tsx',
      [
        "import loadable from '@loadable/component';",
        "const DeadPage = loadable(() => import('@/domains/dead/pages/DeadPage'));",
        'const routes = [{ path: "x", element: <DeadPage /> }];',
        'export default routes;',
      ].join('\n'),
    ]),
    pageFiles: [
      'src/domains/live/pages/LivePage.tsx',
      'src/domains/dead/pages/DeadPage.tsx',
      'src/domains/live/pages/Forgotten.tsx',
    ],
  });

  eq(map.screens.map((s) => s.fullPath), ['/live/list'], 'E1: 연결된 것만 화면');
  const unreachable = map.issues.filter((i) => i.kind === 'unreachable-router');
  eq(unreachable.length, 1, 'E2: ★주석 처리된 import → 그 라우터는 연결 안 됨');
  ok(unreachable[0].file === 'src/domains/dead/router/index.tsx', 'E3: 어느 파일인지 짚는다');

  const orphans = map.issues.filter((i) => i.kind === 'orphan-page');
  eq(orphans.map((o) => o.file), ['src/domains/dead/pages/DeadPage.tsx', 'src/domains/live/pages/Forgotten.tsx'],
    'E4: 주소 없는 페이지 둘');
  ok((orphans[0].detail ?? '').includes('연결돼 있지 않'), 'E5: ★원인 구분 — 라우터엔 있는데 라우터가 안 걸림');
  ok((orphans[1].detail ?? '').includes('가리키지 않'), 'E6: ★원인 구분 — 아무도 안 가리킴');
  eq(map.counts.orphanPages, 2, 'E7: 개수');
}

// ═══ F. 중복 · 모르면 모른다고 ═══════════════════════════════════════════════
console.log('\n── F. 중복 · 해석 실패 ──');
{
  const dup = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      [
        'const routes = [',
        '  { path: "/a", element: <One /> },',
        '  { path: "/a", element: <Two /> },',
        '];',
        'export default routes;',
      ].join('\n'),
    ]),
  });
  const dupIssues = dup.issues.filter((i) => i.kind === 'duplicate-path');
  eq(dupIssues.length, 1, 'F1: 같은 주소 두 번');
  ok((dupIssues[0].message ?? '').includes('/a'), 'F2: 어떤 주소인지');
  ok((dupIssues[0].detail ?? '').includes('One') && (dupIssues[0].detail ?? '').includes('Two'),
    'F3: 두 선언 위치를 함께');

  const broken = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      'const routes = [{ path: "/a", children: Nowhere }];\nexport default routes;',
    ]),
  });
  eq(broken.issues.filter((i) => i.kind === 'unresolved-children').length, 1,
    'F4: ★못 찾은 children은 조용히 버리지 않고 남긴다');

  const missing = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      "import Gone from '@/domains/gone/router';\nconst routes = [{ path: '/g', children: Gone }];\nexport default routes;",
    ]),
  });
  eq(missing.issues.filter((i) => i.kind === 'missing-module').length, 1, 'F5: 없는 모듈도 남긴다');
}

// ═══ G. 검색 · 주소 hover ════════════════════════════════════════════════════
console.log('\n── G. 검색 · 주소 hover ──');
{
  const map = buildRouterMap({
    files: files([
      'src/shared/router/index.tsx',
      [
        "import loadable from '@loadable/component';",
        "const Blank = loadable(() => import('@/domains/example/pages/BlankPage'));",
        "const Detail = loadable(() => import('@/domains/example/pages/Detail'));",
        'const routes = [',
        '  { path: "/example/blank-page", element: <Blank />, name: "빈 페이지" },',
        '  { path: "/example/item/:id", element: <Detail />, name: "상세" },',
        '];',
        'export default routes;',
      ].join('\n'),
    ]),
  });
  const screens = map.screens;

  eq(searchRoutes(screens, 'blank').map((s) => s.fullPath), ['/example/blank-page'], 'G1: 주소 검색');
  eq(searchRoutes(screens, '빈').map((s) => s.name), ['빈 페이지'], 'G2: 한글 이름 검색');
  eq(searchRoutes(screens, 'Detail').map((s) => s.fullPath), ['/example/item/:id'], 'G3: 컴포넌트 검색');

  eq(stringAt("  $router.push('/a/b');", 20)?.value, '/a/b', 'G4: 따옴표 문자열 추출');
  eq(stringAt('  const x = 1;', 10), null, 'G5: 문자열 밖이면 null');
  ok(isNavigationLine("$router.push('/x')"), 'G6: 이동 문맥 인식');
  ok(isNavigationLine('<Link to="/x">'), 'G7: Link도');
  ok(!isNavigationLine("useApi('/api/employees')"), 'G8: ★API 호출은 이동이 아니다');

  const line = "    $router.push('/example/blank-page');";
  const card = resolveRouteHover(line, line.indexOf('blank') + 2, screens);
  eq(card?.kind, 'route', 'G9: 주소 hover');
  ok((card?.body ?? '').includes('빈 페이지'), 'G10: 어떤 화면인지');
  ok((card?.body ?? '').includes('BlankPage'), 'G11: 화면 파일');
  ok(renderHoverMarkdown(card!).includes('command:axiom-ai.openRouterMap'), 'G12: 라우터 맵 딥링크');

  // 동적 구간 — 실제 값을 넣은 주소도 그 라우트다.
  const dyn = "    $router.push('/example/item/42');";
  eq(resolveRouteHover(dyn, dyn.indexOf('42'), screens)?.id, '/example/item/:id', 'G13: :id 매칭');

  // ★ 없는 주소 — 이동 문맥일 때만 말한다.
  const typo = "    $router.push('/example/blank-pag');";
  const warn = resolveRouteHover(typo, typo.indexOf('blank') + 2, screens);
  ok((warn?.subtitle ?? '').includes('화면 없음'), 'G14: 오타 주소를 그 자리에서 잡는다');
  ok((warn?.body ?? '').includes('/example/blank-page'), 'G15: 비슷한 주소를 제안');
  const api = "    const { data } = useApi('/api/employees');";
  eq(resolveRouteHover(api, api.indexOf('/api') + 2, screens), null,
    'G16: ★API 경로에는 "화면이 없다"고 말하지 않는다(이동 문맥이 아니다)');
  eq(resolveRouteHover(line, line.indexOf('blank') + 2, []), null, 'G17: 라우터 자료가 없으면 조용히 양보');
}

// ═══ H. 실 프로젝트 스모크 ═══════════════════════════════════════════════════
console.log('\n── H. 실 프로젝트 스모크 ──');
{
  const ROOT = path.join('C:', 'redsky', 'work', 'react', 'single_react_new_nicfirst', 'react-app-scaffold');
  if (!fs.existsSync(path.join(ROOT, 'src'))) {
    console.log('  ⏭  실 scaffold 없음 — H1~ 생략(다른 PC에서는 정상)');
  } else {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', '__stories__'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.[jt]sx?$/.test(e.name)) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
      return out;
    };
    const all = walk(path.join(ROOT, 'src'));
    const routerFiles = all
      .filter((p) => /\/router\/[^/]+\.tsx?$/.test(p) && !p.startsWith('src/core/'))
      .map((p) => ({ path: p, text: fs.readFileSync(path.join(ROOT, p), 'utf8') }));
    const pageFiles = all.filter((p) => /^src\/(domains|publishing)\/[^/]+\/pages\/.*\.tsx$/.test(p));

    const map = buildRouterMap({ files: routerFiles, pageFiles });
    eq(map.entry, 'src/shared/router/index.tsx', 'H1: 진입점을 찾는다');
    ok(map.counts.screens > 40, `H2: 실 화면 (${map.counts.screens}개)`);

    // 모든 화면 주소는 `/`로 시작하고 중복 슬래시가 없어야 한다.
    const badPaths = map.screens.filter((s) => !s.fullPath.startsWith('/') || s.fullPath.includes('//'));
    eq(badPaths.map((s) => s.fullPath), [], 'H3: 주소 형식이 전부 정상');

    // 실제로 있는 경로 하나를 콕 집어 확인(중첩 3단계를 지나야 나온다).
    const calendar = map.screens.find((s) => s.fullPath === '/example/ui-components/calendar');
    ok(!!calendar, 'H4: 중첩을 지나 실제 주소가 계산된다');
    eq(calendar?.componentFile, 'src/domains/example/pages/ui-components/CalendarComponent', 'H5: 화면 파일까지');

    // 해석 실패가 남아 있으면 파서가 실제 문법을 못 따라간 것이다.
    const unresolved = map.issues.filter((i) => i.kind === 'unresolved-children' || i.kind === 'missing-module');
    eq(unresolved.map((i) => i.message), [], 'H6: ★실 파일에서 해석 실패 0건');

    // 레이아웃을 화면으로 세는 오탐이 없어야 한다(C9의 실 자료 판).
    const dup = map.issues.filter((i) => i.kind === 'duplicate-path');
    eq(dup.map((i) => i.message), [], 'H7: 실 자료에서 중복 오탐 0건');
  }
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
