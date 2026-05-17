---
keywords: [refetch, useapi error, useapi data, useapi refetch, issuccess, iserror, isloading]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## useApi — data / error / refetch 상세

### data — 응답 데이터

`data`는 성공 시 응답 본문, 로딩 중엔 `undefined`입니다.

```typescript
const { data, isPending } = useApi<Post[]>('/api/posts');

if (isPending) return <Spinner />;

return <ul>{data?.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
```

### error — 에러 처리

`error`는 `Error` 인스턴스, 성공/로딩 중엔 `null`입니다.

```typescript
const { data, error } = useApi<User>('/api/users/1');

if (error) {
  return <div>오류: {error.message}</div>;
}
```

### refetch — 수동 재요청

`refetch()`를 호출하면 캐시를 무시하고 즉시 재요청합니다.

```typescript
const { data, refetch } = useApi<Stats>('/api/stats');

return (
  <div>
    <p>총 항목: {data?.count}</p>
    <button onClick={() => refetch()}>새로고침</button>
  </div>
);
```

### data + error + refetch 동시에 사용

```typescript
const { data, error, refetch, isPending } = useApi<Report[]>('/api/reports');

if (isPending) return <Spinner />;
if (error) return <ErrorBanner message={error.message} onRetry={refetch} />;

return <ReportList items={data ?? []} onRefresh={refetch} />;
```

### isSuccess / isError 상태 플래그

```typescript
const { data, isSuccess, isError, error } = useApi<Config>('/api/config');

// isSuccess: 데이터 정상 수신 완료
// isError: 요청 실패 (error에 원인 담김)
if (isSuccess) console.log('설정 로드 완료', data);
if (isError)   console.error('설정 로드 실패', error?.message);
```
