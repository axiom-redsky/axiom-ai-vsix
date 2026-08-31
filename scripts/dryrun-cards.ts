/**
 * 카드 드라이런 CLI — "이 질문에 어떤 카드가 어떤 모드로 뜨나"를 즉석 확인한다.
 * 확신도 임계(§10.6) 튜닝·트리거 겹침 디버깅용 계기판 (관리 패널 드라이런의 CLI 선행).
 *
 * 사용:
 *   npm run dryrun:cards -- "직원 목록 페이지 만들어줘"
 *   npm run dryrun:cards -- "달력으로 바꿔줘" --no-file        (파일 안 열린 상황)
 *   npm run dryrun:cards -- "페이지 api 연동" --gap=0.3       (게이트 임계 실험)
 */
import { loadCardsFromDir, finalizeCatalog } from '../src/ai/actions/CardCatalog';
import { matchCards } from '../src/ai/actions/CardMatcher';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const query = argv.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!query) {
  console.log('사용: npm run dryrun:cards -- "질문" [--no-file] [--no-scaffold] [--gap=0.4]');
  process.exit(1);
}

const gapFlag = flags.find((a) => a.startsWith('--gap='));
const planGapRatio = gapFlag ? Number(gapFlag.split('=')[1]) : undefined;

const loaded = loadCardsFromDir('media/action-cards', 'builtin');
const finalized = finalizeCatalog(loaded.cards);
for (const i of [...loaded.issues, ...finalized.issues]) {
  console.log(`${i.severity === 'error' ? '⛔' : '⚠'} [${i.cardId ?? '?'}] ${i.message}`);
}

const ctx = {
  fileOpen: !flags.includes('--no-file'),
  scaffoldDetected: !flags.includes('--no-scaffold'),
};
const rec = matchCards(query, finalized.cards, ctx, planGapRatio !== undefined ? { planGapRatio } : {});

console.log(`\n질문: "${query}"  (fileOpen=${ctx.fileOpen}, scaffold=${ctx.scaffoldDetected}, 카드 ${finalized.cards.length}장)`);
const modeLabel = rec.mode === 'plan' ? '계획 카드 1장' : rec.mode === 'list' ? '컴팩트 리스트' : '매칭 없음';
console.log(`모드: ${rec.mode} — ${modeLabel}`);
rec.matches.forEach((m, i) => {
  console.log(`\n${i + 1}. ${m.card.icon} ${m.card.title}  (${m.card.id} · ${m.card.layer} · ${m.card.action.type})  점수 ${m.score}`);
  console.log(`   근거: ${m.matchedTriggers.join(', ')}`);
  const pf = Object.entries(m.prefill);
  if (pf.length) console.log(`   프리필: ${pf.map(([k, v]) => `${k}=${v}`).join('  ')}`);
});
