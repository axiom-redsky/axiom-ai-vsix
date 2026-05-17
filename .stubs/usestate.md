---
keywords: [usestate, useeffect, state, effect, 상태 관리, 상태관리, 사이드 이펙트]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## useState / useEffect 예제

```typescript
import { useState, useEffect } from 'react';

function Counter() {
  const [count, setCount] = useState<number>(0);
  const [title, setTitle] = useState<string>('');

  // count 변경 시 document title 업데이트
  useEffect(() => {
    document.title = `클릭 수: ${count}`;
  }, [count]);

  // 마운트 시 한 번만 실행
  useEffect(() => {
    setTitle('카운터 컴포넌트');
    return () => {
      // 언마운트 시 정리
      document.title = '앱';
    };
  }, []);

  return (
    <div>
      <h1>{title}</h1>
      <p>{count}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}
```
