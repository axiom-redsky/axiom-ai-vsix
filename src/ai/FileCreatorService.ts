import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { splitTsSections } from './CodeSectionExtractor';

/**
 * 한 응답 안에 들어가는 patch 단위. 모델이 출력한 `<patch><search>...</search><replace>...</replace></patch>`
 * 한 쌍에 대응한다. 다중 patch 응답이면 patches 배열에 N개 들어간다.
 */
export interface PatchBlock {
  search: string;
  replace: string;
}

export interface AxiomAction {
  action: 'createFile' | 'updateFile';
  templateType: 'page' | 'component' | 'store' | 'api' | 'router';
  domain: string;
  componentName: string;
  filePath: string;
  /** 'patch': search/replace 부분 교체, 'full': 전체 파일 재작성 (기본값) */
  mode?: 'full' | 'patch';
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
   */
  reason?: 'not-found' | 'overlap' | 'ambiguous' | 'selection-mismatch';
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
    if (patches.length === 0) return { text: null, results: [] };

    const hasCRLF = original.includes('\r\n');
    const normOrig = hasCRLF ? original.replace(/\r\n/g, '\n') : original;
    const originalLines = normOrig.split('\n');

    type Resolved = { index: number; startLine: number; endLine: number; replaceLines: string[] };
    const resolved: Resolved[] = [];
    const results: PatchApplyResult[] = [];

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
      return { text: null, results };
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
        return { text: null, results };
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
    return { text, results };
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
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 빈 줄, import, 주석, type/interface 선언은 brace만 카운트하고 건너뜀
      if (
        trimmed === '' ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('type ') ||
        trimmed.startsWith('export type ') ||
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('export interface ')
      ) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
        continue;
      }

      // 커스텀 훅 정의(function useXxx / const useXxx =)는 호출이 아니므로 건너뜀
      if (
        trimmed.match(/^(export\s+)?(default\s+)?function\s+use[A-Z]/) ||
        trimmed.match(/^(export\s+)?const\s+use[A-Z]\w*\s*=/)
      ) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
        continue;
      }

      const depthBefore = braceDepth;
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }

      // 모듈 최상위(depth 0)에서 훅 호출 패턴 감지
      if (depthBefore === 0) {
        // use*(...) 또는 use*<Generic>(...) 모두 매칭 (제네릭 타입 인자 포함)
        const hookCallMatch = trimmed.match(/\b(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/);
        if (hookCallMatch) {
          const hookName = hookCallMatch[1];
          return `라인 ${i + 1}에서 \`${hookName}\`이 모듈 최상위(컴포넌트 함수 밖)에서 호출됨`;
        }
      }
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
