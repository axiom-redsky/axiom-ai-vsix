/**
 * 라우터 등록 — 도메인 라우터/루트 라우터에 **줄을 더하는** 결정론 변환.
 *
 * 원래 ChatViewProvider의 private 메서드였다. 퍼블리싱 포팅(§7 D1)이 **같은 등록**을 해야 해서
 * 끌어냈다 — 두 벌로 두면 한쪽만 고쳐져 "채팅으로 만든 라우트와 포팅으로 만든 라우트가 다른"
 * 상태가 된다(B2·B3에서 공유 모듈을 뺀 것과 같은 이유).
 *
 * 성질: 문자열 → 문자열, 부작용 없음, **멱등**(이미 등록돼 있으면 원문 그대로 돌려준다).
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function appendRouteToDomainRouter(
  existing: string,
  pageName: string,
  domain: string,
  routePath: string,
): string {
  // 동일 path 또는 동일 컴포넌트가 이미 등록돼 있으면 중복 항목을 추가하지 않는다.
  const pathAlreadyRouted = new RegExp(
    `path:\\s*['"]${escapeRegExp(routePath)}['"]`,
  ).test(existing);
  const elementAlreadyRouted = new RegExp(
    `element:\\s*<${escapeRegExp(pageName)}\\s*/>`,
  ).test(existing);
  if (pathAlreadyRouted || elementAlreadyRouted) {
    return existing;
  }

  const loadableImportLine = `import loadable from '@loadable/component';`;
  const importLine = `const ${pageName} = loadable(() => import('@/domains/${domain}/pages/${pageName}'));`;

  let withLoadableImport: string;
  if (existing.includes(loadableImportLine)) {
    withLoadableImport = existing;
  } else {
    withLoadableImport = existing.replace(
      /^(import type \{ TAppRoute \} from ['"]@\/types\/router['"];?\r?\n)/m,
      `$1\n${loadableImportLine}\n`,
    );
    if (withLoadableImport === existing) {
      withLoadableImport = existing.replace(
        /^((?:import[^\n]*\n)+)/m,
        `$1${loadableImportLine}\n`,
      );
    }
    if (withLoadableImport === existing) {
      withLoadableImport = `${loadableImportLine}\n${existing}`;
    }
  }

  let withImport: string;
  if (withLoadableImport.includes(importLine)) {
    withImport = withLoadableImport;
  } else {
    // 1순위: 마지막 loadable import 뒤
    withImport = withLoadableImport.replace(
      /(\nconst \w+ = loadable[^\n]+\n)(?!const \w+ = loadable)/,
      `$1${importLine}\n`,
    );
    if (withImport === withLoadableImport) {
      // 2순위: const routes 선언 바로 앞
      withImport = withLoadableImport.replace(/^(const routes\b)/m, `${importLine}\n\n$1`);
    }
  }

  const routeEntry = `  {\n    path: '${routePath}',\n    element: <${pageName} />,\n    name: '${pageName}',\n  },`;

  let result = withImport.replace(/(\];)/, `${routeEntry}\n$1`);
  if (result === withImport) {
    // 폴백: 들여쓰기된 `]` (세미콜론 없는 경우)
    result = withImport.replace(/^(\s*\])/m, `${routeEntry}\n$1`);
  }
  return result;
}

/**
 * 루트 라우터 파일에 신규 도메인 import와 routes 항목을 추가한다.
 *
 * import 삽입 우선순위:
 * 1. 마지막 Router import 뒤에 추가
 * 2. (폴백) `const routes` 선언 바로 앞에 추가
 */
export function appendDomainToRootRouter(
  existing: string,
  domain: string,
  domainPascal: string,
): string {
  const importLine = `import ${domainPascal}Router from '@/domains/${domain}/router';`;
  const routeEntry = `  { path: '/${domain}', element: <RootLayout />, children: ${domainPascal}Router },`;

  const lines = existing.split('\n');

  // 줄 단위로 "살아있는 코드"인지 판정한다(// 라인 주석과 /* */ 블록 주석을 모두 무시).
  // 사용자가 주석으로 넣어둔 import/route 때문에 중복 판정·잘못된 위치 삽입이 일어나던 것을 막는다.
  let inBlock = false;
  const isActive: boolean[] = lines.map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return false;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return false;
    }
    if (trimmed.startsWith('//')) return false;
    return true;
  });

  // ── import 추가 ──────────────────────────────────────────────────
  const alreadyImported = lines.some((l, i) => isActive[i] && l.includes(importLine));
  if (!alreadyImported) {
    // 1순위: 마지막 (활성) Router import 뒤
    let lastRouterImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isActive[i] && /^\s*import\s+\w+Router\s+from\s+/.test(lines[i])) {
        lastRouterImport = i;
      }
    }
    if (lastRouterImport >= 0) {
      lines.splice(lastRouterImport + 1, 0, importLine);
      isActive.splice(lastRouterImport + 1, 0, true);
    } else {
      // 2순위: 활성 `const routes` 선언 바로 앞
      const routesDeclIdx = lines.findIndex(
        (l, i) => isActive[i] && /^\s*const\s+routes\b/.test(l),
      );
      const insertAt = routesDeclIdx >= 0 ? routesDeclIdx : 0;
      lines.splice(insertAt, 0, importLine);
      isActive.splice(insertAt, 0, true);
    }
  }

  // ── routes 항목 추가 ─────────────────────────────────────────────
  // ★ 이미 걸려 있으면 그대로 둔다(멱등). 페이지 생성 경로는 **신규 도메인일 때만** 이 함수를 불러
  //   중복이 드러나지 않았는데, 퍼블리싱 포팅(§7 D1)은 사용자가 [적용]을 두 번 누를 수 있다 —
  //   그때 루트 라우터에 같은 도메인이 두 줄 생기던 결함을 여기서 막는다(test:publishing-handoff E7).
  const alreadyRouted = lines.some(
    (l, i) => isActive[i] && (l.includes(`children: ${domainPascal}Router`) || l.includes(`path: '/${domain}'`)),
  );
  if (alreadyRouted) return lines.join('\n');

  // 활성 `const routes ... = [` 를 찾아, 대괄호 깊이를 세서 그 배열의 닫는 `]` 직전에 삽입.
  const routesStart = lines.findIndex(
    (l, i) => isActive[i] && /^\s*const\s+routes\b[^=]*=\s*\[/.test(l),
  );
  let inserted = false;
  if (routesStart >= 0) {
    let depth = 0;
    for (let i = routesStart; i < lines.length; i++) {
      if (!isActive[i]) continue;
      for (const ch of lines[i]) {
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
      }
      if (depth <= 0) {
        // i번째 줄이 배열을 닫는다 → 그 줄 앞에 항목 삽입
        lines.splice(i, 0, routeEntry);
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) {
    // 폴백: 첫 번째 활성 `];` 앞
    const closeIdx = lines.findIndex((l, i) => isActive[i] && /\];/.test(l));
    if (closeIdx >= 0) {
      lines.splice(closeIdx, 0, routeEntry);
      inserted = true;
    }
  }

  return lines.join('\n');
}
