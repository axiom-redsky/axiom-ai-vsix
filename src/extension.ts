import * as vscode from 'vscode';
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { StageTestPanelProvider } from './views/StageTestPanelProvider';
import { IntentProbePanel } from './providers/IntentProbePanel';
import { DecomposeProbePanel } from './providers/DecomposeProbePanel';
import { LocateProbePanel } from './providers/LocateProbePanel';
import { ContractsProbePanel } from './providers/ContractsProbePanel';
import { GuidePanel } from './providers/GuidePanel';
import { ActionCardsPanel } from './providers/ActionCardsPanel';
import { ComponentCatalogPanel } from './providers/ComponentCatalogPanel';
import { DesignTokensPanel } from './providers/DesignTokensPanel';
import { RouterMapPanel } from './providers/RouterMapPanel';
import { CardCatalogService } from './providers/CardCatalogService';
import { ScaffoldLintProvider } from './providers/ScaffoldLintProvider';
import { ScaffoldHoverProvider } from './providers/ScaffoldHoverProvider';
import { ProjectConfigProvider } from './providers/ProjectConfigProvider';
import { SliceProbeProvider } from './providers/SliceProbeProvider';
import { RegionIoProbeProvider } from './providers/RegionIoProbeProvider';
import { registerCommands } from './commands/index';
import { ExtensionConfig } from './config/ExtensionConfig';
import { initEmbeddingPipeline } from './ai/retrieval/EmbeddingService';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
  // 통합 설정 계층 초기화(SecretStorage 핸들·apiKey 선로딩·통합 설정 파일 감시).
  // 비동기지만 즉시 await하지 않아도 안전 — 선로딩 전엔 종전(settings.json) 동작으로 폴백한다.
  void ExtensionConfig.init(context);
  // 행동 카드 개인 계층(globalStorage) 경로 확정 — 채팅 추천·관리 패널이 같은 3계층을 본다(§5).
  CardCatalogService.init(context);

  const launcherProvider = new ChatPanelProvider(context.extensionUri);
  const chatProvider = new ChatViewProvider(context.extensionUri);

  // 설정 패널의 연결 테스트가 성공하면 채팅 토큰 메터를 즉시 온라인으로 되돌린다
  // (오프라인 사용 후 온라인 전환 시 "오프라인 · 토큰 미사용"이 다음 턴까지 고정되던 문제).
  launcherProvider.onConnectionOnline = () => chatProvider.resetTokenMeter();
  const projectConfigProvider = new ProjectConfigProvider(context.extensionUri);
  const sliceProbeProvider = new SliceProbeProvider(context.extensionUri);
  const regionIoProbeProvider = new RegionIoProbeProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewId,
      launcherProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewId,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      ProjectConfigProvider.viewId,
      projectConfigProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      SliceProbeProvider.viewId,
      sliceProbeProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      RegionIoProbeProvider.viewId,
      regionIoProbeProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerTreeDataProvider(
      StageTestPanelProvider.viewId,
      new StageTestPanelProvider(),
    ),
    // 단계별 테스트 — 사이드바 목록 클릭 → 해당 단계 테스트 페이지를 에디터 탭으로 연다.
    vscode.commands.registerCommand('axiom-ai.openStageTest', (stageNo: number) => {
      if (stageNo === 1) {
        IntentProbePanel.createOrShow(context.extensionUri);
      } else if (stageNo === 2) {
        DecomposeProbePanel.createOrShow(context.extensionUri);
      } else if (stageNo === 3) {
        LocateProbePanel.createOrShow(context.extensionUri);
      } else if (stageNo === 4) {
        ContractsProbePanel.createOrShow(context.extensionUri);
      } else {
        vscode.window.showInformationMessage(`단계별 테스트: ${stageNo}단계 페이지는 아직 준비 중입니다. (현재는 1. 의도파악, 2. 분해, 3. 위치찾기, 4. 설명서 삽입)`);
      }
    }),
  );

  // 프로젝트 설정 패널 axiomDir 초기화
  _initProjectConfigProvider(projectConfigProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('axiom-ai.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer');
      try {
        await vscode.commands.executeCommand('axiom-ai.chatView.focus');
      } catch {
        await vscode.commands.executeCommand('workbench.view.extension.axiom-ai-chat-container');
      }
    }),

    vscode.commands.registerCommand('axiom-ai.clearHistory', () => {
      chatProvider.clearHistory();
      vscode.window.showInformationMessage('Axiom AI: 대화 기록이 초기화되었습니다.');
    }),

    // 내장 개발 가이드 — docId(가이드 루트 기준 확장자 없는 상대경로)를 주면 그 문서로 딥링크된다.
    vscode.commands.registerCommand('axiom-ai.openGuide', (docId?: unknown) => {
      GuidePanel.createOrShow(context.extensionUri, typeof docId === 'string' ? docId : undefined);
    }),

    vscode.commands.registerCommand('axiom-ai.reseedGuide', () => {
      void GuidePanel.reseedInteractive(context.extensionUri);
    }),

    // 오프라인 행동 카드의 맨땅 진입(자연어 없이) — 순차 QuickPick 페이지 생성 위저드.
    vscode.commands.registerCommand('axiom-ai.createPageWizard', () => {
      void chatProvider.runCreatePageWizard();
    }),

    // 행동 카드 관리 패널 — 3계층 목록·켜기끄기·새 카드·lint·드라이런 (§5).
    vscode.commands.registerCommand('axiom-ai.openActionCards', () => {
      ActionCardsPanel.createOrShow(context.extensionUri);
    }),

    // 컴포넌트 카탈로그 패널 — props 인덱스·가이드·지식 문서를 한 창에서 훑어보기 (§7 B1).
    // 인자로 부품 id를 주면 그 부품을 펼쳐서 연다(hover 카드의 "카탈로그에서 열기" 딥링크, §7 B2).
    vscode.commands.registerCommand('axiom-ai.openComponentCatalog', (entryId?: unknown) => {
      ComponentCatalogPanel.createOrShow(context.extensionUri, typeof entryId === 'string' ? entryId : undefined);
    }),

    // 디자인 토큰 브라우저 — 프로젝트 CSS의 토큰을 견본과 함께 (§7 B3).
    // 인자로 토큰 이름을 주면 그 토큰을 펼쳐서 연다(hover 카드의 딥링크).
    vscode.commands.registerCommand('axiom-ai.openDesignTokens', (tokenName?: unknown) => {
      DesignTokensPanel.createOrShow(context.extensionUri, typeof tokenName === 'string' ? tokenName : undefined);
    }),

    // 라우터 맵 — 어떤 주소가 어떤 화면인지 + 고아 페이지·중복 주소 (§7 B4).
    vscode.commands.registerCommand('axiom-ai.openRouterMap', (routePath?: unknown) => {
      RouterMapPanel.createOrShow(context.extensionUri, typeof routePath === 'string' ? routePath : undefined);
    }),

    // hover 카드의 "정의 열기" — 토큰이 선언된 파일의 그 줄로 이동한다.
    vscode.commands.registerCommand('axiom-ai.openTokenDefinition', (file?: unknown, line?: unknown) => {
      if (typeof file !== 'string') return;
      void DesignTokensPanel.openDefinitionAt(file, typeof line === 'number' ? line : 1);
    }),
  );

  registerCommands(context, launcherProvider, chatProvider);

  // Scaffold 린트(C1) — scaffold 고유 계약을 Problems 패널 진단 + Quick Fix로. 모델 호출 0(오프라인 동작).
  new ScaffoldLintProvider().register(context);
  // Scaffold hover(B2) — 심볼 위에 계약·부품 카드를 띄운다(묻지 않아도 먼저 알려주는 축). 모델 호출 0.
  new ScaffoldHoverProvider(context.extensionUri).register(context);

  // corpus 파일 변경 감시 등록
  chatProvider.registerCorpusWatcher(context);
  // 레시피 카드의 삽입 위치가 편집기 커서를 따라가게 한다(카드를 띄운 채 자리를 고르는 흐름).
  chatProvider.registerCursorTracking(context);

  // RAG 임베딩 인덱스를 백그라운드에서 미리 빌드 시작
  chatProvider.startIndexBuild();
  // 임베딩 모델 콜드 스타트 방지 — buildIndex 완료 여부와 무관하게 파이프라인 워밍업
  initEmbeddingPipeline().catch(() => {});

  // 설정 변경 시 프로젝트 설정 패널 재초기화
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('axiom-ai.sdd.axiomFolder')) {
        _initProjectConfigProvider(projectConfigProvider);
        // 가이드 패널의 localResourceRoots는 생성 시 고정이라 폴더가 바뀌면 재생성한다
        GuidePanel.handleAxiomFolderChange(context.extensionUri);
      }
    }),
  );
}

function _initProjectConfigProvider(provider: ProjectConfigProvider): void {
  const axiomFolder = ExtensionConfig.getSddAxiomFolder();
  if (!axiomFolder) return;

  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
    ? path.join(wsRoot, axiomFolder)
    : axiomFolder;

  provider.setAxiomDir(axiomDir);
}

export function deactivate(): void {}
