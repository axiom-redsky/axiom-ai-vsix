// findDuplicateDeclarations 가 큰 파일에서 같은 스코프 const 중복(employeeStatusOptions)을
// 잡는지 재현한다. 모델이 한 편집(직원 status select를 API로)을 흉내내 두 번째 선언을 주입한다.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'dbg-dup-'));
const out = join(dir, 'b.mjs');
await build({
  entryPoints: ['scripts/_dbg-entry.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
});
const { generateLargeFile, findDuplicateDeclarations } = await import(pathToFileURL(out).href);

const { source } = generateLargeFile();
let lines = source.split('\n');

// 1) baseline: 원본은 중복 0 이어야 한다.
const base = findDuplicateDeclarations(source);
console.log('원본 중복:', base.length, base.slice(0, 5));

// 2) 직원(employee) status select를 API로 바꾸는 편집을 흉내낸다:
//    - 설정(setting) 섹션 훅 블록 근처에 새 employeeStatusOptions 선언을 추가(모델이 한 그대로).
//    - 직원 섹션엔 원래 employeeStatusOptions(하드코딩)가 그대로 남아 중복이 된다.
const settingHookIdx = lines.findIndex((l) => /const settingRows = settingResp\?\.data/.test(l));
if (settingHookIdx === -1) throw new Error('settingRows 훅 위치 못 찾음');
const inject = [
  "\tconst { data: employeeStatusResponse } = useApi<TEmployeeStatusResponse>('/api/employee-status');",
  '\tconst employeeStatusOptions: TStatusOption[] = employeeStatusResponse?.data ?? [];',
];
lines.splice(settingHookIdx, 0, ...inject);
const composed = lines.join('\n');

// 직원 섹션에 원래 employeeStatusOptions 가 있는지 + 새로 넣은 것 = 총 2개인지 확인
const occurrences = composed.split('\n').filter((l) => /const employeeStatusOptions\b/.test(l.trim()));
console.log('composed 내 employeeStatusOptions 선언 줄 수:', occurrences.length);

const dupes = findDuplicateDeclarations(composed);
const caught = dupes.includes('employeeStatusOptions');
console.log('findDuplicateDeclarations 결과:', dupes.length, dupes.slice(0, 8));
console.log(caught ? '✅ 중복 감지됨 (게이트 정상)' : '❌ 중복 미감지 (게이트 갭 — 버그)');
