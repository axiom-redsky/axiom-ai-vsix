---
title: animejs 애니메이션 라이브러리
version: "^4.3"
tags: [animejs, anime, 애니메이션, animation, animate, timeline, 모션, easing]
scope: library
---

# animejs

react-app-scaffold에 `animejs ^4.3`이 설치되어 있다. v3과 API가 크게 달라졌으므로 주의.

## v4 vs v3 핵심 차이

```ts
// v3 방식 — 사용 금지
import anime from 'animejs';
anime({ targets: '.box', translateX: 250 });

// v4 올바른 방법
import { animate } from 'animejs';
animate('.box', { translateX: 250 });
```

v4에서는 `animate` named export 사용. default import 방식 제거됨.

## 기본 사용법

```ts
import { animate } from 'animejs';

animate('.target', {
  translateX: 250,
  opacity: [0, 1],    // [시작값, 끝값]
  duration: 800,
  easing: 'easeOutExpo',
});
```

## React useRef 연동 패턴

```tsx
import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

function FadeInBox() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    animate(ref.current, {
      opacity: [0, 1],
      translateY: [-20, 0],
      duration: 600,
      easing: 'easeOutCubic',
    });
  }, []);

  return <div ref={ref}>내용</div>;
}
```

DOM 선택자보다 `ref.current`를 직접 전달하는 방식이 React에서 안전하다.

## 타임라인 (순차 애니메이션)

```ts
import { createTimeline } from 'animejs';

const tl = createTimeline({ defaults: { easing: 'easeOutExpo', duration: 500 } });

tl.add(ref1.current, { opacity: [0, 1] })
  .add(ref2.current, { translateX: [0, 100] }, '+=200') // 200ms 딜레이
  .add(ref3.current, { scale: [0.8, 1] });
```

## 자주 쓰는 easing 값

| easing | 설명 |
|--------|------|
| `'easeOutExpo'` | 빠르게 시작, 천천히 끝 |
| `'easeInOutCubic'` | 부드러운 시작·끝 |
| `'linear'` | 일정한 속도 |
| `'spring(1, 80, 10, 0)'` | 스프링 물리 효과 |

## 반복·방향 옵션

```ts
animate('.box', {
  rotate: 360,
  duration: 1000,
  loop: true,        // 무한 반복
  direction: 'alternate', // 왕복
});
```
