---
title: "@tanstack/react-table 테이블 상태 관리"
version: "^8.21"
tags: [react-table, tanstack-table, useReactTable, ColumnDef, columnHelper, 테이블정렬, 테이블필터, pagination]
scope: library
related: [components/Table.md, patterns/use-api.md]
---

# @tanstack/react-table

react-app-scaffold에 `@tanstack/react-table ^8.21`이 설치되어 있다. 테이블 상태(정렬, 필터, 페이지네이션)를 관리하는 헤드리스 라이브러리다. UI 렌더링은 기존 `Table` 컴포넌트(`@axiom/components/ui`)와 함께 사용한다.

## ColumnDef 정의 (createColumnHelper 방식)

```tsx
import { createColumnHelper } from '@tanstack/react-table';

type TUser = { id: number; name: string; email: string; status: string };

const columnHelper = createColumnHelper<TUser>();

const columns = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('name', { header: '이름' }),
  columnHelper.accessor('email', { header: '이메일' }),
  columnHelper.display({
    id: 'actions',
    header: '액션',
    cell: ({ row }) => <button onClick={() => onEdit(row.original)}>수정</button>,
  }),
];
```

## useReactTable 기본 설정

```tsx
import { useReactTable, getCoreRowModel, getSortedRowModel,
         getFilteredRowModel, getPaginationRowModel,
         type SortingState, type ColumnFiltersState } from '@tanstack/react-table';
import { useState } from 'react';

function UserTable({ data }: { data: TUser[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## useApi 연동 (서버 데이터)

```tsx
import { useApi } from '@axiom/hooks';

function UserTable() {
  const { data } = useApi<TUser[]>({ queryKey: ['users'], url: '/users' });

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  // ...
}
```

## 페이지네이션 컨트롤

```tsx
<div>
  <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>이전</button>
  <span>{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
  <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>다음</button>
</div>
```
