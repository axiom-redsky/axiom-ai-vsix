---
title: 전역 유틸 $util (숫자·날짜·문자열)
version: "1.0"
tags: [util, 유틸, 유틸리티, 헬퍼, helper, $util, window.util, 공통함수, format, 포맷, 변환,
       금액, 통화, currency, 쉼표, comma, 천단위, 천단위콤마, 3자리, 콤마, 숫자포맷, number,
       반올림, round, clamp, 범위제한, toNumber, 숫자변환, percent, 퍼센트, 백분율,
       날짜포맷, dateformat, addDays, addMonths, diffDays, 날짜계산,
       문자열, string, capitalize, truncate, 말줄임, padStart, 자리수, mask, 마스킹, isEmpty, 공백제거]
scope: scaffold
related: [patterns/router.md, libraries/dayjs.md]
---

# 전역 유틸 $util

react-app-scaffold는 공통 유틸을 **전역 `$util`** 로 제공한다. `$router`와 동일하게 **import 없이** 어디서나 쓸 수 있다(전역 등록은 `main.tsx`의 `registerWindowUtil()`이 1회 수행). 타입은 `@/types/common`의 `IUtils`.

```ts
// import 불필요 — 전역으로 바로 사용
$util.number.comma(1234567);   // "1,234,567"
$util.date.format(new Date()); // "2026-06-01"
$util.string.truncate('가나다라마', 3); // "가나다..."
```

- 구현 위치: `src/core/utils/util/{number,date,string}.ts` (`createWindowUtil()`로 조립)
- 루트 타입: `IUtils { date: IDateUtil; number: INumberUtil; string: IStringUtil }`
- ⛔ 직접 `import { numberUtil } ...` 하지 말고 전역 `$util.number...`로 쓰는 것이 스캐폴드 컨벤션이다. (named export도 있으나 전역 사용 권장)

## 숫자 유틸 — $util.number

금액 표기(천 단위 콤마)·반올림·범위 제한·숫자 변환·백분율.

```ts
// 금액 표기: 3자리(천 단위) 쉼표 — 정수부에만 콤마, 소수부는 유지
$util.number.comma(1234567);     // "1,234,567"
$util.number.comma('1234567.89'); // "1,234,567.89"
$util.number.comma('abc');        // "" (유효하지 않으면 빈 문자열)

// 반올림 (digits 기본 0)
$util.number.round(3.14159, 2);  // 3.14
$util.number.round(2.5);         // 3

// 범위 제한
$util.number.clamp(120, 0, 100); // 100

// 문자열에서 숫자만 추출(콤마·통화기호 제거) → number, 실패 시 fallback
$util.number.toNumber('1,234원');     // 1234
$util.number.toNumber('', 0);         // 0

// 0~1 비율 → 백분율 문자열 (digits 기본 1)
$util.number.percent(0.123);     // "12.3%"
```

시그니처:
```ts
interface INumberUtil {
  comma(value: number | string): string;            // 천 단위 콤마(금액 표기)
  round(value: number, digits?: number): number;     // 반올림(기본 0자리)
  clamp(value: number, min: number, max: number): number;
  toNumber(value: unknown, fallback?: number): number;
  percent(value: number, digits?: number): string;   // 비율→백분율(기본 1자리)
}
```

## 날짜 유틸 — $util.date

내부적으로 dayjs(+customParseFormat)를 쓰지만, 날짜는 이 유틸을 통해 다루는 것이 컨벤션이다. (dayjs 직접 사용도 가능 — `libraries/dayjs.md` 참고)

```ts
$util.date.format(new Date(), 'YYYY-MM-DD'); // "2026-06-01" (기본 포맷 YYYY-MM-DD)
$util.date.now();                            // "2026-06-01 14:30:00" (기본 YYYY-MM-DD HH:mm:ss)
$util.date.parse('2026-06-01', 'YYYY-MM-DD'); // Date | null (엄격 파싱)
$util.date.addDays(new Date(), 7);           // 7일 후 Date (음수 가능)
$util.date.addMonths(new Date(), -1);        // 1달 전 Date
$util.date.diffDays('2026-12-31', new Date()); // 두 날짜 일수 차(a - b)
$util.date.isValid('2026-13-01');            // false
```

시그니처:
```ts
type DateInput = Date | string | number;
interface IDateUtil {
  format(date?: DateInput, template?: string): string; // 기본 'YYYY-MM-DD'
  now(template?: string): string;                      // 기본 'YYYY-MM-DD HH:mm:ss'
  parse(value: DateInput, template?: string): Date | null;
  addDays(date: DateInput, amount: number): Date;
  addMonths(date: DateInput, amount: number): Date;
  diffDays(a: DateInput, b: DateInput): number;
  isValid(value: DateInput): boolean;
}
```

## 문자열 유틸 — $util.string

```ts
$util.string.isEmpty('   ');             // true (null/undefined/공백)
$util.string.capitalize('hello');        // "Hello"
$util.string.truncate('가나다라마', 3);   // "가나다..." (suffix 기본 '...')
$util.string.padStart(7, 3);             // "007" (fill 기본 '0')
$util.string.removeWhitespace('a b c');  // "abc"
$util.string.mask('01012345678', 3, 7);  // "010****5678" (start~end 구간 마스킹)
```

시그니처:
```ts
interface IStringUtil {
  isEmpty(value: unknown): boolean;
  capitalize(value: string): string;
  truncate(value: string, length: number, suffix?: string): string;
  padStart(value: string | number, length: number, fill?: string): string;
  removeWhitespace(value: string): string;
  mask(value: string, start: number, end: number, maskChar?: string): string;
}
```
