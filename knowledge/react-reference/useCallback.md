---
title: "useCallback — 함수 메모이제이션 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usecallback, use-callback, 콜백메모, 함수메모, 함수캐싱, 메모이제이션, memoization, 참조안정화, 의존성배열, react-memo, 리렌더최적화]
---

# useCallback

`useCallback`은 **함수 정의를 캐싱**해 리렌더 사이에 같은 함수 참조를 유지하는 훅이다.

## 시그니처

```tsx
const cachedFn = useCallback(fn, dependencies);
```

- **`fn`**: 캐싱할 함수.
- **`dependencies`**: 함수가 참조하는 반응형 값 배열. 바뀌지 않으면 **이전 함수 참조를 그대로** 반환.

## 사용법

```tsx
const handleSubmit = useCallback(
  (data: TForm) => { save(id, data); },
  [id], // id가 같으면 동일 함수 참조 유지
);
```

## 언제 쓰나

- `React.memo`로 감싼 **자식에 함수를 prop으로 넘길 때** — 참조가 매 렌더 새로 생기면 자식이 매번 리렌더된다. `useCallback`으로 참조를 고정해 막는다.
- 다른 훅(useEffect 등)의 **의존성으로 함수를 넣을 때** 참조 안정화.

## useMemo와의 관계

`useCallback(fn, deps)` 는 `useMemo(() => fn, deps)` 와 같다. 즉 **함수 전용 useMemo**다.

## 주의사항

- 성능 최적화 수단일 뿐. 자식이 `memo`로 감싸지지 않았다면 보통 **효과가 없다**.
- 의존성을 빠뜨리면 함수가 stale 값을 가둔다(오래된 props/state 참조).

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useCallback
