# 스펙: patch 매칭 실패 grounded bounded retry (1A)

## 배경 / 문제

선택 영역(예: 타입 정의)을 잡고 "수정해줘"를 요청하면, 변경이 선택 밖
(타입 필드를 소비하는 JSX 등)으로 번지는 경우가 있다. 약한 sLLM은 선택 밖
코드를 **기억으로 재구성**해 `<search>`에 넣는데, 실제 파일과 글자 단위로
어긋나 `not-found`가 난다. `computeMultiPatch`는 atomic이라 patch 한 개만
실패해도 전부 롤백 → 사용자에게 "Full로 재시도 / 입력 수정"을 떠넘기는
dead-end가 된다.

10000줄급 큰 파일에서 full 모드 재작성은 토큰·출력 잘림·드리프트 위험이
커서 부적절하다. → **국소 patch를 견고하게 만드는 방향**이 옳다.

## 설계 원칙

Claude Code의 견고함은 두 축에서 온다:
- **A. 결정론적 도구** (파일 직접 읽기/grep/문자열 치환) — 확장이 이미 파일을
  들고 있으므로 **모델 무관하게 재현 가능**.
- **B. 강한 모델 + 멀티턴 자가 교정 루프** — 약한 sLLM엔 수렴 불안, 부적절.

→ axiom-ai는 **A에 무게**를 싣는다. 기존 structural 모드의 철학
("모델은 조각만, 위치는 확장이 결정")을 patch 경로로 확장한다.

## 범위

| 구현 완료 | 제외(다음 단계) |
|---|---|
| 1A: grounded bounded retry (not-found/ambiguous) | 결정론적 심볼 리네이밍 (1C) |
| 1A: `locateFuzzyRegion` (모델 무관 위치 grounding) | 리터럴 부분 쓰기 |
| 1A: `MultiPatchResult.resolvedOk` | 멀티턴 에이전트 루프 |
| 1A: 1회 한정 재시도 (무한 루프 차단) | structural-선택 억제 버그 조사 |
| 1A+: stub-aware grounding (`resolveStubSection`) | |
| 1B: ripple-aware selection guard (`extractRenameMap`/`applyRenameMap`) | |

## 동작 (end-to-end)

```
1. computeMultiPatch(original, patches, selection)
   - 전부 성공 → text 생성 → 기존 적용 경로
   - 일부 실패(text=null) → 아래로
2. 실패 사유가 not-found/ambiguous인 patch 수집
   - groundedRetry off 또는 이미 1회 시도 → 기존 dead-end UI (회귀 없음)
3. 실패 patch마다 locateFuzzyRegion(원본, 실패 search) 로 실제 위치+텍스트 확보
   - ★ 실패 patch 중 하나라도 위치를 못 찾으면 grounded 재시도 포기
     (그 변경이 조용히 누락되는 사고 방지) → 기존 dead-end UI
4. 성공 patch의 실제 영역 + 실패 patch의 fuzzy 영역을 묶어,
   "이 실제 텍스트를 <search>에 그대로 쓰라"는 grounded 프롬프트로 1회 재호출
5. 재호출 응답을 _handleAxiomAction(resp, groundedRetryDone=true)로 재처리
   - computeMultiPatch 재실행(atomic). 성공 → 적용 / 실패 → 기존 dead-end UI
```

`locateFuzzyRegion`은 **위치 힌트로만** 쓴다. 직접 자동 적용하지 않는다
(조용한 오적용 방지 — 기존 프로젝트 원칙 유지).

## locateFuzzyRegion 알고리즘

```
입력: originalLines, failedSearch, ctx(앞뒤 여유줄), threshold
1. failedSearch에서 비공백 라인 중 식별성 높은 줄(영숫자 토큰 최다) 선정
2. 원본 각 라인과 토큰 자카드 유사도 계산
3. 최고점이 (a) threshold 이상 (b) 2위와 명확히 우월(유일) 이면
   그 위치 ±ctx 범위의 실제 텍스트 반환
4. 동점 다수 / 임계치 미달 → null (grounding 포기)
```

토큰 = `/[A-Za-z0-9_$]+/` 추출. 자카드 = |교집합| / |합집합|.

## 폴백 사다리 (안전망)

```
grounded 재시도 성공 → 적용 ✅
  ↓ 위치 못 찾음 / 재호출 실패 / 재호출 후에도 매칭 실패
기존 _reportPatchFailure → "Full로 재시도 / 입력 수정" (현 동작 100% 보존)
```

신규 경로는 기존 경로 **앞에** 끼워 dead-end 빈도만 낮춘다. 회귀 없음.

## 설정 플래그 (AI_DEFAULTS.multiPatch / package.json)

| 키 | 기본 | 의미 |
|---|---|---|
| `multiPatch.groundedRetry` | `true` | grounded 1회 재시도 on/off |
| `multiPatch.fuzzyLocateThreshold` | `0.6` | locateFuzzyRegion 자카드 임계치 |
| `multiPatch.rippleGuard` | `true` | 1B: 선택 안 rename의 선택 밖 리플 허용(예측 결과 일치 시만) |

## 1A+ stub-aware grounding

큰 파일은 본문이 `// ... [kind name] 원본 NN줄 보존 ...` 스텁으로 잘려 모델에 전달되고,
모델이 그 스텁을 `<search>`에 (JSX에선 `{/* */}`로 변형해) 넣어 항상 not-found가 난다.
`resolveStubSection`이 search의 스텁 마커를 인식해 splitTsSections로 실제 섹션 본문을
결정론적으로 찾아 grounding 영역으로 돌려준다(fuzzy보다 우선). 모델의 오염된 `<replace>`
intent는 버리고 누적 히스토리의 원래 요청이 변경 의도를 전달한다.

## 1B ripple-aware selection guard

선택 영역 안 patch의 search→replace에서 식별자 rename 맵 R을 추출(`extractRenameMap`)하고,
선택 밖 변경 라인이 **"R을 적용한 결과와 글자까지 동일"**할 때만 리플로 허용한다
(`applyRenameMap`). 모델이 임의 코드를 끼워넣을 수 없는 안전 면제. R 추출 실패·빈 맵이면
종전처럼 거부(무회귀). old가 TS 키워드·원시 타입이면 rename으로 안 봄(타입 변경 오염 방지).

## 테스트 (scripts/test-patch-grounded.ts, 모델 무관)

- locateFuzzyRegion: 정확 1곳 / 들여쓰기만 다름(보정) / 다중 동점(null) /
  임계치 미달(null) / 빈 search(null)
- computeMultiPatch: resolvedOk가 실패 섞여도 성공분만 채워지는지,
  atomic `text` 계약 불변 확인

## 작업 순서

1. 설정 플래그 (ExtensionConfig, config.ts, package.json)
2. locateFuzzyRegion + resolvedOk + 단위테스트 (모델 무관)
3. grounded 재시도 분기 + 프롬프트 (ChatViewProvider)
4. typecheck + 단위테스트 통과
