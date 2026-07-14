import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildIntentPrompt, parseIntent, type IntentContext, type IntentResult } from '../ai/intent/IntentClassifier';
import { classifyOfflineIntent } from '../ai/intent/IntentSignals';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { LlmService } from '../ai/pipeline/LlmService';
import type { ChatMessage } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, IntentProbeResult, IntentProbeIntent } from '../types/messages';

/**
 * 단계별 테스트 ① 의도파악 — 에디터 탭(WebviewPanel) 페이지.
 *
 * 목적: 프롬프트 하나를 넣으면 의도파악 층의 두 판정 경로를 나란히 보여준다.
 *  - 모델 분류기: buildIntentPrompt → LlmService.streamChat('}' 조기종료) → parseIntent
 *    (⚠ ChatViewProvider._classifyIntent와 동일 규칙의 미러 — 그쪽 변경 시 여기도 동기화)
 *  - 정규식 폴백: classifyOfflineIntent — 운영 함수 그대로 호출(미러 아님)
 *  - 최종 채택(effective)은 S1 라우팅측정과 동일 규칙(분류기 확신 시 그 결과, 아니면 정규식).
 *
 * 두 판정이 갈라지면 ⚠ 불일치로 강조한다 — 재설계 트랙 S5가 기다리는 divergence 데이터를
 * 실사용 로그 축적 없이 능동적으로 채집하는 도구 역할(계기판이자 수집기).
 * 판정만 하고 파일·라우팅에는 아무 영향이 없다.
 */
export class IntentProbePanel {
  public static readonly viewType = 'axiom-ai.intentProbePanel';
  private static _current: IntentProbePanel | undefined;

  private readonly _llm: LlmService;

  static createOrShow(extensionUri: vscode.Uri): void {
    if (IntentProbePanel._current) {
      IntentProbePanel._current._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      IntentProbePanel.viewType,
      '1. 의도파악 테스트',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    IntentProbePanel._current = new IntentProbePanel(panel, extensionUri);
  }

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
  ) {
    this._llm = new LlmService(_extensionUri);
    _panel.webview.html = this._buildHtml(_panel.webview);
    _panel.onDidDispose(() => {
      IntentProbePanel._current = undefined;
    });
    _panel.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'intentProbeUseActiveFile':
          this._useActiveFile();
          break;
        case 'runIntentProbe':
          await this._run(msg.query, msg.currentFile, msg.hasSelection);
          break;
      }
    });
  }

  /**
   * "열린 파일 가져오기" — 이 패널 자체가 활성 탭이라 activeTextEditor가 비기 쉽다
   * (modify→create leak 메모리의 함정과 동일). 보이는 에디터 → 다른 탭그룹의 활성 텍스트 탭
   * 순으로 폴백한다.
   */
  private _useActiveFile(): void {
    const resolved = this._resolveEditorFile();
    if (resolved) {
      this._post({ type: 'intentProbeFilePicked', filePath: this._toWorkspaceRel(resolved) });
    } else {
      this._post({ type: 'intentProbeError', message: '열린 텍스트 파일을 찾지 못했습니다. 경로를 직접 입력하세요.' });
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
    return null;
  }

  private async _run(query: string, currentFileRaw: string, hasSelection: boolean): Promise<void> {
    if (!query.trim()) {
      this._post({ type: 'intentProbeError', message: '프롬프트를 입력하세요.' });
      return;
    }

    const currentFile = currentFileRaw.trim() ? this._toWorkspaceRel(currentFileRaw.trim()) : null;
    const ctx: IntentContext = {
      currentFile,
      hasSelection,
      domains: this._scanWorkspaceDomains(),
    };

    // ① 모델에 실제로 나가는 분류 프롬프트(운영 buildIntentPrompt 그대로).
    const prompt = buildIntentPrompt(query, ctx);
    // ② 정규식 통합 폴백 — 결정론이라 즉시.
    const offline = classifyOfflineIntent(query, ctx);
    // ③ 모델 분류기 — 운영 _classifyIntent와 동일 규칙(시스템 프롬프트·'}' 조기종료·폴백 시 null).
    const model = await this._callClassifier(prompt);

    // ④ 최종 채택 — S1 effectiveIntent와 동일 규칙.
    const classifierConfident = model.result !== null && model.result.intent !== 'other';
    const effective = classifierConfident
      ? { source: 'classifier' as const, intent: (model.result as IntentResult).intent as string }
      : { source: 'regex' as const, intent: offline.intent as string };

    // ⑤ 모델 vs 정규식 비교 — intent 불일치가 핵심 수집 대상, 슬롯 차이는 참고 노트.
    const agreement = this._compare(model.result, offline);

    const result: IntentProbeResult = {
      query,
      ctx: { currentFile, hasSelection, domains: ctx.domains },
      prompt,
      model: {
        status: model.status,
        raw: model.raw,
        elapsedMs: model.elapsedMs,
        result: model.result ? this._toSlim(model.result) : null,
        error: model.error,
      },
      offline: { strength: offline.strength, result: this._toSlim(offline) },
      effective,
      agreement,
    };
    this._post({ type: 'intentProbeResult', result });
    this._post({ type: 'intentProbeDone' });
  }

  private async _callClassifier(prompt: string): Promise<{
    status: 'ok' | 'offline' | 'parse-fail' | 'error';
    raw: string;
    elapsedMs: number;
    result: IntentResult | null;
    error?: string;
  }> {
    const config = ExtensionConfig.getEffectiveLlmConfig();
    const messages: ChatMessage[] = [
      { role: 'system', content: '당신은 의도 분류기입니다. JSON 한 줄만 출력하세요.' },
      { role: 'user', content: prompt },
    ];
    const started = Date.now();
    const ctrl = new AbortController();
    try {
      let fellBack = false;
      let out = '';
      for await (const token of this._llm.streamChat(messages, config, ctrl.signal, () => { fellBack = true; })) {
        out += token;
        // JSON 한 줄이면 충분 — 닫는 중괄호가 오면 조기 종료(운영과 동일, 토큰 절약).
        if (out.includes('}')) { ctrl.abort(); break; }
      }
      const elapsedMs = Date.now() - started;
      if (fellBack) return { status: 'offline', raw: out, elapsedMs, result: null };
      const result = parseIntent(out);
      if (!result) return { status: 'parse-fail', raw: out, elapsedMs, result: null };
      return { status: 'ok', raw: out, elapsedMs, result };
    } catch (e) {
      return { status: 'error', raw: '', elapsedMs: Date.now() - started, result: null, error: (e as Error).message };
    }
  }

  private _compare(
    model: IntentResult | null,
    offline: IntentResult,
  ): IntentProbeResult['agreement'] {
    if (!model) {
      return { comparable: false, intentMatch: false, notes: ['모델 판정 없음(연결 안 됨/파싱 실패) — 정규식 판정만 유효'] };
    }
    const notes: string[] = [];
    const intentMatch = model.intent === offline.intent;
    if (!intentMatch) {
      notes.push(`의도 불일치: 모델=${model.intent} ↔ 정규식=${offline.intent} (S1 수집 대상)`);
    }
    const slots: Array<keyof IntentProbeIntent> = ['pageName', 'domain', 'targetFile', 'targetComponent', 'contentSource'];
    for (const key of slots) {
      const a = (model as unknown as IntentProbeIntent)[key];
      const b = (offline as unknown as IntentProbeIntent)[key];
      if ((a ?? null) !== (b ?? null)) notes.push(`슬롯 차이 ${key}: 모델=${a ?? 'null'} ↔ 정규식=${b ?? 'null'}`);
    }
    return { comparable: true, intentMatch, notes };
  }

  private _toSlim(r: IntentResult): IntentProbeIntent {
    return {
      intent: r.intent,
      pageName: r.pageName,
      domain: r.domain,
      contentSource: r.contentSource,
      targetFile: r.targetFile,
      targetComponent: r.targetComponent,
    };
  }

  /** ChatViewProvider._scanWorkspaceDomains의 경량 미러(작은 유틸 — private라 재사용 불가). */
  private _scanWorkspaceDomains(): string[] {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return [];
    const domainsDir = path.join(wsRoot, 'src', 'domains');
    if (!fs.existsSync(domainsDir)) return [];
    try {
      return fs.readdirSync(domainsDir).filter((name) =>
        fs.statSync(path.join(domainsDir, name)).isDirectory(),
      );
    } catch {
      return [];
    }
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
  <title>의도파악 테스트</title>
</head>
<body data-mode="intent-probe">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
