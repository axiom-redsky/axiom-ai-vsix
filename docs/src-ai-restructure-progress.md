# src/ai 폴더 재구성 — 진행 문서

> **이 문서의 용도**: 다른 PC에서도 이 작업을 이어서 진행할 수 있도록 목적·현황·다음 단계를 기록한다.
> 작업을 이어받는 세션(사람 또는 AI)은 이 문서를 먼저 읽을 것.
>
> 최종 갱신: 2026-07-13
>
> **▶ 재개 지점: 6단계 pipeline/ 이관부터.** 1~5단계(intent·decompose·locate·contracts·apply) 완료.
> 5단계는 리로드 실사용 확인 후 커밋 필요할 수 있음(§4 표의 미커밋 표시 확인).
> 6·7단계는 사전 조사까지 완료 — 각 체크리스트의 소비자 지도를 그대로 쓰면 되고,
> 절차는 §6 공통 절차, 함정은 §3 원칙 참고. 게이트 통과 기준: 이전 단계들과 동일
> (tsc 0 · compile OK · 해당 테스트 전부 green · eval 베이스라인 회귀 0).

---

## 1. 목적

- **이해**: 사용자 프롬프트가 AI서버(sLLM)에 던져지기 전까지 Axiom이 처리하는 과정을
  관리자(개발자 본인)가 명확히 이해할 수 있게 한다. 이해가 있어야 유지보수·수정이 수월하다.
- **유지관리**: 처리 흐름의 각 단계를 물리적 폴더로 분리해서, "이 로직이 어디 있지?"가
  폴더 이름만으로 답이 되게 한다.
- 현재는 분해·위치찾기·설명서삽입 로직이 전부 `src/ai/` 바로 아래에 평평하게 몰려 있어
  단계 경계가 코드 구조에서 보이지 않는 것이 문제의 출발점.

## 2. 층 정의 (합의된 분류)

sLLM 콜 전 3단계("분해 → 위치찾기 → 설명서 삽입")를 골격으로 하되,
앞뒤로 한 층씩 추가해 총 5층 + 보조 2폴더로 확정했다.

```
사용자 프롬프트
   │
   ▼
① intent/      의도 라우팅(현관문) — 무엇을 할지 결정 (수정? 생성? 질문?)
② decompose/   분해 — 쿼리 토큰화 + 배경·의존성 추출
③ locate/      위치찾기 — 스냅 사다리로 편집 대상 영역 결정
④ contracts/   설명서 삽입 — 계약카드·prop 인덱스를 프롬프트에 주입
━━ 단일 sLLM 콜 ━━
⑤ apply/       게이트·적용 — 응답 검증 후 결정론 배치 (sLLM 후)

+ pipeline/    오케스트레이터 — 전 단계를 지휘 (특정 층 아님)
+ retrieval/   지식 검색·RAG 코드 — Q&A·오프라인 보조 축
```

- 각 폴더의 상세 역할·이관 후보 목록은 **각 폴더의 README.md**가 단일 진실이다.
  전체 지도는 [src/ai/README.md](../src/ai/README.md).
- 다이어그램(`docs/diagrams/07-분해-로직.svg`)에서는 위치결정이 분해의 하위 단계였으나,
  폴더 분류에서는 **형제로 승격**하기로 결정(코드량·독립성 때문). 다이어그램도 추후 이 분류로 통일 예정.
- ⚠ **루트 `knowledge/` 폴더는 절대 이동 금지** — 그것은 RAG가 읽는 **데이터**(md 문서)이고,
  검색 **코드**는 `retrieval/`로 간다. 혼동 방지를 위해 코드 폴더 이름을 knowledge가 아닌 retrieval로 정했다.

## 3. 작업 원칙 (반드시 지킬 것)

1. **이동 먼저, 쪼개기는 나중** — 1단계는 깨끗하게 매핑되는 파일만 `git mv`(로직 무변경, import 경로만 수정).
   여러 층에 걸친 거대 파일(ScaffoldContextBuilder 84KB, StructuralAnchor 91KB, RegionEditService 52KB)의
   분할은 2단계로 미룬다. 폴더 이관과 로직 변경을 섞으면 회귀 원인 추적이 안 된다.
2. **이동 하나마다 게이트**: `npx tsc --noEmit` → `npm run compile` → 관련 테스트 스위트.
3. **검증의 진실은 tsc** — grep으로 깨진 import를 찾을 때 파일명에 포함된 키워드(예: "Intent")가
   `grep -v` 필터에 걸려 진짜 깨진 참조를 가릴 수 있다(intent 이관 때 EmbeddingService 참조 누락 사례).
4. 폴더 설명은 index.ts 주석이 아니라 **README.md** (빈 배럴 회피, git 추적, 에디터 렌더).
   배럴 index.ts는 필요해질 때만(순환 import 위험).
5. 커밋은 익스텐션 리로드 후 실사용 확인을 거쳐 사용자가 결정.

## 4. 진행 현황

| # | 작업 | 상태 |
|---|---|---|
| 0 | 폴더 7개 생성 + 각 README.md + src/ai/README.md(전체 지도) | ✅ 완료 (2026-07-13) |
| 1 | **intent/ 이관** (8파일 + 소비자 9곳) | ✅ 완료 (2026-07-13, **미커밋 — 실사용 확인 대기**) |
| 2 | **decompose/ 이관** (6파일 + 소비자 20곳) | ✅ 완료 (2026-07-13, 미커밋 — 실사용 확인 대기) |
| 3 | **locate/ 이관** (RegionEdit 1파일 + 소비자 11곳) | ✅ 완료 (2026-07-13, 미커밋 — 실사용 확인 대기) |
| 4 | **contracts/ 이관** (3파일+generated/ + 소비자 8곳) | ✅ 완료 (2026-07-13, 미커밋 — 실사용 확인 대기) |
| 5 | **apply/ 이관** (2파일 + 소비자 12곳) | ✅ 완료 (2026-07-13, 미커밋 — 실사용 확인 대기) |
| 6 | pipeline/ 이관 | ⬜ 다음 차례 |
| 7 | retrieval/ 이관 | ⬜ |
| 8 | (2단계) 거대 파일 분할 — ScaffoldContextBuilder(분해/설명서), StructuralAnchor(게이트/적용), RegionEdit(locate 속 checkRegionRootTag→apply) | ⬜ 전 폴더 이관 후 |

### 4.1 intent/ 이관 상세 (완료분 기록)

- **이동한 파일 8개** (`git mv`, rename 인식으로 히스토리 보존):
  IntentClassifier, IntentSignals, IntentEmbeddingClassifier, IntentLinearHead,
  IntentExampleStore, OfflineIntentResolver, PageCreationDetector, CrossFileTargeting
- **import 경로 수정 9곳**:
  - src 4곳: `providers/ChatViewProvider.ts`(최대 소비자, 7개 import),
    `ai/ScaffoldContextBuilder.ts`, `ai/OfflineResponder.ts`, `ai/OfflineKnowledgeRetriever.ts`
  - scripts 5곳: `test-offline-intent.ts`, `test-offline-answer.ts`, `test-region-edit.ts`,
    `eval-intent.ts`, `eval-intent-live.ts`
- **intent/ → 상위 참조는 2개뿐**: IntentEmbeddingClassifier·IntentExampleStore가
  `../EmbeddingService`, `../VectorMath` 참조 (EmbeddingService·VectorMath는 retrieval/ 이관 대상이라
  그때 경로가 다시 바뀔 예정 — retrieval 이관 시 잊지 말 것)
- **게이트 결과 (전부 통과)**: tsc 0 에러 · compile 정상 ·
  `test:offline-intent` 66/0 · `test:offline-answer` 70/0 · `test:region-edit` 230/0
- 로직 변경 0 (순수 이동)

### 4.2 intent 층에서 아직 안 옮겨진 것 (알고 있는 부채)

라우팅 **'결정'** 로직의 큰 덩어리는 `src/providers/ChatViewProvider.ts`(6,000줄+)에 인라인으로 남아 있다:
분류기 호출·폴백 배선, create→modify 충돌가드, qnaGated·isFileCtx 게이트 판정,
S1 effectiveIntent 비파괴 측정 로그. 이것은 폴더 정리가 아니라 **의도 라우팅 재설계 트랙**
([AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md), S2~)에서 단일 라우터로 추출한다.
두 트랙을 섞지 말 것.

## 5. 단계별 체크리스트

> 작업 시 여기 체크박스를 직접 갱신하고 커밋한다. 이것이 PC 간 진행 상태의 진실이다.
> 각 단계의 공통 절차는 §6 참고. 게이트 스크립트 이름은 package.json 기준 실재하는 것만 적었다.

### ✅ 0단계 — 골격 (완료 2026-07-13)

- [x] 폴더 7개 생성 + 각 README.md + src/ai/README.md 전체 지도
- [x] 진행 문서(이 파일) 생성

### ✅ 1단계 — intent/ (완료 2026-07-13, 커밋됨)

- [x] 8파일 git mv + 소비자 9곳 경로 수정
- [x] 게이트: tsc 0 · compile OK · test:offline-intent 66/0 · test:offline-answer 70/0 · test:region-edit 230/0
- [x] intent/README "구성 파일"로 갱신
- [x] 리로드 실사용 확인 후 커밋

### 🔶 2단계 — decompose/ (작업 완료, 리로드 확인·커밋 대기)

- [x] 소비자 전수 조사: SectionExtractor, CodeSectionExtractor, FunctionSpotlight, RegionInputQuality, RegionIntent, EditorContextCollector — providers 3곳(ChatViewProvider·RegionIoProbeProvider·SliceProbeProvider) + src/ai 형제 11곳 + scripts 6곳(eval-bigfile·eval-input-quality·probe-bc-primitives·probe-locate·probe-sliced-output·test-api-binding)
- [x] `git mv` 6파일 → src/ai/decompose/
- [x] import 경로 수정 (상위 형제 참조는 RegionInputQuality→`../RegionEdit` 1건뿐 — locate/ 이관 시 재수정 필요)
- [x] 게이트: tsc 0 · compile OK · test:region-edit 230/0 · test:api-binding 69/0 · test:offline-answer 70/0 · eval:region 85%(35/41) 회귀 없음 · eval:input 정상
- [x] decompose/README "구성 파일"로 갱신
- [x] 이 문서 §4 표 + 이 체크리스트 갱신
- [ ] 리로드 실사용 확인 → 커밋

### 🔶 3단계 — locate/ (작업 완료, 리로드 확인·커밋 대기)

- [x] 소비자 전수 조사: RegionEdit.ts — src 4곳(RegionEditService·RegionIoProbeProvider·SliceProbeProvider·decompose/RegionInputQuality) + scripts 7곳(test-region-edit·eval-region·eval-e2e·eval-bigfile·eval-disambig·probe-locate·probe-eval-real)
- [x] `git mv` → src/ai/locate/
- [x] import 경로 수정 (decompose/RegionInputQuality의 `../RegionEdit`→`../locate/RegionEdit` 재수정 포함, RegionEdit 자신의 `./decompose/`→`../decompose/` 3건)
- [x] 게이트: tsc 0 · compile OK · test:region-edit 230/0 · test:line-edits 15/0 · eval:region 회귀 없음 · eval:e2e **이동 전후 출력 diff 0** (동일)
- [x] locate/README 갱신 (checkRegionRootTag는 "아직 여기 없는 것" 부채로 기록)
- [x] 이 문서 갱신
- [ ] 리로드 실사용 확인 → 커밋

> ⚠ **별도 이슈 발견(이 트랙과 무관)**: eval:e2e가 이 PC의 로컬 녹화 기준으로 기존부터 10건 불일치
> + cond-leave-date TSX 파싱 깨짐 상태. 이동 전후 diff 0으로 이번 작업 원인 아님을 확인함.
> 원인 추정 = 오래된 로컬 녹화 vs 최근 코드 변경(다른 트랙)의 어긋남. 서버 연결 시
> `eval:e2e:record` 재녹화 또는 기대값 재점검(`eval:e2e:bless`) 필요.

### 🔶 4단계 — contracts/ (작업 완료, 리로드 확인·커밋 대기)

- [x] 소비자 전수 조사: ScaffoldContracts, ComponentPropsIndex, promptBudget — src 4곳(ChatViewProvider·OfflineResponder·RegionEditService·ScaffoldContextBuilder) + scripts 4곳(test-region-edit·eval-region·eval-bigfile·eval-edit-live)
- [x] **generated/ 폴더 함께 이동 결정** (소비자가 ComponentPropsIndex뿐) → contracts/generated/, build-component-props.mjs OUT_PATH 수정
- [x] `git mv` 3파일+generated/ → src/ai/contracts/
- [x] import 경로 수정 (상위 참조는 promptBudget→`../config` 1건뿐)
- [x] 게이트: tsc 0 · compile OK · test:region-edit 230/0 · test:api-binding 69/0 · test:react-rules 39/0 · eval:region 회귀 없음 · **재생성 검증**: `node scripts/build-component-props.mjs` → 새 경로에 53컴포넌트·274prop 출력, 기존 파일과 diff 0
- [x] contracts/README 갱신 → 이 문서 갱신
- [ ] 리로드 실사용 확인 → 커밋

### 🔶 5단계 — apply/ (작업 완료, 리로드 확인·커밋 대기)

- [x] 소비자 전수 조사: StructuralAnchor, DiffUtil — src 6곳(ChatViewProvider·SliceProbeProvider·ApiBindingRecipe·FileCreatorService·OfflineTransplant·RegionEditService) + scripts 6곳(test-region-edit·test-react-rules·test-api-binding·poc-anchor·poc-e2e·probe-bc-primitives)
- [x] `git mv` 2파일 → src/ai/apply/ (91KB 통째 이동 — 분할은 8단계)
- [x] import 경로 수정 (상위 참조는 StructuralAnchor→`../decompose/CodeSectionExtractor` 1건뿐, DiffUtil 자립)
- [x] 게이트: tsc 0 · compile OK · test:region-edit 230/0 · test:line-edits 15/0 · test:react-rules 39/0 · test:patch-grounded 30/0 · test:api-binding 69/0 · eval:e2e **3단계 시점 출력과 diff 0** (기존 이슈 외 변화 없음)
- [x] apply/README 갱신 → 이 문서 갱신
- [ ] 리로드 실사용 확인 → 커밋

### ⬜ 6단계 — pipeline/ (2026-07-13 사전 조사 완료 — 아래 지도 그대로 사용 가능)

- [x] 소비자 전수 조사 (2026-07-13 조사 결과):
  - **src 5곳**: ChatViewProvider(4파일 전부 소비), ChatPanelProvider(LlmService),
    SliceProbeProvider(LlmService), RegionIoProbeProvider(RegionEditService·LlmService),
    **src/spec/SpecGenerator.ts**(LlmService — 처음 등장하는 영역, 경로 `../ai/LlmService`)
  - **scripts 12곳**: test-region-edit, test-line-edits, test-react-rules, test-patch-grounded,
    test-region-capture, eval-region, eval-e2e, eval-edit-live, eval-bigfile, eval-disambig,
    probe-crosscut, probe-eval-real
  - ⚠ 이 단계는 반대 방향 참조가 많음: 옮기는 파일(오케스트레이터)이 decompose/·locate/·contracts/·apply/를
    다수 import → 이동 후 `'./X'`→`'../X'` 일괄 치환 필요 (tsc가 전수 검증)
  - ⚠ LlmService가 `./FallbackStubService`(retrieval 후보) 참조 → 이동 후 `../FallbackStubService`,
    7단계에서 `../retrieval/FallbackStubService`로 재수정됨 (두 번 손대는 게 정상)
- [ ] LlmService 포함 여부 결정 — **권고: 일단 pipeline/에 포함**하고 README에 "추후 llm/ 분리 검토" 기록
  (폴더 추가 논의로 이관을 막지 말 것, 나중에 이동 쉬움)
- [ ] `git mv` 4파일 → src/ai/pipeline/
- [ ] import 경로 수정 (소비자 17곳 + 옮긴 파일들의 안→밖 참조)
- [ ] 게이트: tsc → compile → `test:region-edit` → `test:api-binding` → `test:region-capture` → `test:line-edits` → `test:patch-grounded` → `test:react-rules` → eval:e2e 출력 diff 비교(§주의: 기존 10건 불일치는 별도 이슈)
- [ ] pipeline/README 갱신 → 이 문서 갱신 → 리로드 확인 → 커밋

### ⬜ 7단계 — retrieval/ (2026-07-13 사전 조사 완료 — 아래 지도 그대로 사용 가능)

- [x] 소비자 전수 조사 (2026-07-13 조사 결과): 12파일(OfflineKnowledgeRetriever, KnowledgeDoc, RagRetriever,
  KeywordRetriever, HybridRagEngine, EmbeddingService, VectorMath, ExternalCorpusLoader,
  FileContextRetriever, OfflineResponder, OfflineTransplant, FallbackStubService)은
  **서로끼리 참조하는 닫힌 클러스터** — 내부 경로 무수정. 외부 소비자:
  - **src/extension.ts** (처음 등장 — `./ai/EmbeddingService` initEmbeddingPipeline)
  - ChatViewProvider (OfflineKnowledgeRetriever·OfflineResponder·OfflineTransplant)
  - ScaffoldContextBuilder (HybridRagEngine·ExternalCorpusLoader·OfflineKnowledgeRetriever)
  - LlmService (FallbackStubService — 6단계 후 위치 기준으로 수정)
  - intent/ 2파일 (`../EmbeddingService`·`../VectorMath` → `../retrieval/...` 재수정)
  - scripts 4곳: test-knowledge-routing, test-offline-answer, test-offline-intent, test-offline-transplant
- [ ] `git mv` 12파일 → src/ai/retrieval/
- [ ] ⚠ intent/ 쪽 재수정 + LlmService(당시 위치)의 FallbackStubService 경로 재수정
- [ ] import 경로 수정 (나머지 소비자)
- [ ] 게이트: tsc → compile → `test:knowledge-routing` → `test:offline-answer` → `test:offline-intent` → `test:offline-transplant` → `test:region-edit`(ScaffoldContextBuilder 경유 회귀 확인)
- [ ] retrieval/README 갱신 → 이 문서 갱신 → 리로드 확인 → 커밋

### 참고 — 6·7단계 후에도 src/ai/ 직하에 남는 파일 (미분류, 의도된 잔류)

ScaffoldContextBuilder.ts(84KB, 분해+설명서 걸침 → 8단계 분할 대상), ApiBindingRecipe.ts(조립 층 —
compose-binding 트랙), JsonTypeGenerator.ts, PackageVersionScanner.ts, config.ts, types.ts, templates/.
이들의 소속은 8단계(분할) 시점 또는 필요해질 때 결정한다.

### ⬜ 8단계 — (2단계 작업) 거대 파일 분할 — 전 폴더 이관 완료 후 별도 계획 수립

- [ ] ScaffoldContextBuilder: deps 추출부→decompose/, 프롬프트 조립·buildContractSection→contracts/
- [ ] RegionEdit: checkRegionRootTag→apply/
- [ ] StructuralAnchor: 게이트/적용 분리 검토
- [ ] ChatViewProvider 인라인 라우팅 → intent/ 단일 라우터 (⚠ 이건 라우팅 재설계 트랙 S2~와 합류 — 별도 진행)

## 6. 공통 작업 절차 (각 단계에서 반복 적용)

각 폴더 이관은 아래 절차를 그대로 반복한다:

1. 해당 폴더 README.md의 "이관 후보" 목록 확인.
2. 후보 파일 각각의 **소비자 전수 조사**:
   ripgrep으로 파일명 검색 (`src/`, `scripts/` 포함, glob `*.{ts,mjs,js,cjs}`) → import 라인만 추려 지도 작성.
3. `git mv <파일들> src/ai/<폴더>/`
4. import 경로 수정 3종:
   - 남은 형제(src/ai/*.ts): `'./X'` → `'./<폴더>/X'`
   - providers 등 상위: `'../ai/X'` → `'../ai/<폴더>/X'`
   - scripts: `'../src/ai/X'` → `'../src/ai/<폴더>/X'`
   - **옮겨진 파일이 남은 형제를 참조하는 경우**: `'./Y'` → `'../Y'` ← 놓치기 쉬움, tsc가 잡아줌
5. 게이트: `npx tsc --noEmit -p tsconfig.json` → `npm run compile` → 관련 테스트
   (region 계열 이동이면 `test:region-edit` 필수, 오프라인 계열이면 `test:offline-intent`·`test:offline-answer`,
   그 외 `test:knowledge-routing`, `test:api-binding`, `eval:region` 베이스라인 등 폴더 성격에 맞게)
6. 해당 폴더 README의 "이관 후보" → "구성 파일"로 갱신, 남은 부채는 "아직 여기 없는 것"에 기록.
7. 이 문서(§4 현황 표) 갱신.

### 폴더별 유의사항

- **decompose/**: 후보 = SectionExtractor, CodeSectionExtractor, FunctionSpotlight,
  RegionInputQuality, RegionIntent, EditorContextCollector.
  EditorContextCollector는 vscode API 의존 — 이동엔 문제없으나 테스트 스크립트에서 직접 import하는지 확인.
- **locate/**: RegionEdit.ts 하나지만 소비자가 많다(RegionEditService, scripts 다수 예상). 전수 조사 필수.
- **contracts/**: generated/ 폴더(빌드 산출물)도 함께 이동할지 결정 필요 —
  `scripts/build-component-props.mjs`의 **출력 경로 하드코딩** 확인할 것.
- **apply/**: StructuralAnchor.ts는 91KB 거대 파일이지만 통째 이동 자체는 가능(분할은 2단계).
- **pipeline/**: RegionEditService, FileCreatorService, LlmService, RegionCaptureRecorder.
  LlmService는 엄밀히 인프라라 나중에 llm/ 분리 검토 여지 있음(README에 기록됨).
- **retrieval/**: EmbeddingService·VectorMath 이동 시 **intent/ 쪽 `../EmbeddingService` 참조가 다시 깨진다**
  (§4.1). intent/IntentEmbeddingClassifier.ts, intent/IntentExampleStore.ts 수정 필요.

## 7. 관련 문서·메모리

- 전체 지도: [src/ai/README.md](../src/ai/README.md) + 각 폴더 README.md
- 흐름 도식: [docs/diagrams/](diagrams/) (00-도식지도 ~ 07-분해-로직)
- 의도 라우팅 재설계(별도 트랙): AXIOM_INTENT_ROUTING_REDESIGN.md, docs/page-creation-intent-routing-plan.md
- Claude 세션 메모리에도 동일 현황 기록됨 (project_src_ai_layer_folders.md) —
  단, PC 간 공유되는 진실은 **이 문서**다. 갱신은 여기 먼저.
