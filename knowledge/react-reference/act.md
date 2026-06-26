---
title: "act — 테스트에서 업데이트 플러시"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [act, react act, 테스트act, 업데이트플러시, 테스트유틸, render플러시, act경고, not-wrapped-in-act]
---

# act

`act`는 **테스트**에서 렌더·상태 업데이트·이펙트를 **실제 동작처럼 플러시**하도록 감싸는 유틸이다. 단언(assert) 전에 React 작업이 모두 적용되게 한다.

## 시그니처

```tsx
await act(async () => {
  // 렌더·상호작용 트리거
});
```

## 사용법

```tsx
import { act } from 'react';

await act(async () => {
  root.render(<Counter />);
});
// 여기서 DOM 단언
```

## 주의사항

- **테스트 코드 전용**이다(프로덕션 코드에서 쓰지 않음).
- "not wrapped in act(...)" 경고는 상태 업데이트가 act 밖에서 일어났다는 뜻 — 상호작용을 `act`로 감싸면 사라진다.
- React Testing Library의 `render`/`fireEvent`/`userEvent`는 내부적으로 act를 적용하므로, RTL을 쓰면 직접 호출할 일이 적다.

> 💡 이 프로젝트의 테스트 컨벤션(Storybook·RTL·MSW)은 [patterns/testing.md] 를 따른다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/act
