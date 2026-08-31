---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Spinner"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Spinner 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-spinner--docs"
  title="Spinner 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Spinner 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 스피너 컴포넌트입니다.  
**작업이 진행 중임을 알리는 회전 인디케이터**로, 데이터 로딩·저장 등 잠깐의 대기 상태를 표현할 때 씁니다.

**언제 쓰나요?**

* 저장·제출 버튼을 눌러 **응답을 기다리는 동안** 버튼 안에서 도는 인디케이터
* 목록·상세를 **다시 불러오는 동안** 해당 영역을 덮는 로딩 오버레이
* "결제 정보를 확인하는 중…"처럼 **문구 옆에 나란히** 두는 인라인 로딩

> 진행률(%)을 알 수 있다면 스피너보다 **Progress**(막대)가 낫습니다. 스피너는 **끝나는 시점을 알 수 없는 짧은 대기**에 씁니다. 페이지 대부분이 비는 큰 로딩이라면 스켈레톤(자리표시자)을 함께 고려하세요.

:::note 먼저 알아둘 것 — 아주 얇은 컴포넌트입니다
Spinner는 lucide의 `Loader2Icon`에 `size-4 animate-spin`만 얹은 **SVG 한 줄짜리 컴포넌트**입니다. 색은 `currentColor`(글자색)를, 크기는 `size-*`를 따르므로 **대부분의 변경은 `className` 만으로 끝납니다.** 회전 속도나 완전히 다른 톤이 필요할 때만 CSS를 씁니다(아래 [스타일링 & 테마](#스타일링--테마) 참고).
:::

---


## Import
---

```tsx
import { Spinner } from '@axiom/components/ui';
```

Spinner는 **단일 컴포넌트**입니다. Accordion처럼 여러 파트를 조합하지 않습니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/spinner.tsx`(lucide `Loader2Icon` 기반)이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---


## 기본 사용법
---

props 없이 그대로 쓰면 **16px(`size-4`) 크기로 글자색(`currentColor`)을 따라 회전**합니다.

---
<img src="../assets/ui/basic-spinner.gif" alt="spinner 기본 사용 예시" width="10%" />
```tsx
import { Spinner } from '@axiom/components/ui';

// 그대로 두면 size-4(16px), 글자색(currentColor)으로 회전한다
<Spinner />

// 색·크기는 className 으로 조절
<Spinner className="size-6 text-sky-500" />
```

:::tip 대부분은 `className`으로 끝납니다
공용 Spinner는 내부적으로 `cn("size-4 animate-spin", className)` 구조라, 넘긴 `className`이 기본값을 덮어씁니다. 색(`text-*`)·크기(`size-*`)는 여기서 끝나며, 사소한 변경에 `*.module.css`를 만들 필요가 없습니다.
:::

---


## 크기 — `size-*` 유틸리티
---

Tailwind의 `size-*`(또는 `w-* h-*`) 클래스로 지름을 조절합니다. 기본은 `size-4`(16px)입니다.

---
<img src="../assets/ui/spinner-size.png" alt="spinner 사이즈 예제" width="70%" />
```tsx
<Spinner className="size-4" />   {/* 16px (기본) */}
<Spinner className="size-6" />   {/* 24px */}
<Spinner className="size-8" />   {/* 32px */}
<Spinner className="size-12" />  {/* 48px */}
```

---


## 색상 — `text-*` (currentColor 상속)
---

Spinner는 `currentColor`로 그려지므로, `text-*` 색상 클래스로 색을 바꿉니다. 색을 따로 지정하지 않으면 **부모의 글자색을 그대로 물려받습니다.**

---
<img src="../assets/ui/spinner-color.png" alt="spinner 컬러 예제" width="70%" />
```tsx
<Spinner className="size-6 text-sky-500" />
<Spinner className="size-6 text-emerald-500" />
<Spinner className="size-6 text-amber-500" />
<Spinner className="size-6 text-rose-500" />
<Spinner className="size-6 text-gray-400" />
```

---


## 동작 옵션 — `icon` · `spin` · `children`
---

기본 회전 외에 **모양·회전 여부·내용물**을 바꾸는 3개의 prop이 있습니다. 셋 다 생략하면 기존 `Loader2` 회전 그대로이며, 모두 **하위호환**으로 추가되었습니다.

| prop | 무엇을 바꾸나 | 렌더 결과 |
| --- | --- | --- |
| `icon` | 회전시킬 **아이콘(SVG 컴포넌트)** 교체 | `<svg>` |
| `spin` | **회전 on/off**(기본 `true`) | 그대로 |
| `children` | `<img>` 같은 **임의 콘텐츠** 삽입 | `<span>` 래퍼 |


### 1. 아이콘 교체 — `icon`

`icon`에 lucide 아이콘이나 같은 시그니처(`svg` props를 받는)의 커스텀 SVG 컴포넌트를 넘겨 **"모양"만** 바꿉니다. 회전(`animate-spin`)·크기(`size-*`)·색(`currentColor`)·접근성(`role`/`aria`)은 그대로 Spinner가 담당합니다.

```tsx
import { Spinner } from '@axiom/components/ui';
import { LoaderCircle, RefreshCw, RotateCw } from 'lucide-react';

<Spinner className="size-6" />                    {/* 기본 Loader2 */}
<Spinner icon={LoaderCircle} className="size-6" />
<Spinner icon={RefreshCw}   className="size-6" />
<Spinner icon={RotateCw}    className="size-6" />
```

:::caution `icon`은 SVG 컴포넌트 전용입니다
`icon`은 **컴포넌트**(`React.ComponentType`)를 받습니다. `<img>` 같은 **실제 이미지 파일(GIF·PNG 등)** 은 `icon`이 아니라 아래 `children`으로 넣습니다.
:::


### 2. 회전 on/off — `spin`

기본값은 `true`입니다. 이미 스스로 움직이는 이미지(GIF·APNG·애니메이션 SVG)를 넣을 때 `spin={false}`로 꺼서 **이중 회전을 막습니다.**

```tsx
<Spinner icon={BrandMarkIcon} className="size-8" />              {/* 회전 */}
<Spinner icon={BrandMarkIcon} spin={false} className="size-8" /> {/* 정지 */}
```


### 3. 임의 콘텐츠 — `children`

`<img>` 등 SVG가 아닌 콘텐츠를 직접 넣을 때 씁니다. 이때 Spinner는 `<span>` 래퍼로 감싸 **회전·크기·접근성만** 담당하고, 그림은 넘긴 콘텐츠를 그대로 씁니다.

---
<img src="../assets/ui/children-logo-spin.gif" alt="spinner 임의 콘텐츠" width="10%" />
<img src="../assets/ui/children-selfanim.gif" alt="spinner 임의 콘텐츠" width="10%" />
```tsx
import logo from '@/assets/images/logo/logo.svg';
import loadingGif from '@/assets/images/loading.gif';

// 1) 정적 이미지(로고 등) → Spinner 가 회전시킨다 (spin 기본 true)
<Spinner className="size-9">
  <img src={logo} alt="" className="size-full object-contain" />
</Spinner>

// 2) 이미 움직이는 GIF → 회전 끄기(이중 회전 방지)
<Spinner spin={false} className="size-9">
  <img src={loadingGif} alt="" className="size-full object-contain" />
</Spinner>
```


---


## API 레퍼런스
---

`SpinnerProps`는 `<svg>` 속성(`React.ComponentProps<'svg'>`)에 `icon` · `spin` · `children`을 더한 형태입니다. 표에 없는 표준 `<svg>` 속성(`onClick`, `style`, `id` 등)도 그대로 전달됩니다.

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `className` | `string` | — | 크기(`size-*`)·색(`text-*`) 등 조절. 기본 `"size-4 animate-spin"` 뒤에 병합되어 덮어씀 |
| `icon` | `React.ComponentType<React.ComponentProps<'svg'>>` | `Loader2Icon` | 회전시킬 아이콘 교체. lucide 아이콘·커스텀 SVG 컴포넌트 |
| `spin` | `boolean` | `true` | 회전 여부. 이미 움직이는 이미지엔 `false`로 이중 회전 방지 |
| `children` | `React.ReactNode` | — | `<img>` 등 임의 콘텐츠 삽입. 넘기면 `<span>` 래퍼로 렌더 |
| `aria-label` | `string` | `"Loading"` | 스크린리더 라벨. `role="status"`는 이미 설정됨 |
| `...props` | `React.ComponentProps<'svg'>` | — | 표준 속성 전달. 기본은 `<svg>`, `children` 사용 시 `<span>`에 전달 |

:::info 렌더 결과가 두 갈래입니다
`children`이 **없으면** 아이콘 컴포넌트를 그대로 그려 `<svg data-slot="spinner">`가 됩니다. `children`이 **있으면** `<span data-slot="spinner">` 래퍼로 감싸 그 안에 콘텐츠를 넣습니다. 어느 쪽이든 `data-slot="spinner"` · `role="status"` · `aria-label`은 동일하게 붙습니다.
:::

---


## 접근성
---

Spinner는 별도 설정 없이 아래가 기본 내장되어 있습니다.

* 루트에 **`role="status"`** 가 붙어, 스크린리더가 "상태 영역"으로 인식합니다.
* **`aria-label="Loading"`** 이 기본값입니다. 맥락에 맞는 문구가 필요하면 `aria-label`을 직접 지정하세요(예: `aria-label="목록을 불러오는 중"`).
* 스피너는 **장식이 아니라 상태 표시**이므로, 로딩 문구를 함께 두는 경우 그 컨테이너에 `aria-live="polite"`를 주면 변화가 안내됩니다(아래 [영역 로딩 오버레이](#1-영역-로딩-오버레이-sectionloadingoverlay) 예제 참고).

:::tip 회전 애니메이션과 `prefers-reduced-motion`
`animate-spin`은 앱 전역 규칙에서 모션 최소화 설정을 처리합니다. 커스텀 연출(예: 브랜드 헤일로)을 직접 만들 때는 `@media (prefers-reduced-motion: reduce)`로 회전을 은은한 깜빡임 등으로 대체하세요 — [브랜드 스피너](#2-브랜드-스피너-공용-spinner--커스텀-연출) 예제가 이 방식을 씁니다.
:::

---


## 스타일링 & 테마
---

이 프로젝트에서 스피너는 **스타일 변경이 잦은 컴포넌트**입니다. **변경 성격에 따라 위치를 나눕니다.** 위에서 아래로 갈수록 정교해집니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 색 · 크기 | **`className`**(`text-*` / `size-*`) — CSS 파일 불필요 |
| 회전 속도 · 배경 블러·페이드 같은 연출 | 소비 컴포넌트 옆 **co-located `*.module.css`** |
| 아예 다른 톤(브랜드 스피너) | 공용 Spinner를 **코어로 감싼 컴포넌트** + `module.css` |


### 방법 A — 색 · 크기만 → `className`

공용 Spinner는 `cn("size-4 animate-spin", className)` 구조라, 넘긴 `className`이 기본값을 덮어씁니다. 색(`text-*`)·크기(`size-*`)는 여기서 끝납니다. **사소한 변경에 `*.module.css` 파일을 만들지 마세요**(프로젝트 스타일 규칙 1번).

```tsx
<Spinner className="size-6 text-brand-500" />
```


### 방법 B — 속도 · 연출을 바꾼다 → co-located `module.css`

회전 속도(`animate-spin`은 1s 고정)나 배경 블러·페이드 같은 연출은 `className`만으로 안 됩니다. 이때는 **스피너를 감싸 쓰는 컴포넌트를 만들고**, 스타일을 그 **컴포넌트 파일 바로 옆** `*.module.css`에 둡니다(co-location, 스타일 규칙 2번). 아래 [영역 로딩 오버레이](#1-영역-로딩-오버레이-sectionloadingoverlay)가 정확히 이 방식입니다.

```css
/* SectionLoadingOverlay.module.css — 컴포넌트 바로 옆 */
.spinner {
  width: 1.75rem;
  height: 1.75rem;
  color: #0ea5e9;
}
/* 다크 모드는 앱 규칙(.dark)에 맞춘다 */
:global(.dark) .spinner { color: #38bdf8; }
```


### 방법 C — 아예 다른 톤(브랜드 스피너) → 코어로 감싼 컴포넌트 + `module.css`

그라데이션 링·글로우처럼 완전히 다른 톤이 필요해도, **회전하는 실제 인디케이터는 공용 Spinner를 코어로 그대로 재사용**하고 그 위에 브랜드 연출만 감싸는 컴포넌트를 만듭니다. 스타일은 그 옆 `module.css`에 두면 co-location 규칙이 그대로 성립합니다. 전체 소스는 아래 [브랜드 스피너](#2-브랜드-스피너-공용-spinner--커스텀-연출) 예제에 있습니다.

```tsx
// BrandSpinner.tsx — 회전하는 코어는 공용 Spinner 를 그대로 재사용
import { Spinner } from '@axiom/components/ui';
import styles from './BrandSpinner.module.css';

<span className={styles.halo}>
  <Spinner className={styles.core} />   {/* ← scaffold 공용 컴포넌트 */}
</span>
```

:::tip data-slot으로도 덮을 수 있습니다
Spinner는 `data-slot="spinner"`를 노출합니다. 래퍼 아래에서 `[data-slot='spinner']`를 선택자로 오버라이드할 수 있으나, 스피너는 대부분 `className`(방법 A)·코어 재사용(방법 C)으로 충분합니다. CSS Module 배치·명시도 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제
---

scaffold 예제 화면(`src/domains/example/pages/ui-components/SpinnerComponent.tsx`)과 그 옆 컴포넌트(`src/domains/example/components/ui-components/spinner/*`)에 있는 패턴입니다.


### 1. 버튼 로딩 상태

가장 흔한 사용처입니다. 저장/제출 버튼을 누르면 스피너를 띄우고 버튼을 비활성화합니다.

**포인트**

* 로딩 중에는 `disabled`로 **중복 클릭을 막습니다.**
* 스피너는 라벨 왼쪽에 `mr-2`로 간격을 주고, `size-4`로 버튼 글자 크기에 맞춥니다.
* 색을 지정하지 않아도 `currentColor` 덕분에 **버튼 글자색과 자동으로 맞춰집니다.**

---
<img src="../assets/ui/spinner-button-loading.png" alt="spinner 버튼 로딩" width="70%" />
```tsx
import { useState } from 'react';
import { Spinner, Button } from '@axiom/components/ui';

const [saving, setSaving] = useState(false);

const handleSave = () => {
  setSaving(true);
  setTimeout(() => setSaving(false), 1800); // 실제로는 API 응답 후 해제
};

<Button disabled={saving} onClick={handleSave}>
  {saving && <Spinner className="mr-2 size-4" />}
  {saving ? '저장 중…' : '저장'}
</Button>
```

:::tip 인라인 로딩(문구와 함께)
버튼이 아니라 문구 옆에 나란히 둘 때도 같은 방식입니다. 컨테이너의 글자색을 스피너가 물려받습니다.

```tsx
<span className="inline-flex items-center gap-2 text-gray-600">
  <Spinner className="size-4" />
  결제 정보를 확인하고 있어요…
</span>
```
:::


### 2. 영역 로딩 오버레이 (`SectionLoadingOverlay`)

데이터를 다시 불러오는 동안 **해당 영역만 흐리게 덮고** 가운데에 스피너를 띄웁니다. SI 프로젝트에서 목록/상세를 새로고칠 때 자주 쓰는 패턴입니다.

**포인트**

* 스피너 자체는 공용 `Spinner`를 그대로 쓰고, **배경 블러·페이드·정렬 같은 "오버레이 연출"만** 바로 옆 `module.css`로 분리했습니다(co-location, 방법 B).
* 퍼블리셔는 `.tsx`를 건드리지 않고 `SectionLoadingOverlay.module.css`의 색·블러·간격만 손보면 됩니다.
* 오버레이 컨테이너에 `role="status"` + `aria-live="polite"`를 주어 로딩 시작을 안내합니다.

---
<img src="../assets/ui/spinner-area-loading.png" alt="spinner 영역 로딩" width="70%" />
```tsx
import { useState } from 'react';
import { Button } from '@axiom/components/ui';
import SectionLoadingOverlay from '…/spinner/SectionLoadingOverlay';

const [loading, setLoading] = useState(false);

const handleReload = () => {
  setLoading(true);
  setTimeout(() => setLoading(false), 1800);
};

<Button size="sm" variant="outline" onClick={handleReload} disabled={loading}>
  {loading ? '불러오는 중…' : '다시 불러오기'}
</Button>

<SectionLoadingOverlay loading={loading} message="거래 내역을 불러오는 중…">
  <ul>{/* … 실제 콘텐츠 … */}</ul>
</SectionLoadingOverlay>
```

<details>
<summary><b>SectionLoadingOverlay.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/spinner/SectionLoadingOverlay.tsx"
import { Spinner } from '@axiom/components/ui';
import styles from './SectionLoadingOverlay.module.css';

export interface ISectionLoadingOverlayProps {
  /** 로딩 중 여부 — true 일 때 오버레이가 콘텐츠 위에 덮인다. */
  loading: boolean;
  /** 스피너 아래에 표시할 안내 문구. */
  message?: string;
  /** 오버레이가 덮을 실제 콘텐츠. */
  children: React.ReactNode;
}

/**
 * 카드/영역 단위 로딩 오버레이.
 *
 * 스피너 자체는 공용 `Spinner` 를 그대로 쓰고, 배경 블러·페이드·정렬 같은
 * "오버레이 연출"은 바로 옆 module.css 로 분리했다(co-location).
 * 퍼블리셔는 이 .tsx 를 건드리지 않고 SectionLoadingOverlay.module.css 만 손보면 된다.
 */
export default function SectionLoadingOverlay({
  loading,
  message = '불러오는 중…',
  children,
}: ISectionLoadingOverlayProps): React.ReactNode {
  return (
    <div className={styles.wrap}>
      {children}

      {loading && (
        // highlight-start
        <div className={styles.overlay} role="status" aria-live="polite">
          <Spinner className={styles.spinner} />
          <span className={styles.message}>{message}</span>
        </div>
        // highlight-end
      )}
    </div>
  );
}
```

</details>

<details>
<summary><b>SectionLoadingOverlay.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/spinner/SectionLoadingOverlay.module.css"
/* 공용 Spinner 는 그대로 두고, "영역 위에 덮이는 오버레이" 연출만 여기서 담당한다. */

.wrap {
  position: relative;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;

  border-radius: inherit;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);

  animation: overlay-fade 160ms ease-out;
}

@keyframes overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 공용 Spinner 는 currentColor 로 그려지므로 색은 여기서 지정한다. */
.spinner {
  width: 1.75rem;
  height: 1.75rem;
  color: #0ea5e9; /* sky-500 */
}

.message {
  font-size: 0.75rem;
  font-weight: 500;
  color: #475569; /* slate-600 */
}

/* 다크 모드 — 앱 규칙(.dark)에 맞춰 처리한다. */
:global(.dark) .overlay { background: rgba(15, 23, 42, 0.55); }
:global(.dark) .spinner { color: #38bdf8; }
:global(.dark) .message { color: #cbd5e1; }
```

</details>


### 3. 브랜드 스피너 (공용 Spinner + 커스텀 연출)

그라데이션 링·글로우처럼 톤앤매너가 통째로 바뀌어도, **회전하는 코어는 공용 `<Spinner/>`를 그대로 재사용**하고 그 위에 `conic-gradient` 헤일로 링만 감쌉니다(방법 C). 색·속도·두께 같은 디자인 변경은 모두 `BrandSpinner.module.css`에서 이뤄집니다.

**포인트**

* 실제 인디케이터 로직은 공용 컴포넌트에 맡기고, 껍데기(헤일로)만 `module.css`로 그립니다.
* `--size` / `--thickness`를 인라인 스타일로 주입해 크기·두께를 props로 조절합니다.
* `@media (prefers-reduced-motion: reduce)`로 회전 대신 은은한 깜빡임을 제공합니다.

---
<img src="../assets/ui/spinner-brand-loading.png" alt="spinner 브랜드 로딩" width="70%" />

<details>
<summary><b>BrandSpinner.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/spinner/BrandSpinner.tsx"
import { Spinner } from '@axiom/components/ui';
import styles from './BrandSpinner.module.css';

export interface IBrandSpinnerProps {
  /** 스피너 지름(px). 기본 44. */
  size?: number;
  /** 헤일로 링 두께(px). 기본 4. */
  thickness?: number;
  /** 접근성 라벨. */
  label?: string;
}

/**
 * 공용 Spinner 를 "코어"로 그대로 쓰면서 톤앤매너를 완전히 바꾼 브랜드 스피너.
 * 회전하는 실제 인디케이터는 scaffold 의 공용 <Spinner/> 그대로이고,
 * 그 위에 그라데이션 헤일로 링 + 글로우 같은 "브랜드 연출"만 옆 module.css 로 입혔다.
 */
export default function BrandSpinner({
  size = 44,
  thickness = 4,
  label = 'Loading',
}: IBrandSpinnerProps): React.ReactNode {
  return (
    <span
      className={styles.halo}
      role="status"
      aria-label={label}
      style={
        {
          '--size': `${size}px`,
          '--thickness': `${thickness}px`,
        } as React.CSSProperties
      }
    >
      {/* 코어 = scaffold 공용 Spinner. 커스텀은 module.css 가 담당한다. */}
      // highlight-next-line
      <Spinner className={styles.core} />
    </span>
  );
}
```

</details>

<details>
<summary><b>BrandSpinner.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/spinner/BrandSpinner.module.css"
/* 핵심 인디케이터는 공용 <Spinner/> 를 그대로 쓰고,
   여기서는 그 위에 "그라데이션 헤일로 링 + 글로우" 브랜드 연출만 얹는다. */

.halo {
  /* .tsx 에서 --size / --thickness 를 주입한다. */
  position: relative;
  display: inline-grid;
  place-items: center;

  width: var(--size, 44px);
  height: var(--size, 44px);
  border-radius: 9999px;

  --edge: 1.5px; /* mask 안쪽 경계 feather(계단현상 방지) */

  /* ① 코멧형 그라데이션 — 양 끝을 투명으로 페이드해 이음새(seam) 제거 */
  background: conic-gradient(
    from 90deg,
    rgba(99, 102, 241, 0) 0deg,
    rgba(14, 165, 233, 0.1) 45deg,
    #0ea5e9 210deg,
    #6366f1 348deg,
    rgba(99, 102, 241, 0) 360deg
  );

  /* ② radial-gradient mask 로 가운데를 뚫어 '링'만 남긴다 */
  -webkit-mask: radial-gradient(
    farthest-side,
    #0000 calc(100% - var(--thickness, 4px) - var(--edge)),
    #000 calc(100% - var(--thickness, 4px) + var(--edge))
  );
  mask: radial-gradient(
    farthest-side,
    #0000 calc(100% - var(--thickness, 4px) - var(--edge)),
    #000 calc(100% - var(--thickness, 4px) + var(--edge))
  );

  will-change: transform;
  backface-visibility: hidden;

  /* ④ 링 회전 속도 — 이 숫자만 바꾸면 빠르기가 바뀐다 */
  animation: brand-halo 1.6s linear infinite;
}

@keyframes brand-halo {
  to { transform: rotate(360deg); }
}

/* 코어 = 공용 <Spinner/>. `.halo .core` 로 Tailwind 단일 클래스보다 우선순위를 높인다 */
.halo .core {
  width: 52%;
  height: 52%;
  color: #0369a1; /* sky-700 */
  filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.5));
}

/* 다크 모드 — 앱 규칙(.dark)에 맞춘다. */
:global(.dark) .halo { /* conic-gradient 색만 교체 … */ }
:global(.dark) .halo .core {
  color: #bae6fd; /* sky-200 */
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.6));
}

/* 모션 최소화 배려 — 헤일로 회전 대신 은은한 깜빡임 */
@media (prefers-reduced-motion: reduce) {
  .halo { animation: brand-pulse 1.2s ease-in-out infinite; }
  @keyframes brand-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
}
```

</details>


### 4. 회전 아이콘 교체 (`icon` prop)

공용 Spinner를 그대로 쓰면서 **"모양"만** 바꾸는 예제입니다. lucide 아이콘뿐 아니라 직접 만든 SVG도 끼울 수 있습니다.

<details>
<summary><b>BrandMarkIcon.tsx</b> — 커스텀 SVG 아이콘 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/spinner/BrandMarkIcon.tsx"
/**
 * 공용 Spinner 의 `icon` prop 에 끼우는 커스텀 브랜드 SVG 아이콘 예시.
 * lucide 아이콘과 동일하게 React.ComponentProps<'svg'> 를 받아 그대로 전달하므로,
 * <Spinner icon={BrandMarkIcon} className="size-8 text-sky-500" /> 처럼 쓰면
 * 회전·크기·색(currentColor)은 Spinner 가 담당하고 모양만 이 아이콘으로 바뀐다.
 */
export default function BrandMarkIcon({ className, ...props }: React.ComponentProps<'svg'>): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={className}
      {...props}
    >
      {/* 진한 아크 */}
      <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" />
      {/* 옅은 반대편 아크 */}
      <path d="M12 21.5a9.5 9.5 0 0 1-9.5-9.5" opacity="0.35" />
    </svg>
  );
}
```

</details>

```tsx
import { Spinner } from '@axiom/components/ui';
import BrandMarkIcon from '…/spinner/BrandMarkIcon';

<Spinner icon={BrandMarkIcon} className="size-8 text-sky-500" />
```

:::tip 이 예제들에서 가져갈 것
회전·크기·접근성 같은 **동작은 공용 Spinner에 그대로 맡기고**, 바꾸는 건 ①`className`(색·크기) ②`icon`/`children`(모양·내용물) ③감싼 컴포넌트 옆 `module.css`(속도·연출) 뿐입니다. **공용 `spinner.tsx`를 복사해서 고치지 마세요.**
:::

---
