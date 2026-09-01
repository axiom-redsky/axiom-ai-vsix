/**
 * 라우터 맵 (계획서 §7 B4).
 *
 * 이 창이 답하는 질문:
 *  ① "어떤 주소가 어떤 화면이냐" — 주소·이름·컴포넌트·파일을 한 줄에.
 *  ② "이 페이지, 열 수 있는 주소가 있나?" — 고아 페이지 목록.
 *  ③ "이 주소, 누가 또 쓰나?" — 중복 경로 / 연결 안 된 라우터.
 *
 * ★ 스크롤 계약(B3 F5 결함에서 배운 것): 최상위는 `height:100vh`, 스크롤될 목록은 `flex:1`+`min-height:0`,
 *   고정 영역은 `flex:none`. `body`가 `overflow:hidden`이라 셋 중 하나만 빠져도 아래를 볼 수 없다.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { vscode } from '../vscodeApi';
import { searchRoutes, type IRouteNode, type IRouterIssue, type TRouterIssueKind } from '../../ai/router/RouterMap';
import type { HostToWebviewMessage, RouterMapPayload } from '../../types/messages';

type TTab = 'screens' | 'tree' | 'issues';

const ISSUE_LABEL: Record<TRouterIssueKind, string> = {
  'orphan-page': '주소 없는 페이지',
  'unreachable-router': '연결 안 된 라우터',
  'duplicate-path': '중복 주소',
  'unresolved-children': '해석 못 한 children',
  'missing-module': '없는 모듈',
};

/** 화면 한 줄. */
function ScreenRow({ node, focused, onOpen, onCopy }: {
  node: IRouteNode;
  focused: boolean;
  onOpen: (file: string, line: number) => void;
  onCopy: (text: string) => void;
}): React.ReactElement {
  return (
    <div className={`rm__row${focused ? ' rm__row--focus' : ''}`}>
      <code className="rm__path">
        {node.fullPath}
        {node.dynamic && <span className="rm__tag rm__tag--dyn">동적</span>}
        {node.env !== 'always' && <span className="rm__tag">{node.env === 'dev' ? 'DEV 전용' : 'PROD 전용'}</span>}
      </code>
      <span className="rm__name">{node.name ?? ''}</span>
      <span className="rm__component">{node.component ?? ''}</span>
      <span className="rm__actions">
        <button type="button" title="주소 복사" onClick={() => onCopy(node.fullPath)}>복사</button>
        {node.componentFile && (
          <button type="button" title={node.componentFile} onClick={() => onOpen(`${node.componentFile}.tsx`, 1)}>
            화면 파일
          </button>
        )}
        <button type="button" title={`${node.file}:${node.line}`} onClick={() => onOpen(node.file, node.line)}>
          라우트
        </button>
      </span>
    </div>
  );
}

/** 트리 한 마디 — 경로 없는 계층(레이아웃)도 사실대로 보여준다. */
function TreeNode({ node, depth, onOpen }: {
  node: IRouteNode; depth: number; onOpen: (file: string, line: number) => void;
}): React.ReactElement {
  const isLayout = node.children.length > 0;
  return (
    <>
      <div className="rm__tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
        <code className={`rm__tree-path${isLayout ? ' rm__tree-path--layout' : ''}`}>
          {node.rawPath === null ? '(경로 없음)' : node.rawPath || '/'}
        </code>
        <span className="rm__tree-full">{node.fullPath}</span>
        <span className="rm__tree-comp">
          {node.component ?? ''}
          {isLayout && node.component && <span className="rm__tag">레이아웃</span>}
        </span>
        <button type="button" className="rm__tree-open" onClick={() => onOpen(node.file, node.line)}>
          {node.file.split('/').slice(-2).join('/')}:{node.line}
        </button>
      </div>
      {node.children.map((c, i) => (
        <TreeNode key={`${c.fullPath}-${c.line}-${i}`} node={c} depth={depth + 1} onOpen={onOpen} />
      ))}
    </>
  );
}

function IssueRow({ issue, onOpen }: {
  issue: IRouterIssue; onOpen: (file: string, line: number) => void;
}): React.ReactElement {
  return (
    <div className={`rm__issue rm__issue--${issue.kind}`}>
      <span className="rm__issue-kind">{ISSUE_LABEL[issue.kind]}</span>
      <div className="rm__issue-body">
        <div className="rm__issue-message">{issue.message}</div>
        {issue.detail && <div className="rm__issue-detail">{issue.detail}</div>}
      </div>
      {issue.file && (
        <button type="button" onClick={() => onOpen(issue.file as string, issue.line ?? 1)}>열기</button>
      )}
    </div>
  );
}

export function RouterMapApp(): React.ReactElement {
  const [payload, setPayload] = useState<RouterMapPayload | null>(null);
  const [tab, setTab] = useState<TTab>('screens');
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      if (msg.type === 'routerMap') {
        setPayload(msg.payload);
        if (msg.payload.focusPath) {
          setQuery('');
          setTab('screens');
          setFocus(msg.payload.focusPath);
        }
      } else if (msg.type === 'routerMapNotice') {
        setNotice({ message: msg.message, severity: msg.severity });
        setTimeout(() => setNotice(null), 4000);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'routerMapLoad' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const screens = payload?.screens ?? [];
  const results = useMemo(() => searchRoutes(screens, query), [screens, query]);
  const issues = payload?.issues ?? [];

  const open = (file: string, line: number): void => { vscode.postMessage({ type: 'routerMapOpen', file, line }); };
  const copy = (text: string): void => { vscode.postMessage({ type: 'routerMapCopy', text }); };

  return (
    <div className="rm">
      <header className="rm__header">
        <h1 className="rm__title">
          라우터 맵
          {payload && (
            <span className="rm__badges">
              <span className="rm__badge">화면 {payload.counts.screens}</span>
              {payload.counts.issues > 0 && (
                <span className="rm__badge rm__badge--warn">확인 필요 {payload.counts.issues}</span>
              )}
            </span>
          )}
        </h1>
        <div className="rm__tabs">
          <button type="button" className={tab === 'screens' ? 'is-on' : ''} onClick={() => setTab('screens')}>
            화면 목록
          </button>
          <button type="button" className={tab === 'tree' ? 'is-on' : ''} onClick={() => setTab('tree')}>
            중첩 구조
          </button>
          <button type="button" className={tab === 'issues' ? 'is-on' : ''} onClick={() => setTab('issues')}>
            확인 필요 {issues.length > 0 ? `(${issues.length})` : ''}
          </button>
        </div>
      </header>

      <p className="rm__lead">
        이 프로젝트의 라우터 파일에서 읽은 것입니다. 주소는 부모 경로를 이어 계산했고,
        레이아웃처럼 <strong>경로 없는 계층</strong>은 건너뜁니다. 모델 호출 없이 동작합니다.
      </p>

      {payload?.empty && (
        <div className="rm__empty">
          라우터 파일을 찾지 못했습니다(<code>src/**/router/*.tsx</code>).
          scaffold 프로젝트 폴더를 열면 표시됩니다.
        </div>
      )}

      {payload && !payload.empty && (
        <div className="rm__source">
          <span>진입점 <code>{payload.entry ?? '(못 찾음)'}</code></span>
          <span> · 라우터 파일 {payload.files.length}개</span>
          {payload.root && <span> · <code>{payload.root}</code></span>}
        </div>
      )}

      {tab === 'screens' && (
        <>
          <div className="rm__toolbar">
            <input
              className="rm__search"
              placeholder="주소·이름·컴포넌트로 검색 (예: /example, 목록, Calendar)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="rm__count">{results.length}개</span>
          </div>
          <div className="rm__list">
            {results.length === 0 && payload && !payload.empty && (
              <div className="rm__empty">검색 결과가 없습니다.</div>
            )}
            {results.map((s, i) => (
              <ScreenRow
                key={`${s.fullPath}-${s.file}-${s.line}-${i}`}
                node={s}
                focused={focus === s.fullPath}
                onOpen={open}
                onCopy={copy}
              />
            ))}
          </div>
        </>
      )}

      {tab === 'tree' && (
        <div className="rm__list">
          {(payload?.routes ?? []).map((n, i) => (
            <TreeNode key={`${n.fullPath}-${i}`} node={n} depth={0} onOpen={open} />
          ))}
        </div>
      )}

      {tab === 'issues' && (
        <div className="rm__list">
          {issues.length === 0 && <div className="rm__empty">확인할 것이 없습니다. 모든 페이지에 주소가 있습니다.</div>}
          {issues.map((issue, i) => (
            <IssueRow key={`${issue.kind}-${issue.file}-${i}`} issue={issue} onOpen={open} />
          ))}
        </div>
      )}

      <footer className="rm__footer">
        <span>
          {tab === 'issues'
            ? '경고이지 오류가 아닙니다 — 조건부 등록·작업 중인 파일일 수 있으니 사람이 판단하세요.'
            : '동적 구간(:id)은 실제 주소가 아니라 형식입니다.'}
        </span>
      </footer>

      {notice && <div className={`rm__notice rm__notice--${notice.severity}`}>{notice.message}</div>}
    </div>
  );
}
