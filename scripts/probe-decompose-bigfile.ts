// 테스트 페이지 '2. 분해 테스트'가 실행하는 것과 동일한 순수 함수를 bigfile에 직접 돌려
// deps 폭주(dietRatio·섹션 포함비)를 콘솔로 미리 계산한다. (페이지 미러 — 드리프트 0)
import { readFileSync } from 'node:fs';
import { tokenizeQuery, extractApiPaths } from '../src/ai/decompose/SectionExtractor';
import { splitTsSections, scoreCodeSections, sliceByBudget } from '../src/ai/decompose/CodeSectionExtractor';
import { impliedControlTags } from '../src/ai/decompose/RegionIntent';

const file = process.argv[2];
const query = process.argv[3] ?? '직원관리의 상태 select를 api로 바꿔줘';
const budget = Number(process.argv[4] ?? 4000);

const source = readFileSync(file, 'utf8');
const tokens = tokenizeQuery(query);
const apiPaths = extractApiPaths(query);
const controlTags = impliedControlTags(query);

const secs = splitTsSections(source);
scoreCodeSections(secs, tokens, undefined);
const sliceResult = sliceByBudget(secs, budget);

const included = secs.filter(
  (s) =>
    !sliceResult.text.includes(`// ... [${s.kind} ${s.name}]`) &&
    !sliceResult.groupedRanges.some((g) => s.startLine >= g.startLine && s.endLine <= g.endLine),
);
const scored = secs.filter((s) => s.score > 0);

console.log('=== 쿼리 분해 ===');
console.log('query    :', query);
console.log('tokens   :', tokens.join(' · '));
console.log('apiPaths :', apiPaths.length ? apiPaths.join(', ') : '(없음)');
console.log('control  :', controlTags.length ? controlTags.join(', ') : '(없음)');
console.log('');
console.log('=== 코드 분해 ===');
console.log(`파일        : ${source.length.toLocaleString()}자 / ${source.split('\n').length}줄 / 섹션 ${secs.length}개`);
console.log(`예산        : ${budget}자`);
console.log(`포함 섹션   : ${sliceResult.includedCount} / 제외(stub) ${sliceResult.skippedCount}`);
console.log(`점수>0 섹션 : ${scored.length} (쿼리 관련이라도 잡힌 섹션)`);
console.log(`주입 글자   : ${sliceResult.totalChars.toLocaleString()}자`);
console.log(`dietRatio   : ${(sliceResult.totalChars / source.length * 100).toFixed(2)}%  (원본 대비 주입 비율)`);
console.log('');
console.log('=== 포함된 섹션 (kind name  score  chars) ===');
for (const s of included) {
  console.log(`  ${s.included ? '' : ''}[${s.kind}] ${s.name}  score=${s.score}  ${s.length}자  L${s.startLine}-${s.endLine}`);
}
console.log('');
console.log('=== 섹션 종류별 분포 ===');
const byKind = new Map<string, { count: number; chars: number }>();
for (const s of secs) {
  const e = byKind.get(s.kind) ?? { count: 0, chars: 0 };
  e.count++; e.chars += s.length; byKind.set(s.kind, e);
}
for (const [kind, e] of [...byKind.entries()].sort((a, b) => b[1].chars - a[1].chars)) {
  console.log(`  ${kind.padEnd(12)} ${String(e.count).padStart(3)}개  ${e.chars.toLocaleString().padStart(9)}자  (${(e.chars / source.length * 100).toFixed(1)}%)`);
}
