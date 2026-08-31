// 가이드 공용 순수 유틸 — 호스트(GuidePanel)·테스트 공용. vscode 무의존(fs도 안 씀).
import type { ITocManifest, ITocSidebar, TTocNode } from '../types/guide';

/** '미분류' 사이드바 고정 id — toc 미등재 md가 자동 노출되는 그룹. */
export const UNCATEGORIZED_SIDEBAR_ID = '_uncategorized';

/** frontmatter(YAML 단순형: `key: value` 줄들)를 분리한다. CRLF 안전. 블록이 없으면 meta={} + 원문 그대로. */
export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: src.slice(m[0].length) };
}

/** toc 전체에서 doc id를 등장 순서대로 수집한다(중첩 category 재귀). */
export function collectDocIds(toc: ITocManifest): string[] {
  const ids: string[] = [];
  const walk = (nodes: TTocNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'doc') ids.push(n.id);
      else walk(n.items);
    }
  };
  for (const sb of toc.sidebars) walk(sb.items);
  return ids;
}

/**
 * toc에 등재되지 않은 docId들을 '미분류' 사이드바로 만든다. 없으면 null.
 * 나중에 등록한 가이드 md가 _toc.json 편집 없이도 즉시 트리에 보이게 하는 안전망.
 */
export function buildUncategorizedSidebar(allDocIds: string[], toc: ITocManifest): ITocSidebar | null {
  const known = new Set(collectDocIds(toc));
  const orphans = allDocIds.filter((id) => !known.has(id)).sort();
  if (orphans.length === 0) return null;
  return {
    id: UNCATEGORIZED_SIDEBAR_ID,
    label: '미분류',
    items: orphans.map((id) => ({ type: 'doc', id })),
  };
}

/** 제목 → 파일 slug. 영문·숫자 케밥. 한글 등만 남아 slug가 비면 날짜 기반 폴백. */
export function slugifyTitle(title: string, now: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `guide-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** 신규 가이드 md 템플릿 — frontmatter + 섹션 골격. */
export function buildNewDocTemplate(title: string): string {
  return [
    '---',
    `title: '${title.replace(/'/g, "''")}'`,
    'sidebar_position: 99',
    '---',
    '',
    `# ${title}`,
    '',
    '## 개요',
    '',
    '(가이드 내용을 작성하세요)',
    '',
  ].join('\n');
}

/** 워처 fsPath 등 OS 경로 → docId용 '/' 정규화. */
export function normalizeDocPath(p: string): string {
  return p.replace(/\\/g, '/');
}
