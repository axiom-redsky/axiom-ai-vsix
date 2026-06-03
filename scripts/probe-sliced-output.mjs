// 슬라이싱 출력 실험: vscode를 빈 객체로 스텁한 뒤 esbuild로 번들 → node 실행.
// 인자는 그대로 전달된다: node scripts/probe-sliced-output.mjs --file ... --query ...
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-probe-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'probe.mjs');

await build({
  entryPoints: ['scripts/probe-sliced-output.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
