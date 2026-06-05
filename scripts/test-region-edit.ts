/**
 * src/ai/RegionEdit.ts 단위 테스트 — 견고성 매핑에서 검증한 불변식을 회귀로 고정한다.
 *  - Fix 1: snap이 서브파트(SelectTrigger) 조각이 아니라 완결 컨트롤(<Select>)을 잡는다.
 *  - 안전 게이트 4종: anchor-missing / anchor-comment / anchor-import / snap-failed + ok.
 *  - Fix 2: checkRegionRootTag가 영역-밖 재작성(루트 태그 변화)을 거부한다.
 */
import { locateEditRegion, checkRegionRootTag, firstJsxTag } from '../src/ai/RegionEdit';
import { runHybridRegionEdit, buildHybridPrompt } from '../src/ai/RegionEditService';
import { selectScaffoldContracts, buildContractSection } from '../src/ai/ScaffoldContracts';
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
      // timer를 region에서 실제 사용(ref) → 미사용 삽입 아님 + region 변경됨(dead-binding 게이트 비대상)
      '<region>\n      <Select value={status} onValueChange={(v) => { timer.current = Date.now(); setStatus(v); }}>\n        <SelectTrigger/>\n      </Select>\n</region>',
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

  // 죽은 삽입 바인딩 게이트(6.7): region이 표현 못 하는 편집(rename/조회용 미사용 state)에서 모델이 원본
  //   영역은 그대로 둔 채 안 쓰는 새 state만 얹어 applied로 위장한 silent 오편집을 full 폴백으로.
  {
    // region을 원본 그대로 반환(미변경) + 안 쓰는 새 state 삽입 → dead-binding 폴백
    const loc = locateEditRegion(SRC, '재직상태 select를 api로');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로',
      async () => `<region>\n${loc.region}\n</region>\n<hook>const [selectedDept, setSelectedDept] = useState('');</hook>`);
    check('미사용 삽입 state + region 미변경 → dead-binding 폴백', o.status === 'fallback' && o.reason === 'dead-binding', `status=${o.status}, reason=${o.reason}`);
  }
  {
    // 대조군 + 죽은 곁다리 strip: region을 실제로 바꾸면(편집 성공) 곁다리 미사용 state는 폴백 대신 strip → applied
    const loc = locateEditRegion(SRC, '재직상태 select를 api로');
    const changedRegion = loc.region.replace('placeholder="재직상태"', 'placeholder="상태 선택"');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로',
      async () => `<region>\n${changedRegion}\n</region>\n<hook>const [selectedDept, setSelectedDept] = useState('');</hook>`);
    check('region 변경됨 → 곁다리 미사용 state 있어도 applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('죽은 곁다리 strip — 출력에 미사용 selectedDept 없음', !!o.finalText && !o.finalText.includes('selectedDept'), `has=${o.finalText?.includes('selectedDept')}`);
    check('region 실제 편집은 보존(상태 선택)', !!o.finalText && o.finalText.includes('상태 선택'));
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

  // refetch 인자 게이트(4.5): 모델이 "파라미터 추가"를 refetch({ params })로 잘못 구현 → refetch-params 폴백.
  //   올바른 수정(useApi params를 <replace>로 수정 + refetch() 인자 없음)은 applied.
  {
    const RSRC = [
      "import { useState } from 'react';",
      "import { useApi } from '@axiom/hooks';",
      "import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';",
      '',
      'type TResp = { total: number };',
      '',
      'export default function Page(): React.ReactNode {',
      "  const [dept, setDept] = useState('all');",
      "  const { data, refetch } = useApi<TResp>('/api/employees', { params: { page: 1 } });",
      '  return (',
      '    <div className="toolbar">',
      '      <Select value={dept} onValueChange={(v) => { setDept(v); refetch(); }}>',
      '        <SelectTrigger><SelectValue placeholder="부서" /></SelectTrigger>',
      '        <SelectContent>',
      '          <SelectItem value="all">전체</SelectItem>',
      '        </SelectContent>',
      '      </Select>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const Q = '부서 select 변경 시 refetch 파라미터 추가';
    const loc = locateEditRegion(RSRC, Q);
    check('refetch 시나리오: 영역에 refetch() 포함', loc.safety.ok && loc.region.includes('refetch()'), `gate=${loc.safety.gate}`);

    // 잘못된 출력: refetch({ params }) → 폴백 (영역 루트 태그 보존하려 실제 region에서 파생)
    {
      const badRegion = loc.region.replace('refetch();', 'refetch({ params: { page: 1, department: v } });');
      const o = await runHybridRegionEdit(RSRC, Q, async () => `<region>\n${badRegion}\n</region>`);
      check('refetch({ params }) 잘못된 사용 → refetch-params 폴백', o.status === 'fallback' && o.reason === 'refetch-params', `status=${o.status}, reason=${o.reason}`);
    }

    // 올바른 출력: useApi params를 <replace>로 수정 + refetch() 그대로 → applied
    {
      const model =
        `<region>\n${loc.region}\n</region>\n` +
        `<replace anchor="useApi<TResp>('/api/employees'">const { data, refetch } = useApi<TResp>('/api/employees', { params: { page: 1, department: dept === 'all' ? undefined : dept } });</replace>`;
      const o = await runHybridRegionEdit(RSRC, Q, async () => model);
      check('useApi params <replace> + refetch() → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
      check('최종: useApi params에 department 반영', !!o.finalText && o.finalText.includes('department: dept'), `text=${(o.finalText ?? '').split('\n').find((l) => l.includes('useApi'))}`);
    }
  }
})();

// ─── buildHybridPrompt — refetch·파라미터 요청도 서버 params 규칙 노출(트리거 확장) ──────────
console.log('\nbuildHybridPrompt — 서버 params 규칙 트리거:');
{
  const deps = "const { data, refetch } = useApi<TResp>('/api/employees', { params: { page: 1 } });";
  const p = buildHybridPrompt(deps, '<Select/>', 1, 5, undefined, undefined, '부서 select 변경 시 refetch 파라미터가 빠졌다', '');
  check('refetch/파라미터 요청 → 서버 params 규칙 노출', p.includes('필터·검색·파라미터 구현 규칙'));
  check('refetch 인자 금지 지침 포함(useApi 계약 카드)', p.includes('인자를 받지 않습니다'));

  // params 없는 useApi엔 노출 안 함(노이즈 방지)
  const depsNoParams = "const { data } = useApi<TResp>('/api/employees');";
  const p2 = buildHybridPrompt(depsNoParams, '<Select/>', 1, 5, undefined, undefined, '부서 refetch 파라미터', '');
  check('params 없는 useApi → 규칙 비노출', !p2.includes('필터·검색·파라미터 구현 규칙'));

  // 무관한 요청(필터/refetch 키워드 없음) → 비노출
  const p3 = buildHybridPrompt(deps, '<Select/>', 1, 5, undefined, undefined, '버튼 색을 바꿔줘', '');
  check('무관 요청 → 규칙 비노출', !p3.includes('필터·검색·파라미터 구현 규칙'));
}

// ─── ScaffoldContracts — 트리거 기반 scaffold 계약 자동 주입(일반화 메커니즘) ──────────────
console.log('\nScaffoldContracts — 계약 카드 트리거 주입:');
{
  const ids = (ctx: { deps: string; region: string; query: string }): string[] =>
    selectScaffoldContracts(ctx).map((c) => c.id);

  // useApi 카드: deps에 useApi 있으면 발동 + refetch 계약 본문 포함
  {
    const ctx = { deps: "const { data } = useApi<TResp>('/api/x', { params: {} });", region: '<div/>', query: '버튼 추가' };
    check('useApi: deps에 useApi → 카드 발동', ids(ctx).includes('use-api'));
    check('useApi 카드: refetch 무인자 계약 포함', buildContractSection(ctx).includes('인자를 받지 않습니다'));
  }
  // useApi 카드: region에 refetch만 있어도 발동(deps에 없어도)
  check('useApi: region refetch → 카드 발동', ids({ deps: '', region: 'onClick={() => refetch()}', query: '수정' }).includes('use-api'));
  // useApi 카드: 쿼리만 데이터 조회 의도여도 발동
  check('useApi: 쿼리 "목록 조회" → 카드 발동', ids({ deps: '', region: '<div/>', query: '직원 목록을 조회해서 보여줘' }).includes('use-api'));

  // 라우터 카드: 이동 의도 쿼리 → 발동 / 무관 쿼리 → 비발동
  check('router: "페이지 이동" 쿼리 → 카드 발동', ids({ deps: '', region: '<div/>', query: '상세 페이지로 이동하는 버튼' }).includes('router'));
  check('router: 무관 쿼리 → 비발동', !ids({ deps: '', region: '<div/>', query: '글자색 변경' }).includes('router'));

  // 타입 네이밍 카드: 선언 형태/타입 언급 → 발동, JSX type="text" 속성엔 오발동 안 함
  check('type: region에 type 선언 → 카드 발동', ids({ deps: '', region: 'type TFoo = { a: number };', query: '수정' }).includes('type-naming'));
  check('type: JSX type="text" 속성엔 오발동 안 함', !ids({ deps: '', region: '<input type="text" />', query: '입력칸 추가' }).includes('type-naming'));
  check('type: "응답 타입" 쿼리 → 카드 발동', ids({ deps: '', region: '<div/>', query: 'API 응답 타입을 정의해줘' }).includes('type-naming'));

  // 아무 카드도 발동 안 하면 섹션 자체가 빈 문자열
  check('무관 컨텍스트 → 계약 섹션 없음', buildContractSection({ deps: '', region: '<div/>', query: '글자색 변경' }) === '');

  // 발동 카드는 레지스트리 순서대로(결정론)
  {
    const ctx = { deps: "useApi<T>('/x')", region: '<div/>', query: '상세로 이동하는 타입 정의' };
    const order = ids(ctx);
    check('발동 카드는 레지스트리 순서(use-api→router→type)', JSON.stringify(order) === JSON.stringify(['use-api', 'router', 'type-naming']), `order=${order.join(',')}`);
  }

  // buildHybridPrompt가 계약 섹션을 실제로 주입하는가(통합)
  {
    const p = buildHybridPrompt("const { data } = useApi<T>('/x');", '<Select/>', 1, 5, undefined, undefined, '부서 select 수정', '');
    check('buildHybridPrompt: useApi 계약 섹션 주입됨', p.includes('react-app-scaffold 계약') && p.includes('인자를 받지 않습니다'));
  }
}

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

  // (d2) 삭제 의도 가드: 새 배열이 기존의 부분집합(항목 제거)일 때, removalIntent면 교체 / 아니면 무손실 거부.
  //   (query→removalIntent 배선은 e2e del-grade-option replay에서 실모델 출력으로 확인.)
  {
    const DEL = [
      "const grades = ['사원', '대리', '과장', '이사'];",
      '',
      'export default function P(): React.ReactNode {',
      '  return (<div>{grades.join(",")}</div>);',
      '}',
    ].join('\n');
    // 삭제 의도 + subset(이사 제거) → 교체
    {
      const { text } = applyStructuralEdit(DEL, { hookCode: "const grades = ['사원', '대리', '과장'];" }, { removalIntent: true });
      check('삭제 의도 + subset → 교체(이사 제거)', text.includes("'과장'") && !text.includes("'이사'"));
    }
    // 삭제 의도 + 없던 항목(환각) → 거부(원본 유지)
    {
      const { text } = applyStructuralEdit(DEL, { hookCode: "const grades = ['사원', '대리', '부장'];" }, { removalIntent: true });
      check('삭제 의도 + 환각(부장) → 거부(원본 유지)', text.includes("'이사'") && !text.includes("'부장'"));
    }
    // 삭제 의도 아님 + subset(손실) → 거부(무손실 가드 유지)
    {
      const { text } = applyStructuralEdit(DEL, { hookCode: "const grades = ['사원', '대리', '과장'];" }, { removalIntent: false });
      check('비-삭제 + subset(손실) → 거부(무손실 유지)', text.includes("'이사'"));
    }
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

  // (f) useApi 페치 선언 재선언은 in-place 교체 안 함 — 엔드포인트 환각 차단(<replace> 채널 전용).
  //     (실측: 부서 필터 요청에 모델이 의존성 헤더의 deptResponse를 베껴 DEPARTMENTS_ENDPOINT→'/api/departments'로 바꿔치움.)
  {
    const C = [
      "import { useApi } from '@axiom/hooks';",
      'const DEPARTMENTS_ENDPOINT = "/api/v1/departments";',
      '',
      'export default function P(): React.ReactNode {',
      '  const { data: deptResponse } = useApi<TDeptRes>(DEPARTMENTS_ENDPOINT);',
      '  return (<div>{deptResponse?.data?.length}</div>);',
      '}',
    ].join('\n');
    const { text } = applyStructuralEdit(C, {
      hookCode: "const { data: deptResponse } = useApi<TDeptRes>('/api/departments');",
    });
    check(
      'useApi 페치 재선언 → 교체 안 함(엔드포인트 환각 차단)',
      text.includes('useApi<TDeptRes>(DEPARTMENTS_ENDPOINT)') && !text.includes("useApi<TDeptRes>('/api/departments')"),
    );
    check('useApi 선언 1곳만(중복 추가 없음)', (text.match(/useApi<TDeptRes>/g) ?? []).length === 1);
  }

  // (g) strip 게이트가 인플레이스 교체 내용이 참조하는 새 바인딩을 죽은 선언으로 오인하지 않는다.
  //     (실측 버그: 모델이 deptResponse→departmentResponse rename. `departments` 는 in-place 교체로
  //      새 RHS(departmentResponse?.data)를 갖지만 그 교체 내용이 strip universe에서 빠져, 새로 삽입된
  //      departmentResponse useApi 가 미사용으로 strip → departments 가 미정의 식별자를 가리키는 댕글링.)
  {
    const C = [
      "import { useApi } from '@axiom/hooks';",
      "const DEPT_ENDPOINT = '/api/departments';",
      '',
      'export default function P(): React.ReactNode {',
      '  const { data: deptResponse } = useApi<TDeptRes>(DEPT_ENDPOINT);',
      '  const departments = deptResponse?.data ?? [];',
      '  return (<div>{departments.length}</div>);',
      '}',
    ].join('\n');
    const { text, changes } = applyStructuralEdit(
      C,
      {
        hookCode: [
          'const { data: departmentResponse } = useApi<TDeptRes>(DEPT_ENDPOINT);',
          'const departments = departmentResponse?.data ?? [];',
        ].join('\n'),
      },
      { stripDeadInserts: true },
    );
    check('인플레이스 교체가 참조하는 새 바인딩은 strip 안 함', text.includes('departmentResponse'), changes.join(' | '));
    check('departments 가 새 바인딩을 가리킴(댕글링 아님)', /const departments = departmentResponse\?\.data/.test(text), changes.join(' | '));
  }
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
