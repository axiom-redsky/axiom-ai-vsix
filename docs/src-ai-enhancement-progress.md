# src/ai 단계별 검증·고도화 — 진행 문서

> **이 문서의 용도**: 다른 PC에서도 이 작업을 이어서 진행할 수 있도록 목적·현황·다음 단계를 기록한다.
> 작업을 이어받는 세션(사람 또는 AI)은 이 문서를 먼저 읽을 것.
> 폴더 재편(선행 트랙, 완료)은 [src-ai-restructure-progress.md](src-ai-restructure-progress.md) 참고.
>
> 최종 갱신: 2026-07-14
>
> **▶ 재개 지점: ① intent 층 착수됨 — "단계별 테스트" 패널 + 의도파악 테스트 페이지 구현 완료
> (2026-07-14, 미커밋 — 리로드 실사용 확인 대기).** 확인 후 커밋 → 그 패널로 불일치 채집 시작.
> intent는 새 계획이 아니라 **기존 라우팅 재설계 트랙의 재개**다:
> [AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md) 기준 S1~S4 완료·커밋,
> S5(정규식 정리·오프라인 단일화)는 **S1 실사용 불일치 로그 데이터 게이트** 상태.
> 데이터 수집 채널 2개: 출력채널 `[Axiom AI][S1 라우팅측정]`(실사용 수동) + 의도파악 테스트 페이지(능동 채집).

---

## 1. 목적

- 폴더 재편(완료)의 본 목적을 실행하는 트랙이다: **각 층을 ①intent부터 순서대로 하나씩 잡고
  "① 현재 상태를 계기판으로 측정 → ② 문제·개선점 도출 → ③ 조금씩 개선 → ④ 재측정으로 검증"을 반복**한다.
- 한 번에 크게 고치지 않는다. 층 하나씩, 개선 하나씩, 항상 계기판(테스트·eval 수치)이 앞뒤를 지킨다.

## 2. 작업 원칙 (반드시 지킬 것)

1. **측정 없는 개선 금지** — 개선 전 반드시 해당 층의 계기판 베이스라인을 먼저 뜨고 시작한다.
   (베이스라인 수치는 §3 표와 각 층 카드에 기록·갱신)
2. **층 순서는 ①→⑤→pipeline→retrieval** — 단, 실사용에서 급한 버그가 나오면 그 층을 먼저 손대도 된다
   (그 경우도 이 문서에 기록).
3. **거대 파일 분할(재편 트랙 8단계, 보류)과 섞지 않는다** — 고도화 중 "이 김에 쪼개자" 금지.
   로직 개선과 구조 변경을 섞으면 회귀 원인 추적이 안 된다.
4. **프롬프트·모델 관련 변경은 실 sLLM으로만 검증** — 합성 테스트는 게이트일 뿐,
   승격 판단은 record/live 하니스(`eval:intent-live`, `eval:e2e:record`, `eval:edit-live`)로.
5. **회귀 게이트**: 각 개선마다 tsc 0 → compile → 해당 층 테스트 + `test:region-edit`(공통 안전망) green.
6. 커밋은 리로드 실사용 확인 후 사용자가 결정. 결과·다음 작업은 **항상 이 문서에 먼저 기록**.

## 3. 진행 현황

| # | 층 | 상태 |
|---|---|---|
| ① | intent/ — 의도 라우팅 | 🔶 **진행중** — 테스트 도구(단계별 테스트 패널+의도파악 페이지) 완료, 불일치 채집 단계 |
| ② | decompose/ — 분해 | ⬜ |
| ③ | locate/ — 위치찾기 | ⬜ |
| ④ | contracts/ — 설명서 삽입 | ⬜ |
| ⑤ | apply/ — 게이트·적용 | ⬜ |
| ⑥ | pipeline/ — 오케스트레이터 | ⬜ (선결 부채: eval:e2e 낡은 녹화 재녹화) |
| ⑦ | retrieval/ — 지식 검색 | ⬜ |

### 공통 계기판 베이스라인 (2026-07-14, 폴더 이관 완료 시점 = 커밋 `9f356a2`)

tsc 0 · compile OK · region-edit 230/0 · api-binding 69/0 · line-edits 15/0 · patch-grounded 30/0 ·
react-rules 39/0 · region-capture 16/0 · offline-intent 66/0 · offline-answer 70/0 ·
knowledge-routing 80/0 · offline-transplant 22/0 · eval:region 85%(35/41) ·
eval:e2e ⚠기존 10건 불일치+cond-leave-date 파싱깨짐(낡은 로컬 녹화, 별도 이슈)

## 4. 층별 카드 (검증 명령 · 개선 후보 · 재개 포인터)

> 각 층 착수 시 이 카드에 체크리스트를 만들어 채우고, 완료되면 §3 표를 갱신한다.

### ① intent/ — 의도 라우팅 🔶

**작업 로그**

- [x] **테스트 도구 구축 (2026-07-14, 미커밋)** — "단계별 테스트" 사이드바(트리 목록, 1~5단계) +
  **1. 의도파악 테스트 페이지**(에디터 탭 WebviewPanel). 프롬프트+컨텍스트(현재파일·선택영역 시뮬레이션)를
  넣으면 운영과 동일한 두 판정 경로를 실행해 나란히 표시:
  - 🤖 모델 분류기: `buildIntentPrompt`→`LlmService.streamChat`('}' 조기종료)→`parseIntent`
    (⚠ ChatViewProvider._classifyIntent 미러 — 그쪽 변경 시 IntentProbePanel도 동기화)
  - 🔤 정규식 폴백: `classifyOfflineIntent` 운영 함수 그대로 + 신호강도 표시
  - 최종 채택(effective)은 S1과 동일 규칙 · **의도 불일치 시 ⚠ 강조 = S5 데이터 능동 채집기**
  - 슬롯(domain/pageName/targetComponent…) 차이 하이라이트 · 전송 프롬프트/원시출력 열람 · 실행 이력 50건
  - 파일: src/views/StageTestPanelProvider.ts · src/providers/IntentProbePanel.ts ·
    src/webview/intentProbe/IntentProbeApp.tsx (+messages.ts·index.tsx·extension.ts·package.json 배선)
  - 게이트: tsc(ext/webview) 0 · compile OK · offline-intent 66/0 · region-edit 230/0
- [ ] 리로드 실사용 확인(패널 열림·판정 실행·온/오프라인 양쪽) → 커밋
- [ ] 테스트 페이지 + 실사용 S1 로그로 `⚠ 불일치` 패턴 수집 → 아래에 기록
- [ ] 수집된 패턴 분류 → 데이터가 가리키는 지점만 S5 착수

**후보 작업 — 대상 파일 해석 고도화 (2026-07-14 사용자 논의로 방향 합의, 착수 전)**

계기: "getArr 함수 만들어줘" 테스트에서 의도(modify_file)는 정확히 잡히나, 대상 파일 해석은
"열린 파일 없으면 빈손 되묻기"가 전부. Claude Code처럼 "관련 파일을 뒤져 판단"하는 것을
Axiom 방식으로 이식한다 — **뒤지는 건 확장(결정론), 고르는 것만 모델(객관식 1회)**.
⚠ 약한 sLLM에 CC식 도구 반복 루프를 주는 방식은 금지(슬라이스 패널 'tool' 모드 실험으로 확인된 한계).

- 1단계(모델 무관·위험 0): 결정론 후보 수집 — 심볼(getArr) 정의·사용처 워크스페이스 검색 +
  현재 파일 import 이웃 + 열린 탭들 → `_askTargetFile` 되묻기를 "근거 있는 후보 목록"으로 업그레이드
- 2단계: 후보 여러 개일 때 모델 객관식 pick (region disambiguation 패턴 재사용)
- 근거 패턴: cross-file 재타겟(추출=모델·해석=결정론) + region disambiguation(후보=결정론·선택=모델)
- 소속: 재설계 트랙 S4(충돌 안전·되묻기)의 고도화 — S1 불일치 채집이 어느 정도 돈 뒤 착수

**수집된 불일치 패턴** (여기에 누적 기록)

- (아직 없음)


- **계기판**: `test:offline-intent`(66) · `eval:intent`(오프라인 합성) · `eval:intent-live`(실 sLLM,
  `$env:AXIOM_EVAL_REPEAT="3"`으로 흔들림 측정, `$env:AXIOM_ENDPOINT`/`$env:AXIOM_MODEL` 덮어쓰기 가능)
- **현황**: 재설계 트랙 S1✅·S2✅·S3(부분)✅·S4(사실상)✅ 커밋(main 826fb3e/577f1be) —
  "지금 안전하게 만들 코드작업은 소진"된 상태. 잔여(S3④ isFileCtx 오프라인 교체 ·
  S4 모델↔정규식 불일치 되묻기 · S5 정규식 정리+오프라인 단일화)는 **전부 S1 실측 데이터 게이트
  (speculative 금지, measure-then-build)**. 참고: 분류기 자체는 라이브 45/45 정확 —
  문제는 분류가 아니라 하위 파이프라인이 무시/왜곡하는 케이스를 찾는 것.
- **재개 절차**:
  1. 실사용 중 출력채널(`Axiom AI`)의 `[S1 라우팅측정]` 라인에서 `⚠ 불일치` 샘플 수집
  2. 불일치 패턴 분류(오분류 종류별 빈도) → 이 카드에 기록
  3. 데이터가 가리키는 지점만 S5 착수 (계획서 §4 참조)
- **그 외 후보**: IntentClassifier 플래그(experimental.intentClassifier) 라이브 검증,
  "X로 적용"vs"X를 수정" 조사 정밀화 라이브 검증(cross-file-retarget 메모리)
- **참고 문서**: [AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md)(★진입점),
  docs/page-creation-intent-routing-plan.md
- ⚠ 라우팅 '결정' 덩어리는 아직 ChatViewProvider 인라인(재편 트랙 §4.2) — S5가 곧 그 추출 작업이다.

### ② decompose/ — 분해 ⬜

- **계기판**: `eval:input`(입력 품질) · `eval:bigfile`(큰파일 합성 하니스) · region-edit(간접)
- **개선 후보**: **bigfile 레버1 = deps 가지치기** — 큰파일에서 입력의 대부분이 0%관련 type덤프로
  채워지는 것이 보편 #1 문제(eval:bigfile 베이스라인 조사 완료 상태). 레버2(모호쿼리)·레버3(섹션라우팅
  복합어 토큰화 top-bias)은 그 다음.
- **참고**: 메모리 project_bigfile_eval_harness, project_endpoint_disambiguation_gap(레버 B 미구현)

### ③ locate/ — 위치찾기 ⬜

- **계기판**: `eval:region` 85%(35/41) · `eval:disambig`(+record) · test:region-edit
- **개선 후보**: 앵커 계약 주력화·locate 축소(verify-correct 루프 Stage 0 트랙의 후속 방향),
  region disambiguation 모델 객관식(pick 품질 라이브 검증 대기)
- **참고**: 메모리 project_verify_correct_loop_stage0, project_region_disambiguation,
  project_locate_text_anchor

### ④ contracts/ — 설명서 삽입 ⬜

- **계기판**: test:region-edit(계약카드 케이스들) · `test:api-binding`(69) · eval:region 토큰절감 지표
- **개선 후보**: 계약카드 커버리지 확장(현재 11카드), 봉투계약 실 sLLM 검증(compose-binding Phase B),
  ComponentPropsIndex 재생성 자동화 검토
- **참고**: 메모리 project_scaffold_contract_coverage, project_compose_binding_recipe,
  project_recipe_contract_cards

### ⑤ apply/ — 게이트·적용 ⬜

- **계기판**: `test:line-edits`(15) · `test:patch-grounded`(30) · `test:react-rules`(39) · eval:e2e 게이트 통계
- **개선 후보**: grounded patch retry 1C(결정론 rename, 미구현), 검증-교정 루프(experimental.regionVerify)
  실모델 검증, full 폴백 파괴적 누락 가드 실모델 검증
- **참고**: 메모리 project_grounded_patch_retry, project_verify_correct_loop_stage0,
  project_full_fallback_contract_loss

### ⑥ pipeline/ — 오케스트레이터 ⬜

- **계기판**: `eval:e2e`(record/replay) — **⚠ 선결 부채: 이 PC 로컬 녹화가 낡아 10건 불일치 +
  cond-leave-date 파싱깨짐. 서버 연결 상태에서 `eval:e2e:record` 재녹화(또는 `eval:e2e:bless` 재점검)
  먼저 해야 이 층의 계기판이 신뢰 가능해진다.**
- **개선 후보**: 실패 시 폴백 체인(full 재시도) 품질, region capture 회수경로(retrieval와 걸침)
- **참고**: 메모리 project_region_failure_capture(회수경로·EvalCase 변환 미구현)

### ⑦ retrieval/ — 지식 검색 ⬜

- **계기판**: `test:knowledge-routing`(80) · `test:offline-answer`(70) · `test:offline-transplant`(22)
- **개선 후보**: 실패 포집 회수경로(EvalCase 변환), 오프라인 지식 공백 4종 저작 잔여분,
  .axiom/knowledge 핫리로드 워크플로우 점검
- **참고**: 메모리 project_offline_mode_enhancement, project_offline_retrieval_ranking
- ⚠ 오프라인 개선 시 공유 어휘스코어러(buildContext) 절대 수정 금지(온라인 영향).

## 5. 공통 작업 절차 (각 층에서 반복)

1. 이 문서의 해당 층 카드 + 참고 문서·메모리 읽기.
2. 계기판 베이스라인 실행·기록 (§3 공통 + 층별).
3. 개선 후보 중 **하나** 선택 → 작은 단위로 구현.
4. 게이트: tsc → compile → 층별 테스트 + test:region-edit → 관련 eval 재측정(베이스라인 대비).
5. 프롬프트·모델 관련이면 실 sLLM 검증(record/live)까지.
6. 이 문서 갱신(카드 체크리스트·수치·다음 작업) → 리로드 실사용 확인 → 커밋(사용자 결정).

## 6. 관련 문서

- 선행 트랙(폴더 재편, 완료): [src-ai-restructure-progress.md](src-ai-restructure-progress.md) — §8에 이 트랙의 요약 지도
- 구조 지도: [src/ai/README.md](../src/ai/README.md) + 각 폴더 README.md
- 흐름 도식: [docs/diagrams/](diagrams/)
- intent 재설계 계획서: [AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md)
- Claude 세션 메모리에도 요약 기록되나, **PC 간 공유되는 진실은 이 문서**다. 갱신은 여기 먼저.
