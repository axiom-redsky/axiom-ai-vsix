---
title: 업무 페이지 만들기 (단계별 가이드)
category: pattern
kind: pattern
priority: 1
tags: [페이지만들기, 페이지 만들기, 페이지 만드는법, 페이지 만드는 법, 화면만들기, 화면 만들기, 화면 만드는법, 페이지생성, 페이지 생성, 페이지생성법, 페이지추가, 새페이지, 신규페이지, 업무페이지, 비즈니스페이지, biz-page, create-biz-pages, create-page, 페이지 작성, 화면 작성, 라우터 연결, 페이지 등록]
scope: page-template
related: [patterns/domain-structure.md, patterns/router.md, patterns/page-generation.md]
---

# 업무 페이지 만들기 (단계별 가이드)

업무 개발자가 자신이 맡은 **도메인(업무) 폴더**에 화면(페이지) 컴포넌트를 만들고,
라우터에 연결한 뒤 브라우저로 확인하는 전체 과정을 설명한다.

> 모든 작업은 `src/domains/{도메인명}/` 아래에서 이뤄진다. 도메인명은 **kebab-case**(예: `account`, `user-management`).

---

## 1단계 — 도메인 폴더 구성

필요한 폴더만 만들어 사용한다. `account` 도메인을 예로 들면:

```
src/domains/account/
├── api/
│   └── url.ts            ← 도메인 API 경로 모음 (선택)
├── components/
│   └── AccountList.tsx   ← 도메인 전용 컴포넌트 (선택)
├── pages/
│   ├── AccountIndex.tsx  ← 페이지 컴포넌트
│   └── AccountUsage.tsx
├── router/
│   └── index.tsx         ← 도메인 라우터(페이지 라우트) (TAppRoute[])
├── store/                ← 도메인 상태 (선택)
└── types/
    └── index.ts          ← 도메인 타입 (선택)
```

- **pages/** : 실제 화면 컴포넌트(`.tsx`)
- **router/** : 이 도메인의 라우트 정의 (`router/index.tsx` 1개)
- 나머지(`api`, `components`, `common`, `hooks`, `store`, `types`)는 필요할 때만 생성

---

## 2단계 — 페이지 컴포넌트 작성

`pages/` 폴더에 PascalCase 파일로 만든다. 페이지 컴포넌트는 **default export** 한다.

```tsx
// src/domains/account/pages/AccountIndex.tsx
import type React from 'react';
import { useEffect } from 'react';

interface IAccountIndexProps {
  test?: string;
}

export default function AccountIndex({}: IAccountIndexProps): React.ReactNode {
  useEffect(() => {
    // 최초 진입 시 처리
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">계좌 메인 Page</h1>
    </div>
  );
}
```

> **네이밍**: 페이지 컴포넌트는 PascalCase(`AccountIndex`, `UserListPage`).
> 타입/인터페이스는 `T`/`I` 접두사(`IAccountIndexProps`). → [네이밍 규칙](../conventions/naming.md)

서버 데이터가 필요하면 **`useApi`** 로 조회한다(`useQuery`/`useMutation` 직접 사용 금지).

```tsx
import { useApi } from '@axiom/hooks';

const { data, isLoading, error } = useApi<TAccount[]>('/api/accounts');
```

---

## 3단계 — 도메인 라우터에 연결 (페이지 라우트 등록)

`router/index.tsx` 에서 `loadable()` 로 페이지를 지연 로딩하고 `TAppRoute[]` 로 export 한다.

```tsx
// src/domains/account/router/index.tsx
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const AccountIndex = loadable(() => import('@/domains/account/pages/AccountIndex'));

const routes: TAppRoute[] = [
  {
    path: 'account-page',   // ← kebab-case
    element: <AccountIndex />,
    name: '계좌 메인',
  },
];

export default routes;
```

- `path` 는 **kebab-case** (예: `account-page`).
- `loadable` 을 처음 쓰면 `import loadable from '@loadable/component';` 를 반드시 추가.
- `name` 은 메뉴/탭 등에 노출되는 한글 표시명.

---

## 4단계 — 전역 라우터에 도메인 등록 (업무 라우트 등록, 최초 업무 생성시 한번만)

`src/shared/router/index.tsx` 에 도메인 라우터를 import 하고 `children` 으로 연결한다.

```tsx
// src/shared/router/index.tsx
import type { TAppRoute } from '@/types/router';
import RootLayout from '@/shared/components/layout/RootLayout';
import MainRouter from '@/domains/main/router';
import accountRouter from '@/domains/account/router';   // ← 추가

const routes: TAppRoute[] = [
  { path: '/', element: <RootLayout />, children: MainRouter },
  {
    path: '/account',                  // ← 도메인 베이스 경로
    element: <RootLayout />,
    children: accountRouter,
  },
  { path: '*', element: <RootLayout /> },
];

export default routes;
```

최종 URL = `전역 베이스 경로(업무 라우트)` + `도메인 라우터 path(페이지 라우트)`:

```
/account  +  account-page  →  #/account/account-page
```

---

## 5단계 — 브라우저로 확인

개발 서버를 실행한 뒤(`npm run dev`), 해시 라우팅 경로로 접속한다.

```
http://localhost:{port}/#/account/account-page
```

화면(`AccountIndex`)이 보이면 연결 성공.

---

## 요약 체크리스트

1. `src/domains/{도메인}/pages/{Page}.tsx` — 페이지 컴포넌트(default export)
2. `src/domains/{도메인}/router/index.tsx` — `loadable` + `TAppRoute[]` (페이지 라우트 등록)
3. `src/shared/router/index.tsx` — 도메인 라우터 `children` 등록 (업무 라우트 등록)
4. 브라우저에서 `#/{도메인}/{path}` 접속해 확인

## 규칙 요약

- 페이지 컴포넌트: PascalCase + default export / 라우트 `path`: kebab-case
- import 는 항상 앨리어스: `@axiom/hooks`, `@axiom/components/ui`, `@/...` (상대경로 금지)
- API 통신은 `useApi` 하나로 통일
- 다른 도메인 직접 import 금지(`domains/account` → `domains/user` ✗), 공통은 `shared/`

> 관련: [도메인 구조 규칙](../patterns/domain-structure.md) · [라우터 패턴](../patterns/router.md) · [페이지 생성 시나리오](../patterns/page-generation.md)
