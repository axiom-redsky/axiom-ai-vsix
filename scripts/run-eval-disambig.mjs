// 영역 disambiguation 측정 하니스: vscode를 빈 객체로 스텁한 뒤 esbuild로 번들 → node 실행.
// (eval:e2e와 동일 구조 — 모델 pick 정확도 계기판.)
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-eval-disambig-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
const out = join(dir, 'eval-disambig.cjs');

await build({
  entryPoints: ['scripts/eval-disambig.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
