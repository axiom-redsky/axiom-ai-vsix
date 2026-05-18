---
title: Select 컴포넌트
tags: [select, dropdown, 드롭다운, 선택, combobox, option, 옵션]
scope: component
---

# Select 컴포넌트

## 임포트

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@axiom/components/ui';
```

## 기본 사용 예시

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@axiom/components/ui';

// 단순 Select
<Select>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="선택하세요" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="active">활성</SelectItem>
    <SelectItem value="inactive">비활성</SelectItem>
    <SelectItem value="pending">대기중</SelectItem>
  </SelectContent>
</Select>
```

## 제어 컴포넌트 패턴 (value + onValueChange)

```tsx
import { useState } from 'react';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@axiom/components/ui';
import { Label } from '@axiom/components/ui';

function StatusFilter() {
  const [status, setStatus] = useState<string>('');

  return (
    <div className="space-y-1">
      <Label>상태 필터</Label>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="전체" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="active">활성</SelectItem>
          <SelectItem value="inactive">비활성</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

## react-hook-form과 조합

```tsx
import { Controller, useForm } from 'react-hook-form';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@axiom/components/ui';
import { Label } from '@axiom/components/ui';

interface FormData {
  category: string;
}

function CategoryForm() {
  const { control, handleSubmit } = useForm<FormData>();

  return (
    <form onSubmit={handleSubmit(console.log)} className="space-y-4">
      <div className="space-y-1">
        <Label>카테고리</Label>
        <Controller
          name="category"
          control={control}
          rules={{ required: '카테고리를 선택하세요' }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">유형 A</SelectItem>
                <SelectItem value="B">유형 B</SelectItem>
                <SelectItem value="C">유형 C</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </form>
  );
}
```

## 동적 옵션 (API 데이터 연동)

```tsx
const { data: categories } = useApi<{ id: number; name: string }[]>('/api/categories');

<Select>
  <SelectTrigger>
    <SelectValue placeholder="카테고리 선택" />
  </SelectTrigger>
  <SelectContent>
    {categories?.map((cat) => (
      <SelectItem key={cat.id} value={String(cat.id)}>
        {cat.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```
