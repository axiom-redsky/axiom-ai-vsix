# 멀티-작업 분해 & 순차 실행 (Multi-Task Decomposition Mode)

> 설계 문서 · Axiom AI VSCode Extension
> 상태: 제안(설계 확정, 미구현) · 작성 계기는 아래 Context 참조

---

## 1. Context — 왜 만드나

약한 sLLM(qwen3-coder-64k)에 **복잡한 한 프롬프트로 여러 편집을 한 번에** 시키면 실패가 누적된다. 실제 사례("현재 화면의 select(부서·재직상태·투입상태)를 변경하면 직원 리스트 테이블에 반영되어 필터링 되게 구현해줘")를 디버깅하며 다음을 순차적으로 관측·해결했다:

| # | 실패 | 처방(완료) |
|---|---|---|
| 1 | **멈춤(무음 정지)** — 재시도 게이트(`.includes('<axiom-action>')`)와 파서(쌍 매칭 regex) 불일치 | 게이트를 쌍 매칭으로 일치 + 닫는태그 복구 |
| 2 | **블록 누락** — 모델이 설명만 쓰고 종료 | compact 모드(블록 먼저·출력모드 축소) |
| 3 | **컴파일 깨짐** — 기존 const를 state로 바꾸며 중복 선언 | `findDuplicateDeclarations` 적용 전 가드 |
| 4 | **의미 오류** — 서버 params 대신 클라이언트 파괴적 필터·행별 Select 창작 | "서버 params 우선" 조건부 지침 |
| 5 | **남은 한계** | ↓ 본 문서 |

5번이 핵심이다. "select 변경 → 테이블 필터링"은 **교차 편집(cross-cutting)** 이다 — `useApi`의 `params` 객체 + 여러 select 핸들러가 **한 군데가 아닌 여러 지점**에 흩어져 있다. 그래서:

- **region edit**(연속 단일 구역 전제)로는 표현이 안 되고,
- **full**로 보내면 약한 모델이 다시 과부하(1·2번 재발).

### 처방의 방향
복잡한 요청을 **작은 단일-책임 작업들로 쪼개**, 각 작업을 **깨끗한(히스토리 없는) 새 컨텍스트**로 순차 실행한다.
- 작업이 작아지면 → 약한 모델이 안정적으로 성공.
- 작업마다 **갱신된 현재 파일을 진실의 원천**으로 다시 읽음 → 같은 줄을 여러 작업이 건드려도 **겹침/드리프트 없음**(이전 작업 결과 위에서 다음 작업이 동작).
- **사용자 확인 게이트** → 통제권 + 체크포인트.

### 두 가지 불변식(설계 근거)
1. **누적 차단**: task마다 chat 히스토리를 비워 `[system, user]` 단 둘만 전송 → 컨텍스트가 쌓이지 않음 → 윈도우 잠식으로 인한 **빈값/잘림(누적 원인) 차단**. (참고: region edit 경로가 이미 히스토리 없이 `[system,user]`만 보냄.)
2. **출력도 작게**: task가 작으니 출력도 작음 → 잘림의 **출력측 원인**까지 완화. (히스토리 삭제는 입력측만 막으므로, 작은 task로 출력측도 같이 막아야 완전.)

> **이 기능은 위 5개 레버를 대체하지 않는다.** 각 작업은 결국 시나리오 C/region 파이프라인을 타므로 compact·중복가드·params지침의 보호를 그대로 받는다. 분해 모드는 그 위에 얹히는 **오케스트레이션 층**이다.

---

## 2. 경계 — 이 모드는 어디에 쓰는가

| 요청 유형 | 맞는 도구 |
|---|---|
| **여러 독립/순차 기능** ("로그인 추가하고 대시보드도 만들어줘") | **이 분해 모드** |
| 작은 단일 교차편집 (이번 필터) | region 로케이터 재조준(Option C) 또는 단일 focused 편집 |

이번 필터 같은 작은 교차편집은 분해가 **과하다**(10줄 고치려 N번 호출·N번 confirm). 분해는 "진짜 멀티-기능"용이고, 작은 교차편집은 별도(로케이터 재조준)로 푼다. 둘은 경쟁이 아니라 **역할 분담**.

---

## 3. Goal / Non-Goal

**Goal**
1. 명백한 멀티-작업 요청을 모델로 **작업 리스트만** 받아 분해
2. 사용자가 **계획을 리뷰·승인**(과분해 차단 지점)
3. 작업을 **하나씩 새 컨텍스트로 실행 → diff → 적용**
4. **갱신된 파일을 다음 작업 입력**으로
5. 작업마다 **진행 confirm**, 전부 끝나면 완료

**Non-Goal**
- 단일 작업 요청의 기존 경로 변경
- region 로케이터 재조준(Option C — 별도 과제)
- 자동 무인 실행 (항상 사용자 confirm 경유)

---

## 4. 확정된 설계 결정
- **발동**: 자동감지(`_looksMultiTask`) + **계획 리뷰 confirm**. 과분해는 리뷰에서 사용자가 차단. (명시적 옵트인 아님)
- **task 입력(Phase B)**: 각 task에 **현재 전체 파일** 전송(간단·견고, 히스토리 비움으로 누적 0). 하이브리드 슬라이스는 **Phase C**로 미룸.

---

## 5. 상태기계

```
idle
 └─(sendMessage + 멀티작업 감지)→ planning      … 모델에 "작업 리스트만" 요청(1회)
      └─→ plan-review                            … 분해된 N개 작업을 chat에 표시, 승인/취소
           └─(승인)→ executing(task i)           … 새 컨텍스트로 task i 실행(기존 파이프라인 재사용)
                └─→ task-diff-confirm             … diff 표시 → 승인 시 적용
                     └─→ task-proceed-confirm     … "다음 작업 ▶ / 중단"
                          └─(다음)→ executing(task i+1)   (현재 파일 다시 읽어 입력)
                          └─(중단)→ idle (체크포인트: 여기까지 적용분 유지)
           └─(전부 완료)→ done
```

---

## 6. 구현 포인트 (기존 인프라 재사용)

### 6.1 진입·라우팅 — `src/providers/ChatViewProvider.ts`
- `_handleMessage(text, selection)` 진입부에 **분해 분기** 추가: `_looksMultiTask(text)` + 설정 플래그 on → `_startTaskPlan(text)` 후 return. 아니면 기존 경로.
- 세션 상태 필드: `private _taskPlan?: { tasks: string[]; index: number; originalQuery: string }`.

### 6.2 결정론 트리거 게이트 — 신규 `_looksMultiTask(query): boolean`
- "명백한 멀티-작업" 신호만: 번호목록(`1. … 2. …`)·줄바꿈 복수 명령문·복수 독립 명령형 동사(`구현하고`·`추가하고`·`그리고`). 모호하면 false.
- 단일 명사 나열("부서, 재직상태, 투입상태")은 멀티로 보지 않음.

### 6.3 분해 플래너 — 신규 `_decomposeTasks(query): Promise<string[]>`
- 모델 1회 호출. **코드가 아니라 번호목록(자연어)만** 출력하는 제약 프롬프트(약한 모델도 잘함). 예시 1쌍 포함.
- 출력 파서: 번호/불릿 라인 → `string[]`. 0~1개면 단일 경로 폴백.
- region 경로처럼 **히스토리 없는 `[system,user]`** 단발 호출(`runHybridRegionEdit`의 callModel 패턴 참고).

### 6.4 계획 리뷰 confirm — webview 프로토콜 확장
- host→webview: `planProposed { tasks: string[] }`
- webview→host: `planApprove` / `planReject` (기존 `onDidReceiveMessage` switch에 case 추가)
- **과분해 1차 방어선** — 사용자가 여기서 교정/취소.

### 6.5 순차 실행기 — 신규 `_runNextTask()`
- `_taskPlan.index`의 작업 문자열을 가져와, **현재 파일을 디스크에서 다시 읽어**(`_tryRegionEdit`의 `fs.readFileSync` ground-truth 패턴 재사용) 입력 구성.
- **기존 파이프라인으로 위임**: region edit on → `_tryRegionEdit`; 아니면 시나리오 C(full/lines/patch). 즉 task 한 개 = 지금의 단일 편집 요청 한 번. 5개 레버 자동 적용.
- diff/적용은 기존 `_requestFileConfirmation` + `applyUpdate` 재사용.
- 적용 성공 후 host→webview `taskProgress { index, total }` + 진행 confirm.

### 6.6 진행 confirm — webview 프로토콜 확장
- host→webview: `taskProceedRequest { nextIndex, total }`
- webview→host: `taskProceedNext`(→ `index++` 후 `_runNextTask()`) / `taskProceedStop`(→ `_taskPlan=undefined`, 체크포인트 유지)
- 구현은 기존 `_pendingConfirmations` Map 패턴 재사용 또는 동형의 단발 Promise.

### 6.7 설정 플래그
- `axiom-ai.experimental.taskDecomposition`(기본 **off**, 실험 — `experimental.regionEdit` 패턴 미러)
- `src/ai/config.ts`(`AI_DEFAULTS`) + `src/config/ExtensionConfig.ts`(`isTaskDecompositionEnabled()`) + `package.json` 기여.

---

## 7. 단계적 구현(phasing)

- **Phase A — 분해+리뷰만(실행 변경 없음)**: 트리거 게이트 + 플래너 + `planProposed`/승인 UI. 승인 시 첫 작업만 기존 경로로 실행. **분해 품질 먼저 검증**.
- **Phase B — 순차 실행기**: `_runNextTask` + 파일 재읽기 + 진행 confirm + 체크포인트. 각 task **현재 전체 파일** 입력.
- **Phase C — task별 하이브리드 슬라이스**: 각 task 입력을 전체파일 대신 편집 구역으로 축소(큰 파일 토큰 절감). region edit 인프라 재사용. (보류했던 입력 슬라이싱 레버 영역)

---

## 8. 기존 5레버와의 관계

| 레버 | 역할 | 분해 모드와의 관계 |
|---|---|---|
| 게이트/파서 일치, 블록0 안내 | 무음 정지 차단 | 각 task 실행에 그대로 적용 |
| compact modes | 블록 누락 완화 | task 프롬프트에 적용 |
| 중복선언 가드 | 컴파일 깨짐 차단 | task 적용 직전 가드 그대로 |
| params 우선 지침 | 의미 오류 | 필터형 task에 적용 |

분해 모드는 이들 **위에 얹히는 오케스트레이션 층**이다.

---

## 9. Verification

- **단위 테스트**: `_looksMultiTask`(멀티/단일 케이스 표), 플래너 출력 파서(번호목록·불릿·잡음 라인). 기존 `scripts/eval-*` 하니스 패턴(esbuild+node, vscode 스텁)으로 vscode 비의존 함수만 분리 테스트.
- **실모델 E2E(수동)**: 진짜 멀티-기능 요청 1개 + 필터 요청으로 — (a) 분해 리스트 합리성, (b) task마다 diff/적용/진행 confirm, (c) task i+1이 i의 결과 위에서 동작, (d) 중복가드 지속 작동.
  - ⚠️ `npm run eval:e2e`는 region replay만 측정 → 이 흐름은 측정 못함. **수동 검증 필요**.
- **회귀**: `npm run compile && npx tsc --noEmit && npm run eval:e2e`(기존 32개 회귀 0 유지).

---

## 10. 미해결/후속
- 분해 품질의 정량 측정 하니스(시나리오 C 풀-프롬프트 + 분해 경로)는 아직 없음 — 별도 과제.
- 작은 교차편집용 **Option C(region 로케이터 재조준)** 는 이 문서 범위 밖, 병행 과제.
