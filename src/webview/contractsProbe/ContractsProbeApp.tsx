import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, ContractsProbeResult, ContractsProbeCard } from '../../types/messages';

/** 카드 한 장의 발동 근거(ablation) 칩 — 셋 다 아니면서 발동이면 "조합 필요". */
function SourceChips({ c }: { c: ContractsProbeCard }): React.ReactElement {
  if (!c.fired) return <span className="ip-null">—</span>;
  const chips: React.ReactElement[] = [];
  if (c.byQueryOnly) chips.push(<span key="q" className="dp-chip dp-chip--stem">쿼리</span>);
  if (c.byDepsOnly) chips.push(<span key="d" className="dp-chip dp-chip--path">코드(deps)</span>);
  if (c.byRegionOnly) chips.push(<span key="r" className="dp-chip dp-chip--ctrl">영역(region)</span>);
  if (chips.length === 0) chips.push(<span key="c" className="dp-chip cp-chip--combo">조합 필요(쿼리+코드)</span>);
  return <span className="dp-chips" style={{ display: 'inline-flex' }}>{chips}</span>;
}

/** 전 카드(레지스트리 순) 발동 표 — 미발동 카드도 흐리게 표시(미발동 관찰용). */
function CardTable({ cards }: { cards: ContractsProbeCard[] }): React.ReactElement {
  return (
    <table className="dp-sections">
      <thead>
        <tr>
          <th>발동</th>
          <th>카드 id</th>
          <th>제목</th>
          <th>발동 근거</th>
          <th>파생 신호</th>
          <th>글자</th>
        </tr>
      </thead>
      <tbody>
        {cards.map((c) => (
          <tr key={c.id} className={c.fired ? 'dp-in' : 'dp-out'}>
            <td>{c.fired ? '✅' : '⋯'}</td>
            <td className="dp-name">{c.id}</td>
            <td>{c.title}</td>
            <td><SourceChips c={c} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {c.requiresPatchMode && <span className="dp-chip cp-chip--patch" title="편집 모드 메뉴에서 structural 제거(JSX 렌더 필요)">patch 강제</span>}
              {c.replacesRegionRootWith && (
                <span className="dp-chip cp-chip--swap" title="영역 루트를 이 컴포넌트로 통째 교체 허용(루트태그 게이트 화이트리스트)">
                  루트→{c.replacesRegionRootWith}
                </span>
              )}
              {!c.requiresPatchMode && !c.replacesRegionRootWith && <span className="ip-null">—</span>}
            </td>
            <td style={{ textAlign: 'right', opacity: 0.7 }}>{c.chars.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface HistoryRow {
  time: string;
  query: string;
  fired: string;
  props: string;
  tokens: string;
}

export function ContractsProbeApp(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [filePath, setFilePath] = useState('');
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ContractsProbeResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'contractsProbeFilePicked':
          setFilePath(msg.filePath);
          break;
        case 'contractsProbeResult': {
          setResult(msg.result);
          const r = msg.result;
          setHistory((prev) =>
            [
              {
                time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                query: r.query,
                fired: `${r.firedCount}/${r.cards.length}`,
                props: r.props.detected.length > 0 ? r.props.detected.join(',') : '—',
                tokens: `${r.budget.totalTokens.toLocaleString()}tk(${r.budget.pct}%)`,
              },
              ...prev,
            ].slice(0, 50),
          );
          break;
        }
        case 'contractsProbeDone':
          setRunning(false);
          break;
        case 'contractsProbeError':
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
    vscode.postMessage({ type: 'runContractsProbe', query, filePath, selStart, selEnd });
  };

  return (
    <div className="ip">
      <div className="ip-inner">
        <div className="ip-header">
          <div className="ip-step">4</div>
          <div className="ip-title">설명서 삽입 테스트</div>
        </div>
        <p className="ip-sub">
          프롬프트(+현재 파일, 선택 줄)를 넣으면 contracts 층이 sLLM 프롬프트에 <b>무엇을 왜 끼워 넣는지</b>를
          보여줍니다 — <b>① 계약카드</b>(트리거 발동/미발동 + 발동 근거 ablation) · <b>② 컴포넌트 prop 표</b>
          (존재 기반) · <b>③ 파생 신호</b>(structural 제거·루트 교체 허용) · <b>④ 토큰 비용</b>. 전부{' '}
          <b>모델 무관 결정론</b> 함수를 <b>직접 호출</b>합니다(운영 미러 아님 — 드리프트 없음).
          <br />
          <small>
            ⚠ 여기의 deps는 파일 <b>전체</b>입니다(선택/full/오프라인 경로와 동일). region 경로의 실제 deps는
            ③위치찾기가 가지치기한 depsHeader라 코드 트리거가 여기보다 덜 발동할 수 있습니다(상위집합 — 보수적).
          </small>
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
              placeholder='예: "직원 테이블에 /api/employees 적용해줘" · "alert 버튼 넣어줘" · "입사일을 달력으로 바꿔줘"'
            />
          </div>

          <div className="ip-field">
            <label className="ip-label">
              현재 파일 <small>— deps(코드 트리거·prop 표 재료). 비워두면 쿼리 트리거만 판정</small>
            </label>
            <div className="ip-row">
              <input
                className="ip-input"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="판정할 파일의 상대경로 · 비워두면 '파일 없음'"
              />
              <button className="ip-btn" onClick={() => vscode.postMessage({ type: 'contractsProbeUseActiveFile' })}>
                📄 열린 파일 가져오기
              </button>
            </div>
          </div>

          <div className="ip-field">
            <div className="ip-row" style={{ flexWrap: 'wrap' }}>
              <label className="dp-num">
                선택 시작줄
                <input
                  type="number"
                  className="ip-input dp-num__input"
                  value={selStart}
                  min={0}
                  onChange={(e) => setSelStart(Number(e.target.value) || 0)}
                />
              </label>
              <label className="dp-num">
                선택 끝줄
                <input
                  type="number"
                  className="ip-input dp-num__input"
                  value={selEnd}
                  min={0}
                  onChange={(e) => setSelEnd(Number(e.target.value) || 0)}
                />
              </label>
              <span className="ip-hint">선택 줄 0 = 선택 없음 (region='' — full 경로와 동일 판정)</span>
            </div>
          </div>

          <div className="ip-actions">
            <button className="ip-btn ip-btn--primary" onClick={run} disabled={running || !query.trim()}>
              {running ? '⏳ 판정 중…' : '▶ 주입 판정 실행'}
            </button>
            <span className="ip-hint">Ctrl+Enter로도 실행</span>
          </div>
        </div>

        {error && <div className="ip-card ip-error">{error}</div>}

        {result && (
          <>
            {/* ── 계기판 요약 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">📊 주입 요약</span>
                <span className="ip-card__meta">
                  selectScaffoldContracts · buildContractSection · buildComponentPropsSectionForRegion · promptBudget
                </span>
              </div>
              {result.file && (
                <div className="ip-ctxline">
                  파일: {result.file.path} · {result.file.chars.toLocaleString()}자 · {result.file.lines}줄
                  {result.region
                    ? ` · 영역 ${result.region.startLine}–${result.region.endLine}줄(${result.region.chars.toLocaleString()}자)`
                    : ' · 영역 없음(region=\'\')'}
                </div>
              )}
              <div className="dp-metrics">
                <div className="dp-metric">
                  <div className="dp-metric__num">
                    {result.firedCount}
                    <span className="dp-metric__den"> / {result.cards.length}</span>
                  </div>
                  <div className="dp-metric__lab">발동 카드</div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric__num">{result.props.detected.length}</div>
                  <div className="dp-metric__lab">prop 표 컴포넌트 <small>(주입은 앞 3개까지)</small></div>
                </div>
                <div className="dp-metric">
                  <div className={`dp-metric__num ${result.budget.pct <= 10 ? 'dp-metric__num--win' : ''}`}>
                    {result.budget.totalTokens.toLocaleString()}
                  </div>
                  <div className="dp-metric__lab">
                    주입 토큰(추정) <small>(입력 예산 {result.budget.usableInput.toLocaleString()}의 {result.budget.pct}%)</small>
                  </div>
                </div>
              </div>
              <div className="dp-chips" style={{ marginTop: 8 }}>
                {result.requiresPatchMode && (
                  <span className="dp-chip cp-chip--patch" title="발동 카드 중 JSX 렌더 필요 레시피가 있어 편집 모드 메뉴에서 structural이 제거됩니다">
                    ⚙ structural 제거(patch 강제)
                  </span>
                )}
                {result.swapTargets.map((t, i) => (
                  <span key={i} className="dp-chip cp-chip--swap" title="루트태그 게이트가 이 컴포넌트로의 루트 교체를 허용합니다">
                    ⚙ 루트 교체 허용 → {t}
                  </span>
                ))}
                {!result.requiresPatchMode && result.swapTargets.length === 0 && (
                  <span className="ip-empty">파생 신호 없음(structural 유지 · 루트 변경 금지 유지)</span>
                )}
              </div>
              {result.note && <div className="ip-empty" style={{ marginTop: 6 }}>{result.note}</div>}
            </div>

            {/* ── ① 계약카드 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">① 계약카드 (레지스트리 순 · 미발동 포함)</span>
                <span className="ip-card__meta">발동 근거 = 같은 applies를 입력만 비워 재호출(ablation, 미러 아님)</span>
              </div>
              <CardTable cards={result.cards} />
              {result.contractSection.chars > 0 ? (
                <details className="ip-details">
                  <summary>
                    조립 섹션 전문(buildContractSection) · {result.contractSection.chars.toLocaleString()}자 · ≈
                    {result.contractSection.tokens.toLocaleString()}토큰
                  </summary>
                  <pre className="ip-code">{result.contractSection.text}</pre>
                </details>
              ) : (
                <div className="ip-empty" style={{ marginTop: 6 }}>발동 카드 없음 — 계약 섹션 자체가 미출력(토큰 0).</div>
              )}
            </div>

            {/* ── ② 컴포넌트 prop 표 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">② 컴포넌트 prop 표 (존재 기반)</span>
                <span className="ip-card__meta">detectComponentsInRegion — 영역(없으면 파일 전체)의 인덱스 컴포넌트만</span>
              </div>
              <div className="dp-sub">인덱스에 있는 감지 컴포넌트 <small>(등장 순 · 주입은 앞 3개)</small></div>
              <div className="dp-chips">
                {result.props.detected.length === 0 ? (
                  <span className="ip-empty">없음</span>
                ) : (
                  result.props.detected.map((n, i) => (
                    <span key={i} className={`dp-chip ${i < 3 ? 'dp-chip--path' : ''}`}>
                      &lt;{n}/&gt;{i >= 3 ? ' (컷)' : ''}
                    </span>
                  ))
                )}
              </div>
              <div className="dp-sub" style={{ marginTop: 10 }}>
                인덱스에 <b>없는</b> PascalCase 태그 <small>(prop 표 사각지대 — 인덱스 재생성·TARGET_FILES 후보 신호)</small>
              </div>
              <div className="dp-chips">
                {result.props.unknownTags.length === 0 ? (
                  <span className="ip-empty">없음</span>
                ) : (
                  result.props.unknownTags.map((n, i) => (
                    <span key={i} className="dp-chip cp-chip--unknown">
                      &lt;{n}/&gt;
                    </span>
                  ))
                )}
              </div>
              {result.props.chars > 0 && (
                <details className="ip-details">
                  <summary>
                    prop 표 전문 · {result.props.chars.toLocaleString()}자 · ≈{result.props.tokens.toLocaleString()}토큰
                  </summary>
                  <pre className="ip-code">{result.props.text}</pre>
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
                  <th>발동</th>
                  <th>prop 표</th>
                  <th>주입 토큰</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', opacity: 0.6 }}>{h.time}</td>
                    <td className="q" title={h.query}>
                      {h.query}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.fired}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.props}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.tokens}</td>
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
