---
schemaVersion: 1
id: use-api-doc
title: useApi 사용 가이드
icon: 📚
triggers: [useapi, use api, api 사용법, api 호출 방법, 봉투 계약, 응답 구조, 응답 타입]
# scaffold 공통 훅의 계약을 설명하는 문서라, scaffold 워크스페이스가 아니면 의미가 없다.
preconditions: [scaffold-detected]
action:
  type: doc
  doc: scaffold-docs/use-api
priority: 10
---

## 설명
스캐폴드 공통 훅 useApi의 사용법 문서를 보여줍니다 — 봉투 계약
(`useApi<{ data: T[] }>`가 본문을 봉투째 반환), refetch, 파라미터 전달 규칙.
