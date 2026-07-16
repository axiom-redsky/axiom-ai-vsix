import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  SCAFFOLD_CONTRACTS,
  selectScaffoldContracts,
  buildContractSection,
  contractsRequirePatchMode,
  componentReplacementTargets,
  type IContractContext,
} from '../ai/contracts/ScaffoldContracts';
import {
  detectComponentsInRegion,
  buildComponentPropsSectionForRegion,
} from '../ai/contracts/ComponentPropsIndex';
import { estimateTokens, inputBudget, budgetUsagePct } from '../ai/contracts/promptBudget';
import type {
  WebviewToHostMessage,
  HostToWebviewMessage,
  ContractsProbeResult,
  ContractsProbeCard,
} from '../types/messages';

/**
 * 단계별 테스트 ④ 설명서 삽입 — 에디터 탭(WebviewPanel) 페이지.
 *
 * 목적: 프롬프트(+현재 파일, 선택 줄 범위)를 넣으면 contracts 층이 sLLM 프롬프트에
 * **무엇을 왜 끼워 넣는지**를 보여준다. ②③ 패널과 동일 원칙 — 운영 코드 미러가 아니라
 * export된 순수 함수를 직접 호출하므로 동기화 드리프트가 없다(화면 결과 = 운영 산출물).
 *
 *  - 계약카드: 전 카드(레지스트리 순)의 발동/미발동 + 발동 근거(ablation — 같은 applies를
 *    입력만 비워 재호출: 쿼리만/코드만/영역만) + buildContractSection 조립 전문
 *  - 파생 신호: requiresPatchMode(structural 메뉴 제거)·swapTargets(루트 교체 화이트리스트)
 *  - prop 표: detectComponentsInRegion(존재 기반) + 인덱스에 없는 태그(재생성 후보 신호)
 *  - 토큰 비용: promptBudget 단일 추정기로 주입 합계의 예산 점유율
 *
 * ⚠ deps 주의: region 경로의 실제 deps는 locate가 가지치기한 depsHeader지만(③ 소관),
 * 여기선 파일 전체를 deps로 쓴다 — 선택/full/오프라인 경로의 주입 방식과 동일하며,
 * 발동 관찰엔 상위집합이라 보수적(오발동을 놓치지 않는 방향)이다.
 */
export class ContractsProbePanel {
  public static readonly viewType = 'axiom-ai.contractsProbePanel';
  private static _current: ContractsProbePanel | undefined;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (ContractsProbePanel._current) {
      ContractsProbePanel._current._panel.reveal();
      return;
    }
    // 패널이 활성 탭이 되면 activeTextEditor가 비므로, 생성 **직전**의 활성 파일을 시드로 기억한다.
    const seedDoc = vscode.window.activeTextEditor?.document;
    const seedFile = seedDoc && seedDoc.uri.scheme === 'file' ? seedDoc.fileName : null;
    const panel = vscode.window.createWebviewPanel(
      ContractsProbePanel.viewType,
      '4. 설명서 삽입 테스트',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    ContractsProbePanel._current = new ContractsProbePanel(panel, extensionUri, seedFile);
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
      ContractsProbePanel._current = undefined;
      for (const d of this._disposables) d.dispose();
    });
    _panel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'contractsProbeUseActiveFile':
          this._useActiveFile();
          break;
        case 'runContractsProbe':
          this._run(msg.query, msg.filePath, msg.selStart, msg.selEnd);
          break;
      }
    });
  }

  /** "열린 파일 가져오기" — 패널이 활성 탭이라 activeTextEditor가 비기 쉽다(②③과 동일 폴백 사슬). */
  private _useActiveFile(): void {
    const resolved = this._resolveEditorFile();
    if (resolved) {
      this._post({ type: 'contractsProbeFilePicked', filePath: this._toWorkspaceRel(resolved) });
    } else {
      this._post({ type: 'contractsProbeError', message: '열린 텍스트 파일을 찾지 못했습니다. 경로를 직접 입력하세요.' });
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

  private _run(query: string, filePathRaw: string, selStart: number, selEnd: number): void {
    if (!query.trim()) {
      this._post({ type: 'contractsProbeError', message: '프롬프트를 입력하세요.' });
      return;
    }

    // ── 입력 조립: deps=파일 전체, region=선택 줄 텍스트(없으면 '') ──
    let file: ContractsProbeResult['file'] = null;
    let regionInfo: ContractsProbeResult['region'] = null;
    let deps = '';
    let region = '';
    let note: string | undefined;

    const filePath = filePathRaw.trim();
    if (filePath) {
      const abs = this._toAbsolutePath(filePath);
      let source = '';
      try {
        source = fs.readFileSync(abs, 'utf8');
      } catch {
        note = `파일을 읽지 못했습니다: ${filePath}`;
      }
      if (source) {
        const lines = source.split('\n');
        file = { path: this._toWorkspaceRel(abs), chars: source.length, lines: lines.length };
        deps = source;
        if (selStart > 0 && selEnd >= selStart) {
          const s = Math.min(selStart, lines.length);
          const e = Math.min(selEnd, lines.length);
          region = lines.slice(s - 1, e).join('\n');
          regionInfo = { startLine: s, endLine: e, chars: region.length };
        }
      }
    } else {
      note = '현재 파일 없음 — 쿼리 트리거만 판정합니다(코드·영역 트리거는 파일이 필요).';
    }

    const ctx: IContractContext = { deps, region, query };

    // ── 계약카드: 전 카드 발동 판정 + ablation(같은 applies를 입력만 비워 재호출 — 미러 아님) ──
    const firedSet = new Set(selectScaffoldContracts(ctx).map((c) => c.id));
    const safeApplies = (c: (typeof SCAFFOLD_CONTRACTS)[number], probe: IContractContext): boolean => {
      try {
        return c.applies(probe);
      } catch {
        return false;
      }
    };
    const cards: ContractsProbeCard[] = SCAFFOLD_CONTRACTS.map((c) => ({
      id: c.id,
      title: c.title,
      fired: firedSet.has(c.id),
      byQueryOnly: safeApplies(c, { deps: '', region: '', query }),
      byDepsOnly: safeApplies(c, { deps, region: '', query: '' }),
      byRegionOnly: safeApplies(c, { deps: '', region, query: '' }),
      requiresPatchMode: c.requiresPatchMode === true,
      replacesRegionRootWith: c.replacesRegionRootWith ?? null,
      chars: c.card.length,
    }));

    const contractText = buildContractSection(ctx);

    // ── prop 표: 존재 기반 주입(운영 규칙 그대로 — region 있으면 region, 없으면 파일 전체) ──
    const propsSource = region || deps;
    const detected = detectComponentsInRegion(propsSource);
    const propsText = buildComponentPropsSectionForRegion(propsSource);
    // 인덱스에 없는 PascalCase 태그 — 인덱스 공백(재생성/TARGET_FILES 후보) 신호(표시용 스캔).
    // JSX 태그는 식별자 문자 바로 뒤에 올 수 없다 — `useApi<TDeptResponse>` 같은 제네릭 인자를
    // 태그로 오인해 신호 채널이 타입 이름으로 도배되던 오탐을 앞글자 검사로 차단(리로드 실측 관찰).
    const unknownTags: string[] = [];
    const tagRe = /<([A-Z][A-Za-z0-9]*)/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(propsSource)) !== null) {
      const prev = m.index > 0 ? propsSource[m.index - 1] : '';
      if (/[A-Za-z0-9_$]/.test(prev)) continue;
      if (!detected.includes(m[1]) && !unknownTags.includes(m[1])) unknownTags.push(m[1]);
    }

    // ── 토큰 비용: promptBudget 단일 추정기 ──
    const totalTokens = estimateTokens(contractText) + estimateTokens(propsText);
    const budget = inputBudget();

    const result: ContractsProbeResult = {
      query,
      file,
      region: regionInfo,
      cards,
      firedCount: firedSet.size,
      contractSection: { text: contractText, chars: contractText.length, tokens: estimateTokens(contractText) },
      props: {
        detected,
        unknownTags,
        text: propsText,
        chars: propsText.length,
        tokens: estimateTokens(propsText),
      },
      requiresPatchMode: contractsRequirePatchMode(ctx),
      swapTargets: componentReplacementTargets(ctx),
      budget: { totalTokens, usableInput: budget.usableInput, pct: budgetUsagePct(totalTokens, budget) },
      note,
    };
    this._post({ type: 'contractsProbeResult', result });
    this._post({ type: 'contractsProbeDone' });
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
  <title>설명서 삽입 테스트</title>
</head>
<body data-mode="contracts-probe">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
