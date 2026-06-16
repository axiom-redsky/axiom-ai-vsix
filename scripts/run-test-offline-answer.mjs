// 오프라인 지식 응답 골든: vscode를 빈 객체로 스텁한 뒤 esbuild로 번들 → node 실행
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-off-ans-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'test.mjs');

await build({
  entryPoints: ['scripts/test-offline-answer.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { vscode: stub },
  external: ['@xenova/transformers', 'onnxruntime-node'],
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
