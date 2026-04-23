import * as fs from 'fs';
import * as path from 'path';

interface IndexEntry {
  keywords: string[];
  files: string[];
}

/**
 * .rag/_index.md 를 파싱해 키워드→파일 매핑을 메모리에 로드한다.
 * 사용자 질문의 키워드와 일치하는 .rag/*.md 파일 내용을 반환한다 (Method 1).
 */
export class KeywordRetriever {
  private _entries: IndexEntry[] = [];
  private _ragDir = '';

  /**
   * ragDir 내의 _index.md 를 파싱해 인덱스를 초기화한다.
   * 파일이 없으면 조용히 빈 상태로 유지한다.
   */
  initialize(ragDir: string): void {
    this._ragDir = ragDir;
    this._entries = this._parseIndex(ragDir);
  }

  /**
   * 질문 문자열과 키워드를 대조해 관련 파일 경로 목록을 반환한다.
   * 매칭 결과는 중복 없이 정렬된다.
   */
  matchedFiles(query: string): string[] {
    if (this._entries.length === 0) return [];

    const q = query.toLowerCase();
    const matched = new Set<string>();

    for (const entry of this._entries) {
      if (entry.keywords.some((kw) => q.includes(kw))) {
        for (const f of entry.files) {
          matched.add(f);
        }
      }
    }

    return [...matched];
  }

  /**
   * matchedFiles()로 얻은 상대 경로들의 파일 내용을 읽어 문자열 배열로 반환한다.
   * 존재하지 않는 파일은 조용히 건너뛴다.
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

  /**
   * _index.md 에서 keywords / files 블록을 정규식으로 파싱한다.
   *
   * 지원 형식 (한 라인):
   *   - keywords: [a, b, c]
   *     files: [components/Button.md]
   */
  private _parseIndex(ragDir: string): IndexEntry[] {
    const indexPath = path.join(ragDir, '_index.md');
    if (!fs.existsSync(indexPath)) return [];

    const text = fs.readFileSync(indexPath, 'utf-8');
    const entries: IndexEntry[] = [];

    // keywords 라인과 바로 다음 files 라인을 쌍으로 파싱
    const kwRegex = /- keywords:\s*\[([^\]]+)\]/g;
    const filesRegex = /files:\s*\[([^\]]+)\]/g;

    const kwMatches = [...text.matchAll(kwRegex)];
    const fileMatches = [...text.matchAll(filesRegex)];

    const len = Math.min(kwMatches.length, fileMatches.length);
    for (let i = 0; i < len; i++) {
      const keywords = kwMatches[i][1]
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const files = fileMatches[i][1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (keywords.length > 0 && files.length > 0) {
        entries.push({ keywords, files });
      }
    }

    return entries;
  }
}
