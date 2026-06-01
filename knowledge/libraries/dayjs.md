---
title: dayjs 날짜 라이브러리
version: "^1.11"
tags: [dayjs, 날짜, date, format, 포맷, locale, 로케일, 요일, 한글요일, 날짜계산]
scope: library
related: [libraries/date-fns.md]
---

# dayjs

react-app-scaffold에 `dayjs ^1.11`이 설치되어 있다. `date-fns`도 함께 설치되어 있으며 둘 중 하나를 선택해 사용한다.

## 기본 포맷 토큰

```ts
import dayjs from 'dayjs';

dayjs().format('YYYY-MM-DD')        // 2026-06-01
dayjs().format('YYYY년 M월 D일')    // 2026년 6월 1일
dayjs().format('HH:mm:ss')          // 14:30:00
dayjs().format('YYYY-MM-DD HH:mm') // 2026-06-01 14:30
```

주요 토큰: `YYYY`(4자리 연), `MM`(2자리 월), `DD`(2자리 일), `HH`(24h 시), `mm`(분), `ss`(초)

## 한글 로케일 — 요일/월 한글 표시

```ts
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

dayjs.locale('ko'); // 전역 설정 (main.tsx 등 진입점에서 1회)

dayjs().format('dddd')         // 일요일
dayjs().format('ddd')          // 일
dayjs().format('YYYY년 M월 D일 (dddd)') // 2026년 6월 1일 (일요일)
```

특정 인스턴스에만 적용하려면: `dayjs().locale('ko').format('dddd')`

## 플러그인 로드 방법

```ts
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import weekday from 'dayjs/plugin/weekday';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);
dayjs.extend(weekday);
dayjs.locale('ko');
```

플러그인은 `extend()` 후 사용해야 한다. 진입점(`main.tsx`)에서 한 번만 설정하면 앱 전체에 적용된다.

## 날짜 계산 (add / subtract / diff)

```ts
dayjs().add(7, 'day')           // 7일 후
dayjs().subtract(1, 'month')    // 1달 전
dayjs('2026-12-31').diff(dayjs(), 'day') // 오늘부터 남은 일수

// relativeTime 플러그인 필요
dayjs().from(dayjs('2026-01-01')) // "5개월 전" (locale ko 설정 시 한글)
dayjs('2026-12-31').fromNow()     // "6개월 후"
```

## 커스텀 포맷 파싱 (customParseFormat 플러그인 필요)

```ts
dayjs('20260601', 'YYYYMMDD')          // 비표준 형식 파싱
dayjs('2026/06/01 14:30', 'YYYY/MM/DD HH:mm')
```

## dayjs vs date-fns 선택 기준

- **dayjs**: 메서드 체인 방식, 로케일/플러그인 전역 설정 선호 시
- **date-fns**: 함수형(tree-shakeable), v4부터 named import만 사용
