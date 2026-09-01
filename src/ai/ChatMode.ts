/**
 * 대화 모드(Chat Mode) 정책 모듈 — docs/chat-mode-plan.md §3.3의 정책 표가 곧 이 파일의 테이블이다.
 *
 * 설계 원칙(§2):
 *  - 모드는 새 파이프라인이 아니라 **기존 게이트의 프리셋**이다. 여기서는 값만 정하고,
 *    실제 분기는 ChatViewProvider / ScaffoldContextBuilder가 이 값을 읽어서 한다.
 *  - 기본 모드 `auto` = 현재 동작과 **바이트 동일**. auto 정책의 모든 키가 "종전 그대로"인 이유다.
 *  - 안전은 프롬프트 문장이 아니라 코드로 — `allowFileWrite=false`는 axiom-action 파서 진입 자체를 막는다.
 *
 * vscode 비의존 순수 모듈이다(웹뷰도 import한다 — CHAT_MODES가 UI 라벨의 단일 진실원).
 * 여기에 vscode를 import하면 웹뷰 번들이 깨진다.
 */

/**
 * 사용자가 고를 수 있는 대화 모드.
 * `ask`(설명만: scaffold는 알되 파일은 안 건드림)는 **의도적으로 보류**다 — 계획 §3.2/§8 결정 1.
 * 자동 모드의 Q&A 게이팅이 이미 그 일을 대부분 하므로, 실사용 불만이 채집되면 그때 추가한다.
 */
export type ChatMode = 'auto' | 'general';

/** 기본 모드 — 이 값에서 현재 동작이 한 톨도 달라지면 안 된다(§7 불변식 #1). */
export const DEFAULT_CHAT_MODE: ChatMode = 'auto';

/** 라우팅 결정값 — ChatViewProvider의 단일 라우터 `route`와 같은 어휘. */
export type ChatRoute = 'qna' | 'modify' | 'passthrough';

/**
 * 현재 파일 주입 정책.
 *  - `auto`: 종전대로 열린 파일을 자동 주입
 *  - `explicit-only`: 사용자가 **직접 고른** 선택 영역·`@경로` 첨부만 (§5.4 — "일반 모드는 아무것도 모른다"는 오해 방지)
 */
export type FileInjectionPolicy = 'auto' | 'explicit-only';

/** §3.3 정책 매트릭스. 키 하나 = 코드의 분기 하나. */
export interface ChatModePolicy {
  /** 의도 분류기 LLM 호출(_classifyIntent)을 도는가 */
  runIntentClassifier: boolean;
  /** 페이지 생성 인터셉트(정규식·분류기 create_page → 생성 위저드) */
  pageCreationIntercept: boolean;
  /** scaffold RAG 문서 주입 */
  injectScaffoldRag: boolean;
  /** coreRules(가드레일·상황 규칙) 주입 */
  injectCoreRules: boolean;
  /** 계약 카드(buildContractSection) 주입 */
  injectContractCards: boolean;
  /** 현재 파일 주입 범위 */
  injectCurrentFile: FileInjectionPolicy;
  /** 라우팅 고정값 — null이면 종전 자동 판정을 그대로 쓴다(판정 로직은 건드리지 않는다) */
  forceRoute: ChatRoute | null;
  /** axiom-action 파싱·파일 쓰기 허용 */
  allowFileWrite: boolean;
  /** 오프라인 행동(계획) 카드 허용 */
  allowActionCards: boolean;
  /** 오프라인 시 로컬 scaffold 지식으로 답하기 허용 (§5.6) */
  allowOfflineKnowledge: boolean;
  /** 온라인 지식 가이드(knowledge 문서 전문 렌더, LLM 생략) 허용 */
  allowOnlineKnowledgeAnswer: boolean;
  /** 전송 전 히스토리에서 코드 수정 블록을 벗겨내는가 (§5.3 — 모델이 직전 형식을 흉내내는 것 차단) */
  stripActionHistory: boolean;
}

const POLICIES: Record<ChatMode, ChatModePolicy> = {
  // 종전 동작 = 전부 켜짐. 이 열이 흔들리면 회귀다.
  auto: {
    runIntentClassifier: true,
    pageCreationIntercept: true,
    injectScaffoldRag: true,
    injectCoreRules: true,
    injectContractCards: true,
    injectCurrentFile: 'auto',
    forceRoute: null,
    allowFileWrite: true,
    allowActionCards: true,
    allowOfflineKnowledge: true,
    allowOnlineKnowledgeAnswer: true,
    stripActionHistory: false,
  },
  // 순수 LLM 대화 — 주입 0, 파일 쓰기 0, 라우팅은 passthrough 고정.
  // 오프라인 지식도 끈다: 모드 계약을 어기고 몰래 scaffold 문서를 렌더하면 안 된다(§5.6).
  general: {
    runIntentClassifier: false,
    pageCreationIntercept: false,
    injectScaffoldRag: false,
    injectCoreRules: false,
    injectContractCards: false,
    injectCurrentFile: 'explicit-only',
    forceRoute: 'passthrough',
    allowFileWrite: false,
    allowActionCards: false,
    allowOfflineKnowledge: false,
    allowOnlineKnowledgeAnswer: false,
    stripActionHistory: true,
  },
};

/** 모드 → 정책. 알 수 없는 값은 기본 모드로 떨어뜨린다(설정·저장값 오염 방어). */
export function resolveModePolicy(mode: ChatMode | string | null | undefined): ChatModePolicy {
  const key: ChatMode = mode === 'general' ? 'general' : DEFAULT_CHAT_MODE;
  return POLICIES[key];
}

/** 저장값·설정값을 안전한 ChatMode로 정규화한다. */
export function normalizeChatMode(value: unknown): ChatMode {
  return value === 'general' ? 'general' : DEFAULT_CHAT_MODE;
}

/** UI 표시 정보 — 웹뷰가 이걸 import한다. 라벨을 웹뷰에 다시 적지 말 것(§6 Phase 2). */
export interface ChatModeView {
  id: ChatMode;
  /** 알약·메뉴에 쓰는 아이콘 */
  icon: string;
  /** 알약에 항상 텍스트로 보이는 이름 (§4.2 규칙 2) */
  label: string;
  /** 메뉴 행의 회색 설명 1~2줄 (§4.2 규칙 5) */
  summary: string;
}

/** 목록 순서 = Shift+Tab 순환 순서. 기본(auto)이 먼저다. */
export const CHAT_MODES: readonly ChatModeView[] = [
  {
    id: 'auto',
    icon: '🧭',
    label: '자동',
    summary: '요청을 보고 알아서 판단합니다 — scaffold 규약도 쓰고 파일도 고칩니다',
  },
  {
    id: 'general',
    icon: '💬',
    label: '그냥 묻기',
    summary: '이 프로젝트 규약 없이 일반 AI처럼 답합니다 (파일은 고치지 않습니다)',
  },
];

/** 모드의 표시 정보. */
export function chatModeView(mode: ChatMode): ChatModeView {
  return CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];
}

/** Shift+Tab 순환 — 다음 모드(§4.5). 목록 끝에서 처음으로 돈다. */
export function nextChatMode(mode: ChatMode): ChatMode {
  const i = CHAT_MODES.findIndex((m) => m.id === mode);
  return CHAT_MODES[(i + 1) % CHAT_MODES.length].id;
}

/**
 * 받침을 보고 '로/으로'를 고른다 — "자동로 전환"은 한국어가 아니다.
 * 한글 음절의 종성이 없거나 ㄹ이면 '로', 그 외에는 '으로'. 한글이 아니면 '로'(외래어 관례).
 */
function withRoParticle(label: string): string {
  const last = label.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${label}로`;
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${label}로` : `${label}으로`;
}

/** 모드가 바뀐 지점에 남기는 한 줄(§4.3). */
export function chatModeSwitchNotice(mode: ChatMode): string {
  const view = chatModeView(mode);
  return `${view.icon} ${withRoParticle(view.label)} 전환`;
}

/** general 모드에서 입력창 하단에 띄우는 한 줄 안내(§4.2). */
export function chatModeHint(mode: ChatMode): string | null {
  return mode === 'general'
    ? '💬 그냥 묻기 — 규약·파일 컨텍스트 없이 답합니다 · 파일 수정 꺼짐'
    : null;
}

/**
 * 전환 제안(강)을 띄울지 — "모드 때문에 못 하는 요청"인지 판정한다(§5.5).
 *
 * 판정기를 새로 만들지 않는다: 호출부가 기존 단일 라우터 결과(autoRoute)·PageCreationDetector·
 * IntentSignals를 그대로 넘긴다. 여기서는 **조합 규칙**만 고정한다.
 *
 * autoRoute==='modify' 하나만 보면 안 된다 — 그 판정은 "도메인 파일이 열려 있고 질문형이 아니면
 * 수정"이라, general 모드에서 짧은 명사구("리액트 훅 예제")까지 가로채 답을 막는다. 그건 이 설계가
 * 금지한 '가두기'다. 그래서 **명시적 편집·생성 신호를 함께** 요구한다(페이지 생성은 그 자체가 명시적).
 */
export function shouldSuggestAutoMode(
  policy: ChatModePolicy,
  signals: { autoRoute: ChatRoute; explicitEdit: boolean; pageCreation: boolean },
): boolean {
  if (policy.allowFileWrite) return false; // 이미 할 수 있는 모드면 제안할 일이 없다
  return signals.pageCreation || (signals.autoRoute === 'modify' && signals.explicitEdit);
}

export interface GeneralPromptInput {
  /** 사용자가 **직접 고른** 선택 영역 텍스트(있을 때만). 파일 전문은 넣지 않는다(§5.4). */
  selectedText?: string;
  /** 선택 영역이 속한 파일 경로 — 어느 코드인지 한 줄로 알려주기 위함. */
  selectionPath?: string;
  /** 선택 영역의 언어 식별자(코드펜스용). */
  selectionLanguage?: string;
}

/**
 * general 모드의 시스템 프롬프트 — **아주 짧은 한 문단**.
 * 계획의 측정 가능한 완료 기준: 고정 지시문 1,500자 미만(§3.3).
 * (선택 영역은 사용자가 직접 넣은 것이므로 이 예산 밖이다.)
 */
export function buildGeneralSystemPrompt(input: GeneralPromptInput = {}): string {
  const base = [
    '당신은 사용자의 개발을 돕는 AI 어시스턴트입니다.',
    '',
    '- 한국어로 답합니다. 사용자가 다른 언어로 물으면 그 언어로 답합니다.',
    '- 코드는 언어를 명시한 마크다운 코드블록으로 보여줍니다.',
    '- 모르는 것은 지어내지 말고 모른다고 말합니다.',
    '- 이 대화에서는 프로젝트 파일을 직접 수정하지 않습니다. 필요한 변경은 코드블록으로 제안만 합니다.',
  ].join('\n');

  const sel = (input.selectedText ?? '').trim();
  if (!sel) return base;

  const where = input.selectionPath ? ` (${input.selectionPath})` : '';
  const lang = input.selectionLanguage ?? '';
  return `${base}\n\n## 사용자가 선택한 코드${where}\n\`\`\`${lang}\n${sel}\n\`\`\``;
}

/**
 * general 턴을 보낼 때 히스토리에서 코드 수정 블록을 벗겨낸다(§5.3 — 실사고 위험 지점).
 *
 * 모드를 바꿔도 `_history`에는 직전 scaffold 턴의 `<axiom-action>`·`<search>/<replace>`가 남는다.
 * 약한 모델은 **직전 형식을 흉내내므로** 일반 모드 답변에 axiom-action이 튀어나온다.
 * 대화 자체는 이어간다 — 문맥은 살리고 형식만 지운다. (파서를 끄는 것과 **둘 다** 한다.)
 */
export function stripActionBlocks(content: string): string {
  const NOTE = '_(이전 턴의 코드 수정 블록 생략)_';
  let out = content
    // 완결된 블록
    .replace(/<axiom-action>[\s\S]*?<\/axiom-action>/g, NOTE)
    // 응답이 잘려 닫는 태그가 없는 경우 — 끝까지 벗긴다
    .replace(/<axiom-action>[\s\S]*$/g, NOTE)
    // 블록 밖으로 새어 나온 patch 조각(방어적)
    .replace(/<search>[\s\S]*?<\/replace>/g, NOTE)
    .replace(/<\/?(?:search|replace)>/g, '');
  // 연속된 생략 표식은 하나로
  out = out.replace(new RegExp(`(?:${NOTE}\s*){2,}`, 'g'), `${NOTE}\n`);
  return out.trim();
}

/** 히스토리 전체에 stripActionBlocks를 적용한다(빈 메시지가 되면 버린다). */
export function stripHistoryForGeneral<T extends { role: string; content: string }>(history: T[]): T[] {
  return history
    .map((m) => (m.role === 'assistant' ? { ...m, content: stripActionBlocks(m.content) } : m))
    .filter((m) => m.content.trim().length > 0);
}
