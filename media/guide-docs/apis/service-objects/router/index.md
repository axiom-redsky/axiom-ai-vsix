---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $router'
---

# $router

`react-app-scaffold`에서 전역으로 제공하는 **라우터(Router) 객체**입니다.
페이지 이동(`push`·`replace`·`back` 등)과 현재 위치·파라미터·state 조회 같이 업무 화면에서 자주 쓰이는 라우팅 기능을 제공합니다.

* 내부적으로 [react-router](https://reactrouter.com/)의 **DataRouter 인스턴스**(`createHashRouter`)를 감싸 만든 객체입니다.
* React 컴포넌트 밖(이벤트 핸들러 · 유틸 · API 인터셉터 등)에서도 **훅 없이** 라우팅을 다룰 수 있습니다.
* 별도의 `import` 없이 전역 객체 `$router`로 바로 사용합니다.

```ts
// 사용 형태
$router.push('/account/usage-history');           // 페이지 이동
$router.replace('/main');                          // 현재 화면 교체 이동
$router.back();                                    // 뒤로가기
$router.getLocation();                             // 현재 위치 조회
$router.getState<{ accountNo: string }>();         // 전달된 state 조회
```

:::warning `getXxx()` 는 비-반응형 스냅샷
`getLocation()` · `getState()` · `getSearchParams()` · `getParams()` · `getRouteName()` 등 **조회 계열 메서드**는 호출하는 **순간의 최신 값**을 돌려줍니다.
값을 변수에 저장해두면 이후 이동에는 갱신되지 않으므로 **필요할 때마다 다시 호출**하세요.
마운트된 컴포넌트가 URL 변화에 **자동으로 리렌더**돼야 한다면 react-router의 `useLocation()` · `useParams()` 훅을 사용합니다.
:::

:::tip 자주 쓰는 인자 타입
* **`To`** — 이동할 경로. 문자열(`'/account/main'`) 또는 `{ pathname, search, hash }` 부분 객체.
* **`NavigateOptions`** — 이동 옵션 객체. `state`(전달 데이터), `replace`(히스토리 교체), `preventScrollReset`(스크롤 유지), `relative`(상대경로 기준).
* **`Location`** — 현재 위치 정보. `{ pathname, search, hash, state, key }`.
* 이 프로젝트는 **해시 라우터**를 사용하므로 실제 URL은 `...#/account/main` 형태입니다.
:::

---

## push()

지정한 경로로 이동합니다. **브라우저 히스토리 스택에 새 항목을 추가**하며 이동합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `to` | `To` | ✓ | | 이동할 경로 |
| `options` | `NavigateOptions` | | | 이동 옵션. 상세는 [옵션 (NavigateOptions)](#옵션-navigateoptions) 참고 |

* **반환** : `void`

```ts
// 단순 이동
$router.push('/account/usage-history');

// state 를 함께 전달하며 이동
$router.push('/account/usage-history', {
  state: { accountNo: '123-456-789', period: '3M' },
});
```

:::note push 후 히스토리 스택
```ts
// '/account/main' 에서 push('/account/usage-history') 실행 시
['/account/main', '/account/usage-history']
```
:::

---

## replace()

현재 항목을 **교체하며** 이동합니다. 히스토리 스택에 새 항목을 쌓지 않으므로, 이동 후 **뒤로가기 시 현재 화면으로 돌아오지 않습니다.**

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `to` | `To` | ✓ | | 이동할 경로 |
| `options` | `NavigateOptions` | | | 이동 옵션. `replace: true` 가 항상 자동 적용됨. 상세는 [옵션 (NavigateOptions)](#옵션-navigateoptions) 참고 |

* **반환** : `void`

```ts
// 로그인 성공 후 메인으로 이동 (로그인 화면은 히스토리에서 제거)
$router.replace('/main');
```

:::info push vs replace
* **뒤로가기로 돌아와도 되는 경우** → `$router.push()`
* **돌아오면 안 되는 경우**(로그인 완료, 결제 완료 등) → `$router.replace()`
```ts
// '/login' 에서 replace('/main') 실행 시 → '/login' 은 삭제됨
['/main']
```
:::

---

## 옵션 (NavigateOptions)

`push(to, options)` · `replace(to, options)`의 **두 번째 인자**로 넘기는 옵션 객체입니다. react-router의 `NavigateOptions` 타입을 그대로 사용합니다.

| 옵션 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `state` | `any` | — | 다음 화면으로 전달할 **데이터**. URL에 노출되지 않으며, 이동한 화면에서 [`$router.getState()`](#getstate)로 조회합니다. |
| `replace` | `boolean` | `false` | `true`면 히스토리에 추가하지 않고 현재 항목을 **교체**합니다. `push`에서만 의미가 있으며, `replace()`는 이 값을 항상 `true`로 강제합니다. |
| `preventScrollReset` | `boolean` | `false` | `true`면 이동 후 스크롤 위치를 맨 위로 초기화하지 않고 **현재 위치를 유지**합니다. (`<ScrollRestoration>` 사용 시 적용) |
| `relative` | `'route' \| 'path'` | `'route'` | 상대 경로(`'..'`)의 해석 기준. `'route'`는 라우트 계층 기준, `'path'`는 URL 경로 세그먼트 기준입니다. |
| `viewTransition` | `boolean` | `false` | `true`면 이동에 [View Transition API](https://developer.mozilla.org/docs/Web/API/View_Transitions_API)를 적용해 전환 애니메이션을 활성화합니다. |
| `flushSync` | `boolean` | `false` | `true`면 이동에 따른 상태 업데이트를 `React.startTransition` 대신 `ReactDOM.flushSync`로 **동기 처리**합니다. |

```ts
// state 전달
$router.push('/account/usage-history', {
  state: { accountNo: '123-456-789', period: '3M' },
});

// push 지만 히스토리 교체 (replace('/main') 과 동일)
$router.push('/main', { replace: true });

// 이동 후 스크롤 위치 유지
$router.push('/board/list', { preventScrollReset: true });

// 전환 애니메이션 적용
$router.push('/detail', { viewTransition: true });
```

:::warning `replace` 옵션 주의
* `$router.replace()`는 내부에서 `replace: true`를 강제하므로, `$router.replace(경로, { replace: false })`로 넘겨도 무시됩니다.
* 히스토리 교체 여부를 옵션으로 제어하고 싶다면 `$router.push(경로, { replace: true })` 형태로 `push()`에 넘기세요.
:::

:::note unstable 옵션
`NavigateOptions`에는 `unstable_mask`, `unstable_defaultShouldRevalidate` 등 **실험적(unstable) 옵션**도 있으나, 정식 API가 아니므로 여기서는 다루지 않습니다.
:::

---

## back()

히스토리 스택에서 **한 칸 뒤로** 이동합니다. (브라우저 뒤로가기 버튼과 동일)

* **인자** : 없음
* **반환** : `void`

```ts
$router.back();
```

---

## forward()

히스토리 스택에서 **한 칸 앞으로** 이동합니다. (브라우저 앞으로가기 버튼과 동일)

* **인자** : 없음
* **반환** : `void`

```ts
$router.forward();
```

---

## go()

히스토리 스택에서 **`delta` 칸만큼** 이동합니다. 음수는 뒤로, 양수는 앞으로 이동합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `delta` | `number` | ✓ | | 이동할 칸 수. **음수**=뒤로, **양수**=앞으로 |

* **반환** : `void`

```ts
$router.go(-2);   // 두 칸 뒤로
$router.go(1);    // 한 칸 앞으로 ($router.forward() 와 동일)
```

---

## getLocation()

**현재 위치(Location)** 스냅샷을 반환합니다.

* **인자** : 없음
* **반환** : `Location` — `{ pathname, search, hash, state, key }`

```ts
const location = $router.getLocation();
location.pathname;   // '/account/usage-history'
location.search;     // '?id=123'
location.hash;       // ''
location.state;      // 이동 시 전달한 state
```

---

## getState()

이동 시 `push`/`replace`로 넘긴 **`state` 값**을 반환합니다. 값이 없으면 `null`을 반환합니다.

| 타입 파라미터 | 설명 |
| --- | --- |
| `T` | 기대하는 state 형태. 지정하면 반환 값에 타입이 적용됨 (기본 `unknown`) |

* **인자** : 없음
* **반환** : `T | null` — 전달된 state, 없으면 `null`

```ts
// 보내는 화면
$router.push('/account/usage-history', {
  state: { accountNo: '123-456-789', period: '3M' },
});

// 받는 화면 — 제네릭으로 타입 지정
const state = $router.getState<{ accountNo: string; period: string }>();
const accountNo = state?.accountNo;   // '123-456-789'
```

:::warning state 가 없는 경우
사용자가 **URL을 직접 입력**하거나 **새 탭으로 진입**하면 `state`는 `null`이 됩니다.
항상 `state?.값` 형태로 안전하게 접근하고, 값이 없을 때의 처리를 함께 작성하세요.
:::

---

## getSearchParams()

현재 URL의 **쿼리스트링**을 [`URLSearchParams`](https://developer.mozilla.org/docs/Web/API/URLSearchParams) 객체로 파싱해 반환합니다.

* **인자** : 없음
* **반환** : `URLSearchParams`

```ts
// 현재 URL: ...#/search?keyword=계좌&page=2
const params = $router.getSearchParams();
params.get('keyword');   // '계좌'
params.get('page');      // '2'
params.get('none');      // null (없는 키)
```

---

## getParams()

현재 매치된 라우트의 **경로 파라미터**를 반환합니다. (react-router `useParams()`의 비-훅 버전)

* **인자** : 없음
* **반환** : `Params` — 파라미터 객체. 없으면 빈 객체(`{}`)

```ts
// 라우트 정의: { path: '/user/:id' }
// 현재 URL: ...#/user/42
const params = $router.getParams();
params.id;   // '42'
```

---

## getRouteName()

현재 매치된 라우트(가장 안쪽 leaf)의 **`name`** 값을 반환합니다. 지정되지 않았으면 `undefined`를 반환합니다.

* **인자** : 없음
* **반환** : `string | undefined`

```ts
// 라우트 정의: { path: '/account/main', name: '계좌메인' }
$router.getRouteName();   // '계좌메인'
```

:::note name 필드
`name`은 라우트 정의(`TAppRoute`)에 붙일 수 있는 **이 프로젝트 전용 필드**입니다.
페이지뷰 로깅, 화면 식별, 공통 헤더 타이틀 표시 등에 활용합니다.
:::

---

## subscribe()

라우트가 **바뀔 때마다** 콜백을 실행합니다. 페이지뷰 분석 전송, 네비게이션 로깅, 전역 모달 닫기, 문서 타이틀 동기화 등 "이동하는 순간"의 부수효과를 컴포넌트 밖에서 처리할 때 사용합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `cb` | `(location: Location) => void` | ✓ | | 이동 시 새 `Location`을 받아 실행할 콜백 |

* **반환** : `() => void` — **구독 해제 함수**. 더 이상 필요 없으면 호출합니다.

```ts
// 라우트 변경마다 페이지뷰 전송
const unsubscribe = $router.subscribe((location) => {
  sendPageview(location.pathname);
});

// 구독 해제
unsubscribe();
```

---

## createHref()

이동하지 않고, 지정한 경로에 대한 **링크 문자열(href)** 만 생성합니다. 링크 복사, 새 창 열기(`window.open`), 공유/딥링크 등 URL 문자열이 필요할 때 사용합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `to` | `To` | ✓ | | 링크로 만들 경로 |

* **반환** : `string` — href 문자열. 해시 라우터이므로 `...#/foo` 형태

```ts
const href = $router.createHref('/report');
// '...#/report'

// 새 창으로 열기
window.open($router.createHref('/report'), '_blank');
```

---

## 활용 예시

여러 메서드를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 로그인 성공 후 메인으로 이동 (뒤로가기로 로그인 화면 복귀 차단)
async function onLoginSuccess() {
  // ... 로그인 처리
  $router.replace('/main');
}

// 2) 목록 → 상세로 조회 조건과 함께 이동
function goDetail(accountNo: string) {
  $router.push('/account/usage-history', { state: { accountNo } });
}

// 3) 상세 화면 진입 시 전달된 state 읽기
const state = $router.getState<{ accountNo: string }>();
const accountNo = state?.accountNo ?? $router.getSearchParams().get('accountNo');

// 4) 화면 이동마다 페이지뷰 로깅 (앱 초기화 시 1회 등록)
const off = $router.subscribe((loc) => {
  console.log('page view:', loc.pathname, $router.getRouteName());
});
```

:::info 요약
| 메서드 | 반환 타입 | 설명 |
| --- | --- | --- |
| `push(to, options?)` | `void` | 히스토리에 추가하며 이동 |
| `replace(to, options?)` | `void` | 현재 항목을 교체하며 이동 |
| `back()` | `void` | 한 칸 뒤로 이동 |
| `forward()` | `void` | 한 칸 앞으로 이동 |
| `go(delta)` | `void` | delta 칸 이동 (음수=뒤로) |
| `getLocation()` | `Location` | 현재 위치 스냅샷 |
| `getState<T>()` | `T \| null` | 전달된 state 조회 (없으면 `null`) |
| `getSearchParams()` | `URLSearchParams` | 현재 쿼리스트링 파싱 |
| `getParams()` | `Params` | 현재 경로 파라미터 (없으면 `{}`) |
| `getRouteName()` | `string \| undefined` | 현재 라우트의 `name` |
| `subscribe(cb)` | `() => void` | 라우트 변경 구독 (반환값=해제 함수) |
| `createHref(to)` | `string` | 링크 문자열 생성 (`...#/foo`) |
:::
