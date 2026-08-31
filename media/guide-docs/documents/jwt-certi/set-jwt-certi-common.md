---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "jwt인증 적용 (공통)"
---


# jwt인증 적용 (공통)

:::info 작업 내용
* `react-app-scaffold`가 기능으로 제공하는 **JWT 인증**을 프로젝트 서버에 맞춰 **조립(적용)** 하는 방법을 설명합니다.
* `react-app-scaffold`는 **로그인 · 자동 토큰 갱신 · 라우트 보호 · 탭 간 로그아웃** 작업 관련 로직을 쉽게 적용할 수 있게 제공하고, 업무 개발자는 **인증 관련 코드 작업**을 쉽게 시작할 수 있습니다.
* **대상**: 프로젝트 착수 시 인증을 서버에 맞춰 붙이는 **프론트엔드 공통 개발자**.
:::

:::tip 업무 개발자는 이 문서를 읽지 않습니다
* 업무(도메인) 개발자는 [jwt인증 적용 (업무)](./set-jwt-certi-biz) 가이드가 따로 있습니다. 그쪽 가이드를 참조하여 프로젝트에 인증 관련 사전 작업이 완료된 후 사용하면 됩니다.
* 이 문서에서 세팅을 끝낸 뒤 [7. 업무 개발자에게 공지하기](#announce) 의 템플릿을 반드시 전달하세요. 공지하지 않으면 업무 개발자들이 알 수 없으므로 관련 작업이 지연될 수 있습니다.
:::

---




## 인증 적용 시작 전 — 지금 스캐폴드 상태
---

`react-app-scaffold`에는 jwt인증 관련 **기능**이 들어 있고, **실제 적용되어 있지 않습니다.**

프로젝트마다 로그인 방식·화면·서버 규약이 다릅니다. 모든 작업을 미리 해두면 스캐폴드를 반입한 프로젝트가 해당 프로젝트에 맞게 수정하거나 지우는 작업을 먼저 하게 됩니다. 그래서 스캐폴드는 **동작하는 부품**만 주고, 실제 적용은 이 문서가 안내합니다.


#### ◉ 관련 코드 위치 — `src/shared/auth/**` 

| 파일 | 하는 일 |
| --- | --- |
| `index.ts` | 공개 입구. **여기서 export하는 것만** 화면·부팅 코드가 씁니다 |
| `auth-flow.ts` | 부팅 복구 · 로그인 · 로그아웃 · 갱신 · 세션 정리 · 탭 동기화 |
| `auth-api.ts` | 서버 호출 (엔드포인트 · 응답 매핑) |
| `auth-strategies.ts` | 저장 전략 3벌 (`cookie` · `storage` · `access-only`) + 토큰 보관 |
| `auth-interceptor.ts` | Bearer 자동 첨부 · 401 → 갱신 → 재시도 (동시 요청은 갱신 1회로 묶임) |
| `auth-hooks.ts` | `useAuth` · `useLogin` · `useLogout` |
| `auth.store.ts` | 로그인 상태(`status`) · 사용자(`user`) |
| `ProtectedRoute.tsx` | 라우트 게이트 (권한 확인 포함) |
| `dev-probe.ts` | 콘솔 확인용 `window.__auth` (dev 전용, 선택) |


#### ◉ 프로젝트에서 새로 만들어야할 것들
* 프로젝트마다 인증관련 업무를 어떻게 업무 도메인으로 구분하여 작업할지 모르나 다음 예와같이 로그인 페이지가 필요합니다. 
* 프로젝트 상황에 따라 다르게 만들어도 됩니다.

```text
src/domains/auth/types.ts               서버가 받고 주는 값의 모양      ← 만든다
src/domains/auth/pages/LoginIndex.tsx   로그인 화면                    ← 만든다
src/domains/auth/router/index.tsx       로그인 라우트                  ← 만든다
```

#### ◉ 수정해야할 파일
* 다음 파일들은 설정 내용이나 일부 코드를 수정해야합니다.

```text
.env                          주소 · 저장소 키
src/config/auth.config.ts     전략 · 경로 · 응답 매핑 · 확장 지점
src/shared/router/index.tsx   어느 라우트를 보호할지
src/main.tsx                  부팅 배선 세 줄
```

:::caution `src/shared/auth/**` 는 수정하지 않습니다.
만약 해당 폴더의 소스코드를 변경해야 할 상황이 생긴다면 `react-app-scaffold` 제작자에게 문의 하세요.
:::

:::warning `src/config/auth.config.ts` 는 지우지 않습니다
인증 기능을 사용하지 않더라도 해당 파일은 지우지 않습니다.
:::

---




## 인증이 동작하는 방식 한눈에 보기
---

배선하기 전에 **무슨 일이 언제 일어나는지**를 먼저 잡아두면, 뒤에 나오는 값들이 왜 거기 있어야 하는지 이해됩니다. 아래 다섯 장면이 전부입니다.

### ① 로그인
```text
LoginIndex 화면
  └─ useLogin().submit(form)          ← form 이 그대로 요청 body 가 된다
       └─ login(credentials)
            ├─ POST {endpoints.login}                       (auth-api)
            ├─ extractAccessToken / extractUser 로 응답 해석 (auth.config)
            ├─ 전략이 토큰을 보관                            (auth-strategies)
            ├─ 스토어 status = 'authenticated'               (auth.store)
            └─ onLoginSuccess(session)                      (auth.config · 선택)
                 └─ 화면이 isAuthenticated 를 보고 Navigate
```

### ② 새로고침 (부팅 복구)
```text
main.tsx
  └─ await bootAuth()        ← createRoot() '전에' 딱 1회
       ├─ cookie 전략   : refresh 1회 왕복으로 세션 복구
       └─ storage 계열  : localStorage 에서 복원 (네트워크 없음)
            └─ 끝난 뒤에 렌더  → 로그인 폼이 번쩍이지 않는다
```

### ③ access token 만료 → 자동 갱신
```text
업무 화면의 평범한 API 호출
  └─ 401
       ├─ 로그인/갱신/로그아웃 URL 이면 → 갱신하지 않고 그대로 실패 (에러 메시지용)
       ├─ 전략이 갱신을 지원하지 않으면(access-only) → 세션 정리 → 로그인 화면
       └─ 그 외 → refreshSession() → 새 토큰으로 원 요청 재시도 (1회만)
```

:::tip 동시 401은 갱신 1건으로 묶입니다
화면 하나가 API 다섯 개를 동시에 쏘면 401이 다섯 개 옵니다. 각자 갱신하면 refresh 요청이 다섯 개 나가고, **회전(rotation)하는 서버에서는 넷이 재사용 감지에 걸려 계정 전체가 폐기됩니다.** 스캐폴드는 진행 중인 갱신을 하나로 묶어(single-flight) 이를 막습니다.

다만 이 방어는 **탭 단위**입니다. 탭이 둘 이상이면 동시 갱신을 막을 수 없으므로, 서버가 직전 refresh를 몇 초간 유예해줘야 합니다. ([2. 서버 담당에게 물어볼 것](#ask-server) 6번)
:::

### ④ 로그아웃 · 세션 종료
```text
useLogout().logout()
  └─ POST {endpoints.logout}      ← 실패해도 진행한다(서버가 죽어도 화면에서 나갈 수 있어야 한다)
       └─ clearSession('logout')
            ├─ 토큰 삭제 · 쿼리 캐시 clear · status = 'anonymous'
            ├─ onSessionEnd('logout')   ← 이동·안내는 전부 여기서  (auth.config)
            └─ 다른 탭에 로그아웃 신호 전파   (localStorage storage 이벤트)
```

| `reason` | 언제 발생하나 |
| --- | --- |
| `logout` | 사용자가 로그아웃했습니다 |
| `expired` | 갱신에 최종 실패했습니다 (세션 만료 · refresh 폐기) |
| `other-tab` | 다른 탭에서 로그아웃했습니다 |

### ⑤ 라우트 보호
```text
<ProtectedRoute />
  ├─ status 가 authenticated / refreshing  → 통과 (Outlet)
  ├─ 그 외                                → loginPath 로 이동 (원래 경로를 state.from 에 담아서)
  └─ roles 지정 + 권한 없음                → forbiddenPath 로 이동 (기본: 홈)
```

:::note 왜 `refreshing`도 통과시키나
`refreshing`은 "401 자동 갱신 중"이라는 뜻이고, 갱신을 시작했다는 건 직전까지 로그인 상태였다는 뜻입니다. 여기서 내보내면 **갱신이 성공해도 사용자는 로그인 화면에 가 있게 됩니다.** (부팅 중의 `refreshing`은 아직 렌더 전이라 게이트까지 오지 않습니다)
:::

---






## 서버 담당에게 물어볼 것 {#ask-server}
---

**아래를 그대로 복사해서 보내면 됩니다.**

```text
[프론트엔드] 인증 연동 확인 요청 ====================

1. refresh token 을 어떻게 주시나요?  (셋 중 하나)
   a. Set-Cookie 로 내려줍니다 (HttpOnly)
   b. 응답 body 에 담아서 줍니다
   c. refresh 없이 access token 만 있습니다

2. 엔드포인트 경로를 알려주세요.
   로그인 / 갱신 / 로그아웃 / 내 정보    (예: /api/auth/login)

3. 로그인 요청 body 에 어떤 필드를 받으시나요?
   (예: loginId + password / 사번 + 비밀번호 / 회사코드 + ID + 비밀번호 + OTP)

4. 로그인 응답 형태를 알려주세요.
   - access token 이 들어있는 키 이름      (예: accessToken, token, data.access_token)
   - 사용자 정보가 들어있는 키와 필드      (예: user: { id, name, role })

5. access token 이 만료되면 응답 코드가 무엇인가요?
   → 401 이어야 자동 갱신이 동작합니다. 403 이나 "200 + 에러코드" 면 알려주세요.

6. 갱신할 때 refresh token 을 새 값으로 교체(회전)하시나요?
   → 회전한다면, 직전 토큰을 몇 초간 더 받아주실 수 있나요?
      (탭을 여러 개 띄우면 동시 갱신이 생겨, 유예가 없으면 계정이 로그아웃됩니다)

7. (1번이 a 인 경우만) 쿠키 속성과 CORS 를 확인 부탁드립니다.
   - HttpOnly / SameSite=Lax 이상 / 운영은 Secure
   - Access-Control-Allow-Credentials: true
   - Access-Control-Allow-Origin 은 구체적인 주소 (와일드카드 * 는 브라우저가 막습니다)
```


#### ◉ 서버에 반드시 요구해야 하는 것

위 질문 중 아래 항목들은 **협의가 아니라 요구사항**입니다. 하나라도 어긋나면 자동 갱신이 동작하지 않습니다.

| # | 요구사항 | 안 지켜지면 |
| --- | --- | --- |
| 1 | **`refresh` 엔드포인트에 인증 미들웨어를 붙이지 않는다** | access가 만료돼서 오는 요청인데 401을 받아 **무한 갱신 루프** |
| 2 | **access 만료는 `401`로 준다** | 403이나 `200 + 에러코드`면 **자동 갱신이 발동하지 않는다** |
| 3 | **로그인 실패(비밀번호 오류)도 401이지만 갱신 대상이 아니다** | 프론트가 URL로 구분하므로 문제없음 (참고용) |
| 4 | **회전한다면 직전 refresh를 몇 초간 유예한다** | 탭이 둘 이상일 때 **계정 전체가 로그아웃** |
| 5 | (`cookie`만) **CORS**: `Access-Control-Allow-Credentials: true` + 구체적인 Origin | 브라우저가 쿠키를 싣지 않아 **새로고침하면 로그아웃** |
| 6 | (`cookie`만) **쿠키 속성**: `HttpOnly` 필수, `SameSite=Lax` 이상, 운영은 `Secure` | 보안 하향 / 쿠키 미전송 |

:::info 5·6번 합의가 안 되면
`cookie` 전략을 쓸 수 없습니다. 그때는 `storage`로 내려가면 되고, **그 이유로 `src/shared/auth` 를 뜯을 일은 없습니다.**
:::

---




## 저장 전략 고르기 {#strategy}
---

서버에서 refresh token 을 어떻게 주는냐에 따라 다음 설정을 조정합니다.

| 서버 답변 | `strategy` |
| --- | --- |
| Set-Cookie 로 내려줍니다 (HttpOnly) | `'cookie'` ← **권장** |
| 응답 body 에 담아 줍니다 | `'storage'` |
| refresh 없이 access 만 있습니다 | `'access-only'` |

| | **`cookie`** (기본·권장) | **`storage`** | **`access-only`** |
| --- | --- | --- | --- |
| access 보관 | **메모리** | localStorage | localStorage |
| refresh 보관 | 브라우저 (JS 접근 불가) | localStorage | — |
| 갱신 요청 | 쿠키가 자동으로 실린다 | body에 실어 보낸다 | — |
| 새로고침 유지 | 부팅 시 갱신 1회 | 저장소에서 복원 | 저장소에서 복원 |
| 401을 받으면 | 갱신 → 재시도 | 갱신 → 재시도 | **정리 → 로그인 화면** |
| XSS 내성 | **높다** | 낮다 | 낮다 |

:::tip `cookie` 가 **가능한지부터** 물어보세요
가능한데 안 쓰는 것과 불가능해서 못 쓰는 것은 다릅니다.

* `storage` · `access-only` 를 고르면 **개발 콘솔에 하향 경고가 한 번** 뜹니다. **막지는 않습니다** — 서버가 그렇다면 다른 방법이 없습니다. 운영 빌드에서는 경고 문구가 나오지 않습니다.
* `access-only` 는 `storage` 와 코드가 거의 같지만 **401을 받았을 때의 행동이 정반대**입니다(갱신 시도 vs 즉시 로그아웃). 서버에 refresh가 **정말 없을 때만** 고르세요.
:::

:::note `cookie` 전략은 쿠키를 다루는 코드가 한 줄도 없습니다
브라우저가 알아서 싣고, 프론트에 필요한 설정은 `src/config/api.config.ts` 의 `withCredentials: true` 하나가 전부입니다(**스캐폴드에 이미 켜져 있습니다**). 나머지(HttpOnly · SameSite · Path · Secure)는 서버가 정합니다.
:::

---




## 붙이는 순서 (8단계) {#steps}
---



### ◉ 1 `.env` — 주소와 저장소 키 **(이미 있습니다)** {#step-env}

스캐폴드 `.env` 에는 데모용 값(`https://jsonplaceholder.typicode.com`)이 들어 있습니다. **프로젝트 서버 주소로 바꿉니다.**

```bash title=".env"
# local server url  ← dev 프록시가 /api 를 넘길 대상 (프로젝트 백엔드 주소)
VITE_SERVER_URL=http://localhost:4000

# API 서버 기본 URL
# highlight-next-line
VITE_API_BASE_URL=/api                        # 스캐폴드 기본값(jsonplaceholder)에서 바꾼다
VITE_API_TIMEOUT=30000

# JWT를 이용한 access token 저장 이름 설정(미사용 시 공백처리)
VITE_LOCALSTORAGE_TOKEN_NAME=access_token
```

* `VITE_API_BASE_URL` 을 `/api` 로 두면 dev에서 **Vite 프록시가 동일 출처를 만들어 쿠키 관련 CORS 문제를 우회**합니다. (`vite.config.ts` 에 `/api` → `VITE_SERVER_URL` 프록시가 이미 설정돼 있습니다.) `cookie` 전략이라면 이 형태를 권합니다.
* 운영 배포 시에는 실제 API 주소를 넣습니다.
* `VITE_LOCALSTORAGE_TOKEN_NAME` 은 `storage` · `access-only` 에서만 쓰입니다. `cookie` 전략에서는 쓰이지 않지만 **지우지 마세요** — 전략을 바꾸는 순간 되살려야 하고, 그 사이 각자 키를 하드코딩하게 됩니다.

:::note 저장소 키 하나에서 세 개가 파생됩니다
`storage` 계열은 `VITE_LOCALSTORAGE_TOKEN_NAME` 하나에서 `<키>`(access) · `<키>_refresh` · `<키>_user` 세 키를 만듭니다. 값이 비어 있으면 `access_token` 을 기본으로 씁니다.
:::

:::warning `.env` 를 고치면 dev 서버를 재시작하세요
Vite는 `.env` 를 핫리로드하지 않습니다.
:::





### ◉ 2 `src/domains/auth/types/index.ts` — 서버가 받고 주는 모양 **(새로 만듭니다)** {#step-types}
* 해당 인증 화면의 타입 파일은 프로젝트 마다 자신의 상황에 맞는 위치에 생성하여 작업하면 됩니다. 
* 다음 질문에 대한 답을 작성한다고 생각하면 됩니다.
```
3. 로그인 요청 body 에 어떤 필드를 받으시나요?
   (예: loginId + password / 사번 + 비밀번호 / 회사코드 + ID + 비밀번호 + OTP)

4. 로그인 응답 형태를 알려주세요.
   - access token 이 들어있는 키 이름      (예: accessToken, token, data.access_token)
   - 사용자 정보가 들어있는 키와 필드      (예: user: { id, name, role })
```


```ts title="src/domains/auth/types/index.ts"
/**
 * 인증 도메인 타입 — 이 프로젝트가 소유한다.
 *
 * 서버가 받고 주는 값의 모양을 여기서 맞춘다. 스캐폴드는 이 파일을 모른다.
 * 필드를 바꿔도 src/shared/auth/** 는 하나도 안 바뀐다.
 */

/**
 * 로그인 요청에 실을 필드.
 * login() 이 받은 객체를 그대로 요청 body 로 보내므로, 이 타입이 곧 요청 스펙이다.
 */
export interface ILoginCredentials {
	loginId: string;
	password: string;
}

/**
 * 서버가 내려주는 사용자.
 * 스캐폴드는 이 값을 담아 두기만 하고 내용에 관여하지 않는다.
 * 화면에서 useAuth<IAppUser>() 로 꺼내 쓴다.
 */
export interface IAppUser {
	id: number | string;
	loginId: string;
	name: string;
	email: string;
	role?: string;
}
```

필드는 **이름도 개수도 프로젝트마다 다릅니다.** 서버에 맞춰 그대로 바꾸세요.

```ts
// 사번 + 2차 인증을 받는 서버라면 다음과 같은 형태
export interface ILoginCredentials {
	empNo: string;
	password: string;
	otp: string;
}

// 회사코드가 앞에 붙는 멀티테넌트 서버라면 다음과 같은 형태
export interface ILoginCredentials {
	companyCode: string;
	userId: string;
	password: string;
}
```

:::info 왜 스캐폴드가 이 타입을 갖고 있지 않나
`login()` 은 자격 증명을 `object` 로 받아 **그대로 요청 body로 보냅니다.** 형태를 스캐폴드에 고정하면 필드가 하나만 달라도 해당 프로젝트가 `src/shared/auth` 를 열어서 수정하게 됩니다. 요청 스펙은 **호출 측의 타입(`ILoginCredentials`)이 정합니다.**

`IAppUser` 는 업무 개발자가 `useAuth<IAppUser>()` 로 꺼내 쓰는 타입입니다. 서버 키가 다르면 여기서 이름을 맞추거나 `extractUser` 에서 변환합니다([◉ 3](#step-config)).
:::





### ◉ 3 `src/config/auth.config.ts` — 설정의 중심 **(수정합니다)** {#step-config}

세팅의 대부분이 이 파일 한 곳에서 끝납니다. 파일에는 이미 기본값과 상세 주석이 들어 있으니, **값만 서버에 맞춰 고칩니다.**

```ts title="src/config/auth.config.ts"
import type { AuthConfig } from '@/types/auth';

/** loginPath 와 onSessionEnd 두 곳에서 쓰므로 상수로 뺀다. */
const LOGIN_PATH = '/auth/login';

export const authConfig: AuthConfig = {
	// highlight-next-line
	strategy: 'cookie',              // ← 저장 전략 설정 값
	// endpoints값이 변경되면 src/types/auth.ts 파일의 IAuthEndpoints를 변경하세요.
	endpoints: {                              
		login: '/auth/login',
		logout: '/auth/logout',
		refresh: '/auth/refresh',
		me: '/auth/me',
	},

	extractAccessToken: (body) => body.accessToken,    // ← 4번 질문의 답
	extractRefreshToken: (body) => body.refreshToken,  // storage 전략에서만 쓰인다
	extractUser: (body) => body.user,

	loginPath: LOGIN_PATH,                    // 로그인 "화면" 경로
	tokenStorageKey: import.meta.env.VITE_LOCALSTORAGE_TOKEN_NAME,

	// ── 확장 지점 (5. 확장 지점 세 개) ──────────────────────────────
	resolveRoles: (user) => (user.role ? [String(user.role)] : []),

	// onLoginSuccess: async (session) => { await prefetchMenus(session); },

	onSessionEnd: () => {
		// push 가 아니라 replace 다. 뒤로가기로 로그아웃 직전 화면에 돌아가지 못하게 한다.
		window.$router?.replace(LOGIN_PATH);
	},
};
```

#### api 호출 경로는 baseURL 뒤에 붙습니다

```text
VITE_API_BASE_URL=/api  +  endpoints.login='/auth/login'   →   /api/auth/login
```


#### 응답 키를 여러 개 탐색하지 마세요

```ts
// ❌ 하지 마세요
extractAccessToken: (body) => body.accessToken ?? body.token ?? body.data?.token,
```

붙이는 순간에는 편하지만, 서버가 응답을 바꿨을 때 **조용히 다른 키를 집어 계속 동작하는 척합니다.** 그때 나는 버그는 원인을 찾기 어렵습니다. **한 줄 아끼려다 버그 찾다 하루 꼬박 고생합니다**

응답이 중첩돼 있으면 **정확히 하나를 지정하여 사용합니다.**

```ts
extractAccessToken: (body) => body.data.access_token,
extractUser: (body) => body.data.userInfo,
```






### ◉ 4 `src/domains/auth/pages/LoginIndex.tsx` — 로그인 화면 **(새로 만듭니다)** {#step-login-page}

* 아래를 그대로 복사해 시작한 뒤 프로젝트 디자인에 맞춰 마크업을 바꿉니다. 프로젝트에 이미 로그인 페이지가 있다면 그 화면에서 작업합니다.
* **인증 관련 훅 사용 코드만 적용하면 됩니다**

```tsx title="src/domains/auth/pages/LoginIndex.tsx"
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { ILoginCredentials } from '@/domains/auth/types';
// highlight-next-line
import { useAuth, useLogin } from '@/shared/auth';

/** ProtectedRoute 가 Navigate 의 state 로 넘겨주는 값. */
interface ILoginLocationState {
	from?: { pathname?: string };
}

export default function LoginIndex(): React.ReactNode {
	const location = useLocation();
	// highlight-start
	const { isAuthenticated } = useAuth();
	const { submit, pending, error } = useLogin();
	// highlight-end

	const [form, setForm] = useState<ILoginCredentials>({ loginId: '', password: '' });

	// 게이트가 막아 세운 원래 경로. 직접 들어온 경우엔 홈으로.
	// ⚠️ history state 라서 이 화면에서 F5 를 누르면 사라진다(그때는 홈으로 간다).
	//    복귀를 새로고침 뒤에도 보장해야 하면 쿼리스트링(?redirect=)으로 바꾼다.
	const from = (location.state as ILoginLocationState | null)?.from?.pathname ?? '/';

	const setField =
		(key: keyof ILoginCredentials) =>
		(e: ChangeEvent<HTMLInputElement>): void => {
			setForm((prev) => ({ ...prev, [key]: e.target.value }));
		};

	const handleSubmit = async (e: SubmitEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		// 성공하면 status 가 authenticated 로 바뀌고 아래 Navigate 가 걸린다.
		// 여기서 직접 이동시키지 않는다.
		// highlight-next-line
		await submit(form);
	};

	// 로그인 성공 · 이미 로그인한 사람이 주소로 직접 진입 — 두 경우가 여기서 같이 처리된다.
	// useEffect 가 아니라 렌더 중에 Navigate 를 돌려주는 이유는, effect 로 하면
	// 첫 페인트에 로그인 폼이 한 번 번쩍이기 때문이다.
	// highlight-start
	if (isAuthenticated) {
		return (
			<Navigate
				to={from}
				replace
			/>
		);
	}
	// highlight-end

	const fieldClass =
		'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 px-4 dark:bg-gray-950">
			<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">로그인</h1>

			<form
				onSubmit={handleSubmit}
				className="w-full max-w-sm space-y-4"
			>
				<div className="space-y-1.5">
					<label
						htmlFor="loginId"
						className="block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						아이디
					</label>
					<input
						id="loginId"
						value={form.loginId}
						onChange={setField('loginId')}
						autoComplete="username"
						required
						className={fieldClass}
					/>
				</div>

				<div className="space-y-1.5">
					<label
						htmlFor="password"
						className="block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						비밀번호
					</label>
					<input
						id="password"
						type="password"
						value={form.password}
						onChange={setField('password')}
						autoComplete="current-password"
						required
						className={fieldClass}
					/>
				</div>

				{/* 로그인 실패는 401 이지만 갱신 대상이 아니다. 화면이 튀지 않고 메시지만 보여야 한다. */}
				// highlight-start
				{error && (
					<p
						role="alert"
						className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
					>
						{error}
					</p>
				)}
				// highlight-end

				<button
					type="submit"
					disabled={pending}
					className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
				>
					{pending ? '로그인 중…' : '로그인'}
				</button>
			</form>
		</div>
	);
}
```

**마크업은 통째로 바꿔도 됩니다. 유지할 것은 이 네 줄입니다.**

```tsx
const { submit, pending, error } = useLogin();
const { isAuthenticated } = useAuth();

await submit(form);                                           // 제출 — form 은 ILoginCredentials
if (isAuthenticated) return <Navigate to={from} replace />;   // 성공 후 이동
{error && <p role="alert">{error}</p>}                        // 실패 메시지
```

:::info 알아둘 것
* 토큰 저장 · 상태 전환 · 자동 갱신은 **이미 되어 있습니다.** 직접 하지 마세요.
* `error` 에는 **서버가 준 메시지**가 그대로 들어옵니다. 서버가 안 주면 기본 문구가 나옵니다. 기본 문구를 바꾸려면 `useLogin({ fallbackMessage: '...' })`.
* `pending` 은 **성공 후에도 `true` 로 유지됩니다.** 곧 화면이 바뀌므로 버튼이 잠겨 있는 편이 이중 제출을 막습니다.
* 입력 필드를 늘리려면 `domains/auth/types/index.ts`의 `ILoginCredentials`에 **먼저** 추가하세요. 그러면 이 화면이 타입 검사를 받고, 그 객체가 그대로 요청 body가 됩니다.
:::

:::caution 로그인 화면에서 직접 `navigate()` 를 부르지 마세요
이동이 두 번 일어나거나 아예 안 일어납니다. `isAuthenticated` + `<Navigate>` 조합을 그대로 쓰세요.
:::

:::note 이 화면은 `RootLayout` 을 씌우지 않습니다
헤더·네비 없이 전체 화면으로 뜹니다. ([4.6](#step-gate) 의 라우트 구조 참고)
:::

- [ ] 완료




### ◉ 5 `src/domains/auth/router/index.tsx` — 로그인 라우트 **(새로 만듭니다)** {#step-route}

다른 도메인 라우터와 형태가 같습니다.

```tsx title="src/domains/auth/router/index.tsx"
import type { TAppRoute } from '@/types/router';
import loadable from '@loadable/component';

const LoginIndex = loadable(() => import('@/domains/auth/pages/LoginIndex'));

const routes: TAppRoute[] = [
	{
		path: 'login',
		element: <LoginIndex />,
		name: 'LoginIndex',
	},
];

export default routes;
```

`/auth` + `login` → `/#/auth/login` 입니다. **`authConfig.loginPath`([4.3](#step-config))와 반드시 일치해야 합니다.**

- [ ] 완료




### ◉ 6 `src/shared/router/index.tsx` — 게이트(ProtectedRoute) 적용 {#step-gate}

파일 상단 주석에 붙이는 형태가 적혀 있습니다. 그대로 코드로 바꿉니다.

```tsx title="src/shared/router/index.tsx"
import type { TAppRoute } from '@/types/router';
import { RootLayout } from '@/shared/layouts';
import MainRouter from '@/domains/main/router';
import ExampleRouter from '@/domains/example/router';
// highlight-start
import { ProtectedRoute } from '@/shared/auth';
import AuthRouter from '@/domains/auth/router';
// highlight-end

const routes: TAppRoute[] = [
	// ① 인증 라우트는 ProtectedRoute 게이트 '바깥'
	// highlight-start
	{
		path: '/auth',
		children: AuthRouter,
	},
	// highlight-end

	// ② 여기부터 로그인 필수
	// highlight-start
	{
		element: <ProtectedRoute />,
		children: [
			{ path: '/', element: <RootLayout />, children: MainRouter },
			// 업무(domain) 라우터가 생기면 여기에 추가한다
			// { path: '/orders', element: <RootLayout />, children: OrderRouter },
		],
	},
	// highlight-end

	// ③ 권한까지 확인
	// highlight-start
	{
		element: <ProtectedRoute roles={['admin']} />,
		children: [{ path: '/admin', element: <RootLayout />, children: AdminRouter }],
	},
	// highlight-end

	// … 기존 example / publishing / 404 라우트는 그대로
];

export default routes;
```

:::danger 인증 라우트(`/auth`)를 게이트(ProtectedRoute) 안에 넣으면 안 됩니다
로그인하러 가는 길이 다시 막혀 **무한 리다이렉트**가 됩니다.
:::

:::info 게이트(ProtectedRoute) 적용 규칙
* 권한 부족은 기본적으로 **홈**으로 보냅니다. 바꾸려면 `forbiddenPath="/no-permission"` 을 넘깁니다.
* 로그인 없이 볼 화면(공지, 약관 등)은 게이트 ProtectedRoute **바깥**에 둡니다.
* `/example` · `/publishing/example` 은 스캐폴드 예제라 게이트 밖에 있습니다. 실제 개발이 시작되면 함께 지웁니다.
:::






### ◉ 7 `src/main.tsx` 수정 — 인증관련 부팅 세팅  {#step-boot}

세 줄입니다. **위치가 중요합니다.**

```tsx title="src/main.tsx"
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/core/providers/AppProviders.tsx';
import App from './App.tsx';
import './assets/styles/app.css';
import { initApiConfig } from '@/core/api';
import { initQueryConfig } from '@/core/query';
import { apiConfig, queryConfig } from '@/config';
import { registerWindowUtil } from '@/core/utils/util';
import { registerWindowUI } from '@/core/ui';
// highlight-next-line
import { bootAuth, setupAuthInterceptor, setupTabSync } from '@/shared/auth';

// 전역 $util 유틸리티 등록(window.$util)
registerWindowUtil();
// 전역 $ui 등록(window.$ui)
registerWindowUI();
// API 설정 주입 — bootAuth() 가 이 baseURL 로 요청하므로 반드시 먼저 온다
initApiConfig(apiConfig);
// Query(캐시) 설정 주입
initQueryConfig(queryConfig);

// ① 렌더 밖 · 모듈 최상단 — 첫 요청이 나가기 전에 인터셉터가 걸려 있어야 한다
// highlight-start
setupAuthInterceptor(); // axios에 "토큰 자동 첨부 + 401이면 재발급" 훅을 건다	첫 API 요청이 나가기 전에 걸려 있어야 함
setupTabSync(); // window에 storage 이벤트 리스너를 등록 - 다른 탭(브라우저 탭)에서 로그아웃하면 이 탭도 따라 끊기게
// highlight-end

// highlight-start
void (async () => {
	// bootAuth()를 렌더 전에 await 하는 이유
	// 새로고침을 누른 직후, 앱은 "이 사람이 로그인 상태인지 아직 모릅니다." 서버에 한 번 물어봐야(또는 저장소를 복원해야) 압니다. 그 답을 기다리지 않고 화면부터 그리면 둘 중 하나가 깨집니다 — 스캐폴드 auth-flow.ts 주석에도 같은 내용이 적혀 있습니다:
	// * 대시보드를 먼저 그리면 → 자식 화면들이 토큰 없이 API를 쏩니다 (전부 401)
	// * 로그인 화면을 먼저 그리면 → 멀쩡한 사용자가 새로고침할 때마다 로그인 폼이 한 번 번쩍입니다
	await bootAuth();

	createRoot(document.getElementById('root')!).render(
		<AppProviders>
			<App />
		</AppProviders>,
	);
})();
// highlight-end
```

:::warning 3개 함수의 위치를 바꾸면 조용히 오류가 생깁니다. 반드시 다음 순서로 적용합니다.
* setupAuthInterceptor() → setupTabSync() → await bootAuth()
* 각 함수의 역할

| 함수이름       | 역할                       |
| :------------ | :------------------------- |
| **setupAuthInterceptor()** | 인증 토큰(Access Token)을 axios headers에 세팅합니다. 다음 호출 api는 모두 적용됩니다. |
| **setupTabSync()** | 모든 브라우저의 탭으로 여러 곳에서 열려있는 화면들이 모두 인증 여부에 따라 같이 적용되게 하기 위한 함수.  |
| **bootAuth()** | 앱 최초 실행 시 이미 인증되어있는지 여부 파악을 위해 세션 복구를 1회 수행. 앱 랜더링 전에 수행하고 앱이 랜더링 되어야 함.  |
:::



#### 선택 — 콘솔 확인 도구(dev 전용) {#dev-probe}
* 실 운영에는 반영되지 않고 개발 시 인증 검증 용도로 사용하기 위하여 적용합니다.

```ts title="src/main.tsx (async 블록 안)"
void (async () => {
	await bootAuth();

	// highlight-start
	if (import.meta.env.DEV) {
		const { registerAuthDevProbe } = await import('@/shared/auth/dev-probe');
		registerAuthDevProbe();      // window.__auth 생성
	}
	// highlight-end

	createRoot(document.getElementById('root')!).render(/* … */);
})();
```

- [ ] 완료




### ◉ 8 (선택) 헤더에 사용자 메뉴 · 로그아웃 붙이기 {#step-usermenu}

* 로그아웃 버튼과 사용자 이름은 대개 **헤더**에 붙습니다. 헤더가 소유주이므로 스캐폴드 레이아웃의 헤더 옆 (`src/shared/layouts/default/components/`, `AppHeader.tsx` 가 있는 폴더) 에 둡니다.
* 그렇지 않으면 각자 해당 프로젝트의 **헤더** 영역의 적절한 위치에 넣어도 됩니다.

:::caution `src/domains/auth` 에 두지 마세요
업무 도메인이 인증 도메인을 직접 import 하게 되어 **도메인 간 의존이 꼬입니다.**
:::

```tsx title="src/shared/layouts/default/components/UserMenu.tsx"
import type { IAppUser } from '@/domains/auth/types';
// highlight-next-line
import { useAuth, useLogout } from '@/shared/auth';

export default function UserMenu(): React.ReactNode {
	// highlight-start
	const { isAuthenticated, user } = useAuth<IAppUser>();
	const { logout, pending } = useLogout();
	// highlight-end

	if (!isAuthenticated) return null;

	return (
		<div className="flex items-center gap-3 text-sm">
			<span className="text-gray-700 dark:text-gray-300">{user?.name ?? '사용자'}</span>
			<button
				type="button"
				onClick={logout}
				disabled={pending}
				className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				{pending ? '로그아웃 중…' : '로그아웃'}
			</button>
		</div>
	);
}
```

만든 컴포넌트를 `AppHeader.tsx` 안에 넣으면 끝입니다.

:::info 로그아웃 후 어디로 갈지는 이 컴포넌트가 정하지 않습니다
`onSessionEnd`([5. 확장 지점](#on-session-end))가 정합니다. `useLogout()` 은 서버 호출이 실패해도 **던지지 않습니다** — 서버가 죽었을 때 로그아웃 버튼이 안 먹으면 그 화면에서 나갈 방법이 없기 때문입니다.
:::

- [ ] 완료

---




## 확장 지점 세 개 {#extension-points}
---
* 인증 관련 설정 변경을 `src/config/auth.config.ts`에서 할 수 있습니다.

### `resolveRoles(user)` — 권한을 꺼내는 방법

```ts
// 문자열 하나로 주는 서버
resolveRoles: (user) => (user.role ? [String(user.role)] : []),

// 배열로 주는 서버
resolveRoles: (user) => (user.roles as string[]) ?? [],

// 중첩돼 있는 서버
resolveRoles: (user) => ((user.auth as { codes?: string[] })?.codes) ?? [],
```

`<ProtectedRoute roles={[...]} />` 와 업무 개발자의 `hasRole()` 이 이 함수를 씁니다.

:::caution 지운 상태에서 `roles` 를 쓰면 **막는 쪽**으로 동작합니다
권한 가드를 안 쓰면 이 항목을 지워도 됩니다. 다만 지운 채로 `roles` 를 지정하면 통과시키지 않고 막습니다(개발 콘솔에 사유가 찍힙니다). 가드가 조용히 열려 있는 것보다 낫기 때문입니다.
:::


### `onLoginSuccess(session)` — 로그인 직후 할 일

```ts
onLoginSuccess: async (session) => {
	await prefetchMenus();          // 메뉴·권한 조회
	trackLogin(session.user);       // 접속 기록
},
```

이 시점에 토큰과 상태는 **이미 확정돼 있습니다.** 여기서 예외를 던지면 에러가 로그인 화면까지 전달되지만 **로그인 자체는 유지됩니다.** 되돌리고 싶으면 이 안에서 `logout()` 을 부르세요.

:::tip 업무 개발자가 "로그인 직후 공통 데이터를 불러야 한다"고 요청하면 여기서 처리합니다
화면마다 따로 짜면 프로젝트가 지저분해지고, 로그인 경로가 늘어날 때마다 빠뜨리는 곳이 생깁니다.
:::


### `onSessionEnd(reason)` — 세션이 끝났을 때 {#on-session-end}

```ts
onSessionEnd: (reason) => {
	if (reason === 'expired') window.$ui?.alert('세션이 만료되었습니다. 다시 로그인해 주세요.');
	window.$router?.replace('/auth/login');
},
```

| `reason` | 언제 |
| --- | --- |
| `logout` | 사용자가 로그아웃했습니다 |
| `expired` | 갱신에 최종 실패했습니다 (세션 만료 · refresh 폐기) |
| `other-tab` | 다른 탭에서 로그아웃했습니다 |

**이동은 스캐폴드가 하지 않습니다.** `src/shared/auth` 는 라우터를 모릅니다(그래야 폴더 단위로 이식되고 테스트도 됩니다). 이 콜백이 없으면 상태만 바뀌고 화면은 그대로입니다. 보호 라우트에 있었다면 `ProtectedRoute` 가 내보내므로 문제없습니다.

```ts
// SSO 를 쓰는 프로젝트
onSessionEnd: () => { window.location.href = 'https://sso.example.com/logout'; },
```

:::note `push` 가 아니라 `replace` 를 쓰는 이유
뒤로가기로 로그아웃 직전 화면에 돌아가지 못하게 하기 위해서입니다.
:::


### 그 밖의 커스터마이즈

| 하고 싶은 것 | 어디서 |
| --- | --- |
| 모든 요청에 공통 헤더 추가 | `src/config/api.config.ts` 의 `headers` |
| 로그인 상태에 따라 동적 헤더 추가 | `src/main.tsx` 에서 `registerRequestInterceptor()` 로 하나 더 등록 |
| access token 수명 · 재시도 정책 | **서버가 정합니다.** 프론트에서 바꿀 값이 아닙니다 |

:::warning `Authorization` 헤더를 `api.config.ts` 에 넣지 마세요
요청 인터셉터(`src/shared/auth`)가 **매 요청마다** 최신 토큰으로 주입합니다. 설정에 박아두면 갱신된 토큰이 반영되지 않습니다.
:::

---




## 검증 {#verify}
---

서버를 붙인 뒤 순서대로 돌립니다.

| # | 조작 | `cookie` | `storage` | `access-only` |
| --- | --- | --- | --- | --- |
| 1 | 토큰 없이 보호 라우트 진입 | 로그인 화면 | 〃 | 〃 |
| 2 | 로그인 후 F5 | 유지 · 깜빡임 없음 · refresh **1회** | 유지 · 네트워크 호출 없음 | 유지 · 네트워크 호출 없음 |
| 3 | Local Storage 확인 | **비어 있다** | access · refresh · user | access · user |
| 4 | Cookies → refresh 쿠키 | HttpOnly ✓ · Path ✓ | 없음 | 없음 |
| 5 | 일반 API 요청 헤더 | Bearer ✓ | Bearer ✓ | Bearer ✓ |
| 6 | access 만료 후 조작 | 자동 갱신 후 성공 | 자동 갱신 후 성공 | **로그인 화면** |
| 7 | API 5개 동시 401 | refresh **1개만** | refresh **1개만** | 해당 없음 |
| 8 | 비밀번호를 틀리게 입력 | **에러 메시지.** 리다이렉트 금지 | 〃 | 〃 |
| 9 | 로그아웃 후 뒤로가기 | 로그인 화면 · 이전 데이터 안 보임 | 〃 · 저장소도 비었는지 | 〃 |
| 10 | 보호 라우트 직접 진입 → 로그인 | 원래 경로로 복귀 | 〃 | 〃 |
| 11 | 탭 둘, 한쪽에서 로그아웃 | 다른 탭도 로그인 화면 | 〃 | 〃 |
| 12 | 권한 없는 계정으로 `roles` 라우트 | `forbiddenPath` 로 이동 | 〃 | 〃 |
| 13 | 개발 콘솔 | 경고 없음 | 하향 경고 1회 | 하향 경고 1회 |


#### 위 6 · 7번은 콘솔 도구로 확인합니다

* 위쪽에서 콘솔 확인 도구(dev 전용) `registerAuthDevProbe()` 를 켰다면 개발자도구 콘솔에서 쓸 수 있습니다.

```js
await __auth.me();       // me 401 → refresh 200 → me 200  (세 줄이 순서대로 떠야 한다)
await __auth.burst(5);   // me 401 x5 → refresh 200 x1 → me 200 x5
```

:::caution `fetch()` 로 직접 찌르면 검증이 성립하지 않습니다
`fetch()` 는 인터셉터를 타지 않습니다. 위 프로브는 core의 axios를 거치므로 "401 → 자동 갱신 → 재시도"를 Network 탭에서 눈으로 볼 수 있습니다.

access token을 빨리 만료시키는 건 **서버 담당에게 요청**하세요 — 프론트에서 정하는 값이 아닙니다.
:::


#### 특히 눈여겨볼 항목

* **8번** — 로그인 실패가 갱신 시도로 번지면 에러 메시지 대신 화면이 튑니다. **Network 탭에 `refresh` 요청이 나가면 실패입니다.**
* **7번** — `refresh` 가 2개 이상이면 회전하는 서버에서 계정이 로그아웃됩니다.
* **2번** — 새로고침에 폼이 번쩍이면 `bootAuth()` 가 렌더 뒤에 있습니다.
* **10번** — 복귀 경로는 history state에 담깁니다. 로그인 화면에서 F5하면 사라지고 홈으로 갑니다. 새로고침 뒤에도 보장해야 하면 `?redirect=` 쿼리 방식으로 바꾸세요.

---




## 업무 개발자에게 공지하기 {#announce}
---

:::danger 세팅이 끝나면 반드시 공지하세요
이걸 안 하면 업무 개발자들이 **각자 401 처리를 짜 넣습니다.** 나중에 정리하는 비용이 훨씬 큽니다.
:::

아래를 복사해 빈칸을 채워 보냅니다.

```text
[인증 세팅 완료 공지]

1. 로그인 화면:  /#/auth/login
2. 개발용 계정:  ____________________________          ← 채우기 (서버 담당에게 받는다)

3. 인증을 위해 여러분이 짜야 할 코드는 없습니다.
   - API 호출 시 토큰을 붙이지 마세요        (자동으로 붙습니다)
   - 401 처리를 짜지 마세요                  (자동 갱신 + 재시도됩니다)
   - 로그인 상태를 따로 스토어에 만들지 마세요 (useAuth 를 쓰세요)

4. 사용자 정보 꺼내기
       const { user } = useAuth<IAppUser>();
   현재 필드:  ____________________________          ← 채우기

5. 권한 이름:  ____________________________          ← 채우기
   버튼·메뉴 감추기:  {hasRole('____') && <Button />}

6. 현재 보호 중인 라우트:  ____________________       ← 채우기
   새 화면을 보호하려면 저에게 요청하세요.

7. 자세한 사용법:  가이드 > jwt인증 적용 (업무)
```

:::info 2 · 4 · 5 · 6번을 빈칸으로 둔 이유
프로젝트마다 실제 값이 다릅니다. **채워 보내야 의미가 있습니다.**
:::

---




## 인증을 쓰지 않는 프로젝트 {#no-auth}
---

**아무것도 안 하면 됩니다.** 스캐폴드 기본 상태가 그것입니다. `src/shared/auth/**` 는 참조되지 않으면 번들에 들어가지 않습니다.

폴더까지 지우고 싶다면 `src/shared/auth` 는 지워도 되지만, **`src/config/auth.config.ts` 는 남깁니다.**

:::warning `auth.config.ts` 를 지우면
다음에 인증이 필요해졌을 때 설정의 모양을 처음부터 다시 알아내야 합니다. 나중에 필요해지면 이 문서로 돌아오세요.
:::

---







## 여기까지가 설정, 그 밖은 코드 {#beyond-config}
---

아래는 **설정으로 흡수하지 않습니다.** 이런 서버를 만나면 `src/shared/auth` 를 그 프로젝트에서 고쳐 쓰는 편이 낫습니다. 억지로 설정으로 우회하면 다음 사람이 더 헤맵니다.

* JWT가 아니라 **세션 쿠키**를 쓰는 서버
* **SSO 리다이렉트**로 토큰을 받는 서버 (로그인 화면 자체가 없는 경우)
* `Authorization` 이 아니라 **커스텀 헤더**(`X-Auth-Token` 등)를 요구하는 서버
* 요청마다 **서명·암호화**를 요구하는 서버

:::caution 고쳐 쓰기로 했다면 두 가지를 하세요
1. **무엇을 왜 고쳤는지 프로젝트 문서에 남깁니다.** 스캐폴드 새 버전을 반입할 때 그 기록이 없으면 덮어써 버립니다.
2. **스캐폴드 담당에게 알립니다.** 설정으로 흡수했어야 할 것을 코드로 고쳤다면 그건 스캐폴드에 확장 지점이 빠진 것이고, 다음 프로젝트도 같은 자리에서 막힙니다.
:::

---




## 부록 A. 파일 소유권
---

스캐폴드는 한 번 주고 끝나는 물건이 아닙니다. 새 버전을 다시 받을 수 있으므로 **덮어써도 되는 것과 우리 것이 갈려 있어야 합니다.**

| 소유 | 경로 | 성격 |
| --- | --- | --- |
| **스캐폴드 소유** | `src/shared/auth/**` | 로직 · 전략 · 인터셉터 · 훅 · 게이트. **열지 않는다.** 새 버전으로 덮어써도 안전 |
| | `src/types/auth.ts` | 인증 모듈이 쓰는 형태. 서버에 따라 안 바뀐다 |
| **이 프로젝트 소유** | `.env` | 주소 · 저장소 키 |
| | `src/config/auth.config.ts` | 설정 + 확장 지점 3개 (**지우지 않는다**) |
| | `src/domains/auth/**` | 타입 · 로그인 화면 · 라우트 — 이 문서에서 만든 것 전부 |
| | `src/shared/router/index.tsx` | 어느 라우트를 보호할지 |
| | `src/main.tsx` | 부팅 배선 세 줄 |

:::info `src/domains/auth/**` 는 전부 프로젝트 소유입니다
스캐폴드가 예제를 넣어주지 않으므로 새 버전을 반입해도 이 폴더는 **충돌하지 않습니다.**
:::

---




## 부록 B. 안 될 때 (트러블슈팅)
---

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 로그인은 200인데 그 뒤 모든 요청이 401 | `extractAccessToken` 이 응답과 안 맞다 | 콘솔에 "accessToken 을 꺼내지 못했습니다"가 뜨면 확실하다. 응답 body를 보고 키를 맞춘다 |
| 404가 난다 | 경로 조합이 틀렸다 | `VITE_API_BASE_URL` + `endpoints.*` 를 Network 탭의 실제 URL과 대조 |
| 로그인 화면 대신 404 | `loginPath` 가 가리키는 라우트가 없다 | [4.5](#step-route) 를 먼저 한다 |
| 무한 리다이렉트 | `/auth` 가 `ProtectedRoute` 안에 있다 | 게이트 바깥으로 뺀다 |
| 무한 갱신 루프 | 서버가 갱신 엔드포인트에 인증 미들웨어를 걸었다 | 서버 담당에게 (요구사항 1번) |
| 로그인 실패인데 화면이 튄다 | 서버가 로그인 실패에 401이 아닌 다른 코드를 준다 | 서버 담당에게 확인 |
| 새로고침하면 로그아웃된다 | `cookie` 전략인데 쿠키가 안 온다 | CORS · 쿠키 속성 확인 (요구사항 5·6번) |
| 새로고침마다 로그인 폼이 번쩍인다 | `bootAuth()` 가 렌더 뒤에 있다 | 렌더 전에 await |
| 첫 요청에만 토큰이 안 붙는다 | `setupAuthInterceptor()` 가 async 블록 안에 있다 | 모듈 최상단으로 옮긴다 |
| 탭 두 개를 켜두면 가끔 로그아웃된다 | 동시 갱신이 회전에 걸렸다 | 서버에 유예 요청 (요구사항 4번) |
| `hasRole()` 이 항상 false | `resolveRoles` 가 없거나 권한 이름이 다르다 | 콘솔에 사유가 찍힌다 |
| 사용자 이름이 안 나온다 | `extractUser` 매핑이 안 맞다 | 응답 body와 `IAppUser` 를 대조 |
| 컴파일이 안 된다 (`authConfig` 없음) | `src/config/auth.config.ts` 를 지웠다 | 파일을 되살린다 (값만 비워도 된다) |

---




## 완료 체크리스트
---

- [ ] [2. 서버 담당에게 물어볼 것](#ask-server) — 7개 질문에 답을 받았다
- [ ] [3. 저장 전략](#strategy) — `cookie` / `storage` / `access-only` 중 골랐다
- [ ] [4.1 `.env`](#step-env) — 주소를 프로젝트 서버로 바꾸고 dev 서버를 재시작했다
- [ ] [4.2 `types.ts`](#step-types) — `ILoginCredentials` · `IAppUser` 를 서버에 맞췄다
- [ ] [4.3 `auth.config.ts`](#step-config) — 전략 · 엔드포인트 · 응답 매핑을 채웠다
- [ ] [4.4 `LoginIndex.tsx`](#step-login-page) — 로그인 화면을 만들었다
- [ ] [4.5 `router/index.tsx`](#step-route) — `loginPath` 와 경로가 일치한다
- [ ] [4.6 게이트 배선](#step-gate) — `/auth` 는 게이트 바깥, 업무 라우트는 안
- [ ] [4.7 부팅 배선](#step-boot) — 인터셉터는 최상단, `bootAuth()` 는 렌더 전
- [ ] [6. 검증](#verify) — 13개 항목을 실서버로 확인했다
- [ ] [7. 공지](#announce) — 빈칸을 채워 업무 개발자에게 전달했다
