---
title: "useLayoutEffect — 페인트 전 동기 이펙트 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [uselayouteffect, use-layout-effect, 레이아웃이펙트, 동기이펙트, 페인트전, 측정, measure, getboundingclientrect, 깜빡임방지, 툴팁위치]
---

# useLayoutEffect

`useLayoutEffect`는 `useEffect`와 같지만 **브라우저가 화면을 그리기(paint) 전에 동기적으로** 실행된다. DOM을 측정해 즉시 재배치해야 하는 경우(깜빡임 방지)에 쓴다.

## 시그니처

```tsx
useLayoutEffect(setup, dependencies?);
```

## 사용법 — 레이아웃 측정 후 위치 조정

```tsx
function Tooltip(): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    setHeight(ref.current!.getBoundingClientRect().height); // 페인트 전 측정
  }, []);
  return <div ref={ref}>...</div>;
}
```

## 주의사항

- **페인트를 막으므로 성능에 불리**하다. 측정이 꼭 필요한 경우가 아니면 **`useEffect`를 기본**으로 쓴다. → [react-reference/useEffect.md]
- 서버 렌더(SSR)에서는 실행되지 않아 경고가 날 수 있다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useLayoutEffect
