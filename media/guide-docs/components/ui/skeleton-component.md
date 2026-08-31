---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Skeleton"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

# Skeleton 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 로딩 플레이스홀더 컴포넌트입니다.  
데이터를 불러오는 동안 **콘텐츠가 들어갈 자리를 미리 회색 블록으로 잡아** 화면이 비어 보이거나 로딩 후 레이아웃이 튀는 것을 막습니다.

**언제 쓰나요?**

- 목록·카드·상세처럼 **모양이 예측되는 콘텐츠**를 API로 불러오는 동안
- 로딩이 끝난 뒤 **레이아웃이 흔들리면 안 되는** 화면(거래내역, 계좌 요약, 대시보드)
- 첫 진입 로딩(초기 렌더)에서 "빈 화면"을 보여주고 싶지 않을 때

:::caution Spinner와 Skeleton, 무엇을 쓸까

- **Skeleton** — 결과물의 **형태를 알 때**. 목록/카드/표처럼 자리를 미리 잡아줄 수 있는 영역.
- **Spinner** — 결과물의 형태를 **모를 때**, 또는 버튼 제출·짧은 처리처럼 **영역이 작을 때**. ([Spinner 문서](./spinner-component))

두 개를 한 영역에 겹쳐 쓰지 마세요. 같은 자리에서 스피너와 스켈레톤이 동시에 돌면 로딩이 두 번 일어난 것처럼 보입니다.
:::

:::tip 퍼블리셔 참고
Skeleton은 **전용 prop이 하나도 없는** 컴포넌트입니다(내부는 `<div>` 하나). 그래서 모양은 전부 `className`, 톤앤매너(애니메이션·색·모서리)는 `*.module.css`의 `[data-slot="skeleton"]` 선택자로 정합니다. 자세한 내용은 [스타일링 & 테마](#스타일링--테마)를 보세요.
:::

---

## Import

---

```tsx
import { Skeleton } from "@axiom/components/ui";
```

합성(compound) 컴포넌트가 아니라 **단일 컴포넌트**입니다. 여러 개를 배치해 "형태"를 만드는 것은 사용하는 화면 쪽의 몫입니다.

---

## 기본 사용법

---

높이(`h-*`)와 너비(`w-*`)만 주면 가장 단순한 막대형 스켈레톤이 됩니다.

<img
  src="../assets/ui/skeleton-basic.gif"
  alt="스켈레톤 기본 예제"
  width="60%"
/>

```tsx
{
  /* 한 줄짜리 텍스트 자리 */
}
<Skeleton className="h-4 w-[250px]" />;

{
  /* 아바타(원형) 자리 */
}
<Skeleton className="h-12 w-12 rounded-full" />;
```

:::caution 크기를 주지 않으면 보이지 않습니다
Skeleton은 내용이 없는 빈 `<div>`라서 **높이가 0**입니다. `h-*`(또는 `min-h-*`, 부모의 `flex`/`grid` 늘어남)를 반드시 지정하세요. 너비는 부모가 블록이면 자동으로 100%가 되지만, 텍스트 줄을 흉내 낼 때는 `w-1/2`, `w-4/5`처럼 **의도한 비율**을 주는 편이 자연스럽습니다.
:::

---

## 구성 (Anatomy)

---

Skeleton은 **`<div>` 한 개**가 전부입니다. 실제 구현은 아래와 같습니다.

```tsx title="src/shared/lib/shadcn/ui/skeleton.tsx"
import { cn } from "@/shared/utils/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

| 요소                         | 역할                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `<div data-slot="skeleton">` | 스켈레톤 블록 그 자체. 스타일 오버라이드용 선택자                        |
| `animate-pulse`              | 은은하게 밝아졌다 어두워지는 기본 애니메이션(opacity `1` ↔ `.5`)         |
| `rounded-md`                 | 기본 모서리. `rounded-full` 등으로 덮어쓸 수 있음                        |
| `bg-muted`                   | 블록 색. 디자인 토큰 `--muted`를 따름(라이트 `#f1f4f8` / 다크 `#1d2939`) |

:::note `className`은 기본 클래스를 "이깁니다"
`cn()`은 내부적으로 `tailwind-merge`를 쓰기 때문에, 같은 계열의 유틸리티를 넘기면 **기본값이 교체**됩니다. 예를 들어 `rounded-full`을 넘기면 `rounded-md`가 사라지고, `bg-slate-200`을 넘기면 `bg-muted`가 사라집니다. 두 클래스가 충돌해서 어중간하게 섞이는 일은 없습니다.
:::

**"형태"는 조합으로 만듭니다.** Skeleton 하나는 블록 하나일 뿐이고, 실제 콘텐츠와 같은 레이아웃(`flex`·`grid`·`space-y-*`)으로 블록들을 배치하는 것이 핵심입니다.

```tsx
{
  /* 아바타 + 2줄 텍스트 = 프로필 카드 자리 */
}
<div className="flex items-center gap-4">
  <Skeleton className="h-12 w-12 rounded-full" />
  <div className="space-y-2 flex-1">
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-3 w-3/4" />
  </div>
</div>;
```

---

## 사용 패턴

---

Skeleton은 prop이 없으므로, "옵션"이 아니라 **배치 패턴**을 익히는 것이 사용법의 전부입니다. 아래 6가지로 실무 케이스의 대부분이 커버됩니다.

### 1. 모양 — `rounded-*`

자리에 들어갈 **실제 요소의 모양**에 맞춥니다.

<img
  src="../assets/ui/skeleton-shapes.gif"
  alt="스켈레톤 모양 예제"
  width="60%"
/>

```tsx
{
  /* 원형 — 아바타/아이콘 자리 */
}
<Skeleton className="h-14 w-14 rounded-full" />;

{
  /* 둥근 사각형 — 썸네일/버튼 자리 */
}
<Skeleton className="h-14 w-14 rounded-xl" />;

{
  /* 넓은 배너/이미지 자리 */
}
<Skeleton className="h-14 w-40 rounded-md" />;
```

- 아바타 자리에 사각 블록을 쓰면 로딩이 끝나는 순간 모양이 바뀌어 눈에 띕니다. **모양까지 맞추세요.**
- 버튼 자리는 실제 버튼의 `rounded`·높이(`h-9`/`h-10`)를 그대로 씁니다.

### 2. 텍스트 여러 줄

줄을 쌓고 **마지막 줄만 짧게** 하면 문단처럼 보입니다.

```tsx
<div className="space-y-3">
  <Skeleton className="h-5 w-1/3" /> {/* 제목 */}
  <Skeleton className="h-3 w-full" />
  <Skeleton className="h-3 w-full" />
  <Skeleton className="h-3 w-4/5" /> {/* 마지막 줄은 짧게 */}
</div>
```

- 줄 높이(`h-3`/`h-4`)는 실제 폰트 크기보다 **약간 작게** 잡는 편이 자연스럽습니다(글자에는 행간 여백이 있으므로).
- 줄 간격은 `space-y-2` ~ `space-y-3` 정도가 무난합니다.

### 3. 목록 — 반복 렌더링

목록·표 로딩은 **같은 행 스켈레톤을 N번 반복**합니다.

<img
  src="../assets/ui/skeleton-list.gif"
  alt="스켈레톤 반복 렌더링 예제"
  width="60%"
/>

```tsx
<div className="space-y-4">
  {Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="flex items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-16" />
    </div>
  ))}
</div>
```

- 반복 개수는 **실제로 표시될 행 수(페이지 사이즈)** 와 비슷하게 맞춥니다. 10건을 불러오는데 3줄만 그리면 로딩 후 화면이 아래로 늘어납니다.
- `key`는 인덱스로 충분합니다(정렬·추가·삭제가 없는 정적 자리이므로).

### 4. 로딩 → 실제 콘텐츠 전환

실전에서 가장 흔한 형태입니다. `isLoading`으로 **조건부 렌더링**합니다.

<img
  src="../assets/ui/skeleton-interactive-transition.gif"
  alt="로딩 → 실제 콘텐츠 전환 예제"
  width="80%"
/>

```tsx
const [isLoading, setIsLoading] = useState(true);

return isLoading ? (
  <div className="flex items-center gap-4">
    <Skeleton className="h-16 w-16 rounded-2xl" />
    <div className="space-y-2 flex-1">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  </div>
) : (
  <ProfileCard {...data} /> // 실제 콘텐츠
);
```

- 스켈레톤과 실제 콘텐츠의 **바깥 레이아웃(`flex items-center gap-4`)을 동일하게** 유지하면 전환 시 흔들림이 없습니다.
- 데이터 실패(에러) 상태는 스켈레톤이 아닌 **별도 UI**로 분기하세요. 실패했는데 스켈레톤이 계속 돌면 영구 로딩처럼 보입니다.

### 5. 레이아웃 시프트(튐) 막기

스켈레톤을 쓰는 **가장 큰 이유**입니다. 로딩 전후 높이가 다르면 스켈레톤을 쓴 의미가 없습니다.

```tsx
{
  /* ❌ 로딩 중엔 44px, 로딩 후엔 68px → 아래 내용이 밀린다 */
}
{
  isLoading ? <Skeleton className="h-4 w-40" /> : <AccountSummary />;
}

{
  /* ✅ 실제 콘텐츠와 같은 높이의 컨테이너로 감싼다 */
}
<div className="h-[68px] flex items-center">
  {isLoading ? <Skeleton className="h-4 w-40" /> : <AccountSummary />}
</div>;
```

- 가장 확실한 방법은 **로딩/완료가 같은 컨테이너를 공유**하는 것입니다. 아래 [실전 예제](#실전-예제)의 `.row` 그리드가 정확히 이 구조입니다.
- 높이를 하드코딩하기 어렵다면, 스켈레톤 조각의 높이·개수를 실제 텍스트 줄 수와 맞추는 편이 낫습니다.

### 6. 짧은 로딩에는 표시를 늦추기

응답이 100ms만에 오는데 스켈레톤이 깜빡이면 오히려 **더 느려 보입니다**(플래시 현상). 지연 표시를 걸면 빠른 응답에서는 스켈레톤이 아예 나타나지 않습니다.

```tsx
const [showSkeleton, setShowSkeleton] = useState(false);

useEffect(() => {
  if (!isLoading) {
    setShowSkeleton(false);
    return;
  }
  // 200ms 안에 끝나는 로딩은 스켈레톤을 아예 보여주지 않는다
  const t = setTimeout(() => setShowSkeleton(true), 200);
  return () => clearTimeout(t);
}, [isLoading]);

return showSkeleton ? (
  <ListSkeleton />
) : isLoading ? null : (
  <List data={data} />
);
```

- 반대로 **한 번 보여줬으면 최소 300~500ms는 유지**하는 처리도 자주 씁니다(나타났다 바로 사라지는 깜빡임 방지).
- 폐쇄망 사내 API처럼 응답이 대체로 빠른 환경이면 이 패턴을 기본으로 두는 편이 체감이 좋습니다.

---

## API 레퍼런스

---

### Props

Skeleton은 **전용 prop이 없습니다.** `<div>`의 표준 속성을 그대로 받습니다.

| Prop        | 타입                          | 기본값 | 설명                                                                                                                    |
| ----------- | ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `className` | `string`                      | —      | 크기(`h-*` `w-*`)·모양(`rounded-*`)·색(`bg-*`)을 지정. 기본 클래스와 `tailwind-merge`로 병합되며 **같은 계열은 교체**됨 |
| `...props`  | `React.ComponentProps<'div'>` | —      | `style`, `onClick`, `aria-*`, `data-*` 등 `div` 표준 속성을 그대로 전달                                                 |

:::note `children`은 넣지 않습니다
타입상 `children`을 받을 수는 있지만, 스켈레톤 블록 안에 실제 콘텐츠를 넣으면 `animate-pulse` 때문에 **내용이 같이 깜빡입니다.** 자리만 잡는 용도로 비워 두세요.
:::

### 자동으로 붙는 속성

| 속성        | 값           | 용도                                                |
| ----------- | ------------ | --------------------------------------------------- |
| `data-slot` | `"skeleton"` | CSS Module에서 겉모습을 오버라이드할 때 쓰는 선택자 |

---

## 접근성

---

Skeleton은 **시각적 장식**입니다. 스크린리더에는 "회색 박스가 12개 있다"가 아니라 **"불러오는 중"** 이라는 사실만 전달되어야 합니다.

### 1. 로딩 영역에 상태를 알리기

```tsx
{
  /* 로딩 영역을 감싸고 상태를 알린다 */
}
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? (
    <>
      {/* 장식용 블록들은 보조기기에서 숨긴다 */}
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <span className="sr-only">거래내역을 불러오는 중입니다.</span>
    </>
  ) : (
    <TransactionList data={data} />
  )}
</div>;
```

| 속성                    | 어디에              | 이유                               |
| ----------------------- | ------------------- | ---------------------------------- |
| `aria-busy={isLoading}` | 로딩 영역 컨테이너  | 이 영역이 갱신 중임을 알림         |
| `aria-hidden="true"`    | 스켈레톤 블록(묶음) | 의미 없는 빈 박스가 읽히지 않도록  |
| `sr-only` 텍스트        | 로딩 영역 안        | "불러오는 중"을 실제로 읽어줄 문구 |

- 블록마다 `aria-hidden`을 붙이지 말고 **묶는 `div` 한 곳에** 붙이면 충분합니다.
- `role="status"`를 쓰면 `aria-live="polite"`가 함축되므로, 짧은 안내 문구를 담는 요소에 사용해도 됩니다.

### 2. 모션 최소화 설정 존중

Tailwind의 `animate-pulse`는 **`prefers-reduced-motion`을 자동으로 따르지 않습니다.** 애니메이션에 민감한 사용자를 위해 페이지/컴포넌트 스코프에서 꺼 주세요.

```css
@media (prefers-reduced-motion: reduce) {
  .wrap :global([data-slot="skeleton"]) {
    animation: none;
  }
}
```

- 완전히 끄는 대신 **은은한 페이드만 남기는** 방식도 좋습니다. 실제 구현은 [실전 예제](#실전-예제)의 `TransactionListSkeleton.module.css`를 보세요.
- Tailwind만으로 처리하려면 `motion-safe:animate-pulse`를 쓰는 방법도 있습니다.

---

## 스타일링 & 테마

---

**바꾸려는 대상에 따라 방법이 다릅니다.** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                                         | 방법                                                |
| --------------------------------------------------- | --------------------------------------------------- |
| 개별 블록의 크기·모양                               | 그 블록의 **`className`** (`h-*` `w-*` `rounded-*`) |
| 이 인스턴스 한 개의 색                              | **`className`** (`bg-slate-200 dark:bg-slate-700`)  |
| 앱 전체 스켈레톤 색                                 | **디자인 토큰 `--muted`**                           |
| 애니메이션 종류(펄스 → shimmer), 화면 단위 톤앤매너 | **`data-slot` 선택자 + CSS Module**                 |

### 1. `data-slot` 목록

| data-slot                | 대상                                |
| ------------------------ | ----------------------------------- |
| `[data-slot="skeleton"]` | 스켈레톤 블록 그 자체 (유일한 슬롯) |

### 2. 색은 디자인 토큰으로

기본 색은 `bg-muted` → 토큰 `--muted`입니다. **앱 전체의 스켈레톤 색**을 바꾸려면 테마 파일의 토큰을 조정하세요. 스켈레톤 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다.

```css title="src/assets/styles/themes/theme-default.css"
:root {
  --muted: #f1f4f8; /* 라이트 */
}
.dark {
  --muted: #1d2939; /* 다크 */
}
```

한 화면에서만 다르게 쓸 거라면 토큰을 건드리지 말고 `className`으로 끝내세요.

```tsx
<Skeleton className="h-4 w-40 bg-slate-200 dark:bg-slate-700" />
```

### 3. 겉모습 전면 교체 — `data-slot` + CSS Module

기본 "펄스(깜빡임)"를 **"좌 → 우로 흐르는 shimmer"** 로 갈아끼우는 것이 가장 흔한 요구입니다. 래퍼 + 슬롯 선택자로 명시도를 확보한 뒤 덮어씁니다.

```css title="예: MyList.module.css"
.wrap {
  --sk-base: #e6eeee; /* 바탕색 */
  --sk-hi: #f5faf9; /* 흘러가는 하이라이트 */
}

/* .wrap + [data-slot] 2단계로 Tailwind 유틸리티보다 명시도 확보 */
.wrap :global([data-slot="skeleton"]) {
  background: linear-gradient(
    90deg,
    var(--sk-base) 25%,
    var(--sk-hi) 50%,
    var(--sk-base) 75%
  );
  background-size: 200% 100%;
  border-radius: 8px;
  /* Tailwind animate-pulse 를 shimmer 로 덮어씀 */
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap :global([data-slot='skeleton'])`처럼 **래퍼 + 슬롯을 겹쳐** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

:::caution 슬롯 규칙이 조각별 크기 클래스를 이깁니다
`.wrap :global([data-slot='skeleton'])`(명시도 0,2,0)이 `border-radius`를 정해 두면, 개별 조각에 준 CSS Module 클래스 `.avatar`(0,1,0)로는 **덮어쓸 수 없습니다.** 아래 둘 중 하나로 해결하세요.

```css
/* 방법 A — 슬롯과 내 클래스를 겹쳐 명시도를 올린다 (권장) */
.wrap :global([data-slot="skeleton"]).avatar {
  border-radius: 50%;
}

/* 방법 B — !important (실전 예제에서 쓴 방식) */
.avatar {
  border-radius: 12px !important;
}
```

:::

### 4. 애니메이션 끄기

```tsx
{
  /* Tailwind로: 기본 애니메이션 클래스를 제거 */
}
<Skeleton className="h-4 w-40 animate-none" />;
```

`animate-none`은 `tailwind-merge`가 `animate-pulse`와 같은 계열로 인식해 **교체**합니다. 화면 단위로 끄려면 위 CSS Module 방식에서 `animation: none;`을 쓰세요.

---

## 실전 예제

---

제공 `Skeleton`을 **그대로 쓰되**, `*.module.css`의 `data-slot` 선택자로 기본 펄스를 **shimmer**로 갈아끼우고 색·모서리를 NIC 뱅킹 톤(청록)으로 재정의한 예제입니다. scaffold `UI Components > Skeleton` 화면 하단에서 "다시 불러오기"로 로딩 상태를 반복 확인할 수 있습니다.

### 거래내역 목록 로딩

<img
  src="../assets/ui/skeleton-transaction-shimmer.gif"
  alt="skeleton 거래내역 목록 실전 예제"
  width="100%"
/>

**포인트**

- 로딩 행과 실제 행이 **같은 `.row` 그리드(`44px 1fr auto`)** 를 공유합니다 → 전환 시 레이아웃이 전혀 튀지 않습니다.
- 애니메이션·색·모서리는 전부 `[data-slot="skeleton"]` 오버라이드. **컴포넌트는 손대지 않았습니다.**
- 각 조각의 크기(폭·높이)는 컴포넌트에서 `className`으로 지정(`.avatar` `.lineTitle` `.lineSub` …).
- `prefers-reduced-motion: reduce`에서는 흐름을 멈추고 은은한 페이드만 남깁니다.

<details>
<summary><b>TransactionListSkeleton.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/skeleton/TransactionListSkeleton.tsx"
import { useEffect, useState } from "react";
import { Skeleton } from "@axiom/components/ui";
import styles from "./TransactionListSkeleton.module.css";

/** 로딩이 끝난 뒤 보여줄 실제 거래 한 건 */
interface ITransaction {
  id: string;
  counterparty: string;
  memo: string;
  type: "입금" | "출금";
  amount: number;
  dateTime: string;
}

const TRANSACTIONS: ITransaction[] = [
  {
    id: "tx-1",
    counterparty: "(주)레드스카이",
    memo: "급여",
    type: "입금",
    amount: 3200000,
    dateTime: "07.17 09:05",
  },
  {
    id: "tx-2",
    counterparty: "김닉",
    memo: "월세 이체",
    type: "출금",
    amount: 850000,
    dateTime: "07.18 14:32",
  },
  // … 나머지 거래 데이터 생략
];

function won(value: number): string {
  return value.toLocaleString("ko-KR");
}

export default function TransactionListSkeleton(): React.ReactNode {
  const [loading, setLoading] = useState(true);

  // 데모용: 마운트/재실행 시 1.8초간 로딩 상태를 보여준 뒤 실제 데이터로 전환한다.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 1800);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.head}>
          <div className={styles.headTitle}>
            <span className={styles.mark}>NIC</span>
            <span>최근 거래내역</span>
          </div>
          <button
            type="button"
            className={styles.replay}
            onClick={() => setLoading(true)}
            disabled={loading}
          >
            {loading ? "불러오는 중…" : "다시 불러오기"}
          </button>
        </div>

        <ul className={styles.list}>
          {loading
            ? // ── 로딩 상태: Skeleton 재사용(스타일만 module.css로 오버라이드) ──
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className={styles.row}>
                  {/* highlight-start */}
                  <Skeleton className={styles.avatar} />
                  <div className={styles.rowMain}>
                    <Skeleton className={styles.lineTitle} />
                    <Skeleton className={styles.lineSub} />
                  </div>
                  <div className={styles.rowSide}>
                    <Skeleton className={styles.lineAmount} />
                    <Skeleton className={styles.lineDate} />
                  </div>
                  {/* highlight-end */}
                </li>
              ))
            : // ── 로딩 완료: 실제 거래 목록 (같은 .row 그리드를 공유) ──
              TRANSACTIONS.map((tx) => {
                const isIn = tx.type === "입금";
                return (
                  <li key={tx.id} className={styles.row}>
                    <span
                      className={`${styles.badge} ${isIn ? styles.badgeIn : styles.badgeOut}`}
                    >
                      {tx.type}
                    </span>
                    <div className={styles.rowMain}>
                      <span className={styles.counterparty}>
                        {tx.counterparty}
                      </span>
                      <span className={styles.memo}>{tx.memo}</span>
                    </div>
                    <div className={styles.rowSide}>
                      <span
                        className={`${styles.amount} ${isIn ? styles.amountIn : styles.amountOut}`}
                      >
                        {isIn ? "+" : "-"}
                        {won(tx.amount)}원
                      </span>
                      <span className={styles.date}>{tx.dateTime}</span>
                    </div>
                  </li>
                );
              })}
        </ul>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>TransactionListSkeleton.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/skeleton/TransactionListSkeleton.module.css"
.wrap {
  --sk-base: #e6eeee; /* 스켈레톤 바탕색 */
  --sk-hi: #f5faf9; /* 흘러가는 하이라이트 */
  --nic-teal: #008485;
  --nic-ink: #1b2b2a;
  --nic-sub: #8a9998;
  --nic-card: #ffffff;
  --nic-border: #e4ecec;
  /* … 이하 뱃지/금액 색 토큰 생략 */

  color: var(--nic-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --sk-base: #1c2b2b;
  --sk-hi: #2a4140;
  --nic-ink: #e8f1f0;
  --nic-card: #0f1a1a;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * scaffold Skeleton 슬롯 오버라이드
 * 기본 animate-pulse(깜빡임) → 좌→우 shimmer(흐름)로 교체하고 색/모서리 재정의.
 * (.wrap + [data-slot] 2단계 선택자로 Tailwind 유틸리티보다 명시도 확보)
 * ========================================================================= */
/* highlight-start */
.wrap :global([data-slot="skeleton"]) {
  background: linear-gradient(
    90deg,
    var(--sk-base) 25%,
    var(--sk-hi) 50%,
    var(--sk-base) 75%
  );
  background-size: 200% 100%;
  border-radius: 8px;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
/* highlight-end */

/* 접근성: 모션 최소화 설정 시 흐름을 멈추고 은은한 페이드만 남긴다. */
@media (prefers-reduced-motion: reduce) {
  .wrap :global([data-slot="skeleton"]) {
    animation: skFade 1.6s ease-in-out infinite;
    background: var(--sk-base);
  }
  @keyframes skFade {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
}

/* ── 행: 로딩/실제가 공유하는 레이아웃 (전환 시 시프트 0) ───── */
/* highlight-start */
.row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--nic-border);
}
/* highlight-end */
.rowMain {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rowSide {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  white-space: nowrap;
}

/* ── 로딩 조각 크기(모양) — className 으로 각 Skeleton에 지정 ─── */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px !important; /* 위 슬롯 규칙(8px)보다 명시도가 낮아 !important 필요 */
}
.lineTitle {
  width: 42%;
  height: 13px;
}
.lineSub {
  width: 64%;
  height: 11px;
}
.lineAmount {
  width: 84px;
  height: 13px;
}
.lineDate {
  width: 52px;
  height: 11px;
}

/* ── 실제 데이터 표시 — 스켈레톤 조각과 같은 크기로 맞춘다 ───── */
.badge {
  display: grid;
  place-items: center;
  width: 40px; /* .avatar 와 동일 */
  height: 40px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}
/* … 금액/날짜/상대방 텍스트 스타일 생략 */

/* ── 반응형 ─────────────────────────────────────────────── */
@media (max-width: 520px) {
  .row {
    grid-template-columns: 40px 1fr auto;
    padding: 12px 14px;
  }
}
```

</details>

:::tip 이 예제에서 가져갈 것
바꾼 것은 딱 세 가지입니다 — ①`[data-slot="skeleton"]` 오버라이드(펄스 → shimmer, 색·모서리) ②각 조각의 크기 `className` ③로딩/완료가 **공유하는 레이아웃**. 컴포넌트를 복사해서 고치지 마세요.
:::

---

## 참고 — scaffold 안에서 이미 쓰이는 곳

---

`SmartTable`은 서버 모드에서 데이터를 불러오는 동안 **내부적으로 이 Skeleton을 씁니다.** 표 로딩은 직접 스켈레톤을 그릴 필요 없이 `isLoading`만 넘기면 됩니다.

```tsx title="src/shared/ui/smart-table/parts/SmartTableSkeleton.tsx"
{
  Array.from({ length: rows }).map((_, r) => (
    <TableRow key={r} className="hover:bg-transparent">
      {Array.from({ length: colSpan }).map((__, c) => (
        <TableCell key={c}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ));
}
```

- 셀 폭은 `w-full`로 두고 **높이만 `h-4`** 로 고정하는 것이 표 스켈레톤의 기본형입니다.
- `SmartTable`의 스켈레톤 톤을 바꾸고 싶을 때도 방법은 같습니다 — 표를 감싼 래퍼에서 `[data-slot="skeleton"]`을 오버라이드하세요.

---
