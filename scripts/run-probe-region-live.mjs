// probe-region-live: RegionEditService가 vscode를 import하므로 스텁 alias로 번들(eval-edit-live와 동일 패턴).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-region-live-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'probe.cjs');

await build({
  entryPoints: ['scripts/probe-region-live.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
