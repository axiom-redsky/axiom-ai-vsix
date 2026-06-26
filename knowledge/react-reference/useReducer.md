---
title: "useReducer — 리듀서 기반 상태 관리 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usereducer, use-reducer, 리듀서, reducer, dispatch, 디스패치, action, 액션, 복잡한상태, 상태로직, state-machine, 상태머신]
---

# useReducer

`useReducer`는 컴포넌트에 **리듀서 함수로 관리하는 상태**를 추가하는 훅이다. 상태 갱신 로직이 복잡하거나 여러 갈래일 때 `useState`보다 깔끔하다.

## 시그니처

```tsx
const [state, dispatch] = useReducer(reducer, initialArg, init?);
```

- **`reducer`**: `(state, action) => nextState` 순수 함수.
- **`initialArg`**: 초기 상태(또는 `init`에 넘길 인자).
- **`init`**(선택): `init(initialArg)`로 초기 상태를 게으르게 계산.
- **반환값**: `[현재 상태, dispatch 함수]`.

## 사용법

```tsx
type TAction = { type: 'inc' } | { type: 'set'; value: number };

function reducer(state: number, action: TAction): number {
  switch (action.type) {
    case 'inc': return state + 1;
    case 'set': return action.value;
    default: return state;
  }
}

function Counter(): React.ReactNode {
  const [count, dispatch] = useReducer(reducer, 0);
  return <button onClick={() => dispatch({ type: 'inc' })}>{count}</button>;
}
```

## useState vs useReducer

- 단순한 값 하나 → `useState`.
- **여러 하위 값**이 함께 바뀌거나, 갱신 로직을 **한곳(reducer)에 모으고 테스트**하고 싶을 때 → `useReducer`.

## 주의사항

- `reducer`는 **순수 함수**여야 한다(같은 입력 → 같은 출력, 부수효과·비동기 금지).
- 상태는 **불변**으로 새 객체/배열을 반환한다. 기존 state를 직접 변경하지 않는다.
- `dispatch`는 참조가 **안정적**이라 이펙트 의존성에서 생략해도 된다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useReducer
