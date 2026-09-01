# 대화 모드 전환 (Chat Mode) — 설계 계획

> 상태: **Phase 0~3 구현 완료 (2026-09-01)** — Phase 2까지 F5 검증 통과, Phase 3은 F5 검증 대기.
> 작성: 2026-09-01
> 관련 문서: [offline-action-cards-plan.md](offline-action-cards-plan.md) · [page-creation-intent-routing-plan.md](page-creation-intent-routing-plan.md) · [unified-settings-plan.md](unified-settings-plan.md)
> 관련 메모리: [qna-gating-consistency], [intent-routing-redesign], [prefer-intent-over-blocking], [offline-intent-responder], [online-knowledge-answer]

---

## ▶ RESUME — 맥락 없이 이어서 하기

> 이 절만 읽으면 다른 PC·다른 세션에서도 이어서 작업할 수 있게 쓴다.
> **이 문서가 이 트랙의 유일한 진실원**이다. 이어서 작업한 뒤에는 이 절도 함께 갱신할 것.

### 지금 어디까지 왔나
**Phase 0·1·2 완료 + F5 수동 검증 통과**(§6 Phase 2 완료 기준 7항목 전부).
실측: general 턴 시스템 프롬프트 **188자**(규칙·RAG·현재파일·도메인 전부 0, scaffold 문서 미주입).

F5에서 발견해 고친 것 2건:
- 전환 한 줄의 조사 오류 — "자동로 전환" → **"자동으로 전환"**. 받침 유무로 로/으로를 고르는
  `withRoParticle`을 ChatMode에 두고 테스트로 고정(D8·D9).
- `Shift+Tab` 연타가 구분선을 쌓아 대화를 덮었다 → **연속 전환은 마지막 한 줄만** 남긴다.

- Phase 0: `src/ai/ChatMode.ts` 신설(정책 표·CHAT_MODES·general 프롬프트·히스토리 스트립) + `npm run test:chat-mode` 55건
- Phase 1: 게이트 ①②③④⑥ policy 배선 · `forceRoute` · `buildSystemPrompt` general 조기 분기 ·
  `_handleAxiomAction` 진입 차단 · 히스토리 스트립 · `workspaceState` 기억 · 출력 채널 `[모드]` 로그
- §7 무회귀 전량 green(typecheck·compile·region-edit 243·offline-intent 73·offline-answer 70·
  knowledge-routing 80·action-cards 235·api-binding 75·chat-mode 55·eval:region exit 0)

**계획에서 벗어난 것 2건**(의도한 것, 아래 §3.3·§6에 반영해 둠):
1. 정책 키를 하나 늘렸다 — `stripActionHistory`(§5.3의 히스토리 스트립을 모드별 정책으로 표현).
   provider가 `this._chatMode === 'general'`을 직접 보지 않게 하려는 것(정책 단일 진실원 유지).
2. §5.6 오프라인 × general 안내 **한 줄**을 Phase 3이 아니라 Phase 1에 넣었다.
   ④를 그냥 건너뛰면 죽은 서버로 streamChat을 때려 에러가 난다 — 대안이 "정직한 한 줄"뿐이었다.
   전환 **버튼**은 계획대로 Phase 3.

### 다음에 할 일
**Phase 3의 F5 수동 검증** — 네 가지만 눌러 보면 된다:
1. `💬 그냥 묻기`에서 "이 파일 고쳐줘" → 답 대신 카드 + `🧭 자동 모드로 전환하고 실행` 버튼 1개,
   눌렀을 때 자동 모드로 바뀌고 원문이 그대로 다시 도는가 (**Phase 3 완료 기준**)
2. `/g 클로저가 뭐야` → 그 턴만 그냥 묻기(말풍선 배지 💬), **다음 턴은 원래 모드**로 돌아오는가
3. `/mode` → 모드 메뉴가 열리는가
4. 자동 모드에서 scaffold와 무관한 질문(파일 안 열고) → 답 아래 조용한 칩
   `💬 그냥 묻기로 다시 질문`

그 다음은 **Phase 4(선택)** — `axiom-ai.chat.defaultMode` 설정 등록, 런처 설정 패널 한 줄, 도식.

> 분해 패널의 `규칙·가이드 188`은 scaffold 규칙이 아니라 **general 프롬프트 본문 자체**다
> (분해 합계 = 프롬프트 길이여야 하므로 rulesChars에 넣었다). scaffold 규칙은 실제로 0.

### 확정된 것 (2026-09-01, 사용자 지시)
- **UI 형태 = Claude Code 모드 메뉴와 동일 계열**(입력창 우하단 알약 → 위로 뜨는 모드 메뉴). §4가 확정 사양.
  → 이에 따라 `Shift+Tab` 순환도 채택(캡처의 `⇧ + tab to switch`). IME 조합 중에는 무시.

### 착수 전에 사용자에게 확인할 것 (§8에 상세)
1. 모드를 **2개(자동·그냥 묻기)** 로 낼지 **3개(＋설명만)** 로 낼지 → 문서 권고는 **2개 먼저**
2. 모드 기억 범위: 워크스페이스별 기억(권고) vs 전역 설정 vs 매번 초기화

### 개발 환경 되살리기
```
npm run compile        # esbuild (확장 + 웹뷰)
npm run typecheck      # tsc --noEmit x2 (확장 / 웹뷰)
F5 (VSCode) -> Extension Development Host 에서 채팅 패널 열기
```

---

## §1 문제 — 왜 모드가 필요한가

### 1.1 지금 구조: 모든 입력이 scaffold 파이프라인을 지난다

채팅에 무엇을 치든 [ChatViewProvider._handleMessage](../src/providers/ChatViewProvider.ts#L1653)의
같은 관문을 통과한다. "자바스크립트 클로저가 뭐야?" 한 줄도 아래를 전부 밟는다:

| 단계 | 위치 | 일반 질문일 때 하는 일 |
|---|---|---|
| ① 오프라인 계획 카드 선차단 | ChatViewProvider.ts#L1693 | 페이지 생성 신호 검사 |
| ② 의도 분류기 | ChatViewProvider.ts#L1720 | **LLM 호출 1회를 더 씀**(의도 분석) |
| ③ 페이지 생성 정규식 | ChatViewProvider.ts#L1755 | 생성 키워드 검사 |
| ④ 헬스체크 → 오프라인 지식 | ChatViewProvider.ts#L1798 | 서버 죽으면 **scaffold 문서**로 답함 |
| ⑤ route 단일 라우터 | ChatViewProvider.ts#L1831 | qna/modify/passthrough 자동 판정 |
| ⑥ 온라인 지식 가이드 | ChatViewProvider.ts#L1853 | 확신 시 **scaffold 문서 전문 렌더**(LLM 생략) |
| ⑦ 시스템 프롬프트 구성 | [ScaffoldContextBuilder.buildSystemPrompt](../src/ai/ScaffoldContextBuilder.ts#L383) | coreRules + RAG 문서 + 현재 파일 + 계약 카드 주입 |

### 1.2 그래서 실제로 나는 손해

- **토큰**: 일반 질문에도 규칙·RAG·현재 파일이 실려 나간다. 로컬 sLLM은 컨텍스트가 좁아 이게 곧 품질 손실이다.
- **지연**: 의도 분류 LLM 호출 1회가 답변 전에 선행한다(일반 질문엔 무의미).
- **답 편향**: scaffold 문서가 주입되면 약한 모델은 그 문서를 근거로 끌어와 엉뚱하게 답한다.
  ⑥ 경로는 아예 **LLM을 건너뛰고 knowledge 문서를 렌더**한다 — "리액트 훅이 뭐야"에 scaffold 문서가 나올 수 있다.
- **사고 위험**: 파일이 열려 있으면 `route='modify'`로 새어 설명만 원했는데 파일 수정 흐름을 탄다
  (메모리 [qna-gating-consistency]·[modify-to-create-leak]에 기록된 실제 사고 계열).

### 1.3 진짜 문제는 "자동 판정이 없다"가 아니라 "틀렸을 때 손잡이가 없다"

이미 암묵적 모드는 존재한다 — `isQnAGated`(Q&A) / `isFileCtx`(수정) / 오프라인 / 페이지 생성 위저드.
전부 **자동 판정**이고, 판정이 빗나갔을 때 사용자가 바로잡을 수단이 없다.
지금까지 이 트랙들의 수정은 전부 "판정기를 더 똑똑하게"였다(정규식 → 의도 분류기 → 단일 라우터).
그건 계속 가야 하지만, **사람이 직접 지정하는 길도 하나 있어야 한다.** 그게 모드다.

> 메모리 [prefer-intent-over-blocking]의 원칙과 충돌하지 않는다. 그 원칙은 "오작동을 하드 차단으로 막지 말라"였고,
> 모드는 차단이 아니라 **사용자가 명시적으로 고른 의도**다. 자동 추론을 사람의 선언이 이긴다.

---

## §2 설계 원칙

1. **모드는 새 기능이 아니라 기존 게이트의 프리셋이다.**
   새 파이프라인을 만들지 않는다. 이미 있는 `route`·`forceQnA`·`forceModify`·RAG 주입 스위치를 **강제**하는 값일 뿐이다.
2. **기본은 지금 그대로.** 기본 모드 = `auto` = 현재 동작 바이트 동일. 회귀 0이 착수 조건이다.
3. **보이지 않는 상태는 금지.** 모드는 답을 통째로 바꾸는 숨은 변수다.
   입력창에 **항상** 보이고, 보낸 메시지에도 **그때의 모드**가 배지로 남아야 한다.
   (모드 UI에서 사람들이 제일 자주 겪는 실패 = "왜 답이 이래?" → 3턴 전에 바뀐 모드 때문)
4. **가두지 않는다.** 모드가 틀린 상황이면 막고 끝내지 말고 **한 번 눌러 전환+재실행**을 준다(§5.5).
5. **안전은 프롬프트가 아니라 코드로.** "일반 모드에서 파일 수정 금지"는 프롬프트 문장이 아니라
   **axiom-action 파서를 끄는 것**으로 보장한다. 약한 모델은 문장을 어긴다.

---

## §3 모드 정의

### 3.1 두 개의 축이 있다 (그리고 하나로 접는다)

- **지식 축**: scaffold 규약·RAG 문서를 아는가? (Axiom 특화 ↔ 순수 LLM)
- **권한 축**: 파일을 쓸 수 있는가? (실행 ↔ 읽기 전용)

캡처의 Claude Code 모드 목록(Manual/Edit/Plan/Auto)은 **권한 축 하나**만 다룬다.
Axiom이 이번 요청에서 실제로 필요한 건 **지식 축**이다. 두 축을 각각 스위치로 내면
2×2 = 4가지 조합을 사용자가 조립해야 해서 어렵다 → **의미 있는 조합만 골라 한 줄 목록으로 접는다.**

### 3.2 최종 모드 (권고: 2개로 출시, 3번째는 데이터 보고)

| 값 | 표시 이름 | 한 줄 설명 | 지식 | 파일 쓰기 |
|---|---|---|---|---|
| `auto` | 🧭 **자동** (기본) | 알아서 판단 — 지금까지와 똑같이 | scaffold ON | 허용 |
| `general` | 💬 **그냥 묻기** | 이 프로젝트 규약 없이, 일반 AI처럼 | **OFF** | **차단** |
| `ask` *(보류)* | 📖 **설명만** | scaffold는 알되 파일은 안 건드림 | scaffold ON | **차단** |

> **왜 `ask`를 보류하나**: 자동 모드의 Q&A 게이팅이 이미 대부분 그 일을 한다.
> 모드는 **늘리기는 쉽고 줄이기는 어렵다** — 2개로 내고, "설명만 원했는데 파일을 건드렸다"는
> 실사용 불만이 실제로 채집되면 그때 추가한다. (§8 결정 1)

> **왜 `Scaffold 고정`을 안 만드나**: "자동인데 scaffold를 안 쓰는 경우"가 없다.
> auto와 중복되는 모드는 목록만 무겁게 한다.

### 3.3 정책 매트릭스 (구현의 진실원)

`resolveModePolicy(mode)` 가 반환할 값. **이 표가 곧 `src/ai/ChatMode.ts` 의 테이블이다.**

| 정책 키 | `auto` | `general` | `ask`(보류) | 영향 지점 |
|---|---|---|---|---|
| `runIntentClassifier` | ✅ | ❌ | ✅ | ChatViewProvider.ts#L1720 |
| `pageCreationIntercept` | ✅ | ❌ | ❌ | #L1693, #L1755 |
| `injectScaffoldRag` | ✅ | ❌ | ✅ | ScaffoldContextBuilder.ts#L400 |
| `injectCoreRules` | ✅ | ❌ | ✅ | ScaffoldContextBuilder.ts#L663 |
| `injectContractCards` | ✅ | ❌ | ❌ | ScaffoldContextBuilder.ts#L682 |
| `injectCurrentFile` | ✅ | **선택 시에만** | ✅ | fileSection |
| `forceRoute` | 없음(자동) | `'passthrough'` | `'qna'` | ChatViewProvider.ts#L1831 |
| `allowFileWrite` (axiom-action 파싱) | ✅ | ❌ | ❌ | `_handleAxiomAction` |
| `allowActionCards` | ✅ | ❌ | ❌ | #L1693 |
| `allowOfflineKnowledge` | ✅ | ❌ (§5.6) | ✅ | `_respondOfflineOrTransplant` |
| `allowOnlineKnowledgeAnswer` | ✅ | ❌ | ✅ | #L1853 |
| `stripActionHistory` *(구현 시 추가)* | ❌ | ✅ | ❌ | §5.3 · streamChat 메시지 구성 |

`general` 모드의 시스템 프롬프트 = **아주 짧은 한 문단**(사용자 언어·한국어 답변·코드블록 규칙 정도).
목표치: **시스템 프롬프트 1,500자 미만** (현재 scaffold 경로는 통상 수만 자). 이건 측정 가능한 완료 기준이다.

`general` 모드에서 **선택 영역만은 살린다** — "이 코드 뭐야?"는 일반 질문이면서 컨텍스트가 필요하다.
단 파일 전문 자동 주입은 하지 않는다(사용자가 명시적으로 고른 것만 들어간다).

---

## §4 UI 안 — **Claude Code 모드 메뉴 형태를 따른다**

> 사용자 지시(2026-09-01): "모드 UI는 클로드 캡쳐처럼 비슷하게."
> 즉 아래 4.2의 형태가 **확정 사양**이다. 구현 시 임의로 다른 모양(헤더 드롭다운·인라인 라디오 등)으로 바꾸지 말 것.

### 4.1 후보 비교 (왜 이 형태인가 — 기록)

| 안 | 형태 | 발견성 | 상태 가시성 | 전환 비용 | 구현 비용 |
|---|---|---|---|---|---|
| **A. 입력창 알약 + 위로 뜨는 모드 메뉴** ← 캡처 형태 | 입력창 우하단 알약 클릭 → 위로 패널 | 상 | **상** (현재 모드가 알약에 항상 텍스트로 보임) | 1클릭 / `Shift+Tab` | 중 |
| B. 패널 헤더 드롭다운 | 뷰 타이틀 액션 | 중 | 하 (아이콘만·현재값 표시 어려움) | 2클릭 | 중 |
| C. 슬래시 명령 전용 | `/mode general` | **하** (모르면 없는 기능) | 없음 | 타이핑 | 하 |
| D. 메시지마다 선택 | 전송 옆 토글 | 상 | 상 | 매번 | 중 |

**확정 = A(주) + C(가속기) + 메시지 배지.**
- B는 웹뷰 밖(뷰 타이틀)이라 대화와 멀고, VSCode 뷰 타이틀 액션은 **현재 값을 텍스트로 못 보여준다** → 원칙 3 위반.
- D는 매 턴 결정을 강요한다. 모드는 보통 한동안 유지된다.
- C는 단독으론 안 되지만(발견성 0) A와 함께면 숙련자 가속기로 훌륭하다.

### 4.2 화면 목업 — 캡처 대응

**평상시**: 입력창 **오른쪽 아래**, 전송 버튼 바로 왼쪽에 현재 모드 알약이 붙는다(캡처의 `⚡ Auto` 자리).
알약에는 **아이콘 + 모드 이름**이 항상 텍스트로 나온다.

```
┌──────────────────────────────────────────────────────────────┐
│ 질문을 입력하세요… (Enter: 전송 / Shift+Enter: 줄바꿈)        │
│                                                              │
│  📎  /                            ╭──────────╮   ┌─────────┐ │
│                                   │ 🧭 자동 ▾ │   │  전송 ↑ │ │
│                                   ╰──────────╯   └─────────┘ │
└──────────────────────────────────────────────────────────────┘
  Enter 전송 · Shift+Enter 줄바꿈 · /명령어   ▓▓▓▓░░░ 41% · 잔여 ~19K
```

**알약 클릭(또는 `Shift+Tab`)**: 메뉴가 알약을 기준으로 **오른쪽 정렬 + 위로** 뜬다(입력창을 가리지 않는다).
캡처와 같은 구성 — 헤더(제목 + 키 힌트) / 아이콘 + 굵은 제목 + 그 아래 회색 설명 / 현재 항목에 ✓ / 구분선 아래 관련 설정 한 줄:

```
                  ┌───────────────────────────────────────────────┐
                  │  모드                        ⇧  +  tab  전환  │
                  │                                               │
                  │  🧭   자동                                    │
                  │       요청을 보고 알아서 판단합니다 —         │
                  │       scaffold 규약도 쓰고 파일도 고칩니다    │
                  │                                               │
                  │  💬   그냥 묻기                          ✓    │
                  │       이 프로젝트 규약 없이 일반 AI처럼       │
                  │       답합니다 (파일은 고치지 않습니다)       │
                  │                                               │
                  │ ───────────────────────────────────────────── │
                  │  ⚙   기본 모드 설정                           │
                  └───────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ 질문을 입력하세요…                                            │
│  📎  /                         ╭───────────────╮  ┌─────────┐ │
│                                │ 💬 그냥 묻기 ▾│  │  전송 ↑ │ │
│                                ╰───────────────╯  └─────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**캡처에서 그대로 가져오는 규칙** (모양이 아니라 이 규칙들이 사양이다):

| # | 규칙 | 왜 |
|---|---|---|
| 1 | 트리거는 **입력창 안 우하단 알약**, 전송 버튼 왼쪽 | 캡처와 동일 위치. 시선이 마지막으로 머무는 곳 = 보내기 직전에 모드를 확인하게 된다 |
| 2 | 알약은 **아이콘 + 이름 텍스트**(아이콘만 금지) | 현재 상태를 읽을 수 있어야 한다(원칙 3) |
| 3 | 알약은 메뉴가 열려 있는 동안 **강조 테두리**(캡처의 노란 테두리 = `--vscode-focusBorder`) | 지금 조작 중인 대상이 무엇인지 |
| 4 | 메뉴 헤더 = 좌측 `모드` + 우측 키 힌트(`⇧` `tab` 을 kbd 칩으로) | 단축키를 메뉴가 직접 가르친다 — 별도 도움말이 필요 없다 |
| 5 | 각 행 = **아이콘 + 굵은 제목 + 아래 회색 설명 1~2줄** | 제목만 있는 목록은 "그냥 묻기"가 뭘 끄는지 알려주지 못한다 |
| 6 | 현재 모드 행에 **✓**(+ 옅은 배경) | 캡처와 동일. 선택 상태는 배경만으로 표시하지 않는다(테마에 따라 안 보임) |
| 7 | 메뉴는 알약 기준 **오른쪽 정렬로 위쪽**에 뜬다 | 입력 중인 글을 가리지 않는다 |
| 8 | 항목을 고르면 **즉시 적용 + 닫힘**(확인 버튼 없음) | 캡처와 동일. 되돌리기는 다시 여는 것 |
| 9 | 구분선 아래 한 줄은 **모드가 아닌 관련 설정** 자리 (캡처의 `Effort` 슬라이더 위치) | Phase 2에서는 `⚙ 기본 모드 설정`(설정 패널 바로가기) 하나만. **여기에 새 기능을 발명해 채우지 말 것** |

**`general` 선택 시 알약 외에 한 군데 더** 말해 준다(상태를 두 곳에서):

```
  💬 그냥 묻기 — 규약·파일 컨텍스트 없이 답합니다 · 파일 수정 꺼짐
```
입력창 하단 안내(`Enter 전송 · …`) 자리에 이 문장을 대신 띄운다. `auto`에서는 종전 안내 그대로.

### 4.2.1 기존 `Palette`를 그대로 쓸 수 없다 (구현 주의)

[Palette.tsx](../src/webview/chat/components/Palette.tsx)는 **한 줄 행**(좌: primary / 우: secondary)이고
슬래시·추천이 공유하는 **입력창 위 고정 자리**다. 캡처의 모드 메뉴는 ①2줄 스택 행 ②✓ 표시
③알약 앵커 팝오버라 계약이 다르다 → **`ModeMenu.tsx` 신설**이 맞다.
단 **키보드·포커스 규칙은 Palette에서 그대로 베낀다**: `onMouseDown` 에서 `preventDefault()`(입력 포커스 유지),
`role="listbox"`/`role="option"`/`aria-selected`. 두 목록이 같은 화면에서 다르게 반응하면 안 된다.
(그리고 **모드 메뉴와 슬래시/추천 팔레트는 절대 동시에 띄우지 않는다** — Palette 주석의 기존 원칙 유지.)

### 4.3 대화 기록의 모드 배지

보낸 메시지에 **그때의 모드**를 남긴다. 이게 없으면 스크롤을 올렸을 때 답의 성격을 설명할 방법이 없다.

```
                                      ┌──────────────────────┐
                                      │ 💬  useEffect 정리   │
                                      │     함수가 뭐야?     │
                                      └──────────────────────┘
```

- `auto`(기본)일 땐 배지를 **그리지 않는다** — 기본값에 잉크를 쓰면 소음이 된다.
- 모드가 바뀐 지점엔 대화 흐름에 얇은 구분선 한 줄: `— 💬 그냥 묻기로 전환 —`

### 4.4 토큰 메터·상태바 연동

- `general` 턴의 컨텍스트 분해 패널은 `규칙·가이드 0 / RAG 0`이 그대로 보인다 → **절감이 눈에 보인다**(설득력).
- 상태바 문구: `모델명` → `모델명 · 💬 그냥 묻기`.
- 오프라인 라벨(`⚠️ 오프라인 · 토큰 미사용`)과 충돌하지 않게 모드 표시는 **칩 쪽에만** 둔다.

### 4.5 키보드·접근성

- `Shift+Tab`: **모드 순환**(캡처의 `⇧ + tab to switch`와 동일 동작 — 메뉴를 열지 않고 다음 모드로 바로 넘어간다).
  **반드시** `e.preventDefault()`(기본은 포커스 이동) + `e.isComposing` 중엔 무시
  (한글 IME 조합 중 단축키가 먹으면 입력이 깨진다 — 이 코드베이스는 한국어 입력이 기본이다).
  순환으로 바뀐 모드도 알약이 즉시 바뀌므로 "모르고 바뀜"이 생기지 않는다.
- 메뉴가 열린 상태: `↑/↓` 이동, `Enter` 선택, `Esc` 닫기(포커스는 입력창으로 복귀).
- 알약은 `<button aria-haspopup="listbox" aria-expanded>`, 메뉴는 `role="listbox"` + 행 `role="option"`.
- 바깥 클릭 시 닫힘. 메뉴가 열려 있어도 **입력 포커스는 유지**한다(§4.2.1).

---

## §5 사용성 규칙 (모드가 실패하는 지점들)

### 5.1 스티키(기본) + 한 번만(one-shot)
- 고른 모드는 **유지**된다. 매번 되돌리게 하면 아무도 안 쓴다.
- 단발 질문용 탈출구: `/g <질문>` (= 이번 턴만 `general`). 슬래시 목록에 노출해 발견 가능하게.
  → [slashCommands.ts](../src/webview/chat/slashCommands.ts)에 `/g`·`/mode` 추가.

### 5.2 기억 범위
- 저장: `workspaceState`(`axiom.chatMode`) — **워크스페이스별**. 프로젝트마다 쓰임이 다르다.
- 시작값: `axiom-ai.chat.defaultMode` 설정(기본 `auto`) — 팀 배포 시 기본을 바꿀 수 있게.
- `/clear`(대화 초기화)는 **모드를 유지**한다. 사람이 명시적으로 고른 상태를 대화 청소가 지우면 안 된다.

### 5.3 히스토리 오염 (⚠ 실사고 위험 지점)
모드를 바꿔도 `_history`에는 직전 scaffold 턴의 `axiom-action` 블록·`<search>/<replace>` 텍스트가 남는다.
약한 모델은 **직전 형식을 흉내낸다** → 일반 모드 답변에 axiom-action이 튀어나온다.

**규칙**: `general` 턴을 보낼 때 히스토리에서 axiom-action/patch 블록을 **스트립**해서 전송한다
(대화 자체는 이어진다 — 문맥은 살리고 형식만 지운다). 파서를 끄는 것(§2 원칙 5)과 **둘 다** 한다.

### 5.4 선택 영역·현재 파일
- `general`에서도 **명시적 선택**과 `@경로` 첨부는 존중한다(사용자가 직접 넣은 것).
- 자동 파일 주입만 끈다. 이 구분이 "일반 모드는 아무것도 모른다"는 오해를 막는다.

### 5.5 모드 전환 제안 (가두지 않기 — 이 설계의 핵심)

| 상황 | 지금이면 | 모드 도입 후 |
|---|---|---|
| `general`인데 "이 파일 이렇게 고쳐줘" | (모드 없음) | 답 대신 한 줄 + **[자동 모드로 전환하고 실행]** 버튼 1개 |
| `auto`인데 scaffold 문서 0건 + 파일 컨텍스트 없음 | 그냥 답함 | 답 **아래**에 조용한 칩 `💬 그냥 묻기로 다시 질문` |

- 전환 제안의 판정기는 **새로 만들지 않는다** — 기존 `PageCreationDetector`·`isFileModificationContext` 재사용.
- 버튼 동작은 기존 프리필 채널(`prefillText`) 재사용 → 모드 전환 + 원문 재전송. 구현이 싸다.
- 위쪽(강한 제안)만 버튼이고 아래쪽(약한 제안)은 칩이다. **강요하지 않는다.**

### 5.6 오프라인 × 모드 (계약을 깨지 말 것)

| | 서버 온라인 | 서버 오프라인 |
|---|---|---|
| `auto` | 지금 그대로 | 지금 그대로(로컬 지식·계획 카드) |
| `general` | 순수 LLM 대화 | **답할 수단이 없다** → 솔직히 말한다 |

`general` + 오프라인일 때 **로컬 scaffold 지식을 몰래 렌더하면 안 된다**(모드 계약 위반, 원칙 3).
대신 한 줄로: *"지금 서버에 연결되지 않아 일반 질문에 답할 수 없습니다. Scaffold 지식으로 찾아볼까요? [🧭 자동으로 전환]"*

### 5.7 하지 말 것
- 모드를 4개 이상으로 늘리기 (§3.2)
- 자동 모드 판정을 모드 도입 핑계로 손대기 — **이번 트랙에서 `route` 판정 로직은 건드리지 않는다**(회귀 0 조건)
- 모드를 전역 설정(settings.json)에만 두고 UI를 안 만들기 — 그건 모드가 아니라 숨은 플래그다

---

## §6 구현 계획

> 이 트랙에서도 [offline-action-cards-plan.md](offline-action-cards-plan.md)에서 반복 검증된 방식을 따른다:
> **순수 모듈 먼저 → provider/webview는 배선만 → 전용 테스트 신설 + 무회귀 전량 → 실 화면으로 한 번.**

### Phase 0 — 정책 모듈 (vscode 비의존, 이것만으로 검증 끝)
- 신설 `src/ai/ChatMode.ts`
  - `export type ChatMode = 'auto' | 'general';` (+ 추후 `'ask'`)
  - `export interface ChatModePolicy { … }` — §3.3 표의 키 그대로
  - `export function resolveModePolicy(mode: ChatMode): ChatModePolicy`
  - `export const CHAT_MODES: Array<{ id, label, icon, summary }>` — **UI 라벨의 단일 진실원**(웹뷰가 이걸 import)
  - `export function buildGeneralSystemPrompt(opts): string` — 짧은 프롬프트 1문단
- 신설 `scripts/run-test-chat-mode.mjs` + `npm run test:chat-mode`
  - `auto` 정책이 **현재 동작과 동일**함을 표로 고정(회귀 감지의 앵커)
  - `general` 정책이 모든 주입 키 false임을 고정
  - `buildGeneralSystemPrompt` 길이 < 1,500자
- **완료 기준**: `npm run typecheck` 0 · `test:chat-mode` green · 다른 코드 변경 0줄
- **결과(2026-09-01)**: 완료. 테스트 55건 통과. 계획 대비 정책 키 `stripActionHistory` 1개 추가(§3.3 표에 반영).

### Phase 1 — 호스트 배선 (기능은 켜지되 UI는 아직 없음)
- [messages.ts](../src/types/messages.ts): `sendMessage`에 `mode?: ChatMode` 추가, 호스트→웹뷰 `chatMode` 알림 추가
- [ChatViewProvider.ts](../src/providers/ChatViewProvider.ts)
  - 필드 `_chatMode` + `workspaceState` 로드/저장
  - `_handleMessage` 초입에서 `const policy = resolveModePolicy(this._chatMode)`
  - `policy` 로 ①②③④⑥ 단계를 **조기 반환 없이 건너뛰기**(§1.1 표의 위치)
  - `policy.forceRoute` 로 `route` 고정(#L1831 — **판정 로직은 그대로**, 값만 덮어씀)
  - `!policy.allowFileWrite` 면 `_handleAxiomAction` 진입 자체를 차단
  - `general` 히스토리 스트립(§5.3)
- [ScaffoldContextBuilder.buildSystemPrompt](../src/ai/ScaffoldContextBuilder.ts#L383)에 `policy` 인자 추가
  - `!policy.injectScaffoldRag` → `buildGeneralSystemPrompt` 반환(조기 분기, 기존 경로 무영향)
- **완료 기준**: 무회귀 전량(§7) green + 출력 채널에 `[모드] general — RAG 0 / 규칙 0` 로그 확인
- **결과(2026-09-01)**: 완료. §7 전량 green. 로그는 `[Axiom AI] [모드] general — 시스템 프롬프트 N자 · 규칙 N · RAG 0 · 파일 N`.
  파일 쓰기 차단은 호출부마다가 아니라 `_handleAxiomAction` **진입점 한 곳**에 뒀다(호출부가 15곳이라 한 곳이 안전).
  §5.6 오프라인 안내 한 줄도 여기서 처리(버튼 없이) — ④를 그냥 건너뛰면 죽은 서버로 요청이 나간다.

### Phase 2 — UI (캡처 형태: 알약 + 모드 메뉴 + 배지)
- 신설 `src/webview/chat/components/ModeMenu.tsx` — 알약 버튼 + 팝오버 한 벌.
  **`Palette` 재사용 아님**(§4.2.1: 2줄 행·✓·앵커 팝오버라 계약이 다름). 키보드·포커스 규칙만 베낀다.
  행 데이터는 `CHAT_MODES`(Phase 0)에서 온다 — 라벨을 웹뷰에 다시 적지 말 것.
- [InputBar.tsx](../src/webview/chat/components/InputBar.tsx):
  `input-bar__actions`(전송 버튼 왼쪽)에 알약 배치(§4.2 규칙 1), `Shift+Tab` 순환 핸들러(§4.5),
  `general`일 때 하단 안내문 교체, 슬래시/추천 팔레트와 **동시 표시 금지**
- [useChat.ts](../src/webview/chat/hooks/useChat.ts): `mode` 상태 + `sendMessage`에 실어 보내기 + 호스트 동기화
- [MessageItem.tsx](../src/webview/chat/components/MessageItem.tsx): 모드 배지(§4.3, `auto`는 미표시)
- [webview.css](../src/webview/styles/webview.css): 알약·메뉴·배지 스타일.
  **VSCode 테마 변수만** 사용(강조 테두리 = `--vscode-focusBorder`, 메뉴 배경 = `--vscode-menu-background` 계열).
  캡처의 색을 하드코딩하지 말 것 — 라이트 테마에서 깨진다.
- **완료 기준**: F5 수동 검증 — 화면에서 아래가 보여야 한다
  1. 입력창 **오른쪽 아래**, 전송 버튼 바로 왼쪽에 `🧭 자동 ▾` 알약
  2. 클릭하면 알약 위로(오른쪽 정렬) 메뉴 — 행마다 아이콘 + 굵은 제목 + 아래 회색 설명, 현재 항목에 ✓,
     헤더 우측에 `⇧ + tab` 힌트, 구분선 아래 `⚙ 기본 모드 설정`
  3. 메뉴가 열린 동안 알약에 강조 테두리, 입력 포커스는 유지(타이핑이 계속 됨)
  4. `Shift+Tab` 한 번 = 메뉴 없이 다음 모드로 순환(한글 조합 중에는 반응 없음)
  5. `💬 그냥 묻기`로 바꾸면 알약·하단 안내문·상태바가 함께 바뀜
  6. 일반 질문 전송 → 컨텍스트 분해에서 **규칙 0 / RAG 0**
  7. 스크롤 올렸을 때 그 메시지에 💬 배지가 남아 있음
  (틀리면: 알약은 바뀌었는데 6번 분해가 그대로면 Phase 1 배선이 안 걸린 것 — 웹뷰만 바뀐 상태)
- **결과(2026-09-01)**: 코드 완료, F5 수동 검증 대기. 신설 `ModeMenu.tsx`(알약+팝오버).
  계획에 없던 것 2가지를 함께 넣었다: ① 모드를 고른 즉시 호스트에 `setChatMode`를 보내 기억시킨다
  (전송을 안 하고 창을 닫아도 선택이 남게 — §5.2의 "기억한다"를 실제로 지키려면 필요).
  ② 메뉴의 `⚙ 기본 모드 설정`은 `openModeSettings` → `axiom-ai.chatPanel.focus`로 런처 패널을 연다.
  키보드(↑↓·Enter·Esc·Shift+Tab)는 ModeMenu가 아니라 **InputBar의 textarea 핸들러**가 처리한다 —
  팝오버가 떠도 포커스가 입력창에 남아야 하기 때문(§4.2.1의 Palette 규칙과 동일).

### Phase 3 — 탈출구·전환 제안
- `/g`·`/mode` 슬래시 명령(§5.1)
- 전환 제안 배너/칩 2종(§5.5) — 판정기 재사용, 버튼은 프리필 채널
- 오프라인 × `general` 안내(§5.6)
- **완료 기준**: `general`에서 "이 파일 고쳐줘" → 버튼 1클릭으로 자동 모드 재실행까지 F5 확인
- **결과(2026-09-01)**: 코드 완료, F5 검증 대기. 제안 3종이 `modeSuggest`/`modeSuggestAccept`
  **한 메커니즘**을 공유한다(강 카드 2종 + 약 칩 1종). 수락하면 호스트가 모드를 바꾸고 원문을 재실행한다.
  - 판정은 `shouldSuggestAutoMode`(ChatMode)로 모아 테스트로 고정 — `autoRoute==='modify'` **하나만**
    보면 도메인 파일이 열려 있다는 이유로 짧은 명사구까지 가로채 '가두기'가 된다. 그래서 명시적
    편집·생성 신호(`IntentSignals.isExplicitEditOrCreate`)를 함께 요구한다(E0-4가 이걸 지킨다).
  - `/g 질문`은 **oneShot** — 기억된 모드를 바꾸지 않는다. 턴이 끝나면 `_turnMode`를 되돌린다
    (안 그러면 /g 한 번 뒤 행동 카드 실행이 파일 쓰기 가드에 걸린다).
  - 약한 칩은 sticky=false로 재실행 → 칩 하나가 사용자가 고른 모드를 바꿔버리지 않는다.
  - 재실행 전 히스토리에서 중복 user 턴을 걷어낸다(같은 요청이 두 번 쌓이지 않게).

### Phase 4 — 설정·문서 (선택)
- `axiom-ai.chat.defaultMode` 설정 등록([package.json](../package.json) `contributes.configuration`)
- 런처 설정 패널에 기본 모드 한 줄
- `docs/diagrams/10-대화모드.svg` (기존 도식 번호 규칙 계승)

---

## §7 테스트·게이트

신규: `npm run test:chat-mode`

무회귀 전량(모드 도입은 관문을 건드리므로 **전부** 돌린다):
```
npm run typecheck
npm run compile
npm run test:region-edit
npm run test:offline-intent
npm run test:offline-answer
npm run test:knowledge-routing
npm run test:action-cards
npm run test:api-binding
npm run eval:region        # 적용률·게이트 회귀 확인
```
**불변식 #1**: `mode='auto'`에서 위 게이트 수치가 도입 전과 **완전히 동일**해야 한다.
하나라도 흔들리면 정책 게이트가 auto 경로에 새어 들어간 것이다 — 되돌리고 원인부터 찾을 것.

---

## §8 미결정 — 사용자 확인 필요

| # | 질문 | 문서 권고 | 왜 |
|---|---|---|---|
| 1 | 모드 2개 vs 3개(`ask` 포함) | **2개 먼저** | 모드는 늘리기 쉽고 줄이기 어렵다. `ask`의 값은 자동 Q&A 게이팅과 상당 부분 겹친다 |
| 2 | ~~`Shift+Tab` 단축키~~ | **확정: 쓴다** (IME 조합 중 제외) | 2026-09-01 UI 형태 확정으로 함께 결정(캡처의 `⇧ + tab`) |
| 3 | 모드 기억 범위 | **워크스페이스별** | 프로젝트마다 Axiom 쓰임이 다르다. 전역이면 다른 프로젝트에서 놀란다 |
| 4 | 표시 이름 | `자동` / `그냥 묻기` | "Scaffold 모드/일반 모드"는 내부 용어다. 사용자 언어로 |
| 5 | 메뉴 하단(캡처 `Effort` 자리) | **`⚙ 기본 모드 설정` 한 줄만** | 자리를 채우려고 없던 기능을 만들지 않는다(§4.2 규칙 9) |

---

## §9 진행표

| Phase | 내용 | 상태 | 커밋 |
|---|---|---|---|
| 계획 | 이 문서 | ✅ 2026-09-01 | 미커밋 |
| 계획 | UI 사양 확정(§4 = Claude Code 모드 메뉴 형태, 사용자 지시) | ✅ 2026-09-01 | 미커밋 |
| 0 | `ChatMode.ts` 정책 모듈 + 테스트(55건) | ✅ 2026-09-01 | `8def0ab` |
| 1 | 호스트 배선(Provider·Builder) — §7 전량 green | ✅ 2026-09-01 | 미커밋 |
| 2 | UI(칩·팝오버·배지) | ✅ 2026-09-01 (F5 7항목 검증 완료) | `4a15f7b` + 후속 |
| 3 | 탈출구·전환 제안·오프라인 안내 | ✅ 2026-09-01 (F5 검증 대기) | 미커밋 |
| 4 | 설정·도식 | ⬜ (선택) | — |

> 이어서 작업한 사람은 이 표와 §RESUME을 **함께** 갱신할 것.
