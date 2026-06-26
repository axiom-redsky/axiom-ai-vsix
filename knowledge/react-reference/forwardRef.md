---
title: "forwardRef — 자식에 ref 전달 (React 19에선 보통 불필요)"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [forwardref, forward-ref, ref전달, ref포워딩, 자식ref, ref prop, 레거시ref]
---

# forwardRef

`forwardRef`는 부모가 넘긴 `ref`를 자식 컴포넌트의 DOM 노드로 **전달**하게 해주는 API다.

> ⚠️ **React 19부터는 대부분 불필요**하다. 함수 컴포넌트가 **`ref`를 일반 prop으로** 받을 수 있어 `forwardRef` 없이 동작한다. 신규 코드는 prop 방식을 권장한다.

## React 19 권장 (prop)

```tsx
function MyInput({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> } & Props) {
  return <input ref={ref} {...props} />;
}
```

## 레거시 (forwardRef)

```tsx
const MyInput = forwardRef<HTMLInputElement, Props>((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

## 주의사항

- 기존 코드 호환을 위해 `forwardRef`는 계속 동작한다. 마이그레이션 시 prop 방식으로 단순화할 수 있다.
- ref로 노출할 핸들을 커스터마이즈하려면 [react-reference/useImperativeHandle.md] 와 함께 쓴다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/forwardRef
