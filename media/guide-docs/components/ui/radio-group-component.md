---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "RadioGroup"
hide_table_of_contents: false
---

# RadioGroup 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 라디오 그룹 컴포넌트입니다.  
여러 선택지 중 **딱 하나만** 고르는 입력에 사용합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > 라디오 그룹 컴포넌트`(`/ui-components/radio-group`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 결제수단·배송방법처럼 **선택지가 2~7개**이고 **한 번에 다 보여줘야** 하는 단일 선택
- 만족도 설문·등급처럼 **선택지끼리 비교하며** 고르는 입력
- 필터·정렬처럼 **현재 선택값이 항상 눈에 보여야** 하는 토글 묶음

:::tip Checkbox · Select 와의 구분

| 상황                                  | 쓸 것                                          |
| ------------------------------------- | ---------------------------------------------- |
| 하나만 선택 + 선택지 2~7개            | **RadioGroup**                                 |
| 하나만 선택 + 선택지가 많음(8개 이상) | [Select](./native-select-component) / Combobox |
| 여러 개 선택 가능                     | [Checkbox](./checkbox-component)               |
| 켜짐/꺼짐 두 가지 상태                | [Switch](./switch-component)                   |

라디오는 **한 번 고르면 아무것도 선택하지 않은 상태로 되돌릴 수 없습니다.** "선택 안 함"이 필요하면 `없음` 같은 항목을 직접 넣거나 Checkbox를 쓰세요.
:::

---

## Import

---

```tsx
import { RadioGroup, RadioGroupItem, Label } from "@axiom/components/ui";
```

RadioGroup은 **루트 + 항목** 두 파트를 조합해서 쓰는 합성(compound) 컴포넌트입니다. 내보내는 것은 `RadioGroup`, `RadioGroupItem` **두 개뿐**이고, 항목 이름표는 별도 컴포넌트인 `Label`을 씁니다.

:::note `Label`은 선택이 아니라 사실상 필수입니다
`RadioGroupItem`은 지름 16px짜리 원 하나만 그립니다. **텍스트가 붙어 있지 않으면 그 항목이 무엇인지 화면에도, 스크린리더에도 남지 않습니다.** `Label`을 붙이면 이름표 클릭만으로도 선택되고, 클릭 영역도 함께 넓어집니다.
:::

---

## 기본 사용법

---

`RadioGroup` 안에 `RadioGroupItem`을 넣고, 각 항목에 **서로 다른 `value`** 를 줍니다. `id` ↔ `htmlFor`로 `Label`을 연결하면 끝입니다.

<img
  src="../assets/ui/radio-group-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
<RadioGroup defaultValue="comfortable">
  <div className="flex items-center gap-2">
    <RadioGroupItem value="default" id="r1" />
    <Label htmlFor="r1">기본</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="comfortable" id="r2" />
    <Label htmlFor="r2">넓게</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="compact" id="r3" />
    <Label htmlFor="r3">좁게</Label>
  </div>
</RadioGroup>
```

- 루트의 기본 스타일은 `grid w-full gap-2` 입니다. **세로로 나열되고 부모 폭을 꽉 채웁니다.**
- 항목 하나는 `<RadioGroupItem>` + `<Label>` 한 쌍입니다. 둘을 감싸는 `<div className="flex items-center gap-2">`는 컴포넌트가 만들어 주지 않으니 **직접 써야 합니다.**
- `id`는 화면 안에서 유일해야 합니다. 같은 화면에 그룹이 여러 개 있거나 리스트에서 반복 렌더한다면 `useId()`로 접두어를 만들어 쓰세요.

```tsx
const uid = useId();
// …
<RadioGroupItem value="default" id={`${uid}-r1`} />
<Label htmlFor={`${uid}-r1`}>기본</Label>
```

:::caution 알려진 이슈 — 선택해도 원이 채워지지 않습니다 (기본 스타일 한정)
현재 `radio-group.tsx`의 선택 상태 클래스는 `data-checked:border-primary data-checked:bg-primary …` 입니다. Tailwind v4는 이걸 **`[data-checked]`** 선택자로 컴파일하는데, 설치된 radix(`radix-ui@1.4.3` → `@radix-ui/react-radio-group@1.3.8`)는 선택 시 **`data-state="checked"`** 만 붙입니다. 이름이 어긋나 **선택 색(primary 채움)이 적용되지 않습니다.**

- 안쪽 점은 `bg-primary-foreground`(라이트 테마 `#ffffff`)라, 채움색이 안 들어오면 흰 배경 위에서 사실상 보이지 않습니다.
- 아래 [실전 예제](#실전-예제)의 CSS Module들은 `[data-state='checked']`를 직접 걸어 두었으므로 **재스타일링한 화면은 정상 동작합니다.**
- 컴포넌트를 고친다면 `data-checked:` → `data-[state=checked]:` 로 바꾸는 한 줄이면 됩니다. (`checkbox.tsx`도 같은 상태입니다.)

:::

---

## 구성 (Anatomy)

---

```tsx
<RadioGroup>
  {" "}
  {/* 루트 — 선택값(value)을 관리하고 키보드 이동을 담당 */}
  <div>
    {" "}
    {/* 한 항목의 레이아웃 — 직접 작성 */}
    <RadioGroupItem /> {/* 라디오 원형 하나 — value로 식별 */}
    <Label /> {/* 항목 이름표 — htmlFor로 Item과 연결 */}
  </div>
  {/* 항목을 필요한 만큼 반복 */}
</RadioGroup>
```

| 파트             | 역할                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `RadioGroup`     | 루트. 선택값·키보드 이동·폼 연동을 관리합니다.                               |
| `RadioGroupItem` | 라디오 하나. `value`(고유 키)를 가지며 `<button role="radio">`로 렌더됩니다. |
| `Label`          | 항목 이름표. 별도 컴포넌트이며 `htmlFor`로 Item에 연결합니다.                |

렌더 결과를 보면 재스타일링 진입점(`data-slot`)이 보입니다.

```html
<!-- 렌더 결과 (요약) -->
<div data-slot="radio-group" role="radiogroup">
  <!-- 선택된 항목 -->
  <button
    data-slot="radio-group-item"
    role="radio"
    type="button"
    aria-checked="true"
    data-state="checked"
    value="card"
  >
    <span data-slot="radio-group-indicator" data-state="checked">
      <span><!-- 안쪽 점 (size-2, bg-primary-foreground) --></span>
    </span>
  </button>

  <!-- 선택되지 않은 항목 -->
  <button
    data-slot="radio-group-item"
    role="radio"
    aria-checked="false"
    data-state="unchecked"
  >
    <!-- indicator 는 아예 렌더되지 않음 -->
  </button>
</div>
```

:::note 안쪽 점(indicator)은 선택됐을 때만 DOM에 존재합니다
`radio-group-indicator`는 선택된 항목에만 렌더됩니다. 따라서 **"선택 안 됨 상태의 점"에 CSS를 걸 수는 없습니다.** 선택/미선택의 차이는 `radio-group-item` 쪽의 `data-state`로 표현하세요.
:::

---

## 동작 옵션

---

### 1. 초기 선택 — `defaultValue` (비제어)

```tsx
<RadioGroup defaultValue="comfortable"> … </RadioGroup>
```

`defaultValue`는 **비제어(uncontrolled)** 초기값입니다. 이후 선택 상태는 컴포넌트가 알아서 관리하므로 state가 필요 없습니다.

- `defaultValue`를 주지 않으면 **아무것도 선택되지 않은 상태**로 시작합니다.
- 라디오는 되돌릴 수 없으므로, 기본값을 넣을지 여부는 "미선택 상태가 의미 있는가"로 판단하세요. (배송방법 = 기본값 있음 / 설문 응답 = 미선택 시작)

### 2. 외부에서 제어 — `value` / `onValueChange`

선택값을 바깥 state로 다뤄야 할 때(합계 계산, 다른 UI와 연동, 폼 라이브러리 연결) 씁니다.

```tsx
import { useState } from "react";

function Example() {
  const [plan, setPlan] = useState("pro");

  return (
    <>
      <p>
        현재 선택값: <code>{plan}</code>
      </p>

      <RadioGroup
        // highlight-start
        value={plan}
        onValueChange={setPlan}
        // highlight-end
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="starter" id="p1" />
          <Label htmlFor="p1">스타터 플랜 ($9/월)</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="pro" id="p2" />
          <Label htmlFor="p2">프로 플랜 ($29/월)</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="enterprise" id="p3" />
          <Label htmlFor="p3">엔터프라이즈 플랜 ($99/월)</Label>
        </div>
      </RadioGroup>
    </>
  );
}
```

- `onValueChange`는 이벤트 객체가 아니라 **선택된 `value` 문자열**을 그대로 넘겨줍니다. `setPlan`을 바로 붙일 수 있습니다.
- `value`를 넘기는 순간 **제어 모드**가 됩니다. `onValueChange`로 state를 갱신하지 않으면 클릭해도 선택이 바뀌지 않습니다.
- `value`와 `defaultValue`를 **동시에 쓰지 마세요.** 둘 중 하나만 씁니다.
- 값은 항상 **문자열**입니다. 숫자 id를 다룬다면 `String(id)` ↔ `Number(value)`로 변환하세요.

### 3. 가로 배치 — `className` + `orientation`

루트의 기본값이 `grid`라 항목이 세로로 쌓입니다. 가로로 놓으려면 `className`으로 덮어씁니다.

<img
  src="../assets/ui/radio-group-horizontal.png"
  alt="가로 배치"
  width="80%"
/>

```tsx
<RadioGroup defaultValue="all" className="flex flex-wrap gap-6">
  <div className="flex items-center gap-2">
    <RadioGroupItem value="all" id="h1" />
    <Label htmlFor="h1">전체</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="ing" id="h2" />
    <Label htmlFor="h2">진행중</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="done" id="h3" />
    <Label htmlFor="h3">완료</Label>
  </div>
</RadioGroup>
```

내부적으로 `tailwind-merge`를 쓰므로 `flex`를 넘기면 기본값 `grid`가 **제거된 뒤** 적용됩니다. `!important`가 필요 없습니다.

:::caution 가로 배치에서는 `gap`을 최소 `gap-6`(24px) 주세요
`RadioGroupItem`에는 클릭 영역을 넓히는 투명 `::after`가 걸려 있습니다(`after:-inset-x-3 after:-inset-y-2`). 보이는 크기는 16px이지만 **실제 클릭 영역은 가로 40px · 세로 32px**입니다. 항목 간격이 24px보다 좁으면 **옆 항목의 클릭 영역과 겹쳐** 엉뚱한 값이 선택됩니다.
:::

`orientation`은 **시각적 배치가 아니라 키보드 방향키 축**을 정합니다.

```tsx
{
  /* 지정하지 않음(기본) — ↑↓←→ 네 방향 모두 이동 */
}
<RadioGroup className="flex gap-6"> … </RadioGroup>;

{
  /* 가로 전용 — ←/→ 로만 이동 */
}
<RadioGroup orientation="horizontal" className="flex gap-6">
  {" "}
  …{" "}
</RadioGroup>;
```

대부분은 **지정하지 않는 편이 편합니다.** 네 방향이 모두 동작해 사용자가 어느 키를 눌러도 이동합니다.

### 4. 비활성화 — `disabled`

```tsx
{
  /* ① 항목 하나만 비활성화 */
}
<RadioGroup defaultValue="basic">
  <div className="flex items-center gap-2">
    <RadioGroupItem value="basic" id="x1" />
    <Label htmlFor="x1">베이직</Label>
  </div>
  <div className="flex items-center gap-2">
    {/* highlight-next-line */}
    <RadioGroupItem value="enterprise" id="x2" disabled />
    <Label htmlFor="x2">엔터프라이즈 (문의 필요)</Label>
  </div>
</RadioGroup>;

{
  /* ② 그룹 전체 비활성화 (읽기 전용 화면 등) */
}
{
  /* highlight-next-line */
}
<RadioGroup defaultValue="y1" disabled>
  …
</RadioGroup>;
```

- 비활성 항목은 `opacity-50` + `cursor-not-allowed`가 되고, **키보드 방향키 이동에서도 건너뜁니다.**
- `Label`을 `RadioGroupItem` **바로 뒤 형제**로 두면, 비활성화 시 이름표도 자동으로 흐려집니다. `RadioGroupItem`에 `peer`가, `Label`에 `peer-disabled:opacity-50`이 걸려 있기 때문입니다.
- 반대로 `Label`이 항목을 **감싸는** 구조(아래 카드형 예제)에서는 `peer`가 닿지 않으므로, 비활성 스타일을 직접 클래스로 줘야 합니다.

### 5. 폼 전송 — `name` / `required`

`<form>` 안에서 쓰면 radix가 **숨은 `<input type="radio">`를 자동으로 렌더**해 값을 실어 보냅니다.

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    console.log(data.get("delivery")); // 'std' | 'exp'
  }}
>
  {/* highlight-next-line */}
  <RadioGroup name="delivery" required defaultValue="std">
    <div className="flex items-center gap-2">
      <RadioGroupItem value="std" id="f1" />
      <Label htmlFor="f1">일반 배송</Label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="exp" id="f2" />
      <Label htmlFor="f2">빠른 배송</Label>
    </div>
  </RadioGroup>

  <button type="submit">주문하기</button>
</form>
```

:::caution `name` 없이는 폼에 담기지 않습니다
숨은 input에 `name`이 그대로 전달되므로, **`name`을 주지 않으면 `FormData`에 아무것도 들어가지 않습니다.** (자동 생성되지 않습니다.) `useState`로 값을 직접 들고 있는 화면이라면 `name`은 필요 없습니다.
:::

### 6. 유효성 오류 표시 — `aria-invalid`

필수 항목인데 선택되지 않았을 때, `RadioGroupItem`에 `aria-invalid`를 주면 destructive(빨강) 링 스타일이 적용됩니다.

<img
  src="../assets/ui/radio-group-invalid.png"
  alt="유효성 오류 표시"
  width="80%"
/>

```tsx
const [delivery, setDelivery] = useState("");
const [submitted, setSubmitted] = useState(false);
const invalid = submitted && delivery === "";

<RadioGroup value={delivery} onValueChange={setDelivery}>
  <div className="flex items-center gap-2">
    {/* highlight-next-line */}
    <RadioGroupItem value="std" id="v1" aria-invalid={invalid} />
    <Label htmlFor="v1">일반 배송</Label>
  </div>
  <div className="flex items-center gap-2">
    {/* highlight-next-line */}
    <RadioGroupItem value="exp" id="v2" aria-invalid={invalid} />
    <Label htmlFor="v2">빠른 배송</Label>
  </div>
</RadioGroup>;
{
  invalid && (
    <p className="text-xs text-destructive">배송 방법을 선택해 주세요.</p>
  );
}
```

- `aria-invalid`는 **루트가 아니라 각 `RadioGroupItem`에** 줍니다. 스타일이 항목에 걸려 있기 때문입니다.
- 오류일 때 `border-destructive` + `ring-destructive/20`이 적용되고, **선택된 항목은 다시 primary 테두리로 되돌아옵니다**(`aria-invalid:aria-checked:border-primary`).
- 색만으로 오류를 알리지 마세요. 위 예시처럼 **오류 문구를 함께** 띄웁니다.

---

## API 레퍼런스

---

`RadioGroup` · `RadioGroupItem` 모두 **Radix RadioGroup** 기반이라, 아래 표에 없는 Radix 표준 prop과 DOM 속성(`id`, `aria-*`, `style`, `onClick` 등)도 그대로 전달됩니다.

### `RadioGroup` (루트)

| Prop            | 타입                         | 기본값  | 설명                                                              |
| --------------- | ---------------------------- | ------- | ----------------------------------------------------------------- |
| `value`         | `string`                     | —       | 현재 선택된 항목의 value (**제어 모드**)                          |
| `defaultValue`  | `string`                     | —       | 초기 선택 항목 (**비제어 모드**)                                  |
| `onValueChange` | `(value: string) => void`    | —       | 선택이 바뀔 때 호출. 인자는 이벤트가 아니라 **value 문자열**      |
| `name`          | `string`                     | —       | 폼 전송 시 필드명. **없으면 FormData에 담기지 않음**              |
| `required`      | `boolean`                    | `false` | 폼 제출 시 선택 필수                                              |
| `disabled`      | `boolean`                    | `false` | 그룹 전체 비활성화                                                |
| `orientation`   | `"horizontal" \| "vertical"` | —       | **키보드 방향키 축.** 미지정 시 ↑↓←→ 모두 동작 (시각 배치와 무관) |
| `loop`          | `boolean`                    | `true`  | 방향키 이동이 처음/끝에서 순환할지                                |
| `dir`           | `"ltr" \| "rtl"`             | `"ltr"` | 텍스트 방향                                                       |
| `className`     | `string`                     | —       | 루트에 추가. 기본 `grid w-full gap-2`를 덮어씀(tailwind-merge)    |

### `RadioGroupItem`

| Prop           | 타입      | 기본값     | 설명                                          |
| -------------- | --------- | ---------- | --------------------------------------------- |
| `value`        | `string`  | — _(필수)_ | 항목을 식별하는 고유 값                       |
| `id`           | `string`  | —          | `Label`의 `htmlFor`와 연결할 id (사실상 필수) |
| `disabled`     | `boolean` | `false`    | 이 항목만 비활성화                            |
| `aria-invalid` | `boolean` | —          | 유효성 오류 표시(destructive 테두리·링)       |
| `className`    | `string`  | —          | 항목에 추가할 클래스 (크기·색 등)             |

### 자동으로 붙는 속성

CSS 선택자로 그대로 쓸 수 있습니다.

| 대상                                  | 속성            | 값                                 |
| ------------------------------------- | --------------- | ---------------------------------- |
| `[data-slot="radio-group"]`           | `role`          | `radiogroup`                       |
| `[data-slot="radio-group-item"]`      | `role`          | `radio`                            |
| `[data-slot="radio-group-item"]`      | `type`          | `button` (폼 자동 제출 방지)       |
| `[data-slot="radio-group-item"]`      | `aria-checked`  | `true` \| `false`                  |
| `[data-slot="radio-group-item"]`      | `data-state`    | `checked` \| `unchecked`           |
| `[data-slot="radio-group-item"]`      | `data-disabled` | 비활성일 때만 (빈 문자열)          |
| `[data-slot="radio-group-indicator"]` | `data-state`    | `checked` (**선택됐을 때만 렌더**) |

:::note `data-checked`는 붙지 않습니다
설치된 radix 버전(`@radix-ui/react-radio-group@1.3.8`)은 `data-state="checked"`만 노출합니다. 상위 radix에서 `data-checked`로 바뀔 예정이라 **CSS에서는 두 가지를 함께 걸어 두는 것**이 안전합니다. ([기본 사용법](#기본-사용법)의 "알려진 이슈" 참고)
:::

---

## 접근성 / 키보드

---

Radix 기반이라 **키보드 조작과 ARIA 속성이 기본 내장**되어 있습니다. 별도 설정 없이 아래가 동작합니다.

| 키                  | 동작                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `Tab`               | 그룹 **전체가 탭 스톱 1개**. 안으로 들어가면 선택된 항목에 포커스 |
| `↓` / `→`           | 다음 항목으로 이동하며 **즉시 선택**                              |
| `↑` / `←`           | 이전 항목으로 이동하며 **즉시 선택**                              |
| `Space`             | 포커스된 항목 선택                                                |
| `Tab` (그룹 안에서) | 그룹을 빠져나가 다음 요소로 이동                                  |

- 라디오 그룹은 **항목 개수와 상관없이 탭 스톱이 1개**입니다. 항목 사이 이동은 방향키가 담당합니다(roving tabindex).
- 방향키는 **이동과 동시에 선택**됩니다(select-on-focus). 라디오의 표준 동작이며, 그래서 "선택하지 않고 훑어보기"는 불가능합니다.
- 비활성(`disabled`) 항목은 이동에서 자동으로 건너뜁니다.
- `loop`가 기본 `true`라 마지막 항목에서 `↓`를 누르면 첫 항목으로 순환합니다.

직접 챙겨야 하는 것:

- **각 항목의 이름** — `Label` + `htmlFor`로 연결하세요. 연결이 없으면 스크린리더가 "라디오 버튼, 선택됨"까지만 읽습니다.
- **그룹 전체의 이름** — 무엇을 고르는 그룹인지 알리려면 루트에 `aria-label`(또는 `aria-labelledby`)을 주세요.

  ```tsx
  <RadioGroup aria-label="상담 서비스 만족도" value={score} onValueChange={setScore}>
  ```

- **라디오를 시각적으로 숨길 때** — `display:none` / `visibility:hidden`은 절대 쓰지 마세요. 키보드 포커스와 스크린리더가 함께 사라집니다. `position:absolute` + `clip-path`로 감추는 방법은 [4. 라디오 원형 숨기기](#4-라디오-원형-숨기기-세그먼트칩-형태)에 있습니다.

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다. 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                   | 방법                                     |
| ----------------------------- | ---------------------------------------- |
| 배치(세로/가로/그리드) · 간격 | 루트 **`className`**                     |
| 라디오 크기 · 테두리(한 곳만) | 항목 **`className`**                     |
| 선택 색 전반(테마)            | **디자인 토큰** (`--primary`, `--input`) |
| 겉모습 전면 교체              | **`data-slot` 선택자 + CSS Module**      |

:::tip 원본 컴포넌트를 복사·수정하지 마세요
`src/shared/lib/shadcn/ui/radio-group.tsx`를 고치면 이 컴포넌트를 쓰는 **모든 화면이 함께 바뀌고**, shadcn 업데이트 시 충돌합니다. 화면별 디자인은 아래 `data-slot` 오버라이드로 처리하세요. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 1. `data-slot` 목록

| data-slot               | 대상             | 기본 스타일                               | 주로 바꾸는 것                               |
| ----------------------- | ---------------- | ----------------------------------------- | -------------------------------------------- |
| `radio-group`           | 루트 컨테이너    | `grid w-full gap-2`                       | 배치(세로/가로/그리드), 항목 간격, 트랙 배경 |
| `radio-group-item`      | 라디오 원형      | `size-4 rounded-full border border-input` | 크기, 테두리, 선택 색, 포커스 링, 숨기기     |
| `radio-group-indicator` | 안쪽 점(선택 시) | 가운데 `size-2 rounded-full` 점           | 점 크기·색, 체크 아이콘으로 교체             |
| `label`                 | 이름표(`Label`)  | `flex items-center gap-2 text-sm`         | 카드형 클릭 영역, 타이포, 선택 시 배경       |

### 2. 선택 상태 감지 — `data-state="checked"`

가장 중요한 선택자입니다. **선택 여부에 따른 모든 스타일은 여기서 시작합니다.**

```css
/* 래퍼(.wrap) 아래에서 슬롯을 선택해 Tailwind 유틸리티보다 명시도를 확보한다 */
.wrap :global([data-slot="radio-group-item"]) {
  width: 22px;
  height: 22px;
  border: 2px solid #d3dedd;
}

/* 선택 상태 — 현재 radix는 data-state, 상위 버전은 data-checked. 둘 다 걸어 둔다 */
/* highlight-start */
.wrap :global([data-slot="radio-group-item"])[data-state="checked"],
.wrap :global([data-slot="radio-group-item"])[data-checked] {
  border-color: #0d9488;
  background: #0d9488;
}
/* highlight-end */

/* 안쪽 점 */
.wrap :global([data-slot="radio-group-indicator"]) > span {
  width: 8px;
  height: 8px;
  background: #fff;
}

/* 포커스 링 */
.wrap :global([data-slot="radio-group-item"]):focus-visible {
  outline: 2px solid #0d9488;
  outline-offset: 2px;
}
```

:::caution 명시도를 확보하세요
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. 래퍼 클래스 아래에서 `:global([data-slot='…'])` 형태로 **2단계 이상** 선택해야 안정적으로 덮어씁니다.
:::

### 3. 카드형으로 만들기 — `Label`로 감싸기

항목 전체(아이콘·제목·설명)를 클릭 영역으로 만들려면 `Label`이 `RadioGroupItem`을 **감싸도록** 구성합니다.

```tsx
<Label
  htmlFor={id}
  className={selected ? `${styles.option} ${styles.optionOn}` : styles.option}
>
  <RadioGroupItem id={id} value={m.value} />
  <span className={styles.optionBody}>
    <span className={styles.optionTitle}>{m.title}</span>
    <span className={styles.optionDesc}>{m.desc}</span>
  </span>
</Label>
```

- `<label>`이 `<button role="radio">`를 감싸는 건 **유효한 마크업**입니다. 카드 어디를 눌러도 선택됩니다.
- 다만 **선택 상태가 `Label`에는 자동으로 반영되지 않습니다.** 카드 배경·테두리를 바꾸려면 위처럼 `.tsx`에서 선택 여부를 계산해 클래스를 직접 붙이세요.
- `Label`이 감싸는 구조에서는 `peer-disabled:`가 닿지 않습니다. 비활성 카드 스타일도 클래스로 직접 처리합니다.

### 4. 라디오 원형 숨기기 (세그먼트·칩 형태)

동그라미 없이 버튼처럼 보이게 하려면, 원형을 **시각적으로만** 감춥니다.

```css
/* ✅ DOM·포커스·스크린리더는 살리고 화면에서만 감춘다 */
.wrap :global([data-slot="radio-group-item"]) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

/* 포커스 링은 감싸는 Label 이 :focus-within 으로 대신 그린다 */
.seg:focus-within {
  outline: 2px solid #f59e0b;
  outline-offset: 2px;
}
```

:::danger `display:none` / `visibility:hidden` 금지
두 속성은 요소를 **포커스 트리에서 제거**합니다. 키보드로 선택이 불가능해지고 스크린리더도 읽지 못합니다. 위 `clip-path` 방식만 쓰세요. 그리고 원형을 감췄다면 **포커스 링을 반드시 다른 요소(보통 감싸는 `Label`)에 되살려야** 합니다.
:::

### 5. 안쪽 점을 체크 표시(✓)로 바꾸기

안쪽 점은 `radio-group-indicator` 아래의 `<span>` 하나입니다. 이 span의 모양만 바꾸면 점이 체크로 바뀝니다.

```css
/* 원을 조금 키우고 */
.wrap :global([data-slot="radio-group-item"]) {
  width: 20px;
  height: 20px;
}

/* 안쪽 점(span) → 두 변만 남긴 사각형을 45° 돌려 체크 표시로 */
.wrap :global([data-slot="radio-group-indicator"]) > span {
  width: 5px;
  height: 9px;
  border-radius: 0;
  background: transparent;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  /* 가운데 정렬은 컴포넌트의 translate 가 그대로 담당하므로 회전만 준다 */
  transform: rotate(45deg);
}
```

:::note 왜 `transform`에 `translate(-50%, -50%)`를 다시 안 쓰나요?
컴포넌트의 가운데 정렬은 Tailwind v4의 `-translate-x-1/2 -translate-y-1/2`인데, 이건 `transform`이 아니라 **독립된 `translate` CSS 속성**으로 컴파일됩니다. 그래서 `transform: rotate(45deg)`만 줘도 정렬이 깨지지 않습니다. (`transform: translate(...) rotate(...)`로 덮어쓰면 오히려 이중으로 밀려납니다.)
:::

:::caution `RadioGroupItem`에 자식(children)을 넣어도 무시됩니다
컴포넌트가 내부에서 indicator를 **고정 자식으로** 렌더하고, JSX에서 직접 쓴 자식이 이를 덮어쓰지 못합니다. 즉 아이콘을 원 안에 "넣는" 방식은 동작하지 않습니다.

```tsx
{
  /* ❌ ✓ 는 화면에 나오지 않는다 */
}
<RadioGroupItem value="card" id={id}>
  ✓
</RadioGroupItem>;
```

원 **안쪽**은 위 CSS로, 원 **바깥쪽**(제목·설명·아이콘)은 [3. 카드형으로 만들기](#3-카드형으로-만들기--label로-감싸기)처럼 `Label` 안에 직접 마크업을 넣어 처리하세요.
:::

---

## 실전 예제

---

제공 RadioGroup을 **그대로** 쓰되 `*.module.css`만 달리해서 전혀 다른 두 화면을 만든 예제입니다. 두 예제의 `.tsx`는 같은 컴포넌트를 import 합니다 — **다른 건 CSS뿐입니다.**

### 1. 결제수단 선택 (카드형)

라디오 원형을 살려 두고, 항목 전체를 "선택 가능한 카드"로 재스타일링했습니다. 카드 어디를 눌러도 선택되고, 비활성 항목·수수료 합산까지 동작합니다.

<img
  src="../assets/ui/radio-group-real-payment.png"
  alt="결제수단 선택 (카드형)"
  width="100%"
/>

**포인트**

- `RadioGroup` / `RadioGroupItem` / `Label`을 **그대로** 쓰고, 겉모습은 전부 `*.module.css`에서 `data-slot`으로 덮어썼습니다.
- 카드 전체를 `<Label htmlFor>`로 감싸 클릭 영역을 넓혔습니다. ([3. 카드형으로 만들기](#3-카드형으로-만들기--label로-감싸기))
- 선택 상태는 `.tsx`에서 계산해 `.optionOn` 클래스를 붙입니다. **라디오 원형 자체의 선택 표시는 `[data-state='checked']` CSS가 담당**합니다.
- 비활성 항목은 `Label`이 감싸는 구조라 `peer-disabled:`가 닿지 않으므로 `.optionDisabled`를 직접 붙였습니다.

<details>
<summary><b>PaymentMethodRadioGroup.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/radiogroup/PaymentMethodRadioGroup.tsx"
import { useId, useState } from "react";
import { RadioGroup, RadioGroupItem, Label } from "@axiom/components/ui";
import { CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import styles from "./PaymentMethodRadioGroup.module.css";

/** 결제수단 한 건 */
interface IPayMethod {
  value: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  fee: number;
  disabled?: boolean;
}

const METHODS: IPayMethod[] = [
  {
    value: "card",
    title: "신용/체크카드",
    desc: "국내 전 카드사 / 무이자 할부 가능",
    icon: <CreditCard size={18} />,
    fee: 0,
  },
  {
    value: "transfer",
    title: "실시간 계좌이체",
    desc: "은행 앱 없이 바로 이체",
    icon: <Landmark size={18} />,
    fee: 0,
  },
  {
    value: "phone",
    title: "휴대폰 소액결제",
    desc: "통신요금과 함께 청구 (월 한도 적용)",
    icon: <Smartphone size={18} />,
    fee: 300,
  },
  {
    value: "point",
    title: "포인트 결제",
    desc: "보유 포인트 부족 — 사용할 수 없습니다",
    icon: <Wallet size={18} />,
    fee: 0,
    disabled: true,
  },
];

const AMOUNT = 128_000;

export default function PaymentMethodRadioGroup(): React.ReactNode {
  const uid = useId();
  const [method, setMethod] = useState<string>("card");
  const selected = METHODS.find((m) => m.value === method);
  const total = AMOUNT + (selected?.fee ?? 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <div className={styles.title}>결제수단 선택</div>
          <div className={styles.subtitle}>
            주문금액 {AMOUNT.toLocaleString()}원 · 결제수단에 따라 수수료가
            달라집니다.
          </div>
        </div>

        {/* scaffold 제공 RadioGroup — 스타일만 CSS Module로 오버라이드 */}
        <RadioGroup value={method} onValueChange={setMethod}>
          {METHODS.map((m) => {
            const id = `${uid}-${m.value}`;
            return (
              // highlight-start
              /* 카드 전체를 Label 로 감싼다 → 어디를 눌러도 선택됨 */
              <Label
                key={m.value}
                htmlFor={id}
                className={[
                  styles.option,
                  method === m.value && !m.disabled ? styles.optionOn : "",
                  m.disabled ? styles.optionDisabled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <RadioGroupItem id={id} value={m.value} disabled={m.disabled} />
                // highlight-end
                <span className={styles.optionBody}>
                  <span className={styles.optionTitle}>{m.title}</span>
                  <span className={styles.optionDesc}>
                    {m.desc}
                    {m.fee > 0 && ` · 수수료 ${m.fee.toLocaleString()}원`}
                  </span>
                </span>
                <span className={styles.optionIcon}>{m.icon}</span>
              </Label>
            );
          })}
        </RadioGroup>

        <div className={styles.summary}>
          <span>
            {selected?.title} · 수수료 {(selected?.fee ?? 0).toLocaleString()}원
          </span>
          <span className={styles.summaryValue}>
            총 {total.toLocaleString()}원
          </span>
        </div>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>PaymentMethodRadioGroup.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/radiogroup/PaymentMethodRadioGroup.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 틸 결제 UI */
  --pm-brand: #0d9488;
  --pm-brand-soft: #ecfdf9;
  --pm-ink: #10312e;
  --pm-sub: #4d6a67;
  --pm-card: #ffffff;
  --pm-border: #e2e8e7;
  --pm-line: #d3dedd;
  --pm-body-bg: #f5faf9;
  --pm-disabled: #eef1f1;
  --pm-disabled-text: #a7b3b2;

  color: var(--pm-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --pm-brand: #2dd4bf;
  --pm-ink: #e6f5f3;
  --pm-card: #101c1b;
  --pm-line: #2d4442;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * scaffold RadioGroup 슬롯 오버라이드
 * (래퍼 + 슬롯 2단계 선택자로 Tailwind 유틸리티보다 명시도를 확보)
 * ========================================================================= */

/* 그룹: 기본 grid gap-2 → 카드 사이 간격 확보 */
.wrap :global([data-slot="radio-group"]) {
  gap: 10px;
}

/* 라디오 원형 — 기본 size-4(16px) → 22px 큰 원으로 */
.wrap :global([data-slot="radio-group-item"]) {
  width: 22px;
  height: 22px;
  border: 2px solid var(--pm-line);
  background: var(--pm-card);
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}
/* 선택 상태 — 현재 radix는 data-state, 상위 버전은 data-checked */
/* highlight-start */
.wrap :global([data-slot="radio-group-item"])[data-state="checked"],
.wrap :global([data-slot="radio-group-item"])[data-checked] {
  border-color: var(--pm-brand);
  background: var(--pm-brand);
}
/* highlight-end */
.wrap :global([data-slot="radio-group-item"]):focus-visible {
  outline: 2px solid var(--pm-brand);
  outline-offset: 2px;
}

/* 안쪽 점 — 기본 size-2 → 8px 흰 점 */
.wrap :global([data-slot="radio-group-indicator"]) > span {
  width: 8px;
  height: 8px;
  background: #fff;
}

/* ── 카드 한 장 (= Label) ────────────────────────────────── */
.option {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1.5px solid var(--pm-line);
  border-radius: 14px;
  background: var(--pm-card);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}
.option:hover {
  border-color: var(--pm-brand);
}
/* 선택된 카드 — Label 에는 선택 상태가 자동으로 오지 않으므로
   .tsx 에서 계산해 .optionOn 을 붙인다. */
.optionOn {
  border-color: var(--pm-brand);
  background: var(--pm-brand-soft);
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}
/* Label 이 감싸는 구조라 peer-disabled: 가 닿지 않는다 → 직접 처리 */
.optionDisabled {
  cursor: not-allowed;
  background: var(--pm-disabled);
  border-color: var(--pm-line);
}
.optionDisabled .optionTitle,
.optionDisabled .optionDesc {
  color: var(--pm-disabled-text);
}

/* ── 카드 내부 레이아웃 / 하단 요약 ─────────────────────── */
.optionBody {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.optionIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--pm-body-bg);
  color: var(--pm-sub);
}
.optionOn .optionIcon {
  background: var(--pm-brand);
  color: #fff;
}
/* … .sheet / .head / .summary 등 순수 장식 스타일 생략 */

@media (max-width: 520px) {
  .option {
    gap: 10px;
    padding: 13px;
  }
}
```

</details>

### 2. 만족도 설문 (세그먼트형)

바로 위 결제수단 예제와 **똑같은** RadioGroup인데, `*.module.css`만 달리해서 라디오 동그라미가 아예 없는 가로 세그먼트가 되었습니다. 키보드 ←/→ 이동도 그대로 동작합니다.

<img
  src="../assets/ui/radio-group-real-survey.png"
  alt="만족도 설문 (세그먼트형)"
  width="100%"
/>

**포인트**

- 라디오 원형은 `clip-path`로 **시각적으로만** 감췄습니다. DOM에는 남아 있어 키보드·스크린리더가 정상 동작합니다. ([4. 라디오 원형 숨기기](#4-라디오-원형-숨기기-세그먼트칩-형태))
- 포커스 링은 감싸는 `Label`의 `:focus-within`이 대신 그립니다.
- 루트의 기본 `grid`를 `flex`로 덮어 가로 트랙을 만들었습니다.
- 그룹 전체 이름은 루트의 `aria-label="상담 서비스 만족도"`로 제공합니다.

<details>
<summary><b>SurveyRatingRadioGroup.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/radiogroup/SurveyRatingRadioGroup.tsx"
import { useId, useState } from "react";
import { RadioGroup, RadioGroupItem, Label } from "@axiom/components/ui";
import styles from "./SurveyRatingRadioGroup.module.css";

const SCORES = [
  { value: "1", emoji: "😡", label: "매우 불만" },
  { value: "2", emoji: "🙁", label: "불만" },
  { value: "3", emoji: "😐", label: "보통" },
  { value: "4", emoji: "🙂", label: "만족" },
  { value: "5", emoji: "😍", label: "매우 만족" },
];

export default function SurveyRatingRadioGroup(): React.ReactNode {
  const uid = useId();
  const [score, setScore] = useState<string>("");
  const picked = SCORES.find((s) => s.value === score);

  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        <div className={styles.question}>
          이번 상담 서비스에 얼마나 만족하셨나요?
        </div>
        <p className={styles.hint}>
          1(매우 불만) ~ 5(매우 만족) 중 하나를 선택해 주세요. 키보드 ←/→ 로도
          이동할 수 있습니다.
        </p>

        <RadioGroup
          value={score}
          onValueChange={setScore}
          // highlight-next-line
          aria-label="상담 서비스 만족도"
        >
          {SCORES.map((s) => {
            const id = `${uid}-${s.value}`;
            return (
              <Label
                key={s.value}
                htmlFor={id}
                className={`${styles.seg} ${score === s.value ? styles.segOn : ""}`}
              >
                {/* 화면에서는 감춰지지만 DOM·포커스는 살아 있다 */}
                <RadioGroupItem id={id} value={s.value} />
                <span className={styles.segEmoji}>{s.emoji}</span>
                <span className={styles.segLabel}>{s.label}</span>
              </Label>
            );
          })}
        </RadioGroup>

        <div className={styles.result}>
          선택한 점수:{" "}
          <span className={styles.resultValue}>
            {picked
              ? `${picked.value}점 — ${picked.label}`
              : "아직 선택하지 않음"}
          </span>
        </div>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>SurveyRatingRadioGroup.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/radiogroup/SurveyRatingRadioGroup.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 앰버 설문 UI */
  --sv-brand: #f59e0b;
  --sv-brand-deep: #d97706;
  --sv-brand-soft: #fff7e8;
  --sv-ink: #3a2c12;
  --sv-sub: #7a6644;
  --sv-card: #ffffff;
  --sv-border: #ece3d3;
  --sv-track: #f6f2ea;

  color: var(--sv-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --sv-brand: #fbbf24;
  --sv-ink: #f6ecd9;
  --sv-card: #1a1710;
  --sv-track: #221d13;
  /* … 이하 동일 패턴 */
}

/* ── 그룹: 기본 grid → 가로 세그먼트 트랙 ─────────────────── */
.wrap :global([data-slot="radio-group"]) {
  display: flex;
  gap: 6px;
  padding: 6px;
  border-radius: 14px;
  background: var(--sv-track);
}

/* ── 라디오 원형은 시각적으로만 숨김(포커스는 유지) ────────── */
/* highlight-start */
.wrap :global([data-slot="radio-group-item"]) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}
/* highlight-end */

/* ── 세그먼트 한 칸 (= Label) ──────────────────────────── */
.seg {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 6px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--sv-sub);
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.12s ease;
}
.seg:hover {
  background: var(--sv-brand-soft);
}
/* 원형을 감췄으므로 포커스 링은 Label 이 대신 그린다 */
/* highlight-next-line */
.seg:focus-within {
  outline: 2px solid var(--sv-brand);
  outline-offset: 2px;
}
.segOn {
  background: var(--sv-brand);
  color: #fff;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.28);
  transform: translateY(-1px);
}

.segEmoji {
  font-size: 22px;
  line-height: 1;
}
.segLabel {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
/* … .sheet / .question / .hint / .result 등 순수 장식 스타일 생략 */
```

</details>

:::tip 두 예제를 비교해 보세요
같은 RadioGroup으로 [결제수단 카드](#1-결제수단-선택-카드형)(틸·원형 유지·세로)와 [만족도 세그먼트](#2-만족도-설문-세그먼트형)(앰버·원형 제거·가로)가 나옵니다. **컴포넌트는 손대지 않고** ①루트/항목 `className` ②`data-slot` 오버라이드 ③`Label` 안에 넣는 **내 마크업** 세 가지만 바꾼 결과입니다.
:::

---
