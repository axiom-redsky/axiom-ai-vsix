---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '앱 설정 개요'
---

# 앱 설정 개요

`src/config/` 폴더는 **react-app-scaffold 프로젝트가 관리하는 유일한 앱 설정 레이어**입니다.
API 주소, 캐시 정책, 인증 키, 라우터 옵션, 테마 등 프로젝트마다 달라지는 값을 이곳에서 **관심사별 파일(`*.config.ts`)로 분리**해 단일 관리합니다.

:::info core 불가침 원칙
실제 동작 로직은 `src/core/`에 있으며 **수정 대상이 아닙니다(core 불가침)**.
`src/config/`의 설정 객체를 `main.tsx` 등에서 core에 **주입(push)** 하는 구조라서, SI 프로젝트에서 설정을 바꿀 때는 **`src/config/`의 파일(또는 `.env`)만 수정**하면 됩니다.
:::

## 폴더 구조

```sh
src/config/
├── index.ts            # 설정 통합 입구 (모든 *.config.ts를 re-export)
├── api.config.ts       # REST API 설정 (baseURL 등)
├── query.config.ts     # TanStack Query(캐시) 정책 override
├── auth.config.ts      # 인증(토큰 저장 키, 로그인 경로)
├── router.config.ts    # react-router 라우터 생성 옵션
└── theme.config.ts     # 테마(라이트/다크) 설정
```

## 설정 파일 목록

| 파일 | 내보내는 값 | 역할 | 값의 출처 |
|------|------------|------|----------|
| `index.ts` | — | 모든 설정을 한곳에서 re-export 하는 진입점 | — |
| `api.config.ts` | `apiConfig` | REST API 접속 정보(baseURL 등) | `.env` (`VITE_API_BASE_URL`) |
| `query.config.ts` | `queryConfig` | 캐시(staleTime, retry 등) 정책 override | 파일 직접 작성 |
| `auth.config.ts` | `authConfig` | 토큰 저장 키·로그인 경로 | `.env` (`VITE_LOCALSTORAGE_TOKEN_NAME`) + 파일 |
| `router.config.ts` | `routerConfig` | react-router 라우터 옵션(basename 등) | `.env` (`VITE_ROUTER_BASENAME`) |
| `theme.config.ts` | `themeConfig` | 테마 저장 키·기본 테마·다크 클래스 | `.env` (`VITE_THEME_STORAGE_KEY`) + 파일 |

---

### `index.ts` — 설정 통합 입구

모든 `*.config.ts`를 한곳에서 re-export 하는 진입점입니다. 설정을 사용하는 쪽은 항상 `@/config` 하나에서 import 합니다.

```ts
export { queryConfig } from './query.config';
export { apiConfig } from './api.config';
export { authConfig } from './auth.config';
export { routerConfig } from './router.config';
export { themeConfig } from './theme.config';
```

> 새 설정이 늘면 관심사별 파일(`*.config.ts`)을 추가하고 이 파일에서 re-export만 추가하면 됩니다.

---

### `api.config.ts` — REST API 설정

앱이 core에 주입할 API 설정(baseURL 등)을 관리합니다. 값은 `.env`의 `VITE_API_BASE_URL`에서 읽어옵니다.

```ts
export const apiConfig: ApiLibConfig = {
    baseURL: import.meta.env.VITE_API_BASE_URL,
};
```

- **주입 지점**: `main.tsx`에서 `initApiConfig(apiConfig)`로 core에 전달 → 전역 저장(`window.__MF_APP_CONFIG__`)
- **바꾸는 법**: API 접속 정보를 바꿀 때는 이 파일(또는 `.env`)만 수정

---

### `query.config.ts` — Query(캐시) 설정 override

TanStack Query의 기본 캐시 정책을 **덮어쓸 키만** 적는 override 파일입니다. 비워두면 core 기본값을 그대로 사용합니다.

- **기본값 원본**: `core/query/query-client.ts`의 `defaultQueryConfig`
- **주입 지점**: `main.tsx`에서 `initQueryConfig(queryConfig)`로 core에 전달
- **바꾸는 법**: 캐시 정책을 바꿀 때는 바꿀 키만 이 파일에 작성

```ts
export const queryConfig: DefaultOptions = {
    queries: {
        // 예: staleTime: 5 * 60 * 1000,
        // retry: 0, refetchOnWindowFocus: true, gcTime: 0 ...
    },
};
```

---

### `auth.config.ts` — 인증 설정

access token 저장 키, 로그인 경로 등 인증 관련 값을 단일 관리합니다.
기존에는 `main.tsx` / `ProtectedRoute` / `setup-auth-interceptor` 등 여러 곳에서 `VITE_LOCALSTORAGE_TOKEN_NAME`을 각각 직접 읽던 것을 이 파일 하나로 모았습니다.

```ts
export interface AuthConfig {
    /** access token을 저장/조회할 localStorage 키 이름 */
    tokenStorageKey: string;
    /** 미인증 상태에서 이동시킬 로그인 경로 */
    loginPath: string;
}

export const authConfig: AuthConfig = {
    tokenStorageKey: import.meta.env.VITE_LOCALSTORAGE_TOKEN_NAME,
    loginPath: '/auth/login',
};
```

- **바꾸는 법**: 인증 정책을 바꿀 때는 이 파일(또는 `.env`)만 수정

---

### `router.config.ts` — 라우터 설정

react-router 라우터 생성 옵션(`basename`, `future`, `dataStrategy` 등)을 한곳에서 관리합니다.
core(`core/router/index.ts`)가 `createAppRouter(routes, routerConfig)`로 이 객체를 통째로 전달하므로, 옵션이 늘어도 이 파일에 키만 추가하면 됩니다.

```ts
export type RouterConfig = DOMRouterOpts;

export const routerConfig: RouterConfig = {
    // 하위 경로 배포 시 사용하는 basename
    basename: import.meta.env.VITE_ROUTER_BASENAME,
    // future: { ... }, dataStrategy: async () => { ... } 등 추가 가능
};
```

:::note hash/browser 선택은 여기서 다루지 않음
`createHashRouter` / `createBrowserRouter` 선택은 이 옵션이 아니라 **factory 선택 축**이며, 프로젝트 규칙상 `createHashRouter`로 고정되어 있습니다. 만약 `createBrowserRouter` 로 변경을 원할경우, **react-app-scaffold** 프로젝트 담담 공통 개발자가 `src/core/router/app-common-router.ts` 파일을 수정해야합니다.
:::

---

### `theme.config.ts` — 테마(라이트/다크) 설정

테마 저장 키, 기본 테마, 다크 모드 클래스를 관리합니다.
`storageKey`는 **`index.html`의 FOUC 방지 스크립트**와 **`ThemeProvider`** 가 함께 사용하므로, 값의 출처를 `.env`(`VITE_THEME_STORAGE_KEY`) 하나로 통일해 "React 마운트 전 미리 적용 → React가 이어받아 관리"가 매끄럽게 이어집니다.

```ts
export interface ThemeConfig {
	/** 테마를 저장/조회할 localStorage 키 이름 */
	storageKey: string;
	/** window가 없을 때(SSR 등) 사용할 기본 테마 */
	defaultTheme: Theme;
	/** 다크 모드일 때 <html>에 붙이는 클래스 이름 (Tailwind dark: 변형과 연동) */
	darkClassName: string;
}

export const themeConfig: ThemeConfig = {
	storageKey: import.meta.env.VITE_THEME_STORAGE_KEY,
	defaultTheme: 'light',
	darkClassName: 'dark',
};
```

- `index.html` : `%VITE_THEME_STORAGE_KEY%` (Vite HTML 치환)
- TS(`ThemeProvider`) : `import.meta.env.VITE_THEME_STORAGE_KEY` (이 파일 경유)

---

## 관련 환경 변수(`.env`)

설정 값의 상당수는 `.env`에서 읽어옵니다. 기본 제공 값은 다음과 같습니다.

```sh
VITE_API_BASE_URL=https://jsonplaceholder.typicode.com   # api.config.ts
VITE_LOCALSTORAGE_TOKEN_NAME=access_token                # auth.config.ts
VITE_ROUTER_BASENAME=/                                    # router.config.ts
VITE_THEME_STORAGE_KEY=theme                              # theme.config.ts
```
