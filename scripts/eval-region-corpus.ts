/**
 * region/hybrid 편집 측정 코퍼스 (모델 무관).
 *
 * 목적: locateEditRegion이 현실적인 (파일, 질문) 쌍에서
 *  - region 모드로 남는가(eligible) vs full로 폴백하는가
 *  - 어떤 안전 게이트로 폴백하는가(게이트 분포)
 *  - region 모드일 때 모델에 보내는 입력이 full 파일 대비 얼마나 작은가(토큰 절감률)
 * 를 **집계 지표**로 측정하기 위한 케이스 모음. 단위 테스트(test-region-edit)가
 * "특정 불변식 1개"를 못박는다면, 이 코퍼스는 "결과의 분포"를 추적해 고도화의
 * 회귀 안전망 + 계기판이 된다.
 *
 * 케이스 추가법: 파일(FIXTURES)에 현실 TSX를 넣고, 그 파일에 대한 질문을 CASES에
 * 한 줄씩 추가한다. expect.gate를 적으면 회귀(예상≠실제)로 잡히고, 비워두면
 * 측정만 한다(아직 정답이 불확실한 탐색 케이스).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EvalCase {
  id: string;
  /** FIXTURES 키 */
  file: string;
  /** 사용자 질문 */
  query: string;
  /** 기대 게이트(회귀 가드). 생략 시 측정만. 게이트 라벨이 바뀌어도 결과(eligible)만 지키려면 expectEligible 사용. */
  expectGate?: 'ok' | 'anchor-missing' | 'anchor-comment' | 'anchor-import' | 'snap-failed';
  /** 기대 적용여부(회귀 가드). 게이트 라벨에 무관하게 region 적용/폴백만 못박는다. */
  expectEligible?: boolean;
  /**
   * 엔드투엔드(모델 출력 레이어) 골든 — eval:e2e 전용. record 후 안정된 케이스에만 못박는다.
   * 'applied': 합성·게이트 통과해 최종 파일이 나와야 함 / 'fallback': 후처리 게이트로 full 폴백돼야 함.
   * locate에서 이미 폴백되는 케이스(expectGate≠ok)엔 무의미하므로 적지 않는다.
   */
  expectE2E?: 'applied' | 'fallback';
  /** expectE2E='fallback'일 때 기대 폴백 사유(예: 'unresolved-deps'). 생략 시 사유 무관, 폴백 여부만 본다. */
  expectE2EReason?: string;
  /** 케이스 의도 메모 */
  note?: string;
}

/** 현실적 react-app-scaffold 페이지 — Select 필터 + 검색 + 테이블 + 페이지네이션. */
const MEMBER_LIST = [
  /*  1 */ "import { useState } from 'react';",
  /*  2 */ "import { useApi } from '@axiom/hooks';",
  /*  3 */ 'import {',
  /*  4 */ '  Select,',
  /*  5 */ '  SelectContent,',
  /*  6 */ '  SelectItem,',
  /*  7 */ '  SelectTrigger,',
  /*  8 */ '  SelectValue,',
  /*  9 */ "} from '@axiom/components/ui';",
  /* 10 */ "import { Input } from '@axiom/components/ui';",
  /* 11 */ "import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@axiom/components/ui';",
  /* 12 */ '',
  /* 13 */ 'type TMember = { id: number; name: string; dept: string; status: string };',
  /* 14 */ 'type TMemberListResponse = { success: boolean; data: TMember[]; total: number };',
  /* 15 */ '',
  /* 16 */ 'export default function MemberListPage(): React.ReactNode {',
  /* 17 */ "  const [status, setStatus] = useState('all');",
  /* 18 */ "  const [keyword, setKeyword] = useState('');",
  /* 19 */ '  const [page, setPage] = useState(1);',
  /* 20 */ "  const { data: resp } = useApi<TMemberListResponse>('/api/members');",
  /* 21 */ '  const members = resp?.data ?? [];',
  /* 22 */ '  const total = resp?.total ?? 0;',
  /* 23 */ '',
  /* 24 */ '  return (',
  /* 25 */ '    <div className="page">',
  /* 26 */ '      <div className="toolbar">',
  /* 27 */ '        {/* 재직상태 필터 */}',
  /* 28 */ '        <Select value={status} onValueChange={setStatus}>',
  /* 29 */ '          <SelectTrigger>',
  /* 30 */ '            <SelectValue placeholder="재직상태" />',
  /* 31 */ '          </SelectTrigger>',
  /* 32 */ '          <SelectContent>',
  /* 33 */ '            <SelectItem value="all">전체</SelectItem>',
  /* 34 */ '            <SelectItem value="active">재직</SelectItem>',
  /* 35 */ '            <SelectItem value="leave">휴직</SelectItem>',
  /* 36 */ '          </SelectContent>',
  /* 37 */ '        </Select>',
  /* 38 */ '        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="이름 검색" />',
  /* 39 */ '      </div>',
  /* 40 */ '      <Table>',
  /* 41 */ '        <TableHeader>',
  /* 42 */ '          <TableRow>',
  /* 43 */ '            <TableHead>이름</TableHead>',
  /* 44 */ '            <TableHead>부서</TableHead>',
  /* 45 */ '            <TableHead>상태</TableHead>',
  /* 46 */ '          </TableRow>',
  /* 47 */ '        </TableHeader>',
  /* 48 */ '        <TableBody>',
  /* 49 */ '          {members.map((m) => (',
  /* 50 */ '            <TableRow key={m.id}>',
  /* 51 */ '              <TableCell>{m.name}</TableCell>',
  /* 52 */ '              <TableCell>{m.dept}</TableCell>',
  /* 53 */ '              <TableCell>{m.status}</TableCell>',
  /* 54 */ '            </TableRow>',
  /* 55 */ '          ))}',
  /* 56 */ '        </TableBody>',
  /* 57 */ '      </Table>',
  /* 58 */ '    </div>',
  /* 59 */ '  );',
  /* 60 */ '}',
].join('\n');

/** 작은 폼 페이지 — 비-JSX 상수 편집(snap-failed) 케이스용. */
const SMALL_FORM = [
  /*  1 */ "import { useState } from 'react';",
  /*  2 */ "import { Button, Input } from '@axiom/components/ui';",
  /*  3 */ '',
  /*  4 */ 'const PAGE_LIMIT = 20;',
  /*  5 */ '',
  /*  6 */ 'export default function LoginForm(): React.ReactNode {',
  /*  7 */ "  const [id, setId] = useState('');",
  /*  8 */ '  return (',
  /*  9 */ '    <form className="login">',
  /* 10 */ '      <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="아이디" />',
  /* 11 */ '      <Button type="submit">로그인</Button>',
  /* 12 */ '    </form>',
  /* 13 */ '  );',
  /* 14 */ '}',
].join('\n');

/**
 * 인라인 합성 픽스처 + 디스크 실파일 픽스처를 합친다.
 * scripts/eval-fixtures/ 에 떨군 *.tsx/*.ts 는 basename(확장자 제외)을 키로 자동 로드된다.
 * (실고객 코드는 .gitignore로 커밋 제외 — 추세만 보고, 절대 픽스처를 저장소에 올리지 않는다.)
 */
function loadDiskFixtures(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const dir = path.resolve(process.cwd(), 'scripts/eval-fixtures');
    if (!fs.existsSync(dir)) return out;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(tsx?|jsx?)$/.test(f)) continue;
      const key = f.replace(/\.(tsx?|jsx?)$/, '');
      out[key] = fs.readFileSync(path.join(dir, f), 'utf8');
    }
  } catch {
    /* 디스크 접근 불가 시 인라인 픽스처만 사용 */
  }
  return out;
}

export const FIXTURES: Record<string, string> = {
  MEMBER_LIST,
  SMALL_FORM,
  ...loadDiskFixtures(),
};

export const CASES: EvalCase[] = [
  // ── region 적용이 기대되는 케이스(ok) ─────────────────────────────────
  {
    id: 'select-filter',
    file: 'MEMBER_LIST',
    query: '재직상태 select 옵션을 api로 받아오게 해줘',
    expectGate: 'ok',
    expectE2E: 'fallback',
    expectE2EReason: 'dead-binding',
    note: 'Select 통짜 스냅(locate ok). 단 실측: 모델이 API 옵션(statusItems)을 hook에 만들고 region엔 안 끼움(하드코딩 유지) → 미사용 죽은코드 → dead-binding 폴백이 정답(편집 미완성). 30B도 핵심경로 가끔 미완.',
  },
  {
    id: 'table-cell',
    file: 'MEMBER_LIST',
    query: '테이블에 입사일 컬럼을 추가해줘',
    expectE2E: 'applied',
    note: '테이블 행/헤더 편집 — qwen3-coder-64k 녹화 기준 applied',
  },
  // ── full 폴백이 기대되는 케이스(게이트별) ─────────────────────────────
  {
    id: 'missing-feature',
    file: 'MEMBER_LIST',
    query: '엑셀 다운로드 기능을 붙여줘',
    expectGate: 'anchor-missing',
    note: '파일에 없는 기능 — 앵커 부재 → full',
  },
  {
    id: 'jsx-comment-overlap',
    file: 'MEMBER_LIST',
    query: '재직상태 필터 주석 부분을 정리해줘',
    expectGate: 'ok',
    expectE2E: 'applied',
    note: '발견: anchor-comment 게이트는 //·/* */만 인식, JSX 주석 {/* */}은 못 잡아 실제 Select로 스냅됨(갭 후보)',
  },
  {
    id: 'import-anchor',
    file: 'MEMBER_LIST',
    query: 'useApi import 적용 방식을 바꿔줘',
    expectGate: 'anchor-import',
    note: '최고 매칭이 import 라인 — 편집 영역 부적합',
  },
  {
    id: 'nonjsx-const',
    file: 'SMALL_FORM',
    query: 'PAGE_LIMIT 값을 50으로 수정해줘',
    expectGate: 'snap-failed',
    note: '비-JSX 상수 — 감싸는 완결 JSX 없음 → full',
  },

  // ══ 실파일(peoplify) 측정 케이스 — eval-fixtures/*.tsx 자동 로드 ══════════
  //   expectGate는 거의 비워 측정에 집중(앞선 합성 케이스가 게이트 회귀를 지킴).
  //   엑셀/다운로드처럼 파일에 없는 어휘만 anchor-missing 가드로 못박는다.

  // EmployeeListPage — 부서/재직상태/투입상태 select, 검색, 페이지네이션, 테이블
  { id: 'emp-list-dept-api', file: 'EmployeeListPage', query: '부서 셀렉트 옵션을 부서 목록 API로 받아오게 해줘', expectE2E: 'applied', note: '실파일: 부서 Select' },
  { id: 'emp-list-status-code', file: 'EmployeeListPage', query: '재직상태 셀렉트를 공통코드로 채워줘', expectE2E: 'fallback', expectE2EReason: 'no-op', note: '실파일: 재직상태 Select — 파일에 이미 공통코드 API select 구현됨 → no-op이 정답' },
  { id: 'emp-list-phone-col', file: 'EmployeeListPage', query: '직원 테이블에 연락처 컬럼을 추가해줘', expectE2E: 'applied', note: '실파일: 테이블 컬럼 추가' },
  { id: 'emp-list-excel', file: 'EmployeeListPage', query: '엑셀 다운로드 버튼을 추가해줘', expectEligible: false, note: '실파일: 없는 기능 → full 가드(게이트 무관, 적용만 막으면 OK)' },

  // EmployeeEditPage — 부서/직급/재직상태 select, 퇴사일, 스킬 태그
  // grounding(backingDecls 주입) + 무손실 const 교체로 해소됨: 모델이 기존 grades 전부 보존한 superset 출력 → 교체 적용.
  { id: 'emp-edit-grade-add', file: 'EmployeeEditPage', query: '직급 셀렉트에 수석 항목을 추가해줘', expectE2E: 'applied', note: '실파일: 직급 Select 옵션 추가 — grounding+무손실 교체로 applied(영역 밖 const 수정 갭 해소)' },
  { id: 'emp-edit-resign-valid', file: 'EmployeeEditPage', query: '퇴사일은 입사일 이후만 선택되게 검증을 추가해줘', expectE2E: 'fallback', expectE2EReason: 'dead-binding', note: '실파일: 폼 검증 — 실측: region(퇴사일 Input)에 이미 min={hireDate} 검증 존재(미변경) + 미사용 resignDateError 삽입 → dead-binding 폴백 정답' },
  { id: 'emp-edit-skill-dup', file: 'EmployeeEditPage', query: '기술 스택 추가 시 중복이면 안내문구를 보여줘', expectE2E: 'applied', note: '실파일: 스킬 태그 입력' },

  // EmployeeFormPage — 부서/직급 select, 스킬
  { id: 'emp-form-dept-default', file: 'EmployeeFormPage', query: '부서 셀렉트 기본 선택을 개발팀으로 바꿔줘', expectE2E: 'applied', note: '실파일: 등록폼 부서 Select' },
  { id: 'emp-form-skill-kotlin', file: 'EmployeeFormPage', query: '추천 기술 스택에 Kotlin을 추가해줘', expectE2E: 'applied', note: '실파일: 추천 스킬' },

  // EmployeeDetailPage — 탭, 투입이력 테이블
  { id: 'emp-detail-history-col', file: 'EmployeeDetailPage', query: '투입 이력 테이블에 비고 컬럼을 추가해줘', expectE2E: 'applied', note: '실파일: 투입이력 테이블' },
  { id: 'emp-detail-contact', file: 'EmployeeDetailPage', query: '요약 카드에 연락처를 한 줄 더 보여줘', expectE2E: 'fallback', expectE2EReason: 'no-op', note: '실파일: 요약 카드 — 카드에 이미 phone 표시됨 → no-op이 정답' },

  // ProjectListPage — 탭, 검색, 기술스택/PM select
  { id: 'proj-list-tech-node', file: 'ProjectListPage', query: '기술스택 셀렉트에 Node.js 옵션을 추가해줘', expectE2E: 'applied', note: '실파일: 기술스택 Select' },
  { id: 'proj-list-pm-api', file: 'ProjectListPage', query: 'PM 셀렉트를 API로 받아오게 해줘', expectE2E: 'applied', note: '실파일: PM Select' },
  { id: 'proj-list-search-ph', file: 'ProjectListPage', query: '프로젝트명·고객사 검색 입력의 안내 문구를 바꿔줘', expectE2E: 'applied', note: '실파일: 검색 input' },

  // ProjectDetailPage — 투입인력 테이블, 배정 버튼
  { id: 'proj-detail-member-col', file: 'ProjectDetailPage', query: '투입 인력 테이블에 연락처 컬럼을 추가해줘', expectE2E: 'applied', note: '실파일: 투입인력 테이블' },
  { id: 'proj-detail-excel', file: 'ProjectDetailPage', query: '엑셀 다운로드 기능을 붙여줘', expectEligible: false, note: '실파일: 없는 기능 → full 가드(게이트 무관)' },

  // ProjectAssignPage — 기술스택/투입률/경력/부서 필터 select, 역할 select
  { id: 'proj-assign-exp-opts', file: 'ProjectAssignPage', query: '경력 필터 셀렉트 옵션을 3년/5년/10년으로 바꿔줘', expectE2E: 'applied', note: '실파일: 경력 필터 Select' },
  { id: 'proj-assign-role-qa', file: 'ProjectAssignPage', query: '역할 셀렉트에 QA를 추가해줘', expectE2E: 'applied', note: '실파일: 역할 Select' },
  { id: 'proj-assign-dept-api', file: 'ProjectAssignPage', query: '부서 필터 셀렉트를 부서 API로 받아오게 해줘', expectE2E: 'applied', note: '실파일: 부서 필터 Select' },

  // ProjectStatusPage — 상태/부서/철수임박 select, 테이블
  { id: 'proj-status-add-wait', file: 'ProjectStatusPage', query: '상태 셀렉트에 대기 항목을 추가해줘', expectE2E: 'applied', note: '실파일: 상태 Select' },
  { id: 'proj-status-leave-60', file: 'ProjectStatusPage', query: '철수 임박 필터에 60일 이내 옵션을 추가해줘', expectE2E: 'applied', note: '실파일: 철수임박 Select' },

  // ══ 임의 요소(비-Select/비-table) — 도메인 한글 콘텐츠로 가리킴: 앵커 품질(B) 측정용 ══════
  //   th/td/label/span 등 다양한 enclosing 요소. 구조어 없이 화면 텍스트로만 지시.
  { id: 'q-rate-cell', file: 'ProjectDetailPage', query: '투입률을 퍼센트 막대로 표시해줘', expectE2E: 'fallback', expectE2EReason: 'dead-binding', note: 'B: 투입률 th. 실측: region(헤더 tr) 미변경(막대 미렌더) + 미사용 progressPercentage 헬퍼 삽입 → dead-binding 폴백 정답' },
  { id: 'q-leave-date', file: 'ProjectStatusPage', query: '철수 예정일 표기를 날짜만 보이게 바꿔줘', expectE2E: 'applied', note: 'B: 철수 예정일 th' },
  { id: 'q-resign-input', file: 'EmployeeEditPage', query: '퇴사일 입력칸 안내문을 추가해줘', expectE2E: 'applied', note: 'B: 퇴사일 label/Input' },
  { id: 'q-skill-tag', file: 'EmployeeFormPage', query: '선택된 기술 스택 태그를 더 크게 보여줘', expectE2E: 'applied', note: 'B: 스킬 태그 span' },
  { id: 'q-summary-email', file: 'EmployeeDetailPage', query: '요약 카드의 이메일을 굵게 표시해줘', expectE2E: 'applied', note: 'B: 요약 카드 내 이메일' },

  // ══ 편집 유형 다양화(코퍼스 확장) — Select/table 편중을 깨고 다음 갭을 탐색 ════════════════
  //   expect는 비워 측정만(탐색). eval:region(locate)로 게이트 먼저 보고, e2e 녹화 후 결과 못박는다.
  //   각 케이스의 가설을 note에 적어 측정값과 대조한다.

  // 삭제 vs 무손실 가드 대조쌍 ───────────────────────────────────────────────
  // (A) 배열 백킹 옵션 삭제: 모델이 grades 배열을 항목 빼고 재선언 → 무손실 가드가 '누락'으로 거부 → no-op?
  //     ⚠ 삭제 의도와 무손실 가드의 정면충돌 가설. 가드가 "실수 누락"과 "의도적 제거"를 구분 못 함.
  { id: 'del-grade-option', file: 'EmployeeEditPage', query: '직급 셀렉트에서 이사 항목을 빼줘', expectE2E: 'applied', note: '편집유형:삭제(배열백킹) — 삭제 의도 가드로 해소(새 ⊆ 기존이면 항목 제거 허용, 환각 차단). no-op→applied' },
  // (B) 하드코딩 SelectItem 삭제: JSX 영역 재작성으로 줄 제거 → 배열 아님 → applied 예상(대조군)
  { id: 'del-jsx-option', file: 'MEMBER_LIST', query: '재직상태 필터에서 휴직 옵션을 제거해줘', expectE2E: 'applied', note: '편집유형:삭제(JSX 하드코딩) — 영역 재작성으로 줄 제거 → applied(del-grade-option 대조군: 배열백킹은 가드충돌 no-op)' },

  // rename: 영역+사용처에 걸친 식별자 변경 — region 단일 splice로 표현 불가. 실측: 모델이 미사용 selectedDept만
  //   삽입 + 원본 미rename → dead-binding 게이트가 honest fallback으로(silent 오편집 차단).
  { id: 'rename-state', file: 'EmployeeEditPage', query: 'department state 이름을 selectedDept로 바꿔줘', expectE2E: 'fallback', expectE2EReason: 'dead-binding', note: '편집유형:rename — region 표현 불가, 미사용 selectedDept 삽입 → dead-binding 폴백 정답' },

  // 조건부 렌더 추가: 실측은 엉뚱한 region(스킬 입력) 스냅 + 미사용 leaveStartDate 삽입 → dead-binding 폴백.
  { id: 'cond-leave-date', file: 'EmployeeEditPage', query: '휴직 상태일 때 휴직 시작일 입력란을 보여줘', expectE2E: 'fallback', expectE2EReason: 'dead-binding', note: '편집유형:조건부 렌더 — 실측 미스냅+미사용 state → dead-binding 폴백' },

  // JSX 텍스트/속성 변경(작은 영역 편집)
  { id: 'btn-text', file: 'EmployeeEditPage', query: '저장 버튼 글자를 수정 완료로 바꿔줘', expectE2E: 'applied', note: '편집유형:JSX 텍스트 변경 — Button 영역' },
  { id: 'attr-readonly', file: 'EmployeeEditPage', query: '이메일 입력칸을 읽기 전용으로 만들어줘', note: '편집유형:속성 토글(readOnly) — 이메일 Input 영역' },

  // 신규 섹션 삽입: 기존 섹션 곁에 새 카드 섹션 추가(영역 재작성으로 충분한지/위치 가설)
  { id: 'new-memo-section', file: 'EmployeeEditPage', query: '기술스택 섹션 아래에 메모 입력란 섹션을 추가해줘', note: '편집유형:신규 섹션 — 위치/범위 가설' },

  // 다중 컨트롤: 한 질문이 두 타깃을 건드림 — locate 단일 스냅의 한계 가설
  { id: 'multi-control', file: 'MEMBER_LIST', query: '재직상태 필터와 입사일 컬럼을 둘 다 손봐줘', note: '편집유형:다중 타깃 — locate 단일 선택 한계 가설' },
];
