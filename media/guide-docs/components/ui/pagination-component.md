---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Pagination"
hide_table_of_contents: false
---

# Pagination 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 페이지 이동(pagination) 컴포넌트입니다.  
긴 목록을 여러 페이지로 나눠 보여줄 때, **이전 / 페이지 번호 / 다음 / 생략(…)** 을 한 줄로 배치합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Pagination` 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 게시판·거래내역·검색 결과처럼 **건수가 많아 한 번에 다 못 보여주는** 목록 하단
- 서버가 `page` / `size` 파라미터로 데이터를 **페이지 단위로 내려줄** 때
- 사용자가 **특정 페이지로 바로 점프**하거나, 지금 몇 페이지인지 알아야 할 때

:::caution 이 컴포넌트는 "구조"만 제공합니다
Pagination에는 **현재 페이지 상태도, 전체 페이지 수 계산도 들어 있지 않습니다.** 어떤 번호를 그릴지, 어디를 활성으로 표시할지, 클릭하면 무엇을 할지는 **전부 쓰는 쪽에서 정합니다.** 컴포넌트가 해 주는 것은 마크업 골격(`<nav>` / `<ul>` / `<li>` / `<a>`)과 ARIA 속성, 버튼 룩앤필까지입니다. 실제 페이지 목록을 만드는 방법은 [페이지 이동 연결하기](#페이지-이동-연결하기)에서 다룹니다.
:::

> Breadcrumb과 혼동하지 마세요. Breadcrumb은 **사이트 계층상의 위치**를, Pagination은 **같은 목록 안에서의 페이지 이동**을 나타냅니다.

---

## Import

---

```tsx
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@axiom/components/ui";
```

Pagination은 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 최소 조합은 `Pagination` + `PaginationContent` + `PaginationItem` + `PaginationLink`이고, 이전/다음(`PaginationPrevious` / `PaginationNext`)과 생략(`PaginationEllipsis`)은 필요할 때만 추가합니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---

## 기본 사용법

---

가장 기본적인 형태입니다. **현재 페이지 번호에만 `isActive`** 를 주고, 앞뒤에 이전/다음 버튼을 둡니다.

<img
  src="../assets/ui/pagination-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
<Pagination>
  <PaginationContent>
    <PaginationItem>
      <PaginationPrevious href="#" />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">1</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      {/* 현재 페이지 */}
      <PaginationLink href="#" isActive>
        2
      </PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">3</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationNext href="#" />
    </PaginationItem>
  </PaginationContent>
</Pagination>
```

- 번호 하나하나를 `PaginationItem`(=`<li>`)으로 감싸야 합니다. `<ul>`의 자식은 `<li>`만 올 수 있기 때문입니다.
- `isActive`를 준 링크는 `outline` 스타일로 바뀌고 `aria-current="page"`가 자동으로 붙습니다.
- 이전/다음 라벨은 기본이 영문 `Previous` / `Next`입니다. `text` prop으로 바꿉니다. ([동작 옵션 2번](#2-이전다음-라벨--text) 참고)

:::caution `href="#"` 를 그대로 두지 마세요
이 앱은 **해시 라우터(`createHashRouter`)** 를 씁니다. `PaginationLink`는 내부적으로 `<a href>`를 렌더하므로, `href="#"`를 클릭하면 주소의 해시가 날아가 **라우트가 깨집니다.** 반드시 `onClick`에서 `e.preventDefault()`로 기본 이동을 막거나, `href`에 해시 경로(`#/board/list?page=3`)를 직접 넣으세요. 자세한 방법은 [페이지 이동 연결하기](#페이지-이동-연결하기)에 정리했습니다.
:::

---

## 구성 (Anatomy)

---

Pagination은 아래 파트를 중첩해서 구성합니다.

```tsx
<Pagination>
  {" "}
  {/* 루트 — <nav role="navigation" aria-label="pagination"> */}
  <PaginationContent>
    {" "}
    {/* 항목을 담는 <ul> (가로 flex) */}
    <PaginationItem>
      {" "}
      {/* 항목 하나 <li> */}
      <PaginationPrevious /> {/* 이전 페이지 <a> */}
    </PaginationItem>
    <PaginationItem>
      <PaginationLink /> {/* 페이지 번호 <a> — isActive 로 현재 페이지 표시 */}
    </PaginationItem>
    <PaginationItem>
      <PaginationEllipsis /> {/* (선택) 접힌 구간 … <span> */}
    </PaginationItem>
    <PaginationItem>
      <PaginationNext /> {/* 다음 페이지 <a> */}
    </PaginationItem>
  </PaginationContent>
</Pagination>
```

| 파트                 | 렌더 태그      | 역할                                                                       |
| -------------------- | -------------- | -------------------------------------------------------------------------- |
| `Pagination`         | `<nav>`        | 루트. `role="navigation"` + `aria-label="pagination"`을 자동으로 붙입니다. |
| `PaginationContent`  | `<ul>`         | 항목을 담는 가로 목록. 항목 사이 간격(`gap-0.5`)을 담당합니다.             |
| `PaginationItem`     | `<li>`         | 항목 하나를 감싸는 래퍼. 기본 스타일이 없습니다.                           |
| `PaginationLink`     | `<a>` (Button) | 페이지 번호 링크. `isActive`로 현재 페이지를 표시합니다.                   |
| `PaginationPrevious` | `<a>` (Button) | 이전 페이지. 왼쪽 화살표 + 라벨(`text`).                                   |
| `PaginationNext`     | `<a>` (Button) | 다음 페이지. 라벨(`text`) + 오른쪽 화살표.                                 |
| `PaginationEllipsis` | `<span>`       | 접힌 구간을 나타내는 `…` 표시. 장식이므로 `aria-hidden`입니다.             |

:::note 세 링크는 모두 같은 것입니다
`PaginationPrevious` / `PaginationNext`는 **`PaginationLink`를 감싼 얇은 래퍼**입니다. 화살표 아이콘과 `aria-label`, 버튼 크기(`size="default"`)를 미리 채워 둔 것뿐이라, `PaginationLink`가 받는 prop(`href` · `onClick` · `className` · `isActive` …)을 그대로 받습니다.

그리고 `PaginationLink`는 내부적으로 `Button`을 `asChild`로 써서 `<a>`에 버튼 스타일을 입힙니다. 그래서 렌더된 `<a>`에는 `data-slot="pagination-link"` 외에 `data-variant` · `data-size`도 함께 붙습니다.
:::

---

## 동작 옵션

---

Pagination에는 열림/닫힘 같은 내부 상태가 없습니다. **어떤 파트를 어떤 prop으로 조합하는가**가 곧 동작이므로, 아래에서 필요한 것만 골라 쓰세요.

### 1. 현재 페이지 표시 — `isActive`

```tsx
<PaginationLink href="#">1</PaginationLink>          {/* 일반 — ghost */}
<PaginationLink href="#" isActive>2</PaginationLink> {/* 현재 — outline + aria-current="page" */}
```

`isActive`를 주면 세 가지가 한 번에 바뀝니다.

| 바뀌는 것    | 값                                       |
| ------------ | ---------------------------------------- |
| 버튼 variant | `ghost` → `outline` (테두리 + 배경 생김) |
| 접근성       | `aria-current="page"` 부여               |
| 스타일 훅    | `data-active="true"` 부여                |

:::tip `data-active`는 `"true"` 로 비교하세요
`isActive={false}`이면 속성이 사라지는 게 아니라 **`data-active="false"`** 로 렌더됩니다. CSS에서는 `[data-active]`가 아니라 **`[data-active="true"]`** 또는 `[aria-current="page"]`로 선택해야 합니다.
:::

### 2. 이전/다음 라벨 — `text`

`PaginationPrevious` / `PaginationNext`의 라벨 문구는 `text` prop으로 바꿉니다. 기본값은 각각 `"Previous"` / `"Next"`입니다.

```tsx
{/* 한글 라벨 */}
<PaginationPrevious href="#" text="이전" />
<PaginationNext href="#" text="다음" />

{/* 라벨 없이 아이콘만 — 콤팩트한 형태 */}
<PaginationPrevious href="#" text="" />
<PaginationNext href="#" text="" />
```

<img
  src="../assets/ui/pagination-label.png"
  alt="이전/다음 라벨 커스터마이징"
  width="80%"
/>

:::note 좁은 화면에서는 라벨이 자동으로 숨습니다
라벨은 `hidden sm:block`으로 감싸여 있어 **뷰포트 640px 미만에서는 사라지고 화살표 아이콘만 남습니다.** 모바일 대응을 따로 하지 않아도 되지만, 반대로 **좁은 화면에서도 글자를 꼭 보여야 한다면** 이 컴포넌트로는 불가능하니 `PaginationLink`에 직접 아이콘과 글자를 넣어 조합하세요.
:::

### 3. 페이지가 많을 때 — `PaginationEllipsis`

페이지가 수십 개면 전부 나열할 수 없습니다. **처음 / 현재 주변 / 끝**만 남기고 나머지는 `PaginationEllipsis`(…)로 접습니다.

```tsx
<Pagination>
  <PaginationContent>
    <PaginationItem>
      <PaginationPrevious href="#" />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">1</PaginationLink>
    </PaginationItem>
    {/* highlight-next-line */}
    <PaginationItem>
      <PaginationEllipsis />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">4</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#" isActive>
        5
      </PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">6</PaginationLink>
    </PaginationItem>
    {/* highlight-next-line */}
    <PaginationItem>
      <PaginationEllipsis />
    </PaginationItem>
    <PaginationItem>
      <PaginationLink href="#">20</PaginationLink>
    </PaginationItem>
    <PaginationItem>
      <PaginationNext href="#" />
    </PaginationItem>
  </PaginationContent>
</Pagination>
```

<img
  src="../assets/ui/pagination-ellipsis.png"
  alt="생략(Ellipsis) 표시"
  width="80%"
/>

- `PaginationEllipsis`는 `<span>`이므로 **반드시 `PaginationItem` 안에** 넣습니다.
- 클릭할 수 없는 **장식**입니다(`aria-hidden`). "가운데 페이지 목록 펼치기" 같은 동작이 필요하면 대신 `PaginationLink`에 `…`를 넣어 직접 만드세요.
- 어느 위치에 `…`를 넣을지 계산하는 방법은 [페이지 범위 계산](#1-페이지-범위-계산--buildpagerange)에 있습니다.

### 4. 첫/끝 페이지에서 막기

`<a>`에는 `disabled` 속성이 없습니다. 첫 페이지에서 "이전"을, 마지막에서 "다음"을 막으려면 **클릭 차단 + 접근성 표시**를 함께 줍니다.

```tsx
<PaginationPrevious
  href="#"
  text="이전"
  onClick={goTo(page - 1)}
  // highlight-start
  aria-disabled={page === 1}
  tabIndex={page === 1 ? -1 : undefined}
  className={page === 1 ? "pointer-events-none opacity-50" : ""}
  // highlight-end
/>
```

| 무엇을                | 왜                                     |
| --------------------- | -------------------------------------- |
| `aria-disabled`       | 스크린리더에 "지금은 못 누른다"고 알림 |
| `pointer-events-none` | 마우스 클릭 차단                       |
| `opacity-50`          | 눈으로 봐도 비활성인 걸 알게           |
| `tabIndex={-1}`       | 키보드 Tab 이동에서도 제외(생략 가능)  |

<img
  src="../assets/ui/pagination-disabled.png"
  alt="첫 페이지에서 이전 버튼 비활성"
  width="80%"
/>

:::tip `pointer-events-none`만 걸면 키보드로는 눌립니다
마우스만 막히고 Tab → Enter로는 여전히 이동합니다. 그래서 위처럼 `tabIndex={-1}`을 같이 주거나, `onClick` 핸들러 안에서 범위를 한 번 더 검사하는 편이 안전합니다. (아래 기본형 예제의 `goTo`가 `if (p >= 1 && p <= totalPages)`로 검사합니다.)
:::

### 5. 버튼 크기 — `size`

`PaginationLink`는 내부적으로 `Button`이라 **Button의 `size` 값을 그대로** 받습니다. 기본값은 `"icon"`(32px 정사각)입니다.

```tsx
<PaginationLink href="#" size="icon-sm">1</PaginationLink>   {/* 28px — 촘촘한 목록 */}
<PaginationLink href="#">2</PaginationLink>                  {/* 기본 icon = 32px */}
<PaginationLink href="#" size="icon-lg">3</PaginationLink>   {/* 36px — 터치 영역 확보 */}
```

사용 가능한 값: `icon-xs` · `icon-sm` · `icon` · `icon-lg` (정사각) / `xs` · `sm` · `default` · `lg` (가로로 늘어나는 형태).

`PaginationPrevious` / `PaginationNext`는 라벨이 들어가므로 `size="default"`가 기본이고, 필요하면 직접 `size`를 넘겨 덮어쓸 수 있습니다.

### 6. 정렬 — 기본은 가운데

루트 `Pagination`은 `mx-auto flex w-full justify-center`라 **가운데 정렬**이 기본입니다. 목록 하단 왼쪽/오른쪽에 붙이려면 `className`으로 바꿉니다.

```tsx
<Pagination className="justify-start" />  {/* 왼쪽 정렬 */}
<Pagination className="justify-end" />    {/* 오른쪽 정렬 */}
<Pagination className="mx-0 w-auto" />    {/* 폭을 내용만큼만 — 툴바 안에 끼워 넣을 때 */}
```

항목 사이 간격을 넓히려면 `PaginationContent`에 줍니다: `<PaginationContent className="gap-2">`.

:::note 클래스 충돌은 알아서 정리됩니다
내부적으로 `tailwind-merge`를 쓰므로, `justify-start`를 넘기면 기본값 `justify-center`가 **제거**된 뒤 적용됩니다. `!important`를 붙일 필요가 없습니다.
:::

---

## 페이지 이동 연결하기

---

여기서부터가 실제로 쓰이는 부분입니다. Pagination은 상태를 갖지 않으므로, **번호 목록을 만드는 계산**과 **클릭했을 때 무엇을 할지**를 화면에서 정해야 합니다.

### 1. 페이지 범위 계산 — `buildPageRange`

현재 페이지 주변만 남기고 멀어진 구간을 `'ellipsis'`로 접는 순수 함수입니다. 컴포넌트가 아니므로 페이지 파일 안에 두어도 되고, 여러 화면에서 쓴다면 도메인 공통 함수로 빼세요.

```tsx
/**
 * 현재 페이지 주변만 노출하고 멀어진 구간은 'ellipsis'(…) 로 접는 범위를 만든다.
 * sibling = 현재 페이지 좌우로 몇 개를 더 보여줄지 (기본 1)
 */
function buildPageRange(
  current: number,
  total: number,
  sibling = 1,
): (number | "ellipsis")[] {
  const range: (number | "ellipsis")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= sibling) {
      range.push(p);
    } else if (range[range.length - 1] !== "ellipsis") {
      range.push("ellipsis");
    }
  }
  return range;
}
```

- 항상 **첫 페이지와 마지막 페이지**를 남기고, 현재 페이지 ±`sibling`을 남깁니다.
- 연속으로 `…`가 쌓이지 않도록 **직전 원소가 `'ellipsis'`면 넣지 않습니다.**
- 결과 예: `buildPageRange(5, 20)` → `[1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]`

### 2. 방법 A — 화면 상태로 이동 (기본형)

목록 데이터를 화면 안에서 다루는 경우입니다. **가장 많이 쓰는 형태**이므로 이걸 기본으로 삼으세요.

```tsx
import { useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@axiom/components/ui";

export default function BoardList(): React.ReactNode {
  const totalPages = 10;
  const [page, setPage] = useState(1);

  // highlight-start
  const goTo = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault(); // 해시 라우터가 깨지지 않도록 기본 이동 차단
    if (p >= 1 && p <= totalPages) setPage(p);
  };
  // highlight-end

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text="이전"
            onClick={goTo(page - 1)}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>

        {/* highlight-next-line */}
        {buildPageRange(page, totalPages).map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink href="#" isActive={p === page} onClick={goTo(p)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            text="다음"
            onClick={goTo(page + 1)}
            aria-disabled={page === totalPages}
            className={
              page === totalPages ? "pointer-events-none opacity-50" : ""
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
```

<img
  src="../assets/ui/pagination-interactive.png"
  alt="상태 기반 인터랙티브 페이지네이션"
  width="80%"
/>

- `key`는 번호에는 `p`, 생략에는 `` `ellipsis-${i}` `` 를 씁니다. `…`가 여러 개일 수 있어 index를 섞습니다.
- 서버 목록이라면 `page`가 바뀔 때 데이터를 다시 불러오면 됩니다. `useApi`와 함께 쓰는 방법은 [REST API 사용하기](../../documents/dev/use-rest-api)를 참고하세요.

### 3. 방법 B — 주소(URL)와 동기화

새로고침·북마크·뒤로가기에서도 페이지가 유지되어야 한다면, 현재 페이지를 **주소의 쿼리스트링**에 둡니다. 이 앱은 해시 라우터이므로 경로가 `#/` 뒤에 붙는다는 점만 주의하면 됩니다.

```tsx
import { useSearchParams } from "react-router";

export default function BoardList(): React.ReactNode {
  const [searchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? 1);
  const totalPages = 20;

  // 해시 경로를 href 에 직접 넣는다 → preventDefault 불필요
  // highlight-next-line
  const hrefOf = (p: number) => `#/board/list?page=${p}`;

  return (
    <Pagination>
      <PaginationContent>
        {buildPageRange(page, totalPages).map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              {/* highlight-next-line */}
              <PaginationLink href={hrefOf(p)} isActive={p === page}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
      </PaginationContent>
    </Pagination>
  );
}
```

`href`에 해시 경로를 직접 넣었으므로 이때는 `preventDefault()`를 하지 않습니다. 브라우저 기본 링크 이동이 곧 라우팅이 됩니다.

:::caution `asChild`는 지원하지 않습니다
`PaginationLink`는 react-router의 `<Link>`에 렌더를 위임하는 `asChild`를 **받지 않습니다.** (내부에서 이미 `Button asChild`를 써서 `<a>`를 만들고 있고, 외부에 노출된 prop 타입에는 `asChild`가 없습니다.) 라우터 API로 이동해야 한다면 `href` 대신 `onClick`에서 `useNavigate`를 쓰세요.

```tsx
import { useNavigate } from "react-router";

const navigate = useNavigate();

<PaginationLink
  href="#"
  isActive={p === page}
  onClick={(e) => {
    e.preventDefault();
    navigate(`/board/list?page=${p}`);
  }}
>
  {p}
</PaginationLink>;
```

:::

---

## API 레퍼런스

---

Pagination은 radix 같은 동작 라이브러리 위에 있지 않은 **순수 마크업 프리미티브**입니다. 아래 표에 없는 prop은 각 파트의 표준 HTML 속성으로 그대로 전달됩니다.

### `Pagination` (루트)

| Prop        | 타입         | 기본값 | 설명                                                                        |
| ----------- | ------------ | ------ | --------------------------------------------------------------------------- |
| `children`  | `ReactNode`  | —      | 보통 `PaginationContent` 하나                                               |
| `className` | `string`     | —      | 기본 `mx-auto flex w-full justify-center` 위에 병합(충돌 시 넘긴 쪽이 이김) |
| 그 외       | `<nav>` 속성 | —      | `aria-label` 등 표준 속성 그대로 전달                                       |

### `PaginationContent`

| Prop        | 타입        | 기본값 | 설명                                       |
| ----------- | ----------- | ------ | ------------------------------------------ |
| `children`  | `ReactNode` | —      | `PaginationItem` 목록                      |
| `className` | `string`    | —      | 기본 `flex items-center gap-0.5` 위에 병합 |

### `PaginationItem`

| Prop        | 타입        | 기본값 | 설명                                    |
| ----------- | ----------- | ------ | --------------------------------------- |
| `children`  | `ReactNode` | —      | 링크 · 생략 표시 중 하나                |
| `className` | `string`    | —      | 기본 클래스가 없어 그대로 `<li>`에 적용 |

### `PaginationLink`

| Prop        | 타입                                                                                 | 기본값   | 설명                                                               |
| ----------- | ------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------ |
| `children`  | `ReactNode`                                                                          | —        | 페이지 번호                                                        |
| `isActive`  | `boolean`                                                                            | `false`  | 현재 페이지. variant가 `outline`이 되고 `aria-current="page"` 부여 |
| `size`      | `"icon" \| "icon-xs" \| "icon-sm" \| "icon-lg" \| "xs" \| "sm" \| "default" \| "lg"` | `"icon"` | Button 크기. 기본 `icon`은 32px 정사각                             |
| `href`      | `string`                                                                             | —        | 링크 주소. 해시 라우터 주의 ([위 참고](#페이지-이동-연결하기))     |
| `onClick`   | `(e: React.MouseEvent) => void`                                                      | —        | 상태 기반 이동 시 사용. 보통 `e.preventDefault()`와 함께           |
| `className` | `string`                                                                             | —        | Button 클래스와 병합되어 `<a>`에 적용                              |
| 그 외       | `<a>` 속성                                                                           | —        | `aria-disabled`, `tabIndex`, `title` 등 그대로 전달                |

### `PaginationPrevious` / `PaginationNext`

`PaginationLink`의 모든 prop을 그대로 받고, 아래가 추가됩니다.

| Prop   | 타입     | 기본값                  | 설명                                                     |
| ------ | -------- | ----------------------- | -------------------------------------------------------- |
| `text` | `string` | `"Previous"` / `"Next"` | 라벨 문구. `""`이면 아이콘만. 640px 미만에서는 자동 숨김 |

미리 채워져 있는 값(직접 넘기면 덮어쓸 수 있습니다):

- `size="default"` — 라벨이 들어가므로 가로형 버튼
- `aria-label="Go to previous page"` / `"Go to next page"`
- 화살표 아이콘: `ChevronLeftIcon`(앞) / `ChevronRightIcon`(뒤) — **교체 불가**

### `PaginationEllipsis`

| Prop        | 타입          | 기본값 | 설명                                                     |
| ----------- | ------------- | ------ | -------------------------------------------------------- |
| `className` | `string`      | —      | 기본 `flex size-8 items-center justify-center` 위에 병합 |
| 그 외       | `<span>` 속성 | —      | 그대로 전달                                              |

:::note children으로 `…` 모양을 바꿀 수는 없습니다
아이콘(`MoreHorizontalIcon`)이 컴포넌트 안에 고정되어 있어 `children`을 넘겨도 무시됩니다. 다른 모양이 필요하면 [스타일링](#4-생략-표시-모양-바꾸기)의 CSS 방법을 쓰거나, `PaginationItem` 안에 직접 원하는 요소를 넣으세요.
:::

---

## 접근성

---

Pagination은 링크(`<a>`)로 만들어져 있어 **브라우저 기본 동작**을 그대로 씁니다.

| 키              | 동작                           |
| --------------- | ------------------------------ |
| `Tab`           | 다음 페이지 링크로 포커스 이동 |
| `Shift` + `Tab` | 이전 링크로 포커스 이동        |
| `Enter`         | 포커스된 링크로 이동           |

:::caution `Space`로는 눌리지 않습니다
`<button>`이 아니라 `<a>`이기 때문에 스페이스바는 페이지 스크롤로 동작합니다. 이게 문제가 되는 화면이라면 링크가 아니라 버튼으로 만든 별도 페이저를 검토하세요.
:::

자동으로 처리되는 것:

- 루트에 `role="navigation"` + `aria-label="pagination"` → 스크린리더가 "페이지네이션 탐색 영역"으로 안내합니다.
- `isActive` 링크에 `aria-current="page"` → "현재 페이지"로 읽힙니다.
- 이전/다음에 `aria-label`이 붙어 있어, 라벨을 지워(`text=""`) 아이콘만 남겨도 **의미가 전달됩니다.**
- 생략 표시는 `aria-hidden`이라 스크린리더가 건너뜁니다(장식).
- 포커스 링은 Button의 규칙(`--ring` 토큰)을 따릅니다.

직접 챙겨야 하는 것:

- **`aria-label`을 한글로** 바꾸려면 직접 넘기세요. 기본값이 영문이고, 넘긴 값이 우선합니다.
  ```tsx
  <PaginationPrevious href="#" text="이전" aria-label="이전 페이지로 이동" />
  ```
- **비활성 상태**는 `aria-disabled`로 알려야 합니다. ([동작 옵션 4번](#4-첫끝-페이지에서-막기))
- 목록과 페이저가 멀리 떨어져 있다면, 페이지 이동 후 목록 상단으로 **포커스를 옮겨** 주는 편이 친절합니다.

---

## 스타일링 & 테마

---

Pagination은 **shadcn 기본 룩앤필만 가진 프리미티브**입니다. 실제 프로젝트에서는 거의 항상 새 디자인을 입히게 되므로, 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것           | 방법                                |
| --------------------- | ----------------------------------- |
| 버튼 크기             | `size` **prop**                     |
| 정렬 · 간격 · 개별 색 | 각 파트의 **`className`**           |
| 색 전반(테마)         | **디자인 토큰**                     |
| 겉모습 전면 교체      | **`data-slot` 선택자 + CSS Module** |

### 1. 색은 디자인 토큰을 따릅니다

`PaginationLink`는 Button의 `ghost` / `outline` variant를 그대로 쓰므로, 색을 통째로 바꾸고 싶다면 pagination 전용 변수를 만들지 말고 **테마 토큰**(`--primary`, `--muted`, `--border`, `--ring` 등)을 조정하세요. 토큰 정의는 [디자인 토큰 만들기](../../documents/design-system/create-design-tokens)를 참고하세요.

### 2. 인스턴스 단위 조정 — `className`

한 화면에서만 쓰는 조정이라면 각 파트에 `className`을 직접 넘기는 편이 읽기 쉽습니다.

```tsx
{
  /* 숫자 폭이 들쭉날쭉하지 않게 고정폭 숫자 사용 */
}
<PaginationLink href="#" className="tabular-nums">
  10
</PaginationLink>;

{
  /* 현재 페이지를 브랜드 컬러로 채우기 */
}
<PaginationLink
  href="#"
  isActive
  className="bg-primary text-primary-foreground hover:bg-primary/90"
>
  2
</PaginationLink>;
```

### 3. 겉모습 전면 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 **`data-slot`** 을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                           | 대상                     |
| ----------------------------------- | ------------------------ |
| `[data-slot="pagination"]`          | 루트 `<nav>`             |
| `[data-slot="pagination-content"]`  | 항목 목록 `<ul>`         |
| `[data-slot="pagination-item"]`     | 각 항목 `<li>`           |
| `[data-slot="pagination-link"]`     | 번호 · 이전 · 다음 `<a>` |
| `[data-slot="pagination-ellipsis"]` | 생략(`…`) 표시           |

현재 페이지만 따로 잡을 때는 `data-active="true"` 또는 `aria-current="page"`를 덧붙입니다.

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯 2단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap [data-slot="pagination-content"] {
  gap: 6px;
}
.wrap [data-slot="pagination-link"] {
  min-width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
}
/* 현재 페이지 — false 도 속성으로 렌더되므로 반드시 ="true" 로 비교 */
.wrap [data-slot="pagination-link"][data-active="true"] {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...]`처럼 **래퍼로 한 번 더 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 4. 생략 표시 모양 바꾸기

`…` 아이콘은 교체할 수 없지만, CSS로 감추고 다른 글자를 넣을 수는 있습니다.

```css
.wrap [data-slot="pagination-ellipsis"] svg {
  display: none;
}
.wrap [data-slot="pagination-ellipsis"]::after {
  content: "···";
  letter-spacing: 1px;
}
```

:::note `className`과 `data-slot`, 어느 쪽을 쓸까

- **한 화면에서만** 쓰는 페이저 → 각 파트에 `className`을 직접 넘기는 편이 읽기 쉽습니다. (아래 실전 예제가 이 방식)
- **여러 화면에 공통 적용**할 프로젝트 표준 페이저 → 래퍼 컴포넌트를 하나 만들고 그 안에서 `data-slot` 선택자로 한 번에 잡는 편이 유지보수에 낫습니다.
  :::

---

## 실전 예제

---

제공 Pagination을 **그대로 쓰되** `*.module.css`만 입혀 완전히 다른 룩앤필(각진 카드형 + 브랜드 그라데이션 액티브)로 만든 예제입니다. 구조·동작은 [방법 A 기본형](#2-방법-a--화면-상태로-이동-기본형)과 동일하고, 달라진 것은 각 파트에 넘긴 `className`뿐입니다.

### 각진 카드형 페이저

<img
  src="../assets/ui/pagination-real-custom.png"
  alt="각진 카드형 페이저 커스터마이징"
  width="80%"
/>

**포인트**

- 제공 `Pagination` 파트를 **그대로** 씁니다. 마크업·ARIA는 전부 컴포넌트에 맡깁니다.
- 번호(`.link`) · 화살표(`.arrow`) · 생략(`.ellipsis`)에 각각 `className`만 넘겨 룩앤필을 바꿨습니다.
- 현재 페이지는 `isActive`가 만드는 `outline` 위에 `.active` 클래스로 그라데이션을 덮어썼습니다.
- 첫/끝 페이지에서는 `.disabled`(`opacity` + `pointer-events: none`)로 화살표를 막습니다.
- 다크 모드는 앱 규칙(`.dark`)에 맞춰 `:global(.dark) .클래스`로 **색만 교체**합니다.

<details>
<summary><b>CustomPagination.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/pagination/CustomPagination.tsx"
import { useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@axiom/components/ui";
import styles from "./CustomPagination.module.css";

/**
 * 퍼블리셔가 pagination 프리미티브에 *.module.css 만 입혀
 * 완전히 다른 룩앤필(각진 카드형 + 브랜드 컬러 액티브)로 만든 예시.
 *
 * 컴포넌트 구조·동작은 기본 예제와 동일하고, 달라진 건 각 조각에 넘긴
 * className 뿐이다. 실제 SI 프로젝트에서는 이 파일 옆의
 * CustomPagination.module.css 만 교체하면 룩앤필이 바뀐다.
 *
 * 페이지 이동은 실제로 동작하도록 useState 로 현재 페이지를 관리한다.
 * (해시 라우터를 쓰므로 <a href> 로 이동하지 않고 onClick 에서 preventDefault 후 상태만 바꾼다.)
 */
export default function CustomPagination(): React.ReactNode {
  const totalPages = 8;
  const [page, setPage] = useState(1);

  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  // 현재 페이지 주변만 노출하고 멀어지면 … 로 접는 범위 계산
  const pages: (number | "ellipsis")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }

  return (
    <div className={styles.wrap}>
      <Pagination>
        {/* highlight-next-line */}
        <PaginationContent className={styles.list}>
          <PaginationItem>
            {/* highlight-next-line */}
            <PaginationPrevious
              href="#"
              text="이전"
              onClick={go(page - 1)}
              aria-disabled={page === 1}
              className={`${styles.arrow} ${page === 1 ? styles.disabled : ""}`}
            />
          </PaginationItem>

          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <PaginationItem key={`e-${i}`}>
                <PaginationEllipsis className={styles.ellipsis} />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                {/* highlight-next-line */}
                <PaginationLink
                  href="#"
                  isActive={p === page}
                  onClick={go(p)}
                  className={`${styles.link} ${p === page ? styles.active : ""}`}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              href="#"
              text="다음"
              onClick={go(page + 1)}
              aria-disabled={page === totalPages}
              className={`${styles.arrow} ${
                page === totalPages ? styles.disabled : ""
              }`}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <p className={styles.status}>
        전체 {totalPages}페이지 중 <b>{page}</b>페이지
      </p>
    </div>
  );
}
```

</details>

<details>
<summary><b>CustomPagination.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/pagination/CustomPagination.module.css"
/* ────────────────────────────────────────────────────────────
 * 퍼블리셔 커스터마이징 예시 스타일
 *
 * pagination 컴포넌트(@axiom/components/ui)는 shadcn 기본 룩앤필만 가진
 * 프리미티브다. 실제 SI 프로젝트에서는 퍼블리셔가 이런 식으로
 * *.module.css 를 입혀 완전히 다른 디자인(각진 카드형 + 브랜드 액티브)으로 만든다.
 *
 * 각 조각은 pagination.tsx 가 붙여주는 data-slot 속성(예 [data-slot="pagination-link"])
 * 으로도 타겟팅할 수 있으나, 여기서는 className 을 직접 넘겨 스코프가 확실한
 * module.css 로 입혔다. 다크 모드는 앱 규칙(.dark)에 맞춰 `:global(.dark) .클래스` 로 처리한다.
 * ──────────────────────────────────────────────────────────── */

.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* 목록 컨테이너 — 조각 사이 간격을 넓히고 정렬 */
.list {
  gap: 6px;
}

/* 숫자 링크 버튼 — 각진 카드형 */
.link {
  min-width: 38px;
  height: 38px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.link:hover {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

/* 현재 페이지 — 브랜드 컬러로 채움 */
.active,
.active:hover {
  border-color: #4f46e5;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  box-shadow: 0 2px 6px rgb(79 70 229 / 35%);
}

/* 이전 / 다음 화살표 버튼 */
.arrow {
  height: 38px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-weight: 600;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.arrow:hover {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

/* 비활성(첫/끝 페이지) 화살표 */
.disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* 생략 표시(…) */
.ellipsis {
  color: #94a3b8;
}

/* 상태 표시 텍스트 */
.status {
  font-size: 12px;
  color: #64748b;
}

.status b {
  color: #4f46e5;
  font-weight: 700;
}

/* ── 다크 모드 — 색 토큰만 교체 ─────────────────────────────── */
:global(.dark) .link {
  border-color: #334155;
  background: #0f172a;
  color: #cbd5e1;
}

:global(.dark) .active,
:global(.dark) .active:hover {
  border-color: #6366f1;
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: #fff;
  box-shadow: none;
}

:global(.dark) .arrow {
  border-color: #334155;
  background: #0f172a;
  color: #94a3b8;
}

/* … .link:hover / .arrow:hover / .ellipsis / .status 도 동일 패턴으로 색만 교체 */
```

</details>

:::tip 이 예제에서 가져갈 것
동작(페이지 상태·범위 계산·비활성 처리)은 **화면이 갖고**, 컴포넌트는 **마크업과 접근성만** 제공합니다. 바꾸는 건 ①각 파트에 넘기는 `className`(또는 `data-slot` 오버라이드) ②`isActive` 같은 prop 두 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---
