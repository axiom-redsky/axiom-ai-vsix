import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ParsedSpec } from './SpecFileWriter';

/**
 * approved 상태의 spec.md를 파싱하여 scaffold 컨벤션 기반 TSX 스텁을 생성한다.
 * /scaffold 커맨드 또는 axiom-ai.scaffoldFromSpec 명령으로 진입.
 */
export class SpecScaffolder {
  /**
   * spec에서 TSX 스텁을 생성하고 대상 경로에 저장 후 에디터에서 열어준다.
   * @returns 생성된 파일 절대 경로
   */
  async generate(parsed: ParsedSpec, workspaceRoot: string): Promise<string> {
    const { frontmatter } = parsed;
    const domain = frontmatter.domain ?? 'unknown';
    const screen = frontmatter.screen ?? 'Unknown';

    const targetPath = path.join(
      workspaceRoot,
      'src',
      'domains',
      domain,
      'pages',
      `${screen}.tsx`,
    );

    // 이미 존재하면 덮어쓸지 확인
    if (fs.existsSync(targetPath)) {
      const answer = await vscode.window.showWarningMessage(
        `${screen}.tsx 파일이 이미 존재합니다. 덮어씁니까?`,
        { modal: true },
        '덮어쓰기',
      );
      if (answer !== '덮어쓰기') return '';
    }

    const stub = this._buildStub(parsed);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, stub, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc, { preview: false });

    return targetPath;
  }

  private _buildStub(parsed: ParsedSpec): string {
    const { frontmatter, body } = parsed;
    const screen = frontmatter.screen ?? 'Unknown';
    const domain = frontmatter.domain ?? 'unknown';

    // API 섹션에서 엔드포인트 추출 시도
    const apiMatch = body.match(/- (POST|GET|PUT|DELETE)\s+(\/[^\s\n]+)/);
    const apiMethod = apiMatch?.[1] ?? 'GET';
    const apiEndpoint = apiMatch?.[2] ?? `/api/${domain}`;

    // Props interface 생성
    const propsInterface = `interface ${screen}Props {}`;

    // useApi 타입 추론
    const hasPost = body.toLowerCase().includes('post') || body.toLowerCase().includes('mutation');
    const useApiLine = hasPost
      ? `const { mutate, isPending } = useApi<unknown, unknown>('${apiEndpoint}', { method: '${apiMethod}' });`
      : `const { data, isLoading } = useApi<unknown>('${apiEndpoint}');`;

    // 예외처리 섹션 확인
    const hasApiError = body.includes('ApiError');

    const lines: string[] = [
      `import { useApi } from '@axiom/hooks';`,
      hasApiError ? `import type { ApiError } from '@axiom/hooks';` : '',
      ``,
      propsInterface,
      ``,
      `export default function ${screen}({}: ${screen}Props) {`,
      `  ${useApiLine}`,
      ``,
      `  // TODO: 스펙 기반 구현 필요`,
      `  // 스펙: .axiom/screens/${domain}/${screen}/spec.md`,
      ``,
      `  return (`,
      `    <div>`,
      `      <h1>${screen}</h1>`,
      `      {/* TODO: 컴포넌트 구현 */}`,
      `    </div>`,
      `  );`,
      `}`,
    ];

    return lines.filter((l) => l !== null).join('\n');
  }
}
