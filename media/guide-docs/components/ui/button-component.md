---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Button"
hide_table_of_contents: false
---

# Button 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 버튼 컴포넌트입니다.  
**클릭으로 동작을 실행**할 때 사용합니다. 제출·확인·취소, 페이지 이동처럼 사용자가 다음 단계로 넘어가거나 선택을 확정할 때 자주 쓰입니다.

**언제 쓰나요?**

* 폼 제출·저장·삭제처럼 **동작을 실행**하는 트리거
* 대화상자·팝오버를 여닫는 등 **UI 상태를 전환**하는 버튼
* 아이콘 하나만으로 동작을 나타내는 **아이콘 버튼**(툴바·테이블 행 액션 등)

> 페이지 이동(라우팅)이 목적이라면 진짜 버튼 대신 `asChild`로 `<a>`(또는 `<Link>`)를 감싸는 편이 접근성상 올바릅니다. (아래 [asChild — 렌더 위임](#5-aschild--렌더-위임) 참고)

---


## Import
---

```tsx
import { Button } from '@axiom/components/ui';
```

Button은 여러 파트를 조합하는 합성 컴포넌트가 아니라 **단일 컴포넌트**입니다. `variant`·`size` 두 prop과 자식(children)만으로 대부분의 표현이 끝나고, 아이콘은 자식으로 넣습니다.

---


## 기본 사용법
---

가장 기본적인 형태입니다. 텍스트를 자식으로 넣으면 기본 `variant="default"`, `size="default"` 스타일로 렌더됩니다.

---
<img src="../assets/ui/button-basic.png" alt="기본 사용법" width="70%" />
```tsx
<Button variant="default">Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>
```

:::tip `variant`·`size`를 생략하면
둘 다 기본값이 있습니다 — `variant="default"`(강조 색), `size="default"`(높이 `h-8`). 그래서 `<Button>텍스트</Button>`만으로도 바로 쓸 수 있습니다.
:::

---


## 구성 (Anatomy)
---

Button은 하나의 `<button>` 요소지만, 안에 **아이콘 슬롯과 텍스트**를 함께 담을 수 있습니다.

```tsx
<Button variant="default" size="default">   {/* 루트 — variant/size로 스타일을 정하는 <button> */}
  <Mail />                                  {/* 앞쪽 아이콘 (선택) */}
  이메일 보내기                              {/* 라벨 텍스트 */}
  <ChevronRight />                          {/* 뒤쪽 아이콘 (선택) */}
</Button>
```

| 파트 | 역할 |
| --- | --- |
| `Button` (루트) | `variant`·`size`로 스타일을 정하는 컨테이너. 기본은 `<button>`, `asChild`면 자식 태그로 위임합니다. |
| 라벨 | 자식으로 넣는 텍스트. |
| 아이콘 슬롯 | 자식으로 넣은 SVG. 별도 크기 지정 없이 **`size`에 맞춰 자동 정렬**됩니다(기본 `size-4`). |

:::note 아이콘 크기는 자동
버튼 안의 SVG는 `size`가 정해주는 크기를 자동으로 따릅니다(`default`=1rem, `sm`=0.875rem, `xs`/`icon-xs`=0.75rem …). 그래서 아이콘에 직접 크기를 주지 않아도 버튼 크기와 어울립니다. 굳이 다른 크기를 원할 때만 `className="size-5"`처럼 덮어씁니다.
:::

---


## Variant (스타일 변형)
---
버튼의 시각적 스타일은 루트 `Button`의 `variant` prop으로 결정됩니다. 용도에 맞춰 아래에서 고르세요.

```tsx
<Button variant="default">Default</Button>       {/* 기본 강조(primary) */}
<Button variant="outline">Outline</Button>       {/* 테두리 + 배경 */}
<Button variant="secondary">Secondary</Button>   {/* 보조 강조(secondary) */}
<Button variant="ghost">Ghost</Button>           {/* 배경 없이 hover 시만 강조 */}
<Button variant="destructive">Destructive</Button>{/* 위험·삭제(destructive) */}
<Button variant="link">Link</Button>             {/* 밑줄 링크 텍스트 스타일 */}
```

| variant | 용도 |
| --- | --- |
| `default` | 가장 강한 강조. 화면의 **주 액션**(제출·확인) 하나에 씁니다. |
| `outline` | 테두리 + 배경. 보조 액션이나 취소처럼 default 옆에 두는 버튼. |
| `secondary` | 은은한 채움 강조. 부가 액션. |
| `ghost` | 평소엔 배경 없음, hover 시에만 배경. 툴바·아이콘 버튼에 자주 씀. |
| `destructive` | 삭제·경고 등 되돌리기 어려운 위험 동작. |
| `link` | 밑줄 링크 텍스트 스타일. `asChild`와 함께 자주 씀. |

:::tip 한 화면에 default는 하나
`variant="default"`(주 액션)는 **한 영역에 하나**만 두는 것이 원칙입니다. 나머지 보조 액션은 `outline`·`secondary`·`ghost`로 위계를 낮춰 사용자가 무엇을 먼저 눌러야 할지 명확히 합니다.
:::

---


## Size (크기)
---
`size` prop으로 버튼 높이·여백·글자·아이콘 크기를 한 번에 조절합니다. 텍스트 버튼용 4종과 정사각형 아이콘 버튼용 4종이 있습니다.

---
<img src="../assets/ui/button-size.png" alt="버튼 사이즈 변경" width="70%" />
```tsx
{/* 텍스트 버튼 */}
<Button size="xs">Extra Small</Button>
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
```

| size | 높이 | 용도 |
| --- | --- | --- |
| `xs` | `h-6` | 아주 조밀한 UI(테이블 행 인라인 액션 등) |
| `sm` | `h-7` | 조밀한 툴바·필터 바 |
| `default` | `h-8` | 일반 폼·페이지 기본 |
| `lg` | `h-9` | 강조가 필요한 주요 액션 |

아이콘만 담는 정사각형 버튼은 `icon` 계열 size를 씁니다(아래 [아이콘 버튼](#1-아이콘-버튼--icon-계열-size) 참고).

---


## 주요 사용 패턴
---




### 1. 아이콘 버튼 — `icon` 계열 size

아이콘 하나만 담는 정사각형 버튼입니다. `size`를 `icon` 계열로 주면 정사각형(`size-*`)이 됩니다.

---
<img src="../assets/ui/button-icon.png" alt="버튼 아이콘 변경" width="70%" />
```tsx
import { Plus, Settings, Bell, Star } from 'lucide-react';

<Button size="icon-xs" variant="outline"><Plus /></Button>
<Button size="icon-sm" variant="outline"><Settings /></Button>
<Button size="icon"><Bell /></Button>
<Button size="icon-lg"><Star /></Button>
```

* `icon-xs`(`size-6`) · `icon-sm`(`size-7`) · `icon`(`size-8`) · `icon-lg`(`size-9`) 4종이 있습니다.
* 아이콘 전용 버튼은 텍스트 라벨이 없으므로 **반드시 `aria-label`** 을 주세요(아래 [접근성](#접근성--키보드) 참고).




### 2. 아이콘 + 텍스트 조합

버튼 안에 아이콘과 텍스트를 함께 넣습니다. 아이콘을 앞/뒤 어디에 두든 자동으로 간격(`gap`)이 잡힙니다.

---
<img src="../assets/ui/button-icon-text.png" alt="버튼 아이콘 텍스트 조합" width="70%" />
```tsx
import { Mail, Download, Send, ChevronRight, Trash2, ExternalLink } from 'lucide-react';

<Button><Mail /> 이메일 보내기</Button>
<Button variant="outline"><Download /> 다운로드</Button>
<Button variant="secondary"><Send /> 전송 <ChevronRight /></Button>
<Button variant="destructive"><Trash2 /> 삭제</Button>
<Button variant="ghost"><ExternalLink /> 열기</Button>
```

:::note `data-icon`으로 가장자리 붙이기
아이콘을 버튼 **가장자리에 더 바짝** 붙이고 싶으면 SVG에 `data-icon="inline-start"`(앞) / `"inline-end"`(뒤)를 주세요. 해당 방향 패딩이 자동으로 좁혀집니다(`has-data-[icon=inline-end]:pr-2` 등). 대부분은 그냥 넣어도 충분합니다.
:::




### 3. Disabled (비활성화)

`disabled` 속성으로 버튼을 비활성화합니다. 포인터 이벤트가 막히고 반투명(`opacity-50`) 처리됩니다.

---
<img src="../assets/ui/button-disabled.png" alt="버튼 disabled" width="70%" />
```tsx
<Button disabled>Default</Button>
<Button variant="outline" disabled>Outline</Button>
<Button variant="secondary" disabled>Secondary</Button>
<Button variant="destructive" disabled>Destructive</Button>
```

* 비동기 처리 중에는 `disabled={loading}`으로 **중복 클릭을 막는** 용도로도 자주 씁니다(아래 [실전 예제](#2-로딩-버튼) 참고).




### 4. aria-invalid (유효성 오류 상태)

폼 검증 실패 등 오류 상태를 표현할 때 `aria-invalid`를 줍니다. destructive 톤의 테두리·링이 자동으로 적용됩니다.

---
<img src="../assets/ui/button-invalid.png" alt="버튼 유효성 오류 상태" width="70%" />
```tsx
import { AlertTriangle } from 'lucide-react';

<Button aria-invalid="true"><AlertTriangle /> 유효성 오류</Button>
<Button variant="outline" aria-invalid="true">오류 Outline</Button>
```

* `aria-invalid`는 시각 표시뿐 아니라 **스크린리더에 오류를 알리는** 접근성 속성이기도 합니다.




### 5. asChild — 렌더 위임

`asChild`를 주면 버튼 **스타일은 유지하면서 렌더 태그를 자식으로 위임**합니다(Radix `Slot`). 링크(`<a>`)를 버튼 모양으로 만들 때 대표적으로 씁니다.

```tsx
import { ExternalLink } from 'lucide-react';

<Button asChild>
  <a href="https://example.com" target="_blank" rel="noreferrer">
    <ExternalLink /> 링크 버튼 (asChild)
  </a>
</Button>
```

* `asChild` 없이 `<Button>` 안에 `<a>`를 넣으면 `button > a` 이중 구조가 되고, 클릭·포커스 동작이 어색해집니다. **링크 자체를 버튼 모양으로** 만들려면 `asChild`가 정답입니다.
* 라우팅이 목적이면 `<a>`/`<Link>`를 감싸는 이 방식이 진짜 `<button>`보다 접근성상 올바릅니다.

---


## API 레퍼런스
---

Button은 `<button>` 기반이라, 아래 표에 없는 표준 HTML 속성(`onClick`, `type`, `form`, `aria-*` 등)도 그대로 전달됩니다.

### `Button`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `variant` | `"default" \| "outline" \| "secondary" \| "ghost" \| "destructive" \| "link"` | `"default"` | 버튼의 시각적 스타일 |
| `size` | `"xs" \| "sm" \| "default" \| "lg" \| "icon" \| "icon-xs" \| "icon-sm" \| "icon-lg"` | `"default"` | 버튼 크기(높이·여백·글자·아이콘) |
| `asChild` | `boolean` | `false` | `true`면 렌더 태그를 자식 요소로 위임(Slot). 링크 버튼 등에 사용 |
| `disabled` | `boolean` | `false` | 버튼 비활성화(포인터 차단 + 반투명) |
| `className` | `string` | — | 추가 Tailwind 클래스(커스텀 색·여백 등) |
| `children` | `ReactNode` | — | 라벨 텍스트와 아이콘 슬롯 |
| `...props` | `ButtonHTMLAttributes` | — | 기타 표준 button 속성(`onClick`, `type`, `aria-*` 등) |

:::note `data-variant` / `data-size` 노출
루트 요소에는 현재 값이 `data-variant="..."`, `data-size="..."`로 찍힙니다. CSS에서 `[data-variant="destructive"]`, `[data-size="lg"]`처럼 특정 값만 오버라이드할 때 활용합니다.
:::

---


## 접근성 / 키보드
---

Button은 표준 `<button>`으로 렌더되므로 **키보드 조작과 포커스가 기본 내장**되어 있습니다.

| 키 | 동작 |
| --- | --- |
| `Tab` | 버튼으로 포커스 이동 |
| `Enter` / `Space` | 포커스된 버튼 실행(click) |

* **아이콘 전용 버튼**(텍스트 없음)은 반드시 `aria-label`을 주세요. 안 그러면 스크린리더가 읽을 이름이 없습니다.
  ```tsx
  <Button size="icon" aria-label="알림 열기"><Bell /></Button>
  ```
* 라우팅 목적이면 `<button>` 대신 `asChild`로 `<a>`를 감싸 **링크의 시맨틱**(새 탭·우클릭 등)을 살리세요.
* 포커스 링은 디자인 토큰 `--ring`을 따르며, `focus-visible`에서만 나타납니다(마우스 클릭 시엔 링이 뜨지 않음).
* 오류 상태는 색뿐 아니라 `aria-invalid`로 전달해 색각 이상 사용자도 인지할 수 있게 합니다.

---


## 스타일링 & 테마
---

Button은 바꾸려는 대상에 따라 방법이 다릅니다. 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 사전 정의된 스타일/크기 | `variant` · `size` **prop** |
| 이 인스턴스만 색·패딩·크기 | **`className`**(Tailwind 유틸리티) |
| 색상(강조·위험·테두리·포커스) | **디자인 토큰**(`--primary`, `--secondary`, `--destructive`, `--border`, `--ring` 등) |
| variant/size별 세밀한 겉모습 교체 | **`data-slot` / `data-variant` / `data-size` 선택자 + CSS Module** |

:::tip 핵심 원칙
* **자주 바꾸는 스타일은 variant·size**로, **예외 색은 className**으로, **전역 톤은 토큰**으로.
* accordion·badge와 마찬가지로 Button 전용 색 변수를 새로 만들지 말고 **전역 디자인 토큰**을 재사용하세요. (토큰 체계 분열 방지)
:::


### 1. variant · size 우선

강조 위계(default/outline/secondary/ghost)와 크기(xs~lg)는 대부분 두 prop으로 끝납니다. 먼저 여기서 고르세요.


### 2. 인스턴스 조정 — `className`

이 버튼 하나만 색/패딩/폭을 바꾸려면 `className`을 덧씌웁니다. 예를 들어 브랜드색 버튼이나 가로 꽉 채움:

```tsx
// outline 기반 + 커스텀 색
<Button variant="outline" className="border-rose-400 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
  좋아요
</Button>

// 컨테이너 폭을 꽉 채움
<Button className="w-full">전체 동의하고 시작하기</Button>
```


### 3. 색은 디자인 토큰으로

배경·텍스트·테두리·포커스 링 색은 Button 전용 변수가 아니라 **전역 토큰**을 따릅니다. 브랜드 색을 바꾸려면 테마 토큰(`--primary`, `--primary-foreground`, `--secondary`, `--destructive`, `--border`, `--ring`)을 조정하세요. 그러면 모든 버튼이 함께 바뀝니다.


### 4. 세밀한 교체 — `data-slot` / `data-variant` / `data-size` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면 컴포넌트가 노출하는 선택자를 CSS Module에서 오버라이드합니다.

| 선택자 | 대상 |
| --- | --- |
| `[data-slot="button"]` | 버튼 루트 |
| `[data-variant="destructive"]` 등 | 특정 variant만 |
| `[data-size="lg"]` 등 | 특정 size만 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 여러 단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap :global([data-slot='button'][data-variant='default']) {
  border-radius: 9999px; /* 기본 rounded-lg → pill 형태로 */
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...]`처럼 **래퍼+슬롯을 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::


### 5. 그 외 — `asChild`

렌더 요소 교체·구조 합성이 필요하면 `asChild`(Radix `Slot`)로 자식 태그에 스타일을 위임합니다([위 참고](#5-aschild--렌더-위임)).

---


## 실전 예제
---

제공 Button을 그대로 쓰되, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트(`src/domains/example/pages/ui-components/ButtonComponent.tsx`, `LikeButton.tsx`)에서 확인하세요.

### 1. 클릭 카운터

`onClick`으로 상태를 갱신하는 가장 기본적인 인터랙션입니다.

```tsx
import { useState } from 'react';
import { Button } from '@axiom/components/ui';
import { MousePointerClick } from 'lucide-react';

function ClickCounter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center gap-4">
      <Button onClick={() => setCount((c) => c + 1)}>
        <MousePointerClick /> 클릭 횟수 증가
      </Button>
      <Button variant="outline" onClick={() => setCount(0)}>
        초기화
      </Button>
      <span>클릭: {count}회</span>
    </div>
  );
}
```


### 2. 로딩 버튼

비동기 작업 중에는 스피너를 보여주고 `disabled`로 중복 클릭을 막습니다.

---
<img src="../assets/ui/button-real-loading.png" alt="버튼 로딩 상태 시뮬레이션" width="70%" />
```tsx
import { useState } from 'react';
import { Button } from '@axiom/components/ui';
import { Loader2, ZapIcon } from 'lucide-react';

function LoadingButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? (
        <><Loader2 className="animate-spin" /> 처리 중...</>
      ) : (
        <><ZapIcon /> 실행하기</>
      )}
    </Button>
  );
}
```

* 별도 스피너 컴포넌트 없이 **아이콘 + `animate-spin`** 조합으로 충분합니다(badge 로딩 패턴과 동일).
* 처리 중 `disabled={loading}`으로 중복 제출을 막는 것이 핵심입니다.


### 3. 좋아요 토글 (상태에 따른 스타일 전환)

상태(`liked`)에 따라 `variant`와 `className`을 바꿔 채움/테두리 스타일을 전환하는 패턴입니다.

---
<img src="../assets/ui/button-real-liked.png" alt="버튼 좋아요 토클" width="70%" />
```tsx
import { useState } from 'react';
import { Button } from '@axiom/components/ui';
import { Heart } from 'lucide-react';

function LikeButton() {
  const [liked, setLiked] = useState(false);

  return (
    <Button
      variant={liked ? 'default' : 'outline'}
      onClick={() => setLiked((v) => !v)}
      className={
        liked
          ? 'bg-rose-500 hover:bg-rose-600 border-rose-500'
          : 'hover:border-rose-400 hover:text-rose-500'
      }
    >
      <Heart className={liked ? 'fill-white' : ''} />
      {liked ? '좋아요 취소' : '좋아요'}
    </Button>
  );
}
```

* `variant`(채움 여부)와 `className`(브랜드 rose 색)을 상태에 따라 함께 바꿔 토글 느낌을 냅니다.
* 하트 아이콘은 활성 시 `fill-white`로 속을 채워 상태를 더 분명히 보여줍니다.

---
