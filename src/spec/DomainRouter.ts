import * as fs from 'fs';
import * as path from 'path';

interface DomainMapEntry {
  pattern: string;
  domain: string;
}

/**
 * 파일 경로에서 react-app-scaffold 도메인명을 감지한다.
 * 1순위: src/domains/{domain}/ 표준 패턴
 * 2순위: domain-map.json override (비표준 구조 프로젝트)
 */
export class DomainRouter {
  private readonly _domainMap: DomainMapEntry[];

  constructor(private readonly _axiomDir: string) {
    this._domainMap = this._loadDomainMap();
  }

  detectDomain(filePath: string): string | null {
    // 1순위: react-app-scaffold 표준 패턴
    const match = filePath.match(/[/\\]domains[/\\]([^/\\]+)[/\\]/);
    if (match?.[1]) return match[1];

    // 2순위: domain-map.json override
    return this._matchFromMap(filePath);
  }

  /** .axiom/ 하위 도메인 목록 반환 */
  listDomains(): string[] {
    const screensDir = path.join(this._axiomDir, 'screens');
    if (!fs.existsSync(screensDir)) return [];
    return fs.readdirSync(screensDir).filter((name) => {
      return fs.statSync(path.join(screensDir, name)).isDirectory();
    });
  }

  private _matchFromMap(filePath: string): string | null {
    for (const entry of this._domainMap) {
      if (filePath.includes(entry.pattern)) return entry.domain;
    }
    return null;
  }

  private _loadDomainMap(): DomainMapEntry[] {
    const mapPath = path.join(this._axiomDir, 'domain-map.json');
    if (!fs.existsSync(mapPath)) return [];
    try {
      const raw = fs.readFileSync(mapPath, 'utf-8');
      return JSON.parse(raw) as DomainMapEntry[];
    } catch {
      return [];
    }
  }
}
