/**
 * src/ai/RegionEdit.ts 단위 테스트 — 견고성 매핑에서 검증한 불변식을 회귀로 고정한다.
 *  - Fix 1: snap이 서브파트(SelectTrigger) 조각이 아니라 완결 컨트롤(<Select>)을 잡는다.
 *  - 안전 게이트 4종: anchor-missing / anchor-comment / anchor-import / snap-failed + ok.
 *  - Fix 2: checkRegionRootTag가 영역-밖 재작성(루트 태그 변화)을 거부한다.
 */
import { locateEditRegion, checkRegionRootTag, firstJsxTag } from '../src/ai/locate/RegionEdit';
import { runHybridRegionEdit, buildHybridPrompt, buildDisambiguationPrompt, parseDisambiguationPick, buildImportProvenance, reconcileImportsWithReference, REGION_GROUNDABLE_REASONS, classifyRegionDecline } from '../src/ai/RegionEditService';
import type { ImportRequest } from '../src/ai/StructuralAnchor';
import { selectScaffoldContracts, buildContractSection, componentReplacementTargets, contractsRequirePatchMode } from '../src/ai/contracts/ScaffoldContracts';
import { detectComponentsInRegion, buildComponentPropsSectionForRegion, detectComponentsInText, buildComponentOptionsReference } from '../src/ai/contracts/ComponentPropsIndex';
import { findUnresolvedReferences, resolveKnownImports, applyStructuralEdit, applyReplaceBlocks } from '../src/ai/StructuralAnchor';
import { crossFileSuppressionReason } from '../src/ai/intent/CrossFileTargeting';

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

// T6: handler-body — 이벤트 동작 변경 대상이 region 밖 명명 함수(onClick={handleX}) → full 폴백
//     (region=JSX 요소만으론 handler 본문 못 고침 → 바인딩 인라인 교체 파손 방지. 실측 버그: "클릭 시 alert")
{
  const HSRC = [
    "import { Button } from '@axiom/components/ui';",
    '',
    'export default function Page(): React.ReactNode {',
    '  const handleRegisterClick = () => {',
    "    console.log('신규 등록 버튼 클릭');",
    '  };',
    '  return (',
    '    <div className="p-6">',
    '      <Button onClick={handleRegisterClick}>신규 등록</Button>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const r = locateEditRegion(HSRC, "신규등록 버튼을 클릭 시 alert을 띄워줘 메시지는 'alert 테스트!'");
  check('handler-body: 클릭 동작 변경 대상이 밖 명명함수 → full', !r.safety.ok && r.safety.gate === 'handler-body', `gate=${r.safety.gate}`);
  // 동작이 아닌 텍스트 변경은 오발 안 함(region이 처리) — 같은 소스, 다른 의도
  const r2 = locateEditRegion(HSRC, '신규 등록 버튼 텍스트를 "직원 추가"로 바꿔줘');
  check('handler-body 오발 없음: 버튼 텍스트 변경은 region 유지(ok)', r2.safety.gate !== 'handler-body', `gate=${r2.safety.gate}`);
}

// T7: 컨트롤 요소 앵커 — 소문자 intrinsic <button> + "alert 버튼" 의도. 'alert'가 handleAlert·문자열에
//     매칭돼 실제 버튼 대신 그리로 스냅→snap-failed→"Button 없음" 오안내로 끝나던 실측 버그.
//     ②.85 컨트롤 앵커(유일 컨트롤 스냅) + countTag 대소문자 무시로 해소.
{
  const BSRC = [
    "import type React from 'react';",
    '',
    'export default function EmployeeListPage(): React.ReactNode {',
    '  const handleAlert = async () => {',
    "    await $ui.alert('버튼이 클릭되었습니다!', { type: 'info' });",
    '  };',
    '  return (',
    '    <div className="p-6 space-y-4">',
    '      <h1 className="text-2xl font-bold">Employee List</h1>',
    '      <p className="text-muted-foreground">이 페이지의 내용을 작성하세요.</p>',
    '      <button',
    '        className="btn btn-primary"',
    '        onClick={handleAlert}',
    '      >',
    '        클릭',
    '      </button>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const r = locateEditRegion(BSRC, 'alert 버튼의 className을 빼줘');
  const regionText = r.region ?? '';
  check(
    'control-anchor: 소문자 <button> 유일 → 버튼 요소로 스냅(ok, snap-failed 아님)',
    r.safety.ok && /<button\b/.test(regionText) && !/\$ui\.alert/.test(regionText),
    `gate=${r.safety.gate}, region=${JSON.stringify(regionText.slice(0, 40))}`,
  );
  // classifyRegionDecline: 소문자 <button>이 존재하면 "대상 없음(inform-absent)"으로 오분류하지 않는다.
  check(
    'classifyRegionDecline: 소문자 <button> 있으면 inform-absent 아님(대소문자 무시)',
    classifyRegionDecline('alert 버튼의 className을 빼줘', BSRC, 'snap-failed') !== 'inform-absent',
    `ux=${classifyRegionDecline('alert 버튼의 className을 빼줘', BSRC, 'snap-failed')}`,
  );
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
      '<region>\n      <Select value={status} onValueChange={(v) => { timer.current = Date.now(); setStatus(v); }}>\n        <SelectTrigger><SelectValue/></SelectTrigger>\n        <SelectContent><SelectItem value="all">전체</SelectItem></SelectContent>\n      </Select>\n</region>',
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
    check('root-tag-mismatch → locatedRegion 첨부(grounded 재시도 대상)', !!o.locatedRegion && o.locatedRegion.startLine === 20 && REGION_GROUNDABLE_REASONS.has(o.reason ?? ''), `locatedRegion=${JSON.stringify(o.locatedRegion)}`);
  }

  // 내용손실(4.7): 큰 영역(Select+옵션들, 6태그)을 받아 루트만 내고 내부를 통째 누락 → region-content-loss 폴백.
  //   (실측: "버튼 텍스트 바꿔줘"에 필터바 포함 영역을 받아 버튼만 내고 Select들을 삭제. tsc는 통과시킴.)
  {
    const model = '<region>\n      <Select value={status} onValueChange={setStatus}>\n      </Select>\n</region>';
    const o = await runHybridRegionEdit(SRC, '재직상태 텍스트 바꿔줘', async () => model);
    check('내용 대량 누락 → region-content-loss 폴백', o.status === 'fallback' && o.reason === 'region-content-loss', `status=${o.status}, reason=${o.reason}`);
    // 경로 수렴(§6 ④): content-loss fallback은 실제 영역(20~28줄)을 ground truth로 첨부해 호출부가 full 대신
    //   grounded patch 재시도를 하게 한다. 텍스트는 디스크 그대로(<search> 글자단위 매칭용).
    check(
      'region-content-loss → locatedRegion 첨부(20~28줄, 디스크 텍스트 그대로)',
      !!o.locatedRegion && o.locatedRegion.startLine === 20 && o.locatedRegion.endLine === 28 &&
        o.locatedRegion.text === SRC.split('\n').slice(19, 28).join('\n') &&
        REGION_GROUNDABLE_REASONS.has(o.reason ?? ''),
      `locatedRegion=${JSON.stringify(o.locatedRegion)}`,
    );
  }
  // 대조군: 삭제 의도면 누락이 정당 → content-loss로 막지 않음(다른 경로로 진행).
  {
    const model = '<region>\n      <Select value={status} onValueChange={setStatus}>\n      </Select>\n</region>';
    const o = await runHybridRegionEdit(SRC, '재직상태 옵션 삭제해줘', async () => model);
    check('삭제 의도 → region-content-loss 비발동', o.reason !== 'region-content-loss', `reason=${o.reason}`);
  }

  // 의존성 미해소: 훅이 선언/ import 없는 타입을 참조 → fallback (조용한 컴파일 깨짐 차단)
  {
    const model = [
      '<region>\n      <Select value={status} onValueChange={setStatus}>\n        <SelectTrigger><SelectValue/></SelectTrigger>\n        <SelectContent><SelectItem value="all">전체</SelectItem></SelectContent>\n      </Select>\n</region>',
      "<hook>const { data } = useApi<TUnknownResp>('/x');</hook>",
    ].join('\n');
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => model);
    check('의존성 미해소(TUnknownResp): fallback', o.status === 'fallback' && o.reason === 'unresolved-deps', `status=${o.status}, reason=${o.reason}`);
    // 비-groundable: 의존성 미해소는 영역 밖 새 선언이 필요해 patch로 못 푼다 → grounded 재시도 대상 아님.
    check('unresolved-deps → grounded 재시도 비대상(REGION_GROUNDABLE_REASONS 제외)', !REGION_GROUNDABLE_REASONS.has(o.reason ?? ''), `reason=${o.reason}`);
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

    // 중첩 제어 태그: 모델이 <replace>를 <hook> 안에 끼워 출력 → replace는 적용되지만 <replace> 텍스트가
    //   본문에 리터럴로 박히는 버그(실측). 훅 조각에서 제어 태그를 strip해 깨진 삽입을 막는다.
    {
      const changedRegion = loc.region.replace('placeholder="부서"', 'placeholder="부서 선택"');
      const model =
        `<region>\n${changedRegion}\n</region>\n` +
        `<hook>// 기존 useApi 호출문 수정\n` +
        `<replace anchor="useApi<TResp>('/api/employees'">const { data, refetch } = useApi<TResp>('/api/employees', { params: { page: 1, department: dept } });</replace></hook>`;
      const o = await runHybridRegionEdit(RSRC, Q, async () => model);
      check('중첩 <replace>: applied (replace는 적용)', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
      check('중첩 <replace>: 본문에 <replace 리터럴 없음', !!o.finalText && !o.finalText.includes('<replace'), `leak=${(o.finalText ?? '').split('\n').filter((l) => l.includes('<replace')).join(' | ')}`);
      check('중첩 <replace>: useApi params에 department 적용', !!o.finalText && o.finalText.includes('department: dept'));
      check('중첩 <replace>: region 편집(부서 선택)도 보존', !!o.finalText && o.finalText.includes('부서 선택'));
    }
  }
})();

// ─── cross-file 재타겟 억제 — 위치 랜드마크/use-as는 현재 파일 유지 ───────────────────────────
console.log('\ncross-file 억제(crossFileSuppressionReason):');
{
  // 실측 버그: "PageHeader 위에 버튼 만들고…" → PageHeader.tsx 통째 재작성으로 샘. 위치 랜드마크라 억제돼야.
  check('"PageHeader 위에 버튼 만들고" → landmark 억제', crossFileSuppressionReason('현재파일에서 사용한 PageHeader 위에 버튼을 만들고 버튼을 누르면 로그인 api 호출하게 수정해줘', 'PageHeader') === 'landmark');
  check('"X 아래에 …" → landmark 억제', crossFileSuppressionReason('PageHeader 아래에 설명 추가', 'PageHeader') === 'landmark');
  check('"X 옆에 …" → landmark 억제', crossFileSuppressionReason('Toolbar 옆에 버튼', 'Toolbar') === 'landmark');
  // use-as: "X로 적용/사용"
  check('"SmartTable로 적용" → use-as 억제', crossFileSuppressionReason('직원 테이블을 SmartTable로 적용해줘', 'SmartTable') === 'use-as');
  // 편집 대상 표현은 억제 안 함(진짜 cross-file 편집 보존)
  check('"StatusBadge를 수정" → 억제 안 함(null)', crossFileSuppressionReason('StatusBadge를 수정해줘', 'StatusBadge') === null);
  check('"StatusBadge 색 바꿔줘" → 억제 안 함(null)', crossFileSuppressionReason('StatusBadge 색 바꿔줘', 'StatusBadge') === null);
  // "X를 위로 옮겨"(편집)는 landmark('위에' 아님)로 오인하지 않음
  check('"X를 위로 옮겨" → landmark 오인 안 함(null)', crossFileSuppressionReason('PageHeader를 위로 옮겨줘', 'PageHeader') === null);
}

// ─── 검증-교정 루프(Stage 0) — verify 콜백 주입 시에만 작동(미주입=종전 동일) ─────────────────
console.log('\n검증-교정 루프(Stage 0) — verify 콜백:');
await (async () => {
  // 게이트를 통과해 applied 되는 정상 편집(같은 루트 <Select> 재작성 + useApi 훅).
  const mainEdit = [
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

  // 1) 검증 통과(첫 verify ok) → 교정 호출 없음, ✅ 통과 노트. 모델 1회·verify 1회만.
  {
    let modelCalls = 0;
    let verifyCalls = 0;
    const o = await runHybridRegionEdit(
      SRC, '재직상태 select를 api로',
      async () => { modelCalls++; return mainEdit; },
      undefined, undefined, undefined,
      async () => { verifyCalls++; return { ok: true, errors: [] }; },
    );
    check('verify 통과 → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('verify 통과 → 교정 모델 호출 없음(모델 1회)', modelCalls === 1, `modelCalls=${modelCalls}`);
    check('verify 통과 → verify 1회만', verifyCalls === 1, `verifyCalls=${verifyCalls}`);
    check('verify 통과 → ✅ 노트', /✅ 타입검증 통과/.test(o.diagnostics) && !/교정/.test(o.diagnostics), o.diagnostics);
  }

  // 2) 첫 verify 실패 → <replace> 교정 → 재검증 통과(에러 1→0) → 교정안 채택, ✅(교정) 노트.
  {
    let modelCalls = 0;
    let verifyCalls = 0;
    const o = await runHybridRegionEdit(
      SRC, '재직상태 select를 api로',
      async () => {
        modelCalls++;
        if (modelCalls === 1) return mainEdit;
        // 교정 라운드: composed에 실제로 있는 앵커를 인용해 교체(앵커 계약).
        return `<replace anchor="useApi<string[]>('/api/statuses')">useApi<string[]>(STATUSES_ENDPOINT)</replace>`;
      },
      undefined, undefined, undefined,
      async () => {
        verifyCalls++;
        return verifyCalls === 1 ? { ok: false, errors: ['42:10 mock type error'] } : { ok: true, errors: [] };
      },
    );
    check('verify 실패→교정 성공 → applied', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('교정 라운드 모델 호출됨(모델 2회)', modelCalls === 2, `modelCalls=${modelCalls}`);
    check('교정 <replace> 반영(STATUSES_ENDPOINT)', !!o.finalText && o.finalText.includes('STATUSES_ENDPOINT'), `has=${o.finalText?.includes('STATUSES_ENDPOINT')}`);
    check('✅(교정) 노트 + 에러 1→0 기록', /✅ 타입검증 통과\(교정\)/.test(o.diagnostics) && /1→0/.test(o.diagnostics), o.diagnostics);
  }

  // 3) 교정해도 에러 안 줄면(동일) → 교정안 버리고 원안 유지, ⚠️ 잔존 노트 + 그대로 applied.
  {
    let modelCalls = 0;
    const o = await runHybridRegionEdit(
      SRC, '재직상태 select를 api로',
      async () => {
        modelCalls++;
        if (modelCalls === 1) return mainEdit;
        return `<replace anchor="useApi<string[]>('/api/statuses')">useApi<string[]>(STATUSES_ENDPOINT)</replace>`;
      },
      undefined, undefined, undefined,
      async () => ({ ok: false, errors: ['42:10 mock type error'] }), // 항상 동일 에러(교정 무효)
    );
    check('교정 무효 → 여전히 applied(컨펌 카드 위임)', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
    check('교정 무효 → 교정안 버림(STATUSES_ENDPOINT 없음)', !!o.finalText && !o.finalText.includes('STATUSES_ENDPOINT'), `has=${o.finalText?.includes('STATUSES_ENDPOINT')}`);
    check('⚠️ 잔존 노트', /⚠️ 타입에러 1건 잔존/.test(o.diagnostics), o.diagnostics);
  }

  // 4) verify 미주입 → 검증 루프 미작동(노트 없음), 종전과 동일하게 applied.
  {
    const o = await runHybridRegionEdit(SRC, '재직상태 select를 api로', async () => mainEdit);
    check('verify 미주입 → applied + 검증 노트 없음', o.status === 'applied' && !/타입검증|타입에러/.test(o.diagnostics), o.diagnostics);
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

  // 앵커-우선(Stage 1) — anchorFirst=true면 "작은 수정은 <replace>로" 지침 노출, 기본(false)은 비노출.
  const pa = buildHybridPrompt(deps, '<Select/>', 1, 5, undefined, undefined, '버튼 텍스트 바꿔줘', '', true);
  check('anchorFirst=true → <replace> 우선 규칙 노출', pa.includes('작은 수정은 <replace>로') && pa.includes('딱 한 곳'));
  const pb = buildHybridPrompt(deps, '<Select/>', 1, 5, undefined, undefined, '버튼 텍스트 바꿔줘', '');
  check('anchorFirst 기본(off) → 우선 규칙 비노출', !pb.includes('작은 수정은 <replace>로'));
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

  // 목록 테이블 바인딩 카드: "테이블에 api 적용" 의도 → 발동 + 3부품 골격 포함
  {
    const ctx = { deps: '', region: '<table><tbody>{rows.map(r=>(<tr/>))}</tbody></table>', query: "직원 목록 테이블에 '/api/employees' api를 적용해줘" };
    check('list-table: "테이블에 api 적용" → 카드 발동', ids(ctx).includes('list-table-binding'));
    check('list-table 카드: .map 재작성 골격 포함', buildContractSection(ctx).includes('.map()'));
    check('list-table 카드: 응답 타입 선언 슬롯 포함', buildContractSection(ctx).includes('TXxxResponse'));
  }
  // region에 테이블 마크업 + 데이터 의도 → 발동(쿼리에 "테이블" 단어 없어도)
  check('list-table: region 테이블 + 데이터 쿼리 → 발동',
    ids({ deps: '', region: '<Table><tbody/></Table>', query: '여기에 데이터를 불러와줘' }).includes('list-table-binding'));
  // 무관(테이블 없고 목록/적용 의도 아님) → 비발동
  check('list-table: 무관 쿼리 → 비발동',
    !ids({ deps: '', region: '<div/>', query: '글자색 변경' }).includes('list-table-binding'));

  // ── 로컬 데이터 렌더 요청은 API 카드를 발동시키면 안 된다(useApi 환각 방지) ──────────
  // "보여"(렌더 동사)만으로는 발동 안 함 — 순수 로컬 렌더 요청.
  check('list-table: "테이블로 보여줘"(API 동사 없음) → 비발동',
    !ids({ deps: '', region: '<div/>', query: '이 배열을 테이블로 화면에 보여줘' }).includes('list-table-binding'));
  // 요청이 지목한 함수/상수가 파일에 이미 선언돼 있으면(로컬 출처) API 동사가 있어도 양보.
  check('list-table: 로컬 함수(getArr) 지목 → 비발동',
    !ids({
      deps: 'const getArr = () => { return [{ id: 1 }]; };',
      region: '<div/>',
      query: '현재 화면에서 getArr함수 결과를 테이블로 화면에 보여줘',
    }).includes('list-table-binding'));
  check('list-table: 로컬 함수 지목 + "적용"이어도 → 비발동',
    !ids({
      deps: 'const getArr = () => [];',
      region: '<table><tbody/></table>',
      query: 'getArr() 결과를 테이블에 적용해줘',
    }).includes('list-table-binding'));
  // 반례: 파일에 없는 이름 + 실제 API 적용 의도는 종전대로 발동(회귀 방지).
  check('list-table: 로컬에 없는 이름 + api 적용 → 발동 유지',
    ids({ deps: '', region: '<table><tbody/></table>', query: "직원 목록 테이블에 '/api/employees' 적용해줘" }).includes('list-table-binding'));

  // ── 로컬 데이터 렌더: 괄호 없는 자연어 지목("getProd 결과 배열")도 잡아야 한다 ──────────
  // 실측 2026-07-03: "getProd 결과 배열을 화면에 테이블로 그려줘" 가 referencesLocalDataSource의 "X()"/"X함수"
  // 패턴에만 걸려 미발동 → local-data-render 카드 안 뜸 → requiresPatchMode 미적용 → structural 선택 → 표 누락.
  {
    const ctx = {
      deps: 'const getProd = () => [{ id: 1, name: "노트북" }];',
      region: '<div/>',
      query: 'getProd 결과 배열을 화면에 테이블로 그려줘',
    };
    check('local-data-render: "getProd 결과 배열"(괄호 없음) → 카드 발동', ids(ctx).includes('local-data-render'));
    check('local-data-render: 같은 케이스 list-table-binding 양보(비발동)', !ids(ctx).includes('list-table-binding'));
    check('local-data-render: requiresPatchMode → structural 제거', contractsRequirePatchMode(ctx) === true);
    check('local-data-render 카드: 기존 함수 .map() 렌더 지시 포함', buildContractSection(ctx).includes('.map()'));
  }
  // getter형 이름(getXxx)은 "결과/배열" 없이 언급만 해도 로컬 출처로 인식.
  check('local-data-render: getter 이름 단독 언급 → 발동',
    ids({ deps: 'const getProd = () => [];', region: '<div/>', query: 'getProd 를 테이블로 그려줘' }).includes('local-data-render'));
  // 반례: 파일에 없는 getter형 이름은 로컬 출처 아님 → local-data-render 비발동(과발동 방지).
  check('local-data-render: 파일에 없는 이름 → 비발동',
    !ids({ deps: 'const getArr = () => [];', region: '<div/>', query: 'getUsers 결과를 테이블로 그려줘' }).includes('local-data-render'));

  // SmartTable 명시 → smart-table-binding 발동 + SmartTable 골격 포함, list-table는 양보(비발동)
  {
    const ctx = { deps: '', region: '<table><tbody>{rows.map(r=>(<tr/>))}</tbody></table>', query: "'/api/employees' 데이터를 SmartTable로 직원 테이블에 적용해줘" };
    check('smart-table: "SmartTable로 적용" → 카드 발동', ids(ctx).includes('smart-table-binding'));
    check('smart-table: list-table-binding은 양보(비발동)', !ids(ctx).includes('list-table-binding'));
    const sec = buildContractSection(ctx);
    check('smart-table 카드: defineColumns 골격 포함', sec.includes('defineColumns'));
    check('smart-table 카드: <SmartTable 재작성 포함', sec.includes('<SmartTable data={'));
    check('smart-table 카드: 응답 타입 선언 슬롯 포함', sec.includes('TXxxResponse'));
    check('smart-table 카드: data/endpoint 동시 금지 경고 포함', sec.includes('동시에 **주지 마세요**') || sec.includes('동시에 주지 마세요'));
    check('smart-table 카드: 응답 스키마 확인 게이트 포함', sec.includes('응답 스키마 확인 게이트') && sec.includes('되물으세요'));
  }
  // 응답 스키마 게이트는 list-table-binding 카드에도 적용된다(스키마 없으면 추측 대신 되묻기).
  {
    const sec = buildContractSection({ deps: '', region: '<table/>', query: "직원 목록 테이블에 '/api/employees' api를 적용해줘" });
    check('list-table 카드: 응답 스키마 확인 게이트 포함', sec.includes('응답 스키마 확인 게이트') && sec.includes('되물으세요'));
  }
  // "스마트테이블"·"데이터 테이블" 한글 변형도 SmartTable 카드로 발동
  check('smart-table: "스마트테이블" → 발동',
    ids({ deps: '', region: '<Table/>', query: '스마트테이블로 목록 보여줘' }).includes('smart-table-binding'));
  check('smart-table: "데이터 테이블" → 발동(고수준 그리드=SmartTable)',
    ids({ deps: '', region: '<table/>', query: '데이터 테이블로 직원 목록 만들어줘' }).includes('smart-table-binding'));
  check('smart-table: "데이터 테이블" 시 list-table는 양보',
    !ids({ deps: '', region: '<table/>', query: '데이터 테이블로 직원 목록 만들어줘' }).includes('list-table-binding'));

  // 버튼 카드(button-component): 생성 선호 + 교체 레시피(import + JSX 태그교체 둘 다)
  {
    // 생성 의도: "버튼 넣어줘" → 카드 발동 + <Button> 선호 본문
    const gen = { deps: '', region: '<div className="p-6"/>', query: "div 아래 'alert' 버튼을 하나 넣어줘" };
    check('button: "버튼 넣어줘" → 카드 발동', ids(gen).includes('button-component'));
    check('button 카드: <Button> 선호 + import 지시 포함',
      buildContractSection(gen).includes('<Button>') && buildContractSection(gen).includes("import { Button } from '@axiom/components/ui'"));
    // 교체 의도: "Button 컴포넌트로 변경" → 발동 + JSX 태그 교체 강제 본문
    const swap = { deps: '', region: '<button onClick={fn} className="bg-blue-500">Alert 표시</button>', query: 'Alert 표시 버튼을 Button 컴포넌트로 변경해줘' };
    check('button: "Button 컴포넌트로 변경" → 카드 발동', ids(swap).includes('button-component'));
    check('button 카드: JSX 태그 자체 교체 지시 포함', buildContractSection(swap).includes('JSX 태그 자체 교체'));
    check('button 카드: import만 추가 금지 경고 포함', buildContractSection(swap).includes('import만 추가하고'));
    // region에 소문자 raw <button 만 있어도(쿼리에 버튼 언급 없어도) 발동
    check('button: region raw <button> → 발동',
      ids({ deps: '', region: '<button type="button">저장</button>', query: '이 부분 수정' }).includes('button-component'));
    // ⚠ 대문자 <Button (이미 정상)만 있고 버튼 언급 없으면 오발동 안 함(케이스 민감)
    check('button: <Button>(정상) + 무관 쿼리 → 비발동',
      !ids({ deps: '', region: '<Button variant="outline">저장</Button>', query: '글자색 변경' }).includes('button-component'));
  }

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
  // 후보 노출(disambiguation 입력): 우선순위는 모델이 정하므로 locate는 입사일·기술스택을 **둘 다**
  // 후보로 내놓고 각 필드 라벨을 정확히 달아야 한다(모델이 질문어로 고를 수 있게). 흔한 'input'이
  // 기술스택을 count로 이겨 휴리스틱 chosen이 틀려도, 후보 목록엔 입사일이 라벨과 함께 있어야 한다.
  const MULTI = [
    'export default function P(): React.ReactNode {',
    "  const [hireDate, setHireDate] = useState('');",
    "  const [skill, setSkill] = useState('');",
    '  return (',
    '    <div>',
    '      <div className="mb-4">',
    '        <label>입사일 *</label>',
    '        <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />',
    '      </div>',
    '      <div className="mb-4">',
    '        <label>기술 스택</label>',
    '        <Input value={skill} placeholder="기술스택 직접 입력..." />',
    '      </div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const r = locateEditRegion(MULTI, '입사일 입력 input을 Calendar로 바꿔줘');
  const labels = r.candidates.map((c) => c.label);
  check('후보에 입사일 라벨 포함(disambiguation 입력)', labels.includes('입사일'), `labels=${JSON.stringify(labels)}`);
  // forcedRegion 재타겟: 모델이 입사일 후보를 고르면 그 영역으로 정확히 재타겟돼야 한다.
  const cand = r.candidates.find((c) => c.label === '입사일');
  const r2 = cand ? locateEditRegion(MULTI, '입사일 input을 Calendar로', { startLine: cand.startLine, endLine: cand.endLine }) : r;
  check(
    'forcedRegion 재타겟 → 입사일 영역',
    !!cand && r2.safety.ok && /입사일/.test(r2.region) && !/기술스택/.test(r2.region),
    `gate=${r2.safety.gate} region=${JSON.stringify(r2.region.slice(0, 40))}`,
  );
}
{
  // disambiguation 프롬프트/파싱 단위 — 번호만 받고, 0/범위밖은 null(불확실).
  const cands = [
    { startLine: 10, endLine: 14, label: '입사일', score: 1 },
    { startLine: 20, endLine: 24, label: '기술 스택', score: 2 },
  ];
  const prompt = buildDisambiguationPrompt('입사일 input을 Calendar로', cands);
  check('disambiguation 프롬프트에 후보 라벨·번호 포함', /1\)\s*입사일/.test(prompt) && /2\)\s*기술 스택/.test(prompt), prompt.slice(0, 30));
  check('파싱: "1" → 첫 후보', parseDisambiguationPick('1', cands)?.label === '입사일', '');
  check('파싱: "2번이요" → 둘째 후보', parseDisambiguationPick('2번이요', cands)?.label === '기술 스택', '');
  check('파싱: "0"(불확실) → null', parseDisambiguationPick('0', cands) === null, '');
  check('파싱: 범위밖 → null', parseDisambiguationPick('9', cands) === null, '');
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

  // (h) 기존 useApi 페치 params 수정: 모델이 같은 엔드포인트로 멀티라인 재선언(부서 params 추가) → 중복 드롭 대신
  //     in-place 교체로 살린다(실측 버그: 부서 params가 중복 드롭으로 조용히 사라져 "수정 안 됨").
  {
    const C = [
      "import { useApi } from '@axiom/hooks';",
      "const EMPLOYEES_ENDPOINT = '/api/employees';",
      '',
      'export default function P(): React.ReactNode {',
      "  const [selectedDepartment] = useState('all');",
      '  const {',
      '    data: response,',
      '    isPending,',
      '    error,',
      '    refetch,',
      '    isFetching,',
      '  } = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {',
      '    params: {',
      '      page: currentPage,',
      '      limit: PAGE_LIMIT,',
      '    },',
      '  });',
      '  return (<div>{response?.data?.length}</div>);',
      '}',
    ].join('\n');
    // 모델이 같은 useApi를 통째로 재선언(같은 엔드포인트 + department params 추가)
    const reDecl = [
      'const {',
      '  data: response,',
      '  isPending,',
      '  error,',
      '  refetch,',
      '  isFetching,',
      '} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {',
      '  params: {',
      '    page: currentPage,',
      '    limit: PAGE_LIMIT,',
      "    department: selectedDepartment === 'all' ? undefined : selectedDepartment,",
      '  },',
      '});',
    ].join('\n');
    const { text, changes } = applyStructuralEdit(C, { hookCode: reDecl }, { stripDeadInserts: true });
    check('useApi params 수정: department 적용됨(중복 드롭으로 안 사라짐)', text.includes("department: selectedDepartment === 'all'"), changes.join(' | '));
    check('useApi params 수정: in-place 교체(중복 추가 없음 — 1곳)', (text.match(/useApi<TEmployeeListResponse>/g) ?? []).length === 1, changes.join(' | '));
    check('useApi params 수정: 교체 변경 기록', changes.some((c) => c.includes('페치') && c.includes('in-place 교체')));

    // 엔드포인트가 다르면(환각) 교체 안 함 — 종전대로 드롭(원본 엔드포인트 보존).
    const reDeclWrongEp = reDecl.replace('useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT', "useApi<TEmployeeListResponse>('/api/staff'");
    const { text: t2 } = applyStructuralEdit(C, { hookCode: reDeclWrongEp }, { stripDeadInserts: true });
    check('엔드포인트 다른 재선언 → 교체 안 함(원본 엔드포인트 보존)', t2.includes('useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT') && !t2.includes("'/api/staff'"));
  }

  // (h2) 상수 별칭 엔드포인트 + 갈라진 바인딩 → 중복 추가 금지(실측 버그/스크린샷): 기존이 상수
  //      `useApi(EMPLOYEES_ENDPOINT)`로 페치 중인데, 타입/매핑 수정 요청에 약한 모델이 같은 API를
  //      리터럴 `'/api/employees'` + 다른 구조분해(`{data, isPending, error, refetch}`)로 통째 재선언.
  //      엔드포인트 텍스트가 달라(상수↔리터럴) 종전 안전망을 빠져나가 **중복 줄로 삽입**되던 것을,
  //      엔드포인트 정규화(별칭 해소)로 "같은 API 중복 페치"로 인식해 삽입 거부.
  {
    const C = [
      "import { useApi } from '@axiom/hooks';",
      "const EMPLOYEES_ENDPOINT = '/api/employees';",
      '',
      'export default function EmployeeListPage(): React.ReactNode {',
      '  const { data: employeeResponse } = useApi<TEmployeeResponse>(EMPLOYEES_ENDPOINT);',
      '  const employeeItems = employeeResponse?.data ?? [];',
      '  return (<div>{employeeItems.length}</div>);',
      '}',
    ].join('\n');
    // 모델 출력: 같은 엔드포인트(리터럴)지만 바인딩이 갈라짐 → employeeResponse 가 사라지면 다운스트림 깨짐.
    const dupReDecl = "const { data, isPending, error, refetch } = useApi<TEmployeeResponse>('/api/employees');";
    const { text, changes } = applyStructuralEdit(C, { hookCode: dupReDecl }, { stripDeadInserts: true });
    check('별칭 엔드포인트 중복 페치 → useApi 호출 1곳(중복 추가 없음)', (text.match(/useApi<TEmployeeResponse>/g) ?? []).length === 1, changes.join(' | '));
    check('별칭 엔드포인트 중복 페치 → 기존 선언/다운스트림 보존', text.includes('const { data: employeeResponse } = useApi<TEmployeeResponse>(EMPLOYEES_ENDPOINT)') && text.includes('employeeResponse?.data'), changes.join(' | '));
    check('별칭 엔드포인트 중복 페치 → 중복 드롭 변경 기록', changes.some((c) => c.includes('중복 useApi 페치') && c.includes('차단')), changes.join(' | '));

    // 같은 엔드포인트 + 바인딩 상위집합(구조분해 확장: isPending/error/refetch 추가) → in-place 교체로 살림.
    const expand = "const { data: employeeResponse, isPending, error, refetch } = useApi<TEmployeeResponse>('/api/employees');";
    const { text: tExp } = applyStructuralEdit(C, { hookCode: expand }, { stripDeadInserts: true });
    check('별칭 엔드포인트 + 바인딩 상위집합 → in-place 교체(refetch 추가)', (tExp.match(/useApi<TEmployeeResponse>/g) ?? []).length === 1 && tExp.includes('refetch') && tExp.includes('employeeResponse'), tExp);
  }

  // (i) 훅 코드 안에 섞여 온 import → 본문에 안 박히고 파일 상단으로 hoist (실측 버그: Skeleton import가
  //     함수 컴포넌트 중간 라인에 삽입돼 컴파일 에러). 멀티라인 import도 합쳐 처리.
  {
    const C = [
      "import { useState } from 'react';",
      '',
      'export default function P(): React.ReactNode {',
      "  const [v] = useState('');",
      '  return (<div>{v}</div>);',
      '}',
    ].join('\n');
    const { text, changes } = applyStructuralEdit(C, {
      hookCode: [
        "import { Skeleton } from '@axiom/components/ui';",
        'const rows = 10;',
      ].join('\n'),
    });
    const lines = text.split('\n');
    const skeletonLine = lines.findIndex((l) => l.includes('import { Skeleton }'));
    const fnLine = lines.findIndex((l) => l.includes('export default function P'));
    check('훅 속 import → 파일 상단으로 hoist(컴포넌트 선언 위)', skeletonLine >= 0 && skeletonLine < fnLine, changes.join(' | '));
    check('import는 본문에 박히지 않음(함수 뒤에 import 없음)', !lines.slice(fnLine).some((l) => /^\s*import\b/.test(l)));
    check('import 아닌 코드(rows)는 보존됨', text.includes('const rows = 10;'));
    check('hoist 변경 기록', changes.some((c) => c.includes('hoist')));
  }

  // (j) 이미 존재하는 모듈을 훅 코드 import로 또 들고 와도 중복 추가 안 함(merge/skip).
  {
    const C = [
      "import { useState, useEffect } from 'react';",
      '',
      'export default function P(): React.ReactNode {',
      '  return (<div />);',
      '}',
    ].join('\n');
    const { text } = applyStructuralEdit(C, {
      hookCode: "import { useState } from 'react';\nconst x = 1;",
    });
    check('훅 속 중복 import는 추가 안 됨(react 1줄 유지)', (text.match(/from 'react'/g) ?? []).length === 1, text);
  }
}

console.log('\nimport provenance — 경로 + default/named 형태 교정:');
{
  // 참조(내용 출처) 파일: PageHeader는 default, StatusBadge도 default, Button은 named.
  const REF = [
    "import PageHeader from '@/shared/components/ui/PageHeader';",
    "import StatusBadge from '@/shared/components/ui/StatusBadge';",
    "import { Button } from '@/shared/components/ui';",
  ].join('\n');
  const prov = buildImportProvenance([REF]);

  // (a) 맵이 형태까지 캡처한다
  check('provenance: PageHeader=def', prov.get('PageHeader')?.kind === 'def' && prov.get('PageHeader')?.module === '@/shared/components/ui/PageHeader');
  check('provenance: Button=named', prov.get('Button')?.kind === 'named');

  // (b) 모델이 default를 named로 뒤집어 환각 → def로 교정 (실측 버그 케이스)
  const modelImports: ImportRequest[] = [
    { module: '@/shared/components/ui/PageHeader', named: ['PageHeader'] },
    { module: '@/shared/components/ui/StatusBadge', named: ['StatusBadge'] },
    { module: '@/shared/components/ui', named: ['Button'] },
  ];
  const { imports, corrections } = reconcileImportsWithReference(modelImports, prov);
  const ph = imports.find((i) => i.module === '@/shared/components/ui/PageHeader');
  const sb = imports.find((i) => i.module === '@/shared/components/ui/StatusBadge');
  const btn = imports.find((i) => i.module === '@/shared/components/ui');
  check('PageHeader named→default 교정', ph?.def === 'PageHeader' && !ph?.named, JSON.stringify(ph));
  check('StatusBadge named→default 교정', sb?.def === 'StatusBadge' && !sb?.named, JSON.stringify(sb));
  check('Button(named 정답)은 그대로', btn?.named?.includes('Button') === true && !btn?.def, JSON.stringify(btn));
  check('형태 교정이 corrections에 기록', corrections.some((c) => c.includes('default')), JSON.stringify(corrections));

  // (c) 이미 올바른 형태면 교정 없음(no-op)
  const correct: ImportRequest[] = [{ module: '@/shared/components/ui/PageHeader', def: 'PageHeader' }];
  const r2 = reconcileImportsWithReference(correct, prov);
  check('정확한 형태는 no-op', r2.corrections.length === 0);

  // (d) 참조에 없는 심볼은 모델 형태 그대로 둔다
  const unknown: ImportRequest[] = [{ module: 'x', named: ['Unknown'] }];
  const r3 = reconcileImportsWithReference(unknown, prov);
  check('참조에 없는 심볼은 손대지 않음', r3.corrections.length === 0);
}

// ─── applyReplaceBlocks — 앵커 계약: 유일 적용 + 모호성 거부(Stage 1 승격 안전판) ──────────
console.log('\napplyReplaceBlocks — 앵커 모호성 게이트:');
{
  const SRC2 = [
    "  const { data } = useApi<TResp>('/api/employees', { params: { page } });",
    '  const rows = data?.list ?? [];',
    '  const title = "직원";',
  ].join('\n');

  // 유일 앵커 → 정확히 그 문장만 교체(기존 params 경로 회귀 가드).
  const u = applyReplaceBlocks(SRC2, [{ anchor: "useApi<TResp>('/api/employees'", replacement: "  const { data } = useApi<TResp>('/api/employees', { params: { page, dept } });" }]);
  check('유일 앵커 → 적용(unresolved 없음)', u.unresolved.length === 0, `unresolved=${u.unresolved.join('|')}`);
  check('유일 앵커 → params에 dept 반영', u.text.includes('page, dept'));
  check('유일 앵커 → 다른 줄 보존', u.text.includes('const rows = data?.list'));

  // 모호 앵커 — 같은 문자열이 서로 다른 두 문장에 등장 → 첫 곳 말없이 교체 금지, unresolved(모호).
  const AMB = [
    '  const a = compute(value);',
    '  const b = other(value);',
    '  const c = value;',
  ].join('\n');
  const m = applyReplaceBlocks(AMB, [{ anchor: 'value', replacement: '  const X = 1;' }]);
  check('모호 앵커 → 적용 거부(원본 불변)', m.text === AMB, 'text changed');
  check('모호 앵커 → unresolved에 "모호" 표기', m.unresolved.length === 1 && /모호/.test(m.unresolved[0]), `unresolved=${m.unresolved.join('|')}`);

  // 같은 앵커라도 **한 문장**(멀티라인)에만 걸리면 모호 아님 — 정상 교체.
  const MULTI = [
    '  const {',
    '    data,',
    "  } = useApi<TResp>('/api/x', { params: { page } });",
    '  const rows = [];',
  ].join('\n');
  const ml = applyReplaceBlocks(MULTI, [{ anchor: 'params', replacement: "  const { data } = useApi<TResp>('/api/x', { params: { page, q } });" }]);
  check('멀티라인 단일 문장 앵커 → 모호 아님(적용)', ml.unresolved.length === 0 && ml.text.includes('page, q'), `unresolved=${ml.unresolved.join('|')}`);
}

// ─── applyReplaceBlocks — guard(내용손실) 게이트: 파괴적 replace 거부(필터바 삭제 방지) ──────
console.log('\napplyReplaceBlocks — guard 내용손실 게이트:');
{
  // 앵커가 작은 수정을 넘어 버튼+필터바 전체(여는태그 다수)를 한 문장으로 잡고, 새 내용이 버튼만 남겨
  // 필터바 Select들을 통째 누락하는 실측 시나리오. guard가 JSX 여는태그 급감을 보고 거부해야 한다.
  const BIG = [
    '  return (',
    '    <div className="filters">',
    '      <Button>직원 등록</Button>',
    '      <Select><SelectItem>전체</SelectItem></Select>',
    '      <Select><SelectItem>개발팀</SelectItem></Select>',
    '      <Input placeholder="검색" />',
    '    </div>',
    '  );',
  ].join('\n');
  const tagCount = (s: string): number => (s.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
  const guard = (oldText: string, newText: string): string | null => {
    const o = tagCount(oldText), n = tagCount(newText);
    return o >= 6 && n < o * 0.5 && o - n >= 4 ? `내용손실(${o}→${n})` : null;
  };
  // 파괴적 교체: div 전체를 버튼만 남기고 재작성 → 거부.
  const destructive = applyReplaceBlocks(
    BIG,
    [{ anchor: '직원 등록', replacement: '    <div className="filters">\n      <Button>등록</Button>\n    </div>' }],
    { guard },
  );
  check('guard: 파괴적 replace 거부(원본 불변)', destructive.text === BIG, 'text changed');
  check('guard: rejected에 사유 표기', destructive.rejected.length === 1 && /내용손실/.test(destructive.rejected[0]), `rejected=${destructive.rejected.join('|')}`);

  // 비-JSX 문장 교체(useApi params 보강): span이 `;`로 올바로 닫혀 태그 급감 없음 → 통과(정상 적용).
  //  (가드는 파괴적 JSX 누락만 막고, 정당한 영역-밖 문장 교체는 종전대로 적용한다 — replace 본래 용도.)
  const STMT = [
    "  const { data } = useApi<TResp>('/api/employees', { params: { page } });",
    '  const rows = data?.list ?? [];',
  ].join('\n');
  const surgical = applyReplaceBlocks(
    STMT,
    [{ anchor: "useApi<TResp>('/api/employees'", replacement: "  const { data } = useApi<TResp>('/api/employees', { params: { page, dept } });" }],
    { guard },
  );
  check('guard: 비-JSX 문장 교체는 통과', surgical.rejected.length === 0 && surgical.text.includes('page, dept'), `rejected=${surgical.rejected.join('|')}`);

  // guard 미주입(기존 호출부) → 거부 없음(회귀 0).
  const noGuard = applyReplaceBlocks(BIG, [{ anchor: '직원 등록', replacement: '    <div className="filters">\n      <Button>등록</Button>\n    </div>' }]);
  check('guard 미주입 → rejected 빈 배열(회귀 0)', noGuard.rejected.length === 0, `rejected=${noGuard.rejected.join('|')}`);
}

// ─── applyReplaceBlocks — old(literal) 정확매칭: JSX 국소교체 과확장 없음(①버그 회귀) ──────────
console.log('\napplyReplaceBlocks — old(literal) 정확매칭:');
{
  // 버튼이 PageHeader actions={...} 안에 있고(앵커+; 추측이면 return 끝까지 과확장됐던 케이스), 아래 필터바 존재.
  const PAGE = [
    '  return (',
    '    <div>',
    '      <PageHeader',
    '        title="직원 관리"',
    '        actions={',
    '          <Button size="lg">',
    '            <UserPlus className="w-4 h-4 mr-1.5" />',
    '            직원 등록',
    '          </Button>',
    '        }',
    '      />',
    '      <div className="filters">',
    '        <Select><SelectItem>전체</SelectItem></Select>',
    '        <Input placeholder="검색" />',
    '      </div>',
    '    </div>',
    '  );',
  ].join('\n');

  // literal old: 버튼 텍스트 한 줄만 인용 → 그 줄만 교체, 필터바·PageHeader 보존(과확장 없음).
  const r = applyReplaceBlocks(PAGE, [{ anchor: '', old: '            직원 등록', replacement: '            직원 추가' }]);
  check('literal 한 줄: 텍스트만 교체', r.text.includes('직원 추가') && !r.text.includes('직원 등록'));
  check('literal 한 줄: 필터바 보존(과확장 없음)', r.text.includes('<Select>') && r.text.includes('placeholder="검색"'), r.changes.join('|'));
  check('literal 한 줄: unresolved/rejected 없음', r.unresolved.length === 0 && r.rejected.length === 0);

  // 멀티라인 literal old: 버튼 블록 전체 인용 → 그 블록만 교체.
  const r2 = applyReplaceBlocks(PAGE, [{
    anchor: '',
    old: '          <Button size="lg">\n            <UserPlus className="w-4 h-4 mr-1.5" />\n            직원 등록\n          </Button>',
    replacement: '          <Button size="sm">사원 추가</Button>',
  }]);
  check('literal 멀티라인: 버튼 블록만 교체', r2.text.includes('사원 추가') && !r2.text.includes('<UserPlus'));
  check('literal 멀티라인: 필터바·PageHeader 보존', r2.text.includes('<Select>') && r2.text.includes('title="직원 관리"'), r2.changes.join('|'));

  // 들여쓰기 차이 흡수(trim pass) — old를 flush-left로 인용해도 매칭.
  const r3 = applyReplaceBlocks(PAGE, [{ anchor: '', old: '직원 등록', replacement: '            인원 등록' }]);
  check('literal: 들여쓰기 달라도 매칭(trim pass)', r3.text.includes('인원 등록') && r3.unresolved.length === 0, `unresolved=${r3.unresolved.join('|')}`);

  // not-found: 원본에 없는 old → unresolved(조용한 무시 아님).
  const nf = applyReplaceBlocks(PAGE, [{ anchor: '', old: '            없는 텍스트', replacement: 'x' }]);
  check('literal not-found → unresolved', nf.unresolved.length === 1 && /못 찾음/.test(nf.unresolved[0]), `unresolved=${nf.unresolved.join('|')}`);

  // ambiguous: 같은 old가 두 곳 → 거부(원본 불변).
  const DUP = ['  const a = 1;', '  const b = 2;', '  const a = 1;'].join('\n');
  const amb = applyReplaceBlocks(DUP, [{ anchor: '', old: '  const a = 1;', replacement: '  const a = 9;' }]);
  check('literal ambiguous → unresolved(원본 불변)', amb.unresolved.length === 1 && /모호/.test(amb.unresolved[0]) && amb.text === DUP, `unresolved=${amb.unresolved.join('|')}`);
}

// ─── e2e: anchorFirst + literal <replace><old><new> → 버튼만 바뀌고 필터바 보존(②③버그 통합 회귀) ──
console.log('\ne2e: anchorFirst literal <replace> — 필터바 보존:');
{
  const PAGE_SRC = [
    "import { Button, Select, SelectItem, Input } from '@axiom/components/ui';",
    "import { UserPlus } from 'lucide-react';",
    '',
    'export default function EmployeeListPage() {',
    '  return (',
    '    <div className="p-5">',
    '      <PageHeader',
    '        title="직원 관리"',
    '        actions={',
    '          <Button size="lg">',
    '            <UserPlus className="w-4 h-4 mr-1.5" />',
    '            직원 등록',
    '          </Button>',
    '        }',
    '      />',
    '      <div className="flex gap-2">',
    '        <Select><SelectItem value="all">전체</SelectItem></Select>',
    '        <Input placeholder="이름 검색..." />',
    '      </div>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  // 모델이 literal <replace>로 버튼 텍스트만 인용·교체(over-expansion 유도 안 함).
  const model = '<replace><old>            직원 등록</old><new>            사원 추가</new></replace>';
  const o = await runHybridRegionEdit(PAGE_SRC, '"직원 등록" 텍스트를 바꿔줘', async () => model, undefined, undefined, undefined, undefined, true);
  check('e2e literal: applied', o.status === 'applied', `status=${o.status} ${o.diagnostics ?? ''}`);
  const ft = o.finalText ?? '';
  check('e2e literal: 버튼 텍스트 교체', ft.includes('사원 추가') && !ft.includes('직원 등록'));
  check('e2e literal: 필터바 Select·Input 보존', ft.includes('<Select>') && ft.includes('이름 검색...'));
}

// ─── 컴포넌트 교체(SmartTable) — 루트태그 게이트 화이트리스트 ────────────────────────
console.log('\n컴포넌트 교체(SmartTable) — 루트태그 게이트 화이트리스트:');
{
  // checkRegionRootTag: allowedRootTags 화이트리스트
  const tableRegion = '<table>\n  <thead><tr><th>이름</th></tr></thead>\n</table>';
  const smartOut = '<SmartTable data={items} columns={cols} searchable />';
  const divOut = '<div>아무거나</div>';
  check('교체 허용: <table>→<SmartTable> (화이트리스트) ok', checkRegionRootTag(tableRegion, smartOut, ['SmartTable']).ok);
  check('비허용 태그는 여전히 거부: <table>→<div>', !checkRegionRootTag(tableRegion, divOut, ['SmartTable']).ok);
  check('화이트리스트 없으면 종전대로 거부: <table>→<SmartTable>', !checkRegionRootTag(tableRegion, smartOut).ok);
  check('같은 루트는 화이트리스트 무관 ok', checkRegionRootTag(tableRegion, '<table><tbody/></table>', ['SmartTable']).ok);

  // componentReplacementTargets: SmartTable 지목 시 ['SmartTable'], 아니면 []
  check('SmartTable 쿼리 → 교체 타깃 SmartTable', componentReplacementTargets({ deps: '', region: '<table/>', query: '직원 테이블을 SmartTable 컴포넌트로 적용해줘' }).includes('SmartTable'));
  check('일반 테이블 쿼리 → 교체 타깃 없음', componentReplacementTargets({ deps: '', region: '<table/>', query: '테이블에 목록 api 적용해줘' }).length === 0);

  // 프롬프트: 교체 모드면 "최상위 태그 바꿔도 됨", 아니면 "바꾸지 마세요"
  const pSwap = buildHybridPrompt("const { data } = useApi<T>('/x');", '<table/>', 1, 5, undefined, undefined, '직원 테이블을 SmartTable로 적용', '');
  check('교체 모드 프롬프트: 최상위 태그 변경 허용 문구', pSwap.includes('통째 교체') && pSwap.includes('최상위 태그가 바뀌어도'));
  const pNormal = buildHybridPrompt("const { data } = useApi<T>('/x');", '<Select/>', 1, 5, undefined, undefined, '재직상태 select 수정', '');
  check('일반 모드 프롬프트: 최상위 태그 유지 문구', pNormal.includes('최상위 태그는 바꾸지 마세요'));
}

// ─── e2e: <table> 영역을 <SmartTable>로 교체 → 게이트 통과 + 합성(폴백 아님) ──────────
console.log('\ne2e: 테이블→SmartTable 영역 교체 적용:');
{
  const TABLE_SRC = [
    "import { useApi } from '@axiom/hooks';",
    "const EMPLOYEES_ENDPOINT = '/api/employees';",
    '',
    'export default function EmployeeListPage(): React.ReactNode {',
    '  const { data: employeeResponse } = useApi<TEmployeeResponse>(EMPLOYEES_ENDPOINT);',
    '  const employeeItems = employeeResponse?.data ?? [];',
    '  return (',
    '    <table className="employee-table">',
    '      <thead><tr><th>이름</th><th>이메일</th></tr></thead>',
    '      <tbody>',
    '        {employeeItems.map((e) => (<tr key={e.id}><td>{e.name}</td><td>{e.email}</td></tr>))}',
    '      </tbody>',
    '    </table>',
    '  );',
    '}',
  ].join('\n');
  // 모델이 레시피대로 <table>을 <SmartTable>로 교체 + 타입+컬럼DSL 훅 출력
  const model = [
    '<region>',
    '    <SmartTable data={employeeItems} columns={employeeColumns} searchable />',
    '</region>',
    '<hook>type TEmployee = { id: number; name: string; email: string };',
    'const employeeColumns = defineColumns<TEmployee>({ name: \'이름\', email: \'이메일\' });</hook>',
    '<import module="@axiom/components/ui" named="SmartTable, defineColumns" />',
  ].join('\n');
  const o = await runHybridRegionEdit(TABLE_SRC, '직원 테이블을 SmartTable 컴포넌트로 적용해줘', async () => model);
  check('e2e: 루트태그-불일치 폴백 안 됨(핵심 수정)', o.reason !== 'root-tag-mismatch', `status=${o.status}, reason=${o.reason}`);
  check('e2e: 적용됨(applied)', o.status === 'applied', `status=${o.status}, reason=${o.reason}`);
  check('e2e: <SmartTable> 교체 반영', !!o.finalText && o.finalText.includes('<SmartTable'));
  check('e2e: 원래 <table> 제거', !!o.finalText && !/<table\b/.test(o.finalText ?? ''));
  check('e2e: 타입+defineColumns 훅 삽입', !!o.finalText && o.finalText.includes('type TEmployee') && o.finalText.includes('defineColumns<TEmployee>'));
}

// ─── 기존 SmartTable에 옵션 추가(exportable) — 존재 기반 prop 주입 + binding 카드 양보 ──────────
console.log('\n기존 SmartTable 옵션 추가(존재 기반 prop 계층):');
{
  const stRegion = [
    '<div className="bg-card rounded-xl border overflow-hidden">',
    '  <SmartTable',
    '    data={employees}',
    '    columns={employeeColumns}',
    '    searchable',
    '  />',
    '</div>',
  ].join('\n');
  const stQuery = '선택한 SmartTable 에 excel 내보내기 옵션 추가해줘';

  // 1) 감지: 영역의 <SmartTable>을 인덱스에서 찾는다.
  check('detect: 영역에서 SmartTable 감지', detectComponentsInRegion(stRegion).includes('SmartTable'));
  check('detect: 소문자 div는 컴포넌트 아님', !detectComponentsInRegion(stRegion).includes('div'));

  // 2) prop 섹션이 exportable을 실제로 노출(모델이 그 prop 존재를 보게 됨 — 이번 버그의 핵심 해소).
  const propSec = buildComponentPropsSectionForRegion(stRegion);
  check('propSec: exportable prop 노출', propSec.includes('exportable') && propSec.includes('xlsx'));
  check('propSec: selectable/summary 등 다른 옵션도 포함', propSec.includes('selectable') && propSec.includes('summary'));

  // 3) binding 카드 양보: region에 이미 <SmartTable 이 있으면 "새로 바인딩" 레시피는 발동하지 않는다
  //    (발동하면 모델을 base 골격으로 되돌려 입력과 동일한 코드 → "변경 없음"이 재발한다).
  const firedWithExisting = selectScaffoldContracts({ deps: '', region: stRegion, query: stQuery }).map((c) => c.id);
  check('binding 카드 양보: 기존 SmartTable 영역에 smart-table-binding 미발동', !firedWithExisting.includes('smart-table-binding'));
  // 회귀 방지: <table> 영역(신규 바인딩)에는 여전히 발동해야 한다.
  const firedWithTable = selectScaffoldContracts({ deps: '', region: '<table/>', query: '직원 테이블을 SmartTable로 적용' }).map((c) => c.id);
  check('회귀 없음: <table> 신규 바인딩엔 smart-table-binding 발동', firedWithTable.includes('smart-table-binding'));

  // 4) buildHybridPrompt 통합: SmartTable 영역이면 prop 레퍼런스 섹션이 프롬프트에 들어간다.
  //    (참고: 사용자가 영역을 '선택'한 경우는 region 경로가 아니라 buildSystemPrompt 경로를 타므로,
  //     그쪽 주입은 ScaffoldContextBuilder에서 처리한다 — 여기선 region 경로 통합만 확인.)
  const p = buildHybridPrompt("const { data } = useApi<T>('/x');", stRegion, 130, 140, undefined, undefined, stQuery, '');
  check('buildHybridPrompt: 컴포넌트 prop 레퍼런스 섹션 주입', p.includes('컴포넌트 prop 레퍼런스') && p.includes('exportable'));
  check('buildHybridPrompt: 교체 모드 아님(기존 SmartTable 유지)', p.includes('최상위 태그는 바꾸지 마세요'));

  // 5) 컴포넌트가 없는 영역엔 섹션 미출력(회귀·잡음 방지).
  const plainPrompt = buildHybridPrompt("const { data } = useApi<T>('/x');", '<div>{items.map((i) => <span>{i}</span>)}</div>', 1, 3, undefined, undefined, '텍스트 바꿔줘', '');
  check('buildHybridPrompt: 인덱스에 없는 컴포넌트만 있으면 prop 섹션 미출력', !plainPrompt.includes('컴포넌트 prop 레퍼런스'));
}

// ─── Q&A "컴포넌트 옵션 보여줘" — 산문에서 컴포넌트 감지 + 전체 prop 레퍼런스 ──────────
console.log('\nQ&A 컴포넌트 옵션 조회(산문 감지):');
{
  // 평문(질문)에서 PascalCase 컴포넌트명 감지.
  check('detectText: "Select 컴포넌트 옵션 보여줘"에서 Select 감지', detectComponentsInText('Select 컴포넌트 옵션 보여줘').includes('Select'));
  // 오탐 가드: 소문자 영단어 select는 컴포넌트로 오인하지 않는다.
  check('detectText: 소문자 select(평문)는 미감지', !detectComponentsInText('please select one option').includes('Select'));
  // 루트(Select)를 서브파트(SelectItem)보다 앞세운다.
  const both = detectComponentsInText('SelectItem 과 Select');
  check('detectText: 루트 우선 정렬(Select < SelectItem)', both.indexOf('Select') < both.indexOf('SelectItem'));

  // Q&A 레퍼런스: 전체 고유 prop이 나온다(Select의 onValueChange 등).
  const ref = buildComponentOptionsReference(detectComponentsInText('Select 옵션'));
  check('optionsRef: Select 전체 prop(onValueChange 포함)', ref.includes('컴포넌트 옵션 레퍼런스') && ref.includes('onValueChange') && ref.includes('disabled'));
  check('optionsRef: 감지 없으면 빈 문자열', buildComponentOptionsReference(detectComponentsInText('오늘 날씨 어때')) === '');
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
