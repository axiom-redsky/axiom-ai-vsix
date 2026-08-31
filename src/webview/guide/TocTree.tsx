import React, { useState } from 'react';
import type { ITocManifest, TTocNode } from '../../types/guide';

interface ITocTreeProps {
  toc: ITocManifest;
  titles: Record<string, string>;
  currentDocId: string | null;
  filter: string;
  onSelect: (docId: string) => void;
}

/** docId → 표시 라벨: frontmatter title 우선, 없으면 경로 말단. */
function docLabel(id: string, titles: Record<string, string>): string {
  return titles[id] ?? id.split('/').pop() ?? id;
}

function collectDocsUnder(nodes: TTocNode[], acc: string[]): string[] {
  for (const n of nodes) {
    if (n.type === 'doc') acc.push(n.id);
    else collectDocsUnder(n.items, acc);
  }
  return acc;
}

export function TocTree({ toc, titles, currentDocId, filter, onSelect }: ITocTreeProps): React.ReactElement {
  // 접힘 상태 — key = `사이드바id/카테고리경로`. 초기값은 toc의 collapsed 필드(기본 펼침).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCollapsed = (key: string, initial: boolean | undefined): boolean => collapsed[key] ?? initial ?? false;
  const toggle = (key: string, initial: boolean | undefined): void =>
    setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed(key, initial) }));

  const q = filter.trim().toLowerCase();

  // 검색 모드 — 트리 대신 매칭 문서의 평평한 목록(라벨·docId 부분일치)
  if (q) {
    const matches = toc.sidebars
      .flatMap((sb) => collectDocsUnder(sb.items, []))
      .filter((id) => id.toLowerCase().includes(q) || docLabel(id, titles).toLowerCase().includes(q));
    return (
      <div className="guide__tree">
        {matches.length === 0 && <p className="guide__tree-empty">검색 결과 없음</p>}
        {matches.map((id) => (
          <button
            key={id}
            type="button"
            className={`guide__tree-doc${id === currentDocId ? ' guide__tree-doc--active' : ''}`}
            onClick={() => onSelect(id)}
            title={id}
          >
            {docLabel(id, titles)}
          </button>
        ))}
      </div>
    );
  }

  const renderNodes = (nodes: TTocNode[], keyPrefix: string, depth: number): React.ReactNode =>
    nodes.map((node, i) => {
      if (node.type === 'doc') {
        return (
          <button
            key={`${keyPrefix}${i}`}
            type="button"
            className={`guide__tree-doc${node.id === currentDocId ? ' guide__tree-doc--active' : ''}`}
            style={{ paddingLeft: `${10 + depth * 12}px` }}
            onClick={() => onSelect(node.id)}
            title={node.id}
          >
            {docLabel(node.id, titles)}
          </button>
        );
      }
      const key = `${keyPrefix}${i}:${node.label}`;
      const closed = isCollapsed(key, node.collapsed);
      return (
        <div key={key} className="guide__tree-category">
          <button
            type="button"
            className="guide__tree-category-label"
            style={{ paddingLeft: `${10 + depth * 12}px` }}
            onClick={() => toggle(key, node.collapsed)}
          >
            <span className="guide__tree-caret">{closed ? '▸' : '▾'}</span> {node.label}
          </button>
          {!closed && renderNodes(node.items, `${key}/`, depth + 1)}
        </div>
      );
    });

  return (
    <div className="guide__tree">
      {toc.sidebars.map((sb) => (
        <section key={sb.id} className="guide__tree-sidebar">
          <h3 className="guide__tree-sidebar-label">{sb.label}</h3>
          {renderNodes(sb.items, `${sb.id}/`, 0)}
        </section>
      ))}
    </div>
  );
}
