---
title: 퍼블 마크업 패턴
tags: [publish, 퍼블, 퍼블리싱, 마크업, markup, html, 퍼블리셔, publisher, 변환, convert, 클래스, class, 버튼, 폼, 카드, 테이블, 모달]
scope: publish
status: base-only
---

# 퍼블 마크업 패턴

> **운영 규칙**
> - **섹션 A**: scaffold가 제안하는 공통 변환 패턴. 실제 퍼블리셔 납품물과 다를 수 있으며 react-app-scaffold 확정 시 업데이트.
> - **섹션 B**: scaffold 초안 패턴. 검토 중이거나 실전에서 확인이 필요한 항목. 확인 완료 후 섹션 A로 이동.
> - **섹션 C**: SI 프로젝트 투입 시 퍼블리셔 납품물에 맞춰 추가. axiom-ai "프로젝트 설정" 패널의 **퍼블리셔 마크업 컨벤션** 필드와 연동.

---

## 섹션 A — Scaffold 공통 변환 패턴

각 패턴은 **퍼블 HTML 예시 → React 변환 예시** 한 쌍으로 작성되어 있다.

### 버튼

**퍼블 HTML**
```html
<button class="btn btn-primary">저장</button>
<button class="btn btn-outline btn-sm">취소</button>
<button class="btn-icon"><i class="icon-edit"></i></button>
```

**React 변환**
```tsx
<Button>저장</Button>
<Button variant="outline" size="sm">취소</Button>
<Button variant="ghost" size="icon"><PencilIcon className="w-4 h-4" /></Button>
```

---

### 입력 필드 / 폼 그룹

**퍼블 HTML**
```html
<div class="form-group">
  <label class="form-label" for="userName">이름</label>
  <input class="form-control" id="userName" type="text" placeholder="이름 입력" />
  <span class="invalid-feedback">필수 입력 항목입니다.</span>
</div>

<div class="form-group">
  <label class="form-label">부서</label>
  <select class="form-select">
    <option value="">선택하세요</option>
    <option value="1">개발팀</option>
  </select>
</div>
```

**React 변환 (react-hook-form + zod 연동)**
```tsx
<FormField
  control={form.control}
  name="userName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>이름</FormLabel>
      <FormControl>
        <Input placeholder="이름 입력" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

<FormField
  control={form.control}
  name="department"
  render={({ field }) => (
    <FormItem>
      <FormLabel>부서</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="선택하세요" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="1">개발팀</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

### 카드 / 패널

**퍼블 HTML**
```html
<!-- 일반 카드 -->
<div class="card-wrap">
  <div class="card-header">
    <h3 class="card-title">기본 정보</h3>
  </div>
  <div class="card-body">
    <!-- 내용 -->
  </div>
</div>

<!-- 검색 영역 -->
<div class="search-area">
  <!-- 검색 폼 -->
</div>

<!-- 결과 영역 -->
<div class="result-area">
  <!-- 테이블 -->
</div>
```

**React 변환**
```tsx
{/* 일반 카드 */}
<Card>
  <CardHeader>
    <CardTitle>기본 정보</CardTitle>
  </CardHeader>
  <CardContent>
    {/* 내용 */}
  </CardContent>
</Card>

{/* 검색 영역 */}
<Card>
  <CardContent className="pt-6">
    {/* 검색 폼 */}
  </CardContent>
</Card>

{/* 결과 영역 */}
<Card>
  <CardContent className="pt-6">
    {/* 테이블 */}
  </CardContent>
</Card>
```

---

### 테이블 / 목록

**퍼블 HTML**
```html
<!-- 페이지 헤더 -->
<div class="page-header">
  <h2 class="page-title">사용자 목록</h2>
  <div class="btn-area">
    <button class="btn btn-primary">신규 등록</button>
  </div>
</div>

<!-- 테이블 -->
<div class="tbl-wrap">
  <table class="tbl">
    <thead>
      <tr>
        <th>이름</th>
        <th>부서</th>
        <th>관리</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>홍길동</td>
        <td>개발팀</td>
        <td><button class="btn btn-outline btn-sm">수정</button></td>
      </tr>
    </tbody>
  </table>
</div>
```

**React 변환**
```tsx
{/* 페이지 헤더 */}
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">사용자 목록</h1>
  <Button>신규 등록</Button>
</div>

{/* 테이블 */}
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>이름</TableHead>
      <TableHead>부서</TableHead>
      <TableHead>관리</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>홍길동</TableCell>
      <TableCell>개발팀</TableCell>
      <TableCell>
        <Button variant="outline" size="sm">수정</Button>
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

### 모달 / 다이얼로그

**퍼블 HTML**
```html
<!-- 일반 모달 -->
<div class="modal-wrap">
  <div class="modal-header">
    <h3 class="modal-title">사용자 등록</h3>
    <button class="btn-close"></button>
  </div>
  <div class="modal-body">
    <!-- 내용 -->
  </div>
  <div class="modal-footer">
    <button class="btn btn-outline">취소</button>
    <button class="btn btn-primary">저장</button>
  </div>
</div>

<!-- 측면 패널 -->
<div class="side-panel">
  <!-- 내용 -->
</div>
```

**React 변환**
```tsx
{/* 일반 모달 */}
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>사용자 등록</DialogTitle>
    </DialogHeader>
    {/* 내용 */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button>저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* 측면 패널 */}
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>제목</SheetTitle>
    </SheetHeader>
    {/* 내용 */}
  </SheetContent>
</Sheet>
```

---

## 섹션 B — 초안 / 검토 중 패턴

> 실전 투입 후 확인되는 패턴을 여기에 먼저 추가한 후 섹션 A로 이동한다.

| 패턴명 | 상태 | 비고 |
|-------|------|------|
| (추가 예정) | tbd | SI 프로젝트 투입 후 채움 |

---

## 섹션 C — 프로젝트별 마크업 컨벤션

> SI 프로젝트 투입 시 이 섹션에 서브섹션을 추가한다.  
> **직접 편집하지 말 것** — axiom-ai 좌측 패널 **"프로젝트 설정 > 퍼블리셔 마크업 컨벤션"** 에 입력하면 `.axiom/knowledge/project-config.md`의 `## 퍼블리셔 마크업 컨벤션` 섹션으로 자동 저장된다.

```
프로젝트명          : (예: ○○은행 차세대 시스템)
UI 프레임워크       : (예: 자체 디자인시스템 / Bootstrap 5 / 기타)
퍼블리셔 컨벤션     : (axiom-ai 프로젝트 설정 패널에서 입력)
특이 마크업 패턴    : (섹션 A와 다른 부분만 기록)
```
