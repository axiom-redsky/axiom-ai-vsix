---
title: "컴포넌트 패턴"
category: component
tags: [component, 컴포넌트, button, 버튼, input, 입력, table, 테이블, dialog, 모달, select, 드롭다운, form, 폼, card, badge, tabs, tailwind, 스타일, shadcn, "@axiom/components", layout, 레이아웃, pascalcase, 선언순서, 선언위치, hook순서, usestate, useref, useapi, useeffect, handler, 핸들러, 컴포넌트구조, 코드구조]
priority: 1
language: ko
scope: component
related: [components/Button.md, components/Table.md, components/Dialog.md, components/Input.md, components/Select.md, components/Form.md, react/component.md]
version: "1.0"
---

# 컴포넌트 패턴

---

## @axiom/components/ui 임포트

scaffold의 모든 UI 컴포넌트는 `@axiom/components/ui`에서 임포트한다.

```typescript
// CORRECT
import { Button } from '@axiom/components/ui';
import { Input, Label } from '@axiom/components/ui';
import { Card, CardHeader, CardContent } from '@axiom/components/ui';

// INCORRECT — 내부 경로 직접 임포트 금지
import { Button } from '../../shared/components/shadcn/components/ui/button';
import { Button } from '@/shared/components/shadcn/components/ui/button';
```

`@axiom/components/ui`는 `src/shared/components/ui/index.ts`를 가리키며,
이 파일이 `src/shared/components/shadcn/components/ui/` 아래 shadcn/ui 컴포넌트들을 재export한다.

---

## 주요 UI 컴포넌트 목록

shadcn/ui Radix Nova 스타일 기반 컴포넌트들.

| 컴포넌트 | 용도 |
|---------|------|
| `Button` | 버튼 (variant: default/secondary/outline/ghost/destructive) |
| `Input` | 텍스트 입력 |
| `Label` | 폼 레이블 |
| `Card`, `CardHeader`, `CardContent`, `CardFooter` | 카드 레이아웃 |
| `Badge` | 상태 배지 |
| `Separator` | 구분선 |
| `Skeleton` | 로딩 스켈레톤 |
| `Tooltip`, `TooltipContent`, `TooltipTrigger` | 툴팁 |
| `Dialog`, `DialogContent`, `DialogHeader` | 모달 다이얼로그 |
| `Sheet`, `SheetContent` | 사이드 패널 |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | 탭 |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | 드롭다운 선택 |
| `Accordion` | 아코디언 |

---

## TailwindCSS 4 사용 컨벤션

scaffold는 TailwindCSS 4를 사용한다. (`@tailwindcss/vite` 플러그인)

### 기본 사용

```tsx
<div className="flex items-center gap-4 p-6 rounded-2xl">
  <p className="text-sm font-medium text-gray-900 dark:text-white">텍스트</p>
</div>
```

### 다크 모드

`dark:` 접두사 클래스가 자동으로 작동한다. (ThemeToggle 컴포넌트로 전환 가능)

```tsx
<div className="bg-white dark:bg-gray-900">
  <p className="text-gray-900 dark:text-white">다크모드 지원 텍스트</p>
</div>
```

### 브랜드 컬러

`brand-*` 컬러 유틸리티를 사용한다.

```tsx
<button className="bg-brand-600 hover:bg-brand-700 text-white">
  액션 버튼
</button>
<span className="text-brand-600 dark:text-brand-400">브랜드 텍스트</span>
```

### 아이콘 — lucide-react

```typescript
import { Globe, Send, RefreshCw, KeyRound } from 'lucide-react';

<Globe className="w-5 h-5 text-brand-600 dark:text-brand-400" />
<Send className="w-4 h-4" />
```

---

## 레이아웃 컴포넌트

### RootLayout

모든 도메인의 페이지를 감싸는 기본 레이아웃. 헤더, 사이드바, 콘텐츠 영역 포함.
라우터에서 `element: <RootLayout />`으로 사용한다.

```typescript
// 라우터에서 사용
{
  path: '/my-feature',
  element: <RootLayout />,
  children: MyFeatureRouter,
}
```

### 페이지 컴포넌트 기본 구조

```tsx
export default function MyPage(): React.ReactNode {
  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        페이지 제목
      </h1>
      {/* 콘텐츠 */}
    </div>
  );
}
```

---

## 코드 스타일 컨벤션

- 컴포넌트 파일: PascalCase (`MyFeaturePage.tsx`)
- 훅 파일: camelCase with `use` 접두사 (`useMyFeature.ts`)
- 타입: `T` 접두사 (`TMyData`) 또는 `I` 접두사 (`IMyConfig`)
- 상수: UPPER_SNAKE_CASE
- 코드 주석: 한국어

---

## 함수 컴포넌트 내부 선언 순서

함수 컴포넌트 본문 안의 선언은 아래 순서로 배치한다.

1. **변수/상태 선언부** — `useState`, `useRef` 등 상태·ref 선언을 함수 컴포넌트 **최상단**에 둔다.
2. **useApi 선언부** — 데이터 페치 훅(`useApi` 등) 선언을 그 **다음(두 번째 영역)** 에 둔다. 변수/상태 선언부가 없으면 함수 컴포넌트 최상단에 둔다.
3. **그 외** — `useEffect`, 일반 함수, `handleXxx` 핸들러 함수는 그 **다음 순위**에 둔다.

```tsx
export default function UserListPage(): React.ReactNode {
  // 1. 변수/상태 선언부 (useState, useRef)
  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 2. useApi 선언부
  const { data: users } = useApi<TUser[]>('/api/users');
  const { mutate: removeUser } = useApi<void, { id: number }>('/api/users', {
    method: 'DELETE',
  });

  // 3. useEffect / 일반 함수 / handler
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleDelete = (id: number) => {
    removeUser({ id });
  };

  return <div>{/* ... */}</div>;
}
```
