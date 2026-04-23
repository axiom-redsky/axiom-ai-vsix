---
title: Input / Label 컴포넌트
tags: [input, 입력, text, 텍스트, label, 라벨, 필드, textfield]
scope: component
---

# Input / Label 컴포넌트

## 임포트

```typescript
import { Input, Label } from '@axiom/components/ui';
```

## 기본 사용 예시

```tsx
import { Input, Label } from '@axiom/components/ui';

// 단순 Input
<Input placeholder="이름을 입력하세요" />

// Label + Input 조합
<div className="space-y-1">
  <Label htmlFor="username">사용자명</Label>
  <Input id="username" placeholder="사용자명" />
</div>

// 타입 지정
<Input type="password" placeholder="비밀번호" />
<Input type="email" placeholder="이메일" />
<Input type="number" placeholder="숫자" />

// 비활성화
<Input disabled value="읽기 전용" />
```

## react-hook-form과 조합

```tsx
import { useForm } from 'react-hook-form';
import { Input, Label, Button } from '@axiom/components/ui';

interface FormData {
  name: string;
  email: string;
}

function UserForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          {...register('name', { required: '이름은 필수입니다' })}
          placeholder="이름"
        />
        {errors.name && (
          <p className="text-sm text-red-500">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          {...register('email', { required: '이메일은 필수입니다' })}
          placeholder="이메일"
        />
        {errors.email && (
          <p className="text-sm text-red-500">{errors.email.message}</p>
        )}
      </div>
      <Button type="submit">저장</Button>
    </form>
  );
}
```

## 검색 Input 패턴

```tsx
import { useState } from 'react';
import { Input } from '@axiom/components/ui';
import { Search } from 'lucide-react';

function SearchBar({ onSearch }: { onSearch: (q: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <Input
        className="pl-9"
        placeholder="검색..."
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
      />
    </div>
  );
}
```
