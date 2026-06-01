---
title: lodash 유틸리티 함수
version: "^4.18"
tags: [lodash, debounce, throttle, groupby, pick, omit, clonedeep, uniqby, 유틸리티, 헬퍼함수]
scope: library
---

# lodash

react-app-scaffold에 `lodash ^4.18`과 `@types/lodash`이 설치되어 있다. v4는 장기 안정 버전.

## import 방식

```ts
// named import (권장 — tree-shaking 지원)
import { debounce, groupBy, cloneDeep } from 'lodash';

// 개별 함수 import (번들 크기 최소화 시)
import debounce from 'lodash/debounce';
```

## 자주 쓰는 함수

### debounce / throttle (이벤트 제어)

```ts
import { debounce, throttle } from 'lodash';

// 마지막 호출 후 300ms 뒤에 실행
const handleSearch = debounce((value: string) => {
  searchApi(value);
}, 300);

// 1초에 최대 1번 실행
const handleScroll = throttle(() => {
  checkScrollPosition();
}, 1000);

// React 컴포넌트에서는 useCallback과 함께 사용
const debouncedSearch = useCallback(debounce(handleSearch, 300), []);
```

### groupBy / orderBy (배열 그룹화/정렬)

```ts
import { groupBy, orderBy } from 'lodash';

const users = [
  { name: '김철수', dept: '개발팀' },
  { name: '이영희', dept: '기획팀' },
  { name: '박민준', dept: '개발팀' },
];

groupBy(users, 'dept');
// { 개발팀: [...], 기획팀: [...] }

orderBy(users, ['dept', 'name'], ['asc', 'desc']);
```

### pick / omit (객체 필드 선택/제외)

```ts
import { pick, omit } from 'lodash';

const user = { id: 1, name: '김철수', password: 'secret', email: 'a@b.com' };

pick(user, ['id', 'name', 'email'])  // { id: 1, name: '김철수', email: 'a@b.com' }
omit(user, ['password'])             // { id: 1, name: '김철수', email: 'a@b.com' }
```

### cloneDeep (깊은 복사)

```ts
import { cloneDeep } from 'lodash';

const original = { a: { b: { c: 1 } } };
const copy = cloneDeep(original); // 원본 영향 없음
copy.a.b.c = 99;
```

### uniqBy / flatMap (배열 처리)

```ts
import { uniqBy, flatMap, chunk } from 'lodash';

uniqBy([{ id: 1 }, { id: 2 }, { id: 1 }], 'id')
// [{ id: 1 }, { id: 2 }]

flatMap([[1, 2], [3, 4]])   // [1, 2, 3, 4]
chunk([1, 2, 3, 4, 5], 2)  // [[1, 2], [3, 4], [5]]
```

### isEqual (깊은 비교)

```ts
import { isEqual } from 'lodash';

isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }) // true
isEqual([1, 2, 3], [1, 2, 3])                           // true
```
