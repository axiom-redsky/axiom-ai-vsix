---
sidebar_position: 1
displayed_sidebar: "apiDocSidebar"
title: "⋮ $ui.confirm"
---

# $ui.confirm

`react-app-scaffold`에서 전역으로 제공하는 **확인/취소 다이얼로그** 함수입니다.
사용자에게 "예/아니오"를 묻고, 선택 결과(`true`/`false`)를 받아 로직을 분기할 수 있습니다.

- 브라우저 기본 `window.confirm()`을 대체하는 함수로, 앱의 디자인(shadcn `AlertDialog`)이 적용된 다이얼로그를 띄웁니다.
- React 컴포넌트 밖(이벤트 핸들러 · 유틸 · API 인터셉터 등)에서도 **훅 없이** 사용할 수 있습니다.
- 별도의 `import` 없이 전역 객체 `$ui`로 바로 사용합니다.
- **`Promise<boolean>`을 반환**하므로 `await`로 사용자의 선택을 기다렸다가 분기할 수 있습니다. **확인 버튼 = `true`**, 그 외 모든 닫힘(취소 · X · ESC · 자동 닫힘) = **`false`**.
- `$ui.alert`와 **같은 큐 · 같은 호스트 · 같은 스킨**을 공유합니다. 내부적으로는 `kind: 'confirm'`인 항목일 뿐이며, 차이는 **취소 버튼이 하나 더 그려지고 결과가 `boolean`이라는 점**뿐입니다.

```ts
// 사용 형태
const ok = await $ui.confirm("정말 삭제하시겠습니까?"); // 메시지만
await $ui.confirm("변경사항을 저장할까요?", { type: "warning", confirmText: "저장" }); // 메시지 + 옵션
await $ui.confirm({ title: "탈퇴", message: "정말 탈퇴하시겠습니까?" }); // 옵션 객체만

// 결과로 분기하기
if (await $ui.confirm("정말 진행할까요?")) {
  // ↑ 사용자가 '확인'을 누른 경우에만 실행
}
```

:::tip 인자 오버로드
`$ui.confirm`은 첫 번째 인자를 **문자열** 또는 **옵션 객체** 두 가지로 받을 수 있습니다.

- 첫 인자가 문자열이면 → 본문 메시지(`message`)로 사용됩니다.
- 첫 인자가 옵션 객체이면 → 그 객체가 전체 옵션이 됩니다.
- 두 인자를 함께 주면 → 두 값이 병합되며, **두 번째 인자(옵션 객체)가 우선**합니다.
  :::

:::info 동작하는 화면을 보고 싶다면
스캐폴드 예제 앱의 **`$ui.confirm` 페이지**(라우트 `ui/confirm`)에서 이 문서의 예제를 직접 눌러볼 수 있습니다.
소스: `src/domains/example/pages/ui/UiConfirm.tsx`
실전 예제(삭제 전 확인): `src/domains/example/components/ui/confirm/DeleteConfirmCard.tsx`
:::

<details>
<summary><b>프론트엔드 Core 코드 관리자(공통 개발자)를 위한 `$ui.confirm` 실행 흐름 이해</b> — 펼쳐보기</summary>

> 화면에서 `await $ui.confirm(...)` 를 호출했을 때 파일이 읽히는 순서.
> `$ui.alert` 와 **완전히 같은 경로**를 탄다. 갈라지는 지점은 딱 두 곳 — **취소 버튼을 그릴지**(모양)와 **resolve 에 무엇을 넘길지**(정산)다.

```ts
const ok = await $ui.confirm({ type: "error", message: "삭제할까요?", confirmText: "삭제" });
```

---

- **0단계** — 부팅 (앱 실행 시 미리 처리)

1. **`src/main.tsx:16`** — `registerWindowUI()` 호출
2. **`src/core/ui/index.ts:121`** — `window.$ui` 에 `alert`/`confirm`/`dialog` 를 심는다 (조립은 같은 파일 `98`행 `createWindowUI()`)
3. **`src/core/providers/AppProviders.tsx:27`** → **`src/core/ui/UIHosts.tsx:21`** — `<UIAlertHost />` 를 앱에 딱 한 번 마운트
4. **`src/core/ui/alert/UIAlertHost.tsx:14`** — 큐가 비어 있어 `null` 반환. **아무것도 안 그리고 대기**

---

- **1단계** — 호출 (동기)

5. **`src/core/ui/index.ts:108`** — `Promise<boolean>` 을 만들고 `resolve` 를 밖으로 캡처
6. **`src/core/ui/index.ts:45`** 의 `normalize()` — `'문자열'` 과 `{ 옵션 }` 두 호출 형태를 하나로 병합 (`47`행: 두 번째 인자가 우선)
7. **`src/core/ui/createId.ts:12`** — `id` 가 없으면 UUID 부여
8. **`src/core/ui/alert/alertStore.ts:26`** — `{ kind: 'confirm', option, resolve }` 를 **FIFO 큐 맨 뒤**에 넣는다
9. 호출부는 `await` 에서 **정지**

---

- **2단계** — 렌더

10. **`src/core/ui/alert/useAlertFrame.ts:25`** — 큐 구독이 변화를 감지해 호스트를 리렌더 (**항상 `queue[0]` 하나만** 그린다)
11. **`src/core/ui/alert/useAlertFrame.ts:39`** — `setOpen(true)` 로 두 번째 리렌더 (열림 애니메이션용)
12. **`src/core/ui/alert/useAlertFrame.ts:85`** — **동작**만 담은 `frame` 반환 (`kind` · 열림 상태 · z-index · 아이콘 표시 여부 · **닫기 함수 3종**)
    - 초기 포커스 배선(`onOpenAutoFocus`)은 **alert 일 때만** 넣는다. confirm 은 Radix 가 취소 버튼에 포커스를 주므로 손대지 않는다
13. **`src/core/ui/alert/UIAlertHost.tsx:17`** — `<AlertSkin frame={frame} />` ← **core → shared 경계**
14. **`src/shared/ui/overlay/AlertSkin.tsx:45`** — **모양**. 아이콘·색상·문구를 정하고 Radix(**`src/shared/lib/shadcn/ui/alert-dialog.tsx`**)로 DOM 을 그린다

    - **① 갈라지는 지점** — `83`행: `kind === 'confirm'` 일 때만 `<AlertDialogCancel>`(취소 버튼)을 추가로 그린다

---

- **3단계** — 닫기

15. 확인 · 취소 · X · ESC · autoDismiss — **다섯 경로 모두** `closeWith(reason)`(**`src/core/ui/alert/useAlertFrame.ts:52`**) 하나로 모인다
16. `closeWith` 내부 순서
    1. 중복 진입 차단(`55`행) — 정산은 정확히 1회
    2. `confirmed = reason === 'confirm'` 계산(`58`행) → `onClose` 콜백 호출(`60`행)
    3. **② 갈라지는 지점** — `62`행: `kind === 'confirm'` 이면 **`resolve(confirmed)`**, alert 면 `resolve()`. 여기서 화면 코드의 `await` 가 `true`/`false` 를 받아 재개된다
    4. `setOpen(false)` — 닫힘 애니메이션 시작
    5. 150ms(**`src/shared/ui/overlay/overlay-layers.ts:34`**) 뒤 `dequeue()` — 큐에서 제거
17. 큐에 다음 항목이 있으면 10번으로 되돌아간다

> **3번(정산)과 5번(큐 제거)을 분리한 게 핵심.** 바로 제거하면 닫힘 애니메이션이 잘린다.
> 확인/취소 버튼을 누르면 Radix 가 뒤이어 `onOpenChange(false)`(`92`행)까지 호출하지만, 1번의 중복 가드가 막으므로 `reason` 이 `escape` 로 덮어써지지 않는다.

---

- **요약**

```text
화면 코드
  ↓ await $ui.confirm(...)
index.ts        Promise<boolean> 생성 · 옵션 병합
  ↓
createId.ts     id 부여
  ↓
alertStore.ts   큐에 넣기 (kind:'confirm') ──── 호출부는 await 로 정지
  ↓ (구독)
useAlertFrame   동작 계산 (confirm/cancel/close 3종)
  ↓
UIAlertHost     core → shared 경계
  ↓
AlertSkin       모양 (Radix DOM) — confirm 이면 취소 버튼 추가

닫기 → closeWith(reason) → resolve(reason === 'confirm') → 150ms 뒤 큐에서 제거
```

**입구(`index.ts`) → 상태(`alertStore`) → 동작(`useAlertFrame`) → 모양(`AlertSkin`)** 네 단계.

<span className="layer-core">● **core**</span> = 동작·상태 레이어 · <span className="layer-shared">● **shared**</span> = 모양(공용 UI) 레이어

| 고치고 싶은 것                          | 열 파일                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| 디자인 (아이콘·색상·버튼 순서/색)       | <span className="layer-shared">**`src/shared/ui/overlay/AlertSkin.tsx`**</span>     |
| z-index·애니메이션 길이                 | <span className="layer-shared">**`src/shared/ui/overlay/overlay-layers.ts`**</span> |
| 동작 (닫기·정산·자동닫힘)               | <span className="layer-core">**`src/core/ui/alert/useAlertFrame.ts`**</span>        |
| 호출 API·옵션 병합                      | <span className="layer-core">**`src/core/ui/index.ts`**</span>                      |
| 큐 정책                                 | <span className="layer-core">**`src/core/ui/alert/alertStore.ts`**</span>           |
| 옵션·결과 타입 (`IConfirmDialogOption`) | **`src/types/components/index.ts`**                                                 |

:::danger 스킨을 고칠 때 절대 바꾸지 말 것
`AlertSkin.tsx` 에서 `frame.confirm` · `frame.cancel` · `frame.close` 는 **서로 다른 닫기 사유(reason)** 이며, `confirm` 만 결과를 `true` 로 만듭니다.
취소 버튼에 `frame.confirm` 을 잘못 달면 **취소를 눌렀는데 삭제가 실행되는** 사고가 납니다.
:::

</details>

---

## confirm()

확인/취소 다이얼로그를 큐에 넣고, 사용자가 닫으면 **선택 결과(`boolean`)로 resolve** 되는 `Promise`를 반환합니다.

| 인자      | 타입                             | 필수 | 기본값 | 설명                                                                                                                          |
| --------- | -------------------------------- | :--: | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `message` | `string \| IConfirmDialogOption` |      | —      | 본문 메시지 문자열, 또는 옵션 객체                                                                                            |
| `option`  | `IConfirmDialogOption`           |      | —      | 옵션 객체. `message`와 함께 넘기면 이 값이 우선 병합됨. 상세는 [옵션 (IConfirmDialogOption)](#옵션-iconfirmdialogoption) 참고 |

- **반환** : `Promise<boolean>` — **확인 버튼**이면 `true`, 그 외 모든 닫힘(취소 · X · ESC · 자동 닫힘)이면 `false`.

```ts
// 1) 가장 단순한 사용
const ok = await $ui.confirm("저장하시겠습니까?");
if (ok) await saveData();

// 2) 위험 동작 확인 (아이콘·색상·문구 강조)
const ok2 = await $ui.confirm("이 작업은 되돌릴 수 없습니다. 삭제할까요?", {
  type: "error",
  confirmText: "삭제",
  cancelText: "유지",
});
if (ok2) await deleteItem();

// 3) 제목 + 본문 직접 지정
const ok3 = await $ui.confirm({
  title: "로그아웃",
  message: "로그아웃하시겠습니까?",
  type: "warning",
});
```

:::warning '확인' 외에는 모두 `false`
반환값 `true`는 **오직 '확인' 버튼을 눌렀을 때뿐**입니다.
취소 버튼 · X 버튼 · ESC · `autoDismiss` 자동 닫힘은 **모두 `false`**로 resolve 됩니다.
"닫힌 이유"까지 구분해야 한다면 [`onClose`](#닫힘-결과-idialogresult) 콜백의 `reason`을 사용하세요.
:::

:::caution `await`를 빼먹으면 결과를 받을 수 없습니다
`$ui.confirm()`은 화면을 멈추지 않는 **비동기** 함수입니다. `window.confirm()`처럼 값이 즉시 나오지 않습니다.

```ts
// ❌ Promise 객체는 항상 truthy → 취소를 눌러도 삭제된다
if ($ui.confirm("삭제할까요?")) deleteItem();

// ✅ await 로 결과를 받는다 (핸들러에 async 를 붙이는 것을 잊지 말 것)
if (await $ui.confirm("삭제할까요?")) deleteItem();
```

:::

---

## 옵션 (IConfirmDialogOption)

`confirm(message, option)`에 넘기는 옵션 객체입니다. [`$ui.alert`의 옵션(`IAlertDialogOption`)](./alert-ui#옵션-ialertdialogoption)을 모두 상속하며, **취소 버튼 문구(`cancelText`)** 하나가 추가됩니다.

| 옵션          | 타입                                          | 기본값                | 설명                                                                                                                                                            |
| ------------- | --------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | `string`                                      | —                     | 본문 메시지. (첫 인자를 옵션 객체로 줄 때 여기에 넣습니다)                                                                                                      |
| `title`       | `string`                                      | `type`별 기본 제목    | 제목. 미지정 시 [기본 제목](#type-별-기본-제목아이콘) 표의 값이 쓰입니다. **제목은 항상 표시됩니다.**                                                           |
| `type`        | `'success' \| 'info' \| 'warning' \| 'error'` | —                     | 다이얼로그 종류. 지정 시 **아이콘 · 아이콘 색상 · 기본 제목**이 함께 적용됩니다.                                                                                |
| `confirmText` | `string`                                      | `'확인'`              | 확인 버튼 문구.                                                                                                                                                 |
| `cancelText`  | `string`                                      | `'취소'`              | **취소 버튼 문구.** (`$ui.confirm` 전용 — alert 에 주면 무시됩니다)                                                                                             |
| `icon`        | `boolean`                                     | `type` 지정 시 `true` | 아이콘 표시 여부. 기본은 숨김이며 `type`을 주면 자동 표시됩니다. `icon: true`(type 없이 강제 표시) / `icon: false`(type 있어도 강제 숨김)로 덮어쓸 수 있습니다. |
| `close`       | `boolean`                                     | `false`               | 우상단 **X(닫기) 버튼** 표시 여부. (누르면 `false` · `reason: 'close'`)                                                                                         |
| `autoDismiss` | `number`                                      | —                     | 지정 시 **N밀리초(ms)** 후 자동으로 닫힙니다. (자동 닫힘은 `false`로 resolve — 아래 주의 참고)                                                                  |
| `onClose`     | `(result: IDialogResult) => void`             | —                     | 닫힌 뒤 호출되는 콜백. 어떤 경로로 닫혔는지 등 상세 정보를 받습니다. 상세는 [닫힘 결과 (IDialogResult)](#닫힘-결과-idialogresult) 참고                          |
| `id`          | `string`                                      | 자동 생성             | 다이얼로그 고유 식별자. 미지정 시 UUID가 자동 부여됩니다. (`onClose` 결과의 `id`로 되돌아옵니다)                                                                |

```ts
// 확인/취소 문구 변경
await $ui.confirm("변경사항을 저장할까요?", {
  type: "warning",
  confirmText: "저장",
  cancelText: "저장 안 함",
});

// X 버튼까지 함께 노출
await $ui.confirm("이 항목을 보관 처리할까요?", {
  type: "info",
  close: true,
});
```

:::note `cancelText`에 빈 문자열은 통하지 않습니다
취소 버튼 문구는 `cancelText || '취소'`로 결정되므로, `cancelText: ''`를 주면 **`'취소'`로 되돌아갑니다**. 취소 버튼 자체를 없앨 수는 없습니다. 버튼이 하나만 필요하면 [`$ui.alert`](./alert-ui)를 쓰세요.
:::

:::caution `autoDismiss`는 confirm 과 잘 맞지 않습니다
`$ui.confirm`은 **사용자의 결정을 받는** 다이얼로그인데, `autoDismiss`는 사용자가 아무것도 고르지 않은 상태에서 **조용히 `false`로 resolve** 시킵니다. 사용자는 "취소를 누른 적이 없는데 취소됐다"고 느끼게 됩니다.
시간이 지나면 사라져도 되는 안내라면 confirm 이 아니라 `$ui.alert('...', { autoDismiss: 2000 })`이 맞습니다.
:::

### type 별 기본 제목·아이콘

`type`을 지정하면 종류에 맞는 **아이콘 · 아이콘 색상 · 기본 제목**이 적용됩니다. (`title`을 직접 주면 기본 제목을 덮어씁니다.)

| `type`    | 기본 제목 | 아이콘 (lucide)     | 아이콘 색상         |
| --------- | --------- | ------------------- | ------------------- |
| `success` | `성공`    | `CheckCircleIcon`   | 초록색              |
| `info`    | `알림`    | `InfoIcon`          | 파란색              |
| `warning` | `경고`    | `AlertTriangleIcon` | 주황색(amber)       |
| `error`   | `오류`    | `AlertCircleIcon`   | 빨간색(destructive) |

:::note `type`을 주지 않으면
아이콘은 표시되지 않고, 제목은 `info`의 기본값인 **`알림`**이 사용됩니다. (`title`로 직접 지정 가능)
:::

:::info `type: 'error'`가 버튼 색까지 바꾸지는 않습니다
`type`은 **아이콘과 기본 제목**에만 영향을 줍니다. 확인 버튼은 항상 기본 색(primary), 취소 버튼은 항상 `outline`입니다.
삭제처럼 위험한 동작에서 확인 버튼까지 빨갛게 하고 싶다면 스킨(<span className="layer-shared">`src/shared/ui/overlay/AlertSkin.tsx`</span>)의 `<AlertDialogAction>`에 `variant="destructive"`를 주는 식으로 **프로젝트 차원에서** 바꾸면 됩니다. 호출 옵션으로는 지정할 수 없습니다.
(호출할 때마다 버튼 색을 다르게 하고 싶다면 `footer.confirmVariant`를 지원하는 [`$ui.dialog`](./dialog-ui)를 쓰세요.)
:::

---

## 닫힘 결과 (IDialogResult)

`onClose` 콜백으로 전달되는 결과 객체입니다. 반환값(`boolean`)만으로는 알 수 없는 **정확한 닫힘 경로**가 필요할 때 사용합니다.

| 필드        | 타입                                                            | 설명                                                               |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`        | `string`                                                        | 다이얼로그 고유값 (`id` 옵션으로 준 값, 없으면 자동 생성 UUID)     |
| `confirmed` | `boolean`                                                       | 확인 버튼으로 닫혔는지 여부 (반환값과 동일, `reason === 'confirm'`) |
| `reason`    | `'confirm' \| 'cancel' \| 'close' \| 'escape' \| 'autoDismiss'` | 닫힌 경로                                                          |

**`reason` 값**

| 값            | 닫힌 경로                                   | 반환값  |
| ------------- | ------------------------------------------- | :-----: |
| `confirm`     | **확인** 버튼 클릭                          | `true`  |
| `cancel`      | **취소** 버튼 클릭                          | `false` |
| `close`       | 우상단 **X** 버튼 클릭 (`close: true`일 때) | `false` |
| `escape`      | **ESC** 키                                  | `false` |
| `autoDismiss` | `autoDismiss` 시간 경과로 **자동 닫힘**     | `false` |

```ts
await $ui.confirm("이 페이지를 나가시겠습니까?", {
  type: "warning",
  close: true,
  onClose: (result) => {
    // 취소로 닫았는지 / ESC로 닫았는지까지 구분 가능
    if (result.reason === "cancel") console.log("취소 버튼");
    if (result.reason === "escape") console.log("ESC 키");
    if (result.reason === "close") console.log("X 버튼");
  },
});
```

:::note `onClose`는 `await` 재개보다 **먼저** 호출됩니다
닫기 처리 순서는 `onClose(result)` → `resolve(boolean)` 입니다. 즉 `onClose` 안의 코드가 `await $ui.confirm(...)` 다음 줄보다 먼저 실행됩니다.
`reason`이 필요 없다면 `onClose` 없이 반환값만 쓰는 편이 읽기 쉽습니다.
:::

:::note `cancel`은 confirm 전용
`$ui.confirm`에는 취소 버튼이 있으므로 `reason: 'cancel'`이 발생합니다.
확인 버튼만 있는 [`$ui.alert`](./alert-ui)에는 `cancel`이 없습니다. (`TDialogReason`의 나머지 값 — `overlay` · `submit` · `programmatic` · `route` · `error` — 는 [`$ui.dialog`](./dialog-ui) 전용입니다)
:::

---

## 버튼·키보드·포커스 동작

Radix `AlertDialog`(`role="alertdialog"`) 기반이므로, 일반 모달과 달리 **사용자가 반드시 선택하도록** 설계되어 있습니다.

| 조작                       | 동작                                                                             |
| -------------------------- | -------------------------------------------------------------------------------- |
| 다이얼로그가 열릴 때       | **'취소' 버튼에 자동으로 포커스**가 갑니다. (실수로 Enter 를 눌러도 안전)         |
| `Enter`                    | 포커스된 버튼이 눌립니다 → 열린 직후라면 **취소(`false`)**                       |
| `Tab` / `Shift+Tab`        | 다이얼로그 안에서만 순환합니다 (포커스 트랩)                                     |
| `ESC`                      | 닫힙니다 → `false` (`reason: 'escape'`)                                          |
| **딤 배경(오버레이) 클릭** | **닫히지 않습니다.** Radix `AlertDialog`가 외부 클릭 닫힘을 막습니다              |
| 버튼 배치                  | 모바일: 세로 배치(**확인이 위**) / `sm` 이상: 우측 정렬 가로 배치(취소 → 확인)    |

:::warning 배경을 클릭해도 닫히지 않습니다
`$ui.confirm` · `$ui.alert`는 딤 배경 클릭으로 닫히지 않습니다. 사용자가 선택을 건너뛰지 못하게 하려는 의도된 동작입니다.
배경 클릭으로 닫혀야 하는 일반 모달이 필요하면 [`$ui.dialog`](./dialog-ui)를 사용하세요. (`$ui.dialog`에는 `reason: 'overlay'`가 있습니다)
:::

:::caution 확인 버튼에 "처리 중" 표시를 붙일 수 없습니다
`$ui.confirm`은 버튼을 누른 즉시 닫힙니다. 로딩 스피너·버튼 비활성 같은 상태를 다이얼로그 안에서 보여줄 수 없습니다.
확인 후 서버 처리에 시간이 걸린다면 다음 중 하나를 쓰세요.

1. confirm 으로 의사만 확인하고, **닫힌 뒤** 화면에서 로딩을 표시한다 (가장 흔한 패턴)
2. 다이얼로그 안에서 로딩·검증까지 다뤄야 한다면 [`$ui.dialog`](./dialog-ui)를 쓴다 (`useDialog()`의 `setLoading()` · `setConfirmDisabled()`, 옵션 `beforeClose` 지원)
   :::

:::note `message` 없이 `title`만 주면 콘솔 경고가 납니다
본문(`message`)이 없으면 설명 요소(`AlertDialogDescription`)가 그려지지 않아, Radix 가 접근성 경고를 콘솔에 출력합니다.
확인창은 "무엇을 확인하는지"가 본문에 있어야 하므로 **`message`는 항상 채우는 것을 권장**합니다.
:::

---

## 다이얼로그 큐 (동시 호출)

`$ui.confirm`/`$ui.alert`는 **하나의 FIFO 큐**를 공유합니다. 여러 번 연속 호출해도 다이얼로그가 겹쳐 뜨지 않고 **하나씩** 순서대로 표시됩니다. 앞의 다이얼로그를 닫아야 다음 것이 나타납니다. (닫힘 애니메이션 150ms 뒤에 큐에서 제거되므로 다음 다이얼로그가 자연스럽게 이어집니다)

```ts
// 순차 확인 — 앞 단계를 확인해야 다음 단계로
const a = await $ui.confirm("1단계를 진행할까요?");
if (a) {
  const b = await $ui.confirm("2단계도 진행할까요?");
  // ...
}

// await 없이 연속 호출해도 겹치지 않고 큐에 쌓인다
$ui.confirm("첫 번째 확인"); // 먼저 표시
$ui.confirm("두 번째 확인"); // 첫 번째를 닫으면 이어서 표시
```

:::note `$ui.dialog`와의 겹침 순서
`$ui.confirm`/`$ui.alert`는 `$ui.dialog` 스택보다 **항상 위**에 뜹니다. (z-index: `$ui.dialog` 100000+ < alert/confirm 100500 < 토스트 100600 — `src/shared/ui/overlay/overlay-layers.ts`)
따라서 `$ui.dialog` 안에서 `$ui.confirm('닫으면 입력이 사라집니다. 계속할까요?')` 같은 확인창을 띄워도 dialog 에 가려지지 않습니다.
:::

---

## 활용 예시

```ts
// 1) 삭제 확인 후 실행 (예제 앱의 DeleteConfirmCard 와 동일한 패턴)
async function onDelete(row: IFileRow) {
  const ok = await $ui.confirm({
    type: "error",
    title: "파일 삭제",
    message: `'${row.name}' 을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    confirmText: "삭제",
    cancelText: "취소",
  });
  if (!ok) return;

  await deleteFile(row.id);
  await $ui.alert({ type: "success", message: "삭제되었습니다.", autoDismiss: 1400 });
}

// 2) 저장하지 않은 변경사항 이탈 방지
async function onLeave() {
  if (!isDirty) return $router.back();
  const ok = await $ui.confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?", {
    type: "warning",
    confirmText: "나가기",
    cancelText: "계속 편집",
  });
  if (ok) $router.back();
}

// 3) 로그아웃 확인
async function onLogout() {
  if (await $ui.confirm("로그아웃하시겠습니까?")) {
    await logout();
    $router.replace("/login");
  }
}

// 4) 확인/취소 각각에 다른 후속 알림
async function onSave() {
  const ok = await $ui.confirm({
    type: "warning",
    message: "변경 내용을 저장할까요?",
    confirmText: "저장",
  });
  if (ok) {
    await saveData();
    await $ui.alert({ type: "success", message: "저장되었습니다.", autoDismiss: 1400 });
  } else {
    await $ui.alert("저장을 취소했습니다.");
  }
}
```

:::tip 버튼만 읽어도 무슨 일이 일어날지 알게
`confirmText`/`cancelText`를 동작 이름으로 바꾸면 오조작이 크게 줄어듭니다.
`확인 / 취소` → **`삭제 / 유지`**, **`나가기 / 계속 편집`**, **`로그아웃 / 계속 사용`**
:::

---

:::info 요약
| 항목 | 값 |
| --- | --- |
| 시그니처 | `$ui.confirm(message?, option?)` |
| 반환 | `Promise<boolean>` — 확인=`true`, 그 외(취소·X·ESC·자동닫힘)=`false` |
| 버튼 | 확인 · 취소 2개 (`confirmText` · `cancelText`로 문구 변경) |
| 주요 옵션 | `type` · `title` · `message` · `confirmText` · `cancelText` · `icon` · `close` · `autoDismiss` · `onClose` · `id` |
| 배경 클릭 | 닫히지 않음 (ESC 는 닫힘 → `false`) |
| 초기 포커스 | 취소 버튼 |
| 단순 알림만 필요 시 | [`$ui.alert`](./alert-ui) |
| 임의 컴포넌트·폼·로딩이 필요 시 | [`$ui.dialog`](./dialog-ui) |
| 타입 정의 | `IConfirmDialogOption` · `IDialogResult` (`src/types/components`) |
:::
