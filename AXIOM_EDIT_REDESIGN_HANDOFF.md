# Axiom 편집 파이프라인 재설계 — 작업 핸드오프

> 작성일: 2026-06-30 · 최종갱신: 2026-06-30 · 목적: 편집 결과 품질을 "Claude Code 방식"(앵커 계약 + 검증 루프 +
> grounded 재시도)으로 끌어올리는 재설계. 이 문서 하나로 회사/집 어디서든 이어서 작업 가능.

---

## 0. 한 줄 요약

현재 편집 파이프라인은 **open-loop one-shot**(모델이 한 방에 큰 영역/전체를 재작성 → 정적 게이트 14개 →
의심되면 "전체 재생성") 구조라 두더지잡기가 끝이 없다. 처방은 **"바꿀 만큼만 건드린다 + 틀리면 다시 읽고 재인용한다"**
(= Claude Code의 Edit 도구 방식)로 모든 경로를 수렴시키는 것. Stage 0/1을 끝내고 **앵커-우선·patch-우선을
기본 ON으로 승격**했으며, region·patch·lines의 "앵커 실패 → grounded 재시도" **경로 수렴까지 완료**했다.

---

## 0.5 현재 상태 요약 (★여기부터 읽으면 됨 — 2026-06-30 최신)

**한 문장:** 북극성 7개 행동 중 ①②③④⑤⑦이 작동(기본 ON), 남은 큰 과제는 **⑥ smallest-edit(locate 850줄 축소)**
과 **실모델 라이브 검증**(폐쇄망 qwen3-coder로만 가능).

**지금 켜져 있는 것(전부 기본 ON, 사이트별 axiom.config.json에서 off 가능):**
- `experimental.regionEdit: true` — 영역(하이브리드) 편집 경로
- `experimental.regionVerify: true` — Stage 0 검증-교정 루프(적용 직전 tsc 진단 → <replace>로 1회 교정)
- `experimental.anchorFirstEdit: true` — Stage 1 앵커-우선(작은 수정은 영역 통째 대신 `<replace>` 인용교체)
- `experimental.patchFirstEdit: true` — 현재 파일 in-place 수정 시 lines 빼고 patch 주력(드리프트 잦은 lines 우회 제거)
- `multiPatch.groundedRetry: true` — 앵커 실패 시 실제 코드 재인용 재시도(patch·lines·**region** 공통)

**완료된 마일스톤(시간순, 상세는 §2):**
1. Stage 0 검증-교정 루프 + Stage 1 모호성 게이트 + 라이브 버그 3건(cross-file/content-loss/lines-grounded).
2. **증분1**: `<replace><old>원본</old><new>새코드</new></replace>` = Claude Code `Edit(old,new)` literal 정확매칭
   (앵커 `;` 추측 폐기, 유일매칭만 교체). anchorFirst 프롬프트도 literal 지시로.
3. **증분3**: patchFirst — 모드를 structural(추가)+patch(수정)로 압축, 약한 모델 선택부담↓.
4. **검증 스윕 → anchorFirst·patchFirst 기본 ON 승격**(사용자 결정). 속성/값/다중 편집 한 방에 깔끔, "테이블 useApi로
   불러와"는 region→full로 import+타입+훅+데이터와이어링 완전 연결. 모든 위험 케이스를 게이트가 차단(조용한 파손 0).
5. **의존성 dead-end → full 자동 재시도 1회**(structural이 useApi<TFoo>만 내고 TFoo 선언 누락 시 카드 클릭 없이 자동).
6. **정확한 타입 = 파일 첨부 방식**(SDD 미사용 확정). 채팅 입력 📎 버튼으로 `@상대경로` 삽입 → referencedSpec 주입.
7. **증분2(핵심 부채 해소): region→grounded 경로 수렴** ← 이번 세션. region 합성 실패가 곧장 약한 full로
   떨어지던 걸 "실제 영역 텍스트로 surgical patch 1회 재요청"으로 바꿈(§2.5).

**바로 다음 할 일(우선순위 순, §6):**
1. **실모델 라이브 검증** — anchorFirst/patchFirst/region-grounded가 qwen3-coder에서 실제로 통하는지(§5 체크리스트).
   프롬프트 효과는 **오프라인 eval로 측정 불가** → 이게 모든 승격의 전제.
2. **Stage 2 — locate 850줄 축소**(`RegionEdit.ts`): 앵커 계약이 위치를 모델에 위임하므로 결정론 추측 휴리스틱을
   eval 회귀 측정하며 점진 삭제. = 북극성 ⑥ smallest-edit.
3. 잔여 미흡점: import 추가 가끔 no-op(멀티라인 dedup 수정 후 재현 케이스 확인), region이 작은 편집서 locate로 자주
   빠짐(patchFirst가 우회하므로 실질 영향 적음).

---

## 1. 핵심 진단 (왜 자꾸 엉뚱하게 동작했나)

```
프롬프트 → RAG/Scaffold 첨가 → 모델이 한 방에 던짐 → 확장이 후처리로 살림 → 의심되면 full 재생성
```

- **편집 경로가 너무 많다**: region(`runHybridRegionEdit`) / lines(라인 앵커) / patch(다중 search-replace) / structural / full.
- **각 경로가 다르게 실패하고, 실패하면 전부 "full 재생성"으로 도망간다** — 그 full이 느리고(토큰 폭증) 내용 누락 위험 큰 약한 경로.
- 모델이 "이 영역 전체를 다시 써"라는 위험한 도구를 받으니, 일부를 흘리면 통째로 날아간다.

**원칙(Claude Code 벤치마킹):** 도구가 surgical하면(=바꿀 문자열만 인용·교체) 약한 모델도 큰 사고를 못 친다.
IQ가 아니라 harness 설계 문제. `<replace anchor="...">...</replace>` 가 곧 Claude Code의 `Edit(old_string, new_string)`.

---

## ★ 북극성(North Star): "Claude Code의 똑똑한 로직을 최대한 녹인다"

이 재설계의 **단일 목표**다. Claude Code(코딩 에이전트)가 약한 모델 없이도 편집을 안정적으로 하는 이유는
"더 똑똑한 모델"이라서가 **아니라**, 아래의 **행동 규약(도구 설계)** 때문이다. qwen3-coder 같은 sLLM에도
이 규약을 harness로 강제하면 같은 부류의 사고를 구조적으로 막을 수 있다. 모든 작업의 판단 기준은
**"이게 Claude Code의 어떤 똑똑함을 Axiom에 옮기는가?"** 이다.

| Claude Code의 행동 | 왜 안전한가 | Axiom 매핑(메커니즘) | 상태 |
|---|---|---|---|
| **① Read before write** — 안 보고 절대 안 고침 | 환각이 아니라 실제 파일에 grounding | locate가 실제 디스크 텍스트 주입 / `_loadReferencedFiles` / grounded 재시도가 실제 코드 재주입 | ✅ 대체로 |
| **② Surgical edit** — `Edit(old_string,new_string)`, 바꿀 것만 인용·교체 | 안 건드린 코드는 **출력조차 안 함** → 누락 불가능 | `<replace><old>원본</old><new>새코드</new></replace>` literal 정확매칭(=Edit 도구) + anchorFirst·patchFirst 기본 ON | ✅ 승격(라이브 효과 측정만 남음) |
| **③ 유일 앵커 강제** — old_string 안 unique면 에러 | 엉뚱한 곳 조용히 교체 불가 | 모호성 게이트(`findAnchorLines`+`statementStart`) | ✅ |
| **④ Fail loud → grounded 재시도** — 앵커 빗나가면 다시 읽고 재인용. **절대 전체 재생성 안 함** | 큰 파일 통째 재생성의 토큰폭증·내용누락 회피 | `_tryGroundedPatchRetry` / `_tryGroundedLineEditRetry` / `_tryGroundedRegionRetry` | ✅ patch·lines·region 수렴(full만 잔존) |
| **⑤ Verify after acting** — 편집 후 typecheck/test 돌려 에러 피드백·수정 | 깨진 코드를 조용히 안 남김 | Stage 0 검증-교정 루프(`getDiagnostics`) | ✅ (단 tsc는 내용삭제 못 봄 → content-loss 게이트 보완) |
| **⑥ Smallest sufficient change** — 필요한 만큼만 | 부수효과·과편집 최소화 | locate "가장 작은 영역" + 작은편집은 `<replace>` | ⛔ 미구현(Stage 1 졸업 과제) |
| **⑦ Bounded loop + 결정론 안전망** — 약한 모델은 1~2스텝으로 묶고 게이트가 잡음 | 무한 에이전트 스파이럴 방지 | 재시도 1회 상한 + 게이트들(모호성·검증·content-loss) | ✅ 부분 |

**핵심 통찰:** "멍청해 보이는 AI"는 모델이 멍청해서가 아니라 **harness가 위험한 도구(영역 통째 재작성, 전체 재생성)를
주고 믿기 때문**이다. 위 7개를 다 녹이면, 경로가 어디로 가든 "버튼 텍스트 바꿨더니 필터바 삭제" 같은 사고는
구조적으로 안 난다. **남은 큰 과제는 ②의 승격, ④의 전 경로 수렴, ⑥의 구현** (= 5·6번 섹션의 다음 단계와 일치).

---

## 2. 완료된 작업

### Stage 0 — 검증-교정 루프 (적용 ON, 기본값 true)
적용 직전 합성 결과를 **VSCode TS 언어서버 진단**으로 검증하고, 새 타입에러가 있으면 에러+코드창(델타)만 주고
`<replace>` 앵커 계약으로 **1회 교정**. 남으면 ⚠️ 경고 붙여 그대로 적용(컨펌 카드 위임). 진단 못 얻으면 fail-open.

- `src/ai/RegionEditService.ts`: `EditVerifier` 타입, `runHybridRegionEdit`의 `verify` 파라미터, 검증-교정 루프,
  `buildVerifyCorrectionSystem` / `buildVerifyCorrectionPrompt`.
- `src/providers/ChatViewProvider.ts`: `_verifyTextByDiagnostics`(임시 형제파일 + `getDiagnostics`),
  `_collectDiagnostics`(진단 안정 대기). `_tryRegionEdit`에서 주입.
- 플래그: `experimental.regionVerify` (기본 **true**).
- ⚠️ **사각지대**: tsc는 "내용 삭제"를 못 본다(JSX 요소 지워도 타입 유효). → Stage 1의 content-loss 가드로 보완.

### Stage 1 — 앵커 계약 승격 (적용 일부, 프롬프트는 플래그 OFF)
**(A) 모호성 게이트 (결정론, ON)** — `src/ai/StructuralAnchor.ts`
`applyReplaceBlocks`의 앵커 해소를 `findAnchorLines`(전부 수집) + `statementStart`(문장경계)로 교체.
같은 앵커가 **2곳 이상 문장**에 걸리면 첫 곳 말없이 교체 안 하고 거부("[모호: N곳]")→재인용 유도. 유일 앵커는 무영향.

**(B) 앵커-우선 프롬프트 (플래그 OFF — 라이브 검증 대기)** — `src/ai/RegionEditService.ts`
`buildHybridPrompt`에 `anchorFirst` 파라미터. 켜면 "작은 국소수정은 영역 통째 대신 `<replace>`로 인용교체" 지침 주입.
- 플래그: `experimental.anchorFirstEdit` (기본 **false**).
- ⚠️ **오프라인 eval로 측정 불가**(녹화 재생은 옛 `<region>` 포맷). 실 qwen3-coder 라이브 프로브로만 검증.

### 라이브 테스트로 발견·수정한 버그 3건 (2026-06-30)

| # | 증상 | 경로/원인 | 수정 |
|---|---|---|---|
| 1 | "PageHeader **위에** 버튼 만들고"가 PageHeader.tsx(shared) 통째 재작성으로 샘 | cross-file 재타겟 — 억제가 "X로 적용"만 막고 "X 위에"(위치 랜드마크) 미감지 | `src/ai/CrossFileTargeting.ts` 신설(순수함수 `crossFileSuppressionReason`): use-as + **landmark**(위에/아래에/옆에/앞에/뒤에/근처/사이/상단/하단). `_resolveCrossFileTarget`이 사용. "X를 수정"은 통과 |
| 2 | "버튼 텍스트 바꿔줘"가 아래 필터바 Select들까지 삭제, 그런데 "✅ 타입검증 통과" | region 통째 재작성 — 모델이 버튼만 내고 필터바 누락. 삭제는 타입 유효라 tsc 못 봄 | `runHybridRegionEdit`에 **region-content-loss 게이트(4.7)**: 삭제의도 아닌데 JSX 여는태그 절반↓+4개↓ 급감하면 거부. 컴포넌트 교체(SmartTable 등)는 면제 |
| 3 | "데이터 바인딩 수정"이 anchor-mismatch ×2 → **전체 파일 재생성**(느림) | lines 모드 — grounded 재시도가 patch 모드엔 있는데 lines엔 없음(비대칭) | `ChatViewProvider._tryGroundedLineEditRetry` 추가. lines 앵커 실패 시 full 전에 실제 텍스트 grounding 재요청 1회. 위치문제+전부실패+grounding 성공일 때만(아니면 종전 full) |

---

## 3. 설정 플래그 (axiom.config.json 또는 VSCode 설정)

```jsonc
{
  "experimental.regionVerify": true,      // Stage 0 검증-교정 루프 (기본 ON)
  "experimental.anchorFirstEdit": false,  // Stage 1 앵커-우선 프롬프트 (기본 OFF — 라이브 검증용)
  "multiPatch.groundedRetry": true        // grounded 재시도 (lines/patch 공통, 기본 ON)
}
```

집에서 **가장 먼저 할 것**: `experimental.anchorFirstEdit: true` 켜고 작은 편집("버튼 텍스트 바꿔줘") 테스트.

---

## 4. 검증 명령 (현재 전부 green)

```bash
npm run typecheck            # tsc (extension + webview)
npm run test:region-edit     # 195 passed — region/검증루프/모호성/cross-file/content-loss/grounded수렴(locatedRegion)
npm run eval:region          # 85% 적용률, 회귀 0 (녹화 재생)
npm run test:line-edits      # 15 passed
npm run test:patch-grounded  # 30 passed
npm run test:react-rules     # 13 passed
npm run compile              # esbuild 번들
```

---

## 5. 라이브 검증 체크리스트 (집에서 할 것)

**준비**: `axiom-ai` 출력 채널 열기 + 편집할 파일을 에디터에 열어둔 채로 요청(baseline 진단용).

1. **버그①·② 재발 안 하는지**
   - "PageHeader 위에 버튼 만들고…" → PageHeader.tsx로 안 새고 **현재 파일** 편집 + 출력채널에 `cross-file 억제(landmark...)`
   - "직원 등록 버튼 텍스트 바꿔줘" → 필터바 삭제 시 `region-content-loss` 거부(조용한 삭제 안 함)
2. **Stage 0 검증 루프** (regionVerify ON)
   - API 연동 편집 → 배너에 `✅ 타입검증 통과` 또는 `⚠️ 타입에러 N건` / `1→0 교정`
   - 멀쩡한 편집에 ⚠️ 노이즈 나면 false positive(파일 열려 있었는지 확인)
   - `__axiom_verify_*` 임시파일이 git status에 남으면 정리 버그(정상=즉시 삭제)
3. **Stage 1 앵커-우선** (anchorFirstEdit ON) ★핵심
   - "버튼 텍스트 바꿔줘" → 출력채널에 `replace 적용(앵커 ...)` 이면 성공 / `JSX 영역 splice`면 모델이 지침 안 따름
   - `[모호: N곳]` 폴백 잦으면 → 프롬프트에 "더 길게 인용" 강조 필요
   - malformed/empty로 full 폴백 잦으면 → anchor-first가 이 모델엔 아직 이름(보류)
4. **버그③ lines grounded 재시도**
   - "데이터 바인딩 수정" → `🔁 매칭 실패 부분의 실제 코드로 patch를 다시 만드는 중` 뜨고 전체 재생성 안 가야 정상

→ 결과(출력채널 배너/이상동작)를 기록해두면 다음 작업에서 프롬프트·임계값 튜닝에 사용.

---

## 6. 다음 단계 (미구현)

- **Stage 1 라이브 검증 → 졸업**: anchorFirstEdit가 통하면 기본 ON 승격 + locate가 "가능한 가장 작은 영역"을
  고르게(작은 편집에 큰 영역 안 주게) 개선. = "smallest sufficient edit" 원칙.
- **Stage 2 — locate 850줄 축소**: `src/ai/RegionEdit.ts`의 ②.5/②.7/②.8/②.9 랜드마크 휴리스틱을
  eval로 회귀 측정하며 점진 삭제(앵커 계약이 위치를 모델에 위임하므로 결정론 추측 기계가 덜 필요).
- **경로 수렴(핵심 부채 — region 완료 2026-06-30)**: region/lines/patch의 "앵커 실패 → full 재생성"을 전부
  "다시 읽고 재인용"(grounded 재시도)으로 통일. patch·lines에 이어 **region도 수렴**.
  `RegionEditService.runHybridRegionEdit`이 "위치는 맞게 찾았으나 모델이 산출물을 망가뜨린" 합성 fallback
  (`REGION_GROUNDABLE_REASONS` = region-content-loss / replace-content-loss / replace-anchor-missing /
  root-tag-mismatch / empty-output)에 **실제 영역 텍스트**(`locatedRegion`: 디스크 라인 그대로)를 첨부.
  `ChatViewProvider._tryGroundedRegionRetry`가 그 영역만으로 surgical `<patch>`를 1회 grounded 재요청
  (`_retryForAxiomAction({groundedPatches})`, `intent:''`→히스토리 원요청 사용, `groundedRetryDone=true`로 정확히 1회).
  비-groundable(의존성 미해소·dead-binding·duplicate-decl = 영역 밖 선언 필요)은 제외 — 기존 의존성 dead-end 자동
  full 재시도가 담당. **검증**: test:region-edit 195 pass(locatedRegion 계약 3건 추가), eval:region 회귀 0.
  ⚠️ 잔여: grounded patch가 **실제 텍스트를 줘도 매칭 실패**하면 patchFailed 카드("Full로 재시도" 버튼)로 — 자동
  full 아님(원칙 #3 준수). 실모델에서 매칭 성공률·카드 빈도 라이브 측정 필요.
- **Stage 3 (선택)**: 바운디드 read 도구(모델이 필요한 라인범위 요청, 깊이 1~2 상한).

---

## 7. 핵심 파일 지도

| 파일 | 역할 |
|---|---|
| `src/ai/RegionEdit.ts` | locate(편집영역 결정, 850줄 결정론) + 안전 게이트 |
| `src/ai/RegionEditService.ts` | `runHybridRegionEdit`(오케스트레이터) + 검증루프 + content-loss 게이트 + 프롬프트 빌더 |
| `src/ai/StructuralAnchor.ts` | `applyReplaceBlocks`(앵커 계약 적용) + 모호성 게이트 + 훅/import 삽입 |
| `src/ai/CrossFileTargeting.ts` | (신규) cross-file 재타겟 억제 판정(use-as/landmark) |
| `src/providers/ChatViewProvider.ts` | 진입·라우팅 / `_tryRegionEdit` / `_verifyTextByDiagnostics` / grounded 재시도(patch+lines) |
| `src/config/ExtensionConfig.ts` | 플래그(regionVerify/anchorFirstEdit/groundedRetry) |
| `scripts/test-region-edit.ts` | 단위 테스트(177개) |

관련 메모리(Claude): `project_verify_correct_loop_stage0`, `project_cross_file_retarget`,
`project_grounded_patch_retry`, `project_region_eval_harness`.

---

## 8. 절대 잊지 말 원칙

1. **프롬프트 변경은 오프라인 eval로 측정 안 된다** — 실 qwen3-coder 라이브 프로브로만 검증(녹화 재생은 옛 출력).
2. **경로 하드차단 금지** — 의도 정밀화로 푼다(개발자가 shared 수정하는 정당한 경우 존재).
3. **앵커 실패 → 전체 재생성 금지** — 다시 읽고 재인용(grounded 재시도).
4. **검증 루프는 fail-open** — 검증 불가가 편집을 막으면 안 됨.
5. **새 기능은 플래그 뒤 + 기존 경로 회귀 0** 확인 후 승격.
