---
title: "memo — props 변화 없으면 리렌더 건너뛰기"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [memo, react.memo, 메모컴포넌트, 리렌더건너뛰기, 리렌더방지, props비교, 얕은비교, areequal, 자식최적화, 메모이즈컴포넌트]
---

# memo

`memo`는 컴포넌트를 감싸, **props가 바뀌지 않으면 리렌더를 건너뛰게** 한다.

## 시그니처

```tsx
const MemoizedComponent = memo(Component, arePropsEqual?);
```

- 기본은 props를 **얕게(shallow) 비교**한다. `arePropsEqual(prev, next)`로 커스텀 비교도 가능(권장 안 함).

## 사용법

```tsx
const Row = memo(function Row({ item }: { item: TItem }) {
  return <tr>{/* ... */}</tr>;
});
```

## 효과를 보려면

- 부모가 리렌더돼도 **같은 props**면 `Row`는 리렌더 안 됨.
- 단, props로 넘기는 **객체·배열·함수 참조가 매번 새로 생기면 무효** → `useMemo`/`useCallback`으로 참조를 안정화해야 한다. → [react-reference/useCallback.md]

## 주의사항

- **성능 최적화 수단**일 뿐. 측정 없이 모든 컴포넌트를 감싸지 말 것(비교 비용·복잡도만 늘 수 있음).

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/memo
