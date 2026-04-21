# Provider 패턴

---

## AppProviders — 모든 Provider의 통합 지점

`src/core/providers/AppProviders.tsx`

```typescript
import type { ReactNode } from 'react';
import { QueryProvider } from './query-client/QueryProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
```

**앱의 모든 전역 Provider는 이 컴포넌트 안에서 중첩한다.**
Provider 순서는 의존성을 고려해 배치한다 (의존되는 Provider가 바깥쪽).

---

## App.tsx 연결

```tsx
// src/App.tsx
import { AppProviders } from '@/core/providers/AppProviders';
import { RouterProvider } from 'react-router';
import { createAppRouter } from '@/core/router';
import routes from '@/shared/router';

const router = createAppRouter(routes);

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
```

---

## QueryProvider

`src/core/providers/query-client/QueryProvider.tsx`

TanStack Query의 `QueryClientProvider`를 래핑.

```tsx
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  // DevTools Extension 연동용
  useEffect(() => {
    window.__TANSTACK_QUERY_CLIENT__ = queryClient;
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

- `getQueryClient()`는 `src/core/providers/query-client/query-client-config.ts`에서 싱글턴으로 관리
- 개발 환경(`DEV`)에서만 `ReactQueryDevtools`가 렌더링된다

---

## 새 Provider 추가 방법

예: `ThemeProvider`를 추가하는 경우

```tsx
// src/core/providers/AppProviders.tsx
import type { ReactNode } from 'react';
import { QueryProvider } from './query-client/QueryProvider';
import { ThemeProvider } from './theme/ThemeProvider'; // 신규 추가

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>          {/* 바깥 → 안쪽 순서: 의존 관계 고려 */}
      <QueryProvider>
        {children}
      </QueryProvider>
    </ThemeProvider>
  );
}
```

**규칙:** Provider 구현 파일은 `src/core/providers/{name}/` 아래에 둔다.

---

## LayoutDefaultSidebarProvider (레이아웃 전용)

`src/core/providers/layout/default/LayoutDefaultSidebarProvider.tsx`

사이드바 열림/닫힘 상태를 관리하는 Context Provider.
`RootLayout` 내부에서만 사용하며, AppProviders에 포함하지 않는다.

```tsx
// RootLayout에서 사용
<LayoutDefaultSidebarProvider>
  <AppHeader />
  <AppSidebar />
  <main>{children}</main>
</LayoutDefaultSidebarProvider>
```

---

## QueryClient 설정

`src/core/providers/query-client/query-client-config.ts` 또는
`src/core/query/query-client.ts`에서 QueryClient를 싱글턴으로 관리.

`getQueryClient()`를 통해 컴포넌트 외부에서도 접근 가능하다.

```typescript
import { getQueryClient } from '@/core/query/query-client';

// 컴포넌트 외부에서 캐시 무효화
await getQueryClient().invalidateQueries({ queryKey: ['api', 'posts'] });
```

`useApi`의 `invalidateQueries`가 내부적으로 이를 사용한다.
