---
title: zustand 전역 상태 관리
version: "^5.0"
tags: [zustand, 스토어, store, 전역상태, 상태관리, create, useStore, devtools]
scope: library
related: [patterns/state-management.md]
---

# zustand

react-app-scaffold에 `zustand ^5.0`이 설치되어 있다. v4와 API 구조가 다르므로 주의.

## v5 기본 스토어 생성 패턴

```ts
// src/domains/{domain}/store/exampleStore.ts
import { create } from 'zustand';

type TExampleState = {
  count: number;
  name: string;
  increment: () => void;
  setName: (name: string) => void;
  reset: () => void;
};

export const useExampleStore = create<TExampleState>((set) => ({
  count: 0,
  name: '',
  increment: () => set((state) => ({ count: state.count + 1 })),
  setName: (name) => set({ name }),
  reset: () => set({ count: 0, name: '' }),
}));
```

스토어 파일 위치: `src/domains/{domain}/store/{storeName}.ts`
타입 네이밍: `T` 접두사 (`TExampleState`)

## 컴포넌트에서 사용

```tsx
import { useExampleStore } from '@/domains/example/store/exampleStore';

function ExampleComponent() {
  // 전체 구독 (리렌더 최소화를 위해 선택자 방식 권장)
  const { count, increment } = useExampleStore();

  // 선택자 방식 — 필요한 값만 구독 (성능 최적화)
  const count = useExampleStore((state) => state.count);
  const increment = useExampleStore((state) => state.increment);

  return <button onClick={increment}>{count}</button>;
}
```

## devtools 연결 (개발 환경에서 Redux DevTools 사용)

```ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useExampleStore = create<TExampleState>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }), false, 'increment'),
    }),
    { name: 'ExampleStore' },
  ),
);
```

## v4 vs v5 차이점 (주의)

```ts
// v4 방식 — 사용 금지
import create from 'zustand'; // default import

// v5 방식 — 올바른 방법
import { create } from 'zustand'; // named import
```

v5에서는 `create`가 named export로 변경되었다.

## 스토어 외부(비컴포넌트)에서 상태 읽기

```ts
// 컴포넌트 밖에서 상태를 직접 읽어야 할 때
const state = useExampleStore.getState();
useExampleStore.setState({ count: 10 });
```
