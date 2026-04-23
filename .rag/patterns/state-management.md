---
title: 상태 관리 패턴
tags: [zustand, store, 상태, state, 전역, context, provider, 프로바이더, queryClient]
scope: pattern
related: [patterns/api-call.md]
---

# 상태 관리 패턴

scaffold에서 상태는 크게 세 가지로 분류된다.

| 상태 종류 | 도구 | 위치 |
|----------|------|------|
| 서버 상태 (API 데이터) | `useApi` (TanStack Query) | `@axiom/hooks` |
| 전역 UI 상태 | React Context 또는 Zustand | `core/context/` 또는 `core/store/` |
| 로컬 컴포넌트 상태 | `useState`, `useReducer` | 컴포넌트 내부 |

## 서버 상태 — useApi (권장)

모든 API 데이터는 `useApi`가 내부적으로 TanStack Query 캐시에 저장한다.

```typescript
import { useApi } from '@axiom/hooks';

// GET — 자동 캐싱
const { data, isLoading } = useApi<User[]>('/api/users');

// 캐시 무효화 (다른 쿼리 갱신)
const { mutate, invalidateQueries } = useApi('/api/users', { method: 'POST' });
mutate(newUser, {
  onSuccess: async () => {
    await invalidateQueries('/api/users');
  },
});
```

## 컴포넌트 외부에서 캐시 무효화

```typescript
import { getQueryClient } from '@/core/query/query-client';

// 서비스·유틸 함수에서 캐시 무효화
await getQueryClient().invalidateQueries({ queryKey: ['api', '/api/users'] });
```

## AppProviders — Provider 등록 위치

모든 전역 Provider는 `src/core/providers/AppProviders.tsx`에 중첩한다.

```tsx
// src/core/providers/AppProviders.tsx
import type { ReactNode } from 'react';
import { QueryProvider } from './query-client/QueryProvider';
import { ThemeProvider } from './theme/ThemeProvider'; // 신규 Provider 예시

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>      {/* 바깥 → 안쪽: 의존 관계 고려 */}
      <QueryProvider>
        {children}
      </QueryProvider>
    </ThemeProvider>
  );
}
```

**규칙:** Provider 구현 파일은 `src/core/providers/{name}/` 아래에 둔다.

## React Context 패턴 (UI 전역 상태)

```typescript
// src/core/context/ThemeContext.tsx
import { createContext, useContext, useState } from 'react';

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark((v) => !v) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

## Zustand 패턴 (복잡한 전역 상태)

scaffold에 Zustand가 포함된 경우:

```typescript
// src/core/store/uiStore.ts
import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
```

```tsx
// 컴포넌트에서 사용
import { useUiStore } from '@/core/store/uiStore';

function AppSidebar() {
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  // ...
}
```

## QueryProvider 구조

```tsx
// src/core/providers/query-client/QueryProvider.tsx
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

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
