/**
 * 견고성 매핑 하니스 (LLM 없이 결정론 부분만).
 *
 * **실제 본체 모듈** src/ai/RegionEdit.ts 의 locateEditRegion/snapToElement 를 그대로 호출해
 * 5개 질문 유형 + 양성대조에 대해 위치결정 단계가 어디서 깨지는지를 찍는다(드리프트 0 — 본체와 같은 코드).
 * 모델 재작성(③ 출력)은 폐쇄망 서버가 필요해 여기서는 다루지 않는다 — 대신 4개 관측점
 *   ① grep 위치 ② 영역 스냅 ③ 합성(splice) 안전성 ④ full 폴백 필요 여부 를 결정론적으로 판정한다.
 *
 * 실행: node scripts/probe-locate.mjs  (esbuild로 vscode 스텁 후 번들 실행)
 */
import * as fs from 'fs';
import * as path from 'path';
import { tokenizeQuery } from '../src/ai/decompose/SectionExtractor';
import { locateEditRegion, snapToElement, firstJsxTag } from '../src/ai/RegionEdit';

interface LocateResult {
  lines: string[];
  bestLine: number;
  bestScore: number;
  matched: string[];
  rawTokens: string[];
  snapped: boolean;
  startLine: number;
  endLine: number;
  region: string;
  depsHeaderChars: number;
  safety: { ok: boolean; gate: string; reason: string };
}

/** 본체 locateEditRegion 결과에 하니스 표시용 필드(rawTokens·snapped)를 덧붙인다. */
function locate(source: string, query: string): LocateResult {
  const loc = locateEditRegion(source, query);
  const snap = snapToElement(loc.lines, loc.bestLine);
  return {
    lines: loc.lines,
    bestLine: loc.bestLine,
    bestScore: loc.bestScore,
    matched: loc.matched,
    rawTokens: tokenizeQuery(query),
    snapped: !!snap,
    startLine: loc.startLine,
    endLine: loc.endLine,
    region: loc.region,
    depsHeaderChars: loc.depsHeader.length,
    safety: loc.safety,
  };
}

// ─── 케이스 정의 ──────────────────────────────────────────────────────────────

interface Case {
  no: number;
  label: string;
  query: string;
  /** 이 요청의 "참된 편집 대상" 라인(채점용 기대 영역) */
  truthLines: number[];
  /** 본질이 무엇인가: 순수삽입 / 모호 / 멀티영역 / 비-JSX로직 / rename */
  nature: string;
  /**
   * 구조 게이트의 기대 라우팅.
   * 'full' = 파손 위험(주석/import/윈도우 앵커) → 반드시 차단해야 함.
   * 'pass' = 균형 잡힌 실제 JSX 요소로 스냅 → splice가 파일을 깨지 않음(구조 안전).
   *          단, 의미적으로는 불완전할 수 있음(잘못된 위치/멀티영역) — 그건 별도 intent 레이어 몫.
   */
  expect: 'full' | 'pass';
}

const CASES: Case[] = [
  { no: 1, label: '순수 추가(앵커 없음)', query: '직원 목록에 엑셀 다운로드 버튼 추가', truthLines: [55, 60], nature: '신규 버튼 — 파일에 엑셀/다운로드/버튼 단어 없음', expect: 'pass' },
  { no: 2, label: '모호한 질문', query: '필터 개선해줘', truthLines: [], nature: '대상 불명 — "필터" 단어도 파일에 없음', expect: 'full' },
  { no: 3, label: '멀티 컨트롤', query: '재직상태·투입상태 select도 API로', truthLines: [63, 88], nature: '두 개의 <Select>를 동시에 — 영역이 둘', expect: 'pass' },
  { no: 4, label: '비-JSX 로직', query: '검색 debounce를 500ms로', truthLines: [38, 45], nature: '훅/이펙트 로직 변경 — JSX 아님, 게다가 debounce가 아직 없음', expect: 'full' },
  { no: 5, label: 'rename', query: 'department를 dept로', truthLines: [25, 116], nature: '식별자 전역 치환 — 파일 전체에 흩어짐', expect: 'full' },
  // 양성 대조군(positive control): 게이트를 통과해야 정상 — region/hybrid가 켜져야 하는 케이스
  { no: 6, label: '단일 JSX 영역(양성대조)', query: '재직상태 select를 api로 바꿔줘', truthLines: [60, 72], nature: '단일 <Select> 한 곳 — 게이트 PASS 기대', expect: 'pass' },
  // 사용자 실측 재현: 두 번째 <Select>(투입상태)만 — grep이 "투입상태"의 어느 줄을 잡고 snap이 그 <Select>를 완결로 감싸는지
  { no: 7, label: '단일 JSX 영역(투입상태+디코이)', query: "현재 파일의 투입상태 select에 '/api/common-codes' api를 적용해줘", truthLines: [76, 89], nature: '두 번째 <Select>(투입상태). 훅 영역에 토큰 가진 비-JSX const 디코이 존재 → grep이 디코이 건너뛰고 실제 Select 잡아야 PASS', expect: 'pass' },
];

// ─── 실행 ────────────────────────────────────────────────────────────────────

const fixturePath = path.resolve(process.cwd(), 'scripts', 'fixtures', 'EmployeeListPage.tsx');
const source = fs.readFileSync(fixturePath, 'utf-8');
const totalLines = source.split('\n').length;

console.log(`파일: ${fixturePath.replace(/\\/g, '/')}`);
console.log(`원본 ${source.length}자 / ${totalLines}줄\n`);

const overlaps = (a: number, b: number, lo: number, hi: number): boolean => a <= hi && b >= lo;

const summary: { no: number; label: string; gate: string; routed: string; expectFull: boolean }[] = [];

for (const c of CASES) {
  const r = locate(source, c.query);
  console.log('='.repeat(96));
  console.log(`■ 케이스 ${c.no}: ${c.label} — "${c.query}"`);
  console.log(`  본질: ${c.nature}`);
  console.log('-'.repeat(96));
  console.log(`  토큰(raw): [${r.rawTokens.join(', ')}]`);
  console.log(`  ① grep: ${r.bestLine}줄, 점수 ${r.bestScore}, 매칭 토큰 [${r.matched.join(', ') || '없음'}]`);
  console.log(`     ↳ ${r.bestLine}줄 내용: ${JSON.stringify(r.lines[r.bestLine - 1]?.trim() ?? '')}`);
  const regionRootTag = r.region.match(/<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? '(없음)';
  console.log(`  ② 스냅: ${r.snapped ? `JSX 요소 ${r.startLine}~${r.endLine}줄, 루트 <${regionRootTag}>` : `스냅 실패 → ±윈도우 ${r.startLine}~${r.endLine}줄`} (영역 ${r.endLine - r.startLine + 1}줄, ${r.region.length}자)`);

  // 추가 결정론 신호
  const grepMissed = r.bestScore <= 0;                                   // 앵커 부재
  const hitLine = (r.lines[r.bestLine - 1] ?? '').trim();
  const grepHitComment = /^\/\/|^\/\*|^\*/.test(hitLine);                // grep이 주석에 걸림(코드 아님)
  const truthCovered = c.truthLines.length === 0
    ? false
    : overlaps(r.startLine, r.endLine, c.truthLines[0], c.truthLines[1]);
  const truthSpan = c.truthLines.length ? c.truthLines[1] - c.truthLines[0] + 1 : 0;
  const regionSpan = r.endLine - r.startLine + 1;
  // 참 대상이 영역보다 크면(여러 곳) 한 영역으로 못 덮음
  const truthExceedsRegion = c.truthLines.length > 0 && truthSpan > regionSpan;

  // ③ 합성(splice) 안전성 — 스냅 실패 시 윈도우는 균형 잡힌 블록이 아니라 splice 자체가 위험
  let verdict3: string;
  if (grepMissed) {
    verdict3 = '❌ grep 점수 0 → 못 찾고 1줄(import)로 추락. 영역 재작성이 import를 덮어써 파일 파손.';
  } else if (!r.snapped) {
    verdict3 = `❌ 스냅 실패 → ±윈도우(${r.startLine}~${r.endLine})는 균형 블록이 아님. 모델 재작성 splice 시 JSX/괄호 깨짐.`;
  } else if (!truthCovered) {
    verdict3 = `❌ grep은 ${r.bestLine}줄을 잡았으나 참 대상(${c.truthLines.join('~')}줄)이 영역 밖 → 요청 미반영.`;
  } else if (truthExceedsRegion) {
    verdict3 = '⚠️ 참 대상이 영역보다 큼(여러 곳). 단일 region splice로는 일부만 반영.';
  } else {
    verdict3 = '✅ 참 편집대상이 스냅된 완결 JSX 요소 안. 단일 region splice 구조 안전.';
  }
  if (grepHitComment) verdict3 += ' (⚠ 앵커가 주석 — 우연 일치, 신뢰도 낮음)';
  console.log(`  ③ 합성: ${verdict3}`);

  // 🛡️ 실제 production 게이트가 어떻게 라우팅하는지 (SliceProbeProvider._locate.safety 와 동일)
  const routed = r.safety.ok ? 'region/hybrid 실행' : 'full 폴백';
  console.log(`  🛡️ 게이트: ${r.safety.ok ? '✅ PASS' : `🛑 ${r.safety.gate}`} → ${routed}  (${r.safety.reason})`);
  summary.push({ no: c.no, label: c.label, gate: r.safety.gate, routed, expectFull: c.expect === 'full' });

  // ④ full 폴백 필요 판정
  let verdict4: string;
  if (grepMissed) verdict4 = '✅ 필요 — 앵커 부재(grep 0). region/hybrid 금지, full 입력으로.';
  else if (!r.snapped) verdict4 = '✅ 필요 — 스냅 실패(윈도우 폴백). region splice 위험 → full.';
  else if (!truthCovered) verdict4 = '✅ 필요 — 잘못된 영역 스냅. full(또는 멀티영역 locate) 필요.';
  else if (truthExceedsRegion) verdict4 = '△ 부분 — 멀티영역 locate 지원 시 hybrid 가능, 아니면 full.';
  else verdict4 = '✗ 불필요 — region/hybrid로 처리 가능.';
  console.log(`  ④ full 폴백: ${verdict4}`);
  console.log();
}

console.log('='.repeat(96));
console.log('■ 게이트 라우팅 요약');
console.log('  (구조 게이트의 역할 = "파일 파손(조용한 clobber) 차단". 의미적 불완전은 별도 intent 레이어 몫)');
let allCorrect = true;
for (const s of summary) {
  const wantFull = s.expectFull;
  const isFull = s.routed === 'full 폴백';
  const correct = wantFull === isFull;
  if (!correct) allCorrect = false;
  const note = wantFull ? '파손위험→차단 기대' : '구조안전→통과 기대';
  console.log(`  케이스 ${s.no} ${s.label}: ${s.routed} [${s.gate}] — ${note} ${correct ? '✓' : '✗ 불일치!'}`);
}
console.log(allCorrect
  ? '\n✅ 구조 게이트가 파손위험 3건(주석·import·윈도우)을 전부 full로 차단, 구조안전 3건은 통과.\n   잔여: 케이스1(잘못된 위치)·케이스3(멀티영역)은 구조적으로 안전하나 의미적 불완전 → intent 레이어 필요.'
  : '\n❌ 게이트 라우팅이 기대와 다름 — 확인 필요.');
// ─── Fix 2 후처리 게이트 단위 검증 (모델 출력 mismatch 합성) ───────────────────
console.log('\n' + '='.repeat(96));
console.log('■ Fix 2 후처리 root-tag 게이트 단위 검증');
const gate2 = (regionRoot: string, modelOut: string): 'splice' | 'reject→full' => {
  const o = firstJsxTag(regionRoot);
  const m = firstJsxTag(modelOut);
  return o && m && o !== m ? 'reject→full' : 'splice';
};
const fix2Tests: { name: string; region: string; out: string; expect: 'splice' | 'reject→full' }[] = [
  { name: 'Trigger 영역인데 통짜 Select 출력(실제 버그 재현)', region: '<SelectTrigger>\n  <SelectValue/>\n</SelectTrigger>', out: '<Select>\n  <SelectTrigger/>\n</Select>', expect: 'reject→full' },
  { name: '같은 루트 Select 재작성(정상)', region: '<Select value={x}>\n …\n</Select>', out: '<Select value={y}>\n …\n</Select>', expect: 'splice' },
  { name: '같은 루트 Select(공백 차이만)', region: '  <Select>\n</Select>', out: '<Select>\n</Select>', expect: 'splice' },
];
let fix2ok = true;
for (const t of fix2Tests) {
  const got = gate2(t.region, t.out);
  const ok = got === t.expect;
  if (!ok) fix2ok = false;
  console.log(`  ${ok ? '✓' : '✗'} ${t.name}: ${got}`);
}
console.log(fix2ok ? '  ✅ 후처리 게이트가 영역-밖 재작성을 거부하고 정상 재작성은 통과.' : '  ❌ 후처리 게이트 로직 확인 필요.');

console.log('\n(③ 모델 재작성 단계는 폐쇄망 LLM 필요 — 위는 위치결정 결정론 레이어만 평가)');
