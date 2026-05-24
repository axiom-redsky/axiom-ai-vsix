---
title: 화면 템플릿 — 목록 화면
tags: [page-template, 페이지템플릿, 목록화면, list-page, listpage, 목록, list, 테이블, table, 검색, search, 필터, filter, 신규등록, 페이지구조]
scope: page-template
status: base-only
---

# 화면 템플릿 — 목록 화면 (List Page)

> **운영 규칙**
> - **섹션 A**: scaffold 공통 기본 구조. react-app-scaffold 확정 전까지 `base-only` 유지.
> - **섹션 B**: 초안 / 검토 중 변형 패턴. 실전에서 확인 후 섹션 A로 이동.
> - **섹션 C**: SI 프로젝트 투입 시 추가. axiom-ai "프로젝트 설정 > 레이아웃 패턴 > 목록 화면" 필드와 연동.

---

## 섹션 A — Scaffold 공통 구조

### 구조 개요

```
페이지 루트 (.contents-wrap / p-6)
├── 페이지 헤더 (.page-header)      ← 제목 + 주요 액션 버튼
├── 검색 영역 (.search-area) [선택]  ← Card: 검색/필터 폼
└── 결과 영역 (.result-area)        ← Card: 테이블 + 페이지네이션
```

---

### 퍼블 HTML 예시

```html
<div class="contents-wrap">

  <!-- 페이지 헤더 -->
  <div class="page-header">
    <h2 class="page-title">사용자 목록</h2>
    <div class="btn-area">
      <button class="btn btn-primary">신규 등록</button>
    </div>
  </div>

  <!-- 검색 영역 -->
  <div class="search-area">
    <div class="form-group">
      <label class="form-label">이름</label>
      <input class="form-control" type="text" placeholder="이름 입력" />
    </div>
    <div class="form-group">
      <label class="form-label">부서</label>
      <select class="form-select">
        <option value="">전체</option>
        <option value="1">개발팀</option>
      </select>
    </div>
    <div class="btn-area">
      <button class="btn btn-outline">초기화</button>
      <button class="btn btn-primary">검색</button>
    </div>
  </div>

  <!-- 결과 영역 -->
  <div class="result-area">
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>번호</th>
            <th>이름</th>
            <th>부서</th>
            <th>등록일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>홍길동</td>
            <td>개발팀</td>
            <td>2026-01-01</td>
            <td>
              <button class="btn btn-outline btn-sm">수정</button>
              <button class="btn btn-danger btn-sm">삭제</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

</div>
```

---

### React 변환 예시

```tsx
import type React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@axiom/components/ui';
import { Input } from '@axiom/components/ui';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@axiom/components/ui';
import { Card, CardContent } from '@axiom/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@axiom/components/ui';

export default function UserListPage(): React.ReactNode {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [searchDept, setSearchDept] = useState('');

  return (
    <div className="p-6 space-y-4">

      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">사용자 목록</h1>
        <Button onClick={() => navigate('new')}>신규 등록</Button>
      </div>

      {/* 검색 영역 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">이름</label>
              <Input
                placeholder="이름 입력"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">부서</label>
              <Select value={searchDept} onValueChange={setSearchDept}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체</SelectItem>
                  <SelectItem value="1">개발팀</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSearchName(''); setSearchDept(''); }}>
                초기화
              </Button>
              <Button>검색</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 결과 영역 */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">번호</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead className="w-28">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>1</TableCell>
                <TableCell>홍길동</TableCell>
                <TableCell>개발팀</TableCell>
                <TableCell>2026-01-01</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => navigate('1/edit')}>
                      수정
                    </Button>
                    <Button variant="destructive" size="sm">
                      삭제
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
```

---

## 섹션 B — 초안 / 검토 중 변형

> 실전 투입 후 확인되는 변형 패턴을 여기에 추가한 후 섹션 A로 이동한다.

| 변형 패턴 | 상태 | 비고 |
|---------|------|------|
| 좌측 필터 패널 + 우측 테이블 2단 구조 | tbd | 프로젝트에 따라 필요 |
| 상단 탭 + 탭별 목록 | tbd | |

---

## 섹션 C — 프로젝트별 목록 화면 구조

> SI 프로젝트 투입 시 이 섹션에 서브섹션을 추가한다.  
> **직접 편집하지 말 것** — axiom-ai 좌측 패널 **"프로젝트 설정 > 레이아웃 패턴 > 목록 화면"** 에 입력하면 `.axiom/knowledge/project-config.md`의 `### 목록 화면` 섹션으로 자동 저장된다.

```
프로젝트명      : (예: ○○은행 차세대 시스템)
채택 구조       : (axiom-ai 패널에서 입력 — 섹션 A와 다른 부분만 기록)
특이사항        :
```
