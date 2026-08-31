---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Switch"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Switch 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-switch--docs"
  title="Switch 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Switch 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 스위치(토글) 컴포넌트입니다.  
**켜짐 / 꺼짐 두 가지 상태를 즉시 전환**하는 입력에 사용합니다.

**언제 쓰나요?**

* 알림, 다크모드, 자동이체처럼 **바꾸는 즉시 적용되는 설정**을 켜고 끌 때
* 저장 버튼 없이 **조작하는 순간 반영**되어야 하는 on/off 옵션
* 폼 안에서 `name` / `value` 로 **불리언 값을 제출**해야 하는 경우

> 서로 배타적인 항목 중 **하나만** 골라야 한다면 라디오/Select를, 제출 버튼을 눌러야 반영되는 **선택 항목**이라면 Checkbox를 씁니다. 아래 [Switch vs Checkbox](#switch-vs-checkbox--무엇을-쓸까) 참고.

---


## Switch vs Checkbox — 무엇을 쓸까?
---

둘 다 on/off 값을 다루지만 쓰임새가 다릅니다. **바꾸는 순간 적용**되면 Switch, **제출해야 적용**되면 Checkbox입니다.

| 비교 항목 | Switch | Checkbox |
| --- | --- | --- |
| 의미 | 기능을 켜다 / 끄다 | 항목을 고르다 / 동의하다 |
| 반영 시점 | 조작 즉시 반영 (저장 버튼 없음) | 보통 제출(submit) 시 반영 |
| 상태 수 | 2가지 (on / off) | 3가지 가능 (on / off / indeterminate) |
| 그룹 사용 | 항목마다 독립 — 그룹 개념 없음 | 여러 개 묶어 다중 선택 |
| 대표 사용처 | 알림 설정, 다크모드, 자동이체 사용 여부 | 약관 동의, 관심 카테고리, 목록 선택 |
| 구현 베이스 | radix-ui Switch | radix-ui Checkbox |

Checkbox 사용법은 [Checkbox 문서](./checkbox-component)를 참고하세요.

---


## Import
---

```tsx
import { Switch, Label } from '@axiom/components/ui';
```

Switch는 **단일 컴포넌트**입니다. Accordion처럼 여러 파트를 조합하지 않으며, 설명 텍스트를 붙일 때는 `Label`을 함께 씁니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/switch.tsx`(Radix `Switch` 기반)이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---


## 기본 사용법
---

아무 prop 없이 쓰면 **꺼진 상태로 시작하는 비제어(uncontrolled)** 스위치입니다. `defaultChecked`로 초기값을 켤 수 있습니다.

---
<img src="../assets/ui/switch-basic.png" alt="switch 기본 사용법" width="80%" />

```tsx
{/* 꺼진 상태로 시작 */}
<Switch />

{/* 켜진 상태로 시작 (비제어) */}
<Switch defaultChecked />
```

접근성을 위해 **레이블과 함께 쓰는 것이 기본**입니다. `Switch`에 `id`를, `Label`에 같은 값의 `htmlFor`를 주면 라벨 텍스트를 눌러도 토글됩니다.

---
<img src="../assets/ui/switch-label.png" alt="switch 라벨 사용법" width="80%" />

```tsx
// id + htmlFor 로 연결 — 라벨을 눌러도 토글됨
<div className="flex items-center gap-2">
  <Switch id="wifi" defaultChecked />
  <Label htmlFor="wifi">Wi-Fi 자동 연결</Label>
</div>

// 설명문이 필요하면 세로로 배치
<div className="flex items-start gap-3">
  <Switch id="save-data" className="mt-1" />
  <div>
    <Label htmlFor="save-data">데이터 절약 모드</Label>
    <p className="text-xs text-gray-500">이미지를 저화질로 불러옵니다.</p>
  </div>
</div>
```

:::info 클릭 영역은 이미 넓혀져 있습니다
트랙 내부에 `after:-inset-x-3 after:-inset-y-2` 로 **투명한 확장 히트 영역**이 깔려 있습니다. 보이는 크기는 작아도 실제 터치/클릭 영역은 그보다 넓으므로, 클릭이 어렵다고 크기를 억지로 키울 필요는 없습니다. (이 `::after` 는 컴포넌트가 이미 쓰고 있으니 CSS로 덮어쓰지 마세요 — [스타일링](#3-세밀한-교체--data-slot--css-module) 참고.)
:::

---


## 상태 관리 — 비제어 / 제어
---

다른 폼 컴포넌트와 동일하게 **비제어(uncontrolled)** 와 **제어(controlled)** 두 방식을 지원합니다.

### 1. 비제어 — `defaultChecked`

초기값만 지정하고 이후 상태는 컴포넌트가 알아서 관리합니다. 폼 제출 시점에만 값이 필요하다면 이걸로 충분합니다.

```tsx
<Switch defaultChecked />
```

### 2. 제어 — `checked` + `onCheckedChange`

켜짐 상태를 화면 로직(다른 UI 활성화, 값 연동 등)과 엮어야 하면 제어 모드를 씁니다.

---
<img src="../assets/ui/switch-control.png" alt="switch 제어 사용법" width="80%" />

```tsx
import { useState } from 'react';

function Example() {
  const [airplane, setAirplane] = useState(false);

  return (
    <>
      <Switch
        id="airplane"
        // highlight-start
        checked={airplane}
        onCheckedChange={setAirplane}
        // highlight-end
      />
      <Label htmlFor="airplane">비행기 모드</Label>

      {/* onCheckedChange 는 boolean 을 그대로 넘겨준다 */}
      <button onClick={() => setAirplane((v) => !v)}>토글</button>
    </>
  );
}
```

:::tip `onCheckedChange`의 인자는 `boolean`입니다
Checkbox와 달리 Switch의 `onCheckedChange` 인자는 순수 `boolean` 입니다(중간 상태가 없음). 그래서 `setAirplane`을 **그대로 넘겨도** 타입이 맞습니다.
:::

`checked`를 넘기는 순간 제어 모드가 되므로, `onCheckedChange`로 상태를 갱신하지 않으면 **클릭해도 아무 변화가 없습니다.**


---


## 크기 — `size`
---

`size` prop으로 두 가지 크기를 제공합니다. scaffold가 추가한 prop입니다.

* `size="default"` *(기본)* — 트랙 32×18.4px, 손잡이 16px
* `size="sm"` — 트랙 24×14px, 손잡이 12px. 표 안이나 조밀한 목록에 사용

---
<img src="../assets/ui/switch-size.png" alt="switch 사이즈 사용법" width="80%" />

```tsx
<Switch defaultChecked />              {/* size="default" (기본) */}
<Switch size="sm" defaultChecked />    {/* 작은 크기 */}
```

---


## 비활성화 — `disabled`
---

`disabled`를 주면 조작할 수 없고 흐리게(`opacity-50` + `cursor-not-allowed`) 표시됩니다. 트랙에는 `data-disabled` 속성이 붙습니다.

```tsx
<div className="flex items-center gap-2">
  <Switch id="d1" disabled />
  <Label htmlFor="d1">해외 결제 허용 (권한 없음)</Label>
</div>

<div className="flex items-center gap-2">
  <Switch id="d2" disabled defaultChecked />
  <Label htmlFor="d2">필수 보안 알림 (해제 불가)</Label>
</div>
```

* **레이블도 함께 흐려야** 시각적으로 자연스럽습니다. `Label`을 쓰면 `peer-disabled:` 규칙이 이미 들어 있으므로, Switch를 `peer`로 두고 그 **뒤에** 레이블을 배치하면 자동으로 흐려집니다.

---


## 폼 연동
---

`name`을 주면 Radix가 폼 전송용 숨은 `<input>`을 함께 렌더하므로 일반 폼 제출에 그대로 참여합니다.

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    console.log(Object.fromEntries(fd.entries()));
    // 켜짐 → { marketing: 'on' }  /  꺼짐 → 키 없음
  }}
>
  <Switch id="f-marketing" name="marketing" />
  <Label htmlFor="f-marketing">마케팅 정보 수신 동의</Label>

  {/* value 를 주면 'on' 대신 그 값이 전송된다 */}
  <Switch id="f-newsletter" name="newsletter" value="yes" defaultChecked />

  <Button type="submit">제출</Button>
</form>
```

* 꺼진 스위치는 **아예 전송되지 않습니다**(HTML 표준 동작). 서버에서 `undefined`를 `false`로 해석하세요.
* `value`를 생략하면 `"on"`이 전송됩니다.
* `required`를 주면 꺼진 상태로 제출 시 브라우저 기본 검증에 걸립니다.

---


## API 레퍼런스
---

Radix Switch 기반이라 아래 표에 없는 Radix 표준 prop과 `<button>` 속성도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `size` | `"default" \| "sm"` | `"default"` | **scaffold 확장** — 트랙/손잡이 크기 프리셋 |
| `checked` | `boolean` | — | 켜짐 여부(제어). `onCheckedChange`와 함께 사용 |
| `defaultChecked` | `boolean` | `false` | 초기 켜짐 여부(비제어) |
| `onCheckedChange` | `(checked: boolean) => void` | — | 값이 바뀔 때 호출되는 콜백 |
| `disabled` | `boolean` | `false` | 비활성화 — 조작 불가 + 흐리게 표시 |
| `required` | `boolean` | `false` | 폼 제출 시 반드시 켜져 있어야 함 |
| `name` | `string` | — | 폼 전송용 이름(hidden input 자동 생성) |
| `value` | `string` | `"on"` | 켜졌을 때 전송되는 값 |
| `aria-invalid` | `boolean \| "true" \| "false"` | — | 유효성 오류 표시(테두리·링 변경) |
| `id` | `string` | — | `Label`의 `htmlFor`와 연결할 식별자 |
| `className` | `string` | — | 트랙에 적용될 추가 클래스(`cn`으로 병합) |

---


## 접근성 / 키보드
---

Radix 기반이라 ARIA 속성과 키보드 조작이 기본 내장되어 있습니다.

| 키 | 동작 |
| --- | --- |
| `Space` / `Enter` | 포커스된 스위치 토글 |
| `Tab` / `Shift+Tab` | 다음 / 이전 초점 요소로 이동 |

* 루트는 `role="switch"` 와 `aria-checked`(`true` / `false`)를 자동으로 노출합니다.
* 포커스 링은 디자인 토큰 `--ring`을 따릅니다(`focus-visible:ring-3`).
* 레이블 연결(`htmlFor` / `aria-label`)은 **직접 해야 합니다.** 아무것도 없으면 스크린리더가 "스위치"라고만 읽습니다. 텍스트 레이블을 둘 수 없는 자리라면 최소한 `aria-label`을 주세요.

---


## 스타일링 & 테마
---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 크기(2단계 프리셋) | **`size` prop** (`"default"` / `"sm"`) |
| 색(트랙·손잡이·포커스 링) | **디자인 토큰**(`--primary`, `--input`, `--ring`, `--destructive`) |
| 이 인스턴스만 색·크기 소폭 조정 | **`className`** (Tailwind 유틸리티 오버라이드) |
| 겉모습 전체 교체 / 상태별 스타일 | **`data-slot` 선택자 + CSS Module** |

### 1. 색은 디자인 토큰으로

Switch 전용 색 변수는 없습니다. 켜짐 트랙은 `--primary`, 꺼짐 트랙은 `--input`, 오류는 `--destructive`, 포커스 링은 `--ring`을 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요.

### 2. 인스턴스 단위 조정 — `className`

켜짐/꺼짐 색은 `data-[state=checked]` / `data-[state=unchecked]` 변형으로 덮어씁니다. 손잡이(thumb)는 자식이라 `className`이 닿지 않으므로 `**:data-[slot=switch-thumb]:` 로 파고듭니다.

---
<img src="../assets/ui/switch-color.png" alt="switch 색 변경 사용법" width="80%" />

```tsx
{/* 켜졌을 때 색만 바꾸기 */}
<Switch defaultChecked className="data-[state=checked]:bg-emerald-500" />

{/* 꺼졌을 때 색까지 바꾸기 */}
<Switch
  defaultChecked
  className="data-[state=checked]:bg-rose-500 data-[state=unchecked]:bg-rose-200"
/>

{/* 크기를 키우려면 트랙과 손잡이(thumb)를 같이 바꾼다.
    - 손잡이는 자식이라 **:data-[slot=switch-thumb]: 로 파고든다
    - 트랙을 키운 만큼 켜짐 위치(translate-x)도 다시 지정해야 한다
    - 크기 기본값은 data-[size=...] 로 걸려 명시도가 높으므로 뒤에 ! 를 붙여 !important 로 덮는다 */}
<Switch
  defaultChecked
  className="h-6! w-11! data-[state=checked]:bg-indigo-600
    **:data-[slot=switch-thumb]:size-5!
    **:data-[slot=switch-thumb]:data-[state=checked]:translate-x-5.5!
    **:data-[slot=switch-thumb]:data-[state=unchecked]:translate-x-0.5!"
/>
```


:::tip className이 길어지면 CSS Module로
스타일 변경 폭이 이 정도를 넘어가면(트랙 안 글자, 완전히 다른 톤앤매너 등) `className`을 늘이지 말고 **`*.module.css`로 분리**하세요. 아래 3번과 [실전 예제](#실전-예제)가 그 방법입니다.
:::

### 3. 세밀한 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 **`data-slot`** 을 CSS Module에서 오버라이드합니다.

| data-slot | 대상 | 기본 크기 |
| --- | --- | --- |
| `[data-slot="switch"]` | 트랙(바깥 알약) | default 32×18.4px / sm 24×14px |
| `[data-slot="switch-thumb"]` | 손잡이(움직이는 원) | default 16px / sm 12px |

상태는 Radix가 붙이는 속성으로 구분합니다.

| 속성 | 값 |
| --- | --- |
| `data-state` | `"checked"` / `"unchecked"` |
| `data-size` | `"default"` / `"sm"` |
| `data-disabled` | 비활성 시 존재(값 없는 속성) |
| `aria-invalid` | 유효성 오류 시 존재 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */

/* 트랙 */
.wrap :global([data-slot='switch']) {
  width: 52px;
  height: 30px;
  background: #d8d4cc;          /* 꺼짐 */
}
.wrap :global([data-slot='switch'])[data-state='checked'] {
  background: #f59e0b;          /* 켜짐 */
}

/* 손잡이 — 트랙을 키웠으니 이동 거리도 다시 지정한다 */
.wrap :global([data-slot='switch-thumb']) {
  width: 26px;
  height: 26px;
  transition: translate 0.2s ease;
}
.wrap :global([data-slot='switch'])[data-state='unchecked'] :global([data-slot='switch-thumb']) {
  translate: 2px 0;
}
.wrap :global([data-slot='switch'])[data-state='checked'] :global([data-slot='switch-thumb']) {
  translate: 24px 0;   /* 52 - 26 - 2 */
}
```

:::caution 트랙 크기를 바꾸면 손잡이 이동 거리도 반드시 함께 바꿉니다
기본 컴포넌트는 켜졌을 때 `translate-x-[calc(100%-2px)]` 로 손잡이를 미는데, 트랙/손잡이 크기를 바꾸면 이 값이 맞지 않습니다. CSS Module에서는 반드시 **`translate` 프로퍼티**(`translate: 24px 0`)로 쓰세요.

Tailwind v4의 `translate-x-*` 는 `transform` 이 아닌 `translate` 프로퍼티를 사용하므로, `transform: translateX(...)` 로 쓰면 덮어쓰기가 아니라 **두 이동이 합산되어 손잡이가 트랙 밖으로 튀어나갑니다.**
:::

:::caution `::after` 는 건드리지 마세요
트랙의 `::after` 는 컴포넌트가 이미 **터치 영역 확장**(`after:-inset-x-3 after:-inset-y-2`)에 쓰고 있습니다. 트랙 안에 글자를 넣는 등 가상 요소가 필요하면 `::before` 를 쓰세요(아래 [보안 설정 예제](#2-보안-설정--저장-버튼형) 참고). CSS Module 배치·명시도 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제
---

제공 `Switch`를 **그대로 쓰되** `*.module.css`로 완전히 다른 톤을 입혀, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 두 예제 모두 **컴포넌트(.tsx)는 손대지 않고** `data-slot` 오버라이드만으로 서로 다른 디자인을 만들었습니다. 전체 소스는 scaffold의 예제 컴포넌트(`src/domains/example/components/ui-components/switch/`)에 있습니다.

### 1. 알림 설정 — 즉시 저장형

설정 화면에서 가장 흔한 패턴입니다. 맨 위 **마스터 스위치를 끄면 하위 항목이 모두 잠깁니다.** iOS 설정 앱 스타일의 큰 앰버 토글로 재스타일링했습니다.

---
<img src="../assets/ui/switch-real.png" alt="switch 알림설정 실전 예제" width="80%" />

**포인트**

* 제공 `Switch` / `Label` 을 그대로 쓰고, 32×18px 기본 토글을 `*.module.css`에서 52×30px 알약으로 재스타일링했습니다.
* 마스터의 `checked` 값은 하위 값들로부터 **파생하지 않고 별도 상태**로 둡니다 — 껐다 다시 켰을 때 개별 설정이 복원되어야 하기 때문입니다.
* 변경은 **즉시 저장**됩니다(저장 버튼 없음). 이것이 Switch의 전형적 UX입니다.

<details>
<summary><b>NotificationSettingsSwitch.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/switch/NotificationSettingsSwitch.tsx"
import { useId, useState } from 'react';
import { Switch, Label } from '@axiom/components/ui';
import { BellRing, MessageSquareText, Mail, Smartphone } from 'lucide-react';
import styles from './NotificationSettingsSwitch.module.css';

/** 알림 설정 한 줄 */
interface INotiItem {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  child?: boolean;   // 마스터 스위치가 꺼지면 함께 잠기는 항목인지
  disabled?: boolean;
}

const ITEMS: INotiItem[] = [
  { key: 'push', title: '앱 푸시 알림', desc: '입출금 · 결제 승인 내역을 실시간으로 받습니다.', icon: <Smartphone size={17} />, child: true },
  { key: 'sms', title: 'SMS 알림', desc: '건당 20원의 통신 요금이 부과될 수 있습니다.', icon: <MessageSquareText size={17} />, child: true },
  { key: 'email', title: '이메일 리포트', desc: '매월 1일 지난달 지출 리포트를 보내드립니다.', icon: <Mail size={17} />, child: true },
  { key: 'marketing', title: '마케팅 정보 수신', desc: '약관 개정 전까지 변경할 수 없습니다.', icon: <BellRing size={17} />, child: true, disabled: true },
];

export default function NotificationSettingsSwitch(): React.ReactNode {
  const uid = useId();
  // 마스터는 하위 값에서 파생하지 않고 별도 상태로 둔다(껐다 켜면 개별 설정 복원)
  // highlight-next-line
  const [master, setMaster] = useState(true);
  const [values, setValues] = useState<Record<string, boolean>>({
    push: true, sms: false, email: true, marketing: false,
  });

  const onCount = master ? ITEMS.filter((it) => values[it.key]).length : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <div className={styles.title}>알림 설정</div>
          <div className={styles.subtitle}>
            {master ? `${ITEMS.length}개 중 ${onCount}개 사용 중` : '전체 알림이 꺼져 있습니다'}
          </div>
        </div>

        {/* 마스터 스위치 — 강조된 배너 형태 */}
        <div className={`${styles.master} ${master ? styles.masterOn : ''}`}>
          <span className={styles.masterIcon}><BellRing size={18} /></span>
          <span className={styles.masterBody}>
            <Label htmlFor={`${uid}-master`} className={styles.masterTitle}>전체 알림</Label>
            <span className={styles.masterDesc}>끄면 아래 알림이 모두 잠깁니다.</span>
          </span>
          {/* highlight-next-line */}
          <Switch id={`${uid}-master`} checked={master} onCheckedChange={setMaster} />
        </div>

        {/* 개별 항목 리스트 */}
        <ul className={styles.list}>
          {ITEMS.map((it) => {
            const id = `${uid}-${it.key}`;
            const locked = !master || it.disabled;
            return (
              <li key={it.key} className={`${styles.row} ${locked ? styles.rowLocked : ''}`}>
                <span className={styles.rowIcon}>{it.icon}</span>
                <span className={styles.rowBody}>
                  <Label htmlFor={id} className={styles.rowTitle}>{it.title}</Label>
                  <span className={styles.rowDesc}>{it.desc}</span>
                </span>
                {/* 마스터가 꺼지면 잠금(disabled) */}
                // highlight-next-line
                <Switch id={id} checked={master && values[it.key]} disabled={locked}
                  onCheckedChange={(v) => setValues((prev) => ({ ...prev, [it.key]: v }))} />
              </li>
            );
          })}
        </ul>

        <div className={styles.footnote}>변경 사항은 즉시 저장됩니다.</div>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>NotificationSettingsSwitch.module.css</b> — 스타일링 소스 보기 (슬롯 오버라이드 발췌)</summary>

```css title="src/domains/example/components/ui-components/switch/NotificationSettingsSwitch.module.css"
.wrap {
  --ns-brand: #f59e0b;  /* 앰버 톤 색 토큰(일부 발췌) */
  --ns-off: #d8d4cc;
  --ns-thumb: #ffffff;
  color: #2e2410;
}
/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap { --ns-brand: #fbbf24; --ns-off: #3f3a31; /* … */ }

/* =========================================================================
 * scaffold Switch 슬롯 오버라이드 — 여기가 핵심
 * (래퍼 + 슬롯을 겹쳐 Tailwind 유틸리티보다 명시도(0,4,0 > 0,3,0) 확보)
 * ========================================================================= */

/* 트랙: 기본 32×18.4px → 52×30px 알약 */
.wrap :global([data-slot='switch']) {
  width: 52px;
  height: 30px;
  flex: none;
  background: var(--ns-off);
  border: none;
  transition: background 0.22s ease, box-shadow 0.22s ease;
}
/* radix 상위 버전 호환을 위해 data-state / data-checked 둘 다 건다 */
.wrap :global([data-slot='switch'])[data-state='checked'],
.wrap :global([data-slot='switch'])[data-checked] {
  background: var(--ns-brand);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
}
.wrap :global([data-slot='switch'])[data-disabled] {
  opacity: 0.45; cursor: not-allowed; box-shadow: none;
}

/* 손잡이: 기본 16px → 26px. ⚠ transform 이 아니라 translate 프로퍼티로 지정 */
.wrap :global([data-slot='switch-thumb']) {
  width: 26px;
  height: 26px;
  background: var(--ns-thumb);
  transition: translate 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.wrap :global([data-slot='switch'])[data-state='unchecked'] :global([data-slot='switch-thumb']),
.wrap :global([data-slot='switch'])[data-unchecked] :global([data-slot='switch-thumb']) {
  translate: 2px 0;
}
.wrap :global([data-slot='switch'])[data-state='checked'] :global([data-slot='switch-thumb']),
.wrap :global([data-slot='switch'])[data-checked] :global([data-slot='switch-thumb']) {
  translate: 24px 0;
}

/* … 시트/마스터 배너/리스트 레이아웃 스타일은 원본 파일 참고 … */
```

</details>

### 2. 보안 설정 — 저장 버튼형

앞선 알림 설정과 **똑같은 Switch**를 쓰지만, `*.module.css`만 바꿔 **트랙 안에 ON / OFF 글자가 들어가는 인디고 톤**으로 만들었습니다. 동작 면에서도 즉시 저장이 아니라, **저장 전 값(draft)과 저장된 값(saved)을 나눠 들고** 변경 여부·되돌리기·위험 경고까지 처리합니다.

---
<img src="../assets/ui/switch-real2.png" alt="switch 보안 설정 실전 예제" width="80%" />

**포인트**

* 알림 설정과 **동일한 컴포넌트**를 쓰고, 트랙 안 ON/OFF 글자까지 `::before` 가상 요소로 만들었습니다(`::after` 는 컴포넌트가 이미 사용 중이라 피함).
* 저장 전(`draft`)과 저장 후(`saved`) 값을 나눠 들어 **변경 여부(`dirty`)** 를 계산하고, 위험 항목(`risky`)이 꺼지면 경고 배너를 노출합니다.
* `Switch` 외에 `Label` · `Button` 도 전부 scaffold 제공 컴포넌트를 그대로 씁니다.

<details>
<summary><b>SecuritySettingSwitch.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/switch/SecuritySettingSwitch.tsx"
import { useId, useState } from 'react';
import { Switch, Label, Button } from '@axiom/components/ui';
import { Globe2, Clock4, Fingerprint, ShieldAlert } from 'lucide-react';
import styles from './SecuritySettingSwitch.module.css';

/** 보안 설정 한 건 */
interface ISecurityItem {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  risky?: boolean;   // 끄면 위험한 항목 — 끈 상태에서 경고 노출
}

const ITEMS: ISecurityItem[] = [
  { key: 'overseaIp', title: '해외 IP 접속 차단', desc: '국내 IP에서만 로그인할 수 있습니다.', icon: <Globe2 size={17} />, risky: true },
  { key: 'delayTransfer', title: '지연 이체 서비스', desc: '100만원 이상 이체 시 3시간 후에 입금됩니다.', icon: <Clock4 size={17} /> },
  { key: 'bio', title: '생체 인증 로그인', desc: '지문 · 얼굴 인식으로 로그인합니다.', icon: <Fingerprint size={17} /> },
];

type TValues = Record<string, boolean>;
const INITIAL: TValues = { overseaIp: true, delayTransfer: false, bio: true };

export default function SecuritySettingSwitch(): React.ReactNode {
  const uid = useId();
  // 저장된 값(saved)과 편집 중 값(draft)을 분리 → 변경 여부(dirty) 계산
  // highlight-start
  const [saved, setSaved] = useState<TValues>(INITIAL);
  const [draft, setDraft] = useState<TValues>(INITIAL);

  const dirty = ITEMS.some((it) => draft[it.key] !== saved[it.key]);
  const warned = ITEMS.filter((it) => it.risky && !draft[it.key]);
  // highlight-end

  return (
    <div className={styles.wrap}>
      <form className={styles.sheet} onSubmit={(e) => { e.preventDefault(); setSaved(draft); }}>
        <div className={styles.head}>
          <div className={styles.title}>보안 설정</div>
          <div className={styles.subtitle}>변경 후 하단의 저장 버튼을 눌러야 반영됩니다.</div>
        </div>

        <ul className={styles.list}>
          {ITEMS.map((it) => {
            const id = `${uid}-${it.key}`;
            const changed = draft[it.key] !== saved[it.key];
            return (
              <li key={it.key} className={`${styles.row} ${draft[it.key] ? styles.rowOn : ''}`}>
                <span className={styles.rowIcon}>{it.icon}</span>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitleLine}>
                    <Label htmlFor={id} className={styles.rowTitle}>{it.title}</Label>
                    {changed && <span className={styles.badge}>변경됨</span>}
                  </span>
                  <span className={styles.rowDesc}>{it.desc}</span>
                </span>
                {/* name 을 주면 폼 전송에도 그대로 참여한다 */}
                // highlight-next-line
                <Switch id={id} name={it.key} checked={draft[it.key]}
                  onCheckedChange={(v) => setDraft((prev) => ({ ...prev, [it.key]: v }))} />
              </li>
            );
          })}
        </ul>

        {warned.length > 0 && (
          <div className={styles.warning}>
            <ShieldAlert size={16} />
            <span><b>{warned.map((w) => w.title).join(', ')}</b> 이(가) 꺼져 있습니다. 계정 도용 위험이 높아질 수 있습니다.</span>
          </div>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(saved)}>
            되돌리기
          </Button>
          <Button type="submit" size="sm" disabled={!dirty}>
            {dirty ? '변경사항 저장' : '저장됨'}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

</details>

<details>
<summary><b>SecuritySettingSwitch.module.css</b> — 스타일링 소스 보기 (슬롯 오버라이드 발췌)</summary>

```css title="src/domains/example/components/ui-components/switch/SecuritySettingSwitch.module.css"
.wrap {
  --sc-brand: #4f46e5;      /* 인디고 톤 색 토큰(일부 발췌) */
  --sc-off-track: #cbd0e4;
  color: #14183a;
}
:global(.dark) .wrap { --sc-brand: #818cf8; --sc-off-track: #343a5c; /* … */ }

/* =========================================================================
 * scaffold Switch 슬롯 오버라이드 — 트랙 안에 ON/OFF 글자를 넣는 디자인
 * ========================================================================= */

/* 트랙: 기본 32×18.4px → 64×28px(글자 공간 확보) */
.wrap :global([data-slot='switch']) {
  position: relative;
  width: 64px;
  height: 28px;
  flex: none;
  border: none;
  border-radius: 999px;
  background: var(--sc-off-track);
  transition: background 0.2s ease;
}
.wrap :global([data-slot='switch'])[data-state='checked'],
.wrap :global([data-slot='switch'])[data-checked] { background: var(--sc-brand); }

/* 트랙 안 ON / OFF 글자 — ⚠ ::after 는 컴포넌트가 쓰므로 ::before 를 사용 */
.wrap :global([data-slot='switch'])::before {
  content: 'OFF';
  position: absolute;
  right: 9px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
  color: #ffffff; pointer-events: none;
}
.wrap :global([data-slot='switch'])[data-state='checked']::before,
.wrap :global([data-slot='switch'])[data-checked]::before {
  content: 'ON';
  right: auto; left: 11px;
}

/* 손잡이: 기본 16px → 22px. ⚠ transform 아닌 translate 프로퍼티로 지정 */
.wrap :global([data-slot='switch-thumb']) {
  width: 22px; height: 22px; background: #ffffff;
  transition: translate 0.2s ease;
}
.wrap :global([data-slot='switch'])[data-state='unchecked'] :global([data-slot='switch-thumb']),
.wrap :global([data-slot='switch'])[data-unchecked] :global([data-slot='switch-thumb']) {
  translate: 3px 0;
}
.wrap :global([data-slot='switch'])[data-state='checked'] :global([data-slot='switch-thumb']),
.wrap :global([data-slot='switch'])[data-checked] :global([data-slot='switch-thumb']) {
  translate: 39px 0;   /* 64 - 22 - 3 */
}

/* … 리스트/경고 배너/액션 버튼 레이아웃 스타일은 원본 파일 참고 … */
```

</details>

:::tip 두 예제를 비교해 보세요
같은 `Switch`로 [알림 설정](#1-알림-설정--즉시-저장형)(앰버·52×30·즉시 저장)과 [보안 설정](#2-보안-설정--저장-버튼형)(인디고·64×28·ON/OFF 글자·저장 버튼)이 나옵니다. **컴포넌트는 손대지 않고** ①`checked`/`disabled`/`name` 등 prop ②`data-slot` 오버라이드 ③주변 마크업만 바꾼 결과입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

---
