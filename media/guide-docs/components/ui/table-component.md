---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Table"
hide_table_of_contents: false
---

# Table 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **저수준 표(table) 프리미티브**입니다.
HTML `<table>` 계열 태그를 1:1로 감싼 8개 파트를 조합해 쓰며, 마크업과 스타일을 100% 직접 제어합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Table`(`/example/ui-components/table`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 행·열이 **고정된 정적인 표** — 요금제 비교표, 약관 비교표, 상세 정보 표, 스펙 표
- 데이터가 **소량**이라 정렬·검색·페이징이 필요 없는 목록
- 표의 **디자인을 완전히 자유롭게** 잡아야 하는 화면 (컬러 헤더, 줄무늬, 카드형 표 등)
- 셀 안에 배지·버튼·차트 등 **임의의 JSX**를 넣어야 하는 표

:::caution 정렬·검색·페이징이 필요하면 Table이 아닙니다
`Table`에는 **정렬·검색·페이징·행선택·엑셀 내보내기가 없습니다.** 전부 직접 구현해야 합니다.
업무용 조회 화면(회원/거래/주문 목록)처럼 표 기능이 세트로 필요하면 [SmartTable](./smart-table-component)을 쓰세요. 아래 [Table vs SmartTable](#table-vs-smarttable) 비교를 먼저 확인하세요.
:::

---

## Table vs SmartTable

---

같은 "표"지만 **추상화 수준이 다릅니다.** 화면 성격에 맞게 고르세요.

| 구분                    | `Table` (저수준)                | `SmartTable` (고수준)                        |
| ----------------------- | ------------------------------- | -------------------------------------------- |
| 작성 방식               | JSX로 행/셀을 직접 조립         | 컬럼 설정 맵(`defineColumns`) 선언           |
| 데이터 바인딩           | 직접 `.map()` 렌더              | `data` 배열 또는 `endpoint` 자동 배선        |
| 정렬 / 검색 / 페이징    | 없음 (직접 구현)                | 내장                                         |
| 행 선택 / 행 액션       | 없음 (직접 구현)                | 내장 (`selectable` / `renderRowActions`)     |
| 값 포맷(금액·전화·날짜) | 직접 변환                       | 내장 (`format`)                              |
| 엑셀(xlsx) 내보내기     | 없음                            | 내장 (`exportable`)                          |
| 병합 헤더 / 합계 행     | `colSpan`/`rowSpan` 수동        | 설정만으로 자동 (`mergeCells` / `summary`)   |
| 스타일 자유도           | **최고** — 마크업까지 100% 제어 | `variant`·`density` + `classNames` 슬롯      |
| 적합한 화면             | 정적/소량, 완전 커스텀 레이아웃 | 업무 그리드(대량·CRUD 목록)                  |

:::tip 한 줄 요약
**마크업·디자인을 자유롭게 잡아야 하면 `Table`, 기능이 붙은 업무 그리드가 필요하면 `SmartTable`.**
참고로 `SmartTable`도 **내부에서 이 `Table`을 사용**합니다. 그래서 두 컴포넌트는 `data-slot="table-*"`을 공유합니다([스타일링 & 테마](#스타일링--테마) 참고).
:::

---

## Import

---

```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@axiom/components/ui";
```

8개 파트를 조합해서 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::note 별도 타입 import이 필요 없습니다
모든 파트는 `React.ComponentProps<"table" | "thead" | "tr" | "th" | "td" | ...>`를 그대로 받습니다. 즉 **전용 Props 타입이 없고**, 표준 HTML 속성이 곧 API입니다. 라이브러리(Radix 등) 의존성도 없어 배럴에서 static export 됩니다.
:::

---

## 기본 사용법

---

`Table` 안에 `TableHeader` / `TableBody`를 두고, 각 행은 `TableRow`, 헤더 셀은 `TableHead`, 데이터 셀은 `TableCell`로 채웁니다. **순수 HTML 테이블 구조와 완전히 동일합니다.**

<img src="../assets/ui/table-basic.png" alt="Table 기본 사용법" width="100%" />

```tsx
type Invoice = {
  id: string;
  customer: string;
  method: "카드" | "계좌이체" | "가상계좌";
  amount: number;
};

const invoices: Invoice[] = [
  { id: "INV-001", customer: "김철수", method: "카드", amount: 250000 },
  { id: "INV-002", customer: "이영희", method: "계좌이체", amount: 125000 },
  // …
];

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>주문번호</TableHead>
      <TableHead>고객</TableHead>
      <TableHead>결제수단</TableHead>
      <TableHead className="text-right">금액</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((row) => (
      <TableRow key={row.id}>
        <TableCell className="font-medium">{row.id}</TableCell>
        <TableCell>{row.customer}</TableCell>
        <TableCell>{row.method}</TableCell>
        <TableCell className="text-right">{won(row.amount)}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>;
```

- 행 hover 배경(`hover:bg-muted/50`)과 행 구분선은 **기본으로 들어 있습니다.** 별도 설정이 필요 없습니다.
- `Table`은 **가로 스크롤 컨테이너(`overflow-x-auto`)를 자동으로 감싸므로**, 열이 많아 넘쳐도 페이지 레이아웃이 깨지지 않습니다.

---

## 구성 (Anatomy)

---

```tsx
<Table>                {/* div(가로 스크롤 컨테이너) + <table> */}
  <TableCaption />     {/* <caption> — 표 설명 (기본적으로 표 '아래'에 렌더) */}
  <TableHeader>        {/* <thead> */}
    <TableRow>         {/* <tr> */}
      <TableHead />    {/* <th> — 헤더 셀 */}
    </TableRow>
  </TableHeader>
  <TableBody>          {/* <tbody> */}
    <TableRow>
      <TableCell />    {/* <td> — 데이터 셀 */}
    </TableRow>
  </TableBody>
  <TableFooter>        {/* <tfoot> — 합계 등 마무리 행 */}
    <TableRow>
      <TableCell />
    </TableRow>
  </TableFooter>
</Table>
```

| 파트           | 대응 HTML   | 역할                                                          |
| -------------- | ----------- | ------------------------------------------------------------- |
| `Table`        | `<table>`   | 표 루트. **가로 스크롤 `div`로 한 번 감싸서** 렌더합니다.      |
| `TableHeader`  | `<thead>`   | 헤더 영역. 마지막 행 아래 구분선을 넣습니다.                   |
| `TableBody`    | `<tbody>`   | 데이터 행 영역. 마지막 행의 구분선을 제거합니다.               |
| `TableFooter`  | `<tfoot>`   | 합계 등 마무리 행. 배경(`bg-muted/50`)·굵기가 자동 강조됩니다. |
| `TableRow`     | `<tr>`      | 행. hover·선택(`data-state="selected"`) 강조 내장.            |
| `TableHead`    | `<th>`      | 헤더 셀. 좌측 정렬 + `font-medium` 기본.                      |
| `TableCell`    | `<td>`      | 데이터 셀.                                                    |
| `TableCaption` | `<caption>` | 표 설명 캡션.                                                 |

:::caution `Table`의 `className`은 `<table>`에 붙습니다
`Table`은 실제로 **두 개의 요소**를 렌더합니다.

```tsx
<div data-slot="table-container" className="relative w-full overflow-x-auto">
  <table data-slot="table" className="w-full caption-bottom text-sm …" />
</div>
```

`<Table className="…">`으로 넘긴 클래스는 **안쪽 `<table>`에만** 적용됩니다. 즉 `<Table className="max-h-80 overflow-y-auto">`처럼 **컨테이너를 겨냥한 클래스는 동작하지 않습니다.** 컨테이너를 조정하려면 `[data-slot="table-container"]`를 선택자로 잡으세요 → [세로 스크롤 · sticky 헤더](#7-세로-스크롤--sticky-헤더)
:::

### 기본 클래스 (무엇이 이미 적용돼 있는가)

내 스타일이 "왜 안 먹는지" 판단하려면 기본값을 알아야 합니다. 아래가 각 파트에 들어 있는 전부입니다.

| 파트                     | 기본 클래스                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `Table` (컨테이너 `div`) | `relative w-full overflow-x-auto`                                                                        |
| `Table` (`<table>`)      | `w-full caption-bottom text-sm`                                                                          |
| `TableHeader`            | `[&_tr]:border-b`                                                                                        |
| `TableBody`              | `[&_tr:last-child]:border-0`                                                                             |
| `TableFooter`            | `border-t bg-muted/50 font-medium [&>tr]:last:border-b-0`                                                |
| `TableRow`               | `border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted` |
| `TableHead`              | `h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0` |
| `TableCell`              | `p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0`                                        |
| `TableCaption`           | `mt-4 text-sm text-muted-foreground`                                                                     |

여기서 **자주 문제가 되는 세 가지**를 미리 알아두세요.

- **`whitespace-nowrap`** — 셀은 기본적으로 줄바꿈하지 않습니다. 긴 텍스트는 표를 넓히고 컨테이너가 가로 스크롤됩니다. 줄바꿈이 필요하면 해당 셀에 `whitespace-normal`(+ `max-w-*`)을 주세요.
- **`caption-bottom`** — `TableCaption`을 JSX 맨 위에 써도 **화면에는 표 아래**에 나옵니다. 위로 올리려면 `<Table className="caption-top">`.
- **`[&:has([role=checkbox])]:pr-0`** — 체크박스가 든 셀은 오른쪽 패딩이 사라집니다. scaffold `Checkbox`(Radix)는 `role="checkbox"`로 렌더되므로 자동으로 적용됩니다.

---

## 사용 패턴

---

`Table`은 prop으로 동작을 켜고 끄는 컴포넌트가 아닙니다. **HTML 표를 짜는 방식 그대로** 필요한 형태를 조립합니다. 실무에서 반복되는 패턴을 순서대로 정리합니다.

### 1. 정렬(align) · 숫자 셀

정렬은 셀의 `className`으로 처리합니다. 금액·수량 같은 숫자 열은 `text-right`와 함께 **`tabular-nums`(고정폭 숫자)** 를 주면 자릿수가 세로로 맞습니다.

```tsx
<TableHead className="text-right">금액</TableHead>
<TableHead className="text-center">상태</TableHead>
…
<TableCell className="text-right tabular-nums">{won(row.amount)}</TableCell>
<TableCell className="text-center">{row.status}</TableCell>
```

:::tip 헤더와 본문에 **같은** 정렬 클래스를 주세요
`TableHead`(`<th>`)와 `TableCell`(`<td>`)은 별개 요소입니다. 헤더만 `text-right`를 주면 본문은 좌측 정렬로 남습니다.
:::

### 2. 상태 셀 — Badge 조합

셀에는 임의의 JSX가 들어갑니다. 상태 열은 scaffold `Badge`를 넣어 강조하는 패턴이 가장 흔합니다.

<img src="../assets/ui/table-align.png" alt="Table 정렬과 Badge 셀" width="100%" />

```tsx
import { Badge } from "@axiom/components/ui";

// 상태값 → 배지 표시 규칙을 한곳에 모아둔다.
const statusBadge: Record<
  Invoice["status"],
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  paid: { label: "완료", variant: "default" },
  pending: { label: "대기", variant: "secondary" },
  failed: { label: "실패", variant: "destructive" },
};

<TableCell className="text-center">
  <Badge variant={statusBadge[row.status].variant}>
    {statusBadge[row.status].label}
  </Badge>
</TableCell>;
```

### 3. Caption · Footer (합계 행)

`TableCaption`으로 표 설명을, `TableFooter`로 합계 행을 붙입니다. Footer는 배경·굵기가 자동으로 강조됩니다.

<img src="../assets/ui/table-footer.png" alt="TableCaption과 TableFooter 합계 행" width="100%" />

```tsx
const total = invoices.reduce((sum, r) => sum + r.amount, 0);

<Table>
  <TableCaption>2025년 3월 결제 내역</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>주문번호</TableHead>
      <TableHead>고객</TableHead>
      <TableHead className="text-right">금액</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>{/* …행… */}</TableBody>
  <TableFooter>
    <TableRow>
      {/* 앞 두 열을 합쳐 '합계' 라벨로 */}
      <TableCell colSpan={2}>합계</TableCell>
      <TableCell className="text-right">{won(total)}</TableCell>
    </TableRow>
  </TableFooter>
</Table>;
```

- 캡션은 **`caption-bottom`이 기본**이라 표 아래에 렌더됩니다. 위로 올리려면 `<Table className="caption-top">`.
- Footer의 셀 개수 합(= `colSpan` 합계)은 헤더 열 수와 **반드시 일치**해야 표가 어긋나지 않습니다.

### 4. 행 선택 — `data-state="selected"`

`TableRow`에 `data-state="selected"`를 주면 선택 강조 배경(`bg-muted`)이 적용됩니다. **선택 로직 자체는 직접 구현**하고, 체크박스는 scaffold `Checkbox`를 씁니다.

<img src="../assets/ui/table-selected.png" alt="Table 행 선택" width="100%" />

```tsx
import { useState } from "react";
import { Checkbox } from "@axiom/components/ui";

const [selected, setSelected] = useState<string[]>([]);
const toggle = (id: string) =>
  setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

<TableRow
  // highlight-next-line
  data-state={selected.includes(row.id) ? "selected" : undefined}
  onClick={() => toggle(row.id)}
  className="cursor-pointer"
>
  <TableCell>
    <Checkbox
      checked={selected.includes(row.id)}
      onCheckedChange={() => toggle(row.id)}
      // highlight-next-line
      onClick={(e) => e.stopPropagation()} // 행 클릭과 이중 토글 방지
      aria-label={`${row.id} 선택`}
    />
  </TableCell>
  {/* …나머지 셀… */}
</TableRow>;
```

:::caution 행 클릭 + 체크박스는 이벤트가 겹칩니다
체크박스는 행 안에 있으므로 체크박스 클릭이 행 `onClick`까지 전파되어 **토글이 두 번** 일어납니다. 체크박스에 `onClick={(e) => e.stopPropagation()}`을 반드시 넣으세요.
또한 `data-state`는 `"selected"` **정확한 문자열**일 때만 강조됩니다(`true`/`"select"` 등은 무반응). 해제 시에는 `undefined`를 주어 속성 자체를 제거하세요.
:::

### 5. 셀 병합 — `colSpan` / `rowSpan`

표준 HTML 속성이 그대로 통합니다. 다단계 헤더는 `TableHeader` 안에 `TableRow`를 두 줄 두고 `colSpan`/`rowSpan`으로 짭니다.

```tsx
<TableHeader>
  <TableRow>
    <TableHead rowSpan={2}>주문번호</TableHead>
    <TableHead colSpan={2} className="text-center">
      결제
    </TableHead>
  </TableRow>
  <TableRow>
    <TableHead>수단</TableHead>
    <TableHead className="text-right">금액</TableHead>
  </TableRow>
</TableHeader>
```

:::note 다단계 헤더가 자주 필요하면 SmartTable
`colSpan`/`rowSpan`을 손으로 맞추는 일은 열이 늘어날수록 깨지기 쉽습니다. 병합 헤더·본문 세로 병합·합계가 세트로 필요하면 SmartTable의 [그룹 헤더](./smart-table-component#6-그룹다단계-헤더)·[`mergeCells`](./smart-table-component#7-mergecells--본문-세로-병합)를 쓰는 편이 안전합니다.
:::

### 6. 열 너비 고정

기본 `<table>`은 내용에 따라 열 너비가 변합니다. 너비를 고정하려면 헤더 셀에 폭 클래스를 주고, 필요하면 `table-fixed`를 함께 씁니다.

```tsx
{/* table-fixed: 첫 행의 지정 너비대로 열을 고정 (내용 길이 무시) */}
<Table className="table-fixed">
  <TableHeader>
    <TableRow>
      <TableHead className="w-10" />           {/* 체크박스 열 */}
      <TableHead className="w-32">주문번호</TableHead>
      <TableHead>적요</TableHead>              {/* 남은 폭 차지 */}
      <TableHead className="w-28 text-right">금액</TableHead>
    </TableRow>
  </TableHeader>
  …
</Table>
```

- `table-fixed`를 쓰면 **긴 텍스트가 열을 밀어내지 않습니다.** 대신 넘치는 텍스트 처리를 직접 지정해야 합니다 → `<TableCell className="truncate">` 또는 `whitespace-normal`.
- `table-fixed` 없이 `w-*`만 주면 브라우저가 **최소 너비 힌트**로만 취급합니다(내용이 길면 늘어남).

### 7. 세로 스크롤 · sticky 헤더

`Table`이 감싸는 컨테이너는 `overflow-x-auto`입니다. CSS 규칙상 한 축이 `auto`면 **다른 축도 스크롤 가능해지므로**, 컨테이너에 높이 제한만 주면 세로 스크롤 + sticky 헤더가 동작합니다. 단 [컨테이너는 `className`으로 닿지 않으므로](#구성-anatomy) 슬롯 선택자로 잡습니다.

```tsx
{/* 부모에서 자손 슬롯을 겨냥해 컨테이너 높이를 제한 */}
<div className="[&_[data-slot=table-container]]:max-h-80">
  <Table>
    <TableHeader>
      <TableRow>
        {/* sticky + '불투명' 배경이 둘 다 있어야 본문이 헤더를 통과해 보이지 않는다 */}
        <TableHead className="sticky top-0 z-10 bg-card">주문번호</TableHead>
        <TableHead className="sticky top-0 z-10 bg-card">고객</TableHead>
      </TableRow>
    </TableHeader>
    …
  </Table>
</div>
```

- sticky는 `<thead>`가 아니라 **`<th>`(`TableHead`)에** 걸어야 브라우저 호환성이 좋습니다.
- 배경을 빼면 스크롤된 본문이 헤더 뒤로 비칩니다. 색은 토큰(`bg-card`·`bg-background`·`bg-muted`)을 쓰세요.
- CSS Module을 쓰는 프로젝트라면 `.wrap :global([data-slot="table-container"]) { max-height: 20rem; }`로 같은 일을 합니다.

### 8. 빈 상태 (데이터 0건)

행이 없을 때 `<tbody>`를 비워두면 헤더만 남아 어색합니다. 전체 열을 병합한 한 행으로 안내 문구를 넣습니다.

```tsx
<TableBody>
  {rows.length === 0 ? (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={4}
        className="h-24 text-center text-muted-foreground"
      >
        조회 결과가 없습니다.
      </TableCell>
    </TableRow>
  ) : (
    rows.map((row) => <TableRow key={row.id}>{/* … */}</TableRow>)
  )}
</TableBody>
```

빈 상태 행은 클릭 대상이 아니므로 `hover:bg-transparent`로 hover 강조를 끄는 편이 자연스럽습니다.

### 9. 펼치는 행 (확장 행)

`TableRow`에는 `has-aria-expanded:bg-muted/50`이 들어 있습니다. **행 안에 `aria-expanded="true"`인 요소가 있으면 그 행이 자동으로 강조**된다는 뜻입니다. 상세를 펼치는 표에서 "지금 펼쳐진 행"을 따로 state로 칠할 필요가 없습니다.

```tsx
// 한 건마다 '요약 행 + 상세 행' 두 개를 반환하므로 Fragment 로 묶는다.
import { Fragment, useState } from "react";

const [openId, setOpenId] = useState<string | null>(null);

<TableBody>
  {invoices.map((row) => (
    <Fragment key={row.id}>
      {/* 이 행은 아래 버튼이 열려 있는 동안 자동으로 강조된다 */}
      <TableRow>
        <TableCell>
          <button
            type="button"
            // highlight-next-line
            aria-expanded={openId === row.id}
            aria-controls={`detail-${row.id}`}
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
          >
            {openId === row.id ? "접기" : "펼치기"}
          </button>
        </TableCell>
        <TableCell>{row.id}</TableCell>
      </TableRow>

      {openId === row.id && (
        <TableRow id={`detail-${row.id}`}>
          <TableCell colSpan={2}>{/* 상세 내용 */}</TableCell>
        </TableRow>
      )}
    </Fragment>
  ))}
</TableBody>;
```

:::note
`aria-expanded={false}`는 강조되지 않습니다(선택자가 `[aria-expanded="true"]`). 그리고 이 강조는 **트리거가 그 행 안에 있을 때만** 동작합니다.
:::

---

## API 레퍼런스

---

`Table` 계열은 **전용 prop이 없습니다.** 각 파트는 대응 HTML 요소의 props(`React.ComponentProps<...>`)를 그대로 받아 전달하고, `className`만 내부 기본 클래스와 `cn()`으로 병합합니다.

| 파트           | 타입                            | 받는 props                                                          |
| -------------- | ------------------------------- | ------------------------------------------------------------------- |
| `Table`        | `React.ComponentProps<"table">` | `className`(→ `<table>`에 적용), `id`, `aria-*`, `role`, `children` … |
| `TableHeader`  | `React.ComponentProps<"thead">` | `className`, 표준 `<thead>` 속성                                    |
| `TableBody`    | `React.ComponentProps<"tbody">` | `className`, 표준 `<tbody>` 속성                                    |
| `TableFooter`  | `React.ComponentProps<"tfoot">` | `className`, 표준 `<tfoot>` 속성                                    |
| `TableRow`     | `React.ComponentProps<"tr">`    | `className`, `onClick`, `data-state`, `data-*`, `aria-*`            |
| `TableHead`    | `React.ComponentProps<"th">`    | `className`, `colSpan`, `rowSpan`, `scope`, `aria-sort`, `onClick`  |
| `TableCell`    | `React.ComponentProps<"td">`    | `className`, `colSpan`, `rowSpan`, `headers`, `onClick`             |
| `TableCaption` | `React.ComponentProps<"caption">` | `className`, 표준 `<caption>` 속성                                |

### 컴포넌트가 해석하는 속성

정식 prop은 아니지만, **기본 클래스가 반응하는 상태 속성**이 두 개 있습니다.

| 대상       | 속성                        | 효과                                                              |
| ---------- | --------------------------- | ----------------------------------------------------------------- |
| `TableRow` | `data-state="selected"`     | 행 배경을 `bg-muted`로 강조 (선택 표시)                            |
| `TableRow` | 자손의 `aria-expanded="true"` | 행 배경을 `bg-muted/50`로 강조 (펼쳐진 행 표시)                  |

### data-slot

각 파트는 아래 `data-slot`을 노출합니다. CSS Module·자손 선택자로 겉모습을 바꿀 때 사용합니다.

| data-slot                       | 대상                            |
| ------------------------------- | ------------------------------- |
| `[data-slot="table-container"]` | 가로 스크롤 컨테이너 `div`      |
| `[data-slot="table"]`           | `<table>`                       |
| `[data-slot="table-header"]`    | `<thead>`                       |
| `[data-slot="table-body"]`      | `<tbody>`                       |
| `[data-slot="table-footer"]`    | `<tfoot>`                       |
| `[data-slot="table-row"]`       | 모든 `<tr>`                     |
| `[data-slot="table-head"]`      | 모든 `<th>`                     |
| `[data-slot="table-cell"]`      | 모든 `<td>`                     |
| `[data-slot="table-caption"]`   | `<caption>`                     |

:::caution 이 슬롯은 SmartTable과 공유됩니다
`SmartTable`도 내부에서 이 `Table`을 사용하므로 `data-slot="table-*"`은 **화면의 모든 표가 공유**합니다. 전역으로 선택하면 다른 표까지 바뀝니다. 반드시 래퍼 클래스로 스코프를 거세요.
:::

---

## 접근성

---

표준 `<table>` 마크업을 그대로 쓰기 때문에 **스크린리더의 표 탐색 모드가 정상 동작**합니다. 다만 `Table`은 Radix 같은 동작 레이어가 없는 프리미티브이므로, 아래 항목은 **직접 넣어야 합니다.**

| 항목                | 무엇을 해야 하나                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| 표 제목             | `TableCaption`으로 제공(권장). 시각적으로 숨기려면 `className="sr-only"`. 캡션이 없으면 `Table`에 `aria-label`. |
| 헤더 방향           | 열 머리글엔 `<TableHead scope="col">`, 행 머리글엔 `<TableHead scope="row">`. **자동으로 붙지 않습니다.** |
| 정렬 상태           | 직접 정렬을 구현했다면 `<TableHead aria-sort="ascending" \| "descending" \| "none">`.                    |
| 셀 안의 컨트롤      | 체크박스·아이콘 버튼에는 **행을 식별할 수 있는** `aria-label`(예: `aria-label="INV-001 선택"`).           |
| 병합 헤더           | 2단 이상 헤더는 `scope`/`colSpan`만으로 모호할 수 있어 `headers`·`id` 연결을 검토하세요.                 |

:::caution 행 전체 클릭은 키보드로 조작할 수 없습니다
`<TableRow onClick={…}>`은 `<tr>`이라 **포커스를 받지 못하고 Enter/Space도 동작하지 않습니다.** 행 클릭은 마우스 사용자를 위한 **보조 수단**으로만 두고, 실제 동작은 셀 안의 `Checkbox`·`Button` 같은 **초점 가능한 컨트롤**이 담당하게 하세요. 그러면 키보드는 `Tab` → `Space`로 같은 일을 할 수 있습니다.
:::

**키보드**: `Table` 자체에는 키보드 상호작용이 없습니다(포커스 대상이 아님). `Tab` 이동은 셀 안에 넣은 컨트롤 순서를 따르고, 스크린리더 사용자는 리더의 표 탐색 키(NVDA `Ctrl+Alt+방향키` 등)로 셀을 이동합니다.

:::note 레이아웃 용도로 쓰지 마세요
`<table>`은 스크린리더에 "여기는 표"라고 알립니다. 단순 2열 배치가 목적이면 `grid`/`flex`를 쓰세요.
:::

---

## 스타일링 & 테마

---

`Table`은 **가장 얇은 프리미티브**라 스타일 자유도가 제일 높습니다. 바꾸려는 대상에 따라 방법을 고르세요.

| 바꾸려는 것                        | 방법                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| 특정 열의 정렬·너비·여백           | 그 셀의 **`className`**                                     |
| 표 컨테이너(높이·스크롤·테두리)    | **`[data-slot="table-container"]`** (className은 `<table>`행) |
| 색(헤더 배경·구분선·선택 행)       | **디자인 토큰**(`--muted`, `--border`, `--foreground`)       |
| 겉모습 전면 교체(줄무늬·컬러 헤더) | **`data-slot` 선택자 + CSS Module**                         |
| 프로젝트 공통 표 룩               | 도메인에 **래퍼 컴포넌트**를 만들어 재사용                   |

:::tip 핵심 원칙
모든 파트가 `cn()`으로 클래스를 병합하므로 **내가 넘긴 `className`이 뒤에 와서 우선 적용**됩니다. 즉 대부분의 조정은 `className`만으로 끝납니다. `Table`에는 공개 CSS 변수(테마 계약)가 **없습니다** — Accordion처럼 `--accordion-*` 노브를 찾지 마세요. 색은 전역 토큰, 나머지는 className/CSS Module입니다.
:::

### 1. className으로 조정 (기본)

```tsx
{/* 정적 표라 hover 강조가 거슬릴 때 */}
<TableRow className="hover:bg-transparent">…</TableRow>

{/* 긴 적요 열만 줄바꿈 허용 */}
<TableCell className="max-w-64 whitespace-normal">{row.memo}</TableCell>

{/* 촘촘한(dense) 표 — 셀 패딩·헤더 높이 축소 */}
<TableHead className="h-8">주문번호</TableHead>
<TableCell className="p-1">{row.id}</TableCell>
```

### 2. 줄무늬 · 컬러 헤더 (className만으로)

`map`의 인덱스로 배경을 번갈아 주고, 헤더 셀에 배경색을 얹으면 룩이 완전히 달라집니다.

<img src="../assets/ui/table-custom.png" alt="Table 줄무늬와 컬러 헤더 커스터마이징" width="100%" />

```tsx
{/* border-separate: 헤더 셀에 radius를 주기 위해 셀 경계를 분리 */}
<Table className="border-separate border-spacing-0">
  <TableHeader>
    <TableRow className="hover:bg-transparent">
      <TableHead className="bg-violet-600 text-white first:rounded-tl-lg">
        주문번호
      </TableHead>
      <TableHead className="bg-violet-600 text-white">고객</TableHead>
      <TableHead className="bg-violet-600 text-white text-right last:rounded-tr-lg">
        금액
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((row, i) => (
      <TableRow
        key={row.id}
        // 홀수 행만 옅은 배경 — 줄무늬(zebra)
        className={i % 2 ? "bg-violet-50/50 dark:bg-violet-900/10" : ""}
      >
        <TableCell className="font-mono">{row.id}</TableCell>
        <TableCell>{row.customer}</TableCell>
        <TableCell className="text-right tabular-nums">
          {won(row.amount)}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 3. 전면 교체 — `data-slot` + CSS Module

표가 여러 화면에서 같은 룩을 가져야 하거나 스타일이 커지면, className 대신 CSS Module에서 슬롯을 잡습니다.

```css title="InvoiceTable.module.css"
/* 래퍼(.wrap) 아래에서만 적용되도록 스코프를 건다.
 * data-slot="table-*" 은 SmartTable을 포함해 화면의 모든 표가 공유한다. */
.wrap :global([data-slot="table-container"]) {
  max-height: 20rem; /* 세로 스크롤 */
  border: 1px solid var(--border);
  border-radius: 12px;
}

/* 헤더 — sticky + 토큰 배경 */
.wrap :global([data-slot="table-header"]) :global([data-slot="table-head"]) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12px;
}

/* 줄무늬 */
.wrap
  :global([data-slot="table-body"])
  :global([data-slot="table-row"]):nth-child(even) {
  background: color-mix(in oklab, var(--muted) 40%, transparent);
}

/* 선택된 행 */
.wrap :global([data-slot="table-row"][data-state="selected"]) {
  background: var(--accent);
}
```

```tsx
import styles from "./InvoiceTable.module.css";

<div className={styles.wrap}>
  <Table>…</Table>
</div>;
```

:::tip 명시도 & 스코프 주의

- 기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap :global([data-slot='…']) :global([data-slot='…'])`처럼 **2단계 이상 겹쳐** 명시도를 확보하세요.
- 슬롯을 전역으로 선택하면 같은 화면의 SmartTable까지 바뀝니다. 반드시 래퍼 클래스로 스코프를 거세요.
- CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
  :::

### 4. 색은 디자인 토큰으로

`Table` 전용 색 변수는 없습니다. 기본 스타일이 쓰는 토큰은 아래와 같으니, 테마 차원에서 표 색을 바꾸려면 이 토큰을 조정하세요. (표만을 위한 색 변수를 새로 만들면 토큰 체계가 분열됩니다.)

| 토큰                 | 어디에 쓰이나                                     |
| -------------------- | ------------------------------------------------- |
| `--border`           | 행 구분선(`border-b`)·Footer 상단선               |
| `--muted`            | 행 hover(50%)·Footer 배경(50%)·선택 행(100%)      |
| `--foreground`       | 헤더 셀 글자색                                    |
| `--muted-foreground` | 캡션 글자색                                       |

다크 모드는 앱 규칙(`.dark`)을 따릅니다. className으로 색을 줄 때는 `dark:` 유틸리티를, CSS Module에서는 `:global(.dark) .wrap { … }`으로 토큰만 교체하세요.

### 5. 반복되면 래퍼 컴포넌트로

같은 표 룩을 여러 화면에서 쓰면 `Table` 조합을 **도메인 컴포넌트로 감싸** 재사용하세요. **`src/shared/lib/shadcn/ui/table.tsx`를 복사해 고치지 마세요** — shadcn 원본이라 업스트림 갱신 시 충돌합니다.

```tsx title="src/domains/<도메인>/components/InvoiceTable.tsx"
// 표 '조합'을 감싼 래퍼 — 원본 컴포넌트는 그대로 둔다.
export default function InvoiceTable({ rows }: { rows: Invoice[] }) {
  return (
    <div className={styles.wrap}>
      <Table>{/* 프로젝트 표 규칙(정렬·너비·합계)을 여기 한 번만 정의 */}</Table>
    </div>
  );
}
```

---

## 실전 예제

---

아래 예제는 scaffold 예제 화면 `UI Components > Table`(`/example/ui-components/table`)에서 직접 동작합니다. 전체 소스는 **한 파일**(`src/domains/example/pages/ui-components/TableComponent.tsx`)에 있고, 아래 코드는 가이드 페이지용 장식(`SectionHeader`·`ExCard`·`CodeBlock`)을 제외한 발췌입니다.

### 1. 결제 내역 표 — 정렬 · 배지 · 합계

정렬·상태 배지·합계 행을 한 표에 모은, 가장 흔한 정적 표 형태입니다.

**포인트**

- 상태값 → 배지 규칙을 `statusBadge` 맵으로 **한곳에 모아** 셀에서는 조회만 합니다.
- 금액 열은 `text-right tabular-nums`로 자릿수를 맞춥니다.
- 합계는 `TableFooter` + `colSpan`으로 처리하고, 값은 `reduce`로 계산합니다.

<details>
<summary><b>TableComponent.tsx</b> — 데이터 · 결제 내역 표 소스 보기</summary>

```tsx title="src/domains/example/pages/ui-components/TableComponent.tsx"
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  Badge,
} from "@axiom/components/ui";

// ── 샘플 데이터 ───────────────────────────────────────────────────────
type Invoice = {
  id: string;
  customer: string;
  method: "카드" | "계좌이체" | "가상계좌";
  status: "paid" | "pending" | "failed";
  amount: number;
};

const invoices: Invoice[] = [
  { id: "INV-001", customer: "김철수", method: "카드", status: "paid", amount: 250000 },
  { id: "INV-002", customer: "이영희", method: "계좌이체", status: "pending", amount: 125000 },
  { id: "INV-003", customer: "박민수", method: "가상계좌", status: "paid", amount: 350000 },
  { id: "INV-004", customer: "최지우", method: "카드", status: "failed", amount: 90000 },
  { id: "INV-005", customer: "정해인", method: "계좌이체", status: "paid", amount: 480000 },
];

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

const statusBadge: Record<
  Invoice["status"],
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  paid: { label: "완료", variant: "default" },
  pending: { label: "대기", variant: "secondary" },
  failed: { label: "실패", variant: "destructive" },
};

export default function InvoiceTable(): React.ReactNode {
  const total = invoices.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Table>
      <TableCaption>2025년 3월 결제 내역</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">주문번호</TableHead>
          <TableHead scope="col">고객</TableHead>
          <TableHead scope="col" className="text-center">
            상태
          </TableHead>
          <TableHead scope="col" className="text-right">
            금액
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.id}</TableCell>
            <TableCell>{row.customer}</TableCell>
            <TableCell className="text-center">
              <Badge variant={statusBadge[row.status].variant}>
                {statusBadge[row.status].label}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {won(row.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          {/* colSpan 합계(3) + 금액 열(1) = 헤더 열 수(4) */}
          <TableCell colSpan={3}>합계</TableCell>
          <TableCell className="text-right tabular-nums">{won(total)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
```

</details>

### 2. 행 선택 표 — 체크박스 + `data-state`

`Table`에는 행 선택 기능이 없으므로 **선택 상태를 화면이 관리**합니다. 선택 표시는 `data-state="selected"`에 맡깁니다.

**포인트**

- 선택 상태는 `useState<string[]>` — 표가 아니라 **화면의 state**입니다.
- 행 전체 클릭과 체크박스 클릭이 겹치므로 체크박스에서 `stopPropagation()`.
- 체크박스에는 `aria-label`로 **어느 행인지** 알려줍니다. (`<tr>`은 포커스를 못 받으므로 키보드 조작은 이 체크박스가 담당)

<details>
<summary><b>TableComponent.tsx</b> — 행 선택 소스 보기</summary>

```tsx title="src/domains/example/pages/ui-components/TableComponent.tsx"
import { useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Checkbox,
} from "@axiom/components/ui";

export default function SelectableTable(): React.ReactNode {
  // 선택 상태는 컴포넌트가 관리하지 않는다 — 화면 state로 직접 보관
  const [selected, setSelected] = useState<string[]>(["INV-002"]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <>
      <p className="text-xs text-muted-foreground">
        선택된 행: {selected.length ? selected.join(", ") : "없음"}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            {/* 체크박스 열은 폭만 잡고 라벨은 비운다 */}
            <TableHead className="w-10" />
            <TableHead scope="col">주문번호</TableHead>
            <TableHead scope="col">고객</TableHead>
            <TableHead scope="col" className="text-right">
              금액
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((row) => {
            const checked = selected.includes(row.id);
            return (
              <TableRow
                key={row.id}
                // highlight-next-line
                data-state={checked ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => toggle(row.id)}
              >
                <TableCell>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(row.id)}
                    // 행 클릭과 중복 토글되지 않도록 셀 클릭 전파를 막는다.
                    // highlight-next-line
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${row.id} 선택`}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.id}</TableCell>
                <TableCell>{row.customer}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {won(row.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
```

</details>

:::tip 두 예제에서 가져갈 것
`Table`은 **동작을 주지 않는 대신 아무 제약도 걸지 않습니다.** 여기서 한 일은 ①표준 HTML 속성(`colSpan`·`scope`) ②`className` ③`data-state`로 상태 표시 위임 ④선택·합계 같은 **로직은 화면에서 직접** — 네 가지뿐입니다. 로직이 커지기 시작하면 그때가 SmartTable로 옮길 시점입니다.
:::

---

## 자주 하는 실수

---

| 증상                                              | 원인                                          | 해결                                                        |
| ------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 캡션이 표 위에 안 나온다                          | `<table>`이 `caption-bottom`                  | `<Table className="caption-top">`                           |
| 긴 텍스트가 줄바꿈되지 않고 표가 넓어진다         | 셀 기본값이 `whitespace-nowrap`               | 해당 셀에 `whitespace-normal`(+ `max-w-*`)                  |
| `<Table className="max-h-80 overflow-auto">`가 무반응 | `className`은 안쪽 `<table>`에 붙음        | `[&_[data-slot=table-container]]:max-h-80` 또는 CSS Module   |
| sticky 헤더가 안 붙는다 / 뒤가 비친다             | 컨테이너 높이 제한 없음 · 헤더 배경 투명      | 컨테이너 `max-height` + `TableHead`에 `sticky top-0 bg-card` |
| 정적 표인데 마우스 올리면 배경이 바뀐다           | `TableRow` 기본 hover                         | `<TableRow className="hover:bg-transparent">`               |
| 선택 행 강조가 안 된다                            | `data-state` 값이 `"selected"`가 아님         | 정확히 `data-state="selected"` (해제는 `undefined`)         |
| 체크박스를 누르면 선택이 두 번 토글된다           | 행 `onClick`으로 이벤트 전파                  | 체크박스에 `onClick={(e) => e.stopPropagation()}`            |
| 열이 어긋난다                                     | `colSpan` 합이 헤더 열 수와 불일치            | 각 행의 셀 수 + `colSpan` 합을 헤더 열 수와 맞추기          |
| `w-32`를 줬는데 열 너비가 안 지켜진다             | 내용이 길면 브라우저가 최소 너비로만 취급     | `<Table className="table-fixed">` 함께 사용                  |
| 키보드로 행을 선택할 수 없다                      | `<tr onClick>`은 포커스 대상이 아님           | 셀 안 `Checkbox`/`Button`이 동작을 담당하게 하기            |
| 정렬·페이징이 없다                                | `Table`은 기능 없는 프리미티브                | [SmartTable](./smart-table-component) 사용                   |
| 다른 화면의 표까지 스타일이 바뀌었다              | `data-slot="table-*"`을 전역으로 선택         | 래퍼 클래스로 스코프 걸기                                    |

---
