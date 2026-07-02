# Axiom 의도 라우팅 재설계 — 진단 & 통합 계획

> 작성일: 2026-07-02 · 목적: **의도 라우팅(현관문) 레이어**를 단일 결정자(single IntentResult router)로
> 수렴시켜 "두더지잡기" 버그 계열을 구조적으로 종결한다.
>
> ⚠️ 이 문서는 [AXIOM_EDIT_REDESIGN_HANDOFF.md](AXIOM_EDIT_REDESIGN_HANDOFF.md)와 **다른 축**을 다룬다.
> - 그 문서 = **편집 적용 레이어**(region/patch/lines를 어떻게 안전하게 적용하나 — surgical edit, grounded 재시도, verify 루프). 이미 Claude Code 벤치마킹 완료.
> - 이 문서 = **의도 라우팅 레이어**(애초에 어느 경로로 갈지 — qna vs modify vs create, 어느 파일, 지식가이드 vs 편집).

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
1. **Phase 2 — 편집품질 라이브 eval (최우선).** 분류는 끝났고(100%) 남은 결함은 전부 **편집 산출·적용** 레이어다. `live-model-client`를 재사용해 새 하니스(`scripts/eval-edit-live.ts` 제안):
   - 입력: 픽스처 파일(예: 빈 EmployeeListPage.tsx, getArr 있는 버전) + 요청 + 실제 `buildContractSection`(계약카드, 순수) + coreRules 스냅샷.
   - 실 모델 호출 → 응답 파싱(기존 파서 재사용) → **실제 apply primitives**(`FileCreatorService.computeMultiPatch`/`dedupeImportLines`, `applyStructuralEdit`)로 적용.
   - **자동 판정**: ⓐ로컬 데이터인데 `/api/`·`useApi` 환각? ⓑ중복 import 생겼나? ⓒpatch가 매칭됐나? ⓓ원본에 없는 심볼을 `<search>`에 넣었나(파일 그라운딩)? ⓔprose-only(action 블록 누락)?
   - 시드 케이스 = 오늘 실패 3건: "getArr 결과를 테이블로 보여줘"(useApi 환각 X 확인), "alert 버튼 넣어줘"(중복 import X·파일 그라운딩), "이 배열을 테이블로"(로컬 렌더).
   - ⚠ 난관: `buildSystemPrompt`는 vscode 결합 → 전체 재현 대신 **순수 조각(buildContractSection)+coreRules 스냅샷**으로 근사하거나, vscode 스텁+픽스처 워크스페이스로 `ScaffoldContextBuilder`를 돌리는 길 검토.
2. **B안 S2~S5 (라우팅 단일화).** 분류기 100% 확증됐으니 안전. S2 qna/scenario 종속화 → S3 단일 switch(`isFileCtx` 불리언조합 제거) → S4 충돌안전(되묻기) → S5 정규식 정리. 각 단계 `eval:intent-live`+`test:region-edit`+`test:offline-intent` 회귀 0 후 승격. (상세 §4)
3. **S1 실사용 로그 수집.** `[Axiom AI][S1 라우팅측정]` 출력채널 라인에서 `⚠ 불일치` 패턴 모으기 → S2 우선순위 보강.

### 검증 명령 (현재 전부 green)
```
npm run typecheck
npm run test:region-edit      # 224/0 (list-table 로컬출처 4건 포함)
npm run test:react-rules      # 18/0 (dedupeImportLines 5건 포함)
npm run test:offline-intent   # 66/0
npm run eval:intent-live      # 45/45 (실 모델, env 키 필요)
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
- **S2. qna/scenario 종속화**: ③⑤가 `effectiveIntent`를 존중하게(모델 확신 시 우선). forceQnA/forceModify를
  임시 파라미터에서 "effectiveIntent 소비"로 승격. buildSystemPrompt 시나리오 결정도 여기 연결.
- **S3. 단일 switch**: `isFileCtx` 불리언 조합을 `effectiveIntent.intent` switch로 교체. 지식가이드 분기도
  `intent==='qna'`일 때만. ④ isFileModificationContext 독립 호출 제거.
- **S4. 충돌 안전 강화**: modify인데 대상 파일 불명확/도메인 밖이면 _resolveTargetFile 되묻기로. 하드 게이트 제거.
- **S5. 정규식 정리**: S1~S4 후 죽은 정규식 게이트(직접 소비처 사라진 것) 삭제. classifyOfflineIntent 단일화.

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
