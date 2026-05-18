---
title: 네이밍 규칙
tags: [naming, 이름, 네이밍, 규칙, convention, 파일명, 컴포넌트명, 훅명, import, alias, 앨리어스]
scope: convention
---

# 네이밍 규칙

## 파일 네이밍

| 종류 | 규칙 | 예시 |
|------|------|------|
| 페이지 컴포넌트 | PascalCase + Page | `UserListPage.tsx`, `OrderDetailPage.tsx` |
| 일반 컴포넌트 | PascalCase | `UserCard.tsx`, `OrderSummary.tsx` |
| 훅 | camelCase + use 접두사 | `useUserList.ts`, `useOrderFilter.ts` |
| 타입 파일 | kebab-case | `user.type.ts`, `order-detail.type.ts` |
| 라우터 인덱스 | index.tsx | `router/index.tsx` |
| 도메인 API | kebab-case | `user.api.ts` |

## 변수·타입 네이밍

| 종류 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `UserCard`, `OrderForm` |
| 훅 | camelCase + use | `useUserList`, `useOrderMutation` |
| 타입/인터페이스 | T 또는 I 접두사 | `TUser`, `IApiConfig`, `TAppRoute` |
| 상수 | UPPER_SNAKE_CASE | `API_TIMEOUT`, `MAX_RETRY` |
| 일반 변수 | camelCase | `userName`, `orderList` |

## 임포트 앨리어스 규칙

```typescript
// UI 컴포넌트 — @axiom/components/ui
import { Button, Input, Label } from '@axiom/components/ui';
import { Table, TableBody, TableCell } from '@axiom/components/ui';
import { Dialog, DialogContent } from '@axiom/components/ui';

// hooks — @axiom/hooks
import { useApi } from '@axiom/hooks';

// 내부 경로 — @/ (src/ 기준)
import type { TAppRoute } from '@/types/router';
import { getQueryClient } from '@/core/query/query-client';
import { createAppRouter } from '@/core/router';

// 타입 전용 임포트
import type { TUser } from '@/domains/user/types/user.type';
```

## 금지 패턴

```typescript
// INCORRECT — 상대경로 임포트 절대 금지
import { Button } from '../../shared/components/shadcn/components/ui/button';
import { useApi } from '../../../core/hooks/use-api';

// INCORRECT — useQuery/useMutation 직접 사용 금지
import { useQuery, useMutation } from '@tanstack/react-query';

// INCORRECT — createBrowserRouter 사용 금지
import { createBrowserRouter } from 'react-router';
```

## 코드 주석

코드 주석은 **한국어**로 작성한다.

```typescript
// 사용자 목록을 가져오는 훅
const { data: users } = useApi<User[]>('/api/users');

// 삭제 성공 시 목록 캐시 무효화
await invalidateQueries('/api/users');
```

## 도메인 폴더명

도메인 폴더는 **kebab-case**로 작성한다.

```
src/domains/
├── my-feature/    ← kebab-case
├── user-management/
└── order-history/
```

## export 패턴

```typescript
// 페이지 컴포넌트 — default export
export default function UserListPage() { ... }

// 훅, 유틸 — named export
export function useUserList() { ... }
export const getQueryClient = () => { ... }

// 타입 — named export with type
export type { TUser };
export interface IApiConfig { ... }
```
