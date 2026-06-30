---
title: react-app-scaffold 공통 자산 한눈에 (유틸·훅·공통함수·컴포넌트)
version: "1.0"
tags: [목록, 리스트, 카탈로그, catalog, 한눈에, overview, 전체목록, 제공하는기능, 제공기능, 사용가능,
       공통자산, 공통기능, 뭐있어, 뭐가있어, 어떤게있어, 어떤기능, 무슨기능,
       유틸, 훅, 공통함수, 공통함수목록, 컴포넌트, scaffold기능, 스캐폴드기능, 기본제공,
       금융, finance, 이자, 상환, 환율, 객체, object, 배열, array, groupBy, 트리, 중복제거]
scope: scaffold
related: [utils/util.md, utils/cn.md, patterns/router.md, catalog/hooks.md, design-system/components.md]
---

# react-app-scaffold 공통 자산 목록

업무 개발 시 바로 쓸 수 있는 스캐폴드 기본 제공 자산을 한눈에 정리한다. 카테고리별 상세는 링크 문서를 참고.

## 1. 전역 유틸 `$util` (import 불필요)

`$router`처럼 전역 등록되어 어디서나 바로 사용. 상세: [util.md](../utils/util.md)

| 네임스페이스 | 주요 함수 |
|-------------|----------|
| `$util.number` | `comma`(천단위콤마/금액) · `round`/`floor`/`ceil` · `clamp` · `toNumber` · `percent` · `vat`(부가세) · `currency` · `toKorean`(한글금액) · `abbreviate`(만/억) · `add`/`subtract`(부동소수점 안전) |
| `$util.date` | `format` · `now` · `parse` · `addDays`/`addMonths`/`addYears` · `diffDays` · `startOf`/`endOf` · 영업일(`isBusinessDay`·`addBusinessDays`·`nextBusinessDay`) · `age`(만나이) · `getQuarter` · `formatKorean` |
| `$util.string` | `isEmpty` · `truncate` · `padStart` · `mask` · 검증(`isEmail`·`isMobile`·`isRRN`·`isBizNo`·`isCardNo`) · 마스킹(`maskName`·`maskMobile`·`maskRRN`) · 포맷(`formatMobile`·`formatBizNo`) · `getChosung`(초성) · `josa`(조사) · `camelCase` |
| `$util.finance` | `simpleInterest`/`compoundInterest`(이자) · `maturityAmount`(만기) · `monthlyPayment`·`amortization`(원리금균등상환) · `exchange`(환율) · `splitAmount`(금액분할) · `supplyPrice`(공급가액 역산) |
| `$util.object` | `deepClone` · `deepEqual` · `pick`/`omit` · `get`/`set`(점 표기 경로) · `cleanEmpty`(빈 값 정리) · `merge`(깊은 병합) |
| `$util.array` | `groupBy` · `sortBy` · `sum`/`sumBy` · `uniq`/`uniqBy` · `chunk` · `toTree`/`flattenTree`(평면↔트리) |

## 2. 공통 함수 / 헬퍼

| 이름 | import | 용도 | 상세 |
|------|--------|------|------|
| `$util.*` | (전역) | 숫자·날짜·문자열·금융·객체·배열 (위 표) | [util.md](../utils/util.md) |
| `$router` | (전역) | `push` · `replace` · `back` 화면 이동 | [router.md](../patterns/router.md) |
| `$ui` | (전역) | `alert` · `confirm` 다이얼로그(window.alert/confirm 대체) | [ui.md](../utils/ui.md) |
| `cn` | `@/shared/utils/cn` | className 병합(clsx + tailwind-merge) | [cn.md](../utils/cn.md) |

## 3. 공통 훅

| 훅 | import | 용도 |
|----|--------|------|
| `useApi` | `@axiom/hooks` | API 조회/변경(TanStack Query) — 앱 개발자 표준 |
| `useTheme` | `@/core/hooks/theme/useTheme` | 테마 상태·토글 |
| `useSidebar` | (레이아웃 내부) | 사이드바 상태(레이아웃 전용) |

상세: [hooks.md](hooks.md)

## 4. UI 컴포넌트

`@axiom/components/ui`에서 import. Button·Input·Select·Form·Card·Table·Dialog·Badge·Tabs·Accordion 등 다수 제공.

데이터 그리드가 필요하면 **`SmartTable`**(컬럼을 설정 맵으로 선언 → 포맷·정렬·검색·페이징·병합헤더·합계·행선택·export·서버모드 자동) 사용. 상세: [SmartTable.md](../components/SmartTable.md)

전체 목록·variants·상태(confirmed/tbd)는 [components.md](../design-system/components.md) 참고.
