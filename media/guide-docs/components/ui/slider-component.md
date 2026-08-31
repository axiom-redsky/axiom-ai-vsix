---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Slider"
hide_table_of_contents: false
---

# Slider 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 슬라이더 컴포넌트입니다.  
트랙 위의 **손잡이(thumb)를 끌어서 숫자 값을 고르는** 입력에 사용합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Slider`(`/example/ui-components/slider`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 볼륨·밝기·투명도처럼 **정확한 숫자보다 "감"이 중요한** 연속 값 조절
- 가격대·기간처럼 **범위(최소~최대)를 한 번에** 고르는 필터
- 값의 **크기가 시각적으로 드러나야** 하는 설정 화면

:::caution Slider와 숫자 입력, 무엇을 쓸까

- **Slider** — 값의 **대략적인 크기**가 중요할 때. 조절하면서 결과가 바로 보이는 경우(볼륨, 밝기).
- **숫자 Input** — **정확한 값**을 입력해야 할 때(금액, 수량, 나이).
- 둘 다 필요하면 **나란히 두고 같은 state를 공유**시키세요. 슬라이더로 대충 맞추고 Input으로 미세 조정하는 조합이 실무에서 가장 무난합니다.
  :::

:::tip 퍼블리셔 참고
Slider는 실제 SI 프로젝트에서 디자인 교체가 가장 잦은 컴포넌트입니다(트랙 두께, 손잡이 크기·색, 채움 그라데이션 등). 컴포넌트 **본체(`slider.tsx`)를 복사해서 고치지 말고**, 노출된 `data-slot` 선택자(`slider-track` · `slider-range` · `slider-thumb`)만 오버라이드하세요. 방법은 [스타일링 & 테마](#스타일링--테마)에 있습니다.
:::

---

## Import

---

```tsx
import { Slider } from "@axiom/components/ui";
```

합성(compound) 컴포넌트가 아니라 **단일 컴포넌트**입니다. 트랙·채움·손잡이는 컴포넌트가 내부에서 알아서 그리므로, 사용하는 쪽에서 조립할 파트가 없습니다.

---

## 기본 사용법

---

`defaultValue`로 초기 위치만 지정하면 됩니다. **값은 항상 배열**이고, 배열 길이만큼 손잡이가 생깁니다.

<img
  src="../assets/ui/slider-basic.png"
  alt="단일 손잡이 슬라이더"
  width="80%"
/>

```tsx
{
  /* 단일 손잡이 — 원소 1개짜리 배열 */
}
<Slider defaultValue={[40]} max={100} step={1} />;
```

<img
  src="../assets/ui/slider-basic2.png"
  alt="범위(range) 슬라이더"
  width="80%"
/>

```tsx
{
  /* 범위(range) — 원소 2개면 손잡이가 2개 */
}
<Slider defaultValue={[25, 75]} max={100} step={1} />;
```

:::caution `value`도 `defaultValue`도 없으면 **손잡이가 사라집니다**
`<Slider />`처럼 값을 하나도 주지 않으면 Radix 내부 값이 빈 배열(`[]`)이 되고, 값이 없는 손잡이는 `display: none` 처리됩니다. 결과적으로 **회색 레일만 남고 채움·손잡이가 없는** 조작 불가능한 상태가 됩니다.

**비제어면 `defaultValue`, 제어면 `value`를 반드시 넘기세요.**

```tsx
<Slider />                       {/* ❌ 화면에 아무것도 안 보임 */}
<Slider defaultValue={[40]} />   {/* ✅ 비제어 */}
<Slider value={v} onValueChange={setV} /> {/* ✅ 제어 */}
```

:::

---

## 구성 (Anatomy)

---

Slider는 **Radix Slider** 위에 얇게 감싼 래퍼 하나입니다. 실제 구현은 아래와 같습니다.

```tsx title="src/shared/lib/shadcn/ui/slider.tsx"
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  // 손잡이를 몇 개 그릴지 결정하는 값. value → defaultValue → [min, max] 순으로 본다.
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root data-slot="slider" /* … */>
      <SliderPrimitive.Track data-slot="slider-track">
        <SliderPrimitive.Range data-slot="slider-range" />
      </SliderPrimitive.Track>

      {/* 배열 길이만큼 손잡이를 반복 렌더 */}
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb data-slot="slider-thumb" key={index} />
      ))}
    </SliderPrimitive.Root>
  );
}
```

렌더 결과는 아래 4개 요소입니다. **사용하는 쪽에서 조립하지 않지만, 스타일은 이 구조를 겨냥해서 넣습니다.**

| 요소                         | 역할                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `[data-slot="slider"]`       | 루트. `className`과 나머지 prop이 여기로 전달됩니다                           |
| `[data-slot="slider-track"]` | 배경 레일 (전체 범위)                                                         |
| `[data-slot="slider-range"]` | 선택된 구간의 채움. Track 안에 `absolute`로 놓입니다                          |
| `[data-slot="slider-thumb"]` | 손잡이. `role="slider"`를 가진 **실제 포커스 대상**이며 값 배열 길이만큼 반복 |

:::note 손잡이 개수는 "배열 길이"가 정합니다
`_values`는 오직 **손잡이를 몇 개 그릴지** 계산하는 데만 쓰입니다. 실제 값은 Radix Root가 관리하므로, 손잡이 개수와 값 개수가 어긋나면(예: `value={[10]}`인데 이전 렌더에서 2개였던 경우) 값이 없는 손잡이는 숨겨집니다.
:::

---

## 동작 옵션

---

### 1. 값은 항상 배열 — `value` / `defaultValue`

`number` 하나가 아니라 `number[]`입니다. **배열 길이 = 손잡이 개수**입니다.

```tsx
<Slider defaultValue={[40]} />       {/* 손잡이 1개 */}
<Slider defaultValue={[25, 75]} />   {/* 손잡이 2개 = range */}
<Slider defaultValue={[20, 50, 80]} /> {/* 손잡이 3개도 가능 */}
```

`onValueChange`로 넘어오는 값도 **같은 형태의 배열**입니다.

```tsx
const [volume, setVolume] = useState<number[]>([40]);

<Slider value={volume} onValueChange={setVolume} max={100} />;
{
  /* 화면에 표시할 땐 volume[0] */
}
```

### 2. 범위와 간격 — `min` · `max` · `step`

<img
  src="../assets/ui/slider-step.png"
  alt="step 비교"
  width="80%"
/>

```tsx
<Slider defaultValue={[50]} min={0} max={100} step={1} />   {/* 기본 */}
<Slider defaultValue={[50]} min={0} max={100} step={10} />  {/* 10단위로 뚝뚝 끊김 */}
<Slider defaultValue={[300000]} min={0} max={1000000} step={10000} /> {/* 금액 */}
```

- `min`·`max`는 컴포넌트 기본값이 **0 / 100**입니다. 넘기지 않아도 동작합니다.
- `step`은 키보드 조작 단위이기도 합니다(→ [접근성 / 키보드](#접근성--키보드)).
- 금액처럼 자릿수가 큰 값은 `step`을 크게 잡으세요. `step={1}`로 100만 원을 다루면 키보드로 값을 맞출 수 없습니다.

### 3. 범위 선택 — 손잡이 2개 + `minStepsBetweenThumbs`

```tsx
<Slider defaultValue={[25, 75]} max={100} step={1} minStepsBetweenThumbs={1} />
```

겉모습은 [기본 사용법](#기본-사용법)의 range 캡쳐와 같습니다. 달라지는 것은 **두 손잡이의 최소 간격**뿐입니다.

- `minStepsBetweenThumbs`는 **두 손잡이 사이의 최소 간격**을 `step` 단위로 강제합니다. 지정하지 않으면 두 손잡이가 같은 값까지 겹칠 수 있습니다.
- 두 손잡이가 겹친 상태에서는 어느 쪽을 잡았는지 구분하기 어려우므로, 범위 필터에는 **`minStepsBetweenThumbs={1}`을 기본으로** 두는 편이 좋습니다.
- 트랙의 빈 곳을 클릭하면 **더 가까운 쪽 손잡이**가 그 위치로 이동합니다(Radix 기본 동작).

### 4. 제어 / 비제어 — `onValueChange` vs `onValueCommit`

| 콜백            | 호출 시점                    | 쓰는 곳                              |
| --------------- | ---------------------------- | ------------------------------------ |
| `onValueChange` | 드래그하는 **내내** 계속     | 화면 미리보기(밝기·볼륨 실시간 반영) |
| `onValueCommit` | 드래그를 **놓는 순간 한 번** | 서버 저장, API 조회, URL 쿼리 갱신   |

```tsx
const [price, setPrice] = useState<number[]>([100000, 400000]);

<Slider
  value={price}
  onValueChange={setPrice} // 끌 때마다 → 라벨만 갱신 (가벼운 작업)
  onValueCommit={(v) => fetchProducts(v)} // 놓을 때 한 번 → 실제 조회
  min={0}
  max={500000}
  step={10000}
  minStepsBetweenThumbs={1}
/>;
```

:::caution `onValueChange`에서 API를 호출하지 마세요
드래그 한 번에 콜백이 수십 번 호출됩니다. **무거운 작업은 반드시 `onValueCommit`** 으로 옮기세요. 디바운스를 직접 걸 필요 없이 이 prop이 그 역할을 합니다.
:::

`value`를 넘기면 **제어 모드**가 되므로, `onValueChange`로 상태를 갱신하지 않으면 손잡이가 움직이지 않습니다.

### 5. 비활성화 — `disabled`

```tsx
<Slider defaultValue={[50]} max={100} disabled />
```

- 루트에 `data-disabled`가 붙고 `opacity-50`이 적용되며, 손잡이가 **탭 순서에서 빠집니다**(`tabIndex` 제거).
- 값만 보여주고 조작은 막고 싶을 때 씁니다. 다만 슬라이더는 "조작하는 물건"으로 보이므로, **읽기 전용 표시라면 [Progress](./progress-component)** 가 더 맞습니다.

### 6. 방향 — `orientation`

```tsx
<Slider defaultValue={[40]} orientation="vertical" />
```

세로 모드에 필요한 스타일은 컴포넌트가 이미 갖고 있습니다. `orientation="vertical"`만 넘기면 루트가 `flex-col`로 바뀌고 **최소 높이 `min-h-40`(10rem)** 이 잡히며, 트랙이 세로 레일(`w-1`)로 전환됩니다.

```tsx
{
  /* 더 길게 쓰고 싶으면 높이만 덮어쓰면 된다 */
}
<div className="flex h-64 gap-6">
  <Slider defaultValue={[70]} orientation="vertical" />
  <Slider defaultValue={[40]} orientation="vertical" />
</div>;
```

:::note 세로 슬라이더는 부모가 높이를 정해야 합니다
루트에 `data-vertical:h-full`이 걸려 있어 **부모의 높이를 따라갑니다.** 부모에 높이가 없으면 `min-h-40`(10rem)으로 떨어집니다. 원하는 길이는 부모(또는 `className="h-64"`)로 지정하세요.
:::

### 7. 방향 반전 — `inverted` / `dir`

```tsx
<Slider defaultValue={[30]} inverted />        {/* 채움이 오른쪽에서 시작 */}
<Slider defaultValue={[30]} dir="rtl" />       {/* RTL 문서 방향 */}
```

- `inverted`는 **채움이 자라는 방향**을 뒤집습니다(오른쪽→왼쪽, 아래→위). 값의 의미가 역방향인 지표에 씁니다.
- `dir`은 문서 방향이라 국내 SI에서는 거의 쓸 일이 없습니다.

### 8. 폼 전송 — `name` / `form`

`name`을 주면 손잡이마다 **hidden input**이 함께 렌더되어 일반 `<form>` 전송에 실립니다.

```tsx
<form action="/search">
  <Slider
    name="price"
    defaultValue={[100000, 400000]}
    max={500000}
    step={10000}
  />
</form>
```

- 손잡이가 1개면 `price`, **2개 이상이면 `price[]`** 로 전송됩니다.
- react-hook-form 등 상태 기반 폼을 쓴다면 `name` 대신 `value`/`onValueChange`로 연결하세요.

---

## API 레퍼런스

---

### Props

Radix Slider Root의 prop을 그대로 받습니다. 자주 쓰는 것만 정리합니다.

| Prop                    | 타입                           | 기본값         | 설명                                                      |
| ----------------------- | ------------------------------ | -------------- | --------------------------------------------------------- |
| `defaultValue`          | `number[]`                     | —              | 초기 값(비제어). **배열 길이 = 손잡이 개수**              |
| `value`                 | `number[]`                     | —              | 현재 값(제어). `onValueChange`와 함께 사용                |
| `onValueChange`         | `(value: number[]) => void`    | —              | 값이 바뀔 때마다 호출(드래그 중 계속)                     |
| `onValueCommit`         | `(value: number[]) => void`    | —              | 드래그를 놓는 순간 한 번 호출. **무거운 작업은 여기에**   |
| `min`                   | `number`                       | `0`            | 최소값 (래퍼가 지정하는 기본값)                           |
| `max`                   | `number`                       | `100`          | 최대값 (래퍼가 지정하는 기본값)                           |
| `step`                  | `number`                       | `1`            | 이동 간격. 키보드 조작 단위이기도 함                      |
| `minStepsBetweenThumbs` | `number`                       | `0`            | 손잡이 사이 최소 간격(step 단위)                          |
| `orientation`           | `'horizontal' \| 'vertical'`   | `'horizontal'` | 방향. 세로는 부모 높이를 따름                             |
| `inverted`              | `boolean`                      | `false`        | 채움 방향 반전                                            |
| `dir`                   | `'ltr' \| 'rtl'`               | `'ltr'`        | 문서 방향                                                 |
| `disabled`              | `boolean`                      | `false`        | 비활성화. 손잡이가 탭 순서에서 빠짐                       |
| `name`                  | `string`                       | —              | 폼 전송용 hidden input 이름(손잡이 2개 이상이면 `name[]`) |
| `form`                  | `string`                       | —              | 폼 밖에 있을 때 연결할 `<form>`의 id                      |
| `className`             | `string`                       | —              | **루트에만** 적용. 트랙·손잡이는 `data-slot`으로 겨냥     |
| `...props`              | `React.ComponentProps<'span'>` | —              | `style`, `aria-*`, `data-*` 등 표준 속성                  |

:::note `className`은 루트에만 붙습니다
Track·Range·Thumb는 별도의 `className` prop이 없습니다. 이 셋을 건드리려면 **자손 선택자**를 써야 합니다(→ [스타일링 & 테마](#스타일링--테마)).
:::

### 자동으로 붙는 속성

| 속성               | 붙는 곳              | 값                                                          | 용도                       |
| ------------------ | -------------------- | ----------------------------------------------------------- | -------------------------- |
| `data-slot`        | 4개 요소 전부        | `slider` / `slider-track` / `slider-range` / `slider-thumb` | 스타일 오버라이드용 선택자 |
| `data-orientation` | 루트 · 트랙 · 손잡이 | `"horizontal"` \| `"vertical"`                              | 방향별 스타일 분기         |
| `data-disabled`    | 루트 · 손잡이        | `""` (비활성 시에만)                                        | 비활성 스타일 분기         |
| `role`             | 손잡이               | `"slider"`                                                  | 접근성 역할                |
| `aria-valuenow`    | 손잡이               | 현재 값                                                     | 보조기기에 값 전달         |

:::note DOM에는 `data-horizontal`이라는 속성이 없습니다
`slider.tsx`가 쓰는 `data-horizontal:` · `data-vertical:` · `data-disabled:` 는 **Tailwind variant 이름**이지 DOM 속성이 아닙니다. `shadcn/tailwind.css`(app.css가 import)가 이 셋을 `@custom-variant`로 등록해 두었고, 실제로는 아래로 컴파일됩니다.

| Tailwind variant   | 실제 선택자                                                                            |
| ------------------ | -------------------------------------------------------------------------------------- |
| `data-horizontal:` | `:where([data-orientation="horizontal"])`                                              |
| `data-vertical:`   | `:where([data-orientation="vertical"])`                                                |
| `data-disabled:`   | `:where([data-disabled="true"]), :where([data-disabled]:not([data-disabled="false"]))` |

**CSS Module에서 직접 선택자를 쓸 때는 variant 이름이 아니라 실제 속성**(`[data-orientation='vertical']`)을 써야 합니다.
:::

---

## 접근성 / 키보드

---

Radix 기반이라 키보드 조작과 ARIA 속성이 기본 내장되어 있습니다. **포커스를 받는 것은 손잡이**(`role="slider"`)입니다.

| 키               | 동작                             |
| ---------------- | -------------------------------- |
| `Tab`            | 손잡이로 포커스 이동(손잡이마다) |
| `←` `↓`          | `step`만큼 감소                  |
| `→` `↑`          | `step`만큼 증가                  |
| `Shift` + 화살표 | **`step × 10`** 만큼 이동        |
| `PageDown`       | `step × 10` 감소                 |
| `PageUp`         | `step × 10` 증가                 |
| `Home`           | `min`으로 이동                   |
| `End`            | `max`로 이동                     |

- 키보드 조작은 **매번 `onValueCommit`도 함께 호출**됩니다(드래그와 달리 한 번의 조작이 곧 확정이므로).
- `disabled`면 손잡이의 `tabIndex`가 제거되어 탭 순서에서 빠집니다.

### 손잡이에 이름 붙이기

손잡이의 기본 `aria-label`은 Radix가 자동으로 정하는데, 규칙이 아래와 같습니다.

| 손잡이 개수 | 자동 `aria-label`                |
| ----------- | -------------------------------- |
| 1개         | **없음**                         |
| 2개         | `"Minimum"` / `"Maximum"` (영문) |
| 3개 이상    | `"Value 1 of 3"` … (영문)        |

:::caution `<Slider aria-label="…">`은 손잡이까지 내려가지 않습니다
래퍼가 `...props`를 **루트**에 전달하므로, `aria-label`은 `role`이 없는 루트 `<span>`에 붙고 보조기기는 이를 읽지 않습니다. 스크린리더가 읽는 것은 포커스된 **손잡이**입니다.

현재 래퍼에는 손잡이별 라벨을 넘길 통로가 없으므로, 실무에서는 아래 중 하나로 처리하세요.

1. **눈에 보이는 라벨과 값**을 슬라이더 바로 옆에 두기 (아래 [실전 예제](#실전-예제)의 방식)
2. 라벨링이 꼭 필요하면 `slider.tsx`에 손잡이용 라벨 prop을 추가 — 예: `thumbLabels?: string[]`를 받아 `<SliderPrimitive.Thumb aria-label={thumbLabels?.[index]} />`로 전달

```tsx
{/* 지금 당장은 이렇게 — 값이 화면에 보이면 스크린리더 사용자도 맥락을 잡을 수 있다 */}
<div className="flex justify-between text-xs">
  <span id="volume-label">볼륨</span>
  <span aria-live="polite">{volume[0]}</span>
</div>
<Slider value={volume} onValueChange={setVolume} max={100} />
```

:::

---

## 스타일링 & 테마

---

**바꾸려는 대상에 따라 방법이 다릅니다.** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                      | 방법                                                 |
| -------------------------------- | ---------------------------------------------------- |
| 루트의 폭·여백                   | **`className`** (`w-64`, `mx-2` …)                   |
| 트랙 두께 · 채움색 · 손잡이 크기 | **Tailwind arbitrary variant** (`[&_[data-slot=…]]`) |
| 앱 전체 톤                       | **디자인 토큰** (`--muted`, `--primary`, `--ring`)   |
| 화면 단위 전면 교체              | **`data-slot` 선택자 + CSS Module**                  |

### 1. `data-slot` 목록

| data-slot                    | 대상                              |
| ---------------------------- | --------------------------------- |
| `[data-slot="slider"]`       | 루트 (`className`이 직접 닿는 곳) |
| `[data-slot="slider-track"]` | 배경 레일                         |
| `[data-slot="slider-range"]` | 선택 구간 채움                    |
| `[data-slot="slider-thumb"]` | 손잡이                            |

### 2. 색은 디자인 토큰으로

기본값은 트랙 `bg-muted`, 채움 `bg-primary`, 손잡이 테두리·포커스링 `border-ring` / `ring-ring`입니다. **앱 전체의 슬라이더 색**을 바꾸려면 토큰을 조정하세요. 슬라이더 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다.

한 화면에서만 다르게 쓸 거라면 토큰을 건드리지 말고 아래 3·4번으로 끝내세요.

### 3. 한 인스턴스만 — Tailwind arbitrary variant

Track·Range·Thumb는 루트의 **자손**이므로 자손 결합자(`[&_…]`, 언더스코어 = 공백)를 씁니다.

<img
  src="../assets/ui/slider-custom.png"
  alt="Slider 커스텀 스타일"
  width="80%"
/>

```tsx
{
  /* 채움색(emerald) + 굵은 트랙 + 큰 초록 손잡이 */
}
<Slider
  defaultValue={[60]}
  max={100}
  className="[&_[data-slot=slider-track]]:h-2
             [&_[data-slot=slider-track]]:bg-emerald-100
             [&_[data-slot=slider-range]]:bg-emerald-500
             [&_[data-slot=slider-thumb]]:size-5
             [&_[data-slot=slider-thumb]]:border-2
             [&_[data-slot=slider-thumb]]:border-emerald-500"
/>;

{
  /* 그라데이션 채움 */
}
<Slider
  defaultValue={[70]}
  max={100}
  className="[&_[data-slot=slider-track]]:h-2
             [&_[data-slot=slider-range]]:bg-gradient-to-r
             [&_[data-slot=slider-range]]:from-violet-500
             [&_[data-slot=slider-range]]:to-fuchsia-500
             [&_[data-slot=slider-thumb]]:border-fuchsia-500"
/>;
```

- 채움(`slider-range`)의 **높이는 컴포넌트가 이미 `h-full`로 잡아 두었으므로** 트랙 두께만 바꾸면 채움도 따라옵니다. 색만 지정하세요.
- scaffold 예제 화면(`SliderComponent.tsx`)의 **4번 섹션**이 정확히 이 코드를 씁니다.
- 다크 모드까지 고려한다면 트랙 배경에 `dark:` 를 함께 주세요 — 예: `dark:[&_[data-slot=slider-track]]:bg-emerald-950/40`.

### 4. 화면 단위 전면 교체 — `data-slot` + CSS Module

색·크기가 클래스로 감당 안 될 만큼 복잡하면 CSS Module에서 같은 선택자를 씁니다.

```css title="예: MySlider.module.css"
.slider :global([data-slot="slider-track"]) {
  height: 6px;
  background: var(--pr-track);
  border-radius: 999px;
}
.slider :global([data-slot="slider-range"]) {
  background: linear-gradient(90deg, var(--pr-accent), var(--pr-accent-strong));
}
.slider :global([data-slot="slider-thumb"]) {
  width: 20px;
  height: 20px;
  border: 3px solid var(--pr-accent);
  box-shadow: 0 2px 6px rgb(79 70 229 / 0.35);
}
.slider :global([data-slot="slider-thumb"]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pr-accent) 30%, transparent);
}
```

```tsx
<Slider className={styles.slider} defaultValue={[40]} max={100} />
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.slider :global([data-slot='slider-track'])`처럼 **내 클래스 + 슬롯을 겹쳐** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 5. 방향별로 다르게 칠하기

CSS Module에서는 Tailwind variant 이름 대신 **실제 속성**(`data-orientation`)을 씁니다.

```css
/* 가로일 때만 두꺼운 트랙 */
.slider :global([data-slot="slider-track"][data-orientation="horizontal"]) {
  height: 8px;
}
/* 세로일 때는 폭으로 */
.slider :global([data-slot="slider-track"][data-orientation="vertical"]) {
  width: 8px;
}
/* 비활성 상태 */
.slider :global([data-slot="slider-thumb"][data-disabled]) {
  border-color: var(--muted-foreground);
  box-shadow: none;
}
```

---

## 실전 예제

---

제공 `Slider`를 **그대로 쓰되**, `*.module.css`의 `data-slot` 선택자로 트랙·채움·손잡이를 전부 다시 칠한 예제입니다. scaffold `UI Components > Slider` 화면 하단에서 직접 드래그해 볼 수 있습니다.

### 1. 가격 범위 필터

쇼핑몰에서 흔한 range 슬라이더입니다. 슬라이더 위에 가격대별 재고 히스토그램을 겹쳐 **선택 구간만 강조**했습니다.

<img
  src="../assets/ui/slider-real-price.png"
  alt="slider 가격 범위 필터 실전 예제"
  width="100%"
/>

**포인트**

- 제공 `Slider`를 **그대로** 쓰고(`value` / `onValueChange` / `minStepsBetweenThumbs`), 동작·접근성은 컴포넌트에 맡깁니다.
- 히스토그램은 슬라이더와 **완전히 별개인 내 마크업**입니다. 선택 구간에 드는 막대만 `data-active`로 강조합니다.
- 겉모습은 전부 `*.module.css`의 `data-slot` 선택자로 오버라이드했습니다.

<details>
<summary><b>PriceRangeFilter.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/slider/PriceRangeFilter.tsx"
import { useState } from "react";
import { Slider } from "@axiom/components/ui";
import styles from "./PriceRangeFilter.module.css";

/** 상품 가격대별 재고 수(막대그래프용 더미 히스토그램). 0 ~ 50만원을 20구간으로 나눈 값. */
const HISTOGRAM = [
  4, 9, 15, 22, 31, 42, 55, 63, 58, 47, 39, 33, 28, 21, 17, 12, 9, 6, 4, 2,
];

const MIN = 0;
const MAX = 500_000;
const STEP = 10_000;

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function PriceRangeFilter(): React.ReactNode {
  const [range, setRange] = useState<[number, number]>([120_000, 340_000]);
  const [lo, hi] = range;

  // 히스토그램 각 막대가 선택 구간 안에 드는지 판단한다.
  const bucket = (MAX - MIN) / HISTOGRAM.length;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>가격</span>
        <span className={styles.value}>
          {won(lo)} <span className={styles.tilde}>–</span> {won(hi)}
        </span>
      </div>

      {/* 히스토그램 — 선택 구간만 진하게 */}
      <div className={styles.histogram}>
        {HISTOGRAM.map((h, i) => {
          const bucketStart = MIN + i * bucket;
          const active = bucketStart >= lo - bucket && bucketStart <= hi;
          return (
            <span
              key={i}
              className={styles.bar}
              data-active={active}
              style={{ height: `${(h / 63) * 100}%` }}
            />
          );
        })}
      </div>

      {/* highlight-start */}
      <Slider
        className={styles.slider}
        min={MIN}
        max={MAX}
        step={STEP}
        value={range}
        onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
        minStepsBetweenThumbs={1}
        aria-label="가격 범위"
      />
      {/* highlight-end */}

      <div className={styles.scale}>
        <span>{won(MIN)}</span>
        <span>{won(MAX)}</span>
      </div>

      <button
        type="button"
        className={styles.reset}
        onClick={() => setRange([MIN, MAX])}
      >
        가격 초기화
      </button>
    </div>
  );
}
```

</details>

<details>
<summary><b>PriceRangeFilter.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/slider/PriceRangeFilter.module.css"
.card {
  /* 이 예제 전용 색 토큰 */
  --pr-accent: #6366f1;
  --pr-accent-strong: #4f46e5;
  --pr-track: #eef2f7;
  --pr-bar: #dbe2ea;
  --pr-bar-active: #c7cdfa;
  --pr-ink: #0f172a;
  --pr-sub: #64748b;
  --pr-card: #ffffff;
  --pr-border: #e2e8f0;

  width: 100%;
  padding: 20px;
  border-radius: 16px;
  background: var(--pr-card);
  border: 1px solid var(--pr-border);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --pr-accent: #818cf8;
  --pr-track: #1e293b;
  --pr-card: #0f172a;
  /* … 이하 동일 패턴 */
}

/* ── 히스토그램 (슬라이더 위 재고 분포) ───────────────────── */
.histogram {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 48px;
  margin-bottom: 6px;
  padding: 0 6px;
}
.bar {
  flex: 1;
  min-height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--pr-bar);
  opacity: 0.7;
}
.bar[data-active="true"] {
  background: var(--pr-bar-active);
  opacity: 1;
}

/* =========================================================================
 * scaffold Slider 슬롯 오버라이드
 * (내 클래스 .slider + [data-slot] 2단계로 Tailwind 유틸리티보다 명시도 확보)
 * ========================================================================= */
/* highlight-start */
.slider :global([data-slot="slider-track"]) {
  height: 6px;
  background: var(--pr-track);
  border-radius: 999px;
}
.slider :global([data-slot="slider-range"]) {
  background: linear-gradient(90deg, var(--pr-accent), var(--pr-accent-strong));
}
.slider :global([data-slot="slider-thumb"]) {
  width: 20px;
  height: 20px;
  background: #ffffff;
  border: 3px solid var(--pr-accent);
  box-shadow: 0 2px 6px rgb(79 70 229 / 0.35);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}
.slider :global([data-slot="slider-thumb"]):hover {
  transform: scale(1.12);
}
.slider :global([data-slot="slider-thumb"]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pr-accent) 30%, transparent);
}
/* highlight-end */

/* … 눈금(.scale) / 초기화 버튼(.reset) 스타일 생략 */
```

</details>

### 2. 디스플레이 & 사운드 설정

같은 `Slider`를 여러 줄 쌓고, 각 행의 `data-tone`을 `module.css`의 `data-slot` 선택자와 조합해 **행마다 다른 색**으로 칠했습니다.

<img
  src="../assets/ui/slider-real-media.png"
  alt="slider 미디어 설정 실전 예제"
  width="100%"
/>

**포인트**

- 행마다 `data-tone`을 부여하고 CSS에서 `--tone` 변수 하나만 바꿉니다. **슬라이더 4개가 같은 CSS를 공유**합니다.
- 값 배지·아이콘은 슬라이더 밖의 내 마크업입니다. 볼륨이 0이면 아이콘이 `VolumeX`로 바뀝니다.
- 라벨과 현재 값이 **항상 눈에 보이므로**, 손잡이 `aria-label`이 없는 [현재 제약](#접근성--키보드)을 실무적으로 보완합니다.

<details>
<summary><b>MediaSettingsCard.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/slider/MediaSettingsCard.tsx"
import { useState } from "react";
import { Slider } from "@axiom/components/ui";
import { Volume2, VolumeX, Sun, Contrast, Thermometer } from "lucide-react";
import styles from "./MediaSettingsCard.module.css";

interface SettingRow {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** 트랙/thumb 색을 결정하는 톤. module.css 의 data-tone 선택자와 매칭된다. */
  tone: "blue" | "amber" | "violet" | "rose";
  min?: number;
  max?: number;
  step?: number;
}

const ROWS: SettingRow[] = [
  { key: "volume", label: "볼륨", icon: <Volume2 />, tone: "blue" },
  { key: "brightness", label: "밝기", icon: <Sun />, tone: "amber" },
  { key: "contrast", label: "대비", icon: <Contrast />, tone: "violet" },
  { key: "warmth", label: "색온도", icon: <Thermometer />, tone: "rose" },
];

export default function MediaSettingsCard(): React.ReactNode {
  const [values, setValues] = useState<Record<string, number>>({
    volume: 65,
    brightness: 80,
    contrast: 45,
    warmth: 30,
  });

  return (
    <div className={styles.card}>
      <p className={styles.title}>디스플레이 &amp; 사운드</p>

      <div className={styles.rows}>
        {ROWS.map((row) => {
          const v = values[row.key];
          const muted = row.key === "volume" && v === 0;
          return (
            // highlight-next-line
            <div key={row.key} className={styles.row} data-tone={row.tone}>
              <span className={styles.icon}>
                {muted ? <VolumeX /> : row.icon}
              </span>
              <div className={styles.body}>
                <div className={styles.rowHead}>
                  <span className={styles.label}>{row.label}</span>
                  <span className={styles.badge}>{v}</span>
                </div>
                {/* highlight-start */}
                <Slider
                  className={styles.slider}
                  min={row.min ?? 0}
                  max={row.max ?? 100}
                  step={row.step ?? 1}
                  value={[v]}
                  onValueChange={([nv]) =>
                    setValues((prev) => ({ ...prev, [row.key]: nv }))
                  }
                  aria-label={row.label}
                />
                {/* highlight-end */}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>MediaSettingsCard.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/slider/MediaSettingsCard.module.css"
.card {
  --ms-track: #eef2f7;
  --ms-ink: #0f172a;
  --ms-sub: #64748b;
  --ms-card: #ffffff;
  --ms-border: #e2e8f0;

  width: 100%;
  padding: 20px;
  border-radius: 16px;
  background: var(--ms-card);
  border: 1px solid var(--ms-border);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --ms-track: #1e293b;
  --ms-ink: #e2e8f0;
  --ms-card: #0f172a;
  /* … 이하 동일 패턴 */
}

/* ── 톤 팔레트 (행별) — 여기서 --tone 하나만 갈아끼운다 ────── */
/* highlight-start */
.row[data-tone="blue"] {
  --tone: #3b82f6;
}
.row[data-tone="amber"] {
  --tone: #f59e0b;
}
.row[data-tone="violet"] {
  --tone: #8b5cf6;
}
.row[data-tone="rose"] {
  --tone: #f43f5e;
}
/* highlight-end */

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 12%, transparent);
}
.badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--tone);
  font-variant-numeric: tabular-nums;
}

/* =========================================================================
 * scaffold Slider 슬롯 오버라이드 — 색은 전부 --tone 을 참조
 * ========================================================================= */
/* highlight-start */
.slider :global([data-slot="slider-track"]) {
  height: 6px;
  background: var(--ms-track);
  border-radius: 999px;
}
.slider :global([data-slot="slider-range"]) {
  background: var(--tone);
  border-radius: 999px;
}
.slider :global([data-slot="slider-thumb"]) {
  width: 18px;
  height: 18px;
  background: #ffffff;
  border: 3px solid var(--tone);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--tone) 45%, transparent);
}
.slider :global([data-slot="slider-thumb"]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 30%, transparent);
}
/* highlight-end */
```

</details>

:::tip 두 예제에서 가져갈 것
바꾼 것은 세 가지뿐입니다 — ①`value` / `onValueChange` 등 **prop** ②`data-slot` 오버라이드 ③슬라이더 **주변에 배치한 내 마크업**(히스토그램·값 배지). 컴포넌트를 복사해서 고치지 마세요.
:::

---

## 자주 하는 실수

---

| 증상                                 | 원인                                               | 해결                                                     |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| 회색 레일만 있고 손잡이가 없다       | `value` / `defaultValue`를 안 넘김                 | 둘 중 하나를 반드시 지정                                 |
| 손잡이가 안 움직인다                 | `value`만 주고 `onValueChange`를 안 줌 (제어 모드) | `onValueChange`로 상태 갱신 (또는 `defaultValue`로 변경) |
| 드래그할 때마다 API가 폭주한다       | `onValueChange`에서 조회 호출                      | `onValueCommit`으로 이동                                 |
| 손잡이 2개가 겹친다                  | `minStepsBetweenThumbs` 미지정                     | `minStepsBetweenThumbs={1}`                              |
| `className`을 줬는데 트랙이 그대로다 | `className`은 **루트에만** 적용됨                  | `[&_[data-slot=slider-track]]:…` 자손 선택자 사용        |
| CSS Module 오버라이드가 안 먹는다    | 명시도가 Tailwind 유틸리티보다 낮음                | `.내클래스 :global([data-slot='…'])`로 2단계 겹치기      |
| 세로 슬라이더가 짧게 나온다          | 부모에 높이가 없어 `min-h-40`으로 떨어짐           | 부모 또는 `className`으로 높이 지정                      |

---
