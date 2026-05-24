---
title: SDD 스펙 작성 구조
category: spec-guide
keywords: [spec, 스펙, 스펙구조, spec-guide, spec-structure, 섹션, 복잡도, L1, L2, L3,
           component-tree, 컴포넌트트리, props, state, 상태, render-logic, 렌더조건,
           events, 이벤트, form, 폼스펙, edge-cases, 예외처리, 수락기준, 스펙작성]
priority: 1
scope: spec
---

# SDD 스펙 작성 구조

react-app-scaffold 기반 SDD 스펙의 **10개 섹션 + 복잡도 등급** 기준.

---

## 복잡도 등급 (complexity)

frontmatter `complexity` 필드에 반드시 명시한다.

| 등급 | 대상 화면 | 필수 섹션 |
|---|---|---|
| **L1** (단순) | 정적 화면, 단순 조회 | 수락 기준 + 개요 + API + 예외 처리 |
| **L2** (표준) | 목록 · 상세 · 폼 화면 | L1 + **상태 + 이벤트** |
| **L3** (복잡) | 다중 API · 복합 모달 · 다단계 폼 | L2 + **컴포넌트 트리 + Props + 렌더 조건 + 폼**(해당 시) |

미결정 사항은 등급에 관계없이 있을 때마다 추가한다.

---

## 섹션 0 — 수락 기준 *(전체 필수, frontmatter 바로 다음)*

4가지 케이스를 `- [ ]` 체크리스트로 작성한다.

```markdown
## 수락 기준
- [ ] 정상 상태: 계좌 목록이 카드 형태로 표시된다
- [ ] 로딩 상태: API 호출 중 스켈레톤 UI가 표시된다
- [ ] 빈 상태: 계좌 없을 때 "등록된 계좌가 없습니다" 안내가 표시된다
- [ ] 에러 상태: 400 → 토스트, 500 → "일시적 오류" 안내
```

---

## 섹션 1 — 개요 *(전체 필수)*

**규칙**: 1~2줄. "무엇을 하는 화면" + "핵심 데이터 흐름" 한 문장.

```markdown
## 개요
계좌 목록 조회 화면. GET /api/accounts 데이터를 카드 목록으로 표시하고,
계좌명/유형 필터 검색, 계좌 삭제(Dialog 확인)를 제공한다.
```

---

## 섹션 2 — 컴포넌트 트리 *(L3)*

**규칙**: 들여쓰기로 계층 표현. 서브컴포넌트 파일 경로 명시. 단일 파일이면 생략.

```markdown
## 컴포넌트 트리
AccountListPage (pages/AccountListPage.tsx)
├── AccountSearchForm (components/AccountSearchForm.tsx)   ← 검색 필터 폼
├── AccountTable (components/AccountTable.tsx)             ← 테이블 + 페이지네이션
│   └── AccountTableRow (components/AccountTableRow.tsx)  ← 행별 수정/삭제 버튼
└── AccountDeleteDialog (components/AccountDeleteDialog.tsx) ← 삭제 확인 모달
```

---

## 섹션 3 — Props *(L2+)*

**규칙**: TypeScript interface 형태. 라우터 params는 `useParams()`로 받으므로 Props 아님 — 별도 명시.

```markdown
## Props
없음 (라우트 페이지, Props 없음)
```

라우터 params가 있는 경우:
```markdown
## Props
라우터 params: `useParams<{ accountId: string }>()`
- `accountId`: 수정할 계좌 ID
```

서브컴포넌트 Props:
```markdown
## Props
\`\`\`typescript
interface AccountTableProps {
  data: Account[]
  isLoading: boolean
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}
\`\`\`
```

---

## 섹션 4 — 상태 *(L2+)*

**규칙**: Server State(useApi)와 Local State(useState)를 구분. 타입과 초기값 명시.

```markdown
## 상태

### Server State (useApi)
- `accounts`: Account[] — GET /api/accounts, 마운트 시 자동 조회
- `deleteAccount`: mutation — DELETE /api/accounts/{id}

### Local State (useState)
- `searchName: string` — 계좌명 검색어, 초기값 ''
- `searchType: string` — 유형 필터, 초기값 '' (전체)
- `deleteTargetId: number | null` — 삭제 확인 대상 ID, null이면 모달 닫힘
```

---

## 섹션 5 — 렌더 조건 *(L3)*

**규칙**: `조건 → 결과` 형태. `isLoading / error / empty` 3단계 분기 반드시 포함.

```markdown
## 렌더 조건

### 테이블 영역
- `isLoading === true` → Skeleton (행 5개)
- `error !== null` → ErrorMessage ("데이터를 불러오지 못했습니다") + 재시도 버튼
- `data.length === 0` → EmptyState ("등록된 계좌가 없습니다")
- `data.length > 0` → AccountTable 렌더링

### 삭제 모달
- `deleteTargetId !== null` → AccountDeleteDialog 표시
- `deleteTargetId === null` → 모달 숨김

### 검색 버튼
- `isLoading === true` → disabled + "조회 중..." 텍스트
```

---

## 섹션 6 — 이벤트 *(L2+)*

**규칙**: `핸들러명(파라미터)` → 동작 순서를 번호로. API 호출 시점, onSuccess/onError 포함.

```markdown
## 이벤트

### handleSearch()
1. searchName, searchType을 query params로 구성
2. useApi params 업데이트 → GET /api/accounts?name=&type= 재요청

### handleReset()
1. searchName → '', searchType → '' 초기화
2. params 없이 GET /api/accounts 재요청

### handleDeleteClick(id: number)
- deleteTargetId = id → 삭제 확인 모달 오픈

### handleDeleteConfirm()
1. deleteAccount.mutate({ id: deleteTargetId })
2. onSuccess: invalidateQueries('/api/accounts') → 목록 갱신
3. onSuccess: deleteTargetId = null → 모달 닫기
4. onError: Toast "삭제에 실패했습니다. 잠시 후 다시 시도해주세요."
```

---

## 섹션 7 — API *(전체 필수)*

**규칙**: `useApi` 시그니처 그대로 명세. `enabled` 조건, `invalidateQueries` 대상 포함.

```markdown
## API

### 계좌 목록 조회
\`\`\`typescript
useApi<Account[]>('/api/accounts', {
  params: { name: searchName, type: searchType },
})
\`\`\`
- 시점: 마운트 시 자동, params 변경 시 재요청
- 에러: error.message를 ErrorMessage 컴포넌트에 표시

### 계좌 삭제
\`\`\`typescript
useApi<void, { id: number }>('/api/accounts/:id', { method: 'DELETE' })
\`\`\`
- 시점: 삭제 확인 모달에서 확인 클릭 시
- onSuccess: `invalidateQueries('/api/accounts')`
- onError: Toast 에러 메시지
```

---

## 섹션 8 — 폼 *(L2+, 폼 화면만)*

**규칙**: zod 스키마 코드블록 + 필드별 규칙 표 + submit 동작. 수정 폼이면 `values` 초기화 방식 명시.

```markdown
## 폼

### zod 스키마
\`\`\`typescript
z.object({
  accountName: z.string().min(1, '계좌명은 필수입니다').max(50),
  accountType: z.enum(['savings', 'checking'], { required_error: '유형을 선택하세요' }),
  balance: z.number({ invalid_type_error: '금액을 입력하세요' }).min(0),
})
\`\`\`

### 필드별 규칙
| 필드 | 타입 | 필수 | 검증 규칙 |
|---|---|---|---|
| accountName | string | Y | 1~50자 |
| accountType | enum | Y | savings \| checking |
| balance | number | Y | 0 이상 |

### Submit 동작
- `form.handleSubmit` → POST /api/accounts mutate
- onSuccess: `form.reset()` → `invalidateQueries('/api/accounts')` → `navigate(-1)`
- onError(400): `form.setError('accountName', { message: error.message })`
- onError(500): Toast "저장에 실패했습니다"

### 수정 폼
- `values: account` — API 응답이 오면 자동으로 폼 값 갱신 (`useForm values` 옵션)
```

---

## 섹션 9 — 예외 처리 *(전체 필수)*

**규칙**: 표 형태로 케이스 | 조건 | UI 처리. 로딩/빈값/에러 3가지 기본은 반드시 포함.

```markdown
## 예외 처리

| 케이스 | 조건 | UI 처리 |
|---|---|---|
| 로딩 중 | `isLoading === true` | Skeleton 5행 |
| 빈 목록 | `data.length === 0` | EmptyState "등록된 계좌가 없습니다" |
| 조회 에러 | `error !== null` | ErrorMessage + 재시도 버튼 |
| 삭제 중 | `deleteAccount.isPending` | 확인 버튼 disabled + "삭제 중..." |
| 삭제 실패 | `deleteAccount.error` | Toast 에러, 모달 유지 |
| accountId 없음 | `accountId === undefined` | `navigate('/accounts')` 리다이렉트 |
```

---

## 섹션 10 — 미결정 사항 *(선택)*

**규칙**: `- [ ]` 형태 열거. 승인(`/spec approve`) 전 반드시 해소해야 한다.

```markdown
## 미결정 사항
- [ ] 페이지네이션 방식: 서버 페이징 vs 클라이언트 페이징 (기획 확인 필요)
- [ ] 계좌 삭제 시 소프트 딜리트 여부 (백엔드 확인 필요)
- [ ] 검색 자동 실행 여부: 입력 즉시 vs 버튼 클릭 시
```

---

## 전체 스펙 템플릿

```markdown
---
title: {PageName} 스펙
category: screen
domain: {domain}
screen: {PageName}
owner: {개발자ID}
reviewer: {리드ID}
status: draft
complexity: L2
last-approved:
compliance-tags: []
tags: []
---

## 수락 기준
- [ ] 정상 상태: ...
- [ ] 로딩 상태: ...
- [ ] 빈 상태: ...
- [ ] 에러 상태: ...

## 개요
{1~2줄 목적 + 핵심 흐름}

## 컴포넌트 트리        ← L3만
{PageName} (pages/{PageName}.tsx)
├── ...

## Props               ← L2+
없음 또는 interface 명세

## 상태                ← L2+
### Server State (useApi)
- ...
### Local State (useState)
- ...

## 렌더 조건           ← L3
- 조건 → UI 처리

## 이벤트              ← L2+
### handleXxx()
1. 동작

## API                 ← 전체 필수
\`\`\`typescript
useApi<TData>('/endpoint', { ... })
\`\`\`

## 폼                  ← L2+, 폼 화면만
\`\`\`typescript
z.object({ ... })
\`\`\`

## 예외 처리           ← 전체 필수
| 케이스 | 조건 | UI 처리 |
|---|---|---|

## 미결정 사항         ← 선택
- [ ] ...
```
