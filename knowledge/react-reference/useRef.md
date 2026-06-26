---
title: "useRef — 렌더와 무관한 값/DOM 참조 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useref, use-ref, ref, 참조, current, dom참조, 엘리먼트참조, 포커스, focus, 가변값, mutable, 리렌더없음]
---

# useRef

`useRef`는 **렌더링에 사용되지 않는 값**을 기억하는 훅이다. `.current`로 읽고 쓰며, **변경해도 리렌더가 일어나지 않는다.**

## 시그니처

```tsx
const ref = useRef(initialValue);
```

- **반환값**: `{ current: initialValue }` 형태의 **안정적인 객체**(렌더마다 동일 참조 유지).

## 용도 1 — DOM 엘리먼트 참조

```tsx
function TextInput(): React.ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return <input ref={inputRef} />;
}
```

## 용도 2 — 렌더와 무관한 가변값 보관

타이머 ID, 이전 값 등 **리렌더를 일으키면 안 되는 값**을 담는다.

```tsx
const timerId = useRef<number | null>(null);
timerId.current = setTimeout(...); // 변경해도 리렌더 없음
```

## state vs ref

| | state(useState) | ref(useRef) |
|---|---|---|
| 변경 시 리렌더 | O | **X** |
| 화면에 반영되는 값 | O | X (렌더 중 읽기/쓰기 금지) |
| 용도 | 화면에 보이는 데이터 | DOM·타이머 등 내부 보관 |

## 주의사항

- **렌더링 중에는 `ref.current`를 읽거나 쓰지 말 것**(초기화 제외). 이벤트 핸들러·이펙트 안에서만 다룬다.
- React 19부터 함수 컴포넌트는 **`ref`를 일반 prop으로 받을 수 있다**(별도 `forwardRef` 불필요).

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useRef
