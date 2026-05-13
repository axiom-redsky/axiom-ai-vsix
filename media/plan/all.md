좋습니다. 위의 3계층 전략을 전부 JavaScript/TypeScript로 구현하는 방법을 알려드리겠습니다.이제 각 레이어를 실제 코드로 보겠습니다.

---

## 레이어 1 — Seed cases + Mock AI 서버

먼저 `msw`로 내부 AI 서버를 스텁하고, `vitest`로 골든케이스를 고정합니다.

```ts
// harness/mocks/aiServer.ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const mockAiServer = setupServer(
  http.post("http://internal-ai/v1/chat", async ({ request }) => {
    const body = await request.json() as { prompt: string };

    // 시나리오별 스텁 응답 — 실제 AI 서버 없이 동작
    const stubs: Record<string, string> = {
      "리팩터링": "```ts\n// 리팩터링된 코드\n```",
      "설명":     "이 함수는 X를 수행합니다.",
      "테스트":   "```ts\ndescribe('...', () => { it('...') })\n```",
    };

    const key = Object.keys(stubs).find(k => body.prompt.includes(k));
    return HttpResponse.json({
      response: key ? stubs[key] : "처리할 수 없는 요청입니다."
    });
  })
);
```

```ts
// harness/seeds/golden.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mockAiServer } from "../mocks/aiServer";
import { callAi } from "../../src/aiClient";

beforeAll(() => mockAiServer.listen());
afterAll(()  => mockAiServer.close());

describe("골든케이스 — 항상 통과해야 하는 핵심 시나리오", () => {
  it("리팩터링 요청 → 코드블록 포함 응답", async () => {
    const res = await callAi("이 함수를 리팩터링해줘");
    expect(res).toMatch(/```/);          // 코드블록 필수
    expect(res.length).toBeGreaterThan(10);
  });

  it("빈 입력 → 에러 없이 안내 메시지 반환", async () => {
    const res = await callAi("");
    expect(res).toBeTruthy();            // 크래시 없이 응답
  });
});
```

---

## 레이어 2 — 자동 수집 + 의미 클러스터링

`@xenova/transformers`는 WASM 기반이라 Node.js에서 완전 로컬 실행됩니다. 폐쇄망 환경에 딱 맞습니다.

```ts
// harness/collector/embedAndCluster.ts
import { pipeline } from "@xenova/transformers";
import kmeans from "ml-kmeans";
import fs from "fs";

// 수집된 실제 프롬프트 로그 (익스텐션에서 anonymize 후 저장)
const logs: string[] = JSON.parse(
  fs.readFileSync("./harness/data/prompt-logs.json", "utf-8")
);

async function clusterPrompts(prompts: string[], k = 8) {
  // 1. 임베딩 생성 (로컬 WASM — 네트워크 불필요)
  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const vectors = await Promise.all(
    prompts.map(async (p) => {
      const out = await embed(p, { pooling: "mean", normalize: true });
      return Array.from(out.data as Float32Array);
    })
  );

  // 2. K-means 클러스터링
  const result = kmeans(vectors, k, { seed: 42 });

  // 3. 각 클러스터의 대표 프롬프트 추출 (중심과 가장 가까운 것)
  const representatives = result.centroids.map((centroid, ci) => {
    const members = prompts.filter((_, i) => result.clusters[i] === ci);
    // 코사인 거리가 가장 작은 멤버를 대표로
    return members[0]; // 실제론 거리 계산 필요
  });

  // 4. 하네스 케이스로 자동 저장
  fs.writeFileSync(
    "./harness/data/auto-cases.json",
    JSON.stringify(representatives, null, 2)
  );

  console.log(`클러스터 ${k}개 → 대표 케이스 ${representatives.length}개 생성`);
  return representatives;
}

clusterPrompts(logs);
```

```ts
// harness/collector/promptLogger.ts — 익스텐션 측에서 호출
import * as vscode from "vscode";
import fs from "fs";
import path from "path";

const LOG_PATH = path.join(__dirname, "../../harness/data/prompt-logs.json");

export function logPrompt(prompt: string) {
  // PII 제거 후 저장 (파일명, 변수명 등 익명화)
  const sanitized = prompt
    .replace(/["'`][^"'`]{1,40}["'`]/g, '"<VALUE>"')  // 문자열 리터럴 제거
    .replace(/\b\w+\.(ts|js|tsx)\b/g, "<FILE>");       // 파일명 제거

  const logs: string[] = fs.existsSync(LOG_PATH)
    ? JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"))
    : [];

  logs.push(sanitized);
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
}
```

---

## 레이어 3-A — 동의어 치환 패러프레이징 (`compromise`)

```ts
// harness/generator/paraphrase.ts
import nlp from "compromise";

const SYNONYM_MAP: Record<string, string[]> = {
  "리팩터링": ["개선", "정리", "최적화", "클린업"],
  "설명":     ["해설", "분석", "요약"],
  "만들어":   ["작성해", "생성해", "짜줘"],
  "함수":     ["코드", "메서드", "로직"],
};

export function paraphrase(prompt: string, count = 5): string[] {
  const results = new Set<string>();

  for (let i = 0; i < count * 3 && results.size < count; i++) {
    let variant = prompt;
    // 각 키워드를 무작위로 동의어로 치환
    for (const [word, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (variant.includes(word) && Math.random() > 0.4) {
        const pick = synonyms[Math.floor(Math.random() * synonyms.length)];
        variant = variant.replace(word, pick);
      }
    }
    if (variant !== prompt) results.add(variant);
  }

  return Array.from(results);
}

// 사용 예시
const base = "이 함수를 리팩터링해줘";
console.log(paraphrase(base, 5));
// → ["이 코드를 개선해줘", "이 메서드를 최적화해줘", ...]
```

---

## 레이어 3-B — 템플릿 조합 엔진

```ts
// harness/generator/templateCombiner.ts

interface Template {
  action:  string[];
  target:  string[];
  context: string[];
}

const TEMPLATES: Template = {
  action:  ["리팩터링해줘", "설명해줘", "테스트 코드 만들어줘",
            "버그 찾아줘", "타입 추가해줘", "주석 달아줘"],
  target:  ["이 함수", "선택한 코드", "이 클래스", "이 모듈"],
  context: ["", "TypeScript 기준으로", "단계별로", "간단하게"],
};

export function generateCombinations(tmpl: Template): string[] {
  const cases: string[] = [];
  for (const action of tmpl.action)
    for (const target of tmpl.target)
      for (const ctx of tmpl.context)
        cases.push(`${target}를 ${ctx ? ctx + " " : ""}${action}`.trim());
  return cases;
}

// 4 × 3 × 4 + ... = 96개 케이스 자동 생성
const allCases = generateCombinations(TEMPLATES);
console.log(`총 ${allCases.length}개 케이스 생성`);
```

---

## 레이어 3-C — Fuzzing (`fast-fuzzy`)

```ts
// harness/generator/fuzzer.ts
import { search } from "fast-fuzzy";

const BASE_PROMPTS = [
  "이 함수를 리팩터링해줘",
  "선택한 코드 설명해줘",
  "테스트 코드 만들어줘",
];

// 경계값 변형: 공백, 특수문자, 길이 극단값
const MUTATIONS = [
  (s: string) => s + "??",               // 특수문자 추가
  (s: string) => s.toUpperCase(),         // 대문자화
  (s: string) => " " + s + " ",          // 앞뒤 공백
  (s: string) => s.repeat(3),            // 반복 (길이 폭발)
  (s: string) => s.replace(/해줘$/, ""), // 동사 제거 (불완전 문장)
  (s: string) => "",                     // 빈 문자열
];

export function generateFuzzCases(seeds = BASE_PROMPTS): string[] {
  const fuzzed: string[] = [];
  for (const seed of seeds)
    for (const mutate of MUTATIONS)
      fuzzed.push(mutate(seed));
  return fuzzed;
}

// fast-fuzzy로 유사도 검색 → 중복 제거
export function deduplicateCases(cases: string[]): string[] {
  const unique: string[] = [];
  for (const c of cases) {
    const hits = search(c, unique, { threshold: 0.85 });
    if (hits.length === 0) unique.push(c);
  }
  return unique;
}
```

---

## 전체 하네스 Runner — 3계층 통합 실행

```ts
// harness/runner.ts
import { generateCombinations, TEMPLATES } from "./generator/templateCombiner";
import { paraphrase }                      from "./generator/paraphrase";
import { generateFuzzCases, deduplicateCases } from "./generator/fuzzer";
import { callAi }                          from "../src/aiClient";
import fs from "fs";

interface HarnessResult {
  prompt:  string;
  layer:   "seed" | "auto" | "synthetic";
  passed:  boolean;
  output?: string;
  error?:  string;
}

async function runHarness() {
  // 1. 케이스 수집
  const seedCases:      string[] = JSON.parse(fs.readFileSync("./harness/data/seed-cases.json", "utf-8"));
  const autoCases:      string[] = JSON.parse(fs.readFileSync("./harness/data/auto-cases.json", "utf-8"));
  const syntheticCases: string[] = deduplicateCases([
    ...generateCombinations(TEMPLATES),
    ...seedCases.flatMap(s => paraphrase(s)),
    ...generateFuzzCases(seedCases),
  ]);

  const allCases = [
    ...seedCases.map(p      => ({ prompt: p, layer: "seed"      as const })),
    ...autoCases.map(p      => ({ prompt: p, layer: "auto"      as const })),
    ...syntheticCases.map(p => ({ prompt: p, layer: "synthetic" as const })),
  ];

  console.log(`총 ${allCases.length}개 케이스 실행 시작`);

  // 2. 병렬 실행 (배치 처리)
  const BATCH = 10;
  const results: HarnessResult[] = [];

  for (let i = 0; i < allCases.length; i += BATCH) {
    const batch = allCases.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ prompt, layer }) => {
        try {
          const output = await callAi(prompt);
          return {
            prompt, layer,
            passed: output.length > 0,  // 기본 검증: 비어있지 않은 응답
            output,
          } satisfies HarnessResult;
        } catch (e) {
          return {
            prompt, layer,
            passed: false,
            error: String(e),
          } satisfies HarnessResult;
        }
      })
    );
    results.push(
      ...batchResults.map(r => r.status === "fulfilled" ? r.value : r.reason)
    );
    process.stdout.write(`\r진행: ${Math.min(i + BATCH, allCases.length)}/${allCases.length}`);
  }

  // 3. 리포트 출력
  const passed = results.filter(r => r.passed).length;
  const report = {
    total:   results.length,
    passed,
    failed:  results.length - passed,
    passRate: `${((passed / results.length) * 100).toFixed(1)}%`,
    failedCases: results.filter(r => !r.passed),
  };

  fs.writeFileSync("./harness/report.json", JSON.stringify(report, null, 2));
  console.log(`\n통과율: ${report.passRate} (${passed}/${results.length})`);

  // CI에서 실패 기준: 통과율 95% 미만이면 프로세스 종료
  if (passed / results.length < 0.95) process.exit(1);
}

runHarness();
```

---

## 패키지 설치 한 줄 요약

```bash
npm install -D vitest msw @xenova/transformers ml-kmeans \
               compromise fast-fuzzy @vscode/test-electron
```

이 구조로 `npm run harness`를 실행하면 세 계층이 순서대로 돌면서 `report.json`을 뱉고, 통과율 95% 미만이면 CI를 블로킹합니다. 다음 단계로 `callAi` 클라이언트 구현이나 vitest 설정 파일을 잡아드릴까요?