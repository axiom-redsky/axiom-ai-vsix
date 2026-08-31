---
sidebar_position: 1
displayed_sidebar: "startDocSidebar"
title: "개요"
---

# react-app-scaffold 개요


## 소개
---

**react-app-scaffold**는 **React.js**와 **TypeScript**, **vite**를 기반으로, 실무에서 바로 사용할 수 있는 UI 컴포넌트와 유틸리티, 예제 코드를 제공하는 스타터 프로젝트입니다. 프로젝트의 초기 세팅과 개발을 빠르고 효율적으로 시작할 수 있도록 도와줍니다.<br /><br />
업무 개발자는 실제로 동작하는 컴포넌트와 유틸리티를 미리 확인하고, 예제 코드를 복사하여 자신의 업무 코드에 바로 적용할 수 있습니다. 또한, 프로젝트 상황에 맞게 스타일의 유연성과 커스터마이징 용이성 측면에서도 매우 큰 장점이 있습니다.













### 주요 목적

- **개발 생산성 향상**: 프로젝트 초기의 환경 세팅을 빠르게 끝낼 수 있도록 도와주고, 프로젝트 진행 중에는 반복적인 React 개발 시간을 단축하고 일관된 디자인 시스템을 유지할 수 있습니다. 또한 자주 사용하는 유틸리티 함수들을 제공하여 API 통신, 데이터 포맷팅, 배열/객체 처리 등 다양한 비즈니스 로직 구현 시간을 줄여줍니다.
- **UI 컴포넌트 제공**: `shadcn/ui` 기반의 자체 UI 컴포넌트들을 제공합니다. 디자이너, 퍼블리싱 작업 시 헤드리스 컴포넌트로 사이트 마다 다른 스타일을 쉽게 적용할 수 있습니다.
- **유틸리티 라이브러리 제공**: 다양한 유틸리티 함수 및 헬퍼(예: API통신, 날짜 포맷, 배열/객체 조작, 데이터 변환 등)를 제공합니다.
- **인터랙티브 데모**: 각 컴포넌트 및 유틸리티의 실제 동작을 확인할 수 있는 라이브 데모를 제공합니다.
- **코드 예제 제공**: 컴포넌트 및 유틸리티 사용법과 예제 코드를 바로 복사하여 사용할 수 있게 제공합니다.

### 제공 UI 컴포넌트

자체 제공 UI 컴포넌트를 `@axiom/components/ui` 한 곳에서 import하여 사용합니다. 현재 제공되는 주요 컴포넌트는 다음과 같습니다. (필요 시 계속 추가 예정)

- **Accordion**: 접이식 콘텐츠 패널
- **Alert**: 알림 메시지
- **Avatar**: 프로필 아바타 (`sm`/`default`/`lg` 크기)
- **Badge**: 상태 표시 배지
- **Breadcrumb**: 현재 경로 내비게이션
- **Button**: 다양한 스타일의 버튼
- **Button Group**: 버튼 묶음 (가로/세로 배치)
- **Calendar**: 날짜 선택 캘린더 (`react-day-picker` 기반)
- **Card**: 콘텐츠 카드 컨테이너
- **Carousel**: 캐러셀/슬라이더 (`embla-carousel-react` 기반)
- **Checkbox**: 체크박스 입력
- **Combobox**: 검색 가능한 드롭다운 선택
- **Dialog**: 모달 다이얼로그
- **Drawer**: 슬라이드 인 패널 (`vaul` 기반)
- **Dropdown Menu**: 드롭다운 메뉴
- **Input**: 텍스트 입력 필드
- **Input Group**: 입력 필드에 아이콘·버튼·텍스트 애드온 결합
- **Label**: 폼 라벨
- **Native Select**: 브라우저 네이티브 `<select>` 기반 선택
- **Pagination**: 페이지 번호 내비게이션
- **Progress**: 진행률 표시 바
- **Radio Group**: 라디오 버튼 그룹
- **Select**: 드롭다운 선택
- **Separator**: 가로/세로 구분선
- **Skeleton**: 로딩 스켈레톤(placeholder)
- **Slider**: 단일/범위 값 슬라이더
- **Spinner**: 로딩 스피너 (아이콘 교체 가능)
- **Switch**: 온/오프 토글 스위치
- **Table**: 테이블 마크업 프리미티브
- **Tabs**: 탭 패널 (가로/세로)
- **Textarea**: 멀티라인 텍스트 입력
- **Toast**: 토스트 알림 (`sonner` 기반, `Toaster` + `toast`)
- **Toggle / Toggle Group**: 토글 버튼 및 토글 버튼 그룹
- **Tooltip**: 툴팁
- **SmartTable**: 선언형 데이터 그리드 — 정렬·페이징·검색·행/일괄 액션·CSV/XLSX export 지원 (`@tanstack/react-table` 기반)
- **CodeBlock**: `Shiki` 기반 코드 하이라이팅 + 복사 기능 블록




### 제공 유틸리티

전역 객체 `$util`·`$ui`·`$router`와 커스텀 훅으로 제공됩니다. 현재 제공되는 주요 유틸리티는 다음과 같습니다. (필요 시 계속 추가)

- **REST API Helper**: Axios 기반의 API 통신 함수 및 공통 request/error 핸들러 (`useApi`)
- **Page Router**: 페이지 이동 함수 (`$router`)
- **Date Utils**: 날짜 포맷 변환, 상대 날짜 계산 등 날짜 처리 함수 (`$util.date`)
- **String Utils**: 문자열 변환, 치환, 대소문자 변경 관련 함수 (`$util.string`)
- **Number Utils**: 천 단위 콤마(`comma`), 반올림(`round`), 범위 제한(`clamp`), 숫자 변환(`toNumber`), 퍼센트(`percent`) 등 숫자 포맷·조작 함수 (`$util.number`)
- **Custom Hooks**: (`useApi` 외, 필요 시 계속 추가 예정)
- **그 외 추가 예정**
  - **Data Formatter**: 통화·숫자·퍼센트 등 각종 데이터 포맷 변환을 묶은 전용 객체 (`$util.formatter`)
  - **Array/Object Utils**: 배열, 객체 조작을 위한 다양한 헬퍼 함수 (정렬, 필터, 딥 클론 등 — `lodash` 활용)
  - **Validation Utils**: 이메일, 휴대폰 번호, 숫자 등 다양한 입력값 유효성 검사 함수
  - **Storage Utils**: 로컬스토리지, 세션스토리지 편의 함수
  - **Clipboard Utils**: 텍스트, 객체 클립보드 복사 함수 및 지원 여부 체크


### 디자인 시스템

**react-app-scaffold**는 Style Dictionary ("<Var k="styleDictionaryUrl" />") 기반의 **디자인 토큰 시스템**을 내장하고 있어, 색상·타이포그래피·그림자 등 디자인 값을 JSON으로 일원 관리하고 CSS 변수로 자동 생성합니다.

토큰은 **2계층** 구조로 관리됩니다.

| 계층 | 역할 | 위치 |
|------|------|------|
| **primitive** | 실제 hex, px 등 원시값 | `src/design-tokens/primitive/*.json` |
| **semantic** | primitive를 참조하는 의미값 (라이트/다크 분리) | `src/design-tokens/semantic/light.json`, `dark.json` |

- JSON 파일만 수정하면 `npm run build:tokens` 실행 후 CSS 변수가 자동으로 갱신됩니다.
- **Tailwind 클래스**(`bg-brand-500`)와 **CSS 변수**(`var(--color-brand-500)`) 두 방식으로 토큰을 화면에 적용할 수 있습니다.
- semantic 토큰을 사용하면 `.dark` 클래스 추가만으로 다크모드가 자동 대응됩니다.
- SI 프로젝트 투입 시 `src/assets/styles/themes/theme-[project].css` 파일을 만들어 브랜드 색상만 override하면 됩니다. (기본 파일(theme-default.css) 수정 불필요)
- 퍼블리셔는 `src/publishing/` 폴더에서 디자인 토큰을 활용한 컴포넌트를 작성하고 Storybook으로 팀에 공유합니다.

:::info 디자인 토큰 상세 가이드
토큰 수정, 신규 추가, SI 브랜드 적용 방법의 전체 내용은 **[디자인 시스템 > CSS Token 작업방법](/docs/documents/design-system/create-design-tokens)** 페이지를 참고하세요.
:::


### 퍼블리싱 작업 공간

**react-app-scaffold**는 퍼블리셔 전용 작업 공간인 `src/publishing/` 폴더를 별도로 제공합니다. 퍼블리셔는 이 폴더 안에서 디자인 토큰과 Tailwind 유틸리티 클래스를 활용해 React 컴포넌트를 자유롭게 작성하고, Storybook을 통해 팀에 공유할 수 있습니다.
* 각 업무 폴더 내부 구조는 `domains` 업무 폴더 구조와 똑같이 맞춰서 작업합니다. [참조 : 개발구조 및 규칙](./dev-convention#react-app-scaffold-전체-폴더-구조)

```
src/
├── publishing               # 퍼블리셔가 작업하여 제공하는 폴더.(업무별로 폴더를 생성)
│   ├── example                # (example 도메인) 업무 폴더
│   │   ├── api                  # REST API 호출 함수를 따로 관리하고 싶을 때 사용
│   │   ├── components           # React 컴포넌트 모음
│   │   ├── common               # 업무에서 사용하는 공통 함수 모음
│   │   ├── hooks                # 업무에서 사용하는 hook 모음
│   │   ├── pages                # 업무 페이지 모음
│   │   ├── router               # 해당 업무의 페이지 라우트 설정
│   │   └── types                # 해당 업무에서 사용하는 타입 정의
│   ├── main                   # (main 도메인) 업무 폴더
│   │   ├── api                  # REST API 호출 함수를 따로 관리하고 싶을 때 사용
│   │   ├── components           # React 컴포넌트 모음
│   │   ├── common               # 업무에서 사용하는 공통 함수 모음
│   │   ├── hooks                # 업무에서 사용하는 hook 모음
│   │   ├── pages                # 업무 페이지 모음
│   │   ├── router               # 해당 업무의 페이지 라우트 설정
│   │   └── types                # 해당 업무에서 사용하는 타입 정의
│   └── [domain]/              # 신규 도메인 업무 추가·확장 가능
```

- 업무 도메인별로 폴더를 나눠 작업합니다.
- 작업이 완료되면 개발자가 `src/domains/` 또는 `src/shared/`로 이동하여 실제 서비스에 연결합니다.
- 퍼블리셔와 개발자 간의 **핸드오프 기준점**이 되는 공간입니다.




## 장점
---

### 개발 생산성 향상

- **즉시 사용 가능한 UI 컴포넌트**: 자주 사용하는 UI 컴포넌트를 제공하므로 import 하여 바로 사용할 수 있어 개발 시간을 크게 단축할 수 있습니다. 또한, 프로젝트 상황에 맞게 스타일의 유연성과 커스터마이징 용이성 측면에서도 매우 큰 장점이 있습니다.
- **다양한 유틸리티 함수**: 자주 사용하는 유틸리티 함수를 제공하며, import 없이 바로 사용할 수 있어 개발 시간을 크게 단축할 수 있습니다.
- **커스텀 훅**: 자주 사용하는 커스텀 훅을 제공합니다. 
- **일관된 디자인 시스템**: 통일된 디자인 가이드라인을 따르는 컴포넌트로 일관성 있는 UI를 구축할 수 있습니다.
- **코드 예제 제공**: 각 컴포넌트마다 실제 사용 예제와 코드를 제공하여 학습 곡선을 낮추고, 개발 생산성을 향상시킵니다.
- **개발 가이드 제공**: Scaffold의 상세한 가이드를 제공하여, 개발에 도움을 줍니다.

### 타입 안정성

- **TypeScript 기반**: 모든 컴포넌트가 TypeScript로 작성되어 타입 안정성을 보장합니다.
- **명확한 타입 정의**: 컴포넌트 props와 반환값에 대한 명확한 타입 정의로 개발 시 오류를 사전에 방지합니다.
- **IDE 자동완성 지원**: TypeScript의 강력한 타입 시스템으로 IDE(VSCode)에서 자동완성과 타입 체크를 제공합니다.

### 접근성 (Accessibility)

- **shadcn/ui (Radix UI) 기반**: 접근성 표준을 준수하는 shadcn/ui (Radix UI) 프리미티브를 기반으로 구축되어 있습니다.
- **키보드 네비게이션**: 모든 컴포넌트가 키보드로 완전히 조작 가능합니다.
- **스크린 리더 지원**: ARIA 속성을 적절히 사용하여 스크린 리더 사용자를 지원합니다.

### 커스터마이징 용이성

- **Tailwind CSS 기반**: Tailwind CSS를 사용하여 스타일을 쉽게 커스터마이징할 수 있습니다.
- **유연한 스타일링**: 상황에 따라 **Tailwind CSS**를 사용하지 않고 Sass, Emotion, CSS Modules 등 원하는 어떤 스타일링 기술을 사용하든 쉽게 적용 가능합니다.
- **UI 컴포넌트**: 기존에 널리 사용되는 UI 프레임워크(**MUI, AntD, Chakra UI**)의 컴포넌트가 아닌, **헤드리스 컴포넌트** 방식을 도입하여 프로젝트 상황에 맞게 자유롭게 수정하고 확장할 수 있습니다.
  :::info 헤드리스 컴포넌트란?
  **헤드리스 컴포넌트**는 **사용자 인터페이스(UI) 없이** 컴포넌트의 핵심 **기능 로직**과 **상태 관리**만을 담당하는 디자인 패턴입니다. 말 그대로 '머리(Head, 즉 시각적인 UI)'가 없는 컴포넌트입니다.

  UI 구현은 외부에 위임하며, 개발자는 이 헤드리스 컴포넌트가 제공하는 로직과 상태를 활용하여 **자신만의 커스텀된 UI**를 자유롭게 만들 수 있습니다.
  :::

### 현대적인 아키텍처

- **도메인 기반 구조(DDD)**: 기능 또는 업무별로 도메인을 분리하여 소스코드의 복잡도와 충돌 가능성을 낮추고, 유지보수성과 확장성을 크게 향상시켰습니다.
- **재사용 가능한 유틸리티**: 공통 API 모듈, 유틸리티 함수, 상태 관리 로직을 제공합니다.
- **모듈화된 설계**: 각 컴포넌트가 독립적으로 동작하며 필요한 부분만 선택적으로 사용할 수 있습니다.
- **React Router 기반 라우팅**: 파일 기반이 아닌 선언형 라우팅으로 유연한 페이지 구조를 구성할 수 있습니다.

### 상태 관리 및 서버 상태 관리

- **TanStack Query (React Query) 통합**: 서버 상태 관리를 위한 강력한 라이브러리로 데이터 페칭, 캐싱, 동기화를 자동으로 처리합니다.
- **Zustand 통합**: 간단한 클라이언트 상태 관리를 위한 경량 상태 관리 라이브러리로 데이터 캐싱, 동기화를 자동으로 처리합니다.
- **자동 캐싱 및 리페칭**: API 응답을 자동으로 캐싱하고 백그라운드에서 데이터를 최신 상태로 유지합니다.
- **낙관적 업데이트**: UI를 즉시 업데이트하고 백그라운드에서 서버와 동기화하여 빠른 사용자 경험을 제공합니다.
- **중복 요청 방지**: 동일한 데이터에 대한 중복 요청을 자동으로 방지하고 하나의 요청으로 통합합니다.
- **API 통합 지원**: Axios 기반의 공통 API 클라이언트를 제공하여 백엔드와의 통신을 간소화합니다.

### 성능 최적화

- **코드 스플리팅**: React의 `lazy()` + `Suspense`를 활용하여 페이지별로 필요한 코드만 로드, 초기 번들 크기를 최소화합니다. 또한 `@loadable/component`를 활용하여 코드 스플리팅을 더욱 효과적으로 구현할 수 있습니다.
- **컴포넌트 메모이제이션**: `React.memo`, `useMemo`, `useCallback`을 통해 불필요한 리렌더링을 방지합니다. (React Compiler는 아직 적용하지 않았으며, 도입 시 대부분의 수동 메모이제이션을 자동화할 수 있습니다.)
- **빠른 빌드 및 HMR**: Vite 기반의 초고속 개발 서버와 Hot Module Replacement(HMR)로 빠른 피드백 루프를 제공합니다.
- **트리 셰이킹**: 사용하지 않는 코드를 자동으로 제거하여 번들 크기를 최소화합니다.

### 개발자 경험 (DX)

- **인터랙티브 문서**: UI 컴포넌트를 직접 조작해보며 동작을 확인할 수 있는 라이브 데모를 제공합니다.
- **전역 유틸리티 객체**: `$router`, `$util`, `$ui` 등의 객체를 통해 편리한 전역 접근을 제공하고, 자주 사용하는 로직을 구현할 필요없이 바로 사용할 수 있습니다.
- **빠른 개발 환경**: Vite를 활용한 초고속 Hot Module Replacement(HMR)로 코드 수정 결과를 즉시 확인할 수 있습니다.




## 기반 기술

### 핵심 프레임워크 및 라이브러리

- **React 19.x**: 최신 버전의 React를 사용하여 최신 기능과 성능 최적화를 활용합니다.
- **TypeScript 6.x**: 정적 타입 검사를 통한 안정적인 코드 작성.
- **Vite 8.x**: 빠른 개발 서버와 최적화된 프로덕션 빌드를 제공하는 차세대 프론트엔드 빌드 도구.

### 코드 품질 도구

- **ESLint** (`eslint.config.js`): 문법 오류, 잠재적 버그, 잘못된 Hook 사용 등을 정적 분석하여 코드 품질과 팀 컨벤션을 유지합니다. (`typescript-eslint`, `eslint-plugin-react-hooks`, `@tanstack/eslint-plugin-query` 등 적용)
- **Prettier** (`prettier.config.js`): 저장 시 코드 스타일을 자동으로 통일하여 스타일 논쟁 없이 로직에만 집중할 수 있습니다.

### 테스트

- **Vitest**: Vite 기반의 초고속 단위/컴포넌트 테스트 러너로, 개발 서버와 동일한 설정을 공유합니다.
- **Playwright (Browser Mode)**: 실제 브라우저 환경에서 컴포넌트를 렌더링하여 검증하는 `@vitest/browser-playwright` 기반 테스트를 지원합니다.
- **Storybook Vitest / a11y Addon**: `@storybook/addon-vitest`로 스토리를 그대로 테스트로 실행하고, `@storybook/addon-a11y`로 접근성을 자동 점검합니다.(아직 연결 안됨.)
- **커버리지 측정**: `@vitest/coverage-v8`를 통한 코드 커버리지 리포트를 제공합니다.

### UI 프레임워크 및 스타일링

- **Tailwind CSS v4**: 유틸리티 우선 CSS 프레임워크로 빠르고 일관된 스타일링 (`@tailwindcss/vite` 플러그인 기반의 CSS-first 설정)
- **shadcn/ui (Radix UI · Base UI)**: 접근성을 고려한 헤드리스 UI 프리미티브 라이브러리 (`radix-ui`, `@base-ui/react`)
- **Lucide React**: 현대적이고 일관된 아이콘 세트
- **class-variance-authority / clsx / tailwind-merge**: 컴포넌트 variant 관리 및 조건부 클래스 병합(`cn`) 유틸리티
- **Shiki**: VS Code 수준의 문법 하이라이팅 엔진으로, `CodeBlock` 컴포넌트의 코드 표시에 사용됩니다.
- **tw-animate-css / Geist 폰트**: 트랜지션 애니메이션 유틸과 가변 폰트(`@fontsource-variable/geist`)를 기본 제공합니다.

### 애니메이션 및 미디어

- **anime.js**: 가볍고 강력한 JavaScript 애니메이션 엔진으로 복잡한 모션을 구현합니다.
- **Lottie (`lottie-react`)**: After Effects로 제작한 JSON 기반 벡터 애니메이션을 재생합니다.
- **Carousel/Slider**: `embla-carousel-react`(+ autoplay)와 `swiper`로 다양한 형태의 캐러셀/슬라이더를 구성합니다.

### SEO 및 메타 관리

- **react-helmet-async**: 페이지별 `<title>`·메타 태그를 선언형으로 관리하여 SEO와 공유 미리보기를 최적화합니다.

### 상태 관리 및 데이터 페칭

- **TanStack Query (React Query)**: 서버 상태 관리 및 데이터 페칭을 위한 강력한 라이브러리
  - 자동 캐싱 및 백그라운드 리페칭
  - 낙관적 업데이트 및 무한 스크롤 지원
  - 요청 상태 관리 (loading, error, success)
  - 중복 요청 자동 제거
- **Axios**: HTTP 클라이언트로 API 통신 처리
  - 인터셉터를 통한 요청/응답 처리
  - 중복 요청 방지 메커니즘
  - 에러 핸들링
- **Zustand (선택적)**: 간단한 클라이언트 상태 관리를 위한 경량 상태 관리 라이브러리

### 라우팅

- **React Router**: 선언형 클라이언트 사이드 라우팅 라이브러리
- **중첩 라우팅**: 레이아웃과 페이지 컴포넌트를 유연하게 조합
- **코드 스플리팅 연동**: `@loadable/component`의 `loadable(() => import(...))` 기반 라우트별 번들 분리로 성능 최적화

### 날짜 및 시간 처리

- **date-fns**: 날짜 유틸리티 라이브러리
- **dayjs**: 경량 날짜 라이브러리
- **react-day-picker**: React용 날짜 선택 컴포넌트


### 프로젝트 구조

**react-app-scaffold** 프로젝트는 다음과 같은 구조로 구성되어 있습니다:

```sh
react-app-scaffold
├── .axiom                           # SDD 방법론 개발을 위한 스펙 md파일들의 모음 폴더
├── .storybook                       # Storybook 설정
├── .vscode                          # VSCode 설정
│   └── settings.json                # 에디터 설정 (Format on Save 등)
├── public                           # 정적 파일 (/ 경로로 접근)
├── src
│   ├── __stories__                  # Storybook 소스 코드 모음
│   ├── design-tokens                # style-dictionary 라이브러리를 통한 디자인 토큰 생성용 json 작업 폴더
│   ├── assets                       # 정적 리소스
│   │   ├── images
│   │   └── styles
│   │       ├── tokens/                  ← (신규, 자동생성) Style Dictionary 출력물
│   │       │   ├── primitive.css        ← ⚠ 직접 편집 금지 (generated)
│   │       │   ├── theme-dark.css
│   │       │   └── theme-light.css
│   │       ├── themes/                  ← (신규) 프로젝트 브랜드 테마
│   │       │   ├── theme-default.css
│   │       │   └── theme-example-project.css  ← 투입 시 참고용 예시
│   │       ├── base/                    ← (신규) 전역 초기화·유틸
│   │       │   ├── reset.css
│   │       │   ├── typography.css
│   │       │   ├── layout.css
│   │       │   └── utilities.css
│   │       ├── layout/
│   │       │   └── default/layout.css   ← 기존, 서드파티 오버라이드만 남김
│   │       └── app.css                  ← @import 진입점
│   ├── config                       # SI가 관리하는 앱 설정 레이어 (api·auth·query·router·theme.config.ts를 index.ts에서 통합 export)
│   ├── core                         # 핵심 공통 코어 (업무 개발자 미작업 영역)
│   │   ├── api                      # Axios 기반 공통 API 클라이언트
│   │   ├── context                  # 공통 컨텍스트 컴포넌트
│   │   ├── hooks                    # 공통 커스텀 훅
│   │   ├── providers                # 전역 Provider 모음
│   │   ├── query                    # TanStack Query 설정
│   │   ├── router                   # 앱 공통 라우터 설정
│   │   ├── types                    # 공통 타입 정의
│   │   └── utils                    # 공통 유틸리티 함수
│   ├── domains                      # 업무(Domain) 그룹
│   │   ├── example                  # example 도메인
│   │   │   ├── components           # example 도메인 컴포넌트 모음
│   │   │   ├── common               # example 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # example 도메인 페이지 모음
│   │   │   ├── router               # example 도메인 라우팅 설정
│   │   │   └── types                # example 도메인 타입 정의
│   │   ├── main                     # main 도메인
│   │   │   ├── components           # main 도메인 컴포넌트 모음
│   │   │   ├── common               # main 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # main 도메인 페이지 모음
│   │   │   ├── router               # main 도메인 라우팅 설정
│   │   │   └── types                # main 도메인 타입 정의
│   │   └── ...                      # (신규 도메인 추가)
│   ├── publishing                   # 퍼블리셔가 작업하여 제공하는 폴더.(업무별로 폴더를 생성)
│   │   ├── example                  # example 도메인 업무
│   │   │   ├── components           # example 도메인 컴포넌트 모음
│   │   │   ├── common               # example 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # example 도메인 페이지 모음
│   │   │   ├── router               # example 도메인 라우팅 설정
│   │   │   └── types                # example 도메인 타입 정의
│   │   ├── main                     # main 도메인 업무
│   │   │   ├── components           # main 도메인 컴포넌트 모음
│   │   │   ├── common               # main 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # main 도메인 페이지 모음
│   │   │   ├── router               # main 도메인 라우팅 설정
│   │   │   └── types                # main 도메인 타입 정의
│   │   └── ...                      # (신규 도메인 업무 계속 추가하여 작업)
│   ├── shared                       # 전역 공유 코드
│   │   ├── auth                     # JWT인증 토큰관련 폴더
│   │   ├── components               # 공유 컴포넌트 작업 공간
│   │   │   ├── router                  # 라우트 관련 로직 처리
│   │   │   └── ui                      # ui 관련 공유 컴포넌트
│   │   ├── layouts                  # 레이아웃 관련 폴더
│   │   ├── lib                      # 외부 라이브러리 연동 코드 (shadcn/ui 원본, Shiki 하이라이터 등)
│   │   │   ├── shadcn               # shadcn/ui 원본 컴포넌트
│   │   │   │   └── ui                   # shadcn/ui UI 컴포넌트 모음
│   │   │   └── utils.ts                 # shadcn/ui 유틸리티 함수 모음
│   │   ├── router                   # 전체 라우팅 통합 설정(업무 라우트 세팅)
│   │   ├── ui                       # UI 컴포넌트 진입점
│   │   └── utils/cn.ts              # Tailwind를 사용할 때 조건부 조합을 위한 cn함수.
│   ├── test                         # 테스트 공통 세팅 (setup.ts — Vitest setupFiles, jest-dom 매처 등록)
│   ├── types                        # TypeScript 전역 타입
│   ├── App.tsx                      # 앱 루트 컴포넌트
│   └── main.tsx                     # 앱 진입점
├── .env                             # 공통 환경 변수
├── .env.production                  # 프로덕션 환경 변수
├── .gitignore
├── components.json                  # shadcn/ui CLI 설정
├── eslint.config.js                 # ESLint 린팅 규칙
├── index.html                       # 루트 HTML
├── package.json                     # 의존성 및 스크립트
├── prettier.config.js               # Prettier 포매팅 규칙
├── tsconfig.json                    # TypeScript 설정 (루트)
├── tsconfig.app.json                # TypeScript 설정 (App)
├── tsconfig.node.json               # TypeScript 설정 (Node)
├── tsconfig.stories.json            # TypeScript 설정 (Storybook)
└── vite.config.ts                   # Vite 빌드 설정
```
