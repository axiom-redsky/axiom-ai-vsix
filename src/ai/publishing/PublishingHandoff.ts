/**
 * 퍼블리싱 핸드오프 (계획서 §7 D1) — `src/publishing/`의 퍼블리셔 산출물을 `src/domains/`로 옮기는
 * **결정론 계획**을 만든다. 모델 호출 0.
 *
 * ## 왜 자동화할 값어치가 있나
 * 이건 취향 문제가 아니라 **scaffold가 문서로 정해 둔 계약**이다(`src/publishing/README.md`):
 *
 * | 폴더 | 핸드오프 목적지 |
 * |---|---|
 * | `pages/` | `src/domains/[name]/pages/` |
 * | `components/` | `src/shared/` 또는 `src/domains/[name]/components/` |
 *
 * 그런데 손으로 하면 매번 같은 자리에서 틀린다: import 경로(`@/publishing/...`)를 안 고치거나,
 * 라우터 등록을 빠뜨려 **주소 없는 페이지**가 되거나(§7 B4가 잡아내는 바로 그 상태), 퍼블리셔가
 * 정해 둔 `path`·`name`을 옮기다 바꿔 버린다.
 *
 * ## 이 층이 지키는 두 가지
 * 1. **퍼블리셔가 정한 것을 그대로 옮긴다** — 라우트 `path`·`name`은 퍼블리싱 라우터에 이미 적혀 있다.
 *    새로 지어내지 않고 그대로 가져간다(B4 파서를 그대로 재사용해 읽는다).
 * 2. **복사이지 이동이 아니다** — 원본을 지우지 않는다. 퍼블리셔는 계속 그 폴더에서 작업하고
 *    Storybook도 그 경로를 본다. 지우는 건 사람이 확인한 뒤 할 일이다(계획서에도 그렇게 적는다).
 *
 * vscode·fs 비의존(텍스트만 받는다) — 단위 테스트와 웹뷰에서 그대로 호출한다.
 */

import { parseRouterFile } from '../router/RouterMap';
import { appendDomainToRootRouter, appendRouteToDomainRouter } from '../router/RouterRegistration';

/** 워크스페이스에서 읽어 온 파일 하나(경로는 워크스페이스 기준 상대경로). */
export interface IWorkspaceFile {
  path: string;
  text: string;
}

/** 옮길 파일 한 건. */
export interface IHandoffMove {
  from: string;
  to: string;
  kind: 'page' | 'component';
  /** import 재작성이 끝난 최종 내용. */
  text: string;
  /** 대상 파일이 이미 있어 이번엔 건너뛴다. */
  conflict: boolean;
}

/** 고칠 파일 한 건(라우터 등록). */
export interface IHandoffUpdate {
  path: string;
  text: string;
  /** 새로 만드는 파일인가. */
  create: boolean;
  note: string;
}

/** 퍼블리싱 라우터가 이미 정해 둔 라우트. */
export interface IPublishedRoute {
  /** 페이지 컴포넌트 이름(`ExamplePage`). */
  component: string;
  /** 퍼블리셔가 정한 주소 조각(`example-page`). */
  path: string;
  /** 퍼블리셔가 정한 화면 이름(`예제 페이지`). */
  name: string | null;
  /** 그 컴포넌트의 퍼블리싱 파일 경로(확장자 없음). */
  sourceModule: string;
}

export interface IHandoffPlan {
  domain: string;
  moves: IHandoffMove[];
  updates: IHandoffUpdate[];
  /** 사람이 알아야 할 것(원본 유지·shared 판단·건너뛴 충돌 등). */
  notices: string[];
  /** 계획을 세울 수 없는 이유. null이면 실행 가능. */
  blocked: string | null;
  routes: IPublishedRoute[];
}

export interface IHandoffArgs {
  /** 옮길 도메인(`example`). */
  domain: string;
  /** `src/publishing/<domain>/**` 파일 전체. */
  publishingFiles: IWorkspaceFile[];
  /** 대상 도메인에 이미 있는 파일 경로들(충돌 판정용). */
  existingPaths: string[];
  /** 도메인 라우터 원문(없으면 null → 새로 만든다). */
  domainRouterText: string | null;
  /** 루트 라우터 원문(도메인 라우터를 새로 만들 때만 쓴다). */
  rootRouterText: string | null;
  /** 옮길 페이지 컴포넌트 이름 목록. 비우면 전부. */
  onlyPages?: string[];
}

// ── 경로 규칙 ────────────────────────────────────────────────────────────────

/** `src/publishing/example/pages/ExamplePage.tsx` → `src/domains/example/pages/ExamplePage.tsx` */
export function handoffTarget(publishingPath: string, domain: string): string | null {
  const m = publishingPath.match(/^src\/publishing\/[^/]+\/(pages|components)\/(.+)$/);
  if (!m) return null;
  return `src/domains/${domain}/${m[1]}/${m[2]}`;
}

/** 모듈 지정자에서 확장자·`/index`를 떼어 비교 가능한 형태로. */
function moduleKey(p: string): string {
  return p.replace(/\.(tsx|ts|jsx|js)$/, '').replace(/\/index$/, '');
}

/**
 * 옮긴 파일 안의 `@/publishing/<domain>/…` import를 새 위치로 고친다.
 *
 * ★ 이걸 빠뜨리면 옮긴 페이지가 **퍼블리싱 폴더를 계속 바라본다** — 컴파일은 되기 때문에
 * 아무도 눈치채지 못하고, 나중에 퍼블리싱 폴더를 지우는 순간 화면이 죽는다.
 */
export function rewritePublishingImports(text: string, moves: Map<string, string>): string {
  return text.replace(/(['"])(@\/publishing\/[^'"]+)\1/g, (whole, quote: string, spec: string) => {
    const to = moves.get(moduleKey(spec));
    return to ? `${quote}${to}${quote}` : whole;
  });
}

/** `src/domains/x/pages/Y.tsx` → `@/domains/x/pages/Y` (import에 쓰는 모양). */
function toModuleSpec(path: string): string {
  return `@/${moduleKey(path).replace(/^src\//, '')}`;
}

// ── 퍼블리싱 폴더 읽기 ────────────────────────────────────────────────────────

/** `src/publishing/<domain>/…` 경로들에서 도메인 이름을 모은다. */
export function publishingDomains(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const m = p.match(/^src\/publishing\/([^/]+)\//);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * 퍼블리싱 라우터에서 **퍼블리셔가 정해 둔 라우트**를 읽는다(B4 파서 재사용).
 * 라우터가 없거나 못 읽으면 빈 배열 — 그때는 페이지만 옮기고 라우트는 사람이 정한다.
 */
export function readPublishedRoutes(routerText: string, routerPath: string): IPublishedRoute[] {
  const parsed = parseRouterFile(routerText, routerPath);
  const array = parsed.arrays.get('default') ?? parsed.arrays.get('routes');
  if (!array) return [];

  const out: IPublishedRoute[] = [];
  // 라우트 객체를 통째로 훑는다 — 퍼블리싱 라우터는 한 겹 평면 배열이라 이 정도로 충분하다.
  for (const m of array.text.matchAll(/\{([\s\S]*?)\}/g)) {
    const body = m[1];
    const path = body.match(/path\s*:\s*['"]([^'"]*)['"]/);
    const element = body.match(/element\s*:\s*<\s*([A-Za-z_$][\w$]*)/);
    const name = body.match(/name\s*:\s*['"]([^'"]*)['"]/);
    if (!path || !element) continue;
    const module = parsed.components.get(element[1]);
    out.push({
      component: element[1],
      path: path[1],
      name: name ? name[1] : null,
      sourceModule: module ? moduleKey(module.replace(/^@\//, 'src/')) : '',
    });
  }
  return out;
}

// ── 계획 ─────────────────────────────────────────────────────────────────────

/**
 * 핸드오프 계획을 만든다. **파일은 건드리지 않는다** — 무엇을 만들고 무엇을 고칠지만 계산해서
 * 사람이 눈으로 확인할 수 있게 돌려준다(§3.6 "미리보기 자체가 검증 게이트").
 */
export function planPublishingHandoff(args: IHandoffArgs): IHandoffPlan {
  const { domain, publishingFiles, existingPaths } = args;
  const notices: string[] = [];
  const existing = new Set(existingPaths);

  const routerFile = publishingFiles.find((f) => /\/router\/index\.[jt]sx?$/.test(f.path));
  const routes = routerFile ? readPublishedRoutes(routerFile.text, routerFile.path) : [];

  // 옮길 페이지 — 라우터가 가리키는 페이지가 기준이고, 라우터가 없으면 pages 폴더 전체.
  const pageFiles = publishingFiles.filter(
    (f) => /^src\/publishing\/[^/]+\/pages\/.+\.[jt]sx$/.test(f.path) && !/\.stories\./.test(f.path),
  );
  const wanted = args.onlyPages && args.onlyPages.length > 0 ? new Set(args.onlyPages) : null;
  const selectedPages = pageFiles.filter((f) => {
    if (!wanted) return true;
    const name = f.path.split('/').pop()?.replace(/\.[jt]sx$/, '') ?? '';
    return wanted.has(name);
  });

  if (selectedPages.length === 0) {
    return {
      domain,
      moves: [],
      updates: [],
      notices,
      blocked: `옮길 페이지가 없습니다 — \`src/publishing/${domain}/pages/\`를 확인하세요.`,
      routes,
    };
  }

  // 페이지가 쓰는 퍼블리싱 컴포넌트를 함께 옮긴다(안 옮기면 옮긴 페이지가 퍼블리싱을 계속 바라본다).
  const neededModules = new Set<string>();
  for (const page of selectedPages) {
    for (const m of page.text.matchAll(/['"](@\/publishing\/[^'"]+)['"]/g)) {
      neededModules.add(moduleKey(m[1]));
    }
  }
  const componentFiles = publishingFiles.filter((f) => {
    if (!/^src\/publishing\/[^/]+\/components\/.+\.[jt]sx$/.test(f.path)) return false;
    if (/\.stories\./.test(f.path)) return false; // 스토리는 퍼블리셔 자산이라 두고 간다
    return neededModules.has(moduleKey(`@/${f.path.replace(/^src\//, '')}`));
  });

  // 옮김 표(모듈 지정자 → 새 지정자) — import 재작성의 진실원.
  const moveMap = new Map<string, string>();
  for (const f of [...selectedPages, ...componentFiles]) {
    const to = handoffTarget(f.path, domain);
    if (to) moveMap.set(moduleKey(`@/${f.path.replace(/^src\//, '')}`), toModuleSpec(to));
  }

  const moves: IHandoffMove[] = [];
  for (const f of [...selectedPages, ...componentFiles]) {
    const to = handoffTarget(f.path, domain);
    if (!to) continue;
    moves.push({
      from: f.path,
      to,
      kind: /\/pages\//.test(f.path) ? 'page' : 'component',
      text: rewritePublishingImports(f.text, moveMap),
      conflict: existing.has(to),
    });
  }

  // ── 라우터 등록 ──
  const updates: IHandoffUpdate[] = [];
  const applicable = moves.filter((m) => m.kind === 'page' && !m.conflict);
  if (applicable.length > 0) {
    let routerText = args.domainRouterText;
    const creatingRouter = routerText === null;
    if (routerText === null) {
      routerText = [
        "import type { TAppRoute } from '@/types/router';",
        "import loadable from '@loadable/component';",
        '',
        'const routes: TAppRoute[] = [',
        '];',
        '',
        'export default routes;',
        '',
      ].join('\n');
    }
    for (const move of applicable) {
      const pageName = move.to.split('/').pop()?.replace(/\.[jt]sx$/, '') ?? '';
      const route = routes.find((r) => r.component === pageName);
      // ★ 퍼블리셔가 정한 주소를 그대로 쓴다. 없으면 파일명에서 만든다(그 사실을 안내에 적는다).
      const routePath = route?.path ?? kebab(pageName);
      if (!route) {
        notices.push(`\`${pageName}\`의 주소가 퍼블리싱 라우터에 없어 파일명에서 \`${routePath}\`로 정했습니다.`);
      }
      routerText = appendRouteToDomainRouter(routerText, pageName, domain, routePath);
      // 퍼블리셔가 적어 둔 화면 이름을 살린다(등록기는 컴포넌트명을 name으로 넣는다).
      if (route?.name) routerText = replaceRouteName(routerText, pageName, route.name);
    }
    updates.push({
      path: `src/domains/${domain}/router/index.tsx`,
      text: routerText,
      create: creatingRouter,
      note: creatingRouter ? '도메인 라우터를 새로 만듭니다.' : '옮긴 페이지의 라우트를 추가합니다.',
    });

    // 도메인 라우터를 새로 만들면 루트 라우터에도 이 도메인을 걸어야 화면이 열린다.
    if (creatingRouter && args.rootRouterText !== null) {
      const pascal = domain.charAt(0).toUpperCase() + domain.slice(1);
      const rootText = appendDomainToRootRouter(args.rootRouterText, domain, pascal);
      if (rootText !== args.rootRouterText) {
        updates.push({
          path: 'src/shared/router/index.tsx',
          text: rootText,
          create: false,
          note: `루트 라우터에 \`/${domain}\`을 등록합니다(안 하면 주소가 열리지 않습니다).`,
        });
      }
    }
  }

  // ── 안내 ──
  notices.unshift('원본 `src/publishing/`은 **그대로 둡니다**(복사). 확인 후 직접 지우세요 — 퍼블리셔가 계속 쓰는 폴더입니다.');
  if (componentFiles.length > 0) {
    notices.push(
      `컴포넌트 ${componentFiles.length}개를 \`domains/${domain}/components/\`로 옮깁니다. `
      + '여러 도메인이 함께 쓸 부품이면 옮긴 뒤 `src/shared/`로 다시 옮기세요(README의 핸드오프 표).',
    );
  }
  const conflicts = moves.filter((m) => m.conflict);
  if (conflicts.length > 0) {
    notices.push(`이미 있는 파일 ${conflicts.length}개는 **건너뜁니다**(덮어쓰지 않습니다): ${conflicts.map((c) => c.to).join(', ')}`);
  }
  const storyCount = publishingFiles.filter((f) => /\.stories\./.test(f.path)).length;
  if (storyCount > 0) notices.push(`Storybook 파일 ${storyCount}개는 퍼블리셔 자산이라 옮기지 않습니다.`);

  return {
    domain,
    moves,
    updates,
    notices,
    blocked: moves.every((m) => m.conflict) ? '옮길 파일이 전부 이미 존재합니다(덮어쓰지 않습니다).' : null,
    routes,
  };
}

/** `ExamplePage` → `example-page` (scaffold 라우트 관례). */
export function kebab(name: string): string {
  const words = name.replace(/Page$/, '').match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [name];
  return words.map((w) => w.toLowerCase()).join('-') || name.toLowerCase();
}

/**
 * 방금 추가한 라우트 항목의 `name:`을 퍼블리셔가 적어 둔 이름으로 바꾼다.
 * 해당 컴포넌트의 항목만 고른다(다른 라우트의 이름을 건드리면 안 된다).
 */
export function replaceRouteName(routerText: string, pageName: string, displayName: string): string {
  const pattern = new RegExp(
    `(element:\\s*<${pageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*/>[^}]*?name:\\s*)(['"])[^'"]*\\2`,
  );
  return routerText.replace(pattern, `$1'${displayName.replace(/'/g, "\\'")}'`);
}
