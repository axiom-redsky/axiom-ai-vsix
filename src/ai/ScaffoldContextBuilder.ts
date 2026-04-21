import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { RagRetriever } from './RagRetriever';
import type { EditorContext } from './EditorContextCollector';

export class ScaffoldContextBuilder {
  private readonly _retriever = new RagRetriever();
  private _corpusDir: string | null | undefined = undefined; // undefined = 아직 탐색 전

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * corpus 디렉터리를 확인하고 RAG 인덱스 빌드를 백그라운드에서 시작한다.
   * activate 시점에 호출하면 첫 채팅 전에 인덱스가 준비된다.
   */
  startIndexBuild(): void {
    const dir = this._getCorpusDir();
    if (dir) {
      this._retriever.buildIndex(dir).catch((err) => {
        console.error('[axiom-ai] RAG 인덱스 빌드 실패:', err);
      });
    }
  }

  /**
   * 사용자 질문과 관련된 corpus 청크만 골라 시스템 프롬프트를 조립한다.
   * RAG 인덱스가 준비되지 않은 경우 scaffold 문서 섹션을 빈 문자열로 처리한다.
   */
  async buildSystemPrompt(ctx: EditorContext, userQuery: string): Promise<string> {
    const corpusDir = this._getCorpusDir();

    // 인덱스가 아직 없으면 빌드 시작 (startIndexBuild 를 건너뛴 경우 대비)
    if (corpusDir && !this._retriever.isReady()) {
      this._retriever.buildIndex(corpusDir).catch((err) => {
        console.error('[axiom-ai] RAG 인덱스 빌드 실패:', err);
      });
    }

    const ragDocs = corpusDir
      ? await this._retriever.retrieve(userQuery)
      : '(corpus 문서를 찾을 수 없습니다. axiom-ai.corpusPath 설정을 확인하세요.)';

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

    const scaffoldSection = ragDocs
      ? `## Scaffold 문서 (관련 항목)\n${ragDocs}`
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

  /** corpus 파일이 변경된 경우 RAG 인덱스를 재빌드한다. */
  invalidateAndRebuild(): void {
    this._retriever.reset();
    this.startIndexBuild();
  }

  private _getCorpusDir(): string | null {
    if (this._corpusDir !== undefined) return this._corpusDir;

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      for (const folder of folders) {
        const candidate = path.resolve(folder.uri.fsPath, ExtensionConfig.getCorpusPath());
        if (fs.existsSync(candidate)) {
          this._corpusDir = candidate;
          return candidate;
        }
      }
    }

    const bundled = vscode.Uri.joinPath(this.extensionUri, 'corpus').fsPath;
    this._corpusDir = fs.existsSync(bundled) ? bundled : null;
    return this._corpusDir;
  }
}
