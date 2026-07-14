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

/**
 * "현재 파일"을 어느 폴백 단계에서 잡았는지 — 검출 신뢰도 신호.
 * 위쪽일수록 확실(사용자가 실제로 보고 있는 파일), 아래쪽일수록 추정에 가깝다.
 * 계측([파일검출] 로그)과 향후 S4 되묻기 차등 처리(확정 vs 되묻기 후보)의 재료.
 */
export type FileDetectSource =
  | 'override'      // 핀(chip) 선택 — 사용자가 명시한 범위(가장 확실)
  | 'active-editor' // 활성 텍스트 에디터(포커스 있음)
  | 'active-tab'    // 편집기 영역의 활성 탭(포커스는 웹뷰·터미널 등)
  | 'last-editor'   // 마지막으로 포커스했던 편집기(추정 — 오탐 이력 있음)
  | 'visible-tsx'   // 보이는 편집기 중 코드 파일(.ts/.tsx/.js/.jsx)
  | 'visible-file'; // 보이는 편집기 중 아무 파일

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
  /** 현재 파일을 잡은 폴백 단계(계측·신뢰도 신호). available=false면 없음. */
  detectSource?: FileDetectSource;
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

  collect(override?: { filePath: string; startLine: number; endLine: number }): EditorContext {
    // 핀(chip)으로 전달된 선택을 진실의 원천으로 우선 사용한다. 라이브 에디터 selection은
    // 채팅·다른 파일·Output 패널에 포커스가 가면 비거나 엉뚱해져, 선택 기반 가드(structural
    // 억제·patch·ripple)가 조용히 꺼지는 문제가 있다. override 문서를 못 찾으면 라이브로 폴백.
    if (override) {
      const fromOverride = this._collectFromOverride(override);
      if (fromOverride) return fromOverride;
    }

    // "지금 앞에 열려 있는 페이지"를 최대한 확실하게 고른다. 우선순위:
    //  1) activeTextEditor — 편집기에 실제 포커스가 있을 때(선택 영역까지 유효).
    //  2) 활성 탭(tabGroups.activeTabGroup.activeTab) — 터미널·채팅 웹뷰·출력 패널에 포커스가 가서
    //     activeTextEditor가 비어도, 편집기 영역에 **떠 있는** 파일 탭은 그대로 유지된다. 이게 사용자가
    //     말하는 "현재 화면"의 가장 신뢰할 수 있는 신호다. (_lastEditor는 마지막으로 '포커스'한 편집기라,
    //     다른 파일을 잠깐 눌렀다 터미널로 이동하면 엉뚱한 파일을 가리켜 간헐적 오탐의 원인이 됐다.)
    //  3) _lastEditor — 위가 전부 실패할 때의 최후 편집기.
    //  4) 화면에 떠 있는 코드/파일 편집기(비파일 편집기는 제외 목적으로 .ts/.tsx/.js/.jsx 우선).
    let editor = vscode.window.activeTextEditor;
    let source: FileDetectSource = 'active-editor';
    if (!editor) {
      const tabDoc = this._activeTabDoc();
      const visibleForTab = tabDoc
        ? vscode.window.visibleTextEditors.find((e) => e.document === tabDoc)
        : undefined;
      if (tabDoc && !visibleForTab) {
        // 활성 탭 문서는 있으나 대응하는 보이는 편집기가 없음(희귀) → 문서만으로 구성(선택 영역 없음).
        this._lastEditor = undefined; // 활성 탭이 진실 — 낡은 _lastEditor로 다음 폴백이 새지 않게.
        return this._buildContext(tabDoc, undefined, 'active-tab');
      }
      // 닫힌 문서 stale 가드: 사용자가 그 파일 탭을 닫았으면 _lastEditor는 더 이상 "현재 페이지"의
      // 근거가 못 된다 — 화면에 없는 파일을 편집 대상으로 잡던 오탐 경로를 차단하고 다음 폴백으로.
      if (this._lastEditor?.document.isClosed) this._lastEditor = undefined;
      if (visibleForTab) {
        editor = visibleForTab;
        source = 'active-tab';
      } else if (this._lastEditor) {
        editor = this._lastEditor;
        source = 'last-editor';
      } else {
        const visibleTsx = vscode.window.visibleTextEditors.find((e) =>
          /\.(tsx?|jsx?)$/.test(e.document.fileName),
        );
        if (visibleTsx) {
          editor = visibleTsx;
          source = 'visible-tsx';
        } else {
          editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
          source = 'visible-file';
        }
      }
      if (editor) this._lastEditor = editor;
    }
    if (!editor) return { available: false };

    return this._buildContext(editor.document, editor, source);
  }

  /**
   * 편집기 영역에서 현재 앞에 떠 있는(활성 탭) 파일 문서를 반환한다. 터미널·채팅 웹뷰·출력 패널 등에
   * 포커스가 가서 activeTextEditor가 비어도 활성 탭은 그대로 유지되므로, "지금 보고 있는 페이지"를 가장
   * 확실히 알려준다. 파일 탭이 아니거나(설정·diff·미리보기 등) 아직 문서가 열려 있지 않으면 undefined.
   */
  private _activeTabDoc(): vscode.TextDocument | undefined {
    try {
      const input = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
      if (!(input instanceof vscode.TabInputText)) return undefined;
      if (input.uri.scheme !== 'file') return undefined;
      return vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === input.uri.toString(),
      );
    } catch {
      return undefined; // tabGroups 미지원 구버전 등 — 상위 폴백으로.
    }
  }

  /** 문서(+선택 편집기)로부터 EditorContext를 구성한다. editor가 없으면 선택 영역 없이 내용만 담는다. */
  private _buildContext(
    doc: vscode.TextDocument,
    editor?: vscode.TextEditor,
    source?: FileDetectSource,
  ): EditorContext {
    const totalLines = doc.lineCount;
    const capLine = Math.min(totalLines, this.maxLines);

    let content = doc.getText(
      new vscode.Range(0, 0, capLine - 1, doc.lineAt(capLine - 1).text.length),
    );
    if (totalLines > this.maxLines) {
      content += `\n\n... (${totalLines - this.maxLines}줄 생략됨)`;
    }

    let selection: SelectionRange | undefined;
    let selectedText: string | undefined;
    if (editor && !editor.selection.isEmpty) {
      const rawSelected = doc.getText(editor.selection);
      const trimmed = rawSelected.trim();
      if (trimmed) {
        const selStart0 = editor.selection.start.line;
        const selEnd0 = editor.selection.end.line;
        const ctxStart0 = Math.max(0, selStart0 - SELECTION_CONTEXT_PADDING);
        const ctxEnd0 = Math.min(totalLines - 1, selEnd0 + SELECTION_CONTEXT_PADDING);
        const contextWindow = doc.getText(
          new vscode.Range(ctxStart0, 0, ctxEnd0, doc.lineAt(ctxEnd0).text.length),
        );
        selectedText = trimmed;
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
    }

    return {
      available: true,
      filePath: vscode.workspace.asRelativePath(doc.uri),
      absoluteFilePath: doc.uri.fsPath,
      language: doc.languageId,
      content,
      selectedText,
      selection,
      isTruncated: totalLines > this.maxLines,
      detectSource: source,
    };
  }

  /**
   * 핀(chip)으로 전달된 {filePath, startLine, endLine}을 기준으로 EditorContext를 구성한다.
   * 라이브 에디터 selection이 아니라 이 범위를 선택의 진실로 삼는다.
   * 대상 문서가 열려 있지 않으면 null을 반환해 호출부가 라이브로 폴백하게 한다.
   */
  private _collectFromOverride(
    o: { filePath: string; startLine: number; endLine: number },
  ): EditorContext | null {
    if (!o.filePath || o.startLine < 1 || o.endLine < o.startLine) return null;
    const doc = vscode.workspace.textDocuments.find(
      (d) => vscode.workspace.asRelativePath(d.uri) === o.filePath,
    );
    if (!doc) return null;

    const totalLines = doc.lineCount;
    const selStart0 = Math.max(0, o.startLine - 1);
    const selEnd0 = Math.min(totalLines - 1, o.endLine - 1);
    if (selStart0 > selEnd0) return null;

    const selRange = new vscode.Range(selStart0, 0, selEnd0, doc.lineAt(selEnd0).text.length);
    const rawSelected = doc.getText(selRange);
    const selectedText = rawSelected.trim();

    const capLine = Math.min(totalLines, this.maxLines);
    let content = doc.getText(
      new vscode.Range(0, 0, capLine - 1, doc.lineAt(capLine - 1).text.length),
    );
    if (totalLines > this.maxLines) {
      content += `\n\n... (${totalLines - this.maxLines}줄 생략됨)`;
    }

    const ctxStart0 = Math.max(0, selStart0 - SELECTION_CONTEXT_PADDING);
    const ctxEnd0 = Math.min(totalLines - 1, selEnd0 + SELECTION_CONTEXT_PADDING);
    const contextWindow = doc.getText(
      new vscode.Range(ctxStart0, 0, ctxEnd0, doc.lineAt(ctxEnd0).text.length),
    );

    return {
      available: true,
      filePath: vscode.workspace.asRelativePath(doc.uri),
      absoluteFilePath: doc.uri.fsPath,
      language: doc.languageId,
      content,
      selectedText: selectedText || undefined,
      selection: selectedText
        ? {
            startLine: selStart0 + 1,
            endLine: selEnd0 + 1,
            startCharacter: 0,
            endCharacter: doc.lineAt(selEnd0).text.length,
            text: rawSelected,
            contextWindow,
            contextStartLine: ctxStart0 + 1,
            contextEndLine: ctxEnd0 + 1,
          }
        : undefined,
      isTruncated: totalLines > this.maxLines,
      detectSource: 'override',
    };
  }
}
