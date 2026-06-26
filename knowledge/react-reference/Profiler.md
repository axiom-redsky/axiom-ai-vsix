---
title: "Profiler — 렌더 성능 측정"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [profiler, 프로파일러, 렌더측정, 성능측정, onrender, 렌더비용, 렌더타이밍, 성능프로파일링]
---

# Profiler

`<Profiler>`는 트리의 **렌더링 성능을 프로그램적으로 측정**한다. 개발 중 렌더 비용을 계측할 때 쓴다.

## 시그니처

```tsx
<Profiler id="Sidebar" onRender={onRender}>
  <Sidebar />
</Profiler>
```

- **`id`**: 측정 구간 이름.
- **`onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)`**: 커밋마다 호출되는 콜백.

## 사용법

```tsx
function onRender(id: string, phase: 'mount' | 'update' | 'nested-update', actualDuration: number) {
  console.log(`${id} (${phase}) ${actualDuration.toFixed(1)}ms`);
}
```

## 주의사항

- 측정 자체에 **오버헤드**가 있어, 프로덕션 빌드에서는 기본 비활성(추가 측정은 별도 빌드 필요).
- 일상 디버깅엔 React DevTools의 Profiler 탭이 더 편하다 — 이 API는 자동 수집·회귀 추적용.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/Profiler
