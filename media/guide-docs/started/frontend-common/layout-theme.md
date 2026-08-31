---
sidebar_position: 1
displayed_sidebar: 'startDocSidebar'
title: '4. 레이아웃·테마·스타일'
---

# 레이아웃·테마·스타일 기반 작업(퍼블리셔와 함께)






## 4단계
---

> **목표**: 우리 사이트의 겉모습(색·레이아웃·메뉴)을 만든다.  
> **역할 분담**: **색상 값은 퍼블리셔**, **연결·구조·빌드는 프론트엔드 공통 개발자**

:::info 퍼블리셔와 이렇게 나눠서 일합니다
- **퍼블리셔** : 색상 테마 파일을 만들고 값을 채웁니다 → [퍼블리셔 가이드](../publishing-guide/index.md)
- **공통 개발자(나)** : 그 파일을 프로젝트에 **연결하고**, 메뉴를 바꾸고, 빌드가 되게 합니다
:::

### 4-1. 레이아웃·테마 교체는 3곳만 바꾸면 됩니다

* 새 사이트는 **레이아웃 및 테마**가 사이트 고유의 형태로 구성됩니다. 따라서 기본(`default`) 레이아웃 외에 사이트에 맞는 레이아웃·테마를 구성해야합니다.
* 이 작업은 **퍼블리셔**와 함께 긴밀하게 협력해서 작업해야 합니다.



| 순서 | 파일 | 바꾸는 내용 |
|:---:|------|-----------|
| 1 | `src/shared/layouts/index.ts` | `./default` → `./<새이름>` (레이아웃 컴포넌트) <br /> * 현재 Scaffold의 기본 레이아웃은 `src/shared/layouts/default`를 사용하고 있습니다. 이 것을 새로운 레이아웃으로 변경하기 위하여 `src/shared/layouts/<새이름>` 을 만들어서 연결합니다. `src/shared/layouts/default`의 내용을 그대로 복사해서 만드는게 훨씬 편리합니다.|
| 2 | `src/assets/styles/app.css` | `./themes/theme-default.css` → `./themes/theme-<새이름>.css` (색상 테마) <br />* 현재 기본 테마는 `theme-default.css` css 파일로 연결되어 있습니다. 이것을 `theme-<새이름>.css` 형태로 새 css파일을 만들고 새로운 테마를 만들어 연결합니다. |
| 3 | `src/assets/styles/app.css` | `./layout/default/layout.css` → `./layout/<새이름>/layout.css` (레이아웃 CSS) <br />* 현재 레이아웃 스타일(css)은 `./layout/default/layout.css`로 연결되어있습니다. 이것을 새로운 레이아웃 스타일(`./layout/<새이름>/layout.css`)파일을 만들어서 연결합니다. |


* 실제 변경 코드 부분-----------------------------

```ts title="src/shared/layouts/index.ts"
// ★ 활성 레이아웃 선택 지점 (이 부분을 새로 만든 레이아웃으로 변경합니다.)
export { default as RootLayout } from './default';
```

```css title="src/assets/styles/app.css (퍼블리셔 수정 구간)"
/* 4. Theme — 색상 테마 스위치 지점 (이 부분을 새로만든 테마 css파일로 교체합니다) */
@import './themes/theme-default.css';
/* @import './themes/theme-[project].css'; ← 투입 시 주석 해제 */

/* 5. Layout — 레이아웃 CSS 스위치 지점 (새로만든 레이아웃 스타일 파일로 교체합니다) */
@import './layout/default/layout.css';
```

:::tip 복사한 레이아웃 폴더는 그 자체로 완성품입니다
`layouts/default/` 안에는 `components` · `config` · `context` · `hooks` · `providers` 가 모두 들어 있습니다.
폴더째 복사해도 다른 곳을 건드릴 필요가 없게 만들어져 있습니다. 따라서 복사해서 필요한 부분만 수정하면서 적용해도 충분히 가치가 있습니다.
:::

### 4-2. 디자인 토큰 흐름 이해하기
* Scaffold는 토큰 시스템이 내장되어있습니다. 
* 다음과 같은 흐름으로 최종 토큰 css파일이 생성되며, 생성된 css는 직접 변경하지 않습니다.

```sh
src/design-tokens/primitive/*.json    (색·간격·글자·그림자 원본)
src/design-tokens/semantic/light.json, dark.json
        │
        │  npm run build:tokens
        ▼
src/assets/styles/tokens/primitive.css, theme-light.css, theme-dark.css   ← 자동 생성
```

:::danger 생성된 CSS 파일은 직접 고치지 마세요
`assets/styles/tokens/` 안의 CSS는 **자동으로 만들어지는 파일**입니다.
직접 고쳐도 다음에 `build:tokens` 를 돌리면 **전부 지워집니다.**
값은 반드시 `design-tokens/` 의 **JSON을 고치고 다시 변환**하세요.
:::

### 4-3. 메뉴(내비게이션) 바꾸기

* 메뉴는 `src/shared/layouts/default/config/navigation.tsx` 한 곳에서 관리합니다. 만약 레이아웃 폴더를 교체 했다면 `src/shared/layouts/<새폴더>/config/navigation.tsx` 가 됩니다.
* 현재는 Scaffold 예제용 메뉴(Dev Examples / UI Components / API Examples / Utils / Store)가 들어 있으므로 **실제 업무 메뉴로 교체**하세요.



### 4-4. 다크 모드 정책 정하기

- 다크 모드는 `<html>` 에 `dark` 클래스를 붙이는 방식입니다.
- 사용자의 선택은 `VITE_THEME_STORAGE_KEY` 라는 이름으로 브라우저에 저장됩니다.
- `index.html` 안에 스크립트가 **화면이 그려지기 전에** 이 값을 먼저 읽습니다. → 새로고침할 때 **흰 화면이 번쩍이는 현상(FOUC)을 막아 줍니다.**
- 이 스크립트와 앱이 **같은 키를 쓰기 때문에**, 키 이름을 바꾸면 양쪽이 자동으로 함께 바뀝니다.

퍼블리셔에게는 아래 두 가지 규칙을 꼭 전달하세요.

```css
/* CSS Module 에서 다크 모드 스타일 쓰는 법 */
:global(.dark) .클래스이름 { ... }
```

```css
/* app.css 에 선언된 다크 변형 (Tailwind의 dark: 유틸이 이 규칙으로 동작) */
@custom-variant dark (&:is(.dark *));
```

### 4-5. 퍼블리셔에게 전달할 것

- [ ] [퍼블리셔 가이드](../publishing-guide/index.md) 링크 (반입한 가이드 사이트 주소와 함께)
- [ ] UI 컴포넌트 예제 페이지 (개발 모드 사이드바에서 확인 가능)
- [ ] 토큰 참조표 — `npm run storybook` 으로 띄운 뒤 `DesignTokens` 문서 확인 (인터넷 없이 현장에서 바로 실행됩니다)
- [ ] 위 4-4의 다크 모드 규칙
