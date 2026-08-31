---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Breadcrumb"
hide_table_of_contents: false
---

# Breadcrumb 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 경로 탐색(breadcrumb) 컴포넌트입니다.  
**지금 보고 있는 화면이 사이트 계층 어디쯤인지**를 한 줄로 보여주고, 상위 경로로 곧장 돌아갈 수 있게 해 줍니다.

**언제 쓰나요?**

- 메뉴 > 하위메뉴 > 상세처럼 **계층이 2단계 이상 깊은** 업무 화면의 상단
- 목록 → 상세 → 편집으로 이어지는 흐름에서 **상위 목록으로 한 번에** 돌아가야 할 때
- 관리자/포털처럼 **화면 수가 많아 현재 위치를 잃기 쉬운** 시스템

> Breadcrumb은 **스타일이 거의 없는 프리미티브**입니다. 색·간격·모양은 대부분 프로젝트에서 새로 입히게 되므로, 커스터마이징 방법을 먼저 확인해 두세요. (아래 [스타일링 & 테마](#스타일링--테마) 참고)

:::caution 탭·페이지네이션과 혼동하지 마세요
Breadcrumb은 **계층(상하 관계)** 을 나타냅니다. 같은 레벨의 화면을 오가는 것은 탭, 같은 목록의 페이지 이동은 페이지네이션입니다. "방문 기록(뒤로 가기)"을 나열하는 용도로도 쓰지 않습니다 — 어디까지나 **사이트 구조상의 위치**입니다.
:::

---

## Import

---

```tsx
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "@axiom/components/ui";
```

Breadcrumb은 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 기본 조합은 `Breadcrumb` + `BreadcrumbList` + `BreadcrumbItem` + `BreadcrumbLink`/`BreadcrumbPage` + `BreadcrumbSeparator`이고, `BreadcrumbEllipsis`는 경로가 길 때만 추가합니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---

## 기본 사용법

---

가장 기본적인 형태입니다. **이동 가능한 상위 경로는 `BreadcrumbLink`**, **지금 보고 있는 마지막 항목은 `BreadcrumbPage`** 로 쓰고, 항목 사이에 `BreadcrumbSeparator`를 넣습니다.

<img
  src="../assets/ui/breadcrumb-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="#/">홈</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="#/example/ui-components/button">
        UI Components
      </BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

- `BreadcrumbSeparator`는 **비워두면 기본 `›`(ChevronRight) 아이콘**이 들어갑니다.
- 마지막 항목만 `BreadcrumbPage`이고, 나머지는 전부 `BreadcrumbLink`입니다.
- 링크 색은 `--muted-foreground`, 현재 페이지와 링크 hover는 `--foreground`를 따릅니다.

:::tip 마지막 항목을 링크로 만들지 마세요
이미 그 페이지에 있으므로 클릭할 곳이 없습니다. 마지막 항목을 `BreadcrumbLink`로 두면 **자기 자신으로 이동하는 링크**가 되고, 스크린리더에도 "현재 위치"라는 정보가 전달되지 않습니다. 반드시 `BreadcrumbPage`를 쓰세요.
:::

---

## 구성 (Anatomy)

---

Breadcrumb은 아래 파트를 중첩해서 구성합니다.

```tsx
<Breadcrumb>
  {" "}
  {/* 루트 — <nav aria-label="breadcrumb"> */}
  <BreadcrumbList>
    {" "}
    {/* 항목을 담는 <ol> (가로 flex) */}
    <BreadcrumbItem>
      {" "}
      {/* 항목 하나 <li> */}
      <BreadcrumbLink /> {/* 이동 가능한 상위 경로 <a> */}
    </BreadcrumbItem>
    <BreadcrumbSeparator /> {/* 항목 사이 구분자 <li> — 비우면 › */}
    <BreadcrumbItem>
      <BreadcrumbEllipsis />
      {/* (선택) 접힌 중간 경로 … */}
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage /> {/* 현재 위치(이동 불가) <span> */}
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

| 파트                  | 렌더 태그 | 역할                                                               |
| --------------------- | --------- | ------------------------------------------------------------------ |
| `Breadcrumb`          | `<nav>`   | 루트. `aria-label="breadcrumb"`를 자동으로 붙입니다.               |
| `BreadcrumbList`      | `<ol>`    | 항목을 담는 정렬 목록. 가로 배치·줄바꿈·기본 색을 담당합니다.      |
| `BreadcrumbItem`      | `<li>`    | 항목 하나를 감싸는 래퍼.                                           |
| `BreadcrumbLink`      | `<a>`     | 이동 가능한 상위 경로. `asChild`로 다른 요소에 위임할 수 있습니다. |
| `BreadcrumbPage`      | `<span>`  | 현재 위치. `aria-current="page"`가 자동으로 붙습니다.              |
| `BreadcrumbSeparator` | `<li>`    | 항목 사이 구분자. children을 주면 그 내용이 구분자가 됩니다.       |
| `BreadcrumbEllipsis`  | `<span>`  | 접힌 중간 경로를 나타내는 `…` 표시.                                |

:::note 구분자도 `<li>`입니다
`<ol>`의 자식은 `<li>`만 올 수 있으므로, `BreadcrumbSeparator`는 **`BreadcrumbItem`의 형제인 `<li>`** 로 렌더됩니다. 즉 `BreadcrumbItem` **안에 넣지 않고 항목과 항목 사이에** 둡니다. 반대로 `BreadcrumbEllipsis`는 `<span>`이라 **반드시 `BreadcrumbItem` 안에** 넣어야 합니다.
:::

---

## 동작 옵션

---

Breadcrumb에는 열림/닫힘 같은 상태가 없습니다. **어떤 파트를 어떻게 조합하는가**가 곧 동작이므로, 아래에서 필요한 것만 골라 쓰세요.

### 1. 구분자 바꾸기 — `BreadcrumbSeparator`의 children

`BreadcrumbSeparator`를 비우면 기본 `›` 아이콘이, children을 주면 **그 내용이 그대로** 구분자가 됩니다. 아이콘·텍스트 무엇이든 가능합니다.

<img
  src="../assets/ui/breadcrumb-separator.png"
  alt="구분자 커스터마이징"
  width="80%"
/>

```tsx
import { Slash } from "lucide-react";

{
  /* 기본 — › (ChevronRight) */
}
<BreadcrumbSeparator />;

{
  /* 아이콘 구분자 */
}
<BreadcrumbSeparator>
  <Slash />
</BreadcrumbSeparator>;

{
  /* 텍스트 구분자 */
}
<BreadcrumbSeparator>·</BreadcrumbSeparator>;
```

- 구분자 안의 **SVG 크기는 `size-3.5`(14px)로 고정**되어 있습니다. 아이콘을 넣을 때 별도 크기 지정은 필요 없습니다.
- 구분자는 `aria-hidden="true"`라 스크린리더가 읽지 않습니다. **의미 있는 텍스트를 구분자로 쓰지 마세요.**

### 2. 항목에 아이콘 넣기

`BreadcrumbLink` · `BreadcrumbPage` 안에 아이콘을 함께 넣어 시각적 힌트를 줍니다. (예: 첫 항목의 홈 아이콘)

<img
  src="../assets/ui/breadcrumb-icon.png"
  alt="아이콘 포함"
  width="80%"
/>

```tsx
import { Home } from "lucide-react";

<BreadcrumbItem>
  <BreadcrumbLink href="#/" className="flex items-center gap-1.5">
    <Home className="w-4 h-4" />홈
  </BreadcrumbLink>
</BreadcrumbItem>;
```

- `BreadcrumbLink`는 기본이 `<a>`(inline)이므로, 아이콘과 글자를 세로 중앙에 맞추려면 예시처럼 **`className`으로 `flex items-center gap-*`** 를 주는 것이 깔끔합니다.
- 아이콘만 넣고 글자를 생략한다면 접근성을 위해 `aria-label`을 반드시 주세요 → `<BreadcrumbLink href="#/" aria-label="홈">`

### 3. 긴 경로 접기 — `BreadcrumbEllipsis`

계층이 깊어 전부 표시하기 어려우면 중간 항목을 `…`로 접고 **처음과 끝만** 보여줍니다.

<img
  src="../assets/ui/breadcrumb-ellipsis.png"
  alt="생략(Ellipsis)"
  width="80%"
/>

```tsx
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="#/">홈</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    {/* 중간 경로를 접는다 — span 이므로 BreadcrumbItem 안에 넣는다 */}
    <BreadcrumbItem>
      <BreadcrumbEllipsis />
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="#/">문서</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>현재 문서</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

- 접는 기준은 보통 **첫 항목 + 마지막 2단계**입니다. 그 사이를 전부 `…` 하나로 대체합니다.
- 어느 항목을 접을지는 **화면이 정합니다.** 컴포넌트는 `…` 표시만 그려 줄 뿐 자동으로 접지 않습니다.

:::caution 접힌 경로를 눌러서 펼치려면 직접 만들어야 합니다
`BreadcrumbEllipsis`는 클릭 동작이 없는 **표시 전용**(`<span>`)입니다. 눌러서 접힌 경로를 보여주려면 `DropdownMenu` 등의 트리거로 감싸 직접 구성하세요.

```tsx
<BreadcrumbItem>
  <DropdownMenu>
    <DropdownMenuTrigger aria-label="접힌 경로 보기">
      <BreadcrumbEllipsis />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem>자산관리</DropdownMenuItem>
      <DropdownMenuItem>계좌조회</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</BreadcrumbItem>
```

:::

### 4. 라우터 연동 — `asChild`

`BreadcrumbLink`는 기본적으로 `<a>`를 렌더합니다. `asChild`를 주면 **자식 요소에 스타일과 속성만 위임**하므로, react-router의 `Link`를 그대로 쓰면서 SPA 라우팅(새로고침 없는 이동)을 유지할 수 있습니다.

```tsx
import { Link } from "react-router";

<BreadcrumbItem>
  <BreadcrumbLink asChild>
    <Link to="/example/ui-components/button">버튼</Link>
  </BreadcrumbLink>
</BreadcrumbItem>;
```

:::tip 이 앱은 `createHashRouter`를 씁니다
순수 `<a href="/...">`는 전체 페이지를 다시 로드합니다. 앱 내부 이동은 **`asChild` + `<Link to>`** 를, 굳이 `<a>`를 쓸 때는 `href="#/..."` 형태의 해시 경로를 사용하세요.
:::

:::caution `asChild`에는 자식이 정확히 하나여야 합니다
`asChild`는 Radix `Slot` 기반이라 **단일 자식 엘리먼트**에만 속성을 병합합니다. 아이콘과 텍스트를 같이 넣을 때는 `<Link>` **안에서** 감싸세요.

```tsx
<BreadcrumbLink asChild>
  <Link to="/" className="flex items-center gap-1.5">
    <Home className="w-4 h-4" />홈
  </Link>
</BreadcrumbLink>
```

:::

### 5. 경로 배열로 렌더하기

실제 업무 화면에서는 경로를 배열로 두고 순회하는 형태가 많습니다. **마지막 항목만 `BreadcrumbPage`** 로 분기하고, 구분자는 첫 항목 앞에만 빼면 됩니다.

```tsx
import { Fragment } from "react";
import { Link } from "react-router";

const PATHS = [
  { label: "홈", to: "/" },
  { label: "자산관리", to: "/assets" },
  { label: "계좌조회", to: "/assets/accounts" },
  { label: "거래내역" }, // to 가 없는 마지막 항목 = 현재 페이지
];

<Breadcrumb>
  <BreadcrumbList>
    {PATHS.map((p, i) => (
      // key 는 Fragment 에 준다 (구분자 + 항목이 한 쌍)
      <Fragment key={p.label}>
        {i > 0 && <BreadcrumbSeparator />}
        <BreadcrumbItem>
          {p.to ? (
            <BreadcrumbLink asChild>
              <Link to={p.to}>{p.label}</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{p.label}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
      </Fragment>
    ))}
  </BreadcrumbList>
</Breadcrumb>;
```

---

## API 레퍼런스

---

모든 파트는 **해당 HTML 태그의 표준 속성을 그대로 전달**합니다(`id`, `style`, `onClick`, `aria-*` 등). 아래 표에는 알아둘 것만 정리합니다.

### `Breadcrumb` (루트)

| Prop        | 타입        | 기본값 | 설명                         |
| ----------- | ----------- | ------ | ---------------------------- |
| `children`  | `ReactNode` | —      | 보통 `BreadcrumbList` 하나   |
| `className` | `string`    | —      | 루트 `<nav>`에 추가할 클래스 |

> `<nav>`로 렌더되며 `aria-label="breadcrumb"`가 **자동으로** 붙습니다. 별도로 지정할 필요가 없습니다.

### `BreadcrumbList`

| Prop        | 타입        | 기본값 | 설명                                     |
| ----------- | ----------- | ------ | ---------------------------------------- |
| `children`  | `ReactNode` | —      | `BreadcrumbItem` · `BreadcrumbSeparator` |
| `className` | `string`    | —      | `<ol>`에 추가할 클래스                   |

> 기본 스타일: 가로 flex + 줄바꿈 허용(`flex-wrap`), 항목 간격 `gap-1.5`, 글자 `text-sm`, 색 `--muted-foreground`.

### `BreadcrumbItem`

| Prop        | 타입        | 기본값 | 설명                                                       |
| ----------- | ----------- | ------ | ---------------------------------------------------------- |
| `children`  | `ReactNode` | —      | `BreadcrumbLink` · `BreadcrumbPage` · `BreadcrumbEllipsis` |
| `className` | `string`    | —      | `<li>`에 추가할 클래스                                     |

### `BreadcrumbLink`

| Prop        | 타입        | 기본값  | 설명                                              |
| ----------- | ----------- | ------- | ------------------------------------------------- |
| `href`      | `string`    | —       | 이동할 경로. 해시 라우터에서는 `#/...` 형태       |
| `asChild`   | `boolean`   | `false` | `<a>` 대신 **자식 엘리먼트**에 스타일·속성을 위임 |
| `children`  | `ReactNode` | —       | 표시할 경로 이름(아이콘 포함 가능)                |
| `className` | `string`    | —       | 링크에 추가할 클래스                              |

> 기본 스타일: hover 시 색이 `--foreground`로 바뀌는 것뿐입니다(밑줄 없음). `asChild`를 쓰면 `href`는 자식(`Link`의 `to`)이 담당합니다.

### `BreadcrumbPage`

| Prop        | 타입        | 기본값 | 설명                     |
| ----------- | ----------- | ------ | ------------------------ |
| `children`  | `ReactNode` | —      | 현재 페이지 이름         |
| `className` | `string`    | —      | `<span>`에 추가할 클래스 |

> `role="link"` · `aria-disabled="true"` · `aria-current="page"`가 자동으로 붙습니다. 즉 **"현재 페이지이며 이동할 수 없는 링크"** 로 안내됩니다. 색은 `--foreground`.

### `BreadcrumbSeparator`

| Prop        | 타입        | 기본값                | 설명                                 |
| ----------- | ----------- | --------------------- | ------------------------------------ |
| `children`  | `ReactNode` | `›`(ChevronRightIcon) | 구분자로 쓸 내용. 비우면 기본 아이콘 |
| `className` | `string`    | —                     | `<li>`에 추가할 클래스               |

> `role="presentation"` · `aria-hidden="true"`가 붙어 보조기술에서 감춰집니다. 내부 SVG 크기는 `size-3.5`로 고정.

### `BreadcrumbEllipsis`

| Prop        | 타입     | 기본값 | 설명                     |
| ----------- | -------- | ------ | ------------------------ |
| `className` | `string` | —      | `<span>`에 추가할 클래스 |

> 내용은 `…`(MoreHorizontalIcon) 고정이며 children으로 바꾸지 않습니다. 크기 `size-5`, 내부 SVG `size-4`. `aria-hidden="true"`라 보조기술에는 노출되지 않습니다.

---

## 접근성

---

Breadcrumb은 **일반 링크 목록**이라 Radix 같은 별도 키보드 로직이 없습니다. 브라우저 기본 동작(`Tab`으로 링크 이동, `Enter`로 실행)을 그대로 쓰며, 아래 ARIA 처리는 컴포넌트가 자동으로 해 줍니다.

| 처리                       | 담당                                                    |
| -------------------------- | ------------------------------------------------------- |
| 탐색 영역임을 알림         | `Breadcrumb` → `<nav aria-label="breadcrumb">` **자동** |
| 순서가 있는 경로임을 알림  | `BreadcrumbList` → `<ol>` **자동**                      |
| 현재 페이지 표시           | `BreadcrumbPage` → `aria-current="page"` **자동**       |
| 구분자를 읽지 않게 처리    | `BreadcrumbSeparator` → `aria-hidden="true"` **자동**   |
| 생략 표시를 읽지 않게 처리 | `BreadcrumbEllipsis` → `aria-hidden="true"` **자동**    |

**화면에서 챙겨야 할 것**

| 상황                       | 해야 할 것                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| 아이콘만 있는 항목(홈 등)  | `BreadcrumbLink`에 `aria-label="홈"`을 줍니다.                           |
| 마지막(현재) 항목          | 링크가 아니라 **`BreadcrumbPage`** 를 씁니다.                            |
| 한 화면에 breadcrumb이 2개 | 각 `Breadcrumb`에 `aria-label`을 서로 다르게 지정해 구분합니다.          |
| 경로가 길어 접었을 때      | 접힌 경로를 눌러 볼 수 있는 트리거에 `aria-label`을 줍니다.              |
| 링크 hover/focus 표시      | 기본은 **색 변화만** 있습니다. 색약 사용자를 위해 밑줄 등을 함께 주세요. |

:::caution 생략(`…`)은 스크린리더에 읽히지 않습니다
`BreadcrumbEllipsis`는 `aria-hidden="true"`라 **안의 "More" 텍스트까지 함께 감춰집니다.** 접힌 경로가 보조기술 사용자에게도 필요하다면, 위 [3. 긴 경로 접기](#3-긴-경로-접기--breadcrumbellipsis)처럼 **`aria-label`을 준 버튼/드롭다운 트리거로 감싸** 접근 경로를 따로 만들어 주세요.
:::

---

## 스타일링 & 테마

---

Breadcrumb에는 별도의 공개 CSS 변수(테마 계약)가 없습니다. 원래 **구조만 제공하는 프리미티브**라, 겉모습은 대부분 프로젝트에서 새로 입힙니다. **바꾸려는 대상에 따라** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                    | 방법                                                  |
| ------------------------------ | ----------------------------------------------------- |
| 구분자 모양(`›` → `/`, `·` …)  | `BreadcrumbSeparator`의 **children**                  |
| 글자·링크 색                   | **디자인 토큰**(`--muted-foreground`, `--foreground`) |
| 이 화면만 간격·크기·굵기       | 각 파트의 **`className`**                             |
| 겉모습 전체 교체(바·알약형 등) | **`data-slot` 선택자 + CSS Module**                   |

:::tip 핵심 원칙
**모양은 children·className으로**, **색은 토큰으로**, **전면 재디자인은 CSS Module로**. 컴포넌트(`breadcrumb.tsx`)를 복사해서 고치지 않습니다.
:::

### 1. 색은 디자인 토큰을 따릅니다

| 부위                  | 사용 토큰            |
| --------------------- | -------------------- |
| 목록 전체 기본 글자색 | `--muted-foreground` |
| 링크 hover 색         | `--foreground`       |
| 현재 페이지(`Page`)   | `--foreground`       |

테마(라이트/다크)를 바꾸면 자동으로 따라옵니다. breadcrumb 전용 색 변수를 새로 만들지 말고, **토큰을 조정하거나 `className`으로 이 인스턴스만** 덮어쓰세요.

### 2. 인스턴스 단위 조정 — `className`

모든 파트가 `className`을 받습니다. 프로젝트 톤에 맞춘 미세 조정은 여기서 처리합니다.

```tsx
{
  /* 간격을 넓히고 글자를 키운다 */
}
<BreadcrumbList className="gap-2.5 text-base">…</BreadcrumbList>;

{
  /* 링크에 밑줄 hover 를 추가 */
}
<BreadcrumbLink href="#/" className="hover:underline underline-offset-4">
  홈
</BreadcrumbLink>;

{
  /* 현재 페이지를 굵게 */
}
<BreadcrumbPage className="font-semibold">거래내역</BreadcrumbPage>;
```

### 3. 겉모습 전면 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 **`data-slot`** 을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                            | 대상             |
| ------------------------------------ | ---------------- |
| `[data-slot="breadcrumb"]`           | 루트 `<nav>`     |
| `[data-slot="breadcrumb-list"]`      | 항목 목록 `<ol>` |
| `[data-slot="breadcrumb-item"]`      | 각 항목 `<li>`   |
| `[data-slot="breadcrumb-link"]`      | 이동 가능한 링크 |
| `[data-slot="breadcrumb-page"]`      | 현재 위치        |
| `[data-slot="breadcrumb-separator"]` | 구분자           |
| `[data-slot="breadcrumb-ellipsis"]`  | 생략(`…`) 표시   |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯 2단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap [data-slot="breadcrumb-list"] {
  padding: 6px 14px;
  border-radius: 9999px; /* 알약형 바 */
  background: var(--muted);
}
.wrap [data-slot="breadcrumb-link"] {
  padding: 2px 8px;
  border-radius: 6px;
}
.wrap [data-slot="breadcrumb-page"] {
  font-weight: 700;
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...]`처럼 **래퍼로 한 번 더 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

:::note `className` 과 `data-slot`, 어느 쪽을 쓸까

- **한 화면에서만** 쓰는 breadcrumb → 각 파트에 `className`을 직접 넘기는 편이 읽기 쉽습니다. (아래 실전 예제가 이 방식)
- **여러 화면에 공통 적용**할 프로젝트 표준 breadcrumb → 래퍼 컴포넌트를 하나 만들고 그 안에서 `data-slot` 선택자로 한 번에 잡는 편이 유지보수에 낫습니다.
  :::

---

## 실전 예제

---

제공 Breadcrumb을 **그대로 쓰되** `*.module.css`만 입혀 완전히 다른 룩앤필(알약형 그라데이션 바 + 슬래시 구분자)로 만든 예제입니다. 구조는 [기본 사용법](#기본-사용법)과 동일하고, 달라진 것은 각 파트에 넘긴 `className`뿐입니다.

### 알약형 경로 바

<img
  src="../assets/ui/breadcrumb-custom.png"
  alt="알약형 경로 바 커스터마이징"
  width="80%"
/>

**포인트**

- 제공 `Breadcrumb` 파트를 **그대로** 씁니다. 마크업·ARIA는 전부 컴포넌트에 맡깁니다.
- 알약형 바 배경은 `BreadcrumbList`에, 링크 hover 박스는 `BreadcrumbLink`에 `className`으로 입혔습니다.
- 구분자는 children에 `/`를 넣어 기본 `›` 아이콘을 대체했습니다.
- 다크 모드는 앱 규칙(`.dark`)에 맞춰 `:global(.dark) .클래스`로 **색만 교체**합니다.

<details>
<summary><b>CustomBreadcrumb.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/breadcrumb/CustomBreadcrumb.tsx"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@axiom/components/ui";
import { Home } from "lucide-react";
import styles from "./CustomBreadcrumb.module.css";

/**
 * 퍼블리셔가 breadcrumb 프리미티브에 *.module.css 만 입혀
 * 완전히 다른 룩앤필(알약형 그라데이션 바 + 슬래시 구분자)로 만든 예시.
 *
 * 컴포넌트 구조는 기본 예제와 동일하고, 달라진 건 각 조각에 넘긴
 * className 뿐이다. 실제 SI 프로젝트에서는 이 파일 옆의
 * CustomBreadcrumb.module.css 만 교체하면 룩앤필이 바뀐다.
 */
export default function CustomBreadcrumb(): React.ReactNode {
  return (
    <Breadcrumb>
      {/* highlight-next-line */}
      <BreadcrumbList className={styles.bar}>
        <BreadcrumbItem>
          {/* highlight-next-line */}
          <BreadcrumbLink href="#/" className={styles.link}>
            <Home className="w-3.5 h-3.5" />홈
          </BreadcrumbLink>
        </BreadcrumbItem>
        {/* 기본 › 아이콘 대신 슬래시 텍스트를 구분자로 */}
        {/* highlight-next-line */}
        <BreadcrumbSeparator className={styles.sep}>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#/" className={styles.link}>
            자산관리
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className={styles.sep}>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#/" className={styles.link}>
            계좌조회
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className={styles.sep}>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          {/* 마지막은 이동 불가 — Page */}
          {/* highlight-next-line */}
          <BreadcrumbPage className={styles.page}>거래내역</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

</details>

<details>
<summary><b>CustomBreadcrumb.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/breadcrumb/CustomBreadcrumb.module.css"
/* ────────────────────────────────────────────────────────────
 * 퍼블리셔 커스터마이징 예시 스타일
 *
 * breadcrumb 컴포넌트(@axiom/components/ui)는 스타일이 거의 없는
 * "구조만 있는" 프리미티브다. 실제 SI 프로젝트에서는 퍼블리셔가
 * 이런 식으로 *.module.css 를 입혀 완전히 다른 룩앤필을 만든다.
 *
 * 각 조각은 breadcrumb.tsx 가 붙여주는 data-slot 속성으로도 타겟팅할 수
 * 있으나, 여기서는 className 을 직접 넘겨 스코프가 확실한 module.css 로 입혔다.
 * 다크 모드는 앱 규칙(.dark)에 맞춰 `:global(.dark) .클래스` 로 처리한다.
 * ──────────────────────────────────────────────────────────── */

/* 알약(pill) 형태의 바 — BreadcrumbList 에 적용 */
.bar {
  padding: 6px 14px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%);
  border: 1px solid #e0e7ff;
  box-shadow: 0 1px 2px rgb(79 70 229 / 8%);
}

:global(.dark) .bar {
  background: linear-gradient(
    135deg,
    rgb(49 46 129 / 30%) 0%,
    rgb(59 7 100 / 30%) 100%
  );
  border-color: rgb(99 102 241 / 30%);
  box-shadow: none;
}

/* 링크(이동 가능한 상위 경로) */
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  color: #6366f1;
  font-weight: 500;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.link:hover {
  background: #e0e7ff;
  color: #4338ca;
}

:global(.dark) .link {
  color: #a5b4fc;
}

:global(.dark) .link:hover {
  background: rgb(99 102 241 / 20%);
  color: #c7d2fe;
}

/* 현재 위치(마지막, 이동 불가) */
.page {
  padding: 2px 8px;
  color: #312e81;
  font-weight: 700;
}

:global(.dark) .page {
  color: #e0e7ff;
}

/* 구분자 — 슬래시 톤 */
.sep {
  color: #a5b4fc;
  font-weight: 600;
}

:global(.dark) .sep {
  color: #6366f1;
}
```

</details>

:::tip 이 예제에서 가져갈 것
마크업 구조와 ARIA는 **전부 컴포넌트에 맡기고**, 바꾼 것은 ①구분자 children(`/`) ②각 파트에 넘긴 `className` ③CSS Module의 색·여백 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---
