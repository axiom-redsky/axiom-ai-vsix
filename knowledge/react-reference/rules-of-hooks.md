---
title: "Rules of Hooks — 훅 호출 규칙"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [rules-of-hooks, 훅규칙, 훅 규칙, 훅호출규칙, 조건부훅, 조건문훅, 훅순서, 훅 순서, 최상위, top-level, 훅조건, 반복문훅, early-return, eslint-plugin-react-hooks]
---

# Rules of Hooks (훅 호출 규칙)

React 훅(`use*`)에는 **반드시 지켜야 하는 두 가지 규칙**이 있다. 어기면 상태가 어긋나거나 런타임 에러가 난다.

## 규칙 1 — 훅은 최상위에서만 호출한다

훅은 **함수 컴포넌트(또는 커스텀 훅)의 최상위**에서만 호출한다. **조건문·반복문·중첩 함수·early return 이후**에서 호출하면 안 된다.

```tsx
// ❌ 잘못된 예 — 조건문 안에서 호출
function Bad({ show }: { show: boolean }) {
  if (show) {
    const [v, setV] = useState(0); // 렌더마다 훅 호출 순서가 달라짐 → 버그
  }
}

// ✅ 올바른 예 — 최상위에서 호출하고, 조건은 훅 내부/JSX에서 처리
function Good({ show }: { show: boolean }) {
  const [v, setV] = useState(0);
  if (!show) return null;
  return <span>{v}</span>;
}
```

> **이유**: React는 훅을 **호출 순서**로 구별한다. 매 렌더에서 같은 순서로 같은 개수의 훅이 호출돼야 상태가 올바르게 연결된다.

## 규칙 2 — 훅은 React 함수에서만 호출한다

훅은 **함수 컴포넌트** 또는 **커스텀 훅(`use`로 시작하는 함수)** 안에서만 호출한다. 일반 JS 함수·클래스 컴포넌트·이벤트 핸들러 본문에서는 호출하지 않는다.

```tsx
// ✅ 커스텀 훅 — use 접두사 + 내부에서 다른 훅 호출 OK
function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}
```

## 강제 도구

`eslint-plugin-react-hooks`의 `rules-of-hooks` / `exhaustive-deps` 규칙이 위반을 잡아준다. 린트 경고를 무시하지 말 것.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/rules/rules-of-hooks
