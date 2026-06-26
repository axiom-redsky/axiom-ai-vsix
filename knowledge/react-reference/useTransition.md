---
title: "useTransition — 논블로킹 상태 전환 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usetransition, use-transition, 트랜지션, transition, ispending, starttransition, 논블로킹, 비차단, 우선순위, 무거운업데이트, 로딩표시, 동시성, concurrent]
---

# useTransition

`useTransition`은 UI를 **막지 않고(논블로킹) 상태를 전환**하게 해주는 훅이다. 무거운 리렌더를 "급하지 않은(transition)" 업데이트로 표시해, 입력 등 급한 상호작용이 끊기지 않게 한다.

## 시그니처

```tsx
const [isPending, startTransition] = useTransition();
```

- **`isPending`**: 전환이 진행 중인지 여부(로딩 표시에 사용).
- **`startTransition(action)`**: 콜백 안의 상태 갱신을 transition으로 표시.

## 사용법

```tsx
function TabBar(): React.ReactNode {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState('home');

  function selectTab(next: string) {
    startTransition(() => {
      setTab(next); // 무거운 탭 렌더를 논블로킹으로
    });
  }
  return <>{isPending && <Spinner />}{/* ... */}</>;
}
```

## 주의사항

- transition으로 표시된 갱신은 더 급한 갱신(타이핑 등)에 **중단·재개**될 수 있다.
- `startTransition`의 콜백 안에서 상태를 갱신해야 한다. 콜백은 동기적으로 실행된다.
- React 19에서는 `startTransition`이 **async 함수(Actions)** 도 지원해, 비동기 작업 동안 `isPending`을 유지할 수 있다.
- 입력값처럼 **즉시 반영돼야 하는 상태**는 transition으로 감싸지 않는다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useTransition
