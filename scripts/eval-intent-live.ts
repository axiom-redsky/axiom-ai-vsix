/**
 * 의도 분류 **라이브** eval — 실 qwen3-coder 모델로 canonical 요청들의 의도 분류 정확도를 배치 측정한다.
 *
 * 왜: 지금까지 라우팅/의도 버그는 사용자가 프로덕션에서 스크린샷으로 하나씩 발견했다(반응형). 이 하니스는
 * 대표 요청 N개를 실제 모델에 돌려 **분류가 맞는지 자동 판정**한다(선제형). 오프라인 eval은 프롬프트 효과를
 * 측정 못 하므로(핸드오프 원칙 #1) 실모델 배치가 유일한 방법이다.
 *
 * 실행:  npm run eval:intent-live
 *   설정: AXIOM_ENDPOINT / AXIOM_MODEL / AXIOM_API_KEY (없으면 VSCode 사용자 settings.json)
 *   옵션: AXIOM_EVAL_REPEAT=3  (각 케이스 반복 실행 → 약한 모델의 분류 흔들림 측정)
 *
 * 여기 케이스는 **실제로 오분류됐던 요청**을 회귀로 고정한 것이다(세션 2026-07-02): "보여줘"가 지식가이드로
 * 새던 건, "함수 만들어"가 create_page로 새던 건 등. 새 버그를 발견하면 여기에 케이스를 추가한다.
 */
import { buildIntentPrompt, parseIntent, type IntentKind, type IntentContext } from '../src/ai/intent/IntentClassifier';
import { resolveModelConfig, callLlm } from './live-model-client';

interface Case {
  name: string;
  query: string;
  ctx: IntentContext;
  expect: IntentKind;
  /** 지정 시 targetComponent도 검증(정확 값 또는 null). undefined면 미검증. */
  expectComponent?: string | null;
}

const DOMAINS = ['employee', 'example', 'main'];
const EMP_FILE = 'src/domains/employee/pages/EmployeeListPage.tsx';
const ctxOpen = (hasSelection = false): IntentContext => ({ currentFile: EMP_FILE, hasSelection, domains: DOMAINS });
const ctxNone: IntentContext = { currentFile: null, hasSelection: false, domains: DOMAINS };

const CASES: Case[] = [
  // ── 파일 수정 (열린 파일) — 실제 오분류/오라우팅 회귀 ──────────────────────────
  { name: 'getArr 결과를 테이블로 보여줘 → modify(지식가이드로 새면 안 됨)', query: '현재 화면에서 getArr함수 결과를 테이블로 화면에 보여줘', ctx: ctxOpen(), expect: 'modify_file' },
  { name: 'alert 버튼 넣어줘 → modify', query: 'alert을 띄우는 버튼 하나 넣어줘', ctx: ctxOpen(), expect: 'modify_file' },
  { name: '함수 만들어 → modify(create_page 아님)', query: 'getArr 함수 하나 만들어서 상품 배열을 return하게 해줘', ctx: ctxOpen(), expect: 'modify_file' },
  { name: '이 배열을 테이블로 보여줘 → modify', query: '이 배열을 테이블로 화면에 보여줘', ctx: ctxOpen(), expect: 'modify_file' },
  { name: 'state 추가 → modify', query: '로딩 상태 state 하나 추가해줘', ctx: ctxOpen(), expect: 'modify_file' },
  { name: 'API 적용 → modify', query: "직원 목록 테이블에 '/api/employees' 적용해줘", ctx: ctxOpen(), expect: 'modify_file' },

  // ── 페이지 생성 ─────────────────────────────────────────────────────────────
  { name: '목록 화면 만들어 → create_page', query: '상품 목록 화면 만들어줘', ctx: ctxNone, expect: 'create_page' },
  { name: 'PascalCase 페이지 생성 → create_page', query: 'CatalogListPage를 catalog 도메인에 만들어줘', ctx: ctxNone, expect: 'create_page' },
  { name: '등록 페이지 새로 → create_page', query: '직원 등록 페이지 새로 만들어줘', ctx: ctxNone, expect: 'create_page' },

  // ── Q&A (조회·설명) ─────────────────────────────────────────────────────────
  { name: 'useApi 사용법 → qna', query: 'useApi 사용법 알려줘', ctx: ctxOpen(), expect: 'qna' },
  { name: '이 훅 뭐하는지 → qna', query: '이 useApi 훅이 무슨 일을 해?', ctx: ctxOpen(), expect: 'qna' },
  { name: '라우팅 설정법 → qna', query: '이 프로젝트에서 라우팅은 어떻게 설정해?', ctx: ctxNone, expect: 'qna' },

  // ── 잡담 ────────────────────────────────────────────────────────────────────
  { name: '감사 인사 → smalltalk', query: '고마워 잘됐어', ctx: ctxOpen(), expect: 'smalltalk' },

  // ── targetComponent 판별 (조사 구분: "를 수정" vs "로 적용") ──────────────────
  { name: 'X 컴포넌트를 수정 → targetComponent=X', query: '이 화면이 쓰는 StatusBadge 컴포넌트를 수정해줘', ctx: ctxOpen(), expect: 'modify_file', expectComponent: 'StatusBadge' },
  { name: 'X 컴포넌트로 적용 → targetComponent=null(현재파일 사용)', query: '현재 파일의 표를 DataGrid 컴포넌트로 적용해줘', ctx: ctxOpen(), expect: 'modify_file', expectComponent: null },
];

interface Outcome { pass: boolean; got: string; detail: string; raw?: string; ms: number; error?: string }

async function runCase(cfg: ReturnType<typeof resolveModelConfig>, c: Case): Promise<Outcome> {
  const prompt = buildIntentPrompt(c.query, c.ctx);
  const r = await callLlm(cfg!, '당신은 의도 분류기입니다. JSON 한 줄만 출력하세요.', prompt, { maxTokens: 200, temperature: 0.1 });
  if (!r.ok) return { pass: false, got: '(호출 실패)', detail: r.error ?? '', ms: r.elapsedMs, error: r.error };
  const parsed = parseIntent(r.text);
  if (!parsed) return { pass: false, got: '(파싱 실패)', detail: `원문: ${r.text.trim().slice(0, 100)}`, raw: r.text, ms: r.elapsedMs };
  let pass = parsed.intent === c.expect;
  let detail = `intent=${parsed.intent}`;
  if (pass && c.expectComponent !== undefined) {
    const compOk = (parsed.targetComponent ?? null) === c.expectComponent;
    pass = compOk;
    detail += ` targetComponent=${parsed.targetComponent ?? 'null'}(기대 ${c.expectComponent ?? 'null'})`;
  }
  return { pass, got: parsed.intent, detail, raw: r.text, ms: r.elapsedMs };
}

async function main() {
  const cfg = resolveModelConfig();
  if (!cfg) {
    console.error('❌ endpoint/model을 찾을 수 없습니다. AXIOM_ENDPOINT/AXIOM_MODEL 환경변수 또는 VSCode 설정을 확인하세요.');
    process.exit(1);
  }
  const repeat = Math.max(1, Number(process.env.AXIOM_EVAL_REPEAT ?? 1));
  console.log(`\n의도 분류 라이브 eval — endpoint=${cfg.endpoint} model=${cfg.model} apiKey=${cfg.apiKey ? '있음' : '없음'} repeat=${repeat}\n`);

  // Preflight — 1회 호출로 연결/인증을 먼저 확인한다(15개 동일 에러 방지). 실패 시 원인별 안내 후 종료.
  const pre = await callLlm(cfg, '핑', 'ok?', { maxTokens: 4, timeoutMs: 20_000 });
  if (!pre.ok) {
    console.error(`❌ 모델 서버 연결/인증 실패: ${pre.error}`);
    if (/401|403|unauthorized|forbidden/i.test(pre.error ?? '')) {
      console.error(
        '\n👉 API 키가 필요합니다. 익스텐션은 키를 **VSCode SecretStorage(암호화)**에 보관하므로 이 스크립트가 읽을 수 없습니다.\n' +
        '   PowerShell에서 키를 환경변수로 주고 다시 실행하세요:\n' +
        '     $env:AXIOM_API_KEY="<키>"; npm run eval:intent-live\n' +
        '   (endpoint/model은 VSCode 설정에서 자동으로 읽혔습니다. 필요하면 $env:AXIOM_ENDPOINT / $env:AXIOM_MODEL 로 덮어쓸 수 있습니다.)',
      );
    }
    process.exit(1);
  }

  let total = 0;
  let passed = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    let casePass = 0;
    let lastDetail = '';
    let lastRaw: string | undefined;
    let sumMs = 0;
    for (let i = 0; i < repeat; i++) {
      const o = await runCase(cfg, c);
      total++;
      sumMs += o.ms;
      if (o.pass) { passed++; casePass++; }
      lastDetail = o.detail;
      lastRaw = o.raw;
      if (!o.pass) lastDetail = `${o.detail}${o.error ? ` · ${o.error}` : ''}`;
    }
    const allPass = casePass === repeat;
    const mark = allPass ? '✅' : casePass > 0 ? '⚠️ ' : '❌';
    const rate = repeat > 1 ? ` [${casePass}/${repeat}]` : '';
    console.log(`${mark} ${c.name}${rate}`);
    console.log(`     기대=${c.expect}${c.expectComponent !== undefined ? `/comp=${c.expectComponent ?? 'null'}` : ''} · ${lastDetail} · ${Math.round(sumMs / repeat)}ms`);
    if (!allPass) {
      failures.push(c.name);
      if (lastRaw) console.log(`     원문: ${lastRaw.trim().slice(0, 160)}`);
    }
  }

  const acc = total ? Math.round((passed / total) * 100) : 0;
  console.log(`\n결과: ${passed}/${total} 통과 (정확도 ${acc}%)`);
  if (failures.length) {
    console.log(`실패 케이스(${failures.length}): ${failures.join(' / ')}`);
  }
  // eval은 비결정 모델이라 실패해도 exit 1로 CI를 깨지 않고, 정확도 리포트로만 쓴다.
  // (원하면 임계 게이트를 걸 수 있게 AXIOM_EVAL_MIN_ACC 지원.)
  const minAcc = Number(process.env.AXIOM_EVAL_MIN_ACC ?? 0);
  if (minAcc && acc < minAcc) {
    console.error(`\n❌ 정확도 ${acc}% < 임계 ${minAcc}%`);
    process.exit(1);
  }
}

main();
