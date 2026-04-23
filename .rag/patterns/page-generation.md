---
title: 페이지 생성 시나리오
tags: [페이지생성, 페이지만들기, 업무생성, 신규페이지, 페이지추가, 업무추가, createpage, newpage, addpage, 생성해줘, 만들어줘]
scope: pattern
related: [patterns/domain-structure.md, patterns/router.md]
---

# 페이지 생성 시나리오

사용자가 특정 업무(domain)에 페이지 생성을 요청하면, **도메인 존재 여부**에 따라 다른 액션 블록을 생성해야 한다.

## 공통 규칙

- 모든 파일 경로는 `src/domains/{domain}/` 하위
- 페이지 컴포넌트명: PascalCase (예: `AccountMain`)
- 라우터 경로(path): camelCase 소문자 (예: `accountMain`)
- JSON 메타데이터와 코드 블록을 **분리**하여 작성 (JSON 안에 코드를 넣지 말 것)
- axiom-action 블록은 응답 끝에 추가

## axiom-action 블록 형식

JSON 한 줄 다음에 코드 블록을 이어서 작성한다:

```
<axiom-action>
{"action":"createFile","templateType":"page","domain":"account","componentName":"AccountMain","filePath":"src/domains/account/pages/AccountMain.tsx"}
```tsx
// 실제 파일 전체 코드
```
</axiom-action>
```

---

## 시나리오 A — 도메인이 이미 존재하는 경우

**조건**: `src/domains/{domain}/` 폴더가 이미 있음 (시스템이 "[도메인 존재: 존재함]"으로 알림)

**필요한 axiom-action 블록: 2개**

1. **페이지 파일 생성** (`createFile`)
2. **기존 도메인 라우터에 신규 페이지 경로 추가** (`updateFile`) — 시스템이 주입한 기존 라우터 내용을 기반으로 전체 수정본 작성

```
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
```tsx
import type React from 'react';

export default function {ComponentName}(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{ComponentName}</h1>
    </div>
  );
}
```
</axiom-action>

<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
```tsx
// 기존 라우터 내용에 신규 페이지 loadable import + routes 항목 추가한 전체 파일
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const ExistingPage = loadable(() => import('@/domains/{domain}/pages/ExistingPage'));
const {ComponentName} = loadable(() => import('@/domains/{domain}/pages/{ComponentName}'));

const routes: TAppRoute[] = [
  { path: 'existing', element: <ExistingPage />, name: '기존 페이지' },
  { path: '{componentName}', element: <{ComponentName} />, name: '{ComponentName}' },
];

export default routes;
```
</axiom-action>
```

---

## 시나리오 B — 도메인이 존재하지 않는 경우 (신규 도메인)

**조건**: `src/domains/{domain}/` 폴더가 없음 (시스템이 "[도메인 존재: 없음]"으로 알림)

**필요한 axiom-action 블록: 3개**

1. **페이지 파일 생성** (`createFile`)
2. **도메인 라우터 파일 생성** (`createFile`, templateType: `router`)
3. **루트 라우터에 도메인 등록** (`updateFile`) — 시스템이 주입한 현재 루트 라우터 내용을 기반으로 전체 수정본 작성

```
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
```tsx
import type React from 'react';

export default function {ComponentName}(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{ComponentName}</h1>
    </div>
  );
}
```
</axiom-action>

<axiom-action>
{"action":"createFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
```tsx
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const {ComponentName} = loadable(() => import('@/domains/{domain}/pages/{ComponentName}'));

const routes: TAppRoute[] = [
  {
    path: '{componentName}',
    element: <{ComponentName} />,
    name: '{ComponentName}',
  },
];

export default routes;
```
</axiom-action>

<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/shared/router/index.tsx"}
```tsx
// 기존 루트 라우터 내용에 신규 도메인 import + routes 항목 추가한 전체 파일
import type { TAppRoute } from '@/types/router';
import RootLayout from '@/shared/components/layout/RootLayout';
import MainRouter from '@/domains/main/router';
import {Domain}Router from '@/domains/{domain}/router';

const routes: TAppRoute[] = [
  { path: '/', element: <RootLayout />, children: MainRouter },
  { path: '/{domain}', element: <RootLayout />, children: {Domain}Router },
  { path: '*', element: <RootLayout /> },
];

export default routes;
```
</axiom-action>
```
