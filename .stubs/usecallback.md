---
keywords: [usecallback, usememo, memo, callback, 메모이제이션, 최적화, performance]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## useCallback / useMemo 예제

```typescript
import { useState, useCallback, useMemo } from 'react';

function ExpensiveList({ items }: { items: number[] }) {
  const [filter, setFilter] = useState('');

  // 함수 참조 고정 — 자식 컴포넌트 불필요 리렌더 방지
  const handleClick = useCallback((id: number) => {
    console.log('선택:', id);
  }, []); // 의존성 없으면 빈 배열

  // 계산 비용이 큰 값 메모이제이션
  const filtered = useMemo(
    () => items.filter(n => String(n).includes(filter)),
    [items, filter], // items 또는 filter 변경 시에만 재계산
  );

  return (
    <div>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      {filtered.map(n => (
        <div key={n} onClick={() => handleClick(n)}>{n}</div>
      ))}
    </div>
  );
}
```
