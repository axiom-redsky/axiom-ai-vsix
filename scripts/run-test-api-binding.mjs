// ApiBindingRecipe(Stage 1) 테스트: 순수 모듈이라 vscode 스텁 없이 esbuild 번들 → node 실행.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-abind-'));
const out = join(dir, 'test.mjs');

await build({
  entryPoints: ['scripts/test-api-binding.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
