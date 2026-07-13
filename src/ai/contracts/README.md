# contracts/ — 설명서 삽입

sLLM이 스캐폴드 규약을 모르고 생짜 React를 쓰는 것을 막기 위해,
프롬프트에 **계약카드**(useApi 봉투 계약, SmartTable 레시피, date-picker 골격 등)와
**컴포넌트 prop 인덱스**를 트리거 기반으로 자동 주입하는 층.
도식: `docs/diagrams/03-규약-자동주입.svg`, `06-계약카드-생애주기.svg`

- 위치: sLLM 콜 **직전** (④ 설명서 삽입)
- 원칙: 존재 기반 주입(쿼리·파일에 트리거가 있을 때만), 토큰 예산 준수
- 함정: 한글 트리거엔 정규식 `\b`가 안 먹는다

## 이관 후보 (현재 src/ai/ 직하)

- `ScaffoldContracts.ts` — 계약카드 레지스트리 (11종)
- `ComponentPropsIndex.ts` — 컴포넌트 prop 지식 계층 (generated/ 인덱스 소비)
- `promptBudget.ts` — 프롬프트 토큰 예산
- `generated/` — build-component-props.mjs 산출물 (⚠ 직접 편집 금지)
- ScaffoldContextBuilder.ts의 buildContractSection·프롬프트 조립부 — **분할 필요** (2단계 이관 대상)
