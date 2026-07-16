# decompose/ — 분해

원본 소스와 프롬프트를 sLLM에 줄 수 있는 **재료**로 쪼개는 층.
두 갈래: **쿼리 분해**(토큰화, 복합 도메인어 어근 분해)와
**배경·의존성 분해**(현재 파일에서 관련 섹션·훅·타입만 추출).
도식: [decompose-flow.svg](decompose-flow.svg) (로직 흐름도)

- 위치: sLLM 콜 **전** (② 분해)
- 원칙: 분해·대조는 결정론. 모델에게는 판단 한 조각만 남긴다.

## 계기판 (단계별 테스트)

- **2. 분해 테스트** 페이지(`axiom-ai.stageTestPanel` → 2단계) — 프롬프트+현재 파일(+참조 파일)을 넣으면
  이 층의 두 갈래 산출물을 실제로 보여준다. intent 패널과 달리 이 폴더의 함수는 전부 `export`된 순수
  함수라 **직접 호출**한다(운영 미러 아님 → 동기화 드리프트 0). 구현: `src/providers/DecomposeProbePanel.ts` ·
  `src/webview/decomposeProbe/DecomposeProbeApp.tsx`
- 합성 계기판: `eval:input`(입력 품질) · `eval:bigfile`(큰 파일 region 경로 정량) ·
  **`test:code-slice`(26) — full/참조 경로 슬라이서 전용 안전망**(D1·D2·D3 + 종전 동작 + stub 복원 계약 고정)
- CLI 프로브: `scripts/probe-decompose-bigfile.ts`(테스트 페이지와 동일 함수 CLI 실행) ·
  `scripts/probe-sliced-output.ts`(sliced/full A/B **실모델** 원시 출력 — D3 라이브 게이트용)

## 구성 파일 (2026-07-13 이관 완료)

- `SectionExtractor.ts` — md·쿼리 섹션 분해, tokenizeQuery(복합 도메인어 어근 분해), API 경로 추출
- `CodeSectionExtractor.ts` — TS 파일 섹션 분해·슬라이싱의 본체
  - `splitTsSections` — 파일을 선언(함수·타입·상수) 단위 섹션으로 분할
  - `scoreCodeSections` — 쿼리 토큰 기반 채점(+**D1 흔한 토큰 가드**: max(3, 전체의 20%) 초과 섹션에
    걸리는 토큰은 본문 가점 제외 — `'/api/…'` 상수 64개 동점 오탐 차단, 이름 매칭 +5는 유지)
  - `sliceByBudget` — 예산 내 선별(+**D2 score=0 필러 가드**: 쿼리 신호 있으면 0점 섹션으로 잔여 예산을
    채우지 않음, 무신호는 종전 폴백 / +**D3 그룹 표식**: 연속 제외 런 ≥3개를
    `// ... [보존 Ls~Le] … : 심볼목록` 한 줄로 뭉침, 포함 섹션 인접은 개별 stub 유지,
    `SliceResult.groupedRanges` 반환 — stub 홍수 73% 절감)
  - `extractRelevantTsSlice` — 참조 .ts/.tsx 파일도 앞잘림 대신 관련 섹션 슬라이스(Q3, 현재 파일과 동일 함수)
  - `stripSliceStubs` — **읽기 전용 참조 파일**에선 stub 제거+요약 한 줄(예산 누수 가드 — stub은
    편집 대상에서만 복원용 안전장치)
  - `restoreSlicedStubs` — 모델이 stub/그룹 표식을 그대로 뱉으면 저장 직전 원문 복원(개별+그룹 브랜치,
    프리픽스 `[보존 Ls~Le]`만 매칭해 꼬리 잘림에도 생존)
- `FunctionSpotlight.ts` — 관련 함수만 조명
- `RegionInputQuality.ts` — 분해 산출물(입력) 품질 측정 (외부 참조: `../locate/RegionEdit`)
- `RegionIntent.ts` — 영역편집 쿼리 파싱·토큰화, 컨트롤 태그 함의
- `EditorContextCollector.ts` — 에디터 상태(현재 파일·선택) 수집

## 2026-07 고도화 이력 (일단락)

> 상세 경위·수치는 [docs/src-ai-enhancement-progress.md](../../../docs/src-ai-enhancement-progress.md) ② 카드 참조.

- **Q3 참조 파일 앞잘림 해소** — 큰 코드 참조도 관련 섹션 슬라이스(`extractRelevantTsSlice`)
  + stub 예산 누수 가드(`stripSliceStubs`)
- **D1·D2** — full/참조 경로 공용 슬라이서의 노이즈 결함 수정(흔한 토큰 동점 80섹션 → 1~2섹션)
- **D3 stub 홍수** — b′ 스켈레톤 그룹 표식+인접 개별 조합. 주입 13,120→3,519자(**73% 절감**).
  복원 계약 3곳(restoreSlicedStubs·resolveStubSection·FileCreatorService Pass 0) 그룹 브랜치 확장
  + **표식 전수 생존 가드**(full 계열 응답에 표식 하나라도 없으면 적용 거부, region 합성·요청 간 누수 예외 처리).
  **실 sLLM 라이브 게이트 PASS**(qwen3-coder-64k × 388K자 실파일 — 표식 제자리 생존·보존 심볼 재선언 0·복원 왕복 무손실)
- 정정: "deps 폭주 레버1(가지치기)"은 region 경로에 **이미 구현돼 있었음**(커밋 53cfc82) — 실제 결함은
  full/참조 경로 슬라이서였고 D1·D2·D3로 수정

**남은 개선 후보(전부 후순위·데이터 게이트)**: 레버2(모호 쿼리 64후보 되물음 — locate/pipeline 걸침) ·
레버3(섹션 라우팅 복합어 토큰화 top-bias) · D4(거대 함수 하위 분할 — 단일 함수가 예산 초과면 통째 stub) ·
무신호 폴백 예산 캡(라이브 관찰 1호: 무신호 쿼리+큰 파일 → 컨텍스트 67% 점유) ·
의미론 연관성(tsserver/LSP — 토큰 문자열 매칭을 정의·참조 그래프로 교체, ③locate와 공용 설계, 중기)

## 아직 여기 없는 것 (2단계 이관 대상)

- ScaffoldContextBuilder.ts의 deps 추출부 — **분할 필요** (거대 파일, 전 폴더 이관 후)
