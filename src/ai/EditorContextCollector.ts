import * as vscode from 'vscode';

export interface EditorContext {
  available: boolean;
  filePath?: string;
  absoluteFilePath?: string;
  language?: string;
  content?: string;
  selectedText?: string;
  isTruncated?: boolean;
}

export class EditorContextCollector {
  private _lastEditor: vscode.TextEditor | undefined;

  constructor(private readonly maxLines: number = 200) {
    this._lastEditor = vscode.window.activeTextEditor;
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this._lastEditor = editor;
      }
    });
  }

  collect(): EditorContext {
    // 채팅 웹뷰에 포커스가 가면 activeTextEditor가 undefined가 되므로 마지막 유효한 에디터를 사용
    const editor = vscode.window.activeTextEditor ?? this._lastEditor;
    if (!editor) return { available: false };

    const doc = editor.document;
    const selectedText = doc.getText(editor.selection).trim();
    const totalLines = doc.lineCount;
    const capLine = Math.min(totalLines, this.maxLines);

    let content = doc.getText(
      new vscode.Range(0, 0, capLine - 1, doc.lineAt(capLine - 1).text.length),
    );
    if (totalLines > this.maxLines) {
      content += `\n\n... (${totalLines - this.maxLines}줄 생략됨)`;
    }

    return {
      available: true,
      filePath: vscode.workspace.asRelativePath(doc.uri),
      absoluteFilePath: doc.uri.fsPath,
      language: doc.languageId,
      content,
      selectedText: selectedText || undefined,
      isTruncated: totalLines > this.maxLines,
    };
  }
}
