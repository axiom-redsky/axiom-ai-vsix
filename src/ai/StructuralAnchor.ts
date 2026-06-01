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

  // 삽입 작업을 (삽입 라인 1-based, 내용 라인 배열)로 모은 뒤 라인 내림차순으로 splice
  const inserts: { atLine: number; content: string[] }[] = [];

  // 1) 훅 코드
  if (edit.hookCode && anchors.component) {
    const indent = anchors.component.bodyIndent;
    const content = edit.hookCode.split('\n').map((l) => (l ? indent + l : l));
    inserts.push({ atLine: anchors.component.hookInsertLine, content });
    changes.push(
      `훅 삽입: 컴포넌트 '${anchors.component.name}' 라인 ${anchors.component.hookInsertLine} 앞 ` +
        `(${anchors.component.hookInsertReason})`,
    );
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
        inserts.push({ atLine: at, content: [newLine] });
        changes.push(`import 추가: ${newLine}`);
      }
    }
  }

  // 라인 내림차순 splice (인덱스 밀림 방지)
  inserts.sort((a, b) => b.atLine - a.atLine);
  for (const ins of inserts) {
    lines.splice(ins.atLine - 1, 0, ...ins.content);
  }

  let text = lines.join('\n');
  if (hasCRLF) text = text.replace(/\n/g, '\r\n');
  return { text, changes };
}
