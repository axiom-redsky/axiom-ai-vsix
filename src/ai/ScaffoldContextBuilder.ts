import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { HybridRagEngine } from './HybridRagEngine';
import type { EditorContext } from './EditorContextCollector';

export class ScaffoldContextBuilder {
  private readonly _engine = new HybridRagEngine();
  private _ragDir: string | null | undefined = undefined; // undefined = 아직 탐색 전

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * .rag/ 디렉터리를 확인하고 HybridRagEngine을 초기화한다.
   * activate 시점에 호출하면 첫 채팅 전에 임베딩 인덱스가 준비된다.
   */
  startIndexBuild(): void {
    const dir = this._getRagDir();
    if (dir) {
      this._engine.initialize(dir);
    }
  }

  /**
   * 사용자 질문과 현재 파일 컨텍스트를 기반으로 시스템 프롬프트를 조립한다.
   *
   * - Method 1 (키워드 라우팅) + Method 3 (파일 컨텍스트) 병렬 실행
   * - 결과가 부족하면 Method 2 (임베딩 유사도) 폴백
   */
  async buildSystemPrompt(ctx: EditorContext, userQuery: string): Promise<string> {
    const ragDir = this._getRagDir();

    let scaffoldSection = '';

    if (ragDir) {
      const ragCtx = await this._engine.buildContext(
        userQuery,
        ctx.filePath ?? '',
        ctx.content ?? ''
      );

      if (ragCtx.docs.length > 0) {
        scaffoldSection =
          `## Scaffold 문서 (관련 항목)\n` +
          ragCtx.docs.join('\n\n---\n\n');
      }
    } else {
      scaffoldSection =
        '(scaffold 지식 문서를 찾을 수 없습니다. axiom-ai.ragPath 설정을 확인하세요.)';
    }

    const fileSection = ctx.available
      ? [
          '\n\n---\n\n## 현재 열린 파일: ' + ctx.filePath,
          '```' + ctx.language,
          ctx.content,
          '```',
          ctx.selectedText
            ? `\n### 선택된 텍스트\n\`\`\`\n${ctx.selectedText}\n\`\`\``
            : '',
        ].join('\n')
      : '';

    return `당신은 Axiom AI입니다. react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- 모든 코드는 아래 scaffold 문서의 패턴을 따라야 합니다
- createBrowserRouter 사용 금지 → 항상 createHashRouter (createAppRouter() 경유)
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- 상대경로 임포트 금지 → @axiom/components/ui, @axiom/hooks, @/ 앨리어스 사용
- scaffold의 package.json에 없는 라이브러리 제안 금지
- 코드 주석은 한국어로 작성

## 프로젝트 스택
React 19, TypeScript, Vite 8, TanStack Query v5 (v5 API만 사용), shadcn/ui, TailwindCSS 4
해시 기반 라우팅 (createHashRouter), 도메인 기반 아키텍처 (core/domains/shared)

${scaffoldSection}${fileSection}`;
  }

  /** .rag/ 파일이 변경된 경우 캐시를 초기화하고 엔진을 재빌드한다. */
  invalidateAndRebuild(): void {
    this._ragDir = undefined; // 경로 캐시 초기화 (디렉터리 이동 대비)
    this._engine.invalidate();
    const dir = this._getRagDir();
    if (dir) {
      this._engine.initialize(dir);
    }
  }

  /**
   * .rag/ 디렉터리 위치를 결정한다.
   *
   * 우선순위:
   * 1. 워크스페이스 루트의 .rag/ (프로젝트 오버라이드)
   * 2. 확장 번들 내 .rag/ (기본값)
   */
  private _getRagDir(): string | null {
    if (this._ragDir !== undefined) return this._ragDir;

    const ragPath = ExtensionConfig.getRagPath();

    // 워크스페이스 우선 탐색
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      for (const folder of folders) {
        const candidate = path.resolve(folder.uri.fsPath, ragPath);
        if (fs.existsSync(candidate)) {
          this._ragDir = candidate;
          return candidate;
        }
      }
    }

    // 확장 번들 내 .rag/ 폴백
    const bundled = vscode.Uri.joinPath(this.extensionUri, '.rag').fsPath;
    this._ragDir = fs.existsSync(bundled) ? bundled : null;
    return this._ragDir;
  }
}
