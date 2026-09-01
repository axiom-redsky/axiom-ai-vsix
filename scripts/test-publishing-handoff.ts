/**
 * 퍼블리싱 포팅(D1) 테스트 — 대상 경로 · import 재작성 · 라우트 승계 · 충돌 · 라우터 등록.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 D1.
 *
 * 이 하니스가 지키려는 것:
 *  ① **퍼블리셔가 정한 것을 그대로 옮긴다**(C) — 주소(`example-page`)와 화면 이름(`예제 페이지`)은
 *     이미 퍼블리싱 라우터에 적혀 있다. 새로 지어내면 그건 남의 결정을 덮어쓰는 것이다.
 *  ② **import를 안 고치면 조용히 썩는다**(B) — 옮긴 페이지가 `@/publishing/…`을 계속 바라봐도
 *     컴파일은 된다. 나중에 퍼블리싱 폴더를 지우는 순간 화면이 죽는다.
 *  ③ **덮어쓰지 않는다**(D) — 이미 있는 파일은 건너뛰고 그 사실을 말한다.
 *  ④ **멱등**(E) — 두 번 돌려도 라우트가 두 줄 생기지 않는다.
 *  ⑤ **실 자료 스모크**(F) — 실제 scaffold의 publishing 폴더로 한 번 돌린다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  handoffTarget, kebab, planPublishingHandoff, publishingDomains, readPublishedRoutes,
  replaceRouteName, rewritePublishingImports, type IWorkspaceFile,
} from '../src/ai/publishing/PublishingHandoff';
import { appendRouteToDomainRouter, appendDomainToRootRouter } from '../src/ai/router/RouterRegistration';
import { buildRouterMap } from '../src/ai/router/RouterMap';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

// ── 테스트용 퍼블리싱 산출물(실제 scaffold 모양 그대로) ──
const PUB_ROUTER = [
  "import type { TAppRoute } from '@/types/router';",
  "import loadable from '@loadable/component';",
  '',
  "const ExamplePage = loadable(() => import('@/publishing/example/pages/ExamplePage'));",
  '',
  'const routes: TAppRoute[] = [',
  '  {',
  "    path: 'example-page', // kebab-case",
  '    element: <ExamplePage />,',
  "    name: '예제 페이지',",
  '  },',
  '];',
  '',
  'export default routes;',
].join('\n');

const PUB_PAGE = [
  "import { ExampleCard } from '@/publishing/example/components/ExampleCard';",
  "import { cn } from '@/shared/utils/cn';",
  '',
  'export default function ExamplePage() {',
  '  return <div className={cn("p-6")}><ExampleCard title="x" /></div>;',
  '}',
].join('\n');

const PUB_CARD = [
  "import { cn } from '@/shared/utils/cn';",
  'export function ExampleCard({ title }: { title: string }) {',
  '  return <div className={cn("border")}>{title}</div>;',
  '}',
].join('\n');

const DOMAIN_ROUTER = [
  "import type { TAppRoute } from '@/types/router';",
  "import loadable from '@loadable/component';",
  '',
  "const BlankPage = loadable(() => import('@/domains/example/pages/BlankPage'));",
  '',
  'const routes: TAppRoute[] = [',
  '  {',
  "    path: 'blank-page',",
  '    element: <BlankPage />,',
  "    name: '빈 페이지',",
  '  },',
  '];',
  '',
  'export default routes;',
].join('\n');

function pubFiles(): IWorkspaceFile[] {
  return [
    { path: 'src/publishing/example/router/index.tsx', text: PUB_ROUTER },
    { path: 'src/publishing/example/pages/ExamplePage.tsx', text: PUB_PAGE },
    { path: 'src/publishing/example/components/ExampleCard.tsx', text: PUB_CARD },
    { path: 'src/publishing/example/components/ExampleCard.stories.tsx', text: '// story' },
  ];
}

// ═══ A. 경로 규칙 ════════════════════════════════════════════════════════════
console.log('\n── A. 대상 경로 ──');
{
  eq(handoffTarget('src/publishing/example/pages/ExamplePage.tsx', 'example'),
    'src/domains/example/pages/ExamplePage.tsx', 'A1: 화면은 domains/<도메인>/pages');
  eq(handoffTarget('src/publishing/example/components/ExampleCard.tsx', 'example'),
    'src/domains/example/components/ExampleCard.tsx', 'A2: 부품은 domains/<도메인>/components');
  eq(handoffTarget('src/publishing/example/pages/sub/Deep.tsx', 'biz'),
    'src/domains/biz/pages/sub/Deep.tsx', 'A3: 하위 폴더 구조 유지');
  eq(handoffTarget('src/publishing/README.md', 'example'), null, 'A4: pages·components 밖은 대상이 아니다');
  eq(publishingDomains(['src/publishing/a/pages/X.tsx', 'src/publishing/b/x.ts', 'src/domains/c/x.ts']),
    ['a', 'b'], 'A5: 퍼블리싱 도메인 목록');
  eq(kebab('ExamplePage'), 'example', 'A6: Page 접미사를 떼고 kebab');
  eq(kebab('AccountApplyForm'), 'account-apply-form', 'A7: 여러 단어');
}

// ═══ B. import 재작성 ════════════════════════════════════════════════════════
console.log('\n── B. import 재작성 ──');
{
  const moves = new Map([['@/publishing/example/components/ExampleCard', '@/domains/example/components/ExampleCard']]);
  const out = rewritePublishingImports(PUB_PAGE, moves);
  ok(out.includes("from '@/domains/example/components/ExampleCard'"), 'B1: ★퍼블리싱 경로를 새 위치로');
  ok(!out.includes('@/publishing/'), 'B2: 퍼블리싱 참조가 남지 않는다');
  ok(out.includes("from '@/shared/utils/cn'"), 'B3: 퍼블리싱이 아닌 import는 그대로');
  eq(rewritePublishingImports("import X from '@/publishing/other/x';", moves),
    "import X from '@/publishing/other/x';", 'B4: 옮기지 않는 것은 건드리지 않는다(모르는 걸 고치면 더 나쁘다)');
  ok(rewritePublishingImports("import X from '@/publishing/example/components/ExampleCard.tsx';", moves)
    .includes('@/domains/'), 'B5: 확장자가 붙어 있어도 매칭');
}

// ═══ C. 퍼블리셔가 정한 라우트 승계 ══════════════════════════════════════════
console.log('\n── C. 라우트 승계 ──');
{
  const routes = readPublishedRoutes(PUB_ROUTER, 'src/publishing/example/router/index.tsx');
  eq(routes.length, 1, 'C1: 퍼블리싱 라우터를 읽는다');
  eq([routes[0].component, routes[0].path, routes[0].name],
    ['ExamplePage', 'example-page', '예제 페이지'], 'C2: ★주소·이름을 그대로 읽는다');

  const plan = planPublishingHandoff({
    domain: 'example',
    publishingFiles: pubFiles(),
    existingPaths: ['src/domains/example/pages/BlankPage.tsx'],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
  });
  const router = plan.updates.find((u) => u.path.endsWith('domains/example/router/index.tsx'));
  ok(!!router, 'C3: 도메인 라우터를 고친다');
  ok(router!.text.includes("path: 'example-page'"), 'C4: ★퍼블리셔가 정한 주소 그대로');
  ok(router!.text.includes("name: '예제 페이지'"), 'C5: ★퍼블리셔가 정한 화면 이름 그대로(컴포넌트명으로 덮어쓰지 않는다)');
  ok(router!.text.includes("import('@/domains/example/pages/ExamplePage')"), 'C6: 새 위치를 가리키는 loadable');
  ok(router!.text.includes("path: 'blank-page'"), 'C7: 기존 라우트를 지우지 않는다');

  // 주소가 안 적힌 페이지 — 지어내되 그 사실을 말한다.
  const noRoute = planPublishingHandoff({
    domain: 'example',
    publishingFiles: [
      { path: 'src/publishing/example/pages/LonePage.tsx', text: 'export default function LonePage() { return null; }' },
    ],
    existingPaths: [],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
  });
  ok(noRoute.updates[0].text.includes("path: 'lone'"), 'C8: 주소가 없으면 파일명에서 만든다');
  ok(noRoute.notices.some((n) => n.includes('파일명에서')), 'C9: ★지어낸 것은 지어냈다고 말한다');
}

// ═══ D. 옮길 것 고르기 · 충돌 ════════════════════════════════════════════════
console.log('\n── D. 선택 · 충돌 ──');
{
  const plan = planPublishingHandoff({
    domain: 'example',
    publishingFiles: pubFiles(),
    existingPaths: [],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
  });
  eq(plan.moves.map((m) => `${m.kind}:${m.to}`),
    ['page:src/domains/example/pages/ExamplePage.tsx', 'component:src/domains/example/components/ExampleCard.tsx'],
    'D1: 화면 + 그 화면이 쓰는 부품을 함께 옮긴다');
  ok(!plan.moves.some((m) => m.to.includes('.stories.')), 'D2: ★Storybook 파일은 퍼블리셔 자산이라 두고 간다');
  ok(plan.notices.some((n) => n.includes('그대로 둡니다')), 'D3: 원본을 지우지 않는다고 먼저 말한다');
  ok(plan.moves[0].text.includes('@/domains/example/components/ExampleCard'), 'D4: 옮길 내용은 재작성 완료본');

  // 이미 있는 파일 — 덮어쓰지 않는다.
  const conflict = planPublishingHandoff({
    domain: 'example',
    publishingFiles: pubFiles(),
    existingPaths: ['src/domains/example/pages/ExamplePage.tsx'],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
  });
  eq(conflict.moves.filter((m) => m.conflict).map((m) => m.to),
    ['src/domains/example/pages/ExamplePage.tsx'], 'D5: ★이미 있으면 충돌 표시');
  ok(conflict.notices.some((n) => n.includes('건너뜁니다')), 'D6: 건너뛴다고 말한다');
  ok(!conflict.updates.some((u) => u.text.includes("path: 'example-page'")),
    'D7: 건너뛴 화면은 라우트도 등록하지 않는다(없는 파일을 가리키면 안 된다)');

  // 페이지 고르기
  const picked = planPublishingHandoff({
    domain: 'example',
    publishingFiles: [
      ...pubFiles(),
      { path: 'src/publishing/example/pages/OtherPage.tsx', text: 'export default function OtherPage(){return null;}' },
    ],
    existingPaths: [],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
    onlyPages: ['OtherPage'],
  });
  eq(picked.moves.map((m) => m.to), ['src/domains/example/pages/OtherPage.tsx'],
    'D8: 고른 화면만(그 화면이 안 쓰는 부품은 안 따라온다)');
}

// ═══ E. 도메인 라우터가 없을 때 · 멱등 ═══════════════════════════════════════
console.log('\n── E. 새 도메인 · 멱등 ──');
{
  const rootRouter = [
    "import type { TAppRoute } from '@/types/router';",
    "import { RootLayout } from '@/shared/layouts';",
    'const routes: TAppRoute[] = [',
    "  { path: '/', element: <RootLayout /> },",
    '];',
    'export default routes;',
  ].join('\n');

  const plan = planPublishingHandoff({
    domain: 'newbiz',
    publishingFiles: [
      { path: 'src/publishing/newbiz/pages/BizPage.tsx', text: 'export default function BizPage(){return null;}' },
    ],
    existingPaths: [],
    domainRouterText: null,
    rootRouterText: rootRouter,
  });
  const domainRouter = plan.updates.find((u) => u.path.includes('domains/newbiz/router'));
  ok(domainRouter?.create === true, 'E1: 도메인 라우터를 새로 만든다');
  ok(domainRouter!.text.includes("path: 'biz'"), 'E2: 라우트가 들어 있다');
  const root = plan.updates.find((u) => u.path === 'src/shared/router/index.tsx');
  ok(!!root, 'E3: ★루트 라우터에도 등록한다(안 하면 주소가 안 열린다)');
  ok(root!.text.includes("children: NewbizRouter"), 'E4: 도메인 라우터를 걸어 준다');

  // 멱등 — 이미 등록된 라우트를 또 등록하지 않는다.
  const once = appendRouteToDomainRouter(DOMAIN_ROUTER, 'BlankPage', 'example', 'blank-page');
  eq(once, DOMAIN_ROUTER, 'E5: ★이미 있는 라우트는 다시 추가하지 않는다');
  const twice = appendRouteToDomainRouter(
    appendRouteToDomainRouter(DOMAIN_ROUTER, 'NewPage', 'example', 'new-page'),
    'NewPage', 'example', 'new-page',
  );
  eq((twice.match(/path: 'new-page'/g) ?? []).length, 1, 'E6: 두 번 돌려도 한 줄');
  const rootTwice = appendDomainToRootRouter(appendDomainToRootRouter(rootRouter, 'x', 'X'), 'x', 'X');
  eq((rootTwice.match(/children: XRouter/g) ?? []).length, 1, 'E7: 루트 등록도 멱등');

  eq(replaceRouteName("element: <A />,\n    name: 'A',", 'A', '가 화면'),
    "element: <A />,\n    name: '가 화면',", 'E8: 그 컴포넌트의 이름만 바꾼다');
  eq(replaceRouteName("element: <B />,\n    name: 'B',", 'A', '가 화면'),
    "element: <B />,\n    name: 'B',", 'E9: 다른 라우트는 건드리지 않는다');
}

// ═══ F. 옮긴 결과가 실제로 열리는가(B4로 교차 검증) ══════════════════════════
console.log('\n── F. 옮긴 뒤 주소가 열리는지 ──');
{
  const plan = planPublishingHandoff({
    domain: 'example',
    publishingFiles: pubFiles(),
    existingPaths: [],
    domainRouterText: DOMAIN_ROUTER,
    rootRouterText: null,
  });
  const routerText = plan.updates.find((u) => u.path.includes('router'))!.text;

  // 포팅 결과를 라우터 맵(B4)에 그대로 넣어 본다 — "주소 없는 페이지"가 사라져야 성공이다.
  const map = buildRouterMap({
    files: [
      {
        path: 'src/shared/router/index.tsx',
        text: [
          "import ExampleRouter from '@/domains/example/router';",
          "const routes = [{ path: '/example', element: <RootLayout />, children: ExampleRouter }];",
          'export default routes;',
        ].join('\n'),
      },
      { path: 'src/domains/example/router/index.tsx', text: routerText },
    ],
    pageFiles: ['src/domains/example/pages/ExamplePage.tsx', 'src/domains/example/pages/BlankPage.tsx'],
  });
  eq(map.screens.map((s) => s.fullPath).sort(), ['/example/blank-page', '/example/example-page'],
    'F1: ★포팅한 화면이 실제 주소로 열린다(B4가 확인)');
  eq(map.issues.filter((i) => i.kind === 'orphan-page').length, 0,
    'F2: ★"주소 없는 페이지"가 남지 않는다 — 포팅이 라우터 등록까지 닫았다는 증거');
  eq(map.screens.find((s) => s.fullPath === '/example/example-page')?.name, '예제 페이지',
    'F3: 퍼블리셔가 정한 이름이 최종 맵까지 살아남는다');
}

// ═══ G. 실 자료 스모크 ═══════════════════════════════════════════════════════
console.log('\n── G. 실 scaffold 스모크 ──');
{
  const ROOT = path.join('C:', 'redsky', 'work', 'react', 'single_react_new_nicfirst', 'react-app-scaffold');
  const pubRoot = path.join(ROOT, 'src', 'publishing');
  if (!fs.existsSync(pubRoot)) {
    console.log('  ⏭  실 scaffold 없음 — G1~ 생략(다른 PC에서는 정상)');
  } else {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
      return out;
    };
    const all = walk(pubRoot);
    const domains = publishingDomains(all);
    ok(domains.length > 0, `G1: 실 퍼블리싱 도메인 (${domains.join(', ')})`);

    const files: IWorkspaceFile[] = all
      .filter((p) => /\.[jt]sx?$/.test(p))
      .map((p) => ({ path: p, text: fs.readFileSync(path.join(ROOT, p), 'utf8') }));
    const domainRouterPath = path.join(ROOT, 'src', 'domains', domains[0], 'router', 'index.tsx');
    const plan = planPublishingHandoff({
      domain: domains[0],
      publishingFiles: files,
      existingPaths: [],
      domainRouterText: fs.existsSync(domainRouterPath) ? fs.readFileSync(domainRouterPath, 'utf8') : null,
      rootRouterText: null,
    });

    eq(plan.blocked, null, 'G2: 실 자료로 계획이 선다');
    ok(plan.moves.some((m) => m.kind === 'page'), 'G3: 옮길 화면이 있다');
    ok(plan.moves.every((m) => !m.text.includes('@/publishing/')),
      'G4: ★옮길 내용에 퍼블리싱 참조가 하나도 안 남는다');
    const realRouter = plan.updates.find((u) => u.path.includes('router'));
    ok(!!realRouter && realRouter.text.includes('@/domains/'), 'G5: 라우터가 새 위치를 가리킨다');
    // 퍼블리셔가 정한 주소가 실제로 승계됐는지(실 파일의 값으로).
    for (const r of plan.routes) {
      ok(realRouter!.text.includes(`path: '${r.path}'`), `G6: 실 주소 승계 — ${r.path}`);
    }
  }
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
