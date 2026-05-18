---
title: Form 컴포넌트 (shadcn/ui Form)
tags: [form, 폼, 양식, submit, 제출, react-hook-form, zod, validation, 유효성]
scope: component
related: [patterns/form-handling.md]
---

# Form 컴포넌트

scaffold에서 폼은 **react-hook-form** + **shadcn/ui Form** 컴포넌트로 구성한다.

## 임포트

```typescript
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@axiom/components/ui';
import { useForm } from 'react-hook-form';
```

## 기본 폼 구조

```tsx
import { useForm } from 'react-hook-form';
import {
  Form, FormControl, FormField,
  FormItem, FormLabel, FormMessage,
} from '@axiom/components/ui';
import { Input, Button } from '@axiom/components/ui';

interface UserFormData {
  name: string;
  email: string;
}

function UserForm({ onSubmit }: { onSubmit: (data: UserFormData) => void }) {
  const form = useForm<UserFormData>({
    defaultValues: { name: '', email: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: '이름은 필수입니다' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input placeholder="이름 입력" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          rules={{
            required: '이메일은 필수입니다',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: '올바른 이메일 형식이 아닙니다',
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input type="email" placeholder="이메일 입력" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </form>
    </Form>
  );
}
```

## useApi mutation과 연결

```tsx
import { useApi } from '@axiom/hooks';

function CreateUserPage() {
  const { mutate, isPending } = useApi<User, UserFormData>('/api/users', {
    method: 'POST',
  });

  const form = useForm<UserFormData>();

  const onSubmit = (data: UserFormData) => {
    mutate(data, {
      onSuccess: () => {
        form.reset();
        // 성공 처리
      },
      onError: (error) => {
        // 에러 처리
      },
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* FormField 내용 */}
        <Button type="submit" disabled={isPending}>
          {isPending ? '저장 중...' : '저장'}
        </Button>
      </form>
    </Form>
  );
}
```

자세한 패턴은 `patterns/form-handling.md` 참조.
