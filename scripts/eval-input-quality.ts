/**
 * 입력(다이어트) 품질 테스트 — 모델 없이 결정론으로만 채점한다.
 *
 * 실제 본체 src/ai/RegionInputQuality.analyzeInputQuality 를 그대로 호출해(드리프트 0),
 * 픽스처 + 쿼리 케이스마다 "조립된 region 입력이 충분한가"를 플래그로 판정하고,
 * 케이스가 기대한 플래그가 떴는지/안 떴는지로 PASS/FAIL을 매긴다.
 *
 * full 입력은 출시 경로가 아니라 채점 기준자다 — 여기선 source 전체를 oracle로 삼아
 * 다이어트가 빠뜨린 사실(비가시 컨트롤·읽기전용 편집지점)을 역산한다.
 *
 * 실행: npm run eval:input   (esbuild로 vscode 스텁 후 번들 실행)
 */
import * as fs from 'fs';
import * as path from 'path';
import { analyzeInputQuality, type FlagCode } from '../src/ai/decompose/RegionInputQuality';

interface Case {
  no: number;
  label: string;
  fixture: string;
  query: string;
  /** 반드시 떠야 하는 플래그(다이어트 결함을 노출해야 함) */
  expectFlags: FlagCode[];
  /** 절대 뜨면 안 되는 플래그(정상 케이스에 오탐 금지) */
  forbidFlags?: FlagCode[];
  /** 이 입력이 충분(adequate)해야 하는가 */
  expectAdequate: boolean;
  note: string;
}

const FX = (name: string): string => path.resolve(process.cwd(), 'scripts', 'eval-fixtures', name);

const CASES: Case[] = [
  {
    no: 1,
    label: '다중 지점 필터(사용자 실측)',
    fixture: 'EmployeeListPage.tsx',
    query: '현재 파일에 select(부서, 재직상태, 투입상태)를 변경하면, 아래쪽 인력 리스트 테이블의 내용을 필터링 하게 적용해줘',
    expectFlags: ['region-mistarget'],
    forbidFlags: ['control-invisible', 'anchor-unsafe', 'edit-locus-readonly'],
    expectAdequate: true,
    note: 'B+C 활성: 인벤토리가 control-invisible 억제 + <replace> 채널이 edit-locus-readonly 억제 → region-mistarget은 info로 강등 → adequate. (probe:real로 실제 적용도 성공 확인.)',
  },
  {
    no: 2,
    label: '단일 컨트롤 직접 지목(양성대조)',
    fixture: 'EmployeeListPage.tsx',
    query: '재직상태 select를 api로 바꿔줘',
    expectFlags: [],
    forbidFlags: ['region-mistarget'],
    expectAdequate: true,
    note: 'Select 한 곳을 직접 지목 → region이 그 Select로 스냅되면 컨테이너 오타깃 없어야 정상.',
  },
];

console.log('입력(다이어트) 품질 테스트 — 모델 없음, 결정론 채점\n');

let allPass = true;
const summary: { no: number; label: string; pass: boolean }[] = [];

for (const c of CASES) {
  const source = fs.readFileSync(FX(c.fixture), 'utf-8');
  const r = analyzeInputQuality(source, c.query);
  const got = new Set(r.flags.map((f) => f.code));

  console.log('='.repeat(96));
  console.log(`■ 케이스 ${c.no}: ${c.label}`);
  console.log(`  파일: ${c.fixture}  쿼리: "${c.query}"`);
  console.log(`  본질: ${c.note}`);
  console.log('-'.repeat(96));
  console.log(
    `  타깃: region 루트 <${r.located.regionRootTag ?? '없음'}> (${r.located.startLine}~${r.located.endLine}줄) ` +
      `/ 안전게이트 ${r.located.safetyOk ? 'PASS' : '🛑 ' + r.located.safetyGate}`,
  );
  console.log(
    `  간결성: 입력 ${r.leanness.totalInputChars}자 / 원본 ${r.leanness.sourceChars}자 = 다이어트비 ${r.leanness.dietRatio} ` +
      `(region ${r.leanness.regionChars} · deps ${r.leanness.depsHeaderChars} · backing ${r.leanness.backingChars})`,
  );
  if (r.flags.length === 0) {
    console.log('  플래그: (없음)');
  } else {
    for (const f of r.flags) {
      const icon = f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🔵';
      console.log(`  ${icon} [${f.code}] ${f.message}`);
    }
  }
  console.log(`  → 입력 충분(adequate): ${r.adequate ? '✅ 예' : '❌ 아니오'}`);

  // 채점
  const missing = c.expectFlags.filter((f) => !got.has(f));
  const forbidden = (c.forbidFlags ?? []).filter((f) => got.has(f));
  const adequacyOk = r.adequate === c.expectAdequate;
  const pass = missing.length === 0 && forbidden.length === 0 && adequacyOk;
  if (!pass) {
    allPass = false;
    if (missing.length) console.log(`  ✗ 기대 플래그 누락: [${missing.join(', ')}]`);
    if (forbidden.length) console.log(`  ✗ 금지 플래그 발생(오탐): [${forbidden.join(', ')}]`);
    if (!adequacyOk) console.log(`  ✗ adequate 기대 ${c.expectAdequate} ≠ 실제 ${r.adequate}`);
  }
  console.log(`  판정: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  summary.push({ no: c.no, label: c.label, pass });
}

console.log('='.repeat(96));
console.log('■ 회귀 가드 요약');
for (const s of summary) console.log(`  케이스 ${s.no} ${s.label}: ${s.pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(allPass ? '✅ 회귀 전체 PASS\n' : '❌ 회귀 일부 FAIL — 검출기/다이어트 확인 필요.\n');

// ─── 서베이: 픽스처 8개 × 대표 쿼리 → 다이어트 성적표(플래그 히스토그램) ─────────────
// 정답을 미리 박지 않는다. 다이어트가 어디서 빨강을 내는지 분포로 본다(개선 우선순위 도출용).
interface Survey {
  fixture: string;
  query: string;
  /** 의도 분류 — 다중지점/단일컨트롤/테이블/폼추가 */
  kind: string;
}
const SURVEY: Survey[] = [
  { fixture: 'EmployeeListPage.tsx', query: 'select(부서·재직·투입)로 아래 테이블을 필터링', kind: '다중지점' },
  { fixture: 'ProjectStatusPage.tsx', query: '상태 select로 현황 테이블을 필터링해줘', kind: '다중지점' },
  { fixture: 'ProjectAssignPage.tsx', query: 'select로 인력 목록을 필터링', kind: '다중지점' },
  { fixture: 'EmployeeListPage.tsx', query: '재직상태 select를 api로 바꿔줘', kind: '단일컨트롤' },
  { fixture: 'EmployeeEditPage.tsx', query: '부서 select를 공통코드 api 연동으로', kind: '단일컨트롤' },
  { fixture: 'EmployeeFormPage.tsx', query: '직급 select를 api로 채워줘', kind: '단일컨트롤' },
  { fixture: 'ProjectListPage.tsx', query: '정렬 드롭다운으로 목록 정렬', kind: '단일컨트롤' },
  { fixture: 'EmployeeDetailPage.tsx', query: '이력 테이블에 컬럼 추가해줘', kind: '테이블' },
  { fixture: 'ProjectDetailPage.tsx', query: '프로젝트 정보 테이블에 컬럼 추가', kind: '테이블' },
  { fixture: 'EmployeeFormPage.tsx', query: '연락처 input 추가해줘', kind: '폼추가' },
];

console.log('='.repeat(96));
console.log('■ 서베이 — 픽스처 × 대표 쿼리 (다이어트 성적표)\n');
const hist: Record<string, number> = {};
const byKind: Record<string, { total: number; inadequate: number }> = {};
console.log('  의도        파일                       region루트   게이트  다이어트  플래그');
console.log('  ' + '-'.repeat(92));
for (const s of SURVEY) {
  const src = fs.readFileSync(FX(s.fixture), 'utf-8');
  const r = analyzeInputQuality(src, s.query);
  for (const f of r.flags) hist[f.code] = (hist[f.code] ?? 0) + 1;
  byKind[s.kind] ??= { total: 0, inadequate: 0 };
  byKind[s.kind].total++;
  if (!r.adequate) byKind[s.kind].inadequate++;
  const codes = r.flags.map((f) => f.code).join(',') || '(없음)';
  const gate = r.located.safetyOk ? 'PASS' : r.located.safetyGate;
  const pad = (v: string, n: number): string => (v + ' '.repeat(n)).slice(0, n);
  console.log(
    `  ${pad(s.kind, 10)}  ${pad(s.fixture, 24)}  ${pad('<' + (r.located.regionRootTag ?? '?') + '>', 10)}  ` +
      `${pad(gate, 6)}  ${pad(String(r.leanness.dietRatio), 7)}  ${r.adequate ? '✅ ' : '❌ '}${codes}`,
  );
}
console.log('\n  ▶ 플래그 히스토그램(개선 우선순위):');
for (const [code, n] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`    ${code}: ${n}`);
console.log('\n  ▶ 의도별 입력 부실(inadequate) 비율:');
for (const [kind, v] of Object.entries(byKind)) console.log(`    ${kind}: ${v.inadequate}/${v.total}`);

process.exitCode = allPass ? 0 : 1;
