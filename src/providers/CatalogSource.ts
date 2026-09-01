/**
 * 컴포넌트 카탈로그의 **자료 읽기 한 곳** — 카탈로그 패널(B1·A4)과 hover(B2)가 같이 쓴다.
 *
 * 원래 `ComponentCatalogPanel` 안에 있던 파일 읽기를 hover가 같은 자료를 필요로 해 끌어냈다.
 * 두 벌로 두면 "패널에는 보이는데 hover에는 안 보이는" 부품이 생긴다 — 자료 출처(워크스페이스 시드본
 * → 번들 스냅샷)가 갈라지는 순간 그렇게 된다.
 *
 * 조립·검색은 여전히 순수 모듈(`ai/catalog/ComponentCatalog`)이 한다. 여기는 **어디서 읽는지**만 안다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { buildCatalog, type ICatalogEntry, type IRawDoc } from '../ai/catalog/ComponentCatalog';
import { COMPONENT_PROPS_INDEX } from '../ai/contracts/generated/componentPropsIndex';

/** 가이드 문서 중 컴포넌트 문서만 있는 하위 경로(가이드 루트 기준). */
export const GUIDE_COMPONENT_DIR = ['components', 'ui'];
/** 지식 문서 중 컴포넌트 문서 하위 경로(지식 루트 기준). */
export const KNOWLEDGE_COMPONENT_DIR = 'components';

export interface ICatalogSource {
  entries: ICatalogEntry[];
  guideDocs: IRawDoc[];
  knowledgeDocs: IRawDoc[];
  /** 지식 문서를 실제로 읽은 디렉터리(없으면 null) — "문서가 비었다"의 진단용. */
  knowledgeDir: string | null;
}

/**
 * 가이드 루트는 GuidePanel과 **같은 2계층**(워크스페이스 시드본 → 번들 스냅샷)을 따른다.
 * 다르게 고르면 카드에 보이는 요약과 딥링크로 열리는 문서가 갈라진다.
 */
export function guideRoot(extensionUri: vscode.Uri): string | null {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
  const seeded = path.isAbsolute(axiomFolder)
    ? path.join(axiomFolder, 'guide')
    : wsRoot ? path.join(wsRoot, axiomFolder, 'guide') : null;
  if (seeded && fs.existsSync(path.join(seeded, ...GUIDE_COMPONENT_DIR))) return seeded;

  const bundled = vscode.Uri.joinPath(extensionUri, 'media', 'guide-docs').fsPath;
  return fs.existsSync(bundled) ? bundled : null;
}

/**
 * 이 docId의 가이드 문서가 실제로 있는지. hover 링크는 **있는 문서에만** 건다 —
 * 없는 문서로 보내면 눌렀을 때 "문서를 읽을 수 없습니다"만 뜬다.
 */
export function hasGuideDoc(extensionUri: vscode.Uri, docId: string): boolean {
  const root = guideRoot(extensionUri);
  if (!root) return false;
  // docId는 가이드 루트 기준 상대경로 계약. 루트 밖으로 나가는 경로는 거부한다.
  const abs = path.resolve(root, `${docId}.md`);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try {
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

/** 디렉터리의 .md를 이름순으로 읽는다(읽기 실패는 조용히 건너뛴다 — 목록은 계속 떠야 한다). */
function readMarkdownDir(dir: string): { name: string; text: string }[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md')).sort();
  } catch {
    return [];
  }
  const out: { name: string; text: string }[] = [];
  for (const name of names) {
    try {
      out.push({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') });
    } catch {
      /* 한 파일이 깨져도 나머지는 보여준다 */
    }
  }
  return out;
}

function readGuideDocs(extensionUri: vscode.Uri): IRawDoc[] {
  const root = guideRoot(extensionUri);
  if (!root) return [];
  const dir = path.join(root, ...GUIDE_COMPONENT_DIR);
  return readMarkdownDir(dir).map((f) => ({
    // docId = 가이드 루트 기준 확장자 없는 상대경로(openGuide 딥링크 계약).
    id: [...GUIDE_COMPONENT_DIR, path.basename(f.name, '.md')].join('/'),
    text: f.text,
  }));
}

/** 지식 루트도 워크스페이스(.axiom/knowledge) 우선, 없으면 번들 knowledge/. */
function readKnowledgeDocs(extensionUri: vscode.Uri): { docs: IRawDoc[]; dir: string | null } {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const axiomFolder = ExtensionConfig.getSddAxiomFolder() || '.axiom';
  const candidates: string[] = [];
  if (path.isAbsolute(axiomFolder)) candidates.push(path.join(axiomFolder, 'knowledge'));
  else if (wsRoot) candidates.push(path.join(wsRoot, axiomFolder, 'knowledge'));
  candidates.push(vscode.Uri.joinPath(extensionUri, 'knowledge').fsPath);

  for (const root of candidates) {
    const dir = path.join(root, KNOWLEDGE_COMPONENT_DIR);
    const files = readMarkdownDir(dir);
    if (files.length > 0) {
      return { docs: files.map((f) => ({ id: `${KNOWLEDGE_COMPONENT_DIR}/${f.name}`, text: f.text })), dir };
    }
  }
  return { docs: [], dir: null };
}

/** 세 자료(props 인덱스 · 가이드 · 지식)를 읽어 카탈로그를 조립한다. */
export function loadComponentCatalog(extensionUri: vscode.Uri): ICatalogSource {
  const guideDocs = readGuideDocs(extensionUri);
  const knowledge = readKnowledgeDocs(extensionUri);
  return {
    entries: buildCatalog({ index: COMPONENT_PROPS_INDEX, guideDocs, knowledgeDocs: knowledge.docs }),
    guideDocs,
    knowledgeDocs: knowledge.docs,
    knowledgeDir: knowledge.dir,
  };
}
