# SDD 워크플로우 진입 장벽 해소 — 고도화 방향 검토
* 쉽게 스펙만들고 React 페이지 component까지 생성하는 것을 하기 위한 플랜.

## 배경: 고민의 출발점

프론트엔드 개발자가 자기가 맡은 업무 영역에 처음 화면을 만들 때의 두 가지 접근 방식 비교.

**기존 방식 (익숙한 방식)**
```
퍼블 소스 가져오기
  → src/domains/{domain}/pages/ 아래 페이지 파일 생성
  → 퍼블 소스 붙이기
  → 나머지 코드 작성
```

**SDD 방식 (현재 가이드 방향)**
```
스펙 파일 생성 (/spec)
  → 스펙 편집
  → 리뷰 요청 (/spec review)
  → 승인 (/spec approve)
  → 코드 반영 (/scaffold)
```

**핵심 문제**: 화면이 눈에 보이기까지 단계가 너무 많고, 개발자 입장에서 "markdown 스펙을 먼저 써야 한다"는 인지 부하가 생긴다. **접근이 쉬워야 하고, 스펙 만들고 화면 만들고... 하는 과정이 쉽게 느껴져야 한다.**

---

## 진단: 진입 장벽의 원인

현재 흐름은 **"스펙 먼저"가 강제**된다.

```
intent 입력 → spec.md 생성 → 리뷰 → 승인 → /scaffold → 코드
```

- 코드가 눈에 보이기까지 너무 많은 단계
- 개발자가 의도(intent)를 직접 서술해야 함 — 뭘 써야 할지 막막할 수 있음
- 기존 습관(퍼블 소스 먼저 가져오기)과 흐름이 충돌

---

## 해소 방향 3가지

### 방향 1 — "새 화면 추가" 원스텝 커맨드 ★ 추천

SDD 패널의 기존 역할이 "스펙 조회"인데, **"새 화면 추가" 버튼을 메인 진입점**으로 격상.

```
[SDD 패널 "Add Screen" 버튼] → 화면 이름만 입력
  → spec.md 자동 생성 (draft 상태)
  → 코드 스텁 즉시 생성 (에디터 열림)
  → 개발자는 코드를 바로 보며 작업 시작
```

**핵심 가치**: 개발자가 "스펙을 만들었다"는 걸 인식 못해도 된다. 백그라운드에서 spec이 draft로 저장되고, 리뷰/승인은 자연스럽게 따라간다.

| 연결 파일 | 작업 내용 |
|---|---|
| `src/views/SddPanelProvider.ts` | "Add Screen" 버튼 추가 |
| `src/spec/SpecScaffolder.ts` | draft 상태에서도 스텁 생성 허용 (approved 강제 완화) |
| `src/commands/index.ts` | `axiom-ai.addScreen` 원스텝 커맨드 등록 |

---

### 방향 2 — 역방향: 퍼블 소스 → 스펙 자동 추출

기존 습관(퍼블 소스 먼저 가져옴)을 **막지 않고 수용**하는 방향.

```
퍼블 TSX/HTML 파일 열기
  → 탐색기 우클릭 "axiom: 이 파일로 스펙 생성"
  → ContextCollector가 파일 내용 분석
  → spec.md 역생성 (코드 → 스펙)
```

현재 `/spec <intent>` 는 "의도 → 스펙" 방향인데, "파일 → 스펙" 역방향을 추가.

| 재활용 가능한 기존 코드 | 위치 |
|---|---|
| `ExternalCorpusLoader.load()` | `src/ai/ExternalCorpusLoader.ts` |
| `ContextCollector.collectActiveFile()` | `src/spec/ContextCollector.ts` |

---

### 방향 3 — 스펙 생성 대화형 가이드

지금 `/spec <intent>` 는 개발자가 의도를 직접 써야 한다. AI가 먼저 질문하는 방식으로 전환.

```
/spec 실행 (intent 없이)
  → AI: "어떤 도메인의 화면인가요? 현재 열린 파일 기준으로는 'transfer'로 보입니다."
  → 개발자: "맞아, 이체 확인 화면"
  → AI: "주요 API는 무엇인가요?"
  → → spec 완성
```

**구현 비용 주의**: `src/providers/ChatViewProvider.ts`의 대화 흐름 변경이 많아 방향 1·2보다 작업량이 크다.

---

## 선행 조건: 디자인 시스템 + 퍼블 코드 구조

### 현재 knowledge/ 폴더 상태

**있는 것** — 컴포넌트 API, 코딩 패턴, scaffold 구조
```
knowledge/components/     → Button, Dialog, Form, Input, Select, Table (shadcn 사용법)
knowledge/patterns/       → useApi, router, page-generation (코드 패턴)
knowledge/scaffold-docs/  → 아키텍처, API 클라이언트 문서
```

**없는 것** — 퍼블 소스를 컴포넌트로 변환하는 데 필요한 것들
```
knowledge/publish/          ← 퍼블리셔가 쓰는 HTML 구조 패턴
knowledge/design-system/    ← 화면 레이아웃 표준, 디자인 토큰
knowledge/page-templates/   ← 목록화면 / 상세화면 / 폼화면 표준 구조
```

### 왜 선행이 필요한가

퍼블 소스를 받아서 스펙/코드로 변환하려면 AI가 다음을 알아야 한다.

1. **퍼블 HTML → 컴포넌트 매핑 규칙**: `<button class="btn-primary">` → `<Button variant="default">`
2. **레이아웃 패턴**: 목록+버튼 배치가 어떤 구조인지
3. **퍼블리셔 컨벤션**: 클래스 이름, 마크업 구조 규칙

이게 없으면 스펙을 생성해도 퍼블 소스와 어긋난 결과가 나온다.

---

## 추천 작업 순서

```
1단계 — 디자인 시스템 문서화       knowledge/design-system/
  - 전체 컴포넌트 목록 + variants
  - 레이아웃 컴포넌트 (Card, Container, Stack 등)
  - 디자인 토큰 (색상, 간격, 타이포그래피)

2단계 — 퍼블 코드 컨벤션 문서화    knowledge/publish/
  - 퍼블리셔 HTML 마크업 패턴
  - CSS 클래스 → shadcn 컴포넌트 매핑 규칙

3단계 — 화면 템플릿 표준화          knowledge/page-templates/
  - 목록 화면 / 상세 화면 / 폼 화면 기본 구조
  - 화면당 퍼블 구조 예시 + React 변환 예시 한 쌍

4단계 — SDD 워크플로우 고도화
  - 방향 1: "새 화면 추가" 원스텝 커맨드 (SddPanelProvider)
  - 방향 2: 퍼블 소스 → 스펙 역방향 변환
  - 방향 3: 대화형 스펙 생성 가이드
```

**중요**: 1~3단계는 확장 코드를 건드릴 필요 없이 `knowledge/` 폴더에 문서 추가만 하면 된다. 이 선행 작업이 갖춰지면 방향 1~3 모두 품질이 같이 올라간다.

---

## 요약

| 항목 | 내용 |
|---|---|
| **핵심 문제** | "스펙 먼저" 강제로 인한 진입 장벽 — 코드가 보이기까지 단계 과다 |
| **즉효성 높은 해소** | 방향 1: SDD 패널에 "새 화면 추가" 원스텝 진입점 |
| **기존 습관 수용** | 방향 2: 퍼블 소스 → 스펙 역방향 추출 |
| **선행 조건** | 디자인 시스템 + 퍼블 코드 컨벤션 knowledge/ 문서화 |
| **작업 순서** | knowledge 선행 작업 완료 → 방향 1 → 방향 2 → 방향 3 |
