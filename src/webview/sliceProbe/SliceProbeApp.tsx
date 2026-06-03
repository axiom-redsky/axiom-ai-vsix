import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, ProbeMode } from '../../types/messages';

interface Views {
  filePath: string;
  query: string;
  original: { chars: number; lines: number };
  sliced: { chars: number; includedCount: number; skippedCount: number; text: string };
  fullText: string;
}

interface OutputState {
  status: 'ok' | 'error';
  content: string;
  promptChars: number;
}

const card: React.CSSProperties = {
  border: '1px solid var(--vscode-panel-border, #444)',
  borderRadius: 6,
  padding: 10,
  marginTop: 10,
};
const codeBox: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 11,
  background: 'var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1))',
  padding: 8,
  borderRadius: 4,
  maxHeight: 320,
  overflow: 'auto',
  margin: 0,
};

export function SliceProbeApp(): React.ReactElement {
  const [filePath, setFilePath] = useState('');
  const [query, setQuery] = useState('');
  const [budget, setBudget] = useState(1500);
  const [mode, setMode] = useState<ProbeMode>('both');
  const [running, setRunning] = useState(false);
  const [views, setViews] = useState<Views | null>(null);
  const [outputs, setOutputs] = useState<Partial<Record<'full' | 'sliced' | 'tool' | 'region' | 'hybrid', OutputState>>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'probeFilePicked':
          setFilePath(msg.filePath);
          break;
        case 'probeViews':
          setViews({
            filePath: msg.filePath,
            query: msg.query,
            original: msg.original,
            sliced: msg.sliced,
            fullText: msg.fullText,
          });
          break;
        case 'probeOutput':
          setOutputs((prev) => ({
            ...prev,
            [msg.variant]: { status: msg.status, content: msg.content, promptChars: msg.promptChars },
          }));
          break;
        case 'probeDone':
          setRunning(false);
          break;
        case 'probeError':
          setError(msg.message);
          setRunning(false);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    setError('');
    setViews(null);
    setOutputs({});
    setRunning(true);
    vscode.postMessage({ type: 'runProbe', filePath, query, budget, mode });
  };

  const renderOutput = (variant: 'full' | 'sliced' | 'tool' | 'region' | 'hybrid', label: string) => {
    const o = outputs[variant];
    return (
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          {label}
          {o && <span style={{ fontWeight: 400, opacity: 0.7 }}> · 프롬프트 {o.promptChars}자</span>}
        </div>
        {!o ? (
          <div style={{ opacity: 0.6, fontSize: 12 }}>{running ? '모델 응답 대기 중…' : '—'}</div>
        ) : o.status === 'error' ? (
          <pre style={{ ...codeBox, color: 'var(--vscode-errorForeground, #f48771)' }}>호출 실패: {o.content}</pre>
        ) : (
          <pre style={codeBox}>{o.content}</pre>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>슬라이싱 출력 실험</div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
        파일을 통째로(FULL) vs 잘라서(SLICED) 모델에 보낼 때 출력 품질을 비교합니다. 배치/적용은 하지 않고 원시 출력만 보여줍니다.
      </div>

      <label style={{ display: 'block', marginBottom: 4 }}>대상 파일</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          style={{ flex: 1, minWidth: 0 }}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="파일 절대경로"
        />
        <button onClick={() => vscode.postMessage({ type: 'probePickFile' })}>선택</button>
        <button onClick={() => vscode.postMessage({ type: 'probeUseActiveFile' })}>현재 파일</button>
      </div>

      <label style={{ display: 'block', marginBottom: 4 }}>질문 (수정 요청)</label>
      <textarea
        style={{ width: '100%', minHeight: 56, marginBottom: 8, boxSizing: 'border-box' }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="예: 부서 select 박스에 /api/departments 적용"
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <label>
          슬라이스 예산(자)&nbsp;
          <input
            type="number"
            style={{ width: 80 }}
            value={budget}
            min={300}
            step={100}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
        <label>
          모드&nbsp;
          <select value={mode} onChange={(e) => setMode(e.target.value as ProbeMode)}>
            <option value="both">둘 다 (FULL + SLICED)</option>
            <option value="full">통째로만</option>
            <option value="sliced">잘라서만</option>
            <option value="tool">도구 호출 (CC식 load-on-demand)</option>
            <option value="region">영역 편집 (grep→블록 재작성+위치 교체)</option>
            <option value="hybrid">하이브리드 (JSX 영역 재작성 + 훅 structural 삽입)</option>
          </select>
        </label>
        <button onClick={run} disabled={running || !filePath || !query.trim()} style={{ fontWeight: 600 }}>
          {running ? '실행 중…' : '실행'}
        </button>
      </div>

      {error && (
        <div style={{ ...card, borderColor: 'var(--vscode-errorForeground, #f48771)', color: 'var(--vscode-errorForeground, #f48771)' }}>
          {error}
        </div>
      )}

      {views && (
        <div style={{ ...card, background: 'var(--vscode-editorWidget-background, rgba(127,127,127,0.06))' }}>
          <div style={{ fontWeight: 600 }}>슬라이스 요약</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            원본 {views.original.chars}자 / {views.original.lines}줄 · 예산 {budget}자
            <br />
            슬라이스 결과: 포함 {views.sliced.includedCount}섹션, stub {views.sliced.skippedCount}개, {views.sliced.chars}자
            {views.sliced.skippedCount > 0 && views.sliced.includedCount <= 1 && (
              <div style={{ marginTop: 4, color: 'var(--vscode-editorWarning-foreground, #cca700)' }}>
                ⚠️ 편집 대상 컴포넌트가 통째로 stub되었을 수 있습니다(이 파일에선 슬라이싱이 무의미할 수 있음).
              </div>
            )}
          </div>
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer' }}>SLICED 뷰 (모델이 본 잘린 파일)</summary>
            <pre style={codeBox}>{views.sliced.text}</pre>
          </details>
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer' }}>FULL 뷰 (원본 전체)</summary>
            <pre style={codeBox}>{views.fullText}</pre>
          </details>
        </div>
      )}

      {(mode === 'full' || mode === 'both') && views && renderOutput('full', '[FULL] 통째로 보낸 경우 — 모델 출력')}
      {(mode === 'sliced' || mode === 'both') && views && renderOutput('sliced', '[SLICED] 잘라서 보낸 경우 — 모델 출력')}
      {mode === 'tool' && views && renderOutput('tool', '[TOOL] 도구 호출 (CC식) — 호출 transcript + 최종 출력')}
      {mode === 'region' && views && renderOutput('region', '[REGION] 영역 편집 — grep→추출→재작성→위치 교체')}
      {mode === 'hybrid' && views && renderOutput('hybrid', '[HYBRID] JSX 영역 재작성 + 훅 structural 삽입')}
    </div>
  );
}
