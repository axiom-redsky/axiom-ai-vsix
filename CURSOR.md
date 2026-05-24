# 프로젝트 개요

**axiom-ai**는 `react-app-scaffold` 기반 프로젝트에서 개발 생산성을 높이기 위한 VSCode Extension이다.
Extension이 설치되는 대상 워크스페이스는 아래 구조를 따른다:

```
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
│   │   ├── components
│   │   │   └── layout               # 레이아웃 컴포넌트
│   │   ├── lib
│   │   │   ├── shadcn               # shadcn/ui 원본 컴포넌트
│   │   │   │   └── ui                   # shadcn/ui UI 컴포넌트 모음
│   │   │   └── utils.ts                 # shadcn/ui 유틸리티 함수 모음
│   │   └── router                   # 전체 라우팅 통합 설정
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
* 실제 프로젝트 참조 URL : 

# 워크플로우(workflow)
* 업무 매뉴얼 / SOP

# 에이전트
* 클로드코드 = 자체

# 툴
* 파이썬 파일들