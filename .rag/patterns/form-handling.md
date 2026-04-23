---
title: 폼 처리 패턴
tags: [form, 폼, 양식, validation, 유효성, submit, 제출, react-hook-form, zod, 폼검증]
scope: pattern
related: [components/Form.md, patterns/api-call.md]
---

# 폼 처리 패턴

scaffold에서 폼은 **react-hook-form** + **shadcn/ui Form** 컴포넌트로 구성한다.
복잡한 검증에는 **zod**와 `@hookform/resolvers/zod`를 함께 사용한다.

## 기본 패턴 (rules 방식)

```tsx
import { useForm } from 'react-hook-form';
import {
  Form, FormControl, FormField,
  FormItem, FormLabel, FormMessage,
} from '@axiom/components/ui';
import { Input, Button } from '@axiom/components/ui';

interface CreateUserForm {
  name: string;
  email: string;
}

function CreateUserForm({ onSubmit }: { onSubmit: (d: CreateUserForm) => void }) {
  const form = useForm<CreateUserForm>({
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
                <Input placeholder="이름" {...field} />
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
                <Input type="email" placeholder="이메일" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          저장
        </Button>
      </form>
    </Form>
  );
}
```

## zod 검증 패턴

```tsx
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

const schema = z.object({
  name: z.string().min(1, '이름은 필수입니다').max(50, '50자 이내로 입력하세요'),
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  age: z.number({ invalid_type_error: '숫자를 입력하세요' }).min(1).max(120),
});

type FormData = z.infer<typeof schema>;

function ZodForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', age: 0 },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(console.log)} className="space-y-4">
        {/* FormField 내용 */}
      </form>
    </Form>
  );
}
```

## API mutation과 연결 패턴

```tsx
import { useApi } from '@axiom/hooks';

function CreateUserPage() {
  const { mutate, isPending, invalidateQueries } = useApi<User, CreateUserForm>(
    '/api/users',
    { method: 'POST' }
  );

  const form = useForm<CreateUserForm>({
    defaultValues: { name: '', email: '' },
  });

  const onSubmit = (data: CreateUserForm) => {
    mutate(data, {
      onSuccess: async () => {
        form.reset();
        await invalidateQueries('/api/users');
        // 목록 페이지로 이동 등
      },
      onError: (error) => {
        // 서버 에러를 폼 필드에 표시
        form.setError('email', { message: error.message });
      },
    });
  };

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
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? '저장 중...' : '저장'}
        </Button>
      </form>
    </Form>
  );
}
```

## 수정 폼 패턴 (defaultValues를 API 데이터로)

```tsx
function EditUserPage({ userId }: { userId: number }) {
  const { data: user } = useApi<User>(`/api/users/${userId}`);
  const { mutate, isPending } = useApi<User, UpdateUserForm>(
    `/api/users/${userId}`,
    { method: 'PUT' }
  );

  const form = useForm<UpdateUserForm>({
    defaultValues: { name: '', email: '' },
    values: user ? { name: user.name, email: user.email } : undefined,
    // values가 바뀌면 자동으로 폼 값 업데이트
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutate(d))} className="space-y-4">
        {/* FormField 내용 */}
        <Button type="submit" disabled={isPending}>수정</Button>
      </form>
    </Form>
  );
}
```

## Select를 포함한 폼

```tsx
import { Controller } from 'react-hook-form';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@axiom/components/ui';

<FormField
  control={form.control}
  name="status"
  render={({ field }) => (
    <FormItem>
      <FormLabel>상태</FormLabel>
      <FormControl>
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger>
            <SelectValue placeholder="상태 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="inactive">비활성</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```
