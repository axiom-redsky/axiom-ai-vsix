# 지식 문서 저작·유지 가이드 (오프라인 지원 RAG)

이 폴더(`knowledge/`)의 `*.md` 문서는 **오프라인 모드**에서 scaffold/react 질문에 답하는 로컬 지식 베이스다.
LLM 서버가 없어도 동작하며, scaffold가 진화하면(새 유틸·라우터 메서드·`$ui` 메서드 등) **여기에 문서를 추가/수정**해
오프라인 답변을 최신으로 유지한다.

> ⚠️ 이 파일은 `_` 로 시작하므로 검색 인덱스(키워드·임베딩)에서 제외된다. 메타 문서이며 답변에 노출되지 않는다.

---

## 지식을 어디에 둘까 — 3계층

확장은 아래 세 위치의 지식을 모두 읽어 합친다(우선순위·중복 처리는 자동).

| 위치 | 성격 | 갱신 방법 |
|------|------|-----------|
| **번들 `knowledge/`** (이 폴더) | 거의 안 변하는 **보편 scaffold/react 패턴** | 확장 코어 개발 단계에서 작성 → 재빌드/재배포 |
| **워크스페이스 `.axiom/knowledge/`** | **프로젝트별·scaffold 버전별 델타**(그 SI 프로젝트의 신규 유틸/$ui/라우트 등) | 프로젝트 진행 중 `.md` 추가 → **핫리로드(재시작 불필요)** |
| 사용자 지정 RAG 폴더(설정 `axiom-ai`의 RAG sources) | 팀 공용 외부 corpus | `.md` 추가 → 핫리로드 |

**원칙**
- **SI 투입 전(코어 개발)**: 모든 프로젝트에 공통인 지식은 번들 `knowledge/`에 저작.
- **SI 프로젝트 진행 중**: 그 프로젝트에서 새로 만든 기능 지식은 **`.axiom/knowledge/`** 에 `.md` 한 장으로 추가.
  저장하는 순간 핫리로드되어 오프라인 답변에 즉시 반영된다(확장 재시작 불필요).

> 새 scaffold 기능 = **지식 `.md` 한 장 추가**. 그게 전부다.

---

## frontmatter (필수)

모든 지식 문서는 YAML frontmatter로 시작한다. **`title`·`category`·`tags`** 는 필수다(누락 시 키워드 라우팅에서 제외됨).

```markdown
---
title: "문서 제목"                     # 필수
category: pattern                      # 필수 — pattern | component | reference 등
tags: [키워드1, keyword2, 한글동의어]   # 필수 — 검색 키워드(한/영, 띄어쓰기 변형 포함)
priority: 2                            # 선택 — 낮을수록 우선(1=핵심)
kind: pattern                          # 선택 — 렌더 힌트(아래 표)
scope: pattern                         # 선택
related: [patterns/use-api.md]         # 선택 — 관련 문서 경로
version: "1.0"                         # 선택
---

# 본문 (frontmatter 아래)
```

### `kind` 값 (렌더·정렬 힌트)

오프라인 검색은 "코드 보여줘"류 질문에서 `example`/`source` 문서를 앞으로 끌어온다.

| kind | 의미 |
|------|------|
| `example` | 코드 예제 중심(“사용 예제 보여줘”에 우선 노출) |
| `source` | 실제 구현 소스 발췌 |
| `pattern` | 개념·시그니처 설명 |
| `component` | 컴포넌트 사용 가이드 |
| `catalog` | 목록·한눈에 보기(빈손 폴백에 사용) |
| `reference` | 일반 문서(기본값) |

`kind`를 생략하면 경로·본문 신호로 자동 추정된다.

---

## 키워드 라우팅 — `_index.md`

- **번들 `knowledge/`**: 정밀 라우팅을 위해 `_index.md`에 `- keywords: [...]` / `files: [...]` 쌍을 추가한다.
  키워드 매칭은 **부분문자열 포함(`질문.includes(키워드)`)** 이라, 사용자가 쓸 법한 표현을 한/영·띄어쓰기 변형까지 넣는다.
  예) `코드스플리팅` 과 `코드 스플리팅` 을 둘 다 등록.
- **`.axiom/knowledge/` 등 외부 corpus**: `_index.md`가 없으면 **frontmatter `tags` 로 키워드 라우트를 자동 생성**한다.
  즉 `.axiom/knowledge/`에 둘 때는 `_index.md` 없이 **frontmatter `tags`만 잘 채우면** 검색에 걸린다.

---

## 작성 체크리스트

- [ ] frontmatter에 `title`·`category`·`tags` 포함.
- [ ] `tags`에 사용자 표현(한/영·띄어쓰기 변형·동의어)을 넉넉히.
- [ ] 본문은 **scaffold 실제 동작에 근거**(없는 기능 발명 금지). 일반 react 가이드는 그렇다고 명시.
- [ ] 코드 예제는 실행 가능한 형태로, 타입 네이밍(`I`/`T` 접두사) 준수.
- [ ] 번들에 추가했으면 `_index.md`에 키워드 라우트 추가. `.axiom/knowledge/`면 `tags`로 충분.
- [ ] (번들 변경 시) `npm run test:knowledge-routing` 으로 라우팅 확인.

---

## 동작 확인

1. `.axiom/knowledge/`에 frontmatter 붙인 `.md`를 저장한다.
2. 핫리로드(자동) 후, 오프라인 채팅에서 그 주제로 질문 → 새 문서가 검색·노출되는지 확인.
3. 노출되지 않으면 `tags` 키워드가 질문 표현과 겹치는지 점검(부분문자열 매칭).
