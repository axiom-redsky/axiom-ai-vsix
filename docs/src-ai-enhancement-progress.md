# src/ai 단계별 검증·고도화 — 진행 문서

> **이 문서의 용도**: 다른 PC에서도 이 작업을 이어서 진행할 수 있도록 목적·현황·다음 단계를 기록한다.
> 작업을 이어받는 세션(사람 또는 AI)은 이 문서를 먼저 읽을 것.
> 폴더 재편(선행 트랙, 완료)은 [src-ai-restructure-progress.md](src-ai-restructure-progress.md) 참고.
>
> 최종 갱신: 2026-07-16 (D3 stub 홍수 **완주** — 구현+합성 게이트+실 sLLM 라이브 게이트 PASS, 미커밋)
>
> **▶ 재개 지점: ② decompose D3 완료(커밋 대기) — 라이브 검증까지 전부 통과. 주입 13,120→3,519자
> (73% 절감), 실모델이 그룹 표식 보존+심볼 재선언 0+보존 타입 참조사용까지 확인(§4 ② D3 ④ 항목).
> 부산물: 가드 오거부 수정(관찰 2호)·라이브 관찰 3건 기록. 다음 후보 = ② 레버2(모호쿼리)/레버3/
> 무신호 폴백 예산 캡(관찰 1호) 또는 층 순서대로 ③ locate 착수. 커밋은 사용자 결정.**
> ① intent 층은 채집 가동 중: 테스트 페이지 + 출력채널 `[S1 라우팅측정]`·`[파일검출]` 로그로 불일치·오탐 수집.
>
> **다른 PC 재개 시 알아야 할 것 (2026-07-15 세션의 도구·환경 유산):**
> - **라이브 프로브** `scripts/probe-region-live.ts`(+run-probe-region-live.mjs): 실모델로 region
>   파이프라인 단독 구동+원시 프롬프트/응답/finalText 덤프. **운영 조건 복제 스위치** —
>   `AXIOM_NATIVE=1`(ollama 네이티브·num_ctx 32768·think:false) · `AXIOM_ANCHOR_FIRST=1`(운영 기본 ON) ·
>   `AXIOM_DISAMBIG=1`(후보1 강제). ⚠ 교훈: **라이브 재현은 운영 플래그까지 복제**(기본값 차이로
>   원인을 이틀 놓칠 뻔함). 인증: `AXIOM_API_KEY="Bearer <토큰>"` — 토큰은 vast 셋업 문서/런처 설정
>   패널의 API 키 값(서버 40242는 Caddy Basic벽, `vastai:<토큰>` 또는 Bearer 통과).
> - **분해 프로브** `scripts/probe-decompose-bigfile.ts`(테스트 페이지와 동일 함수 CLI) ·
>   `scripts/probe-slice-size-match.ts`(토큰바 "현재 파일 N자"로 설치본 코드 버전 원격 판별 —
>   슬라이스+sliceNotice 합 대조).
> - **픽스처**: `scripts/sample-bigfile.tsx`(표준 합성 10,574줄) · 데모 실파일
>   `C:\redsky\presentation\demo\react-app-online-demo\src\domains\example\pages\BigFile.tsx`
>   (11,177줄 — prettier 포맷팅으로 표준과 줄번호 다름 주의). 재생성: `node scripts/write-bigfile-sample.mjs <경로>`.
> - **⚠ 데모 검증 함정**: 데모 VSCode는 설치형 VSIX — 코드 수정 후엔 `npm run package` →
>   `code --install-extension axiom-ai-0.1.0.vsix --force` → **Reload Window**까지 해야 반영.
> 채집 1호(억제 후 ④재낚아챔)·2호(출력채널 오탐, 수정 완료)·3호(파일 지향 질문 가로채기, 관찰)
> 기록됨 — §4 ① "수집된 대상해석 패턴" 참조. S3④·S4·S5는 채집 데이터 게이트(착수 기준 미정).
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
| ① | intent/ — 의도 라우팅 | ✅ **일단락(채집 가동 중)** — 도구·검증·계측·1차 수정(채집 2호) 완료. 잔여(S3④·S4·S5·대상해석 고도화)는 전부 채집 데이터 게이트 |
| ② | decompose/ — 분해 | 🔶 **D1·D2 커밋 + D3 완주(2026-07-16, 미커밋)** — b′ 스켈레톤 그룹 표식(73% 절감), 복원 3곳+생존 가드, code-slice 26/0, **실 sLLM 라이브 게이트 PASS(표식 보존·재선언 0·복원 왕복 ✅)**. 잔여=레버2·레버3·D4·무신호 예산 캡(전부 후순위) |
| ③ | locate/ — 위치찾기 | ⬜ |
| ④ | contracts/ — 설명서 삽입 | ⬜ |
| ⑤ | apply/ — 게이트·적용 | 🔶 **실사용 버그 2건 선수정·커밋 완료** — ①페치 파생 재선언 교체 채널 ②anchor-first 퇴화 자동 재시도(BigFile 반쪽 편집 근본 수정 2건, **실기기 사용자 검증 applied ✅ + Stage 0 타입검증 첫 라이브 통과**, 2026-07-15). 원칙 §2-2 "급한 버그 예외" 적용 |
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

- [x] **테스트 도구 구축 (2026-07-14, 커밋 e01ad5e)** — "단계별 테스트" 사이드바(트리 목록, 1~5단계) +
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
- [x] **"🎯 해석된 대상 파일" 카드 추가 (2026-07-14, 미커밋)** — 후보 작업(대상 파일 해석 고도화)의
  **계기판 확보(0단계)**. 최종 채택이 modify_file이면 운영 `_resolveTargetFile` 결정 사슬
  (①cross-file 재타겟→②줄선택→③파일명 명시→④단서 추출→⑤모순없음→⑥되묻기)을 **드라이런 미러**로
  실행해 규칙별 발화 추적+최종 판정(cross-file 전환/현재파일/되묻기)을 표시. 이력 테이블에 "대상" 열.
  outcome=❓되묻기(빈손)가 후보 수집기가 채울 지점의 실측 빈도 데이터가 된다.
  - 미러 범위: `_probeTargetResolve`(+`_probeCrossFile`·`_probeExtractOtherFileRef`·
    `_probeResolveModuleToUri`) — ⚠ ChatViewProvider 쪽 규칙 변경 시 동기화(운영 코드에 경고 주석 추가)
  - 게이트: tsc(ext/webview) 0 · compile OK · offline-intent 66/0 · region-edit 230/0
- [x] **"열린 파일 가져오기" 무반응 수정 (2026-07-14, 미커밋)** — 리로드 확인 중 발견(체크리스트 1·2 통과,
  3에서 발견). 원인=패널이 활성 탭이면 activeTextEditor가 비고, **같은 그룹의 파일 탭**은 보이는 에디터도
  그룹 활성탭도 아니라 폴백 3단계 전부 빈손(modify→create leak과 동일 함정). 수정=폴백 ④ 패널 생성 직전
  활성 파일 시드+onDidChangeActiveTextEditor 추적 · ⑤ 전 그룹 텍스트 탭(비활성 포함) 스캔.
  게이트: tsc 0 · compile OK
- [x] **파일검출 계측 + stale 가드 (2026-07-14, 미커밋)** — "현재 페이지 오판 다발" 이력 대응,
  CC 벤치마킹 항목 중 intent 소관 2건(힌트+신뢰도·소리나게)의 첫 단추. 운영 라우팅 무변경.
  - EditorContextCollector: `EditorContext.detectSource` 신설(override/active-editor/active-tab/
    last-editor/visible-tsx/visible-file — 검출 신뢰도 신호, 향후 S4 되묻기 차등의 재료) +
    **_lastEditor 닫힌 문서 가드**(isClosed면 폐기 — 닫힌 파일을 현재 페이지로 잡던 오탐 차단) +
    **scheme=file 가드**(활성 에디터·_lastEditor 추적 — 출력 채널 문서 오탐 차단, 채집 2호 즉시 수정)
  - ChatViewProvider: `_logFileDetection` — 주 진입점 2곳에서 `[Axiom AI][파일검출] 출처=… → 경로`
    출력 채널 기록(S1 라우팅측정과 동일 취지 비파괴 계측). 오탐 발생 시 범인 폴백 특정 가능해짐
  - 게이트: tsc 0 · compile OK · region-edit 230/0 · offline-intent 66/0 · **리로드 실측 확인됨**
    (로그 정상 출력 + 첫 실사용에서 채집 2호 오탐 즉시 포착 → 수정)
  - 보류(데이터 게이트): 신뢰도 기반 확정/되묻기 차등(S4), 폴백 사슬 재정렬·뒷탭 스캔 이식
- [x] **의도 라우팅 로직 흐름도 작성 (2026-07-14)** — [src/ai/intent/intent-flow.svg](../src/ai/intent/intent-flow.svg)
  (판정→라우트 결정→대상 파일 해석 ①~⑥ 사슬+계기판, docs/diagrams 스타일. README에 링크)
- [x] **리로드 실사용 확인 완료(2026-07-14, 온라인 6 + 오프라인 3)** — 사용자 커밋 완료
  - 온라인: smalltalk 해당없음 / 빈손 되묻기 / 열린파일 가져오기(수정 후 정상) / ②줄선택 확정 /
    ①cross-file 전환("StatusBadge"→import 따라 StatusEmployBadge.tsx, 동명 StatusBadge.tsx가 별도
    존재하는데도 import 경로=진실원 검증) / ①use-as 억제("SmartTable로 적용"+EmployeeListPage2 →
    억제 발화, shared 재작성 재발 없음 — cross-file-retarget 라이브 검증 해소)
  - 오프라인(서버 끊김): ℹ️ 배너+출처=정규식 채택 표시 정상 / 모델 없이 🎯 ⑤현재파일 확정 /
    **cross-file 폴백 검증** — ① 출처 "(정규식+import 그라운딩)"으로 온라인과 동일한
    StatusEmployBadge.tsx 전환(모델 死에도 라우팅 결론 보존). 억제 오프라인 조합은 구성요소
    각각 검증돼 생략(폴백=오프라인 7-3, 억제=결정론·온라인 6-A)
- [ ] 테스트 페이지 + 실사용 S1 로그로 `⚠ 불일치` 패턴 수집 → 아래에 기록
- [ ] 수집된 패턴 분류 → 데이터가 가리키는 지점만 S5 착수

**후보 작업 — 대상 파일 해석 고도화 (2026-07-14 방향 합의 · 2026-07-15 계획서 확정, 착수 전)**

> 📋 상세 계획: [추후작업계획일꺼리.md](추후작업계획일꺼리.md) 항목 1 (3단계 접근·후보 소스·create/modify 분기)

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

- (의도 불일치는 아직 없음 — 온라인 테스트 6회 전부 모델=정규식 일치)

**수집된 대상해석 패턴** (🎯 카드 관찰 — 대상 파일 해석 고도화의 입력 데이터)

- **[채집 1호] 억제 후 재낚아챔 (2026-07-14)**: "SmartTable로 적용해줘"(선택영역 없음)에서 ①use-as
  억제로 cross-file은 막았으나, ④`_extractOtherFileRef`의 접미사 정규식(Table)이 SmartTable을
  다른파일 단서로 다시 잡아 ⑥ QuickPick 되묻기로 감 — 현재 파일 직행이 자연스러운 상황에서 되묻기
  1회 낭비. 선택영역 있으면 ②에서 정상 확정. 후보 수집기 설계 시 "억제된 이름은 ④에서 제외" 검토.
- 슬롯 참고: 파일 없는 상황에서 모델이 targetFile=current를 내는 경향(정규식은 null) — 불일치
  배너까진 아니고 슬롯 차이 노트로만 관찰됨(3회).
- **[채집 2호] 출력 채널 문서가 현재 파일로 오탐 (2026-07-14, 수정 완료)**: `[파일검출]` 계측 첫
  실사용에서 즉시 포착 — `출처=active-editor → extension-output-…: Corpus`. 출력 패널에 포커스를
  두면 로그 문서가 activeTextEditor로 들어오는데, 폴백 사슬 중 첫 단계만 scheme=file 무검사였던
  비대칭이 원인("현재 페이지 오판 다발"의 범인 1). **수정**: 활성 에디터 scheme=file 가드 +
  _lastEditor 추적도 file만(오염 차단). tsc 0·compile OK·region-edit 230/0·offline-intent 66/0.
- **[채집 3호] 파일 지향 질문을 일반 지식 렌더가 가로챔 (2026-07-14, 관찰만)**: "현재 파일에서
  버튼이 몇 개 있어?" → qna(weak) → 온라인 지식 가이드가 Button 문서 전문 렌더 + LLM 합성 생략.
  질문이 **현재 파일의 내용**을 묻는데 응답은 일반 Button 사용법 — 확신 게이트(문서 3개 매칭)가
  파일-컨텍스트 질문을 구분하지 못함. 후보 처방: "현재 파일/이 파일" 토큰이면 문서 전문 렌더
  게이트를 양보하고 LLM(파일 컨텍스트 포함) 경로로. ⑦retrieval/qna 게이팅 소관 — 데이터 더 모아 판단.


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

### ② decompose/ — 분해 🔶

**작업 로그**

- [x] **흐름도 SVG + "2. 분해 테스트" 페이지 (2026-07-15, 미커밋)** — intent와 동일하게 이 층의
  **계기판 확보(0단계, 개선 착수 전 측정 도구)**. 사용자 목적 = "decompose 개선점 파악 + 내용 이해".
  - 흐름도: [src/ai/decompose/decompose-flow.svg](../src/ai/decompose/decompose-flow.svg) — 2갈래
    (쿼리 분해 tokenizeQuery·extractApiPaths·impliedControlTags / 코드 분해 splitTsSections→
    scoreCodeSections→sliceByBudget) + 산출물(재료) + 측정(RegionInputQuality) + 계기판. README 링크.
  - 테스트 페이지: `axiom-ai.stageTestPanel` → 2단계 클릭 → 에디터 탭. 프롬프트(+현재 파일)를 넣으면
    ① 토큰 칩(조사 어근 파랑 강조)·정확 경로·컨트롤 태그 · ② 섹션 표(kind·라인·글자·**점수**·포함여부)
    + 예산 슬라이싱 dietRatio·stub 전문. **다이어트 >90%+섹션 다수 → deps 폭주 경고 자동 표면화**.
  - ★ **intent 패널과 결정적 차이**: decompose 폴더 함수는 전부 `export`된 순수 함수라 **직접 호출**
    (운영 미러 아님 → 동기화 드리프트 0). 화면 결과 = 실제 운영 산출물 그대로.
  - 파일: src/providers/DecomposeProbePanel.ts · src/webview/decomposeProbe/DecomposeProbeApp.tsx
    (+messages.ts 타입·index.tsx·extension.ts stageNo===2·StageTestPanelProvider ready·webview.css dp-*)
  - 게이트: tsc(ext/webview) 0 · compile OK · region-edit 230/0 · offline-intent 66/0. **리로드 실측 대기**.
- [x] **참조 .ts/.tsx 앞잘림 → 관련 섹션 슬라이스 (2026-07-15, 미커밋)** — 사용자 Q3 지적:
  `_loadReferencedFiles`가 큰 마크다운은 섹션 추출하면서 **큰 코드 파일(.ts/.tsx/.js/.jsx)은 앞부분만
  뚝 잘라**(content.slice(0,budget)) 파일 끝의 원하는 선언(타입·함수)을 통째로 날리던 비대칭.
  수정: 현재 파일과 **동일한 결정론 함수** `extractRelevantTsSlice`(선언 분할→쿼리 점수→예산, 나머지
  stub)로 관련 조각만 남김 — 마크다운 섹션 추출과 대칭. 위험 0(기존 검증 함수 재사용·별도 경로인
  content-port는 미변경). [ChatViewProvider.ts:552 근처]. 게이트: tsc 0·compile OK·region-edit 230/0·
  **api-binding 69/0·offline-transplant 22/0**(참조 경로 인접 기능 무회귀). 리로드 실측 대기.
  - **+테스트 페이지·SVG 반영 (2026-07-15)**: "2. 분해 테스트" 페이지에 **참조 파일 입력 + 슬라이싱
    카드** 추가 — 코드 참조는 관련 섹션 슬라이스 결과 + **"앞잘림이었으면 잃었을 조각"(컷오프 뒤 포함
    섹션)을 초록 수치로 대조**(Q3 효과 가시화), md 참조는 선택 섹션 헤더. 전부 순수 함수 직접 호출
    (extractRelevantTsSlice·splitIntoSections/scoreSections/selectByBudget). SVG 입력 박스에 "참조 파일
    (@경로)" + 계기판 띠에 ③ 참조 슬라이싱 줄 추가. 게이트: tsc 0·compile OK·region-edit 230/0·
    offline-intent 66/0. (messages.ts refPath·DecomposeReference · DecomposeProbePanel._buildReference ·
    DecomposeProbeApp ReferenceCard · webview.css dp-win)
  - **+예산 누수 가드 (2026-07-15, 사용자 지적)**: `sliceByBudget`의 stub 자리표시자는 글자 예산 **밖**에서
    붙어(예산은 포함 본문만 셈), 선언 많은 참조 파일이면 파일당 상한(8000자)을 초과할 소지. stub은
    **편집 대상**에서만 안전장치이고 **읽기 전용 참조 파일**엔 순수 토큰 낭비 → 신규 순수함수
    `stripSliceStubs`(stub 줄 제거+"관련 낮은 N개 생략" 요약 한 줄)로 접어 주입을 예산 이하로 되돌림.
    운영(`_loadReferencedFiles` 코드 참조 분기)+테스트 페이지(실제 주입 글자 수 표시) 양쪽 적용. 자가검증:
    204자(stub 2줄)→96자, 본문 보존·stub 0. 게이트: tsc 0·compile OK·region-edit 230/0·api-binding 69/0·
    offline-transplant 22/0·line-edits 15/0.
- [x] **bigfile 실측 (2026-07-15)** — `write-bigfile-sample.mjs`로 합성 god component(10,574줄/383K자/
  195섹션) 생성, 테스트 페이지와 동일한 순수 함수를 직접 실행(`scripts/probe-decompose-bigfile.ts`,
  쿼리 "직원관리의 상태 select를 api로 바꿔줘" × 예산 4000자). **두 갈래 발견**:
  - **정정: region 경로의 deps 폭주(원래 레버1)는 이미 수정 완료돼 있었다** — RegionEdit.ts의
    depsHeader 가지치기(커밋 53cfc82 "위치 단계 작업내용 완료"). eval:bigfile green(64/64 적중,
    depsHeader 평균 ~1K자, 타입출하 ~1%). 이 카드의 "개선 후보: 레버1"은 낡은 정보였음.
  - **진짜 결함 = full/참조 경로 공용 슬라이서**(`sliceByBudget`/`scoreCodeSections` —
    ScaffoldContextBuilder full 모드 현재파일 + _loadReferencedFiles 참조파일, 전용 테스트 0):
    포함 80섹션 **전부 노이즈**(`api` 토큰이 64개 `*_ENDPOINT` 값 `'/api/…'`에 매칭돼 전원 동점
    +1 → 동점·최단 우선 정렬이 한 줄 덤프 선적 + score=0 type이 잔여 예산 필러) · 정작 관련 본문
    (364K자 단일 함수)은 통째 stub.
- [x] **1차 수정: D1 흔한 토큰 가드 + D2 score=0 필러 가드 (2026-07-15, 미커밋)** —
  CodeSectionExtractor 순수 함수 2곳, 결정론·모델 무관.
  - D1 `scoreCodeSections`: body 매칭 섹션 수가 **max(3, 전체의 20%)** 초과인 토큰은 변별력 없음
    → body 가점 제외(이름 매칭 +5는 유지). 섹션 8개 미만 파일은 가드 OFF(종전 보존).
    ※ 처음 "전체 60%" 기준은 실측 검산에서 미발동(65/195=33%) — 실측 수치로 임계 보정.
  - D2 `sliceByBudget`: overflow + **쿼리 신호**(imports 고정 +2 제외한 유점수 섹션) 존재 시
    score=0 섹션으로 잔여 예산을 채우지 않음. 쿼리 신호 0이면 종전 폴백(최단 우선) 유지.
    ※ 재테스트 중 발견·보정: imports의 무조건 +2가 "유점수 존재"로 잡혀 무매칭 쿼리에서도
    가드가 오발(폴백 사망) — 가드 판정에서 imports 고정 가점 제외(`hasQuerySignal`).
  - 효과(동일 probe 재실행, 쿼리 3종 검증): "직원관리 select…" 포함 80(전부 노이즈)→**1(imports)** /
    "EMPLOYEE_ENDPOINT 수정" → **2(imports+해당 상수만, 형제 63개 차단)** / 무관 문장 → 80(종전 폴백).
  - **신규 전용 안전망 `test:code-slice`(15/0)** — 이 경로의 첫 회귀 게이트(D1·D2 + 종전 동작
    4종 + 폴백 오발 + stub 복원 계약 고정). scripts/test-code-slice.ts · run-test-code-slice.mjs.
  - 게이트: tsc 0 · compile OK · code-slice 14/0 · region-edit 230/0 · api-binding 69/0 ·
    offline-transplant 22/0 · patch-grounded 30/0 · eval:input 베이스라인 동일 · eval:bigfile
    64/64 유지(region 경로 무영향 — 자체 가지치기 사용). 리로드 실측(테스트 페이지 확인) 대기.
- [x] **D3 stub 홍수 — b′ 스켈레톤+c 인접 조합 구현 (2026-07-16, 미커밋)** — 합성 게이트 전부 green,
  **남은 것 = ④ 실 sLLM 라이브 게이트**.
  - **베이스라인(착수 ①)**: sample-bigfile(10,574줄)×예산 4000 → stub 194줄 = **12,684자(주입의 96.7%)**,
    본문 436자뿐. 데모 실파일(BigFile.tsx 11,177줄)도 동일 패턴.
  - **설계(착수 ②)**: 복원 계약(restoreSlicedStubs·resolveStubSection·Pass 0) 열어본 뒤 b′ 확정.
    `sliceByBudget`이 **연속 제외 런 ≥3개**를 그룹 표식 한 줄로 뭉침:
    `// ... [보존 Ls~Le] 원본 NN줄(kind 요약) 보존 (자리 표시자…재선언 금지): 심볼이름목록`.
    포함 섹션과 **인접한** 제외 섹션은 개별 stub 유지(c 조합). `SliceResult.groupedRanges` 신설.
    복원·생존검사는 **프리픽스 `[보존 Ls~Le]`만 매칭** — 모델이 이름 꼬리를 잘라도 복원 생존.
    한글 `보존`은 기존 정규식 `[a-zA-Z]+`와 충돌 0(구 포맷 오인 불가).
  - **복원 계약 3곳 확장**: ① restoreSlicedStubs 그룹 브랜치(원본 라인범위 통째 복원, `{/* */}` 변형
    수용, 경계 밖은 unmatched 보존) ② resolveStubSection 그룹 브랜치(라인범위→FuzzyRegion, 섹션 탐색
    불필요) ③ FileCreatorService Pass 0 그룹 브랜치(search=표식 → 라인범위 영역).
  - **표식 전수 생존 검사 가드(합의 사항)**: ScaffoldContextBuilder가 슬라이싱 시 표식 목록 스태시
    (`lastSliceGroupGuard`, 매 빌드 초기화) → ChatViewProvider 적용 길목(restore 직전)에서 full 계열
    응답에 표식이 하나라도 없으면 **적용 거부**(⛔ 카드+실패 리포트). structural은 확장이 원본에
    병합해 표식 없는 게 정상 → 제외. 파일 불일치 시 fail-open+로그.
  - **역판정 2곳 수정**: DecomposeProbePanel·probe-decompose-bigfile — 개별 stub 부재+groupedRanges
    범위 포함으로 판정. sliceNotice(모델 대면)에 그룹 표식 설명+"하나라도 빠지면 적용 거부" 추가,
    probe-sliced-output·SliceProbeProvider stubNote도 동기화.
  - **효과(착수 ① 대비)**: 주입 **13,120→3,519자(73% 절감)**, stub 194줄→표식 2줄(+인접 개별 2~3).
    남은 3.3K자는 심볼 이름 목록 = 재선언 방지 비용(b의 이름 소실 약점 해소 대가). 라이브 예측:
    full 폴백 시 "현재 파일 13,699자(58%)" → **~3.5K자(~15%)**.
  - **게이트(착수 ③)**: tsc 0 · compile OK · **code-slice 26/0(D3 케이스 11 신규: 그룹핑·인접 개별·
    round-trip·꼬리잘림 복원·경계밖 보존·짧은런 종전동작)** · **patch-grounded 32/0(그룹 resolve 2
    신규)** · region-edit 237/0 · api-binding 69/0 · offline-transplant 22/0 · line-edits 15/0 ·
    eval:bigfile 종전 동일(region 무영향) · eval:input 동일. VSIX 재패키징 완료.
  - **변경 파일(11, 커밋 대기)**: src/ai/decompose/CodeSectionExtractor.ts(그룹핑+복원 그룹 브랜치+
    groupedRanges) · src/ai/pipeline/FileCreatorService.ts(resolveStubSection·Pass 0 그룹) ·
    src/ai/ScaffoldContextBuilder.ts(sliceNotice 그룹 안내+lastSliceGroupGuard 스태시/clear) ·
    src/providers/ChatViewProvider.ts(생존 가드+`!precomputedDiff`+요청 단위 clear) ·
    src/providers/DecomposeProbePanel.ts·scripts/probe-decompose-bigfile.ts(역판정) ·
    src/providers/SliceProbeProvider.ts·scripts/probe-sliced-output.ts(모델 대면 stubNote) ·
    scripts/test-code-slice.ts(+11)·scripts/test-patch-grounded.ts(+2) · 이 문서.
  - [x] **④ 실 sLLM 라이브 게이트 ✅ PASS (2026-07-16, qwen3-coder-64k × 데모 BigFile.tsx 388K자)**:
    `probe-sliced-output --mode sliced`(운영 모델·실파일·신규추가 쿼리, 인증=Bearer vast 토큰) →
    모델 full 출력을 `restoreSlicedStubs` 왕복 검증 10항목 전부 green —
    ① 그룹 표식(L22~L11177·심볼 193개) **원문 그대로 제자리 생존** ② 개별 stub 생존
    ③ 보존 심볼 재선언 0 ④ 보존 타입를 **참조로만 사용**(`TEmployeeRow[]` 파라미터 — 스켈레톤
    설계 의도 그대로) ⑤ 복원 2/2·unmatched 0 ⑥ 라인 11,178→11,207(신규 함수만 증가)
    ⑦ MegaDashboardPage 본문 생존 ⑧ 신규 함수 생존 ⑨ 표식 잔존 0
    ⑩ 유일 관찰: 모델이 가짜 stub 1줄 창작(`[기존 컴포넌트 로직]` — 어느 정규식에도 안 걸려
    **무해한 주석으로 잔존**, 파손 없음). ⚠ 부가 발견: 프로브가 OpenAI 경로(/v1)만 지원해
    Caddy 401 — vast 토큰을 Bearer로 넘기면 통과(`AXIOM_API_KEY="Bearer <OPEN_BUTTON_TOKEN>"`,
    운영 확장은 SecretStorage `axiom-ai.llm.apiKey`에 보관되어 설정 json엔 안 보임).
    ⚠ **쿼리에 파일과 매칭되는 신호 토큰이 있어야 D3가 발동**한다 — 라이브 관찰 1호 참조.
    잔여 관찰 항목(비차단): 필드 환각(모델이 TEmployeeRow 필드를 추측 — 보존 구간 본문을 못 보는
    D4 소관) · 실기기 채팅에서의 가드/복원 end-to-end는 full 폴백이 유기적으로 뜰 때 자연 관찰.
  - **라이브 관찰 1호(2026-07-16, D3 미발동 케이스)**: "이 파일의 정렬 로직을 리팩토링해줘" ×
    BigFile.tsx → 토큰바 "현재 파일 18,304자(67%)". 원인 재현 완료: 쿼리 토큰(정렬·로직·리팩토링)이
    파일과 0매칭 → 유점수 0 → **D2가 보존한 종전 무신호 폴백**(최단 우선)이 적응형 예산(~17.7K)을
    무관 한 줄 선언들로 가득 채움(17,690+안내문=18,304 정확 일치, 그룹 0). D3 결함이 아니라 설계대로
    (무신호는 종전 동작 보존)이나, **무신호 쿼리 + 큰 파일 + 적응형 예산 = 컨텍스트 67% 점유**는
    별도 개선 후보(무신호 폴백 예산 캡? 데이터 더 모아 판단). +당시 대화 이력 과다로 잔여 484토큰
    (응답 절단 위험)이었음 — 라이브 테스트는 대화 초기화 후 권장.
  - **라이브 관찰 2호(2026-07-16, 가드 오거부 위험 발견·수정)**: 신호 쿼리("직원관리 목록 정렬…
    리팩토링") × BigFile.tsx가 **region 경로로 완주**(disambiguation 후보 3→모델 pick "직원관리"
    1837~1900·splice 적용·타입검증 통과·5,382토큰 22% — 제품으로선 최선, D3는 미검증). 이 로그에서
    가드 결함 발견: region 합성 action도 `mode:"full"`로 `_handleAxiomAction`을 지나는데 합성은
    원본 디스크 기반이라 표식이 없는 게 정상 → 직전 요청의 슬라이싱 스태시가 남아 있으면 **오거부**.
    수정 2중: ① 가드 조건에 `!precomputedDiff`(region 합성 식별) ② 매 사용자 요청 시작 시
    `clearSliceGroupGuard()`(요청 간 누수 원천 차단). 게이트: tsc 0·region-edit 237/0·code-slice
    26/0·compile·VSIX 재패키징. **교훈: 신호 쿼리는 region이 잘 처리해서 full+D3를 organic하게
    태우기 어렵다** — 라이브 게이트는 (i) 신규추가 의도+도메인어 쿼리(예: "직원관리 데이터를
    내보내는 공통 유틸 함수를 이 파일에 새로 추가해줘" — 사전 검증: 주입 3,531자·그룹 1, add
    의도=full 정당) 또는 (ii) `probe-sliced-output` CLI(결정론 강제)로.
  - **라이브 관찰 3호(2026-07-16)**: 위 (i) 신규추가 쿼리마저 **region이 완주** — disambiguation
    후보 6→"직원관리" pick, handleExport CSV 유틸을 훅 삽입 채널(after-last-fetch)로 정확 안착,
    import skip(이미 존재)·타입검증 통과·4,957토큰(20%). 2026-07-15 수정들 이후 신호 있는 쿼리는
    region이 사실상 전부 처리(제품 관점 최선). **결론: full+신호 조합은 유기적으로 거의 안 생김 →
    D3 라이브 게이트는 `probe-sliced-output` CLI로 강제 검증**(프로브가 VSCode 설정에서
    endpoint/model 자동 판독).
- 참고(문제정의·설계 논의 이력, 구현 반영 완료): D2로 제외가 늘며 stub 194줄(~12.9K자)이 주입의
  98%·라이브 컨텍스트 58%를 점유(2026-07-15 실증) → 2026-07-16 설계 논의에서 b′(그룹 라인범위+
  압축 심볼 목록으로 이름 소실 해소)+c(인접 개별 유지)+표식 제자리+전수 생존 가드로 합의 →
  위 작업 로그대로 구현. 폐기 대안: (a) 꼬리 축약(절감 ~50%뿐) / (b) 단순 그룹핑(이름 소실로
  복원 후 중복 선언 위험).
- [ ] (후순위) D4 거대 함수 하위 분할 — 단일 함수가 예산 초과면 통째 stub돼 관련 본문 소실.
  단, 큰 파일 편집의 주력은 region 경로(이미 green)라 실피해 낮음. RegionEdit의 훅 슬라이스·
  타입 전이참조 기계를 full 경로로 이식하는 방향(착수 시 별도 설계).
- **후보(사용자 Q1, 2026-07-15 논의)**: 관련 파일 자동 탐색 부재 — "getArr 만들어줘"처럼 현재 파일에
  없는 심볼을 워크스페이스에서 뒤져 후보를 대는 로직이 없음. 처방=**결정론 후보 수집(심볼 정의·사용처
  검색+import 이웃+열린 탭)+모델 객관식 1회**. CC는 강한 모델의 도구 반복 루프지만 약한 sLLM엔 금지 —
  이건 ①intent §4의 "대상 파일 해석 고도화"와 동일 작업(그 트랙에서 착수). 여기엔 포인터만 기록.

- **계기판**: `eval:input`(입력 품질) · `eval:bigfile`(큰파일 합성 하니스) · **`test:code-slice`(26 —
  full/참조 경로 슬라이서 전용, D3 케이스 11 포함)** · region-edit(간접) · **"2. 분해 테스트" 페이지
  (수동 관측)** · `scripts/probe-decompose-bigfile.ts`(테스트 페이지와 동일 함수 CLI 실행) ·
  `scripts/probe-sliced-output.ts`(sliced/full A/B 실모델 원시 출력 — D3 라이브 게이트용)
- **개선 후보**: ~~bigfile 레버1 = deps 가지치기~~ → **2026-07-15 실측 정정: region 경로는 이미
  구현 완료(53cfc82)·green, full/참조 경로 결함은 D1·D2로 수정**. ~~D3 stub 홍수~~ →
  **2026-07-16 구현 완료(라이브 게이트만 잔여)**. 남은 것 = 레버2(모호쿼리 — eval:bigfile ②에서
  64후보 되물음 실측됨, locate/pipeline과 걸침) · 레버3(섹션라우팅 복합어 토큰화 top-bias) ·
  D4(거대 함수 하위 분할, 후순위).
- **신규 후보(2026-07-16, 중기): 의미론 연관성 — tsserver/LSP** — 섹션 스코어링(토큰 문자열
  매칭)을 컴파일러의 정의·참조 그래프로 교체. D1류 오탐("api" 토큰이 64개 `'/api/…'` 상수에
  동점)의 뿌리 제거 — 글자가 같아도 참조 관계 없으면 무관 판정. VSCode `executeDefinitionProvider`/
  `executeReferenceProvider`(언어 중립 명령, JS도 동일 엔진) 또는 독립 tsserver 프로세스.
  ⚠ 설계 원칙: **코어에는 인터페이스 뒤로**(SemanticIndex 류) — 편집기 중립(IntelliJ=PSI,
  헤드리스=독립 tsserver) 유지. ③locate 스코어링과 걸침(③ 카드에도 기록). D3 뒤 순서대로.
- **참고**: 메모리 project_bigfile_eval_harness, project_endpoint_disambiguation_gap(레버 B 미구현)

### ③ locate/ — 위치찾기 ⬜

- **계기판**: `eval:region` 85%(35/41) · `eval:disambig`(+record) · test:region-edit
- **개선 후보**: 앵커 계약 주력화·locate 축소(verify-correct 루프 Stage 0 트랙의 후속 방향),
  region disambiguation 모델 객관식 — **라이브 1건 성공(2026-07-15, qwen3-coder-64k × 합성
  10k파일): "직원관리의 상태 select" → 후보 6개 중 모델이 "1"(직원관리 1843~1860) 정확 선택**.
  (그 후 region no-op→full 폴백은 "정적 배열→api" 기지 한계로 정당 — disambiguation 자체는 ✓)
  · **의미론 연관성(tsserver/LSP, 2026-07-16 신규)** — locate 스코어링(흔한 토큰 오탐 → text-anchor
  override 같은 두더지)에도 정의·참조 그래프 적용. 상세는 ② 카드 신규 후보 항목(공용 설계).
- **참고**: 메모리 project_verify_correct_loop_stage0, project_region_disambiguation,
  project_locate_text_anchor

### ④ contracts/ — 설명서 삽입 ⬜

- **계기판**: test:region-edit(계약카드 케이스들) · `test:api-binding`(69) · eval:region 토큰절감 지표
- **개선 후보**: 계약카드 커버리지 확장(현재 11카드), 봉투계약 실 sLLM 검증(compose-binding Phase B),
  ComponentPropsIndex 재생성 자동화 검토
- **참고**: 메모리 project_scaffold_contract_coverage, project_compose_binding_recipe,
  project_recipe_contract_cards

### ⑤ apply/ — 게이트·적용 🔶

**작업 로그**

- [x] **페치 파생 재선언 in-place 교체 채널 (2026-07-15, 미커밋)** — BigFile.tsx(11K줄 데모)
  라이브 채집 "직원관리 상태 select를 api로" 반쪽 편집의 근본 수정. 원인 사슬(전부 결정론 재현으로
  격리, `scripts/probe-region-live.ts` = 실모델 라이브 프로브 신설): 모델 출력은 **완벽**
  (새 useApi 페치 + 같은 이름 파생 재선언 `const X = resp?.data ?? []` + JSX 무변경 — 기존 이름
  재사용 전략)인데, 기존 **멀티라인 정적 배열**(컴포넌트 스코프)을 교체할 채널이 없어 중복 드롭 →
  페치 고아(dead-binding) → full 폴백 → (D3 stub 장님) 훅만 삽입되는 반쪽 편집. 6월 5일
  "정당 폴백"으로 기록했던 그 간극(메모리 bigfile 중복선언 게이트 절).
  - 수정: `extractComponentReplacements`에 예외 채널 — 새 RHS가 **같은 조각의 신규 페치 훅 바인딩을
    참조**할 때만 멀티라인 정적 배열을 [페치+파생]으로 in-place 대체(**페치 동반 이동 = TDZ 안전**).
    무손실 가드는 배열 리터럴 재선언에 종전 그대로(이중 조건이 손실 환각과 구조적으로 구분).
  - **라이브 검증 ✅**: probe-region-live 재실행 → status **applied**, 페치+파생이 직원 훅 구역
    정확 안착·타입 모듈 스코프·중복 0·프롬프트 3.6K토큰(full 폴백 없이 region 완주).
  - 게이트: tsc 0 · compile OK · **region-edit 237/0(신규 7: 페치파생 적용 5 + 가드 2)** ·
    patch-grounded 30/0 · line-edits 15/0 · react-rules 39/0 · api-binding 69/0 · eval:region 회귀 없음.
  - 부수 확보: **probe-region-live**(실모델로 region 파이프라인 단독 구동+원시 프롬프트/응답/finalText
    덤프, `AXIOM_NATIVE=1`=운영 동일 ollama 네이티브 호출 · `AXIOM_ANCHOR_FIRST=1`·`AXIOM_DISAMBIG=1`=
    운영 조건 재현) — ⑤층 라이브 계기판. 인증은 `AXIOM_API_KEY`(vast Caddy Basic 또는 Bearer 토큰).
- [x] **anchor-first 퇴화 자동 재시도 (2026-07-15, 미커밋)** — 위 수정 후에도 실기기 채팅은 여전히
  no-op → 원인 2호 격리: 프로브는 anchorFirst=false 기본값으로 돌았는데 **운영 기본은 ON**(2026-06-30
  승격). anchor-first 지침("작은 국소 수정은 기존 코드 인용 `<replace>`")을 약한 모델이 **훅 추가가
  필요한 구조 편집에까지 과적용** → 원본과 동일한 JSX만 `<replace>`에 담고 훅 생략(474자 퇴화 응답)
  → no-op/empty-output → full 폴백. 운영 동일 조건(`AXIOM_ANCHOR_FIRST=1`) 프로브로 재현 확정.
  - 수정: `runHybridRegionEdit`에 `retryWithoutAnchorFirst` — no-op/empty-output && anchorFirst일 때
    **같은 영역을 pin한 채 앵커 지침 없는 종전 프롬프트로 1회 재시도**(재시도는 anchorFirst=false라
    재귀 불가, 추가 호출은 실패 케이스 한정). anchor-first가 잘 듣는 국소 수정 케이스는 무영향.
  - **라이브 검증 ✅**: 운영 동일 조건에서 1차 퇴화(474자)→자동 재시도(896자)→**applied**(페치 파생
    교체 완주). 게이트: tsc 0 · region-edit 237/0 · patch-grounded 30 · line-edits 15 · react-rules 39 ·
    api-binding 69 · code-slice 15 · eval:region 회귀 없음 · compile+VSIX 재패키징(15:44).
  - 교훈: **라이브 재현은 운영 플래그까지 복제해야 한다** — 프로브 기본값(anchorFirst=false)이 운영
    기본(ON)과 달라 원인 1호 수정 후에도 증상이 지속됐다. 프로브에 운영 조건 재현 스위치 추가로 해소.
  - **실기기 사용자 검증 ✅(2026-07-15)**: 데모 채팅에서 재시도 발동→페치 파생 교체 적용→
    **"✅ 타입검증 통과"(Stage 0 검증-교정 루프의 첫 라이브 통과 목격 — ⑤ 개선 후보의 "실모델 검증"
    일부 해소)**. 전 과정: 퇴화 1차→재시도→applied→타입검증→수정 대기 diff 정상.

- **계기판**: `test:line-edits`(15) · `test:patch-grounded`(30) · `test:react-rules`(39) ·
  `test:region-edit`(237) · eval:e2e 게이트 통계 · **probe-region-live(실모델 단건)**
- **개선 후보**: grounded patch retry 1C(결정론 rename, 미구현), 검증-교정 루프(experimental.regionVerify)
  실모델 검증, full 폴백 파괴적 누락 가드 실모델 검증
- **신규 후보(2026-07-16, 저비용 실험): 제약 디코딩(constrained decoding)** — 출력 형식을 토큰
  생성 레벨에서 강제해 퇴화 응답(anchor-first 474자류)·형식 붕괴를 구조적으로 차단.
  Ollama=`format`(JSON 스키마만) / vLLM=guided_json·regex·**grammar(EBNF)** — vLLM이면 `<replace>`
  블록 구조 자체를 문법으로 강제 가능(코드의 JSON 이스케이프 문제 우회). ⚠ 구현은 LlmService
  요청 옵션 층에 **엔진 중립**으로(현 토폴로지 LiteLLM→Ollama, 전환 시 그대로 승계). ⚠ 주의:
  constraint tax(제약이 약한 모델 내용 품질 저하 보고) + 중도 절단은 여전히 가능 —
  **채택 판단은 probe-region-live 실측 게이트로만**(원칙 §2-4).
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

## 6. 미래 차별화 백로그 (타 제품 대비 차별점 — 2026-07-14 사용자 지정, 시점 미정)

> 단계별 고도화가 아니라 **제품 차별화** 관점의 장기 항목. 착수 시 별도 계획서를 만들고 여기 링크.

1. **검증 루프 (self-correct harness)** — 생성 후 compile/lint/test 결과를 다시 모델에
   피드백해 스스로 고치게 한다. **작은 모델일수록 필요** — 모델 정확도 약점을 harness로 보완.
   - 씨앗 이미 있음: Stage 0 검증-교정 루프(`experimental.regionVerify`, region 편집 후 tsc 진단
     →<replace> 1회 교정, ⑤apply 카드 참조). 미래 확장 = lint·test까지 피드백 소스 확대,
     교정 라운드 다회화, region 외 경로(full·페이지 생성)로 확대.
2. **팀 단위 공유 컨텍스트** — 클라이언트 코드베이스+코딩 표준의 RAG 인덱스를 **중앙에서
   관리·배포**. Continue 등은 개발자별 로컬 인덱스라 팀 일관성이 없음 — SI 프로젝트 투입
   시나리오(모두 같은 scaffold·표준)에서 강한 차별점.
   - 연결점: ⑦retrieval 층(현재 knowledge/ 로컬 인덱싱). 미래 = 인덱스 산출물의 중앙 빌드→
     배포 채널(git/사내 저장소), .axiom/knowledge 핫리로드가 배포 수신 지점 후보.
3. **한국어 자연어 → 도메인 코드** — "고객 등급 조회 화면 만들어줘"를 **은행(업무) 도메인
   모델을 이해하고** 생성. 단순 번역이 아니라 도메인 용어(고객등급·여신·수신…)→엔티티·API·
   화면 패턴 매핑.
   - 연결점: ①intent(한국어 의도·슬롯 추출은 이미 한국어 특화), ④contracts(계약카드가 도메인
     레시피로 확장될 자리), .axiom SDD 스펙(도메인 모델의 선언적 원천 후보).

## 7. 관련 문서

- 추후 작업 계획: [추후작업계획일꺼리.md](추후작업계획일꺼리.md) — 나중에 할 큰 작업의 계획서 모음(항목 1=관련 파일 자동 탐색)
- 선행 트랙(폴더 재편, 완료): [src-ai-restructure-progress.md](src-ai-restructure-progress.md) — §8에 이 트랙의 요약 지도
- 구조 지도: [src/ai/README.md](../src/ai/README.md) + 각 폴더 README.md
- 흐름 도식: [docs/diagrams/](diagrams/)
- intent 재설계 계획서: [AXIOM_INTENT_ROUTING_REDESIGN.md](../AXIOM_INTENT_ROUTING_REDESIGN.md)
- Claude 세션 메모리에도 요약 기록되나, **PC 간 공유되는 진실은 이 문서**다. 갱신은 여기 먼저.
