//플랜에 대한 질문----------------------
현재 프로젝트는 vscode extension을 개발하는 프로젝트이다. 용도는 react-app-scaffold 구조를 항상 유지하며 개발하는 react 프로젝트 바이브 코딩 ai extension이다. react-app-scaffold프로젝트 참조는 다음 url을 참조해라.
https://github.com/nic-company-single-react/react-app-scaffold http://redsky0212.dothome.co.kr/axiom/react-guide/docs/started/getting-started/overview 

크게 봤을 때 하네스 엔지니어링을 사용하는 형태로 하고싶다. 
그 구조의 다이어그램은 media/axiom-harness_integration_map.svg 파일을 참조하면 된다. 물론 좀 더 괜찮은 구조가 있다면 수정해도 된다. 

우선 이 모든 작업을 다 한꺼번에 하는건 무리이다. 그래서 먼저 그 첫번째로 corpus 화 rag를 어떻게 구성하고 만들것인지 플랜을 세워줘. react-app-scaffold 구조를 컨벤션으로 하는 기본 corpus, rag 가 이미 탑재되어있지만 추후 외부에서 추가로 넣어줄 수도 있게 구성해줘.  
//플랜에 대한 질문----------------------------

# Corpus & RAG 구조 설계 플랜

## Context

axiom-ai-vsix는 react-app-scaffold 전용 vibe coding 어시스턴트 VSCode 확장이다.  
현재 3-레이어 하이브리드 RAG(키워드 라우팅 → 파일컨텍스트 → 임베딩 폴백)가 동작 중이지만:
- `corpus/`(원본 문서)와 `.rag/`(검색 인덱스)가 **수동 관리** — 빌드 파이프라인 없음
- corpus 문서에 **메타데이터(frontmatter) 없음** — 카테고리/태그/우선순위 정보 부재
- 외부 사용자 corpus **포맷 스펙 없음** — 검증 불가
- 외부 corpus 변경 시 **hot-reload 없음** — 내장 corpus만 감시

이 플랜은 하네스 엔지니어링 통합의 **1단계**: 확장 가능한 Corpus + RAG 기반 구축이다.

---

## 구현 계획

### Step 1: Frontmatter 메타데이터 표준 정의 및 corpus 파일에 적용

**대상 파일 (frontmatter 추가):**
- `corpus/scaffold-docs/architecture.md`
- `corpus/scaffold-docs/api-client.md`
- `corpus/scaffold-docs/components.md`
- `corpus/scaffold-docs/providers.md`
- `corpus/scaffold-docs/routing.md`
- `corpus/scaffold-docs/use-api.md`
- `corpus/scaffold-source/ExUseApi.tsx.md`
- `corpus/scaffold-source/api-client.ts.md`
- `corpus/scaffold-source/query-key-factory.ts.md`
- `corpus/scaffold-source/use-api.ts.md`

**표준 frontmatter 스키마:**
```yaml
---
title: "문서 제목"
category: component | pattern | convention | scaffold | react | source
tags: [tag1, tag2]        # 소문자, 한글/영문 혼용 허용
priority: 1 | 2 | 3       # 1=최우선, 기본값 2
language: ko | en | mixed
scope: (category와 동일)   # .rag/ 기존 파일 호환용
related: []                # .rag/ 내 연관 파일 상대경로
version: "1.0"
---
```

---

### Step 2: `corpus/manifest.json` 생성 (built-in 레지스트리)

각 corpus 원본 파일 → .rag/ 출력 파일 매핑 테이블.  
빌드 파이프라인 완결성 검증 기준 + 런타임 인벤토리 제공.

```json
{
  "version": "1.0",
  "project": "react-app-scaffold",
  "builtIn": [
    {
      "id": "scaffold-docs/api-client",
      "sourcePath": "corpus/scaffold-docs/api-client.md",
      "ragPath": ".rag/patterns/api-call.md",
      "category": "pattern",
      "priority": 1
    }
    // ... 나머지 10개 파일
  ]
}
```

---

### Step 3: `scripts/build-corpus.mjs` 빌드 파이프라인 (Node.js, 외부 의존성 없음)

**파이프라인 스테이지:**

1. **파싱**: `corpus/scaffold-docs/`, `corpus/scaffold-source/` 모든 `.md` 파일 읽기 → frontmatter 파싱 (정규식, `---` 구분)
2. **검증**: 필수 필드(`title`, `category`, `tags`) 누락 시 exit 1 (빌드 차단)
3. **Diff 동기화**: 각 소스 파일 해시 ↔ 현재 `.rag/` 타겟 비교 → 변경분만 갱신
4. **`_index.md` 재생성**: 모든 `.rag/` 파일의 `tags` 수집 → `_index.md` 자동 생성  
   → `_index.md`는 이제 **파생 산출물** (수동 편집 불필요)
5. **`manifest.json` 갱신**: 파일 해시 + `lastBuilt` 타임스탬프 기록
6. **출력 검증**: `manifest.json`의 모든 `ragPath`가 디스크에 존재하는지 확인

**npm 스크립트 추가:**
```json
"build:corpus": "node scripts/build-corpus.mjs",
"prebuild": "npm run build:corpus"
```

---

### Step 4: 외부 Corpus 스펙 문서 + CLI 검증기

**`corpus/EXTERNAL_CORPUS_SPEC.md`** (사용자 가이드):
- 폴더 구조 (임의 깊이, `_`로 시작하는 파일은 스킵)
- 필수 frontmatter 필드 규칙
- 선택적 `_index.md`, `_manifest.json` 포맷
- 파일 없는 frontmatter → 임베딩 검색만 참여, 키워드 라우팅 제외 (경고)

**`scripts/validate-external-corpus.mjs`** (CLI 검증 도구):
```
node scripts/validate-external-corpus.mjs /path/to/user-corpus
```
각 `.md` 파일별 PASS/FAIL + 이유 출력. 런타임 `ExternalCorpusLoader`에서도 동일 로직 사용.

---

### Step 5: `src/ai/ExternalCorpusLoader.ts` (신규)

런타임에 사용자 corpus 폴더를 로드·검증하는 클래스.

```typescript
interface ExternalCorpus {
  indexEntries: IndexEntry[];    // 사용자 _index.md 파싱 결과
  ragDir: string;                // 외부 corpus 루트 절대경로
  validFiles: string[];          // 유효한 .md 파일 절대경로
  invalidFiles: { path: string; reason: string }[];  // 경고용
}

class ExternalCorpusLoader {
  constructor(private outputChannel: vscode.OutputChannel) {}
  load(folderPath: string): ExternalCorpus { ... }
}
```

동작:
- 재귀 스캔 → frontmatter 파싱 → 필수 필드 검증
- `_index.md` 존재 시 `IndexEntry[]`로 파싱
- 오류/경고는 `axiom-ai: Corpus` Output 채널에 기록

---

### Step 6: 기존 클래스 수정 — 외부 Corpus 파이프라인 연결

**`src/ai/KeywordRetriever.ts`** — `mergeExternalIndex()` 추가:
```typescript
mergeExternalIndex(entries: IndexEntry[], externalDir: string): void
```
- 외부 인덱스의 파일 경로를 `externalDir` 기준 절대경로로 변환하여 `_entries`에 병합
- 기존 `matchedFiles()`, `readFiles()`는 변경 없음 (상대경로 → 절대경로로 이미 처리)

**`src/ai/FileContextRetriever.ts`** — `addExternalRagDir()` 추가:
```typescript
addExternalRagDir(dir: string): void
```
- 추가 dirs 목록 저장 → `readFiles()` 시 `related` 경로 해석에 활용

**`src/ai/HybridRagEngine.ts`** — `initialize()` 시그니처 확장:
```typescript
initialize(
  ragDir: string,
  extraDirs: string[] = [],
  extraFiles: string[] = [],
  externalCorpora: ExternalCorpus[] = []
): void
```
- 기존 흐름 유지 + 각 `ExternalCorpus`에 대해 `mergeExternalIndex()`, `addExternalRagDir()` 호출
- `ExternalCorpus.validFiles`는 `extraFiles`에 추가하여 임베딩 인덱스에 포함

**`src/ai/ScaffoldContextBuilder.ts`** — `startIndexBuild()` / `invalidateAndRebuild()` 수정:
```typescript
// 기존 코드:
this._engine.initialize(dir, extraDirs, files);

// 변경 후:
const externalCorpora: ExternalCorpus[] = [];
if (folder) {
  const loader = new ExternalCorpusLoader(this._outputChannel);
  externalCorpora.push(loader.load(folder));
}
this._engine.initialize(dir, extraDirs, files, externalCorpora);
```
- `invalidateAndRebuild()`는 `startIndexBuild()`를 호출하도록 리팩터링 (중복 제거)

---

### Step 7: `src/providers/ChatViewProvider.ts` — 외부 Corpus Hot-reload

현재 `registerCorpusWatcher()`는 내장 `corpus/scaffold-docs/**/*.md`만 감시.  
다음을 추가:

1. **외부 corpus 폴더 감시자** (`_registerExternalCorpusWatcher()`):
   - `ExtensionConfig.getUserRagSources().folder` 읽기
   - 절대경로로 `FileSystemWatcher` 생성
   - 변경/생성/삭제 이벤트 → 500ms 디바운스 → `invalidateAndRebuild()`

2. **설정 변경 감시자**:
   ```typescript
   vscode.workspace.onDidChangeConfiguration((e) => {
     if (e.affectsConfiguration('axiom-ai.rag')) {
       this._unregisterExternalCorpusWatcher();
       this._registerExternalCorpusWatcher(context);
       this._scaffoldBuilder.invalidateAndRebuild();
     }
   });
   ```

3. **디바운스 패턴** (외부 의존성 없음):
   ```typescript
   private _externalWatcherDebounce: NodeJS.Timeout | null = null;
   ```

---

### Step 8: `package.json` — 설정 및 커맨드 추가

**신규 설정 2개:**
```json
"axiom-ai.rag.externalCorpusEnabled": {
  "type": "boolean", "default": true,
  "description": "외부 사용자 corpus 폴더의 키워드 라우팅을 활성화합니다"
},
"axiom-ai.rag.validateExternalCorpus": {
  "type": "boolean", "default": true,
  "description": "외부 corpus frontmatter 유효성 검사 후 Output 채널에 경고를 표시합니다"
}
```

**신규 커맨드 1개** (`src/commands/index.ts`에도 핸들러 추가):
```json
{
  "command": "axiom-ai.reindexCorpus",
  "title": "Axiom AI: Corpus 인덱스 재빌드"
}
```

**Output 채널** (`src/extension.ts`에서 생성 → providers로 전달):
```
axiom-ai: Corpus
```
로그 예시:
- `[built-in] Loaded 28 RAG files from .rag/`
- `[external] Loaded 12 files from /path/corpus (2 warnings)`
- `[warn] missing required field 'category' in /path/file.md`
- `[hot-reload] External corpus changed, rebuilding index...`
- `[embedding] Index built in 4.2s (42 chunks)`

---

## 최종 디렉터리 구조

```
axiom-ai-vsix/
  corpus/
    manifest.json                     ← NEW: built-in 레지스트리
    EXTERNAL_CORPUS_SPEC.md           ← NEW: 외부 corpus 포맷 가이드
    scaffold-docs/                    ← MODIFIED: frontmatter 추가
      architecture.md, api-client.md, components.md,
      providers.md, routing.md, use-api.md
    scaffold-source/                  ← MODIFIED: frontmatter 추가
      ExUseApi.tsx.md, api-client.ts.md,
      query-key-factory.ts.md, use-api.ts.md
    seeds/                            ← (미래 하네스 Phase 9용)
  .rag/                               ← build-corpus.mjs가 생성/갱신
    _index.md                         ← GENERATED (수동 편집 불필요)
    components/, conventions/, patterns/, react/, scaffold/
  scripts/
    build-corpus.mjs                  ← NEW: corpus → .rag 파이프라인
    validate-external-corpus.mjs      ← NEW: CLI 검증 도구
  src/
    ai/
      ExternalCorpusLoader.ts         ← NEW
      HybridRagEngine.ts              ← MODIFIED: externalCorpora param
      KeywordRetriever.ts             ← MODIFIED: mergeExternalIndex()
      FileContextRetriever.ts         ← MODIFIED: addExternalRagDir()
      ScaffoldContextBuilder.ts       ← MODIFIED: ExternalCorpusLoader 연결
    commands/index.ts                 ← MODIFIED: reindexCorpus 핸들러
    providers/ChatViewProvider.ts     ← MODIFIED: 외부 corpus 감시자
    extension.ts                      ← MODIFIED: Output 채널 생성 + 전달
  package.json                        ← MODIFIED: 설정 2개 + 커맨드 1개
```

---

## 구현 순서 (의존성 기준)

```
Step 1 (frontmatter 추가)
  ↓
Step 2 (manifest.json) ← Step 1과 병행 가능
  ↓
Step 3 (build-corpus.mjs) — _index.md가 자동 생성됨
  ↓
Step 4 (스펙 문서 + CLI 검증기) ← Step 3과 병행 가능
  ↓
Step 5 (ExternalCorpusLoader.ts 신규)
  ↓
Step 6 (KeywordRetriever, FileContextRetriever, HybridRagEngine, ScaffoldContextBuilder 수정)
  ↓
Step 7 (ChatViewProvider hot-reload)
  ↓
Step 8 (package.json + extension.ts + commands/index.ts)
```

---

## 검증 방법

1. `npm run build:corpus` 실행 → `.rag/_index.md` 자동 갱신 확인
2. `node scripts/validate-external-corpus.mjs ./test-corpus` → PASS/FAIL 출력 확인
3. VSCode에서 확장 실행 → "axiom-ai: Corpus" Output 채널 확인
4. 외부 corpus 폴더에 `.md` 파일 추가/삭제 → 500ms 내 자동 재빌드 확인
5. "Axiom AI: Corpus 인덱스 재빌드" 커맨드 팔레트 실행 → 수동 재빌드 확인
6. 기존 채팅 질문 ("useApi 사용법", "button 컴포넌트") → 종전과 동일한 RAG 결과 확인 (회귀 없음)
