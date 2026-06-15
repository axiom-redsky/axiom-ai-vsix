---
title: cn — className 병합 유틸
version: "1.0"
tags: [cn, classname, 클래스명, 클래스, tailwind, twMerge, clsx, 조건부클래스, 스타일병합, 클래스병합, classnames]
scope: scaffold
related: [utils/util.md]
---

# cn — className 병합 유틸

조건부 className 조합 + Tailwind 클래스 충돌 해소를 한 번에 처리한다(`clsx` + `tailwind-merge`).

```ts
import { cn } from '@/shared/utils/cn';

cn('px-2 py-1', isActive && 'bg-primary', 'px-4');
// → "py-1 bg-primary px-4"  (뒤의 px-4가 앞의 px-2를 올바르게 덮어씀)

<div className={cn('rounded border', disabled && 'opacity-50', className)} />
```

- 구현: `src/shared/utils/cn.ts` — `twMerge(clsx(inputs))`
- import 경로: `@/shared/utils/cn` (정본). shadcn/ui 컴포넌트들은 `@/shared/lib/shadcn/utils`에서 import하는데, 이는 같은 `cn`을 re-export한 것이다.
- 용도: 정적 + 조건부 + 외부 주입(className prop) 클래스를 합치고 Tailwind 중복(`px-2`/`px-4` 등)을 마지막 값으로 정리.
