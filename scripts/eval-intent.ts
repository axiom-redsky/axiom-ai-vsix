/**
 * 오프라인 의도 분류 측정 하니스 (실제 로컬 임베딩 사용).
 *
 * 두 분포를 **양면 게이트**로 본다(이 분리가 이 하니스의 핵심):
 *  - in-dist(scripts/fixtures/intent-eval.json): 익숙한 표현. 정규식이 강한 홈그라운드.
 *  - 롱테일(scripts/fixtures/intent-longtail.json): 새로운 말투(적대적). 리졸버 재설계의 진짜 전장.
 *    "에디터에 페이지가 열린 상태"(currentFile 있음)를 가정해 평가한다.
 *
 * 각 세트별로 분류기 단독 top-1 / 리졸버 최종(되묻기 제외) precision / 되묻기율 / 혼동행렬을 출력하고,
 * **두 세트 모두** 베이스라인 미만이면 종료코드 1. (예전엔 in-dist만 봐서 롱테일이 깜깜이였다 —
 * 분류기를 바꾸면 in-dist 게이트는 초록불인데 롱테일이 조용히 후퇴하는 사고가 났다. 그 사각을 없앤다.)
 *
 * 첫 실행 시 @xenova/transformers 모델을 1회 다운로드·캐시한다(인터넷 필요).
 * 실행: npm run eval:intent  (node scripts/run-eval-intent.mjs)
 */
import * as fs from 'fs';
import * as path from 'path';
import { IntentExampleStore } from '../src/ai/intent/IntentExampleStore';
import { IntentEmbeddingClassifier } from '../src/ai/intent/IntentEmbeddingClassifier';
import { resolveOfflineIntent } from '../src/ai/intent/OfflineIntentResolver';
import type { IntentKind, IntentContext } from '../src/ai/intent/IntentClassifier';

const THRESHOLDS = { enabled: true, minConfidence: 0.42, minMargin: 0.05 };

// 회귀 가드 — 확정(되묻기 제외) precision의 하한. 향상을 낼 때마다 상향해 잠근다.
const BASELINE_IN_DIST = 0.92;  // in-dist 홈그라운드(실측 100%)
const BASELINE_LONGTAIL = 0.85; // 롱테일(중재+헤드+코퍼스 보강 후 실측 91.7%). 이 밑으론 회귀 금지.

// 되묻기율 상한 — precision만 보면 "대부분 되묻기로 punt"하면서 초록불이 뜨는 함정에 속는다(Step 2에서
// 실제로 겪음). 되묻기는 안전한 보류지만 과하면 UX 후퇴이므로 상한으로 함께 가드한다(실측 in-dist 0% / 롱테일 7.7%).
const MAX_UNCERTAIN_IN_DIST = 0.08;
const MAX_UNCERTAIN_LONGTAIL = 0.15;

interface Fixture { query: string; expected: IntentKind; }

interface SetResult {
  label: string;
  rawCorrect: number;
  resolverCorrect: number;
  uncertain: number;
  total: number;
  precisionOnDecided: number;
  confusion: Map<string, number>;
  fails: string[];
}

/** 한 세트를 분류기+리졸버로 평가한다. ctxFor가 케이스별 IntentContext(특히 currentFile)를 정한다. */
async function evalSet(
  label: string,
  cases: Fixture[],
  classifier: IntentEmbeddingClassifier,
  ctxFor: (f: Fixture) => IntentContext,
): Promise<SetResult> {
  let rawCorrect = 0, resolverCorrect = 0, uncertain = 0;
  const confusion = new Map<string, number>();
  const fails: string[] = [];

  for (const c of cases) {
    const cls = await classifier.classify(c.query);
    const rawPred = cls?.intent ?? 'other';
    if (rawPred === c.expected) rawCorrect++;
    confusion.set(`${c.expected}->${rawPred}`, (confusion.get(`${c.expected}->${rawPred}`) ?? 0) + 1);

    const res = await resolveOfflineIntent(c.query, ctxFor(c), { classify: (q) => classifier.classify(q) }, THRESHOLDS);
    if (res.uncertain) {
      uncertain++;
      fails.push(`  ❔ [${c.expected}→되묻기 ${JSON.stringify(res.candidates)}] "${c.query}"`);
    } else if (res.result.intent === c.expected) {
      resolverCorrect++;
    } else {
      fails.push(`  ❌ [${c.expected}→${res.result.intent} via ${res.source}] (emb conf=${cls?.confidence.toFixed(2)} margin=${cls?.margin.toFixed(2)}) "${c.query}"`);
    }
  }
  const decided = cases.length - uncertain;
  return {
    label, rawCorrect, resolverCorrect, uncertain, total: cases.length,
    precisionOnDecided: decided > 0 ? resolverCorrect / decided : 0,
    confusion, fails,
  };
}

function report(r: SetResult): void {
  const decided = r.total - r.uncertain;
  console.log('═'.repeat(60));
  console.log(`【${r.label}】 (${r.total}건)`);
  console.log(`  임베딩 단독 top-1     : ${r.rawCorrect}/${r.total} = ${((r.rawCorrect / r.total) * 100).toFixed(1)}%`);
  console.log(`  리졸버 최종(되묻기 제외): ${r.resolverCorrect}/${r.total} = ${((r.resolverCorrect / r.total) * 100).toFixed(1)}%`);
  console.log(`  되묻기(uncertain)     : ${r.uncertain}/${r.total} = ${((r.uncertain / r.total) * 100).toFixed(1)}%`);
  console.log(`  확정 정확도(precision): ${r.resolverCorrect}/${decided} = ${(r.precisionOnDecided * 100).toFixed(1)}%`);
  const mis = [...r.confusion.entries()].filter(([k]) => { const [e, p] = k.split('->'); return e !== p; }).sort();
  if (mis.length) { console.log('  혼동(임베딩 단독, 오분류만):'); for (const [k, n] of mis) console.log(`    ${k}: ${n}`); }
  if (r.fails.length) { console.log('  상세(리졸버 기준):'); for (const f of r.fails) console.log(f); }
}

async function main(): Promise<void> {
  const load = (f: string): Fixture[] => JSON.parse(fs.readFileSync(path.resolve('scripts/fixtures', f), 'utf-8')).cases;
  const inDist = load('intent-eval.json');
  const longtail = load('intent-longtail.json');

  const store = new IntentExampleStore(path.resolve('intents'), null);
  const classifier = new IntentEmbeddingClassifier(store);

  console.log('의도 예시 임베딩 빌드 중… (첫 실행은 모델 다운로드로 느릴 수 있음)');
  const ready = await store.ensureReady();
  if (!ready) {
    console.error('❌ 의도 예시 임베딩 실패 — intents/ 또는 임베딩 모델을 확인하세요.');
    process.exit(1);
  }
  console.log(`예시 ${store.examples().length}개 임베딩 완료\n`);

  // in-dist: 기존 관례 유지(modify_file만 현재 파일 열림). 롱테일: 에디터에 페이지 열린 상태 가정(전부).
  const inDistRes = await evalSet('in-dist (홈그라운드)', inDist, classifier,
    (f) => ({ currentFile: f.expected === 'modify_file' ? 'src/domains/x/pages/XPage.tsx' : null, hasSelection: false, domains: [] }));
  const longtailRes = await evalSet('롱테일 (적대적·새 말투)', longtail, classifier,
    () => ({ currentFile: 'src/domains/employee/pages/EmployeeListPage.tsx', hasSelection: false, domains: [] }));

  report(inDistRes);
  report(longtailRes);

  console.log('\n' + '═'.repeat(60));
  let failed = false;
  const gate = (name: string, got: number, base: number, kind: 'min' | 'max'): void => {
    const ok = kind === 'min' ? got >= base : got <= base;
    const rel = kind === 'min' ? (ok ? '≥' : '<') : (ok ? '≤' : '>');
    const label = kind === 'min' ? '확정 정확도' : '되묻기율';
    console.log(`${ok ? '✅' : '❌'} ${name} ${label} ${(got * 100).toFixed(1)}% ${rel} ${kind === 'min' ? '베이스라인' : '상한'} ${(base * 100).toFixed(0)}%`);
    if (!ok) failed = true;
  };
  gate('in-dist', inDistRes.precisionOnDecided, BASELINE_IN_DIST, 'min');
  gate('in-dist', inDistRes.uncertain / inDistRes.total, MAX_UNCERTAIN_IN_DIST, 'max');
  gate('롱테일', longtailRes.precisionOnDecided, BASELINE_LONGTAIL, 'min');
  gate('롱테일', longtailRes.uncertain / longtailRes.total, MAX_UNCERTAIN_LONGTAIL, 'max');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
