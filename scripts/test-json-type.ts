/**
 * JSON → 타입 생성 골든 — **모델 비의존**.
 *
 * detectJsonTypeRequest(판단)과 generateTypeFromJson(생성)을 결정론적으로 검증한다.
 * 핵심: ① 판단 양성/음성(JSON만/신호만/둘 다), ② 원시·중첩·배열·null optional,
 *       ③ 객체배열 키 합집합 optional, ④ interface 명시→I, ⑤ rootName 추출, ⑥ 잘못된 JSON → null.
 */

import {
  detectJsonTypeRequest,
  generateTypeFromJson,
  renderJsonTypeCard,
} from '../src/ai/JsonTypeGenerator';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
  }
}

console.log('판단(detectJsonTypeRequest):');
{
  // ① 신호 + 채팅 본문 JSON → 양성
  const r1 = detectJsonTypeRequest({
    query: '이 json으로 타입 만들어줘 ```json\n{"id":1,"name":"kim"}\n```',
  });
  check('신호+채팅JSON → 양성', !!r1, JSON.stringify(r1));
  check('소스=chat', r1?.source === 'chat', r1?.source);
  check('kind=type(기본)', r1?.kind === 'type', r1?.kind);

  // ② 신호 없음(JSON만) → null
  const r2 = detectJsonTypeRequest({ query: '```json\n{"id":1}\n```' });
  check('JSON만(신호X) → null', r2 === null);

  // ③ 신호만(JSON 없음) → null
  const r3 = detectJsonTypeRequest({ query: '타입 만들어줘' });
  check('신호만(JSON X) → null', r3 === null);

  // ④ 잘못된 JSON → null
  const r4 = detectJsonTypeRequest({ query: '타입 만들어줘 { id: 1, name } 이거' });
  check('깨진 JSON → null', r4 === null);

  // ⑤ interface 명시 → kind=interface
  const r5 = detectJsonTypeRequest({ query: '{"a":1} 이걸 인터페이스로 만들어줘' });
  check('인터페이스 명시 → kind=interface', r5?.kind === 'interface', r5?.kind);

  // ⑥ rootName 추출
  const r6 = detectJsonTypeRequest({ query: 'User 타입 만들어줘 {"id":1}' });
  check('rootName=User 추출', r6?.rootName === 'User', r6?.rootName);

  // ⑦ 선택 영역 캐스케이드(채팅엔 JSON 없음, 선택영역에 있음)
  const r7 = detectJsonTypeRequest({
    query: '선택한 거 타입으로 변환해줘',
    selectionText: '{"x": 10, "y": 20}',
  });
  check('선택영역 캐스케이드 → 소스=selection', r7?.source === 'selection', r7?.source);

  // ⑧ 현재 .json 파일 캐스케이드
  const r8 = detectJsonTypeRequest({
    query: '이 파일 타입 만들어줘',
    fileContent: '{"ok": true}',
    filePath: 'src/data/config.json',
  });
  check('파일 캐스케이드 → 소스=file', r8?.source === 'file', r8?.source);

  // ⑨ .json 아닌 파일은 캐스케이드 제외
  const r9 = detectJsonTypeRequest({
    query: '이 파일 타입 만들어줘',
    fileContent: '{"ok": true}',
    filePath: 'src/data/config.ts',
  });
  check('.ts 파일은 파일소스 제외 → null', r9 === null);
}

console.log('\n생성(generateTypeFromJson):');
{
  // 원시 타입 + T 접두사
  const out1 = generateTypeFromJson({
    json: { id: 1, name: 'kim', active: true },
    rootName: 'User',
    kind: 'type',
    source: 'chat',
  });
  check('type TUser 선언', /type TUser = \{/.test(out1), out1);
  check('id: number', /\bid: number;/.test(out1), out1);
  check('name: string', /\bname: string;/.test(out1), out1);
  check('active: boolean', /\bactive: boolean;/.test(out1), out1);

  // null → optional + unknown
  const out2 = generateTypeFromJson({
    json: { id: 1, deletedAt: null },
    rootName: 'Row',
    kind: 'type',
    source: 'chat',
  });
  check('null 값 → optional ?', /deletedAt\?: unknown;/.test(out2), out2);

  // 중첩 객체 → 별도 명명 타입 hoist + 자식 먼저 선언
  const out3 = generateTypeFromJson({
    json: { id: 1, address: { city: 'seoul', zip: '01000' } },
    rootName: 'User',
    kind: 'type',
    source: 'chat',
  });
  check('중첩 → TUserAddress 분리', /type TUserAddress = \{/.test(out3), out3);
  check('부모 필드가 명명 타입 참조', /address: TUserAddress;/.test(out3), out3);
  check('자식이 부모보다 먼저 선언', out3.indexOf('TUserAddress =') < out3.indexOf('type TUser ='), out3);

  // 원시 배열
  const out4 = generateTypeFromJson({
    json: { tags: ['a', 'b'] },
    rootName: 'Post',
    kind: 'type',
    source: 'chat',
  });
  check('원시 배열 → string[]', /tags: string\[\];/.test(out4), out4);

  // 빈 배열 → unknown[]
  const out5 = generateTypeFromJson({
    json: { items: [] },
    rootName: 'Box',
    kind: 'type',
    source: 'chat',
  });
  check('빈 배열 → unknown[]', /items: unknown\[\];/.test(out5), out5);

  // 객체 배열 키 합집합 + optional(누락/ null)
  const out6 = generateTypeFromJson({
    json: { users: [{ id: 1, name: 'a' }, { id: 2, nick: 'b', name: null }] },
    rootName: 'List',
    kind: 'type',
    source: 'chat',
  });
  check('객체배열 → TListUsersItem[]', /users: TListUsersItem\[\];/.test(out6), out6);
  check('합집합: id 필수', /\bid: number;/.test(out6), out6);
  check('일부 누락 nick → optional', /nick\?: string;/.test(out6), out6);
  check('일부 null name → optional', /name\?: string;/.test(out6), out6);

  // interface kind → I 접두사 + interface 선언
  const out7 = generateTypeFromJson({
    json: { baseURL: 'x', timeout: 1000 },
    rootName: 'ApiConfig',
    kind: 'interface',
    source: 'chat',
  });
  check('interface IApiConfig 선언', /interface IApiConfig \{/.test(out7), out7);
  check('interface는 = 없음', !/interface IApiConfig =/.test(out7), out7);

  // 루트가 배열 → alias
  const out8 = generateTypeFromJson({
    json: [{ id: 1 }],
    rootName: 'Root',
    kind: 'type',
    source: 'chat',
  });
  check('루트 배열 → type TRoot = TRootItem[]', /type TRoot = TRootItem\[\];/.test(out8), out8);

  // 빈 객체 → Record<string, unknown>
  const out9 = generateTypeFromJson({
    json: { meta: {} },
    rootName: 'Doc',
    kind: 'type',
    source: 'chat',
  });
  check('빈 객체 → Record<string, unknown>', /meta: Record<string, unknown>;/.test(out9), out9);

  // 비식별자 키 → 따옴표
  const out10 = generateTypeFromJson({
    json: { 'first-name': 'a' },
    rootName: 'P',
    kind: 'type',
    source: 'chat',
  });
  check('비식별자 키 → 따옴표', /'first-name': string;/.test(out10), out10);
}

console.log('\n카드 렌더(renderJsonTypeCard):');
{
  const card = renderJsonTypeCard({
    json: { id: 1 },
    rootName: 'User',
    kind: 'type',
    source: 'chat',
  });
  check('오프라인 배지 포함', card.includes('오프라인 모드'), '');
  check('typescript 코드블록 포함', card.includes('```typescript'), '');
  check('생성 타입 포함', card.includes('type TUser'), '');
  check('한계 안내 포함', card.includes('적용 규칙 / 한계'), '');
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
