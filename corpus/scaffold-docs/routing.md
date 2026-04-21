# 라우팅 패턴

scaffold는 `createHashRouter` 기반 해시 라우팅을 사용한다.

---

## 왜 createHashRouter인가?

```typescript
// src/core/router/app-common-router.ts
export const createAppRouter = (routes: TAppRoute[], opts?: DOMRouterOpts) => {
  // createBrowserRouter는 서버 설정이 필요 (모든 경로를 index.html로 리다이렉트)
  // 폐쇄망·금융권 환경에서는 서버 설정 변경이 어렵기 때문에 사용하지 않는다.
  return createHashRouter(routes, opts);
};
```

**`createBrowserRouter` 절대 사용 금지.** 항상 `createAppRouter()`를 경유한다.
URL 형태: `http://host/#/example/use-api`

---

## TAppRoute 타입

```typescript
// src/types/router/index.ts
import type { RouteObject } from 'react-router';

export type TAppRoute = RouteObject & {
  name?: string; // 페이지 이름 (선택)
};
```

`RouteObject`의 모든 필드를 그대로 사용하고, `name` 필드만 추가된 확장 타입.

---

## 코드 스플리팅 — loadable

라우트의 모든 페이지 컴포넌트는 `@loadable/component`의 `loadable()`로 감싼다.

```typescript
import loadable from '@loadable/component';

const MyPage = loadable(() => import('@/domains/my-feature/pages/MyPage'));
```

**이유:** 초기 번들 크기를 줄이고, 해당 라우트에 진입할 때만 청크를 다운로드한다.
`React.lazy()`와 유사하지만 `Suspense` 없이도 동작한다.

---

## 도메인 라우터 파일 구조

### 도메인 라우터 (`src/domains/{name}/router/index.tsx`)

```typescript
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

// loadable로 페이지를 lazy import
const MyPage = loadable(() => import('@/domains/my-feature/pages/MyPage'));
const MyDetailPage = loadable(() => import('@/domains/my-feature/pages/MyDetailPage'));

const routes: TAppRoute[] = [
  {
    path: 'list',         // 이 도메인의 상대 경로
    element: <MyPage />,
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

### 루트 라우터 (`src/shared/router/index.tsx`)

새 도메인을 추가할 때 이 파일에 등록한다.

```typescript
import type { TAppRoute } from '@/types/router';
import RootLayout from '@/shared/components/layout/RootLayout';
import MainRouter from '@/domains/main/router';
import ExampleRouter from '@/domains/example/router';
import MyFeatureRouter from '@/domains/my-feature/router'; // 신규 추가

const routes: TAppRoute[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: MainRouter,
  },
  {
    path: '/example',
    element: <RootLayout />,
    children: ExampleRouter,
  },
  // 신규 도메인 라우터 추가
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

**최종 URL 예시:** `http://host/#/my-feature/list`

---

## 앱 진입점 라우터 연결 (`src/App.tsx`)

```typescript
import { RouterProvider } from 'react-router';
import { createAppRouter } from '@/core/router';
import routes from '@/shared/router';

const router = createAppRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
```

---

## 전역 $router 객체

컴포넌트 외부(유틸 함수, 서비스 등)에서 라우팅이 필요할 때 `$router`를 사용한다.

```typescript
// 컴포넌트 외부에서 이동
$router.push('/my-feature/list');
$router.replace('/login');
$router.back();
```

컴포넌트 내부에서는 React Router의 `useNavigate()`를 사용한다.

---

## 새 라우트 추가 체크리스트

1. `src/domains/{name}/pages/MyPage.tsx` 페이지 컴포넌트 생성
2. `src/domains/{name}/router/index.tsx` 라우터 파일 생성 (loadable + TAppRoute[])
3. `src/shared/router/index.tsx`에 도메인 라우터 등록 (`path: '/name'`, `children: MyRouter`)
