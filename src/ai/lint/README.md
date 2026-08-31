# ai/lint — Scaffold 린트 (C1)

react-app-scaffold **고유 계약**을 소스 텍스트에서 결정론으로 검사한다. 모델 호출 0, vscode 비의존.
계획: [docs/offline-action-cards-plan.md](../../../docs/offline-action-cards-plan.md) §7 C1.

| 파일 | 역할 |
|---|---|
| `ReactHookScan.ts` | 모듈 최상위 훅 호출 스캐너 — **편집 게이트와 린트가 공유**하는 단일 탐지기 |
| `ScaffoldLint.ts` | 규칙 8종 + 자동 수정(Quick Fix) 편집 생성 |

vscode 배선(진단 발행·Quick Fix 제공)은 [`providers/ScaffoldLintProvider.ts`](../../providers/ScaffoldLintProvider.ts).
테스트: `npm run test:scaffold-lint`.

## 왜 별도의 린트인가

ESLint는 언어·React 일반 규칙을 본다(scaffold의 `eslint.config.js`는 react-hooks 권장 세트를 켠다).
tsc는 타입을 본다. **둘 다 모르는 것**이 이 계층의 영역이다 — 전역 `$router`·`$ui`·`$util`,
`@axiom/components/ui` 배럴 단일 경로, `useApi` 봉투 계약, T/I 접두사.

이 계약들은 지금까지 두 곳에만 살아 있었다:
- **편집 파이프라인의 거부 게이트** — 모델 산출물에만 적용
- **프롬프트 계약카드**([`ai/contracts/ScaffoldContracts.ts`](../contracts/ScaffoldContracts.ts)) — 모델에게 가르치는 글

사람이 직접 쓴 코드에는 아무 신호가 없었다. 이 모듈이 같은 계약을 읽기 전용 진단으로 노출해
**모델이 있든 없든 같은 판정**을 받게 한다.

## 규칙 (v1 8종)

| id | 심각도 | 계약 출처 | 자동 수정 |
|---|---|---|---|
| `module-scope-hook` | error | knowledge/patterns/use-api.md §호출 위치 | hoist(파이프라인 변환 재사용) |
| `refetch-args` | error | 계약카드 use-api | `refetch()` |
| `ui-import-path` | error | knowledge/react/component.md | 배럴 경로로 교체 |
| `router-hook` | error | 계약카드 router | `$router` 전환(한 줄 선언 모양만) |
| `envelope-unwrap` | warning | use-api.md §봉투 계약 | `data?.<key>` |
| `raw-http` | warning | 계약카드 use-api | — (구조 변경이라 기계가 정답을 못 고름) |
| `window-dialog` | warning | 계약카드 global-ui-alerts | alert만(`confirm`은 동기→Promise라 수동) |
| `type-naming` | warning | 계약카드 type-naming | 선언 + 파일 안 참조 rename |

## 규칙을 추가·수정할 때

1. **계약이 먼저다.** 규칙은 발명하지 않는다 — 계약카드나 knowledge 문서가 이미 주장하는 것만 옮긴다.
   계약 문구가 바뀌면 규칙도 함께 갱신한다(갈라지면 모델과 사람이 다른 지침을 받는다).
2. **탐지기를 두 벌 만들지 않는다.** 편집 게이트에 이미 같은 판정이 있으면 그 함수를 여기로 끌어내
   양쪽이 부르게 한다(`ReactHookScan`이 그 사례). 두 벌이 되면 "AI가 만들면 막히는데 손으로 쓰면
   안 잡힌다"는 비대칭이 생긴다.
3. **애매하면 침묵한다.** 진단은 코드를 막지 않지만, 소음이 한 번 쌓이면 개발자는 전체를 끈다.
   `test-scaffold-lint.ts`의 **D 섹션(오탐 방지)** 에 정상 코드 사례를 함께 추가한다.
   ★**실 코드베이스 전량에 한 번 돌려볼 것** — 합성 케이스는 "무엇이 위반인가"만 알려주고,
   "무엇이 위반이 아닌가"는 실제 코드가 알려준다(실측: 실 scaffold 269개 파일에서 첫 판 132건 중
   대부분이 오탐이었고, 여기서 계약 구현부·코드 예시 템플릿 리터럴·import 타입 지정자·JSX 산문·
   정착된 스타일 5종이 드러났다. 상세는 계획서 §9 Phase 4 C1).
4. **자동 수정은 정답이 하나일 때만.** 결과가 갈리는 변환(`fetch` → 훅 이동, `confirm` → async 전파)은
   판정만 하고 사람에게 넘긴다. 붙였다면 **E 섹션(왕복)** 에 "고친 뒤 다시 린트하면 0건"을 고정한다.
