---
sidebar_position: 1
displayed_sidebar: "startDocSidebar"
title: "개발환경구성"
---

# React 개발 환경 구성

## Node.js 설치

---

**Node.js**가 PC에 설치되어 있지 않다면 설치한다. LTS버전(v<Var k="nodeVersion" plain />)을 설치합니다. **react-app-scaffold** 프로젝트가 최종 테스트한 버전입니다.

- 온라인 설치
  - <VarLink k="nodeDownloadUrl" showUrl>설치링크</VarLink>
- 오프라인 설치
  - node.js설치 파일을 파일서버에서 제공하므로 <Var k="fileServerPath" /> 위치에서 다운로드 받아 설치 합니다.
  - node.js설치 파일: <Var k="nodeZipFile" />
    - **zip**를 통해 설치할 경우 압축을 풀면 다음과 같은 폴더 구조를 가집니다. 여기서 node.exe 를 실행하면 됩니다.
    ```sh
    node-v24.x.x-win-x64/
    ├── node.exe          ← Node.js 실행 파일
    ├── npm.cmd           ← npm 명령어
    ├── npx.cmd
    ├── node_modules/
    │   └── npm/
    └── ...
    ```
  - **msi**를 통해 설치할 경우 <Var k="nodeMsiFile" /> 설치 파일을 통해 설치 진행합니다.
    - **msi**를 통해 설치 중 "Automatically install the necessary tools" 옵션을 체크하면 Chocolatey, Python, Visual Studio Build Tools 등을 인터넷에서 추가 다운로드하려 합니다.
      오프라인 환경이라면 이 옵션은 반드시 체크 해제해야 합니다.

1. **LTS버전 (v<Var k="nodeVersion" plain />)** - 설치 완료 후 아래와 같이 윈도우 **명령 프롬프트** 창에서 `node`와 `npm` 설치 여부를 확인해봅니다.

<VarCode language="sh">{`# 설치 후 설치 버전 확인
node -v
# {{nodeVersion}}

npm -v
# {{npmVersion}}`}</VarCode>

## Git 설치

---

Git사용을 위하여 설치합니다.  
- 온라인 설치
  - <VarLink k="gitDownloadUrl" showUrl>설치링크</VarLink>

- 오프라인 설치
  - Git 설치 파일을 파일서버에서 제공하므로 <Var k="fileServerPath" /> 위치에서 다운로드 받아 설치 합니다.
  - Git 설치 파일 : <Var k="gitInstallerFile" />

## Visual Studio Code 설치

---

**Frontend** 개발을 위한 Microsoft사에서 만든 개발용 코드 편집기입니다.

- 온라인 설치
  - <VarLink k="vscodeDownloadUrl" showUrl>설치링크</VarLink>
- 오프라인 설치
  - Visual Studio Code 설치 파일을 파일서버에서 제공하므로 <Var k="fileServerPath" /> 위치에서 다운로드 받아 설치 합니다.
  - Visual Studio Code 설치 파일 : <Var k="vscodeInstallerFile" />
  - 오프라인이면 .vscode/settings.json 파일 생성 및 외부 연결 시도 막는 부분 세팅
    ```json
    {
      "update.mode": "none",
      "telemetry.telemetryLevel": "off",
      "extensions.autoUpdate": false,
      "extensions.autoCheckUpdates": false
    }
    ```

- **Visual Studio Code(VSCode)** 를 설치한 후 개발에 도움이 되는 **Extensions**를 설치합니다.

:::tip <span class="admonition-title">VSCode Extensions</span> 설치
VSCode에서 사용할 수 있는 <span class="text-color-red">필수</span> 또는 <span class="text-blue-normal">선택</span> 익스텐션 입니다.

- <span class="text-color-red">ESLint</span> : (필수) 코드의 포맷팅과 품질관리 도구.
- <span class="text-color-red">Prettier</span> - Code formatter : (필수) 코드를 정렬해주는 Formatter.
- <span class="text-color-red">GitLens Git supercharged</span> : (필수) 각 파일에서 Line별로 가장 마지막에 누가, 언제, 무슨 commit했는 지 확인할 수 있다.
- <span class="text-blue-normal">Git Graph</span> : (선택) Git 저장소의 Git Graph를 보고 Git 작업을 수행합니다.
- <span class="text-blue-normal">indent-rainbow</span> : (선택) 들여쓰기에 컬러표시로 가독성을 좋게함.
- <span class="text-blue-normal">Color Highlight</span> : (선택) 편집기에서 웹 색상을 강조 표시합니다.
- <span class="text-blue-normal">Import Cost (Display import/require package size in the editor)</span> : (선택) import하는 모듈의 사이즈를 보여줌.
- <span class="text-blue-normal">TODO Highlight</span> : (선택) 주석처리 시 'TODO:' 이렇게 시작하는 text를 입력하면 색깔로 반전시켜주는 기능.
- <span class="text-blue-normal">vscode-icons</span> : (선택) VSCode의 아이콘을 이쁘게 보여줌.
- <span class="text-blue-normal">es6-string-html</span> : (선택) es6 여러 줄 문자열에서 구문 강조 표시.
- <span class="text-blue-normal">Tailwind CSS IntelliSense</span> : (선택) Tailwindcss 를 사용하는 프로젝트에서 도움이 되는 익스텐션입니다.
- <span class="text-blue-normal">SVN</span> : (SVN을 사용하는 환경이라면...) 검색된 svn중에 Integrated Subversion source control Chris Johnston을 설치한다.
- <span class="text-blue-normal">MDX (unified unifiedjs.com)</span> : (선택)(Language support for MDX) MDX 파일 내 JSX 문법에 대해 기본적인 하이라이팅과 일부 오류 감지.

:::

### VSCode Extensions 온라인 설치 방법

- VSCode에서 아래 이미지와 같이 검색어 입력란에 **Extensions명**을 입력하여 설치합니다.
  ![VSCode Extension온라인 설치](../assets/config/vscode_et01.png)

### VSCode Extensions 오프라인 VSIX설치 방법(외부 인터넷이 되지 않는 환경일때 )

- 외부 인터넷이 되지 않는 환경의 PC에서는 따로 제공하는 **\*.vsix**파일을 이용하여 설치합니다.
- 아래와 같이 순서대로 가지고 있는 **\*.vsix**파일을 선택하고 install합니다.
  ![VSCode Extension온라인 설치](../assets/config/vscode_et02.png)
- 설치가 완료 되고 오른쪽 하단에 아래와 같이 팝업이 뜨면 성공.
  ![VSCode Extension온라인 설치](../assets/config/vscode_et03.png)


## Chrome Browser 설치

---

Frontend 개발 시 로컬환경에서 다양한 개발자 환경을 제공하는 크롬 브라우저를 설치합니다.

- 온라인 설치
  - <VarLink k="chromeDownloadUrl">Chrome 브라우저 설치 링크</VarLink>
- 오프라인 설치
  - Chrome 브라우저 설치 파일을 파일서버에서 제공하므로 <Var k="fileServerPath" /> 위치에서 다운로드 받아 설치 합니다.
  - Chrome 브라우저 설치 파일 : <Var k="chromeInstallerFile" />

## React Developer Tools 설치 (크롬 브라우저 확장 프로그램)

---

React를 사용할 때, React 앱을 보다 더 사용자 친화적인 인터페이스에서 검사하고 디버깅할 수 있습니다.

- 온라인 설치
  - <VarLink k="reactDevtoolsUrl">React Developer Tools 설치 링크</VarLink>
- 오프라인 설치
  - Chrome Extensions 오프라인 .crx설치 방법#
    - crx파일이 있으면 chrome브라우저에서 chrome://extensions를 입력하고 해당 브라우저에 crx파일을 드래그앤드롭하면 extension설치가 된다.

## Redux DevTools 설치 (크롬 브라우저 확장 프로그램)

---

React에서 사용하는 상태 관리 라이브러리 Redux의 상태 변경을 디버깅 할 수 있는 Redux DevTools를 설치합니다.  
<VarLink k="reduxDevtoolsUrl">Redux DevTools 설치 링크</VarLink>

- 오프라인 설치
  - Chrome Extensions 오프라인 .crx설치 방법#
    - crx파일이 있으면 chrome브라우저에서 chrome://extensions를 입력하고 해당 브라우저에 crx파일을 드래그앤드롭하면 extension설치가 된다.

## TanStack Query(React Query) DevTools 설치 (크롬 브라우저 확장 프로그램)

---

React에서 사용하는 상태 관리 라이브러리 TanStack Query의 상태 변경을 디버깅 할 수 있는 TanStack Query DevTools를 설치합니다.  
<VarLink k="tanstackQueryDevtoolsUrl">TanStack Query(React Query) DevTools 설치 링크</VarLink>

- **TanStack Query(React Query)** 외에도 <VarLink k="zustandUrl">Zustand</VarLink>도 함께 전역 상태관리로 Scaffold는 사용하고있습니다.
- 오프라인 설치
  - Chrome Extensions 오프라인 .crx설치 방법#
    - crx파일이 있으면 chrome브라우저에서 chrome://extensions를 입력하고 해당 브라우저에 crx파일을 드래그앤드롭하면 extension설치가 된다.

## VSCode에서 <span class="text-green-bold">Git bash</span> 쉘(Shll)프로그램을 사용하자.

---

- VSCode를 사용하여 Frontend 개발을 진행하다 보면 터미널창을 이용하는 상황이 많이 생깁니다.
- 만약 **Windows**(윈도우) 운영체제(OS)를 사용하는 환경 이라면, <span class="text-green-bold">리눅스 커맨드를 사용</span>할 수 있는 <span class="text-green-bold">Git bash</span> 터미널을 사용합니다.
- **VSCode**에서 터미널창을 열때 아래와 같이 <span class="text-green-bold">Git bash</span>로 바꿔서 사용합니다.
  ![VSCode Extension온라인 설치](../assets/config/vscode_et04.png)

## Visual Studio Code (VSCode) 코드편집기 설정
---

- **settings.json 가 세팅되어있지 않은 경우에만 설정합니다.**
- `.vscode/settings.json` 파일은 Frontend 코드를 **Git** 레포지토리에서 내려받으면 기본으로 세팅되어 있습니다.
- 만약 코드를 내려받은 후 `.vscode/settings.json` 파일이 없다면, 다음과 같이 생성합니다.

### settings.json 셋팅 (VSCode 설정)

<span class="react-color">Frontend (React)</span> 개발을 위해 **VSCode**를 활용할 것입니다. 따라서 개발자의 통일된 코드 작성을 위하여 **VSCode**의 환경설정을 **settings.json**파일에 적용합니다.

#### settings.json 설정

> - **settings.json 파일열기** : f1 ⤍ settings 입력 ⤍ Preferences: Open Workspace Settings (JSON) 클릭.  
>   위와같이 열면 프로젝트 루트에 **.vscode** 디렉토리가 생성되고 **settings.json**파일이 생성됩니다.
> - **settings(설정)가 적용되는 우선 순위** : .vscode settings.json ⤇ settings.json ⤇ defaultSetting.json(<span class="text-color-red">수정하지 않는 파일.</span>)  
>   <span class="text-color-red">defaultSetting.json은 모든 설정내용이 다 들어있는 기본 설정 파일입니다. 수정은 하지 않는 파일입니다.</span>
> - **.vscode** 디렉토리에 생성된 **settings.json** 파일에 아래 내용 입력합니다.

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "editor.tabSize": 2,
  "editor.detectIndentation": false,
  "editor.insertSpaces": false,
  "editor.renderWhitespace": "all",
  "editor.comments.insertSpace": false,
  "files.associations": {
    "*.json": "jsonc"
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.useFlatConfig": true,
  "css.lint.unknownAtRules": "ignore",
  "scss.lint.unknownAtRules": "ignore",
  "less.lint.unknownAtRules": "ignore",
  "[markdown]": {
    "editor.formatOnSave": false,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "never"
    }
  },
  "[mdx]": {
    "editor.formatOnSave": false,
    "editor.defaultFormatter": null
  },
  "_comment_autoImport": "자동 import 출처 제한 — 컴포넌트는 @axiom/components/ui 배럴을 우선 사용. 내부 의존성(@base-ui/react, react-day-picker)과 raw shadcn 경로는 제안에서 제외한다.",
  "typescript.preferences.autoImportSpecifierExcludeRegexes": [
    "^@base-ui/react",
    "^react-day-picker",
    "(^|/)shared/lib/shadcn",
    "(^|/)shared/ui"
  ],
  "javascript.preferences.autoImportSpecifierExcludeRegexes": [
    "^@base-ui/react",
    "^react-day-picker",
    "(^|/)shared/lib/shadcn",
    "(^|/)shared/ui"
  ],
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "axiom-ai.sdd.axiomFolder": ".axiom",
  "axiom-ai.llm.maxTokens": 16384,
  "axiom-ai.debug.logSystemPrompt": true,
  "axiom-ai.llm.provider": "ollama",
  "axiom-ai.experimental.regionEdit": true,
  "axiom-ai.experimental.intentClassifier": true
}
```

:star: 이렇게 `settings.json` 파일로 **VSCode** 설정을 하면 **메뉴(File ⤍ Preferences ⤍ Settings)** 로 설정한것 보다 우선순위가 높게 적용됩니다.

:::info 설명

- **"editor.formatOnSave"** : 파일 저장 시 자동으로 코드 서식을 정리합니다.
- **"editor.codeActionsOnSave" ⤍ "source.fixAll.eslint"** : 파일 저장 시 ESLint가 감지한 모든 문제를 자동으로 수정합니다.
- **"editor.tabSize"** : 탭 크기를 몇칸으로 설정할지 지정합니다.
- **"editor.detectIndentation"** : VSCode가 파일의 들여쓰기를 자동으로 감지하는 기능을 활용할지 여부 입니다.
- **"editor.insertSpaces"** : 탭 키를 누를 때 공백 대신 탭 문자를 삽입합니다.
- **"editor.renderWhitespace"** : 공백 문자를 시각적으로 표시합니다.
- **"editor.comments.insertSpace"** : 주석 기호(//, /\*) 뒤에 자동으로 공백을 삽입할지 여부 입니다.
- **"files.associations" ⤍ "\*.json": "jsonc"** : .json 파일을 jsonc(주석이 있는 JSON) 형식으로 인식하도록 설정합니다.
- **"eslint.validate": \["javascript", "javascriptreact", "typescript", "typescriptreact"\]** : ESLint가 TypeScript, React, JavaScript 파일을 검사하도록 설정합니다.
- **"eslint.workingDirectories"** : \[\{"mode":"auto"\}\] : ESLint 작업 디렉토리를 자동으로 감지하도록 설정합니다.
- **"editor.defaultFormatter": "esbenp.prettier-vscode"** : VSCode의 기본 코드 포맷터로 Prettier를 사용합니다.
- **"eslint.useFlatConfig"** : ESLint의 설정방식이 `v8.21.0` 부터 **Flat Config**를 지원하면서, 구성 형식을 **Flat Config**으로 할지 여부 설정.

- **"css.lint.unknownAtRules": "ignore"** : VSCode에서 CSS의 "Unknown At Rules" 경고를 무시하도록 설정.
- **"scss.lint.unknownAtRules": "ignore"** : VSCode에서 scss의 "Unknown At Rules" 경고를 무시하도록 설정.
- **"less.lint.unknownAtRules": "ignore"** : VSCode에서 less의 "Unknown At Rules" 경고를 무시하도록 설정.
- **"[markdown]":** : Markdown 파일을 편집할 때 자동으로 코드 서식을 정리하지 않도록 설정.
- **"[mdx]":** : MDX 파일을 편집할 때 자동으로 코드 서식을 정리하지 않도록 설정.
- **오프라인일경우 설정 추가함**
  ```json
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false
  ```

:::

## Frontend 개발 코드 내려받기

---

:::info <span class="admonition-title">Git 레포지토리</span> url

- <Var k="gitRepoUrl" />
- 개발 코드를 내려받기 위해서는 계정 및 권한이 필요합니다. (해당 권한은 담당자에게 요청)

:::

#### 작업 폴더 생성 및 Frontend 소스 코드 받기

- 먼저 PC에 작업 할 폴더를 생성합니다.
  ```sh
  # C:\my\ 디렉토리에서 폴더를 생성한다고 가정.
  # 내가 작업 할 폴더를 'frontend-app' 라고 하고 해당 폴더를 생성.
  mkdir frontend-app
  # C:\my\frontend-app 폴더가 생성 됨.
  ```
- 생성한 **frontend-app** 폴더로 이동하여 `git clone`을 실행하여 **react-app-scaffold** 코드를 내려 받습니다.
  내려받을 주소는 <Var k="gitRepoUrl" /> 입니다.

  ```sh
  # 애플리케이션 레포지토리에서 코드를 내려받습니다.
  git clone [Scaffold 레포지토리 주소]
  ```

- `git clone`하여 내려받은 소스를 확인해보면 아직 **node_modules**폴더가 없는상태입니다. 의존성 라이브러리를 설치면 **node_modules**폴더를 자동생성합니다.
  ```sh
  # 프로젝트 루트 폴더에서 의존성 라이브러리 설치
  npm install
  ```

## VSCode에서 로컬 서버 띄우고 브라우저로 확인해 보기

---

- :star: 최초 내려받은 Frontend 소스에 `node_modules`가 없으면 **Frontend 로컬 서버**를 띄울 수 없습니다. 반드시 의존성 라이브러리를 설치하여 `node_modules`를 추가 해야 합니다.
  - 인터넷이 되는 환경에서는 `npm install` 명령어로 바로 설치 가능.
- 의존성 라이브러리(node_modules) 설치가 모두 완료 되면, 로컬 PC에서 로컬 서버를 띄우고 브라우저로 확인할 수 있습니다.
- 로컬 서버 띄우기
  ```sh
  npm run dev
  ```
  ![npm run dev 명령어어 예시 이미지](../assets/config/vscode_env01.png)
- **Chrome** 브라우저를 띄우고 `http://localhost:5173` 확인하면 다음과 같이 확인할 수 있습니다.(url port와 화면 결과물은 다를 수 있음.)
  ![npm run dev 브라우저 확인 예시 이미지](../../task/react-assets/assets/config-task/layout-template01.png)
