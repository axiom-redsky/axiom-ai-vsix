# contracts/ — 설명서 삽입

sLLM이 스캐폴드 규약을 모르고 생짜 React를 쓰는 것을 막기 위해,
프롬프트에 **계약카드**(useApi 봉투 계약, SmartTable 레시피, date-picker 골격 등)와
**컴포넌트 prop 인덱스**를 트리거 기반으로 자동 주입하는 층.
도식: [contracts-flow.svg](contracts-flow.svg) (이 층 흐름 전체) ·
`docs/diagrams/03-규약-자동주입.svg`, `06-계약카드-생애주기.svg`

- 위치: sLLM 콜 **직전** (④ 설명서 삽입)
- 원칙: 존재 기반 주입(쿼리·파일에 트리거가 있을 때만), 토큰 예산 준수
- 카드 기준: "스캐폴드가 generic과 **다른 방식을 강제**하는 오버라이드 규칙"만 카드감
  (일반 React 규칙은 기각 — 예외는 사용자 요청으로 추가된 handler-extraction 1종)
- 함정: 한글 트리거엔 정규식 `\b`가 안 먹는다 / 카드 본문은 coreRules·knowledge 문서의
  축약본이라 가이드 변경 시 **동반 갱신**(갈라지면 모델이 모순 지침을 받음)

## 구성 파일 (2026-07-13 이관 완료)

- `ScaffoldContracts.ts` — 계약카드 레지스트리 (**13종** = 규약 오버라이드 7 + 레시피 5 +
  일반 React 1). 외부 참조 0 (자립)
- `ComponentPropsIndex.ts` — 컴포넌트 prop 지식 계층 (`./generated/` 인덱스 소비)
- `promptBudget.ts` — 프롬프트 토큰 예산 (**계측 전용** — 게이트/폴백 결정에 안 씀. 외부 참조: `../config`)
- `generated/componentPropsIndex.ts` — `scripts/build-component-props.mjs` 산출물 (⚠ 직접 편집 금지,
  재생성은 **수동** `npm run build:component-props` — 실 scaffold 소스 필요, 부재 시 graceful skip)

## 계기판 (0단계 베이스라인 2026-07-16)

- `test:region-edit` **243/0** — 계약카드 발동·버튼·date-picker·SmartTable·local-data 케이스 포함
- `test:api-binding` **69/0** — useApi 봉투 계약(A1·A2)
- `eval:region` **88%(36/41)** · 평균 토큰 절감 60% · 평균 프롬프트 2,450토큰(예산 24,576의 10%)
- **"4. 설명서 삽입" 테스트 페이지**(`axiom-ai.stageTestPanel` → 4단계) — 전 카드 발동/미발동 +
  발동 근거(같은 `applies`를 입력만 비워 재호출하는 ablation — 미러 아님) + prop 표 + 토큰 비용.
  ②③ 패널과 동일하게 export 순수 함수 **직접 호출**(드리프트 0)

## 아직 여기 없는 것 (2단계 이관 대상)

- ScaffoldContextBuilder.ts의 buildContractSection 호출·프롬프트 조립부 — **분할 필요** (거대 파일, 전 폴더 이관 후)
