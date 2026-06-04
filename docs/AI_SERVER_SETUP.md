React 개발 보조 목적의 현실적 추천
우리가 얘기해온 프론트엔드 개발 보조 + 한국어 환경을 고려하면, 48GB에서 이 조합이 베스트예요.
1순위 — Qwen2.5-Coder 32B (AWQ 4-bit)
코딩 특화 모델 중 오픈 웨이트로는 최상위급입니다. 4비트로 약 18~20GB만 쓰니 48GB에서 긴 컨텍스트(scaffold 파일 여러 개 동시 참조)까지 여유롭게 돌아가요. React/TypeScript 생성 품질이 좋습니다.
2순위 — Qwen2.5-Coder 14B (FP16 or INT8)
32B가 부담되거나 더 빠른 응답을 원하면. 단일 카드로도 가볍게 돌아가고 속도가 빠릅니다.
한국어 주석·문서·협업이 중요하면 — EXAONE 7.8B / HyperCLOVA X
앞서 본 국산 모델들. 코딩은 Qwen 계열에 살짝 밀려도 한국어 처리는 강하니, "코드 생성은 Qwen-Coder, 한국어 문서화·요약은 EXAONE" 식으로 2개를 병행 운영하는 것도 48GB면 충분히 가능합니다(번갈아 로드하거나, 작은 모델은 동시 상주).

# 폐쇄망 AI 서버 투입 매뉴얼 (Axiom AI)

폐쇄망 SI 현장은 사이트마다 들어오는 sLLM 서버·모델이 다르다.
이 문서는 **새 AI 서버를 붙일 때 무엇을 파악하고, 어떻게 설정하며, 최소 사양은 어디인지**를 정리한 운영 가이드다.

관련 코드: [LlmService.ts](../src/ai/LlmService.ts) · [config.ts](../src/ai/config.ts) · [ExtensionConfig.ts](../src/config/ExtensionConfig.ts)

---

## 0. 왜 "빈 응답"이 나오는가 (근본 원인)

빈 응답의 원인은 거의 항상 **"thinking(추론) 토큰이 `max_tokens`를 다 써버려, 사용자에게 보낼 content 토큰이 0개가 된 것"**이다.

Qwen3 · DeepSeek-R1 계열 같은 **추론(reasoning) 모델**은 답 이전에 추론 구간을 먼저 생성한다. 이 추론 토큰은:

- 사용자에게 보이는 `content`가 아니라 별도 필드(`reasoning_content` / `reasoning` / Ollama는 `thinking`)로 흘러나오고,
- 그런데도 `max_tokens` 한도는 똑같이 소모한다.

→ `max_tokens=8192`인데 추론이 8192를 다 먹으면 `finish_reason: "length"`로 끊기고, content는 한 글자도 안 나온다 = **빈 응답**.

이 상황은 콘솔/`axiom-ai: Prompt` 로그의 스트림 종료 라인에서 `reasoningChars > 0` 또는 `finish_reason=length` + 많은 청크로 자동 분류된다.

---

## 1. 새 서버 투입 시 파악할 4가지

| 항목 | 확인 방법 | 영향 설정 |
|---|---|---|
| **① 서빙 방식** (OpenAI 호환 / Ollama 네이티브) | `/v1/models` 응답 = OpenAI 호환, `/api/tags`만 되면 Ollama | `llm.provider` |
| **② 추론 모델 여부** | 로그에 `reasoningChars > 0` 이 찍히는가 | `llm.thinking.*` |
| **③ 게이트웨이 엄격도** | 요청 시 `400 Bad Request`가 나는가 (미지 JSON 필드 거부) | `llm.thinking.sendThinkingParams` |
| **④ 컨텍스트 윈도우 / 인증** | 모델 카드, `401/403` 응답 | `llm.contextWindow`, `llm.apiKey` |

> 핵심은 **②번**이다. "추론 모델이냐 아니냐"가 빈 응답 문제의 거의 전부다.

---

## 2. 서버 유형별 설정 정답값

VSCode `settings.json`(또는 확장 설정 UI)의 `axiom-ai.llm.*` 키.

### A. 일반 모델 (추론 안 함) — qwen2.5-coder, codellama, deepseek-coder 등
```jsonc
"axiom-ai.llm.provider": "openai",
"axiom-ai.llm.thinking.injectNoThink": false,
"axiom-ai.llm.thinking.sendThinkingParams": false,
"axiom-ai.llm.maxTokens": 8192
```
추론을 안 하므로 thinking 억제 자체가 불필요. **가장 안전한 조합.**

### B. 추론 모델 + OpenAI 호환 (vLLM, LM Studio) — Qwen3 등
```jsonc
"axiom-ai.llm.provider": "openai",
"axiom-ai.llm.thinking.injectNoThink": true,
"axiom-ai.llm.thinking.sendThinkingParams": true,
"axiom-ai.llm.maxTokens": 8192
```
`400`이 나면 확장이 자동으로 `sendThinkingParams`를 빼고 1회 재시도한다.
그래도 계속 400이면 `sendThinkingParams`를 영구 `false`로 둔다.

### C. 추론 모델 + Ollama 네이티브 — **가장 확실한 추론 끄기**
```jsonc
"axiom-ai.llm.provider": "ollama",
"axiom-ai.llm.maxTokens": 8192
```
Ollama는 top-level `think:false`로 추론이 확실히 꺼진다. Ollama의 `/v1` 호환 레이어는
`enable_thinking`을 무시하므로, **Ollama 백엔드면 무조건 `provider:"ollama"`로 설정**한다.

### D. 최후의 보루 (어떤 설정도 안 통할 때)
```jsonc
"axiom-ai.llm.maxTokens": 16384
```
추론을 못 끄는 모델이면 한도를 키워 추론 후에도 답변이 나오게 한다.
확장도 빈 응답 감지 시 16384로 자동 1회 재시도하는 폴백을 갖고 있다.

**투입 순서:** A/B 시도 → 빈 응답 로그(`reasoningChars > 0`) 보이면 → Ollama면 C, 아니면 D.

---

## 3. 확장이 자동으로 해주는 폴백 (수동 개입 전에 동작)

| 상황 | 자동 동작 |
|---|---|
| 네트워크 오류 / 5xx | 2초 후 1회 재시도 → 그래도 실패면 오프라인 스텁 폴백 |
| `400 Bad Request` (thinking 파라미터 거부) | `sendThinkingParams` 빼고 1회 재시도 |
| 빈 응답 + 추론 오버플로 | `max_tokens`를 16384로 올려 1회 재시도 |
| `401/403` | 인증 헤더 점검 안내 메시지 (Basic/Bearer 자동 판별) |

→ 즉 `settings.json` 값은 "자동 폴백이 안 통하는 사이트"를 위한 **영구 고정값**이라고 보면 된다.

---

## 4. AI 서버 최소 사양

기본값: `qwen2.5-coder:14b` / `contextWindow: 32768`.

| 등급 | 모델 예시 | VRAM(추정) | 권장 설정 | 비고 |
|---|---|---|---|---|
| **최소 (하한)** | Qwen2.5-Coder **14B** (Q4) | ~10–12GB | `multiPatch.maxPatches: 3`, `lineEdit.requireAnchor: true`, `contextWindow: 32768` | 현재 기본값. anchor/structural 보정으로 약한 모델 보완 |
| **권장 (현행)** | 14B~**32B** | ~20–24GB | 위 + `maxTokens: 8192` | 멀티 patch·라인 편집 안정 |
| **상위** | **70B** | ~40–48GB | `maxPatches: 6`, `requireAnchor: false` 가능 | 출력 최소화 모드 |
| **클라우드급** | 70B+ | — | `maxPatches: 8+` | — |

- **14B가 실용 하한**: 그 이하(7B 등)는 느린 게 아니라 멀티 patch/structural 편집의 **형식 준수율이 급락**해 적용 실패가 늘어난다.
- **컨텍스트 윈도우**: 실제 모델의 윈도우를 `llm.contextWindow`에 **정확히** 입력할 것. 과대 입력 시 프롬프트가 잘려 품질 저하. 프롬프트가 크면 확장이 이 값에 맞춰 RAG 예산을 동적으로 줄인다.

---

## 5. 현장 1페이지 요약

1. **먼저 확인:** Ollama냐 OpenAI 호환이냐 → `provider`.
2. **빈 응답 나오면:** 로그의 `reasoningChars` 확인. > 0 이면 추론 모델 → thinking 억제 필요.
3. **추론 끄기 우선순위:** Ollama면 `provider:"ollama"`(확실) → 아니면 `injectNoThink`/`sendThinkingParams` → 안 되면 `maxTokens:16384`.
4. **최소 사양:** Qwen2.5-Coder 14B / 32K / VRAM ~12GB. 그 이하는 적용 실패율 증가.
