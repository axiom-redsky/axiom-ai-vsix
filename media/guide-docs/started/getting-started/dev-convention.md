---
sidebar_position: 1
displayed_sidebar: "startDocSidebar"
title: "개발구조및규칙"
---

# 개발 구조 및 규칙




## Folder Structure
---
:::tip DDD(<span class="admonition-title">Domain Driven Design</span>) 설계
* Frontend 개발의 기본 폴더 구조는 <span class="text-blue-normal">[DDD(Domain Driven Design)](https://en.wikipedia.org/wiki/Domain-driven_design)</span> 설계 방법론을 따릅니다.  
* **DDD**에서 말하는 Domain은 **비즈니스 도메인**을 의미합니다. 즉, 유사하거나 관련된 업무 기능(프로젝트의 각각의 서비스/모듈)을 하나의 도메인 단위로 분리하여 관리합니다. 이렇게 하면 모듈 간 불필요한 의존성을 줄이고 도메인별로 코드를 응집시켜 유지보수성과 확장성이 높아집니다.
* 업무가 복잡한 대형 프로젝트에 적합한 구조입니다.
* `domains`폴더에 각각 업무(**domain**)별로 분리되어 영향도와 의존성이 적고 확장성이 용이해서 유지보수가 쉽습니다.
* 각 업무 담당 개발자는 **자신이 맡은 업무 영역에서만 코딩** 작업을 진행하며, 서로 다른 업무간에 충돌 가능성이 적어집니다.
* 부득이하게 자신의 업무 외 상위 업무나 공통 업무에 접근 해야하는 상황이라면 Frontend공통 개발자와 상의하여 **shared**를 통해 공유 하거나 app공통 객체를 통해 소통합니다.
:::

![DDD Architecture](../assets/config/ddd-architecture.svg)


### react-app-scaffold 전체 폴더 구조
```sh
react-app-scaffold
├── src/
│   ├── core/                   # 앱 전체 공통 영역 (공통 개발자 관리 영역)
│   ├── assets/                 # 정적 파일 (fonts, images, css)
│   ├── domains/                # 업무 도메인별 분리 (DDD) — 업무 개발자 작업 영역
│   │   ├── home/                 # 홈 도메인
│   │   │   ├── api/                  # REST API URL 및 request/response 타입 정의
│   │   │   ├── common/               # 도메인 전용 공통 함수 모음
│   │   │   ├── components/           # 도메인 전용 컴포넌트
│   │   │   ├── hooks/                # 도메인 커스넘 훅 모음
│   │   │   ├── pages/                # 화면 파일 (*.tsx)
│   │   │   ├── router/               # 도메인 라우팅
│   │   │   ├── store/                # 도메인 상태 관리
│   │   │   └── types/                # 도메인 타입 정의
│   │   └── [domain]/             # 업무 도메인 추가·확장 가능
│   ├── shared                  # 전역 공유 코드
│   │   ├── auth                  # JWT인증 토큰관련 폴더
│   │   ├── components            # 공유 컴포넌트 작업 공간
│   │   │   ├── router                # 라우트 관련 로직 처리
│   │   │   └── ui                    # ui 관련 공유 컴포넌트
│   │   ├── layouts               # 레이아웃 관련 폴더
│   │   ├── lib
│   │   │   ├── shadcn            # shadcn/ui 원본 컴포넌트
│   │   │   │   └── ui                 # shadcn/ui UI 컴포넌트 모음
│   │   │   └── utils.ts               # shadcn/ui 유틸리티 함수 모음
│   │   ├── router                # 전체 라우팅 통합 설정(업무 라우트 세팅)
│   │   ├── ui                    # UI 컴포넌트 진입점
│   │   └── utils/cn.ts           # Tailwind를 사용할 때 조건부 조합을 위한 cn함수.
│   ├── types                   # TypeScript 전역 타입 정의 (.d.ts)
│   ├── App.tsx                 # 루트 App 컴포넌트
│   ├── main.tsx                # 앱 진입점
├── package.json                # 독립 의존성 관리 (pnpm)
├── vite.config.ts              # Vite + Module Federation 설정
└── ...                         # ESLint, Prettier, tsconfig 등 (Shared Library에서 extend)
```

* &#8251; 업무 개발자가 작업할 공간은 각 앱의 `src/domains` 폴더입니다. 그 외 폴더 및 파일들은 설정 파일이므로 `src` 폴더 구조에 대해서만 설명합니다.

:::info 설명
* **앱 src 내부 폴더 구조**
	* <span class="text-green-bold">src/assets</span>폴더는 모든 정적 파일들(이미지, CSS 파일 등)을 모아놓은 폴더입니다.
  * <span class="text-green-bold">src/config</span>폴더는 SI 프로젝트가 관리하는 앱 설정 레이어입니다. `core`를 직접 수정하지 않고 API·인증·쿼리·라우터·테마 등 관심사별 설정 파일(<span class="text-blue-normal">**api·auth·query·router·theme.config.ts**</span>)로 값만 주입·override 합니다. 실제 값은 대부분 `.env`(`VITE_*`)에서 읽어오므로, 프로젝트별 접속 정보·정책을 바꿀 때는 이 폴더(또는 `.env`)만 수정하면 됩니다.
  * <span class="text-green-bold">src/core</span>폴더는 앱 핵심 공통 코어 로직(라우터 설정 등) 폴더입니다. 공통개발자 이 외 업무개발자는 작업하지 않는 공간입니다.
  * <span class="text-green-bold">src/design-tokens</span>폴더는 디자인 시스템의 색상·간격·타이포그래피·그림자 등 스타일 값을 [Style Dictionary](https://styledictionary.com/)로 관리하는 폴더입니다. <span class="text-blue-normal">**primitive**</span>(원시 토큰: color·shadow·spacing·typography)와 <span class="text-blue-normal">**semantic**</span>(테마별 시맨틱 토큰: light·dark)의 JSON으로 값을 정의하고, `style-dictionary.config.js` 빌드를 통해 Tailwind v4 `@theme`(primitive)과 `:root`·`.dark`(semantic) CSS 변수 파일을 `src/assets/styles/tokens/`에 자동 생성합니다(`types.d.ts` 타입 선언도 함께 생성). 색상 팔레트나 테마 값을 바꿀 때는 CSS를 직접 고치지 말고 이 폴더의 JSON만 수정한 뒤 재빌드하면 됩니다.
  * <span class="text-green-bold">src/shared</span>폴더는 해당 앱 내 전역 공유 코드 폴더입니다. 상황에 따라 수정이 발생할 수 있고, 다른 업무(domain)개발자와 함께 작업할 수 있는 공통 컴포넌트, 레이아웃, Context, 라우터, 커스텀 훅 등이 위치합니다.
  * <span class="text-green-bold">src/publishing</span>폴더는 퍼블리셔가 Figma 디자인을 디자인 토큰 기반의 React 컴포넌트로 구현하는 스테이징(1차 작업) 공간입니다. Storybook(<span class="text-blue-normal">**npm run storybook**</span>)으로 팀과 프리뷰를 공유하며, 스타일은 CSS 파일을 만들지 않고 Tailwind 유틸리티 클래스와 `cn()`, 디자인 토큰 클래스(`bg-brand-500`, `shadow-theme-md` 등)로만 작성합니다. 여기서 만든 컴포넌트는 라우터에 등록되지 않으며, 핸드오프가 완료되면 <span class="text-blue-normal">**pages**</span>는 `src/domains/[name]/pages/`로, <span class="text-blue-normal">**components**</span>는 `src/shared/` 또는 `src/domains/[name]/components/`로 이동합니다.
  * <span class="text-green-bold">src/domains</span>폴더에는 각 **domain 업무들(domain1, domain2, domain3, ...)** 이 있고, 그 하위에는 일률적으로 <span class="text-blue-normal">**api, components, common, hooks, pages, router, store, types**</span>폴더를 가집니다. 각 개별 폴더는 업무 상황에 따라 생성하여 사용합니다.
		- <span class="text-blue-normal">api</span> : REST API URL과 request, response의 type을 정의합니다.
		- <span class="text-blue-normal">common</span> : 해당 업무에서 사용하는 javascript 공통함수나 공통적인 요소의 모듈을 모아놓은 폴더.
		- <span class="text-blue-normal">components</span> : 업무 화면에서 사용하는 컴포넌트들을 모아놓은 폴더.
		- <span class="text-blue-normal">hooks</span> : 해당 도메인 업무에서 사용할 커스텀 훅들을 모아놓은 폴더.
		- <span class="text-blue-normal">pages</span> : 해당 도메인 업무의 페이지 컴포넌트 폴더. 화면을 구성하는 React 컴포넌트를 모아놓습니다.
		- <span class="text-blue-normal">router</span> : 해당 도메인 업무의 라우터 설정 폴더. React Router 기반의 라우트를 정의합니다.
		- <span class="text-blue-normal">store</span> : 해당 업무에서 사용하는 전역 상태관리 모듈을 모아놓은 폴더.
		- <span class="text-blue-normal">types</span> : 해당 업무에서 사용하는 type을 모아놓은 폴더.
:::








## 도메인 기반 폴더구조 (DDD)
---
:::tip 한 줄 요약
**DDD(Domain Driven Design)** 방법론을 따라 `src/domains` 아래 업무를 **독립 단위(도메인)** 로 분리합니다. 각 개발자는 **자신의 도메인에서만** 작업하므로, 여러 도메인을 **동시에 개발해도 코드 충돌이 최소화**되고 **확장성**이 높아집니다.
:::

### 도메인 레인 — 격리된 병렬 작업 영역

각 도메인은 서로 **격리된 레인(lane)** 처럼 동작합니다. 담당 개발자는 자신의 레인 안에서만 코드를 작성하고, 모든 레인은 아래의 **공통 토대(core · shared · assets)** 위에서 함께 동작합니다.

| 도메인 레인 <span class="text-blue-normal">(격리·병렬)</span> | 담당 | 구성 폴더 |
| --- | --- | --- |
| `domains/account` <span class="text-gray-normal">(예: 계좌)</span> | 👩‍💻 개발자 A  | api · components · pages · hooks · router · store · types |
| `domains/transfer` <span class="text-gray-normal">(예: 이체)</span> | 🧑‍💻 개발자 B  | api · components · pages · hooks · router · store · types |
| `domains/loan` <span class="text-gray-normal">(예: 대출)</span> | 👨‍💻 개발자 C  | api · components · pages · hooks · router · store · types |
| `domains/[domain]` | ＋ 도메인 추가 | 레인을 늘리듯 자유롭게 확장 |

> &#8251; `account · transfer · loan`은 이해를 돕기 위한 **업무 예시**입니다. 실제 도메인은 프로젝트 업무에 맞춰 생성합니다.

### 공통 토대와 소통 규칙

도메인들은 아래 **공통 토대** 위에서 동작합니다.

* <span class="text-green-bold">core</span> — 앱 핵심 코어 로직 (프론트엔드 공통 개발 담당자 관리 영역)
* <span class="text-green-bold">shared</span> — 도메인이 함께 쓰는 전역 공유 코드
* <span class="text-green-bold">assets</span> — 정적 리소스 (이미지·폰트·CSS)

:::warning 도메인 간 소통 규칙
한 도메인에서 다른 도메인의 코드에 **직접 접근하지 않습니다.** 공통으로 써야 하는 컴포넌트·로직·상태는 반드시 **`shared`** (또는 `core`)를 통해서만 공유하며, 필요 시 Frontend 공통 개발자와 상의합니다.
:::

### 핵심 이점

| 이점 | 설명 |
| --- | --- |
| 🧩 **업무 영역 격리** | 도메인마다 독립된 폴더 — 의존성·영향도 최소화 |
| ⚡ **동시 병렬 개발** | 여러 도메인을 함께 작업해도 코드 충돌 최소화 |
| 📈 **손쉬운 확장성** | 도메인 추가만으로 기능 확장 — 대형 프로젝트에 적합 |










## Code Convention
---
많은 개발자들의 협업으로 인하여 개발자 개개인 마다 코딩 스타일이 달라서 유지보수가 어려워지고 코드의 품질이 떨어질 수 있습니다. 그래서 다음과 같은 [코딩 스타일](./react-style-guide)을 정의하여 따르도록 합니다.


### Folder convention(<span class="text-blue-normal">폴더명</span>)
* 모든 폴더명은 **kebab-case**로 생성합니다.
* **camelCase**보다 가독성이 좋고 node_modules의 모든 프로젝트들도 **kebab-case**를 사용하므로 그대로 따르기로 합니다.
```sh
# 폴더명 적용 예시
 src
 ├── app    
 ├── assets  
 ├── core              
 │   ├── components    
 │   │   └── ui-components      # 폴더명 kebab-case
 │   └── types         
 └── shared            
     ├── components
     │    ├─ header-left        # 폴더명 kebab-case
     │    │  └─DefaultLeft.tsx
     │    ├─ header-right       # 폴더명 kebab-case
     │    └─ header-center      # 폴더명 kebab-case    
     └── constants     
         └── nav-utils          # 폴더명 kebab-case
             └── nav-utils.ts
```


### File convention (<span class="text-blue-normal">파일명</span>)
* <span class="text-blue-normal">*.tsx</span>파일, 모든 컴포넌트 파일명은 **PascalCase**로 만듭니다.
* HTML 엘리먼트와의 차별성과 충돌 방지 차원.
* 되도록이면 **컴포넌트 명**은 두 단어가 합쳐진 **합성어를 사용**합니다.
```sh
# 컴포넌트 *.tsx 파일명 예시
TodoItem.tsx
```
* <span class="text-blue-normal">*.ts, *.js, *.scss, *.css</span> 등 일반 파일명은 **kebab-case**로 만듭니다.
```sh
todo-system.ts
todo-style.css
```




### Function Names(<span class="text-blue-normal">함수명</span>)
* 함수명은 **camelCase**로 만듭니다.
```ts
// ✅ 좋음
function fetchUserData() { }
async function getUserById(id: string) { }
const handleSubmit = () => { }
const calculateTotal = (items: Item[]) => { }

// ❌ 나쁨
function FetchUserData() { }
function get_user_by_id() { }
```
* 동사로 시작
```ts
// ✅ 좋음
function createUser() { }
function validateEmail() { }
function handleClick() { }
function fetchProducts() { }
function isAuthenticated() { }
function hasPermission() { }

// ❌ 나쁨
function user() { }
function email() { }
function click() { }
```
* 이벤트 핸들러 함수명은 **handle** 또는 **on** 접두사를 붙입니다.
```ts
// ✅ 좋음
function handleClick() { }
function handleSubmit() { }
function handleInputChange() { }
function onUserLogin() { }

// ❌ 나쁨
function click() { }
function submit() { }
function change() { }
```





### Variable Names(<span class="text-blue-normal">변수명</span>)
* 변수명은 **camelCase**로 만듭니다.
```ts
// ✅ 좋음
const userName = 'John';
const isLoading = false;
const productList = [];
let currentPage = 1;

// ❌ 나쁨
const UserName = 'John';
const is_loading = false;
const PRODUCTLIST = [];
```
* 상수는 **UPPER_SNAKE_CASE**로 만듭니다.
```ts
// ✅ 좋음
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.example.com';
const DEFAULT_PAGE_SIZE = 10;

// 설정 객체는 camelCase
const config = {
  maxRetryCount: 3,
  apiBaseUrl: 'https://api.example.com'
};
```
* Boolean 변수는 **is, has, can, should** 접두사를 붙입니다.
```ts
// ✅ 좋음
const isLoading = false;
const hasError = true;
const canEdit = false;
const shouldUpdate = true;

// ❌ 나쁨
const loading = false;
const error = true;
const edit = false;
```







### TypeScript convention
* Frontend개발 시  **Typescript**를 사용하므로 관련 convention을 정의합니다.
* **Interface**명은 관례적으로 앞에 '**I**'를 붙이고 **PascalCase**로 만듭니다.
```js
// TypeScript의 Interface명
interface ITodoList {
  id: number;
  content: string;
  completed: boolean;
}
```
* **type, enum**명은 앞에 '**T, E**'을 붙이고 **PascalCase**로 만듭니다.
```js
// TypeScript의 Enum명
enum EDirection {
  Up = 1,
  Down,
  Left,
  Right,
}
// Type명
type TPerson = {
  name: string;
  age: number;
}
```


### Router convention
* **path**는 **kebab-case**로 만듭니다.
* **element, children**은 **PascalCase**로 만듭니다.
```tsx
{
  path: '/ui-button',
  element: <LayoutIndex />,
},
```