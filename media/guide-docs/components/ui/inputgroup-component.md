---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "InputGroup"
hide_table_of_contents: false
---

# InputGroup 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 입력 조합 컴포넌트입니다.  
입력창 앞·뒤·위·아래에 **아이콘 / 고정 텍스트 / 버튼을 붙여 하나의 테두리 안에** 넣을 때 사용합니다.

**언제 쓰나요?**

- 검색창처럼 입력 앞에 **아이콘**을 붙일 때
- `https://` · `원` · `USD`처럼 **고정 접두·접미 텍스트(단위)** 를 붙일 때
- 쿠폰 코드 + `적용`, 초대 코드 + `복사`처럼 **입력과 붙은 액션 버튼**이 필요할 때
- 비밀번호 **보기 토글**처럼 입력 안쪽에 아이콘 버튼을 둘 때
- 여러 줄 입력(textarea) **아래에 글자 수·전송 버튼**을 붙일 때

> 아이콘·버튼 없이 입력창 하나만 필요하다면 [`Input`](./input-component)으로 충분합니다. InputGroup은 **"입력 + 부가 요소를 한 테두리로 묶는"** 경우에만 씁니다.

### Input · InputGroup · Field — 무엇이 다른가

| 구분         | 역할(계층)                                          | 테두리·포커스 소유     | 이 프로젝트 |
| ------------ | --------------------------------------------------- | ---------------------- | ----------- |
| `Input`      | 입력 컨트롤 **하나** (`<input>`)                    | input 자신             | ✅ 설치됨   |
| `InputGroup` | 입력 + 아이콘·텍스트·버튼을 **한 테두리 안**에 조합 | **InputGroup 래퍼**    | ✅ 설치됨   |
| `Field`      | 폼 **한 행** 레이아웃(라벨 + 컨트롤 + 설명 + 에러)  | 해당 없음(입력이 아님) | ❌ 미설치   |

:::info `Field`는 이 프로젝트에 없습니다 — 없어도 됩니다
shadcn 공식 InputGroup 문서 예제에는 `Field / FieldLabel / FieldDescription / FieldError`가 자주 함께 등장하지만, 그건 **입력 컴포넌트가 아니라 라벨·설명·에러를 묶는 폼 레이아웃 래퍼**라 InputGroup과 직접 관계가 없습니다. 이 프로젝트에서는 기존 `Label` + 도움말/에러 텍스트 조합으로 동일하게 처리합니다.

```tsx
{
  /* Field 없이 — Label + InputGroup + 도움말/에러 텍스트 */
}
<div className="grid gap-1.5">
  <Label htmlFor="email">이메일</Label>
  <InputGroup>
    <InputGroupAddon>
      <MailIcon />
    </InputGroupAddon>
    <InputGroupInput
      id="email"
      type="email"
      placeholder="you@example.com"
      aria-describedby="email-help"
    />
  </InputGroup>
  <p id="email-help" className="text-xs text-muted-foreground">
    회사 이메일을 입력하세요.
  </p>
</div>;
```

:::

---

## Import

---

```tsx
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupText,
  InputGroupButton,
} from "@axiom/components/ui";
```

InputGroup은 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 전부 필수는 아니며 **필요한 것만 골라** 씁니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/input-group.tsx`이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---

## 기본 사용법

---

가장 흔한 형태는 **아이콘 프리픽스 + 입력**입니다. `InputGroupAddon`은 기본값이 `align="inline-start"`(앞)이라 별도 지정이 필요 없습니다.

<img
  src="../assets/ui/inputgroup-basic.png"
  alt="InputGroup 기본 사용법"
  width="80%"
/>

```tsx
import { Search } from "lucide-react";

<InputGroup>
  <InputGroupAddon>
    <Search />
  </InputGroupAddon>
  <InputGroupInput placeholder="검색어를 입력하세요" />
</InputGroup>;
```

기본 크기는 **높이 32px(`h-8`)**, 너비는 부모에 꽉 차는 `w-full`입니다. 폭을 제한하려면 감싼 요소에서 `max-w-*`를 주세요.

```tsx
<div className="max-w-sm">
  <InputGroup> … </InputGroup>
</div>
```

:::tip 테두리·포커스·에러는 **래퍼가 통째로** 관리합니다
안쪽 `InputGroupInput`은 테두리와 링이 제거된 투명 입력(`border-0 bg-transparent focus-visible:ring-0`)입니다. 보이는 사각 테두리·포커스 링·에러 색은 전부 바깥 `InputGroup`이 그립니다. 그래서 **모양을 바꿀 때도 래퍼의 `className`만** 건드리면 됩니다([스타일링](#스타일링--테마) 참고).
:::

---

## 구성 (Anatomy)

---

```tsx
<InputGroup>
  {" "}
  {/* 래퍼 — 테두리·높이·포커스·에러·disabled 소유 */}
  <InputGroupAddon>
    {" "}
    {/* 부가 영역(앞) — 기본 align="inline-start" */}
    <SearchIcon />
  </InputGroupAddon>
  <InputGroupInput /> {/* 입력 컨트롤 (또는 InputGroupTextarea) */}
  <InputGroupAddon align="inline-end">
    {" "}
    {/* 부가 영역(뒤) */}
    <InputGroupText>원</InputGroupText> {/* 고정 텍스트 */}
    <InputGroupButton>적용</InputGroupButton> {/* 액션 버튼 */}
  </InputGroupAddon>
</InputGroup>
```

| 파트                 | 실제 렌더                                                         | 역할                                                                |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `InputGroup`         | `<div role="group" data-slot="input-group">`                      | 루트 래퍼. 테두리·높이·모서리·포커스 링·에러·disabled 스타일을 소유 |
| `InputGroupAddon`    | `<div role="group" data-slot="input-group-addon" data-align="…">` | 부가 영역. `align`으로 위치 결정. 클릭하면 입력에 포커스            |
| `InputGroupInput`    | `Input` + `data-slot="input-group-control"`                       | 한 줄 입력. 테두리·배경이 제거된 상태로 그룹 안에 들어감            |
| `InputGroupTextarea` | `Textarea` + `data-slot="input-group-control"`                    | 여러 줄 입력. 넣으면 그룹 높이가 `auto`로 바뀜                      |
| `InputGroupText`     | `<span>`                                                          | 단위·도메인 같은 **고정 텍스트**(입력 아님)                         |
| `InputGroupButton`   | `Button`(`data-slot="button"`)                                    | 액션 버튼. 기본 `type="button"` · `variant="ghost"` · `size="xs"`   |

:::note Addon은 JSX 순서가 아니라 `align`이 위치를 정합니다
`inline-start`는 `order-first`, `inline-end`는 `order-last`가 적용됩니다. 즉 **JSX에서 어디에 쓰든** 화면상 위치는 `align` 값이 결정합니다. 다만 읽는 사람을 위해 **화면 순서대로 작성**하는 것을 권장합니다.
:::

---

## 배치 옵션 — `align`

---

`InputGroupAddon`의 `align`으로 부가 영역이 붙는 위치를 정합니다. 값은 4가지입니다.

<img
  src="../assets/ui/inputgroup-align.png"
  alt="InputGroup align 4종"
  width="80%"
/>

| `align`                   | 위치          | 그룹에 생기는 변화                                   |
| ------------------------- | ------------- | ---------------------------------------------------- |
| `"inline-start"` _(기본)_ | 입력 **앞**   | 한 줄 유지(`h-8`), 입력 왼쪽 여백 축소               |
| `"inline-end"`            | 입력 **뒤**   | 한 줄 유지(`h-8`), 입력 오른쪽 여백 축소             |
| `"block-start"`           | 입력 **위**   | 그룹이 **세로 배치(`flex-col`) + 높이 auto** 로 전환 |
| `"block-end"`             | 입력 **아래** | 그룹이 **세로 배치(`flex-col`) + 높이 auto** 로 전환 |

```tsx
{
  /* 앞 (기본) */
}
<InputGroup>
  <InputGroupAddon>
    <Search />
  </InputGroupAddon>
  <InputGroupInput placeholder="검색어" />
</InputGroup>;

{
  /* 뒤 */
}
<InputGroup>
  <InputGroupInput placeholder="쿠폰 코드" />
  {/* highlight-next-line */}
  <InputGroupAddon align="inline-end">
    <InputGroupButton variant="default">적용</InputGroupButton>
  </InputGroupAddon>
</InputGroup>;

{
  /* 위 — 그룹이 세로로 바뀜 */
}
<InputGroup>
  {/* highlight-next-line */}
  <InputGroupAddon align="block-start">
    <InputGroupText>배송 메모</InputGroupText>
  </InputGroupAddon>
  <InputGroupInput placeholder="부재 시 문 앞에 놓아주세요" />
</InputGroup>;
```

:::caution `block-*`은 높이를 바꿉니다
`block-start` / `block-end` Addon이 하나라도 있으면 그룹이 `flex-col` + `h-auto`로 전환됩니다. `h-8` 한 줄 UI를 기대하고 썼다가 높이가 늘어나는 경우가 대부분 이 때문입니다. **한 줄을 유지하려면 `inline-*`만** 쓰세요.
:::

---

## 고정 텍스트 — `InputGroupText`

---

`https://`·`원`·`USD`처럼 **사용자가 수정할 수 없는 고정 문구**는 `InputGroupText`로 넣습니다. 입력값이 아니므로 폼 제출에 포함되지 않습니다.

<img
  src="../assets/ui/inputgroup-text.png"
  alt="InputGroup 텍스트 프리픽스/서픽스"
  width="80%"
/>

```tsx
{
  /* 앞에 텍스트 */
}
<InputGroup>
  <InputGroupAddon>
    <InputGroupText>https://</InputGroupText>
  </InputGroupAddon>
  <InputGroupInput placeholder="example.com" />
</InputGroup>;

{
  /* 뒤에 단위 */
}
<InputGroup>
  <InputGroupInput type="number" placeholder="0" />
  <InputGroupAddon align="inline-end">
    <InputGroupText>원</InputGroupText>
  </InputGroupAddon>
</InputGroup>;

{
  /* 양쪽 동시 — 통화 기호(앞) + 통화 코드(뒤) */
}
<InputGroup>
  <InputGroupAddon>
    <InputGroupText>$</InputGroupText>
  </InputGroupAddon>
  <InputGroupInput type="number" placeholder="0.00" />
  <InputGroupAddon align="inline-end">
    <InputGroupText>USD</InputGroupText>
  </InputGroupAddon>
</InputGroup>;
```

:::tip `<kbd>`도 Addon 안에서 자동 정렬됩니다
Addon은 **직속 자식** `<kbd>`에 모서리 반경(`calc(var(--radius) - 5px)`)과 여백 보정을 자동으로 적용합니다. `Enter` · `⌘K` 같은 **키보드 힌트**를 넣기 좋습니다.

```tsx
<InputGroupAddon align="inline-end">
  <kbd>⌘K</kbd>
</InputGroupAddon>
```

단, `InputGroupText` 안에 한 번 더 감싸면 직속 자식이 아니라서 이 보정이 걸리지 않습니다. [실전 예제](#실전-예제--통합-검색-바-css-module-리스타일)가 그 경우로, `kbd` 모양을 CSS Module에서 직접 잡아 줍니다.
:::

---

## 액션 버튼 — `InputGroupButton`

---

입력에 붙는 버튼입니다. 내부적으로 scaffold `Button`을 렌더하므로 `variant`·`onClick`·`disabled` 등 Button의 props를 그대로 받습니다.

<img
  src="../assets/ui/inputgroup-button.png"
  alt="InputGroup 버튼"
  width="80%"
/>

```tsx
{
  /* 텍스트 버튼 */
}
<InputGroup>
  <InputGroupInput placeholder="쿠폰 코드" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton variant="default">적용</InputGroupButton>
  </InputGroupAddon>
</InputGroup>;
```

### 크기 — `size`

`InputGroupButton`의 `size`는 **Button의 size와 다른 자체 값**입니다(Button의 `size`는 받지 않습니다).

| `size`          | 결과                                                                  |
| --------------- | --------------------------------------------------------------------- |
| `"xs"` _(기본)_ | 높이 24px(`h-6`) · 좁은 좌우 여백 · 아이콘 14px                       |
| `"sm"`          | **전용 크기 클래스 없음** → Button 기본 크기(높이 32px)를 그대로 사용 |
| `"icon-xs"`     | 24×24 정사각 아이콘 버튼                                              |
| `"icon-sm"`     | 32×32 정사각 아이콘 버튼                                              |

:::caution `size="sm"`은 `xs`보다 **큽니다**
`sm`에는 별도 크기 클래스가 비어 있어 Button 기본값(`h-8`)이 그대로 나옵니다. 그룹 높이도 `h-8`이라 버튼이 세로로 꽉 차 보입니다. 컴팩트한 버튼을 원하면 기본값 `xs`를, 눈에 띄는 CTA를 원하면 `sm`을 쓰세요.
:::

### 아이콘 버튼 — 비밀번호 보기 토글

`size="icon-xs"`로 정사각 버튼을 만들고 `type`을 토글합니다. **아이콘만 있는 버튼에는 `aria-label`이 필수**입니다.

```tsx
import { Eye, EyeOff } from "lucide-react";

const [show, setShow] = useState(false);

<InputGroup>
  <InputGroupInput type={show ? "text" : "password"} placeholder="비밀번호" />
  <InputGroupAddon align="inline-end">
    {/* highlight-start */}
    <InputGroupButton
      size="icon-xs"
      aria-label="비밀번호 표시 전환"
      onClick={() => setShow((v) => !v)}
    >
      {show ? <EyeOff /> : <Eye />}
    </InputGroupButton>
    {/* highlight-end */}
  </InputGroupAddon>
</InputGroup>;
```

### 읽기 전용 + 복사 버튼

초대 코드·API 키처럼 **보여주기만 하고 복사시키는** 패턴입니다.

```tsx
import { Copy, Check } from "lucide-react";

const [copied, setCopied] = useState(false);

const handleCopy = () => {
  navigator.clipboard?.writeText("AXIOM-2026-INVITE").catch(() => {});
  setCopied(true);
  window.setTimeout(() => setCopied(false), 1500);
};

<InputGroup>
  <InputGroupInput readOnly value="AXIOM-2026-INVITE" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton size="icon-xs" aria-label="복사" onClick={handleCopy}>
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>;
```

:::note 기본 `type="button"` — 폼 안에서 안전합니다
`InputGroupButton`은 `type="button"`이 기본이라 `<form>` 안에 있어도 **실수로 제출되지 않습니다.** 검색 버튼을 눌러 제출시키려면 명시적으로 `type="submit"`을 넘기세요.
:::

---

## 상태 — Disabled / 유효성 오류

---

상태 스타일은 **개별 컨트롤이 아니라 그룹 전체**에 적용됩니다.

<img
  src="../assets/ui/inputgroup-state.png"
  alt="InputGroup disabled / aria-invalid"
  width="80%"
/>

```tsx
{
  /* disabled — 그룹 전체가 흐려짐 */
}
<InputGroup>
  <InputGroupAddon>
    <Search />
  </InputGroupAddon>
  {/* highlight-next-line */}
  <InputGroupInput placeholder="비활성화" disabled />
</InputGroup>;

{
  /* aria-invalid — 그룹 테두리·링이 destructive 로 */
}
<div className="grid gap-1.5">
  <InputGroup>
    <InputGroupAddon>
      <Mail />
    </InputGroupAddon>
    {/* highlight-next-line */}
    <InputGroupInput
      aria-invalid
      defaultValue="틀린-이메일"
      aria-describedby="mail-error"
    />
  </InputGroup>
  <p id="mail-error" className="text-xs text-destructive">
    올바른 이메일 형식이 아닙니다.
  </p>
</div>;
```

- **`disabled`** — 안쪽 컨트롤에 `disabled`를 주면 그룹 배경이 흐려지고 투명도가 낮아집니다(`has-disabled:`).
- **`aria-invalid`** — 그룹 안에서 `data-slot`을 가진 파트(Input · Textarea · Addon · Button)에 `aria-invalid="true"`가 있으면 그룹 테두리·링이 `--destructive` 색으로 바뀝니다(`has-[[data-slot][aria-invalid=true]]:`). `InputGroupText`는 `data-slot`이 없어 이 조건에 걸리지 않습니다.
- 오류 문구는 컴포넌트가 만들어 주지 않습니다. 본문에 직접 두고 `aria-describedby`로 연결하세요.

:::caution `disabled`는 **스타일만** 전파됩니다
안쪽 입력에 `disabled`를 줘도 Addon의 버튼은 **여전히 클릭됩니다.** 그룹 전체를 잠그려면 버튼에도 각각 `disabled`를 넘기세요.

```tsx
<InputGroup>
  <InputGroupInput disabled />
  <InputGroupAddon align="inline-end">
    {/* highlight-next-line */}
    <InputGroupButton disabled>적용</InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```

:::

:::note 포커스 링은 **입력에 포커스했을 때만** 켜집니다
그룹 테두리 강조 조건은 `has-[[data-slot=input-group-control]:focus-visible]` 입니다. 즉 Addon 안의 버튼으로 포커스가 이동해도 그룹 링은 켜지지 않습니다. 버튼 자신의 포커스 링은 Button이 별도로 표시합니다.
:::

---

## 여러 줄 입력 — `InputGroupTextarea`

---

`InputGroupTextarea` + `align="block-end"` Addon 조합으로 **글자 수·전송 버튼이 아래 붙은 메시지 입력창**을 만듭니다.

<img
  src="../assets/ui/inputgroup-textarea.png"
  alt="InputGroup Textarea + block-end"
  width="80%"
/>

```tsx
import { Send } from "lucide-react";

const [memo, setMemo] = useState("");

<InputGroup>
  {/* highlight-next-line */}
  <InputGroupTextarea
    placeholder="메시지를 입력하세요..."
    maxLength={200}
    rows={3}
    value={memo}
    onChange={(e) => setMemo(e.target.value)}
  />
  {/* highlight-next-line */}
  <InputGroupAddon align="block-end">
    <InputGroupText>{memo.length} / 200</InputGroupText>
    <InputGroupButton variant="default" size="sm" className="ml-auto">
      <Send /> 전송
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>;
```

- `InputGroupTextarea`가 들어가면 그룹 높이가 자동으로 `auto`가 됩니다(`has-[>textarea]:h-auto`).
- Addon은 `block-end`에서 **가로 폭 전체**를 차지하므로, 오른쪽 정렬이 필요하면 `className="ml-auto"`를 씁니다.

:::caution Addon 클릭 포커스는 textarea에 동작하지 않습니다
Addon의 빈 곳을 클릭하면 그룹 안의 **첫 번째 `<input>`** 에 포커스가 갑니다(`querySelector('input')`). textarea만 있는 그룹에서는 이 동작이 일어나지 않으므로, 클릭 유도가 필요하면 직접 `onClick`으로 포커스를 옮기세요.
:::

---

## 상태 관리 — 비제어 / 제어

---

안쪽 컨트롤은 표준 `<input>` / `<textarea>`이므로 [`Input`](./input-component)과 동일하게 동작합니다.

```tsx
{
  /* 비제어 — 초기값만 지정 */
}
<InputGroupInput defaultValue="홍길동" />;
```

값에 따라 UI를 바꾸려면 제어 모드를 씁니다. 아래는 **값이 있을 때만 지우기 버튼을 노출**하는 예입니다.

```tsx
const [keyword, setKeyword] = useState("");

<InputGroup>
  <InputGroupAddon>
    <Search />
  </InputGroupAddon>
  {/* highlight-start */}
  <InputGroupInput
    value={keyword}
    onChange={(e) => setKeyword(e.target.value)}
    placeholder="검색어"
  />
  {keyword && (
    <InputGroupAddon align="inline-end">
      <InputGroupButton size="xs" onClick={() => setKeyword("")}>
        지우기
      </InputGroupButton>
    </InputGroupAddon>
  )}
  {/* highlight-end */}
</InputGroup>;
```

:::caution `value`를 넘기면 반드시 `onChange`도
`value`만 넘기고 `onChange`를 빼면 입력해도 값이 바뀌지 않는 읽기 전용 필드가 됩니다. 값은 항상 `e.target.value`로 꺼내세요.
:::

---

## API 레퍼런스

---

### `InputGroup` (루트)

| Prop         | 타입                          | 기본값 | 설명                                                           |
| ------------ | ----------------------------- | ------ | -------------------------------------------------------------- |
| `children`   | `ReactNode`                   | —      | Addon · Input · Textarea 조합                                  |
| `className`  | `string`                      | —      | 기본 스타일 **뒤에 병합** — 높이·모서리·테두리·색 커스터마이징 |
| _(div 속성)_ | `React.ComponentProps<"div">` | —      | `id`·`aria-label`·`onClick` 등 표준 div 속성 전달              |

`role="group"` · `data-slot="input-group"`이 자동으로 붙습니다.

### `InputGroupAddon`

| Prop        | 타입                                                             | 기본값           | 설명                                                     |
| ----------- | ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| `align`     | `"inline-start" \| "inline-end" \| "block-start" \| "block-end"` | `"inline-start"` | 부가 영역 위치(앞·뒤·위·아래)                            |
| `children`  | `ReactNode`                                                      | —                | 아이콘 · `InputGroupText` · `InputGroupButton` · `<kbd>` |
| `className` | `string`                                                         | —                | Addon 여백·색 조정                                       |

`role="group"` · `data-slot="input-group-addon"` · `data-align="{align}"`이 붙고, **빈 곳을 클릭하면 그룹 안 첫 `<input>`에 포커스**합니다(버튼 클릭은 제외).

### `InputGroupInput`

| Prop                | 타입                            | 기본값 | 설명                                                                                        |
| ------------------- | ------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| _(input 속성 전부)_ | `React.ComponentProps<"input">` | —      | `type`·`value`·`onChange`·`placeholder`·`disabled`·`readOnly`·`maxLength`·`aria-invalid` 등 |
| `className`         | `string`                        | —      | 입력 자체의 폰트·여백 조정                                                                  |

`data-slot="input-group-control"`로 렌더됩니다(**`data-slot="input"` 아님** — [스타일링](#4-data-slot--css-module) 주의사항 참고).

### `InputGroupTextarea`

| Prop                   | 타입                               | 기본값 | 설명                                        |
| ---------------------- | ---------------------------------- | ------ | ------------------------------------------- |
| _(textarea 속성 전부)_ | `React.ComponentProps<"textarea">` | —      | `rows`·`value`·`onChange`·`maxLength` 등    |
| `className`            | `string`                           | —      | 높이·리사이즈 동작 조정(기본 `resize-none`) |

`data-slot="input-group-control"`로 렌더됩니다.

### `InputGroupText`

| Prop        | 타입        | 기본값 | 설명                         |
| ----------- | ----------- | ------ | ---------------------------- |
| `children`  | `ReactNode` | —      | 고정 텍스트·단위·아이콘 라벨 |
| `className` | `string`    | —      | 색·굵기 조정                 |

`<span>`으로 렌더되며 **`data-slot`이 없습니다.** CSS로 겨냥하려면 `className`을 쓰세요.

### `InputGroupButton`

| Prop                                  | 타입                                                                          | 기본값     | 설명                                           |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `size`                                | `"xs" \| "sm" \| "icon-xs" \| "icon-sm"`                                      | `"xs"`     | **InputGroup 전용 크기**(Button의 size와 다름) |
| `variant`                             | `"ghost" \| "default" \| "outline" \| "secondary" \| "destructive" \| "link"` | `"ghost"`  | Button의 variant 그대로                        |
| `type`                                | `"button" \| "submit" \| "reset"`                                             | `"button"` | 기본값이 `button`이라 폼을 제출하지 않음       |
| `onClick` / `disabled` / `aria-label` | —                                                                             | —          | Button(=`<button>`) 표준 속성                  |
| `className`                           | `string`                                                                      | —          | 모서리·색 조정                                 |

`data-slot="button"` · `data-size="{size}"`로 렌더됩니다.

---

## 접근성 / 키보드

---

InputGroup은 시각적 조합 컴포넌트라 **키보드 동작은 표준 `<input>` / `<button>`을 그대로 따릅니다.**

| 키                                 | 동작                                           |
| ---------------------------------- | ---------------------------------------------- |
| `Tab` / `Shift+Tab`                | 입력 → Addon 버튼 순으로 초점 이동             |
| 문자 키                            | 값 입력                                        |
| `Enter`                            | 폼 안에서 제출(`type="submit"` 버튼이 있을 때) |
| `Space` / `Enter` (버튼 포커스 시) | 버튼 실행                                      |

체크할 것:

- **라벨 연결은 직접** 해야 합니다. `Label`의 `htmlFor` ↔ `InputGroupInput`의 `id`를 맞추거나, 최소한 `aria-label`을 주세요.
- **아이콘만 있는 버튼에는 `aria-label` 필수** — 스크린리더가 읽을 이름이 없습니다.
- Addon 안의 아이콘은 장식이므로, 텍스트가 함께 없는 경우 `aria-hidden`을 주면 중복 낭독을 막을 수 있습니다.
- 오류는 `aria-invalid`로 표시하고 오류 문구는 `aria-describedby`로 연결합니다.
- `InputGroup`과 `InputGroupAddon`에는 `role="group"`이 붙습니다. 그룹에 이름이 필요하면 `aria-label`을 직접 넘기세요.
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다.

---

## 스타일링 & 테마

---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것                    | 방법                                                  |
| ------------------------------ | ----------------------------------------------------- |
| 색(테두리·포커스 링·오류)      | **디자인 토큰**(`--input`, `--ring`, `--destructive`) |
| Addon 위치 / 버튼 크기         | **prop**(`align`, `size`)                             |
| 이 인스턴스만 높이·모서리·여백 | **래퍼 `className`** (Tailwind)                       |
| 겉모습 전체 교체               | **`data-slot` 선택자 + CSS Module**                   |

:::tip 핵심 원칙
**컴포넌트 코드(`input-group.tsx`)를 복사해서 고치지 마세요.** 룩앤필은 거의 전부 `InputGroup` 래퍼에 얹혀 있으므로, 래퍼의 `className` 하나만 덮어써도 대부분의 디자인 요구를 만족합니다.
:::

### 1. 색은 디자인 토큰으로

InputGroup 전용 색 변수는 없습니다. 기본 테두리는 `--input`, 포커스 링은 `--ring`, 오류는 `--destructive`, 모서리는 `--radius`를 그대로 씁니다. **색을 바꾸려면 테마 토큰을 조정**하세요(InputGroup 전용 색 변수를 새로 만들면 토큰 체계가 분열됩니다).

### 2. 인스턴스 단위 조정 — 래퍼 `className` (Tailwind)

퍼블리셔가 가장 자주 쓰는 방식입니다. 래퍼의 `className`이 기본 스타일 뒤에 병합되므로 높이·모서리·여백을 자유롭게 덮어씁니다.

<img
  src="../assets/ui/inputgroup-style.png"
  alt="InputGroup className 오버라이드"
  width="80%"
/>

```tsx
{
  /* 큰 사이즈 + 알약형 */
}
{
  /* highlight-next-line */
}
<InputGroup className="h-11 rounded-full px-2">
  <InputGroupAddon>
    <Search />
  </InputGroupAddon>
  <InputGroupInput placeholder="둥근 검색 바" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton variant="default" size="sm" className="rounded-full">
      검색
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>;
```

### 3. 안쪽 파트 조정

각 파트도 `className`을 받습니다. 다만 **테두리·포커스 같은 그룹 단위 스타일은 래퍼에**, 폰트·여백처럼 파트 고유의 값만 개별 파트에 주는 것이 원칙입니다.

```tsx
<InputGroup className="h-12 rounded-2xl">
  <InputGroupAddon className="pl-4 text-sky-500">
    <Search />
  </InputGroupAddon>
  <InputGroupInput className="text-base" placeholder="검색어" />
</InputGroup>
```

### 4. `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면 컴포넌트가 노출하는 `data-slot`을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                           | 대상                                                            |
| ----------------------------------- | --------------------------------------------------------------- |
| `[data-slot="input-group"]`         | 래퍼                                                            |
| `[data-slot="input-group-addon"]`   | Addon (`[data-align="inline-end"]` 등으로 세분화 가능)          |
| `[data-slot="input-group-control"]` | 안쪽 입력 — **input · textarea 공통**                           |
| `[data-slot="button"]`              | `InputGroupButton` (`[data-size="icon-xs"]` 등으로 세분화 가능) |

:::caution `[data-slot="input"]` 으로는 잡히지 않습니다
`InputGroupInput`은 내부적으로 `Input`을 쓰지만 `data-slot`을 **`input-group-control`로 덮어씁니다.** 마찬가지로 `InputGroupTextarea`도 `textarea`가 아니라 `input-group-control`입니다. 페이지 전역에 `[data-slot='input']` 스타일을 걸어 뒀다면 **그룹 안의 입력에는 적용되지 않으니** 주의하세요.

`InputGroupText`는 아예 `data-slot`이 없으므로 `className`으로 겨냥해야 합니다.
:::

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 겹쳐 Tailwind 유틸리티보다 명시도를 확보한다. */
.wrap :global([data-slot="input-group"]) {
  height: 52px;
  border-radius: 9999px;
}
.wrap :global([data-slot="input-group"]):focus-within {
  border-color: #14b8a6;
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
}
.wrap :global([data-slot="input-group-addon"])[data-align="inline-start"] {
  padding-left: 14px;
}
.wrap :global([data-slot="input-group-control"]) {
  font-size: 0.95rem;
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot='input-group']`처럼 **래퍼와 슬롯을 겹쳐서** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

:::note Combobox 안에서는 테두리가 반응하지 않습니다
`data-slot="combobox-content"` 내부에 놓인 InputGroup은 포커스 시 테두리·링 변화가 꺼집니다(`in-data-[slot=combobox-content]:focus-within:border-inherit`). 드롭다운 안의 검색창이 이중 테두리로 보이지 않게 하기 위한 의도된 동작입니다.
:::

---

## 실전 예제 — 통합 검색 바 (CSS Module 리스타일)

---

제공 `InputGroup` 계열을 **그대로 쓰고**, `className`에 `*.module.css` 클래스를 넘겨 전혀 다른 룩앤필(높이 52px · 알약형 · teal 소프트 글로우 · 키보드 힌트 · 지우기 버튼)을 입힌 예제입니다. 실제 SI 프로젝트에서 퍼블리셔가 InputGroup 스타일을 바꾸는 **전형적인 방식**이므로, 아래 소스를 그대로 복사해 시작점으로 쓰세요.

<img
  src="../assets/ui/inputgroup-real-search.png"
  alt="InputGroup 실전 예제 — 통합 검색 바"
  width="70%"
/>

**포인트**

- `InputGroup` 래퍼에 `className={styles.group}` 하나를 주는 것만으로 **테두리·높이·모서리·포커스 글로우가 통째로** 바뀝니다.
- 포커스 표현은 `:focus-within`으로 처리해 **입력이든 버튼이든 그룹 안 어디에 포커스가 가도** 동일하게 반응합니다.
- 입력값이 있으면 지우기 버튼, 없으면 `<kbd>Enter</kbd>` 힌트를 같은 `inline-end` Addon 자리에 바꿔 넣습니다.
- `Esc` 키로도 검색어를 비웁니다.
- 겉모습은 전부 `*.module.css`에서 오버라이드했고 **컴포넌트는 손대지 않았습니다.**

<details>
<summary><b>SearchBarInputGroup.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/input-group/SearchBarInputGroup.tsx"
import { useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@axiom/components/ui";
import { Search, X, CornerDownLeft } from "lucide-react";
import styles from "./SearchBarInputGroup.module.css";

/**
 * 실전 예제 — 통합 검색 바.
 *
 * 제공 `InputGroup` 계열(@axiom/components/ui) 을 **그대로** 쓰되, `className` 에 CSS Module 클래스를
 * 넘겨 shadcn 기본 스타일(높이 32px · 각진 사각 · 얇은 테두리)을 전혀 다른 톤
 * (높이 52px · 알약형 · 소프트 포커스 글로우 · 키보드 힌트)으로 덮어쓴다.
 */
export default function SearchBarInputGroup(): React.ReactNode {
  const [query, setQuery] = useState("");

  const clear = () => setQuery("");

  return (
    <div className={styles.wrap}>
      {/* highlight-next-line */}
      <InputGroup className={styles.group}>
        <InputGroupAddon className={styles.leadIcon}>
          <Search />
        </InputGroupAddon>

        <InputGroupInput
          className={styles.input}
          placeholder="주문번호, 상품명, 고객명으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") clear();
          }}
        />

        <InputGroupAddon align="inline-end" className={styles.tail}>
          {/* highlight-start */}
          {query ? (
            <InputGroupButton
              size="icon-xs"
              className={styles.clearBtn}
              aria-label="검색어 지우기"
              onClick={clear}
            >
              <X />
            </InputGroupButton>
          ) : (
            <InputGroupText className={styles.kbd}>
              <kbd>
                <CornerDownLeft />
                Enter
              </kbd>
            </InputGroupText>
          )}
          {/* highlight-end */}
        </InputGroupAddon>
      </InputGroup>

      <p className={styles.hint}>
        {query ? (
          <>
            <b>“{query}”</b> 검색 준비됨 — Enter 로 검색, Esc 로 지우기
          </>
        ) : (
          "검색어를 입력해 보세요. 스타일은 CSS Module 로만 덮어썼습니다."
        )}
      </p>
    </div>
  );
}
```

</details>

<details>
<summary><b>SearchBarInputGroup.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/input-group/SearchBarInputGroup.module.css"
/*
 * 핵심: 제공 InputGroup 의 기본 룩(높이 32px · 각진 사각 · 얇은 회색 테두리)을
 * className 병합으로 통째로 덮어써서 "알약형 소프트 검색 바"로 바꾼다.
 * 컴포넌트 원본(input-group.tsx)은 전혀 건드리지 않는다.
 */

.wrap {
  width: 100%;
  max-width: 34rem;
}

/* ── InputGroup 래퍼 자체를 리스타일 ─────────────────────────── */
/* highlight-start */
.group {
  height: 52px;
  border-radius: 9999px;
  border-color: #e2e8f0;
  background: #fff;
  padding-inline: 6px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

/* 포커스 시 소프트 글로우 (teal). :focus-within 로 그룹 전체에 반응 */
.group:focus-within {
  border-color: #14b8a6;
  box-shadow:
    0 0 0 4px rgba(20, 184, 166, 0.15),
    0 4px 14px rgba(20, 184, 166, 0.12);
}
/* highlight-end */

.leadIcon {
  padding-left: 14px;
  color: #94a3b8;
}
.group:focus-within .leadIcon {
  color: #14b8a6;
}

.input {
  font-size: 0.95rem;
  padding-inline: 6px;
}

.tail {
  padding-right: 8px;
}

/* 키보드 힌트(kbd) */
.kbd kbd {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-inline: 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}
.kbd kbd svg {
  width: 12px;
  height: 12px;
}

/* 지우기 버튼 */
.clearBtn {
  color: #94a3b8;
  border-radius: 9999px;
}
.clearBtn:hover {
  color: #0f172a;
  background: #f1f5f9;
}

.hint {
  margin-top: 10px;
  padding-left: 18px;
  font-size: 12px;
  color: #94a3b8;
}
.hint b {
  color: #0f766e;
  font-weight: 600;
}

/* ── 다크 모드 (앱 규칙: :global(.dark)) ─────────────────────── */
:global(.dark) .group {
  border-color: #334155;
  background: #0f172a;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
:global(.dark) .group:focus-within {
  border-color: #2dd4bf;
  box-shadow:
    0 0 0 4px rgba(45, 212, 191, 0.18),
    0 4px 14px rgba(45, 212, 191, 0.1);
}
:global(.dark) .leadIcon {
  color: #64748b;
}
:global(.dark) .group:focus-within .leadIcon {
  color: #2dd4bf;
}
:global(.dark) .kbd kbd {
  border-color: #334155;
  background: #1e293b;
  color: #94a3b8;
}
:global(.dark) .clearBtn:hover {
  color: #f1f5f9;
  background: #1e293b;
}
:global(.dark) .hint b {
  color: #5eead4;
}
```

</details>

:::tip 이 예제에서 가져갈 것
동작(입력·포커스·클릭)은 표준 `<input>` / `<button>`에 맡기고, 바꾸는 건 ①래퍼에 넘기는 **CSS Module 클래스** ②`align`으로 정한 Addon 자리 ③그 안에 넣는 **내 마크업(kbd·지우기 버튼)** 세 가지뿐입니다. **컴포넌트를 복사해서 고치지 마세요.**
:::

---
