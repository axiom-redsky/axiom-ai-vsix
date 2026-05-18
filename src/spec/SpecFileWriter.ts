import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';

export interface SpecFrontmatter {
  title: string;
  category: string;
  domain: string;
  screen: string;
  owner: string;
  reviewer: string;
  status: 'draft' | 'review' | 'approved' | 'implemented';
  'last-approved': string;
  'compliance-tags': string[];
  tags: string[];
}

export interface ParsedSpec {
  frontmatter: Partial<SpecFrontmatter>;
  body: string;
  raw: string;
}

export interface ComplianceIssue {
  field: string;
  message: string;
}

/**
 * 스펙 마크다운을 .axiom/screens/{domain}/{Screen}/spec.md 에 저장한다.
 * 저장 전 컴플라이언스 필드 검증을 수행한다.
 */
export class SpecFileWriter {
  constructor(private readonly _axiomDir: string) {}

  /** LLM이 생성한 마크다운에서 frontmatter를 파싱한다 */
  parseDraft(raw: string): ParsedSpec {
    const match = raw.match(/---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: raw, raw };

    const frontmatter: Partial<SpecFrontmatter> = {};
    for (const line of match[1].split('\n').map((l) => l.replace(/\r$/, ''))) {
      const kv = line.match(/^([\w-]+):\s*(.+)$/);
      if (!kv) continue;
      const key = kv[1] as keyof SpecFrontmatter;
      let val: unknown = kv[2].trim().replace(/^["']|["']$/g, '');
      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      (frontmatter as Record<string, unknown>)[key] = val;
    }

    return { frontmatter, body: match[2], raw };
  }

  /**
   * 누락된 frontmatter 필드를 defaults로 채우고 raw를 재구성한다.
   * AI가 항상 모든 필드를 채울 수 없으므로, 코드가 채울 수 있는 필드는 여기서 처리한다.
   */
  applyDefaults(parsed: ParsedSpec, defaults: Partial<SpecFrontmatter>): ParsedSpec {
    const fm = { ...parsed.frontmatter };
    let changed = false;

    for (const [key, value] of Object.entries(defaults)) {
      if (!(fm as Record<string, unknown>)[key]) {
        (fm as Record<string, unknown>)[key] = value;
        changed = true;
      }
    }

    if (!changed) return parsed;

    // frontmatter를 재직렬화해서 raw 재구성
    const fmLines: string[] = [];
    for (const [key, value] of Object.entries(fm)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        fmLines.push(`${key}: [${(value as string[]).join(', ')}]`);
      } else {
        fmLines.push(`${key}: ${String(value)}`);
      }
    }

    const newRaw = `---\n${fmLines.join('\n')}\n---\n${parsed.body}`;
    return { frontmatter: fm as Partial<SpecFrontmatter>, body: parsed.body, raw: newRaw };
  }

  /** 컴플라이언스 필드 검증. 문제가 있으면 이슈 배열 반환 */
  validateCompliance(parsed: ParsedSpec): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];
    const { frontmatter } = parsed;

    const requiredBase = ['title', 'category', 'domain', 'screen', 'owner', 'status', 'tags'];
    for (const f of requiredBase) {
      if (!(frontmatter as Record<string, unknown>)[f]) {
        issues.push({ field: f, message: `필수 필드 '${f}'가 없습니다` });
      }
    }

    if (ExtensionConfig.getSddRequireComplianceTags()) {
      const tags = frontmatter['compliance-tags'];
      if (!tags || (Array.isArray(tags) && tags.length === 0)) {
        issues.push({ field: 'compliance-tags', message: '금융 컴플라이언스 태그가 필요합니다' });
      }
      if (!frontmatter.reviewer) {
        issues.push({ field: 'reviewer', message: '금융 화면은 reviewer 필드가 필수입니다' });
      }
    }

    return issues;
  }

  /**
   * 스펙을 .axiom/screens/{domain}/{screen}/spec.md 에 저장한다.
   * 저장 후 에디터에서 파일을 열어준다.
   */
  async save(parsed: ParsedSpec, overrideContent?: string): Promise<string> {
    const { frontmatter } = parsed;
    const domain = frontmatter.domain ?? 'unknown';
    const screen = frontmatter.screen ?? 'Unknown';

    const specDir = path.join(this._axiomDir, 'screens', domain, screen);
    fs.mkdirSync(specDir, { recursive: true });

    const specPath = path.join(specDir, 'spec.md');
    const content = overrideContent ?? parsed.raw;
    fs.writeFileSync(specPath, content, 'utf-8');

    // 에디터에서 열기
    const doc = await vscode.workspace.openTextDocument(specPath);
    await vscode.window.showTextDocument(doc, { preview: false });

    return specPath;
  }

  /** 기존 spec.md의 status 필드를 업데이트한다 */
  updateStatus(
    specPath: string,
    newStatus: SpecFrontmatter['status'],
    by: string,
  ): void {
    if (!fs.existsSync(specPath)) return;
    const content = fs.readFileSync(specPath, 'utf-8');
    const updated = content
      .replace(/^status:\s*.+$/m, `status: ${newStatus}`)
      .replace(/^last-approved:\s*.+$/m, `last-approved: ${new Date().toISOString().slice(0, 10)}`);

    // last-approved 필드가 없으면 추가
    const hasLastApproved = /^last-approved:/m.test(updated);
    const finalContent = hasLastApproved
      ? updated
      : updated.replace(/^(status:\s*.+)$/m, `$1\nlast-approved: ${new Date().toISOString().slice(0, 10)}\napproved-by: ${by}`);

    fs.writeFileSync(specPath, finalContent, 'utf-8');
  }
}
