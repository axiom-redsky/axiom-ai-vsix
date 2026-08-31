---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Alert"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Alert 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/ui-components-alert--docs"
  title="Alert 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Alert 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 알림 배너 컴포넌트입니다.  
화면 흐름 **안쪽에 인라인으로** 놓여, 지금 보고 있는 영역과 관련된 정보·경고를 전달할 때 사용합니다.

**언제 쓰나요?**

* 저장 완료·검증 실패처럼 **방금 한 동작의 결과**를 그 자리에서 알릴 때
* 만료 임박·용량 부족처럼 **미리 알아둬야 할 상태**를 페이지 상단에 띄울 때
* 폼 위쪽에 **에러 요약**을 모아 보여줄 때

:::danger 전역 `$ui.alert()` 와 혼동하지 마세요
이름은 같지만 **완전히 다른 것**입니다.

* **`Alert`** (이 문서) — 화면 안에 렌더링되는 **인라인 배너 UI 컴포넌트**. 페이지 흐름을 막지 않고, JSX로 직접 배치합니다. `@axiom/components/ui` 에서 import 합니다.
* **`$ui.alert()`** — 화면을 덮는 **전역 모달 다이얼로그 함수**. 사용자가 닫을 때까지 기다리는 `Promise`를 반환하며, import 없이 `window.$ui`로 어디서든 호출합니다.

```tsx
// (1) 이 문서에서 다루는 것 — 인라인 배너 컴포넌트
import { Alert, AlertTitle } from '@axiom/components/ui';

<Alert>
  <AlertTitle>저장되었습니다.</AlertTitle>
</Alert>

// (2) 이 문서와 무관 — 전역 모달 다이얼로그 (별도 기능)
await $ui.alert('저장되었습니다.');
```
:::

---


## Import
---

```tsx
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from '@axiom/components/ui';
```

Alert는 **4개의 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. `Alert`만 필수이고 나머지는 모두 선택이며, 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---


## 기본 사용법
---

`Alert` 안에 `AlertTitle`(제목)과 `AlertDescription`(본문)을 넣는 것이 가장 기본적인 형태입니다.

---
<img src="../assets/ui/alert-basic.png" alt="alert 기본 사용법" width="90%" />

```tsx
<Alert>
  <AlertTitle>변경사항이 저장되었습니다.</AlertTitle>
  <AlertDescription>
    수정한 내용은 즉시 반영되며, 언제든지 되돌릴 수 있습니다.
  </AlertDescription>
</Alert>
```

:::tip 제목·본문은 둘 다 선택입니다
한 줄이면 `AlertTitle`만, 부연 설명만 필요하면 `AlertDescription`만 써도 됩니다. ([제목만 / 설명만](#3-제목만--설명만) 참고)
:::

---


## 구성 (Anatomy)
---

Alert는 아래 4개 파트를 중첩해서 구성합니다.

```tsx
<Alert>                    {/* 루트 — role="alert", variant로 톤 결정 */}
  <Info />                 {/* (선택) 아이콘 — 첫 자식으로 두면 좌측 배치 */}
  <AlertTitle />           {/* (선택) 제목 한 줄 */}
  <AlertDescription />     {/* (선택) 본문 설명 */}
  <AlertAction />          {/* (선택) 우측 상단 액션 영역 */}
</Alert>
```

| 파트 | 역할 |
| --- | --- |
| `Alert` | 루트. `role="alert"`가 자동 적용되고 `variant`로 톤을 정합니다. |
| `AlertTitle` | 제목 한 줄. 아이콘이 있으면 자동으로 2번째 컬럼에 정렬됩니다. |
| `AlertDescription` | 본문. `<a>` 밑줄·`<p>` 간격이 자동 적용됩니다. |
| `AlertAction` | 우측 상단에 절대 배치되는 액션 영역(닫기·바로가기 버튼). |

:::note 레이아웃은 자식 구성에 따라 자동으로 바뀝니다
`Alert`는 CSS의 `has()` 선택자를 사용해 **아이콘이 있으면 2컬럼 그리드로**, **`AlertAction`이 있으면 오른쪽 패딩을 넓혀** 텍스트가 버튼과 겹치지 않게 처리합니다. 별도 클래스를 줄 필요가 없습니다.
:::

---


## 표현 옵션
---

보이는 **모양**은 루트 `Alert`의 prop과 자식 구성으로 결정됩니다.


### 1. 톤 — `variant`

기본 제공 variant는 **`default`와 `destructive` 2가지**입니다.

```tsx
// 일반 안내 (기본값)
<Alert>
  <AlertTitle>기본 알림</AlertTitle>
  <AlertDescription>일반적인 안내 메시지에 사용합니다.</AlertDescription>
</Alert>

// 실패·위험
<Alert variant="destructive">
  <AlertTitle>결제에 실패했습니다.</AlertTitle>
  <AlertDescription>카드 한도를 확인한 뒤 다시 시도해 주세요.</AlertDescription>
</Alert>
```

* `default` — 카드 배경(`bg-card`)에 기본 텍스트 색.
* `destructive` — 텍스트와 아이콘이 `--destructive` 색으로 표시됩니다. **배경색은 바뀌지 않습니다.**

:::caution success / warning 은 variant에 없습니다
성공·경고 톤이 필요하면 `className`으로 색을 덧입히거나(→ [스타일링 & 테마](#1-className-으로-톤-확장)), CSS Module로 `data-slot`을 오버라이드합니다(→ [실전 예제](#실전-예제--계좌-알림-센터)).
:::

---
<img src="../assets/ui/alert-variant.png" alt="alert variant 사용" width="90%" />



### 2. 아이콘 배치

`Alert`의 **첫 번째 자식으로 svg를 넣기만 하면** 자동으로 2컬럼 그리드가 되어 아이콘이 좌측에, 제목·본문이 우측에 정렬됩니다.

```tsx
import { Terminal, TriangleAlert } from 'lucide-react';

<Alert>
  <Terminal />
  <AlertTitle>CLI로도 실행할 수 있습니다.</AlertTitle>
  <AlertDescription>
    터미널에서 <code>npm run build</code> 로 동일한 작업을 수행합니다.
  </AlertDescription>
</Alert>

<Alert variant="destructive">
  <TriangleAlert />
  <AlertTitle>세션이 만료되었습니다.</AlertTitle>
  <AlertDescription>보안을 위해 다시 로그인해 주세요.</AlertDescription>
</Alert>
```

* **크기**는 `size-4`(1rem)가 자동 적용됩니다. 다른 크기를 원하면 아이콘에 직접 `className="size-5"` 처럼 지정하면 덮어씁니다.
* **색**은 `text-current` — 즉 `Alert`의 글자색을 따라갑니다. 그래서 `variant="destructive"`면 아이콘도 함께 빨개집니다.
* 아이콘은 제목·본문 **두 줄에 걸쳐(row-span-2)** 세로 정렬됩니다.

---
<img src="../assets/ui/alert-icon.png" alt="alert 아이콘 포함" width="90%" />





### 3. 제목만 / 설명만

`AlertTitle`, `AlertDescription`은 모두 선택 사항입니다.

```tsx
{/* 한 줄 알림 — 제목만 */}
<Alert>
  <Info />
  <AlertTitle>새 버전(v2.4.0)이 배포되었습니다.</AlertTitle>
</Alert>

{/* 부연 설명만 */}
<Alert>
  <AlertDescription>
    입력하신 정보는 암호화되어 안전하게 저장됩니다.
  </AlertDescription>
</Alert>
```

* 짧은 공지는 **제목만** 쓰는 편이 시각적으로 깔끔합니다.
* 설명만 쓰면 `--muted-foreground` 색으로 표시되어 톤이 한 단계 낮아집니다.


### 4. 우측 액션 — `AlertAction`

`AlertAction`을 넣으면 우측 상단에 **절대 배치**되고, `Alert` 본문의 오른쪽 패딩이 자동으로 넓어져 텍스트와 겹치지 않습니다.

```tsx
<Alert>
  <CircleAlert />
  <AlertTitle>저장 공간이 90% 찼습니다.</AlertTitle>
  <AlertDescription>
    용량이 가득 차면 새 파일 업로드가 제한됩니다.
  </AlertDescription>
  <AlertAction>
    <Button size="xs" variant="outline">업그레이드</Button>
  </AlertAction>
</Alert>
```

* 버튼은 `size="xs"` / `size="icon-xs"` 정도가 배너 높이와 잘 맞습니다.
* 액션이 2개 이상이면 `AlertAction`에 `className="flex items-center gap-1"`을 주어 나란히 배치합니다.

---
<img src="../assets/ui/alert-action.png" alt="alert action" width="90%" />



### 5. 링크 · 여러 문단

`AlertDescription` 안의 `<a>`는 자동으로 밑줄이 적용되고, `<p>`가 여러 개면 **마지막 문단을 제외하고** 아래 간격이 붙습니다.

```tsx
<Alert>
  <Info />
  <AlertTitle>개인정보 처리방침이 변경되었습니다.</AlertTitle>
  <AlertDescription>
    <p>2026년 8월 1일부터 새로운 방침이 적용됩니다.</p>
    <p>
      자세한 내용은 <a href="/policy">변경 내역</a>에서 확인하세요.
    </p>
  </AlertDescription>
</Alert>
```

* `<a>`는 `underline` + `underline-offset-3`, hover 시 `--foreground` 색으로 전환됩니다. 별도 클래스가 필요 없습니다.
* 같은 규칙이 `AlertTitle` 안의 `<a>`에도 적용됩니다.


### 6. 닫을 수 있는 Alert (제어)

`Alert`는 **닫기 기능을 내장하지 않습니다.** 표시 여부는 화면의 state로 직접 제어합니다 — 가장 많이 쓰는 패턴입니다.

```tsx
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@axiom/components/ui';
import { Info, X } from 'lucide-react';

function Example() {
  // highlight-next-line
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <Alert>
      <Info />
      <AlertTitle>브라우저 알림이 꺼져 있습니다.</AlertTitle>
      <AlertDescription>
        알림을 켜면 거래 발생 시 즉시 안내를 받을 수 있습니다.
      </AlertDescription>
      <AlertAction>
        {/* highlight-next-line */}
        <Button size="icon-xs" variant="ghost" aria-label="닫기" onClick={() => setVisible(false)}>
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
```

* 닫기 버튼에는 아이콘만 들어가므로 **`aria-label`을 반드시 지정**하세요.
* 여러 알림을 목록으로 다룬다면 배열 state에서 `filter`로 제거합니다. ([실전 예제](#실전-예제--계좌-알림-센터) 참고)

---


## API 레퍼런스
---

네 파트 모두 **일반 `<div>`** 이므로, 아래 표에 없는 `id`·`data-*`·`onClick` 등 표준 div 속성은 그대로 전달됩니다.

### `Alert` (루트)

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `variant` | `"default" \| "destructive"` | `"default"` | 알림 톤 |
| `children` | `ReactNode` | — | 아이콘 / Title / Description / Action |
| `className` | `string` | — | 색·여백 등 추가 스타일 (톤 확장 시 사용) |
| `...props` | `div` 속성 전체 | — | `role="alert"`가 기본 적용된 div |

### `AlertTitle`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 제목 텍스트 (한 줄 권장) |
| `className` | `string` | — | 추가 스타일 |

### `AlertDescription`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 본문. `<a>` 밑줄 / `<p>` 간격이 자동 적용 |
| `className` | `string` | — | 추가 스타일 |

### `AlertAction`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | 우측 상단에 절대 배치되는 액션 (닫기·바로가기 버튼) |
| `className` | `string` | — | 추가 스타일 (기본 `absolute top-2 right-2`) |

:::note `variant` 는 루트에만 있습니다
`AlertTitle` / `AlertDescription` / `AlertAction`은 `variant`를 받지 않습니다. 톤은 루트의 `variant`가 자식으로 흘러내리는 구조입니다.
:::

---


## 접근성
---

| 항목 | 동작 |
| --- | --- |
| `role="alert"` | 루트에 **자동 적용**. 스크린리더가 내용을 즉시 읽습니다. |
| 아이콘 | 장식용이므로 `aria-hidden`이 필요하면 직접 지정합니다. |
| 닫기 버튼 | 아이콘 전용 버튼에는 `aria-label="닫기"`를 **직접** 붙여야 합니다. |
| 포커스 링 | `AlertAction` 안의 Button은 디자인 토큰 `--ring`을 따릅니다. |

:::caution `role="alert"` 는 즉시 읽힙니다
`role="alert"`는 화면에 나타나는 순간 스크린리더가 진행 중인 낭독을 끊고 읽습니다. **처음부터 페이지에 상시 노출되는 정적 안내문**에는 과한 강조가 될 수 있으니, 이 경우 `role="status"`나 `role="note"`로 덮어쓰는 것을 고려하세요.

```tsx
<Alert role="status">…</Alert>
```
:::

---


## 스타일링 & 테마
---

Alert는 variant가 2종뿐이라 **색 확장은 스타일링으로 처리**하는 것을 전제로 설계되어 있습니다. 바꾸려는 범위에 따라 아래에서 고르세요.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 이 한 곳만 색·여백 조정 | 각 파트의 **`className`** |
| success / warning 등 톤 추가 | **`className`** 또는 `data-*` + **CSS Module** |
| 전체 색 체계 | **디자인 토큰**(`--card`, `--destructive`, `--muted-foreground`) |
| 겉모습 전체 교체 | **`data-slot` 선택자 + CSS Module** |

:::tip 핵심 원칙
* 한두 군데면 `className`, **여러 알림에 반복되는 톤 체계**면 CSS Module로 만듭니다.
* 아이콘 색은 `*:[svg]:text-current` 규칙 때문에 **Alert의 글자색을 따라갑니다.** 아이콘만 다른 색으로 하려면 **아이콘에 직접** 클래스를 주세요.
:::


### 1. `className` 으로 톤 확장

가장 간단한 방법. 루트에 배경·테두리를, 아이콘·제목·본문에 각각 글자색을 줍니다.

```tsx
{/* success */}
<Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
  {/* highlight-next-line */}
  <CircleCheck className="text-emerald-600 dark:text-emerald-400" />
  <AlertTitle className="text-emerald-900 dark:text-emerald-200">
    이체가 완료되었습니다.
  </AlertTitle>
  <AlertDescription className="text-emerald-700 dark:text-emerald-300/80">
    홍길동님께 1,200,000원을 보냈습니다.
  </AlertDescription>
</Alert>

{/* warning */}
<Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
  <TriangleAlert className="text-amber-600 dark:text-amber-400" />
  <AlertTitle className="text-amber-900 dark:text-amber-200">
    비밀번호를 90일 이상 변경하지 않았습니다.
  </AlertTitle>
  <AlertDescription className="text-amber-700 dark:text-amber-300/80">
    보안을 위해 주기적으로 변경해 주세요.
  </AlertDescription>
</Alert>
```

* 아이콘에 클래스를 주지 않으면 `text-current`를 따라 **본문과 같은 색**이 되어 톤이 살지 않습니다.
* 다크 모드까지 함께 지정해야 두 테마에서 모두 읽힙니다.

---
<img src="../assets/ui/alert-classname.png" alt="alert className으로 톤 확장" width="90%" />




### 2. 색은 디자인 토큰을 따릅니다

기본 색은 alert 전용 변수가 아니라 **전역 디자인 토큰**을 씁니다. 앱 전체 톤을 바꾸려면 토큰을 조정하세요.

| 대상 | 토큰 |
| --- | --- |
| 루트 배경 / 글자 | `--card` / `--card-foreground` |
| `destructive` 글자·아이콘 | `--destructive` |
| `AlertDescription` 글자 | `--muted-foreground` |
| 테두리 | `--border` |


### 3. 세밀한 겉모습 교체 — `data-slot` + CSS Module

여러 알림에 반복되는 톤 체계를 만들 때는 `data-slot`을 CSS Module에서 오버라이드합니다.

| data-slot | 대상 |
| --- | --- |
| `[data-slot="alert"]` | 루트 |
| `[data-slot="alert-title"]` | 제목 |
| `[data-slot="alert-description"]` | 본문 |
| `[data-slot="alert-action"]` | 우측 액션 영역 |

```tsx
{/* 톤을 data 속성으로 넘기고 */}
<Alert data-tone="warning" className={styles.notice}>…</Alert>
```
```css
/* CSS Module에서 톤별 변수만 주입 */
.wrap .notice[data-tone='warning'] {
  --an-tone: #b45309;
  --an-tone-bg: #fffbeb;
  --an-tone-border: #fde68a;
}
.wrap .notice {
  border: 1px solid var(--an-tone-border);
  background: var(--an-tone-bg);
}
.wrap .notice > svg { color: var(--an-tone); }
.wrap .notice [data-slot='alert-title'] { font-weight: 700; }
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap .notice [data-slot=...]` 처럼 **래퍼 + 슬롯을 2~3단계로 겹쳐** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제 — 계좌 알림 센터
---

제공 `Alert`를 **그대로 쓰되**, `*.module.css`에서 `data-slot`을 오버라이드해 기본 variant 2종을 `info` / `success` / `warning` / `danger` **4가지 톤으로 확장**한 예제입니다. 알림 닫기와 액션 클릭까지 실제로 동작합니다.

---
<img src="../assets/ui/alert-real-ex.png" alt="alert 실전 예제" width="90%" />


{/* ![계좌 알림 센터](../assets/ui/alert-real-notice.png) */}

**포인트**

* 톤을 `variant`가 아니라 **`data-tone` 속성**으로 넘기고, CSS에서 `[data-tone='...']` 별로 색 변수 3개(`--an-tone`, `--an-tone-bg`, `--an-tone-border`)만 갈아끼웁니다.
* 아이콘 색은 `.notice > svg { color: var(--an-tone); }` 한 줄로 톤을 따라가게 했습니다.
* `AlertAction` 안에 **액션 버튼 + 닫기 버튼 2개**를 넣고, `.action`에 `display:flex; gap:2px`로 나란히 배치했습니다.
* 다크 모드는 `:global(.dark) .wrap` 에서 **토큰만 교체**합니다.

<details>
<summary><b>AccountNoticeAlert.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/AccountNoticeAlert.tsx"
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@axiom/components/ui';
import { CircleAlert, CircleCheck, Info, ShieldAlert, X } from 'lucide-react';
import styles from './AccountNoticeAlert.module.css';

/** 알림 톤(= 실무에서 흔히 쓰는 4단계) */
type TNoticeTone = 'info' | 'success' | 'warning' | 'danger';

interface INotice {
  id: string;
  tone: TNoticeTone;
  title: string;
  description: string;
  /** 우측 액션 버튼 라벨(없으면 액션 미표시) */
  actionLabel?: string;
}

const TONE_ICON: Record<TNoticeTone, React.ReactNode> = {
  info: <Info />,
  success: <CircleCheck />,
  warning: <CircleAlert />,
  danger: <ShieldAlert />,
};

const INITIAL_NOTICES: INotice[] = [
  {
    id: 'n1',
    tone: 'danger',
    title: '해외 IP에서 로그인이 감지되었습니다',
    description: '2026-07-21 23:41 · 싱가포르(203.0.113.24). 본인이 아니라면 즉시 비밀번호를 변경하세요.',
    actionLabel: '조치',
  },
  {
    id: 'n2',
    tone: 'warning',
    title: '공동인증서 만료 12일 전',
    description: '만료 후에는 이체·조회 서비스 이용이 제한됩니다. 미리 갱신해 주세요.',
    actionLabel: '갱신',
  },
  // … success / info 알림 생략
];

export default function AccountNoticeAlert(): React.ReactNode {
  const [notices, setNotices] = useState<INotice[]>(INITIAL_NOTICES);
  const [lastAction, setLastAction] = useState<string>('');

  const dismiss = (id: string) => setNotices((prev) => prev.filter((n) => n.id !== id));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.headTitle}>알림 센터</span>
        <span className={styles.headCount}>{notices.length}건</span>
      </div>

      <div className={styles.list}>
        {notices.length === 0 && <p className={styles.empty}>확인하지 않은 알림이 없습니다.</p>}

        {notices.map((n) => (
          // scaffold 제공 Alert — 톤은 data-tone 으로 넘기고 스타일만 CSS Module로 오버라이드
          // highlight-next-line
          <Alert key={n.id} data-tone={n.tone} className={styles.notice}>
            {TONE_ICON[n.tone]}
            <AlertTitle>{n.title}</AlertTitle>
            <AlertDescription>{n.description}</AlertDescription>

            {/* 액션 + 닫기 버튼을 한 영역에 */}
            <AlertAction className={styles.action}>
              {n.actionLabel && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setLastAction(`${n.title} → ${n.actionLabel}`)}
                >
                  {n.actionLabel}
                </Button>
              )}
              {/* highlight-next-line */}
              <Button type="button" size="icon-xs" variant="ghost" aria-label="알림 닫기" onClick={() => dismiss(n.id)}>
                <X />
              </Button>
            </AlertAction>
          </Alert>
        ))}
      </div>

      <div className={styles.foot}>
        <span className={styles.footLog}>
          {lastAction ? `최근 액션: ${lastAction}` : '액션 버튼을 눌러보세요.'}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setNotices(INITIAL_NOTICES);
            setLastAction('');
          }}
        >
          초기화
        </Button>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>AccountNoticeAlert.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/AccountNoticeAlert.module.css"
.wrap {
  --an-card: #ffffff;
  --an-border: #e5e7eb;
  --an-ink: #111827;
  --an-sub: #6b7280;

  /* 톤 4종 팔레트 (본문/배경/테두리) */
  --an-info: #2563eb;
  --an-info-bg: #eff6ff;
  --an-info-border: #bfdbfe;

  --an-warning: #b45309;
  --an-warning-bg: #fffbeb;
  --an-warning-border: #fde68a;

  /* … success / danger 동일 패턴 */

  color: var(--an-ink);
  background: var(--an-card);
  border: 1px solid var(--an-border);
  border-radius: 16px;
  overflow: hidden;
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --an-card: #0f1420;
  --an-ink: #e6e9f2;
  --an-warning: #f0b354;
  --an-warning-bg: #2e2313;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * scaffold Alert 슬롯 오버라이드
 * (래퍼 + 슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보)
 * ========================================================================= */

/* Alert 루트 — 톤별 색은 아래 [data-tone] 블록에서 주입 */
.wrap .notice {
  position: relative;
  padding: 12px 88px 12px 12px; /* 우측은 액션 영역만큼 비움 */
  border-radius: 12px;
  border: 1px solid var(--an-tone-border);
  background: var(--an-tone-bg);
}

/* 아이콘 색 = 톤 색 (기본은 text-current 라 본문색을 따라감) */
/* highlight-next-line */
.wrap .notice > svg { color: var(--an-tone); }

.wrap .notice [data-slot='alert-title'] {
  font-size: 13px;
  font-weight: 700;
  color: var(--an-ink);
}
.wrap .notice [data-slot='alert-description'] {
  font-size: 12px;
  color: var(--an-sub);
  line-height: 1.6;
}

/* ── 톤 4종 — 변수 3개만 갈아끼운다 ───────────────────── */
/* highlight-start */
.wrap .notice[data-tone='info'] {
  --an-tone: var(--an-info);
  --an-tone-bg: var(--an-info-bg);
  --an-tone-border: var(--an-info-border);
}
.wrap .notice[data-tone='warning'] {
  --an-tone: var(--an-warning);
  --an-tone-bg: var(--an-warning-bg);
  --an-tone-border: var(--an-warning-border);
}
/* … success / danger 동일 패턴 */
/* highlight-end */

/* ── 우측 액션 영역 — 버튼 2개를 나란히 ─────────────── */
.wrap .action {
  display: flex;
  align-items: center;
  gap: 2px;
  top: 8px;
  right: 8px;
}
.wrap .action [data-slot='button'] {
  color: var(--an-tone);
  font-weight: 600;
}
.wrap .action [data-slot='button']:hover {
  background: color-mix(in srgb, var(--an-tone) 14%, transparent);
}
```

</details>

:::tip 이 예제에서 가져갈 것
`variant`가 2종뿐이어도 **컴포넌트를 복사해 고칠 필요가 없습니다.** 바꾸는 건 ①`data-tone` 같은 내 속성 ②`data-slot` 오버라이드 ③Alert 안에 넣는 내 마크업 세 가지뿐이고, 톤이 늘어나도 CSS 변수 3개짜리 블록만 추가하면 됩니다.
:::

---
