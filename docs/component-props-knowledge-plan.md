# 컴포넌트 prop 지식 계층 (Component Props Knowledge Layer)

> 상태: 설계 확정 대기 → PoC 착수
> 작성: 2026-07-01
> 관련 메모리: [scaffold-utils-knowledge], [bigfile-eval-harness], [intent-routing-collision-safety], [smarttable-knowledge-and-contract]

## 1. 문제 (두 겹의 공백)

Axiom의 코드 편집(region/hybrid) 경로는 scaffold 컴포넌트의 **옵션 prop을 사실상 모른다.** "선택한 SmartTable에 excel 내보내기 옵션 추가해줘" 요청이 **"변경 사항 없음"**(모델이 입력과 동일 코드 반환)으로 끝난 사건이 대표 증상이다.

- **공백 A — 커버리지:** `knowledge/components/*.md` 문서는 7개뿐(Button/Dialog/Form/Input/Select/Table/SmartTable). 실제 scaffold UI 컴포넌트는 ~20개(accordion·alert-dialog·badge·calendar·card·carousel·checkbox·combobox·dropdown-menu·textarea…) + smart-table + @axiom. 대부분 prop 지식이 아예 없다.
- **공백 B — 전달 채널(더 근본):** 문서가 *있는* 7개조차 region 경로엔 안 들어간다. region 경로가 보는 건 손으로 쓴 계약 카드(`ScaffoldContracts.ts`) 5장뿐이고, 전부 "새로 만들기/API 바인딩" 의도용이다. 그래서 **"기존 컴포넌트 Y에 옵션 X 추가"는 모든 컴포넌트에 대해 설계상 미지원**이다.

### 왜 "모든 문서를 편집 프롬프트에 다 넣기"가 답이 아닌가
- 약한 sLLM(qwen3-coder-64k 하한) + 좁은 컨텍스트에선 **관련 없는 컨텍스트 범람이 품질 1순위 킬러**([bigfile-eval]의 "deps 폭주"). 문서 20개를 통째로 넣으면 적용률이 오히려 떨어진다.
- 기능마다 카드를 손으로 추가하는 방식은 영원한 두더지잡기([intent-routing]의 "프롬프트마다 엣지버그 무한").

## 2. 결정 사항 (확정)

1. **지식 출처(source of truth) = 실 scaffold `types.ts`에서 자동 생성.** 손으로 쓴 md는 반드시 실코드와 drift한다(SmartTable.md가 일치한 건 운). prop 표·타입은 실 소스 파싱으로 항상 동기화.
2. **주입 방식 = 존재(presence) 기반 압축 retrieval.** region JSX에 `<SmartTable`이 있으면 그 컴포넌트의 압축 prop 표만 주입. 편집 영역에 실제 있는 것만 → 작고 관련성 높고 새 컴포넌트에 자동 확장.
3. **계약 카드와의 관계 = 계층 분리.** 범용 prop 표(존재 기반)를 아래 깔고, 정교한 레시피 카드(smart-table-binding = 새로 바인딩)는 그대로 위에 유지. **단, region에 이미 `<SmartTable`이 있으면 binding 레시피는 양보**(그 경우는 "옵션 추가"이지 "새로 만들기"가 아님) → 이번 버그의 직접 원인 제거.

## 3. 아키텍처

```
[생성 시점 — 빌드]
react-app-scaffold/src/**/(types.ts|*.tsx)
   │  scripts/build-component-props.mjs  (TS Compiler API로 props 인터페이스 파싱)
   ▼
src/ai/generated/component-props.index.json   (커밋됨 — 번들에 포함)
   { "SmartTable": { import: "@axiom/components/ui",
                     props: [ { name:"exportable", type:"boolean | { filename?; format?: 'xlsx'|'csv'; sheetName? }", doc:"내보내기 활성화. true면 기본 xlsx." }, … ] },
     "Calendar": { … }, "Select": { … }, … }

[사용 시점 — region 편집]
buildHybridPrompt(region, …)
   │  detectComponentsInRegion(region)  →  ["SmartTable"]
   │  buildComponentPropsSection(["SmartTable"])  (인덱스 조회 → 압축 표)
   ▼
프롬프트에 "## 컴포넌트 prop 레퍼런스 (이 영역에 있는 것)" 섹션 주입
```

### 3.1 생성기 (`scripts/build-component-props.mjs`)
- 이미 devDependency인 `typescript` ~5.4의 Compiler API 사용(추가 의존성 X). 기존 `build:corpus` 패턴과 동형.
- 입력 경로: scaffold 소스. 기본값 = `C:\redsky\work\react\single_react_new_nicfirst\react-app-scaffold`(메모리 [scaffold-source-path]), 환경변수 `AXIOM_SCAFFOLD_SRC`로 오버라이드.
- **소스 부재 시 graceful skip**: 경로가 없으면(예: CI) 마지막 커밋된 JSON을 그대로 두고 경고만. 빌드 실패 금지.
- 파서 전략: 각 컴포넌트의 **props 파라미터 타입을 type checker로 해소**해 public property를 열거. 선언 아키타입별 처리(아래 §5, 조사중):
  - (a) 명명된 `interface I…Props`(SmartTable) — 직접 해소.
  - (b) `VariantProps<typeof xVariants> & React.ComponentProps<'el'>`(cva 기반 shadcn) — 교집합 타입 평탄화, HTML 표준 attr은 노이즈라 **cva variant + 커스텀 prop만** 채택하고 표준 DOM attr은 접어서 요약.
  - (c) `React.ComponentProps<typeof RadixPrimitive.X>`(Radix 래퍼) — 핵심 prop만 요약(전량 X).
- 산출: prop별 `{ name, type(축약), doc(JSDoc 첫 줄), required }`. 컴포넌트별 `import` 경로 포함.
- **노이즈 억제**: 표준 HTML/DOM attr(className, onClick, style, aria-*…)은 개별 나열하지 않고 "표준 DOM 속성 지원"으로 한 줄 요약. **컴포넌트 고유 prop만** 전면 노출(토큰 절약 + 신호 대 잡음).

### 3.2 인덱스 소비 (`src/ai/ComponentPropsIndex.ts`)
- `detectComponentsInRegion(region: string): string[]` — region의 `<Xxx`(대문자 시작 JSX 태그) 스캔, 인덱스에 있는 것만 반환.
- `buildComponentPropsSection(names: string[]): string` — 압축 표 마크다운. 컴포넌트당 상한(예: 고유 prop 24개/컴포넌트, 태그 상한 3개) — 넘으면 잘림을 `log`로 표기(무단 절단 금지, [intent-routing] 원칙).
- 형식: 계약 카드와 톤 통일. 예:
  ```
  ## 컴포넌트 prop 레퍼런스 (이 영역에 있는 컴포넌트)
  ### <SmartTable/> (@axiom/components/ui)
  | prop | 타입 | 설명 |
  | exportable | boolean \| { filename?; format?: 'xlsx'\|'csv'; sheetName? } | 내보내기 활성화(기본 xlsx) |
  | selectable | boolean \| 'single' \| 'multiple' | 행 선택 |
  …
  > 요청에 맞는 prop만 추가하세요. 없는 prop을 지어내지 마세요.
  ```

### 3.3 계약 카드 게이트 조정 (`ScaffoldContracts.ts`)
- `smart-table-binding.applies`: `wantsSmartTable(query) && !/\<SmartTable\b/.test(region)` — **region에 이미 SmartTable이 있으면 미발동**(옵션 추가 의도). 그 경우 prop 섹션이 담당.
- `componentReplacementTargets`(루트태그 교체 허용)도 같은 게이트를 타므로, 기존 SmartTable 편집에서 루트 교체 지침이 안 뜬다(정상: 옵션만 추가).

## 4. 페이징 (구현 순서)

- **Phase 1 — 생성기 + 인덱스 (기반).** `build-component-props.mjs` + `component-props.index.json` + `build:component-props` 스크립트(+prebuild 배선). 검증: SmartTable/Select/Calendar/Button의 고유 prop이 정확히 잡히는지 스냅샷.
- **Phase 2 — region 주입 + 카드 게이트.** `ComponentPropsIndex.ts` + `buildHybridPrompt` 배선 + smart-table-binding 게이트. 검증: `test:region-edit`에 "기존 SmartTable + exportable → applied" e2e 케이스, 무회귀(기존 카드 경로 baseline 동일).
- **Phase 3 — 커버리지 확장 + drift 가드.** 전 컴포넌트 인덱싱, `eval:e2e`에 옵션추가 시나리오 몇 개, 생성기 산출 커밋 diff를 리뷰 가드로.
- **Phase 4(선택) — 런타임 워크스페이스 인덱싱.** 빌드타임 참조 scaffold 대신, 편집 대상 워크스페이스의 실제 컴포넌트 버전을 확장 활성화 시 파싱(프로젝트별 정확 동기화). 무겁지만 drift 완전 제거. 후속 검토.

## 5. 파서 아키타입 (조사 완료 → 단일 전략 확정)

실 소스에 4개 선언 아키타입이 공존한다:
- **A1. 명명 interface + JSDoc** — SmartTable(`interface ISmartTableProps<TRow,TRaw>`, prop마다 한글 JSDoc). 유일하게 리치 doc 보유.
- **A2. cva VariantProps 교집합** — Button/Badge: `React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild? }`. JSDoc 없음, props 타입 미export.
- **A3. Radix/BaseUI 래퍼(파일당 다중 export)** — Select/Calendar/Checkbox/Combobox/Dropdown-Menu/Accordion: `React.ComponentProps<typeof Primitive.X> & { custom? }`. 파일 하나에 5~15개 컴포넌트.
- **A4. 단순 HTML 래퍼** — Input/Textarea/Card: `React.ComponentProps<'input'>` (+선택적 `{ size? }`).

### 확정 전략: "타입 체커 단일 경로 + 출처 기반 노이즈 필터"
아키타입별 분기는 **불필요**하다. 각 파일에서 **export된 PascalCase 컴포넌트 함수**를 찾아, 첫 파라미터 타입을 `checker.getTypeAtLocation` → `type.getProperties()`로 열거하면 체커가 교집합(`&`)·`VariantProps`·`React.ComponentProps`를 전부 평탄화해준다. A1~A4가 한 경로로 처리됨.

진짜 과제는 **노이즈 필터**(`ComponentProps<'button'>`가 DOM attr 250개로 폭발). prop별 판정:
1. **출처(provenance) 우선** — `sym.declarations[0].getSourceFile()`이 scaffold 소스 트리 안(≠ node_modules)이면 → **고유 prop**(전량 노출 + JSDoc).
2. node_modules 출처이고 표준 DOM/React attr 패턴(`on[A-Z]`·`aria-*`·`data-*`·className·style·children·ref·key…)이면 → **접기**("표준 DOM 속성 지원" 한 줄 요약).
3. 그 외(예: cva에서 온 `variant`/`size` — 출처가 흐릿하나 리터럴 유니언) → **고유 prop로 채택**(literal-union 구제).

- **doc 없는 컴포넌트**(A2~A4): JSDoc 비어 있음 → 타입 문자열만 노출(모델엔 충분). A1(SmartTable)만 설명 동반.
- prop 타입 문자열은 `typeToString(NoTruncation)` 후 ~160자 상한 축약.

## 6. 리스크 / 미결
- **토큰 예산:** prop 섹션이 계약 카드와 중복 팽창하지 않도록, 존재 기반 상한 + "고유 prop만" 정책으로 억제. 실측은 `eval:region` 토큰 집계로.
- **약한 모델이 표를 받고도 안 쓰는가:** prop 표만으로 exportable을 못 붙이면(코디네이트 실패), date-picker처럼 "레시피형" 카드가 여전히 필요한 컴포넌트가 있을 수 있다. 실 sLLM record로만 판정.
- **Drift 가드:** 생성기 산출 JSON은 커밋. scaffold 갱신 시 재생성 → diff 리뷰. 런타임 인덱싱(Phase 4)은 이 문제를 원천 제거하나 비용이 큼.
- **소스 접근:** 빌드 머신에 scaffold 소스가 있어야 재생성 가능. 없으면 마지막 커밋 JSON 사용(graceful skip).
