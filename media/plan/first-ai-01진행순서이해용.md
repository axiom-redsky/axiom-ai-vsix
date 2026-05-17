## 프롬프트 입력 후 RAG읽어가는 순서 이해하기.
사용자: "useApi 훅 사용 예제 알려줘"  
                       ↓  
lowercase: "useapi 훅 사용 예제 알려줘"  

_index.md 순서대로 비교:  
  line 24: keywords: [useapi, use-api, @axiom/hooks, ...]  
  → "useapi" ← includes 체크 → ✓ 매칭!  
  → files: [patterns/use-api.md] 수집  

  line 21: keywords: [useapi, 예제, example, ...]
  → "useapi" ← ✓ 매칭! + "예제" ← ✓ 매칭!
  → files: [patterns/use-api-example.md] 수집

  → 매칭된 .md 파일 2개를 실제로 읽어서 내용 반환


흐름을 2단계로 정리하면:

1단계 — _index.md 스캔 (KeywordRetriever.ts:43-53)


_index.md의 keywords 배열을 하나씩 순회
→ 사용자 쿼리.includes(keyword) 로 단순 포함 여부 체크  
→ 매칭된 entry의 files 목록 수집  
2단계 — 링크된 파일 읽기 (KeywordRetriever.ts:61-71)


수집된 files 경로들 (예: patterns/use-api.md)  
→ .rag/ 디렉터리 기준 절대경로로 변환  
→ 파일 내용 읽기  
→ "## [patterns/use-api.md]\n\n{파일 전체 내용}" 형태로 포장  
→ 시스템 프롬프트에 삽입  


한 가지 주목할 점은 _index.md:52-55처럼 같은 files가 여러 keywords 항목에 걸릴 수 있는데, 이때는 HybridRagEngine._dedupe()가 문서의 첫 줄(헤더)을 기준으로 중복을 제거해서 같은 파일이 시스템 프롬프트에 두 번 들어가지 않도록 처리합니다.



여기까지가 방법1 단계. 이후는 다음과 같음.

방법 1 = 사용자가 입력한 질문 기준으로 RAG 수집
방법 2 = 사용자가 현재 열어둔 파일 기준으로 RAG 수집
방법 3 = 방법 1+2로 부족할 때 의미적 유사도로 RAG 보충