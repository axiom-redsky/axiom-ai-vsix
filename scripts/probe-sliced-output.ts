/**
 * 슬라이싱(부분 파일) 출력 품질 실험 하니스.
 *
 * 목적: "현재 파일을 통째로 보내는 대신 큰 파일 일부만 잘라 보낼 때,
 * 모델이 얼마나 정확한 출력을 내놓는가"를 배치 로직 없이 눈으로 확인한다.
 *
 * 배치(적용)는 일부러 다루지 않는다 — 모델 원시 출력만 그대로 찍는다.
 *
 * 사용:
 *   $env:AXIOM_ENDPOINT="http://213.181.122.2:47556"
 *   $env:AXIOM_MODEL="qwen3.5-35b-64k"
 *   $env:AXIOM_API_KEY=""        # 로컬이면 비움
 *   node scripts/probe-sliced-output.mjs --file "D:\path\EmployeeListPage.tsx" --query "부서 select에 /api/departments 적용" --budget 3000 --mode both
 *
 * --mode: sliced(잘라서만) | full(통째로만) | both(둘 다 A/B, 기본)
 * --budget: 슬라이싱 글자 예산(기본 3000) — 이보다 크면 함수 단위 stub 대체
 * --max-tokens: 응답 토큰 상한(기본 2048)
 */
import * as fs from 'fs';
import { extractRelevantTsSlice } from '../src/ai/CodeSectionExtractor';
import { tokenizeQuery } from '../src/ai/SectionExtractor';

interface Args {
  file: string;
  query: string;
  budget: number;
  mode: 'sliced' | 'full' | 'both';
  maxTokens: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const file = get('file');
  const query = get('query');
  if (!file || !query) {
    console.error('필수: --file <경로> --query "<요청>"');
    process.exit(1);
  }
  return {
    file,
    query,
    budget: Number(get('budget') ?? 3000),
    mode: (get('mode') as Args['mode']) ?? 'both',
    maxTokens: Number(get('max-tokens') ?? 2048),
  };
}

/**
 * 실험용 최소 프롬프트. 실제 Scenario C 프롬프트의 전체 지시문을 다 넣지 않고,
 * "부분 파일 뷰에서 모델이 정확한 편집을 만들 수 있는가"라는 변수만 isolate 한다.
 * stub 라인의 의미를 모델이 이해하도록 핵심 규칙만 둔다.
 */
function buildPrompt(fileLabel: string, fileView: string, sliced: boolean, query: string) {
  const stubNote = sliced
    ? `\n> ⚠️ 이 파일은 커서 질문과 무관한 선언은 \`// ... [kind name] 원본 NN줄 보존 (자리 표시자)\` 형식의 stub으로 대체했습니다.\n> stub은 자리 표시자일 뿐 실제 코드는 디스크에 그대로 있습니다. stub에 적힌 이름을 이미 선언된 변수처럼 참조하지 마세요.\n`
    : '';
  const system = `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- UI는 @axiom/components/ui 에서 named import
- 화면 이동은 전역 $router 사용 (import 불필요)
- 코드 주석은 한국어

## 작업
현재 열린 파일에 대한 수정 요청입니다. 변경에 필요한 코드를 제시하세요.
${stubNote}
---
## 현재 열린 파일: ${fileLabel}
\`\`\`tsx
${fileView}
\`\`\``;
  return { system, user: query };
}

/**
 * VSCode 사용자 settings.json에서 axiom-ai.llm.* 값을 읽는다(JSONC: 주석·trailing comma 허용).
 * 환경변수가 없을 때 폴백으로 쓴다 — 마스킹된 API 키를 다시 입력할 필요가 없게.
 */
function readVscodeSettings(): { endpoint?: string; model?: string; apiKey?: string } {
  const appData = process.env.APPDATA;
  if (!appData) return {};
  const candidates = [
    `${appData}\\Code\\User\\settings.json`,
    `${appData}\\Code - Insiders\\User\\settings.json`,
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      // JSONC 정리: 블록/라인 주석 제거 + trailing comma 제거 (best-effort)
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1');
      const json = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        endpoint: json['axiom-ai.llm.endpoint'] as string | undefined,
        model: json['axiom-ai.llm.model'] as string | undefined,
        apiKey: json['axiom-ai.llm.apiKey'] as string | undefined,
      };
    } catch {
      /* 다음 후보 */
    }
  }
  return {};
}

async function callLlm(system: string, user: string, maxTokens: number): Promise<string> {
  const settings = readVscodeSettings();
  const endpoint = process.env.AXIOM_ENDPOINT || settings.endpoint;
  const model = process.env.AXIOM_MODEL || settings.model;
  const apiKey = (process.env.AXIOM_API_KEY || settings.apiKey || '').trim();
  if (!endpoint || !model) {
    console.error('endpoint/model을 찾을 수 없습니다. AXIOM_ENDPOINT/AXIOM_MODEL 환경변수를 설정하거나 VSCode 설정을 확인하세요.');
    process.exit(1);
  }
  const url = new URL('/v1/chat/completions', endpoint).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = /^(Bearer|Basic)\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${body}`);
  }
  const json = (await res.json()) as any;
  return json?.choices?.[0]?.message?.content ?? '(빈 응답)';
}

async function runOne(label: string, fileLabel: string, fileView: string, sliced: boolean, args: Args) {
  const { system, user } = buildPrompt(fileLabel, fileView, sliced, args.query);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`▶ ${label}  (system ${system.length}자, 파일뷰 ${fileView.length}자)`);
  console.log('='.repeat(80));
  console.log('--- 모델이 본 파일 뷰 -------------------------------------------------');
  console.log(fileView);
  console.log('--- 모델 원시 출력 ---------------------------------------------------');
  try {
    const out = await callLlm(system, user, args.maxTokens);
    console.log(out);
  } catch (e) {
    console.error('호출 실패:', (e as Error).message);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = fs.readFileSync(args.file, 'utf-8');
  const fileLabel = args.file.replace(/\\/g, '/');

  const sliced = extractRelevantTsSlice(source, tokenizeQuery(args.query), args.budget);

  // 설정 해석 결과 1회 표기 (키 값은 노출하지 않음)
  const settings = readVscodeSettings();
  const ep = process.env.AXIOM_ENDPOINT || settings.endpoint;
  const md = process.env.AXIOM_MODEL || settings.model;
  const hasKey = !!(process.env.AXIOM_API_KEY || settings.apiKey);
  console.log(`설정: endpoint=${ep ?? '(없음)'} model=${md ?? '(없음)'} apiKey=${hasKey ? '있음' : '없음'}`);

  console.log(`파일: ${fileLabel}`);
  console.log(`원본 ${source.length}자 / 슬라이스 예산 ${args.budget}자`);
  console.log(`슬라이스 결과: 포함 ${sliced.includedCount}개 섹션, stub ${sliced.skippedCount}개, ${sliced.totalChars}자`);
  console.log(`질문: ${args.query}`);

  if (args.mode === 'full' || args.mode === 'both') {
    await runOne('[FULL] 통째로 보낸 경우', fileLabel, source, false, args);
  }
  if (args.mode === 'sliced' || args.mode === 'both') {
    await runOne('[SLICED] 잘라서 보낸 경우', fileLabel, sliced.text, true, args);
  }
}

main();
