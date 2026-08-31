// 가이드 일회성 이관: Docusaurus(react-app-scaffold-guide) docs → media/guide-docs 번들 시드.
// 개발자가 수동 1회 실행(npm run import:guide) 후 산출물을 레포에 커밋한다. 라이브 동기화 없음(진실원=Axiom).
//
//   node scripts/import-guide-docs.mjs [--src <guide-repo-root>] [--all-assets]
//
// 동작: sidebars.ts 파싱(5개 사이드바, tutorial 제외) → _toc.json 생성 → 등재 문서 md/mdx 복사
// (JSX require 이미지 → 표준 img 변환, 출력은 항상 .md) → 문서간 상대링크 폐쇄 추적 복사 →
// 참조 이미지만 복사(--all-assets면 assets 전량) → 리포트 출력.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SRC_ROOT = path.resolve(
  argValue('--src') ?? 'C:\\redsky\\work\\react\\single_react_new_nicfirst\\react-app-scaffold-guide',
);
const ALL_ASSETS = args.includes('--all-assets');
const DOCS_DIR = path.join(SRC_ROOT, 'docs');
const OUT_DIR = path.resolve('media', 'guide-docs');

// 이관 대상 사이드바(순서 유지)와 한글 라벨. tutorialSidebar는 Docusaurus 보일러플레이트라 제외.
const SIDEBAR_LABELS = {
  startDocSidebar: '시작하기',
  documentDocSidebar: '개발 문서',
  componentsDocSidebar: '컴포넌트',
  apiDocSidebar: 'API',
  taskDocSidebar: '작업 가이드',
};

if (!fs.existsSync(DOCS_DIR)) {
  console.error(`✖ 가이드 소스가 없습니다: ${DOCS_DIR} (--src 로 경로를 지정하세요)`);
  process.exit(1);
}

// ── TS 모듈 로드(esbuild 임시 번들) — run-test-*.mjs 관행 ──────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-guide-import-'));
async function loadTs(entry, outName) {
  const out = path.join(tmp, outName);
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    external: ['@docusaurus/*'],
    logLevel: 'warning',
  });
  return import(pathToFileURL(out).href);
}

const sidebarsMod = await loadTs(path.join(SRC_ROOT, 'sidebars.ts'), 'sidebars.mjs');
const sidebars = sidebarsMod.default;
const { transformJsxImages, findMdxImports, collectImageRefs, collectDocLinks } = await loadTs(
  path.resolve('src', 'guide', 'mdxTransform.ts'),
  'mdxTransform.mjs',
);

// ── Docusaurus 사이드바 항목 → TTocNode ────────────────────────────────────────
function toTocNode(item) {
  if (typeof item === 'string') return { type: 'doc', id: item };
  if (item && item.type === 'doc' && typeof item.id === 'string') return { type: 'doc', id: item.id };
  if (item && item.type === 'category') {
    return {
      type: 'category',
      label: String(item.label ?? ''),
      ...(item.collapsed !== undefined ? { collapsed: !!item.collapsed } : {}),
      items: (item.items ?? []).map(toTocNode).filter(Boolean),
    };
  }
  console.warn(`  ⚠ 알 수 없는 사이드바 항목 형식 무시: ${JSON.stringify(item).slice(0, 120)}`);
  return null;
}

const toc = { version: 1, generatedAt: new Date().toISOString().slice(0, 10), sidebars: [] };
for (const [key, label] of Object.entries(SIDEBAR_LABELS)) {
  const items = sidebars[key];
  if (!items) {
    console.warn(`  ⚠ sidebars.ts에 ${key} 가 없습니다 — 건너뜀`);
    continue;
  }
  toc.sidebars.push({ id: key.replace(/Sidebar$/, ''), label, items: items.map(toTocNode).filter(Boolean) });
}

const collectIds = (nodes, acc) => {
  for (const n of nodes) {
    if (n.type === 'doc') acc.push(n.id);
    else collectIds(n.items, acc);
  }
  return acc;
};
const sidebarDocIds = toc.sidebars.flatMap((sb) => collectIds(sb.items, []));

// ── 문서 복사(+링크 폐쇄) ─────────────────────────────────────────────────────
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const warnings = [];
const copiedDocs = new Set(); // docId
const imageRefs = new Map(); // 원본 절대경로 → 출력 절대경로

function resolveSourceDoc(docId) {
  for (const ext of ['.md', '.mdx']) {
    const p = path.join(DOCS_DIR, docId + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** docId 하나를 이관하고, 그 문서의 이미지·문서링크를 수집한다. 링크된 미등재 문서는 큐로 반환. */
function importDoc(docId) {
  const srcPath = resolveSourceDoc(docId);
  if (!srcPath) {
    warnings.push(`문서 없음: ${docId} (.md/.mdx 둘 다 부재)`);
    return [];
  }
  let text = fs.readFileSync(srcPath, 'utf8');
  const mdxImports = findMdxImports(text);
  if (mdxImports.length > 0) {
    warnings.push(`MDX import 발견(수동 확인 필요): ${docId} — ${mdxImports.join(' | ')}`);
  }
  text = transformJsxImages(text);

  const outPath = path.join(OUT_DIR, docId + '.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text, 'utf8');
  copiedDocs.add(docId);

  const docDirAbs = path.dirname(srcPath);
  for (const rel of collectImageRefs(text)) {
    const abs = path.resolve(docDirAbs, rel);
    if (!abs.startsWith(DOCS_DIR)) {
      warnings.push(`docs 밖 이미지 참조: ${docId} → ${rel}`);
      continue;
    }
    if (!fs.existsSync(abs)) {
      warnings.push(`이미지 없음: ${docId} → ${rel}`);
      continue;
    }
    imageRefs.set(abs, path.join(OUT_DIR, path.relative(DOCS_DIR, abs)));
  }

  const linked = [];
  for (const rel of collectDocLinks(text)) {
    const noExt = rel.replace(/\.(md|mdx)$/i, '');
    const abs = path.resolve(docDirAbs, noExt);
    if (!abs.startsWith(DOCS_DIR)) continue; // docs 밖(상대 소스 경로 등)은 문서 링크가 아님
    const linkedId = path.relative(DOCS_DIR, abs).replace(/\\/g, '/');
    if (!resolveSourceDoc(linkedId)) continue; // 실제 문서가 아닌 상대경로(코드 경로 등)
    if (!copiedDocs.has(linkedId)) linked.push(linkedId);
  }
  return linked;
}

const queue = [...sidebarDocIds];
while (queue.length > 0) {
  const id = queue.shift();
  if (copiedDocs.has(id)) continue;
  queue.push(...importDoc(id));
}
const tracedDocs = [...copiedDocs].filter((id) => !sidebarDocIds.includes(id));

// ── 이미지 복사 ───────────────────────────────────────────────────────────────
let assetCount = 0;
let assetBytes = 0;
if (ALL_ASSETS) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(png|jpe?g|gif|svg|webp)$/i.test(e.name)) {
        imageRefs.set(p, path.join(OUT_DIR, path.relative(DOCS_DIR, p)));
      }
    }
  };
  walk(DOCS_DIR);
}
for (const [src, dst] of imageRefs) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  assetCount += 1;
  assetBytes += fs.statSync(src).size;
}

// ── _toc.json + 리포트 ────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT_DIR, '_toc.json'), JSON.stringify(toc, null, 2) + '\n', 'utf8');

const mb = (n) => (n / 1024 / 1024).toFixed(1);
const docBytes = [...copiedDocs].reduce((sum, id) => sum + fs.statSync(path.join(OUT_DIR, id + '.md')).size, 0);
console.log('── 가이드 이관 완료 ─────────────────────────────');
console.log(`  소스        : ${DOCS_DIR}`);
console.log(`  출력        : ${OUT_DIR}`);
console.log(`  사이드바    : ${toc.sidebars.length}개 (${toc.sidebars.map((s) => s.label).join(', ')})`);
console.log(`  문서        : ${copiedDocs.size}개 (${mb(docBytes)} MB) — 사이드바 ${sidebarDocIds.length} + 링크추적 ${tracedDocs.length}`);
if (tracedDocs.length > 0) console.log(`    링크추적(미분류 노출): ${tracedDocs.join(', ')}`);
console.log(`  이미지      : ${assetCount}개 (${mb(assetBytes)} MB)${ALL_ASSETS ? ' [--all-assets]' : ' [참조 폐쇄만]'}`);
if (warnings.length > 0) {
  console.log(`  ⚠ 경고 ${warnings.length}건:`);
  for (const w of warnings) console.log(`    - ${w}`);
} else {
  console.log('  경고 없음 (미해결 참조 0)');
}
