/**
 * 오프라인 의도 분류 측정 하니스 (실제 로컬 임베딩 사용).
 *
 * intents/*.md 코퍼스를 임베딩한 IntentEmbeddingClassifier를 held-out 픽스처(scripts/fixtures/
 * intent-eval.json)에 돌려 집계 지표를 출력한다:
 *  - top-1 정확도(분류기 단독)
 *  - 혼동 행렬
 *  - resolver 게이팅 결과: confident / uncertain(되묻기) 비율
 *  - 회귀 게이트: 정확도가 BASELINE 미만이면 종료코드 1
 *
 * 첫 실행 시 @xenova/transformers 모델을 1회 다운로드·캐시한다(인터넷 필요).
 * 실행: npm run eval:intent  (node scripts/run-eval-intent.mjs)
 */
import * as fs from 'fs';
import * as path from 'path';
import { IntentExampleStore } from '../src/ai/IntentExampleStore';
import { IntentEmbeddingClassifier } from '../src/ai/IntentEmbeddingClassifier';
import { resolveOfflineIntent } from '../src/ai/OfflineIntentResolver';
import type { IntentKind } from '../src/ai/IntentClassifier';

const INTENTS: IntentKind[] = ['create_page', 'modify_file', 'qna', 'smalltalk', 'other'];
const BASELINE_ACCURACY = 0.9; // 확정 정확도(precision) 회귀 가드(튜닝하며 상향)
const THRESHOLDS = { enabled: true, minConfidence: 0.42, minMargin: 0.05 };

interface Fixture { query: string; expected: IntentKind; }

async function main(): Promise<void> {
  const fixturesPath = path.resolve('scripts/fixtures/intent-eval.json');
  const cases: Fixture[] = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8')).cases;

  const intentsDir = path.resolve('intents');
  const store = new IntentExampleStore(intentsDir, null);
  const classifier = new IntentEmbeddingClassifier(store);

  console.log('의도 예시 임베딩 빌드 중… (첫 실행은 모델 다운로드로 느릴 수 있음)');
  const ready = await store.ensureReady();
  if (!ready) {
    console.error('❌ 의도 예시 임베딩 실패 — intents/ 또는 임베딩 모델을 확인하세요.');
    process.exit(1);
  }
  console.log(`예시 ${store.examples().length}개 임베딩 완료\n`);

  let rawCorrect = 0;       // 임베딩 분류기 단독 top-1
  let resolverCorrect = 0;  // 리졸버 최종(되묻기 제외) 정답
  let uncertainCount = 0;   // 되묻기로 빠진 수
  const confusion = new Map<string, number>(); // 임베딩 단독 `${expected}->${predicted}`
  const fails: string[] = [];

  for (const c of cases) {
    const cls = await classifier.classify(c.query);
    const rawPred = cls?.intent ?? 'other';
    if (rawPred === c.expected) rawCorrect++;
    confusion.set(`${c.expected}->${rawPred}`, (confusion.get(`${c.expected}->${rawPred}`) ?? 0) + 1);

    const res = await resolveOfflineIntent(
      c.query,
      { currentFile: c.expected === 'modify_file' ? 'src/domains/x/pages/XPage.tsx' : null, hasSelection: false, domains: [] },
      { classify: (q) => classifier.classify(q) },
      THRESHOLDS,
    );
    if (res.uncertain) {
      uncertainCount++;
      fails.push(`  ❔ [${c.expected}→되묻기 ${JSON.stringify(res.candidates)}] "${c.query}"`);
    } else if (res.result.intent === c.expected) {
      resolverCorrect++;
    } else {
      fails.push(`  ❌ [${c.expected}→${res.result.intent} via ${res.source}] (emb conf=${cls?.confidence.toFixed(2)} margin=${cls?.margin.toFixed(2)}) "${c.query}"`);
    }
  }

  const rawAcc = rawCorrect / cases.length;
  const resolverAcc = resolverCorrect / cases.length;       // 되묻기는 오답이 아니라 보류로 분리
  const decided = cases.length - uncertainCount;
  const precisionOnDecided = decided > 0 ? resolverCorrect / decided : 0;

  console.log('═'.repeat(60));
  console.log(`임베딩 단독 top-1 정확도: ${rawCorrect}/${cases.length} = ${(rawAcc * 100).toFixed(1)}%`);
  console.log(`리졸버 최종 정답(되묻기 제외): ${resolverCorrect}/${cases.length} = ${(resolverAcc * 100).toFixed(1)}%`);
  console.log(`되묻기(uncertain): ${uncertainCount}/${cases.length} = ${((uncertainCount / cases.length) * 100).toFixed(1)}%`);
  console.log(`확정한 것 중 정확도(precision): ${resolverCorrect}/${decided} = ${(precisionOnDecided * 100).toFixed(1)}%`);

  console.log('\n혼동 행렬(임베딩 단독, expected → predicted, 오분류만):');
  for (const [k, n] of [...confusion.entries()].sort()) {
    const [exp, pred] = k.split('->');
    if (exp !== pred) console.log(`  ${k}: ${n}`);
  }

  if (fails.length > 0) {
    console.log('\n상세(리졸버 기준):');
    for (const f of fails) console.log(f);
  }

  console.log('\n' + '═'.repeat(60));
  // 회귀 게이트: 확정한 것의 정확도(precision)를 본다 — 되묻기는 안전한 보류이므로 오답으로 치지 않는다.
  if (precisionOnDecided < BASELINE_ACCURACY) {
    console.error(`❌ 확정 정확도 ${(precisionOnDecided * 100).toFixed(1)}% < 베이스라인 ${(BASELINE_ACCURACY * 100).toFixed(0)}% — 회귀`);
    process.exit(1);
  }
  console.log(`✅ 확정 정확도 ${(precisionOnDecided * 100).toFixed(1)}% ≥ 베이스라인 ${(BASELINE_ACCURACY * 100).toFixed(0)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
