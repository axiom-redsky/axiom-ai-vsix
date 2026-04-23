---
title: 프로젝트 구조
tags: [folder, structure, architecture, domain, layer, 아키텍처, 디렉터리, 레이어]
scope: scaffold
---

# 프로젝트 구조 (react-app-scaffold)

## 기술 스택

- **React 19** + **TypeScript** + **Vite 8**
- **TanStack Query v5** (서버 상태 관리)
- **shadcn/ui** + **TailwindCSS 4** (UI)
- **React Router 7** — 해시 기반 (`createHashRouter`)
- **Axios** (HTTP 클라이언트)
- **@loadable/component** (코드 스플리팅)

## 전체 폴더 구조

```
src/
├── core/            # 인프라 레이어 (앱 전체 공통)
│   ├── api/         # HTTP 클라이언트, callApi, ApiError
│   ├── hooks/       # useApi 훅
│   ├── providers/   # AppProviders, QueryProvider
│   ├── query/       # QueryClient, queryKey 팩토리
│   ├── router/      # createAppRouter (createHashRouter 래핑)
│   ├── context/     # 레이아웃 등 전역 Context
│   └── types/       # api-types.ts
├── domains/         # 업무(기능) 도메인 레이어
│   ├── main/        # 메인 화면 도메인
│   │   ├── pages/
│   │   └── router/
│   └── {도메인명}/  # 신규 업무 도메인 (이 구조를 반드시 따른다)
│       ├── pages/
│       └── router/
├── shared/          # 재사용 컴포넌트·유틸
│   ├── components/
│   │   ├── layout/  # RootLayout, AppHeader, AppSidebar
│   │   ├── ui/      # @axiom/components/ui 진입점
│   │   └── shadcn/  # shadcn/ui 원본 컴포넌트
│   └── router/      # 루트 라우터 조합
├── types/           # 전역 타입 (router, global.d.ts)
├── assets/
├── App.tsx
└── main.tsx
```

## 레이어 의존 규칙

| 레이어 | 역할 | 의존 가능 대상 |
|--------|------|---------------|
| `core/` | 인프라, 훅, 설정 | 외부 라이브러리만 |
| `domains/` | 업무 기능 페이지 | `core/`, `shared/`, 같은 도메인 내부 |
| `shared/` | 재사용 UI·유틸 | `core/`만 |

**도메인 간 직접 임포트 금지.** `domains/a`가 `domains/b`를 import하면 안 된다.

## 경로 앨리어스

```typescript
'@'                    → src/
'@axiom/components/ui' → src/shared/components/ui/
'@axiom/hooks'         → src/core/hooks/
'@app-types'           → src/types/
```

### 임포트 규칙

```typescript
// CORRECT
import { useApi } from '@axiom/hooks';
import { Button } from '@axiom/components/ui';
import type { TAppRoute } from '@/types/router';

// INCORRECT — 상대경로 임포트 절대 금지
import { useApi } from '../../core/hooks/use-api';
import { Button } from '../../../shared/components/shadcn/components/ui/button';
```

## 새 도메인 추가 규칙

새 업무 기능은 반드시 `src/domains/{도메인명}/` 아래에 생성한다.

```
src/domains/my-feature/
├── pages/
│   └── MyFeaturePage.tsx    # 페이지 컴포넌트
└── router/
    └── index.tsx            # TAppRoute[] 배열 export default
```

이후 `src/shared/router/index.tsx`에 도메인 라우터를 등록한다.

## 전역 런타임 설정

```typescript
// main.tsx 진입점에서 초기화
import { initApiConfig } from '@/core/api/api-config';

initApiConfig({
  baseURL: window.__MF_APP_CONFIG__?.baseURL ?? import.meta.env.VITE_EXTERNAL_API_BASE_URL1,
});
```

## 전역 변수 타입

```typescript
declare global {
  interface Window {
    $router: IRouter;
    __TANSTACK_QUERY_CLIENT__: QueryClient;
    __MF_APP_CONFIG__: ApiLibConfig;
  }
  const $router: IRouter; // 컴포넌트 외부에서 사용 가능
}
```
