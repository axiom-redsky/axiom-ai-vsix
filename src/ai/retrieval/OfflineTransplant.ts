/**
 * 오프라인 JSX 이식(verbatim transplant).
 *
 * AI 서버가 죽었을 때, "다른 파일의 JSX를 그대로 가져와 현재 파일에 끼워 넣어줘" 류의 요청을
 * **모델 없이** 결정론적으로 처리한다. 온라인이면 모델이 빠진 훅/state/import 로직까지 봉합하지만,
 * 오프라인은 그 봉합을 생략하고(완벽주의 게이트 OFF) **무엇이 빠졌는지**만 모아 호출부가 강조
 * 경고로 알린다 — dead-end(체크리스트만) 대신 실제 적용 카드를 띄우기 위함이다.
 *
 * 온라인 경로(runHybridRegionEdit·buildContext)와 완전히 분리된다. 공유 코드는 **읽기 전용**으로만
 * 재사용한다(splitTsSections·findUnresolvedJsxComponents) — 온라인 동작에 영향 0.
 *
 * 외부 의존성 0(폐쇄망) — 정규식 + 균형 괄호/중괄호 스캔만 사용한다.
 *
 * 지원 범위(보수적): scaffold 표준 스타일인 `return (` … `)` 멀티라인 블록만 다룬다. 인라인 return,
 * 괄호 없는 return 등 비표준 형태면 null/ok=false 를 돌려 호출부가 일반 오프라인 응답으로 폴백한다.
 */
import { splitTsSections } from '../decompose/CodeSectionExtractor';
import { findUnresolvedJsxComponents } from '../apply/StructuralAnchor';

/** 컴포넌트 메인 `return ( … )` 블록의 안쪽 JSX(라인 단위 splice 단위). */
export interface ReturnJsxBlock {
  /** 안쪽 JSX 시작 라인(1-based, 포함). */
  startLine: number;
  /** 안쪽 JSX 끝 라인(1-based, 포함). */
  endLine: number;
  /** 안쪽 JSX 원본 라인들(들여쓰기 유지). */
  innerLines: string[];
  /** `return (` 줄의 들여쓰기 칸 수(재들여쓰기 기준). */
  baseIndent: number;
}

/** 이식 계획 결과. */
export interface TransplantPlan {
  /** true = finalText 적용 가능 / false = 폴백(일반 오프라인 응답). */
  ok: boolean;
  /** ok=false 사유(진단). */
  reason?: string;
  /** ok=true 일 때 디스크에 쓸 최종 전체 파일 텍스트. */
  finalText?: string;
  /** 교체된 현재 파일 라인 범위(1-based, 안내용). */
  replacedStart?: number;
  replacedEnd?: number;
  /** 이식된 JSX가 쓰지만 현재 파일에 import/선언이 없는 컴포넌트(import 필요). */
  missingComponents: string[];
  /** 이식된 JSX가 쓰지만 현재 파일에 선언이 없는 값(훅/state/함수 등). */
  missingValues: string[];
}

const indentOf = (s: string): number => s.match(/^[ \t]*/)?.[0].length ?? 0;

/**
 * 파일에서 컴포넌트 메인 `return ( … )` JSX 블록을 찾는다.
 *
 * 기본 export 함수 범위를 우선 보고(없으면 파일 전체), `return (` 가 단독으로 끝나는 줄부터 같은
 * 들여쓰기의 `)` / `);` 닫는 줄까지를 한 블록으로 본다. **여러 return**(early return `return (<Spinner/>)`
 * 등)이 있으면 가장 큰 블록을 메인 렌더로 채택한다 — 사용자가 우려한 "return 여러 개" 모호성을 크기로 해소.
 */
export function extractMainReturnJsx(content: string): ReturnJsxBlock | null {
  const lines = content.split('\n');
  let lo = 0;
  let hi = lines.length - 1;
  const comp = splitTsSections(content).find(
    (s) => s.kind === 'function' && /^export\s+default\b/.test(s.body.trimStart()),
  );
  if (comp) {
    lo = comp.startLine - 1;
    hi = comp.endLine - 1;
  }

  const blocks: ReturnJsxBlock[] = [];
  for (let i = lo; i <= hi; i++) {
    if (!/^\s*return\s*\(\s*$/.test(lines[i])) continue;
    const indent = indentOf(lines[i]);
    for (let j = i + 1; j <= hi; j++) {
      if (j - i > 1000) break; // 닫힘 미발견 보호
      if (indentOf(lines[j]) === indent && /^\)\s*;?$/.test(lines[j].trim())) {
        const innerLines = lines.slice(i + 1, j); // 0-based i+1 .. j-1
        if (innerLines.length > 0) {
          blocks.push({ startLine: i + 2, endLine: j, innerLines, baseIndent: indent });
        }
        break;
      }
    }
  }
  if (blocks.length === 0) return null;
  blocks.sort((a, b) => b.endLine - b.startLine - (a.endLine - a.startLine));
  return blocks[0];
}

/** 라인 배열 들여쓰기를 delta 만큼 이동한다(빈 줄 유지, 음수면 그만큼 제거하되 0 미만 클램프). */
function shiftIndent(lines: string[], delta: number): string[] {
  if (delta === 0) return lines.slice();
  return lines.map((l) => {
    if (l.trim() === '') return l;
    if (delta > 0) return ' '.repeat(delta) + l;
    return l.slice(Math.min(indentOf(l), -delta));
  });
}

// ─── 의존성(빠진 것) 검출 ──────────────────────────────────────────────────────

const VALUE_KEYWORDS = new Set([
  'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'function', 'new', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'null',
  'undefined', 'true', 'false', 'this', 'async', 'await', 'yield', 'import', 'from', 'export',
  'default', 'as', 'type', 'interface', 'extends', 'class', 'super', 'try', 'catch', 'finally', 'throw',
]);

/** JSX 표현식에서 흔히 등장하는 전역/내장 — 미선언 오탐을 줄인다. */
const VALUE_GLOBALS = new Set([
  'console', 'window', 'document', 'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number',
  'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'Promise', 'props', 'React', 'navigator', 'location',
]);

/** 한 문장(줄)이 선언하는 const/let/var 이름들(구조분해 포함). */
function declaredNamesLine(stmt: string): string[] {
  const names: string[] = [];
  for (const m of stmt.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    const decl = m[1];
    if (decl[0] === '[' || decl[0] === '{') {
      for (let part of decl.slice(1, -1).split(',')) {
        part = part.trim();
        if (decl[0] === '{' && part.includes(':')) part = part.slice(part.indexOf(':') + 1);
        const id = part.replace(/[=:].*$/s, '').replace(/^\.\.\./, '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(id)) names.push(id);
      }
    } else {
      names.push(decl);
    }
  }
  return names;
}

/** 최종 파일에서 사용 가능한(import·선언·구조분해 파라미터) 값 심볼 집합. */
function availableSymbols(fullText: string): Set<string> {
  const set = new Set<string>();
  for (const s of splitTsSections(fullText)) {
    if (s.kind === 'import') {
      for (const block of s.body.matchAll(/\{([^}]*)\}/g)) {
        for (const part of block[1].split(',')) {
          const id = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
          if (id && /^[A-Za-z_$][\w$]*$/.test(id)) set.add(id);
        }
      }
      for (const d of s.body.matchAll(/import\s+(?:type\s+)?(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
        set.add(d[1]);
      }
    } else if (s.name && s.name !== 'imports') {
      set.add(s.name);
    }
  }
  // 본문 어디든 선언된 const/let/var(컴포넌트 내부 state·파생값 포함).
  for (const line of fullText.split('\n')) for (const n of declaredNamesLine(line)) set.add(n);
  // 구조분해 파라미터(`function X({ a, b })`, `({ a }) =>`) + 단일 파라미터(`(props) =>`).
  for (const m of fullText.matchAll(/\(\s*\{([^}]*)\}\s*(?::[^)]*)?\)\s*(?:=>|\{|:)/g)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(':')[0].replace(/^\.\.\./, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) set.add(id);
    }
  }
  for (const m of fullText.matchAll(/(?:function\s+[A-Za-z_$][\w$]*\s*\(\s*|\(\s*)([a-z_$][\w$]*)\s*[,)]/g)) {
    set.add(m[1]);
  }
  return set;
}

/** JSX/JS 주석 제거(주석 처리된 코드의 식별자 오집계 방지). */
function stripComments(s: string): string {
  return s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 텍스트에서 최상위 `{ … }` 표현식 그룹의 안쪽 내용들을 뽑는다(문자열 인식). */
function extractBraceGroups(s: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        groups.push(s.slice(start, i));
        start = -1;
      } else if (depth < 0) {
        depth = 0;
      }
    }
  }
  return groups;
}

/** JSX 표현식(`{ … }`)에서 참조하는 **소문자 시작 값 식별자**(state·핸들러·파생값)를 모은다. */
function collectJsxValueRefs(jsx: string): Set<string> {
  const refs = new Set<string>();
  for (const group of extractBraceGroups(stripComments(jsx))) {
    const noStr = group.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ' ');
    for (const m of noStr.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const id = m[0];
      if (!/^[a-z_$]/.test(id)) continue; // 값만(PascalCase 컴포넌트는 별도 검출)
      if (noStr[m.index! - 1] === '.') continue; // 속성 꼬리(obj.prop)
      refs.add(id);
    }
  }
  return refs;
}

/** 이식 JSX 자체가 지역적으로 바인딩하는 이름들(`.map((item) => …)` 등) — 미선언 오탐에서 제외. */
function jsxLocalBindings(jsx: string): Set<string> {
  const set = new Set<string>();
  for (const m of jsx.matchAll(/(?:\(\s*([^)]*?)\s*\)|([A-Za-z_$][\w$]*))\s*=>/g)) {
    const params = m[1] ?? m[2] ?? '';
    for (const dm of params.matchAll(/[A-Za-z_$][\w$]*/g)) set.add(dm[0]);
  }
  return set;
}

/** 이식 JSX가 쓰지만 최종 파일에 선언이 없는 값 식별자(훅/state/함수)를 추린다. */
function computeMissingValues(innerJsx: string, finalText: string): string[] {
  const available = availableSymbols(finalText);
  const local = jsxLocalBindings(innerJsx);
  const refs = collectJsxValueRefs(innerJsx);
  const missing: string[] = [];
  for (const r of refs) {
    if (available.has(r) || local.has(r) || VALUE_GLOBALS.has(r) || VALUE_KEYWORDS.has(r)) continue;
    missing.push(r);
  }
  return missing.slice(0, 12);
}

// ─── 이식 계획 ────────────────────────────────────────────────────────────────

/**
 * 출처 파일의 메인 JSX를 현재 파일의 메인 JSX 자리에 **그대로 끼워 넣은** 최종 파일을 만든다.
 *
 * 모델 없이 결정론적으로:
 *  1) 양쪽에서 `return ( … )` 블록을 추출(여러 return이면 가장 큰 메인 렌더).
 *  2) 출처 JSX를 현재 위치 들여쓰기에 맞춰 재들여쓰기 후 라인 splice.
 *  3) 결과에서 **빠진 컴포넌트/값**을 모아 호출부가 경고하게 한다(완벽주의 게이트 없이 그대로 적용).
 *
 * 어느 한쪽에서 메인 JSX를 못 찾거나 결과가 동일하면 ok=false → 호출부가 일반 오프라인 응답으로 폴백.
 */
export function planJsxTransplant(currentContent: string, sourceContent: string): TransplantPlan {
  const empty = { missingComponents: [], missingValues: [] };
  const src = extractMainReturnJsx(sourceContent);
  if (!src) return { ok: false, reason: 'source-no-jsx', ...empty };
  const cur = extractMainReturnJsx(currentContent);
  if (!cur) return { ok: false, reason: 'current-no-jsx', ...empty };

  // 출처 JSX를 현재 자리 들여쓰기에 맞춘다(컴파일엔 무관하나 깔끔한 결과를 위해).
  const srcNonBlank = src.innerLines.filter((l) => l.trim() !== '');
  const srcMin = srcNonBlank.length ? Math.min(...srcNonBlank.map(indentOf)) : 0;
  const curFirst = cur.innerLines.find((l) => l.trim() !== '');
  const tgtBase = curFirst !== undefined ? indentOf(curFirst) : cur.baseIndent + 2;
  const pasted = shiftIndent(src.innerLines, tgtBase - srcMin);

  const curLines = currentContent.split('\n');
  const finalLines = [
    ...curLines.slice(0, cur.startLine - 1),
    ...pasted,
    ...curLines.slice(cur.endLine),
  ];
  const finalText = finalLines.join('\n');
  if (finalText === currentContent) return { ok: false, reason: 'no-op', ...empty };

  const innerJsx = src.innerLines.join('\n');
  const missingComponents = findUnresolvedJsxComponents(innerJsx, finalText).unresolved;
  const missingValues = computeMissingValues(innerJsx, finalText);

  return {
    ok: true,
    finalText,
    replacedStart: cur.startLine,
    replacedEnd: cur.endLine,
    missingComponents,
    missingValues,
  };
}

// ─── 의도 감지(이식 요청인가) ──────────────────────────────────────────────────

/** "그대로 가져와 끼운다" 의도의 동사. */
const TRANSPLANT_VERB = /그대로|복사|가져와|가져다|끼워|끼우|채워|적용|반영|옮겨|넣어/;
/**
 * 이식 "대상"을 가리키는 명사(JSX/마크업/화면 영역).
 * `내용(을|를)`은 목적격 조사일 때만 대상으로 인정한다 — "페이지 **내용을** 적용"(대상)은 잡고,
 * 출처를 가리키는 "파일 **내용으로**"(…으로)는 매칭하지 않아 오발을 막는다.
 */
const TRANSPLANT_TARGET = /jsx|마크업|return|화면|영역|부분|내용(을|를)/i;

/**
 * 입력이 "다른 파일의 JSX를 그대로 이식" 요청인지 판단한다(보너스 신호).
 *
 * 오프라인엔 의미 분류 모델을 못 쓰므로(서버 다운) 단어 매칭으로 떨어진다. 다만 단독 약어로 오발하지
 * 않도록 **동사 + 대상 명사**가 둘 다 있어야 true. 출처 .tsx 유무·현재 .tsx 게이트는 호출부가 본다.
 * 잘못 발동해도 결과는 적용 **확인 카드**(되돌리기 한 번)라 비용이 작다 — 정밀도보다 안전망에 기댄다.
 */
export function isVerbatimTransplantRequest(query: string): boolean {
  return TRANSPLANT_VERB.test(query) && TRANSPLANT_TARGET.test(query);
}
