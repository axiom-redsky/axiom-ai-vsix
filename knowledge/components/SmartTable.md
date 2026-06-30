---
title: SmartTable 컴포넌트 (선언형 고수준 데이터 그리드)
category: component
kind: component
tags: [smarttable, smart-table, 스마트테이블, 스마트 테이블, 스마트그리드, 데이터그리드, datagrid, data-grid,
       고수준테이블, 선언형테이블, 선언형 그리드, 그리드, grid, definecolumns, 컬럼dsl, 컬럼 dsl, 컬럼정의, 설정맵,
       smartcolumns, ismartcolumn, ismarttableprops, ismarttablehandle, ismartcellcontext,
       format, 포맷, badge, 배지, 상태배지, cell, 커스텀셀, accessor, aggregate, 집계,
       summary, 합계행, 소계, 합계, mergecells, 세로병합, 병합헤더, 다단계헤더, 그룹헤더, colspan, rowspan,
       searchable, 검색, 검색가능, exportable, export, 내보내기, xlsx, csv, 엑셀, 엑셀다운로드, excel, exporter,
       selectable, 행선택, 다중선택, 단일선택, onselectionchange, bulkactions, 일괄액션, renderrowactions, 행액션, onrowclick, 행클릭,
       endpoint, 서버모드, 클라이언트모드, parammap, 파라미터매핑, select, 응답어댑터, 서버페이징, pagesize, 페이지크기,
       sortmode, 정렬모드, sortdisplay, sorticons, 정렬아이콘, sortremoval, 정렬,
       variant, density, 밀도, 카드테이블, toolbar, 툴바, paginated, 페이징, classnames, 슬롯,
       ref, refetch, 재조회, getselectedrows, clearselection, setkeyword, gotopage, 명령형핸들,
       표, 테이블, 목록, 리스트, 페이지네이션, 데이터테이블, 회원목록, 그리드만들기, 표만들기]
scope: component
priority: 1
related: [components/Table.md, libraries/react-table.md, utils/util.md, patterns/use-api.md, design-system/components.md]
---

# SmartTable 컴포넌트

컬럼을 **설정 맵(DSL)** 으로 선언하면 포맷·정렬·페이징·검색·행액션·일괄액션·합계·export까지 자동으로 붙는 **고수준 데이터 그리드**다. 클라이언트(`data`) / 서버(`endpoint`) 두 모드를 **하나의 API**로 지원한다.

- 위치: `src/shared/ui/smart-table/`
- 예제 페이지: `src/domains/example/pages/ui-components/SmartTableComponent.tsx`
- 저수준 `ColumnDef`가 필요하면 기존 [Table.md](Table.md)(`DataTable`/tanstack)을 쓴다. SmartTable은 그 위의 **선언형 래퍼**다.

## 임포트

```tsx
import { SmartTable, defineColumns } from '@axiom/components/ui';
import type { ISmartTableHandle, SmartColumns, ISmartColumn } from '@axiom/components/ui';
```

> `defineColumns<TRow>(...)`는 런타임에 아무 일도 하지 않는 **타입 추론 헬퍼**다. 컬럼 맵을 감싸면 `cell`/`accessor`/`aggregate` 콜백의 `row` 타입이 `TRow`로 추론된다. 권장 사용법.

## 가장 빠른 시작

```tsx
type Member = { id: number; name: string; balance: number };

const columns = defineColumns<Member>({
  name: '이름',                                          // 문자열 = 라벨 단축형
  balance: { label: '잔액', format: 'money', align: 'right' },
});

<SmartTable data={members} columns={columns} searchable exportable />
```

이 한 줄로 정렬 / 페이지네이션 / 검색 / 컬럼 토글 / xlsx 내보내기가 모두 동작한다.

## 컬럼 DSL

컬럼 맵의 **key가 곧 데이터의 필드명**이다(`accessor`로 재정의 가능). 각 항목은 **3가지 형태** 중 하나다.

| 형태 | 예시 | 의미 |
|---|---|---|
| 문자열 | `name: '이름'` | 라벨만 지정(단축형) |
| leaf 객체 | `balance: { label: '잔액', format: 'money' }` | 상세 컬럼 정의(`ISmartColumn`) |
| 그룹 객체 | `info: { label: '고객정보', columns: {...} }` | 다단계(병합) 헤더(`ISmartColumnGroup`) |

### leaf 컬럼 옵션 (`ISmartColumn`)

| 옵션 | 타입 | 설명 |
|---|---|---|
| `label` | `string` | **(필수)** 헤더 라벨 |
| `format` | `SmartFormat` | 값 자동 포맷 → `$util`로 매핑(아래 표) |
| `align` | `'left' \| 'center' \| 'right'` | 셀/헤더 정렬(숫자는 `right` 권장) |
| `width` | `number \| string` | `72`(px) 또는 `'20%'` |
| `sortable` | `boolean` | 정렬 가능 여부(기본 `true`) |
| `hideable` | `boolean` | 컬럼 토글 메뉴 노출(기본 `true`) |
| `hidden` | `boolean` | 초기 숨김 |
| `badge` | `ISmartBadgeMap` | 값 → 상태 배지 매핑 |
| `mergeCells` | `boolean` | 연속 동일값 세로(rowspan) 병합 |
| `aggregate` | `'sum' \| 'avg' \| 'count' \| fn` | 하단 합계 행 집계 |
| `accessor` | `(row) => unknown` | key와 다른 값 추출 |
| `className` / `headerClassName` | `string` | 셀/헤더 className 오버라이드 |
| `cell` | `(ctx) => ReactNode` | **완전 커스텀 셀**(지정 시 `format`/`badge` 무시) |
| `columnDef` | `Partial<ColumnDef>` | 최종 탈출구: 원본 tanstack ColumnDef 일부 머지 |

### 배지 매핑 (`badge`)

값에 따라 색이 다른 상태 배지를 선언적으로 렌더한다. key는 `String(value)` 기준 매칭.

```tsx
status: {
  label: '상태',
  align: 'center',
  badge: {
    map: {
      active:  { label: '활성', variant: 'default' },
      dormant: { label: '휴면', variant: 'secondary' },
      blocked: { label: '정지', variant: 'destructive' },
    },
    fallbackVariant: 'outline', // map에 없는 값에 적용
  },
},
```

### 커스텀 셀 (escape hatch)

DSL로 표현이 안 되는 셀은 `cell` 함수로 직접 렌더한다. 컨텍스트는 `{ value, row, index }`(`ISmartCellContext<TRow>`).

```tsx
body: {
  label: '내용',
  cell: ({ value, row, index }) => (
    <span className="line-clamp-1 text-muted-foreground">{String(value)}</span>
  ),
},
```

> ⚠️ `cell`을 지정하면 `format`/`badge`는 **무시**된다. 둘을 함께 쓸 수 없다.

## format DSL → `$util` 매핑

`format` 문자열은 전역 `$util.number/date/string`으로 자동 연결된다. 콜론(`:`) 뒤로 인자를 받는다. 알 수 없는 format이나 빈 값은 안전하게 원본/빈문자로 폴백한다. (`$util` 상세: [util.md](../utils/util.md))

| format | 결과 | 매핑 |
|---|---|---|
| `money` | `1,250,000원` | `$util.number.currency(v, '원')` |
| `number` | `1,250,000` | `$util.number.comma` |
| `percent` | `12.3%` | `$util.number.percent` |
| `abbreviate` | `1.2M` | `$util.number.abbreviate` |
| `date` | 기본 날짜 | `$util.date.format(v)` |
| `date:YYYY.MM.DD` | `2024.03.12` | `$util.date.format(v, 'YYYY.MM.DD')` |
| `datetime` | `2024-03-12 09:30:00` | `format(v, 'YYYY-MM-DD HH:mm:ss')` |
| `fromNow` | `3일 전` | `$util.date.fromNow` |
| `phone` | `010-1234-5678` | `$util.string.formatMobile` |
| `rrn` / `bizno` / `cardno` | 각 서식 | `formatRRN` / `formatBizNo` / `formatCardNo` |
| `businessDate` | 영업일 서식 | `$util.string.formatBusinessDate` |
| `maskName` / `maskMobile` / `maskRRN` | 마스킹 | `$util.string.mask*` |
| `mask:1-2` | start-end 구간 마스킹 | `$util.string.mask(v, 1, 2)` |

## 다단계(병합) 헤더 & 세로 병합

### 그룹 헤더 (가로 colspan)

그룹은 `{ label, columns }`로 선언한다. 그룹은 colspan으로 묶이고, 그룹 밖 단독 컬럼은 자동으로 세로 rowspan 병합된다. **중첩 가능**하며, 컬럼 토글 시 그룹 폭도 자동 조정. **화면·엑셀 모두 동일하게** 병합 렌더된다.

```tsx
const columns = defineColumns<Member>({
  고객정보: {
    label: '고객정보',
    columns: {
      name: '이름',
      phone: { label: '연락처', format: 'phone' },
    },
  },
  계정상태: {
    label: '계정 상태',
    columns: {
      status: { label: '상태', badge: { /* ... */ } },
      joinedAt: { label: '가입일', format: 'date:YYYY.MM.DD' },
    },
  },
  balance: { label: '잔액', format: 'money', align: 'right' }, // 그룹 밖 → 세로 병합
});
```

### 본문 세로 병합 (`mergeCells`)

연속된 동일 값을 세로(rowspan)로 병합한다. **현재 페이지 기준**이며 왼쪽 컬럼의 병합 경계를 상속한다. 정렬/그룹된 데이터에서 사용한다.

```tsx
const columns = defineColumns<Ledger>({
  branch: { label: '지점', mergeCells: true, align: 'center' }, // 연속 동일값 병합
  team:   { label: '팀',   mergeCells: true, align: 'center' }, // 왼쪽(지점) 경계 상속
  name: '담당자',
  amount: { label: '실적', format: 'money', align: 'right', aggregate: 'sum' },
});
```

## 합계/소계 행 (`summary` + `aggregate`)

`summary` prop을 켜고 컬럼에 `aggregate`를 지정하면 하단에 합계 행이 생긴다.

```tsx
<SmartTable data={ledger} columns={ledgerColumns} summary />
<SmartTable data={ledger} columns={ledgerColumns} summary={{ label: '총계' }} /> // 라벨 커스텀
```

| `aggregate` | 동작 |
|---|---|
| `'sum'` | 컬럼 값을 숫자로 합산(컬럼 `format`으로 표시) |
| `'avg'` | 평균 |
| `'count'` | 행 수 |
| `(values, rows) => ReactNode` | 직접 계산(**화면 전용** — export 시 생략됨) |

> **집계 범위** — 클라이언트 모드: 필터된 전체 행 / 서버 모드: 현재 페이지 행.

## 클라이언트 모드 vs 서버 모드

`data`를 주면 클라이언트 모드, `endpoint`를 주면 서버 모드(`data` XOR `endpoint`).

### 클라이언트 모드

```tsx
<SmartTable
  data={members}
  columns={columns}
  searchable
  searchKeys={['name', 'phone']}   // 미지정 시 전 컬럼 검색
  selectable="multiple"
/>
```

정렬/검색/페이지/컬럼토글/행선택이 모두 **로컬(tanstack row model)** 로 처리된다.

#### 툴바/페이징 숨기기

상단 툴바와 하단 페이징 UI는 각각 `toolbar`/`paginated` prop으로 끈다. 둘 다 **기본 `true`(표시)**.

```tsx
<SmartTable
  data={members}
  columns={columns}
  toolbar={false}     // 검색·컬럼토글·export·일괄액션·슬롯 등 툴바 전체 숨김
  paginated={false}   // 하단 페이징 UI 숨김(클라이언트 모드에선 페이지 분할도 빠져 전체 렌더)
/>
```

> **서버 모드 주의** — `paginated={false}`의 "전체 표시"는 클라이언트 모드에서만이다. 서버 모드는 UI만 숨겨지고 여전히 서버 페이지 단위로 조회되므로, 전체를 받으려면 `pageSize`를 충분히 크게 준다.

#### 정렬 헤더 동작 (`sortMode` · `sortRemoval` · `sortDisplay` · `sortIcons`)

| prop | 값 | 동작 |
|---|---|---|
| `sortMode` | `'toggle'`(기본) / `'menu'` | 헤더 클릭으로 정렬 토글 / 드롭다운(오름·내림·숨기기) |
| `sortRemoval` | `true`(기본) / `false` | 오름→내림→해제 3단계 / 오름↔내림 2단계 |
| `sortDisplay` | `'hover'`(기본) / `'always'` / `'none'` / `'off'` | 힌트 아이콘 호버 노출 / 항상 / 숨김(클릭 정렬은 동작) / **정렬 기능 비활성** |
| `sortIcons` | `{ asc?, desc?, unsorted? }` | 정렬 아이콘 교체(lucide 등 className 받는 컴포넌트) |

```tsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

<SmartTable
  data={members}
  columns={columns}
  sortMode="menu"
  sortIcons={{ asc: ChevronUp, desc: ChevronDown, unsorted: ChevronsUpDown }}
/>
```

> 특정 컬럼만 정렬을 끄려면 컬럼 옵션 `sortable: false`. `sortDisplay="off"`는 **테이블 전체** 정렬을 끈다.

### 서버 모드

`endpoint`만 주면 페이징/정렬/검색이 서버 쿼리 파라미터로 자동 전송된다(내부적으로 [useApi](../patterns/use-api.md) 사용). 검색어는 **300ms 디바운스**.

```tsx
<SmartTable<Post>
  endpoint="https://jsonplaceholder.typicode.com/posts"
  method="GET"                                  // 기본 GET
  paramMap={{ page: '_page', size: '_limit', sort: '_sort', order: '_order', keyword: 'q' }}
  params={{ status: 'active' }}                 // 항상 붙는 고정 파라미터
  select={(raw) => ({ rows: raw as Post[], total: 100 })} // 응답 → { rows, total }
  columns={postColumns}
  pageSize={5}
  searchable
/>
```

#### `paramMap` — 서버별 파라미터명 매핑 (`ISmartServerParamMap`)

| 키 | 기본값 | 설명 |
|---|---|---|
| `page` / `size` | `'page'` / `'size'` | 페이지 번호 / 크기 파라미터명 |
| `sort` / `order` | `'sort'` / `'order'` | 정렬 필드 / 방향(asc/desc) 파라미터명 |
| `keyword` | `'keyword'` | 검색어 파라미터명 |
| `pageBase` | `1` | 서버 페이지 시작값(`0` 또는 `1`) |

#### `select` — 응답 어댑터

응답 형태가 서버마다 다르므로 `{ rows, total }`로 매핑한다. **미지정 시 기본 어댑터**가 흔한 형태를 순차 추론:

- 배열이면 → `{ rows: raw, total: raw.length }`
- 객체면 rows 후보: `content` → `rows` → `list` → `items` → `data`
- total 후보: `totalElements` → `totalCount` → `total` → `count`

> 추론이 맞지 않으면 반드시 `select`를 명시한다(DEV 모드에서 추론 시 콘솔 디버그 안내 출력).

## 행 선택 · 일괄 액션 · 행 액션

```tsx
<SmartTable
  data={members}
  columns={columns}
  rowKey="id"                                   // 행 고유키(기본 'id', 함수도 가능)
  selectable="multiple"                         // true | 'single' | 'multiple'
  onSelectionChange={(rows) => console.log(rows)}
  bulkActions={[
    { label: '선택 삭제', variant: 'destructive', onClick: (rows) => del(rows) },
    { label: '내보내기', onClick: (rows) => exp(rows) },
  ]}
  renderRowActions={(member) => <MemberRowActions member={member} />}
  onRowClick={(row, index) => openDetail(row)}
/>
```

- `selectable`: `'single'`=단일 선택, `'multiple'`/`true`=다중 선택.
- `bulkActions`: 선택된 행이 있을 때 툴바에 노출되는 일괄 액션.
- `renderRowActions`: 각 행 끝에 액션 메뉴(예: 드롭다운) 렌더.

## 내보내기 (export)

```tsx
<SmartTable exportable />                                   // 기본 xlsx
<SmartTable exportable={{ filename: '회원목록', sheetName: '회원' }} />
<SmartTable exportable={{ format: 'csv', filename: '회원' }} />
```

- 기본은 **xlsx**(서식·숫자서식 포함, ExcelJS를 **lazy import**). `format: 'csv'`로 CSV 선택.
- 병합 헤더/세로 병합/합계 행도 엑셀에 `mergeCells`로 **화면과 동일하게** 반영.
- 내보내기 범위 — 클라이언트: 필터된 전체 행 / 서버: 현재 페이지 행.
- 완전 커스텀(다중 시트·로고 등)은 `exporter` prop으로 기본 동작을 대체:

```tsx
<SmartTable exporter={(rows, columns) => myCustomExport(rows, columns)} />
```

## 스타일 (variant · density)

모든 색은 **시맨틱 토큰**을 사용하므로 `themes/theme-[project].css` 교체만으로 룩이 바뀐다.

```tsx
<SmartTable variant="card" density="normal" />
```

| prop | 값 | 기본 |
|---|---|---|
| `variant` | `'card' \| 'minimal' \| 'bordered'` | `card` |
| `density` | `'compact' \| 'normal' \| 'loose'` | `normal` |

세밀한 오버라이드는 슬롯별 className(`classNames`)으로: `{ root, toolbar, table, header, headerCell, row, cell, pagination }`.

## 명령형 핸들 (ref)

`ref`로 명령형 API에 접근한다(`ISmartTableHandle`, React 19 ref-as-prop).

```tsx
const ref = useRef<ISmartTableHandle<Post>>(null);

<SmartTable<Post> ref={ref} endpoint="..." columns={postColumns} />

ref.current?.refetch();          // 서버 재조회(클라이언트 모드는 no-op)
ref.current?.getSelectedRows();  // 현재 선택 행
ref.current?.clearSelection();   // 선택 해제
ref.current?.setKeyword('김');    // 검색어 설정
ref.current?.goToPage(0);        // 페이지 이동(0-base)
```

## Props 전체 레퍼런스 (`ISmartTableProps`)

| 분류 | prop | 타입 | 설명 |
|---|---|---|---|
| **데이터 소스** | `columns` | `SmartColumns<TRow>` | **(필수)** 컬럼 DSL |
| | `data` | `TRow[]` | 클라이언트 모드 데이터 |
| | `endpoint` | `string` | 서버 모드 엔드포인트 |
| | `select` | `(raw) => { rows, total }` | 서버 응답 어댑터 |
| | `paramMap` | `ISmartServerParamMap` | 서버 파라미터 네이밍 |
| | `params` | `Record<string, string\|number\|boolean>` | 고정 파라미터 |
| | `method` | `THttpMethod` | 서버 method(기본 GET) |
| **행 식별/선택** | `rowKey` | `keyof TRow \| (row) => string` | 행 고유키(기본 `'id'`) |
| | `selectable` | `boolean \| 'single' \| 'multiple'` | 행 선택 활성화 |
| | `onSelectionChange` | `(rows) => void` | 선택 변경 콜백 |
| **페이징/정렬/검색** | `pageSize` | `number` | 초기 페이지 크기(기본 10) |
| | `pageSizeOptions` | `number[]` | 페이지 크기 옵션(기본 `[10,20,30,50]`) |
| | `searchable` | `boolean` | 검색창 표시 |
| | `searchPlaceholder` | `string` | 검색창 placeholder |
| | `searchKeys` | `(keyof TRow)[]` | 클라이언트 검색 대상(미지정=전 컬럼) |
| | `sortMode` | `'menu' \| 'toggle'` | 정렬 헤더 동작(기본 `toggle`) |
| | `sortRemoval` | `boolean` | 정렬 해제 단계 허용(기본 `true`) |
| | `sortDisplay` | `'hover'\|'always'\|'none'\|'off'` | 정렬 아이콘 노출/기능(기본 `hover`) |
| | `sortIcons` | `{ asc?, desc?, unsorted? }` | 정렬 아이콘 교체 |
| | `toolbar` | `boolean` | 상단 툴바 표시(기본 `true`) |
| | `paginated` | `boolean` | 하단 페이징 표시(기본 `true`) |
| **스타일** | `variant` | `'card'\|'minimal'\|'bordered'` | 외형(기본 card) |
| | `density` | `'compact'\|'normal'\|'loose'` | 행 높이(기본 normal) |
| | `className` / `classNames` | `string` / `ISmartTableSlotClassNames` | 루트 / 슬롯별 className |
| **상태/이벤트/슬롯** | `loading` | `boolean` | 외부 제어 로딩(클라이언트 모드) |
| | `emptyText` / `renderEmpty` | `ReactNode` / `() => ReactNode` | 빈 상태 텍스트 / 커스텀 렌더 |
| | `onRowClick` | `(row, index) => void` | 행 클릭 콜백 |
| | `toolbarStart` / `toolbarEnd` | `ReactNode` | 검색창 왼쪽 / 컬럼토글 오른쪽 슬롯 |
| | `renderRowActions` | `(row) => ReactNode` | 행 끝 액션 메뉴 |
| | `bulkActions` | `ISmartBulkAction<TRow>[]` | 선택 행 일괄 액션 |
| | `summary` | `boolean \| { label? }` | 하단 합계 행 |
| | `exportable` | `boolean \| { filename?, format?, sheetName? }` | 내보내기 활성화 |
| | `exporter` | `(rows, columns) => void` | 커스텀 exporter |
| | `ref` | `Ref<ISmartTableHandle<TRow>>` | 명령형 핸들 |

## 전체 예제 (클라이언트 모드 — format · badge · 행 액션)

```tsx
import { useState } from 'react';
import { SmartTable, defineColumns } from '@axiom/components/ui';

type Member = {
  id: number; name: string; phone: string; balance: number;
  status: 'active' | 'dormant' | 'blocked'; joinedAt: string;
};

const memberColumns = defineColumns<Member>({
  name: '이름',
  phone: { label: '연락처', format: 'phone' },                   // → $util.string.formatMobile
  balance: { label: '잔액', format: 'money', align: 'right' },    // → $util.number.currency
  status: {
    label: '상태', align: 'center',
    badge: { map: {
      active:  { label: '활성', variant: 'default' },
      dormant: { label: '휴면', variant: 'secondary' },
      blocked: { label: '정지', variant: 'destructive' },
    } },
  },
  joinedAt: { label: '가입일', format: 'date:YYYY.MM.DD' },        // → $util.date.format
});

export default function MemberListPage() {
  return (
    <SmartTable
      data={members}
      columns={memberColumns}
      searchable
      exportable={{ filename: '회원목록', sheetName: '회원' }}
      selectable="multiple"
      searchPlaceholder="이름·연락처 검색..."
      bulkActions={[
        { label: '선택 삭제', variant: 'destructive', onClick: (rows) => $ui.alert(`${rows.length}건 삭제`) },
      ]}
    />
  );
}
```

## 자주 하는 실수 (gotchas)

- **`data`와 `endpoint`를 동시에 주지 않는다.** `endpoint`가 있으면 서버 모드로 동작하고 `data`는 무시된다.
- **`mergeCells`는 현재 페이지 기준**이다. 병합이 의미 있으려면 데이터가 그 컬럼으로 정렬/그룹되어 있어야 한다.
- **서버 모드의 합계/내보내기는 현재 페이지만** 대상이다. 전체 합계가 필요하면 서버가 내려주거나 `exporter`로 직접 처리한다.
- **`cell`을 지정하면 `format`/`badge`는 무시**된다. 둘을 함께 쓸 수 없다.
- 서버 응답 형태가 기본 어댑터 추론과 다르면 **`select`를 반드시 명시**한다.
- `rowKey`가 데이터에 유니크하지 않으면 행 선택/병합이 어긋날 수 있다(기본 `'id'`).
</content>
</invoke>
