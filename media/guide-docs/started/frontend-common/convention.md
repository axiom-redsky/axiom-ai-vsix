---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '5. 프로젝트 구조와규칙'
---

# 프로젝트 구조와규칙 정리






## 5단계 
---

> **목표**: 업무 개발자가 투입됐을 때 **"어디에 무엇을 만들면 되는지"** 헷갈리지 않게 규칙을 정해 둔다.

### 5-1. 예제 코드를 남길지 지울지 결정하기

Scaffold에는 학습용 예제가 들어 있는데, **두 종류의 동작이 다릅니다.**

| 예제 | 개발 모드 | 운영 빌드 | 설명 |
|------|:--------:|:--------:|------|
| `publishing/example` | 포함 | **제외** | 빌드 시 자동으로 빠지므로 신경 쓸 필요 없음 |
| `example` | 포함 | **포함됨** | ⚠️ **운영 빌드에도 그대로 들어갑니다** |

:::warning `example` 은 명시적으로 결정해야 합니다
`src/shared/router/index.tsx` 를 보면 `/example` 라우터가 **개발/운영 양쪽 모두에 등록**되어 있습니다.

- **남긴다** → 개발자들이 언제든 참고할 수 있음. 대신 **번들 크기가 커지고 외부에 노출**됩니다.
- **지운다** → 운영 쪽 분기에서 `/example` 등록을 제거합니다.

특히 `/example/use-api` 예제는 `VITE_API_BASE_URL` 로 `/posts` 를 호출하므로, **API 주소를 확인해야합니다**
:::

```tsx title="src/shared/router/index.tsx (현재 구조)"
...(import.meta.env.DEV
    ? [
            { path: '/example', element: <RootLayout />, children: ExampleRouter },
            { path: '/publishing/example', element: <RootLayout />, children: (await import('@/publishing/example/router')).default },
        ]
    : [
            // ↓ 운영 빌드에도 example 이 들어 있습니다. 남길지 지울지 결정하세요.
            { path: '/example', element: <RootLayout />, children: ExampleRouter },
        ]),
```

### 5-2. 업무 폴더 구조 정하기

**업무 하나**는 `src/domains/` 아래에 **폴더 하나**로 만듭니다. ([업무 폴더 구조 만들기 참조](../../documents/dev/create-biz-pages#step-1--%EC%97%85%EB%AC%B4domain-%ED%8F%B4%EB%8D%94-%EA%B5%AC%EC%A1%B0-%EB%A7%8C%EB%93%A4%EA%B8%B0))

```sh
src/domains/<업무이름>/
├── pages/        # 화면 (라우터에 연결되는 단위)
├── components/   # 그 업무 전용 컴포넌트 (pages 구조를 그대로 따라감)
├── store/        # 그 업무 전용 상태
├── router/       # 이 업무의 라우트 목록
└── ...
```

기본 규칙 두 가지만 지키면 됩니다.

- 페이지 파일 안에서 **보조 컴포넌트를 즉석으로 만들지 않습니다.** → 페이지를 제외한 모든 컴포넌트는 `components/` 에 파일로 분리
- props 타입은 `export interface I<컴포넌트명>Props` 형태로 export 합니다

### 5-3. 새 화면 추가 3단계 (업무 개발자에게 알려줄 것)([업무 페이지 만들기 참조](../../documents/dev/create-biz-pages#step-2--업무-화면-만들기))

1. `domains/<업무>/pages/` 에 화면 파일 만들기
2. `domains/<업무>/router/index.tsx` 에 등록
   ```tsx
   const MyPage = loadable(() => import('../pages/MyPage'));
   // { path: 'my-page', element: <MyPage />, name: '내 화면' }
   ```
3. `shared/router/index.tsx` 에 도메인 라우터 연결 + `navigation.tsx` 에 메뉴 추가

자세한 내용은 [업무 페이지 만들기](../../documents/dev/create-biz-pages.md) 를 참고하세요.

### 5-4. 상태 관리 위치 규칙

| 어디에 쓰나 | 위치 |
|------------|------|
| 한 업무에서만 | `domains/<업무>/store/` |
| 여러 업무가 공유 | `shared/store/` |
| 앱 전체 공용 | `core/ui/store.ts` |

만드는 방법은 `@axiom/store` 의 `defineStore` / `createStore` 로 통일합니다.

자세한 내용은 [업무 스토어(Store) 만들기](../../documents/dev/create-global-state.md) 를 참고하세요.

### 5-5. 공통 기능 알려주기 (온보딩)

업무 개발자가 바로 쓸 수 있는 것들입니다. 팀에 미리 안내하세요.

| 기능 | 설명 |
|------|------|
| `@axiom/components/ui` | 공통 UI 컴포넌트 모음 (버튼·입력·모달 등) |
| `SmartTable` | 정렬·페이징·엑셀(CSV/XLSX) 내려받기가 되는 표 |
| `useApi` | 서버 데이터 조회용 훅 (react-query 기반) |
| `api-client` | 공통 axios 인스턴스. 토큰이 자동으로 붙습니다 |
| `$util` / `$ui` / `$router` | 어디서나 쓸 수 있는 전역 도구 (`main.tsx` 에서 등록) |

### 5-6. 경로 별칭(alias)

| 별칭 | 가리키는 곳 |
|------|-----------|
| `@/*` | `src/*` |
| `@axiom/components/ui` | 공통 UI 컴포넌트 |
| `@axiom/hooks` | 공통 훅 |
| `@axiom/store` | 상태 관리 도구 |

:::note `@app-types` 는 아직 못 씁니다
`vite.config.ts` 에만 등록되어 있고 `tsconfig` 에는 없어서 타입 검사에서 경로를 찾지 못합니다.
쓰려면 `tsconfig` 의 `paths` 에도 추가해야 합니다.
:::

### 5-7. 코드 스타일 확정

- **ESLint** + **Prettier** (탭 들여쓰기, 한 줄 최대 120자, 작은따옴표)
- `.vscode/settings.json` 에 저장 시 자동 정리가 설정되어 있습니다
- **브랜치 전략과 커밋 규칙**은 팀에서 합의하고 문서로 남기세요

자세한 내용은 [개발 컨벤션](../getting-started/dev-convention.md) 과 [React 스타일 가이드](../getting-started/react-style-guide.md) 를 참고하세요.
