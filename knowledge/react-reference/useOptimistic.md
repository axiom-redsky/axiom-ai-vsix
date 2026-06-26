---
title: "useOptimistic — 낙관적 UI 업데이트 훅 (React 19)"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useoptimistic, use-optimistic, 낙관적업데이트, optimistic, 낙관적ui, 즉시반영, 비동기중표시, 임시상태, react19]
---

# useOptimistic

`useOptimistic`은 비동기 작업이 **진행되는 동안 결과를 미리 보여주는(낙관적) 상태**를 만드는 React 19 훅이다. 작업이 끝나면 실제 상태로 대체된다.

## 시그니처

```tsx
const [optimisticState, addOptimistic] = useOptimistic(state, updateFn);
```

- **`state`**: 평소(실제) 상태.
- **`updateFn(currentState, optimisticValue)`**: 낙관적 값을 현재 상태에 병합해 반환.
- **`addOptimistic(value)`**: 액션 중 호출해 낙관적 상태를 추가.

## 사용법

```tsx
function Thread({ messages, sendMessage }: Props) {
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (cur, text: string) => [...cur, { text, sending: true }],
  );
  async function action(formData: FormData) {
    const text = formData.get('msg') as string;
    addOptimistic(text);        // 즉시 화면에 표시
    await sendMessage(text);    // 실제 전송
  }
  return <form action={action}>{/* optimistic 렌더 */}</form>;
}
```

## 주의사항

- 낙관적 상태는 **임시**다 — 액션이 실패하면 React가 실제 상태로 자동 롤백한다.
- 액션(`async` transition) 안에서 `addOptimistic`을 호출해야 효과가 산다.
- 서버 동기화 자체는 [patterns/use-api.md] 의 mutation으로 처리하고, 낙관적 표시에만 이 훅을 쓴다(TanStack Query의 onMutate optimistic update와 역할이 겹치니 택1).

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useOptimistic
