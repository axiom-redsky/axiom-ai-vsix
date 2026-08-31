/**
 * 오프라인 의도 분류(classifyOfflineIntent) + OfflineResponder 렌더 회귀 테스트.
 * (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행). 실행: node scripts/run-test-offline-intent.mjs
 *
 * 캡처 회귀: "현재 화면의 jsx 부분을 …EmployeeListPage.tsx 파일의 jsx로 적용해줘"(수정 요청)에
 * useState 튜토리얼이 응답되던 문제. 의도를 modify_file로 결정론 분류하고, 그룹별 프레이밍 +
 * 로컬 RAG 본문으로 응답하는지 검증한다.
 */
import * as path from 'node:path';
import { classifyOfflineIntent, extractFilePathRef, stripFileRefs, fillSlots } from '../src/ai/intent/IntentSignals';
import { OfflineResponder } from '../src/ai/retrieval/OfflineResponder';
import { IntentExampleStore } from '../src/ai/intent/IntentExampleStore';
import { IntentEmbeddingClassifier, type ClassifyResult } from '../src/ai/intent/IntentEmbeddingClassifier';
import { resolveOfflineIntent } from '../src/ai/intent/OfflineIntentResolver';
import { buildIntentPrompt, type IntentContext } from '../src/ai/intent/IntentClassifier';
import { PageCreationDetector } from '../src/ai/intent/PageCreationDetector';

/**
 * 결정론적 가짜 임베딩 — 해싱 bag-of-words(어휘 겹침 기반 코사인).
 * 실제 transformers 모델 없이 분류기 선택 로직을 검증한다. 코퍼스 예시와 테스트 쿼리가 어휘를
 * 공유하면 유사도가 높아진다(실제 의미 임베딩의 결정론적 스탠드인).
 */
function fakeEmbed(text: string): Promise<number[]> {
  const dim = 256;
  const v = new Array<number>(dim).fill(0);
  for (const tok of text.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Promise.resolve(v.map((x) => x / norm));
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

const withFile = (f: string | null): IntentContext => ({ currentFile: f, hasSelection: false, domains: [] });
const noFile = withFile(null);

console.log('\nclassifyOfflineIntent:');

// 캡처 사례: 현재 파일 수정 + 내용 출처 경로
{
  const q = '현재 화면의 jsx 부분을 /src/publishing/employee/pages/EmployeeListPage.tsx 파일의 jsx로 적용해줘';
  const r = classifyOfflineIntent(q, withFile('src/domains/employee/pages/EmployeeListPage.tsx'));
  check('캡처 프롬프트 → modify_file', r.intent === 'modify_file', `got ${r.intent}`);
  check('캡처 프롬프트 → targetFile=current', r.targetFile === 'current', `got ${r.targetFile}`);
  check('캡처 프롬프트 → contentSource 경로 추출',
    r.contentSource === 'src/publishing/employee/pages/EmployeeListPage.tsx', `got ${r.contentSource}`);
}

// 잡담
check('"안녕" → smalltalk', classifyOfflineIntent('안녕', noFile).intent === 'smalltalk');
check('"ㅋㅋㅋ" → smalltalk', classifyOfflineIntent('ㅋㅋㅋ', noFile).intent === 'smalltalk');

// 질문(조회·설명)
check('"useApi 사용법 알려줘" → qna', classifyOfflineIntent('useApi 사용법 알려줘', noFile).intent === 'qna');
check('"라우터는 어떻게 써?" → qna', classifyOfflineIntent('라우터는 어떻게 써?', noFile).intent === 'qna');

// 페이지 생성
{
  const r = classifyOfflineIntent('상품 목록 화면 만들어줘', noFile);
  check('"상품 목록 화면 만들어줘" → create_page', r.intent === 'create_page', `got ${r.intent}`);
}
{
  const r = classifyOfflineIntent('CatalogListPage 페이지를 만들어줘', noFile);
  check('"CatalogListPage 페이지를 만들어줘" → create_page + pageName',
    r.intent === 'create_page' && r.pageName === 'CatalogListPage', `got ${r.intent}/${r.pageName}`);
}

// how-to 질문은 "생성/만들" 동사가 들어 있어도 create_page/modify_file이 아니라 qna로 라우팅한다.
// (회귀: "페이지 생성 방법 알려줘"가 CREATION_KEYWORDS '페이지 생성' 또는 editVerbs '생성'에 걸려
//  영문명 되묻기/현재파일 수정으로 새던 버그. 도메인 파일을 연 상태에서도 qna 유지.)
// 설명 동사 없이 "방법/법/절차"만 짧게 붙은 입력도 how-to로 본다(생성 명령이 없으므로).
for (const q of [
  '페이지 생성 방법 알려줘', '페이지 생성 가이드 보여줘', '페이지 어떻게 만들어?',
  '화면 생성 방법', '페이지 생성 방법', '페이지 만드는 방법', '화면 만드는 법', '페이지 생성 절차',
]) {
  check(`"${q}" → qna(생성 아님)`,
    classifyOfflineIntent(q, withFile('src/domains/main/pages/MainPage.tsx')).intent === 'qna',
    `got ${classifyOfflineIntent(q, withFile('src/domains/main/pages/MainPage.tsx')).intent}`);
}
// 단, "방법"이 페이지 주제인 실제 생성 요청은 그대로 create_page 유지.
check('"회원가입 방법 페이지 만들어줘" → create_page',
  classifyOfflineIntent('회원가입 방법 페이지 만들어줘', noFile).intent === 'create_page');

// 수정 동사가 잡담/질문보다 우선
check('"버튼 색 바꿔줘"(현재파일) → modify_file',
  classifyOfflineIntent('버튼 색 바꿔줘', withFile('src/domains/main/pages/MainPage.tsx')).intent === 'modify_file');

// ─── 편집 신호 정밀도(strength) — 리졸버가 "정규식을 임베딩보다 믿을지" 판단하는 재료 ────────
// 실측 회귀(2026-08-31): "테이블에 /api/… 바인딩해줘"가 정규식 modify(weak) vs 임베딩 qna(확신)에서
// 임베딩에 밀려 행동 요청이 지식 문서(useApi 가이드) 답변으로 샜다. 모호 동사라도 **요청 형태**가
// 확실하면(명령형 어미·정확한 API 경로) 약한 추측이 아니다.
{
  const cur = withFile('src/domains/dashboard/pages/Dashboard.tsx');
  const bind = classifyOfflineIntent('테이블에 /api/courses/:courseId/lessons 바인딩해줘', cur);
  check('"테이블에 /api/… 바인딩해줘" → modify_file', bind.intent === 'modify_file', `got ${bind.intent}`);
  check('"…바인딩해줘" → strong(임베딩 qna 오분류를 이긴다)', bind.strength === 'strong', `got ${bind.strength}`);

  check('명령형 어미만 있어도 strong ("이 테이블에 API 연동해줘")',
    classifyOfflineIntent('이 테이블에 API 연동해줘', cur).strength === 'strong');
  check('정확한 API 경로만 있어도 strong ("테이블에 /api/employees 연결")',
    classifyOfflineIntent('테이블에 /api/employees 연결', cur).strength === 'strong');

  // 질문 신호가 섞이면 양보한다 — Q&A는 직행(오답 비용 0)이 원칙.
  const howto = classifyOfflineIntent('/api/employees 어떻게 연결해?', cur);
  check('"…어떻게 연결해?" → weak(질문에 양보)', howto.strength === 'weak', `got ${howto.strength}`);
  check('모호 동사만 있으면 종전대로 weak ("이 부분 적용")',
    classifyOfflineIntent('이 부분 적용', cur).strength === 'weak');
  check('고정밀 편집 동사는 종전대로 strong ("버튼 색 바꿔줘")',
    classifyOfflineIntent('버튼 색 바꿔줘', cur).strength === 'strong');
}

// ─── 코드 요소 "만들기"는 페이지 생성이 아니다(온라인 create_page 오분류 버그 대응) ───────────
// 버그: LLM 분류기가 "getArr 함수를 하나 만들고…"를 '만들'만 보고 create_page로 오분류 → 영문명 되묻기 루프.
// (a) 결정론 PageCreationDetector = 온라인 충돌 안전 가드의 결정론 arm — 페이지/화면 신호 없으면 false.
{
  const pcd = new PageCreationDetector();
  const q = '현재 페이지에 getArr 함수를 하나 만들고 직원 정보를 보여주는 객체를 담고있는 배열을 return하게 처리해줘';
  check('가드 arm: "getArr 함수 만들기" → PageCreationDetector 비발동(false)', !pcd.detect(q).isPageCreation);
  check('가드 arm: 페이지/화면 명시("상품 목록 화면 만들어줘") → 여전히 발동(true)',
    pcd.detect('상품 목록 화면 만들어줘').isPageCreation);
  check('가드 arm: "XxxPage 만들어줘" → 여전히 발동(true)', pcd.detect('LoginPage 만들어줘').isPageCreation);
  // (b) 오프라인 경로는 이미 올바름(회귀 가드) — '만들'은 편집/생성 동사라 파일 열림 시 modify_file.
  check('오프라인: "getArr 함수 만들기"(현재파일) → modify_file',
    classifyOfflineIntent(q, withFile('src/domains/employee/pages/EmployeeListPage.tsx')).intent === 'modify_file');
}

// 온라인 분류 프롬프트(buildIntentPrompt)가 코드-요소 만들기=modify 지침·예시를 담는지(프롬프트 회귀 가드).
{
  const p = buildIntentPrompt('getArr 함수를 하나 만들어줘', withFile('src/domains/employee/pages/EmployeeListPage.tsx'));
  check('buildIntentPrompt: "코드 요소를 만들/추가" = modify 지침 포함',
    p.includes('코드 요소를') && p.includes('페이지/화면이 아니면 create_page가 아'));
  check('buildIntentPrompt: getArr 함수 예시(modify_file) 포함',
    p.includes('getArr 함수를 하나 만들고') && p.includes('그 파일에 함수 추가'));
}

// 경로 추출 유틸
check('extractFilePathRef — 선행 슬래시 제거',
  extractFilePathRef('/src/a/B.tsx 적용') === 'src/a/B.tsx');
check('extractFilePathRef — 경로 없음 → null', extractFilePathRef('그냥 텍스트') === null);

// 경로 제거(키워드 라우팅 오염 차단)
{
  const cleaned = stripFileRefs('현재 화면의 jsx 부분을 /src/publishing/employee/pages/EmployeeListPage.tsx 파일의 jsx로 적용해줘');
  check('stripFileRefs — 경로 토큰 제거', !/EmployeeListPage|\.tsx|pages/.test(cleaned), cleaned);
  check('stripFileRefs — 의도 단어 보존', cleaned.includes('적용') && cleaned.includes('화면'), cleaned);
}

console.log('\nOfflineResponder.respond:');

// RAG 본문이 그룹 템플릿에 주입되는지 (deps 주입으로 vscode/디스크 불필요)
let lastRagQuery = '';
let lastRagContent = '';
let lastRagIntent = '';
const responder = new OfflineResponder({
  retrieveDocs: async (q, intent, content) => {
    lastRagQuery = q;
    lastRagIntent = intent.intent;
    lastRagContent = content;
    return q.includes('useApi') ? ['## useApi 훅\n로컬 지식 본문'] : [];
  },
  loadGroupTemplate: () => null, // 내장 기본 템플릿 사용
});

await (async () => {
  const qna = await responder.respond({ query: 'useApi 사용법 알려줘', currentFile: null, currentFileContent: '' });
  check('qna 응답에 RAG 본문 포함', qna.includes('로컬 지식 본문'), qna);
  check('qna 응답에 지식 헤딩 포함', qna.includes('관련 scaffold 지식'), qna);
  check('qna 응답에 오프라인 배지 포함', qna.includes('오프라인 모드'), qna);
  check('qna 응답에 useState 튜토리얼 없음(회귀)', !/useState\s*</.test(qna));
  check('retrieveDocs에 확정 intent 전달(qna 스레딩)', lastRagIntent === 'qna', lastRagIntent);

  // RAG가 비면 지식 섹션 자체를 생략(엉뚱한 저관련 문서 노출 방지)
  const ragless = await responder.respond({ query: '무언가 설명해줘', currentFile: null, currentFileContent: '' });
  check('RAG 비면 지식 헤딩 생략', !ragless.includes('관련 scaffold 지식'), ragless);

  // 캡처 회귀: 경로가 박힌 modify 요청 — RAG 쿼리에서 경로 토큰이 제거되고 파일 내용이 전달되는지
  const captured = await responder.respond({
    query: '현재 화면의 jsx 부분을 /src/publishing/employee/pages/EmployeeListPage.tsx 파일의 jsx로 적용해줘',
    currentFile: 'src/domains/employee/pages/EmployeeListPage.tsx',
    currentFileContent: `import { useApi } from '@axiom/hooks';`,
  });
  check('캡처: RAG 쿼리에 경로 토큰 없음(page-generation 오염 차단)',
    !/EmployeeListPage|\.tsx|pages/.test(lastRagQuery), lastRagQuery);
  check('캡처: RAG에 현재 파일 내용 전달', lastRagContent.includes('useApi'), lastRagContent);
  check('캡처: useApi 계약 카드(deps 발동)', captured.includes('refetch'), captured);
  check('캡처: 무관 RAG(tokens/lottie 등) 없음 — 지식 헤딩 생략', !captured.includes('관련 scaffold 지식'), captured);
  check('캡처: list-table 레시피 오발동 없음("list" 경로 토큰 제거)',
    !captured.includes('list API 적용'), captured);
  check('캡처: 의도 라인 중복 없음(응답 본문에 🧭 없음 — 호출부가 1회 출력)', !captured.includes('🧭'), captured);

  const modify = await responder.respond({
    query: '현재 화면에 useApi로 목록 적용해줘',
    currentFile: 'src/domains/employee/pages/EmployeeListPage.tsx',
    currentFileContent: 'const x = 1;',
  });
  check('modify 응답에 useApi 계약 카드 포함', modify.includes('useApi'), modify);
  check('modify 응답에 미치환 placeholder 없음', !/\{\{[a-z_]+\}\}/i.test(modify), modify);

  const small = await responder.respond({ query: '안녕', currentFile: null, currentFileContent: '' });
  check('smalltalk 응답은 친근(에러창 아님)', small.includes('안녕하세요'), small);
})();

console.log('\nfillSlots (슬롯 추출 분리):');
{
  const cur = { currentFile: 'src/domains/x/pages/XPage.tsx', hasSelection: false, domains: [] };
  const m = fillSlots('현재 화면을 /src/a/B.tsx 내용으로 적용', cur, 'modify_file');
  check('fillSlots modify_file → targetFile=current', m.targetFile === 'current');
  check('fillSlots modify_file → contentSource 추출', m.contentSource === 'src/a/B.tsx', m.contentSource ?? 'null');
  const c = fillSlots('CatalogListPage 만들어줘', { currentFile: null, hasSelection: false, domains: [] }, 'create_page');
  check('fillSlots create_page → pageName', c.pageName === 'CatalogListPage', c.pageName ?? 'null');
  const s = fillSlots('안녕', { currentFile: null, hasSelection: false, domains: [] }, 'smalltalk');
  check('fillSlots smalltalk → 슬롯 전부 null', !s.contentSource && !s.targetFile && !s.domain);
}

// 분류기는 이제 학습된 선형 헤드(IntentLinearHead)를 기본으로 쓴다. 단, fakeEmbed는 **의미 없는
// 해싱 bag-of-words**라 헤드의 결정경계가 실제 임베딩과 다르게 형성된다 — 어휘가 또렷이 겹치는
// 케이스(modify/qna/create)는 fakeEmbed로도 맞지만, 짧은 인사("고마워요 잘됐어")처럼 어휘 신호가
// 약한 입력은 fakeEmbed에선 선형 분리가 안 될 수 있다(1-NN은 자기 자신과 코사인 1.0이라 통과했었음).
// 짧은 인사의 **실제** 라우팅은 실임베딩을 쓰는 eval:intent(롱테일 smalltalk)가 가드한다.
console.log('\nIntentEmbeddingClassifier (가짜 임베딩 + 실제 코퍼스 — 선형 헤드):');
await (async () => {
  const intentsDir = path.resolve('intents');
  const store = new IntentExampleStore(intentsDir, null, fakeEmbed);
  const clf = new IntentEmbeddingClassifier(store, fakeEmbed);

  const ready = await store.ensureReady();
  check('코퍼스 예시 로드+임베딩 성공', ready && store.examples().length > 40, `examples=${store.examples().length}`);

  const cap = await clf.classify('현재 화면의 jsx 부분을 /src/publishing/employee/pages/EmployeeListPage.tsx 파일의 jsx로 적용해줘');
  check('캡처 프롬프트 → modify_file (헤드)', cap?.intent === 'modify_file', `${cap?.intent} conf=${cap?.confidence.toFixed(2)}`);

  const q = await clf.classify('useApi 사용법 알려줘');
  check('"useApi 사용법" → qna (헤드)', q?.intent === 'qna', `${q?.intent}`);

  const cp = await clf.classify('상품 목록 화면 만들어줘');
  check('"상품 목록 화면 만들어줘" → create_page (헤드)', cp?.intent === 'create_page', `${cp?.intent}`);

  // fakeEmbed 한계로 의도 단정 대신 스모크(헤드가 ranked 결과를 정상 반환)만 본다. 실 smalltalk는 eval:intent가 가드.
  const st = await clf.classify('고마워요 잘됐어');
  check('짧은 인사 → 헤드가 유효 결과 반환(스모크)', !!st && st.ranked.length >= 2, `${st?.intent}`);
})();

console.log('\nresolveOfflineIntent (게이팅 3경로 — 분류 스텁):');
await (async () => {
  const ctx = { currentFile: 'src/domains/x/pages/XPage.tsx', hasSelection: false, domains: [] };
  const cfg = { enabled: true, minConfidence: 0.42, minMargin: 0.05 };

  // confident → 임베딩 의도 채택
  const confident = await resolveOfflineIntent('이 화면 표에 목록 붙여줘', ctx, {
    classify: async () => ({ intent: 'modify_file', confidence: 0.8, margin: 0.3, ranked: [{ intent: 'modify_file', score: 0.8 }, { intent: 'qna', score: 0.5 }] }),
  }, cfg);
  check('confident → uncertain=false, source=embedding', !confident.uncertain && confident.source === 'embedding');
  check('confident → intent=modify_file', confident.result.intent === 'modify_file');

  // low-confidence이지만 정규식과 합의 → 채택(되묻기 X)
  const agree = await resolveOfflineIntent('버튼 색 바꿔줘', ctx, {
    classify: async () => ({ intent: 'modify_file', confidence: 0.3, margin: 0.02, ranked: [{ intent: 'modify_file', score: 0.3 }, { intent: 'qna', score: 0.28 }] }),
  }, cfg);
  check('저신뢰+정규식 합의 → uncertain=false', !agree.uncertain, JSON.stringify(agree.candidates));

  // low-confidence이고 정규식과 불일치 → 되묻기
  const ask = await resolveOfflineIntent('직원 화면', ctx, {
    classify: async () => ({ intent: 'create_page', confidence: 0.3, margin: 0.02, ranked: [{ intent: 'create_page', score: 0.3 }, { intent: 'qna', score: 0.28 }] }),
  }, cfg);
  check('저신뢰+불일치 → uncertain=true', ask.uncertain);
  check('되묻기 후보 2개 이상', ask.candidates.length >= 2, JSON.stringify(ask.candidates));

  // 확신 smalltalk인데 정규식은 실행형(qna) → 단정 말고 되묻기(약한 임베딩이 짧은 기술 질문을
  // 잡담으로 오인한 정황: "api 호출 방법" 회귀). 후보에 정규식 의도(qna)+smalltalk 포함.
  const smalltalkVsQna = await resolveOfflineIntent('api 호출 방법', { ...ctx, currentFile: null }, {
    classify: async () => ({ intent: 'smalltalk', confidence: 0.69, margin: 0.06, ranked: [{ intent: 'smalltalk', score: 0.69 }, { intent: 'qna', score: 0.63 }] }),
  }, cfg);
  check('확신 smalltalk + 정규식 qna → uncertain=true', smalltalkVsQna.uncertain, JSON.stringify(smalltalkVsQna));
  check('되묻기 종류=smalltalk-vs-actionable', smalltalkVsQna.clarifyKind === 'smalltalk-vs-actionable', smalltalkVsQna.clarifyKind ?? 'undef');
  check('되묻기 후보=[qna, smalltalk]',
    smalltalkVsQna.candidates[0] === 'qna' && smalltalkVsQna.candidates.includes('smalltalk'),
    JSON.stringify(smalltalkVsQna.candidates));

  // 진짜 인사("안녕")는 정규식도 smalltalk → 되묻지 않고 종전대로 잡담 응답(오발동 가드).
  const realGreeting = await resolveOfflineIntent('안녕', { ...ctx, currentFile: null }, {
    classify: async () => ({ intent: 'smalltalk', confidence: 0.8, margin: 0.3, ranked: [{ intent: 'smalltalk', score: 0.8 }, { intent: 'qna', score: 0.5 }] }),
  }, cfg);
  check('확신 smalltalk + 정규식 smalltalk → 되묻지 않음',
    !realGreeting.uncertain && realGreeting.result.intent === 'smalltalk', JSON.stringify(realGreeting));

  // 확신 임베딩이 create_page지만 (현재파일 열림 + modify가 근소 2순위) → 정규식 modify 신뢰.
  // (실패 사례 재현: "현재 페이지 내용을 …파일로 적용", create 0.62 / modify 0.57)
  const createVsModify = await resolveOfflineIntent('현재 페이지 내용을 다른 파일로 적용해줘', ctx, {
    classify: async () => ({ intent: 'create_page', confidence: 0.62, margin: 0.05, ranked: [{ intent: 'create_page', score: 0.62 }, { intent: 'modify_file', score: 0.57 }] }),
  }, cfg);
  check('확신 create_page + 현재파일 + modify 근소2순위 → modify_file(정규식)',
    !createVsModify.uncertain && createVsModify.result.intent === 'modify_file' && createVsModify.source === 'regex',
    `${createVsModify.result.intent}/${createVsModify.source}`);

  // 단, 현재 파일이 없으면(빈 캔버스 생성 맥락) 깔끔한 create_page 확신은 그대로 존중(영어 생성문 회귀).
  const cleanCreate = await resolveOfflineIntent('make a new analytics dashboard page', { ...ctx, currentFile: null }, {
    classify: async () => ({ intent: 'create_page', confidence: 0.61, margin: 0.21, ranked: [{ intent: 'create_page', score: 0.61 }, { intent: 'modify_file', score: 0.40 }] }),
  }, cfg);
  check('확신 create_page + 현재파일 없음 → create_page 유지',
    !cleanCreate.uncertain && cleanCreate.result.intent === 'create_page',
    `${cleanCreate.result.intent}/${cleanCreate.source}`);

  // 분류기 null(임베딩 불가) → 정규식 폴백
  const fb = await resolveOfflineIntent('useApi 사용법 알려줘', ctx, { classify: async () => null }, cfg);
  check('분류기 null → source=regex 폴백', fb.source === 'regex' && !fb.uncertain);

  // enabled=false → 정규식 경로(회귀 0)
  const off = await resolveOfflineIntent('버튼 바꿔줘', ctx, { classify: async () => { throw new Error('should not be called'); } }, { ...cfg, enabled: false });
  check('enabled=false → 정규식 경로', off.source === 'regex');
})();

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) process.exit(1);
