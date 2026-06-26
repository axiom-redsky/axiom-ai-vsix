---
title: "useImperativeHandle — ref로 노출할 핸들 정의 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useimperativehandle, use-imperative-handle, ref핸들, imperative, 명령형핸들, 부모에노출, focus노출, 메서드노출, ref커스텀]
---

# useImperativeHandle

`useImperativeHandle`은 자식 컴포넌트가 **부모의 ref로 노출할 핸들(메서드 집합)을 커스터마이즈**하는 훅이다. DOM 노드 전체 대신 **정해진 명령형 메서드만** 부모에 열어준다.

## 시그니처

```tsx
useImperativeHandle(ref, createHandle, dependencies?);
```

- **`ref`**: 부모가 넘긴 ref (React 19에선 prop으로 직접 받음).
- **`createHandle()`**: 노출할 객체(메서드들)를 반환.

## 사용법

```tsx
function FancyInput({ ref }: { ref: React.Ref<{ focus: () => void }> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(), // 부모엔 focus()만 노출
  }), []);
  return <input ref={inputRef} />;
}
```

## 주의사항

- **남용 금지** — 명령형 핸들은 React의 선언형 흐름을 깬다. props로 해결 가능하면 그게 우선.
- React 19부턴 `forwardRef` 없이 `ref`를 prop으로 받을 수 있다. → [react-reference/useRef.md]

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useImperativeHandle
