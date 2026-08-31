import React, { useCallback, useEffect, useRef, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage } from '../../types/messages';
import type { ITocManifest, TGuideSource, TTocNode } from '../../types/guide';
import { TocTree } from './TocTree';
import { GuideDocView } from './GuideDocView';

function firstDocId(toc: ITocManifest): string | null {
  const walk = (nodes: TTocNode[]): string | null => {
    for (const n of nodes) {
      if (n.type === 'doc') return n.id;
      const found = walk(n.items);
      if (found) return found;
    }
    return null;
  };
  for (const sb of toc.sidebars) {
    const found = walk(sb.items);
    if (found) return found;
  }
  return null;
}

/** 내장 개발 가이드 웹뷰(data-mode="guide") — 좌측 목차 트리 + 우측 md 본문 2컬럼. */
export function GuideApp(): React.ReactElement {
  const [toc, setToc] = useState<ITocManifest | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [source, setSource] = useState<TGuideSource>('bundled');
  const [rootUri, setRootUri] = useState('');
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingAnchor = useRef<string | null>(null);
  const currentDocRef = useRef<string | null>(null);

  const loadDoc = useCallback((docId: string, a?: string): void => {
    pendingAnchor.current = a ?? null;
    setError(null);
    vscode.postMessage({ type: 'guideLoadDoc', docId, anchor: a });
  }, []);

  useEffect(() => {
    currentDocRef.current = currentDocId;
  }, [currentDocId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      switch (msg.type) {
        case 'guideToc': {
          setToc(msg.toc);
          setTitles(msg.titles);
          setSource(msg.source);
          setRootUri(msg.rootUri);
          // 최초 진입(딥링크 우선) — 이미 문서를 보고 있으면 유지(핫리로드 toc 갱신)
          if (!currentDocRef.current) {
            const initial = msg.initialDocId ?? firstDocId(msg.toc);
            if (initial) loadDoc(initial);
          }
          break;
        }
        case 'guideDoc': {
          const isSameDoc = currentDocRef.current === msg.docId;
          setCurrentDocId(msg.docId);
          setMarkdown(msg.markdown);
          setAnchor(pendingAnchor.current);
          // 새 문서로 이동 시에만 맨 위로(핫리로드 재전송은 스크롤 유지)
          if (!isSameDoc && !pendingAnchor.current) contentRef.current?.scrollTo(0, 0);
          break;
        }
        case 'guideNavigate':
          loadDoc(msg.docId, msg.anchor);
          break;
        case 'guideError':
          setError(msg.message);
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'guideReady' });
    return () => window.removeEventListener('message', onMessage);
  }, [loadDoc]);

  const handleNavigate = useCallback((docId: string, a?: string) => loadDoc(docId, a), [loadDoc]);
  const handleOpenExternal = useCallback(
    (url: string) => vscode.postMessage({ type: 'guideOpenExternal', url }),
    [],
  );
  const handleEdit = (): void => {
    if (currentDocId) vscode.postMessage({ type: 'guideEditDoc', docId: currentDocId });
  };
  const handleCreate = (): void => vscode.postMessage({ type: 'guideCreateDoc' });

  const docTitle = currentDocId ? titles[currentDocId] ?? currentDocId.split('/').pop() : '';

  return (
    <div className="guide">
      <aside className="guide__sidebar">
        <div className="guide__search">
          <input
            type="text"
            className="guide__search-input"
            placeholder="가이드 검색…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {toc ? (
          <TocTree toc={toc} titles={titles} currentDocId={currentDocId} filter={filter} onSelect={loadDoc} />
        ) : (
          <p className="guide__tree-empty">목차 로드 중…</p>
        )}
        <div className="guide__sidebar-footer">
          <button type="button" className="guide__toolbar-btn" onClick={handleCreate} title="새 가이드 등록">
            ＋ 새 가이드
          </button>
        </div>
      </aside>
      <main className="guide__main">
        <header className="guide__toolbar">
          <span className="guide__toolbar-title" title={currentDocId ?? ''}>
            {docTitle}
          </span>
          {source === 'bundled' && (
            <span className="guide__badge" title="워크스페이스가 없어 번들 스냅샷을 표시 중입니다">
              번들 · 읽기전용
            </span>
          )}
          {source === 'workspace' && currentDocId && (
            <button type="button" className="guide__toolbar-btn" onClick={handleEdit} title="md 파일 편집 (저장하면 자동 반영)">
              ✏️ 편집
            </button>
          )}
        </header>
        <div className="guide__content" ref={contentRef}>
          {error && <div className="guide__error">⚠ {error}</div>}
          {!error && currentDocId && markdown !== null && (
            <GuideDocView
              docId={currentDocId}
              markdown={markdown}
              rootUri={rootUri}
              anchor={anchor}
              onNavigate={handleNavigate}
              onOpenExternal={handleOpenExternal}
            />
          )}
          {!error && markdown === null && <p className="guide__tree-empty">문서를 선택하세요.</p>}
        </div>
      </main>
    </div>
  );
}
