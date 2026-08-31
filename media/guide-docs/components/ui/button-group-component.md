---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Button Group"
hide_table_of_contents: false
---

# Button Group 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 버튼 그룹 컴포넌트입니다.  
**여러 버튼·입력을 하나의 덩어리로 붙여** 배치할 때 사용합니다. 맞닿는 모서리와 겹치는 테두리를 자동으로 정리해 주므로, 버튼을 나란히 놓기만 하면 하나로 묶인 컨트롤이 됩니다.

**언제 쓰나요?**

* 이전/현재/다음, 복사/붙여넣기/삭제처럼 **관련 동작을 나란히** 묶을 때
* 굵게·기울임·정렬처럼 아이콘 버튼을 늘어놓는 **툴바**
* `1D · 1W · 1M · 1Y` 같은 **세그먼트 컨트롤**(라디오 대체) · **수량 스테퍼**
* `https://` 접두 라벨, `원` 접미 단위처럼 **Input에 라벨을 붙이는** 입력 그룹
* 주 동작 + 부가 메뉴를 합친 **Split Button**

> `ButtonGroup`은 **레이아웃만 담당**합니다. 색과 크기는 안에 넣는 `Button`의 `variant`·`size`가 결정합니다. (아래 [variant · size는 Button이 결정](#1-variant--size는-button이-결정) 참고)

---


## Import
---

```tsx
import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@axiom/components/ui';
```

Button Group은 **3개의 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---


## 기본 사용법
---

`ButtonGroup` 안에 `Button`을 나열하기만 하면 됩니다. 가운데 모서리(`rounded`)와 겹치는 테두리(`border`)가 자동으로 정리되어 하나의 덩어리로 붙습니다.

---
<img src="../assets/ui/button-group-basic.png" alt="버튼그룹 기본 사용법" width="80%" />
```tsx
<ButtonGroup>
  <Button variant="outline">이전</Button>
  <Button variant="outline">현재</Button>
  <Button variant="outline">다음</Button>
</ButtonGroup>
```

:::tip 기본 폭은 `w-fit`
`ButtonGroup`은 내용만큼만 차지합니다(`w-fit`). 컨테이너 폭을 꽉 채우려면 `className="w-full"`을 주세요. 그룹 안의 `<input>`은 남는 공간을 자동으로 차지합니다(`flex-1`).
:::

---


## 구성 (Anatomy)
---

Button Group은 아래 파트를 조합해 구성합니다. `Button` · `Input` 등 **안에 들어가는 컨트롤은 scaffold의 일반 컴포넌트를 그대로** 씁니다.

```tsx
<ButtonGroup>              {/* 루트 — orientation으로 방향을 정하고 모서리·테두리를 정리 */}
  <Button />               {/* 일반 Button (variant·size로 색·크기 결정) */}
  <ButtonGroupText />      {/* 버튼이 아닌 정적 라벨/단위/아이콘 */}
  <ButtonGroupSeparator /> {/* 버튼 사이 구분선 */}
  <Input />                {/* 입력도 그룹에 넣을 수 있음 (남는 폭을 차지) */}
</ButtonGroup>
```

| 파트 | 역할 |
| --- | --- |
| `ButtonGroup` | 루트. `role="group"`으로 렌더되며 `orientation`으로 가로/세로를 정합니다. |
| `ButtonGroupText` | 버튼이 아닌 **정적 텍스트·아이콘**. Input 앞뒤에 붙여 접두/접미로 씁니다. |
| `ButtonGroupSeparator` | 버튼 사이 **구분선**. 내부적으로 `Separator`를 사용합니다. |

:::note 모서리 정리는 CSS가 담당
루트에 붙는 클래스가 `첫 자식이 아니면 왼쪽 모서리 제거·왼쪽 테두리 제거`, `마지막 자식이 아니면 오른쪽 모서리 제거` 식으로 **자식 위치에 따라 자동 처리**합니다. 그래서 자식마다 따로 `rounded-none`을 줄 필요가 없습니다.
:::

---


## Orientation (방향)
---

배치 방향은 루트 `ButtonGroup`의 `orientation` prop으로 결정됩니다. 기본값은 `"horizontal"`입니다.

---
<img src="../assets/ui/button-group-orientation.png" alt="버튼그룹 방향 사용법" width="80%" />
```tsx
{/* 가로 (기본값) — 좌우 모서리·왼쪽 테두리를 정리 */}
<ButtonGroup>
  <Button variant="outline">복사</Button>
  <Button variant="outline">붙여넣기</Button>
  <Button variant="outline">삭제</Button>
</ButtonGroup>

{/* 세로 — 위아래 모서리·위쪽 테두리를 정리 */}
<ButtonGroup orientation="vertical">
  <Button variant="outline">복사</Button>
  <Button variant="outline">붙여넣기</Button>
  <Button variant="outline">삭제</Button>
</ButtonGroup>
```

| orientation | 동작 |
| --- | --- |
| `horizontal` *(기본)* | 가로로 나열. 중간 버튼의 좌우 모서리와 왼쪽 테두리가 제거됩니다. |
| `vertical` | 세로로 쌓임(`flex-col`). 중간 버튼의 위아래 모서리와 위쪽 테두리가 제거됩니다. |

현재 방향은 루트에 `data-orientation="..."`으로 찍히므로, CSS에서 방향별 스타일을 잡을 때 활용할 수 있습니다.

---


## 주요 사용 패턴
---




### 1. variant · size는 Button이 결정

`ButtonGroup`에는 색·크기 prop이 **없습니다**. 그룹 안 `Button`의 `variant`·`size`를 그대로 씁니다.

```tsx
<ButtonGroup>
  <Button variant="outline">Outline</Button>
  <Button variant="outline">Outline</Button>
</ButtonGroup>

<ButtonGroup>
  <Button variant="secondary">Secondary</Button>
  <Button variant="secondary">Secondary</Button>
</ButtonGroup>

<ButtonGroup>
  <Button variant="outline" size="sm">SM</Button>
  <Button variant="outline" size="sm">SM</Button>
</ButtonGroup>
```

:::caution 한 그룹 안에서는 variant·size를 통일하세요
그룹은 **인접한 테두리를 겹쳐서** 하나로 붙입니다. 버튼마다 `variant`(테두리 유무)나 `size`(높이)가 다르면 경계선이 어긋나거나 높이가 튀어 보입니다. 위계를 나누고 싶다면 그룹을 나누거나, [세그먼트 컨트롤](#1-세그먼트-컨트롤-기간-선택)처럼 **선택된 항목만** variant를 바꾸세요.
:::




### 2. 아이콘 툴바

`size`를 `icon` 계열로 주면 정사각형 아이콘 버튼 툴바가 됩니다.

---
<img src="../assets/ui/button-group-icon.png" alt="버튼그룹 icon툴바 사용법" width="80%" />
```tsx
import { Bold, Italic, Underline } from 'lucide-react';

<ButtonGroup>
  <Button variant="outline" size="icon-sm" aria-label="굵게">
    <Bold />
  </Button>
  <Button variant="outline" size="icon-sm" aria-label="기울임">
    <Italic />
  </Button>
  <Button variant="outline" size="icon-sm" aria-label="밑줄">
    <Underline />
  </Button>
</ButtonGroup>
```

* `icon-xs` · `icon-sm` · `icon` · `icon-lg` 4종이 있습니다([Button - Size](./button-component#size-크기) 참고).
* 아이콘만 있는 버튼에는 **반드시 `aria-label`** 을 주세요. 라벨 텍스트가 없어 스크린리더가 읽을 이름이 없습니다.




### 3. `ButtonGroupText` — 라벨 · 단위 붙이기

버튼이 아닌 **정적인 텍스트/아이콘**을 그룹에 끼워 넣습니다. `Input` 앞뒤에 붙이면 접두(prefix)/접미(suffix) 입력이 됩니다.

```tsx
import { Search } from 'lucide-react';

{/* 접두 라벨 */}
<ButtonGroup className="w-full">
  <ButtonGroupText>https://</ButtonGroupText>
  <Input placeholder="example.com" />
</ButtonGroup>

{/* 접미 단위 */}
<ButtonGroup className="w-full">
  <Input placeholder="0" />
  <ButtonGroupText>원</ButtonGroupText>
</ButtonGroup>

{/* 아이콘 + 텍스트 + 버튼 */}
<ButtonGroup className="w-full">
  <ButtonGroupText>
    <Search />
    검색
  </ButtonGroupText>
  <Input placeholder="키워드 입력" />
  <Button variant="outline">조회</Button>
</ButtonGroup>
```

* 안에 넣은 SVG는 별도 크기 지정 없이 `size-4`로 자동 정렬되고, 클릭이 통과되도록 `pointer-events-none`이 적용됩니다.
* `asChild`를 주면 렌더 태그를 자식에 위임합니다. 예: `<ButtonGroupText asChild><label htmlFor="url">URL</label></ButtonGroupText>`




### 4. `ButtonGroupSeparator` — 구분선

테두리가 없는 variant(`default` · `secondary` 등)에서 버튼 사이 경계를 만들어 줍니다.

```tsx
{/* 가로 그룹 — 세로선(기본값)이 들어감 */}
<ButtonGroup>
  <Button>저장</Button>
  <ButtonGroupSeparator />
  <Button>저장 후 계속</Button>
</ButtonGroup>

{/* 세로 그룹 — orientation="horizontal"로 가로선을 명시 */}
<ButtonGroup orientation="vertical">
  <Button variant="secondary">위로</Button>
  <ButtonGroupSeparator orientation="horizontal" />
  <Button variant="secondary">아래로</Button>
</ButtonGroup>
```

:::note 구분선 방향은 그룹의 **반대**
`ButtonGroupSeparator`의 기본값은 `orientation="vertical"`(세로선)이라 **가로 그룹에서는 그대로** 쓰면 됩니다. 세로 그룹에서는 `orientation="horizontal"`을 직접 지정하세요. 자동으로 뒤집히지 않습니다.
:::

* `outline`처럼 테두리가 있는 variant에서는 이미 경계가 보이므로 보통 필요 없습니다.




### 5. 중첩 — 그룹 안의 그룹

`ButtonGroup` 안에 `ButtonGroup`을 넣으면 **각 덩어리는 붙어 있고, 덩어리 사이에는 간격(`gap-2`)이 자동으로** 생깁니다. 툴바를 기능 단위로 묶을 때 유용합니다.

```tsx
<ButtonGroup>
  {/* 서식 그룹 */}
  <ButtonGroup>
    <Button variant="outline" size="icon-sm" aria-label="굵게"><Bold /></Button>
    <Button variant="outline" size="icon-sm" aria-label="기울임"><Italic /></Button>
    <Button variant="outline" size="icon-sm" aria-label="밑줄"><Underline /></Button>
  </ButtonGroup>

  {/* 정렬 그룹 */}
  <ButtonGroup>
    <Button variant="outline" size="icon-sm" aria-label="왼쪽 정렬"><AlignLeft /></Button>
    <Button variant="outline" size="icon-sm" aria-label="가운데 정렬"><AlignCenter /></Button>
    <Button variant="outline" size="icon-sm" aria-label="오른쪽 정렬"><AlignRight /></Button>
  </ButtonGroup>
</ButtonGroup>
```

* 간격은 `has-[>[data-slot=button-group]]:gap-2`로 처리됩니다. 즉 **직계 자식에 그룹이 있을 때만** 간격이 생깁니다.




### 6. Split Button — 드롭다운 조합

주 동작 버튼 + 부가 메뉴 버튼 패턴입니다. `DropdownMenu`와 조합해 만듭니다.

---
<img src="../assets/ui/button-group-dropdown.png" alt="버튼그룹 드롭다운 조합 사용법" width="80%" />
```tsx
import { ChevronDown } from 'lucide-react';

<ButtonGroup>
  <Button>저장</Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="icon" aria-label="저장 옵션 더보기">
        <ChevronDown />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>다른 이름으로 저장</DropdownMenuItem>
      <DropdownMenuItem>사본 저장</DropdownMenuItem>
      <DropdownMenuItem>템플릿으로 저장</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</ButtonGroup>
```

* `DropdownMenuTrigger`에는 **`asChild`** 를 줘서 `Button`이 트리거 자체가 되게 합니다. 그래야 그룹의 모서리 정리 규칙이 그대로 적용됩니다.
* 메뉴 버튼도 주 버튼과 **같은 `variant`** 를 쓰는 것이 자연스럽습니다.




### 7. Disabled (부분 비활성화)

그룹 자체에는 `disabled` prop이 **없습니다**. 개별 `Button`에 `disabled`를 주세요.

```tsx
<ButtonGroup>
  <Button variant="outline">이전</Button>
  <Button variant="outline" disabled>다음</Button>
</ButtonGroup>
```

* 전체를 막아야 한다면 모든 버튼에 `disabled`를 주거나, 상위를 `<fieldset disabled>`로 감쌉니다.

---


## API 레퍼런스
---

Button Group 계열은 모두 **레이아웃 전용**입니다. 색·크기는 내부 `Button`의 `variant`·`size`로 제어합니다.

### `ButtonGroup` (루트)

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | 배치 방향. 모서리·테두리 정리 규칙이 방향에 따라 달라집니다 |
| `className` | `string` | — | 추가 클래스. 기본이 `w-fit`이라 꽉 채우려면 `w-full` |
| `children` | `ReactNode` | — | `Button` · `Input` · `ButtonGroupText` · `ButtonGroupSeparator` 등 |
| `...props` | `React.ComponentProps<'div'>` | — | 기타 표준 div 속성. `role="group"`은 내부에서 지정됩니다 |

### `ButtonGroupText`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `asChild` | `boolean` | `false` | `true`면 렌더 태그를 자식 요소로 위임(Slot). 예: `<label>`로 렌더 |
| `className` | `string` | — | 라벨 영역 스타일 조정(너비·정렬 등) |
| `children` | `ReactNode` | — | 표시할 텍스트·아이콘 |
| `...props` | `React.ComponentProps<'div'>` | — | 기타 표준 div 속성 |

### `ButtonGroupSeparator`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | `"vertical"` | 구분선 방향. **세로 그룹에서는 `"horizontal"`로 지정** |
| `className` | `string` | — | 구분선 색·두께 조정 |
| `...props` | `React.ComponentProps<typeof Separator>` | — | `Separator`의 나머지 속성 |

:::note `data-slot` 노출
각 파트는 `data-slot="button-group"` / `data-slot="button-group-separator"`를 노출합니다. `ButtonGroupText`는 별도 슬롯 없이 클래스만 붙습니다. CSS에서 세밀하게 덮어쓸 때 활용하세요(아래 [스타일링 & 테마](#스타일링--테마) 참고).
:::

---


## 접근성 / 키보드
---

`ButtonGroup`은 `role="group"`으로 렌더되어, 안의 컨트롤이 **하나의 묶음**임을 보조기기에 알립니다.

| 키 | 동작 |
| --- | --- |
| `Tab` | 그룹 내 다음 버튼으로 이동 (버튼 각각이 탭 정지점) |
| `Enter` / `Space` | 포커스된 버튼 실행 |

* **그룹에 이름 붙이기**: 무엇을 묶은 그룹인지 알리려면 `aria-label`(또는 `aria-labelledby`)을 루트에 주세요.
  ```tsx
  <ButtonGroup aria-label="텍스트 서식">…</ButtonGroup>
  ```
* **아이콘 전용 버튼**에는 반드시 `aria-label`을 줍니다.
* **세그먼트 컨트롤**(택1)로 쓸 때는 선택 상태를 색뿐 아니라 `aria-pressed`로도 전달하세요. 색각 이상 사용자와 스크린리더 모두를 위한 처리입니다.
  ```tsx
  <Button aria-pressed={period === p} onClick={() => setPeriod(p)}>{p}</Button>
  ```
* 포커스 링이 옆 버튼에 가려지지 않도록, 그룹은 `focus-visible` 시 해당 버튼을 위로 올립니다(`relative z-10`). 별도 처리 없이 동작합니다.
* 라디오 그룹의 시맨틱(`↑`/`↓`로 이동, 택1 강제)이 꼭 필요하다면 `ButtonGroup` 대신 `RadioGroup` 계열을 고려하세요.

---


## 스타일링 & 테마
---

Button Group은 바꾸려는 대상에 따라 방법이 다릅니다. 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 버튼 색·크기 | 안에 넣는 **`Button`의 `variant` · `size`** |
| 배치 방향 | `ButtonGroup`의 **`orientation`** |
| 폭·간격·정렬 | `ButtonGroup`의 **`className`**(`w-full`, `gap-*` 등) |
| 색상(테두리·구분선·라벨 배경) | **디자인 토큰**(`--border`, `--input`, `--muted`, `--ring`) |
| 세밀한 겉모습 교체 | **`data-slot` 선택자 + CSS Module** |

:::tip 핵심 원칙
* **버튼 자체를 꾸미지 말고 그룹은 레이아웃만** 맡기세요. 색은 `Button`의 `variant`, 그리고 전역 토큰으로 흐르게 두는 것이 원칙입니다.
* Button Group 전용 색 변수를 새로 만들지 말고 **전역 디자인 토큰**을 재사용하세요(토큰 체계 분열 방지).
:::


### 1. 폭·정렬 — `className`

```tsx
{/* 컨테이너 폭을 꽉 채움 (Input 그룹에서 자주 씀) */}
<ButtonGroup className="w-full"> … </ButtonGroup>

{/* 라벨 영역만 폭 고정 + 가운데 정렬 (스테퍼의 숫자 칸 등) */}
<ButtonGroupText className="min-w-14 justify-center tabular-nums">{count}</ButtonGroupText>
```

* 숫자를 표시하는 칸에는 `tabular-nums`를 주면 자릿수가 바뀌어도 **폭이 흔들리지 않습니다**.


### 2. 색은 디자인 토큰으로

| 대상 | 따르는 토큰 |
| --- | --- |
| 버튼 테두리 | `--border` |
| 구분선(`ButtonGroupSeparator`) | `--input` |
| `ButtonGroupText` 배경 | `--muted` |
| 포커스 링 | `--ring` |

브랜드 톤을 바꾸려면 개별 컴포넌트가 아니라 **테마 토큰**을 조정하세요. 그러면 모든 그룹이 함께 바뀝니다.


### 3. 세밀한 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 `data-slot`을 CSS Module에서 오버라이드합니다.

| 선택자 | 대상 |
| --- | --- |
| `[data-slot="button-group"]` | 그룹 루트 |
| `[data-slot="button-group"][data-orientation="vertical"]` | 세로 그룹만 |
| `[data-slot="button-group-separator"]` | 구분선 |
| `[data-slot="button"]` | 그룹 안의 각 버튼 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 여러 단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap :global([data-slot='button-group']) {
  border-radius: 9999px;      /* 그룹 전체를 알약 형태로 */
  overflow: hidden;
}
.wrap :global([data-slot='button-group']) :global([data-slot='button-group-separator']) {
  background: var(--border);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...] [data-slot=...]`처럼 **래퍼+슬롯을 여러 단계로 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제
---

제공 `ButtonGroup`을 그대로 쓰되, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트(`src/domains/example/pages/ui-components/ButtonGroupComponent.tsx`)에서 확인하세요.

<img src="../assets/ui/button-group-real-ex.png" alt="버튼그룹 실전 예제" width="80%" />


### 1. 세그먼트 컨트롤 (기간 선택)

`1D · 1W · 1M · 3M · 1Y`처럼 **하나만 고르는** UI입니다. 선택된 항목만 `variant`를 바꿔 채움으로 표시합니다.

```tsx
import { useState } from 'react';
import { Button, ButtonGroup } from '@axiom/components/ui';

function PeriodSegment() {
  const [period, setPeriod] = useState('1M');

  return (
    <ButtonGroup aria-label="조회 기간">
      {['1D', '1W', '1M', '3M', '1Y'].map((p) => (
        <Button
          key={p}
          // highlight-start
          variant={period === p ? 'default' : 'outline'}
          aria-pressed={period === p}
          // highlight-end
          size="sm"
          onClick={() => setPeriod(p)}
        >
          {p}
        </Button>
      ))}
    </ButtonGroup>
  );
}
```

* 선택 표현은 **`variant` 하나만** 바꿉니다. `size`는 통일해야 높이가 어긋나지 않습니다.
* 색만으로 선택을 알리지 않도록 `aria-pressed`를 함께 줍니다.
* 아이콘 세그먼트(왼쪽/가운데/오른쪽 정렬)도 완전히 동일한 패턴이며, `size="icon"` + `aria-label`만 추가하면 됩니다.


### 2. 수량 스테퍼

`－ / 숫자 / ＋` 세 칸을 붙인 수량 조절 컨트롤입니다. 가운데 숫자 칸은 버튼이 아니므로 `ButtonGroupText`를 씁니다.

```tsx
import { useState } from 'react';
import { Button, ButtonGroup, ButtonGroupText } from '@axiom/components/ui';
import { Minus, Plus } from 'lucide-react';

function QuantityStepper() {
  const [count, setCount] = useState(1);

  return (
    <ButtonGroup aria-label="수량 선택">
      <Button
        variant="outline"
        size="icon"
        aria-label="수량 감소"
        // highlight-next-line
        disabled={count <= 1}
        onClick={() => setCount((c) => Math.max(1, c - 1))}
      >
        <Minus />
      </Button>

      {/* 가운데는 버튼이 아닌 정적 표시 → ButtonGroupText */}
      // highlight-next-line
      <ButtonGroupText className="min-w-14 justify-center tabular-nums">{count}</ButtonGroupText>

      <Button
        variant="outline"
        size="icon"
        aria-label="수량 증가"
        onClick={() => setCount((c) => c + 1)}
      >
        <Plus />
      </Button>
    </ButtonGroup>
  );
}
```

* 최소값에 도달하면 감소 버튼만 `disabled` — 그룹 단위가 아니라 **개별 버튼** 단위로 막습니다.
* 숫자 칸에 `min-w-14`(폭 고정) + `tabular-nums`(고정폭 숫자)를 줘서 `9 → 10`으로 바뀔 때 그룹 폭이 튀지 않게 합니다.

:::tip 두 예제의 공통점
동작(모서리 정리·테두리 겹침·포커스 처리)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`Button`의 `variant`·`size` ②`ButtonGroup`/`ButtonGroupText`의 `className` ③상태에 따른 조건부 prop 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---
