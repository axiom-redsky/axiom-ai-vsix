# Plan: FallbackStubService — 하드코딩 제거 → `.stubs/` md 파일 분리 + 사용자 확장 지원

## Context
`FallbackStubService.ts`에 오프라인 응답 코드가 8개 하드코딩되어 있다.
응답 내용을 수정하려면 TypeScript 파일을 직접 편집해야 하고, 항목이 늘어날수록 파일이 비대해지는 구조다.
`.rag/` 디렉터리가 이미 extensionUri 기반으로 md 파일을 런타임에 읽는 패턴을 사용하고 있으므로,
동일한 방식으로 `.stubs/` 디렉터리를 만들어 응답 내용을 md 파일로 분리한다.

추가로, 사용자가 extension 설치 후 번들 stubs를 수정·추가할 수 있도록
사용자 정의 폴더(`axiom-ai.stubs.userStubsFolder`)를 지원한다.
이 구조는 기존 `axiom-ai.rag.userRagFolder` 패턴과 동일하게 동작한다.

---

## 우선순위 규칙 (로드 순서)

```
번들 .stubs/  →  사용자 폴더 (userStubsFolder)
    낮은 우선순위          높은 우선순위
```

- 같은 키워드가 겹치면 사용자 파일이 이긴다 (user entries를 앞에 prepend)
- 사용자 폴더의 `_default.md`가 있으면 번들 default를 덮어쓴다

---

## 결과 구조

```
.stubs/                         ← vsix에 번들되는 기본 stubs
  _default.md
  useapi.md
  usestate.md
  usecallback.md
  custom-hook.md
  example.md
  refactor.md
  test.md
  explain.md

{userStubsFolder}/              ← 사용자가 자유롭게 추가/수정
  useapi.md                     ← 번들 useapi.md를 완전히 대체
  my-custom-topic.md            ← 번들에 없는 새 항목 추가
  _default.md                   ← (선택) 기본 폴백 메시지 교체
```

각 파일 형식 (번들/사용자 동일):
```md
---
keywords: [useapi, usefetch, api 호출, api hook, api 훅]
---

> ⚠️ 오프라인 모드 — 사전 정의 응답입니다

## useApi 훅 예제
... (응답 내용)
```

`_default.md`는 `keywords` 없이 body만 작성 (항상 fallback으로 사용).

---

## 수정 파일 목록

### 1. 신규 생성: `.stubs/*.md` (9개)
- `.stubs/_default.md`
- `.stubs/useapi.md`
- `.stubs/usestate.md`
- `.stubs/usecallback.md`
- `.stubs/custom-hook.md`
- `.stubs/example.md`
- `.stubs/refactor.md`
- `.stubs/test.md`
- `.stubs/explain.md`

각 파일의 body = 기존 `FallbackStubService.ts`의 해당 `response` 문자열과 동일한 내용.

---

### 2. `src/ai/FallbackStubService.ts` — 전면 리팩터링

**Before:** STUBS 배열 + DEFAULT_STUB 하드코딩
**After:** bundledDir + userDir 두 경로에서 md 파일을 읽어 메모리에 캐싱

```typescript
export class FallbackStubService {
  private _entries: StubEntry[] = [];
  private _defaultResponse: string = HARD_DEFAULT;

  constructor(bundledDir: string | null, userDir: string | null = null) {
    this._load(bundledDir, userDir);
  }

  /** 사용자 폴더 변경 시 hot-reload (ChatViewProvider에서 호출) */
  reload(bundledDir: string | null, userDir: string | null): void {
    this._entries = [];
    this._defaultResponse = HARD_DEFAULT;
    this._load(bundledDir, userDir);
  }

  private _load(bundledDir: string | null, userDir: string | null): void {
    // 1. 번들 dir 로드 (낮은 우선순위)
    if (bundledDir) this._loadDir(bundledDir);
    // 2. 사용자 dir 로드 (높은 우선순위 → prepend)
    if (userDir) this._loadDir(userDir, /* prepend */ true);
  }

  private _loadDir(dir: string, prepend = false): void {
    // fs.readdirSync(dir) → 각 .md 읽기
    // _default.md → this._defaultResponse 갱신
    // 나머지 → frontmatter keywords 파싱 → StubEntry
    // prepend=true 면 this._entries.unshift(...), false 면 push
  }

  selectStub(userText: string): string { /* 기존 로직 동일 */ }
  async *stream(userText: string): AsyncGenerator<string> { /* 기존 동일 */ }
  static extractUserText(messages: ChatMessage[]): string { /* 기존 동일 */ }
}
```

- frontmatter 파싱: `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/` 정규식 (ExternalCorpusLoader와 동일)
- keywords 파싱: `keywords: [a, b, c]` → 문자열 split + trim
- dir 없거나 로드 실패 시 → 경고 로그만 출력, graceful fallback

---

### 3. `src/ai/LlmService.ts` — 두 디렉터리 수신 + reload 메서드

```typescript
export class LlmService {
  private readonly _bundledStubsDir: string | null;
  private _stub: FallbackStubService;

  constructor(extensionUri?: vscode.Uri) {
    const p = extensionUri
      ? vscode.Uri.joinPath(extensionUri, '.stubs').fsPath
      : null;
    this._bundledStubsDir = p && fs.existsSync(p) ? p : null;

    const userDir = ExtensionConfig.getUserStubsFolder() || null;
    this._stub = new FallbackStubService(this._bundledStubsDir, userDir);
  }

  /** 사용자 stubs 폴더 변경 시 ChatViewProvider에서 호출 */
  reloadStubs(): void {
    const userDir = ExtensionConfig.getUserStubsFolder() || null;
    this._stub.reload(this._bundledStubsDir, userDir);
  }

  // 두 fallback 호출 위치에서:
  // yield* new FallbackStubService(...).stream(...)  →  yield* this._stub.stream(...)
}
```

- `import * as vscode from 'vscode'` 추가
- `import * as fs from 'fs'` 추가
- `import { ExtensionConfig }` 추가

---

### 4. `src/config/ExtensionConfig.ts` — getUserStubsFolder 추가

```typescript
static getUserStubsFolder(): string {
  return ExtensionConfig._cfg().get<string>('stubs.userStubsFolder', '');
}
```

---

### 5. `src/providers/ChatViewProvider.ts` — extensionUri 전달 + stubs 와처 등록

```typescript
// (a) LlmService 초기화 시 extensionUri 전달
private readonly _llm: LlmService;
constructor(extensionUri: vscode.Uri) {
  ...
  this._llm = new LlmService(extensionUri);
}

// (b) registerCorpusWatcher 내에서 stubs 와처도 함께 등록
this._registerUserStubsWatcher(context);

// (c) 설정 변경 감시에 stubs 조건 추가
if (e.affectsConfiguration('axiom-ai.rag') || e.affectsConfiguration('axiom-ai.stubs')) {
  ...
  this._llm.reloadStubs();
}

// (d) 신규 메서드 — ExternalCorpusWatcher와 동일한 패턴
private _userStubsWatcher: vscode.FileSystemWatcher | null = null;
private _userStubsDebounce: ReturnType<typeof setTimeout> | null = null;

private _registerUserStubsWatcher(context: vscode.ExtensionContext): void {
  const folder = ExtensionConfig.getUserStubsFolder();
  if (!folder) return;

  const pattern = new vscode.RelativePattern(vscode.Uri.file(folder), '**/*.md');
  this._userStubsWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  const reload = () => {
    if (this._userStubsDebounce) clearTimeout(this._userStubsDebounce);
    this._userStubsDebounce = setTimeout(() => {
      this._corpusOutputChannel.appendLine('[hot-reload] User stubs changed, reloading...');
      this._llm.reloadStubs();
    }, 500);
  };

  context.subscriptions.push(
    this._userStubsWatcher,
    this._userStubsWatcher.onDidChange(reload),
    this._userStubsWatcher.onDidCreate(reload),
    this._userStubsWatcher.onDidDelete(reload),
  );
}
```

---

### 6. `package.json` — 설정 키 추가

```json
"axiom-ai.stubs.userStubsFolder": {
  "type": "string",
  "default": "",
  "description": "오프라인 stubs를 보강하거나 덮어쓸 사용자 정의 폴더 경로 (절대경로). 이 폴더의 .md 파일이 번들 stubs보다 우선 적용됩니다."
}
```

---

## 핵심 재사용 패턴 (기존 코드 참고)

| 참고 코드 | 위치 | 재사용 내용 |
|---|---|---|
| extensionUri → fsPath 변환 | `ScaffoldContextBuilder.ts:306` | bundled `.stubs/` 경로 결정 |
| frontmatter 정규식 | `ExternalCorpusLoader.ts` | keywords 파싱 |
| `getUserRagSources()` 패턴 | `ExtensionConfig.ts:45` | `getUserStubsFolder()` 동일하게 추가 |
| `_registerExternalCorpusWatcher()` | `ChatViewProvider.ts:115` | `_registerUserStubsWatcher()` 동일 패턴 |
| LlmService fallback 2곳 | `LlmService.ts:50`, `LlmService.ts:60` | `this._stub.stream(...)` 으로 교체 |

---

## 패키징 영향

`.vscodeignore`에 `.stubs/`가 명시되지 않으면 vsix에 자동 포함됨 (현재 `.rag/`와 동일).
→ 추가 설정 불필요.

---

## 검증 방법

1. AI 서버 꺼진 상태에서 `useApi 사용 예제 보여줘` 입력
   → `.stubs/useapi.md` body가 스트리밍 출력되는지 확인
2. 매칭 없는 질문 입력
   → `.stubs/_default.md` body가 출력되는지 확인
3. `userStubsFolder`에 `useapi.md` 작성 (다른 내용) → 재질문
   → 사용자 파일 내용이 우선 출력되는지 확인
4. `userStubsFolder`에 번들에 없는 새 주제 `tanstack-query.md` 추가 → 관련 질문
   → 추가한 파일 내용이 응답되는지 확인
5. `userStubsFolder`의 파일 수정 시 (VS Code 실행 중)
   → 500ms 후 hot-reload → 수정된 내용이 다음 질문에 바로 반영되는지 확인
6. `userStubsFolder` 미설정 환경
   → 번들 stubs만으로 정상 동작하는지 확인
