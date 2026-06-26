---
title: "useState — 상태 관리 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usestate, use-state, 상태, state, setstate, 상태변경, 함수형업데이트, 초기값, lazy-init, 게으른초기화, 리렌더]
---

# useState

`useState`는 컴포넌트에 **상태 변수**를 추가하는 React 훅이다.

## 시그니처

```tsx
const [state, setState] = useState(initialState);
```

- **`initialState`**: 초기 상태값. 첫 렌더에서만 사용된다. 함수를 넘기면(`useState(() => 비싼계산())`) **게으른 초기화**(첫 렌더에서 한 번만 실행)로 동작한다.
- **반환값**: `[현재 상태, setter 함수]` 튜플.

## 사용법

```tsx
function Counter(): React.ReactNode {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## setter 함수 (`setState`)

- 다음 렌더의 상태를 정하고 **리렌더를 예약**한다.
- **이전 값에 기반해 갱신**할 때는 함수형 업데이트를 쓴다 — 같은 이벤트에서 여러 번 갱신해도 안전하다.

```tsx
setCount(prev => prev + 1); // 권장: 이전 값 기반
```

## 주의사항

- 상태 갱신은 **비동기적으로 일괄(batch) 처리**된다. `setState` 직후 `state`를 읽으면 **이전 값**이다(다음 렌더에 반영).
- 객체/배열 상태는 **불변(immutable)** 으로 새 참조를 만들어 교체한다. `state.x = 1` 같은 직접 변경은 리렌더를 트리거하지 않는다.

```tsx
setUser(prev => ({ ...prev, name: '홍길동' })); // 새 객체로 교체
```

- 훅이므로 컴포넌트 **최상위에서만** 호출한다(조건문·반복문·중첩 함수 안 금지). → [react-reference/rules-of-hooks.md]

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useState
