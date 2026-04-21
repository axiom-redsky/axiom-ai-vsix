const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],   // vscode는 런타임에 제공 — 절대 번들하지 않음
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
  });

  if (isWatch) {
    await ctx.watch();
    console.log('[axiom-ai] Extension watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[axiom-ai] Extension build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
