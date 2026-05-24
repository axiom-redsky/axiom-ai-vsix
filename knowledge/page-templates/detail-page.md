---
title: 화면 템플릿 — 상세 화면
tags: [page-template, 페이지템플릿, 상세화면, detail-page, detailpage, 상세, detail, 뒤로가기, 탭, tab, 조회, view, 읽기전용, readonly]
scope: page-template
status: base-only
---

# 화면 템플릿 — 상세 화면 (Detail Page)

> **운영 규칙**
> - **섹션 A**: scaffold 공통 기본 구조. react-app-scaffold 확정 전까지 `base-only` 유지.
> - **섹션 B**: 초안 / 검토 중 변형 패턴. 실전에서 확인 후 섹션 A로 이동.
> - **섹션 C**: SI 프로젝트 투입 시 추가. axiom-ai "프로젝트 설정 > 레이아웃 패턴 > 상세 화면" 필드와 연동.

---

## 섹션 A — Scaffold 공통 구조

### 구조 개요

```
페이지 루트 (.detail-wrap / p-6 max-w-4xl)
├── 페이지 헤더 (.page-header)   ← 뒤로가기 버튼 + 제목 + 우측 액션
├── 정보 섹션 (.card-wrap) [1+]  ← Card: 기본 정보 / 추가 정보
└── 하단 버튼 영역 (.btn-area)   ← 목록으로 / 수정
```

---

### 퍼블 HTML 예시

```html
<div class="detail-wrap">

  <!-- 페이지 헤더 -->
  <div class="page-header">
    <button class="btn btn-ghost btn-icon" onclick="history.back()">
      <i class="icon-arrow-left"></i>
    </button>
    <h2 class="page-title">사용자 상세</h2>
    <div class="btn-area">
      <button class="btn btn-primary">수정</button>
    </div>
  </div>

  <!-- 기본 정보 섹션 -->
  <div class="card-wrap">
    <div class="card-header">
      <h3 class="card-title">기본 정보</h3>
    </div>
    <div class="card-body">
      <dl class="detail-list">
        <dt>이름</dt>
        <dd>홍길동</dd>
        <dt>부서</dt>
        <dd>개발팀</dd>
        <dt>이메일</dt>
        <dd>hong@example.com</dd>
        <dt>등록일</dt>
        <dd>2026-01-01</dd>
      </dl>
    </div>
  </div>

  <!-- 추가 정보 섹션 (선택) -->
  <div class="card-wrap">
    <div class="card-header">
      <h3 class="card-title">변경 이력</h3>
    </div>
    <div class="card-body">
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th>변경일</th><th>변경자</th><th>내용</th></tr>
          </thead>
          <tbody>
            <tr><td>2026-01-10</td><td>관리자</td><td>부서 변경</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- 하단 버튼 -->
  <div class="btn-area btn-area--right">
    <button class="btn btn-outline">목록으로</button>
    <button class="btn btn-primary">수정</button>
  </div>

</div>
```

---

### React 변환 예시

```tsx
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@axiom/components/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@axiom/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@axiom/components/ui';

export default function UserDetailPage(): React.ReactNode {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* 페이지 헤더 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-1">사용자 상세</h1>
        <Button onClick={() => navigate(`${id}/edit`)}>수정</Button>
      </div>

      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">이름</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">홍길동</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">부서</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">개발팀</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">이메일</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">hong@example.com</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">등록일</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">2026-01-01</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 변경 이력 */}
      <Card>
        <CardHeader>
          <CardTitle>변경 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>변경일</TableHead>
                <TableHead>변경자</TableHead>
                <TableHead>내용</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>2026-01-10</TableCell>
                <TableCell>관리자</TableCell>
                <TableCell>부서 변경</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>목록으로</Button>
        <Button onClick={() => navigate(`${id}/edit`)}>수정</Button>
      </div>

    </div>
  );
}
```

---

## 섹션 B — 초안 / 검토 중 변형

> 실전 투입 후 확인되는 변형 패턴을 여기에 추가한 후 섹션 A로 이동한다.

| 변형 패턴 | 상태 | 비고 |
|---------|------|------|
| 탭 구조 (기본정보 / 이력 / 첨부파일) | tbd | Tabs 컴포넌트 사용 |
| 사이드 패널로 상세 표시 (Sheet) | tbd | 목록 화면과 함께 사용 |

---

## 섹션 C — 프로젝트별 상세 화면 구조

> SI 프로젝트 투입 시 이 섹션에 서브섹션을 추가한다.  
> **직접 편집하지 말 것** — axiom-ai 좌측 패널 **"프로젝트 설정 > 레이아웃 패턴 > 상세 화면"** 에 입력하면 `.axiom/knowledge/project-config.md`의 `### 상세 화면` 섹션으로 자동 저장된다.

```
프로젝트명      : (예: ○○은행 차세대 시스템)
채택 구조       : (axiom-ai 패널에서 입력 — 섹션 A와 다른 부분만 기록)
특이사항        :
```
