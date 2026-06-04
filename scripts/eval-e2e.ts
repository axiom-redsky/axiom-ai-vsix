/**
 * region/hybrid 엔드투엔드(모델 출력 레이어) 측정 하니스 — record/replay.
 *
 * eval-region(=locateEditRegion까지만, 모델 무관)이 못 보는 "그 다음"을 측정한다:
 *  모델이 <region>/<hook>/<import>를 뱉은 뒤 runHybridRegionEdit이 통과시키는 후처리 게이트
 *  (root-tag-mismatch / unresolved-deps / unresolved-components / empty-output / no-op)가
 *  실제 약한 sLLM 출력에서 얼마나 발동하는가 = 모델·프롬프트 품질의 계기판.
 *
 * record와 replay는 **같은** runHybridRegionEdit을 통과한다 — callModel 주입만 다르다:
 *  - record : callModel = 실제 sLLM 호출 → 원시 출력을 scripts/eval-recordings/<id>.json 에 저장
 *  - replay : callModel = 녹화 출력 반환 → 후처리 게이트가 결정론으로 재현(모델·네트워크 불필요)
 * 후처리 게이트는 양쪽에서 동일 코드라 replay는 record와 동일한 status를 결정론으로 낸다.
 *
 * 실행:
 *   npm run eval:e2e            # replay(기본) — 빠르고 결정론, CI 회귀용
 *   npm run eval:e2e:record     # record    — 실제 sLLM 호출(환경변수로 엔드포인트 지정)
 *
 * record 환경변수(미지정 시 AI_DEFAULTS):
 *   AXIOM_EVAL_ENDPOINT  AXIOM_EVAL_MODEL  AXIOM_EVAL_PROVIDER(openai|ollama)
 *   AXIOM_EVAL_API_KEY   AXIOM_EVAL_MAX_TOKENS  AXIOM_EVAL_TEMPERATURE
 *
 * 회귀: expectE2E가 적힌 케이스는 replay에서 status 불일치 시 종료코드 1.
 * 녹화물은 .gitignore(고객 실파일 픽스처 파생 — 로컬 전용). 녹화 없는 eligible 케이스는
 * 'no-recording'으로 표기만 하고 회귀로 치지 않는다(클린 체크아웃 보호).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runHybridRegionEdit } from '../src/ai/RegionEditService';
import { locateEditRegion } from '../src/ai/RegionEdit';
import { AI_DEFAULTS } from '../src/ai/config';
import { CASES, FIXTURES, type EvalCase } from './eval-region-corpus';

const REC_DIR = path.resolve(process.cwd(), 'scripts/eval-recordings');
const estTokens = (s: string): number => Math.ceil(s.length / 4);

interface Recording {
  caseId: string;
  model: string;
  provider: string;
  recordedAt: string;
  /** staleness 감지용 — 녹화 시점 쿼리. 현재 corpus 쿼리와 다르면 재녹화 필요. */
  query: string;
  /** 모델 원시 출력(<region>/<hook>/<import> 포함). */
  output: string;
}

// ── 최소 LLM 호출기(vscode 비의존) ────────────────────────────────────────
// LlmService는 vscode를 import해 node 하니스에서 못 쓴다. 여기선 비스트리밍 1회 호출로
// 충분(측정 목적). thinking 억제만 LlmService와 동일 정책으로 최소 반영한다.
interface EvalLlmConfig {
  endpoint: string;
  model: string;
  provider: 'openai' | 'ollama';
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

function evalLlmConfig(): EvalLlmConfig {
  const provider = (process.env.AXIOM_EVAL_PROVIDER ?? AI_DEFAULTS.provider) as 'openai' | 'ollama';
  return {
    endpoint: process.env.AXIOM_EVAL_ENDPOINT ?? AI_DEFAULTS.endpoint,
    model: process.env.AXIOM_EVAL_MODEL ?? AI_DEFAULTS.model,
    provider,
    apiKey: process.env.AXIOM_EVAL_API_KEY ?? '',
    maxTokens: Number(process.env.AXIOM_EVAL_MAX_TOKENS ?? AI_DEFAULTS.maxTokens),
    temperature: Number(process.env.AXIOM_EVAL_TEMPERATURE ?? AI_DEFAULTS.temperature),
  };
}

async function callRealModel(cfg: EvalLlmConfig, system: string, user: string): Promise<string> {
  const isOllama = cfg.provider === 'ollama';
  const url = new URL(isOllama ? '/api/chat' : '/v1/chat/completions', cfg.endpoint).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) {
    headers.Authorization = /^(Bearer|Basic)\s+/i.test(cfg.apiKey) ? cfg.apiKey.trim() : `Bearer ${cfg.apiKey.trim()}`;
  }

  let body: unknown;
  if (isOllama) {
    body = {
      model: cfg.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      stream: false,
      think: false,
      options: { temperature: cfg.temperature, num_predict: cfg.maxTokens },
    };
  } else {
    // qwen3 계열 thinking 억제: /no_think 소프트 스위치 + enable_thinking 파라미터.
    body = {
      model: cfg.model,
      messages: [{ role: 'system', content: `${system}\n\n/no_think` }, { role: 'user', content: user }],
      stream: false,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    };
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`LLM ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    message?: { content?: string };
  };
  const content = isOllama ? json.message?.content : json.choices?.[0]?.message?.content;
  return (content ?? '').toString();
}

// ── record ────────────────────────────────────────────────────────────────
async function record(): Promise<void> {
  const cfg = evalLlmConfig();
  fs.mkdirSync(REC_DIR, { recursive: true });
  console.log(`e2e record — endpoint=${cfg.endpoint}\n  model=${cfg.model} provider=${cfg.provider} maxTokens=${cfg.maxTokens}\n`);

  let recorded = 0;
  for (const c of CASES) {
    const src = FIXTURES[c.file];
    if (src === undefined) {
      console.log(`  · ${c.id}: skip(픽스처 없음)`);
      continue;
    }
    const loc = locateEditRegion(src, c.query);
    if (!loc.safety.ok) {
      console.log(`  · ${c.id}: locate-fallback(${loc.safety.gate}) — 모델 미호출`);
      continue;
    }
    // runHybridRegionEdit은 callModel 예외를 내부에서 삼켜 status:'error'로만 반환한다.
    // 실제 HTTP 에러 메시지를 표면화하려고 closure에 보관하고, 호출 실패 시 녹화하지 않는다
    // (빈 출력을 디스크에 남기면 replay가 오염됨).
    let captured = '';
    let callError: Error | null = null;
    const outcome = await runHybridRegionEdit(src, c.query, async (system, user) => {
      try {
        captured = await callRealModel(cfg, system, user);
        return captured;
      } catch (e) {
        callError = e as Error;
        throw e;
      }
    });
    if (callError !== null || outcome.status === 'error') {
      const msg = callError !== null ? (callError as Error).message : (outcome.reason ?? 'model-call');
      console.log(`  ❌ ${c.id}: 모델 호출 실패 — ${msg} (녹화 안 함)`);
      continue;
    }
    const rec: Recording = {
      caseId: c.id,
      model: cfg.model,
      provider: cfg.provider,
      recordedAt: new Date().toISOString(),
      query: c.query,
      output: captured,
    };
    fs.writeFileSync(path.join(REC_DIR, `${c.id}.json`), JSON.stringify(rec, null, 2));
    recorded++;
    const tag = outcome.status === 'applied' ? '✅' : '⚠️';
    console.log(`  ${tag} ${c.id}: 녹화(${captured.length}자) → e2e=${outcome.status}${outcome.reason ? `(${outcome.reason})` : ''}`);
  }
  console.log(`\n녹화 완료: ${recorded}개 → ${path.relative(process.cwd(), REC_DIR)}/`);
  console.log('이제 `npm run eval:e2e`로 결정론 재생/회귀 측정.');
}

// ── replay ──────────────────────────────────────────────────────────────────
type Status = 'applied' | 'fallback' | 'error' | 'locate-fallback' | 'no-recording';

interface Row {
  c: EvalCase;
  status: Status;
  /** 폴백/에러 사유 또는 locate 게이트명. */
  reason: string;
  outTok: number;
  stale: boolean;
  regression: boolean;
}

async function replay(): Promise<void> {
  const rows: Row[] = [];

  for (const c of CASES) {
    const src = FIXTURES[c.file];
    if (src === undefined) continue; // 픽스처 없음 → 조용히 skip(클린 체크아웃)

    const loc = locateEditRegion(src, c.query);
    if (!loc.safety.ok) {
      rows.push({ c, status: 'locate-fallback', reason: loc.safety.gate, outTok: 0, stale: false, regression: false });
      continue;
    }

    const recPath = path.join(REC_DIR, `${c.id}.json`);
    if (!fs.existsSync(recPath)) {
      rows.push({ c, status: 'no-recording', reason: '', outTok: 0, stale: false, regression: false });
      continue;
    }

    const rec = JSON.parse(fs.readFileSync(recPath, 'utf8')) as Recording;
    const stale = rec.query !== c.query;
    const outcome = await runHybridRegionEdit(src, c.query, async () => rec.output);
    const status = outcome.status as Status;
    const reason = outcome.reason ?? '';

    // 회귀: expectE2E가 있고 stale이 아닐 때만 판정(stale은 경고만).
    let regression = false;
    if (c.expectE2E !== undefined && !stale) {
      const statusMiss = (c.expectE2E === 'applied') !== (status === 'applied');
      const reasonMiss =
        c.expectE2E === 'fallback' && c.expectE2EReason !== undefined && c.expectE2EReason !== reason;
      regression = statusMiss || reasonMiss;
    }
    rows.push({ c, status, reason, outTok: estTokens(rec.output), stale, regression });
  }

  report(rows);
}

function report(rows: Row[]): void {
  const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

  console.log('e2e(replay) — 모델 출력 레이어 측정:\n');
  console.log(`  ${pad('id', 22)} ${pad('status', 15)} ${pad('reason', 22)} ${pad('outTok', 7)} note`);
  console.log(`  ${'-'.repeat(86)}`);
  for (const r of rows) {
    const mark = r.regression
      ? '❌'
      : r.status === 'applied'
        ? '✅'
        : r.status === 'fallback' || r.status === 'error'
          ? '⚠️'
          : r.status === 'no-recording'
            ? '⃠'
            : '·';
    const reason = r.stale ? `${r.reason || '—'} (stale)` : r.reason || '—';
    console.log(`  ${mark} ${pad(r.c.id, 20)} ${pad(r.status, 15)} ${pad(reason, 22)} ${pad(String(r.outTok || '—'), 7)} ${r.c.note ?? ''}`);
  }

  // ── 집계: recording 있는 eligible 케이스(=실제 모델 출력 통과)만 분모로 ──
  const recorded = rows.filter((r) => r.status === 'applied' || r.status === 'fallback' || r.status === 'error');
  const applied = recorded.filter((r) => r.status === 'applied');
  const appliedRate = recorded.length ? Math.round((applied.length / recorded.length) * 100) : 0;

  const gateDist = new Map<string, number>();
  for (const r of recorded.filter((x) => x.status === 'fallback')) {
    gateDist.set(r.reason, (gateDist.get(r.reason) ?? 0) + 1);
  }
  const errors = recorded.filter((r) => r.status === 'error').length;
  const meanOutTok = applied.length ? Math.round(applied.reduce((a, r) => a + r.outTok, 0) / applied.length) : 0;

  const noRec = rows.filter((r) => r.status === 'no-recording').length;
  const locFb = rows.filter((r) => r.status === 'locate-fallback').length;
  const stale = rows.filter((r) => r.stale).length;

  console.log('\n집계 (녹화된 eligible 케이스 기준):');
  console.log(`  • 적용률(applied): ${appliedRate}% (${applied.length}/${recorded.length})`);
  console.log(
    `  • 후처리 게이트 분포: ${gateDist.size ? [...gateDist.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(', ') : '(없음)'}`,
  );
  console.log(`  • error(모델 호출 실패): ${errors}`);
  console.log(`  • 평균 출력 토큰(applied): ${meanOutTok}`);
  console.log(`  • 참고: locate-fallback=${locFb}, no-recording=${noRec}, stale=${stale}`);
  if (noRec > 0) {
    console.log(`  ⃠ no-recording ${noRec}개 — \`npm run eval:e2e:record\`로 녹화 필요(서버 연결).`);
  }
  if (stale > 0) {
    console.log(`  ⚠️ stale ${stale}개 — corpus 쿼리가 녹화 후 바뀜. 재녹화 권장(회귀 판정 보류됨).`);
  }

  // ── 회귀 판정 ──
  const regressions = rows.filter((r) => r.regression);
  if (regressions.length > 0) {
    console.log('\n❌ e2e 회귀(expectE2E 불일치):');
    for (const r of regressions) {
      const exp = r.c.expectE2E === 'fallback' && r.c.expectE2EReason ? `fallback(${r.c.expectE2EReason})` : r.c.expectE2E;
      const act = r.status === 'fallback' ? `fallback(${r.reason})` : r.status;
      console.log(`   - ${r.c.id}: 기대=${exp} 실제=${act}`);
    }
    process.exitCode = 1;
  } else {
    const pinned = rows.filter((r) => r.c.expectE2E !== undefined && !r.stale).length;
    console.log(`\n✅ e2e 회귀 없음 (expectE2E 못박은 ${pinned}개 일치)`);
  }
}

// ── entry ────────────────────────────────────────────────────────────────────
const mode = process.argv.includes('--record') ? 'record' : 'replay';
(mode === 'record' ? record() : replay()).catch((e) => {
  console.error(`[eval:e2e] 실패: ${(e as Error).message}`);
  process.exitCode = 1;
});
