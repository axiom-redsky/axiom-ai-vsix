---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Checkbox"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Checkbox 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-checkbox--docs"
  title="Checkbox 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Checkbox 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 체크박스 컴포넌트입니다.  
**켜짐 / 꺼짐 두 상태를 전환**하거나, 목록에서 **여러 항목을 동시에 선택**할 때 사용합니다.

**언제 쓰나요?**

* 약관 동의, 알림 설정처럼 **하나의 옵션을 켜고 끄는** 경우
* 목록·테이블에서 **여러 건을 동시에 선택**하는 경우 (전체 선택 포함)
* 폼 안에서 `name` / `value` 로 **불리언 값을 제출**해야 하는 경우

> 서로 배타적인 항목 중 **하나만** 골라야 한다면 Checkbox가 아니라 라디오/Select를 씁니다. "즉시 적용되는 켜기/끄기"라면 Switch가 더 자연스럽습니다.

---


## Import
---

```tsx
import { Checkbox } from '@axiom/components/ui';
```

Checkbox는 **단일 컴포넌트**입니다. Accordion처럼 여러 파트를 조합하지 않고, 레이블은 `Label` 또는 일반 `<label>`과 함께 씁니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/checkbox.tsx`(Radix `Checkbox` 기반)이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---


## 기본 사용법
---

가장 단순한 형태입니다. 클릭 시 체크 표시(`CheckIcon`)가 나타납니다.

---
<img src="../assets/ui/checkbox-basic.png" alt="체크박스 기본 사용법" width="80%" />
```tsx
<Checkbox />
```

레이블과 함께 쓰는 것이 기본입니다. 방법은 두 가지입니다.

```tsx
// 1) label 로 감싸기 — 가장 간단, 텍스트를 눌러도 토글됨
<label className="flex items-center gap-2 cursor-pointer select-none">
  <Checkbox defaultChecked />
  <span className="text-sm">이용약관에 동의합니다</span>
</label>

// 2) id + htmlFor 로 연결 — 마크업이 떨어져 있을 때
<div className="flex items-center gap-2">
  <Checkbox id="terms" defaultChecked />
  <Label htmlFor="terms">이용약관에 동의합니다</Label>
</div>
```

:::tip 레이블은 반드시 연결하세요
Checkbox 자체는 `size-4`(16px)로 작아서, 레이블이 연결되어 있지 않으면 클릭 영역이 지나치게 좁고 스크린리더가 읽을 이름도 없습니다. 텍스트 레이블을 둘 수 없는 자리(테이블 셀 등)라면 최소한 `aria-label`을 주세요.

```tsx
<Checkbox aria-label="이 행 선택" />
```
:::

:::info 클릭 영역은 이미 넓혀져 있습니다
Checkbox 내부에 `after:-inset-x-3 after:-inset-y-2` 로 **투명한 확장 히트 영역**이 깔려 있습니다. 보이는 크기는 16px이지만 실제 터치/클릭 영역은 그보다 넓으므로, 클릭이 어렵다고 `size-*`를 키울 필요는 없습니다.
:::

---


## 상태 관리 — 비제어 / 제어
---

다른 폼 컴포넌트와 동일하게 **비제어(uncontrolled)** 와 **제어(controlled)** 두 가지 방식을 지원합니다.

### 1. 비제어 — `defaultChecked`

초기값만 지정하고, 이후 상태는 컴포넌트가 알아서 관리합니다. 폼 제출 시점에만 값이 필요하다면 이걸로 충분합니다.

```tsx
<Checkbox defaultChecked />
```

### 2. 제어 — `checked` + `onCheckedChange`

체크 상태를 화면 로직(버튼 활성화, 다른 필드 노출 등)과 엮어야 하면 제어 모드를 씁니다.

```tsx
import { useState } from 'react';

function Example() {
  const [checked, setChecked] = useState(false);

  return (
    <Checkbox
      // highlight-start
      checked={checked}
      onCheckedChange={(v) => setChecked(!!v)}
      // highlight-end
    />
  );
}
```

:::caution `onCheckedChange`의 인자는 `boolean`이 아닙니다
콜백 인자 타입은 `boolean | "indeterminate"` 입니다. `setChecked(v)`를 그대로 넘기면 타입 에러가 나거나 `'indeterminate'` 문자열이 상태에 들어갑니다. **`!!v` 로 불리언으로 좁혀서** 넘기세요.
:::

`checked`를 넘기는 순간 제어 모드가 되므로, `onCheckedChange`로 상태를 갱신하지 않으면 **클릭해도 아무 변화가 없습니다.**

---


## 3-상태 (indeterminate)
---

"전체 선택" 체크박스처럼 **일부만 선택된 중간 상태**가 필요할 때 `checked`에 문자열 `'indeterminate'`를 넘깁니다.

```tsx
const allChecked = selected.size === ITEMS.length;
const indeterminate = selected.size > 0 && !allChecked;

<Checkbox
  // highlight-next-line
  checked={allChecked ? true : indeterminate ? 'indeterminate' : false}
  onCheckedChange={toggleAll}
/>
```

* `indeterminate`는 **제어 모드 전용**입니다. `defaultChecked`로는 표현할 수 없습니다.
* 이 상태에서 루트에는 `data-state="indeterminate"`, `aria-checked="mixed"`가 붙습니다.
* 전체 선택 + 개별 선택을 묶은 완성 예제는 [실전 예제 1](#1-체크박스-그룹--전체-선택)을 참고하세요.

:::caution 중간 상태 아이콘은 직접 넣어야 합니다
현재 구현의 `Indicator`는 상태와 무관하게 항상 `CheckIcon`(✓)을 렌더합니다. 즉 `indeterminate`에서도 체크 표시가 그려집니다. 흔히 쓰는 **가로줄(－) 표시**가 필요하면 [스타일링](#4-중간-상태-를-가로줄로-바꾸기) 절의 CSS 방식으로 바꾸세요.
:::

---


## 비활성화 — `disabled`
---

```tsx
<Checkbox disabled />
<Checkbox disabled defaultChecked />
```

* 비활성 시 `opacity-50` + `cursor-not-allowed`가 적용되고, 클릭·키보드 조작이 모두 막힙니다.
* **레이블도 함께 흐려야** 시각적으로 자연스럽습니다. `Label`을 쓰면 `peer-disabled:` 규칙이 이미 들어 있으므로, Checkbox를 `peer`로 두고 그 **뒤에** 레이블을 배치하면 자동으로 흐려집니다.

```tsx
// Checkbox 가 앞(peer), Label 이 뒤 → peer-disabled 가 동작
<div className="flex items-center gap-2">
  <Checkbox id="opt" disabled />
  <Label htmlFor="opt">비활성 옵션</Label>
</div>
```

---


## 유효성 오류 — `aria-invalid`
---

"필수 약관 미동의"처럼 검증에 실패한 상태를 표시합니다.

```tsx
<Checkbox aria-invalid={!agreed} />
```

* `aria-invalid`가 켜지면 테두리가 `--destructive` 색으로 바뀌고 오류 링(`ring-3`)이 표시됩니다.
* 다만 **체크된 상태에서는 오류 테두리를 다시 primary로 되돌립니다**(`aria-invalid:aria-checked:border-primary`). "체크하면 오류가 해소된다"는 흐름을 그대로 반영한 동작입니다.
* 오류 사유 문구는 컴포넌트가 만들어 주지 않습니다. 아래처럼 **본문에 직접** 두고 `aria-describedby`로 연결하세요.

```tsx
<div className="flex items-start gap-2.5">
  <Checkbox
    id="terms"
    aria-invalid={!agreed}
    aria-describedby="terms-error"
    checked={agreed}
    onCheckedChange={(v) => setAgreed(!!v)}
  />
  <div>
    <Label htmlFor="terms">이용약관에 동의합니다</Label>
    {!agreed && (
      <p id="terms-error" className="text-xs text-destructive">
        이용약관에 동의하셔야 계속 진행할 수 있습니다.
      </p>
    )}
  </div>
</div>
```

---


## 폼 연동
---

Checkbox는 실제로는 `<button role="checkbox">`로 렌더되지만, **`name`을 주면 Radix가 숨은 `<input type="checkbox">`를 함께 렌더**하기 때문에 일반 폼 제출에 그대로 참여합니다.

```tsx
<form onSubmit={handleSubmit}>
  {/* 제출 시 marketing=on 으로 전송 */}
  <Checkbox name="marketing" defaultChecked />

  {/* value 로 전송 값을 바꿀 수 있음 */}
  <Checkbox name="plan" value="pro" />

  {/* 미체크 상태로 제출하면 브라우저 기본 검증에 걸림 */}
  <Checkbox name="terms" required />

  <button type="submit">제출</button>
</form>
```

* 체크 안 된 체크박스는 **아예 전송되지 않습니다**(HTML 표준 동작). 서버에서 `undefined`를 `false`로 해석하세요.
* `value`를 생략하면 `"on"`이 전송됩니다.
* React Hook Form 등과 함께 쓸 때는 `name`이 아니라 **제어 모드(`checked` + `onCheckedChange`)로 `Controller`에 연결**하는 편이 상태 추적이 명확합니다.

:::caution 버튼 안에 넣지 마세요
Checkbox의 루트는 `<button>`입니다. `AccordionTrigger`처럼 **다른 `<button>` 내부에 중첩하면 마크업이 깨집니다.** 아코디언 헤더에 체크박스를 나란히 두어야 한다면 트리거의 **형제**로 배치하고 그리드로 정렬하세요 — 자세한 패턴은 [Accordion 문서의 약관 동의 예제](./accordion-component#2-약관-동의-화면)에 정리되어 있습니다.
:::

---


## API 레퍼런스
---

Radix Checkbox 기반이라 아래 표에 없는 Radix 표준 prop과 `<button>` 속성도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `checked` | `boolean \| "indeterminate"` | — | 현재 체크 상태(제어). `onCheckedChange`와 함께 사용 |
| `defaultChecked` | `boolean` | `false` | 초기 체크 상태(비제어) |
| `onCheckedChange` | `(checked: boolean \| "indeterminate") => void` | — | 체크 상태 변경 콜백 |
| `disabled` | `boolean` | `false` | 비활성화 |
| `required` | `boolean` | `false` | 폼 필수 항목 |
| `name` | `string` | — | 폼 제출용 name. 지정 시 숨은 input이 함께 렌더됨 |
| `value` | `string` | `"on"` | 폼 제출 값 |
| `aria-invalid` | `boolean \| "true" \| "false"` | — | 유효성 오류 표시(테두리·링 변경) |
| `aria-label` | `string` | — | 텍스트 레이블이 없을 때의 접근성 이름 |
| `className` | `string` | — | 루트에 추가할 클래스 |

---


## 접근성 / 키보드
---

Radix 기반이라 ARIA 속성과 키보드 조작이 기본 내장되어 있습니다.

| 키 | 동작 |
| --- | --- |
| `Space` | 포커스된 체크박스 토글 |
| `Tab` / `Shift+Tab` | 다음 / 이전 초점 요소로 이동 |

* 루트는 `role="checkbox"` 와 `aria-checked`(`true` / `false` / `mixed`)를 자동으로 노출합니다.
* `Enter`는 **동작하지 않습니다.** 체크박스 표준은 `Space`이며, 폼 안에서 `Enter`는 제출로 동작합니다.
* 포커스 링은 디자인 토큰 `--ring`을 따릅니다(`focus-visible:ring-3`).
* 레이블 연결(`<label>` 감싸기 / `htmlFor` / `aria-label`)은 **직접 해야 합니다.** 셋 중 아무것도 없으면 스크린리더가 "체크박스"라고만 읽습니다.

---


## 스타일링 & 테마
---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 색(테두리·채움·포커스 링) | **디자인 토큰**(`--primary`, `--input`, `--ring`, `--destructive`) |
| 이 인스턴스만 크기·여백·모서리 | **`className`** |
| 겉모습 전체 교체 / 상태별 스타일 | **`data-slot` 선택자 + CSS Module** |

### 1. 색은 디자인 토큰으로

Checkbox 전용 색 변수는 없습니다. 체크 시 채움색은 `--primary`, 기본 테두리는 `--input`, 오류는 `--destructive`, 포커스 링은 `--ring`을 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요.

:::caution 체크 시 채움색이 안 먹는다면
`checkbox.tsx`의 체크 상태 클래스는 `data-checked:bg-primary` 형태(Base UI 규약)로 작성되어 있지만, 실제 구현은 **Radix** 기반이라 루트에 붙는 속성은 `data-state="checked"` 입니다. 즉 `data-checked:*` 클래스는 매칭되지 않아 **체크해도 배경이 채워지지 않을 수 있습니다.**

프로젝트 CSS에서 덮으려면 `[data-state='checked']`를 쓰세요. 근본 해결은 컴포넌트의 클래스를 `data-[state=checked]:*`로 바꾸는 것입니다.
:::

### 2. 인스턴스 단위 조정 — `className`

```tsx
// 크기 키우기 + 모서리 둥글게
<Checkbox className="size-5 rounded-md" />

// 설명 텍스트가 여러 줄일 때 첫 줄에 정렬
<Checkbox className="mt-0.5" />
```

### 3. 세밀한 교체 — `data-slot` + CSS Module

컴포넌트가 노출하는 슬롯을 CSS Module에서 오버라이드합니다.

| data-slot | 대상 |
| --- | --- |
| `[data-slot="checkbox"]` | 루트 버튼 |
| `[data-slot="checkbox-indicator"]` | 체크 표시가 들어가는 내부 영역 |

상태는 Radix가 루트에 붙이는 **`data-state`** 로 구분합니다.

| 속성 | 값 |
| --- | --- |
| `data-state` | `"checked"` / `"unchecked"` / `"indeterminate"` |
| `aria-checked` | `"true"` / `"false"` / `"mixed"` |
| `disabled` | 비활성 시 존재 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */
.wrap :global([data-slot='checkbox']) {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid var(--tc-line);
  transition: background 0.18s ease, border-color 0.18s ease;
}
.wrap :global([data-slot='checkbox'])[data-state='checked'] {
  border-color: var(--tc-brand);
  background: var(--tc-brand);
  color: #fff;
}
.wrap :global([data-slot='checkbox']):focus-visible {
  outline: 2px solid var(--tc-brand);
  outline-offset: 2px;
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot='checkbox']`처럼 **래퍼와 슬롯을 겹쳐서** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

### 4. 중간 상태(－)를 가로줄로 바꾸기

`Indicator`가 항상 ✓를 그리므로, `indeterminate`에서 체크 표시를 숨기고 가로줄을 덮어 그립니다.

```css
/* indeterminate 일 때 ✓ 숨기기 */
.wrap :global([data-slot='checkbox'])[data-state='indeterminate']
  :global([data-slot='checkbox-indicator']) svg {
  display: none;
}
/* 가로줄(－) 그리기 */
.wrap :global([data-slot='checkbox'])[data-state='indeterminate']::before {
  content: '';
  position: absolute;
  width: 60%;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}
```

루트에는 이미 `relative`가 있으므로 `::before`를 그대로 얹을 수 있습니다.

---


## 실전 예제
---

scaffold 예제 화면(`src/domains/example/pages/ui-components/CheckboxComponent.tsx`)에 있는 패턴입니다.

### 1. 체크박스 그룹 — 전체 선택

개별 선택 + 전체 선택(`indeterminate`)을 묶은, 가장 자주 쓰이는 구성입니다.

**포인트**

* 선택 항목은 `Set`으로 관리합니다. 개수 비교(`selected.size`)만으로 전체/중간 상태를 계산할 수 있습니다.
* 전체 선택 체크박스는 **파생 상태**입니다. 자체 state를 따로 두면 개별 항목과 어긋납니다.
* 개별 항목의 `onCheckedChange`는 인자를 쓰지 않고 `toggle(id)`만 호출합니다 — 현재 값은 이미 `selected`가 알고 있기 때문입니다.


---
<img src="../assets/ui/checkbox-group.png" alt="체크박스 그룹 예제" width="80%" />

<details>
<summary><b>CheckboxGroupDemo.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/CheckboxGroupDemo.tsx"
import { useState } from 'react';
import { Checkbox } from '@axiom/components/ui';

const DESKTOP_ITEMS = [
  { id: 'hard-disks', label: '하드 디스크' },
  { id: 'external-disks', label: '외장 디스크' },
  { id: 'cds-dvds', label: 'CD, DVD, iPod' },
  { id: 'connected-servers', label: '연결된 서버' },
] as const;

type ItemId = (typeof DESKTOP_ITEMS)[number]['id'];

export default function CheckboxGroupDemo(): React.ReactNode {
  const [selected, setSelected] = useState<Set<ItemId>>(
    new Set(['hard-disks', 'external-disks']),
  );

  const toggle = (id: ItemId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 전체/중간 상태는 별도 state 가 아니라 selected 에서 파생시킨다
  // highlight-start
  const allChecked = selected.size === DESKTOP_ITEMS.length;
  const indeterminate = selected.size > 0 && !allChecked;
  // highlight-end

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(DESKTOP_ITEMS.map((i) => i.id)));
  };

  return (
    <div className="p-5 space-y-3">
      {/* 전체 선택 — 일부만 선택되면 indeterminate */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        {/* highlight-next-line */}
        <Checkbox
          checked={allChecked ? true : indeterminate ? 'indeterminate' : false}
          onCheckedChange={toggleAll}
        />
        <span className="text-sm font-medium">전체 선택</span>
      </label>

      {/* 개별 항목 */}
      <div className="ml-1 pl-4 border-l-2 border-gray-100 space-y-2.5">
        {DESKTOP_ITEMS.map((item) => (
          <label key={item.id} className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => toggle(item.id)}
            />
            <span className="text-sm">{item.label}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-gray-500 pt-1">
        선택됨: {selected.size} / {DESKTOP_ITEMS.length}
      </p>
    </div>
  );
}
```

</details>

### 2. 설명이 딸린 옵션 (알림 설정)

체크박스 오른쪽에 **제목 + 보조 설명**을 두는 설정 화면 패턴입니다.

**포인트**

* 여러 줄 텍스트와 정렬을 맞추기 위해 `items-start` + 체크박스에 `mt-0.5`를 줍니다.
* `<label>`로 전체를 감싸면 설명 텍스트를 클릭해도 토글됩니다.

---
<img src="../assets/ui/checkbox-alam.png" alt="체크박스 알림 예제" width="80%" />
```tsx
const [notifEnabled, setNotifEnabled] = useState(true);

<label className="flex items-start gap-2.5 cursor-pointer select-none">
  {/* highlight-next-line */}
  <Checkbox
    className="mt-0.5"
    checked={notifEnabled}
    onCheckedChange={(v) => setNotifEnabled(!!v)}
  />
  <div>
    <p className="text-sm font-medium">알림 활성화</p>
    <p className="text-xs text-gray-500">언제든지 알림을 켜거나 끌 수 있습니다.</p>
  </div>
</label>
```

### 3. 약관 동의 화면

전체 동의 / 개별 체크 / 필수 미동의 시 CTA 비활성화까지 묶은 구성은 Accordion 문서에 전체 소스가 정리되어 있습니다.

* [Accordion — 약관 동의 화면](./accordion-component#2-약관-동의-화면)

Checkbox 관점에서 가져갈 점은 두 가지입니다.

* 체크박스를 `AccordionTrigger` **밖(형제)** 에 두어 `<button>` 중첩을 피합니다.
* 겉모습은 `[data-slot='checkbox']` + `[data-state='checked']` 오버라이드만으로 브랜드 톤에 맞춥니다. **컴포넌트를 복사해서 고치지 마세요.**

---
