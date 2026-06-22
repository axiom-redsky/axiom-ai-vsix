---
title: "에러 처리 패턴"
category: pattern
tags: [error, 에러, 오류, error-handling, 에러처리, 오류처리, 예외, exception, try-catch, trycatch,
       isError, isPending, isLoading, error.message, ApiError, 에러메시지, 실패, fail, failure,
       errorboundary, error-boundary, 에러바운더리, fallback, 폴백, 폴백ui, 로딩, loading, skeleton,
       토스트, toast, 알림, $ui, 빈상태, empty, 빈화면, retry, 재시도, 토큰, token, 401, 인증헤더]
priority: 1
language: ko
scope: pattern
related: [patterns/use-api.md, scaffold-docs/api-client.md, utils/ui.md]
version: "1.0"
---

# 에러 처리 패턴

react-app-scaffold에서 API 호출·렌더링 중 발생하는 에러를 다루는 표준 패턴. 핵심 원칙은
**`useApi`를 쓰면 `try/catch` 없이 `error`·`isError` 필드로 분기**하고, 사용자 알림은
전역 **`$ui.alert`** 로 띄운다는 것이다.

관련: [useApi 훅](use-api.md) · [API 클라이언트](../scaffold-docs/api-client.md) · [전역 $ui](../utils/ui.md)

---

## 1. 조회(Query) 에러 — `error` 필드로 분기

`useApi` 조회는 `isPending`(로딩) / `error`(실패) / `data`(성공) 세 상태를 반환한다.
**로딩 → 에러 → 빈 상태 → 정상** 순으로 가드하는 것이 표준이다.

```tsx
import { useApi } from '@axiom/hooks';
import { Skeleton } from '@axiom/components/ui';

export default function UserListPage(): React.ReactNode {
  const { data, isPending, error } = useApi<TUser[]>('/api/users');

  // 1) 로딩 — 스켈레톤
  if (isPending) return <Skeleton className="h-40 w-full" />;

  // 2) 에러 — error.message (서버 메시지 또는 '요청 시간이 초과되었습니다')
  if (error) {
    return <p className="text-red-600 dark:text-red-400">불러오기 실패: {error.message}</p>;
  }

  // 3) 빈 상태
  if (!data || data.length === 0) {
    return <p className="text-gray-500">표시할 사용자가 없습니다.</p>;
  }

  // 4) 정상
  return <ul>{data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

> `error`는 `Error | null` 타입이다. `error.message`에는 서버 응답 메시지(`response.data.message`/`error`)
> 또는 타임아웃 메시지(`'요청 시간이 초과되었습니다'`, 기본 30초)가 담긴다. 메시지 결정 규칙은
> [API 클라이언트 문서](../scaffold-docs/api-client.md)의 "에러 응답 처리" 표 참고.

---

## 2. 변경(Mutation) 에러 — `onError` + `$ui.alert`

변경 요청 실패는 보통 **토스트/알림으로 사용자에게 알린다.** `mutationOptions.onError`에서
`$ui.alert`(type: `'error'`)를 띄우는 것이 스캐폴드 컨벤션이다.

```tsx
import { useApi } from '@axiom/hooks';

export default function UserCreatePage(): React.ReactNode {
  const { mutate, isPending } = useApi<TUser, TCreateUserBody>('/api/users', {
    method: 'POST',
    mutationOptions: {
      onSuccess: async () => {
        await $ui.alert('등록되었습니다.', { type: 'success', autoDismiss: 1200 });
      },
      onError: async (error) => {
        // error.message — 서버가 내려준 실패 사유
        await $ui.alert(error.message, { type: 'error', title: '등록 실패' });
      },
    },
  });

  return (
    <button onClick={() => mutate({ name: '홍길동' })} disabled={isPending}>
      {isPending ? '저장 중…' : '등록'}
    </button>
  );
}
```

- 알림은 `window.alert` 대신 전역 **`$ui.alert`** 를 쓴다(non-blocking·디자인 토큰·큐잉). [상세](../utils/ui.md)
- 인라인으로 보여줄 때는 `const { error } = useApi(...)` 의 `error && <p>{error.message}</p>` 패턴도 가능하다.

---

## 3. ErrorBoundary — 렌더 단계 예외

`useApi`의 `error`는 **데이터 요청 실패**를 다룬다. 반면 렌더 중 던져진 예외(`throw`)는
React **ErrorBoundary**(클래스 컴포넌트)로 잡는다. 페이지/위젯 단위로 감싸 fallback UI를 보여준다.

```tsx
import React from 'react';

interface IErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode },
  IErrorBoundaryState
> {
  state: IErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): IErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <p className="text-red-600">문제가 발생했습니다.</p>;
    }
    return this.props.children;
  }
}
```

```tsx
// 사용 — 위험한 위젯을 감싸 앱 전체 크래시를 막는다
<ErrorBoundary fallback={<DashboardError />}>
  <RevenueChart />
</ErrorBoundary>
```

> TanStack Query를 ErrorBoundary로 던지게 하려면 query에 `throwOnError: true`(queryOptions)를 줄 수 있다.
> 기본값은 `false`이며, 위 1번처럼 `error` 필드로 다루는 방식이 스캐폴드 기본이다.

---

## 4. 인증 토큰 / 401 (참고)

scaffold의 API 계층은 토큰 부착 지점을 **준비만 해 둔 상태**다(전용 로그인/보호 라우트 서브시스템은 기본 제공이 아님).
인증이 필요하면 `src/core/api/api.ts`의 토큰 위치를 채우거나 `BaseAxiosClient`의 요청 인터셉터에서 헤더를 추가한다.

```typescript
// src/core/api/api.ts — 토큰 부착 위치(placeholder)
const token: string | null = localStorage.getItem('access_token'); // 인증 필요 시

// 또는 src/core/api/api-client.ts 요청 인터셉터에서 공통 부착
private requestInterceptor(config: InternalAxiosRequestConfig) {
  const t = localStorage.getItem('access_token');
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
}
```

상세 위치·인터셉터 커스터마이징은 [API 클라이언트 문서](../scaffold-docs/api-client.md)의
"토큰 추가 위치"·"인터셉터 커스터마이징" 절 참고.

---

## 체크리스트

- [ ] 조회는 `isPending` → `error` → 빈 상태 → 정상 순으로 가드한다.
- [ ] `useApi` 에러는 `try/catch` 없이 `error` 필드로 다룬다.
- [ ] 변경 실패는 `onError`에서 `$ui.alert(error.message, { type: 'error' })` 로 알린다.
- [ ] 렌더 예외는 `ErrorBoundary`로 감싸 fallback UI를 제공한다.
- [ ] 알림은 `window.alert`이 아니라 전역 `$ui` 를 쓴다.
