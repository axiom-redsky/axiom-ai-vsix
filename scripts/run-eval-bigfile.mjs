// 큰 파일 측정 하니스: vscode를 빈 객체로 스텁한 뒤 esbuild로 번들 → node 실행
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-bigfile-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'eval-bigfile.mjs');

await build({
  entryPoints: ['scripts/eval-bigfile.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
