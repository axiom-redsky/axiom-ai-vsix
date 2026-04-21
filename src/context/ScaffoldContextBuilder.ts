import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { EditorContext } from './EditorContextCollector';

export class ScaffoldContextBuilder {
  private cachedDocs: string | null = null;

  private findCorpusDir(): string | null {
    const corpusPath = ExtensionConfig.getCorpusPath();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return null;

    for (const folder of folders) {
      const candidate = path.resolve(folder.uri.fsPath, corpusPath);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private loadDocs(corpusDir: string): string {
    const docsDir = path.join(corpusDir, 'scaffold-docs');
    if (!fs.existsSync(docsDir)) return '';

    return fs
      .readdirSync(docsDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((file) => {
        const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
        return `## [${file}]\n\n${content}`;
      })
      .join('\n\n---\n\n');
  }

  buildSystemPrompt(ctx: EditorContext): string {
    if (!this.cachedDocs) {
      const corpusDir = this.findCorpusDir();
      this.cachedDocs = corpusDir
        ? this.loadDocs(corpusDir)
        : '(corpus 문서를 찾을 수 없습니다. axiom-ai.corpusPath 설정을 확인하세요.)';
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

## Scaffold 문서
${this.cachedDocs}${fileSection}`;
  }

  /** corpus 내용이 변경된 경우 캐시를 초기화한다 */
  invalidateCache(): void {
    this.cachedDocs = null;
  }
}
