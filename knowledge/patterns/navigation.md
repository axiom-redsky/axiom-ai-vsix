---
title: "화면 이동 / 네비게이션 버튼 패턴"
tags: [navigate, navigation, 이동, 이동버튼, 이동하는, 네비게이션, 화면이동, 페이지이동, 뒤로가기, 이전페이지, 루트로이동, 메인으로이동, 버튼추가, 이동코드, router.push, $router, go, push, back, 루트, 메인]
scope: pattern
related: [patterns/router.md]
---

# 화면 이동 / 네비게이션 버튼 패턴

react-app-scaffold에서 화면 이동은 **전역 `$router` 객체**를 사용한다.

> ⚠️ **`useNavigate()` 사용 금지.** `$router`는 import 없이 컴포넌트 내·외부 어디서나 사용 가능한 전역 객체다.

---

## 기본 패턴 — 이동 버튼 추가

`onClick`에 인라인 화살표 함수로 `$router.push()`를 직접 호출한다. 별도 핸들러 함수 불필요.

```tsx
import type React from 'react';
import { Button } from '@axiom/components/ui';

export default function AccountIndex(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">계좌메인화면</h1>

      {/* 페이지 콘텐츠 */}

      <div className="flex gap-2 mt-4">
        <Button onClick={() => $router.push('/account/usage-history')}>
          계좌이용내역화면으로 이동
        </Button>
      </div>
    </div>
  );
}
```

---

## $router 메서드 정리

| 메서드 | 동작 |
|------|------|
| `$router.push('/path')` | 히스토리 스택에 추가하며 이동 |
| `$router.replace('/path')` | 현재 히스토리를 덮어쓰며 이동 (뒤로가기 불가) |
| `$router.back()` | 이전 페이지로 이동 |

---

## 이동 경로별 예시

```tsx
{/* 루트(메인) 페이지로 이동 */}
<Button onClick={() => $router.push('/')}>메인으로 이동</Button>

{/* 특정 도메인 페이지로 이동 */}
<Button onClick={() => $router.push('/example/account-list')}>목록으로</Button>

{/* 이전 페이지로 이동 */}
<Button onClick={() => $router.back()}>뒤로가기</Button>

{/* 히스토리 교체하며 이동 */}
<Button onClick={() => $router.replace('/login')}>로그인으로</Button>
```

---

## 기존 파일 수정 시 axiom-action 형식 (시나리오 C)

현재 열린 파일에 이동 버튼을 추가할 때는 `updateFile` axiom-action 1개만 생성한다.  
`Button`을 import하고, `onClick`에 `$router.push()`를 인라인으로 사용한다.

```
<axiom-action>
{"action":"updateFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"{현재 파일 경로}"}
```tsx
// import { Button } from '@axiom/components/ui'; 추가 (없다면)
// Button onClick={() => $router.push('/이동경로')} 버튼 추가된 전체 파일 내용
```
</axiom-action>
```

## 규칙 요약

- `$router`는 **import 불필요** (전역 객체)
- `useNavigate`, `react-router` 훅 **사용 금지**
- 버튼은 `<Button>` (`@axiom/components/ui`) 사용
- `onClick`은 인라인 화살표 함수: `onClick={() => $router.push('/path')}`
- 별도 핸들러 함수 선언 **불필요**
