---
title: "useApi 훅"
category: pattern
tags: [useApi, use-api, "@axiom/hooks", query, mutation, get, post, put, delete, patch, 조회, 생성, 수정, 삭제, cache, 캐시, invalidate, enabled, 조건부, tanstack, useQuery, useMutation, 훅]
priority: 1
language: ko
scope: pattern
related: [patterns/api-call.md, patterns/use-api-source.md]
version: "1.0"
---

# useApi 훅

`src/core/hooks/use-api.ts` | 임포트: `import { useApi } from '@axiom/hooks'`

TanStack Query의 `useQuery` / `useMutation`을 단일 훅으로 통합한 범용 HTTP 훅.
**scaffold에서 모든 API 호출은 이 훅을 통해서만 한다.**

---

## ⚠️ 호출 위치 규칙 (가장 중요 — React Rules of Hooks)

`useApi`는 **React 함수 컴포넌트 또는 커스텀 훅(`use*`) 함수 본문의 최상위**에서만 호출할 수 있다.

**❌ 절대 금지 — 함수 바깥(모듈 최상위) 호출:**
```tsx
// ❌ 이렇게 작성하면 런타임 즉시 크래시 — Rules of Hooks 위반
const calculateTenure = (hireDate: string) => { /* ... */ };

const { data } = useApi<TUser[]>('/api/users'); // ← 함수 바깥! 금지

export default function MyPage(): React.ReactNode {
  return <div>...</div>;
}
```

**❌ 절대 금지 — 일반 유틸 함수 안 호출:**
```tsx
// ❌ 컴포넌트가 아닌 일반 함수 내부 → 금지
function fetchAndFormat() {
  const { data } = useApi<TUser[]>('/api/users'); // ← 일반 함수 안! 금지
  return data;
}
```

**✅ 올바른 위치 — 컴포넌트 본문 최상위:**
```tsx
export default function MyPage(): React.ReactNode {
  // ✅ 함수 본문 안, return 위, 다른 훅과 같은 레벨
  const { data, isPending, error } = useApi<TUser[]>('/api/users');

  if (isPending) return <div>로딩...</div>;
  return <div>{data?.length}건</div>;
}
```

요약: `useApi`를 포함한 모든 `use*` 훅은 반드시 `export default function ComponentName() { ... }` 블록 **안쪽**, `return` 문 위에 작성한다. import 아래·일반 const 옆·유틸 함수 안에 작성하면 React 앱이 즉시 깨진다.

---

## 타입 자동 결정 규칙

`type` 옵션을 명시하지 않아도 `method` 값으로 자동 결정된다.

| 조건 | 동작 |
|------|------|
| `type` 생략 + `method` 없음 또는 `'GET'` | `useQuery` (자동 실행, 캐싱) |
| `type` 생략 + `method: 'POST'/'PUT'/'PATCH'/'DELETE'` | `useMutation` (수동 실행) |
| `type: 'query'` 명시 | 항상 `useQuery` |
| `type: 'mutation'` 명시 | 항상 `useMutation` |

---

## 오버로드 1: Query 조회 모드

```typescript
function useApi<TData>(
  endpoint: string,
  options?: IUseApiQueryOptions<TData>
): UseQueryResult<TData, Error>
```

컴포넌트 마운트 시 **자동 실행**되고, 결과가 TanStack Query 캐시에 저장된다.

> 아래 모든 예제의 `useApi` 호출은 반드시 컴포넌트 함수 본문 안에 위치해야 한다. 코드 한 줄만 발췌해 import 아래나 일반 const 옆에 붙여 넣지 말 것.

### 기본 GET

```tsx
export default function PostList(): React.ReactNode {
  const { data, isLoading, error } = useApi<Post[]>('/api/posts');
  return <div>{data?.length}건</div>;
}
```

### GET + query string params

```tsx
export default function UserDetail(): React.ReactNode {
  // 실제 요청: GET /api/users?id=1&status=active
  const { data } = useApi<User>('/api/users', {
    params: { id: 1, status: 'active' },
  });
  return <div>{data?.name}</div>;
}
```

### POST이지만 조회 목적 (type 명시)

```tsx
export default function SearchPage(): React.ReactNode {
  const { data } = useApi<SearchResult>('/api/search', {
    method: 'POST',
    body: { keyword: 'react' },
    type: 'query',
  });
  return <div>{data?.total}</div>;
}
```

### queryOptions 전달 (staleTime, enabled 등)

```tsx
export default function ConfigView({ userId }: { userId?: string }): React.ReactNode {
  const { data } = useApi<Config>('/api/config', {
    queryOptions: {
      staleTime: 1000 * 60 * 5, // 5분
      enabled: !!userId,         // 조건부 실행 (훅 자체를 조건문으로 감싸면 안 됨)
    },
  });
  return <pre>{JSON.stringify(data)}</pre>;
}
```

### 반환값 주요 필드

```tsx
export default function PostList(): React.ReactNode {
  const {
    data,        // TData | undefined
    isLoading,   // 최초 로딩
    isPending,   // 데이터 없는 로딩 상태
    isFetching,  // 백그라운드 재조회 포함
    error,       // Error | null
    refetch,     // 수동 재조회 함수
  } = useApi<Post[]>('/api/posts');
  return <div>{data?.length}</div>;
}
```

---

## 오버로드 2: Mutation 변경 모드

```typescript
function useApi<TData, TVariables>(
  endpoint: string,
  options: IUseApiMutationOptions<TData, TVariables>
): UseApiMutationResult<TData, TVariables>
```

`mutate()` 호출 시점에 **수동 실행**. `type: 'mutation'` 또는 POST/PUT/PATCH/DELETE method로 자동 전환.

> ✅ **`mutate()`로 데이터를 변경·생성·수정·삭제하는 용도로 쓸 때는 `type: 'mutation'` 옵션을 명시하라.**
> method로도 자동 전환되지만, `type: 'mutation'`을 함께 적으면 의도(조회가 아닌 변경)가 코드에 드러나고, `method: 'POST'`이지만 조회 목적인 경우(`type: 'query'`)와 명확히 구분된다.
>
> ```tsx
> const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', {
>   method: 'POST',
>   type: 'mutation', // ← 데이터 변경 용도임을 명시
> });
> ```

### POST 생성

```tsx
export default function UserCreatePage(): React.ReactNode {
  const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', {
    method: 'POST',
  });

  const handleCreate = () => {
    mutate({ name: '홍길동', email: 'hong@example.com' });
  };

  return <button onClick={handleCreate} disabled={isPending}>생성</button>;
}
```

### PUT 수정

```tsx
export default function UserEditPage(): React.ReactNode {
  const { mutate } = useApi<User, UpdateUserDto>('/api/users/1', {
    method: 'PUT',
  });
  return <button onClick={() => mutate({ name: '신규' })}>수정</button>;
}
```

### DELETE + 캐시 무효화

```tsx
export default function UserDeleteButton(): React.ReactNode {
  const { mutate, invalidateQueries } = useApi('/api/users/1', {
    method: 'DELETE',
  });

  const handleDelete = () => {
    mutate(
      {},
      {
        onSuccess: async () => {
          await invalidateQueries('/api/users'); // GET /api/users 캐시 갱신
        },
      }
    );
  };

  return <button onClick={handleDelete}>삭제</button>;
}
```

### mutationOptions 전달 (onSuccess, onError)

```tsx
export default function UserCreatePage(): React.ReactNode {
  const { mutate } = useApi<User, CreateUserDto>('/api/users', {
    method: 'POST',
    mutationOptions: {
      onSuccess: (data) => {
        console.log('생성 완료:', data);
      },
      onError: (error) => {
        console.error('생성 실패:', error.message);
      },
    },
  });
  return <button onClick={() => mutate({ name: '신규' })}>생성</button>;
}
```

### 반환값 주요 필드

```tsx
export default function UserCreatePage(): React.ReactNode {
  const {
    mutate,            // (variables: TVariables) => void
    mutateAsync,       // Promise 반환 버전
    isPending,         // 요청 진행 중
    data,              // TData | undefined (성공 응답)
    error,             // Error | null
    reset,             // 상태 초기화
    invalidateQueries, // (endpoint: string) => Promise<void>
  } = useApi<User, CreateUserDto>('/api/users', { method: 'POST' });
  return <div>{isPending ? '전송 중' : '대기'}</div>;
}
```

---

## invalidateQueries

mutation 성공 후 다른 query의 캐시를 무효화(재조회 트리거)한다.

```tsx
export default function PostDeleteButton(): React.ReactNode {
  const { mutate, invalidateQueries } = useApi<void, { id: number }>('/api/posts', {
    method: 'DELETE',
  });

  const handleDelete = () => {
    mutate(
      { id: 5 },
      {
        onSuccess: async () => {
          await invalidateQueries('/api/posts'); // POST 목록 캐시 무효화
        },
      }
    );
  };

  return <button onClick={handleDelete}>삭제</button>;
}
```

`invalidateQueries`는 `@axiom/hooks`의 `useApi`가 반환하는 확장 필드다.
`useQueryClient().invalidateQueries()`를 직접 호출하지 않는다.

---

## normalizeBody (내부 동작)

`mutate(variables)`에 `FormData`를 전달하면 자동으로 일반 객체로 변환된다.
`File` / `Blob` 값은 변환 없이 그대로 유지된다.

---

## 에러 처리

```tsx
export default function PostList(): React.ReactNode {
  const { data, error } = useApi<Post[]>('/api/posts');

  if (error) {
    // error.message — 서버 응답 메시지 또는 '요청 시간이 초과되었습니다'
    return <p className="text-red-600">에러: {error.message}</p>;
  }
  return <ul>{data?.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

mutation 에러:

```tsx
export default function UserCreatePage(): React.ReactNode {
  const { mutate, error } = useApi<User, CreateUserDto>('/api/users', {
    method: 'POST',
  });

  return (
    <>
      <button onClick={() => mutate({ name: '신규', email: 'a@b.c' })}>생성</button>
      {error && <p>에러: {error.message}</p>}
    </>
  );
}
```

---

## 옵션 타입 전체 참고

```typescript
interface IUseApiBaseOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // 기본값: 'GET'
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number; // ms
}

interface IUseApiQueryOptions<TData> extends IUseApiBaseOptions {
  type?: 'query';
  queryOptions?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>;
}

interface IUseApiMutationOptions<TData, TVariables> extends IUseApiBaseOptions {
  type: 'mutation';
  mutationOptions?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>;
}
```
