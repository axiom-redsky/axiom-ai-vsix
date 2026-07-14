# src/ai 단계별 검증·고도화 — 진행 문서

> **이 문서의 용도**: 다른 PC에서도 이 작업을 이어서 진행할 수 있도록 목적·현황·다음 단계를 기록한다.
> 작업을 이어받는 세션(사람 또는 AI)은 이 문서를 먼저 읽을 것.
> 폴더 재편(선행 트랙, 완료)은 [src-ai-restructure-progress.md](src-ai-restructure-progress.md) 참고.
>
> 최종 갱신: 2026-07-14
>
> **▶ 재개 지점: ① intent 층 — 착수 전.**
> intent는 새 계획이 아니라 **기존 라우팅 재설계 트랙의 재개**다:
> [AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md) 기준 S1~S4 완료·커밋,
> S5(정규식 정리·오프라인 단일화)는 **S1 실사용 불일치 로그 데이터 게이트** 상태.
> 진입점 = 출력채널 `[Axiom AI][S1 라우팅측정]`에서 `⚠ 불일치` 패턴 수집(§4-① 참고).

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
| ① | intent/ — 의도 라우팅 | ⬜ **다음 차례** (재설계 트랙 S5 재개, S1 로그 수집부터) |
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

### ① intent/ — 의도 라우팅 ⬜

- **계기판**: `test:offline-intent`(66) · `eval:intent`(오프라인 합성) · `eval:intent-live`(실 sLLM,
  `$env:AXIOM_EVAL_REPEAT="3"`으로 흔들림 측정, `$env:AXIOM_ENDPOINT`/`$env:AXIOM_MODEL` 덮어쓰기 가능)
- **현황**: 재설계 트랙 S1(비파괴 측정로그)~S4(충돌안전) 완료·커밋(main 826fb3e/577f1be).
  S5(정규식 게이트 정리 + 오프라인 단일화)는 **speculative 금지 — S1 실측 데이터 게이트**.
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
