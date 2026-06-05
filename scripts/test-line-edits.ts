/**
 * computeLineEdits 단위 테스트 (vscode 비의존 — esbuild로 vscode 스텁 후 node 실행).
 * 실행: node scripts/run-test-line-edits.mjs
 */
import { FileCreatorService, type LineEdit } from '../src/ai/FileCreatorService';

const svc = new FileCreatorService();
let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
  }
}

const FILE = [
  "import { useState } from 'react';", // 1
  '',                                  // 2
  'export default function Demo() {',  // 3
  "  const [name, setName] = useState('');", // 4
  '  const [age, setAge] = useState(0);',    // 5
  '  return <div>{name}</div>;',       // 6
  '}',                                 // 7
].join('\n');

const anchored = { requireAnchor: true, anchorSearchRadius: 3 };
const noAnchor = { requireAnchor: false, anchorSearchRadius: 3 };

// 1. 단일 라인 치환 (anchor 정확 일치)
{
  const edits: LineEdit[] = [
    { from: 5, to: 5, anchor: '  const [age, setAge] = useState(0);', content: '  const [age, setAge] = useState(20);' },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('단일 치환', r.text !== null && r.text!.includes('useState(20)') && !r.text!.includes('useState(0)'));
}

// 2. 삽입 (after)
{
  const edits: LineEdit[] = [
    { after: 5, anchor: '  const [age, setAge] = useState(0);', content: "  const [phone, setPhone] = useState('');" },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  const lines = (r.text ?? '').split('\n');
  check('삽입(after=5)', r.text !== null && lines[5] === "  const [phone, setPhone] = useState('');" && lines[6].includes('return'));
}

// 3. 삭제 (빈 content)
{
  const edits: LineEdit[] = [
    { from: 5, to: 5, anchor: '  const [age, setAge] = useState(0);', content: '' },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('삭제', r.text !== null && !r.text!.includes('setAge'));
}

// 4. 다중 edit 역순 적용 (서로 다른 위치)
{
  const edits: LineEdit[] = [
    { from: 4, to: 4, anchor: "  const [name, setName] = useState('');", content: "  const [name, setName] = useState('hi');" },
    { after: 5, anchor: '  const [age, setAge] = useState(0);', content: '  const [city, setCity] = useState();' },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('다중 edit', r.text !== null && r.text!.includes("useState('hi')") && r.text!.includes('setCity'));
}

// 5. anchor 드리프트 +2 자동 보정 (모델이 라인번호를 7로 잘못 지정했지만 anchor는 5번 줄)
{
  const edits: LineEdit[] = [
    { from: 7, to: 7, anchor: '  const [age, setAge] = useState(0);', content: '  const [age, setAge] = useState(99);' },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('anchor 드리프트 보정', r.text !== null && r.text!.includes('useState(99)') && r.text!.split('\n').length === 7);
}

// 6. anchor 반경 밖 → anchor-mismatch 실패 (null)
{
  const edits: LineEdit[] = [
    { from: 1, to: 1, anchor: '  const [age, setAge] = useState(0);', content: 'X' },
  ];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('anchor 반경 밖 실패', r.text === null && r.results[0].reason === 'anchor-mismatch');
}

// 7. requireAnchor=true 인데 anchor 없음 → 실패
{
  const edits: LineEdit[] = [{ from: 5, to: 5, content: 'X' }];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('anchor 누락 시 실패(requireAnchor)', r.text === null && r.results[0].reason === 'anchor-mismatch');
}

// 8. requireAnchor=false → anchor 없이 라인번호로 적용
{
  const edits: LineEdit[] = [{ from: 5, to: 5, content: '  const [age, setAge] = useState(7);' }];
  const r = svc.computeLineEdits(FILE, edits, noAnchor);
  check('anchor 없이 적용(requireAnchor=false)', r.text !== null && r.text!.includes('useState(7)'));
}

// 9. 범위 초과 → out-of-range
{
  const edits: LineEdit[] = [{ from: 99, to: 99, content: 'X' }];
  const r = svc.computeLineEdits(FILE, edits, noAnchor);
  check('범위 초과 실패', r.text === null && r.results[0].reason === 'out-of-range');
}

// 10. 겹침 → overlap
{
  const edits: LineEdit[] = [
    { from: 4, to: 5, content: 'A' },
    { from: 5, to: 6, content: 'B' },
  ];
  const r = svc.computeLineEdits(FILE, edits, noAnchor);
  check('겹침 실패', r.text === null && r.results.some((x) => x.reason === 'overlap'));
}

// 11. CRLF 보존
{
  const crlf = FILE.replace(/\n/g, '\r\n');
  const edits: LineEdit[] = [
    { from: 5, to: 5, anchor: '  const [age, setAge] = useState(0);', content: '  const [age, setAge] = useState(1);' },
  ];
  const r = svc.computeLineEdits(crlf, edits, anchored);
  check('CRLF 보존', r.text !== null && r.text!.includes('\r\n') && r.text!.includes('useState(1)'));
}

// 12. 최상단 삽입 (after=0, anchor 없이 허용)
{
  const edits: LineEdit[] = [{ after: 0, content: "import { useEffect } from 'react';" }];
  const r = svc.computeLineEdits(FILE, edits, anchored);
  check('최상단 삽입(after=0)', r.text !== null && r.text!.split('\n')[0].includes('useEffect'));
}

// 13. 닫힘 over-reach 거부 — 삭제 영역이 </div>까지 포함했는데 교체가 </Button>에서 끝나
//     부모 </div>가 사라지는 경우 (실제 버그: 초기화 버튼 onClick 확장 시 화면 전체 깨짐).
{
  const JSX = [
    'export default function Demo() {',                 // 1
    '  return (',                                        // 2
    '    <div>',                                         // 3
    '      <Button',                                     // 4
    '        onClick={() => {',                          // 5
    "          setSearchQuery('');",                     // 6
    '          refetch();',                              // 7
    '        }}',                                        // 8
    '      >',                                           // 9
    '        초기화',                                     // 10
    '      </Button>',                                   // 11
    '    </div>',                                        // 12
    '  );',                                              // 13
    '}',                                                 // 14
  ].join('\n');
  const edits: LineEdit[] = [
    {
      from: 4,
      to: 12, // </div>까지 over-reach
      content: [
        '      <Button',
        '        onClick={() => {',
        "          setSearchQuery('');",
        "          setSelectedDepartment('all');",
        '          refetch();',
        '        }}',
        '      >',
        '        초기화',
        '      </Button>', // </div> 누락
      ].join('\n'),
    },
  ];
  const r = svc.computeLineEdits(JSX, edits, noAnchor);
  check(
    '닫힘 over-reach 거부(</div> 누락)',
    r.text === null && r.results[0].reason === 'closer-dropped',
    `text=${r.text === null ? 'null' : '비어있지 않음'}, reason=${r.results[0].reason}`,
  );
}

// 14. 닫힘 보존 시 정상 적용 — 동일 영역이라도 </div>를 교체 끝에서 재현하면 통과.
{
  const JSX = [
    'export default function Demo() {',
    '  return (',
    '    <div>',
    '      <Button onClick={() => refetch()}>초기화</Button>',
    '    </div>',
    '  );',
    '}',
  ].join('\n');
  const edits: LineEdit[] = [
    {
      from: 4,
      to: 5,
      content: [
        '      <Button onClick={() => { reset(); refetch(); }}>초기화</Button>',
        '    </div>', // 닫힘 재현 → 통과해야 함
      ].join('\n'),
    },
  ];
  const r = svc.computeLineEdits(JSX, edits, noAnchor);
  check('닫힘 보존 시 정상 적용', r.text !== null && r.text!.includes('reset();') && r.text!.includes('</div>'));
}

// 15. 일반 코드 줄 삭제는 닫힘 가드와 무관 (false positive 방지)
{
  const edits: LineEdit[] = [{ from: 5, to: 5, content: '' }]; // useState 한 줄 삭제
  const r = svc.computeLineEdits(FILE, edits, noAnchor);
  check('일반 줄 삭제는 가드 통과', r.text !== null && !r.text!.includes('setAge'));
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
