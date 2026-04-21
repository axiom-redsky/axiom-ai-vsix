import * as vscode from 'vscode';

export interface EditorContext {
  available: boolean;
  filePath?: string;
  language?: string;
  content?: string;
  selectedText?: string;
}

export class EditorContextCollector {
  constructor(private readonly maxLines: number = 200) {}

  collect(): EditorContext {
    const editor = vscode.window.activeTextEditor;
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
      language: doc.languageId,
      content,
      selectedText: selectedText || undefined,
    };
  }
}
