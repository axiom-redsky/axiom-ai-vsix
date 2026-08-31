---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '1. 반입 준비'
---

# 반입 준비

폐쇄망 환경에서 Scaffold 프로젝트를 진행하기 위한 사전 준비작업입니다.


## 1단계
---

> **목표**: 인터넷이 되는 곳에서, 내부망에 가지고 들어갈 파일 묶음을 완성한다.  
> **장소**: 인터넷이 되는 외부망 PC

내부망에 들어가면 **아무것도 새로 내려받을 수 없습니다.** 그래서 필요한 것은 모두 인터넷이 되는 외부망 PC에서 전부 챙겨야 합니다.

### 1-1. Node 버전을 먼저 정하기

Scaffold에는 Node 버전을 강제하는 설정(`engines`, `.nvmrc`)이 **아직 없습니다.**
사람마다 다른 버전을 쓰면 "제 PC에서는 되는데요" 문제가 생기므로 **팀이 쓸 버전 하나를 정해 두세요.**

- Scaffold가 검증한 기준 버전: **Node <Var k="nodeVersion" plain /> / npm <Var k="npmVersion" plain />**
- 최소 조건: Vite 8 / TypeScript 6 계열을 쓰므로 **Node 20 이상** 필수

:::warning Node 설치 파일도 함께 반입하세요
내부망 PC에는 Node가 없을 수 있습니다. 설치 파일(<Var k="nodeMsiFile" plain /> 또는 <Var k="nodeZipFile" plain />)을 반입 목록에 꼭 넣으세요.
버전 고정을 위해 `.nvmrc` 파일을 추가하거나, 반입 문서에 버전을 적어 두는 것을 권합니다.
:::




### 1-2. node_modules 만들기

```bash
# 반드시 ci 를 사용합니다 (install 이 아님)
npm ci
```

:::info 왜 `npm install` 이 아니라 `npm ci` 인가요?
- `npm install` : 상황에 따라 **버전이 바뀔 수 있고** `package-lock.json` 도 함께 수정됩니다.
- `npm ci` : `package-lock.json` 에 적힌 **정확히 그 버전 그대로** 설치합니다.

내부망에서는 다시 설치할 방법이 없으므로, **똑같이 재현되는 `npm ci`** 를 써야 합니다.
:::

설치가 끝나면 `node_modules` 폴더를 **통째로 압축**합니다. (예: `node_modules.zip`)




### 1-3. 디자인 토큰 CSS가 최신인지 확인 (자주 놓치는 부분)

색상·간격 같은 값은 `src/design-tokens/` 의 JSON 파일이 원본이고, 실제 사용되는 CSS파일은 이 JSON파일을 **CSS로 변환**해서 사용합니다. 따라서 항상 최신 JSON이 적용된 CSS 파일인지 확인이 되어야 합니다.

```bash
npm run build:tokens   # (변환 명령어) JSON → CSS 변환
```

:::danger `npm run build` 에는 토큰 변환이 들어있지 않습니다
`build` 명령은 `tsc -b && vite build` 뿐이라 **토큰을 다시 만들지 않습니다.**
변환 결과물(`src/assets/styles/tokens/*.css`)이 저장소에 이미 들어 있어서 빌드는 그냥 통과하지만,
**토큰 JSON을 고쳤는데 `build:tokens` 를 돌리지 않으면 바뀐 색이 배포본에 반영되지 않습니다.**

→ 토큰 JSON을 수정했다면 **`build:tokens` 실행 후 생성된 CSS까지 반드시 커밋**하세요.
:::

### 1-4. 빌드가 되는지 미리 확인

반입하기 전에 미리 빌드가 잘 되는지 확인해봐야 합니다. 
반입한 뒤에 빌드가 안 되면 되돌릴 방법이 없습니다. **나가기 전에 반드시 확인**하세요.

```bash
npm run build:tokens
npm run build
```

### 1-5. 단위 테스트용 브라우저 파일 결정

테스트 도구(Vitest)는 두 종류로 나뉘어 있습니다.

| 종류 | 설명 | 폐쇄망에서 |
|------|------|-----------|
| `unit` | jsdom 기반 일반 테스트 | **정상 동작** |
| `browser` | 실제 Chromium 브라우저로 실행 | 브라우저 파일을 따로 받아야 함  |

둘 중 하나를 선택하세요.

- **(a) 브라우저 캐시 폴더도 함께 반입** - 해당 파일을 압축해서 반입
  - Windows: `%USERPROFILE%\AppData\Local\ms-playwright`
  - macOS/Linux: `~/.cache/ms-playwright`
- **(b) 브라우저 테스트는 쓰지 않고 단위 테스트만 운영**
  ```bash
  npx vitest run --project unit
  ```

### 1-6. 가이드 문서도 함께 반입

지금 보고 있는 이 가이드는 **`react-app-scaffold-guide` 라는 별도의 프로젝트**입니다.
내부망에서는 인터넷 주소로 접속할 수 없으므로, **scaffold 프로젝트와 함께 반입**해서 현장에서 직접 띄워 보게 만듭니다.

#### 준비 방법

가이드도 하나의 프로젝트이므로, **1-2 에서 한 것과 똑같이** 준비하면 됩니다. 따라서 `node_modules`폴더 압축과 소스코드를 반입하면 됩니다.

```bash
# react-app-scaffold-guide 폴더에서
npm ci          # node_modules 생성 → 통째로 압축
npm run build   # 빌드가 되는지 미리 확인
```

#### 가이드 프로젝트에 현장 값 채워 넣기 (site-config.json)

가이드 안에서 **현장마다 달라지는 값(Node 버전, 파일서버 경로, 저장소 주소 등)은 파일 하나에 모여 있습니다.**

```sh
src/config/site-config.json    # 값의 원본
site-config.json               # 빌드하면 배포 폴더 최상단에 복사됨 (현장에서 고치는 파일)
```

:::tip JSON을 몰라도 값을 고칠 수 있습니다
가이드 사이트의 **`/site-info` 페이지**를 열면 입력창으로 값을 고치고, 완성된 `site-config.json` 을 그대로 내려받을 수 있습니다.
- **runtime 값** : 배포 폴더의 `site-config.json` 만 고치고 새로고침 → **즉시 반영** (다시 빌드할 필요 없음)
- **build 값** : 사이트 주소·상단 메뉴처럼 페이지에 박히는 값 → **다시 빌드해야 반영**

어느 쪽인지는 `/site-info` 페이지의 표에 표시됩니다.
:::

#### 현장에서 문서를 보는 방법 2가지

| 방법 | 하는 일 | 어떻게 보나 | 언제 쓰나 |
|------|--------|-----------|----------|
| **(a) 개발서버에 배포** (권장) | `npm run build` → `build/` 폴더를 개발서버에 올림 | 공유받은 **주소로 접속** | 팀 전체가 같은 문서를 보게 할 때 |
| **(b) 각자 PC에서 띄우기** | 가이드 프로젝트를 내려받아 `npm run start` | 내 PC의 `http://localhost:3002` | 개발서버가 아직 없거나, 문서를 직접 고쳐 볼 때 |

**(a) 개발서버에 배포하기**

```bash
# 가이드 프로젝트 폴더에서
npm run build     # build/ 폴더 생성 → 개발서버 웹 경로에 그대로 복사
```

배포가 끝나면 **가이드 주소를 팀 전체에 공유**하면됩니다.

**(b) 각자 PC에서 띄우기**

```bash
# 가이드 프로젝트 폴더에서 (node_modules 가 준비되어 있어야 합니다)
npm run start     # http://localhost:3002 로 열림
```

:::warning 가이드 업데이트
* 현장 상황에 맞춰 가이드가 변경될 수 있습니다. 만약 각 개발자가 개별로 가이드를 띄워서 본다면 업데이트된 가이드 내용을 바로 확인이 힘들 수도 있습니다.
:::



### 1-7. 개발 도구 설치 파일 챙기기

지금까지는 **프로젝트 파일**만 준비했습니다. 그런데 내부망 PC에는 **개발 도구 자체가 하나도 없을 수 있습니다.**
소스와 `node_modules` 를 아무리 잘 반입해도, **열어 볼 편집기(VSCode)와 실행할 Node 가 없으면 아무것도 못 합니다.**

각 도구의 설치 방법·설정값은 [개발환경구성](../getting-started/set-dev-env-config.md) 페이지에 정리되어 있습니다.
여기서는 **그 페이지가 요구하는 파일들을 반입 목록 관점에서** 확인합니다.

| 도구 | 반입할 파일 | 없으면 생기는 일 |
|------|-----------|----------------|
| **Node.js** | <Var k="nodeMsiFile" plain /> 또는 <Var k="nodeZipFile" plain /> | `npm run dev` 자체가 안 됨 |
| **Git** | <Var k="gitInstallerFile" plain /> | 소스 clone·형상관리 불가. Windows에서 **Git Bash 터미널도 못 씀** |
| **VSCode** | <Var k="vscodeInstallerFile" plain /> | 코드 편집기가 없음 |
| **VSCode 익스텐션** | `*.vsix` 파일 (ESLint / Prettier / GitLens 는 필수) | 저장 시 자동 정리·문법 검사가 안 되어 **코드 스타일이 제각각**이 됨 |
| **Chrome** | <Var k="chromeInstallerFile" plain /> | 개발자 도구로 화면 디버깅 불가 |
| **Chrome 확장** | `*.crx` 파일 (React DevTools / Redux DevTools / TanStack Query DevTools) | 컴포넌트 트리·상태 변화를 볼 수 없음 |

:::danger 익스텐션과 확장 프로그램은 "설치 파일"을 따로 챙겨야 합니다
내부망에서는 **VSCode 마켓플레이스와 Chrome 웹스토어에 접속할 수 없어서**, 도구를 설치해도 익스텐션은 검색조차 되지 않습니다.

- **VSCode 익스텐션** → 외부망에서 **`.vsix` 파일로 내려받아** 반입 (설치 방법은 [개발환경구성 · VSIX 설치](../getting-started/set-dev-env-config.md) 참고)
- **Chrome 확장** → **`.crx` 파일로** 내려받아 반입 후, `chrome://extensions` 에 드래그앤드롭
:::

:::warning 오프라인 설치 시 주의 (설치 중 인터넷을 찾습니다)
- **Node msi** : 설치 중 "Automatically install the necessary tools" 옵션을 체크하면 Chocolatey·Python 등을 인터넷에서 내려받으려 합니다. → **반드시 체크 해제**
- **VSCode** : 설치 후 `update.mode`, `extensions.autoUpdate` 등을 꺼서 **외부 연결 시도를 막는 설정**이 필요합니다. (설정값은 개발환경구성 페이지에 있습니다)
:::

:::tip 반입한 설치 파일은 사내 파일서버에 올려 두세요
개발환경구성 페이지는 설치 파일을 <Var k="fileServerPath" /> 에서 내려받는 것으로 안내하고있습니다.
반입한 파일을 **그 위치에 그대로 올려 두면**, 나중에 합류하는 개발자는 이 가이드만 보고 스스로 세팅할 수 있습니다.
파일서버 경로가 프로젝트 마다 다르다면 `/site-info` 페이지의 설정된 값을 우리 현장 경로로 바꾸세요. (3-3 참고)
:::

### 1-8. 반입 목록 최종 확인

**react-app-scaffold (본 프로젝트)**

- [ ] **소스** (**`react-app-scaffold`**)
- [ ] **`node_modules.zip`**
- [ ] (선택) **Playwright 브라우저 캐시**

**react-app-scaffold-guide (가이드 프로젝트)**

- [ ] **소스** (**`react-app-scaffold-guide`**)
- [ ] **`node_modules.zip`** — 개발자가 각자 PC에서 띄워 보려면 필요합니다

**개발 도구 설치 파일** (1-7 참고)

- [ ] **Node.js** — <Var k="nodeMsiFile" plain /> 또는 <Var k="nodeZipFile" plain />
- [ ] **Git** — <Var k="gitInstallerFile" plain />
- [ ] **VSCode** — <Var k="vscodeInstallerFile" plain />
- [ ] **VSCode 익스텐션 `.vsix`** — ESLint / Prettier / GitLens (필수), 그 외 선택 익스텐션
- [ ] **Chrome** — <Var k="chromeInstallerFile" plain />
- [ ] **Chrome 확장 `.crx`** — React DevTools / Redux DevTools / TanStack Query DevTools

**서류**

- [ ] **오픈소스 라이선스 목록** — SI 프로젝트 현장에서 필요할 수도 있습니다.

:::tip 폰트는 챙기지 않아도 됩니다
폰트는 이미 프로젝트 안에 포함되어 있습니다. (npm 패키지 + `src/assets/fonts/` 직접 보관)
**외부 CDN을 사용하지 않으므로** 폐쇄망에서도 글꼴이 깨지지 않습니다.
:::
