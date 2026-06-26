---
title: "createPortal — 다른 DOM 노드로 렌더"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [createportal, create-portal, 포털, portal, 다른돔, body에렌더, 모달포털, 오버레이, z-index탈출, document.body]
---

# createPortal

`createPortal`은 자식을 **부모 컴포넌트 트리와 다른 DOM 노드**(예: `document.body`)에 렌더한다. 모달·툴팁·오버레이가 부모의 `overflow`/`z-index`에 갇히지 않게 할 때 쓴다.

## 시그니처

```tsx
createPortal(children, domNode, key?);
```

## 사용법

```tsx
import { createPortal } from 'react-dom';

function Modal({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className="overlay">{children}</div>,
    document.body, // body 바로 아래에 렌더
  );
}
```

## 주의사항

- DOM 위치만 옮겨질 뿐, **React 트리상으로는 여전히 부모의 자식**이다 → context·이벤트 버블링이 React 트리 기준으로 동작한다.
- `react-dom`에서 import한다(`react` 아님).

> 💡 이 프로젝트는 모달·시트가 필요하면 보통 shadcn `Dialog`/`Sheet`(내부적으로 포털 사용)를 쓴다. → [components/Dialog.md]

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react-dom/createPortal
