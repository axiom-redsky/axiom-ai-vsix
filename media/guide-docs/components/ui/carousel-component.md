---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Carousel"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Carousel 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-carousel--docs"
  title="Carousel 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Carousel 컴포넌트

`react-app-scaffold`가 제공하는 캐러셀(슬라이더) 컴포넌트입니다.
여러 항목을 한 줄에 늘어놓고 **좌우(또는 상하)로 넘겨 가며** 보여줄 때 사용합니다.
구현은 shadcn/ui Carousel과 같이 Embla Carousel를 기반으로 합니다.

**언제 쓰나요?**

* 메인 배너·프로모션처럼 **한 자리에서 여러 장을 순서대로** 보여줄 때
* 상품 카드·썸네일 목록처럼 **가로로 길어지는 목록을 접어서** 보여줄 때
* 이미지 갤러리, 온보딩 스텝처럼 **한 번에 한 장씩** 넘기는 흐름

> 슬라이드가 몇 개 없고 전부 한눈에 보여야 한다면 캐러셀보다 그냥 그리드가 낫습니다. 캐러셀은 **가려진 항목이 있다는 걸 사용자가 알아채야** 제 역할을 합니다(옆 슬라이드를 살짝 걸치는 `align: "start"` + `basis-*` 조합이 그래서 유용합니다).

---


## Import
---

```tsx
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@axiom/components/ui';
```

Carousel은 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---


## 기본 사용법
---

가장 기본적인 형태입니다. `CarouselItem` 하나가 **한 장(=화면 전체 너비)** 이 되고, 좌우 버튼으로 넘깁니다.

```tsx
import {
  Carousel, CarouselContent, CarouselItem,
  CarouselPrevious, CarouselNext,
} from '@axiom/components/ui';

<Carousel>
  <CarouselContent>
    <CarouselItem>슬라이드 1</CarouselItem>
    <CarouselItem>슬라이드 2</CarouselItem>
    <CarouselItem>슬라이드 3</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

:::tip 이전/다음 버튼이 안 보인다면
`CarouselPrevious` / `CarouselNext`는 캐러셀 **바깥쪽**에 절대 위치로 붙습니다(가로: `-left-12` / `-right-12`, 세로: `-top-12` / `-bottom-12`).
감싸는 영역에 **좌우 여백이 없으면 버튼이 잘립니다.** 부모에 `px-16`(세로 방향이면 `py-14`) 정도의 패딩을 주거나, `className`으로 버튼 위치를 안쪽(`left-2` 등)으로 옮기세요.
:::

---
<img src="../assets/ui/carousel-basic.png" alt="carousel 기본" width="100%" />


## 구성 (Anatomy)
---

Carousel은 아래 파트를 중첩해서 구성합니다.

```tsx
<Carousel>                 {/* 루트 — Embla 인스턴스 생성, 방향·옵션·플러그인을 받는다 */}
  <CarouselContent>        {/* 뷰포트 + 트랙 — 슬라이드가 늘어서는 flex 컨테이너 */}
    <CarouselItem />       {/* 슬라이드 한 장 — basis-* 로 폭을 정한다 */}
    {/* CarouselItem 을 필요한 만큼 반복 */}
  </CarouselContent>
  <CarouselPrevious />     {/* 이전 버튼 (끝에 닿으면 자동 disabled) */}
  <CarouselNext />         {/* 다음 버튼 */}
</Carousel>
```

| 파트 | 역할 |
| --- | --- |
| `Carousel` | 루트. Embla를 초기화하고 `opts` · `plugins` · `orientation` · `setApi`를 받습니다. `role="region"` 컨테이너이기도 합니다. |
| `CarouselContent` | 스크롤 뷰포트(`overflow-hidden`)와 그 안의 flex 트랙. 슬라이드 간격(`-ml-*` / `-mt-*`)을 담당합니다. |
| `CarouselItem` | 슬라이드 한 장. 기본 `basis-full`(한 장 = 전체 폭), `role="group"`. |
| `CarouselPrevious` | 이전 버튼. 더 갈 곳이 없으면 **자동으로 `disabled`** 됩니다. |
| `CarouselNext` | 다음 버튼. 동일하게 자동 `disabled`. |
| `useCarousel()` | 커스텀 컨트롤을 직접 만들 때 쓰는 훅. `Carousel` 내부에서만 호출 가능합니다. |

:::note `CarouselContent`의 className은 어디에 붙나
`CarouselContent`는 **div 두 겹**을 렌더합니다. 바깥은 `overflow-hidden` 뷰포트(`data-slot="carousel-content"`), 안쪽은 슬라이드가 늘어서는 flex 트랙입니다.
넘긴 `className`은 **안쪽 트랙**에 적용됩니다. 그래서 `-ml-4` 같은 간격 보정은 잘 먹지만, 뷰포트 자체의 높이·마스크를 조정하려면 `data-slot` 선택자로 바깥 div를 잡아야 합니다.
:::

---


## 동작 옵션
---
캐러셀의 **동작**은 대부분 루트 `Carousel`의 prop과 `CarouselItem`의 폭 클래스로 결정됩니다.


### 1. 한 화면에 몇 장 — `basis-*`

몇 장이 동시에 보일지는 **`CarouselItem`의 `basis` 유틸리티**가 정합니다. 루트 prop이 아닙니다.

---
<img src="../assets/ui/carousel-basis.png" alt="carousel 여러장 보이기 옵션" width="100%" />

```tsx
// 한 번에 3장
<CarouselItem className="basis-1/3">…</CarouselItem>

// 반응형: 모바일 1장 → md 2장 → lg 3장
<CarouselItem className="md:basis-1/2 lg:basis-1/3">…</CarouselItem>
```

* 기본값은 `basis-full`(한 번에 한 장)입니다.
* `basis-1/3`처럼 나누어떨어지지 않는 값을 쓰면 옆 슬라이드가 살짝 걸쳐 보여, **더 있다는 신호**가 됩니다.


### 2. 슬라이드 간격 — `-ml-*` / `pl-*` 한 쌍

간격은 **트랙을 음수 마진으로 당기고, 각 아이템에 같은 크기의 패딩을 주는** 방식입니다. 두 값을 반드시 **쌍으로 맞춥니다.**

---
<img src="../assets/ui/carousel-margin.png" alt="carousel 간격" width="100%" />
```tsx
<Carousel>
  <CarouselContent className="-ml-1">
    <CarouselItem className="pl-1 basis-1/2">…</CarouselItem>
    <CarouselItem className="pl-1 basis-1/2">…</CarouselItem>
  </CarouselContent>
</Carousel>
```

* 기본값이 이미 `-ml-4` / `pl-4`(세로는 `-mt-4` / `pt-4`)입니다. **그대로 쓰면 별도 지정이 필요 없습니다.**
* 간격을 바꿀 때만 두 곳을 같은 값(`-ml-2` + `pl-2` 등)으로 함께 교체하세요. 한쪽만 바꾸면 **첫 슬라이드가 밀리거나 잘립니다.**


### 3. 방향 — `orientation`

---
<img src="../assets/ui/carousel-vertical.png" alt="carousel 방향" width="100%" />
```tsx
<Carousel orientation="vertical" className="h-48 w-full max-w-sm">
  <CarouselContent className="-mt-4 h-48">
    <CarouselItem className="pt-4 basis-1/3">…</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

* `"horizontal"`(기본) / `"vertical"` 두 가지입니다.
* **세로 방향은 높이를 직접 잡아야 합니다.** 루트와 `CarouselContent` 양쪽에 `h-*`를 지정하지 않으면 슬라이드가 접힙니다.
* 세로일 때 버튼은 위(`-top-12`)/아래(`-bottom-12`)로 이동하고 `rotate-90`이 적용됩니다. 상하 여백(`py-14` 등)을 확보하세요.

:::caution `opts.axis`는 쓰지 마세요
루트가 `orientation`으로 `axis`를 덮어쓰기 때문에, `opts={{ axis: 'y' }}`를 넘겨도 **무시됩니다.** 방향은 항상 `orientation` prop으로 지정하세요.
:::


### 4. Embla 옵션 — `opts`

순환·정렬·이동 단위 등 스크롤 동작은 `opts`로 넘깁니다. (전체 목록은 [Embla 옵션 레퍼런스](#opts--embla-옵션) 참고)

```tsx
<Carousel opts={{ loop: true, align: 'start' }}>
  <CarouselContent>
    <CarouselItem className="basis-1/2">…</CarouselItem>
  </CarouselContent>
</Carousel>
```

* `loop: true` — 마지막에서 처음으로 **되감기 없이** 이어집니다. (`loop`가 없으면 끝에 닿았을 때 역방향으로 주르륵 되감기는 모습이 보입니다.)
* `align: "start"` — 슬라이드를 왼쪽 기준으로 붙입니다. 카드 목록에 적합합니다. (기본값은 `"center"`)


### 5. 플러그인 — `plugins` (자동재생)

Embla 플러그인을 배열로 넘깁니다. 자동재생은 `embla-carousel-autoplay`를 사용합니다(scaffold에 이미 포함).

---
<img src="../assets/ui/carousel-autoplay.gif" alt="2초 간격 자동재생 캐러셀" width="100%" />

```tsx
import { useRef } from 'react';
import Autoplay from 'embla-carousel-autoplay';

// 렌더링마다 새 인스턴스가 만들어지지 않도록 useRef 로 고정
const plugin = useRef(Autoplay({ delay: 2000, stopOnInteraction: true }));

<Carousel opts={{ loop: true }} plugins={[plugin.current]}>
  <CarouselContent>
    <CarouselItem>…</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

* **`useRef` 필수** — 렌더 중에 `Autoplay(...)`를 그대로 호출하면 리렌더마다 플러그인이 새로 만들어져 재생이 끊깁니다.
* **`loop: true`와 함께 쓰세요** — 없으면 마지막 장에서 첫 장으로 되감기는 역방향 애니메이션이 보입니다.
* `stopOnInteraction: true`면 사용자가 한 번이라도 조작한 뒤에는 자동재생이 멈춥니다.


### 6. 외부에서 제어 — `setApi`

현재 인덱스 표시, 인디케이터(점), 외부 버튼 연동 등은 **Embla API 인스턴스**를 받아서 처리합니다.

```tsx
import { useEffect, useState } from 'react';
import { type CarouselApi } from '@axiom/components/ui';

function Example() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);
    // highlight-next-line
    api.on('select', () => setCurrent(api.selectedScrollSnap() + 1));
  }, [api]);

  return (
    <>
      <Carousel setApi={setApi}>…</Carousel>
      <p>슬라이드 {current} / {count}</p>
      <button onClick={() => api?.scrollTo(0)}>처음으로</button>
    </>
  );
}
```

* `api`는 **처음 렌더에서 `undefined`** 입니다. 반드시 `if (!api) return;`으로 가드하세요.
* `scrollSnapList().length`가 슬라이드 "페이지" 수, `selectedScrollSnap()`이 0-based 현재 인덱스입니다.
* 자주 쓰는 메서드: `scrollTo(index)` · `scrollPrev()` · `scrollNext()` · `canScrollNext()`.

:::note 컴포넌트 안이라면 `useCarousel()`
`Carousel`의 **자식 컴포넌트** 안에서라면 `setApi` 없이 `useCarousel()` 훅으로 `api` · `scrollPrev` · `scrollNext` · `canScrollPrev` · `canScrollNext`를 바로 꺼낼 수 있습니다. 커스텀 화살표·인디케이터를 만들 때 이쪽이 간단합니다. (`Carousel` 밖에서 호출하면 에러를 던집니다.)
:::

---


## API 레퍼런스
---

각 파트는 기본 HTML 속성(`Carousel`·`CarouselContent`·`CarouselItem`은 `div`, 버튼 2종은 scaffold `Button`의 props)을 그대로 전달받습니다. 자주 쓰는 것만 정리합니다.

### `Carousel` (루트)

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | 스크롤 방향 |
| `opts` | `EmblaOptionsType` | — | Embla 옵션 (`loop`, `align` 등) |
| `plugins` | `EmblaPluginType[]` | — | Embla 플러그인 배열 (Autoplay 등) |
| `setApi` | `(api: CarouselApi) => void` | — | API 인스턴스를 외부 state로 넘겨받음 |
| `className` | `string` | — | 루트(`relative`)에 추가할 클래스 |

### `CarouselContent`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `className` | `string` | `-ml-4` / `-mt-4` | **안쪽 flex 트랙**에 적용. 슬라이드 간격 보정용 |

### `CarouselItem`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `className` | `string` | `basis-full` + `pl-4` / `pt-4` | 슬라이드 폭(`basis-*`)과 간격 패딩 |

### `CarouselPrevious` / `CarouselNext`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `variant` | `Button`의 variant | `"outline"` | 버튼 스타일 |
| `size` | `Button`의 size | `"icon-sm"` | 버튼 크기 |
| `className` | `string` | — | 위치 조정용 (기본은 캐러셀 **바깥쪽** 절대 위치) |

* `disabled`는 **컴포넌트가 자동으로** 관리합니다(`canScrollPrev` / `canScrollNext`). 직접 넘길 필요 없습니다.
* 아이콘은 `ChevronLeftIcon` / `ChevronRightIcon`이 고정이며, 스크린리더용 `"Previous slide"` / `"Next slide"` 텍스트가 들어 있습니다.

### `opts` — Embla 옵션

자주 쓰는 것부터 정리했습니다. 전체 목록은 [Embla 옵션 문서](https://www.embla-carousel.com/api/options/)를 참고하세요.

| 옵션 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `loop` | `boolean` | `false` | 무한 순환. 되감기 없이 같은 방향으로 이어집니다. Autoplay와 함께 권장 |
| `align` | `"start" \| "center" \| "end"` | `"center"` | 뷰포트 안에서 슬라이드를 정렬할 기준 |
| `slidesToScroll` | `number \| "auto"` | `1` | 한 번에 이동할 슬라이드 수. `"auto"`는 보이는 만큼 그룹 이동 |
| `startIndex` | `number` | `0` | 최초 렌더 시작 인덱스 |
| `containScroll` | `false \| "trimSnaps" \| "keepSnaps"` | `"trimSnaps"` | 앞뒤 여백이 생기지 않게 스크롤을 가둠. `loop: true`면 무시 |
| `duration` | `number` | `25` | 전환 속도(클수록 느림). ms가 아닌 Embla 자체 단위 |
| `dragFree` | `boolean` | `false` | 스냅 없이 관성으로 자유 스크롤 |
| `watchDrag` | `boolean \| fn` | `true` | `false`면 드래그 비활성화(버튼·API로만 이동) |
| `skipSnaps` | `boolean` | `false` | 빠른 드래그 시 중간 스냅 건너뛰기 허용 |
| `breakpoints` | `{ [mediaQuery]: EmblaOptionsType }` | `{}` | 미디어쿼리별 옵션 오버라이드 |
| `active` | `boolean` | `true` | `false`면 캐러셀을 끄고 정적 목록처럼 동작 |
| `axis` | `"x" \| "y"` | `"x"` | **직접 쓰지 마세요** — `orientation`이 덮어씁니다 |
| `direction` | `"ltr" \| "rtl"` | `"ltr"` | 콘텐츠 진행 방향(RTL 지원) |

---


## 접근성 / 키보드
---

| 키 | 동작 |
| --- | --- |
| `←` (Arrow Left) | 이전 슬라이드 |
| `→` (Arrow Right) | 다음 슬라이드 |
| `Tab` | 이전/다음 버튼으로 포커스 이동 |
| `Enter` / `Space` | 포커스된 이전/다음 버튼 실행 |

* 루트에 `role="region"` + `aria-roledescription="carousel"`, 각 슬라이드에 `role="group"` + `aria-roledescription="slide"`가 자동으로 붙습니다.
* 화살표 키는 **캐러셀 영역 안에 포커스가 있을 때** 동작합니다(루트의 `onKeyDownCapture`).
* 캐러셀이 무엇인지 알리려면 루트에 이름을 붙이세요 → `<Carousel aria-label="추천 상품">`

:::caution 세로 방향도 키는 ←/→ 입니다
`orientation="vertical"`이어도 키보드 조작은 **좌우 화살표**에 매핑되어 있습니다(↑/↓ 아님). 세로 캐러셀에서 위/아래 키를 기대한다면, `setApi`로 받은 api에 직접 `keydown` 핸들러를 붙여 보완하세요.
:::

* 자동재생을 쓸 때는 `stopOnInteraction: true`를 유지하세요. 사용자가 읽는 도중 화면이 바뀌는 것을 막아줍니다.

---


## 스타일링 & 테마
---

Carousel은 아코디언과 달리 **전용 CSS 변수(테마 계약)가 없습니다.** 모양은 아래 세 가지로 조정합니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 슬라이드 폭·간격 | `CarouselItem` / `CarouselContent`의 **Tailwind 클래스** |
| 버튼 위치·모양 | `CarouselPrevious` / `CarouselNext`의 `className` · `variant` · `size` |
| 뷰포트 자체(높이·마스크·페이드) | **`data-slot` 선택자 + CSS Module** |

### 1. 버튼을 캐러셀 안쪽으로

기본 버튼은 캐러셀 **바깥**(`-left-12` / `-right-12`)에 놓입니다. 여백을 줄 수 없는 배너라면 안쪽으로 당깁니다.

```tsx
<CarouselPrevious className="left-3 bg-white/80 backdrop-blur" />
<CarouselNext className="right-3 bg-white/80 backdrop-blur" />
```

* `className`은 기본 클래스 **뒤에** 병합되므로(`cn`), `left-3`이 `-left-12`를 덮습니다.
* 세로 방향이면 `top-3` / `bottom-3`으로 같은 방식으로 조정합니다.

### 2. `data-slot` + CSS Module

컴포넌트가 노출하는 슬롯을 CSS Module에서 오버라이드합니다.

| data-slot | 대상 |
| --- | --- |
| `[data-slot="carousel"]` | 루트(`position: relative`) |
| `[data-slot="carousel-content"]` | **뷰포트**(`overflow-hidden`) — 안쪽 flex 트랙이 아님 |
| `[data-slot="carousel-item"]` | 슬라이드 한 장 |
| `[data-slot="carousel-previous"]` | 이전 버튼 |
| `[data-slot="carousel-next"]` | 다음 버튼 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯 2~3단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */

/* 뷰포트 양끝을 페이드 처리 — '더 있다'는 신호 */
.wrap :global([data-slot='carousel']) :global([data-slot='carousel-content']) {
  mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  border-radius: 16px;
}

/* 버튼을 안쪽 원형 글래스 버튼으로 */
.wrap :global([data-slot='carousel']) :global([data-slot='carousel-previous']) {
  left: 12px;
  border: none;
  background: rgb(255 255 255 / 0.75);
  backdrop-filter: blur(6px);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...] [data-slot=...]`처럼 **래퍼+슬롯을 여러 단계로 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 3. 색상은 디자인 토큰으로

버튼은 scaffold `Button`을 그대로 쓰므로 색은 전역 디자인 토큰(`--primary`, `--border`, `--ring` 등)을 따릅니다. carousel 전용 색 변수를 새로 만들지 마세요.

---


## 실전 예제
---

scaffold의 예제 컴포넌트에 실제로 들어 있는 코드입니다.

### 1. 현재 위치 표시 (setApi 활용)

`setApi`로 Embla 인스턴스를 받아 **현재 슬라이드 / 전체 개수**를 캐러셀 밖에 표시하는 패턴입니다. 인디케이터(점), 진행바, "3/5" 카운터가 모두 이 구조에서 파생됩니다.

**포인트**

* 상태(`current`, `count`)는 캐러셀 **바깥의 내 state**입니다. 슬라이드 이동 자체는 컴포넌트가 담당합니다.
* `api`가 준비되기 전(`undefined`)을 반드시 가드합니다.
* `api.on('select', …)`로 사용자가 드래그·버튼·키보드 중 무엇으로 넘겨도 동일하게 동기화됩니다.


---
<img src="../assets/ui/carousel-setapi.png" alt="carousel setApi활용" width="100%" />

<details>
<summary><b>ApiCarouselDemo.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/ApiCarouselDemo.tsx"
import { useEffect, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@axiom/components/ui';

const COLORS = [
  'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300',
  'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300',
  // … 나머지 색상 생략
];

export default function ApiCarouselDemo(): React.ReactNode {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    // highlight-next-line
    if (!api) return; // 최초 렌더에서는 api 가 undefined
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);
    // highlight-next-line
    api.on('select', () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
      {/* 버튼이 바깥에 붙으므로 좌우 여백(px-16)을 확보한다 */}
      <div className="p-5 px-16 space-y-3">
        // highlight-next-line
        <Carousel setApi={setApi}>
          <CarouselContent>
            {COLORS.map((color, i) => (
              <CarouselItem key={i}>
                <div className={`flex items-center justify-center h-32 rounded-xl text-4xl font-bold ${color}`}>
                  {i + 1}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          슬라이드 <span className="font-semibold text-gray-800 dark:text-gray-200">{current}</span> / {count}
        </p>
      </div>
    </div>
  );
}
```

</details>

:::tip 인디케이터(점)로 확장하기
위 구조에 `api.scrollTo(i)`만 얹으면 바로 점 인디케이터가 됩니다.

```tsx
{Array.from({ length: count }).map((_, i) => (
  <button
    key={i}
    aria-label={`${i + 1}번 슬라이드로 이동`}
    aria-current={current === i + 1}
    onClick={() => api?.scrollTo(i)}
  />
))}
```
:::


### 2. 자동재생 배너

메인 배너처럼 **가만히 둬도 넘어가고, 사용자가 만지면 멈추는** 패턴입니다.

**포인트**

* 플러그인 인스턴스를 `useRef`로 고정 — 리렌더마다 새로 만들면 재생이 끊깁니다.
* `opts={{ loop: true }}` 필수 — 없으면 마지막 장에서 첫 장으로 **되감기는 역방향 애니메이션**이 보입니다.
* `stopOnInteraction: true`로 사용자가 조작한 뒤에는 자동 전환을 멈춥니다(접근성).

```tsx title="src/domains/example/pages/ui-components/CarouselComponent.tsx (발췌)"
import { useRef } from 'react';
import Autoplay from 'embla-carousel-autoplay';

export default function Banner(): React.ReactNode {
  // highlight-next-line
  const autoplayPlugin = useRef(Autoplay({ delay: 2000, stopOnInteraction: true }));

  return (
    // highlight-next-line
    <Carousel opts={{ loop: true }} plugins={[autoplayPlugin.current]}>
      <CarouselContent>
        {SLIDES.map((s, i) => (
          <CarouselItem key={i}>…</CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
```


### 3. 반응형 카드 목록

상품·콘텐츠 카드를 화면 폭에 따라 1~3장씩 보여주는 패턴입니다.

```tsx
<Carousel opts={{ align: 'start' }}>
  <CarouselContent className="-ml-4">
    {PRODUCTS.map((p) => (
      // highlight-next-line
      <CarouselItem key={p.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
        <ProductCard product={p} />
      </CarouselItem>
    ))}
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

* `align: "start"` + 나누어떨어지지 않는 `basis`로 다음 카드가 살짝 걸치게 하면 **더 있다는 신호**가 됩니다.
* 간격은 `-ml-4`(트랙)와 `pl-4`(아이템)를 **쌍으로** 맞춥니다.

:::tip 이 예제들에서 가져갈 것
슬라이드 이동·드래그·키보드·버튼 비활성화는 **전부 컴포넌트가 처리합니다.** 내가 작성하는 건 ①`opts` / `plugins` / `orientation` 같은 prop ②`basis-*` · `pl-*` 폭·간격 클래스 ③`setApi`로 받은 상태를 쓰는 **내 UI(카운터·인디케이터)** 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---
