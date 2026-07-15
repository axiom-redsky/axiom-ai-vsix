// 런타임 토큰바 "현재 파일 13,699자"의 출처 판정: 신코드(D1/D2) vs 구코드(가드 없음) 슬라이스 크기를
// 전 예산 범위에서 계산해 13,699와 일치하는 (코드, 예산) 조합을 찾는다.
import { readFileSync } from 'node:fs';
import { tokenizeQuery } from '../src/ai/decompose/SectionExtractor';
import {
  splitTsSections,
  scoreCodeSections,
  sliceByBudget,
  type CodeSection,
} from '../src/ai/decompose/CodeSectionExtractor';

const file = process.argv[2];
const query = process.argv[3] ?? '직원관리의 상태 select를 api로 바꿔줘';
const TARGET = Number(process.argv[4] ?? 13699);
const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const tokens = tokenizeQuery(query);

// ── 구코드 재현: flood 가드 없음 + score0 필러 허용 ──
function oldScore(sections: CodeSection[], queryTokens: string[]): void {
  for (const s of sections) {
    let score = 0;
    const nameLower = s.name.toLowerCase();
    const bodyLower = s.body.toLowerCase();
    for (const t of queryTokens) {
      if (!t) continue;
      if (nameLower.includes(t)) score += 5;
      else if (bodyLower.includes(t)) score += 1;
    }
    if (s.kind === 'import') score += 2;
    s.score = score;
  }
}
function oldSlice(sections: CodeSection[], maxChars: number): number {
  const sorted = [...sections].sort((a, b) => (b.score !== a.score ? b.score - a.score : a.length - b.length));
  const included = new Set<number>();
  let remaining = maxChars;
  for (const s of sorted) {
    if (s.length <= remaining) {
      included.add(sections.indexOf(s));
      remaining -= s.length;
    }
    if (remaining <= 200) break;
  }
  const ordered = sections.map((s, idx) => ({ s, idx })).sort((a, b) => a.s.startLine - b.s.startLine);
  const parts: string[] = [];
  for (const { s, idx } of ordered) {
    if (included.has(idx)) parts.push(s.body);
    else parts.push(`// ... [${s.kind} ${s.name}] 원본 ${s.endLine - s.startLine + 1}줄 보존 (자리 표시자: 이 이름을 변수처럼 참조 금지)`);
  }
  return parts.join('\n\n').length;
}

// 분할·채점은 코드 버전별 1회만(슬라이스 함수는 sections를 변형하지 않음)
const secsOld = splitTsSections(source);
oldScore(secsOld, tokens);
const secsNew = splitTsSections(source);
scoreCodeSections(secsNew, tokens);

const oldMatches: number[] = [];
const newMatches: number[] = [];
for (let budget = 3000; budget <= 25000; budget += 1) {
  if (oldSlice(secsOld, budget) === TARGET) oldMatches.push(budget);
  if (sliceByBudget(secsNew, budget).totalChars === TARGET) newMatches.push(budget);
}
const fmt = (a: number[]): string => (a.length ? `${a.length}개 예산에서 일치 (${a[0]}~${a[a.length - 1]})` : '일치 없음');
console.log(`target=${TARGET}`);
console.log(`구코드(가드 없음): ${fmt(oldMatches)}`);
console.log(`신코드(D1+D2):    ${fmt(newMatches)}`);
// 대표 예산에서 실제 크기도 출력(감각 확인)
for (const b of [3000, 8000, 12236, 16000, 22236]) {
  console.log(`  budget=${b}: 구=${oldSlice(secsOld, b)} · 신=${sliceByBudget(secsNew, b).totalChars}`);
}
