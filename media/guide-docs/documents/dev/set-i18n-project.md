---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "다국어 세팅"
---


# 다국어 세팅(작업중)

이 프로젝트는 **i18next** 기반의 다국어(i18n) 시스템을 사용합니다.  
인증 토큰 유무에 따라 번역 데이터 로딩 경로를 자동으로 분기하며, 빌드 번들 내장 폴백까지 3단계 안전망을 갖추고 있습니다.

---





## 내용 요약

- [디렉토리 구조](#디렉토리-구조) — `src/i18n/` 하위 파일 구조와 역할 설명
- [초기화 방법](#초기화-방법) — `Bootstrap.tsx`에서 `setupI18n(getToken)` 호출 방법
- [3단계 폴백 레이어](#3단계-폴백-레이어) — 로그인 전/후 번역 로딩 경로와 장애 시 폴백 흐름
- [네임스페이스 관리](#네임스페이스namespace-관리) — `namespaces.ts` 구조 및 새 NS 추가 방법
- [환경변수 설정](#환경변수-설정-env) — `.env`에서 설정 가능한 변수 목록 및 기본값
- [언어 자동 감지 정책](#언어-자동-감지-정책) — `localStorage` → `navigator` 순서의 감지 흐름
- [번역 파일 작성 규칙](#번역-파일-작성-규칙) — JSON 파일 구조 예시
- 사용 가능한 함수 정리:
  - [`setupI18n()`](#setupi18ngettoken--i18n-초기화) — 앱 최초 초기화
  - [`reloadI18nAfterLogin()`](#reloadi18nafterlogin--로그인-후-번역-재로드) — 로그인 후 AUTH NS 갱신
  - [`invalidateI18nOnLogout()`](#invalidatei18nonlogout--로그아웃-후-캐시-정리) — 로그아웃 후 캐시 정리
  - [`prefetchGuestTranslations()`](#prefetchguesttranslations--게스트-번역-강제-재로드) — GUEST NS 강제 재로드
  - [`useTranslation`](#usetranslation--컴포넌트에서-번역-사용) — 컴포넌트에서 번역 사용
  - [`i18n.changeLanguage`](#i18nchangelanguage--언어-변경) — 언어 변경
  - [`AuthBackend.invalidateCache`](#authbackendinvalidatecache--번역-캐시-수동-무효화) — 캐시 수동 무효화
- [로그인/로그아웃 생명주기 연동 요약](#로그인로그아웃-생명주기-연동-요약)






## 디렉토리 구조

```
src/i18n/
├── setup.ts                  # i18n 초기화 진입점 (setupI18n 함수)
├── AuthBackend.ts            # 커스텀 백엔드 플러그인 (토큰 기반 번역 로더)
└── config/
    ├── i18n.config.ts        # i18next init 옵션 정의
    ├── namespaces.ts         # 네임스페이스 및 기본 언어 관리
    ├── detection.config.ts   # 언어 자동 감지 정책
    └── resources.ts          # 번들 내장 폴백 번역 자동 수집

src/i18n/locales/
├── ko/
│   ├── common.json           # 공통 번역 (버튼, 에러 메시지 등)
│   └── main.json             # 메인 화면 전용 번역
└── en/
    ├── common.json
    └── main.json
```

---

## 초기화 방법

`Bootstrap.tsx`에서 앱 렌더링 전에 `setupI18n(getToken)`을 호출합니다.  
`getToken`은 실제 auth 스토어(zustand, redux 등)의 액세스 토큰 getter를 주입합니다.

```tsx
import { setupI18n } from './i18n/setup';

const getToken = (): string | null => localStorage.getItem('access_token');

setupI18n(getToken).then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
```

> i18n 초기화가 완료된 후 렌더링을 시작하므로, 첫 화면부터 번역 텍스트가 정상적으로 표시됩니다.

---

## 3단계 폴백 레이어

| 단계 | 출처 | 설명 |
|------|------|------|
| 1단계 | `public/locales/*.json` | 운영 번역 파일 (빌드 없이 교체 가능) |
| 2단계 | retry | 일시적 네트워크 장애 자동 재시도 |
| 3단계 | 번들 내장 JSON | 최후 안전망 (빌드에 포함된 비상용 데이터) |

- **토큰 없음(로그인 전)**: `publicLoadPath`의 정적 JSON 파일 fetch → 실패 시 번들 폴백
- **토큰 있음(로그인 후)**: `loadPath` API를 Bearer 토큰과 함께 호출 → 실패(401 포함) 시 번들 폴백

---

## 네임스페이스(Namespace) 관리

네임스페이스는 `src/i18n/config/namespaces.ts`에서 중앙 관리합니다.

```ts
export const NAMESPACES = ['common', 'main'] as const;
export type Namespace = (typeof NAMESPACES)[number]; // 'common' | 'main'
export const DEFAULT_NS: Namespace = 'common';
export const FALLBACK_LNG = import.meta.env.VITE_I18N_FALLBACK_LNG ?? 'ko';

// 게스트(로그인 전) 화면에서 사용하는 NS
export const GUEST_NAMESPACES: readonly Namespace[] = ['common'];

// 로그인 후 서버에서 최신 번역을 로드하는 NS
export const AUTH_NAMESPACES: readonly Namespace[] = ['main'];
```

### 새 네임스페이스 추가 방법

1. `NAMESPACES` 배열에 새 NS 이름 추가
2. 번역 파일 생성 (`resources.ts`가 자동으로 인식)

```
src/i18n/locales/ko/{네임스페이스}.json
src/i18n/locales/en/{네임스페이스}.json
```

> `i18n.config.ts`, `resources.ts`는 수정 불필요합니다.

---

## 환경변수 설정 (`.env`)

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `VITE_I18N_LOAD_PATH` | 로그인 후 번역 API 경로 (`{{lng}}`, `{{ns}}` 치환자 사용) | `/api/i18n/translations?lng={{lng}}&ns={{ns}}` |
| `VITE_I18N_PUBLIC_LOAD_PATH` | 로그인 전 정적 JSON 경로 | `/locales/{{lng}}/{{ns}}.json` |
| `VITE_I18N_CACHE_TTL` | 번역 캐시 유지 시간(ms) | `300000` (5분) |
| `VITE_I18N_FALLBACK_LNG` | 폴백 언어 코드 | `ko` |

---

## 언어 자동 감지 정책

`src/i18n/config/detection.config.ts`에서 관리합니다.

- **감지 순서**: `localStorage` → `navigator` (브라우저 언어 설정)
- **저장 위치**: `localStorage['i18n_language']`

```
앱 시작
  → localStorage['i18n_language'] 확인
  → 있으면 해당 언어 사용
  → 없으면 navigator.language(브라우저 설정) 사용
  → 결정된 언어를 localStorage에 저장
```

---

## 번역 파일 작성 규칙

파일 위치: `src/i18n/locales/{언어코드}/{네임스페이스}.json`

```json title="src/i18n/locales/ko/common.json"
{
  "btn.confirm": "확인",
  "btn.cancel": "취소",
  "btn.close": "닫기",
  "error.network": "네트워크 오류가 발생했습니다.",
  "label.loading": "로딩 중..."
}
```

```json title="src/i18n/locales/en/main.json"
{
  "nav.home": "Home",
  "page.home.title": "Main Home",
  "page.home.welcome": "Welcome"
}
```

> 파일명(확장자 제외)이 곧 i18next 네임스페이스 키가 됩니다.  
> `namespaces.ts`의 `NAMESPACES` 배열 값과 파일명을 반드시 일치시켜야 합니다.

---

## 사용 가능한 함수 및 기능

### `setupI18n(getToken)` — i18n 초기화

```ts
import { setupI18n } from './i18n/setup';

setupI18n(getToken: () => string | null): Promise<typeof i18n>
```

앱 최초 실행 시 한 번 호출합니다. `getToken`으로 auth 스토어의 토큰 getter를 주입합니다.

---

### `reloadI18nAfterLogin()` — 로그인 후 번역 재로드

```ts
import { reloadI18nAfterLogin } from './i18n/setup';

await reloadI18nAfterLogin();
```

로그인 성공 직후 호출합니다. `AUTH_NAMESPACES`(`main`)의 번역을 서버에서 최신으로 갱신합니다.  
AuthBackend 캐시를 먼저 무효화하여 반드시 서버에서 최신 데이터를 가져옵니다.

---

### `invalidateI18nOnLogout()` — 로그아웃 후 캐시 정리

```ts
import { invalidateI18nOnLogout } from './i18n/setup';

invalidateI18nOnLogout();
```

로그아웃 직후 호출합니다. `AUTH_NAMESPACES`(`main`)의 캐시만 선택적으로 삭제합니다.  
`GUEST_NAMESPACES`(`common`)의 캐시는 다음 게스트 세션에서도 재사용 가능하도록 유지됩니다.

---

### `prefetchGuestTranslations()` — 게스트 번역 강제 재로드

```ts
import { prefetchGuestTranslations } from './i18n/setup';

await prefetchGuestTranslations();
```

`setupI18n()` 내부에서 이미 초기 로드를 수행하므로 일반적으로 수동 호출은 불필요합니다.  
운영 중 `public/locales` 파일을 교체하고 즉시 반영하고 싶을 때 사용합니다.

---

### `useTranslation` — 컴포넌트에서 번역 사용

```tsx
import { useTranslation } from 'react-i18next';

// 단일 네임스페이스
const { t } = useTranslation('common');
t('btn.confirm'); // → '확인'

// 복수 네임스페이스
const { t } = useTranslation(['common', 'main']);
t('common:btn.cancel');     // → '취소'
t('main:page.home.title');  // → '메인 홈'

// 네임스페이스 미지정 시 DEFAULT_NS('common') 사용
const { t } = useTranslation();
t('btn.login'); // → '로그인'
```

---

### `i18n.changeLanguage` — 언어 변경

```ts
import { i18n } from '@axiom/mfe-lib-shared/i18n';

await i18n.changeLanguage('en'); // 영어로 변경
await i18n.changeLanguage('ko'); // 한국어로 변경
```

변경된 언어는 `localStorage['i18n_language']`에 자동 저장되어 다음 방문 시에도 유지됩니다.

---

### `AuthBackend.invalidateCache` — 번역 캐시 수동 무효화

```ts
import { i18n } from '@axiom/mfe-lib-shared/i18n';
import type { AuthBackend } from './i18n/AuthBackend';

const backend = i18n.services?.backendConnector?.backend as AuthBackend;

// 특정 언어/네임스페이스만 무효화
backend.invalidateCache('ko', 'main');

// 전체 캐시 무효화
backend.invalidateCache();
```

긴급 공지, 약관 변경 등 번역 데이터를 즉시 갱신해야 하는 상황에서 사용합니다.

---

## 로그인/로그아웃 생명주기 연동 요약

| 시점 | 호출 함수 | 동작 |
|------|-----------|------|
| 앱 최초 실행 | `setupI18n(getToken)` | i18n 초기화 + 게스트 NS 로드 |
| 로그인 성공 직후 | `reloadI18nAfterLogin()` | AUTH NS 서버에서 최신 번역 로드 |
| 로그아웃 직후 | `invalidateI18nOnLogout()` | AUTH NS 캐시 삭제 |
| 운영 중 번역 즉시 반영 | `prefetchGuestTranslations()` | GUEST NS 강제 재로드 |
