---
title: "createContext — 컨텍스트 생성"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [createcontext, create-context, 컨텍스트생성, context객체, provider생성, 기본값context, 컨텍스트만들기]
---

# createContext

`createContext`는 컴포넌트들이 공유할 **컨텍스트 객체**를 만든다. 값을 내려주는 Provider와, 읽는 `useContext`와 함께 쓴다.

## 시그니처

```tsx
const SomeContext = createContext(defaultValue);
```

- **`defaultValue`**: 트리 위에 Provider가 없을 때 사용할 기본값.

## 사용법

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light');

// React 19: <Context>를 Provider로 직접 사용(.Provider 생략 가능)
function App() {
  return (
    <ThemeContext value="dark">
      <Page />
    </ThemeContext>
  );
}
```

읽기는 `useContext(ThemeContext)`. → [react-reference/useContext.md]

## 주의사항

- 컨텍스트 객체는 **컴포넌트 밖(모듈 최상위)** 에서 한 번 만든다.
- value가 바뀌면 구독 중인 모든 하위가 리렌더된다 — value 객체는 `useMemo`로 안정화.

> 💡 이 프로젝트의 전역 Provider 구성·상태관리는 [patterns/state-management.md], 대규모 전역 상태는 [libraries/zustand.md] 를 따른다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/createContext
