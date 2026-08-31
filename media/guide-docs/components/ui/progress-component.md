---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Progress"
hide_table_of_contents: false
---

# Progress 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 진행률 막대(progress bar) 컴포넌트입니다.  
`value`(0~100) 하나만 넘기면 그만큼 채워진 가로 막대를 그립니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Progress` 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 파일 업로드·다운로드처럼 **진행률(%)을 알 수 있는** 작업의 상태 표시
- 여러 단계로 나뉜 폼(스텝 위저드)에서 **지금 몇 번째 단계인지** 보여줄 때
- 사용량 게이지 — 저장 공간, 트래픽 한도, 목표 달성률처럼 **전체 대비 현재값**을 보여줄 때

:::caution 진행률을 모르는 로딩에는 쓰지 마세요
Progress는 **완료 비율을 아는** 작업용입니다. "언제 끝날지 모르는" 로딩에는 진행률 막대 대신 [Spinner](./spinner-component)를 쓰세요. `value`를 비워 두면 접근성상 불확정(indeterminate) 상태가 되긴 하지만, **화면에는 빈 막대로 보일 뿐 아무 애니메이션도 없습니다.** (아래 [불확정 상태](#3-완료--불확정-상태--data-state) 참고)
:::

:::tip 퍼블리셔 참고
Progress는 실제 SI 프로젝트에서 **디자인 교체가 가장 잦은** 컴포넌트입니다. 컴포넌트 본체(`progress.tsx`)를 복사·수정하지 말고, 노출된 `data-slot` 선택자만 오버라이드하세요. 방법은 [스타일링 & 테마](#스타일링--테마)에 정리되어 있습니다.
:::

---

## Import

---

```tsx
import { Progress } from "@axiom/components/ui";
```

Accordion·Pagination과 달리 **파트를 조합하지 않는 단일 컴포넌트**입니다. 넘길 것은 사실상 `value` 하나뿐입니다.

---

## 기본 사용법

---

`value`에 0~100 사이의 숫자를 넘기면 그 비율만큼 막대가 채워집니다.

<img
  src="../assets/ui/progress-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
{/* 60% 채워진 막대 */}
<Progress value={60} />

{/* 값에 따라 채워지는 정도가 달라진다 */}
<Progress value={0} />
<Progress value={25} />
<Progress value={50} />
<Progress value={75} />
<Progress value={100} />
```

- 폭은 `w-full`이라 **부모 요소의 폭을 그대로 채웁니다.** 폭을 줄이려면 부모를 좁히거나 `className="w-64"`처럼 직접 지정하세요.
- 기본 높이는 `h-1`(4px), 트랙 색은 `bg-muted`, 채움 색은 `bg-primary`(테마 색)입니다.
- `value`를 생략하거나 `null`이면 **0%(빈 막대)** 로 보입니다.

:::caution `value`는 반드시 0~100으로 잘라서 넘기세요
범위를 벗어난 값(`-10`, `120`)이나 숫자가 아닌 값을 넘기면 콘솔에 `Invalid prop 'value'` 오류가 찍히고 **불확정 상태로 떨어집니다.** 계산값을 그대로 넘기지 말고 한 번 조여 주세요.

```tsx
const clamp = (n: number) => Math.max(0, Math.min(100, n));

<Progress value={clamp(Math.round((loaded / total) * 100))} />;
```

:::

---

## 구성 (Anatomy)

---

겉으로는 하나지만, 내부는 **트랙(track) + 인디케이터(indicator)** 두 요소입니다. 재스타일링할 때 이 구조를 알아야 합니다.

```html
<!-- 렌더 결과 (요약) -->
<div
  data-slot="progress"
  role="progressbar"
  data-state="loading"
  data-value="60"
  data-max="100"
>
  <!-- 트랙: 배경 막대 (bg-muted, h-1, rounded-full, overflow-x-hidden) -->
  <div data-slot="progress-indicator" style="transform: translateX(-40%)">
    <!-- 인디케이터: 채워지는 막대 (bg-primary, 항상 트랙과 같은 폭) -->
  </div>
</div>
```

| 파트                               | 역할                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `[data-slot="progress"]`           | 트랙(루트). 배경·높이·라운드를 담당하고 `role="progressbar"`를 가집니다. |
| `[data-slot="progress-indicator"]` | 채워지는 막대. 색·애니메이션을 담당합니다.                               |

:::note 채움은 `width`가 아니라 `transform`입니다
인디케이터는 **항상 트랙과 같은 폭(100%)** 이고, `transform: translateX(-(100 - value)%)`로 왼쪽으로 밀어 낸 뒤 트랙의 `overflow-x-hidden`으로 잘라내는 방식입니다.

- 👍 값이 바뀔 때 리플로우 없이 GPU로 움직여서 **부드럽고 가볍습니다.** (인디케이터에 `transition-all`이 걸려 있어 별도 설정 없이 애니메이션됩니다.)
- ⚠️ 인디케이터에 **그라데이션·패턴을 넣으면 막대와 함께 움직입니다.** 이유와 대응은 [그라데이션이 막대와 함께 움직일 때](#4-그라데이션이-막대와-함께-움직일-때)에서 다룹니다.
  :::

---

## 동작 옵션

---

Progress에는 내부 상태가 없습니다. **값을 누가 어떻게 갱신하는가**가 곧 동작입니다.

### 1. 진행률 — `value`

```tsx
<Progress value={60} />
```

`value`는 0~100 범위의 숫자입니다. 이 값이 화면의 채움 비율이자 스크린리더가 읽는 `aria-valuenow`가 됩니다.

### 2. 값 갱신하기 (controlled)

진행률은 화면의 state로 관리하고, 실제 작업의 진행 이벤트에서 `setValue`만 호출하면 됩니다.

```tsx
import { useState } from "react";
import { Progress } from "@axiom/components/ui";

export default function UploadPage(): React.ReactNode {
  const [value, setValue] = useState(0);

  const upload = (file: File) => {
    const xhr = new XMLHttpRequest();
    // highlight-start
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return; // 전체 크기를 모르면 % 계산 불가
      setValue(Math.round((e.loaded / e.total) * 100));
    };
    // highlight-end
    xhr.open("POST", "/api/files");
    xhr.send(file);
  };

  return <Progress value={value} />;
}
```

- `e.lengthComputable`이 `false`면 전체 크기를 몰라 퍼센트를 낼 수 없습니다. 이때는 진행률 막대 대신 Spinner를 쓰세요.
- 값이 바뀌면 인디케이터의 `transition-all`이 알아서 부드럽게 이동시킵니다. **직접 애니메이션을 만들 필요가 없습니다.**
- 마운트 직후 `0% → 목표값`으로 차오르는 연출을 원하면, 초기값을 `0`으로 두고 `useEffect`에서 목표값을 세팅하세요.

### 3. 완료 · 불확정 상태 — `data-state`

값에 따라 트랙과 인디케이터 **양쪽에** `data-state`가 자동으로 붙습니다. 상태별로 색을 다르게 주고 싶을 때 이 속성을 선택자로 씁니다.

| `value`         | `data-state`    | 화면                          |
| --------------- | --------------- | ----------------------------- |
| `0` ~ `99`      | `loading`       | 그만큼 채워진 막대            |
| `100` (= `max`) | `complete`      | 꽉 찬 막대                    |
| 없음 · `null`   | `indeterminate` | **빈 막대 (애니메이션 없음)** |

```css
/* 완료되면 초록으로 */
.wrap [data-slot="progress-indicator"][data-state="complete"] {
  background: #10b981;
}
```

:::caution 불확정 상태에 기본 애니메이션은 없습니다
`value`를 비우면 접근성상으로만 "불확정"이 될 뿐(`aria-valuenow` 제거), 화면에는 **빈 막대**가 보입니다. 흔히 보는 "좌우로 왕복하는 막대"가 필요하면 [불확정(무한) 애니메이션 레시피](#5-불확정무한-애니메이션-레시피)처럼 CSS를 직접 넣어야 합니다.
:::

### 4. `max`는 시각 표시에 반영되지 않습니다

Radix 기반이라 `max` prop이 전달되기는 하지만, **채움 계산은 `value`를 그대로 퍼센트로 씁니다.**

```tsx
{
  /* ❌ ARIA 는 50%, 화면은 100% 로 꽉 차 보인다 — 어긋남 */
}
<Progress value={100} max={200} />;

{
  /* ✅ 퍼센트로 직접 환산해서 넘긴다 */
}
<Progress value={Math.round((100 / 200) * 100)} />;
```

:::note 이유
컴포넌트 내부가 `transform: translateX(-(100 - value)%)`로 **100 기준 고정**입니다. `max`는 `aria-valuemax`와 `data-state` 판정에만 영향을 줍니다. **`max`는 쓰지 말고, 항상 0~100 퍼센트로 환산해서 `value`에 넘기세요.**
:::

### 5. 폭과 높이

```tsx
{/* 폭: 기본 w-full — 부모 폭을 채운다 */}
<div className="w-64">
  <Progress value={60} />
</div>
<Progress value={60} className="w-64" />   {/* 직접 지정해도 동일 */}

{/* 높이: 기본 h-1(4px) */}
<Progress value={65} className="h-2" />
<Progress value={65} className="h-3" />
<Progress value={65} className="h-4 rounded-lg" />
```

<img
  src="../assets/ui/progress-size.png"
  alt="높이 커스터마이징"
  width="80%"
/>

내부적으로 `tailwind-merge`를 쓰므로 `h-2`를 넘기면 기본값 `h-1`이 **제거된 뒤** 적용됩니다. `!important`가 필요 없습니다.

---

## API 레퍼런스

---

Progress는 **Radix Progress** 기반이라, 아래 표에 없는 Radix 표준 prop도 루트(트랙)로 그대로 전달됩니다.

### Props

| Prop            | 타입                     | 기본값              | 설명                                                                                                  |
| --------------- | ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `value`         | `number \| null`         | `null`              | 진행률 **0~100**. 없거나 `null`이면 불확정(화면상 0%)                                                 |
| `className`     | `string`                 | —                   | 트랙에 적용. `bg-*` · `h-*` · `w-*` 등으로 오버라이드(tailwind-merge 병합)                            |
| `max`           | `number`                 | `100`               | ARIA/상태 판정용. **시각 표시에는 반영되지 않음** ([위 참고](#4-max는-시각-표시에-반영되지-않습니다)) |
| `getValueLabel` | `(value, max) => string` | `` `${percent}%` `` | `aria-valuetext` 문구 생성기 ([접근성](#접근성) 참고)                                                 |
| 그 외           | `<div>` 속성             | —                   | `id`, `aria-label`, `style` 등 표준 속성 그대로 전달                                                  |

### 자동으로 붙는 속성

트랙과 인디케이터 **양쪽에** 아래 속성이 붙습니다. CSS 선택자로 그대로 쓸 수 있습니다.

| 속성         | 값                                         | 비고              |
| ------------ | ------------------------------------------ | ----------------- |
| `data-slot`  | `progress` / `progress-indicator`          | 재스타일링 진입점 |
| `data-state` | `loading` \| `complete` \| `indeterminate` | 값에 따라 자동    |
| `data-value` | 현재 `value`                               | 불확정이면 없음   |
| `data-max`   | `max` (기본 `100`)                         | —                 |
| `role`       | `progressbar`                              | 트랙에만          |

---

## 접근성

---

Radix 기반이라 **ARIA 속성이 기본 내장**되어 있습니다. 별도 설정 없이 아래가 붙습니다.

- `role="progressbar"` — 스크린리더가 진행률 위젯으로 인식합니다.
- `aria-valuemin="0"` / `aria-valuemax="100"` / `aria-valuenow="{value}"`
- `aria-valuetext` — 기본은 `"60%"` 형태로 자동 생성됩니다.
- 포커스를 받지 않는 **읽기 전용 표시 요소**라 키보드 조작은 없습니다.

직접 챙겨야 하는 것:

- **이름(label)이 없습니다.** 무엇의 진행률인지 알리려면 `aria-label` 또는 `aria-labelledby`를 직접 주세요.

  ```tsx
  <Progress value={60} aria-label="파일 업로드 진행률" />
  ```

- **퍼센트 말고 다른 문구**를 읽히고 싶다면 `getValueLabel`을 씁니다.

  ```tsx
  <Progress
    value={50}
    aria-label="파일 업로드 진행률"
    // 스크린리더: "24.6MB 중 12.3MB"
    getValueLabel={(value) =>
      `24.6MB 중 ${((24.6 * value) / 100).toFixed(1)}MB`
    }
  />
  ```

- 퍼센트 **숫자를 눈으로도** 보여줄 거라면 막대 옆에 텍스트로 함께 두세요. 색만으로 상태(주의·위험)를 구분하면 색각 이상 사용자가 알 수 없습니다. (아래 [리소스 사용량 게이지](#2-리소스-사용량-게이지)가 색 + 뱃지 텍스트를 함께 쓰는 예입니다.)

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다. 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것        | 방법                                             |
| ------------------ | ------------------------------------------------ |
| 높이 · 폭 · 라운드 | 트랙 **`className`**                             |
| 트랙 색            | 트랙 **`className`** 의 `bg-*`                   |
| 채움 색(한 곳만)   | **arbitrary variant** (`[&>[data-slot=…]]:bg-*`) |
| 색 전반(테마)      | **디자인 토큰** (`--primary`, `--muted`)         |
| 겉모습 전면 교체   | **`data-slot` 선택자 + CSS Module**              |

### 1. 색 — 트랙은 `className`, 채움은 arbitrary variant

트랙은 루트라서 `className`이 바로 닿지만, **채움(인디케이터)은 내부 요소**라 선택자로 겨냥해야 합니다.

```tsx
{/* 트랙 색: className 에 bg-* 를 주면 기본 bg-muted 를 덮어씀 */}
{/* 채움 색: data-slot 을 겨냥한 arbitrary variant 사용 */}
<Progress
  value={70}
  className="bg-emerald-100 dark:bg-emerald-950/40
             [&>[data-slot=progress-indicator]]:bg-emerald-500"
/>

<Progress
  value={55}
  className="bg-rose-100 dark:bg-rose-950/40
             [&>[data-slot=progress-indicator]]:bg-rose-500"
/>

{/* 그라데이션도 가능 */}
<Progress
  value={85}
  className="[&>[data-slot=progress-indicator]]:bg-gradient-to-r
             [&>[data-slot=progress-indicator]]:from-violet-500
             [&>[data-slot=progress-indicator]]:to-fuchsia-500"
/>
```

<img
  src="../assets/ui/progress-color.png"
  alt="커스텀 색상"
  width="80%"
/>

인디케이터는 트랙의 **직계 자식**이므로 `>` 결합자를 쓴 `[&>[data-slot=progress-indicator]]:…` 형태가 안전합니다. 자손 결합자가 들어가 명시도가 기본 `bg-primary`보다 높으므로 항상 적용됩니다.

### 2. 색 전반은 디자인 토큰으로

Progress 전용 색 변수는 없습니다. 앱 전체의 진행률 색을 바꾸려면 progress 전용 변수를 새로 만들지 말고 **테마 토큰**(`--primary`, `--muted`)을 조정하세요. 토큰 정의는 [디자인 토큰 만들기](../../documents/design-system/create-design-tokens)를 참고하세요.

### 3. 겉모습 전면 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면 CSS Module에서 두 슬롯을 오버라이드합니다.

```css
/* 래퍼(.card) 아래에서 슬롯을 재정의. 래퍼+슬롯 2단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.card :global([data-slot="progress"]) {
  height: 10px;
  background: #eef2ff;
  border-radius: 999px;
}
.card :global([data-slot="progress-indicator"]) {
  background: linear-gradient(90deg, #4f46e5, #06b6d4);
  border-radius: 999px;
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.card [data-slot=…]`처럼 **래퍼로 한 번 더 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 4. 그라데이션이 막대와 함께 움직일 때

[Anatomy](#구성-anatomy)에서 본 것처럼 인디케이터는 **항상 트랙과 같은 폭**이고 왼쪽으로 밀려 있습니다. 그래서 인디케이터에 준 그라데이션은 트랙에 고정되지 않고 **막대를 따라 움직입니다.** (진행률 30%일 때 그라데이션의 끝 색만 보이는 식)

단색이면 신경 쓸 일이 없고, **그라데이션을 트랙 기준으로 고정**하고 싶다면 현재 값을 CSS 변수로 넘겨 배경 크기를 직접 맞춥니다.

```tsx
{
  /* 진행률을 CSS 변수로 함께 넘긴다 */
}
<div className={styles.wrap} style={{ "--p": value } as React.CSSProperties}>
  <Progress value={value} />
</div>;
```

```css
/* 그라데이션을 "채워진 구간 크기"로 그리고 오른쪽 끝에 붙인다
   → 밀려난 만큼 상쇄되어 트랙 왼쪽에서 시작하는 것처럼 보인다 */
.wrap :global([data-slot="progress-indicator"]) {
  background-image: linear-gradient(90deg, #6366f1, #06b6d4);
  background-repeat: no-repeat;
  background-position: right center;
  background-size: calc(var(--p) * 1%) 100%;
}
```

### 5. 불확정(무한) 애니메이션 레시피

`value`를 비우면 `data-state="indeterminate"`가 붙지만 애니메이션은 없습니다. 좌우로 왕복하는 막대가 필요하면 이 상태를 겨냥해 직접 넣습니다.

```css
.wrap :global([data-slot="progress-indicator"][data-state="indeterminate"]) {
  /* 기본 flex-1(=꽉 채움)을 덮어 40% 폭 조각으로 만든다 */
  flex: 0 0 40%;
  animation: ind-slide 1.1s ease-in-out infinite;
}

@keyframes ind-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}
```

:::note 인라인 `transform`을 어떻게 덮어쓰나
컴포넌트가 인디케이터에 `style={{ transform: … }}`을 직접 넣지만, **CSS 애니메이션은 인라인 스타일보다 우선**하므로 `@keyframes`의 `transform`이 이깁니다. 값이 있는 상태(`loading`)에는 선택자가 걸리지 않아 원래 동작 그대로입니다.
:::

---

## 실전 예제

---

제공 Progress를 **그대로 쓰되** `*.module.css`의 `data-slot` 선택자로 완전히 다른 디자인을 입힌 예제입니다. 두 예제 모두 scaffold `UI Components > Progress` 화면 하단에서 직접 조작해 볼 수 있습니다.

### 1. 파일 업로드 진행률 카드

업로드가 진행되는 동안 그라데이션 막대에 광택 줄무늬가 흐르고, 완료되면 멈추는 카드입니다.

<img
  src="../assets/ui/progress-real-upload.png"
  alt="파일 업로드 진행률 카드"
  width="80%"
/>

**포인트**

- 제공 `Progress`를 **그대로** 쓰고, 트랙 높이(10px)·그라데이션·줄무늬는 전부 `module.css`의 `data-slot` 오버라이드입니다.
- 진행 중일 때만 줄무늬가 보이도록, 카드 래퍼에 `data-active`를 두고 **래퍼 상태 → 인디케이터 `::after`** 로 연결했습니다. 컴포넌트에 상태 prop을 추가할 필요가 없습니다.
- 업로드는 `setInterval` 시뮬레이션입니다. 실제로는 [값 갱신하기](#2-값-갱신하기-controlled)처럼 `xhr.upload.onprogress`에서 `setValue`만 호출하면 됩니다.

<details>
<summary><b>UploadProgressCard.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/progress/UploadProgressCard.tsx"
import { useEffect, useRef, useState } from "react";
import { Progress, Button } from "@axiom/components/ui";
import { FileText, RotateCcw, UploadCloud } from "lucide-react";
import styles from "./UploadProgressCard.module.css";

/**
 * 파일 업로드 진행률 카드 (실전 예제)
 *
 * scaffold가 제공하는 Progress(@axiom/components/ui)를 **그대로** 쓰되,
 * 스타일은 UploadProgressCard.module.css 에서 data-slot 선택자로 완전히 교체했다.
 * (트랙 높이·색, 인디케이터 그라데이션, 진행 중 광택 줄무늬 등)
 *
 * 업로드 동작은 setInterval 로 시뮬레이션한다. 실제 프로젝트에서는
 * XHR/fetch 의 progress 이벤트에서 setValue(...) 만 호출하면 된다.
 */
export default function UploadProgressCard(): React.ReactNode {
  const [value, setValue] = useState(0);
  const [uploading, setUploading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = () => {
    clear();
    setValue(0);
    setUploading(true);
    timerRef.current = setInterval(() => {
      setValue((prev) => {
        // 뒤로 갈수록 느려지는 자연스러운 곡선
        const next = prev + Math.max(1, Math.round((100 - prev) / 12));
        if (next >= 100) {
          clear();
          setUploading(false);
          return 100;
        }
        return next;
      });
    }, 220);
  };

  const reset = () => {
    clear();
    setUploading(false);
    setValue(0);
  };

  // 언마운트 시 타이머 정리
  useEffect(() => clear, []);

  const done = value >= 100;

  return (
    // highlight-next-line
    <div className={styles.card} data-active={uploading ? "true" : "false"}>
      <div className={styles.head}>
        <div className={styles.fileIcon}>
          <FileText className="w-5 h-5" />
        </div>
        <div className={styles.meta}>
          <p className={styles.fileName}>2026_상반기_결산보고서.pdf</p>
          <p className={styles.fileSize}>
            {(24.6 * (value / 100)).toFixed(1)} MB / 24.6 MB
          </p>
        </div>
        <span className={styles.percent}>{value}%</span>
      </div>

      {/* scaffold Progress — 컴포넌트는 그대로, 스타일만 .card 래퍼의
          data-slot 선택자(module.css)로 교체된다. */}
      {/* highlight-next-line */}
      <Progress value={value} />

      <div className={styles.foot}>
        <span className={styles.status}>
          {done ? (
            <span className={styles.done}>✓ 업로드 완료</span>
          ) : uploading ? (
            "업로드 중…"
          ) : (
            "대기 중"
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reset}
            disabled={uploading || value === 0}
            className="gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            초기화
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={start}
            disabled={uploading}
            className="gap-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            {done ? "다시 업로드" : "업로드 시작"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>UploadProgressCard.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/progress/UploadProgressCard.module.css"
/* =========================================================================
 * 예제 목적: scaffold Progress(@axiom/components/ui)를 "그대로 사용"하면서
 *            CSS Module로 완전히 다른 스타일을 입힌다.
 *
 * 재스타일링 방식:
 *   - [data-slot="progress"]           : 트랙(루트)
 *   - [data-slot="progress-indicator"] : 채워지는 막대(인디케이터)
 *   래퍼(.card) + 슬롯 2단계로 감싸 Tailwind 유틸리티(bg-primary 등)보다 명시도를 높인다.
 * ========================================================================= */

.card {
  --up-brand: #4f46e5;
  --up-brand-2: #06b6d4;
  --up-track: #eef2ff;
  /* … 나머지 색 토큰 생략 */

  width: 100%;
  padding: 20px;
  border-radius: 16px;
  background: var(--up-card);
  border: 1px solid var(--up-border);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --up-track: #312e5a;
  --up-card: #14131f;
  /* … 이하 동일 패턴 */
}

/* ── Progress 슬롯 오버라이드 ───────────────────────────── */
/* 트랙 — 기본 높이(h-1)/색(bg-muted)을 덮어쓴다 */
/* highlight-start */
.card :global([data-slot="progress"]) {
  height: 10px;
  background: var(--up-track);
  border-radius: 999px;
}

/* 인디케이터 — 기본 bg-primary(단색)를 브랜드 그라데이션으로 교체 */
.card :global([data-slot="progress-indicator"]) {
  background: linear-gradient(90deg, var(--up-brand), var(--up-brand-2));
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}
/* highlight-end */

/* 광택 줄무늬 — 기본은 숨겨 두고 */
.card :global([data-slot="progress-indicator"])::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.25) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.25) 50%,
    rgba(255, 255, 255, 0.25) 75%,
    transparent 75%,
    transparent
  );
  background-size: 20px 20px;
  animation: up-stripes 0.7s linear infinite;
  opacity: 0;
  transition: opacity 0.2s;
}

/* 래퍼가 진행 중(data-active="true")일 때만 노출 */
/* highlight-next-line */
.card[data-active="true"] :global([data-slot="progress-indicator"])::after {
  opacity: 1;
}

@keyframes up-stripes {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 20px 0;
  }
}

/* … 헤더/상태줄 등 카드 자체 스타일 생략 */
```

</details>

### 2. 리소스 사용량 게이지

값(임계치)에 따라 막대 색이 초록 → 주황 → 빨강으로 바뀌는 대시보드형 게이지입니다.

<img
  src="../assets/ui/progress-real-resource.png"
  alt="리소스 사용량 게이지"
  width="80%"
/>

**포인트**

- 색 분기를 컴포넌트에 넣지 않습니다. **각 행(`.row`)에 `data-level`(ok/warn/danger)을 부여**하고, CSS에서 `data-level` × `data-slot` 조합으로 색을 정합니다.
- 임계치 판정은 화면의 순수 함수(`levelOf`)가 담당합니다. 기준(70 / 90)이 바뀌어도 CSS와 컴포넌트는 그대로입니다.
- 색만으로 구분하지 않도록 **여유 / 주의 / 위험 뱃지 텍스트**를 함께 노출합니다.
- 인디케이터에 `transition: transform .4s, background-color .3s`를 줘서 값과 색이 **동시에 부드럽게** 바뀝니다.

<details>
<summary><b>ResourceUsageCard.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/progress/ResourceUsageCard.tsx"
import { useMemo, useState } from "react";
import { Progress } from "@axiom/components/ui";
import styles from "./ResourceUsageCard.module.css";

/** 사용량 퍼센트를 임계치 레벨로 변환한다. (70/90 기준) */
// highlight-start
function levelOf(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}
// highlight-end

const LEVEL_TEXT: Record<"ok" | "warn" | "danger", string> = {
  ok: "여유",
  warn: "주의",
  danger: "위험",
};

/**
 * 리소스 사용량 카드 (실전 예제)
 *
 * scaffold Progress(@axiom/components/ui)를 그대로 쓰되, 값(임계치)에 따라
 * 막대 색(초록/주황/빨강)이 바뀌는 대시보드형 게이지다.
 * 색 전환은 각 행의 data-level 속성 → module.css 의 data-slot 선택자로 처리한다.
 */
export default function ResourceUsageCard(): React.ReactNode {
  const [storage, setStorage] = useState(58);

  const rows = useMemo(
    () => [
      {
        label: "스토리지",
        used: `${(storage * 5.12).toFixed(0)} GB`,
        total: "512 GB",
        percent: storage,
      },
      { label: "월 트래픽", used: "1.6 TB", total: "2 TB", percent: 82 },
      { label: "API 호출", used: "96.2만", total: "100만", percent: 96 },
      { label: "팀 시트", used: "12명", total: "30명", percent: 40 },
    ],
    [storage],
  );

  return (
    <div className={styles.card}>
      <p className={styles.title}>리소스 사용량</p>

      <div className={styles.rows}>
        {rows.map((r) => {
          const level = levelOf(r.percent);
          return (
            // highlight-next-line
            <div key={r.label} className={styles.row} data-level={level}>
              <div className={styles.rowHead}>
                <span className={styles.label}>
                  {r.label}
                  {/* 색만으로 구분하지 않도록 텍스트 뱃지를 함께 */}
                  <span className={styles.badge}>{LEVEL_TEXT[level]}</span>
                </span>
                <span className={styles.amount}>
                  <strong>{r.used}</strong> / {r.total} · {r.percent}%
                </span>
              </div>
              {/* highlight-next-line */}
              <Progress value={r.percent} />
            </div>
          );
        })}
      </div>

      {/* 슬라이더로 스토리지 값을 바꾸면 임계치에 따라 색이 실시간으로 변한다 */}
      <div className={styles.control}>
        <label className={styles.controlLabel} htmlFor="ru-storage">
          스토리지 사용량 조절 — 70% 이상 주황, 90% 이상 빨강으로 전환됩니다.
        </label>
        <input
          id="ru-storage"
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={storage}
          onChange={(e) => setStorage(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>ResourceUsageCard.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/progress/ResourceUsageCard.module.css"
/* =========================================================================
 * 예제 목적: scaffold Progress를 그대로 쓰되,
 *            "값(임계치)에 따라 막대 색이 바뀌는" 대시보드형 게이지를 만든다.
 *
 * 재스타일링 방식:
 *   각 행(.row)에 data-level(ok | warn | danger) 을 부여하고,
 *   그 값에 따라 [data-slot='progress-indicator'] 색을 바꾼다.
 *   → Progress 컴포넌트 본체는 전혀 수정하지 않는다.
 * ========================================================================= */

.card {
  --ru-ok: #10b981;
  --ru-warn: #f59e0b;
  --ru-danger: #ef4444;
  --ru-track: #f1f5f9;
  /* … 나머지 색 토큰 생략 */
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --ru-track: #1e293b;
  /* … 이하 동일 패턴 */
}

/* ── 트랙 공통 오버라이드 ───────────────────────────────── */
.card :global([data-slot="progress"]) {
  height: 8px;
  background: var(--ru-track);
  border-radius: 999px;
}

/* 값과 색이 동시에 부드럽게 바뀌도록 전환 지정 */
.card :global([data-slot="progress-indicator"]) {
  border-radius: 999px;
  transition:
    transform 0.4s ease,
    background-color 0.3s ease;
}

/* ── 임계치별 인디케이터 색 ─────────────────────────────── */
/* highlight-start */
.row[data-level="ok"] :global([data-slot="progress-indicator"]) {
  background: var(--ru-ok);
}
.row[data-level="warn"] :global([data-slot="progress-indicator"]) {
  background: var(--ru-warn);
}
.row[data-level="danger"] :global([data-slot="progress-indicator"]) {
  background: var(--ru-danger);
}
/* highlight-end */

/* 뱃지 색도 같은 레벨 규칙을 그대로 재사용 */
.row[data-level="ok"] .badge {
  color: var(--ru-ok);
  background: color-mix(in srgb, var(--ru-ok) 14%, transparent);
}
/* … warn / danger 도 동일 패턴, 라벨·슬라이더 스타일 생략 */
```

</details>

:::tip 두 예제에서 가져갈 것
컴포넌트는 **손대지 않습니다.** 바꾸는 건 ①`value`(진행률) ②래퍼에 두는 상태 속성(`data-active`, `data-level`) ③`data-slot` 오버라이드 세 가지뿐입니다. 디자인이 아무리 달라져도 `progress.tsx`를 복사해서 고치지 마세요.
:::

---
