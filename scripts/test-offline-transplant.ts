/**
 * src/ai/OfflineTransplant.ts 단위 테스트 — **모델 비의존**.
 *
 * 오프라인 verbatim JSX 이식의 결정론 불변식을 회귀로 고정한다:
 *  - extractMainReturnJsx: 여러 return 중 가장 큰 메인 렌더 채택(early return 무시).
 *  - planJsxTransplant: 출처 JSX를 현재 파일 메인 JSX 자리에 splice + 빠진 컴포넌트/값 검출.
 *  - isVerbatimTransplantRequest: 동사+대상 동시 충족만 true(약어 단독 오발 방지).
 */
import {
  extractMainReturnJsx,
  planJsxTransplant,
  isVerbatimTransplantRequest,
} from '../src/ai/OfflineTransplant';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
}

// ─── 픽스처 ────────────────────────────────────────────────────────────────────

// 현재 파일: 단순한 화면. selectedStatus·StatusBadge 없음(이식 후 "빠진 것"으로 검출돼야).
const CURRENT = [
  "import { Button } from '@axiom/components/ui';",
  '',
  'export default function EmployeeListPage(): React.ReactNode {',
  '  if (false) return (',
  '    <div>로딩 중</div>',
  '  );',
  '  return (',
  '    <div className="page">',
  '      <h1>직원</h1>',
  '      <Button>새로고침</Button>',
  '    </div>',
  '  );',
  '}',
].join('\n');

// 출처 파일: 더 풍부한 JSX. selectedStatus(state)·StatusBadge(컴포넌트)를 쓰며, 둘 다 현재 파일엔 없음.
const SOURCE = [
  "import { Button } from '@axiom/components/ui';",
  "import { StatusBadge } from '@axiom/components/status';",
  '',
  'export default function EmployeeListPage(): React.ReactNode {',
  "  const [selectedStatus, setSelectedStatus] = useState('all');",
  '  return (',
  '    <div className="page employee">',
  '      <h1>직원 목록</h1>',
  '      <StatusBadge value={selectedStatus} />',
  '      <ul>',
  '        {items.map((item) => (',
  '          <li key={item.id}>{item.name}</li>',
  '        ))}',
  '      </ul>',
  '      <Button onClick={handleRefresh}>새로고침</Button>',
  '    </div>',
  '  );',
  '}',
].join('\n');

console.log('extractMainReturnJsx — 여러 return 중 메인 렌더 채택:');
{
  const blk = extractMainReturnJsx(CURRENT);
  check('블록 추출됨', !!blk, JSON.stringify(blk));
  // early return(<div>로딩 중</div>)이 아니라 메인 렌더(<div className="page">)를 잡아야 한다.
  const inner = blk?.innerLines.join('\n') ?? '';
  check('early return이 아닌 메인 렌더 채택', inner.includes('className="page"') && !inner.includes('로딩 중'), inner);
  check('라인 범위 정확(7번 return ( 다음부터)', blk?.startLine === 8 && blk?.endLine === 11, `${blk?.startLine}~${blk?.endLine}`);
}

console.log('\nplanJsxTransplant — splice + 빠진 의존성 검출:');
{
  const plan = planJsxTransplant(CURRENT, SOURCE);
  check('ok=true', plan.ok, plan.reason ?? '');
  check('출처 JSX가 결과에 들어감', !!plan.finalText && plan.finalText.includes('employee') && plan.finalText.includes('<StatusBadge'), plan.finalText?.slice(0, 120));
  check('현재 파일 import/컴포넌트 골격 유지', !!plan.finalText && plan.finalText.includes("import { Button }") && plan.finalText.includes('export default function EmployeeListPage'), '');
  check('early return은 보존(메인만 교체)', !!plan.finalText && plan.finalText.includes('로딩 중'), '');
  check('빠진 컴포넌트 StatusBadge 검출', plan.missingComponents.includes('StatusBadge'), plan.missingComponents.join(','));
  check('현재 파일에 있는 Button은 미검출', !plan.missingComponents.includes('Button'), plan.missingComponents.join(','));
  check('빠진 값 selectedStatus 검출', plan.missingValues.includes('selectedStatus'), plan.missingValues.join(','));
  check('빠진 값 handleRefresh 검출', plan.missingValues.includes('handleRefresh'), plan.missingValues.join(','));
  check('map 지역 바인딩 item은 미검출(오탐 방지)', !plan.missingValues.includes('item'), plan.missingValues.join(','));
}

console.log('\nplanJsxTransplant — 폴백 케이스:');
{
  const noJsx = 'export const x = 1;\n';
  check('출처에 JSX 없음 → ok=false', !planJsxTransplant(CURRENT, noJsx).ok, '');
  check('현재에 JSX 없음 → ok=false', !planJsxTransplant(noJsx, SOURCE).ok, '');
  // 동일 내용 이식 → no-op
  check('동일 파일 이식 → ok=false(no-op)', !planJsxTransplant(CURRENT, CURRENT).ok, '');
}

console.log('\nisVerbatimTransplantRequest — 동사+대상 게이트:');
{
  check('"jsx 부분을 …로 적용해줘" → true', isVerbatimTransplantRequest('현재 페이지의 jsx 부분을 다른 파일의 jsx로 적용해줘'), '');
  check('"그대로 끼워줘" → true', isVerbatimTransplantRequest('이 화면을 그대로 끼워줘'), '');
  check('"두 파일 차이 설명해줘" → false', !isVerbatimTransplantRequest('두 파일 차이 설명해줘'), '');
  check('동사만(대상 없음) → false', !isVerbatimTransplantRequest('이거 적용해줘'), '');
  check('대상만(동사 없음) → false', !isVerbatimTransplantRequest('jsx 구조가 궁금해'), '');
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
