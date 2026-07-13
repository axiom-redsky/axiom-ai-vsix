/**
 * End-to-end PoC: "모델이 낸 응답 문자열" → ChatViewProvider 와 동일한 파싱 →
 * applyStructuralEdit 결정론적 적용 까지의 전체 경로를 검증한다.
 *
 * ChatViewProvider 는 vscode API 의존이라 직접 실행 불가하므로,
 * _handleAxiomAction 의 파싱 로직(정규식)을 그대로 복제해 계약을 검증한다.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyStructuralEdit, type ImportRequest, type StructuralEdit } from '../src/ai/apply/StructuralAnchor';

const EXAMPLE = 'C:/redsky/work/react/peoplify_react/react-app-peoplify/src/domains/example';

// ─── ChatViewProvider._parseImportTag 복제 ──────────────────────────────────
function parseImportTag(attrs: string): ImportRequest | null {
  const module = attrs.match(/\bmodule\s*=\s*["']([^"']+)["']/)?.[1];
  if (!module) return null;
  const namedRaw = attrs.match(/\bnamed\s*=\s*["']([^"']*)["']/)?.[1];
  const def = attrs.match(/\bdefault\s*=\s*["']([^"']+)["']/)?.[1];
  const named = namedRaw ? namedRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  return { module, named, def };
}

// ─── _handleAxiomAction 의 structural 파싱 경로 복제 ─────────────────────────
function parseStructuralAction(response: string): { filePath: string; structural: StructuralEdit } | null {
  const blockMatch = response.match(/<axiom-action>([\s\S]*?)<\/axiom-action>/);
  if (!blockMatch) return null;
  const blockContent = blockMatch[1];

  const jsonMatch = blockContent.match(/(\{[^`]*?\})/s);
  if (!jsonMatch) return null;
  const meta = JSON.parse(jsonMatch[1].trim()) as { filePath: string; mode?: string };
  if (meta.mode !== 'structural') return null;

  const hookMatches = [...blockContent.matchAll(/<hook>\n?([\s\S]*?)<\/hook>/g)];
  const importMatches = [...blockContent.matchAll(/<import\b([^>]*?)\/?>/g)];
  const hookCode =
    hookMatches.map((m) => m[1].replace(/\n+$/, '')).filter((c) => c.trim()).join('\n') || undefined;
  const imports = importMatches
    .map((m) => parseImportTag(m[1]))
    .filter((x): x is ImportRequest => x !== null);

  return { filePath: meta.filePath, structural: { hookCode, imports: imports.length ? imports : undefined } };
}

interface E2ECase {
  file: string;
  label: string;
  modelResponse: string;
}

const cases: E2ECase[] = [
  {
    file: 'pages/AccountIndex.tsx',
    label: 'useApi 없는 페이지에 "useApi로 계좌목록 조회 구현" — 훅+신규 import',
    modelResponse: `계좌 목록을 조회하도록 useApi를 추가하겠습니다.

<axiom-action>
{"action":"updateFile","mode":"structural","templateType":"page","domain":"example","filePath":"src/domains/example/pages/AccountIndex.tsx"}
<hook>
const { data: accounts, isPending, error } = useApi<TAccount[]>('/api/accounts');
</hook>
<import module="@axiom/hooks" named="useApi" />
</axiom-action>`,
  },
  {
    file: 'pages/use-api/ExUseApi.tsx',
    label: '이미 useApi 보유 — import 중복 skip + 마지막 훅 뒤 삽입',
    modelResponse: `사용자 목록 조회를 추가합니다.

<axiom-action>
{"action":"updateFile","mode":"structural","templateType":"page","domain":"example","filePath":"src/domains/example/pages/use-api/ExUseApi.tsx"}
<hook>
const { data: users } = useApi<TJsonPlaceholderPost[]>('/users');
</hook>
<import module="@axiom/hooks" named="useApi" />
</axiom-action>`,
  },
];

function banner(s: string): void {
  console.log('\n' + '═'.repeat(78) + '\n' + s + '\n' + '═'.repeat(78));
}

for (const c of cases) {
  const abs = path.join(EXAMPLE, c.file);
  if (!fs.existsSync(abs)) {
    console.log(`[SKIP] 없음: ${abs}`);
    continue;
  }
  const source = fs.readFileSync(abs, 'utf-8');
  banner(`${c.file}\n${c.label}`);

  const parsed = parseStructuralAction(c.modelResponse);
  if (!parsed) {
    console.log('  ❌ structural 액션 파싱 실패');
    continue;
  }
  console.log('\n[파싱 결과]');
  console.log(`  filePath = ${parsed.filePath}`);
  console.log(`  hookCode = ${JSON.stringify(parsed.structural.hookCode)}`);
  console.log(`  imports  = ${JSON.stringify(parsed.structural.imports)}`);

  const { text, changes } = applyStructuralEdit(source, parsed.structural);
  console.log('\n[적용 변경]');
  for (const ch of changes) console.log(`  • ${ch}`);

  const noop = text === source;
  console.log(`\n[결과] ${noop ? '⚠️ 변경 없음(no-op)' : '✅ 적용됨'}`);

  if (!noop) {
    // 변경된 라인 주변 발췌
    const origLines = source.split(/\r?\n/);
    const newLines = text.split(/\r?\n/);
    let firstDiff = 0;
    while (firstDiff < origLines.length && origLines[firstDiff] === newLines[firstDiff]) firstDiff++;
    const from = Math.max(0, firstDiff - 2);
    const to = Math.min(newLines.length, firstDiff + 6);
    console.log('[결과 발췌]');
    newLines.slice(from, to).forEach((l, i) => {
      const ln = from + i + 1;
      const added = origLines[from + i] !== newLines[from + i];
      console.log(`  ${added ? '+' : ' '} ${String(ln).padStart(3)}| ${l}`);
    });
  }
}

console.log('\n완료.');
