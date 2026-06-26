---
title: "Fragment — 추가 DOM 없이 자식 묶기"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [fragment, react.fragment, 프래그먼트, 빈태그, 빈래퍼, 다중요소반환, 래퍼없이, jsx묶기, key있는fragment]
---

# Fragment (`<>...</>`)

`Fragment`는 **추가 DOM 노드 없이** 여러 자식을 하나로 묶는다. 보통 단축 문법 `<>...</>`로 쓴다.

## 사용법

```tsx
function Row(): React.ReactNode {
  return (
    <>
      <td>이름</td>
      <td>이메일</td>
    </>
  );
}
```

`<div>`로 감싸면 불필요한 래퍼가 생기거나 테이블·flex 레이아웃이 깨질 때 유용하다.

## key가 필요할 때 (목록)

단축 문법은 key를 못 받는다. 반복에서 key가 필요하면 명시적 `Fragment`를 쓴다.

```tsx
import { Fragment } from 'react';

items.map((it) => (
  <Fragment key={it.id}>
    <dt>{it.term}</dt>
    <dd>{it.desc}</dd>
  </Fragment>
));
```

## 주의사항

- Fragment에는 `key` 외의 props(스타일·ref 등)를 줄 수 없다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/Fragment
