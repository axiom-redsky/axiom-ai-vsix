---
title: "useContext — 컨텍스트 값 구독 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usecontext, use-context, 컨텍스트, context, createcontext, provider, 프로바이더, 전역값, prop-drilling, props드릴링, 테마, theme]
---

# useContext

`useContext`는 컴포넌트 트리에서 내려오는 **컨텍스트(Context) 값을 읽고 구독**하는 훅이다. props를 여러 단계로 내려보내는 **prop drilling**을 피할 때 쓴다.

## 시그니처

```tsx
const value = useContext(SomeContext);
```

- **`SomeContext`**: `createContext`로 만든 컨텍스트 객체.
- **반환값**: 트리 위쪽 가장 가까운 Provider의 `value`. Provider가 없으면 `createContext`에 준 기본값.

## 사용법

```tsx
// 1. 컨텍스트 생성
const ThemeContext = createContext<'light' | 'dark'>('light');

// 2. 제공 (React 19부터 <ThemeContext> 직접 사용 가능, .Provider 생략 가능)
function App() {
  return (
    <ThemeContext value="dark">
      <Page />
    </ThemeContext>
  );
}

// 3. 소비
function Page(): React.ReactNode {
  const theme = useContext(ThemeContext);
  return <div className={theme}>...</div>;
}
```

## 주의사항

- `value`가 바뀌면 해당 컨텍스트를 `useContext`로 읽는 **모든 하위 컴포넌트가 리렌더**된다. value 객체는 필요 시 `useMemo`로 안정화한다.
- `useContext(SomeContext)`에 넘기는 건 **컨텍스트 객체 자체**다(`SomeContext.Provider`나 `.Consumer`가 아님).

> 💡 이 프로젝트의 전역 상태/Provider 구성은 [patterns/state-management.md] 를 참고. 대규모 전역 상태는 컨텍스트보다 zustand를 쓰기도 한다([libraries/zustand.md]).

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useContext
