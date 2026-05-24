# SDD 스펙 파일 작성 가이드

> 대상: 화면 스펙을 처음 작성하는 개발자 · 기획자

---

## 이 가이드를 읽기 전에

### 스펙 파일이 왜 필요한가?

React 화면을 만들 때 보통 이렇게 진행합니다.

```
퍼블 소스 받기 → 파일 생성 → 코드 작성 → 완성
```

문제는 **"코드 작성" 단계**입니다. 화면이 복잡해질수록 다음 질문들이 생깁니다.

- 이 버튼을 클릭하면 정확히 어떤 API를 호출하나?
- 로딩 중에 어떤 UI를 보여줘야 하나?
- 검색 결과가 0건일 때 어떻게 표시하나?
- 삭제 실패하면 어떻게 처리하나?

이 질문들에 대한 답을 **미리 문서로 정의한 것**이 스펙 파일입니다.  
스펙이 세밀할수록 코드 작성이 빨라지고, AI도 정확한 코드를 생성할 수 있습니다.

---

### 스펙 파일은 어디에 저장되나?

```
{프로젝트 루트}/
└── .axiom/
    └── screens/
        └── {도메인}/
            └── {화면명}/
                └── spec.md    ← 여기
```

예시: `계좌 목록 화면`의 스펙은 `.axiom/screens/account/AccountListPage/spec.md`

---

## 스펙 파일 구조 한눈에 보기

스펙 파일은 **YAML 헤더(frontmatter)** + **마크다운 섹션**으로 구성됩니다.

```
---                        ← YAML 시작
title: ...                 ← 화면 제목
status: draft              ← 작업 상태
complexity: L2             ← 복잡도 등급
...
---                        ← YAML 끝

## 수락 기준              ← 이 화면이 "완성"인 조건 (체크리스트)
## 개요                   ← 한두 줄 목적 설명
## 컴포넌트 트리          ← 화면 구성 요소 계층 (L3만)
## Props                  ← 외부에서 받는 값 (L2+)
## 상태                   ← 화면 내부 데이터 (L2+)
## 렌더 조건              ← 조건에 따른 화면 변화 (L3)
## 이벤트                 ← 버튼 클릭 등 사용자 동작 (L2+)
## API                    ← 서버와 통신하는 내용 (전체 필수)
## 폼                     ← 입력 양식 규칙 (폼 화면만)
## 예외 처리              ← 오류/빈값/로딩 처리 (전체 필수)
## 미결정 사항            ← 아직 결정 못한 것 (선택)
```

---

## 복잡도 등급 선택하기

스펙을 시작하기 전에 먼저 **복잡도 등급(L1/L2/L3)**을 결정합니다.

### L1 — 단순 화면

**해당하는 경우:**
- 데이터를 보여주기만 하는 화면 (조회 전용)
- 버튼이 없거나 단순 이동 버튼만 있는 경우
- 내부 상태(State)가 없거나 매우 단순한 경우

**예시:** 공지사항 상세 보기, 마이페이지 기본 정보, 도움말 화면

**필수 섹션:** 수락 기준 + 개요 + API + 예외 처리

---

### L2 — 표준 화면

**해당하는 경우:**
- 검색/필터가 있는 목록 화면
- 데이터를 등록·수정하는 폼 화면
- 삭제 확인 팝업이 있는 경우

**예시:** 사용자 목록, 계좌 등록 폼, 주문 상세 (수정 가능)

**필수 섹션:** L1 섹션 + **상태 + 이벤트**

---

### L3 — 복잡한 화면

**해당하는 경우:**
- API를 3개 이상 호출하는 화면
- 여러 개의 모달/다이얼로그가 있는 화면
- 단계별 입력(step form)이 있는 화면
- 서브 컴포넌트가 3개 이상으로 쪼개지는 화면

**예시:** 이체 확인 화면(잔액 조회+한도 조회+이체 실행), 사용자 관리(목록+상세+권한 변경 모달)

**필수 섹션:** L2 섹션 + **컴포넌트 트리 + Props + 렌더 조건 + 폼(해당 시)**

---

## Frontmatter 작성법

스펙 파일 맨 위에 `---`로 감싸는 YAML 헤더입니다.

```yaml
---
title: AccountListPage 계좌 목록 조회
category: screen
domain: account
screen: AccountListPage
owner: hong-gildong
reviewer: team-lead
status: draft
complexity: L2
last-approved:
compliance-tags: []
tags: [account, list, search]
---
```

### 각 필드 설명

| 필드 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `title` | Y | 화면 제목 (사람이 읽기 좋게) | `AccountListPage 계좌 목록 조회` |
| `category` | Y | 스펙 종류 | `screen` (대부분) |
| `domain` | Y | 소속 도메인 (소문자) | `account`, `transfer`, `auth` |
| `screen` | Y | 컴포넌트 이름 (PascalCase) | `AccountListPage` |
| `owner` | Y | 작성자 이름 | `hong-gildong` |
| `reviewer` | 금융 필수 | 검토자 이름 | `team-lead` |
| `status` | Y | 진행 상태 | `draft` (시작값) |
| `complexity` | Y | 복잡도 등급 | `L1`, `L2`, `L3` |
| `last-approved` | | 마지막 승인일 | `2026-05-24` |
| `compliance-tags` | 금융 필수 | 금융 규정 태그 | `[금융실명제, AML]` |
| `tags` | Y | 검색용 태그 | `[account, list]` |

### status 흐름

```
draft → review → approved → implemented
```

- `draft`: 지금 작성 중 (기본값)
- `review`: 리드에게 검토 요청한 상태 → `/spec review` 커맨드로 전환
- `approved`: 리드가 승인한 상태 → `/spec approve` 커맨드로 전환
- `implemented`: 코드까지 생성 완료 → `/scaffold` 실행 시 자동 전환

> **주의**: `approved` 로 전환하려면 `reviewer` 필드가 반드시 채워져 있어야 합니다.

---

## 섹션별 작성 가이드

### 수락 기준 *(전체 필수)*

**이 섹션의 목적**: "이 화면이 완성되었다"는 기준을 체크리스트로 정의합니다.

**작성 규칙**:
- `- [ ]` 형태의 체크리스트로 작성
- **4가지 케이스를 반드시 포함**: 정상 / 로딩 / 빈값 / 에러
- 구체적인 UI 동작까지 서술 (막연하게 쓰지 말 것)

**나쁜 예 (너무 모호)**:
```markdown
## 수락 기준
- [ ] 화면이 잘 보인다
- [ ] 에러 처리가 된다
```

**좋은 예 (구체적)**:
```markdown
## 수락 기준
- [ ] 정상 상태: 계좌 목록이 테이블 형태로 표시되고, 계좌명·잔액·등록일이 각 열에 보인다
- [ ] 로딩 상태: API 호출 중 테이블 영역에 스켈레톤 5행이 표시된다
- [ ] 빈 상태: 계좌가 없을 때 "등록된 계좌가 없습니다" 안내 문구가 테이블 대신 표시된다
- [ ] 에러 상태: 서버 오류(500) 시 "잠시 후 다시 시도해주세요" 메시지와 재시도 버튼이 표시된다
- [ ] 삭제 기능: 삭제 버튼 클릭 시 확인 팝업이 뜨고, 확인 후 목록에서 즉시 사라진다
```

> **팁**: 수락 기준은 QA 테스트 케이스로도 활용됩니다. 테스트 담당자가 이 항목을 보고 테스트할 수 있을 만큼 구체적으로 쓰세요.

---

### 개요 *(전체 필수)*

**이 섹션의 목적**: 화면의 목적과 핵심 데이터 흐름을 한눈에 파악할 수 있게 합니다.

**작성 규칙**:
- 1~2문장으로 작성
- "무엇을 하는 화면인지" + "어떤 데이터가 어떻게 흐르는지"

```markdown
## 개요
계좌 목록 조회 화면. GET /api/accounts 데이터를 테이블로 표시하고,
계좌명·유형 필터로 서버 검색, 계좌 삭제(확인 팝업 포함)를 제공한다.
```

---

### 컴포넌트 트리 *(L3만)*

**이 섹션의 목적**: 화면이 어떤 컴포넌트들로 구성되는지 계층을 미리 설계합니다.

**작성 규칙**:
- 들여쓰기(├──, └──)로 계층을 표현
- 별도 파일로 분리되는 컴포넌트는 파일 경로 명시
- `@axiom/components/ui`에서 가져오는 공용 컴포넌트는 별도 파일 없이 표기

```markdown
## 컴포넌트 트리
AccountListPage (pages/AccountListPage.tsx)          ← 페이지 루트
├── AccountSearchForm (components/AccountSearchForm.tsx)  ← 검색 필터
├── AccountTable (components/AccountTable.tsx)            ← 테이블
│   └── AccountTableRow (components/AccountTableRow.tsx)  ← 행별 버튼
└── AccountDeleteDialog (components/AccountDeleteDialog.tsx) ← 삭제 팝업
```

> **언제 컴포넌트를 분리하나?**  
> 같은 컴포넌트를 다른 화면에서도 쓸 때, 또는 단일 파일이 너무 길어질 때(약 200줄 이상) 분리를 고려합니다.

---

### Props *(L2+)*

**이 섹션의 목적**: 이 컴포넌트가 외부에서 어떤 값을 받는지 정의합니다.

**작성 규칙**:
- TypeScript 타입 정의 형태로 작성
- 라우터 URL 파라미터(`:id` 같은 것)는 Props가 아닌 `useParams()`로 받음 — 별도 명시

**Props가 없는 경우 (페이지 컴포넌트 대부분)**:
```markdown
## Props
없음 (라우트 페이지)
```

**URL 파라미터가 있는 경우**:
```markdown
## Props
없음 (라우트 페이지)

라우터 params: `useParams<{ accountId: string }>()`
- `accountId`: 수정할 계좌 ID (URL: `/account/:accountId/edit`)
```

**서브 컴포넌트인 경우**:
```markdown
## Props
```typescript
interface AccountTableProps {
  data: Account[]          // 테이블에 표시할 계좌 목록
  isLoading: boolean       // 로딩 상태 (스켈레톤 표시 여부)
  onEdit: (id: number) => void    // 수정 버튼 클릭 핸들러
  onDelete: (id: number) => void  // 삭제 버튼 클릭 핸들러
}
```
```

---

### 상태 *(L2+)*

**이 섹션의 목적**: 화면에서 관리하는 데이터를 모두 정의합니다.

두 종류로 구분합니다:
- **Server State**: 서버에서 가져오는 데이터 (`useApi` 훅으로 관리)
- **Local State**: 화면 안에서만 쓰는 데이터 (`useState`로 관리)

**작성 규칙**:
- 변수명, 타입, 역할을 모두 명시
- Local State는 초기값도 명시

```markdown
## 상태

### Server State (useApi)
- `accounts`: Account[] — 계좌 목록. GET /api/accounts, 마운트 시 자동 조회
- `deleteAccount`: mutation — 계좌 삭제. DELETE /api/accounts/{id}

### Local State (useState)
- `searchName: string` — 계좌명 검색 입력값. 초기값: ''
- `searchType: string` — 유형 필터 선택값. 초기값: '' (전체)
- `deleteTargetId: number | null` — 삭제 팝업 대상 계좌 ID. 초기값: null (팝업 닫힘)
- `currentPage: number` — 현재 페이지 번호. 초기값: 1
```

> **Server State vs Local State 구분 기준**  
> 서버 API를 통해 가져오거나 저장하면 → Server State  
> 화면 내 UI 제어용(팝업 열고 닫기, 입력값 추적 등)이면 → Local State

---

### 렌더 조건 *(L3)*

**이 섹션의 목적**: 어떤 상태일 때 어떤 화면을 보여줄지를 명세합니다.

**작성 규칙**:
- `조건 → 보여줄 UI` 형태로 작성
- **isLoading / error / 데이터 없음** 세 가지는 반드시 포함
- 복잡한 조건은 영역별로 나눠서 작성

```markdown
## 렌더 조건

### 테이블 영역
- 로딩 중 (`isLoading === true`) → 스켈레톤 5행 표시
- 에러 발생 (`error !== null`) → "데이터를 불러오지 못했습니다" + 재시도 버튼
- 데이터 없음 (`data.length === 0`) → "등록된 계좌가 없습니다" EmptyState 컴포넌트
- 데이터 있음 → AccountTable 렌더링

### 삭제 팝업
- `deleteTargetId !== null` → AccountDeleteDialog 표시 (대상 계좌 ID 전달)
- `deleteTargetId === null` → 팝업 숨김

### 검색 버튼
- 조회 중 (`isLoading === true`) → 버튼 비활성화 + "조회 중..." 텍스트
- 조회 완료 → 버튼 활성화 + "검색" 텍스트
```

---

### 이벤트 *(L2+)*

**이 섹션의 목적**: 사용자가 버튼을 누르거나 입력할 때 어떤 동작이 일어나는지 순서대로 정의합니다.

**작성 규칙**:
- 핸들러 이름을 제목으로 사용
- 동작을 번호로 순서 나열
- API 호출이 있으면 성공(onSuccess)·실패(onError) 처리까지 명시

```markdown
## 이벤트

### handleSearch() — 검색 버튼 클릭
1. 현재 입력된 searchName, searchType으로 query 파라미터 구성
2. useApi params 업데이트 → GET /api/accounts?name=...&type=... 재요청
3. currentPage → 1 초기화

### handleReset() — 초기화 버튼 클릭
1. searchName → '' 초기화
2. searchType → '' 초기화
3. 파라미터 없이 GET /api/accounts 재요청

### handleEditClick(id: number) — 수정 버튼 클릭
- navigate(`${id}/edit`) 로 수정 페이지 이동

### handleDeleteClick(id: number) — 삭제 버튼 클릭
- deleteTargetId = id → 삭제 확인 팝업 열기

### handleDeleteConfirm() — 삭제 팝업에서 확인 버튼 클릭
1. DELETE /api/accounts/{deleteTargetId} 호출 (mutate)
2. 성공(onSuccess):
   - 계좌 목록 캐시 갱신 (invalidateQueries)
   - deleteTargetId = null → 팝업 닫기
3. 실패(onError):
   - Toast "삭제에 실패했습니다. 잠시 후 다시 시도해주세요." 표시
   - 팝업 유지 (삭제 재시도 가능)

### handleDeleteCancel() — 삭제 팝업에서 취소 버튼 클릭
- deleteTargetId = null → 팝업 닫기
```

---

### API *(전체 필수)*

**이 섹션의 목적**: 어떤 API를 언제, 어떻게 호출하는지 명세합니다.

**작성 규칙**:
- API별로 소제목을 달고 코드 형태로 명세
- 호출 **시점** 명시 (마운트 시 자동 / 버튼 클릭 시 / 조건 충족 시)
- 에러 코드별 처리 방법 명시

```markdown
## API

### 계좌 목록 조회
```typescript
useApi<Account[]>('/api/accounts', {
  params: { name: searchName, type: searchType },
})
```
- 시점: 화면 진입 시 자동 조회, 검색 파라미터 변경 시 재조회
- 성공: Account[] 를 테이블에 표시
- 실패: error 상태로 ErrorMessage 컴포넌트 표시

### 계좌 삭제
```typescript
useApi<void, { id: number }>('/api/accounts/:id', { method: 'DELETE' })
```
- 시점: 삭제 확인 팝업에서 확인 클릭 시
- 성공: invalidateQueries('/api/accounts') — 목록 자동 갱신
- 실패(400): Toast "잘못된 요청입니다"
- 실패(403): Toast "삭제 권한이 없습니다"
- 실패(500/503): Toast "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요"
```

> **기획자를 위한 설명**:  
> `useApi<Account[]>('/api/accounts')` 에서  
> `Account[]` = 서버에서 받아오는 데이터 형태 (계좌 목록)  
> `'/api/accounts'` = API 주소  
> 이 형태만 보고 개발자가 코드를 정확하게 작성할 수 있습니다.

---

### 폼 *(폼 화면만)*

**이 섹션의 목적**: 입력 양식의 필드 규칙과 제출 동작을 정의합니다.

**작성 규칙**:
- 각 필드의 타입, 필수 여부, 검증 규칙을 표로 정리
- 제출 성공·실패 시 동작 명시
- 수정 폼이면 기존 데이터 불러오는 방식도 명시

```markdown
## 폼

### 필드 규칙
| 필드명 | 화면 레이블 | 타입 | 필수 | 검증 규칙 |
|---|---|---|---|---|
| accountName | 계좌명 | 텍스트 | Y | 1~50자 |
| accountType | 계좌 유형 | 선택(Select) | Y | savings(저축) 또는 checking(입출금) |
| initialBalance | 초기 잔액 | 숫자 | Y | 0 이상의 정수 |
| memo | 메모 | 텍스트(여러 줄) | N | 최대 200자 |

### 제출(Submit) 동작
- 성공:
  1. 폼 초기화
  2. 계좌 목록 캐시 갱신
  3. 계좌 목록 화면으로 이동
- 실패(400, 필드 오류): 해당 필드 아래 서버 에러 메시지 표시
- 실패(500): Toast "저장에 실패했습니다. 잠시 후 다시 시도해주세요"

### 수정 폼의 경우
- 화면 진입 시 GET /api/accounts/{id} 로 기존 데이터 조회
- 조회 완료 후 각 필드에 기존 값 자동 채움
- accountType은 수정 불가 (비활성 표시)
```

---

### 예외 처리 *(전체 필수)*

**이 섹션의 목적**: 정상 동작 외의 모든 케이스를 표로 정리합니다.

**작성 규칙**:
- 표 형태로 작성: 케이스 | 발생 조건 | UI 처리 방법
- **로딩 / 빈값 / 에러** 3가지 기본 케이스는 항상 포함
- UI 처리는 구체적으로 (어떤 컴포넌트를 쓰는지까지)

```markdown
## 예외 처리

| 케이스 | 발생 조건 | UI 처리 |
|---|---|---|
| 로딩 중 | API 호출 진행 중 | 테이블 영역에 스켈레톤 5행 표시 |
| 빈 목록 | 조회 결과 0건 | "등록된 계좌가 없습니다" EmptyState |
| 조회 실패 | API 에러 응답 | ErrorMessage + "재시도" 버튼 표시 |
| 삭제 진행 중 | 삭제 API 호출 중 | 팝업 내 확인 버튼 비활성화 + "삭제 중..." |
| 삭제 실패 | 삭제 API 에러 | Toast 에러 메시지, 팝업 유지 |
| URL 파라미터 없음 | accountId가 URL에 없을 때 | 계좌 목록 화면으로 즉시 리다이렉트 |
| 네트워크 끊김 | fetch 실패 | Toast "네트워크 연결을 확인해주세요" + 재시도 버튼 |
```

---

### 미결정 사항 *(선택)*

**이 섹션의 목적**: 스펙 작성 중 아직 결정하지 못한 것을 명시합니다.

**작성 규칙**:
- `- [ ]` 형태로 작성
- 승인(`/spec approve`)하기 전에 모두 해소해야 함

```markdown
## 미결정 사항
- [ ] 페이지네이션 방식: 페이지 번호 버튼 vs 무한 스크롤 — 기획 확인 필요
- [ ] 계좌 삭제 시 소프트 딜리트(복구 가능) 여부 — 백엔드 확인 필요
- [ ] 검색 자동 실행 여부: 입력 중 즉시 검색 vs 검색 버튼 클릭 시
```

---

## 실전 완성 예시

### 예시 1 — L1: 공지사항 상세 화면 (단순)

```markdown
---
title: NoticeDetailPage 공지사항 상세
category: screen
domain: notice
screen: NoticeDetailPage
owner: kim-developer
status: draft
complexity: L1
tags: [notice, detail, readonly]
---

## 수락 기준
- [ ] 정상 상태: 공지사항 제목·내용·작성일이 화면에 표시된다
- [ ] 로딩 상태: 내용 영역에 스켈레톤 UI가 표시된다
- [ ] 에러 상태: 조회 실패 시 "불러오지 못했습니다" 메시지가 표시된다
- [ ] 뒤로 가기: [목록으로] 버튼 클릭 시 공지사항 목록으로 이동한다

## 개요
공지사항 상세 조회 화면. GET /api/notices/{id} 데이터를 표시하는 읽기 전용 화면.

## API

### 공지사항 상세 조회
\`\`\`typescript
useApi<Notice>('/api/notices/:id', {
  queryOptions: { enabled: !!noticeId },
})
\`\`\`
- 시점: 화면 진입 시 자동 조회
- 라우터 params: `useParams<{ noticeId: string }>()`

## 예외 처리

| 케이스 | 발생 조건 | UI 처리 |
|---|---|---|
| 로딩 중 | API 호출 중 | 본문 영역 스켈레톤 |
| 조회 실패 | 404/500 에러 | "공지사항을 불러오지 못했습니다" + 목록으로 버튼 |
| noticeId 없음 | URL에 ID 없음 | 공지사항 목록으로 리다이렉트 |
```

---

### 예시 2 — L2: 계좌 목록 화면 (표준)

```markdown
---
title: AccountListPage 계좌 목록 조회
category: screen
domain: account
screen: AccountListPage
owner: park-developer
status: draft
complexity: L2
tags: [account, list, search, delete]
---

## 수락 기준
- [ ] 정상 상태: 계좌 목록이 테이블로 표시되고, 계좌명·유형·잔액·등록일이 보인다
- [ ] 로딩 상태: 테이블 영역에 스켈레톤 5행이 표시된다
- [ ] 빈 상태: 계좌 없을 때 "등록된 계좌가 없습니다" 안내가 표시된다
- [ ] 에러 상태: 조회 실패 시 ErrorMessage + 재시도 버튼이 표시된다
- [ ] 검색: 계좌명·유형 필터 입력 후 검색 버튼 클릭 시 필터 적용된 목록이 표시된다
- [ ] 삭제: 삭제 버튼 → 확인 팝업 → 확인 클릭 → 목록에서 즉시 제거된다

## 개요
계좌 목록 조회 화면. GET /api/accounts 데이터를 테이블로 표시하고,
계좌명·유형 필터 검색과 계좌 삭제(확인 팝업)를 제공한다.

## Props
없음 (라우트 페이지)

## 상태

### Server State (useApi)
- `accounts`: Account[] — GET /api/accounts, 마운트 시 자동 조회
- `deleteAccount`: mutation — DELETE /api/accounts/{id}

### Local State (useState)
- `searchName: string` — 계좌명 검색어. 초기값: ''
- `searchType: string` — 유형 필터. 초기값: '' (전체)
- `deleteTargetId: number | null` — 삭제 팝업 대상. 초기값: null

## 이벤트

### handleSearch()
1. searchName, searchType으로 params 구성
2. GET /api/accounts?name=...&type=... 재요청

### handleReset()
1. searchName, searchType 초기화
2. params 없이 GET /api/accounts 재요청

### handleDeleteClick(id: number)
- deleteTargetId = id → 삭제 팝업 열기

### handleDeleteConfirm()
1. DELETE /api/accounts/{deleteTargetId} 호출
2. 성공: invalidateQueries + deleteTargetId = null (팝업 닫기)
3. 실패: Toast 에러 메시지 (팝업 유지)

## API

### 계좌 목록 조회
\`\`\`typescript
useApi<Account[]>('/api/accounts', {
  params: { name: searchName, type: searchType },
})
\`\`\`
- 시점: 마운트 시 자동, params 변경 시 재요청

### 계좌 삭제
\`\`\`typescript
useApi<void, { id: number }>('/api/accounts/:id', { method: 'DELETE' })
\`\`\`
- onSuccess: invalidateQueries('/api/accounts')
- onError: Toast 에러 메시지

## 예외 처리

| 케이스 | 발생 조건 | UI 처리 |
|---|---|---|
| 로딩 중 | isLoading === true | Skeleton 5행 |
| 빈 목록 | data.length === 0 | EmptyState |
| 조회 에러 | error !== null | ErrorMessage + 재시도 버튼 |
| 삭제 진행 중 | deleteAccount.isPending | 팝업 확인 버튼 disabled |
| 삭제 실패 | deleteAccount.error | Toast, 팝업 유지 |
```

---

## AI로 스펙 자동 생성하기

직접 처음부터 작성하지 않고, **axiom-ai** 확장을 사용하면 AI가 스펙 초안을 생성해줍니다.

### 방법 1: 채팅창에서 `/spec` 커맨드

작업 중인 파일을 열어둔 상태에서 채팅창에 입력:

```
/spec 계좌 목록 화면 — 검색·삭제 기능 포함
```

→ 현재 열린 파일의 코드를 분석해서 스펙 초안 자동 생성  
→ `.axiom/screens/account/AccountListPage/spec.md`에 저장

### 방법 2: 대화형 가이드 (wizard)

```
/spec wizard
```

→ AI가 단계별로 질문하면서 스펙 작성을 도와줌  
→ 처음 작성하는 분께 추천

### 방법 3: 기존 파일에서 역방향 추출

퍼블리셔가 제공한 HTML 파일을 우클릭 → **"Axiom: 이 파일로 스펙 생성"**  
→ HTML 구조를 분석해서 스펙 자동 생성

### AI가 생성한 초안 수정하기

AI 생성 스펙은 항상 `TODO:` 항목이 있을 수 있습니다. 이 항목들을 채워주세요.

```
/spec update 삭제 기능 추가해줘 — 확인 팝업 포함
/spec update 미결정 사항의 페이지네이션을 무한 스크롤로 결정
```

---

## 스펙 완성 체크리스트

스펙을 리뷰 요청(`/spec review`) 하기 전 확인사항:

```
[ ] frontmatter의 모든 필수 필드가 채워졌는가?
[ ] complexity 등급(L1/L2/L3)이 적절히 선택되었는가?
[ ] 수락 기준에 정상/로딩/빈값/에러 4가지 케이스가 있는가?
[ ] 수락 기준이 구체적으로 작성되었는가? (모호한 표현 없는가?)
[ ] API 섹션에 호출 시점과 에러 코드별 처리가 있는가?
[ ] 예외 처리 표에 로딩/빈값/에러 기본 3가지가 있는가?
[ ] 미결정 사항이 있다면 내용이 채워졌는가?
[ ] L2 이상이면 상태(State)와 이벤트(Events) 섹션이 있는가?
[ ] L3이면 컴포넌트 트리와 렌더 조건 섹션이 있는가?
```

---

## 자주 묻는 질문

**Q. 기획자도 이 스펙을 작성해야 하나요?**  
A. 기획자는 `수락 기준`, `개요`, `미결정 사항` 3개 섹션만 작성해도 됩니다. 나머지는 개발자가 채웁니다.

**Q. 스펙을 먼저 다 완성해야 개발을 시작할 수 있나요?**  
A. 아닙니다. `draft` 상태의 스펙으로도 `/scaffold` 커맨드로 코드 스텁을 생성할 수 있습니다. 개발하면서 스펙을 보완해가는 방식도 가능합니다.

**Q. 스펙과 실제 코드가 달라지면 어떻게 하나요?**  
A. 코드를 수정하면 해당 스펙이 30일 이내에 업데이트되지 않으면 `stale(만료)` 경고가 뜹니다. `/spec update`로 스펙을 코드에 맞게 업데이트하세요.

**Q. 모든 화면에 스펙이 필요한가요?**  
A. 단순한 정적 화면(약관, 도움말 등)은 L1 스펙 4~5줄이면 충분합니다. 복잡한 업무 화면일수록 세밀한 스펙이 개발 속도를 높여줍니다.

**Q. 팀에 처음 SDD를 도입할 때 어디서 시작하면 좋나요?**  
A. 가장 자주 만드는 화면 유형 1개(예: 목록 화면)의 스펙을 L2로 작성해보는 것을 추천합니다. 이 예시 파일이 팀 전체의 스펙 작성 기준이 됩니다.
