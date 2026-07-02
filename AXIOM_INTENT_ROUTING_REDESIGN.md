# Axiom 의도 라우팅 재설계 — 진단 & 통합 계획

> 작성일: 2026-07-02 · 목적: **의도 라우팅(현관문) 레이어**를 단일 결정자(single IntentResult router)로
> 수렴시켜 "두더지잡기" 버그 계열을 구조적으로 종결한다.
>
> ⚠️ 이 문서는 [AXIOM_EDIT_REDESIGN_HANDOFF.md](AXIOM_EDIT_REDESIGN_HANDOFF.md)와 **다른 축**을 다룬다.
> - 그 문서 = **편집 적용 레이어**(region/patch/lines를 어떻게 안전하게 적용하나 — surgical edit, grounded 재시도, verify 루프). 이미 Claude Code 벤치마킹 완료.
> - 이 문서 = **의도 라우팅 레이어**(애초에 어느 경로로 갈지 — qna vs modify vs create, 어느 파일, 지식가이드 vs 편집). **재설계 미착수.**

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
