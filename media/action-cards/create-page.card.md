---
schemaVersion: 1
id: create-page
title: 페이지 생성
icon: 📄
triggers: [페이지, 화면 만들, 화면 생성, 화면 추가, 목록 페이지, 리스트 페이지, 폼 페이지, 상세 페이지, page]
preconditions: [scaffold-detected]
slots:
  - name: domain
    label: 도메인
    source: domain-list
    prefillFrom: query
  - name: pageName
    label: 이름
    source: text
    prefillFrom: query
  - name: pageType
    label: 유형
    source: enum
    options: [목록, 폼, 상세]
    prefillFrom: query
action:
  type: template
  template: page
  outputs: ["+ src/domains/{{domain}}/pages/{{pageName}}.tsx", "± src/domains/{{domain}}/router/index.tsx (경로 추가)"]
priority: 20
---

## 설명
스캐폴드 규약(도메인 구조·라우터 배선)에 맞는 페이지를 템플릿으로 생성합니다.
page.template.txt + router.template.txt 결정론 생성 — 자연어 해석 없이 항상 같은 결과가 나옵니다.
