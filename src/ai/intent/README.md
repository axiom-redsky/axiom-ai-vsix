# intent/ — 의도 라우팅 (현관문)

사용자 프롬프트를 받아 **무엇을 할지**를 결정하는 층. 파일 수정인지, 페이지 생성인지,
단순 질문·잡담인지 분류해서 이후 파이프라인의 진입 경로를 정한다.

- 위치: sLLM 콜 **전**, 파이프라인 맨 앞 (① 현관문)
- 원칙: 추출·분류는 모델 위임(폴백 정규식), 실행은 충돌 안전(모호하면 되묻기)
- 관련 계획서: `docs/page-creation-intent-routing-plan.md`, `AXIOM_INTENT_ROUTING_REDESIGN.md`

## 이관 후보 (현재 src/ai/ 직하)

- `IntentClassifier.ts` — 모델 위임 의도분류 (플래그 experimental.intentClassifier)
- `IntentSignals.ts` — 정규식·신호 기반 오프라인 의도분류
- `IntentEmbeddingClassifier.ts` / `IntentLinearHead.ts` / `IntentExampleStore.ts` — 임베딩 분류 계열
- `OfflineIntentResolver.ts` — 오프라인 의도 해석
- `PageCreationDetector.ts` — 페이지 생성 의도 감지
- `CrossFileTargeting.ts` — "X를 수정" vs "X로 적용" 대상 파일 전환 판정
