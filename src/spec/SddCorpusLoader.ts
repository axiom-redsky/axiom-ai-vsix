import * as fs from 'fs';
import * as path from 'path';

export interface SddCorpusEntry {
  filePath: string;
  content: string;
  tier: 'screens' | 'domain' | 'global' | 'knowledge';
  domain: string | null;
  keywords: string[];
  tokens: number;
}

const AVG_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

function parseFrontmatterTags(content: string): string[] {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const tagsMatch = match[1].match(/tags:\s*\[([^\]]+)\]/);
  if (!tagsMatch) return [];
  return tagsMatch[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, '').toLowerCase());
}

function parseFrontmatterField(content: string, field: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return '';
  const fieldMatch = match[1].match(new RegExp(`${field}:\\s*(.+)`));
  return fieldMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

/**
 * .axiom/ 구조에서 SDD 스펙과 knowledge/ 참고 지식을 로드한다.
 *
 * 계층:
 * - screens/{domain}/ — 화면별 스펙 (가장 구체적)
 * - domain/{domain}/  — 도메인 비즈니스 규칙
 * - global/           — 전역 공용 스펙
 * - knowledge/        — scaffold 컨벤션·패턴 참고 지식
 */
export class SddCorpusLoader {
  constructor(private readonly _axiomDir: string) {}

  /**
   * 주어진 도메인에 관련된 스펙과 knowledge를 로드한다.
   * domain이 null이면 global + knowledge만 반환한다.
   */
  loadForDomain(domain: string | null): SddCorpusEntry[] {
    const entries: SddCorpusEntry[] = [];

    // screens/{domain}/
    if (domain) {
      this._loadDir(path.join(this._axiomDir, 'screens', domain), 'screens', domain, entries);
    }

    // domain/{domain}/
    if (domain) {
      this._loadDir(path.join(this._axiomDir, 'domain', domain), 'domain', domain, entries);
    }

    // global/
    this._loadDir(path.join(this._axiomDir, 'global'), 'global', null, entries);

    return entries;
  }

  /** knowledge/ 폴더에서 사용자 쿼리와 관련된 항목을 키워드 점수 순으로 로드한다 */
  loadKnowledge(knowledgeDir: string, query: string, tokenBudget: number): SddCorpusEntry[] {
    const allEntries: SddCorpusEntry[] = [];
    this._loadDir(knowledgeDir, 'knowledge', null, allEntries);

    // 키워드 관련성 점수 계산
    const scored = allEntries.map((entry) => ({
      entry,
      score: this._scoreEntry(entry, query),
    }));
    scored.sort((a, b) => b.score - a.score);

    // 토큰 예산 내에서만 포함
    const result: SddCorpusEntry[] = [];
    let usedTokens = 0;
    for (const { entry } of scored) {
      if (usedTokens + entry.tokens > tokenBudget) break;
      result.push(entry);
      usedTokens += entry.tokens;
    }
    return result;
  }

  private _scoreEntry(entry: SddCorpusEntry, query: string): number {
    const q = query.toLowerCase();
    let score = 0;

    // frontmatter keywords 매칭 (×3)
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += 3 * kw.length;
    }

    // 파일명 매칭 (×2)
    const fileName = path.basename(entry.filePath, '.md').toLowerCase();
    if (q.includes(fileName)) score += 2 * fileName.length;

    // 본문 매칭 (×1) — 간단히 단어 기준
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      if (entry.content.toLowerCase().includes(word)) score += word.length;
    }

    return score;
  }

  private _loadDir(
    dir: string,
    tier: SddCorpusEntry['tier'],
    domain: string | null,
    out: SddCorpusEntry[],
  ): void {
    if (!fs.existsSync(dir)) return;
    this._walkMd(dir, (filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      out.push({
        filePath,
        content,
        tier,
        domain: domain ?? (parseFrontmatterField(content, 'domain') || null),
        keywords: parseFrontmatterTags(content),
        tokens: estimateTokens(content),
      });
    });
  }

  private _walkMd(dir: string, cb: (filePath: string) => void): void {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        this._walkMd(full, cb);
      } else if (name.endsWith('.md')) {
        cb(full);
      }
    }
  }
}
