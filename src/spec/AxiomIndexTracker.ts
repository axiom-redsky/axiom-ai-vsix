import * as fs from 'fs';
import * as path from 'path';

export interface SpecIndexEntry {
  specPath: string;
  linkedSourcePath: string;
  lastModified: string;
  domain: string;
  status: 'draft' | 'review' | 'approved' | 'implemented' | 'stale';
  approvedBy?: string;
  approvedAt?: string;
}

interface AxiomIndex {
  specs: SpecIndexEntry[];
}

interface AuditEntry {
  ts: string;
  spec: string;
  from: string;
  to: string;
  by: string;
}

const STALENESS_DAYS = 30;

/**
 * .axiom-index.json 읽기/쓰기 및 staleness·status·audit log 추적.
 */
export class AxiomIndexTracker {
  private readonly _indexPath: string;
  private readonly _auditPath: string;

  constructor(private readonly _axiomDir: string) {
    this._indexPath = path.join(_axiomDir, '.axiom-index.json');
    this._auditPath = path.join(_axiomDir, '.audit-log.ndjson');
  }

  readIndex(): AxiomIndex {
    if (!fs.existsSync(this._indexPath)) return { specs: [] };
    try {
      return JSON.parse(fs.readFileSync(this._indexPath, 'utf-8')) as AxiomIndex;
    } catch {
      return { specs: [] };
    }
  }

  writeIndex(index: AxiomIndex): void {
    fs.writeFileSync(this._indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /** 스펙 항목을 추가하거나 업데이트한다 */
  upsertSpec(entry: SpecIndexEntry): void {
    const index = this.readIndex();
    const idx = index.specs.findIndex((s) => s.specPath === entry.specPath);
    if (idx >= 0) {
      index.specs[idx] = entry;
    } else {
      index.specs.push(entry);
    }
    this.writeIndex(index);
  }

  /** specPath로 항목 조회 */
  getSpec(specPath: string): SpecIndexEntry | undefined {
    return this.readIndex().specs.find((s) => s.specPath === specPath);
  }

  /**
   * status를 전이하고 audit log에 기록한다.
   * approved 전이 시 approvedBy, approvedAt을 함께 업데이트한다.
   */
  transitionStatus(
    specPath: string,
    newStatus: SpecIndexEntry['status'],
    by: string,
  ): boolean {
    const index = this.readIndex();
    const entry = index.specs.find((s) => s.specPath === specPath);
    if (!entry) return false;

    const from = entry.status;
    entry.status = newStatus;
    entry.lastModified = new Date().toISOString().slice(0, 10);

    if (newStatus === 'approved') {
      entry.approvedBy = by;
      entry.approvedAt = new Date().toISOString().slice(0, 10);
    }

    this.writeIndex(index);
    this._appendAuditLog({ ts: new Date().toISOString(), spec: specPath, from, to: newStatus, by });
    return true;
  }

  /**
   * 모든 스펙의 staleness를 검사한다.
   * 소스 파일이 변경된 후 STALENESS_DAYS일 이상 스펙 미갱신이면 stale 처리.
   * @returns 만료된 스펙 목록
   */
  checkStaleness(workspaceRoot: string): SpecIndexEntry[] {
    const index = this.readIndex();
    const stale: SpecIndexEntry[] = [];
    const now = Date.now();

    for (const entry of index.specs) {
      if (entry.status === 'stale') {
        stale.push(entry);
        continue;
      }

      const sourcePath = path.join(workspaceRoot, entry.linkedSourcePath);
      if (!fs.existsSync(sourcePath)) continue;

      const sourceMtime = fs.statSync(sourcePath).mtimeMs;
      const lastModified = new Date(entry.lastModified).getTime();
      const daysDiff = (now - Math.max(sourceMtime, lastModified)) / (1000 * 60 * 60 * 24);

      if (sourceMtime > lastModified && daysDiff > STALENESS_DAYS) {
        entry.status = 'stale';
        stale.push(entry);
      }
    }

    if (stale.length > 0) this.writeIndex(index);
    return stale;
  }

  private _appendAuditLog(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this._auditPath, line, 'utf-8');
  }
}
