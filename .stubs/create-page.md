---
keywords: [페이지 만들어줘, 페이지 생성, 페이지 추가, page create, page 만들어, create page, 만들어줘 페이지]
---

> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없어 기본 템플릿으로 페이지를 생성합니다.

---

## 페이지 생성 완료

아래 파일이 생성됩니다. 생성 후 비즈니스 로직을 채워주세요.

**생성 규칙**
- 파일명: `PascalCase + Page` (예: `AccountListPage.tsx`)
- 위치: `src/domains/{domain}/pages/`
- 라우터: 도메인 라우터(`src/domains/{domain}/router/index.tsx`)에 자동 등록

<axiom-action>
{"action":"createFile","templateType":"page","domain":"__DOMAIN__","componentName":"__PAGE_NAME__","filePath":"src/domains/__DOMAIN__/pages/__PAGE_NAME__.tsx"}
```tsx
import type React from 'react';

export default function __PAGE_NAME__(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">__PAGE_NAME__</h1>
      <p className="text-muted-foreground">
        이 페이지의 내용을 작성하세요.
      </p>
    </div>
  );
}
```
</axiom-action>

<axiom-action>
{"action":"createFile","templateType":"router","domain":"__DOMAIN__","componentName":"__PAGE_NAME__","filePath":"src/domains/__DOMAIN__/router/index.tsx"}
```tsx
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const __PAGE_NAME__ = loadable(() => import('@/domains/__DOMAIN__/pages/__PAGE_NAME__'));

const routes: TAppRoute[] = [
  {
    path: '__ROUTE_PATH__',
    element: <__PAGE_NAME__ />,
    name: '__PAGE_NAME__',
  },
];

export default routes;
```
</axiom-action>
