import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, RegionIoInput, RegionIoOutput } from '../../types/messages';

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
  maxHeight: 360,
  overflow: 'auto',
  margin: 0,
};
const sectionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 12, marginBottom: 4 };

function Block({ title, body, chars, open }: { title: string; body: string; chars?: number; open?: boolean }): React.ReactElement {
  const has = body.trim().length > 0;
  return (
    <details style={{ marginTop: 8 }} open={open}>
      <summary style={{ cursor: 'pointer', fontSize: 12 }}>
        {title}
        <span style={{ opacity: 0.6 }}> · {chars ?? body.length}자{!has ? ' (없음)' : ''}</span>
      </summary>
      {has ? <pre style={codeBox}>{body}</pre> : <div style={{ opacity: 0.5, fontSize: 12, marginTop: 4 }}>—</div>}
    </details>
  );
}

export function RegionIoApp(): React.ReactElement {
  const [filePath, setFilePath] = useState('');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState<RegionIoInput | null>(null);
  const [output, setOutput] = useState<RegionIoOutput | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'regionIoFilePicked':
          setFilePath(msg.filePath);
          break;
        case 'regionIoInput':
          setInput(msg.input);
          break;
        case 'regionIoOutput':
          setOutput(msg.output);
          break;
        case 'regionIoDone':
          setRunning(false);
          break;
        case 'regionIoError':
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
    setInput(null);
    setOutput(null);
    setRunning(true);
    vscode.postMessage({ type: 'runRegionIo', filePath, query });
  };

  return (
    <div style={{ padding: 12, fontSize: 13, height: '100vh', overflowY: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>영역편집 입·출력 점검</div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
        하이브리드 영역 편집이 모델에 보내는 <b>영역별 분리 입력</b>과 모델의 <b>원시 출력</b>을 그대로 보여줍니다.
        운영과 동일한 <code>locateEditRegion</code> + <code>buildHybridPrompt</code>를 호출하므로 실제 전송 내용과 1:1입니다. 적용·디스크 반영은 없습니다.
      </div>

      <label style={{ display: 'block', marginBottom: 4 }}>대상 파일</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          style={{ flex: 1, minWidth: 0 }}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="파일 절대경로"
        />
        <button onClick={() => vscode.postMessage({ type: 'regionIoPickFile' })}>선택</button>
        <button onClick={() => vscode.postMessage({ type: 'regionIoUseActiveFile' })}>현재 파일</button>
      </div>

      <label style={{ display: 'block', marginBottom: 4 }}>질문 (수정 요청)</label>
      <textarea
        style={{ width: '100%', minHeight: 56, marginBottom: 8, boxSizing: 'border-box' }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="예: 부서 select 박스에 /api/departments 적용"
      />

      <button onClick={run} disabled={running || !filePath || !query.trim()} style={{ fontWeight: 600, marginBottom: 6 }}>
        {running ? '실행 중…' : '점검 실행'}
      </button>

      {error && (
        <div style={{ ...card, borderColor: 'var(--vscode-errorForeground, #f48771)', color: 'var(--vscode-errorForeground, #f48771)' }}>
          {error}
        </div>
      )}

      {/* ── 분리 입력 ── */}
      {input && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📥 분리된 입력 (모델에 전송)</div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            위치결정: 최고매칭 {input.locate.bestLine}줄 · 점수 {input.locate.bestScore} · 매칭 [{input.locate.matched.join(', ') || '없음'}]
            <br />
            편집 영역: {input.locate.startLine}~{input.locate.endLine}줄 · 분리입력 {input.systemPromptChars}자 (원본 전체 {input.sourceChars}자 대비)
          </div>
          <div
            style={{
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
              marginBottom: 4,
              color: 'var(--vscode-foreground, #ccc)',
              border: `1px solid ${input.safety.ok ? 'rgba(46,160,67,0.6)' : 'rgba(204,167,0,0.6)'}`,
              background: input.safety.ok ? 'rgba(46,160,67,0.15)' : 'rgba(204,167,0,0.15)',
            }}
          >
            🛡️ 안전 게이트: {input.safety.ok ? '통과' : `차단 (${input.safety.gate})`}
            <div style={{ opacity: 0.85 }}>{input.safety.reason}</div>
          </div>

          {/* 입력(다이어트) 품질 — axiom 입력구성 책임 구간(모델 무관) */}
          <div
            style={{
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
              marginBottom: 4,
              border: `1px solid ${input.quality.adequate ? 'rgba(46,160,67,0.6)' : 'rgba(248,113,113,0.6)'}`,
              background: input.quality.adequate ? 'rgba(46,160,67,0.12)' : 'rgba(248,113,113,0.12)',
            }}
          >
            🧪 입력 품질: {input.quality.adequate ? '충분(adequate)' : '부실(inadequate)'} · 다이어트비 {input.quality.dietRatio}
            <div style={{ opacity: 0.7, marginTop: 2 }}>
              ※ 이 구간은 <b>axiom의 입력 구성</b> 책임입니다(모델과 무관 — region 타깃·컨텍스트 충분성).
            </div>
            {input.quality.flags.length === 0 ? (
              <div style={{ opacity: 0.6, marginTop: 4 }}>플래그 없음</div>
            ) : (
              input.quality.flags.map((f, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  {f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🔵'} <b>[{f.code}]</b> {f.message}
                </div>
              ))
            )}
          </div>

          <div style={{ ...sectionTitle, marginTop: 8 }}>영역별 분리 조각</div>
          <Block title="① 편집 영역 (region — 모델이 다시 쓸 부분)" body={input.sections.region} open />
          <Block title="② 의존성 헤더 (depsHeader — 읽기 전용 참고)" body={input.sections.depsHeader} />
          <Block title="③ 참조하는 기존 선언 (backingDecls — grounding)" body={input.sections.backingDecls} />
          <Block title="④ 참조 스펙 (referencedSpec — api-spec 등)" body={input.sections.referencedSpec} />
          <Block title="⑤ 기존 컨트롤 인벤토리 (B — 재생성 금지 컨텍스트)" body={input.sections.controlInventory} />
          <Block title="▣ 실제 전송 system 프롬프트 전체 (조립 결과)" body={input.systemPrompt} chars={input.systemPromptChars} />
        </div>
      )}

      {/* ── 출력 결과물 ── */}
      {(running || output) && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📤 출력 결과물 (모델 응답)</div>
          {!output ? (
            <div style={{ opacity: 0.6, fontSize: 12 }}>모델 응답 대기 중…</div>
          ) : output.status === 'error' ? (
            <pre style={{ ...codeBox, color: 'var(--vscode-errorForeground, #f48771)' }}>{output.error}</pre>
          ) : (
            <>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                파싱: &lt;region&gt; {output.parsed.regionFound ? '있음' : '없음'} · &lt;hook&gt; {output.parsed.hooks.length}개 · &lt;import&gt; {output.parsed.imports.length}개 · &lt;replace&gt; {output.parsed.replaces.length}개
              </div>
              <Block title="① 파싱된 region (JSX 재작성)" body={output.parsed.region} open={output.parsed.regionFound} />
              {output.parsed.hooks.map((h, i) => (
                <Block key={i} title={`② 파싱된 hook[${i + 1}]`} body={h} />
              ))}
              <Block
                title="③ 파싱된 import"
                body={output.parsed.imports
                  .map((im) => `module="${im.module}"${im.named ? ` named="${im.named.join(', ')}"` : ''}${im.def ? ` def="${im.def}"` : ''}`)
                  .join('\n')}
              />
              {output.parsed.replaces.map((r, i) => (
                <Block key={`r${i}`} title={`④ 파싱된 replace[${i + 1}] (C — 기존 문장 교체) anchor="${r.anchor}"`} body={r.replacement} />
              ))}
              <Block title="▣ 모델 원시 출력 전체" body={output.rawOutput} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
