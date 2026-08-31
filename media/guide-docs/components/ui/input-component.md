---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Input"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Input 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-input--docs"
  title="Input 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Input 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 텍스트 입력 컴포넌트입니다.  
이메일·검색어·이름처럼 **한 줄짜리 짧은 문자열을 입력**받을 때 사용합니다.

**언제 쓰나요?**

* 이름·이메일·검색어처럼 **한 줄짜리 텍스트**를 받을 때
* `type`을 바꿔 **비밀번호·숫자·날짜·파일** 등 다양한 입력을 받을 때
* 폼 안에서 라벨·검증 문구와 함께 **사용자 데이터를 수집**할 때

> 여러 줄 문장을 받아야 한다면 `Input`이 아니라 `<textarea>`를, 정해진 값 중 하나를 고르는 입력이라면 `Select`/`Combobox`를 씁니다.

---


## Import
---

```tsx
import { Input } from '@axiom/components/ui';
```

Input은 **단일 컴포넌트**입니다. Accordion처럼 여러 파트를 조합하지 않으며, 라벨은 `Label`(또는 일반 `<label>`)과 함께 씁니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/input.tsx`이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

:::info Radix가 아니라 순수 `<input>` 래퍼입니다
Input은 표준 HTML `<input>`에 기본 스타일(`className`)과 `data-slot="input"`만 얹은 **얇은 래퍼**입니다. 별도의 상태 관리나 합성 파트가 없으므로, 표준 `<input>`의 **모든 속성**(`type`·`value`·`onChange`·`placeholder`·`disabled`·`readOnly`·`maxLength` 등)을 그대로 넘길 수 있습니다.

```tsx
// src/shared/lib/shadcn/ui/input.tsx (요약)
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn('h-8 w-full rounded-lg border border-input …', className)}
      {...props}   // 표준 input 속성이 전부 그대로 전달됨
    />
  );
}
```
:::

---


## 기본 사용법
---

`placeholder`만 지정한 가장 기본적인 형태입니다.

---
<img src="../assets/ui/input-basic.png" alt="Input 기본 사용법" width="80%" />

```tsx
<Input placeholder="이름을 입력하세요" />
```

기본 크기는 **높이 32px(`h-8`)**, 너비는 부모에 꽉 차는 `w-full`입니다. 폭을 제한하려면 감싼 요소에서 `max-w-*`를 주세요.

```tsx
<div className="max-w-sm">
  <Input placeholder="이름을 입력하세요" />
</div>
```

---


## 라벨과 함께 (접근성 필수)
---

Input은 라벨과 **연결**해서 쓰는 것이 기본입니다. `Label`의 `htmlFor`와 `Input`의 `id`를 같은 값으로 맞추면, **라벨을 클릭했을 때 입력창에 포커스**되고 스크린리더도 올바른 이름을 읽습니다.

---
<img src="../assets/ui/input-label.png" alt="Input 라벨 사용법" width="80%" />

```tsx
import { Input, Label } from '@axiom/components/ui';

<div className="grid gap-1.5">
  {/* highlight-start */}
  <Label htmlFor="email">이메일</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
  {/* highlight-end */}
</div>
```

:::tip 라벨을 둘 수 없는 자리라면 `aria-label`
검색창처럼 시각적 라벨을 두지 않는 경우에도, 스크린리더를 위해 최소한 `aria-label`은 주세요.

```tsx
<Input type="search" placeholder="검색어" aria-label="검색" />
```
:::

---


## Type 별 입력
---

`type` 속성은 표준 `<input>`에 그대로 전달됩니다. 하나의 컴포넌트로 비밀번호·숫자·날짜·검색·파일 등 다양한 입력을 표현할 수 있습니다.

---
<img src="../assets/ui/input-type.png" alt="Input 타입별 사용법" width="80%" />

```tsx
<Input type="password" placeholder="비밀번호" />
<Input type="number" placeholder="수량" />
<Input type="date" />
<Input type="search" placeholder="검색어" />
```

| type | 용도 |
| --- | --- |
| `text` *(기본)* | 일반 텍스트 |
| `email` | 이메일 (모바일 키보드 최적화·기본 검증) |
| `password` | 비밀번호 (입력 마스킹) |
| `number` | 숫자 (`min`·`max`·`step` 함께 사용) |
| `date` / `time` | 날짜·시간 피커 |
| `search` | 검색어 (일부 브라우저에서 지우기 버튼 표시) |
| `tel` / `url` | 전화번호·URL (모바일 키보드 최적화) |
| `file` | 파일 선택 → 아래 [File 입력](#file-입력) 참고 |

---


## File 입력
---

`type="file"`도 동일하게 지원합니다. 파일 선택 버튼 영역은 `file:` 접두 유틸리티로 별도 스타일링되어 있습니다(`file:h-6 file:border-0 file:bg-transparent file:text-sm …`).

---
<img src="../assets/ui/input-file.png" alt="Input 파일 사용법" width="80%" />

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="attachment">첨부파일</Label>
  <Input id="attachment" type="file" />
</div>
```

* 여러 파일을 받으려면 `multiple`, 특정 형식만 받으려면 `accept="image/*"` 등 표준 속성을 그대로 넘깁니다.
* 파일 입력값은 **읽기 전용**입니다(`value`로 제어 불가). 선택된 파일은 `onChange`의 `e.target.files`로 접근하세요.

---


## Disabled / ReadOnly
---

둘 다 "수정 불가"지만 동작이 다릅니다.

* **`disabled`** — 입력·포커스·클릭을 **모두 막습니다.** `disabled:opacity-50` + `cursor-not-allowed`가 적용되고 배경이 흐려집니다(`disabled:bg-input/50`).
* **`readOnly`** — 포커스·선택·복사는 되지만 **값 수정만** 막습니다. 폼 제출 시 값은 **함께 전송**됩니다(disabled는 전송 제외).

```tsx
<Input placeholder="비활성화" disabled />
<Input defaultValue="읽기 전용 값" readOnly />
```

---


## 유효성 오류 — `aria-invalid`
---

`aria-invalid`를 주면 **에러 스타일(빨간 테두리 + 링)이 자동으로** 적용됩니다(`aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20`). 시각적 표시와 접근성을 한 번에 얻을 수 있습니다.

---
<img src="../assets/ui/input-validation.png" alt="Input validation 사용법" width="80%" />

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="pw">비밀번호</Label>
  {/* highlight-next-line */}
  <Input id="pw" type="password" aria-invalid defaultValue="123" aria-describedby="pw-error" />
  <p id="pw-error" className="text-xs text-destructive">8자 이상 입력해야 합니다.</p>
</div>
```

* 오류 사유 문구는 컴포넌트가 만들어 주지 않습니다. 위처럼 **본문에 직접** 두고 `aria-describedby`로 연결하세요.
* 검증 라이브러리(React Hook Form 등)와 함께 쓸 때는 에러 여부를 `aria-invalid={!!errors.pw}` 형태로 넘기면 됩니다.

---


## 상태 관리 — 비제어 / 제어
---

다른 폼 컴포넌트와 동일하게 **비제어(uncontrolled)** 와 **제어(controlled)** 두 방식을 지원합니다.

### 1. 비제어 — `defaultValue`

초기값만 지정하고 이후 값은 DOM이 관리합니다. 폼 제출 시점에만 값이 필요하면 이걸로 충분합니다.

```tsx
<Input defaultValue="홍길동" />
```

### 2. 제어 — `value` + `onChange`

입력값을 화면 로직(글자 수 카운트, 버튼 활성화 등)과 엮어야 하면 제어 모드를 씁니다.

---
<img src="../assets/ui/input-control.png" alt="Input 컨트롤 사용법" width="80%" />
```tsx
import { useState } from 'react';

function Example() {
  const [text, setText] = useState('');

  return (
    <Input
      // highlight-start
      value={text}
      maxLength={20}
      onChange={(e) => setText(e.target.value)}
      // highlight-end
      placeholder="닉네임을 입력하세요"
    />
  );
}
```

:::caution `value`를 넘기면 반드시 `onChange`도
`value`만 넘기고 `onChange`를 빼면 **입력해도 값이 바뀌지 않는** 읽기 전용 필드가 됩니다. 값은 항상 `e.target.value`로 꺼내세요.
:::



---


## API 레퍼런스
---

Input은 표준 `<input>`의 **모든 속성**을 그대로 받습니다. 아래 표에 없는 속성(`name`·`min`·`max`·`step`·`autoComplete`·`pattern` 등)도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `type` | `string` | `"text"` | `text` · `email` · `password` · `number` · `date` · `file` · `search` 등 |
| `value` | `string` | — | 현재 입력값(제어). `onChange`와 함께 사용 |
| `defaultValue` | `string` | — | 초기 입력값(비제어) |
| `onChange` | `(e) => void` | — | 값 변경 콜백. `e.target.value`로 접근 |
| `placeholder` | `string` | — | 입력 전 안내 문구 |
| `disabled` | `boolean` | `false` | 입력·포커스 모두 비활성화(제출 제외) |
| `readOnly` | `boolean` | `false` | 값 수정만 막음(포커스·제출은 가능) |
| `maxLength` | `number` | — | 최대 입력 글자 수 |
| `required` | `boolean` | `false` | 폼 필수 항목(브라우저 기본 검증) |
| `aria-invalid` | `boolean \| "true" \| "false"` | — | 유효성 오류 스타일(테두리·링 변경) |
| `aria-label` | `string` | — | 시각적 라벨이 없을 때의 접근성 이름 |
| `className` | `string` | — | 기본 스타일 **뒤에 병합** — 스타일 커스터마이징 |

:::note `className`은 기본 스타일을 덮어씁니다
컴포넌트 내부에서 `cn(기본클래스, className)` 으로 병합하므로, 넘긴 `className`이 **뒤에 와서 우선 적용**됩니다. 크기·모양·색을 바꿀 때 컴포넌트 코드를 고칠 필요가 없습니다([스타일링](#스타일링--테마) 참고).
:::

---


## 접근성 / 키보드
---

Input은 표준 `<input>`이라 브라우저 기본 접근성·키보드 동작을 그대로 따릅니다.

| 키 | 동작 |
| --- | --- |
| `Tab` / `Shift+Tab` | 다음 / 이전 초점 요소로 이동 |
| 문자 키 | 값 입력 |
| `Enter` | 폼 안에서 제출(submit) |

* 라벨 연결(`htmlFor` / `<label>` 감싸기 / `aria-label`)은 **직접 해야 합니다.** 셋 중 아무것도 없으면 스크린리더가 필드 이름을 읽지 못합니다.
* 오류 상태는 `aria-invalid`로 표시하고, 오류 문구는 `aria-describedby`로 연결하면 스크린리더가 함께 읽습니다.
* 포커스 링은 디자인 토큰 `--ring`을 따릅니다(`focus-visible:ring-3`).

---


## 스타일링 & 테마
---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 색(테두리·포커스 링·오류) | **디자인 토큰**(`--input`, `--ring`, `--destructive`) |
| 이 인스턴스만 크기·모양·여백 | **`className`** (Tailwind 유틸리티) |
| 겉모습 전체 교체 / 아이콘 프리픽스 | **`data-slot` 선택자 + CSS Module** |

### 1. 색은 디자인 토큰으로

Input 전용 색 변수는 없습니다. 기본 테두리는 `--input`, 포커스 링은 `--ring`, 오류는 `--destructive`를 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요(Input 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다).

### 2. 인스턴스 단위 조정 — `className` (Tailwind)

가장 자주 쓰는 방식입니다. `className`이 기본 스타일 뒤에 병합되므로 크기·모양을 자유롭게 덮어씁니다.

---
<img src="../assets/ui/input-style.png" alt="Input 스타일 변경" width="80%" />

```tsx
{/* 큰 사이즈 + 완전히 둥근 모서리 */}
<Input placeholder="큰 입력창" className="h-11 rounded-full px-5 text-base" />

{/* 밑줄만 있는 스타일 */}
<Input
  placeholder="밑줄 스타일"
  className="border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-sky-500"
/>
```

### 3. 세밀한 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히거나 아이콘 프리픽스를 넣으려면, 컴포넌트가 노출하는 **`data-slot="input"`** 을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot | 대상 |
| --- | --- |
| `[data-slot="input"]` | `<input>` 요소 (오직 하나) |

오류 상태는 `[aria-invalid='true']`, 비활성은 `:disabled`로 구분합니다.

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */
.wrap :global([data-slot='input']) {
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid var(--border);
}
.wrap :global([data-slot='input']):focus-visible {
  border-color: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
}
.wrap :global([data-slot='input'])[aria-invalid='true'] {
  border-color: var(--destructive);
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot='input']`처럼 **래퍼와 슬롯을 겹쳐서** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제 — 프로필 입력 폼 (CSS Module 리스타일)
---

제공 `Input` 컴포넌트는 **그대로 두고**, `className`에 `*.module.css` 클래스를 넘겨 전혀 다른 룩앤필(높이 48px · 아이콘 프리픽스 · 에메랄드 포커스 글로우 · 에러 상태)을 입힌 예제입니다. 실제 SI 프로젝트에서 퍼블리셔가 Input 스타일을 바꾸는 **전형적인 방식**이므로, 아래 소스를 그대로 복사해 시작점으로 쓰세요.

---
<img src="../assets/ui/input-real.png" alt="Input 실전 예제" width="60%" />

**포인트**

* 앞쪽 아이콘은 `.inputWrap`(position: relative)로 겹쳐 배치하고, `padding-left`로 자리를 비웁니다.
* 유효성 오류는 `aria-invalid` 속성으로 표현하고, CSS에서 `[aria-invalid='true']`로 스타일링합니다.
* 겉모습은 전부 `*.module.css`에서 오버라이드했고, **컴포넌트는 손대지 않았습니다.**

<details>
<summary><b>ProfileFormInput.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/input/ProfileFormInput.tsx"
import { useState } from 'react';
import { Input } from '@axiom/components/ui';
import { User, Mail, Phone, CheckCircle2 } from 'lucide-react';
import styles from './ProfileFormInput.module.css';

/**
 * 실전 예제 — 프로필 입력 폼.
 * 제공 Input(@axiom/components/ui) 을 그대로 쓰되, className 에 CSS Module 클래스를
 * 넘겨 기본 스타일을 완전히 다른 톤(높이 48px · 아이콘 프리픽스 · 에메랄드 포커스)으로 덮어쓴다.
 */
export default function ProfileFormInput(): React.ReactNode {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // 아주 단순한 유효성 검증(예제용). 제출을 시도한 뒤에만 에러를 노출한다.
  const [touched, setTouched] = useState(false);
  const emailInvalid = touched && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const nameInvalid = touched && name.trim() === '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === '' || emailInvalid || email.trim() === '') return;
    setSubmitted(true);
  };

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <h3 className={styles.title}>프로필 정보 입력</h3>
      <p className={styles.subtitle}>서비스 이용을 위해 기본 정보를 입력해 주세요.</p>

      <div className={styles.fields}>
        {/* 이름 */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-name">이름</label>
          <div className={styles.inputWrap}>
            {/* highlight-start */}
            <Input
              id="profile-name"
              className={styles.input}
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameInvalid || undefined}
            />
            {/* highlight-end */}
            <User className={styles.icon} />
          </div>
          {nameInvalid && <span className={styles.errorText}>이름을 입력해 주세요.</span>}
        </div>

        {/* 이메일 */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-email">이메일</label>
          <div className={styles.inputWrap}>
            <Input
              id="profile-email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailInvalid || undefined}
            />
            <Mail className={styles.icon} />
          </div>
          {emailInvalid && <span className={styles.errorText}>올바른 이메일 형식이 아닙니다.</span>}
        </div>

        {/* 휴대폰 (선택) */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-phone">
            휴대폰 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <div className={styles.inputWrap}>
            <Input
              id="profile-phone"
              type="tel"
              className={styles.input}
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Phone className={styles.icon} />
          </div>
        </div>

        <button type="submit" className={styles.submit}>저장하기</button>
      </div>

      {submitted && (
        <div className={styles.doneBanner}>
          <CheckCircle2 className="w-4 h-4" />
          프로필이 저장되었습니다.
        </div>
      )}
    </form>
  );
}
```

</details>

<details>
<summary><b>ProfileFormInput.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/input/ProfileFormInput.module.css"
.card {
  width: 100%;
  max-width: 420px;
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

/* 아이콘을 겹쳐 놓기 위한 래퍼 */
.inputWrap {
  position: relative;
  display: flex;
  align-items: center;
}
.icon {
  position: absolute;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #94a3b8;
  pointer-events: none;
  transition: color 0.15s ease;
}

/*
 * 핵심: 제공 Input(h-8, rounded-lg, border-input …) 의 기본 룩을 걷어내고
 * 이 프로젝트 전용 톤(높이 48px, 아이콘 여백, 굵은 포커스 글로우)으로 완전히 교체한다.
 * cn() 이 뒤에 오는 className 을 우선 적용하므로 아래 값들이 기본값을 덮어쓴다.
 */
.input {
  height: 48px;
  width: 100%;
  padding-left: 42px;   /* 앞 아이콘 자리 확보 */
  padding-right: 14px;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  font-size: 14px;
  color: #0f172a;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.input:focus-visible {
  outline: none;
  background: #ffffff;
  border-color: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
}
/* 포커스 시 앞 아이콘도 강조색으로 */
.inputWrap:focus-within .icon {
  color: #10b981;
}

/* 에러 상태 — aria-invalid 속성으로 스타일링 */
.input[aria-invalid='true'] {
  border-color: #ef4444;
  background: #fef2f2;
}
.input[aria-invalid='true']:focus-visible {
  border-color: #ef4444;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
}
.input[aria-invalid='true'] ~ .icon {
  color: #ef4444;
}

.errorText {
  font-size: 12px;
  color: #ef4444;
}
.submit {
  margin-top: 8px;
  height: 46px;
  border-radius: 12px;
  border: none;
  background: #10b981;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}
```

</details>

:::tip 이 예제에서 가져갈 것
동작(입력·포커스·검증)은 표준 `<input>`에 맡기고, 바꾸는 건 ①`className`으로 넘기는 **CSS Module 클래스** ②앞 아이콘을 겹치는 **래퍼 마크업** ③`aria-invalid` 속성뿐입니다. **컴포넌트를 복사해서 고치지 마세요.**
:::

---
