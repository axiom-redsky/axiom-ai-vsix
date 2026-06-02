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
import { splitTsSections, countDelimiters, type CodeSection } from './CodeSectionExtractor';

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
 * 훅 조각에서 top-level type/interface/enum 선언을 분리한다.
 *
 * react-app-scaffold 컨벤션: 타입 선언부는 함수 컴포넌트 본문 안이 아니라
 * 함수 바로 위(모듈 스코프)에 둔다. structural 모드에서 약한 모델이 타입을 훅 조각에
 * 섞어 내더라도 확장이 결정론적으로 끌어올려 컨벤션을 강제한다.
 *
 * splitTsSections 의 kind 'type'(type/enum) · 'interface' 만 분리 대상으로 본다.
 * 들여쓰기가 붙은 조각은 DECL_PATTERN(라인 시작)이 매칭되지 않아 분리되지 않고
 * 종전처럼 본문에 들어간다(graceful fallback — 프롬프트는 들여쓰기 없이 안내).
 */
function splitTypeDeclarations(hookCode: string): {
  typeDecls: string;
  rest: string;
  typeCount: number;
} {
  const sections = splitTsSections(hookCode);
  const typeSections = sections.filter((s) => s.kind === 'type' || s.kind === 'interface');
  if (typeSections.length === 0) return { typeDecls: '', rest: hookCode, typeCount: 0 };

  const lines = hookCode.split('\n');
  const isTypeLine = new Array<boolean>(lines.length).fill(false);
  for (const s of typeSections) {
    for (let ln = s.startLine; ln <= s.endLine; ln++) isTypeLine[ln - 1] = true;
  }
  const restLines = lines.filter((_, i) => !isTypeLine[i]);
  // 타입 선언은 섹션 본문을 빈 줄로 구분해 재조립(선언 간 가독성 유지).
  const typeDecls = typeSections.map((s) => s.body).join('\n\n');
  return {
    typeDecls,
    rest: tidyBlankLines(restLines).join('\n'),
    typeCount: typeSections.length,
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
 * 구조 앵커를 이용해 모델이 낸 조각을 결정론적으로 적용한다.
 * search/replace, 라인 번호 추측, 전체 파일 재작성 없이 동작한다.
 */
export function applyStructuralEdit(source: string, edit: StructuralEdit): ApplyResult {
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
    const { typeDecls, rest, typeCount } = splitTypeDeclarations(edit.hookCode);

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

    // 1-b) 타입 선언 → 함수 컴포넌트 바로 위(모듈 스코프, 들여쓰기 없음)
    if (typeDecls.trim()) {
      const content = [...typeDecls.split('\n'), ''];
      ops.push({ atLine: anchors.component.startLine, removeCount: 0, content });
      changes.push(
        `타입 선언 ${typeCount}개를 컴포넌트 '${anchors.component.name}' 바로 위(모듈 스코프)로 ` +
          `배치 — react-app-scaffold 컨벤션`,
      );
    }
  } else if (edit.hookCode && !anchors.component) {
    changes.push('⚠️ 훅 코드가 주어졌으나 export default 컴포넌트를 찾지 못함 — 훅 삽입 건너뜀');
  }

  // 2) import
  if (edit.imports?.length) {
    for (const req of edit.imports) {
      const existing = anchors.imports?.byModule.get(req.module);
      const wantNamed = req.named ?? [];
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
  'React', 'JSX', 'Element', 'Event', 'Node', 'HTMLElement', 'ReactNode', 'ReactElement',
]);

export interface DependencyCheckResult {
  ok: boolean;
  /** 최종 파일에서 선언/import 어느 쪽으로도 해소되지 않은 심볼(타입·훅) */
  unresolved: string[];
}

/** 한 텍스트에서 사용 가능한(선언·import된) 심볼 집합을 모은다. */
function collectAvailableSymbols(fullText: string): Set<string> {
  const available = new Set<string>(GLOBAL_KNOWN);

  // import 명세 (named + default)
  const anchors = computeAnchors(fullText);
  if (anchors.imports) {
    for (const entry of anchors.imports.byModule.values()) {
      for (const n of entry.named) available.add(n);
      if (entry.def) available.add(entry.def);
    }
  }
  // top-level 선언 이름 (type/interface/const/function/class …)
  for (const s of splitTsSections(fullText)) {
    if (s.name && s.name !== 'imports') available.add(s.name);
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

  // 조각 내부에서 스스로 선언한 이름은 참조 대상에서 제외(지역 해소)
  for (const m of insertedCode.matchAll(
    /\b(?:const|let|var|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    refs.delete(m[1]);
  }
  return refs;
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
  const unresolved = [...refs].filter((r) => !available.has(r));
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
]);

/**
 * 미해소 심볼 중 import 경로가 고정된 스캐폴드 표준 심볼을 ImportRequest 목록으로 변환한다.
 * 모듈별로 named import를 묶는다. 등록되지 않은 심볼(임의 타입 등)은 무시한다.
 */
export function resolveKnownImports(symbols: Iterable<string>): ImportRequest[] {
  const byModule = new Map<string, Set<string>>();
  for (const s of symbols) {
    const known = SCAFFOLD_IMPORTS.get(s);
    if (!known) continue;
    const set = byModule.get(known.module) ?? new Set<string>();
    set.add(known.named);
    byModule.set(known.module, set);
  }
  return [...byModule].map(([module, named]) => ({ module, named: [...named] }));
}
