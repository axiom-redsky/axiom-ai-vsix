import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AxiomIndexTracker } from '../spec/AxiomIndexTracker';
import type { SpecIndexEntry } from '../spec/AxiomIndexTracker';

type SpecStatus = SpecIndexEntry['status'] | 'unknown';

const STATUS_BADGE: Record<SpecStatus, string> = {
  draft:       '✏️',
  review:      '👀',
  approved:    '✅',
  implemented: '🔨',
  stale:       '⚠️',
  unknown:     '📄',
};

/** TreeView 노드 */
class SddTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly specPath?: string,
    public readonly status?: SpecStatus,
    public readonly contextValue?: string,
  ) {
    super(label, collapsibleState);
    if (specPath) {
      this.resourceUri = vscode.Uri.file(specPath);
      this.command = {
        command: 'axiom-ai.openSpec',
        title: 'Open Spec',
        arguments: [specPath],
      };
      const badge = STATUS_BADGE[status ?? 'unknown'];
      this.description = badge;
      this.tooltip = `${badge} ${status ?? 'unknown'} — ${path.basename(path.dirname(specPath))}`;
    }
    this.contextValue = contextValue;
  }
}

/**
 * .axiom/ 디렉터리를 TreeView로 표시하는 사이드바 패널.
 * global / domain / screens 계층을 트리로 렌더링하고
 * 각 spec 아이템에 상태 배지와 컨텍스트 메뉴를 제공한다.
 */
export class SddPanelProvider implements vscode.TreeDataProvider<SddTreeItem> {
  public static readonly viewId = 'axiom-ai.sddPanel';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SddTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _tracker: AxiomIndexTracker | null = null;
  private _axiomDir: string | null = null;
  private _watcher: vscode.FileSystemWatcher | null = null;

  constructor() {}

  /** .axiom/ 경로를 설정하고 트리를 갱신한다 */
  setAxiomDir(axiomDir: string): void {
    this._axiomDir = axiomDir;
    this._tracker = new AxiomIndexTracker(axiomDir);
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** .axiom/ 변경 감시자 등록 */
  registerWatcher(context: vscode.ExtensionContext): void {
    if (!this._axiomDir) return;
    try {
      this._watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(this._axiomDir), '**/*.md'),
      );
      const refresh = () => this.refresh();
      context.subscriptions.push(
        this._watcher,
        this._watcher.onDidChange(refresh),
        this._watcher.onDidCreate(refresh),
        this._watcher.onDidDelete(refresh),
      );
    } catch {
      // axiomDir가 아직 없을 수 있음
    }
  }

  getTreeItem(element: SddTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SddTreeItem): vscode.ProviderResult<SddTreeItem[]> {
    if (!this._axiomDir || !fs.existsSync(this._axiomDir)) {
      return [
        new SddTreeItem(
          '.axiom 폴더가 설정되지 않았습니다',
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    if (!element) {
      return this._getRootItems();
    }

    // 루트 폴더(global/domain/screens) 하위 항목
    const dirPath = element.specPath ?? element.resourceUri?.fsPath;
    return this._getChildItems(element.label as string, dirPath);
  }

  private _getRootItems(): SddTreeItem[] {
    const items: SddTreeItem[] = [];
    const dirs = ['global', 'domain', 'screens'];
    for (const dir of dirs) {
      const fullPath = path.join(this._axiomDir!, dir);
      if (fs.existsSync(fullPath)) {
        const item = new SddTreeItem(
          dir,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          undefined,
          'sddFolder',
        );
        item.iconPath = new vscode.ThemeIcon('folder');
        items.push(item);
      }
    }
    return items;
  }

  private _getChildItems(folderName: string, parentPath?: string): SddTreeItem[] {
    const dirPath = parentPath ?? path.join(this._axiomDir!, folderName);

    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath);
    const items: SddTreeItem[] = [];

    for (const name of entries) {
      if (name.startsWith('.') || name.startsWith('_')) continue;
      const fullPath = path.join(dirPath, name);
      const st = fs.statSync(fullPath);

      if (st.isDirectory()) {
        const item = new SddTreeItem(
          name,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          undefined,
          'sddFolder',
        );
        item.iconPath = new vscode.ThemeIcon('folder');
        // 디렉터리 경로를 resourceUri로 설정해 getChildren에서 활용
        item.resourceUri = vscode.Uri.file(fullPath);
        items.push(item);
      } else if (name === 'spec.md') {
        const status = this._getSpecStatus(fullPath);
        const screenName = path.basename(dirPath);
        const badge = STATUS_BADGE[status];
        const item = new SddTreeItem(
          `${badge} ${screenName}`,
          vscode.TreeItemCollapsibleState.None,
          fullPath,
          status,
          'sddSpec',
        );
        item.iconPath = new vscode.ThemeIcon('file-text');
        items.push(item);
      } else if (name.endsWith('.md')) {
        const status = this._getSpecStatus(fullPath);
        const badge = STATUS_BADGE[status];
        const item = new SddTreeItem(
          `${badge} ${name.replace('.md', '')}`,
          vscode.TreeItemCollapsibleState.None,
          fullPath,
          status,
          'sddSpec',
        );
        item.iconPath = new vscode.ThemeIcon('file-text');
        items.push(item);
      }
    }

    return items;
  }

  private _getSpecStatus(specPath: string): SpecStatus {
    if (!this._tracker) return 'unknown';
    const rel = path.relative(this._axiomDir!, specPath).replace(/\\/g, '/');
    const entry = this._tracker.getSpec(rel);
    if (entry) return entry.status;

    // .axiom-index.json에 없으면 frontmatter에서 직접 읽기
    try {
      const content = fs.readFileSync(specPath, 'utf-8');
      const match = content.match(/^status:\s*(\w+)$/m);
      if (match) return match[1] as SpecStatus;
    } catch {
      // ignore
    }
    return 'unknown';
  }
}
