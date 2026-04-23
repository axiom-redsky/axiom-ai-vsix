---
title: Table 컴포넌트
tags: [table, 테이블, 목록, list, grid, 데이터, row, column]
scope: component
---

# Table 컴포넌트

## 임포트

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@axiom/components/ui';
```

## 기본 사용 예시

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@axiom/components/ui';

interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
}

function UserTable({ data }: { data: User[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead>이메일</TableHead>
          <TableHead>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.status === 'active' ? '활성' : '비활성'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

## useApi와 조합한 패턴

```tsx
import { useApi } from '@axiom/hooks';
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@axiom/components/ui';
import { Skeleton } from '@axiom/components/ui';

function UserListPage() {
  const { data, isLoading, error } = useApi<User[]>('/api/users');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500">에러: {error.message}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead>이메일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

## 빈 데이터 처리

```tsx
<TableBody>
  {data && data.length > 0 ? (
    data.map((item) => (
      <TableRow key={item.id}>
        <TableCell>{item.name}</TableCell>
      </TableRow>
    ))
  ) : (
    <TableRow>
      <TableCell colSpan={3} className="text-center text-gray-500">
        데이터가 없습니다.
      </TableCell>
    </TableRow>
  )}
</TableBody>
```
