# 페이지 생성 의도 라우팅 · 충돌 안전성 개선 (intent routing & collision safety)

> 설계 문서 · Axiom AI VSCode Extension
> 상태: 단기 완료 / 중기·장기 미구현 · 집에서 이어 작업용
> 작성: 2026-06-10

---

## 0. 한 줄 요약

"프롬프트마다 정규식으로 버그 하나씩 잡기"는 원리적으로 끝이 없다.
**추출은 모델에 위임하고, 실행은 충돌 시 무조건 되묻게** 만들어 부류 전체를 막는다.

---

## 1. Context — 무엇이 문제였나

### 1.1 트리거가 된 버그

입력:

```
직원목록2 페이지 만들어줘. 내용은 EmployeeListPage.tsx 파일 내용으로 채워줘
```

증상 세 가지:
1. 기존 `EmployeeListPage.tsx`를 **덮어씀(수정)**
2. 라우터에 **같은 path(`employee-list`) 중복** 생성
3. **파일명을 묻지 않음**

### 1.2 근본 원인 (한 뿌리)

[PageCreationDetector.ts](../src/ai/PageCreationDetector.ts)의 `_extractRawName`가 **입력 전체에서 첫 PascalCase 토큰**을 페이지명으로 잡았다.

- 의도한 이름 `직원목록2`(한국어) → 매칭 안 됨 → 정상이라면 `null` → 영문명 되묻기
- 그런데 "내용은 **EmployeeListPage**.tsx 파일 내용으로 채워줘"의 `EmployeeListPage`가 잡힘 → `pageName = "EmployeeListPage"`

즉 **"채울 내용의 출처 파일명"을 "만들 페이지명"으로 오인**. 이름이 비지 않으니 되묻기를 건너뛰고([ChatViewProvider.ts:3476](../src/providers/ChatViewProvider.ts#L3476) `if (!pageName)`), 그 이름이 기존 파일과 충돌해 덮어쓰고, 라우트가 중복됐다.

---

## 2. 더 큰 문제 — 왜 끝이 없는가

입력 판단이 **거의 전부 결정론적 정규식**이다:

| 순서 | 위치 | 방식 |
|---|---|---|
| 1 | 슬래시 커맨드 (`/spec`, `/scaffold`) | 문자열 |
| 2 | [ChatViewProvider.ts:741](../src/providers/ChatViewProvider.ts#L741) `PageCreationDetector.detect()` | **정규식** (이번 버그 자리) |
| 3 | [isQnAGated](../src/ai/ScaffoldContextBuilder.ts#L950) · `isFileModificationContext` · `_isExplicitEditOrCreate` · `_isQnAQuery` · `_isSmalltalk` | **정규식/휴리스틱** |

자연어 꼬리는 무한 → 정규식으로 분류·추출하면 **두더지잡기 확정**.

### "claude code 방식" LLM 판단은 이 레이어에 적용 안 됨

모델 위임은 **영역 편집의 "어느 영역" 선택**에만 좁게 존재(region disambiguation). 프롬프트가 모델에 닿기 **전에** 2번 정규식 게이트가 잘라버려서, 최상위 의도 판단·페이지명 추출엔 LLM이 전혀 관여하지 않는다.

> 이게 잘못된 선택은 아니다 — 로컬 약한 sLLM(qwen3-coder-64k)을 쓰고, 정규식은 빠르고 테스트 가능(eval 하니스). 다만 **이 부류 버그는 모델이 똑똑해도 못 막는** 순수 확장 코드 문제다.

---

## 3. 핵심 통찰

> **파싱을 완벽하게 만들려 하지 말고, 잘못 파싱돼도 안전하게 만들어라.**

이번 피해의 본질은 "이름을 잘못 뽑은 것"이 아니라 **"잘못된 이름으로 기존 파일을 말없이 덮어쓰고 라우트를 중복시킨 것"**. 충돌 가드는 문구와 무관하게 이 부류 전체를 막는다.

레이어를 분리한다:

- **분류 + 슬롯 추출**(의도/이름/도메인/내용출처) → 무한 꼬리 → **모델이 정규식보다 우월**. 정규식은 폴백.
- **실행 안전성**(덮어쓸까/중복일까) → **결정론 유지 + 방어적**(오분류가 들어와도 피해 0).

---

## 4. 작업 계획

### 4.1 단기 — 완료 ✅ (이번 세션)

- [x] `_extractRawName`에 `_stripContentSourceRefs` 추가 — 내용 출처 파일 참조(`X.tsx`, `X 파일`)를 페이지명 후보에서 제거. 단 `Foo.tsx 페이지 만들어`처럼 생성 키워드가 바로 뒤면 보존. → [PageCreationDetector.ts](../src/ai/PageCreationDetector.ts#L89)
- [x] `_appendToExistingRouter`에 동일 path / 동일 `element:<Page/>` 중복 가드 + `_escapeRegExp` 헬퍼. → [ChatViewProvider.ts:3984](../src/providers/ChatViewProvider.ts#L3984)
- [x] 8개 입력 케이스 수동 검증 전부 PASS, `tsc --noEmit` 클린.

### 4.2 중기 — **1차 구현 완료 ✅** (2026-06-11, 페이지 파일 충돌 가드)

**목표: 미래의 어떤 오파싱도 조용히 파괴 못 하게.**

- [x] 페이지 생성 시 **이름 충돌 확인**을 페이지 파일 경로에 추가
  - 도메인 확정 직후([_handlePageCreationDomainInput](../src/providers/ChatViewProvider.ts#L3607))에서 `_maybeGenerateOrAskCollision(pageName, domain)` 호출 → `src/domains/<domain>/pages/<PageName>.tsx` 존재 시 **"1) 덮어쓰기 2) 다른 이름 3) 취소"** 3지 되묻기(`waitingForCollision` 상태 + [_handlePageCreationCollisionInput](../src/providers/ChatViewProvider.ts)). "다른 이름"은 정규화 후 **재충돌검사**(같은 이름 재입력 시 무한 덮어쓰기 방지).
  - 라우터 dedup은 4.1에서 가드 완료. "다른 이름" 경로는 이름 변경→도메인 재확정→재충돌검사를 거쳐 routePath도 새 이름으로 재산정됨.
- [ ] (남음) 회귀 테스트: 같은 이름 재생성 시 ① 덮어쓰기 안 됨 ② 라우트 중복 안 됨 ③ 되묻기 발생 — `eval:e2e` 또는 신규 단위테스트로 고정.

### 4.3 장기 — **1차 슬라이스 구현 완료 ✅** (2026-06-11, 플래그 off · 실모델 검증 대기)

- [x] **의도 분류 + 슬롯 추출을 단일 구조화 모델 호출로 이전.** → 신규 [IntentClassifier.ts](../src/ai/IntentClassifier.ts)
  - 출력 스키마: `{ intent: 'create_page'|'modify_file'|'qna'|'smalltalk'|'other', pageName, domain, contentSource, targetFile }`.
  - **JSON 강제 + 파싱 실패/모델 부재 시 정규식 폴백**(`parseIntent`가 null → 기존 `PageCreationDetector`). 닫는 `}` 오면 조기 종료(토큰 절약). few-shot 예시는 중립 도메인(catalog/inventory/billing)으로([[project_fewshot_parroting]]).
  - 진입점: [ChatViewProvider.ts](../src/providers/ChatViewProvider.ts) `_handleMessage` 슬래시커맨드 분기 뒤·`PageCreationDetector` 앞에 `_classifyIntent` 호출. `create_page`→생성 워크플로우, 그 외→정규식 생성 분기 건너뛰고 일반 흐름. **분류 결과를 채팅에 한 줄 표시**(`formatIntentForChat`, "🧭 의도 분석: …").
  - 설정 플래그 `axiom-ai.experimental.intentClassifier`(기본 off, [ExtensionConfig.isIntentClassifierEnabled](../src/config/ExtensionConfig.ts)).
- [x] 실행 레이어는 결정론 + 방어적 유지(4.2 충돌 가드가 전제).
- [ ] (남음) 검증: `eval:e2e`(record/replay) + `eval:disambig`로 분류 정확도·회귀 측정. 약한 모델은 **실모델 record로만** 검증(메모리 규칙). 현재 `parseIntent` 단위 robustness만 검증됨(fenced/prose/bad-enum→null).
- [ ] (남음) 슬롯 스레딩: `contentSource`/`targetFile`를 하류(`_loadReferencedFiles`·`_resolveTargetFile`)에 직접 전달(현재는 텍스트 재파싱에 의존 — 라우팅은 맞지만 슬롯은 미사용).

---

## 5. 손대는 파일 지도

| 파일 | 역할 | 관련 작업 |
|---|---|---|
| [src/ai/PageCreationDetector.ts](../src/ai/PageCreationDetector.ts) | 정규식 의도·이름 추출 | 4.1 완료 / 4.3에서 폴백으로 강등 |
| [src/providers/ChatViewProvider.ts](../src/providers/ChatViewProvider.ts) | 라우팅·워크플로우(`_startPageCreation`·`_finalizePageCreation`·`_appendToExistingRouter`) | 4.1 완료 / 4.2 충돌 가드 / 4.3 분류 호출 |
| [src/ai/FileCreatorService.ts](../src/ai/FileCreatorService.ts) | createFile/updateFile 실행 | 4.2 (updateFile 무음 덮어쓰기 경로) |
| [src/ai/ScaffoldContextBuilder.ts](../src/ai/ScaffoldContextBuilder.ts) | isQnAGated 등 2차 게이트 | 4.3에서 분류 결과와 일원화 검토 |

---

## 6. 검증 명령

```bash
npx tsc --noEmit            # 타입
npm run eval:e2e            # 모델 출력 레이어 record/replay
npm run eval:disambig       # 모호 쿼리 선택 품질
# (의도 분류 추가 시 신규 케이스 record 필요)
```

---

## 7. 다음에 앉으면 첫 한 걸음

4.2의 **페이지명 충돌 되묻기**부터. 단일 변경으로 가장 많은 미래 버그를 막는 지점이고, 4.3 모델 도입 전에도 안전망이 된다.
