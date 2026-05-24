---
title: 화면 템플릿 — 폼 화면
tags: [page-template, 페이지템플릿, 폼화면, form-page, formpage, 폼, form, 등록, 수정, 입력, 저장, 취소, react-hook-form, zod, validation, 유효성]
scope: page-template
status: base-only
---

# 화면 템플릿 — 폼 화면 (Form Page)

> **운영 규칙**
> - **섹션 A**: scaffold 공통 기본 구조. react-app-scaffold 확정 전까지 `base-only` 유지.
> - **섹션 B**: 초안 / 검토 중 변형 패턴. 실전에서 확인 후 섹션 A로 이동.
> - **섹션 C**: SI 프로젝트 투입 시 추가. axiom-ai "프로젝트 설정 > 레이아웃 패턴 > 폼 화면" 필드와 연동.

---

## 섹션 A — Scaffold 공통 구조

### 구조 개요

```
페이지 루트 (.form-wrap / p-6 max-w-2xl)
├── 페이지 제목 (.page-title)
└── 폼 카드 (.card-wrap)
    └── react-hook-form <form>
        ├── 입력 필드 그룹들 (.form-group)
        └── 하단 버튼 영역 (.btn-area) ← 취소 / 저장
```

---

### 퍼블 HTML 예시

```html
<div class="form-wrap">

  <h2 class="page-title">사용자 등록</h2>

  <div class="card-wrap">
    <div class="card-body">
      <form id="userForm">

        <div class="form-group">
          <label class="form-label" for="userName">
            이름 <span class="required">*</span>
          </label>
          <input class="form-control" id="userName" type="text" placeholder="이름을 입력하세요" />
          <span class="invalid-feedback">이름은 필수 입력입니다.</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="userEmail">이메일</label>
          <input class="form-control" id="userEmail" type="email" placeholder="이메일을 입력하세요" />
          <span class="invalid-feedback">올바른 이메일 형식이 아닙니다.</span>
        </div>

        <div class="form-group">
          <label class="form-label">부서</label>
          <select class="form-select" id="department">
            <option value="">선택하세요</option>
            <option value="1">개발팀</option>
            <option value="2">기획팀</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">비고</label>
          <textarea class="form-control" rows="4" placeholder="비고를 입력하세요"></textarea>
        </div>

        <div class="btn-area btn-area--right">
          <button type="button" class="btn btn-outline">취소</button>
          <button type="submit" class="btn btn-primary">저장</button>
        </div>

      </form>
    </div>
  </div>

</div>
```

---

### React 변환 예시

```tsx
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@axiom/components/ui';
import { Input } from '@axiom/components/ui';
import { Textarea } from '@axiom/components/ui';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@axiom/components/ui';
import { Card, CardContent } from '@axiom/components/ui';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@axiom/components/ui';

const schema = z.object({
  userName: z.string().min(1, '이름은 필수 입력입니다.'),
  userEmail: z.string().email('올바른 이메일 형식이 아닙니다.').or(z.literal('')),
  department: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function UserFormPage(): React.ReactNode {
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      userName: '',
      userEmail: '',
      department: '',
      notes: '',
    },
  });

  const onSubmit = (values: FormValues) => {
    console.log(values);
    // TODO: API 호출
    navigate(-1);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">사용자 등록</h1>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              <FormField
                control={form.control}
                name="userName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      이름 <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="이름을 입력하세요" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="userEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이메일</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="이메일을 입력하세요" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>부서</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="선택하세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">개발팀</SelectItem>
                        <SelectItem value="2">기획팀</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>비고</FormLabel>
                    <FormControl>
                      <Textarea placeholder="비고를 입력하세요" rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  취소
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? '저장 중...' : '저장'}
                </Button>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>

    </div>
  );
}
```

---

## 섹션 B — 초안 / 검토 중 변형

> 실전 투입 후 확인되는 변형 패턴을 여기에 추가한 후 섹션 A로 이동한다.

| 변형 패턴 | 상태 | 비고 |
|---------|------|------|
| 멀티 스텝 폼 (단계별 입력) | tbd | Tabs 또는 단계 인디케이터 |
| 모달 안 인라인 폼 | tbd | Dialog + Form 조합 |
| 파일 첨부 포함 폼 | tbd | 파일 업로드 컴포넌트 필요 |

---

## 섹션 C — 프로젝트별 폼 화면 구조

> SI 프로젝트 투입 시 이 섹션에 서브섹션을 추가한다.  
> **직접 편집하지 말 것** — axiom-ai 좌측 패널 **"프로젝트 설정 > 레이아웃 패턴 > 폼 화면"** 에 입력하면 `.axiom/knowledge/project-config.md`의 `### 폼 화면` 섹션으로 자동 저장된다.

```
프로젝트명      : (예: ○○은행 차세대 시스템)
채택 구조       : (axiom-ai 패널에서 입력 — 섹션 A와 다른 부분만 기록)
특이사항        :
```
