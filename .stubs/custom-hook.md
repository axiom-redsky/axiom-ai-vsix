---
keywords: [custom hook, 커스텀 훅, custom 훅, 훅 만들기, 훅 생성, use 훅]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## 커스텀 훅 뼈대

```typescript
import { useState, useEffect, useRef } from 'react';

// 네이밍: use + 도메인명 (Pascal case)
function useMyHook(param: string) {
  const [value, setValue] = useState<string | null>(null);
  const prevParam = useRef(param);

  useEffect(() => {
    // param이 바뀔 때 실행할 로직
    prevParam.current = param;
    setValue(param.toUpperCase());

    return () => {
      // 정리(cleanup) 로직
    };
  }, [param]);

  const reset = () => setValue(null);

  // 외부에서 필요한 값/함수만 반환
  return { value, reset };
}

// 사용 예시
function MyComponent() {
  const { value, reset } = useMyHook('hello');
  return <button onClick={reset}>{value}</button>;
}
```
