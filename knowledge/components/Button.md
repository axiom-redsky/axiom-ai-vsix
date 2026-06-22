---
title: Button 컴포넌트
category: component
tags: [button, 버튼, btn, variant, click, 클릭, onclick, 이벤트, event, 핸들러, handler, props, 프롭스,
       disabled, 비활성, 로딩, ispending, tailwind, shadcn, 사용법, 사용 예]
scope: component
---

# Button 컴포넌트

`@axiom/components/ui`의 Button을 **import → JSX 배치 → props → 이벤트 연결 → 스타일** 순으로 정리한다.

## 임포트

```typescript
import { Button } from '@axiom/components/ui';
```

`@axiom/components/ui`에서 임포트한다. 내부 경로 직접 임포트 금지.

## variant 목록

| variant | 용도 |
|---------|------|
| `default` | 기본 주요 액션 |
| `secondary` | 보조 액션 |
| `outline` | 테두리형 버튼 |
| `ghost` | 배경 없는 버튼 |
| `destructive` | 삭제·위험 액션 |
| `link` | 링크 스타일 |

## 기본 사용 예시

```tsx
import { Button } from '@axiom/components/ui';

// 기본 버튼
<Button>저장</Button>

// variant 지정
<Button variant="outline">취소</Button>
<Button variant="destructive">삭제</Button>
<Button variant="ghost">닫기</Button>

// size 지정
<Button size="sm">작은 버튼</Button>
<Button size="lg">큰 버튼</Button>

// 비활성화
<Button disabled>비활성</Button>

// 로딩 상태 (isPending과 조합)
<Button disabled={isPending}>
  {isPending ? '저장 중...' : '저장'}
</Button>
```

## 이벤트 연결 (onClick) · props

핸들러를 `onClick`에 연결하고, 상태에 따라 `disabled`를 바인딩한다. Button은 표준 HTML
`<button>` 속성(`onClick`·`type`·`disabled` 등)을 그대로 받는다.

```tsx
import { Button } from '@axiom/components/ui';
import { useApi } from '@axiom/hooks';

export default function SavePanel(): React.ReactNode {
  // 1. 상태/페치
  const { mutate: save, isPending } = useApi<void, TSaveBody>('/api/items', { method: 'POST' });

  // 2. 핸들러
  const handleSave = () => {
    save({ name: '신규' });
  };

  // 3. JSX 바인딩 — onClick 연결 + 상태로 disabled/문구 제어
  return (
    <div className="flex gap-2">
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? '저장 중…' : '저장'}
      </Button>
      <Button variant="outline" onClick={() => history.back()}>
        취소
      </Button>
    </div>
  );
}
```

자주 쓰는 props: `variant`(위 표) · `size`(`sm`/`lg`/`icon`) · `disabled` · `onClick` · `type`(`button`/`submit`) · `className`(스타일 확장).

> 삭제처럼 확인이 필요한 액션은 `onClick`에서 전역 `$ui.confirm`과 결합한다:
> `const ok = await $ui.confirm('삭제할까요?'); if (ok) remove();`

## 아이콘과 조합

```tsx
import { Button } from '@axiom/components/ui';
import { Send, Plus, Trash2 } from 'lucide-react';

<Button>
  <Send className="w-4 h-4 mr-2" />
  전송
</Button>

<Button variant="outline" size="icon">
  <Plus className="w-4 h-4" />
</Button>
```

## TailwindCSS 스타일 조합

```tsx
// 브랜드 컬러 버튼 (커스텀)
<button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md">
  액션 버튼
</button>

// 다크모드 지원
<Button className="dark:bg-gray-800 dark:text-white">
  다크모드 버튼
</Button>
```

## 주의사항

- 상대경로 임포트 금지: `import { Button } from '../../shared/components/...'`
- `@axiom/components/ui`는 `src/shared/components/ui/index.ts`를 통해 shadcn/ui를 재export
