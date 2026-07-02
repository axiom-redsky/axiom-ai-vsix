/**
 * region/hybrid 편집 측정 하니스 (모델 무관).
 *
 * locateEditRegion을 코퍼스 전 케이스에 돌려 집계 지표를 출력한다:
 *  - region 적용률(eligibility): full 폴백 없이 region 모드로 남는 비율
 *  - 게이트 분포: 폴백이 어떤 안전 게이트에서 발생하는가
 *  - 토큰 절감률: region 모드일 때 모델에 보내는 입력(depsHeader+region)이
 *    full 파일 대비 몇 % 작은가 (= 토큰 최소화 KPI)
 *
 * expectGate가 적힌 케이스는 회귀 가드 — 예상≠실제면 종료코드 1.
 * expectGate가 없는 케이스는 측정만(탐색).
 *
 * 실행: npm run eval:region  (node scripts/run-eval-region.mjs)
 */
import { locateEditRegion } from '../src/ai/RegionEdit';
import { buildHybridPrompt } from '../src/ai/RegionEditService';
import { estimateTokens as estTokens, inputBudget, budgetUsagePct } from '../src/ai/promptBudget';
import { CASES, FIXTURES, type EvalCase } from './eval-region-corpus';

/** 입력 예산(기본 32768 창 − 8192 출력예약 = 24576 입력토큰). estTokens는 보수적 chars/3(promptBudget). */
const BUDGET = inputBudget();

interface Row {
  c: EvalCase;
  gate: string;
  eligible: boolean;
  regression: boolean;
  fileTok: number;
  /** region 모드 입력(depsHeader+region)만의 토큰 — 종전 save% 계산용(불완전). 폴백이면 null. */
  sentTok: number | null;
  /**
   * **실제 조립된 프롬프트** 토큰(system=buildHybridPrompt 전문 + query). depsHeader+region만 세던
   * 종전 계측이 놓친 정적 규칙·계약카드·컴포넌트 prop표·인벤토리·backing까지 포함한 진짜 페이로드. 폴백이면 null.
   */
  promptTok: number | null;
  regionLines: number;
}

function run(): void {
  const rows: Row[] = [];
  const skipped: string[] = [];

  for (const c of CASES) {
    const src = FIXTURES[c.file];
    if (src === undefined) {
      // 실파일 픽스처는 .gitignore로 로컬 전용 — 없으면 회귀가 아니라 skip(클린 체크아웃 보호).
      skipped.push(c.id);
      continue;
    }
    const r = locateEditRegion(src, c.query);
    const eligible = r.safety.ok;
    const gateMiss = c.expectGate !== undefined && c.expectGate !== r.safety.gate;
    const eligMiss = c.expectEligible !== undefined && c.expectEligible !== eligible;
    const regression = gateMiss || eligMiss;
    const fileTok = estTokens(src);
    const sentTok = eligible ? estTokens(`${r.depsHeader}\n${r.region}`) : null;
    // 실제 모델에 가는 프롬프트를 그대로 조립해 잰다(계약카드·prop표·규칙 포함). referencedSpec은 eval에 없음.
    let promptTok: number | null = null;
    if (eligible) {
      const system = buildHybridPrompt(
        r.depsHeader, r.region, r.startLine, r.endLine, undefined, r.backingDecls, c.query, r.controlInventory,
      );
      promptTok = estTokens(system) + estTokens(c.query);
    }
    rows.push({
      c,
      gate: r.safety.gate,
      eligible,
      regression,
      fileTok,
      sentTok,
      promptTok,
      regionLines: eligible ? r.endLine - r.startLine + 1 : 0,
    });
  }

  // ── 케이스별 표 ──────────────────────────────────────────────────────
  console.log('region/hybrid 측정 — 케이스별:\n');
  const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
  console.log(`  분모(입력예산): ${BUDGET.usableInput.toLocaleString()}토큰 = 창 ${BUDGET.contextWindow.toLocaleString()} − 출력예약 ${BUDGET.outputReserve.toLocaleString()}  ·  bud% 100 초과 = 예산 초과(⚠)\n`);
  console.log(`  ${pad('id', 16)} ${pad('gate', 15)} ${pad('elig', 5)} ${pad('save%', 6)} ${pad('promptTok', 10)} ${pad('bud%', 6)} ${pad('exp', 14)} note`);
  console.log(`  ${'-'.repeat(92)}`);
  for (const row of rows) {
    const save = row.sentTok !== null ? `${Math.round((1 - row.sentTok / row.fileTok) * 100)}%` : '—';
    const ptok = row.promptTok !== null ? row.promptTok.toLocaleString() : '—';
    const bud = row.promptTok !== null ? `${budgetUsagePct(row.promptTok, BUDGET)}%` : '—';
    const overBudget = row.promptTok !== null && budgetUsagePct(row.promptTok, BUDGET) > 100;
    const exp = row.c.expectGate ?? (row.c.expectEligible !== undefined ? `elig=${row.c.expectEligible}` : '(측정)');
    const mark = row.regression ? '❌' : overBudget ? '⚠' : row.eligible ? '✅' : '·';
    console.log(
      `  ${mark} ${pad(row.c.id, 14)} ${pad(row.gate, 15)} ${pad(row.eligible ? 'yes' : 'no', 5)} ` +
        `${pad(save, 6)} ${pad(ptok, 10)} ${pad(bud, 6)} ${pad(exp, 14)} ${row.c.note ?? ''}`,
    );
  }

  // ── 집계 지표 ────────────────────────────────────────────────────────
  const total = rows.length;
  const eligibleRows = rows.filter((r) => r.eligible);
  const eligRate = total ? Math.round((eligibleRows.length / total) * 100) : 0;

  const gateDist = new Map<string, number>();
  for (const r of rows) gateDist.set(r.gate, (gateDist.get(r.gate) ?? 0) + 1);

  const saveRatios = eligibleRows
    .filter((r) => r.sentTok !== null)
    .map((r) => 1 - (r.sentTok as number) / r.fileTok);
  const meanSave = saveRatios.length
    ? Math.round((saveRatios.reduce((a, b) => a + b, 0) / saveRatios.length) * 100)
    : 0;
  const meanRegionLines = eligibleRows.length
    ? Math.round(eligibleRows.reduce((a, r) => a + r.regionLines, 0) / eligibleRows.length)
    : 0;

  // 실제 프롬프트 토큰 — 예산(24,576) 대비 어디쯤 쌓이는지. 종전 save%는 deps+region만 세 이 값을 못 봤다.
  const promptToks = eligibleRows.map((r) => r.promptTok).filter((t): t is number => t !== null);
  const meanPromptTok = promptToks.length ? Math.round(promptToks.reduce((a, b) => a + b, 0) / promptToks.length) : 0;
  const maxPromptTok = promptToks.length ? Math.max(...promptToks) : 0;
  const overBudgetCount = promptToks.filter((t) => t > BUDGET.usableInput).length;

  console.log('\n집계:');
  console.log(`  • region 적용률(eligibility): ${eligRate}% (${eligibleRows.length}/${total})`);
  console.log(
    `  • 게이트 분포: ${[...gateDist.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(', ')}`,
  );
  console.log(`  • 평균 토큰 절감률(region 케이스, deps+region만): ${meanSave}%`);
  console.log(`  • 평균 region 크기: ${meanRegionLines}줄`);
  console.log(
    `  • 실제 프롬프트 토큰(system 전문+query): 평균 ${meanPromptTok.toLocaleString()} · 최대 ${maxPromptTok.toLocaleString()} ` +
      `(예산 ${BUDGET.usableInput.toLocaleString()}의 평균 ${budgetUsagePct(meanPromptTok, BUDGET)}% · 최대 ${budgetUsagePct(maxPromptTok, BUDGET)}%)`,
  );
  console.log(`  • ⚠ 예산 초과 케이스: ${overBudgetCount}/${eligibleRows.length}`);
  if (skipped.length) {
    console.log(`  • skip(로컬 픽스처 없음): ${skipped.length}개 — ${skipped.join(', ')}`);
  }

  // ── 회귀 판정 ────────────────────────────────────────────────────────
  const regressions = rows.filter((r) => r.regression);
  if (regressions.length > 0) {
    console.log('\n❌ 회귀(예상 불일치):');
    for (const r of regressions) {
      const exp = r.c.expectGate ?? `eligible=${r.c.expectEligible}`;
      const act = r.c.expectGate ? r.gate : `eligible=${r.eligible}`;
      console.log(`   - ${r.c.id}: 기대=${exp} 실제=${act}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ 회귀 없음 (expectGate 케이스 전부 일치)');
  }
}

run();
