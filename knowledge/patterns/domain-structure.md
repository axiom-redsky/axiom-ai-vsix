---
title: 도메인 구조 규칙
tags: [domain, 도메인, page, 페이지, 업무, biz, folder, 신규도메인, 새도메인, feature]
scope: pattern
related: [scaffold/project-structure.md, patterns/router.md]
---

# 도메인(업무) 구조 규칙

새 업무 기능은 반드시 `src/domains/{도메인명}/` 아래에 생성한다.

## 폴더 구조

```
src/domains/{도메인명}/
├── pages/
│   └── {도메인명}Page.tsx       ← 실제 페이지 컴포넌트
│   └── {도메인명}DetailPage.tsx ← 상세 페이지 (선택)
└── router/
    └── index.tsx                ← TAppRoute[] 배열 export default
```

## 파일 네이밍 규칙

| 파일 종류 | 예시 |
|----------|------|
| 페이지 컴포넌트 | `UserListPage.tsx`, `UserDetailPage.tsx` |
| 라우터 | `router/index.tsx` |
| 도메인 전용 컴포넌트 | `components/UserCard.tsx` |
| 도메인 전용 훅 | 도메인 내 `hooks/useUserFilter.ts` 등 |

## 신규 도메인 생성 순서

1. `src/domains/{name}/pages/{Name}Page.tsx` 페이지 컴포넌트 생성
2. `src/domains/{name}/router/index.tsx` 라우터 파일 생성
3. `src/shared/router/index.tsx`에 도메인 라우터 등록

## 페이지 컴포넌트 기본 구조

```tsx
// src/domains/user/pages/UserListPage.tsx
import { useApi } from '@axiom/hooks';
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@axiom/components/ui';
import { Button } from '@axiom/components/ui';

interface User {
  id: number;
  name: string;
  email: string;
}

export default function UserListPage(): React.ReactNode {
  const { data, isLoading, error } = useApi<User[]>('/api/users');

  if (isLoading) return <div>로딩 중...</div>;
  if (error) return <p className="text-red-500">에러: {error.message}</p>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          사용자 목록
        </h1>
        <Button>신규 등록</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm">상세</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

## 도메인 라우터 파일

```tsx
// src/domains/user/router/index.tsx
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const UserListPage = loadable(() => import('@/domains/user/pages/UserListPage'));
const UserDetailPage = loadable(() => import('@/domains/user/pages/UserDetailPage'));

const routes: TAppRoute[] = [
  {
    path: 'list',
    element: <UserListPage />,
    name: '사용자 목록',
  },
  {
    path: 'detail/:id',
    element: <UserDetailPage />,
    name: '사용자 상세',
  },
];

export default routes;
```

## 루트 라우터에 등록

```tsx
// src/shared/router/index.tsx에 추가
import UserRouter from '@/domains/user/router';

const routes: TAppRoute[] = [
  // ... 기존 라우터
  {
    path: '/user',
    element: <RootLayout />,
    children: UserRouter,
  },
];
```

최종 URL: `http://host/#/user/list`

## 레이어 규칙 준수

- `domains/user`에서 `domains/order` 직접 import 금지
- 공통 유틸·컴포넌트는 `shared/`에 위치
- API 훅은 `useApi` 하나로 통일 (`useQuery`/`useMutation` 직접 사용 금지)
- 임포트는 항상 앨리어스 사용 (`@axiom/hooks`, `@axiom/components/ui`, `@/`)
