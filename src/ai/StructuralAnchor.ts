/**
 * 선택 영역이 없을 때도 "어디를 수정할지"를 결정론적으로 계산하는 구조 앵커.
 *
 * 핵심 아이디어 (project_retry_use_current_file 원칙의 확장):
 *  - 약한 sLLM(qwen 14B 등)에게 라인 번호·exact-match search 텍스트를 묻지 않는다.
 *  - 모델은 "삽입할 코드 조각 + 필요한 import"만 내고,
 *  - 위치(앵커)는 splitTsSections 위에서 확장이 직접 계산해 결정론적으로 적용한다.
 *
 * 외부 의존성(타입스크립트 컴파일러 등) 없이 splitTsSections + 중괄호 깊이 추적만 사용한다.
 * (폐쇄망 환경 의존성 0 유지)
 */
import { splitTsSections, countDelimiters, stripTrailingLineComment, type CodeSection } from './CodeSectionExtractor';

/**
 * 훅 호출 패턴: useApi / useState / useEffect ...
 * `use` + 대문자 시작 + (선택)제네릭 타입인자 `<...>` + `(`.
 * 예: useState(  /  useApi<TPost[]>(  /  useApi<A & { x: 1 }, B>(
 * 제네릭/인자가 여러 줄에 걸쳐도 문장 전체 텍스트에서 탐지하므로 안전하다.
 */
const HOOK_CALL = /\buse[A-Z]\w*\s*[(<]/;

export interface ComponentAnchor {
  /** export default 컴포넌트 함수 이름 */
  name: string;
  /** 컴포넌트 함수 시작 라인 (1-based) */
  startLine: number;
  /** 컴포넌트 함수 끝 라인 (1-based) */
  endLine: number;
  /**
   * 새 훅(useApi 등)을 삽입할 라인 (1-based, "이 라인 앞에 삽입").
   * 우선순위: 마지막 훅 문장 다음 → return 문 앞 → 함수 여는 중괄호 다음.
   */
  hookInsertLine: number;
  /** 삽입점이 어떻게 결정됐는지 (진단용) */
  hookInsertReason: 'after-last-hook' | 'before-return' | 'after-open-brace';
  /** 컴포넌트 본문 들여쓰기 (탭/스페이스 그대로) */
  bodyIndent: string;
}

export interface ImportAnchor {
  /** import 블록 시작 라인 (1-based) */
  startLine: number;
  /** import 블록 끝 라인 (1-based) */
  endLine: number;
  /** module 경로 → 이미 import된 named specifier 집합 */
  byModule: Map<string, { named: Set<string>; def: string | null; lineIndex0: number }>;
}

export interface StructuralAnchors {
  component: ComponentAnchor | null;
  imports: ImportAnchor | null;
  /** 모델이 "어느 섹션?"을 이름으로 고를 수 있게 제공하는 목록 */
  sections: { name: string; kind: CodeSection['kind']; startLine: number; endLine: number }[];
}

/** 한 줄이 비어있거나 주석인지 */
function isBlankOrComment(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * export default 함수 컴포넌트 섹션을 찾는다.
 * (scaffold는 `export default function Name(): React.ReactNode { ... }` 패턴)
 */
function findComponentSection(sections: CodeSection[]): CodeSection | null {
  return (
    sections.find(
      (s) => s.kind === 'function' && /^export\s+default\b/.test(s.body.trimStart()),
    ) ?? null
  );
}

/**
 * 컴포넌트 본문을 문장(statement) 단위로 훑어 훅 삽입점을 계산한다.
 *
 * 중괄호 깊이를 추적하며 "본문 최상위(depth 1)" 문장만 식별한다.
 * 여러 줄에 걸친 훅(구조분해 할당 등)도 문장 전체 텍스트에서 훅 호출을 탐지하므로 안전하다.
 */
function computeComponentAnchor(section: CodeSection): ComponentAnchor {
  const lines = section.body.split('\n');
  const base = section.startLine; // 1-based 절대 라인

  let depth = 0;
  let opened = false; // 함수 여는 중괄호를 지났는가
  let openBraceIdx = 0; // 본문 시작(여는 중괄호) 라인 인덱스(0-based, section 내부 상대)

  let stmtStart: number | null = null; // 현재 최상위 문장 시작 idx
  let lastHookEndIdx: number | null = null;
  let returnIdx: number | null = null;
  let bodyIndent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startDepth = depth;
    const { open, close } = countDelimiters(line);
    depth += open - close;

    if (!opened) {
      if (depth >= 1) {
        opened = true;
        openBraceIdx = i;
      }
      continue;
    }

    // 본문 최상위 문장 시작 감지
    if (startDepth === 1 && stmtStart === null && !isBlankOrComment(line)) {
      stmtStart = i;
      if (!bodyIndent) bodyIndent = line.match(/^[ \t]*/)?.[0] ?? '';
    }

    // 문장 종료: 다시 depth 1로 돌아온 시점
    if (stmtStart !== null && depth === 1) {
      const text = lines.slice(stmtStart, i + 1).join('\n');
      const firstTrimmed = lines[stmtStart].trim();

      if (/^return\b/.test(firstTrimmed)) {
        returnIdx = stmtStart;
        break; // 첫 본문 최상위 return에서 중단
      }
      if (HOOK_CALL.test(text)) {
        lastHookEndIdx = i;
      }
      stmtStart = null;
    }

    if (opened && depth === 0) break; // 함수 닫힘
  }

  let insertIdx0: number;
  let reason: ComponentAnchor['hookInsertReason'];
  if (lastHookEndIdx !== null) {
    insertIdx0 = lastHookEndIdx + 1;
    reason = 'after-last-hook';
  } else if (returnIdx !== null) {
    insertIdx0 = returnIdx;
    reason = 'before-return';
  } else {
    insertIdx0 = openBraceIdx + 1;
    reason = 'after-open-brace';
  }

  return {
    name: section.name,
    startLine: section.startLine,
    endLine: section.endLine,
    hookInsertLine: base + insertIdx0,
    hookInsertReason: reason,
    bodyIndent: bodyIndent || '\t',
  };
}

/** import 한 줄을 파싱한다. */
function parseImportLine(line: string): { module: string; named: string[]; def: string | null } | null {
  const m = line.match(/^\s*import\s+(?:type\s+)?(.+?)\s+from\s*['"]([^'"]+)['"]/);
  if (!m) {
    // side-effect import (import './x') 은 대상 외
    return null;
  }
  const clause = m[1];
  const module = m[2];
  const named: string[] = [];
  let def: string | null = null;

  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(',')) {
      const id = part.trim().split(/\s+as\s+/)[0].trim();
      if (id) named.push(id);
    }
  }
  const defMatch = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
  if (defMatch && !defMatch.startsWith('*')) def = defMatch;

  return { module, named, def };
}

/**
 * 물리 라인 배열에서 **논리 import 문**을 모은다. 멀티라인 named import
 * (`import {⏎  Select,⏎  SelectItem,⏎} from '@axiom/components/ui';`)을 한 논리 문자열로 합쳐
 * 돌려줘, 한 줄 정규식인 parseImportLine이 멀티라인을 통째로 놓치던 한계를 보완한다.
 *
 * (이 누락 때문에 이미 멀티라인으로 import된 모듈을 "없다"고 오판해 같은 모듈을 한 줄 더 추가 →
 *  중복 식별자 컴파일 에러가 났다.)
 */
function collectLogicalImports(lines: string[]): string[] {
  const out: string[] = [];
  const isComplete = (s: string): boolean =>
    /from\s*['"][^'"]+['"]/.test(s) || /;\s*$/.test(s.trim());
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*import\b/.test(lines[i])) {
      i++;
      continue;
    }
    let buf = lines[i];
    let j = i;
    while (!isComplete(buf) && j + 1 < lines.length) {
      j++;
      buf += ' ' + lines[j].trim();
    }
    out.push(buf);
    i = j + 1;
  }
  return out;
}

/** import 블록 앵커를 만든다. */
function computeImportAnchor(section: CodeSection): ImportAnchor {
  const byModule: ImportAnchor['byModule'] = new Map();
  const lines = section.body.split('\n');
  lines.forEach((line, idx) => {
    const parsed = parseImportLine(line);
    if (!parsed) return;
    const entry = byModule.get(parsed.module) ?? { named: new Set<string>(), def: null, lineIndex0: idx };
    for (const n of parsed.named) entry.named.add(n);
    if (parsed.def) entry.def = parsed.def;
    byModule.set(parsed.module, entry);
  });
  return { startLine: section.startLine, endLine: section.endLine, byModule };
}

/** 소스에서 구조 앵커를 모두 계산한다. */
export function computeAnchors(source: string): StructuralAnchors {
  const sections = splitTsSections(source);
  const compSection = findComponentSection(sections);
  const importSection = sections.find((s) => s.kind === 'import') ?? null;

  return {
    component: compSection ? computeComponentAnchor(compSection) : null,
    imports: importSection ? computeImportAnchor(importSection) : null,
    sections: sections.map((s) => ({
      name: s.name,
      kind: s.kind,
      startLine: s.startLine,
      endLine: s.endLine,
    })),
  };
}

// ─── 결정론적 적용 ──────────────────────────────────────────────────────────

export interface ImportRequest {
  module: string;
  named?: string[];
  def?: string;
}

export interface StructuralEdit {
  /** 컴포넌트 본문에 삽입할 훅/코드 조각 (들여쓰기 없이; 확장이 bodyIndent를 붙임) */
  hookCode?: string;
  /** 추가할 import 목록 — 이미 있으면 자동 skip/merge */
  imports?: ImportRequest[];
}

export interface ApplyResult {
  text: string;
  changes: string[];
}

/** 라인 배열의 앞·뒤 빈 줄을 제거하고 연속 빈 줄을 1줄로 접는다. */
function tidyBlankLines(lines: string[]): string[] {
  const collapsed: string[] = [];
  for (const l of lines) {
    if (l.trim() === '' && collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') {
      continue; // 연속 빈 줄 접기
    }
    collapsed.push(l);
  }
  let start = 0;
  let end = collapsed.length;
  while (start < end && collapsed[start].trim() === '') start++;
  while (end > start && collapsed[end - 1].trim() === '') end--;
  return collapsed.slice(start, end);
}

/**
 * 모듈 스코프로 올려도 **안전한** 단일 라인 const: 원시 리터럴(문자열·숫자·불리언, `as const` 허용)만.
 * 예: `const EMPLOYEES_ENDPOINT = '/api/employees';`, `const PAGE_LIMIT = 10;`
 * 배열·객체·식별자/호출이 들어간 RHS는 컴포넌트 스코프(훅 결과 등)를 참조할 수 있어 제외한다
 * (예: `const departments = deptResponse?.data ?? []` 은 본문에 남겨야 함).
 */
const HOISTABLE_LITERAL_CONST =
  /^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*(?::\s*[^=]+?)?=\s*(?:'[^']*'|"[^"]*"|`[^`$]*`|-?\d[\d_.]*|true|false)\s*(?:as\s+const\s*)?;?\s*$/;

/**
 * 훅 조각에서 모듈 스코프로 올릴 선언(type/interface/enum + 원시 리터럴 const)을 분리한다.
 *
 * react-app-scaffold 컨벤션: 타입 선언과 엔드포인트/상수(EMPLOYEES_ENDPOINT 등)는 컴포넌트 본문이 아니라
 * 함수 바로 위(모듈 스코프)에 둔다. 약한 모델이 이를 훅 조각에 섞어 내더라도 확장이 결정론적으로 끌어올린다.
 *
 * 안전성: const는 **단일 라인 원시 리터럴**만 올린다(HOISTABLE_LITERAL_CONST). 훅 결과·컴포넌트 변수를
 * 참조하는 const(예: `const departments = deptResponse?.data ?? []`)는 본문에 남겨 깨지지 않게 한다.
 * 들여쓰기가 붙은 조각은 DECL_PATTERN(라인 시작)이 매칭되지 않아 분리되지 않고 본문에 들어간다(graceful fallback).
 */
function splitTypeDeclarations(
  hookCode: string,
  existingNames: Set<string> = new Set(),
): {
  typeDecls: string;
  rest: string;
  typeCount: number;
} {
  const sections = splitTsSections(hookCode);
  const isModuleDecl = (s: CodeSection): boolean =>
    s.kind === 'type' ||
    s.kind === 'interface' ||
    (s.kind === 'const' && s.startLine === s.endLine && HOISTABLE_LITERAL_CONST.test(s.body.trim()));

  // 모듈 스코프로 올릴 선언. 단, 이름이 이미 모듈 스코프에 있으면 **드롭**한다(중복 선언 = 컴파일 에러 방지).
  // 모델이 기존 이름을 재사용해 새 const/type를 내는 경우(예: PAGE_LIMIT 재정의)를 결정론적으로 흡수.
  const moduleSections = sections.filter((s) => isModuleDecl(s) && !existingNames.has(s.name));
  const collisionSections = sections.filter((s) => isModuleDecl(s) && existingNames.has(s.name));
  if (moduleSections.length === 0 && collisionSections.length === 0) {
    return { typeDecls: '', rest: hookCode, typeCount: 0 };
  }

  const lines = hookCode.split('\n');
  const removeLine = new Array<boolean>(lines.length).fill(false);
  // 올릴 선언과 충돌로 드롭할 선언 모두 본문(rest)에서 제거한다.
  // (충돌 선언을 본문에 남기면 모듈 const를 가려 TDZ 참조 오류가 날 수 있어 안전하게 드롭)
  for (const s of [...moduleSections, ...collisionSections]) {
    for (let ln = s.startLine; ln <= s.endLine; ln++) removeLine[ln - 1] = true;
  }
  const restLines = lines.filter((_, i) => !removeLine[i]);
  // 선언은 섹션 본문을 빈 줄로 구분해 재조립(가독성 유지).
  const typeDecls = moduleSections.map((s) => s.body).join('\n\n');
  return {
    typeDecls,
    rest: tidyBlankLines(restLines).join('\n'),
    typeCount: moduleSections.length,
  };
}

/**
 * 구조분해/단순 바인딩 패턴에서 실제로 선언되는 식별자들을 추출한다.
 * 예) `teamReports` → [teamReports]
 *     `{ data: teamReports, isPending, error }` → [teamReports, isPending, error]
 *     `[first, , third]` → [first, third]
 * 중첩·rename·기본값(`= ...`)·rest(`...x`)를 best-effort로 처리한다(풀 파서 없이).
 */
function parseBindingPattern(pattern: string): string[] {
  const p = pattern.trim();
  if (!p) return [];
  if (/^[A-Za-z_$][\w$]*$/.test(p)) return [p];
  if (!/^[{[]/.test(p)) return [];

  const inner = p.slice(1, -1); // 바깥 {} 또는 [] 제거
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);

  const names: string[] = [];
  for (let part of parts) {
    part = part.trim().replace(/^\.\.\./, ''); // rest 제거
    if (!part) continue;
    part = part.split('=')[0].trim(); // 기본값 제거
    if (part.includes(':')) {
      // 객체 rename: `key: binding` → binding (binding 자체가 또 구조분해일 수 있음)
      names.push(...parseBindingPattern(part.slice(part.indexOf(':') + 1).trim()));
    } else if (/^[{[]/.test(part)) {
      names.push(...parseBindingPattern(part)); // 중첩 구조분해
    } else if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      names.push(part);
    }
  }
  return names;
}

/**
 * 코드 조각이 `const`/`let`/`var`로 새로 선언하는 바인딩 이름 집합.
 * 같은 이름의 기존 모듈 스코프 더미 변수를 대체했는지 판단하는 데 쓴다.
 *
 * splitTsSections 대신 직접 스캔한다 — 구조분해 선언(`const { data: x } = ...`)은
 * DECL_PATTERN(키워드 뒤 식별자)에 매칭되지 않아 섹션으로 잡히지 않기 때문이다.
 */
function collectDeclaredBindings(code: string): Set<string> {
  const out = new Set<string>();
  // 문장 경계(줄 시작·`;`·`{`) 뒤의 const/let/var 만 선언으로 본다.
  const re = /(?:^|[\n;{])\s*(?:export\s+)?(?:const|let|var)\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    // 바인딩 패턴 = 키워드 이후 ~ depth0의 첫 할당 '='(==·!=·=>· <=· >= 제외) 또는 ';'
    let depth = 0;
    let end = -1;
    for (let i = re.lastIndex; i < code.length; i++) {
      const ch = code[i];
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') {
        if (depth === 0) {
          end = i;
          break;
        }
        depth--;
      } else if (
        depth === 0 &&
        ch === '=' &&
        code[i + 1] !== '=' &&
        code[i + 1] !== '>' &&
        code[i - 1] !== '=' &&
        code[i - 1] !== '!' &&
        code[i - 1] !== '<' &&
        code[i - 1] !== '>'
      ) {
        end = i;
        break;
      } else if (depth === 0 && ch === ';') {
        end = i;
        break;
      }
    }
    const pattern = (end >= 0 ? code.slice(re.lastIndex, end) : code.slice(re.lastIndex)).trim();
    for (const n of parseBindingPattern(pattern)) out.add(n);
  }
  return out;
}

/**
 * 코드 조각을 문장 단위로 쪼갠다(괄호·중괄호·대괄호 균형이 0으로 돌아오고 `;`로 끝나면 문장 종료).
 * 멀티라인 `const { data } = useApi({\n …\n});` 도 한 문장으로 묶는다.
 */
function splitStatements(code: string): string[] {
  const lines = code.split('\n');
  const out: string[] = [];
  let buf: string[] = [];
  let depth = 0;
  for (const line of lines) {
    buf.push(line);
    const { open, close } = countDelimiters(line);
    depth += open - close;
    const c = line.replace(/\/\/.*$/, '').trimEnd();
    if (depth <= 0 && /;\s*$/.test(c)) {
      out.push(buf.join('\n'));
      buf = [];
      depth = 0;
    }
  }
  if (buf.length) out.push(buf.join('\n'));
  return out;
}

/**
 * 훅 조각에서, 선언하는 바인딩이 **모두 이미 대상 파일에 존재**하는 const/let/var 문장을 드롭한다.
 *
 * 약한 모델이 의존성 헤더의 기존 선언(예: `const [selectedStatus] = useState('all')`)을 그대로 베껴
 * 다시 선언하면 같은 스코프에 중복 선언이 생겨 **컴파일 에러**가 난다(실측: 투입상태 select 편집에서
 * selectedStatus 중복). 모듈 스코프 충돌만 막던 splitTypeDeclarations를 컴포넌트 본문 바인딩까지 확장한다.
 * 일부 바인딩만 겹치면(나머지는 신규) 신규 손실을 피하려 보존한다(전부 겹칠 때만 드롭).
 */
function dropDuplicateDeclarations(code: string, existing: Set<string>): { text: string; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const stmt of splitStatements(code)) {
    const m = stmt.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\s\S]*?)(?:=(?![=>])|;)/);
    if (m) {
      const names = parseBindingPattern(m[1].trim());
      if (names.length > 0 && names.every((n) => existing.has(n))) {
        dropped.push(names.join(', '));
        continue;
      }
    }
    kept.push(stmt);
  }
  return { text: kept.join('\n'), dropped };
}

/**
 * const 선언 본문에서 RHS(우변)를 추출한다. 첫 depth0 '='(==·=>·!=·<=·>= 제외) 이후 ~ 끝(트레일링 ; 제거).
 * 타입 주석(`const x: Record<A, B> = …`)의 '='는 보통 없으므로 first-'=' 휴리스틱으로 충분하다.
 */
function constRhs(body: string): string | null {
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (
      ch === '=' &&
      body[i + 1] !== '=' && body[i + 1] !== '>' &&
      body[i - 1] !== '=' && body[i - 1] !== '!' && body[i - 1] !== '<' && body[i - 1] !== '>'
    ) {
      return body.slice(i + 1).replace(/;?\s*$/, '').trim();
    }
  }
  return null;
}

/** 텍스트에서 문자열 리터럴 내용·숫자 리터럴을 무손실 비교용 토큰 집합으로 추출한다. */
function literalTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) out.add('s:' + (m[1] ?? m[2] ?? m[3] ?? ''));
  for (const m of text.matchAll(/(?<![\w$])-?\d[\d_]*(?:\.\d+)?/g)) out.add('n:' + m[0]);
  return out;
}

/** 비교 정규화: 연속 공백 접기 + 트레일링 세미콜론·양끝 공백 제거. */
function normDecl(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/;?\s*$/, '').trim();
}

/** 모듈 스코프 교체를 허용하는 primitive 리터럴 RHS(문자열·숫자·불리언, `as const` 허용). */
const PRIMITIVE_RHS = /^(?:'[^']*'|"[^"]*"|`[^`$]*`|-?\d[\d_.]*|true|false)\s*(?:as\s+const\s*)?$/;
/** RHS 시작이 화살표 함수/함수식인지(헬퍼 함수 재출력 헛 교체 방지). 문자열 속 `=>`는 head가 아니라 안전. */
const ARROW_OR_FN_RHS = /^\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/;

/**
 * 기존 선언을 모델의 재선언으로 **결정론 교체**해도 되는지 판정한다(무손실·헛교체 방지 가드).
 *  - 화살표/함수식 RHS: **항상 비대상**. 함수를 모델 재출력으로 갈아끼우면 요청과 무관한 헛 적용·구현 변질이
 *    난다(실측: formatDate 헬퍼 재선언이 '연락처 추가'와 무관히 교체돼 헛 applied → 제외).
 *  - 배열/객체 리터럴(컬렉션): 기존의 모든 문자열·숫자 리터럴이 새 본문에 **전부 보존**될 때만 허용한다.
 *    (약한 모델이 배열을 기억으로 재구성하며 기존 항목을 누락/환각하는 **손실 적용** 차단. 실측: '수석 추가'에
 *     기존 '사원'을 빠뜨리고 직급 사다리를 새로 씀 → 거부.)
 *  - primitive 리터럴(문자열/숫자/불리언): 값 변경이 의도이므로 허용(예: PAGE_LIMIT 20→50).
 *  - 그 외(호출 등 식): `allowCall`이면 허용(useState 초기값 변경 등 컴포넌트 바인딩 in-place 수정),
 *    아니면 거부(모듈 const는 리터럴만 — 파생/식 const 보수적 제외).
 */
function canReplaceDecl(
  existingBody: string,
  newBody: string,
  opts: { allowCall: boolean; removalIntent?: boolean },
): { ok: boolean; reason: string } {
  const rhsE = constRhs(existingBody);
  const rhsN = constRhs(newBody);
  if (rhsE === null || rhsN === null) return { ok: false, reason: 'RHS 파싱 불가' };
  if (ARROW_OR_FN_RHS.test(rhsE)) return { ok: false, reason: '함수/화살표 RHS — 교체 비대상' };
  const head = rhsE.trimStart()[0];
  if (head === '[' || head === '{') {
    const existingLits = literalTokens(rhsE);
    const newLits = literalTokens(rhsN);
    if (opts.removalIntent) {
      // 삭제 의도(빼/제거 등): 항목 제거를 허용하되 **환각(없던 항목 추가)** 은 차단한다 → 새 ⊆ 기존.
      // (무손실 가드가 '실수 누락'과 '의도적 제거'를 구분 못 하던 갭의 해소 — del 의도일 때만 부분집합 허용.)
      const added = [...newLits].filter((l) => !existingLits.has(l));
      if (added.length > 0) {
        const show = added.slice(0, 3).map((l) => l.slice(2)).join(', ');
        return { ok: false, reason: `삭제 의도인데 없던 항목 추가(${show}) — 환각 의심` };
      }
      if (newLits.size === 0 && existingLits.size > 0) {
        return { ok: false, reason: '삭제 의도인데 전 항목 제거 — 의심' };
      }
      return { ok: true, reason: '' };
    }
    // 비-삭제: 무손실(superset) — 기존 리터럴이 전부 보존돼야 함.
    const missing = [...existingLits].filter((l) => !newLits.has(l));
    if (missing.length > 0) {
      const show = missing.slice(0, 3).map((l) => l.slice(2)).join(', ');
      return { ok: false, reason: `기존 항목 누락(${show}${missing.length > 3 ? ' …' : ''})` };
    }
    return { ok: true, reason: '' };
  }
  if (PRIMITIVE_RHS.test(rhsE)) return { ok: true, reason: '' };
  return opts.allowCall ? { ok: true, reason: '' } : { ok: false, reason: '비-리터럴 RHS(식) — 교체 비대상' };
}

interface ConstReplaceOp { atLine: number; removeCount: number; content: string[] }

/**
 * 훅 조각에서 "기존 top-level const를 재선언"하는 부분을 찾아 **결정론적 교체 op**으로 변환한다.
 *
 * 하이브리드 포맷은 (a)JSX 영역 재작성·(b)새 훅/타입/import 추가만 표현하고 (c)영역 밖 기존 선언의 수정은
 * 표현할 채널이 없었다. 모델은 자연히 "배열/const 통째 재선언"으로 답하는데, 그게 dropDuplicateDeclarations에
 * 먹혀 변경0(no-op)이 됐다(실측: 직급 select에 항목 추가). 여기서 재선언을 기존 선언 위치의 in-place 교체로
 * 바꾼다. **무손실 가드(canReplaceConst)** 를 통과한 것만 교체하고, 거부분은 hook에 남겨 종전 드롭 경로로
 * 흘려보낸다(=손실 적용 대신 종전 no-op 유지).
 */
function extractConstReplacements(
  hookCode: string,
  topConstByName: Map<string, CodeSection>,
  removalIntent: boolean,
): { reducedHook: string; ops: ConstReplaceOp[]; replaced: string[]; rejected: { name: string; reason: string }[] } {
  const ops: ConstReplaceOp[] = [];
  const replaced: string[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const hookLines = hookCode.split('\n');
  const consumed = new Array<boolean>(hookLines.length).fill(false);

  for (const hs of splitTsSections(hookCode)) {
    if (hs.kind !== 'const') continue;
    const existing = topConstByName.get(hs.name);
    if (!existing) continue;
    if (normDecl(existing.body) === normDecl(hs.body)) continue; // 동일 → 순수 중복(종전대로 드롭)
    const guard = canReplaceDecl(existing.body, hs.body, { allowCall: false, removalIntent }); // 모듈 const는 리터럴 데이터만
    if (!guard.ok) {
      rejected.push({ name: hs.name, reason: guard.reason });
      continue; // hook에 남겨 중복 드롭 경로로 → 손실 적용 차단(종전 no-op 유지)
    }
    ops.push({
      atLine: existing.startLine,
      removeCount: existing.endLine - existing.startLine + 1,
      content: hs.body.split('\n'),
    });
    replaced.push(hs.name);
    for (let ln = hs.startLine; ln <= hs.endLine; ln++) consumed[ln - 1] = true;
  }

  const reducedHook = consumed.some(Boolean) ? hookLines.filter((_, i) => !consumed[i]).join('\n') : hookCode;
  return { reducedHook, ops, replaced, rejected };
}

/** 한 선언 문장의 바인딩 이름 목록(구조분해 포함). 선언이 아니면 빈 배열. */
function declBindings(stmt: string): string[] {
  const m = stmt.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\s\S]*?)(?:=(?![=>])|;)/);
  return m ? parseBindingPattern(m[1].trim()) : [];
}

/**
 * 삽입할 컴포넌트 본문 코드(rest)에서, 최종 파일(baseText=영역 반영 소스 + 조각 내 나머지 문장) 어디에서도
 * 참조되지 않는 **죽은 선언 문장**을 반복 제거한다.
 *
 * region이 실제 편집된 케이스에서 약한 모델은 요청과 무관한 미사용 state/const(곁다리 죽은코드)를 덤으로
 * 붙이곤 한다(실측: '대기 옵션 추가'에 미사용 selectedStatus, 'Kotlin 추가'에 미사용 suggestedSkills).
 * 실제 편집(region)은 살리고 이 곁다리만 걷어내 깨끗한 적용을 만든다. 체인(A→B→dead) 해소를 위해 변화가
 * 없을 때까지 반복한다. (region 미변경 케이스엔 호출하지 않는다 — 그건 dead-binding 게이트가 폴백 처리.)
 */
function stripDeadStatements(restCode: string, baseText: string): { code: string; dropped: string[] } {
  let stmts = splitStatements(restCode);
  const dropped: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    const surviving: string[] = [];
    for (let i = 0; i < stmts.length; i++) {
      const bindings = declBindings(stmts[i]);
      if (bindings.length === 0) {
        surviving.push(stmts[i]);
        continue;
      }
      const universe = baseText + '\n' + stmts.filter((_, j) => j !== i).join('\n');
      const used = bindings.some((b) =>
        new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(universe),
      );
      if (used) surviving.push(stmts[i]);
      else {
        dropped.push(bindings.join(', '));
        changed = true;
      }
    }
    stmts = surviving;
  }
  return { code: stmts.join('\n'), dropped };
}

/**
 * **컴포넌트 본문**의 기존 단일 라인 선언을, 모델이 같은 바인딩으로 재선언한 조각으로 in-place 교체한다.
 *
 * extractConstReplacements가 모듈 스코프 const(옵션 배열 등)를 다룬다면, 이쪽은 컴포넌트 본문의 useState
 * 초기값 변경 같은 경우다 — `const [department, setDepartment] = useState('')`를 모델이 `useState('개발팀')`로
 * 재선언하면 dropDuplicateDeclarations가 바인딩 중복으로 드롭해 변경0(no-op)이 됐다(실측: 부서 기본선택 변경).
 *
 * 안전 범위(보수적): **바인딩 집합이 정확히 일치**하는 기존 **단일 라인** 선언만 교체하고, 가드는 allowCall=true
 * (useState 등 호출 초기값 변경 허용)지만 화살표/함수 RHS는 제외(handleSearch 등 헬퍼 헛교체 방지) +
 * 컬렉션은 무손실. 멀티라인 기존 선언·바인딩 불일치는 종전 동작(드롭)으로 둔다.
 */
function extractComponentReplacements(
  hookRest: string,
  sourceLines: string[],
  range: { startLine: number; endLine: number },
  removalIntent: boolean,
): { reduced: string; ops: ConstReplaceOp[]; replaced: string[] } {
  const ops: ConstReplaceOp[] = [];
  const replaced: string[] = [];

  // 컴포넌트 본문의 "단일 라인 완결" 선언만 인덱싱: 정렬한 바인딩키 → {라인 idx0, body}
  const existingByKey = new Map<string, { idx0: number; body: string }>();
  for (let i = range.startLine - 1; i < range.endLine && i < sourceLines.length; i++) {
    const ln = sourceLines[i];
    const { open, close } = countDelimiters(ln);
    if (open !== close) continue; // 멀티라인 선언 시작 → 보수적 제외
    if (!/;\s*$/.test(stripTrailingLineComment(ln).trimEnd())) continue; // 한 줄 완결(;)만
    const b = declBindings(ln);
    if (b.length === 0) continue;
    existingByKey.set([...b].sort().join(','), { idx0: i, body: ln });
  }
  if (existingByKey.size === 0) return { reduced: hookRest, ops, replaced };

  const kept: string[] = [];
  for (const stmt of splitStatements(hookRest)) {
    const b = declBindings(stmt);
    if (b.length > 0) {
      const ex = existingByKey.get([...b].sort().join(','));
      if (ex && normDecl(ex.body) !== normDecl(stmt) && canReplaceDecl(ex.body, stmt, { allowCall: true, removalIntent }).ok) {
        const indent = ex.body.match(/^[ \t]*/)?.[0] ?? '';
        ops.push({
          atLine: ex.idx0 + 1,
          removeCount: 1,
          content: stmt.split('\n').map((l) => (l.trim() ? indent + l.trim() : l)),
        });
        replaced.push(b.join(', '));
        continue; // 소비 — 드롭 경로로 안 보냄
      }
    }
    kept.push(stmt);
  }
  return { reduced: kept.join('\n'), ops, replaced };
}

/**
 * 구조 앵커를 이용해 모델이 낸 조각을 결정론적으로 적용한다.
 * search/replace, 라인 번호 추측, 전체 파일 재작성 없이 동작한다.
 */
export function applyStructuralEdit(
  source: string,
  edit: StructuralEdit,
  opts: { stripDeadInserts?: boolean; removalIntent?: boolean } = {},
): ApplyResult {
  // CRLF 정규화 — 삽입 라인이 LF만 갖는 일을 막아 줄바꿈 혼용을 방지한다.
  const hasCRLF = source.includes('\r\n');
  const norm = hasCRLF ? source.replace(/\r\n/g, '\n') : source;
  const anchors = computeAnchors(norm);
  const lines = norm.split('\n');
  const changes: string[] = [];

  // 편집 작업을 (시작 라인 1-based, 삭제 줄 수, 삽입 내용)로 모은 뒤 라인 내림차순으로 splice.
  // removeCount=0 → 순수 삽입, content=[] → 순수 삭제.
  const ops: { atLine: number; removeCount: number; content: string[] }[] = [];

  // 1) 훅 코드 — react-app-scaffold 컨벤션: type/interface/enum 선언은 컴포넌트 본문이 아니라
  //    함수 바로 위(모듈 스코프)에 둔다. 모델이 둘을 섞어 내도 여기서 결정론적으로 분리한다.
  if (edit.hookCode && anchors.component) {
    // 0) 기존 top-level const 재선언 → 무손실 결정론 교체(영역 밖 선언 수정 갭 해소).
    //    교체로 소비된 선언은 reducedHook에서 빠져, 이후 분리/중복드롭 로직이 건드리지 않는다.
    const topConstByName = new Map<string, CodeSection>();
    for (const s of splitTsSections(norm)) {
      if (s.kind === 'const') topConstByName.set(s.name, s);
    }
    const repl = extractConstReplacements(edit.hookCode, topConstByName, opts.removalIntent ?? false);
    for (const op of repl.ops) ops.push(op);
    for (const name of repl.replaced) {
      changes.push(`기존 top-level const '${name}' 결정론 교체(무손실) — 영역 밖 선언 수정`);
    }
    for (const r of repl.rejected) {
      changes.push(`재선언 '${r.name}' 교체 거부(${r.reason}) → 종전 동작(드롭) — 손실 적용 차단`);
    }
    const effectiveHookCode = repl.reducedHook;

    // 기존 top-level 선언 이름 — 같은 이름의 type/const를 또 모듈 스코프로 올리지 않도록(중복 선언 방지).
    const existingTopLevelNames = new Set(anchors.sections.map((s) => s.name));
    const { typeDecls, rest: rawRest, typeCount } = splitTypeDeclarations(effectiveHookCode, existingTopLevelNames);

    // 0.5) 컴포넌트 본문 기존 선언 in-place 교체(useState 초기값 변경 등). 드롭 전에 가로채야 한다.
    const compRepl = extractComponentReplacements(rawRest, lines, {
      startLine: anchors.component.startLine,
      endLine: anchors.component.endLine,
    }, opts.removalIntent ?? false);
    for (const op of compRepl.ops) ops.push(op);
    for (const name of compRepl.replaced) {
      changes.push(`컴포넌트 선언 '${name}' in-place 교체 — 기존 바인딩 초기값/내용 수정`);
    }

    // 컴포넌트 본문 코드에 삽입하기 전, 대상 파일(모듈+컴포넌트 본문)에 **이미 선언된 이름을 다시
    // 선언하는** 문장을 드롭한다(중복 선언 = 컴파일 에러 방지). 기존 이름은 그대로 재사용된다.
    const existingBindings = collectDeclaredBindings(norm);
    const dedup = dropDuplicateDeclarations(compRepl.reduced, existingBindings);
    let rest = dedup.text;
    if (dedup.dropped.length > 0) {
      changes.push(`중복 선언 드롭(이미 존재): ${dedup.dropped.join(' / ')}`);
    }
    // region이 실제 편집된 경우, 모델이 덤으로 붙인 미사용 곁다리 선언을 걷어낸다(깨끗한 출력).
    if (opts.stripDeadInserts && rest.trim()) {
      const s = stripDeadStatements(rest, norm);
      rest = s.code;
      if (s.dropped.length > 0) changes.push(`미사용 곁다리 선언 strip: ${s.dropped.join(' / ')}`);
    }

    // 1-a) 훅/일반 코드 → 컴포넌트 본문(들여쓰기 부여)
    if (rest.trim()) {
      const indent = anchors.component.bodyIndent;
      const content = rest.split('\n').map((l) => (l ? indent + l : l));
      ops.push({ atLine: anchors.component.hookInsertLine, removeCount: 0, content });
      changes.push(
        `훅 삽입: 컴포넌트 '${anchors.component.name}' 라인 ${anchors.component.hookInsertLine} 앞 ` +
          `(${anchors.component.hookInsertReason})`,
      );
    }

    // 1-c) 더미 변수 정리 — 새 훅이 같은 이름으로 모듈 스코프 더미 변수를 가리는(shadow) 경우,
    //      이미 죽은 코드가 된 원래 더미 선언을 삭제한다. (예: const teamReports=[...] ↔
    //      const { data: teamReports } = useApi(...)). 대체되지 않은 더미(recentReports 등)는 유지.
    const declared = collectDeclaredBindings(rest);
    if (declared.size > 0) {
      for (const sec of anchors.sections) {
        if (sec.kind !== 'const' || !declared.has(sec.name)) continue;
        // 선언 + 바로 뒤 빈 줄 1개까지 삭제(빈 줄 잔재 방지). sec.endLine 다음 줄 = 0-based 인덱스 sec.endLine.
        let lastLine = sec.endLine;
        if (lines[sec.endLine] !== undefined && lines[sec.endLine].trim() === '') lastLine += 1;
        ops.push({ atLine: sec.startLine, removeCount: lastLine - sec.startLine + 1, content: [] });
        changes.push(`더미 변수 '${sec.name}' 삭제 — AI 생성 데이터(useApi)로 대체됨`);
      }
    }

    // 1-b) 타입·상수 선언 → 함수 컴포넌트 바로 위(모듈 스코프, 들여쓰기 없음)
    if (typeDecls.trim()) {
      const content = [...typeDecls.split('\n'), ''];
      ops.push({ atLine: anchors.component.startLine, removeCount: 0, content });
      changes.push(
        `선언(타입·상수) ${typeCount}개를 컴포넌트 '${anchors.component.name}' 바로 위(모듈 스코프)로 ` +
          `배치 — react-app-scaffold 컨벤션`,
      );
    }
  } else if (edit.hookCode && !anchors.component) {
    changes.push('⚠️ 훅 코드가 주어졌으나 export default 컴포넌트를 찾지 못함 — 훅 삽입 건너뜀');
  }

  // 2) import
  if (edit.imports?.length) {
    // 전체 소스의 import를 모듈별로 스캔한다. import 블록 중간에 주석(예: `//import X`)이 있으면
    // splitTsSections가 import 섹션을 쪼개 anchors.imports엔 첫 그룹만 잡힌다. 그 결과 주석 아래
    // import(예: react·lucide-react)가 중복 검출에서 누락돼 같은 모듈이 또 추가되는 버그가 있었다.
    // 존재 여부 판정만은 파일 전체 기준으로 해 중복 추가를 막는다.
    const globalByModule = new Map<string, { named: Set<string>; def: string | null }>();
    for (const ln of collectLogicalImports(lines)) {
      const p = parseImportLine(ln);
      if (!p) continue;
      const e = globalByModule.get(p.module) ?? { named: new Set<string>(), def: null };
      p.named.forEach((n) => e.named.add(n));
      if (p.def) e.def = p.def;
      globalByModule.set(p.module, e);
    }

    for (const req of edit.imports) {
      const existing = anchors.imports?.byModule.get(req.module);
      const wantNamed = req.named ?? [];

      // 파일 전체 기준으로 이미 모두 존재하면 무조건 skip (주석으로 쪼개진 그룹의 import도 인식).
      const globalEx = globalByModule.get(req.module);
      if (globalEx) {
        const missingGlobal = wantNamed.filter((n) => !globalEx.named.has(n));
        if (missingGlobal.length === 0 && (!req.def || globalEx.def === req.def)) {
          changes.push(`import skip (이미 존재): ${req.module}`);
          continue;
        }
      }

      if (existing) {
        const missing = wantNamed.filter((n) => !existing.named.has(n));
        if (missing.length === 0 && (!req.def || existing.def === req.def)) {
          changes.push(`import skip (이미 존재): ${req.module}`);
          continue;
        }
        // 기존 named import 라인에 누락분 추가
        const absLineIdx0 = anchors.imports!.startLine - 1 + existing.lineIndex0;
        const line = lines[absLineIdx0];
        const updated = line.replace(/\{([^}]*)\}/, (_full, inner: string) => {
          const merged = [...inner.split(',').map((s) => s.trim()).filter(Boolean), ...missing];
          return `{ ${[...new Set(merged)].join(', ')} }`;
        });
        if (updated !== line) {
          lines[absLineIdx0] = updated;
          changes.push(`import merge: ${req.module} 에 ${missing.join(', ')} 추가`);
        }
      } else {
        // 새 import 라인 — 마지막 "실제" import 줄 바로 뒤에 삽입.
        // (splitTsSections 의 endLine 은 뒤 빈 줄까지 포함해 1칸 넘칠 수 있어, byModule 의
        //  실제 import 라인 위치로 앵커를 잡아 기존 import와 인접하게 둔다.)
        const clause = wantNamed.length
          ? `{ ${wantNamed.join(', ')} }`
          : (req.def ?? '');
        const newLine = `import ${clause} from '${req.module}';`;
        let at: number;
        if (anchors.imports && anchors.imports.byModule.size > 0) {
          const lastRel = Math.max(
            ...[...anchors.imports.byModule.values()].map((v) => v.lineIndex0),
          );
          at = anchors.imports.startLine + lastRel + 1;
        } else if (anchors.imports) {
          at = anchors.imports.endLine + 1;
        } else {
          at = 1;
        }
        ops.push({ atLine: at, removeCount: 0, content: [newLine] });
        changes.push(`import 추가: ${newLine}`);
      }
    }
  }

  // 라인 내림차순으로 splice (인덱스 밀림 방지). 삽입·삭제 영역은 서로 겹치지 않으므로
  // 높은 라인부터 적용하면 낮은 라인의 좌표가 유지된다.
  ops.sort((a, b) => b.atLine - a.atLine);
  for (const op of ops) {
    lines.splice(op.atLine - 1, op.removeCount, ...op.content);
  }

  let text = lines.join('\n');
  if (hasCRLF) text = text.replace(/\n/g, '\r\n');
  return { text, changes };
}

// ─── 의존성 폐쇄(dependency closure) 게이트 ──────────────────────────────────

/**
 * TS 표준 라이브러리·전역에서 항상 사용 가능한 PascalCase 식별자.
 * 타입 위치/훅 호출 검사 시 "선언 없음"으로 오판하지 않도록 화이트리스트한다.
 */
const GLOBAL_KNOWN = new Set<string>([
  // 유틸리티/내장 타입
  'Array', 'ReadonlyArray', 'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit',
  'Exclude', 'Extract', 'NonNullable', 'Parameters', 'ReturnType', 'InstanceType', 'Awaited',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Date', 'RegExp', 'Error', 'Object', 'String',
  'Number', 'Boolean', 'Symbol', 'BigInt', 'Function', 'JSON', 'Math', 'Iterable', 'Iterator',
  // React/DOM 흔한 전역 (보통 React.X 형태라 안 잡히지만 안전망)
  'React', 'JSX', 'Element', 'Event', 'Node', 'HTMLElement', 'ReactNode', 'ReactElement', 'Fragment',
  // DOM 이벤트·요소 전역 — useApi 핸들러 시그니처(React.ChangeEvent<HTMLInputElement> 등)에 자주 등장.
  // import 불필요한 앰비언트 전역인데 "미선언"으로 오판돼 불필요한 full 폴백을 유발했다(실측).
  'ChangeEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'FormEvent', 'PointerEvent',
  'TouchEvent', 'DragEvent', 'ClipboardEvent', 'WheelEvent', 'UIEvent', 'InputEvent',
  'AnimationEvent', 'TransitionEvent', 'CustomEvent', 'EventTarget', 'AbortController',
  'AbortSignal', 'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileList', 'DataTransfer',
]);

/**
 * import가 필요 없는 전역 타입 판정. GLOBAL_KNOWN(명시 목록) + DOM 요소 패밀리 패턴.
 * HTMLInputElement·HTMLButtonElement·SVGPathElement … 를 일일이 나열하지 않고 패턴으로 흡수한다.
 */
const DOM_ELEMENT_RE = /^(?:HTML|SVG)[A-Za-z]*Element$/;
function isWellKnownGlobal(name: string): boolean {
  return GLOBAL_KNOWN.has(name) || DOM_ELEMENT_RE.test(name);
}

export interface DependencyCheckResult {
  ok: boolean;
  /** 최종 파일에서 선언/import 어느 쪽으로도 해소되지 않은 심볼(타입·훅) */
  unresolved: string[];
}

/** 한 텍스트에서 사용 가능한(선언·import된) 심볼 집합을 모은다. */
function collectAvailableSymbols(fullText: string): Set<string> {
  const available = new Set<string>(GLOBAL_KNOWN);

  // import 명세 (named + default + namespace) — **모든 import 섹션**을 훑는다.
  // computeAnchors().imports 는 첫 import 그룹만 잡아, import 사이에 주석(`// hooks`)이 끼어
  // 섹션이 쪼개지면 둘째 그룹의 import(예: react의 useState)를 놓쳐 "미해소" 오탐을 낸다.
  // 멀티라인 import도 한 섹션 body로 들어오므로 { … } 전체에서 named를 뽑는다.
  for (const s of splitTsSections(fullText)) {
    if (s.kind === 'import') {
      for (const block of s.body.matchAll(/\{([^}]*)\}/g)) {
        for (const part of block[1].split(',')) {
          const id = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim();
          if (/^[A-Za-z_$][\w$]*$/.test(id)) available.add(id);
        }
      }
      // default / `* as NS` import
      for (const d of s.body.matchAll(/import\s+(?:type\s+)?(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
        available.add(d[1]);
      }
    } else if (s.name && s.name !== 'imports') {
      // top-level 선언 이름 (type/interface/const/function/class …)
      available.add(s.name);
    }
  }
  return available;
}

/** 삽입 조각이 참조하는 타입·훅 심볼을 추출한다. */
function collectReferencedSymbols(insertedCode: string): Set<string> {
  const refs = new Set<string>();

  // 타입 위치: 제네릭 인자(<T> / <A, B>), as / extends / satisfies, 명시적 주석(: T)
  const typePatterns: RegExp[] = [
    /<\s*([A-Z][\w$]*)/g,            // useApi<TFoo>
    /,\s*([A-Z][\w$]*)\s*[,>]/g,     // useApi<A, BType>
    /\bas\s+([A-Z][\w$]*)/g,
    /\bextends\s+([A-Z][\w$]*)/g,
    /\bsatisfies\s+([A-Z][\w$]*)/g,
    /:\s*([A-Z][\w$]*)/g,            // const x: TFoo / 객체 값이 PascalCase면 그 또한 해소 필요
  ];
  for (const re of typePatterns) {
    for (const m of insertedCode.matchAll(re)) refs.add(m[1]);
  }

  // 훅 호출: useApi( / useApi< / useState( …
  for (const m of insertedCode.matchAll(/\b(use[A-Z][\w$]*)\s*[(<]/g)) {
    refs.add(m[1]);
  }

  // 한정명(X.Y)의 네임스페이스 head는 선언 필요 대상이 아니다 — 앰비언트 전역(NodeJS.Timeout,
  // Intl.DateTimeFormat 등)이거나 네임스페이스 import다. 바로 뒤에 '.'가 오면 refs에서 뺀다.
  // (커스텀 타입은 `useApi<TFoo>`처럼 bare로 쓰여 '.'가 없으므로 본연의 미선언 검출은 유지된다.)
  for (const m of insertedCode.matchAll(/\b([A-Z][\w$]*)\s*\./g)) {
    refs.delete(m[1]);
  }

  // 조각 내부에서 스스로 선언한 이름은 참조 대상에서 제외(지역 해소)
  for (const m of insertedCode.matchAll(
    /\b(?:const|let|var|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    refs.delete(m[1]);
  }
  return refs;
}

/**
 * 모델이 `<hook>`으로 선언한 바인딩 중, 최종 파일 어디에서도(자기 선언 밖) **참조되지 않는** "죽은" 선언을 찾는다.
 *
 * region/하이브리드가 표현 못 하는 편집유형(rename·다중타깃)에서 약한 모델은 구조 게이트(root-tag/deps/
 * components)는 통과하지만, **안 쓰는 새 state/const를 삽입하는 죽은 코드**를 낸다(실측: department→selectedDept
 * rename 요청에 미사용 `selectedDept` 삽입 + 원본 rename 안 함 / 다중타깃에 미사용 `selectedStatus` 삽입).
 * 이러면 "applied"로 집계되지만 실제론 silent 오편집이다. "삽입 코드는 실제로 쓰여야 한다"를 불변식으로 못박아
 * full 폴백시킨다. 한 선언의 바인딩이 **전부** 미참조일 때만 죽은 것으로 본다(보수적 — setter만 미사용 등 오탐 방지).
 *
 * 사용 판정: 바인딩 b의 최종 파일 등장 횟수 − 그 선언문 내 등장 횟수 > 0 이면 "선언 밖에서 쓰임".
 * (교체/중복드롭된 선언도 원본 사용처가 남아 통과한다.)
 *
 * @param hookCode 모델이 낸 `<hook>` 원본
 * @param finalText 합성이 반영된 최종 파일
 * @returns 죽은 선언들의 바인딩 목록(빈 배열이면 전부 사용됨)
 */
export function findUnusedInsertedBindings(hookCode: string, finalText: string): string[] {
  if (!hookCode.trim()) return [];
  const dead: string[] = [];
  for (const stmt of splitStatements(hookCode)) {
    const bindings = declBindings(stmt);
    if (bindings.length === 0) continue;
    const anyUsed = bindings.some((b) => {
      const re = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const finalCount = (finalText.match(re) ?? []).length;
      const declCount = (stmt.match(re) ?? []).length;
      return finalCount - declCount > 0;
    });
    if (!anyUsed) dead.push(bindings.join(', '));
  }
  return dead;
}

/**
 * 같은 렉시컬 스코프에서 const/let 식별자가 2회 이상 선언돼 TypeScript
 * `Cannot redeclare block-scoped variable` 컴파일 에러를 내는 경우를 결정론으로 찾는다.
 *
 * 약한 모델이 전체/영역 재작성(full·region)에서 기존 파생 const를 state로 바꾸며 **원본을 안 지워**
 * 같은 이름을 두 번 선언하는 실패(실측: `departments`·`deploymentStatuses` 중복)를 적용 전에 차단하는
 * 안전망. 외부 의존성 0 — 문자열·주석 인식 중괄호 스캔 + parseBindingPattern만 사용한다.
 *
 * 스코프 식별: `{` 마다 고유 id를 push, `}` 마다 pop(중괄호는 한 줄 안에서 **텍스트 순서대로** 처리 —
 * `} else {` 처럼 닫고 여는 형제 블록을 구분). 선언은 그 줄 진입 시점의 최상위 스코프에 귀속한다.
 * → 서로 다른 스코프(다른 콜백·블록)의 동명 const는 합법이라 잡지 않는다(오탐 방지).
 * 정밀도 우선: 줄 시작이 const/let인 단일 선언만 본다(for 헤더·다중행 구조분해 등은 제외 → 미탐 허용).
 */
export function findDuplicateDeclarations(fullText: string): string[] {
  const scopeStack: number[] = [0]; // 0 = 모듈 스코프
  let nextScopeId = 1;
  const declsByScope = new Map<number, Map<string, number>>();
  const dupes = new Set<string>();

  for (const raw of fullText.split('\n')) {
    // 1) 이 줄의 선언을 현재(줄 진입 시점) 스코프에 귀속한다.
    const m = raw.trim().match(/^(?:export\s+)?(?:const|let)\s+([\s\S]*?)(?:=(?![=>])|;)/);
    if (m) {
      const names = parseBindingPattern(m[1].trim());
      if (names.length > 0) {
        const scope = scopeStack[scopeStack.length - 1];
        let map = declsByScope.get(scope);
        if (!map) {
          map = new Map();
          declsByScope.set(scope, map);
        }
        for (const n of names) {
          const c = (map.get(n) ?? 0) + 1;
          map.set(n, c);
          if (c >= 2) dupes.add(n);
        }
      }
    }
    // 2) 이 줄의 중괄호를 텍스트 순서대로 적용해 다음 줄의 스코프를 갱신한다(문자열·줄주석 무시).
    let inStr: string | null = null;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (ch === inStr && raw[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '/' && raw[i + 1] === '/') break; // 줄 나머지는 주석
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '{') scopeStack.push(nextScopeId++);
      else if (ch === '}' && scopeStack.length > 1) scopeStack.pop();
    }
  }
  return [...dupes];
}

/**
 * 삽입된 코드 조각이 참조하는 타입·훅 심볼이 최종 파일에서 전부 해소되는지 검증한다.
 *
 * 자기완결성(dependency closure) 불변식의 결정론적 안전망:
 *  - `useApi<TFoo>()` 를 넣었다면 최종 파일에 `useApi` import 와 `TFoo` 선언이 **반드시** 있어야 한다.
 *  - 하나라도 없으면 그 편집은 "조금 부족한" 게 아니라 **컴파일이 깨지는, 써서는 안 되는 출력**이다.
 *
 * 해소처: import 명세 / top-level 선언 / 조각 내부 지역 선언 / 전역 화이트리스트.
 * 폐쇄망 의존성 0 — splitTsSections + 정규식만 사용한다.
 *
 * @param insertedCode 삽입한 조각(hookCode 등)
 * @param fullText 삽입이 반영된 **최종** 파일 텍스트(추가된 import 포함)
 */
export function findUnresolvedReferences(
  insertedCode: string,
  fullText: string,
): DependencyCheckResult {
  if (!insertedCode.trim()) return { ok: true, unresolved: [] };
  const available = collectAvailableSymbols(fullText);
  const refs = collectReferencedSymbols(insertedCode);
  const unresolved = [...refs].filter((r) => !available.has(r) && !isWellKnownGlobal(r));
  return { ok: unresolved.length === 0, unresolved };
}

/**
 * 스캐폴드 표준 심볼 → import 명세 매핑.
 *
 * import 경로가 **고정**된 항목만 등록한다. 약한 모델이 `<hook>`만 내고 매칭되는
 * `<import>` 태그를 빠뜨려도, 확장이 결정론적으로 import를 보강해 의존성 게이트를 통과시킨다.
 * 타입(TFoo 등)은 선언 위치·경로가 가변이라 등록 대상이 아니다 — 게이트가 계속 거부한다.
 */
const SCAFFOLD_IMPORTS: ReadonlyMap<string, { module: string; named: string }> = new Map([
  ['useApi', { module: '@axiom/hooks', named: 'useApi' }],
  // React 표준 훅 — import 경로가 'react'로 고정. 모델이 훅 조각에 도입하고 import를 빠뜨려도
  // 확장이 결정론적으로 보강한다(useApi와 동일 원리). applyStructuralEdit가 기존 react import에 merge.
  ['useState', { module: 'react', named: 'useState' }],
  ['useEffect', { module: 'react', named: 'useEffect' }],
  ['useRef', { module: 'react', named: 'useRef' }],
  ['useMemo', { module: 'react', named: 'useMemo' }],
  ['useCallback', { module: 'react', named: 'useCallback' }],
  ['useReducer', { module: 'react', named: 'useReducer' }],
  ['useContext', { module: 'react', named: 'useContext' }],
  ['useLayoutEffect', { module: 'react', named: 'useLayoutEffect' }],
]);

/**
 * `@axiom/components/ui`(shadcn/ui 래퍼) 디자인시스템 컴포넌트 카탈로그.
 *
 * 약한 모델이 `<region>`에 Card·Dialog 등 UI 컴포넌트를 쓰고 `<import>`를 빠뜨려도, 확장이
 * 결정론적으로 이 모듈에서 import를 보강한다(의존성 폐쇄 게이트가 컴파일 깨짐을 막는 원리의 JSX 확장).
 * **유한한 카탈로그**라 일일이 나열해도 유지보수 가능하다(knowledge/scaffold-docs/components.md 기준).
 * 목록에 없는 커스텀 컴포넌트(StatusBadge 등 경로 가변)는 의도적으로 제외 — 게이트가 full 폴백시킨다.
 */
const UI_MODULE = '@axiom/components/ui';
const UI_COMPONENTS = new Set<string>([
  'Button', 'Input', 'Textarea', 'Label', 'Checkbox', 'Switch', 'Badge', 'Separator', 'Skeleton', 'Slider', 'Progress', 'Toggle',
  'Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter', 'CardAction',
  'Select', 'SelectGroup', 'SelectValue', 'SelectTrigger', 'SelectContent', 'SelectLabel', 'SelectItem', 'SelectSeparator',
  'Table', 'TableHeader', 'TableBody', 'TableFooter', 'TableHead', 'TableRow', 'TableCell', 'TableCaption',
  'Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose',
  'AlertDialog', 'AlertDialogTrigger', 'AlertDialogContent', 'AlertDialogHeader', 'AlertDialogFooter', 'AlertDialogTitle', 'AlertDialogDescription', 'AlertDialogAction', 'AlertDialogCancel',
  'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent',
  'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent',
  'Tooltip', 'TooltipTrigger', 'TooltipContent', 'TooltipProvider',
  'Popover', 'PopoverTrigger', 'PopoverContent', 'PopoverAnchor',
  'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuCheckboxItem', 'DropdownMenuRadioItem', 'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuGroup', 'DropdownMenuSub', 'DropdownMenuSubContent', 'DropdownMenuSubTrigger', 'DropdownMenuRadioGroup', 'DropdownMenuShortcut',
  'Avatar', 'AvatarImage', 'AvatarFallback',
  'Alert', 'AlertTitle', 'AlertDescription',
  'Form', 'FormItem', 'FormLabel', 'FormControl', 'FormDescription', 'FormMessage', 'FormField',
  'RadioGroup', 'RadioGroupItem',
  'Sheet', 'SheetTrigger', 'SheetContent', 'SheetHeader', 'SheetFooter', 'SheetTitle', 'SheetDescription', 'SheetClose',
  'ScrollArea', 'ScrollBar',
  'Breadcrumb', 'BreadcrumbList', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbPage', 'BreadcrumbSeparator', 'BreadcrumbEllipsis',
]);

/**
 * 미해소 심볼 중 import 경로가 고정된 스캐폴드 표준 심볼을 ImportRequest 목록으로 변환한다.
 * SCAFFOLD_IMPORTS(useApi·react 훅) + UI_COMPONENTS(@axiom/components/ui 카탈로그)를 모두 본다.
 * 모듈별로 named import를 묶는다. 등록되지 않은 심볼(임의 타입·커스텀 컴포넌트)은 무시한다.
 */
export function resolveKnownImports(symbols: Iterable<string>): ImportRequest[] {
  const byModule = new Map<string, Set<string>>();
  const add = (module: string, named: string): void => {
    const set = byModule.get(module) ?? new Set<string>();
    set.add(named);
    byModule.set(module, set);
  };
  for (const s of symbols) {
    const known = SCAFFOLD_IMPORTS.get(s);
    if (known) add(known.module, known.named);
    else if (UI_COMPONENTS.has(s)) add(UI_MODULE, s);
  }
  return [...byModule].map(([module, named]) => ({ module, named: [...named] }));
}

/** JSX/JS 주석을 제거한다(주석으로 처리된 컴포넌트 태그를 실제 사용으로 오인하지 않게). */
function stripCommentsForJsx(s: string): string {
  return s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '')           // /* ... */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');      // // ... (URL의 // 는 보존)
}

/** JSX 텍스트에서 사용된 PascalCase 컴포넌트 여는 태그 이름을 모은다(주석 제거 후). */
function collectJsxComponentRefs(jsx: string): Set<string> {
  const refs = new Set<string>();
  for (const m of stripCommentsForJsx(jsx).matchAll(/<([A-Z][A-Za-z0-9]*)/g)) refs.add(m[1]);
  return refs;
}

/**
 * region JSX가 사용하는 컴포넌트(`<Card>` 등)가 최종 파일에서 import/선언으로 해소되는지 검증한다.
 *
 * 의존성 폐쇄 게이트의 JSX 확장 — 기존 findUnresolvedReferences는 `<hook>` 코드만 봐서, 모델이
 * `<region>`에 새 컴포넌트를 쓰고 `<import>`를 빠뜨리면 못 잡아 컴파일이 깨졌다(실측: Card 누락).
 *
 * @param regionJsx 모델이 재작성한 편집 영역 텍스트
 * @param fullText  합성이 반영된 최종 파일(추가된 import 포함)
 */
export function findUnresolvedJsxComponents(regionJsx: string, fullText: string): DependencyCheckResult {
  const refs = collectJsxComponentRefs(regionJsx);
  if (refs.size === 0) return { ok: true, unresolved: [] };
  const available = collectAvailableSymbols(fullText);
  const unresolved = [...refs].filter((r) => !available.has(r) && !isWellKnownGlobal(r));
  return { ok: unresolved.length === 0, unresolved };
}
