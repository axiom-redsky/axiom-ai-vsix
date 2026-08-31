/**
 * 내장 개발 가이드(Guide Hub) 순수 로직 회귀 테스트.
 * (vscode 비의존 — esbuild 번들 후 node 실행). 실행: node scripts/run-test-guide.mjs
 *
 * 대상: 이관 변환(mdxTransform) · toc/frontmatter 유틸(guideUtils) · 시드(GuideStore, P3에서 추가).
 */
import {
  transformJsxImages,
  findMdxImports,
  collectImageRefs,
  collectDocLinks,
} from '../src/guide/mdxTransform';
import {
  parseFrontmatter,
  collectDocIds,
  buildUncategorizedSidebar,
  slugifyTitle,
  buildNewDocTemplate,
  normalizeDocPath,
  UNCATEGORIZED_SIDEBAR_ID,
} from '../src/guide/guideUtils';
import type { ITocManifest } from '../src/types/guide';
import { seedIfMissing, reseed, createDoc, listAllDocIds } from '../src/guide/GuideStore';
import {
  stripFrontmatter,
  segmentAdmonitions,
  stripHighlightComments,
  resolveDocRelPath,
  splitDocLink,
} from '../src/webview/guide/markdownPreprocess';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

console.log('\ntransformJsxImages:');
{
  const src = `<img src={require('../assets/ui/button-basic.png').default} alt="기본" width="70%" />`;
  const out = transformJsxImages(src);
  check('require+.default → src="경로"', out === `<img src="../assets/ui/button-basic.png" alt="기본" width="70%" />`, out);
}
{
  const out = transformJsxImages(`<img src={require("./a.png")} />`);
  check('쌍따옴표·.default 없음', out === `<img src="./a.png" />`, out);
}
{
  const out = transformJsxImages(`<img src={ require( '../x.svg' ).default } />`);
  check('공백 변형 허용', out === `<img src="../x.svg" />`, out);
}
{
  const src = `![유지](../assets/keep.png)\n일반 require('x') 텍스트`;
  check('마크다운 이미지·산문 require는 불변', transformJsxImages(src) === src);
}

console.log('\nfindMdxImports:');
{
  const src = ['---', 'title: t', '---', "import Tabs from '@theme/Tabs';", '', '```tsx', "import React from 'react';", '```'].join('\n');
  const found = findMdxImports(src);
  check('최상단 import 검출·코드펜스 내 제외', found.length === 1 && found[0].includes('@theme/Tabs'), JSON.stringify(found));
}

console.log('\ncollectImageRefs:');
{
  const src = [
    '![a](../assets/a.png)',
    '<img src="./b/c.svg" width="50%" />',
    `<img src={require('../d.webp').default} />`,
    '![중복](../assets/a.png)',
    '![외부](https://x.com/y.png)',
    '![절대](/img/z.png)',
    '[문서링크](../doc.md)',
  ].join('\n');
  const refs = collectImageRefs(src);
  check('상대 이미지 3종 수집(중복·http·절대 제외)',
    refs.length === 3 && refs.includes('../assets/a.png') && refs.includes('./b/c.svg') && refs.includes('../d.webp'),
    JSON.stringify(refs));
}

console.log('\ncollectDocLinks:');
{
  const src = [
    '[api](../ui/api/button-api.md#props)',
    '[무확장](./sibling)',
    '[이미지](../a.png)',
    '[앵커만](#section)',
    '[외부](https://x.com/doc)',
  ].join('\n');
  const refs = collectDocLinks(src);
  check('문서 링크만(앵커 제거)', refs.length === 2 && refs.includes('../ui/api/button-api.md') && refs.includes('./sibling'),
    JSON.stringify(refs));
}

console.log('\nparseFrontmatter:');
{
  const { meta, body } = parseFrontmatter(`---\r\nsidebar_position: 1\r\ntitle: '⋮ useApi'\r\n---\r\n\r\n# useApi`);
  check('CRLF + 따옴표 title', meta.title === '⋮ useApi' && meta.sidebar_position === '1');
  check('body에서 frontmatter 제거', body.trimStart().startsWith('# useApi'), JSON.stringify(body.slice(0, 20)));
}
{
  const { meta, body } = parseFrontmatter('# 제목뿐');
  check('frontmatter 없음 → meta 빈 객체·원문 유지', Object.keys(meta).length === 0 && body === '# 제목뿐');
}

console.log('\ncollectDocIds / buildUncategorizedSidebar:');
const toc: ITocManifest = {
  version: 1,
  sidebars: [
    {
      id: 'apiDoc',
      label: 'API',
      items: [
        { type: 'doc', id: 'apis/index' },
        {
          type: 'category',
          label: 'Functions',
          items: [{ type: 'category', label: 'Hooks', items: [{ type: 'doc', id: 'apis/hooks/use-api' }] }],
        },
      ],
    },
  ],
};
{
  const ids = collectDocIds(toc);
  check('중첩 category 재귀 수집(순서 유지)', ids.length === 2 && ids[0] === 'apis/index' && ids[1] === 'apis/hooks/use-api',
    JSON.stringify(ids));
}
{
  const sb = buildUncategorizedSidebar(['apis/index', 'apis/hooks/use-api', 'custom/new-doc'], toc);
  check('미등재 md → 미분류 그룹', sb !== null && sb.id === UNCATEGORIZED_SIDEBAR_ID && sb.items.length === 1
    && sb.items[0].type === 'doc' && sb.items[0].id === 'custom/new-doc', JSON.stringify(sb));
  check('전부 등재 → null', buildUncategorizedSidebar(['apis/index'], toc) === null);
}

console.log('\nslugifyTitle / buildNewDocTemplate:');
{
  check('영문 케밥', slugifyTitle('My New Guide! (v2)') === 'my-new-guide-v2', slugifyTitle('My New Guide! (v2)'));
  const fb = slugifyTitle('한글 제목만', new Date(2026, 7, 31, 9, 5));
  check('한글-only → 날짜 폴백', fb === 'guide-202608310905', fb);
}
{
  const t = buildNewDocTemplate('배포 가이드');
  const { meta } = parseFrontmatter(t);
  check('신규 템플릿 frontmatter title 왕복', meta.title === '배포 가이드' && t.includes('# 배포 가이드'));
}

console.log('\nnormalizeDocPath:');
check('역슬래시 → 슬래시', normalizeDocPath('documents\\dev\\use-rest-api') === 'documents/dev/use-rest-api');

console.log('\nmarkdownPreprocess (웹뷰 전처리):');
{
  const { title, body } = stripFrontmatter(`---\r\ntitle: "개요"\r\nsidebar_position: 1\r\n---\r\n# 본문`);
  check('stripFrontmatter title 추출·body 제거', title === '개요' && body.trimStart().startsWith('# 본문'));
}
{
  const md = ['앞 문단', ':::tip 제목 <span class="x">강조</span>', '팁 내용', ':::', '뒷 문단'].join('\n');
  const segs = segmentAdmonitions(md);
  check('admonition 분리(3세그먼트)', segs.length === 3
    && segs[0].kind === 'md' && segs[1].kind === 'admonition' && segs[2].kind === 'md', JSON.stringify(segs.map((s) => s.kind)));
  check('admonition 제목 HTML strip', segs[1].kind === 'admonition' && segs[1].title === '제목 강조',
    segs[1].kind === 'admonition' ? segs[1].title : '');
}
{
  const md = ['::::info 바깥', '겉 내용', ':::tip 안쪽', '속 내용', ':::', '::::'].join('\n');
  const segs = segmentAdmonitions(md);
  check('중첩(4콜론) — 바깥만 분리·안쪽은 body 보존', segs.length === 1 && segs[0].kind === 'admonition'
    && segs[0].body.includes(':::tip 안쪽'), JSON.stringify(segs));
  const inner = segs[0].kind === 'admonition' ? segmentAdmonitions(segs[0].body) : [];
  check('body 재귀 세그먼트로 안쪽 해석', inner.some((s) => s.kind === 'admonition' && s.title === '안쪽'));
}
{
  const md = [':::tip 닫힘 없음', '내용'].join('\n');
  const segs = segmentAdmonitions(md);
  check('닫힘 없는 열림 → 원문 보존(파손 방지)', segs.length === 1 && segs[0].kind === 'md' && segs[0].text.includes(':::tip'));
}
{
  const code = ['const a = 1;', '// highlight-start', 'const b = 2;', '// highlight-end', '{/* highlight-next-line */}', 'const c = 3;'].join('\n');
  const out = stripHighlightComments(code);
  check('highlight 매직코멘트 제거', !out.includes('highlight') && out.includes('const b = 2;'), out);
}
{
  check('상대경로 해석(../)', resolveDocRelPath('apis/hooks/use-api', '../../assets/x.png') === 'assets/x.png',
    resolveDocRelPath('apis/hooks/use-api', '../../assets/x.png'));
  check('상대경로 해석(./)', resolveDocRelPath('a/b', './c.md') === 'a/c.md');
  const { docPath, anchor } = splitDocLink('../ui/button.md#props');
  check('링크 분리(확장자·앵커)', docPath === '../ui/button' && anchor === 'props');
}

console.log('\nGuideStore (시드·재시드·신규):');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-guide-store-'));
  const bundled = path.join(tmp, 'bundled');
  const guide = path.join(tmp, 'guide');
  fs.mkdirSync(path.join(bundled, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(bundled, 'a.md'), '원본 A', 'utf8');
  fs.writeFileSync(path.join(bundled, 'sub', 'b.md'), '원본 B', 'utf8');

  check('seedIfMissing — 최초 복사 true', seedIfMissing(bundled, guide) === true
    && fs.readFileSync(path.join(guide, 'sub', 'b.md'), 'utf8') === '원본 B');

  fs.writeFileSync(path.join(guide, 'a.md'), '사용자 수정본', 'utf8');
  check('seedIfMissing — 존재 시 무접촉(수정본 보존)', seedIfMissing(bundled, guide) === false
    && fs.readFileSync(path.join(guide, 'a.md'), 'utf8') === '사용자 수정본');

  fs.rmSync(path.join(guide, 'sub', 'b.md'));
  reseed(bundled, guide, 'missing-only');
  check('reseed missing-only — 누락만 복구·수정본 보존',
    fs.readFileSync(path.join(guide, 'sub', 'b.md'), 'utf8') === '원본 B'
    && fs.readFileSync(path.join(guide, 'a.md'), 'utf8') === '사용자 수정본');

  reseed(bundled, guide, 'overwrite');
  check('reseed overwrite — 번들로 원복', fs.readFileSync(path.join(guide, 'a.md'), 'utf8') === '원본 A');

  const f1 = createDoc(guide, 'New Guide');
  const f2 = createDoc(guide, 'New Guide');
  check('createDoc — custom/ 슬러그·충돌 접미', f1.replace(/\\/g, '/').endsWith('custom/new-guide.md')
    && f2.replace(/\\/g, '/').endsWith('custom/new-guide-2.md'));

  fs.writeFileSync(path.join(guide, '_toc.json'), '{}', 'utf8');
  const ids = listAllDocIds(guide);
  check('listAllDocIds — _접두 제외·정렬·/ 구분', ids.length === 4 && ids[0] === 'a' && ids.includes('sub/b')
    && ids.includes('custom/new-guide'), JSON.stringify(ids));

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
