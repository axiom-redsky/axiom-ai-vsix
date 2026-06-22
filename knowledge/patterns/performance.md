---
title: "성능 최적화 패턴"
category: pattern
tags: [performance, 성능, 최적화, optimize, 느림, 렌더링최적화, 리렌더, re-render, 리렌더링,
       memo, react.memo, usememo, usecallback, 메모이제이션, memoization,
       lazy, loadable, 코드스플리팅, code-splitting, 지연로딩, 청크, chunk, 번들, bundle,
       staletime, 캐시, cache, enabled, 조건부, 불필요한요청, 중복요청, key, 리스트키]
priority: 2
language: ko
scope: pattern
related: [patterns/router.md, patterns/use-api.md, react/component.md]
version: "1.0"
---

# 성능 최적화 패턴

react-app-scaffold에서 화면 성능을 끌어올리는 표준 레버는 네 가지다:
**① 코드 스플리팅(loadable) ② 데이터 캐싱(useApi/TanStack Query) ③ 렌더 메모이제이션(memo/useMemo/useCallback) ④ 리스트 key.**
성급한 최적화는 피하고, 실제 느린 지점부터 적용한다.

---

## 1. 코드 스플리팅 — `@loadable/component`

scaffold는 라우트 페이지를 **`loadable()`** 로 감싸 진입 시점에만 청크를 받는다(React.lazy 아님, `Suspense` 불필요).
새 페이지는 라우터에서 자동으로 이 패턴을 따른다. ([라우팅 패턴](router.md))

```typescript
import loadable from '@loadable/component';

// 라우트 진입 시에만 다운로드되는 페이지 청크
const MyPage = loadable(() => import('@/domains/my-feature/pages/MyPage'));
```

무거운 위젯(차트·에디터 등)도 같은 방식으로 분할해 초기 번들에서 뺄 수 있다.

```tsx
const RevenueChart = loadable(() => import('../components/RevenueChart'), {
  fallback: <Skeleton className="h-64 w-full" />,
});
```

---

## 2. 데이터 캐싱 — useApi(TanStack Query)

같은 데이터를 화면마다 다시 받지 않도록 **`staleTime`** 으로 캐시 신선도를 늘리고, 필요 없을 땐
**`enabled`** 로 요청 자체를 막는다. (옵션 상세 [useApi 훅](use-api.md))

```tsx
export default function ConfigView({ userId }: { userId?: string }): React.ReactNode {
  const { data } = useApi<TConfig>('/api/config', {
    queryOptions: {
      staleTime: 1000 * 60 * 5, // 5분간 재요청 안 함(캐시 사용)
      enabled: !!userId,         // userId 없으면 호출 자체를 생략
    },
  });
  return <pre>{JSON.stringify(data)}</pre>;
}
```

- 동일 `endpoint`+`params` 는 캐시를 공유하므로, 여러 컴포넌트가 같은 `useApi`를 써도 네트워크 요청은 1회다.
- 변경 후에는 `invalidateQueries(endpoint)`로 해당 캐시만 갱신한다(전체 새로고침 불필요).

---

## 3. 렌더 메모이제이션 — memo / useMemo / useCallback

부모 리렌더가 자식·계산을 불필요하게 다시 돌릴 때만 선택적으로 적용한다.

```tsx
import React, { useMemo, useCallback, useState } from 'react';

// (a) React.memo — props가 같으면 자식 리렌더 skip
const Row = React.memo(function Row({ user }: { user: TUser }) {
  return <li>{user.name}</li>;
});

export default function UserListPage(): React.ReactNode {
  const [keyword, setKeyword] = useState('');
  const { data } = useApi<TUser[]>('/api/users');

  // (b) useMemo — 비싼 파생 계산 캐싱
  const filtered = useMemo(
    () => (data ?? []).filter((u) => u.name.includes(keyword)),
    [data, keyword],
  );

  // (c) useCallback — memo된 자식에 넘기는 핸들러 참조 고정
  const handleSelect = useCallback((id: number) => {
    console.log('select', id);
  }, []);

  return <ul>{filtered.map((u) => <Row key={u.id} user={u} />)}</ul>;
}
```

> ⚠️ `memo`/`useMemo`/`useCallback`도 비용이 있다. **측정 없이 전부 감싸지 말 것** — 실제 리렌더 병목이
> 확인된 곳에만 쓴다. `useCallback`은 보통 `React.memo`된 자식에 함수를 넘길 때만 의미가 있다.

---

## 4. 리스트 key

리스트 렌더 시 **안정적인 고유 `key`(주로 id)** 를 준다. 배열 인덱스를 key로 쓰면 항목 추가/삭제 시
DOM 재사용이 어긋나 리렌더·상태 꼬임이 생긴다.

```tsx
// ✅ 고유 id
{users.map((u) => <Row key={u.id} user={u} />)}

// ❌ 인덱스 key — 순서 바뀌면 깨짐
{users.map((u, i) => <Row key={i} user={u} />)}
```

---

## 체크리스트

- [ ] 페이지/무거운 위젯은 `loadable()`로 분할한다.
- [ ] 자주 안 바뀌는 데이터는 `staleTime`, 조건부는 `enabled`로 요청을 줄인다.
- [ ] 메모이제이션은 측정 후 병목 지점에만 적용한다.
- [ ] 리스트 `key`는 인덱스가 아닌 안정적 고유값을 쓴다.
