import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { WebviewToHostMessage, HostToWebviewMessage, ProjectConfig } from '../types/messages';

const CONFIG_JSON = '.project-config.json';
const CONFIG_MD   = 'project-config.md';

export class ProjectConfigProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.projectConfigPanel';

  private _view?: vscode.WebviewView;
  private _axiomDir: string | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  setAxiomDir(dir: string): void {
    this._axiomDir = dir;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'loadProjectConfig':
          this._post({ type: 'projectConfigLoaded', config: this._loadConfig() });
          break;
        case 'saveProjectConfig':
          this._saveConfig(msg.config);
          this._post({ type: 'projectConfigSaved' });
          break;
      }
    });
  }

  // ─── 파일 읽기 / 쓰기 ──────────────────────────────────────────────────────

  private _knowledgeDir(): string | null {
    return this._axiomDir ? path.join(this._axiomDir, 'knowledge') : null;
  }

  private _loadConfig(): ProjectConfig | null {
    const dir = this._knowledgeDir();
    if (!dir) return null;

    const jsonPath = path.join(dir, CONFIG_JSON);
    if (!fs.existsSync(jsonPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ProjectConfig;
    } catch {
      return null;
    }
  }

  private _saveConfig(config: ProjectConfig): void {
    const dir = this._knowledgeDir();
    if (!dir) {
      vscode.window.showErrorMessage('axiom-ai.sdd.axiomFolder 설정이 필요합니다.');
      return;
    }

    fs.mkdirSync(dir, { recursive: true });

    // 소스 JSON (폼 복원용)
    fs.writeFileSync(
      path.join(dir, CONFIG_JSON),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    // AI가 읽을 마크다운 (RAG 대상)
    fs.writeFileSync(
      path.join(dir, CONFIG_MD),
      this._generateMarkdown(config),
      'utf-8',
    );
  }

  private _generateMarkdown(config: ProjectConfig): string {
    const projectLabel = config.projectName || '(미설정)';
    const lines: string[] = [];

    // 프론트매터
    lines.push('---');
    lines.push(`title: 프로젝트 설정 — ${projectLabel}`);
    lines.push(`tags: [project-config, 프로젝트설정, layout, 레이아웃, si프로젝트]`);
    lines.push('scope: design-system');
    lines.push('---');
    lines.push('');

    lines.push(`# 프로젝트 설정 — ${projectLabel}`);
    lines.push('');

    // 기본 정보
    lines.push('## 기본 정보');
    lines.push(`- 프로젝트명: ${config.projectName}`);
    lines.push('<!-- 예: ○○은행 차세대 시스템, □□보험 포털 -->');
    lines.push(`- 디자인 가이드: ${config.designGuideUrl}`);
    lines.push('<!-- 예: https://www.figma.com/... 또는 사내 위키 URL. 없으면 비워두세요. -->');
    lines.push('');

    // 퍼블리셔 마크업 컨벤션
    lines.push('## 퍼블리셔 마크업 컨벤션');
    lines.push('<!-- 퍼블리셔가 납품하는 HTML/CSS의 클래스 네이밍 규칙이나 마크업 구조를 작성하세요.');
    lines.push('예:');
    lines.push('- 버튼: .btn .btn-primary .btn-sm');
    lines.push('- 카드 래퍼: .card-wrap > .card-header + .card-body');
    lines.push('- 폼 라벨: <label class="form-label"> 항상 input 위에 위치');
    lines.push('-->');
    if (config.publisherConventions) {
      lines.push(config.publisherConventions);
    }
    lines.push('');

    // 레이아웃 패턴
    lines.push('## 레이아웃 패턴');
    lines.push('<!-- 이 섹션은 AI가 페이지 구조를 추천할 때 참조합니다.');
    lines.push('화면 유형별로 어떤 레이아웃 구조를 채택했는지 간략히 설명하거나 예시 코드를 작성하세요. -->');
    lines.push('');

    lines.push('### 목록 화면');
    lines.push('<!-- 예: 상단 검색 필터 카드 + 하단 테이블 카드 2단 구조. 페이지 패딩 p-6. -->');
    if (config.layoutPatterns.listPage) {
      lines.push(config.layoutPatterns.listPage);
    }
    lines.push('');

    lines.push('### 상세 화면');
    lines.push('<!-- 예: 헤더(뒤로가기 + 제목) + 탭(기본정보/이력) 구조. max-w-4xl 제한. -->');
    if (config.layoutPatterns.detailPage) {
      lines.push(config.layoutPatterns.detailPage);
    }
    lines.push('');

    lines.push('### 폼 화면');
    lines.push('<!-- 예: 단일 카드 안에 react-hook-form. 하단 고정 저장/취소 버튼. max-w-2xl. -->');
    if (config.layoutPatterns.formPage) {
      lines.push(config.layoutPatterns.formPage);
    }
    lines.push('');

    // 특이사항
    lines.push('## 특이사항');
    lines.push('<!-- 위 항목에 맞지 않는 프로젝트 특이사항을 자유롭게 작성하세요.');
    lines.push('예: GNB는 RootLayout 헤더 영역을 프로젝트 전용 컴포넌트로 교체함.');
    lines.push('예: 다크모드 미지원. 라이트 모드 고정.');
    lines.push('-->');
    if (config.notes) {
      lines.push(config.notes);
    }

    return lines.join('\n');
  }

  // ─── 내부 유틸 ──────────────────────────────────────────────────────────────

  private _post(msg: HostToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
    );
    const nonce = Array.from(
      { length: 32 },
      () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 62)
        ],
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
  <title>프로젝트 설정</title>
</head>
<body data-mode="project-config">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
