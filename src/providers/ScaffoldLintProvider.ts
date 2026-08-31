import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  lintScaffoldSource, SCAFFOLD_LINT_RULES,
  type ILintFinding, type TLintRuleId,
} from '../ai/lint/ScaffoldLint';
import { FileCreatorService } from '../ai/pipeline/FileCreatorService';
import { ExtensionConfig } from '../config/ExtensionConfig';

/**
 * Scaffold 린트의 VSCode 배선 — 진단(Diagnostics) 발행 + Quick Fix 제공 (C1).
 *
 * 판정은 전부 `ai/lint/ScaffoldLint`(순수 모듈)가 한다. 여기는 **언제 검사할지**와
 * **고친 결과를 어떻게 편집기에 반영할지**만 담당한다 — 계획 §2의 층 분리 원칙 그대로다.
 *
 * ## 설계 결정
 * - **읽기 전용**: 코드를 자동으로 바꾸지 않는다. 파일이 바뀌는 건 사람이 Quick Fix를 고를 때뿐이다.
 * - **모델 호출 0**: 폐쇄망·서버 미기동에서도 그대로 돈다. 오프라인 모드의 검사 축(§7 C 그룹).
 * - **스캐폴드 워크스페이스에서만**: `src/domains`가 없는 프로젝트에 이 계약을 들이대면 전부 오탐이다.
 *   (설정 `axiom-ai.lint.enabled`로 끌 수 있고, 감지 실패 시엔 조용히 아무것도 안 한다.)
 * - **소음 관리가 기능의 일부**: 규칙마다 "이 규칙 끄기" Quick Fix를 함께 낸다. 개발자가 규칙 하나
 *   때문에 린트 전체를 끄는 것보다, 그 규칙만 끄고 나머지를 살려두는 편이 낫다.
 */
export class ScaffoldLintProvider implements vscode.CodeActionProvider {
  /** 진단 컬렉션 이름 = Problems 패널에 보이는 출처. */
  private static readonly SOURCE = 'Axiom';
  /** 타이핑 중 재검사 디바운스(ms). 파일 한 장 정규식 스캔이라 가볍지만 매 키 입력마다 돌 이유는 없다. */
  private static readonly DEBOUNCE_MS = 300;
  /** 검사 대상 언어. */
  private static readonly LANGS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

  private readonly _diagnostics = vscode.languages.createDiagnosticCollection('axiom-scaffold');
  private readonly _timers = new Map<string, NodeJS.Timeout>();
  /** 파일별 최근 findings — Quick Fix가 진단을 다시 계산하지 않도록 캐시한다. */
  private readonly _findings = new Map<string, ILintFinding[]>();

  /**
   * 활성화 시점에 호출한다. 열려 있는 문서를 즉시 검사하고, 이후 열기/편집/저장/닫기와
   * 설정 변경을 따라간다.
   */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this._diagnostics,
      vscode.languages.registerCodeActionsProvider(
        ScaffoldLintProvider.LANGS.map((language) => ({ language, scheme: 'file' })),
        this,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
      vscode.workspace.onDidOpenTextDocument((doc) => this._schedule(doc, 0)),
      vscode.workspace.onDidChangeTextDocument((e) => this._schedule(e.document, ScaffoldLintProvider.DEBOUNCE_MS)),
      vscode.workspace.onDidSaveTextDocument((doc) => this._schedule(doc, 0)),
      vscode.workspace.onDidCloseTextDocument((doc) => this._clear(doc)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('axiom-ai.lint')) this._refreshAll();
      }),
      // 규칙 하나만 끄기 — Quick Fix에서 호출한다(설정 대상은 워크스페이스, 없으면 전역).
      vscode.commands.registerCommand('axiom-ai.lint.disableRule', (ruleId?: unknown) => {
        void this._disableRule(typeof ruleId === 'string' ? ruleId : undefined);
      }),
    );

    this._refreshAll();
  }

  // ── 검사 ───────────────────────────────────────────────────────────────────

  private _refreshAll(): void {
    this._diagnostics.clear();
    this._findings.clear();
    for (const doc of vscode.workspace.textDocuments) this._schedule(doc, 0);
  }

  private _schedule(doc: vscode.TextDocument, delay: number): void {
    if (!this._isTarget(doc)) return;
    const key = doc.uri.toString();
    const prev = this._timers.get(key);
    if (prev) clearTimeout(prev);
    if (delay === 0) {
      this._run(doc);
      return;
    }
    this._timers.set(key, setTimeout(() => {
      this._timers.delete(key);
      this._run(doc);
    }, delay));
  }

  private _clear(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const t = this._timers.get(key);
    if (t) { clearTimeout(t); this._timers.delete(key); }
    this._findings.delete(key);
    this._diagnostics.delete(doc.uri);
  }

  private _run(doc: vscode.TextDocument): void {
    if (!this._isTarget(doc)) return;
    let findings: ILintFinding[] = [];
    try {
      findings = lintScaffoldSource(doc.getText(), { disabledRules: ScaffoldLintProvider._disabledRules() });
    } catch {
      // 린트가 문서 하나 때문에 죽지 않게 — 판정 실패는 "진단 없음"으로 처리(fail-open).
      findings = [];
    }
    this._findings.set(doc.uri.toString(), findings);
    this._diagnostics.set(doc.uri, findings.map((f) => ScaffoldLintProvider._toDiagnostic(f)));
  }

  /**
   * 이 문서를 검사할지. scaffold 계약은 scaffold 프로젝트의 **업무 코드**에서만 참이므로,
   * 워크스페이스가 스캐폴드로 보이지 않거나 파일이 코어/벤더 영역이면 아무 진단도 내지 않는다.
   */
  private _isTarget(doc: vscode.TextDocument): boolean {
    if (!ExtensionConfig.isLintEnabled()) return false;
    if (doc.uri.scheme !== 'file') return false;
    if (!ScaffoldLintProvider.LANGS.includes(doc.languageId)) return false;
    const p = doc.uri.fsPath;
    if (/[\\/](node_modules|dist|build|out|\.git)[\\/]/.test(p)) return false;
    if (/\.d\.ts$/.test(p)) return false;
    if (ScaffoldLintProvider._isFrameworkArea(p)) return false;
    return ScaffoldLintProvider._isScaffoldWorkspace(p);
  }

  /**
   * 계약을 **적용받는 쪽이 아니라 구현하는 쪽**인 영역인지.
   *
   * CLAUDE.md의 구조 정의대로 `src/core`는 "업무 개발자 미작업 영역"이고, `src/shared/lib`는 shadcn 원본
   * 벤더 코드다. 여기에 계약을 들이대면 전부 오탐이 된다 — `core/hooks/use-api.ts`는 **`useApi`의 구현체**라
   * `useQuery`/`useMutation`을 직접 쓰는 게 당연하고, `core/api/api-client.ts`는 axios 그 자체다
   * (실측: 이 제외가 없으면 실 scaffold에서 raw-http 7건이 전부 코어 구현부에서 나온다).
   */
  private static _isFrameworkArea(filePath: string): boolean {
    const norm = filePath.replace(/\\/g, '/');
    return /\/src\/(core|config|types|__stories__)\//.test(norm)
      || /\/src\/shared\/lib\//.test(norm)
      || /\/shadcn\//.test(norm);
  }

  /** 파일이 속한 워크스페이스 폴더가 react-app-scaffold 모양인지(행동 카드의 `scaffold-detected`와 같은 신호). */
  private static _isScaffoldWorkspace(filePath: string): boolean {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    const root = folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return false;
    try {
      return fs.existsSync(path.join(root, 'src', 'domains'));
    } catch {
      return false;
    }
  }

  private static _disabledRules(): string[] {
    return ExtensionConfig.getLintDisabledRules();
  }

  private static _toDiagnostic(f: ILintFinding): vscode.Diagnostic {
    const range = new vscode.Range(f.line, f.column, f.endLine, f.endColumn);
    const severity = f.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : f.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
    const d = new vscode.Diagnostic(range, f.message, severity);
    d.source = ScaffoldLintProvider.SOURCE;
    d.code = f.ruleId;
    return d;
  }

  // ── Quick Fix ──────────────────────────────────────────────────────────────

  provideCodeActions(
    doc: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    ctx: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const findings = this._findings.get(doc.uri.toString());
    if (!findings || findings.length === 0) return [];

    const actions: vscode.CodeAction[] = [];
    const seenRules = new Set<TLintRuleId>();

    for (const f of findings) {
      const fRange = new vscode.Range(f.line, f.column, f.endLine, f.endColumn);
      if (!fRange.intersection(range) && !fRange.contains(range.start)) continue;

      if (f.fix) {
        const action = new vscode.CodeAction(f.fix.title, vscode.CodeActionKind.QuickFix);
        const edit = new vscode.WorkspaceEdit();
        for (const e of f.fix.edits) {
          edit.replace(doc.uri, new vscode.Range(e.line, e.column, e.endLine, e.endColumn), e.text);
        }
        action.edit = edit;
        action.diagnostics = ScaffoldLintProvider._matching(ctx, f);
        action.isPreferred = true;
        actions.push(action);
      } else if (f.ruleId === 'module-scope-hook') {
        // 모듈 스코프 훅의 교정은 문장을 컴포넌트 본문으로 **옮기는** 변환이라 순수 린트가 만든
        // 범위 편집으로 표현되지 않는다. 편집 파이프라인이 쓰는 hoist 변환을 그대로 재사용한다
        // (안전하게 못 옮기면 null을 돌려주므로, 그때는 Quick Fix를 아예 내지 않는다).
        const hoisted = FileCreatorService.hoistModuleScopeHooks(doc.getText());
        if (hoisted) {
          const action = new vscode.CodeAction('훅을 컴포넌트 본문 최상위로 이동', vscode.CodeActionKind.QuickFix);
          const edit = new vscode.WorkspaceEdit();
          const whole = new vscode.Range(0, 0, doc.lineCount, 0);
          edit.replace(doc.uri, whole, hoisted.text);
          action.edit = edit;
          action.diagnostics = ScaffoldLintProvider._matching(ctx, f);
          action.isPreferred = true;
          actions.push(action);
        }
      }

      if (!seenRules.has(f.ruleId)) {
        seenRules.add(f.ruleId);
        const meta = SCAFFOLD_LINT_RULES.find((r) => r.id === f.ruleId);
        const off = new vscode.CodeAction(
          `Axiom 규칙 끄기: ${meta?.title ?? f.ruleId}`,
          vscode.CodeActionKind.QuickFix,
        );
        off.command = {
          command: 'axiom-ai.lint.disableRule',
          title: '규칙 끄기',
          arguments: [f.ruleId],
        };
        actions.push(off);
      }
    }
    return actions;
  }

  /** 이 finding에 대응하는 진단을 컨텍스트에서 찾아 액션에 연결한다(전구 그룹핑용). */
  private static _matching(ctx: vscode.CodeActionContext, f: ILintFinding): vscode.Diagnostic[] {
    return ctx.diagnostics.filter((d) => d.source === ScaffoldLintProvider.SOURCE && d.code === f.ruleId);
  }

  private async _disableRule(ruleId?: string): Promise<void> {
    if (!ruleId) return;
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<string[]>('lint.disabledRules') ?? [];
    if (current.includes(ruleId)) return;
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await cfg.update('lint.disabledRules', [...current, ruleId], target);
    const meta = SCAFFOLD_LINT_RULES.find((r) => r.id === ruleId);
    vscode.window.showInformationMessage(
      `Axiom 린트 규칙 "${meta?.title ?? ruleId}"를 껐습니다. 설정 axiom-ai.lint.disabledRules 에서 되돌릴 수 있습니다.`,
    );
  }
}
