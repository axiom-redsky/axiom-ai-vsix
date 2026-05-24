# Plan: SDD (Story Driven Development) — axiom-ai Extension 통합

## Context

**axiom-ai**는 `react-app-scaffold` 기반 프로젝트에서 개발 생산성을 높이기 위한 VSCode Extension이다.
Extension이 설치되는 대상 워크스페이스는 아래 구조를 따른다:

```
react-app-scaffold
├── .axiom                           # SDD 방법론 개발을 위한 스펙 md파일들의 모음 폴더
├── .storybook                       # Storybook 설정
├── .vscode                          # VSCode 설정
│   └── settings.json                # 에디터 설정 (Format on Save 등)
├── public                           # 정적 파일 (/ 경로로 접근)
├── src
│   ├── __stories__                  # Storybook 소스 코드 모음
│   ├── design-tokens                # style-dictionary 라이브러리를 통한 디자인 토큰 생성용 json 작업 폴더
│   ├── assets                       # 정적 리소스
│   │   ├── images
│   │   └── styles
│   │       ├── tokens/                  ← (신규, 자동생성) Style Dictionary 출력물
│   │       │   ├── primitive.css        ← ⚠ 직접 편집 금지 (generated)
│   │       │   ├── theme-dark.css
│   │       │   └── theme-light.css
│   │       ├── themes/                  ← (신규) 프로젝트 브랜드 테마
│   │       │   ├── theme-default.css
│   │       │   └── theme-example-project.css  ← 투입 시 참고용 예시
│   │       ├── base/                    ← (신규) 전역 초기화·유틸
│   │       │   ├── reset.css
│   │       │   ├── typography.css
│   │       │   ├── layout.css
│   │       │   └── utilities.css
│   │       ├── layout/
│   │       │   └── default/layout.css   ← 기존, 서드파티 오버라이드만 남김
│   │       └── app.css                  ← @import 진입점
│   ├── core                         # 핵심 공통 코어 (업무 개발자 미작업 영역)
│   │   ├── api                      # Axios 기반 공통 API 클라이언트
│   │   ├── context                  # 공통 컨텍스트 컴포넌트
│   │   ├── hooks                    # 공통 커스텀 훅
│   │   ├── providers                # 전역 Provider 모음
│   │   ├── query                    # TanStack Query 설정
│   │   ├── router                   # 앱 공통 라우터 설정
│   │   ├── types                    # 공통 타입 정의
│   │   └── utils                    # 공통 유틸리티 함수
│   ├── domains                      # 업무(Domain) 그룹
│   │   ├── example                  # example 도메인
│   │   │   ├── components           # example 도메인 컴포넌트 모음
│   │   │   ├── common               # example 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # example 도메인 페이지 모음
│   │   │   ├── router               # example 도메인 라우팅 설정
│   │   │   └── types                # example 도메인 타입 정의
│   │   ├── main                     # main 도메인
│   │   │   ├── components           # main 도메인 컴포넌트 모음
│   │   │   ├── common               # main 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # main 도메인 페이지 모음
│   │   │   ├── router               # main 도메인 라우팅 설정
│   │   │   └── types                # main 도메인 타입 정의
│   │   └── ...                      # (신규 도메인 추가)
│   ├── publishing                   # 퍼블리셔가 작업하여 제공하는 폴더.(업무별로 폴더를 생성)
│   │   ├── example                  # example 도메인 업무
│   │   │   ├── components           # example 도메인 컴포넌트 모음
│   │   │   ├── common               # example 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # example 도메인 페이지 모음
│   │   │   ├── router               # example 도메인 라우팅 설정
│   │   │   └── types                # example 도메인 타입 정의
│   │   ├── main                     # main 도메인 업무
│   │   │   ├── components           # main 도메인 컴포넌트 모음
│   │   │   ├── common               # main 도메인 공통 컴포넌트 모음
│   │   │   ├── pages                # main 도메인 페이지 모음
│   │   │   ├── router               # main 도메인 라우팅 설정
│   │   │   └── types                # main 도메인 타입 정의
│   │   └── ...                      # (신규 도메인 업무 계속 추가하여 작업)
│   ├── shared                       # 전역 공유 코드
│   │   ├── components
│   │   │   └── layout               # 레이아웃 컴포넌트
│   │   ├── lib
│   │   │   ├── shadcn               # shadcn/ui 원본 컴포넌트
│   │   │   │   └── ui                   # shadcn/ui UI 컴포넌트 모음
│   │   │   └── utils.ts                 # shadcn/ui 유틸리티 함수 모음
│   │   └── router                   # 전체 라우팅 통합 설정
│   ├── types                        # TypeScript 전역 타입
│   ├── App.tsx                      # 앱 루트 컴포넌트
│   └── main.tsx                     # 앱 진입점
├── .env                             # 공통 환경 변수
├── .env.production                  # 프로덕션 환경 변수
├── .gitignore
├── components.json                  # shadcn/ui CLI 설정
├── eslint.config.js                 # ESLint 린팅 규칙
├── index.html                       # 루트 HTML
├── package.json                     # 의존성 및 스크립트
├── prettier.config.js               # Prettier 포매팅 규칙
├── tsconfig.json                    # TypeScript 설정 (루트)
├── tsconfig.app.json                # TypeScript 설정 (App)
├── tsconfig.node.json               # TypeScript 설정 (Node)
├── tsconfig.stories.json            # TypeScript 설정 (Storybook)
└── vite.config.ts                   # Vite 빌드 설정
```

SDD 통합의 목표: AI가 scaffold 컨벤션을 알고 있는 상태에서, 개발자의 현재 작업 파일 컨텍스트를 읽어 **스펙 초안을 생성**하고, 이를 `.axiom/` 디렉터리에 저장·관리한다.

**전체 워크플로우 사이클 (금융권 폐쇄망 기준):**

```
스펙 생성(/spec) → 스펙 편집(에디터/패널) → 검토 요청(/spec review)
    → 스펙 승인(/spec approve) → 코드 반영(/scaffold) → implemented 표시
```

**해결해야 할 5가지 문제:**
1. **토큰 폭발** — 스펙이 많아져도 항상 10~20개 파일만 컨텍스트에 올라오게
2. **스펙 충돌** — 3계층 소유권으로 Button 스펙이 두 버전 공존하는 상황 방지
3. **스펙 부패** — 소스 변경 후 30일 이상 스펙 미갱신 시 경고
4. **폐쇄망 동작** — 내부 AI 서버 미응답 시에도 기본 스텁 생성 가능
5. **스펙 가시성** — 패널에서 전체 스펙 상태(draft/review/approved/stale)를 한눈에 파악

---

## 지식 베이스 통합 (Knowledge Consolidation)

### 현재 문제: md 파일이 3곳으로 분산

```
axiom-ai-vsix/          ← 확장 개발 레포
  .rag/                 ← AI 내부 지식 (patterns, components, conventions...)
  corpus/               ← scaffold 외부 문서 (scaffold-docs, scaffold-source...)

react-app-scaffold/     ← 대상 프로젝트
  .axiom/               ← SDD 스펙 (global, domain, screens...)
```

역할이 다른 세 폴더가 모두 md 파일을 사용 → "어디에 뭐가 있는지" 불명확, 유지보수 비용 증가.

### 해결: 확장 레포는 `knowledge/` 하나로 통합

```
axiom-ai-vsix/
└── knowledge/                  ← 기존 .rag/ + corpus/ 통합 (확장 내장 지식)
    ├── _index.md
    ├── components/             ← 기존 .rag/components/ (Button, Dialog, Form...)
    ├── conventions/            ← 기존 .rag/conventions/ (naming, typescript)
    ├── patterns/               ← 기존 .rag/patterns/ (api-call, router, useApi...)
    ├── react/                  ← 기존 .rag/react/
    ├── scaffold/               ← 기존 .rag/scaffold/ (project-structure)
    ├── scaffold-docs/          ← 기존 corpus/scaffold-docs/ (공식 문서)
    └── scaffold-source/        ← 기존 corpus/scaffold-source/ (소스 예제)
```

**효과:**
- 확장 개발자: `knowledge/` 하나만 보면 AI가 아는 것 전부 확인
- `HybridRagEngine`과 `ExternalCorpusLoader`가 동일한 `knowledge/` 경로를 바라봄 → 설정 단순화
- `.rag/`, `corpus/` 루트 폴더 제거 → 레포 루트 정리

### 대상 프로젝트 `.axiom/`도 동일 논리 적용

확장이 초기화 시 번들의 `knowledge/`를 대상 프로젝트 `.axiom/knowledge/`에 복사.
개발자는 `.axiom/` 하나만 열면 참고 지식 + SDD 스펙 모두 관리 가능.

### 코드 변경 포인트

| 파일 | 변경 내용 |
|---|---|
| `src/ai/HybridRagEngine.ts` | `.rag/` 경로 → `knowledge/` 경로로 교체 |
| `src/ai/ExternalCorpusLoader.ts` | `corpus/` 경로 → `knowledge/scaffold-docs/`, `knowledge/scaffold-source/`로 교체 |
| `src/config/ExtensionConfig.ts` | `getKnowledgeFolder()` 추가, `getRagFolder()` / `getCorpusFolder()` 제거 |
| `src/spec/ContextCollector.ts` | 3·4순위 `collectCorpus` + `collectRagGlobal` → `collectKnowledge()` 단일 메서드로 통합 |

---

## `.axiom/` 디렉터리 구조

`react-app-scaffold`의 `src/domains/` 구조를 그대로 반영한다.

```
{workspace-root}/
└── .axiom/                         ← axiom-ai.sdd.axiomFolder 설정
    ├── .axiom-index.json            ← 스펙 메타 + staleness + status 추적
    ├── .audit-log.ndjson            ← 스펙 상태 변경 이력 (금융 감사 로그)
    ├── domain-map.json              ← (선택) 비표준 경로 매핑 override
    │
    ├── knowledge/                   ← 확장이 초기화 시 번들에서 복사 (읽기 전용)
    │   ├── components/              ← UI 컴포넌트 참고 (Button, Form, Table...)
    │   ├── conventions/             ← 코드 컨벤션 (naming, typescript)
    │   ├── patterns/                ← scaffold 코딩 패턴 (useApi, router...)
    │   └── scaffold-docs/           ← scaffold 공식 문서
    │
    ├── global/                      ← 리드 개발자만 수정
    │   ├── _index.md
    │   ├── ui-spec.md               ← @axiom/components/ui 공용 컴포넌트 스펙
    │   └── api-spec.md              ← useApi 훅 패턴, ApiError 처리 규칙
    │
    ├── domain/                      ← 도메인 담당자 수정
    │   ├── auth/
    │   │   ├── _index.md
    │   │   ├── feature-spec.md      ← 도메인 비즈니스 규칙
    │   │   └── ui-spec.md
    │   └── transfer/
    │       └── feature-spec.md
    │
    └── screens/                     ← 담당 개발자 자유 작성
        ├── auth/
        │   ├── LoginPage/
        │   │   └── spec.md
        │   └── ProfilePage/
        │       └── spec.md
        └── transfer/
            └── TransferConfirmPage/
                └── spec.md
```

### 스펙 파일 프론트매터 (scaffold 컨벤션 반영)

```yaml
---
title: TransferConfirmPage 스펙
category: screen
domain: transfer
screen: TransferConfirmPage          # src/domains/transfer/pages/TransferConfirmPage.tsx
owner: hong-gildong
reviewer: team-lead
status: draft                        # draft | review | approved | implemented
last-approved: 2026-05-01
compliance-tags: [금융실명제, 이상거래탐지]
tags: [transfer, confirm, 이체확인, useApi, mutation]
---

## 개요
이체 확인 화면. useApi POST mutation으로 이체 실행, invalidateQueries('/api/transfer')로 캐시 무효화.

## 컴포넌트 구조
- `TransferConfirmPage.tsx` — src/domains/transfer/pages/
- useApi<TransferResult, TransferDto>('/api/transfer', { method: 'POST' })

## API
- POST /api/transfer — 이체 실행
- GET /api/transfer/history — 이체 이력 조회

## 예외 처리
- ApiError 400: 잔액 부족 → form.setError('amount', ...)
- ApiError 503: 점검 중 → Toast 안내

## 미결정 사항
- 이체 한도 초과 시 분할 이체 안내 UX 미정
```

### `.axiom-index.json`

```json
{
  "specs": [
    {
      "specPath": "screens/transfer/TransferConfirmPage/spec.md",
      "linkedSourcePath": "src/domains/transfer/pages/TransferConfirmPage.tsx",
      "lastModified": "2026-05-01",
      "domain": "transfer",
      "status": "approved",
      "approvedBy": "team-lead",
      "approvedAt": "2026-05-01"
    }
  ]
}
```

---

## 폐쇄망(Closed Network) 환경 지원

금융권 폐쇄망에서는 외부 인터넷 접근이 불가하다. axiom-ai는 다음 방식으로 대응한다.

### 설정

```json
// .vscode/settings.json (대상 프로젝트)
{
  "axiom-ai.server.endpoint": "http://192.168.10.100:8080",  // 내부 AI 서버
  "axiom-ai.server.offlineFallback": true                    // AI 미응답 시 빈 스텁 반환
}
```

### OfflineFallbackService 동작

AI 서버 응답 없음(타임아웃/연결 오류) → `OfflineFallbackService.generateStub(intent, domain, screen)`:
- spec frontmatter 기반으로 scaffold 컨벤션에 맞는 빈 TSX 페이지 스텁 반환
- `useApi`, Props interface, 기본 return JSX 포함한 최소 구조 생성
- corpus 파일은 Extension 번들에 내장 (외부 fetch 없음)

```typescript
// 오프라인 fallback 스텁 예시 출력
export default function TransferConfirmPage() {
  const { data, mutate } = useApi<TransferResult, TransferDto>('/api/transfer', { method: 'POST' });
  // TODO: 스펙 기반 구현 필요
  return <div>TransferConfirmPage</div>;
}
```

**영향 파일:** `src/ai/LlmService.ts` (타임아웃/에러 시 fallback 호출), `src/config/ExtensionConfig.ts` (엔드포인트 설정)

---

## 핵심 서비스: ContextCollector

스펙 생성 품질을 결정하는 서비스. **4계층 × 토큰 예산 × recency bias**.

### 토큰 예산

```typescript
const TOKEN_BUDGET = {
  total:       3800,   // 4096 - 시스템 프롬프트 틀 ~300
  activeFile:   800,   // 1순위: 현재 열린 .ts/.tsx 파일
  axiomSpecs:  1200,   // 2순위: .axiom/screens|domain|global/ 스펙 (도메인 필터)
  knowledge:   1600,   // 3순위: knowledge/ scaffold 컨벤션 + 패턴 (기존 corpus+rag 통합)
}
```

### 계층별 수집 전략

**1순위 — 현재 열린 파일 (`collectActiveFile`):**
- `.ts/.tsx` 파일만 (md, json, css 제외)
- `extractSignature()`: import + interface/type + export function/const 라인만 최대 60줄
- scaffold 패턴 우선 추출: `useApi` 호출부, `TAppRoute[]`, Props interface

**2순위 — `.axiom/` 스펙 (`collectAxiomSpecs`):**
- `DomainRouter.detectDomain(filePath)` → `src/domains/{domain}/` 패턴으로 도메인 추출
- `screens/{domain}/ + domain/{domain}/ + global/` 세 경로만 로드 (나머지 700개 무시)
- `.axiom/knowledge/`는 이 단계에서 제외 (3순위에서 별도 처리)
- 해당 범위 내 키워드 관련성 정렬 → 예산 내에서만 포함

**3순위 — `knowledge/` scaffold 지식 (`collectKnowledge`):**
- 기존 `corpus/` + `.rag/` 역할을 `knowledge/` 단일 경로에서 처리
- frontmatter `keywords` vs 사용자 입력 키워드 매칭
- 점수: frontmatter 매칭(×3) + 파일명 매칭(×2) + 본문 매칭(×1)
- 관련 문서만 선별: `useApi`, `loadable`, `createHashRouter`, 컴포넌트명 등
- `HybridRagEngine` 재사용 (경로만 `knowledge/`로 변경)

### Recency Bias — 프롬프트 주입 순서

```
3순위 knowledge/ → 2순위 .axiom/ → 1순위 열린 파일 (맨 마지막)
```
LLM은 컨텍스트 끝부분을 더 잘 기억 → 가장 중요한 현재 파일이 마지막에 위치.

### 병렬 수집

```typescript
const [activeFile, axiomSpecs, knowledge] = await Promise.all([
  this.collectActiveFile(),
  this.collectAxiomSpecs(userPrompt),
  this.collectKnowledge(userPrompt),    // 기존 collectCorpus + collectRagGlobal 통합
])
```

---

## DomainRouter — scaffold 경로 패턴 기반

react-app-scaffold는 `src/domains/{domain}/` 구조가 표준이므로 `domain-map.json` 없이도 동작:

```typescript
detectDomain(filePath: string): string | null {
  // 1순위: src/domains/{domain}/ 패턴 (react-app-scaffold 표준)
  const match = filePath.match(/[/\\]domains[/\\]([^/\\]+)[/\\]/);
  if (match) return match[1];

  // 2순위: domain-map.json override (비표준 구조 프로젝트용)
  return this.matchFromMap(filePath);
}
```

---

## SDD 관리 패널 (SDD Management Panel)

axiom-ai 사이드바에 별도 TreeView 패널을 제공하여 `.axiom/` 스펙 전체를 시각적으로 관리한다.

### 패널 구조

```
AXIOM SDD
├── global/
│   ├── ✅ ui-spec.md
│   └── ✅ api-spec.md
├── domain/
│   ├── auth/
│   │   └── ✅ feature-spec.md
│   └── transfer/
│       └── 👀 feature-spec.md   ← review 중
└── screens/
    ├── auth/
    │   └── LoginPage/
    │       └── ✏️ spec.md       ← draft
    └── transfer/
        └── TransferConfirmPage/
            └── ⚠️ spec.md       ← stale (소스 변경됨)
```

**상태 배지:**

| 배지 | 상태 | 의미 |
|---|---|---|
| ✏️ | draft | 초안, 아직 검토 전 |
| 👀 | review | 리드 검토 요청 중 |
| ✅ | approved | 승인됨, 코드 반영 가능 |
| 🔨 | implemented | 코드 반영 완료 |
| ⚠️ | stale | 소스 변경 후 스펙 미갱신 |

### 컨텍스트 메뉴 (스펙 아이템 우클릭)

| 메뉴 | 동작 |
|---|---|
| Open Spec | 에디터에서 spec.md 열기 |
| Edit with AI | `/spec update` 진입 (AI 보조 수정) |
| Request Review | status → review, reviewer에게 알림 |
| Approve | status → approved (리드만 실행 가능) |
| Generate Code | `/scaffold` 실행 (approved 상태만) |
| View Diff | 소스 vs 스펙 diff 표시 |

**신규 파일:** `src/views/SddPanelProvider.ts`
**package.json:** `"axiom-ai.sddPanel"` ViewsContainer + TreeDataProvider 등록

---

## 구현 파일 목록

### 신규: `src/spec/`

| 파일 | 역할 |
|---|---|
| `src/spec/ContextCollector.ts` | 4계층 수집 + 토큰 예산 + recency bias 조립 |
| `src/spec/DomainRouter.ts` | `src/domains/{domain}/` 경로 → 도메인 감지 |
| `src/spec/SddCorpusLoader.ts` | `ExternalCorpusLoader` 3회 호출로 tier별 로드 |
| `src/spec/SpecGenerator.ts` | ContextCollector + LlmService → 스펙 마크다운 스트리밍 |
| `src/spec/SpecFileWriter.ts` | 초안 → `.axiom/screens/{domain}/{Screen}/spec.md` 저장 + 컴플라이언스 검증 |
| `src/spec/AxiomIndexTracker.ts` | `.axiom-index.json` 읽기/쓰기, staleness·status 추적 |
| `src/spec/SpecScaffolder.ts` | 승인된 spec.md → scaffold 컨벤션 TSX 스텁 생성 (Spec-to-Code) |

### 신규: `src/views/`

| 파일 | 역할 |
|---|---|
| `src/views/SddPanelProvider.ts` | `.axiom/` 트리뷰 패널, 상태 배지, 컨텍스트 메뉴 |

### 신규: `src/ai/`

| 파일 | 역할 |
|---|---|
| `src/ai/OfflineFallbackService.ts` | 폐쇄망 AI 미응답 시 scaffold 기반 빈 스텁 반환 |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `src/config/ExtensionConfig.ts` | `getSddAxiomFolder()`, `getServerEndpoint()`, `isOfflineFallback()` 추가 |
| `src/providers/ChatViewProvider.ts` | `/spec`, `/scaffold` 분기, `.axiom/` watcher, SDD corpus 주입 |
| `src/commands/index.ts` | `axiom-ai.generateSpec`, `axiom-ai.scaffoldFromSpec`, `axiom-ai.approveSpec` 등록 |
| `src/ai/LlmService.ts` | 타임아웃/연결 오류 시 `OfflineFallbackService` 호출 |
| `package.json` | 설정키, 커맨드, 컨텍스트 메뉴, SddPanel ViewsContainer 추가 |

---

## 진입점 4개

### A. `/spec` 슬래시 커맨드 (채팅창)

```typescript
// ChatViewProvider._handleMessage() 분기
if (msg.text.startsWith('/spec ')) {
  await this._handleSpecCommand(msg.text.slice(6).trim());
  return;
}
```

흐름: `ContextCollector.collect(intent)` → `SpecGenerator.generate()` 스트리밍 → `SpecFileWriter.parseDraft()` → 컴플라이언스 필드 검증 → 저장 확인 → `.axiom/` 저장 + 에디터 열기

서브커맨드:
- `/spec <intent>` — 새 스펙 생성
- `/spec update <intent>` — 현재 열린 spec.md AI 보조 수정
- `/spec review` — status를 review로 전환
- `/spec approve` — status를 approved로 전환 (reviewer 필드 필수)

**예시:**
- `TransferConfirmPage.tsx` 열고 `/spec 이체 한도 초과 예외처리 추가`
- → transfer 도메인 스펙 + scaffold useApi 패턴 반영한 스펙 생성

### B. 커맨드 팔레트 (`axiom-ai.generateSpec`)

```typescript
vscode.commands.registerCommand('axiom-ai.generateSpec', async () => {
  const intent = await vscode.window.showInputBox({
    prompt: '생성할 스펙을 입력하세요',
    placeHolder: '예: 이체 확인 화면, 소셜 로그인 추가',
  });
  if (intent) chatProvider?.runSpecCommand(intent);
});
```

### C. 탐색기 컨텍스트 메뉴 (`axiom-ai.generateSpecForFolder`)

폴더 선택 → `src/domains/{domain}/` 감지 → 해당 도메인 스펙 생성 진입.

```json
"explorer/context": [{
  "command": "axiom-ai.generateSpecForFolder",
  "when": "explorerResourceIsFolder",
  "group": "axiomAi"
}]
```

### D. `/scaffold` 슬래시 커맨드 — 스펙 → 코드 반영

```typescript
// ChatViewProvider._handleMessage() 분기
if (msg.text.startsWith('/scaffold')) {
  await this._handleScaffoldCommand();
  return;
}
```

흐름: 현재 열린 spec.md 파싱 → `status === 'approved'` 확인 → `SpecScaffolder.generate(spec)` → `src/domains/{domain}/pages/{Screen}.tsx` 초안 생성 → 에디터에 열기(저장 전 사용자 확인) → 저장 후 `.axiom-index.json` status → `implemented` 업데이트

**예시:**
- `.axiom/screens/transfer/TransferConfirmPage/spec.md` 열고 `/scaffold`
- → `src/domains/transfer/pages/TransferConfirmPage.tsx` 스텁 생성
- → useApi, ApiError 처리, Props interface 포함

`axiom-ai.scaffoldFromSpec` 커맨드 팔레트로도 진입 가능.

---

## 읽기 흐름 (기존 채팅 RAG 통합)

일반 채팅에서도 `.axiom/` 스펙을 도메인 필터로 주입:

```typescript
// ChatViewProvider._handleMessage() — ScaffoldContextBuilder 초기화 직전
const axiomDir = ExtensionConfig.getSddAxiomFolder();
if (axiomDir) {
  const domain = new DomainRouter(axiomDir).detectDomain(currentFilePath ?? '');
  const sddCorpora = await new SddCorpusLoader(axiomDir).loadForDomain(domain);
  externalCorpora.unshift(...sddCorpora);
}
```

---

## SpecGenerator 시스템 프롬프트 (scaffold 컨벤션 명시)

```
당신은 react-app-scaffold 기반 프로젝트의 SDD 스펙 작성자입니다.

규칙:
- API 호출은 반드시 useApi(@axiom/hooks) 훅만 사용
- UI 컴포넌트는 @axiom/components/ui 에서 import
- 라우팅은 createHashRouter 기반, 도메인 라우터에 loadable() 적용
- 현재 열린 파일의 타입/구조와 일관성 유지
- 미결정 사항은 "## 미결정 사항" 섹션에 명시
- frontmatter 필수: title, category, domain, screen, owner, status, tags
- 금융 화면: compliance-tags, reviewer 필드 필수
```

---

## 거버넌스

| 계층 | 수정 권한 | 내용 |
|---|---|---|
| `global/` | 리드 개발자 | `@axiom/components/ui` 공용 스펙, API 규칙 |
| `domain/` | 도메인 담당자 | 도메인 비즈니스 규칙, 도메인별 useApi 패턴 |
| `screens/` | 담당 개발자 | 화면별 스펙, 자유 작성 |

### 스펙 라이프사이클

```
draft → (리드 검토 요청: /spec review) → review
      → (리드 승인: /spec approve) → approved
      → (/scaffold 실행 후 저장) → implemented
```

**상태 전이 제약:**
- `approved` 전환: frontmatter의 `reviewer` 필드 필수
- `approved → /scaffold` 실행: status가 `approved`인 경우에만 허용

**Staleness 경고:** `AxiomIndexTracker`가 `linkedSourcePath` 소스 파일의 `mtime`과 `last-approved` 비교.
소스 변경 후 30일 이상 스펙 미갱신 → status bar `⚠️ N개 스펙 만료` + 해당 파일 열 때 인라인 경고.
`implemented` 상태 후 소스 변경 → 자동으로 `stale` 표시 + re-review 권고.

### 금융 컴플라이언스 필드 검증

`axiom-ai.sdd.requireComplianceTags: true` 설정 시:
- `compliance-tags` 없는 spec 저장 차단 + 경고 표시
- `reviewer` 필드 없으면 `approved` 상태 전이 차단
- 필드 검증 실패 시 에디터 인라인 진단(Diagnostic) 표시

### Audit Log (`.axiom/.audit-log.ndjson`)

```jsonl
{"ts":"2026-05-01T10:00:00Z","spec":"screens/transfer/TransferConfirmPage/spec.md","from":"draft","to":"review","by":"hong-gildong"}
{"ts":"2026-05-02T09:00:00Z","spec":"screens/transfer/TransferConfirmPage/spec.md","from":"review","to":"approved","by":"team-lead"}
{"ts":"2026-05-03T11:00:00Z","spec":"screens/transfer/TransferConfirmPage/spec.md","from":"approved","to":"implemented","by":"hong-gildong"}
```

---

## 재사용할 기존 코드

| 재사용 대상 | 위치 | 목적 |
|---|---|---|
| `ExternalCorpusLoader.load()` | `src/ai/ExternalCorpusLoader.ts` | SddCorpusLoader tier별 로드 |
| `HybridRagEngine.buildContext()` | `src/ai/HybridRagEngine.ts` | collectRagGlobal 4순위 |
| `LlmService.streamChat()` | `src/ai/LlmService.ts` | SpecGenerator 스트리밍 |
| `EditorContextCollector` | `src/ai/EditorContextCollector.ts` | collectActiveFile 패턴 참고 |
| `_registerExternalCorpusWatcher()` | `src/providers/ChatViewProvider.ts:126` | `.axiom/` watcher 동일 패턴 |
| frontmatter 파싱 정규식 | `src/ai/ExternalCorpusLoader.ts` | collectCorpus frontmatter 파싱 |

---

## 구현 순서

| Step | 작업 | 파일 |
|---|---|---|
| 0 | **[선행]** `.rag/` + `corpus/` → `knowledge/` 폴더 통합 이전 | 파일 이동 + `.gitignore` 정리 |
| 0-1 | HybridRagEngine·ExternalCorpusLoader 경로 → `knowledge/`로 교체 | `src/ai/HybridRagEngine.ts`, `src/ai/ExternalCorpusLoader.ts` |
| 0-2 | ExtensionConfig `getKnowledgeFolder()` 추가, 구 메서드 제거 | `src/config/ExtensionConfig.ts` |
| 1 | DomainRouter (`src/domains/{domain}/` 감지) | `src/spec/DomainRouter.ts` |
| 2 | SddCorpusLoader → `collectKnowledge()` 단일 메서드로 구현 | `src/spec/SddCorpusLoader.ts` |
| 3 | ExtensionConfig + ChatViewProvider 읽기 통합 | 기존 파일 수정 |
| 4 | ContextCollector (3계층 + 토큰 예산, knowledge 통합) | `src/spec/ContextCollector.ts` |
| 5 | SpecGenerator (scaffold 시스템 프롬프트 + 스트리밍) | `src/spec/SpecGenerator.ts` |
| 6 | SpecFileWriter (`.axiom/screens/` 저장 + 컴플라이언스 검증) | `src/spec/SpecFileWriter.ts` |
| 7 | `/spec` 슬래시 커맨드 + 서브커맨드 | `ChatViewProvider.ts` 수정 |
| 8 | 커맨드 팔레트 + 컨텍스트 메뉴 | `commands/index.ts` + `package.json` |
| 9 | AxiomIndexTracker (staleness·status·audit log) | `src/spec/AxiomIndexTracker.ts` |
| 10 | OfflineFallbackService (폐쇄망 fallback) | `src/ai/OfflineFallbackService.ts` |
| 11 | LlmService 폐쇄망 엔드포인트 + fallback 연결 | `src/ai/LlmService.ts` 수정 |
| 12 | SddPanelProvider (트리뷰 + 상태 배지 + 컨텍스트 메뉴) | `src/views/SddPanelProvider.ts` |
| 13 | SpecScaffolder (`/scaffold` 커맨드, spec → TSX 스텁) | `src/spec/SpecScaffolder.ts` |
| 14 | package.json SddPanel ViewsContainer 등록 | `package.json` |

---

## 검증 방법

0. **[knowledge 통합]** `.rag/`, `corpus/` 폴더 삭제 후 `knowledge/`만 존재하는지 확인
   → 기존 RAG 채팅 응답 품질 동일한지 비교 검증
1. 대상 scaffold 프로젝트에서 `axiom-ai.sdd.axiomFolder` = `.axiom` 설정
2. `src/domains/transfer/pages/TransferConfirmPage.tsx` 열고 일반 채팅
   → transfer 도메인 스펙만 컨텍스트에 올라오는지 확인 (auth, loan 무관)
3. `/spec 이체 한도 초과 예외처리 추가` 입력
   → useApi mutation 패턴 + ApiError 처리가 포함된 스펙 초안 생성 확인
   → `.axiom/screens/transfer/TransferConfirmPage/spec.md` 저장 확인
4. `src/domains/auth/LoginPage.tsx` 열고 `/spec 소셜 로그인`
   → auth 도메인 스펙만 로드, transfer 스펙 미포함 확인
5. `axiom-ai.sdd.axiomFolder` 미설정 → 기존 RAG 동작 그대로 (SDD 완전 스킵)
6. 소스 파일 `mtime` 조작(31일 경과 시뮬레이션) → status bar 경고 확인
7. **[폐쇄망]** `axiom-ai.server.endpoint` 오프라인 URL 설정 → `/spec 이체확인화면`
   → AI 응답 없음 → `OfflineFallbackService` 빈 TSX 스텁 반환 확인
8. **[SDD 패널]** 사이드바 SDD 패널에 `.axiom/` 트리 표시, 상태 배지(✏️/👀/✅/⚠️) 정확한지 확인
9. **[Spec-to-Code]** `TransferConfirmPage/spec.md` (status: approved) 열고 `/scaffold`
   → `src/domains/transfer/pages/TransferConfirmPage.tsx` 스텁 생성
   → useApi, ApiError 처리, Props interface 포함 확인
   → `.axiom-index.json` status → `implemented` 업데이트 확인
10. **[컴플라이언스]** `compliance-tags` 없는 spec 저장 시도 → 저장 차단 + 인라인 진단 확인
11. **[라이프사이클]** `reviewer` 없이 `/spec approve` → 차단 경고 확인
    → `reviewer` 추가 후 승인 → `.audit-log.ndjson` 기록 확인
