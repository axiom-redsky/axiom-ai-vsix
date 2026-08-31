---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.array'
---

# $util.array

`react-app-scaffold`에서 전역으로 제공하는 **배열(Array) 유틸리티**입니다.
그룹핑, 정렬, 합계, 중복 제거, 분할, 트리 변환 등 그리드·리포트·메뉴 화면에서 자주 쓰이는 배열 처리 기능을 제공합니다.

* 외부 라이브러리 의존 없이 순수 함수로 동작합니다.
* 별도의 `import` 없이 전역 객체 `$util.array`로 바로 사용합니다.

```ts
// 사용 형태
$util.array.sum([1, 2, 3, 4]);                         // 10
$util.array.uniq([1, 1, 2, 3, 3]);                     // [1, 2, 3]
$util.array.chunk([1, 2, 3, 4, 5], 2);                 // [[1,2],[3,4],[5]]
```

---

## groupBy()

배열을 지정한 **키 값으로 그룹핑**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `Record<string, unknown>[]` | ✓ | | 대상 객체 배열 |
| `key` | `string` | ✓ | | 그룹 기준이 될 속성 키 |

* **반환** : `Record<string, Record<string, unknown>[]>` — 그룹 키를 속성으로 갖고, 각 값에 해당 항목들의 배열을 담은 객체
* 그룹 키는 항상 **문자열로 변환**되어 사용됩니다. (예: 숫자 `1` → `'1'`)
* 원본 배열의 순서를 유지하며 각 그룹에 담깁니다.

```ts
const rows = [
  { type: 'A', v: 1 },
  { type: 'B', v: 2 },
  { type: 'A', v: 3 },
];

$util.array.groupBy(rows, 'type');
// {
//   A: [{ type: 'A', v: 1 }, { type: 'A', v: 3 }],
//   B: [{ type: 'B', v: 2 }],
// }
```

---

## sortBy()

지정한 **키 값을 기준으로 정렬한 새 배열**을 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `Record<string, unknown>[]` | ✓ | | 대상 객체 배열 |
| `key` | `string` | ✓ | | 정렬 기준이 될 속성 키 |
| `order` | `'asc' \| 'desc'` | | `'asc'` | 정렬 방향 (오름차순 / 내림차순) |

* **반환** : `Record<string, unknown>[]` — 정렬된 **새 배열**
* **원본 배열을 변경하지 않습니다.** (내부에서 복사 후 정렬)
* 값 비교는 `<` / `>` 연산자를 사용하므로 숫자·문자열 등 비교 가능한 값에 적합합니다.

```ts
const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];

$util.array.sortBy(rows, 'n');          // [{ n: 1 }, { n: 2 }, { n: 3 }]
$util.array.sortBy(rows, 'n', 'desc');  // [{ n: 3 }, { n: 2 }, { n: 1 }]
// rows 원본은 그대로 유지됩니다.
```

---

## sum()

**숫자 배열의 합계**를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `number[]` | ✓ | | 합계를 구할 숫자 배열 |

* **반환** : `number` — 모든 요소의 합
* 숫자로 변환할 수 없는 값(`NaN` 등)은 **`0`으로 취급**하여 합산합니다.
* 빈 배열이면 `0`을 반환합니다.

```ts
$util.array.sum([1, 2, 3, 4]);   // 10
$util.array.sum([]);             // 0
$util.array.sum([10, null, 5]);  // 15 (숫자로 변환 불가한 값은 0 처리)
```

---

## sumBy()

객체 배열에서 지정한 **키 값의 합계**를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `Record<string, unknown>[]` | ✓ | | 대상 객체 배열 |
| `key` | `string` | ✓ | | 합산할 속성 키 |

* **반환** : `number` — 각 항목의 `key` 값을 모두 더한 합
* 숫자로 변환할 수 없는 값은 **`0`으로 취급**합니다.
* 금액 컬럼 합계 등 그리드 집계에 활용합니다.

```ts
const rows = [{ amt: 100 }, { amt: 200 }, { amt: 50 }];

$util.array.sumBy(rows, 'amt');  // 350
```

---

## uniq()

**중복을 제거한 새 배열**을 반환합니다. (원시값 기준)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `unknown[]` | ✓ | | 대상 배열 |

* **반환** : `unknown[]` — 중복이 제거된 배열 (처음 등장한 순서 유지)
* `Set` 기반의 **동일성(===)** 으로 비교합니다. 숫자·문자열 등 원시값에 적합합니다.
* 객체는 **참조가 같아야** 중복으로 간주되므로, 객체 배열은 [`uniqBy()`](#uniqby)를 사용하세요.

```ts
$util.array.uniq([1, 1, 2, 3, 3]);          // [1, 2, 3]
$util.array.uniq(['a', 'b', 'a']);          // ['a', 'b']
```

---

## uniqBy()

지정한 **키 값을 기준으로 중복을 제거**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `Record<string, unknown>[]` | ✓ | | 대상 객체 배열 |
| `key` | `string` | ✓ | | 중복 판정 기준이 될 속성 키 |

* **반환** : `Record<string, unknown>[]` — 키 값이 중복되지 않는 항목만 담은 새 배열
* 같은 키 값이 여러 번 나오면 **처음 등장한 항목만 남깁니다.**

```ts
const rows = [
  { id: 1, name: '가' },
  { id: 1, name: '나' },
  { id: 2, name: '다' },
];

$util.array.uniqBy(rows, 'id');
// [{ id: 1, name: '가' }, { id: 2, name: '다' }]  (id=1은 처음 항목만 유지)
```

---

## chunk()

배열을 지정한 **크기 단위로 분할**한 2차원 배열을 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `array` | `unknown[]` | ✓ | | 대상 배열 |
| `size` | `number` | ✓ | | 한 묶음의 크기 |

* **반환** : `unknown[][]` — `size` 개씩 묶은 배열들의 배열
* 마지막 묶음은 남은 개수만큼만 담깁니다.
* `size`가 `0` 이하이면 빈 배열(`[]`)을 반환합니다.

```ts
$util.array.chunk([1, 2, 3, 4, 5], 2);  // [[1, 2], [3, 4], [5]]
$util.array.chunk([1, 2, 3], 5);        // [[1, 2, 3]]
$util.array.chunk([1, 2, 3], 0);        // [] (size가 0 이하)
```

---

## toTree()

**평면 목록을 트리 구조로 변환**합니다. — 메뉴·조직도·계층 코드

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `flat` | `Record<string, unknown>[]` | ✓ | | 평면 형태의 노드 목록 |
| `idKey` | `string` | | `'id'` | 각 노드의 고유 키 속성명 |
| `parentKey` | `string` | | `'parentId'` | 부모 노드를 가리키는 속성명 |
| `childrenKey` | `string` | | `'children'` | 자식 배열을 담을 속성명 |

* **반환** : `Record<string, unknown>[]` — 최상위(루트) 노드들의 배열
* 각 노드는 원본을 복사한 뒤 `childrenKey` 배열이 추가된 형태입니다. (원본 노드는 변경하지 않음)
* `parentKey` 값이 `null`/`undefined`이거나, 매칭되는 부모가 없으면 **루트 노드**로 처리됩니다.

```ts
const flat = [
  { id: 1, parentId: null, name: '대분류' },
  { id: 2, parentId: 1, name: '중분류A' },
  { id: 3, parentId: 1, name: '중분류B' },
];

$util.array.toTree(flat);
// [
//   {
//     id: 1, parentId: null, name: '대분류',
//     children: [
//       { id: 2, parentId: 1, name: '중분류A', children: [] },
//       { id: 3, parentId: 1, name: '중분류B', children: [] },
//     ],
//   },
// ]

// 커스텀 키 사용
$util.array.toTree(flat, 'id', 'parentId', 'items');
```

---

## flattenTree()

**트리를 평면 목록으로 펼칩니다.** ([`toTree()`](#totree)의 반대)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `tree` | `Record<string, unknown>[]` | ✓ | | 대상 트리 배열 |
| `childrenKey` | `string` | | `'children'` | 자식 배열이 담긴 속성명 |

* **반환** : `Record<string, unknown>[]` — 모든 노드를 깊이 우선(depth-first) 순서로 펼친 평면 배열
* 펼친 각 노드에서 **`childrenKey` 속성은 제거**됩니다.

```ts
const tree = [
  {
    id: 1,
    children: [
      { id: 2, children: [] },
      { id: 3, children: [] },
    ],
  },
];

$util.array.flattenTree(tree);
// [{ id: 1 }, { id: 2 }, { id: 3 }]  (children 속성 제거)
```

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
const orders = [
  { region: '서울', amount: 1000 },
  { region: '부산', amount: 500 },
  { region: '서울', amount: 2000 },
];

// 1) 지역별로 그룹핑 후 각 그룹 합계 구하기
const grouped = $util.array.groupBy(orders, 'region');
const seoulTotal = $util.array.sumBy(grouped['서울'], 'amount'); // 3000

// 2) 금액 내림차순 정렬 후 상위 페이지 분할
const sorted = $util.array.sortBy(orders, 'amount', 'desc');
const pages = $util.array.chunk(sorted, 2); // 2건씩 페이지 분할

// 3) 평면 메뉴 목록을 트리로 변환하여 렌더링
const menuTree = $util.array.toTree(flatMenus, 'menuId', 'parentMenuId');
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| `groupBy(array, key)` | `Record<string, T[]>` | 키 값으로 그룹핑 |
| `sortBy(array, key, order?)` | `T[]` | 키 기준 정렬 (원본 불변, 기본 오름차순) |
| `sum(array)` | `number` | 숫자 배열의 합계 |
| `sumBy(array, key)` | `number` | 키 값의 합계 |
| `uniq(array)` | `T[]` | 중복 제거 (원시값 기준) |
| `uniqBy(array, key)` | `T[]` | 키 값 기준 중복 제거 (첫 항목 유지) |
| `chunk(array, size)` | `T[][]` | 지정 크기로 분할 |
| `toTree(flat, idKey?, parentKey?, childrenKey?)` | `T[]` | 평면 목록 → 트리 변환 |
| `flattenTree(tree, childrenKey?)` | `T[]` | 트리 → 평면 목록 변환 |
:::
