/**
 * Mock 데이터 생성기 (계획서 §7 D2).
 *
 * 화면은 위에서부터 **타입 고르기 → 만들 모양(옵션) → 미리보기 → useApi 한 줄 → 저장**이다.
 * 미리보기가 곧 저장될 내용이라, 누르기 전에 다 보이는 게 안전장치다(§3.6).
 *
 * ★ 스크롤 계약(B3 F5 결함): 최상위 `height:100vh` · 스크롤 영역 `flex:1`+`min-height:0` · 고정 `flex:none`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, MockDataPayload } from '../../types/messages';

type TLevel = MockDataPayload['types'][number]['level'];

const LEVEL_LABEL: Record<TLevel, string> = {
  data: '데이터',
  partial: '일부',
  ui: '화면',
};

export function MockDataApp(): React.ReactElement {
  const [payload, setPayload] = useState<MockDataPayload | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      if (msg.type === 'mockData') setPayload(msg.payload);
      else if (msg.type === 'mockNotice') {
        setNotice({ message: msg.message, severity: msg.severity });
        setTimeout(() => setNotice(null), 8000);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'mockLoad' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const options = payload?.options;
  const setOptions = (patch: Partial<NonNullable<typeof options>>): void => {
    if (!options) return;
    vscode.postMessage({ type: 'mockOptions', options: { ...options, ...patch } });
  };

  const types = useMemo(() => {
    const all = payload?.types ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((t) => (showAll ? true : t.level !== 'ui'))
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.file.toLowerCase().includes(q));
  }, [payload, query, showAll]);

  const selected = payload?.selected ?? null;
  const hiddenCount = (payload?.types.length ?? 0) - (payload?.types.filter((t) => t.level !== 'ui').length ?? 0);

  return (
    <div className="md">
      <header className="md__header">
        <h1 className="md__title">Mock 데이터</h1>
        <p className="md__lead">
          워크스페이스에 <strong>이미 있는 타입</strong>으로 fixture JSON을 만듭니다. 모델 호출 없이 동작합니다.
          저장하면 <code>public/mock/</code>에 놓이고, 개발 서버가 그 주소로 그대로 응답하므로
          <strong> 백엔드 없이도 화면이 돕니다</strong>. <code>public/</code>은 빌드에 포함되니
          연동이 끝나면 지우세요.
        </p>
      </header>

      {payload?.blocked && <div className="md__empty">{payload.blocked}</div>}

      {payload && !payload.blocked && (
        <div className="md__body">
          {/* ── 왼쪽: 타입 고르기 ── */}
          <aside className="md__side">
            <input
              className="md__search"
              type="text"
              placeholder="타입 이름·파일 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="md__list">
              {types.map((t) => (
                <button
                  key={`${t.file}#${t.name}`}
                  type="button"
                  className={`md__type${selected?.name === t.name && selected?.file === t.file ? ' is-on' : ''}`}
                  onClick={() => vscode.postMessage({ type: 'mockSelect', name: t.name, file: t.file })}
                  title={t.levelReason}
                >
                  <span className="md__type-head">
                    <span className="md__type-name">{t.name}</span>
                    <span className={`md__level md__level--${t.level}`}>{LEVEL_LABEL[t.level]}</span>
                  </span>
                  <span className="md__type-file">
                    {payload.currentFile === t.file && <span className="md__here">현재 파일</span>}
                    {t.file.replace(/^src\//, '')} · {t.fieldCount > 0 ? `${t.fieldCount}개 필드` : t.kind}
                  </span>
                </button>
              ))}
              {types.length === 0 && <div className="md__empty">찾는 타입이 없습니다.</div>}
            </div>
            <label className="md__showall">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              <span>화면용 타입도 보기{hiddenCount > 0 ? ` (${hiddenCount}개 숨김)` : ''}</span>
            </label>
          </aside>

          {/* ── 오른쪽: 만들 모양 · 미리보기 ── */}
          <section className="md__main">
            {!selected && (
              <div className="md__empty">
                왼쪽에서 타입을 고르세요. <strong>데이터</strong> 딱지가 붙은 타입은 그대로 fixture가 됩니다.
              </div>
            )}

            {selected && options && (
              <>
                <div className="md__opts">
                  <div className="md__opt">
                    <span className="md__opt-label">건수</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={options.count}
                      onChange={(e) => setOptions({ count: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                    />
                  </div>
                  <div className="md__opt">
                    <span className="md__opt-label">시드</span>
                    <input
                      type="number"
                      value={options.seed}
                      onChange={(e) => setOptions({ seed: Number(e.target.value) || 0 })}
                      title="같은 시드면 언제나 같은 값이 나옵니다."
                    />
                  </div>
                  <label className="md__check">
                    <input
                      type="checkbox"
                      checked={options.asList}
                      onChange={(e) => setOptions({ asList: e.target.checked })}
                    />
                    <span>목록으로</span>
                  </label>
                  <label className="md__check">
                    <input
                      type="checkbox"
                      checked={options.includeOptional}
                      onChange={(e) => setOptions({ includeOptional: e.target.checked })}
                    />
                    <span>선택 필드(?) 채우기</span>
                  </label>
                  <div className="md__opt">
                    <span className="md__opt-label">봉투</span>
                    <select
                      value={options.envelopeKey ?? ''}
                      onChange={(e) => setOptions({ envelopeKey: e.target.value || null })}
                      title="scaffold useApi는 서버 봉투를 벗기지 않습니다 — 봉투째 만들어야 화면이 돕니다."
                    >
                      <option value="">감싸지 않음</option>
                      {payload.envelopeChoices.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                  <label className="md__check">
                    <input
                      type="checkbox"
                      checked={options.envelopeMeta}
                      disabled={!options.envelopeKey}
                      onChange={(e) => setOptions({ envelopeMeta: e.target.checked })}
                    />
                    <span>success·totalCount 포함</span>
                  </label>
                </div>

                <div className="md__contract">
                  <span className="md__contract-label">useApi 제네릭</span>
                  <code className="md__generic">{payload.generic}</code>
                  <span className="md__contract-note">← 아래 JSON과 같은 모양입니다</span>
                </div>

                <div className="md__scroll">
                  {payload.issues.length > 0 && (
                    <section className="md__section">
                      <h2 className="md__section-title">타입에서 못 푼 것</h2>
                      <ul className="md__notes">
                        {payload.issues.map((i, n) => <li key={n}>{i}</li>)}
                      </ul>
                    </section>
                  )}
                  {payload.notices.length > 0 && (
                    <section className="md__section">
                      <h2 className="md__section-title">알아 두실 것</h2>
                      <ul className="md__notes">
                        {payload.notices.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </section>
                  )}

                  <section className="md__section">
                    <h2 className="md__section-title">
                      미리보기 — 이대로 <code>{payload.filePath}</code> 에 저장됩니다
                    </h2>
                    <pre className="md__preview">{payload.preview}</pre>
                  </section>

                  <section className="md__section">
                    <h2 className="md__section-title">화면에서 쓰는 법</h2>
                    <pre className="md__snippet">{payload.snippet}</pre>
                  </section>
                </div>

                <footer className="md__footer">
                  <span className="md__where">
                    {payload.exists ? '이미 있는 파일 · 덮어씁니다' : `새 파일 · ${payload.endpoint} 로 열립니다`}
                  </span>
                  <button
                    type="button"
                    className="md__btn"
                    onClick={() => vscode.postMessage({ type: 'mockCopy', text: payload.snippet ?? '', what: 'snippet' })}
                  >
                    useApi 코드 복사
                  </button>
                  <button
                    type="button"
                    className="md__btn"
                    onClick={() => vscode.postMessage({ type: 'mockCopy', text: payload.preview ?? '', what: 'json' })}
                  >
                    JSON 복사
                  </button>
                  <button
                    type="button"
                    className="md__btn md__btn--primary"
                    onClick={() => vscode.postMessage({ type: 'mockSave' })}
                  >
                    {payload.exists ? '덮어쓰기' : '파일로 저장'}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {notice && <div className={`md__notice md__notice--${notice.severity}`}>{notice.message}</div>}
    </div>
  );
}
