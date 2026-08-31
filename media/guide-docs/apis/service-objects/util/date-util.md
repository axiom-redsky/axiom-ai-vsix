---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.date'
---

# $util.date

`react-app-scaffold`에서 전역으로 제공하는 **날짜(Date) 유틸리티**입니다.
날짜 포맷팅, 파싱, 가감 연산, 비교/판별, **영업일(공휴일) 계산**, 한글 표기 등 업무 화면에서 자주 쓰이는 날짜 처리 기능을 폭넓게 제공합니다.

* 내부적으로 [dayjs](https://day.js.org/) 라이브러리를 사용하며, 포맷 문자열 기반의 **엄격한 파싱**(`customParseFormat`)을 지원합니다.
* 별도의 `import` 없이 전역 객체 `$util.date`로 바로 사용합니다.

```ts
// 사용 형태
$util.date.format();                       // '2026-06-26'
$util.date.now();                          // '2026-06-26 14:30:25'
$util.date.addDays(new Date(), 7);         // Date 객체
$util.date.isBusinessDay('2026-06-27');    // false (토요일)
```

:::info 기본 포맷
* **format()** 기본값 : `YYYY-MM-DD` (예: `2026-06-26`)
* **now()** 기본값 : `YYYY-MM-DD HH:mm:ss` (예: `2026-06-26 14:30:25`)
* 포맷 문자열(template)은 [dayjs format 토큰](https://day.js.org/docs/en/display/format)을 그대로 사용합니다. (`YYYY` 연, `MM` 월, `DD` 일, `HH` 24시, `mm` 분, `ss` 초 등)
:::

:::tip DateInput 타입
대부분의 함수는 인자로 `DateInput`을 받습니다. 다음과 같은 값을 모두 허용합니다.

* `Date` 객체 — `new Date()`
* ISO 문자열 — `'2026-06-26'`, `'2026-06-26T14:30:00'`
* 타임스탬프(숫자) — `1782000000000`
* `dayjs` 객체
:::

---

## 변환 / 파싱

### format()

날짜를 지정한 포맷의 **문자열**로 변환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `date` | `DateInput` | | `new Date()` | 변환할 날짜. 생략 시 현재 시각 |
| `template` | `string` | | `'YYYY-MM-DD'` | 출력 포맷 문자열 |

* **반환** : `string` — 포맷된 날짜 문자열. 유효하지 않은 날짜이면 **빈 문자열(`''`)** 을 반환합니다.

```ts
$util.date.format();                               // '2026-06-26' (오늘)
$util.date.format(new Date());                     // '2026-06-26'
$util.date.format('2026-06-26', 'YYYY/MM/DD');     // '2026/06/26'
$util.date.format(new Date(), 'YYYY년 MM월 DD일');  // '2026년 06월 26일'
$util.date.format('2026-06-26T14:30:00', 'HH:mm'); // '14:30'
$util.date.format('잘못된날짜');                    // '' (유효하지 않음)
```

### now()

**현재 시각**을 지정한 포맷의 문자열로 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `template` | `string` | | `'YYYY-MM-DD HH:mm:ss'` | 출력 포맷 문자열 |

* **반환** : `string` — 현재 시각 문자열

```ts
$util.date.now();               // '2026-06-26 14:30:25'
$util.date.now('YYYY-MM-DD');   // '2026-06-26'
$util.date.now('HH:mm');        // '14:30'
```

:::note format() 과의 차이
`now()`는 항상 **현재 시각**을 기준으로 하며 기본 포맷이 **날짜+시간**입니다.
`format()`은 인자로 받은 날짜(생략 시 현재 시각)를 변환하며 기본 포맷이 **날짜**입니다.
:::

### parse()

문자열 등의 값을 **`Date` 객체로 파싱**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `DateInput` | ✓ | | 파싱할 값 |
| `template` | `string` | | | 입력 값의 포맷. 지정 시 **엄격한 파싱** 수행 |

* **반환** : `Date | null` — 파싱된 `Date` 객체. 유효하지 않으면 **`null`** 을 반환합니다.

```ts
$util.date.parse('2026-06-26');                // Date (2026-06-26)
$util.date.parse('26/06/2026', 'DD/MM/YYYY');  // Date (2026-06-26)
$util.date.parse('2026-06-26', 'DD/MM/YYYY');  // null (포맷 불일치)
$util.date.parse('잘못된값');                   // null
```

:::warning 엄격한 파싱(template 지정)
`template`을 지정하면 입력 문자열이 해당 포맷과 **정확히 일치**해야만 파싱됩니다.
포맷이 다르거나 존재하지 않는 날짜(예: `2026-13-40`)는 `null`을 반환하므로, 사용자 입력 값을 검증할 때 유용합니다.
:::

### isValid()

값이 **유효한 날짜인지** 검사합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `DateInput` | ✓ | | 검사할 값 |

* **반환** : `boolean` — 유효한 날짜이면 `true`, 아니면 `false`

```ts
$util.date.isValid('2026-06-26');   // true
$util.date.isValid(new Date());     // true
$util.date.isValid('잘못된값');      // false
$util.date.isValid('2026-13-40');   // false
```

---

## 기본 연산

날짜에 일/월/년 등을 **가감**하거나, 두 날짜의 **차이**를 계산합니다. 가감 함수는 모두 새 `Date` 객체를 반환하며 원본을 변경하지 않습니다.

### addDays() / addMonths() / addYears()

각각 **일 / 월 / 년** 단위를 더하거나 뺍니다. `amount`가 **음수**이면 이전 날짜가 됩니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |
| `amount` | `number` | ✓ | 더할 수량 (음수 가능) |

* **반환** : `Date` — 계산된 `Date` 객체

```ts
const base = '2026-06-26';

$util.date.addDays(base, 7);      // 2026-07-03
$util.date.addDays(base, -3);     // 2026-06-23
$util.date.addMonths(base, 3);    // 2026-09-26
$util.date.addYears(base, 1);     // 2027-06-26 (예금 만기 등)
```

### add()

**단위를 지정**하여 가감합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |
| `amount` | `number` | ✓ | 더할 수량 (음수 가능) |
| `unit` | `DateUnit` | ✓ | 단위 |

* **반환** : `Date` — 계산된 `Date` 객체
* `unit`(`DateUnit`)은 `'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'` 중 하나입니다.

```ts
$util.date.add('2026-06-26', 2, 'week');    // 2주 후 → 2026-07-10
$util.date.add('2026-06-26', -6, 'hour');   // 6시간 전
```

### diffDays() / diffMonths() / diffYears()

두 날짜의 **일 / 개월 / 년 차이**(`a - b`)를 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `a` | `DateInput` | ✓ | 기준 날짜 |
| `b` | `DateInput` | ✓ | 비교할 날짜 |

* **반환** : `number` — `a`가 더 미래이면 **양수**, 과거이면 **음수**
* `diffDays`는 시·분·초를 무시하고 **날짜(자정 기준)** 로만 비교합니다.
* `diffMonths` / `diffYears`는 완전히 채워진 개월·년 수만 계산합니다. (예: 1개월에서 하루 모자라면 `0`)

```ts
$util.date.diffDays('2026-06-26', '2026-06-01');   // 25
$util.date.diffDays('2026-06-01', '2026-06-26');   // -25
$util.date.diffMonths('2026-06-26', '2026-01-01'); // 5 (대출 경과 개월 등)
$util.date.diffYears('2026-06-26', '2020-06-26');  // 6
```

---

## 시작 / 끝 경계

기간 집계·배치 처리에서 자주 쓰이는 **경계 시점**을 구합니다.

### startOf() / endOf()

지정 단위의 **시작 / 끝 시점**을 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |
| `unit` | `DateUnit` | ✓ | 단위 (`month`, `day` 등) |

* **반환** : `Date`
* 예: `startOf(date, 'month')` → 그 달 1일 `00:00:00`, `endOf(date, 'day')` → `23:59:59.999`

```ts
$util.date.startOf('2026-06-26', 'month');  // 2026-06-01 00:00:00
$util.date.endOf('2026-06-26', 'day');      // 2026-06-26 23:59:59.999

// 이번 달 전체 집계 범위
const from = $util.date.startOf(new Date(), 'month');
const to   = $util.date.endOf(new Date(), 'month');
```

### firstDayOfMonth() / lastDayOfMonth() / daysInMonth()

해당 월의 **1일 / 마지막 날 / 총 일수**를 구합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |

* `firstDayOfMonth` / `lastDayOfMonth` : `Date` 반환
* `daysInMonth` : `number` 반환

```ts
$util.date.firstDayOfMonth('2026-06-26'); // 2026-06-01 (월 정산 시작일)
$util.date.lastDayOfMonth('2026-06-26');  // 2026-06-30 (월 정산 마감일)
$util.date.daysInMonth('2026-02-01');     // 28 (일할 계산 등)
$util.date.daysInMonth('2024-02-01');     // 29 (윤년)
```

---

## 비교 / 판별

### isBefore() / isAfter()

`a`가 `b`보다 **이전 / 이후**인지 확인합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `a` | `DateInput` | ✓ | 기준 날짜 |
| `b` | `DateInput` | ✓ | 비교할 날짜 |

* **반환** : `boolean` (밀리초까지 비교)

```ts
$util.date.isBefore('2026-06-01', '2026-06-26'); // true
$util.date.isAfter('2026-06-26', '2026-06-01');  // true
```

### isSame()

두 날짜가 **같은지** 확인합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `a` | `DateInput` | ✓ | | 기준 날짜 |
| `b` | `DateInput` | ✓ | | 비교할 날짜 |
| `unit` | `DateUnit` | | `'day'` | 비교 단위 |

* **반환** : `boolean` — 기본은 **일(day)** 단위 비교라 시간이 달라도 같은 날이면 `true`

```ts
$util.date.isSame('2026-06-26 09:00', '2026-06-26 18:00');          // true (같은 날)
$util.date.isSame('2026-06-26', '2026-07-26', 'month');            // false
$util.date.isSame('2026-06-26', '2026-06-01', 'month');            // true
```

### isBetween()

날짜가 `start`~`end` **기간 내(양 끝 포함)** 에 있는지 확인합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 검사할 날짜 |
| `start` | `DateInput` | ✓ | 기간 시작 |
| `end` | `DateInput` | ✓ | 기간 끝 |

* **반환** : `boolean` — **일 단위**로 비교하며 시작·끝 경계를 **포함**합니다.

```ts
$util.date.isBetween('2026-06-26', '2026-06-01', '2026-06-30'); // true
$util.date.isBetween('2026-06-01', '2026-06-01', '2026-06-30'); // true (경계 포함)
$util.date.isBetween('2026-07-01', '2026-06-01', '2026-06-30'); // false
```

### isToday() / isPast() / isFuture()

날짜가 **오늘인지 / 과거인지 / 미래인지** 확인합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 검사할 날짜 |

* **반환** : `boolean`
* `isToday`는 **일 단위**, `isPast` / `isFuture`는 **현재 시각과 밀리초 비교**입니다.

```ts
$util.date.isToday(new Date());    // true
$util.date.isPast('2020-01-01');   // true
$util.date.isFuture('2099-12-31'); // true
```

### min() / max()

두 날짜 중 **더 이른 / 더 늦은** 날짜를 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `a` | `DateInput` | ✓ | 날짜 1 |
| `b` | `DateInput` | ✓ | 날짜 2 |

* **반환** : `Date`

```ts
$util.date.min('2026-06-26', '2026-06-01'); // 2026-06-01
$util.date.max('2026-06-26', '2026-06-01'); // 2026-06-26
```

---

## 영업일 (Business Day)

주말과 **공휴일**을 제외한 영업일 기준 계산을 제공합니다. T+2 결제일, 어음 만기, 휴일 이연 결제일 등에 활용합니다.

:::info 공휴일 판정 기준
공휴일은 **고정 양력 공휴일**(신정·삼일절 등)과 **음력·대체공휴일**(설·추석 등)로 구성됩니다.
음력·대체공휴일은 내장 테이블을 기본으로 사용하며, 부트스트랩 시 서버 영업일 캘린더를 주입하면 이를 대체할 수 있습니다.
주입 함수 `setHolidays()` / `getHolidays()`는 `$util.date`가 아닌 별도 export로 제공됩니다. ([`import { setHolidays } from '...'`](#))
:::

### isWeekend() / isHoliday() / isBusinessDay()

날짜가 **주말 / 공휴일 / 영업일**인지 확인합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 검사할 날짜 |

* **반환** : `boolean`
* `isWeekend` : 토(6)·일(0) 여부
* `isHoliday` : 고정 양력 + 음력·대체공휴일 여부
* `isBusinessDay` : 주말도 공휴일도 **아닌** 날 → `true`

```ts
$util.date.isWeekend('2026-06-27');     // true (토요일)
$util.date.isHoliday('2026-01-01');     // true (신정)
$util.date.isBusinessDay('2026-06-26'); // true (평일·비공휴일)
$util.date.isBusinessDay('2026-01-01'); // false (공휴일)
```

### addBusinessDays()

**영업일 기준**으로 가감한 날짜를 반환합니다. 주말·공휴일은 건너뜁니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |
| `amount` | `number` | ✓ | 더할 영업일 수 (음수 가능) |

* **반환** : `Date`

```ts
// 금요일 기준 2영업일 후 → 주말 건너뛰고 화요일
$util.date.addBusinessDays('2026-06-26', 2);  // 2026-06-30 (T+2 결제일)
$util.date.addBusinessDays('2026-06-26', -1); // 2026-06-25
```

### diffBusinessDays()

두 날짜 사이의 **영업일 수**(`a - b`)를 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `a` | `DateInput` | ✓ | 기준 날짜 |
| `b` | `DateInput` | ✓ | 비교할 날짜 |

* **반환** : `number` — `a`가 더 미래이면 양수, 과거이면 음수 (주말·공휴일 제외)

```ts
$util.date.diffBusinessDays('2026-06-30', '2026-06-26'); // 2 (주말 제외)
```

### nextBusinessDay() / prevBusinessDay()

**다음 / 이전 영업일**을 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 기준 날짜 |

* **반환** : `Date` — 기준일 자체는 제외하고, 가장 가까운 영업일을 찾습니다.

```ts
// 금요일의 다음 영업일 → 주말 건너뛰고 월요일
$util.date.nextBusinessDay('2026-06-26'); // 2026-06-29 (휴일 이연 결제일)
$util.date.prevBusinessDay('2026-06-29'); // 2026-06-26
```

---

## 표시 / 포맷

### formatKorean()

날짜를 **한글 표기**로 변환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `string` — 예: `'2026년 6월 26일'` (월·일은 앞자리 `0`을 붙이지 않음). 유효하지 않으면 `''`

```ts
$util.date.formatKorean('2026-06-26'); // '2026년 6월 26일'
```

### dayOfWeek()

**한글 요일**을 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `string` — `'일'`~`'토'` 중 하나. 유효하지 않으면 `''`

```ts
$util.date.dayOfWeek('2026-06-26'); // '금'
```

### fromNow()

현재 시각 대비 **상대 시간**을 한글로 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `string` — 예: `'3일 전'`, `'2시간 후'`. 유효하지 않으면 `''`

```ts
$util.date.fromNow('2026-06-20'); // '6일 전' (오늘이 2026-06-26일 때)
```

### getQuarter() / weekOfYear()

**분기(1~4)** 와 **연중 주차**를 반환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `number`

```ts
$util.date.getQuarter('2026-06-26'); // 2 (2분기, 분기 결산)
$util.date.weekOfYear('2026-06-26'); // 26 (주간 리포트)
```

### toBusinessDate()

전문 통신용 **8자리 날짜 문자열**(`YYYYMMDD`)로 변환합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `string` — 예: `'20260626'`. 유효하지 않으면 `''`

```ts
$util.date.toBusinessDate('2026-06-26'); // '20260626'
```

---

## 기타 실무

### age()

생년월일로 **만 나이**를 계산합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `birth` | `DateInput` | ✓ | 생년월일 |

* **반환** : `number` — 생일 경과를 반영한 만 나이. 유효하지 않으면 `0`

```ts
$util.date.age('1990-05-05'); // 36 (오늘이 2026-06-26일 때, KYC/미성년 판별)
```

### isLeapYear()

**윤년**인지 확인합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `date` | `DateInput` | ✓ | 대상 날짜 |

* **반환** : `boolean`

```ts
$util.date.isLeapYear('2024-01-01'); // true
$util.date.isLeapYear('2026-01-01'); // false
```

### range()

시작~끝(**양 끝 포함**) 사이의 **날짜 배열**을 생성합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `start` | `DateInput` | ✓ | 시작 날짜 |
| `end` | `DateInput` | ✓ | 끝 날짜 |

* **반환** : `Date[]` — 하루 간격의 `Date` 배열. 유효하지 않거나 `start`가 `end`보다 뒤이면 **빈 배열(`[]`)**

```ts
$util.date.range('2026-06-01', '2026-06-05');
// [Date(06-01), Date(06-02), Date(06-03), Date(06-04), Date(06-05)]

// 달력 렌더링·기간 루프
$util.date.range('2026-06-01', '2026-06-30')
  .map((d) => $util.date.format(d)); // ['2026-06-01', ..., '2026-06-30']
```

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 오늘부터 30일 후 만료일을 한글로 표시
const expire = $util.date.addDays(new Date(), 30);
$util.date.formatKorean(expire);   // '2026년 7월 26일'

// 2) 사용자 입력 날짜 검증 후 저장
const input = '2026-06-26';
if ($util.date.isValid(input)) {
  const saved = $util.date.parse(input);
  // saved 를 서버로 전송...
}

// 3) T+2 결제일(영업일 기준) 계산
const settleDate = $util.date.addBusinessDays(new Date(), 2);
$util.date.toBusinessDate(settleDate); // '20260630' (전문 전송용)

// 4) 이번 달 집계 범위 구하기
const from = $util.date.startOf(new Date(), 'month');
const to   = $util.date.endOf(new Date(), 'month');

// 5) 마감일까지 남은 일수 계산
const dDay = $util.date.diffDays('2026-12-31', $util.date.now('YYYY-MM-DD'));
console.log(`마감까지 ${dDay}일 남았습니다.`);
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| **변환 / 파싱** | | |
| `format(date?, template?)` | `string` | 날짜를 포맷 문자열로 변환 (실패 시 `''`) |
| `now(template?)` | `string` | 현재 시각을 포맷 문자열로 반환 |
| `parse(value, template?)` | `Date \| null` | 값을 Date 객체로 파싱 (실패 시 `null`) |
| `isValid(value)` | `boolean` | 유효한 날짜인지 검사 |
| **기본 연산** | | |
| `addDays / addMonths / addYears(date, amount)` | `Date` | 일 / 월 / 년 가감 |
| `add(date, amount, unit)` | `Date` | 단위 지정 가감 |
| `diffDays / diffMonths / diffYears(a, b)` | `number` | 일 / 개월 / 년 차이 (a - b) |
| **시작 / 끝 경계** | | |
| `startOf / endOf(date, unit)` | `Date` | 단위의 시작 / 끝 시점 |
| `firstDayOfMonth / lastDayOfMonth(date)` | `Date` | 해당 월의 1일 / 마지막 날 |
| `daysInMonth(date)` | `number` | 해당 월의 총 일수 |
| **비교 / 판별** | | |
| `isBefore / isAfter(a, b)` | `boolean` | a가 b보다 이전 / 이후 |
| `isSame(a, b, unit?)` | `boolean` | 같은지 (기본 일 단위) |
| `isBetween(date, start, end)` | `boolean` | 기간 내(양 끝 포함) |
| `isToday / isPast / isFuture(date)` | `boolean` | 오늘 / 과거 / 미래 |
| `min / max(a, b)` | `Date` | 더 이른 / 늦은 날짜 |
| **영업일** | | |
| `isWeekend / isHoliday / isBusinessDay(date)` | `boolean` | 주말 / 공휴일 / 영업일 여부 |
| `addBusinessDays(date, amount)` | `Date` | 영업일 기준 가감 |
| `diffBusinessDays(a, b)` | `number` | 영업일 수 차이 (a - b) |
| `nextBusinessDay / prevBusinessDay(date)` | `Date` | 다음 / 이전 영업일 |
| **표시 / 포맷** | | |
| `formatKorean(date)` | `string` | 한글 날짜 표기 |
| `dayOfWeek(date)` | `string` | 한글 요일 |
| `fromNow(date)` | `string` | 상대 시간(한글) |
| `getQuarter / weekOfYear(date)` | `number` | 분기 / 연중 주차 |
| `toBusinessDate(date)` | `string` | 8자리 날짜 문자열(YYYYMMDD) |
| **기타 실무** | | |
| `age(birth)` | `number` | 만 나이 |
| `isLeapYear(date)` | `boolean` | 윤년 여부 |
| `range(start, end)` | `Date[]` | 기간 내 날짜 배열(양 끝 포함) |
:::
