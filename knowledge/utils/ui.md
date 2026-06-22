---
title: 전역 UI $ui (alert / confirm 다이얼로그)
version: "1.0"
tags: [$ui, window.$ui, 전역ui, 글로벌ui, ui 객체, ui객체, ui 유틸, ui유틸, ui util, uiutil,
       alert, 얼럿, 알림, 알림창, 알림팝업, 경고창, 메시지박스,
       confirm, 컨펌, 확인, 확인창, 확인팝업, 확인취소, 예아니오, yesno,
       다이얼로그, dialog, 모달, modal, 팝업, popup,
       window.alert, window.confirm, windowalert, windowconfirm, 브라우저알림, 네이티브알림,
       $ui.alert, $ui.confirm, autodismiss, 자동닫힘, 토스트, onclose, 콜백,
       success, info, warning, error, 성공, 정보, 경고, 오류, 예제, 사용법, 사용예]
scope: scaffold
related: [utils/util.md, patterns/router.md, components/Dialog.md, catalog/overview.md]
---

# 전역 UI $ui — alert / confirm 다이얼로그

react-app-scaffold는 알림(alert)·확인(confirm) 다이얼로그를 **전역 `$ui`** 로 제공한다. `$util`·`$router`와 동일하게 **import 없이** 어디서나 쓸 수 있다(전역 등록은 `main.tsx`의 `registerWindowUI()`가 1회 수행, 화면 렌더는 `AppProviders`의 `<UIDialogHost />`가 담당). 타입은 `@/types/components`의 `IUI`.

> ✅ **브라우저 기본 `window.alert()` / `window.confirm()` 대신 `$ui.alert()` / `$ui.confirm()` 를 쓰는 것이 스캐폴드 컨벤션이다.** 디자인 토큰·다크모드가 적용된 shadcn AlertDialog로 렌더되고, 메인 스레드를 막지 않으며(non-blocking), `Promise`로 결과를 받을 수 있다. (`window.alert`/`window.confirm` 비교는 맨 아래 참고)

```ts
// import 불필요 — 전역으로 바로 사용
await $ui.alert('저장되었습니다.');                 // 알림 → Promise<void>
const ok = await $ui.confirm('정말 삭제할까요?');   // 확인/취소 → Promise<boolean>
if (ok) {
  // '확인'을 눌렀을 때만 실행
}
```

- 구현 위치: `src/core/ui/{index.ts, store.ts, UIDialogHost.tsx}` (`createWindowUI()`로 조립, zustand 큐 기반)
- 루트 타입: `IUI { alert: TAlertDialog; confirm: TConfirmDialog }`
- `alert`는 `Promise<void>`, `confirm`은 `Promise<boolean>`(확인=`true`, 그 외 취소/X/ESC/autoDismiss=`false`)을 resolve 한다.
- 여러 번 호출하면 **FIFO 큐**에 쌓여 한 번에 하나씩 순서대로 표시된다.

## $ui.alert — 알림 다이얼로그

```ts
// 1) 가장 단순한 형태 — 메시지 문자열
await $ui.alert('저장이 완료되었습니다.');

// 2) type 지정 → 아이콘·색상·기본 제목 자동(success/info/warning/error)
await $ui.alert('정상 처리되었습니다.', { type: 'success' }); // 제목 기본값 "성공"
await $ui.alert('권한이 없습니다.', { type: 'error' });       // 제목 기본값 "오류"

// 3) 옵션 객체만 전달(첫 인자를 객체로)
await $ui.alert({
  type: 'warning',
  title: '용량 초과',
  message: '첨부 파일은 10MB 이하만 가능합니다.',
  confirmText: '알겠어요',
  close: true,        // 우상단 X(닫기) 버튼 표시
});

// 4) 토스트처럼 N(ms) 뒤 자동 닫힘
await $ui.alert('클립보드에 복사했습니다.', { type: 'info', autoDismiss: 1500 });

// 5) 닫힘 경로(reason)까지 알고 싶을 때 — onClose 콜백
await $ui.alert('알림', {
  onClose: (result) => {
    // result: { id, confirmed, reason }  reason: 'confirm' | 'close' | 'escape' | 'autoDismiss'
    console.log('닫힘 경로:', result.reason);
  },
});
```

## $ui.confirm — 확인/취소 다이얼로그

`confirm`은 `await` 한 boolean으로 분기한다. 확인 버튼만 `true`, 취소·X·ESC·autoDismiss는 모두 `false`.

```ts
// 1) 기본 확인/취소
const ok = await $ui.confirm('변경 사항을 저장할까요?');
if (ok) await save();

// 2) 버튼 문구·타입 커스터마이즈
const remove = await $ui.confirm({
  type: 'error',
  title: '삭제 확인',
  message: '삭제하면 되돌릴 수 없습니다. 계속할까요?',
  confirmText: '삭제',
  cancelText: '취소',
});
if (remove) await deleteItem();

// 3) useApi mutation 등과 결합
const proceed = await $ui.confirm('등록을 진행할까요?');
if (proceed) {
  mutate(payload, {
    onSuccess: async () => {
      await $ui.alert('등록되었습니다.', { type: 'success', autoDismiss: 1200 });
    },
  });
}
```

## 옵션 (IAlertDialogOption / IConfirmDialogOption)

```ts
/** $ui.alert 옵션 */
interface IAlertDialogOption {
  id?: string;                 // 고유 식별자(미지정 시 자동 생성)
  type?: 'success' | 'info' | 'warning' | 'error'; // 아이콘·색상·기본 제목
  icon?: boolean;              // 아이콘 강제 표시(true)/숨김(false). 기본은 type 지정 시에만 표시
  close?: boolean;             // 우상단 X(닫기) 버튼 표시 (기본 false)
  message?: string;            // 본문(첫 인자를 옵션객체로 줄 때 사용)
  title?: string;              // 제목(기본: type별 기본 제목)
  autoDismiss?: number;        // 지정 시 N(ms) 후 자동 닫힘
  confirmText?: string;        // 확인 버튼 문구(기본 '확인')
  onClose?: (result: IDialogResult) => void; // 닫힘 상세 콜백(opt-in)
}

/** $ui.confirm 옵션 (alert 옵션 + cancelText) */
interface IConfirmDialogOption extends IAlertDialogOption {
  cancelText?: string;         // 취소 버튼 문구(기본 '취소')
}

/** onClose 로 전달되는 결과 */
interface IDialogResult {
  id: string;
  confirmed: boolean;          // reason === 'confirm' 여부
  reason: 'confirm' | 'cancel' | 'close' | 'escape' | 'autoDismiss';
}
```

- `type`을 주면 아이콘(success=체크/info=ℹ/warning=⚠/error=⊘)과 기본 제목이 자동 적용된다. `type` 없이 메시지만 주면 아이콘 없는 단순 알림이다.
- 인자 오버로드: `$ui.alert('메시지')`, `$ui.alert({ ...옵션 })`, `$ui.alert('메시지', { ...옵션 })` 모두 가능(두 번째 인자가 우선 병합).

## 참고 — window.alert / window.confirm (브라우저 기본)

브라우저 네이티브 다이얼로그도 그대로 호출할 수 있지만, **스캐폴드에서는 위 `$ui`를 권장한다.**

```ts
// 브라우저 기본(동기·블로킹) — 스타일 커스터마이즈 불가, 메인 스레드 차단
window.alert('저장되었습니다.');           // 반환값 없음(동기)
const ok = window.confirm('삭제할까요?');   // boolean 즉시 반환(동기 블로킹)
if (ok) { /* ... */ }
```

| 구분 | `$ui.alert` / `$ui.confirm` (권장) | `window.alert` / `window.confirm` |
|------|-----------------------------------|-----------------------------------|
| 반환 | `Promise<void>` / `Promise<boolean>` (`await`) | 없음 / `boolean` (동기) |
| 동작 | non-blocking(메인 스레드 안 막음) | blocking(스레드 차단) |
| 스타일 | 디자인 토큰·다크모드·아이콘·버튼 문구 커스터마이즈 | 브라우저 기본(커스터마이즈 불가) |
| 큐잉 | 여러 호출을 FIFO 큐로 순서 표시 | 즉시 모달, 큐 없음 |
| 권장도 | ✅ 업무 코드 표준 | ⛔ 디버깅·임시 용도로만 |
