---
title: "useDeferredValue — 값 지연 업데이트 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usedeferredvalue, use-deferred-value, 지연값, deferred, 입력지연, 검색지연, 논블로킹값, 동시성, 무거운리스트, 디바운스대체]
---

# useDeferredValue

`useDeferredValue`는 값의 **업데이트를 급하지 않은 것으로 지연**시켜, 무거운 리렌더가 급한 상호작용(타이핑 등)을 막지 않게 한다.

## 시그니처

```tsx
const deferredValue = useDeferredValue(value, initialValue?);
```

- 급한 업데이트 중에는 **이전 값**을 반환하고, 이후 백그라운드에서 새 값으로 리렌더한다.
- `initialValue`(React 19): 첫 렌더에서 쓸 초기값.

## 사용법

```tsx
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  // query는 즉시 반영(입력 빠름), 무거운 목록은 deferredQuery로 지연
  return <HeavyList filter={deferredQuery} />;
}
```

## 주의사항

- 디바운스/스로틀과 달리 **고정 지연이 없다** — 기기 성능에 맞춰 React가 조절한다.
- 넘기는 `value`는 렌더 밖(상위 state 등)에서 와야 한다. 렌더 중 만든 객체를 넣지 말 것.
- 무거운 자식은 `memo`로 감싸야 지연 효과가 산다. → [react-reference/memo.md]

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useDeferredValue
