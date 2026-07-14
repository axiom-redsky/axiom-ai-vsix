import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, IntentProbeResult, IntentProbeIntent, TargetResolveProbe } from '../../types/messages';

const INTENT_LABEL: Record<string, string> = {
  create_page: '페이지 생성',
  modify_file: '파일 수정',
  qna: '질문(조회·설명)',
  smalltalk: '잡담·인사',
  other: '기타(폴백)',
};

function IntentBadge({ intent }: { intent: string | undefined }): React.ReactElement {
  if (!intent) return <span className="ip-badge ip-badge--other">—</span>;
  const cls = ['modify_file', 'create_page', 'qna', 'smalltalk'].includes(intent) ? intent : 'other';
  return (
    <span className={`ip-badge ip-badge--${cls}`}>
      {intent}
      {INTENT_LABEL[intent] ? ` · ${INTENT_LABEL[intent]}` : ''}
    </span>
  );
}

function SlotTable({ result, diffKeys }: { result: IntentProbeIntent; diffKeys: Set<string> }): React.ReactElement {
  const rows: Array<[string, string | null]> = [
    ['pageName', result.pageName],
    ['domain', result.domain],
    ['targetFile', result.targetFile],
    ['targetComponent', result.targetComponent],
    ['contentSource', result.contentSource],
  ];
  return (
    <table className="ip-slots">
      <tbody>
        {rows.map(([key, val]) => (
          <tr key={key} className={diffKeys.has(key) ? 'diff' : undefined}>
            <th>{key}</th>
            <td>
              {val ?? <span className="ip-null">null</span>}
              {diffKeys.has(key) ? ' ⚠' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 대상 파일 해석 드라이런의 최종 판정 배지. */
function TargetOutcomeBadge({ probe }: { probe: TargetResolveProbe }): React.ReactElement {
  switch (probe.outcome) {
    case 'cross-file':
      return <span className="ip-badge ip-badge--target-cross">🔀 cross-file 전환 → {probe.targetFile}</span>;
    case 'current-file':
      return <span className="ip-badge ip-badge--target-current">📄 현재 파일 → {probe.targetFile}</span>;
    case 'ask-user':
      return <span className="ip-badge ip-badge--target-ask">❓ 되묻기(QuickPick) — 근거 후보 없음</span>;
    default:
      return <span className="ip-badge ip-badge--other">— 해당 없음</span>;
  }
}

interface HistoryRow {
  time: string;
  query: string;
  model: string;
  offline: string;
  target: string;
  match: 'match' | 'mismatch' | 'model-only-na';
}

export function IntentProbeApp(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [hasSelection, setHasSelection] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IntentProbeResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'intentProbeFilePicked':
          setCurrentFile(msg.filePath);
          break;
        case 'intentProbeResult': {
          setResult(msg.result);
          const r = msg.result;
          setHistory((prev) => [
            {
              time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
              query: r.query,
              model: r.model.result?.intent ?? `(${r.model.status})`,
              offline: r.offline.result.intent,
              target:
                r.targetResolve.outcome === 'ask-user'
                  ? '❓되묻기'
                  : r.targetResolve.targetFile
                    ? (r.targetResolve.targetFile.split(/[/\\]/).pop() ?? '')
                    : '—',
              match: (!r.agreement.comparable ? 'model-only-na' : r.agreement.intentMatch ? 'match' : 'mismatch') as HistoryRow['match'],
            },
            ...prev,
          ].slice(0, 50));
          break;
        }
        case 'intentProbeDone':
          setRunning(false);
          break;
        case 'intentProbeError':
          setError(msg.message);
          setRunning(false);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    if (running || !query.trim()) return;
    setError('');
    setResult(null);
    setRunning(true);
    vscode.postMessage({ type: 'runIntentProbe', query, currentFile, hasSelection });
  };

  const diffKeys = new Set<string>(
    (result?.agreement.notes ?? [])
      .map((n) => n.match(/^슬롯 차이 (\w+):/)?.[1])
      .filter((k): k is string => !!k),
  );

  const banner = !result
    ? null
    : !result.agreement.comparable
      ? { cls: 'ip-banner--info', title: 'ℹ️ 모델 판정 없음 — 정규식 판정만 유효' }
      : result.agreement.intentMatch
        ? { cls: 'ip-banner--ok', title: '✅ 일치 — 모델과 정규식이 같은 의도로 판정' }
        : { cls: 'ip-banner--warn', title: '⚠ 불일치 — 모델과 정규식 판정이 갈라짐 (수집 대상!)' };

  return (
    <div className="ip">
      <div className="ip-inner">
      <div className="ip-header">
        <div className="ip-step">1</div>
        <div className="ip-title">의도파악 테스트</div>
      </div>
      <p className="ip-sub">
        프롬프트를 넣으면 의도파악 층의 두 판정 경로 — <b>🤖 모델 분류기</b>와 <b>🔤 정규식 폴백</b> — 를
        운영과 동일하게 실행해 나란히 보여줍니다. 두 판정이 갈라지면 ⚠ 불일치로 표시됩니다
        (라우팅 재설계 S5가 기다리는 수집 대상). 수정(modify) 의도일 때는 <b>🎯 해석된 대상 파일</b> —
        어떤 파일을 고칠지 결정하는 사슬 — 도 드라이런으로 보여줍니다. 판정만 하며 파일·라우팅에 영향 없습니다.
      </p>

      {/* ── 입력 ── */}
      <div className="ip-card">
        <div className="ip-field">
          <label className="ip-label">프롬프트</label>
          <textarea
            className="ip-textarea"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
            }}
            placeholder='예: "직원 목록 페이지 만들어줘" · "조회 버튼 옆에 초기화 버튼 추가해줘" · "useApi 사용법 알려줘"'
          />
        </div>

        <div className="ip-field">
          <label className="ip-label">
            컨텍스트 <small>— 판정에 영향을 주는 상황 재현 (열린 파일·선택영역)</small>
          </label>
          <div className="ip-row">
            <input
              className="ip-input"
              value={currentFile}
              onChange={(e) => setCurrentFile(e.target.value)}
              placeholder="현재 열린 파일의 상대경로 · 비워두면 '열린 파일 없음' 상황"
            />
            <button className="ip-btn" onClick={() => vscode.postMessage({ type: 'intentProbeUseActiveFile' })}>
              📄 열린 파일 가져오기
            </button>
            <label className="ip-check">
              <input type="checkbox" checked={hasSelection} onChange={(e) => setHasSelection(e.target.checked)} />
              선택영역 있음
            </label>
          </div>
        </div>

        <div className="ip-actions">
          <button className="ip-btn ip-btn--primary" onClick={run} disabled={running || !query.trim()}>
            {running ? '⏳ 판정 중…' : '▶ 의도 판정 실행'}
          </button>
          <span className="ip-hint">Ctrl+Enter로도 실행</span>
        </div>
      </div>

      {error && <div className="ip-card ip-error">{error}</div>}

      {result && banner && (
        <>
          {/* ── 일치/불일치 배너 ── */}
          <div className={`ip-banner ${banner.cls}`}>
            <div className="ip-banner__title">{banner.title}</div>
            <div className="ip-banner__effective">
              최종 채택(운영 라우팅 기준): <IntentBadge intent={result.effective.intent} />
              <span style={{ opacity: 0.6 }}>
                출처 = {result.effective.source === 'classifier' ? '🤖 모델 분류기' : '🔤 정규식 폴백'}
              </span>
            </div>
            {result.agreement.notes.length > 0 && (
              <ul>
                {result.agreement.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>

          {/* ── 두 경로 나란히 ── */}
          <div className="ip-cols">
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">🤖 모델 분류기</span>
                <span className="ip-card__meta">
                  {result.model.status === 'ok' ? `${result.model.elapsedMs}ms`
                  : result.model.status === 'offline' ? '서버 연결 안 됨'
                  : result.model.status === 'parse-fail' ? 'JSON 파싱 실패'
                  : `오류: ${result.model.error ?? ''}`}
                </span>
              </div>
              {result.model.result ? (
                <>
                  <IntentBadge intent={result.model.result.intent} />
                  <SlotTable result={result.model.result} diffKeys={diffKeys} />
                </>
              ) : (
                <div className="ip-empty">판정 없음 — 운영에서는 이 상황에서 정규식 폴백이 그대로 채택됩니다.</div>
              )}
            </div>

            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">🔤 정규식 폴백</span>
                <span className="ip-card__meta">신호 강도: {result.offline.strength}</span>
              </div>
              <IntentBadge intent={result.offline.result.intent} />
              <SlotTable result={result.offline.result} diffKeys={diffKeys} />
            </div>
          </div>

          {/* ── 해석된 대상 파일 (수정 라우트 드라이런) ── */}
          <div className="ip-card">
            <div className="ip-card__head">
              <span className="ip-card__title">🎯 해석된 대상 파일</span>
              <span className="ip-card__meta">수정(modify) 라우트 결정 사슬 드라이런 — 판정만, 파일 열기 없음</span>
            </div>
            {result.targetResolve.applicable ? (
              <>
                <TargetOutcomeBadge probe={result.targetResolve} />
                <ol className="ip-steps">
                  {result.targetResolve.steps.map((s, i) => (
                    <li key={i} className={s.fired ? 'fired' : undefined}>
                      <b>{s.rule}</b> — {s.detail}
                      {i === result.targetResolve.steps.length - 1 ? ' ◀ 여기서 확정' : ''}
                    </li>
                  ))}
                </ol>
                {result.targetResolve.note && <div className="ip-empty" style={{ marginTop: 8 }}>{result.targetResolve.note}</div>}
              </>
            ) : (
              <div className="ip-empty">{result.targetResolve.note}</div>
            )}
          </div>

          {/* ── 내부 들여다보기 ── */}
          <div className="ip-card">
            <div className="ip-card__head">
              <span className="ip-card__title">🔍 내부 들여다보기</span>
            </div>
            <div className="ip-ctxline">
              컨텍스트: 현재 파일 = {result.ctx.currentFile ?? '(없음)'} · 선택영역 = {result.ctx.hasSelection ? '있음' : '없음'} ·
              도메인 후보 = [{result.ctx.domains.join(', ') || '없음'}]
            </div>
            <details className="ip-details">
              <summary>모델에 전송된 분류 프롬프트 · {result.prompt.length}자</summary>
              <pre className="ip-code">{result.prompt}</pre>
            </details>
            <details className="ip-details">
              <summary>모델 원시 출력 · {result.model.raw.length}자</summary>
              <pre className="ip-code">{result.model.raw || '(없음)'}</pre>
            </details>
          </div>
        </>
      )}

      {/* ── 실행 이력 (불일치 채집 로그) ── */}
      {history.length > 0 && (
        <div className="ip-card">
          <div className="ip-card__head">
            <span className="ip-card__title">📋 실행 이력</span>
            <span className="ip-card__meta">이 탭이 열려 있는 동안 유지 · 최근 50건</span>
          </div>
          <table className="ip-history">
            <thead>
              <tr>
                <th>시각</th>
                <th>프롬프트</th>
                <th>모델</th>
                <th>정규식</th>
                <th>대상</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className={h.match === 'mismatch' ? 'mismatch' : undefined}>
                  <td style={{ whiteSpace: 'nowrap', opacity: 0.6 }}>{h.time}</td>
                  <td className="q" title={h.query}>{h.query}</td>
                  <td>{h.model}</td>
                  <td>{h.offline}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{h.target}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {h.match === 'match' ? '✅ 일치' : h.match === 'mismatch' ? '⚠ 불일치' : 'ℹ️ 모델없음'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
