/**
 * src/ai/RegionEdit.ts 단위 테스트 — 견고성 매핑에서 검증한 불변식을 회귀로 고정한다.
 *  - Fix 1: snap이 서브파트(SelectTrigger) 조각이 아니라 완결 컨트롤(<Select>)을 잡는다.
 *  - 안전 게이트 4종: anchor-missing / anchor-comment / anchor-import / snap-failed + ok.
 *  - Fix 2: checkRegionRootTag가 영역-밖 재작성(루트 태그 변화)을 거부한다.
 */
import { locateEditRegion, checkRegionRootTag, firstJsxTag } from '../src/ai/RegionEdit';
import { runHybridRegionEdit } from '../src/ai/RegionEditService';
import { findUnresolvedReferences, resolveKnownImports } from '../src/ai/StructuralAnchor';

const SRC = [
  /*  1 */ "import { useState } from 'react';",
  /*  2 */ "import { useApi } from '@axiom/hooks';",
  /*  3 */ 'import {',
  /*  4 */ '  Select,',
  /*  5 */ '  SelectContent,',
  /*  6 */ '  SelectItem,',
  /*  7 */ '  SelectTrigger,',
  /*  8 */ '  SelectValue,',
  /*  9 */ "} from '@axiom/components/ui';",
  /* 10 */ '',
  /* 11 */ 'type TResp = { total: number };',
  /* 12 */ '',
  /* 13 */ 'export default function Page(): React.ReactNode {',
  /* 14 */ '  // 필터영역 주석',
  /* 15 */ "  const [status, setStatus] = useState('all');",
  /* 16 */ '  const employeeCount = 0;',
  /* 17 */ "  const { data } = useApi<TResp>('/api/x');",
  /* 18 */ '  return (',
  /* 19 */ '    <div className="toolbar">',
  /* 20 */ '      <Select value={status} onValueChange={setStatus}>',
  /* 21 */ '        <SelectTrigger>',
  /* 22 */ '          <SelectValue placeholder="재직상태" />',
  /* 23 */ '        </SelectTrigger>',
  /* 24 */ '        <SelectContent>',
  /* 25 */ '          <SelectItem value="all">전체</SelectItem>',
  /* 26 */ '          <SelectItem value="재직">재직</SelectItem>',
  /* 27 */ '        </SelectContent>',
  /* 28 */ '      </Select>',
  /* 29 */ '    </div>',
  /* 30 */ '  );',
  /* 31 */ '}',
].join('\n');

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

console.log('locateEditRegion — Fix 1 (완결 컨트롤 스냅) + 안전 게이트:');

// T1: 재직상태 = SelectValue 줄에 매칭 → snap이 통짜 <Select>까지 올라가고 gate ok
{
  const r = locateEditRegion(SRC, '재직상태 select를 api로');
  check('ok 게이트: 코드줄 앵커 + 완결 JSX 스냅', r.safety.ok && r.safety.gate === 'ok', `gate=${r.safety.gate}`);
  check('snap 루트가 <Select> (서브파트 아님)', firstJsxTag(r.region) === 'Select', `root=${firstJsxTag(r.region)}`);
  check('영역이 </Select>까지 완결', r.region.includes('</Select>') && r.region.includes('<SelectContent>'), `region=${JSON.stringify(r.region.slice(0, 40))}`);
  check('영역이 20~28줄 통짜 Select', r.startLine === 20 && r.endLine === 28, `${r.startLine}~${r.endLine}`);
  // depsHeader가 멀티라인 import를 온전히 담는가 (splitTsSections 멀티라인 import 수정)
  check('depsHeader에 멀티라인 import 전체 포함', r.depsHeader.includes('SelectContent') && r.depsHeader.includes("from '@axiom/components/ui'"), `header=${JSON.stringify(r.depsHeader.slice(0, 80))}`);
}

// T2: anchor-missing — 토큰이 파일에 없음
{
  const r = locateEditRegion(SRC, '엑셀 다운로드 버튼 추가');
  check('anchor-missing: grep 점수 0 → full', !r.safety.ok && r.safety.gate === 'anchor-missing', `gate=${r.safety.gate}, score=${r.bestScore}`);
}

// T3: anchor-comment — 최고 매칭이 주석
{
  const r = locateEditRegion(SRC, '필터영역 개선');
  check('anchor-comment: 주석 앵커 → full', !r.safety.ok && r.safety.gate === 'anchor-comment', `gate=${r.safety.gate}, line=${r.bestLine}`);
}

// T4: anchor-import — 최고 매칭이 import 라인
{
  const r = locateEditRegion(SRC, 'useApi 적용');
  check('anchor-import: import 앵커 → full', !r.safety.ok && r.safety.gate === 'anchor-import', `gate=${r.safety.gate}, line=${r.bestLine}`);
}

// T5: snap-failed — 비-JSX 코드줄 앵커(감싸는 JSX 요소 없음)
{
  const r = locateEditRegion(SRC, 'employeeCount 수정');
  check('snap-failed: 비-JSX 코드줄 → full', !r.safety.ok && r.safety.gate === 'snap-failed', `gate=${r.safety.gate}, line=${r.bestLine}`);
}

console.log('\ncheckRegionRootTag — Fix 2 (영역-밖 재작성 거부):');
{
  const a = checkRegionRootTag('<SelectTrigger>\n  <SelectValue/>\n</SelectTrigger>', '<Select>\n  <SelectTrigger/>\n</Select>');
  check('Trigger 영역 → Select 출력 = 거부', !a.ok, `origTag=${a.origTag}, outTag=${a.outTag}`);

  const b = checkRegionRootTag('  <Select value={x}>\n</Select>', '<Select value={y}>\n</Select>');
  check('같은 루트 Select = splice 허용', b.ok);

  const c = checkRegionRootTag('<Select>\n</Select>', 'const x = 500; // 순수 로직, JSX 없음');
  check('한쪽이 JSX 없음 = 검사 보류(허용)', c.ok, `outTag=${c.outTag}`);
}

// ─── RegionEditService (호스트 주도 하이브리드 producer) — stub 모델로 결정론 검증 ──────
console.log('\nrunHybridRegionEdit — 합성 + 폴백 계약:');
await (async () => {
  // React 표준 훅 자동 import 보강: 모델이 useRef를 도입(파일은 useState만 import) → applied
  {
    const model = [
      '<region>\n      <Select value={status} onValueChange={setStatus}>\n        <SelectTrigger/>\n      </Select>\n</region>',
      '<hook>const timer = useRef<number | null>(null);</hook>',
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('useRef 자동 import 보강 → applied(폴백 아님)', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('finalText에 useRef import 보강', !!o.finalText && /import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*'react'/.test(o.finalText!), `header=${(o.finalText ?? '').split('\n').slice(0, 6).join(' | ')}`);
  }
  check('resolveKnownImports가 react 훅 매핑', resolveKnownImports(['useRef', 'useEffect']).some((r) => r.module === 'react' && (r.named ?? []).includes('useRef')));

  // 정상: 같은 루트 <Select> 재작성 + useApi 훅 → applied, finalText에 훅·새 JSX 반영
  {
    const model = [
      '<region>',
      '      <Select value={status} onValueChange={setStatus}>',
      '        <SelectTrigger><SelectValue placeholder="재직상태" /></SelectTrigger>',
      '        <SelectContent>',
      '          {statuses.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}',
      '        </SelectContent>',
      '      </Select>',
      '</region>',
      "<hook>const { data: statuses } = useApi<string[]>('/api/statuses');</hook>",
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('applied: 게이트 통과 + 합성', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('finalText에 새 훅 삽입', !!o.finalText && o.finalText.includes("useApi<string[]>('/api/statuses')"));
    check('finalText에 재작성 JSX(map) 반영', !!o.finalText && o.finalText.includes('statuses.map'));
    check('finalText !== 원본', o.finalText !== SRC);
  }

  // 게이트 차단: 앵커 부재 → 모델 호출조차 안 함, fallback
  {
    let called = false;
    const o = await runHybridRegionEdit(SRC, '엑셀 다운로드 버튼 추가', async () => { called = true; return ''; });
    check('anchor-missing: fallback + 모델 미호출', o.status === 'fallback' && o.reason === 'anchor-missing' && !called, `status=${o.status}, reason=${o.reason}, called=${called}`);
  }

  // root-tag 불일치: 영역(<Select>)을 <SelectTrigger>로 재작성 → fallback
  {
    const model = '<region>\n  <SelectTrigger><SelectValue/></SelectTrigger>\n</region>';
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('root-tag 불일치: fallback', o.status === 'fallback' && o.reason === 'root-tag-mismatch', `status=${o.status}, reason=${o.reason}`);
  }

  // 의존성 미해소: 훅이 선언/ import 없는 타입을 참조 → fallback (조용한 컴파일 깨짐 차단)
  {
    const model = [
      '<region>\n      <Select value={status} onValueChange={setStatus}>\n        <SelectTrigger/>\n      </Select>\n</region>',
      "<hook>const { data } = useApi<TUnknownResp>('/x');</hook>",
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('의존성 미해소(TUnknownResp): fallback', o.status === 'fallback' && o.reason === 'unresolved-deps', `status=${o.status}, reason=${o.reason}`);
  }
})();

// ─── findUnresolvedReferences — 의존성 게이트 import 전체 스캔(useState 오탐 수정) ──────
console.log('\nfindUnresolvedReferences — 쪼개진/멀티라인 import 해소:');
{
  // 라이브 오탐 재현: import 사이 주석으로 그룹이 쪼개진 둘째 그룹의 useState
  const splitImports = [
    "import { useApi } from '@axiom/hooks';",
    '// React 훅',
    "import { useState } from 'react';",
    '',
    'export default function P() { return null; }',
  ].join('\n');
  const d = findUnresolvedReferences("const [x, setX] = useState('a');", splitImports);
  check('주석으로 쪼개진 import 그룹의 useState 해소(오탐 수정)', d.ok, `unresolved=[${d.unresolved.join(',')}]`);

  // 멀티라인 import의 named 타입 해소
  const multiline = [
    'import {',
    '  type TFoo,',
    '  Bar,',
    "} from './x';",
    '',
    'export default function P() { return null; }',
  ].join('\n');
  const d2 = findUnresolvedReferences('const v: TFoo = bar;', multiline);
  check('멀티라인 import의 타입(TFoo) 해소', d2.ok, `unresolved=[${d2.unresolved.join(',')}]`);

  // 진짜 미선언은 여전히 미해소(게이트 본연 기능 보존)
  const d3 = findUnresolvedReferences('const v: TMissing = 1;', 'export default function P() { return null; }');
  check('진짜 미선언 타입은 여전히 미해소', !d3.ok && d3.unresolved.includes('TMissing'), `unresolved=[${d3.unresolved.join(',')}]`);

  // 라이브 오탐 2: 한정명 앰비언트 전역(NodeJS.Timeout)은 선언 필요 대상 아님
  const withRef = "import { useRef } from 'react';\nexport default function P() { return null; }";
  const d4 = findUnresolvedReferences('const r = useRef<NodeJS.Timeout | null>(null);', withRef);
  check('한정명 앰비언트(NodeJS.Timeout) 해소(오탐 수정)', d4.ok, `unresolved=[${d4.unresolved.join(',')}]`);

  // 그래도 bare 커스텀 타입은 잡는다(필터가 본연 기능을 약화시키지 않음)
  const withApi = "import { useApi } from '@axiom/hooks';\nexport default function P() { return null; }";
  const d5 = findUnresolvedReferences("const { data } = useApi<TFoo>('/x');", withApi);
  check('bare 커스텀 타입(TFoo)은 여전히 미해소', !d5.ok && d5.unresolved.includes('TFoo'), `unresolved=[${d5.unresolved.join(',')}]`);
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
