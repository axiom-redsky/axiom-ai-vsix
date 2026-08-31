---
sidebar_position: 3
displayed_sidebar: "componentsDocSidebar"
title: "Avatar"
hide_table_of_contents: false
---

# Avatar 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 아바타 컴포넌트입니다.  
**사용자·조직을 나타내는 프로필 이미지**를 일정한 크기의 원형 프레임으로 보여주고, 이미지가 없거나 로드에 실패하면 **이니셜·아이콘으로 자동 대체**합니다.

**언제 쓰나요?**

- 게시글 작성자, 댓글 작성자, 채팅 상대처럼 **"누가"** 를 한눈에 보여줄 때
- 헤더 우상단의 **내 계정 표시**(드롭다운 트리거)
- 결재선·참여자 목록처럼 **여러 사람을 나란히/겹쳐** 표시할 때
- 접속 상태(온라인·자리비움) 같은 **작은 상태 신호**를 프로필에 겹쳐 붙일 때

> 프로필 이미지는 언제든 404·네트워크 실패가 날 수 있으므로 **`AvatarImage`와 `AvatarFallback`은 항상 같이** 씁니다. (아래 [Fallback — 이미지가 없을 때](#2-fallback--이미지가-없을-때) 참고)

---

## Import

---

```tsx
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "@axiom/components/ui";
```

Avatar는 **여러 파트를 조합해서** 쓰는 합성(compound) 컴포넌트입니다. 기본 조합은 `Avatar` + `AvatarImage` + `AvatarFallback` 3개이고, 상태 뱃지(`AvatarBadge`)와 그룹(`AvatarGroup` · `AvatarGroupCount`)은 필요할 때만 추가합니다. 각 파트의 역할은 [구성(Anatomy)](#구성-anatomy)에서 설명합니다.

---

## 기본 사용법

---

가장 기본적인 형태입니다. **이미지가 정상 로드되면 이미지가**, 실패하거나 아직 로드 중이면 **`AvatarFallback`의 내용(이니셜)이** 보입니다.

<img
  src="../assets/ui/avatar-basic.png"
  alt="기본 사용법"
  width="80%"
/>

```tsx
<Avatar>
  <AvatarImage src="/users/kim.png" alt="김닉" />
  <AvatarFallback>김닉</AvatarFallback>
</Avatar>

<Avatar>
  <AvatarImage src="/users/lee.png" alt="이수미" />
  <AvatarFallback>이수</AvatarFallback>
</Avatar>

<Avatar>
  <AvatarImage src="/users/park.png" alt="박결재" />
  <AvatarFallback>박결</AvatarFallback>
</Avatar>
```

- `src` — 프로필 이미지 경로(서버 URL·정적 파일·data URI 모두 가능)
- `alt` — 이미지의 대체 텍스트. **스크린리더가 읽는 유일한 이름**이므로 사람 이름을 그대로 넣습니다.
- `AvatarFallback`의 자식 — 이미지가 안 보일 때 표시할 내용(이니셜 2글자 권장)

:::tip Fallback을 생략하지 마세요
`AvatarImage`는 **로드에 성공한 뒤에야** 렌더됩니다. 즉 `AvatarFallback`이 없으면 이미지 로드 실패 시 **빈 원**만 남습니다. 이니셜이든 아이콘이든 항상 채워 두세요.
:::

---

## 구성 (Anatomy)

---

Avatar는 아래 파트를 조합해서 구성합니다.

```tsx
<AvatarGroup>
  {" "}
  {/* (선택) 여러 아바타를 겹쳐 쌓는 컨테이너 */}
  <Avatar>
    {" "}
    {/* 루트 — 원형 프레임. size 로 크기 결정 */}
    <AvatarImage /> {/* 프로필 이미지 (로드 성공 시에만 렌더) */}
    <AvatarFallback /> {/* 이미지가 없을 때 대체 (이니셜·아이콘) */}
    <AvatarBadge /> {/* (선택) 우하단 상태 뱃지 */}
  </Avatar>
  <AvatarGroupCount /> {/* (선택) 남은 인원 수 "+N" */}
</AvatarGroup>
```

| 파트               | 역할                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `Avatar`           | 루트. 원형 프레임과 크기(`size`)를 담당하고, 하위 파트의 기준이 됩니다. |
| `AvatarImage`      | 프로필 이미지. **로드 성공 시에만** 화면에 나타납니다.                  |
| `AvatarFallback`   | 이미지가 없거나 로드 실패했을 때 보여줄 대체 콘텐츠(이니셜·아이콘).     |
| `AvatarBadge`      | 아바타 우하단에 겹쳐 붙는 작은 뱃지(접속 상태·결재 상태 등).            |
| `AvatarGroup`      | 여러 `Avatar`를 살짝 겹쳐서 가로로 쌓는 컨테이너.                       |
| `AvatarGroupCount` | 그룹 끝에 붙는 `+N` 카운트 칩.                                          |

:::note 루트 크기는 하위 파트로 전파됩니다
`Avatar`는 자신에게 `data-size`를 심고 CSS 그룹(`group/avatar`)으로 동작합니다. 그래서 **`Avatar`의 `size`만 지정하면** 안쪽 `AvatarFallback`의 글자 크기, `AvatarBadge`의 점 크기까지 함께 맞춰집니다. `AvatarBadge`는 반드시 `Avatar` **안에** 두어야 이 크기 연동이 동작합니다.
:::

---

## 동작 옵션

---

Avatar의 표시 방식은 아래 옵션들로 결정됩니다. 필요한 것만 골라 쓰세요.

### 1. 크기 — `size`

`Avatar`의 `size`로 3단계 크기를 지정합니다.

<img
  src="../assets/ui/avatar-size.png"
  alt="아바타 크기 3단계"
  width="80%"
/>

```tsx
<Avatar size="sm"> … </Avatar>       {/* 24px */}
<Avatar size="default"> … </Avatar>  {/* 32px — 기본값(생략 가능) */}
<Avatar size="lg"> … </Avatar>       {/* 40px */}
```

| `size`      | 지름 | 사용처                                      |
| ----------- | ---- | ------------------------------------------- |
| `"sm"`      | 24px | 목록의 행 안, 촘촘한 테이블 셀, 댓글 스레드 |
| `"default"` | 32px | 대부분의 화면(기본값)                       |
| `"lg"`      | 40px | 프로필 헤더, 상세 카드, 결재선              |

:::info 3단계로 부족하다면
`size`는 **자주 쓰는 3단계를 고정 제공**하는 프리셋입니다. 그 밖의 크기가 필요하면 `className`으로 덮어쓰거나(`<Avatar className="size-16">`), CSS Module에서 `[data-slot="avatar"]`의 `width/height`를 지정하세요. ([스타일링 & 테마](#스타일링--테마) 참고)
:::

### 2. Fallback — 이미지가 없을 때

`AvatarFallback`은 다음 세 경우에 화면에 나타납니다.

1. `AvatarImage`를 **아예 쓰지 않은** 경우 (프로필 이미지가 없는 사용자)
2. `src`가 **로드에 실패한** 경우 (404·네트워크 오류·잘못된 경로)
3. 이미지가 **아직 로드 중**인 경우 (`delayMs`를 주면 이 구간을 건너뛸 수 있음 → [3. 깜빡임 방지](#3-깜빡임-방지--delayms))

<img
  src="../assets/ui/avatar-fallback.png"
  alt="Fallback — 이니셜·아이콘·이미지 실패"
  width="80%"
/>

```tsx
{
  /* 이니셜 */
}
<Avatar>
  <AvatarFallback>김닉</AvatarFallback>
</Avatar>;

{
  /* 아이콘 */
}
<Avatar>
  <AvatarFallback>
    <User className="size-4" />
  </AvatarFallback>
</Avatar>;

{
  /* 이미지 로드 실패 → Fallback 자동 노출 */
}
<Avatar>
  <AvatarImage src="/this-image-does-not-exist.png" alt="깨진 이미지" />
  <AvatarFallback>NA</AvatarFallback>
</Avatar>;
```

- 기본 스타일은 `--muted` 배경 + `--muted-foreground` 글자색이며, `size="sm"`이면 글자가 자동으로 한 단계 작아집니다.
- 이니셜은 **2글자**를 권장합니다(한글 성+이름 첫 글자, 영문 이니셜 2자). 원이 작아 3글자 이상은 잘립니다.

:::caution 이미지 경로가 없으면 `AvatarImage` 자체를 렌더하지 마세요
`src={undefined}`로 `AvatarImage`를 남겨두는 것보다, 값이 없을 때는 조건부로 **컴포넌트를 그리지 않는** 편이 명확합니다.

```tsx
<Avatar>
  {user.img && <AvatarImage src={user.img} alt={user.name} />}
  <AvatarFallback>{user.initials}</AvatarFallback>
</Avatar>
```

:::

### 3. 깜빡임 방지 — `delayMs`

이미지가 **빨리 로드되는 경우**, 로드 직전 잠깐 나타났다 사라지는 이니셜이 깜빡임처럼 보일 수 있습니다. `AvatarFallback`에 `delayMs`를 주면 **그 시간만큼 기다린 뒤에도** 이미지가 안 뜰 때만 Fallback을 보여줍니다.

```tsx
<Avatar>
  <AvatarImage src={user.img} alt={user.name} />
  {/* 600ms 안에 이미지가 뜨면 이니셜은 아예 나타나지 않음 */}
  <AvatarFallback delayMs={600}>김닉</AvatarFallback>
</Avatar>
```

- 사내망처럼 **이미지가 거의 즉시 뜨는** 환경이면 `delayMs`를 주는 편이 깔끔합니다.
- 반대로 **느린 회선**에서는 값이 클수록 빈 원이 오래 보이므로 300~600ms 정도가 무난합니다.

### 4. 로드 상태 감지 — `onLoadingStatusChange`

이미지 로드 성공/실패를 화면 로직에서 알아야 할 때 사용합니다. (실패 시 기본 이미지로 교체, 로깅 등)

```tsx
import { useState } from "react";

function UserAvatar({ user }) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'loaded' | 'error'

  return (
    <>
      <Avatar>
        <AvatarImage
          src={user.img}
          alt={user.name}
          // highlight-next-line
          onLoadingStatusChange={setStatus}
        />
        <AvatarFallback>{user.initials}</AvatarFallback>
      </Avatar>

      {status === "error" && <span>프로필 이미지를 불러오지 못했습니다.</span>}
    </>
  );
}
```

- 콜백 인자는 `"idle" | "loading" | "loaded" | "error"` 입니다.
- **단순히 대체 표시만** 하려면 이 콜백 없이 `AvatarFallback`만으로 충분합니다. 상태를 화면 다른 곳에서 쓸 때만 사용하세요.

### 5. 상태 뱃지 — `AvatarBadge`

아바타 우하단에 작은 뱃지를 겹쳐 붙입니다. 접속 상태(온라인·자리비움·오프라인)나 결재 상태 같은 신호에 씁니다.

<img
  src="../assets/ui/avatar-badge.png"
  alt="AvatarBadge 상태 표시"
  width="80%"
/>

```tsx
{
  /* 온라인(초록 점) */
}
<Avatar size="lg">
  <AvatarImage src="/users/kim.png" alt="김닉" />
  <AvatarFallback>김닉</AvatarFallback>
  // highlight-next-line
  <AvatarBadge className="bg-emerald-500" />
</Avatar>;

{
  /* 자리비움(노랑 점) */
}
<Avatar size="lg">
  …
  <AvatarBadge className="bg-amber-500" />
</Avatar>;

{
  /* 아이콘을 넣은 뱃지 */
}
<Avatar size="lg">
  …
  <AvatarBadge>
    <Check strokeWidth={3} />
  </AvatarBadge>
</Avatar>;
```

- 기본 색은 `--primary`이며, 색은 `className`으로 바꿉니다.
- 뱃지 크기는 부모 `Avatar`의 `size`를 따라 자동 조절됩니다(sm 8px / default 10px / lg 12px).
- `--background` 색의 링이 둘러져 있어 어떤 배경 위에서도 아바타와 뱃지가 분리돼 보입니다.

:::caution `size="sm"`에서는 뱃지 안 아이콘이 숨겨집니다
24px 아바타의 뱃지는 8px이라 아이콘이 뭉개지므로, **`sm`에서는 아이콘이 자동으로 숨겨지고 점만** 남습니다. 아이콘이 꼭 보여야 한다면 `size="default"` 이상을 쓰세요.
:::

### 6. 겹쳐 쌓기 — `AvatarGroup` · `AvatarGroupCount`

여러 사용자를 살짝 겹쳐 표시하고, 다 보여주지 못한 인원은 `+N`으로 요약합니다.

<img
  src="../assets/ui/avatar-group.png"
  alt="AvatarGroup 겹쳐 쌓기"
  width="80%"
/>

```tsx
<AvatarGroup>
  <Avatar size="lg">
    <AvatarImage src="/users/kim.png" alt="김닉" />
    <AvatarFallback>김닉</AvatarFallback>
  </Avatar>
  <Avatar size="lg">
    <AvatarImage src="/users/lee.png" alt="이수미" />
    <AvatarFallback>이수</AvatarFallback>
  </Avatar>
  <Avatar size="lg">
    <AvatarImage src="/users/park.png" alt="박결재" />
    <AvatarFallback>박결</AvatarFallback>
  </Avatar>
  // highlight-next-line
  <AvatarGroupCount>+5</AvatarGroupCount>
</AvatarGroup>
```

- 겹침 간격과 아바타 둘레의 링(`--background` 색)은 `AvatarGroup`이 자식들에게 자동으로 넣어 줍니다.
- **크기는 `AvatarGroup`이 아니라 각 `Avatar`의 `size`로 지정**합니다. `AvatarGroupCount`는 그룹 안 아바타의 크기를 읽어 자기 크기를 맞춥니다.
- `AvatarGroupCount`의 내용은 자유입니다 — `+5`, `99+`, 아이콘 등.

:::caution 그룹 안에서는 크기를 통일하세요
`AvatarGroupCount`는 **그룹 안에 특정 `size`의 아바타가 있는지**를 보고 자기 크기를 정합니다. 그룹 안에 `sm`과 `lg`를 섞으면 카운트 칩 크기가 의도대로 나오지 않습니다. 한 그룹 안의 `Avatar`는 **모두 같은 `size`** 로 맞추세요.
:::

---

## API 레퍼런스

---

`Avatar` · `AvatarImage` · `AvatarFallback`은 **Radix Avatar** 기반이라, 아래 표에 없는 Radix 표준 prop(`asChild` 등)과 DOM 속성도 그대로 전달됩니다. 자주 쓰는 것만 정리합니다.

### `Avatar` (루트)

| Prop        | 타입                        | 기본값      | 설명                                             |
| ----------- | --------------------------- | ----------- | ------------------------------------------------ |
| `size`      | `"sm" \| "default" \| "lg"` | `"default"` | 아바타 지름 (24 / 32 / 40px)                     |
| `children`  | `ReactNode`                 | —           | `AvatarImage` · `AvatarFallback` · `AvatarBadge` |
| `className` | `string`                    | —           | 루트에 추가할 클래스                             |
| `asChild`   | `boolean`                   | `false`     | 자식 요소로 렌더 요소 교체(Radix)                |

### `AvatarImage`

| Prop                    | 타입               | 기본값 | 설명                                              |
| ----------------------- | ------------------ | ------ | ------------------------------------------------- |
| `src`                   | `string`           | —      | 프로필 이미지 경로. **로드 성공 시에만** 렌더됨   |
| `alt`                   | `string`           | —      | 대체 텍스트(접근성). 사람 이름을 넣습니다         |
| `onLoadingStatusChange` | `(status) => void` | —      | `"idle" \| "loading" \| "loaded" \| "error"` 전달 |
| `className`             | `string`           | —      | 이미지에 추가할 클래스                            |

> 그 외 `<img>`의 표준 속성(`referrerPolicy`, `crossOrigin`, `loading` 등)도 그대로 전달됩니다.

### `AvatarFallback`

| Prop        | 타입        | 기본값 | 설명                                                  |
| ----------- | ----------- | ------ | ----------------------------------------------------- |
| `children`  | `ReactNode` | —      | 이미지 미표시 시 대체 콘텐츠(이니셜·아이콘)           |
| `delayMs`   | `number`    | —      | 이 시간 이후에도 이미지가 없을 때만 노출(깜빡임 방지) |
| `className` | `string`    | —      | 대체 영역에 추가할 클래스                             |

### `AvatarBadge`

| Prop        | 타입        | 기본값 | 설명                                       |
| ----------- | ----------- | ------ | ------------------------------------------ |
| `children`  | `ReactNode` | —      | 뱃지 내용(보통 아이콘, 비우면 점만 표시)   |
| `className` | `string`    | —      | 색상 등 커스터마이즈 (`bg-emerald-500` 등) |

> `<span>` 기반이라 표준 DOM 속성(`aria-label`, `title`, `style` …)을 그대로 받습니다. **`Avatar` 안에 두어야** 크기 연동이 동작합니다.

### `AvatarGroup`

| Prop        | 타입        | 기본값 | 설명                                      |
| ----------- | ----------- | ------ | ----------------------------------------- |
| `children`  | `ReactNode` | —      | 겹쳐 쌓을 `Avatar`들 + `AvatarGroupCount` |
| `className` | `string`    | —      | 겹침 간격 조정 등 (`-space-x-3`)          |

### `AvatarGroupCount`

| Prop        | 타입        | 기본값 | 설명                      |
| ----------- | ----------- | ------ | ------------------------- |
| `children`  | `ReactNode` | —      | 남은 인원 표시 (예: `+5`) |
| `className` | `string`    | —      | 카운트 칩에 추가할 클래스 |

> `<div>` 기반입니다. 크기는 같은 그룹 안 `Avatar`의 `size`를 따라갑니다.

---

## 접근성

---

Avatar는 **기본적으로 장식(presentational) 요소**입니다. 의미 전달은 대부분 `alt` 텍스트가 담당하므로, 아래 몇 가지만 지키면 됩니다.

| 상황                       | 해야 할 것                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| 이미지 아바타              | `AvatarImage`에 **`alt`로 사람 이름**을 넣습니다.                                        |
| 이니셜 Fallback            | 이니셜 텍스트가 그대로 읽히므로 추가 조치 불필요.                                        |
| 아이콘 Fallback            | 아이콘만으로는 이름을 알 수 없으므로 `Avatar`에 `aria-label="김닉"`을 줍니다.            |
| 옆에 이름이 이미 있는 경우 | 중복해서 읽히지 않도록 아바타를 `aria-hidden`으로 감춥니다.                              |
| 상태 뱃지                  | 색만으로 상태를 전달하지 마세요. `aria-label="온라인"` 또는 옆의 텍스트로 함께 알립니다. |
| `+N` 카운트                | `aria-label="외 5명"` 처럼 의미를 풀어 줍니다.                                           |

```tsx
{
  /* 아이콘 fallback — 루트에 이름을 붙인다 */
}
<Avatar aria-label="김닉">
  <AvatarFallback>
    <User className="size-4" />
  </AvatarFallback>
</Avatar>;

{
  /* 상태 뱃지 — 색 외에 이름도 준다 */
}
<Avatar size="lg" aria-label="이수미">
  <AvatarImage src="/users/lee.png" alt="이수미" />
  <AvatarFallback>이수</AvatarFallback>
  <AvatarBadge className="bg-emerald-500" aria-label="온라인" />
</Avatar>;

{
  /* 이름이 옆에 이미 있으면 아바타는 감춘다 */
}
<div className="flex items-center gap-2">
  <Avatar aria-hidden>
    <AvatarImage src="/users/kim.png" alt="" />
    <AvatarFallback>김닉</AvatarFallback>
  </Avatar>
  <span>김닉</span>
</div>;
```

:::caution 클릭되는 아바타는 버튼으로 감싸세요
`Avatar`는 `<span>` 계열이라 **포커스를 받지 못하고 키보드로 누를 수 없습니다.** 계정 메뉴 트리거처럼 클릭 동작이 있다면 `<button>`(또는 scaffold `Button`, `DropdownMenuTrigger`) 안에 아바타를 넣어 초점·키보드 조작을 확보하세요. `onClick`을 아바타에 직접 붙이는 것은 접근성상 안 됩니다.
:::

---

## 스타일링 & 테마

---

Avatar에는 별도의 공개 CSS 변수(테마 계약)가 없습니다. **바꾸려는 대상에 따라** 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것                    | 방법                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| 크기 3단계                     | `size` **prop**                                                     |
| 색(대체 배경·글자·뱃지·테두리) | **디자인 토큰**(`--muted`, `--primary`, `--border`, `--background`) |
| 이 인스턴스만 크기·색·간격     | 각 파트의 **`className`**                                           |
| 겉모습 전체 교체(형태·톤)      | **`data-slot` 선택자 + CSS Module**                                 |

:::tip 핵심 원칙
**자주 바꾸는 노브는 prop**, **색은 토큰**, **예외는 className**, **전면 재디자인은 CSS Module**. 컴포넌트(`avatar.tsx`)를 복사해서 고치지 않습니다.
:::

### 1. 색은 디자인 토큰을 따릅니다

Avatar가 쓰는 색은 전부 **전역 디자인 토큰**입니다. 테마(라이트/다크)를 바꾸면 자동으로 따라옵니다.

| 부위                        | 사용 토큰                            |
| --------------------------- | ------------------------------------ |
| Fallback 배경 / 글자        | `--muted` / `--muted-foreground`     |
| 뱃지 배경 / 아이콘          | `--primary` / `--primary-foreground` |
| 아바타 테두리(얇은 링)      | `--border`                           |
| 그룹 겹침 링 · 뱃지 둘레 링 | `--background`                       |

아바타 전용 색 변수를 새로 만들지 말고, 색을 바꿔야 하면 **토큰을 조정하거나 `className`으로 이 인스턴스만** 덮어쓰세요.

:::note 테두리는 `::after`로 그려집니다
루트에는 `--border` 색의 얇은 링이 `::after` 가상 요소로 얹혀 있습니다(밝은 배경에서는 `mix-blend-darken`, 다크 모드에서는 `lighten`). 덕분에 흰 배경 이미지도 경계가 사라지지 않습니다. **원형이 아닌 형태로 바꿀 때는 이 링이 어긋나므로 반드시 꺼야** 합니다 → `::after { display: none; }`
:::

### 2. 인스턴스 단위 조정 — `className`

각 파트가 `className`을 받습니다. 프리셋에 없는 크기나 색은 여기서 처리합니다.

```tsx
{
  /* 프리셋에 없는 64px 아바타 */
}
<Avatar className="size-16">
  <AvatarImage src="/users/kim.png" alt="김닉" />
  <AvatarFallback className="text-lg">김닉</AvatarFallback>
</Avatar>;

{
  /* 겹침 간격을 더 넓게 */
}
<AvatarGroup className="-space-x-3"> … </AvatarGroup>;

{
  /* 상태별 뱃지 색 */
}
<AvatarBadge className="bg-emerald-500" />;
```

:::caution 크기를 바꿀 때는 안쪽도 같이 보세요
`className="size-16"`은 **루트 크기만** 바꿉니다. Fallback 글자 크기와 뱃지 크기는 `size` prop 기준으로 잡혀 있으므로, 크게 벗어난 크기를 쓸 때는 `AvatarFallback` · `AvatarBadge`에도 각각 `className`을 주어 균형을 맞추세요.
:::

### 3. 겉모습 전면 교체 — `data-slot` + CSS Module

기본 톤과 전혀 다른 디자인(예: 원형 → 라운드 사각 타일)을 입히려면, 컴포넌트가 노출하는 **`data-slot`** 을 CSS Module에서 선택자로 오버라이드합니다.

| data-slot                          | 대상                    |
| ---------------------------------- | ----------------------- |
| `[data-slot="avatar"]`             | 루트(원형 프레임)       |
| `[data-slot="avatar-image"]`       | 이미지                  |
| `[data-slot="avatar-fallback"]`    | 이니셜·아이콘 대체 영역 |
| `[data-slot="avatar-badge"]`       | 우하단 상태 뱃지        |
| `[data-slot="avatar-group"]`       | 겹쳐 쌓는 그룹          |
| `[data-slot="avatar-group-count"]` | `+N` 카운트 칩          |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯 2단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap [data-slot="avatar"] {
  width: 3rem;
  height: 3rem;
  border-radius: 0.85rem; /* 원형 → 라운드 사각 */
  box-shadow: 0 0 0 2px var(--ring);
}
/* 형태를 바꿨으면 기본 원형 테두리는 끈다 */
.wrap [data-slot="avatar"]::after {
  display: none;
}
/* 이미지·대체 영역도 같은 라운드로 클립 */
.wrap [data-slot="avatar-image"],
.wrap [data-slot="avatar-fallback"] {
  border-radius: 0.85rem;
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...]`처럼 **래퍼로 한 번 더 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

:::note 상태별 색은 CSS 변수로 주입하는 게 편합니다
아바타마다 색이 달라지는 경우(결재 상태·접속 상태 등), 아바타를 감싼 요소에 `data-status`를 두고 거기서 `--ring` 같은 변수를 스위칭한 뒤 슬롯 규칙은 그 변수만 참조하게 하면 규칙이 한 벌로 끝납니다. 실제 적용 예는 아래 [실전 예제](#실전-예제)에 있습니다.
:::

---

## 실전 예제

---

제공 Avatar를 **그대로 쓰되** `*.module.css`로 형태(원형 → 라운드 사각 타일)와 상태 색까지 완전히 바꾼 예제입니다.

### 전자결재 결재선

기안 → 검토 → 승인 → 전결 흐름을 아바타로 나열하고, 각 단계의 상태(승인·진행중·대기·반려)를 링 색과 뱃지 아이콘으로 표시합니다. 하단에는 참조자를 `AvatarGroup`으로 겹쳐 놓았습니다.

<img
  src="../assets/ui/avatar-ex1.png"
  alt="AvatarGroup 실전 예제 1"
  width="80%"
/>

{/* <img src="../assets/ui/avatar-real-approval.png" alt="전자결재 결재선" width="100%" /> */}

**포인트**

- 제공 `Avatar` · `AvatarBadge` · `AvatarGroup`을 **그대로** 씁니다. 이미지 로드 실패 시 이니셜 대체 같은 동작은 전부 컴포넌트에 맡깁니다.
- 상태 색은 아바타를 감싼 `.avatarWrap`의 **`data-status`** 로 `--ring` / `--ring-soft` 변수만 갈아끼웁니다. 슬롯 규칙은 그 변수만 참조하므로 상태가 늘어도 규칙은 그대로입니다.
- 원형 → 라운드 사각으로 형태를 바꿨기 때문에 루트의 기본 테두리(`::after`)를 껐습니다.
- 뱃지 안에는 상태별 아이콘(`Check` · `Clock` · `X`)을 넣었습니다. 아이콘이 보이려면 아바타가 충분히 커야 하므로 여기서는 루트 크기를 CSS로 48px까지 키웠습니다.

<details>
<summary><b>ApprovalLineAvatars.tsx</b> — 전체 소스 보기</summary>

```tsx title="src/domains/example/components/ui-components/avatar/ApprovalLineAvatars.tsx"
import { Fragment } from "react";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@axiom/components/ui";
import { Check, Clock, X } from "lucide-react";
import styles from "./ApprovalLineAvatars.module.css";

type ApprovalStatus = "approved" | "pending" | "rejected" | "current";

interface IApprovalStep {
  id: string;
  role: string; // 기안 / 검토 / 승인
  name: string;
  dept: string;
  initials: string;
  img?: string; // 프로필 이미지(없으면 이니셜 fallback)
  status: ApprovalStatus;
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  approved: "승인",
  pending: "대기",
  rejected: "반려",
  current: "진행중",
};

/** 상태별 뱃지 아이콘 (없으면 뱃지 점만 노출) */
function StatusIcon({ status }: { status: ApprovalStatus }): React.ReactNode {
  if (status === "approved") return <Check strokeWidth={3} />;
  if (status === "rejected") return <X strokeWidth={3} />;
  if (status === "pending" || status === "current")
    return <Clock strokeWidth={3} />;
  return null;
}

const STEPS: IApprovalStep[] = [
  {
    id: "s1",
    role: "기안",
    name: "김닉",
    dept: "디지털개발팀",
    initials: "김닉",
    status: "approved",
  },
  {
    id: "s2",
    role: "검토",
    name: "이수미",
    dept: "개발2파트",
    initials: "이수",
    status: "approved",
  },
  {
    id: "s3",
    role: "승인",
    name: "박결재",
    dept: "팀장",
    initials: "박결",
    status: "current",
  },
  {
    id: "s4",
    role: "전결",
    name: "최전무",
    dept: "본부장",
    initials: "최전",
    status: "pending",
  },
];

/** 참조자(하단 겹치는 아바타 그룹) */
const REFERENCES = [
  { id: "r1", initials: "HR" },
  { id: "r2", initials: "감사" },
  { id: "r3", initials: "재무" },
];

export default function ApprovalLineAvatars(): React.ReactNode {
  return (
    <div className={styles.board}>
      <div className={styles.head}>
        <span className={styles.title}>지출결의서 결재선</span>
        <span className={styles.docNo}>DOC-2026-000842</span>
      </div>

      <div className={styles.flow}>
        {STEPS.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 && <div className={styles.connector} aria-hidden />}
            <div className={styles.step}>
              <span className={styles.roleTag}>{step.role}</span>
              {/* 상태 색 팔레트를 data-status 로 스위칭하는 래퍼 */}
              // highlight-next-line
              <div className={styles.avatarWrap} data-status={step.status}>
                <Avatar>
                  {/* 이미지가 있을 때만 렌더 — 없으면 곧바로 fallback */}
                  {step.img && <AvatarImage src={step.img} alt={step.name} />}
                  <AvatarFallback>{step.initials}</AvatarFallback>
                  // highlight-next-line
                  <AvatarBadge>
                    <StatusIcon status={step.status} />
                  </AvatarBadge>
                </Avatar>
              </div>
              <div>
                <div className={styles.name}>{step.name}</div>
                <div className={styles.dept}>{step.dept}</div>
              </div>
              <span className={styles.statusChip}>
                {STATUS_LABEL[step.status]}
              </span>
            </div>
          </Fragment>
        ))}
      </div>

      <div className={styles.foot}>
        <span className={styles.footLabel}>참조</span>
        {/* 참조자 — 겹치는 아바타 그룹 + 남은 인원 카운트 */}
        // highlight-next-line
        <AvatarGroup className={styles.refGroup}>
          {REFERENCES.map((ref) => (
            <Avatar key={ref.id}>
              <AvatarFallback>{ref.initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+2</AvatarGroupCount>
        </AvatarGroup>
      </div>
    </div>
  );
}
```

</details>

<details>
<summary><b>ApprovalLineAvatars.module.css</b> — 스타일링 소스 보기</summary>

```css title="src/domains/example/components/ui-components/avatar/ApprovalLineAvatars.module.css"
.board {
  /* 이 예제 전용 색 토큰 */
  --nic-line: #e4ecec;
  --nic-card: #ffffff;
  --nic-ink: #1b2b2a;
  --nic-sub: #5c6b6a;
  --nic-muted: #93a3a2;
  --nic-track: #eef3f3;

  /* 결재 상태 색 */
  --st-approved: #0f9d84; /* 승인 */
  --st-approved-soft: #e7f6f2;
  --st-pending: #d98a1f; /* 대기 */
  --st-pending-soft: #fbf1de;
  --st-rejected: #d0455a; /* 반려 */
  --st-rejected-soft: #fbe9ec;
  --st-current: #2b6ef2; /* 진행중 */
  --st-current-soft: #e7effe;

  color: var(--nic-ink);
  border: 1px solid var(--nic-line);
  border-radius: 1rem;
  background: var(--nic-card);
  overflow: hidden;
}

/* 다크 모드는 토큰만 교체 */
:global(.dark) .board {
  --nic-line: #223434;
  --nic-card: #0f1a1a;
  --nic-ink: #e8f1f0;
  --st-approved: #34c9ab;
  /* … 이하 동일 패턴 */
}

/* =========================================================================
 * 핵심: Avatar 슬롯 오버라이드 — 원형을 라운드 사각 타일로 바꾸고,
 *       상태별 링/뱃지 색을 CSS 변수로 주입한다.
 * ========================================================================= */

/* 상태 색을 담는 컨테이너 — data-status 로 팔레트를 스위칭한다 */
/* highlight-start */
.avatarWrap {
  --ring: var(--nic-muted);
  --ring-soft: var(--nic-track);
  position: relative;
}
.avatarWrap[data-status="approved"] {
  --ring: var(--st-approved);
  --ring-soft: var(--st-approved-soft);
}
.avatarWrap[data-status="current"] {
  --ring: var(--st-current);
  --ring-soft: var(--st-current-soft);
}
/* pending / rejected 도 동일 패턴 */
/* highlight-end */

/* 루트: 원형 → 라운드 사각, 상태 링 적용 */
.avatarWrap [data-slot="avatar"] {
  width: 3rem;
  height: 3rem;
  border-radius: 0.85rem;
  background: var(--ring-soft);
  box-shadow: 0 0 0 2px var(--ring);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
/* 형태를 바꿨으므로 scaffold 기본 mix-blend 테두리는 끈다 */
/* highlight-start */
.avatarWrap [data-slot="avatar"]::after {
  display: none;
}
/* highlight-end */
.avatarWrap:hover [data-slot="avatar"] {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 2px var(--ring),
    0 6px 14px rgb(16 24 40 / 0.12);
}

/* 이미지도 사각 라운드로 클립 */
.avatarWrap [data-slot="avatar-image"] {
  border-radius: 0.85rem;
}

/* 이니셜 대체: 브랜드 톤 그라디언트 + 굵은 이니셜 */
.avatarWrap [data-slot="avatar-fallback"] {
  border-radius: 0.85rem;
  background: linear-gradient(
    135deg,
    var(--ring),
    color-mix(in srgb, var(--ring) 55%, #000 0%)
  );
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
}

/* 상태 뱃지: 우하단, 상태색으로 채우고 살짝 키운다 */
.avatarWrap [data-slot="avatar-badge"] {
  width: 1.05rem;
  height: 1.05rem;
  right: -3px;
  bottom: -3px;
  background: var(--ring);
  color: #fff;
  box-shadow: 0 0 0 2px var(--nic-card);
}
.avatarWrap [data-slot="avatar-badge"] svg {
  width: 0.7rem;
  height: 0.7rem;
}

/* ── 하단: 참조자(겹치는 아바타 그룹) 재스타일 ───────────── */

/* 그룹 자식들도 라운드 사각 타일로 통일 */
.refGroup [data-slot="avatar"] {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.6rem;
}
.refGroup [data-slot="avatar"]::after {
  display: none;
}
.refGroup [data-slot="avatar-image"],
.refGroup [data-slot="avatar-fallback"] {
  border-radius: 0.6rem;
}
.refGroup [data-slot="avatar-fallback"] {
  background: linear-gradient(135deg, #4b5f7a, #2b3a4f);
  color: #fff;
  font-weight: 700;
  font-size: 0.72rem;
}
/* scaffold가 그룹 자식에 넣는 ring-background 대신 카드색 링을 확실히 */
/* highlight-start */
.refGroup [data-slot="avatar"],
.refGroup [data-slot="avatar-group-count"] {
  box-shadow: 0 0 0 2px var(--nic-card);
}
/* highlight-end */
.refGroup [data-slot="avatar-group-count"] {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.6rem;
  background: var(--nic-track);
  color: var(--nic-sub);
  font-size: 0.72rem;
  font-weight: 700;
}
```

</details>

:::tip 이 예제에서 가져갈 것
이미지 로드 실패 대체, 뱃지 위치, 그룹 겹침 같은 **동작은 전부 컴포넌트에 맡기고**, 바꾼 것은 ①`data-status` → CSS 변수 스위칭 ②`data-slot` 오버라이드(형태·색) ③아바타 주변에 넣은 **내 마크업**(역할 태그·이름·상태 칩) 세 가지뿐입니다. 컴포넌트를 복사해서 고치지 마세요.
:::

:::caution 그룹 겹침 링은 배경색을 따라갑니다
`AvatarGroup`이 자식에 넣는 링은 `--background` 색입니다. 예제처럼 **카드 위에 얹는 경우** 페이지 배경과 카드 배경이 달라 링이 어색해지므로, 위 CSS처럼 `box-shadow`로 **카드 색 링**을 직접 지정했습니다.
:::

---
