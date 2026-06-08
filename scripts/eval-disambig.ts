/**
 * 영역 disambiguation(모델 객관식) 측정 하니스 — record/replay.
 *
 * 측정 대상: locate가 결정론으로 추린 candidates(후보+라벨)를 모델에 객관식으로 제시했을 때,
 *  모델이 고른 영역이 **정답 라벨**과 일치하는가 = "우선순위 판단을 모델에 위임"의 pick 정확도.
 *  ([[project_region_disambiguation]]. locate/규칙 변경이 후보 품질을 떨어뜨리면 여기서 드러난다.)
 *
 * record/replay는 같은 buildDisambiguationPrompt/parseDisambiguationPick을 쓴다 — callModel만 다르다:
 *  - record : 실 sLLM 호출 → 원시 응답을 scripts/eval-recordings-disambig/<id>.json 에 저장
 *  - replay : 녹화 응답을 parseDisambiguationPick으로 결정론 재현(모델·네트워크 불필요)
 *
 * 실행:
 *   npm run eval:disambig          # replay(기본) — 빠르고 결정론, CI 회귀용
 *   npm run eval:disambig:record   # record — 실 sLLM 호출(AXIOM_EVAL_* 환경변수)
 *
 * 회귀: replay에서 expect 라벨과 불일치(또는 후보에서 정답이 빠짐)면 종료코드 1.
 * 녹화물은 .gitignore(로컬 전용). 녹화 없는 케이스는 'no-recording'으로 표기만 한다(클린 체크아웃 보호).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { locateEditRegion, type RegionCandidate } from '../src/ai/RegionEdit';
import { buildDisambiguationPrompt, parseDisambiguationPick } from '../src/ai/RegionEditService';
import { AI_DEFAULTS } from '../src/ai/config';
import { FIXTURES } from './eval-region-corpus';

const REC_DIR = path.resolve(process.cwd(), 'scripts/eval-recordings-disambig');

interface DCase {
  id: string;
  file: string; // FIXTURES 키
  query: string;
  /** 정답 후보 라벨(모델이 골라야 하는 것). 후보에 이 라벨이 없으면 케이스 설계 오류로 본다. */
  expect: string;
  note?: string;
}

// 합성(커밋 가능) 픽스처 기반 케이스. 디스크 실파일(.gitignore)은 로컬에서만 자동 합류.
const CASES: DCase[] = [
  { id: 'emp-hiredate', file: 'EMPLOYEE_FORM', query: '입사일 input을 Calendar로 적용해줘', expect: '입사일', note: '여러 필드 중 입사일(흔한 input이 다른 필드 누르는 케이스)' },
  { id: 'emp-name', file: 'EMPLOYEE_FORM', query: '이름 입력칸 안내문구를 바꿔줘', expect: '이름', note: '이름 필드' },
  { id: 'mem-status', file: 'MEMBER_LIST', query: '재직상태 필터를 공통코드 api로 바꿔줘', expect: '재직상태 필터', note: 'Select(옵션 텍스트 노이즈 속 정답)' },
];

interface Recording {
  caseId: string;
  model: string;
  recordedAt: string;
  query: string;
  /** 녹화 시점 후보 라벨(스냅 — 후보 생성이 바뀌면 stale 감지). */
  candidateLabels: string[];
  /** 모델 원시 응답. */
  output: string;
}

// ── 최소 LLM 호출기(vscode 비의존) ─────────────────────────────────────────────
interface EvalLlmConfig { endpoint: string; model: string; provider: 'openai' | 'ollama'; apiKey: string; maxTokens: number; temperature: number; }
function evalLlmConfig(): EvalLlmConfig {
  const provider = (process.env.AXIOM_EVAL_PROVIDER ?? AI_DEFAULTS.provider) as 'openai' | 'ollama';
  return {
    endpoint: process.env.AXIOM_EVAL_ENDPOINT ?? AI_DEFAULTS.endpoint,
    model: process.env.AXIOM_EVAL_MODEL ?? AI_DEFAULTS.model,
    provider,
    apiKey: process.env.AXIOM_EVAL_API_KEY ?? '',
    maxTokens: 32, // 번호만 받으면 되므로 짧게
    temperature: Number(process.env.AXIOM_EVAL_TEMPERATURE ?? 0),
  };
}
async function callRealModel(cfg: EvalLlmConfig, system: string, user: string): Promise<string> {
  const isOllama = cfg.provider === 'ollama';
  const url = new URL(isOllama ? '/api/chat' : '/v1/chat/completions', cfg.endpoint).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) headers.Authorization = /^(Bearer|Basic)\s+/i.test(cfg.apiKey) ? cfg.apiKey.trim() : `Bearer ${cfg.apiKey.trim()}`;
  const body = isOllama
    ? { model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false, think: false, options: { temperature: cfg.temperature, num_predict: cfg.maxTokens } }
    : { model: cfg.model, messages: [{ role: 'system', content: `${system}\n\n/no_think` }, { role: 'user', content: user }], stream: false, temperature: cfg.temperature, max_tokens: cfg.maxTokens, enable_thinking: false, chat_template_kwargs: { enable_thinking: false } };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LLM ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; message?: { content?: string } };
  return ((isOllama ? json.message?.content : json.choices?.[0]?.message?.content) ?? '').toString();
}

const SYSTEM = '당신은 코드 편집 영역 선택기입니다. 후보 번호 하나만 숫자로 답하세요. 애매하면 0.';

function candidatesFor(c: DCase): RegionCandidate[] | null {
  const src = FIXTURES[c.file];
  if (src === undefined) return null; // 픽스처 없음(클린 체크아웃) → skip
  return locateEditRegion(src, c.query).candidates;
}

// ── record ──────────────────────────────────────────────────────────────────
async function record(): Promise<void> {
  const cfg = evalLlmConfig();
  fs.mkdirSync(REC_DIR, { recursive: true });
  console.log(`disambig record — endpoint=${cfg.endpoint} model=${cfg.model} provider=${cfg.provider}\n`);
  let recorded = 0;
  for (const c of CASES) {
    const cands = candidatesFor(c);
    if (!cands) { console.log(`  · ${c.id}: skip(픽스처 없음)`); continue; }
    if (cands.length < 2) { console.log(`  · ${c.id}: skip(후보 ${cands.length}개 — disambiguation 불필요)`); continue; }
    const prompt = buildDisambiguationPrompt(c.query, cands);
    let out: string;
    try { out = await callRealModel(cfg, SYSTEM, prompt); }
    catch (e) { console.log(`  ❌ ${c.id}: 모델 호출 실패 — ${(e as Error).message}`); continue; }
    const rec: Recording = { caseId: c.id, model: cfg.model, recordedAt: new Date().toISOString(), query: c.query, candidateLabels: cands.map((x) => x.label), output: out };
    fs.writeFileSync(path.join(REC_DIR, `${c.id}.json`), JSON.stringify(rec, null, 2));
    recorded++;
    const pick = parseDisambiguationPick(out, cands);
    const ok = pick?.label === c.expect;
    console.log(`  ${ok ? '✅' : '❌'} ${c.id}: 응답 ${JSON.stringify(out.trim().slice(0, 12))} → ${pick ? `"${pick.label}"` : '불확실'} (정답 "${c.expect}")`);
  }
  console.log(`\n녹화 완료: ${recorded}개 → ${path.relative(process.cwd(), REC_DIR)}/`);
}

// ── replay ────────────────────────────────────────────────────────────────────
type Verdict = 'match' | 'miss' | 'uncertain' | 'no-candidate' | 'no-recording' | 'skip';
async function replay(): Promise<void> {
  const rows: { c: DCase; verdict: Verdict; detail: string }[] = [];
  for (const c of CASES) {
    const cands = candidatesFor(c);
    if (!cands) { rows.push({ c, verdict: 'skip', detail: '픽스처 없음' }); continue; }
    const recPath = path.join(REC_DIR, `${c.id}.json`);
    if (!fs.existsSync(recPath)) { rows.push({ c, verdict: 'no-recording', detail: `후보 ${cands.length}개` }); continue; }
    // 후보에 정답 라벨이 아예 없으면 — locate/regionLabel이 정답을 못 만든 것(케이스 설계 또는 후보 품질 회귀).
    if (!cands.some((x) => x.label === c.expect)) { rows.push({ c, verdict: 'no-candidate', detail: `후보=[${cands.map((x) => x.label).join(', ')}] (정답 "${c.expect}" 없음)` }); continue; }
    const rec = JSON.parse(fs.readFileSync(recPath, 'utf8')) as Recording;
    const pick = parseDisambiguationPick(rec.output, cands);
    if (!pick) rows.push({ c, verdict: 'uncertain', detail: `응답 ${JSON.stringify(rec.output.trim().slice(0, 12))}` });
    else if (pick.label === c.expect) rows.push({ c, verdict: 'match', detail: `"${pick.label}"` });
    else rows.push({ c, verdict: 'miss', detail: `골랐음 "${pick.label}" ≠ 정답 "${c.expect}"` });
  }

  console.log('disambig(replay) — 모델 pick 정확도:\n');
  const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  for (const r of rows) {
    const icon = r.verdict === 'match' ? '✅' : r.verdict === 'miss' || r.verdict === 'no-candidate' ? '❌' : r.verdict === 'uncertain' ? '⚠️' : '·';
    console.log(`  ${icon} ${pad(r.c.id, 16)} ${pad(r.verdict, 13)} ${r.detail}`);
  }

  const scored = rows.filter((r) => r.verdict === 'match' || r.verdict === 'miss' || r.verdict === 'uncertain');
  const matched = rows.filter((r) => r.verdict === 'match').length;
  const acc = scored.length ? Math.round((matched / scored.length) * 100) : 0;
  const noCand = rows.filter((r) => r.verdict === 'no-candidate').length;
  const noRec = rows.filter((r) => r.verdict === 'no-recording').length;
  console.log('\n집계 (녹화된 케이스 기준):');
  console.log(`  • pick 정확도: ${scored.length ? `${acc}% (${matched}/${scored.length})` : '(녹화 없음)'}`);
  console.log(`  • 후보누락(정답이 후보에 없음): ${noCand}, no-recording: ${noRec}`);
  if (noRec > 0) console.log(`  ⃠ no-recording ${noRec}개 — \`npm run eval:disambig:record\`로 녹화 필요(서버 연결).`);

  // 회귀: 후보누락 또는 miss는 실패.
  const fails = rows.filter((r) => r.verdict === 'miss' || r.verdict === 'no-candidate');
  if (fails.length > 0) {
    console.log(`\n❌ disambig 회귀: ${fails.map((r) => `${r.c.id}(${r.verdict})`).join(', ')}`);
    process.exitCode = 1;
  } else if (scored.length > 0) {
    console.log(`\n✅ disambig 회귀 없음 (match ${matched}/${scored.length})`);
  }
}

const mode = process.argv.includes('--record') ? 'record' : 'replay';
(mode === 'record' ? record() : replay()).catch((e) => {
  console.error(`[eval:disambig] 실패: ${(e as Error).message}`);
  process.exitCode = 1;
});
