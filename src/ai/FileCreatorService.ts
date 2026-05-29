import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
