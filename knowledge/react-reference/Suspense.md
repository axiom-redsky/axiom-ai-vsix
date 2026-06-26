---
title: "Suspense — 로딩 중 fallback 표시"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [suspense, 서스펜스, fallback, 로딩폴백, 로딩표시, 지연렌더, suspense경계, 로딩바운더리, 스피너표시]
---

# Suspense

`<Suspense>`는 자식이 **로딩되는 동안 대체 UI(fallback)** 를 보여주는 경계 컴포넌트다.

## 시그니처

```tsx
<Suspense fallback={<Loading />}>
  <SomeComponent />
</Suspense>
```

## 무엇을 "기다리나"

- `lazy`로 불러오는 컴포넌트의 코드 로딩. → [react-reference/lazy.md]
- `use(promise)`로 읽는 데이터가 resolve될 때까지. → [react-reference/use.md]

자식 중 하나라도 suspend되면 가장 가까운 `<Suspense>`의 `fallback`이 표시되고, 준비되면 실제 내용으로 교체된다.

## 사용법

```tsx
<Suspense fallback={<Skeleton />}>
  <Profile />     {/* use(dataPromise)로 데이터 읽음 */}
</Suspense>
```

## 주의사항

- 이벤트 핸들러나 `useEffect`에서 시작한 일반 fetch는 Suspense가 잡지 못한다. Suspense 연동 데이터 소스(`use`, 프레임워크 로더)여야 한다.
- 이 프로젝트의 **데이터 로딩 상태는 보통 `useApi`(isLoading)** 로 처리한다 — 스피너/스켈레톤이 목적이면 [patterns/use-api.md] 도 함께 검토.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/Suspense
