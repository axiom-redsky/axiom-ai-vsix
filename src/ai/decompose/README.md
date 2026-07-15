# decompose/ — 분해

원본 소스와 프롬프트를 sLLM에 줄 수 있는 **재료**로 쪼개는 층.
두 갈래: **쿼리 분해**(토큰화, 복합 도메인어 어근 분해)와
**배경·의존성 분해**(현재 파일에서 관련 섹션·훅·타입만 추출).
도식: [decompose-flow.svg](decompose-flow.svg) (로직 흐름도)

## 계기판 (단계별 테스트)

- **2. 분해 테스트** 페이지(`axiom-ai.stageTestPanel` → 2단계) — 프롬프트+현재 파일을 넣으면 이 층의
  두 갈래 산출물을 실제로 보여준다. intent 패널과 달리 이 폴더의 함수는 전부 `export`된 순수 함수라
  **직접 호출**한다(운영 미러 아님 → 동기화 드리프트 0). 구현: `src/providers/DecomposeProbePanel.ts` ·
  `src/webview/decomposeProbe/DecomposeProbeApp.tsx`
- 합성 계기판: `eval:input`(입력 품질) · `eval:bigfile`(큰 파일 deps 폭주 정량)

- 위치: sLLM 콜 **전** (② 분해)
- 원칙: 분해·대조는 결정론. 모델에게는 판단 한 조각만 남긴다.

## 구성 파일 (2026-07-13 이관 완료)

- `SectionExtractor.ts` — md·쿼리 섹션 분해, tokenizeQuery(복합 도메인어 어근 분해), API 경로 추출
- `CodeSectionExtractor.ts` — TS 파일 섹션 분해(splitTsSections), 관련 슬라이스 추출
- `FunctionSpotlight.ts` — 관련 함수만 조명
- `RegionInputQuality.ts` — 분해 산출물(입력) 품질 측정 (외부 참조: `../locate/RegionEdit`)
- `RegionIntent.ts` — 영역편집 쿼리 파싱·토큰화, 컨트롤 태그 함의
- `EditorContextCollector.ts` — 에디터 상태(현재 파일·선택) 수집

## 아직 여기 없는 것 (2단계 이관 대상)

- ScaffoldContextBuilder.ts의 deps 추출부 — **분할 필요** (거대 파일, 전 폴더 이관 후)
