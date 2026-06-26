---
title: "useEffect — 외부 시스템 동기화 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useeffect, use-effect, 이펙트, effect, 부수효과, side-effect, 의존성배열, dependency, 의존성, cleanup, 정리함수, 구독, subscription, 외부동기화]
---

# useEffect

`useEffect`는 컴포넌트를 **외부 시스템과 동기화**하는 훅이다(구독, 타이머, 직접 DOM 조작, 비-React 라이브러리 연동 등). 렌더 결과가 화면에 **반영된 뒤(paint 이후)** 실행된다.

## 시그니처

```tsx
useEffect(setup, dependencies?);
```

- **`setup`**: 이펙트 함수. 선택적으로 **정리(cleanup) 함수**를 반환한다.
- **`dependencies`**: 이펙트가 의존하는 반응형 값(props·state·파생값)의 배열.

## 의존성 배열 동작

```tsx
useEffect(() => { /* ... */ }, [a, b]); // a 또는 b가 바뀔 때만 재실행
useEffect(() => { /* ... */ }, []);     // 마운트 시 1회만
useEffect(() => { /* ... */ });         // 매 렌더마다 (의존성 생략)
```

React는 의존성을 **Object.is로 얕게 비교**한다. 하나라도 바뀌면 (이전 cleanup 실행 →) setup을 다시 실행한다.

## 정리(cleanup) 함수

구독·타이머처럼 **해제가 필요한 것**은 cleanup으로 정리한다. 다음 이펙트 실행 전과 언마운트 시 호출된다.

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id); // 정리
}, []);
```

## 주의사항

- 의존성 배열은 **개발자가 고르는 게 아니라** 이펙트 안에서 쓰는 모든 반응형 값으로 결정된다. 빼먹으면 stale closure(오래된 값 참조) 버그가 난다.
- **데이터 변환·이벤트 처리에는 이펙트가 필요 없다.** 렌더 중 계산할 수 있으면 이펙트로 빼지 말 것.
- 훅이므로 컴포넌트 **최상위에서만** 호출. → [react-reference/rules-of-hooks.md]

> 💡 이 프로젝트에서 **서버 데이터 조회/통신은 `useEffect + fetch`가 아니라 `useApi`(TanStack Query 래퍼)** 를 쓴다. 데이터 페치 목적이면 [patterns/use-api.md] 를 먼저 보라.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useEffect
