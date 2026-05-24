---
title: 디자인 시스템 — 레이아웃 가이드
tags: [layout, 레이아웃, card, container, stack, grid, flexbox, scrollarea, 카드, 페이지구조, 목록화면, 상세화면, 폼화면, si프로젝트, 프로젝트별, 반응형, responsive, darkmode, 다크모드, rootlayout]
scope: design-system
status: base-only
---

# 디자인 시스템 — 레이아웃 가이드

> **운영 규칙**
> - **섹션 A**: scaffold 공통 원칙. 모든 프로젝트에 적용. 변경 시 scaffold 팀 합의 필요.
> - **섹션 B**: scaffold 기본 제안 골격(draft). 프로젝트 투입 시 구체화하여 섹션 C에 반영.
> - **섹션 C**: SI 프로젝트 투입 시 해당 프로젝트 서브섹션을 추가한다. 초기에는 플레이스홀더 유지.

---

## 섹션 A — Scaffold 공통 레이아웃 원칙

react-app-scaffold가 제공하는 레이아웃 기반 규칙. 모든 프로젝트에서 변경 없이 따른다.

### 폴더 구조

레이아웃 컴포넌트는 `src/shared/components/layout/` 아래에 위치한다.

```
src/shared/components/layout/
├── RootLayout.tsx      ← 최상위 레이아웃 (헤더 + 사이드바 + 콘텐츠 영역)
└── (프로젝트별 추가 레이아웃 컴포넌트)
```

도메인 전용 레이아웃이 필요하면 `src/domains/{domain}/components/layout/`에 추가한다.

### RootLayout 사용

모든 도메인 라우터는 `RootLayout`을 부모 `element`로 사용한다.

```typescript
import { RootLayout } from '@/shared/components/layout';

// 라우터 설정
{
  path: '/',
  element: <RootLayout />,
  children: MyDomainRouter,
}
```

### TailwindCSS 4 Flex / Grid 기본 패턴

```tsx
// 가로 배치 (Flexbox)
<div className="flex items-center gap-4">
  <span>항목 A</span>
  <span>항목 B</span>
</div>

// 세로 스택 (Flex Column)
<div className="flex flex-col gap-4">
  <div>첫 번째</div>
  <div>두 번째</div>
</div>

// 2열 그리드 (고정)
<div className="grid grid-cols-2 gap-6">
  <div>좌측</div>
  <div>우측</div>
</div>

// 반응형 그리드
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  ...
</div>

// 우측 정렬 버튼 영역
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">제목</h1>
  <Button>액션</Button>
</div>
```

### 반응형 원칙

TailwindCSS 4 브레이크포인트 기준. **모바일 우선(mobile-first)**으로 작성한다.

| 접두사 | 최솟값 | 대상 기기 |
|-------|--------|---------|
| (없음) | 0px | 모바일 기본 |
| `sm:` | 640px | 소형 태블릿 이상 |
| `md:` | 768px | 태블릿 이상 |
| `lg:` | 1024px | 데스크톱 이상 |
| `xl:` | 1280px | 넓은 데스크톱 이상 |

### 다크모드 원칙

`dark:` 접두사 클래스를 사용한다. `ThemeToggle` 컴포넌트가 `document.documentElement`에 `class="dark"` 추가/제거를 담당한다.

```tsx
// 기본 패턴
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  다크모드 지원 컨테이너
</div>

// 테두리
<div className="border border-gray-200 dark:border-gray-700">...</div>

// 보조 텍스트
<p className="text-gray-500 dark:text-gray-400">설명</p>
```

### shadcn/ui 레이아웃 관련 컴포넌트 — 최소 사용 기준

```typescript
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from '@axiom/components/ui';
import { ScrollArea } from '@axiom/components/ui';
import { Separator } from '@axiom/components/ui';
```

| 컴포넌트 | 언제 쓰나 |
|---------|---------|
| `Card` / `CardHeader` / `CardContent` / `CardFooter` | 콘텐츠 단위 구분이 필요한 경우 (검색 영역, 테이블 영역, 폼 등) |
| `Separator` | 섹션 간 수평/수직 구분선 |
| `ScrollArea` | 고정 높이 컨테이너 내 스크롤이 필요한 경우 |

---

## 섹션 B — 페이지 유형별 기본 골격 (Draft)

> **주의**: 이 섹션은 scaffold의 기본 제안이며 확정된 표준이 아니다. 프로젝트 투입 시 디자이너/퍼블리셔 협의 후 섹션 C에 구체화한다.

### 목록 화면 (List Page)

```tsx
export default function ListPage(): React.ReactNode {
  return (
    <div className="p-6 space-y-4">
      {/* 헤더: 제목 + 주요 액션 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">목록 제목</h1>
        <Button>신규 등록</Button>
      </div>

      {/* 검색/필터 영역 (선택) */}
      <Card>
        <CardContent className="pt-6">
          {/* 검색 폼 */}
        </CardContent>
      </Card>

      {/* 데이터 테이블 */}
      <Card>
        <CardContent className="pt-6">
          <Table>{/* ... */}</Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 상세 화면 (Detail Page)

```tsx
export default function DetailPage(): React.ReactNode {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* 헤더: 뒤로가기 + 제목 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">상세 제목</h1>
      </div>

      {/* 정보 섹션 */}
      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 상세 내용 */}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 폼 화면 (Form Page)

```tsx
export default function FormPage(): React.ReactNode {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">등록 / 수정</h1>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* FormField 목록 */}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline">취소</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 섹션 C — 프로젝트별 레이아웃 확장

> SI 프로젝트 투입 시 이 섹션에 프로젝트 서브섹션을 추가한다.  
> 프로젝트 시작 전까지는 플레이스홀더를 유지한다.

### [프로젝트 투입 후 작성]

```
프로젝트명       : (예: ○○은행 차세대 시스템)
디자인 가이드    : (예: Figma URL 또는 사내 위키 링크)
퍼블리셔 마크업  : (퍼블리셔가 제공한 HTML 클래스 규칙 요약)
채택한 레이아웃  :
  - (예: GNB는 RootLayout 헤더 영역을 프로젝트 컴포넌트로 재정의)
  - (예: 목록화면은 좌측 필터 패널 + 우측 테이블 2단 구조 사용)
  - (예: Card 대신 프로젝트 전용 Section 컴포넌트 사용)
참조 스펙        : (예: .axiom/global/layout-guide.md)
```
