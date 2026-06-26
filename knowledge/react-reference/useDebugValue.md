---
title: "useDebugValue — 커스텀 훅 DevTools 라벨 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usedebugvalue, use-debug-value, 디버그값, devtools라벨, 커스텀훅라벨, react-devtools, 훅디버깅]
---

# useDebugValue

`useDebugValue`는 **커스텀 훅**에 React DevTools에서 보일 **라벨**을 붙이는 훅이다. 디버깅 편의용이며 동작에는 영향이 없다.

## 시그니처

```tsx
useDebugValue(value, format?);
```

## 사용법

```tsx
function useOnlineStatus(): boolean {
  const isOnline = useSyncExternalStore(/* ... */);
  useDebugValue(isOnline ? '온라인' : '오프라인');
  return isOnline;
}
```

## 주의사항

- **커스텀 훅 안에서만** 의미가 있다(일반 컴포넌트엔 쓰지 않음).
- `format` 함수는 DevTools로 해당 훅을 들여다볼 때만 호출된다 — 비싼 포맷팅을 지연시킬 때 유용.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useDebugValue
