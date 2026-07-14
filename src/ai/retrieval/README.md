# retrieval/ — 지식 검색·RAG

루트 `knowledge/` 폴더의 **문서(데이터)**를 읽고·인덱싱·랭킹하는 **코드** 층.
Q&A 응답과 오프라인 폴백이 주 소비자. 편집 파이프라인과는 별개의 보조 축.
도식: `docs/diagrams/07-오프라인응답.svg`

- ⚠ 이름 주의: 루트 `knowledge/` = md 문서 데이터, 여기 `retrieval/` = 검색 코드. 다른 것.
- 원칙: 오프라인 개선 시 공유 어휘스코어러(buildContext)는 절대 수정 금지 (온라인 영향)
- RAG는 knowledge/만 인덱싱한다 (워크스페이스 실소스는 인덱싱 안 함)

## 구성 파일 (2026-07-14 이관 완료)

- `OfflineKnowledgeRetriever.ts` / `KnowledgeDoc.ts` — 오프라인 의미검색·문서통째 렌더
- `RagRetriever.ts` / `KeywordRetriever.ts` / `HybridRagEngine.ts` — 검색 엔진 계열
- `EmbeddingService.ts` / `VectorMath.ts` — 임베딩·벡터 연산 (intent/ 분류기도 소비)
- `ExternalCorpusLoader.ts` / `FileContextRetriever.ts` — 코퍼스·파일 컨텍스트 로더
- `OfflineResponder.ts` / `OfflineTransplant.ts` / `FallbackStubService.ts` — 오프라인 응답 합성

12파일은 서로끼리 참조하는 닫힌 클러스터라 내부 경로는 무수정.
외부 소비자 = extension.ts(EmbeddingService 워밍업) · ChatViewProvider(오프라인 3종) ·
ScaffoldContextBuilder(RAG 3종) · pipeline/LlmService(FallbackStubService) · intent/ 2파일.
