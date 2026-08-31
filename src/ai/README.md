# src/ai — Axiom 편집 엔진 구조 지도

사용자 프롬프트가 sLLM 콜을 거쳐 코드에 적용되기까지의 전체 흐름과,
각 단계의 물리적 위치(폴더)를 정의한다. 도식은 [docs/diagrams/](../../docs/diagrams/) 참고.

```
사용자 프롬프트
   │
   ▼
① intent/      의도 라우팅(현관문) — 무엇을 할지 결정 (수정? 생성? 질문?)
   │
   ▼
② decompose/   분해 — 쿼리 토큰화 + 배경·의존성 추출 (sLLM에 줄 '재료' 만들기)
   │
   ▼
③ locate/      위치찾기 — 스냅 사다리로 편집 대상 영역 결정
   │
   ▼
④ contracts/   설명서 삽입 — 계약카드·prop 인덱스 등 스캐폴드 규약을 프롬프트에 주입
   │
   ▼
━━ 단일 sLLM 콜 ━━
   │
   ▼
⑤ apply/       게이트·적용 — 응답 검증(게이트) 후 결정론 배치
```

| 폴더 | 역할 | 층 |
|---|---|---|
| [intent/](intent/) | 의도 분류·라우팅 | 현관문 (sLLM 전) |
| [decompose/](decompose/) | 쿼리·컨텍스트 분해 | 분해 (sLLM 전) |
| [locate/](locate/) | 편집 영역 위치 결정 | 위치찾기 (sLLM 전) |
| [contracts/](contracts/) | 계약카드·규약 주입 | 설명서 삽입 (sLLM 전) |
| [apply/](apply/) | 응답 게이트·결정론 적용 | 게이트·적용 (sLLM 후) |
| [pipeline/](pipeline/) | 전 단계를 지휘하는 오케스트레이터 | 관통 |
| [retrieval/](retrieval/) | 지식문서(루트 `knowledge/`) 검색·RAG | 보조 (Q&A·오프라인) |
| [actions/](actions/) | 오프라인 행동 카드(스키마·매칭·계획·결정론 적용) | 보조 (오프라인) |
| [lint/](lint/) | scaffold 계약 정적 검사 → VSCode Diagnostics·Quick Fix | 보조 (파이프라인 밖) |

## 주의

- 루트의 `knowledge/` 폴더는 RAG가 읽는 **데이터**(md 문서)이고, 그것을 검색하는 **코드**가 `retrieval/`이다. 서로 다른 것.
- `lint/`는 위 5단 흐름 **바깥**이다 — sLLM 콜이 없는 정적 검사이며, `contracts/`가 모델에게 *가르치던*
  같은 계약을 사람의 코드에 *알려준다*. 판정기가 갈라지지 않게 편집 게이트와 탐지기를 공유한다
  (`lint/ReactHookScan` ↔ `pipeline/FileCreatorService.detectModuleScopeHookViolation`).
- 이관은 점진적으로 진행 중이다. 아직 `src/ai/` 바로 아래 남아 있는 파일은 미이관 상태이거나
  여러 층에 걸쳐 있어 분할이 필요한 파일(예: ScaffoldContextBuilder, StructuralAnchor)이다.
- 이관 원칙: **이동 먼저(로직 무변경, import 경로만), 거대 파일 쪼개기는 나중에.**
  각 이동 후 전체 테스트(`test:region-edit` 등)를 게이트로 삼는다.
