---
title: "useActionState — 폼 액션 상태 관리 훅 (React 19)"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useactionstate, use-action-state, 폼액션, form-action, 액션상태, formaction, ispending, useformstate, 서버액션, 폼제출상태, react19]
---

# useActionState

`useActionState`는 **폼 액션의 결과를 상태로 관리**하는 React 19 훅이다(이전 이름 `useFormState`). 액션 실행 중 대기 상태와 반환값을 함께 다룬다.

## 시그니처

```tsx
const [state, formAction, isPending] = useActionState(action, initialState, permalink?);
```

- **`action(prevState, formData)`**: 폼 제출 시 실행될 함수. 다음 `state`를 반환.
- **반환**: `[현재 state, <form action>에 넘길 함수, isPending]`.

## 사용법

```tsx
function NameForm(): React.ReactNode {
  const [error, submitAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const res = await save(formData.get('name'));
      return res.ok ? null : '저장 실패';
    },
    null,
  );
  return (
    <form action={submitAction}>
      <input name="name" />
      <button disabled={isPending}>저장</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

## 주의사항

- 폼 `action` prop과 함께 쓰도록 설계됐다(점진적 향상).
- 이 프로젝트의 **서버 통신/뮤테이션은 `useApi`(TanStack Query)** 가 표준이다. 폼 제출도 보통 useApi mutation으로 처리하므로 [patterns/use-api.md] 를 우선 검토.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useActionState
