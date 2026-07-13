/**
 * PoC 러너: StructuralAnchor 를 실제 react-app-peoplify 프로젝트의
 * domains/example 파일에 돌려 앵커 계산·결정론적 적용 결과를 출력한다.
 *
 * 실행: scripts/run-poc-anchor.ps1 (esbuild 번들 후 node 실행)
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeAnchors, applyStructuralEdit, type StructuralEdit } from '../src/ai/apply/StructuralAnchor';

const PROJECT = 'C:/redsky/work/react/peoplify_react/react-app-peoplify';
const EXAMPLE = path.join(PROJECT, 'src/domains/example');

interface Case {
  file: string;
  label: string;
  edit: StructuralEdit;
}

const cases: Case[] = [
  {
    file: 'pages/use-api/ExUseApi.tsx',
    label: '여러 줄 useApi 보유 — 마지막 훅 다음에 삽입 + import 중복 skip',
    edit: {
      hookCode:
        "const { data: users } = useApi<TJsonPlaceholderPost[]>('/users');",
      imports: [{ module: '@axiom/hooks', named: ['useApi'] }],
    },
  },
  {
    file: 'pages/AccountIndex.tsx',
    label: 'useEffect 1개 — 그 다음에 useApi 삽입 + 새 import 추가',
    edit: {
      hookCode: "const { data: accounts, isPending } = useApi<unknown[]>('/api/accounts');",
      imports: [{ module: '@axiom/hooks', named: ['useApi'] }],
    },
  },
];

function banner(s: string): void {
  console.log('\n' + '═'.repeat(78) + '\n' + s + '\n' + '═'.repeat(78));
}

for (const c of cases) {
  const abs = path.join(EXAMPLE, c.file);
  if (!fs.existsSync(abs)) {
    console.log(`\n[SKIP] 파일 없음: ${abs}`);
    continue;
  }
  const source = fs.readFileSync(abs, 'utf-8');

  banner(`${c.file}\n${c.label}`);

  const anchors = computeAnchors(source);
  console.log('\n[앵커]');
  if (anchors.component) {
    const co = anchors.component;
    console.log(
      `  컴포넌트: ${co.name} (라인 ${co.startLine}~${co.endLine}), ` +
        `훅 삽입 = 라인 ${co.hookInsertLine} 앞 [${co.hookInsertReason}], ` +
        `들여쓰기=${JSON.stringify(co.bodyIndent)}`,
    );
  } else {
    console.log('  컴포넌트: (없음)');
  }
  if (anchors.imports) {
    console.log(
      `  import 블록: 라인 ${anchors.imports.startLine}~${anchors.imports.endLine}, ` +
        `모듈=[${[...anchors.imports.byModule.keys()].join(', ')}]`,
    );
  }
  console.log('  섹션 목록(모델이 이름으로 선택 가능):');
  for (const s of anchors.sections) {
    console.log(`    - ${s.kind} ${s.name} (라인 ${s.startLine}~${s.endLine})`);
  }

  const { text, changes } = applyStructuralEdit(source, c.edit);
  console.log('\n[적용 변경 사항]');
  for (const ch of changes) console.log(`  • ${ch}`);

  // 삽입 지점 주변만 발췌 출력
  const insLine = anchors.component?.hookInsertLine ?? 1;
  const outLines = text.split('\n');
  const from = Math.max(0, insLine - 4);
  const to = Math.min(outLines.length, insLine + 6);
  console.log('\n[결과 발췌 — 삽입 지점 주변]');
  outLines.slice(from, to).forEach((l, i) => {
    console.log(`  ${String(from + i + 1).padStart(3)}| ${l}`);
  });
}

console.log('\n완료.');
