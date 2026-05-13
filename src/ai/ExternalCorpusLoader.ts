import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** KeywordRetriever와 공유하는 인덱스 엔트리 타입 */
export interface IndexEntry {
  keywords: string[];
  files: string[];
}

/** ExternalCorpusLoader.load()의 반환값 */
export interface ExternalCorpus {
  /** 사용자 _index.md 파싱 결과 (없으면 frontmatter tags에서 자동 생성) */
  indexEntries: IndexEntry[];
  /** 외부 corpus 루트 절대경로 */
  ragDir: string;
  /** 유효한 .md 파일 절대경로 목록 (임베딩 인덱스 포함용) */
  validFiles: string[];
  /** 유효하지 않은 파일과 그 이유 (경고용) */
  invalidFiles: { path: string; reason: string }[];
}

const REQUIRED_FIELDS = ['title', 'category', 'tags'];

/**
 * 런타임에 사용자 corpus 폴더를 로드·검증한다.
 * - 재귀 스캔 → frontmatter 파싱 → 필수 필드 검증
 * - _index.md 존재 시 IndexEntry[] 파싱
 * - 없으면 frontmatter tags에서 자동 생성
 * - 오류/경고는 OutputChannel에 기록
 */
export class ExternalCorpusLoader {
  constructor(private readonly _outputChannel: vscode.OutputChannel) {}

  load(folderPath: string): ExternalCorpus {
    const result: ExternalCorpus = {
      indexEntries: [],
      ragDir: folderPath,
      validFiles: [],
      invalidFiles: [],
    };

    if (!fs.existsSync(folderPath)) {
      this._log(`[external] 폴더 없음: ${folderPath}`);
      return result;
    }

    const allMd = this._walkMd(folderPath);

    // _index.md 존재 여부 확인
    const indexPath = path.join(folderPath, '_index.md');
    if (fs.existsSync(indexPath)) {
      result.indexEntries = this._parseIndexMd(indexPath);
      this._log(`[external] _index.md 파싱 완료 → ${result.indexEntries.length}개 엔트리`);
    }

    // frontmatter 검증 및 유효 파일 수집
    const autoEntries: IndexEntry[] = [];

    for (const absPath of allMd) {
      const rel = path.relative(folderPath, absPath).replace(/\\/g, '/');
      const content = fs.readFileSync(absPath, 'utf-8');
      const { meta } = this._parseFrontmatter(content);

      const issues = this._validateMeta(meta, rel);

      if (issues.length > 0) {
        for (const issue of issues) {
          this._log(`[warn] ${issue}`);
        }
        result.invalidFiles.push({ path: absPath, reason: issues.join('; ') });
        // 유효하지 않은 파일도 임베딩에는 포함 (키워드 라우팅만 제외)
        result.validFiles.push(absPath);
        continue;
      }

      result.validFiles.push(absPath);

      // _index.md가 없을 때만 frontmatter tags로 자동 엔트리 생성
      if (!fs.existsSync(indexPath) && meta && Array.isArray(meta['tags'])) {
        autoEntries.push({
          keywords: (meta['tags'] as string[]).map((t) => t.toLowerCase()),
          files: [rel],
        });
      }
    }

    // _index.md 없으면 frontmatter tags 기반 엔트리 사용
    if (!fs.existsSync(indexPath)) {
      result.indexEntries = autoEntries;
    }

    const warnCount = result.invalidFiles.length;
    this._log(
      `[external] Loaded ${result.validFiles.length} files from ${folderPath}` +
        (warnCount > 0 ? ` (${warnCount} warning${warnCount > 1 ? 's' : ''})` : '')
    );

    return result;
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private _log(msg: string): void {
    this._outputChannel.appendLine(msg);
  }

  /** .md 파일 재귀 탐색 (`_`로 시작하는 항목 제외) */
  private _walkMd(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('_')) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        this._walkMd(full, out);
      } else if (name.endsWith('.md')) {
        out.push(full);
      }
    }
    return out;
  }

  /** YAML frontmatter 파싱 */
  private _parseFrontmatter(content: string): { meta: Record<string, unknown> | null; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { meta: null, body: content };

    const raw = match[1];
    const meta: Record<string, unknown> = {};

    for (const line of raw.split('\n').map((l) => l.replace(/\r$/, ''))) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (!kv) continue;
      const key = kv[1];
      let val: unknown = kv[2].trim();

      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        val = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (typeof val === 'string') {
        val = val.replace(/^["']|["']$/g, '');
      }

      meta[key] = val;
    }

    return { meta, body: match[2] };
  }

  /** _index.md에서 IndexEntry[] 파싱 */
  private _parseIndexMd(indexPath: string): IndexEntry[] {
    const text = fs.readFileSync(indexPath, 'utf-8');
    const entries: IndexEntry[] = [];

    const kwRegex = /- keywords:\s*\[([^\]]+)\]/g;
    const filesRegex = /files:\s*\[([^\]]+)\]/g;

    const kwMatches = [...text.matchAll(kwRegex)];
    const fileMatches = [...text.matchAll(filesRegex)];

    const len = Math.min(kwMatches.length, fileMatches.length);
    for (let i = 0; i < len; i++) {
      const keywords = kwMatches[i][1]
        .split(',')
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean);
      const files = fileMatches[i][1]
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      if (keywords.length > 0 && files.length > 0) {
        entries.push({ keywords, files });
      }
    }

    return entries;
  }

  /** frontmatter 필수 필드 검증. 문제 있는 경우 이유 문자열 배열 반환 */
  private _validateMeta(meta: Record<string, unknown> | null, relPath: string): string[] {
    const issues: string[] = [];

    if (!meta) {
      issues.push(`missing required field 'title', 'category', 'tags' in ${relPath} (frontmatter 없음)`);
      return issues;
    }

    const missing = REQUIRED_FIELDS.filter((f) => !meta[f]);
    if (missing.length > 0) {
      issues.push(`missing required field '${missing.join("', '")}' in ${relPath}`);
    }

    return issues;
  }
}
