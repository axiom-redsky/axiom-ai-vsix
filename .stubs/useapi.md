---
keywords: [useapi, usefetch, api 호출, api hook, api 훅, fetch hook, fetch 훅]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## useApi 훅

`import { useApi } from '@axiom/hooks'`

TanStack Query 기반 범용 HTTP 훅. **모든 API 호출은 이 훅을 통해서만 한다.**

`method` 값으로 동작이 자동 결정된다.

| 조건 | 동작 |
|------|------|
| `method` 생략 또는 `'GET'` | `useQuery` — 마운트 시 자동 실행, 캐싱 |
| `method: 'POST'/'PUT'/'PATCH'/'DELETE'` | `useMutation` — `mutate()` 호출 시 수동 실행 |

### GET 조회

```typescript
const { data, isPending, error, refetch } = useApi<Post[]>('/api/posts');
```

### GET + query params

```typescript
const { data } = useApi<User>('/api/users', {
  params: { id: 1, status: 'active' },
});
// 실제 요청: GET /api/users?id=1&status=active
```

### POST 생성

```typescript
const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', {
  method: 'POST',
});

mutate({ name: '홍길동', email: 'hong@example.com' });
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
      await invalidateQueries('/api/users');
    },
  }
);
```

### enabled (조건부 실행)

```typescript
const { data } = useApi<Config>('/api/config', {
  queryOptions: { enabled: !!userId },
});
```
