---
title: react-app-scaffold 공통 훅 목록
version: "1.0"
tags: [훅, 훅목록, 훅 목록, hook, hooks, 커스텀훅, custom-hook, 공통훅, 제공하는훅, 사용가능한훅, 어떤훅,
       useapi, usetheme, usesidebar, use-api, 훅종류, 훅리스트, hook-list, 훅뭐있어]
scope: scaffold
related: [patterns/use-api.md, patterns/use-api-example.md, catalog/overview.md]
---

# 공통 훅 목록 (react-app-scaffold)

react-app-scaffold가 기본 제공하는 커스텀 훅이다. 업무 개발자가 직접 쓰는 것은 **`useApi`** 가 핵심이며, 나머지는 테마·레이아웃 전용이다.

| 훅 | import | 용도 | 상세 |
|----|--------|------|------|
| `useApi` | `@axiom/hooks` | TanStack Query 기반 데이터 조회/변경(쿼리·뮤테이션). 앱 개발자용 표준 API 훅 | [use-api.md](../patterns/use-api.md) |
| `useTheme` | `@/core/hooks/theme/useTheme` | 라이트/다크 테마 상태·토글 (`ThemeProvider` 하위에서만) | — |
| `useSidebar` | (레이아웃 내부) `../hooks/useSidebar` | 사이드바 열림·서브메뉴 상태. 레이아웃 컴포넌트 전용 | — |

> ⛔ React 기본 훅(`useState`·`useEffect`·`useCallback`·`useMemo`)은 스캐폴드 제공이 아니라 React 표준이다.

## useApi — 데이터 조회/변경 (앱 개발자 표준)

```ts
import { useApi } from '@axiom/hooks';

// 조회(GET) — TanStack Query useQuery 래핑
const { data, isLoading, refetch } = useApi<IUser[]>({
  method: 'GET',
  url: '/users',
  queryKey: ['users'],
});

// 변경(POST/PUT/DELETE) — useMutation 래핑
const { mutate, isPending } = useApi<IUser, ICreateUserBody>({
  method: 'POST',
  url: '/users',
  onSuccess: () => { /* invalidate 등 */ },
});
```

- 타입: `IUseApiQueryOptions`, `IUseApiMutationOptions` (`@axiom/hooks`에서 export)
- 자세한 계약·예제는 [use-api.md](../patterns/use-api.md), [use-api-example.md](../patterns/use-api-example.md) 참고.

## useTheme — 테마 상태

```ts
import { useTheme } from '@/core/hooks/theme/useTheme';

const { theme, toggleTheme, setTheme } = useTheme();
// theme: 'light' | 'dark'
// toggleTheme(): 라이트↔다크 전환
// setTheme('dark'): 명시적 지정
```

- 반드시 `ThemeProvider` 하위에서 호출(아니면 throw). 보통 `ThemeToggleButton` 등 레이아웃 컴포넌트에서 사용.

## useSidebar — 사이드바 상태 (레이아웃 전용)

```ts
import { useSidebar } from '../hooks/useSidebar';

const {
  openSubmenu, toggleSidebar, toggleMobileSidebar,
  setIsHovered, setActiveItem, toggleSubmenu,
} = useSidebar();
```

- `SidebarProvider` 하위 레이아웃(`AppHeader`·`AppSidebar` 등) 내부에서만 사용한다. 업무 페이지에서 직접 쓸 일은 거의 없다.
