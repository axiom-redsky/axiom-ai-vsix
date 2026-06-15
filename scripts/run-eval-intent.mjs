// 의도 분류 측정 하니스: vscode 스텁 + @xenova/transformers external(런타임 require) → node 실행
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-eval-intent-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'eval.mjs');

await build({
  entryPoints: ['scripts/eval-intent.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { vscode: stub },
  external: ['@xenova/transformers', 'onnxruntime-node'],
  // ESM 출력에서 EmbeddingService의 require('@xenova/transformers')가 프로젝트 node_modules를
  // 해석하도록, createRequire를 프로젝트 루트(cwd) 기준으로 주입한다(번들은 temp 디렉터리에 위치).
  banner: {
    js: `import { createRequire as __cr } from 'module'; const require = __cr(${JSON.stringify(join(process.cwd(), 'package.json'))});`,
  },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
