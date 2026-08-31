---
sidebar_position: 2
displayed_sidebar: "documentDocSidebar"
title: "jwt인증 적용 (업무)"
---


# jwt인증 적용 (업무)

:::info 작업 내용
* `react-app-scaffold`의 **JWT 인증**이 이미 붙어 있는 프로젝트에서, **업무(도메인) 화면**이 인증을 어떻게 사용하는지 설명합니다.
* **대상**: 업무 화면을 개발하는 **프론트엔드 업무 개발자**.
* **한 줄 요약**: 인증을 위해 여러분이 짜야 할 코드는 **거의 없습니다.** `useAuth()` · `useLogout()` · `ProtectedRoute` 셋만 필요할 때 꺼내 씁니다.
* **소요 시간**: 10분. (읽고 나면 다시 볼 일이 거의 없습니다)
:::

:::warning 시작 전 — 공통 개발자의 세팅이 끝나 있어야 합니다
이 문서는 [jwt인증 적용 (공통)](./set-jwt-certi-common) 의 작업이 **이미 끝난 프로젝트**를 전제합니다. 스캐폴드 기본 상태에는 인증이 적용되어 있지 않습니다.

세팅이 끝나면 공통 개발자가 아래 네 가지를 공지합니다. 못 받았다면 **먼저 요청하세요.**

1. **개발용 계정** (아이디 / 비밀번호) — 개발 서버의 실제 계정입니다
2. **사용자 객체의 필드** — `user.name` · `user.deptNm` 처럼 무엇이 들어오는지
3. **권한 이름** — `admin` · `manager` 처럼 이 프로젝트에서 쓰는 값
4. **현재 보호 중인 라우트** — 어디부터 로그인이 필요한지
:::

---




## 0. 30초 요약 {#summary}
---

```text
로그인 화면      /#/auth/login
개발용 계정      공통 개발자가 공지합니다 (서버 계정입니다)

필요할 때만 꺼내 쓰는 것 세 개
  useAuth()        로그인한 사용자 · 권한 확인
  useLogout()      로그아웃 버튼
  ProtectedRoute   화면을 로그인 필수로 (라우터 설정 — 공통 개발자와 협의)

API 호출은 평소대로 useApi() 를 씁니다. 인증 관련 코드는 한 줄도 넣지 않습니다.
```

전부 `@/shared/auth` 한 곳에서 가져옵니다.

```tsx
import { useAuth, useLogout } from '@/shared/auth';
```

| 하고 싶은 것 | 쓰는 것 | 이 문서 |
| --- | --- | --- |
| 로그인한 사용자 이름 보여주기 | `useAuth()` | [2. useAuth()](#use-auth) |
| 권한에 따라 버튼·메뉴 감추기 | `hasRole()` | [3. hasRole()](#has-role) |
| 로그아웃 버튼 만들기 | `useLogout()` | [4. useLogout()](#use-logout) |
| API 호출하기 | `useApi()` — **인증 관련 추가 작업 없음** | [5. API 호출](#api) |
| 내 화면을 로그인 필수로 | `ProtectedRoute` (라우터) | [6. 라우트 보호](#protected-route) |
| 파일 다운로드·WebSocket 처럼 axios 를 안 타는 요청 | `getAccessToken()` | [5.4 예외](#token-exception) |

---




## 1. 인증을 위해 **하지 않아도 되는 것** {#do-nothing}
---

**이 장이 이 문서에서 가장 중요합니다.** 아래는 전부 이미 되어 있습니다. 직접 짜면 오히려 깨집니다.

| 하지 마세요 | 이미 이렇게 동작합니다 |
| --- | --- |
| 요청에 토큰 붙이기 | 요청 인터셉터가 **모든 요청**에 `Authorization: Bearer …` 를 자동으로 붙입니다 |
| `401` 분기 처리 | 자동으로 토큰을 갱신하고 **실패했던 요청을 다시 보냅니다.** 호출한 쪽은 성공만 봅니다 |
| 로그인 상태를 자기 스토어에 만들기 | 앱 전역에 하나 있습니다. `useAuth()` 로 읽습니다 |
| 새로고침 후 로그인 유지 처리 | 앱이 뜰 때 자동으로 복구합니다 |
| 로그아웃할 때 캐시 지우기 | `useLogout()` 이 쿼리 캐시까지 정리합니다 |
| 토큰 만료 시간 계산 · 미리 갱신 | 만료되면 알아서 갱신됩니다 |
| 화면마다 "로그인했나" 확인 | 보호된 라우트 안이면 **이미 로그인된 상태**입니다 |
| 다른 탭에서 로그아웃했을 때 처리 | 탭 간 동기화가 되어 있습니다 |


### 이렇게 짜지 마세요

```tsx
// ❌ 토큰을 직접 붙이지 않습니다
const token = localStorage.getItem('access_token');
const { data } = useApi<TOrder[]>('/orders', {
  headers: { Authorization: `Bearer ${token}` },
});

// ❌ 401 을 직접 처리하지 않습니다
try {
  await callApi('/orders');
} catch (e) {
  if (e.status === 401) {
    await refreshToken();       // 이미 자동으로 됩니다
    navigate('/auth/login');    // 이미 자동으로 이동합니다
  }
}

// ❌ 로그인 상태를 또 만들지 않습니다
const useMyAuthStore = defineStore({ name: 'my-auth', state: { isLogin: false } });
```

```tsx
// ✅ 그냥 이렇게 부르면 됩니다
const { data, isPending, error } = useApi<TOrder[]>('/orders');
```

:::danger 401 을 직접 처리하면 왜 나쁜가
자동 갱신이 이미 돌고 있는데 화면이 또 갱신을 시도하면 **갱신 요청이 두 번 나갑니다.** 서버가 refresh token 을 회전(rotation)시키는 구성이라면 두 번째 요청이 "이미 사용한 토큰"으로 걸려 **그 계정이 통째로 로그아웃**됩니다. 재현이 어렵고 원인을 찾기도 어려운 종류의 버그입니다.
:::

:::caution `src/shared/auth/**` 는 열지 않습니다
인증 로직은 스캐폴드 소유입니다. 동작이 이상하다면 화면 코드로 우회하지 말고 **공통 개발자에게 알리세요.** 우회 코드가 남으면 실서버가 붙을 때 훨씬 찾기 어려워집니다.
:::

---




## 2. 로그인한 사용자 보여주기 — `useAuth()` {#use-auth}
---

### 2.1 기본 사용

```tsx title="src/domains/order/components/OrderHeader.tsx"
// highlight-next-line
import { useAuth } from '@/shared/auth';
import type { IAppUser } from '@/domains/auth/types';

export default function OrderHeader(): React.ReactNode {
  // highlight-next-line
  const { user, isAuthenticated } = useAuth<IAppUser>();

  if (!isAuthenticated) return null;

  return <span>{user?.name} 님</span>;
}
```

:::info 설명
* `useAuth()` 는 **읽기 전용**입니다. 호출한다고 서버에 요청이 나가지 않습니다. 전역 스토어의 값을 구독할 뿐이라 어느 컴포넌트에서 몇 번을 불러도 괜찮습니다.
* `useAuth<IAppUser>()` 처럼 **타입을 넣어주면** `user.name` 이 자동완성됩니다.
* `IAppUser` 는 `src/domains/auth/types.ts` 에 있고, **이 프로젝트 서버 응답에 맞춰 공통 개발자가 정의한 타입**입니다. 어떤 필드가 있는지 궁금하면 그 파일을 열어보면 됩니다.
:::


### 2.2 돌려주는 값

| 값 | 타입 | 설명 |
| --- | --- | --- |
| `user` | `TUser \| null` | 로그인한 사용자. 비로그인이면 `null` |
| `isAuthenticated` | `boolean` | 로그인 여부. **대부분 이것만 쓰면 됩니다** |
| `isRefreshing` | `boolean` | 토큰 갱신 중 (부팅 복구 · 401 자동 갱신) |
| `status` | `'idle' \| 'refreshing' \| 'authenticated' \| 'anonymous'` | 상태 원본 |
| `hasRole(...roles)` | `(...roles: string[]) => boolean` | 권한 확인 ([3장](#has-role)) |

:::note `status` 를 직접 볼 일은 거의 없습니다
`isAuthenticated` 로 충분합니다. 참고로 각 값의 뜻은 아래와 같습니다.

| 값 | 뜻 |
| --- | --- |
| `idle` | 아직 아무것도 하지 않음 (인증을 쓰지 않는 프로젝트는 계속 여기 머뭅니다) |
| `refreshing` | 갱신 중 — 직전까지 로그인 상태였다는 뜻입니다 |
| `authenticated` | 로그인됨 |
| `anonymous` | 비로그인 (갱신 실패 · 로그아웃) |
:::


### 2.3 `user` 가 잠깐 `null` 일 수 있습니다

보호된 라우트 안이라면 로그인은 되어 있지만, **서버가 갱신 응답에 사용자 정보를 안 실어주는 구성**이면 값이 늦게 채워질 수 있습니다. 이름을 그리는 화면은 옵셔널 체이닝으로 방어하세요.

```tsx
// ✅ 안전
<span>{user?.name ?? ''} 님</span>

// ❌ user 가 null 인 순간 터집니다
<span>{user.name} 님</span>
```

:::tip `isRefreshing` 이 필요한 경우
화면 전체를 잠깐 가려야 하는 경우(예: 갱신 중에 다시 제출되면 곤란한 화면)에만 씁니다. 일반 조회 화면은 신경 쓸 필요가 없습니다.

```tsx
const { isRefreshing } = useAuth();
if (isRefreshing) return <Spinner />;
```
:::

---




## 3. 권한으로 감추기 — `hasRole()` {#has-role}
---

### 3.1 기본 사용

```tsx
const { hasRole } = useAuth();

return (
  <div>
    <Button>조회</Button>
    {/* highlight-next-line */}
    {hasRole('admin') && <Button variant="destructive">삭제</Button>}
  </div>
);
```

여러 개를 넘기면 **하나라도 가지고 있을 때** 통과합니다. (OR 조건)

```tsx
{hasRole('admin', 'manager') && <ApprovalButton />}
```


### 3.2 어디에 쓰나

| 대상 | 방법 |
| --- | --- |
| 버튼 · 메뉴 · 탭 · 표의 특정 열 | `hasRole()` 로 조건부 렌더 — **이 장** |
| 화면(라우트) 전체 | `ProtectedRoute` 의 `roles` — [6.2](#protected-role) |

:::caution 권한 이름은 프로젝트마다 다릅니다
`admin` · `manager` 는 예시일 뿐입니다. **이 프로젝트에서 쓰는 실제 값은 공통 개발자에게 확인하세요.** 서버가 내려주는 값과 글자 하나라도 다르면 조용히 `false` 가 됩니다.
:::

:::warning `hasRole()` 이 항상 `false` 라면
`hasRole()` 은 사용자 객체에서 권한을 꺼내는 방법(`authConfig.resolveRoles`)이 설정돼 있어야 동작합니다. 설정이 없으면 **막는 쪽으로 동작하고**(가드가 조용히 열려 있는 것보다 안전하므로), 개발 모드 콘솔에 사유가 찍힙니다.

```text
[auth] hasRole() 을 썼지만 authConfig.resolveRoles 가 없습니다.
```

이 메시지가 보이면 화면 문제가 아닙니다. **공통 개발자에게 요청하세요.**
:::

:::danger 화면에서 감추는 것은 UI 편의일 뿐입니다
`hasRole()` 로 버튼을 감춰도 **서버 권한 검사를 대신하지 못합니다.** 실제 차단은 서버가 합니다. 감췄으니 안전하다고 가정하지 마세요.
:::

---




## 4. 로그아웃 버튼 — `useLogout()` {#use-logout}
---

```tsx title="로그아웃 버튼"
// highlight-next-line
import { useLogout } from '@/shared/auth';

export default function LogoutButton(): React.ReactNode {
  // highlight-next-line
  const { logout, pending } = useLogout();

  return (
    <Button
      type="button"
      onClick={logout}
      disabled={pending}
    >
      {pending ? '로그아웃 중…' : '로그아웃'}
    </Button>
  );
}
```

`logout()` 을 부르면 아래가 **전부 자동으로** 일어납니다.

```text
① 서버에 로그아웃을 알린다
② 토큰을 지운다
③ 쿼리 캐시(useApi 로 받아둔 데이터)를 전부 비운다
④ 로그인 상태를 anonymous 로 바꾼다
⑤ 다른 탭에도 로그아웃을 알린다
⑥ 로그인 화면으로 이동한다
```

:::info 알아둘 것
* **`try/catch` 로 감쌀 필요가 없습니다.** `logout()` 은 던지지 않습니다.
* **서버 호출이 실패해도 화면은 반드시 로그아웃됩니다.** 서버가 죽었을 때 로그아웃 버튼이 안 먹으면 그 화면에서 나갈 방법이 없기 때문입니다.
* `pending` 은 성공 후에도 `true` 로 유지됩니다. 곧 화면이 바뀌므로 버튼이 잠겨 있는 편이 낫기 때문입니다.
* ③ 덕분에 **로그아웃 후 다음 사용자에게 이전 데이터가 보이지 않습니다.** 단, 여러분이 직접 만든 전역 상태(zustand 스토어 등)는 스캐폴드가 알 수 없으므로 [따로 비워야 합니다](#trouble).
:::

:::tip 헤더에 이미 붙어 있을 수 있습니다
사용자 이름 + 로그아웃 버튼은 보통 공통 레이아웃 헤더(`src/shared/layouts/default/components/`)에 이미 있습니다. **화면마다 새로 만들기 전에 먼저 확인하세요.**
:::

:::note React 컴포넌트 밖에서 로그아웃해야 한다면
유틸 함수처럼 훅을 쓸 수 없는 곳에서는 함수를 직접 부를 수 있습니다. 다만 `pending` 관리가 없으므로 화면 안에서는 훅을 쓰는 편이 낫습니다.

```ts
import { logout } from '@/shared/auth';

await logout();
```
:::

---




## 5. API 호출 — 평소대로 {#api}
---

### 5.1 인증 때문에 추가로 할 일이 없습니다

```tsx
import { useApi } from '@axiom/hooks';

// 조회 — 토큰이 자동으로 붙습니다
const { data, isPending, error, refetch } = useApi<TOrder[]>('/orders');

// 등록 — 역시 자동입니다
const { mutate, isPending: isSaving } = useApi<TOrder, TOrderForm>('/orders', {
  method: 'POST',
  type: 'mutation',
});
```

`useApi()` 의 사용법 자체는 [REST API 데이터 활용하기](../dev/use-rest-api) 를 보세요. **인증이 붙어도 그 문서의 내용은 하나도 달라지지 않습니다.**


### 5.2 뒤에서 일어나는 일

토큰이 만료된 상태에서 조회를 걸어도 여러분은 그 사실을 **모른 채 정상 응답을 받습니다.**

```text
화면            useApi('/orders')
                      │
요청 인터셉터    Authorization: Bearer <access> 자동 첨부
                      │
서버                 401 (access 만료)
                      │
응답 인터셉터    ① 토큰 갱신 요청 (동시 401 이 여러 개여도 갱신은 1회로 묶임)
                 ② 새 토큰으로 '/orders' 를 다시 요청
                      │
서버                 200
                      │
화면            data 를 받는다  ← 실패를 본 적이 없다
```

:::tip Network 탭에 `refresh` 가 자주 보이는 것은 정상입니다
access token 이 만료될 때마다 자동 갱신이 도는 것이고, 그게 이 모듈이 하는 일입니다. **토큰 수명은 서버가 정합니다.** 프론트에서 바꿀 값이 아니니, 너무 잦아 개발에 방해가 되면 공통 개발자를 통해 서버 담당에게 요청하세요.
:::


### 5.3 그러면 `error` 는 언제 도나

**진짜 실패했을 때만** 돕니다.

| 상황 | 여러분이 할 일 |
| --- | --- |
| 400 · 404 · 500 등 업무 오류 | **평소대로 처리합니다.** 인증과 무관합니다 |
| access token 만료 | **아무것도 안 합니다.** 갱신 후 재시도되어 성공으로 돌아옵니다 |
| 세션이 완전히 끝남 (갱신도 실패) | **아무것도 안 합니다.** 이미 로그인 화면으로 이동 중입니다 |
| 그 API 만 401 · 403 | 권한 문제입니다. 서버 담당 · 공통 개발자에게 확인 |

```tsx
// ✅ 인증을 의식하지 않은, 평범한 에러 처리
const { data, isPending, error } = useApi<TOrder[]>('/orders');

if (isPending) return <p>불러오는 중…</p>;
if (error) return <p role="alert">주문을 불러오지 못했습니다.</p>;
```


### 5.4 예외 하나 — axios 를 안 타는 요청 {#token-exception}

파일 다운로드 링크나 WebSocket 처럼 `useApi()` · `callApi()` 를 거치지 않는 경로에서는 인터셉터가 동작하지 않으므로 토큰이 자동으로 붙지 않습니다. **이때만** 직접 꺼내 씁니다.

```ts
// highlight-next-line
import { getAccessToken } from '@/shared/auth';

const res = await fetch(`/api/files/${id}`, {
  // highlight-next-line
  headers: { Authorization: `Bearer ${getAccessToken()}` },
});
```

:::warning 토큰을 저장하거나 지우는 함수는 제공하지 않습니다
토큰의 보관 위치는 **저장 전략이 단독으로 결정**합니다(메모리 · localStorage · httpOnly 쿠키 중 프로젝트 설정에 따라 다름). 밖에서 직접 쓰면 전략과 어긋나 저장소에 옛 값이 남습니다. 로그인·로그아웃이 필요하면 훅을 쓰세요.

`localStorage.getItem('...')` 으로 토큰을 직접 읽는 코드도 같은 이유로 쓰지 않습니다. 기본값인 `cookie` 전략에서는 **애초에 저장소에 access token 이 없습니다.**
:::

:::caution 이 경로에는 자동 갱신이 없습니다
`fetch()` 로 직접 보낸 요청이 401 을 받아도 갱신·재시도가 일어나지 않습니다. 다운로드가 가끔 실패한다면 이 이유일 수 있으니, 가능하면 `useApi()` · `callApi()` 를 쓰는 방식으로 서버와 협의하세요.
:::

---




## 6. 내 화면을 로그인 필수로 만들기 {#protected-route}
---

:::caution 라우터는 여러 사람이 함께 쓰는 파일입니다
`src/shared/router/index.tsx` 는 공용 파일이라 **보통 공통 개발자와 협의**해서 수정합니다. 방법은 아래와 같으니, 무엇을 요청해야 하는지 알아두면 됩니다.
:::

### 6.1 로그인만 확인

이미 있는 **보호 구간(`ProtectedRoute`)의 `children` 안**에 내 도메인 라우터를 넣으면 끝입니다.

```tsx title="src/shared/router/index.tsx"
{
  element: <ProtectedRoute />,
  children: [
    { path: '/', element: <RootLayout />, children: MainRouter },

    // highlight-next-line
    { path: '/orders', element: <RootLayout />, children: OrderRouter },  // ← 여기에 추가
  ],
},
```

**화면 코드에는 아무것도 추가하지 않습니다.** 로그인하지 않은 사용자는 여기까지 오지 못하고 로그인 화면으로 이동합니다. 즉 `/orders` 아래의 모든 컴포넌트는 **로그인된 상태를 전제**해도 됩니다.


### 6.2 권한까지 확인 {#protected-role}

```tsx title="src/shared/router/index.tsx"
{
  // highlight-next-line
  element: <ProtectedRoute roles={['admin']} />,
  children: [
    { path: '/admin', element: <RootLayout />, children: AdminRouter },
  ],
},
```

| prop | 설명 |
| --- | --- |
| `roles` | 이 중 **하나라도** 가진 사용자만 통과. 생략하면 로그인 여부만 확인합니다 |
| `forbiddenPath` | 권한이 부족할 때 보낼 경로. **기본값은 홈(`/`)** |

```tsx
<ProtectedRoute roles={['admin']} forbiddenPath="/no-permission" />
```

:::note 권한 부족은 로그인 화면으로 보내지 않습니다
"다시 로그인하면 되나?"로 읽혀 사용자가 같은 자리를 맴돌기 때문입니다. 그래서 로그인 화면이 아니라 **접근 가능한 곳**으로 보냅니다.
:::


### 6.3 로그인 없이도 보여야 하는 화면

공지·약관처럼 비로그인 상태에서도 보여야 하는 화면은 보호 구간 **바깥**에 둡니다. 로그인 화면(`/auth`)이 그렇게 되어 있습니다.

:::danger 인증 라우트(`/auth`)를 보호 구간 안에 넣으면 안 됩니다
로그인하러 가는 길이 다시 막혀 **무한 리다이렉트**가 됩니다.
:::

---




## 7. 개발 중 로그인하기 {#dev-login}
---

### 7.1 계정

| | |
| --- | --- |
| 로그인 화면 | `/#/auth/login` |
| 계정 | **공통 개발자가 공지한 계정** — 개발 서버의 실제 계정이라 스캐폴드에 적혀 있지 않습니다 |
| 유지 | 브라우저를 닫았다 열어도 로그인이 유지됩니다 (부팅 복구) |

:::caution 계정을 직접 만들지 마세요
회원가입 API 를 호출하거나 DB 를 건드리지 말고 **공통 개발자에게 요청**하세요. 계정 정책은 서버 담당이 관리합니다.
:::


### 7.2 새로고침해도 로그인이 유지되는 이유

앱이 뜰 때(`main.tsx`) **화면을 그리기 전에** 세션 복구가 한 번 돌기 때문입니다. 그래서

* 새로고침해도 로그인 화면이 번쩍이지 않고,
* 첫 화면의 API 호출이 토큰 없이 나가는 일도 없습니다.

이게 안 된다면 **정상 동작이 아닙니다.** 화면 코드로 우회하지 말고 공통 개발자에게 알리세요.


### 7.3 콘솔 도구 (개발 모드 전용) {#dev-probe}

공통 개발자가 개발 프로브를 켜 두었다면, 브라우저 콘솔에서 인증 동작을 눈으로 확인할 수 있습니다.

```js
// 보호된 요청 1회 — 토큰이 만료돼 있으면 me 401 → refresh 200 → me 200
await __auth.me();

// 동시 401 다섯 개가 갱신 1회로 묶이는지 (Network 탭에서 refresh 가 1건인지 확인)
await __auth.burst(5);
```

:::tip `fetch()` 로 직접 찔러보면 확인되지 않습니다
`fetch()` 는 인터셉터를 타지 않아 자동 갱신이 일어나지 않습니다. 동작을 확인하려면 반드시 위 도구를 쓰세요.
:::

:::note `__auth` 가 없다고 나오면
프로브가 꺼져 있는 것입니다(선택 기능이고 운영 번들에는 들어가지 않습니다). 필요하면 공통 개발자에게 요청하세요.
:::

---




## 8. 자주 겪는 문제 {#trouble}
---

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 화면이 자꾸 로그인으로 튄다 | 세션이 끝났습니다 (만료 · 다른 탭에서 로그아웃) | 다시 로그인. 반복되면 공통 개발자에게 |
| 로그인은 되는데 그다음 요청이 전부 401 | 서버 응답에서 토큰을 꺼내는 설정이 안 맞습니다 | **공통 개발자에게.** 화면 문제가 아닙니다 |
| 내 API 만 401 · 403 이 난다 | 그 API 가 다른 인증을 요구하거나, 권한이 없습니다 | 서버 담당 · 공통 개발자에게 |
| 새로고침하면 로그인이 풀린다 | 부팅 복구가 동작하지 않습니다 | **공통 개발자에게.** 정상 동작이 아닙니다 |
| 로그인 화면이 새로고침 때마다 번쩍인다 | 부팅 배선 문제 | **공통 개발자에게** |
| `user` 가 `null` 인데 로그인은 돼 있다 | 서버가 사용자 정보를 안 내려주거나 매핑이 안 맞습니다 | 우선 `user?.name` 으로 방어. 값이 계속 비면 공통 개발자에게 |
| `hasRole()` 이 항상 `false` | 권한 꺼내는 설정이 없거나 권한 이름이 다릅니다 | 개발 콘솔에 사유가 찍힙니다 → 공통 개발자에게 |
| 로그아웃했는데 이전 데이터가 보인다 | 직접 만든 전역 상태가 남아 있습니다 | **여러분이 만든 스토어를 비우세요** (`useApi` 캐시는 이미 정리됩니다) |
| 다운로드 링크만 401 이 난다 | axios 를 안 타는 경로입니다 | [5.4 예외](#token-exception) 참고 |
| 탭을 두 개 켜두고 한쪽에서 로그아웃하면 다른 탭도 나간다 | 탭 간 동기화 (의도된 동작) | 정상입니다 |

:::info 표에 "공통 개발자에게" 가 많은 것이 정상입니다
인증 설정은 서버 계약과 맞물려 있어 업무 화면에서 고칠 수 있는 것이 아닙니다. **화면 코드를 고쳐서 우회하려 하지 마세요.** 우회 코드가 남으면 실서버가 붙을 때 원인을 찾기가 훨씬 어려워집니다.
:::

---




## 9. 이런 건 공통 개발자에게 {#ask-common}
---

| 요청 | 왜 |
| --- | --- |
| 사용자 정보에 필드 추가 (부서 · 사번 등) | 서버 응답 · 타입 · 매핑이 같이 바뀝니다 |
| 새 권한 이름 추가 | 서버가 내려주는 값과 맞아야 합니다 |
| 내 화면을 보호 라우트로 | 라우터는 공용 파일입니다 |
| 로그인 후 특정 화면으로 보내기 | 인증 설정의 확장 지점에서 처리합니다 |
| 로그인 직후 공통 데이터 미리 조회 (메뉴 · 공통코드 등) | 같은 확장 지점에서 처리합니다 |
| 세션 만료 안내 문구 · 모달 | 같은 확장 지점에서 처리합니다 |

:::tip 마지막 셋은 특히 화면에서 만들지 마세요
**모든 화면에 공통으로 걸리는 동작**이라 화면마다 따로 짜면 같은 코드가 프로젝트 전체에 흩어집니다. 공통 개발자가 `src/config/auth.config.ts` 한 곳에서 처리합니다.
:::

---




## 부록. 전체 예제 {#example}
---

사용자 표시 · 권한 버튼 · API 호출이 한 화면에 모두 들어간 형태입니다.

```tsx title="src/domains/order/pages/OrderIndex.tsx"
import { useApi } from '@axiom/hooks';
import { Button } from '@axiom/components/ui';
import type { IAppUser } from '@/domains/auth/types';
// highlight-next-line
import { useAuth } from '@/shared/auth';

interface IOrder {
  id: number;
  title: string;
}

export default function OrderIndex(): React.ReactNode {
  // highlight-next-line
  const { user, hasRole } = useAuth<IAppUser>();

  // 인증 관련 코드 없음. 토큰 첨부도 401 처리도 자동입니다.
  const { data: orders, isPending, error } = useApi<IOrder[]>('/orders');

  if (isPending) return <p>불러오는 중…</p>;
  if (error) return <p role="alert">주문을 불러오지 못했습니다.</p>;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-bold">주문 목록</h1>
      {/* highlight-next-line */}
      <p className="text-sm text-gray-600 dark:text-gray-400">{user?.name} 님이 조회 중</p>

      <ul className="space-y-1">
        {orders?.map((order) => <li key={order.id}>{order.title}</li>)}
      </ul>

      {/* highlight-next-line */}
      {hasRole('admin') && <Button variant="destructive">일괄 삭제 (관리자)</Button>}
    </div>
  );
}
```

:::info 이 화면에서 인증을 위해 쓴 것은 `useAuth()` 한 줄뿐입니다
나머지는 전부 자동입니다. 라우트 보호는 라우터에서, 토큰과 401 은 인터셉터에서 이미 처리되고 있습니다.
:::

---




## 확인 체크리스트
---

- [ ] 공통 개발자에게 **개발용 계정 · 사용자 필드 · 권한 이름 · 보호 라우트**를 받았다
- [ ] `/#/auth/login` 에서 로그인이 되고, **새로고침해도 유지**된다
- [ ] 내 화면의 `useApi()` 호출에 **인증 관련 코드를 넣지 않았다**
- [ ] 토큰을 직접 읽거나 붙이는 코드, `401` 분기 코드가 **하나도 없다**
- [ ] 로그인 상태를 담는 **별도 전역 상태를 만들지 않았다** (`useAuth()` 사용)
- [ ] 내가 만든 전역 상태는 **로그아웃 시 비워지도록** 처리했다
- [ ] 보호가 필요한 화면은 라우터의 **보호 구간 안**에 있다

---




## 관련 문서
---

* [jwt인증 적용 (공통)](./set-jwt-certi-common) — 인증을 서버에 맞춰 붙이는 방법 (공통 개발자용)
* [REST API 데이터 활용하기](../dev/use-rest-api) — `useApi()` 로 데이터 조회
* [REST API 데이터 업데이트하기](../dev/update-data-with-rest-api) — `useApi()` 로 데이터 변경
* [업무 페이지 만들기](../dev/create-biz-pages) — 도메인 화면 · 라우터 구성
* [전역 상태 만들기](../dev/create-global-state) — 직접 만든 스토어를 로그아웃 시 정리해야 하는 경우
