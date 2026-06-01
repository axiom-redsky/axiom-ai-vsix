---
title: date-fns 날짜 유틸리티
version: "^4.1"
tags: [date-fns, format, parse, isValid, 날짜유틸, 날짜함수, parseISO, formatDistance]
scope: library
related: [libraries/dayjs.md]
---

# date-fns

react-app-scaffold에 `date-fns ^4.1`이 설치되어 있다. v2/v3과 import 방식이 다르므로 주의.

## v4 import 방식 (named import만 사용)

```ts
// v4 올바른 방법 — named import
import { format, parse, isValid, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

// v2/v3 방식 — 사용 금지
import format from 'date-fns/format'; // 개별 파일 경로 금지
```

## 기본 포맷

```ts
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

format(new Date(), 'yyyy-MM-dd')              // 2026-06-01
format(new Date(), 'yyyy년 M월 d일')          // 2026년 6월 1일
format(new Date(), 'EEEE', { locale: ko })    // 일요일
format(new Date(), 'yyyy년 M월 d일 (EEEE)', { locale: ko }) // 2026년 6월 1일 (일요일)
```

date-fns 토큰은 dayjs와 다름: `yyyy`(소문자), `d`(일), `EEEE`(요일 전체명)

## 날짜 파싱

```ts
import { parse, parseISO, isValid } from 'date-fns';

parseISO('2026-06-01')                          // ISO 문자열 → Date
parse('2026/06/01', 'yyyy/MM/dd', new Date())  // 커스텀 형식 파싱

// 유효성 검사
isValid(parseISO('2026-06-01'))  // true
isValid(parseISO('invalid'))     // false
```

## 날짜 계산

```ts
import { addDays, addMonths, subDays, differenceInDays, differenceInMonths } from 'date-fns';

addDays(new Date(), 7)                              // 7일 후
addMonths(new Date(), 1)                            // 1달 후
subDays(new Date(), 1)                              // 어제
differenceInDays(new Date('2026-12-31'), new Date()) // 오늘부터 남은 일수
```

## 상대 시간 표시

```ts
import { formatDistance, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

formatDistanceToNow(new Date('2026-01-01'), { locale: ko, addSuffix: true })
// "5개월 전"

formatDistance(new Date('2026-01-01'), new Date(), { locale: ko })
// "5개월"
```

## dayjs vs date-fns 선택 기준

- **date-fns**: 함수형 스타일, tree-shaking 효율 높음, 번들 크기 최소화 필요 시
- **dayjs**: 메서드 체인 선호, 플러그인 생태계 활용 시
- 한 프로젝트에서 둘 다 혼용 가능하나 통일 권장
