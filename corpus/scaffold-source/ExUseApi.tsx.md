# 소스: src/domains/example/pages/use-api/ExUseApi.tsx

`useApi` 훅의 완전한 실사용 예제.
GET 조회 + POST 생성 + invalidateQueries 패턴을 모두 포함한다.

## 핵심 패턴 요약

```typescript
// 1. 타입 정의
type TPost = { userId: number; id: number; title: string; body: string };
type TCreatePost = { title: string; body: string; userId: number };

// 2. GET 조회 (type 생략 → query 자동)
const { data: posts, isPending, error, refetch, isFetching } =
  useApi<TPost[]>('/posts');

// 3. POST 변경 (type: 'mutation' 명시)
const { mutate, isPending: isPosting, data: postResult, error: postError, reset, invalidateQueries } =
  useApi<TCreatePost & { id?: number }, TCreatePost>('/posts', {
    method: 'POST',
    type: 'mutation',
  });

// 4. mutate 실행 + 성공 후 캐시 무효화
mutate(
  { title: '제목', body: '내용', userId: 1 },
  {
    onSuccess: async () => {
      await invalidateQueries('/posts'); // GET /posts 캐시 갱신
    },
  }
);
```

## 전체 소스

```tsx
import { useApi } from '@axiom/hooks';

type TJsonPlaceholderPost = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

type TJsonPlaceholderCreate = {
  title: string;
  body: string;
  userId: number;
};

export default function ExUseApi(): React.ReactNode {
  const POSTS_ENDPOINT = '/posts' as const;

  /** GET 조회 */
  const { data: posts, isPending, error, refetch, isFetching } =
    useApi<TJsonPlaceholderPost[]>(POSTS_ENDPOINT);

  /** POST 변경 */
  const {
    mutate,
    isPending: isPosting,
    data: postResult,
    error: postError,
    reset: resetMutation,
    invalidateQueries,
  } = useApi<TJsonPlaceholderCreate & { id?: number }, TJsonPlaceholderCreate>(
    POSTS_ENDPOINT,
    { method: 'POST', type: 'mutation' }
  );

  const handlePostDemo = (): void => {
    mutate(
      { title: 'useApi 예제 POST', body: 'mock 응답입니다.', userId: 1 },
      {
        onSuccess: async () => {
          await invalidateQueries(POSTS_ENDPOINT);
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      {/* GET 결과 */}
      {isPending ? (
        <p className="text-sm text-gray-500">로딩 중…</p>
      ) : error ? (
        <p className="text-sm text-red-600">에러: {error.message}</p>
      ) : (
        <ul className="space-y-2">
          {posts?.slice(0, 8).map((p) => (
            <li key={p.id} className="rounded-xl border px-3 py-2">
              <p className="text-sm font-medium">{p.title}</p>
            </li>
          ))}
        </ul>
      )}

      {/* refetch 버튼 */}
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="rounded-xl border px-4 py-2 text-sm"
      >
        {isFetching ? '다시 가져오는 중…' : '다시 가져오기'}
      </button>

      {/* POST 버튼 */}
      <button
        onClick={handlePostDemo}
        disabled={isPosting}
        className="rounded-xl bg-brand-600 px-4 py-2 text-sm text-white"
      >
        {isPosting ? '요청 중…' : 'POST 실행'}
      </button>

      {/* POST 결과 */}
      {postError && <p className="text-sm text-red-600">에러: {postError.message}</p>}
      {postResult && (
        <pre className="text-xs font-mono">{JSON.stringify(postResult, null, 2)}</pre>
      )}

      <button onClick={() => resetMutation()}>응답 초기화</button>
    </div>
  );
}
```
