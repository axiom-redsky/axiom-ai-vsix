/**
 * 타입 자료 읽기 (§7 D2) — Mock 데이터 생성기가 쓰는 **한 곳**
 * (B2 `CatalogSource` · B3 `TokenSource` · B4 `RouterSource`와 같은 규약).
 *
 * 무엇을 읽는가: `src/**​/*.ts(x)`의 `type`·`interface` 선언 전부.
 *  - `*.d.ts`는 전역 선언(환경 타입)이라 뺀다 — 데이터 모양이 아니다.
 *  - `__stories__`·`*.stories.tsx`도 뺀다(문서용 타입이라 목록만 어지럽힌다).
 *
 * 색인은 **파일 단위로 캐시**한다. 타입 파일은 자주 바뀌지 않는데 워크스페이스 전체 스캔은
 * 매번 하면 느리다 — 저장/삭제된 파일만 다시 읽는다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildTypeIndex, parseTypeFile, shapeOfDeclaration,
  type ITypeDecl, type ITypeFile, type ITypeIndex,
} from '../ai/mock/TypeShape';
import { mockability, type TMockability } from '../ai/mock/MockData';
import { findScaffoldRoot } from './RouterSource';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '__stories__']);
const SKIP_FILES = /\.(stories|test|spec)\.[jt]sx?$|\.d\.ts$/i;

/** 목록에 뿌릴 타입 한 줄 — 값 만들기까지 해 보고 등급을 매긴 결과. */
export interface ITypeEntry {
  name: string;
  kind: 'type' | 'interface';
  file: string;
  line: number;
  /** 데이터로 쓸 만한가(`data`/`partial`/`ui`). */
  level: TMockability;
  /** 그렇게 판단한 이유(사람이 읽는 문장). */
  levelReason: string;
  /** 필드 수(객체가 아니면 0). */
  fieldCount: number;
}

export interface ITypeSource {
  index: ITypeIndex;
  entries: ITypeEntry[];
  root: string | null;
}

/** 파일 단위 캐시 — 경로 → (mtime, 파싱 결과). */
const cache = new Map<string, { mtime: number; parsed: ITypeFile }>();

/** 워크스페이스의 타입을 전부 읽어 색인과 목록을 만든다. */
export function loadTypeSource(): ITypeSource {
  const root = findScaffoldRoot() ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  if (!root) return { index: buildTypeIndex([]), entries: [], root: null };

  const files: ITypeFile[] = [];
  const seen = new Set<string>();
  for (const rel of walkSrc(root)) {
    const abs = path.join(root, rel);
    seen.add(abs);
    try {
      const mtime = fs.statSync(abs).mtimeMs;
      const hit = cache.get(abs);
      if (hit && hit.mtime === mtime) {
        files.push(hit.parsed);
        continue;
      }
      const parsed = parseTypeFile(fs.readFileSync(abs, 'utf8'), rel);
      cache.set(abs, { mtime, parsed });
      files.push(parsed);
    } catch {
      /* 한 파일이 깨져도 나머지는 보여준다 */
    }
  }
  for (const key of [...cache.keys()]) if (!seen.has(key)) cache.delete(key);

  const index = buildTypeIndex(files);
  const entries: ITypeEntry[] = [];
  for (const file of files) {
    for (const decl of file.decls) {
      entries.push(describe(decl, index));
    }
  }
  // 데이터로 쓸 만한 것을 위로, 그다음 이름순 — 목록의 첫 화면에서 쓸 타입이 보여야 한다.
  const rank: Record<TMockability, number> = { data: 0, partial: 1, ui: 2 };
  entries.sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));
  return { index, entries, root };
}

function describe(decl: ITypeDecl, index: ITypeIndex): ITypeEntry {
  const { shape, issues } = shapeOfDeclaration(decl, index);
  const { level, reason } = mockability(shape, issues);
  const target = shape.kind === 'array' ? shape.item : shape;
  return {
    name: decl.name,
    kind: decl.kind,
    file: decl.file,
    line: decl.line,
    level,
    levelReason: reason,
    fieldCount: target.kind === 'object' ? target.fields.length : 0,
  };
}

/** 이 문서가 타입 목록에 영향을 주는가 — 저장하면 목록을 새로 그린다. */
export function isTypeDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') return false;
  const root = findScaffoldRoot() ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  if (!root) return false;
  const rel = path.relative(root, doc.uri.fsPath).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return rel.startsWith('src/') && /\.[jt]sx?$/.test(rel) && !SKIP_FILES.test(rel);
}

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
      else if (/\.tsx?$/.test(e.name) && !SKIP_FILES.test(e.name)) {
        out.push(path.relative(root, p).split(path.sep).join('/'));
      }
    }
  };
  rec(path.join(root, 'src'));
  return out;
}
