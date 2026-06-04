// region/hybrid e2e 측정 하니스: vscode를 빈 객체로 스텁한 뒤 esbuild로 번들 → node 실행.
// process.argv(예: --record)는 번들 모듈에서 그대로 보인다.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-eval-e2e-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'eval-e2e.mjs');

await build({
  entryPoints: ['scripts/eval-e2e.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
