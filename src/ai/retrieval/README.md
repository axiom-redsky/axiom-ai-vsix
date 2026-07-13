# retrieval/ — 지식 검색·RAG

루트 `knowledge/` 폴더의 **문서(데이터)**를 읽고·인덱싱·랭킹하는 **코드** 층.
Q&A 응답과 오프라인 폴백이 주 소비자. 편집 파이프라인과는 별개의 보조 축.
도식: `docs/diagrams/07-오프라인응답.svg`

- ⚠ 이름 주의: 루트 `knowledge/` = md 문서 데이터, 여기 `retrieval/` = 검색 코드. 다른 것.
- 원칙: 오프라인 개선 시 공유 어휘스코어러(buildContext)는 절대 수정 금지 (온라인 영향)
- RAG는 knowledge/만 인덱싱한다 (워크스페이스 실소스는 인덱싱 안 함)

## 이관 후보 (현재 src/ai/ 직하)

- `OfflineKnowledgeRetriever.ts` / `KnowledgeDoc.ts` — 오프라인 의미검색·문서통째 렌더
- `RagRetriever.ts` / `KeywordRetriever.ts` / `HybridRagEngine.ts` — 검색 엔진 계열
- `EmbeddingService.ts` / `VectorMath.ts` — 임베딩·벡터 연산
- `ExternalCorpusLoader.ts` / `FileContextRetriever.ts` — 코퍼스·파일 컨텍스트 로더
- `OfflineResponder.ts` / `OfflineTransplant.ts` / `FallbackStubService.ts` — 오프라인 응답 합성
