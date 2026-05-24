---
title: CSS 클래스 → shadcn 컴포넌트 매핑
tags: [css-mapping, css매핑, 클래스매핑, class-mapping, shadcn, btn, form-control, card, modal, badge, 변환, convert, 퍼블, publish]
scope: publish
status: base-only
---

# CSS 클래스 → shadcn 컴포넌트 매핑

> **운영 규칙**
> - **섹션 A**: scaffold 공통 매핑표. react-app-scaffold 확정 전까지 `base-only` 상태 유지. 변경 시 scaffold 팀 합의 필요.
> - **섹션 B**: 검토 중인 매핑 항목. 실전에서 확인 후 섹션 A로 이동.
> - **섹션 C**: SI 프로젝트 투입 시 퍼블리셔 납품 가이드에 맞게 추가. axiom-ai "프로젝트 설정" 패널의 **퍼블리셔 마크업 컨벤션** 필드를 사용.

---

## 섹션 A — Scaffold 공통 매핑표

### 버튼 (`Button`)

| 퍼블 CSS 클래스 | shadcn prop | 비고 |
|---|---|---|
| `.btn` | `<Button>` | 기본 래퍼 |
| `.btn-primary` | `variant="default"` | 주요 액션 |
| `.btn-secondary` | `variant="secondary"` | 보조 액션 |
| `.btn-outline` | `variant="outline"` | 테두리 버튼 |
| `.btn-ghost` | `variant="ghost"` | 투명 배경 |
| `.btn-danger` / `.btn-delete` | `variant="destructive"` | 삭제·위험 액션 |
| `.btn-link` | `variant="link"` | 링크 스타일 |
| `.btn-sm` | `size="sm"` | 소형 |
| `.btn-lg` | `size="lg"` | 대형 |
| `.btn-icon` | `size="icon"` | 아이콘 전용 |

---

### 폼 입력

| 퍼블 CSS 클래스 | shadcn 컴포넌트 | 비고 |
|---|---|---|
| `.form-group` | `<FormItem>` | react-hook-form 연동 |
| `.form-label` | `<FormLabel>` | `htmlFor` 자동 연결 |
| `.form-control` (input) | `<Input>` | |
| `.form-control` (textarea) | `<Textarea>` | |
| `.form-select` | `<Select>` + `<SelectTrigger>` | |
| `.invalid-feedback` | `<FormMessage>` | 에러 메시지 |
| `.form-check-input` (checkbox) | `<Checkbox>` | |
| `.form-check-input` (radio) | `<RadioGroup>` + `<RadioGroupItem>` | |

---

### 카드 / 패널

| 퍼블 CSS 클래스 | shadcn 컴포넌트 | 비고 |
|---|---|---|
| `.card-wrap` / `.card` | `<Card>` | |
| `.card-header` | `<CardHeader>` | |
| `.card-body` / `.card-content` | `<CardContent>` | |
| `.card-footer` | `<CardFooter>` | |
| `.card-title` / `.card-tit` | `<CardTitle>` | |
| `.card-desc` / `.card-sub` | `<CardDescription>` | |

---

### 테이블

| 퍼블 CSS 클래스 | shadcn 컴포넌트 | 비고 |
|---|---|---|
| `.tbl-wrap` | 래퍼 `<div className="overflow-auto">` | 가로 스크롤 처리 |
| `.tbl` / `.table` | `<Table>` | |
| `thead tr th` | `<TableHead>` | |
| `tbody tr` | `<TableRow>` | |
| `tbody tr td` | `<TableCell>` | |
| `tfoot tr td` | `<TableCell>` | 합계 행 |

---

### 모달 / 오버레이

| 퍼블 CSS 클래스 | shadcn 컴포넌트 | 비고 |
|---|---|---|
| `.modal-wrap` | `<Dialog>` + `<DialogContent>` | |
| `.modal-header` | `<DialogHeader>` | |
| `.modal-title` | `<DialogTitle>` | |
| `.modal-body` | `<DialogContent>` 내부 영역 | |
| `.modal-footer` | `<DialogFooter>` | |
| `.side-panel` / `.drawer` | `<Sheet>` + `<SheetContent>` | side 방향 지정 |
| `.confirm-modal` | `<AlertDialog>` | 확인 요청 다이얼로그 |

---

### 상태 / 배지

| 퍼블 CSS 클래스 | shadcn 컴포넌트 | 비고 |
|---|---|---|
| `.badge` / `.tag` / `.chip` | `<Badge>` | |
| `.badge-primary` | `variant="default"` | |
| `.badge-secondary` | `variant="secondary"` | |
| `.badge-danger` / `.badge-error` | `variant="destructive"` | |
| `.badge-outline` | `variant="outline"` | |

---

### 페이지 레이아웃 구조

| 퍼블 HTML 구조 패턴 | React / Tailwind 구조 | 비고 |
|---|---|---|
| `.page-header` | `<div className="flex items-center justify-between">` | 제목 + 버튼 영역 |
| `.page-title` | `<h1 className="text-2xl font-bold text-gray-900 dark:text-white">` | |
| `.search-area` | `<Card><CardContent className="pt-6">` | 검색 폼 영역 |
| `.result-area` / `.list-area` | `<Card><CardContent className="pt-6">` | 테이블 영역 |
| `.btn-area` / `.button-group` | `<div className="flex gap-2">` | 버튼 묶음 |
| `.contents-wrap` | `<div className="p-6 space-y-4">` | 목록 화면 루트 |
| `.detail-wrap` | `<div className="p-6 space-y-6 max-w-4xl">` | 상세 화면 루트 |
| `.form-wrap` | `<div className="p-6 space-y-6 max-w-2xl">` | 폼 화면 루트 |

---

## 섹션 B — 검토 중 / 미확정 항목

> 실전 투입 후 발견되는 매핑 항목을 여기에 먼저 추가한 후 검토 완료 시 섹션 A로 이동한다.

| 퍼블 CSS 클래스 | 예상 컴포넌트 | 상태 |
|---|---|---|
| (추가 예정) | | tbd |

---

## 섹션 C — 프로젝트별 클래스 매핑

> SI 프로젝트 투입 시 이 섹션에 서브섹션을 추가한다.  
> **직접 편집하지 말 것** — axiom-ai 좌측 패널 **"프로젝트 설정 > 퍼블리셔 마크업 컨벤션"** 에 입력하면 `.axiom/knowledge/project-config.md`에 자동 저장된다. AI는 두 파일을 모두 참조하며 `project-config.md`의 내용이 이 섹션을 덮어쓴다.

```
프로젝트명      : (예: ○○은행 차세대 시스템)
UI 라이브러리   : (예: 자체 디자인시스템 / Bootstrap 5)
추가 매핑       : (섹션 A에 없는 클래스만 axiom-ai 패널에서 입력)
```
