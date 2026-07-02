# AXIOM 개선작업 — 핸드오프 (이어서 작업용)

> 목적: 집/다른 환경에서 이 개선 작업을 **끊김 없이 이어가기** 위한 연속성 문서.
> 최종 갱신: 2026-07-02

---

## 0. 한 줄 요약

Axiom(폐쇄망·작은 sLLM·저토큰 환경의 react-app-scaffold용 VSCode 확장)의 **영역 편집 정확도**를
"모델을 키우지 않고 **결정론층에 지능을 쌓는**" 전략으로 개선 중. 이번에 ① Scaffold 계약 카드 확장,
② onClick 명명핸들러 인라인화 버그(handler-body 게이트), ③ **실패 자동 포집(플라이휠 연료)** 을 처리.

---

## 1. 큰 그림 — 이 환경의 전략 (왜 이렇게 하는가)

- **제약**: 자체호스팅 약한 sLLM(qwen 계열, vast 인스턴스) + 적은 토큰 + 폐쇄망. 강한 모델의 에이전트 루프
  (Read/Edit 툴로 아무 곳이나 외과편집)는 **토큰·지연·신뢰성**이 역풍이라 그대로 못 씀.
- **전략**: 모델에 기대를 낮추고 **확장(결정론)에 지능을 쌓는다.** 모델은 "환원 불가능한 의미 판단 한 조각"만.
- **플라이휠**: `실패 분포를 겪고 → 케이스가 아니라 추상화로 승화 → 결정론/모델 분업선 재조정 → 계기판으로 잠그고 → 꼬리는 우아하게 폴백`.
- **현 진단**: 플라이휠 구조는 **이미 있음**. 부족한 건 (a) **연료**(다양한 실프로젝트·모델의 실패 분포),
  (b) **바닥재**(편집 파이프라인이 AST가 아니라 정규식/휴리스틱 → 일반화 한계), (c) **두 축의 미성숙**
  (모델 분업 = IntentClassifier·region disambiguation 등 플래그 뒤 실검증 대기 / 중간 사다리 = region↔full 사이 없음).
- **탈출구**: 어려운 한 조각만 큰 모델로 라우팅(소→대); 기계적이면 결정론으로; 시간이 지나면 소형모델·컨텍스트 개선.

---

## 2. 이번 세션에 완료한 작업

### 2-1. Scaffold 계약 카드 커버리지 확장 ✅ (커밋됨: `fa6e3aa`)
파일: `src/ai/ScaffoldContracts.ts`
- region 편집 경로는 트리거 기반 계약 카드만 주입 → 카드 없는 scaffold 컨벤션은 모델에 안 닿음(예: `window.alert`).
- 카드 **6 → 11개** 추가:
  - `global-ui-alerts`: `window.alert/confirm` → 전역 `$ui.alert/confirm`
  - `global-util`: 수동 포맷 → 전역 `$util.*`(6 네임스페이스)
  - `class-merge-cn`: 조건부/동적 className → `cn()` (**정적 className엔 미발동**)
  - `form-validation`: react-hook-form + zod + zodResolver
  - `handler-extraction`: **일반 React**(scaffold 아님) — 이벤트 핸들러 기존 구조 보존
- **기각**(일반 React라 카드 부적합·남발 위험): memo-perf / list-key(모든 .map 발동) / custom-hook-rules(ESLint 담당) / error-boundary / domain-isolation. **보류**: loadable-code-split(라우트 설정 전용).
- ⚠ **함정 기록**: JS 정규식 `\b`는 ASCII 기준이라 **한글엔 경계가 안 생김**(`\b폼\b` 미매칭). 한글 토큰 트리거엔 `\b` 쓰지 말 것.

### 2-2. issue #1 — onClick 명명핸들러 인라인화 버그 ✅ (커밋됨: `fa6e3aa`)
증상: "버튼 클릭 시 alert" 요청에 기존 `handleRegisterClick` 함수를 삭제하고 `onClick={() => alert(...)}` 인라인으로 갈아끼움.
- **근본원인**: handler 선언이 return 이전(deps 헤더 zone) → JSX region 밖 → 모델이 handler를 못 봄.
- **Option A(region을 handler로 재타겟) 기각**: ① handler가 deps(읽기전용)+region 중복 → "중복 선언 금지"로 파손, ② 파이프라인 전체가 "region=JSX 요소" 전제라 TS 문장 region이 깸.
- **Option B 채택**(cross-cutting과 동일 원리 = 편집 대상이 region 밖 → full 폴백). 수정 3곳:
  1. `src/ai/RegionEdit.ts` — `detectHandlerBodyOutsideRegion` + 게이트 `handler-body`(정밀: 이벤트의도 + `on*={맨 식별자}` + 선언이 region 밖 + 파일 내 존재. 인라인·region 내 선언·타파일 import는 미발동).
  2. `src/ai/ScaffoldContextBuilder.ts` coreRules — "이벤트 핸들러 구조 보존" 규칙(full 경로가 handler 본문 수정하게).
  3. 같은 파일 네비 가이드의 모순 지시("onClick 인라인·핸들러 불필요")를 "단순 한 줄만 인라인·기존 명명핸들러는 본문 수정"으로 보정.
  - `RegionEditService.classifyRegionDecline`도 `handler-body → 'full'` 명시.
- 회귀 방지 테스트: `scripts/test-region-edit.ts` T6.

### 2-3. 실패 자동 포집 (플라이휠 연료) ⚠️ **미커밋** (이번 작업의 마지막)
> **핵심 통찰: 포집 ≠ 회수.** 포집은 텔레메트리 아님(네트워크 0, 로컬 파일 append) → **폐쇄망 안전**.
> 진짜 제약은 폐쇄망에서 개발자에게 되돌리는 "회수"(통제 반출)라, **redaction 3모드**를 내장.

신규/수정 파일:
- `src/ai/RegionCaptureRecorder.ts` **(신규, 순수 모듈·vscode/fs 미의존 → 단위테스트 가능)**
  - `buildCaptureEntry` / `serializeCaptureLine` / `shouldCapture` / `skeletonizeSource` / `baseName` / `shortHash`
  - **redaction 3모드**: `full`(원본·재현100%·dev dogfooding용) / `skeleton`(구조 유지 + 문자열·숫자·한글 마스킹, ⚠한글 앵커 locate 재현은 일부 손실) / `meta`(소스 미포함, 쿼리·게이트·상태만 = 분포 계기판)
  - 경로 유출 방지 = basename만. id = file + 쿼리 djb2 해시(dedupe·EvalCase 변환 키).
- `src/providers/ChatViewProvider.ts` **(수정)**: `_captureRegionCase()` 추가, `runHybridRegionEdit` outcome 직후 호출(try/catch로 **편집 절대 안 막음**). 저장 = 확장 **globalStorage/region-captures.jsonl**(`registerCorpusWatcher`에서 `context.globalStorageUri` 저장, 프로젝트 간 누적·미커밋).
- `src/config/ExtensionConfig.ts` + `package.json` **(수정)**: 설정 3개 — **요청대로 전부 기본 OFF**
  - `axiom-ai.experimental.captureRegionCases` (마스터 스위치, 기본 `false`)
  - `axiom-ai.experimental.captureRegionRedaction` (`full`|`skeleton`|`meta`, 기본 `full`)
  - `axiom-ai.experimental.captureRegionApplied` (성공도 포집, 기본 `false` = 실패만)
- `scripts/test-region-capture.ts` + `scripts/test-region-capture.mjs` **(신규 커밋 테스트)**, `package.json`에 `test:region-capture` 스크립트.

---

## 3. 검증 상태 (재현 커맨드)

```bash
npm run typecheck            # ✅ 통과
npm run test:region-edit     # ✅ 211 passed, 0 failed  (T6 = handler-body 포함)
npm run test:region-capture  # ✅ 16 passed, 0 failed   (신규)
npm run eval:region          # ✅ 적용률 85%(35/41), 회귀 없음
npm run test:react-rules     # ✅ 13
npm run test:api-binding     # ✅ 69
npm run test:line-edits      # ✅ 15
```
- 계약 카드 발동은 세션 중 임시 스크립트로 8/8·게이트 2/2 확인(임시 파일이라 미커밋; 필요시 test:region-capture처럼 커밋 테스트로 승격 가능).

---

## 4. 커밋 상태 (집에서 먼저 확인)

- **커밋됨**: 2-1(카드), 2-2(handler-body) — 최근 커밋 `fa6e3aa react 핸들러 처리 로직 수정` 부근.
- **미커밋(working tree)** — 2-3(실패 포집):
  - `M package.json`, `M src/config/ExtensionConfig.ts`, `M src/providers/ChatViewProvider.ts`
  - `?? src/ai/RegionCaptureRecorder.ts`, `?? scripts/test-region-capture.ts`, `?? scripts/test-region-capture.mjs`
- 집에서 이어가기 전: `git status`로 확인 → 이상 없으면 이 포집 배치부터 커밋 권장(테스트 green).

---

## 5. 다음 할 일 (우선순위)

1. **EvalCase 변환기 (플라이휠 "잠금" 완성)** — 포집된 `region-captures.jsonl` 케이스를
   `scripts/eval-fixtures/*.tsx` + 코퍼스 항목(`scripts/eval-region-corpus.ts`의 `EvalCase`)으로 변환하는 스크립트.
   → 실패가 자동으로 계기판에 잠기는 고리 완성. (EvalCase 형태: `{ id, file, query, expectGate?/expectE2E?, note? }`)
2. **회수 경로 (폐쇄망 반출)** — 쌓인 JSONL을 하나로 묶는 export 명령 + `meta`/`skeleton` 반출 번들.
   현장 반출 심사 현실에 맞춰 결정. (dev dogfooding은 full로 로컬에서 바로 쓰므로 반출 불필요.)
3. **바닥재: AST 심볼-span 해석기 (2순위 추천)** — handler 케이스를 full 폴백 대신 **싸게** 처리.
   현재 `RegionEdit.ts`는 정규식/휴리스틱(splitTsSections·brace-depth), TS 컴파일러 API **미사용**.
   접근: region을 "JSX 요소" → "임의 균형 코드 span(함수 본문 등)"으로 일반화 + 최소 심볼 선언 해석기.
   플래그 뒤에서, `eval:region`/`test:region-edit`로 잠그며 정규식 특례(②.5~②.9)를 한 부류씩 삭제.
4. **두 축 성숙** — 잠든 플래그 라이브 검증: `experimental.intentClassifier`, `regionVerify`, `composeBinding`,
   region disambiguation. + **모델 라우팅**(소→대) 저비용 실험(어려운 한 스텝만 큰 모델).

---

## 6. 개인 규율 (플라이휠을 사람으로 굴리기)

- **실패 1개 → 일반화 1개 → 잠긴 테스트 1개.** 증상만 고치지 말 것(= 두더지잡기 방지).
- 일반화는 **안 본 입력/도메인/모델**에 검증한 뒤 신뢰(과적합·few-shot echo 방지).
- 지표 추적: locate의 **번호 특례가 늘고 있나 줄고 있나** — 늘면 AST(바닥재) 투자 신호.
- 연료 넓히기: **2~3개 다른 도메인 프로젝트 + 2~3개 작은 모델**로 dogfooding(부서/직원 도메인 편향 주의).
- 실사용 **gate 분포 로깅** → 진짜 분포의 머리(head) = 다음 투자처.

---

## 7. 핵심 파일 지도

| 영역 | 파일 |
|---|---|
| 영역 locate·게이트 | `src/ai/RegionEdit.ts` (`locateEditRegion`, 게이트, `detectHandlerBodyOutsideRegion`) |
| 영역 편집 서비스 | `src/ai/RegionEditService.ts` (`runHybridRegionEdit`, `classifyRegionDecline`) |
| 계약 카드 | `src/ai/ScaffoldContracts.ts` |
| full 경로 프롬프트·coreRules | `src/ai/ScaffoldContextBuilder.ts` |
| 실패 포집(신규) | `src/ai/RegionCaptureRecorder.ts` |
| 런타임 배선 | `src/providers/ChatViewProvider.ts` (`_captureRegionCase`, region 편집 호출부 ~L3024) |
| 설정 | `src/config/ExtensionConfig.ts` + `package.json`(contributes.configuration) |
| 계기판(eval/test) | `scripts/eval-region.ts`·`test-region-edit.ts`·`test-region-capture.ts`·`eval-e2e.ts`·`eval-region-corpus.ts` |

**참고**: 실 react-app-scaffold 소스 = `C:\redsky\work\react\single_react_new_nicfirst\react-app-scaffold`
(knowledge/*.md를 실코드로 교차검증할 때). 지식 문서 = `knowledge/**/*.md`(utils/ui.md·util.md·cn.md 등).

**서버 토폴로지**: 확장 LLM 서버 = vast 인스턴스 위 터널 → 4000 LiteLLM → 21434 Ollama.
"502/접속 안 됨" 1순위 = 수동 기동 LiteLLM(포트 4000) 죽었나 확인·재기동.

---

## 8. 이 작업의 근거가 된 설계 대화 요약

- 강한 모델(Claude Code)이 흩어진 코드를 잘 고치는 건 **툴이 아니라 강한 모델** 덕. 이식의 델타는 도구가 아니라 모델 능력.
- full은 큰 파일에서 비쌀 뿐 아니라 **품질 나쁘고 위험**(truncation·긴컨텍스트 저하·파괴적 재생성).
- "조립(흩어진 조각만 콕 집어 편집)"이 큰 파일의 정답 방향이지만, 비용 = **AST급 스코프 해석 + 다영역 파이프라인 + 약한 모델의 다영역 코디네이션(슬롯필링 레시피 필요)**.
- 작은 모델·저토큰 환경에 "방법이 없는" 게 아니라, **결정론층에 지능 쌓기 + 어려운 한 조각만 위임**이 바로 그 방법.
