---
version: 1.0
project: react-app-scaffold
---

# 지식 인덱스

## 패턴

- keywords: [$ui, ui, window.$ui, alert, 얼럿, 알림, 알림창, 알림팝업, 경고창, confirm, 컨펌, 확인창, 확인팝업, 확인취소, 예아니오, 다이얼로그, dialog, 모달, modal, 팝업, popup, window.alert, window.confirm, 브라우저알림, 네이티브알림, autodismiss, 자동닫힘, $ui.alert, $ui.confirm]
  files: [utils/ui.md]
- keywords: [axios, api-client, 클라이언트, baseurl, interceptor, 인터셉터, callapi, apierror, apiresponse, initapiconfig, getapiconfig, api설정, api-config, 인증헤더, 클라이언트내부, api내부구현]
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
- keywords: [useapi, use-api, invalidatequeries, refetch, reset, useapi사용예, useapi예제, usapi코드예제]
  files: [patterns/use-api-example.md]
- keywords: [useapi소스, use-api소스, useapi 소스, use-api 소스, useapi구현, useapi 구현, useapi내부, useapi 내부, usapi소스코드, overload, 오버로드, iuseapiqueryoptions, iuseapimutationoptions, normalizebody, formdata]
  files: [patterns/use-api-source.md]
- keywords: [useapi, use-api, @axiom/hooks, api, api호출, api통신, api함수, 통신, http, fetch, 요청, 호출, 데이터, 데이터조회, 데이터요청, 가져오기, 불러오기, 서버통신, query, mutation, get, post, put, delete, patch, 조회, 생성, 수정, 삭제, cache, 캐시, invalidate, enabled, 조건부, tanstack, usequery, usemutation, 훅]
  files: [patterns/use-api.md, patterns/use-api-example.md]
- keywords: [architecture, 아키텍처, 구조, 폴더, 레이어, folder, structure, directory, 디렉터리, layer, alias, 앨리어스, @axiom, @/, import, 임포트, stack, 스택, react, typescript, vite, tanstack]
  files: [scaffold/project-structure.md]
- keywords: [error, 에러, 오류, 에러처리, 오류처리, error-handling, 예외, exception, trycatch, try-catch, iserror, error.message, apierror, errorboundary, 에러바운더리, fallback, 폴백, 폴백ui, 빈상태, empty, 재시도, retry, 실패, fail, 401, 토큰부착]
  files: [patterns/error-handling.md, patterns/use-api.md]
- keywords: [custom-hook, 커스텀훅, 커스텀 훅, 훅작성, 훅만들기, 훅 만들기, use접두사, usedebounce, 디바운스, uselocalstorage, 로컬스토리지, usetoggle, 재사용로직, 로직분리, 로직추출, rules-of-hooks, 훅규칙, 조건부훅, 훅합성]
  files: [patterns/custom-hooks.md, react/component.md]
- keywords: [performance, 성능, 최적화, optimize, 느림, 렌더링최적화, 리렌더, 리렌더링, re-render, memo, react.memo, usememo, usecallback, 메모이제이션, memoization, 코드스플리팅, 코드 스플리팅, code-splitting, loadable, 지연로딩, 번들, bundle, 청크, chunk, staletime, 캐싱, 불필요한요청, 중복요청, 리스트키]
  files: [patterns/performance.md]
- keywords: [test, 테스트, testing, 검증, storybook, 스토리북, story, 스토리, stories, csf, 컴포넌트테스트, 컴포넌트 테스트, 유닛테스트, 단위테스트, unit-test, 훅테스트, mock, 모킹, mocking, msw, react-testing-library, rtl, api모킹, 시각검증, 상태검증]
  files: [patterns/testing.md]

## React 코드 패턴

- keywords: [컴포넌트패턴, 컴포넌트 패턴, 컴포넌트구조, 컴포넌트 구조, 코드구조, component구조, card, badge, tabs, tailwind, 스타일, shadcn, @axiom/components, 임포트컨벤션, import컨벤션, layout, 레이아웃, pascalcase, 선언순서, 선언 순서, 선언위치, 선언 위치, hook순서, 훅순서, 훅 순서, 훅선언순서, 훅 선언 순서, handler, 핸들러]
  files: [react/component.md]

## 기존 항목 (수동 관리)

- keywords: [button, 버튼, btn, click, 클릭, cta, variant, destructive, outline, ghost]
  files: [components/Button.md]

- keywords: [table, 테이블, 데이터테이블, 표, grid, 데이터표, 데이터그리드, 행, 열, row, column, tablecell, tablerow, tableheader]
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

- keywords: [design-system, 디자인시스템, 컴포넌트목록, 컴포넌트 목록, 컴포넌트리스트, component-list, variants, shadcn, axiom/components/ui, 전체컴포넌트, 사용가능한컴포넌트, 제공하는컴포넌트, ui컴포넌트, 컴포넌트종류, 어떤컴포넌트, 컴포넌트뭐있어, tbd, 추가예정, 확정컴포넌트]
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

- keywords: [page-template, 페이지템플릿, 목록화면, 목록 화면, list-page, listpage, 리스트화면, 리스트 화면, 검색화면, 검색 영역, 필터영역, 신규등록]
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

## 스캐폴드 공통 유틸 ($util)

- keywords: [util, 유틸, 유틸리티, 헬퍼, helper, $util, 공통함수, 공통유틸,
             금액, 통화, currency, 쉼표, comma, 콤마, 천단위, 천단위콤마, 3자리, 자릿수,
             숫자, number, 숫자포맷, 반올림, round, clamp, 범위제한, tonumber, 숫자변환, percent, 퍼센트, 백분율,
             날짜포맷, 날짜계산, adddays, addmonths, diffdays,
             문자열, string, capitalize, truncate, 말줄임, padstart, 자리수, mask, 마스킹, isempty, 공백제거]
  files: [utils/util.md]
- keywords: [cn, classname, 클래스명, 클래스, 클래스병합, 스타일병합, tailwind, twmerge, clsx, 조건부클래스, classnames]
  files: [utils/cn.md]

## 스캐폴드 공통 자산 카탈로그 (목록·한눈에)

- keywords: [카탈로그, catalog, 한눈에, overview, 전체목록, 제공하는기능, 제공기능, 공통자산, 공통기능, 뭐있어, 뭐가있어, 뭐가 있어, 뭐 있어, 어떤게있어, 어떤게 있어, 어떤기능, scaffold, 스캐폴드, scaffold기능, 스캐폴드기능, 기본제공]
  files: [catalog/overview.md]
- keywords: [훅, 훅목록, 훅 목록, hook, hooks, 커스텀훅, custom-hook, 공통훅, 제공하는훅, 사용가능한훅, 어떤훅, usetheme, usesidebar, 훅종류, 훅리스트, 훅뭐있어]
  files: [catalog/hooks.md]
- keywords: [공통함수, 공통함수목록, 함수목록, 함수 목록, 헬퍼목록, 유틸목록, 유틸 목록, 유틸함수, 유틸함수목록, 유틸함수 목록, 유틸 함수, 사용가능한유틸, 사용할수있는유틸]
  files: [catalog/overview.md, utils/util.md]
