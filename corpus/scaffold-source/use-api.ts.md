# 소스: src/core/hooks/use-api.ts

`useApi` 훅 전체 구현. `@axiom/hooks`로 임포트.

TanStack Query의 `useQuery`(조회)와 `useMutation`(변경)을 단일 인터페이스로 통합.
`type` 옵션 또는 `method` 값을 기반으로 어느 쪽 동작인지 자동 결정된다.

```typescript
import {
  useQuery,
  useMutation,
  type UseQueryResult,
  type UseQueryOptions,
  type UseMutationResult,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { callApi } from '../api/api';
import { createQueryKey } from '../query/query-key-factory';
import { getQueryClient } from '../query/query-client';
import type { THttpMethod, QueryParams } from '../types/api-types';

// ─── 옵션 타입 ────────────────────────────────────────────────────────────────

interface IUseApiBaseOptions {
  /** HTTP Method (기본값: 'GET') */
  method?: THttpMethod;
  /** Query string parameters */
  params?: QueryParams;
  /** Request body */
  body?: Record<string, unknown>;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request timeout (ms) */
  timeout?: number;
}

interface IUseApiQueryOptions<TData> extends IUseApiBaseOptions {
  /** 'query': useQuery 동작 (자동 실행, 캐싱) */
  type?: 'query';
  /** TanStack Query useQuery 옵션 (queryKey/queryFn 제외) */
  queryOptions?: Omit<UseQueryOptions<TData, Error, TData>, 'queryKey' | 'queryFn'>;
}

interface IUseApiMutationOptions<TData, TVariables> extends IUseApiBaseOptions {
  /** 'mutation': useMutation 동작 (수동 실행) */
  type: 'mutation';
  /** TanStack Query useMutation 옵션 (mutationFn 제외) */
  mutationOptions?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>;
}

// ─── 반환 타입 ────────────────────────────────────────────────────────────────

type UseApiMutationResult<TData, TVariables> = UseMutationResult<TData, Error, TVariables> & {
  /** 특정 endpoint의 TanStack Query 캐시를 무효화합니다 */
  invalidateQueries: (endpoint: string) => Promise<void>;
};

// ─── 오버로드 시그니처 ────────────────────────────────────────────────────────

/**
 * 조회용 오버로드 (type: 'query' 또는 생략)
 *
 * @example
 * // GET 조회 (type 생략 → query 자동)
 * const { data, isLoading } = useApi<User[]>('/api/users')
 *
 * // GET + params
 * const { data } = useApi<User>('/api/users', { params: { id: 1 } })
 *
 * // POST로 복잡한 검색 조회 (type 명시)
 * const { data } = useApi<SearchResult>('/api/search', {
 *   method: 'POST',
 *   body: { keyword: 'react' },
 *   type: 'query',
 * })
 */
function useApi<TData>(endpoint: string, options?: IUseApiQueryOptions<TData>): UseQueryResult<TData, Error>;

/**
 * 변경용 오버로드 (type: 'mutation')
 *
 * @example
 * // POST 생성
 * const { mutate, isPending } = useApi<User, CreateUserDto>('/api/users', { method: 'POST' })
 * mutate({ name: 'John', email: 'john@example.com' })
 *
 * // DELETE + 캐시 무효화
 * const { mutate, invalidateQueries } = useApi('/api/users/1', { method: 'DELETE' })
 * mutate({}, { onSuccess: () => invalidateQueries('/api/users') })
 */
function useApi<TData = unknown, TVariables = Record<string, unknown>>(
  endpoint: string,
  options: IUseApiMutationOptions<TData, TVariables>,
): UseApiMutationResult<TData, TVariables>;

// ─── 구현체 ───────────────────────────────────────────────────────────────────

function useApi<TData = unknown, TVariables = Record<string, unknown>>(
  endpoint: string,
  options?: IUseApiQueryOptions<TData> | IUseApiMutationOptions<TData, TVariables>,
): UseQueryResult<TData, Error> | UseApiMutationResult<TData, TVariables> {
  // type 기본값 결정:
  // - type이 명시된 경우 → 명시값 우선
  // - type 생략 + method가 없거나 GET → 'query'
  // - type 생략 + method가 POST/PUT/PATCH/DELETE → 'mutation'
  const resolvedType: 'query' | 'mutation' =
    options?.type ?? (!options?.method || options.method === 'GET' ? 'query' : 'mutation');

  const isQuery = resolvedType === 'query';
  const queryOpts = options as IUseApiQueryOptions<TData> | undefined;
  const mutationOpts = options as IUseApiMutationOptions<TData, TVariables> | undefined;

  // Rules of Hooks: 두 훅 모두 항상 호출하되, 비활성 쪽은 enabled: false 처리
  const queryResult = useQuery<TData, Error>({
    queryKey: createQueryKey(endpoint, (queryOpts?.body as QueryParams | undefined) ?? queryOpts?.params),
    queryFn: async () => {
      const response = await callApi<TData>(endpoint, {
        method: options?.method ?? 'GET',
        params: options?.params,
        body: options?.body,
        headers: options?.headers,
        timeout: options?.timeout,
      });
      return response.data as TData;
    },
    enabled: isQuery,
    ...queryOpts?.queryOptions,
  });

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const body = normalizeBody(variables);
      const response = await callApi<TData>(endpoint, {
        method: options?.method ?? 'POST',
        params: options?.params,
        body,
        headers: options?.headers,
        timeout: options?.timeout,
      });
      return response.data as TData;
    },
    ...(mutationOpts?.mutationOptions as Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> | undefined),
  });

  if (isQuery) {
    return queryResult;
  }

  return {
    ...mutation,
    invalidateQueries: (ep: string): Promise<void> =>
      getQueryClient().invalidateQueries({ queryKey: createQueryKey(ep) }),
  };
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/**
 * FormData를 일반 객체로 변환합니다.
 * File/Blob은 그대로 유지하고, 나머지는 string으로 변환합니다.
 */
function normalizeBody(variables: unknown): Record<string, unknown> {
  const v = variables as any;
  const isFormData = typeof FormData !== 'undefined' && typeof v === 'object' && v !== null && v instanceof FormData;

  if (isFormData) {
    const result: Record<string, unknown> = {};
    (v as FormData).forEach((value: FormDataEntryValue, key: string) => {
      const val = value as any;
      result[key] = val instanceof File || val instanceof Blob ? val : String(value);
    });
    return result;
  }
  return variables as Record<string, unknown>;
}

export { useApi };
export type { IUseApiQueryOptions, IUseApiMutationOptions, UseApiMutationResult };
```
