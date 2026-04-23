---
title: API 호출 패턴 (useApi)
tags: [api, fetch, axios, useapi, query, mutation, get, post, put, delete, patch, 통신, 캐시]
scope: pattern
related: [scaffold/project-structure.md]
---

# API 호출 패턴

scaffold에서 **모든 API 호출은 `useApi` 훅**을 통해서만 한다.
`useQuery` / `useMutation` 직접 사용 금지. `callApi` 직접 사용도 특수한 경우에만.

## 계층 구조

```
useApi (훅) — 항상 이것만 사용
  └── callApi (함수)
        └── BaseAxiosClient (Axios 싱글턴)
              └── getApiConfig → window.__MF_APP_CONFIG__
```

## 임포트

```typescript
import { useApi } from '@axiom/hooks';
```

## GET 조회 (자동 실행)

```typescript
// 기본 GET
const { data, isLoading, error } = useApi<Post[]>('/api/posts');

// query string params
const { data } = useApi<User>('/api/users', {
  params: { id: 1, status: 'active' },
});
// 실제 요청: GET /api/users?id=1&status=active

// 조건부 실행 (enabled)
const { data } = useApi<Config>('/api/config', {
  queryOptions: {
    staleTime: 1000 * 60 * 5, // 5분 캐시
    enabled: !!userId,          // userId가 있을 때만 실행
  },
});
```

## GET 반환값

```typescript
const {
  data,        // TData | undefined
  isLoading,   // 최초 로딩 중
  isPending,   // 데이터 없는 로딩 상태
  isFetching,  // 백그라운드 재조회 포함
  error,       // Error | null
  refetch,     // 수동 재조회 함수
} = useApi<Post[]>('/api/posts');
```

## POST 생성 (수동 실행)

```typescript
const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', {
  method: 'POST',
});

// 호출
mutate({ name: '홍길동', email: 'hong@example.com' });

// mutationOptions 활용
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
```

## PUT 수정

```typescript
const { mutate } = useApi<User, UpdateUserDto>('/api/users/1', {
  method: 'PUT',
});
```

## DELETE + 캐시 무효화

```typescript
const { mutate, invalidateQueries } = useApi('/api/users/1', {
  method: 'DELETE',
});

mutate(
  {},
  {
    onSuccess: async () => {
      await invalidateQueries('/api/users'); // GET /api/users 캐시 갱신
    },
  }
);
```

## POST이지만 조회 목적 (type 명시)

```typescript
const { data } = useApi<SearchResult>('/api/search', {
  method: 'POST',
  body: { keyword: 'react' },
  type: 'query', // mutation 대신 query로 강제
});
```

## Mutation 반환값

```typescript
const {
  mutate,            // (variables: TVariables) => void
  mutateAsync,       // Promise 반환 버전
  isPending,         // 요청 진행 중
  data,              // TData | undefined
  error,             // Error | null
  reset,             // 상태 초기화
  invalidateQueries, // (endpoint: string) => Promise<void>
} = useApi<User, CreateUserDto>('/api/users', { method: 'POST' });
```

## 컴포넌트 사용 전체 예시

```tsx
import { useApi } from '@axiom/hooks';
import { Button } from '@axiom/components/ui';

function UserListPage() {
  const { data, isLoading, error } = useApi<User[]>('/api/users');
  const { mutate: deleteUser, invalidateQueries } = useApi('/api/users', {
    method: 'DELETE',
  });

  if (isLoading) return <div>로딩 중...</div>;
  if (error) return <p className="text-red-500">에러: {error.message}</p>;

  return (
    <div>
      {data?.map((user) => (
        <div key={user.id} className="flex items-center gap-2">
          <span>{user.name}</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              deleteUser(
                { id: user.id },
                { onSuccess: async () => await invalidateQueries('/api/users') }
              )
            }
          >
            삭제
          </Button>
        </div>
      ))}
    </div>
  );
}
```

## 타입 자동 결정 규칙

| 조건 | 동작 |
|------|------|
| `type` 생략 + `method` 없음 또는 `'GET'` | `useQuery` (자동 실행) |
| `type` 생략 + `method: 'POST'/'PUT'/'PATCH'/'DELETE'` | `useMutation` (수동 실행) |
| `type: 'query'` 명시 | 항상 `useQuery` |
| `type: 'mutation'` 명시 | 항상 `useMutation` |

## 에러 처리

```typescript
const { error } = useApi<Post[]>('/api/posts');
if (error) {
  // error.message — 서버 응답 메시지 또는 '요청 시간이 초과되었습니다'
}

// mutation 에러
const { error } = useApi<User, CreateUserDto>('/api/users', { method: 'POST' });
// JSX: {error && <p>에러: {error.message}</p>}
```

## ApiResponse 타입 참고

```typescript
type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
};
```

## ApiRequestConfig 옵션

```typescript
interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // 기본값: 'GET'
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number; // ms, 기본값: 30000
}
```
