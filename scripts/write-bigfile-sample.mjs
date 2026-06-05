// 현실적인 1만 줄 테스트 파일(.tsx)을 생성해 지정 경로에 쓴다.
// region 편집을 실제로 검증하려면 "쿼리 토큰이 매칭되는" 파일이 필요하다(더미 필러로는 anchor-missing).
//
// 사용:
//   node scripts/write-bigfile-sample.mjs [출력경로]
//   기본 출력: scripts/sample-bigfile.tsx (이걸 스캐폴드의 src/domains/employee/pages/Test.tsx 로 복사)
//   직접 지정: node scripts/write-bigfile-sample.mjs "C:\\path\\to\\scaffold\\src\\domains\\employee\\pages\\Test.tsx"
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const target = resolve(process.argv[2] ?? 'scripts/sample-bigfile.tsx');

const dir = mkdtempSync(join(tmpdir(), 'axiom-genfile-'));
const out = join(dir, 'gen.mjs');
await build({
  entryPoints: ['scripts/synth-large-file.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});
const { generateLargeFile } = await import(pathToFileURL(out).href);
const { source, lineCount, manifest } = generateLargeFile();
writeFileSync(target, source, 'utf-8');
console.log(`생성 완료: ${target}`);
console.log(`  ${lineCount}줄 / ${source.length.toLocaleString()}자 / 섹션 ${manifest.length}개`);
console.log(`  예시 쿼리: "직원관리의 상태 select를 api로 바꿔줘"  /  "예산관리 테이블에 컬럼 추가"`);
console.log(`  섹션 라벨: ${manifest.slice(0, 10).map((m) => m.ko + '관리').join(', ')} …`);
