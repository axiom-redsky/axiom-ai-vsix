---
sidebar_position: 1
displayed_sidebar: "apiDocSidebar"
title: "⋮ $ui.dialog"
---

# $ui.dialog

`react-app-scaffold`가 전역으로 제공하는 **명령형 모달 API**입니다.
**임의의 React 컴포넌트**를 모달로 띄우고, 사용자가 만든 결과를 `await` 한 줄로 돌려받습니다.

- 별도의 `import` 없이 전역 객체 `$ui`로 바로 호출합니다. (`window.$ui.dialog`)
- 본문에 넘기는 컴포넌트는 **아무것도 감싸지 않은 평범한 React 컴포넌트**면 됩니다.
- 반환값은 **진짜 `Promise`** 이면서 동시에 `update` · `close` 같은 **제어 메서드를 가진 핸들**입니다.
- 취소 · ESC · X · 배경 클릭은 **모두 `undefined`로 resolve** 됩니다. (절대 `reject` 하지 않습니다)
- 다이얼로그를 **여러 겹 중첩**해서 열 수 있고, [`$ui.alert`](./alert-ui) / [`$ui.confirm`](./confirm-ui)은 항상 그 위에 뜹니다.

```tsx
// 사용 형태 — 이벤트 핸들러 안에서 한 줄
const nickname = await $ui.dialog<string>({
  // ← <T> 로 결과 타입을 지정
  component: NicknameFormDialog, // 본문으로 띄울 내 컴포넌트 (평범한 컴포넌트)
  props: { initial: "홍길동" }, // 그 컴포넌트에 넘길 props
  title: "닉네임 수정",
  footer: { confirmText: "저장" },
});

if (nickname) save(nickname); // 취소 · ESC · X · 배경 = undefined
```

**언제 쓰나요?**

- 목록에서 한 건을 **고르고 그 값을 받아오는** 피커 (회원 선택 · 코드 조회 · 파일 선택)
- 이름·문의 같은 **짧은 폼**을 띄우고 입력값을 결과로 받는 흐름
- 진행률 · 처리 현황처럼 **열어둔 채 값을 계속 갱신**해야 하는 화면
- 테이블 **행마다** 상세를 띄워야 하는데, 부모로 state를 끌어올리고 싶지 않을 때

:::tip 단순 알림·확인은 `$ui.alert` / `$ui.confirm`
"저장되었습니다" 같은 알림은 [`$ui.alert`](./alert-ui), "삭제할까요?" 같은 예/아니오는 [`$ui.confirm`](./confirm-ui)이 훨씬 짧습니다.
`$ui.dialog`는 **본문이 커스텀 컴포넌트일 때** 씁니다.
:::

:::info 옵션 · API 전체 목록
쓸 수 있는 옵션과 API를 한눈에 보려면 **[API 참조](#api-참조)** 로 바로 가세요.
:::

---

## 컴포넌트형 `<Dialog>`와 무엇이 다른가

---

같은 UI(shadcn `Dialog`)를 그리지만 **사용법이 완전히 다릅니다.** 컴포넌트형은 [Dialog 컴포넌트](../../../components/ui/dialog-component) 문서를 참고하세요.

|                    | 컴포넌트형 `<Dialog>`                           | `$ui.dialog` (명령형)        |
| ------------------ | ----------------------------------------------- | ---------------------------- |
| 여는 방법          | `useState`로 `open`을 `true`로                  | 이벤트 핸들러에서 함수 호출  |
| JSX 배치           | 화면 어딘가에 마크업을 **미리 놓아야** 함       | **없음**                     |
| 결과 받기          | `onSelect` 같은 **콜백 prop을 역방향으로 배선** | `await` **반환값**           |
| 닫힘 후 초기화     | `onOpenChange`에서 직접 리셋                    | 언마운트되므로 **불필요**    |
| 목록의 행에서 열기 | `target` state를 **부모로 호이스팅**            | 행의 `onClick`에서 바로 호출 |
| 중첩               | 직접 z-index 관리                               | **스택 + z-index 티어 자동** |

```tsx
// 컴포넌트형 — 상태 · JSX · 콜백 3종 세트가 필요하다
const [target, setTarget] = useState<IMember | null>(null);
// ...
<MemberPickerDialog
  open={target !== null}
  onOpenChange={(v) => !v && setTarget(null)}
  onSelect={(m) => {
    setAssignee(m);
    setTarget(null);
  }}
/>;

// $ui.dialog — 흐름 안에서 한 줄
const picked = await $ui.dialog<IMember>({
  component: MemberPickerDialog,
  footer: false,
});
if (picked) setAssignee(picked);
```

:::info 동작하는 화면을 보고 싶다면
스캐폴드 예제 앱의 **`$ui.dialog` 페이지**에서 이 문서의 모든 예제를 직접 눌러볼 수 있습니다.
소스: `src/domains/example/pages/ui/UiDialog.tsx`
:::

---

## 구성 (Anatomy)

---

`$ui.dialog`는 **3개의 역할**로 나뉩니다. 어느 쪽 코드를 쓰는지 항상 의식하세요.

```text
┌─ ① 호출부 (화면/이벤트 핸들러) ────────────────────────────┐
│  const result = await $ui.dialog<T>({ component, props }) │
│                    ↓ 옵션              ↑ 결과(Promise)    │
└───────────────────────────────────────────────────────────┘
                     ↓
┌─ ② 셸 (scaffold 가 그리는 껍데기) ────────────────────────┐
│  딤 배경 · 카드 · 제목/설명 · X 버튼 · 확인/취소 푸터      │
│  ESC · 배경 클릭 · 라우트 변경 · 포커스 트랩 처리          │
└──────────────────────────────────────────────────────────┘
                     ↓ props + dialog
┌─ ③ 컨텐츠 (내가 만드는 컴포넌트) ─────────────────────────┐
│  평범한 컴포넌트. 감싸는 헬퍼가 없다. 제어가 필요하면      │
│  useDialog() · useDialogSubmit() · useDialogGuard() 호출 │
└──────────────────────────────────────────────────────────┘
```

| 역할     | 담당        | 쓰는 API                                                           |
| -------- | ----------- | ------------------------------------------------------------------ |
| ① 호출부 | 화면 코드   | `$ui.dialog<T>(option)` · 반환 핸들(`update` · `close` …)          |
| ② 셸     | scaffold    | 옵션(`title` · `size` · `footer` · `dismissable` …)                |
| ③ 컨텐츠 | 내 컴포넌트 | `useDialog` · `useDialogSubmit` · `useDialogGuard` (**전부 선택**) |

:::note 컨텐츠는 감싸지 않습니다 — 평범한 컴포넌트입니다
`export default function MyDialog(props)` 그대로 넘기면 됩니다. 다이얼로그 전용으로 만들 필요가 없어서 **페이지 안에 그대로 박아 써도 똑같이 동작**합니다.
스스로 닫거나 확인을 처리해야 할 때만 컴포넌트 안에서 **`useDialog()`** 를 부르세요.
:::

### 소스 위치

동작을 직접 고칠 일은 거의 없지만, 문제가 생겼을 때 **어디를 열어야 하는지**는 알아두면 좋습니다.
전역 UI는 `src/core/ui/` 아래에 **분야(전역 컴포넌트) 단위 폴더**로 나뉘어 있습니다.

| 경로                                      | 무엇                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| `src/core/ui/index.ts`                    | `$ui` 조립 · `registerWindowUI()` — **유일한 공개 표면** |
| `src/core/ui/dialog/`                     | `$ui.dialog` 스택 엔진 (컨트롤러 · 스토어 · 훅 · 호스트) |
| `src/core/ui/alert/`                      | `$ui.alert` · `$ui.confirm` (FIFO 큐)                    |
| `src/core/ui/toast/`                      | 전역 토스트 호스트                                       |
| `src/core/hooks/index.ts`                 | `@axiom/hooks` 재export — **화면 코드의 유일한 창구**    |
| `src/shared/ui/overlay/DialogSkin.tsx`    | **모양(껍데기)** — 퍼블리셔가 고치는 파일                |
| `src/shared/ui/overlay/overlay-layers.ts` | z-index 티어 · `CLOSE_ANIM_MS`                           |

:::note 분야 폴더 안에는 barrel(`index.ts`)이 없습니다
공개 표면은 `core/ui/index.ts` 하나이고 훅의 창구는 `@axiom/hooks` 하나입니다.
그래서 화면 코드가 `@/core/ui/dialog/...` 같은 내부 경로를 직접 import 할 일이 없습니다.
:::

---

## Import

---

`$ui`는 전역이라 import가 필요 없습니다. **가져올 것은 훅뿐**이고, 훅의 창구는 `@axiom/hooks` 하나입니다.

```tsx
// ① $ui 자체 — import 불필요 (window 전역)
await $ui.dialog<string>({
  /* … */
});

// ② 컨텐츠에서 제어가 필요할 때만 — 반드시 @axiom/hooks
import {
  useDialog,
  useDialogSafe,
  useDialogSubmit,
  useDialogGuard,
  useLiveProps,
} from "@axiom/hooks";

// ③ 타입 (필요할 때만)
import type { IDialogResult, IDialogOption } from "@/types/components";
```

:::caution `@/core/ui`에서 가져올 것은 없습니다
`@/core/ui`가 내보내는 것은 **`AppProviders` 전용 호스트 컴포넌트**(`UIHosts` · `UIDialogStackHost` · `UIAlertHost` · `AppToaster`)와 부트스트랩용 `registerWindowUI()` 뿐입니다. 화면 코드에서 import 할 일이 없습니다.
훅은 반드시 **`@axiom/hooks`** 에서 가져오세요.
:::

:::note 호스트는 이미 마운트되어 있습니다
다이얼로그를 그리는 `UIDialogStackHost`는 `AppProviders`의 `UIHosts` 안에 앱 전체에서 **한 번** 마운트됩니다. 화면 코드에서 따로 배치할 것이 없습니다.
:::

---

## 기본 사용법

---

푸터를 누가 그리느냐에 따라 **세 가지 모드**가 있습니다. 대부분은 1번으로 충분합니다.

### 1. 기본 — 셸이 확인/취소를 그린다

컨텐츠는 **본문만** 그리고, "확인을 눌렀을 때 무엇을 결과로 돌려줄지"만 `useDialogSubmit`으로 등록합니다.

```tsx title="호출부"
const nickname = await $ui.dialog<string>({
  // ← 결과 타입은 여기서 지정
  component: NicknameFormDialog,
  props: { initial: "홍길동" },
  title: "닉네임 수정",
  description: "2자 이상 입력해야 저장할 수 있습니다.",
  footer: { confirmText: "저장" }, // 문구만 바꾸고 그리는 건 셸에 맡긴다
});

setLastResult(nickname ?? "(취소)");
```

```tsx title="src/domains/example/components/ui/dialog/NicknameFormDialog.tsx"
import { useEffect, useState } from "react";
import { Input, Label } from "@axiom/components/ui";
import { useDialog, useDialogSubmit } from "@axiom/hooks";

export interface INicknameFormDialogProps {
  /** 초기 닉네임 */
  initial: string;
}

// props 는 평범하다. 감싸는 헬퍼가 없고, 제어 API 는 훅으로 꺼낸다.
export default function NicknameFormDialog({
  initial,
}: INicknameFormDialogProps) {
  // highlight-next-line
  const dialog = useDialog<string>(); // 제어 API 는 훅으로 꺼낸다
  const [draft, setDraft] = useState(initial);
  const tooShort = draft.trim().length < 2;

  // 확인 버튼 활성 조건 — 상태 갱신이므로 effect 에서 처리한다.
  useEffect(() => {
    dialog.setConfirmDisabled(tooShort);
  }, [dialog, tooShort]);

  // highlight-start
  // 확인 클릭 시 실행. 반환값이 곧 $ui.dialog 의 결과다.
  useDialogSubmit<string>(() => {
    if (tooShort) return undefined; // undefined = 검증 실패 → 닫지 않음
    return draft.trim();
  });
  // highlight-end

  return (
    <div className="space-y-2">
      <Label htmlFor="ex-nickname">닉네임</Label>
      <Input
        id="ex-nickname"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
      />
      {tooShort && (
        <p className="text-xs text-destructive">
          2자 이상 입력해야 저장할 수 있습니다.
        </p>
      )}
    </div>
  );
}
```

:::tip `undefined`를 반환하면 닫히지 않습니다
`useDialogSubmit`의 반환값이 `undefined`면 **검증 실패**로 간주해 다이얼로그를 그대로 둡니다.
값을 돌려주면 그 값이 `await $ui.dialog(...)`의 결과가 됩니다.
:::

### 2. `footer: false` — 컨텐츠가 직접 닫는다

셸이 버튼을 그리지 않습니다. 컨텐츠에서 `dialog.close(값)`을 호출하면 그 값이 결과가 됩니다.
목록에서 한 건을 고르는 **피커** 패턴에 적합합니다.

```tsx title="호출부"
const member = await $ui.dialog<IExampleMember>({
  component: MemberPickerDialog,
  title: "회원 선택",
  size: "lg",
  footer: false, // 셸은 푸터를 그리지 않는다
});
```

```tsx title="컨텐츠 — 행의 버튼이 곧 '확인'"
import { useDialog } from "@axiom/hooks";

export default function MemberPickerDialog({
  selectedId,
}: IMemberPickerDialogProps) {
  // highlight-next-line
  const dialog = useDialog<IExampleMember>(); // 이 T 는 close(...) 인자를 체크한다

  return (
    <SmartTable
      data={MEMBERS}
      columns={columns}
      renderRowActions={(member) => (
        // highlight-next-line
        <Button size="sm" onClick={() => dialog.close(member)}>
          선택
        </Button>
      )}
    />
  );
}
```

:::note `useDialog<T>()`의 `T`와 `$ui.dialog<T>()`의 `T`는 별개입니다
전자는 **컴포넌트 안에서 `close(...)`에 넘기는 인자**를 체크하고, 후자는 **호출부의 `await` 결과 타입**을 정합니다.
둘은 자동으로 연결되지 않으므로 **같은 타입을 양쪽에 각각 적어야** 합니다.
:::

### 3. `footer: <ReactNode>` — 푸터를 직접 그린다

버튼 배치가 특수할 때(3버튼 · 좌우 분리 등)만 씁니다. 넘긴 노드가 푸터 영역에 그대로 렌더됩니다.

```tsx
await $ui.dialog({
  component: ReportDialog,
  title: "리포트",
  footer: (
    <>
      <Button variant="ghost" onClick={() => $ui.dialog.closeAll()}>
        모두 닫기
      </Button>
      <Button onClick={handleExport}>내보내기</Button>
    </>
  ),
});
```

| `footer` 값                  | 결과                                       |
| ---------------------------- | ------------------------------------------ |
| **미지정**                   | 셸이 `확인` / `취소` 를 그림               |
| 객체 (`IDialogFooterOption`) | 셸이 그리되 문구·색·`hideCancel`을 지정    |
| `false`                      | 푸터 영역 자체를 없앰 → 컨텐츠가 직접 닫음 |
| `ReactNode`                  | 넘긴 노드를 푸터에 그대로 렌더             |

---

## 반환값 — Promise이면서 핸들

---

`$ui.dialog(...)`의 반환값은 `Promise<T | undefined>`에 제어 메서드를 얹은 **핸들**입니다.
`Object.assign`으로 만들어졌으므로 `await` · `then` · `catch` · `finally`가 모두 정상 동작합니다.

```tsx
// (A) 결과만 필요하면 그냥 await — <T> 로 결과 타입을 준다
const member = await $ui.dialog<IExampleMember>({
  component: MemberPickerDialog,
  footer: false,
});

// (B) 열어두고 제어해야 하면 핸들을 변수로 받는다 — <T> 를 생략하면 props 가 추론된다
const d = $ui.dialog({
  component: UploadProgressDialog,
  props: { percent: 0 },
});
d.update({ percent: 50 }); // props 갱신
d.patch({ title: "거의 다 됐어요" }); // 껍데기 옵션 갱신
if (d.isOpen()) d.close(); // 코드로 닫기
await d; // 결과 기다리기 (닫힌 뒤 resolve)
```

### 핸들 API

| 메서드          | 타입                                       | 설명                                                                                                                      |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `string`                                   | 이 다이얼로그의 고유 id (읽기 전용)                                                                                       |
| `update(props)` | `(props: Partial<P>) => void`              | 열려 있는 컨텐츠의 props를 **얕은 병합**으로 갱신                                                                         |
| `patch(option)` | `(option: Partial<IDialogOption>) => void` | 껍데기 옵션(`title` · `size` · `dismissable` …) 갱신                                                                      |
| `close(data?)`  | `(data?: T) => void`                       | 코드로 닫기(reason `programmatic`). `data`를 주면 그 값으로 resolve. **`beforeClose` 가드와 `dismissable: false`를 우회** |
| `cancel()`      | `() => void`                               | 결과 없이 닫기. `close()`와 동일하게 reason `programmatic`이며 가드를 우회                                                |
| `isOpen()`      | `() => boolean`                            | 아직 열려 있는지                                                                                                          |

:::warning `handle.close()`는 왜 가드를 우회하나
호출한 쪽이 **이미 닫기로 결정한 상황**이기 때문입니다. 여기서 가드가 막아버리면 아무도 `resolve` 하지 못해 `await`가 영원히 멈춥니다(Promise 누수).
사용자가 닫으려는 경로(ESC · 배경 · X)만 가드·`dismissable`의 대상입니다.
:::

:::caution 이름은 같지만 `handle.close()`와 `dialog.close()`는 다릅니다
**호출부**의 핸들과 **컨텐츠**의 `useDialog()`는 둘 다 `close` · `cancel`을 갖지만 남기는 `reason`이 다릅니다.

| 어디서                          | 호출              | `reason`       | `result.confirmed` | 가드    |
| ------------------------------- | ----------------- | -------------- | :----------------: | ------- |
| 호출부 (`$ui.dialog(...)` 반환) | `handle.close(v)` | `programmatic` |      `false`       | ⏭ 우회 |
| 호출부                          | `handle.cancel()` | `programmatic` |      `false`       | ⏭ 우회 |
| 컨텐츠 (`useDialog()`)          | `dialog.close(v)` | `submit`       |     **`true`**     | ✅ 실행 |
| 컨텐츠                          | `dialog.close()`  | `close`        |      `false`       | ✅ 실행 |
| 컨텐츠                          | `dialog.cancel()` | `cancel`       |      `false`       | ✅ 실행 |

`await`로 받는 **결과값 자체는 양쪽 모두 넘긴 인자**입니다. 달라지는 것은 `onClose(result)` · `beforeClose(result)`가 보는 `reason` · `confirmed`와, 가드를 타는지 여부입니다.
:::

### 결과값 규칙

| 닫은 경로                                                | `await` 결과                          |
| -------------------------------------------------------- | ------------------------------------- |
| `useDialogSubmit`이 값을 반환                            | **그 값**                             |
| 컨텐츠에서 `dialog.close(data)`                          | **`data`**                            |
| 호출부에서 `handle.close(data)`                          | **`data`** (단 `confirmed`는 `false`) |
| 셸 `확인` + 제출 핸들러 없음                             | `footer.confirmValue ?? true`         |
| 취소 · ESC · X · 배경 클릭 · `autoDismiss`               | `undefined`                           |
| `handle.close()` (인자 없음) · `cancel()` · `closeAll()` | `undefined`                           |
| 라우트 변경으로 자동 닫힘                                | `undefined`                           |
| 제출 핸들러 · 가드가 **예외를 던짐**                     | `undefined` (fail-open으로 닫힘)      |
| 컨텐츠 렌더/청크 로드 **실패**                           | `undefined` (reject 아님)             |

:::danger 절대 reject 하지 않습니다
아무도 `await` 하지 않은 핸들에서 unhandled rejection이 터지는 것을 막기 위한 설계입니다.
그래서 **결과가 `undefined`인지 확인하는 분기**가 항상 필요합니다 — `try/catch`로는 취소를 잡을 수 없습니다.
:::

:::caution 셸 `확인`을 쓰면서 결과 타입이 있다면
제출 핸들러(`useDialogSubmit`)를 등록하지 않으면 확인 클릭이 `confirmValue ?? true`로 resolve 됩니다.
타입상으로는 `T`인데 런타임에는 `true`가 오므로, **결과 타입이 `boolean`이 아니면 `useDialogSubmit`을 반드시 등록**하거나 `footer.confirmValue`를 지정하세요.
:::

---

## 컨텐츠 작성법

---

### 컨텐츠는 평범한 컴포넌트입니다

감싸는 헬퍼가 없습니다. `export default function`으로 그냥 쓰고, **제어가 필요할 때만** 훅을 부릅니다.

```tsx
import { useDialog } from "@axiom/hooks";

export interface IMemberPickerProps {
  deptId: number;
}

// 평범한 컴포넌트다. 감싸는 헬퍼가 없고, 제어 API 는 훅으로 꺼낸다.
export default function MemberPicker({ deptId }: IMemberPickerProps) {
  const dialog = useDialog<IMember>();
  return <Button onClick={() => dialog.close(member)}>선택</Button>;
}

// 호출부에서 결과 타입을 지정한다
const member = await $ui.dialog<IMember>({
  component: MemberPicker,
  props: { deptId: 3 },
});
//    ^? IMember | undefined
```

:::tip 스스로 닫지 않는 컨텐츠라면 훅조차 필요 없습니다
진행률 표시처럼 **보여주기만** 하는 컴포넌트는 `useDialog()`도 부르지 않습니다. props를 받아 그리는 보통 컴포넌트 그대로입니다.
:::

:::note 컨텐츠에는 `dialog` prop도 함께 내려옵니다
셸은 컨텐츠를 `<Content {...props} dialog={api} />` 로 렌더합니다. 그래서 `useDialog()`를 부르지 않아도 **`props.dialog`로 똑같은 제어 API를 받을 수 있습니다.**
그래도 권장 경로는 `useDialog()`입니다. 이유는 두 가지입니다.

- `props.dialog`는 **최상위 컨텐츠 컴포넌트에만** 내려옵니다. 깊은 자식에서 쓰려면 다시 prop으로 내려야 하지만, `useDialog()`는 컨텍스트라 **어느 깊이에서든** 바로 꺼냅니다.
- 같은 컴포넌트를 **페이지 안에 그냥 박아 쓰면** `props.dialog`가 `undefined`가 됩니다. 안/밖 겸용 컴포넌트라면 `useDialogSafe()`를 쓰세요.

⚠️ `dialog`는 `{...props}` **뒤에** 붙으므로, 컨텐츠 props에 `dialog`라는 이름을 쓰면 **셸이 덮어씁니다.** 그 이름은 피하세요.
:::

### 결과 타입 지정 — `$ui.dialog<T>()` / `$ui.dialog<T, P>()`

결과 타입은 **컴포넌트가 아니라 호출부**에서 정합니다. 타입 인자를 어떻게 주느냐에 따라 체크되는 대상이 달라집니다.

```tsx
// (1) 결과를 쓴다 → <T> 를 준다. props 는 Record<string, unknown> 으로 느슨해진다
const member = await $ui.dialog<IMember>({
  component: MemberPicker,
  props: { deptId: 3 },
});
//    ^? IMember | undefined

// (2) 결과를 안 쓴다 → 생략한다. 결과는 unknown 이지만 props 가 추론되어 update() 가 체크된다
const d = $ui.dialog({
  component: UploadProgress,
  props: { percent: 0, filename: "a.xlsx" },
});
d.update({ percent: 50 }); // ✅ percent 가 number 인지 체크된다
d.update({ percnet: 50 }); // ❌ 오타를 잡아준다

// (3) 둘 다 좁히고 싶다 → 두 인자를 모두 적는다
const m = await $ui.dialog<IMember, IMemberPickerProps>({
  component: MemberPicker,
  props: { deptId: 3 },
});
```

| 호출 형태                 | `await` 결과           | `props` · `update()` 체크           |
| ------------------------- | ---------------------- | ----------------------------------- |
| `$ui.dialog({ … })`       | `unknown \| undefined` | ✅ 추론됨                           |
| `$ui.dialog<T>({ … })`    | `T \| undefined`       | ⚠️ `Record<string, unknown>` (느슨) |
| `$ui.dialog<T, P>({ … })` | `T \| undefined`       | ✅ `P`로 체크                       |

:::warning 타입 인자를 하나만 주면 나머지는 추론되지 않습니다
TypeScript는 **타입 인자를 일부만 받아 나머지를 추론해 주지 않습니다.** `$ui.dialog<IMember>(...)`라고 쓰는 순간 `P`는 추론을 포기하고 기본값 `Record<string, unknown>`이 됩니다.
결과 타입과 props 타입을 **동시에** 좁히고 싶으면 `$ui.dialog<IMember, IMemberPickerProps>(...)`처럼 두 개를 모두 적으세요.
:::

:::note `props`는 항상 선택(optional)입니다
컴포넌트의 필수 prop 유무를 타입이 따라가지 않습니다. **필수 props를 빠뜨려도 타입 에러가 나지 않으므로** 호출부에서 직접 확인하세요.
:::

### `useDialog<T>()` — 컨텐츠 안에서 제어 API 얻기 {#use-dialog}

컨텍스트에서 이 다이얼로그의 제어 API를 꺼냅니다. 깊은 자식에서도 prop 배선 없이 바로 쓸 수 있습니다.

```tsx
import { useDialog, useDialogSafe } from "@axiom/hooks";

const dialog = useDialog<IMember>(); // 다이얼로그 밖에서 호출하면 즉시 throw
const dialog = useDialogSafe<IMember>(); // 밖이면 null — 안/밖 겸용 컴포넌트용
```

여기서 준 `T`는 **이 컴포넌트 안에서 `dialog.close(...)`의 인자를 체크하는 용도**입니다.
호출부의 `await` 결과 타입은 `$ui.dialog<T>({...})`로 **따로** 지정합니다.

| API                     | 타입                                          | 설명                                          |
| ----------------------- | --------------------------------------------- | --------------------------------------------- |
| `id`                    | `string`                                      | 이 다이얼로그의 id                            |
| `depth`                 | `number`                                      | 스택 깊이 (0 = 최하단)                        |
| `isTop`                 | `boolean`                                     | 현재 최상단인지                               |
| `close(data?)`          | `(data?: T) => void`                          | `data` 있으면 reason `submit`, 없으면 `close` |
| `cancel()`              | `() => void`                                  | 취소로 닫기 (reason `cancel`)                 |
| `setTitle(node)`        | `(title: ReactNode) => void`                  | 제목 변경                                     |
| `setDescription(node)`  | `(description: ReactNode) => void`            | 설명 변경                                     |
| `setSize(size)`         | `(size: TDialogSize) => void`                 | 폭 프리셋 변경                                |
| `setLoading(b)`         | `(loading: boolean) => void`                  | 셸 푸터 버튼 전체 로딩/비활성                 |
| `setConfirmDisabled(b)` | `(disabled: boolean) => void`                 | 셸 `확인` 버튼만 비활성                       |
| `setDismissable(b)`     | `(dismissable: boolean) => void`              | ESC · 배경 · X 잠금/해제                      |
| `setBeforeClose(fn)`    | `(guard \| null) => void`                     | 닫기 가드 등록 (**`useDialogGuard` 권장**)    |
| `setSubmit(fn)`         | `(submit \| null) => void`                    | 제출 핸들러 등록 (**`useDialogSubmit` 권장**) |
| `patch(option)`         | `(option: Partial<IDialogOption<T>>) => void` | 껍데기 옵션 부분 갱신                         |

:::caution `setLoading` · `setConfirmDisabled`는 렌더 중에 부르지 마세요
두 함수는 다른 컴포넌트(셸)의 상태를 바꿉니다. 내부적으로 `queueMicrotask`로 한 틱 미뤄 React 경고를 피하지만, **`useEffect` 안에서 호출**하는 것이 올바른 사용법입니다. (앞의 `NicknameFormDialog` 예제 참고)
:::

:::note `dialog` 객체의 identity는 고정입니다
`id`당 한 번만 만들어지므로 `useEffect`의 deps에 넣어도 안전합니다. `depth` · `isTop`은 getter라 항상 최신 값을 읽습니다.
:::

### `useDialogSubmit<T>(fn)` — 셸 `확인` 처리 {#use-dialog-submit}

```tsx
useDialogSubmit<IInquiry>(async () => {
  if (!form.subject.trim()) {
    await $ui.alert({ type: "warning", message: "제목을 입력하세요." });
    return undefined; // 닫지 않음
  }
  dialog.setLoading(true); // 셸 푸터에 스피너
  const saved = await api.createInquiry(form);
  dialog.setLoading(false);
  return saved; // 이 값이 await 결과
});
```

- **비동기 함수**를 등록할 수 있습니다. 셸은 `await` 하는 동안 `loading` 상태로 전환합니다.
- 매 렌더마다 최신 클로저로 교체되므로 **stale closure가 생기지 않습니다.** deps 배열이 없습니다.
- 핸들러가 예외를 던지면 콘솔에 오류를 남기고 **다이얼로그를 닫습니다**(fail-open). 닫히지 않는 모달이 더 나쁘기 때문입니다. 이때 `await` 결과는 **`undefined`** 입니다 — API 오류는 핸들러 안에서 `try/catch`로 잡고 `undefined`를 반환해 **닫지 않는** 편이 낫습니다.

### `useDialogGuard<T>(fn)` — 닫기 가드 {#use-dialog-guard}

`false`를 반환하면 닫히지 않습니다. dirty 상태는 컨텐츠가 알고 있으므로 **가드도 컨텐츠가 등록**합니다.

```tsx
useDialogGuard<IInquiry>(async (result) => {
  // 제출로 닫히는 경우와, 애초에 건드린 게 없으면 통과
  if (!dirty || result.reason === "submit" || result.reason === "confirm")
    return true;

  return $ui.confirm({
    type: "warning",
    title: "작성 취소",
    message: "작성 중인 내용이 사라집니다. 닫을까요?",
    confirmText: "닫기",
    cancelText: "계속 작성",
  });
});
```

- 인자는 `IDialogResult<T>` (`id` · `confirmed` · `reason` · `data`)입니다. **`reason`으로 분기**하세요.
- 가드 안에서 `$ui.confirm`을 부르는 것이 정상 시나리오입니다 — alert 티어가 dialog 티어보다 위라 항상 최상단에 뜹니다.
- 호출부 옵션의 `beforeClose`로도 줄 수 있지만, **컨텐츠가 등록한 가드가 우선**합니다.

---

## 열려 있는 다이얼로그 갱신하기

---

`$ui.dialog`는 이벤트 핸들러에서 부르는 **명령형 호출**이라, `props`는 **열린 시점 값으로 굳습니다.**
열린 뒤에도 값이 바뀌어야 한다면 아래 네 가지 중 하나를 고릅니다.

| 상황                                                                                                           | 방법                                              |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Dialog를 열 때의 값 한 번이면 충분하다 **(대부분)**                                                            | `props: { … }` 그대로                             |
| async 흐름 안에서 수동으로 값을 변경하고 싶을 때 (진행률 등)                                                   | `handle.update(...)`                              |
| 열려 있는 동안 **바탕 페이지 state**가 계속 바뀌고 바탕화면과 Dialog 내부 값이 동기화(반응성 유지) 되어야한다. | `props: useLiveProps(...)`                        |
| **서버 데이터**가 원본이다                                                                                     | id만 props로 넘기고 컨텐츠가 `useApi`로 직접 구독 |

### `handle.update(props)` — 코드에서 밀어넣기 {#handle-update}

```tsx
const d = $ui.dialog({
  component: UploadProgressDialog,
  props: { percent: 0, filename: "2026-1분기_정산.xlsx" },
  title: "업로드 중",
  footer: false,
  // highlight-start
  dismissable: false, // ESC · 배경 · X 잠금 (업로드 중 이탈 방지)
  showCloseButton: false,
  closeOnRouteChange: false,
  // highlight-end
});

for (let p = 20; p <= 100; p += 20) {
  await sleep(400);
  d.update({ percent: p }); // 얕은 병합 — filename 은 유지된다
}

d.close();
await d;
await $ui.alert({
  type: "success",
  message: "업로드가 완료되었습니다.",
  autoDismiss: 1400,
});
```

### `useLiveProps(values)` — 살아있는 props {#use-live-props}

바탕 페이지의 `useState`가 다이얼로그에 **실시간으로 비쳐야** 할 때 씁니다.
`useLiveProps`선언은 바탕 페이지에서 하고, `$ui.dialog`의 **props**로 넘겨준다.

```tsx title="① 바탕 페이지 — useLiveProps 한 줄이 전부"
import { useLiveProps } from "@axiom/hooks";

export default function LiveStatusCard() {
  const [elapsed, setElapsed] = useState(0);
  const [queue, setQueue] = useState(12);
  const [now, setNow] = useState(() => new Date().toLocaleTimeString("ko-KR"));

  useEffect(() => {
    const timer = setInterval(() => {
      /* 1초마다 갱신 */
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // highlight-next-line
  const live = useLiveProps({ elapsed, now, queue }); // ★ 값만 상자로 감싼다

  return (
    <Button
      onClick={() =>
        void $ui.dialog({
          component: LiveStatusDialog,
          // highlight-next-line
          props: live, // ★ props 자리에 그대로
          title: "실시간 처리 현황",
          size: "sm",
          footer: false,
        })
      }
    >
      다이얼로그로 보기
    </Button>
  );
}
```

```tsx title="② 컨텐츠 — 완전히 평범한 컴포넌트"
// 감싸는 헬퍼도 useDialog() 도 없다. 상자의 존재조차 모른다.
export default function LiveStatusDialog({
  elapsed,
  now,
  queue,
}: ILiveStatusDialogProps) {
  return (
    <p>
      {now} / {elapsed}초 / {queue}건
    </p>
  ); // props 를 그대로 렌더
}
```

:::info 왜 훅이 한 줄 필요한가
React는 컴포넌트 **바깥**에 "이 `useState`가 바뀌었다"를 알려주는 수단이 없습니다. 클릭 시점에 `props: { elapsed }`로 건네지는 것은 그저 숫자라서, 나중에 값이 바뀌어도 되짚어 갈 실마리가 없습니다.
그래서 값을 계속 흘려보내려면 **페이지의 렌더에 올라탄 코드**가 한 줄 있어야 하고, 그게 `useLiveProps`입니다. 스토어·구독·정리는 전부 내부에 숨어 있습니다.
:::

:::danger 컨텐츠가 props를 `useState`로 복사하면 안 됩니다

```tsx
// ❌ 갱신이 화면에 보이지 않는다 — React 초기값은 마운트 때 한 번만 쓰인다
const [n, setN] = useState(props.elapsed);

// ✅ 값을 그대로 렌더하거나 파생시켜 쓴다
const mm = String(Math.floor(props.elapsed / 60)).padStart(2, "0");
```

:::

:::caution `useLiveProps`로 넘긴 props는 `update()`로 바꿀 수 없습니다
원본은 페이지의 렌더입니다. `handle.update()`로 덮어써도 다음 렌더에 곧바로 되돌아가므로, 시도하면 **콘솔에 오류를 남기고 무시**합니다. 원본 state를 바꾸세요.
:::

:::note 함수형 prop은 항상 최신 클로저로 호출됩니다
`stableCallbacks`(기본 `true`)가 함수 props를 **identity가 고정된 프록시**로 감쌉니다. `update()`로 콜백을 갈아끼워도 컨텐츠 쪽 `useCallback`/`useEffect` deps가 흔들리지 않으면서, 호출 시에는 최신 함수가 실행됩니다.
함수 identity 비교에 의존하는 특수한 경우에만 `stableCallbacks: false`로 끄세요.
:::

:::warning 모달이 열려 있으면 바탕 페이지는 클릭할 수 없습니다
Radix가 바깥 전체를 `aria-hidden` + 오버레이로 막기 때문입니다(모달의 정상 동작).
그래서 바탕 state 변경은 **타이머 · 구독 · API 응답** 같은 비동기 경로로만 들어옵니다.
:::

---

## 닫기 경로와 가드

---

모든 닫기는 **단 하나의 진입점**을 통과합니다. Radix에게 닫기 결정권을 주지 않기 때문에, ESC·배경 클릭이 가드를 조용히 우회하는 일이 없습니다.

```text
① ESC · 배경 클릭은 옵션 검사가 먼저다
     closeOnEscape: false        → ESC 무시 (requestClose 를 부르지도 않음)
     closeOnOverlayClick: false  → 배경 클릭 무시
          ↓ 통과
② requestClose(reason) — 모든 닫기의 단일 관문
     ├─ 이미 정산됨 / 처리 중(pending) ─────────────────────→ 무시
     │
     ├─ dismissable: false 이고
     │    reason ∈ { escape · overlay · close · autoDismiss } → 차단 (닫히지 않음)
     │
     ├─ reason === 'confirm' 이면
     │    ├ useDialogSubmit 등록됨 → loading=true → await submit()
     │    │    └ undefined 반환 ──────────────────────────→ 닫지 않음 (검증 실패)
     │    └ 없음 → 결과 = footer.confirmValue ?? true
     │
     └─ reason ∉ { programmatic · route · error } 이면 가드 실행
          가드 = useDialogGuard 등록분 ?? option.beforeClose
          └ false 반환 ───────────────────────────────────→ 닫지 않음
          ↓ 통과
③ 정산(settle)
     onClose(result) → Promise resolve → 150ms(CLOSE_ANIM_MS) 뒤 스택에서 제거

※ 라우트 변경 · 컨텐츠 렌더 실패는 ②를 거치지 않고 곧바로 ③ 으로 갑니다.
  (이미 확정된 사실이므로 dismissable · pending · 가드가 전부 무관합니다)
```

### `reason` 전체 목록

| `reason`       | 닫힌 경로                                                                    | `dismissable:false`로 차단 | `beforeClose` 가드 |
| -------------- | ---------------------------------------------------------------------------- | :------------------------: | :----------------: |
| `confirm`      | 셸 **확인** 버튼                                                             |                            |      ✅ 실행       |
| `cancel`       | 셸 **취소** 버튼 · 컨텐츠의 `dialog.cancel()`                                |                            |      ✅ 실행       |
| `close`        | 우상단 **X** · 컨텐츠의 `dialog.close()` (인자 없음)                         |          🔒 차단           |      ✅ 실행       |
| `escape`       | **ESC** 키 (`closeOnEscape: false`면 발생하지 않음)                          |          🔒 차단           |      ✅ 실행       |
| `overlay`      | **배경(딤)** 클릭 (`closeOnOverlayClick: false`면 발생 안 함)                |          🔒 차단           |      ✅ 실행       |
| `autoDismiss`  | `autoDismiss` 시간 경과                                                      |          🔒 차단           |      ✅ 실행       |
| `submit`       | 컨텐츠의 `dialog.close(data)`                                                |                            |      ✅ 실행       |
| `programmatic` | `handle.close()` · `handle.cancel()` · `$ui.dialog.close(id)` · `closeAll()` |                            |      ⏭ 우회       |
| `route`        | 라우트(pathname) 변경                                                        |                            |      ⏭ 우회       |
| `error`        | 컨텐츠 렌더/청크 로드 실패                                                   |                            |      ⏭ 우회       |

:::caution `dismissable: false`가 잠그는 것은 "사용자가 직접 닫는 경로"뿐입니다
셸의 **취소 버튼**(`cancel`)과 컨텐츠의 `dialog.close(data)`(`submit`)는 **잠기지 않습니다.**
업로드 중처럼 완전히 잠가야 한다면 `dismissable: false`에 더해 **`footer: false`**(또는 `footer: { hideCancel: true }`)와 `showCloseButton: false`, `closeOnRouteChange: false`를 함께 주세요.
:::

:::note 제출/가드에서 예외가 나면 닫습니다 (fail-open)
`useDialogSubmit`이나 가드가 던지면 콘솔에 오류를 남긴 뒤 **다이얼로그를 닫습니다.** "닫히지 않는 모달"이 최악의 상태이기 때문입니다.
:::

### `onClose(result)` — 닫힌 경로까지 알아야 할 때

```tsx
await $ui.dialog<IInquiry>({
  component: InquiryFormDialog,
  title: "문의 작성",
  onClose: (result) => {
    // result: { id, confirmed, reason, data }
    if (result.reason === "escape") logAnalytics("inquiry_abandoned");
    if (result.confirmed) logAnalytics("inquiry_submitted");
  },
});
```

`confirmed`는 `reason`이 `confirm` 또는 `submit`일 때 `true`입니다.
`onClose`가 예외를 던져도 **정산 자체는 계속 진행**됩니다.

---

## 중첩 (스택)과 z-index

---

`$ui.dialog`는 **LIFO 스택**입니다. 열려 있는 항목을 모두 동시에 렌더하므로 여러 겹으로 쌓입니다.
(FIFO 큐로 하나씩 보여주는 [`$ui.alert`](./alert-ui) / [`$ui.confirm`](./confirm-ui)과 다릅니다)

```tsx
// 다이얼로그 컨텐츠 안에서 다시 $ui.dialog 를 부르면 그 위에 쌓인다
const detail = await $ui.dialog<IDetail>({
  component: DetailDialog,
  props: { id },
});

// 가드 안에서 confirm 을 부르는 것도 정상 — 항상 최상단에 뜬다
useDialogGuard(async () =>
  $ui.confirm("작성 중인 내용이 사라집니다. 닫을까요?"),
);
```

| 레이어                      | z-index                | 비고                              |
| --------------------------- | ---------------------- | --------------------------------- |
| `$ui.dialog` 스택           | `100000` + 깊이 × `10` | 깊이별로 자동 계산 (인라인 style) |
| `$ui.alert` / `$ui.confirm` | `100500`               | **어떤 dialog보다도 위**          |
| 토스트                      | `100600`               | alert보다도 위                    |

- **ESC는 최상단 하나만** 닫습니다.
- **딤(배경)은 최하단 항목만** 그립니다. 중첩할 때마다 딤이 누적돼 화면이 새까매지는 것을 막기 위함입니다.
- z-index 값은 `src/shared/ui/overlay/overlay-layers.ts`의 토큰입니다. 앱 헤더(`z-99999`)를 바꾸면 여기도 함께 올려야 합니다.

:::danger 스택 상한은 20입니다
21번째부터는 열리지 않고 즉시 `undefined`로 정산되며 콘솔에 오류가 남습니다.
디자인 값이 아니라 **재귀 폭주 방어 장치**입니다 — 컨텐츠 **렌더 도중** `$ui.dialog`를 호출하면 무한히 쌓입니다. 다이얼로그는 반드시 **이벤트 핸들러나 effect**에서 여세요.
:::

:::note 같은 `id`로 두 번 열면
이미 열려 있는 `id`면 새로 열지 않고 즉시 `undefined`로 정산하며 콘솔에 오류를 남깁니다.
중복 클릭을 막고 싶을 때 **고정 `id`를 주는 것**이 유용합니다.
:::

---

## API 참조

---

`$ui.dialog`가 제공하는 **옵션 · 반환 핸들 · 컨텐츠 훅 · 정적 메서드 전체**를 한 곳에 모았습니다.
개념 설명이 필요하면 각 항목의 링크를 따라가세요.

### 전체 지도

```text
$ui.dialog<T, P>({ component, props, ...option })  ─── ① 호출 옵션 (IDialogOption)
        │                                                component · props · id · title · description
        │                                                size · scrollable · footer · showCloseButton
        │                                                className · overlayClassName · bodyClassName
        │                                                closeOnEscape · closeOnOverlayClick · dismissable
        │                                                autoDismiss · closeOnRouteChange · stableCallbacks
        │                                                beforeClose · onClose
        │
        ├─ 반환 ─ TDialogHandle<T, P> ──────────────── ② Promise + 제어 핸들
        │           await · then · catch · finally
        │           id · update(props) · patch(option) · close(data?) · cancel() · isOpen()
        │
        ├─ 정적 ─ $ui.dialog.close(id, reason?) · closeAll(reason?) · count() ─── ③
        │
        └─ 컨텐츠 안 (import from '@axiom/hooks') ──── ④ 전부 선택
              useDialog<T>()          제어 API (id · depth · isTop · close · cancel · set*)
              useDialogSafe<T>()      위와 같되 다이얼로그 밖이면 null
              useDialogSubmit<T>(fn)  셸 '확인' 처리
              useDialogGuard<T>(fn)   닫기 가드
              useLiveProps(values)    살아있는 props (호출부 페이지에서 사용)
```

### 목적별 찾기

| 하고 싶은 일                        | 쓰는 API                                                      | 쓰는 곳         |
| ----------------------------------- | ------------------------------------------------------------- | --------------- |
| 모달을 열고 결과를 받는다           | `await $ui.dialog<T>({ component })`                          | 호출부          |
| 확인 · 취소 문구/색을 바꾼다        | `footer: { confirmText, cancelText, confirmVariant }`         | 호출부          |
| 푸터를 없애거나 직접 그린다         | `footer: false` · `footer: 내 노드`                           | 호출부          |
| 셸 `확인`이 돌려줄 값을 정한다      | `useDialogSubmit(fn)` — 없으면 `footer.confirmValue ?? true`  | 컨텐츠          |
| 컨텐츠가 스스로 닫는다              | `useDialog().close(data)` · `.cancel()`                       | 컨텐츠          |
| 작성 중 이탈을 막는다               | `useDialogGuard(fn)` · 옵션 `beforeClose`                     | 컨텐츠 · 호출부 |
| ESC · 배경 · X를 잠근다             | `dismissable: false`                                          | 호출부          |
| 열린 뒤 props를 바꾼다              | `handle.update(props)`                                        | 호출부          |
| 바탕 페이지 state를 실시간 반영한다 | `useLiveProps(values)` → `props`                              | 호출부(페이지)  |
| 열린 뒤 제목 · 크기를 바꾼다        | `handle.patch({ … })` · `dialog.setTitle` · `dialog.setSize`  | 양쪽            |
| 확인 버튼을 로딩/비활성으로 만든다  | `dialog.setLoading(true)` · `dialog.setConfirmDisabled(true)` | 컨텐츠          |
| 어떤 경로로 닫혔는지 안다           | 옵션 `onClose(result)` → `result.reason`                      | 호출부          |
| 특정 · 모든 다이얼로그를 닫는다     | `$ui.dialog.close(id)` · `$ui.dialog.closeAll()`              | 어디서나        |
| 열려 있는 개수를 센다               | `$ui.dialog.count()`                                          | 어디서나        |

### dialog 타입

```ts
// 결과 타입 T, props 타입 P — 둘 다 좁히려면 타입 인자를 모두 적습니다
$ui.dialog<T = unknown, P extends object = Record<string, unknown>>(
  option: IDialogOption<T> & {
    component: ComponentType<any>; // 평범한 컴포넌트 (코드분할은 loadable(...) 결과)
    props?: P | ILivePropsBox<P>; // 스냅샷 props 또는 useLiveProps 상자
  },
): TDialogHandle<T, P>; // = Promise<T | undefined> & IDialogControls<T, P>
```

---

### 호출 옵션 (`IDialogOption`)

#### 컨텐츠

| 옵션        | 타입                    | 필수 | 설명                                                                            |
| ----------- | ----------------------- | :--: | ------------------------------------------------------------------------------- |
| `component` | `ComponentType`         |  ✅  | 본문으로 렌더할 **평범한** 컴포넌트. 코드분할은 `loadable(...)` **결과**를 넘김 |
| `props`     | `P \| ILivePropsBox<P>` |      | 컨텐츠에 넘길 props. **항상 선택**이며 호출 시점 스냅샷                         |

:::caution `props`는 타입상 항상 선택입니다
컴포넌트의 **필수 prop을 빠뜨려도 타입 에러가 나지 않습니다.** 결과 타입과 props를 동시에 체크받으려면 `$ui.dialog<T, P>(...)`처럼 타입 인자 두 개를 모두 적으세요.
:::

#### 표시

| 옵션               | 타입                                              | 기본값 | 설명                                                                                       |
| ------------------ | ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `title`            | `ReactNode`                                       | —      | 제목. 미지정 시 접근성용 sr-only 제목(`대화상자`)이 자동 삽입                              |
| `description`      | `ReactNode`                                       | —      | 제목 아래 보조 설명                                                                        |
| `size`             | `'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| 'full'` | `'md'` | 폭 프리셋 → [크기와 스타일링](#크기와-스타일링)                                            |
| `scrollable`       | `boolean`                                         | `true` | 본문에 최대 높이(`70vh`) + 스크롤 적용                                                     |
| `footer`           | `false \| ReactNode \| IDialogFooterOption`       | —      | [기본 사용법](#기본-사용법) 참고                                                           |
| `showCloseButton`  | `boolean`                                         | `true` | 우상단 X 버튼 표시                                                                         |
| `className`        | `string`                                          | —      | 본체(`DialogContent`)에 추가할 클래스                                                      |
| `overlayClassName` | `string`                                          | —      | 딤 배경에 추가할 클래스 — ⚠️ **현재 셸이 적용하지 않습니다** → [상세](#overlay-class-name) |
| `bodyClassName`    | `string`                                          | —      | 본문 래퍼에 추가할 클래스                                                                  |

#### 닫힘 동작

| 옵션                  | 타입                                      | 기본값 | 설명                                                                   |
| --------------------- | ----------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `closeOnEscape`       | `boolean`                                 | `true` | ESC로 닫기                                                             |
| `closeOnOverlayClick` | `boolean`                                 | `true` | 배경 클릭으로 닫기                                                     |
| `dismissable`         | `boolean`                                 | `true` | `false`면 ESC · 배경 · X · autoDismiss를 **모두 잠금** (마스터 스위치) |
| `autoDismiss`         | `number`                                  | —      | N밀리초 후 자동 닫기                                                   |
| `closeOnRouteChange`  | `boolean`                                 | `true` | 라우트(pathname) 변경 시 자동 닫기. 가드를 우회                        |
| `beforeClose`         | `(result) => boolean \| Promise<boolean>` | —      | 닫기 가드. `false` 반환 시 닫히지 않음. **`useDialogGuard`가 우선**    |
| `onClose`             | `(result: IDialogResult<T>) => void`      | —      | 닫힘 상세 콜백 → [닫기 경로와 가드](#닫기-경로와-가드)                 |

#### 기타

| 옵션              | 타입      | 기본값    | 설명                                                          |
| ----------------- | --------- | --------- | ------------------------------------------------------------- |
| `id`              | `string`  | 자동 생성 | 고유 식별자. 중복 클릭 방지용으로 고정값을 줄 수 있음         |
| `stableCallbacks` | `boolean` | `true`    | 함수형 props를 안정 identity 프록시로 감싸 stale closure 방지 |

#### `footer` 객체 (`IDialogFooterOption`)

| 옵션             | 타입                                                                          | 기본값      | 설명                                            |
| ---------------- | ----------------------------------------------------------------------------- | ----------- | ----------------------------------------------- |
| `confirmText`    | `string`                                                                      | `'확인'`    | 확인 버튼 문구                                  |
| `cancelText`     | `string`                                                                      | `'취소'`    | 취소 버튼 문구                                  |
| `hideCancel`     | `boolean`                                                                     | `false`     | 취소 버튼 숨김                                  |
| `confirmVariant` | `'default' \| 'destructive' \| 'outline' \| 'secondary' \| 'ghost' \| 'link'` | `'default'` | 확인 버튼 색                                    |
| `confirmValue`   | `T`                                                                           | `true`      | 제출 핸들러가 없을 때 확인 클릭이 resolve 할 값 |

:::note `closeOnRouteChange`는 pathname만 봅니다
순수 `?query` 변경까지 감지하면, 다이얼로그가 스스로 검색 파라미터를 바꾸다 **자기 자신을 닫아버립니다.**
:::

---

### 반환 핸들 (`TDialogHandle`)

`Promise<T | undefined>` 위에 제어 API가 얹혀 있습니다. → [반환값 상세](#핸들-api) · [결과값 규칙](#결과값-규칙)

| 멤버            | 타입                                       | 설명                                                                       |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `id`            | `string`                                   | 이 다이얼로그의 고유 id (읽기 전용)                                        |
| `update(props)` | `(props: Partial<P>) => void`              | 컨텐츠 props를 **얕은 병합**으로 갱신 → [상세](#handle-update)             |
| `patch(option)` | `(option: Partial<IDialogOption>) => void` | 껍데기 옵션(`title` · `size` · `dismissable` …) 갱신                       |
| `close(data?)`  | `(data?: T) => void`                       | 코드로 닫기(reason `programmatic`). **가드와 `dismissable: false`를 우회** |
| `cancel()`      | `() => void`                               | 결과 없이 닫기. `close()`와 동일하게 reason `programmatic`                 |
| `isOpen()`      | `() => boolean`                            | 아직 열려 있는지                                                           |

### 컨텐츠 훅 (`@axiom/hooks`)

**전부 선택**입니다. 제어가 필요한 컨텐츠만 부르면 됩니다.
(셸이 최상위 컨텐츠에 `dialog` prop도 함께 내려주지만, 깊은 자식에서도 통하는 **`useDialog()`가 권장 경로**입니다 → [상세](#컨텐츠는-평범한-컴포넌트입니다))

| 훅                       | 시그니처                                                             | 설명                                                                       |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `useDialog<T>()`         | `() => IDialogApiHandle<T>`                                          | 제어 API. 다이얼로그 밖에서 부르면 **throw** → [상세](#use-dialog)         |
| `useDialogSafe<T>()`     | `() => IDialogApiHandle<T> \| null`                                  | 밖이면 `null`. 안/밖 겸용 컴포넌트용                                       |
| `useDialogSubmit<T>(fn)` | `(fn: () => T \| undefined \| Promise<T \| undefined>) => void`      | 셸 `확인` 처리. `undefined` 반환 시 닫지 않음 → [상세](#use-dialog-submit) |
| `useDialogGuard<T>(fn)`  | `(fn: (r: IDialogResult<T>) => boolean \| Promise<boolean>) => void` | 닫기 가드. `false` 반환 시 닫히지 않음 → [상세](#use-dialog-guard)         |
| `useLiveProps(values)`   | `<P>(values: P) => ILivePropsBox<P>`                                 | **호출부 페이지**에서 사용. 살아있는 props → [상세](#use-live-props)       |

`useDialog()` / `useDialogSafe()`가 돌려주는 제어 API (`IDialogApiHandle`) → [전체 표](#use-dialog)

| 멤버                                                        | 설명                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `id` · `depth` · `isTop`                                    | 읽기 전용 — id · 스택 깊이(0 = 최하단) · 최상단 여부      |
| `close(data?)` · `cancel()`                                 | `data` 있으면 reason `submit`, 없으면 `close` / `cancel`  |
| `setTitle(node)` · `setDescription(node)` · `setSize(size)` | 셸 헤더 · 폭 변경                                         |
| `setLoading(b)` · `setConfirmDisabled(b)`                   | 푸터 전체 로딩 · 확인 버튼만 비활성 (**effect에서 호출**) |
| `setDismissable(b)`                                         | ESC · 배경 · X 잠금/해제                                  |
| `setBeforeClose(fn)` · `setSubmit(fn)`                      | 가드 · 제출 핸들러 직접 등록 (**훅 사용 권장**)           |
| `patch(option)`                                             | 껍데기 옵션 부분 갱신                                     |

### 정적 메서드

전역 어디서든(컴포넌트 밖에서도) 호출할 수 있습니다.

| 메서드                          | 반환     | 설명                                                        |
| ------------------------------- | -------- | ----------------------------------------------------------- |
| `$ui.dialog.close(id, reason?)` | `void`   | 특정 id를 닫음. 기본 `reason`은 `'programmatic'`(가드 우회) |
| `$ui.dialog.closeAll(reason?)`  | `void`   | 열려 있는 **모든** dialog를 닫음. 각각 `undefined`로 정산   |
| `$ui.dialog.count()`            | `number` | 현재 열려 있는(정산 전) dialog 개수                         |

```ts
// 로그아웃·세션 만료 시 화면에 떠 있는 모달을 전부 정리
async function forceLogout() {
  $ui.dialog.closeAll();
  await logout();
  $router.replace("/login");
}

// 이미 뭔가 열려 있으면 중복으로 열지 않기
if ($ui.dialog.count() === 0) {
  void $ui.dialog({ component: NoticeDialog });
}
```

:::note `close(id, reason)`에 기본값이 아닌 `reason`을 주면
`'programmatic'` 이외의 값을 넘기면 **일반 닫기 경로를 그대로 탑니다.** 예를 들어 `'cancel'`을 주면 `beforeClose` 가드가 실행되고, `'escape'`를 주면 `dismissable: false`에 막혀 닫히지 않습니다.
"무조건 닫아야 한다"면 기본값을 그대로 쓰세요.
:::

:::note `closeAll()`은 위에서부터 닫습니다
스택 순서를 유지하기 위해 최상단부터 역순으로 정산합니다. 가드는 우회하므로 **저장되지 않은 폼이 확인 없이 사라집니다.** 사용자 흐름 안에서 쓰지 말고, 로그아웃·세션 만료 같은 **강제 정리** 상황에만 쓰세요.
:::

### 관련 타입

```ts
import type {
  IDialogOption,
  IDialogResult,
  TDialogReason,
  TDialogSize,
} from "@/types/components";

/** 폭 프리셋 */
type TDialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

/** 닫힌 경로 — 경로별 차단·가드 여부는 아래 표 참고 */
type TDialogReason =
  | "confirm" // 셸 확인 버튼
  | "cancel" // 셸 취소 버튼 · dialog.cancel()
  | "close" // 우상단 X · dialog.close()
  | "escape" // ESC 키
  | "autoDismiss" // autoDismiss 시간 경과
  | "overlay" // 배경(딤) 클릭
  | "submit" // 컨텐츠가 close(data)
  | "programmatic" // handle.close() · $ui.dialog.closeAll()
  | "route" // 라우트(pathname) 변경
  | "error"; // 컨텐츠 렌더/청크 로드 실패

/** onClose · beforeClose 가 받는 결과 */
interface IDialogResult<T = never> {
  id: string;
  confirmed: boolean; // reason 이 'confirm' | 'submit' 이면 true
  reason: TDialogReason;
  data?: T;
}
```

→ `reason`별 [`dismissable: false` 차단 여부와 가드 실행 여부 전체 표](#reason-전체-목록)

:::tip 결과는 언제나 `T | undefined`입니다
`$ui.dialog`는 **절대 reject 하지 않습니다.** 취소 · ESC · X · 배경 · 라우트 변경 · 렌더 실패가 전부 `undefined`이므로 `try/catch`가 아니라 **`undefined` 분기**로 처리하세요. → [결과값 규칙](#결과값-규칙)
:::

---

## 크기와 스타일링

---

### `size` 프리셋

| `size`        | 최대 폭                                            |
| ------------- | -------------------------------------------------- |
| `sm`          | `sm:max-w-sm`                                      |
| `md` _(기본)_ | `sm:max-w-md`                                      |
| `lg`          | `sm:max-w-2xl`                                     |
| `xl`          | `sm:max-w-4xl`                                     |
| `2xl`         | `sm:max-w-6xl`                                     |
| `full`        | 화면 전체 − 여백 `1rem` (본문이 `flex-1`로 늘어남) |

```tsx
await $ui.dialog({ component: MemberPickerDialog, size: "lg", footer: false }); // 테이블은 lg 이상
await $ui.dialog({ component: HeavyEditor, size: "full" }); // 편집기는 full
```

### 한 번만 바꾸는 스타일 — `className`

| 옵션               | 대상                        | 동작 여부      |
| ------------------ | --------------------------- | -------------- |
| `className`        | 본체 카드 (`DialogContent`) | ✅             |
| `bodyClassName`    | 본문 래퍼 (스크롤 영역)     | ✅             |
| `overlayClassName` | 딤 배경                     | ⚠️ 현재 미적용 |

```tsx
await $ui.dialog({
  component: PhotoViewer,
  size: "full",
  className: "bg-black/90 border-none",
  bodyClassName: "p-0",
});
```

#### `overlayClassName`은 현재 화면에 반영되지 않습니다 {#overlay-class-name}

:::caution 타입에는 있지만 셸이 읽지 않는 옵션입니다
타입(`IDialogOption`)에는 있지만 **`DialogSkin`이 이 값을 읽지 않습니다.** 스킨은 딤 배경의 클래스 자리를 "중첩 시 딤 누적 방지"(깊이 1 이상은 투명 처리) 용도로 이미 쓰고 있고, 거기에 `option.overlayClassName`을 합치는 코드가 없습니다.

딤 배경을 바꿔야 한다면 지금은 두 가지 방법이 있습니다.

1. **프로젝트 전체를 한 번에** — `DialogSkin.tsx`의 `overlayClassName` 값을 직접 고칩니다. (권장)
2. **호출별로 다르게 주고 싶다면** — 스킨에서 두 값을 합치도록 한 줄 고칩니다.

```tsx title="src/shared/ui/overlay/DialogSkin.tsx"
overlayClassName={cn(
  frame.depth > 0 && 'bg-transparent supports-backdrop-filter:backdrop-blur-none',
  option.overlayClassName, // ← 이 줄을 더하면 옵션이 살아납니다
)}
```

딤의 **z-index**는 `frame.contentProps`의 `overlayStyle`로 정상 적용되므로 이 문제와 무관합니다.
:::

### 프로젝트 전체의 껍데기 — `DialogSkin.tsx`

모든 `$ui.dialog`의 **모양**은 `src/shared/ui/overlay/DialogSkin.tsx` 한 파일이 그립니다.
프로젝트 디자인에 맞춰 자유롭게 고치는 파일입니다.

| ✅ 자유롭게 바꿔도 되는 것       | ⛔ 건드리면 안 되는 것                                |
| -------------------------------- | ----------------------------------------------------- |
| `SIZE_CLASS`의 폭 값             | `{...frame.rootProps}` — 열림 상태 배선               |
| 헤더 · 본문 · 푸터의 마크업 구조 | `{...frame.contentProps}` — ESC · 배경 클릭 닫기 경로 |
| X 버튼의 위치 · 아이콘 · variant |                                                       |
| 푸터 버튼의 순서 · 문구 · 색     |                                                       |
| 모든 Tailwind 클래스             |                                                       |

:::danger `{...frame.contentProps}` 를 지우면 가드가 조용히 무력화됩니다
이 스프레드가 없으면 ESC·배경 클릭이 **Radix 자체 경로로** 닫히면서 `beforeClose` 가드를 우회합니다.
화면상으로는 멀쩡히 잘 닫히는 것처럼 보이므로 **작성 중이던 폼이 확인 없이 날아가는 버그를 한참 뒤에 발견**하게 됩니다. 클래스만 바꾸고 두 스프레드는 그대로 두세요.
:::

:::note `size` 클래스는 반드시 정적 리터럴이어야 합니다
`sm:max-w-${size}` 처럼 조합하면 Tailwind가 스캔하지 못해 CSS가 생성되지 않습니다(폭이 안 먹습니다).
같은 이유로 깊이별 z-index는 클래스가 아니라 **인라인 style**로 들어갑니다.
:::

---

## 알아둘 제약

---

### 1. 라우터 훅 — 일부만 동작합니다

다이얼로그 호스트는 `RouterProvider`의 **형제**로 마운트되므로 컨텐츠는 라우터 트리 바깥에 있습니다.
`DialogRouterBridge`가 컨텍스트를 다시 공급하지만 **전부는 아닙니다.**

|           | 훅 / 컴포넌트                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅ 동작   | `useLocation` · `useNavigate` · `useHref` · `useSearchParams` · `useResolvedPath` · `useInRouterContext` · `<Link>` · `<NavLink>` · `<Navigate>` |
| ❌ 미동작 | `useParams` — 항상 `{}` 를 반환합니다. **`$router.getParams()`** 로 대체하거나 props로 넘기세요                                                  |
| ❌ 미동작 | 데이터라우터 전용 — `useLoaderData` · `useNavigation` · `useBlocker` · `useFetcher` · `<Form>`                                                   |

react-query · 테마 · Tooltip 컨텍스트는 **정상 동작**합니다.

:::tip 그래서 권장되는 패턴
**데이터 객체 대신 id만 props로 넘기고**, 컨텐츠 안에서 `useApi`로 직접 조회하세요.
props 스냅샷 문제가 구조적으로 사라지고, 갱신도 react-query가 알아서 합니다.

```tsx
await $ui.dialog({ component: MemberDetailDialog, props: { memberId: 42 } });
// 컨텐츠 안: const { data } = useApi(['member', memberId], () => api.getMember(memberId));
```

:::

### 2. 코드분할은 `loadable(...)` 결과를 넘깁니다

```tsx
import loadable from "@loadable/component";

// ✅ 모듈 최상단에서 한 번 감싼다
const HeavyEditor = loadable(() => import("./HeavyEditor"));
await $ui.dialog({ component: HeavyEditor, props: { docId }, size: "full" });

// ❌ import 썽크를 직접 넘기면 안 된다 — 함수 컴포넌트와 런타임에 구분할 수 없다
await $ui.dialog({ component: () => import("./HeavyEditor") });
```

로딩 중에는 `DialogPendingFallback`이, 청크 로드에 **실패하면** `DialogErrorFallback`이 본문 자리에 표시되고
(둘 다 `src/shared/ui/overlay/DialogSkin.tsx`가 함께 내보내는 컴포넌트라 문구·스타일을 자유롭게 고칠 수 있습니다)
Promise는 `undefined`로 **반드시 정산**됩니다. (정산하지 않으면 `await`가 영원히 멈춥니다)

### 3. 렌더 도중에 열지 마세요

컨텐츠가 **렌더되는 중에** `$ui.dialog`를 호출하면 무한히 스택이 쌓입니다(상한 20에서 차단).
반드시 **이벤트 핸들러**나 **`useEffect`** 안에서 여세요.

### 4. 닫힘 애니메이션 동안 150ms 더 렌더됩니다

정산(`resolve`)은 **즉시** 일어나고, 스택에서 제거는 `150ms` 뒤입니다. 사용자 코드를 애니메이션만큼 기다리게 하지 않기 위함입니다.
스킨에서 닫힘 애니메이션 길이를 바꾸면 `overlay-layers.ts`의 `CLOSE_ANIM_MS`도 함께 맞추세요.

---

## 실전 예제 — 담당자 지정

---

목록에서 하나를 고르는 전형적인 패턴입니다.
컴포넌트형 `Dialog`로 만들면 필요한 **`open` state · JSX 배치 · `onSelect` 콜백 prop · 닫힘 리셋**이 전부 사라지고, 이벤트 핸들러에서 `await` 한 줄로 끝납니다.

**포인트**

- `$ui.dialog<IExampleMember>(...)` — **결과 타입을 호출부에서** 지정합니다. 컨텐츠를 감싸는 헬퍼는 없습니다.
- `footer: false` — 행의 `선택` 버튼이 곧 확인입니다. 컨텐츠가 `useDialog()`로 꺼낸 `dialog.close(member)`로 결과를 넘깁니다.
- `props: { selectedId }` — 이미 지정된 담당자를 표시하기 위한 **열 때의 값**이면 충분하므로 `useLiveProps`가 필요 없습니다.
- 취소·ESC·X·배경은 `undefined`이므로 `if (!picked) return;` 한 줄로 처리합니다.
- 결과를 부모로 올리는 콜백 배선이 없습니다. `await`가 그 역할을 합니다.

<details>
<summary><b>MemberAssignCard.tsx</b> — 호출부 전체 소스</summary>

```tsx title="src/domains/example/components/ui/dialog/MemberAssignCard.tsx"
import { useState } from "react";
import { Badge, Button } from "@axiom/components/ui";
import { UserPlus, X } from "lucide-react";
import MemberPickerDialog, { type IExampleMember } from "./MemberPickerDialog";

export default function MemberAssignCard(): React.ReactNode {
  const [assignee, setAssignee] = useState<IExampleMember | null>(null);

  const handlePick = async (): Promise<void> => {
    // highlight-start
    const picked = await $ui.dialog<IExampleMember>({
      component: MemberPickerDialog,
      props: { selectedId: assignee?.id },
      title: "담당자 선택",
      description: '행의 "선택" 버튼을 누르면 그 회원이 결과로 반환됩니다.',
      size: "lg",
      footer: false, // 컨텐츠가 직접 닫는다
    });

    // 취소 · ESC · X · 배경 클릭은 undefined
    if (!picked) return;
    // highlight-end

    setAssignee(picked);
    await $ui.alert({
      type: "success",
      message: `${picked.name} 님을 담당자로 지정했습니다.`,
      autoDismiss: 1400,
    });
  };

  return (
    <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">
        담당자
      </p>

      <div className="mt-3 flex items-center gap-3">
        {assignee ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Badge>{assignee.name}</Badge>
            <span className="truncate font-mono text-xs text-gray-500">
              {$util.string.formatMobile(assignee.phone)}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setAssignee(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="flex-1 text-xs text-gray-400">
            아직 지정되지 않았습니다.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={handlePick}
        >
          <UserPlus className="size-4" />
          {assignee ? "변경" : "지정"}
        </Button>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>MemberPickerDialog.tsx</b> — 컨텐츠 전체 소스</summary>

```tsx title="src/domains/example/components/ui/dialog/MemberPickerDialog.tsx"
import { Badge, Button, SmartTable, defineColumns } from "@axiom/components/ui";
import { Check } from "lucide-react";
import { useDialog } from "@axiom/hooks";

/** 데모용 회원 타입 */
export interface IExampleMember {
  id: number;
  name: string;
  phone: string;
  balance: number;
  status: "active" | "dormant" | "blocked";
  joinedAt: string;
}

const MEMBERS: IExampleMember[] = [
  {
    id: 1,
    name: "김철수",
    phone: "01012345678",
    balance: 1250000,
    status: "active",
    joinedAt: "2024-03-12",
  },
  // … 나머지 데이터 생략
];

const columns = defineColumns<IExampleMember>({
  name: "이름",
  phone: { label: "연락처", format: "phone" },
  balance: { label: "잔액", format: "money", align: "right" },
  status: {
    label: "상태",
    align: "center",
    badge: {
      map: {
        active: { label: "활성", variant: "default" },
        dormant: { label: "휴면", variant: "secondary" },
        blocked: { label: "정지", variant: "destructive" },
      },
    },
  },
});

export interface IMemberPickerDialogProps {
  /** 이미 선택되어 있는 회원 id (있으면 표시) */
  selectedId?: number;
}

// 평범한 컴포넌트다. 감싸는 헬퍼가 없고, 제어 API 는 훅으로 꺼낸다.
export default function MemberPickerDialog({
  selectedId,
}: IMemberPickerDialogProps): React.ReactNode {
  // highlight-next-line
  const dialog = useDialog<IExampleMember>();

  return (
    <SmartTable
      data={MEMBERS}
      columns={columns}
      toolbar={false}
      paginated={false}
      renderRowActions={(member) => (
        <div className="flex items-center gap-2">
          {member.id === selectedId && (
            <Badge variant="secondary">
              <Check className="size-3" />
              선택됨
            </Badge>
          )}
          {/* highlight-next-line */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => dialog.close(member)}
          >
            선택
          </Button>
        </div>
      )}
    />
  );
}

// 호출부에서 결과 타입을 지정한다
// const member = await $ui.dialog<IExampleMember>({ component: MemberPickerDialog, footer: false });
```

</details>

<details>
<summary><b>InquiryFormDialog.tsx</b> — 닫기 가드 + 비동기 제출 전체 소스</summary>

```tsx title="src/domains/example/components/ui/dialog/InquiryFormDialog.tsx"
import { useState } from "react";
import { Input, Label, Textarea } from "@axiom/components/ui";
import { useDialog, useDialogGuard, useDialogSubmit } from "@axiom/hooks";

/** 제출 결과 */
export interface IInquiry {
  subject: string;
  body: string;
}

export interface IInquiryFormDialogProps {
  /** 제목 기본값 */
  defaultSubject?: string;
}

const EMPTY: IInquiry = { subject: "", body: "" };

export default function InquiryFormDialog({
  defaultSubject = "",
}: IInquiryFormDialogProps): React.ReactNode {
  // highlight-next-line
  const dialog = useDialog<IInquiry>();
  const [form, setForm] = useState<IInquiry>({
    ...EMPTY,
    subject: defaultSubject,
  });
  const dirty = form.subject !== defaultSubject || form.body !== "";

  // highlight-start
  // ① 닫기 가드 — 작성 중이면 한 번 더 묻는다
  useDialogGuard<IInquiry>(async (result) => {
    if (!dirty || result.reason === "submit" || result.reason === "confirm")
      return true;
    return $ui.confirm({
      type: "warning",
      title: "작성 취소",
      message: "작성 중인 내용이 사라집니다. 닫을까요?",
      confirmText: "닫기",
      cancelText: "계속 작성",
    });
  });

  // ② 셸 '확인' 처리 — 비동기 가능, undefined 면 닫지 않는다
  useDialogSubmit<IInquiry>(async () => {
    if (!form.subject.trim()) {
      await $ui.alert({ type: "warning", message: "제목을 입력하세요." });
      return undefined;
    }
    dialog.setLoading(true); // 셸 푸터에 스피너
    await new Promise((resolve) => setTimeout(resolve, 500)); // 실제로는 API 호출
    dialog.setLoading(false);
    return form; // 이 값이 await 결과
  });
  // highlight-end

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ex-inquiry-subject">제목</Label>
        <Input
          id="ex-inquiry-subject"
          value={form.subject}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, subject: e.target.value }))
          }
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ex-inquiry-body">내용</Label>
        <Textarea
          id="ex-inquiry-body"
          value={form.body}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, body: e.target.value }))
          }
          rows={5}
        />
      </div>
    </div>
  );
}
```

</details>

:::tip 이 예제에서 가져갈 것
컨텐츠는 **자기 상태만** 알면 됩니다. "언제 닫아도 되는가"(가드)와 "확인이 무엇을 만드는가"(제출)를 컨텐츠가 등록하고,
호출부는 **결과만** `await` 합니다. 두 코드가 콜백으로 얽히지 않습니다.
:::

---

## 요약

---

:::info 한눈에
| 항목 | 값 |
| --- | --- |
| 시그니처 | `$ui.dialog<T, P>({ component, props?, ...option })` |
| 반환 | `Promise<T \| undefined>` + `update` · `patch` · `close` · `cancel` · `isOpen` |
| 취소 시 | **`undefined`** (절대 reject 하지 않음) |
| 정적 메서드 | `$ui.dialog.close(id)` · `.closeAll()` · `.count()` |
| 컨텐츠 | **평범한 컴포넌트** — 감싸는 헬퍼 없음 |
| 결과 타입 | 호출부 `$ui.dialog<T>(...)` 에서 지정 |
| 컨텐츠 훅 | `useDialog` · `useDialogSafe` · `useDialogSubmit` · `useDialogGuard` · `useLiveProps` (from `@axiom/hooks`) |
| 중첩 | 스택 (상한 20). alert/confirm은 항상 위 |
| 껍데기 파일 | `src/shared/ui/overlay/DialogSkin.tsx` |
| 단순 알림 · 확인 | [`$ui.alert`](./alert-ui) · [`$ui.confirm`](./confirm-ui) |
| 컴포넌트형 모달 | [Dialog 컴포넌트](../../../components/ui/dialog-component) |
| 옵션 · API 전체 | [API 참조](#api-참조) |
:::

### 체크리스트

- [ ] 결과를 쓴다면 호출부에 **`$ui.dialog<T>(...)`** 로 결과 타입을 줬는가 (안 주면 `unknown`)
- [ ] props까지 체크받고 싶다면 **`$ui.dialog<T, P>(...)`** 로 두 인자를 모두 적었는가
- [ ] 컨텐츠에서 닫는다면 **`useDialog<T>()`** 로 제어 API를 꺼냈는가 (`props.dialog`로도 오지만 깊은 자식·페이지 겸용에는 훅이 안전하다)
- [ ] 셸 `확인`을 쓴다면 **`useDialogSubmit`을 등록**했는가 (안 하면 `true`가 온다)
- [ ] `await` 결과가 **`undefined`인 경우를 분기**했는가
- [ ] 작성 중 폼이라면 **`useDialogGuard`**를 등록했는가
- [ ] 열어둔 채 값이 바뀌어야 하면 **`useLiveProps`** 또는 **`handle.update()`** 중 맞는 쪽을 골랐는가
- [ ] 완전히 잠가야 한다면 `dismissable: false` **+ `footer: false` + `showCloseButton: false`**를 함께 줬는가
- [ ] 코드분할은 **`loadable(...)` 결과**를 넘겼는가
- [ ] 컨텐츠에서 `useParams`를 쓰지 않았는가 (**`$router.getParams()`** 사용)
