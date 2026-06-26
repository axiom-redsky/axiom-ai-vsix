---
title: "startTransition — 컴포넌트 밖에서 transition 표시"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [starttransition, start-transition, 트랜지션표시, 논블로킹업데이트, ispending없이, 컴포넌트밖트랜지션, 급하지않은업데이트]
---

# startTransition

`startTransition`은 상태 업데이트를 **급하지 않은(transition) 것으로 표시**하는 함수다. `useTransition`과 달리 **훅이 아니라서** 컴포넌트 밖(스토어·유틸 등)에서도 호출할 수 있다.

## 시그니처

```tsx
startTransition(action);
```

- **`action`**: 안에서 상태를 갱신하는 함수. 이 안의 갱신은 transition으로 처리돼 UI를 막지 않는다.

## 사용법

```tsx
import { startTransition } from 'react';

function selectTab(next: string) {
  startTransition(() => {
    setTab(next); // 무거운 탭 전환을 논블로킹으로
  });
}
```

## useTransition과의 차이

- 대기 상태(`isPending`)가 **필요하면 `useTransition`** 을 쓴다. → [react-reference/useTransition.md]
- `isPending`이 필요 없거나 **컴포넌트 밖**에서 호출해야 하면 `startTransition`.

## 주의사항

- 입력값처럼 **즉시 반영돼야 하는 갱신**은 감싸지 않는다.
- React 19에선 `action`으로 **async 함수**도 지원한다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/startTransition
