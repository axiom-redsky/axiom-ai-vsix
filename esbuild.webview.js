const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/webview/index.tsx'],
    bundle: true,
    outfile: 'dist/webview.js',
    format: 'esm',
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
