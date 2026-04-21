const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', '@xenova/transformers', 'onnxruntime-node'],
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
