# 외부 Corpus 포맷 가이드 (External Corpus Specification)

Axiom AI에 사용자 정의 지식(corpus)을 추가하는 방법을 설명합니다.  
VSCode 설정 `axiom-ai.rag.userRagFolder`에 폴더 경로를 지정하면 해당 폴더의 `.md` 파일이 RAG 파이프라인에 통합됩니다.

---

## 폴더 구조

임의 깊이의 디렉터리 트리를 사용할 수 있습니다.

```
my-corpus/
  patterns/
    auth-flow.md         ← 키워드 라우팅 + 임베딩 검색에 포함
    error-handling.md
  components/
    CustomButton.md
  _manifest.json         ← 선택: 외부 corpus 메타데이터 (없어도 됨)
  _index.md              ← 선택: 수동 키워드 인덱스 (없으면 frontmatter 태그만 사용)
```

**규칙:**
- `_`로 시작하는 파일(`_manifest.json`, `_index.md` 등)은 문서 파일로 처리되지 않습니다.
- `.md` 확장자 파일만 인식됩니다.
- 파일 없는 frontmatter → 임베딩 검색만 참여, 키워드 라우팅 제외 (경고 발생)

---

## 필수 Frontmatter

모든 `.md` 파일은 파일 최상단에 `---` 구분자로 감싼 YAML frontmatter를 포함해야 합니다.

```markdown
---
title: "인증 플로우 패턴"
category: pattern
tags: [auth, 인증, login, 로그인, token, jwt]
---

# 인증 플로우 패턴

...문서 내용...
```

### 필수 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `title` | string | 문서 제목 |
| `category` | string | `component`, `pattern`, `convention`, `scaffold`, `react`, `source` 중 하나 |
| `tags` | string[] | 키워드 배열 (소문자, 한글/영문 혼용 허용) |

### 선택 필드

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `priority` | 1\|2\|3 | `2` | 검색 우선순위 (1=최우선) |
| `language` | string | `mixed` | `ko`, `en`, `mixed` |
| `scope` | string | category와 동일 | `.rag/` 호환용 |
| `related` | string[] | `[]` | 연관 파일 상대경로 목록 |
| `version` | string | `"1.0"` | 문서 버전 |

---

## 선택: `_index.md` 수동 키워드 인덱스

frontmatter `tags`로 자동 인덱싱되지만, 더 세밀한 키워드 제어가 필요할 때 `_index.md`를 작성할 수 있습니다.

```markdown
---
version: 1.0
---

## 패턴

- keywords: [auth, 인증, login, 로그인, jwt, token]
  files: [patterns/auth-flow.md]

- keywords: [error, 에러처리, exception, try-catch]
  files: [patterns/error-handling.md]
```

---

## 선택: `_manifest.json`

외부 corpus 메타데이터를 명시적으로 선언할 때 사용합니다.

```json
{
  "version": "1.0",
  "name": "my-project-corpus",
  "description": "프로젝트 전용 코딩 규칙 모음"
}
```

---

## 검증

`scripts/validate-external-corpus.mjs`로 사전 검증할 수 있습니다.

```bash
node scripts/validate-external-corpus.mjs /path/to/my-corpus
```

출력 예시:
```
[PASS] patterns/auth-flow.md
[PASS] patterns/error-handling.md
[FAIL] components/CustomButton.md — 필수 필드 누락: category, tags
```

---

## 로그 확인

VSCode Output 채널 `axiom-ai: Corpus`에서 외부 corpus 로드 결과를 확인할 수 있습니다.

- `[external] Loaded 5 files from /path/to/corpus (1 warning)`
- `[warn] missing required field 'category' in /path/file.md`
- `[hot-reload] External corpus changed, rebuilding index...`
