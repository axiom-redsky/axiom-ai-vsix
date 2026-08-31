---
sidebar_position: 1
displayed_sidebar: "componentsDocSidebar"
title: "Badge"
hide_table_of_contents: false
---

# Badge 컴포넌트

`react-app-scaffold`가 `@axiom/components/ui`로 제공하는 뱃지 컴포넌트입니다.  
**상태·라벨·개수처럼 짧은 정보를 강조**해서, 본문 옆에 붙는 보조 신호로 보여줄 때 사용합니다.

**언제 쓰나요?**

* 알림 수·장바구니 개수처럼 **숫자 카운터**를 아이콘/버튼 옆에 붙일 때
* "완료 / 진행 중 / 실패"처럼 **상태(status)** 를 한눈에 구분해야 할 때
* 태그·카테고리·필터 칩처럼 **짧은 라벨**을 나열할 때

> 클릭이 필요한(링크·토글) 뱃지라면 `asChild` prop을 사용하여 내부적으로 `<a>`나 `<button>`을 감싸고, 단순 표시라면 기본 `<span>` 그대로 씁니다. (아래 [asChild — 링크/버튼으로 렌더](#4-aschild--링크버튼으로-렌더) 참고)

---


## Import
---

```tsx
import { Badge } from '@axiom/components/ui';
```

Badge는 여러 파트를 조합하는 합성 컴포넌트가 아니라, **단일 컴포넌트**입니다. 내용(children)과 `variant`만으로 대부분의 표현이 끝나고, 아이콘은 자식으로 넣습니다.

---


## 기본 사용법
---

가장 기본적인 형태입니다. 텍스트를 자식으로 넣으면 기본 `variant="default"` 스타일로 렌더됩니다.

---
<img src="../assets/ui/badge-basic.png" alt="기본 사용법" width="60%" />
```tsx
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="ghost">Ghost</Badge>
<Badge variant="link">Link</Badge>
```

:::tip `variant`를 생략하면
`variant`의 기본값은 `"default"`(강조 색상)입니다. 상황에 맞는 변형은 [Variant (스타일 변형)](#variant-스타일-변형)에서 고릅니다.
:::

---


## 구성 (Anatomy)
---

Badge는 하나의 요소지만, 안에 **텍스트와 아이콘 슬롯**을 함께 담을 수 있습니다.

---
<img src="../assets/ui/badge-icon.png" alt="아이콘 포함 badge" width="60%" />

```tsx
<Badge variant="default">                  {/* 루트 — variant로 스타일을 정하는 <span> */}
  <BadgeCheck data-icon="inline-start" />  {/* 앞쪽 아이콘 (선택) */}
  Verified                                 {/* 라벨 텍스트 */}
</Badge>
<Badge variant="secondary">
  <Bookmark data-icon="inline-start" />
  Bookmark
</Badge>
<Badge variant="outline">
  New
  <BadgeCheck data-icon="inline-end" />    {/* 뒤쪽 아이콘 (선택) */}
</Badge>
```

| 파트 | 역할 |
| --- | --- |
| `Badge` (루트) | `variant`로 스타일을 정하는 컨테이너. 기본은 `<span>`, `asChild`면 자식 태그로 위임합니다. |
| 라벨 | 자식으로 넣는 텍스트(또는 숫자). |
| 아이콘 슬롯 | 자식 SVG에 `data-icon="inline-start"`(앞) / `"inline-end"`(뒤)를 주면 위치와 여백이 자동 조정됩니다. |

:::note `data-icon`은 왜 필요한가
Badge는 `data-icon` 위치에 따라 **좌우 패딩을 자동으로 좁혀** 아이콘이 뱃지 가장자리에 자연스럽게 붙도록 되어 있습니다(`has-data-[icon=inline-start]:pl-1.5` 등). 그래서 아이콘은 그냥 넣지 말고 **`data-icon` 속성으로 위치를 알려주세요.**
:::

---


## Variant (스타일 변형)
---
뱃지의 시각적 스타일은 루트 `Badge`의 `variant` prop으로 결정됩니다. 용도에 맞춰 아래에서 고르세요.

---
<img src="../assets/ui/badge-basic.png" alt="기본 사용법" width="60%" />
```tsx
<Badge variant="default">Default</Badge>       {/* 기본 강조(primary) */}
<Badge variant="secondary">Secondary</Badge>   {/* 보조 강조(secondary) */}
<Badge variant="destructive">Destructive</Badge>{/* 위험·오류(destructive) */}
<Badge variant="outline">Outline</Badge>       {/* 테두리만 */}
<Badge variant="ghost">Ghost</Badge>           {/* 배경 없이 hover 시만 강조 */}
<Badge variant="link">Link</Badge>             {/* 링크 텍스트 스타일 */}
```

| variant | 용도 |
| --- | --- |
| `default` | 가장 강한 강조. 대표 상태·주요 라벨. |
| `secondary` | 은은한 강조. 태그·부가 정보. |
| `destructive` | 오류·경고·삭제 등 위험 신호. |
| `outline` | 배경 없이 테두리만. 커스텀 색상의 기반으로도 자주 씀. |
| `ghost` | 평소엔 배경 없음, hover 시에만 배경 표시. |
| `link` | 밑줄 링크 텍스트 스타일. `asChild`와 함께 자주 씀. |

---


## 주요 사용 패턴
---




### 1. 아이콘 포함 — `data-icon`

아이콘은 자식으로 넣고 `data-icon`으로 위치를 지정합니다.

```tsx
import { BadgeCheck, Bookmark } from 'lucide-react';

// 앞쪽 아이콘
<Badge variant="default">
  <BadgeCheck data-icon="inline-start" />
  Verified
</Badge>

// 뒤쪽 아이콘
<Badge variant="outline">
  New
  <BadgeCheck data-icon="inline-end" />
</Badge>
```

* 아이콘 색은 뱃지 텍스트 색(`currentColor`)을 따르고, 크기는 `size-3`(0.75rem)로 자동 정렬됩니다.
* 앞(`inline-start`)/뒤(`inline-end`) 어느 쪽이든 해당 방향 패딩이 자동으로 좁혀집니다.




### 2. 로딩 상태 — 스피너

처리 중 상태는 회전 아이콘을 넣어 표현합니다. lucide 아이콘에 `animate-spin`만 붙이면 됩니다.

---
<img src="../assets/ui/badge-loading.png" alt="로딩 상태 아이콘" width="15%" />
```tsx
import { Loader2 } from 'lucide-react';

<Badge variant="secondary">
  <Loader2 className="animate-spin" data-icon="inline-start" />
  Deleting
</Badge>
```

* 별도 스피너 컴포넌트 없이 **아이콘 + `animate-spin`** 조합으로 충분합니다.
* 로딩이 끝나면 아이콘만 결과 아이콘(✓ 등)으로 교체하면 자연스럽습니다.




### 3. 카운터 / 상태 뱃지

숫자나 짧은 상태 텍스트를 넣어 카운터·상태 신호로 씁니다.

```tsx
// 알림 개수
<Badge variant="destructive">3</Badge>

// 상태 라벨
<Badge variant="secondary">진행 중</Badge>
<Badge variant="default">완료</Badge>
```

:::tip 프로젝트 공통 상태 뱃지
* 프론트엔드 공통으로 `StatusBadge` 컴포넌트와 같이 공통 Badge 컴포넌트를 만들어서 알맞은 색으로 렌더하는 래퍼 컴포넌트를 만들어서 사용하는것이 좋습니다. **정해진 상태 집합**을 반복해서 쓴다면 매번 `variant`+색을 지정하는 대신 훨씬 편리합니다.
```tsx
// 예시 코드
import { cn } from '@/shared/utils/cn';

export type StatusType = 'active' | 'bench' | 'warning' | 'complete' | 'planned';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  active:   { label: '투입중', className: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400' },
  bench:    { label: '벤치',   className: 'bg-amber-500/15 text-amber-600 ring-amber-500/20 dark:text-amber-400' },
  warning:  { label: '철수임박', className: 'bg-orange-500/15 text-orange-600 ring-orange-500/20 dark:text-orange-400' },
  complete: { label: '완료',   className: 'bg-slate-500/15 text-slate-600 ring-slate-500/20 dark:text-slate-300' },
  planned:  { label: '예정',   className: 'bg-sky-500/15 text-sky-600 ring-sky-500/20 dark:text-sky-400' },
};

export default function StatusBadge({ status, className }: StatusBadgeProps): React.ReactNode {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
```
:::




### 4. asChild — 링크/버튼으로 렌더

`asChild`를 주면 뱃지 **스타일은 유지하면서 렌더 태그를 자식으로 위임**합니다(Radix `Slot`). 클릭 가능한 뱃지를 만들 때 씁니다.

```tsx
// <a> 로 렌더 — 링크 뱃지
<Badge asChild variant="default">
  <a href="https://example.com" target="_blank" rel="noreferrer">
    Open Link ↗
  </a>
</Badge>

// <button> 으로 렌더 — 토글 칩 등
<Badge asChild variant="outline">
  <button type="button" onClick={handleToggle}>Filter</button>
</Badge>
```

* `asChild` 없이 그냥 `<Badge>` 안에 `<a>`를 넣으면 `span > a` 이중 구조가 됩니다. **링크·버튼 자체를 뱃지로** 만들려면 `asChild`가 정답입니다.
* `variant="link"` + `asChild`를 합치면 밑줄 링크 형태의 뱃지가 됩니다.




### 5. 커스텀 색상 — `className`

정해진 6개 variant 밖의 색이 필요하면 `variant="outline"`을 기반으로 `className`에 색 유틸리티를 덧씌웁니다.

---
<img src="../assets/ui/badge-color.png" alt="커스텀 색 변경" width="60%" />
<img src="../assets/ui/badge-color-dark.png" alt="커스텀 색 변경 dark" width="60%" />

```tsx
<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
  Blue
</Badge>
<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300">
  Green
</Badge>
<Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
  Purple
</Badge>
```

* `bg-*` / `text-*` / `border-*` 세 쌍을 라이트·다크 모두 지정하면 톤이 자연스럽습니다.
* 색을 **자주 재사용**한다면 매번 className을 나열하지 말고 상수 배열이나 래퍼 컴포넌트로 묶으세요(scaffold `BadgeCustomColors`의 `COLOR_BADGES` 패턴).
  ```tsx
  // 예시 코드
  import { Badge } from '@axiom/components/ui';

  const COLOR_BADGES = [
    { label: 'Blue', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/40' },
    { label: 'Green', className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/40' },
    { label: 'Sky', className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700/40' },
    { label: 'Purple', className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/40' },
    { label: 'Red', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40' },
    { label: 'Amber', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40' },
  ];

  export default function BadgeCustomColors(): React.ReactNode {
    return (
      <div>
        {COLOR_BADGES.map(({ label, className }) => (
          <Badge
            key={label}
            variant="outline"
            className={className}
          >
            {label}
          </Badge>
        ))}
      </div>
    );
  }
  ```
---


## API 레퍼런스
---

Badge는 `<span>` 기반이라, 아래 표에 없는 표준 HTML 속성(`id`, `onClick`, `aria-*` 등)도 그대로 전달됩니다.

### `Badge`

| Prop | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `variant` | `"default" \| "secondary" \| "destructive" \| "outline" \| "ghost" \| "link"` | `"default"` | 뱃지의 시각적 스타일 |
| `asChild` | `boolean` | `false` | `true`면 렌더 태그를 자식 요소로 위임(Slot). 링크·버튼 뱃지에 사용 |
| `className` | `string` | — | 추가 Tailwind 클래스(커스텀 색상·여백 등) |
| `children` | `ReactNode` | — | 라벨 텍스트/숫자와 아이콘 슬롯 |
| `...props` | `HTMLAttributes<span>` | — | 기타 표준 span 속성(`onClick`, `title`, `aria-*` 등) |

### 자식 아이콘 속성

| 속성 | 값 | 설명 |
| --- | --- | --- |
| `data-icon` | `"inline-start" \| "inline-end"` | 아이콘(SVG) 자식에 부여. 위치와 좌우 패딩을 자동 조정 |

:::note `data-variant` 노출
루트 요소에는 현재 variant가 `data-variant="..."`로 찍힙니다. CSS에서 `[data-variant="destructive"]`처럼 variant별 오버라이드를 걸 때 활용할 수 있습니다.
:::

---


## 접근성
---

Badge는 기본적으로 **의미 없는 `<span>`(장식)** 입니다. 상황에 맞는 접근성을 직접 챙겨야 합니다.

* **숫자 카운터**는 화면에 "3"만 있으면 맥락이 없습니다. 근처에 보이지 않는 설명을 두거나 `aria-label`을 주세요.
  ```tsx
  <button aria-label="알림 3개">
    <Bell />
    <Badge variant="destructive">3</Badge>
  </button>
  ```
* **상태 색에만 의존하지 마세요.** destructive(빨강)만으로 "실패"를 전달하면 색각 이상 사용자가 구분하기 어렵습니다. 텍스트(라벨)나 아이콘을 함께 두세요.
* **클릭 가능한 뱃지**는 반드시 `asChild`로 `<a>`/`<button>`을 감싸 키보드 포커스·엔터 동작을 확보하세요. `<span onClick>`만으로는 키보드 접근이 안 됩니다.
* 포커스 링은 디자인 토큰 `--ring`을 따르며, `asChild`로 감싼 링크/버튼에 `focus-visible` 스타일이 기본 적용됩니다.

---


## 스타일링 & 테마
---

Badge는 바꾸려는 대상에 따라 방법이 다릅니다. 아래 순서(쉬운 것 → 세밀한 것)로 접근하세요.

| 바꾸려는 것 | 방법 |
| --- | --- |
| 사전 정의된 색/스타일 | `variant` **prop** |
| 이 인스턴스만 색·패딩·크기 | **`className`**(Tailwind 유틸리티) |
| 색상(강조·위험·테두리 등) | **디자인 토큰**(`--primary`, `--secondary`, `--destructive`, `--border` 등) |
| variant별 세밀한 겉모습 교체 | **`data-slot` / `data-variant` 선택자 + CSS Module** |

:::tip 핵심 원칙
* **자주 바꾸는 스타일은 variant**로, **예외 색은 className**으로, **전역 톤은 토큰**으로.
* accordion과 마찬가지로 Badge 전용 색 변수를 새로 만들지 말고 **전역 디자인 토큰**을 재사용하세요. (토큰 체계 분열 방지)
:::


### 1. variant 우선

같은 톤 안에서의 강조 차이(default/secondary/outline/ghost)는 대부분 `variant`로 끝납니다. 먼저 여기서 고르세요.


### 2. 인스턴스 조정 — `className`

이 뱃지 하나만 색/패딩/폰트를 바꾸려면 `className`을 덧씌웁니다. 커스텀 색상 레시피가 대표적입니다([위 참고](#5-커스텀-색상--classname)).

```tsx
// 더 큰 뱃지 + 강한 강조
<Badge variant="default" className="h-6 px-3 text-sm">중요</Badge>
```


### 3. 색은 디자인 토큰으로

배경·텍스트·테두리 색은 Badge 전용 변수가 아니라 **전역 토큰**을 따릅니다. 브랜드 색을 바꾸려면 테마 토큰(`--primary`, `--secondary`, `--destructive`, `--border`, `--ring`)을 조정하세요. 그러면 모든 variant가 함께 바뀝니다.


### 4. 세밀한 교체 — `data-slot` / `data-variant` + CSS Module

기본 톤과 전혀 다른 디자인을 입히려면 컴포넌트가 노출하는 선택자를 CSS Module에서 오버라이드합니다.

| 선택자 | 대상 |
| --- | --- |
| `[data-slot="badge"]` | 뱃지 루트 |
| `[data-variant="destructive"]` 등 | 특정 variant만 |

```css
/* 래퍼(.wrap) 아래에서 슬롯을 재정의. 래퍼+슬롯을 여러 단계로 감싸 Tailwind 유틸리티보다 명시도를 높인다. */
.wrap :global([data-slot='badge'][data-variant='outline']) {
  border-radius: 0.375rem; /* 기본 pill(rounded-4xl) → 사각에 가깝게 */
}
```

:::tip 명시도 주의
기본 스타일은 Tailwind 유틸리티(낮은 명시도)입니다. `.wrap [data-slot=...]`처럼 **래퍼+슬롯을 감싸** 명시도를 확보해야 안정적으로 덮어씁니다. CSS Module 배치 규칙은 [컴포넌트 전용 스타일(css) 만들기](../../documents/dev/create-module-css) 문서를 참고하세요.
:::

---


## 실전 예제
---

제공 Badge를 그대로 쓰되, 실무에서 바로 쓸 만한 형태로 구성한 예제입니다. 전체 소스는 scaffold의 예제 컴포넌트에서 확인하세요.

### 태그 입력기 (추가 / 삭제)

입력창에 값을 넣어 뱃지로 추가하고, 각 뱃지의 `×` 버튼으로 삭제하는 패턴입니다. 뱃지 안에 삭제 버튼을 넣을 때 `asChild`가 아니라 **자식 `<button>`** 을 두고, 뱃지 자체는 `<span>`으로 유지합니다.

---
<img src="../assets/ui/badge-real-tag.png" alt="실전 예제 태그 입력기" width="60%" />

```tsx
import { useState } from 'react';
import { Badge } from '@axiom/components/ui';
import { X } from 'lucide-react';

function TagInput() {
  const [tags, setTags] = useState(['React', 'TypeScript', 'Tailwind']);
  const [value, setValue] = useState('');

  const addTag = () => {
    const t = value.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setValue('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="cursor-pointer gap-1 pr-1">
            {tag}
            <button type="button" aria-label={`${tag} 삭제`}
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}>
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addTag()}
        placeholder="태그 입력 후 Enter"
      />
    </div>
  );
}
```

* 삭제 `×`는 `size-2.5` 아이콘 버튼으로, 뱃지 우측 패딩을 `pr-1`로 좁혀 자연스럽게 배치합니다.
* 각 삭제 버튼에 `aria-label`을 주어 스크린리더에서 어떤 태그를 지우는지 알 수 있게 합니다.

---
