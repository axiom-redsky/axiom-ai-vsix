/**
 * Mock 데이터 생성기(D2) 테스트 — 타입 읽기 · 값 만들기 · 봉투 · 역방향 왕복 · 실 자료.
 * 순수 모듈이라 vscode 스텁 없이 돈다. 계획: docs/offline-action-cards-plan.md §7 D2.
 *
 * 이 하니스가 지키려는 것:
 *  ① **타입을 사실대로 읽는다**(A·B) — 주석 처리된 선언·import한 타입·제네릭 조립·여러 줄 유니온.
 *     못 읽은 건 조용히 버리지 않고 이슈로 남는다.
 *  ② **결정론**(C) — 같은 (타입·옵션·시드)면 언제나 같은 JSON. 다시 만들 때 git diff가 뒤집히면
 *     아무도 다시 만들지 않는다.
 *  ③ ★**봉투 계약**(D) — scaffold `useApi`는 봉투를 안 벗긴다. JSON과 `useApi<T>` 한 줄이
 *     **같은 값에서** 나오므로 구조적으로 어긋날 수 없다는 것을 여기서 고정한다.
 *  ④ ★**역방향 왕복**(E) — 만든 JSON을 `JsonTypeGenerator`에 도로 넣으면 원래 타입이 나와야 한다.
 *     D2가 "JsonTypeGenerator 역방향"이라는 계획서 문구를 문자 그대로 검증하는 자리다.
 *  ⑤ **실 자료 스모크**(F) — 실제 scaffold의 타입 전량으로 한 번 돌린다(합성 케이스는 실제 코드가
 *     어떻게 생겼는지 모른다 — C1·B1·A4에서 매번 새 결함이 나왔다).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildTypeIndex, collectTypeDeclarations, lookupType, parseTypeFile, shapeOfDeclaration,
  shapeOfExpression, splitMembers, type ITypeFile, type TShape,
} from '../src/ai/mock/TypeShape';
import {
  DEFAULT_MOCK_OPTIONS, alreadyEnvelope, buildGeneric, buildSnippet, generateMock, mockEndpoint,
  mockFileName, mockFilePath, mockability, type IMockOptions,
} from '../src/ai/mock/MockData';
import { generateTypeFromJson } from '../src/ai/JsonTypeGenerator';
import { detectEnvelopeKey } from '../src/ai/ApiBindingRecipe';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

// ── 테스트용 타입 파일들(실제 scaffold 모양 그대로) ──────────────────────────

const F_EMPLOYEE = 'src/domains/hr/types/employee.ts';
const EMPLOYEE_SRC = [
  "import type { TDepartment } from '@/domains/hr/types/department';",
  "import type { TApiResponse } from '@/types/api-envelope';",
  '',
  '// 주석 처리된 옛 타입 — 살아 있다고 말하면 안 된다',
  "// export type TGhost = { gone: string };",
  '',
  "export type TEmployeeStatus = '재직' | '휴직' | '퇴사';",
  '',
  'export interface IAddress {',
  '  zipCode: string;',
  '  addr1: string;',
  '  addr2?: string;',
  '}',
  '',
  'export type TEmployee = {',
  '  empNo: number;',
  '  empId: string;',
  '  name: string;',
  '  email: string;',
  '  hireDate: string;',
  '  salary: number;',
  '  useYn: string;',
  '  status: TEmployeeStatus;',
  '  department: TDepartment;',
  '  address?: IAddress;',
  '  tags: string[];',
  '  createdAt: Date;',
  '};',
  '',
  'export type TEmployeeListResponse = TApiResponse<TEmployee[]>;',
].join('\n');

const F_DEPARTMENT = 'src/domains/hr/types/department.ts';
const DEPARTMENT_SRC = [
  'export type TDepartment = {',
  '  deptCd: string;',
  '  deptNm: string;',
  '  memberCount: number;',
  '};',
].join('\n');

const F_ENVELOPE = 'src/types/api-envelope.ts';
const ENVELOPE_SRC = [
  'export type TApiResponse<T> = {',
  '  success: boolean;',
  '  data: T;',
  '  totalCount?: number;',
  '};',
].join('\n');

function workspace(extra: ITypeFile[] = []): ReturnType<typeof buildTypeIndex> {
  return buildTypeIndex([
    parseTypeFile(EMPLOYEE_SRC, F_EMPLOYEE),
    parseTypeFile(DEPARTMENT_SRC, F_DEPARTMENT),
    parseTypeFile(ENVELOPE_SRC, F_ENVELOPE),
    ...extra,
  ]);
}

function shapeOf(name: string, file = F_EMPLOYEE): TShape {
  const index = workspace();
  const decl = lookupType(index, name, file);
  if (!decl) throw new Error(`선언을 찾지 못함: ${name}`);
  return shapeOfDeclaration(decl, index).shape;
}

function fieldsOf(shape: TShape): Record<string, TShape> {
  if (shape.kind !== 'object') throw new Error(`객체가 아님: ${shape.kind}`);
  return Object.fromEntries(shape.fields.map((f) => [f.name, f.shape]));
}

// ═══ A. 선언 수집 ═══════════════════════════════════════════════════════════
console.log('\n═══ A. 선언 수집 ═══');
{
  const decls = collectTypeDeclarations(EMPLOYEE_SRC, F_EMPLOYEE);
  const names = decls.map((d) => d.name);
  eq(names, ['TEmployeeStatus', 'IAddress', 'TEmployee', 'TEmployeeListResponse'], 'A1: 선언 4개를 순서대로 모은다');
  ok(!names.includes('TGhost'), 'A2: ★주석 처리된 선언은 살아 있다고 말하지 않는다');
  eq(decls[1].kind, 'interface', 'A3: interface 종류');
  ok(decls[1].body.startsWith('{') && decls[1].body.endsWith('}'), 'A4: interface 본문은 중괄호째');
  eq(decls[0].body, "'재직' | '휴직' | '퇴사'", 'A5: type alias 본문은 = 뒤 원문');
  eq(decls[2].line, 15, 'A6: 줄 번호(주석 지워도 안 밀린다)');
  ok(decls.every((d) => d.exported), 'A7: export 여부');

  const env = collectTypeDeclarations(ENVELOPE_SRC, F_ENVELOPE);
  eq(env[0].params, ['T'], 'A8: 제네릭 매개변수를 읽는다');

  const ext = collectTypeDeclarations(
    'export interface IChild extends IBase, IOther {\n  own: string;\n}', 'x.ts',
  );
  eq(ext[0].extendsList, ['IBase', 'IOther'], 'A9: extends 목록');

  const urlType = collectTypeDeclarations("export type TLink = { href: 'https://example.com/a' };", 'x.ts');
  ok(urlType[0].body.includes('https://example.com/a'), 'A10: ★문자열 안의 //는 주석이 아니다');

  const semiless = collectTypeDeclarations(
    'export type TA = string\nexport type TB = number\n', 'x.ts',
  );
  eq(semiless.map((d) => [d.name, d.body.trim()]), [['TA', 'string'], ['TB', 'number']],
    'A11: 세미콜론 없는 스타일도 다음 선언에서 끊는다');

  const file = parseTypeFile(EMPLOYEE_SRC, F_EMPLOYEE);
  eq(file.imports.get('TDepartment'), '@/domains/hr/types/department', 'A12: import 표(로컬 이름 → 모듈)');
}

// ═══ B. 타입식 → 모양 ══════════════════════════════════════════════════════
console.log('\n═══ B. 타입식 → 모양 ═══');
{
  const emp = fieldsOf(shapeOf('TEmployee'));
  eq(emp.empNo.kind, 'number', 'B1: number');
  eq(emp.empId.kind, 'string', 'B2: string');
  eq(emp.createdAt.kind, 'date', 'B3: Date는 날짜(문자열이 된다)');
  eq(emp.tags.kind, 'array', 'B4: 배열');
  eq((emp.tags as { item: TShape }).item.kind, 'string', 'B5: 배열 요소');

  const shape = shapeOf('TEmployee');
  const address = shape.kind === 'object' ? shape.fields.find((f) => f.name === 'address') : null;
  ok(!!address?.optional, 'B6: 선택 필드(`?`)');
  eq(address?.shape.kind, 'object', 'B7: 같은 파일의 interface 참조를 푼다');

  eq(emp.department.kind, 'object', 'B8: ★다른 파일에서 import한 타입도 푼다');
  eq(Object.keys(fieldsOf(emp.department)), ['deptCd', 'deptNm', 'memberCount'], 'B9: 그 필드까지');

  const status = emp.status;
  ok(status.kind === 'union' && status.options.length === 3, 'B10: 리터럴 유니온');
  eq(status.kind === 'union' ? status.options.map((o) => (o.kind === 'literal' ? o.value : null)) : [],
    ['재직', '휴직', '퇴사'], 'B11: 유니온 값들');

  // ★ 제네릭 인스턴스화 — 봉투 타입의 핵심.
  const resp = fieldsOf(shapeOf('TEmployeeListResponse'));
  eq(resp.success.kind, 'boolean', 'B12: 제네릭 타입의 고정 필드');
  eq(resp.data.kind, 'array', 'B13: ★제네릭 인자가 T 자리에 들어간다(TApiResponse<TEmployee[]>)');
  eq(resp.data.kind === 'array' ? resp.data.item.kind : null, 'object', 'B14: 그 요소가 TEmployee');

  const index = workspace();
  const rec = shapeOfExpression('Record<string, number>', F_EMPLOYEE, index);
  eq(rec.shape.kind, 'record', 'B15: Record');
  eq(rec.shape.kind === 'record' ? rec.shape.value.kind : null, 'number', 'B16: Record 값 타입');

  const missing = shapeOfExpression('TNowhere', F_EMPLOYEE, index);
  eq(missing.shape.kind, 'unknown', 'B17: 못 찾은 타입은 unknown');
  ok(missing.issues.some((i) => i.includes('TNowhere')), 'B18: ★모르면 모른다고 — 이슈로 남긴다');

  const fn = shapeOfExpression('{ a: string; onClick: () => void; run(): number }', F_EMPLOYEE, index);
  eq(Object.keys(fieldsOf(fn.shape)), ['a'], 'B19: 함수 필드는 JSON에 못 담아 뺀다');
  ok(fn.issues.length >= 2, 'B20: 뺀 이유를 남긴다');

  const ext = buildTypeIndex([
    parseTypeFile('export interface IBase { id: number; kind: string }', 'a.ts'),
    parseTypeFile("import type { IBase } from './a';\nexport interface IChild extends IBase { kind: number; extra: string }", 'b.ts'),
  ]);
  const child = shapeOfDeclaration(lookupType(ext, 'IChild', 'b.ts')!, ext).shape;
  eq(Object.keys(fieldsOf(child)), ['id', 'kind', 'extra'], 'B21: extends 병합(부모 먼저)');
  eq(fieldsOf(child).kind.kind, 'number', 'B22: 자식이 부모를 덮는다');

  const idx = shapeOfExpression('{ [key: string]: number }', F_EMPLOYEE, index);
  ok(idx.shape.kind === 'object' && !!idx.shape.index, 'B23: 인덱스 시그니처');

  const picked = shapeOfExpression("Pick<TEmployee, 'name' | 'email'>", F_EMPLOYEE, index);
  eq(Object.keys(fieldsOf(picked.shape)), ['name', 'email'], 'B24: Pick');
  const omitted = shapeOfExpression("Omit<TDepartment, 'memberCount'>", F_DEPARTMENT, index);
  eq(Object.keys(fieldsOf(omitted.shape)), ['deptCd', 'deptNm'], 'B25: Omit');
  const partial = shapeOfExpression('Partial<TDepartment>', F_DEPARTMENT, index);
  ok(partial.shape.kind === 'object' && partial.shape.fields.every((f) => f.optional), 'B26: Partial');

  const multiline = shapeOfExpression(
    '{\n  status:\n    | \'a\'\n    | \'b\';\n  next: string;\n}', F_EMPLOYEE, index,
  );
  const ml = fieldsOf(multiline.shape);
  ok(ml.status?.kind === 'union' && ml.status.options.length === 2, 'B27: ★여러 줄 유니온을 중간에서 자르지 않는다');
  eq(ml.next?.kind, 'string', 'B28: 그다음 필드도 살아 있다');

  const newlineOnly = shapeOfExpression('{\n  a: string\n  b: number\n}', F_EMPLOYEE, index);
  eq(Object.keys(fieldsOf(newlineOnly.shape)), ['a', 'b'], 'B29: 줄바꿈으로만 나뉜 멤버');

  const cyclic = buildTypeIndex([
    parseTypeFile('export type TNode = { id: number; child: TNode };', 'n.ts'),
  ]);
  const node = shapeOfDeclaration(lookupType(cyclic, 'TNode', 'n.ts')!, cyclic);
  eq(fieldsOf(node.shape).child.kind, 'unknown', 'B30: ★재귀 타입은 그 자리에서 멈춘다(무한루프 없음)');
  ok(node.issues.some((i) => i.includes('자기 자신')), 'B31: 멈춘 이유를 말한다');

  eq(splitMembers('a: string; b: number').length, 2, 'B32: 멤버 자르기(;)');
  eq(splitMembers('a: Record<string, number>, b: number').length, 2, 'B33: 제네릭 안 쉼표에 안 속는다');

  // ★ 실 scaffold가 가르쳐 준 것 — 못 읽는 이름의 대부분은 "남의 타입"이다. 원인을 구분해야 한다.
  const libIndex = buildTypeIndex([
    parseTypeFile(
      [
        "import React from 'react';",
        "import type { ColumnDef } from '@tanstack/react-table';",
        "import type { TDepartment } from '@/domains/hr/types/department';",
        'export type TPanelProps = {',
        '  title: string;',
        '  children: React.ReactNode;',
        '  columns: ColumnDef<TDepartment>[];',
        '  missing: TNotDeclaredHere;',
        '};',
      ].join('\n'),
      'src/x/Panel.tsx',
    ),
    parseTypeFile(DEPARTMENT_SRC, F_DEPARTMENT),
  ]);
  const panel = shapeOfDeclaration(lookupType(libIndex, 'TPanelProps', 'src/x/Panel.tsx')!, libIndex);
  const pf = fieldsOf(panel.shape);
  eq(pf.children.kind === 'unknown' ? pf.children.reason : null, '외부 라이브러리 타입',
    'B34: ★React 타입은 "못 찾음"이 아니라 "남의 타입"이라고 말한다');
  const columnItem = pf.columns.kind === 'array' ? pf.columns.item : pf.columns;
  eq(columnItem.kind === 'unknown' ? columnItem.reason : null, '외부 라이브러리 타입',
    'B35: import 표로 판정한다(이름 목록이 아니라) — `ColumnDef<TRow>[]`의 요소까지');
  eq(pf.missing.kind === 'unknown' ? pf.missing.reason : null, '선언을 찾지 못함',
    'B36: 우리 코드에서 못 찾은 것은 그대로 "못 찾음"');

  const generic = buildTypeIndex([
    parseTypeFile('export type TBox<TRow> = { rows: TRow[]; total: number };', 'g.ts'),
  ]);
  const box = shapeOfDeclaration(lookupType(generic, 'TBox', 'g.ts')!, generic);
  const boxRows = fieldsOf(box.shape).rows;
  eq(boxRows.kind === 'array' && boxRows.item.kind === 'unknown' ? boxRows.item.reason : null, '제네릭 자리',
    'B37: ★인자 없이 연 제네릭은 "빈 자리"다(못 찾은 것과 구분)');
  ok(box.issues.some((i) => i.includes('제네릭 자리')), 'B38: 인자를 정하라고 말한다');

  const mixed = shapeOfExpression(
    'TNotFound & { invalidate: string }', 'src/x/Panel.tsx', libIndex,
  );
  eq(Object.keys(fieldsOf(mixed.shape)), ['invalidate'], 'B39: 교차 타입은 읽어 낸 쪽을 살린다');
}

// ═══ C. 값 만들기 ══════════════════════════════════════════════════════════
console.log('\n═══ C. 값 만들기 ═══');
{
  const emp = shapeOf('TEmployee');
  const opts = (over: Partial<IMockOptions> = {}): IMockOptions => ({ ...DEFAULT_MOCK_OPTIONS, ...over });

  const a = generateMock(emp, 'TEmployee', opts());
  const b = generateMock(emp, 'TEmployee', opts());
  eq(a.text, b.text, 'C1: ★결정론 — 같은 옵션이면 글자 하나까지 같다');

  const seeded = generateMock(emp, 'TEmployee', opts({ seed: 7 }));
  ok(seeded.text !== a.text, 'C2: 시드를 바꾸면 값이 달라진다');

  const rows = (r: unknown): Record<string, unknown>[] =>
    ((r as Record<string, unknown>).data as Record<string, unknown>[]);
  eq(rows(a.json).length, 5, 'C3: count 만큼 행');

  eq(rows(a.json).map((r) => r.empNo), [1, 2, 3, 4, 5], 'C4: 숫자 id는 1부터 차례로');
  eq(rows(a.json)[0].empId, 'EMP-0001', 'C5: 문자열 id는 접두사 + 일련번호');
  eq(rows(a.json)[0].email, 'sample1@example.com', 'C6: 메일 형식');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(rows(a.json)[0].hireDate)), 'C7: 날짜 필드는 YYYY-MM-DD');
  ok(/^\d{4}-\d{2}-\d{2}T/.test(String(rows(a.json)[0].createdAt)), 'C8: Date 필드는 일시');
  ok(NAMES_LOOK_KOREAN(rows(a.json).map((r) => String(r.name))), 'C9: 이름 필드는 사람 이름 표본');
  eq(new Set(rows(a.json).map((r) => r.useYn)), new Set(['Y', 'N']), 'C10: ★여부(Yn) 필드는 Y/N');

  const statuses = rows(a.json).map((r) => r.status);
  eq(new Set(statuses).size, 3, 'C11: ★리터럴 유니온은 행마다 돌아가며 나온다(상태별 화면 확인용)');

  ok(typeof rows(a.json)[0].salary === 'number' && (rows(a.json)[0].salary as number) >= 1000,
    'C12: 금액 필드는 금액다운 자릿수');
  ok(Array.isArray(rows(a.json)[0].tags) && (rows(a.json)[0].tags as unknown[]).length === 2,
    'C13: 중첩 배열도 채운다');
  ok(typeof (rows(a.json)[0].department as Record<string, unknown>).deptNm === 'string',
    'C14: 중첩 객체(다른 파일 타입)도 채운다');
  ok('address' in rows(a.json)[0], 'C15: 선택 필드 포함(기본)');

  const noOpt = generateMock(emp, 'TEmployee', opts({ includeOptional: false }));
  ok(!('address' in rows(noOpt.json)[0]), 'C16: 선택 필드 빼기');
  ok(noOpt.notices.some((n) => n.includes('선택 필드')), 'C17: 뺐다는 사실을 말한다');

  const index = workspace();
  const unknownShape = shapeOfExpression('{ payload: any }', F_EMPLOYEE, index).shape;
  const un = generateMock(unknownShape, 'TX', opts({ count: 1, envelopeKey: null }));
  eq((un.json as Record<string, unknown>[])[0].payload, null, 'C18: 모르는 타입은 null로 두고');
  ok(un.notices.some((n) => n.includes('null')), 'C19: 직접 채우라고 말한다');

  const cyclic = buildTypeIndex([parseTypeFile('export type TNode = { id: number; child: TNode };', 'n.ts')]);
  const node = shapeOfDeclaration(lookupType(cyclic, 'TNode', 'n.ts')!, cyclic).shape;
  const nodeMock = generateMock(node, 'TNode', opts({ count: 2 }));
  ok(nodeMock.text.length > 0, 'C20: 재귀 타입도 값 생성이 끝난다');

  const big = generateMock(emp, 'TEmployee', opts({ count: 50 }));
  eq(rows(big.json).length, 50, 'C21: 50건도 만든다(페이징·스크롤 확인용)');
  eq(rows(big.json)[49].empNo, 50, 'C22: 마지막 행 번호');
}

function NAMES_LOOK_KOREAN(values: string[]): boolean {
  return values.every((v) => /^[가-힣]{2,4}$/.test(v));
}

// ═══ D. 봉투 · 제네릭 · 스니펫 ═════════════════════════════════════════════
console.log('\n═══ D. 봉투 · 제네릭 · 스니펫 ═══');
{
  const emp = shapeOf('TEmployee');
  const opts = (over: Partial<IMockOptions> = {}): IMockOptions => ({ ...DEFAULT_MOCK_OPTIONS, ...over });

  const wrapped = generateMock(emp, 'TEmployee', opts({ count: 3 }));
  const obj = wrapped.json as Record<string, unknown>;
  eq(Object.keys(obj), ['success', 'data', 'totalCount'], 'D1: 봉투 + 곁다리');
  eq(obj.totalCount, 3, 'D2: 곁다리는 실제 건수를 말한다');
  eq(wrapped.generic, '{ success: boolean; data: TEmployee[]; totalCount: number }', 'D3: ★제네릭이 JSON과 같은 모양');
  ok(wrapped.snippet.includes("useApi<{ success: boolean; data: TEmployee[]; totalCount: number }>"),
    'D4: 스니펫의 제네릭도 같은 것');
  ok(wrapped.snippet.includes('data?.data ?? []'), 'D5: ★봉투 벗기는 줄까지 준다');

  const bare = generateMock(emp, 'TEmployee', opts({ envelopeKey: null }));
  ok(Array.isArray(bare.json), 'D6: 봉투 없으면 배열 그대로');
  eq(bare.generic, 'TEmployee[]', 'D7: 그때 제네릭은 배열');
  ok(bare.snippet.includes('data ?? []'), 'D8: 벗길 봉투가 없으면 그대로 쓴다');

  const single = generateMock(emp, 'TEmployee', opts({ asList: false, envelopeKey: 'data', envelopeMeta: false }));
  eq(single.generic, '{ data: TEmployee }', 'D9: 단건 + 봉투');
  ok(single.snippet.includes('const item = data?.data ?? null;'), 'D10: 단건은 item으로 꺼낸다');

  const listKey = generateMock(emp, 'TEmployee', opts({ envelopeKey: 'list', envelopeMeta: false }));
  eq(Object.keys(listKey.json as Record<string, unknown>), ['list'], 'D11: 봉투 키를 고를 수 있다');
  eq(listKey.generic, '{ list: TEmployee[] }', 'D12: 고른 키가 제네릭에도 반영');

  // ★ 이미 봉투인 타입을 또 감싸면 data.data가 된다 — 그걸 말해 준다.
  const resp = shapeOf('TEmployeeListResponse');
  eq(alreadyEnvelope(resp), 'data', 'D13: ★이미 봉투인 타입을 알아본다(온라인 detectEnvelopeKey 재사용)');
  const doubled = generateMock(resp, 'TEmployeeListResponse', opts({ asList: false }));
  ok(doubled.notices.some((n) => n.includes('봉투')), 'D14: 두 번 감싸지 말라고 말한다');
  eq(alreadyEnvelope(shapeOf('TEmployee')), null, 'D15: 행 타입은 봉투가 아니다(오탐 없음)');

  const arrayAlias = shapeOfExpression('TEmployee[]', F_EMPLOYEE, workspace()).shape;
  const fromArray = generateMock(arrayAlias, 'TEmployeeList', opts({ asList: false, count: 4, envelopeKey: null }));
  ok(Array.isArray(fromArray.json) && (fromArray.json as unknown[]).length === 4,
    'D16: 타입 자체가 배열이면 목록 스위치 없이도 목록이다');

  eq(mockFileName('TEmployee'), 'employee', 'D17: 파일 이름(T 접두사 제거)');
  eq(mockFileName('IUserProfile'), 'user-profile', 'D18: 파일 이름(케밥)');
  eq(mockFilePath('TEmployee'), 'public/mock/employee.json', 'D19: 저장 위치');
  eq(mockEndpoint('public/mock/employee.json'), '/mock/employee.json', 'D20: ★그 자리는 dev 서버가 그대로 서빙한다');
  ok(wrapped.snippet.includes("'/mock/employee.json'"), 'D21: 스니펫이 그 주소를 쓴다');
  eq(buildGeneric('TEmployee', emp, opts({ envelopeKey: null, asList: false })), 'TEmployee', 'D22: 단건·봉투 없음');
  ok(buildSnippet('TEmployee', emp, opts(), '/mock/x.json').includes("'/mock/x.json'"), 'D23: 엔드포인트 주입');
}

// ═══ E. 역방향 왕복 (JsonTypeGenerator) ════════════════════════════════════
console.log('\n═══ E. 역방향 왕복 ═══');
{
  const emp = shapeOf('TEmployee');
  const mock = generateMock(emp, 'TEmployee', { ...DEFAULT_MOCK_OPTIONS, envelopeKey: null, count: 3 });

  // 만든 JSON을 도로 타입으로 — D2가 "JsonTypeGenerator 역방향"이라는 말의 실제 검증.
  const back = generateTypeFromJson({ json: mock.json, rootName: 'Employee', kind: 'type', source: 'chat' });
  for (const field of ['empNo', 'empId', 'name', 'email', 'hireDate', 'salary', 'useYn', 'status', 'department', 'tags', 'createdAt']) {
    ok(back.includes(`${field}`), `E1: 왕복 후에도 \`${field}\` 필드가 남는다`);
  }
  ok(/empNo\??: number/.test(back), 'E2: ★숫자가 문자열로 새지 않았다');
  ok(/empId\??: string/.test(back), 'E3: 문자열은 문자열');
  ok(/type TEmployeeItem/.test(back), 'E4: scaffold 타입 규칙(T 접두사)으로 복원');

  // ★ 왕복으로 되돌아오지 **않는** 것도 못박아 둔다: `?`는 값에 흔적이 없다.
  // 전 행에 채워 넣었으니 도로 읽으면 필수 필드로 보인다(JsonTypeGenerator가 문서로 밝힌 한계).
  ok(/address\??:/.test(back) && !/address\?:/.test(back), 'E5: 전 행을 채우면 선택 필드는 필수로 보인다(왕복 한계)');
  const thin = generateMock(emp, 'TEmployee', {
    ...DEFAULT_MOCK_OPTIONS, envelopeKey: null, count: 3, includeOptional: false,
  });
  ok(!JSON.stringify(thin.json).includes('address'), 'E6: 선택 필드를 빼면 JSON에도 없다');

  const withEnvelope = generateMock(emp, 'TEmployee', DEFAULT_MOCK_OPTIONS);
  eq(detectEnvelopeKey(withEnvelope.json as Record<string, unknown>), 'data',
    'E7: ★온라인 바인딩 층이 이 mock의 봉투를 알아본다(같은 어휘)');

  const parsedBack = JSON.parse(withEnvelope.text);
  eq(parsedBack, withEnvelope.json, 'E8: 출력 문자열이 실제로 유효한 JSON');
}

// ═══ F. 이 타입이 데이터인가 ═══════════════════════════════════════════════
console.log('\n═══ F. 이 타입이 데이터인가 ═══');
{
  const index = workspace();
  const empRes = shapeOfDeclaration(lookupType(index, 'TEmployee', F_EMPLOYEE)!, index);
  eq(mockability(empRes.shape, empRes.issues).level, 'data', 'F1: 값 타입은 그대로 fixture가 된다');

  const propsIndex = buildTypeIndex([
    parseTypeFile(
      [
        "import React from 'react';",
        'export type TButtonProps = {',
        '  children: React.ReactNode;',
        '  icon: React.ReactNode;',
        '  onClick: () => void;',
        '  label: string;',
        '};',
      ].join('\n'),
      'src/x/Button.tsx',
    ),
  ]);
  const props = shapeOfDeclaration(lookupType(propsIndex, 'TButtonProps', 'src/x/Button.tsx')!, propsIndex);
  eq(mockability(props.shape, props.issues).level, 'ui',
    'F2: ★화면 부품 prop 타입은 데이터가 아니라고 말한다(실 프로젝트 타입의 대부분이 이것)');

  const partialIndex = buildTypeIndex([
    parseTypeFile(
      [
        "import React from 'react';",
        'export type TRowWithIcon = {',
        '  id: number;',
        '  name: string;',
        '  amount: number;',
        '  icon: React.ReactNode;',
        '};',
      ].join('\n'),
      'src/x/Row.tsx',
    ),
  ]);
  const partial = shapeOfDeclaration(lookupType(partialIndex, 'TRowWithIcon', 'src/x/Row.tsx')!, partialIndex);
  const partialLevel = mockability(partial.shape, partial.issues);
  eq(partialLevel.level, 'partial', 'F3: 일부만 못 만들면 "일부"다');
  ok(partialLevel.reason.includes('1개'), 'F4: 몇 개를 직접 채워야 하는지 말한다');

  const statusRes = shapeOfDeclaration(lookupType(index, 'TEmployeeStatus', F_EMPLOYEE)!, index);
  eq(mockability(statusRes.shape, statusRes.issues).level, 'partial', 'F5: 값 하나짜리 타입(유니온)은 파일감이 아니다');

  const listRes = shapeOfDeclaration(lookupType(index, 'TEmployeeListResponse', F_EMPLOYEE)!, index);
  eq(mockability(listRes.shape, listRes.issues).level, 'data', 'F6: 봉투 타입도 데이터다');
}

// ═══ G. 실 자료 (react-app-scaffold) ═══════════════════════════════════════
console.log('\n═══ G. 실 자료 ═══');
{
  const ROOT = path.join('C:', 'redsky', 'work', 'react', 'single_react_new_nicfirst', 'react-app-scaffold');
  const srcRoot = path.join(ROOT, 'src');
  if (!fs.existsSync(srcRoot)) {
    console.log('  ⏭  실 scaffold를 찾지 못해 건너뜁니다:', srcRoot);
  } else {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
          out.push(path.relative(ROOT, p).split(path.sep).join('/'));
        }
      }
      return out;
    };
    const files = walk(srcRoot).map((p) => parseTypeFile(fs.readFileSync(path.join(ROOT, p), 'utf8'), p));
    const index = buildTypeIndex(files);
    const decls = files.flatMap((f) => f.decls);
    ok(decls.length > 100, `G1: 실 프로젝트 타입 선언 ${decls.length}개를 읽었다`);

    let generated = 0;
    let reallyMissing = 0;
    const levels = { data: 0, partial: 0, ui: 0 };
    for (const decl of decls) {
      const { shape, issues } = shapeOfDeclaration(decl, index);
      const mock = generateMock(shape, decl.name, { ...DEFAULT_MOCK_OPTIONS, count: 2 });
      JSON.parse(mock.text); // 출력이 늘 유효한 JSON인지
      generated++;
      levels[mockability(shape, issues).level]++;
      if (issues.some((i) => i.includes('타입을 찾지 못해'))) reallyMissing++;
    }
    eq(generated, decls.length, 'G2: ★전 타입에서 값 생성이 끝난다(크래시·무한루프 없음)');

    // ★ 실 자료가 가르쳐 준 것: 프로젝트 타입의 대부분은 데이터가 아니라 **화면 부품의 prop 타입**이다.
    // 그러니 "해석 실패율"이 아니라 "쓸 만한 타입이 실제로 나오는가"를 재야 한다.
    ok(levels.data >= 50, `G3: 데이터로 쓸 만한 타입 ${levels.data}개 (일부 ${levels.partial} · 화면 ${levels.ui})`);

    // 못 읽은 것의 원인이 남의 타입·함수 멤버라면 그건 사실이지, 파서의 실패가 아니다.
    // **우리 코드에서** 못 찾은 것만 진짜 실패로 센다.
    ok(reallyMissing <= 3, `G3b: ★우리 코드에서 못 찾은 선언 ${reallyMissing}개 (전 ${decls.length}개 중)`);

    // 실제 봉투 타입(core/types/api-types.ts의 ApiResponse<T>)을 제네릭째 조립해 본다.
    const apiResp = lookupType(index, 'ApiResponse', 'src/core/types/api-types.ts');
    ok(!!apiResp, 'G4: 실 봉투 타입 ApiResponse를 찾는다');
    if (apiResp) {
      const inst = shapeOfExpression('ApiResponse<{ id: number; name: string }>', 'src/core/types/api-types.ts', index);
      const fields = inst.shape.kind === 'object' ? inst.shape.fields.map((f) => f.name) : [];
      ok(fields.includes('data') && fields.includes('success'), 'G5: ★실 봉투에 제네릭 인자가 들어간다');
      const row = inst.shape.kind === 'object' ? inst.shape.fields.find((f) => f.name === 'data') : null;
      eq(row?.shape.kind, 'object', 'G6: data 자리가 넘긴 행 모양이 된다');
    }

    // 실 페이지가 쓰는 타입 하나로 끝까지: 타입 → mock → 봉투 감지.
    const post = lookupType(index, 'TJsonPlaceholderPost', 'src/domains/example/pages/use-api/ExUseApi.tsx');
    if (post) {
      const shape = shapeOfDeclaration(post, index).shape;
      const mock = generateMock(shape, post.name, DEFAULT_MOCK_OPTIONS);
      eq(detectEnvelopeKey(mock.json as Record<string, unknown>), 'data', 'G7: 실 타입 mock도 봉투가 붙는다');
      ok(mock.snippet.includes('useApi<'), 'G8: 실 타입에서도 useApi 한 줄이 나온다');
    } else {
      console.log('  ⏭  TJsonPlaceholderPost 없음 — 실 페이지 타입 검사 생략');
    }
  }
}

// ═══ 결과 ═══════════════════════════════════════════════════════════════════
console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
if (fail > 0) process.exitCode = 1;
