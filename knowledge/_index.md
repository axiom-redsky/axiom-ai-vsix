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
- keywords: [navigate, navigation, 이동버튼, 이동하는, 네비게이션, usenavigate, 화면이동, 페이지이동, 뒤로가기, 루트로이동, 메인으로이동, 버튼추가, 이동코드, router.push]
  files: [patterns/navigation.md]
- keywords: [page-generation, createpage, newpage, addpage, page, screen, router, route, path, kebab-case, 페이지생성, 페이지추가, 화면생성, 라우터생성]
  files: [patterns/page-generation.md, patterns/router.md]
- keywords: [provider, 프로바이더, appproviders, queryprovider, context, 컨텍스트, 상태, state, tanstack, devtools, sidebar, 레이아웃]
  files: [patterns/state-management.md]
- keywords: [useapi, 예제, example, get, post, invalidatequeries, refetch, reset, 사용예, 실사용, 코드예제]
  files: [patterns/use-api-example.md]
- keywords: [useapi, use-api, 소스, source, 구현, implementation, overload, iuseapiqueryoptions, iuseapimutationoptions, normalizebody, formdata]
  files: [patterns/use-api-source.md]
- keywords: [useapi, use-api, @axiom/hooks, query, mutation, get, post, put, delete, patch, 조회, 생성, 수정, 삭제, cache, 캐시, invalidate, enabled, 조건부, tanstack, usequery, usemutation, 훅]
  files: [patterns/use-api.md, patterns/use-api-example.md]
- keywords: [architecture, 아키텍처, 구조, 폴더, 레이어, folder, structure, directory, 디렉터리, layer, alias, 앨리어스, @axiom, @/, import, 임포트, stack, 스택, react, typescript, vite, tanstack]
  files: [scaffold/project-structure.md]

## React 코드 패턴

- keywords: [component, 컴포넌트, button, 버튼, input, 입력, table, 테이블, dialog, 모달, select, 드롭다운, form, 폼, card, badge, tabs, tailwind, 스타일, shadcn, @axiom/components, layout, 레이아웃, pascalcase, 선언순서, 선언위치, hook순서, usestate, useref, useapi, useeffect, handler, 핸들러, 컴포넌트구조, 코드구조]
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

## 라이브러리 사용법

- keywords: [dayjs, 날짜, date, format, 포맷, locale, 로케일, 요일, 한글요일, 날짜포맷,
             상대시간, relativetime, 날짜파싱, 날짜계산, customparsformat, weekday,
             YYYY, MM, DD, dddd, 날짜라이브러리, 날짜변환, 날짜비교]
  files: [libraries/dayjs.md]

- keywords: [zustand, 스토어, store, 전역상태, global-state, 상태관리, create, useStore,
             devtools, 선택자, 전역변수, 공유상태, 글로벌스토어, zustand5]
  files: [libraries/zustand.md]

- keywords: [date-fns, datefns, format, parse, isvalid, differenceInDays, addDays, addMonths,
             날짜유틸, 날짜함수, parseISO, formatDistance, formatDistanceToNow]
  files: [libraries/date-fns.md]

- keywords: [animejs, anime, 애니메이션, animation, animate, timeline, keyframes,
             자바스크립트애니메이션, 모션, motion, 트랜지션, easing, 스크롤애니메이션]
  files: [libraries/animejs.md]

- keywords: [react-table, tanstack-table, usereacttable, columndef, columnhelper,
             테이블정렬, 테이블필터, 페이지네이션, sorting, filtering, pagination,
             테이블상태, 컬럼정의, 테이블훅]
  files: [libraries/react-table.md]

- keywords: [react-day-picker, daypicker, 달력, calendar, 날짜선택, datepicker,
             캘린더, 날짜피커, 달력컴포넌트, 달력선택]
  files: [libraries/react-day-picker.md]

- keywords: [lodash, debounce, throttle, groupby, pick, omit, clonedeep,
             flatmap, uniqby, orderby, chunk, flatten, 유틸리티, 헬퍼함수, 배열처리, 객체처리]
  files: [libraries/lodash.md]

- keywords: [lottie, lottie-react, 애니메이션파일, json애니메이션, LottiePlayer,
             useLottie, 로티, 로티애니메이션, lottie파일]
  files: [libraries/lottie-react.md]

## 스펙 작성 가이드

- keywords: [spec, 스펙, 스펙구조, spec-guide, spec-structure, 섹션, 복잡도, L1, L2, L3,
             컴포넌트트리, component-tree, props, state, 상태, render-logic, 렌더조건,
             events, 이벤트, form, 폼스펙, edge-cases, 예외처리, 수락기준, 스펙작성]
  files: [spec-guide/spec-structure.md]
