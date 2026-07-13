# decompose/ — 분해

원본 소스와 프롬프트를 sLLM에 줄 수 있는 **재료**로 쪼개는 층.
두 갈래: **쿼리 분해**(토큰화, 복합 도메인어 어근 분해)와
**배경·의존성 분해**(현재 파일에서 관련 섹션·훅·타입만 추출).
도식: `docs/diagrams/07-분해-로직.svg`

- 위치: sLLM 콜 **전** (② 분해)
- 원칙: 분해·대조는 결정론. 모델에게는 판단 한 조각만 남긴다.

## 구성 파일 (2026-07-13 이관 완료)

- `SectionExtractor.ts` — md·쿼리 섹션 분해, tokenizeQuery(복합 도메인어 어근 분해), API 경로 추출
- `CodeSectionExtractor.ts` — TS 파일 섹션 분해(splitTsSections), 관련 슬라이스 추출
- `FunctionSpotlight.ts` — 관련 함수만 조명
- `RegionInputQuality.ts` — 분해 산출물(입력) 품질 측정 (⚠ 상위 `../RegionEdit` 참조 — locate/ 이관 시 경로 재수정 필요)
- `RegionIntent.ts` — 영역편집 쿼리 파싱·토큰화, 컨트롤 태그 함의
- `EditorContextCollector.ts` — 에디터 상태(현재 파일·선택) 수집

## 아직 여기 없는 것 (2단계 이관 대상)

- ScaffoldContextBuilder.ts의 deps 추출부 — **분할 필요** (거대 파일, 전 폴더 이관 후)
