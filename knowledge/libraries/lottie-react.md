---
title: lottie-react JSON 애니메이션
version: "^2.4"
tags: [lottie, lottie-react, 애니메이션파일, json애니메이션, LottiePlayer, useLottie, 로티]
scope: library
---

# lottie-react

react-app-scaffold에 `lottie-react ^2.4`이 설치되어 있다. Lottie JSON 파일로 벡터 애니메이션을 렌더링한다.

## 기본 사용법 (Lottie 컴포넌트)

```tsx
import Lottie from 'lottie-react';
import loadingAnimation from '@/assets/animations/loading.json';

function LoadingSpinner() {
  return (
    <Lottie
      animationData={loadingAnimation}
      loop={true}
      autoplay={true}
      style={{ width: 120, height: 120 }}
    />
  );
}
```

JSON 파일은 `src/assets/animations/` 폴더에 위치시킨다.

## 주요 Props

```tsx
<Lottie
  animationData={animationJson}  // Lottie JSON 데이터 (필수)
  loop={true}                    // 반복 재생 (기본 true)
  autoplay={true}                // 자동 재생 (기본 true)
  style={{ width: 200 }}        // 크기 설정
  className="my-animation"       // 클래스명
  onComplete={() => {}}          // 재생 완료 콜백 (loop false 시)
  onLoopComplete={() => {}}      // 루프 1회 완료 콜백
/>
```

## 재생 제어 (useLottie 훅)

```tsx
import { useLottie } from 'lottie-react';
import loadingAnimation from '@/assets/animations/loading.json';

function ControlledAnimation() {
  const { View, play, pause, stop, setSpeed } = useLottie({
    animationData: loadingAnimation,
    loop: true,
    autoplay: false,
  });

  return (
    <div>
      {View}
      <button onClick={play}>재생</button>
      <button onClick={pause}>일시정지</button>
      <button onClick={stop}>정지</button>
      <button onClick={() => setSpeed(2)}>2배속</button>
    </div>
  );
}
```

## 특정 프레임 구간 재생

```tsx
const { View } = useLottie({
  animationData: myAnimation,
  loop: false,
  initialSegment: [0, 60],  // 0~60 프레임만 재생
});
```

## TypeScript 타입 (JSON import)

```ts
// tsconfig에 "resolveJsonModule": true 필요 (scaffold 기본 설정됨)
import animationData from '@/assets/animations/sample.json';
// animationData 타입은 자동 추론됨
```
