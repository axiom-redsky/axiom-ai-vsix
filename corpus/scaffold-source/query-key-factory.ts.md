# 소스: src/core/query/query-key-factory.ts

TanStack Query의 queryKey 생성 유틸리티.

`useApi` 훅 내부에서 자동으로 호출되며, 직접 사용할 일은 거의 없다.

## 동작 방식

endpoint를 `/`로 분리해 배열로 만들고, params가 있으면 마지막 요소로 추가.

```
'/api/users'           → ['api', 'users']
'/api/users?id=1'      → ['api', 'users', { id: 1 }]
'/api/posts/5'         → ['api', 'posts', '5']
```

`invalidateQueries('/api/users')`를 호출하면 `/api/users`, `/api/users?id=1` 등 해당 경로의 모든 캐시가 무효화된다.

## 소스 코드

```typescript
import type { QueryParams } from '../types/api-types';

export const createQueryKey = (endpoint: string, params?: QueryParams): readonly unknown[] => {
  // endpoint를 '/'로 분리하여 배열로 변환
  const pathSegments = endpoint.split('/').filter(Boolean);

  if (!params || Object.keys(params).length === 0) {
    return pathSegments;
  }

  // undefined/null 값 제거 후 params 추가
  const cleanParams = Object.entries(params).reduce<QueryParams>((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Object.keys(cleanParams).length === 0) {
    return pathSegments;
  }

  return [...pathSegments, cleanParams] as const;
};
```
