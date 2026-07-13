/**
 * 큰 파일(10000줄+) region 입력 품질 측정 — 모델 없이 결정론으로 ①②③을 숫자로 고정한다.
 *
 * 합성 생성기(synth-large-file)로 매번 동일한 ~10000줄 god component 를 만들고, 섹션별
 * ground-truth 앵커(manifest)와 실제 본체(analyzeInputQuality = locateEditRegion)의 결과를
 * 대조해 작은 파일에서 안 보이던 3가지 스케일 결함을 계측한다:
 *
 *  ① deps 폭주     : depsHeader 가 모든 type/interface 를 무차별로 담아 입력이 비대해진다.
 *                    → depsRelevance.relevanceRatio(낮을수록 노이즈↑) + leanness.dietRatio.
 *  ② 앵커 오타깃   : 도메인어 없는 모호 쿼리에서 region 이 엉뚱한(보통 파일 위쪽) 섹션에 스냅.
 *                    → 모호 쿼리가 착지한 섹션 vs 토큰 보유 섹션 수.
 *  ③ 섹션 라우팅   : 도메인어가 유일해도 region 이 의도한 섹션 줄 범위에 떨어지는가.
 *                    → 섹션 적중률(select/table 쿼리, manifest 대조).
 *
 * 정답을 미리 박지 않는다(회귀 가드가 아니라 "현 상태 계기판"). 추세를 보고 레버 우선순위를 정한다.
 * 실행: npm run eval:bigfile
 */
import { generateLargeFile, type SectionManifest } from './synth-large-file';
import { analyzeInputQuality } from '../src/ai/decompose/RegionInputQuality';
import { locateEditRegion } from '../src/ai/RegionEdit';
import { classifyRegionDecline, buildHybridPrompt } from '../src/ai/RegionEditService';
import { estimateTokens, inputBudget, budgetUsagePct } from '../src/ai/promptBudget';

const { source, manifest, lineCount } = generateLargeFile();
const sourceLines = source.split('\n');
/** 입력 예산(기본 32768 창 − 8192 출력예약 = 24576 입력토큰). god component 프롬프트가 이 대비 어디쯤인지 본다. */
const BUDGET = inputBudget();

/** locate 결과로 **실제 조립 프롬프트**(system 전문 + query)의 토큰을 잰다. 게이트 폴백이면 계측 불가라 null. */
function promptTokensFor(loc: ReturnType<typeof locateEditRegion>, query: string): number | null {
  if (!loc.safety.ok) return null;
  const system = buildHybridPrompt(
    loc.depsHeader, loc.region, loc.startLine, loc.endLine, undefined, loc.backingDecls, query, loc.controlInventory,
  );
  return estimateTokens(system) + estimateTokens(query);
}

/** 착지 줄(region 중앙)이 속한 섹션을 manifest 에서 찾는다. 없으면 null(섹션 밖). */
function sectionAt(line: number): SectionManifest | null {
  return manifest.find((m) => line >= m.startLine && line <= m.endLine) ?? null;
}

/** 한 쿼리에 대해 locate 결과를 의도 섹션과 대조한 판정. */
type Verdict = 'hit' | 'cross' | 'gate' | 'outside';
interface RunResult {
  intended: SectionManifest;
  startLine: number;
  endLine: number;
  rootTag: string | null;
  gateOk: boolean;
  gate: string;
  landedIndex: number | null; // 착지 섹션 인덱스(섹션 밖이면 null)
  verdict: Verdict;
  dietRatio: number;
  depsHeaderChars: number;
  keepRatio: number;
  shippedTypes: number;
  sourceTypes: number;
  /** 실제 조립 프롬프트 토큰(system 전문+query). 게이트 폴백이면 null. */
  promptTok: number | null;
}

function run(query: string, intended: SectionManifest): RunResult {
  const loc = locateEditRegion(source, query);
  const rep = analyzeInputQuality(source, query);
  const mid = Math.floor((loc.startLine + loc.endLine) / 2);
  const landed = sectionAt(mid);
  let verdict: Verdict;
  if (!loc.safety.ok) verdict = 'gate';
  else if (landed && landed.index === intended.index) verdict = 'hit';
  else if (landed) verdict = 'cross';
  else verdict = 'outside';
  return {
    intended,
    startLine: loc.startLine,
    endLine: loc.endLine,
    rootTag: rep.located.regionRootTag,
    gateOk: loc.safety.ok,
    gate: loc.safety.gate,
    landedIndex: landed?.index ?? null,
    verdict,
    dietRatio: rep.leanness.dietRatio,
    depsHeaderChars: rep.leanness.depsHeaderChars,
    keepRatio: rep.depsRelevance.keepRatio,
    shippedTypes: rep.depsRelevance.shippedTypeCount,
    sourceTypes: rep.depsRelevance.sourceTypeCount,
    promptTok: promptTokensFor(loc, query),
  };
}

const pad = (v: string | number, n: number): string => (String(v) + ' '.repeat(n)).slice(0, n);
const pct = (n: number, d: number): string => (d > 0 ? ((100 * n) / d).toFixed(0) : '0') + '%';

console.log('큰 파일 region 입력 품질 — 모델 없음, 결정론 계기판\n');
console.log(`합성 파일: ${lineCount}줄 / ${source.length.toLocaleString()}자 / 섹션 ${manifest.length}개 (단일 god component)\n`);

// ── ③ 섹션 라우팅: 도메인어 유일 쿼리(select / table)를 전 섹션에 돌린다 ─────────────
interface Suite {
  label: string;
  make: (m: SectionManifest) => string;
}
const SUITES: Suite[] = [
  { label: 'select(맨바닥)', make: (m) => `${m.ko} 상태 select를 api 연동으로 바꿔줘` },
  { label: 'select(복합어)', make: (m) => `${m.ko}관리의 상태 select를 api 연동으로 바꿔줘` },
  { label: 'table(복합어)', make: (m) => `${m.ko}관리 테이블에 컬럼 추가해줘` },
];

for (const suite of SUITES) {
  const results = manifest.map((m) => run(suite.make(m), m));
  const tally: Record<Verdict, number> = { hit: 0, cross: 0, gate: 0, outside: 0 };
  let dietSum = 0;
  let depsCharSum = 0;
  let keepSum = 0;
  for (const r of results) {
    tally[r.verdict]++;
    dietSum += r.dietRatio;
    depsCharSum += r.depsHeaderChars;
    keepSum += r.keepRatio;
  }
  const n = results.length;
  const ptoks = results.map((r) => r.promptTok).filter((t): t is number => t !== null);
  const meanPtok = ptoks.length ? Math.round(ptoks.reduce((a, b) => a + b, 0) / ptoks.length) : 0;
  const maxPtok = ptoks.length ? Math.max(...ptoks) : 0;
  const overBudget = ptoks.filter((t) => t > BUDGET.usableInput).length;
  console.log('='.repeat(96));
  console.log(`■ ③ 섹션 라우팅 — "${suite.label}" 쿼리 × 전 ${n}개 섹션`);
  console.log(
    `  적중(hit) ${tally.hit}/${n} (${pct(tally.hit, n)})  ` +
      `· 타섹션오타깃(cross) ${tally.cross}  · 게이트폴백(gate) ${tally.gate}  · 섹션밖(outside) ${tally.outside}`,
  );
  console.log(
    `  ① 평균 다이어트비 ${(dietSum / n).toFixed(3)}  · 평균 depsHeader ${Math.round(depsCharSum / n).toLocaleString()}자  ` +
      `· 평균 타입출하 ${(100 * keepSum / n).toFixed(1)}% (${results[0].shippedTypes}/${results[0].sourceTypes} 타입)`,
  );
  console.log(
    `  💰 실제 프롬프트 토큰(region 케이스 ${ptoks.length}건): 평균 ${meanPtok.toLocaleString()} · 최대 ${maxPtok.toLocaleString()} ` +
      `— 예산 ${BUDGET.usableInput.toLocaleString()}의 평균 ${budgetUsagePct(meanPtok, BUDGET)}% · 최대 ${budgetUsagePct(maxPtok, BUDGET)}%` +
      `${overBudget > 0 ? `  ⚠ 예산초과 ${overBudget}건` : ''}`,
  );
  // 처음 6개 섹션 상세 — 무엇이 어디로 착지했는지 눈으로 확인
  console.log('  ' + '-'.repeat(92));
  console.log(`  ${pad('의도섹션', 14)}${pad('판정', 9)}${pad('착지섹션', 14)}${pad('region루트', 12)}${pad('게이트', 14)}줄범위`);
  for (const r of results.slice(0, 6)) {
    const landedKo = r.landedIndex !== null ? manifest[r.landedIndex].ko + '관리' : '(섹션밖)';
    const icon = r.verdict === 'hit' ? '✅hit' : r.verdict === 'cross' ? '🔴cross' : r.verdict === 'gate' ? '🟡gate' : '⚪out';
    console.log(
      `  ${pad(r.intended.ko + '관리', 14)}${pad(icon, 9)}${pad(landedKo, 14)}` +
        `${pad('<' + (r.rootTag ?? '?') + '>', 12)}${pad(r.gateOk ? 'PASS' : r.gate, 14)}${r.startLine}~${r.endLine}`,
    );
  }
  console.log();
}

// ── ② 앵커 오타깃: 도메인어 없는 모호 쿼리 ────────────────────────────────────────
console.log('='.repeat(96));
console.log('■ ② 앵커 오타깃 — 도메인어 없는 모호 쿼리(전 섹션이 같은 토큰 보유)');
const AMBIG = [
  '상태 select를 api로 바꿔줘',
  '검색 input 추가해줘',
  '테이블에 컬럼 추가해줘',
  '현재 화면에서 입력필드에 api를 통해 가져온 데이터를 바인딩 해줘', // 실모델 실측: 무앵커 모호(diffuseControl)
];
for (const q of AMBIG) {
  const loc = locateEditRegion(source, q);
  const rep = analyzeInputQuality(source, q);
  const mid = Math.floor((loc.startLine + loc.endLine) / 2);
  const landed = sectionAt(mid);
  // 이 쿼리의 핵심 토큰을 몇 개 섹션이 보유하는지(모호도) — 'select'/'상태'/'테이블'/'검색'은 전 섹션 공통.
  const tokenHits = manifest.filter((m) => {
    const block = sourceLines.slice(m.startLine - 1, m.endLine).join('\n').toLowerCase();
    return /상태|select|검색|input|테이블|table|컬럼/.test(block);
  }).length;
  console.log('  ' + '-'.repeat(92));
  console.log(`  쿼리: "${q}"`);
  console.log(
    `    → 착지: ${landed ? landed.ko + '관리(섹션 ' + (landed.index + 1) + ')' : '(섹션밖)'} ` +
      `[${loc.startLine}~${loc.endLine}, <${rep.located.regionRootTag ?? '?'}>] · 게이트 ${loc.safety.ok ? 'PASS' : '🟡' + loc.safety.gate}`,
  );
  console.log(`    → 모호도: 토큰 보유 섹션 ${tokenHits}/${manifest.length} (이 중 1곳만 선택됨 = 나머지는 무시)`);
  if (loc.safety.gate === 'ambiguous') {
    const c = loc.ambiguousCandidates;
    console.log(`    → 되물음 후보 ${c.length}개: ${c.slice(0, 6).join(', ')}${c.length > 6 ? ` …외 ${c.length - 6}` : ''}`);
  }
}
console.log();

// ── ① deps 폭주 단독 클로즈업 ─────────────────────────────────────────────────────
console.log('='.repeat(96));
console.log('■ ① depsHeader 폭주 — 대표 쿼리 1건 분해');
{
  const m = manifest[Math.floor(manifest.length / 2)]; // 파일 중앙 섹션(위쪽 편향 영향 배제)
  const q = `${m.ko}관리의 상태 select를 api 연동으로 바꿔줘`;
  const rep = analyzeInputQuality(source, q);
  const L = rep.leanness;
  const D = rep.depsRelevance;
  console.log(`  쿼리: "${q}"  (의도 섹션: ${m.ko}관리, 줄 ${m.startLine}~${m.endLine})`);
  console.log(
    `  입력 ${L.totalInputChars.toLocaleString()}자 = region ${L.regionChars} + deps ${L.depsHeaderChars.toLocaleString()} + backing ${L.backingChars}`,
  );
  console.log(`  다이어트비 ${L.dietRatio} (원본 ${L.sourceChars.toLocaleString()}자 대비)`);
  console.log(
    `  타입 출하 ${(100 * D.keepRatio).toFixed(1)}% — type/interface ${D.shippedTypeCount}/${D.sourceTypeCount}개만 헤더에 실림 ` +
      `(${D.shippedTypeChars.toLocaleString()}/${D.sourceTypeChars.toLocaleString()}자) → 나머지 가지치기됨`,
  );
  // ⚠ 위 leanness(totalInputChars)는 region+deps+backing만 센다. 실제 프롬프트엔 정적 규칙·계약카드·prop표가
  //   더 붙는다 — 그 진짜 합을 예산에 대조한다(32k 피벗의 핵심 숫자).
  const loc = locateEditRegion(source, q);
  const ptok = promptTokensFor(loc, q);
  if (ptok !== null) {
    console.log(
      `  💰 실제 프롬프트 ${ptok.toLocaleString()}토큰 = 예산 ${BUDGET.usableInput.toLocaleString()}의 ${budgetUsagePct(ptok, BUDGET)}%` +
        `${ptok > BUDGET.usableInput ? '  ⚠ 예산 초과 — 앞잘림/응답잘림 위험' : ''}  ` +
        `(leanness ${L.totalInputChars.toLocaleString()}자 → region+deps+backing만; 나머지 규칙·카드가 추가분)`,
    );
  } else {
    console.log(`  💰 실제 프롬프트: 게이트 폴백(${loc.safety.gate})이라 region 프롬프트 미조립 — full 경로가 전체 파일 전송`);
  }
}
console.log();
console.log();

// ── full 사유 계기판 — 대표 쿼리가 어느 UX 버킷으로 가는지 분류·집계 ──────────────────
// 목표: "조용히 full→실패"를 없애는 것(= full을 0으로 만드는 게 아님). 각 쿼리가 region적용/되물음/
// 안내/full 중 어디로 가는지 본다. ChatViewProvider와 동일한 classifyRegionDecline 정책 공유(드리프트0).
console.log('='.repeat(96));
console.log('■ full 사유 계기판 — 대표 쿼리 × UX 버킷 분류');
type Bucket = 'region' | 'reask' | 'inform' | 'full';
const classify = (q: string): Bucket => {
  const loc = locateEditRegion(source, q);
  if (loc.safety.ok) return 'region';
  const ux = classifyRegionDecline(q, source, loc.safety.gate);
  return ux === 'reask-ambiguous' ? 'reask' : ux === 'inform-absent' ? 'inform' : 'full';
};
// want: 사람이 본 "이 쿼리는 이래야 한다"(계기판 해석용 라벨, 강제 아님).
const AUDIT: { q: string; want: string }[] = [
  { q: '직원관리의 상태 select를 api로 바꿔줘', want: 'region(구역+컨트롤 지목)' },
  { q: '부서관리 select를 공통코드로 연동', want: 'region' },
  { q: '예산관리 테이블에 컬럼 추가해줘', want: 'region(구역 지목 테이블)' },
  { q: '상태 select를 api로 바꿔줘', want: 'reask(구역 무지목)' },
  { q: '입력필드에 데이터 바인딩 해줘', want: 'reask(컨트롤만, 구역 무지목)' },
  { q: '체크박스를 api로 연동해줘', want: 'inform(파일에 Checkbox 0개)' },
  { q: '토글 스위치 상태를 변경해줘', want: 'inform(파일에 Switch 0개)' },
  { q: '화면 맨 아래에 안내 문구를 추가해줘', want: 'full(정당:신규추가)' },
  { q: '정렬 로직을 리팩토링해줘', want: 'full(정당:로직)' },
  { q: '테이블에 컬럼 추가해줘', want: 'full(구역 무지목 테이블)' },
];
const tally: Record<Bucket, number> = { region: 0, reask: 0, inform: 0, full: 0 };
const icon: Record<Bucket, string> = { region: '✅region', reask: '❓reask', inform: '⚠️inform', full: '⬇️full' };
const pad2 = (v: string, n: number): string => {
  let w = 0;
  for (const ch of v) w += ch.charCodeAt(0) > 0x2000 ? 2 : 1; // 한글 폭 보정
  return v + ' '.repeat(Math.max(0, n - w));
};
for (const a of AUDIT) {
  const b = classify(a.q);
  tally[b]++;
  console.log(`  ${pad2(icon[b], 10)} ${pad2('"' + a.q + '"', 44)} 기대: ${a.want}`);
}
console.log('  ' + '-'.repeat(92));
console.log(
  `  분포: ✅region ${tally.region} · ❓reask ${tally.reask} · ⚠️inform ${tally.inform} · ⬇️full ${tally.full}` +
    `   (full만 모델로 전체 전송 — 정당[신규·로직]인지 미커버[region 확장 여지]인지 판단)`,
);
console.log();
console.log(
  '계기판 끝 — "조용히 full→실패"가 목표0. region/reask/inform 은 모두 안전 종착(전체전송·실패 없음). ' +
    'full 버킷만 남겨 정당 vs 미커버를 가른다.',
);
