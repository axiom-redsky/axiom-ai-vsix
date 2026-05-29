import * as vscode from 'vscode';

/**
 * 사용자가 에디터에서 선택한 영역의 구조화된 정보.
 * patch 모드에서 LLM에게 "이 범위만 수정하라" 라고 명확히 지시할 때 사용한다.
 * 라인은 1-based, character는 0-based (VS Code 내부와 동일).
 */
export interface SelectionRange {
  startLine: number;
  endLine: number;
  startCharacter: number;
  endCharacter: number;
  text: string;
  /**
   * 선택 영역을 둘러싼 ±N 라인의 원본 코드 (slicer로 잘려도 살아남는 사본).
   * LLM이 <search> 블록을 작성할 때 그대로 복사해 사용하도록 제공한다.
   */
  contextWindow: string;
  /** contextWindow가 차지하는 첫 라인 (1-based) */
  contextStartLine: number;
  /** contextWindow가 차지하는 끝 라인 (1-based, 포함) */
  contextEndLine: number;
}

/** 선택 영역 주변 contextWindow에 포함시킬 패딩 라인 수 (한쪽 기준) */
const SELECTION_CONTEXT_PADDING = 15;

export interface EditorContext {
  available: boolean;
  filePath?: string;
  absoluteFilePath?: string;
  language?: string;
  content?: string;
  /** 하위 호환용 — 새 코드에서는 selection을 사용 */
  selectedText?: string;
  /** 사용자가 선택한 영역의 라인/컬럼 구조화 정보 */
  selection?: SelectionRange;
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
    const rawSelected = doc.getText(editor.selection);
    const selectedText = rawSelected.trim();
    const totalLines = doc.lineCount;
    const capLine = Math.min(totalLines, this.maxLines);

    let content = doc.getText(
      new vscode.Range(0, 0, capLine - 1, doc.lineAt(capLine - 1).text.length),
    );
    if (totalLines > this.maxLines) {
      content += `\n\n... (${totalLines - this.maxLines}줄 생략됨)`;
    }

    let selection: SelectionRange | undefined;
    if (!editor.selection.isEmpty && selectedText) {
      const selStart0 = editor.selection.start.line;
      const selEnd0 = editor.selection.end.line;
      const ctxStart0 = Math.max(0, selStart0 - SELECTION_CONTEXT_PADDING);
      const ctxEnd0 = Math.min(totalLines - 1, selEnd0 + SELECTION_CONTEXT_PADDING);
      const contextWindow = doc.getText(
        new vscode.Range(ctxStart0, 0, ctxEnd0, doc.lineAt(ctxEnd0).text.length),
      );
      selection = {
        startLine: selStart0 + 1,
        endLine: selEnd0 + 1,
        startCharacter: editor.selection.start.character,
        endCharacter: editor.selection.end.character,
        text: rawSelected,
        contextWindow,
        contextStartLine: ctxStart0 + 1,
        contextEndLine: ctxEnd0 + 1,
      };
    }

    return {
      available: true,
      filePath: vscode.workspace.asRelativePath(doc.uri),
      absoluteFilePath: doc.uri.fsPath,
      language: doc.languageId,
      content,
      selectedText: selectedText || undefined,
      selection,
      isTruncated: totalLines > this.maxLines,
    };
  }
}
