---
schemaVersion: 1
id: api-table-binding
title: API → 테이블 바인딩
icon: 🔌
triggers: [바인딩, 연동, api 연결, api 적용, api 붙여, 테이블 api, 데이터 연결, binding]
preconditions: [file-open, scaffold-detected]
slots:
  - name: endpoint
    label: 엔드포인트
    source: endpoint-list
    prefillFrom: query
action:
  type: binding
  binding: api-table
priority: 15
---

## 설명
현재 파일의 테이블에 API 응답을 바인딩합니다. 스펙에서 응답 타입을 만들고,
useApi 봉투 계약(`useApi<{ data: T[] }>` + `data?.data ?? []`)에 맞는 훅과 로딩·에러 가드를
결정론으로 조립합니다(LLM 미사용). 이름이 같거나 비슷한 필드는 아래 표에 미리 채워두었고,
애매한 행만 드롭다운으로 고르면 됩니다 — API에 없는 컬럼은 `(컬럼 제거)`를 고르세요.
