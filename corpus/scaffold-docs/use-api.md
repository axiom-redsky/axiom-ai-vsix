# useApi 훅

`src/core/hooks/use-api.ts` | 임포트: `import { useApi } from '@axiom/hooks'`

TanStack Query의 `useQuery` / `useMutation`을 단일 훅으로 통합한 범용 HTTP 훅.
**scaffold에서 모든 API 호출은 이 훅을 통해서만 한다.**

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
