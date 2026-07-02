// RegionCaptureRecorder 단위 테스트: esbuild로 번들 → node 실행(순수 모듈 — vscode 의존 없음)
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'axiom-capture-'));
const out = join(dir, 'test.mjs');

await build({
  entryPoints: ['scripts/test-region-capture.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});

await import(pathToFileURL(out).href);
