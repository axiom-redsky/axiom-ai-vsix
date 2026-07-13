/**
 * TS / TSX 소스 코드를 top-level 선언 단위 섹션으로 분할한다.
 *
 * 풀 파서를 끌어들이지 않고 정규식 + 중괄호 매칭만 사용한다.
 * 폐쇄망 환경에서 외부 의존성을 늘리지 않기 위함이며,
 * 95% 케이스에서 충분히 잘 동작한다.
 *
 * 한계:
 *  - JSX 내부 `}`와 문자열 내부 `}`는 단순 카운팅 → 드물게 오분할
 *  - 그 경우에도 슬라이싱 결과는 "추가 정보 포함"이지 의미 손상 아님
 */

/** 한 소스 파일에서 추출된 하나의 코드 섹션 (함수·const·class 등) */
export interface CodeSection {
  /** 식별자 (export default function 이면 'default') */
  name: string;
  /** 종류 — 정렬·요약 표기 시 활용 */
  kind: 'function' | 'const' | 'class' | 'interface' | 'type' | 'import' | 'other';
  /** 헤더 포함 본문 (원본 그대로) */
  body: string;
  /** 시작 라인 (1-based) */
  startLine: number;
  /** 끝 라인 (1-based) */
  endLine: number;
  /** body 길이(글자 수) */
  length: number;
  /** 쿼리 토큰 기준 적합도 점수 */
  score: number;
}

/** top-level 선언 시작 패턴 — 라인 시작에서만 매칭(들여쓰기 0) */
const DECL_PATTERN = /^(export\s+(?:default\s+)?)?(?:async\s+)?(function|const|let|var|class|interface|type|enum)\s+(\w+)/;

/** import 라인 식별 */
const IMPORT_PATTERN = /^import\s/;

/**
 * 한 줄에서 중괄호·대괄호·소괄호 열림/닫힘 개수를 합산해 반환한다.
 * 문자열·주석은 단순 휴리스틱(따옴표·//)으로 스킵.
 *
 * 세 종류를 모두 함께 카운트하는 이유:
 *  - `const arr = [ {...}, {...} ];` 같은 배열 리터럴은 `{}` 만 보면 첫 객체에서
 *    depth가 0이 되어 선언이 종료된 것으로 오판된다. `[]` 도 함께 카운트해야 한다.
 *  - `const fn = (a, b) => ({ ... });` 같은 식도 `()` 균형이 맞아야 안전하게 종료 판정.
 */
export function countDelimiters(line: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  let inString: '"' | "'" | '`' | null = null;
  let inLineComment = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';

    if (inLineComment) continue;

    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }

    if (ch === '/' && line[i + 1] === '/') {
      inLineComment = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{' || ch === '[' || ch === '(') open++;
    else if (ch === '}' || ch === ']' || ch === ')') close++;
  }

  return { open, close };
}

/**
 * 줄에서 트레일링 라인 주석(`// ...`)을 제거한 코드 부분을 반환한다.
 * 문자열(따옴표·백틱) 안의 `//`는 주석이 아니므로 보존한다.
 *
 * 한 줄 선언의 종료(`;`) 판정에 쓰인다. `const X = 10; // 주석` 처럼 세미콜론 뒤에
 * 주석이 붙으면 줄 끝이 `;`가 아니어서 선언이 종료되지 않은 것으로 오판,
 * 뒤따르는 export default 컴포넌트까지 한 섹션으로 삼켜지는 버그를 막는다.
 */
export function stripTrailingLineComment(line: string): string {
  let inString: '"' | "'" | '`' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
    if (ch === '"' || ch === "'" || ch === '`') inString = ch;
  }
  return line;
}

/**
 * TS / TSX 소스를 top-level 선언 단위로 분할한다.
 *
 * import 라인은 묶어 한 섹션, 그 외는 선언 시작 라인부터 중괄호 균형이 맞을 때까지를 한 섹션으로 본다.
 * 매칭되지 않는 영역(상수 선언, 주석 블록 등)은 'other' 섹션으로 모아둔다.
 */
export function splitTsSections(source: string): CodeSection[] {
  const lines = source.split('\n');
  const sections: CodeSection[] = [];

  let importStart: number | null = null;
  let importBuffer: string[] = [];
  const flushImports = (endIdx: number) => {
    if (importBuffer.length === 0 || importStart === null) return;
    const body = importBuffer.join('\n');
    sections.push({
      name: 'imports',
      kind: 'import',
      body,
      startLine: importStart + 1,
      endLine: endIdx,
      length: body.length,
      score: 0,
    });
    importBuffer = [];
    importStart = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    if (IMPORT_PATTERN.test(stripped)) {
      if (importStart === null) importStart = i;
      // 멀티라인 import도 한 문장으로 수집한다. 예: `import {\n  A,\n  B,\n} from 'mod';`
      // 중괄호 균형이 0으로 돌아오고 세미콜론 또는 `from '...'` 로 끝나면 문장 종료로 본다.
      // (연속 줄을 놓쳐 import 섹션이 첫 줄만 잡히던 버그 — depsHeader가 잘리는 원인 — 수정)
      let depth = 0;
      let j = i;
      for (; j < lines.length; j++) {
        const { open, close } = countDelimiters(lines[j]);
        depth += open - close;
        importBuffer.push(lines[j]);
        const code = stripTrailingLineComment(lines[j]).trimEnd();
        if (depth <= 0 && (/;\s*$/.test(code) || /from\s+['"][^'"]+['"]$/.test(code))) break;
      }
      i = j + 1;
      continue;
    }

    // import 블록 종료
    if (importBuffer.length > 0 && stripped !== '') {
      flushImports(i);
    }

    const match = line.match(DECL_PATTERN);
    if (!match) {
      i++;
      continue;
    }

    const kindRaw = match[2];
    const name = match[3];
    let kind: CodeSection['kind'] = 'other';
    if (kindRaw === 'function') kind = 'function';
    else if (kindRaw === 'const' || kindRaw === 'let' || kindRaw === 'var') kind = 'const';
    else if (kindRaw === 'class') kind = 'class';
    else if (kindRaw === 'interface') kind = 'interface';
    else if (kindRaw === 'type' || kindRaw === 'enum') kind = 'type';

    // 중괄호 균형으로 끝 라인 결정. 한 줄짜리 type/interface 선언은 다음 줄로 안 넘어감.
    const startLine = i;
    let depth = 0;
    let opened = false;
    let endLine = i;
    for (let j = i; j < lines.length; j++) {
      const { open, close } = countDelimiters(lines[j]);
      depth += open - close;
      if (open > 0) opened = true;
      // 세미콜론으로 끝나는 한 줄 선언(type / 화살표 함수가 아닌 const 등)
      // 트레일링 주석(`const X = 10; // 메모`)을 제거하고 판정한다.
      if (!opened && /[;]\s*$/.test(stripTrailingLineComment(lines[j]))) {
        endLine = j;
        break;
      }
      if (opened && depth === 0) {
        endLine = j;
        break;
      }
      endLine = j;
    }

    const body = lines.slice(startLine, endLine + 1).join('\n');
    sections.push({
      name,
      kind,
      body,
      startLine: startLine + 1,
      endLine: endLine + 1,
      length: body.length,
      score: 0,
    });

    i = endLine + 1;
  }

  // 남은 import 블록 flush
  flushImports(lines.length);

  return sections;
}

/**
 * 사용자 쿼리·선택 영역 키워드로 섹션 점수를 매긴다.
 * - 선언 이름이 쿼리에 등장: +5
 * - body에 쿼리 토큰 등장: 토큰 1개당 +1 (중복 매칭 1점 한정)
 * - imports 섹션: 항상 +2 (작고 단가 높음 — 보통 유지)
 * - 선택 영역과 라인 범위 겹침: +4
 */
export function scoreCodeSections(
  sections: CodeSection[],
  queryTokens: string[],
  selection?: { startLine: number; endLine: number },
): void {
  for (const section of sections) {
    let score = 0;
    const nameLower = section.name.toLowerCase();
    const bodyLower = section.body.toLowerCase();

    for (const token of queryTokens) {
      if (!token) continue;
      if (nameLower.includes(token)) score += 5;
      else if (bodyLower.includes(token)) score += 1;
    }

    if (section.kind === 'import') score += 2;

    if (
      selection &&
      section.endLine >= selection.startLine &&
      section.startLine <= selection.endLine
    ) {
      score += 4;
    }

    section.score = score;
  }
}

/**
 * 글자 수 예산 안에서 점수 높은 섹션을 선택한다.
 * 점수가 동일하면 짧은 섹션을 우선해 다양성 확보.
 * 선택되지 않은 섹션은 한 줄짜리 stub `// ... ({kind} {name} 생략, NN줄)` 로 대체된다.
 */
export interface SliceResult {
  /** 라인 번호 순으로 재배열된 최종 문자열 */
  text: string;
  /** 포함된 섹션 수 */
  includedCount: number;
  /** 생략된 섹션 수 */
  skippedCount: number;
  /** 결과 전체 글자 수 */
  totalChars: number;
}

export function sliceByBudget(sections: CodeSection[], maxChars: number): SliceResult {
  const sorted = [...sections].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.length - b.length;
  });

  const includedIds = new Set<number>();
  let remaining = maxChars;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].length <= remaining) {
      includedIds.add(sections.indexOf(sorted[i]));
      remaining -= sorted[i].length;
    }
    if (remaining <= 200) break;
  }

  // 원본 라인 순서 재정렬
  const ordered = sections
    .map((s, idx) => ({ section: s, idx }))
    .sort((a, b) => a.section.startLine - b.section.startLine);

  const parts: string[] = [];
  let skipped = 0;
  for (const { section, idx } of ordered) {
    if (includedIds.has(idx)) {
      parts.push(section.body);
    } else {
      const lineCount = section.endLine - section.startLine + 1;
      parts.push(
        `// ... [${section.kind} ${section.name}] 원본 ${lineCount}줄 보존 (자리 표시자: 이 이름을 변수처럼 참조 금지)`,
      );
      skipped++;
    }
  }

  const text = parts.join('\n\n');
  return {
    text,
    includedCount: includedIds.size,
    skippedCount: skipped,
    totalChars: text.length,
  };
}

/**
 * 한 번에 호출 가능한 헬퍼: 소스를 분할·채점·선택해 문자열로 반환한다.
 *
 * @param source 원본 TS/TSX 소스
 * @param queryTokens 사용자 쿼리에서 추출한 토큰
 * @param maxChars 결과 최대 글자 수 예산
 * @param selection (선택) 사용자가 강조한 라인 범위 — 가산점
 */
export function extractRelevantTsSlice(
  source: string,
  queryTokens: string[],
  maxChars: number,
  selection?: { startLine: number; endLine: number },
): SliceResult {
  const sections = splitTsSections(source);
  if (sections.length === 0) {
    // 분할 실패: 원본을 예산까지 자른다
    const text = source.length <= maxChars ? source : source.slice(0, maxChars) + '\n// ... (이하 생략)';
    return { text, includedCount: 0, skippedCount: 0, totalChars: text.length };
  }
  scoreCodeSections(sections, queryTokens, selection);
  return sliceByBudget(sections, maxChars);
}

/** stub 복원 결과 */
export interface RestoreStubsResult {
  /** stub 라인이 원본 본문으로 교체된 결과 텍스트 */
  text: string;
  /** 복원에 성공한 stub 개수 */
  restoredCount: number;
  /** 원본에서 매칭되는 섹션을 찾지 못한 stub(라인 그대로 유지) */
  unmatched: string[];
}

/**
 * `sliceByBudget`이 삽입한 stub 라인(`// ... [kind name] 원본 NN줄 보존 ...`)을
 * 원본 파일에서 해당 섹션을 찾아 그 본문으로 복원한다.
 *
 * LLM이 "full" 모드로 응답할 때 잘려진 뷰만 보고 stub 라인을 그대로 출력하면,
 * 그 stub이 그대로 디스크에 쓰여 실제 코드(232줄짜리 함수 등)가 한 줄 주석으로 대체되는
 * 사고가 발생한다. 파일 쓰기 직전에 이 함수로 안전망 복원을 수행한다.
 *
 * 동일한 (kind, name) 섹션이 원본에 없으면 stub 라인을 그대로 두고 통계만 기록한다.
 *
 * 하위 호환: 구 포맷 `// ... (kind name 생략, NN줄)` 도 함께 인식한다 — 진행 중인 세션이나
 * 캐시된 응답이 구 포맷을 포함할 수 있어, 한 차례 릴리스 사이클 동안 양쪽 모두 수용한다.
 */
export function restoreSlicedStubs(generated: string, original: string): RestoreStubsResult {
  // 신 포맷: `// ... [kind name] ...` — 대괄호 안 (kind, name)만 정확히 잡고 나머지는 관대하게.
  // 구 포맷: `// ... (kind name 생략, NN줄)` — 하위 호환용.
  const stubRegex =
    /^[ \t]*\/\/\s*\.\.\.\s*(?:\[\s*([a-zA-Z]+)\s+([\w$]+)\s*\]|\(\s*([a-zA-Z]+)\s+([\w$]+)\s*생략[\s,]*\d+\s*줄\s*\))[^\n]*$/gm;

  if (!stubRegex.test(generated)) {
    return { text: generated, restoredCount: 0, unmatched: [] };
  }
  stubRegex.lastIndex = 0;

  const originalSections = splitTsSections(original);
  const byKey = new Map<string, CodeSection>();
  for (const s of originalSections) byKey.set(`${s.kind}:${s.name}`, s);

  let restoredCount = 0;
  const unmatched: string[] = [];

  const text = generated.replace(
    stubRegex,
    (full, newKind?: string, newName?: string, oldKind?: string, oldName?: string) => {
      const kind = newKind ?? oldKind ?? '';
      const name = newName ?? oldName ?? '';
      const section = byKey.get(`${kind}:${name}`);
      if (section) {
        restoredCount++;
        return section.body;
      }
      unmatched.push(`${kind} ${name}`);
      return full;
    },
  );

  return { text, restoredCount, unmatched };
}
