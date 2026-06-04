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
// CJS로 번들한다: 파싱 검사용 typescript(CJS)가 런타임에 require/__filename/__dirname을 쓰는데,
// ESM 출력에선 이 CJS 전역들이 없어 "Dynamic require of fs"·"__filename is not defined"로 깨진다.
// CJS 출력이면 node가 이 전역들을 네이티브로 제공해 별도 셰임 없이 동작한다.
const out = join(dir, 'eval-e2e.cjs');

await build({
  entryPoints: ['scripts/eval-e2e.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
