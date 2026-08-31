---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "SmartTable"
hide_table_of_contents: false
---

# SmartTable 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **고수준 데이터 그리드**입니다.
컬럼을 **설정 맵(DSL)으로 선언**하기만 하면 포맷·정렬·페이징·검색·컬럼토글·행선택·행액션·합계·엑셀 내보내기가 전부 따라옵니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > SmartTable`(`/example/ui-components/smart-table`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 조회 화면의 **목록 그리드** 전반 — 회원/거래/주문 목록처럼 "표 + 검색 + 페이징"이 세트인 화면
- 서버 페이징·정렬·검색이 필요한 **대용량 목록** (`endpoint` 한 줄로 배선)
- **엑셀 다운로드**가 요구사항에 있는 화면 (다단계 헤더·병합·합계까지 화면과 동일하게 떨어집니다)
- 금액·전화번호·주민번호·날짜처럼 **표시 포맷이 정해진 값**이 많은 표

:::caution SmartTable 과 Table, 무엇을 쓸까

- **SmartTable** — 데이터가 배열/API로 들어오고 **표 기능(정렬·페이징·검색·내보내기)** 이 필요할 때. 대부분의 조회 화면.
- **`Table` (shadcn 원시 컴포넌트)** — 행/열이 고정된 **정적인 표**(약관 비교표, 요금제 표, 상세 정보 표)일 때. `<TableRow>`/`<TableCell>`을 직접 조립합니다.
- SmartTable로 못 하는 세밀한 제어(가상 스크롤, 셀 편집 등)가 필요하면 tanstack `ColumnDef`를 직접 다루는 저수준 `DataTable`(예제 도메인: `src/domains/example/components/ui-components/datatable/`)을 참고하세요. **`@axiom/components/ui`로 공개된 컴포넌트는 아닙니다.**
  :::

:::tip 퍼블리셔 참고
SmartTable은 **자체 `data-slot`을 새로 만들지 않습니다.** 내부적으로 scaffold의 `Table`·`Button`·`Input`·`Badge`·`Checkbox`를 조립하므로, 스타일은 ①`variant`/`density` prop ②`classNames` 슬롯 prop ③shadcn의 `data-slot="table-*"` 선택자 세 가지로 바꿉니다. **컴포넌트 본체(`smart-table/`)를 복사해서 고치지 마세요.** 방법은 [스타일링 & 테마](#스타일링--테마)에 있습니다.
:::

---

## Import

---

```tsx
import { SmartTable, defineColumns } from "@axiom/components/ui";

// 타입이 필요할 때
import type {
  SmartColumns,
  ISmartColumn,
  ISmartTableProps,
  ISmartTableHandle,
  SmartFormat,
} from "@axiom/components/ui";

// 배럴에 없는 나머지 타입은 하위 경로에서 (import type 이라 런타임 비용 없음)
import type {
  ISmartColumnGroup,
  ISmartBadgeMap,
  ISmartBulkAction,
  ISmartServerParamMap,
  ISmartTableSlotClassNames,
  SmartColumnDef,
  SmartSelect,
  SmartAlign,
  BadgeVariant,
} from "@axiom/components/ui/smart-table";
```

합성(compound) 컴포넌트가 아니라 **단일 컴포넌트**입니다. 툴바·헤더·본문·합계행·페이지네이션은 컴포넌트가 내부에서 알아서 그리므로, 사용하는 쪽에서 조립할 파트가 없습니다.

:::note 배럴에서 lazy 로드됩니다
`@axiom/components/ui` 배럴은 `SmartTable`을 `@loadable/component`로 **동적 import** 합니다. 즉 SmartTable을 쓰지 않는 화면에는 tanstack table 코드가 딸려오지 않고, 렌더 시점에 별도 청크로 로드됩니다. 엑셀(ExcelJS)은 한 단계 더 늦게 — **내보내기 버튼을 누를 때** 로드됩니다.

`defineColumns`와 타입은 가벼워서 static export입니다. 그래서 **컬럼 정의만 import 해도 무거운 코드가 딸려오지 않습니다.**
:::

---

## 기본 사용법

---

`data` 배열과 `columns` 맵, 두 개만 있으면 표가 완성됩니다. 정렬·페이징·컬럼토글은 기본으로 동작합니다.

<img
  src="../assets/ui/smart-table-basic.png"
  alt="SmartTable 기본 사용법"
  width="100%"
/>

```tsx
import { SmartTable, defineColumns } from "@axiom/components/ui";

type Member = {
  id: number;
  name: string;
  phone: string;
  balance: number;
  status: "active" | "dormant" | "blocked";
  joinedAt: string;
};

const members: Member[] = [
  {
    id: 1,
    name: "김철수",
    phone: "01012345678",
    balance: 1250000,
    status: "active",
    joinedAt: "2024-03-12",
  },
  // …
];

// 컬럼을 "설정 맵"으로 선언 — cell 렌더 함수를 매번 짤 필요가 없습니다.
const memberColumns = defineColumns<Member>({
  name: "이름", // ① '라벨' 단축형
  phone: { label: "연락처", format: "phone" }, // ② 상세 객체 + 포맷
  balance: { label: "잔액", format: "money", align: "right" },
  status: {
    label: "상태",
    align: "center",
    badge: {
      map: {
        active: { label: "활성", variant: "default" },
        dormant: { label: "휴면", variant: "secondary" },
        blocked: { label: "정지", variant: "destructive" },
      },
    },
  },
  joinedAt: { label: "가입일", format: "date:YYYY.MM.DD" },
});

export default function MemberList() {
  return <SmartTable data={members} columns={memberColumns} />;
}
```

:::tip `defineColumns`를 쓰는 이유
`defineColumns<Member>({ … })`로 감싸면 `accessor`·`cell`·`aggregate` 안의 `row` 파라미터 타입이 `Member`로 추론됩니다. 감싸지 않고 `const columns: SmartColumns<Member> = { … }`로 써도 동일합니다. 둘 다 **런타임 동작은 같고**, 타입 추론 편의 차이입니다.
:::

:::caution 객체 맵의 **key = 데이터의 필드명**
`columns`의 key(`name`, `phone` …)가 곧 `row[key]`를 읽는 접근자입니다. 데이터에 없는 key를 쓰면 빈 셀(`-`)이 나옵니다. 필드명과 다른 값을 보여주려면 [`accessor`](#5-accessor--다른-값-뽑기)를 쓰세요.
:::

---

## 구성 (Anatomy)

---

SmartTable이 그리는 화면은 위에서 아래로 네 덩어리입니다. **각 덩어리는 해당 prop을 켤 때만 나타납니다.**

```text
┌─────────────────────────────────────────────────────┐
│ ① 일괄 액션 바   "3개 선택됨"  [선택 삭제] [내보내기] │ ← bulkActions + 선택된 행이 있을 때만
├─────────────────────────────────────────────────────┤
│ ② 툴바   [toolbarStart] [🔍검색]   [내보내기][컬럼] │ ← toolbar (기본 true)
├─────────────────────────────────────────────────────┤
│ ③ 표                                                │
│    ├ 헤더  (다단계 그룹 헤더 가능 / 클릭 정렬)      │
│    ├ 본문  (포맷·배지·세로병합·행액션)              │
│    └ 합계 행                                        │ ← summary
├─────────────────────────────────────────────────────┤
│ ④ 페이지네이션  총 N개   페이지당 행 수 [10 ▾] ◀ ▶  │ ← paginated (기본 true)
└─────────────────────────────────────────────────────┘
```

| 영역           | 켜는 prop                      | 내용                                                     |
| -------------- | ------------------------------ | -------------------------------------------------------- |
| ① 일괄 액션 바 | `bulkActions` + `selectable`   | 선택 건수, 액션 버튼, "선택 해제". 선택 0건이면 숨김     |
| ② 툴바         | `toolbar`(기본 `true`)         | 검색창·내보내기·컬럼 토글·좌우 슬롯                      |
| ③ 표 헤더      | 항상                           | 라벨 + 정렬 아이콘. 그룹 컬럼이면 다단계로 렌더          |
| ③ 표 본문      | 항상                           | `format`/`badge`/`cell`로 렌더. `mergeCells`면 세로 병합 |
| ③ 합계 행      | `summary` + 컬럼의 `aggregate` | 왼쪽 라벨 + 집계값                                       |
| ④ 페이지네이션 | `paginated`(기본 `true`)       | 총 건수·페이지 크기 선택·이동 버튼                       |

:::note 툴바는 "쓸 게 하나라도 있으면" 나옵니다
툴바는 `toolbar={true}`이면서 아래 중 **하나라도 해당될 때** 렌더됩니다.
검색(`searchable`) · 내보내기(`exportable`) · 슬롯(`toolbarStart`/`toolbarEnd`) · **숨길 수 있는 컬럼이 하나라도 있음** · 일괄액션(`bulkActions` + `selectable`).

컬럼은 기본적으로 전부 `hideable`이라, 아무 옵션을 안 켜도 **"컬럼" 버튼 하나짜리 툴바**가 보입니다. 완전히 없애려면 `toolbar={false}`를 주거나 모든 컬럼에 `hideable: false`를 주세요.
:::

### 컬럼 DSL — 세 가지 형태

`columns`의 각 항목은 아래 세 형태 중 하나입니다.

```tsx
const columns = defineColumns<Member>({
  // ① 문자열 단축형 — 라벨만 지정 (정렬 O, 포맷 X)
  name: "이름",

  // ② 상세 객체(leaf) — 포맷·정렬·너비·배지·집계 등
  balance: { label: "잔액", format: "money", align: "right" },

  // ③ 그룹 — 자식을 colspan으로 묶는 다단계 헤더
  계정상태: {
    label: "계정 상태",
    columns: {
      status: { label: "상태", align: "center" },
      joinedAt: { label: "가입일", format: "date" },
    },
  },
});
```

| 형태                | 판별 기준             | 쓰임                              |
| ------------------- | --------------------- | --------------------------------- |
| `'라벨'`            | 값이 `string`         | 포맷이 필요 없는 단순 텍스트 컬럼 |
| `ISmartColumn`      | 객체 (`columns` 없음) | 대부분의 컬럼                     |
| `ISmartColumnGroup` | 객체에 `columns` 있음 | 다단계(병합) 헤더                 |

---

## 데이터 소스 — 클라이언트 vs 서버

---

SmartTable은 **`data`를 주면 클라이언트 모드, `endpoint`를 주면 서버 모드**로 동작합니다. 둘은 배타적입니다(`endpoint`가 있으면 서버 모드).

### 1. 클라이언트 모드 — `data`

배열을 그대로 넘깁니다. 정렬·검색·페이징이 **브라우저 메모리에서** 처리됩니다.

```tsx
<SmartTable data={members} columns={memberColumns} searchable exportable />
```

- 데이터가 이미 손 안에 있을 때(수백~수천 건) 가장 간단합니다.
- 로딩 표시가 필요하면 `loading` prop으로 직접 제어합니다(서버 모드는 자동).

### 2. 서버 모드 — `endpoint`

`endpoint`만 주면 페이징·정렬·검색이 **서버 쿼리 파라미터로 자동 전송**됩니다. 내부적으로 [`useApi`](../../apis/global-function/hooks/use-api)를 사용하므로 TanStack Query 캐시를 그대로 탑니다.

<img
  src="../assets/ui/smart-table-server.png"
  alt="서버 모드"
  width="100%"
/>

```tsx
type Post = { id: number; title: string; body: string };

<SmartTable<Post>
  endpoint="https://jsonplaceholder.typicode.com/posts"
  // 서버마다 파라미터 이름이 다르므로 매핑
  paramMap={{
    page: "_page",
    size: "_limit",
    sort: "_sort",
    order: "_order",
    keyword: "q",
  }}
  // 응답 형태가 제각각이므로 { rows, total } 로 어댑팅
  select={(raw) => ({ rows: raw as Post[], total: 100 })}
  columns={{
    id: { label: "ID", align: "right", width: 72 },
    title: "제목",
    body: {
      label: "내용",
      cell: ({ value }) => (
        <span className="line-clamp-1 text-muted-foreground">
          {String(value)}
        </span>
      ),
    },
  }}
  pageSize={5}
  searchable
/>;
```

#### 전송되는 파라미터 — `paramMap`

| paramMap 키 | 기본 파라미터명 | 보내는 값                                 |
| ----------- | --------------- | ----------------------------------------- |
| `page`      | `page`          | 현재 페이지. **내부 0-base + `pageBase`** |
| `size`      | `size`          | 페이지당 행 수                            |
| `sort`      | `sort`          | 정렬 컬럼 key (정렬 중일 때만)            |
| `order`     | `order`         | `asc` \| `desc` (정렬 중일 때만)          |
| `keyword`   | `keyword`       | 검색어 (비어 있지 않을 때만)              |
| `pageBase`  | `1`             | 서버 페이지 시작값. `0`이면 0-base로 전송 |

```text
예) pageSize=10, 2번째 페이지, 잔액 내림차순, 검색어 '김'
    → ?page=2&size=10&sort=balance&order=desc&keyword=김
```

`params`로 넘긴 고정 파라미터(필터 등)는 **항상 함께** 전송됩니다.

```tsx
<SmartTable
  endpoint="/api/members"
  params={{ branchCode: "1001", status: "active" }} // 항상 붙는 필터
  method="GET" // 기본 GET
  columns={memberColumns}
/>
```

#### 응답 매핑 — `select`

`select`를 지정하지 않으면 **기본 어댑터**가 흔한 응답 형태를 순서대로 추론합니다.

| 추론 항목 | 찾는 키 (앞에서부터)                                                    |
| --------- | ----------------------------------------------------------------------- |
| 행 배열   | 응답이 배열이면 그대로 → `content` → `rows` → `list` → `items` → `data` |
| 총 건수   | `totalElements` → `totalCount` → `total` → `count` → (없으면 행 개수)   |

```tsx
// 표준형이면 select 생략 가능 — { content: [...], totalElements: 128 }
<SmartTable endpoint="/api/members" columns={memberColumns} />

// 비표준 응답이면 어댑터로 매핑
<SmartTable
  endpoint="/api/members"
  select={(raw: MemberResponse) => ({
    rows: raw.result.memberList,
    total: raw.result.totalCnt,
  })}
  columns={memberColumns}
/>
```

:::note 검색어는 300ms 디바운스됩니다
서버 모드에서 검색창 입력은 **300ms 디바운스** 후 전송되며, 검색·정렬이 바뀌면 **페이지가 0으로 리셋**됩니다. 타이핑 한 글자마다 API가 날아가지 않습니다.
:::

### 모드별 동작 차이 (중요)

| 항목                 | 클라이언트 (`data`)          | 서버 (`endpoint`)                               |
| -------------------- | ---------------------------- | ----------------------------------------------- |
| 정렬                 | 메모리 정렬                  | `sort`/`order` 파라미터로 서버 위임             |
| 검색                 | 메모리 필터                  | `keyword` 파라미터로 서버 위임 (300ms 디바운스) |
| 페이징               | 메모리 슬라이스              | `page`/`size` 파라미터로 서버 위임              |
| 로딩 표시            | `loading` prop으로 직접 제어 | **자동** (스켈레톤 행)                          |
| 에러 표시            | 없음                         | **자동** ("데이터를 불러오지 못했습니다.")      |
| 합계(`summary`) 범위 | 검색 필터된 **전체 행**      | **현재 페이지 행만**                            |
| 내보내기 범위        | 검색 필터된 **전체 행**      | **현재 페이지 행만**                            |
| `ref.refetch()`      | 동작 안 함(no-op)            | 재조회                                          |
| `paginated={false}`  | 페이지 분할 없이 전체 렌더   | UI만 숨김 (데이터는 여전히 페이지 단위)         |

:::caution 서버 모드에서 "전체 내보내기"가 필요하다면
서버 모드의 기본 내보내기는 **현재 페이지만** 담습니다. 전체를 받아야 한다면 `exporter` prop으로 직접 전량 조회 후 내보내거나, 서버에 엑셀 생성 API를 두고 `toolbarEnd` 슬롯에 다운로드 버튼을 넣으세요.
:::

---

## 컬럼 DSL

---

컬럼 하나에 줄 수 있는 옵션 전체입니다. 전체 목록은 [API 레퍼런스 - `ISmartColumn`](#ismartcolumn--컬럼-leaf)에 정리되어 있습니다.

### 1. `format` — 값 자동 포맷

`format` 문자열은 전역 [`$util`](../../apis/service-objects/util/number-util) 함수로 자동 연결됩니다. **셀 렌더 함수를 짤 필요가 없습니다.**

```tsx
balance:  { label: '잔액',   format: 'money', align: 'right' },
phone:    { label: '연락처', format: 'phone' },
joinedAt: { label: '가입일', format: 'date:YYYY.MM.DD' },
```

| format            | 연결되는 `$util`                        | 입력 예시          | 출력 예시             |
| ----------------- | --------------------------------------- | ------------------ | --------------------- |
| `money`           | `number.currency(v, '원')`              | `1250000`          | `1,250,000원`         |
| `number`          | `number.comma(v)`                       | `1250000`          | `1,250,000`           |
| `percent`         | `number.percent(v)`                     | `0.125`            | `12.5%`               |
| `abbreviate`      | `number.abbreviate(v)`                  | `125000000`        | `1.2억`               |
| `date`            | `date.format(v)`                        | `2024-03-12`       | `2024-03-12`          |
| `date:YYYY.MM.DD` | `date.format(v, 'YYYY.MM.DD')`          | `2024-03-12`       | `2024.03.12`          |
| `datetime`        | `date.format(v, 'YYYY-MM-DD HH:mm:ss')` | ISO 문자열         | `2024-03-12 09:30:00` |
| `fromNow`         | `date.fromNow(v)`                       | `2024-03-12`       | `2년 전`              |
| `phone`           | `string.formatMobile(v)`                | `01012345678`      | `010-1234-5678`       |
| `rrn`             | `string.formatRRN(v)`                   | `9001011234567`    | `900101-1234567`      |
| `bizno`           | `string.formatBizNo(v)`                 | `1234567890`       | `123-45-67890`        |
| `cardno`          | `string.formatCardNo(v)`                | `1234567890123456` | `1234-5678-9012-3456` |
| `businessDate`    | `string.formatBusinessDate(v)`          | `20240312`         | `2024-03-12`          |
| `maskName`        | `string.maskName(v)`                    | `김철수`           | `김*수`               |
| `maskMobile`      | `string.maskMobile(v)`                  | `01012345678`      | `010-****-5678`       |
| `maskRRN`         | `string.maskRRN(v)`                     | `9001011234567`    | `900101-1******`      |
| `mask:1-2`        | `string.mask(v, 1, 2)`                  | `김철수`           | `김*수`               |

:::caution `percent`는 **비율(0~1)** 을 받습니다
`$util.number.percent`가 내부에서 100을 곱합니다. `12.5`를 넣으면 `1250.0%`가 되므로, 서버가 `12.5`로 내려주면 `accessor: (row) => row.rate / 100`으로 변환해서 넘기세요.
:::

:::note 값이 비면 `-`, 포맷이 실패하면 원본
값이 `null`/`undefined`/`''`면 셀에 `-`가 표시됩니다. 알 수 없는 `format`이거나 포맷 함수가 실패하면(잘못된 날짜 등) **원본 값을 그대로** 보여줍니다. 화면이 깨지지 않습니다.
:::

### 2. `badge` — 값 → 배지 매핑

상태 코드를 배지로 바꿉니다. `map`의 key는 `String(value)` 기준입니다.

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
    fallbackVariant: 'outline',   // map에 없는 값에 적용
  },
},
```

- `variant`는 Badge와 동일하게 `default` · `secondary` · `destructive` · `outline` · `ghost` · `link`.
- `map`에 없는 값은 **원본 값을 라벨로** 쓰고 `fallbackVariant`(기본 `secondary`)를 적용합니다.
- 각 항목에 `className`을 줘서 배지 하나만 따로 칠할 수도 있습니다.
- **내보내기(엑셀/CSV)에는 `label` 텍스트가** 들어갑니다(`활성`). 배지 모양이 아니라 글자가 나갑니다.

### 3. `cell` — 완전 커스텀 (escape hatch)

`format`/`badge`로 표현이 안 되면 직접 렌더합니다. **`cell`을 지정하면 `format`·`badge`는 무시됩니다.**

```tsx
body: {
  label: '내용',
  cell: ({ value, row, index }) => (
    <span className="line-clamp-1 text-muted-foreground">{String(value)}</span>
  ),
},
```

| 인자    | 타입      | 설명                          |
| ------- | --------- | ----------------------------- |
| `value` | `unknown` | 해당 셀의 값(`accessor` 반영) |
| `row`   | `TRow`    | 행 원본 객체                  |
| `index` | `number`  | 현재 페이지 내 행 인덱스      |

:::caution `cell`을 쓰면 내보내기는 **원본 값**으로 떨어집니다
커스텀 셀은 JSX라 텍스트로 바꿀 수 없어서, 엑셀/CSV에는 `String(원본값)`이 들어갑니다. 내보내기 텍스트까지 맞추려면 `cell` 대신 `format` 또는 `accessor`(값 자체를 가공)로 처리하세요.
:::

### 4. 정렬 · 숨김 · 너비 · 맞춤

```tsx
id:      { label: 'ID', align: 'right', width: 72 },      // px 숫자
name:    { label: '이름', width: '20%' },                  // 퍼센트 문자열
memo:    { label: '메모', sortable: false },               // 이 컬럼만 정렬 불가
secret:  { label: '내부코드', hideable: false },           // 컬럼 토글 목록에서 제외
debugId: { label: '디버그', hidden: true },                // 처음엔 숨김(토글로 켤 수 있음)
```

- `align: 'right'`는 셀에 `tabular-nums`(숫자 폭 고정)를 함께 적용합니다. **금액·수량 컬럼은 `right` 권장.**
- `width`는 헤더 `<th>`와 본문 `<td>`에 `style`로 들어갑니다.
- `hidden: true`는 "초기 숨김"이고, `hideable: false`는 "토글 자체를 막음"입니다. 둘을 같이 주면 사용자가 다시 켤 수 없습니다.

### 5. `accessor` — 다른 값 뽑기

key와 다른 값(계산값·중첩 필드)을 보여줄 때 씁니다.

```tsx
const columns = defineColumns<Order>({
  // 중첩 객체
  customerName: { label: "고객명", accessor: (row) => row.customer.name },
  // 계산값
  total: {
    label: "합계",
    format: "money",
    align: "right",
    accessor: (row) => row.price * row.qty,
  },
});
```

:::caution `accessor` 값은 **검색 대상이 아닙니다**
클라이언트 검색은 `row.원본객체[key]`를 그대로 훑습니다. 즉 `accessor`로 만든 계산값이나 중첩 필드(`customer.name`)는 **검색에 걸리지 않습니다.** 정렬과 내보내기는 `accessor`를 따릅니다.

검색까지 되게 하려면 데이터를 먼저 평탄화(flatten)해서 넘기세요 — `members.map((m) => ({ ...m, customerName: m.customer.name }))`.
:::

### 6. 그룹(다단계) 헤더

그룹은 `{ label, columns }` 형태로 선언합니다. 그룹은 `colspan`, 그룹 밖의 단독 컬럼은 아래로 `rowspan` 병합됩니다. **중첩도 가능합니다.**

<img
  src="../assets/ui/smart-table-grouped.png"
  alt="다단계 헤더"
  width="100%"
/>

```tsx
const memberGroupedColumns = defineColumns<Member>({
  고객정보: {
    label: "고객정보",
    columns: {
      name: "이름",
      phone: { label: "연락처", format: "phone" },
    },
  },
  계정상태: {
    label: "계정 상태",
    columns: {
      status: {
        label: "상태",
        align: "center",
        badge: {
          map: {
            /* … */
          },
        },
      },
      joinedAt: { label: "가입일", format: "date:YYYY.MM.DD" },
    },
  },
  // 그룹 밖 단독 컬럼은 헤더 전체 높이로 세로 병합됩니다.
  balance: { label: "잔액", format: "money", align: "right" },
});

<SmartTable data={members} columns={memberGroupedColumns} exportable />;
```

- 그룹의 key(`고객정보`)는 **화면에 안 보이는 식별자**입니다. 표시되는 건 `label`입니다.
- 컬럼 토글로 자식을 숨기면 **그룹 폭(colspan)이 자동으로 줄고**, 자식이 전부 숨겨지면 그룹 헤더도 사라집니다.
- `align`(기본 `center`)·`headerClassName`을 그룹에도 줄 수 있습니다.
- **엑셀 내보내기도 화면과 동일한 병합 헤더**로 떨어집니다(같은 레이아웃 계산을 공유).

### 7. `mergeCells` — 본문 세로 병합

연속된 동일 값을 세로로 묶습니다(`rowspan`). 정렬·그룹된 데이터에서 쓰세요.

```tsx
const ledgerColumns = defineColumns<Ledger>({
  branch: { label: "지점", mergeCells: true, align: "center" },
  team: { label: "팀", mergeCells: true, align: "center" }, // 왼쪽(지점) 경계 상속
  name: "담당자",
  amount: { label: "실적", format: "money", align: "right", aggregate: "sum" },
});
```

- 병합 범위는 **현재 페이지 안에서만** 계산됩니다(페이지가 넘어가면 다시 시작).
- 왼쪽 병합 컬럼의 **경계를 상속**합니다. 위 예에서 지점이 바뀌면 팀 병합도 거기서 끊깁니다(서울 영업1팀과 부산 영업1팀이 붙어버리지 않음).
- 화면과 엑셀이 동일하게 병합됩니다.

:::caution 정렬되지 않은 데이터에 `mergeCells`를 쓰면 어색해집니다
"연속 동일 값"만 묶기 때문에, 같은 값이 흩어져 있으면 여기저기 조각조각 병합됩니다. **병합할 컬럼 기준으로 미리 정렬된 데이터**를 넘기세요.
:::

### 8. `aggregate` + `summary` — 합계 행

컬럼에 `aggregate`를 주고 표에 `summary`를 켜면 하단 합계 행이 생깁니다.

<img
  src="../assets/ui/smart-table-summary.png"
  alt="세로 병합 + 합계 행"
  width="100%"
/>

```tsx
<SmartTable data={ledger} columns={ledgerColumns} summary exportable />

// 라벨을 바꾸려면
<SmartTable data={ledger} columns={ledgerColumns} summary={{ label: '소계' }} />
```

| `aggregate` 값                | 계산                               | 엑셀 반영    |
| ----------------------------- | ---------------------------------- | ------------ |
| `'sum'`                       | 숫자 합계 (컬럼 `format`으로 표시) | O (숫자)     |
| `'avg'`                       | 숫자 평균                          | O (숫자)     |
| `'count'`                     | 행 수                              | O (숫자)     |
| `(values, rows) => ReactNode` | 직접 계산 (JSX 반환 가능)          | **X (생략)** |

- 합계 행 왼쪽 라벨("합계")은 **첫 집계 컬럼 앞까지 `colspan`으로 병합**됩니다.
- 집계 범위: 클라이언트 = 검색 필터된 전체 행 / 서버 = **현재 페이지 행만**.
- 함수 집계는 화면 전용입니다. 엑셀에도 값이 필요하면 `'sum'`·`'avg'`·`'count'`를 쓰세요.

### 9. `columnDef` — 최종 탈출구

tanstack의 `ColumnDef` 일부를 그대로 머지합니다. **DSL로 도저히 안 되는 것만** 여기로 빠지세요.

```tsx
score: {
  label: '점수',
  columnDef: {
    sortingFn: 'basic',
    sortDescFirst: true,
  },
},
```

:::caution `columnDef`는 마지막에 머지됩니다
`id`·`cell`·`accessorFn`까지 덮어쓸 수 있어서, 잘못 쓰면 `format`/`badge`가 통째로 무력화됩니다. 정렬 함수·필터 함수 같은 **동작 옵션**에만 쓰는 걸 권장합니다.
:::

---

## 동작 옵션

---

### 1. 검색 — `searchable` · `searchKeys`

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  searchable
  searchPlaceholder="이름·연락처 검색..."
  searchKeys={["name", "phone"]} // 미지정 시 행의 모든 필드
/>
```

- `searchable`(기본 `false`)을 켜야 툴바에 검색창이 생깁니다.
- 클라이언트 모드는 **대소문자 무시 부분일치**로 필터합니다.
- 서버 모드는 검색어를 `keyword` 파라미터로 보냅니다(300ms 디바운스).

:::caution 검색은 **원본 값** 기준입니다 (포맷 후 텍스트가 아님)
`format: 'phone'`으로 `010-1234-5678`이 보여도 원본은 `01012345678`이므로, **하이픈을 넣어 검색하면 안 잡힙니다.** 배지도 마찬가지로 `활성`이 아니라 원본 `active`로 검색해야 합니다.

포맷된 텍스트로 검색해야 한다면, 데이터에 검색용 필드를 하나 더 만들어 두고 `searchKeys`에 포함시키세요.
:::

### 2. 정렬 — `sortMode` · `sortDisplay` · `sortRemoval` · `sortIcons`

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  sortMode="menu" // 헤더 클릭 시 드롭다운
  sortDisplay="always" // 미정렬 힌트 아이콘도 항상 표시
  sortRemoval={false} // 오름↔내림 2단계만 순환
  sortIcons={{ asc: ChevronUp, desc: ChevronDown, unsorted: ChevronsUpDown }}
/>
```

| Prop          | 값                | 동작                                                  |
| ------------- | ----------------- | ----------------------------------------------------- |
| `sortMode`    | `'toggle'` (기본) | 헤더 클릭 = 정렬 토글. 드롭다운 없음                  |
|               | `'menu'`          | 헤더 클릭 = 드롭다운(오름차순·내림차순·컬럼 숨기기)   |
| `sortRemoval` | `true` (기본)     | 오름 → 내림 → **해제(원래 순서)** 3단계 순환          |
|               | `false`           | 오름 ↔ 내림 2단계만 순환                              |
| `sortDisplay` | `'hover'` (기본)  | 미정렬 힌트 아이콘은 헤더에 마우스를 올렸을 때만 노출 |
|               | `'always'`        | 미정렬 힌트 아이콘도 항상 표시                        |
|               | `'none'`          | 아이콘을 전부 숨김 (**헤더 클릭 정렬은 동작**)        |
|               | `'off'`           | **정렬 기능 자체 비활성.** 헤더는 라벨만 렌더         |

- 컬럼 하나만 막으려면 표 전체가 아니라 컬럼에 `sortable: false`를 주세요.
- 정렬 아이콘은 `className`을 받는 컴포넌트면 무엇이든 됩니다(lucide 아이콘 등).

### 3. 행 선택 — `selectable` · `rowKey` · `onSelectionChange`

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  selectable="multiple" // true | 'multiple' | 'single'
  rowKey="memberNo" // 기본 'id'
  onSelectionChange={(rows) => setSelected(rows)}
  bulkActions={[
    {
      label: "선택 삭제",
      variant: "destructive",
      onClick: (rows) => $ui.alert(`${rows.length}건 삭제`),
    },
    { label: "내보내기", onClick: (rows) => exportRows(rows) },
  ]}
/>
```

- `selectable={true}`와 `'multiple'`은 동일(다중 선택). `'single'`이면 라디오처럼 한 건만 선택됩니다.
- 헤더 체크박스는 **현재 페이지 전체**를 선택/해제합니다(전체 페이지가 아닙니다).
- `bulkActions`의 액션 바는 **선택된 행이 1건 이상일 때만** 나타납니다. `variant: 'destructive'`면 빨간 버튼, 그 외에는 outline 버튼입니다.

:::caution `rowKey`가 없으면 선택이 어긋납니다
행 식별자는 기본적으로 `row.id`입니다. `id` 필드가 없으면 **배열 인덱스**로 대체되므로, 정렬·페이지 이동 후에 **엉뚱한 행이 선택된 것처럼** 보입니다. `id`가 없는 데이터는 반드시 `rowKey`를 지정하세요.

```tsx
rowKey="memberNo"                          // 필드명
rowKey={(row) => `${row.branch}-${row.no}`} // 복합키
```

:::

### 4. 페이징 — `pageSize` · `pageSizeOptions` · `paginated`

```tsx
<SmartTable data={members} columns={memberColumns} pageSize={20} pageSizeOptions={[20, 50, 100]} />

// 페이징 없이 전체 렌더 (클라이언트 모드)
<SmartTable data={members} columns={memberColumns} paginated={false} />
```

- `pageSize` 기본 `10`, `pageSizeOptions` 기본 `[10, 20, 30, 50]`.
- 클라이언트 모드에서 `paginated={false}`면 **페이지 분할 없이 전체 행**을 렌더합니다(행이 많으면 느려질 수 있음).
- 서버 모드에서 `paginated={false}`는 **UI만 숨깁니다.** 데이터는 여전히 페이지 단위로 조회되므로 첫 페이지만 보이게 됩니다.

### 5. 툴바 — `toolbar` · `toolbarStart` · `toolbarEnd`

툴바 좌우에 내 UI를 끼워 넣습니다. 필터 셀렉트·기간 선택·"신규 등록" 버튼 자리로 씁니다.

```text
[toolbarStart] [🔍 검색]  ······  [toolbarEnd] [내보내기] [컬럼]
```

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  searchable
  toolbarStart={
    <NativeSelect value={status} onChange={onChangeStatus}>
      <option value="">전체 상태</option>
      <option value="active">활성</option>
    </NativeSelect>
  }
  toolbarEnd={<Button size="sm">신규 등록</Button>}
/>
```

- `toolbarStart`는 **검색창 왼쪽**, `toolbarEnd`는 오른쪽 그룹에서 **"내보내기"·"컬럼" 버튼 앞**에 놓입니다.
- 툴바 자체를 없애려면 `toolbar={false}`. (검색·내보내기·컬럼 토글이 모두 숨겨집니다.)

:::note 타입 주석과 실제 위치
`types.ts`의 `toolbarEnd` 주석은 "컬럼토글 오른쪽 슬롯"이라고 되어 있지만, 실제 렌더 순서는 **`toolbarEnd` → 내보내기 → 컬럼**입니다. 버튼 오른쪽 끝에 붙여야 한다면 `classNames.toolbar`로 순서를 조정하거나 `order-*` 유틸리티를 쓰세요.
:::

### 6. 행 액션 — `renderRowActions` · `onRowClick`

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  onRowClick={(row, index) => navigate(`/members/${row.id}`)}
  renderRowActions={(member) => <MemberRowActions member={member} />}
/>
```

- `renderRowActions`를 주면 **맨 오른쪽에 액션 컬럼**이 자동으로 추가됩니다(폭 56px, 우측 정렬, 정렬·숨김 불가).
- 액션 영역과 선택 체크박스는 **클릭 전파를 자동으로 막습니다.** `onRowClick`과 같이 써도 행 이동이 잘못 일어나지 않습니다.
- `onRowClick`을 주면 행에 `cursor-pointer`가 붙습니다.

:::caution `onRowClick`은 키보드로 접근할 수 없습니다
`<tr>`에 걸린 클릭 핸들러라 Tab/Enter로는 실행되지 않습니다. 상세 이동이 **주요 동선**이라면, 행 클릭만 두지 말고 첫 컬럼을 링크로 만들거나(`cell`에 `<Link>`) 행 액션 메뉴에 "상세 보기"를 함께 두세요.
:::

### 7. 내보내기 — `exportable` · `exporter`

```tsx
// 기본 xlsx (서식 있는 진짜 엑셀)
<SmartTable data={members} columns={memberColumns} exportable />

// 파일명·시트명 지정
<SmartTable
  data={members}
  columns={memberColumns}
  exportable={{ filename: '회원목록', sheetName: '회원' }}
/>

// CSV로 (UTF-8 BOM 포함 — 엑셀에서 한글 안 깨짐)
<SmartTable data={members} columns={memberColumns} exportable={{ format: 'csv', filename: '회원목록' }} />
```

<img
  src="../assets/ui/smart-table-xlsx.png"
  alt="엑셀 내보내기 결과"
  width="80%"
/>

| 항목        | `xlsx` (기본)                                               | `csv`              |
| ----------- | ----------------------------------------------------------- | ------------------ |
| 라이브러리  | ExcelJS (**버튼 클릭 시 lazy load**)                        | 없음 (문자열 생성) |
| 다단계 헤더 | 병합해서 그대로 재현                                        | leaf 컬럼만 1줄    |
| 세로 병합   | `mergeCells` 반영                                           | 미반영             |
| 숫자 서식   | 금액·숫자·퍼센트를 **진짜 숫자 + 표시서식**(`#,##0`/`0.0%`) | 텍스트             |
| 합계 행     | `summary` 반영 (`sum`/`avg`/`count`)                        | 미반영             |
| 기타        | 헤더 굵게·배경·테두리, 헤더 틀 고정, 컬럼 폭 자동           | UTF-8 BOM          |

**공통 규칙**

- **표시 중인(숨기지 않은) 컬럼만** 내보냅니다. 선택 컬럼·액션 컬럼은 제외.
- 배지 컬럼은 **`label` 텍스트**로, `format` 컬럼은 **포맷된 텍스트**로 들어갑니다.
- 범위는 클라이언트 = 필터된 전체 / 서버 = 현재 페이지.
- 실패하면 `$ui.alert`으로 "내보내기에 실패했습니다."가 뜹니다.

완전히 다른 형태(다중 시트, 로고, 회사 양식)가 필요하면 `exporter`로 통째로 대체합니다.

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  exportable // 버튼을 띄우기 위해 필요
  exporter={(rows, columns) => {
    // rows = 현재 화면에 보이는 행, columns = 넘긴 컬럼 DSL
    myCustomExcelBuilder(rows, columns);
  }}
/>
```

:::note `exportCsv` / `exportXlsx`는 단독으로도 쓸 수 있습니다
표 없이 임의의 배열을 내보낼 수 있습니다. 단 **배럴(`@axiom/components/ui`)에는 없고** 하위 경로에서 가져옵니다.

```tsx
// 권장 — 필요한 함수만 (SmartTable 코드가 딸려오지 않음)
import { exportXlsx } from "@axiom/components/ui/smart-table/export/exportXlsx";
import { exportCsv } from "@axiom/components/ui/smart-table/export/exportCsv";

await exportXlsx({
  rows,
  columns,
  visibleKeys,
  filename: "실적",
  sheetName: "실적",
  summary: true,
});
```

`@axiom/components/ui/smart-table`(모듈 배럴)에서도 가져올 수 있지만, 이 경로는 `SmartTable` 본체까지 static import 하므로 번들 분리가 깨집니다.
:::

### 8. 로딩 · 빈 상태 — `loading` · `emptyText` · `renderEmpty`

```tsx
// 클라이언트 모드: 외부 로딩을 직접 넘김 (서버 모드는 자동)
<SmartTable data={members} columns={memberColumns} loading={isPending} />

// 빈 상태 문구만 교체
<SmartTable data={[]} columns={memberColumns} emptyText="조회 조건에 맞는 회원이 없습니다." />

// 빈 상태를 통째로 커스텀
<SmartTable
  data={[]}
  columns={memberColumns}
  renderEmpty={() => (
    <div className="flex flex-col items-center gap-2 py-10">
      <p className="text-sm text-muted-foreground">아직 등록된 회원이 없습니다.</p>
      <Button size="sm">회원 등록</Button>
    </div>
  )}
/>
```

- 로딩 중에는 **스켈레톤 행**이 `min(pageSize, 8)`개 렌더됩니다.
- 서버 모드에서 조회가 실패하면 빈 상태 자리에 **에러 표시**(경고 아이콘 + "데이터를 불러오지 못했습니다.")가 나옵니다. 이때 `emptyText`는 무시됩니다.
- 서버 모드 재조회 중(`isFetching`)에는 표 전체가 살짝 흐려집니다(`opacity-70`).

### 9. 명령형 핸들 — `ref`

바깥 버튼에서 표를 조작해야 할 때 씁니다. React 19의 ref-as-prop이라 `forwardRef` 없이 그대로 넘깁니다.

```tsx
const tableRef = useRef<ISmartTableHandle<Post>>(null);

<Button onClick={() => tableRef.current?.refetch()}>새로고침</Button>
<Button onClick={() => tableRef.current?.clearSelection()}>선택 해제</Button>

<SmartTable<Post> ref={tableRef} endpoint="/api/posts" columns={postColumns} />
```

| 메서드                | 동작                                           |
| --------------------- | ---------------------------------------------- |
| `refetch()`           | 서버 모드 재조회 (**클라이언트 모드는 no-op**) |
| `getSelectedRows()`   | 현재 선택된 행 배열                            |
| `clearSelection()`    | 선택 전체 해제                                 |
| `setKeyword(keyword)` | 검색어 설정(서버 모드면 서버로도 전달)         |
| `goToPage(pageIndex)` | 페이지 이동 (**0-base**)                       |

---

## API 레퍼런스

---

### `SmartTable` Props

#### 데이터 소스

| Prop       | 타입                                          | 기본값      | 설명                                     |
| ---------- | --------------------------------------------- | ----------- | ---------------------------------------- |
| `columns`  | `SmartColumns<TRow>`                          | — _(필수)_  | 컬럼 DSL 맵                              |
| `data`     | `TRow[]`                                      | —           | 클라이언트 모드 데이터                   |
| `endpoint` | `string`                                      | —           | 서버 모드 엔드포인트. **주면 서버 모드** |
| `select`   | `(raw) => { rows, total }`                    | 기본 어댑터 | 서버 응답 → 표준형 매핑                  |
| `paramMap` | `ISmartServerParamMap`                        | 아래 표     | 서버 파라미터 네이밍                     |
| `params`   | `Record<string, string \| number \| boolean>` | —           | 항상 함께 보낼 고정 파라미터             |
| `method`   | `THttpMethod`                                 | `'GET'`     | 서버 조회 HTTP 메서드                    |

#### 행 식별 / 선택

| Prop                | 타입                                | 기본값 | 설명                            |
| ------------------- | ----------------------------------- | ------ | ------------------------------- |
| `rowKey`            | `keyof TRow \| ((row) => string)`   | `'id'` | 행 고유키. 없으면 인덱스로 대체 |
| `selectable`        | `boolean \| 'single' \| 'multiple'` | —      | 행 선택 활성화 (`true` = 다중)  |
| `onSelectionChange` | `(rows: TRow[]) => void`            | —      | 선택 변경 콜백                  |

#### 페이징 / 정렬 / 검색

| Prop                | 타입                                     | 기본값             | 설명                                     |
| ------------------- | ---------------------------------------- | ------------------ | ---------------------------------------- |
| `pageSize`          | `number`                                 | `10`               | 초기 페이지 크기                         |
| `pageSizeOptions`   | `number[]`                               | `[10, 20, 30, 50]` | 페이지 크기 선택지                       |
| `paginated`         | `boolean`                                | `true`             | 하단 페이징 UI 표시                      |
| `searchable`        | `boolean`                                | `false`            | 툴바 검색창 표시                         |
| `searchPlaceholder` | `string`                                 | `'검색...'`        | 검색창 placeholder                       |
| `searchKeys`        | `(keyof TRow)[]`                         | 전 컬럼            | 클라이언트 검색 대상 필드                |
| `sortMode`          | `'toggle' \| 'menu'`                     | `'toggle'`         | 헤더 정렬 동작 방식                      |
| `sortRemoval`       | `boolean`                                | `true`             | 정렬 해제 단계 허용                      |
| `sortDisplay`       | `'hover' \| 'always' \| 'none' \| 'off'` | `'hover'`          | 정렬 아이콘 표시 / `'off'`는 정렬 비활성 |
| `sortIcons`         | `{ asc?, desc?, unsorted? }`             | lucide 기본        | 정렬 아이콘 교체                         |

#### 스타일

| Prop         | 타입                                | 기본값     | 설명                        |
| ------------ | ----------------------------------- | ---------- | --------------------------- |
| `variant`    | `'card' \| 'minimal' \| 'bordered'` | `'card'`   | 표 외곽 스타일              |
| `density`    | `'compact' \| 'normal' \| 'loose'`  | `'normal'` | 행 높이 밀도                |
| `className`  | `string`                            | —          | 루트 className              |
| `classNames` | `ISmartTableSlotClassNames`         | —          | 슬롯별 className 오버라이드 |

#### 상태 / 이벤트 / 슬롯

| Prop               | 타입                                            | 기본값               | 설명                                           |
| ------------------ | ----------------------------------------------- | -------------------- | ---------------------------------------------- |
| `loading`          | `boolean`                                       | `false`              | 외부 제어 로딩(클라이언트 모드)                |
| `emptyText`        | `React.ReactNode`                               | `'결과가 없습니다.'` | 빈 상태 문구                                   |
| `renderEmpty`      | `() => React.ReactNode`                         | —                    | 빈 상태 커스텀 렌더                            |
| `onRowClick`       | `(row, index) => void`                          | —                    | 행 클릭 콜백                                   |
| `toolbar`          | `boolean`                                       | `true`               | 툴바 전체 표시                                 |
| `toolbarStart`     | `React.ReactNode`                               | —                    | 검색창 **왼쪽** 슬롯                           |
| `toolbarEnd`       | `React.ReactNode`                               | —                    | 오른쪽 그룹에서 **내보내기·컬럼 버튼 앞** 슬롯 |
| `renderRowActions` | `(row) => React.ReactNode`                      | —                    | 행 끝 액션 컬럼                                |
| `bulkActions`      | `ISmartBulkAction<TRow>[]`                      | —                    | 선택 행 일괄 액션                              |
| `summary`          | `boolean \| { label?: string }`                 | —                    | 하단 합계 행                                   |
| `exportable`       | `boolean \| { filename?, format?, sheetName? }` | —                    | 내보내기 버튼                                  |
| `exporter`         | `(rows, columns) => void`                       | —                    | 커스텀 exporter (기본 동작 대체)               |
| `ref`              | `React.Ref<ISmartTableHandle<TRow>>`            | —                    | 명령형 핸들                                    |

### `ISmartColumn` — 컬럼(leaf)

| 옵션              | 타입                              | 기본값     | 설명                                         |
| ----------------- | --------------------------------- | ---------- | -------------------------------------------- |
| `label`           | `string`                          | — _(필수)_ | 헤더 라벨                                    |
| `format`          | `SmartFormat`                     | —          | 값 자동 포맷 ([표](#1-format--값-자동-포맷)) |
| `align`           | `'left' \| 'center' \| 'right'`   | `'left'`   | 셀·헤더 맞춤 (`right`는 `tabular-nums`)      |
| `width`           | `number \| string`                | —          | px 숫자 또는 `'20%'`                         |
| `sortable`        | `boolean`                         | `true`     | 이 컬럼 정렬 가능 여부                       |
| `hideable`        | `boolean`                         | `true`     | 컬럼 토글 목록 노출 여부                     |
| `hidden`          | `boolean`                         | `false`    | 초기 숨김                                    |
| `badge`           | `ISmartBadgeMap`                  | —          | 값 → 배지 렌더                               |
| `mergeCells`      | `boolean`                         | `false`    | 연속 동일값 세로 병합                        |
| `aggregate`       | `'sum' \| 'avg' \| 'count' \| fn` | —          | 합계 행 집계 방식                            |
| `accessor`        | `(row) => unknown`                | —          | key와 다른 값 추출                           |
| `className`       | `string`                          | —          | 본문 셀 className                            |
| `headerClassName` | `string`                          | —          | 헤더 셀 className                            |
| `cell`            | `(ctx) => React.ReactNode`        | —          | 완전 커스텀 셀 (**`format`/`badge` 무시**)   |
| `columnDef`       | `Partial<ColumnDef<TRow>>`        | —          | tanstack ColumnDef 머지 (최종 탈출구)        |

### `ISmartColumnGroup` — 그룹 헤더

| 옵션              | 타입                 | 기본값     | 설명                          |
| ----------------- | -------------------- | ---------- | ----------------------------- |
| `label`           | `string`             | — _(필수)_ | 그룹 헤더 라벨                |
| `columns`         | `SmartColumns<TRow>` | — _(필수)_ | 자식 컬럼 맵 (leaf 또는 그룹) |
| `align`           | `SmartAlign`         | `'center'` | 그룹 라벨 맞춤                |
| `headerClassName` | `string`             | —          | 그룹 헤더 className           |

### `ISmartBadgeMap`

| 옵션              | 타입                                               | 기본값        | 설명                      |
| ----------------- | -------------------------------------------------- | ------------- | ------------------------- |
| `map`             | `Record<string, { label?, variant?, className? }>` | —             | 값별 라벨·스타일          |
| `fallbackVariant` | `BadgeVariant`                                     | `'secondary'` | `map`에 없는 값의 variant |

### `ISmartServerParamMap`

| 옵션       | 타입     | 기본값      | 설명                   |
| ---------- | -------- | ----------- | ---------------------- |
| `page`     | `string` | `'page'`    | 페이지 파라미터명      |
| `size`     | `string` | `'size'`    | 페이지 크기 파라미터명 |
| `sort`     | `string` | `'sort'`    | 정렬 컬럼 파라미터명   |
| `order`    | `string` | `'order'`   | 정렬 방향 파라미터명   |
| `keyword`  | `string` | `'keyword'` | 검색어 파라미터명      |
| `pageBase` | `0 \| 1` | `1`         | 서버 페이지 시작값     |

### `ISmartBulkAction`

| 옵션      | 타입                     | 설명                                       |
| --------- | ------------------------ | ------------------------------------------ |
| `label`   | `string`                 | 버튼 라벨                                  |
| `onClick` | `(rows: TRow[]) => void` | 선택된 행 배열을 받는 핸들러               |
| `variant` | `BadgeVariant`           | `'destructive'`면 빨간 버튼, 그 외 outline |

### `ISmartTableSlotClassNames`

| 슬롯         | 적용 대상                    |
| ------------ | ---------------------------- |
| `root`       | 루트 `div`                   |
| `toolbar`    | 툴바 래퍼                    |
| `table`      | `<table>`                    |
| `header`     | `<thead>`                    |
| `headerCell` | 모든 `<th>` (그룹 헤더 포함) |
| `row`        | 본문 `<tr>`                  |
| `cell`       | 본문 `<td>`                  |
| `pagination` | 페이지네이션 래퍼            |

:::note 합계·스켈레톤·빈 상태 행에는 `row`/`cell`이 적용되지 않습니다
`classNames.row`·`classNames.cell`은 **데이터 행에만** 붙습니다. 합계 행·로딩 스켈레톤·빈 상태 행은 고정 스타일입니다. 이들까지 겨냥하려면 `classNames.table`(또는 `className`)을 기준으로 `data-slot` 자손 선택자를 쓰세요.
:::

### `ISmartTableHandle`

[9. 명령형 핸들](#9-명령형-핸들--ref) 참고.

### `defineColumns`

```tsx
function defineColumns<TRow>(columns: SmartColumns<TRow>): SmartColumns<TRow>;
```

런타임에는 인자를 그대로 반환하는 항등 함수입니다. **오직 타입 추론을 위한 헬퍼**입니다.

---

## 접근성 / 키보드

---

SmartTable은 시맨틱 `<table>` 구조(`thead`/`tbody`/`th`/`td`)로 렌더되므로 스크린리더가 표로 인식합니다. 조작 요소는 전부 실제 버튼/입력이라 Tab으로 순회할 수 있습니다.

| 요소                | 조작                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| 헤더(정렬)          | `Tab`으로 이동 → `Enter`/`Space`로 정렬 토글 (또는 메뉴 열기)         |
| 검색창              | 일반 텍스트 입력                                                      |
| 컬럼 토글 / 행 액션 | `Enter`/`Space`로 메뉴 열기 → `↑`/`↓` 이동 → `Enter` 선택, `Esc` 닫기 |
| 선택 체크박스       | `Space`로 토글                                                        |
| 페이지 이동 버튼    | `Enter`/`Space`                                                       |

**자동으로 붙는 것**

- 전체 선택 체크박스: `aria-label="전체 선택"`, 일부만 선택되면 `indeterminate`
- 행 선택 체크박스: `aria-label="행 선택"`
- 페이지 이동 버튼: `title` + `sr-only` 텍스트(첫/이전/다음/마지막 페이지)
- 행 액션 트리거: 예제처럼 `<span className="sr-only">메뉴 열기</span>`를 넣어주면 스크린리더에서 읽힙니다
- 선택된 행: `<tr data-state="selected">`

:::caution 아이콘만 있는 버튼에는 이름을 붙이세요
`renderRowActions`로 넣는 아이콘 버튼은 **여러분이 만드는 마크업**이라 SmartTable이 이름을 붙여주지 못합니다. `aria-label` 또는 `sr-only` 텍스트를 반드시 넣으세요.

```tsx
<Button variant="ghost" size="icon">
  <span className="sr-only">메뉴 열기</span>
  <MoreHorizontal className="size-4" />
</Button>
```

:::

:::note 정렬 상태는 아이콘으로만 표시됩니다
현재 정렬 방향은 헤더 아이콘(↑/↓)으로 나타납니다. 엄격한 접근성 요구사항이 있는 프로젝트라면 `columnDef`나 `classNames.headerCell`로 `aria-sort`를 보강하는 것을 검토하세요.
:::

---

## 스타일링 & 테마

---

SmartTable은 **모든 색을 시맨틱 토큰**(`bg-muted`, `border-border`, `text-foreground` …)으로 칠합니다. 하드코딩된 색이 없어서 `themes/theme-[project].css`의 CSS 변수 교체만으로 프로젝트 룩이 통째로 바뀝니다.

| 바꾸려는 것                           | 방법                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| 표 외곽(카드/테두리/민무늬), 행 높이  | `variant` · `density` **prop**                             |
| 특정 영역(툴바·헤더·행·셀…) 여백/폰트 | `classNames` **슬롯 prop**                                 |
| 특정 컬럼만 색·정렬·폭                | 컬럼의 `className` · `headerClassName` · `width` · `align` |
| 전체 색상 톤                          | **디자인 토큰** (`--muted`, `--border`, `--accent` …)      |
| 겉모습 전면 교체                      | **`data-slot="table-*"` 선택자 + CSS Module**              |

### 1. `variant` · `density`

<img
  src="../assets/ui/smart-table-variant.png"
  alt="variant / density"
  width="80%"
/>

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  variant="bordered"
  density="compact"
/>
```

| `variant`       | 표 영역 스타일                            |
| --------------- | ----------------------------------------- |
| `'card'` (기본) | 둥근 모서리 + 테두리 + `bg-card` + 그림자 |
| `'bordered'`    | 둥근 모서리 + 테두리만 (그림자·배경 없음) |
| `'minimal'`     | 감싸는 박스 없음 (표만)                   |

| `density`         | 헤더 높이 | 셀 상하 패딩 |
| ----------------- | --------- | ------------ |
| `'compact'`       | `h-8`     | `py-1.5`     |
| `'normal'` (기본) | `h-10`    | `py-2.5`     |
| `'loose'`         | `h-12`    | `py-3.5`     |

### 2. `classNames` 슬롯

Tailwind 유틸리티를 영역별로 얹는 가장 간단한 방법입니다.

```tsx
<SmartTable
  data={members}
  columns={memberColumns}
  className="max-w-4xl"
  classNames={{
    toolbar: "rounded-md bg-muted/40 p-2",
    headerCell: "uppercase tracking-wide",
    row: "hover:bg-primary/5",
    cell: "py-3",
    pagination: "border-t border-border pt-3",
  }}
/>
```

### 3. 컬럼 단위 조정

```tsx
amount: {
  label: '금액',
  format: 'money',
  align: 'right',
  width: 140,
  className: 'font-semibold text-primary',  // 본문 셀
  headerClassName: 'text-primary',          // 헤더 셀
},
```

### 4. 전면 교체 — `data-slot` + CSS Module

SmartTable은 내부적으로 shadcn `Table`을 쓰므로, 아래 `data-slot`을 선택자로 잡아 겉모습을 완전히 바꿀 수 있습니다.

| data-slot                       | 대상                                          |
| ------------------------------- | --------------------------------------------- |
| `[data-slot="table-container"]` | 표 스크롤 컨테이너                            |
| `[data-slot="table"]`           | `<table>`                                     |
| `[data-slot="table-header"]`    | `<thead>`                                     |
| `[data-slot="table-body"]`      | `<tbody>`                                     |
| `[data-slot="table-row"]`       | 모든 `<tr>` (선택 시 `data-state="selected"`) |
| `[data-slot="table-head"]`      | 모든 `<th>`                                   |
| `[data-slot="table-cell"]`      | 모든 `<td>`                                   |
| `[data-slot="button"]`          | 툴바·정렬 헤더·페이지 버튼                    |
| `[data-slot="input"]`           | 검색창                                        |
| `[data-slot="badge"]`           | `badge` 컬럼의 배지                           |
| `[data-slot="checkbox"]`        | 선택 체크박스                                 |

```css title="MemberListTable.module.css"
/* 래퍼(.wrap) 아래에서만 적용되도록 스코프를 건다.
 * data-slot="table-*" 은 화면의 모든 표가 공유하므로 전역으로 쓰면 다른 표까지 바뀐다. */
.wrap :global([data-slot="table-header"]) :global([data-slot="table-head"]) {
  background: var(--nic-head-bg);
  color: var(--nic-head-fg);
  font-size: 12px;
  letter-spacing: 0.02em;
}

/* 얼룩말 무늬 */
.wrap
  :global([data-slot="table-body"])
  :global([data-slot="table-row"]):nth-child(even) {
  background: var(--nic-zebra);
}

/* 선택된 행 강조 */
.wrap :global([data-slot="table-row"][data-state="selected"]) {
  background: var(--nic-selected);
}
```

```tsx
import styles from "./MemberListTable.module.css";

<div className={styles.wrap}>
  <SmartTable
    data={members}
    columns={memberColumns}
    variant="minimal"
    selectable
  />
</div>;
```

:::tip 명시도 & 스코프 주의

- 기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap :global([data-slot='…']) :global([data-slot='…'])`처럼 **2단계 이상 겹쳐** 명시도를 확보하세요.
- `data-slot="table-*"`은 SmartTable 전용이 아니라 **화면의 모든 표가 공유**합니다. 반드시 래퍼 클래스로 스코프를 거세요.
- CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
  :::

### 5. 색은 디자인 토큰으로

SmartTable 전용 색 변수는 없습니다. 헤더 배경(`--muted`), 구분선(`--border`), 선택 행(`--accent`), 카드 배경(`--card`) 등 **전역 토큰**을 조정하세요. SmartTable만을 위한 색 변수를 새로 만들면 토큰 체계가 분열됩니다.

---

## 실전 예제

---

scaffold의 `SmartTableComponent.tsx`(`/example/ui-components/smart-table`)에 있는 실제 코드입니다. 그대로 복사해서 시작할 수 있습니다.

### 1. 회원 목록 — 검색 · 선택 · 일괄액션 · 행액션 · 내보내기

가장 흔한 조회 화면 조합입니다.

<img
  src="../assets/ui/smart-table-toolbar.png"
  alt="일괄 액션 바 + 툴바"
  width="100%"
/>

**포인트**

- 컬럼은 **DSL만** 선언하고 셀 렌더 함수는 하나도 짜지 않았습니다(`format` + `badge`).
- 행 액션은 scaffold `DropdownMenu`를 그대로 사용하고, **클릭 전파는 SmartTable이 막아줍니다.**
- 내보내기는 `{ filename, sheetName }`만 주면 서식 있는 xlsx가 떨어집니다.

<details>
<summary><b>SmartTableComponent.tsx</b> — 클라이언트 모드 전체 소스</summary>

```tsx title="src/domains/example/pages/ui-components/SmartTableComponent.tsx"
import { MoreHorizontal } from "lucide-react";

import { Button, SmartTable, defineColumns } from "@axiom/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/lib/shadcn/ui/dropdown-menu";

type Member = {
  id: number;
  name: string;
  phone: string;
  balance: number;
  status: "active" | "dormant" | "blocked";
  joinedAt: string;
};

const members: Member[] = [
  {
    id: 1,
    name: "김철수",
    phone: "01012345678",
    balance: 1250000,
    status: "active",
    joinedAt: "2024-03-12",
  },
  {
    id: 2,
    name: "이영희",
    phone: "01023456789",
    balance: 870000,
    status: "active",
    joinedAt: "2024-06-01",
  },
  // … 이하 생략
];

const memberColumns = defineColumns<Member>({
  name: "이름",
  phone: { label: "연락처", format: "phone" },
  balance: { label: "잔액", format: "money", align: "right" },
  status: {
    label: "상태",
    align: "center",
    badge: {
      map: {
        active: { label: "활성", variant: "default" },
        dormant: { label: "휴면", variant: "secondary" },
        blocked: { label: "정지", variant: "destructive" },
      },
    },
  },
  joinedAt: { label: "가입일", format: "date:YYYY.MM.DD" },
});

/** 행 끝 액션 메뉴 */
function MemberRowActions({ member }: { member: Member }): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          {/* 아이콘 버튼에는 접근 가능한 이름이 필요합니다 */}
          <span className="sr-only">메뉴 열기</span>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>작업</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => $ui.alert(`${member.name} 상세 보기`)}>
          상세 보기
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            if (
              await $ui.confirm(`${member.name} 회원을 삭제할까요?`, {
                type: "warning",
              })
            ) {
              $ui.alert("삭제되었습니다 (데모)", { type: "success" });
            }
          }}
        >
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MemberListPage(): React.ReactNode {
  return (
    <SmartTable
      data={members}
      columns={memberColumns}
      searchable
      searchPlaceholder="이름·연락처 검색..."
      exportable={{ filename: "회원목록", sheetName: "회원" }}
      selectable="multiple"
      bulkActions={[
        {
          label: "선택 삭제",
          variant: "destructive",
          onClick: (rows) => $ui.alert(`${rows.length}건 삭제 (데모)`),
        },
        {
          label: "내보내기",
          onClick: (rows) => $ui.alert(`${rows.length}건 내보내기 (데모)`),
        },
      ]}
      renderRowActions={(member) => <MemberRowActions member={member} />}
    />
  );
}
```

</details>

### 2. 서버 모드 + `ref` 새로고침

`endpoint` 한 줄로 페이징·정렬·검색을 서버에 위임하고, 바깥 버튼에서 재조회합니다.

<details>
<summary><b>서버 모드</b> — 전체 소스</summary>

```tsx title="src/domains/example/pages/ui-components/SmartTableComponent.tsx"
import { useRef } from "react";
import { Button, SmartTable } from "@axiom/components/ui";
import type { ISmartTableHandle, SmartColumns } from "@axiom/components/ui";

type Post = { id: number; title: string; body: string };

const postColumns: SmartColumns<Post> = {
  id: { label: "ID", align: "right", width: 72 },
  title: "제목",
  body: {
    label: "내용",
    cell: ({ value }) => (
      <span className="line-clamp-1 text-muted-foreground">
        {String(value)}
      </span>
    ),
  },
};

export default function ServerModeExample(): React.ReactNode {
  const serverRef = useRef<ISmartTableHandle<Post>>(null);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => serverRef.current?.refetch()}
      >
        새로고침 (ref 핸들)
      </Button>

      <SmartTable<Post>
        ref={serverRef}
        endpoint="https://jsonplaceholder.typicode.com/posts"
        // 서버별 파라미터명 매핑
        paramMap={{
          page: "_page",
          size: "_limit",
          sort: "_sort",
          order: "_order",
          keyword: "q",
        }}
        // 응답 어댑팅 (이 API는 총 건수를 헤더로만 주므로 상수로 지정)
        select={(raw) => ({ rows: raw as Post[], total: 100 })}
        columns={postColumns}
        pageSize={5}
        searchable
        searchPlaceholder="제목·내용 검색..."
      />
    </>
  );
}
```

</details>

### 3. 다단계(병합) 헤더

<details>
<summary><b>그룹 헤더</b> — 전체 소스</summary>

```tsx title="src/domains/example/pages/ui-components/SmartTableComponent.tsx"
// 그룹은 { label, columns } 로 선언 — 화면·엑셀 모두 병합 헤더로 렌더됩니다.
const memberGroupedColumns = defineColumns<Member>({
  고객정보: {
    label: "고객정보",
    columns: {
      name: "이름",
      phone: { label: "연락처", format: "phone" },
    },
  },
  계정상태: {
    label: "계정 상태",
    columns: {
      status: {
        label: "상태",
        align: "center",
        badge: {
          map: {
            active: { label: "활성", variant: "default" },
            dormant: { label: "휴면", variant: "secondary" },
            blocked: { label: "정지", variant: "destructive" },
          },
        },
      },
      joinedAt: { label: "가입일", format: "date:YYYY.MM.DD" },
    },
  },
  // 그룹 밖 단독 컬럼은 세로 병합
  balance: { label: "잔액", format: "money", align: "right" },
});

<SmartTable
  data={members}
  columns={memberGroupedColumns}
  exportable={{ filename: "회원목록_그룹", sheetName: "회원" }}
  pageSize={6}
/>;
```

</details>

### 4. 본문 세로 병합 + 합계 행

지점/팀처럼 반복되는 값을 묶고 하단에 실적 합계를 붙이는, SI 정산·실적 화면의 전형입니다.

<details>
<summary><b>세로 병합 + 합계</b> — 전체 소스</summary>

```tsx title="src/domains/example/pages/ui-components/SmartTableComponent.tsx"
type Ledger = { branch: string; team: string; name: string; amount: number };

const ledger: Ledger[] = [
  { branch: "서울", team: "영업1팀", name: "김영수", amount: 12_500_000 },
  { branch: "서울", team: "영업1팀", name: "이지은", amount: 8_700_000 },
  { branch: "서울", team: "영업2팀", name: "박민호", amount: 9_300_000 },
  { branch: "부산", team: "영업1팀", name: "정해성", amount: 6_200_000 },
  // … 이하 생략
];

const ledgerColumns = defineColumns<Ledger>({
  branch: { label: "지점", mergeCells: true, align: "center" }, // 연속 동일값 → 세로 병합
  team: { label: "팀", mergeCells: true, align: "center" }, // 왼쪽(지점) 경계 상속
  name: "담당자",
  amount: { label: "실적", format: "money", align: "right", aggregate: "sum" },
});

<SmartTable
  data={ledger}
  columns={ledgerColumns}
  summary
  exportable={{ filename: "지점별실적", sheetName: "실적" }}
  pageSize={20}
/>;
// 화면·엑셀 모두: 지점·팀 세로 병합 + 하단 '합계' 행(실적 sum)
```

</details>

:::tip 네 예제에서 가져갈 것
바꾼 것은 세 가지뿐입니다 — ①**컬럼 DSL**(`format`·`badge`·`mergeCells`·`aggregate`) ②**표 prop**(`searchable`·`selectable`·`summary`·`exportable`) ③**슬롯에 넣은 내 마크업**(행 액션 메뉴·툴바 버튼). 컴포넌트를 복사해서 고치지 마세요.
:::

---

## 자주 하는 실수

---

| 증상                                               | 원인                                   | 해결                                                            |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| 셀이 전부 `-` 로 나온다                            | `columns`의 key가 데이터 필드명과 다름 | key를 필드명과 맞추거나 `accessor` 사용                         |
| 정렬·페이지 이동 후 엉뚱한 행이 선택된다           | `id` 필드가 없어 인덱스가 행 키로 쓰임 | `rowKey="memberNo"` 또는 `rowKey={(row) => …}` 지정             |
| `010-1234-5678`로 검색해도 안 나온다               | 검색은 **원본 값**(`01012345678`) 기준 | 하이픈 없이 검색하거나 검색용 필드를 만들어 `searchKeys`에 추가 |
| 배지 라벨(`활성`)로 검색이 안 된다                 | 원본 값은 `active`                     | 코드값으로 검색하거나 라벨 필드를 데이터에 추가                 |
| `accessor`로 만든 컬럼이 검색에 안 걸린다          | 검색은 `row.원본[key]`만 훑음          | 데이터를 미리 평탄화해서 넘김                                   |
| 아무 옵션도 안 켰는데 "컬럼" 버튼이 보인다         | 컬럼이 기본적으로 `hideable`           | `toolbar={false}` 또는 모든 컬럼에 `hideable: false`            |
| 서버 모드인데 엑셀에 현재 페이지만 담긴다          | 서버 모드 내보내기 범위 = 현재 페이지  | `exporter`로 전량 조회 후 직접 생성, 또는 서버 엑셀 API 사용    |
| 합계가 전체가 아니라 페이지 값만 나온다            | 서버 모드 집계 범위 = 현재 페이지      | 서버에서 합계를 내려받아 `toolbarEnd`/별도 영역에 표시          |
| `percent`가 `1250.0%`로 나온다                     | `percent`는 비율(0~1)을 받음           | `accessor: (row) => row.rate / 100`                             |
| 커스텀 `cell` 컬럼이 엑셀에 이상하게 나온다        | JSX는 텍스트화 불가 → 원본 값으로 폴백 | `cell` 대신 `format`/`accessor`로 처리                          |
| `mergeCells`가 여기저기 조각나서 병합된다          | "연속 동일값"만 묶음                   | 병합 기준 컬럼으로 **미리 정렬된 데이터**를 넘김                |
| 페이지를 넘기면 병합이 끊긴다                      | 병합은 **현재 페이지 안에서만** 계산   | `pageSize`를 키우거나 `paginated={false}`(클라이언트 모드)      |
| 함수 `aggregate`가 엑셀에 안 나온다                | 함수 집계는 화면 전용                  | `'sum'` / `'avg'` / `'count'` 사용                              |
| `paginated={false}`인데 서버 데이터가 다 안 나온다 | 서버 모드에서는 UI만 숨김              | `pageSize`를 크게 주거나 전량 조회 API 사용                     |
| 서버 모드인데 "총 N개"가 페이지 행 수로 보인다     | 총 건수는 페이지 계산에만 반영됨       | 총 건수 표시가 중요하면 `toolbarStart` 등에 직접 렌더           |
| `className`을 줬는데 표 안쪽이 안 바뀐다           | `className`은 **루트에만** 적용        | `classNames` 슬롯 또는 `data-slot` 자손 선택자 사용             |
| CSS Module 오버라이드가 안 먹는다                  | 명시도가 Tailwind 유틸리티보다 낮음    | `.내클래스 :global([data-slot='…']) :global([data-slot='…'])`   |
| 다른 화면의 표까지 스타일이 바뀌었다               | `data-slot="table-*"`을 전역으로 선택  | 래퍼 클래스로 스코프를 걸기                                     |
| 행 클릭이 키보드로 안 된다                         | `onRowClick`은 마우스 전용             | 첫 컬럼을 링크로 만들거나 행 액션에 "상세 보기" 추가            |
| 행 액션 버튼을 눌렀는데 행 클릭까지 실행된다       | (정상 동작 — SmartTable이 전파를 막음) | 직접 만든 요소라면 `onClick={(e) => e.stopPropagation()}` 추가  |

---
