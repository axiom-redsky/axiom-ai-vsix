// 편집품질 라이브 eval(Phase 2): vscode를 빈 객체로 스텁 → esbuild 번들 → node 실행(실 모델 호출).
// FileCreatorService/ScaffoldContracts가 vscode를 import하지만 computeMultiPatch·dedupeImportLines·
// buildContractSection은 런타임에 vscode를 안 건드리므로(파일 쓰기 메서드만 사용) 스텁으로 충분하다.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-eval-edit-'));
const stub = join(dir, 'vscode-stub.js');
writeFileSync(stub, 'export default {}; export const Uri = {}; export const window = {}; export const workspace = {};');
// CJS로 번들한다: TSX 파싱 검사용 typescript(CJS)가 런타임에 require/__filename을 쓰는데 ESM 출력에선
// 이 CJS 전역이 없어 "Dynamic require of fs"로 깨진다(eval-e2e와 동일 이유). CJS면 node가 네이티브로 제공.
const out = join(dir, 'eval-edit-live.cjs');

await build({
  entryPoints: ['scripts/eval-edit-live.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  alias: { vscode: stub },
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
