---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '퍼블리셔 가이드'
---

# 퍼블리셔 가이드

새 SI 프로젝트가 시작되면, **Figma 디자인을 실제 화면으로 옮기는 사람**이 필요합니다.
이 문서는 그 역할을 맡은 **퍼블리셔** 를 위한 안내서입니다.

여러분은 이미 **Figma에서 사이트 디자인을 확인했고, 어떤 색과 레이아웃으로 가야 하는지 판단이 서 있는 상태** 라고 가정합니다.
이 가이드는 그 판단을 **react-app-scaffold(이하 Scaffold) 안에서 어디를, 어떤 순서로 고치면 되는지** 알려 줍니다.




## 목차
---

1. [이 가이드는 누구를 위한 것인가요?](#이-가이드는-누구를-위한-것인가요)
2. [전체 작업 흐름 5단계](#전체-작업-흐름-5단계)
3. [0단계 · 시작 전 10분, 구조 파악하기](#0단계--시작-전-10분-구조-파악하기)
4. [1단계 · Figma 디자인과 Scaffold 맞춰 보기](#1단계--figma-디자인과-scaffold-맞춰-보기)
5. [2단계 · 색·글꼴·간격 입히기 (디자인 토큰)](#2단계--색글꼴간격-입히기-디자인-토큰)
6. [3단계 · 레이아웃 맞추기](#3단계--레이아웃-맞추기)
7. [4단계 · 화면(컴포넌트) 만들기](#4단계--화면컴포넌트-만들기)
8. [5단계 · 검수와 핸드오프](#5단계--검수와-핸드오프)
9. [자주 막히는 것](#자주-막히는-것)
10. [하지 말아야 할 것](#하지-말아야-할-것)




## 이 가이드는 누구를 위한 것인가요?
---

### 담당자의 역할

프로젝트에 참여하는 사람은 크게 세 종류이고, 이 문서는 그중 **두 번째 사람**을 위한 것입니다.

| 역할 | 하는 일 | 참고 가이드 |
|------|---------|------------|
| 프론트엔드 공통 개발자 | Scaffold를 사이트에 심고, 설정·빌드·구조를 갖춰 **바탕**을 만든다 | [프론트공통 가이드](../frontend-common/index.md) |
| **퍼블리셔** (이 문서) | 그 바탕 위에 **색상·글꼴·레이아웃·화면 마크업**을 입힌다 | 이 페이지 |
| 업무 개발자 | 갖춰진 화면에 **데이터와 동작**을 붙인다 | [개발 가이드](../../documents/dev/create-biz-pages.md) |

한 줄로 요약하면 이렇습니다.

> **"Figma에 있는 디자인을, Scaffold가 이미 갖고 있는 구조 위에 옮겨 담는 사람"**

:::info 가장 중요한 마음가짐
Scaffold는 **빈 도화지가 아닙니다.** 색·간격·글꼴을 담는 그릇(디자인 토큰)과 화면 뼈대(레이아웃)가 **이미 만들어져 있습니다.**

그래서 작업 방식이 일반 퍼블리싱과 다릅니다.

- ❌ HTML/CSS를 처음부터 새로 쓴다
- ✅ **이미 있는 그릇에 우리 디자인 값을 채워 넣는다**

이렇게 하면 화면 한 곳만 고쳐도 **사이트 전체 색이 한 번에 바뀝니다.**
다만 구조가 도저히 안 맞으면 **바꿔도 됩니다.** 판단 기준은 [1단계](#1단계--figma-디자인과-scaffold-맞춰-보기) 에서 정리합니다.
:::

### 알아두면 좋은 낱말

| 낱말 | 쉬운 설명 |
|------|----------|
| **디자인 토큰** | 색·글꼴·간격 같은 디자인 값을 **이름표를 붙여 한 곳에 모아 둔 것**. `#499ed8` 대신 `brand-500` 이라고 부릅니다. |
| **Tailwind 유틸리티** | `bg-brand-500`, `mt-4` 처럼 **클래스 이름만으로 스타일을 주는 방식**. 이 프로젝트의 기본 스타일링 방법입니다. |
| **시맨틱 변수** | `--primary`, `--background`, `--card` 처럼 **"쓰임새"로 이름 붙인 색**. 라이트/다크에서 각각 다른 값을 가집니다. |
| **CSS Module** | `*.module.css` 파일. 클래스 이름이 자동으로 고유해져서 **다른 화면과 충돌하지 않는** CSS입니다. |
| **`data-slot`** | 공통 컴포넌트(버튼·아코디언 등) 내부 요소에 붙어 있는 표식. **그 표식을 골라 스타일을 덮어쓸 수 있습니다.** |
| **다크 모드** | `<html>` 에 `dark` 클래스가 붙는 방식. Tailwind에서는 `dark:` 를 앞에 붙여 씁니다. |

:::warning 이 프로젝트에는 `tailwind.config.js` 가 없습니다
Tailwind v4 를 쓰기 때문에 **설정 파일이 아니라 CSS 파일에서 토큰을 정의**합니다.
인터넷에서 찾은 Tailwind 예제 중 `tailwind.config.js` 를 고치라는 설명은 **이 프로젝트에 맞지 않습니다.**
:::




## 전체 작업 흐름 5단계
---

| 단계 | 무엇을 하나 | 주로 고치는 곳 | 끝났다는 기준 |
|:---:|------------|--------------|-------------|
| **0** | 구조 파악 | (보기만 함) | 어디를 고치면 되는지 안다 |
| **1** | Figma와 Scaffold 맞춰 보기 | (판단만 함) | 토큰/레이아웃/컴포넌트 처리 방향 결정 |
| **2** | 색·글꼴·간격 입히기 | `assets/styles/themes/`, `design-tokens/` | 사이트 전체가 우리 색으로 보임 |
| **3** | 레이아웃 맞추기 | `shared/layouts/default/` | 헤더·사이드바가 디자인대로 보임 |
| **4** | 화면 만들기 | `src/publishing/` | 각 화면 마크업 완성 |
| **5** | 검수·핸드오프 | (개발자와 함께) | 개발자가 데이터를 붙일 수 있는 상태 |

:::tip 2단계를 먼저 끝내세요
색 토큰을 먼저 정리해 두면, 4단계에서 화면을 만들 때 **색을 일일이 찾아 넣을 필요가 없습니다.**
반대로 화면부터 만들면, 나중에 색이 바뀔 때 **모든 화면을 다시 고쳐야 합니다.**
:::




## 0단계 · 시작 전 10분, 구조 파악하기
---

> **목표**: "어디를 고치면 되고, 어디를 건드리면 안 되는지" 를 파악한다.

### 0-1. 화면 먼저 띄워 보기

```bash
npm run dev        # 개발 서버 → http://localhost:5173
npm run storybook  # 토큰·컴포넌트 카탈로그 → http://localhost:6006
```

두 개를 동시에 띄워 놓고 작업하는 것을 권합니다.

| 띄운 것 | 여기서 보는 것 |
|--------|--------------|
| **개발 서버** (5173) | 실제 화면. 왼쪽 사이드바에 **UI 컴포넌트 예제 34개**가 들어 있습니다 |
| **Storybook** (6006) | `Getting Started` → **Design Tokens** 에서 **쓸 수 있는 색·그림자·글자 크기 전체 목록** 확인 |

:::note 인터넷이 없어도 됩니다
둘 다 내 PC에서 도는 프로그램이라 **폐쇄망에서도 그대로 실행**됩니다.
:::

### 0-2. 내가 고치는 폴더 / 안 고치는 폴더

```sh
src/
├── assets/styles/          ★ 여기가 주 작업 공간
│   ├── app.css                 스타일 진입점 (import 순서 = 우선순위)
│   ├── themes/                 ★ 색상 테마 (2단계에서 작업)
│   ├── base/                   글꼴·리셋·타이포
│   ├── layout/                 레이아웃 CSS
│   └── tokens/                 ⚠ 자동 생성 폴더 — 직접 고치지 마세요
│
├── design-tokens/          ★ 색·간격·글꼴의 원본(JSON)
│
├── publishing/             ★ 새 화면을 만드는 작업 공간 (4단계)
│
├── shared/layouts/default/ ★ 헤더·사이드바 (3단계, 개발자와 협의)
│
├── shared/ui/              공통 컴포넌트 — 스타일만 덮어쓰고 파일은 안 고침
├── domains/example/        예제 모음 — 참고용, 고치지 않음
├── config/ · core/         ⛔ 개발자 영역 — 건드리지 않음
└── .env                    ⛔ 개발자 영역 — 건드리지 않음
```

:::danger 절대 직접 고치면 안 되는 곳
**`src/assets/styles/tokens/` 안의 CSS 파일**

이 파일들은 `design-tokens/` 의 JSON에서 **자동으로 만들어집니다.**
직접 고쳐도 다음에 개발 서버를 다시 띄우면 **전부 지워집니다.**

→ 값을 바꾸려면 반드시 **JSON 원본을 고쳐야** 합니다. ([2-5](#2-5-간격그림자-등-나머지-토큰) 참고)
:::

### 0-3. 스타일이 적용되는 순서 (`app.css`)

`app.css` 는 스타일을 **불러오는 순서만** 적혀 있는 파일입니다. **아래에 있을수록 우선**합니다.

```css title="src/assets/styles/app.css"
/* ───────────── 아래는 건드릴 일 없음 ───────────── */
@import 'tailwindcss';              /* 1. 외부 라이브러리 */
@import './tokens/primitive.css';   /* 2. 자동 생성 토큰 */
@import './base/reset.css';         /* 3. 리셋·글꼴·타이포 */

/* ───────────── ▼▼ 퍼블리셔 수정 지점 ▼▼ ───────────── */
@import './themes/theme-default.css';      /* 4. 색상 테마    ← 여기 */
@import './layout/default/layout.css';     /* 5. 레이아웃 CSS ← 여기 */
/* ───────────── ▲▲ 퍼블리셔 수정 지점 끝 ▲▲ ───────────── */

@custom-variant dark (&:is(.dark *));
```

:::info 이 구조가 의미하는 것
**4번(테마)이 2번(기본 토큰)보다 아래에 있습니다.**
그래서 테마 파일에 우리 색을 적으면 **기본값을 덮어씁니다.** 기본 토큰 파일을 고칠 필요가 없는 이유입니다.
:::




## 1단계 · Figma 디자인과 Scaffold 맞춰 보기
---

> **목표**: 코드를 고치기 전에, **무엇을 토큰으로 처리하고 무엇을 새로 만들지** 결정한다.
> **결과물**: 아래 3개 질문에 대한 답 (개발자와 공유)

### 1-1. Figma에서 뽑아 와야 하는 값

작업을 시작하기 전에 Figma에서 아래 값을 정리해 두세요. **2단계가 훨씬 빨라집니다.**

| 무엇 | 몇 개 | 어디에 쓰이나 |
|------|------|-------------|
| **메인 브랜드 색** | 1개 (+ 가능하면 밝은/어두운 단계) | 버튼·링크·강조·메뉴 선택 상태 |
| **배경 / 카드 / 테두리 색** | 각 1개 (라이트) | 화면 전체 톤 |
| **글자 색** | 기본 / 흐린 글자 | 본문·설명글 |
| **상태 색** | 성공·경고·오류 | 알림·뱃지·폼 검증 |
| **본문 글꼴** | 1개 | 사이트 전체 |
| **모서리 둥글기** | 1개 기준값 | 버튼·카드·입력창 |
| **다크 모드 색** | 위 항목의 다크 버전 | 다크 모드 지원 시 |

:::tip 다크 모드를 안 쓰기로 했다면
공통 개발자에게 **"다크 모드를 끌지"** 먼저 확인하세요.
Scaffold는 라이트/다크를 **둘 다 지원하도록 만들어져 있어서**, 다크 값을 안 채우면 다크 모드에서 화면이 어색해집니다.
:::

### 1-2. 세 가지 판단

Figma 디자인을 보면서 아래 3가지를 판단합니다.

#### 판단 ① 색·글꼴·간격 → **거의 항상 토큰으로 처리합니다**

| Figma 상황 | 처리 방법 | 단계 |
|-----------|----------|:---:|
| 브랜드 색만 다름 | 테마 파일에서 색 값만 교체 | 2 |
| 색 단계(10단계 팔레트)가 있음 | `brand-25 ~ brand-950` 에 그대로 매핑 | 2 |
| 간격·글자 크기 체계가 다름 | `design-tokens/` JSON 수정 | 2-5 |
| 색이 완전히 다른 체계 (예: 색 이름이 5개뿐) | 토큰 이름은 그대로 두고 **값만** 우리 색으로 | 2 |

:::note 토큰 "이름"은 바꾸지 않는 것을 권합니다
`brand-500` 이라는 이름이 마음에 안 들어도 그대로 두세요.
이름을 바꾸면 **Scaffold가 이미 쓰고 있는 모든 화면(예제·레이아웃·공통 컴포넌트)이 한꺼번에 깨집니다.**
**이름은 그릇, 값은 내용물** 이라고 생각하고 **내용물만 바꾸면 됩니다.**
:::

#### 판단 ② 레이아웃 → **먼저 맞춰 보고, 안 되면 바꿉니다**

현재 Scaffold의 화면 뼈대는 이렇습니다.

```sh
┌──────────┬────────────────────────────────┐
│          │  AppHeader (로고·검색·테마토글) │
│ AppSide  ├────────────────────────────────┤
│  bar     │                                │
│ (메뉴)   │  Outlet ← 각 화면이 들어오는 곳 │
│          │                                │
└──────────┴────────────────────────────────┘
```

| Figma 상황 | 처리 방법 | 난이도 |
|-----------|----------|:---:|
| 사이드바 + 헤더 구조가 같고 **색·폭·높이만 다름** | 기존 컴포넌트의 클래스만 수정 | 쉬움 |
| 메뉴 항목·로고가 다름 | `navigation.tsx` + 로고 이미지 교체 | 쉬움 |
| **사이드바가 없고 상단 메뉴(GNB)만 있음** | 레이아웃 폴더를 복제해 구조 변경 | 보통 |
| 화면마다 레이아웃이 다름 (로그인 화면 등) | 레이아웃을 추가로 만듦 (개발자와 협의) | 보통 |

:::tip "구조상 힘들면 바꿔도 된다" 의 실제 기준
아래에 **하나라도 해당하면 구조를 바꾸는 쪽이 맞습니다.**

- 기존 구조에 맞추려고 **음수 마진·`!important`·복잡한 겹침**을 쓰게 될 때
- Figma에 **사이드바 자체가 없을 때**
- 헤더가 **스크롤에 따라 완전히 다르게 동작**해야 할 때

바꾸는 방법은 [3-2](#3-2-구조를-바꿔야-할-때-폴더-복제) 에 있습니다. **혼자 결정하지 말고 공통 개발자와 함께** 진행하세요.
:::

#### 판단 ③ 컴포넌트 → **있는 것을 다시 칠하는 것이 우선입니다**

Scaffold에는 **버튼·입력창·모달·표 등 35종의 공통 컴포넌트**가 이미 들어 있습니다.

| Figma 상황 | 처리 방법 | 단계 |
|-----------|----------|:---:|
| 같은 컴포넌트인데 **모양만 다름** (버튼·카드·탭 등) | 기존 컴포넌트 + **재스타일** | 4-4 |
| **애니메이션·아이콘 방식**이 다름 | 공개 CSS 변수 또는 `data-slot` 오버라이드 | 4-4 |
| Scaffold에 **없는 컴포넌트** | `publishing/` 에서 새로 제작 | 4-1 |
| 있긴 한데 **동작 자체가 다름** | 공통 개발자와 협의 후 결정 | — |

:::danger 공통 컴포넌트 파일(`src/shared/ui/`)은 직접 고치지 마세요
그 파일은 **모든 화면이 함께 쓰는 파일**이라, 한 화면 때문에 고치면 **다른 화면이 전부 바뀝니다.**
겉모습만 바꾸고 싶을 때는 **바깥에서 덮어쓰는 방법**([4-4](#4-4-공통-컴포넌트-다시-칠하기))을 씁니다.
:::

### 1-3. 결정 사항 공유하기

판단이 끝나면 공통 개발자에게 아래를 알려 주세요. **개발자가 연결해 줘야 반영되는 항목**이 있습니다.

- [ ] 테마 파일 이름 (예: `theme-abc.css`) → 개발자가 `app.css` 에 연결
- [ ] 레이아웃 구조를 바꿀지 여부 → 바꾼다면 폴더 복제 + 스위치 3곳 교체 필요
- [ ] 다크 모드 지원 여부
- [ ] Scaffold에 없어서 새로 만들 컴포넌트 목록




## 2단계 · 색·글꼴·간격 입히기 (디자인 토큰)
---

> **목표**: 사이트 전체가 **우리 브랜드 색**으로 보이게 만든다.
> **핵심**: 화면을 하나씩 고치는 게 아니라, **값 하나를 바꿔서 전체를 바꿉니다.**

### 2-1. 토큰이 흘러가는 길

```sh
 [1] design-tokens/*.json          색·간격·글꼴의 원본 (JSON)
          │
          │  npm run build:tokens  (npm run dev 하면 자동 실행)
          ▼
 [2] assets/styles/tokens/*.css    자동 생성 ⚠ 직접 편집 금지
          │
          ▼
 [3] assets/styles/themes/*.css    ★ 퍼블리셔 작업 파일 — 위 값을 덮어씀
          │
          ▼
 [4] 화면에서 사용                  bg-brand-500 / text-foreground / bg-card ...
```

**대부분의 작업은 [3]번 파일 하나에서 끝납니다.**

| 바꾸고 싶은 것 | 고칠 곳 |
|--------------|--------|
| 브랜드 색, 배경·카드·테두리, 다크 모드 색, 모서리 둥글기, 글꼴 이름 | **[3] 테마 파일** |
| 간격 체계, 글자 크기 체계, 그림자 값, 색 팔레트 자체 추가 | **[1] JSON 원본** |

### 2-2. 테마 파일 만들기

`src/assets/styles/themes/` 폴더에 **우리 프로젝트용 파일**을 만듭니다.

```bash
# theme-default.css 를 복사해서 시작하는 것을 권합니다 (3개 블록이 다 들어 있음)
theme-default.css  →  theme-abc.css      # abc = 우리 프로젝트 이름
```

:::note `theme-example-project.css` 는 뭔가요?
**사용법을 보여주는 견본**입니다. 안이 전부 주석이라 그대로 쓰면 아무 일도 일어나지 않습니다.
읽어 보는 용도로만 쓰고, **실제 작업은 `theme-default.css` 를 복사**해서 시작하세요.
:::

만든 파일은 **공통 개발자가 `app.css` 에 연결**해 줍니다.

```css title="src/assets/styles/app.css"
/* 둘 중 하나만 살립니다 */
/* @import './themes/theme-default.css'; */
@import './themes/theme-abc.css';
```

### 2-3. 테마 파일의 3개 블록

복사한 파일 안에는 블록이 3개 있습니다. **위에서부터 순서대로 채우면 됩니다.**

#### 블록 1 — `@theme inline` : 글꼴과 모서리

여기는 대부분 그대로 두고, **글꼴 이름과 둥글기만** 확인하면 됩니다.

```css
@theme inline {
	--font-sans: 'Geist Variable', sans-serif;   /* ← 우리 글꼴로 교체 */
	--radius-sm: calc(var(--radius) * 0.6);      /* --radius 기준으로 자동 계산됨 */
	--radius-md: calc(var(--radius) * 0.8);
	/* ... 아래는 공통 컴포넌트 연결용이라 그대로 두세요 ... */
}
```

#### 블록 2 — `@theme` : 브랜드 색 팔레트 (가장 중요)

Figma의 브랜드 색을 **12단계**로 만들어 넣습니다.

```css
@theme {
	--color-brand-25:  #f6fafd;   /* 가장 밝음 — 아주 옅은 배경 */
	--color-brand-50:  #edf5fb;
	--color-brand-100: #dbecf7;
	--color-brand-200: #b6d8ef;
	--color-brand-300: #89c0e6;
	--color-brand-400: #64adde;   /* 다크 모드의 메인 색으로 자주 씀 */
	--color-brand-500: #499ed8;   /* ★ 메인 브랜드 색 */
	--color-brand-600: #408bbe;   /* 마우스 올렸을 때(hover) */
	--color-brand-700: #35729c;
	--color-brand-800: #2a5c7d;
	--color-brand-900: #214761;
	--color-brand-950: #142c3c;   /* 가장 어두움 */

	/* 포커스 링도 같이 브랜드 색으로 맞춥니다 */
	--shadow-focus-ring: 0px 0px 0px 4px rgba(73, 158, 216, 0.12);
}
```

:::warning 이 블록을 빠뜨리면 "메뉴 색만 안 바뀌는" 문제가 생깁니다
사이드바의 **선택된 메뉴 강조색**, 검색창 **포커스 테두리** 등은 `brand-*` 를 **직접** 사용합니다.
아래 블록 3의 `--primary` 만 바꾸면 **그 부분만 기본 파랑(`#465fff`)으로 남습니다.**

→ **블록 2와 블록 3을 항상 같이 채우세요.**
:::

:::tip 12단계 색을 어떻게 만드나요?
Figma에 팔레트가 있으면 그대로 넣으면 됩니다. 없다면 아래처럼 처리하세요.

- 메인 색을 **500** 에 넣습니다
- **600·700** 은 조금씩 어둡게 (hover·눌림 상태에 쓰임)
- **25·50·100** 은 아주 옅게 (선택된 메뉴 배경, 알림 배경에 쓰임)
- **400** 은 밝게 (다크 모드에서 메인 색으로 씀)
- 나머지는 사이를 자연스럽게 채우면 됩니다

12개를 모두 정확히 맞출 필요는 없습니다. **500 / 400 / 600 / 50 네 개만 잘 잡으면** 대부분의 화면이 자연스러워집니다.
:::

#### 블록 3 — `:root` / `.dark` : 쓰임새별 색

여기서 **"이 색을 어디에 쓸지"** 를 정합니다. 라이트는 `:root`, 다크는 `.dark` 에 씁니다.

```css
/* 라이트 모드 */
:root {
	--background: #f0f3f7;          /* 화면 전체 배경 */
	--foreground: #101828;          /* 기본 글자색 */
	--card: #ffffff;                /* 카드·패널 배경 */
	--primary: #499ed8;             /* 주요 버튼·링크 (= brand-500) */
	--primary-foreground: #ffffff;  /* 주요 버튼 위의 글자색 */
	--muted-foreground: #667085;    /* 설명글처럼 흐린 글자 */
	--border: #e4e7ec;              /* 테두리·구분선 */
	--ring: #499ed8;                /* 포커스 테두리 */
	--destructive: #f04438;         /* 삭제·오류 */
	--radius: 0.5rem;               /* 모서리 둥글기 기준값 */

	/* 사이드바 전용 */
	--sidebar: #ffffff;
	--sidebar-foreground: #667085;
	--sidebar-accent: rgba(73, 158, 216, 0.1);   /* 선택된 메뉴 배경 */
	--sidebar-border: #e4e7ec;
}

/* 다크 모드 — 같은 이름에 어두운 값을 넣습니다 */
.dark {
	--background: #0c111d;
	--foreground: #e4e7ec;
	--card: #1a2231;
	--primary: #64adde;             /* 다크에서는 한 단계 밝게 (= brand-400) */
	--primary-foreground: #0c111d;
	--border: rgba(255, 255, 255, 0.08);
	/* ... 라이트에 적은 항목을 같은 이름으로 모두 채웁니다 ... */
}
```

:::info 왜 색 이름이 `blue` 가 아니라 `primary` 인가요?
**"파란색"이 아니라 "주요 색"** 이라고 이름 붙여야, 나중에 브랜드 색이 초록으로 바뀌어도 **이 파일 하나만 고치면 되기 때문**입니다.
화면에서도 `bg-blue-500` 이 아니라 `bg-primary`, `text-foreground`, `bg-card` 처럼 **쓰임새 이름**으로 씁니다.
:::

### 2-4. 글꼴 바꾸기

폰트는 **인터넷에서 불러오지 않고 프로젝트 안에 넣어서** 씁니다. (폐쇄망에서 깨지지 않게)

| 순서 | 하는 일 | 파일 |
|:---:|--------|------|
| 1 | 폰트 파일(`.woff2`)을 프로젝트에 넣기 | `src/assets/fonts/<폰트이름>/` |
| 2 | `@font-face` 로 등록 | `src/assets/styles/base/fonts.css` |
| 3 | 본문 글꼴 이름 연결 | `src/design-tokens/primitive/typography.json` 의 `--font-outfit` 값 |
| 4 | 확인 | `src/assets/styles/base/typography.css` 의 `body` 에 `font-outfit` 이 걸려 있음 |

:::danger 구글 폰트 링크(CDN)를 쓰면 안 됩니다
폐쇄망에서는 인터넷 연결이 안 되므로, **CDN으로 불러온 글꼴은 현장에서 전부 깨집니다.**
반드시 폰트 파일을 프로젝트 안에 넣어 주세요.
:::

### 2-5. 간격·그림자 등 나머지 토큰

간격 체계나 그림자까지 우리 것으로 바꿔야 한다면, **JSON 원본**을 고칩니다.

```sh
src/design-tokens/
├── primitive/
│   ├── color.json        색 팔레트 원본
│   ├── spacing.json      간격
│   ├── typography.json   글자 크기·글꼴
│   └── shadow.json       그림자
└── semantic/
    ├── light.json        라이트 모드 의미 색
    └── dark.json         다크 모드 의미 색
```

JSON 형식은 아래와 같습니다. **`$value` 안의 값만 바꾸면 됩니다.**

```json title="src/design-tokens/primitive/color.json"
{
  "color": {
    "brand": {
      "500": { "$value": "#465fff", "$type": "color" }
    }
  }
}
```

고친 뒤에는 **CSS로 변환**해야 반영됩니다.

```bash
npm run build:tokens     # JSON → CSS 변환
# 또는 개발 서버를 다시 띄우면 자동으로 실행됩니다
npm run dev
```

:::warning 고친 JSON은 반드시 커밋하세요 (변환된 CSS까지)
`npm run build` (운영 빌드)에는 **변환 과정이 들어 있지 않습니다.**
JSON만 커밋하고 변환된 CSS를 빼먹으면, **배포된 화면에는 예전 색이 그대로 나옵니다.**

→ `build:tokens` 실행 후 **`src/assets/styles/tokens/` 의 변경분까지 함께 커밋**하세요.
:::

### 2-6. 여기까지 했으면 확인

- [ ] 개발 서버에서 **버튼·링크 색**이 우리 브랜드 색인가
- [ ] **사이드바에서 선택된 메뉴**의 배경·글자색이 우리 색인가 (← 블록 2 확인)
- [ ] 입력창을 클릭했을 때 **포커스 테두리**가 우리 색인가
- [ ] **다크 모드로 전환**(헤더 오른쪽 토글)했을 때도 자연스러운가
- [ ] Storybook의 `Design Tokens` 에서 색 목록이 우리 팔레트로 보이는가

더 자세한 토큰 구조는 [디자인 토큰 만들기](../../documents/design-system/create-design-tokens.md) 문서를 참고하세요.




## 3단계 · 레이아웃 맞추기
---

> **목표**: 헤더·사이드바를 Figma 디자인에 맞춘다.
> **주의**: 이 단계는 **공통 개발자와 함께** 진행하세요. 화면 전체 구조에 영향을 줍니다.

### 3-1. 스타일만 바꾸면 되는 경우 (대부분)

구조는 그대로 두고 **색·크기·간격만** 다르다면, 아래 파일의 클래스만 고치면 됩니다.

```sh
src/shared/layouts/default/
├── RootLayoutContent.tsx    전체 배치 (사이드바 폭, 본문 여백)
├── components/
│   ├── AppHeader.tsx        상단 바 (로고·검색창·테마 토글)
│   ├── AppSidebar.tsx       왼쪽 메뉴 (로고·메뉴 목록)
│   ├── Backdrop.tsx         모바일에서 메뉴 열었을 때 뒤 어두운 막
│   ├── ThemeToggleButton.tsx  라이트/다크 전환 버튼
│   └── GithubLinkButton.tsx   (내부망에서는 보통 제거)
└── config/
    └── navigation.tsx       ★ 메뉴 항목 목록
```

**자주 바꾸는 값들**

| 무엇 | 어디 | 현재 값 |
|------|------|--------|
| 사이드바 펼친 폭 / 접은 폭 | `AppSidebar.tsx`, `RootLayoutContent.tsx` | `w-72.5` / `w-22.5` |
| 본문 최대 폭·여백 | `RootLayoutContent.tsx` | `max-w-(--breakpoint-2xl)`, `p-4 md:p-6` |
| 로고 이미지 | `AppHeader.tsx`, `AppSidebar.tsx` | `src/assets/images/logo/logo.svg`, `logo.png` |
| 메뉴 강조 스타일 | `assets/styles/layout/default/layout.css` | `menu-item-active` 등 |

:::warning 사이드바 폭은 두 파일을 같이 고쳐야 합니다
`AppSidebar.tsx` 는 **사이드바 자신의 폭**, `RootLayoutContent.tsx` 는 **본문을 밀어내는 여백(`lg:ml-72.5`)** 을 담당합니다.
**한쪽만 고치면 사이드바와 본문이 겹치거나 빈 공간이 생깁니다.**
:::

:::tip 메뉴 강조 스타일은 CSS에 모여 있습니다
선택된 메뉴 색 같은 것은 컴포넌트가 아니라 `assets/styles/layout/default/layout.css` 에 `menu-item-active` 같은 이름으로 정의되어 있습니다.
**메뉴 스타일은 여기를 먼저 찾아보세요.**
:::

### 3-2. 구조를 바꿔야 할 때 (폴더 복제)

사이드바가 없거나 배치가 완전히 다르다면, **기존 폴더를 복제해서 새로 만듭니다.**
원본(`default/`)은 그대로 두므로 **언제든 되돌릴 수 있습니다.**

```sh
src/shared/layouts/default/  →  src/shared/layouts/abc/     # 폴더 통째로 복사
src/assets/styles/layout/default/  →  .../layout/abc/       # 레이아웃 CSS도 함께
```

복제한 뒤 **아래 3곳만 바꾸면** 사이트 전체가 새 레이아웃으로 전환됩니다. (**공통 개발자 담당**)

| 순서 | 파일 | 바꾸는 내용 |
|:---:|------|-----------|
| 1 | `src/shared/layouts/index.ts` | `./default` → `./abc` |
| 2 | `src/assets/styles/app.css` | `./layout/default/layout.css` → `./layout/abc/layout.css` |
| 3 | `src/assets/styles/app.css` | `./themes/theme-default.css` → `./themes/theme-abc.css` |

:::info 복제한 폴더는 그 자체로 완성품입니다
`layouts/default/` 안에는 `components` · `config` · `context` · `hooks` · `providers` 가 **전부 들어 있습니다.**
폴더째 복사해도 다른 곳을 건드릴 필요가 없게 만들어져 있습니다.
:::

**본문이 들어오는 자리**는 아래처럼 `Outlet` 으로 표시되어 있습니다. 구조를 바꿔도 **이 부분은 반드시 남겨 두세요.**

```tsx title="src/shared/layouts/default/RootLayoutContent.tsx"
<div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-950">
	<AppSidebar />
	<div className="flex-1 ...">
		<AppHeader />
		<div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
			<Outlet />   {/* ← 각 화면이 여기에 들어옵니다. 지우면 안 됩니다 */}
		</div>
	</div>
</div>
```

### 3-3. 메뉴와 로고 교체

메뉴 항목은 **한 파일**에 모여 있습니다.

```tsx title="src/shared/layouts/default/config/navigation.tsx"
{
	name: 'UI Components',                    // 그룹 이름
	subItems: [
		{ name: 'Accordion', icon: <ListChevronsDownUp />, path: '/example/ui-components/accordion' },
	],
}
```

- 아이콘은 `lucide-react` 라이브러리에서 가져다 씁니다
- 실제 업무 메뉴 구성은 **공통 개발자·기획자와 함께** 정하세요
- 로고 이미지는 `src/assets/images/logo/` 안의 파일을 교체합니다

:::note 메뉴를 바꾸면 화면도 있어야 합니다
`path` 에 적은 주소에 **실제 화면이 없으면 눌러도 아무 일이 일어나지 않습니다.**
화면 연결(라우터 등록)은 개발자 몫이므로, **메뉴 구성을 정하면 개발자에게 목록을 전달**하세요.
:::




## 4단계 · 화면(컴포넌트) 만들기
---

> **목표**: Figma의 각 화면을 React 컴포넌트로 만든다.
> **작업 공간**: `src/publishing/`

### 4-1. `publishing` 폴더에서 시작하기

```sh
src/publishing/
└── example/                    ← 견본. 이 구조를 그대로 따라 만드세요
    ├── components/
    │   └── ExampleCard.tsx     화면 안에서 쓰는 조각
    ├── pages/
    │   └── ExamplePage.tsx     화면 전체
    └── router/
        └── index.tsx           브라우저에서 보기 위한 주소 등록
```

:::info 왜 별도 폴더에서 작업하나요?
개발자가 만드는 실제 업무 폴더(`domains/`)와 **섞이지 않게** 하기 위해서입니다.
퍼블리싱이 끝난 화면만 **골라서 옮기면(핸드오프)** 되므로 작업 중인 파일이 개발에 영향을 주지 않습니다.
:::

**만든 화면을 브라우저에서 보려면** 주소 등록이 필요합니다.

```tsx title="src/publishing/<이름>/router/index.tsx"
import loadable from '@loadable/component';
import type { TAppRoute } from '@/types/router';

const MyPage = loadable(() => import('@/publishing/<이름>/pages/MyPage'));

const routes: TAppRoute[] = [
	{ path: 'my-page', element: <MyPage />, name: '내 화면' },
];

export default routes;
```

그다음 **공통 개발자에게 연결을 요청**하면 (`src/shared/router/index.tsx`) 아래 주소로 볼 수 있습니다.

```sh
http://localhost:5173/#/publishing/example/example-page
```

:::note `publishing` 화면은 운영에 나가지 않습니다
`publishing/` 폴더의 화면은 **개발 모드에서만** 등록되고, **운영 빌드에서는 자동으로 빠집니다.**
그래서 작업 중인 화면이 실수로 사용자에게 보일 걱정은 하지 않아도 됩니다.
왼쪽 사이드바 메뉴에도 나오지 않으니 **주소를 직접 입력해서** 확인하세요.
:::

### 4-2. 마크업 규칙 4가지

```tsx title="src/publishing/example/components/ExampleCard.tsx (실제 코드)"
import { cn } from '@/shared/utils/cn';

export function ExampleCard({ title, badge, className }: ExampleCardProps) {
	return (
		<div className={cn('rounded-xl border p-5 shadow-theme-sm', 'bg-white dark:bg-gray-800', className)}>
			<h3 className="text-theme-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
		</div>
	);
}
```

| # | 규칙 | 이유 |
|:--:|------|------|
| 1 | **Tailwind 클래스로 스타일링** — 이 단계에서는 **CSS 파일을 만들지 않습니다** | CSS 파일은 핸드오프 후에 필요한 것만 만듭니다 |
| 2 | 클래스를 합칠 때는 **`cn()`** 을 씁니다 | 같은 속성이 겹칠 때 **뒤에 온 값이 이기도록** 정리해 줍니다 |
| 3 | 색은 **토큰 클래스**로 — `bg-brand-500`, `text-foreground`, `shadow-theme-md` | 나중에 브랜드 색이 바뀌어도 **화면을 안 고쳐도 됩니다** |
| 4 | 다크 모드는 **`dark:`** 를 붙여서 — `bg-white dark:bg-gray-800` | 라이트/다크를 한 줄에서 관리 |

**자주 쓰는 토큰 클래스**

| 종류 | 클래스 |
|------|-------|
| 브랜드 색 | `bg-brand-500` `text-brand-600` `border-brand-200` |
| 쓰임새 색 | `bg-background` `text-foreground` `bg-card` `border-border` `text-muted-foreground` |
| 그림자 | `shadow-theme-xs` `shadow-theme-sm` `shadow-theme-md` `shadow-theme-lg` `shadow-theme-xl` |
| 글자 크기 | `text-theme-xs` `text-theme-sm` `text-theme-xl` / 제목 `text-title-sm` ~ `text-title-2xl` |
| 상태 색 | `text-success-600` `bg-error-50` `border-warning-300` |

:::tip 전체 목록은 Storybook에서 보세요
`npm run storybook` → **`Getting Started` → `Design Tokens`**
쓸 수 있는 색·그림자·글자 크기가 **실제 모양과 함께** 정리되어 있습니다. 색상 코드를 직접 찾아 쓰지 마세요.
:::

### 4-3. 공통 컴포넌트 가져다 쓰기

버튼·입력창·모달 등은 **이미 만들어져 있습니다.** 한 곳에서 가져다 씁니다.

```tsx
import { Button, Card, Dialog, Input, Table } from '@axiom/components/ui';
```

:::warning 파일 경로로 직접 가져오지 마세요
`import { Button } from '@/shared/lib/shadcn/ui/button'` 처럼 쓰면 안 됩니다.
나중에 컴포넌트 위치가 바뀌면 **그렇게 쓴 화면만 전부 깨집니다.** 항상 `@axiom/components/ui` 에서 가져오세요.
:::

**어떤 컴포넌트가 있고 어떻게 쓰는지** 는 개발 서버의 예제 페이지에서 확인합니다.

> 개발 서버(5173) → 왼쪽 사이드바 **`UI Components`** → **34개 예제 페이지**

각 예제 페이지는 아래 순서로 되어 있습니다.

| 순서 | 내용 |
|:---:|------|
| 1 | **import & 기본 구조** — 복사해서 바로 쓸 수 있는 최소 코드 |
| 2 | **변형·상태별 예제** — 크기·색·비활성 등 |
| 3 | **CSS Module 재스타일 예제** — 완전히 다른 디자인으로 바꾼 실제 사례 (탭으로 `.tsx` / `.css` 원본 확인) |
| 4 | **Props 요약** — 넘길 수 있는 값 목록 |

오른쪽에 **바로가기 메뉴**가 떠서 원하는 섹션으로 이동할 수 있습니다.

### 4-4. 공통 컴포넌트 다시 칠하기

Figma 디자인이 기본 컴포넌트와 다르게 생겼을 때 쓰는 방법입니다. **원본 파일은 건드리지 않습니다.**

#### 방법 ① 공개 CSS 변수 (가장 쉬움)

컴포넌트가 **바깥에서 바꿀 수 있게 열어 둔 값**을 세팅하는 방식입니다. 내부 구조를 몰라도 됩니다.

```css title="MyAccordion.module.css"
.wrap {
	--accordion-icon-rotate: 0deg;        /* 열릴 때 아이콘 회전 각도 (기본 180deg) */
	--accordion-icon-duration: 250ms;     /* 아이콘 회전 속도 */
	--accordion-icon-size: 1.25rem;       /* 아이콘 크기 */
	--accordion-content-duration: 250ms;  /* 펼침/접힘 속도 */
}
```

:::note 현재 이 방식이 열려 있는 컴포넌트는 `Accordion` 뿐입니다
다른 컴포넌트는 아래 ② 방법을 쓰세요.
작업하다 "이 값도 열어 주면 좋겠다" 싶은 게 생기면 **공통 개발자에게 요청**하면 됩니다.
:::

#### 방법 ② `data-slot` 오버라이드 (대부분의 경우)

공통 컴포넌트는 내부 요소마다 `data-slot` 이라는 표식을 달고 있습니다. **그 표식을 골라 스타일을 덮어씁니다.**

```css title="MyAccordion.module.css"
/* 래퍼(.wrap) 아래에서 슬롯을 고릅니다 */
.wrap [data-slot='accordion-item'] {
	border: 1px solid #cfe7e5;
	border-radius: 12px;
}

.wrap [data-slot='accordion-trigger'] {
	padding: 16px 20px;
	font-weight: 700;
	color: #1b2b2a;
}

/* 다크 모드 */
:global(.dark) .wrap [data-slot='accordion-trigger'] {
	color: #e4e7ec;
}
```

:::tip 스타일이 안 먹으면 한 겹 더 감싸세요
Tailwind 기본 스타일과 겨루기 때문에, `[data-slot="..."]` 만 쓰면 밀릴 수 있습니다.
**래퍼 클래스 + 슬롯을 2~3단계로 겹쳐서** 우선순위를 높이세요. (`!important` 보다 이 방법이 안전합니다)
:::

:::info 실제 사례를 먼저 보세요
아래 24개 컴포넌트에는 **이미 재스타일 예제가 들어 있습니다.** 새로 쓰지 말고 **복사해서 시작**하세요.

accordion · alert · avatar · breadcrumb · card · dialog · drawer · dropdown-menu · input · input-group ·
native-select · pagination · progress · radiogroup · select · skeleton · slider · spinner · switch · tabs ·
textarea · toast · toggle · tooltip

위치: `src/domains/example/components/ui-components/<컴포넌트>/*.module.css`
대표 예시(주석이 가장 자세함): `accordion/TransactionDetailAccordion.module.css`
:::

### 4-5. CSS 파일은 언제 만드나요?

| 시점 | 방식 |
|------|------|
| **퍼블리싱 중** (`publishing/`) | Tailwind 클래스만 사용 — **CSS 파일 만들지 않음** |
| **핸드오프 이후** (`domains/`, `shared/`) | 복잡한 스타일은 `*.module.css` 로 분리 |

CSS Module을 만들 때는 **"쓰는 파일 바로 옆에, 같은 이름으로"** 두는 것이 규칙입니다.

```sh
components/MyAccordion.tsx
components/MyAccordion.module.css     ← 같은 폴더, 같은 이름
```

자세한 규칙은 [컴포넌트 전용 스타일 만들기](../../documents/dev/create-module-css.md) 문서를 참고하세요.




## 5단계 · 검수와 핸드오프
---

### 5-1. 검수 체크리스트

**색·토큰**

- [ ] 화면에 **색상 코드(`#1a2b3c`)를 직접 적은 곳이 없는가** — 토큰 클래스로 바꿨는지 확인
- [ ] 브랜드 색을 바꿨을 때 **모든 화면이 같이 바뀌는가**

**다크 모드**

- [ ] 헤더 오른쪽 토글로 **라이트/다크를 모두 확인**했는가
- [ ] CSS Module에 직접 적은 색은 **`:global(.dark)` 블록도 작성**했는가
- [ ] 다크 모드에서 **글자가 배경에 묻히지 않는가**

**반응형·동작**

- [ ] 모바일 폭에서 **사이드바가 열리고 닫히는가**
- [ ] 화면 안 이동 링크에 **`<a href="#아이디">` 를 쓰지 않았는가** (아래 주의 참고)

:::danger 앵커 링크 주의 — 화면이 통째로 날아갑니다
이 프로젝트는 주소에 `#` 이 붙는 방식(HashRouter)을 씁니다.
그래서 화면 안 이동용으로 `<a href="#section">` 을 쓰면 **주소 체계와 충돌해 화면이 사라집니다.**

대신 이렇게 처리하세요.

```tsx
<button onClick={() => document.getElementById('section')?.scrollIntoView({ behavior: 'smooth' })}>
	이동
</button>
```
:::

### 5-2. 핸드오프 (개발자에게 넘기기)

작업이 끝난 화면을 **개발자와 함께** 실제 위치로 옮깁니다.

| `publishing/` 안의 위치 | 옮겨 갈 곳 |
|----------------------|-----------|
| `pages/` (화면 전체) | `src/domains/<업무이름>/pages/` |
| `components/` (여러 화면이 쓰는 조각) | `src/shared/` |
| `components/` (한 업무에서만 쓰는 조각) | `src/domains/<업무이름>/components/` |

옮길 때 함께 정리할 것

- [ ] 미뤄 뒀던 **CSS Module 분리** (필요한 것만)
- [ ] `publishing/` 에 남은 **임시 라우터 정리**
- [ ] 개발자에게 **어떤 값이 바뀌는 부분인지** 설명 (버튼 문구, 목록 개수 등)

:::tip 핸드오프는 한 번에 몰아서 하지 마세요
화면 하나가 끝날 때마다 조금씩 넘기는 편이 좋습니다.
몰아서 넘기면 **충돌이 한꺼번에 터지고**, 개발자도 검토할 양이 많아집니다.
:::




## 자주 막히는 것
---

### 색을 바꿨는데 화면이 그대로예요

순서대로 확인하세요.

1. **`tokens/` 폴더의 CSS를 직접 고치지 않았나요?** → 그 파일은 자동 생성이라 다시 만들어지면 지워집니다. **JSON이나 테마 파일**을 고쳐야 합니다.
2. **JSON을 고쳤다면 변환했나요?** → `npm run build:tokens` 또는 개발 서버 재시작
3. **테마 파일이 `app.css` 에 연결됐나요?** → `@import './themes/theme-abc.css';` 주석이 풀려 있는지 확인 (공통 개발자에게 요청)
4. **테마 import가 토큰 import보다 아래에 있나요?** → 위에 있으면 기본값이 우리 값을 덮어씁니다

### 사이드바 메뉴 강조색만 안 바뀌어요

테마 파일의 **`@theme` 블록(브랜드 팔레트)** 을 안 채운 경우입니다.
메뉴 강조·포커스 링은 `--primary` 가 아니라 **`brand-*` 를 직접** 씁니다. → [2-3 블록 2](#블록-2--theme--브랜드-색-팔레트-가장-중요)

### `dark:` 를 붙였는데 다크 모드에서 안 바뀌어요

`@custom-variant dark (&:is(.dark *));` 는 **`app.css` 맨 아래에 직접** 있어야 합니다.
다른 파일로 옮기면 `dark:` 클래스 자체가 만들어지지 않습니다. (건드리지 마세요)

### CSS Module에서 다크 모드가 안 먹어요

`.dark .클래스` 가 아니라 **`:global(.dark) .클래스`** 로 써야 합니다.
CSS Module은 클래스 이름을 자동으로 바꾸기 때문에, `dark` 처럼 **바깥에서 오는 이름은 `:global()` 로 감싸야** 합니다.

```css
/* ❌ 안 됨 */ .dark .card { background: #1a2231; }
/* ✅ 됨   */ :global(.dark) .card { background: #1a2231; }
```

### 클래스를 넣었는데 기본 스타일이 이겨요

- Tailwind 클래스끼리 겹친 경우 → **`cn()`** 으로 합치세요. 뒤에 온 값이 이기도록 정리해 줍니다.
- CSS Module로 덮어쓰는 경우 → **래퍼 + 슬롯을 2~3단계로** 겹쳐 우선순위를 높이세요.
- `!important` 는 마지막 수단입니다. 나중에 다른 사람이 스타일을 못 바꾸게 됩니다.

### 이미지·아이콘이 안 보여요

- 이미지는 **`src/assets/images/`** 안에 넣고 `import` 해서 씁니다
- 아이콘은 **`lucide-react`** 에서 가져옵니다
- **외부 주소(CDN)로 불러오면 폐쇄망에서 전부 깨집니다**




## 하지 말아야 할 것
---

| 하지 말 것 | 대신 이렇게 |
|----------|-----------|
| `assets/styles/tokens/*.css` 직접 편집 | JSON 원본 수정 후 `npm run build:tokens` |
| 색상 코드 하드코딩 (`#1a2b3c`) | 토큰 클래스 (`bg-brand-500`, `text-foreground`) |
| `--primary` 만 바꾸고 `brand-*` 방치 | 테마 파일의 **@theme 블록도 같이** 채우기 |
| `publishing/` 에서 CSS 파일 만들기 | Tailwind 클래스 + `cn()` |
| `src/shared/ui/` 의 공통 컴포넌트 파일 수정 | `data-slot` 오버라이드 또는 공개 CSS 변수 |
| 구글 폰트·CDN 이미지 사용 | `src/assets/` 에 파일을 넣고 셀프 호스팅 |
| `<a href="#아이디">` 로 화면 안 이동 | `scrollIntoView()` 사용 |
| `.env`, `src/config/`, `src/core/` 수정 | **공통 개발자에게 요청** |

:::tip 마무리
막히면 혼자 우회하지 말고 **공통 개발자에게 물어보세요.**
구조를 바꿔야 하는 상황(레이아웃 교체, 새 CSS 변수 요청, 컴포넌트 신규 제작)은 **함께 결정하는 것이 원칙**입니다.

Scaffold는 "정해진 대로만 써야 하는 틀"이 아니라 **"기본값이 이미 채워져 있는 출발점"** 입니다.
디자인이 요구하면 바꿔도 됩니다. 다만 **바꾼 이유와 범위를 공유**해 주세요.
:::
