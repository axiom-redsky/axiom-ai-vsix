---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Tabs"
hide_table_of_contents: false
---

# Tabs 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 탭 컴포넌트입니다.
**같은 자리에 여러 패널을 겹쳐 두고 한 번에 하나만** 보여줄 때 사용합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트의 `UI Components > Tabs`(`/example/ui-components/tabs`) 화면에서 확인할 수 있습니다.

**언제 쓰나요?**

- 설정 화면처럼 **성격이 다른 정보 묶음**(계정 / 알림 / 결제)을 한 화면에서 전환할 때
- 상세 페이지 안에서 **페이지 이동 없이** 개요 · 활동 내역 · 첨부파일을 갈아 끼울 때
- 같은 데이터를 **다른 관점**(일간 / 주간 / 월간)으로 번갈아 볼 때

> 항목을 **동시에 여러 개** 펼쳐 비교해야 한다면 Tabs가 아니라 [Accordion](./accordion-component)입니다. 아래 [Tabs vs Accordion](#tabs-vs-accordion) 비교를 먼저 확인하세요.

:::caution 탭은 "단계(Step)"가 아닙니다
Tabs에는 순서·진행률·유효성 개념이 없습니다. 사용자는 언제든 아무 탭이나 누를 수 있고, **비활성 탭의 내용은 DOM에서 사라집니다**([패널 내용 유지](#8-패널-내용-유지--forcemount) 참고). 가입 마법사처럼 순서가 강제되는 흐름은 탭 대신 단계별 화면으로 만드세요.
:::

---

## Tabs vs Accordion

---

둘 다 "내용을 숨겨두고 필요한 것만 보여주는" 컴포넌트지만 전제가 다릅니다. **항상 하나는 열려 있어야 하면 Tabs, 모두 닫히거나 여러 개가 동시에 열릴 수 있으면 Accordion**입니다.

| 비교 항목   | Tabs                                  | Accordion                                    |
| ----------- | ------------------------------------- | -------------------------------------------- |
| 동시에 열림 | 항상 **1개** (모두 닫힘 불가)         | `single` / `multiple` 선택, 모두 닫힘도 가능 |
| 레이아웃    | 제목이 **한 줄(또는 한 열)에 나란히** | 제목이 **세로로 쌓임**                       |
| 내용 길이   | 패널 높이가 비슷할 때 적합            | 항목마다 길이가 달라도 무방                  |
| 항목 수     | 3~6개 정도 (제목 줄이 넘치면 부적합)  | 많아도 무방                                  |
| 대표 사용처 | 설정 화면, 상세 탭, 기간별 통계       | FAQ, 약관 동의, 필터 그룹                    |
| 구현 베이스 | radix-ui Tabs                         | radix-ui Accordion                           |

Accordion 사용법은 [Accordion 문서](./accordion-component)를 참고하세요.

---

## Import

---

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@axiom/components/ui";
```

4개의 파트를 조합해서 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::note 실제 구현 위치
구현체는 `src/shared/lib/shadcn/ui/tabs.tsx`(Radix `Tabs` 기반)이며, `@axiom/components/ui` 배럴을 통해 재노출됩니다. **개별 경로가 아니라 배럴에서 import** 하세요.
스타일 정의인 `tabsListVariants`(cva)도 같은 배럴에서 export 되지만, 보통 직접 쓸 일은 없습니다.
:::

---

## 기본 사용법

---

`TabsList` 안에 `TabsTrigger`(탭 버튼)를 늘어놓고, 각 버튼과 **같은 `value`** 를 가진 `TabsContent`(패널)를 짝지어 둡니다.

<img
  src="../assets/ui/tabs-basic.png"
  alt="Tabs 기본 사용법"
  width="100%"
/>

```tsx
<Tabs defaultValue="tab-1">
  <TabsList>
    <TabsTrigger value="tab-1">계정</TabsTrigger>
    <TabsTrigger value="tab-2">비밀번호</TabsTrigger>
    <TabsTrigger value="tab-3">알림</TabsTrigger>
  </TabsList>

  <TabsContent value="tab-1">계정 정보를 관리합니다.</TabsContent>
  <TabsContent value="tab-2">비밀번호를 변경합니다.</TabsContent>
  <TabsContent value="tab-3">알림 수신 여부를 설정합니다.</TabsContent>
</Tabs>
```

- 탭 목록과 패널 사이 간격(`gap-2`)은 **루트가 이미 갖고 있습니다.** 별도 `margin`/`padding`을 줄 필요가 없습니다.
- 활성 탭 강조, 포커스 링, 화살표 키 이동은 **전부 기본 제공**입니다.

:::tip `value`는 왜 필요한가
`value`는 **트리거와 패널을 연결하는 고유 키**입니다. `defaultValue`·`value`·`onValueChange`가 모두 이 키로 탭을 가리키므로, 탭마다 서로 다른 값을 주고 **`TabsTrigger`와 `TabsContent`의 값을 정확히 일치**시키세요. 오타가 나면 탭을 눌러도 아무 패널도 나오지 않습니다.
:::

:::caution `defaultValue`를 빼면 첫 화면이 비어 보입니다
내부 기본 선택값은 **빈 문자열**입니다. `defaultValue`도 `value`도 주지 않으면 **어떤 패널도 선택되지 않아** 탭 버튼만 덩그러니 남습니다. 비제어면 `defaultValue`, 제어면 `value`를 **반드시** 지정하세요.
:::

---

## 구성 (Anatomy)

---

```tsx
<Tabs>
  {" "}
  {/* 루트 — 선택 상태 관리 + 가로/세로 레이아웃(flex) */}
  <TabsList>
    {" "}
    {/* 탭 버튼 묶음 (role="tablist") */}
    <TabsTrigger /> {/* 탭 버튼 (role="tab", value 필수) */}
  </TabsList>
  <TabsContent /> {/* 패널 (role="tabpanel", 같은 value로 매칭) */}
  {/* TabsContent 를 탭 개수만큼 반복 */}
</Tabs>
```

| 파트          | 역할                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `Tabs`        | 루트. 선택된 `value`를 관리하고, `orientation`에 따라 가로/세로로 배치합니다. |
| `TabsList`    | 탭 버튼들을 감싸는 묶음. `variant`로 배경형/밑줄형을 고릅니다.                |
| `TabsTrigger` | 탭 버튼. `value`(고유 키)를 가지며 활성 시 `data-state="active"`.             |
| `TabsContent` | 탭 패널. 같은 `value`를 가진 트리거가 선택됐을 때만 렌더됩니다.               |

:::note 루트는 flex 컨테이너입니다
`Tabs`의 기본 클래스는 `flex gap-2`(가로 모드에선 `flex-col`)입니다. 즉 **`TabsList`와 `TabsContent` 사이에 임의의 요소를 넣으면 그 요소도 flex 아이템**이 됩니다. [실전 예제](#실전-예제)에서는 이 성질을 이용해 패널들을 `<div>`로 한 번 감싸 "좌측 레일 + 우측 카드" 레이아웃을 만듭니다.
:::

### 기본 클래스 (무엇이 이미 적용돼 있는가)

내 스타일이 "왜 안 먹는지" 판단하려면 기본값을 알아야 합니다. 핵심만 추리면 아래와 같습니다.

| 파트                   | 핵심 기본 클래스                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `Tabs`                 | `group/tabs flex gap-2 data-horizontal:flex-col`                                                     |
| `TabsList` (공통)      | `inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground`             |
| `TabsList` (가로/세로) | 가로 → `h-8`, 세로 → `h-fit flex-col`                                                                |
| `TabsList` (`default`) | `bg-muted`                                                                                           |
| `TabsList` (`line`)    | `gap-1 bg-transparent rounded-none`                                                                  |
| `TabsTrigger`          | `relative h-[calc(100%-1px)] flex-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-foreground/60` |
| `TabsTrigger` (활성)   | `bg-background text-foreground shadow-sm` (line variant면 배경·그림자 없이 `after:` 밑줄)            |
| `TabsContent`          | `flex-1 text-sm outline-none`                                                                        |

여기서 **자주 문제가 되는 네 가지**를 미리 알아두세요.

- **탭 높이는 `TabsList`가 결정합니다.** 가로 모드에서 리스트가 `h-8`(32px)이고 트리거는 `h-[calc(100%-1px)]`입니다. `TabsTrigger`에만 `h-12`를 주면 리스트가 32px에 묶여 있어 넘칩니다 → **리스트에 함께** 높이를 주세요.
- **`TabsList`는 `w-fit`입니다.** 탭이 내용만큼만 차지합니다. 가로로 꽉 채우려면 `<TabsList className="w-full">`([탭 너비](#6-탭-너비--w-fit--w-full) 참고).
- **`TabsTrigger`는 `flex-1`입니다.** 리스트 안에서 **균등 너비**로 분배됩니다. 특정 탭만 넓히려면 그 트리거에 `flex-none`/`grow-0`을 주세요.
- **트리거의 `::after`는 이미 쓰이고 있습니다.** `line` variant의 밑줄이 `after:`로 그려지므로, 직접 `after:*` 스타일을 얹으면 밑줄이 깨집니다.

---

## 사용 패턴

---

### 1. 비제어 — `defaultValue`

처음 선택될 탭만 지정하고, 이후 전환은 컴포넌트에 맡깁니다. **대부분의 화면은 이걸로 충분합니다.**

```tsx
{
  /* '반품/교환' 탭이 처음부터 선택된 상태로 시작 */
}
<Tabs defaultValue="exchange">
  <TabsList>
    <TabsTrigger value="delivery">배송</TabsTrigger>
    <TabsTrigger value="exchange">반품/교환</TabsTrigger>
    <TabsTrigger value="as">A/S</TabsTrigger>
  </TabsList>
  <TabsContent value="delivery">
    결제 후 2~3일 이내에 배송이 시작됩니다.
  </TabsContent>
  <TabsContent value="exchange">수령 후 7일 이내 신청 가능합니다.</TabsContent>
  <TabsContent value="as">고객센터를 통해 접수됩니다.</TabsContent>
</Tabs>;
```

### 2. 제어 — `value` / `onValueChange`

선택된 탭을 **바깥 상태로 직접 제어**합니다. 버튼·URL 쿼리·다른 화면 이벤트와 탭을 연동해야 할 때 씁니다.

```tsx
import { useState } from "react";

function Example() {
  const [tab, setTab] = useState("tab-1");

  return (
    <>
      {/* 탭 밖에서 탭을 바꾸는 버튼 */}
      <button type="button" onClick={() => setTab("tab-3")}>
        마지막 단계로
      </button>

      <Tabs
        // highlight-start
        value={tab}
        onValueChange={setTab}
        // highlight-end
      >
        <TabsList>
          <TabsTrigger value="tab-1">1단계</TabsTrigger>
          <TabsTrigger value="tab-2">2단계</TabsTrigger>
          <TabsTrigger value="tab-3">3단계</TabsTrigger>
        </TabsList>
        <TabsContent value="tab-1">약관 동의 단계입니다.</TabsContent>
        <TabsContent value="tab-2">정보 입력 단계입니다.</TabsContent>
        <TabsContent value="tab-3">가입 완료 단계입니다.</TabsContent>
      </Tabs>
    </>
  );
}
```

- `value`를 넘기면 **제어 모드**가 됩니다. `onValueChange`로 상태를 갱신하지 않으면 **탭을 눌러도 바뀌지 않습니다.**
- `value`와 `defaultValue`를 **동시에 주지 마세요.** 제어 모드에서는 `defaultValue`가 무시됩니다.

:::tip URL과 동기화하기
제어 모드는 쿼리스트링 연동에 그대로 쓰입니다. `value={searchParams.get('tab') ?? 'tab-1'}`, `onValueChange={(v) => setSearchParams({ tab: v })}` 식으로 연결하면 **새로고침·뒤로가기에도 탭이 유지**됩니다.
:::

### 3. 탭 목록 스타일 — `variant`

`TabsList`의 `variant`로 두 가지 기본형을 고릅니다.

<img
  src="../assets/ui/tabs-line.png"
  alt='TabsList variant="line"'
  width="100%"
/>

```tsx
{
  /* default — 회색 배경(bg-muted) 위에 활성 탭이 카드처럼 떠 보임 */
}
<TabsList>
  <TabsTrigger value="tab-1">개요</TabsTrigger>
  <TabsTrigger value="tab-2">활동</TabsTrigger>
</TabsList>;

{
  /* line — 배경 없이 활성 탭 아래에 밑줄만 */
}
<TabsList variant="line">
  <TabsTrigger value="tab-1">개요</TabsTrigger>
  <TabsTrigger value="tab-2">활동</TabsTrigger>
</TabsList>;
```

| variant   | 모양                                  | 어울리는 곳                              |
| --------- | ------------------------------------- | ---------------------------------------- |
| `default` | 회색 트랙 + 활성 탭 카드(배경·그림자) | 좁은 영역, 카드/패널 안의 세그먼트 전환  |
| `line`    | 배경 없음 + 활성 탭 밑줄              | 페이지 상단의 큰 탭, 콘텐츠 폭이 넓을 때 |

:::note 밑줄 위치는 리스트 패딩을 전제로 계산됩니다
`line`의 밑줄은 트리거의 `after:` 로 그려지며 가로 모드 기준 `bottom-[-5px]`입니다. 이는 `TabsList`의 기본 패딩 `p-[3px]`을 전제로 맞춰진 값이라, 리스트 패딩을 바꾸면 밑줄이 리스트 경계와 어긋날 수 있습니다. 그때는 트리거에 `after:bottom-*`을 함께 조정하세요.
:::

### 4. 방향 — `orientation`

`orientation="vertical"`을 주면 **탭 목록이 왼쪽 세로 레일**로, 패널이 오른쪽으로 배치됩니다.

<img
  src="../assets/ui/tabs-vertical.png"
  alt="Tabs 세로 배치"
  width="100%"
/>

```tsx
<Tabs orientation="vertical" defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">계정</TabsTrigger>
    <TabsTrigger value="notifications">알림</TabsTrigger>
    <TabsTrigger value="billing">결제</TabsTrigger>
  </TabsList>
  <TabsContent value="account">…</TabsContent>
  <TabsContent value="notifications">…</TabsContent>
  <TabsContent value="billing">…</TabsContent>
</Tabs>
```

내부적으로는 루트에 `data-orientation`이 붙고, 아래 스타일이 **자동으로** 따라옵니다.

| 대상          | `horizontal` (기본)    | `vertical`                     |
| ------------- | ---------------------- | ------------------------------ |
| `Tabs`        | 세로 스택(`flex-col`)  | 가로 배치(레일 + 패널)         |
| `TabsList`    | `h-8` 가로 정렬        | `h-fit` + `flex-col` 세로 정렬 |
| `TabsTrigger` | 가운데 정렬            | `w-full` + 좌측 정렬           |
| `line` 밑줄   | 트리거 **아래** 가로선 | 트리거 **오른쪽** 세로선       |

:::caution 세로 배치에서도 화살표는 ←/→ 입니다
현재 구현(`tabs.tsx`)은 `orientation` 값을 **레이아웃용 `data-orientation` 속성으로만** 사용하고 Radix 루트에는 전달하지 않습니다. 그래서 세로로 배치해도

- 키보드 탭 이동은 **`←` / `→`** 로 동작하고 `↑`/`↓`는 반응하지 않습니다.
- `TabsList`의 `aria-orientation`·`data-orientation`은 항상 `horizontal`입니다.

CSS로 세로 상태를 잡을 때는 리스트가 아니라 **루트를 기준**으로 선택하세요.

```css
/* ✅ 루트 기준 — 동작함 */
[data-slot="tabs"][data-orientation="vertical"] [data-slot="tabs-list"] { … }

/* ❌ 리스트에는 항상 horizontal 이 붙어 있어 매칭되지 않음 */
[data-slot="tabs-list"][data-orientation="vertical"] { … }
```

:::

### 5. 비활성 탭 — `disabled`

```tsx
<Tabs defaultValue="free">
  <TabsList>
    <TabsTrigger value="free">무료</TabsTrigger>
    {/* 선택 불가 + 화살표 이동 시에도 건너뜀 */}
    <TabsTrigger value="premium" disabled>
      프리미엄 (준비중)
    </TabsTrigger>
    <TabsTrigger value="enterprise">엔터프라이즈</TabsTrigger>
  </TabsList>
  <TabsContent value="free">무료 플랜 안내입니다.</TabsContent>
  <TabsContent value="enterprise">엔터프라이즈 플랜 안내입니다.</TabsContent>
</Tabs>
```

- 비활성 탭은 `disabled` 속성과 `data-disabled`가 붙고 `opacity-50`으로 흐려집니다.
- **포커스 대상에서 제외**되므로 화살표 키 이동에서도 자동으로 건너뜁니다.
- 대응하는 `TabsContent`는 아예 두지 않아도 됩니다(선택될 수 없으므로).

### 6. 탭 너비 — `w-fit` / `w-full`

`TabsList`는 기본이 `w-fit`이라 **내용만큼만** 차지합니다. 트리거는 `flex-1`이라 리스트 안에서 **균등 분배**됩니다.

```tsx
{
  /* 기본 — 내용 폭에 맞춰 좌측 정렬 */
}
<TabsList>…</TabsList>;

{
  /* 가로 꽉 채우기 — 세그먼트 컨트롤처럼 보이게 */
}
<TabsList className="w-full">…</TabsList>;

{
  /* 특정 탭만 고정 폭으로 */
}
<TabsTrigger value="tab-1" className="flex-none w-24">
  요약
</TabsTrigger>;
```

### 7. 활성화 방식 — `activationMode`

화살표 키로 탭을 이동할 때 **바로 전환할지, Enter로 확정할지** 고릅니다.

```tsx
{
  /* 기본: automatic — 포커스가 옮겨가는 즉시 패널이 바뀜 */
}
<Tabs defaultValue="tab-1">…</Tabs>;

{
  /* manual — 화살표는 포커스만 옮기고, Enter/Space 로 선택 확정 */
}
<Tabs defaultValue="tab-1" activationMode="manual">
  …
</Tabs>;
```

:::tip 패널이 무거우면 `manual`
`automatic`은 화살표를 누를 때마다 패널이 즉시 교체됩니다. 패널마다 API를 호출하거나 큰 표를 그린다면, 키보드로 훑는 동안 불필요한 렌더가 연달아 발생합니다. 이런 화면은 `activationMode="manual"`이 더 적합합니다.
:::

### 8. 패널 내용 유지 — `forceMount`

**비활성 패널은 DOM에서 제거됩니다.** 그래서 탭을 바꿨다 돌아오면 패널 안 입력값·스크롤 위치가 초기화됩니다.

```tsx
{
  /* ① 권장 — 값을 부모 state로 끌어올린다 (탭과 무관하게 값이 유지됨) */
}
const [form, setForm] = useState({ name: "", email: "" });

<TabsContent value="account">
  <input
    value={form.name}
    onChange={(e) => setForm({ ...form, name: e.target.value })}
  />
</TabsContent>;

{
  /* ② DOM 자체를 유지해야 할 때 — forceMount + 숨김 처리 */
}
<TabsContent
  value="account"
  forceMount
  // highlight-next-line
  className="data-[state=inactive]:hidden"
>
  …
</TabsContent>;
```

:::caution `forceMount`만 주면 패널이 전부 보입니다
`forceMount`는 "항상 마운트"만 담당하고 **숨김 처리는 하지 않습니다.** 그대로 두면 비활성 패널까지 화면에 쌓입니다. 반드시 `className="data-[state=inactive]:hidden"`(또는 CSS Module의 동등한 선택자)을 함께 주세요.
차트·에디터처럼 **재생성 비용이 큰 위젯**이 아니라면, 값만 부모 state로 올리는 ①번이 더 단순하고 안전합니다.
:::

### 9. 아이콘 탭

`TabsTrigger` 안의 `svg`는 자동으로 `size-4`(16px)로 맞춰지고 간격(`gap-1.5`)도 기본 제공됩니다.

<img
  src="../assets/ui/tabs-icon.png"
  alt="아이콘이 들어간 탭"
  width="100%"
/>

```tsx
import { User, Bell, CreditCard } from "lucide-react";

<Tabs defaultValue="profile">
  <TabsList>
    <TabsTrigger value="profile">
      <User /> 프로필
    </TabsTrigger>
    <TabsTrigger value="alarm">
      <Bell /> 알림
    </TabsTrigger>
    <TabsTrigger value="billing">
      <CreditCard /> 결제
    </TabsTrigger>
  </TabsList>
  …
</Tabs>;
```

- 크기를 바꾸려면 아이콘에 직접 `className="size-5"`를 주세요. **`size-*` 클래스가 있으면 기본 표준화(`size-4`)는 적용되지 않습니다.**
- 아이콘이 라벨의 앞/뒤에 붙는 경우 `data-icon="inline-start"` / `data-icon="inline-end"`를 주면 그쪽 좌우 여백이 살짝 줄어 시각적으로 균형이 맞습니다(scaffold `Pagination`이 쓰는 방식과 동일).

---

## API 레퍼런스

---

네 파트 모두 **Radix Tabs** 기반이라 아래 표에 없는 Radix 표준 prop과 표준 DOM 속성이 그대로 전달됩니다.

### `Tabs` (루트)

| Prop             | 타입                         | 기본값         | 설명                                                                       |
| ---------------- | ---------------------------- | -------------- | -------------------------------------------------------------------------- |
| `defaultValue`   | `string`                     | `""`           | 초기 선택 탭(비제어). **지정하지 않으면 아무 패널도 안 보임**              |
| `value`          | `string`                     | —              | 현재 선택 탭(제어). `onValueChange`와 함께 사용                            |
| `onValueChange`  | `(value: string) => void`    | —              | 탭 변경 콜백                                                               |
| `orientation`    | `"horizontal" \| "vertical"` | `"horizontal"` | **레이아웃 방향.** 키보드 방향에는 영향 없음([주의](#4-방향--orientation)) |
| `activationMode` | `"automatic" \| "manual"`    | `"automatic"`  | 화살표 이동 시 즉시 선택할지, Enter/Space로 확정할지                       |
| `dir`            | `"ltr" \| "rtl"`             | `"ltr"`        | 텍스트 방향(화살표 키 좌우 반전)                                           |
| `className`      | `string`                     | —              | 루트에 추가할 클래스                                                       |

### `TabsList`

| Prop        | 타입                  | 기본값      | 설명                                         |
| ----------- | --------------------- | ----------- | -------------------------------------------- |
| `variant`   | `"default" \| "line"` | `"default"` | 배경형 / 밑줄형                              |
| `loop`      | `boolean`             | `true`      | 화살표 이동이 처음↔끝으로 순환할지           |
| `className` | `string`              | —           | 리스트에 추가할 클래스 (너비·높이 조정 지점) |

### `TabsTrigger`

| Prop        | 타입        | 기본값     | 설명                                              |
| ----------- | ----------- | ---------- | ------------------------------------------------- |
| `value`     | `string`    | — _(필수)_ | 탭 식별 키. `TabsContent`의 `value`와 일치시킬 것 |
| `disabled`  | `boolean`   | `false`    | 선택 불가 + 키보드 이동에서 제외                  |
| `children`  | `ReactNode` | —          | 탭 라벨(아이콘 포함 가능)                         |
| `className` | `string`    | —          | 트리거에 추가할 클래스                            |

### `TabsContent`

| Prop         | 타입        | 기본값     | 설명                                                              |
| ------------ | ----------- | ---------- | ----------------------------------------------------------------- |
| `value`      | `string`    | — _(필수)_ | 짝이 되는 트리거의 `value`                                        |
| `forceMount` | `boolean`   | —          | 비활성 상태에서도 DOM 유지([주의](#8-패널-내용-유지--forcemount)) |
| `children`   | `ReactNode` | —          | 패널 내용                                                         |
| `className`  | `string`    | —          | 패널에 추가할 클래스                                              |

### 노출되는 상태 속성

CSS·테스트 셀렉터로 쓸 수 있는 속성입니다.

| 대상          | 속성                                      | 의미                      |
| ------------- | ----------------------------------------- | ------------------------- |
| `Tabs`        | `data-orientation="horizontal\|vertical"` | 내가 지정한 레이아웃 방향 |
| `TabsTrigger` | `data-state="active" \| "inactive"`       | 선택 여부                 |
| `TabsTrigger` | `data-disabled`                           | 비활성 탭                 |
| `TabsTrigger` | `aria-selected` / `aria-controls`         | 접근성 연결(자동)         |
| `TabsContent` | `data-state="active" \| "inactive"`       | 패널 활성 여부            |

### data-slot

| data-slot                    | 대상         |
| ---------------------------- | ------------ |
| `[data-slot="tabs"]`         | 루트         |
| `[data-slot="tabs-list"]`    | 탭 버튼 묶음 |
| `[data-slot="tabs-trigger"]` | 각 탭 버튼   |
| `[data-slot="tabs-content"]` | 각 패널      |

---

## 접근성 / 키보드

---

Radix 기반이라 **WAI-ARIA Tabs 패턴이 기본 내장**되어 있습니다. `role="tablist"`/`role="tab"`/`role="tabpanel"`과 `aria-selected`·`aria-controls`·`aria-labelledby` 연결이 자동으로 처리됩니다.

| 키                 | 동작                                                  |
| ------------------ | ----------------------------------------------------- |
| `Tab`              | 탭 목록 → 활성 패널로 포커스 이동 (탭 하나만 탭 스톱) |
| `←` / `→`          | 이전 / 다음 탭으로 이동 (기본은 이동 즉시 선택)       |
| `Home` / `PageUp`  | 첫 번째 탭으로 이동                                   |
| `End` / `PageDown` | 마지막 탭으로 이동                                    |
| `Enter` / `Space`  | 포커스된 탭 선택 (`activationMode="manual"`에서 필수) |

- 탭 목록은 **roving tabindex**를 씁니다. `Tab` 키로는 탭 그룹 전체를 한 번에 지나가고, 그룹 내 이동은 화살표 키가 담당합니다.
- 화살표 이동은 **끝에서 처음으로 순환**합니다(`loop` 기본 `true`). 순환을 끄려면 `<TabsList loop={false}>`.
- 패널(`TabsContent`)은 `tabIndex=0`이라 포커스를 받을 수 있습니다. 다만 기본 클래스에 `outline-none`이 있어 **포커스 링이 보이지 않으므로**, 패널 자체에 포커스가 중요한 화면이라면 `focus-visible:ring-[3px] focus-visible:ring-ring/50`을 직접 추가하세요.
- 세로 배치에서도 화살표는 `←`/`→` 입니다 → [방향 — orientation](#4-방향--orientation)의 주의 사항 참고.

:::note 탭 라벨은 짧고 명확하게
탭 버튼은 `whitespace-nowrap`이라 줄바꿈되지 않습니다. 라벨이 길면 가로 스크롤이 생기거나 잘립니다. 아이콘만 있는 탭이라면 `aria-label`로 이름을 반드시 제공하세요.
:::

---

## 스타일링 & 테마

---

Tabs에는 Accordion 같은 **공개 CSS 변수(`--accordion-*` 류)가 없습니다.** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것           | 방법                                                       |
| --------------------- | ---------------------------------------------------------- |
| 배경형 / 밑줄형       | `TabsList`의 **`variant`**                                 |
| 가로 / 세로           | `Tabs`의 **`orientation`**                                 |
| 탭 너비·높이·간격     | `TabsList` / `TabsTrigger`의 **`className`**               |
| 색(트랙·활성 탭·글자) | **디자인 토큰**(`--muted`, `--background`, `--foreground`) |
| 겉모습 전면 교체      | **`data-slot` 선택자 + CSS Module**                        |
| 프로젝트 공통 탭 룩   | 도메인에 **래퍼 컴포넌트**를 만들어 재사용                 |

:::tip 핵심 원칙
모든 파트가 `cn()`(= `tailwind-merge`)으로 클래스를 병합하므로 **내가 넘긴 `className`이 기본값을 덮어씁니다.** 대부분의 조정은 `className`만으로 끝납니다.
:::

### 1. className으로 조정 (기본)

<img
  src="../assets/ui/tabs-custom.png"
  alt="className으로 커스터마이징한 탭"
  width="100%"
/>

```tsx
<Tabs defaultValue="daily">
  {/* 트랙 색 + 가로 꽉 채우기 */}
  <TabsList className="w-full bg-violet-100 dark:bg-violet-900/30">
    <TabsTrigger
      value="daily"
      // 활성 탭 색만 교체 — 다크 모드도 함께 지정해야 기본 dark: 규칙을 덮어씀
      className="data-[state=active]:bg-violet-600 data-[state=active]:text-white
                 dark:data-[state=active]:bg-violet-600 dark:data-[state=active]:text-white"
    >
      일간
    </TabsTrigger>
    …
  </TabsList>
  <TabsContent value="daily" className="pt-1 text-muted-foreground">
    일간 통계입니다.
  </TabsContent>
</Tabs>
```

:::caution 다크 모드 규칙도 함께 덮어쓰세요
활성 탭에는 `dark:data-[state=active]:bg-input/30` 같은 **다크 전용 기본 규칙**이 들어 있습니다. `data-[state=active]:bg-*`만 주면 라이트 모드에서만 바뀌고 다크에서는 기본값이 남습니다. 위 예제처럼 `dark:` 짝을 함께 주세요.
:::

### 2. 상태 셀렉터 — `data-state` / 커스텀 variant

활성 상태는 `data-state="active"`로 노출됩니다. Tailwind에서는 두 가지 표기가 모두 가능합니다.

```tsx
{
  /* 표준 표기 */
}
<TabsTrigger className="data-[state=active]:font-bold" value="a">
  A
</TabsTrigger>;

{
  /* shadcn 커스텀 variant (shadcn/tailwind.css 제공) — 위와 동일한 의미 */
}
<TabsTrigger className="data-active:font-bold" value="a">
  A
</TabsTrigger>;
```

같은 방식으로 루트 방향에 반응하는 `data-horizontal:` / `data-vertical:` variant도 쓸 수 있습니다(각각 `[data-orientation="horizontal"]` / `[data-orientation="vertical"]`에 매핑).

### 3. 전면 교체 — `data-slot` + CSS Module

스타일이 커지거나 여러 화면에서 같은 룩을 써야 하면 CSS Module에서 슬롯을 잡습니다.

```css title="MyTabs.module.css"
/* 래퍼(.wrap = Tabs 루트) 아래에서만 적용되도록 스코프를 건다.
 * 기본 스타일이 Tailwind 유틸리티(낮은 명시도)라 2단계 이상 겹쳐 명시도를 확보한다. */
.wrap :global([data-slot="tabs-list"]) {
  height: auto; /* 기본 h-8 해제 */
  padding: 6px;
  background: var(--muted);
  border-radius: 14px;
}

.wrap :global([data-slot="tabs-list"]) :global([data-slot="tabs-trigger"]) {
  height: auto;
  padding: 10px 14px;
  border-radius: 10px;
}

/* 활성 탭 — radix가 data-state="active" 를 부여한다 */
.wrap :global([data-slot="tabs-trigger"][data-state="active"]) {
  background: var(--background);
  color: var(--primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
```

```tsx
import styles from "./MyTabs.module.css";

<Tabs defaultValue="tab-1" className={styles.wrap}>
  …
</Tabs>;
```

:::tip 명시도 & 스코프 주의

- `height`·`flex` 같이 **기본 클래스와 정면으로 충돌**하는 속성은 `!important`가 필요할 수 있습니다([실전 예제](#실전-예제)의 `.rail`·`.tab` 참고).
- `data-slot`을 전역으로 선택하면 화면 안의 다른 Tabs까지 바뀝니다. **반드시 래퍼 클래스로 스코프**를 거세요.
- CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
  :::

### 4. 색은 디자인 토큰으로

Tabs 전용 색 변수는 없습니다. 기본 스타일이 쓰는 토큰은 아래와 같으니, 테마 차원에서 색을 바꾸려면 이 토큰을 조정하세요.

| 토큰                 | 어디에 쓰이나                                   |
| -------------------- | ----------------------------------------------- |
| `--muted`            | `default` variant의 트랙 배경                   |
| `--muted-foreground` | 리스트 기본 글자색 / 다크 모드 비활성 탭 글자색 |
| `--background`       | 활성 탭 배경(라이트)                            |
| `--foreground`       | 활성 탭 글자색 · `line` variant 밑줄 색         |
| `--input`            | 다크 모드 활성 탭 배경·테두리                   |
| `--ring`             | 포커스 링                                       |

다크 모드는 앱 규칙(`.dark`)을 따릅니다. className으로 색을 줄 때는 `dark:` 유틸리티를, CSS Module에서는 `:global(.dark) .wrap { … }`으로 토큰만 교체하세요.

---

## 실전 예제

---

제공 Tabs를 **그대로 쓰되**, 컴포넌트 로직은 건드리지 않고 `*.module.css`로 **좌측 세로 레일 + 우측 카드**라는 전혀 다른 디자인을 입힌 설정 화면입니다. scaffold 예제 화면 `UI Components > Tabs`(`/example/ui-components/tabs`) 하단에서 직접 동작합니다.

<img
  src="../assets/ui/tabs-real-settings.png"
  alt="설정 화면 실전 예제"
  width="100%"
/>

**포인트**

- `orientation="vertical"` + `className={styles.wrap}` 두 줄로 **레이아웃의 방향만** 컴포넌트에 맡깁니다.
- `TabsList`를 좌측 레일로 바꾸기 위해 기본값(`h-8`, `w-fit`)을 `height: auto !important`로 풀었습니다.
- 활성 표시는 직접 계산하지 않고 **`.tab[data-state='active']`** 셀렉터에 맡깁니다.
- 패널 3개를 `<div className={styles.panel}>`로 감싸 **루트 flex의 두 번째 아이템**으로 만들었습니다(레일 옆 영역 전체를 차지).

<details>
<summary><b>SettingsTabs.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/tabs/SettingsTabs.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@axiom/components/ui";
import {
  UserRound,
  BellRing,
  CreditCard,
  ShieldCheck,
  Check,
} from "lucide-react";
import styles from "./SettingsTabs.module.css";

/**
 * 실전 예제 — scaffold가 제공하는 Tabs(@axiom/components/ui)를 "그대로 사용"하면서
 * CSS Module로 완전히 다른 스타일(좌측 세로 레일 + 우측 콘텐츠 카드)을 입힌 설정 화면.
 *
 * 재스타일링 포인트: Tabs 내부 요소는 data-slot / data-state 속성을 노출한다.
 *   - [data-slot="tabs"]         : 루트
 *   - [data-slot="tabs-list"]    : 트리거 묶음(여기선 좌측 레일)
 *   - [data-slot="tabs-trigger"] : 각 탭 버튼 (활성 시 data-state="active")
 *   - [data-slot="tabs-content"] : 각 탭 패널
 */
export default function SettingsTabs(): React.ReactNode {
  return (
    // highlight-next-line
    <Tabs orientation="vertical" defaultValue="account" className={styles.wrap}>
      {/* 좌측 레일 — TabsList 의 기본 가로 트랙을 CSS 로 세로 레일로 교체 */}
      <TabsList className={styles.rail}>
        <span className={styles.railTitle}>설정</span>

        <TabsTrigger value="account" className={styles.tab}>
          <UserRound className={styles.tabIcon} />
          <span className={styles.tabLabel}>
            계정
            <em className={styles.tabDesc}>프로필 · 이메일</em>
          </span>
        </TabsTrigger>

        <TabsTrigger value="notifications" className={styles.tab}>
          <BellRing className={styles.tabIcon} />
          <span className={styles.tabLabel}>
            알림
            <em className={styles.tabDesc}>메일 · 푸시</em>
          </span>
        </TabsTrigger>

        <TabsTrigger value="billing" className={styles.tab}>
          <CreditCard className={styles.tabIcon} />
          <span className={styles.tabLabel}>
            결제
            <em className={styles.tabDesc}>플랜 · 청구</em>
          </span>
        </TabsTrigger>
      </TabsList>

      {/* 패널 묶음 — 루트가 flex 이므로 이 div 가 레일 옆 영역을 차지한다 */}
      {/* highlight-next-line */}
      <div className={styles.panel}>
        <TabsContent value="account" className={styles.content}>
          <h3 className={styles.contentTitle}>계정 정보</h3>
          <p className={styles.contentDesc}>
            프로필에 표시되는 기본 정보입니다.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>이름</span>
            <input className={styles.input} defaultValue="김대리" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>이메일</span>
            <input
              className={styles.input}
              defaultValue="daeri.kim@example.com"
            />
          </label>

          <button type="button" className={styles.primaryBtn}>
            <Check className={styles.btnIcon} />
            변경사항 저장
          </button>
        </TabsContent>

        <TabsContent value="notifications" className={styles.content}>
          <h3 className={styles.contentTitle}>알림 설정</h3>
          <p className={styles.contentDesc}>어떤 알림을 받을지 선택하세요.</p>
          <ul className={styles.toggleList}>
            {[
              {
                label: "이메일 요약",
                desc: "매주 활동 리포트를 이메일로 받습니다.",
                on: true,
              },
              {
                label: "푸시 알림",
                desc: "중요한 이벤트를 실시간으로 알립니다.",
                on: true,
              },
              {
                label: "마케팅 소식",
                desc: "신규 기능과 프로모션 소식을 받습니다.",
                on: false,
              },
            ].map((t) => (
              <li key={t.label} className={styles.toggleRow}>
                <div>
                  <p className={styles.toggleLabel}>{t.label}</p>
                  <p className={styles.toggleDesc}>{t.desc}</p>
                </div>
                <span className={styles.toggle} data-on={t.on ? "" : undefined}>
                  <span className={styles.toggleDot} />
                </span>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="billing" className={styles.content}>
          <h3 className={styles.contentTitle}>결제 및 플랜</h3>
          {/* … 플랜 카드 마크업 생략 (ShieldCheck 아이콘 + 기능 목록 + 변경 버튼) */}
        </TabsContent>
      </div>
    </Tabs>
  );
}
```

</details>

<details>
<summary><b>SettingsTabs.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/tabs/SettingsTabs.module.css"
/* 재스타일링 방식:
 *   scaffold Tabs는 내부 요소마다 data-slot / data-state 속성을 노출한다.
 *   여기서는 각 파트에 className 을 직접 넘겨 잡고(.wrap/.rail/.tab),
 *   활성 상태만 [data-state='active'] 로 선택한다. */

.wrap {
  /* 이 예제 전용 색 토큰 — 인디고 카드 톤 */
  --st-indigo: #4f46e5;
  --st-indigo-soft: #eef2ff;
  --st-indigo-line: #e0e7ff;
  --st-ink: #1e2233;
  --st-sub: #5b6178;
  --st-muted: #8b90a5;
  --st-card: #ffffff;
  --st-bg: #f7f8fc;
  --st-border: #e7e9f2;

  /* Tabs 루트는 기본이 flex + gap-2. 세로(orientation="vertical")이므로
   * 좌측 레일 + 우측 패널이 붙어 보이도록 gap 을 없애고 카드로 감싼다. */
  /* highlight-start */
  display: flex !important;
  gap: 0 !important;
  /* highlight-end */
  width: 100%;
  border: 1px solid var(--st-border);
  border-radius: 18px;
  overflow: hidden;
  background: var(--st-card);
  color: var(--st-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap {
  --st-indigo: #818cf8;
  --st-ink: #e9eaf3;
  --st-card: #12141f;
  --st-border: #262a3a;
  /* … 이하 동일 패턴 */
}

/* ── 좌측 세로 레일 (data-slot="tabs-list") ─────────────────────── */
.rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 208px;
  flex-shrink: 0;
  padding: 14px;
  background: var(--st-bg);
  border-right: 1px solid var(--st-border);
  /* scaffold 기본값(가로 트랙용 h-8)을 확실히 덮어쓴다. */
  /* highlight-next-line */
  height: auto !important;
}

/* ── 각 탭 버튼 (data-slot="tabs-trigger") ──────────────────────── */
.tab {
  display: flex !important;
  align-items: center;
  /* 기본 트리거는 justify-center · flex-1 · h-[calc(100%-1px)] 이라
   * 좌측 정렬 / 내용 높이로 바꾸려면 셋 다 풀어야 한다. */
  /* highlight-start */
  justify-content: flex-start !important;
  height: auto !important;
  flex: none !important;
  /* highlight-end */
  gap: 10px;
  width: 100%;
  padding: 10px 12px !important;
  border: 1px solid transparent !important;
  border-radius: 12px !important;
  text-align: left;
  color: var(--st-sub) !important;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.tab:hover {
  background: var(--st-indigo-soft);
  color: var(--st-ink) !important;
}

/* 활성 탭: radix가 data-state="active" 를 부여한다. */
/* highlight-start */
.tab[data-state="active"] {
  background: var(--st-card) !important;
  border-color: var(--st-indigo-line) !important;
  color: var(--st-indigo) !important;
  box-shadow: 0 1px 2px rgb(79 70 229 / 10%) !important;
}
/* highlight-end */

/* ── 우측 패널 ─────────────────────────────────────────────────── */
.panel {
  flex: 1;
  min-width: 0;
  padding: 24px 26px;
}

/* 패널 표시/숨김은 radix 가 처리하므로 CSS 는 겉모습만 담당 */
.content {
  outline: none;
}

/* … 이하 폼 · 토글 · 플랜 카드 스타일 생략 */
```

</details>

:::tip 이 예제에서 가져갈 것
동작(선택 상태·키보드·접근성)은 **컴포넌트에 그대로 맡기고**, 바꾼 것은 ①`orientation` 같은 prop ②각 파트의 `className` ③`[data-state='active']` 셀렉터 세 가지뿐입니다. **`src/shared/lib/shadcn/ui/tabs.tsx`를 복사해 고치지 마세요** — shadcn 원본이라 업스트림 갱신 시 충돌합니다.
:::

---

## 자주 하는 실수

---

| 증상                                                               | 원인                                                    | 해결                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 처음에 패널이 하나도 안 보인다                                     | `defaultValue`/`value` 미지정 (기본 선택값이 빈 문자열) | `<Tabs defaultValue="tab-1">`                                            |
| 탭을 눌러도 내용이 안 바뀐다                                       | 트리거와 패널의 `value` 불일치                          | 두 `value`를 같은 문자열로 맞추기                                        |
| 제어 모드인데 탭이 안 바뀐다                                       | `value`만 주고 `onValueChange` 없음                     | `onValueChange`로 state 갱신                                             |
| 탭을 바꿨다 돌아오면 입력값이 사라진다                             | 비활성 패널은 DOM에서 언마운트됨                        | 값을 부모 state로 올리거나 `forceMount` + `data-[state=inactive]:hidden` |
| `forceMount` 했더니 패널이 전부 보인다                             | `forceMount`는 숨김 처리를 하지 않음                    | `className="data-[state=inactive]:hidden"` 추가                          |
| 트리거에 `h-12`를 줬는데 안 커진다                                 | 높이는 `TabsList`의 `h-8`이 결정                        | `TabsList`에도 높이 지정 (CSS Module이면 `height: auto !important`)      |
| 탭이 가로로 늘어나지 않는다                                        | `TabsList`가 `w-fit`                                    | `<TabsList className="w-full">`                                          |
| 특정 탭만 넓히고 싶은데 전부 같은 폭이 된다                        | 트리거가 `flex-1`이라 균등 분배                         | 그 트리거에 `flex-none w-*`                                              |
| 다크 모드에서 활성 탭 색이 안 바뀐다                               | `dark:data-[state=active]:*` 기본 규칙이 남아 있음      | `dark:` 짝을 함께 지정                                                   |
| 세로 탭에서 `↑`/`↓`가 안 먹는다                                    | `orientation`이 Radix 루트로 전달되지 않음              | `←`/`→` 사용 → [주의 사항](#4-방향--orientation)                         |
| `[data-slot="tabs-list"][data-orientation="vertical"]`이 안 잡힌다 | 리스트의 `data-orientation`은 항상 `horizontal`         | 루트(`[data-slot="tabs"][data-orientation="vertical"]`) 기준으로 선택    |
| `line` variant 밑줄이 어긋난다                                     | 밑줄이 `TabsList`의 `p-[3px]`를 전제로 계산됨           | 리스트 패딩을 바꿨다면 트리거의 `after:bottom-*`도 조정                  |
| 내가 준 `after:*` 스타일이 깨진다                                  | `line` 밑줄이 `::after`를 이미 사용                     | 자식 요소나 `border-*`로 대체                                            |
| 아이콘 크기가 제각각이다                                           | `size-*` 클래스가 있으면 기본 `size-4` 표준화 제외      | 아이콘에 명시적으로 `className="size-5"`                                 |
| 다른 화면의 탭까지 스타일이 바뀌었다                               | `data-slot="tabs-*"`을 전역으로 선택                    | 래퍼 클래스로 스코프 걸기                                                |

---
