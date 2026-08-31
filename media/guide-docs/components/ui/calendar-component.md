---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Calendar"
hide_table_of_contents: false
---

# Calendar 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 달력 컴포넌트입니다.
**하루 · 여러 날 · 기간을 선택**할 때 사용하며, 내부 구현은 [React DayPicker](https://daypicker.dev) v9를 shadcn/ui 스타일로 감싼 것입니다.

**언제 쓰나요?**

- 예약일·생년월일처럼 **날짜 하나를 고르는** 입력
- 근무일 지정처럼 **흩어진 여러 날을 고르는** 입력
- 조회 기간·숙박 기간처럼 **시작일과 종료일을 함께 고르는** 입력
- 인풋 옆 버튼을 눌러 여는 **Date Picker 팝업**

> 달력을 항상 펼쳐 두려면 `Calendar`를 그대로 배치하고, 인풋 옆에서 팝업으로 열려면 [Date Picker 패턴](#1-date-picker-버튼--달력-팝업)처럼 감싸 쓰면 됩니다.

---

## Import

---

```tsx
import { Calendar } from "@axiom/components/ui";

// 범위 선택 시 값 타입, 선택 불가 날짜 타입은 react-day-picker에서 가져옵니다
import type { DateRange, Matcher } from "react-day-picker";
```

`Calendar`는 **단일 컴포넌트**입니다. Accordion처럼 파트를 조합할 필요 없이 prop만으로 동작을 정합니다.
날짜 셀 버튼을 직접 커스터마이징할 때 쓰는 `CalendarDayButton`도 함께 export되어 있습니다. ([셀 내용 커스터마이징](#4-셀-내용-커스터마이징--components) 참고)

---

## 기본 사용법

---

`mode="single"` + `selected` / `onSelect` 세 개면 동작합니다. **선택 값은 화면이 state로 들고 있어야 합니다.**(제어 컴포넌트)

---

<img
  src="../assets/ui/calendar-basic.png"
  alt="캘린더 기본 사용법"
  width="80%"
/>

```tsx
import { useState } from "react";
import { Calendar } from "@axiom/components/ui";

function Example() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      className="rounded-lg border"
    />
  );
}
```

:::tip 왜 `Date | undefined` 인가
`mode="single"`에서 이미 선택된 날짜를 다시 클릭하면 **선택이 해제**되어 `onSelect`가 `undefined`를 넘깁니다. 그래서 state 타입은 항상 `Date | undefined`로 잡습니다. 해제를 막으려면 `required`를 켜세요.
:::

:::note 테두리는 기본 제공이 아닙니다
컴포넌트 자체에는 배경(`bg-background`)과 안쪽 여백(`p-2`)만 있고 **외곽선은 없습니다.** 카드처럼 보이게 하려면 예제처럼 `className="rounded-lg border"`를 직접 주세요.
:::

---

## 구성 (Anatomy)

---

`Calendar`는 DayPicker가 만든 DOM에 scaffold의 클래스가 입혀진 구조입니다. 스타일을 덮어쓸 때 **어느 부분이 어떤 이름인지** 알면 편합니다.

```text
[data-slot="calendar"] / .rdp-root   루트 (--cell-size / --cell-radius 스코프)
└─ months                            달력 묶음 (numberOfMonths가 2 이상이면 md~ 가로 배치)
   └─ month
      ├─ nav                         ◀ ▶ 이전/다음 달 버튼 (button_previous / button_next)
      ├─ month_caption               "2026년 8월" 캡션 영역
      │  ├─ caption_label            텍스트 캡션        (captionLayout="label")
      │  └─ dropdowns                월·연도 드롭다운   (captionLayout="dropdown")
      └─ table
         ├─ weekdays > weekday       요일 헤더 (일 월 화 …)
         └─ week                     한 주 행
            ├─ week_number           주차 번호 (showWeekNumber일 때만)
            └─ day                   날짜 셀 <td>
               └─ day_button         실제 클릭되는 버튼 (CalendarDayButton)
```

| 영역            | 역할                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| 루트            | `--cell-size`·`--cell-radius` 변수와 배경/여백을 정의. `data-slot="calendar"`        |
| `nav`           | 이전/다음 달 버튼. 모양은 `buttonVariant` prop을 따름(기본 `ghost`)                  |
| `month_caption` | 현재 월 표기. `captionLayout`에 따라 텍스트 또는 드롭다운                            |
| `day`           | 날짜 한 칸(`<td>`). 범위 선택 시 `range_start` / `range_middle` / `range_end`가 붙음 |
| `day_button`    | 실제 버튼(`CalendarDayButton`). 선택·범위 상태를 `data-*` 속성으로 노출              |

:::note 이름이 두 벌입니다
위 표의 이름은 **`classNames` prop의 키**이고, 실제 DOM에는 같은 영역에 **`.rdp-*` 클래스**(`.rdp-day`, `.rdp-month_caption` …)가 함께 붙습니다.
→ **prop으로 바꿀 땐 `classNames` 키**, **CSS 파일에서 바꿀 땐 `.rdp-*` 선택자**를 씁니다. 전체 목록은 [스타일링 & 테마 › DOM 후킹 포인트](#dom-후킹-포인트)에 정리돼 있습니다.
:::

:::note Card·Popover 안에서는 배경이 자동으로 투명해집니다
루트에 `in-data-[slot=card-content]:bg-transparent`, `in-data-[slot=popover-content]:bg-transparent`가 걸려 있어, scaffold `Card` 내부에 넣으면 달력 배경이 부모를 따라갑니다. 별도 처리 불필요.
:::

---

## 동작 옵션

---

동작은 전부 `Calendar`의 prop으로 정해집니다. 목적에 맞는 것을 고르세요.

### 1. 선택 방식 — `mode`

```tsx
// 하루만
<Calendar mode="single" selected={date} onSelect={setDate} />

// 여러 날 (배열) — max로 개수 제한
<Calendar mode="multiple" max={5} selected={dates} onSelect={setDates} />

// 기간 (시작일 ~ 종료일)
<Calendar mode="range" selected={range} onSelect={setRange} />
```

| mode         | `selected` 타입          | `min` / `max`의 의미 | 쓰임                           |
| ------------ | ------------------------ | -------------------- | ------------------------------ |
| `"single"`   | `Date \| undefined`      | —                    | 예약일·생년월일 등 하루        |
| `"multiple"` | `Date[] \| undefined`    | 선택 **개수**        | 근무일 지정처럼 흩어진 여러 날 |
| `"range"`    | `DateRange \| undefined` | 기간 **일수**        | 조회 기간·숙박 기간            |

`mode`를 아예 주지 않으면 **선택 불가한 표시 전용 달력**이 됩니다.

### 2. 기간 선택 — `mode="range"`

`DateRange`는 `{ from, to }` 형태이며, **시작일만 고른 중간 상태**에서는 `to`가 `undefined`입니다. 화면에 값을 표시할 때 반드시 이 상태를 고려하세요.

---

<img
  src="../assets/ui/calendar-range.png"
  alt="캘린더 범위 선택"
  width="80%"
/>

```tsx
import type { DateRange } from 'react-day-picker';

const [range, setRange] = useState<DateRange | undefined>({
  from: new Date(),
  to: undefined,
});

<Calendar
  mode="range"
  selected={range}
  onSelect={setRange}
  numberOfMonths={2}
  max={30}                  // 최대 30일까지만 선택
  className="rounded-lg border"
/>

// 표시할 때
<span>{range?.from?.toLocaleDateString('ko-KR') ?? '—'}</span>
<span>{range?.to?.toLocaleDateString('ko-KR') ?? '—'}</span>
```

- 기간 길이를 제한하려면 `min` / `max`(일수)를 씁니다. 다만 DayPicker의 `max`는 **초과 선택 자체를 막을 뿐** 사용자에게 이유를 알려주지 않습니다. 안내 문구가 필요하면 [조회기간 선택 예제](#3-거래내역-조회기간-선택-css-module-전면-재스킨)처럼 `max`를 빼고 화면에서 직접 일수를 검증하세요.
- 범위의 양 끝(`range_start`·`range_end`)은 primary 색, 사이(`range_middle`)는 muted 색으로 이미 스타일링되어 있습니다.

:::note 범위 밴드가 셀 밖으로 삐져나옵니다
`range_start` / `range_end`의 `td`에는 `::after`로 **밴드를 `w-4`(1rem)만큼 바깥으로 연장**하는 스타일이 걸려 있습니다(셀 사이 간격을 메워 띠가 끊기지 않게 하려는 장치). 셀을 빈틈없이 붙이는 디자인이라면 이 꼬리가 거슬리므로 CSS에서 꺼 주세요.

```css
.wrap :global(.rdp-range_start)::after,
.wrap :global(.rdp-range_end)::after {
  display: none;
}
```

:::

### 3. 월·연도 빠른 이동 — `captionLayout`

기본값 `"label"`은 `◀ 2026년 8월 ▶` 텍스트라 먼 달로 가려면 화살표를 여러 번 눌러야 합니다. 생년월일처럼 **멀리 떨어진 날짜**를 고르는 화면이라면 드롭다운을 켜세요.

---

<img
  src="../assets/ui/calendar-dropdown.png"
  alt="캘린더 빠른 이동 드롭다운선택"
  width="80%"
/>

```tsx
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  // highlight-start
  captionLayout="dropdown"
  startMonth={new Date(2020, 0)}
  endMonth={new Date(2030, 11)}
  // highlight-end
  className="rounded-lg border"
/>
```

- `"dropdown"` — 월·연도 둘 다 드롭다운
- `"dropdown-months"` / `"dropdown-years"` — 한쪽만 드롭다운
- **드롭다운을 켤 땐 `startMonth` / `endMonth`를 같이 넘기세요.** 생략하면 DayPicker가 **"오늘로부터 100년 전 ~ 올해 12월"** 을 자동으로 채웁니다. 목록이 100개 넘게 길어지는 것도 문제지만, 더 큰 문제는 **올해를 넘어가는 날짜로 이동할 수 없다는 것**입니다(예약일 선택 화면에서 내년을 못 고릅니다).
- 생년월일이라면 `startMonth={new Date(1940, 0)} endMonth={new Date()}`, 예약일이라면 `startMonth={new Date()} endMonth={new Date(2030, 11)}`처럼 목적에 맞춰 잡습니다.

:::caution `new Date()`를 JSX에 직접 쓰지 마세요
`startMonth={new Date(2020, 0)}`를 렌더 안에 두면 **리렌더마다 새 Date 객체**가 생겨 달력이 불필요하게 다시 계산됩니다. 고정값은 모듈 스코프 상수로, 계산값은 `useMemo`로 빼세요.

```tsx
const DROPDOWN_START = new Date(2020, 0); // 모듈 스코프
const DROPDOWN_END = new Date(2030, 11);
```

:::

:::note 드롭다운의 월 이름은 짧은 형식입니다
scaffold Calendar는 `formatMonthDropdown`을 `{ month: 'short' }`로 오버라이드해 두었습니다(공간 절약). 포맷 기준 로케일은 넘긴 `locale.code`를 따릅니다. 전체 이름으로 바꾸려면 `formatters={{ formatMonthDropdown: (d) => d.toLocaleString('ko-KR', { month: 'long' }) }}`를 넘기세요.
:::

### 4. 여러 달 한 번에 — `numberOfMonths`

```tsx
<Calendar mode="single" selected={date} onSelect={setDate} numberOfMonths={2} />
```

- 기본은 세로(`flex-col`)이며 `md` 이상에서 **가로로 나란히** 배치됩니다.
- 기간 선택과 함께 쓰면 시작·종료를 한 화면에서 고를 수 있어 궁합이 좋습니다.

### 5. 격자 표시 옵션

달력의 뼈대를 조정하는 옵션들입니다.

```tsx
// 이전·다음 달 날짜 숨기기 (scaffold 기본값은 true = 표시)
<Calendar mode="single" showOutsideDays={false} />

// 항상 6주로 고정 → 달마다 달력 높이가 흔들리지 않음
<Calendar mode="single" fixedWeeks />

// ISO 주차 번호 열 추가
<Calendar mode="single" showWeekNumber />

// 월요일 시작 (0=일 … 6=토, 기본 0)
<Calendar mode="single" weekStartsOn={1} />
```

| Prop                      | 언제 켜나                                               |
| ------------------------- | ------------------------------------------------------- |
| `showOutsideDays={false}` | 격자를 깔끔하게 유지하고 싶을 때                        |
| `fixedWeeks`              | 팝업 안 달력처럼 **높이가 변하면 레이아웃이 튀는** 자리 |
| `showWeekNumber`          | 주차 기준으로 일정을 다루는 업무 화면                   |
| `weekStartsOn`            | 주 시작을 로케일 기본값과 다르게 강제할 때              |

`showWeekNumber`를 켜면 좌측에 주차 열이 생기며, 첫 칸 라운딩 처리도 자동으로 보정됩니다.

### 6. 선택 불가 날짜 — `disabled`

값 하나, 배열, 범위, **판별 함수** 어느 쪽이든 받습니다(타입은 `Matcher`).

---

<img
  src="../assets/ui/calendar-disabled.png"
  alt="캘린더 disabled"
  width="80%"
/>

```tsx
// ① 함수형 — 주말 비활성화
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

// ② 객체형 — 오늘 이전 비활성화
const beforeToday = { before: new Date() };

<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  // highlight-next-line
  disabled={[isWeekend, beforeToday]} // 배열 = OR 조건으로 조합
  className="rounded-lg border"
/>;
```

| Matcher 형태               | 의미                    |
| -------------------------- | ----------------------- |
| `new Date(2026, 7, 15)`    | 특정 하루               |
| `{ from, to }`             | 기간                    |
| `{ before }` / `{ after }` | 이전 / 이후 전체        |
| `{ dayOfWeek: [0, 6] }`    | 특정 요일 (0=일 … 6=토) |
| `(date) => boolean`        | 임의 조건               |
| 위 항목들의 **배열**       | OR 조건으로 조합        |

- 비활성 날짜는 `text-muted-foreground opacity-50`로 표시되고 클릭도 막힙니다.
- 같은 Matcher를 `hidden`에 넘기면 **아예 숨겨집니다**(칸 자체가 비워짐).

:::tip matcher도 메모이제이션 대상입니다
`disabled={[isWeekend, { before: new Date() }]}`를 JSX에 인라인으로 두면 매 렌더마다 새 배열·새 Date가 만들어집니다. `useMemo`로 감싸 두세요.
:::

### 7. 표시 월 제어 — `defaultMonth` / `month` + `onMonthChange`

`selected`가 "무엇이 선택됐나"라면, `month`는 "지금 몇 월을 보고 있나"입니다. **둘은 별개**입니다.

```tsx
// 처음 열릴 때 보여줄 달만 지정 (비제어)
<Calendar mode="single" defaultMonth={new Date(2026, 0)} />

// 보이는 달을 바깥에서 제어 ("오늘로 이동" 버튼 등)
const [month, setMonth] = useState<Date>(new Date());

<button onClick={() => setMonth(new Date())}>오늘로 이동</button>
<Calendar mode="single" month={month} onMonthChange={setMonth} />
```

:::tip 선택된 값이 있는데 엉뚱한 달이 열릴 때
`selected`만 넘기면 DayPicker는 **현재 달**부터 보여줍니다. 저장된 값이 작년이라면 `defaultMonth={savedDate}`를 함께 넘기세요. (Date Picker 팝업에서 특히 자주 놓치는 부분입니다.)
:::

### 8. 로케일 — `locale`

```tsx
import { ko } from "date-fns/locale";

<Calendar mode="single" selected={date} onSelect={setDate} locale={ko} />;
```

- scaffold에는 `date-fns`가 이미 포함되어 있어 `date-fns/locale`의 로케일을 그대로 넘길 수 있습니다.
- `locale`은 요일·월 이름은 물론 **주 시작 요일**까지 결정합니다. (강제로 바꾸려면 `weekStartsOn`)
- 국내 프로젝트에서는 사실상 기본값처럼 항상 `locale={ko}`를 넘긴다고 보면 됩니다.

:::caution 선택한 날짜가 하루씩 밀린다면
서버가 UTC 기준으로 날짜를 다루는데 브라우저는 로컬 타임존이라 하루가 어긋나는 경우가 있습니다. `timeZone` prop에 기준 타임존을 넘겨 맞추세요.

```tsx
<Calendar
  mode="single"
  timeZone="Asia/Seoul"
  selected={date}
  onSelect={setDate}
/>
```

:::

### 9. 날짜에 표시 붙이기 — `modifiers` / `modifiersClassNames`

`modifiers`로 날짜에 **이름표**를 붙이고, `modifiersClassNames`로 그 이름표에 **클래스**를 입힙니다. 공휴일·마감일·예약된 날 표시에 씁니다.

<img
  src="../assets/ui/calendar-modifier.png"
  alt="캘린더 공휴일 표시"
  width="80%"
/>

```tsx
const holidays = [
  new Date(2026, 0, 1), // 신정
  new Date(2026, 2, 1), // 삼일절
  new Date(2026, 4, 5), // 어린이날
  // ...
];

<Calendar
  mode="single"
  locale={ko}
  selected={date}
  onSelect={setDate}
  // highlight-start
  modifiers={{ holiday: holidays }}
  modifiersClassNames={{ holiday: "text-red-500 dark:text-red-400" }}
  // highlight-end
  className="rounded-lg border"
/>;
```

:::caution 클래스가 붙는 곳은 `td`이지 버튼이 아닙니다
`modifiersClassNames`의 클래스는 날짜 **칸(`td.rdp-day`)** 에 붙습니다. 글자색처럼 **상속되는 속성**은 그대로 먹히지만, 내부 버튼이 직접 지정한 속성(예: `font-weight`, `background`)은 덮이지 않습니다. 그런 경우엔 [CSS Module 재스킨](#3-겉모습-전면-교체--rdp---data---css-module)으로 버튼까지 잡으세요.
:::

---

## API 레퍼런스

---

`Calendar`는 **React DayPicker의 모든 prop을 그대로 통과**시킵니다(`...props`). 아래는 자주 쓰는 것과 scaffold가 추가/변경한 것만 정리한 표입니다. 전체 목록은 [DayPicker API](https://daypicker.dev/api/interfaces/DayPickerProps)를 참고하세요.

### 선택 · 동작

| Prop                      | 타입                                | 기본값                                 | 설명                                                |
| ------------------------- | ----------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `mode`                    | `"single" \| "multiple" \| "range"` | —                                      | 선택 방식. 생략하면 표시 전용                       |
| `selected`                | `Date \| Date[] \| DateRange`       | —                                      | 선택된 값. `mode`에 따라 타입이 달라짐              |
| `onSelect`                | `(value) => void`                   | —                                      | 선택 변경 콜백. 재클릭 해제 시 `undefined`          |
| `required`                | `boolean`                           | `false`                                | 선택 해제 금지(항상 하나 이상 선택 유지)            |
| `min` / `max`             | `number`                            | —                                      | `multiple`=개수, `range`=기간 일수 제한             |
| `disabled`                | `Matcher \| Matcher[]`              | —                                      | 선택 불가 날짜                                      |
| `hidden`                  | `Matcher \| Matcher[]`              | —                                      | 아예 숨길 날짜                                      |
| `month`                   | `Date`                              | —                                      | 표시 중인 달(제어). `onMonthChange`와 함께 사용     |
| `defaultMonth`            | `Date`                              | 오늘                                   | 처음 표시할 달(비제어)                              |
| `onMonthChange`           | `(month: Date) => void`             | —                                      | 달 이동 콜백                                        |
| `startMonth` / `endMonth` | `Date`                              | 드롭다운 시 `오늘−100년` / `올해 12월` | 이동 가능한 달의 범위(드롭다운 연·월 목록에도 반영) |

### 표시

| Prop                                | 타입                                                             | 기본값                   | 설명                                       |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| `captionLayout`                     | `"label" \| "dropdown" \| "dropdown-months" \| "dropdown-years"` | `"label"`                | 월·연도 표기 방식                          |
| `numberOfMonths`                    | `number`                                                         | `1`                      | 동시에 표시할 달 수                        |
| `showOutsideDays`                   | `boolean`                                                        | `true` _(scaffold 지정)_ | 이전·다음 달 날짜 표시                     |
| `fixedWeeks`                        | `boolean`                                                        | `false`                  | 항상 6주로 고정해 높이를 일정하게 유지     |
| `showWeekNumber`                    | `boolean`                                                        | `false`                  | ISO 주차 번호 열 표시                      |
| `weekStartsOn`                      | `0 ~ 6`                                                          | 로케일 기본              | 주 시작 요일(0=일 … 6=토)                  |
| `locale`                            | `Partial<Locale>`                                                | `en-US`                  | date-fns 로케일. 요일/월 이름·주 시작 요일 |
| `timeZone`                          | `string`                                                         | —                        | 기준 타임존(예: `"Asia/Seoul"`)            |
| `navLayout`                         | `"around" \| "after"`                                            | —                        | 이전/다음 버튼 배치                        |
| `animate`                           | `boolean`                                                        | `false`                  | 달 전환 애니메이션                         |
| `footer`                            | `ReactNode`                                                      | —                        | 달력 하단 영역                             |
| `formatters`                        | `Formatters`                                                     | 월 드롭다운=`short`      | 캡션·요일 등 라벨 포맷터                   |
| `modifiers` / `modifiersClassNames` | `Record<string, Matcher>` / `Record<string, string>`             | —                        | 날짜에 이름표를 붙이고 클래스를 입힘       |

### scaffold 추가 · 스타일

| Prop            | 타입                        | 기본값    | 설명                                                |
| --------------- | --------------------------- | --------- | --------------------------------------------------- |
| `buttonVariant` | `Button`의 `variant`        | `"ghost"` | 이전/다음 달 **네비게이션 버튼**의 모양             |
| `className`     | `string`                    | —         | 루트에 추가할 클래스(테두리·셀 크기 변수 등)        |
| `style`         | `CSSProperties`             | —         | 루트에 직접 적용. `--cell-size` 등 변수 주입에 사용 |
| `classNames`    | `Partial<ClassNames>`       | —         | 영역별 클래스 **키 단위 교체**(병합 아님)           |
| `components`    | `Record<string, Component>` | —         | 내부 파트 교체(`DayButton`, `Chevron` 등)           |

### `CalendarDayButton`

날짜 셀 버튼을 직접 렌더할 때 쓰는 export입니다. `components.DayButton`을 교체하면서도 기본 스타일·포커스 동작을 유지하고 싶을 때 감싸 씁니다. 내부적으로는 scaffold `Button`(`variant="ghost"`, `size="icon"`)입니다.

| Prop        | 타입              | 설명                                              |
| ----------- | ----------------- | ------------------------------------------------- |
| `day`       | `CalendarDay`     | 날짜 정보(`day.date`)                             |
| `modifiers` | `Modifiers`       | `selected`·`range_start`·`focused` 등 상태 플래그 |
| `locale`    | `Partial<Locale>` | `data-day` 속성의 날짜 포맷에 사용                |
| `className` | `string`          | 버튼에 추가할 클래스                              |

---

## 접근성 / 키보드

---

DayPicker 기반이라 **ARIA 속성과 키보드 조작이 기본 내장**되어 있습니다.

| 키                              | 동작                            |
| ------------------------------- | ------------------------------- |
| `←` / `→`                       | 하루 전 / 하루 뒤로 포커스 이동 |
| `↑` / `↓`                       | 일주일 전 / 일주일 뒤로 이동    |
| `Home` / `End`                  | 그 주의 첫날 / 마지막 날        |
| `PageUp` / `PageDown`           | 이전 달 / 다음 달               |
| `Shift` + `PageUp` / `PageDown` | 이전 해 / 다음 해               |
| `Enter` / `Space`               | 포커스된 날짜 선택              |
| `Tab`                           | 달력 밖 다음 초점 요소로 이동   |

- 달력 전체는 `<table>` 시맨틱으로 렌더되며 요일 헤더가 열 제목이 됩니다.
- 날짜 셀은 `<button>`이고 선택 상태가 `aria-selected`, 비활성이 `aria-disabled`로 노출됩니다.
- 포커스 이동은 `CalendarDayButton`이 `modifiers.focused`를 감지해 실제 DOM 포커스까지 옮깁니다. 달을 넘겨도 포커스를 잃지 않습니다.
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다.

:::tip 달력 자체에 이름 붙이기
한 화면에 달력이 둘 이상이면(예: 시작일/종료일) 각각 `aria-label`을 주세요. → `<Calendar aria-label="시작일 선택" … />`
:::

:::caution 팝업으로 감쌀 때는 직접 챙겨야 합니다
scaffold에는 `Popover` 컴포넌트가 **없습니다.** 직접 팝업을 만든다면 트리거에 `aria-haspopup="dialog"` / `aria-expanded`, 팝업 컨테이너에 `role="dialog"` / `aria-label`, 그리고 **ESC 닫기**를 직접 붙여야 합니다. 구현은 [Date Picker 예제](#1-date-picker-버튼--달력-팝업)를 그대로 가져다 쓰세요.
:::

---

## 스타일링 & 테마

---

Calendar는 프로젝트마다 디자인이 가장 많이 바뀌는 컴포넌트입니다. 아래를 **바꿀 범위가 좁은 순서**로 정리했습니다. **위쪽 방법으로 해결되면 아래로 내려가지 마세요.**

| 바꾸려는 것                   | 방법                                                 |
| ----------------------------- | ---------------------------------------------------- |
| 색상(선택·오늘·비활성)        | **디자인 토큰** (`--primary`, `--muted`, `--ring` …) |
| 셀 크기 · 칸 모서리           | 루트 **CSS 변수** (`--cell-size`, `--cell-radius`)   |
| 이전/다음 버튼 모양           | `buttonVariant` **prop**                             |
| 특정 영역만 여백·정렬·색      | `classNames` **키 단위 교체**                        |
| 셀 안에 내용 추가(점·가격 등) | `components.DayButton` **교체**                      |
| 겉모습 전면 교체              | **`.rdp-*` / `data-*` 선택자 + CSS Module**          |

### 1. 토큰 & CSS 변수

#### 색 — 전역 디자인 토큰

Calendar가 쓰는 색은 전부 시맨틱 토큰입니다. `src/assets/styles/themes/theme-*.css`에서 아래 값만 바꾸면 달력 색이 함께 바뀝니다. **calendar 전용 색 변수를 새로 만들지 마세요.** 다크 모드도 토큰이 알아서 처리합니다.

| 토큰                                 | 달력에서의 역할                           |
| ------------------------------------ | ----------------------------------------- |
| `--primary` / `--primary-foreground` | 선택된 날짜, 기간 양 끝                   |
| `--muted`                            | 오늘 표시, 기간 사이(`range_middle`) 배경 |
| `--muted-foreground`                 | 요일 헤더, 바깥 달 날짜, 비활성 날짜      |
| `--background`                       | 달력 배경                                 |
| `--ring`                             | 키보드 포커스 링                          |
| `--radius-md`                        | `--cell-radius`의 기본값                  |

#### 크기·모서리 — 공개 CSS 변수 2개

루트에 두 개의 변수가 선언되어 있고, 하위 모든 크기 계산이 이 값을 참조합니다.

| CSS 변수        | 역할                                        | 기본값                     |
| --------------- | ------------------------------------------- | -------------------------- |
| `--cell-size`   | 날짜 한 칸의 크기(네비 버튼 크기도 동일)    | `--spacing(7)` ≒ `1.75rem` |
| `--cell-radius` | 날짜 **칸(`td`)** 과 드롭다운의 모서리 반경 | `var(--radius-md)`         |

<img
  src="../assets/ui/calendar-cellsize.png"
  alt="캘린더 셀 크기·모서리 조정"
  width="80%"
/>

```tsx
<Calendar
  mode="range"
  locale={ko}
  selected={range}
  onSelect={setRange}
  // highlight-start
  style={
    {
      "--cell-size": "2.75rem",
      "--cell-radius": "9999px",
    } as React.CSSProperties
  }
  // 날짜 "버튼"의 모서리는 scaffold Button(rounded-lg)을 따르므로
  // 완전한 원형을 원하면 이 한 줄을 더한다.
  classNames={{ day_button: "rounded-full" }}
  // highlight-end
  className="rounded-lg border"
/>
```

:::caution `--cell-radius`만으로는 날짜가 동그래지지 않습니다
`--cell-radius`는 날짜 **칸(`td`)** 에 걸립니다. 오늘 표시나 기간 밴드처럼 **칸 배경으로 그려지는 요소**의 모양이 이 값을 따릅니다.
반면 실제로 클릭되는 날짜 **버튼**은 scaffold `Button`의 `rounded-lg`를 그대로 쓰고, **기간 양 끝(`range_start`/`range_end`)일 때만** `--cell-radius`로 바뀝니다.
→ 그래서 `--cell-radius: 9999px`만 주면 **기간 양 끝은 둥근데 단일 선택은 각진** 상태가 됩니다. 위 예제처럼 `day_button` 한 줄을 더해야 완성됩니다.
:::

:::tip 폰트 크기는 따로 조정하세요
`--cell-size`는 **칸의 크기**만 키웁니다. 숫자까지 커지길 원하면 `className`에 `text-base` 등을 함께 주세요.
:::

#### 네비게이션 버튼 — `buttonVariant`

이전/다음 달 버튼은 scaffold `Button`의 variant를 그대로 씁니다. 기본은 `"ghost"`(배경 없음).

```tsx
// 달력이 흰 카드 위에 있어 화살표가 잘 안 보일 때
<Calendar mode="single" buttonVariant="outline" />
```

### 2. 영역별 클래스 — `classNames`

파트 단위로 Tailwind 클래스를 갈아끼웁니다. **몇 군데만 손볼 때** 적합합니다. 키 이름은 [Anatomy](#구성-anatomy)의 영역 이름과 같습니다.

:::danger `classNames`는 병합이 아니라 **교체**입니다
넘긴 키는 scaffold의 기본 클래스를 **통째로 대체**하므로, 레이아웃까지 같이 날아갑니다.
예를 들어 `month_caption`을 덮어쓰면서 `px-(--cell-size)`를 빠뜨리면 **캡션 글자가 이전/다음 버튼 밑으로 겹칩니다.**
→ **색만 더하고 싶다면 이 방법 대신 [3. CSS Module](#3-겉모습-전면-교체--rdp---data---css-module)을 쓰세요.**
:::

```tsx
<Calendar
  mode="single"
  locale={ko}
  selected={date}
  onSelect={setDate}
  classNames={{
    // 기존 레이아웃 클래스를 그대로 옮겨 적고 색만 추가한다
    month_caption:
      "flex h-(--cell-size) w-full items-center justify-center " +
      "px-(--cell-size) text-sm font-bold text-emerald-700 dark:text-emerald-400",
    weekday:
      "flex-1 text-[0.8rem] font-semibold text-emerald-600/70 dark:text-emerald-400/70",
    today:
      "rounded-(--cell-radius) ring-2 ring-emerald-400 dark:ring-emerald-500",
  }}
  className="rounded-lg border"
/>
```

덮어쓸 영역의 **기본 클래스는 scaffold의 `src/shared/lib/shadcn/ui/calendar.tsx`에서 먼저 확인**하고 필요한 것을 유지하세요. 키 전체 목록은 [ClassNames 타입](https://daypicker.dev/api/type-aliases/ClassNames) 참고.

### 3. 겉모습 전면 교체 — `.rdp-*` / `data-*` + CSS Module

디자인이 통째로 달라질 때 쓰는 방법입니다. **`.tsx`는 손대지 않고 `*.module.css` 하나만 교체**하면 됩니다. [실전 예제 ③](#3-거래내역-조회기간-선택-css-module-전면-재스킨)이 이 방식으로 만들어졌습니다.

#### DOM 후킹 포인트

react-day-picker가 DOM에 노출하는 선택자입니다. 이것들로 어디든 잡을 수 있습니다.

| 선택자                                                                                             | 요소             | 설명                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `[data-slot="calendar"]` · `.rdp-root`                                                             | `div`            | 달력 루트. 두 선택자 모두 붙는다                                     |
| `.rdp-months` / `.rdp-month`                                                                       | `div`            | 달 컨테이너 (여러 달 표시 시 반복)                                   |
| `.rdp-nav`                                                                                         | `nav`            | 이전/다음 버튼 바 (루트 상단에 absolute)                             |
| `.rdp-button_previous` / `.rdp-button_next`                                                        | `button`         | 이전 / 다음 달 버튼                                                  |
| `.rdp-month_caption` / `.rdp-caption_label`                                                        | `div` / `span`   | "2026년 8월" 캡션                                                    |
| `.rdp-dropdowns` / `.rdp-dropdown`                                                                 | `div` / `select` | 월·연 드롭다운 (투명하게 겹쳐 있음)                                  |
| `.rdp-weekdays` / `.rdp-weekday`                                                                   | `tr` / `th`      | 요일 헤더 줄 / 각 요일 칸                                            |
| `.rdp-week` / `.rdp-day`                                                                           | `tr` / `td`      | 한 주 / 날짜 칸                                                      |
| `.rdp-day > button`                                                                                | `button`         | 실제 클릭되는 날짜 버튼                                              |
| `.rdp-today` / `.rdp-outside` / `.rdp-disabled`                                                    | `td`             | 오늘 / 바깥 달 / 선택 불가                                           |
| `.rdp-selected` / `.rdp-range_start` / `.rdp-range_middle` / `.rdp-range_end`                      | `td`             | 선택 · 기간 상태                                                     |
| `td[data-selected]` · `[data-today]` · `[data-outside]` · `[data-disabled]` · `[data-day]`         | `td`             | 클래스 대신 쓸 수 있는 data 속성                                     |
| `button[data-selected-single]` · `[data-range-start]` · `[data-range-middle]` · `[data-range-end]` | `button`         | 버튼 쪽 상태. 값이 문자열이므로 `[data-range-start="true"]`로 잡는다 |
| `.rdp-week_number` / `.rdp-week_number_header`                                                     | `td` / `th`      | `showWeekNumber` 사용 시 주 번호 열                                  |

> `data-day`는 `day.date.toLocaleDateString(locale?.code)` 결과라 **넘긴 로케일에 따라 문자열이 달라집니다.** (`locale={ko}` → `"2026. 8. 12."`)

#### 명시도 사다리 (중요)

scaffold Calendar의 기본 스타일은 **Tailwind 유틸리티**(낮은 명시도)입니다. 래퍼(`.wrap`) + 훅을 **2~4단계로 겹쳐** 유틸리티보다 명시도를 높여야 안정적으로 덮입니다.
같은 단계끼리는 **나중에 선언한 규칙이 이기므로** 아래 순서를 지키세요.

1. 레이아웃/기본형 → `.wrap .rdp-day button` (0,2,1)
2. 요일별 색 → `.wrap .rdp-week .rdp-day:first-child button` (0,4,1)
3. 상태(오늘·범위·비활성) → 같은 (0,4,1)이지만 **2)보다 아래에 선언**

⚠️ 순서를 바꾸면 **일요일 빨강이 선택 상태의 흰 글씨를 덮어써 버립니다.**

```css
/* MyCalendar.module.css — 소비 컴포넌트 바로 옆에 둔다 */

.wrap {
  --brand: #008485;
}

/* 1) 루트 — 공개 변수로 크기부터 잡는다 */
.wrap :global([data-slot="calendar"]) {
  --cell-size: 2.375rem;
  --cell-radius: 8px;
  background: transparent;
}

/* 2) 날짜 버튼 기본형 — (0,2,1) */
.wrap :global(.rdp-day) button {
  border-radius: var(--cell-radius);
  font-weight: 600;
}

/* 3) 요일별 색 — (0,4,1). 반드시 상태 규칙보다 "먼저" 선언 */
.wrap :global(.rdp-week) :global(.rdp-day):first-child button {
  color: #d0455a; /* 일요일 빨강 */
}

/* 4) 상태 규칙 — 3)과 명시도가 같으므로 반드시 "아래에" 선언 */
.wrap :global(.rdp-week) :global(.rdp-day) button[data-selected-single="true"] {
  background: var(--brand);
  color: #fff;
}

/* 다크 모드는 앱 규칙대로 :global(.dark) 로 처리 */
:global(.dark) .wrap {
  --brand: #38b2a7;
}
```

:::tip
CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 4. 셀 내용 커스터마이징 — `components`

날짜 아래에 점·가격·이벤트 표시를 넣으려면 `DayButton`을 교체합니다. `CalendarDayButton`을 감싸면 선택 상태 스타일과 포커스 처리를 그대로 유지할 수 있습니다.

```tsx
import { Calendar, CalendarDayButton } from "@axiom/components/ui";

<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  components={{
    DayButton: (props) => (
      <CalendarDayButton {...props}>
        {props.day.date.getDate()}
        {/* 자식 span은 자동으로 작고 옅게 표시됩니다 */}
        {hasEvent(props.day.date) && <span>3건</span>}
      </CalendarDayButton>
    ),
  }}
/>;
```

- 버튼에 `[&>span]:text-xs [&>span]:opacity-70`이 걸려 있어 **보조 텍스트를 `<span>`으로 넣으면** 톤이 자동으로 맞춰집니다.
- `Chevron`도 같은 방식으로 교체할 수 있습니다(`orientation`으로 `left`/`right`/그 외 구분).

---

## 실전 예제

---

scaffold 예제 페이지(`src/domains/example/pages/ui-components/CalendarComponent.tsx`)와 그 옆의 `components/ui-components/calendar/*`에 실제로 동작하는 코드가 있습니다. 실무에서 가장 자주 요구되는 세 가지입니다.

### 1. Date Picker (버튼 → 달력 팝업)

인풋처럼 생긴 버튼을 누르면 달력이 뜨고, 날짜를 고르거나 바깥 클릭/ESC로 닫히는 패턴입니다.
**scaffold에는 `Popover`가 없으므로** `useRef` + 바깥 클릭 감지로 직접 구현하고, 재사용 가능한 컴포넌트로 분리해 두었습니다.

---

<img
  src="../assets/ui/calendar-button-popover.png"
  alt="캘린더 버튼클릭 팝업"
  width="80%"
/>

```tsx
import DatePickerField from "@/domains/example/components/ui-components/calendar/DatePickerField";

const [date, setDate] = useState<Date | undefined>(undefined);

<DatePickerField
  value={date}
  onChange={setDate}
  disabled={{ before: new Date() }}
  placeholder="날짜를 선택하세요"
/>;
```

**포인트**

- 열림 상태(`open`)와 값(`value`)은 **각각 다른 state**입니다. 날짜를 고르면 값 갱신 + 닫기를 함께 처리합니다.
- 바깥 클릭은 래퍼에 `ref`를 걸고 `mousedown`을, 닫기는 `keydown`(ESC)을 함께 듣습니다. **정리(clean-up)를 잊지 마세요.**
- 리스너는 **열려 있을 때만** 등록합니다(`if (!open) return;`) — 닫힌 픽커가 여러 개 있어도 문서 리스너가 쌓이지 않습니다.
- `defaultMonth={value}`를 넘겨야 **저장된 값이 작년이어도 그 달부터** 열립니다.
- 팝업 안의 달력은 `className="p-2"`만 주면 됩니다 — 테두리·그림자는 팝업 컨테이너가 담당합니다.

<details>
<summary><b>DatePickerField.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/calendar/DatePickerField.tsx"
import { useEffect, useRef, useState } from "react";
import { Calendar } from "@axiom/components/ui";
import { ko } from "date-fns/locale";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import type { Matcher } from "react-day-picker";

export interface IDatePickerFieldProps {
  /** 선택된 날짜 */
  value?: Date;
  /** 날짜가 바뀔 때 호출 (지우기 시 undefined) */
  onChange: (date: Date | undefined) => void;
  /** 미선택 상태에 표시할 문구 */
  placeholder?: string;
  /** 선택 불가 날짜 (react-day-picker Matcher) */
  disabled?: Matcher | Matcher[];
  /** 선택 후 지우기(×) 버튼 노출 여부 */
  clearable?: boolean;
}

export default function DatePickerField({
  value,
  onChange,
  placeholder = "날짜를 선택하세요",
  disabled,
  clearable = true,
}: IDatePickerFieldProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 · ESC 로 닫기 — 열려 있을 때만 리스너 등록
  // highlight-start
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  // highlight-end

  return (
    <div ref={rootRef} className="relative inline-block">
      {/* 트리거 — 입력 필드처럼 보이는 영역 */}
      <div className="inline-flex h-9 items-center rounded-lg border bg-white pr-2 dark:bg-gray-900 …">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          // highlight-start
          aria-haspopup="dialog"
          aria-expanded={open}
          // highlight-end
          className="flex h-full items-center gap-2 px-3 text-sm font-medium …"
        >
          <CalendarDays className="h-4 w-4 …" />
          <span className={value ? "" : "text-gray-400 dark:text-gray-500"}>
            {value
              ? value.toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : placeholder}
          </span>
        </button>

        {/* 값이 있으면 지우기(×), 없으면 셰브론 */}
        {clearable && value ? (
          <button
            type="button"
            aria-label="선택한 날짜 지우기"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 … ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>

      {/* 달력 팝업 */}
      {open && (
        <div
          // highlight-start
          role="dialog"
          aria-label="날짜 선택"
          // highlight-end
          className="animate-in fade-in-0 zoom-in-95 absolute left-0 z-50 mt-1.5 rounded-xl border bg-white shadow-lg dark:bg-gray-900 …"
        >
          <Calendar
            mode="single"
            locale={ko}
            selected={value}
            // highlight-next-line
            defaultMonth={value}
            disabled={disabled}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
            className="p-2"
          />
        </div>
      )}
    </div>
  );
}
```

</details>

:::tip 이 예제에서 가져갈 것
`Calendar`는 **날짜 격자와 선택 로직만** 담당합니다. 팝업 열림/닫힘, 트리거 버튼 모양, 선택 값 표시는 전부 **감싸는 화면의 몫**입니다. 달력 컴포넌트를 복사해서 고치지 마세요.
:::

### 2. 프리셋 버튼 + 달력

"오늘 / 내일 / 1주일 후"처럼 자주 쓰는 날짜를 버튼으로 먼저 제공하고, 그 외에는 달력에서 직접 고르게 하는 패턴입니다.

---

<img
  src="../assets/ui/calendar-presets.png"
  alt="캘린더 프리셋"
  width="80%"
/>

**포인트**

- 프리셋 버튼은 달력의 기능이 아니라 **바깥 state를 갱신하는 별도 UI**입니다. 달력은 `selected`만 받으면 됩니다.
- **`month` / `onMonthChange`를 함께 제어**해야 "2주일 후"처럼 달을 넘어가는 프리셋을 눌렀을 때 화면이 그 달로 따라갑니다. (`selected`만 바꾸면 보이는 달은 그대로입니다.)
- 달력에서 직접 날짜를 고르면 프리셋 활성 표시를 해제해, 버튼과 달력의 상태가 어긋나지 않게 합니다.

```tsx
const PRESETS = [
  { key: "today", label: "오늘", days: 0 },
  { key: "tomorrow", label: "내일", days: 1 },
  { key: "3days", label: "3일 후", days: 3 },
  { key: "1week", label: "1주일 후", days: 7 },
  { key: "2weeks", label: "2주일 후", days: 14 },
];

const addDays = (base: Date, days: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

function PresetCalendar() {
  const today = useMemo(() => startOfToday(), []);
  const [date, setDate] = useState<Date | undefined>(today);
  const [activePreset, setActivePreset] = useState("today");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        {PRESETS.map(({ key, label, days }) => (
          <button
            key={key}
            type="button"
            aria-pressed={activePreset === key}
            onClick={() => {
              setActivePreset(key);
              setDate(addDays(today, days));
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Calendar
        mode="single"
        locale={ko}
        // highlight-start
        month={date} // 보이는 달도 함께 제어해야
        onMonthChange={setDate} // 프리셋이 다른 달이면 화면이 따라간다
        // highlight-end
        selected={date}
        onSelect={(d) => {
          setDate(d);
          setActivePreset(""); // 직접 고르면 프리셋 선택 해제
        }}
        className="rounded-lg border"
      />
    </div>
  );
}
```

### 3. 거래내역 조회기간 선택 (CSS Module 전면 재스킨)

프리셋 + 기간 선택 + **최대 기간 검증** + 조회까지 실제로 동작하는 화면입니다.
scaffold `Calendar`를 **그대로 쓰되** `*.module.css`로 청록 톤에 각진 셀·밴드형 기간 하이라이트까지 전부 다시 입혔습니다. 퍼블리셔는 `.tsx`를 열 필요 없이 **css 파일만 교체**하면 됩니다.

<img
  src="../assets/ui/calendar-period-search.png"
  alt="거래내역 조회기간 선택"
  width="100%"
/>

**포인트**

- 기간 제한은 DayPicker의 `max` 대신 **화면에서 직접 검증**합니다. `max`는 초과 선택을 막기만 할 뿐 이유를 알려주지 않아서, "최대 184일까지 지정할 수 있습니다"라는 `role="alert"` 문구를 띄우려면 이 방식이 필요합니다.
- `disabled={{ after: today }}`로 미래 날짜를 잠급니다. 기준일(`today`)은 `useMemo`로 **한 번만 계산**합니다.
- 프리셋·요약·에러·액션 버튼은 전부 **달력 바깥의 내 마크업**입니다. 달력은 `mode`·`selected`·`onSelect`만 받습니다.
- CSS는 [명시도 사다리](#명시도-사다리-중요) 순서를 그대로 따릅니다 — 기본형 → 요일 색 → 상태.

<details>
<summary><b>PeriodSearchCalendar.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/calendar/PeriodSearchCalendar.tsx"
import { useMemo, useState } from "react";
import { Calendar } from "@axiom/components/ui";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import styles from "./PeriodSearchCalendar.module.css";

/** 조회 기간 프리셋 — 오늘로부터 N일 전 ~ 오늘 */
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "오늘", days: 0 },
  { key: "1w", label: "1주일", days: 7 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
];

/** 조회 가능한 최대 기간(일) */
const MAX_RANGE_DAYS = 184;

// startOfDay / addDays / countDays / formatDot 유틸은 생략

export default function PeriodSearchCalendar(): React.ReactNode {
  // 오늘 이후는 조회할 수 없으므로 기준일을 한 번만 계산해 둔다.
  // highlight-next-line
  const today = useMemo(() => startOfDay(new Date()), []);

  const [range, setRange] = useState<DateRange | undefined>({
    from: addDays(today, -30),
    to: today,
  });
  const [activePreset, setActivePreset] = useState<string>("1m");
  const [searched, setSearched] = useState<DateRange | undefined>(undefined);

  // DayPicker의 max 대신 화면에서 직접 검증 → 사용자에게 이유를 알려줄 수 있다
  // highlight-start
  const days = range?.from && range?.to ? countDays(range.from, range.to) : 0;
  const tooLong = days > MAX_RANGE_DAYS;
  const canSearch = Boolean(range?.from && range?.to) && !tooLong;
  // highlight-end

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* 헤더 · 프리셋 칩 · 선택 요약은 전부 달력 바깥의 내 마크업 */}
        {/* … 생략 … */}

        {/* scaffold 제공 Calendar — 스타일만 CSS Module 로 오버라이드 */}
        <div className={styles.calendarBox}>
          <Calendar
            mode="range"
            locale={ko}
            numberOfMonths={2}
            selected={range}
            defaultMonth={addDays(today, -30)}
            // highlight-next-line
            disabled={{ after: today }}
            onSelect={(next) => {
              setRange(next);
              setActivePreset("");
              setSearched(undefined);
            }}
          />
        </div>

        {tooLong && (
          <p role="alert" className={styles.error}>
            조회기간은 최대 {MAX_RANGE_DAYS}일까지 지정할 수 있습니다. (현재{" "}
            {days}일)
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleReset}
            className={styles.btnGhost}
          >
            초기화
          </button>
          <button
            type="button"
            disabled={!canSearch}
            onClick={() => setSearched(range)}
            className={styles.btnPrimary}
          >
            조회하기
          </button>
        </div>

        {/* 조회 결과 배너 … 생략 … */}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>PeriodSearchCalendar.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/calendar/PeriodSearchCalendar.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — NIC 뱅킹 청록 톤 */
  --nic-teal: #008485;
  --nic-teal-deep: #00625f;
  --nic-teal-soft: #eaf6f5;
  --nic-band: #ddf0ee;
  --nic-ink: #1b2b2a;
  --nic-faint: #b8c5c4;
  --nic-sun: #d0455a; /* 일요일 */
  --nic-sat: #2b6ef2; /* 토요일 */
  /* … 이하 동일 패턴 */

  color: var(--nic-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --nic-teal: #38b2a7;
  --nic-band: #16403d;
  --nic-ink: #e8f1f0;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * 여기서부터 scaffold Calendar 오버라이드
 * ========================================================================= */

/* 1) 루트 — 셀 크기/모서리는 공개 CSS 변수로 조정한다.
 *    scaffold가 [--cell-size:--spacing(7)] 유틸리티로 심어둔 값을 여기서 덮어쓴다. */
/* highlight-start */
.wrap :global([data-slot="calendar"]) {
  --cell-size: 2.375rem;
  --cell-radius: 8px;
  background: transparent;
  padding: 8px 4px 4px;
}
/* highlight-end */

/* 2) 달 컨테이너 — 두 달 사이 간격 */
.wrap :global(.rdp-months) {
  gap: 28px;
}

/* 3) 이전 / 다음 버튼, 4) 월 캡션, 5) 요일 헤더 … 생략 … */

/* 6) 날짜 칸(td) — 기본은 배경 없음. 기간 밴드만 배경을 갖는다.
 *    scaffold는 기간 양끝 td에 ::after로 밴드를 1rem 연장해 둔다.
 *    이 예제는 셀 사이 간격이 없어 연장이 필요 없고, 오히려 한쪽만 선택했을 때
 *    꼬리처럼 삐져나오므로 끈다. */
/* highlight-start */
.wrap :global(.rdp-range_start)::after,
.wrap :global(.rdp-range_end)::after {
  display: none;
}
/* highlight-end */

/* 7) 날짜 버튼 기본형 — (0,2,1) */
.wrap :global(.rdp-day) button {
  width: 100%;
  height: var(--cell-size);
  border-radius: var(--cell-radius);
  background: transparent;
  color: var(--nic-ink);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 8) 요일별 글자색 — (0,4,1). 반드시 아래 상태 규칙보다 먼저 선언한다. */
.wrap :global(.rdp-week) :global(.rdp-day):first-child button {
  color: var(--nic-sun);
}
.wrap :global(.rdp-week) :global(.rdp-day):last-child button {
  color: var(--nic-sat);
}

/* ── 이하 상태 규칙: 모두 (0,4,1) 이상 & 8) 보다 아래에 선언 ───────── */

/* 9) 오늘 — 밑에 점을 찍어 표시 */
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-today) button {
  position: relative;
  color: var(--nic-teal-deep);
  font-weight: 800;
}
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-today) button::after {
  content: "";
  position: absolute;
  bottom: 4px;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: currentColor;
}

/* 10) 바깥 달, 11) 선택 불가(취소선) … 생략 … */

/* 12) 기간 밴드 — td 배경으로 연속된 띠를 만든다 */
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-range_middle),
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-range_start),
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-range_end) {
  background: var(--nic-band);
}
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-range_start) {
  border-radius: var(--cell-radius) 0 0 var(--cell-radius);
}
.wrap :global(.rdp-week) :global(.rdp-day):global(.rdp-range_end) {
  border-radius: 0 var(--cell-radius) var(--cell-radius) 0;
}
/* 시작일 == 종료일(하루만 선택)이면 양쪽 다 둥글게 */
.wrap
  :global(.rdp-week)
  :global(.rdp-day):global(.rdp-range_start):global(.rdp-range_end) {
  border-radius: var(--cell-radius);
}

/* 13) 기간 양끝 · 단일 선택 — 진한 청록 채움 */
.wrap :global(.rdp-week) :global(.rdp-day) button[data-range-start="true"],
.wrap :global(.rdp-week) :global(.rdp-day) button[data-range-end="true"],
.wrap :global(.rdp-week) :global(.rdp-day) button[data-selected-single="true"] {
  background: var(--nic-teal);
  color: #fff;
  font-weight: 800;
  border-radius: var(--cell-radius);
}

/* 14) hover — 선택된 셀에는 걸리지 않도록 :not() 으로 제외 */
.wrap
  :global(.rdp-day)
  button:not([data-range-start="true"]):not([data-range-end="true"]):not(
    [data-selected-single="true"]
  ):not(:disabled):hover {
  background: var(--nic-teal-soft);
  color: var(--nic-teal-deep);
}

/* 15) 키보드 포커스 링 */
.wrap :global(.rdp-day) button:focus-visible {
  outline: 2px solid var(--nic-teal);
  outline-offset: -2px;
}

/* ── 반응형 — 좁은 화면에서 셀을 줄인다 ─────────────────── */
@media (max-width: 640px) {
  .wrap :global(.rdp-months) {
    gap: 16px;
  }
  .wrap :global([data-slot="calendar"]) {
    --cell-size: 2.125rem;
  }
}
```

</details>

:::tip 이 예제에서 가져갈 것
동작(기간 선택·키보드·접근성)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①공개 CSS 변수(`--cell-size`/`--cell-radius`) ②`.rdp-*` / `data-*` 오버라이드 ③달력 바깥의 **내 마크업** 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---

## 참고 링크

---

- [Calendar — shadcn/ui](https://ui.shadcn.com/docs/components/calendar) — 스타일 원본과 Date Picker 조합 예제
- [React DayPicker](https://daypicker.dev) — 전체 prop·타입·고급 사용법
- [DayPicker 셀렉션 모드](https://daypicker.dev/docs/selection-modes) — `single` / `multiple` / `range` 상세
- [DayPicker Styling](https://daypicker.dev/docs/styling) — `.rdp-*` 클래스와 커스텀 스타일
- [date-fns locale](https://date-fns.org/docs/I18n) — 로케일 목록

---
