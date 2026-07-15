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

async function callModel(system: string, user: string): Promise<string> {
  console.log(`\n→ 모델 호출: system ${system.length.toLocaleString()}자 / user ${user.length.toLocaleString()}자 ...`);
  const r = await callLlm(cfg!, system, user, { maxTokens: 4096, timeoutMs: 180_000 });
  if (!r.ok) throw new Error(r.error ?? 'llm error');
  console.log(`← 응답 ${r.text.length.toLocaleString()}자 (${(r.elapsedMs / 1000).toFixed(1)}s)`);
  captured.push({ system, user, raw: r.text });
  return r.text;
}

async function main(): Promise<void> {
const outcome = await runHybridRegionEdit(source, query, callModel);

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
