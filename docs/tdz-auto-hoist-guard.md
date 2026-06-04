# TDZ 자동 호이스트 가드 (use-before-declaration auto-hoist)

> 설계 문서 · Axiom AI VSCode Extension
> 상태: 제안(설계 확정, 미구현) · 나중에 구현 예정

---

## 1. Context — 왜 만드나

세션 내내 약한 sLLM(qwen3-coder-64k)의 실패를 한 겹씩 **결정론 가드**로 막아왔다:

| 실패 | 처방(완료) |
|---|---|
| 멈춤(무음 정지) | 재시도 게이트/파서 일치 + 닫는태그 복구 |
| 블록 누락 | compact 모드(블록 먼저·출력모드 축소) |
| 컴파일 깨짐(중복 선언) | `findDuplicateDeclarations` 적용 전 가드 |
| 의미 오류(클라 필터·행별 Select) | "서버 params 우선" 조건부 지침 |
| 중복 파일 출력 | (full 합성에서 단일 복사본 선택) |
| **선언 전 사용(TDZ)** | ← **본 문서** |

단일 필터("부서 select 변경 시 테이블 필터링")의 full 재시도에서 **모델이 드디어 올바른 로직**을 냈다:

```ts
// 직원 목록 useApi params에 부서 조건 추가 (정확)
params: {
  page: currentPage, limit: PAGE_LIMIT, search: searchQuery || undefined,
  department: selectedDepartment === 'all' ? undefined : selectedDepartment,
},
```

그러나 **마지막 한 겹**이 남았다. 모델이 param은 추가했지만 그 state 선언을 위로 옮기지 않았다:

```ts
// 상단(~90줄): selectedDepartment 사용
} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, { params: { …, department: selectedDepartment … } });
// …약 60줄 아래(~143줄): 이제서야 선언
const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
```

컴포넌트 본문은 위→아래로 실행되므로, params를 만드는 순간 `selectedDepartment`는 **선언 전(TDZ)** →
첫 렌더에서 **`Cannot access 'selectedDepartment' before initialization` 런타임 크래시**.

이 버그 클래스(같은 컴포넌트 스코프에서 **선언보다 먼저 참조되는 useState/useRef**)는 결정론으로 감지·교정 가능하다.
사용자 선택: **차단이 아니라 자동 호이스트** — 참조보다 위로 선언을 옮겨 **크래시를 동작하는 코드로 자동 변환**한다.

기존 안전망과 같은 자리(`_handleAxiomAction` 적용 직전), 중복선언가드 바로 **앞**에 들어간다.
region/full/patch/lines 모두 최종 `action.generatedCode`(전체 파일)를 거치므로 단일 지점에서 전부 커버.

---

## 2. Goal / Non-Goal

**Goal**: 컴포넌트 본문에서 `const [x,setX]=useState(...)` / `const x=useRef(...)` 류 선언이 **자기 선언 줄보다 앞 줄에서 참조**되면, 그 선언을 **컴포넌트 본문 최상단**(여는 `{` 다음, 첫 문장 앞)으로 자동 이동. 적용 전 교정.

**Non-Goal**: 일반 변수·함수 선언 재정렬 / 모듈 스코프 / 다중행 복합 선언(보수적 skip) / RHS가 더 늦게 선언된 로컬을 참조하는 경우(새 TDZ 위험 → skip).

---

## 3. 설계 — 신규 `hoistUseBeforeDeclare(fullText): { text, hoisted } | null`

**위치**: `src/ai/StructuralAnchor.ts` (이미 `findDuplicateDeclarations`·`parseBindingPattern`·스코프 스캔이 여기 있음). 반환 `null` = 변경 없음.

**알고리즘** (외부 의존성 0, 라인 기반 + 중괄호 깊이):

1. CRLF 정규화 후 `split('\n')`. 컴포넌트 본문 여는 줄 idx 탐색 — `FileCreatorService._findComponentOpenLine`와 동일 규칙(`^export default function` 우선, 없으면 PascalCase 화살표)을 StructuralAnchor에 작은 헬퍼로 복제.
2. 본문 스코프(여는 `{` 기준 depth==본문깊이)에서 **단일 줄** `const <pattern> = useState|useRef|useMemo|useReducer (...)` 선언만 수집 → `{ name, lineIdx }`. 깊이 추적은 `countDelimiters`(문자열·주석 인식) 재사용. (다중행은 v1 skip → 미탐 허용)
3. 각 바인딩 name의 **최초 참조 줄**을 본문에서 word-boundary로 탐색(선언 줄 자신 제외). escape는 기존 `findUnusedInsertedBindings`의 정규식 패턴 재사용.
4. **최초참조 줄 < 선언 줄**이면 호이스트 대상. 단 **안전조건**: 선언의 RHS(`=` 이후)가 "본문 최상단보다 늦게 선언되는 다른 로컬"을 참조하지 않을 것. useState/useRef 초기값이 리터럴/모듈상수/import면 통과. 위반 시 그 선언은 skip(자동교정 보류).
5. 대상 선언 줄들을 원래 상대순서 유지해 **컴포넌트 여는 줄 다음**에 재삽입, 원위치 제거 — `FileCreatorService.hoistModuleScopeHooks`의 rebuild 패턴(`removeIdx` Set + open 줄 뒤 insert) 그대로 차용. 들여쓰기는 본문 첫 문장 기준(탭/스페이스 감지).
6. 재구성 후 `findDuplicateDeclarations`로 재검(이동이 중복을 만들지 않았는지) — 문제 있으면 `null` 폴백. CRLF 복원.

---

## 4. 통합 — `src/providers/ChatViewProvider.ts` `_handleAxiomAction`

- import에 `hoistUseBeforeDeclare` 추가(기존 `findDuplicateDeclarations` 옆).
- **중복선언 가드 블록 바로 앞**(현 `const diff =` 직전, `.tsx/.ts`일 때)에 삽입:

```ts
if (/\.(tsx|ts)$/.test(action.filePath) && action.generatedCode) {
  const h = hoistUseBeforeDeclare(action.generatedCode);
  if (h) {
    action.generatedCode = h.text;
    this._corpusOutputChannel.appendLine(
      `[Axiom AI] 🔧 TDZ 호이스트 (${action.filePath}): ${h.hoisted.join(', ')}`,
    );
    this._post({
      type: 'token',
      content: `\n\n> 🔧 선언보다 먼저 사용되는 state ${h.hoisted.length}건을 컴포넌트 상단으로 자동 이동했습니다(TDZ 크래시 방지).\n`,
    });
  }
}
```

- **순서**: 호이스트(자동교정) → 중복가드(차단) → diff/confirm. 호이스트는 기존 선언을 *이동*만 하므로 중복을 만들지 않고, 남는 문제는 중복가드가 받는다.

---

## 5. 안전 · 오탐 방지
- 단일 줄 useState/useRef류만, RHS가 늦은 로컬 미참조일 때만 이동(보수적).
- `for (const x of …)`·구조분해 다중행·함수 선언은 대상 아님(정규식이 `const … = useXxx(`에 한정).
- 변환 결과가 중복/여전한 위반이면 **null 폴백**(원본 유지). 미탐 허용 > 오탐.

---

## 6. Verification
- **단위 테스트**(esbuild+node, vscode 스텁 — 기존 `scripts/eval-*` 하니스 패턴):
  - 실제 케이스: `selectedDepartment`를 params에서 쓰고 아래에서 선언 → 선언이 본문 상단으로 이동, 결과는 use-after-declare. ✅
  - 오탐 방지: 이미 올바른 순서 → null(변경 없음) / 서로 다른 콜백 동명 → 무관 / RHS가 늦은 로컬 참조 → skip / 멀티라인 선언 → skip(v1).
- **회귀**: `npm run compile && npx tsc --noEmit && npm run eval:e2e`(기존 32개 회귀 0).
- **실모델 E2E(수동)**: 같은 부서 필터 요청 재실행 → 적용 후 브라우저 콘솔에 TDZ 에러 없이 부서 필터 동작 확인.

---

## 7. 영향 파일
- `src/ai/StructuralAnchor.ts` — 신규 `hoistUseBeforeDeclare`(+ 컴포넌트 여는줄 헬퍼).
- `src/providers/ChatViewProvider.ts` — `_handleAxiomAction` 통합 1블록 + import.
- (테스트) `scripts/`에 단위 테스트 1개(선택).

---

## 8. 참고 — 관련 기존 코드(재사용 대상)
- `FileCreatorService.hoistModuleScopeHooks` / `_findComponentOpenLine` / `_collectModuleScopeHookStatements` — 문장 이동 + rebuild 패턴의 직접 선례.
- `StructuralAnchor.findDuplicateDeclarations` — 중괄호 깊이 기반 스코프 스캔(같은 파일에 추가).
- `StructuralAnchor.parseBindingPattern` / `declBindings` / `findUnusedInsertedBindings` — 바인딩 이름 추출·참조 탐색.
- `CodeSectionExtractor.countDelimiters` — 문자열·주석 인식 중괄호 카운트.
