---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Card"
hide_table_of_contents: false
---

# Card 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 카드 컴포넌트입니다.  
**하나의 주제로 묶인 정보를 한 덩어리(박스)로 끊어 보여줄 때** 사용합니다.

**언제 쓰나요?**

- 대시보드 KPI·요약 지표처럼 **여러 정보를 카드 단위로 나열**할 때
- 로그인·설정처럼 **제목 + 입력 + 액션 버튼**이 한 세트인 폼 화면
- 상품·계좌·게시글처럼 **같은 형태의 항목을 목록으로 반복**할 때
- 목록에서 **하나를 골라야 하는** 선택 UI(플랜 선택 등)

> Card는 **동작(state)이 없는 순수 레이아웃 컴포넌트**입니다. 열림/닫힘 같은 내부 상태가 없고, `size` 하나를 제외하면 전부 **구조(어떤 파트를 넣었는가)** 로 모양이 결정됩니다.

:::caution 카드를 남용하지 마세요
모든 영역을 카드로 감싸면 테두리와 그림자가 겹쳐 오히려 정보 위계가 무너집니다. **"이 박스 안의 내용이 하나의 독립된 주제인가?"** 에 답할 수 있을 때만 카드를 씁니다. 단순히 여백만 필요하다면 `div` + 패딩으로 충분합니다.
:::

---

## Import

---

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@axiom/components/ui";
```

Card는 **7개의 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 전부 필수는 아니며 **필요한 것만 골라** 씁니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---

## 기본 사용법

---

가장 일반적인 조합은 `Card` + `CardHeader` + `CardContent` + `CardFooter`입니다. **Card 자체는 폭을 갖지 않으므로**, 폭은 `className`이나 부모 레이아웃에서 지정합니다.

<img
  src="../assets/ui/card-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
<Card className="w-full max-w-sm">
  <CardHeader>
    <CardTitle>월간 리포트</CardTitle>
    <CardDescription>2026년 7월 · 자동 집계</CardDescription>
  </CardHeader>
  <CardContent>
    이번 달 거래 건수는 1,248건으로 전월 대비 12% 증가했습니다.
  </CardContent>
  <CardFooter>
    <Button size="sm">상세 보기</Button>
  </CardFooter>
</Card>
```

- 파트의 **순서가 곧 세로 배치 순서**입니다(루트가 `flex-col`).
- `CardFooter`를 넣으면 카드의 **하단 패딩이 자동으로 제거**되어 푸터가 카드 끝에 딱 붙습니다.
- 배경·글자색은 디자인 토큰 `--card` / `--card-foreground`, 테두리는 `ring-1`(`--foreground` 10%)을 따릅니다.

:::tip 파트는 "필요한 것만" 넣습니다
`CardHeader` 없이 `CardContent`만 써도 되고, 제목 없이 `CardDescription`만 써도 됩니다. 다만 **`CardAction`은 반드시 `CardHeader`의 자식**이어야 우측 정렬이 동작합니다.
:::

---

## 구성 (Anatomy)

---

Card는 아래 7개 파트를 중첩해서 구성합니다.

```tsx
<Card>
  {" "}
  {/* 루트 — 배경 · 라운드 · 링 · 세로 패딩 · flex-col */}
  <CardHeader>
    {" "}
    {/* 헤더 영역 — grid (Title/Description/Action 배치) */}
    <CardTitle /> {/* 제목 */}
    <CardDescription /> {/* 보조 설명 */}
    <CardAction /> {/* (선택) 헤더 우측 액션 — 반드시 CardHeader 안에 */}
  </CardHeader>
  <CardContent /> {/* 본문 */}
  <CardFooter /> {/* (선택) 푸터 — 상단 보더 + muted 배경 */}
</Card>
```

| 파트              | 렌더 태그 | 역할                                                                     |
| ----------------- | --------- | ------------------------------------------------------------------------ |
| `Card`            | `div`     | 루트 박스. 배경·라운드·링·세로 패딩을 담당하고 `size`로 밀도를 정합니다. |
| `CardHeader`      | `div`     | 헤더 영역. **grid**라서 `CardAction` 유무에 따라 열 구성이 바뀝니다.     |
| `CardTitle`       | `div`     | 제목. `text-base` / `font-medium`.                                       |
| `CardDescription` | `div`     | 보조 설명. `text-muted-foreground`.                                      |
| `CardAction`      | `div`     | 헤더 우측 액션(버튼·뱃지·스위치 등). 헤더 그리드의 2열째에 배치됩니다.   |
| `CardContent`     | `div`     | 본문. 좌우 패딩만 가집니다(상하 간격은 루트의 `gap`이 담당).             |
| `CardFooter`      | `div`     | 푸터. 상단 보더 + `bg-muted/50`, 카드 하단에 붙습니다.                   |

:::note 전부 `div`입니다
`CardTitle`도 `h2`/`h3`가 아니라 `div`입니다. 문서 구조상 **시맨틱 제목이 필요하면 안에 heading을 직접 넣으세요** → `<CardTitle><h3>월간 리포트</h3></CardTitle>`. 자세한 내용은 [접근성](#접근성)을 참고하세요.
:::

---

## 동작 옵션

---

Card가 제공하는 **prop은 `size` 하나뿐**입니다. 나머지 "동작"은 전부 **어떤 파트를 넣었는지(구조)** 로 결정됩니다. 아래 6가지만 알면 Card의 모든 자동 동작을 이해한 것입니다.

### 1. 밀도 — `size`

Card의 유일한 자체 prop입니다. 루트에 `data-size`가 붙고 **하위 슬롯의 패딩·간격·제목 크기가 함께** 줄어듭니다.

```tsx
<Card size="default"> … </Card>   {/* py-4 · px-4 · gap-4 · 제목 text-base (기본값) */}
<Card size="sm"> … </Card>        {/* py-3 · px-3 · gap-3 · 제목 text-sm */}
```

<img
  src="../assets/ui/card-size.png"
  alt="size 비교"
  width="80%"
/>

- 목록에 카드를 **촘촘히 여러 장** 배치할 때(KPI 그리드, 사이드 패널) `sm`을 씁니다.
- `size`는 루트에만 주면 됩니다. 하위 파트는 `group-data-[size=sm]/card:` 로 **알아서 따라갑니다** — 각 파트마다 크기를 지정할 필요가 없습니다.

### 2. 헤더 우측 액션 — `CardAction`

`CardHeader` 안에 `CardAction`이 있으면 헤더가 **2열 그리드(`1fr auto`)** 로 바뀌어 액션이 제목 오른쪽 상단에 정렬됩니다. 별도 flex 레이아웃을 짤 필요가 없습니다.

<img
  src="../assets/ui/card-action.png"
  alt="CardAction"
  width="80%"
/>

```tsx
<Card className="w-full max-w-sm">
  <CardHeader>
    <CardTitle>결제 수단</CardTitle>
    <CardDescription>기본 카드로 등록됨</CardDescription>
    {/* highlight-start */}
    <CardAction>
      <Badge variant="secondary">기본</Badge>
    </CardAction>
    {/* highlight-end */}
  </CardHeader>
  <CardContent>신한카드 **** 4821 · 유효기간 09/28</CardContent>
</Card>
```

- `CardAction`은 `col-start-2 / row-start-1 / row-span-2`라서 **제목·설명 2줄 높이에 걸쳐 우측 상단**에 붙습니다.
- `CardHeader` 밖(예: `CardContent` 안)에 두면 그리드 밖이라 **정렬이 깨집니다.**

### 3. 이미지 슬롯 — 첫/마지막 자식 `img`

`Card`의 **첫 자식이 `<img>`면 상단 패딩이 자동으로 사라지고** 이미지 위쪽 모서리가 카드 라운드에 맞춰집니다. 마지막 자식이면 아래쪽 모서리가 둥글어집니다.

<img
  src="../assets/ui/card-image.png"
  alt="이미지 카드"
  width="80%"
/>

```tsx
<Card className="w-full max-w-xs">
  {/* 첫 자식이 img → pt-0 + 상단 모서리 라운드 자동 적용 */}
  <img src={cover} alt="커버 이미지" />
  <CardHeader>
    <CardTitle>디자인 시스템 가이드</CardTitle>
    <CardDescription>업데이트 2026.07.20</CardDescription>
  </CardHeader>
  <CardContent>컴포넌트 사용 규칙과 토큰 정의를 정리했습니다.</CardContent>
</Card>
```

:::caution `div`로 감싸면 동작하지 않습니다
이 규칙은 **`Card`의 직계 자식이 `img` 태그일 때만** 적용됩니다(`>img:first-child`). 썸네일을 `<div><img/></div>`처럼 감싸면 상단 패딩이 남습니다. 감싸야 한다면 [실전 예제 — 상품 카드](#1-커머스-상품-카드)처럼 CSS Module에서 루트 패딩을 직접 `0`으로 정리하세요.
:::

### 4. 푸터 — `CardFooter`

`CardFooter`가 있으면 **루트의 하단 패딩이 0으로 바뀝니다**(`has-data-[slot=card-footer]:pb-0`). 덕분에 푸터의 배경·보더가 카드 끝까지 꽉 차게 붙습니다.

```tsx
<CardFooter className="gap-2">
  <Button className="flex-1">저장</Button>
  <Button variant="outline" className="flex-1">
    취소
  </Button>
</CardFooter>
```

- 푸터는 `flex items-center`라서 버튼을 여러 개 두면 **가로로 나란히** 놓입니다. 간격은 `gap-*`, 우측 정렬은 `justify-end`로 조정합니다.
- 배경(`bg-muted/50`)과 상단 보더가 싫다면 `className="bg-transparent border-t-0"`으로 지웁니다.

### 5. 헤더 구분선 — `border-b`

`CardHeader`에 `border-b`를 주면 **하단 패딩(`pb-4`, sm은 `pb-3`)이 자동으로 따라옵니다.** 선만 긋고 여백을 따로 계산할 필요가 없습니다.

```tsx
<CardHeader className="border-b">
  <CardTitle>주문 내역</CardTitle>
</CardHeader>
```

### 6. 폭은 부모가 정합니다

Card는 **자체 폭을 갖지 않습니다.** 부모의 `grid`/`flex`가 폭을 결정하거나, `className="w-full max-w-sm"`처럼 직접 지정합니다.

```tsx
{
  /* 3열 KPI 그리드 — 폭은 부모 grid가 결정 */
}
<div className="grid grid-cols-3 gap-3">
  <Card size="sm"> … </Card>
  <Card size="sm"> … </Card>
  <Card size="sm"> … </Card>
</div>;
```

---

## API 레퍼런스

---

Card의 모든 파트는 **`div`를 그대로 감싼 것**이라, 아래 표에 없는 `div`의 표준 속성(`id`, `onClick`, `role`, `data-*`, `aria-*` 등)은 **전부 그대로 전달**됩니다.

### `Card` (루트)

| Prop        | 타입                          | 기본값      | 설명                                                             |
| ----------- | ----------------------------- | ----------- | ---------------------------------------------------------------- |
| `size`      | `"default" \| "sm"`           | `"default"` | 카드 전체의 패딩·간격·제목 크기. 루트에 `data-size`로 반영됩니다 |
| `className` | `string`                      | —           | `cn()`으로 병합 — 뒤에 준 유틸리티가 기본 클래스를 이깁니다      |
| `children`  | `ReactNode`                   | —           | 파트 및 임의 마크업(`img`, `div` 등)                             |
| `...props`  | `React.ComponentProps<"div">` | —           | `onClick`·`role`·`tabIndex` 등 div 속성 전부                     |

### `CardHeader`

| Prop        | 타입        | 기본값 | 설명                                                                                                  |
| ----------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `className` | `string`    | —      | `border-b`를 주면 하단 패딩이 자동 추가됩니다                                                         |
| `children`  | `ReactNode` | —      | `CardTitle` / `CardDescription` / `CardAction`. 자식 구성에 따라 **그리드 열·행이 자동으로 바뀝니다** |

### `CardTitle` · `CardDescription`

| Prop        | 타입        | 기본값 | 설명                                                            |
| ----------- | ----------- | ------ | --------------------------------------------------------------- |
| `className` | `string`    | —      | 크기·굵기·색 조정                                               |
| `children`  | `ReactNode` | —      | `div`로 렌더 — 시맨틱 제목이 필요하면 안에 `h2`/`h3`를 넣습니다 |

### `CardAction`

| Prop        | 타입        | 기본값 | 설명                                                      |
| ----------- | ----------- | ------ | --------------------------------------------------------- |
| `className` | `string`    | —      | 세로 정렬 조정 시 `self-center` 등                        |
| `children`  | `ReactNode` | —      | 버튼·뱃지·스위치. **반드시 `CardHeader`의 자식**이어야 함 |

### `CardContent` · `CardFooter`

| Prop        | 타입        | 기본값 | 설명                                                                       |
| ----------- | ----------- | ------ | -------------------------------------------------------------------------- |
| `className` | `string`    | —      | `CardFooter`는 `flex items-center`이므로 `justify-*`·`gap-*`이 잘 듣습니다 |
| `children`  | `ReactNode` | —      | 본문 / 하단 액션                                                           |

:::note 자동으로 걸리는 규칙 요약

| 조건                                  | 결과                                     |
| ------------------------------------- | ---------------------------------------- |
| `CardFooter` 존재                     | 루트 하단 패딩 제거 (`pb-0`)             |
| 첫 자식이 `img`                       | 루트 상단 패딩 제거 + 상단 모서리 라운드 |
| 마지막 자식이 `img`                   | 하단 모서리 라운드                       |
| `CardHeader`에 `CardAction` 존재      | 헤더가 2열 그리드(`1fr auto`)            |
| `CardHeader`에 `CardDescription` 존재 | 헤더가 2행 그리드                        |
| `CardHeader`에 `border-b`             | 헤더 하단 패딩 자동 추가                 |
| `size="sm"`                           | 하위 슬롯 패딩·간격·제목 크기 축소       |

:::

---

## 접근성

---

Card는 **의미 없는 `div` 묶음**입니다. Accordion·Dialog와 달리 ARIA가 자동으로 붙지 않으므로, **필요한 의미는 직접 부여**해야 합니다.

### 1. 제목의 시맨틱

`CardTitle`은 `div`입니다. 페이지 목차·스크린리더 탐색에 잡혀야 하는 제목이라면 안에 heading을 넣습니다.

```tsx
<CardTitle>
  <h3>월간 리포트</h3>
</CardTitle>
```

### 2. 카드 전체를 클릭 대상으로 쓸 때

`Card`에 `onClick`만 붙이면 **키보드로는 조작할 수 없습니다.** 아래 4가지를 함께 지정하세요.

```tsx
<Card
  // highlight-start
  role="button"
  tabIndex={0}
  aria-pressed={selected}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }}
  // highlight-end
  onClick={onSelect}
  className="cursor-pointer outline-none"
>
  …
</Card>
```

| 속성                          | 이유                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `role="button"`               | 스크린리더에 "누를 수 있는 요소"로 알림              |
| `tabIndex={0}`                | `Tab`으로 포커스가 들어오게 함                       |
| `onKeyDown` (`Enter`/`Space`) | 마우스 없이도 실행 가능하게 함                       |
| `aria-pressed`                | 선택형(토글)일 때 현재 상태 전달. 단순 이동이면 생략 |

:::caution 카드 안에 버튼·링크가 있다면 카드 전체를 클릭 대상으로 만들지 마세요
클릭 영역이 중첩되어 어떤 동작이 실행될지 예측할 수 없고, 스크린리더에서도 "버튼 안의 버튼"이 됩니다. 이 경우 **카드는 그대로 두고 내부 버튼/링크에만 동작을 붙이거나**, 제목만 링크로 만드세요.
:::

### 3. 그 외

- 이미지에는 반드시 `alt`을 넣습니다. 장식용이면 `alt=""`.
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다. `outline-none`으로 지웠다면 **대체 표시(ring·border)를 반드시 남기세요.**
- 카드 목록이 하나의 그룹이라면 부모에 `role="list"` / `aria-label`을 주는 편이 탐색에 유리합니다.

---

## 스타일링 & 테마

---

Card는 프로젝트마다 디자인이 **가장 크게 달라지는** 컴포넌트입니다. 아래 3단계 순서로 판단하면 **컴포넌트 원본(`src/shared/lib/shadcn/ui/card.tsx`)을 수정하지 않고도** 대부분의 디자인을 소화할 수 있습니다.

| 바꾸려는 것                      | 방법                                |
| -------------------------------- | ----------------------------------- |
| 이 카드 한 장의 색·여백·폭       | 각 파트의 **`className`**           |
| 카드 톤 전체(모양이 완전히 다름) | **`data-slot` 선택자 + CSS Module** |
| 앱 전체의 카드 배경·글자색       | **디자인 토큰**(`--card` 등)        |

### 1단계 — 사소한 변형은 `className`

모든 파트가 `className`을 `cn()`으로 병합하므로 **뒤에 준 유틸리티가 이깁니다.** 색·여백·폭 정도의 차이는 여기서 끝내고 CSS Module 파일을 만들지 않습니다.

```tsx
{
  /* 강조 카드 — 링 색상과 배경만 변경 */
}
<Card className="w-56 ring-violet-500/60 bg-violet-50/60 dark:bg-violet-900/15">
  {" "}
  …{" "}
</Card>;

{
  /* 경고 카드 — 좌측 컬러 바 */
}
<Card className="w-56 rounded-l-none border-l-4 border-l-amber-500"> … </Card>;
```

### 2단계 — 톤 전체가 바뀌면 `data-slot` + CSS Module

카드 디자인이 완전히 달라지면, 카드를 감싼 **래퍼 클래스 아래에서 `[data-slot="card-*"]` 선택자로** 덮어씁니다. 래퍼 + 슬롯 2단계 선택자는 Tailwind 단일 유틸리티보다 명시도가 높아 `!important` 없이 이깁니다.

| data-slot                        | 대상              | 기본 스타일에서 덮어쓸 지점                            |
| -------------------------------- | ----------------- | ------------------------------------------------------ |
| `[data-slot="card"]`             | `Card`            | `rounded-xl` · `bg-card` · `ring-1` · `py-4` · `gap-4` |
| `[data-slot="card-header"]`      | `CardHeader`      | `px-4` · `grid` · `gap-1`                              |
| `[data-slot="card-title"]`       | `CardTitle`       | `text-base` · `font-medium`                            |
| `[data-slot="card-description"]` | `CardDescription` | `text-sm` · `text-muted-foreground`                    |
| `[data-slot="card-action"]`      | `CardAction`      | `col-start-2` · 우측 상단 정렬                         |
| `[data-slot="card-content"]`     | `CardContent`     | `px-4`                                                 |
| `[data-slot="card-footer"]`      | `CardFooter`      | `border-t` · `bg-muted/50` · `p-4`                     |

```css
/* MyCard.module.css — 래퍼(.wrap) 아래에서 슬롯을 덮어쓴다 */
.wrap [data-slot="card"] {
  gap: 0;
  padding: 0;
  border-radius: 14px;
  --tw-ring-shadow: 0 0 #0000; /* scaffold의 ring-1 무력화 */
  border: 1px solid var(--my-border);
}

.wrap [data-slot="card-header"] {
  padding: 14px 14px 0;
}
.wrap [data-slot="card-title"] {
  font-size: 14px;
  font-weight: 700;
}
.wrap [data-slot="card-footer"] {
  background: transparent;
  border-top: 0;
}

/* 다크 모드는 앱 규칙에 맞춰 :global(.dark) 로 처리 */
:global(.dark) .wrap {
  --my-border: #2a2523;
}
```

:::tip `ring`은 `border`로 지워지지 않습니다
Card의 테두리는 `border`가 아니라 **`ring-1`(box-shadow)** 입니다. CSS Module에서 `border`만 새로 주면 링이 그대로 남아 이중선이 되므로, 위 예시처럼 `--tw-ring-shadow: 0 0 #0000;`으로 링을 먼저 끄세요.
:::

:::note 한 화면에 스킨을 두 개 이상 쓰려면
카드마다 스킨 클래스를 `className`으로 붙이고 CSS에서 스코프를 좁힙니다 → `.wrap .hero [data-slot='card-title']`, `.wrap .list [data-slot='card-title']`. 실제 사례는 [실전 예제 — 계좌 요약](#2-뱅킹-계좌-요약)에 있습니다.  
CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 3단계 — 앱 전체를 바꾸려면 디자인 토큰

`bg-card` / `text-card-foreground` / `bg-muted` 등은 **전역 테마 변수**를 참조합니다. 앱 전체의 카드 톤을 한 번에 바꾸려면 `src/assets/styles/`의 토큰을 조정하세요.

| 토큰                 | 적용 지점                    |
| -------------------- | ---------------------------- |
| `--card`             | 카드 배경                    |
| `--card-foreground`  | 카드 기본 글자색             |
| `--foreground`       | 테두리 링(10% 투명도로 사용) |
| `--muted-foreground` | `CardDescription` 글자색     |
| `--muted`            | `CardFooter` 배경(50%)       |
| `--ring`             | 포커스 링                    |

---

## 레시피

---

실무에서 반복적으로 나오는 조합입니다. 그대로 복사해서 시작하세요.

### 1. 폼 카드

제목·설명은 헤더, 입력은 본문, 제출/취소는 푸터에 둡니다.

```tsx
<Card className="w-full max-w-sm">
  <CardHeader>
    <CardTitle>로그인</CardTitle>
    <CardDescription>계정 정보를 입력하세요.</CardDescription>
    <CardAction>
      <Button variant="link" size="sm">
        회원가입
      </Button>
    </CardAction>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="space-y-1.5">
      <Label htmlFor="email">이메일</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="password">비밀번호</Label>
      <Input id="password" type="password" />
    </div>
  </CardContent>
  <CardFooter className="gap-2">
    <Button className="flex-1">로그인</Button>
    <Button variant="outline" className="flex-1">
      취소
    </Button>
  </CardFooter>
</Card>
```

### 2. 통계(KPI) 그리드

**`CardDescription`을 위, `CardTitle`을 아래**에 두는 것이 포인트입니다(라벨 → 수치 순서). 카드는 `size="sm"`으로 촘촘하게.

```tsx
<div className="grid grid-cols-3 gap-3">
  {stats.map((s) => (
    <Card key={s.label} size="sm">
      <CardHeader>
        <CardDescription>{s.label}</CardDescription>
        <CardTitle className="text-2xl">{s.value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {s.diff}
      </CardContent>
    </Card>
  ))}
</div>
```

### 3. 선택 가능한 카드 (인터랙티브)

Card는 `div`이므로 `onClick`·`role`·`aria-pressed`를 붙여 **선택 UI**로 쓸 수 있습니다. 선택 상태는 `className`으로 표현합니다.

<img
  src="../assets/ui/card-selectable.png"
  alt="선택 가능한 카드"
  width="80%"
/>

```tsx
const [selectedPlan, setSelectedPlan] = useState("pro");

<div className="grid grid-cols-3 gap-3">
  {PLANS.map((plan) => {
    const active = selectedPlan === plan.id;
    return (
      <Card
        key={plan.id}
        size="sm"
        // highlight-start
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={() => setSelectedPlan(plan.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedPlan(plan.id);
          }
        }}
        // highlight-end
        className={`cursor-pointer transition-all outline-none ${
          active
            ? "ring-2 ring-violet-500 bg-violet-50/60 dark:bg-violet-900/15"
            : "hover:ring-violet-400/60 hover:-translate-y-0.5"
        }`}
      >
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <CardDescription>{plan.price} / 월</CardDescription>
          {active && (
            <CardAction>
              <Badge>선택</Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {plan.desc}
        </CardContent>
      </Card>
    );
  })}
</div>;
```

- 선택 표시는 `ring-2`처럼 **테두리로** 주는 편이 배경만 바꾸는 것보다 명확합니다.
- `outline-none`을 줬다면 **포커스 시 대체 표시**를 반드시 남기세요(위 예시는 `ring`이 그 역할을 겸합니다).

---

## 실전 예제

---

제공 `Card`를 **구조 변경 없이 그대로** 쓰면서 `*.module.css`의 `data-slot` 선택자만으로 톤을 전부 갈아끼운 사례입니다. 전체 소스는 scaffold의 예제 컴포넌트에서 확인하세요.

### 1. 커머스 상품 카드

썸네일·할인 리본·품절 오버레이·찜/장바구니까지 실제로 동작하는 상품 목록입니다.

<img
  src="../assets/ui/card-real-product.png"
  alt="커머스 상품 카드"
  width="100%"
/>

**포인트**

- 제공 `Card`를 **그대로** 쓰고, 겉모습은 전부 `ProductCard.module.css`에서 `data-slot` 선택자로 오버라이드했습니다.
- 썸네일은 `div`로 감싸므로 [자동 이미지 슬롯 규칙](#3-이미지-슬롯--첫마지막-자식-img)이 적용되지 않습니다 → CSS에서 루트 `padding: 0`으로 직접 정리했습니다.
- 기본 `ring-1`을 `--tw-ring-shadow: 0 0 #0000`으로 끄고 `border` + `box-shadow`로 다시 그렸습니다.
- 찜(`liked`)·장바구니(`cart`) 상태는 **Card와 무관한 화면 자체 state**입니다. Card는 레이아웃만 담당합니다.

<details>
<summary><b>ProductCard.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/card/ProductCard.tsx"
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@axiom/components/ui";
import styles from "./ProductCard.module.css";

interface IProduct {
  id: string;
  emoji: string;
  name: string;
  brand: string;
  price: number;
  originPrice?: number;
  rating: number;
  reviewCount: number;
  soldOut?: boolean;
}

const PRODUCTS: IProduct[] = [
  {
    id: "p1",
    emoji: "🎧",
    name: "노이즈 캔슬링 무선 헤드폰 (오버이어)",
    brand: "SOUNDWAVE",
    price: 189000,
    originPrice: 259000,
    rating: 4.8,
    reviewCount: 1204,
  },
  // … 나머지 상품 데이터 생략
];

const won = (n: number): string => n.toLocaleString("ko-KR");

export default function ProductCard(): React.ReactNode {
  const [liked, setLiked] = useState<string[]>(["p1"]);
  const [cart, setCart] = useState<string[]>([]);

  const toggleLike = (id: string): void =>
    setLiked((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

  const addToCart = (id: string): void =>
    setCart((prev) => (prev.includes(id) ? prev : [...prev, id]));

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {PRODUCTS.map((p) => {
          const discount = p.originPrice
            ? Math.round((1 - p.price / p.originPrice) * 100)
            : 0;

          return (
            // highlight-next-line
            <Card key={p.id}>
              {/* 썸네일 — Card 안의 임의 영역도 자유롭게 넣을 수 있다 */}
              <div className={styles.thumb}>
                <span aria-hidden>{p.emoji}</span>
                {discount > 0 && !p.soldOut && (
                  <span className={styles.ribbon}>{discount}% SALE</span>
                )}
                {p.soldOut && <span className={styles.soldout}>SOLD OUT</span>}
              </div>

              <CardHeader>
                <CardDescription>{p.brand}</CardDescription>
                <CardTitle>{p.name}</CardTitle>
              </CardHeader>

              <CardContent>
                <div className={styles.priceRow}>
                  <span className={styles.price}>{won(p.price)}원</span>
                  {p.originPrice && (
                    <span className={styles.origin}>
                      {won(p.originPrice)}원
                    </span>
                  )}
                  {discount > 0 && (
                    <span className={styles.discount}>{discount}%</span>
                  )}
                </div>
                <div className={styles.meta}>
                  <span className={styles.star}>★ {p.rating.toFixed(1)}</span>
                  <span className={styles.dot}>|</span>
                  <span>리뷰 {won(p.reviewCount)}</span>
                </div>
              </CardContent>

              <CardFooter>
                <button
                  type="button"
                  className={styles.buyBtn}
                  disabled={p.soldOut}
                  onClick={() => addToCart(p.id)}
                >
                  {p.soldOut
                    ? "품절"
                    : cart.includes(p.id)
                      ? "담김 ✓"
                      : "장바구니"}
                </button>
                <button
                  type="button"
                  aria-label={liked.includes(p.id) ? "찜 해제" : "찜하기"}
                  aria-pressed={liked.includes(p.id)}
                  className={`${styles.likeBtn} ${liked.includes(p.id) ? styles.likeBtnOn : ""}`}
                  onClick={() => toggleLike(p.id)}
                >
                  {liked.includes(p.id) ? "♥" : "♡"}
                </button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>ProductCard.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/card/ProductCard.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 커머스(앰버/차콜) 톤 */
  --pc-amber: #d97706;
  --pc-amber-soft: #fff7ed;
  --pc-amber-line: #fed7aa;
  --pc-ink: #1c1917;
  --pc-muted: #a8a29e;
  --pc-card: #ffffff;
  --pc-border: #ece9e6;
  --pc-sale: #dc2626;

  color: var(--pc-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --pc-amber: #fbbf24;
  --pc-ink: #f5f0ea;
  --pc-card: #14110f;
  --pc-border: #2a2523;
  /* … 이하 동일 패턴 */
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

/* =========================================================================
 * scaffold Card 슬롯 오버라이드
 * 기본값(rounded-xl / ring-1 / py-4 / gap-4)을 걷어내고 상품 카드용으로 다시 짠다.
 * ========================================================================= */
/* highlight-start */
.wrap [data-slot="card"] {
  gap: 0;
  padding: 0;
  border-radius: 14px;
  background: var(--pc-card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
  --tw-ring-shadow: 0 0 #0000; /* ring-1 무력화 */
  border: 1px solid var(--pc-border);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}
/* highlight-end */

.wrap [data-slot="card"]:hover {
  transform: translateY(-3px);
  border-color: var(--pc-amber-line);
  box-shadow: 0 10px 24px -12px rgb(217 119 6 / 35%);
}

.wrap [data-slot="card-header"] {
  padding: 14px 14px 0;
  gap: 4px;
}

.wrap [data-slot="card-title"] {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  display: -webkit-box; /* 2줄 말줄임 */
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wrap [data-slot="card-description"] {
  font-size: 11.5px;
  color: var(--pc-muted);
}

.wrap [data-slot="card-content"] {
  padding: 10px 14px 14px;
}

/* 기본 푸터는 border-t + bg-muted/50 이라 여기선 투명하게 바꾼다 */
/* highlight-start */
.wrap [data-slot="card-footer"] {
  padding: 0 14px 14px;
  background: transparent;
  border-top: 0;
  gap: 8px;
}
/* highlight-end */

/* … 썸네일(.thumb) / 리본 / 가격 / 버튼 등 내 마크업 스타일은 생략 */
```

</details>

### 2. 뱅킹 계좌 요약

같은 Card로 전혀 다른 UI를 만든 두 번째 사례입니다. **한 화면에 스킨 두 개(`.hero` / `.list`)를 공존**시키기 위해 카드마다 스킨 클래스를 붙이고 CSS에서 스코프를 좁혔습니다.

<img
  src="../assets/ui/card-real-account.png"
  alt="뱅킹 계좌 요약"
  width="100%"
/>

**포인트**

- 두 카드 모두 `<Card className={styles.hero}>` / `<Card className={styles.list}>`처럼 **스킨 클래스만** 다르게 붙였습니다. 구조(JSX)는 동일한 파트 조합입니다.
- CSS에서는 `.wrap .hero [data-slot='card-title']`처럼 **스킨 클래스를 한 단계 더 끼워** 스코프를 좁힙니다 — 같은 페이지의 다른 카드에 영향이 가지 않습니다.
- 히어로 카드는 푸터를 **3분할 액션 바**로 재사용했습니다(`CardFooter`의 `flex`를 CSS에서 `grid`로 교체).
- 금액 숨김(`visible`) 토글은 `CardAction`에 넣은 일반 `button`입니다.

<details>
<summary><b>AccountSummaryCard.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/card/AccountSummaryCard.tsx"
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@axiom/components/ui";
import styles from "./AccountSummaryCard.module.css";

interface IAccount {
  id: string;
  icon: string;
  name: string;
  no: string;
  balance: number;
}

const MAIN_ACCOUNT = {
  name: "NIC 주거래 입출금통장",
  no: "110-482-***-921",
  balance: 12_487_300,
  yesterdayDiff: 320_000,
};

const ACCOUNTS: IAccount[] = [
  {
    id: "a1",
    icon: "💧",
    name: "수시입출금 통장",
    no: "110-482-***-921",
    balance: 12_487_300,
  },
  // … 나머지 계좌 데이터 생략
];

const won = (n: number): string => n.toLocaleString("ko-KR");

export default function AccountSummaryCard(): React.ReactNode {
  const [visible, setVisible] = useState(true);

  return (
    <div className={styles.wrap}>
      {/* ── 대표 계좌 (히어로 스킨) ─────────────────────── */}
      // highlight-next-line
      <Card className={styles.hero}>
        <CardHeader>
          <CardTitle>{MAIN_ACCOUNT.name}</CardTitle>
          <CardDescription>{MAIN_ACCOUNT.no}</CardDescription>
          <CardAction>
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? "금액 숨기기" : "금액 보기"}
            </button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <div className={styles.balance}>
            <span
              className={`${styles.balanceNum} ${visible ? "" : styles.balanceHidden}`}
            >
              {visible ? won(MAIN_ACCOUNT.balance) : "•••••••"}
            </span>
            <span className={styles.balanceUnit}>원</span>
          </div>
          <div className={styles.subLine}>
            어제보다 {visible ? `+${won(MAIN_ACCOUNT.yesterdayDiff)}원` : "•••"}
          </div>
        </CardContent>

        <CardFooter>
          <div className={styles.heroActions}>
            {["이체", "거래내역", "계좌관리"].map((label) => (
              <button key={label} type="button" className={styles.heroAction}>
                {label}
              </button>
            ))}
          </div>
        </CardFooter>
      </Card>
      {/* ── 전체 계좌 목록 (리스트 스킨) ─────────────────── */}
      // highlight-next-line
      <Card className={styles.list}>
        <CardHeader>
          <CardTitle>내 계좌 ({ACCOUNTS.length})</CardTitle>
          <CardAction>
            <button type="button" className={styles.moreBtn}>
              전체보기 ›
            </button>
          </CardAction>
        </CardHeader>

        <CardContent>
          {ACCOUNTS.map((a) => (
            <div key={a.id} className={styles.row}>
              <span className={styles.rowIcon} aria-hidden>
                {a.icon}
              </span>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{a.name}</div>
                <div className={styles.rowNo}>{a.no}</div>
              </div>
              <div
                className={`${styles.rowAmount} ${a.balance < 0 ? styles.amountOut : styles.amountIn}`}
              >
                {visible ? `${won(a.balance)}원` : "•••••원"}
              </div>
            </div>
          ))}
        </CardContent>

        <CardFooter>
          <span>
            총 자산{" "}
            {visible
              ? `${won(ACCOUNTS.reduce((s, a) => s + a.balance, 0))}원`
              : "•••••원"}
          </span>
          <span>기준시각 09:41</span>
        </CardFooter>
      </Card>
    </div>
  );
}
```

</details>

<details>
<summary><b>AccountSummaryCard.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/card/AccountSummaryCard.module.css"
.wrap {
  /* 이 예제 전용 색 토큰 — 뱅킹(청록/네이비) 톤 */
  --ac-teal: #008485;
  --ac-teal-deep: #00625f;
  --ac-navy: #10233a;
  --ac-soft: #eaf6f5;
  --ac-line: #d8e7e6;
  --ac-ink: #12211f;
  --ac-card: #ffffff;

  display: grid;
  gap: 14px;
  color: var(--ac-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --ac-teal: #38b2a7;
  --ac-ink: #e8f1f0;
  --ac-card: #0f1a1a;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * 스킨 1 — 대표 계좌 (그라데이션 히어로)
 * 슬롯 앞에 스킨 클래스(.hero)를 끼워 같은 페이지의 다른 카드와 분리한다.
 * ========================================================================= */
/* highlight-start */
.wrap .hero[data-slot="card"] {
  gap: 0;
  padding: 0;
  border-radius: 18px;
  border: 0;
  --tw-ring-shadow: 0 0 #0000;
  color: #fff;
  background: linear-gradient(135deg, var(--ac-teal-deep), var(--ac-navy));
  box-shadow: 0 14px 32px -18px rgb(0 98 95 / 70%);
}
/* highlight-end */

.wrap .hero [data-slot="card-header"] {
  padding: 18px 20px 0;
  gap: 2px;
}
.wrap .hero [data-slot="card-title"] {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.wrap .hero [data-slot="card-description"] {
  font-size: 12px;
  color: rgb(255 255 255 / 62%);
}
/* CardAction은 기본이 상단 정렬 — 헤더 세로 중앙에 맞춘다 */
.wrap .hero [data-slot="card-action"] {
  align-self: center;
}
.wrap .hero [data-slot="card-footer"] {
  padding: 0;
  background: rgb(255 255 255 / 8%);
  border-top: 1px solid rgb(255 255 255 / 14%);
  gap: 0;
}

/* 푸터를 3분할 액션 바로 재사용 */
.heroActions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
}

/* =========================================================================
 * 스킨 2 — 계좌 목록 (기본 톤)
 * ========================================================================= */
/* highlight-start */
.wrap .list[data-slot="card"] {
  gap: 0;
  padding: 0;
  border-radius: 16px;
  border: 1px solid var(--ac-line);
  --tw-ring-shadow: 0 0 #0000;
  background: var(--ac-card);
}
/* highlight-end */

.wrap .list [data-slot="card-header"] {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--ac-line);
}
/* 행이 카드 폭을 꽉 채우도록 본문 좌우 패딩 제거 */
.wrap .list [data-slot="card-content"] {
  padding: 0;
}
.wrap .list [data-slot="card-footer"] {
  padding: 10px 16px;
  background: var(--ac-soft);
  border-top: 1px solid var(--ac-line);
  justify-content: space-between;
}

/* … 행(.row) / 아이콘 / 금액 등 내 마크업 스타일은 생략 */
```

</details>

:::tip 두 예제를 비교해 보세요
같은 `Card`로 [커머스 상품 카드](#1-커머스-상품-카드)(앰버·그리드·썸네일)와 [뱅킹 계좌 요약](#2-뱅킹-계좌-요약)(청록·히어로+리스트)이 나옵니다. **컴포넌트는 손대지 않고** ①파트 조합 ②`className` 스킨 클래스 ③`data-slot` 오버라이드만 바꾼 결과입니다. Card를 복사해서 고치지 마세요.
:::

---
