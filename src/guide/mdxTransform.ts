// 가이드 이관용 순수 변환 함수 — Docusaurus md/mdx → 확장 내장 md.
// vscode 무의존: 이관 스크립트(scripts/import-guide-docs.mjs)와 test:guide가 공용한다.

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp)$/i;

/**
 * mdx의 JSX 이미지 패턴 `src={require('../assets/x.png').default}` 를 표준 HTML `src="../assets/x.png"` 로 바꾼다.
 * src 외 속성(alt·width 등)·속성 순서는 건드리지 않고, `![](...)` 마크다운 이미지는 매칭 자체가 안 된다.
 */
export function transformJsxImages(src: string): string {
  return src.replace(
    /src=\{\s*require\(\s*(['"])([^'"]+)\1\s*\)(?:\.default)?\s*\}/g,
    (_m, _q: string, p: string) => `src="${p}"`,
  );
}

/**
 * mdx 최상단(코드펜스 밖)의 import 문을 찾는다. 실 가이드에는 전무함을 확인했지만,
 * 향후 문서가 MDX 컴포넌트를 쓰기 시작하면 이관 스크립트가 경고를 내야 한다.
 */
export function findMdxImports(src: string): string[] {
  const found: string[] = [];
  let inFence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^import\s+.+\s+from\s+['"]/.test(line.trim())) found.push(line.trim());
  }
  return found;
}

/** 문서가 참조하는 이미지 상대경로 수집 — `![](rel)` / `<img src="rel">` / `src={require('rel')}` (http·절대경로 제외). */
export function collectImageRefs(src: string): string[] {
  const refs = new Set<string>();
  const push = (p: string): void => {
    const clean = p.trim();
    if (!clean || /^(https?:)?\/\//i.test(clean) || clean.startsWith('/')) return;
    if (IMAGE_EXT_RE.test(clean)) refs.add(clean);
  };
  for (const m of src.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) push(m[1]);
  for (const m of src.matchAll(/<img[^>]*\ssrc=(['"])([^'"]+)\1/gi)) push(m[2]);
  for (const m of src.matchAll(/src=\{\s*require\(\s*(['"])([^'"]+)\1\s*\)/g)) push(m[2]);
  return [...refs];
}

/**
 * 문서간 상대 링크 수집 — `[..](../x/doc.md#a)` 류. 이미지·http·앵커 전용(`#...`)·절대경로는 제외.
 * 반환값은 앵커를 뗀 경로 (확장자는 붙어 있으면 그대로 둔다 — 호출부가 .md/.mdx/무확장 해석).
 */
export function collectDocLinks(src: string): string[] {
  const refs = new Set<string>();
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('#') || /^(https?:|mailto:)/i.test(raw) || raw.startsWith('/')) continue;
    const noAnchor = raw.split('#')[0];
    if (!noAnchor || IMAGE_EXT_RE.test(noAnchor)) continue;
    refs.add(noAnchor);
  }
  return [...refs];
}
