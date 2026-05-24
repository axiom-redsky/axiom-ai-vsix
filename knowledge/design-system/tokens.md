---
title: 디자인 시스템 — 디자인 토큰
tags: [token, 토큰, 디자인토큰, color, 색상, typography, 타이포그래피, spacing, 간격, brand, 브랜드컬러, primitive, theme, darkmode, css-variable, tailwind, tailwindcss]
scope: design-system
---

# 디자인 시스템 — 디자인 토큰

react-app-scaffold는 **Style Dictionary** 기반의 CSS Custom Property 토큰 시스템과 **TailwindCSS 4** 유틸리티 클래스를 함께 사용한다.

## 토큰 파일 구조

```
src/
├── design-tokens/               ← Style Dictionary JSON 입력 (직접 편집 가능)
│   └── *.json
└── assets/styles/
    ├── tokens/                  ← Style Dictionary 출력 (⚠ 직접 편집 금지 — generated)
    │   ├── primitive.css        ← 원시 색상·크기 변수 정의
    │   ├── theme-light.css      ← 라이트 테마 시맨틱 변수
    │   └── theme-dark.css       ← 다크 테마 시맨틱 변수
    ├── themes/                  ← 프로젝트 브랜드 테마 (직접 편집 가능)
    │   └── theme-default.css    ← brand-* 컬러 등 프로젝트 공통 정의
    └── app.css                  ← @import 진입점
```

> `src/assets/styles/tokens/` 파일들은 자동 생성된 파일이다. `design-tokens/*.json`을 수정하고 빌드 스크립트를 실행하면 재생성된다. **직접 편집 금지.**

---

## 색상 토큰

### 레이어 구조

```
Primitive (primitive.css)       ← 원시값   (--color-gray-500: #6b7280)
    ↓
Semantic (theme-light/dark.css) ← 용도별   (--color-background, --color-foreground)
    ↓
TailwindCSS 4 클래스            ← 실제 코드 (bg-white, text-gray-900)
```

### 그레이 스케일

| 클래스 | 주요 용도 |
|-------|---------|
| `gray-50` | 페이지 배경, 서브 영역 배경 (라이트) |
| `gray-100` | 입력 필드 배경, 비활성 배경 |
| `gray-200` | 테두리, 구분선 (라이트) |
| `gray-300` | 비활성 텍스트 보조 |
| `gray-500` | 보조 텍스트 |
| `gray-700` | 본문 텍스트 (라이트) |
| `gray-900` | 주요 텍스트 (라이트) / 페이지 배경 (다크) |
| `gray-950` | 더 진한 배경 (다크) |

```tsx
<p className="text-gray-900 dark:text-white">주요 텍스트</p>
<p className="text-gray-500 dark:text-gray-400">보조 텍스트</p>
<div className="bg-gray-50 dark:bg-gray-900">배경</div>
<div className="border border-gray-200 dark:border-gray-700">테두리</div>
```

### 브랜드 컬러 (brand-*)

scaffold는 TailwindCSS 4의 `@theme` 블록으로 `brand-*` 컬러를 확장한다. 실제 색상값은 `src/assets/styles/themes/theme-default.css`에서 정의되며, 프로젝트 투입 시 재정의된다.

| 클래스 | 주요 용도 |
|-------|---------|
| `brand-50` | 브랜드 컬러 매우 연한 배경 |
| `brand-100` | 브랜드 컬러 연한 배경 |
| `brand-400` | 다크모드 브랜드 텍스트 |
| `brand-500` | 브랜드 기본 |
| `brand-600` | 주요 액션 버튼 배경 |
| `brand-700` | 버튼 hover 상태 |

```tsx
<button className="bg-brand-600 hover:bg-brand-700 text-white">주요 액션</button>
<span className="text-brand-600 dark:text-brand-400">브랜드 텍스트</span>
<div className="bg-brand-50 border border-brand-200">브랜드 배경</div>
```

### 시맨틱 상태 컬러

| 상태 | 라이트 모드 | 다크 모드 |
|-----|-----------|---------|
| 성공 | `text-green-600` / `bg-green-50` | `text-green-400` / `bg-green-900/20` |
| 경고 | `text-yellow-600` / `bg-yellow-50` | `text-yellow-400` / `bg-yellow-900/20` |
| 에러 | `text-red-600` / `bg-red-50` | `text-red-400` / `bg-red-900/20` |
| 정보 | `text-blue-600` / `bg-blue-50` | `text-blue-400` / `bg-blue-900/20` |

```tsx
// 에러 메시지
<p className="text-red-600 dark:text-red-400 text-sm">입력값이 올바르지 않습니다.</p>

// 성공 배지
<span className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-1 rounded text-xs">
  처리 완료
</span>
```

---

## 타이포그래피 토큰

### 폰트 크기 스케일

| 클래스 | 크기 | 주요 용도 |
|-------|------|---------|
| `text-xs` | 12px | 캡션, 보조 레이블, 뱃지 텍스트 |
| `text-sm` | 14px | 본문 소, 버튼 텍스트, 입력 필드 |
| `text-base` | 16px | 기본 본문 |
| `text-lg` | 18px | 소제목 |
| `text-xl` | 20px | 중제목 |
| `text-2xl` | 24px | 페이지 제목 |
| `text-3xl` | 30px | 대제목 |
| `text-4xl` | 36px | 히어로 제목 |

### 폰트 굵기

| 클래스 | 용도 |
|-------|------|
| `font-normal` | 일반 본문 |
| `font-medium` | 강조 본문, 레이블, 버튼 |
| `font-semibold` | 소제목, 카드 타이틀 |
| `font-bold` | 페이지 제목, 주요 강조 |

### 줄 간격

| 클래스 | 용도 |
|-------|------|
| `leading-tight` | 제목류 |
| `leading-normal` | 일반 본문 |
| `leading-relaxed` | 긴 본문, 설명 텍스트 |

```tsx
// 페이지 제목
<h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">페이지 제목</h1>

// 카드 소제목
<h2 className="text-lg font-semibold text-gray-900 dark:text-white">소제목</h2>

// 일반 본문
<p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">본문 내용</p>

// 캡션 / 보조 정보
<span className="text-xs text-gray-500 dark:text-gray-400">부가 설명</span>
```

---

## 간격 토큰 (Spacing)

TailwindCSS 4 기본 스케일을 사용한다. `4` = 1rem = 16px.

| 클래스 | 크기 | 주요 용도 |
|-------|------|---------|
| `gap-1` / `p-1` | 4px | 아이콘-텍스트 밀착 간격 |
| `gap-2` / `p-2` | 8px | 컴팩트 내부 패딩, 버튼 내부 |
| `gap-4` / `p-4` | 16px | 일반 내부 패딩 |
| `gap-6` / `p-6` | 24px | 페이지 패딩, 카드 패딩 |
| `gap-8` / `p-8` | 32px | 큰 섹션 패딩 |
| `space-y-4` | 16px | 폼 필드 간격, 항목 간격 |
| `space-y-6` | 24px | 카드 간격, 섹션 간격 |
| `space-y-8` | 32px | 페이지 내 대섹션 간격 |

```tsx
// 페이지 외부 패딩
<div className="p-6 space-y-6">

// 카드 내부
<CardContent className="pt-6 space-y-4">

// 버튼 그룹
<div className="flex gap-2">
  <Button variant="outline">취소</Button>
  <Button>저장</Button>
</div>
```

---

## 기타 토큰

### Border Radius

| 클래스 | 크기 | 주요 용도 |
|-------|------|---------|
| `rounded` | 4px | 기본 (태그, 소형 요소) |
| `rounded-md` | 6px | 버튼, 입력 필드 |
| `rounded-lg` | 8px | 카드, 드롭다운 |
| `rounded-2xl` | 16px | 큰 카드, 모달 |
| `rounded-full` | 9999px | 배지, 아바타, 칩 |

### Shadow

| 클래스 | 주요 용도 |
|-------|---------|
| `shadow-sm` | 카드 기본 그림자 |
| `shadow` | 드롭다운, 팝오버 |
| `shadow-md` | 모달, 알림 패널 |
| `shadow-lg` | 사이드 패널, 오버레이 |

---

## 주의사항

- `src/assets/styles/tokens/` 파일은 **직접 편집 금지** — `src/design-tokens/*.json` 수정 후 빌드 스크립트 실행
- `brand-*` 실제 색상값은 `src/assets/styles/themes/theme-default.css`에서 재정의
- TailwindCSS 4는 `tailwind.config.js` 파일이 없고 CSS `@theme` 블록으로 토큰을 정의
- 프로젝트 투입 시 `theme-default.css`를 복사하여 프로젝트 전용 테마 파일 생성 권장
