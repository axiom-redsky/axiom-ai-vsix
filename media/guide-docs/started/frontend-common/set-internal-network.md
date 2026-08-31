---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '3. 내부망 초기 설정'
---

# 내부망 초기 설정과 정상 동작 확인






## 3단계
---

> **목표**: 내부망에서 Scaffold가 제대로 도는지 확인하고, 우리 사이트에 맞게 설정값을 바꾼다.  
> **장소**: 내부망

### 3-1. 설치와 전개

1. **개발 도구 설치** — 1-7에서 반입한 설치 파일로 **Node · Git · VSCode · Chrome** 을 설치하고, `.vsix` / `.crx` 로 익스텐션·확장까지 모두 설치합니다.
   순서와 옵션은 [개발환경구성](../getting-started/set-dev-env-config.md) 페이지를 그대로 따라 하면 됩니다.
   ```bash
   # Node 가 제대로 잡혔는지 확인
   node -v
   npm -v
   ```
2. **소스 전개**  — 반입한 **`react-app-scaffold`** 소스코드를 SI 프로젝트 현장의 Git 레포지토리에 올려놓고, 모든 개발자들이 받을 수 있게합니다.(3-4 참조) 각 개발자들은 레포지토리에서 소스코드를 `clone` 받고 개별 PC에서 개발할 수 있게합니다.

3. **`node_modules.zip` 압축 해제** — 프론트엔드 프로젝트 루트에 `node_modules` 폴더가 생기도록 풉니다

:::tip 설치 파일을 파일서버에 먼저 올려 두세요
내 PC에만 설치하고 끝내면, 다음 사람이 올 때마다 똑같은 파일을 다시 찾게 됩니다.
반입한 설치 파일 묶음을 <Var k="fileServerPath" /> 에 올려 두는 것이 **새 개발자 세팅**에도 좋습니다.
:::

:::danger `npm install` 을 실행하지 마세요
인터넷이 없으므로 실패할 뿐 아니라, 기존 `node_modules` 가 망가질 수 있습니다.
**압축을 푸는 것으로 설치는 끝난 것입니다.**
:::

### 3-2. 정상 동작 확인 (무결성 검증)

아래 4가지가 모두 통과해야 반입이 성공한 것입니다.

```bash
npm run dev        # 1. 개발 서버가 뜨는가
npm run build      # 2. 빌드가 되는가
npm run lint       # 3. 문법 검사가 도는가
npm run test:run   # 4. 테스트가 도는가
```

:::note 알고 있어야 할 두 가지
- **`lint` 는 `.tsx` 파일만 검사합니다.** (`eslint src/**/*.tsx`)
  `.ts` 파일까지 검사하고 싶다면 `package.json` 의 스크립트를 `src/**/*.{ts,tsx}` 로 넓히세요.
- **`test:run` 은 `unit` 과 `browser` 를 모두 실행합니다.**
  1단계에서 브라우저 파일을 반입하지 않았다면 `npx vitest run --project unit` 으로 확인하세요.
:::

### 3-3. 가이드 문서 띄우기

scaffold와 함께 반입한 **`react-app-scaffold-guide`** 도 같은 방법으로 전개합니다.
(소스 전개 → `node_modules.zip` 압축 해제)

그다음 **우리 현장에 맞는 값을 채워 넣습니다.**

1. 가이드를 띄웁니다.
   ```bash
   npm run start     # http://localhost:3002
   ```
2. **`/site-info` 페이지**로 들어가 입력창에서 값을 고칩니다.
   (사내 저장소 주소, 파일서버 경로, Node 버전, 설치 파일 이름 등)
3. 완성된 `site-config.json` 을 내려받아 **원본(`src/config/site-config.json`)을 덮어쓰고 커밋**합니다.
   → 이후 누가 내려받아 띄우든 우리 현장 값이 그대로 나옵니다.

:::tip 한 번만 채워 두면 모든 문서에 반영됩니다
가이드 문서 곳곳에 적힌 주소·버전은 전부 이 파일 하나를 보고 표시됩니다.
값을 바꾸면 **모든 페이지가 한꺼번에 우리 현장 값으로 바뀝니다.**
사이트 주소·상단 메뉴처럼 페이지에 박히는 값(build 항목)만 다시 빌드하면 됩니다.
:::

**팀에 공유하는 방법을 정하세요.** ([1-6 참조 : 가이드 문서도 함께 반입](./preparation-entry#1-6-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%AC%B8%EC%84%9C%EB%8F%84-%ED%95%A8%EA%BB%98-%EB%B0%98%EC%9E%85))

- **개발서버 배포** — `npm run build` 결과물(`build/`)을 개발서버에 올리고 **주소를 공유**합니다. 업무 개발자는 브라우저만 있으면 되므로 이 방법을 권합니다.
- **각자 PC에서 띄우기** — 개발서버가 아직 없다면, 가이드 프로젝트와 `node_modules` 를 함께 받아 `npm run start` 로 봅니다.

:::note 배포한 뒤에도 값을 고칠 수 있습니다
개발서버에 올린 폴더 최상단에도 `site-config.json` 이 복사되어 있습니다.
이 파일만 고치고 새로고침하면 **다시 빌드하지 않아도 반영**됩니다. (사이트 주소·상단 메뉴 같은 build 항목은 제외)
:::

### 3-4. 형상관리(Git) 옮기기

반입한 소스에는 **원래 저장소 주소가 그대로 남아 있습니다.** 사내 저장소로 바꿔 주세요.
보통은 해당 Scaffold 소스코드는 Git담당자가 레포지토리에 올려 주기도 합니다.

```bash
# 기존 원격 저장소 주소 확인
git remote -v

# 기존 주소 제거 후 사내 GitLab 등으로 변경
git remote remove origin
git remote add origin <사내 저장소 주소>
git push -u origin main
```

이 시점의 소스가 **팀 전체의 공통 기준점**이 됩니다.

:::note 가이드 프로젝트도 똑같이 옮기세요
`react-app-scaffold-guide` 도 사내 저장소로 옮겨 두면, 현장에 맞게 문서를 고쳐 나갈 수 있습니다.
(현장 값 수정, 우리 프로젝트 규칙 추가 등)
:::

### 3-5. 새 개발자에게 node_modules 를 어떻게 줄지 정하기

:::important 이것은 반드시 지금 정해야 합니다
나중에 개발자가 늘어날 때마다 **각자 `npm install` 을 할 수 없습니다.**
아래 중 하나를 미리 정하고, 절차를 문서로 남겨 두세요.

- 사내 파일서버에 `node_modules.zip` 을 올려 두고 내려받게 하기 (예: <Var k="fileServerPath" />)
- 사내 npm 미러(사내 저장소) 구축 — 시간이 걸리지만 가장 편함

같은 자리에 **1-7의 개발 도구 설치 파일(Node·Git·VSCode·Chrome, `.vsix`, `.crx`)도 함께** 올려 두세요.
그래야 새 개발자가 [개발환경구성](../getting-started/set-dev-env-config.md) 페이지만 보고 **처음부터 끝까지 혼자 세팅**할 수 있습니다.
:::

:::tip 가이드를 개발서버에 배포했다면
업무 개발자는 **주소로 문서를 보면 되므로** 가이드 프로젝트의 `node_modules` 까지 나눠 줄 필요가 없습니다.
각자 PC에서 띄우는 방식(1-6의 (b))을 쓸 때만 함께 배포하세요.
:::

### 3-6. 설정값 바꾸기 (가장 중요한 부분)

Scaffold에서 **우리가 고치는 곳은 딱 두 군데**입니다.

```sh
.env / .env.production   ← 환경별 값 (주소, 포트, 키 이름 등)
src/config/*.config.ts   ← 그 값을 앱에 전달하는 설정 파일
```

`src/core/` 는 **고치지 않습니다.**

#### 환경 변수(.env) 정리표

저장소에 들어 있는 env 파일은 `.env`(로컬·개발용) 와 `.env.production`(운영용) 두 개입니다.
사이트마다 다른 비밀값은 `.env.local` 에 넣으세요. (`.gitignore` 가 `*.local` 을 제외하므로 커밋되지 않습니다)

| 변수 | `.env` 기본값 | `.env.production` 기본값 | 해야 할 일 |
|------|--------------|------------------------|-----------|
| `PORT` | `5173` | `5173` | 개발 서버 포트 |
| `VITE_BASE_URL` | `/` | `/axiom/react/` | 배포 경로. **끝 슬래시 필수** |
| `VITE_ROUTER_BASENAME` | `/` | `/` | HashRouter라 **양쪽 다 `/` 로 둡니다** |
| `VITE_API_BASE_URL` | `https://jsonplaceholder.typicode.com` | `/` | ⚠️ **기본값이 외부 인터넷 주소입니다. 내부 API 주소로 반드시 교체** |
| `VITE_SERVER_URL` | `http://localhost:4000` | (빈 값) | 개발 중 API 요청을 넘겨줄 서버 주소 |
| `VITE_LOCALSTORAGE_TOKEN_NAME` | `access_token` | 동일 | 로그인 토큰을 저장할 이름 |
| `VITE_THEME_STORAGE_KEY` | `theme` | 동일 | 라이트/다크 저장 키 |
| `VITE_SPLASH_BG` / `_BG_DARK` / `_ACCENT` / `_LOGO` | `#ffffff` / `#0b0f19` / `#4f46e5` / `logo.ico` | 동일 | 첫 화면 로딩 색. **우리 브랜드 색으로 교체** |

:::danger `VITE_BASE_URL` 의 끝 슬래시
`index.html` 이 `%VITE_BASE_URL%logo.ico` 처럼 값을 그대로 이어 붙입니다.
`/axiom/react` 처럼 슬래시를 빼면 `/axiom/reactlogo.ico` 가 되어 **아이콘이 404** 가 납니다.
:::

:::note `VITE_ROUTER_BASENAME` 은 왜 항상 `/` 인가요?
이 프로젝트는 주소에 `#` 이 붙는 **HashRouter** 를 씁니다.
경로 앞부분(`/axiom/react/`)은 `VITE_BASE_URL` 이 이미 처리하므로,
여기에 또 경로를 넣으면 `#` 뒤 주소와 어긋나서 **화면이 안 나옵니다.**
:::

#### src/config 폴더

각 파일의 자세한 설명은 [앱 설정 개요](../app-config/index.md) 페이지를 참고하세요.

| 파일 | 확인할 것 |
|------|----------|
| `api.config.ts` | API 주소 (`VITE_API_BASE_URL` 을 읽어옴) |
| `auth.config.ts` | 토큰 저장 키, 로그인 경로(`/auth/login`) |
| `query.config.ts` | 캐시 정책. 비어 있으면 기본값 사용 |
| `router.config.ts` | 라우터 옵션 (`basename`) |
| `theme.config.ts` | 테마 저장 키, 기본 테마, 다크 클래스 이름 |

:::warning 로그인 화면은 아직 없습니다
`auth.config.ts` 에 `loginPath: '/auth/login'` 이 적혀 있지만, **그 경로의 화면은 아직 만들어져 있지 않습니다.**
`shared/components/router/ProtectedRoute.tsx` 도 파일만 있고 라우터에 연결되어 있지 않습니다.

→ 로그인·권한 기능이 필요하다면 **로그인 화면 제작과 `ProtectedRoute` 연결이 이 프로젝트의 몫**입니다. 범위를 미리 합의하세요.
:::

#### API 연결 방식 정하기

배포 위치가 정해지지 않았다면 두 가지 경우를 모두 준비해 두세요.

| 경우 | 설정 | 주의점 |
|------|------|-------|
| 화면과 API가 **같은 서버** | `VITE_API_BASE_URL=/` | 가장 간단합니다. HashRouter라 웹서버 추가 설정도 필요 없습니다 |
| API가 **다른 서버** | 전체 주소 입력 (`http://api.내부주소`) | 요청에 인증정보를 같이 보내는 설정(`withCredentials: true`)이 켜져 있어서, **서버 쪽에서 CORS 허용 설정이 필요**합니다 |

### 3-7. 브랜드 자산 교체

- [ ] `index.html` 의 `<title>` — 현재 `react-app-scaffold`
- [ ] `public/logo.ico`, `favicon.svg`, `icons.svg`
- [ ] 첫 화면 로딩 색상 (`VITE_SPLASH_*`)
- [ ] `package.json`의 프로젝트 `name`을 현장 프로젝트 이름으로 변경해도 됩니다.
