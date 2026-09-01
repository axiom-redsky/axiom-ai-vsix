/**
 * 디자인 토큰 자료 읽기 (§7 B3) — hover와 토큰 브라우저 패널이 **함께 쓰는** 한 곳.
 * (B2에서 `CatalogSource`를 공유한 것과 같은 이유: 출처가 갈라지면 두 화면이 다른 값을 말한다.)
 *
 * ★ **진실은 `app.css`의 `@import` 순서**다. `themes/` 폴더에는 지금 안 쓰는 테마 파일이 함께 들어
 * 있고(주석 처리된 `theme-example-project.css`), 폴더를 통째로 읽으면 **활성이 아닌 테마의 색**이
 * 섞여 사실과 다른 값을 보여주게 된다. 그래서 진입점이 실제로 부른 파일만, 부른 순서대로 읽는다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildTokenSet, parseImportOrder, type ITokenFile, type ITokenSet } from '../ai/tokens/DesignTokens';

/** scaffold의 스타일 진입점 위치(CLAUDE.md 구조 정의). */
const STYLES_DIR = ['src', 'assets', 'styles'];
const ENTRY_CSS = 'app.css';
/** 진입점이 없을 때의 최소 폴백 — Style Dictionary 산출물만이라도 읽는다. */
const FALLBACK_FILES = ['tokens/primitive.css', 'tokens/theme-light.css', 'tokens/theme-dark.css'];

export interface IDesignTokenSource {
  set: ITokenSet;
  /** 스타일 루트 절대경로(소스 열기용). null이면 이 워크스페이스에 토큰이 없다. */
  stylesRoot: string | null;
  /** `app.css`를 따라갔는지, 폴백이었는지 — 화면에 사실대로 적는다. */
  followedEntry: boolean;
  /** import 목록에는 있는데 실제로 없던 파일(진단용). */
  missing: string[];
}

/** 워크스페이스의 스타일 루트. scaffold가 아니면 null. */
export function findStylesRoot(): string | null {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = path.join(folder.uri.fsPath, ...STYLES_DIR);
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {
      /* 접근 불가는 없는 것으로 */
    }
  }
  return null;
}

/** 디자인 토큰을 읽어 조립한다. 자료가 없으면 빈 집합(호출부는 조용히 아무것도 안 하면 된다). */
export function loadDesignTokens(): IDesignTokenSource {
  const stylesRoot = findStylesRoot();
  if (!stylesRoot) {
    return { set: buildTokenSet([]), stylesRoot: null, followedEntry: false, missing: [] };
  }

  const read = (rel: string): string | null => {
    try {
      return fs.readFileSync(path.join(stylesRoot, rel), 'utf8');
    } catch {
      return null;
    }
  };

  const entry = read(ENTRY_CSS);
  const order = entry ? parseImportOrder(entry) : [];
  const wanted = order.length > 0 ? order : FALLBACK_FILES;

  const files: ITokenFile[] = [];
  const missing: string[] = [];
  for (const rel of wanted) {
    const text = read(rel);
    if (text === null) missing.push(rel);
    else files.push({ path: rel, text });
  }

  return {
    set: buildTokenSet(files),
    stylesRoot,
    followedEntry: order.length > 0,
    missing,
  };
}

/** 이 문서가 토큰 자료에 영향을 주는 파일인가 — 저장 시 캐시를 버릴지 판단한다. */
export function isStyleDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') return false;
  if (!/\.(css|scss|less)$/i.test(doc.uri.fsPath)) return false;
  const root = findStylesRoot();
  if (!root) return false;
  const rel = path.relative(root, doc.uri.fsPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
