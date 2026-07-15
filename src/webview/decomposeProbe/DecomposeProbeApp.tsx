import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, DecomposeProbeResult, DecomposeSection, DecomposeReference } from '../../types/messages';

const KIND_LABEL: Record<string, string> = {
  function: 'function',
  const: 'const',
  class: 'class',
  interface: 'interface',
  type: 'type',
  import: 'import',
  other: 'other',
};

/** 코드 섹션 표 — 원본 라인 순서로, 예산 포함/제외를 강조. */
function SectionTable({ sections }: { sections: DecomposeSection[] }): React.ReactElement {
  const ordered = [...sections].sort((a, b) => a.startLine - b.startLine);
  return (
    <table className="dp-sections">
      <thead>
        <tr>
          <th>포함</th>
          <th>종류</th>
          <th>이름</th>
          <th>라인</th>
          <th>글자</th>
          <th>점수</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((s, i) => (
          <tr key={i} className={s.included ? 'dp-in' : 'dp-out'}>
            <td>{s.included ? '✅' : '⋯'}</td>
            <td>
              <span className={`dp-kind dp-kind--${s.kind}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
            </td>
            <td className="dp-name">{s.name}</td>
            <td style={{ whiteSpace: 'nowrap', opacity: 0.7 }}>
              {s.startLine}–{s.endLine}
            </td>
            <td style={{ textAlign: 'right', opacity: 0.7 }}>{s.length}</td>
            <td style={{ textAlign: 'right', fontWeight: s.score > 0 ? 700 : 400 }}>{s.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 참조 파일 슬라이싱(Q3) — 코드=관련 섹션·앞잘림 대조, 마크다운=선택 섹션. */
function ReferenceCard({ reference }: { reference: DecomposeReference }): React.ReactElement {
  const r = reference;
  const kindLabel = r.kind === 'code' ? '코드 파일' : r.kind === 'markdown' ? '마크다운' : '기타';
  return (
    <div className="ip-card">
      <div className="ip-card__head">
        <span className="ip-card__title">📎 참조 파일 슬라이싱 (Q3)</span>
        <span className="ip-card__meta">
          {kindLabel} · {r.chars.toLocaleString()}자 · {r.lines}줄 · 예산 {r.budget.toLocaleString()}
        </span>
      </div>
      <div className="ip-ctxline">{r.path}</div>

      {r.wholeInjected ? (
        <div className="ip-empty">{r.note}</div>
      ) : r.code ? (
        <>
          <div className="dp-metrics">
            <div className="dp-metric">
              <div className="dp-metric__num">{r.code.includedCount}</div>
              <div className="dp-metric__lab">포함 섹션 (관련 낮은 {r.code.skippedCount}개 생략)</div>
            </div>
            <div className="dp-metric">
              <div className={`dp-metric__num ${r.code.injectedChars <= r.budget ? 'dp-metric__num--win' : ''}`}>
                {r.code.injectedChars.toLocaleString()}
              </div>
              <div className="dp-metric__lab">
                실제 주입 글자 <small>(stub 접은 후 · 예산 {r.budget.toLocaleString()} 이하 보장)</small>
              </div>
            </div>
            <div className="dp-metric">
              <div className={`dp-metric__num ${r.code.savedFromTailCount > 0 ? 'dp-metric__num--win' : ''}`}>
                {r.code.savedFromTailCount}
              </div>
              <div className="dp-metric__lab">
                앞잘림이었으면 <b>잃었을</b> 관련 조각
                <small> (컷오프 뒤에 있던 포함 섹션)</small>
              </div>
            </div>
          </div>
          {r.code.savedFromTailCount > 0 ? (
            <div className="dp-win">
              ✅ Q3 효과: 앞잘림(앞 {r.budget.toLocaleString()}자)이었으면{' '}
              <b>{r.code.savedFromTailNames.join(', ')}</b> 이(가) 통째로 잘렸을 텐데, 관련 슬라이스로 살렸습니다.
            </div>
          ) : (
            <div className="ip-empty" style={{ marginTop: 4 }}>
              이 쿼리·예산에선 관련 섹션이 모두 앞부분에 있어 앞잘림과 결과가 같습니다(파일 끝 관련 선언이 있을 때 차이가 큽니다).
            </div>
          )}
          <details className="ip-details">
            <summary>슬라이싱 결과 전문 (제외 섹션은 stub)</summary>
            <pre className="ip-code">{r.code.text}</pre>
          </details>
        </>
      ) : r.markdown ? (
        <>
          <div className="dp-metrics">
            <div className="dp-metric">
              <div className="dp-metric__num">{r.markdown.pickedCount}</div>
              <div className="dp-metric__lab">선택 섹션 (형제 {r.markdown.droppedCount}개 제외)</div>
            </div>
          </div>
          <div className="dp-sub" style={{ marginTop: 4 }}>선택된 섹션 헤더</div>
          <div className="dp-chips">
            {r.markdown.pickedHeaders.map((h, i) => (
              <span key={i} className="dp-chip dp-chip--path">
                {h}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="ip-empty">{r.note}</div>
      )}
    </div>
  );
}

interface HistoryRow {
  time: string;
  query: string;
  tokens: number;
  sections: string;
  diet: string;
}

export function DecomposeProbeApp(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [filePath, setFilePath] = useState('');
  const [refPath, setRefPath] = useState('');
  const [budget, setBudget] = useState(4000);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DecomposeProbeResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'decomposeProbeFilePicked':
          setFilePath(msg.filePath);
          break;
        case 'decomposeProbeResult': {
          setResult(msg.result);
          const r = msg.result;
          setHistory((prev) =>
            [
              {
                time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
                query: r.query,
                tokens: r.tokens.length,
                sections: r.slice ? `${r.slice.includedCount}/${r.sections.length}` : '—',
                diet: r.slice ? `${(r.slice.dietRatio * 100).toFixed(0)}%` : '—',
              },
              ...prev,
            ].slice(0, 50),
          );
          break;
        }
        case 'decomposeProbeDone':
          setRunning(false);
          break;
        case 'decomposeProbeError':
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
    vscode.postMessage({ type: 'runDecomposeProbe', query, filePath, budget, selStart, selEnd, refPath });
  };

  return (
    <div className="ip">
      <div className="ip-inner">
        <div className="ip-header">
          <div className="ip-step">2</div>
          <div className="ip-title">분해 테스트</div>
        </div>
        <p className="ip-sub">
          프롬프트(+현재 파일)를 넣으면 decompose 층이 sLLM에 줄 <b>재료로 어떻게 쪼개는지</b>를 두 갈래로
          보여줍니다 — <b>① 쿼리 분해</b>(토큰화·조사 어근·정확 경로·컨트롤 태그)와{' '}
          <b>② 코드·배경 분해</b>(선언 단위 분할 → 쿼리 점수 → 예산 슬라이싱). 전부 <b>모델 무관 결정론</b>{' '}
          함수를 <b>직접 호출</b>합니다(운영 미러가 아니라 실제 산출물 그대로 — 드리프트 없음).
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
              placeholder='예: "재직상태·투입상태 select도 필터에 반영해줘" · "/api/common-codes 로 등급 조회" · "getArr 함수 만들어줘"'
            />
          </div>

          <div className="ip-field">
            <label className="ip-label">
              현재 파일 <small>— 코드·배경 분해 대상 (TS/TSX). 비워두면 쿼리 분해만 표시</small>
            </label>
            <div className="ip-row">
              <input
                className="ip-input"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="분해할 파일의 상대경로 · 비워두면 '파일 없음'"
              />
              <button className="ip-btn" onClick={() => vscode.postMessage({ type: 'decomposeProbeUseActiveFile' })}>
                📄 열린 파일 가져오기
              </button>
            </div>
          </div>

          <div className="ip-field">
            <label className="ip-label">
              참조 파일 <small>— 프롬프트에 @로 첨부하는 스펙·타입 파일 (Q3: 코드 파일은 앞잘림 대신 관련 섹션 슬라이스)</small>
            </label>
            <div className="ip-row">
              <input
                className="ip-input"
                value={refPath}
                onChange={(e) => setRefPath(e.target.value)}
                placeholder="예: /plan/api-spec.md · src/core/types/employee.ts · 비워두면 참조 없음"
              />
            </div>
          </div>

          <div className="ip-field">
            <div className="ip-row" style={{ flexWrap: 'wrap' }}>
              <label className="dp-num">
                예산(글자)
                <input
                  type="number"
                  className="ip-input dp-num__input"
                  value={budget}
                  min={500}
                  step={500}
                  onChange={(e) => setBudget(Number(e.target.value) || 0)}
                />
              </label>
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
              <span className="ip-hint">선택 줄 0 = 선택 없음 (겹치는 섹션 +4점)</span>
            </div>
          </div>

          <div className="ip-actions">
            <button className="ip-btn ip-btn--primary" onClick={run} disabled={running || !query.trim()}>
              {running ? '⏳ 분해 중…' : '▶ 분해 실행'}
            </button>
            <span className="ip-hint">Ctrl+Enter로도 실행</span>
          </div>
        </div>

        {error && <div className="ip-card ip-error">{error}</div>}

        {result && (
          <>
            {/* ── 갈래 1: 쿼리 분해 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">① 쿼리 분해</span>
                <span className="ip-card__meta">tokenizeQuery · extractApiPaths · impliedControlTags</span>
              </div>

              <div className="dp-sub">
                토큰 <small>({result.tokens.length}개 · 파랑=조사 어근 분해로 추가)</small>
              </div>
              <div className="dp-chips">
                {result.tokens.length === 0 ? (
                  <span className="ip-empty">토큰 없음 (길이 2 미만만 남음)</span>
                ) : (
                  result.tokens.map((t, i) => (
                    <span key={i} className={`dp-chip ${t.isStem ? 'dp-chip--stem' : ''}`} title={t.isStem ? '조사를 벗겨 추가된 어근' : '원본 토큰'}>
                      {t.token}
                    </span>
                  ))
                )}
              </div>

              <div className="dp-sub" style={{ marginTop: 12 }}>
                정확 API 경로 <small>(형제 경로와 분리해 +20점 가산되는 리터럴)</small>
              </div>
              <div className="dp-chips">
                {result.apiPaths.length === 0 ? (
                  <span className="ip-empty">없음</span>
                ) : (
                  result.apiPaths.map((p, i) => (
                    <span key={i} className="dp-chip dp-chip--path">
                      {p}
                    </span>
                  ))
                )}
              </div>

              <div className="dp-sub" style={{ marginTop: 12 }}>
                함의 컨트롤 태그 <small>(쿼리가 지목한 입력 컨트롤 — locate 게이트·품질분석 공용)</small>
              </div>
              <div className="dp-chips">
                {result.controlTags.length === 0 ? (
                  <span className="ip-empty">없음</span>
                ) : (
                  result.controlTags.map((c, i) => (
                    <span key={i} className="dp-chip dp-chip--ctrl">
                      &lt;{c}&gt;
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* ── 갈래 2: 코드·배경 분해 ── */}
            <div className="ip-card">
              <div className="ip-card__head">
                <span className="ip-card__title">② 코드·배경 분해</span>
                <span className="ip-card__meta">splitTsSections → scoreCodeSections → sliceByBudget</span>
              </div>

              {result.file && (
                <div className="ip-ctxline">
                  파일: {result.file.path} · {result.file.chars.toLocaleString()}자 · {result.file.lines}줄
                  {result.file.isTs ? '' : ' · (비 TS/TSX)'}
                </div>
              )}

              {result.slice ? (
                <>
                  <div className="dp-metrics">
                    <div className="dp-metric">
                      <div className="dp-metric__num">
                        {result.slice.includedCount}
                        <span className="dp-metric__den"> / {result.sections.length}</span>
                      </div>
                      <div className="dp-metric__lab">포함 섹션 (제외 {result.slice.skippedCount})</div>
                    </div>
                    <div className="dp-metric">
                      <div className="dp-metric__num">{(result.slice.dietRatio * 100).toFixed(0)}%</div>
                      <div className="dp-metric__lab">
                        다이어트 비율 <small>(입력 {result.slice.totalChars.toLocaleString()}자 / 예산 {result.slice.budget.toLocaleString()})</small>
                      </div>
                    </div>
                  </div>

                  {result.slice.dietRatio > 0.9 && result.sections.length > 6 && (
                    <div className="dp-warn">
                      ⚠ 거의 통째로 실렸습니다(다이어트 &gt;90%). 큰 파일이면 무관 섹션(특히 type 덤프)이
                      입력을 채우는 <b>deps 폭주</b> 신호일 수 있습니다 — ②층 #1 개선 후보(deps 가지치기).
                    </div>
                  )}

                  <SectionTable sections={result.sections} />

                  <details className="ip-details">
                    <summary>슬라이싱 결과 전문 · {result.slice.totalChars.toLocaleString()}자 (제외 섹션은 stub)</summary>
                    <pre className="ip-code">{result.slice.text}</pre>
                  </details>
                </>
              ) : (
                <div className="ip-empty">{result.note ?? '코드 분해가 수행되지 않았습니다.'}</div>
              )}
            </div>

            {/* ── 참조 파일 슬라이싱 (Q3) ── */}
            {result.reference && <ReferenceCard reference={result.reference} />}
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
                  <th>토큰</th>
                  <th>포함/전체</th>
                  <th>다이어트</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', opacity: 0.6 }}>{h.time}</td>
                    <td className="q" title={h.query}>
                      {h.query}
                    </td>
                    <td>{h.tokens}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.sections}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.diet}</td>
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
