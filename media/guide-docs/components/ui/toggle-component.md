---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Toggle"
hide_table_of_contents: false
---

# Toggle 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **눌림 상태를 가진 버튼(Toggle)** 컴포넌트입니다.
한 번 누르면 **켜진 채로 남아 있고**, 다시 누르면 꺼집니다. 텍스트 에디터의 `굵게`·`기울임` 버튼을 떠올리면 됩니다.

여러 개를 하나의 세그먼트 컨트롤로 묶는 **`ToggleGroup`** 도 함께 제공됩니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Toggle`(`/example/ui-components/toggle`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 텍스트 서식(굵게·기울임·밑줄)처럼 **눌린 상태가 유지되어야 하는** 버튼
- 알림 on/off, 즐겨찾기, 음소거처럼 **현재 상태를 버튼 모양으로 보여줘야** 할 때
- 목록의 필터 칩처럼 **켜짐/꺼짐을 즉시 반영**하는 토글
- 리스트/카드/칸반 같은 **보기 방식 전환**(→ `ToggleGroup`)

> 겉모습이 비슷한 컴포넌트가 많습니다. **"이 버튼이 켜진 채로 남아 있어야 하나?"** 로 구분하세요. 아래 [Toggle vs Button vs Switch](#toggle-vs-button-vs-switch--무엇을-쓸까)를 참고하세요.

---

## Toggle vs Button vs Switch — 무엇을 쓸까?

---

셋 다 클릭으로 조작하지만 **상태를 가지는지**, **어떤 모양으로 보여주는지**가 다릅니다.

| 비교 항목   | Toggle                          | Button                   | Switch                             |
| ----------- | ------------------------------- | ------------------------ | ---------------------------------- |
| 핵심 성격   | on/off 상태를 가진 **버튼**     | 누르면 실행되는 **명령** | on/off 상태를 가진 **설정 스위치** |
| 상태 유지   | ✅ `pressed`로 눌린 채 유지     | ❌ 상태 없음             | ✅ `checked`로 켜진 채 유지        |
| 주요 콜백   | `onPressedChange(pressed)`      | `onClick(event)`         | `onCheckedChange(checked)`         |
| 접근성 속성 | `aria-pressed` (+ `data-state`) | 없음                     | `role="switch"` + `aria-checked`   |
| 겉모습      | 버튼(아이콘·라벨)               | 버튼                     | 레버형 스위치                      |
| 폼 제출     | ❌ (직접 state 관리)            | —                        | ✅ `name`/`value` 지원             |
| 대표 사례   | 굵게·기울임, 필터 칩, 즐겨찾기  | 저장·삭제·제출·이동      | 알림 설정, 다크모드, 자동이체      |

- **툴바 안에서 아이콘 버튼처럼 보여야 한다** → `Toggle`
- **설정 화면에서 "켜짐/꺼짐" 항목처럼 보여야 한다** → [Switch](./switch-component)
- **누르면 끝나는 동작이다** → [Button](./button-component)

:::tip 한 줄 요약
같은 "음소거" 기능이라도 **버튼이 눌린 채로 남아야 하면 Toggle**, **누를 때마다 실행만 하면 Button** 입니다.
:::

---

## Import

---

```tsx
import { Toggle, ToggleGroup, ToggleGroupItem } from "@axiom/components/ui";
```

`Toggle`은 **단독으로 쓰는 단일 컴포넌트**이고, `ToggleGroup` + `ToggleGroupItem`은 여러 토글을 묶을 때 쓰는 **합성(compound) 컴포넌트**입니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/toggle.tsx` · `toggle-group.tsx`이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---

## 기본 사용법

---

`Toggle`은 `<button type="button">`으로 렌더되며, **눌린 상태를 스스로 관리**합니다. 값을 화면 로직과 엮을 필요가 없다면 아무 prop 없이 그대로 써도 동작합니다.

<img
  src="../assets/ui/toggle-basic.png"
  alt="Toggle 기본 사용법"
  width="80%"
/>

```tsx
import { Bold } from "lucide-react";

{
  /* 비제어 — 내부 상태로 동작 */
}
{
  /* 아이콘 + 텍스트 */
}
<Toggle aria-label="굵게">
  <Bold />
  굵게
</Toggle>;
```

:::caution 아이콘만 넣을 때는 `aria-label` 필수
아이콘만 있는 토글은 스크린리더가 읽을 이름이 없습니다. **아이콘 단독 사용 시 `aria-label`을 반드시** 지정하세요. 텍스트를 함께 넣었다면 그 텍스트가 이름이 되므로 생략해도 됩니다.

```tsx
import { Bold } from "lucide-react";

{
  /* 아이콘만 */
}
<Toggle aria-label="굵게">
  <Bold />
</Toggle>;
```

:::

아이콘 크기는 **자동으로 맞춰집니다.** 기본 클래스에 `[&_svg:not([class*='size-'])]:size-4`가 포함되어 있어 `size-*` 클래스를 직접 주지 않은 SVG는 `size-4`(sm 크기에서는 `size-3.5`)로 렌더됩니다.

---

## 구성 (Anatomy)

---

Toggle은 **단독 사용**과 **그룹 사용** 두 형태가 있습니다.

```tsx
{
  /* ① 단독 — 서로 독립적인 on/off 버튼 */
}
<Toggle />;

{
  /* ② 그룹 — 하나의 세그먼트 컨트롤로 묶기 */
}
<ToggleGroup>
  {" "}
  {/* 트랙(루트) — type으로 단일/다중을 정하고 값을 관리 */}
  <ToggleGroupItem /> {/* 항목 하나 — value로 식별 */}
  <ToggleGroupItem />
</ToggleGroup>;
```

| 파트              | 역할                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `Toggle`          | 눌림 상태를 가진 버튼 하나. `pressed`(boolean)로 상태를 다룹니다.                        |
| `ToggleGroup`     | 여러 토글의 트랙(루트). `type`으로 단일/다중을 정하고 `value`(문자열/배열)를 관리합니다. |
| `ToggleGroupItem` | 그룹 안의 항목 하나. `value`(고유 키)를 가집니다.                                        |

:::note 상태를 다루는 단위가 다릅니다
`Toggle`은 **항목마다 boolean**을, `ToggleGroup`은 **그룹 전체가 문자열(또는 문자열 배열)** 을 다룹니다. "여러 개 중 무엇이 선택됐나"를 하나의 값으로 관리해야 한다면 그룹이 훨씬 간결합니다.
:::

---

## 동작 옵션

---

### 1. 상태 — `pressed` / `defaultPressed` / `onPressedChange`

`Accordion`·`Textarea`와 동일하게 **비제어(uncontrolled)** 와 **제어(controlled)** 두 방식을 지원합니다.

```tsx
{
  /* 비제어 — 초기값만 지정, 이후는 컴포넌트가 관리 */
}
<Toggle defaultPressed aria-label="굵게">
  <Bold />
</Toggle>;
```

```tsx
import { useState } from "react";

function Example() {
  const [bold, setBold] = useState(false);

  return (
    <Toggle
      // highlight-start
      pressed={bold}
      onPressedChange={setBold}
      // highlight-end
      aria-label="굵게"
    >
      <Bold />
      굵게
    </Toggle>
  );
}
```

- `onPressedChange`의 인자는 **순수 `boolean`** 입니다(중간 상태가 없음). 그래서 `setBold`를 **그대로 넘겨도** 타입이 맞습니다.
- `pressed`를 넘기면 **제어 모드**가 되므로, 반드시 `onPressedChange`로 상태를 갱신해야 눌림이 동작합니다.

:::caution `pressed`만 넘기면 눌리지 않습니다
`pressed={bold}`만 주고 `onPressedChange`를 빼면 **클릭해도 아무 변화가 없는** 읽기 전용 버튼이 됩니다. `disabled`로 막을 게 아니라면 두 prop은 항상 함께 씁니다.
:::

### 2. 외곽선 — `variant`

```tsx
<Toggle aria-label="굵게"><Bold /></Toggle>
<Toggle variant="outline" aria-label="기울임"><Italic /></Toggle>
```

<img
  src="../assets/ui/toggle-variant.png"
  alt="Toggle variant (default / outline)"
  width="80%"
/>

| variant                | 모습                   | 언제                                               |
| ---------------------- | ---------------------- | -------------------------------------------------- |
| `"default"` _(기본값)_ | 배경 투명, 테두리 없음 | 툴바처럼 **여러 개가 붙어 있어** 자리가 명확할 때  |
| `"outline"`            | 테두리(`--input`) 있음 | 단독으로 놓여 **누를 수 있다는 게 드러나야** 할 때 |

- 두 variant 모두 **눌리면 배경이 `--muted`** 로 채워집니다(`data-[state=on]:bg-muted`).
- Button과 달리 `secondary`·`ghost`·`destructive` 같은 variant는 **없습니다.** 색을 바꾸려면 [스타일링](#스타일링--테마) 섹션을 참고하세요.

### 3. 크기 — `size`

```tsx
<Toggle size="sm" variant="outline" aria-label="즐겨찾기"><Star /></Toggle>
<Toggle size="default" variant="outline" aria-label="즐겨찾기"><Star /></Toggle>
<Toggle size="lg" variant="outline" aria-label="즐겨찾기"><Star /></Toggle>
```

<img
  src="../assets/ui/toggle-size.png"
  alt="Toggle size (sm / default / lg)"
  width="80%"
/>

| size                   | 높이         | 최소 너비 | 아이콘 크기       |
| ---------------------- | ------------ | --------- | ----------------- |
| `"sm"`                 | `h-7` (28px) | `min-w-7` | `size-3.5` (14px) |
| `"default"` _(기본값)_ | `h-8` (32px) | `min-w-8` | `size-4` (16px)   |
| `"lg"`                 | `h-9` (36px) | `min-w-9` | `size-4` (16px)   |

:::note 아이콘만 넣어도 정사각형이 유지됩니다
각 크기에 `min-w-*`가 높이와 같은 값으로 들어 있어, 아이콘 하나만 넣어도 **찌그러지지 않고 정사각형**으로 렌더됩니다. 별도 `w-*` 지정이 필요 없습니다.
:::

### 4. 비활성화 — `disabled`

```tsx
<Toggle disabled variant="outline" aria-label="알림 끄기">
  <BellOff />
  비활성
</Toggle>;

{
  /* 눌린 상태를 유지한 채 비활성화 */
}
<Toggle disabled defaultPressed variant="outline" aria-label="알림">
  <Bell />
  눌림 + 비활성
</Toggle>;
```

- `disabled:pointer-events-none disabled:opacity-50`이 적용되어 흐려지고 클릭·호버가 모두 막힙니다.
- DOM에는 `disabled` 속성과 함께 `data-disabled`가 노출되므로, CSS에서 `[data-disabled]`로 별도 스타일을 줄 수 있습니다.

### 5. 상태에 따라 콘텐츠 바꾸기

Toggle에서 가장 자주 쓰는 실전 패턴입니다. `pressed` 값에 따라 **아이콘과 라벨을 함께 바꿔** 현재 상태를 분명하게 보여줍니다.

```tsx
const [muted, setMuted] = useState(false);

<Toggle
  variant="outline"
  pressed={muted}
  onPressedChange={setMuted}
  aria-label="음소거"
>
  {/* highlight-start */}
  {muted ? <VolumeX /> : <Volume2 />}
  {muted ? "음소거됨" : "소리 켜짐"}
  {/* highlight-end */}
</Toggle>;
```

:::tip 배경색만으로는 부족합니다
기본 스타일의 "눌림"은 배경이 `--muted`로 살짝 바뀌는 정도라, **아이콘만 있는 토글은 켜짐/꺼짐 구분이 약합니다.** 상태가 중요한 화면이라면 위처럼 아이콘·라벨을 바꾸거나, `className`으로 켜짐 색을 강조하세요(→ [스타일링](#2-인스턴스-단위-조정--classname-tailwind)).
:::

### 6. 유효성 오류 — `aria-invalid`

`aria-invalid`를 주면 에러 스타일(빨간 테두리 + 링)이 자동 적용됩니다(`aria-invalid:border-destructive aria-invalid:ring-destructive/20`). 필수 동의 토글처럼 **검증 대상이 되는 토글**에 씁니다.

```tsx
<Toggle
  variant="outline"
  aria-invalid={!agreed || undefined}
  aria-label="약관 동의"
>
  약관에 동의합니다
</Toggle>
```

`aria-invalid={false}`를 넘기면 DOM에 `aria-invalid="false"`가 **남으므로**, 오류가 아닐 때는 `|| undefined`로 속성 자체를 제거하세요.

---

## ToggleGroup — 여러 개를 하나로 묶기

---

`Button`을 `ButtonGroup`으로 묶듯, 여러 `Toggle`을 `ToggleGroup`으로 묶어 **하나의 세그먼트 컨트롤**을 만듭니다. `type`으로 선택 방식을 정합니다.

### 1. 단일 선택 — `type="single"`

라디오처럼 **하나만** 선택됩니다. 값은 **문자열**입니다.

<img
  src="../assets/ui/toggle-group-single.png"
  alt="ToggleGroup 단일 선택"
  width="80%"
/>

```tsx
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@axiom/components/ui";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";

function Example() {
  const [align, setAlign] = useState("left");

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={align}
      // highlight-next-line
      onValueChange={(v) => v && setAlign(v)}
    >
      <ToggleGroupItem value="left" aria-label="왼쪽 정렬">
        <AlignLeft />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="가운데 정렬">
        <AlignCenter />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="오른쪽 정렬">
        <AlignRight />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
```

:::caution 선택된 항목을 다시 누르면 **선택이 해제**됩니다
`type="single"`이어도 이미 선택된 항목을 한 번 더 누르면 값이 **빈 문자열(`""`)** 이 됩니다. Accordion의 `collapsible` 같은 옵션은 **없습니다.**

"항상 하나는 선택되어 있어야 하는" 세그먼트 컨트롤(보기 방식, 정렬 등)이라면 위 예제처럼 **빈 값을 무시**하세요.

```tsx
{/* ✅ 빈 값이면 상태를 갱신하지 않음 → 항상 하나 선택 유지 */}
onValueChange={(v) => v && setAlign(v)}

{/* ❌ 그대로 넘기면 다시 눌렀을 때 아무것도 선택되지 않은 상태가 됨 */}
onValueChange={setAlign}
```

:::

### 2. 다중 선택 — `type="multiple"`

체크박스처럼 **여러 개를 동시에** 켤 수 있습니다. 값은 **문자열 배열**입니다.

<img
  src="../assets/ui/toggle-group-multiple.png"
  alt="ToggleGroup 다중 선택"
  width="80%"
/>

```tsx
const [formats, setFormats] = useState<string[]>(["bold"]);

<ToggleGroup
  type="multiple"
  variant="outline"
  value={formats}
  // highlight-next-line
  onValueChange={setFormats}
>
  <ToggleGroupItem value="bold" aria-label="굵게">
    <Bold />
  </ToggleGroupItem>
  <ToggleGroupItem value="italic" aria-label="기울임">
    <Italic />
  </ToggleGroupItem>
  <ToggleGroupItem value="underline" aria-label="밑줄">
    <Underline />
  </ToggleGroupItem>
</ToggleGroup>;
```

- 모두 해제하면 **빈 배열(`[]`)** 이 됩니다. 다중 선택에서는 이게 정상 상태이므로 `single`처럼 가드할 필요가 없습니다.
- `type`은 **필수**이며, 넘기지 않으면 타입 에러가 납니다.

### 3. `variant` / `size`는 그룹에 한 번만

`ToggleGroup`에 지정한 `variant`·`size`는 **Context로 모든 하위 항목에 일괄 적용**됩니다. 항목마다 반복해서 넘기지 마세요.

```tsx
{
  /* ✅ 그룹에 한 번 — 모든 항목에 적용 */
}
<ToggleGroup type="single" variant="outline" size="sm">
  <ToggleGroupItem value="a">A</ToggleGroupItem>
  <ToggleGroupItem value="b">B</ToggleGroupItem>
</ToggleGroup>;
```

:::note 그룹 값이 항목 값보다 우선합니다
구현이 `context.variant || variant`이므로, **그룹에 값이 지정되어 있으면 항목의 `variant`는 무시**됩니다. 항목별로 다르게 주고 싶다면 그룹에서는 지정하지 않고 각 항목에만 넘기세요(단, 세그먼트 컨트롤에서는 권장하지 않습니다).
:::

### 4. 붙은 모양은 그룹이 알아서 처리합니다

`ToggleGroupItem`에는 `rounded-none first:rounded-l-lg last:rounded-r-lg`와 `data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l`가 들어 있습니다.

- 항목들이 **하나의 덩어리**처럼 붙고, **양 끝만 둥글게** 처리됩니다.
- `outline`일 때 인접한 테두리가 **겹쳐 보이지 않도록** 왼쪽 테두리를 제거합니다.
- 각 항목은 `flex-1`이라 **그룹 폭 안에서 균등 분배**됩니다. 그룹 자체는 `w-fit`이므로 내용 폭에 맞고, 꽉 채우려면 그룹에 `className="w-full"`을 주세요.

:::tip ButtonGroup과 무엇이 다른가
[ButtonGroup](./button-group-component)은 **명령 버튼**을 시각적으로 붙이는 레이아웃 도구라 선택 상태가 없습니다. `ToggleGroup`은 값(`value`)을 관리하는 **입력 컨트롤**입니다. 탭처럼 화면 콘텐츠를 전환하는 용도라면 [Tabs](./tabs-component)가 더 적절할 수 있습니다.
:::

---

## API 레퍼런스

---

`Toggle`·`ToggleGroup`은 **Radix Toggle / ToggleGroup** 기반이라, 아래 표에 없는 Radix 표준 prop(`asChild` 등)과 `<button>` 표준 속성(`onClick`·`type`·`title` 등)도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

### `Toggle`

| Prop              | 타입                         | 기본값      | 설명                                            |
| ----------------- | ---------------------------- | ----------- | ----------------------------------------------- |
| `pressed`         | `boolean`                    | —           | 눌림 상태(제어). `onPressedChange`와 함께 사용  |
| `defaultPressed`  | `boolean`                    | `false`     | 초기 눌림 상태(비제어)                          |
| `onPressedChange` | `(pressed: boolean) => void` | —           | 눌림 상태 변경 콜백                             |
| `variant`         | `"default" \| "outline"`     | `"default"` | 외곽선 유무                                     |
| `size`            | `"sm" \| "default" \| "lg"`  | `"default"` | 크기                                            |
| `disabled`        | `boolean`                    | `false`     | 비활성화                                        |
| `aria-label`      | `string`                     | —           | 아이콘 단독 사용 시 **필수** 접근성 이름        |
| `aria-invalid`    | `boolean`                    | —           | 유효성 오류 스타일(테두리·링 변경)              |
| `className`       | `string`                     | —           | 기본 스타일 **뒤에 병합** — 스타일 커스터마이징 |

### `ToggleGroup` (루트)

| Prop            | 타입                         | 기본값         | 설명                                                |
| --------------- | ---------------------------- | -------------- | --------------------------------------------------- |
| `type`          | `"single" \| "multiple"`     | — _(필수)_     | 단일 / 다중 선택                                    |
| `value`         | `string \| string[]`         | —              | 선택 값(제어). `single`=string, `multiple`=string[] |
| `defaultValue`  | `string \| string[]`         | `""` / `[]`    | 초기 선택 값(비제어)                                |
| `onValueChange` | `(value) => void`            | —              | 선택 변경 콜백. 인자 타입은 `type`을 따름           |
| `variant`       | `"default" \| "outline"`     | —              | 하위 항목에 **일괄 적용**(항목 값보다 우선)         |
| `size`          | `"sm" \| "default" \| "lg"`  | —              | 하위 항목에 **일괄 적용**                           |
| `disabled`      | `boolean`                    | `false`        | 그룹 전체 비활성화                                  |
| `orientation`   | `"horizontal" \| "vertical"` | `"horizontal"` | 방향(화살표 키 탐색에 영향)                         |
| `rovingFocus`   | `boolean`                    | `true`         | 그룹을 하나의 Tab 정지점으로 묶고 화살표로 이동     |
| `loop`          | `boolean`                    | `true`         | 끝에서 화살표를 누르면 처음으로 순환                |
| `dir`           | `"ltr" \| "rtl"`             | `"ltr"`        | 텍스트 방향                                         |
| `className`     | `string`                     | —              | 트랙에 추가할 클래스                                |

### `ToggleGroupItem`

| Prop               | 타입            | 기본값     | 설명                               |
| ------------------ | --------------- | ---------- | ---------------------------------- |
| `value`            | `string`        | — _(필수)_ | 항목을 식별하는 고유 키            |
| `disabled`         | `boolean`       | `false`    | 이 항목만 비활성화                 |
| `variant` / `size` | `Toggle`과 동일 | —          | 그룹에 지정되지 않았을 때만 적용됨 |
| `aria-label`       | `string`        | —          | 아이콘 단독 사용 시 **필수**       |
| `className`        | `string`        | —          | 항목에 추가할 클래스               |

:::note `className`은 기본 스타일을 덮어씁니다
내부에서 `cn(toggleVariants({...}), className)`으로 병합하므로, 넘긴 `className`이 **뒤에 와서 우선 적용**됩니다. 색·모양을 바꿀 때 컴포넌트 코드를 고칠 필요가 없습니다.
:::

---

## 접근성 / 키보드

---

Radix 기반이라 **키보드 조작과 ARIA 속성이 기본 내장**되어 있습니다.

### `Toggle` 단독

| 키                  | 동작                         |
| ------------------- | ---------------------------- |
| `Tab` / `Shift+Tab` | 다음 / 이전 초점 요소로 이동 |
| `Space` / `Enter`   | 눌림 상태 전환               |

- `<button type="button">`으로 렌더되며 `aria-pressed="true|false"`가 자동으로 붙습니다.
- 눌림 상태는 `data-state="on" | "off"`로도 노출됩니다(스타일링 기준).
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다(`focus-visible:ring-[3px]`).

### `ToggleGroup`

| 키                | 동작                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `Tab`             | **그룹 전체가 하나의 정지점** — 진입 시 선택된(또는 마지막 포커스) 항목으로 |
| `←` `→`           | 항목 간 포커스 이동 (기본 `orientation="horizontal"`)                       |
| `↑` `↓`           | `orientation="vertical"`일 때 항목 간 이동                                  |
| `Home` / `End`    | 첫 / 마지막 항목으로 이동                                                   |
| `Space` / `Enter` | 포커스된 항목 선택 전환                                                     |

:::caution `type="single"`에서는 `aria-pressed`가 붙지 않습니다
Radix는 단일 선택 그룹의 항목을 **라디오 버튼 의미론**으로 렌더합니다 — `role="radio"` + `aria-checked`가 붙고 **`aria-pressed`는 제거**됩니다(`type="multiple"`은 `aria-pressed` 유지).

따라서 선택 상태 스타일은 **`aria-pressed`가 아니라 `data-state="on"` 기준**으로 잡아야 두 모드 모두에서 동작합니다. 기본 클래스도 `aria-pressed:bg-muted`와 `data-[state=on]:bg-muted`를 **둘 다** 갖고 있는 이유입니다.
:::

- 그룹 루트에는 `role="group"`이 붙습니다. 그룹 자체가 무엇을 고르는 것인지 설명이 필요하면 **`aria-label`을 그룹에** 주세요(예: `aria-label="보기 방식"`).
- 아이콘만 있는 항목에는 항목마다 `aria-label`을 지정합니다.

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것                    | 방법                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| 외곽선·크기                    | `variant` / `size` **prop**                                      |
| 색(눌림 배경·테두리·포커스 링) | **디자인 토큰**(`--muted`, `--input`, `--ring`, `--destructive`) |
| 이 인스턴스만 색·모양·여백     | **`className`** (Tailwind 유틸리티 + `data-[state=on]:` 접두사)  |
| 겉모습 전체 교체               | **`data-slot` 선택자 + CSS Module**                              |

### 1. 색은 디자인 토큰으로

Toggle 전용 색 변수는 없습니다. 눌림 배경은 `--muted`, 테두리는 `--input`, 포커스 링은 `--ring`, 오류는 `--destructive`를 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요(Toggle 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다).

### 2. 인스턴스 단위 조정 — `className` (Tailwind)

가장 자주 쓰는 방식입니다. 눌림 상태 스타일은 **`data-[state=on]:` 접두사**로 지정합니다.

```tsx
{
  /* 눌리면 브랜드 색 + 알약 모양 */
}
<Toggle
  className="rounded-full px-4 data-[state=on]:bg-violet-600 data-[state=on]:text-white"
  aria-label="구독"
>
  <Star />
  구독
</Toggle>;
```

:::tip `data-[state=on]:` 을 쓰세요
`aria-pressed:` 로 써도 단독 `Toggle`에서는 동작하지만, `ToggleGroup type="single"` 항목에는 `aria-pressed`가 없어 **적용되지 않습니다.** 두 경우 모두 동작하는 `data-[state=on]:` 로 통일하세요.
:::

`data-icon` 속성으로 아이콘 쪽 여백을 미세 조정할 수도 있습니다(`has-data-[icon=inline-start]:pl-2` 등). Badge·Pagination과 동일한 규칙입니다.

```tsx
{
  /* 왼쪽 아이콘 쪽 패딩을 좁혀 아이콘+텍스트 균형 맞추기 */
}
<Toggle aria-label="즐겨찾기">
  <Star data-icon="inline-start" />
  즐겨찾기
</Toggle>;
```

### 3. 세밀한 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 **`data-slot`** 을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                         | 대상               |
| --------------------------------- | ------------------ |
| `[data-slot="toggle"]`            | 단독 `Toggle` 버튼 |
| `[data-slot="toggle-group"]`      | 그룹 트랙(루트)    |
| `[data-slot="toggle-group-item"]` | 그룹 안의 각 버튼  |

상태·옵션은 아래 속성 선택자로 구분합니다.

| 선택자                                     | 의미                        |
| ------------------------------------------ | --------------------------- |
| `[data-state="on"]` / `[data-state="off"]` | 켜짐 / 꺼짐 **(권장 기준)** |
| `[data-disabled]`                          | 비활성                      |
| `[data-variant="outline"]`                 | 그룹·항목에 적용된 variant  |
| `[data-size="sm"]`                         | 그룹·항목에 적용된 size     |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 여러 단계로 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */
.wrap :global([data-slot="toggle-group"]) {
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--seg-track);
}
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"]) {
  border: none;
  border-radius: 999px;
  background: transparent;
}
/* 선택된 세그먼트 — data-state="on" 기준 */
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"][data-state="on"]) {
  color: var(--seg-brand);
  background: #fff;
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.22);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot='toggle-group'] [data-slot='toggle-group-item']`처럼 **래퍼+슬롯을 여러 단계로 겹쳐** 명시도를 확보해야 안정적으로 덮어씁니다. 아래 실전 예제처럼 `className`에 CSS Module 클래스를 **함께 넘겨** 선택자를 한 단계 더 좁히는 방식(`… [data-slot='toggle-group-item'].item`)도 유용합니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---

## 실전 예제 — 세그먼트 보기 전환 (CSS Module 리스타일)

---

제공 `ToggleGroup`을 **그대로 쓰면서**, `*.module.css`로 `data-slot`을 오버라이드해 **pill 세그먼트 컨트롤**로 완전히 재스타일링한 예제입니다. 세그먼트를 누르면 아래 목록 레이아웃(리스트 / 카드 / 칸반)이 실제로 바뀝니다.

<img
  src="../assets/ui/toggle-real-viewmode.png"
  alt="Toggle 실전 예제 — 세그먼트 보기 전환"
  width="100%"
/>

**포인트**

- 제공 `ToggleGroup`을 **그대로** 쓰고(`type="single"` + `value`/`onValueChange`), 동작·키보드·접근성은 컴포넌트에 맡깁니다.
- 항상 하나는 선택되어 있어야 하므로 `onValueChange={(v) => v && setMode(v as ViewMode)}`로 **빈 값을 무시**합니다.
- 선택 상태는 `[data-state='on']`으로 스타일링합니다(`type="single"`이라 `aria-pressed`가 없음).
- 트랙(`toggle-group`)의 `rounded-lg`를 `999px` pill로, 항목(`toggle-group-item`)의 `rounded-none` + `first/last` 라운드를 **개별 pill**로 갈아끼웠습니다.
- 겉모습은 전부 `*.module.css`에서 오버라이드했고, **컴포넌트는 손대지 않았습니다.**

<details>
<summary><b>ViewModeToggleGroup.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/toggle/ViewModeToggleGroup.tsx"
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@axiom/components/ui";
import { LayoutList, LayoutGrid, Columns3 } from "lucide-react";
import styles from "./ViewModeToggleGroup.module.css";

type ViewMode = "list" | "grid" | "kanban";

const ITEMS: { id: string; title: string; sub: string }[] = [
  { id: "PRJ-1042", title: "오픈뱅킹 정산 배치", sub: "진행 중 · 담당 김하늘" },
  { id: "PRJ-1043", title: "비대면 실명확인 개선", sub: "검토 · 담당 이도윤" },
  { id: "PRJ-1051", title: "MyData 스코프 확장", sub: "대기 · 담당 박서진" },
  { id: "PRJ-1067", title: "이상거래 탐지 룰셋", sub: "진행 중 · 담당 정민" },
];

/**
 * scaffold가 제공하는 ToggleGroup(@axiom/components/ui)을 "그대로 사용"하면서
 * CSS Module로 완전히 다른 세그먼트 컨트롤(pill segmented control)로 재스타일링한 예제.
 *
 * 재스타일링 포인트:
 *   ToggleGroup / ToggleGroupItem 은 내부 요소마다 data-slot 을 노출한다.
 *     - [data-slot="toggle-group"]        : 트랙(래퍼)
 *     - [data-slot="toggle-group-item"]   : 각 세그먼트 버튼
 *     - [data-state="on"]                 : 선택된 세그먼트(radix가 자동 부여)
 *   래퍼(.wrap) 아래에서 이 슬롯들을 선택자로 오버라이드해 Tailwind 기본 스타일을 덮어쓴다.
 */
export default function ViewModeToggleGroup(): React.ReactNode {
  const [mode, setMode] = useState<ViewMode>("list");

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <span className={styles.barLabel}>보기 방식</span>

        {/* value / onValueChange 로 제어. 빈 값(선택 해제) 방지를 위해 값이 있을 때만 반영 */}
        {/* highlight-start */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as ViewMode)}
          className={styles.group}
        >
          <ToggleGroupItem
            value="list"
            aria-label="리스트 보기"
            className={styles.item}
          >
            <LayoutList />
            리스트
          </ToggleGroupItem>
          <ToggleGroupItem
            value="grid"
            aria-label="카드 보기"
            className={styles.item}
          >
            <LayoutGrid />
            카드
          </ToggleGroupItem>
          <ToggleGroupItem
            value="kanban"
            aria-label="칸반 보기"
            className={styles.item}
          >
            <Columns3 />
            칸반
          </ToggleGroupItem>
        </ToggleGroup>
        {/* highlight-end */}
      </div>

      {/* 선택된 보기 방식에 따라 미리보기 레이아웃이 바뀐다 */}
      <div className={`${styles.preview} ${styles[mode]}`}>
        {ITEMS.map((it) => (
          <article key={it.id} className={styles.card}>
            <span className={styles.cardId}>{it.id}</span>
            <span className={styles.cardTitle}>{it.title}</span>
            <span className={styles.cardSub}>{it.sub}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>ViewModeToggleGroup.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/toggle/ViewModeToggleGroup.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 인디고 세그먼트 톤 */
  --seg-brand: #4f46e5;
  --seg-brand-deep: #4338ca;
  --seg-track: #eef2ff;
  --seg-track-border: #e0e7ff;
  --seg-ink: #312e81;
  --seg-sub: #6366f1;
  --seg-card: #ffffff;
  --seg-card-border: #e5e7eb;
  --seg-card-ink: #1f2937;
  --seg-card-sub: #6b7280;
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --seg-brand: #818cf8;
  --seg-track: #1e1b4b;
  --seg-track-border: #312e81;
  --seg-card: #0f1424;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * scaffold ToggleGroup 슬롯 오버라이드
 * (래퍼 + 슬롯 다단계 선택자로 Tailwind 유틸리티보다 명시도를 확보)
 * ========================================================================= */

/* 트랙: 기본 flex/rounded-lg 를 pill 트랙으로 재정의 */
/* highlight-start */
.wrap :global([data-slot="toggle-group"]).group {
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--seg-track);
  border: 1px solid var(--seg-track-border);
}
/* highlight-end */

/* 세그먼트: 기본 rounded-none / first·last radius / hover 를 완전히 덮어씀 */
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"]).item {
  height: 34px;
  padding: 0 16px;
  gap: 6px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--seg-sub);
  background: transparent;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"]).item:hover {
  color: var(--seg-brand-deep);
  background: transparent;
}
/* 아이콘 크기(기본 size-4)도 여기서 조정 */
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"]).item
  :global(svg) {
  width: 15px;
  height: 15px;
}

/* 선택된 세그먼트(radix data-state="on"): 흰 pill + 브랜드 텍스트 + 부드러운 그림자 */
/* highlight-start */
.wrap
  :global([data-slot="toggle-group"])
  :global([data-slot="toggle-group-item"][data-state="on"]).item {
  color: var(--seg-brand-deep);
  background: var(--seg-card);
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.22);
}
/* highlight-end */

/* 키보드 포커스 링 */
.wrap :global([data-slot="toggle-group-item"]).item:focus-visible {
  outline: 2px solid var(--seg-brand);
  outline-offset: 2px;
}

/* ── 미리보기 영역: 선택된 보기 방식에 따라 레이아웃 전환 ─────── */
.preview {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}
.list {
  grid-template-columns: 1fr;
}
.grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.kanban {
  grid-auto-flow: column;
  grid-auto-columns: minmax(160px, 1fr);
  overflow-x: auto;
}

/* … 상단 바(.bar/.barLabel) · 카드(.card/.cardId/.cardTitle/.cardSub) 는
     동일한 패턴으로 정의되어 있습니다. 전체 소스는 scaffold 파일을 확인하세요. */
```

</details>

:::tip 이 예제에서 가져갈 것
동작(선택 관리·키보드 탐색·접근성)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`type`·`value` 등 **prop** ②`data-slot` + `[data-state='on']` **오버라이드** ③항목 안에 넣는 **내 마크업** 세 가지뿐입니다. **컴포넌트를 복사해서 고치지 마세요.**
:::

---
