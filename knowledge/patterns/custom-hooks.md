---
title: "커스텀 훅 작성 패턴"
category: pattern
tags: [custom-hook, 커스텀훅, 커스텀 훅, 훅작성, 훅만들기, hook작성, use접두사, use-prefix,
       usedebounce, debounce, 디바운스, uselocalstorage, localstorage, 로컬스토리지,
       usetoggle, 토글, useprevious, 재사용로직, 로직분리, 추출, extract, 합성, compose,
       rules-of-hooks, 훅규칙, 훅순서, 조건부훅, 선언순서, useeffect, usestate, usecallback, usememo]
priority: 2
language: ko
scope: pattern
related: [patterns/use-api.md, react/component.md, conventions/naming.md]
version: "1.0"
---

# 커스텀 훅 작성 패턴

반복되는 상태/로직을 **커스텀 훅**으로 추출해 컴포넌트를 얇게 유지한다. scaffold가 기본 제공하는
훅은 `useApi`·`useTheme`·`useSidebar`이며(=> [공통 훅 목록](../catalog/hooks.md)), 그 외 재사용 로직은
업무 개발자가 아래 규칙으로 직접 작성한다. (아래 `useDebounce` 등은 scaffold 내장이 아니라 **직접 작성하는
일반 React 패턴 예시**다.)

---

## 작성 규칙

1. **이름은 `use` 접두사 + camelCase** 파일·함수 모두 (`useDebounce.ts` / `function useDebounce()`).
   훅 파일은 camelCase, 컴포넌트 파일은 PascalCase. ([네이밍 규칙](../conventions/naming.md))
2. **Rules of Hooks 준수** — 훅(내장·커스텀 불문)은 함수 컴포넌트/다른 커스텀 훅의 **본문 최상위**에서만,
   항상 같은 순서로 호출한다. 조건문·반복문·일반 함수 안에서 호출 금지.
3. **반환은 명확한 형태로** — 값 1개면 그대로, 여러 개면 객체(이름 분기 쉬움)나 `[state, setter]` 튜플(useState류).
4. **타입 접두사** — 옵션/반환 타입은 `I`/`T` 접두사 (`IUsePagingOptions`, `TUsePagingResult`).

---

## 예시 1: useDebounce — 값 디바운스

```tsx
import { useEffect, useState } from 'react';

/** 값이 delay(ms) 동안 안정될 때까지 갱신을 지연시킨다. 검색어 입력 등에 사용. */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
```

```tsx
// 사용 — 디바운스된 검색어로만 useApi 재조회
export default function UserSearchPage(): React.ReactNode {
  // 1. 상태
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 400);

  // 2. useApi (디바운스된 값이 있을 때만 조회)
  const { data } = useApi<TUser[]>('/api/users', {
    params: { q: debouncedKeyword },
    queryOptions: { enabled: debouncedKeyword.length > 0 },
  });

  return (
    <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
  );
}
```

> 선언 순서(상태 → `useApi` → effect/handler)는 [컴포넌트 패턴](../react/component.md)의 규칙을 따른다.

---

## 예시 2: useLocalStorage — localStorage 동기화 상태

```tsx
import { useCallback, useState } from 'react';

/** localStorage에 영속되는 상태. useState와 동일한 [값, setter] 시그니처. */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T) => {
      setValue(v);
      localStorage.setItem(key, JSON.stringify(v));
    },
    [key],
  );

  return [value, set];
}
```

```tsx
const [collapsed, setCollapsed] = useLocalStorage('sidebar.collapsed', false);
```

---

## 예시 3: useApi 합성 — 도메인 전용 데이터 훅

`useApi`를 감싸 도메인 의미를 가진 훅으로 만들 수 있다. 엔드포인트·타입을 한곳에 고정해 재사용한다.

```tsx
import { useApi } from '@axiom/hooks';

/** 사용자 목록 조회 — 화면들이 공유하는 도메인 훅. */
export function useUsers(params?: { status?: string }) {
  return useApi<TUser[]>('/api/users', { params });
}
```

```tsx
export default function UserListPage(): React.ReactNode {
  const { data, isPending, error } = useUsers({ status: 'active' });
  // ...
}
```

> ⚠️ 합성 훅도 결국 `useApi`를 호출하므로 **컴포넌트/커스텀 훅 본문 최상위**에서만 호출해야 한다.
> 일반 유틸 함수 안에서 `useUsers()`를 부르면 Rules of Hooks 위반으로 앱이 깨진다. ([useApi 호출 위치 규칙](use-api.md))

---

## 체크리스트

- [ ] 파일·함수명 `use` + camelCase, 본문 최상위에서만 호출.
- [ ] 옵션/반환 타입에 `I`/`T` 접두사.
- [ ] `useApi`를 합성한 훅도 훅 호출 규칙(최상위)을 그대로 따른다.
- [ ] 정말 재사용되는 로직만 추출(1회성은 컴포넌트 안에 둔다).
