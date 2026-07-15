/**
 * region 경로 라이브 재현 프로브 — 2026-07-15 반쪽 편집 채집(BigFile.tsx no-op→full 폴백) 원인 격리용.
 *
 * 운영과 동일한 runHybridRegionEdit를 실 모델(vast qwen)로 구동하되 **원시 모델 출력을 가로채 저장**한다.
 * 가리려는 것: no-op의 범인이 ①모델(영역을 그대로 echo) ②후처리 게이트(모델 훅 조각을 드롭) 중 무엇인가.
 *
 * 실행: node scripts/run-probe-region-live.mjs <파일> "<쿼리>"
 *   설정: AXIOM_ENDPOINT/AXIOM_MODEL/AXIOM_API_KEY (없으면 VSCode 사용자 settings.json)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runHybridRegionEdit } from '../src/ai/pipeline/RegionEditService';
import { resolveModelConfig, callLlm } from './live-model-client';

const file = process.argv[2];
const query = process.argv[3] ?? '직원관리의 상태 select를 api로 바꿔줘';
const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const cfg = resolveModelConfig();
if (!cfg) {
  console.error('❌ AXIOM_ENDPOINT/AXIOM_MODEL 또는 VSCode 설정 필요');
  process.exit(1);
}
console.log(`모델: ${cfg.model} @ ${cfg.endpoint}`);
console.log(`파일: ${file} (${source.length.toLocaleString()}자)`);
console.log(`쿼리: ${query}`);

const captured: { system: string; user: string; raw: string }[] = [];

/** 운영 LlmService와 동일한 ollama 네이티브(/api/chat) 호출 — AXIOM_NATIVE=1일 때 사용.
 *  body는 _buildRequestBody(ollama 분기) 사본: stream:true·think:false·options{temperature,num_predict,num_ctx}. */
async function callOllamaNative(system: string, user: string): Promise<string> {
  const url = new URL('/api/chat', cfg!.endpoint).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' };
  if (cfg!.apiKey) headers['Authorization'] = /^(Bearer|Basic)\s+/i.test(cfg!.apiKey) ? cfg!.apiKey : `Bearer ${cfg!.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg!.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: true,
      think: false,
      options: { temperature: 0.2, num_predict: 16384, num_ctx: 32768 },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const ln of lines) {
      if (!ln.trim()) continue;
      try {
        const j = JSON.parse(ln);
        out += j?.message?.content ?? '';
      } catch { /* partial line */ }
    }
  }
  return out;
}

async function callModel(system: string, user: string): Promise<string> {
  const native = process.env.AXIOM_NATIVE === '1';
  console.log(`\n→ 모델 호출(${native ? 'ollama 네이티브(운영 동일)' : '/v1'}): system ${system.length.toLocaleString()}자 / user ${user.length.toLocaleString()}자 ...`);
  const started = Date.now();
  let text: string;
  if (native) {
    text = await callOllamaNative(system, user);
  } else {
    const r = await callLlm(cfg!, system, user, { maxTokens: 4096, timeoutMs: 180_000 });
    if (!r.ok) throw new Error(r.error ?? 'llm error');
    text = r.text;
  }
  console.log(`← 응답 ${text.length.toLocaleString()}자 (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  captured.push({ system, user, raw: text });
  return text;
}

async function main(): Promise<void> {
// 운영 동일 조건 재현 스위치:
//  AXIOM_ANCHOR_FIRST=1 → anchorFirst(기본 ON 운영값) / AXIOM_DISAMBIG=1 → 후보1 강제 pick(운영 로그 재현)
const anchorFirst = process.env.AXIOM_ANCHOR_FIRST === '1';
const disambiguate =
  process.env.AXIOM_DISAMBIG === '1'
    ? async (_q: string, cands: { startLine: number; endLine: number; label: string; score: number }[]) => {
        console.log(`(disambiguate: 후보 ${cands.length}개 → 1번 "${cands[0]?.label}" 강제 선택 — 운영 로그 재현)`);
        return cands[0] ? { startLine: cands[0].startLine, endLine: cands[0].endLine } : null;
      }
    : undefined;
console.log(`조건: anchorFirst=${anchorFirst} · disambiguate=${disambiguate ? 'on' : 'off'}`);
const outcome = await runHybridRegionEdit(source, query, callModel, undefined, disambiguate, undefined, undefined, anchorFirst);

console.log('\n════════ 결과 ════════');
console.log(`status: ${outcome.status}  reason: ${outcome.reason ?? '-'}`);
console.log('─── diagnostics ───');
console.log(outcome.diagnostics);

if (outcome.status === 'applied' && outcome.finalText) {
  const changed = outcome.finalText !== source;
  console.log(`\nfinalText ≠ 원본? ${changed ? '✅ 변경 있음' : '❌ 동일(no-op인데 applied?)'}`);
  // 변경 라인 요약
  const a = source.split('\n');
  const b = outcome.finalText.split('\n');
  let first = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { first = i + 1; break; }
  }
  console.log(`첫 변경 라인: ${first} · 라인수 ${a.length} → ${b.length}`);
  if (process.argv[5]) {
    writeFileSync(process.argv[5], outcome.finalText, 'utf8');
    console.log(`finalText 저장: ${process.argv[5]}`);
  }
}

// 원시 산출물 저장(프롬프트+응답) — 육안 분석용
const dump = captured
  .map((c, i) => `━━━ 호출 ${i + 1} ━━━\n[SYSTEM]\n${c.system}\n\n[USER]\n${c.user}\n\n[RAW RESPONSE]\n${c.raw}`)
  .join('\n\n');
const outPath = process.argv[4] ?? 'probe-region-live-dump.txt';
writeFileSync(outPath, dump, 'utf8');
console.log(`\n원시 프롬프트/응답 저장: ${outPath} (호출 ${captured.length}회)`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
