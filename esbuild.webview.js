const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/webview/index.tsx'],
    bundle: true,
    outfile: 'dist/webview.js',
    // iife 필수 — 웹뷰 HTML이 type="module" 없이 classic script로 로드하므로, esm이면 의존성의
    // 최상위 선언(예: vfile-location의 `function location`)이 전역 바인딩이 되어 window.location과
    // 충돌해 번들 전체가 실행 전에 죽는다(모든 웹뷰 빈 화면).
    format: 'iife',
    platform: 'browser',
    target: 'chrome114',    // VS Code 1.85+ Electron의 Chromium 버전
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  if (isWatch) {
    await ctx.watch();
    console.log('[axiom-ai] WebView watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[axiom-ai] WebView build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
