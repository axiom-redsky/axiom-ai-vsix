---
title: 라우팅 패턴
tags: [router, 라우터, route, 라우팅, navigate, 이동, hash, createhashrouter, loadable, 코드스플리팅]
scope: pattern
related: [patterns/domain-structure.md]
---

# 라우팅 패턴

scaffold는 `createHashRouter` 기반 해시 라우팅을 사용한다.
**`createBrowserRouter` 절대 사용 금지.** 항상 `createAppRouter()`를 경유한다.

## 왜 createHashRouter인가

폐쇄망·금융권 환경에서 서버 설정 변경 없이 동작하도록 해시 라우팅 사용.
URL 형태: `http://host/#/example/list`

## 임포트

```typescript
import { createAppRouter } from '@/core/router';
import type { TAppRoute } from '@/types/router';
```

## TAppRoute 타입

```typescript
// src/types/router/index.ts
import type { RouteObject } from 'react-router';

export type TAppRoute = RouteObject & {
  name?: string; // 페이지 이름 (선택)
};
```

## 도메인 라우터 파일 작성

```tsx
// src/domains/{name}/router/index.tsx
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

// 모든 페이지는 loadable()로 감싼다 — 코드 스플리팅
const MyListPage = loadable(() => import('@/domains/my-feature/pages/MyListPage'));
const MyDetailPage = loadable(() => import('@/domains/my-feature/pages/MyDetailPage'));

const routes: TAppRoute[] = [
  {
    path: 'list',
    element: <MyListPage />,
    name: '목록',
  },
  {
    path: 'detail/:id',
    element: <MyDetailPage />,
    name: '상세',
  },
];

export default routes;
```

## 루트 라우터에 등록

```tsx
// src/shared/router/index.tsx
import type { TAppRoute } from '@/types/router';
import RootLayout from '@/shared/components/layout/RootLayout';
import MainRouter from '@/domains/main/router';
import MyFeatureRouter from '@/domains/my-feature/router'; // 신규 추가

const routes: TAppRoute[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: MainRouter,
  },
  {
    path: '/my-feature',
    element: <RootLayout />,
    children: MyFeatureRouter,
  },
  {
    path: '*',
    element: <RootLayout />,
  },
];

export default routes;
```

최종 URL: `http://host/#/my-feature/list`

## App.tsx 연결

```tsx
// src/App.tsx
import { RouterProvider } from 'react-router';
import { createAppRouter } from '@/core/router';
import routes from '@/shared/router';
import { AppProviders } from '@/core/providers/AppProviders';

const router = createAppRouter(routes);

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
```

## 컴포넌트 내부 네비게이션

```tsx
import { useNavigate } from 'react-router';

function MyComponent() {
  const navigate = useNavigate();

  return (
    <Button onClick={() => navigate('/my-feature/list')}>
      목록으로
    </Button>
  );
}
```

## 컴포넌트 외부 네비게이션

```typescript
// 유틸 함수, 서비스 등 컴포넌트 외부에서
$router.push('/my-feature/list');
$router.replace('/login');
$router.back();
```

## 코드 스플리팅 — loadable

```typescript
import loadable from '@loadable/component';

// React.lazy()와 유사하지만 Suspense 없이도 동작
const MyPage = loadable(() => import('@/domains/my-feature/pages/MyPage'));
```

## 새 라우트 추가 체크리스트

1. `src/domains/{name}/pages/{Name}Page.tsx` 페이지 컴포넌트 생성
2. `src/domains/{name}/router/index.tsx` 라우터 파일 생성 (loadable + TAppRoute[])
3. `src/shared/router/index.tsx`에 도메인 라우터 등록
