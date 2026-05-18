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
    vscode.commands.registerCommand('axiom-ai.scaffoldFromSpec', async () => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.fileName.endsWith('spec.md')) {
        vscode.window.showErrorMessage('spec.md 파일을 열고 실행해주세요.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;

      const axiomDir = path.isAbsolute(axiomFolder)
        ? axiomFolder
        : path.join(wsRoot, axiomFolder);

      const content = editor.document.getText();
      const writer = new SpecFileWriter(axiomDir);
      const parsed = writer.parseDraft(content);

      if (parsed.frontmatter.status !== 'approved') {
        vscode.window.showErrorMessage(`스펙 status가 'approved'여야 합니다. 현재: ${parsed.frontmatter.status ?? 'unknown'}`);
        return;
      }

      const scaffolder = new SpecScaffolder();
      const targetPath = await scaffolder.generate(parsed, wsRoot);

      if (targetPath) {
        // implemented 상태 전이
        const specPath = editor.document.fileName;
        const relPath = path.relative(axiomDir, specPath).replace(/\\/g, '/');
        const tracker = new AxiomIndexTracker(axiomDir);
        const by = vscode.workspace.getConfiguration('axiom-ai').get<string>('user.name', 'developer');
        tracker.transitionStatus(relPath, 'implemented', by);
        writer.updateStatus(specPath, 'implemented', by);

        vscode.window.showInformationMessage(`코드 생성 완료: ${path.relative(wsRoot, targetPath)}`);
        sddPanel?.refresh();
      }
    }),

    // ─── SDD: 스펙 승인 ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('axiom-ai.approveSpec', async (specPath?: string) => {
      const axiomFolder = ExtensionConfig.getSddAxiomFolder();
      if (!axiomFolder) {
        vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
        return;
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
        ? path.join(wsRoot, axiomFolder)
        : axiomFolder;

      const targetPath = specPath ?? vscode.window.activeTextEditor?.document.fileName;
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
  );
}
