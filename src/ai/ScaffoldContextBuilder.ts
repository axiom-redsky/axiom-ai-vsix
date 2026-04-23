import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { HybridRagEngine } from './HybridRagEngine';
import type { EditorContext } from './EditorContextCollector';

interface DomainContext {
  domainName: string | null;
  domainExists: boolean;
  /** 도메인이 존재할 때: 기존 도메인 라우터 파일 내용 */
  domainRouterContent: string | null;
  /** 신규 도메인일 때: 현재 루트 라우터 파일 내용 */
  rootRouterContent: string | null;
}

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
   * - 페이지 생성 요청 시 도메인 존재 여부를 감지하여 프롬프트에 주입
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

    // 도메인 컨텍스트 감지 및 라우터 파일 내용 주입
    const domainCtx = this._getDomainContext(userQuery);
    const domainSection = this._buildDomainSection(domainCtx);

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

## 파일 생성 기능 (DDD 구조)
이 프로젝트는 DDD(Domain Driven Design) 패턴을 사용하며 업무별 코드는 src/domains/{domain}/ 하위에 위치합니다.
사용자가 특정 업무(domain)에 파일 생성을 요청하면, 응답 끝에 아래 형식의 액션 블록을 반드시 포함해야 합니다.

### 지원 templateType
- page: 페이지 컴포넌트 → src/domains/{domain}/pages/{ComponentName}.tsx
- component: 도메인 컴포넌트 → src/domains/{domain}/components/{ComponentName}.tsx
- store: 상태관리 모듈 → src/domains/{domain}/store/{componentName}.ts
- api: API 모듈 → src/domains/{domain}/api/{componentName}.ts
- router: 라우터 파일 → src/domains/{domain}/router/index.tsx

### 파일명 규칙
- 컴포넌트(page, component): PascalCase (예: AccountList)
- 일반 파일(store, api): camelCase (예: accountList)

### 중요: axiom-action 블록 형식 규칙
- JSON 메타데이터와 코드를 **분리**하여 작성한다 (JSON 안에 코드를 넣지 말 것)
- JSON 한 줄 다음에 코드 블록(\`\`\`tsx)을 바로 이어서 작성
- updateFile 액션의 코드 블록은 수정된 **전체 파일 내용**이어야 함

### 시나리오 A: 도메인이 이미 존재하는 경우 (axiom-action 2개)
응답 끝에 아래 2개의 블록을 순서대로 포함:

블록 1 — 페이지 파일 생성:
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
\`\`\`tsx
// 전체 TSX 코드를 여기에 작성
\`\`\`
</axiom-action>

블록 2 — 기존 도메인 라우터에 신규 페이지 경로 추가 (아래 [현재 도메인 라우터 파일] 내용을 수정):
<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
\`\`\`tsx
// 신규 페이지가 추가된 라우터 전체 파일 내용
\`\`\`
</axiom-action>

### 시나리오 B: 도메인이 존재하지 않는 경우 / 신규 도메인 (axiom-action 3개)
응답 끝에 아래 3개의 블록을 순서대로 포함:

블록 1 — 페이지 파일 생성:
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
\`\`\`tsx
// 전체 TSX 코드
\`\`\`
</axiom-action>

블록 2 — 도메인 라우터 파일 신규 생성:
<axiom-action>
{"action":"createFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
\`\`\`tsx
// 도메인 라우터 전체 코드
\`\`\`
</axiom-action>

블록 3 — 루트 라우터에 도메인 등록 (아래 [현재 루트 라우터 파일] 내용을 수정):
<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/shared/router/index.tsx"}
\`\`\`tsx
// 신규 도메인이 등록된 루트 라우터 전체 파일 내용
\`\`\`
</axiom-action>

${domainSection}${scaffoldSection}${fileSection}`;
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
   * 사용자 쿼리에서 도메인명을 추출하고, 워크스페이스에서 도메인 존재 여부를 확인한다.
   * 도메인이 존재하면 기존 도메인 라우터 파일을, 신규 도메인이면 루트 라우터 파일을 읽는다.
   */
  private _getDomainContext(userQuery: string): DomainContext {
    const domainName = this._extractDomainFromQuery(userQuery);

    if (!domainName) {
      return { domainName: null, domainExists: false, domainRouterContent: null, rootRouterContent: null };
    }

    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) {
      return { domainName, domainExists: false, domainRouterContent: null, rootRouterContent: null };
    }

    const domainDir = path.join(wsRoot, 'src', 'domains', domainName);
    const domainExists = fs.existsSync(domainDir);

    if (domainExists) {
      // 기존 도메인 → 도메인 라우터 파일 내용 주입
      const routerFile = path.join(domainDir, 'router', 'index.tsx');
      const domainRouterContent = fs.existsSync(routerFile)
        ? fs.readFileSync(routerFile, 'utf-8')
        : null;
      return { domainName, domainExists: true, domainRouterContent, rootRouterContent: null };
    } else {
      // 신규 도메인 → 루트 라우터 파일 내용 주입
      const rootRouterFile = path.join(wsRoot, 'src', 'shared', 'router', 'index.tsx');
      const rootRouterContent = fs.existsSync(rootRouterFile)
        ? fs.readFileSync(rootRouterFile, 'utf-8')
        : null;
      return { domainName, domainExists: false, domainRouterContent: null, rootRouterContent };
    }
  }

  /**
   * 도메인 컨텍스트를 시스템 프롬프트 섹션 문자열로 변환한다.
   * 도메인 관련 요청이 아닌 경우 빈 문자열을 반환한다.
   */
  private _buildDomainSection(ctx: DomainContext): string {
    if (!ctx.domainName) return '';

    const lines: string[] = [];
    lines.push(`\n---\n\n## 페이지 생성 컨텍스트`);
    lines.push(`- 요청 도메인: **${ctx.domainName}**`);
    lines.push(`- 도메인 존재 여부: **${ctx.domainExists ? '존재함 (시나리오 A 적용)' : '없음 (시나리오 B 적용)'}**`);

    if (ctx.domainExists && ctx.domainRouterContent) {
      lines.push(`\n### 현재 도메인 라우터 파일 (src/domains/${ctx.domainName}/router/index.tsx)`);
      lines.push('```tsx');
      lines.push(ctx.domainRouterContent);
      lines.push('```');
      lines.push('\n위 파일에 신규 페이지 loadable import와 routes 배열 항목을 추가하여 updateFile 블록의 generatedCode를 작성하세요.');
    } else if (ctx.domainExists && !ctx.domainRouterContent) {
      lines.push(`\n도메인 폴더는 존재하지만 router/index.tsx 파일이 없습니다. createFile로 라우터도 새로 생성하세요 (시나리오 B 적용).`);
    }

    if (!ctx.domainExists && ctx.rootRouterContent) {
      lines.push(`\n### 현재 루트 라우터 파일 (src/shared/router/index.tsx)`);
      lines.push('```tsx');
      lines.push(ctx.rootRouterContent);
      lines.push('```');
      lines.push('\n위 파일에 신규 도메인 import와 routes 배열 항목을 추가하여 updateFile 블록의 generatedCode를 작성하세요.');
    } else if (!ctx.domainExists && !ctx.rootRouterContent) {
      lines.push(`\nsrc/shared/router/index.tsx 파일을 찾을 수 없습니다. 루트 라우터 파일 경로를 확인하세요.`);
    }

    lines.push('\n---\n');
    return lines.join('\n');
  }

  /**
   * 사용자 쿼리에서 도메인명을 추출한다.
   * "account 업무", "account domain", "account에", "account 업무에" 패턴을 인식한다.
   */
  private _extractDomainFromQuery(query: string): string | null {
    const patterns = [
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*업무/,
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*domain/i,
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*도메인/,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    }
    return null;
  }

  private _getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
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
