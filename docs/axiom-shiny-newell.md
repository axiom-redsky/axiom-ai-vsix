# Axiom v2 전면 개편 플랜 — 최종

## Context (왜 이 작업인가)

사용자 요청: 현재 파이프라인(intent → decompose → locate → contracts → LLM → apply)은 **한 단계라도 틀리면 전체가 틀리는 open-loop 구조**라 버그·두더지잡기가 반복된다. 이를 전면 개편할 플랜을 수립하고, **결과물을 docs 폴더에 md 파일로 정리**한다. (플랜 문서 작성이 이번 작업의 산출물 — 코드 변경 없음.)

5대 원칙: ①Scaffold 규칙을 아는 AI(차별화) ②생산성·React 초보 보조 ③폐쇄망 sLLM 토큰 통제 ④오프라인(LLM 미연결)에서도 유용 ⑤SI 프로젝트별 메타데이터 적용.

**사용자 확정 결정 4건** (AskUserQuestion):
1. **병행 v2 재작성** — 새 파이프라인을 옆에 만들고 플래그로 전환 (점진 재배치 아님)
2. **AST 도입** — TS 컴파일러 API로 정규식·중괄호 추적 바닥재 교체 (폐쇄망 안전, 순수 JS)
3. **적응형 2콜** — 단순 요청은 1콜, 복잡 요청만 계획→편집(Architect/Editor) 2콜
4. **계약카드 데이터화** — md+YAML로 전환, .axiom 3계층(내장→프로젝트→개인)

## 탐색·검증으로 확정된 사실 (문서에 정확히 반영할 것)

### 현 구조 (v1)
- 진입점 ChatViewProvider.ts 6,159줄에 라우팅·재시도 인라인. src/ai 5층(intent 1,133 / decompose 1,682 / locate 967 / contracts 630 / apply 1,964) + pipeline/ 3,162줄.
- LLM 호출: 정상 2회(의도 JSON 1줄 + 생성), 최대 4~5회(객관식 disambig, verify 교정, anchor-first 재시도).
- 모델 출력 계약: `<region>/<hook>/<import>/<replace>` 4채널 태그 (검증된 자산 — v2에서도 유지).
- 게이트 19+종(locate 7 + 합성 후 12), 폴백 사다리는 **사실상 존재**하나 4곳에 암묵 분산(groundedRetryDone 불리언, REGION_GROUNDABLE_REASONS, classifyRegionDecline, _tryAutoFullFallback).
- 계기판: 결정론 테스트 25종 ~1,900건 green, eval:region **85%(35/41)**, eval:intent-live 45/45. 부채: eval:e2e 낡은 녹화, RegionCapture→EvalCase 변환기 미구현. 픽스처·녹화는 로컬 전용(.gitignore).

### 사실 보정 (Plan 에이전트 검증 — 문서에서 과장 금지)
- 라우팅 통합 S1~S4 완료, S5만 divergence 로그 데이터 게이트 대기(저장소 명문 규칙: 데이터 없이 착수 금지).
- 계약 유실 사고는 3곳 재주입으로 지혈됨 — 남은 건 "새 경로마다 수동 재주입해야 하는 클래스"(예: verify-correction 프롬프트엔 카드 없음).
- confidence 원형 이미 존재: OfflineIntentResolver(confidence/margin/strength 서열 중재 5단계), locate bestScore/candidates/gate.
- apply 최종 단계는 이미 1개로 수렴(_handleAxiomAction) — 파편화는 그 앞단 해석·게이트 배선.

### 구조 문제 진단 6가지 (개편 근거)
1. open-loop 오류 전파(단계 간 확신도 미전달) 2. 라우팅 결정자 5개 "게이트 수프"(오프라인은 단일 중재인데 온라인은 아님) 3. 게이트=차단→full 폴백만(교정 신호 재사용 없음, 새 실패마다 게이트 추가=두더지잡기) 4. 편집 경로 5개(region/lines/patch/structural/full) 각자 다르게 실패, 프롬프트 빌더 이원화 5. 정규식·중괄호 바닥재(멀티라인 구조분해 사각지대, 한글 \b 함정 등 실사고 이력) 6. 계약카드 트리거 오발동/미발동 + 카드↔지식문서 드리프트 가드 부재. 실패 모드 카탈로그 59건 확보.

### 외부 리서치 근거 (문서 §근거에 출처와 함께 수록)
- Aider Architect/Editor 분리: 추론↔편집형식화 분리 시 약한 모델도 85% pass — 적응형 2콜의 근거.
- Agentless(arxiv 2407.01489): localize→repair→validate 단순 파이프라인+검증 기반 선택이 에이전트를 이김 — 파이프라인 유지+닫힌 루프의 근거.
- CodeRabbit: 모델 호출 전 결정론 분석+컨텍스트 큐레이션이 병목 — 하이브리드.
- seangoedecke: 로컬/VRAM 제한엔 파이프라인이 정답.
- Ollama/OpenAI 호환 structured outputs(XGrammar): JSON 스키마 강제로 파싱실패 클래스 제거(분류·객관식에만 — 코드 생성은 constraint tax로 태그 유지).
- Tree-sitter/AST 앵커링 연구(SemLoc 등), 교정 루프는 비추론 모델 1~2회 plateau.

## v2 아키텍처 설계 (문서의 핵심부)

### 폴더: `src/ai/v2/` — router / analyze / assemble / generate / apply / policy / orchestrator
플래그 `axiom-ai.experimental.pipelineV2`(기본 off)로 전환. v1은 컷오버까지 동결(버그픽스만).

### 7대 설계 전환
1. **닫힌 루프 + StageResult 계약**: 모든 단계가 `{value, confidence(서수: high/ambiguous/none — float 캘리브레이션 금지), evidence(사유코드), candidates}` 반환. 오케스트레이터가 **정책표**(resolveModePolicy 패턴, (stage×reason×budget)→next-action)로 진행/교정/되묻기/강등 결정. 턴당 모델콜·되묻기 예산을 표의 1급 필드로.
2. **단일 라우터**: OfflineIntentResolver 5단계 중재를 온라인 본선으로 승격(LLM 분류 + 정규식 strength + 임베딩 합의·중재). structured outputs(JSON 스키마)로 분류·객관식 파싱실패 제거(미지원 엔드포인트는 parseIntent 폴백). uncertain→되묻기 1급. ⚠S5 정규식 정리는 divergence 데이터 게이트 존중.
3. **AST 분석 코어**: TS 컴파일러 API 기반 파일 분석(선언·스코프·JSX 경계·의존 그래프). 로딩 전략: 워크스페이스 node_modules/typescript 기생(번들 0증가) → 번들 TS 폴백(~8MB). locate는 AST 노드 앵커+후보 마진, apply 삽입점은 AST 좌표. 정규식 사각지대 클래스(멀티라인 구조분해, brace-depth) 소멸.
4. **단일 프롬프트 스파인**: 섹션 레지스트리(계약카드/coreRules/참조스펙/현재파일/그라운딩)에서 모든 v2 경로(생성·재시도·verify교정·오프라인)가 조합 선언으로 프롬프트 구성 → 계약 유실 클래스 소멸. promptBudget을 섹션 단위 계측으로 승격.
5. **전략 사다리(게이트→선택기)**: 오케스트레이터가 전략을 순서대로 선택 — ⓐ**결정론 전략 우선**(compose binding·recipe 등 모델 0콜, 온라인에서도 토큰 절약) → ⓑ좁은 편집(1콜, 4채널 태그) → ⓒ계획→편집 2콜(복잡도 판정 시) → ⓓrepair(<replace> 교정 1회) → ⓔre-anchor/좁은 재생성 → ⓕ되묻기 → ⓖfull 재생성(최후 수단, 파괴 가드 뒤). **불변식: 파괴 클래스 게이트(content-loss·duplicate-decl·root-tag)는 스코어러로 흡수 금지 — 하드 차단 유지.** 다중 후보 생성은 오프라인 eval 튜닝 전용(온라인 N샘플 금지).
6. **계약카드 데이터화 + SI 메타 계층**: 카드=md+YAML, `.axiom/contracts` 3계층(CardCatalog 합성·핫리로드 패턴 재사용). 트리거는 CardMatcher의 한글 안전 compact 매칭 문법 채택(실사고 응축 정규식은 내장 카드에 병기 이관). 카드↔knowledge 문서 드리프트 가드 테스트 신설. `.axiom/meta/`: 표준용어집(용어→필드·컴포넌트, 토크나이저 브리지·locate·바인딩에 주입), API 스펙 구조화 인덱스(SpecDocScanner 확장), 프로젝트 프로파일.
7. **오프라인 = 같은 스파인**: 단계가 needsModel 선언, 오프라인이면 결정론 전략+지식응답+계획카드로 강등(기존 오프라인 자산 재작성 아님 — 접속만). 제외 확정 트랙(C2·D3·§6 채집 플라이휠)은 재제안하지 않음.

### v1 재사용 자산 (v2로 이식/참조)
- 그대로 이식: 4채널 출력 태그 계약, applyStructuralEdit/applyReplaceBlocks(AST 좌표로 개량), 게이트 함수군(findUnresolved*·content-loss 등 → GateBattery), buildContractSection 로직(데이터 카드 렌더러로), OfflineIntentResolver 중재, CardMatcher/CardCatalog/MiniYaml, promptBudget, RegionCaptureRecorder, verify 루프(임시 형제파일+diagnostics), 결정론 실행기(compose binding·recipe·D1·D2).
- 패턴 재사용: resolveModePolicy(정책표), IntentResult&{strength}(추가형 확장), 프로브 패널 1:1 직결 원칙.

## Phase 계획 (문서 §로드맵)

- **Phase 0 — 계기판 준비**: A/B 하니스(같은 코퍼스를 v1/v2에 흘려 적용률·게이트 분포·토큰 비교), eval:e2e 재녹화(폐쇄망 라이브 세션 필요 — 로컬 계기판임을 명시), capture→EvalCase 변환기, 포집 로컬 ON, 베이스라인 수치 동결.
- **Phase 1 — v2 골격**: 폴더·플래그·StageResult·정책표·오케스트레이터 골격·ChatViewProvider 어댑터 포트(post/history/capture 주입 — 이벤트 시퀀스 테스트 신설), AST 코어(로더+분석 API)+AST 단위 테스트.
- **Phase 2 — 라우터 v2**: 중재 통합+structured outputs+되묻기. 독립 컷오버 가능(상류). 검증: eval:intent-live 45/45 유지+반복측정.
- **Phase 3 — 편집 코어 v2**: AST locate(후보+마진)→스파인 조립→적응형 1~2콜 생성→GateBattery→전략 사다리→verify 루프. 검증: A/B에서 v1 대비 적용률·토큰 동등 이상.
- **Phase 4 — 계약카드 데이터화+SI 메타**: .axiom/contracts, meta/, 드리프트 가드, 내장 13장 이관.
- **Phase 5 — 오프라인 접속**: needsModel 강등 경로, 결정론 전략 등록.
- **Phase 6 — 컷오버**: 성공 기준(A/B 적용률 ≥ v1, full 진입률 감소, 토큰 감소, 라이브 스윕 체크리스트 통과) 충족 시 기본 전환 → v1 유예 기간 → 제거.

각 Phase 게이트: "측정 없는 개선 금지" — 기존 스위트 green(재사용 모듈) + v2 신규 테스트 + A/B 수치 + 프롬프트 변경분은 폐쇄망 라이브 스윕(체크리스트 형식은 phase-b-live-verification-checklist.md 재사용).

## 리스크와 대응 (문서 §리스크)
- 이중 유지보수 기간: v1 동결(버그픽스만) + Phase 2 라우터 선행 컷오버로 기간 단축.
- 라이브 검증 병목: 프롬프트 영향 Phase는 "오프라인 증명분/라이브 승격분"으로 쪼개 명시.
- 파괴 게이트 불변식(위 §전환 5), verify 사각(tsc는 내용 삭제를 못 봄 — content-loss 하드 게이트 유지).
- S5 데이터 게이트·제외 트랙(C2/D3/§6) 존중.

## 실행 내용 (이번 승인 후 할 일)

**`docs/axiom-v2-전면개편-플랜.md` 1개 파일 신규 작성** (코드 변경·기존 파일 수정 없음):
1. §배경·진단 (구조 문제 6가지 + 실패 모드 카탈로그 요약)
2. §근거 (외부 리서치 출처 포함 + 사내 선례)
3. §확정 결정 4건과 5대 원칙 매핑
4. §v2 아키텍처 (7대 전환 + 구성 흐름 + StageResult/정책표 타입 스케치 + 프롬프트 스파인 섹션 목록)
5. §재사용 자산 표 (v1 파일 경로 → v2 배치)
6. §로드맵 Phase 0~6 (각 목표/산출물/검증 게이트/라이브 필요 여부)
7. §리스크 / §성공 기준·측정 계획 / §비범위(제외 트랙 명시)
8. `▶ RESUME` 절 (이 저장소 문서 규약 준수 — 이어받기 안내)

## Verification
- 산출물이 문서이므로: 작성 후 문서 내 파일 경로·수치(eval:region 85%, 테스트 건수 등)가 탐색 결과와 일치하는지 대조 확인.
- docs/ 기존 문서 규약(진행 문서 형식, RESUME 절)과 일관성 확인.
- 코드·설정 무변경 확인(git status clean 유지).
