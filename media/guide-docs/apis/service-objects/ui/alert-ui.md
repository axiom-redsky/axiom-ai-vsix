---
sidebar_position: 1
displayed_sidebar: "apiDocSidebar"
title: "⋮ $ui.alert"
---

# $ui.alert

`react-app-scaffold`에서 전역으로 제공하는 **알림 다이얼로그** 함수입니다.
사용자에게 안내 메시지를 보여주고, 사용자가 다이얼로그를 닫을 때까지 기다릴 수 있습니다.

- 브라우저 기본 `window.alert()`를 대체하는 함수로, 앱의 디자인(shadcn `AlertDialog`)이 적용된 다이얼로그를 띄웁니다.
- React 컴포넌트 밖(이벤트 핸들러 · 유틸 · API 인터셉터 등)에서도 **훅 없이** 사용할 수 있습니다.
- 별도의 `import` 없이 전역 객체 `$ui`로 바로 사용합니다.
- **`Promise<void>`를 반환**하므로 `await`로 "사용자가 닫을 때까지" 기다렸다가 다음 로직을 이어갈 수 있습니다.

```ts
// 사용 형태
$ui.alert("저장되었습니다."); // 메시지만
$ui.alert("삭제되었습니다.", { type: "success" }); // 메시지 + 옵션
$ui.alert({ title: "안내", message: "처리 완료" }); // 옵션 객체만

// 닫힐 때까지 기다리기
await $ui.alert("먼저 확인해 주세요.");
// ↑ 사용자가 '확인'을 누른 뒤 여기부터 실행
```

:::tip 인자 오버로드
`$ui.alert`는 첫 번째 인자를 **문자열** 또는 **옵션 객체** 두 가지로 받을 수 있습니다.

- 첫 인자가 문자열이면 → 본문 메시지로 사용됩니다.
- 첫 인자가 옵션 객체이면 → 그 객체가 전체 옵션이 됩니다.
- 두 인자를 함께 주면 → 두 값이 병합되며, **두 번째 인자(옵션 객체)가 우선**합니다.
  :::

<details>
<summary><b>프론트엔드 Core 코드 관리자(공통 개발자)를 위한 `$ui.alert` 실행 흐름 이해</b> — 펼쳐보기</summary>

> 화면에서 `await $ui.alert(...)` 를 호출했을 때 파일이 읽히는 순서.
> `$ui.confirm` 도 같은 경로를 탄다 (`kind` 값만 다르다).

```ts
await $ui.alert({ type: "success", message: "저장되었습니다." });
```

---

- **0단계** — 부팅 (앱 실행 시 미리 처리)

1. **`src/main.tsx:16`** — `registerWindowUI()` 호출
2. **`src/core/ui/index.ts:121`** — `window.$ui` 에 `alert`/`confirm`/`dialog` 를 심는다 (조립은 같은 파일 `98`행 `createWindowUI()`)
3. **`src/core/providers/AppProviders.tsx:27`** → **`src/core/ui/UIHosts.tsx:21`** — `<UIAlertHost />` 를 앱에 딱 한 번 마운트
4. **`src/core/ui/alert/UIAlertHost.tsx:14`** — 큐가 비어 있어 `null` 반환. **아무것도 안 그리고 대기**

---

- **1단계** — 호출 (동기)

5. **`src/core/ui/index.ts:100`** — Promise 를 만들고 `resolve` 를 밖으로 캡처
6. **`src/core/ui/index.ts:45`** 의 `normalize()` — `'문자열'` 과 `{ 옵션 }` 두 호출 형태를 하나로 병합 (`47`행: 두 번째 인자가 우선)
7. **`src/core/ui/createId.ts:12`** — `id` 가 없으면 UUID 부여
8. **`src/core/ui/alert/alertStore.ts:26`** — `{ kind, option, resolve }` 를 **FIFO 큐 맨 뒤**에 넣는다
9. 호출부는 `await` 에서 **정지**

---

- **2단계** — 렌더

10. **`src/core/ui/alert/useAlertFrame.ts:25`** — 큐 구독이 변화를 감지해 호스트를 리렌더
11. **`src/core/ui/alert/useAlertFrame.ts:39`** — `setOpen(true)` 로 두 번째 리렌더 (열림 애니메이션용)
12. **`src/core/ui/alert/useAlertFrame.ts:85`** — **동작**만 담은 `frame` 반환 (열림 상태 · z-index · **초기 포커스 배선** · 아이콘 표시 여부 · 닫기 함수 3종)
13. **`src/core/ui/alert/UIAlertHost.tsx:17`** — `<AlertSkin frame={frame} />` ← **core → shared 경계**
14. **`src/shared/ui/overlay/AlertSkin.tsx:45`** — **모양**. 아이콘·색상·문구를 정하고 Radix(**`src/shared/lib/shadcn/ui/alert-dialog.tsx`**)로 DOM 을 그린다

---

- **3단계** — 닫기

15. 확인 버튼 · ESC · X · autoDismiss — **네 경로 모두** `closeWith(reason)`(**`src/core/ui/alert/useAlertFrame.ts:52`**) 하나로 모인다
16. `closeWith` 내부 순서
    1. 중복 진입 차단(`55`행) — 정산은 정확히 1회
    2. `onClose` 콜백 호출(`60`행)
    3. **`resolve()`**(`63`행) ← 5번의 Promise 가 풀리고 화면 코드의 `await` 가 재개된다
    4. `setOpen(false)`(`66`행) — 닫힘 애니메이션 시작
    5. 150ms(**`src/shared/ui/overlay/overlay-layers.ts:34`**) 뒤 `dequeue()` — 큐에서 제거
17. 큐에 다음 항목이 있으면 10번으로 되돌아간다

> **3번(정산)과 5번(큐 제거)을 분리한 게 핵심.** 바로 제거하면 닫힘 애니메이션이 잘린다.
> 확인 버튼을 누르면 Radix 가 뒤이어 `onOpenChange(false)`(`92`행)까지 호출하지만, 1번의 중복 가드가 막으므로 `reason` 이 `escape` 로 덮어써지지 않는다.

---

- **요약**

```text
화면 코드
  ↓ $ui.alert(...)
index.ts        Promise 생성 · 옵션 병합
  ↓
createId.ts     id 부여
  ↓
alertStore.ts   큐에 넣기 ──── 호출부는 await 로 정지
  ↓ (구독)
useAlertFrame   동작 계산
  ↓
UIAlertHost     core → shared 경계
  ↓
AlertSkin       모양 (Radix DOM)

닫기 → closeWith() → resolve()로 await 재개 → 150ms 뒤 큐에서 제거
```

**입구(`index.ts`) → 상태(`alertStore`) → 동작(`useAlertFrame`) → 모양(`AlertSkin`)** 네 단계.

<span className="layer-core">● **core**</span> = 동작·상태 레이어 · <span className="layer-shared">● **shared**</span> = 모양(공용 UI) 레이어

| 고치고 싶은 것            | 열 파일                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 디자인 (아이콘·색상·버튼) | <span className="layer-shared">**`src/shared/ui/overlay/AlertSkin.tsx`**</span>     |
| z-index·애니메이션 길이   | <span className="layer-shared">**`src/shared/ui/overlay/overlay-layers.ts`**</span> |
| 동작 (닫기·정산·자동닫힘) | <span className="layer-core">**`src/core/ui/alert/useAlertFrame.ts`**</span>        |
| 호출 API·옵션             | <span className="layer-core">**`src/core/ui/index.ts`**</span>                      |
| 큐 정책                   | <span className="layer-core">**`src/core/ui/alert/alertStore.ts`**</span>           |

</details>

---

## alert()

알림 다이얼로그를 큐에 넣고, 사용자가 닫으면 resolve 되는 `Promise`를 반환합니다.

| 인자      | 타입                           | 필수 | 기본값 | 설명                                                                                                                      |
| --------- | ------------------------------ | :--: | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `message` | `string \| IAlertDialogOption` |      |        | 본문 메시지 문자열, 또는 옵션 객체                                                                                        |
| `option`  | `IAlertDialogOption`           |      |        | 옵션 객체. `message`와 함께 넘기면 이 값이 우선 병합됨. 상세는 [옵션 (IAlertDialogOption)](#옵션-ialertdialogoption) 참고 |

- **반환** : `Promise<void>` — 사용자가 다이얼로그를 닫으면(확인·X·ESC·자동 닫힘) resolve 됩니다.

```ts
// 1) 가장 단순한 사용
$ui.alert("저장이 완료되었습니다.");

// 2) 타입(색상·아이콘) 지정
$ui.alert("네트워크 오류가 발생했습니다.", { type: "error" });

// 3) 제목 + 본문 직접 지정
$ui.alert({
  title: "결제 안내",
  message: "결제가 정상 처리되었습니다.",
  type: "success",
});

// 4) 닫힐 때까지 기다린 뒤 다음 화면으로 이동
async function onSaved() {
  await $ui.alert("저장되었습니다.");
  $router.replace("/list");
}
```

:::info 왜 `Promise`를 반환하나요?
`window.alert()`는 코드를 멈추지만(동기), `$ui.alert`는 화면을 멈추지 않는 **비동기** 다이얼로그입니다.
"사용자가 닫은 뒤에" 무언가를 실행하려면 `await`를 붙이거나 `.then()`으로 이어서 처리하세요.
:::

---

## 옵션 (IAlertDialogOption)

`alert(message, option)`에 넘기는 옵션 객체입니다.

| 옵션          | 타입                                          | 기본값                | 설명                                                                                                                                                            |
| ------------- | --------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | `string`                                      | —                     | 본문 메시지. (첫 인자를 옵션 객체로 줄 때 여기에 넣습니다)                                                                                                      |
| `title`       | `string`                                      | `type`별 기본 제목    | 제목. 미지정 시 아래 [기본 제목](#type-별-기본-제목아이콘) 표의 값이 쓰입니다.                                                                                  |
| `type`        | `'success' \| 'info' \| 'warning' \| 'error'` | —                     | 다이얼로그 종류. 지정 시 **아이콘·색상·기본 제목**이 함께 적용됩니다.                                                                                           |
| `icon`        | `boolean`                                     | `type` 지정 시 `true` | 아이콘 표시 여부. 기본은 숨김이며 `type`을 주면 자동 표시됩니다. `icon: true`(type 없이 강제 표시) / `icon: false`(type 있어도 강제 숨김)로 덮어쓸 수 있습니다. |
| `close`       | `boolean`                                     | `false`               | 우상단 **X(닫기) 버튼** 표시 여부.                                                                                                                              |
| `confirmText` | `string`                                      | `'확인'`              | 확인 버튼 문구.                                                                                                                                                 |
| `autoDismiss` | `number`                                      | —                     | 지정 시 **N밀리초(ms)** 후 자동으로 닫힙니다.                                                                                                                   |
| `onClose`     | `(result: IDialogResult) => void`             | —                     | 닫힌 뒤 호출되는 콜백. 어떤 경로로 닫혔는지 등 상세 정보를 받습니다. 상세는 [닫힘 결과 (IDialogResult)](#닫힘-결과-idialogresult) 참고                          |
| `id`          | `string`                                      | 자동 생성             | 다이얼로그 고유 식별자. 미지정 시 `crypto.randomUUID()`로 자동 부여됩니다.                                                                                      |

```ts
// 아이콘 + 자동 닫힘 (토스트처럼 3초 뒤 사라짐)
$ui.alert("임시 저장되었습니다.", { type: "info", autoDismiss: 3000 });

// X 버튼 + 확인 문구 변경
$ui.alert("안내 사항을 확인하세요.", {
  close: true,
  confirmText: "알겠습니다",
});

// type 없이 아이콘만 강제 표시
$ui.alert("처리되었습니다.", { icon: true });
```

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
`type`은 **아이콘과 기본 제목**에만 영향을 줍니다. 확인 버튼은 어떤 `type`에서도 항상 기본 색(primary)입니다.
버튼 색까지 바꾸려면 스킨(<span className="layer-shared">`src/shared/ui/overlay/AlertSkin.tsx`</span>)의 `<AlertDialogAction>`을 고쳐 **프로젝트 차원에서** 바꿔야 합니다. 호출 옵션으로는 지정할 수 없습니다.
:::

:::note `message` 없이 `title`만 주면 콘솔 경고가 납니다
본문(`message`)이 없으면 설명 요소(`AlertDialogDescription`)가 그려지지 않아, Radix 가 접근성 경고를 콘솔에 출력합니다. **`message`는 항상 채우는 것을 권장**합니다.
:::

---

## 닫힘 결과 (IDialogResult)

`onClose` 콜백으로 전달되는 결과 객체입니다. 다이얼로그가 **어떤 경로로 닫혔는지** 알 수 있습니다.

| 필드        | 타입                                                | 설명                                                 |
| ----------- | --------------------------------------------------- | ---------------------------------------------------- |
| `id`        | `string`                                            | 다이얼로그 고유값                                    |
| `confirmed` | `boolean`                                           | 확인 버튼으로 닫혔는지 여부 (`reason === 'confirm'`) |
| `reason`    | `'confirm' \| 'close' \| 'escape' \| 'autoDismiss'` | 닫힌 경로                                            |

**`reason` 값**

| 값            | 닫힌 경로                                   |
| ------------- | ------------------------------------------- |
| `confirm`     | **확인** 버튼 클릭                          |
| `close`       | 우상단 **X** 버튼 클릭 (`close: true`일 때) |
| `escape`      | **ESC** 키                                  |
| `autoDismiss` | `autoDismiss` 시간 경과로 **자동 닫힘**     |

:::warning 딤 배경을 클릭해도 닫히지 않습니다
`reason: 'escape'`는 **ESC 키 전용**입니다. `$ui.alert`/`$ui.confirm`은 Radix `AlertDialog` 기반이라 **딤 배경(오버레이) 클릭으로는 닫히지 않습니다.** 사용자가 안내를 건너뛰지 못하게 하려는 의도된 동작입니다.
배경 클릭으로 닫혀야 하는 일반 모달이 필요하면 [`$ui.dialog`](./dialog-ui)를 사용하세요. (`$ui.dialog`에는 `reason: 'overlay'`가 따로 있습니다)
:::

```ts
$ui.alert("로그아웃되었습니다.", {
  type: "info",
  close: true,
  onClose: (result) => {
    console.log(result.reason); // 'confirm' | 'close' | 'escape' | ...
    console.log(result.confirmed); // 확인으로 닫았으면 true
  },
});
```

:::note `confirm`(취소 없음)만 있는 이유
`$ui.alert`는 **확인 버튼만** 있는 단순 알림입니다. 확인/취소 두 버튼이 필요하다면 [`$ui.confirm`](./confirm-ui)을 사용하세요.
:::

---

## 버튼·키보드·포커스 동작

Radix `AlertDialog`(`role="alertdialog"`) 기반이라 일반 모달과 동작이 다릅니다.

| 조작                       | 동작                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| 다이얼로그가 열릴 때       | **확인 버튼에 자동으로 포커스**가 갑니다                             |
| `Enter`                    | 포커스된 확인 버튼이 눌려 알림이 닫힙니다                            |
| `Tab` / `Shift+Tab`        | 다이얼로그 안에서만 순환합니다 (포커스 트랩)                         |
| `ESC`                      | 닫힙니다 (`reason: 'escape'`)                                        |
| **딤 배경(오버레이) 클릭** | **닫히지 않습니다.** Radix `AlertDialog`가 외부 클릭 닫힘을 막습니다 |
| 버튼 배치                  | 확인 버튼 1개. 모바일은 가로 전체, `sm` 이상은 우측 정렬             |

:::info 초기 포커스는 core 가 배선합니다
Radix `AlertDialog`는 열릴 때 **취소 버튼**에 포커스를 주도록 만들어져 있습니다. 그런데 `$ui.alert`에는 취소 버튼이 없어(스킨은 `kind === 'confirm'`일 때만 그립니다) 그대로 두면 **포커스가 알림을 띄운 트리거 버튼에 남아, 알림이 뜬 직후 Enter 로 그 버튼이 다시 눌리는** 문제가 생깁니다.

그래서 <span className="layer-core">`src/core/ui/alert/useAlertFrame.ts`</span>가 alert 일 때만 확인 버튼으로 초기 포커스를 옮기는 `onOpenAutoFocus` 를 `frame.contentProps` 에 담아 줍니다. 스킨이 `{...frame.contentProps}` 를 스프레드하기만 하면 자동으로 적용됩니다.

**스킨을 새로 만들 때 `{...frame.contentProps}` 스프레드를 빼면 이 문제가 되살아납니다.** (z-index 도 함께 빠집니다)
:::

:::note `$ui.confirm`의 초기 포커스는 '취소'입니다
확인/취소 두 버튼이 있는 [`$ui.confirm`](./confirm-ui)은 Radix 기본 동작대로 **취소 버튼**에 포커스가 갑니다. 파괴적인 동작의 기본값이 '취소'여야 하므로 의도된 차이입니다.
:::

---

## 다이얼로그 큐 (동시 호출)

`$ui.alert`를 **여러 번 연속 호출**하면, 다이얼로그가 겹쳐 뜨지 않고 **큐(FIFO)에 쌓여 하나씩** 순서대로 표시됩니다. 앞의 다이얼로그를 닫아야 다음 것이 나타납니다.

```ts
$ui.alert("첫 번째 안내");
$ui.alert("두 번째 안내");
// → '첫 번째 안내'를 닫으면 '두 번째 안내'가 이어서 표시됨
```

---

## 활용 예시

```ts
// 1) 저장 완료 후 목록으로 이동 (닫힐 때까지 대기)
async function onSave() {
  await saveData();
  await $ui.alert("저장되었습니다.", { type: "success" });
  $router.replace("/list");
}

// 2) API 인터셉터에서 전역 에러 알림
async function onApiError(message: string) {
  await $ui.alert(message, { type: "error", title: "요청 실패" });
}

// 3) 토스트처럼 잠깐 떴다가 사라지는 안내
$ui.alert("클립보드에 복사되었습니다.", { type: "info", autoDismiss: 2000 });
```

:::info 요약
| 항목 | 값 |
| --- | --- |
| 시그니처 | `$ui.alert(message?, option?)` |
| 반환 | `Promise<void>` (닫힐 때 resolve) |
| 버튼 | 확인 1개 (`confirmText`로 문구 변경) |
| 주요 옵션 | `type` · `title` · `message` · `icon` · `close` · `autoDismiss` · `onClose` · `id` |
| 배경 클릭 | 닫히지 않음 (ESC 는 닫힘) |
| 초기 포커스 | 확인 버튼 (Enter 로 바로 닫힘) |
| 확인/취소 필요 시 | [`$ui.confirm`](./confirm-ui) 사용 |
| 임의 컴포넌트·폼·로딩이 필요 시 | [`$ui.dialog`](./dialog-ui) 사용 |
| 타입 정의 | `IAlertDialogOption` · `IDialogResult` (`src/types/components`) |
:::
