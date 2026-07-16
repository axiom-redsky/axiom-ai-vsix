/**
 * CodeSectionExtractor 슬라이싱 테스트 — 이 경로(full 현재파일·참조파일 주입)의 첫 전용 안전망.
 *
 * 배경(2026-07-15 bigfile 실측): "직원관리의 상태 select를 api로 바꿔줘" × 10,574줄 god component에서
 * 주입 예산 전부가 무관 한 줄 선언 덤프(`*_ENDPOINT` 64개 동점 +1 + score=0 type 필러)로 채워지고
 * 정작 관련 본문은 통째 stub — 두 결함의 회귀 가드:
 *  - D1 흔한 토큰 가드: body 매칭 섹션 수가 max(3, 전체 20%) 초과 토큰은 body 가점 제외
 *  - D2 score=0 필러 가드: overflow + 유점수 섹션 존재 시 0점 섹션으로 예산 채우지 않음
 * 종전 동작 보존(작은 파일·전부 0점 폴백·이름 +5·import +2)도 함께 고정한다.
 */
import {
  splitTsSections,
  scoreCodeSections,
  sliceByBudget,
  extractRelevantTsSlice,
  restoreSlicedStubs,
} from '../src/ai/decompose/CodeSectionExtractor';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── 픽스처: bigfile 축소판 — 한 줄 선언 덤프 + 관련 함수 + 안 들어가는 큰 함수 ──
function buildFixture(): string {
  const lines: string[] = [];
  lines.push(`import { useApi } from '@axiom/hooks';`);
  lines.push('');
  for (let i = 1; i <= 40; i++) {
    lines.push(`const X${i}_ENDPOINT = '/api/x${i}';`);
    lines.push(`type TX${i}Row = { id: number; name: string };`);
  }
  // 이름에 흔한 토큰(api)이 든 선언 — 이름 매칭 +5는 흔한 토큰이어도 유지되어야 한다.
  lines.push(`const apiClient = { baseUrl: '/base' };`);
  // 쿼리 변별 토큰(직원)이 body에만 등장하는 중간 크기 함수 — 예산 안에 들어가야 한다.
  lines.push(`function employeeTable() {`);
  lines.push(`\t// 직원 목록 테이블 렌더링`);
  for (let i = 0; i < 10; i++) lines.push(`\tconst row${i} = ${i}; // 직원 행 ${i}`);
  lines.push(`\treturn row0;`);
  lines.push(`}`);
  // 예산(4000자)에 절대 안 들어가는 큰 함수 — stub 처리가 정상.
  lines.push(`function giantDashboard() {`);
  for (let i = 0; i < 120; i++) lines.push(`\tconst filler${i} = 'api 상태 데이터 채움 ${i}';`);
  lines.push(`\treturn null;`);
  lines.push(`}`);
  return lines.join('\n');
}

const source = buildFixture();
const tokens = ['직원', 'api', '바꿔줘'];

console.log('■ D1 — 흔한 토큰 가드 (scoreCodeSections)');
{
  const secs = splitTsSections(source);
  scoreCodeSections(secs, tokens);
  const endpoint = secs.find((s) => s.name === 'X1_ENDPOINT');
  const apiClient = secs.find((s) => s.name === 'apiClient');
  const employee = secs.find((s) => s.name === 'employeeTable');
  const imports = secs.find((s) => s.kind === 'import');
  check('섹션 분할: 덤프+함수 전부 잡힘(80개 이상)', secs.length >= 80, `실제 ${secs.length}`);
  check(
    "흔한 토큰(api) body 매칭 → 가점 0 (ENDPOINT 덤프 동점 폭주 차단)",
    !!endpoint && endpoint.score === 0,
    `score=${endpoint?.score}`,
  );
  check(
    '흔한 토큰이어도 이름 매칭은 +5 유지 (apiClient)',
    !!apiClient && apiClient.score >= 5,
    `score=${apiClient?.score}`,
  );
  check(
    '변별 토큰(직원) body 매칭은 +1 유지 (employeeTable)',
    !!employee && employee.score >= 1,
    `score=${employee?.score}`,
  );
  check('import 가점(+2) 종전 유지', !!imports && imports.score >= 2, `score=${imports?.score}`);
}

console.log('■ D1 — 작은 파일(섹션 8개 미만)은 가드 OFF (종전 동작 보존)');
{
  const small = [
    `const A_ENDPOINT = '/api/a';`,
    `const B_ENDPOINT = '/api/b';`,
    `const C_ENDPOINT = '/api/c';`,
    `function render() { return null; }`,
  ].join('\n');
  const secs = splitTsSections(small);
  scoreCodeSections(secs, ['api']);
  const a = secs.find((s) => s.name === 'A_ENDPOINT');
  check('작은 파일에선 흔한 토큰도 종전대로 +1', !!a && a.score === 1, `score=${a?.score}`);
}

console.log('■ D2 — score=0 필러 가드 (sliceByBudget)');
{
  const slice = extractRelevantTsSlice(source, tokens, 4000);
  const hasEmployee = slice.text.includes('function employeeTable()');
  const dumpIncluded = /const X\d+_ENDPOINT = '\/api\/x\d+';/.test(slice.text);
  const giantStubbed = slice.text.includes('// ... [function giantDashboard]');
  check('관련 함수(employeeTable)는 본문 포함', hasEmployee);
  check('score=0 ENDPOINT 덤프는 예산에 못 들어옴(전부 stub)', !dumpIncluded);
  check('예산 초과 큰 함수는 stub 처리(종전 유지)', giantStubbed);
  check(
    '포함 섹션 수가 유점수 섹션으로 한정(≤5)',
    slice.includedCount <= 5,
    `included=${slice.includedCount}`,
  );
}

console.log('■ D2 — 쿼리 신호 0이면 종전 폴백(최단 우선 채움) 유지');
{
  const slice = extractRelevantTsSlice(source, ['없는토큰들'], 2000);
  check(
    '무매칭 쿼리 → 폴백이 예산을 실제로 채움(imports 고정 +2는 가드 신호 아님)',
    slice.includedCount > 10,
    `included=${slice.includedCount}`,
  );
  check('무매칭 쿼리에서도 imports는 포함(+2 우선순위)', slice.text.includes(`import { useApi }`));
}

console.log('■ D2 — 예산 이하 파일은 전부 포함(가드 미발동, 종전 유지)');
{
  const small = [
    `const A_ENDPOINT = '/api/a';`,
    `type TARow = { id: number };`,
    `function hit() { return '직원'; }`,
  ].join('\n');
  const slice = extractRelevantTsSlice(small, ['직원'], 8000);
  check(
    'score=0 섹션도 예산 안이면 포함',
    slice.skippedCount === 0 && slice.text.includes('A_ENDPOINT'),
    `skipped=${slice.skippedCount}`,
  );
}

console.log('■ stub 복원 계약 (restoreSlicedStubs) — 포맷 무변경 확인');
{
  const slice = extractRelevantTsSlice(source, tokens, 4000);
  const restored = restoreSlicedStubs(slice.text, source);
  check('stub → 원본 복원 동작(덤프 const 복원)', restored.text.includes(`const X1_ENDPOINT = '/api/x1';`));
  check('복원 실패 stub 없음', restored.unmatched.length === 0, restored.unmatched.join(', '));
}

console.log('■ D3 — stub 그룹핑 (연속 제외 런 → 그룹 표식 한 줄)');
{
  const slice = extractRelevantTsSlice(source, tokens, 4000);
  const stubLines = slice.text.match(/^[ \t]*\/\/\s*\.\.\.\s*\[[^\n]*$/gm) ?? [];
  check('그룹 표식 생성(groupedRanges ≥ 1)', slice.groupedRanges.length >= 1, `groups=${slice.groupedRanges.length}`);
  check(
    'stub 줄 수 급감(제외 81개 → 표식·stub 합계 10줄 이하)',
    slice.skippedCount >= 50 && stubLines.length <= 10,
    `skipped=${slice.skippedCount}, stubLines=${stubLines.length}`,
  );
  check(
    '그룹 표식에 심볼 이름 목록 포함(재선언 방지)',
    slice.groupedRanges.some((g) => {
      const line = slice.text.split('\n').find((l) => l.includes(g.marker));
      return !!line && /재선언/.test(line) && /X10_ENDPOINT/.test(line);
    }),
  );
  check(
    '포함 섹션과 인접한 제외 섹션은 개별 stub 유지(c 조합)',
    // imports(포함) 바로 뒤 X1_ENDPOINT · apiClient(포함) 바로 앞 TX40Row는 인접 → 개별 stub
    slice.text.includes('// ... [const X1_ENDPOINT]') &&
      slice.text.includes('// ... [type TX40Row]'),
  );
}

console.log('■ D3 — round-trip: 뷰 그대로 에코 → 그룹 구간 원본 복원');
{
  const slice = extractRelevantTsSlice(source, tokens, 4000);
  const restored = restoreSlicedStubs(slice.text, source);
  check(
    '그룹 구간의 모든 선언 복원(X1~X40 ENDPOINT·TXnRow)',
    restored.text.includes(`const X40_ENDPOINT = '/api/x40';`) &&
      restored.text.includes(`type TX40Row = { id: number; name: string };`),
  );
  check('복원 후 표식 잔존 없음', !/\[\s*보존\s+L\d+/.test(restored.text));
  check('복원 실패 없음', restored.unmatched.length === 0, restored.unmatched.join(', '));
}

console.log('■ D3 — 표식 프리픽스 생존이면 꼬리(이름 목록) 잘려도 복원');
{
  const slice = extractRelevantTsSlice(source, tokens, 4000);
  const g = slice.groupedRanges[0];
  const truncated = slice.text.replace(
    new RegExp(`(${g.marker.replace(/[[\]~]/g, '\\$&')})[^\\n]*`),
    '$1 원본 보존',
  );
  const restored = restoreSlicedStubs(truncated, source);
  check(
    '꼬리 잘린 표식도 라인범위로 복원',
    restored.restoredCount >= 1 && restored.text.includes(`X1_ENDPOINT`),
    `restored=${restored.restoredCount}`,
  );
}

console.log('■ D3 — 경계 밖 표식은 unmatched로 보존(조용한 파손 금지)');
{
  const bogus = `const a = 1;\n// ... [보존 L900~L999] 원본 100줄 보존\nconst b = 2;`;
  const restored = restoreSlicedStubs(bogus, source);
  check('경계 밖 → 복원 안 함 + unmatched 기록', restored.unmatched.includes('보존 L900~L999'));
  check('표식 라인 원문 유지', restored.text.includes('[보존 L900~L999]'));
}

console.log('■ D3 — 짧은 런(3개 미만)은 개별 stub 유지(종전 동작)');
{
  const small = [
    `function hit() { return '직원'; }`,
    `const A_ONE = 1;`,
    `const B_TWO = 2;`,
    `function hit2() { return '직원 둘'; }`,
    `function giant() {`,
    ...Array.from({ length: 80 }, (_, i) => `\tconst f${i} = ${i};`),
    `}`,
  ].join('\n');
  const slice = extractRelevantTsSlice(small, ['직원'], 200);
  check(
    '제외 런이 짧으면 그룹 표식 대신 개별 stub',
    slice.groupedRanges.length === 0 || slice.text.includes('// ... [const A_ONE]'),
    `groups=${slice.groupedRanges.length}`,
  );
}

console.log('');
console.log(`결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
