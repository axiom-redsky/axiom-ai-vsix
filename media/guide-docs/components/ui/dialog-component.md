---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Dialog"
hide_table_of_contents: false
---

# Dialog 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 대화상자(모달) 컴포넌트입니다.
현재 화면 위에 겹쳐 뜨는 패널로, **사용자의 주의를 한곳에 모아** 확인·취소·짧은 폼 입력을 받을 때 사용합니다. 내부적으로 `radix-ui`를 사용하며 **오버레이·포커스 트랩·ESC 닫기·스크롤 잠금**을 기본 지원합니다.

**언제 쓰나요?**

* 삭제·결제처럼 **되돌리기 어려운 작업을 확정**받을 때 (확인/취소)
* 공지·업데이트 안내처럼 **읽고 넘어가야 하는 알림**
* 이름·닉네임 수정 같은 **짧은 폼**을 흐름을 끊지 않고 처리할 때
* 테이블 행에서 **상세 정보를 겹쳐 띄워** 보여줄 때

> 열림 상태를 컴포넌트에 맡길지(비제어), 바깥 `useState`로 직접 쥘지(제어)에 따라 사용법이 갈립니다. 저장 성공 시 닫기·유효성 실패 시 열림 유지 같은 흐름이 필요하면 **제어 모드**를 씁니다. (아래 [동작 옵션](#동작-옵션) 참고)

---


## Import
---

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@axiom/components/ui';
```

Dialog는 여러 파트를 **조합해서** 쓰는 합성(compound) 컴포넌트입니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

:::note `DialogContent`가 Overlay·Portal을 품고 있습니다
`DialogContent`는 내부에서 `DialogOverlay`(딤 배경)와 `DialogPortal`(body 밑 렌더)을 **자동으로 포함**합니다. 따라서 `DialogOverlay` / `DialogPortal`을 직접 import해 배치할 필요가 없습니다.
:::

---


## 기본 사용법
---

가장 기본적인 형태입니다. `DialogTrigger`로 열고, **오버레이 클릭 / ESC / 우상단 X / 하단 버튼** 중 무엇으로도 닫힙니다.

---
<img src="../assets/ui/dialog-basic.png" alt="Dialog 기본 사용법" width="100%" />

```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">약관 보기</Button>
  </DialogTrigger>

  <DialogContent>          {/* Overlay + Portal 포함, 우상단 X 자동 표시 */}
    <DialogHeader>
      <DialogTitle>서비스 이용약관</DialogTitle>
      <DialogDescription>가입 전 아래 내용을 확인해 주세요.</DialogDescription>
    </DialogHeader>

    <div className="text-sm text-muted-foreground">
      본 서비스는 관련 법령을 준수하며, 회원의 개인정보를 안전하게 보호합니다.
    </div>

    <DialogFooter>
      <DialogClose asChild>
        <Button>확인</Button>
      </DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

:::tip `DialogTrigger asChild` 는 왜 쓰나
`asChild`를 주면 트리거가 **자기 DOM을 만들지 않고** 자식(`Button`)에 "열기" 동작만 위임합니다. 덕분에 scaffold `Button`의 생김새를 그대로 유지하면서 트리거로 쓸 수 있습니다. 닫기 버튼(`DialogClose asChild`)도 같은 원리입니다.
:::

---


## 구성 (Anatomy)
---

Dialog는 아래 파트를 중첩해서 구성합니다.

```tsx
<Dialog>                     {/* 루트 — 열림 상태를 관리 (radix Dialog.Root) */}
  <DialogTrigger />          {/* 여는 트리거 (제어 모드에선 생략 가능) */}
  <DialogContent>            {/* 본체(카드). Overlay + Portal 자동 포함 */}
    <DialogHeader>           {/* 제목·부제 영역 (기본 세로 배치) */}
      <DialogTitle />        {/* 제목 텍스트 */}
      <DialogDescription />  {/* 부제 텍스트 */}
    </DialogHeader>
    {/* ...본문(자유 마크업)... */}
    <DialogFooter>           {/* 하단 버튼 영역 (기본 상단 border + muted 배경) */}
      <DialogClose />        {/* 닫는 버튼 */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

| 파트 | 역할 |
| --- | --- |
| `Dialog` | 루트. 열림 상태를 관리합니다(radix `Dialog.Root`). `open`/`onOpenChange`/`modal` 등을 받습니다. |
| `DialogTrigger` | 다이얼로그를 여는 트리거. **제어 모드에선 생략**하고 바깥 버튼으로 열어도 됩니다. |
| `DialogContent` | 본체(카드). 위치·크기·라운드가 여기 걸립니다. `DialogOverlay`·`DialogPortal`을 **내부에 포함**하고, 우상단 X 닫기 버튼을 자동 렌더합니다. |
| `DialogHeader` | 제목·부제를 담는 영역(기본 세로 배치). |
| `DialogTitle` | 제목 텍스트. **접근성상 권장**(스크린리더가 다이얼로그 이름으로 읽음). |
| `DialogDescription` | 부제/설명 텍스트. |
| `DialogFooter` | 하단 버튼 영역. 기본으로 상단 border + muted 배경 + 음수 마진이 걸려 카드 바닥에 붙습니다. |
| `DialogClose` | 다이얼로그를 닫는 버튼. `asChild`로 임의의 버튼에 닫기 동작을 위임합니다. |

:::caution `DialogTitle`을 생략하지 마세요
radix Dialog는 접근성을 위해 `DialogTitle`을 기대합니다. 제목을 화면에 굳이 보이고 싶지 않아도, 최소한 `sr-only` 클래스로 감춘 제목을 넣어 스크린리더가 다이얼로그를 식별할 수 있게 하세요.
:::

---


## 동작 옵션
---
Dialog의 여닫힘은 **누가 열림 상태를 쥐느냐**로 갈립니다. 원하는 UX에 맞춰 아래에서 고르세요.


### 1. 비제어 vs 제어 — `open` / `onOpenChange`

```tsx
// 비제어 — 컴포넌트가 알아서 열고 닫음. Trigger/Close만 있으면 됨.
<Dialog>
  <DialogTrigger asChild><Button>열기</Button></DialogTrigger>
  <DialogContent>…</DialogContent>
</Dialog>

// 제어 — 바깥 state로 직접 여닫음. Trigger 없이 open만으로 제어 가능.
const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>열기</Button>
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>…</DialogContent>
</Dialog>
```

* **비제어** — 여닫힘을 컴포넌트에 맡깁니다. 단순 안내·약관 보기처럼 "열고 닫기만" 하면 되는 경우.
* **제어** — 저장 성공 시 닫기, 유효성 검사 실패 시 열림 유지, 다른 UI와 연동 등 **여닫는 시점을 코드로 통제**해야 할 때. `open`을 넘기면 반드시 `onOpenChange`로 상태를 갱신해야 오버레이 클릭·ESC로도 정상적으로 닫힙니다.

:::tip 제어 모드 실전 흐름 — "임시 값(draft)"으로 편집
폼을 담은 Dialog는 보통 **원본 값과 편집 중 값을 분리**합니다. 열 때 원본을 draft로 복사하고, 저장할 때만 원본에 반영합니다.

```tsx
const [open, setOpen] = useState(false);
const [nickname, setNickname] = useState('홍길동');
const [draft, setDraft] = useState(nickname);

<Button onClick={() => { setDraft(nickname); setOpen(true); }}>닉네임 수정</Button>

{/* DialogTrigger 없이 open만으로 제어 */}
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>닉네임 수정</DialogTitle></DialogHeader>
    <input value={draft} onChange={(e) => setDraft(e.target.value)} />
    <DialogFooter>
      <Button
        disabled={draft.trim().length < 2}
        onClick={() => { setNickname(draft.trim()); setOpen(false); }}
      >
        저장
      </Button>
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
저장하지 않고 닫으면 draft만 버려지고 원본(`nickname`)은 그대로 유지됩니다.
:::


### 2. 처음부터 열어두기 — `defaultOpen`

```tsx
// 마운트 시 열린 상태로 시작(비제어)
<Dialog defaultOpen>
  <DialogContent>…</DialogContent>
</Dialog>
```

`defaultOpen`은 **비제어 초기값**입니다. 이후 여닫힘은 컴포넌트가 관리합니다. 제어 모드(`open`)와 함께 쓰지 마세요.


### 3. 닫힘 막기 — 바깥 클릭 / ESC

필수 확인처럼 **반드시 버튼으로만 닫아야** 할 때는, 바깥 클릭과 ESC를 각각 `preventDefault`로 막습니다.

```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">필수 확인</Button>
  </DialogTrigger>
  <DialogContent
    showCloseButton={false}                      {/* 우상단 X도 숨겨 탈출구 제거 */}
    onInteractOutside={(e) => e.preventDefault()} {/* 바깥 클릭으로 닫힘 방지 */}
    onEscapeKeyDown={(e) => e.preventDefault()}   {/* ESC로 닫힘 방지 */}
  >
    <DialogHeader>
      <DialogTitle>약관 확인이 필요합니다</DialogTitle>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild><Button>확인했습니다</Button></DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

* `onInteractOutside` / `onEscapeKeyDown`을 `preventDefault`하면 해당 경로로는 닫히지 않습니다.
* 이때는 `showCloseButton={false}`로 우상단 X도 함께 숨겨, **하단 버튼만이 유일한 닫기 경로**가 되게 합니다.


### 4. 뒷 배경 허용 — `modal={false}`

```tsx
<Dialog modal={false}>…</Dialog>
```

기본값은 `modal`(=`true`)로, 열려 있는 동안 **뒷 배경 스크롤·클릭이 막힙니다.** `modal={false}`를 주면 다이얼로그를 열어둔 채 **뒤쪽 콘텐츠와도 상호작용**할 수 있습니다(비모달 패널).

---


## Footer / Close 버튼 옵션
---

닫기 버튼은 두 군데에서 나옵니다. 우상단 X(`DialogContent`)와 하단 Close(`DialogFooter`)이며, 각각 독립된 `showCloseButton`으로 켜고 끕니다.

```tsx
{/* 우상단 X 없이, 하단에 자동 Close 버튼만 */}
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">공지 확인</Button>
  </DialogTrigger>
  <DialogContent showCloseButton={false}>   {/* 우상단 X 숨김 (기본 true) */}
    <DialogHeader>
      <DialogTitle>업데이트 안내</DialogTitle>
      <DialogDescription>새로운 기능이 추가되었습니다.</DialogDescription>
    </DialogHeader>
    <DialogFooter showCloseButton>          {/* 하단에 outline "Close" 버튼 자동 추가 (기본 false) */}
      <Button>지금 사용해보기</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

| 위치 | prop | 기본값 | 설명 |
| --- | --- | --- | --- |
| `DialogContent` | `showCloseButton` | `true` | 우상단 X(아이콘) 닫기 버튼 |
| `DialogFooter` | `showCloseButton` | `false` | 하단에 outline "Close" 버튼 자동 추가 |

:::note 두 옵션은 서로 독립적
`DialogContent`의 X와 `DialogFooter`의 Close는 별개입니다. "우상단 X는 숨기고 하단 Close만" / "둘 다 표시" 등 자유롭게 조합하세요. 직접 만든 `<DialogClose asChild>` 버튼과도 함께 쓸 수 있습니다.
:::

---


## 크기 · 모양 조정 — `className`
---

`DialogContent`에 `className`을 주면 기본 클래스와 `cn()`으로 **병합**됩니다. 기본 폭(`sm:max-w-sm`)을 덮어쓰거나, 본문만 스크롤되게 만들 수 있습니다.

```tsx
<Dialog>
  <DialogTrigger asChild><Button variant="outline">주문 상세</Button></DialogTrigger>
  <DialogContent className="sm:max-w-xl">    {/* 기본 폭 override */}
    <DialogHeader>
      <DialogTitle>주문 상세</DialogTitle>
    </DialogHeader>
    {/* 본문만 스크롤되게 max-height + overflow-y-auto (헤더/푸터는 고정) */}
    <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-2">
      {/* …긴 목록… */}
    </div>
    <DialogFooter showCloseButton />
  </DialogContent>
</Dialog>
```

* **폭**: `sm:max-w-md`, `sm:max-w-xl` 등으로 기본 `sm:max-w-sm`을 덮어씁니다.
* **긴 본문**: 다이얼로그 전체를 늘리기보다 **본문 div에만** `max-h-[…] overflow-y-auto`를 걸어, 헤더·푸터는 고정하고 가운데만 스크롤시키는 편이 좋습니다.

---


## API 레퍼런스
---

`Dialog`(루트)는 **radix `Dialog.Root`의 props를 그대로** 받습니다. 아래 표에 없는 radix 표준 prop도 전달됩니다. 자주 쓰는 것만 정리합니다.

### `Dialog` (루트)

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | 현재 열림 상태(제어). `onOpenChange`와 함께 사용 |
| `onOpenChange` | `(open: boolean) => void` | — | 열림 상태 변경 콜백. 제어 모드에서 필수 |
| `defaultOpen` | `boolean` | `false` | 초기 열림 여부(비제어) |
| `modal` | `boolean` | `true` | `false`면 뒷 배경 스크롤·클릭 허용(비모달) |

### `DialogContent`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `showCloseButton` | `boolean` | `true` | 우상단 X 닫기 버튼 표시 |
| `onInteractOutside` | `(e: Event) => void` | — | `preventDefault` 시 바깥 클릭으로 닫힘 방지 |
| `onEscapeKeyDown` | `(e: KeyboardEvent) => void` | — | `preventDefault` 시 ESC로 닫힘 방지 |
| `className` | `string` | — | 기본 클래스와 `cn()`으로 병합(폭·패딩 등 override) |

### `DialogFooter`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `showCloseButton` | `boolean` | `false` | 하단에 outline "Close" 버튼 자동 추가 |
| `className` | `string` | — | 기본 클래스와 병합 |

### `DialogTrigger` / `DialogClose`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `asChild` | `boolean` | `false` | 자식 요소(Button 등)에 동작만 위임(자체 DOM 생성 안 함) |

> `DialogHeader` · `DialogTitle` · `DialogDescription`은 모두 `className`을 받아 기본 스타일과 병합합니다.

---


## 접근성 / 키보드
---

radix 기반이라 **포커스 트랩과 ARIA 속성이 기본 내장**되어 있습니다. 별도 설정 없이 아래가 동작합니다.

| 키 | 동작 |
| --- | --- |
| `Esc` | 다이얼로그 닫기 (`onEscapeKeyDown` preventDefault로 차단 가능) |
| `Tab` / `Shift+Tab` | **다이얼로그 내부에서만** 포커스 순환(포커스 트랩) |
| `Enter` / `Space` | 포커스된 버튼 실행 |

* 열리면 포커스가 다이얼로그 안으로 이동하고, 닫히면 **트리거로 되돌아갑니다.**
* 열려 있는 동안 뒷 배경은 `aria-hidden` 처리되고 스크롤이 잠깁니다(`modal={true}` 기준).
* `DialogTitle`은 `aria-labelledby`로, `DialogDescription`은 `aria-describedby`로 자동 연결됩니다. **그래서 `DialogTitle`을 넣는 것이 중요합니다.**

---


## 스타일링 & 테마 (퍼블리셔용)
---

SI 프로젝트에서 Dialog는 디자인 교체가 잦습니다. `dialog.tsx`를 고치지 않고도 **`*.module.css`의 `data-slot` 선택자만으로 전면 재스타일**이 가능합니다.

:::danger 가장 중요한 함정 — Portal
`DialogContent`는 `document.body` 아래로 **Portal 렌더**됩니다. 따라서 **페이지 래퍼 하위 선택자로는 절대 잡히지 않습니다.**
스타일은 반드시 `<DialogContent className={styles.sheet}>` 처럼 **본체 자신에게 클래스를 걸고**, 그 클래스를 기점으로 하위 슬롯을 지정하세요.

오버레이(`dialog-overlay`)는 본체의 **형제** 노드라 본체 클래스 하위로도 못 잡습니다. 전역 스타일에서 `[data-slot='dialog-overlay']`로 잡거나 `shared/lib/shadcn/ui/dialog.tsx`의 `DialogOverlay`를 직접 수정하세요.
:::

컴포넌트가 노출하는 `data-slot` 목록입니다.

| data-slot | 요소 | 설명 |
| --- | --- | --- |
| `dialog-overlay` | `DialogOverlay` | 딤 배경. 본체의 **형제** 노드라 본체 하위 선택자로는 못 잡음 |
| `dialog-content` | `DialogContent` | 본체(카드). 위치·크기·라운드가 여기 걸림 (Portal로 body에 렌더) |
| `dialog-header` | `DialogHeader` | 제목·부제 영역(기본 세로 배치) |
| `dialog-title` | `DialogTitle` | 제목 텍스트 |
| `dialog-description` | `DialogDescription` | 부제 텍스트 |
| `dialog-footer` | `DialogFooter` | 하단 버튼 영역(기본 상단 border + muted 배경) |
| `dialog-trigger` | `DialogTrigger` | 다이얼로그를 여는 트리거 |
| `dialog-close` | `DialogClose` | 닫는 버튼(우상단 X 포함) |

```css title="MyDialog.module.css — 본체(.sheet)를 기점으로 작성한다"
/* .sheet :global([data-slot='...']) 는 특이도(0,2,0)가 Tailwind 유틸(0,1,0)보다
   높아, 기본 클래스를 확실히 덮어쓴다. */
.sheet {
  background: #fff;
  border-radius: 18px;
  max-width: 26rem;
  padding: 24px;
}

.sheet :global([data-slot='dialog-header'])      { align-items: center; text-align: center; }
.sheet :global([data-slot='dialog-title'])       { font-size: 18px; font-weight: 800; }
.sheet :global([data-slot='dialog-description'])  { font-size: 13px; }

/* 기본 푸터(상단 border + muted 배경 + 음수마진)를 걷어내고 가로 배치로 */
.sheet :global([data-slot='dialog-footer']) {
  margin: 0; padding: 0; border-top: none; background: transparent;
  flex-direction: row; gap: 10px;
}

/* 다크 모드는 앱 규칙대로 */
:global(.dark) .sheet { background: #1c1917; }
```

:::tip 핵심 원칙
동작(포커스 트랩·ESC·스크롤 잠금)은 **컴포넌트에 그대로 맡기고**, 바꾸는 건 ①`DialogContent`에 건 내 클래스를 기점으로 한 `data-slot` 오버라이드 ②헤더/본문/푸터 안에 넣는 **내 마크업** 두 가지뿐입니다. `dialog.tsx`를 복사해서 고치지 마세요.
:::

---


## 실전 예제
---

제공 Dialog를 **구조 변경 없이 그대로** 쓰되, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트에서 확인하세요.


### 1. 위험 작업 확인 (계정 삭제)

`*.module.css`의 `data-slot` 오버라이드만으로 로즈/danger 톤으로 재스타일하고, **확인 문구를 정확히 입력해야만 삭제 버튼이 활성화**되는 오폭 방지 패턴을 구현한 예제입니다.

---
<img src="../assets/ui/dialog-real.png" alt="Dialog 계정 삭제 예제" width="100%" />

**포인트**

* `open`/`onOpenChange`로 제어하고, **닫힐 때 입력값을 초기화**합니다.
* `showCloseButton={false}`로 우상단 X를 숨기고 **하단 버튼으로만** 닫습니다.
* 겉모습은 전부 `DialogContent`에 건 `className={styles.sheet}`를 기점으로 `data-slot` 선택자에서 오버라이드했습니다(Portal 함정 회피).

<details>
<summary><b>DeleteAccountDialog.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/dialog/DeleteAccountDialog.tsx"
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@axiom/components/ui';
import { TriangleAlert, Check } from 'lucide-react';
import styles from './DeleteAccountDialog.module.css';

/** 삭제를 확정하려면 사용자가 그대로 입력해야 하는 확인 문구 */
const CONFIRM_TEXT = '계정 삭제';

export default function DeleteAccountDialog(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [deleted, setDeleted] = useState(false);

  const canDelete = input.trim() === CONFIRM_TEXT;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setInput(''); // 닫힐 때 입력값 리셋
  };

  const handleDelete = () => {
    setOpen(false);
    setInput('');
    setDeleted(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      // highlight-next-line
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">계정 삭제…</Button>
        </DialogTrigger>

        {/* Portal 함정 회피: 스타일 기점을 본체(.sheet)에 건다 */}
        // highlight-next-line
        <DialogContent showCloseButton={false} className={styles.sheet}>
          <DialogHeader>
            <div className={styles.iconBadge}>
              <TriangleAlert className="w-6 h-6" />
            </div>
            <DialogTitle>정말 계정을 삭제할까요?</DialogTitle>
            <DialogDescription>
              이 작업은 <b>되돌릴 수 없습니다.</b> 계속하려면 아래 입력란에{' '}
              <code className={styles.code}>{CONFIRM_TEXT}</code> 를 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className={styles.input}
            autoFocus
          />

          <DialogFooter>
            {/* 확인 문구가 정확할 때만 활성화 (오폭 방지) */}
            // highlight-next-line
            <Button className={styles.danger} disabled={!canDelete} onClick={handleDelete}>
              영구 삭제
            </Button>
            <DialogClose asChild>
              <Button variant="outline" className={styles.cancel}>취소</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleted && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          삭제 요청이 접수되었습니다 (데모).
        </span>
      )}
    </div>
  );
}
```

</details>

:::tip 이 예제에서 가져갈 것
① 위험 작업엔 **제어 모드 + 확인 문구 입력**으로 오폭을 막고, ② `showCloseButton={false}`로 **탈출구를 하단 버튼 하나로** 좁히고, ③ 닫힐 때 `onOpenChange`에서 **입력 상태를 리셋**합니다.
:::


### 2. 테이블 행에서 Dialog 열기 (패턴 A)

**row마다 Dialog를 만들지 마세요.** `DialogContent`는 Portal로 body 밑에 렌더되므로 row 안에 두는 건 위치상 의미가 없고 인스턴스만 늘어납니다. 정답은 **"Dialog는 테이블 바깥에 단 1개, 어떤 row를 열지는 `target` 상태로 넘기기"**입니다. (앞의 제어 모드 예제에서 boolean `open`을 "선택된 row"로 확장한 것)

---
<img src="../assets/ui/dialog-real2.png" alt="Dialog Table에서 열기 예제" width="100%" />


**포인트**

* `const [target, setTarget] = useState<Row | null>(null)` — row 버튼은 `onClick={() => setTarget(row)}`로 **누구를 열지만** 지정합니다.
* Dialog는 `open={target !== null}`로 파생시키고, 닫힐 때 `setTarget(null)`로 되돌립니다. **row가 100개든 Dialog 인스턴스는 1개**입니다.
* 이 패턴은 특정 테이블 구현과 무관합니다. 기본 `Table`이든 `SmartTable`의 `renderRowActions`든, 행 버튼의 `onClick`에서 `setTarget(row)`만 부르면 그대로 적용됩니다.

<details>
<summary><b>MemberTableDialog.tsx</b> — 핵심 발췌</summary>

```tsx title="src/domains/example/components/ui-components/dialog/MemberTableDialog.tsx"
export default function MemberTableDialog(): React.ReactNode {
  // 열려있는 대상 row. null이면 닫힘.
  // highlight-next-line
  const [target, setTarget] = useState<IMember | null>(null);

  return (
    <div className="space-y-2">
      <Table>
        {/* …thead… */}
        <TableBody>
          {MEMBERS.map((member) => (
            <TableRow key={member.id}>
              {/* …cells… */}
              <TableCell className="text-right">
                {/* row 버튼은 "누구를 열지"만 지정한다. Dialog는 여기 없다. */}
                // highlight-next-line
                <Button size="sm" variant="outline" onClick={() => setTarget(member)}>
                  <Eye className="w-3.5 h-3.5" /> 상세
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Dialog는 테이블 바깥에 단 하나. target으로 열고 닫는다. */}
      // highlight-start
      <Dialog
        open={target !== null}
        onOpenChange={(open) => { if (!open) setTarget(null); }}
      >
      // highlight-end
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.name} 회원 상세</DialogTitle>
            <DialogDescription>선택한 행의 정보를 하나의 Dialog에서 보여줍니다.</DialogDescription>
          </DialogHeader>

          {/* target이 있을 때만 본문을 그린다 (닫힐 때 target=null이라 옵셔널 접근) */}
          // highlight-next-line
          {target && (
            <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt>회원번호</dt><dd>#{target.id}</dd>
              <dt>이름</dt><dd>{target.name}</dd>
              {/* …나머지 필드… */}
            </dl>
          )}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

</details>

:::caution `target?.` 옵셔널 접근에 주의
닫는 순간 `target`이 `null`이 되지만 Dialog는 페이드아웃 동안 잠깐 더 렌더됩니다. 그래서 본문은 `{target && (…)}`로 감싸고, 제목처럼 짧은 참조는 `target?.name`으로 **옵셔널 체이닝**해 널 접근 에러를 피합니다.
:::

---


## 곧 제공 예정 — `$ui.dialog()`
---

지금 이 페이지의 **컴포넌트형** `<Dialog>`와 별개로, **명령형(imperative)** 호출 방식도 준비 중입니다.

컴포넌트형은 JSX 안에 마크업을 배치하고 상태로 여닫습니다. 반면 `$ui.dialog()`는 **함수 한 번 호출로 열고 `await`로 결과를 받는** API가 될 예정입니다. 같은 UI지만, 이벤트 핸들러 흐름 안에서 쓰기 편하도록 사용성을 얹은 것입니다.

```tsx
// (예정) 명령형 호출 — JSX 배치 없이 흐름 안에서 바로 사용
const ok = await $ui.dialog({
  title: '정말 삭제할까요?',
  description: '이 작업은 되돌릴 수 없습니다.',
  confirmText: '삭제',
  cancelText: '취소',
});
if (ok) await deleteAccount();
```

:::info 현재 제공 범위
위 코드는 **예정 API 미리보기**입니다. 현재 제공되는 `$ui`는 `$ui.alert()` / `$ui.confirm()` 입니다(좌측 메뉴 참고). `$ui.dialog()`가 추가되면 이 문서를 갱신합니다.
:::

---
