import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildIntentPrompt, parseIntent, type IntentContext, type IntentResult } from '../ai/intent/IntentClassifier';
import { classifyOfflineIntent } from '../ai/intent/IntentSignals';
import { crossFileSuppressionReason } from '../ai/intent/CrossFileTargeting';
import { buildImportProvenance } from '../ai/pipeline/RegionEditService';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { LlmService } from '../ai/pipeline/LlmService';
import type { ChatMessage } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, IntentProbeResult, IntentProbeIntent, TargetResolveProbe, TargetResolveStep } from '../types/messages';

/**
 * 단계별 테스트 ① 의도파악 — 에디터 탭(WebviewPanel) 페이지.
 *
 * 목적: 프롬프트 하나를 넣으면 의도파악 층의 두 판정 경로를 나란히 보여준다.
 *  - 모델 분류기: buildIntentPrompt → LlmService.streamChat('}' 조기종료) → parseIntent
 *    (⚠ ChatViewProvider._classifyIntent와 동일 규칙의 미러 — 그쪽 변경 시 여기도 동기화)
 *  - 정규식 폴백: classifyOfflineIntent — 운영 함수 그대로 호출(미러 아님)
 *  - 최종 채택(effective)은 S1 라우팅측정과 동일 규칙(분류기 확신 시 그 결과, 아니면 정규식).
 *  - 해석된 대상 파일: 수정 라우트의 대상 파일 결정 사슬 드라이런
 *    (⚠ ChatViewProvider._resolveTargetFile 미러 — 그쪽 규칙 변경 시 _probeTargetResolve도 동기화)
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
    // 패널이 활성 탭이 되면 activeTextEditor가 비므로, 생성 **직전**의 활성 파일을 시드로 기억한다.
    const seedDoc = vscode.window.activeTextEditor?.document;
    const seedFile = seedDoc && seedDoc.uri.scheme === 'file' ? seedDoc.fileName : null;
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
    IntentProbePanel._current = new IntentProbePanel(panel, extensionUri, seedFile);
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
    this._llm = new LlmService(_extensionUri);
    _panel.webview.html = this._buildHtml(_panel.webview);
    // 패널이 열려 있는 동안 사용자가 다른 파일로 이동하면 최신 활성 파일을 계속 추적한다.
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e && e.document.uri.scheme === 'file') this._lastEditorFile = e.document.fileName;
      }),
    );
    _panel.onDidDispose(() => {
      IntentProbePanel._current = undefined;
      for (const d of this._disposables) d.dispose();
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
    // ① 활성 텍스트 에디터(패널이 활성 탭이면 대개 빈다).
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file') return active.fileName;
    // ② 다른 그룹에 보이는 텍스트 에디터.
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
    if (visible) return visible.document.fileName;
    // ③ 각 그룹의 활성 탭이 텍스트 파일인 경우.
    for (const group of vscode.window.tabGroups.all) {
      const input = group.activeTab?.input;
      if (input instanceof vscode.TabInputText && input.uri.scheme === 'file') return input.uri.fsPath;
    }
    // ④ 패널 생성 직전/생존 중 마지막 활성 텍스트 파일 — 패널과 **같은 그룹**의 뒷탭이면
    //    ①~③이 전부 빈손이 되는 함정(modify→create leak과 동일)의 주 해법.
    if (this._lastEditorFile && fs.existsSync(this._lastEditorFile)) return this._lastEditorFile;
    // ⑤ 최후 폴백: 어느 그룹이든 텍스트 탭(비활성 포함) 첫 번째.
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
          return tab.input.uri.fsPath;
        }
      }
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

    // ⑥ 해석된 대상 파일 — 수정 라우트의 대상 파일 결정 사슬 드라이런(파일 열기·QuickPick 없음).
    //    운영은 intent(분류기 결과)의 targetComponent만 넘긴다(ChatViewProvider:1456 미러).
    const targetResolve = await this._probeTargetResolve(
      query,
      currentFile,
      hasSelection,
      effective.intent,
      model.result?.targetComponent ?? null,
    );

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
      targetResolve,
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

  /**
   * "해석된 대상 파일" 드라이런 — 운영 ChatViewProvider._resolveTargetFile의 결정 사슬 미러.
   * (⚠ 그쪽 규칙 변경 시 여기도 동기화. 판정만 하며 파일 열기·QuickPick·라우팅 영향 없음.)
   *
   * 사슬: ①cross-file 재타겟 → ②줄 선택 → ③파일명 명시 → ④다른 파일 단서 → ⑤모순 없음 → ⑥되묻기.
   * 각 규칙의 발화 여부를 추적해 돌려준다 — outcome=ask-user(빈손 되묻기)가
   * "대상 파일 해석 고도화"(후보 수집기) 작업이 채울 지점이자 이 계기판의 핵심 관측 대상.
   */
  private async _probeTargetResolve(
    query: string,
    currentFile: string | null,
    hasSelection: boolean,
    effectiveIntent: string,
    modelTargetComponent: string | null,
  ): Promise<TargetResolveProbe> {
    // 운영은 isFileCtx(수정 라우트)일 때만 _resolveTargetFile을 탄다 — 프로브는 최종 채택 의도로 근사.
    if (effectiveIntent !== 'modify_file') {
      return {
        applicable: false,
        outcome: 'not-applicable',
        targetFile: null,
        steps: [],
        note: `대상 파일 해석은 수정(modify_file) 라우트에서만 수행됩니다 — 최종 채택 의도가 ${effectiveIntent}.`,
      };
    }

    const steps: TargetResolveStep[] = [];
    const activePath = currentFile;
    const activeBase = activePath
      ? (activePath.split(/[/\\]/).pop() ?? '').replace(/\.[tj]sx?$/, '')
      : '';

    // ① cross-file 재타겟 — 다른 컴포넌트를 지목하면 import 경로로 그 파일을 해석해 전환.
    const cross = await this._probeCrossFile(query, activePath, activeBase, modelTargetComponent);
    steps.push({ rule: '① cross-file 재타겟', detail: cross.detail, fired: cross.target !== null });
    if (cross.target) {
      return { applicable: true, outcome: 'cross-file', targetFile: cross.target, steps };
    }

    // ② 줄 선택이 있으면 사용자가 현재 파일을 명시적으로 가리킨 것.
    const selFired = !!(activePath && hasSelection);
    steps.push({
      rule: '② 줄 선택 → 현재 파일',
      detail: selFired
        ? '선택영역 있음 — 현재 파일 확정'
        : hasSelection
          ? '선택영역 체크됐으나 현재 파일이 없어 무효'
          : '선택영역 없음',
      fired: selFired,
    });
    if (selFired) return { applicable: true, outcome: 'current-file', targetFile: activePath, steps };

    // ③ 쿼리가 현재 파일명/컴포넌트명을 명시.
    const nameFired = !!(activeBase && query.toLowerCase().includes(activeBase.toLowerCase()));
    steps.push({
      rule: '③ 파일명 명시 → 현재 파일',
      detail: nameFired
        ? `프롬프트가 "${activeBase}"를 언급 — 현재 파일 확정`
        : activeBase
          ? `프롬프트에 "${activeBase}" 언급 없음`
          : '현재 파일 없음',
      fired: nameFired,
    });
    if (nameFired) return { applicable: true, outcome: 'current-file', targetFile: activePath, steps };

    // ④ 쿼리에서 다른 파일/컴포넌트 단서 추출.
    const otherRef = this._probeExtractOtherFileRef(query, activeBase);
    steps.push({
      rule: '④ 다른 파일 단서 추출',
      detail: otherRef ? `단서 발견: "${otherRef}"` : '단서 없음',
      fired: otherRef !== null,
    });

    // ⑤ 현재 파일이 있고 다른 파일 단서가 없으면 모순 없음 → 현재 파일.
    const noConflict = !!(activePath && !otherRef);
    steps.push({
      rule: '⑤ 모순 없음 → 현재 파일',
      detail: noConflict
        ? '현재 파일 있음 + 다른 파일 단서 없음 — 현재 파일로 진행'
        : activePath
          ? '다른 파일 단서가 있어 모호'
          : '현재 파일 없음',
      fired: noConflict,
    });
    if (noConflict) return { applicable: true, outcome: 'current-file', targetFile: activePath, steps };

    // ⑥ 모호 → 되묻기(QuickPick). 빈손이면 후보 수집기(고도화 후보작업)가 채울 지점.
    steps.push({
      rule: '⑥ 되묻기(QuickPick)',
      detail: otherRef
        ? `"${otherRef}" 힌트와 함께 파일 선택 질문`
        : '근거 후보 없이 빈손 질문 — 대상 파일 해석 고도화(결정론 후보 수집기)가 채울 지점',
      fired: true,
    });
    return {
      applicable: true,
      outcome: 'ask-user',
      targetFile: null,
      steps,
      note: '운영에서는 이 지점에서 QuickPick으로 사용자에게 묻습니다(프로브는 판정만).',
    };
  }

  /**
   * ChatViewProvider._resolveCrossFileTarget의 드라이런 미러(⚠ 동기화 대상, 판정만·전환/열기 없음).
   * 추출=모델 targetComponent 1순위·정규식+import 그라운딩 폴백 / 억제=crossFileSuppressionReason /
   * 해석=결정론(_probeResolveModuleToUri). target=null이면 detail에 사유를 담아 기존 흐름으로.
   */
  private async _probeCrossFile(
    query: string,
    activePathRel: string | null,
    activeBase: string,
    modelTargetComponent: string | null,
  ): Promise<{ target: string | null; detail: string }> {
    if (!activePathRel) return { target: null, detail: '현재 파일 없음 → 건너뜀' };
    const abs = this._toAbsolutePath(activePathRel);
    let content = '';
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      return { target: null, detail: `현재 파일을 읽지 못함(${activePathRel}) → 건너뜀` };
    }
    if (!content) return { target: null, detail: '현재 파일 내용 없음 → 건너뜀' };

    const provenance = buildImportProvenance([content]);
    const baseLower = activeBase.toLowerCase();

    // 대상 컴포넌트명 결정 — 모델이 1순위, 없으면 정규식 폴백(import된 심볼만 인정).
    let name: string | null = null;
    let nameSource = '';
    const modelName =
      modelTargetComponent && /^[A-Z][A-Za-z0-9]*$/.test(modelTargetComponent)
        ? modelTargetComponent
        : null;
    if (modelName && modelName.toLowerCase() !== baseLower) {
      name = modelName;
      nameSource = '모델 targetComponent';
    } else if (!modelTargetComponent) {
      const candidates = new Set<string>();
      const re = /\b([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(query)) !== null) candidates.add(m[1]);
      const imported = [...candidates].filter(
        (c) => c.toLowerCase() !== baseLower && provenance.has(c),
      );
      if (imported.length === 1) {
        name = imported[0];
        nameSource = '정규식+import 그라운딩';
      }
    }
    if (!name) return { target: null, detail: '대상 컴포넌트 단서 없음·모호 → 다음 규칙으로' };

    const suppress = crossFileSuppressionReason(query, name);
    if (suppress) {
      return {
        target: null,
        detail: `"${name}" 억제(${suppress === 'use-as' ? '"…로 적용/사용" = 사용 의도' : '"…위에/아래" = 위치 랜드마크'}) → 현재 파일 유지`,
      };
    }

    const moduleSpec = provenance.get(name)?.module ?? name;
    const uri = await this._probeResolveModuleToUri(moduleSpec, abs);
    if (!uri) {
      return { target: null, detail: `"${name}"("${moduleSpec}") 워크스페이스 파일 해석 실패 → 현재 파일 유지` };
    }
    const rel = vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');
    if (rel === activePathRel) {
      return { target: null, detail: `"${name}" 해석 결과가 현재 파일과 동일 → 전환 불필요` };
    }
    return { target: rel, detail: `"${name}"(${nameSource}) → ${rel} 전환` };
  }

  /** ChatViewProvider._extractOtherFileRef의 미러(⚠ 동기화 대상). */
  private _probeExtractOtherFileRef(query: string, activeBase: string): string | null {
    const base = activeBase.toLowerCase();
    const fileM = query.match(/([A-Za-z0-9_]+)\.(tsx?|jsx?)\b/);
    if (fileM && fileM[1].toLowerCase() !== base) return fileM[0];
    const compRe = /\b([A-Z][a-zA-Z0-9]*(?:Page|List|Form|Detail|Modal|View|Table|Card|Panel|Dialog|Screen))\b/g;
    let m: RegExpExecArray | null;
    while ((m = compRe.exec(query)) !== null) {
      if (m[1].toLowerCase() !== base) return m[1];
    }
    return null;
  }

  /** ChatViewProvider._resolveModuleToUri의 미러(⚠ 동기화 대상) — 읽기 전용 해석이라 그대로 복제. */
  private async _probeResolveModuleToUri(spec: string, currentAbsPath?: string): Promise<vscode.Uri | null> {
    const exts = ['.tsx', '.ts', '.jsx', '.js'];
    const tryStat = async (base: string): Promise<vscode.Uri | null> => {
      for (const e of exts) {
        const u = vscode.Uri.file(base + e);
        try { await vscode.workspace.fs.stat(u); return u; } catch { /* next */ }
      }
      for (const e of exts) {
        const u = vscode.Uri.file(path.join(base, 'index' + e));
        try { await vscode.workspace.fs.stat(u); return u; } catch { /* next */ }
      }
      return null;
    };

    // ① 상대 경로
    if (spec.startsWith('.') && currentAbsPath) {
      const resolved = await tryStat(path.resolve(path.dirname(currentAbsPath), spec));
      if (resolved) return resolved;
    }

    // ② basename glob + 뒤쪽 세그먼트 스코어링
    const base = spec.split('/').pop();
    if (!base) return null;
    let matches: vscode.Uri[] = [];
    try {
      matches = await vscode.workspace.findFiles(`**/${base}.{tsx,ts,jsx,js}`, '**/node_modules/**', 20);
    } catch {
      return null;
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const segs = spec.split('/').filter((s) => s && s !== base && !s.startsWith('@') && s !== '.' && s !== '..');
    const scored = matches
      .map((u) => ({
        u,
        score: segs.filter((s) => u.path.toLowerCase().includes(s.toLowerCase())).length,
      }))
      .sort((a, b) => b.score - a.score);
    if (scored.length >= 2 && scored[0].score === scored[1].score) return null;
    return scored[0].u;
  }

  private _toAbsolutePath(rel: string): string {
    if (path.isAbsolute(rel)) return rel;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return wsRoot ? path.join(wsRoot, rel) : rel;
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
