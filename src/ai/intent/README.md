# intent/ — 의도 라우팅 (현관문)

사용자 프롬프트를 받아 **무엇을 할지**를 결정하는 층. 파일 수정인지, 페이지 생성인지,
단순 질문·잡담인지 분류해서 이후 파이프라인의 진입 경로를 정한다.

- 위치: sLLM 콜 **전**, 파이프라인 맨 앞 (① 현관문)
- 원칙: 추출·분류는 모델 위임(폴백 정규식), 실행은 충돌 안전(모호하면 되묻기)
- **로직 흐름도: [intent-flow.svg](intent-flow.svg)** — 판정→라우트 결정→대상 파일 해석 전체 사슬(2026-07-14)
- 관련 계획서: `docs/page-creation-intent-routing-plan.md`, `AXIOM_INTENT_ROUTING_REDESIGN.md`

## 구성 파일 (2026-07-13 이관 완료)

- `IntentClassifier.ts` — 모델 위임 의도분류 (플래그 experimental.intentClassifier). `IntentKind`/`IntentResult`/`IntentContext` 타입 허브
- `IntentSignals.ts` — 정규식·신호 기반 분류 (classifyOfflineIntent = 통합 폴백, S1의 핵심)
- `IntentEmbeddingClassifier.ts` / `IntentLinearHead.ts` / `IntentExampleStore.ts` — 임베딩 분류 계열 (`../retrieval/EmbeddingService`, `../retrieval/VectorMath` 참조)
- `OfflineIntentResolver.ts` — 오프라인 의도 해석
- `PageCreationDetector.ts` — 페이지 생성 의도 감지 (분류기의 폴백·충돌가드)
- `CrossFileTargeting.ts` — "X를 수정" vs "X로 적용" 대상 파일 전환 판정

## 아직 여기 없는 것 (2단계 이관 대상)

- **라우팅 '결정' 로직의 큰 덩어리는 `src/providers/ChatViewProvider.ts`에 인라인**:
  분류기 호출·폴백 배선, create→modify 충돌가드, qnaGated·isFileCtx 게이트 판정,
  S1 effectiveIntent 비파괴 측정 로그. 라우팅 재설계 트랙(S2~)에서 단일 라우터로 추출 예정.
