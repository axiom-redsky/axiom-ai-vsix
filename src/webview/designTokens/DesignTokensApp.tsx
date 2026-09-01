/**
 * 디자인 토큰 브라우저 (계획서 §7 B3).
 *
 * 이 창이 답하는 질문은 딱 두 개다:
 *  ① "이 토큰의 **진짜 색**이 뭐냐" — `var()` 체인을 다 푼 값과 **라이트/다크를 나란히**.
 *  ② "쓰려면 뭘 적냐" — `var(--…)`를 복사하거나 커서에 바로 넣는다.
 *
 * 조립·검색은 호스트와 **같은 순수 함수**(`ai/tokens/DesignTokens`)를 쓴다 — 검색을 웹뷰가 직접
 * 돌려야 타이핑마다 호스트를 왕복하지 않는다(카탈로그와 같은 규약).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { vscode } from '../vscodeApi';
import { searchTokens, type IDesignToken, type ITokenValue } from '../../ai/tokens/DesignTokens';
import type { DesignTokensPayload, HostToWebviewMessage } from '../../types/messages';

/** 미리보기 배경 — 다크 값은 어두운 바탕에서 봐야 실제로 보이는 대로 보인다. */
type TPreview = 'light' | 'dark';

const KIND_LABEL: Record<string, string> = {
  color: '색', shadow: '그림자', size: '크기', font: '글꼴', number: '숫자', other: '기타',
};

/** 값 하나의 견본 — 색이면 색 칩, 그림자면 그림자 상자, 나머지는 글자로 보여준다. */
function Swatch({ value, kind, preview }: { value: ITokenValue; kind: string; preview: TPreview }): React.ReactElement {
  if (kind === 'color' && value.color) {
    return <span className="dt__swatch" style={{ background: value.color }} aria-hidden />;
  }
  if (kind === 'shadow') {
    return (
      <span
        className="dt__swatch dt__swatch--shadow"
        style={{ boxShadow: value.resolved, background: preview === 'dark' ? '#1a2231' : '#ffffff' }}
        aria-hidden
      />
    );
  }
  if (kind === 'font') {
    return <span className="dt__swatch dt__swatch--text" style={{ fontFamily: value.resolved }}>Ag</span>;
  }
  return <span className="dt__swatch dt__swatch--text">{value.resolved.replace(/^calc/, '')}</span>;
}

function ValueCell({ label, value, kind, preview }: {
  label: string; value: ITokenValue | null; kind: string; preview: TPreview;
}): React.ReactElement {
  if (!value) return <div className="dt__value dt__value--same">— 라이트와 같음</div>;
  return (
    <div className="dt__value">
      <span className="dt__value-label">{label}</span>
      <Swatch value={value} kind={kind} preview={preview} />
      <code className="dt__value-code" title={value.raw}>{value.resolved}</code>
    </div>
  );
}

function TokenRow({ token, preview, onCopy, onInsert, onOpen, expanded, onToggle }: {
  token: IDesignToken;
  preview: TPreview;
  onCopy: (text: string) => void;
  onInsert: (text: string) => void;
  onOpen: (file: string, line: number) => void;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const def = token.light ?? token.dark;
  const usage = `var(${token.name})`;
  return (
    <div className={`dt__row${expanded ? ' dt__row--open' : ''}`}>
      <button type="button" className="dt__row-head" onClick={onToggle}>
        <code className="dt__name">{token.name}</code>
        <span className="dt__values">
          <ValueCell label="라이트" value={token.light} kind={token.kind} preview={preview} />
          <ValueCell label="다크" value={token.dark} kind={token.kind} preview={preview} />
        </span>
      </button>
      {expanded && (
        <div className="dt__detail">
          {/* 체인 = "왜 이 값인지"의 근거. 참조를 거치지 않았으면 굳이 보여주지 않는다. */}
          {token.light && token.light.chain.length > 0 && (
            <div className="dt__chain">
              라이트 <code>{token.light.raw}</code>
              {token.light.chain.map((c) => <span key={c}> → <code>{c}</code></span>)}
              <span> → <code>{token.light.resolved}</code></span>
            </div>
          )}
          {token.dark && token.dark.chain.length > 0 && (
            <div className="dt__chain">
              다크 <code>{token.dark.raw}</code>
              {token.dark.chain.map((c) => <span key={c}> → <code>{c}</code></span>)}
              <span> → <code>{token.dark.resolved}</code></span>
            </div>
          )}
          <div className="dt__actions">
            <button type="button" onClick={() => onCopy(usage)}>복사 <code>{usage}</code></button>
            <button type="button" onClick={() => onCopy(token.light?.resolved ?? '')}>값 복사</button>
            <button type="button" onClick={() => onInsert(usage)}>⤵ 커서에 넣기</button>
            {def && (
              <button type="button" onClick={() => onOpen(def.file, def.line)}>
                📄 {def.file}:{def.line}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DesignTokensApp(): React.ReactElement {
  const [payload, setPayload] = useState<DesignTokensPayload | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [preview, setPreview] = useState<TPreview>('light');
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      if (msg.type === 'designTokens') {
        setPayload(msg.payload);
        setTarget(msg.payload.target);
        if (msg.payload.focusToken) {
          // hover에서 넘어왔으면 그 토큰을 펼쳐 둔다(검색어도 비워 목록에서 실제로 보이게).
          setQuery('');
          setGroup(null);
          setOpen(msg.payload.focusToken);
        }
      } else if (msg.type === 'designTokensTarget') {
        setTarget(msg.target);
      } else if (msg.type === 'designTokensNotice') {
        setNotice({ message: msg.message, severity: msg.severity });
        setTimeout(() => setNotice(null), 4000);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'designTokensLoad' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const tokens = payload?.tokens ?? [];
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t.group, (counts.get(t.group) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [tokens]);

  const results = useMemo(() => {
    const found = searchTokens(tokens, query);
    return group ? found.filter((t) => t.group === group) : found;
  }, [tokens, query, group]);

  const copy = (text: string): void => { vscode.postMessage({ type: 'designTokensCopy', text }); };
  const insert = (text: string): void => { vscode.postMessage({ type: 'designTokensInsert', text }); };
  const openDef = (file: string, line: number): void => {
    vscode.postMessage({ type: 'designTokensOpenDefinition', file, line });
  };

  return (
    <div className={`dt dt--${preview}`}>
      <header className="dt__header">
        <h1 className="dt__title">
          디자인 토큰
          {payload && (
            <span className="dt__badges">
              <span className="dt__badge">토큰 {payload.counts.total}</span>
              <span className="dt__badge">색 {payload.counts.colors}</span>
              <span className="dt__badge">다크 재정의 {payload.counts.overriddenInDark}</span>
            </span>
          )}
        </h1>
        <div className="dt__preview-toggle">
          <button type="button" className={preview === 'light' ? 'is-on' : ''} onClick={() => setPreview('light')}>
            ☀ 라이트
          </button>
          <button type="button" className={preview === 'dark' ? 'is-on' : ''} onClick={() => setPreview('dark')}>
            🌙 다크
          </button>
        </div>
      </header>

      <p className="dt__lead">
        이 프로젝트의 CSS에서 읽은 값입니다. <code>var()</code> 체인을 끝까지 풀어 <strong>실제 색</strong>을 보여주고,
        라이트·다크를 나란히 놓습니다. 모델 호출 없이 동작합니다(오프라인 그대로).
      </p>

      {payload && payload.stylesRoot === null && (
        <div className="dt__empty">
          이 워크스페이스에서 <code>src/assets/styles</code> 를 찾지 못했습니다.
          scaffold 프로젝트 폴더를 열면 토큰이 표시됩니다.
        </div>
      )}

      {payload && payload.stylesRoot !== null && (
        <div className="dt__source">
          <span>출처 <code>{payload.stylesRoot}</code></span>
          {payload.followedEntry
            ? <span> · <code>app.css</code>의 @import 순서를 따라 {payload.files.length}개 파일</span>
            : <span> · ⚠ <code>app.css</code>를 못 읽어 <code>tokens/</code>만 읽었습니다(테마 덮어쓰기 미반영)</span>}
          {payload.missing.length > 0 && <span> · ⚠ 없는 파일 {payload.missing.join(', ')}</span>}
        </div>
      )}

      <div className="dt__toolbar">
        <input
          className="dt__search"
          placeholder="이름·값·한글로 검색 (예: 색, primary, 499ed8, 그림자)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="dt__count">{results.length}개</span>
      </div>

      <div className="dt__groups">
        <button type="button" className={group === null ? 'is-on' : ''} onClick={() => setGroup(null)}>
          전체
        </button>
        {groups.map(([g, n]) => (
          <button key={g} type="button" className={group === g ? 'is-on' : ''} onClick={() => setGroup(group === g ? null : g)}>
            {g} <span className="dt__group-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="dt__list">
        {results.length === 0 && payload && (
          <div className="dt__empty">검색 결과가 없습니다. 다른 말로 찾아보세요(색·그림자·크기·글꼴).</div>
        )}
        {results.map((t) => (
          <TokenRow
            key={t.name}
            token={t}
            preview={preview}
            expanded={open === t.name}
            onToggle={() => setOpen(open === t.name ? null : t.name)}
            onCopy={copy}
            onInsert={insert}
            onOpen={openDef}
          />
        ))}
      </div>

      <footer className="dt__footer">
        <span className="dt__kinds">
          {Object.entries(KIND_LABEL).map(([k, label]) => {
            const n = results.filter((t) => t.kind === k).length;
            return n > 0 ? <span key={k} className="dt__badge">{label} {n}</span> : null;
          })}
        </span>
        <span className="dt__target">
          {target ? <>넣을 곳: <code>{target}</code> 커서</> : '넣을 파일 없음 — 파일을 열고 커서를 두세요'}
        </span>
      </footer>

      {notice && <div className={`dt__notice dt__notice--${notice.severity}`}>{notice.message}</div>}
    </div>
  );
}
