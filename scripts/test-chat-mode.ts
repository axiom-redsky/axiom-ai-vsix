/**
 * 대화 모드 Phase 0 테스트 — 정책 테이블·general 프롬프트·히스토리 스트립 검증.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/chat-mode-plan.md §6 Phase 0.
 */
import {
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  buildGeneralSystemPrompt,
  chatModeHint,
  chatModeSwitchNotice,
  chatModeView,
  nextChatMode,
  normalizeChatMode,
  resolveModePolicy,
  shouldSuggestAutoMode,
  stripActionBlocks,
  stripHistoryForGeneral,
  type ChatModePolicy,
} from '../src/ai/ChatMode';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} — got ${JSON.stringify(actual)}`);
}

// ═══ A. auto 정책 = 종전 동작 앵커 ══════════════════════════════════════════
// 이 표가 흔들리면 정책 게이트가 auto 경로에 새어 들어간 것이다(§7 불변식 #1).
console.log('\n── A. auto 정책(회귀 앵커) ──');
{
  const expected: ChatModePolicy = {
    runIntentClassifier: true,
    pageCreationIntercept: true,
    injectScaffoldRag: true,
    injectCoreRules: true,
    injectContractCards: true,
    injectCurrentFile: 'auto',
    forceRoute: null,
    allowFileWrite: true,
    allowActionCards: true,
    allowOnlineKnowledgeAnswer: true,
    allowOfflineKnowledge: true,
    stripActionHistory: false,
  };
  const actual = resolveModePolicy('auto');
  // 키 단위로 비교 — 어느 키가 흔들렸는지 이름으로 보이게 한다.
  for (const key of Object.keys(expected) as Array<keyof ChatModePolicy>) {
    eq(actual[key], expected[key], `A: auto.${key}`);
  }
  eq(DEFAULT_CHAT_MODE, 'auto', 'A: 기본 모드는 auto');
}

// ═══ B. general 정책 = 주입 0 · 쓰기 0 ══════════════════════════════════════
console.log('\n── B. general 정책 ──');
{
  const p = resolveModePolicy('general');
  const mustBeFalse: Array<keyof ChatModePolicy> = [
    'runIntentClassifier',
    'pageCreationIntercept',
    'injectScaffoldRag',
    'injectCoreRules',
    'injectContractCards',
    'allowFileWrite',
    'allowActionCards',
    'allowOfflineKnowledge',
    'allowOnlineKnowledgeAnswer',
  ];
  for (const key of mustBeFalse) ok(p[key] === false, `B: general.${key} = false`);
  eq(p.forceRoute, 'passthrough', 'B: general.forceRoute');
  // 히스토리에 남은 직전 턴의 axiom-action을 모델이 흉내내는 것을 막는다(§5.3)
  ok(p.stripActionHistory === true, 'B: general.stripActionHistory = true');
  // 사용자가 직접 고른 선택 영역만 살린다(§5.4) — 파일 전문 자동 주입은 끈다.
  eq(p.injectCurrentFile, 'explicit-only', 'B: general.injectCurrentFile');
}

// ═══ C. 정규화 — 저장값 오염 방어 ═══════════════════════════════════════════
console.log('\n── C. 정규화 ──');
{
  eq(normalizeChatMode('general'), 'general', 'C1: general');
  eq(normalizeChatMode('auto'), 'auto', 'C2: auto');
  eq(normalizeChatMode('ask'), 'auto', 'C3: 미지원 모드(ask 보류) → auto');
  eq(normalizeChatMode(undefined), 'auto', 'C4: undefined → auto');
  eq(normalizeChatMode(42), 'auto', 'C5: 잘못된 타입 → auto');
  // 오염된 값이 들어와도 정책은 auto와 동일해야 한다(조용한 권한 상승·차단 방지)
  eq(resolveModePolicy('무엇'), resolveModePolicy('auto'), 'C6: 미지의 값 → auto 정책');
}

// ═══ D. UI 라벨 단일 진실원 ═════════════════════════════════════════════════
console.log('\n── D. CHAT_MODES ──');
{
  eq(CHAT_MODES.map((m) => m.id), ['auto', 'general'], 'D1: 2개 모드(§8 결정 1)');
  ok(
    CHAT_MODES.every((m) => m.icon.length > 0 && m.label.length > 0 && m.summary.length > 0),
    'D2: 모든 행에 아이콘·이름·설명',
  );
  eq(chatModeView('general').label, '그냥 묻기', 'D3: 표시 이름은 사용자 언어(§8 결정 4)');
  // Shift+Tab 순환은 목록을 한 바퀴 돈다(§4.5)
  eq(nextChatMode('auto'), 'general', 'D4: 순환 auto→general');
  eq(nextChatMode('general'), 'auto', 'D5: 순환 general→auto');
  // 기본 모드는 하단 안내를 바꾸지 않는다(§4.2 — 기본값에 잉크를 쓰지 않는다)
  eq(chatModeHint('auto'), null, 'D6: auto는 안내문 교체 없음');
  ok((chatModeHint('general') ?? '').includes('파일 수정 꺼짐'), 'D7: general 안내에 파일 수정 꺼짐 명시');
  // 전환 한 줄의 조사 — 받침 있는 '자동'은 '으로', 없는 '묻기'는 '로' (F5에서 발견된 실제 오류)
  ok(chatModeSwitchNotice('auto').includes('자동으로 전환'), 'D8: 자동 → 으로');
  ok(chatModeSwitchNotice('general').includes('그냥 묻기로 전환'), 'D9: 그냥 묻기 → 로');
}

// ═══ E0. 전환 제안 판정 (§5.5 — 가두지 않기) ═══════════════════════════════
console.log('\n── E0. shouldSuggestAutoMode ──');
{
  const g = resolveModePolicy('general');
  const a = resolveModePolicy('auto');
  ok(!shouldSuggestAutoMode(a, { autoRoute: 'modify', explicitEdit: true, pageCreation: true }),
    'E0-1: 자동 모드에선 제안하지 않는다(이미 할 수 있다)');
  ok(shouldSuggestAutoMode(g, { autoRoute: 'modify', explicitEdit: true, pageCreation: false }),
    'E0-2: general + 수정 라우트 + 명시 신호 → 제안');
  ok(shouldSuggestAutoMode(g, { autoRoute: 'passthrough', explicitEdit: false, pageCreation: true }),
    'E0-3: 페이지 생성은 그 자체로 명시적');
  // 여기가 핵심 — 파일이 열려 있다는 이유로 일반 질문을 가로채면 안 된다
  ok(!shouldSuggestAutoMode(g, { autoRoute: 'modify', explicitEdit: false, pageCreation: false }),
    'E0-4: 명시 신호 없는 modify 판정만으로는 가두지 않는다');
  ok(!shouldSuggestAutoMode(g, { autoRoute: 'qna', explicitEdit: false, pageCreation: false }),
    'E0-5: 질문은 그대로 답한다');
}

// ═══ E. general 시스템 프롬프트 ═════════════════════════════════════════════
console.log('\n── E. buildGeneralSystemPrompt ──');
{
  const p = buildGeneralSystemPrompt();
  ok(p.length < 1500, `E1: 고정 지시문 1,500자 미만 — ${p.length}자`);
  // scaffold 어휘가 한 톨도 새면 안 된다(모드 계약)
  ok(!/scaffold|axiom-action|useApi|@axiom|domains\//i.test(p), 'E2: scaffold 규약 어휘 없음');
  ok(p.includes('한국어'), 'E3: 답변 언어 규칙 포함');
  ok(/코드블록/.test(p), 'E4: 코드블록 규칙 포함');

  // 선택 영역은 사용자가 직접 넣은 것 — 살린다(§5.4)
  const withSel = buildGeneralSystemPrompt({
    selectedText: 'const a = 1;',
    selectionPath: 'src/foo.ts',
    selectionLanguage: 'ts',
  });
  ok(withSel.includes('const a = 1;'), 'E5: 선택 영역 포함');
  ok(withSel.includes('src/foo.ts'), 'E6: 선택 파일 경로 표시');
  ok(withSel.startsWith(p), 'E7: 고정 지시문 위에 덧붙임');
  // 공백만 있는 선택은 섹션을 만들지 않는다
  eq(buildGeneralSystemPrompt({ selectedText: '   \n ' }), p, 'E8: 빈 선택은 무시');
}

// ═══ F. 히스토리 스트립 (§5.3 실사고 위험 지점) ═════════════════════════════
console.log('\n── F. stripActionBlocks ──');
{
  const withAction = '설명입니다.\n<axiom-action>\nfilePath: a.tsx\n</axiom-action>\n끝.';
  const s = stripActionBlocks(withAction);
  ok(!s.includes('axiom-action'), 'F1: 완결 블록 제거');
  ok(s.includes('설명입니다.') && s.includes('끝.'), 'F2: 산문 문맥은 보존');

  // 응답이 잘려 닫는 태그가 없는 경우 — 여기가 진짜 위험(모델이 흉내낸다)
  const truncated = '앞말\n<axiom-action>\n<search>foo</search>';
  ok(!stripActionBlocks(truncated).includes('<axiom-action>'), 'F3: 미완결 블록도 끝까지 제거');
  ok(stripActionBlocks(truncated).includes('앞말'), 'F4: 미완결 앞 문맥 보존');

  // 블록 밖으로 샌 patch 조각
  const stray = '이렇게 바꿉니다.\n<search>a</search>\n<replace>b</replace>';
  const s2 = stripActionBlocks(stray);
  ok(!/<\/?(search|replace)>/.test(s2), 'F5: 떠도는 patch 태그 제거');

  // 원래 깨끗한 답변은 손대지 않는다
  const clean = '클로저는 함수와 렉시컬 환경의 조합입니다.';
  eq(stripActionBlocks(clean), clean, 'F6: 일반 답변은 무변경');

  // 사용자 발화는 건드리지 않는다 — 사람이 붙여넣은 코드까지 지우면 안 된다
  const hist = [
    { role: 'user', content: '이 <axiom-action> 태그가 뭐야?' },
    { role: 'assistant', content: '답변\n<axiom-action>x</axiom-action>' },
    { role: 'assistant', content: '<axiom-action>only</axiom-action>' },
  ];
  const out = stripHistoryForGeneral(hist);
  ok(out[0].content.includes('<axiom-action>'), 'F7: user 메시지는 원문 유지');
  ok(!out[1].content.includes('<axiom-action>'), 'F8: assistant 메시지만 스트립');
  eq(out.length, 3, 'F9: 표식만 남은 메시지도 문맥으로 유지');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
