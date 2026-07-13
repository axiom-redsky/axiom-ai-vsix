import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { splitTsSections } from './decompose/CodeSectionExtractor';
import type { StructuralEdit } from './apply/StructuralAnchor';

/**
 * 한 응답 안에 들어가는 patch 단위. 모델이 출력한 `<patch><search>...</search><replace>...</replace></patch>`
 * 한 쌍에 대응한다. 다중 patch 응답이면 patches 배열에 N개 들어간다.
 */
export interface PatchBlock {
  search: string;
  replace: string;
}

/**
 * 라인 앵커(diff) 모드의 단일 edit. 모델이 출력한 `<edit ...>...</edit>` 한 개에 대응한다.
 * 출력 토큰을 줄이기 위해 원본을 다시 복사하지 않고, **표시된 라인번호**로 위치를 지정한다.
 * - 치환: `from`~`to` (1-based, 양끝 포함). 빈 content이면 해당 범위 삭제.
 * - 삽입: `after` (해당 라인 뒤에 content 삽입, after=0 → 파일 최상단)
 * - `anchor`: 기준 라인(치환=from, 삽입=after)의 원본 텍스트 1줄. 적용 전 대조해
 *   라인번호 드리프트를 자동 보정하고, 어긋나면 시끄럽게 실패시킨다(조용한 오적용 방지).
 */
export interface LineEdit {
  from?: number;
  to?: number;
  after?: number;
  content: string;
  anchor?: string;
}

export interface AxiomAction {
  action: 'createFile' | 'updateFile';
  templateType: 'page' | 'component' | 'store' | 'api' | 'router';
  domain: string;
  componentName: string;
  filePath: string;
  /**
   * 'patch': search/replace 부분 교체, 'full': 전체 파일 재작성 (기본값),
   * 'structural': <hook>/<import> 조각을 확장이 splitTsSections 기준으로 결정론적 삽입
   * (약한 sLLM이 위치·search 텍스트를 만들지 않아도 되는 경로)
   */
  mode?: 'full' | 'patch' | 'structural' | 'lines';
  /** mode='structural' 일 때 삽입할 훅 코드 + import 목록 */
  structural?: StructuralEdit;
  /** mode='lines' 일 때 라인 앵커 edit 목록 */
  lineEdits?: LineEdit[];
  generatedCode?: string;
  /** @deprecated patches[0]로 마이그레이션 — 하위 호환을 위해 단일 patch 출력도 받아들인다 */
  searchCode?: string;
  /** @deprecated patches[0]로 마이그레이션 */
  replaceCode?: string;
  /** 다중 patch — 모델이 N개의 <patch> 블록을 출력하면 여기로 들어온다 */
  patches?: PatchBlock[];
  /** true이면 InputBox 없이 자동 저장 (페이지 생성 플로우에서 도메인 이미 확인된 경우) */
  autoWrite?: boolean;
}

/** computeMultiPatch가 반환하는 patch별 결과 상세 */
export interface PatchApplyResult {
  index: number;
  success: boolean;
  /** 매칭 성공 시 1-based 라인 범위(포함) */
  startLine?: number;
  endLine?: number;
  /**
   * 실패 사유:
   *  - 'not-found': search가 원본 어디에도 매칭되지 않음
   *  - 'overlap': 다른 patch와 라인 범위가 겹침
   *  - 'ambiguous': substring 매칭(Pass 4)에서 파일 내 여러 위치에 매칭됨 + 선택 영역으로도 좁히지 못함
   *  - 'selection-mismatch': patch가 선택 영역과 겹치지 않는 곳에 적용되었음 (import 추가 제외)
   *  - 'out-of-range': (lines 모드) 지정한 라인번호가 파일 범위(1..N) 밖
   *  - 'anchor-mismatch': (lines 모드) anchor가 기준 라인 ±N 안에서 매칭되지 않음
   *  - 'closer-dropped': (lines 모드) 삭제 영역 끝의 닫힘 토큰(</div>·)}·} 등)을 교체 내용이
   *    재현하지 않아 부모 스코프 닫힘이 사라짐 (모델이 to 범위를 닫는 줄까지 넓힌 over-reach)
   */
  reason?:
    | 'not-found'
    | 'overlap'
    | 'ambiguous'
    | 'selection-mismatch'
    | 'out-of-range'
    | 'anchor-mismatch'
    | 'closer-dropped';
}

/**
 * 사용자가 에디터에서 선택한 라인 범위. computeMultiPatch에 전달되면 단일 라인 substring
 * 매칭(Pass 4) 시 이 범위를 먼저 스캔하여 모델의 의도를 정확히 짚는다.
 */
export interface SelectionLineRange {
  /** 1-based, 포함 */
  startLine: number;
  /** 1-based, 포함 */
  endLine: number;
}

export interface MultiPatchResult {
  /** 모든 patch가 적용된 최종 텍스트. 어느 하나라도 실패하면 null (atomic). */
  text: string | null;
  /** patch별 결과 (입력 순서 유지) */
  results: PatchApplyResult[];
  /**
   * 매칭에 성공한 patch의 해소 정보(0-based 라인 범위). 일부가 실패해 text=null이어도
   * 성공분은 여기 채워진다 — grounded 재시도가 "이미 맞은 patch"의 실제 위치를 알 때 사용.
   * 디스크 쓰기 게이트는 여전히 text로만 판단한다(atomic 계약 불변).
   */
  resolvedOk: { index: number; startLine: number; endLine: number }[];
}

/** locateFuzzyRegion이 반환하는, 실패 search에 가장 닮은 원본 영역 */
export interface FuzzyRegion {
  /** 1-based, 포함 */
  startLine: number;
  /** 1-based, 포함 */
  endLine: number;
  /** 해당 영역의 실제 원본 텍스트(앞뒤 ctx 포함) */
  text: string;
  /** 최고 매칭 라인의 토큰 자카드 유사도(0~1) */
  confidence: number;
}

export interface CreateFileResult {
  success: boolean;
  cancelled?: boolean;
  filePath?: string;
  error?: string;
  originalContent?: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  page: '페이지 컴포넌트',
  component: '컴포넌트',
  store: '스토어',
  api: 'API 모듈',
  router: '라우터',
};

export class FileCreatorService {
  async createFile(action: AxiomAction): Promise<CreateFileResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { success: false, error: '열린 워크스페이스가 없습니다.' };
    }

    const workspaceRoot = workspaceFolders[0].uri;

    // 라우터 파일(router), updateFile, autoWrite 플래그는 InputBox 없이 자동으로 처리
    const isAutoWrite = action.action === 'updateFile' || action.templateType === 'router' || action.autoWrite === true;
    return isAutoWrite
      ? this._updateExistingFile(action, workspaceRoot)
      : this._createNewFile(action, workspaceRoot);
  }

  /**
   * 파일 내용만 읽는다. 쓰지 않음. 컨펌 플로우에서 원본 확보용으로 사용.
   *
   * 우선순위:
   *   1) 워크스페이스에서 이미 열려 있는 TextDocument의 버퍼 내용 (저장 안 한 변경 반영)
   *   2) 디스크 파일
   *
   * 1번이 중요한 이유: EditorContextCollector는 doc.getText() 로 버퍼를 읽어
   * LLM에 contextWindow를 전달한다. patch 적용 단계에서 디스크를 다시 읽으면
   * 사용자가 저장 안 한 편집이 무시되어 search가 매칭에 실패한다.
   */
  async readFileContent(action: AxiomAction): Promise<{ originalContent?: string; error?: string }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { error: '열린 워크스페이스가 없습니다.' };
    }
    const targetFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, action.filePath);

    // 1) 열려 있는 버퍼 우선 (저장 안 한 변경 포함)
    const targetPath = targetFileUri.fsPath;
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === targetPath,
    );
    if (openDoc) {
      return { originalContent: openDoc.getText() };
    }

    // 2) 디스크 fallback
    try {
      const bytes = await vscode.workspace.fs.readFile(targetFileUri);
      return { originalContent: Buffer.from(bytes).toString('utf-8') };
    } catch {
      return { originalContent: undefined };
    }
  }

  /**
   * patch 모드: original에서 searchCode를 찾아 replaceCode로 교체한 결과를 반환한다.
   * Pass 1: CRLF 정규화 후 exact match
   * Pass 2: 각 줄 trimEnd (줄 끝 공백 차이)
   * Pass 3: 각 줄 trim (들여쓰기·탭↔스페이스 차이)
   * 찾지 못하면 null을 반환한다.
   */
  computePatch(original: string, searchCode: string, replaceCode: string): string | null {
    // CRLF 정규화 (비교·교체는 LF 기준으로 수행, 결과 복원)
    const hasCRLF = original.includes('\r\n');
    const normOrig = hasCRLF ? original.replace(/\r\n/g, '\n') : original;
    const normSearch = searchCode.replace(/\r\n/g, '\n');
    const normReplace = replaceCode.replace(/\r\n/g, '\n');

    // Pass 1: exact match
    if (normOrig.includes(normSearch)) {
      const result = normOrig.replace(normSearch, normReplace);
      return hasCRLF ? result.replace(/\n/g, '\r\n') : result;
    }

    // Pass 2 & 3: 라인 단위 fuzzy
    const result = this._fuzzySearchReplace(normOrig, normSearch, normReplace);
    if (result === null) return null;
    return hasCRLF ? result.replace(/\n/g, '\r\n') : result;
  }

  /**
   * 결과 텍스트에서 **중복 import 라인**을 제거한다(첫 번째만 유지).
   *
   * 약한 모델이 patch로 이미 존재하는 import(예: `import { useApi } from '@axiom/hooks';`)를 또 추가하는
   * 흔한 실수를 결정론적으로 정리한다 — structural 모드의 import 병합/skip과 동일한 취지를 patch 결과에도 적용.
   *
   * 보수적 규칙: 한 줄짜리 `import ... from '...';` 라인만 대상으로, **정규화(공백 접기·따옴표 통일) 후
   * 완전히 동일한** 라인의 2번째 이후만 제거한다. side-effect import(`import './x'`)·여러 줄 import는
   * 패턴이 매칭되지 않아 손대지 않는다(오제거 방지).
   */
  /**
   * scaffold 단일 UI 경로 강제 — `@axiom/components/ui/<서브경로>` import를 `@axiom/components/ui`로 정규화한다.
   *
   * 왜: scaffold는 모든 UI 컴포넌트를 **단일 경로** `@axiom/components/ui`에서 named import 하는 게 규칙인데,
   * 약한 모델이 shadcn 관습(`@/components/ui/table`)을 흉내내 `@axiom/components/ui/table` 같은 **서브경로**를
   * 지어낸다(실측 2026-07-02: Table import). knowledge 문서는 올바른 단일경로를 가르치므로 이건 모델의 순수
   * 환각 → 프롬프트 설득보다 결정론적 정규화가 견고하다(길목 불변식). dedupe 직전에 돌려 정규화 후 완전중복은
   * dedupe가 마저 접는다.
   */
  normalizeUiImportPaths(text: string): { text: string; changed: number } {
    let changed = 0;
    const out = text.replace(
      /(\bfrom\s*['"])@axiom\/components\/ui\/[^'"]+(['"])/g,
      (_m, pre: string, post: string) => {
        changed++;
        return `${pre}@axiom/components/ui${post}`;
      },
    );
    return { text: changed > 0 ? out : text, changed };
  }

  /**
   * 전역 객체($ui·$util·$router) import 제거 — 이들은 scaffold가 전역으로 주입하므로 **import 없이 바로 사용**한다.
   *
   * 왜: 약한 모델이 규칙("$ui는 import 불필요")을 무시하고 `import { $ui } from '@axiom/hooks'` 같은 환각 import를
   * 지어낸다(실측 2026-07-02: "alert 버튼 넣어줘"). 존재하지 않는 export라 빌드가 깨진다. 프롬프트 설득이 안 먹혀
   * 결정론으로 제거한다(길목 불변식). named 목록에 전역만 있으면 라인 삭제, 섞여 있으면 전역 이름만 제거.
   */
  stripGlobalImports(text: string): { text: string; removed: number } {
    const GLOBALS = new Set(['$ui', '$util', '$router']);
    const hasCRLF = text.includes('\r\n');
    const norm = hasCRLF ? text.replace(/\r\n/g, '\n') : text;
    const lines = norm.split('\n');
    const out: string[] = [];
    let removed = 0;
    for (const line of lines) {
      // named import: import { $ui, X } from '...'
      const named = line.match(/^(\s*import\s*\{)([^}]*)(\}\s*from\s*['"][^'"]+['"]\s*;?\s*)$/);
      if (named) {
        const names = named[2].split(',').map((s) => s.trim()).filter(Boolean);
        const kept = names.filter((n) => !GLOBALS.has(n.replace(/\s+as\s+[\s\S]*/, '').trim()));
        if (kept.length === 0) { removed++; continue; } // 전부 전역 → 라인 제거
        if (kept.length < names.length) { removed++; out.push(`${named[1]} ${kept.join(', ')} ${named[3]}`); continue; }
        out.push(line);
        continue;
      }
      // default/namespace import: import $ui from '...' / import * as $util from '...'
      if (/^\s*import\s+(?:\*\s+as\s+)?(\$ui|\$util|\$router)\s+from\s+['"][^'"]+['"]\s*;?\s*$/.test(line)) {
        removed++;
        continue;
      }
      out.push(line);
    }
    if (removed === 0) return { text, removed: 0 };
    const joined = out.join('\n');
    return { text: hasCRLF ? joined.replace(/\n/g, '\r\n') : joined, removed };
  }

  dedupeImportLines(text: string): { text: string; removed: number } {
    const hasCRLF = text.includes('\r\n');
    const norm = hasCRLF ? text.replace(/\r\n/g, '\n') : text;
    const lines = norm.split('\n');
    const seen = new Set<string>();
    const out: string[] = [];
    let removed = 0;
    for (const line of lines) {
      if (/^\s*import\s.+\sfrom\s*['"][^'"]+['"]\s*;?\s*$/.test(line)) {
        const key = line.trim().replace(/\s+/g, ' ').replace(/"/g, "'");
        if (seen.has(key)) {
          removed++;
          continue;
        }
        seen.add(key);
      }
      out.push(line);
    }
    if (removed === 0) return { text, removed: 0 };
    const joined = out.join('\n');
    return { text: hasCRLF ? joined.replace(/\n/g, '\r\n') : joined, removed };
  }

  /**
   * 다중 patch를 원본에 동시 적용한다.
   *
   * 핵심 알고리즘 — "원본 기준 매칭 + 라인 범위 분리":
   *   1. 각 patch의 search를 **원본 파일**에 대해 매칭하고 [startLine, endLine] 라인 범위로 환산
   *   2. 어느 하나라도 매칭 실패 → 전체 실패 (atomic, text=null)
   *   3. 두 patch의 라인 범위가 겹치면 → 전체 실패 (atomic, text=null)
   *   4. 겹치지 않으면 라인 인덱스 큰 것부터(역순) 적용해 한 번에 합성
   *
   * 이 방식의 이점: 약한 모델(예: qwen 35B)이 자주 범하는
   * "첫 patch 적용 결과에서 두 번째 search 찾기" 오류가 구조적으로 차단된다.
   * 각 search는 항상 원본 파일에 대해 작성되면 된다.
   */
  computeMultiPatch(
    original: string,
    patches: PatchBlock[],
    selection?: SelectionLineRange,
  ): MultiPatchResult {
    if (patches.length === 0) return { text: null, results: [], resolvedOk: [] };

    const hasCRLF = original.includes('\r\n');
    const normOrig = hasCRLF ? original.replace(/\r\n/g, '\n') : original;
    const originalLines = normOrig.split('\n');

    type Resolved = { index: number; startLine: number; endLine: number; replaceLines: string[] };
    const resolved: Resolved[] = [];
    const results: PatchApplyResult[] = [];
    // 성공분의 0-based 라인 범위(실패가 섞여도 채움) — grounded 재시도용
    const resolvedOk = (): { index: number; startLine: number; endLine: number }[] =>
      resolved.map((r) => ({ index: r.index, startLine: r.startLine, endLine: r.endLine }));

    for (let i = 0; i < patches.length; i++) {
      const normSearch = patches[i].search.replace(/\r\n/g, '\n');
      const normReplace = patches[i].replace.replace(/\r\n/g, '\n');
      const r = this._resolvePatch(originalLines, normSearch, normReplace, selection);
      if (r.kind === 'ok') {
        resolved.push({
          index: i,
          startLine: r.start,
          endLine: r.end,
          replaceLines: r.replaceLines,
        });
        results.push({
          index: i,
          success: true,
          startLine: r.start + 1,
          endLine: r.end + 1,
        });
      } else {
        results.push({ index: i, success: false, reason: r.kind });
      }
    }

    if (results.some((r) => !r.success)) {
      return { text: null, results, resolvedOk: resolvedOk() };
    }

    // 겹침 검출 — startLine 오름차순으로 정렬한 뒤 인접 범위 비교
    const sortedByLine = [...resolved].sort((a, b) => a.startLine - b.startLine);
    for (let i = 1; i < sortedByLine.length; i++) {
      const prev = sortedByLine[i - 1];
      const cur = sortedByLine[i];
      if (cur.startLine <= prev.endLine) {
        const overlapEntry = results.find((r) => r.index === cur.index);
        if (overlapEntry) {
          overlapEntry.success = false;
          overlapEntry.reason = 'overlap';
          delete overlapEntry.startLine;
          delete overlapEntry.endLine;
        }
        return { text: null, results, resolvedOk: resolvedOk() };
      }
    }

    // 라인 인덱스 큰 것부터 역순 적용 — 앞쪽 교체로 인한 인덱스 시프트 방지
    const sortedDesc = [...sortedByLine].reverse();
    let lines = originalLines.slice();
    for (const r of sortedDesc) {
      lines = [
        ...lines.slice(0, r.startLine),
        ...r.replaceLines,
        ...lines.slice(r.endLine + 1),
      ];
    }

    let text = lines.join('\n');
    if (hasCRLF) text = text.replace(/\n/g, '\r\n');
    return { text, results, resolvedOk: resolvedOk() };
  }

  /**
   * 실패한 `<search>`에 가장 닮은 원본 영역을 토큰 자카드 유사도로 찾는다(grounded 재시도용).
   *
   * 약한 sLLM이 기억으로 재구성해 글자가 어긋난 search라도, 식별성 높은 한 줄을 기준으로
   * 실제 파일에서 닮은 위치를 짚어 그 **실제 텍스트**를 돌려준다. 이 텍스트를 모델에 다시 줘서
   * `<search>`를 실제 코드 기준으로 재작성하게 만든다.
   *
   * ⚠️ 위치 '힌트'로만 쓴다. 여기서 직접 치환·적용하지 않는다(조용한 오적용 방지).
   * 최고점이 threshold 미만이거나 2위와 명확히 우월하지 않으면(동점 다수) null을 반환해
   * grounding을 포기하고 기존 dead-end 폴백으로 보낸다.
   *
   * @param originalLines 원본 라인 배열(\n 정규화 후)
   * @param failedSearch  매칭 실패한 search 원문
   * @param ctx           반환 영역의 앞뒤 여유 줄 수
   * @param threshold     최고 매칭 라인의 자카드 유사도 하한(0~1)
   */
  locateFuzzyRegion(
    originalLines: string[],
    failedSearch: string,
    ctx: number,
    threshold: number,
  ): FuzzyRegion | null {
    // search에서 비공백 라인만 추출
    const searchLines = failedSearch
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (searchLines.length === 0) return null;

    const tokenize = (s: string): Set<string> => {
      const m = s.match(/[A-Za-z0-9_$]+/g);
      return new Set(m ?? []);
    };
    const jaccard = (a: Set<string>, b: Set<string>): number => {
      if (a.size === 0 || b.size === 0) return 0;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      return inter / (a.size + b.size - inter);
    };

    // 기준 줄: search 라인 중 식별성(영숫자 토큰 수)이 가장 높은 줄
    let anchorTokens = new Set<string>();
    for (const l of searchLines) {
      const t = tokenize(l);
      if (t.size > anchorTokens.size) anchorTokens = t;
    }
    if (anchorTokens.size === 0) return null;

    // 원본 각 라인과 유사도 → 최고점/2위 추적
    let best = { line: -1, score: 0 };
    let second = { line: -1, score: 0 };
    for (let i = 0; i < originalLines.length; i++) {
      const score = jaccard(anchorTokens, tokenize(originalLines[i]));
      if (score > best.score) {
        second = best;
        best = { line: i, score };
      } else if (score > second.score) {
        second = { line: i, score };
      }
    }

    if (best.line < 0 || best.score < threshold) return null;
    // 동점(또는 거의 동률) 다수 → 위치 모호 → 포기
    if (second.line >= 0 && best.score - second.score < 1e-9) return null;

    const startLine = Math.max(0, best.line - ctx);
    const endLine = Math.min(originalLines.length - 1, best.line + ctx);
    return {
      startLine: startLine + 1,
      endLine: endLine + 1,
      text: originalLines.slice(startLine, endLine + 1).join('\n'),
      confidence: best.score,
    };
  }

  /**
   * 모델의 `<search>`에 슬라이싱 스텁 마커가 들어 있으면, 그 스텁이 가리키는 실제 섹션의
   * **본문 라인 범위**를 splitTsSections로 결정론적으로 찾아 돌려준다(grounded 재시도용).
   *
   * 파일이 커서(maxFileLines 초과) 본문이 `... [kind name] 원본 NN줄 보존 ...` 스텁으로 잘려
   * 모델에 전달되면, 모델은 그 안의 실제 코드를 본 적이 없어 올바른 `<search>`를 만들 수 없다.
   * (스텁을 그대로 search에 넣어 항상 not-found가 난다.) 이때 실제 섹션 본문을 grounding 영역으로
   * 돌려주면, grounded 재시도가 모델에 실제 코드를 주고 patch를 다시 받을 수 있다.
   *
   * 스텁은 `//` 주석 형태와 모델이 JSX 안에서 변형한 `{/* ... *​/}` 형태를 모두 인식한다.
   * fuzzy(locateFuzzyRegion)보다 우선해서 시도한다 — 섹션명이 명시돼 있어 결정론적이기 때문.
   */
  resolveStubSection(originalContent: string, search: string): FuzzyRegion | null {
    // `[kind name]` 뒤에 `원본 NN줄 보존`이 오는 스텁 마커. 주석 구문(`//`·`{/* */}`)과 무관하게 매칭.
    const m = search.match(/\[\s*([a-zA-Z]+)\s+([\w$]+)\s*\][^\]\n]*원본\s*\d+\s*줄\s*보존/);
    if (!m) return null;
    const kind = m[1];
    const name = m[2];
    const normContent = originalContent.replace(/\r\n/g, '\n');
    const found = splitTsSections(normContent).find((s) => s.kind === kind && s.name === name);
    if (!found) return null;
    const lines = normContent.split('\n');
    return {
      startLine: found.startLine,
      endLine: found.endLine,
      text: lines.slice(found.startLine - 1, found.endLine).join('\n'),
      confidence: 1,
    };
  }

  /**
   * 선택 영역 안 patch들의 `search`→`replace`에서 **식별자 일괄 치환(rename) 맵**을 추출한다.
   * (1B ripple-aware guard 전용 — 선택 밖 변경이 이 rename의 결과인지 검증하는 데 쓴다.)
   *
   * search와 replace를 "식별자 / 비식별자" 토큰 시퀀스로 쪼개 위치별로 비교한다:
   *  - 두 시퀀스 길이가 같고, 비식별자 토큰이 모두 동일하고, 차이가 식별자 위치에서만 나면
   *    그 차이를 old→new 후보로 모은다(구조가 보존된 순수 치환만 인정 → 보수적).
   *  - 길이/구조가 다르면 그 patch는 건너뛴다(추출 실패 → guard는 거부 쪽으로 안전 폴백).
   *  - 같은 old가 서로 다른 new로 매핑되면 충돌로 보고 제외한다.
   *  - old가 TS 키워드·원시 타입(string/number 등)이면 제외 — 타입 변경이 전역 rename으로
   *    오염되는 것을 막는다.
   */
  extractRenameMap(patches: { search: string; replace: string }[]): Map<string, string> {
    const splitTokens = (s: string): string[] =>
      // 식별자(캡처)와 그 사이 구분자가 번갈아 나오도록 분할. 빈 문자열도 위치 유지를 위해 보존.
      s.replace(/\r\n/g, '\n').split(/([A-Za-z0-9_$]+)/);
    const isIdent = (t: string): boolean => /^[A-Za-z0-9_$]+$/.test(t);

    const map = new Map<string, string>();
    const conflict = new Set<string>();

    for (const p of patches) {
      const a = splitTokens(p.search);
      const b = splitTokens(p.replace);
      if (a.length !== b.length) continue; // 구조 불일치 → 안전하게 건너뜀

      let structureOk = true;
      const pending: Array<[string, string]> = [];
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        // 차이가 식별자 위치가 아니면(구분자·공백이 다름) 순수 치환이 아님 → 이 patch 폐기
        if (!isIdent(a[i]) || !isIdent(b[i])) { structureOk = false; break; }
        pending.push([a[i], b[i]]);
      }
      if (!structureOk) continue;

      for (const [oldId, newId] of pending) {
        if (oldId === newId) continue;
        if (FileCreatorService._RENAME_DENY.has(oldId)) continue; // 타입/키워드는 rename으로 안 봄
        const existing = map.get(oldId);
        if (existing !== undefined && existing !== newId) { conflict.add(oldId); continue; }
        map.set(oldId, newId);
      }
    }
    for (const c of conflict) map.delete(c);
    return map;
  }

  /**
   * 한 줄에 rename 맵을 **동시 적용**한 결과를 반환한다(식별자 단위, 체이닝 없음).
   * 식별자 토큰만 맵을 통과시키고 구분자는 그대로 둔다. a→b, b→c가 있어도 a가 c로 가지 않는다.
   */
  applyRenameMap(line: string, renames: Map<string, string>): string {
    if (renames.size === 0) return line;
    return line
      .split(/([A-Za-z0-9_$]+)/)
      .map((tok) => (/^[A-Za-z0-9_$]+$/.test(tok) ? renames.get(tok) ?? tok : tok))
      .join('');
  }

  /**
   * Phase 2 결정론적 리플 — 선택 영역에서 추출한 rename 맵을, 텍스트 전역의 **멤버 접근**
   * (`.field` / `?.field`)에만 적용한다. 타입 필드를 rename하면 그 필드를 소비하는
   * `member.name` 같은 접근을 확장이 직접 바꿔주므로, 모델이 소비처 JSX를 재구성(→ 매칭 실패)할
   * 필요가 없다.
   *
   * 안전 범위: 점(`.`) 뒤에 오는 식별자만 치환한다. 독립 변수·객체 리터럴 키(`name:`)·문자열은
   * 건드리지 않는다. 단, 같은 필드명을 가진 무관한 객체(`config.rate` 등)도 함께 바뀔 수 있는
   * 한계가 있으므로(타입 추론 없음) 변경 결과는 diff로 확인하는 것을 전제로 한다.
   * 단일 패스라 체이닝(a→b, b→c) 없이 동시 적용된다.
   */
  applyMemberRename(
    text: string,
    renames: Map<string, string>,
  ): { text: string; count: number; fields: string[] } {
    if (renames.size === 0) return { text, count: 0, fields: [] };
    let count = 0;
    const used = new Set<string>();
    const out = text.replace(/\.([A-Za-z0-9_$]+)/g, (m, id: string) => {
      const repl = renames.get(id);
      if (repl === undefined) return m;
      count++;
      used.add(id);
      return '.' + repl;
    });
    return { text: out, count, fields: [...used] };
  }

  /** rename old로 인정하지 않을 TS 키워드·원시 타입 (타입 변경이 전역 치환으로 오염되는 것 방지) */
  private static readonly _RENAME_DENY = new Set<string>([
    'string', 'number', 'boolean', 'any', 'unknown', 'void', 'never', 'object',
    'null', 'undefined', 'true', 'false', 'bigint', 'symbol',
    'const', 'let', 'var', 'type', 'interface', 'class', 'function', 'return',
    'import', 'export', 'default', 'new', 'extends', 'implements', 'readonly',
  ]);

  /**
   * 라인 앵커(diff) 모드: 모델이 출력한 `<edit>` 목록을 원본에 적용한 결과를 반환한다.
   *
   * computeMultiPatch와 동일한 atomic·역순 적용 계약을 따른다(하나라도 실패 시 text=null).
   * 차이점은 위치를 `<search>` 텍스트가 아니라 **라인번호 + anchor 1줄**로 지정한다는 것:
   *   1. 각 edit의 기준 라인(치환=from, 삽입=after)의 원본 텍스트를 anchor와 trim 대조
   *   2. 일치하면 그대로, 어긋나면 기준 라인 ±radius 안에서 anchor를 찾아 라인번호 자동 보정
   *   3. radius 안에서도 못 찾으면 'anchor-mismatch' 실패 → 호출부가 patch/full로 폴백
   *   4. requireAnchor=true인데 anchor가 없으면 검증 불가이므로 실패 처리
   * 이로써 라인번호 드리프트(약한 모델의 ±1 오차)를 흡수하고, 범위 안이지만 틀린 줄에
   * 덮어쓰는 "조용한 오적용"을 차단한다.
   */
  computeLineEdits(
    original: string,
    edits: LineEdit[],
    opts: { requireAnchor: boolean; anchorSearchRadius: number },
  ): MultiPatchResult {
    // lines 모드는 grounded 재시도 경로를 쓰지 않으므로 resolvedOk는 항상 빈 배열.
    if (edits.length === 0) return { text: null, results: [], resolvedOk: [] };

    const hasCRLF = original.includes('\r\n');
    const normOrig = hasCRLF ? original.replace(/\r\n/g, '\n') : original;
    const originalLines = normOrig.split('\n');

    type Resolved = {
      index: number;
      /** 0-based 시작 인덱스 (splice 위치) */
      start: number;
      /** 삭제할 줄 수 (삽입이면 0) */
      deleteCount: number;
      /** 겹침 검사용 0-based 끝 인덱스 (삽입이면 start-1 → 빈 구간) */
      endForOverlap: number;
      contentLines: string[];
    };
    const resolved: Resolved[] = [];
    const results: PatchApplyResult[] = [];

    for (let i = 0; i < edits.length; i++) {
      const r = this._resolveLineEdit(originalLines, edits[i], opts);
      if (r.kind === 'ok') {
        resolved.push({
          index: i,
          start: r.start,
          deleteCount: r.deleteCount,
          endForOverlap: r.start + r.deleteCount - 1,
          contentLines: r.contentLines,
        });
        results.push({ index: i, success: true, startLine: r.reportStart, endLine: r.reportEnd });
      } else {
        results.push({ index: i, success: false, reason: r.kind });
      }
    }

    if (results.some((r) => !r.success)) {
      return { text: null, results, resolvedOk: [] };
    }

    // 구조 닫힘 보호 — 치환 edit이 삭제 영역 끝의 순수 닫힘 줄(`</div>`·`)}`·`}` 등)을
    // 교체 내용 끝에서 재현하지 않으면, 부모 스코프를 닫던 토큰이 조용히 사라져 파일 전체가
    // 깨진다(약한 모델이 to 범위를 닫는 태그 줄까지 넓혔지만 replace에는 안 적은 over-reach).
    // 삭제 꼬리의 닫힘 토큰 수가 교체 꼬리보다 많으면 그 edit을 거부 → full 폴백.
    for (const r of resolved) {
      if (r.deleteCount === 0) continue; // 순수 삽입은 기존 닫힘을 지우지 않음
      const deleted = originalLines.slice(r.start, r.start + r.deleteCount);
      const delC = FileCreatorService._trailingClosers(deleted);
      if (delC.size === 0) continue;
      const insC = FileCreatorService._trailingClosers(r.contentLines);
      let dropped: string | null = null;
      for (const [tok, n] of delC) {
        if (n > (insC.get(tok) ?? 0)) {
          dropped = tok;
          break;
        }
      }
      if (dropped) {
        const entry = results.find((x) => x.index === r.index);
        if (entry) {
          entry.success = false;
          entry.reason = 'closer-dropped';
          delete entry.startLine;
          delete entry.endLine;
        }
        return { text: null, results, resolvedOk: [] };
      }
    }

    // 겹침 검출 — start 오름차순 정렬 후 인접 비교 (computeMultiPatch와 동일 규약)
    const sortedByStart = [...resolved].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sortedByStart.length; i++) {
      const prev = sortedByStart[i - 1];
      const cur = sortedByStart[i];
      if (cur.start <= prev.endForOverlap) {
        const overlapEntry = results.find((r) => r.index === cur.index);
        if (overlapEntry) {
          overlapEntry.success = false;
          overlapEntry.reason = 'overlap';
          delete overlapEntry.startLine;
          delete overlapEntry.endLine;
        }
        return { text: null, results, resolvedOk: [] };
      }
    }

    // start 큰 것부터 역순 splice — 앞쪽 변경으로 인한 인덱스 시프트 방지.
    // 동률(같은 start)이면 삭제가 있는 edit을 먼저 적용해 삽입이 그 앞에 오도록 한다.
    const sortedDesc = [...sortedByStart].sort(
      (a, b) => b.start - a.start || b.deleteCount - a.deleteCount,
    );
    let lines = originalLines.slice();
    for (const r of sortedDesc) {
      lines = [
        ...lines.slice(0, r.start),
        ...r.contentLines,
        ...lines.slice(r.start + r.deleteCount),
      ];
    }

    let text = lines.join('\n');
    if (hasCRLF) text = text.replace(/\n/g, '\r\n');
    return { text, results, resolvedOk: [] };
  }

  /**
   * 줄 배열의 끝에서부터 "순수 닫힘 줄"(닫는 태그·괄호로만 이뤄진 줄)이 연속되는 꼬리 구간을 보고,
   * 거기에 등장하는 구조 닫힘 토큰(`</X>`·`</>`·`/>`·`)`·`}`·`]`)의 개수를 센다.
   * 순수 닫힘이 아닌 줄(코드·텍스트·여는 태그)을 만나면 즉시 멈춘다 — 꼬리만 본다.
   * `;`·`,`·단독 `>`(여는 태그의 끝)는 구조 중첩과 무관하므로 토큰 집계에서 제외한다.
   */
  private static _trailingClosers(lines: string[]): Map<string, number> {
    const CLOSER_LINE = /^(?:<\/[A-Za-z][\w.]*>|<\/>|\/>|[)}\];,>])+$/;
    const TOKEN = /<\/[A-Za-z][\w.]*>|<\/>|\/>|[)}\]]/g;
    const counts = new Map<string, number>();
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t === '') continue; // 빈 줄은 건너뛰되 꼬리 구간은 유지
      if (!CLOSER_LINE.test(t)) break; // 닫힘이 아닌 줄 → 꼬리 종료
      for (const m of t.matchAll(TOKEN)) {
        counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
      }
    }
    return counts;
  }

  /**
   * 단일 LineEdit을 0-based splice 명세(start/deleteCount/contentLines)로 환산한다.
   * anchor 검증·자동보정을 거치며, 실패 시 사유를 반환한다.
   */
  private _resolveLineEdit(
    originalLines: string[],
    e: LineEdit,
    opts: { requireAnchor: boolean; anchorSearchRadius: number },
  ):
    | { kind: 'ok'; start: number; deleteCount: number; contentLines: string[]; reportStart: number; reportEnd: number }
    | { kind: 'out-of-range' }
    | { kind: 'anchor-mismatch' } {
    const oLen = originalLines.length;
    const contentLines = e.content.length ? e.content.replace(/\r\n/g, '\n').split('\n') : [];
    const isInsert = e.after !== undefined && e.from === undefined && e.to === undefined;

    // 기준 라인(1-based): 치환은 from, 삽입은 after(=뒤에 삽입할 라인). after=0(최상단)은 기준 라인 없음.
    let from = e.from;
    let to = e.to ?? e.from;
    let after = e.after;
    const baseLine1 = isInsert ? after! : from;

    // ── anchor 검증·자동보정 ──
    const anchor = e.anchor?.trim();
    if (anchor) {
      const baseIdx = (baseLine1 ?? 0) - 1; // 0-based 기준 줄
      const inRange = (idx: number) => idx >= 0 && idx < oLen;
      const eq = (idx: number) => inRange(idx) && originalLines[idx].trim() === anchor;
      if (baseLine1 !== undefined && baseLine1 >= 1 && eq(baseIdx)) {
        // 정확히 일치 — 보정 불필요
      } else {
        // 기준 줄 주변 ±radius 에서 가장 가까운 일치 라인 탐색 (d=0,1,1,2,2,...)
        let foundIdx = -1;
        for (let d = 0; d <= opts.anchorSearchRadius && foundIdx < 0; d++) {
          if (eq(baseIdx - d)) foundIdx = baseIdx - d;
          else if (d > 0 && eq(baseIdx + d)) foundIdx = baseIdx + d;
        }
        if (foundIdx < 0) return { kind: 'anchor-mismatch' };
        const delta = foundIdx + 1 - (baseLine1 ?? 1); // 1-based 보정량
        if (from !== undefined) from += delta;
        if (to !== undefined) to += delta;
        if (after !== undefined) after += delta;
      }
    } else if (opts.requireAnchor && !(isInsert && after === 0)) {
      // anchor 없이는 검증 불가 → 폴백 유도 (최상단 삽입 after=0은 기준 줄이 없어 예외)
      return { kind: 'anchor-mismatch' };
    }

    if (isInsert) {
      // after=0 → 최상단, after=oLen → 최하단 뒤
      if (after! < 0 || after! > oLen) return { kind: 'out-of-range' };
      return {
        kind: 'ok',
        start: after!,
        deleteCount: 0,
        contentLines,
        reportStart: after! + 1,
        reportEnd: after! + contentLines.length,
      };
    }

    // 치환/삭제
    if (from === undefined) return { kind: 'out-of-range' };
    const t = to ?? from;
    if (from < 1 || t < from || t > oLen) return { kind: 'out-of-range' };
    return {
      kind: 'ok',
      start: from - 1,
      deleteCount: t - from + 1,
      contentLines,
      reportStart: from,
      reportEnd: t,
    };
  }

  /**
   * 원본 라인 배열에서 search 블록의 라인 범위(0-based, 양끝 포함)와
   * 치환에 사용할 라인 배열을 결정한다.
   *
   * 4-pass 매칭:
   *   Pass 1: exact line equality (정확 일치)
   *   Pass 2: trimEnd (줄 끝 공백 차이만)
   *   Pass 3: trim (들여쓰기/탭↔스페이스 차이)
   *   Pass 4: single-line substring match (search가 한 줄짜리 토큰일 때 — qwen-class 모델이 자주 사용)
   *
   * Pass 4 동작:
   *   - selection이 주어지면 선택 라인 범위 안에서 먼저 검색 → 발견 시 즉시 사용
   *   - 선택 범위에서 못 찾으면 파일 전체 검색
   *   - 파일 전체에 매칭 라인이 정확히 1개이면 사용
   *   - 매칭 라인이 2개 이상인데 selection으로도 좁히지 못하면 'ambiguous' 실패
   */
  private _resolvePatch(
    originalLines: string[],
    search: string,
    replace: string,
    selection?: SelectionLineRange,
  ): { kind: 'ok'; start: number; end: number; replaceLines: string[] }
    | { kind: 'not-found' }
    | { kind: 'ambiguous' } {
    const rawSearch = search.split('\n');
    // 앞뒤 빈 줄 제거 (LLM이 search 블록 앞뒤에 빈 줄을 끼우는 경향)
    let s = 0;
    let e = rawSearch.length - 1;
    while (s <= e && rawSearch[s].trim() === '') s++;
    while (e >= s && rawSearch[e].trim() === '') e--;
    if (s > e) return { kind: 'not-found' };
    const searchLines = rawSearch.slice(s, e + 1);
    const sLen = searchLines.length;
    const oLen = originalLines.length;
    if (sLen > oLen && sLen > 1) return { kind: 'not-found' };

    const replaceLinesDefault = replace.split('\n');

    // Pass 0: stub 자리표시자 감지 — LLM이 슬라이싱된 뷰에서
    // `// ... [kind name] 원본 NN줄 보존 ...` 라인을 <search>로 사용한 케이스.
    // 실제 파일엔 stub이 없으므로 원본 섹션 본문의 라인 범위로 교체한다.
    if (sLen === 1) {
      const stubMatch = searchLines[0].match(
        /\/\/\s*\.\.\.\s*(?:\[\s*([a-zA-Z]+)\s+([\w$]+)\s*\]|\(\s*([a-zA-Z]+)\s+([\w$]+)\s*생략)/,
      );
      if (stubMatch) {
        const kind = (stubMatch[1] ?? stubMatch[3] ?? '').trim();
        const name = (stubMatch[2] ?? stubMatch[4] ?? '').trim();
        if (kind && name) {
          const sections = splitTsSections(originalLines.join('\n'));
          const found = sections.find((s) => s.kind === kind && s.name === name);
          if (found) {
            return {
              kind: 'ok',
              start: found.startLine - 1,
              end: found.endLine - 1,
              replaceLines: replaceLinesDefault,
            };
          }
        }
      }
    }

    // Pass 1~3: 줄 단위 비교 (multi-line search 또는 한 줄 전체 일치)
    if (sLen <= oLen) {
      // Pass 1: exact
      for (let i = 0; i <= oLen - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
          if (originalLines[i + j] !== searchLines[j]) { match = false; break; }
        }
        if (match) return { kind: 'ok', start: i, end: i + sLen - 1, replaceLines: replaceLinesDefault };
      }

      // Pass 2: trimEnd
      const seTrimEnd = searchLines.map((l) => l.trimEnd());
      for (let i = 0; i <= oLen - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
          if (originalLines[i + j].trimEnd() !== seTrimEnd[j]) { match = false; break; }
        }
        if (match) return { kind: 'ok', start: i, end: i + sLen - 1, replaceLines: replaceLinesDefault };
      }

      // Pass 3: trim
      const seTrimFull = searchLines.map((l) => l.trim());
      for (let i = 0; i <= oLen - sLen; i++) {
        let match = true;
        for (let j = 0; j < sLen; j++) {
          if (originalLines[i + j].trim() !== seTrimFull[j]) { match = false; break; }
        }
        if (match) return { kind: 'ok', start: i, end: i + sLen - 1, replaceLines: replaceLinesDefault };
      }
    }

    // Pass 4: 단일 라인 substring 매칭
    if (sLen === 1) {
      const needle = searchLines[0];
      if (needle.length === 0) return { kind: 'not-found' };

      const buildReplaceLines = (lineIdx: number, col: number): string[] => {
        const before = originalLines[lineIdx].slice(0, col);
        const after = originalLines[lineIdx].slice(col + needle.length);
        const rSplit = replaceLinesDefault;
        if (rSplit.length === 1) return [before + rSplit[0] + after];
        return [
          before + rSplit[0],
          ...rSplit.slice(1, -1),
          rSplit[rSplit.length - 1] + after,
        ];
      };

      // 우선 1: 선택 영역 안에서 검색 (가장 신뢰도 높음)
      if (selection) {
        const selStart0 = Math.max(0, selection.startLine - 1);
        const selEnd0 = Math.min(oLen - 1, selection.endLine - 1);
        for (let i = selStart0; i <= selEnd0; i++) {
          const col = originalLines[i].indexOf(needle);
          if (col !== -1) {
            return { kind: 'ok', start: i, end: i, replaceLines: buildReplaceLines(i, col) };
          }
        }
      }

      // 우선 2: 파일 전체에서 매칭 라인 수집
      const fileMatches: Array<{ line: number; col: number }> = [];
      for (let i = 0; i < oLen; i++) {
        const col = originalLines[i].indexOf(needle);
        if (col !== -1) fileMatches.push({ line: i, col });
        if (fileMatches.length > 1) break; // 둘 이상이면 ambiguous 판정용으로 충분
      }

      if (fileMatches.length === 0) return { kind: 'not-found' };
      if (fileMatches.length === 1) {
        const m = fileMatches[0];
        return { kind: 'ok', start: m.line, end: m.line, replaceLines: buildReplaceLines(m.line, m.col) };
      }

      // 둘 이상이고 선택 영역으로도 좁히지 못한 상태
      return { kind: 'ambiguous' };
    }

    return { kind: 'not-found' };
  }

  private _fuzzySearchReplace(original: string, search: string, replace: string): string | null {
    const originalLines = original.split('\n');
    const rawSearch = search.split('\n');

    // search 블록 앞뒤 빈 줄 제거
    let s = 0;
    let e = rawSearch.length - 1;
    while (s <= e && rawSearch[s].trim() === '') s++;
    while (e >= s && rawSearch[e].trim() === '') e--;
    const searchLines = rawSearch.slice(s, e + 1).map((l) => l.trimEnd());

    if (searchLines.length === 0) return null;

    const oLen = originalLines.length;
    const sLen = searchLines.length;

    // Pass 2: trimEnd 비교 (줄 끝 공백 차이)
    for (let i = 0; i <= oLen - sLen; i++) {
      let match = true;
      for (let j = 0; j < sLen; j++) {
        if (originalLines[i + j].trimEnd() !== searchLines[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return [...originalLines.slice(0, i), replace, ...originalLines.slice(i + sLen)].join('\n');
      }
    }

    // Pass 3: trim 비교 (들여쓰기·탭↔스페이스 차이)
    const trimmedSearch = searchLines.map((l) => l.trim());
    for (let i = 0; i <= oLen - sLen; i++) {
      let match = true;
      for (let j = 0; j < sLen; j++) {
        if (originalLines[i + j].trim() !== trimmedSearch[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return [...originalLines.slice(0, i), replace, ...originalLines.slice(i + sLen)].join('\n');
      }
    }

    return null;
  }

  /** 디렉터리 생성 + 파일 쓰기 + 에디터 열기. 컨펌 승인 후 실제 저장에 사용. */
  async applyUpdate(action: AxiomAction): Promise<CreateFileResult> {
    if (!action.generatedCode) {
      return { success: false, error: `${action.filePath}: 수정할 코드가 없습니다.` };
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { success: false, error: '열린 워크스페이스가 없습니다.' };
    }
    const workspaceRoot = workspaceFolders[0].uri;
    const targetFileUri = vscode.Uri.joinPath(workspaceRoot, action.filePath);
    try {
      const dirUri = vscode.Uri.joinPath(workspaceRoot, path.dirname(action.filePath));
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(targetFileUri, Buffer.from(action.generatedCode, 'utf-8'));
      const doc = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(doc);
      return { success: true, filePath: action.filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '알 수 없는 오류' };
    }
  }

  /**
   * updateFile: 기존 파일을 InputBox 없이 즉시 덮어쓴다.
   * 라우터 등록처럼 자동화된 파일 수정에 사용된다.
   */
  private async _updateExistingFile(
    action: AxiomAction,
    workspaceRoot: vscode.Uri,
  ): Promise<CreateFileResult> {
    if (!action.generatedCode) {
      return { success: false, error: `${action.filePath}: 수정할 코드가 없습니다.` };
    }

    const targetFileUri = vscode.Uri.joinPath(workspaceRoot, action.filePath);

    let originalContent: string | undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(targetFileUri);
      originalContent = Buffer.from(bytes).toString('utf-8');
    } catch {
      // 파일이 아직 없으면 originalContent는 undefined
    }

    try {
      const dirUri = vscode.Uri.joinPath(workspaceRoot, path.dirname(action.filePath));
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(
        targetFileUri,
        Buffer.from(action.generatedCode, 'utf-8'),
      );

      const doc = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(doc);

      return { success: true, filePath: action.filePath, originalContent };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '알 수 없는 오류' };
    }
  }

  /**
   * createFile: InputBox로 경로 확인 후 신규 파일을 생성한다.
   * 이미 존재하는 경우 덮어쓰기 여부를 묻는다.
   */
  private async _createNewFile(
    action: AxiomAction,
    workspaceRoot: vscode.Uri,
  ): Promise<CreateFileResult> {
    const label = TEMPLATE_LABELS[action.templateType] ?? '파일';

    const editedPath = await vscode.window.showInputBox({
      title: `${label} 생성`,
      prompt: '파일 경로를 확인하거나 수정하고 Enter를 누르세요 (Esc: 취소)',
      value: action.filePath,
      valueSelection: [action.filePath.lastIndexOf('/') + 1, action.filePath.length],
      validateInput: (v) => (v.trim() ? null : '경로를 입력해주세요.'),
    });
    if (editedPath === undefined) {
      return { success: false, cancelled: true };
    }

    const resolvedPath = editedPath.trim();
    const targetFileUri = vscode.Uri.joinPath(workspaceRoot, resolvedPath);

    try {
      await vscode.workspace.fs.stat(targetFileUri);
      const overwriteAnswer = await vscode.window.showWarningMessage(
        `이미 존재하는 파일입니다. 덮어쓰시겠습니까?\n\n${resolvedPath}`,
        { modal: true },
        '덮어쓰기',
        '취소',
      );
      if (overwriteAnswer !== '덮어쓰기') {
        return { success: false, cancelled: true };
      }
    } catch {
      // 파일 없음 → 정상 진행
    }

    try {
      const content = action.generatedCode
        ? action.generatedCode
        : this._applyTemplate(this._loadTemplate(action.templateType), action.componentName);

      const dirUri = vscode.Uri.joinPath(workspaceRoot, path.dirname(resolvedPath));
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(targetFileUri, Buffer.from(content, 'utf-8'));

      const doc = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(doc);

      return { success: true, filePath: resolvedPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '알 수 없는 오류' };
    }
  }

  /**
   * dist/templates/{templateType}.template.txt 파일을 읽는다.
   * esbuild 빌드 시 src/ai/templates/ → dist/templates/ 로 복사된다.
   */
  private _loadTemplate(templateType: string): string {
    const templatePath = path.join(__dirname, 'templates', `${templateType}.template.txt`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`템플릿 파일을 찾을 수 없습니다: ${templateType}.template.txt`);
    }
    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * 생성된 TSX/TS 코드에서 React 규칙 위반을 종합 감지한다.
   *
   * LLM이 자주 범하는 패턴만 차단하는 "쓰기 전 마지막 방어선"이다. 완전한 정적 분석이 아니며,
   * 의존성 배열 누락·state 직접 변이 등 AST가 필요해 false positive가 많은 검사는 ESLint
   * (react-hooks/rules-of-hooks, exhaustive-deps)에 위임한다.
   *
   * 감지 항목:
   *  1. 모듈 최상위(컴포넌트 함수 밖)에서 use* 훅 호출
   *  2. 조건문/반복문(if·else·for·while·switch·try) 블록 안에서 훅 호출
   *  3. 콜백(.map/.forEach/setTimeout 등) 안에서 훅 호출
   *  4. useEffect/useLayoutEffect 콜백을 async로 선언
   *
   * @returns 첫 번째 위반 설명 문자열, 위반 없으면 null
   */
  static detectReactRuleViolations(code: string): string | null {
    return (
      this.detectModuleScopeHookViolation(code) ??
      this._detectAsyncEffect(code) ??
      this._detectNestedHookCall(code)
    );
  }

  /**
   * useEffect/useLayoutEffect 콜백이 async로 선언된 경우를 감지한다.
   * effect는 cleanup 함수만 반환해야 하므로 async 콜백은 안티패턴이다.
   */
  private static _detectAsyncEffect(code: string): string | null {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/\buse(Effect|LayoutEffect)\s*\(\s*async\b/.test(lines[i])) {
        return `라인 ${i + 1}에서 useEffect 콜백이 async로 선언됨 (effect는 cleanup 함수만 반환해야 하므로 내부에서 async 함수를 정의해 호출할 것)`;
      }
    }
    return null;
  }

  /**
   * 조건문/반복문/콜백 블록 안에서 훅을 호출하는 경우를 감지한다.
   *
   * 라인 단위로 중괄호 스택을 추적하며, 각 블록을 여는 종류(fn/control/callback/other)를
   * 기록한다. 훅 호출을 만나면 가장 가까운 함수 경계(fn)보다 안쪽에 control/callback 블록이
   * 있는지 확인해 위반 여부를 판단한다.
   *
   * 보수적 설계: 분류가 애매한 블록은 'other'로 두어 위반을 트리거하지 않는다
   * (JSX 조건부 렌더 `{cond && ...}` 등에서의 false positive 방지).
   */
  private static _detectNestedHookCall(code: string): string | null {
    type BlockKind = 'fn' | 'control' | 'callback' | 'other';
    const lines = code.split('\n');
    const stack: BlockKind[] = [];

    const isSkippable = (t: string): boolean =>
      t === '' ||
      t.startsWith('//') ||
      t.startsWith('/*') ||
      t.startsWith('*') ||
      t.startsWith('import ') ||
      t.startsWith('type ') ||
      t.startsWith('export type ') ||
      t.startsWith('interface ') ||
      t.startsWith('export interface ');

    // 라인의 중괄호를 스택에 반영한다. 첫 여는 중괄호만 분류된 kind, 나머지는 'other'.
    const applyBraces = (line: string, kind: BlockKind): void => {
      let first = true;
      for (const ch of line) {
        if (ch === '{') {
          stack.push(first ? kind : 'other');
          first = false;
        } else if (ch === '}') {
          stack.pop();
        }
      }
    };

    // 라인이 여는 블록의 종류를 추정한다.
    const classify = (t: string): BlockKind => {
      // 조건문/반복문 — `} else {`, `} catch {` 형태 포함
      if (
        /^\}?\s*(else\b|else\s+if\b)/.test(t) ||
        /^(if|for|while|switch|do|try|catch|finally)\b/.test(t) ||
        /^\}\s*(catch|finally)\b/.test(t)
      ) {
        return 'control';
      }
      // 배열 메서드 콜백 / 타이머 콜백
      if (
        /\.(map|forEach|filter|reduce|reduceRight|find|findIndex|some|every|sort|flatMap)\s*\(/.test(t) ||
        /\b(setTimeout|setInterval)\s*\(/.test(t) ||
        /\.addEventListener\s*\(/.test(t)
      ) {
        return 'callback';
      }
      // 함수 정의(컴포넌트/일반 함수/핸들러) — 안전지대
      if (
        /\bfunction\b/.test(t) ||
        /=>\s*\{?\s*$/.test(t) ||
        /^(export\s+)?(default\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(t)
      ) {
        return 'fn';
      }
      return 'other';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isSkippable(trimmed)) {
        applyBraces(line, 'other');
        continue;
      }

      // use*(...) 또는 use*<Generic>(...) 모두 매칭 — 제네릭 타입 인자가 끼어도 놓치지 않는다.
      const hookMatch = trimmed.match(/\b(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/);
      const isHookDef =
        /^(export\s+)?(default\s+)?function\s+use[A-Z]/.test(trimmed) ||
        /^(export\s+)?const\s+use[A-Z]\w*\s*=/.test(trimmed);

      if (hookMatch && !isHookDef) {
        const hookName = hookMatch[1];

        // 인라인 조건부 호출: `if (cond) useFoo()` — 같은 줄, 블록 없음
        if (/^(if|else|for|while|switch)\b/.test(trimmed) && !trimmed.includes('{')) {
          return `라인 ${i + 1}에서 \`${hookName}\`이 조건문/반복문 안에서 호출됨 (인라인)`;
        }

        // 스택 검사: 가장 가까운 함수 경계 이후에 control/callback 블록이 있으면 위반
        const lastFn = stack.lastIndexOf('fn');
        for (let d = lastFn + 1; d < stack.length; d++) {
          if (stack[d] === 'control') {
            return `라인 ${i + 1}에서 \`${hookName}\`이 조건문/반복문 블록 안에서 호출됨`;
          }
          if (stack[d] === 'callback') {
            return `라인 ${i + 1}에서 \`${hookName}\`이 콜백(.map/.forEach 등) 안에서 호출됨`;
          }
        }
      }

      applyBraces(line, classify(trimmed));
    }

    return null;
  }

  /**
   * 생성된 TSX/TS 코드에서 React Hooks 규칙 위반을 감지한다.
   * 모듈 최상위(함수 컴포넌트 본문 밖)에서 use* 훅을 호출하는 코드를 탐지한다.
   * @returns 위반 설명 문자열, 위반 없으면 null
   */
  static detectModuleScopeHookViolation(code: string): string | null {
    const lines = code.split('\n');
    // 맨 앞이 곧바로 훅 호출인 문장(예: 모듈 스코프 `useEffect(() => …)`).
    const BARE_HOOK = /^(?:await\s+)?(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/;
    // RHS **머리**가 곧바로 훅 호출인지(대입 `=` 바로 다음 토큰이 useXxx( ). 화살표/함수 RHS는 비대상.
    const RHS_HOOK = /^(?:await\s+)?(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/;

    /**
     * 모듈 스코프 선언/훅 **문장 전체 텍스트**(joined)에서 모듈 스코프 훅 호출이면 훅 이름을, 아니면 null.
     * 핵심: binding 이 여러 줄 구조분해(`const {⏎ … ⏎} = useApi(`)여도 잡되, 대입 `=` **직후**(RHS 머리)가
     * 훅일 때만 본다 — 화살표/함수 컴포넌트(`const X = () => { … useState() }`)의 본문 훅을 오탐하지 않도록.
     * (종전엔 훅 호출이 있는 줄의 depthBefore 만 봐서, 구조분해 `{` 가 depth 를 올려 모듈 스코프 useApi 가
     *  탐지를 통째로 빠져나갔다 — 캡쳐 실패의 루트 원인.)
     */
    const moduleHookName = (joined: string): string | null => {
      const bare = joined.match(BARE_HOOK);
      if (bare) return bare[1];
      const decl = joined.match(/^(?:export\s+)?(?:const|let|var)\s+/);
      if (!decl) return null;
      let rest = joined.slice(decl[0].length);
      // 1) binding 패턴 건너뛰기: 구조분해면 매칭 닫힘까지, 아니면 식별자(+타입)
      if (rest[0] === '{' || rest[0] === '[') {
        let d = 0;
        let k = 0;
        for (; k < rest.length; k++) {
          const ch = rest[k];
          if (ch === '{' || ch === '[' || ch === '(') d++;
          else if (ch === '}' || ch === ']' || ch === ')') {
            d--;
            if (d === 0) { k++; break; }
          }
        }
        rest = rest.slice(k);
      }
      // 2) 대입 `=`(==·=>·<=·>=·!= 제외) 를 bracket depth 0 에서 찾는다(타입의 `=>` 등 skip).
      let d = 0;
      let eq = -1;
      for (let k = 0; k < rest.length; k++) {
        const ch = rest[k];
        if (ch === '{' || ch === '[' || ch === '(' || ch === '<') d++;
        else if (ch === '}' || ch === ']' || ch === ')' || ch === '>') d--;
        else if (
          d <= 0 && ch === '=' &&
          rest[k + 1] !== '=' && rest[k + 1] !== '>' &&
          rest[k - 1] !== '=' && rest[k - 1] !== '!' && rest[k - 1] !== '<' && rest[k - 1] !== '>'
        ) { eq = k; break; }
      }
      if (eq === -1) return null;
      const rhs = rest.slice(eq + 1).trimStart();
      const m = rhs.match(RHS_HOOK);
      return m ? m[1] : null;
    };

    const isSkippable = (t: string): boolean =>
      t === '' ||
      t.startsWith('import ') ||
      t.startsWith('//') ||
      t.startsWith('/*') ||
      t.startsWith('*') ||
      t.startsWith('type ') ||
      t.startsWith('export type ') ||
      t.startsWith('interface ') ||
      t.startsWith('export interface ');
    // 커스텀 훅 정의(function useXxx / const useXxx =)는 호출이 아님
    const isHookDef = (t: string): boolean =>
      /^(?:export\s+)?(?:default\s+)?function\s+use[A-Z]/.test(t) ||
      /^(?:export\s+)?const\s+use[A-Z]\w*\s*=/.test(t);

    const countBraces = (s: string): number => {
      let d = 0;
      for (const ch of s) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
      }
      return d;
    };

    let braceDepth = 0;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isSkippable(trimmed) || isHookDef(trimmed)) {
        braceDepth += countBraces(line);
        i++;
        continue;
      }

      // 모듈 최상위(depth0)에서 시작하는 선언/훅 문장만 모듈 스코프 후보다.
      if (braceDepth === 0) {
        const startsDecl = /^(?:export\s+)?(?:const|let|var)\s/.test(trimmed);
        const startsBareHook = BARE_HOOK.test(trimmed);
        if (startsDecl || startsBareHook) {
          // 문장이 균형을 이루는 끝줄까지 합쳐(괄호·중괄호·대괄호 모두) 한 텍스트로 검사한다.
          let bal = 0;
          let end = i;
          let joined = '';
          for (let j = i; j < lines.length && j < i + 80; j++) {
            joined += (j > i ? ' ' : '') + lines[j].trim();
            for (const ch of lines[j]) {
              if (ch === '(' || ch === '[' || ch === '{') bal++;
              else if (ch === ')' || ch === ']' || ch === '}') bal--;
            }
            end = j;
            if (bal <= 0) break;
          }
          const hookName = moduleHookName(joined);
          if (hookName) {
            return `라인 ${i + 1}에서 \`${hookName}\`이 모듈 최상위(컴포넌트 함수 밖)에서 호출됨`;
          }
          // 훅 문장이 아니면(예: 모듈 const/일반 대입) 합쳐 읽은 만큼 depth 를 갱신하고 건너뛴다.
          for (let j = i; j <= end; j++) braceDepth += countBraces(lines[j]);
          i = end + 1;
          continue;
        }
      }

      // 그 외(함수/컴포넌트 선언, depth>0 본문 등)는 brace 만 갱신하고 한 줄 진행.
      braceDepth += countBraces(line);
      i++;
    }

    return null;
  }

  /**
   * 모듈 최상위(컴포넌트 함수 밖)에 잘못 선언된 use* 훅 호출을 컴포넌트 본문 최상위로
   * **결정적으로** 이동시킨다. 같은 선언이 컴포넌트 본문에 이미 있으면(중복) 모듈 스코프
   * 쪽은 삭제만 한다.
   *
   * 약한 모델에게 전체 파일을 다시 생성시키지 않고(토큰 0) React Rules of Hooks 위반을
   * 교정하기 위한 변환이다. 구조 파싱이 애매하거나(컴포넌트 함수 못 찾음, 문장 경계 불명확)
   * 변환 후에도 위반이 남으면 null을 반환해 호출부가 모델 재시도로 폴백하게 한다.
   *
   * @returns 교정된 코드와 이동한 훅 목록, 안전하게 교정할 수 없으면 null
   */
  static hoistModuleScopeHooks(code: string): { text: string; hoisted: string[] } | null {
    // 위반이 없으면 변환 불필요
    if (!this.detectModuleScopeHookViolation(code)) return null;

    const hasCRLF = code.includes('\r\n');
    const lines = (hasCRLF ? code.replace(/\r\n/g, '\n') : code).split('\n');

    // 1) 컴포넌트 함수 본문 시작 라인
    const compOpenIdx = this._findComponentOpenLine(lines);
    if (compOpenIdx === -1) return null;

    // 2) 모듈 스코프(depth 0) 훅 호출 문장 수집
    const blocks = this._collectModuleScopeHookStatements(lines);
    if (blocks.length === 0) return null;

    // 3) 컴포넌트 본문(트림 정규화)에 이미 존재하는 중복 판정
    const bodyNorm = lines
      .slice(compOpenIdx + 1)
      .map((l) => l.trim())
      .join('\n');

    const removeIdx = new Set<number>();
    const moves: string[][] = [];
    const hoisted: string[] = [];
    for (const b of blocks) {
      for (let i = b.start; i <= b.end; i++) removeIdx.add(i);
      const stmtNorm = lines.slice(b.start, b.end + 1).map((l) => l.trim()).join('\n');
      hoisted.push(lines[b.start].trim());
      // 컴포넌트 본문에 동일 문장이 이미 있으면 모듈 스코프 쪽은 삭제만 (중복 제거)
      if (bodyNorm.includes(stmtNorm)) continue;
      // 모듈 스코프는 0-indent 가정 → 2칸 들여쓰기로 본문에 맞춰 재구성
      moves.push(lines.slice(b.start, b.end + 1).map((l) => (l.trim() === '' ? '' : '  ' + l)));
    }

    // 4) 재구성: 모듈 스코프 훅 라인 제거 + 컴포넌트 여는 줄 다음에 이동 문장 삽입
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (removeIdx.has(i)) continue;
      out.push(lines[i]);
      if (i === compOpenIdx) {
        for (const mv of moves) out.push(...mv);
      }
    }

    let text = out.join('\n');
    // 5) 변환 결과가 여전히 위반(다른 종류 포함)이면 안전하게 폴백
    if (this.detectReactRuleViolations(text)) return null;
    if (hasCRLF) text = text.replace(/\n/g, '\r\n');
    return { text, hoisted };
  }

  /**
   * 컴포넌트 함수 본문이 시작되는(여는 `{`가 있는) 라인 인덱스를 찾는다.
   * `export default function ...` 우선, 없으면 PascalCase 화살표 컴포넌트.
   * 못 찾으면 -1 (호출부가 폴백).
   */
  private static _findComponentOpenLine(lines: string[]): number {
    const openFrom = (i: number): number => {
      if (lines[i].includes('{')) return i;
      for (let j = i + 1; j < lines.length && j < i + 5; j++) {
        if (lines[j].includes('{')) return j;
      }
      return -1;
    };
    for (let i = 0; i < lines.length; i++) {
      if (/^export\s+default\s+function\b/.test(lines[i].trim())) return openFrom(i);
    }
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^(?:export\s+default\s+)?const\s+[A-Z]\w*\s*[:=][^=]*=>/.test(t)) return openFrom(i);
    }
    return -1;
  }

  /**
   * 모듈 최상위(brace depth 0)의 use* 훅 호출 문장을 수집한다.
   * 멀티라인 문장은 괄호·중괄호·대괄호 밸런스가 0이 되고 `;`가 나오는 줄까지 한 문장으로 묶는다.
   * 문장 경계를 못 찾으면(불균형) 빈 배열을 반환해 호출부가 폴백하게 한다.
   */
  private static _collectModuleScopeHookStatements(
    lines: string[],
  ): Array<{ start: number; end: number }> {
    const blocks: Array<{ start: number; end: number }> = [];
    // const/let/var ... = [await] useXxx[<...>](  — 훅 호출 대입
    const hookStart = /^(?:export\s+)?(?:const|let|var)\s+[^=]+=\s*(?:await\s+)?use[A-Z]\w*\s*(?:<[^()]*>)?\s*\(/;
    // const useXxx = ...  (커스텀 훅 정의) 는 호출이 아니므로 제외
    const isHookDef = /^(?:export\s+)?const\s+use[A-Z]/;

    let depth = 0;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      const skippable =
        t === '' ||
        t.startsWith('//') ||
        t.startsWith('/*') ||
        t.startsWith('*') ||
        t.startsWith('import ') ||
        t.startsWith('type ') ||
        t.startsWith('export type ') ||
        t.startsWith('interface ') ||
        t.startsWith('export interface ');

      if (!skippable && depth === 0 && hookStart.test(t) && !isHookDef.test(t)) {
        let bal = 0;
        let end = -1;
        for (let j = i; j < lines.length && j < i + 50; j++) {
          for (const ch of lines[j]) {
            if (ch === '(' || ch === '[' || ch === '{') bal++;
            else if (ch === ')' || ch === ']' || ch === '}') bal--;
          }
          if (bal === 0 && lines[j].includes(';')) { end = j; break; }
        }
        if (end === -1) return []; // 경계 불명확 → 변환 포기
        blocks.push({ start: i, end });
        i = end + 1; // 균형 문장이라 depth 불변
        continue;
      }

      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      i++;
    }
    return blocks;
  }

  private _applyTemplate(template: string, componentName: string): string {
    const lowerFirst = componentName.charAt(0).toLowerCase() + componentName.slice(1);
    const routePath = componentName
      .replace(/Page$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();

    return template
      .replace(/\{\{ComponentName\}\}/g, componentName)
      .replace(/\{\{componentName\}\}/g, lowerFirst)
      .replace(/\{\{routePath\}\}/g, routePath);
  }
}
