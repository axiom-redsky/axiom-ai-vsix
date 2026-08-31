---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Drawer"
hide_table_of_contents: false
---

# Drawer 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 **시트(바텀시트 / 사이드시트)** 컴포넌트입니다.
화면 가장자리에서 밀려 나오는 패널로, 내부적으로 <VarLink k="vaulUrl"><code>vaul</code></VarLink>을 사용하며 **드래그로 닫기 · 단계별 높이(스냅) · 오버레이 · ESC 닫기**를 기본 지원합니다.

실제 동작 예제는 `react-app-scaffold` 프로젝트에서 더 많이 확인할 수 있습니다.

**언제 쓰나요?**

- 모바일에서 **필터 · 정렬 · 옵션 선택**을 아래에서 올라오는 시트로 받을 때
- 목록 옆에 **상세 패널**을 슬라이드로 띄울 때 (`direction="right"`)
- 지도·플레이어처럼 **본문을 가리지 않고 부분적으로만 덮는** 패널이 필요할 때 (`snapPoints`)
- 모바일 내비게이션 메뉴 (`direction="left"`)

:::note Dialog와 무엇이 다른가
[`Dialog`](./dialog-component)는 화면 **가운데 뜨는 카드**, Drawer는 **가장자리에서 밀려 나오는 시트**입니다.
짧은 확인·경고는 Dialog, 손가락으로 끌어 닫는 모바일 UX·긴 옵션 목록·부분 노출이 필요하면 Drawer를 쓰세요.
:::

> 열림 상태를 컴포넌트에 맡길지(비제어), 바깥 `useState`로 직접 쥘지(제어)에 따라 사용법이 갈립니다. "적용을 눌러야 반영" 같은 흐름은 **제어 모드**가 필요합니다. (아래 [동작 옵션](#동작-옵션) 참고)

---

## Import

---

```tsx
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@axiom/components/ui";
```

Drawer는 여러 파트를 **조합해서** 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::note `DrawerContent`가 Overlay·Portal을 품고 있습니다
`DrawerContent`는 내부에서 `DrawerOverlay`(딤 배경)와 `DrawerPortal`(body 밑 렌더)을 **자동으로 포함**합니다. 따라서 `DrawerOverlay` / `DrawerPortal`을 직접 import해 배치할 필요가 없습니다. (둘 다 export되어 있긴 하지만, 특수한 경우가 아니면 쓰지 않습니다.)
:::

---

## 기본 사용법

---

가장 기본적인 형태입니다. `direction`을 지정하지 않으면 **바텀시트(`bottom`)** 이고, 상단에 **드래그 핸들이 자동으로 표시**됩니다.
**오버레이 클릭 / 아래로 드래그 / ESC / 하단 버튼** 중 무엇으로도 닫힙니다.

---

<img
  src="../assets/ui/drawer-basic.png"
  alt="Drawer 기본 사용법"
  width="100%"
/>

```tsx
<Drawer>
  <DrawerTrigger asChild>
    <Button variant="outline">바텀시트 열기</Button>
  </DrawerTrigger>

  <DrawerContent>
    {" "}
    {/* Overlay + Portal 포함, bottom이면 드래그 핸들 자동 표시 */}
    <DrawerHeader>
      <DrawerTitle>배송지 변경</DrawerTitle>
      <DrawerDescription>주문에 사용할 배송지를 선택하세요.</DrawerDescription>
    </DrawerHeader>
    <div className="px-4 pb-2 text-sm text-muted-foreground">
      서울특별시 중구 세종대로 110, 3층 (04524)
    </div>
    <DrawerFooter>
      <Button>이 주소로 배송</Button>
      <DrawerClose asChild>
        <Button variant="outline">취소</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

:::tip `DrawerTrigger asChild` 는 왜 쓰나
`asChild`를 주면 트리거가 **자기 DOM을 만들지 않고** 자식(`Button`)에 "열기" 동작만 위임합니다. 덕분에 scaffold `Button`의 생김새를 그대로 유지하면서 트리거로 쓸 수 있습니다. 닫기 버튼(`DrawerClose asChild`)도 같은 원리입니다.
:::

:::note 본문에는 좌우 여백이 없습니다
`DrawerHeader` · `DrawerFooter`는 `p-4` 패딩을 갖지만, 그 사이의 **본문은 여러분이 넣는 마크업**이라 여백이 없습니다. 위 예시처럼 `px-4`를 직접 주세요.
:::

---

## 구성 (Anatomy)

---

Drawer는 아래 파트를 중첩해서 구성합니다.

```tsx
<Drawer>
  {" "}
  {/* 루트 — 열림 상태·방향·스냅을 관리 (vaul Drawer.Root) */}
  <DrawerTrigger /> {/* 여는 트리거 (제어 모드에선 생략 가능) */}
  <DrawerContent>
    {" "}
    {/* 시트 본체. Overlay + Portal 자동 포함 */}
    <DrawerHeader>
      {" "}
      {/* 제목·부제 영역 */}
      <DrawerTitle /> {/* 제목 텍스트 */}
      <DrawerDescription /> {/* 부제 텍스트 */}
    </DrawerHeader>
    {/* ...본문(자유 마크업)... */}
    <DrawerFooter>
      {" "}
      {/* 하단 버튼 영역 (기본 세로 배치, mt-auto) */}
      <DrawerClose /> {/* 닫는 버튼 */}
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

| 파트                | 역할                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Drawer`            | 루트. 열림 상태·`direction`·`snapPoints` 등을 관리합니다(vaul `Drawer.Root`).                                                                                  |
| `DrawerTrigger`     | 시트를 여는 트리거. **제어 모드에선 생략**하고 바깥 버튼으로 열어도 됩니다.                                                                                    |
| `DrawerContent`     | 시트 본체. 방향별 위치·크기·라운드가 여기 걸립니다. `DrawerOverlay`·`DrawerPortal`을 **내부에 포함**하고, `bottom` 방향이면 **드래그 핸들을 자동 렌더**합니다. |
| `DrawerHeader`      | 제목·부제 영역. `p-4` 세로 배치. `bottom`/`top` 방향은 **가운데 정렬**(단, `md` 이상에선 좌측 정렬로 되돌아감).                                                |
| `DrawerTitle`       | 제목 텍스트. **접근성상 필수에 가깝습니다**(스크린리더가 시트 이름으로 읽음).                                                                                  |
| `DrawerDescription` | 부제/설명 텍스트.                                                                                                                                              |
| `DrawerFooter`      | 하단 버튼 영역. `mt-auto`라 시트 바닥에 붙고, 기본은 **세로 배치**입니다.                                                                                      |
| `DrawerClose`       | 시트를 닫는 버튼. `asChild`로 임의의 버튼에 닫기 동작을 위임합니다.                                                                                            |
| `DrawerOverlay`     | 딤 배경. `DrawerContent`가 자동 포함하므로 직접 쓰지 않습니다.                                                                                                 |
| `DrawerPortal`      | `document.body` 밑 렌더. `DrawerContent`가 자동 포함하므로 직접 쓰지 않습니다.                                                                                 |

:::caution `DrawerTitle`을 생략하지 마세요
Drawer는 내부적으로 radix Dialog 위에 만들어져 있어 **`DrawerTitle`을 기대**합니다. 제목을 화면에 굳이 보이고 싶지 않아도, 최소한 `sr-only` 클래스로 감춘 제목을 넣어 스크린리더가 시트를 식별할 수 있게 하세요.
:::

---

## 동작 옵션

---

시트의 동작은 **루트 `Drawer`의 prop**으로 결정됩니다. 원하는 UX에 맞춰 아래에서 고르세요.

### 1. 열리는 방향 — `direction`

```tsx
<Drawer direction="right">
  <DrawerTrigger asChild>
    <Button variant="outline">오른쪽에서 열기</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>주문 상세</DrawerTitle>
      <DrawerDescription>오른쪽에서 슬라이드인 됩니다.</DrawerDescription>
    </DrawerHeader>
  </DrawerContent>
</Drawer>
```

---

<img
  src="../assets/ui/drawer-direction-right.png"
  alt="Drawer direction"
  width="100%"
/>

`"bottom"`(기본) · `"top"` · `"left"` · `"right"` 네 방향을 지원하며, **방향에 따라 크기·라운드·테두리가 자동으로 바뀝니다.**

| direction         | 크기                             | 라운드 / 테두리               | 드래그 핸들 |
| ----------------- | -------------------------------- | ----------------------------- | ----------- |
| `bottom` _(기본)_ | 가로 꽉 참, `max-height: 80vh`   | 위쪽 라운드 + 위 테두리       | **표시됨**  |
| `top`             | 가로 꽉 참, `max-height: 80vh`   | 아래쪽 라운드 + 아래 테두리   | 숨김        |
| `left`            | 너비 `75%`, `sm` 이상 `max-w-sm` | 오른쪽 라운드 + 오른쪽 테두리 | 숨김        |
| `right`           | 너비 `75%`, `sm` 이상 `max-w-sm` | 왼쪽 라운드 + 왼쪽 테두리     | 숨김        |

- 시트는 **열린 방향과 같은 방향으로 드래그**하면 닫힙니다(아래에서 올라온 시트는 아래로).
- 드래그 핸들(가운데 회색 바)은 `bottom`일 때만 보입니다. 다른 방향에서도 보이게 하려면 [스타일링 & 테마](#스타일링--테마-퍼블리셔용)의 핸들 항목을 참고하세요.

### 2. 비제어 vs 제어 — `open` / `onOpenChange`

```tsx
// 비제어 — 컴포넌트가 알아서 열고 닫음. Trigger/Close만 있으면 됨.
<Drawer>
  <DrawerTrigger asChild><Button>열기</Button></DrawerTrigger>
  <DrawerContent>…</DrawerContent>
</Drawer>

// 제어 — 바깥 state로 직접 여닫음. Trigger 없이 open만으로 제어 가능.
const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>열기</Button>
<Drawer open={open} onOpenChange={setOpen}>
  <DrawerContent>…</DrawerContent>
</Drawer>
```

- **비제어** — 여닫힘을 컴포넌트에 맡깁니다. 단순 안내처럼 "열고 닫기만" 하면 되는 경우.
- **제어** — 저장 성공 시 닫기, 유효성 실패 시 열림 유지 등 **여닫는 시점을 코드로 통제**해야 할 때. `open`을 넘기면 반드시 `onOpenChange`로 상태를 갱신해야 드래그·오버레이 클릭·ESC로도 정상적으로 닫힙니다.

---

{/* 캡쳐 추가 후 주석 해제: <img src="../assets/ui/drawer-controlled.png" alt="Drawer 제어 모드" width="100%" /> */}

:::tip 제어 모드 실전 흐름 — "임시 값(draft)"으로 편집
폼·필터를 담은 시트는 보통 **원본 값과 편집 중 값을 분리**합니다. 열 때 원본을 draft로 복사하고, 확정할 때만 원본에 반영합니다.

```tsx
const [open, setOpen] = useState(false);
const [nickname, setNickname] = useState("홍길동");
const [draft, setDraft] = useState(nickname);

<Button
  onClick={() => {
    setDraft(nickname);
    setOpen(true);
  }}
>
  닉네임 수정
</Button>;

{
  /* DrawerTrigger 없이 open만으로 제어 */
}
<Drawer open={open} onOpenChange={setOpen}>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>닉네임 수정</DrawerTitle>
      <DrawerDescription>
        2자 이상 입력해야 저장할 수 있습니다.
      </DrawerDescription>
    </DrawerHeader>
    <div className="px-4 pb-2">
      <input value={draft} onChange={(e) => setDraft(e.target.value)} />
    </div>
    <DrawerFooter>
      <Button
        disabled={draft.trim().length < 2}
        onClick={() => {
          setNickname(draft.trim());
          setOpen(false);
        }}
      >
        저장
      </Button>
      <Button variant="outline" onClick={() => setOpen(false)}>
        취소
      </Button>
    </DrawerFooter>
  </DrawerContent>
</Drawer>;
```

드래그로 닫히든 취소로 닫히든 draft만 버려지고 원본(`nickname`)은 그대로 유지됩니다.
:::

`defaultOpen`은 **비제어 초기값**입니다(마운트 시 열린 상태로 시작, 진입 애니메이션 생략). 제어 모드(`open`)와 함께 쓰지 마세요.

### 3. 단계별 높이 — `snapPoints`

시트를 **여러 단계 높이로 멈추게** 합니다. 지도 검색 결과, 음악 플레이어처럼 "살짝 보이다가 끌어올리면 전체가 되는" UI에 씁니다.

```tsx
const [snap, setSnap] = useState<number | string | null>(0.35);

<Drawer
  snapPoints={[0.35, 0.7, 1]}       {/* 화면의 35% → 70% → 100% */}
  activeSnapPoint={snap}
  setActiveSnapPoint={setSnap}
>
  <DrawerTrigger asChild>
    <Button variant="outline">스냅 시트 열기</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>지도 검색 결과</DrawerTitle>
    </DrawerHeader>
    <div className="overflow-y-auto px-4 pb-4">{/* …긴 목록… */}</div>
  </DrawerContent>
</Drawer>
```

---

{/* 캡쳐 추가 후 주석 해제: <img src="../assets/ui/drawer-snappoints.png" alt="Drawer snapPoints" width="100%" /> */}

- 배열 원소는 **비율(0~1)** 또는 **px 문자열**(`'300px'`)입니다. 섞어 쓸 수 있고, **작은 값부터** 나열합니다.
- `activeSnapPoint` / `setActiveSnapPoint`로 현재 단계를 **읽고 바꿀 수 있습니다.** (특정 버튼을 누르면 전체로 확장하는 등)
- 스냅을 쓰면 시트 안 스크롤 영역에 `overflow-y-auto`를 꼭 주세요. 그래야 단계를 올린 뒤 내용이 스크롤됩니다.
- `fadeFromIndex`로 **오버레이가 진해지기 시작하는 단계**를 지정할 수 있습니다(기본: 마지막 단계).

### 4. 닫힘 막기 — `dismissible={false}`

필수 동의처럼 **반드시 버튼으로만 닫아야** 할 때 씁니다. 드래그·오버레이 클릭·ESC가 모두 막힙니다.

```tsx
<Drawer dismissible={false}>
  <DrawerTrigger asChild>
    <Button variant="outline">필수 확인</Button>
  </DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>약관 확인이 필요합니다</DrawerTitle>
      <DrawerDescription>아래 버튼으로만 닫을 수 있습니다.</DrawerDescription>
    </DrawerHeader>
    <DrawerFooter>
      <DrawerClose asChild>
        <Button>확인했습니다</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

:::caution 탈출구를 반드시 남기세요
`dismissible={false}`는 사용자가 시트를 벗어날 방법을 전부 막습니다. `DrawerClose` 버튼이나 제어 모드의 `setOpen(false)` 중 **하나는 반드시** 제공해야 화면이 잠기지 않습니다.
:::

### 5. 뒷 배경 허용 — `modal={false}`

```tsx
<Drawer modal={false}>…</Drawer>
```

기본값은 `modal`(=`true`)로, 열려 있는 동안 **뒷 배경 스크롤·클릭이 막힙니다.** `modal={false}`를 주면 시트를 열어둔 채 **뒤쪽 콘텐츠와도 상호작용**할 수 있습니다(비모달 패널 — 지도 위 정보 시트 등).

### 6. 주의해서 쓸 옵션 — `handleOnly` / `shouldScaleBackground`

vaul이 제공하지만 **scaffold 기본 구성에서는 그대로 동작하지 않는** 두 옵션입니다.

:::danger `handleOnly`는 scaffold 기본 구성에서 쓰지 마세요
`handleOnly={true}`는 "드래그를 **vaul의 `Drawer.Handle` 컴포넌트에서만** 시작할 수 있게" 만드는 옵션입니다.
그런데 scaffold `DrawerContent`가 그리는 핸들은 vaul의 `Handle`이 아니라 **모양만 흉내 낸 일반 `div`** 입니다. 따라서 `handleOnly`를 켜면 **어디를 잡아도 드래그가 되지 않아 시트가 사실상 드래그 불가**가 됩니다.

시트 본문 스크롤과 드래그가 충돌하는 문제는 vaul이 `scrollLockTimeout`(기본 500ms)으로 이미 처리하므로, 대부분 `handleOnly` 없이 해결됩니다.
:::

:::caution `shouldScaleBackground`는 배경 래퍼 속성이 필요합니다
시트가 열릴 때 뒷 배경을 살짝 축소하는 iOS풍 연출입니다. 동작하려면 축소될 배경 요소에 `vaul-drawer-wrapper` 속성이 있어야 하는데, **scaffold 레이아웃에는 이 속성이 없어** 현재는 켜도 아무 변화가 없습니다.

쓰려면 앱 레이아웃 최상위 래퍼에 아래처럼 속성을 추가해야 합니다.

```tsx
<div vaul-drawer-wrapper="" className="min-h-screen bg-background">
  {/* 앱 전체 */}
</div>
```

:::

---

## 크기 · 모양 조정 — `className`

---

`DrawerContent`에 `className`을 주면 기본 클래스와 `cn()`으로 **병합**됩니다. 방향별 기본값을 덮어쓰거나, 본문만 스크롤되게 만들 수 있습니다.

```tsx
<Drawer direction="right">
  <DrawerTrigger asChild>
    <Button variant="outline">주문 상세</Button>
  </DrawerTrigger>

  {/* right 기본 폭(sm:max-w-sm)을 넓게 덮어쓰기 */}
  <DrawerContent className="sm:max-w-xl">
    <DrawerHeader>
      <DrawerTitle>주문 상세</DrawerTitle>
      <DrawerDescription>
        본문만 스크롤되고 헤더/푸터는 고정됩니다.
      </DrawerDescription>
    </DrawerHeader>

    {/* 시트가 flex-col 이므로, 본문에 flex-1 + overflow-y-auto 를 주면 가운데만 스크롤된다 */}
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
      {/* …긴 목록… */}
    </div>

    <DrawerFooter>
      <DrawerClose asChild>
        <Button variant="outline">닫기</Button>
      </DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

---

{/* 캡쳐 추가 후 주석 해제: <img src="../assets/ui/drawer-classname.png" alt="Drawer className 조정" width="100%" /> */}

- **폭(`left`/`right`)**: 기본 `sm:max-w-sm` → `sm:max-w-xl` 등으로 덮어씁니다.
- **높이(`bottom`/`top`)**: 기본 `max-h-[80vh]` → `max-h-[95vh]` 등으로 덮어씁니다.
- **긴 본문**: 시트 전체를 늘리기보다 **본문 div에만** `flex-1 overflow-y-auto`를 걸어, 헤더·푸터는 고정하고 가운데만 스크롤시키는 편이 좋습니다. (`DrawerContent`가 `flex flex-col`이라 그대로 동작합니다.)
- **푸터 가로 배치**: `DrawerFooter`는 기본이 세로입니다. `<DrawerFooter className="flex-row">`로 가로로 바꿉니다.

---

## API 레퍼런스

---

`Drawer`(루트)는 **vaul `Drawer.Root`의 props를 그대로** 받습니다. 아래 표에 없는 vaul 표준 prop도 전달됩니다. 자주 쓰는 것만 정리합니다.

### `Drawer` (루트)

| Prop                    | 타입                                     | 기본값          | 설명                                                                                          |
| ----------------------- | ---------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `direction`             | `"top" \| "right" \| "bottom" \| "left"` | `"bottom"`      | 열리는 방향                                                                                   |
| `open`                  | `boolean`                                | —               | 현재 열림 상태(제어). `onOpenChange`와 함께 사용                                              |
| `onOpenChange`          | `(open: boolean) => void`                | —               | 열림 상태 변경 콜백. 제어 모드에서 필수                                                       |
| `defaultOpen`           | `boolean`                                | `false`         | 초기 열림 여부(비제어). 진입 애니메이션 생략                                                  |
| `modal`                 | `boolean`                                | `true`          | `false`면 뒷 배경 스크롤·클릭 허용(비모달)                                                    |
| `dismissible`           | `boolean`                                | `true`          | `false`면 드래그·오버레이 클릭·ESC로 닫히지 않음                                              |
| `snapPoints`            | `(number \| string)[]`                   | —               | 단계별 높이. 비율(`0.35`) 또는 px 문자열(`'300px'`)                                           |
| `activeSnapPoint`       | `number \| string \| null`               | —               | 현재 스냅 단계(제어)                                                                          |
| `setActiveSnapPoint`    | `(snap) => void`                         | —               | 스냅 단계 변경 콜백                                                                           |
| `fadeFromIndex`         | `number`                                 | 마지막 단계     | 오버레이 페이드가 시작되는 스냅 인덱스                                                        |
| `closeThreshold`        | `number`                                 | `0.25`          | 이 비율 이상 끌어내리면 닫힘                                                                  |
| `scrollLockTimeout`     | `number`                                 | `500`           | 본문 스크롤 후 드래그가 잠기는 시간(ms)                                                       |
| `onClose`               | `() => void`                             | —               | 닫힘 시 호출                                                                                  |
| `onAnimationEnd`        | `(open: boolean) => void`                | —               | 열기/닫기 애니메이션 종료 후 호출. 상태 리셋에 유용                                           |
| `nested`                | `boolean`                                | `false`         | 시트 안에서 또 다른 시트를 열 때                                                              |
| `container`             | `HTMLElement \| null`                    | `document.body` | 포털 렌더 대상                                                                                |
| `handleOnly`            | `boolean`                                | `false`         | ⚠️ scaffold 기본 구성에선 [사용 금지](#6-주의해서-쓸-옵션--handleonly--shouldscalebackground) |
| `shouldScaleBackground` | `boolean`                                | `false`         | ⚠️ 배경 래퍼에 `vaul-drawer-wrapper` 속성 필요                                                |

### `DrawerContent`

| Prop                | 타입                         | 기본값 | 설명                                                   |
| ------------------- | ---------------------------- | ------ | ------------------------------------------------------ |
| `className`         | `string`                     | —      | 기본 클래스와 `cn()`으로 병합(폭·높이·라운드 override) |
| `children`          | `ReactNode`                  | —      | 시트 내용. 앞에 드래그 핸들 div가 자동으로 붙습니다    |
| `onInteractOutside` | `(e: Event) => void`         | —      | 바깥 클릭 이벤트(radix Dialog.Content 표준 prop)       |
| `onEscapeKeyDown`   | `(e: KeyboardEvent) => void` | —      | ESC 이벤트(radix Dialog.Content 표준 prop)             |

### `DrawerTrigger` / `DrawerClose`

| Prop      | 타입      | 기본값  | 설명                                                    |
| --------- | --------- | ------- | ------------------------------------------------------- |
| `asChild` | `boolean` | `false` | 자식 요소(Button 등)에 동작만 위임(자체 DOM 생성 안 함) |

> `DrawerHeader` · `DrawerTitle` · `DrawerDescription` · `DrawerFooter`는 모두 `className`을 받아 기본 스타일과 병합합니다. `DrawerHeader`/`DrawerFooter`는 일반 `div` props를, `DrawerTitle`/`DrawerDescription`은 vaul(radix) primitive props를 그대로 받습니다.

---

## 접근성 / 키보드

---

vaul이 radix Dialog 위에 만들어져 있어 **포커스 트랩과 ARIA 속성이 기본 내장**되어 있습니다. 별도 설정 없이 아래가 동작합니다.

| 키                  | 동작                                         |
| ------------------- | -------------------------------------------- |
| `Esc`               | 시트 닫기 (`dismissible={false}`면 차단됨)   |
| `Tab` / `Shift+Tab` | **시트 내부에서만** 포커스 순환(포커스 트랩) |
| `Enter` / `Space`   | 포커스된 버튼 실행                           |

- 열리면 포커스가 시트 안으로 이동하고, 닫히면 **트리거로 되돌아갑니다.**
- 열려 있는 동안 뒷 배경은 `aria-hidden` 처리되고 스크롤이 잠깁니다(`modal={true}` 기준).
- `DrawerTitle`은 `aria-labelledby`로, `DrawerDescription`은 `aria-describedby`로 자동 연결됩니다. **그래서 `DrawerTitle`을 넣는 것이 중요합니다.**
- 드래그는 어디까지나 **보조 수단**입니다. 마우스·키보드 사용자를 위해 `DrawerClose` 버튼을 항상 함께 두세요.

---

## 스타일링 & 테마 (퍼블리셔용)

---

SI 프로젝트에서 Drawer는 디자인 교체가 잦습니다. `drawer.tsx`를 고치지 않고도 **`*.module.css`의 `data-slot` 선택자만으로 전면 재스타일**이 가능합니다.

:::danger 가장 중요한 함정 — Portal
`DrawerContent`는 `document.body` 아래로 **Portal 렌더**됩니다. 따라서 페이지 래퍼 하위 선택자 (예: `.wrap :global([data-slot='drawer-content'])`) 로는 **절대 잡히지 않습니다.**
시트 스타일은 반드시 `<DrawerContent className={styles.sheet}>` 처럼 **시트 자신에게 클래스를 걸고**, 그 클래스를 기점으로 하위 슬롯을 지정하세요.

오버레이(`drawer-overlay`)는 시트의 **형제** 노드라 시트 클래스 하위로도 못 잡습니다. 전역 스타일에서 `[data-slot='drawer-overlay']`로 잡거나 `shared/lib/shadcn/ui/drawer.tsx`의 `DrawerOverlay`를 직접 수정하세요.
:::

컴포넌트가 노출하는 `data-slot` 목록입니다.

| data-slot            | 요소                | 설명                                                                  |
| -------------------- | ------------------- | --------------------------------------------------------------------- |
| `drawer-overlay`     | `DrawerOverlay`     | 딤 배경. 시트의 **형제** 노드라 시트 하위 선택자로는 못 잡음          |
| `drawer-content`     | `DrawerContent`     | 시트 본체. 방향별 위치·크기·라운드가 여기 걸림 (Portal로 body에 렌더) |
| `drawer-header`      | `DrawerHeader`      | 제목·부제 영역 (`bottom`/`top`은 기본 가운데 정렬)                    |
| `drawer-title`       | `DrawerTitle`       | 제목 텍스트                                                           |
| `drawer-description` | `DrawerDescription` | 부제 텍스트                                                           |
| `drawer-footer`      | `DrawerFooter`      | 하단 버튼 영역 (기본 세로 배치, `mt-auto`)                            |
| `drawer-trigger`     | `DrawerTrigger`     | 시트를 여는 트리거                                                    |
| `drawer-close`       | `DrawerClose`       | 시트를 닫는 버튼                                                      |

:::note `drawer` / `drawer-portal`은 선택자로 쓸 수 없습니다
루트 `Drawer`와 `DrawerPortal`은 **DOM 요소를 만들지 않는** 래퍼입니다. `data-slot` 값이 코드에 있어도 실제 DOM에는 나타나지 않으니 선택자로 기대하지 마세요.
:::

```css title="MySheet.module.css — 시트 자신(.sheet)을 기점으로 작성한다"
/* .sheet :global([data-slot='...']) 는 특이도(0,2,0)가 Tailwind 유틸(0,1,0)보다
   높아, 기본 클래스를 확실히 덮어쓴다. */
.sheet {
  background: #fff;
  border: none;
  border-radius: 22px 22px 0 0;
  max-width: 520px; /* bottom 시트를 가운데 정렬된 카드처럼 */
  margin: 0 auto;
  max-height: 86vh;
}

/* bottom 방향에서 자동 렌더되는 드래그 핸들 = 시트의 첫 번째 div */
.sheet > div:first-child {
  width: 44px;
  height: 5px;
  margin-top: 10px;
}

.sheet :global([data-slot="drawer-header"]) {
  padding: 14px 20px 10px;
  text-align: left;
}
.sheet :global([data-slot="drawer-title"]) {
  font-size: 17px;
  font-weight: 800;
}
.sheet :global([data-slot="drawer-description"]) {
  font-size: 12.5px;
}

/* 기본 세로 푸터를 가로 배치로 (+ 모바일 하단 안전영역 확보) */
.sheet :global([data-slot="drawer-footer"]) {
  flex-direction: row;
  gap: 10px;
  padding: 14px 20px calc(18px + env(safe-area-inset-bottom));
}

/* 다크 모드는 앱 규칙대로 */
:global(.dark) .sheet {
  background: #1c1917;
}
```

### 방향별 분기 — `data-vaul-drawer-direction`

vaul이 시트에 현재 방향을 **속성으로 노출**합니다. 방향마다 다른 모양을 줘야 할 때 씁니다.

```css
.sheet[data-vaul-drawer-direction="bottom"] {
  border-radius: 22px 22px 0 0;
}
.sheet[data-vaul-drawer-direction="right"] {
  border-radius: 22px 0 0 22px;
}
```

```tsx
{
  /* Tailwind로 쓸 때 */
}
<DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-xl" />;
```

### 드래그 핸들

`DrawerContent`의 **첫 번째 자식 div**가 핸들입니다. 기본은 `bottom`에서만 보이도록 되어 있습니다.

```css
/* 크기·색 조정 */
.sheet > div:first-child {
  width: 44px;
  height: 5px;
  background: #d6d3d1;
}

/* top 방향에서도 핸들 보이게 (기본은 bottom 전용) */
.sheet[data-vaul-drawer-direction="top"] > div:first-child {
  display: block;
}
```

### 오버레이(딤 배경)

기본 오버레이는 `bg-black/10` + 약한 블러라 **매우 옅습니다.** 더 진하게 만들려면 시트 하위가 아닌 **전역 선택자**로 잡아야 합니다.

```css title="전역 css (예: src/app/styles/*.css)"
[data-slot="drawer-overlay"] {
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: none;
}
```

:::note z-index 규칙
오버레이와 시트는 `z-100000`을 씁니다. 앱 헤더(`AppHeader`)가 sticky로 `z-99999`를 쓰기 때문에 **그보다 높아야 딤이 헤더까지 덮습니다.** 커스텀 시 이 값보다 낮추지 마세요.
:::

:::tip 핵심 원칙
동작(드래그·스냅·포커스 트랩·스크롤 잠금)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`DrawerContent`에 건 내 클래스를 기점으로 한 `data-slot` 오버라이드 ②헤더/본문/푸터 안에 넣는 **내 마크업** 두 가지뿐입니다. `drawer.tsx`를 복사해서 고치지 마세요.
CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---

## 실전 예제

---

제공 Drawer를 **구조 변경 없이 그대로** 쓰되, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트에서 확인하세요.

### 거래내역 필터 바텀시트

`*.module.css`의 `data-slot` 오버라이드만으로 앰버 톤 모바일 필터 시트로 재스타일하고, 시트에서 고른 값은 **임시(draft)로만 갖고 있다가 [적용하기]를 눌러야 반영**되는 실제 앱 동작까지 구현한 예제입니다.

---

{/* 캡쳐 추가 후 주석 해제: <img src="../assets/ui/drawer-real-filter.png" alt="거래내역 필터 바텀시트" width="100%" /> */}

**포인트**

- `open` / `onOpenChange`로 제어하고, **열릴 때마다 현재 적용값을 draft로 복사**합니다. 그냥 닫으면 편집분이 버려집니다.
- 겉모습은 전부 `DrawerContent`에 건 `className={styles.sheet}`를 기점으로 오버라이드했습니다(Portal 함정 회피).
- 페이지 쪽 요소(트리거·요약 태그)는 포털 밖이라 `.wrap` 하위로 잡습니다. **`.wrap`과 `.sheet` 양쪽에 색 토큰을 선언**해야 시트 안에서도 같은 팔레트가 적용됩니다.
- 칩·CTA도 scaffold `Button`을 그대로 쓰고 `[data-slot='button']` + 내 클래스로만 재스타일했습니다.

<details>
<summary><b>OrderFilterDrawer.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/drawer/OrderFilterDrawer.tsx"
import { useState } from "react";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@axiom/components/ui";
import { SlidersHorizontal } from "lucide-react";
import styles from "./OrderFilterDrawer.module.css";

const PERIODS = ["오늘", "1주일", "1개월", "3개월", "직접입력"] as const;
const TYPES = ["입금", "출금", "카드결제", "자동이체", "해외송금"] as const;
const AMOUNTS = ["전체", "1만원 이상", "10만원 이상", "100만원 이상"] as const;

type Period = (typeof PERIODS)[number];
type Amount = (typeof AMOUNTS)[number];

/** 적용 완료된 필터 값 */
interface IAppliedFilter {
  period: Period;
  types: string[];
  amount: Amount;
}

const INITIAL: IAppliedFilter = { period: "1개월", types: [], amount: "전체" };

export default function OrderFilterDrawer(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<IAppliedFilter>(INITIAL);
  const [draft, setDraft] = useState<IAppliedFilter>(INITIAL);

  /** 시트를 열 때마다 현재 적용값을 draft 로 복사해 편집을 시작한다 */
  // highlight-start
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(applied);
    setOpen(next);
  };
  // highlight-end

  const toggleType = (t: string) => {
    setDraft((prev) => ({
      ...prev,
      types: prev.types.includes(t)
        ? prev.types.filter((v) => v !== t)
        : [...prev.types, t],
    }));
  };

  const tags = [
    applied.period,
    ...applied.types,
    ...(applied.amount !== "전체" ? [applied.amount] : []),
  ];

  return (
    <div className={styles.wrap}>
      {/* ── 페이지 쪽: 요약 + 트리거 (포털 밖이라 .wrap 하위로 잡힌다) ── */}
      <div className={styles.bar}>
        <div>
          <div className={styles.barTitle}>거래내역</div>
          <div className={styles.barSub}>조건을 선택해 목록을 좁혀보세요.</div>
        </div>

        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerTrigger asChild>
            <Button className={styles.triggerBtn}>
              <SlidersHorizontal className="w-4 h-4" />
              필터
            </Button>
          </DrawerTrigger>
          {/* Portal 함정 회피: 스타일 기점을 시트(.sheet)에 건다 */}
          // highlight-next-line
          <DrawerContent className={styles.sheet}>
            <DrawerHeader>
              <DrawerTitle>거래내역 필터</DrawerTitle>
              <DrawerDescription>
                선택한 조건은 [적용]을 눌러야 반영됩니다.
              </DrawerDescription>
            </DrawerHeader>

            <div className={styles.body}>
              <div className={styles.group}>
                <div className={styles.groupTitle}>조회 기간</div>
                <div className={styles.chips}>
                  {PERIODS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, period: p }))
                      }
                      className={`${styles.chip} ${draft.period === p ? styles.chipOn : ""}`}
                      aria-pressed={draft.period === p}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>

              {/* … 거래 유형(복수 선택) / 거래 금액 그룹도 동일 패턴 … */}
            </div>

            <DrawerFooter>
              <Button
                type="button"
                onClick={() => setDraft(INITIAL)}
                className={`${styles.chip} ${styles.ctaGhost}`}
              >
                초기화
              </Button>
              {/* 닫기(DrawerClose) + 적용(setApplied)을 한 버튼에 겹친다 */}
              // highlight-start
              <DrawerClose asChild>
                <Button
                  type="button"
                  onClick={() => setApplied(draft)}
                  className={styles.cta}
                >
                  적용하기
                </Button>
              </DrawerClose>
              // highlight-end
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      {/* ── 적용된 필터 요약 ─────────────────────────────── */}
      <div className={styles.summary}>
        {tags.length === 0 ? (
          <span className={styles.summaryEmpty}>적용된 필터가 없습니다.</span>
        ) : (
          tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>OrderFilterDrawer.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/drawer/OrderFilterDrawer.module.css"
/* ⚠️ Drawer 는 Portal 로 document.body 밑에 렌더된다.
 *    → 페이지 쪽 래퍼(.wrap) 하위 선택자로는 시트 내부에 절대 닿지 않는다.
 *    → 그래서 시트 스타일은 반드시 DrawerContent 의 className(.sheet)을 기점으로 작성한다. */

/* 색 토큰은 .wrap 과 .sheet 양쪽에 선언한다 (서로 다른 DOM 트리에 있으므로) */
/* highlight-start */
.wrap,
.sheet {
  /* highlight-end */
  --fd-brand: #b45309;
  --fd-brand-deep: #92400e;
  --fd-brand-soft: #fef3c7;
  --fd-ink: #1c1917;
  --fd-sub: #57534e;
  --fd-card: #ffffff;
  --fd-border: #e7e5e4;
  --fd-line-soft: #f5f5f4;
  --fd-chip-bg: #fafaf9;
  color: var(--fd-ink);
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .wrap,
:global(.dark) .sheet {
  --fd-brand: #fbbf24;
  --fd-ink: #f5f5f4;
  --fd-card: #1c1917;
  --fd-border: #292524;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * 1) 페이지 쪽 — 트리거 / 현재 필터 요약 (포털 밖이라 .wrap 하위로 잡힌다)
 * ========================================================================= */
.wrap {
  border: 1px solid var(--fd-border);
  border-radius: 18px;
  background: var(--fd-card);
  padding: 18px;
}

/* 트리거 버튼: scaffold Button 슬롯 오버라이드 */
.wrap :global([data-slot="button"]).triggerBtn {
  height: auto;
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--fd-brand);
  border: none;
}

/* =========================================================================
 * 2) 시트 쪽 — DrawerContent(.sheet) 기점으로만 작성한다
 * ========================================================================= */
.sheet {
  background: var(--fd-card);
  border: none;
  border-top: 1px solid var(--fd-border);
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.18);
  max-width: 520px;
  margin: 0 auto;
  max-height: 86vh;
}

/* 드래그 핸들(bottom 방향일 때 자동 렌더되는 첫 번째 div) */
/* highlight-next-line */
.sheet > div:first-child {
  width: 44px;
  height: 5px;
  margin-top: 10px;
  background: var(--fd-border);
}

.sheet :global([data-slot="drawer-header"]) {
  padding: 14px 20px 10px;
  text-align: left;
  border-bottom: 1px solid var(--fd-line-soft);
}
.sheet :global([data-slot="drawer-title"]) {
  font-size: 17px;
  font-weight: 800;
  color: var(--fd-ink);
}
.sheet :global([data-slot="drawer-description"]) {
  font-size: 12.5px;
  color: var(--fd-sub);
}

/* 시트 본문 — 스크롤은 여기서 */
.body {
  padding: 6px 20px 4px;
  overflow-y: auto;
}

/* 칩: scaffold Button 슬롯 오버라이드 (.chip 으로 스코프를 좁혀 CTA와 분리) */
.sheet :global([data-slot="button"]).chip {
  height: auto;
  padding: 9px 14px;
  border-radius: 11px;
  color: var(--fd-sub);
  background: var(--fd-chip-bg);
  border: 1.5px solid var(--fd-border);
}
.sheet :global([data-slot="button"]).chipOn {
  color: var(--fd-brand);
  background: var(--fd-brand-soft);
  border-color: var(--fd-brand);
}

/* 하단 CTA — 기본 세로 푸터를 가로로 바꾸고 안전영역 확보 */
/* highlight-start */
.sheet :global([data-slot="drawer-footer"]) {
  flex-direction: row;
  gap: 10px;
  padding: 14px 20px calc(18px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--fd-line-soft);
  background: var(--fd-card);
}
/* highlight-end */
.sheet :global([data-slot="button"]).cta {
  flex: 1;
  height: auto;
  padding: 14px;
  border-radius: 14px;
  font-weight: 800;
  color: #fff;
  background: var(--fd-brand);
  border: none;
}
.sheet :global([data-slot="button"]).ctaGhost {
  flex: 0 0 auto;
  color: var(--fd-sub);
  background: transparent;
  border: 1.5px solid var(--fd-border);
}
```

</details>

:::tip 이 예제에서 가져갈 것
① 시트 스타일의 기점은 **언제나 `DrawerContent`에 건 내 클래스**(Portal 함정), ② 색 토큰은 **`.wrap`과 `.sheet` 양쪽에** 선언, ③ 필터·폼 시트는 **draft 상태로 편집하고 [적용]에서만 반영**, ④ 모바일 하단 버튼에는 `env(safe-area-inset-bottom)`을 더해 홈 인디케이터를 피합니다.
:::

---
