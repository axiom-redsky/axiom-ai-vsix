---
version: 1.0
project: react-app-scaffold
---

# 지식 인덱스

## 패턴

- keywords: [api, axios, api-client, 클라이언트, http, fetch, 통신, baseurl, interceptor, 인터셉터, error, 에러, callapi, apierror, apiresponse, initapiconfig]
  files: [patterns/api-call.md]
- keywords: [api-client, axios, baseaxiosclient, callapi, 소스, source, interceptor, 인터셉터, baseurl, token, 토큰]
  files: [patterns/api-client-source.md]
- keywords: [querykey, query-key, factory, 팩토리, tanstack, cache, 캐시키, invalidate]
  files: [patterns/query-key-factory.md]
- keywords: [router, 라우터, routing, 라우팅, createhashrouter, createapprouter, hash, 해시, route, 경로, navigate, 이동, loadable, 코드스플리팅, tapproute, lazy, 지연로딩, $router]
  files: [patterns/router.md]
- keywords: [provider, 프로바이더, appproviders, queryprovider, context, 컨텍스트, 상태, state, tanstack, devtools, sidebar, 레이아웃]
  files: [patterns/state-management.md]
- keywords: [useapi, 예제, example, get, post, invalidatequeries, refetch, reset, 사용예, 실사용, 코드예제]
  files: [patterns/use-api-example.md]
- keywords: [useapi, use-api, 소스, source, 구현, implementation, overload, iuseapiqueryoptions, iuseapimutationoptions, normalizebody, formdata]
  files: [patterns/use-api-source.md]
- keywords: [useapi, use-api, @axiom/hooks, query, mutation, get, post, put, delete, patch, 조회, 생성, 수정, 삭제, cache, 캐시, invalidate, enabled, 조건부, tanstack, usequery, usemutation, 훅]
  files: [patterns/use-api.md]
- keywords: [architecture, 아키텍처, 구조, 폴더, 레이어, folder, structure, directory, 디렉터리, layer, alias, 앨리어스, @axiom, @/, import, 임포트, stack, 스택, react, typescript, vite, tanstack]
  files: [scaffold/project-structure.md]

## React 코드 패턴

- keywords: [component, 컴포넌트, button, 버튼, input, 입력, table, 테이블, dialog, 모달, select, 드롭다운, form, 폼, card, badge, tabs, tailwind, 스타일, shadcn, @axiom/components, layout, 레이아웃, pascalcase]
  files: [react/component.md]

## 기존 항목 (수동 관리)

- keywords: [button, 버튼, btn, click, 클릭, cta, variant, destructive, outline, ghost]
  files: [components/Button.md]

- keywords: [table, 테이블, 목록, list, grid, 데이터표, 행, 열, row, column, 데이터그리드]
  files: [components/Table.md]

- keywords: [dialog, modal, 모달, popup, 팝업, 다이얼로그, sheet, 사이드패널]
  files: [components/Dialog.md]

- keywords: [input, 입력, text, 텍스트, 텍스트필드, label, 라벨, 필드]
  files: [components/Input.md]

- keywords: [select, dropdown, 드롭다운, 선택, combobox, option, 옵션]
  files: [components/Select.md]

- keywords: [form, 폼, 양식, 폼검증, submit, 제출, validation, 유효성, react-hook-form, zod]
  files: [components/Form.md, patterns/form-handling.md]

- keywords: [form, 폼, 양식, validation, 유효성, submit, 제출, react-hook-form, zod, 폼검증, 입력검증]
  files: [patterns/form-handling.md, components/Form.md]

- keywords: [naming, 이름, 네이밍, 규칙, convention, 파일명, 컴포넌트명, 훅명]
  files: [conventions/naming.md]

- keywords: [typescript, 타입, type, interface, generic, 제네릭, 타입스크립트, 타입정의]
  files: [conventions/typescript.md]

- keywords: [tailwind, tailwindcss, 스타일, css, 클래스, className, 다크모드, darkmode, brand]
  files: [components/Button.md]

## 디자인 시스템

- keywords: [design-system, 디자인시스템, 컴포넌트목록, component-list, variants, shadcn, axiom/components/ui, 전체컴포넌트, tbd, 추가예정, 확정컴포넌트]
  files: [design-system/components.md]

- keywords: [layout, 레이아웃, card, container, stack, grid, flexbox, scrollarea, 카드, 페이지구조, 목록화면, 상세화면, 폼화면, si프로젝트, 프로젝트별, 반응형, responsive, darkmode, 다크모드, rootlayout]
  files: [design-system/layout.md]

- keywords: [token, 토큰, 디자인토큰, color, 색상, typography, 타이포그래피, spacing, 간격, brand, 브랜드컬러, primitive, theme, darkmode, css-variable, tailwindcss]
  files: [design-system/tokens.md]

## 퍼블 컨벤션

- keywords: [publish, 퍼블, 마크업, markup, html, 퍼블리셔, publisher, 변환, convert, 클래스, class, 패턴, 버튼, 폼, 카드, 테이블, 모달]
  files: [publish/markup-patterns.md]

- keywords: [css-mapping, css매핑, 클래스매핑, class-mapping, shadcn, btn, form-control, card, modal, badge, 변환, convert, 퍼블, publish]
  files: [publish/css-mapping.md]

## 화면 템플릿

- keywords: [page-template, 페이지템플릿, 목록화면, list-page, listpage, 목록, list, 테이블, table, 검색, search, 필터, filter, 신규등록]
  files: [page-templates/list-page.md]

- keywords: [page-template, 페이지템플릿, 상세화면, detail-page, detailpage, 상세, detail, 뒤로가기, 조회, 읽기전용, readonly]
  files: [page-templates/detail-page.md]

- keywords: [page-template, 페이지템플릿, 폼화면, form-page, formpage, 폼, form, 등록, 수정, 입력, 저장, 취소, react-hook-form, zod, validation, 유효성]
  files: [page-templates/form-page.md]
