# Axiom 의도 라우팅 재설계 — 진단 & 통합 계획

> 작성일: 2026-07-02 · 목적: **의도 라우팅(현관문) 레이어**를 단일 결정자(single IntentResult router)로
> 수렴시켜 "두더지잡기" 버그 계열을 구조적으로 종결한다.
>
> ⚠️ 이 문서는 [AXIOM_EDIT_REDESIGN_HANDOFF.md](AXIOM_EDIT_REDESIGN_HANDOFF.md)와 **다른 축**을 다룬다.
> - 그 문서 = **편집 적용 레이어**(region/patch/lines를 어떻게 안전하게 적용하나 — surgical edit, grounded 재시도, verify 루프). 이미 Claude Code 벤치마킹 완료.
> - 이 문서 = **의도 라우팅 레이어**(애초에 어느 경로로 갈지 — qna vs modify vs create, 어느 파일, 지식가이드 vs 편집).

---

## ★★ 2026-07-03 세션 (최신, 여기부터 읽으면 됨) — 토큰 절감 + 버그/환각 수정

> ⚠️ 이 세션은 라우팅(이 문서 본론)이 아니라 **① 토큰 절감 ② 편집 적용 견고화 ③ 환각 수정** 축이다.
> 라우팅 B안(S2~S5)은 아직 그대로 남아 있음(아래 07-02 RESUME 참조). 사용자 요청으로 여기 함께 기록.

### 한 문단 요약
라이브 실모델(qwen3-coder-64k)로 "버튼 넣어줘"·"getProd 결과를 테이블로"·"선택 div 아래 버튼"을 반복 돌리며,
**토큰이 왜 많은지 진단→절감**하고, 그 과정에서 노출된 **적용 dead-end·useApi 환각·structural 오선택·import 누락**을
순차 수정했다. 핵심 교훈 재확인: **프롬프트 설득 < 결정론 주입/제거**, 그리고 **재시도·폴백 프롬프트는 coreRules
가드레일을 유실하므로 핵심 규칙을 재주입해야 한다.**

### 이번 세션 완료 (main 미커밋 — 내일 커밋 필요) — 작업별

**A. 편집 적용 견고화 — patch 실패 시 full 1회 자동 폴백**
- `ChatViewProvider._tryAutoFullFallback(filePath, groundedRetryDone)` 신설. groundedRetryDone·config 가드 → `_retryForAxiomAction({forceFull})` → `_handleAxiomAction(resp,false,true)`(정확히 1회).
- 배선한 dead-end 3곳: ① 메인 patch(`mp.text===null`, grounded 재시도 실패 직후) ② router/autoWrite patch 경로(router 제외) ③ **중복선언 가드 거부**(`newDupes.length>0`, patch가 기존 const 재선언 — "getProd로 테이블" 실측 dead-end).
- config `multiPatch.autoFullFallback`(기본 **on**). 왜: fragile patch는 overlap·매칭실패 시 구조적 좌초, full은 그 실패가 없음.

**B. 토큰 절감 레버 A — coreRules 의도 게이팅 (기본 on)**
- `_buildCoreRules`에 `includeDataRules/includeTypeNaming/includeRouterRules` 플래그. **순수 가드레일(import 경로·Rules of Hooks·Button·기존코드/핸들러 보존·라이브러리 금지·주석) 항상 주입**, 상황규칙(데이터 출처 우선순위·useApi·타입 네이밍·선언 순서·createBrowserRouter/router import)만 의도 관련 시. 시나리오 C 전용(A/B 신규생성은 전체 유지).
- 의도감지 `_hasDataIntent`·`_hasTypeIntent`·`_hasNavigationIntent`. config `scenarioC.gateCoreRulesByIntent`(on).
- **버튼 케이스 실측 −1,581자**(규칙·가이드 −19%). 정확도↑+토큰↓ 정렬 이득(약한 모델은 무관 지시문이 품질을 떨어뜨림).

**C. 토큰 절감 레버 B — 출력 모드 초압축 (기본 off, 실모델 검증 대기)**
- `_buildScenarioCPrompt`에 `ultraCompactModes` + `ultra = ultraCompactModes && !hasSelection && !requiresRender`. ultra면 coreRules와 중복인 '훅 삽입 위치 규칙' 블록·lines·장황한 모드선택 설명 생략 + structural·patch를 한 예시씩 축약.
- config `scenarioC.ultraCompactModes`(**off**). **모드섹션 −1,434자(62%)**. 편집전략 메뉴 변경이라 회귀 위험 → 내일 실모델 검증 후 on 결정.

**D. 선택 영역 중복 window 제거**
- 선택 시 파일 본문(라인번호) + **선택 주변 코드 window(라인번호 붙여 복제)** + 지시문이 3중으로 들어가던 것. `linesAllowed`(파일 안 잘림)일 때 중복 window 생략 + 파일 본문 라인에 `← 선택` 마커 인라인. 슬라이싱된 경우만 종전 window 유지. **−800~900자** + 약한 모델 혼란(첫 시도 axiom-action 누락) 감소 기대.

**E. 환각/버그 수정 3건 (라이브 발굴)**
1. **full 재시도 프롬프트 useApi 편향** — `_retryForAxiomAction` forceFull 프롬프트가 무조건 "데이터 조회는 반드시 useApi로" 지시 → 로컬 `getProd` 요청에 `useApi('/api/employees')` 환각. **균형 가드레일로 교체**(파일에 getArr/getProd 있으면 그대로 .map(), API 명시 없으면 useApi 지어내지 마라, 진짜 API일 때만 useApi). 교훈: **재시도는 coreRules 미전송이라 데이터출처 우선순위 유실 → 재주입 필요.**
2. **referencesLocalDataSource 자연어 미인식** — `X()`/`X함수`만 잡아 "getProd **결과 배열을**"(괄호 없음)을 놓침 → local-data-render 카드 미발동 → `requiresPatchMode` 미적용 → structural 오선택 → 선언만·테이블 JSX 누락. **3갈래로 확장**: ①`X()`/`X함수` ②`X 결과/배열/데이터/목록/리스트/값` ③getter형 이름(`get|fetch|load|…`+대문자). id 길이≥3.
3. **import 누락 결정론 주입** — 약한 모델이 `<Button>` 넣고 `import { Button }` 생략(선택 프롬프트 무시). `StructuralAnchor.ensureUiComponentImports(text)` 신설 — JSX PascalCase 태그 중 `UI_COMPONENTS` 카탈로그(Button·Table 계열 등) 있고 미import·미선언인 것을 배럴 import에 병합. patch/full/lines 공통 길목(normalizeUiImportPaths→stripGlobalImports→**ensureUiComponentImports**→dedupe)에 배선. 커스텀·로컬선언·주석 태그 제외. = region 게이트 `findUnresolvedJsxComponents`의 **주입 버전**(경로 수렴).

**F. RAG 캡 부수 활성 (E-2의 side effect)**
- 계약카드 발동 시 RAG를 `contractRag.capChars=1500`으로 캡하는 로직은 이미 있었으나(`ScaffoldContextBuilder:387`), local-data-render가 미발동(E-2 버그)이라 캡이 안 걸려 RAG 4,401자였음. E-2 수정으로 카드 발동 → **RAG ~4,400 → ≤1,500** 자동 활성.

### 추가된 config 토글 (내일 사이트 튜닝용)
| 키 | 기본 | 효과 |
|---|---|---|
| `multiPatch.autoFullFallback` | **on** | patch dead-end → full 1회 자동 폴백 |
| `scenarioC.gateCoreRulesByIntent` | **on** | coreRules 상황규칙 의도 게이팅(레버 A) |
| `scenarioC.ultraCompactModes` | **off** | 단순편집 모드지시 초압축(레버 B) — 실모델 검증 후 on |

### 남은 작업 (내일 회사에서, 우선순위 순)
1. **레버 B 실모델 검증** — `scenarioC.ultraCompactModes=true`로 켜고 대표질문(버튼추가·텍스트변경·핸들러수정·선택편집) 품질 확인 → 괜찮으면 기본 on 승격. 규칙·가이드 8,257→~5,200 예상.
2. **오늘 수정 라이브 회귀 배치** — `eval:edit-live`(폐쇄망 실모델, env 키)로 자동폴백·로컬데이터렌더·import주입을 시드 케이스로 돌려 결함 분포 측정 → 새 실패는 픽스처/케이스로 회귀 고정.
3. **requiresPatchMode 카드 표현폭 갭 점검** — referencesLocalDataSource처럼, 다른 트리거(button-component·global-ui-alerts·smart-table 등)도 괄호 없는 자연어/동의어 발화를 놓치는지 점검(카드 미발동 시 structural 억제가 조용히 무력화됨).
4. **TABLE_RENDER_BRANCH 카드 축약 검토(~2,900자)** — 데이터+렌더 요청의 남은 큰 덩어리. 렌더 정확도 직결이라 실모델 before/after 필수. 조심스럽게.
5. **selection 첫-시도 실패 재확인** — 중복 window 제거(D)로 "axiom-action 누락→재요청" 빈도가 줄었는지 라이브 확인.
6. **assistant 말풍선 "undefined" UI 글리치** — 선택+응답에서 본문에 `undefined` 렌더(사소, 별개). webview 메시지 렌더 경로 점검.
7. (병행) 라우팅 B안 S2~S5는 아래 07-02 RESUME 그대로 — 독립 트랙.

### 이번 세션 회귀 상태 (전부 green)
```
npm run typecheck && npm run compile
npm run test:region-edit      # 230/0 (local-data-render 자연어 6건 신규 포함)
npm run test:react-rules      # 39/0 (ensureUiComponentImports 10건 신규 포함)
npm run test:api-binding      # 69/0
npm run test:patch-grounded   # 30/0
npm run test:offline-intent   # 66/0
npm run test:line-edits       # 15/0
```

### 오늘 건드린 파일
- `src/providers/ChatViewProvider.ts` — 자동 full 폴백(3 dead-end 배선) · full 재시도 프롬프트 균형화 · ensureUiComponentImports 공통 길목 배선
- `src/ai/ScaffoldContextBuilder.ts` — coreRules 의도 게이팅(레버 A) · 모드 초압축(레버 B) · 선택 중복 window 제거 · 의도감지 헬퍼(`_hasDataIntent`/`_hasTypeIntent`)
- `src/ai/ScaffoldContracts.ts` — `referencesLocalDataSource` 자연어 3갈래 확장
- `src/ai/StructuralAnchor.ts` — `ensureUiComponentImports` 신설
- config 배선: `src/ai/config.ts` · `src/config/ExtensionConfig.ts` · `package.json` · `src/types/messages.ts` · `src/providers/ChatPanelProvider.ts` · `src/webview/launcher/LauncherApp.tsx`
- 테스트: `scripts/test-region-edit.ts`(+6) · `scripts/test-react-rules.ts`(+10)

### 관련 메모리
`project_apply_robustness_full_fallback`(A) · `project_prompt_composition`(B·C·D) · `project_local_data_render_card`(E-2·E-3·F) · `project_alert_button_intent_spec`(버튼 4법칙) · `project_patch_apply_model`.

---

## ★ 집에서 이어서 — RESUME (2026-07-02 최신, 여기부터 읽으면 됨)

### 이번 세션 결론 (한 문단)
"의도 파악이 안 된다"의 진짜 원인은 **분류기가 아니었다.** 실 qwen3-coder로 canonical 요청 15개 × 3회 = **45/45 (100%, 흔들림 0)** — 프로덕션에서 터졌던 것 전부 정확·일관 분류. 즉 **모델은 의도를 제대로 잡는데, 그 옳은 판단을 하위 파이프라인이 무시/왜곡**했던 것이다. 그래서 처방은 "모델을 똑똑하게"가 아니라 **"이미 맞은 판단을 파이프라인이 신뢰하게"**(B안: 단일 라우터) + **편집 산출·적용 레이어 정상화**다.

### 이번 세션 커밋 완료 (main) — 4개 레이어 순차 수정
한 요청("보여줘"/"버튼 넣어줘")이 파이프라인 끝까지 처음 관통하면서 레이어별 결함이 순차 노출됨:
1. **라우팅 게이트** — 분류기가 `modify`로 맞혔는데 `isQnAGated`("보여줘")가 뒤집어 지식가이드로 샘. → `forceModify` 대칭 추가(`isQnAGated`/`buildSystemPrompt`). `ScaffoldContextBuilder.ts`, `ChatViewProvider.ts`.
2. **계약카드** — `list-table-binding`이 "테이블+보여"에 오발동 → 없는 `/api/…`+`useApi` 환각. → 트리거에서 "보여" 제거 + `referencesLocalDataSource` 가드. coreRules에 "데이터 출처 우선순위" 규칙. `ScaffoldContracts.ts`, `ScaffoldContextBuilder.ts`.
3. **재시도** — 보강/patch 재시도가 실제 파일을 안 넣어(시스템 프롬프트 미재전송, `_history`엔 파일 없음) 파일명만으로 내용 환각 → `<search>` 매칭 실패. → `currentFileBlock` 주입을 `forceFull`→`!groundedPatches` 전 재시도로 확대. `ChatViewProvider._retryForAxiomAction`.
4. **중복 import** — `dedupeImportLines`가 patch 경로에만 배선 → full 모드 중복 통과. → **공통 길목**(`_handleAxiomAction` ~4105)으로 이동해 전 모드 커버. `ChatViewProvider.ts`.

### 이번 세션 신규 도구 — 라이브 eval 하니스 (Phase 1 완료)
케이스바이케이스를 끝내기 위한 **선제형 안전망**. 실 모델로 배치 검증 → 버그를 사용자보다 먼저 잡는다.
- `scripts/live-model-client.ts` — 공유 클라이언트(설정/env에서 endpoint·model·apiKey → `/v1/chat/completions`).
- `scripts/eval-intent-live.ts` — 15 canonical 케이스(오늘 실패들 회귀). 실 `buildIntentPrompt`+`parseIntent`로 분류 정확도 측정.
- `scripts/run-eval-intent-live.mjs` + npm `eval:intent-live`.

**실행 방법(집에서):** apiKey는 익스텐션이 **SecretStorage(암호화)**에 보관 → 스크립트가 못 읽으므로 env로 준다. endpoint/model은 VSCode 설정에서 자동. 접속 정보(baseURL/model/apiKey)는 **로컬 axiom.config / 익스텐션 설정에 이미 있음**(이 문서엔 키를 적지 않음).
```powershell
$env:AXIOM_API_KEY="<익스텐션에 넣은 키>"; npm run eval:intent-live
# 흔들림 측정: $env:AXIOM_EVAL_REPEAT="3"; npm run eval:intent-live
# 필요시 덮어쓰기: $env:AXIOM_ENDPOINT / $env:AXIOM_MODEL
```
현재 baseline: **45/45 (100%)**. 새 라우팅 버그를 발견하면 `eval-intent-live.ts`의 `CASES`에 한 줄 추가해 회귀로 고정.

### 다음 할 일 (집에서, 우선순위 순)
1. **Phase 2 — 편집품질 라이브 eval — ✅ 하니스 구축완료(2026-07-02 집), 실모델 튜닝만 남음.**
   - 구축: `scripts/eval-edit-live.ts`(하니스) + `scripts/eval-edit-corpus.ts`(픽스처 3종 + **coreRules 스냅샷** + 케이스) + `scripts/run-eval-edit-live.mjs`(esbuild+vscode스텁, **CJS 번들** — typescript가 require 써서 ESM은 깨짐) + npm `eval:edit-live`.
   - 근사 결정: vscode 결합 회피는 문서 §44 권고대로 **CORE_RULES_SNAPSHOT(동결 사본) + 순수 buildContractSection + 편집포맷 지침**. (전체 `buildSystemPrompt` 재현 대신.) 스냅샷 드리프트 신호 = `CORE_RULES_SYNC_HINT`("데이터 출처 우선순위").
   - 자동 판정 5종 배선 완료: ⓐapi환각(로컬데이터인데 useApi/`/api/`) ⓑ중복import(dedupeImportLines.removed>0) ⓒ매칭실패(computeMultiPatch.text===null) ⓓ비그라운딩(`<search>`가 원본에 없음) ⓔ설명만(action블록/payload 없음). 파서는 ChatViewProvider 3265-3380 순수 복제.
   - **셀프테스트 5/5 통과**(`npm run eval:edit-live -- --selftest`, 모델 불필요 — 파서·apply·판정 결정론 검증). tsc·앱typecheck 회귀 0.
   - **⏭ 남은 일(집, 실모델):** `$env:AXIOM_API_KEY="…"; npm run eval:edit-live` 로 3 시드 케이스를 실 qwen3-coder로 돌려 결함 분포 측정 → 새면 프롬프트/계약카드/coreRules 보강 → 회귀로 고정. (반복측정 `AXIOM_EVAL_REPEAT=3`, 임계게이트 `AXIOM_EVAL_MIN_CLEAN`.) 필요 시 픽스처를 실 EmployeeListPage.tsx로 확장하고 `applyStructuralEdit`(auto-import) 판정 추가.
2. **B안 S2~S5 (라우팅 단일화).** 분류기 100% 확증됐으니 안전. **S2 ✅완료(2026-07-03, ⑤ 시나리오 종속화 — §4 참조)** → S3 단일 switch(`isFileCtx` 불리언조합 제거) → S4 충돌안전(되묻기) → S5 정규식 정리. 각 단계 `eval:intent-live`+`test:region-edit`+`test:offline-intent` 회귀 0 후 승격. (상세 §4)
   - **S2 라이브 검증 항목(회사/집, 실 qwen):** 분류기 on 상태에서 publishing/shared 파일을 열고 "이 파일 수정해줘"류 요청 → 종전엔 A/B(생성) 프롬프트가 나가던 것이 이제 시나리오 C(수정)로 나오는지 확인. 도메인 파일(src/domains/*)은 종전과 동일해야 함(회귀 체크).
3. **S1 실사용 로그 수집.** `[Axiom AI][S1 라우팅측정]` 출력채널 라인에서 `⚠ 불일치` 패턴 모으기 → S2 우선순위 보강.

### 검증 명령 (현재 전부 green)
```
npm run typecheck
npm run test:region-edit      # 224/0 (list-table 로컬출처 4건 포함)
npm run test:react-rules      # 18/0 (dedupeImportLines 5건 포함)
npm run test:offline-intent   # 66/0
npm run eval:intent-live      # 45/45 (실 모델, env 키 필요)
npm run eval:edit-live -- --selftest   # 5/5 (판정 로직 결정론 검증, 모델 불필요)
npm run eval:edit-live        # Phase 2 편집품질 (실 모델, env 키 필요 — 집에서 튜닝)
npm run compile
```

관련 메모리: `project_intent_routing_redesign`(트랙 전체), `project_qna_gating_consistency`, `project_scaffold_contract_coverage`(issue#3), `project_retry_use_current_file`.

---

## 0. 한 줄 요약

현재 라우팅은 **결정자가 4~5개 병렬로 존재**하고 서로 독립적으로 판단한다. 이들이 불일치하면 그게 곧 버그다.
모델 분류기(`IntentClassifier`)는 있지만 "힌트"로만 취급돼, 독립 정규식 게이트가 모델을 **덮어쓸 수 있다**.
처방: **분류기가 확신하면 그 결과가 라우팅의 단일 진실원**, 정규식은 모델 부재/불확실 시 폴백으로 강등,
모델 오분류는 하드 게이트가 아니라 **실행부의 되묻기**로 흡수한다.

---

## 1. 핵심 진단 — 결정자가 너무 많다

`_handleMessage`의 라우팅 경로에서 "이 요청이 무엇인가"를 판단하는 결정자 목록:

| # | 결정자 | 위치 | 읽는 것 | 정하는 것 | 분류기가 닿나? |
|---|---|---|---|---|---|
| ① | `_classifyIntent` (모델) | ChatViewProvider:5930 | 쿼리 + 열린파일 + 도메인목록 | `IntentResult`(intent/pageName/domain/contentSource/targetFile/targetComponent) | (본인) — 단 `experimental.intentClassifier` off면 미실행 |
| ② | `PageCreationDetector.detect` (정규식) | PageCreationDetector | 쿼리 | isPageCreation + pageName | 부분(create_page 가드가 교차검증 1331) |
| ③ | `isQnAGated` (정규식 3종) | ScaffoldContextBuilder:1006 | 쿼리(+forceQnA/forceModify) | Q&A 게이팅 여부 | **방금 forceQnA/forceModify로 부분 연결** |
| ④ | `isFileModificationContext` = `_getDomainContext().isCurrentFileContext` | ScaffoldContextBuilder:984,836 | 쿼리 도메인 **또는 현재 파일 경로의 도메인** | 현재파일 수정 컨텍스트 여부 | **안 닿음**(순수 경로/도메인 기반) — ChatViewProvider:1417이 `classifierSaysModify \|\|`로 우회 OR만 함 |
| ⑤ | `domainCtx.isCurrentFileContext` (buildSystemPrompt 내부) | ScaffoldContextBuilder:508 | ④와 동일 로직 재계산 | **시나리오 C(편집) vs A/B(생성) 프롬프트** | **안 닿음** |

핵심 문제: ①모델의 판정이 ③④⑤ 전부에 일관되게 흐르지 않는다. ③에만 방금 부분 연결했고(forceQnA/forceModify),
④는 OR로 우회만, ⑤는 여전히 **순수 경로 기반**이라 모델과 무관하게 프롬프트 시나리오를 정한다.

### 오프라인 경로는 이미 통합돼 있다 (역설)

`_respondOfflineOrTransplant` → `resolveOfflineIntent` → `IntentSignals.classifyOfflineIntent`는 **정규식들을
하나의 `IntentResult`로 이미 통합**해 놨다(우선순위 캐스케이드 + strength). 즉 **오프라인은 단일 라우터인데
온라인은 게이트 수프**다. 온라인이 이 통합 모델을 안 쓰는 게 부채의 핵심.

---

## 2. 충돌 지도 (불일치 = 버그 계열)

| 충돌 쌍 | 증상 계열 | 실제 사례(메모리) |
|---|---|---|
| ①modify vs ③qna | 수정 요청이 지식가이드로 샘 | **이번 버그**("getArr 결과를 테이블로 보여줘") · project_qna_gating_consistency |
| ①modify vs ⑤scenario | 열린 파일이 도메인 밖(publishing/shared)이면 ChatViewProvider는 modify로 보는데 buildSystemPrompt는 A/B(생성) 프롬프트를 줌 → "수정인데 새 파일 만들라" 모순 | project_modify_to_create_leak 계열 |
| ①create vs ②regex | 코드요소 "만들기"를 페이지 생성으로 오분류 | project_intent_routing_collision_safety(getArr 함수) |
| ①targetComponent vs 경로해석 | "X로 적용" vs "X를 수정" 조사 구분 실패 → shared 파일 재작성 | project_cross_file_retarget(SmartTable 사고) |
| ②/extractDomain vs 참조경로 | 참조 소스 파일명(PascalCase)을 도메인/생성이름으로 오인 | project_intent_routing_collision_safety(자매버그) |

전부 **"결정자 A는 X라는데 결정자 B는 Y라 한다"**의 변주다. 결정자를 하나로 줄이면 이 쌍들이 사라진다.

---

## 3. 목표 아키텍처 — 단일 IntentResult 라우터

```
                         ┌─ 확신 ─→ classifier 결과 ─┐
쿼리 → _classifyIntent ─┤                            ├─→ effectiveIntent(IntentResult)
       (모델, off면 skip) └─ null/불확실 ─→ classifyOfflineIntent(정규식)  │
                                                                            ↓
                                          ONE switch(effectiveIntent.intent)
                                          ├ create_page → 페이지 생성
                                          ├ modify_file → 파일 수정(_resolveTargetFile→region/…)
                                          ├ qna         → 지식가이드/설명
                                          └ smalltalk   → 잡담 응답
                                                                            ↓
                                          실행부 충돌 안전(되묻기): 대상 파일 모호·
                                          경로 위험·모델↔정규식 불일치 시 QuickPick
```

원칙 3개:
1. **단일 라우터**: `effectiveIntent.intent` 하나로만 분기. `!qnaGated && (classifierSaysModify || regexModify)`
   같은 불리언 수프 제거. `isFileCtx`·`isQnAGated`·`isCurrentFileContext`를 개별 소비하지 않는다.
2. **정규식은 폴백으로 강등**: 모델이 확신하면 정규식은 발언권 없음. 온라인·오프라인이 **같은
   `classifyOfflineIntent`를 폴백**으로 공유(중복 로직 제거 = 메모리 IntentSignals 설계 의도).
3. **충돌 안전은 실행부**: 모델 오분류 방어는 하드 게이트가 아니라 되묻기(_resolveTargetFile 패턴).
   (메모리 feedback_prefer_intent_over_blocking: 경로 하드차단 금지.)

buildSystemPrompt의 시나리오 결정(⑤)도 `effectiveIntent`를 받아 modify면 무조건 C, create면 A/B로 —
경로 기반 `isCurrentFileContext` 추측을 대체(또는 종속)시킨다.

---

## 4. 단계별 실행 (회귀 0 유지, 계기판 방어)

각 단계는 플래그 뒤 + `eval:region`·`test:offline-intent`·`test:region-edit` 회귀 0 확인 후 다음으로.

- **S1. effectiveIntent 확립 (비파괴) — ✅ 구현완료(2026-07-02)**: `_logIntentDivergence`(ChatViewProvider)가
  매 요청마다 effectiveIntent(분류기 확신 시 그 결과, null/other면 `classifyOfflineIntent`)를 계산해 현행 게이트
  (qnaGated·isFileCtx)와의 불일치를 출력 채널 `[Axiom AI][S1 라우팅측정]` 라인으로 기록. **라우팅 미변경.**
  → 실사용 로그에서 `⚠ 불일치` 빈도/패턴 수집 = S2 우선순위 데이터. tsc·compile·test:offline-intent 66/0·
  test:region-edit 220/0 회귀 0.
- **S2. qna/scenario 종속화 — ✅ 구현완료(2026-07-03)**: ③(isQnAGated)은 07-02에 forceQnA/forceModify로
  이미 종속화됨. 이번에 **⑤(시나리오 C vs A·B 결정)** 종속화 완료. 종전 `buildSystemPrompt`는 순수
  경로/도메인 기반(`domainCtx.isCurrentFileContext`)으로만 시나리오 C를 골라, 모델이 modify로 확신해도
  열린 파일이 도메인 밖(publishing/shared)이면 A/B(생성) 프롬프트를 줘 "수정인데 새 파일 만들라" 모순이
  났다. 수정: `forceModify && ctx.available`이면 `domainCtx.isCurrentFileContext`를 결정 **전에** true로
  올려 domainSection·분기가 일관되게 C로 흐르게 함(쿼리 도메인 때문에 A/B 라우터 섹션이 섞이는 것도 차단).
  플래그 `scenarioC.scenarioByEffectiveIntent`(기본 on) — **분류기 off/null이면 forceModify는 항상 false라
  발동 안 함 → 회귀 0**(불변식 #1이 분류기 게이트로 자동 충족). 회귀: typecheck·compile·test:region-edit
  230/0·test:offline-intent 66/0·test:react-rules 39/0·test:line-edits 15/0·test:api-binding 69/0·
  eval:region 85%(회귀 0). ⚠️ **프롬프트 시나리오 전환 효과는 실 qwen 라이브 검증 필요**(집/회사).
- **S3. 단일 라우터 변수 — ✅ 부분완료(2026-07-03, 행위 보존)**: `_handleMessage`의 파생 수프
  (`!qnaGated && (classifierSaysModify || regexModify)`)를 단일 `route`('qna'|'modify'|'passthrough')로
  수렴시키고, `qnaGated`/`isFileCtx`를 그 route의 alias로 도출했다(소비처 7곳 무변경, 회귀 0). 이제 라우팅
  결정자가 하나의 변수 → S4 되묻기 분기의 seam. **불변식 #1 준수를 위해 ④ isFileModificationContext →
  classifyOfflineIntent 교체는 이 단계에서 하지 않음** — 둘은 오프라인에서 갈라지므로(경로 신호 vs 쿼리
  동사 신호; 예 "도메인 파일 열림 + '직원 목록'" → 현행 modify vs offline other) 교체 시 분류기 off에서
  회귀. 그 오프라인 단일화는 **S1 실측 divergence 데이터 확보 후 S5**로 이관(플랜 시퀀싱과 일치).
  회귀: typecheck·compile·region-edit 230/0·offline-intent 66/0·react-rules 39/0·line-edits 15/0·
  api-binding 69/0·eval:region 85%(회귀 0).
- **S4. 충돌 안전 강화 — ✅ 사실상 충족(2026-07-03 검토)**: 핵심 기제("실행부 되묻기")는 이미
  `_resolveTargetFile`에 구현돼 있음 — cross-file 재타겟(분류기 `targetComponent` 1순위, :778) → 모호 시
  `_askTargetFile` QuickPick 되묻기(:796,:813). "하드 게이트 제거"도 이미 완료(project_cross_file_retarget:
  사용자가 shared 하드차단 거부 → PathGuard 전부 제거). **유일한 잔여분="모델↔정규식 불일치 시 되묻기"인데
  이건 S1의 `⚠ 불일치`가 실제로 잘못된 파일을 고르는 케이스에만 의미** → 데이터 게이트(S5와 동일). 지금
  speculative하게 되묻기를 추가하면 "명시했는데 또 묻는" friction(사용자가 도메인 되묻기에서 지적한 그것)을
  재생산하므로 **의도적으로 보류**. measure-then-build.
- **S5. 정규식 정리 — ⏸ 데이터 게이트(미착수)**: ④ isFileModificationContext → classifyOfflineIntent 오프라인
  단일화 + 죽은 정규식 게이트 삭제. **S1 출력채널의 `⚠ 불일치` 샘플이 필요** — 2026-07-03 실사용 케이스는
  전부 `✅ 일치`라 divergence 0건. 실사용하며 불일치 로그가 쌓이면 그 실제 케이스가 가리키는 교체만 정밀
  수행(오프라인 회귀 0 유지). 데이터 없이는 착수 금지(불변식 #1 위반 위험).

> **트랙 현황(2026-07-03 마감):** S1✅·S2✅·S3(부분)✅·S4(사실상)✅ 모두 커밋(main 826fb3e/577f1be).
> **지금 안전하게 만들 수 있는 코드 작업은 소진.** 남은 S3-잔여(④교체)·S4-잔여(불일치 되묻기)·S5는 전부
> **S1 divergence 로그 축적을 기다리는 상태**(speculative 금지). 다음 세션 진입점 = 출력채널 `[Axiom AI][S1
> 라우팅측정]`에서 `⚠ 불일치` 수집 → 그 케이스 기반으로 재개.

⚠️ **프롬프트 효과(시나리오 C/A·B 전환)는 오프라인 eval로 측정 불가** → 실 qwen3-coder 라이브 검증 필수
(편집 재설계 문서 원칙 #1과 동일).

---

## 5. 불변식 (절대 어기지 말 것)

1. **분류기 off/null이면 종전과 100% 동일** — 폴백=`classifyOfflineIntent`가 기존 게이트와 같은 판정을 내야 회귀 0.
2. **경로 하드차단 금지** — 개발자가 shared/publishing 정당하게 수정하는 경우 존재. 의도 정밀화 + 되묻기로.
3. **프롬프트 변경은 라이브로만 검증** — 녹화 재생·오프라인 eval은 시나리오 전환을 못 잡음.
4. **단계마다 플래그 + 계기판 회귀 0** 후 승격.

---

## 6. 핵심 파일 지도

| 파일 | 라우팅 역할 |
|---|---|
| `src/providers/ChatViewProvider.ts` | `_handleMessage`(진입·라우팅 척추 ~1310-1540) · `_classifyIntent` · `_resolveTargetFile`(되묻기) · `_respondOfflineOrTransplant` |
| `src/ai/IntentClassifier.ts` | 모델 분류 프롬프트·파싱(`buildIntentPrompt`/`parseIntent`) → `IntentResult` |
| `src/ai/IntentSignals.ts` | **정규식 폴백 통합자**(`classifyOfflineIntent` → IntentResult + strength) ← S1/S5 단일화 대상 |
| `src/ai/ScaffoldContextBuilder.ts` | `isQnAGated`(③) · `isFileModificationContext`/`_getDomainContext`(④⑤) · `buildSystemPrompt` 시나리오 결정 |
| `src/ai/PageCreationDetector.ts` | 페이지 생성 정규식(②) + `isHowToQuery` |
| `src/config/ExtensionConfig.ts` | `experimental.intentClassifier` 플래그 |

관련 메모리: `project_intent_routing_collision_safety`(진단 원본), `project_qna_gating_consistency`,
`project_modify_to_create_leak`, `project_cross_file_retarget`, `feedback_prefer_intent_over_blocking`.
