# AI 서버 오프라인 폴백 구현 플랜

## Context

sLLM 서버(Cloudflare Workers / 로컬 Ollama 등)와 연결이 끊겼을 때, 현재는 `{ type: 'error', message }` 메시지만 WebView에 전달하고 끝난다. 사용자 경험상 아무런 도움이 안 되는 에러 메시지 대신, 키워드 기반 사전 정의 응답(스텁)을 자연스러운 스트리밍 형태로 반환해 최소한의 가이드를 제공한다.

`media/plan/all.md` Layer 1의 MSW 하네스 패턴에서 착안하되, VS Code 확장 환경에서는 MSW 대신 AsyncGenerator 인터페이스 수준에서 폴백을 처리한다.

---

## 폴백 동작 트리거 조건

| 에러 유형 | 폴백 여부 | 이유 |
|-----------|-----------|------|
| `TypeError: Failed to fetch` (네트워크 끊김) | ✅ | 서버 미응답 |
| HTTP 5xx | ✅ | 서버 오류로 응답 불가 |
| HTTP 4xx | ❌ | 잘못된 요청, 폴백 의미 없음 |
| `AbortError` | ❌ | 사용자 취소, 그대로 throw |

---

## 아키텍처

```
ChatViewProvider._handleMessage()
    wasFallback = false
    onFallback = (reason) => { wasFallback = true }
    │
    ↓
LlmService.streamChat(messages, config, signal, onFallback?)
    ├─ fetch() 실패 (TypeError) → onFallback() + yield* FallbackStubService.stream()
    ├─ response.status >= 500   → onFallback() + yield* FallbackStubService.stream()
    ├─ response.status 4xx      → throw (기존 경로)
    └─ 정상 → SSE 스트리밍 그대로
    │
    ↓
for await (token) { postMessage({ type: 'token', content: token }) }
    │
    ↓
postMessage({ type: 'done' })
postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model)
```

---

## 구현 파일

### 1. `src/ai/FallbackStubService.ts` (신규)

키워드 → 스텁 응답 매핑 + AsyncGenerator 스트리밍.

```typescript
const TICK3 = '```';

interface StubEntry {
  keywords: string[];
  response: string;
}

const STUBS: StubEntry[] = [
  {
    keywords: ['리팩터링', '리팩토링', 'refactor'],
    response: `> ⚠️ 오프라인 모드 — 사전 정의 응답입니다\n\n## 리팩터링 체크리스트\n\n- 함수를 작게 분리하세요 (단일 책임 원칙)\n- 변수명을 의미 있게 변경하세요\n- 중복 코드를 추출하세요\n\n${TICK3}typescript\n// AI 서버 연결 후 실제 리팩터링 코드를 받아보세요\n${TICK3}`,
  },
  {
    keywords: ['테스트', 'test', '단위테스트'],
    response: `> ⚠️ 오프라인 모드 — 사전 정의 응답입니다\n\n## 테스트 코드 템플릿\n\n${TICK3}typescript\ndescribe('대상 함수', () => {\n  it('정상 동작해야 한다', () => {\n    // Arrange\n    // Act\n    // Assert — AI 서버 연결 후 실제 케이스를 생성받으세요\n  });\n});\n${TICK3}`,
  },
  {
    keywords: ['설명', 'explain', '어떻게', '뭐야', '무엇'],
    response: `> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없어 상세 설명이 불가합니다.\n\n서버 상태를 확인 후 다시 질문해주세요.`,
  },
];

const DEFAULT_STUB =
  '> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없습니다.\n\n서버 엔드포인트 설정을 확인하거나 잠시 후 다시 시도해주세요.';

export class FallbackStubService {
  selectStub(userText: string): string {
    const q = userText.toLowerCase();
    for (const entry of STUBS) {
      if (entry.keywords.some(kw => q.includes(kw))) return entry.response;
    }
    return DEFAULT_STUB;
  }

  async *stream(userText: string): AsyncGenerator<string> {
    const text = this.selectStub(userText);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const words = lines[i].split(' ');
      for (let j = 0; j < words.length; j++) {
        yield j === 0 ? words[j] : ' ' + words[j];
        await new Promise<void>(r => setTimeout(r, 18));
      }
      if (i < lines.length - 1) yield '\n';
    }
  }
}
```

**설계 근거:**
- `selectStub`을 `public`으로 노출 → 향후 단위 테스트에서 키워드 매칭 직접 검증 가능
- 딜레이 18ms × 단어 단위 → 너무 빠르지도 느리지도 않은 스트리밍 체감
- `tsconfig.json`의 `lib: ["ES2020"]` 때문에 `findLast` 사용 불가 → `STUBS` 배열 순회로 처리

---

### 2. `src/ai/LlmService.ts` (수정)

**변경 범위:** 시그니처에 `onFallback?` 추가 + fetch 래핑 + 5xx 분기 수정

```typescript
// 상단 import 추가
import { FallbackStubService } from './FallbackStubService';

// streamChat 시그니처 변경
async *streamChat(
  messages: ChatMessage[],
  config: LlmConfig,
  signal?: AbortSignal,
  onFallback?: (reason: string) => void,   // ← 추가
): AsyncGenerator<string> {

  // ... url, headers 구성 동일 ...

  // fetch를 try/catch로 감싸기
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: ..., signal });
  } catch (fetchErr) {
    if ((fetchErr as Error).name === 'AbortError') throw fetchErr;
    const reason = (fetchErr as Error).message;
    console.warn(`[Axiom AI] 네트워크 오류, 폴백 모드: ${reason}`);
    onFallback?.(reason);
    const userText = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    yield* new FallbackStubService().stream(userText);
    return;
  }

  console.log(`[Axiom AI] ← 응답 상태: ${response.status} ${response.statusText}`);

  // 5xx → 폴백
  if (response.status >= 500) {
    const reason = `서버 오류 ${response.status} ${response.statusText}`;
    console.warn(`[Axiom AI] ${reason}, 폴백 모드 활성화`);
    onFallback?.(reason);
    const userText = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    yield* new FallbackStubService().stream(userText);
    return;
  }

  // 4xx → throw (기존과 동일)
  if (!response.ok) {
    throw new Error(`sLLM 서버 오류: ${response.status} ${response.statusText}`);
  }

  // 이하 response.body 스트리밍 로직 동일
```

---

### 3. `src/providers/ChatViewProvider.ts` (수정)

**변경 범위:** `_handleMessage()` 내 약 12줄

```typescript
// 기존 라인 176~188 구간 교체
let wasFallback = false;

for await (const token of this._llm.streamChat(
  messages,
  config,
  this._abortController.signal,
  (reason) => {
    wasFallback = true;
    console.warn(`[Axiom AI] 오프라인 폴백: ${reason}`);
  },
)) {
  fullResponse += token;
  this._post({ type: 'token', content: token });
}

this._post({ type: 'done' });
this._postStatus(wasFallback ? '⚠️ 오프라인 모드' : config.model);  // ← 기존 라인 188 교체
```

**폴백 시 나머지 흐름은 변경 없음:**
- `cleanedResponse` → `_history.push` 정상 동작 (스텁 응답도 히스토리에 저장)
- `_handleAxiomAction(fullResponse)` — 스텁에는 `<axiom-action>` 블록이 없으므로 무해하게 통과

---

## 검증 방법

1. **정상 경로**: 서버 가동 상태에서 채팅 → 기존과 동일하게 스트리밍, 상태바에 모델명 표시
2. **네트워크 오프라인**: VS Code의 설정에서 endpoint를 없는 주소로 바꾸거나, 개발자도구 네트워크 차단 후 채팅
   - 폴백 응답이 스트리밍으로 표시되는지 확인
   - 상태바에 `⚠️ 오프라인 모드` 표시 확인
   - 키워드("리팩터링", "테스트", "설명") 포함 질문으로 매칭 확인
3. **5xx 시뮬레이션**: endpoint를 항상 500을 반환하는 mock 서버 주소로 변경 후 동일 검증
4. **AbortError**: 스트리밍 중 Stop 버튼 → 폴백 없이 즉시 종료 확인
5. **4xx**: endpoint에 인증 필요 서버(401) 지정 → 에러 메시지 그대로 표시 확인 (폴백 미동작)

---

## 변경 파일 요약

| 파일 | 변경 유형 | 변경량 |
|------|-----------|--------|
| `src/ai/FallbackStubService.ts` | 신규 | ~60줄 |
| `src/ai/LlmService.ts` | 수정 | +20줄, ~5줄 재구성 |
| `src/providers/ChatViewProvider.ts` | 수정 | ~12줄 교체 |
