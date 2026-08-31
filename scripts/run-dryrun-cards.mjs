// 카드 드라이런 CLI: 순수 모듈이라 vscode 스텁 없이 esbuild 번들 → node 실행 (argv 그대로 전달됨).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-dryrun-'));
const out = join(dir, 'dryrun.mjs');

await build({
  entryPoints: ['scripts/dryrun-cards.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
