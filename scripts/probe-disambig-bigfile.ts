// 라이브 채집(2026-07-15 반쪽 편집) 재현: locateEditRegion이 이 쿼리에서 내는
// 휴리스틱 chosen과 disambiguation 후보 목록(라벨·범위)을 결정론으로 출력한다.
import { readFileSync } from 'node:fs';
import { locateEditRegion } from '../src/ai/locate/RegionEdit';

const file = process.argv[2] ?? 'scripts/sample-bigfile.tsx';
const query = process.argv[3] ?? '직원관리의 상태 select를 api로 바꿔줘';
const source = readFileSync(file, 'utf8');

const loc = locateEditRegion(source, query);
console.log(`쿼리: ${query}`);
console.log(`휴리스틱 chosen: L${loc.startLine}~${loc.endLine} bestScore=${loc.bestScore}`);
console.log(`region 첫 줄: ${loc.region.split('\n')[0]?.trim()}`);
console.log(`safety: ${JSON.stringify(loc.safety)}`);
console.log('');
console.log(`disambiguation 후보 ${loc.candidates?.length ?? 0}개:`);
for (const [i, c] of (loc.candidates ?? []).entries()) {
  const first = (c as any).region?.split('\n')[0]?.trim() ?? '';
  console.log(
    `  ${i + 1}. label="${(c as any).regionLabel ?? (c as any).label ?? '?'}"  L${(c as any).startLine}~${(c as any).endLine}  루트: ${first.slice(0, 60)}`,
  );
}

// ── 라이브 재현: 모델이 후보 1을 골랐을 때 forcedRegion 재타겟 결과 ──
const pick = loc.candidates?.[0];
if (pick) {
  const re = locateEditRegion(source, query, { startLine: (pick as any).startLine, endLine: (pick as any).endLine });
  console.log('');
  console.log(`forcedRegion(후보1 ${(pick as any).startLine}~${(pick as any).endLine}) 재타겟 결과: L${re.startLine}~${re.endLine}`);
  console.log(`  재타겟 region 첫 줄: ${re.region.split('\n')[0]?.trim().slice(0, 70)}`);
  console.log(`  후보 범위와 일치? ${re.startLine === (pick as any).startLine && re.endLine === (pick as any).endLine ? '✅' : '❌ 다른 영역으로 재스냅!'}`);
}
