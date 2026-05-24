import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ChatPanelProvider } from '../providers/ChatPanelProvider';
import type { ChatViewProvider } from '../providers/ChatViewProvider';
import type { SddPanelProvider } from '../views/SddPanelProvider';
import { SpecFileWriter } from '../spec/SpecFileWriter';
import { SpecScaffolder } from '../spec/SpecScaffolder';
import { AxiomIndexTracker } from '../spec/AxiomIndexTracker';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { DomainRouter } from '../spec/DomainRouter';

/** TreeView context menu 또는 string으로 넘어오는 specPath를 안전하게 추출한다 */
function resolveSpecPath(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof (arg as Record<string, unknown>)['specPath'] === 'string') {
    return (arg as Record<string, unknown>)['specPath'] as string;
  }
  return undefined;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  _provider: ChatPanelProvider,
  chatProvider?: ChatViewProvider,
  sddPanel?: SddPanelProvider,
): void {
  context.subscriptions.push(
    // ─── 기존 커맨드 ────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.reindexCorpus', () => {
      chatProvider?.startIndexBuild();
      vscode.window.showInformationMessage('Axiom AI: Corpus 인덱스 재빌드를 시작했습니다.');
    }),

    // ─── SDD: 스펙 생성 ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.generateSpec', async () => {
      const intent = await vscode.window.showInputBox({
        prompt: '생성할 스펙을 입력하세요',
        placeHolder: '예: 이체 확인 화면, 소셜 로그인 추가',
      });
      if (intent) chatProvider?.runSpecCommand(intent);
    }),

    // ─── SDD: 폴더에서 스펙 생성 ────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.generateSpecForFolder', async (uri: vscode.Uri) => {
      const folderPath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.fileName;
      if (!folderPath) return;

      const domainMatch = folderPath.match(/[/\\]domains[/\\]([^/\\]+)/);
      const domain = domainMatch?.[1];
      const intent = await vscode.window.showInputBox({
        prompt: `${domain ? `[${domain}] ` : ''}스펙을 입력하세요`,
        placeHolder: '예: 이체 확인 화면',
      });
      if (intent) chatProvider?.runSpecCommand(domain ? `${intent} (도메인: ${domain})` : intent);
    }),

    // ─── SDD: spec.md에서 코드 생성 ─────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.scaffoldFromSpec', async (arg?: unknown) => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;

      const axiomDir = path.isAbsolute(axiomFolder)
        ? axiomFolder
        : path.join(wsRoot, axiomFolder);

      // TreeView 또는 activeEditor에서 spec 경로 확보
      const fromArg = resolveSpecPath(arg);
      let specContent: string;
      let specFilePath: string;

      if (fromArg) {
        if (!fs.existsSync(fromArg)) {
          vscode.window.showErrorMessage(`파일을 찾을 수 없습니다: ${fromArg}`);
          return;
        }
        specContent = fs.readFileSync(fromArg, 'utf-8');
        specFilePath = fromArg;
        // 에디터에서 열기
        const doc = await vscode.workspace.openTextDocument(fromArg);
        await vscode.window.showTextDocument(doc, { preview: false });
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith('spec.md')) {
          vscode.window.showErrorMessage('spec.md 파일을 열고 실행해주세요.');
          return;
        }
        specContent = editor.document.getText();
        specFilePath = editor.document.fileName;
      }

      const writer = new SpecFileWriter(axiomDir);
      const parsed = writer.parseDraft(specContent);

      if (parsed.frontmatter.status !== 'approved') {
        vscode.window.showErrorMessage(`스펙 status가 'approved'여야 합니다. 현재: ${parsed.frontmatter.status ?? 'unknown'}`);
        return;
      }

      const scaffolder = new SpecScaffolder();
      const targetPath = await scaffolder.generate(parsed, wsRoot);

      if (targetPath) {
        const relPath = path.relative(axiomDir, specFilePath).replace(/\\/g, '/');
        const tracker = new AxiomIndexTracker(axiomDir);
        const by = vscode.workspace.getConfiguration('axiom-ai').get<string>('user.name', 'developer');
        tracker.transitionStatus(relPath, 'implemented', by);
        writer.updateStatus(specFilePath, 'implemented', by);

        vscode.window.showInformationMessage(`코드 생성 완료: ${path.relative(wsRoot, targetPath)}`);
        sddPanel?.refresh();
      }
    }),

    // ─── SDD: 스펙 승인 ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.approveSpec', async (arg?: unknown) => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
        ? path.join(wsRoot, axiomFolder)
        : axiomFolder;

      const fromArg = resolveSpecPath(arg);
      const targetPath = fromArg ?? vscode.window.activeTextEditor?.document.fileName;
      if (!targetPath || !targetPath.endsWith('spec.md')) {
        vscode.window.showErrorMessage('spec.md 파일을 선택해주세요.');
        return;
      }

      const content = fs.readFileSync(targetPath, 'utf-8');
      const writer = new SpecFileWriter(axiomDir);
      const parsed = writer.parseDraft(content);

      if (!parsed.frontmatter.reviewer) {
        vscode.window.showErrorMessage('승인 전 frontmatter의 reviewer 필드를 입력해주세요.');
        return;
      }

      const by = vscode.workspace.getConfiguration('axiom-ai').get<string>('user.name', 'developer');
      const tracker = new AxiomIndexTracker(axiomDir);
      const relPath = path.relative(axiomDir, targetPath).replace(/\\/g, '/');
      tracker.transitionStatus(relPath, 'approved', by);
      writer.updateStatus(targetPath, 'approved', by);

      vscode.window.showInformationMessage('스펙이 approved 상태로 전환되었습니다.');
      sddPanel?.refresh();
    }),

    // ─── SDD: 스펙 수정 (AI 보조) ───────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.updateSpec', async (arg?: unknown) => {
      const fromArg = resolveSpecPath(arg);
      const targetPath = fromArg ?? vscode.window.activeTextEditor?.document.fileName;

      if (!targetPath || !targetPath.endsWith('spec.md')) {
        vscode.window.showErrorMessage('spec.md 파일을 선택해주세요.');
        return;
      }

      // spec.md를 에디터에서 열어 컨텍스트 확보
      const doc = await vscode.workspace.openTextDocument(targetPath);
      await vscode.window.showTextDocument(doc, { preview: false });

      const intent = await vscode.window.showInputBox({
        prompt: '어떻게 수정할까요?',
        placeHolder: '예: 페이지네이션 무한 스크롤로 변경, 삭제 기능 추가',
      });
      if (!intent) return;

      await chatProvider?.runSpecUpdateCommand(intent);
    }),

    // ─── SDD: 스펙 열기 ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.openSpec', async (specPath: string) => {
      if (!specPath || !fs.existsSync(specPath)) return;
      const doc = await vscode.workspace.openTextDocument(specPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),

    // ─── SDD: 패널 새로고침 ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.refreshSddPanel', () => {
      sddPanel?.refresh();
    }),

    // ─── SDD: 퍼블리셔 파일 → 스펙 역방향 추출 ─────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.extractSpecFromFile', async (arg?: unknown) => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;
      const axiomDir = path.isAbsolute(axiomFolder) ? axiomFolder : path.join(wsRoot, axiomFolder);

      // 탐색기 우클릭(arg = Uri) 또는 활성 에디터에서 파일 경로 확보
      let filePath: string | undefined;
      if (arg && typeof (arg as Record<string, unknown>)['fsPath'] === 'string') {
        filePath = (arg as vscode.Uri).fsPath;
      }
      filePath ??= vscode.window.activeTextEditor?.document.fileName;

      if (!filePath) {
        vscode.window.showErrorMessage('분석할 파일을 선택하거나 에디터에서 열어주세요.');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      if (!['.html', '.htm', '.tsx'].includes(ext)) {
        vscode.window.showErrorMessage(`지원 파일 형식: .html, .htm, .tsx (현재: ${ext})`);
        return;
      }

      if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`파일을 찾을 수 없습니다: ${filePath}`);
        return;
      }

      // 도메인 감지
      let domain = new DomainRouter(axiomDir).detectDomain(filePath) ?? undefined;
      if (!domain) {
        const domains = new DomainRouter(axiomDir).listDomains();
        if (domains.length > 0) {
          domain = await vscode.window.showQuickPick(domains, {
            placeHolder: '스펙을 저장할 도메인을 선택하세요',
            title: '역방향 스펙 추출',
          }) ?? undefined;
          if (!domain) return;
        } else {
          domain = await vscode.window.showInputBox({
            prompt: '도메인명을 입력하세요',
            placeHolder: '예: main, transfer, account',
            title: '역방향 스펙 추출',
          }) ?? undefined;
          if (!domain) return;
        }
      }

      await chatProvider?.runExtractSpecCommand(filePath, domain);
      sddPanel?.refresh();
    }),

    // ─── SDD: 화면 추가 (원스텝) ────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.addScreen', async (arg?: unknown) => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;
      const axiomDir = path.isAbsolute(axiomFolder) ? axiomFolder : path.join(wsRoot, axiomFolder);

      // 1. TreeView 폴더 우클릭 시: arg.resourceUri에서 도메인 추출
      let prefilledDomain: string | undefined;
      const argUri = (arg as Record<string, unknown>)?.['resourceUri'] as vscode.Uri | undefined;
      if (argUri?.fsPath) {
        const match = argUri.fsPath.match(/[/\\]screens[/\\]([^/\\]+)([/\\]|$)/);
        if (match?.[1]) prefilledDomain = match[1];
      }

      // 2. 활성 에디터에서 도메인 추출
      if (!prefilledDomain) {
        const activeFile = vscode.window.activeTextEditor?.document.fileName;
        if (activeFile) {
          prefilledDomain = new DomainRouter(axiomDir).detectDomain(activeFile) ?? undefined;
        }
      }

      const screenName = await vscode.window.showInputBox({
        prompt: '추가할 화면명을 입력하세요 (PascalCase)',
        placeHolder: 'AccountListPage',
      });
      if (!screenName) return;

      // 도메인이 없으면 quick-pick 또는 직접 입력으로 선택
      let domain = prefilledDomain;
      if (!domain) {
        const router = new DomainRouter(axiomDir);
        const domains = router.listDomains();
        if (domains.length > 0) {
          domain = await vscode.window.showQuickPick(domains, {
            placeHolder: '도메인을 선택하세요',
            title: '화면 추가',
          }) ?? undefined;
          if (!domain) return;
        } else {
          domain = await vscode.window.showInputBox({
            prompt: '도메인명을 입력하세요',
            placeHolder: '예: main, transfer, account',
          }) ?? undefined;
          if (!domain) return;
        }
      }

      const description = await vscode.window.showInputBox({
        prompt: '화면의 주요 기능을 한 줄로 설명하세요 (선택)',
        placeHolder: '예: 계좌 목록 조회 및 삭제',
      });
      if (description === undefined) return;

      const intent = [
        domain ? `${domain} 도메인` : '',
        screenName,
        description || '',
      ].filter(Boolean).join(' ');

      await chatProvider?.runAddScreenCommand(intent);
      sddPanel?.refresh();
    }),
  );
}
