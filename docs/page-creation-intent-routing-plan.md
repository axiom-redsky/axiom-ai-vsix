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

### 4.2 중기 — 다음 작업 (레버 가장 큼) ⬜

**목표: 미래의 어떤 오파싱도 조용히 파괴 못 하게.**

- [ ] 페이지 생성 시 **이름 충돌 확인**을 페이지 파일·라우터 경로에 추가
  - 현재 [FileCreatorService.ts:1041](../src/ai/FileCreatorService.ts#L1041) `createFile`에는 "이미 존재합니다, 덮어쓸까요?" 확인이 **이미 있음**.
  - 그러나 라우터는 [updateFile](../src/ai/FileCreatorService.ts#L977)로 들어가 **묻지 않고 덮어씀** → 중복 라우트가 샌 경로.
  - 작업: 페이지 생성 워크플로우 진입 시점([_startPageCreation](../src/providers/ChatViewProvider.ts#L3472) 또는 [_finalizePageCreation 직전](../src/providers/ChatViewProvider.ts#L3610))에서 `src/domains/<domain>/pages/<PageName>.tsx` 존재 여부를 먼저 검사 → 존재하면 **"이미 존재 — 덮어쓰기 / 다른 이름 / 취소"** 3지 선택을 채팅으로 되묻기. (createFile의 OS InputBox 경고보다 워크플로우 초입에서 막는 게 UX상 깔끔)
  - 라우터 dedup은 4.1에서 가드했으나, "다른 이름" 선택 시 routePath도 새로 산정되는지 확인.

- [ ] 회귀 테스트: 같은 이름 재생성 시 ① 덮어쓰기 안 됨 ② 라우트 중복 안 됨 ③ 되묻기 발생 — 케이스를 `eval:e2e` 또는 신규 단위테스트로 고정.

### 4.3 장기 — 구조 개선 (두더지잡기 탈출) ⬜

- [ ] **의도 분류 + 슬롯 추출을 단일 구조화 모델 호출로 이전.**
  - 출력 스키마(예): `{ intent: 'create'|'modify'|'qna'|'smalltalk', pageName: string|null, domain: string|null, contentSource: string|null }`
  - 약한 모델도 이런 얕은 추출은 정규식보다 잘함. 단 **JSON 강제 + 실패 시 정규식 폴백** 필수(모델 부재·타임아웃 대비).
  - 진입점: [ChatViewProvider.ts:741](../src/providers/ChatViewProvider.ts#L741) 이전에 분류 호출을 두고, `PageCreationDetector`는 폴백/패스트패스로 강등.
- [ ] 실행 레이어는 결정론 + 방어적 유지(4.2 가드가 전제).
- [ ] 검증: 기존 `eval:e2e`(record/replay) + `eval:disambig` 하니스로 분류 정확도·회귀 측정. 약한 모델은 **실모델 record로만** 검증(메모리 규칙).

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
