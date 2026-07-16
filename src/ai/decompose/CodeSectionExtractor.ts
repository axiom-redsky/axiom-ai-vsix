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
 * 흔한 토큰(변별력 없음) 판정에 쓰는 최소 섹션 수 — 이보다 작은 파일은 가드를 끈다(종전 동작 보존).
 * 작은 파일은 어차피 예산 안에 다 들어가는 경우가 대부분이라 과매칭 피해가 없다.
 */
const FLOOD_GUARD_MIN_SECTIONS = 8;

/**
 * body 매칭 섹션 수가 `max(3, 전체 × 이 비율)`을 초과하는 토큰은 변별력 없음으로 본다.
 * 2026-07-15 bigfile 실측: "api" 토큰이 모든 `*_ENDPOINT` 값(`'/api/…'`)에 매칭돼
 * 195섹션 중 65개가 동점 +1 — 예산이 무관 한 줄 선언 덤프로 채워지는 폭주의 뿌리.
 */
const FLOOD_TOKEN_RATIO = 0.2;

/**
 * 사용자 쿼리·선택 영역 키워드로 섹션 점수를 매긴다.
 * - 선언 이름이 쿼리에 등장: +5
 * - body에 쿼리 토큰 등장: 토큰 1개당 +1 (중복 매칭 1점 한정)
 *   단, 너무 많은 섹션에 등장하는 흔한 토큰은 변별력이 없어 body 가점에서 제외한다
 *   (이름 매칭 +5는 유지 — 이름에 든 토큰은 여전히 특정 선언을 가리킨다).
 * - imports 섹션: 항상 +2 (작고 단가 높음 — 보통 유지)
 * - 선택 영역과 라인 범위 겹침: +4
 */
export function scoreCodeSections(
  sections: CodeSection[],
  queryTokens: string[],
  selection?: { startLine: number; endLine: number },
): void {
  // ── 흔한 토큰 가드 (IDF 취지) ──
  // 토큰별 body 매칭 섹션 수(DF)를 먼저 세고, max(3, 전체의 20%)를 초과하면 body 가점 제외.
  const bodiesLower = sections.map((s) => s.body.toLowerCase());
  const floodTokens = new Set<string>();
  if (sections.length >= FLOOD_GUARD_MIN_SECTIONS) {
    const floodThreshold = Math.max(3, sections.length * FLOOD_TOKEN_RATIO);
    for (const token of new Set(queryTokens)) {
      if (!token) continue;
      let hits = 0;
      for (const body of bodiesLower) {
        if (body.includes(token)) hits++;
      }
      if (hits > floodThreshold) floodTokens.add(token);
    }
  }

  for (let idx = 0; idx < sections.length; idx++) {
    const section = sections[idx];
    let score = 0;
    const nameLower = section.name.toLowerCase();
    const bodyLower = bodiesLower[idx];

    for (const token of queryTokens) {
      if (!token) continue;
      if (nameLower.includes(token)) score += 5;
      else if (!floodTokens.has(token) && bodyLower.includes(token)) score += 1;
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
 * 선택되지 않은 섹션은 한 줄짜리 stub `// ... [{kind} {name}] 원본 NN줄 보존 ...` 로 대체되며,
 * 연속 제외 런(STUB_GROUP_MIN_RUN 이상)은 그룹 표식 한 줄로 뭉친다(D3 stub 홍수 대응).
 */
export interface SliceGroupRange {
  /** 그룹이 덮는 원본 시작 라인 (1-based, 첫 섹션 startLine) */
  startLine: number;
  /** 그룹이 덮는 원본 끝 라인 (1-based, 마지막 섹션 endLine) */
  endLine: number;
  /** 그룹에 뭉친 섹션 수 */
  sectionCount: number;
  /** 표식 프리픽스 `[보존 Ls~Le]` — 복원·생존 검사가 이 키로 매칭한다 */
  marker: string;
}

export interface SliceResult {
  /** 라인 번호 순으로 재배열된 최종 문자열 */
  text: string;
  /** 포함된 섹션 수 */
  includedCount: number;
  /** 생략된 섹션 수 */
  skippedCount: number;
  /** 결과 전체 글자 수 */
  totalChars: number;
  /** 그룹 표식으로 뭉친 보존 구간들 (없으면 빈 배열) */
  groupedRanges: SliceGroupRange[];
}

/**
 * 이 길이 이상의 연속 제외 런만 그룹 표식으로 뭉친다.
 * 짧은 런은 개별 stub이 더 정밀하고(이름이 표식 헤더에 그대로), 그룹 표식의 고정 문구
 * 오버헤드 대비 절감도 미미하다.
 */
const STUB_GROUP_MIN_RUN = 3;

export function sliceByBudget(sections: CodeSection[], maxChars: number): SliceResult {
  const sorted = [...sections].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.length - b.length;
  });

  // ── score=0 필러 가드 ──
  // 파일이 예산을 넘겨 진짜 슬라이싱이 일어나고(overflow) 점수 있는 섹션이 하나라도 있으면,
  // 무관(score 0) 섹션으로 남은 예산을 채우지 않는다. 동점·최단 우선 정렬이 한 줄짜리
  // type/const 덤프를 예산에 선적하던 폭주(2026-07-15 bigfile 실측: 포함 80개 전부 노이즈) 차단.
  // 쿼리가 코드와 아예 안 겹치면(진짜 신호 0) 종전 동작(최단 우선 채움) 유지 — 이때 imports의
  // 무조건 +2 가점은 쿼리 신호가 아니므로 판정에서 제외한다(막연한 쿼리가 가드를 오발하지 않게).
  const totalLen = sections.reduce((sum, s) => sum + s.length, 0);
  const hasQuerySignal = sections.some((s) => s.score > 0 && s.kind !== 'import');
  const skipZeroScore = totalLen > maxChars && hasQuerySignal;

  const includedIds = new Set<number>();
  let remaining = maxChars;
  for (let i = 0; i < sorted.length; i++) {
    if (skipZeroScore && sorted[i].score <= 0) break; // score 내림차순 정렬 — 이후 전부 0점
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

  // ── D3 stub 그룹핑 ──
  // 제외 섹션이 수백 개면 개별 stub 줄만으로 주입의 대부분을 먹는다(2026-07-15 라이브 실측:
  // stub 194줄 = 컨텍스트 58%). 연속 제외 런을 그룹 표식 한 줄(라인범위+심볼 목록)로 뭉치되,
  //  - 포함 섹션과 **인접**한 제외 섹션은 개별 stub 유지(수정 지점 근처는 이름 정밀도 보존)
  //  - 심볼 이름 목록을 실어 모델이 보존 구간의 선언을 몰라 재선언하는 사고(복원 후 중복 선언) 방지
  //  - 복원·생존 검사는 프리픽스 `[보존 Ls~Le]`만 매칭 — 모델이 긴 이름 꼬리를 잘라도 복원 생존
  const flags = ordered.map(({ idx }) => includedIds.has(idx));
  const keepIndividual = ordered.map(
    (_, i) =>
      !flags[i] &&
      ((i > 0 && flags[i - 1]) || (i + 1 < ordered.length && flags[i + 1])),
  );

  const parts: string[] = [];
  const groupedRanges: SliceGroupRange[] = [];
  let skipped = 0;
  const pushIndividualStub = (section: CodeSection): void => {
    const lineCount = section.endLine - section.startLine + 1;
    parts.push(
      `// ... [${section.kind} ${section.name}] 원본 ${lineCount}줄 보존 (자리 표시자: 이 이름을 변수처럼 참조 금지)`,
    );
    skipped++;
  };

  let i = 0;
  while (i < ordered.length) {
    if (flags[i]) {
      parts.push(ordered[i].section.body);
      i++;
      continue;
    }
    if (!keepIndividual[i]) {
      let j = i;
      while (j < ordered.length && !flags[j] && !keepIndividual[j]) j++;
      if (j - i >= STUB_GROUP_MIN_RUN) {
        const run = ordered.slice(i, j).map((o) => o.section);
        const startLine = run[0].startLine;
        const endLine = run[run.length - 1].endLine;
        const kindCounts = new Map<string, number>();
        for (const s of run) kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1);
        const kindSummary = [...kindCounts.entries()].map(([k, c]) => `${k} ${c}`).join('·');
        const names = run.map((s) => s.name).join(', ');
        const marker = `[보존 L${startLine}~L${endLine}]`;
        parts.push(
          `// ... ${marker} 원본 ${endLine - startLine + 1}줄(${kindSummary}) 보존 ` +
            `(자리 표시자: 이 줄을 그대로 유지. 다음 이름은 이미 선언되어 있음 — 재선언·수정 금지): ${names}`,
        );
        groupedRanges.push({ startLine, endLine, sectionCount: run.length, marker });
        skipped += run.length;
        i = j;
        continue;
      }
      for (let k = i; k < j; k++) pushIndividualStub(ordered[k].section);
      i = j;
      continue;
    }
    pushIndividualStub(ordered[i].section);
    i++;
  }

  const text = parts.join('\n\n');
  return {
    text,
    includedCount: includedIds.size,
    skippedCount: skipped,
    totalChars: text.length,
    groupedRanges,
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
    return { text, includedCount: 0, skippedCount: 0, totalChars: text.length, groupedRanges: [] };
  }
  scoreCodeSections(sections, queryTokens, selection);
  return sliceByBudget(sections, maxChars);
}

/**
 * `sliceByBudget`이 삽입한 stub 자리표시자 줄을 제거하고, 생략 개수만 한 줄로 요약한다.
 *
 * stub의 목적은 **편집 대상 파일**에서 생략된 코드를 모델이 "있는 척" 참조하지 못하게 막는 것이다.
 * 그런데 **읽기 전용 참조 파일**(스펙·타입)엔 그 위험이 없어 stub이 순수 토큰 낭비다. 게다가 stub은
 * `sliceByBudget`의 글자 예산 **밖**에서 붙으므로(예산은 포함 본문만 셈), 선언이 많은 파일에선 주입
 * 크기가 의도한 예산을 초과한다. 참조 파일 주입 시 이 함수로 stub을 접으면 출력이 예산(=포함 본문 합
 * + 요약 한 줄) 이하로 돌아온다. 편집 대상 파일 경로에는 쓰지 말 것(그쪽은 stub이 안전장치).
 */
export function stripSliceStubs(sliced: string): { text: string; strippedCount: number } {
  // sliceByBudget 신 포맷 `// ... [kind name] ...` + 구 포맷 `// ... (kind name 생략, NN줄)` 모두 수용.
  const STUB_RE = /^[ \t]*\/\/\s*\.\.\.\s*(?:\[[^\]\n]*\]|\([^)\n]*생략[^)\n]*\))[^\n]*$/gm;
  const matches = sliced.match(STUB_RE);
  const strippedCount = matches ? matches.length : 0;
  if (strippedCount === 0) return { text: sliced, strippedCount: 0 };
  const text =
    sliced.replace(STUB_RE, '').replace(/\n{3,}/g, '\n\n').trim() +
    `\n\n// (관련 낮은 선언 ${strippedCount}개 생략)`;
  return { text, strippedCount };
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
 *
 * 그룹 표식 `// ... [보존 Ls~Le] ...`(D3)은 원본의 해당 라인 범위를 통째로 복원한다.
 * 프리픽스 `[보존 Ls~Le]`만 매칭하므로 모델이 표식 뒤의 심볼 목록을 잘라먹어도 복원된다.
 */
export function restoreSlicedStubs(generated: string, original: string): RestoreStubsResult {
  // 신 포맷: `// ... [kind name] ...` — 대괄호 안 (kind, name)만 정확히 잡고 나머지는 관대하게.
  // 구 포맷: `// ... (kind name 생략, NN줄)` — 하위 호환용.
  const stubRegex =
    /^[ \t]*\/\/\s*\.\.\.\s*(?:\[\s*([a-zA-Z]+)\s+([\w$]+)\s*\]|\(\s*([a-zA-Z]+)\s+([\w$]+)\s*생략[\s,]*\d+\s*줄\s*\))[^\n]*$/gm;
  // 그룹 표식: `// ... [보존 Ls~Le] ...` — 모델이 `{/* ... */}`로 변형한 것도 수용.
  const groupRegex =
    /^[ \t]*(?:\/\/|\{\/\*)\s*\.\.\.\s*\[\s*보존\s+L(\d+)\s*~\s*L(\d+)\s*\][^\n]*$/gm;

  const hasStub = stubRegex.test(generated);
  const hasGroup = groupRegex.test(generated);
  if (!hasStub && !hasGroup) {
    return { text: generated, restoredCount: 0, unmatched: [] };
  }
  stubRegex.lastIndex = 0;
  groupRegex.lastIndex = 0;

  let restoredCount = 0;
  const unmatched: string[] = [];
  let text = generated;

  // 1) 그룹 표식 → 원본 라인 범위 통째 복원 (섹션 매칭 불필요·경계만 검증)
  if (hasGroup) {
    const originalLines = original.replace(/\r\n/g, '\n').split('\n');
    text = text.replace(groupRegex, (full, sStr: string, eStr: string) => {
      const s = Number(sStr);
      const e = Number(eStr);
      if (s >= 1 && e >= s && e <= originalLines.length) {
        restoredCount++;
        return originalLines.slice(s - 1, e).join('\n');
      }
      unmatched.push(`보존 L${s}~L${e}`);
      return full;
    });
  }

  // 2) 개별 stub → (kind, name) 섹션 복원 (종전 동작)
  if (hasStub) {
    const originalSections = splitTsSections(original);
    const byKey = new Map<string, CodeSection>();
    for (const s of originalSections) byKey.set(`${s.kind}:${s.name}`, s);

    text = text.replace(
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
  }

  return { text, restoredCount, unmatched };
}
