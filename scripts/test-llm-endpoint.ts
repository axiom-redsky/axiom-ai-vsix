/**
 * LLM 서버 주소 조립 테스트 — src/ai/llmEndpoint.
 *
 * 이 하니스가 지키려는 것:
 *  ① ★**게이트웨이 중간 경로 보존**(B·G) — 종전 `new URL('/v1/chat/completions', base)`는 선행 슬래시
 *     때문에 base의 경로를 통째로 버려, `https://gw.co.kr/llm` 뒤에 붙이면 `/llm`이 조용히 사라졌다.
 *     경로 접두사를 쓰는 사내 게이트웨이에서는 아예 붙지 못한다. 그 손실을 여기서 고정한다.
 *  ② **어떤 형태로 받아도 기준 주소를 뽑는다**(A) — 담당자가 주는 주소는 기준만/`/v1`까지/대화 경로까지
 *     제각각이다. 알려진 API 꼬리만 잘라내고 나머지는 건드리지 않는다.
 *  ③ **모드가 동작을 가른다**(C·D) — 'base'는 뒤에 붙이고 'full'은 받은 그대로 쓴다. 사용자가 고른
 *     선택이 실제 호출로 이어지는지 확인한다.
 *  ④ **화면과 요청이 같은 함수를 쓴다** — 설정 화면 미리보기도 resolveLlmUrls를 호출하므로, 여기서
 *     고정한 결과가 곧 사용자가 화면에서 보는 주소다.
 */
import {
  guessProviderFromUrl,
  isValidEndpoint,
  joinUrl,
  normalizeBaseUrl,
  resolveLlmUrls,
} from '../src/ai/llmEndpoint';

let pass = 0;
let fail = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}\n      기대: ${String(expected)}\n      실제: ${String(actual)}`);
  }
}

function ok(cond: boolean, label: string): void {
  eq(cond, true, label);
}

// ═══ A. 기준 주소 뽑기 ══════════════════════════════════════════════════════
console.log('\nA. normalizeBaseUrl — 담당자가 주는 어떤 형태에서도 기준 주소를 뽑는다');
eq(normalizeBaseUrl('http://10.10.20.31:8000'), 'http://10.10.20.31:8000', 'A1: 기준 주소만 주면 그대로');
eq(normalizeBaseUrl('http://10.10.20.31:8000/'), 'http://10.10.20.31:8000', 'A2: 뒤 슬래시 제거');
eq(normalizeBaseUrl('http://10.10.20.31:8000///'), 'http://10.10.20.31:8000', 'A3: 뒤 슬래시 여러 개도 제거');
eq(normalizeBaseUrl('http://10.10.20.31:8000/v1'), 'http://10.10.20.31:8000', 'A4: /v1 꼬리 제거');
eq(normalizeBaseUrl('http://10.10.20.31:8000/v1/chat/completions'), 'http://10.10.20.31:8000', 'A5: 대화 경로 통째로 제거');
eq(normalizeBaseUrl('http://10.10.20.31:8000/v1/models'), 'http://10.10.20.31:8000', 'A6: 모델 목록 경로 제거');
eq(normalizeBaseUrl('http://host:11434/api/chat'), 'http://host:11434', 'A7: Ollama 대화 경로 제거');
eq(normalizeBaseUrl('http://host:11434/api/tags'), 'http://host:11434', 'A8: Ollama 태그 경로 제거');
eq(normalizeBaseUrl('http://host:8000/CHAT/COMPLETIONS'), 'http://host:8000', 'A9: 대소문자 무시하고 꼬리 제거');
eq(normalizeBaseUrl(''), '', 'A10: 빈 값은 빈 값');
eq(normalizeBaseUrl('   '), '', 'A11: 공백만이면 빈 값');
// 꼬리처럼 보이지만 아닌 경로는 건드리지 않는다(모델명·배포명이 경로에 오는 게이트웨이 보호).
eq(normalizeBaseUrl('https://gw.co.kr/v1beta'), 'https://gw.co.kr/v1beta', 'A12: /v1beta는 /v1이 아니다 — 보존');

// ═══ B. ★ 게이트웨이 중간 경로 보존 ════════════════════════════════════════
console.log('\nB. 중간 경로(/llm) 보존 — 이 트랙의 핵심 회귀');
eq(normalizeBaseUrl('https://gw.co.kr/llm'), 'https://gw.co.kr/llm', 'B1: 접두사만 주면 그대로 보존');
eq(
  normalizeBaseUrl('https://gw.co.kr/llm/v1/chat/completions'),
  'https://gw.co.kr/llm',
  'B2: 꼬리는 자르되 접두사는 남긴다',
);
eq(normalizeBaseUrl('https://gw.co.kr/llm/v1'), 'https://gw.co.kr/llm', 'B3: /v1만 자르고 접두사 유지');
eq(
  joinUrl('https://gw.co.kr/llm', 'v1/chat/completions'),
  'https://gw.co.kr/llm/v1/chat/completions',
  'B4: 접두사 뒤에 경로를 붙인다',
);
eq(joinUrl('https://gw.co.kr/llm/', '/v1/models'), 'https://gw.co.kr/llm/v1/models', 'B5: 슬래시 중복 없이 붙는다');
eq(joinUrl('', 'v1/models'), '', 'B6: 기준 주소가 없으면 빈 문자열');

// ═══ C. base 모드 ═══════════════════════════════════════════════════════════
console.log('\nC. resolveLlmUrls — base 모드(뒤에 붙인다)');
{
  const u = resolveLlmUrls('http://10.10.20.31:8000', 'base', 'openai');
  eq(u.chat, 'http://10.10.20.31:8000/v1/chat/completions', 'C1: openai 대화 경로');
  eq(u.models, 'http://10.10.20.31:8000/v1/models', 'C2: 모델 목록');
  eq(u.tags, 'http://10.10.20.31:8000/api/tags', 'C3: Ollama 감지용 태그');
  eq(u.verbatimChat, false, 'C4: base 모드는 그대로 쓰기가 아니다');
}
{
  const u = resolveLlmUrls('http://host:11434', 'base', 'ollama');
  eq(u.chat, 'http://host:11434/api/chat', 'C5: ollama는 네이티브 대화 경로');
}
{
  // 담당자가 대화 경로까지 준 주소를 base 모드에 넣어도 경로가 두 번 붙지 않아야 한다.
  const u = resolveLlmUrls('http://host:8000/v1/chat/completions', 'base', 'openai');
  eq(u.chat, 'http://host:8000/v1/chat/completions', 'C6: 꼬리 딸린 주소를 넣어도 중복되지 않는다');
}
{
  const u = resolveLlmUrls('https://gw.co.kr/llm/v1/chat/completions', 'base', 'openai');
  eq(u.chat, 'https://gw.co.kr/llm/v1/chat/completions', 'C7: ★접두사 게이트웨이 왕복 무손실');
  eq(u.models, 'https://gw.co.kr/llm/v1/models', 'C8: ★모델 목록도 접두사를 유지');
}

// ═══ D. full 모드 ═══════════════════════════════════════════════════════════
console.log('\nD. resolveLlmUrls — full 모드(받은 그대로 쓴다)');
{
  const raw = 'https://gw.co.kr/openai/deployments/qwen/chat/completions';
  const u = resolveLlmUrls(raw, 'full', 'openai');
  eq(u.chat, raw, 'D1: 대화 주소는 손대지 않는다');
  eq(u.verbatimChat, true, 'D2: 그대로 쓰기 표식');
  ok(u.models.length > 0, 'D3: 모델 목록은 기준 주소를 추정해 만든다(실패해도 무해)');
}
{
  // full 모드에서 공백이 섞여 들어와도 트림만 하고 경로는 유지한다.
  const u = resolveLlmUrls('  http://host:8000/custom/chat  ', 'full', 'openai');
  eq(u.chat, 'http://host:8000/custom/chat', 'D4: 앞뒤 공백만 정리');
}

// ═══ E. 형식 검사 ═══════════════════════════════════════════════════════════
console.log('\nE. isValidEndpoint');
ok(isValidEndpoint('http://10.10.20.31:8000'), 'E1: http 통과');
ok(isValidEndpoint('https://gw.co.kr/llm'), 'E2: https 통과');
eq(isValidEndpoint(''), false, 'E3: 빈 값 거부');
eq(isValidEndpoint('10.10.20.31:8000'), false, 'E4: 스킴 없으면 거부');
eq(isValidEndpoint('ftp://host/x'), false, 'E5: http(s)가 아니면 거부');

// ═══ F. 주소로 백엔드 추측 ══════════════════════════════════════════════════
console.log('\nF. guessProviderFromUrl — 주소 자체가 주는 힌트');
eq(guessProviderFromUrl('http://host:11434/api/chat'), 'ollama', 'F1: /api/chat → ollama');
eq(guessProviderFromUrl('http://host:8000/v1/chat/completions'), 'openai', 'F2: /v1/chat/completions → openai');
eq(guessProviderFromUrl('http://host:8000'), null, 'F3: 기준 주소만으로는 알 수 없다');

// ═══ G. ★ 종전 방식과의 차이 고정 ═══════════════════════════════════════════
console.log('\nG. 종전 new URL(선행 슬래시) 방식이 잃던 것');
{
  const legacy = new URL('/v1/chat/completions', 'https://gw.co.kr/llm').toString();
  eq(legacy, 'https://gw.co.kr/v1/chat/completions', 'G1: 종전 방식은 /llm 을 잃는다(문제 재현)');
  const fixed = resolveLlmUrls('https://gw.co.kr/llm', 'base', 'openai').chat;
  ok(fixed !== legacy, 'G2: 새 구현은 종전과 다른 결과를 낸다');
  eq(fixed, 'https://gw.co.kr/llm/v1/chat/completions', 'G3: /llm 을 지킨 주소가 나온다');
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
