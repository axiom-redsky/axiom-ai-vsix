import * as fs from 'fs';
import * as path from 'path';

/**
 * 현재 편집 중인 파일의 경로와 내용을 분석해
 * 관련 .rag/*.md 파일을 자동으로 감지한다 (Method 3).
 *
 * - 경로 기반: domains/, pages/, hooks/, router/ 등 감지
 * - import 기반: UI 컴포넌트·훅 import 구문 파싱
 */
export class FileContextRetriever {
  private _ragDir = '';

  initialize(ragDir: string): void {
    this._ragDir = ragDir;
  }

  /**
   * 파일 경로와 내용을 분석해 관련 .rag 문서 경로 목록을 반환한다.
   * 파일이 없으면 해당 항목은 조용히 건너뛴다.
   */
  matchedFiles(filePath: string, fileContent: string): string[] {
    const detected = new Set<string>();
    const lowerPath = filePath.replace(/\\/g, '/').toLowerCase();

    this._detectByPath(lowerPath, detected);
    this._detectByImports(fileContent, detected);

    return [...detected].filter((rel) =>
      fs.existsSync(path.join(this._ragDir, rel))
    );
  }

  /**
   * matchedFiles()로 얻은 상대 경로들의 파일 내용을 읽어 문자열 배열로 반환한다.
   */
  readFiles(relativePaths: string[]): string[] {
    const results: string[] = [];
    for (const rel of relativePaths) {
      const abs = path.join(this._ragDir, rel);
      if (fs.existsSync(abs)) {
        const content = fs.readFileSync(abs, 'utf-8');
        results.push(`## [${rel}]\n\n${content}`);
      }
    }
    return results;
  }

  /** 파일 경로 패턴으로 관련 문서를 감지한다. */
  private _detectByPath(lowerPath: string, out: Set<string>): void {
    // domains/ 하위 파일 → 도메인 구조 문서
    if (/\/domains\//.test(lowerPath)) {
      out.add('patterns/domain-structure.md');
    }

    // pages/ 하위 → 라우터 문서
    if (/\/pages\//.test(lowerPath)) {
      out.add('patterns/router.md');
    }

    // router/ 하위 → 라우터 문서
    if (/\/router\//.test(lowerPath)) {
      out.add('patterns/router.md');
    }

    // hooks/ 하위 → API 패턴 문서
    if (/\/hooks\//.test(lowerPath)) {
      out.add('patterns/api-call.md');
    }

    // providers/ 하위 → 상태 관리 문서
    if (/\/providers\//.test(lowerPath)) {
      out.add('patterns/state-management.md');
    }

    // form / Form 포함 파일 → 폼 패턴
    if (/form/i.test(lowerPath)) {
      out.add('patterns/form-handling.md');
    }
  }

  /** import 구문을 파싱해 관련 문서를 감지한다. */
  private _detectByImports(content: string, out: Set<string>): void {
    const importLines = content
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line));

    for (const line of importLines) {
      // UI 컴포넌트 감지
      if (/Button/.test(line)) out.add('components/Button.md');
      if (/\bTable\b/.test(line)) out.add('components/Table.md');
      if (/Dialog|Sheet/.test(line)) out.add('components/Dialog.md');
      if (/\bInput\b|\bLabel\b/.test(line)) out.add('components/Input.md');
      if (/\bSelect\b/.test(line)) out.add('components/Select.md');
      if (/\bForm\b|FormField|FormItem/.test(line)) out.add('components/Form.md');

      // API·쿼리 훅 감지
      if (/useApi|@axiom\/hooks/.test(line)) out.add('patterns/api-call.md');
      if (/useQuery|useMutation|@tanstack/.test(line)) {
        // 직접 사용은 지양하도록 문서 참고 유도
        out.add('patterns/api-call.md');
      }

      // 폼 관련
      if (/useForm|react-hook-form|zodResolver|@hookform/.test(line)) {
        out.add('patterns/form-handling.md');
      }
      if (/\bzod\b|z\.object/.test(line)) {
        out.add('patterns/form-handling.md');
      }

      // 라우팅
      if (/useNavigate|useParams|useLocation|react-router/.test(line)) {
        out.add('patterns/router.md');
      }
      if (/loadable|@loadable/.test(line)) {
        out.add('patterns/router.md');
      }
      if (/createAppRouter|createHashRouter/.test(line)) {
        out.add('patterns/router.md');
      }

      // Zustand·상태
      if (/zustand|create\(/.test(line) && /store/i.test(line)) {
        out.add('patterns/state-management.md');
      }
    }
  }
}
