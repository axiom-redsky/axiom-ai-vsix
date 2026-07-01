# Phase B — 실 sLLM 라이브 검증 체크리스트 (폐쇄망 1회로 두 트랙 동시)

> 작성일: 2026-07-01 · 목적: **편집 파이프라인 재설계**와 **compose-binding(API→테이블 조립)** 두 트랙이
> 모두 "폐쇄망 qwen3-coder 라이브 검증"에서 막혀 있다. 폐쇄망 접근은 드문 이벤트이므로 **한 번 들어갔을 때
> 둘 다** 검증하도록 이 한 장으로 묶었다. 결과 표를 채워 오면 다음 오프라인 작업(편집=Stage 2 locate 축소,
> compose=필드매핑 프롬프트 튜닝)의 입력이 된다.
>
> 관련 문서: `AXIOM_EDIT_REDESIGN_HANDOFF.md`(§5 원본), 메모리 `project_compose_binding_recipe`.

---

## 0. 사전 준비 (공통)

- [ ] `axiom-ai` **출력 채널** 열기 (모든 판정은 여기 배너로 한다)
- [ ] 편집 대상 파일을 **에디터에 열어둔 채** 요청 (baseline 진단·현재파일 감지용)
- [ ] 모델 = **qwen3-coder** (provider=ollama 권장, thinking 억제)
- [ ] LLM 서버 살아있는지 확인 (502면 vast LiteLLM 포트 4000 수동기동 죽었나부터 — `vastai_ollama_litellm_setup.md`)
- [ ] 플래그 확인: 편집 파이프라인 5종은 **기본 ON**. compose-binding은 **기본 OFF → 켜야 함**(트랙 2).
- [ ] `git status` 깨끗이 (검증 중 `__axiom_verify_*` 임시파일 누수 확인용)

---

## 트랙 1 — 편집 파이프라인 (플래그 이미 ON, 코드변경 불필요)

핵심 측정 대상: anchorFirst / patchFirst / **grounded 재시도(region·lines)** 가 실모델에서 실제로 통하는가.
프롬프트 효과는 **오프라인 eval로 측정 불가**(녹화 재생은 옛 포맷) → 라이브로만.

| # | 요청(프롬프트) | 기대 배너/동작 | 결과 | 비고 |
|---|---|---|---|---|
| 1a | "PageHeader **위에** 버튼 만들고…" | `cross-file 억제(landmark…)` + **현재 파일** 편집 (PageHeader.tsx로 안 샘) | ⬜ | 버그① 재발? |
| 1b | "직원 등록 버튼 텍스트 바꿔줘" | 필터바 삭제 시 `region-content-loss` 거부(조용한 삭제 없음) | ⬜ | 버그② 재발? |
| 2 | API 연동 편집 | 배너 `✅ 타입검증 통과` 또는 `⚠️ 타입에러 N건`/`1→0 교정` | ⬜ | 멀쩡한 편집에 ⚠️ 노이즈=false positive |
| 3 ★ | "버튼 텍스트 바꿔줘" | `replace 적용(앵커 …)` = 성공 / `JSX 영역 splice` = 모델이 지침 안 따름 | ⬜ | anchorFirst 실효 핵심 |
| 3' | (3에서) `[모호: N곳]` 폴백 잦은가 | 잦으면 "더 길게 인용" 프롬프트 강조 필요 | ⬜ | |
| 4 | "데이터 바인딩 수정" (lines 경로) | `🔁 매칭 실패…실제 코드로 patch 다시` 뜨고 **전체 재생성 안 감** | ⬜ | 버그③ |
| 5 ★ | 큰 영역 편집(예: 큰 필터바) → 일부 누락 유발 | `🔁 grounded(region) 재시도 … 실제 영역(라인 N~M)만 surgical patch (full 회피)` | ⬜ | 증분2 핵심 측정 |
| 5' | (5 후) patch가 매칭 성공해 적용? | ✅ 적용 = full 환각 회피 성공 / `patchFailed` 카드 = 모델이 `<search>`를 못 베낌 | ⬜ | 카드 빈도 기록 |

**사유별 회복표(증분2 튜닝 입력):** region 실패 사유 → grounded 회복 / 카드 / 실패 중 무엇으로 갔는지 기록.

| 실패 사유 | grounded 회복 | 카드(patchFailed) | 그냥 실패 |
|---|---|---|---|
| region-content-loss | ⬜ | ⬜ | ⬜ |
| replace-anchor-missing | ⬜ | ⬜ | ⬜ |
| empty-output | ⬜ | ⬜ | ⬜ |
| root-tag-mismatch | ⬜ | ⬜ | ⬜ |

---

## 트랙 2 — compose-binding (봉투 계약 A1·A2 반영본 검증)

**활성화:** 런처 설정 패널 → "조립 바인딩(API→테이블) — experimental.composeBinding" 체크+저장,
또는 VS Code 설정 `axiom-ai.experimental.composeBinding: true`. **창 리로드 필수.**

### 2-1. 기존 `{ data: [...] }` 봉투 (회귀 확인)

- [ ] 요청: `직원 테이블에 api 적용 @plan/api-spec.md /api/employees` (테이블 파일 연 채)
- [ ] 출력채널: `🧩 조립 바인딩 … 매핑=name→name,status→employment_status,dept→department,grade→position 미매핑=project,rate`
- [ ] 확인 카드가 **surgical**인가: `type` + `const { data } = useApi<{ data: TEmployee[] }>(…)` + `const employees = data?.data ?? []` + 로딩/에러 가드 + 셀 rename(project/rate는 ⚠️ 알림)
- [ ] 필드매핑 작은콜이 약어 **dept→department, grade→position**을 맞추는가 (약한모델 실측 — 틀리면 `buildFieldMappingPrompt` 튜닝)
- [ ] Stage 0 verify가 잔여 타입에러(미매핑 emp.project/rate) 잡는가

### 2-2. ★ A1·A2 신규 — 다른 봉투 사이트 (이번 세션 핵심 산출물 검증)

봉투가 `data`가 아닌 스펙으로 테스트. **api-spec의 Response를 `{ "result": [...] }` 또는 `{ "list": [...] }`로 바꾼 사본**을 첨부해 요청.

- [ ] `result` 봉투: 카드가 `useApi<{ result: TEmployee[] }>` + `const employees = data?.result ?? []` 생성하는가
- [ ] `list` 봉투: 동일하게 `data?.list ?? []`
- [ ] **bare 배열** 스펙(`[ {...} ]`): `useApi<TEmployee[]>` + `data ?? []` (봉투 없이)
- [ ] 단건 행에 배열필드 있는 스펙(`{ id, name, skills:[…] }` 행): skills를 봉투로 **오인 안 하고** 정상 행 타입 생성

### 2-3. ★ A1 신규 — 모델 경로(비 compose)도 봉투 계약 따르는가

compose **끄고**(기본 경로), 봉투 있는 API를 region/structural로 연동 요청:
- [ ] `직원 목록 api로 불러와줘` → 모델이 `data?.data`(봉투 인지)를 쓰는가, 아니면 여전히 `data.map`(unwrapped 오판)인가
- [ ] unwrapped로 나오면 → use-api.md 봉투 섹션이 RAG에 실제 주입되는지 확인(`_index.md` 키워드 매칭), 안 되면 문구/키워드 보강

---

## 3. 가져올 것 (다음 오프라인 작업 입력)

1. 위 두 트랙 표(배너/이상동작) — 특히 **★ 표시 항목**.
2. 트랙1 사유별 회복표 → **편집 Stage 2**(locate 850줄 축소) 임계값·삭제 대상 결정.
3. 트랙2 필드매핑 정확도 + 봉투 케이스 결과 → **compose** `buildFieldMappingPrompt` 튜닝 / 봉투 감지 엣지 보완.
4. `patchFailed` 카드 빈도 → grounded 프롬프트 "그대로 복사" 강조 여부.

> 원칙(핸드오프 §8): 프롬프트 효과는 실모델로만 · 경로 하드차단 금지 · 앵커 실패→재인용(전체재생성 금지) ·
> 검증 루프 fail-open · 새 기능은 플래그 뒤 + 회귀 0.

---

## 부록 — 트랙 2-2 테스트용 스펙 변형본 (바로 저장·첨부)

손으로 고치지 말고, 아래를 각각 **scaffold 워크스페이스**(`…\react-app-scaffold\plan\`)에 파일로 저장한 뒤
요청에서 `@plan/파일명`으로 첨부하면 된다. (행 필드는 기존 `/api/employees`와 동일 — **봉투만** 다름.)

### `plan/api-spec-result.md` — `result` 봉투 사이트
```md
### GET `/api/employees`
직원 목록 조회.

**Response**
```json
{
  "code": 0,
  "message": "ok",
  "result": [
    { "id": 1, "name": "김민준", "email": "minjun.kim@peoplify.com", "department": "개발팀",
      "position": "선임 개발자", "hire_date": "2021-03-02", "employment_status": "active" }
  ],
  "totalCount": 18
}
```
```
→ 기대: `useApi<{ result: TEmployee[] }>('/api/employees')` + `const employees = data?.result ?? [];`

### `plan/api-spec-list.md` — `list` 봉투 사이트
```md
### GET `/api/employees`
**Response**
```json
{
  "success": true,
  "list": [
    { "id": 1, "name": "김민준", "department": "개발팀", "position": "선임 개발자", "employment_status": "active" }
  ],
  "page": 1, "size": 20
}
```
```
→ 기대: `useApi<{ list: TEmployee[] }>` + `data?.list ?? []`

### `plan/api-spec-bare.md` — 봉투 없는 bare 배열
```md
### GET `/api/employees`
**Response**
```json
[
  { "id": 1, "name": "김민준", "department": "개발팀", "position": "선임 개발자", "employment_status": "active" }
]
```
```
→ 기대: `useApi<TEmployee[]>` + `data ?? []` (봉투 벗김 없음)

### `plan/api-spec-skills.md` — 행이 배열필드를 가진 오탐 가드
```md
### GET `/api/employees`
**Response**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "김민준", "department": "개발팀", "skills": ["Java", "Spring", "AWS"] }
  ]
}
```
```
→ 기대: 봉투는 `data`로 정상 감지, **행 타입에 `skills: string[]` 포함**(skills를 봉투로 오인하지 않음).

> 판정 포인트: 카드의 `useApi<…>` 제네릭과 `data?.<key> ?? []`가 위 "기대"와 일치하면 A2 봉투 일반화가
> 실경로에서 작동. 어긋나면 스펙 파싱 로그(`🧩 조립 바인딩 …`)와 함께 기록 → `detectEnvelopeKey` 엣지 보완.
