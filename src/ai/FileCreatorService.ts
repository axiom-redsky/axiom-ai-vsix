import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AxiomAction {
  action: 'createFile';
  templateType: 'page' | 'component' | 'store' | 'api';
  domain: string;
  componentName: string;
  filePath: string;
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
};

export class FileCreatorService {
  async createFile(action: AxiomAction): Promise<CreateFileResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { success: false, error: '열린 워크스페이스가 없습니다.' };
    }

    const workspaceRoot = workspaceFolders[0].uri;
    const targetFileUri = vscode.Uri.joinPath(workspaceRoot, action.filePath);
    const label = TEMPLATE_LABELS[action.templateType] ?? '파일';

    const confirmAnswer = await vscode.window.showInformationMessage(
      `다음 경로에 ${label}을(를) 생성하시겠습니까?\n\n${action.filePath}`,
      { modal: true },
      '생성',
      '취소',
    );
    if (confirmAnswer !== '생성') {
      return { success: false, cancelled: true };
    }

    try {
      await vscode.workspace.fs.stat(targetFileUri);
      const overwriteAnswer = await vscode.window.showWarningMessage(
        `이미 존재하는 파일입니다. 덮어쓰시겠습니까?\n\n${action.filePath}`,
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
      const template = this._loadTemplate(action.templateType);
      const content = this._applyTemplate(template, action.componentName);

      const dirUri = vscode.Uri.joinPath(workspaceRoot, path.dirname(action.filePath));
      await vscode.workspace.fs.createDirectory(dirUri);
      await vscode.workspace.fs.writeFile(targetFileUri, Buffer.from(content, 'utf-8'));

      const doc = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(doc);

      return { success: true, filePath: action.filePath };
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
