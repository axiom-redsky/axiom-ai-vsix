/**
 * 라우터 자료 읽기 (§7 B4) — 패널과 hover가 **함께 쓰는** 한 곳
 * (B2 `CatalogSource` · B3 `TokenSource`와 같은 규약: 출처가 갈라지면 두 화면이 다른 말을 한다).
 *
 * 무엇을 읽는가:
 *  - **라우터 파일** = `src/**​/router/*.tsx?` — 단, `src/core`는 라우터를 *만드는* 쪽(프레임워크)이라 뺀다.
 *  - **페이지 파일** = `src/domains/*​/pages/**` · `src/publishing/*​/pages/**` — 고아 페이지 판정 대상.
 *    ⚠ `__stories__`·`*.stories.tsx`·`*.test.tsx`는 화면이 아니라 **문서/테스트**라 제외한다
 *    (실측: 안 빼면 스토리 파일이 "열 수 있는 주소가 없다"고 신고된다 — 당연히 없다).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildRouterMap, type IRouterFile, type IRouterMap } from '../ai/router/RouterMap';

/** 스캔에서 통째로 빼는 디렉터리. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '__stories__']);
/** 화면이 아닌 파일(문서·테스트·스토리). */
const NON_SCREEN = /\.(stories|test|spec)\.[jt]sx?$/i;

export interface IRouterSource {
  map: IRouterMap;
  /** 워크스페이스 루트(정의 열기용). null이면 이 워크스페이스엔 라우터가 없다. */
  root: string | null;
  /** 라우터 파일을 하나도 못 찾았는가. */
  empty: boolean;
}

/** 워크스페이스 루트 중 `src/domains`가 있는 곳(scaffold 신호). */
export function findScaffoldRoot(): string | null {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    try {
      if (fs.existsSync(path.join(folder.uri.fsPath, 'src', 'domains'))) return folder.uri.fsPath;
    } catch {
      /* 접근 불가는 없는 것으로 */
    }
  }
  return null;
}

/** `src` 아래 파일을 훑는다(워크스페이스 기준 상대경로, 슬래시 통일). */
function walkSrc(root: string): string[] {
  const out: string[] = [];
  const rec = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.[jt]sx?$/.test(e.name)) {
        out.push(path.relative(root, p).split(path.sep).join('/'));
      }
    }
  };
  rec(path.join(root, 'src'));
  return out;
}

/** 라우터 맵을 읽어 조립한다. 자료가 없으면 빈 맵(호출부는 조용히 아무것도 안 하면 된다). */
export function loadRouterMap(): IRouterSource {
  const root = findScaffoldRoot();
  if (!root) {
    return { map: buildRouterMap({ files: [] }), root: null, empty: true };
  }

  const all = walkSrc(root);
  const routerFiles: IRouterFile[] = [];
  const pageFiles: string[] = [];

  for (const rel of all) {
    if (NON_SCREEN.test(rel)) continue;
    // 라우터: `…/router/무엇.tsx`. core는 라우터를 만드는 쪽이라 제외한다.
    if (/\/router\/[^/]+\.[jt]sx?$/.test(rel) && !rel.startsWith('src/core/')) {
      try {
        routerFiles.push({ path: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') });
      } catch {
        /* 한 파일이 깨져도 나머지는 보여준다 */
      }
      continue;
    }
    if (/^src\/(domains|publishing)\/[^/]+\/pages\/.*\.[jt]sx$/.test(rel)) pageFiles.push(rel);
  }

  return {
    map: buildRouterMap({ files: routerFiles, pageFiles }),
    root,
    empty: routerFiles.length === 0,
  };
}

/** 이 문서가 라우터 맵에 영향을 주는 파일인가 — 저장 시 캐시를 버릴지 판단한다. */
export function isRouterDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') return false;
  const root = findScaffoldRoot();
  if (!root) return false;
  const rel = path.relative(root, doc.uri.fsPath).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  // 라우터 파일이거나 페이지 파일이면(페이지가 생기고 없어지면 고아 목록이 바뀐다).
  return /\/router\/[^/]+\.[jt]sx?$/.test(rel)
    || /^src\/(domains|publishing)\/[^/]+\/pages\/.*\.[jt]sx$/.test(rel);
}

/** 워크스페이스 기준 상대경로의 파일을 그 줄에서 연다. */
export async function openWorkspaceFile(file: string, line: number): Promise<void> {
  const root = findScaffoldRoot() ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  if (!root) {
    vscode.window.showWarningMessage('워크스페이스를 찾지 못했습니다.');
    return;
  }
  const abs = path.resolve(root, file);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs)) {
    vscode.window.showWarningMessage(`파일을 열 수 없습니다: ${file}`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const at = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(at, at);
  editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
}
