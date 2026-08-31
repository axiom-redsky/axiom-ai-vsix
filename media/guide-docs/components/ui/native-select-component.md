---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Native Select"
hide_table_of_contents: false
---

# NativeSelect 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **브라우저 기본 `<select>` 기반** 선택 컴포넌트입니다.
펼쳐진 드롭다운 목록은 **OS/브라우저가 그대로 그리고**, 컴포넌트는 **닫힌 셀렉트 박스의 겉모습**(높이·테두리·포커스 링·화살표 아이콘)만 프로젝트 톤으로 맞춥니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > NativeSelect` 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 도시·국가·개수처럼 **텍스트 한 줄짜리 옵션**을 하나 고를 때
- 모바일에서 **OS 네이티브 피커(휠)** UX가 더 익숙하고 안정적일 때
- 목록·그리드 툴바의 정렬 / 페이지당 개수처럼 **작고 가벼운 셀렉트**가 필요할 때
- `name` + `FormData`, `required` 같은 **폼 기본 동작**을 브라우저에 그대로 맡기고 싶을 때

> 옵션 안에 아이콘·2줄 설명·체크마크를 넣거나 드롭다운 목록 자체를 디자인해야 한다면 NativeSelect로는 불가능합니다. 그때는 `Select`(radix 기반), 검색이 필요하면 [`Combobox`](./combobox-component)를 쓰세요.

### NativeSelect · Select — 무엇을 쓸까

둘 다 "목록에서 하나를 고르는" UI지만 **드롭다운을 누가 그리는지**가 완전히 다릅니다.

| 비교 항목              | `NativeSelect`                      | `Select` (radix)                   |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| 구현 베이스            | 브라우저 기본 `<select>`            | radix-ui Select (커스텀 렌더)      |
| 드롭다운 렌더링        | **OS/브라우저**가 그림              | React가 Portal로 그림              |
| 펼친 목록 스타일 변경  | ❌ 거의 불가 — OS 종속              | ✅ 완전 커스텀                     |
| 옵션에 아이콘·2줄·체크 | ❌ 텍스트만                         | ✅ 가능                            |
| 모바일 UX              | OS 네이티브 피커(휠) — 매우 익숙    | 커스텀 목록(작은 화면 설계 필요)   |
| 접근성                 | 브라우저 기본 제공(무료)            | radix가 ARIA 직접 구현             |
| 값 변경 핸들러         | `onChange` (`e.target.value`)       | `onValueChange` (`value`)          |
| 폼 전송                | `name`만 주면 기본 동작             | `name` → hidden select 자동 생성   |
| placeholder            | `<option value="" disabled>`로 흉내 | `SelectValue`의 `placeholder` prop |
| 열림 상태 제어(`open`) | ❌ 불가                             | ✅ 가능                            |
| 번들 무게              | 매우 가벼움                         | radix 의존성 포함                  |

:::tip 한 줄 요약
드롭다운 **안**을 커스텀할 필요가 없고, 특히 **모바일 네이티브 피커**가 좋으면 `NativeSelect`.
옵션에 아이콘·2줄·그룹 스타일 등 **드롭다운 자체를 꾸며야** 하면 `Select`.
:::

---

## Import

---

```tsx
import {
  NativeSelect,
  NativeSelectOption,
  NativeSelectOptGroup,
} from "@axiom/components/ui";
```

`NativeSelect` **하나만으로도** 동작합니다. 옵션은 표준 `<option>` / `<optgroup>`을 그대로 써도 되지만, **다크 모드 색 보정**(`bg-[Canvas] text-[CanvasText]`)이 들어간 `NativeSelectOption` / `NativeSelectOptGroup` 사용을 권장합니다.

---

## 기본 사용법

---

가장 기본적인 형태입니다. 네이티브 `<select>`에는 **placeholder 속성이 없으므로**, `value=""`인 `disabled` 옵션을 맨 위에 두고 `defaultValue=""`로 시작하면 안내 문구처럼 보입니다.

---

<img
  src="../assets/ui/native-select-basic.png"
  alt="NativeSelect 기본 사용법"
  width="100%"
/>

```tsx
<NativeSelect defaultValue="">
  <NativeSelectOption value="" disabled>
    도시를 선택하세요
  </NativeSelectOption>
  <NativeSelectOption value="seoul">서울</NativeSelectOption>
  <NativeSelectOption value="busan">부산</NativeSelectOption>
  <NativeSelectOption value="incheon">인천</NativeSelectOption>
</NativeSelect>
```

:::tip placeholder 옵션에 `disabled`를 붙이는 이유
`disabled`가 없으면 사용자가 목록에서 **"도시를 선택하세요"를 다시 고를 수 있어** 빈 값이 유효한 선택처럼 취급됩니다. `disabled`를 붙이면 처음 한 번만 보이고 이후에는 고를 수 없습니다. `required`와 함께 쓰면 브라우저 기본 유효성 검사에서 "필수 항목"으로 잡힙니다.
:::

---

## 구성 (Anatomy)

---

세 개의 파트로 구성됩니다. 그룹이 필요 없으면 `NativeSelect` + `NativeSelectOption` 두 개면 충분합니다.

```tsx
<NativeSelect>
  {" "}
  {/* 래퍼 div + 실제 select + 화살표 아이콘 */}
  <NativeSelectOptGroup>
    {" "}
    {/* (선택) 옵션 묶음 — label이 회색 소제목 */}
    <NativeSelectOption /> {/* 옵션 한 개 */}
  </NativeSelectOptGroup>
</NativeSelect>
```

| 파트                   | 역할                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `NativeSelect`         | 래퍼 + 실제 `<select>` + 화살표 아이콘을 함께 렌더. 값·상태를 가집니다. |
| `NativeSelectOption`   | 옵션 한 개(`<option>`). 다크 모드 색 보정 포함.                         |
| `NativeSelectOptGroup` | 옵션 묶음(`<optgroup>`). `label`이 선택 불가 소제목으로 표시됩니다.     |

### 실제 렌더되는 DOM

`NativeSelect`는 태그 하나가 아니라 **3겹 구조**로 렌더됩니다. 스타일을 덮어쓸 때 이 구조를 알아야 합니다.

```html
<div data-slot="native-select-wrapper" data-size="default">
  <!-- ← className 이 여기에 붙음 -->
  <select data-slot="native-select" data-size="default">
    <!-- ← 실제 셀렉트 박스 -->
    <option data-slot="native-select-option">…</option>
  </select>
  <svg data-slot="native-select-icon"><!-- ChevronDown --></svg>
</div>
```

:::caution `className`은 `<select>`가 아니라 **래퍼(div)** 에 붙습니다
`NativeSelect`에 넘긴 `className`은 `[data-slot="native-select-wrapper"]`로 갑니다. 셀렉트 박스 자체(테두리·높이·글꼴)를 바꾸려면 **자손 선택자로 파고들어야** 합니다 → `.myField [data-slot="native-select"]`.
너비(`w-full`)처럼 바깥 박스에 거는 값은 래퍼에 붙으므로 그냥 `className`으로 주면 됩니다. 자세한 건 [스타일링 & 테마](#스타일링--테마) 참고.
:::

---

## 동작 옵션

---

### 1. 초기값 — `defaultValue`

```tsx
// 비제어 — 초기 선택값만 지정하고 이후는 브라우저에 맡김
<NativeSelect defaultValue="busan">
  <NativeSelectOption value="seoul">서울</NativeSelectOption>
  <NativeSelectOption value="busan">부산</NativeSelectOption>
</NativeSelect>
```

- `defaultValue`는 **비제어(uncontrolled)** 초기값입니다. 이후 값은 DOM이 관리합니다.
- 아무것도 지정하지 않으면 **첫 번째 옵션**이 선택된 상태로 시작합니다. "미선택" 상태가 필요하면 위 [기본 사용법](#기본-사용법)의 placeholder 패턴을 쓰세요.

### 2. 라벨 연결 — `Label` + `id`

`Label`의 `htmlFor`와 `NativeSelect`의 `id`를 연결하면 **라벨을 클릭해도 셀렉트가 열립니다.** 스크린리더가 필드 이름을 읽어주므로 폼에서는 사실상 필수입니다.

```tsx
<div className="grid gap-2">
  <Label htmlFor="city">거주 도시</Label>
  <NativeSelect id="city" defaultValue="busan">
    <NativeSelectOption value="seoul">서울</NativeSelectOption>
    <NativeSelectOption value="busan">부산</NativeSelectOption>
  </NativeSelect>
</div>
```

- 눈에 보이는 라벨을 둘 수 없는 자리(툴바 등)라면 `aria-label="정렬 기준"`으로 대체합니다.

### 3. 그룹 — `NativeSelectOptGroup`

항목이 많을 때 `label`을 가진 그룹으로 묶습니다. 네이티브 `<optgroup>`이라 **브라우저가 회색 소제목**으로 그려줍니다.

---

<img
  src="../assets/ui/native-select-optgroup.png"
  alt="NativeSelect 옵션 그룹"
  width="100%"
/>

```tsx
<NativeSelect defaultValue="apple">
  <NativeSelectOptGroup label="국산">
    <NativeSelectOption value="apple">사과</NativeSelectOption>
    <NativeSelectOption value="pear">배</NativeSelectOption>
  </NativeSelectOptGroup>
  <NativeSelectOptGroup label="수입">
    <NativeSelectOption value="banana">바나나</NativeSelectOption>
    <NativeSelectOption value="mango">망고</NativeSelectOption>
  </NativeSelectOptGroup>
</NativeSelect>
```

- 그룹 라벨은 **선택할 수 없습니다.** 값이 아니라 구분용 소제목입니다.
- 소제목의 글꼴·색은 **OS가 그리는 영역**이라 CSS로 바꿀 수 없습니다.

### 4. 크기와 너비 — `size` / `className`

```tsx
<NativeSelect size="sm" defaultValue="seoul">…</NativeSelect>   {/* h-7 */}
<NativeSelect defaultValue="seoul">…</NativeSelect>             {/* h-8 (기본) */}

{/* 폼 필드처럼 꽉 채우기 — className 은 래퍼로 간다 */}
<NativeSelect className="w-full" defaultValue="seoul">…</NativeSelect>
```

---

<img
  src="../assets/ui/native-select-size.png"
  alt="NativeSelect size와 너비"
  width="100%"
/>

- `size="sm"`(높이 `h-7`, 라운드 축소) / `size="default"`(높이 `h-8`) 두 가지입니다.
- 래퍼가 기본 `w-fit`이라 **가장 긴 옵션 글자 너비**를 따라갑니다. 폼에서 옆 입력창과 폭을 맞추려면 `className="w-full"`을 주세요.

:::note `size` prop은 네이티브 `size` 속성이 아닙니다
HTML `<select size={5}>`는 "한 번에 보일 행 수"를 뜻하지만, 이 컴포넌트는 그 속성을 **높이 변형(`"sm" | "default"`)으로 대체**했습니다(타입에서 원래 `size`를 제외). 따라서 목록 펼침형(행 수 지정)·`multiple` 다중 선택은 이 컴포넌트의 대상이 아닙니다. 다중 선택이 필요하면 체크박스 목록이나 `Combobox` 쪽을 검토하세요.
:::

### 5. 비활성화 — `disabled`

전체를 막을지, 특정 항목만 막을지에 따라 `disabled`를 거는 위치가 다릅니다.

```tsx
{
  /* 전체 비활성화 — 래퍼가 흐려지고(opacity-50) 화살표까지 함께 흐려짐 */
}
<NativeSelect disabled defaultValue="seoul">
  …
</NativeSelect>;

{
  /* 특정 항목만 비활성화 */
}
<NativeSelectOption value="daegu" disabled>
  대구 (마감)
</NativeSelectOption>;
```

---

<img
  src="../assets/ui/native-select-disabled.png"
  alt="NativeSelect 비활성화"
  width="100%"
/>

- 전체: `NativeSelect`에 `disabled` → 래퍼가 `opacity-50`으로 흐려지고 클릭이 막힙니다.
- 개별: `NativeSelectOption`에 `disabled` → 목록에는 보이지만 고를 수 없습니다(품절·마감 표시에 적합).

### 6. 제어 모드 — `value` / `onChange`

값을 바깥 state로 쥐려면 `value` + `onChange`를 씁니다. **`Select`의 `onValueChange`와 달리 이벤트 객체를 받으므로 `e.target.value`로 값을 읽습니다.**

---

<img
  src="../assets/ui/native-select-controlled.png"
  alt="NativeSelect 제어 모드와 유효성"
  width="100%"
/>

```tsx
import { useState } from "react";

function Example() {
  const [city, setCity] = useState(""); // '' = 미선택
  const [submitted, setSubmitted] = useState(false);
  const invalid = submitted && city === "";

  return (
    <div className="grid gap-2">
      <Label htmlFor="ctl-city">배송 지역 (필수)</Label>
      <NativeSelect
        id="ctl-city"
        className="w-full"
        // highlight-start
        aria-invalid={invalid}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        // highlight-end
      >
        <NativeSelectOption value="" disabled>
          지역을 선택하세요
        </NativeSelectOption>
        <NativeSelectOption value="seoul">서울</NativeSelectOption>
        <NativeSelectOption value="busan">부산</NativeSelectOption>
      </NativeSelect>

      {invalid && (
        <p className="text-xs text-red-600">배송 지역을 선택해 주세요.</p>
      )}
      <Button onClick={() => setSubmitted(true)}>제출</Button>
    </div>
  );
}
```

- `value`를 넘기면 **제어 모드**가 되므로 반드시 `onChange`로 state를 갱신해야 값이 바뀝니다.
- `aria-invalid`를 주면 **에러 스타일(빨간 테두리 + 링)이 자동 적용**됩니다. 별도 클래스를 만들 필요가 없습니다.
- "부산으로 설정" 같은 **외부 버튼으로 값 바꾸기**도 `setCity('busan')` 한 줄이면 됩니다.

### 7. 폼 전송 — `name` / `required`

네이티브 `<select>`이므로 `name`만 주면 `FormData`에 값이 그대로 담깁니다. hidden input을 따로 만들 필요가 없습니다.

```tsx
<form onSubmit={handleSubmit}>
  <NativeSelect name="city" required defaultValue="">
    <NativeSelectOption value="" disabled>
      도시를 선택하세요
    </NativeSelectOption>
    <NativeSelectOption value="seoul">서울</NativeSelectOption>
  </NativeSelect>
  <Button type="submit">전송</Button>
</form>;

// handleSubmit
const fd = new FormData(e.currentTarget);
console.log(fd.get("city")); // 'seoul'
```

- `required` + `value=""` placeholder 조합이면 미선택 상태에서 제출 시 **브라우저 기본 경고 말풍선**이 뜹니다.
- 브라우저 말풍선 대신 화면 안에 에러 문구를 그리고 싶으면 [6. 제어 모드](#6-제어-모드--value--onchange)처럼 직접 검증하세요.

---

## API 레퍼런스

---

`NativeSelect`는 표준 `<select>`를 감싼 얇은 래퍼라, 아래 표에 없는 **HTML `select` 속성(`autoFocus`, `onBlur`, `form` 등)도 그대로 전달**됩니다.

### `NativeSelect`

| Prop           | 타입                | 기본값      | 설명                                                                |
| -------------- | ------------------- | ----------- | ------------------------------------------------------------------- |
| `size`         | `"sm" \| "default"` | `"default"` | 높이 변형 (`sm`=h-7, `default`=h-8). **네이티브 행 수 속성이 아님** |
| `value`        | `string`            | —           | 제어 모드 값. `onChange`와 함께 사용                                |
| `onChange`     | `(e) => void`       | —           | 값 변경 콜백. `e.target.value`로 읽음                               |
| `defaultValue` | `string`            | —           | 초기 선택값(비제어)                                                 |
| `disabled`     | `boolean`           | `false`     | 전체 비활성화 (래퍼가 `opacity-50`)                                 |
| `name`         | `string`            | —           | 폼 전송 키. 네이티브라 `FormData`에 그대로 담김                     |
| `required`     | `boolean`           | `false`     | 브라우저 기본 필수값 검사                                           |
| `id`           | `string`            | —           | `Label`의 `htmlFor`와 연결                                          |
| `aria-invalid` | `boolean`           | —           | 에러 스타일(빨간 테두리·링) 적용                                    |
| `className`    | `string`            | —           | ⚠️ **래퍼(div)** 에 적용. 셀렉트 박스는 `data-slot` 선택자로        |
| `children`     | `ReactNode`         | —           | `NativeSelectOption` / `NativeSelectOptGroup`                       |

### `NativeSelectOption`

| Prop        | 타입        | 기본값  | 설명                                     |
| ----------- | ----------- | ------- | ---------------------------------------- |
| `value`     | `string`    | —       | 항목 값. placeholder는 `value=""`        |
| `disabled`  | `boolean`   | `false` | 이 항목만 선택 불가                      |
| `children`  | `ReactNode` | —       | 표시 텍스트 (**텍스트만** — 아이콘 불가) |
| `className` | `string`    | —       | 옵션에 추가할 클래스                     |

### `NativeSelectOptGroup`

| Prop        | 타입        | 기본값  | 설명                      |
| ----------- | ----------- | ------- | ------------------------- |
| `label`     | `string`    | —       | 그룹 소제목 (선택 불가)   |
| `disabled`  | `boolean`   | `false` | 그룹 전체 선택 불가       |
| `children`  | `ReactNode` | —       | `NativeSelectOption` 목록 |
| `className` | `string`    | —       | 그룹에 추가할 클래스      |

:::note 표준 `<option>`을 써도 됩니다
`NativeSelectOption` 대신 표준 `<option>`도 그대로 동작합니다. 다만 다크 모드에서 옵션 배경색이 어색해질 수 있어, 시스템 색 보정(`bg-[Canvas] text-[CanvasText]`)이 들어간 `NativeSelectOption` 사용을 권장합니다.
:::

---

## 접근성 / 키보드

---

브라우저 기본 `<select>`라 **키보드 조작과 ARIA가 전부 무료로 따라옵니다.** 별도 구현이 필요 없습니다.

| 키                    | 동작                                                |
| --------------------- | --------------------------------------------------- |
| `Tab`                 | 셀렉트로 포커스 이동                                |
| `Space` / `Alt` + `↓` | 드롭다운 열기                                       |
| `↑` `↓`               | 이전/다음 옵션으로 이동 (닫힌 상태에서도 값이 바뀜) |
| `Home` / `End`        | 첫/마지막 옵션                                      |
| 문자 입력             | 해당 글자로 시작하는 옵션으로 점프                  |
| `Enter`               | 열린 목록에서 선택 확정                             |
| `Esc`                 | 열린 목록 닫기 (값 유지)                            |

- 라벨은 **`Label htmlFor` + `id`** 또는 `aria-label`로 반드시 연결하세요. 셀렉트만 있으면 스크린리더가 무엇을 고르는지 알리지 못합니다.
- 화살표 아이콘은 `aria-hidden`이고 `pointer-events-none`이라 **클릭·낭독을 방해하지 않습니다.**
- 에러 상태는 `aria-invalid`로 표현하고, 에러 문구는 `aria-describedby`로 연결하면 좋습니다.
- 포커스 링은 디자인 토큰 `--ring`을 따릅니다.

:::tip 모바일에서의 이점
모바일 브라우저는 네이티브 `<select>`를 **OS 피커(iOS 휠 / Android 다이얼로그)** 로 띄웁니다. 커스텀 드롭다운이 작은 화면에서 겪는 스크롤·터치 문제를 아예 만나지 않는 것이 NativeSelect의 가장 큰 장점입니다.
:::

---

## 스타일링 & 테마

---

**바꾸려는 대상에 따라 방법이 다릅니다.** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                  | 방법                                                   |
| ---------------------------- | ------------------------------------------------------ |
| 높이                         | `size` **prop** (`"sm"` / `"default"`)                 |
| 너비·바깥 여백               | `className` (래퍼에 적용됨 — 예: `w-full`)             |
| 색·테두리·포커스 링          | **디자인 토큰** (`--input`, `--ring`, `--destructive`) |
| 에러 표시                    | `aria-invalid` **속성** (스타일 내장)                  |
| 셀렉트 박스 겉모습 전체 교체 | **`data-slot` 선택자 + CSS Module**                    |
| 펼쳐진 드롭다운 목록         | ❌ **불가 — OS가 그림** (필요하면 `Select`로 교체)     |

:::caution 퍼블리셔가 먼저 알아야 할 3가지

**① `className`은 셀렉트가 아니라 "래퍼"에 붙습니다.**
`NativeSelect`에 준 `className`은 `[data-slot="native-select-wrapper"]`로 갑니다. 실제 셀렉트 박스는 그 안의 `[data-slot="native-select"]`이므로, 자손 선택자(`.field [data-slot="native-select"]`)로 파고들어 스타일합니다.

**② 펼쳐진 드롭다운 목록은 OS가 그려서 못 바꿉니다.**
여기서 바꾸는 건 "**닫힌** 셀렉트 박스"의 모양(테두리·높이·라운드·색·화살표)입니다. 옵션 목록의 폰트·배경을 픽셀 단위로 맞춰야 한다면, 그건 NativeSelect가 아니라 **`Select`(radix)** 를 써야 한다는 신호입니다.

**③ 화살표는 이미 커스텀 아이콘입니다.**
컴포넌트가 `appearance-none`으로 OS 기본 화살표를 숨기고 `[data-slot="native-select-icon"]`으로 ChevronDown을 얹었습니다. 위치·색은 이 슬롯으로 조정하세요.
:::

### data-slot 목록

| data-slot                              | 대상                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| `[data-slot="native-select-wrapper"]`  | 래퍼 div. `className`이 붙는 곳. `data-size` 보유      |
| `[data-slot="native-select"]`          | 실제 `<select>` 박스. `data-size`, `aria-invalid` 보유 |
| `[data-slot="native-select-icon"]`     | 화살표(ChevronDown) 아이콘                             |
| `[data-slot="native-select-option"]`   | 옵션 (`NativeSelectOption` 사용 시)                    |
| `[data-slot="native-select-optgroup"]` | 옵션 그룹 (`NativeSelectOptGroup` 사용 시)             |

### CSS Module로 겉모습 교체

`.tsx`는 건드리지 말고 CSS Module에서 슬롯을 덮어씁니다.

```css title="MyField.module.css — className={styles.field} 를 NativeSelect 에 전달"
/* 셀렉트 박스 (className 은 래퍼로 가므로 자손으로 파고든다) */
.field [data-slot="native-select"] {
  /* 테두리·높이·라운드·색 */
}
.field [data-slot="native-select"]:hover {
}
.field [data-slot="native-select"]:focus-visible {
  /* 포커스 링 */
}
.field [data-slot="native-select"][aria-invalid="true"] {
  /* 에러 상태 */
}

/* 크기 변형별로 다르게 */
.field [data-slot="native-select"][data-size="sm"] {
}

/* 화살표 아이콘 — 위치·색 */
.field [data-slot="native-select-icon"] {
}

/* 다크 모드는 앱 규칙(.dark)에 맞춰 */
:global(.dark) .field [data-slot="native-select"] {
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(명시도 `0,1,0`)입니다. `.field [data-slot="native-select"]`처럼 **클래스 + 속성 조합이면 `0,2,0`** 이라 `!important` 없이 안정적으로 덮어씁니다.
CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---

## 실전 예제

---

제공 `NativeSelect`를 **손대지 않고** `*.module.css`만으로 완전히 다른 톤을 입힌 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트에서 확인하세요.

### 목록 하단 그리드 툴바

정렬 기준 / 페이지당 개수를 고르는 툴바를, 알약(pill) 톤 셀렉트로 재스타일링했습니다. 실제 SI 프로젝트에서 퍼블리셔가 하게 될 작업 형태를 그대로 보여줍니다.

---

<img
  src="../assets/ui/native-select-real-toolbar.png"
  alt="그리드 툴바 NativeSelect"
  width="100%"
/>

**포인트**

- 제공 `NativeSelect`를 **그대로** 쓰고(`size="sm"` + `value`/`onChange`), 동작·접근성은 컴포넌트에 맡깁니다.
- `className={styles.field}`가 래퍼로 가므로, CSS에서 `[data-slot='native-select']`로 **파고들어** 셀렉트 박스를 알약 형태로 바꿨습니다.
- 화살표 위치는 `[data-slot='native-select-icon']`으로, 에러 스타일은 `[aria-invalid='true']`로 잡습니다.
- 눈에 보이는 라벨 텍스트는 툴바 안 `<span>`이고, 셀렉트에는 `aria-label`을 따로 줬습니다.

<details>
<summary><b>GridToolbarNativeSelect.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/native-select/GridToolbarNativeSelect.tsx"
import { useMemo, useState } from "react";
import { NativeSelect, NativeSelectOption } from "@axiom/components/ui";
import styles from "./GridToolbarNativeSelect.module.css";

const TOTAL = 1284;

const SORTS = [
  { value: "recent", label: "최신 등록순" },
  { value: "name", label: "이름 오름차순" },
  { value: "amount", label: "금액 높은순" },
];

const SIZES = ["10", "20", "50", "100"];

export default function GridToolbarNativeSelect(): React.ReactNode {
  const [sort, setSort] = useState("recent");
  const [size, setSize] = useState("20");

  const pageCount = useMemo(() => Math.ceil(TOTAL / Number(size)), [size]);

  return (
    <div className={styles.bar}>
      <span className={styles.total}>
        총 <b>{TOTAL.toLocaleString()}</b>건 · <b>{pageCount}</b>페이지
      </span>

      <span className={styles.spacer} />

      <label className={styles.control}>
        <span className={styles.label}>정렬</span>
        {/* className 은 래퍼로 → CSS 에서 [data-slot='native-select'] 로 파고든다 */}
        {/* highlight-start */}
        <NativeSelect
          size="sm"
          className={styles.field}
          aria-label="정렬 기준"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {/* highlight-end */}
          {SORTS.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      <label className={styles.control}>
        <span className={styles.label}>페이지당</span>
        <NativeSelect
          size="sm"
          className={styles.field}
          aria-label="페이지당 표시 개수"
          value={size}
          onChange={(e) => setSize(e.target.value)}
        >
          {SIZES.map((n) => (
            <NativeSelectOption key={n} value={n}>
              {n}개씩
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
    </div>
  );
}
```

</details>

<details>
<summary><b>GridToolbarNativeSelect.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/native-select/GridToolbarNativeSelect.module.css"
.bar {
  /* 이 예제 전용 색 토큰 */
  --gt-brand: #4f46e5;
  --gt-ink: #1f2937;
  --gt-sub: #6b7280;
  --gt-card: #ffffff;
  --gt-line: #e5e7eb;
  --gt-bg: #fafafa;

  color: var(--gt-ink);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--gt-line);
  border-radius: 14px;
  background: var(--gt-bg);
  padding: 12px 16px;
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .bar {
  --gt-brand: #a5b4fc;
  --gt-ink: #f3f4f6;
  --gt-sub: #9ca3af;
  --gt-card: #17181c;
  --gt-line: #2e3138;
  --gt-bg: #121317;
}

/* 라벨 + 셀렉트 한 쌍 */
.control {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gt-sub);
  white-space: nowrap;
}

/* ── 셀렉트 박스 재스타일 ────────────────────────────────
 * className 은 래퍼(.field)에 붙으므로, 실제 select 는 자손으로 파고든다. */
/* highlight-start */
.field [data-slot="native-select"] {
  height: 34px;
  min-width: 96px;
  border-radius: 999px; /* 알약(pill) 형태 */
  border: 1px solid var(--gt-line);
  background: var(--gt-card);
  color: var(--gt-ink);
  font-size: 13px;
  font-weight: 600;
  padding-left: 14px;
  padding-right: 30px;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
/* highlight-end */
.field [data-slot="native-select"]:hover {
  border-color: var(--gt-brand);
}
.field [data-slot="native-select"]:focus-visible {
  border-color: var(--gt-brand);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.16);
  outline: none;
}
/* 에러 상태 — aria-invalid 를 그대로 활용 */
.field [data-slot="native-select"][aria-invalid="true"] {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
}

/* 화살표 아이콘 위치/색 조정 */
.field [data-slot="native-select-icon"] {
  right: 10px;
  color: var(--gt-sub);
}

/* 옵션 목록(펼침)은 OS 가 그리므로 배경/글자색 정도만 힌트를 줄 수 있다. */
.field [data-slot="native-select"] option {
  background: var(--gt-card);
  color: var(--gt-ink);
  font-weight: 500;
}
```

</details>

:::tip 이 예제에서 가져갈 것
동작(열림·키보드·폼 전송)은 **브라우저와 컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`size` 등 prop ②`data-slot` 오버라이드 ③툴바 쪽 내 마크업 세 가지뿐입니다. `native-select.tsx`를 복사해서 고치지 마세요.
:::

---
