/**
 * 컴포넌트 카탈로그 패널 (계획서 §7 B1) — "부품 목록 창".
 *
 * 왼쪽 = 검색 + 패밀리 목록, 오른쪽 = 그 부품의 import·스니펫·prop 표·예제.
 * 검색은 호스트를 왕복하지 않고 **호스트와 같은 순수 함수**(searchCatalog)를 웹뷰에서 그대로 돌린다.
 * 문서 전문은 여기서 렌더하지 않고 가이드 패널로 딥링크한다(렌더러를 두 벌 만들지 않는다).
 *
 * 스타일은 `styles/componentCatalog.css`(.cc-*)에 있다 — 인라인 스타일을 쓰면 기본 흰 버튼처럼
 * VSCode 테마와 겉도는 화면이 된다(실측 지적). 색은 전부 테마 토큰.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { vscode } from '../vscodeApi';
import {
  buildPropFields, buildSnippet, checkPropValue, optionalPropFields, searchCatalog,
  type ICatalogEntry, type ICatalogExample, type ICatalogMember, type IPropField,
} from '../../ai/catalog/ComponentCatalog';
import type { ComponentCatalogPayload, ComponentCatalogTarget, HostToWebviewMessage } from '../../types/messages';

const ORIGIN_LABEL: Record<string, string> = {
  props: '속성표',
  guide: '가이드',
  knowledge: '예제',
};

function CopyButton({ text, label }: { text: string; label: string }): React.ReactElement {
  return (
    <button className="cc-btn" onClick={() => vscode.postMessage({ type: 'componentCatalogCopy', text, label })}>
      복사
    </button>
  );
}

/** prop 표 — 필수를 위로 올린다(무엇을 반드시 줘야 하는지가 첫 질문이라). */
function PropTable({ member }: { member: ICatalogMember }): React.ReactElement {
  const props = useMemo(
    () => [...member.props].sort((a, b) => (a.required === b.required ? a.name.localeCompare(b.name) : a.required ? -1 : 1)),
    [member],
  );
  if (props.length === 0) {
    return <div className="cc__section-body">고유 prop 없음 — 표준 DOM 속성만 받습니다.</div>;
  }
  return (
    <table className="cc__table">
      <thead>
        <tr>
          <th>prop</th>
          <th>타입</th>
          <th>설명</th>
        </tr>
      </thead>
      <tbody>
        {props.map((p) => (
          <tr key={p.name}>
            <td className="cc__prop-name">
              {p.name}
              {p.required && <span className="cc__req" title="필수">●</span>}
            </td>
            <td className="cc__prop-type">{p.type}</td>
            <td className="cc__prop-doc">{p.doc ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MemberSection({ member, defaultOpen }: { member: ICatalogMember; defaultOpen: boolean }): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const required = member.props.filter((p) => p.required).length;
  return (
    <div className="cc__member">
      <div className="cc__member-head" onClick={() => setOpen(!open)}>
        <button className="cc-btn cc-btn--caret" aria-label={open ? '접기' : '펴기'}>{open ? '▾' : '▸'}</button>
        <span className="cc__member-name">{member.name}</span>
        <span className="cc__badge">prop {member.props.length}</span>
        {required > 0 && <span className="cc__badge">필수 {required}</span>}
        {member.domNote && <span className="cc__badge">DOM 속성</span>}
        {member.truncated && <span className="cc__badge">목록 잘림</span>}
        <span className="cc__member-src">{member.source}</span>
        <button
          className="cc-btn"
          onClick={(e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'componentCatalogOpenSource', source: member.source });
          }}
        >
          소스 열기
        </button>
      </div>
      {open && <PropTable member={member} />}
    </div>
  );
}

function ExampleSection({ example, defaultOpen }: { example: ICatalogExample; defaultOpen: boolean }): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cc__member">
      <div className="cc__member-head" onClick={() => setOpen(!open)}>
        <button className="cc-btn cc-btn--caret" aria-label={open ? '접기' : '펴기'}>{open ? '▾' : '▸'}</button>
        <span className="cc__member-name">{example.title}</span>
        <span className="cc__badge">{example.lang}</span>
        <span className="cc__member-src" />
        <span onClick={(e) => e.stopPropagation()}>
          <CopyButton text={example.code} label={example.title} />
        </span>
      </div>
      {open && <pre className="cc__code">{example.code}</pre>}
    </div>
  );
}

/**
 * 필수 prop 입력 폼(A4 후속) — 넣기 전에 값을 받는다.
 *
 * 칸의 종류(텍스트/숫자/체크/선택)와 기본값은 **타입에서 결정론으로** 유도한다(`propField`).
 * 사용자가 비워 두면 그 기본값이 그대로 들어가므로, 폼을 무시하고 눌러도 종전과 같다.
 */
function PropForm({ fields, values, onChange, onRemove }: {
  fields: (IPropField & { optional?: boolean })[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onRemove?: (name: string) => void;
}): React.ReactElement {
  return (
    <div className="cc__form">
      {fields.map((f) => {
        const value = values[f.name] ?? f.value;
        // 한 칸에 여러 prop을 몰아넣으면 그대로 깨진 코드가 된다(실측). 막지 않고 알려준다.
        const warn = f.control === 'text' ? checkPropValue(value) : null;
        return (
          <label key={f.name} className="cc__form-row" title={f.doc ?? f.type}>
            <span className="cc__form-label">
              {f.name}
              {f.optional
                ? <span className="cc__form-optional" title="선택 prop">○</span>
                : <span className="cc__req" title="필수">●</span>}
            </span>
            {f.control === 'select' ? (
              <select className="cc__form-input" value={value} onChange={(e) => onChange(f.name, e.target.value)}>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.control === 'checkbox' ? (
              <span className="cc__form-input cc__form-input--check">
                <input
                  type="checkbox"
                  checked={value !== 'false'}
                  onChange={(e) => onChange(f.name, e.target.checked ? 'true' : 'false')}
                />
                <span className="cc__form-hint">{value !== 'false' ? '켜짐 (속성만 씀)' : '{false}'}</span>
              </span>
            ) : (
              <input
                className="cc__form-input"
                type={f.control === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            )}
            <span className="cc__form-type">{f.type}</span>
            {f.optional && onRemove && (
              <button
                className="cc-btn cc-btn--caret"
                title="이 prop 빼기"
                onClick={(e) => { e.preventDefault(); onRemove(f.name); }}
              >
                ✕
              </button>
            )}
            {warn && <span className="cc__form-warn">⚠ {warn}</span>}
          </label>
        );
      })}
    </div>
  );
}

function Detail({ entry, target }: { entry: ICatalogEntry; target: ComponentCatalogTarget | null }): React.ReactElement {
  const required = useMemo(() => buildPropFields(entry), [entry]);
  const optional = useMemo(() => optionalPropFields(entry), [entry]);
  const [values, setValues] = useState<Record<string, string>>({});
  /** 사용자가 추가한 선택 prop 이름들 — 기본은 비어 있어 폼이 짧게 유지된다. */
  const [extra, setExtra] = useState<string[]>([]);
  // 부품을 바꾸면 앞 부품의 값이 남아 있으면 안 된다(다른 컴포넌트의 prop 값이 섞인다).
  useEffect(() => { setValues({}); setExtra([]); }, [entry.id]);

  const addOptional = (name: string): void => {
    const f = optional.find((o) => o.name === name);
    if (!f) return;
    setExtra((prev) => (prev.includes(name) ? prev : [...prev, name]));
    // 추가하는 순간 기본값을 넣어야 스니펫에 나타난다(선택 prop은 "값이 있을 때만" 붙는다).
    setValues((prev) => ({ ...prev, [name]: prev[name] ?? f.value }));
  };
  const removeOptional = (name: string): void => {
    setExtra((prev) => prev.filter((n) => n !== name));
    setValues((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };
  const fields = [
    ...required,
    ...extra.map((n) => optional.find((o) => o.name === n)).filter((f): f is IPropField => !!f)
      .map((f) => ({ ...f, optional: true })),
  ];
  const addable = optional.filter((o) => !extra.includes(o.name));
  // ★ 미리보기 = 실제 삽입. 호스트도 같은 함수를 부른다(보이는 것과 넣는 것이 갈리지 않게).
  const snippet = useMemo(() => buildSnippet(entry, values) ?? entry.snippet, [entry, values]);

  return (
    <div className="cc__detail">
      <div className="cc__detail-head">
        <span className="cc__name">{entry.name}</span>
        <span className="cc__badges">
          {entry.origins.map((o) => (
            <span key={o} className="cc__badge">{ORIGIN_LABEL[o] ?? o}</span>
          ))}
        </span>
        {entry.guideDocId && (
          <button
            className="cc-btn cc-btn--primary"
            onClick={() => vscode.postMessage({ type: 'componentCatalogOpenGuide', docId: entry.guideDocId as string })}
          >
            📖 가이드에서 열기
          </button>
        )}
        {entry.knowledgeSource && (
          <button
            className="cc-btn"
            onClick={() =>
              vscode.postMessage({ type: 'componentCatalogOpenKnowledge', source: entry.knowledgeSource as string })
            }
          >
            지식 문서
          </button>
        )}
      </div>

      {entry.summary && <div className="cc__summary">{entry.summary}</div>}

      {snippet && (
        <div className="cc__section">
          <div className="cc__section-head">
            <span className="cc__section-title">빠른 스니펫</span>
            <span className="cc__section-note">
              {target
                // 버튼이 어디에 넣을지 **누르기 전에** 말한다 — 눌러 봐야 아는 버튼은 무섭다.
                ? `${target.file} ${target.line}줄${target.hasSelection ? ' (선택 영역 교체)' : ''}`
                : '.tsx 파일을 열고 넣을 자리에 커서를 두세요'}
            </span>
            <button
              className="cc-btn cc-btn--primary"
              disabled={!target}
              title={target
                ? `${target.file} ${target.line}줄에 넣습니다 (import 자동 정리 · Ctrl+Z로 취소)`
                : '.tsx 파일을 열고 넣을 자리에 커서를 두세요'}
              onClick={() => vscode.postMessage({ type: 'componentCatalogInsert', entryId: entry.id, values })}
            >
              ⤵ 커서 위치에 넣기
            </button>
            <CopyButton text={snippet} label={`${entry.name} 스니펫`} />
          </div>
          {(fields.length > 0 || addable.length > 0) && (
            <>
              {fields.length > 0 && (
                <PropForm
                  fields={fields}
                  values={values}
                  onChange={(n, v) => setValues((prev) => ({ ...prev, [n]: v }))}
                  onRemove={removeOptional}
                />
              )}
              {addable.length > 0 && (
                <div className="cc__form cc__form--add">
                  <label className="cc__form-row">
                    <span className="cc__form-label">+ prop 추가</span>
                    <select
                      className="cc__form-input"
                      value=""
                      onChange={(e) => { addOptional(e.target.value); e.currentTarget.value = ''; }}
                    >
                      <option value="">선택 prop 고르기 ({addable.length}개)</option>
                      {addable.map((o) => (
                        <option key={o.name} value={o.name}>{o.name} — {o.type}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </>
          )}
          <pre className="cc__code">{snippet}</pre>
        </div>
      )}

      <div className="cc__section">
        <div className="cc__section-head">
          <span className="cc__section-title">속성 표</span>
          <span className="cc__section-note">
            {entry.members.length > 0
              ? `${entry.members.length}개 컴포넌트 · prop ${entry.propCount}개 · ● = 필수 (표준 DOM 속성은 생략)`
              : '자동 생성 인덱스에 없는 부품 — 사용법은 가이드 문서를 보세요'}
          </span>
        </div>
        {entry.members.length > 0 ? (
          <div className="cc__section-body cc__section-body--flush">
            {entry.members.map((m, i) => (
              <MemberSection key={m.name} member={m} defaultOpen={i === 0} />
            ))}
          </div>
        ) : (
          <div className="cc__section-body">속성 표가 없습니다.</div>
        )}
      </div>

      {entry.examples.length > 0 && (
        <div className="cc__section">
          <div className="cc__section-head">
            <span className="cc__section-title">예제 {entry.examples.length}개</span>
            <span className="cc__section-note">출처: {entry.knowledgeSource} — 오프라인 답변이 쓰는 그 문서</span>
          </div>
          <div className="cc__section-body cc__section-body--flush">
            {entry.examples.map((ex, i) => (
              <ExampleSection key={`${ex.title}-${i}`} example={ex} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComponentCatalogApp(): React.ReactElement {
  const [payload, setPayload] = useState<ComponentCatalogPayload | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<ComponentCatalogTarget | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const msg = event.data;
      if (msg.type === 'componentCatalog') {
        setPayload(msg.payload);
        setTarget(msg.payload.target);
        // hover 딥링크로 열렸으면 그 부품을 펼친다 — 넘어온 맥락을 이어 준다(검색어도 비워
        // 목록에서 실제로 보이게 한다). 딥링크가 아니면 종전대로 첫 항목.
        const focus = msg.payload.focusEntryId ?? null;
        if (focus) {
          setQuery('');
          setSelected(focus);
        } else {
          setSelected((prev) => prev ?? msg.payload.entries[0]?.id ?? null);
        }
      } else if (msg.type === 'componentCatalogTarget') {
        setTarget(msg.target);
      } else if (msg.type === 'componentCatalogNotice') {
        setNotice({ message: msg.message, severity: msg.severity });
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 4000);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'componentCatalogLoad' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const entries = payload?.entries ?? [];
  const results = useMemo(() => searchCatalog(entries, query), [entries, query]);
  const current = results.find((e) => e.id === selected) ?? results[0] ?? null;

  /** ↑↓ 로 목록을 옮기고 손은 검색창에 둔다(훑어보기가 이 창의 주 용도). */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (results.length === 0) return;
    const idx = Math.max(0, results.findIndex((r) => r.id === current?.id));
    const next = e.key === 'ArrowDown' ? Math.min(results.length - 1, idx + 1) : Math.max(0, idx - 1);
    setSelected(results[next].id);
  };

  const counts = payload?.counts;

  return (
    <div className="cc">
      <div className="cc__header">
        <span className="cc__title">컴포넌트 카탈로그</span>
        {counts && (
          <span className="cc__counts">
            <span className="cc__count">부품 <b>{counts.entries}</b></span>
            <span className="cc__count">컴포넌트 <b>{counts.components}</b></span>
            <span className="cc__count">prop <b>{counts.props}</b></span>
            <span className="cc__count">가이드 <b>{counts.guideDocs}</b></span>
            <span className="cc__count">예제 문서 <b>{counts.knowledgeDocs}</b></span>
          </span>
        )}
        <button className="cc-btn" onClick={() => vscode.postMessage({ type: 'componentCatalogLoad' })}>
          새로고침
        </button>
      </div>
      <div className="cc__lead">
        scaffold가 제공하는 부품을 <b>이름·prop·한글 설명</b>으로 찾고, import·스니펫을 복사합니다.
        모델 호출 없이 동작하며(오프라인 그대로), 문서 전문은 <b>가이드에서 열기</b>로 넘어갑니다.
      </div>

      {notice && (
        <div className={`cc__notice${notice.severity === 'error' ? ' cc__notice--error' : ''}`}>{notice.message}</div>
      )}

      <div className="cc__body">
        {/* ── 왼쪽: 검색 + 목록 ── */}
        <div className="cc__side">
          <input
            className="cc__search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="이름·prop·한글로 검색 (예: 표, 달력)"
          />
          <div className="cc__side-meta">
            <span>{query.trim() ? `${results.length}개 일치` : `${results.length}개`}</span>
            <span>↑↓ 이동</span>
          </div>
          <div className="cc__list">
            {results.length === 0 && <div className="cc__empty">일치하는 부품이 없습니다.</div>}
            {results.map((e) => (
              <div
                key={e.id}
                className={`cc__item${e.id === current?.id ? ' cc__item--active' : ''}`}
                onClick={() => setSelected(e.id)}
              >
                <div className="cc__item-top">
                  <span className="cc__item-name">{e.name}</span>
                  {e.propCount > 0 && <span className="cc__item-count">prop {e.propCount}</span>}
                </div>
                <div className="cc__item-meta">
                  {e.origins.map((o) => ORIGIN_LABEL[o] ?? o).join(' · ')}
                  {e.members.length > 1 ? ` · ${e.members.length}개 컴포넌트` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 오른쪽: 상세 ── */}
        {current ? (
          <Detail entry={current} target={target} />
        ) : (
          <div className="cc__detail">
            <div className="cc__empty">{payload ? '왼쪽에서 부품을 선택하세요.' : '불러오는 중…'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
