import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AxiomAction {
  action: 'createFile' | 'updateFile';
  templateType: 'page' | 'component' | 'store' | 'api' | 'router';
  domain: string;
  componentName: string;
  filePath: string;
  /** 'patch': search/replace 부분 교체, 'full': 전체 파일 재작성 (기본값) */
  mode?: 'full' | 'patch';
  generatedCode?: string;
  searchCode?: string;
  replaceCode?: string;
  /** true이면 InputBox 없이 자동 저장 (페이지 생성 플로우에서 도메인 이미 확인된 경우) */
  autoWrite?: boolean;
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

  /** 파일 내용만 읽는다. 쓰지 않음. 컨펌 플로우에서 원본 확보용으로 사용. */
  async readFileContent(action: AxiomAction): Promise<{ originalContent?: string; error?: string }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { error: '열린 워크스페이스가 없습니다.' };
    }
    const targetFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, action.filePath);
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
