---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Toast"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Sonner 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-sonner--docs"
  title="Sonner 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Toast 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 토스트(일시 알림) 컴포넌트입니다.  
**화면 위에 잠깐 떠올랐다 사라지는 알림**으로, 작업 결과를 사용자의 흐름을 끊지 않고 알릴 때 사용합니다. 내부 구현은 [Sonner](https://sonner.emilkowal.ski/) 기반이며, scaffold의 `src/shared/lib/shadcn/ui/sonner.tsx` 에서 아이콘·테마·기본 스타일을 앱 토큰에 맞춰 감싸 두었습니다.

**언제 쓰나요?**

* 저장 완료, 이체 성공처럼 **작업 결과를 짧게 확인**시켜 줄 때
* 네트워크 실패, 검증 오류처럼 **비차단(non-blocking) 피드백**을 줄 때
* 업로드·API 호출 같은 **비동기 작업의 진행 → 성공/실패**를 한 흐름으로 보여줄 때
* '실행 취소(undo)'처럼 **되돌릴 수 있는 후속 동작**을 잠깐 제공할 때

> 사용자의 **응답을 반드시 받아야** 하는(계속/취소를 눌러야 진행되는) 상황이면 토스트가 아니라 Dialog/Alert를 씁니다. 토스트는 "봐도 되고 놓쳐도 되는" 알림입니다.


<img src="../assets/ui/toast-basic.png" alt="toast 기본 사용법" width="80%" />

---


## Import & 셋업
---

호출부에서는 **`toast` 함수만** 가져오면 됩니다.

```tsx
import { toast } from '@axiom/components/ui';

toast('저장되었습니다.');
```

:::caution 토스트는 다른 컴포넌트와 셋업 방식이 다릅니다 — 호스트(`<Toaster/>`)가 필요
토스트는 화면에 그려주는 **호스트 `<Toaster/>` 가 앱에 딱 한 번** 떠 있어야 동작합니다. 이 호스트는 `<body>` 로 **portal** 되는 **싱글톤**이라, 페이지마다 두는 게 아니라 앱 트리 최상단에 1회만 마운트합니다.

**이 scaffold는 이미 전역에 마운트되어 있습니다.** (`src/core/providers/AppProviders.tsx` → `AppToaster` → `<Toaster/>`) 따라서 여러분은 **어느 화면에서든 `toast(...)` 만 호출**하면 됩니다.
:::

직접 셋업해야 하는 프로젝트라면 아래처럼 앱 루트에 한 번만 둡니다.

```tsx title="참고) 앱 전역 셋업 (이 scaffold는 이미 되어 있음)"
// src/core/providers/AppProviders.tsx 근처 — 앱 트리 최상단에 딱 한 번만
import { Toaster } from '@axiom/components/ui';

<Toaster />
```

:::note 실제 구현 위치
호스트/함수의 구현체는 `src/shared/lib/shadcn/ui/sonner.tsx`(Sonner 래퍼)이며, `@axiom/components/ui` 배럴을 통해 `Toaster` 와 `toast` 가 재노출됩니다. **개별 경로가 아니라 "@axiom/components/ui"에서 import** 하세요.
:::

---


## 기본 사용법
---

`toast()` 에 문자열만 넘기면 기본 토스트가 뜹니다. 몇 초 뒤 자동으로 사라집니다.

```tsx
toast('링크가 클립보드에 복사되었습니다.');
```

버튼 클릭 등 이벤트 핸들러 안에서 호출하는 것이 일반적입니다.

```tsx
import { toast, Button } from '@axiom/components/ui';

<Button onClick={() => toast('링크가 클립보드에 복사되었습니다.')}>
  링크 복사
</Button>
```

:::tip 반환값은 토스트 id
모든 `toast.*` 호출은 토스트 **id(`string | number`)** 를 반환합니다. 이 id로 나중에 갱신(로딩→완료)하거나 특정 토스트만 닫을 수 있습니다. (아래 [수동 닫기](#위치--지속시간--수동-닫기) 참고)
:::

---


## 종류 — success / error / warning / info / loading
---

상태별 헬퍼를 쓰면 종류에 맞는 **아이콘이 자동으로** 붙습니다. 아이콘 세트는 scaffold의 `sonner.tsx` 에서 [lucide](https://lucide.dev/) 아이콘으로 정의되어 있습니다.

---
<img src="../assets/ui/toast-kind.png" alt="toast 종류" width="80%" />
```tsx
toast.success('결제가 완료되었습니다.');
toast.error('결제에 실패했습니다.');
toast.warning('잔액이 부족합니다.');
toast.info('새 버전이 배포되었습니다.');

// loading 은 보통 수동으로 닫거나(promise로 대체) id 로 갱신한다
const id = toast.loading('업로드 중…');
// …작업 완료 후 같은 id 로 갱신
toast.success('업로드 완료', { id });
```

**scaffold `sonner.tsx` 가 지정한 종류별 아이콘**

| 종류 | 헬퍼 | 아이콘 (lucide) |
| --- | --- | --- |
| 성공 | `toast.success` | `CircleCheckIcon` |
| 정보 | `toast.info` | `InfoIcon` |
| 경고 | `toast.warning` | `TriangleAlertIcon` |
| 오류 | `toast.error` | `OctagonXIcon` |
| 로딩 | `toast.loading` | `Loader2Icon` (회전 애니메이션) |

:::info 아이콘을 바꾸려면
개별 토스트만 바꾸려면 옵션에 `icon`을 넘기고(`toast.success('완료', { icon: <MyIcon /> })`), 앱 전역으로 세트를 바꾸려면 `sonner.tsx` 의 `<Toaster icons={{ ... }}>` 를 수정합니다.
:::



---


## description (부가 설명)
---

제목 아래에 한 줄 설명을 덧붙입니다. **제목은 짧게**, 자세한 내용은 `description` 으로 분리하세요.

```tsx
toast.success('이체가 완료되었습니다.', {
  description: '홍길동님께 30,000원을 보냈어요. · 오후 2:31',
});
```

* `description` 은 문자열뿐 아니라 `ReactNode` 도 받습니다.
* 제목만으로 의미가 충분하면 굳이 넣지 않아도 됩니다.

---


## action · cancel 버튼
---

토스트 안에 버튼을 넣어 **'실행 취소' 같은 후속 동작**을 제공합니다. 되돌릴 수 있는 작업(삭제 등)에 특히 유용합니다.

```tsx
toast('메일을 휴지통으로 옮겼습니다.', {
  action: {
    label: '실행 취소',
    onClick: () => toast.success('복구했습니다.'),
  },
  cancel: {
    label: '닫기',
    onClick: () => {},
  },
});
```

* `action` — 오른쪽에 뜨는 **주 실행 버튼**. `onClick` 에서 되돌리기 로직을 실행합니다.
* `cancel` — 보조 취소 버튼. 누르면 토스트가 닫힙니다.
* 두 버튼 모두 `{ label, onClick }` 형태입니다.

---


## toast.promise (비동기 진행 표시)
---

Promise 하나를 넘기면 **로딩 → 성공/실패**까지 토스트가 알아서 전환됩니다. API 호출 결과를 알릴 때 가장 자주 씁니다.

---
<img src="../assets/ui/toast-promise-demo.gif" alt="toast 비동기 진행 표시" width="80%" />
```tsx
toast.promise(uploadFile(), {
  loading: '정산 파일 업로드 중…',
  success: (data) => `${data.name} 업로드 완료`,
  error: '업로드 실패 — 잠시 후 다시 시도해 주세요.',
});
```

* `loading` — Promise 가 pending 인 동안 표시.
* `success` — resolve 되면 표시. **함수로 주면 resolve 값**을 받아 메시지를 만들 수 있습니다.
* `error` — reject 되면 표시. 마찬가지로 함수로 reject 사유를 받을 수 있습니다.



---


## 위치 · 지속시간 · 수동 닫기
---

`position` 으로 노출 위치를, `duration` 으로 유지 시간을(`Infinity` 면 자동으로 안 닫힘), `toast.dismiss` 로 수동 닫기를 제어합니다.

```tsx
// 위치 지정 (개별 토스트)
toast('상단 중앙에 표시', { position: 'top-center' });

// 오래 유지 (10초) / 자동으로 안 닫힘
toast('10초간 유지', { duration: 10000 });
toast.warning('직접 닫아야 사라짐', { duration: Infinity });

// 수동 닫기 — id 를 잡아 닫거나, 전체 닫기
const id = toast.loading('처리 중…');
toast.dismiss(id);   // 특정 토스트만
toast.dismiss();     // 떠 있는 모든 토스트
```

* `position` 값: `top-left` · `top-center` · `top-right` · `bottom-left` · `bottom-center` · `bottom-right`.
* 개별 토스트가 아니라 **앱 전체 기본 위치**를 바꾸려면 `sonner.tsx` 의 `<Toaster position="..." />` 를 지정합니다.
* `duration: Infinity` 를 준 토스트는 반드시 `dismiss` 하거나 사용자가 닫을 수 있게(action/closeButton) 해 주세요.

---


## API 레퍼런스
---

### 메서드

`toast` 는 함수이자 네임스페이스입니다. 모든 메서드는 토스트 id(`string | number`)를 반환하며, 이 id로 갱신·닫기를 할 수 있습니다.

| 메서드 | 설명 |
| --- | --- |
| `toast(msg, opts?)` | 기본 토스트 |
| `toast.success / error / warning / info(msg, opts?)` | 상태별 토스트(아이콘 자동) |
| `toast.loading(msg, opts?)` | 로딩 토스트 — 보통 id 갱신 또는 `promise` 로 대체 |
| `toast.promise(promise, { loading, success, error })` | 비동기 진행/결과 자동 전환 |
| `toast.custom(jsx, opts?)` | 콘텐츠 전체를 직접 그리는 커스텀 토스트 |
| `toast.dismiss(id?)` | id 지정 시 해당 토스트, 생략 시 전체 닫기 |

### 옵션 (두 번째 인자)

모든 `toast.*` 메서드의 두 번째 인자로 넘기는 옵션들입니다.

| 옵션 | 타입 | 설명 |
| --- | --- | --- |
| `description` | `ReactNode` | 제목 아래 부가 설명 |
| `duration` | `number` | 유지(ms). 기본 4000, `Infinity` 면 자동으로 안 닫힘 |
| `position` | `'top-left' \| 'top-center' \| …` | 노출 위치(개별 지정) |
| `action` | `{ label, onClick }` | 오른쪽 실행 버튼 |
| `cancel` | `{ label, onClick }` | 취소 버튼 |
| `closeButton` | `boolean` | 닫기(X) 버튼 표시 |
| `icon` | `ReactNode` | 아이콘 커스텀(기본 아이콘 대체) |
| `id` | `string \| number` | 같은 id로 다시 호출하면 갱신(로딩→완료) |
| `onDismiss / onAutoClose` | `(toast) => void` | 닫힘 / 자동닫힘 콜백 |

> 전체 옵션·`<Toaster>` prop은 [Sonner 공식 문서](https://sonner.emilkowal.ski/)를 참고하세요. 위 표는 실무에서 자주 쓰는 것만 정리한 것입니다.

---


## 접근성 / 키보드
---

Sonner 기반이라 접근성이 기본 내장되어 있습니다. 별도 설정 없이 아래가 동작합니다.

| 키 | 동작 |
| --- | --- |
| `F6` | 토스트 영역으로 포커스 이동 |
| `Tab` | 토스트 안 버튼(action/cancel/close) 간 이동 |
| `Enter` / `Space` | 포커스된 버튼 실행 |

* 토스트 컨테이너는 `aria-live` 영역으로 렌더되어, **스크린리더가 새 토스트를 자동으로 읽습니다.**
* 마우스를 올리거나 포커스가 들어오면 **자동 닫힘 타이머가 멈춥니다**(사용자가 읽는 중 사라지지 않음).
* 중요한 확인이 필요한 토스트는 `duration: Infinity` + `action`/`closeButton` 으로 **사용자가 명시적으로 닫게** 하세요.

---


## 스타일링 & 테마 (퍼블리셔 가이드)
---

토스트는 **다른 컴포넌트와 스타일 변경 방식이 다릅니다.** 반드시 먼저 읽어주세요.

:::caution 아코디언·체크박스처럼 "페이지 옆 *.module.css" 로는 못 바꿉니다
토스트는 **앱 전역에 하나뿐인 `<Toaster/>` 싱글톤**이 화면 밖(`<body>`)으로 **portal** 해서 그립니다. 그래서 특정 페이지에만 스코프되는 CSS Module로는 "이 화면의 토스트만" 다르게 만들 수 없습니다. 방법은 아래 두 갈래입니다.
:::

### 방법 A — 기본 토스트를 "전역"으로 손보기 (색·간격·라운드 등 가벼운 변경)

Sonner의 기본 토스트는 CSS 변수와 `data-*` 훅을 노출합니다. scaffold의 `sonner.tsx` 가 **모든 토스트에 `.cn-toast` 클래스**를 붙여두었으니, **전역 CSS**(예: `src/assets/styles/` 아래 파일)에서 이 훅들을 잡아 덮어쓰면 됩니다. 페이지 옆 `module.css` 가 아니라 **전역**이라는 점만 주의하세요.

| 훅(선택자/변수) | 대상 |
| --- | --- |
| `.cn-toast` | `sonner.tsx` 가 모든 토스트에 부여한 공용 클래스 |
| `[data-sonner-toast]` | 개별 토스트 박스 |
| `[data-type="success\|error\|…"]` | 종류별 분기 |
| `[data-title] / [data-description]` | 제목 / 설명 영역 |
| `[data-icon] / [data-button]` | 아이콘 / 액션 버튼 |
| `--normal-bg / --normal-text / --normal-border` | 기본 배경/글자/테두리(`sonner.tsx` 가 앱 토큰에 연결) |
| `--border-radius` | 토스트 모서리 둥글기(= `var(--radius)`) |

```css
/* src/assets/styles/…/toast.css — 전역(NOT module.css)
   sonner가 body로 portal 하므로 전역 CSS로 잡는다. */

/* 모든 토스트 공통 — sonner.tsx 가 붙인 .cn-toast 클래스 */
.cn-toast {
  border-radius: 14px;
  box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.25);
  font-weight: 500;
}

/* 성공만 톤 바꾸기 */
[data-sonner-toast][data-type='success'] {
  --normal-bg: #ecfdf5;
  --normal-text: #065f46;
  --normal-border: #a7f3d0;
}

/* 다크 모드는 앱 규칙(.dark)에 맞춰 */
:global(.dark) [data-sonner-toast][data-type='success'] {
  --normal-bg: #052e26;
  --normal-text: #6ee7b7;
  --normal-border: #134e4a;
}
```

:::tip 종류별 색을 손쉽게 — richColors
색을 종류별로 확 넣고 싶으면 개별 CSS 대신 `<Toaster richColors />` 옵션도 고려하세요(`sonner.tsx` 에서 지정).
:::

### 방법 B — 완전히 다른 디자인이면 `toast.custom` + co-located module.css (권장)

톤앤매너가 통째로 바뀌는 브랜드 토스트라면, Sonner 기본 골격을 억지로 덮어쓰지 말고 `toast.custom(() => <MyToast/>)` 로 **콘텐츠 DOM을 직접 소유**하세요. 그러면 그 컴포넌트 바로 옆에 `*.module.css` 를 두는 **이 프로젝트의 co-location 규칙이 그대로 성립**합니다(포털 안에서도 컴포넌트가 붙인 className 은 정상 동작). 아래 [실전 예제](#실전-예제) 두 개가 정확히 이 방식입니다.

```tsx
import { toast } from '@axiom/components/ui';
import PaymentCompleteToast from '…/toast/PaymentCompleteToast';

toast.custom((id) => (
  <PaymentCompleteToast
    merchant="스타벅스 강남점"
    amount={5600}
    onClose={() => toast.dismiss(id)}
  />
));
```

:::tip 어느 방법을 고를까
* 색·라운드·그림자 등 **가벼운 조정** → **방법 A**(전역 CSS + `.cn-toast` / `data-*` 훅).
* 레이아웃·구조가 완전히 다른 **브랜드 토스트** → **방법 B**(`toast.custom` + co-located `module.css`).
:::

---


## 실전 예제
---

scaffold 예제 화면(`src/domains/example/pages/ui-components/ToastComponent.tsx`)에서 쓰는, `toast.custom` 기반 커스텀 토스트 두 가지입니다. **같은 기법이지만 `*.module.css` 만 바꿔** 톤앤매너와 동작을 완전히 다르게 입혔습니다.

### 1. 결제 완료 토스트 (자동 닫힘)

토스(toss) 계열 민트/그린 톤의 결제 완료 카드입니다. 스타일은 컴포넌트 바로 옆 `PaymentCompleteToast.module.css` 로 분리(co-location)했고, **퍼블리셔는 `.tsx` 를 건드리지 않고 `.module.css` 만 수정**하면 됩니다.

**포인트**

* `toast.custom((id) => <PaymentCompleteToast … />)` 로 토스트 내부 DOM 전체를 컴포넌트가 소유합니다.
* 닫기 버튼은 호출부에서 `onClose={() => toast.dismiss(id)}` 로 주입합니다 — 카드는 표현만, 로직은 호출부.
* 색·그림자·둥글기는 전부 `.module.css` 의 CSS 변수(`--pc-*`)로 관리하고, 다크 모드는 `:global(.dark)` 로 토큰만 교체합니다.



---
<img src="../assets/ui/toast-real1.png" alt="toast 실전예제 결제 완료" width="80%" />
```tsx title="호출부 — toast.custom 으로 띄우기"
toast.custom(
  (id) => (
    <PaymentCompleteToast
      merchant="스타벅스 강남점"
      amount={5600}
      time="오후 2:31"
      onDetail={() => {
        toast.dismiss(id);
        toast.info('상세 내역 화면으로 이동합니다.');
      }}
      onClose={() => toast.dismiss(id)}
    />
  ),
  { duration: 6000 },
);
```

<details>
<summary><b>PaymentCompleteToast.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/toast/PaymentCompleteToast.tsx"
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import styles from './PaymentCompleteToast.module.css';

export interface IPaymentCompleteToastProps {
  merchant: string; // 가맹점(결제처) 이름
  amount: number; // 결제 금액(원)
  time?: string; // 결제 시각 표기(예: '오후 2:31')
  onDetail?: () => void; // '상세 보기' 클릭
  onClose?: () => void; // 닫기(X) — 보통 toast.dismiss(id) 를 넘긴다
}

/**
 * "결제 완료" 브랜드 토스트 카드.
 * toast.custom(() => <PaymentCompleteToast/>) 으로 렌더되어 내부 DOM 전체를 이 .tsx 가 소유한다.
 * 스타일은 co-location 규칙 그대로 바로 옆 PaymentCompleteToast.module.css 로 분리.
 */
export default function PaymentCompleteToast({
  merchant,
  amount,
  time,
  onDetail,
  onClose,
}: IPaymentCompleteToastProps): React.ReactNode {
  return (
    <div className={styles.card} role="status">
      <span className={styles.icon}>
        <CheckCircle2 size={20} />
      </span>

      <div className={styles.body}>
        <div className={styles.head}>
          <span className={styles.title}>결제가 완료되었어요</span>
          {time && <span className={styles.time}>{time}</span>}
        </div>
        <div className={styles.desc}>
          <span className={styles.merchant}>{merchant}</span>
          <span className={styles.dot}>·</span>
          <span className={styles.amount}>{amount.toLocaleString('ko-KR')}원</span>
        </div>

        <button type="button" className={styles.detail} onClick={onDetail}>
          상세 내역 보기
          <ChevronRight size={14} />
        </button>
      </div>

      <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
        <X size={15} />
      </button>
    </div>
  );
}
```

</details>

<details>
<summary><b>PaymentCompleteToast.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/toast/PaymentCompleteToast.module.css"
.card {
  /* 이 예제 전용 색 토큰 — 토스 계열 민트/그린 */
  --pc-brand: #10b981;
  --pc-brand-deep: #059669;
  --pc-icon-bg: #e7f8f0;
  --pc-bg: #ffffff;
  --pc-border: #eaf1ee;
  --pc-ink: #0f1f1a;
  --pc-sub: #5b6b64;
  --pc-amount: #0f766e;
  --pc-detail: #059669;
  --pc-detail-bg: #f0faf5;

  width: 356px;
  max-width: calc(100vw - 32px);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding: 15px 15px 15px 14px;
  background: var(--pc-bg);
  border: 1px solid var(--pc-border);
  border-radius: 16px;
  box-shadow:
    0 12px 32px -12px rgba(15, 118, 110, 0.28),
    0 2px 6px rgba(0, 0, 0, 0.05);
  color: var(--pc-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --pc-brand: #34d399;
  --pc-icon-bg: #0e2a22;
  --pc-bg: #14201c;
  --pc-border: #24352f;
  --pc-ink: #eafaf3;
  /* … 이하 동일 패턴 */
}

/* 왼쪽 성공 아이콘 */
.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--pc-icon-bg);
  color: var(--pc-brand-deep);
}

.title {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.amount {
  font-weight: 800;
  color: var(--pc-amount);
  white-space: nowrap;
}

/* 상세 보기 링크 버튼 / 닫기 버튼 … (이하 생략) */
```

</details>

### 2. 보안 경고 토스트 (확인형 · 자동으로 안 닫힘)

앞선 결제 완료와 **똑같은 `toast.custom` 방식**이지만, `SecurityAlertToast.module.css` 만 바꿔 **위험(레드) 톤**으로 완전히 다르게 입혔습니다. 자동으로 닫히지 않고(`duration: Infinity`) 사용자가 '차단' 또는 '내가 맞아요'를 눌러야 사라지는 **확인형** 토스트입니다.

**포인트**

* 버튼의 실제 처리(토스트 닫기 + 후속 토스트)는 카드가 아니라 **호출부(페이지)에서 주입**합니다 — 재사용 컴포넌트의 기본 원칙.
* `role="alertdialog"` + `duration: Infinity` 로, 사용자가 결정하기 전에는 사라지지 않게 합니다.
* 같은 기법인데도 `.module.css` 색 토큰(`--sa-*`)만으로 결제 카드와 전혀 다른 톤이 나옵니다.

---
---
<img src="../assets/ui/toast-real2.png" alt="toast 실전예제 보안 경고" width="80%" />
```tsx title="호출부 — 확인형(duration: Infinity)"
toast.custom(
  (id) => (
    <SecurityAlertToast
      location="서울, 대한민국"
      device="Windows · Chrome"
      time="방금 전"
      onApprove={() => {
        toast.dismiss(id);
        toast.success('이 기기를 신뢰 기기로 등록했어요.');
      }}
      onBlock={() => {
        toast.dismiss(id);
        toast.error('접속을 차단하고 비밀번호 변경을 안내했어요.');
      }}
    />
  ),
  { duration: Infinity },
);
```

<details>
<summary><b>SecurityAlertToast.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/toast/SecurityAlertToast.tsx"
import { ShieldAlert } from 'lucide-react';
import styles from './SecurityAlertToast.module.css';

export interface ISecurityAlertToastProps {
  location: string; // 접속 위치(예: '서울, 대한민국')
  device: string; // 접속 기기/브라우저(예: 'Windows · Chrome')
  time?: string; // 접속 시각 표기(예: '방금 전')
  onApprove?: () => void; // '내가 맞아요'(승인) 클릭
  onBlock?: () => void; // '차단하기' 클릭
}

/**
 * "새 기기 로그인 감지" 보안 경고 토스트.
 * PaymentCompleteToast 와 동일한 toast.custom 방식이지만 module.css 만 바꿔 위험(레드) 톤 + 확인형 동작.
 * 두 버튼의 실제 처리는 호출부(페이지)에서 주입한다 — 카드는 표현만, 로직은 호출부.
 */
export default function SecurityAlertToast({
  location,
  device,
  time,
  onApprove,
  onBlock,
}: ISecurityAlertToastProps): React.ReactNode {
  return (
    <div className={styles.card} role="alertdialog" aria-label="새 기기 로그인 감지">
      <div className={styles.top}>
        <span className={styles.icon}>
          <ShieldAlert size={20} />
        </span>
        <div className={styles.body}>
          <div className={styles.title}>새 기기에서 로그인했어요</div>
          <div className={styles.desc}>본인이 맞는지 확인해 주세요. 모르는 접속이면 즉시 차단하세요.</div>

          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>위치</dt>
              <dd>{location}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>기기</dt>
              <dd>{device}</dd>
            </div>
            {time && (
              <div className={styles.metaRow}>
                <dt>시각</dt>
                <dd>{time}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.block} onClick={onBlock}>
          차단하기
        </button>
        <button type="button" className={styles.approve} onClick={onApprove}>
          내가 맞아요
        </button>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>SecurityAlertToast.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/toast/SecurityAlertToast.module.css"
.card {
  /* 이 예제 전용 색 토큰 — 위험(레드) 톤 */
  --sa-danger: #e11d48;
  --sa-danger-deep: #be123c;
  --sa-icon-bg: #fdecef;
  --sa-bg: #ffffff;
  --sa-border: #f3dfe3;
  --sa-ink: #1f1215;
  --sa-sub: #6b5257;
  --sa-meta-bg: #faf5f6;
  --sa-block-bg: #e11d48;
  --sa-approve-border: #e6d4d8;

  width: 372px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--sa-bg);
  border: 1px solid var(--sa-border);
  border-radius: 16px;
  box-shadow:
    0 14px 34px -14px rgba(225, 29, 72, 0.3),
    0 2px 6px rgba(0, 0, 0, 0.05);
  color: var(--sa-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .card {
  --sa-danger: #fb7185;
  --sa-icon-bg: #2c1418;
  --sa-bg: #1c1416;
  --sa-border: #382427;
  --sa-ink: #fbe9ec;
  /* … 이하 동일 패턴 */
}

/* 하단 액션: 차단(강조) / 승인 */
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.block {
  border: none;
  background: var(--sa-block-bg);
  color: #ffffff;
  box-shadow: 0 6px 16px -6px rgba(225, 29, 72, 0.5);
}
.approve {
  border: 1.5px solid var(--sa-approve-border);
  background: transparent;
}

/* 아이콘 / 메타 정보 박스 … (이하 생략) */
```

</details>

:::tip 두 예제를 비교해 보세요
같은 `toast.custom` 으로 [결제 완료](#1-결제-완료-토스트-자동-닫힘)(민트·자동 닫힘)와 [보안 경고](#2-보안-경고-토스트-확인형--자동으로-안-닫힘)(레드·확인형·`Infinity`)가 나옵니다. **Sonner 기본 골격은 손대지 않고** ①`toast.custom` 으로 콘텐츠 소유 ②`.module.css` 색 토큰 ③`duration` 등 옵션만 바꾼 결과입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---


## 참고 링크
---

* [Sonner 공식 문서](https://sonner.emilkowal.ski/) — 전체 API·옵션
* [shadcn/ui — Sonner](https://ui.shadcn.com/docs/components/sonner) — 설치·패턴
* scaffold 실제 구현: `src/shared/lib/shadcn/ui/sonner.tsx`
* scaffold 예제 화면: `src/domains/example/pages/ui-components/ToastComponent.tsx`

---
