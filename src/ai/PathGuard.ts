/**
 * 편집 보호 가드 — 특정 경로(core/shared 등 프레임워크 영역)가 **편집 대상이 되는 것 자체를 차단**한다.
 *
 * 설계: 의도 분류가 틀려도(예: "SmartTable 컴포넌트로 적용해줘"를 SmartTable 편집으로 오인) 프레임워크
 * 파일이 절대 수정되지 않도록 하는 결정론적 방어선. cross-file 재타겟·수동 파일 선택·현재 파일 모두에서
 * 동일한 함수로 막는다. 보호 글롭은 ExtensionConfig.getProtectedPaths()(기본 `src/core/**`,`src/shared/**`).
 */

/** glob 한 조각을 정규식 소스로 변환. 지원: `**`=구분자 포함 임의, `*`=구분자 제외 임의. */
function globToRegExpSource(glob: string): string {
  const g = glob.replace(/\\/g, '/').replace(/^\.?\//, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*'; // `**` → 경로 구분자 포함 임의
        i++;
        if (g[i + 1] === '/') i++; // `**/` 의 슬래시는 0개 디렉터리도 매칭하도록 흡수
      } else {
        re += '[^/]*'; // `*` → 구분자 제외 임의
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return re;
}

/** 워크스페이스 상대 경로를 정규화(역슬래시→슬래시, 선행 `./`·`/` 제거). */
function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.?\//, '');
}

/**
 * `relPath`(워크스페이스 상대)가 보호 글롭 중 하나에 매칭되면 true.
 * 패턴/경로 모두 `/` 기준으로 정규화해 Windows 역슬래시 경로도 일관되게 판정한다.
 */
export function isProtectedPath(relPath: string, patterns: string[]): boolean {
  if (!relPath) return false;
  const p = normalizeRel(relPath);
  return patterns.some((pat) => {
    try {
      return new RegExp('^' + globToRegExpSource(pat) + '$').test(p);
    } catch {
      return false; // 잘못된 글롭은 무시(차단 실패가 아니라 통과 — 설정 오타로 전부 막히지 않게)
    }
  });
}
