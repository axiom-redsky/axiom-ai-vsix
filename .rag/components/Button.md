---
title: Button 컴포넌트
tags: [button, 버튼, btn, variant, click, tailwind, shadcn]
scope: component
---

# Button 컴포넌트

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
