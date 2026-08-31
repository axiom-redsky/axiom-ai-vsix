---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Select"
hide_table_of_contents: false
---

# Select 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 셀렉트(드롭다운) 컴포넌트입니다.  
정해진 목록에서 **하나만** 고르는 입력에 사용합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Select 컴포넌트`(`/ui-components/select`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 정렬 기준·등급·카드사처럼 **선택지가 고정**되어 있고 **검색이 필요 없는** 단일 선택
- 항목이 8개 이상이라 라디오로 펼치면 화면이 길어지는 경우
- 드롭다운 **안쪽까지 디자인**해야 하는 경우 (2줄 항목, 배지, 아이콘, 그룹 헤더 등)

:::tip NativeSelect · Combobox 와의 구분

| 상황                                       | 쓸 것                                     |
| ------------------------------------------ | ----------------------------------------- |
| 목록 안을 디자인해야 함(2줄·배지·아이콘)   | **Select** (radix 기반, 이 문서)          |
| 드롭다운 커스터마이징 불필요 · 모바일 우선 | [NativeSelect](./native-select-component) |
| 항목이 수십~수백 개 · 검색 · 다중 선택     | [Combobox](./combobox-component)          |
| 선택지 2~7개를 한 번에 다 보여줘야 함      | [RadioGroup](./radio-group-component)     |

한 줄 요약 — **목록이 짧고 고정**이면 Select, **찾아야 할 만큼 많거나 여러 개**를 고르면 Combobox, **드롭다운을 안 꾸며도 되면** NativeSelect.
:::

:::caution 다중 선택은 불가능합니다
radix Select는 **항상 값이 하나**입니다. `multiple`에 해당하는 옵션이 없습니다. 여러 개를 골라야 하면 [Combobox](./combobox-component) 또는 [Checkbox](./checkbox-component) 목록을 쓰세요.
:::

---

## Import

---

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "@axiom/components/ui";
```

Select는 여러 파트를 조합해서 쓰는 합성(compound) 컴포넌트입니다. **최소 구성은 5개** — `Select` + `SelectTrigger` + `SelectValue` + `SelectContent` + `SelectItem` 입니다. 나머지(`SelectGroup` · `SelectLabel` · `SelectSeparator`)는 항목이 많을 때만 씁니다.

내보내는 것은 총 10개이며, `SelectScrollUpButton` / `SelectScrollDownButton`도 export되어 있지만 **`SelectContent`가 내부에서 자동으로 렌더**하므로 직접 쓸 일은 거의 없습니다.

---

## 기본 사용법

---

`SelectValue`의 `placeholder`로 선택 전 안내 문구를 지정하고, 각 `SelectItem`에 **서로 다른 `value`** 를 줍니다.

<img
  src="../assets/ui/select-basic.png"
  alt="Select 컴포넌트 기본"
  width="80%"
/>

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="도시를 선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="seoul">서울</SelectItem>
    <SelectItem value="busan">부산</SelectItem>
    <SelectItem value="incheon">인천</SelectItem>
  </SelectContent>
</Select>
```

- `SelectTrigger`의 기본 너비는 **`w-fit`(내용만큼)** 입니다. 폼 필드처럼 꽉 채우려면 `className="w-full"`을 주세요.
- 화살표 아이콘(`ChevronDown`)은 `SelectTrigger`가 **자동으로** 붙입니다. 직접 넣지 마세요.
- `SelectContent`는 **Portal로 `<body>` 직속에** 렌더됩니다. 스타일을 덮어쓸 때 이 점이 가장 중요합니다. ([스타일링 & 테마](#2-selectcontent-는-portal-입니다) 참고)

:::danger `SelectItem`의 `value`에 빈 문자열은 쓸 수 없습니다
빈 문자열을 주면 radix가 **런타임 에러를 던집니다.**

> A `<Select.Item />` must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.

빈 문자열(`""`)은 **"선택 해제(placeholder 표시)"** 예약값이기 때문입니다. "전체 / 선택 안 함" 항목이 필요하면 `value="all"` 같은 **실제 값**을 쓰세요.

```tsx
{
  /* ❌ 런타임 에러 */
}
<SelectItem value="">전체</SelectItem>;

{
  /* ✅ */
}
<SelectItem value="all">전체</SelectItem>;
```

반대로 **제어 모드에서 값을 지우고 싶을 때는** `setCity("")`가 정답입니다. placeholder가 다시 나타납니다.
:::

---

## 구성 (Anatomy)

---

```tsx
<Select>
  {" "}
  {/* 루트 — 선택값·열림 상태·폼 연동을 관리 */}
  <SelectTrigger>
    {" "}
    {/* 닫혀 있을 때 보이는 버튼(+ 화살표 아이콘 자동) */}
    <SelectValue /> {/* 트리거 안에 표시될 "현재 값" 또는 placeholder */}
  </SelectTrigger>
  <SelectContent>
    {" "}
    {/* 드롭다운 패널 — Portal 로 body 직속에 렌더 */}
    <SelectGroup>
      {" "}
      {/* (선택) 카테고리 묶음 — 목록 패딩(p-1)을 담당 */}
      <SelectLabel /> {/* (선택) 그룹 제목 — 선택 불가 */}
      <SelectItem /> {/* 항목 하나 — value 로 식별 */}
    </SelectGroup>
    <SelectSeparator /> {/* (선택) 그룹 사이 구분선 */}
  </SelectContent>
</Select>
```

| 파트              | 역할                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `Select`          | 루트. 선택값(`value`)·열림 상태(`open`)·폼 연동을 관리합니다. DOM을 만들지 않습니다. |
| `SelectTrigger`   | 닫힘 상태의 버튼. `size` prop과 `ChevronDown` 아이콘을 갖습니다.                     |
| `SelectValue`     | 트리거 안의 값 표시 영역. `placeholder`를 받고, 선택 시 항목 텍스트가 복제됩니다.    |
| `SelectContent`   | 드롭다운 패널. **Portal**로 렌더되며 스크롤 버튼을 자동 포함합니다.                  |
| `SelectGroup`     | 항목 묶음. **목록 안쪽 여백(`p-1`)이 여기 걸려 있습니다.**                           |
| `SelectLabel`     | 그룹 제목. 선택되지 않고 키보드 이동에서도 건너뜁니다.                               |
| `SelectItem`      | 항목 하나. `value`(고유 키)를 가지며 우측에 체크 아이콘 자리를 비워둡니다.           |
| `SelectSeparator` | 그룹 사이 구분선.                                                                    |

렌더 결과를 보면 재스타일링 진입점(`data-slot`)이 보입니다.

```html
<!-- 트리거 (닫힘 · 아직 선택 안 함) -->
<button
  type="button"
  role="combobox"
  aria-controls="radix-«r1»"
  aria-expanded="false"
  aria-autocomplete="none"
  data-slot="select-trigger"
  data-size="default"
  data-state="closed"
  data-placeholder=""
>
  <span data-slot="select-value">도시를 선택하세요</span>
  <svg><!-- ChevronDown — 컴포넌트가 자동으로 넣음 --></svg>
</button>

<!-- 드롭다운 (열림) — body 직속(Portal) -->
<div
  data-slot="select-content"
  data-state="open"
  data-align-trigger="true"
  role="listbox"
>
  <div data-slot="select-scroll-up-button">…</div>
  <div data-radix-select-viewport>
    <div data-slot="select-group">
      <div data-slot="select-label">국산</div>

      <!-- 선택된 항목 -->
      <div
        data-slot="select-item"
        role="option"
        data-state="checked"
        aria-selected="true"
      >
        <span
          ><svg><!-- CheckIcon (선택됐을 때만 렌더) --></svg></span
        >
        <span>사과</span>
      </div>

      <!-- 마우스/키보드가 올라간 항목 -->
      <div
        data-slot="select-item"
        role="option"
        data-state="unchecked"
        data-highlighted=""
      >
        <span><!-- indicator 없음 --></span>
        <span>배</span>
      </div>
    </div>
  </div>
  <div data-slot="select-scroll-down-button">…</div>
</div>
```

:::note 목록 여백은 `SelectGroup`이 담당합니다
`p-1`(4px) 패딩이 `SelectContent`가 아니라 **`SelectGroup`에** 걸려 있습니다. `SelectItem`을 `SelectContent` 바로 아래에 넣으면 **항목이 패널 가장자리에 붙습니다.**

항목이 몇 개뿐이라도 `SelectGroup`으로 한 번 감싸거나, `<SelectContent className="p-1">`을 직접 주세요.

```tsx
{
  /* 여백 없음 — 항목이 패널에 딱 붙음 */
}
<SelectContent>
  <SelectItem value="seoul">서울</SelectItem>
</SelectContent>;

{
  /* ✅ 그룹으로 감싸면 p-1 적용 */
}
<SelectContent>
  <SelectGroup>
    <SelectItem value="seoul">서울</SelectItem>
  </SelectGroup>
</SelectContent>;
```

:::

---

## 동작 옵션

---

### 1. 초기 선택 — `defaultValue` (비제어)

```tsx
<Select defaultValue="busan">
  <SelectTrigger>
    <SelectValue placeholder="도시를 선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="seoul">서울</SelectItem>
    <SelectItem value="busan">부산</SelectItem>
  </SelectContent>
</Select>
```

`defaultValue`는 **비제어(uncontrolled)** 초기값입니다. 이후 선택 상태는 컴포넌트가 알아서 관리하므로 state가 필요 없습니다.

- 초기값이 있으면 placeholder는 **처음부터 보이지 않습니다.** 그래도 `placeholder`는 값을 지웠을 때를 대비해 남겨두는 편이 좋습니다.
- `value`와 `defaultValue`를 **동시에 쓰지 마세요.** 둘 중 하나만 씁니다.

### 2. 외부에서 제어 — `value` / `onValueChange`

선택값을 바깥 state로 다뤄야 할 때(다른 UI와 연동, 유효성 검사, 폼 라이브러리 연결) 씁니다.

```tsx
import { useState } from "react";

function Example() {
  const [city, setCity] = useState("");

  return (
    <>
      <p>
        현재 값: <code>{city || "(없음)"}</code>
      </p>

      <Select
        // highlight-start
        value={city}
        onValueChange={setCity}
        // highlight-end
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="지역을 선택하세요" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="seoul">서울</SelectItem>
            <SelectItem value="busan">부산</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <button onClick={() => setCity("")}>초기화</button>
    </>
  );
}
```

- `onValueChange`는 이벤트 객체가 아니라 **선택된 `value` 문자열**을 그대로 넘겨줍니다. (`NativeSelect`의 `onChange`와 다릅니다 — 그쪽은 `e.target.value`)
- `value`를 넘기는 순간 **제어 모드**가 됩니다. `onValueChange`로 state를 갱신하지 않으면 클릭해도 값이 바뀌지 않습니다.
- 값은 항상 **문자열**입니다. 숫자 id를 다룬다면 `String(id)` ↔ `Number(value)`로 변환하세요.
- **초기화는 빈 문자열**(`setCity("")`)로 합니다. placeholder가 다시 나타납니다.

열림 상태까지 제어하려면 `open` / `onOpenChange`를 씁니다. (다른 버튼으로 목록을 열거나, 열릴 때 데이터를 불러오는 경우)

```tsx
const [open, setOpen] = useState(false);

<Select open={open} onOpenChange={setOpen} value={city} onValueChange={setCity}>
```

### 3. 그룹 나누기 — `SelectGroup` / `SelectLabel` / `SelectSeparator`

항목이 많을 때 카테고리로 묶습니다.

<img
  src="../assets/ui/select-group.png"
  alt="select 그룹 나누기"
  width="80%"
/>

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="과일을 선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>국산</SelectLabel>
      <SelectItem value="apple">사과</SelectItem>
      <SelectItem value="pear">배</SelectItem>
    </SelectGroup>

    {/* highlight-next-line */}
    <SelectSeparator />

    <SelectGroup>
      <SelectLabel>수입</SelectLabel>
      <SelectItem value="banana">바나나</SelectItem>
      <SelectItem value="mango">망고</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

- `SelectLabel`은 **선택되지 않습니다.** 키보드 방향키 이동에서도 건너뜁니다.
- `SelectSeparator`에는 `pointer-events-none`이 걸려 있어 클릭이 통과합니다.
- 구분선은 `SelectGroup` **사이**(형제)에 두세요. 그룹 안에 넣으면 그룹 패딩 안쪽으로 들어가 어긋나 보입니다.

### 4. 크기와 너비 — `size` / `className`

```tsx
<SelectTrigger size="sm">…</SelectTrigger>   {/* h-7 (28px) */}
<SelectTrigger>…</SelectTrigger>             {/* h-8 (32px) — 기본 */}

{/* 폼 필드처럼 꽉 채우기 */}
<SelectTrigger className="w-full">…</SelectTrigger>
```

<img
  src="../assets/ui/select-size.png"
  alt="select 사이즈"
  width="80%"
/>

- 기본 너비가 `w-fit`이라 **선택한 값의 길이에 따라 트리거 너비가 들쭉날쭉 변합니다.** 폼 안에서는 `w-full`(또는 `min-w-*`)을 주는 편이 안정적입니다.
- 트리거 안의 `SelectValue`에는 `line-clamp-1`이 걸려 있어 긴 값은 **한 줄로 잘립니다.** 2줄 표시가 필요하면 [스타일링 5번](#5-트리거-표시를-직접-그리기--selectvalue-children)을 참고하세요.

:::caution `size="lg"`는 타입만 있고 스타일이 없습니다
`SelectTrigger`의 타입은 `"sm" | "default" | "lg"`지만, 실제 클래스는 `data-[size=sm]:h-7` · `data-[size=default]:h-8` **두 개뿐**입니다. `size="lg"`를 주면 `data-size="lg"`만 붙고 매칭되는 높이 클래스가 없어, `py-2` 패딩 기준의 자동 높이(약 36px)가 됩니다.

큰 사이즈가 필요하면 `className="h-10"`처럼 **직접 지정**하세요.
:::

### 5. 비활성화 — `disabled`

```tsx
{
  /* ① 전체 비활성화 */
}
{
  /* highlight-next-line */
}
<Select disabled defaultValue="seoul">
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>…</SelectContent>
</Select>;

{
  /* ② 특정 항목만 비활성화 */
}
<Select>
  <SelectTrigger>
    <SelectValue placeholder="지점 선택" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="seoul">서울</SelectItem>
      {/* highlight-next-line */}
      <SelectItem value="daegu" disabled>
        대구 (마감)
      </SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>;
```

- 전체 비활성화: 트리거가 `opacity-50` + `cursor-not-allowed`가 되고 `data-disabled`가 붙습니다.
- 항목 비활성화: `data-disabled`가 붙어 `opacity-50` + `pointer-events-none`이 되고, **키보드 이동에서도 건너뜁니다.**
- 비활성 항목은 **왜 못 고르는지** 함께 알려주세요. (예: `대구 (마감)`)

### 6. 드롭다운 위치 — `position` / `align` / `sideOffset`

`SelectContent`의 기본값은 `position="item-aligned"`, `align="center"` 입니다.

```tsx
{
  /* 기본 — 선택된 항목이 트리거 위에 겹쳐 뜨는 네이티브 셀렉트 방식 */
}
<SelectContent>…</SelectContent>;

{
  /* 트리거 아래에 붙는 일반 드롭다운 */
}
{
  /* highlight-next-line */
}
<SelectContent position="popper" align="start" sideOffset={6}>
  …
</SelectContent>;
```

| position                | 동작                                                              | 어울리는 곳              |
| ----------------------- | ----------------------------------------------------------------- | ------------------------ |
| `"item-aligned"` (기본) | **선택된 항목이 트리거 위에 오도록** 목록 전체가 위치를 잡습니다. | 값을 바꾸는 폼 필드      |
| `"popper"`              | 트리거 **아래(또는 위)** 에 붙는 팝오버 방식.                     | 필터 바, 툴바, 메뉴형 UI |

- `align` / `side` / `sideOffset` / `alignOffset`은 **`position="popper"`일 때만** 의미가 있습니다. `item-aligned`에서는 무시됩니다.
- `popper` 모드에서는 목록 너비가 트리거 너비 이상이 되도록 `min-w-(--radix-select-trigger-width)`가 걸려 있습니다. 트리거보다 넓은 목록을 쓰려면 `SelectContent`에 `min-w-*`를 직접 주세요.
- `popper` 모드에서만 `data-side="top|bottom|left|right"`가 붙습니다. 위/아래에 따라 다른 스타일을 주려면 이 속성을 쓰세요.

:::info 화면 아래쪽 필드에서 `item-aligned`가 이상하게 뜬다면
`item-aligned`는 선택 항목을 트리거에 맞추느라 목록을 **위로 끌어올립니다.** 화면 하단의 필드에서는 목록이 트리거를 가려 어색해 보일 수 있습니다. 그럴 땐 `position="popper"`가 자연스럽습니다.
:::

### 7. 긴 목록 — 스크롤과 높이 제한

항목이 화면보다 길면 위/아래 **스크롤 버튼이 자동으로** 붙습니다. (`SelectScrollUpButton` / `SelectScrollDownButton`을 `SelectContent`가 내부에서 렌더합니다.)

```tsx
<Select defaultValue="1">
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  {/* highlight-next-line */}
  <SelectContent className="max-h-56">
    <SelectGroup>
      {months.map((m) => (
        <SelectItem key={m.value} value={m.value}>
          {m.label}
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

- 높이를 지정하지 않으면 **뷰포트에 들어가는 만큼**(`max-h-(--radix-select-content-available-height)`) 자동으로 늘어납니다.
- 목록을 더 짧게 고정하고 싶을 때만 `max-h-*`를 주세요.
- 항목이 **수십 개 이상**이면 Select보다 검색이 되는 [Combobox](./combobox-component)가 적합합니다.

### 8. 폼 전송 — `name` / `required`

`<form>` 안에서 쓰면 radix가 **숨은 `<select>`를 자동으로 렌더**해 값을 실어 보냅니다.

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    console.log(fd.get("city")); // 'seoul'
  }}
>
  {/* highlight-next-line */}
  <Select name="city" required>
    <SelectTrigger className="w-full">
      <SelectValue placeholder="도시를 선택하세요" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="seoul">서울</SelectItem>
        <SelectItem value="busan">부산</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>

  <button type="submit">전송</button>
</form>
```

:::caution `name` 없이는 폼에 담기지 않습니다
숨은 select에 `name`이 그대로 전달되므로, **`name`을 주지 않으면 `FormData`에 아무것도 들어가지 않습니다.** (자동 생성되지 않습니다.)

또한 숨은 select는 **트리거가 `<form>` 안에 있을 때만** 렌더됩니다(`trigger.closest("form")`). `<form>` 밖에서 값을 보내려면 `form="폼id"` prop을 주거나, `useState`로 값을 직접 들고 있다가 제출 시 함께 보내세요.
:::

### 9. 유효성 오류 표시 — `aria-invalid`

필수 항목인데 선택되지 않았을 때, `SelectTrigger`에 `aria-invalid`를 주면 destructive(빨강) 테두리·링이 적용됩니다.

<img
  src="../assets/ui/select-invalid.png"
  alt="select 유효성"
  width="80%"
/>

```tsx
const [city, setCity] = useState("");
const [submitted, setSubmitted] = useState(false);
const invalid = submitted && city === "";

<div className="grid gap-2">
  <Label htmlFor="ctl-city">배송 지역 (필수)</Label>
  <Select value={city} onValueChange={setCity}>
    <SelectTrigger
      id="ctl-city"
      className="w-full"
      // highlight-next-line
      aria-invalid={invalid}
    >
      <SelectValue placeholder="지역을 선택하세요" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="seoul">서울</SelectItem>
        <SelectItem value="busan">부산</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
  {invalid && (
    <p className="text-xs text-destructive">배송 지역을 선택해 주세요.</p>
  )}
</div>;
```

- `aria-invalid`는 **루트(`Select`)가 아니라 `SelectTrigger`에** 줍니다. 스타일이 트리거에 걸려 있기 때문입니다.
- 라벨은 `Label`의 `htmlFor` ↔ `SelectTrigger`의 `id`로 연결합니다. 연결하면 **라벨을 클릭해도 목록이 열립니다.**
- 색만으로 오류를 알리지 마세요. 위 예시처럼 **오류 문구를 함께** 띄웁니다.

---

## API 레퍼런스

---

모두 **Radix Select**(`@radix-ui/react-select`) 기반이라, 아래 표에 없는 Radix 표준 prop과 DOM 속성(`id`, `aria-*`, `style`, `onClick` 등)도 그대로 전달됩니다.

### `Select` (루트)

| Prop            | 타입                      | 기본값  | 설명                                                         |
| --------------- | ------------------------- | ------- | ------------------------------------------------------------ |
| `value`         | `string`                  | —       | 현재 선택값 (**제어 모드**). `""`이면 placeholder 표시       |
| `defaultValue`  | `string`                  | —       | 초기 선택값 (**비제어 모드**)                                |
| `onValueChange` | `(value: string) => void` | —       | 선택이 바뀔 때 호출. 인자는 이벤트가 아니라 **value 문자열** |
| `open`          | `boolean`                 | —       | 드롭다운 열림 상태 (제어)                                    |
| `defaultOpen`   | `boolean`                 | `false` | 초기 열림 여부 (비제어)                                      |
| `onOpenChange`  | `(open: boolean) => void` | —       | 열림 상태 변경 콜백                                          |
| `disabled`      | `boolean`                 | `false` | 전체 비활성화                                                |
| `name`          | `string`                  | —       | 폼 전송 시 필드명. **없으면 FormData에 담기지 않음**         |
| `required`      | `boolean`                 | `false` | 폼 제출 시 필수 (트리거에 `aria-required`)                   |
| `form`          | `string`                  | —       | `<form>` 밖에 있을 때 연결할 폼 id                           |
| `dir`           | `"ltr" \| "rtl"`          | `"ltr"` | 텍스트 방향                                                  |

> `Select` 루트는 **DOM 요소를 만들지 않습니다.** `className`을 줘도 적용될 곳이 없습니다. 클래스는 `SelectTrigger` / `SelectContent`에 주세요.

### `SelectTrigger`

| Prop           | 타입                        | 기본값      | 설명                                                           |
| -------------- | --------------------------- | ----------- | -------------------------------------------------------------- |
| `size`         | `"sm" \| "default" \| "lg"` | `"default"` | 높이 (`sm`=h-7, `default`=h-8). **`lg`는 스타일 미구현**       |
| `id`           | `string`                    | —           | `Label`의 `htmlFor`와 연결할 id                                |
| `aria-invalid` | `boolean`                   | —           | 유효성 오류 표시(destructive 테두리·링)                        |
| `className`    | `string`                    | —           | 기본이 `w-fit`이므로 전체 너비는 `"w-full"` 지정               |
| `children`     | `ReactNode`                 | —           | 보통 `SelectValue` 하나. 아이콘·접두 라벨을 함께 넣어도 됩니다 |

### `SelectValue`

| Prop          | 타입        | 기본값 | 설명                                                                      |
| ------------- | ----------- | ------ | ------------------------------------------------------------------------- |
| `placeholder` | `ReactNode` | —      | 미선택(`value === ""`) 상태에 표시할 내용. 문자열이 아니어도 됩니다       |
| `children`    | `ReactNode` | —      | 트리거 표시를 **직접 그릴 때**. 미지정 시 선택 항목의 텍스트가 복제됩니다 |

### `SelectContent`

| Prop                                                            | 타입                                     | 기본값           | 설명                                                    |
| --------------------------------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------------- |
| `position`                                                      | `"item-aligned" \| "popper"`             | `"item-aligned"` | 목록 배치 방식                                          |
| `align`                                                         | `"start" \| "center" \| "end"`           | `"center"`       | **popper 전용** 정렬                                    |
| `side`                                                          | `"top" \| "right" \| "bottom" \| "left"` | `"bottom"`       | **popper 전용** 방향                                    |
| `sideOffset`                                                    | `number`                                 | `0`              | **popper 전용** 트리거와의 간격                         |
| `className`                                                     | `string`                                 | —                | **Portal이라 부모 선택자로 못 잡습니다. 직접 넘기세요** |
| `onCloseAutoFocus` / `onEscapeKeyDown` / `onPointerDownOutside` | `(e) => void`                            | —                | 닫힘 동작 제어 (Radix 표준)                             |

### `SelectItem` / `SelectGroup` / `SelectLabel` / `SelectSeparator`

| 컴포넌트          | Prop        | 타입        | 설명                                                                      |
| ----------------- | ----------- | ----------- | ------------------------------------------------------------------------- |
| `SelectItem`      | `value`     | `string`    | 항목 값 **(필수, 빈 문자열 불가 — 에러)**                                 |
| `SelectItem`      | `disabled`  | `boolean`   | 해당 항목만 비활성화                                                      |
| `SelectItem`      | `textValue` | `string`    | 키보드 타이핑 검색·값 복제에 쓸 텍스트 (children이 문자열이 아닐 때 지정) |
| `SelectItem`      | `children`  | `ReactNode` | 항목 내용. **전부 ItemText 안에 들어갑니다**                              |
| `SelectGroup`     | `children`  | `ReactNode` | `SelectLabel` + `SelectItem` 묶음. **`p-1` 보유**                         |
| `SelectLabel`     | `children`  | `ReactNode` | 그룹 제목 (선택 불가)                                                     |
| `SelectSeparator` | —           | —           | 구분선 (`pointer-events-none`)                                            |

### 자동으로 붙는 속성

CSS 선택자로 그대로 쓸 수 있습니다.

| 대상                           | 속성                 | 값                                          |
| ------------------------------ | -------------------- | ------------------------------------------- |
| `[data-slot="select-trigger"]` | `role`               | `combobox`                                  |
| `[data-slot="select-trigger"]` | `data-state`         | `open` \| `closed`                          |
| `[data-slot="select-trigger"]` | `data-placeholder`   | **미선택일 때만** (빈 문자열)               |
| `[data-slot="select-trigger"]` | `data-size`          | `sm` \| `default` \| `lg`                   |
| `[data-slot="select-trigger"]` | `data-disabled`      | 비활성일 때만 (빈 문자열)                   |
| `[data-slot="select-content"]` | `role`               | `listbox`                                   |
| `[data-slot="select-content"]` | `data-state`         | `open` \| `closed`                          |
| `[data-slot="select-content"]` | `data-align-trigger` | `true`(item-aligned) \| `false`(popper)     |
| `[data-slot="select-content"]` | `data-side`          | `top` \| `bottom` … (**popper 모드에서만**) |
| `[data-slot="select-item"]`    | `role`               | `option`                                    |
| `[data-slot="select-item"]`    | `data-state`         | `checked` \| `unchecked`                    |
| `[data-slot="select-item"]`    | `data-highlighted`   | 마우스/키보드가 올라갔을 때만 (빈 문자열)   |
| `[data-slot="select-item"]`    | `data-disabled`      | 비활성일 때만 (빈 문자열)                   |

:::caution 알려진 이슈 — 드롭다운 열림/닫힘 애니메이션이 동작하지 않습니다
`select.tsx`의 `SelectContent`에는 `data-open:animate-in data-open:fade-in-0 … data-closed:animate-out …` 클래스가 걸려 있습니다. Tailwind v4는 이걸 **`[data-open]` / `[data-closed]`** 선택자로 컴파일하는데, 설치된 radix(`radix-ui@1.4.3` → `@radix-ui/react-select@2.2.6`)는 **`data-state="open" | "closed"`** 만 붙입니다. 이름이 어긋나 **등장·퇴장 애니메이션이 적용되지 않습니다.**

- `data-[side=*]:slide-in-from-*` 도 `animate-in`이 함께 걸려야 효과가 있으므로 같이 무효화됩니다.
- 컴포넌트를 고친다면 `data-open:` → `data-[state=open]:`, `data-closed:` → `data-[state=closed]:` 로 바꾸면 됩니다.
- CSS Module에서 직접 애니메이션을 넣을 때도 **`[data-state='open']`** 을 기준으로 잡으세요.
- [`radio-group`·`checkbox`의 `data-checked` 이슈](./radio-group-component#기본-사용법)와 같은 원인(속성 이름 불일치)입니다.

:::

---

## 접근성 / 키보드

---

Radix 기반이라 **키보드 조작과 ARIA 속성이 기본 내장**되어 있습니다. 별도 설정 없이 아래가 동작합니다.

| 키                    | 동작                                           |
| --------------------- | ---------------------------------------------- |
| `Space` / `Enter`     | 목록 열기 / 포커스된 항목 선택 후 닫기         |
| `↓` / `↑`             | 목록이 닫혀 있으면 열기, 열려 있으면 항목 이동 |
| `Home` / `End`        | 첫 항목 / 마지막 항목으로 이동                 |
| `Esc`                 | 목록 닫기 (값은 그대로)                        |
| `Tab`                 | 목록을 닫고 다음 요소로 이동                   |
| 문자 입력(타입어헤드) | 입력한 글자로 시작하는 항목으로 점프           |

- 트리거는 `<button role="combobox">`로 렌더되고 `aria-expanded`·`aria-controls`가 자동 연결됩니다.
- 목록이 열리면 **포커스가 목록으로 이동**하고, 닫히면 트리거로 되돌아옵니다.
- 비활성(`disabled`) 항목과 `SelectLabel`은 이동에서 자동으로 건너뜁니다.
- 타입어헤드는 항목의 텍스트를 기준으로 동작합니다. **항목 내용이 문자열이 아니면**(아이콘·2줄 마크업 등) `textValue`를 지정하세요.

  ```tsx
  <SelectItem value="a1" textValue="자유입출금통장 110-234-567890">
    <span className={styles.itemBody}>…2줄 마크업…</span>
  </SelectItem>
  ```

직접 챙겨야 하는 것:

- **필드 이름** — `Label` + `htmlFor` ↔ 트리거 `id`로 연결하세요. 폼이 아니라 툴바처럼 라벨이 없는 자리라면 트리거에 `aria-label`을 주세요.

  ```tsx
  <SelectTrigger aria-label="정렬 기준">
  ```

- **오류 안내** — `aria-invalid`와 함께 오류 문구를 텍스트로 제공하세요.

---

## 스타일링 & 테마

---

Select는 실제 프로젝트에서 **디자인이 가장 많이 바뀌는 컴포넌트**입니다. 바꾸려는 대상에 따라 방법이 다릅니다.

| 바꾸려는 것                      | 방법                                         |
| -------------------------------- | -------------------------------------------- |
| 트리거 높이                      | **`size` prop** (`"sm"` / `"default"`)       |
| 트리거 너비 · 이 인스턴스만 조정 | 트리거 **`className`**                       |
| 드롭다운 위치                    | **`position` / `align` / `sideOffset` prop** |
| 색상 전반(테마)                  | **디자인 토큰** (`--popover`, `--accent` 등) |
| 겉모습 전면 교체                 | **`data-slot` 선택자 + CSS Module**          |

:::tip 원본 컴포넌트를 복사·수정하지 마세요
`src/shared/lib/shadcn/ui/select.tsx`를 고치면 이 컴포넌트를 쓰는 **모든 화면이 함께 바뀌고**, shadcn 업데이트 시 충돌합니다. 화면별 디자인은 아래 `data-slot` 오버라이드로 처리하세요. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 1. `data-slot` 목록

| data-slot                   | 대상             | 기본 스타일                                   | 주로 바꾸는 것                    |
| --------------------------- | ---------------- | --------------------------------------------- | --------------------------------- |
| `select-trigger`            | 닫힘 상태 버튼   | `w-fit h-8 rounded-lg border border-input`    | 높이·너비·테두리·라운드·열림 강조 |
| `select-value`              | 트리거 안 값     | `line-clamp-1 flex items-center gap-1.5`      | 2줄 표시, 폰트, placeholder 색    |
| `select-content`            | 드롭다운 패널    | `rounded-lg bg-popover shadow-md ring-1`      | 패널 배경·그림자·라운드·패딩      |
| `select-group`              | 항목 묶음        | `p-1 scroll-my-1`                             | 목록 안쪽 여백                    |
| `select-label`              | 그룹 제목        | `px-1.5 py-1 text-xs text-muted-foreground`   | 대문자·굵기·색                    |
| `select-item`               | 항목 하나        | `rounded-md py-1 pl-1.5 pr-8 focus:bg-accent` | 높이·hover색·선택색·2줄 카드화    |
| `select-separator`          | 구분선           | `-mx-1 my-1 h-px bg-border`                   | 색·여백                           |
| `select-scroll-up-button`   | 위 스크롤 버튼   | `flex justify-center py-1 bg-popover`         | 배경·아이콘 색                    |
| `select-scroll-down-button` | 아래 스크롤 버튼 | `flex justify-center py-1 bg-popover`         | 배경·아이콘 색                    |

### 2. `SelectContent` 는 Portal 입니다

**가장 많이 하는 실수입니다.** `SelectContent`는 `<body>` 직속에 렌더되므로, 래퍼 하위 선택자로는 **절대 잡히지 않습니다.**

```css
/* ❌ 절대 안 잡힘 — .wrap 안에 content 가 없다 */
.wrap :global([data-slot="select-content"]) {
  border-radius: 14px;
}
```

```tsx
/* ✅ className 을 "직접" 넘긴다 */
<SelectContent className={styles.content} position="popper" sideOffset={6}>
```

```css
/* ✅ 그리고 그 클래스를 전역 위치에서 정의한다 */
.content.content {
  border-radius: 14px;
  padding: 6px;
  background: var(--wa-card);
  box-shadow: 0 12px 32px rgba(15, 30, 61, 0.16);
  --tw-ring-shadow: 0 0 #0000; /* shadcn 의 ring-1 제거 */
}
```

같은 이유로 **다크 모드 토큰도 따로 선언**해야 합니다. 래퍼에만 변수를 선언하면 Portal로 빠진 패널에는 상속되지 않습니다.

```css
/* highlight-start */
:global(.dark) .wrap,
:global(.dark) .content {
  --wa-brand: #60a5fa;
  --wa-card: #0f1626;
  /* … */
}
/* highlight-end */
```

트리거(`select-trigger`)는 래퍼 **안**에 있으므로 하위 선택자도 동작하지만, 일관성을 위해 **전부 직접 클래스 전달**로 통일하는 편을 권장합니다.

### 3. 명시도 확보 — 클래스를 두 번 겹치기

기본 스타일은 Tailwind 유틸리티(명시도 `0,1,0`)입니다. CSS Module 클래스도 **같은 명시도**라 선언 순서에 따라 밀릴 수 있습니다.

```css
/* 클래스를 두 번 겹쳐 명시도(0,2,0)를 올린다 → !important 없이 안전하게 이김 */
.trigger.trigger {
  height: auto;
  min-height: 62px;
  border-radius: 14px;
}
```

`.wrap :global([data-slot='select-trigger'])`처럼 **래퍼 + 슬롯 2단계**로 감싸는 방법도 동일한 효과입니다. 다만 Portal로 빠지는 `select-content` 계열에는 쓸 수 없으니, Select에서는 **`.trigger.trigger` 방식이 더 일관적**입니다.

### 4. 상태별 스타일 — `data-*` 선택자

```css
/* 트리거 — 열림 / 미선택 / 오류 / 비활성 */
.trigger.trigger[data-state="open"] {
  border-color: var(--wa-brand);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.trigger.trigger[data-placeholder] {
  color: var(--wa-muted); /* 아직 고르지 않은 상태 */
}
.trigger.trigger[aria-invalid="true"] {
  border-color: var(--destructive);
}
.trigger.trigger[data-disabled] {
  opacity: 1;
  background: var(--wa-body-bg);
}

/* 항목 — hover/키보드 / 선택됨 / 비활성 */
.item.item[data-highlighted] {
  background: var(--wa-brand-soft);
}
.item.item[data-state="checked"] {
  background: var(--wa-brand-soft);
  font-weight: 700;
}
.item.item[data-disabled] {
  color: var(--wa-disabled-text);
  cursor: not-allowed;
}

/* 체크 아이콘 색 (항목 안 svg) */
.item.item svg {
  color: var(--wa-brand);
}
```

:::note "값이 선택됨"은 트리거에 표시되지 않습니다
트리거에는 **미선택일 때만 `data-placeholder`** 가 붙습니다. 즉 `:not([data-placeholder])`로 "선택됨"을 잡을 수 있지만, `placeholder`를 주지 않은 Select에는 애초에 이 속성이 없어 판별이 어렵습니다.

필터 pill처럼 **선택 여부로 트리거 모양을 바꿔야 한다면 `.tsx`에서 상태로 계산해 클래스를 붙이는 편이 확실합니다.** ([실전 예제 2번](#2-상품-목록-필터-바-pill형))

```tsx
const on = Boolean(values[f.key]);

<SelectTrigger className={[styles.trigger, on ? styles.triggerOn : ""].filter(Boolean).join(" ")}>
```

:::

### 5. 트리거 표시를 직접 그리기 — `SelectValue` children

`SelectItem`의 children은 **전부 ItemText 안에 들어갑니다.** 그래서 항목을 2줄 카드로 만들면 **트리거에도 그 2줄이 그대로 복제**됩니다.

트리거 표시를 따로 그리려면 `SelectValue`에 **children을 넘기세요.**

```tsx
<SelectValue
  placeholder={
    <span className={styles.valuePlaceholder}>출금 계좌를 선택하세요</span>
  }
>
  {/* highlight-start */}
  <span className={styles.valueBox}>
    <span className={styles.valueName}>{selected?.name}</span>
    <span className={styles.valueSub}>
      {selected?.no} · 잔액 {won(selected?.balance ?? 0)}
    </span>
  </span>
  {/* highlight-end */}
</SelectValue>
```

- `placeholder`도 **ReactNode**라 마크업을 넣을 수 있습니다.
- children을 넘기면 **선택 항목 텍스트 복제가 중단되고** 넘긴 내용이 그려집니다. 따라서 표시할 값은 `value`로 **직접 찾아서** 넣어야 합니다.
- 트리거의 값 영역은 기본이 `line-clamp-1`(1줄 자르기)입니다. 2줄을 쓰려면 해제하세요.

  ```css
  .trigger.trigger :global([data-slot="select-value"]) {
    display: flex;
    overflow: visible;
    -webkit-line-clamp: unset;
  }
  ```

### 6. 항목 안에 아이콘 넣기

`SelectItem`의 **마지막 자식 span(= ItemText)** 에 `flex items-center gap-2`가 걸려 있습니다. 아이콘과 텍스트를 나란히 넣으면 간격이 자동으로 잡힙니다.

```tsx
<SelectItem value="card" textValue="신용카드">
  <CreditCard />
  신용카드
</SelectItem>
```

- 항목 안의 `svg`는 기본 `size-4`(16px) + `pointer-events-none`입니다.
- 우측 `pr-8`은 **체크 아이콘 자리**입니다. 이 여백을 줄이면 긴 항목에서 텍스트가 체크마크와 겹칩니다.

:::note 상위 shadcn과 다른 점 — `SelectItem`에 `variant` prop이 없습니다
클래스에 `not-data-[variant=destructive]:…` 가 남아 있지만, scaffold의 `SelectItem`은 `variant` prop을 받지 않습니다. "삭제" 같은 위험 항목을 빨갛게 표시하려면 `className`으로 직접 색을 주세요.
:::

---

## 실전 예제

---

제공 Select를 **그대로** 쓰되 `*.module.css`만 달리해서 전혀 다른 두 화면을 만든 예제입니다. 두 예제의 `.tsx`는 같은 컴포넌트를 import 합니다 — **다른 건 CSS뿐입니다.**

### 1. 계좌 이체 — 출금 계좌 선택 (2줄 카드형)

기본 회색 셀렉트를 금융 이체 화면용 **2줄 계좌 카드**로 완전히 재스타일링했습니다.

<img
  src="../assets/ui/select-real-ex1.png"
  alt="select 실전예제 출금 계좌 선택"
  width="80%"
/>
<img
  src="../assets/ui/select-real-ex1-1.png"
  alt="select 실전예제 출금 계좌 선택"
  width="80%"
/>

**포인트** — 이 예제 하나에 실전 기법 3가지가 모두 들어 있습니다.

- **Portal 대응** — `SelectContent`에 `className={styles.content}`를 **직접** 전달. 다크 토큰도 `.content`에 따로 선언. ([2번](#2-selectcontent-는-portal-입니다))
- **명시도 확보** — `.trigger.trigger`로 클래스를 두 번 겹쳐 Tailwind 유틸리티를 이김. ([3번](#3-명시도-확보--클래스를-두-번-겹치기))
- **트리거 커스텀 표시** — 항목은 2줄 카드지만 트리거는 `SelectValue` children으로 따로 그림. ([5번](#5-트리거-표시를-직접-그리기--selectvalue-children))

<details>
<summary><b>WithdrawAccountSelect.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/select/WithdrawAccountSelect.tsx"
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@axiom/components/ui";
import styles from "./WithdrawAccountSelect.module.css";

/** 출금 가능 계좌 한 건 */
interface IAccount {
  value: string;
  group: "입출금 계좌" | "증권/기타";
  name: string;
  no: string;
  balance: number;
  main?: boolean;
  disabled?: boolean;
}

const ACCOUNTS: IAccount[] = [
  {
    value: "a1",
    group: "입출금 계좌",
    name: "자유입출금통장",
    no: "110-234-567890",
    balance: 3_482_100,
    main: true,
  },
  {
    value: "a2",
    group: "입출금 계좌",
    name: "급여통장",
    no: "110-998-112233",
    balance: 1_205_000,
  },
  // … 생활비통장 / 종합매매계좌
  {
    value: "b2",
    group: "증권/기타",
    name: "청약예금 (출금불가)",
    no: "110-000-778899",
    balance: 2_000_000,
    disabled: true,
  },
];

const TRANSFER_AMOUNT = 350_000;
const won = (n: number) => n.toLocaleString() + "원";

export default function WithdrawAccountSelect(): React.ReactNode {
  const [account, setAccount] = useState<string>("");
  const selected = ACCOUNTS.find((a) => a.value === account);
  const enough = (selected?.balance ?? 0) >= TRANSFER_AMOUNT;

  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        {/* … 헤더(계좌 이체 / 이체금액) 생략 … */}

        <div className={styles.field}>
          <span className={styles.fieldLabel}>출금 계좌</span>

          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger
              className={styles.trigger}
              aria-label="출금 계좌 선택"
            >
              {/* SelectValue 에 children 을 주면 트리거 표시를 직접 그린다.
                  (children 이 없으면 선택된 항목의 ItemText 가 그대로 복제된다) */}
              {/* highlight-start */}
              <SelectValue
                placeholder={
                  <span className={styles.valuePlaceholder}>
                    출금 계좌를 선택하세요
                  </span>
                }
              >
                <span className={styles.valueBox}>
                  <span className={styles.valueName}>{selected?.name}</span>
                  <span className={styles.valueSub}>
                    {selected?.no} · 잔액 {won(selected?.balance ?? 0)}
                  </span>
                </span>
              </SelectValue>
              {/* highlight-end */}
            </SelectTrigger>

            {/* position="popper" → 트리거 바로 아래에 붙는다
                className 은 Portal 이라 "직접" 넘겨야 한다 */}
            {/* highlight-next-line */}
            <SelectContent
              className={styles.content}
              position="popper"
              sideOffset={6}
            >
              {(["입출금 계좌", "증권/기타"] as const).map((group, gi) => (
                <SelectGroup key={group}>
                  {gi > 0 && <SelectSeparator className={styles.separator} />}
                  <SelectLabel className={styles.groupLabel}>
                    {group}
                  </SelectLabel>

                  {ACCOUNTS.filter((a) => a.group === group).map((a) => (
                    <SelectItem
                      key={a.value}
                      value={a.value}
                      disabled={a.disabled}
                      className={styles.item}
                    >
                      <span className={styles.itemBody}>
                        <span className={styles.itemTop}>
                          {a.name}
                          {a.main && (
                            <span className={styles.itemBadge}>주거래</span>
                          )}
                        </span>
                        <span className={styles.itemSub}>
                          {a.no} · 잔액 {won(a.balance)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* … 하단 요약 / 이체 버튼 생략 … */}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>WithdrawAccountSelect.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/select/WithdrawAccountSelect.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 블루 뱅킹 UI */
  --wa-brand: #2563eb;
  --wa-brand-soft: #eff6ff;
  --wa-ink: #0f1e3d;
  --wa-sub: #56698c;
  --wa-muted: #93a3bd;
  --wa-card: #ffffff;
  --wa-line: #d6deea;
  --wa-disabled-text: #a9b4c6;

  color: var(--wa-ink);
}

/* 다크 토큰 — .content 는 Portal 로 빠지므로 별도로도 선언해야 한다 */
/* highlight-start */
:global(.dark) .wrap,
:global(.dark) .content {
  --wa-brand: #60a5fa;
  --wa-ink: #e6edf9;
  --wa-card: #0f1626;
  --wa-line: #2c3c58;
  /* … 이하 동일 패턴 */
}
/* highlight-end */

/* 라이트 모드 .content 도 마찬가지로 자체 토큰을 갖는다 */
.content {
  --wa-brand: #2563eb;
  --wa-brand-soft: #eff6ff;
  --wa-card: #ffffff;
  /* … */
}

/* =========================================================================
 * 1) 트리거 — 기본 h-8 / w-fit / rounded-lg 를 2줄 카드형 필드로 교체
 *    (.trigger.trigger 로 명시도를 0,2,0 까지 올려 Tailwind 유틸리티를 이긴다)
 * ========================================================================= */
/* highlight-next-line */
.trigger.trigger {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 62px;
  padding: 12px 14px;
  border: 1.5px solid var(--wa-line);
  border-radius: 14px;
  background: var(--wa-card);
  text-align: left;
}
/* 열려 있는 동안(radix 가 data-state="open" 부여) */
/* highlight-next-line */
.trigger.trigger[data-state="open"] {
  border-color: var(--wa-brand);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.trigger.trigger svg {
  width: 18px;
  height: 18px;
  color: var(--wa-muted);
}

/* 트리거 기본 스타일은 SelectValue 에 line-clamp-1 을 걸어 1줄로 자른다.
   2줄 표시가 필요하므로 해제한다. */
/* highlight-start */
.trigger.trigger :global([data-slot="select-value"]) {
  display: flex;
  overflow: visible;
  -webkit-line-clamp: unset;
}
/* highlight-end */

/* =========================================================================
 * 2) 드롭다운 패널 — Portal 이므로 className 으로 직접 전달해야 한다
 * ========================================================================= */
.content.content {
  border-radius: 14px;
  padding: 6px;
  background: var(--wa-card);
  border: 1px solid var(--wa-line);
  box-shadow: 0 12px 32px rgba(15, 30, 61, 0.16);
  --tw-ring-shadow: 0 0 #0000; /* shadcn 의 ring-1 제거 */
}

.groupLabel.groupLabel {
  padding: 8px 10px 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--wa-muted);
  text-transform: uppercase;
}
.separator.separator {
  background: var(--wa-line);
  margin: 6px 4px;
}

/* 항목 한 줄 — 기본 py-1 pl-1.5 pr-8 을 2줄 카드로 */
.item.item {
  align-items: flex-start;
  padding: 10px 34px 10px 12px; /* 우측 34px = 체크 아이콘 자리 */
  border-radius: 10px;
  cursor: pointer;
}
/* highlight-start */
.item.item:focus,
.item.item[data-highlighted] {
  background: var(--wa-brand-soft);
  color: var(--wa-ink);
}
.item.item[data-state="checked"] {
  background: var(--wa-brand-soft);
}
.item.item[data-disabled] {
  opacity: 1;
  color: var(--wa-disabled-text);
  cursor: not-allowed;
}
/* highlight-end */
/* 체크 아이콘 색 */
.item.item svg {
  color: var(--wa-brand);
}

/* … .sheet / .head / .valueBox / .itemBody / .summary 등 순수 장식 스타일 생략 */
```

</details>

### 2. 상품 목록 필터 바 (pill형)

바로 위 계좌 예제와 **똑같은** Select인데, `*.module.css`만 달리해서 알약(pill) 형태의 필터 바가 되었습니다. 값이 선택된 필터는 채워진 pill로 바뀝니다.

<img
  src="../assets/ui/select-real-ex2.png"
  alt="select 실전예제 상품 목록 필터 바"
  width="80%"
/>

**포인트**

- 필터 하나 = **Select 하나**. 트리거 안에 `정렬 ·` 같은 **접두 라벨을 직접 넣었습니다**(`SelectValue` 앞에 `<span>`).
- `size="sm"` + `border-radius: 999px`로 알약 모양을 만들고, `position="popper" align="start"`로 트리거 아래에 붙였습니다.
- **"값이 선택됨"은 트리거에 표시되지 않으므로**(미선택일 때만 `data-placeholder`) `.tsx`에서 상태로 판단해 `.triggerOn` 클래스를 직접 붙입니다.

<details>
<summary><b>ProductFilterSelect.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/select/ProductFilterSelect.tsx"
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@axiom/components/ui";
import styles from "./ProductFilterSelect.module.css";

/** 필터 한 개(트리거 하나 = Select 하나) */
interface IFilter {
  key: string;
  /** 트리거 앞에 붙는 라벨(예: "정렬 ·") */
  prefix: string;
  placeholder: string;
  options: { value: string; label: string }[];
}

const FILTERS: IFilter[] = [
  {
    key: "sort",
    prefix: "정렬",
    placeholder: "기본순",
    options: [
      { value: "recent", label: "최신순" },
      { value: "low", label: "낮은 가격순" },
      // … 높은 가격순 / 리뷰 많은순
    ],
  },
  // … category / price 필터 동일 구조
];

const TOTAL = 1284;

export default function ProductFilterSelect(): React.ReactNode {
  const [values, setValues] = useState<Record<string, string>>({});
  const activeCount = Object.values(values).filter(Boolean).length;

  /** 필터가 걸릴수록 결과 수가 줄어드는 척하는 더미 계산 */
  const count = useMemo(
    () => Math.round(TOTAL / Math.pow(2.4, activeCount)),
    [activeCount],
  );

  return (
    <div className={styles.bar}>
      {/* … 상단 타이틀 / 결과 수 생략 … */}

      <div className={styles.filters}>
        {FILTERS.map((f) => {
          // 선택 여부는 트리거에 표시되지 않으므로 상태로 직접 판단한다
          // highlight-next-line
          const on = Boolean(values[f.key]);

          return (
            <Select
              key={f.key}
              value={values[f.key] ?? ""}
              onValueChange={(v) =>
                setValues((prev) => ({ ...prev, [f.key]: v }))
              }
            >
              <SelectTrigger
                size="sm"
                aria-label={f.prefix}
                // highlight-next-line
                className={[styles.trigger, on ? styles.triggerOn : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* 접두 라벨은 SelectValue 앞에 직접 넣는다 */}
                <span className={styles.prefix}>{f.prefix} ·</span>
                <SelectValue placeholder={f.placeholder} />
              </SelectTrigger>

              <SelectContent
                className={styles.content}
                position="popper"
                align="start"
                sideOffset={6}
              >
                {f.options.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    className={styles.item}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {activeCount > 0 && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => setValues({})}
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>ProductFilterSelect.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/select/ProductFilterSelect.module.css"
.bar {
  /* 이 예제 전용 색 토큰 — 앰버/슬레이트 커머스 UI */
  --pf-brand: #b45309;
  --pf-brand-soft: #fff7ed;
  --pf-ink: #1f2937;
  --pf-sub: #6b7280;
  --pf-card: #ffffff;
  --pf-line: #e5e7eb;
  --pf-bg: #fafafa;

  color: var(--pf-ink);
  border: 1px solid var(--pf-line);
  border-radius: 16px;
  background: var(--pf-bg);
  padding: 14px 16px;
}

/* Portal 로 빠지는 .content 에도 다크 토큰을 따로 걸어준다 */
:global(.dark) .bar,
:global(.dark) .content {
  --pf-brand: #fbbf24;
  --pf-brand-soft: #2a2113;
  --pf-card: #17181c;
  --pf-line: #2e3138;
  /* … 이하 동일 패턴 */
}
.content {
  --pf-brand: #b45309;
  --pf-brand-soft: #fff7ed;
  --pf-card: #ffffff;
  /* … */
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* ── 트리거: 알약(pill) ─────────────────────────────────── */
.trigger.trigger {
  height: 34px;
  padding: 0 10px 0 12px;
  border-radius: 999px;
  border: 1px solid var(--pf-line);
  background: var(--pf-card);
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-ink);
  gap: 6px;
}
.trigger.trigger:hover {
  border-color: var(--pf-brand);
}
.trigger.trigger[data-state="open"] {
  border-color: var(--pf-brand);
  box-shadow: 0 0 0 3px rgba(180, 83, 9, 0.12);
}
/* 값이 선택된 필터는 채워진 pill 로 (.tsx 에서 .triggerOn 을 붙여준다) */
/* highlight-start */
.triggerOn.triggerOn {
  border-color: var(--pf-brand);
  background: var(--pf-brand-soft);
  color: var(--pf-brand);
}
.triggerOn.triggerOn svg {
  color: var(--pf-brand);
}
/* highlight-end */

.prefix {
  color: var(--pf-sub);
  font-weight: 500;
  margin-right: 2px;
}
.triggerOn .prefix {
  color: var(--pf-brand);
}

/* ── 드롭다운 ───────────────────────────────────────────── */
.content.content {
  border-radius: 12px;
  padding: 5px;
  background: var(--pf-card);
  border: 1px solid var(--pf-line);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.12);
  --tw-ring-shadow: 0 0 #0000;
}
.item.item {
  border-radius: 8px;
  padding: 7px 30px 7px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.item.item:focus,
.item.item[data-highlighted] {
  background: var(--pf-brand-soft);
  color: var(--pf-brand);
}
.item.item svg {
  color: var(--pf-brand);
}

/* … .barTop / .barTitle / .reset 등 순수 장식 스타일 생략 */
```

</details>

:::tip 두 예제를 비교해 보세요
같은 Select로 [계좌 선택](#1-계좌-이체--출금-계좌-선택-2줄-카드형)(블루·2줄 카드·`SelectValue` children)과 [필터 바](#2-상품-목록-필터-바-pill형)(앰버·pill·접두 라벨)가 나옵니다. **컴포넌트는 손대지 않고** ①`size` / `position` 같은 prop ②`data-slot` 오버라이드(+ Portal 대응) ③트리거·항목 안에 넣는 **내 마크업** 세 가지만 바꾼 결과입니다.
:::

---
