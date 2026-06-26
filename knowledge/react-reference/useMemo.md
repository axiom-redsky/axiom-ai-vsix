---
title: "useMemo — 계산 결과 메모이제이션 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usememo, use-memo, 메모, memo, 메모이제이션, memoization, 캐싱, 계산캐싱, 비싼계산, 파생값, 의존성배열, 리렌더최적화]
---

# useMemo

`useMemo`는 **계산 결과를 캐싱**해 리렌더 사이에 재사용하는 훅이다. 의존성이 바뀌지 않으면 이전 계산 결과를 그대로 돌려준다.

## 시그니처

```tsx
const cached = useMemo(calculateValue, dependencies);
```

- **`calculateValue`**: 캐싱할 값을 **반환하는** 순수 함수(인자 없음).
- **`dependencies`**: 계산에 쓰이는 반응형 값 배열. `Object.is`로 얕게 비교.

## 사용법

```tsx
const visibleItems = useMemo(
  () => items.filter(i => i.active), // 비싼 계산
  [items],                          // items가 바뀔 때만 재계산
);
```

## 언제 쓰나

1. **비싼 계산**을 매 렌더마다 반복하지 않으려 할 때.
2. 자식에 넘기는 **객체/배열 참조를 안정화**해, `React.memo`로 감싼 자식의 불필요한 리렌더를 막을 때.

## 주의사항

- **성능 최적화 수단일 뿐**, 의미상 없어도 동작은 같아야 한다. 무지성 남용 금지 — 측정 후 병목에만.
- 함수 자체를 메모이즈하려면 `useMemo`가 아니라 **`useCallback`** 을 쓴다. → [react-reference/useCallback.md]
- 의존성을 빠뜨리면 stale 값이 캐싱된다. 계산에 쓰는 모든 반응형 값을 넣는다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useMemo
