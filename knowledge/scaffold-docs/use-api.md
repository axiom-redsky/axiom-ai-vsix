---
title: "useApi 훅"
category: pattern
tags: [useApi, use-api, "@axiom/hooks", query, mutation, get, post, put, delete, patch, 조회, 생성, 수정, 삭제, cache, 캐시, invalidate, enabled, 조건부, tanstack, useQuery, useMutation, 훅, envelope, 봉투, 응답구조, response-shape, unwrap, 언랩, data, 제네릭, generic]
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

## ⚠️ 봉투(Envelope) 계약 — `data`는 **서버 응답 바디 그대로**다

`useApi<T>`가 돌려주는 `data`는 **서버가 그 엔드포인트에 대해 내려준 HTTP 응답 바디 전체**다.
scaffold는 서버의 응답 봉투를 **벗기지 않는다.** 따라서 **제네릭 `T`는 스펙 Response 예시의 바디 모양과 1:1로 맞춰야** 한다.

> **왜 안 벗기나 (내부 동작):** `callApi` → `request<T>`가 서버 바디를 scaffold 내부 봉투(`ApiResponse = { success, data, statusCode }`)로 감쌌다가, `useApi`의 queryFn이 다시 `response.data`로 풀어 **서버 바디만** 반환한다. 즉 scaffold **내부** 봉투는 컴포넌트에 도달하지 않고(감싸기↔풀기 상쇄), **서버** 봉투는 그대로 통과한다. 둘 다 `{ success, data }`처럼 생겨 헷갈리니 혼동 금지.

**봉투 모양은 SI 사이트/엔드포인트마다 다르다.** 하드코딩하지 말고 **스펙 Response를 보고** T를 정하라:

| 스펙 Response 바디 | 제네릭 `T` | 목록/필드 꺼내기 |
|---|---|---|
| 바로 배열 `[ {...}, ... ]` | `useApi<TPost[]>` | `const items = data ?? []` |
| `{ data: [...], meta }` | `useApi<{ data: TPost[]; meta: TMeta }>` | `const items = data?.data ?? []` |
| `{ success, result: [...] }` | `useApi<{ result: TPost[] }>` | `const items = data?.result ?? []` |
| 단건 `{ id, name, ... }` | `useApi<TUser>` | `data?.name` |

> 아래 예제들이 `useApi<Post[]>`처럼 **바로 배열**로 쓰는 건, 예제 백엔드(jsonplaceholder)가 봉투 없이 배열을 주기 때문이다. 실제 SI 백엔드가 `{ success, data, meta }`로 감싸면 **T도 그 봉투를 포함**해야 하고 목록은 `data?.data`로 꺼낸다. "예제가 배열이니 내 API도 배열"이라 넘겨짚지 말고 반드시 **스펙 Response를 확인**하라.

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

### 기본 GET

```typescript
const { data, isLoading, error } = useApi<Post[]>('/api/posts');
```

### GET + query string params

```typescript
const { data } = useApi<User>('/api/users', {
  params: { id: 1, status: 'active' },
});
// 실제 요청: GET /api/users?id=1&status=active
```

### POST이지만 조회 목적 (type 명시)

```typescript
const { data } = useApi<SearchResult>('/api/search', {
  method: 'POST',
  body: { keyword: 'react' },
  type: 'query',
});
```

### queryOptions 전달 (staleTime, enabled 등)

```typescript
const { data } = useApi<Config>('/api/config', {
  queryOptions: {
    staleTime: 1000 * 60 * 5, // 5분
    enabled: !!userId,         // 조건부 실행
  },
});
```

### 반환값 주요 필드

```typescript
const {
  data,        // TData | undefined
  isLoading,   // 최초 로딩
  isPending,   // 데이터 없는 로딩 상태
  isFetching,  // 백그라운드 재조회 포함
  error,       // Error | null
  refetch,     // 수동 재조회 함수
} = useApi<Post[]>('/api/posts');
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

### POST 생성

```typescript
const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', {
  method: 'POST',
});

mutate({ name: '홍길동', email: 'hong@example.com' });
```

### PUT 수정

```typescript
const { mutate } = useApi<User, UpdateUserDto>('/api/users/1', {
  method: 'PUT',
});
```

### DELETE + 캐시 무효화

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

### mutationOptions 전달 (onSuccess, onError)

```typescript
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

### 반환값 주요 필드

```typescript
const {
  mutate,            // (variables: TVariables) => void
  mutateAsync,       // Promise 반환 버전
  isPending,         // 요청 진행 중
  data,              // TData | undefined (성공 응답)
  error,             // Error | null
  reset,             // 상태 초기화
  invalidateQueries, // (endpoint: string) => Promise<void>
} = useApi<User, CreateUserDto>('/api/users', { method: 'POST' });
```

---

## invalidateQueries

mutation 성공 후 다른 query의 캐시를 무효화(재조회 트리거)한다.

```typescript
const { mutate, invalidateQueries } = useApi<void, { id: number }>('/api/posts', {
  method: 'DELETE',
});

mutate(
  { id: 5 },
  {
    onSuccess: async () => {
      await invalidateQueries('/api/posts'); // POST 목록 캐시 무효화
    },
  }
);
```

`invalidateQueries`는 `@axiom/hooks`의 `useApi`가 반환하는 확장 필드다.
`useQueryClient().invalidateQueries()`를 직접 호출하지 않는다.

---

## normalizeBody (내부 동작)

`mutate(variables)`에 `FormData`를 전달하면 자동으로 일반 객체로 변환된다.
`File` / `Blob` 값은 변환 없이 그대로 유지된다.

---

## 에러 처리

```typescript
const { error } = useApi<Post[]>('/api/posts');

if (error) {
  // error.message — 서버 응답 메시지 또는 '요청 시간이 초과되었습니다'
  console.error(error.message);
}
```

mutation 에러:

```typescript
const { mutate, error } = useApi<User, CreateUserDto>('/api/users', {
  method: 'POST',
});

// JSX에서
{error && <p>에러: {error.message}</p>}
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
