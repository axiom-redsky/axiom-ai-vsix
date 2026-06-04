/**
 * src/ai/RegionEdit.ts 단위 테스트 — 견고성 매핑에서 검증한 불변식을 회귀로 고정한다.
 *  - Fix 1: snap이 서브파트(SelectTrigger) 조각이 아니라 완결 컨트롤(<Select>)을 잡는다.
 *  - 안전 게이트 4종: anchor-missing / anchor-comment / anchor-import / snap-failed + ok.
 *  - Fix 2: checkRegionRootTag가 영역-밖 재작성(루트 태그 변화)을 거부한다.
 */
import { locateEditRegion, checkRegionRootTag, firstJsxTag } from '../src/ai/RegionEdit';
import { runHybridRegionEdit } from '../src/ai/RegionEditService';
import { findUnresolvedReferences, resolveKnownImports, applyStructuralEdit } from '../src/ai/StructuralAnchor';

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

  // region 컴포넌트 폐쇄(6.5): 모델이 <region>에 새 UI 컴포넌트(<Card>)를 쓰고 <import> 누락 →
  //   카탈로그(@axiom/components/ui)면 import 자동 보강 후 applied (실측: Card 누락 컴파일 깨짐 차단).
  {
    const model = [
      '<region>',
      '      <Select value={status} onValueChange={setStatus}>',
      '        <SelectTrigger/>',
      '      </Select>',
      '      {status && (<Card><CardHeader><CardTitle>제목</CardTitle></CardHeader><CardContent>{status}</CardContent></Card>)}',
      '</region>',
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('region 새 UI 컴포넌트(Card) import 자동보강 → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('finalText에 Card import 보강', !!o.finalText && /import\s*\{[^}]*\bCard\b[^}]*\}\s*from\s*'@axiom\/components\/ui'/.test(o.finalText!), `header=${(o.finalText ?? '').split('\n').slice(0, 12).join(' | ')}`);
  }

  // region 컴포넌트 폐쇄: 카탈로그에 없는 커스텀 컴포넌트(<StatusBadge>)는 import 경로 불명 → fallback.
  {
    const model = [
      '<region>',
      '      <Select value={status} onValueChange={setStatus}>',
      '        <SelectTrigger/>',
      '      </Select>',
      '      <StatusBadge status={status} />',
      '</region>',
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('region 커스텀 컴포넌트(StatusBadge) 미해소 → fallback', o.status === 'fallback' && o.reason === 'unresolved-components', `status=${o.status}, reason=${o.reason}`);
  }

  // region 컴포넌트 폐쇄: 주석 처리된 컴포넌트는 실제 사용이 아니므로 오탐 없이 applied(회귀 가드).
  {
    const model = [
      '<region>',
      '      <Select value={status} onValueChange={setStatus}>',
      '        <SelectTrigger/>',
      '        {/* <StatusBadge status={status} /> */}',
      '      </Select>',
      '</region>',
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('주석 처리된 컴포넌트는 오탐 없음 → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
  }

  // grounding(영역 밖 const 수정 갭의 정공법): 편집 영역이 참조하는 모듈 스코프 const를 프롬프트에
  //   주입(backingDecls)하고, 모델이 기존 항목 보존한 superset을 내면 확장이 무손실 교체로 적용한다.
  {
    const GSRC = [
      "import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';",
      "import { useState } from 'react';",
      '',
      "const grades = ['사원', '대리', '과장'];",
      '',
      'export default function P(): React.ReactNode {',
      "  const [grade, setGrade] = useState('');",
      '  return (',
      '    <div>',
      '      <Select value={grade} onValueChange={setGrade}>',
      '        <SelectTrigger><SelectValue placeholder="직급 선택" /></SelectTrigger>',
      '        <SelectContent>',
      '          {grades.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}',
      '        </SelectContent>',
      '      </Select>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const q = '직급 셀렉트에 수석 항목을 추가해줘';
    const loc = locateEditRegion(GSRC, q);
    check('grounding: backingDecls에 기존 const(grades, 사원 포함) 주입', loc.backingDecls.includes('grades') && loc.backingDecls.includes("'사원'"), `backing=${JSON.stringify(loc.backingDecls)}`);
    check('grounding: 직급 Select 영역 eligible', loc.safety.ok, `gate=${loc.safety.gate}`);

    // faithful superset(기존 전부 보존 + 수석) → 무손실 교체 적용
    {
      const model = `<region>\n${loc.region}\n</region>\n<hook>const grades = ['사원', '대리', '과장', '수석'];</hook>`;
      const o = await runHybridRegionEdit(GSRC, q, async () => model);
      check('grounding+superset → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
      check('최종 파일: 수석 추가 + 사원 보존', !!o.finalText && o.finalText.includes("'수석'") && o.finalText.includes("'사원'"));
      check('grades 선언 1곳만(중복 없음)', !!o.finalText && (o.finalText.match(/const grades =/g) ?? []).length === 1);
    }
    // lossy(기존 사원 누락) → 교체 거부 → no-op 폴백(손실 적용 차단)
    {
      const model = `<region>\n${loc.region}\n</region>\n<hook>const grades = ['수석', '대리', '과장'];</hook>`;
      const o = await runHybridRegionEdit(GSRC, q, async () => model);
      check('grounding+lossy → no-op 폴백(손실 차단)', o.status === 'fallback' && o.reason === 'no-op', `status=${o.status}, reason=${o.reason}`);
    }
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

// ─── 토큰 어휘 브리징 + 구조 랜드마크 라우팅 (측정 루프가 산출한 개선의 회귀 고정) ──────
console.log('\n어휘 브리징 / 구조 랜드마크 라우팅:');
{
  // 브리지: 순수 한글 "셀렉트"가 영문 <Select>에 매칭돼 region 적용(이전엔 점수 미달로 full 폴백).
  const r = locateEditRegion(SRC, '재직상태 셀렉트를 공통코드로 바꿔줘');
  check('한글 "셀렉트" → <Select> 브리지로 ok', r.safety.ok && firstJsxTag(r.region) === 'Select', `gate=${r.safety.gate}, root=${firstJsxTag(r.region)}`);
}
{
  const TABLE_SRC = [
    'export default function P(): React.ReactNode {',
    '  return (',
    '    <div>',
    '      <table>',
    '        <thead><tr><th>이름</th></tr></thead>',
    '        <tbody><tr><td>{x.name}</td></tr></tbody>',
    '      </table>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  // 랜드마크: "테이블 컬럼" 요청은 표 여는 줄이 2점을 못 얻지만, 표가 하나뿐이면 그 표로 스냅.
  const r = locateEditRegion(TABLE_SRC, '테이블에 부서 컬럼을 추가해줘');
  check('단일 <table> → 랜드마크 라우팅 ok', r.safety.ok && firstJsxTag(r.region) === 'table', `gate=${r.safety.gate}, region=${r.startLine}~${r.endLine}`);
  check('표 전체를 region으로 잡음', r.region.includes('<thead>') && r.region.includes('</table>'));
}
{
  // 표가 둘이면 모호 → 라우팅 안 함(안전). 토큰이 표 밖에만 걸려 full 폴백.
  const MULTI = [
    'export default function P(): React.ReactNode {',
    '  return (<div>',
    '    <table><tbody><tr><td>a</td></tr></tbody></table>',
    '    <table><tbody><tr><td>b</td></tr></tbody></table>',
    '  </div>);',
    '}',
  ].join('\n');
  const r = locateEditRegion(MULTI, '테이블에 컬럼 추가');
  check('표 2개 → 모호로 라우팅 안 함(폴백)', !r.safety.ok, `gate=${r.safety.gate}`);
}

// ─── 앵커 품질 스코어링(B) — 컴포넌트 이름 없이 화면 한글로 임의 요소 가리키기 ──────────
console.log('\n앵커 품질 스코어링(B):');
{
  // 단일 콘텐츠어("투입률")가 td 텍스트에 유일 → 1토큰이어도 콘텐츠 앵커로 ok(Select/table 아님).
  const B_SRC = [
    'export default function P(): React.ReactNode {',
    '  return (',
    '    <div className="card">',
    '      <section>',
    '        <span className="label">{value}</span>',
    '        <em className="cell">투입률</em>',
    '      </section>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const r = locateEditRegion(B_SRC, '투입률 표기를 강조해줘');
  check('단일 콘텐츠어 → 앵커 품질로 ok', r.safety.ok, `gate=${r.safety.gate}, region=${r.startLine}~${r.endLine}`);
}
{
  // 콘텐츠어가 서로 다른 부모 요소로 흩어지면 모호 → full(안전).
  const SCATTER = [
    'export default function P(): React.ReactNode {',
    '  return (',
    '    <div>',
    '      <section>',
    '        <span>금액</span>',
    '      </section>',
    '      <footer>',
    '        <span>금액</span>',
    '      </footer>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const r = locateEditRegion(SCATTER, '금액 표시를 바꿔줘');
  check('콘텐츠어 흩어짐 → 모호로 폴백', !r.safety.ok, `gate=${r.safety.gate}`);
}
{
  // 주석 속 단어는 앵커 아님(우연일치 배제) → 폴백.
  const COMMENT = [
    'export default function P(): React.ReactNode {',
    '  // 보너스 계산 로직 메모',
    '  return (<div><span>{name}</span></div>);',
    '}',
  ].join('\n');
  const r = locateEditRegion(COMMENT, '보너스 항목을 손봐줘');
  check('주석 속 단어는 콘텐츠 앵커 아님 → 폴백', !r.safety.ok, `gate=${r.safety.gate}`);
}

// ─── 섹션-주석 랜드마킹(E) — 사람이 단 {/* 섹션 */} 주석을 랜드마크로 ──────────────────
console.log('\n섹션-주석 랜드마킹(E):');
{
  const E_SRC = [
    'export default function P(): React.ReactNode {',
    '  return (',
    '    <div>',
    '      {/* 직원 요약 카드 */}',
    '      <div className="bg-card">',
    '        <span>{name}</span>',
    '      </div>',
    '      {/* 필터바 */}',
    '      <div className="toolbar">',
    '        <span>{x}</span>',
    '      </div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  // "요약 카드" 주석 → 그 주석이 가리키는 다음 요소(bg-card div)로 스냅.
  const r = locateEditRegion(E_SRC, '요약 카드에 연락처를 추가해줘');
  check('JSX 섹션 주석 → 다음 요소로 스냅', r.safety.ok && r.region.includes('bg-card'), `gate=${r.safety.gate}, region=${r.startLine}~${r.endLine}`);
  // 앵커 줄을 요소로 보고하므로 게이트가 주석으로 오인하지 않음.
  check('게이트가 ok (주석 오인 없음)', r.safety.gate === 'ok', `gate=${r.safety.gate}`);
}
{
  // 로직 // 주석(다음이 비-JSX)은 랜드마크 안 됨 → 폴백(섹션 라벨만 인정).
  const LOGIC = [
    'export default function P(): React.ReactNode {',
    '  // 보너스 계산 로직',
    '  const x = calc();',
    '  return (<div><span>{x}</span></div>);',
    '}',
  ].join('\n');
  const r = locateEditRegion(LOGIC, '보너스 계산을 손봐줘');
  check('로직 // 주석(다음 비-JSX) → 폴백', !r.safety.ok, `gate=${r.safety.gate}`);
}

// ─── 기존 top-level const 결정론 교체(무손실 가드) — 영역 밖 선언 수정 갭 ────────────────
console.log('\n기존 const 결정론 교체:');
{
  const BASE = [
    "import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';",
    '',
    "const grades = ['사원', '대리', '과장'];",
    '',
    'export default function P(): React.ReactNode {',
    "  const [grade, setGrade] = useState('');",
    '  return (',
    '    <Select value={grade} onValueChange={setGrade}>',
    '      <SelectTrigger><SelectValue /></SelectTrigger>',
    '      <SelectContent>',
    '        {grades.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}',
    '      </SelectContent>',
    '    </Select>',
    '  );',
    '}',
  ].join('\n');

  // (a) 무손실 superset 재선언 → 교체 적용(기존 항목 보존 + 수석 추가)
  {
    const { text, changes } = applyStructuralEdit(BASE, { hookCode: "const grades = ['사원', '대리', '과장', '수석'];" });
    check('superset 재선언 → 교체 적용(수석 추가·사원 보존)', text.includes("'수석'") && text.includes("'사원'"), changes.join(' | '));
    check('교체는 1곳만(중복 선언 없음)', (text.match(/const grades =/g) ?? []).length === 1, `count=${(text.match(/const grades =/g) ?? []).length}`);
    check('교체 변경 기록', changes.some((c) => c.includes('교체') && c.includes('grades')));
  }

  // (b) 손실(기존 '사원' 누락) 재선언 → 교체 거부 → 원본 const 보존(손실 적용 차단)
  {
    const { text, changes } = applyStructuralEdit(BASE, { hookCode: "const grades = ['수석', '대리', '과장'];" });
    check('손실 재선언 → 교체 거부(원본 보존)', text.includes("'사원'") && !text.includes("'수석'"), changes.join(' | '));
    check('거부 사유 기록', changes.some((c) => c.includes('거부')));
  }

  // (c) primitive const 값 변경 → 교체 허용(PAGE_LIMIT 20→50)
  {
    const P = [
      'const PAGE_LIMIT = 20;',
      '',
      'export default function P(): React.ReactNode {',
      '  return (<div>{PAGE_LIMIT}</div>);',
      '}',
    ].join('\n');
    const { text } = applyStructuralEdit(P, { hookCode: 'const PAGE_LIMIT = 50;' });
    check('primitive const 값 변경 → 교체', text.includes('PAGE_LIMIT = 50') && !text.includes('PAGE_LIMIT = 20'));
  }

  // (d) 컴포넌트 useState 초기값 변경 → in-place 교체(부서 기본선택 변경 패턴, case-2)
  {
    const C = [
      "import { useState } from 'react';",
      '',
      'export default function P(): React.ReactNode {',
      "  const [department, setDepartment] = useState('');",
      '  return (<div>{department}</div>);',
      '}',
    ].join('\n');
    const { text, changes } = applyStructuralEdit(C, { hookCode: "const [department, setDepartment] = useState('개발팀');" });
    check('useState 초기값 재선언 → in-place 교체', text.includes("useState('개발팀')") && !text.includes("useState('')"), changes.join(' | '));
    check('useState 선언 1곳만(중복 없음)', (text.match(/const \[department/g) ?? []).length === 1);
  }

  // (e) 컴포넌트 헬퍼 함수 재선언은 교체 안 함(formatDate/handleSearch류 헛교체 방지)
  {
    const C = [
      'export default function P(): React.ReactNode {',
      '  const handleSearch = () => doSearch();',
      '  return (<div onClick={handleSearch} />);',
      '}',
    ].join('\n');
    const { text } = applyStructuralEdit(C, { hookCode: 'const handleSearch = () => doOther();' });
    check('헬퍼 함수 재선언 → 교체 안 함(원본 유지)', text.includes('doSearch()') && !text.includes('doOther()'));
  }
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
