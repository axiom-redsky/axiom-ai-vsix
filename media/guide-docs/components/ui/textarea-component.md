---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Textarea"
hide_table_of_contents: false
---

# Textarea 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **여러 줄 텍스트 입력** 컴포넌트입니다.
자기소개·문의 내용·메모처럼 **줄바꿈이 포함된 긴 문장**을 입력받을 때 사용합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Textarea`(`/example/ui-components/textarea`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 문의 내용·피드백·리뷰처럼 **길이를 예측할 수 없는 문장**을 받을 때
- 자기소개·메모·비고처럼 **줄바꿈이 의미를 갖는** 입력을 받을 때
- 글자 수 제한(`maxLength`)과 카운터를 함께 보여줘야 할 때

> 한 줄짜리 짧은 값(이름·이메일·검색어)이라면 Textarea가 아니라 [Input](./input-component)입니다. 정해진 값 중 하나를 고르는 입력이라면 [Select](./select-component) / [Combobox](./combobox-component)를 쓰세요.



---

## Import

---

```tsx
import { Textarea } from "@axiom/components/ui";
```

Textarea는 **단일 컴포넌트**입니다. Accordion처럼 여러 파트를 조합하지 않으며, 라벨은 `Label`(또는 일반 `<label>`)과 함께 씁니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/textarea.tsx`이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

:::info Radix가 아니라 순수 `<textarea>` 래퍼입니다
Textarea는 표준 HTML `<textarea>`에 기본 스타일(`className`)과 `data-slot="textarea"`만 얹은 **얇은 래퍼**입니다. 별도의 상태 관리나 합성 파트가 없으므로, 표준 `<textarea>`의 **모든 속성**(`value`·`onChange`·`placeholder`·`rows`·`maxLength`·`disabled`·`readOnly` 등)을 그대로 넘길 수 있습니다.

```tsx
// src/shared/lib/shadcn/ui/textarea.tsx (요약)
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input …",
        className,
      )}
      {...props} // 표준 textarea 속성이 전부 그대로 전달됨
    />
  );
}
```

:::

---

## 기본 사용법

---

`placeholder`만 지정한 가장 기본적인 형태입니다.

<img src="../assets/ui/textarea-basic.png" alt="Textarea 기본 사용법" width="80%" />

```tsx
<Textarea placeholder="내용을 입력하세요" />
```

기본 **최소 높이는 64px(`min-h-16`, 대략 두 줄)**, 너비는 부모에 꽉 차는 `w-full`입니다. 폭을 제한하려면 감싼 요소에서 `max-w-*`를 주세요.

```tsx
<div className="max-w-md">
  <Textarea placeholder="내용을 입력하세요" />
</div>
```

:::note 글자 크기가 화면 폭에 따라 바뀝니다
기본 스타일은 `text-base md:text-sm`입니다. 모바일(768px 미만)에서는 16px, 데스크톱에서는 14px로 렌더됩니다. **모바일에서 16px인 것은 의도된 동작**으로, iOS Safari가 16px 미만 입력 요소에 포커스할 때 화면을 확대하는 것을 막기 위함입니다.
:::

---

## 라벨과 함께 (접근성 필수)

---

Textarea는 라벨과 **연결**해서 쓰는 것이 기본입니다. `Label`의 `htmlFor`와 `Textarea`의 `id`를 같은 값으로 맞추면, **라벨을 클릭했을 때 입력창에 포커스**되고 스크린리더도 올바른 이름을 읽습니다.

<img src="../assets/ui/textarea-label.png" alt="Textarea 라벨 사용법" width="80%" />

```tsx
import { Textarea, Label } from "@axiom/components/ui";

<div className="grid gap-1.5">
  {/* highlight-start */}
  <Label htmlFor="bio">자기소개</Label>
  <Textarea id="bio" placeholder="간단한 자기소개를 작성해 주세요" />
  {/* highlight-end */}
</div>;
```

:::tip 라벨을 둘 수 없는 자리라면 `aria-label`
공간 제약으로 시각적 라벨을 두지 않는 경우에도, 스크린리더를 위해 최소한 `aria-label`은 주세요.

```tsx
<Textarea placeholder="메모" aria-label="메모" />
```

:::

---

## 높이 — `rows` 와 자동 확장(`field-sizing`)

---

Textarea의 높이는 **① 초기 높이(`rows`)** 와 **② 입력에 따른 확장(`field-sizing`)** 두 가지로 결정됩니다. 이 컴포넌트는 **자동 확장이 기본값**이라는 점이 일반 `<textarea>`와 가장 크게 다릅니다.

<img src="../assets/ui/textarea-rows.png" alt="Textarea rows 와 자동 높이" width="80%" />

### 1. 초기 높이 — `rows`

```tsx
{/* 6줄 높이로 시작 */}
<Textarea rows={6} placeholder="6줄 높이로 시작합니다" />
```

`rows`는 표준 속성 그대로 전달됩니다. 지정하지 않으면 `min-h-16`(64px)이 최소 높이가 됩니다.

### 2. 입력에 따른 자동 확장 — `field-sizing-content`

기본 클래스에 **`field-sizing-content`** 가 포함되어 있어, 내용이 길어지면 **내부 스크롤 대신 요소 높이가 늘어납니다.** 별도 코드(스크롤 높이 계산, `useRef` + `scrollHeight` 조작 등)가 필요 없습니다.

```tsx
{/* 입력이 늘어나면 높이가 따라 늘어납니다 — 추가 코드 불필요 */}
<Textarea placeholder="여러 줄을 입력해 보세요 — 높이가 따라 늘어납니다" />
```

- 늘어나는 **하한**은 `min-h-16`입니다. 상한을 두려면 `className="max-h-64"`처럼 최대 높이를 함께 주세요(초과분은 스크롤).
- 자동 확장이 **불필요한 화면**(고정 높이 레이아웃, 표 안의 입력 등)에서는 `field-sizing-fixed`로 되돌립니다.

```tsx
{/* 자동 확장 끄기 + 고정 높이 + 세로 리사이즈만 허용 */}
<Textarea
  placeholder="고정 높이"
  className="min-h-32 field-sizing-fixed resize-y"
/>
```

:::caution 브라우저 지원 확인
`field-sizing`은 **Chromium 계열(Chrome·Edge 123+)** 에서 동작하는 비교적 새로운 CSS 속성입니다. 미지원 브라우저에서는 이 선언이 **무시**되어 `rows`(또는 `min-h-16`) 기준 **고정 높이 + 내부 스크롤**로 동작합니다. 레이아웃이 깨지지는 않지만 **자동 확장은 되지 않습니다.**

대상 브라우저가 고정된 SI 환경이라면 도입 전에 지원 여부를 확인하고, 자동 확장이 **요건**이라면 `field-sizing-fixed` + 고정 높이(`min-h-*`)로 통일해 **모든 브라우저에서 같은 모습**이 되도록 맞추는 편이 안전합니다.
:::

---

## 리사이즈 핸들

---

Tailwind Preflight가 `textarea { resize: vertical }`을 적용하므로, 사용자는 **아래쪽 가장자리를 드래그해 세로로만** 크기를 조절할 수 있습니다(가로 확장 불가). 이 동작을 바꾸려면 `className`으로 덮어씁니다.

```tsx
{/* 리사이즈 완전 비활성 — 레이아웃을 사용자가 흐트러뜨릴 수 없게 */}
<Textarea placeholder="리사이즈 불가" className="resize-none" />

{/* 가로·세로 모두 허용 */}
<Textarea placeholder="자유 리사이즈" className="resize" />
```

| 클래스        | 동작                          |
| ------------- | ----------------------------- |
| _(기본값)_    | 세로만 (`resize: vertical`)   |
| `resize-none` | 리사이즈 비활성               |
| `resize-y`    | 세로만 (기본값을 명시적으로)  |
| `resize-x`    | 가로만                        |
| `resize`      | 가로·세로 모두                |

:::tip 자동 확장과 함께 쓸 때
`field-sizing-content`(자동 확장)와 리사이즈 핸들을 **둘 다 켜두면**, 사용자가 한 번 드래그하는 순간 높이가 그 값으로 고정되어 이후 자동 확장이 멈춘 것처럼 보입니다. 둘 중 하나만 쓰는 편이 예측 가능합니다 — **자동 확장을 쓸 거면 `resize-none`**, **수동 조절을 쓸 거면 `field-sizing-fixed`**.
:::

---

## Disabled / ReadOnly

---

둘 다 "수정 불가"지만 동작이 다릅니다.

- **`disabled`** — 입력·포커스·클릭을 **모두 막습니다.** `disabled:opacity-50` + `cursor-not-allowed`가 적용되고 배경이 흐려집니다(`disabled:bg-input/50`). 폼 제출 시 값이 **전송되지 않습니다.**
- **`readOnly`** — 포커스·선택·복사는 되지만 **값 수정만** 막습니다. 폼 제출 시 값은 **함께 전송**됩니다.

<img src="../assets/ui/textarea-state.png" alt="Textarea disabled / readOnly" width="80%" />

```tsx
<Textarea placeholder="비활성화" disabled />
<Textarea defaultValue="읽기 전용 내용입니다." readOnly />
```

:::note 읽기 전용 긴 본문에는 `readOnly`
약관 전문처럼 **내용을 스크롤해 읽어야 하는** 경우 `disabled`를 쓰면 포커스·스크롤·복사가 모두 막혀 사용성이 나빠집니다. 이때는 `readOnly`를 쓰세요.
:::

---

## 유효성 오류 — `aria-invalid`

---

`aria-invalid`를 주면 **에러 스타일(빨간 테두리 + 링)이 자동으로** 적용됩니다(`aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20`). 시각적 표시와 접근성을 한 번에 얻을 수 있습니다.

<img src="../assets/ui/textarea-validation.png" alt="Textarea 유효성 오류" width="80%" />

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="reason">사유</Label>
  {/* highlight-next-line */}
  <Textarea id="reason" aria-invalid defaultValue="너무 짧음" aria-describedby="reason-error" />
  <p id="reason-error" className="text-xs text-destructive">
    10자 이상 입력해야 합니다.
  </p>
</div>
```

- 오류 사유 문구는 컴포넌트가 만들어 주지 않습니다. 위처럼 **본문에 직접** 두고 `aria-describedby`로 연결하세요.
- 검증 라이브러리(React Hook Form 등)와 함께 쓸 때는 `aria-invalid={!!errors.reason || undefined}` 형태로 넘깁니다.

:::tip `false` 대신 `undefined`
`aria-invalid={false}`를 넘기면 DOM에 `aria-invalid="false"` 속성이 **남습니다.** CSS Module에서 `[aria-invalid]`(값 없는 존재 선택자)로 스타일링할 경우 정상 상태까지 걸릴 수 있으므로, 오류가 아닐 때는 `|| undefined`로 **속성 자체를 제거**하는 편이 안전합니다.
:::

---

## 상태 관리 — 비제어 / 제어

---

다른 폼 컴포넌트와 동일하게 **비제어(uncontrolled)** 와 **제어(controlled)** 두 방식을 지원합니다.

### 1. 비제어 — `defaultValue`

초기값만 지정하고 이후 값은 DOM이 관리합니다. 폼 제출 시점에만 값이 필요하면 이걸로 충분합니다.

```tsx
<Textarea defaultValue="기존에 저장된 메모입니다." />
```

### 2. 제어 — `value` + `onChange`

입력값을 화면 로직(글자 수 카운트, 버튼 활성화 등)과 엮어야 하면 제어 모드를 씁니다. Textarea에서 가장 흔한 조합은 **`maxLength` + 글자 수 카운터**입니다.

```tsx
import { useState } from "react";

function Example() {
  const [text, setText] = useState("");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="memo">메모 (최대 100자)</Label>
      <Textarea
        id="memo"
        // highlight-start
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        // highlight-end
        placeholder="메모를 입력하세요"
      />
      <p className="text-xs text-muted-foreground text-right">{text.length} / 100</p>
    </div>
  );
}
```

:::caution `value`를 넘기면 반드시 `onChange`도
`value`만 넘기고 `onChange`를 빼면 **입력해도 값이 바뀌지 않는** 읽기 전용 필드가 됩니다. 값은 항상 `e.target.value`로 꺼내세요.
:::

:::note `maxLength`는 "잘라내기"가 아니라 "막기"입니다
`maxLength`에 도달하면 브라우저가 **더 이상 입력을 받지 않습니다.** 붙여넣기도 한도까지만 들어가고 **나머지는 조용히 버려지므로**, 사용자는 왜 글이 잘렸는지 알 수 없습니다.

긴 글을 다루는 화면이라면 `maxLength`를 **실제 한도보다 약간 넉넉하게** 주고, 한도 초과는 **카운터 색상과 오류 문구로 안내**하는 편이 친절합니다. 아래 [실전 예제](#실전-예제--피드백-폼-css-module-리스타일)의 `maxLength={MAX_LENGTH + 20}`이 이 방식입니다.
:::

---

## 일반 `<textarea>` 태그와의 차이

---

제공 `Textarea`는 표준 `<textarea>`를 감싼 얇은 래퍼라 **속성은 100% 동일**하지만, 기본 룩앤필과 상태 스타일이 이미 들어 있습니다.

<img src="../assets/ui/textarea-native-diff.png" alt="제공 Textarea 와 일반 textarea 비교" width="80%" />

| 구분          | 제공 `<Textarea />`                                    | 일반 `<textarea>`                |
| ------------- | ------------------------------------------------------ | -------------------------------- |
| 기본 스타일   | 라운드·테두리·패딩·폰트 크기 내장                      | 브라우저 기본(각진 회색 테두리)  |
| 높이 동작     | `field-sizing-content` — 내용에 맞춰 자동 확장          | `rows`로 고정, 초과 시 내부 스크롤 |
| 포커스        | `focus-visible` 링(`ring-ring/50`) 자동                | 브라우저 기본 아웃라인           |
| 오류 상태     | `aria-invalid`만 주면 빨간 테두리·링 자동              | 직접 CSS 작성 필요               |
| 비활성        | 흐림·커서(`cursor-not-allowed`) 스타일 포함            | 브라우저 기본                    |
| 다크 모드     | 내장(`dark:bg-input/30` 등)                            | 직접 처리 필요                   |
| 속성          | `rows`·`maxLength`·`value`/`onChange` 등 **그대로 사용** | 동일                             |

:::tip 정리
**동작은 표준 `<textarea>` 그대로, 겉모습만 디자인 시스템에 맞춰진 것**이 제공 Textarea입니다. 그래서 기존 마크업의 `<textarea>`를 `<Textarea>`로 바꾸기만 해도 대부분 그대로 동작합니다.
:::

---

## API 레퍼런스

---

Textarea는 표준 `<textarea>`의 **모든 속성**을 그대로 받습니다. 아래 표에 없는 속성(`name`·`autoComplete`·`spellCheck`·`wrap`·`onBlur` 등)도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

| Prop           | 타입                          | 기본값  | 설명                                             |
| -------------- | ----------------------------- | ------- | ------------------------------------------------ |
| `value`        | `string`                      | —       | 현재 입력값(제어). `onChange`와 함께 사용        |
| `defaultValue` | `string`                      | —       | 초기 입력값(비제어)                              |
| `onChange`     | `(e) => void`                 | —       | 값 변경 콜백. `e.target.value`로 접근            |
| `placeholder`  | `string`                      | —       | 입력 전 안내 문구                                |
| `rows`         | `number`                      | —       | 초기 표시 줄 수(초기 높이)                       |
| `maxLength`    | `number`                      | —       | 최대 입력 글자 수(도달 시 입력 차단)             |
| `disabled`     | `boolean`                     | `false` | 입력·포커스 모두 비활성화(제출 제외)             |
| `readOnly`     | `boolean`                     | `false` | 값 수정만 막음(포커스·제출은 가능)               |
| `required`     | `boolean`                     | `false` | 폼 필수 항목(브라우저 기본 검증)                 |
| `aria-invalid` | `boolean \| "true" \| "false"` | —       | 유효성 오류 스타일(테두리·링 변경)               |
| `aria-label`   | `string`                      | —       | 시각적 라벨이 없을 때의 접근성 이름              |
| `className`    | `string`                      | —       | 기본 스타일 **뒤에 병합** — 스타일 커스터마이징  |

:::note `className`은 기본 스타일을 덮어씁니다
컴포넌트 내부에서 `cn(기본클래스, className)`으로 병합하므로, 넘긴 `className`이 **뒤에 와서 우선 적용**됩니다. 높이·모양·색을 바꿀 때 컴포넌트 코드를 고칠 필요가 없습니다([스타일링](#스타일링--테마) 참고).
:::

---

## 접근성 / 키보드

---

Textarea는 표준 `<textarea>`라 브라우저 기본 접근성·키보드 동작을 그대로 따릅니다.

| 키                | 동작                                            |
| ----------------- | ----------------------------------------------- |
| `Tab` / `Shift+Tab` | 다음 / 이전 초점 요소로 이동 (**들여쓰기 아님**) |
| 문자 키           | 값 입력                                         |
| `Enter`           | **줄바꿈** (폼 제출 아님)                       |
| `Ctrl/⌘ + Enter`  | 관례적인 "제출" 단축키 — **직접 구현 필요**     |

:::caution Input과 달리 `Enter`로 제출되지 않습니다
`<textarea>`에서 `Enter`는 줄바꿈입니다. 채팅 입력창처럼 `Enter` 제출이 필요하면 직접 처리해야 합니다.

```tsx
<Textarea
  onKeyDown={(e) => {
    // Enter = 제출, Shift+Enter = 줄바꿈
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }}
/>
```

한글·일본어 등 **IME 조합 중에도** `Enter` 이벤트가 발생합니다. 조합 확정용 `Enter`가 제출로 오인되지 않도록 `e.nativeEvent.isComposing`을 함께 확인하세요.
:::

- 라벨 연결(`htmlFor` / `<label>` 감싸기 / `aria-label`)은 **직접 해야 합니다.** 셋 중 아무것도 없으면 스크린리더가 필드 이름을 읽지 못합니다.
- 오류 상태는 `aria-invalid`로 표시하고, 오류 문구는 `aria-describedby`로 연결하면 스크린리더가 함께 읽습니다.
- 글자 수 카운터처럼 **실시간으로 바뀌는 안내**는 `aria-live="polite"` 영역에 두면 스크린리더 사용자도 남은 글자 수를 알 수 있습니다.
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다(`focus-visible:ring-3`).

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것                | 방법                                                     |
| -------------------------- | -------------------------------------------------------- |
| 색(테두리·포커스 링·오류)  | **디자인 토큰**(`--input`, `--ring`, `--destructive`)     |
| 이 인스턴스만 높이·모양·여백 | **`className`** (Tailwind 유틸리티)                      |
| 겉모습 전체 교체           | **`data-slot` 선택자 + CSS Module**                       |

### 1. 색은 디자인 토큰으로

Textarea 전용 색 변수는 없습니다. 기본 테두리는 `--input`, 포커스 링은 `--ring`, 오류는 `--destructive`를 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요(Textarea 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다).

### 2. 인스턴스 단위 조정 — `className` (Tailwind)

가장 자주 쓰는 방식입니다. `className`이 기본 스타일 뒤에 병합되므로 높이·모양·리사이즈 동작을 자유롭게 덮어씁니다.

<img src="../assets/ui/textarea-style.png" alt="Textarea 스타일 변경" width="80%" />

```tsx
{/* 고정 높이 + 세로 리사이즈만 허용 (자동 확장 끔) */}
<Textarea
  placeholder="고정 높이 (리사이즈 세로만)"
  className="min-h-32 resize-y field-sizing-fixed"
/>

{/* 리사이즈 불가 + 더 둥근 모서리 + 브랜드 색 포커스 */}
<Textarea
  placeholder="리사이즈 불가 · 라운드 · 티일 포커스"
  className="resize-none rounded-2xl focus-visible:border-teal-500 focus-visible:ring-teal-500/30"
/>
```

:::tip Textarea는 리스타일 빈도가 특히 높습니다
실제 프로젝트에서는 **컴포넌트 코드를 수정하지 말고** 위의 `className`(또는 아래 CSS Module)으로만 리스타일하세요. 컴포넌트를 복사해 고치면 이후 scaffold 업데이트를 따라가지 못합니다.
:::

### 3. 세밀한 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면, 컴포넌트가 노출하는 **`data-slot="textarea"`** 를 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                  | 대상                            |
| -------------------------- | ------------------------------- |
| `[data-slot="textarea"]`   | `<textarea>` 요소 (오직 하나)   |

오류 상태는 `[aria-invalid='true']`, 비활성은 `:disabled`로 구분합니다.

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */
.wrap :global([data-slot="textarea"]) {
  min-height: 140px;
  border-radius: 14px;
  border: 1.5px solid var(--border);
  /* 자동 확장을 끄고 고정 높이 + 수동 리사이즈로 되돌린다 */
  field-sizing: fixed;
  resize: vertical;
}
.wrap :global([data-slot="textarea"]):focus-visible {
  border-color: #14b8a6;
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
}
.wrap :global([data-slot="textarea"])[aria-invalid="true"] {
  border-color: var(--destructive);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot='textarea']`처럼 **래퍼와 슬롯을 겹쳐서** 명시도를 확보해야 안정적으로 덮어씁니다. 아래 실전 예제처럼 `className`에 CSS Module 클래스를 **직접 넘기는** 방식도 동일하게 동작합니다(`cn()`이 뒤에 병합하므로). CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---

## 실전 예제 — 피드백 폼 (CSS Module 리스타일)

---

제공 `Textarea` 컴포넌트는 **그대로 두고**, `className`에 `*.module.css` 클래스를 넘겨 전혀 다른 룩앤필(고정 높이 140px · 티일 포커스 글로우 · 수동 리사이즈 · 에러 상태 · 글자 수 카운터)을 입힌 예제입니다. 실제 SI 프로젝트에서 퍼블리셔가 Textarea 스타일을 바꾸는 **전형적인 방식**이므로, 아래 소스를 그대로 복사해 시작점으로 쓰세요.

<img src="../assets/ui/textarea-real-form.png" alt="Textarea 실전 예제 — 피드백 폼" width="100%" />

**포인트**

- 기본 컴포넌트의 `field-sizing-content`(자동 확장)를 CSS에서 **`field-sizing: fixed`로 되돌리고**, `resize: vertical`로 사용자가 직접 높이를 조절하게 바꿨습니다.
- 유효성 오류는 `aria-invalid` 속성으로 표현하고, CSS에서 `[aria-invalid='true']`로 스타일링합니다. 오류가 아닐 때는 `|| undefined`로 **속성 자체를 제거**합니다.
- `maxLength`는 실제 한도(300자)보다 **20자 넉넉하게** 주고, 초과분은 **카운터 색상 + 오류 문구**로 안내합니다(조용히 잘리지 않도록).
- 겉모습은 전부 `*.module.css`에서 오버라이드했고, **컴포넌트는 손대지 않았습니다.**

<details>
<summary><b>FeedbackForm.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/textarea/FeedbackForm.tsx"
import { useState } from "react";
import { Textarea } from "@axiom/components/ui";
import { CheckCircle2 } from "lucide-react";
import styles from "./FeedbackForm.module.css";

const CATEGORIES = ["서비스 개선", "버그 신고", "문의", "기타"] as const;
const MAX_LENGTH = 300;

/**
 * 실전 예제 — 고객 피드백 폼.
 *
 * 제공 Textarea(@axiom/components/ui) 를 그대로 쓰되, className 에 CSS Module 클래스를
 * 넘겨 shadcn 기본 스타일을 완전히 다른 톤(고정 높이 140px · 티일 포커스 글로우 · 수동 리사이즈)
 * 으로 덮어쓴다.
 */
export default function FeedbackForm(): React.ReactNode {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const trimmed = message.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 10;
  const isEmpty = trimmed.length === 0;
  const over = message.length > MAX_LENGTH;
  // 제출을 시도한 뒤(touched)에만 오류를 노출한다
  const invalid = touched && (isEmpty || tooShort || over);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isEmpty || tooShort || over) return;
    setSubmitted(true);
  };

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <h3 className={styles.title}>피드백 보내기</h3>
      <p className={styles.subtitle}>서비스를 개선할 수 있도록 의견을 들려주세요.</p>

      <div className={styles.fields}>
        {/* 카테고리 선택 칩 */}
        <div className={styles.field}>
          <span className={styles.label}>분류</span>
          <div className={styles.chips}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.chip} ${category === c ? styles.chipActive : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 내용 — 제공 Textarea + CSS Module 리스타일 */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="feedback-message">
            내용
          </label>
          {/* highlight-start */}
          <Textarea
            id="feedback-message"
            className={styles.textarea}
            placeholder="어떤 점이 좋았거나 불편했는지 자유롭게 작성해 주세요. (최소 10자)"
            value={message}
            maxLength={MAX_LENGTH + 20} // 한도보다 여유를 두고, 초과는 문구로 안내
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={invalid || undefined}
          />
          {/* highlight-end */}
          <div className={styles.meta}>
            {invalid && (
              <span className={styles.errorText}>
                {isEmpty
                  ? "내용을 입력해 주세요."
                  : tooShort
                    ? "10자 이상 입력해 주세요."
                    : "입력 가능한 글자 수를 초과했습니다."}
              </span>
            )}
            <span className={`${styles.counter} ${over ? styles.counterOver : ""}`}>
              {message.length} / {MAX_LENGTH}
            </span>
          </div>
        </div>

        <button type="submit" className={styles.submit}>
          피드백 제출
        </button>
      </div>

      {submitted && (
        <div className={styles.doneBanner}>
          <CheckCircle2 className="w-4 h-4" />
          {category} 피드백이 접수되었습니다. 감사합니다!
        </div>
      )}
    </form>
  );
}
```

</details>

<details>
<summary><b>FeedbackForm.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/textarea/FeedbackForm.module.css"
.card {
  width: 100%;
  max-width: 460px;
  padding: 28px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 30px -12px rgba(15, 23, 42, 0.15);
}

/* 다크 모드는 앱 규칙(.dark 클래스)에 맞춰 :global(.dark) 로 처리 */
:global(.dark) .card {
  background: #0f172a;
  border-color: #1e293b;
}

/*
 * 핵심: 제공 Textarea(min-h-16, rounded-lg, border-input, field-sizing-content …) 의
 * 기본 룩을 걷어내고 이 프로젝트 전용 톤(높이 140px 고정, 굵은 포커스 글로우, 수동 리사이즈)
 * 으로 완전히 교체한다. cn() 이 뒤에 오는 className 을 우선 적용하므로 아래 값들이 기본값을 덮어쓴다.
 */
.textarea {
  min-height: 140px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  font-size: 14px;
  line-height: 1.6;
  color: #0f172a;
  resize: vertical;
  /* highlight-next-line */
  field-sizing: fixed; /* 제공 컴포넌트의 자동 확장을 끄고 고정 높이로 되돌린다 */
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.textarea::placeholder {
  color: #94a3b8;
}

.textarea:focus-visible {
  outline: none;
  background: #ffffff;
  border-color: #14b8a6;
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
}

:global(.dark) .textarea {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

/* 에러 상태 — aria-invalid 속성으로 스타일링 */
/* highlight-start */
.textarea[aria-invalid="true"] {
  border-color: #ef4444;
  background: #fef2f2;
}
.textarea[aria-invalid="true"]:focus-visible {
  border-color: #ef4444;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
}
/* highlight-end */

/* 글자 수 카운터 + 에러 문구를 한 줄에 */
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.errorText {
  font-size: 12px;
  color: #ef4444;
}
.counter {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
}
.counterOver {
  color: #ef4444;
  font-weight: 600;
}

/* … 카테고리 칩(.chips/.chip/.chipActive) · 제출 버튼(.submit) · 완료 배너(.doneBanner) 는
     동일한 패턴으로 정의되어 있습니다. 전체 소스는 scaffold 파일을 확인하세요. */
```

</details>

:::tip 이 예제에서 가져갈 것
동작(입력·포커스·검증)은 표준 `<textarea>`에 맡기고, 바꾸는 건 ①`className`으로 넘기는 **CSS Module 클래스** ②`field-sizing: fixed`로 되돌린 **높이 정책** ③`aria-invalid` 속성뿐입니다. **컴포넌트를 복사해서 고치지 마세요.**
:::

---
