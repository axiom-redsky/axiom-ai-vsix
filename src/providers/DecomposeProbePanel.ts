import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  tokenizeQuery,
  extractApiPaths,
  splitIntoSections,
  scoreSections,
  selectByBudget,
} from '../ai/decompose/SectionExtractor';
import {
  splitTsSections,
  scoreCodeSections,
  sliceByBudget,
  extractRelevantTsSlice,
  stripSliceStubs,
} from '../ai/decompose/CodeSectionExtractor';
import { impliedControlTags } from '../ai/decompose/RegionIntent';
import type {
  WebviewToHostMessage,
  HostToWebviewMessage,
  DecomposeProbeResult,
  DecomposeToken,
  DecomposeSection,
  DecomposeReference,
} from '../types/messages';

/**
 * 단계별 테스트 ② 분해 — 에디터 탭(WebviewPanel) 페이지.
 *
 * 목적: 프롬프트(+현재 파일)를 넣으면 decompose 층이 "sLLM에 줄 재료"로 어떻게 쪼개는지를
 * 두 갈래로 나란히 보여준다. **운영 코드 미러가 아니라 export된 순수 함수를 직접 호출**하므로
 * (IntentProbePanel과 달리) 동기화 드리프트 위험이 없다 — 화면에 뜬 결과가 곧 운영 산출물이다.
 *
 *  - 갈래 1(쿼리 분해): tokenizeQuery(한국어 조사 어근 분해) · extractApiPaths(정확 경로) ·
 *    impliedControlTags(함의 컨트롤 태그)
 *  - 갈래 2(코드·배경 분해): splitTsSections(선언 단위 분할) → scoreCodeSections(쿼리 점수) →
 *    sliceByBudget(글자 예산 안에서 선택·나머지는 stub) — dietRatio로 다이어트 강도 확인
 *
 * 판정·측정만 하며 파일·라우팅·모델 호출은 없다(모델 무관 결정론 층).
 */
export class DecomposeProbePanel {
  public static readonly viewType = 'axiom-ai.decomposeProbePanel';
  private static _current: DecomposeProbePanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (DecomposeProbePanel._current) {
      DecomposeProbePanel._current._panel.reveal();
      return;
    }
    // 패널이 활성 탭이 되면 activeTextEditor가 비므로, 생성 **직전**의 활성 파일을 시드로 기억한다.
    const seedDoc = vscode.window.activeTextEditor?.document;
    const seedFile = seedDoc && seedDoc.uri.scheme === 'file' ? seedDoc.fileName : null;
    const panel = vscode.window.createWebviewPanel(
      DecomposeProbePanel.viewType,
      '2. 분해 테스트',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    DecomposeProbePanel._current = new DecomposeProbePanel(panel, extensionUri, seedFile);
  }

  /** 패널 생성 직전~생존 중 마지막으로 활성이던 텍스트 파일(폴백 ④의 재료). */
  private _lastEditorFile: string | null;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    seedEditorFile: string | null = null,
  ) {
    this._lastEditorFile = seedEditorFile;
    _panel.webview.html = this._buildHtml(_panel.webview);
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e && e.document.uri.scheme === 'file') this._lastEditorFile = e.document.fileName;
      }),
    );
    _panel.onDidDispose(() => {
      DecomposeProbePanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });
    _panel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'decomposeProbeUseActiveFile':
          this._useActiveFile();
          break;
        case 'runDecomposeProbe':
          this._run(msg.query, msg.filePath, msg.budget, msg.selStart, msg.selEnd, msg.refPath);
          break;
      }
    });
  }

  /**
   * "열린 파일 가져오기" — 이 패널이 활성 탭이라 activeTextEditor가 비기 쉽다
   * (modify→create leak 메모리의 함정과 동일). IntentProbePanel과 동일한 폴백 사슬.
   */
  private _useActiveFile(): void {
    const resolved = this._resolveEditorFile();
    if (resolved) {
      this._post({ type: 'decomposeProbeFilePicked', filePath: this._toWorkspaceRel(resolved) });
    } else {
      this._post({ type: 'decomposeProbeError', message: '열린 텍스트 파일을 찾지 못했습니다. 경로를 직접 입력하세요.' });
    }
  }

  private _resolveEditorFile(): string | null {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file') return active.fileName;
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
    if (visible) return visible.document.fileName;
    for (const group of vscode.window.tabGroups.all) {
      const input = group.activeTab?.input;
      if (input instanceof vscode.TabInputText && input.uri.scheme === 'file') return input.uri.fsPath;
    }
    if (this._lastEditorFile && fs.existsSync(this._lastEditorFile)) return this._lastEditorFile;
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
          return tab.input.uri.fsPath;
        }
      }
    }
    return null;
  }

  private _run(
    query: string,
    filePathRaw: string,
    budget: number,
    selStart: number,
    selEnd: number,
    refPathRaw: string,
  ): void {
    if (!query.trim()) {
      this._post({ type: 'decomposeProbeError', message: '프롬프트를 입력하세요.' });
      return;
    }

    // ── 갈래 1: 쿼리 분해 (파일 없이도 항상 산출) ──
    const tokens = this._tokenizeWithStemFlags(query);
    const apiPaths = extractApiPaths(query);
    const controlTags = impliedControlTags(query);
    const tokenStrings = tokens.map((t) => t.token);

    // ── 갈래 2: 코드·배경 분해 (현재 파일이 TS/TSX일 때만) ──
    let file: DecomposeProbeResult['file'] = null;
    let sections: DecomposeSection[] = [];
    let slice: DecomposeProbeResult['slice'] = null;
    let note: string | undefined;

    const filePath = filePathRaw.trim();
    if (!filePath) {
      note = '현재 파일 없음 — 쿼리 분해만 표시합니다. (코드·배경 분해는 열린 TS/TSX 파일이 필요)';
    } else {
      const abs = this._toAbsolutePath(filePath);
      const isTs = /\.(tsx?|jsx?)$/i.test(abs);
      let source = '';
      try {
        source = fs.readFileSync(abs, 'utf8');
      } catch {
        note = `파일을 읽지 못했습니다: ${filePath}`;
      }
      if (source) {
        const lines = source.split('\n').length;
        file = { path: this._toWorkspaceRel(abs), chars: source.length, lines, isTs };
        if (!isTs) {
          note = '현재 파일이 TS/TSX/JS가 아니라 코드 섹션 분해를 건너뜁니다.';
        } else {
          const selection =
            selStart > 0 && selEnd >= selStart ? { startLine: selStart, endLine: selEnd } : undefined;
          const secs = splitTsSections(source);
          scoreCodeSections(secs, tokenStrings, selection);
          const budgetSafe = budget > 0 ? budget : 4000;
          const sliceResult = sliceByBudget(secs, budgetSafe);
          // 포함 여부는 실제 산출 텍스트에서 판정 — 제외 섹션은 stub `// ... [kind name] …` 또는
          // 그룹 표식 `[보존 Ls~Le]`(D3, groupedRanges로 역판정)로 나온다.
          // (sliceByBudget 내부 includedIds를 밖으로 새로 계산하지 않고 실 출력으로 역판정 = 드리프트 0)
          sections = secs.map((s) => ({
            name: s.name,
            kind: s.kind,
            startLine: s.startLine,
            endLine: s.endLine,
            length: s.length,
            score: s.score,
            included:
              !sliceResult.text.includes(`// ... [${s.kind} ${s.name}]`) &&
              !sliceResult.groupedRanges.some(
                (g) => s.startLine >= g.startLine && s.endLine <= g.endLine,
              ),
          }));
          slice = {
            budget: budgetSafe,
            includedCount: sliceResult.includedCount,
            skippedCount: sliceResult.skippedCount,
            totalChars: sliceResult.totalChars,
            dietRatio: source.length > 0 ? +(sliceResult.totalChars / source.length).toFixed(3) : 0,
            text: sliceResult.text,
          };
        }
      }
    }

    // ── 참조 파일 슬라이싱 (Q3): 프롬프트에 명시하는 스펙/타입 파일을 예산에 맞게 관련 조각만 ──
    const reference = this._buildReference(refPathRaw.trim(), tokenStrings, apiPaths, budget);

    const result: DecomposeProbeResult = {
      query,
      tokens,
      apiPaths,
      controlTags,
      file,
      sections,
      slice,
      reference,
      note,
    };
    this._post({ type: 'decomposeProbeResult', result });
    this._post({ type: 'decomposeProbeDone' });
  }

  /**
   * 프롬프트에 명시한 참조 파일(스펙/타입)을 운영 `_loadReferencedFiles`와 **동일한 결정론 함수**로
   * 예산에 맞게 줄인 결과를 만든다(Q3). 코드 파일은 `extractRelevantTsSlice`(앞잘림 대신 관련 섹션),
   * 마크다운은 `splitIntoSections`→`scoreSections`→`selectByBudget`. 그 외 파일은 앞잘림(대조군).
   * "앞잘림이었으면 잃었을 조각"(컷오프 뒤의 포함 섹션)을 함께 계산해 개선 효과를 보인다.
   */
  private _buildReference(
    refPath: string,
    queryTokens: string[],
    apiPaths: string[],
    budget: number,
  ): DecomposeReference | null {
    if (!refPath) return null;
    const abs = this._toAbsolutePath(refPath);
    let content = '';
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      return {
        path: refPath,
        chars: 0,
        lines: 0,
        kind: 'other',
        budget,
        wholeInjected: false,
        note: `파일을 읽지 못했습니다: ${refPath}`,
      };
    }

    const rel = this._toWorkspaceRel(abs);
    const lines = content.split('\n').length;
    const budgetSafe = budget > 0 ? budget : 8000;
    const isMd = /\.(md|markdown)$/i.test(rel);
    const isCode = /\.(tsx?|jsx?)$/i.test(rel);
    const kind: DecomposeReference['kind'] = isMd ? 'markdown' : isCode ? 'code' : 'other';
    const base: DecomposeReference = { path: rel, chars: content.length, lines, kind, budget: budgetSafe, wholeInjected: false };

    // 예산 이하면 운영도 통째 주입 — 슬라이싱 불필요.
    if (content.length <= budgetSafe) {
      return { ...base, wholeInjected: true, note: '예산 이하 — 통째로 주입됩니다(슬라이싱 불필요).' };
    }

    if (isCode) {
      const slice = extractRelevantTsSlice(content, queryTokens, budgetSafe);
      // 운영 _loadReferencedFiles와 동일하게 stub을 접어 실제 주입 크기를 반영(예산 이하 보장).
      const lean = stripSliceStubs(slice.text);
      // 각 줄의 시작 글자 오프셋 — 앞잘림 컷오프(budget) 뒤에 있는 포함 섹션 = 앞잘림이었으면 잃었을 조각.
      const secs = splitTsSections(content);
      const lineOffsets: number[] = [];
      let acc = 0;
      for (const ln of content.split('\n')) {
        lineOffsets.push(acc);
        acc += ln.length + 1;
      }
      const savedFromTailNames: string[] = [];
      for (const s of secs) {
        const included = !slice.text.includes(`// ... [${s.kind} ${s.name}]`);
        const offset = lineOffsets[s.startLine - 1] ?? 0;
        if (included && offset >= budgetSafe) savedFromTailNames.push(`${s.kind} ${s.name}`);
      }
      return {
        ...base,
        code: {
          includedCount: slice.includedCount,
          skippedCount: slice.skippedCount,
          injectedChars: lean.text.length,
          savedFromTailCount: savedFromTailNames.length,
          savedFromTailNames,
          text: lean.text,
        },
      };
    }

    if (isMd) {
      const sections = splitIntoSections(rel, content);
      scoreSections(sections, queryTokens, apiPaths);
      const picked = selectByBudget(sections, budgetSafe, 1);
      const pickedSet = new Set(picked);
      return {
        ...base,
        markdown: {
          pickedCount: picked.length,
          droppedCount: sections.length - picked.length,
          pickedHeaders: picked.map((s) => s.header.replace(/^#+\s*/, '').slice(0, 48) || '(도입부)'),
        },
        note: sections.filter((s) => !pickedSet.has(s)).length > 0 ? undefined : '전 섹션이 예산 안에 들어감.',
      };
    }

    // 코드도 md도 아님 — 운영은 앞잘림. 대조군으로 그대로 표기.
    return { ...base, note: `코드/마크다운이 아니라 앞부분 ${budgetSafe}자만 주입됩니다(앞잘림).` };
  }

  /**
   * tokenizeQuery 결과에 "조사를 벗겨 추가된 어근"인지 표시를 붙인다.
   * 원본 분할(조사 유지)에 없던 토큰 = 조사 어근이다. 분할 정규식은 SectionExtractor.tokenizeQuery와
   * 동일하게 유지한다(표시용 파생 — 함수 변경 시 이 정규식도 맞춰야 함).
   */
  private _tokenizeWithStemFlags(query: string): DecomposeToken[] {
    const rawSplit = new Set(
      query
        .toLowerCase()
        .split(/[\s,.\/·ㆍ‧•…()[\]{}<>"'`?!:;|+*=&^%$#@~\\-]+/)
        .filter((t) => t.length >= 2),
    );
    return tokenizeQuery(query).map((token) => ({ token, isStem: !rawSplit.has(token) }));
  }

  private _toAbsolutePath(rel: string): string {
    if (path.isAbsolute(rel)) return rel;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return wsRoot ? path.join(wsRoot, rel) : rel;
  }

  private _toWorkspaceRel(fileName: string): string {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return fileName;
    const rel = path.relative(wsRoot, fileName);
    return rel.startsWith('..') ? fileName.replace(/\\/g, '/') : rel.replace(/\\/g, '/');
  }

  private _post(msg: HostToWebviewMessage): void {
    this._panel.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));
    const nonce = Array.from(
      { length: 32 },
      () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
    ).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>분해 테스트</title>
</head>
<body data-mode="decompose-probe">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
