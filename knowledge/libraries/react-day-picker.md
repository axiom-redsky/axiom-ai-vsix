---
title: react-day-picker 날짜 선택 컴포넌트
version: "^9.14"
tags: [react-day-picker, daypicker, 달력, calendar, 날짜선택, datepicker, 캘린더]
scope: library
related: [libraries/dayjs.md, components/Form.md]
---

# react-day-picker

react-app-scaffold에 `react-day-picker ^9.14`이 설치되어 있다. shadcn/ui의 `Calendar` 컴포넌트는 내부적으로 이 라이브러리를 사용한다.

## shadcn/ui Calendar 컴포넌트 (권장)

shadcn Calendar 컴포넌트가 이미 `@axiom/components/ui`에 포함되어 있으면 직접 사용 권장:

```tsx
import { Calendar } from '@axiom/components/ui';
import { useState } from 'react';

function DatePickerExample() {
  const [date, setDate] = useState<Date | undefined>();

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      locale={ko}    // date-fns/locale의 ko
    />
  );
}
```

## react-day-picker 직접 사용 (v9 API)

```tsx
import { DayPicker } from 'react-day-picker';
import { ko } from 'date-fns/locale';
import 'react-day-picker/style.css';

function DatePicker() {
  const [selected, setSelected] = useState<Date>();

  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={setSelected}
      locale={ko}
      footer={selected ? `선택: ${selected.toLocaleDateString('ko-KR')}` : '날짜를 선택하세요'}
    />
  );
}
```

## 범위 선택 모드

```tsx
import type { DateRange } from 'react-day-picker';

function DateRangePicker() {
  const [range, setRange] = useState<DateRange>();

  return (
    <DayPicker
      mode="range"
      selected={range}
      onSelect={setRange}
      locale={ko}
    />
  );
}
```

## v8 vs v9 차이점 (주의)

```tsx
// v8 방식 — 사용 금지
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css'; // 경로 다름

// v9 방식
import 'react-day-picker/style.css'; // 경로 변경됨
```

## react-hook-form과 연동

```tsx
import { Controller } from 'react-hook-form';

<Controller
  control={form.control}
  name="date"
  render={({ field }) => (
    <DayPicker
      mode="single"
      selected={field.value}
      onSelect={field.onChange}
      locale={ko}
    />
  )}
/>
```
