/**
 * RegionCaptureRecorder 단위 테스트 — 실패 자동 포집(플라이휠 연료)의 순수 로직 검증.
 *  - redaction 3모드(full/skeleton/meta)가 남기는/지우는 것
 *  - basename만(경로 유출 없음) · id 안정성 · shouldCapture 정책 · JSONL 직렬화
 */
import {
  buildCaptureEntry,
  serializeCaptureLine,
  shouldCapture,
  skeletonizeSource,
  baseName,
  type IRegionCaptureInput,
} from '../src/ai/RegionCaptureRecorder';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const INPUT: IRegionCaptureInput = {
  query: "신규등록 버튼을 클릭 시 alert을 띄워줘 메시지는 'alert 테스트!'",
  filePath: 'c:/redsky/work/proj/src/domains/employee/pages/EmployeeListPage.tsx',
  source: [
    'const handleRegisterClick = () => {',
    "  console.log('신규 등록 버튼 클릭');",
    '  const 급여 = 1234567;',
    '};',
    '<Button onClick={handleRegisterClick}>신규 등록</Button>',
  ].join('\n'),
  status: 'fallback',
  reason: 'handler-body',
  ux: 'full',
  region: { start: 5, end: 5 },
  diagnostics: '[regionEdit] 게이트 차단(handler-body) → full 폴백',
};
const ISO = '2026-07-02T00:00:00.000Z';

console.log('RegionCaptureRecorder — 실패 자동 포집:');

// full: 원본 보존 + 경로 유출 없음 + id 안정
{
  const e = buildCaptureEntry(INPUT, ISO, 'full');
  check('full: 원본 소스 포함', !!e.source && e.source.includes('신규 등록 버튼 클릭'));
  check('basename만 — 전체 경로 유출 없음', e.file === 'EmployeeListPage.tsx' && !JSON.stringify(e).includes('c:/redsky'));
  check('id 안정적(타임스탬프 무관)', e.id === buildCaptureEntry(INPUT, '2099-01-01T00:00:00Z', 'full').id, e.id);
  check('메타 필드 보존(status/reason/ux/region/diagnostics)',
    e.status === 'fallback' && e.reason === 'handler-body' && e.ux === 'full' &&
    e.region?.start === 5 && !!e.diagnostics);
}

// skeleton: 구조 유지 + 민감 데이터 마스킹
{
  const e = buildCaptureEntry(INPUT, ISO, 'skeleton');
  check('skeleton: 구조(식별자·태그) 유지', !!e.source && e.source.includes('handleRegisterClick') && e.source.includes('<Button'));
  check('skeleton: 한글 문구 마스킹', !!e.source && !e.source.includes('신규 등록 버튼 클릭') && e.source.includes('ㅁ'));
  check('skeleton: 숫자 리터럴(2자리+) 마스킹', !!e.source && !e.source.includes('1234567'));
  check('redaction 라벨 기록', e.redaction === 'skeleton');
}

// meta: 소스 미포함, 분포 정보 유지
{
  const e = buildCaptureEntry(INPUT, ISO, 'meta');
  check('meta: 소스 미포함', e.source === undefined);
  check('meta: 분포 정보(query/gate/status)는 유지', !!e.query && e.reason === 'handler-body' && e.status === 'fallback');
}

// shouldCapture 정책
{
  check('실패(fallback/error)는 기본 포집', shouldCapture('fallback', false) && shouldCapture('error', false));
  check('applied는 opt-in일 때만', !shouldCapture('applied', false) && shouldCapture('applied', true));
}

// 직렬화 & 보조 함수
{
  const line = serializeCaptureLine(buildCaptureEntry(INPUT, ISO, 'meta'));
  check('serialize: 끝에 개행 1개', line.endsWith('\n') && !line.slice(0, -1).includes('\n'));
  check('serialize: 유효 JSON', (() => { try { JSON.parse(line); return true; } catch { return false; } })());
  check('baseName: win/posix 구분자', baseName('a\\b\\c.tsx') === 'c.tsx' && baseName('a/b/c.tsx') === 'c.tsx');
  check('skeletonizeSource: 템플릿 리터럴 내용 마스킹', !skeletonizeSource('`총 ${n}원 결제`').includes('결제'));
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
