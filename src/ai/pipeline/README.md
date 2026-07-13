# pipeline/ — 오케스트레이터

어느 한 층에 속하지 않고 **전 단계를 순서대로 지휘**하는 코드.
분해 → 위치찾기 → 설명서 삽입 → sLLM 콜 → 게이트·적용의 흐름 제어,
실패 시 폴백(full 재시도, grounded patch retry), 검증-교정 루프의 루프 자체가 여기.

- 위치: 파이프라인 관통 (특정 층 아님)
- 원칙: 층의 구현 세부를 모르는 채로 호출만 한다 (층 내부 로직을 여기에 넣지 말 것)

## 이관 후보 (현재 src/ai/ 직하)

- `RegionEditService.ts` — runHybridRegionEdit (영역편집 파이프라인 지휘자)
- `FileCreatorService.ts` — 파일 생성 파이프라인
- `LlmService.ts` — sLLM 클라이언트 (엄밀히는 인프라 — 나중에 llm/ 분리도 검토 가능)
- `RegionCaptureRecorder.ts` — 실패 포집 (파이프라인에 배선된 계측)
