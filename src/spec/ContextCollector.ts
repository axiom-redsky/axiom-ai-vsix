import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DomainRouter } from './DomainRouter';
import { SddCorpusLoader } from './SddCorpusLoader';

export interface CollectedContext {
  /** 1순위: 현재 열린 .ts/.tsx 파일 시그니처 */
  activeFileSection: string;
  /** 2순위: .axiom/ 스펙 (도메인 필터) */
  axiomSpecsSection: string;
  /** 3순위: knowledge/ scaffold 컨벤션·패턴 */
  knowledgeSection: string;
  /** 감지된 도메인명 */
  domain: string | null;
}

/** 토큰 예산 (chars 단위, 1토큰 ≈ 4chars) */
const TOKEN_BUDGET = {
  activeFile:  3200,   // 800 tokens
  axiomSpecs:  4800,   // 1200 tokens
  knowledge:   6400,   // 1600 tokens
};

const SCAFFOLD_PATTERNS = ['useApi', 'TAppRoute', 'loadable', 'createHashRouter', 'ApiError'];

/**
 * SDD 스펙 생성을 위한 3계층 컨텍스트 수집기.
 * recency bias 적용: knowledge → .axiom/ → 활성 파일 순으로 프롬프트에 주입.
 */
export class ContextCollector {
  constructor(
    private readonly _axiomDir: string,
    private readonly _knowledgeDir: string,
  ) {}

  async collect(userPrompt: string, currentFilePath?: string): Promise<CollectedContext> {
    const domain = currentFilePath
      ? new DomainRouter(this._axiomDir).detectDomain(currentFilePath)
      : null;

    const loader = new SddCorpusLoader(this._axiomDir);

    const [activeFileSection, axiomSpecsSection, knowledgeSection] = await Promise.all([
      Promise.resolve(this._collectActiveFile(currentFilePath)),
      Promise.resolve(this._collectAxiomSpecs(loader, domain, userPrompt)),
      Promise.resolve(this._collectKnowledge(loader, userPrompt)),
    ]);

    return { activeFileSection, axiomSpecsSection, knowledgeSection, domain };
  }

  /** 1순위: 현재 열린 .ts/.tsx 파일에서 시그니처만 추출 */
  private _collectActiveFile(filePath?: string): string {
    if (!filePath || !filePath.match(/\.(ts|tsx)$/)) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.fileName.match(/\.(ts|tsx)$/)) return '';
      filePath = editor.document.fileName;
    }

    if (!fs.existsSync(filePath)) return '';

    const content = fs.readFileSync(filePath, 'utf-8');
    const signature = this._extractSignature(content);
    const trimmed = signature.slice(0, TOKEN_BUDGET.activeFile);

    return trimmed
      ? `## 현재 열린 파일: ${path.basename(filePath)}\n\`\`\`tsx\n${trimmed}\n\`\`\``
      : '';
  }

  /** import, interface/type, export function/const 라인 + scaffold 패턴만 추출 (최대 60줄) */
  private _extractSignature(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      if (result.length >= 60) break;
      const trimmed = line.trim();

      const isImport = trimmed.startsWith('import ');
      const isType = trimmed.startsWith('interface ') || trimmed.startsWith('type ');
      const isExport = trimmed.startsWith('export ');
      const isScaffoldPattern = SCAFFOLD_PATTERNS.some((p) => trimmed.includes(p));

      if (isImport || isType || isExport || isScaffoldPattern) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /** 2순위: .axiom/ 스펙 (도메인 필터, 키워드 관련성 정렬) */
  private _collectAxiomSpecs(
    loader: SddCorpusLoader,
    domain: string | null,
    userPrompt: string,
  ): string {
    const entries = loader.loadForDomain(domain);

    // 키워드 관련성 정렬
    const q = userPrompt.toLowerCase();
    const scored = entries.map((e) => {
      let score = 0;
      for (const kw of e.keywords) {
        if (q.includes(kw)) score += kw.length * 3;
      }
      if (q.includes(path.basename(e.filePath, '.md').toLowerCase())) score += 10;
      return { e, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // 토큰 예산 내에서만 포함
    const sections: string[] = [];
    let usedChars = 0;
    for (const { e } of scored) {
      if (usedChars + e.content.length > TOKEN_BUDGET.axiomSpecs) break;
      const label = `[${e.tier}${e.domain ? '/' + e.domain : ''}] ${path.basename(e.filePath)}`;
      sections.push(`### ${label}\n${e.content}`);
      usedChars += e.content.length;
    }

    return sections.length > 0
      ? `## 관련 SDD 스펙\n\n${sections.join('\n\n---\n\n')}`
      : '';
  }

  /** 3순위: knowledge/ scaffold 컨벤션·패턴 */
  private _collectKnowledge(loader: SddCorpusLoader, userPrompt: string): string {
    if (!fs.existsSync(this._knowledgeDir)) return '';

    const entries = loader.loadKnowledge(
      this._knowledgeDir,
      userPrompt,
      TOKEN_BUDGET.knowledge,
    );

    const sections = entries.map(
      (e) => `### ${path.basename(e.filePath, '.md')}\n${e.content}`,
    );

    return sections.length > 0
      ? `## Scaffold 지식 참고\n\n${sections.join('\n\n---\n\n')}`
      : '';
  }
}
