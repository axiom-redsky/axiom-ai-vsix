---
title: "use — Promise/Context 값 읽기 API (React 19)"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [use, use api, use훅, promise읽기, 프로미스읽기, 컨텍스트읽기, suspense연동, 조건부use, react19, 리소스읽기]
---

# use

`use`는 **Promise나 Context 같은 리소스의 값을 읽는** React 19 API다. 다른 훅과 달리 **조건문·반복문 안에서도 호출**할 수 있다(rules-of-hooks의 예외).

## 시그니처

```tsx
const value = use(resource);
```

- **`resource`**: 읽을 **Promise** 또는 **Context**.

## Promise 읽기 (Suspense 연동)

`use(promise)`는 Promise가 resolve될 때까지 컴포넌트를 **suspend**한다 → 가장 가까운 `<Suspense>` fallback이 표시된다.

```tsx
function Comment({ commentPromise }: { commentPromise: Promise<string> }) {
  const comment = use(commentPromise); // resolve까지 suspend
  return <p>{comment}</p>;
}
```

## Context 읽기

```tsx
const theme = use(ThemeContext); // useContext와 유사하나 조건부 호출 가능
```

## 주의사항

- 컴포넌트 **렌더 중**에 만든 Promise를 `use`에 넘기지 말 것(매 렌더 새 Promise → 무한 suspend). Promise는 서버/캐시/상위에서 만들어 내려준다.
- 이 프로젝트의 **서버 데이터 조회는 `useApi`(TanStack Query)** 가 표준이다. `use(fetch(...))` 직접 사용 대신 [patterns/use-api.md] 를 우선 검토.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/use
