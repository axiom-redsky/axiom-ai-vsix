---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Tooltip"
hide_table_of_contents: false
---

# Tooltip 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **말풍선 보조 설명(Tooltip)** 컴포넌트입니다.
요소에 **마우스를 올리거나 키보드로 포커스**하면 짧은 설명이 떠오르고, 벗어나면 사라집니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Tooltip`(`/example/ui-components/tooltip`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 아이콘 버튼처럼 **라벨이 없는 컨트롤의 이름**을 알려줄 때 (툴바의 `B`·`I`·`U` 버튼 등)
- 폼 항목 옆 물음표(`?`)에 붙는 **입력 규칙·용어 설명**
- 잘린 텍스트의 **전체 내용**, 단축키 안내, 배지·상태값의 부연 설명

> 툴팁은 **없어도 화면을 쓸 수 있어야 하는 "보조" 설명**입니다. 반드시 읽혀야 하는 정보는 툴팁에 넣지 마세요. 아래 [무엇을 쓸까](#tooltip-vs-dialog-vs-toast--무엇을-쓸까)를 참고하세요.

:::danger 터치 기기에서는 툴팁이 뜨지 않습니다
Radix는 `pointerType === 'touch'` 인 이벤트를 **무시**합니다(호버 개념이 없는 기기에서 툴팁이 오작동하는 것을 막기 위한 의도된 동작). 따라서 모바일·태블릿 사용자는 툴팁 내용을 **영원히 볼 수 없습니다.**

**필수 정보(약관, 오류 사유, 수수료 조건 등)는 절대 툴팁에만 두지 마세요.** 화면 본문·헬퍼 텍스트에 두고, 툴팁은 데스크톱 사용자를 위한 편의 장치로만 쓰세요.
:::

---

## Tooltip vs Dialog vs Toast — 무엇을 쓸까?

---

겉모습이 아니라 **"사용자가 그 안에서 무엇을 해야 하는가"** 로 고르세요.

| 비교 항목     | Tooltip                    | DropdownMenu              | Dialog                    | Toast              |
| ------------- | -------------------------- | ------------------------- | ------------------------- | ------------------ |
| 핵심 성격     | 호버 시 뜨는 **보조 설명** | 목록에서 **동작 실행**    | 흐름을 막고 **입력·확인** | 결과를 **알림**    |
| 여는 방법     | 호버 / 포커스              | 클릭                      | 클릭                      | 코드에서 자동      |
| 내부 상호작용 | ❌ 불가 (텍스트만)         | ✅ 항목 클릭              | ✅ 폼·버튼 자유           | 액션 버튼 1개 정도 |
| 닫기          | 벗어나면 자동 / `Esc`      | 항목 선택 / `Esc`         | 명시적 닫기               | 시간 경과          |
| 터치 기기     | ❌ **안 뜸**               | ✅                        | ✅                        | ✅                 |
| 대표 사례     | 아이콘 버튼 이름, 단축키   | 계정 메뉴, 행(row) 더보기 | 삭제 확인, 상세 입력      | "저장되었습니다"   |

- **읽기만 하면 끝** → `Tooltip`
- **말풍선 안의 링크·버튼을 눌러야 함** → `DropdownMenu` 또는 [Dialog](./dialog-component)

:::note scaffold에는 `Popover` 컴포넌트가 없습니다
다른 디자인 시스템에서 "클릭해서 여는 가벼운 패널"로 쓰는 `Popover`는 scaffold에 포함되어 있지 않습니다. 목록에서 동작을 고르는 형태라면 `DropdownMenu`(`@axiom/components/ui`), 입력·확인이 필요하면 [Dialog](./dialog-component)를 쓰세요.
:::

:::caution 툴팁 안에 링크·버튼을 넣지 마세요
말풍선은 마우스를 떼면 사라지므로 **누르러 가는 도중에 닫힙니다.** `disableHoverableContent={false}`(기본값) 덕분에 말풍선 위로 마우스를 옮길 수는 있지만, 키보드·터치 사용자는 그 안의 요소에 도달할 방법이 없습니다.

또한 Radix는 스크린리더용으로 **말풍선 내용을 한 번 더 숨김 렌더**하므로, 안에 버튼을 넣으면 **버튼이 두 번 읽힙니다.**
:::

:::tip HTML `title` 속성 대신 쓰는 이유
`<button title="새로고침">`도 비슷해 보이지만 ①지연·위치·디자인을 제어할 수 없고 ②모양이 브라우저마다 다르며 ③키보드 포커스로는 뜨지 않습니다. Tooltip 컴포넌트는 이 세 가지를 모두 해결합니다.
:::

---

## Import

---

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from "@axiom/components/ui";
```

Tooltip은 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::info `TooltipProvider`는 이미 앱 최상위에 있습니다 — 페이지에서 감싸지 마세요
Tooltip은 `TooltipProvider` 하위에서만 동작하지만, scaffold는 `src/core/providers/AppProviders.tsx`에서 **앱 전체를 한 번만** 감싸두었습니다.

```tsx title="src/core/providers/AppProviders.tsx (이미 적용되어 있음)"
<TooltipProvider delayDuration={200}>
  {children}
  {/* … */}
</TooltipProvider>
```

따라서 **업무 화면에서는 `Tooltip` · `TooltipTrigger` · `TooltipContent` 세 개만 import 하면 됩니다.** 지연 타이밍(`delayDuration`·`skipDelayDuration`)은 앱 전체가 공유해야 자연스럽기 때문에 Provider는 최상위 1개가 정석입니다.
:::

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/tooltip.tsx`이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---

## 기본 사용법

---

`Tooltip`으로 감싸고, 설명 대상은 `TooltipTrigger`, 말풍선 내용은 `TooltipContent`에 넣습니다.

<img
  src="../assets/ui/tooltip-basic.png"
  alt="Tooltip 기본 사용법"
  width="80%"
/>

```tsx
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
} from "@axiom/components/ui";

<Tooltip>
  {/* highlight-next-line */}
  <TooltipTrigger asChild>
    <Button variant="outline">Hover me</Button>
  </TooltipTrigger>
  <TooltipContent>계좌 잔액을 새로고침합니다</TooltipContent>
</Tooltip>;
```

:::caution `asChild`는 사실상 필수입니다
`TooltipTrigger`는 기본적으로 **자기 `<button>`을 렌더**합니다. 그 안에 `Button`을 넣으면 **button 안에 button**이 중첩되어 마크업이 깨집니다.

`asChild`를 주면 트리거가 자기 요소를 만들지 않고 **자식 요소에 이벤트·속성만 얹습니다.**

```tsx
{
  /* ✅ 자식(Button)이 곧 트리거 */
}
<TooltipTrigger asChild>
  <Button variant="outline">Hover me</Button>
</TooltipTrigger>;

{
  /* ❌ <button><button>…</button></button> */
}
<TooltipTrigger>
  <Button variant="outline">Hover me</Button>
</TooltipTrigger>;
```

단순 텍스트만 감쌀 때(`<TooltipTrigger>도움말</TooltipTrigger>`)는 `asChild` 없이 써도 됩니다.
:::

### `disabled` 요소는 트리거가 될 수 없습니다

비활성화된 `<button>`은 **포인터 이벤트 자체를 발생시키지 않으므로** 툴팁이 뜨지 않습니다. "왜 이 버튼을 못 누르는지"를 툴팁으로 설명하려는 순간 바로 부딪히는 함정입니다.

```tsx
{
  /* ❌ 절대 안 뜸 */
}
<TooltipTrigger asChild>
  <Button disabled>이체하기</Button>
</TooltipTrigger>;

{
  /* ✅ ① 클릭만 막고 이벤트는 살린다 (권장) */
}
<TooltipTrigger asChild>
  <Button
    aria-disabled
    className="opacity-50"
    onClick={(e) => e.preventDefault()}
  >
    이체하기
  </Button>
</TooltipTrigger>;

{
  /* ✅ ② disabled 를 유지해야 한다면 감싸는 요소를 트리거로 */
}
<TooltipTrigger asChild>
  <span tabIndex={0}>
    <Button disabled className="pointer-events-none">
      이체하기
    </Button>
  </span>
</TooltipTrigger>;
```

①이 접근성 면에서 낫습니다. `aria-disabled`는 "비활성"임을 스크린리더에 알리면서도 **포커스와 호버는 유지**하므로 사유 설명이 실제로 전달됩니다.

---

## 구성 (Anatomy)

---

```tsx
<TooltipProvider>
  {" "}
  {/* 지연 타이밍 공유 — 앱 최상위에 1개 (AppProviders에 이미 있음) */}
  <Tooltip>
    {" "}
    {/* 말풍선 1개의 루트 — 열림 상태를 관리 */}
    <TooltipTrigger /> {/* 설명 대상 요소 (asChild 권장) */}
    <TooltipContent /> {/* 말풍선 — Portal로 body에 렌더 + 화살표 자동 포함 */}
  </Tooltip>
</TooltipProvider>
```

| 파트              | 역할                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `TooltipProvider` | 하위 모든 툴팁의 **지연 타이밍을 공유**. 앱 최상위에 1개 — 업무 화면에서는 쓸 일이 없습니다. |
| `Tooltip`         | 말풍선 하나의 루트. `open` / `defaultOpen` / `onOpenChange`로 열림 상태를 다룹니다.          |
| `TooltipTrigger`  | 호버·포커스 대상. `asChild`로 자식 요소를 트리거로 삼습니다.                                 |
| `TooltipContent`  | 말풍선 본체. `side` · `align` · `sideOffset`으로 위치를 정합니다.                            |

:::note 화살표(Arrow)는 자동으로 들어갑니다
scaffold의 `TooltipContent`는 내부에서 **`TooltipPrimitive.Arrow`를 항상 함께 렌더**합니다. 별도의 `TooltipArrow`를 import 할 필요도, 넣을 수도 없습니다(화살표를 없애려면 CSS로 숨겨야 합니다 → [스타일링](#4-화살표arrow-다루기)).
:::

:::warning `TooltipContent`는 `document.body`로 Portal 됩니다
말풍선은 `TooltipTrigger` 옆이 아니라 **`<body>` 최하단에 렌더**됩니다(부모의 `overflow: hidden`에 잘리지 않게 하기 위함).

이 한 가지 사실 때문에 **CSS 작성 방법이 다른 컴포넌트와 완전히 달라집니다.** 반드시 [스타일링 & 테마](#스타일링--테마)의 첫 항목을 읽으세요.
:::

---

## 동작 옵션

---

### 1. 뜨는 방향 — `side`

`TooltipContent`의 `side`로 말풍선이 어느 쪽에 뜰지 정합니다.

<img
  src="../assets/ui/tooltip-side.png"
  alt="Tooltip side"
  width="80%"
/>

```tsx
<TooltipContent side="top">위쪽 (기본값)</TooltipContent>
<TooltipContent side="right">오른쪽</TooltipContent>
<TooltipContent side="bottom">아래쪽</TooltipContent>
<TooltipContent side="left">왼쪽</TooltipContent>
```

| side                 | 언제                                                   |
| -------------------- | ------------------------------------------------------ |
| `"top"` _(기본값)_   | 대부분의 경우. 마우스 커서가 말풍선을 가리지 않습니다. |
| `"bottom"`           | 화면 **상단**에 붙은 헤더·툴바 버튼                    |
| `"right"` / `"left"` | 세로 목록의 항목, 사이드바 아이콘 메뉴                 |

### 2. 정렬 — `align` / `alignOffset`

`side`와 **수직인 축**에서의 정렬입니다. 트리거보다 말풍선이 길 때 한쪽으로 붙일 때 씁니다.

```tsx
<TooltipContent side="bottom" align="start">시작점 정렬</TooltipContent>
<TooltipContent side="bottom" align="center">가운데 정렬 (기본값)</TooltipContent>
<TooltipContent side="bottom" align="end">끝점 정렬</TooltipContent>

{/* 정렬 후 추가로 밀기(px) */}
<TooltipContent align="start" alignOffset={-8}>왼쪽으로 8px 더</TooltipContent>
```

### 3. 트리거와의 간격 — `sideOffset`

트리거와 말풍선 사이 거리(px)입니다. **scaffold 기본값은 `0`** 입니다.

```tsx
<TooltipContent>딱 붙음 (기본값 0)</TooltipContent>
<TooltipContent sideOffset={6}>6px 띄움</TooltipContent>
```

:::tip 화살표를 쓴다면 `4`~`8`을 주세요
화살표가 항상 렌더되므로 `sideOffset={0}`이면 화살표 끝이 트리거에 닿아 답답해 보입니다. 실전 예제(`FormHelpTooltip` = `6`, `ToolbarTooltip` = `8`)도 모두 값을 주고 있습니다.
:::

### 4. 뜨기까지의 지연 — `delayDuration` / `skipDelayDuration`

```tsx
{
  /* 이 툴팁만 즉시 표시 */
}
<Tooltip delayDuration={0}> … </Tooltip>;

{
  /* 이 툴팁만 0.7초 뒤 표시 */
}
<Tooltip delayDuration={700}> … </Tooltip>;
```

| 옵션                | 위치                             | scaffold 값              | 의미                                                                     |
| ------------------- | -------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `delayDuration`     | `TooltipProvider` 또는 `Tooltip` | **`200`** (AppProviders) | 마우스를 올린 뒤 말풍선이 뜨기까지의 시간(ms)                            |
| `skipDelayDuration` | `TooltipProvider`                | `300` (Radix 기본)       | 툴팁이 닫힌 뒤 이 시간 안에 다른 트리거로 옮기면 **지연 없이 즉시** 표시 |

- `Tooltip`에 준 `delayDuration`이 **Provider 값보다 우선**합니다.
- 툴바처럼 아이콘이 촘촘히 붙은 영역은 `skipDelayDuration` 덕분에 두 번째 버튼부터 즉시 뜹니다.

:::note 컴포넌트 기본값과 프로젝트 값이 다릅니다
`tooltip.tsx`의 `TooltipProvider`는 `delayDuration = 0`을 기본값으로 갖지만, scaffold는 `AppProviders`에서 **`200`으로 지정**해 사용합니다. 문서·코드 리뷰 시 `0`이 아니라 `200`이 실제 값입니다.
:::

### 5. 외부에서 제어 — `open` / `onOpenChange`

특정 동작 직후 안내를 강제로 띄우는 등, 열림 상태를 바깥 state로 다뤄야 할 때 씁니다.

{/* 캡처 추가 시 주석 해제: <img src="../assets/ui/tooltip-controlled.png" alt="Tooltip 제어형" width="80%" /> */}

```tsx
import { useState } from "react";

function Example() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip
        // highlight-start
        open={open}
        onOpenChange={setOpen}
        // highlight-end
      >
        <TooltipTrigger asChild>
          <Button variant="outline">제어되는 트리거</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          외부 state로 열려 있습니다
        </TooltipContent>
      </Tooltip>

      <Button onClick={() => setOpen((v) => !v)}>
        {open ? "닫기" : "열기"}
      </Button>
    </>
  );
}
```

- `open`을 넘기면 **제어 모드**가 되므로, `onOpenChange`로 상태를 갱신하지 않으면 호버해도 열리지 않습니다.
- 초기 1회만 열어두고 나머지는 맡기려면 `defaultOpen`(비제어)을 쓰세요.

:::caution 제어 모드에서도 지연은 살아 있습니다
`open={true}`로 바꿔도 `delayDuration`만큼 기다린 뒤 뜹니다. 버튼 클릭 즉시 보여야 한다면 해당 `Tooltip`에 `delayDuration={0}`을 함께 주세요.
:::

### 6. 말풍선 위로 마우스 올리기 — `disableHoverableContent`

기본값 `false` — 트리거에서 말풍선으로 마우스를 옮겨도 **닫히지 않습니다**(긴 안내문을 읽는 동안 유지). 반대로 마우스가 지나가기만 해도 즉시 닫히길 원하면 `true`를 줍니다.

```tsx
{
  /* Provider 전역 또는 개별 Tooltip 에 지정 */
}
<Tooltip disableHoverableContent>…</Tooltip>;
```

### 7. 화면 경계 회피 — `avoidCollisions` / `collisionPadding`

기본적으로 화면(뷰포트) 밖으로 나가면 **자동으로 반대쪽에 뜹니다**(`avoidCollisions` 기본 `true`). 이때 실제 방향은 `data-side` 속성으로 노출되므로, `side="top"`을 줬어도 `data-side="bottom"`이 될 수 있습니다.

```tsx
{
  /* 화면 가장자리에서 12px 여유를 두고 뒤집기 판단 */
}
<TooltipContent collisionPadding={12}>…</TooltipContent>;

{
  /* 자동 뒤집기 끄기 — 지정한 방향 고정 */
}
<TooltipContent side="top" avoidCollisions={false}>
  …
</TooltipContent>;
```

:::tip 방향별 스타일은 `data-side`로
"위에 뜰 때만 그림자 방향을 바꾸기" 같은 요구는 `side` prop이 아니라 **실제 렌더 방향인 `[data-side='top']`** 을 기준으로 잡아야 뒤집혔을 때도 맞습니다.
:::

---

## API 레퍼런스

---

`Tooltip`은 **Radix Tooltip**(`radix-ui` 통합 패키지) 기반이라, 아래 표에 없는 Radix 표준 prop도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

### `TooltipProvider`

> 앱 최상위(`AppProviders.tsx`)에 이미 적용되어 있습니다. 업무 화면에서 직접 쓸 일은 없습니다.

| Prop                      | 타입      | 기본값                        | 설명                                                             |
| ------------------------- | --------- | ----------------------------- | ---------------------------------------------------------------- |
| `delayDuration`           | `number`  | `0` _(scaffold는 `200` 지정)_ | 하위 모든 툴팁이 뜨기까지의 기본 지연(ms)                        |
| `skipDelayDuration`       | `number`  | `300`                         | 이 시간 안에 다른 트리거로 옮기면 지연 없이 즉시 표시            |
| `disableHoverableContent` | `boolean` | `false`                       | 말풍선 위로 마우스를 올려도 유지할지 여부(하위 전체에 일괄 적용) |

### `Tooltip` (루트)

| Prop                      | 타입                      | 기본값      | 설명                                        |
| ------------------------- | ------------------------- | ----------- | ------------------------------------------- |
| `open`                    | `boolean`                 | —           | 열림 여부(제어). `onOpenChange`와 함께 사용 |
| `defaultOpen`             | `boolean`                 | `false`     | 초기 열림 여부(비제어)                      |
| `onOpenChange`            | `(open: boolean) => void` | —           | 열림 상태 변경 콜백                         |
| `delayDuration`           | `number`                  | Provider 값 | 이 툴팁만 지연을 덮어씀                     |
| `disableHoverableContent` | `boolean`                 | Provider 값 | 이 툴팁만 호버 유지 여부를 덮어씀           |

### `TooltipTrigger`

| Prop      | 타입      | 기본값  | 설명                                                          |
| --------- | --------- | ------- | ------------------------------------------------------------- |
| `asChild` | `boolean` | `false` | 자식 요소를 트리거로 사용(button 중첩 방지) — **사실상 필수** |

> `asChild` 없이 쓰면 `<button type="button" data-slot="tooltip-trigger">`로 렌더됩니다. `onClick` 등 `<button>` 표준 속성도 그대로 전달됩니다.

### `TooltipContent`

| Prop               | 타입                                      | 기본값      | 설명                                                   |
| ------------------ | ----------------------------------------- | ----------- | ------------------------------------------------------ |
| `side`             | `"top" \| "right" \| "bottom" \| "left"`  | `"top"`     | 뜨는 방향                                              |
| `align`            | `"start" \| "center" \| "end"`            | `"center"`  | 교차축 정렬                                            |
| `sideOffset`       | `number`                                  | `0`         | 트리거와의 간격(px) — **scaffold에서 지정한 기본값**   |
| `alignOffset`      | `number`                                  | `0`         | 정렬 축으로 추가 이동(px)                              |
| `avoidCollisions`  | `boolean`                                 | `true`      | 화면 밖으로 나가면 반대쪽으로 자동 뒤집기              |
| `collisionPadding` | `number \| Partial<Record<Side, number>>` | `0`         | 뒤집기를 판단할 화면 가장자리 여유(px)                 |
| `arrowPadding`     | `number`                                  | `0`         | 화살표가 모서리에 붙지 않도록 하는 여유(px)            |
| `sticky`           | `"partial" \| "always"`                   | `"partial"` | 스크롤 시 트리거를 따라붙는 방식                       |
| `hideWhenDetached` | `boolean`                                 | `false`     | 트리거가 화면에서 사라지면 말풍선도 숨김               |
| `aria-label`       | `string`                                  | —           | 스크린리더가 읽을 텍스트(시각 콘텐츠 대신) — 아래 참고 |
| `className`        | `string`                                  | —           | 기본 스타일 **뒤에 병합**(`cn`) — 커스터마이징 진입점  |

:::note `className`은 기본 스타일을 덮어씁니다
내부에서 `cn(<기본 Tailwind 클래스>, className)`으로 병합하므로, 넘긴 `className`이 뒤에 와서 우선 적용됩니다. **컴포넌트 코드를 고칠 필요가 없습니다.**
:::

---

## 접근성 / 키보드

---

Radix 기반이라 ARIA 연결과 키보드 동작이 기본 내장되어 있습니다.

| 조작                | 동작                                   |
| ------------------- | -------------------------------------- |
| 마우스 호버         | `delayDuration` 후 열림, 벗어나면 닫힘 |
| `Tab` (포커스 진입) | **즉시 열림**(지연 없음)               |
| `Tab` (포커스 이탈) | 닫힘                                   |
| `Esc`               | 열려 있는 말풍선 닫기                  |
| 트리거 클릭         | 닫힘 (클릭했다는 건 이미 읽었다는 뜻)  |

**자동으로 처리되는 것**

- 열려 있는 동안 트리거에 **`aria-describedby`** 가 붙어 말풍선 내용과 연결됩니다.
- Radix가 스크린리더용 숨김 노드(`role="tooltip"`)를 **하나 더 렌더**해 그 내용을 읽어줍니다.
- 열림/닫힘은 `data-state`로, 실제 렌더 방향은 `data-side`로 노출됩니다(스타일링 기준).

:::tip 아이콘·단축키 칩이 들어간 말풍선에는 `aria-label`
`TooltipContent`에 `aria-label`을 주면 **시각 콘텐츠 대신 그 텍스트가 읽힙니다.** `Ctrl` `B` 같은 `kbd` 칩이나 아이콘이 섞인 말풍선에서 읽기 품질이 크게 좋아집니다.

```tsx
<TooltipContent aria-label="굵게, 단축키 Ctrl+B">
  <span>굵게</span>
  <kbd>Ctrl</kbd>
  <kbd>B</kbd>
</TooltipContent>
```

:::

:::caution 아이콘 버튼에는 `aria-label`을 **트리거에도** 주세요
툴팁은 `aria-describedby`(부연 설명)로 연결될 뿐, **접근 가능한 이름(name)을 대신하지 않습니다.** 아이콘만 있는 버튼은 툴팁이 있어도 이름이 비어 있으므로 트리거 자체에 `aria-label`이 필요합니다.

```tsx
<TooltipTrigger asChild>
  {/* highlight-next-line */}
  <button type="button" aria-label="굵게">
    <Bold size={17} />
  </button>
</TooltipTrigger>
```

:::

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다.

| 바꾸려는 것           | 방법                                              |
| --------------------- | ------------------------------------------------- |
| 위치·간격             | `side` / `align` / `sideOffset` **prop**          |
| 색(말풍선 배경·글자)  | **디자인 토큰**(`--foreground`, `--background`)   |
| 이 인스턴스만 색·너비 | **`className`** (Tailwind 유틸리티)               |
| 겉모습 전체 교체      | **CSS Module 클래스를 `className`으로 직접 주입** |

### 0. ⚠ 가장 먼저 알아야 할 것 — Portal

`TooltipContent`는 `document.body`로 Portal 되어 **소비 컴포넌트의 DOM 바깥**에 렌더됩니다. 다른 컴포넌트(Accordion·Switch 등)에서 쓰던 **"래퍼 스코프" 방식이 통하지 않습니다.**

```css
/* ❌ 절대 안 닿는다 — 포털된 말풍선은 .wrap 의 자식이 아니다 */
.wrap :global([data-slot="tooltip-content"]) {
  background: #fff;
}

/* ✅ module.css 클래스를 TooltipContent 의 className 으로 직접 넘긴다.
      CSS Module 은 클래스명을 해시로 바꿀 뿐이라, 그 요소가 body 어디에 있든 적용된다.
      data-slot 을 함께 걸어 Tailwind 유틸리티(0,1,0)보다 명시도를 0,2,0 으로 올린다. */
.tip:global([data-slot="tooltip-content"]) {
  background: #fff;
}
```

```tsx
{
  /* 짝이 되는 tsx — 래퍼가 아니라 말풍선에 직접 준다 */
}
<TooltipContent className={styles.tip}>…</TooltipContent>;
```

:::danger CSS 변수도 포털 경계를 넘지 못합니다
`.card { --my-bg: #fff }` 처럼 **소비 래퍼에 정의한 커스텀 프로퍼티는 말풍선에서 `undefined`** 가 됩니다(말풍선은 `body` 아래로 나가 있어 `.card`의 자손이 아니므로 상속받지 못함).

`background: var(--my-bg)`가 통째로 무효화되어 **배경이 안 먹거나 화살표만 검게 남는** 대표적인 원인입니다.

```css
/* ❌ .card 에 정의 → 포털된 .tip 에서 undefined */
.card {
  --tip-bg: #ffffff;
}

/* ✅ 포털되는 요소인 .tip 자체에 정의 */
.tip:global([data-slot="tooltip-content"]) {
  --tip-bg: #ffffff;
  background: var(--tip-bg);
}
```

:::

:::tip 다크 모드는 정상 동작합니다
`.dark` 클래스는 최상위 `<html>`에 붙고, `body`로 포털된 말풍선도 **여전히 `html.dark`의 자손**이므로 `:global(.dark) .tip { … }`이 그대로 먹습니다.
:::

### 1. 기본 스타일 파악하기

`TooltipContent`에 이미 들어 있는 주요 클래스입니다. 무엇을 덮어써야 하는지 알려면 먼저 이걸 보세요.

| 항목       | 기본 클래스                               | 의미                                               |
| ---------- | ----------------------------------------- | -------------------------------------------------- |
| 배치       | `inline-flex items-center gap-1.5 w-fit`  | **한 줄** 배치 — 여러 줄을 쓰려면 반드시 덮어쓰기  |
| 색         | `bg-foreground text-background`           | 라이트=검정 배경, 다크=밝은 배경으로 **자동 반전** |
| 크기       | `max-w-xs px-3 py-1.5 text-xs`            | 최대 320px, 12px 글자                              |
| 모양       | `rounded-md`                              | 모서리 6px                                         |
| 레이어     | `z-50`                                    | 말풍선·화살표 모두                                 |
| 애니메이션 | `data-[state=delayed-open]:animate-in` 외 | 등장 fade+zoom, 퇴장 `data-closed:animate-out`     |

:::note 여러 줄을 넣으려면 `display`부터 덮으세요
기본이 `inline-flex`(가로 배치)라 제목/본문을 넣으면 옆으로 늘어섭니다. 실전 예제 `FormHelpTooltip`이 `display: block`으로 덮는 이유입니다.

```css
.tip:global([data-slot="tooltip-content"]) {
  display: block; /* 또는 flex-direction: column */
  max-width: 260px;
}
```

:::

### 2. 인스턴스 단위 조정 — `className` (Tailwind)

색·너비 정도만 바꾸면 되는 가벼운 경우입니다.

```tsx
{
  /* 파란 말풍선 — 화살표 svg 까지 함께 칠해야 색이 맞는다 */
}
<TooltipContent className="bg-sky-600 text-white [&_svg]:bg-sky-600! [&_svg]:fill-sky-600!">
  파란색 툴팁
</TooltipContent>;

{
  /* 좁게 묶어 여러 줄로 */
}
<TooltipContent className="max-w-35 text-center">
  좁은 폭에서 자동 줄바꿈되는 긴 안내 문구입니다.
</TooltipContent>;
```

- 화살표는 **직계(`[&>svg]`)가 아니라 자손(`[&_svg]`)** 으로 잡아야 합니다(아래 참고).
- 말풍선 본문에 아이콘 svg가 있으면 `[&_svg]`가 **그것까지 물들입니다.** 그런 경우엔 CSS Module로 정밀하게 타겟하세요.

:::tip 여기서 멈추세요
`className`이 길어지기 시작하면(카드형·글래스·`kbd` 칩 등) **`*.module.css`로 분리**할 때입니다. 아래 [실전 예제](#실전-예제--폼-항목-도움말-밝은-카드형)가 그 방법입니다.
:::

### 3. 선택자 지도 — `data-slot` / `data-side` / `data-state`

| 선택자                                   | 대상               | 비고                                                                  |
| ---------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| `[data-slot="tooltip-content"]`          | 말풍선 본체        | 명시도 확보용으로 **내 클래스와 함께** 걸어 씁니다                    |
| `svg` (자손, `span` 안)                  | 화살표(Arrow)      | **`data-slot` 없음.** 직계(`>`)가 아니라 자손( ) 선택자로             |
| `[data-slot="tooltip-trigger"]`          | 트리거             | `asChild`면 자식 요소로 대체되므로 직접 쓸 일은 적음                  |
| `[data-radix-popper-content-wrapper]`    | 위치지정 래퍼      | `position: fixed`·`transform`을 가진 바깥 껍데기. `z-index` 조정 지점 |
| `[data-side="top\|right\|bottom\|left"]` | **실제** 렌더 방향 | 충돌 회피로 뒤집히면 값이 바뀜 — 방향별 스타일의 기준                 |
| `[data-align="start\|center\|end"]`      | 실제 정렬          | 위와 동일                                                             |
| `[data-state="…"]`                       | 열림 상태          | `closed` / `delayed-open` / `instant-open` — **`open`은 없습니다**    |

:::caution `data-state="open"`이 아닙니다
툴팁의 열림 상태는 `delayed-open`(지연 후 열림) 또는 `instant-open`(연속 호버로 즉시 열림)입니다. `[data-state='open']`으로 잡으면 **아무것도 걸리지 않습니다.**

Tailwind 유틸리티에서는 shadcn이 제공하는 `data-open:` / `data-closed:` 변형이 두 표기를 모두 처리해 주므로 그대로 써도 됩니다. **CSS에서 직접 쓸 때만** 아래처럼 잡으세요.

```css
/* ✅ 열려 있을 때 */
.tip:global([data-state="delayed-open"]),
.tip:global([data-state="instant-open"]) { … }

/* 트리거 강조에도 활용 — 말풍선이 떠 있는 동안 ? 아이콘 색 바꾸기 */
.help[data-state="delayed-open"] { color: var(--brand); }
```

:::

### 4. 화살표(Arrow) 다루기

화살표는 **`background`(회전한 사각형)와 `fill`(svg 폴리곤)을 둘 다** 칠해야 색이 맞습니다. 하나만 바꾸면 검은 자국이 남습니다.

```css
/* radix 가 svg 를 위치지정용 <span> 으로 감싸므로 자손( ) 선택자로 잡는다 */
.tip:global([data-slot="tooltip-content"]) svg {
  background: var(--tip-bg) !important;
  fill: var(--tip-bg) !important;
}

/* 화살표를 아예 없애려면 */
.tip:global([data-slot="tooltip-content"]) > span:last-child {
  display: none;
}
```

### 5. Radix가 노출하는 CSS 변수

말풍선 안에서 바로 쓸 수 있는 값들입니다.

| 변수                                       | 값                                    | 활용                                  |
| ------------------------------------------ | ------------------------------------- | ------------------------------------- |
| `--radix-tooltip-content-transform-origin` | 트리거 쪽을 향한 변환 기준점          | zoom 애니메이션이 트리거에서 자라나게 |
| `--radix-tooltip-content-available-width`  | 화면 안에서 쓸 수 있는 최대 가로 크기 | `max-width`로 걸어 잘림 방지          |
| `--radix-tooltip-content-available-height` | 최대 세로 크기                        | 긴 내용의 `overflow-y: auto` 기준     |
| `--radix-tooltip-trigger-width`            | 트리거의 가로 크기                    | 말풍선을 트리거 폭에 맞출 때          |
| `--radix-tooltip-trigger-height`           | 트리거의 세로 크기                    | —                                     |

```css
/* 좁은 화면에서도 절대 잘리지 않는 말풍선 */
.tip:global([data-slot="tooltip-content"]) {
  max-width: min(280px, var(--radix-tooltip-content-available-width));
}
```

기본 클래스가 이미 `origin-(--radix-tooltip-content-transform-origin)`을 쓰고 있어, **zoom 등장 애니메이션이 트리거 쪽에서 피어오릅니다.**

### 6. 단축키 칩 — `data-slot="kbd"`

`TooltipContent`의 기본 클래스에는 `has-data-[slot=kbd]:pr-1.5`와 `**:data-[slot=kbd]:rounded-sm` 등 **`kbd` 칩용 규칙이 미리 들어 있습니다.** scaffold에는 별도의 `Kbd` 컴포넌트가 없지만, 직접 만든 `<kbd>`에 `data-slot="kbd"`를 붙이면 그 규칙을 그대로 받습니다.

```tsx
<TooltipContent aria-label="굵게, 단축키 Ctrl+B">
  굵게
  {/* highlight-next-line */}
  <kbd data-slot="kbd">Ctrl</kbd>
  <kbd data-slot="kbd">B</kbd>
</TooltipContent>
```

:::tip 명시도·배치 규칙
CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요. Tooltip은 **래퍼 스코프를 쓸 수 없으므로**, 명시도는 `.내클래스:global([data-slot='tooltip-content'])` 조합(0,2,0)으로 확보합니다.
:::

---

## 실전 예제 — 폼 항목 도움말 (밝은 카드형)

---

금융권 폼에서 가장 흔한 패턴입니다. 항목 옆 물음표(`?`)에 마우스를 올리면 상세 안내가 뜹니다.
제공 Tooltip을 **그대로 쓰되**, `*.module.css`로 기본 검정 말풍선을 **밝은 카드형**으로 완전히 재스타일링했습니다.

<img
  src="../assets/ui/tooltip-real-formhelp.png"
  alt="Tooltip 실전 예제 — 폼 항목 도움말"
  width="100%"
/>

**포인트**

- 컴포넌트를 새로 만들지 않았습니다. `Tooltip` / `TooltipTrigger` / `TooltipContent`를 그대로 쓰고 **모양만 CSS Module로** 덮었습니다.
- 말풍선은 Portal 되므로 `.card` 스코프로는 닿지 않습니다 → **`styles.tip`을 `TooltipContent`의 `className`으로 직접 전달**합니다.
- 말풍선이 쓰는 색 변수(`--tip-*`)는 **포털되는 `.tip` 자체에 정의**합니다(`.card`에 두면 `undefined`).
- 기본 `inline-flex`를 `display: block`으로 덮어 **제목 + 본문 2단** 구조를 만듭니다.
- 물음표 버튼은 `type="button"`으로 폼 제출을 막고, `[data-state='delayed-open']`으로 **말풍선이 떠 있는 동안 강조**합니다.

<details>
<summary><b>FormHelpTooltip.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/tooltip/FormHelpTooltip.tsx"
import { useId } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Label,
  Input,
} from "@axiom/components/ui";
import { CircleHelp } from "lucide-react";
import styles from "./FormHelpTooltip.module.css";

/** 입력 항목 한 줄에 붙는 도움말 정의 */
interface IFieldHelp {
  key: string;
  label: string;
  placeholder: string;
  /** 도움말 말풍선 제목 */
  tipTitle: string;
  /** 도움말 말풍선 본문(여러 줄 가능) */
  tipDesc: string;
}

const FIELDS: IFieldHelp[] = [
  {
    key: "limit",
    label: "1회 이체 한도",
    placeholder: "예: 10,000,000",
    tipTitle: "이체 한도란?",
    tipDesc:
      "보안등급에 따라 1회 최대 1,000만원까지 설정할 수 있습니다. 한도를 높이려면 추가 인증(OTP)이 필요합니다.",
  },
  // … CMS 출금일 / 받는 분 통장 표시 항목 생략
];

export default function FormHelpTooltip(): React.ReactNode {
  const uid = useId();

  return (
    // 이 컴포넌트만 복사해도 동작하도록 자체 Provider 를 둔다(중첩 Provider 허용).
    <TooltipProvider delayDuration={150}>
      <div className={styles.card}>
        <div className={styles.head}>
          <div className={styles.title}>자동이체 등록</div>
          <div className={styles.subtitle}>
            각 항목의 물음표에 마우스를 올리면 상세 안내가 표시됩니다.
          </div>
        </div>

        <div className={styles.list}>
          {FIELDS.map((f) => {
            const id = `${uid}-${f.key}`;
            return (
              <div key={f.key} className={styles.field}>
                <div className={styles.labelRow}>
                  <Label htmlFor={id} className={styles.label}>
                    {f.label}
                  </Label>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* type="button" 으로 폼 제출을 막는다 */}
                      <button
                        type="button"
                        className={styles.help}
                        aria-label={`${f.label} 도움말`}
                      >
                        <CircleHelp size={15} />
                      </button>
                    </TooltipTrigger>
                    {/* highlight-start */}
                    {/* Portal 되므로 module.css 클래스를 className 으로 직접 넘긴다 */}
                    <TooltipContent
                      className={styles.tip}
                      side="top"
                      align="start"
                      sideOffset={6}
                    >
                      {/* highlight-end */}
                      <div className={styles.tipTitle}>{f.tipTitle}</div>
                      <p className={styles.tipDesc}>{f.tipDesc}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <Input id={id} placeholder={f.placeholder} />
              </div>
            );
          })}
        </div>

        <div className={styles.footnote}>
          등록 후 최초 1회 출금까지 영업일 기준 2~3일이 소요됩니다.
        </div>
      </div>
    </TooltipProvider>
  );
}
```

</details>

<details>
<summary><b>FormHelpTooltip.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/tooltip/FormHelpTooltip.module.css"
/* ── 카드(소비 영역) ─────────────────────────────────────── */
.card {
  --fh-brand: #0284c7;
  --fh-ink: #0f172a;
  --fh-sub: #64748b;
  --fh-card: #ffffff;
  --fh-border: #e2e8f0;

  color: var(--fh-ink);
  background: var(--fh-card);
  border: 1px solid var(--fh-border);
  border-radius: 18px;
  padding: 24px;
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --fh-brand: #38bdf8;
  --fh-ink: #e2e8f0;
  --fh-card: #0f1729;
  --fh-border: #1e293b;
  /* … 이하 동일 패턴 */
}

/* 물음표 트리거 버튼 — 말풍선이 떠 있는 동안 강조 */
.help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  color: var(--fh-sub);
  cursor: help;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}
/* highlight-next-line */
.help:hover,
/* highlight-next-line */
.help[data-state="delayed-open"] {
  color: var(--fh-brand);
  background: color-mix(in srgb, var(--fh-brand) 12%, transparent);
}
.help:focus-visible {
  outline: 2px solid var(--fh-brand);
  outline-offset: 2px;
}

/* =========================================================================
 * 말풍선 오버라이드 — 여기가 핵심 (className 으로 TooltipContent 에 직접 주입)
 *
 * ⚠ 포털 주의 — CSS 변수도 포털 경계를 못 넘는다.
 *   TooltipContent 는 body 로 포털되어 .card 밖으로 나가므로, .card 에 정의한
 *   --fh-* 는 여기서 undefined 가 된다(→ background/fill 무효 = 화살표가 검게 남는 원인).
 *   그래서 말풍선이 쓰는 변수는 반드시 포털되는 요소인 .tip 자체에 정의한다.
 * ========================================================================= */
/* highlight-start */
.tip:global([data-slot="tooltip-content"]) {
  --tip-bg: #ffffff;
  --tip-border: #e2e8f0;
  --tip-ink: #0f172a;
  --tip-sub: #64748b;

  display: block; /* 기본 inline-flex 를 덮어 제목/본문을 세로로 */
  max-width: 260px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tip-bg);
  color: var(--tip-ink);
  border: 1px solid var(--tip-border);
  box-shadow: 0 12px 32px -12px rgba(15, 23, 42, 0.4);
}
/* highlight-end */

/* .dark 는 html 에 붙고 말풍선도 그 자손이므로 정상 동작 */
:global(.dark) .tip:global([data-slot="tooltip-content"]) {
  --tip-bg: #0f1729;
  --tip-border: #24324a;
  --tip-ink: #e2e8f0;
  --tip-sub: #94a3b8;
}

/* 화살표: radix 가 svg 를 <span> 으로 감싸므로 직계(>)가 아니라 자손( ) 으로 잡는다.
   카드 배경색과 맞춰 background(박스)·fill(폴리곤) 둘 다 칠한다. */
/* highlight-start */
.tip:global([data-slot="tooltip-content"]) svg {
  background: var(--tip-bg) !important;
  fill: var(--tip-bg) !important;
}
/* highlight-end */

.tipTitle {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}
.tipDesc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--tip-sub);
  margin: 0;
}
```

</details>

:::tip 이 예제에서 가져갈 것
동작(지연·위치·키보드·접근성)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`side`/`align`/`sideOffset` prop ②`className`으로 직접 주입한 CSS Module 클래스 ③말풍선 안에 넣는 **내 마크업** 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---

## 실전 예제 — 에디터 툴바 + 단축키 (다크 글래스형)

---

앞선 폼 도움말과 **똑같은 Tooltip**을 쓰지만, `*.module.css`만 바꿔 전혀 다른 **다크 톤 + 단축키 칩** 스타일로 만들었습니다.

<img
  src="../assets/ui/tooltip-real-toolbar.png"
  alt="Tooltip 실전 예제 — 에디터 툴바"
  width="100%"
/>

**포인트**

- 앞 예제와 **동일한** `@axiom/components/ui` Tooltip입니다. 달라진 건 `.module.css`뿐입니다.
- 툴바는 반응이 빨라야 하므로 `TooltipProvider delayDuration={120}`으로 지연을 짧게 줍니다.
- 아이콘만 있는 버튼이므로 **트리거에 `aria-label`** 을 반드시 지정합니다.
- 말풍선은 `side="bottom"` + `sideOffset={8}` — 툴바가 화면 위쪽에 있을 때의 정석입니다.
- 여기서도 `styles.tip`을 `TooltipContent`의 `className`으로 직접 넘기고, 색 변수는 `.tip`에 정의합니다.

<details>
<summary><b>ToolbarTooltip.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/tooltip/ToolbarTooltip.tsx"
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@axiom/components/ui";
import {
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  Image,
  Code2,
  type LucideIcon,
} from "lucide-react";
import styles from "./ToolbarTooltip.module.css";

/** 툴바 버튼 한 개 정의 */
interface ITool {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 단축키 조각들 — kbd 로 렌더된다 */
  keys: string[];
  /** 켜짐/꺼짐 토글되는 버튼인지 */
  toggle?: boolean;
}

const TOOLS: ITool[] = [
  { key: "bold", label: "굵게", icon: Bold, keys: ["Ctrl", "B"], toggle: true },
  {
    key: "italic",
    label: "기울임",
    icon: Italic,
    keys: ["Ctrl", "I"],
    toggle: true,
  },
  { key: "link", label: "링크 삽입", icon: Link2, keys: ["Ctrl", "K"] },
  // … 밑줄 / 목록 / 이미지 / 코드 블록 생략
];

export default function ToolbarTooltip(): React.ReactNode {
  const [active, setActive] = useState<Record<string, boolean>>({ bold: true });

  return (
    // 툴바는 반응이 빨라야 하므로 지연을 짧게 준다.
    // highlight-next-line
    <TooltipProvider delayDuration={120}>
      <div className={styles.wrap}>
        <div className={styles.toolbar}>
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const on = t.toggle && active[t.key];
            return (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    // highlight-next-line
                    aria-label={t.label}
                    aria-pressed={t.toggle ? Boolean(on) : undefined}
                    className={`${styles.toolBtn} ${on ? styles.toolBtnOn : ""}`}
                    onClick={() =>
                      t.toggle &&
                      setActive((p) => ({ ...p, [t.key]: !p[t.key] }))
                    }
                  >
                    <Icon size={17} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  className={styles.tip}
                  side="bottom"
                  sideOffset={8}
                >
                  <span className={styles.tipLabel}>{t.label}</span>
                  <span className={styles.kbdGroup}>
                    {t.keys.map((k) => (
                      <kbd key={k} className={styles.kbd}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className={styles.caption}>
          버튼에 마우스를 올리면 이름과 단축키가 표시됩니다. 굵게·기울임·밑줄은
          토글됩니다.
        </div>
      </div>
    </TooltipProvider>
  );
}
```

</details>

<details>
<summary><b>ToolbarTooltip.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/tooltip/ToolbarTooltip.module.css"
.wrap {
  --tb-panel: #f8fafc;
  --tb-panel-border: #e2e8f0;
  --tb-ink: #334155;
  --tb-brand: #6366f1;
}
:global(.dark) .wrap {
  --tb-panel: #0f1729;
  --tb-panel-border: #1e293b;
  --tb-ink: #cbd5e1;
  --tb-brand: #818cf8;
}

/* ── 툴바(소비 영역) ─────────────────────────────────────── */
.toolbar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--tb-panel);
  border: 1px solid var(--tb-panel-border);
  border-radius: 14px;
}
.toolBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--tb-ink);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.toolBtn:hover {
  background: color-mix(in srgb, var(--tb-brand) 12%, transparent);
  color: var(--tb-brand);
}
.toolBtnOn {
  background: var(--tb-brand);
  color: #fff;
}

/* =========================================================================
 * 말풍선 오버라이드 — className 으로 TooltipContent 에 직접 주입
 * ⚠ 색 변수는 포털되는 .tip 자체에 정의 (.wrap 에 두면 undefined)
 * ========================================================================= */
/* highlight-start */
.tip:global([data-slot="tooltip-content"]) {
  --tip-bg: #0b1120;

  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px 7px 11px;
  border-radius: 10px;
  background: var(--tip-bg);
  color: #f1f5f9;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 28px -10px rgba(0, 0, 0, 0.6);
  font-size: 12px;
}
/* highlight-end */

/* 화살표: 자손( ) 선택자로 background·fill 둘 다 */
.tip:global([data-slot="tooltip-content"]) svg {
  background: var(--tip-bg) !important;
  fill: var(--tip-bg) !important;
}

/* 단축키 칩 */
.kbdGroup {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.3);
  font-size: 10.5px;
  font-weight: 600;
  color: #e2e8f0;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
}
```

</details>

:::tip 두 예제를 비교해 보세요
같은 Tooltip으로 [밝은 카드형 폼 도움말](#실전-예제--폼-항목-도움말-밝은-카드형)과 다크 글래스형 툴바 안내가 나옵니다. **컴포넌트는 손대지 않고** ①prop ②`className`으로 주입한 CSS Module ③말풍선 안의 내 마크업만 바꾼 결과입니다.

Accordion·Switch와 달리 **`.wrap :global(...)` 래퍼 스코프를 쓸 수 없다는 점**만 기억하면 나머지는 동일한 패턴입니다.
:::

---
