---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Combobox"
hide_table_of_contents: false
---

{/* import AutoHeightStorybookIframe from '../../../src/components/AutoHeightStorybookIframe'; */}

{/*
## Combobox 인터랙티브 예제
---
<AutoHeightStorybookIframe
  storyPath="/docs/components-combobox--docs"
  title="Combobox 인터랙티브 예제"
  minHeight={600}
/>
---
*/}

# Combobox 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 콤보박스 컴포넌트입니다.  
**입력창에 타이핑해서 목록을 좁혀가며 선택하는** 자동완성형 컨트롤입니다.

**언제 쓰나요?**

* 옵션이 **10개 이상**이라 스크롤로 찾기 번거로운 목록 (국가·은행·상품 코드 등)
* 사용자가 **이름 일부를 알고 있어** 타이핑으로 찾는 편이 빠른 경우
* **여러 개를 골라 칩(chip)으로 쌓아두는** 태그·수신자 입력

---


## Select와 무엇이 다른가
---

둘 다 "목록에서 고른다"는 점은 같지만, **입력창이 있느냐(검색 가능한가)** 가 결정적인 차이입니다.

| | **Combobox** | **Select** |
| --- | --- | --- |
| 기반 라이브러리 | Base UI (`@base-ui/react`) | Radix (`radix-ui`) |
| 클릭하는 대상 | **텍스트 입력창**(`ComboboxInput`) | **버튼**(`SelectTrigger`) |
| 타이핑 검색·필터 | ✅ 입력한 문자열로 목록이 **자동 필터링** | ❌ (첫 글자 점프만 지원) |
| 다중 선택 | ✅ `multiple` + 칩 UI | ❌ 단일 선택만 |
| 선택 해제(지우기) | ✅ `showClear` prop | ❌ 직접 구현해야 함 |
| 값 타입 | 문자열 **또는 객체**(`itemToStringValue`로 검색 키 지정) | 문자열만 (`SelectItem`의 `value`) |
| 항목 정의 방식 | `items` 배열 + **렌더 prop** | JSX로 `SelectItem`을 직접 나열 |

**고르는 기준**

* 옵션이 적고(대략 2~10개) 고정되어 있다 → **Select**. 마크업이 단순하고 모바일에서도 다루기 쉽습니다.
* 옵션이 많거나 사용자가 검색으로 찾아야 한다 → **Combobox**.
* 여러 개를 동시에 선택해야 한다 → **Combobox**(`multiple`). Select로는 불가능합니다.

:::caution 기반 라이브러리가 다릅니다
Select는 Radix, Combobox는 **Base UI** 기반입니다. 그래서 Select에서 쓰던 `SelectItem value="..."` 나열 방식이 Combobox에는 통하지 않고, 반대로 `items` 배열 + 렌더 prop이 필수입니다. Radix 문서를 그대로 대입하지 마세요.
:::

---


## Import
---

```tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@axiom/components/ui';
```

Combobox는 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 다중 선택·그룹까지 쓰려면 아래 파트가 추가로 필요합니다.

```tsx
import {
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxSeparator,
  ComboboxTrigger,
  useComboboxAnchor,
} from '@axiom/components/ui';
```

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/combobox.tsx`(Base UI `Combobox` 기반)이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
:::

---


## 기본 사용법
---

문자열 배열을 `items`로 넘기고, `ComboboxList`의 **렌더 prop**으로 각 항목을 그립니다. 입력창에 타이핑하면 목록이 자동으로 걸러집니다.

<img src="../assets/ui/combo-basic.png" alt="기본 콤보박스" width="80%" />

```tsx
const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'];

<Combobox items={frameworks}>
  <ComboboxInput placeholder="프레임워크 선택..." />
  <ComboboxContent>
    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
    <ComboboxList>
      {(item) => (
        <ComboboxItem key={item} value={item}>
          {item}
        </ComboboxItem>
      )}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

:::tip `ComboboxList`의 자식은 JSX가 아니라 **함수**입니다
`<ComboboxList>{(item) => ...}</ComboboxList>` 처럼 **아이템 하나를 받아 엘리먼트를 돌려주는 함수**를 넘깁니다. 필터링된 결과만 순회하도록 Base UI가 이 함수를 대신 호출하기 때문에, 직접 `items.map(...)`으로 그리면 **검색 필터가 동작하지 않습니다.**
:::

:::info 체크 표시는 자동입니다
선택된 항목의 오른쪽 체크 아이콘(`CheckIcon`)은 `ComboboxItem`이 내부에서 `ItemIndicator`로 렌더합니다. 직접 넣을 필요가 없습니다.
:::

---


## 구성 (Anatomy)
---

```tsx
<Combobox>                  {/* 루트 — items·선택값·필터 상태를 관리 */}
  <ComboboxInput />         {/* 입력창 + 토글 버튼(+ 선택적 지우기 버튼) */}
  <ComboboxContent>         {/* 포털 + 위치 계산된 팝업 */}
    <ComboboxEmpty />       {/* 결과 0건일 때만 표시 */}
    <ComboboxList>          {/* 스크롤 영역. 자식은 렌더 함수 */}
      <ComboboxItem />      {/* 항목 하나 (체크 표시 내장) */}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

| 파트 | 역할 |
| --- | --- |
| `Combobox` | 루트. `items`·`value`·`multiple` 등 동작 전반을 관리합니다. |
| `ComboboxInput` | 입력창. 내부적으로 `InputGroup` + 토글 트리거 버튼으로 조립되어 있습니다. |
| `ComboboxContent` | 드롭다운 팝업. 포털로 띄우고 위치(`side`/`align`)를 계산합니다. |
| `ComboboxList` | 항목 스크롤 영역. **자식은 렌더 함수**입니다. |
| `ComboboxItem` | 항목 하나. 선택 시 체크 아이콘이 자동으로 붙습니다. |
| `ComboboxEmpty` | 필터 결과가 없을 때만 보이는 안내 문구. |
| `ComboboxGroup` / `ComboboxLabel` / `ComboboxCollection` / `ComboboxSeparator` | 항목 그룹화용. |
| `ComboboxChips` / `ComboboxValue` / `ComboboxChip` / `ComboboxChipsInput` | 다중 선택 시 입력창을 대체하는 칩 UI. |
| `ComboboxTrigger` / `ComboboxClear` | `ComboboxInput`이 내부에서 쓰는 버튼. 직접 조립할 때만 사용합니다. |

:::note `ComboboxInput`은 단순 래퍼가 아닙니다
`ComboboxInput`은 `InputGroup` + `InputGroupInput` + 우측 아이콘 영역(토글/지우기)을 한 번에 그려주는 조립품입니다. 그래서 `showTrigger`·`showClear`·`disabled`처럼 **원본 Base UI Input에는 없는 prop**을 추가로 받습니다.
:::

---


## 데이터 바인딩
---

### 1. 문자열 배열

가장 단순한 형태. `items`에 넘긴 문자열이 그대로 검색 대상이자 선택값이 됩니다.

```tsx
const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js'];

<Combobox items={frameworks}> … </Combobox>
```

### 2. 객체 배열 — `itemToStringValue`

아이템이 객체면 **무엇으로 검색하고 무엇을 입력창에 표시할지** 알려줘야 합니다. 그 역할이 `itemToStringValue`입니다.

{/* <img src="../assets/ui/combobox-object.png" alt="객체 아이템" width="80%" /> */}

```tsx
type Framework = { label: string; value: string };

const frameworkObjects: Framework[] = [
  { label: 'Next.js', value: 'next' },
  { label: 'SvelteKit', value: 'sveltekit' },
];

<Combobox
  items={frameworkObjects}
  // highlight-next-line
  itemToStringValue={(f) => f.label}
>
  <ComboboxInput placeholder="프레임워크 선택..." />
  <ComboboxContent>
    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
    <ComboboxList>
      {(framework) => (
        <ComboboxItem key={framework.value} value={framework}>
          {framework.label}
        </ComboboxItem>
      )}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

* `itemToStringValue`를 빠뜨리면 입력창에 `[object Object]`가 찍히고 검색도 되지 않습니다.
* 이때 `value`/`onValueChange`가 주고받는 값은 **문자열이 아니라 객체 그 자체**입니다. 서버로는 `selected?.value`처럼 필요한 필드만 꺼내 보내세요.

### 3. 항목 안에 아이콘·부가정보 넣기

`ComboboxItem`의 자식은 자유롭게 구성할 수 있습니다. 검색은 `itemToStringValue`가 돌려준 문자열로만 이뤄집니다.

---
<img src="../assets/ui/combo-icon.png" alt="커스텀 항목 렌더링" width="80%" />

```tsx
type Country = { label: string; value: string; flag: string };

<Combobox items={countries} itemToStringValue={(c) => c.label}>
  <ComboboxInput placeholder="국가 선택..." />
  <ComboboxContent>
    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
    <ComboboxList>
      {(country) => (
        <ComboboxItem key={country.value} value={country}>
          <span>{country.flag}</span>
          {country.label}
        </ComboboxItem>
      )}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

:::tip 국기·아이콘까지 검색되게 하려면
검색 문자열은 `itemToStringValue`의 반환값 하나뿐입니다. 국가명과 영문명을 모두 검색 대상으로 삼고 싶다면 `` (c) => `${c.label} ${c.enName}` `` 처럼 **합쳐서** 돌려주세요.
:::

---


## 상태 관리 — 비제어 / 제어
---

### 1. 비제어 — `defaultValue`

초기 선택값만 지정하고 이후는 컴포넌트에 맡깁니다.

```tsx
<Combobox items={frameworks} defaultValue="Remix"> … </Combobox>
```

### 2. 제어 — `value` + `onValueChange`

선택값을 화면 로직과 엮어야 하면 제어 모드를 씁니다.

{/* <img src="../assets/ui/combobox-controlled.png" alt="제어형 콤보박스" width="80%" /> */}

```tsx
import { useState } from 'react';

function Example() {
  const [selected, setSelected] = useState('');

  return (
    <>
      <Combobox
        items={frameworks}
        // highlight-start
        value={selected}
        onValueChange={(value) => setSelected(value ?? '')}
        // highlight-end
      >
        <ComboboxInput placeholder="프레임워크 선택..." showClear />
        <ComboboxContent>
          <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <span>선택값: {selected || '없음'}</span>
    </>
  );
}
```

:::caution `onValueChange`의 인자는 `null`일 수 있습니다
지우기 버튼(`showClear`)을 누르거나 선택이 해제되면 **`null`이 전달**됩니다. `setSelected`를 그대로 넘기면 상태에 `null`이 들어가 `value`가 비제어로 흔들릴 수 있으므로, 위처럼 `value ?? ''`로 좁혀서 넣으세요.
:::

`value`를 넘기는 순간 제어 모드가 되므로, `onValueChange`로 상태를 갱신하지 않으면 **아무리 클릭해도 선택되지 않습니다.**

---


## 다중 선택 — `multiple` + 칩 UI
---

`multiple`을 켜면 `value`가 **배열**이 되고, 입력창 자리에는 `ComboboxInput` 대신 **칩 묶음**(`ComboboxChips`)을 놓습니다.

---
<img src="../assets/ui/combo-multi.png" alt="다중 선택" width="80%" />

```tsx
const [value, setValue] = useState<string[]>([]);

<Combobox
  items={frameworks}
  // highlight-start
  multiple
  value={value}
  onValueChange={setValue}
  // highlight-end
>
  <ComboboxChips>
    <ComboboxValue>
      {value.map((item) => (
        <ComboboxChip key={item}>{item}</ComboboxChip>
      ))}
    </ComboboxValue>
    <ComboboxChipsInput placeholder="프레임워크 추가..." />
  </ComboboxChips>

  <ComboboxContent>
    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
    <ComboboxList>
      {(item) => (
        <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
      )}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

* `ComboboxChips` — 칩과 입력창을 감싸는 테두리 상자. 포커스 링·`aria-invalid` 스타일이 여기에 붙습니다.
* `ComboboxValue` — 현재 선택값을 자식 함수/노드로 펼치는 자리.
* `ComboboxChip` — 칩 하나. **`showRemove`(기본 `true`)** 로 × 버튼을 끌 수 있습니다.
* `ComboboxChipsInput` — 칩 옆에 붙는 얇은 입력창. `ComboboxInput`과 달리 테두리·토글 버튼이 없습니다.

:::caution `multiple`에는 `ComboboxInput`을 쓰지 마세요
`ComboboxInput`은 `InputGroup` 테두리를 자체적으로 그리기 때문에, 칩 UI와 함께 쓰면 테두리가 이중으로 생깁니다. 다중 선택에서는 **`ComboboxChips` + `ComboboxChipsInput` 조합**이 정답입니다.
:::

:::tip 팝업 폭을 칩 상자에 맞추기
칩이 늘어나면 상자 높이가 변합니다. 팝업을 칩 상자 기준으로 정렬하려면 `useComboboxAnchor()`로 만든 ref를 `ComboboxChips`에 걸고 `ComboboxContent`에 `anchor`로 넘기세요. `anchor`가 지정되면 팝업은 `data-chips="true"` 상태가 되어 **앵커 폭을 그대로** 따릅니다.

```tsx
const anchor = useComboboxAnchor();

<ComboboxChips ref={anchor}> … </ComboboxChips>
<ComboboxContent anchor={anchor}> … </ComboboxContent>
```
:::

---


## 그룹 구분
---

항목을 카테고리로 묶을 때는 `ComboboxGroup` + `ComboboxLabel` + `ComboboxCollection`을 씁니다. **`items`에는 그룹을 펼친 전체 배열**을 넘기고, 각 그룹에서 자신에게 속한 항목만 렌더합니다.

<img src="../assets/ui/combo-group.png" alt="그룹 구분" width="80%" />

```tsx
const groupedItems = {
  프론트엔드: ['React', 'Vue', 'Svelte', 'Angular'],
  백엔드: ['Node.js', 'Django', 'Spring', 'Rails'],
};

// highlight-next-line
<Combobox items={Object.values(groupedItems).flat()}>
  <ComboboxInput placeholder="기술 스택 선택..." />
  <ComboboxContent>
    <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
    <ComboboxList>
      <ComboboxGroup>
        <ComboboxLabel>프론트엔드</ComboboxLabel>
        <ComboboxCollection>
          {(item: string) =>
            groupedItems.프론트엔드.includes(item) ? (
              <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
            ) : null
          }
        </ComboboxCollection>
      </ComboboxGroup>

      <ComboboxSeparator />

      <ComboboxGroup>
        <ComboboxLabel>백엔드</ComboboxLabel>
        <ComboboxCollection>
          {(item: string) =>
            groupedItems.백엔드.includes(item) ? (
              <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
            ) : null
          }
        </ComboboxCollection>
      </ComboboxGroup>
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

* `ComboboxCollection`은 `ComboboxList`와 같은 **렌더 함수 방식**입니다. 소속이 아닌 항목은 `null`을 돌려 건너뜁니다.
* `ComboboxSeparator`는 그룹 사이 구분선입니다. 필터로 한쪽 그룹이 비어도 구분선은 남으므로, 그룹 수가 많다면 생략하는 편이 깔끔합니다.

---


## 입력창 옵션
---

아래 세 가지는 모두 **`ComboboxInput`에 주는** prop입니다(루트가 아닙니다).

### 1. 지우기 버튼 — `showClear`

```tsx
<ComboboxInput placeholder="프레임워크 선택..." showClear />
```

선택값이 있을 때 × 버튼이 나타납니다. 이 버튼이 보이는 동안에는 토글 트리거(∨)가 자동으로 숨겨집니다.

{/* <img src="../assets/ui/combobox-clear.png" alt="지우기 버튼" width="80%" /> */}

### 2. 토글 버튼 숨기기 — `showTrigger`

```tsx
// 기본값 true — 우측 ∨ 버튼으로 목록을 열 수 있음
<ComboboxInput showTrigger={false} />
```

`false`로 두면 순수 입력창처럼 보이고, **타이핑으로만** 목록이 열립니다. 검색 필드 느낌을 낼 때 씁니다.

### 3. 비활성화 — `disabled`

```tsx
<ComboboxInput placeholder="비활성화됨" disabled />
```

{/* <img src="../assets/ui/combobox-disabled.png" alt="비활성화" width="80%" /> */}

:::caution `disabled`는 `ComboboxInput`에 주세요
`ComboboxInput`은 받은 `disabled`를 내부 입력창·토글 버튼·지우기 버튼에 각각 내려보냅니다. 루트 `Combobox`에만 주면 **버튼이 살아 있는 것처럼 보이는** 어정쩡한 상태가 됩니다.
:::

### 4. 오류 상태 — `aria-invalid`

```tsx
<ComboboxInput placeholder="필수 항목입니다" aria-invalid="true" />
```

{/* <img src="../assets/ui/combobox-invalid.png" alt="오류 상태" width="80%" /> */}

테두리가 `--destructive` 색으로 바뀌고 오류 링이 표시됩니다. 다중 선택이라면 `ComboboxChips`에 걸어야 같은 스타일이 적용됩니다. **오류 문구는 컴포넌트가 만들어 주지 않으므로** 본문에 직접 두고 `aria-describedby`로 연결하세요.

---


## 자동 하이라이트 — `autoHighlight`
---

```tsx
<Combobox items={frameworks} autoHighlight> … </Combobox>
```

타이핑으로 목록이 걸러질 때마다 **첫 번째 항목이 자동으로 강조**됩니다. 곧바로 `Enter`를 눌러 선택할 수 있어 입력 속도가 빨라집니다.

* 후보가 대체로 1~2개로 좁혀지는 검색(우편번호·사번 등)에 잘 맞습니다.
* 반대로 오타 한 글자에 엉뚱한 항목이 잡힐 수 있으니, **잘못 선택하면 곤란한 값**(결제 계좌 등)에는 켜지 마세요.

---


## API 레퍼런스
---

Base UI Combobox 기반이라 아래 표에 없는 Base UI 표준 prop도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

### `Combobox` (루트)

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `items` | `T[]` | — | 목록 데이터. 문자열 배열 또는 객체 배열 |
| `itemToStringValue` | `(item: T) => string` | — | 객체 아이템의 검색·표시용 문자열 변환. **객체를 쓰면 필수** |
| `value` | `T \| T[] \| null` | — | 선택값(제어). `multiple`이면 배열 |
| `defaultValue` | `T \| T[]` | — | 초기 선택값(비제어) |
| `onValueChange` | `(value) => void` | — | 선택 변경 콜백. 해제 시 `null`이 올 수 있음 |
| `multiple` | `boolean` | `false` | 다중 선택 활성화 |
| `autoHighlight` | `boolean` | `false` | 필터링 시 첫 항목 자동 강조 |
| `disabled` | `boolean` | `false` | 전체 비활성화(시각 처리는 `ComboboxInput`에 주는 편이 정확) |
| `name` | `string` | — | 폼 제출용 name |

### `ComboboxInput`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `placeholder` | `string` | — | 입력 안내 문구 |
| `showTrigger` | `boolean` | `true` | 우측 목록 토글(∨) 버튼 표시 |
| `showClear` | `boolean` | `false` | 지우기(×) 버튼 표시. 표시되면 토글 버튼은 숨김 |
| `disabled` | `boolean` | `false` | 입력창·토글·지우기 버튼 일괄 비활성화 |
| `aria-invalid` | `"true" \| "false"` | — | 오류 상태 표시 |
| `className` | `string` | — | 감싸는 `InputGroup`에 추가할 클래스 |

### `ComboboxContent`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `side` | `"top" \| "bottom" \| "left" \| "right" \| …` | `"bottom"` | 팝업이 열리는 방향 |
| `sideOffset` | `number` | `6` | 앵커와의 간격(px) |
| `align` | `"start" \| "center" \| "end"` | `"start"` | 정렬 기준 |
| `alignOffset` | `number` | `0` | 정렬 방향 추가 오프셋 |
| `anchor` | `Ref \| Element` | — | 위치 기준 요소. 칩 UI에서 `useComboboxAnchor()`와 함께 사용 |
| `className` | `string` | — | 팝업에 추가할 클래스 |

### 그 외 파트

| 파트 | 주요 prop | 설명 |
| --- | --- | --- |
| `ComboboxList` | `children: (item) => ReactNode` | 필터링된 항목만 순회하는 렌더 함수 |
| `ComboboxItem` | `value: T`, `disabled` | 항목 하나. 체크 아이콘 내장 |
| `ComboboxCollection` | `children: (item) => ReactNode` | 그룹 내부 전용 렌더 함수 |
| `ComboboxChip` | `showRemove`(기본 `true`) | 칩 하나. × 버튼 표시 여부 |
| `ComboboxEmpty` | `children` | 결과 0건일 때만 표시되는 문구 |
| `useComboboxAnchor()` | — | 팝업 앵커용 ref 생성 훅 |

---


## 접근성 / 키보드
---

Base UI 기반이라 ARIA 속성(`role="combobox"`, `aria-expanded`, `aria-activedescendant`)과 키보드 조작이 기본 내장되어 있습니다.

| 키 | 동작 |
| --- | --- |
| 문자 입력 | 목록 필터링 (팝업이 닫혀 있으면 자동으로 열림) |
| `↓` / `↑` | 다음 / 이전 항목으로 하이라이트 이동 |
| `Home` / `End` | 첫 / 마지막 항목으로 이동 |
| `Enter` | 하이라이트된 항목 선택 |
| `Esc` | 팝업 닫기 |
| `Backspace` | (다중 선택, 입력값이 빈 상태) 마지막 칩 삭제 |
| `Tab` | 팝업을 닫고 다음 초점 요소로 이동 |

* 입력창에는 **레이블을 직접 연결**해야 합니다. `Label htmlFor` 또는 `aria-label` 중 하나는 반드시 두세요.
* 포커스 링은 디자인 토큰 `--ring`을 따릅니다. 다중 선택은 `ComboboxChips`가 `focus-within`으로 링을 그립니다.
* 검색 결과가 없을 때 `ComboboxEmpty`를 비워두면 스크린리더에 아무것도 읽히지 않습니다. **안내 문구를 반드시 넣으세요.**

---


## 스타일링 & 테마
---

바꾸려는 대상에 따라 방법이 다릅니다. 위에서 아래로 갈수록 세밀합니다.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 토글/지우기 버튼 표시 여부 | `showTrigger` / `showClear` **prop** |
| 팝업 위치·간격 | `ComboboxContent`의 `side` / `align` / `sideOffset` |
| 색상(테두리·강조·텍스트) | **디자인 토큰**(`--border`, `--accent`, `--popover` 등) |
| 이 인스턴스만 폭·여백 | 각 파트의 **`className`** |
| 겉모습 전체 교체 | **`data-slot` 선택자 + CSS Module** |

### 1. 폭 조절

`ComboboxInput`은 기본이 `w-auto`입니다. 폼 필드로 쓸 때는 폭을 직접 주세요. 팝업은 `--anchor-width`를 따라가므로 **입력창 폭만 정하면 팝업도 함께 맞춰집니다.**

```tsx
<ComboboxInput className="w-full" placeholder="검색..." />
```

### 2. `data-slot` 오버라이드

| data-slot | 대상 |
| --- | --- |
| `[data-slot="combobox-trigger"]` | 우측 토글(∨) 버튼 |
| `[data-slot="combobox-clear"]` | 지우기(×) 버튼 |
| `[data-slot="combobox-content"]` | 드롭다운 팝업 |
| `[data-slot="combobox-list"]` | 항목 스크롤 영역 |
| `[data-slot="combobox-item"]` | 항목 (강조 시 `data-highlighted`) |
| `[data-slot="combobox-group"]` / `[data-slot="combobox-label"]` | 그룹 / 그룹 제목 |
| `[data-slot="combobox-separator"]` | 그룹 구분선 |
| `[data-slot="combobox-empty"]` | 결과 없음 문구 |
| `[data-slot="combobox-chips"]` / `[data-slot="combobox-chip"]` / `[data-slot="combobox-chip-remove"]` | 칩 상자 / 칩 / 칩 삭제 버튼 |
| `[data-slot="combobox-chip-input"]` | 칩 옆 입력창 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯 2단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap :global([data-slot='combobox-item'][data-highlighted]) {
  background: var(--primary);
  color: var(--primary-foreground);
}
.wrap :global([data-slot='combobox-chip']) {
  border-radius: 999px;
}
```

:::caution 팝업은 포털로 나갑니다
`ComboboxContent`는 `Portal`로 `<body>` 아래에 렌더됩니다. 따라서 **래퍼 클래스(`.wrap`) 하위 선택자로는 팝업 내부에 닿지 않습니다.** 팝업을 재스타일링하려면 `ComboboxContent`에 `className`을 직접 주거나, 전역 스코프에서 `[data-slot='combobox-content']`를 선택하세요.
:::

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...] [data-slot=...]`처럼 **여러 단계로 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 예제 화면
---

위 사용법을 한 화면에 모아둔 예제 페이지가 scaffold에 포함되어 있습니다. 실제로 타이핑·선택해 보며 동작을 확인하세요.

```txt title="예제 소스 위치"
src/domains/example/pages/ui-components/ComboboxComponent.tsx
```

**이 예제에서 확인할 수 있는 것**

* 문자열 / 객체 아이템, 커스텀 항목 렌더링(국기 + 국가명)
* 칩 기반 다중 선택과 선택값 상태 추적
* 그룹 구분, `showClear`, `autoHighlight`, `disabled`, `aria-invalid`

---
