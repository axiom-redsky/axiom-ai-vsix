---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "컴포넌트 전용 스타일(css) 만들기"
---


# 컴포넌트 전용 스타일(css) 만들기

**react-app-scaffold** 프로젝트의 기본 스타일링은 **Tailwind 유틸리티 클래스**입니다. 그러나 특정 화면/컴포넌트에만 적용되는 **복잡하거나 독립적인 디자인**이 필요한 경우, 별도의 **CSS Module**(`*.module.css`) 파일로 분리해서 작업할 수 있습니다. 이 문서는 **CSS Module 파일을 어디에, 어떤 이름으로 만들지**에 대한 규칙을 설명합니다.

:::info 작업 내용
* **Tailwind 인라인**으로 충분한 경우와 별도 **CSS Module**이 필요한 경우를 구분합니다.
* CSS Module 파일을 **어느 폴더**에, **어떤 파일명**으로 생성하는지 규칙을 설명합니다.
* 상황별(컴포넌트 전용 / 페이지 전용 / 도메인 공용) 배치 방법을 설명합니다.
* **다크 모드** 대응 방법을 설명합니다.
:::



## 핵심 원칙
---

:::tip 딱 한 줄로 기억하기
> **파일명 = 소비 주체의 이름, 위치 = 소비 주체 파일 바로 옆(co-location).**
:::

* `*.module.css`는 클래스명이 **로컬 스코프**로 처리되어 **특정 컴포넌트(또는 페이지) 하나에만** 묶이는 스타일입니다.
* 그러므로 그 스타일을 실제로 `import` 하는 파일 **바로 옆**에 두고, 파일명도 **소비하는 컴포넌트/페이지와 동일하게** 맞춥니다.
* 이렇게 하면 파일명만 보고도 "이 스타일을 누가 쓰는가"를 알 수 있고, 컴포넌트를 옮기거나 삭제할 때 스타일도 함께 관리됩니다.

:::danger 소비 주체와 스타일 위치가 어긋나면 안 됩니다
* 예를 들어 `components/`에 있는 컴포넌트가 `pages/`에 있는 css를 `import` 하면, **소비자(component)와 스타일 소유주(pages)가 어긋나는 역의존**이 발생합니다.
* 스타일은 **항상 그것을 쓰는 파일과 같은 폴더**에 두어 이런 어긋남을 만들지 않습니다.
:::



## 어떤 방식으로 스타일을 줄지 판단하기
---

스타일이 필요할 때 아래 순서로 판단합니다.

```sh
스타일이 필요하다
  │
  ├─ 사소한가?                 → Tailwind 유틸리티 인라인 (CASE 1) · 파일 안 만듦
  │
  ├─ 떼어낼 수 있는 UI 조각인가? → 컴포넌트로 추출 + 컴포넌트 옆 CSS Module (CASE 2)
  │
  ├─ 순수 그 페이지 전용인가?    → 페이지 옆 CSS Module (CASE 3)
  │
  └─ 여러 곳이 공유하는가?       → 도메인 공용 스타일 폴더 (CASE 4)
```

| 상황 | 위치 | 파일명 기준 |
| --- | --- | --- |
| **CASE 1** 사소한 스타일 | (파일 없음) | Tailwind `className` 인라인 |
| **CASE 2** 컴포넌트 전용 (권장 기본) | `components/` 컴포넌트 파일 옆 | **컴포넌트 이름**과 동일 |
| **CASE 3** 페이지 전용 | `pages/` 페이지 파일 옆 | **페이지 이름**과 동일 |
| **CASE 4** 도메인 공용 | `domains/<domain>/common/styles/` | 용도에 맞는 이름 |

:::info 전역 스타일은 이 규칙 대상이 아닙니다
* 앱 전체에 적용되는 **토큰 · 테마 · reset** 등의 전역 스타일은 기존대로 `src/assets/styles/`에 둡니다.
* 이 문서의 규칙은 **특정 컴포넌트/페이지/도메인에 한정된 스타일**에만 해당합니다.
:::



## CASE 1 : 사소한 스타일 — Tailwind 인라인
---

* 여백, 정렬, 색상 한두 줄 수준의 사소한 스타일은 **별도 파일을 만들지 않고** Tailwind 유틸리티 클래스를 `className`에 직접 작성합니다.
* 이 프로젝트의 **기본값**이며, 대부분의 스타일은 여기서 끝납니다.
```tsx showLineNumbers
export default function AccountCard(): React.ReactNode {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">계좌 요약</p>
    </div>
  );
}
```

:::tip 언제 CSS Module로 넘어가나요?
* 아래처럼 **Tailwind로 감당하기 번거로운** 스타일이 필요할 때 CASE 2 / 3으로 넘어갑니다.
  - 복잡한 선택자, `@keyframes` 애니메이션
  - 컴포넌트 전체를 아우르는 **독립적인 디자인 시스템**(색 팔레트, 전용 톤앤매너)
  - `:global(.dark)` 등을 활용한 세밀한 다크 모드 처리
:::



## CASE 2 : 컴포넌트 전용 CSS Module (기본)(권장)
---

* 화면의 한 덩어리를 **컴포넌트로 추출**하고, 그 컴포넌트에만 적용되는 스타일을 **컴포넌트 파일 바로 옆**에 CSS Module로 둡니다.
* 파일명은 **컴포넌트 이름과 동일**하게 만듭니다.
* 개발해야 할 업무가 **"계좌(account)"** 이고, `TransactionDetailAccordion` 이라는 전용 디자인의 컴포넌트를 만든다고 가정합니다.
```sh
src
  ├─ ...
  ├─ domains
  │  ├─ account
  │  │  ├─ components
  │  │  │  └─ ui-components
  // highlight-start
  │  │  │     ├─ TransactionDetailAccordion.tsx        # 컴포넌트
  │  │  │     └─ TransactionDetailAccordion.module.css # 전용 스타일(같은 이름 · 같은 폴더)
  // highlight-end
  │  │  └─ pages
  │  │     └─ ui-components
  │  │        └─ AccordionPage.tsx                     # 컴포넌트를 렌더만 함(스타일 없음)
  │  └─ ...
```
:::info 설명
* 스타일 파일명(`TransactionDetailAccordion.module.css`)은 **소비 컴포넌트 이름과 동일**합니다.
* 스타일 파일은 컴포넌트 파일과 **같은 폴더**에 있습니다. → `import`가 `./`로 간결해지고, 소비자와 소유주가 일치합니다.
* 페이지(`AccordionPage.tsx`)는 컴포넌트를 렌더만 할 뿐, **스타일 파일을 갖지 않습니다.**
:::

### `TransactionDetailAccordion.module.css` 작성
* 클래스명은 소문자 카멜케이스로 작성하며, 이 파일 안에서만 유효한 **로컬 스코프**입니다.
```css showLineNumbers
/* 이 컴포넌트 전용 스타일. 클래스명은 로컬 스코프로 처리된다. */
.wrap {
  --brand: #008485;
  color: #1b2b2a;
}

.card {
  border: 1px solid #e4ecec;
  border-radius: 16px;
  overflow: hidden;
}

.title {
  font-size: 14px;
  font-weight: 700;
  color: var(--brand);
}
```

### 컴포넌트에서 사용
* 스타일을 `styles` 라는 이름으로 `import` 하고, `className={styles.클래스명}` 형태로 사용합니다.
```tsx showLineNumbers
import styles from './TransactionDetailAccordion.module.css';

export default function TransactionDetailAccordion(): React.ReactNode {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.title}>거래내역 상세</p>
      </div>
    </div>
  );
}
```
:::tip 클래스 여러 개를 조합할 때
* 조건부/다중 클래스는 템플릿 리터럴로 합칩니다.
```tsx
<div className={`${styles.card} ${isOpen ? styles.cardOpen : ''}`} />
```
:::



## CASE 3 : 페이지 전용 CSS Module
---

* 재사용 컴포넌트로 뺄 성질이 아니라 **그 페이지 자체의 레이아웃**에만 해당하는 스타일이라면, **페이지 파일 바로 옆**에 CSS Module을 둡니다.
* 파일명은 **페이지 이름과 동일**하게 만듭니다. (컴포넌트명이 아니라 **페이지명** 기준)
```sh
src
  ├─ ...
  ├─ domains
  │  ├─ account
  │  │  └─ pages
  │  │     └─ ui-components
  // highlight-start
  │  │        ├─ AccordionPage.tsx          # 페이지
  │  │        └─ AccordionPage.module.css   # 이 페이지 전용 스타일(같은 이름 · 같은 폴더)
  // highlight-end
  │  └─ ...
```
:::info 이 경우는 `pages/`에 css가 있어도 정당합니다
* CASE 2의 역의존과 달리, 여기서는 **소비자(page) = 소유주(page)** 로 일치합니다.
* 즉 "이 스타일은 이 페이지가 소유한 스타일" 이라는 의미가 파일 배치로 명확히 드러나므로 문제가 없습니다.
* 파일명을 **페이지명과 동일**하게 두는 것이 핵심입니다.
:::

:::tip 먼저 컴포넌트로 뺄 수 있는지 검토하세요
* 페이지에 스타일이 붙고 싶어진다는 건 보통 **떼어낼 만한 UI 조각**이 있다는 신호입니다.
* 가능하면 CASE 2(컴포넌트 추출)를 우선 고려하고, **순수 페이지 레이아웃 스타일일 때만** CASE 3을 사용합니다.
:::



## CASE 4 : 도메인 공용 스타일
---

* 하나의 컴포넌트가 아니라 **한 도메인 안 여러 컴포넌트가 공유**하는 스타일(공용 CSS 변수, 공통 클래스, 도메인 테마 등)은 도메인 내부의 **`common/styles/`** 폴더에 모읍니다.
```sh
src
  ├─ ...
  ├─ domains
  │  ├─ account
  │  │  └─ common
  // highlight-start
  │  │     ├─ utils          # 도메인 공용 함수 (기존)
  │  │     └─ styles         # 도메인 공용 스타일 (신규)
  │  │        └─ account-theme.css
  // highlight-end
  │  └─ ...
```
:::info 설명
* 도메인 공용 함수를 `common/`에 두는 것과 동일한 개념으로, **공용 스타일도 `common/styles/`** 에 둡니다.
* 도메인 공용 함수에 대한 내용은 [각 업무 공통함수 만들기](./create-domain-common-function) 문서를 참조하세요.
:::

:::danger 도메인 최상위에 별도 `style/` 폴더를 신설하지 않습니다
* `api`, `store`, `types` 처럼 도메인 최상위에 `style/` 폴더를 두고 싶을 수 있으나 권장하지 않습니다.
* `store`/`types`는 **여러 컴포넌트가 공유(N:1)** 하는 자원이라 밖으로 빼는 것이 이득이지만, **CSS Module은 컴포넌트 한 개에 묶이는(1:1)** 스타일이므로 성격이 정반대입니다.
* 공용 스타일은 이미 존재하는 **`common/`** 개념 아래 `common/styles/`로 두는 것이 구조상 일관됩니다.
:::



## 다크 모드 대응
---

* 이 프로젝트의 다크 모드는 최상위 요소에 **`.dark` 클래스**가 붙는 방식입니다. (Tailwind `dark:` variant도 `&:is(.dark *)` 기준으로 동작)
* CSS Module에서는 전역 클래스인 `.dark`를 `:global(...)`로 감싸서 다크 모드 스타일을 작성합니다.
```css showLineNumbers
.wrap {
  --brand: #008485;   /* 라이트 모드 값 */
  --ink: #1b2b2a;
  color: var(--ink);
}

/* .dark 는 전역 클래스이므로 :global()로 감싼다 */
// highlight-start
:global(.dark) .wrap {
  --brand: #38b2a7;   /* 다크 모드 값으로 덮어쓰기 */
  --ink: #e8f1f0;
}
// highlight-end
```
:::info 설명
* `.wrap`, `.card` 같은 클래스는 **로컬 스코프**(이 파일 전용)이고, `.dark`는 **전역 스코프**이므로 `:global()`로 감싸야 합니다.
* CSS 변수(`--brand` 등)를 `.wrap`에 정의해 두고 `:global(.dark) .wrap`에서 값만 덮어쓰면, 하위 규칙은 그대로 두고 색만 다크 모드로 전환되어 관리가 편합니다.
:::



## 정리
---

:star: 이 문서의 규칙을 요약하면 다음과 같습니다.

* **파일명 = 소비 주체 이름 / 위치 = 소비 주체 옆** 이라는 한 가지 원칙에서 모든 케이스가 파생됩니다.
* 사소한 스타일은 **Tailwind 인라인**(CASE 1)으로 처리하고 파일을 만들지 않습니다.
* 컴포넌트 전용 스타일은 **컴포넌트 옆**에, **컴포넌트명과 동일**하게 둡니다. (CASE 2, 권장 기본)
* 페이지 전용 스타일은 **페이지 옆**에, **페이지명과 동일**하게 둡니다. (CASE 3)
* 도메인 공용 스타일은 **`common/styles/`** 에 모읍니다. (CASE 4)
* 다크 모드는 CSS Module에서 **`:global(.dark) .클래스`** 로 처리합니다.

:::info 관련 문서
* 페이지/컴포넌트를 만드는 방법은 [업무(domain) 페이지 만들기](./create-biz-pages) 문서를 참조하세요.
* 도메인 공용 함수를 만드는 방법은 [각 업무 공통함수 만들기](./create-domain-common-function) 문서를 참조하세요.
:::
