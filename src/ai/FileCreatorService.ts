import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AxiomAction {
  action: 'createFile' | 'updateFile';
  templateType: 'page' | 'component' | 'store' | 'api' | 'router';
  domain: string;
  componentName: string;
  filePath: string;
  generatedCode?: string;
}

export interface CreateFileResult {
  success: boolean;
  cancelled?: boolean;
  filePath?: string;
  error?: string;
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

    // 라우터 파일(router)과 updateFile은 InputBox 없이 자동으로 처리
    const isAutoWrite = action.action === 'updateFile' || action.templateType === 'router';
    return isAutoWrite
      ? this._updateExistingFile(action, workspaceRoot)
      : this._createNewFile(action, workspaceRoot);
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

    try {
      const dirUri = vscode.Uri.joinPath(workspaceRoot, path.dirname(action.filePath));
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(
        targetFileUri,
        Buffer.from(action.generatedCode, 'utf-8'),
      );

      const doc = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(doc);

      return { success: true, filePath: action.filePath };
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
    return template
      .replace(/\{\{ComponentName\}\}/g, componentName)
      .replace(/\{\{componentName\}\}/g, lowerFirst);
  }
}
