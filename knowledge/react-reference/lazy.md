---
title: "lazy — 컴포넌트 지연 로딩(코드 분할)"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [lazy, react.lazy, 지연로딩컴포넌트, 코드분할컴포넌트, dynamic-import, 동적임포트, suspense컴포넌트, 번들분할]
---

# lazy

`lazy`는 컴포넌트를 **처음 렌더될 때까지 로딩을 미뤄** 번들을 분할한다. `<Suspense>`와 함께 쓴다.

## 시그니처

```tsx
const SomeComponent = lazy(load);
```

- **`load`**: `default` export로 컴포넌트를 담은 **Promise를 반환**하는 함수(`() => import('./X')`).

## 사용법

```tsx
import { lazy, Suspense } from 'react';
const Settings = lazy(() => import('./Settings'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Settings />
    </Suspense>
  );
}
```

## 주의사항

- `lazy(...)` 호출은 컴포넌트 **밖(모듈 최상위)** 에서 한다. 컴포넌트 안에서 호출하면 상태가 리셋된다.
- 로딩 중 표시는 상위 `<Suspense>` fallback이 담당한다. → [react-reference/Suspense.md]

> 💡 이 프로젝트의 **라우트 단위 코드 분할은 scaffold의 Loadable/라우터 설정**을 따른다. 페이지 라우팅 분할이면 [patterns/router.md] 를 먼저 보라.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/lazy
