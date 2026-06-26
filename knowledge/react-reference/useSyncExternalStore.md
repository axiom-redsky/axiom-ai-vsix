---
title: "useSyncExternalStore — 외부 스토어 구독 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [usesyncexternalstore, use-sync-external-store, 외부스토어, external-store, 스토어구독, subscribe, getsnapshot, 비-react상태, 브라우저api구독, 라이브러리저자]
---

# useSyncExternalStore

`useSyncExternalStore`는 **React 외부의 스토어**(서드파티 상태 라이브러리, 브라우저 API 등)를 구독해 안전하게 읽는 훅이다. 주로 **라이브러리 저자**가 쓴다.

## 시그니처

```tsx
const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?);
```

- **`subscribe(callback)`**: 스토어 변경 시 `callback`을 부르도록 등록하고, **구독 해제 함수**를 반환.
- **`getSnapshot()`**: 현재 스냅샷 값을 반환(불변, `Object.is`로 비교).
- **`getServerSnapshot()`**(선택): SSR/하이드레이션용 초기 스냅샷.

## 사용법 — 온라인 상태 구독

```tsx
function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
```

## 주의사항

- `getSnapshot`은 값이 안 바뀌면 **같은 참조**를 반환해야 한다(매번 새 객체 → 무한 루프).
- 앱 코드에서 단순 전역 상태는 보통 zustand 등으로 충분하다([libraries/zustand.md]). 이 훅은 저수준 연동용.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useSyncExternalStore
