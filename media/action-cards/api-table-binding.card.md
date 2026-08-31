---
schemaVersion: 1
id: api-table-binding
title: API → 테이블 바인딩
icon: 🔌
triggers: [바인딩, 연동, api 연결, api 적용, api 붙여, 테이블에 api, 데이터 연결, binding]
preconditions: [file-open, scaffold-detected]
slots:
  - name: endpoint
    label: 엔드포인트
    source: endpoint-list
    prefillFrom: query
action:
  type: command
  command: axiom.wizard.apiBinding
priority: 15
---

## 설명
현재 파일의 테이블에 API 응답을 바인딩합니다. 스펙에서 응답 타입을 만들고,
useApi 봉투 계약(`useApi<{ data: T[] }>` + `data?.data ?? []`)에 맞는 훅과 필드 매핑을
매핑 테이블 UI에서 확정합니다 — 정확·유사 이름은 자동 프리필, 애매한 행만 드롭다운
(compose binding의 오프라인 변형, 위저드는 Phase 2).
