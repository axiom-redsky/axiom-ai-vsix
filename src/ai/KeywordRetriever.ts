import * as fs from 'fs';
import * as path from 'path';
import type { IndexEntry } from './ExternalCorpusLoader';
import { loadAndScoreSections, type MdSection } from './SectionExtractor';

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
   * 외부 corpus 인덱스를 병합한다.
   * 외부 파일 경로를 externalDir 기준 절대경로로 변환하여 _entries에 추가한다.
   */
  mergeExternalIndex(entries: IndexEntry[], externalDir: string): void {
    for (const entry of entries) {
      this._entries.push({
        keywords: entry.keywords,
        files: entry.files.map((f) => path.join(externalDir, f)),
      });
    }
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
   * matchedFiles()로 얻은 경로들의 파일 내용을 읽어 문자열 배열로 반환한다.
   * 절대경로면 그대로 사용하고, 상대경로면 ragDir 기준으로 결합한다.
   * 존재하지 않는 파일은 조용히 건너뛴다.
   */
  readFiles(filePaths: string[]): string[] {
    const results: string[] = [];
    for (const p of filePaths) {
      const abs = path.isAbsolute(p) ? p : path.join(this._ragDir, p);
      if (fs.existsSync(abs)) {
        const content = fs.readFileSync(abs, 'utf-8');
        results.push(`## [${p}]\n\n${content}`);
      }
    }
    return results;
  }

  /**
   * matchedFiles()로 얻은 경로들을 섹션 단위로 분할하고 쿼리 점수를 부여해 반환한다.
   * 파일 전체를 통째로 읽는 readFiles() 와 달리,
   * 호출자가 토큰 예산에 맞춰 상위 섹션만 선별할 수 있게 한다.
   */
  readSections(filePaths: string[], queryTokens: string[]): MdSection[] {
    const sections: MdSection[] = [];
    for (const p of filePaths) {
      const abs = path.isAbsolute(p) ? p : path.join(this._ragDir, p);
      if (!fs.existsSync(abs)) continue;
      const label = path.isAbsolute(p) ? path.basename(p) : p;
      sections.push(...loadAndScoreSections(abs, label, queryTokens));
    }
    return sections;
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
