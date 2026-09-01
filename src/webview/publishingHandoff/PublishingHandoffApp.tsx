/**
 * 퍼블리싱 포팅 (계획서 §7 D1).
 *
 * 이 창은 **파일을 쓴다**. 그래서 화면의 절반이 "무슨 일이 일어날지"다 —
 * 새로 생길 파일 · 고쳐질 파일 · 건드리지 않을 것. 누르기 전에 다 보이는 게 안전장치다(§3.6).
 *
 * ★ 스크롤 계약(B3 F5 결함): 최상위 `height:100vh` · 목록 `flex:1`+`min-height:0` · 고정 영역 `flex:none`.
 */

import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HandoffPayload, HostToWebviewMessage } from '../../types/messages';

export function PublishingHandoffApp(): React.ReactElement {
  const [payload, setPayload] = useState<HandoffPayload | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      if (msg.type === 'handoff') {
        setPayload(msg.payload);
        setApplying(false);
      } else if (msg.type === 'handoffNotice') {
        setNotice({ message: msg.message, severity: msg.severity });
        setApplying(false);
        setTimeout(() => setNotice(null), 8000);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'handoffLoad' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const select = (domain: string, pages: string[]): void => {
    vscode.postMessage({ type: 'handoffSelect', domain, pages });
  };
  const open = (file: string): void => { vscode.postMessage({ type: 'handoffOpen', file, line: 1 }); };

  const domain = payload?.domain ?? null;
  const selected = payload?.selectedPages ?? [];
  const isPicked = (page: string): boolean => selected.length === 0 || selected.includes(page);
  const togglePage = (page: string): void => {
    if (!domain || !payload) return;
    const all = payload.pages;
    const current = selected.length === 0 ? all : selected;
    const next = current.includes(page) ? current.filter((p) => p !== page) : [...current, page];
    select(domain, next.length === all.length ? [] : next);
  };

  const moves = payload?.moves ?? [];
  const applicable = moves.filter((m) => !m.conflict);
  const canApply = !!payload && !payload.blocked && applicable.length > 0 && !applying;

  return (
    <div className="ph">
      <header className="ph__header">
        <h1 className="ph__title">퍼블리싱 포팅</h1>
        {payload && payload.domains.length > 1 && (
          <div className="ph__domains">
            {payload.domains.map((d) => (
              <button key={d} type="button" className={d === domain ? 'is-on' : ''} onClick={() => select(d, [])}>
                {d}
              </button>
            ))}
          </div>
        )}
      </header>

      <p className="ph__lead">
        퍼블리셔가 <code>src/publishing/</code>에 만든 화면을 <code>src/domains/</code>로 옮깁니다.
        import 경로를 고치고, <strong>퍼블리셔가 정해 둔 주소·이름 그대로</strong> 라우터에 등록합니다.
        원본은 <strong>지우지 않습니다</strong>(복사). 모델 호출 없이 동작합니다.
      </p>

      {payload?.blocked && <div className="ph__empty">{payload.blocked}</div>}

      {payload && !payload.blocked && (
        <>
          <section className="ph__section">
            <h2 className="ph__section-title">옮길 화면</h2>
            <div className="ph__pages">
              {payload.pages.map((p) => (
                <label key={p} className="ph__page">
                  <input type="checkbox" checked={isPicked(p)} onChange={() => togglePage(p)} />
                  <span>{p}</span>
                  {payload.routes.find((r) => r.component === p) && (
                    <code className="ph__route">
                      /{payload.domain}/{payload.routes.find((r) => r.component === p)?.path}
                      {payload.routes.find((r) => r.component === p)?.name
                        ? ` · ${payload.routes.find((r) => r.component === p)?.name}`
                        : ''}
                    </code>
                  )}
                </label>
              ))}
            </div>
          </section>

          <div className="ph__list">
            <section className="ph__section">
              <h2 className="ph__section-title">새로 생길 파일 {applicable.length}개</h2>
              {moves.length === 0 && <div className="ph__empty">옮길 파일이 없습니다.</div>}
              {moves.map((m) => (
                <div key={m.to} className={`ph__row${m.conflict ? ' ph__row--skip' : ''}`}>
                  <span className={`ph__kind ph__kind--${m.kind}`}>{m.kind === 'page' ? '화면' : '부품'}</span>
                  <button type="button" className="ph__path" onClick={() => open(m.from)} title="원본 열기">
                    {m.from}
                  </button>
                  <span className="ph__arrow">→</span>
                  <code className="ph__path ph__path--to">{m.to}</code>
                  {m.conflict && <span className="ph__skip">이미 있음 · 건너뜀</span>}
                </div>
              ))}
            </section>

            {(payload.updates.length > 0) && (
              <section className="ph__section">
                <h2 className="ph__section-title">고쳐질 파일 {payload.updates.length}개</h2>
                {payload.updates.map((u) => (
                  <div key={u.path} className="ph__row">
                    <span className="ph__kind ph__kind--edit">{u.create ? '신규' : '수정'}</span>
                    <button type="button" className="ph__path" onClick={() => open(u.path)}>{u.path}</button>
                    <span className="ph__note">{u.note}</span>
                  </div>
                ))}
              </section>
            )}

            {payload.notices.length > 0 && (
              <section className="ph__section">
                <h2 className="ph__section-title">알아 두실 것</h2>
                <ul className="ph__notices">
                  {payload.notices.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      <footer className="ph__footer">
        <span className="ph__summary">
          {payload && !payload.blocked
            ? `새 파일 ${applicable.length}개 · 고칠 파일 ${payload.updates.length}개`
            : ''}
        </span>
        <button
          type="button"
          className="ph__apply"
          disabled={!canApply}
          onClick={() => { setApplying(true); vscode.postMessage({ type: 'handoffApply' }); }}
        >
          {applying ? '적용 중…' : '이대로 옮기기'}
        </button>
      </footer>

      {notice && <div className={`ph__notice ph__notice--${notice.severity}`}>{notice.message}</div>}
    </div>
  );
}
