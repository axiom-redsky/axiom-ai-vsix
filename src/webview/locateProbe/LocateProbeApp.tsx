import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, LocateProbeResult } from '../../types/messages';

/** 게이트별 표시 정보 — eval:region 게이트 분포와 같은 어휘를 쓴다. */
const GATE_INFO: Record<string, { icon: string; cls: string; hint: string }> = {
  ok: { icon: '✅', cls: 'lp-gate--ok', hint: 'region/hybrid 경로로 안전하게 진행' },
  ambiguous: { icon: '❓', cls: 'lp-gate--ask', hint: '모호 — 운영에선 되묻기 또는 모델 객관식(disambiguation)' },
  'anchor-missing': { icon: '⛔', cls: 'lp-gate--block', hint: '질문 토큰이 파일에 없음 → full 폴백' },
  'anchor-comment': { icon: '⛔', cls: 'lp-gate--block', hint: '최고 매칭이 주석 → full 폴백' },
  'anchor-import': { icon: '⛔', cls: 'lp-gate--block', hint: '최고 매칭이 import 라인 → full 폴백 (베이스라인 attr-readonly 실측 실패 게이트)' },
  'snap-failed': { icon: '⛔', cls: 'lp-gate--block', hint: '완결 JSX 요소 스냅 실패 → full 폴백' },
  'handler-body': { icon: '⛔', cls: 'lp-gate--block', hint: '핸들러 본문이 영역 밖 → full 폴백(기존 함수 보존)' },
  'cross-cutting': { icon: '⛔', cls: 'lp-gate--block', hint: '다중지점 편집 — 단일 region 표현 불가 → full 폴백' },
};

interface HistoryRow {
  time: string;
  query: string;
  gate: string;
  region: string;
  score: number;
}

export function LocateProbeApp(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [filePath, setFilePath] = useState('');
  const [forcedStart, setForcedStart] = useState(0);
  const [forcedEnd, setForcedEnd] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LocateProbeResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'locateProbeFilePicked':
          setFilePath(msg.filePath);
          break;
        case 'locateProbeResult': {
          setResult(msg.result);
          const r = msg.result;
          setHistory((prev) =>
            [
              {
                time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                query: r.query + (r.forced ? ` [강제 ${r.forced.startLine}~${r.forced.endLine}]` : ''),
                gate: r.gate,
                region: r.gateOk || r.forced ? `${r.startLine}~${r.endLine}` : '—',
                score: r.bestScore,
              },
              ...prev,
            ].slice(0, 50),
          );
          break;
        }
        case 'locateProbeDone':
          setRunning(false);
          break;
        case 'locateProbeError':
          setError(msg.message);
          setRunning(false);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runWith = (fs: number, fe: number) => {
    if (running || !query.trim()) return;
    setError('');
    setResult(null);
    setRunning(true);
    vscode.postMessage({ type: 'runLocateProbe', query, filePath, forcedStart: fs, forcedEnd: fe });
  };
  const run = () => runWith(forcedStart, forcedEnd);
  /** 후보 행 클릭 = 모델 객관식 pick 시뮬레이션 — forcedRegion으로 재실행(운영 재타겟과 동일 경로). */
  const pickCandidate = (s: number, e: number) => {
    setForcedStart(s);
    setForcedEnd(e);
    runWith(s, e);
  };

  const gateInfo = result ? GATE_INFO[result.gate] ?? { icon: '·', cls: '', hint: '' } : null;

  return (
    <div className="ip">
      <div className="ip-inner">
        <div className="ip-header">
          <div className="ip-step">3</div>
          <div className="ip-title">위치찾기 테스트</div>
        </div>
        <p className="ip-sub">
          프롬프트+현재 파일을 넣으면 locate 층(스냅 사다리)이 <b>어느 영역을 편집 대상으로 정하고 어떤
          안전 게이트 판정을 내리는지</b> 보여줍니다 — 앵커(grep 점수)·채택 영역·모호 판정·모델 객관식
          후보·동봉 재료. <b>모델 무관 결정론</b> 함수 <code>locateEditRegion</code>을 <b>직접 호출</b>
          합니다(운영 미러가 아니라 실제 산출물 그대로 — 드리프트 없음). 후보 행의 <b>"이 후보로 강제"</b>가
          모델 pick 시뮬레이션입니다.
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
              placeholder='예: "재직상태 select를 api로 바꿔줘" · "이메일 입력을 읽기전용으로" · "입사일을 달력으로"'
            />
          </div>

          <div className="ip-field">
            <label className="ip-label">
              현재 파일 <small>— 편집 대상 (TS/TSX 필수. ①intent가 정해주는 값의 시뮬레이션)</small>
            </label>
            <div className="ip-row">
              <input
                className="ip-input"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="영역을 찾을 파일의 상대경로"
              />
              <button className="ip-btn" onClick={() => vscode.postMessage({ type: 'locateProbeUseActiveFile' })}>
                📄 열린 파일 가져오기
              </button>
            </div>
          </div>

          <div className="ip-field">
            <div className="ip-row" style={{ flexWrap: 'wrap' }}>
              <label className="dp-num">
                강제 시작줄
                <input
                  type="number"
                  className="ip-input dp-num__input"
                  value={forcedStart}
                  min={0}
                  onChange={(e) => setForcedStart(Number(e.target.value) || 0)}
                />
              </label>
              <label className="dp-num">
                강제 끝줄
                <input
                  type="number"
                  className="ip-input dp-num__input"
                  value={forcedEnd}
                  min={0}
                  onChange={(e) => setForcedEnd(Number(e.target.value) || 0)}
                />
              </label>
              <span className="ip-hint">
                0 = 강제 없음(스냅 사다리). 지정 시 forcedRegion — 모델 객관식 pick과 동일 경로로 모호 게이트 우회
              </span>
            </div>
          </div>

          <div className="ip-actions">
            <button className="ip-btn ip-btn--primary" onClick={run} disabled={running || !query.trim()}>
              {running ? '⏳ 위치찾기 중…' : '▶ 위치찾기 실행'}
            </button>
            {(forcedStart > 0 || forcedEnd > 0) && (
              <button
                className="ip-btn"
                onClick={() => {
                  setForcedStart(0);
                  setForcedEnd(0);
                }}
              >
                강제 해제
              </button>
            )}
            <span className="ip-hint">Ctrl+Enter로도 실행</span>
          </div>
        </div>

        {error && <div className="ip-card ip-error">{error}</div>}

        {result && gateInfo && (
          <>
            {/* ── 판정 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">🎯 판정 — 안전 게이트</span>
                <span className="ip-card__meta">
                  {result.file?.path} · {result.file?.chars.toLocaleString()}자 · {result.file?.lines}줄
                  {result.forced ? ` · 강제 ${result.forced.startLine}~${result.forced.endLine}` : ''}
                </span>
              </div>

              <div className="lp-gateline">
                <span className={`lp-gate ${gateInfo.cls}`}>
                  {gateInfo.icon} {result.gate}
                </span>
                <span className="lp-gatehint">{gateInfo.hint}</span>
              </div>
              <div className="lp-reason">{result.reason}</div>

              <div className="dp-metrics" style={{ marginTop: 10 }}>
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.bestLine}</div>
                  <div className="dp-metric__lab">앵커 라인 <small>(grep 최고 매칭)</small></div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.bestScore}</div>
                  <div className="dp-metric__lab">앵커 점수 <small>(distinct 토큰 · 2 미만이면 약함)</small></div>
                </div>
                <div className="dp-metric">
                  <div className={`dp-metric__num ${result.gateOk ? 'dp-metric__num--win' : ''}`}>
                    {result.startLine}~{result.endLine}
                  </div>
                  <div className="dp-metric__lab">
                    채택 영역 <small>({result.endLine - result.startLine + 1}줄{result.gateOk ? '' : ' · 게이트 차단 — 참고용'})</small>
                  </div>
                </div>
              </div>

              <div className="dp-sub" style={{ marginTop: 10 }}>
                매칭 토큰 <small>({result.matched.length}개)</small>
              </div>
              <div className="dp-chips">
                {result.matched.length === 0 ? (
                  <span className="ip-empty">없음 — 질문 토큰이 파일과 0매칭(anchor-missing 계열)</span>
                ) : (
                  result.matched.map((t, i) => (
                    <span key={i} className="dp-chip">
                      {t}
                    </span>
                  ))
                )}
              </div>

              <details className="ip-details">
                <summary>채택 영역 전문 · {result.region.length.toLocaleString()}자</summary>
                <pre className="ip-code">{result.region}</pre>
              </details>
            </div>

            {/* ── 후보(모델 객관식) ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">🗳 후보 — 모델 객관식 disambiguation 입력</span>
                <span className="ip-card__meta">최대 6개 · 첫째=채택 영역 · 클릭=pick 시뮬레이션</span>
              </div>
              {result.candidates.length === 0 ? (
                <div className="ip-empty">후보 없음 — 스냅 가능한 매칭 영역이 없습니다.</div>
              ) : (
                <table className="lp-cands">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>라벨</th>
                      <th>라인</th>
                      <th>점수</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((c, i) => {
                      const isChosen =
                        c.startLine === result.startLine && c.endLine === result.endLine;
                      return (
                        <tr key={i} className={isChosen ? 'lp-cand--chosen' : ''}>
                          <td>{i + 1}</td>
                          <td className="dp-name">{c.label}{isChosen ? ' ← 채택' : ''}</td>
                          <td style={{ whiteSpace: 'nowrap', opacity: 0.7 }}>
                            {c.startLine}–{c.endLine}
                          </td>
                          <td style={{ textAlign: 'right' }}>{c.score}</td>
                          <td>
                            <button className="ip-btn lp-pick" onClick={() => pickCandidate(c.startLine, c.endLine)}>
                              이 후보로 강제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {result.ambiguousCandidates.length > 0 && (
                <>
                  <div className="dp-sub" style={{ marginTop: 10 }}>
                    되묻기 섹션 라벨 <small>(ambiguous 게이트 — "어느 구역인가요?" 선택지)</small>
                  </div>
                  <div className="dp-chips">
                    {result.ambiguousCandidates.map((l, i) => (
                      <span key={i} className="dp-chip dp-chip--path">
                        {l}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── 동봉 재료 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">📦 동봉 재료 — region과 함께 모델에 가는 것</span>
                <span className="ip-card__meta">depsHeader(가지치기) · backingDecls · controlInventory</span>
              </div>
              <div className="dp-metrics">
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.materials.depsHeaderChars.toLocaleString()}</div>
                  <div className="dp-metric__lab">depsHeader 글자 <small>(import·타입·훅 — 비대하면 가지치기)</small></div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.materials.backingDeclsChars.toLocaleString()}</div>
                  <div className="dp-metric__lab">backingDecls 글자 <small>(영역이 참조하는 모듈 const)</small></div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.materials.controlInventoryChars.toLocaleString()}</div>
                  <div className="dp-metric__lab">controlInventory 글자 <small>(영역 밖 컨트롤 — 중복 생성 방지)</small></div>
                </div>
              </div>
              {result.materials.depsHeader && (
                <details className="ip-details">
                  <summary>depsHeader 전문</summary>
                  <pre className="ip-code">{result.materials.depsHeader}</pre>
                </details>
              )}
              {result.materials.backingDecls && (
                <details className="ip-details">
                  <summary>backingDecls 전문</summary>
                  <pre className="ip-code">{result.materials.backingDecls}</pre>
                </details>
              )}
              {result.materials.controlInventory && (
                <details className="ip-details">
                  <summary>controlInventory 전문</summary>
                  <pre className="ip-code">{result.materials.controlInventory}</pre>
                </details>
              )}
            </div>
          </>
        )}

        {/* ── 실행 이력 ── */}
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
                  <th>게이트</th>
                  <th>영역</th>
                  <th>점수</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', opacity: 0.6 }}>{h.time}</td>
                    <td className="q" title={h.query}>
                      {h.query}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {GATE_INFO[h.gate]?.icon ?? '·'} {h.gate}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.region}</td>
                    <td>{h.score}</td>
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
