const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

function copyTemplates() {
  const srcDir = path.join(__dirname, 'src', 'ai', 'templates');
  const destDir = path.join(__dirname, 'dist', 'templates');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
  console.log('[axiom-ai] Templates copied to dist/templates/');
}

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
    plugins: [
      {
        name: 'copy-templates',
        setup(build) {
          build.onEnd(() => copyTemplates());
        },
      },
    ],
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
