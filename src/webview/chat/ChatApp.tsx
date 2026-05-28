import React, { useState, useCallback } from 'react';
import { vscode } from '../vscodeApi';
import { useChat } from './hooks/useChat';
import { MessageList } from './components/MessageList';
import { InputBar } from './components/InputBar';
import { ClearWarningBanner } from './components/ClearWarningBanner';
import { isExactSlashCommand } from './slashCommands';

export function ChatApp(): React.ReactElement {
  const { messages, status, isStreaming, isWaiting, sendMessage, clearHistory, stopStreaming, sendConfirmation } = useChat();
  const [prefillText, setPrefillText] = useState('');

  const handlePrefill = useCallback((text: string) => {
    setPrefillText(text);
  }, []);

  const handlePrefillConsumed = useCallback(() => {
    setPrefillText('');
  }, []);

  const handleSend = useCallback((text: string) => {
    const cmd = isExactSlashCommand(text);
    if (cmd?.type === 'local') {
      if (cmd.syntax === '/clear') clearHistory();
      return;
    }
    sendMessage(text);
  }, [sendMessage, clearHistory]);

  return (
    <div className="chat-app">
      <div className="chat-header">
        <div className="chat-header__left">
          <svg className="chat-header__icon" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M18.164,7.931V5.085c0.769-0.359,1.262-1.13,1.266-1.978V3.04c-0.003-1.21-0.983-2.189-2.193-2.193H17.17   c-1.21,0.003-2.189,0.983-2.193,2.193v0.067c0.004,0.849,0.497,1.619,1.266,1.978v2.852c-1.083,0.166-2.103,0.614-2.957,1.301   L5.458,3.142C5.814,1.81,5.023,0.441,3.69,0.085S0.989,0.521,0.633,1.853s0.436,2.701,1.768,3.057   c0.637,0.17,1.316,0.081,1.888-0.247l7.696,5.991c-1.419,2.14-1.38,4.931,0.096,7.032l-2.342,2.342   c-0.188-0.06-0.384-0.092-0.581-0.095c-1.123,0-2.033,0.91-2.033,2.033C7.125,23.09,8.035,24,9.158,24   c1.123,0,2.033-0.91,2.033-2.033l0,0c-0.003-0.197-0.035-0.393-0.095-0.581l2.317-2.317c2.742,2.094,6.662,1.569,8.756-1.172   s1.569-6.662-1.172-8.756c-0.83-0.634-1.806-1.05-2.838-1.209 M17.2,17.308c-1.77-0.004-3.202-1.443-3.198-3.213   c0.004-1.77,1.443-3.202,3.213-3.198c1.768,0.004,3.199,1.439,3.198,3.207c0,1.77-1.435,3.205-3.205,3.205"/>
          </svg>
          <span className="chat-header__title">Axiom AI</span>
        </div>
        <div className="chat-header__right">
          <span className="chat-header__status">{status}</span>
          <button
            className="chat-header__btn"
            onClick={clearHistory}
            title="대화 초기화"
            disabled={isStreaming}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 4H12M5 4V2.5C5 2.22 5.22 2 5.5 2H8.5C8.78 2 9 2.22 9 2.5V4M10.5 4L10 11.5C10 11.78 9.78 12 9.5 12H4.5C4.22 12 4 11.78 4 11.5L3.5 4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <MessageList messages={messages} isStreaming={isStreaming} isWaiting={isWaiting} onConfirm={sendConfirmation} />
      <ClearWarningBanner messages={messages} isStreaming={isStreaming} onClear={clearHistory} />
      <SpecQuickBar onPrefill={handlePrefill} onSend={sendMessage} isStreaming={isStreaming} />
      <InputBar
        onSend={handleSend}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        prefillText={prefillText}
        onPrefillConsumed={handlePrefillConsumed}
      />
    </div>
  );
}

/* ─── SDD 퀵액션 버튼 띠 ─────────────────────────────────────── */

interface QuickBarProps {
  onPrefill: (text: string) => void;
  onSend: (text: string) => void;
  isStreaming: boolean;
}

function SpecQuickBar({ onPrefill, onSend, isStreaming }: QuickBarProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const prefill = (text: string) => {
    onPrefill(text);
  };

  const send = (text: string) => {
    if (isStreaming) return;
    onSend(text);
  };

  return (
    <div className="spec-quick-bar">
      <button
        className={`spec-quick-bar__toggle${open ? ' spec-quick-bar__toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="SDD 스펙 빠른 액션"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4h8M2 6h8M2 8h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span>SDD</span>
        <svg
          className="spec-quick-bar__chevron"
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="spec-quick-bar__actions">
          <button
            className="spec-quick-bar__btn spec-quick-bar__btn--primary"
            onClick={() => prefill('/spec ')}
            title="스펙 생성 — 입력창에 /spec 을 채웁니다"
            disabled={isStreaming}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            스펙 생성
          </button>

          <button
            className="spec-quick-bar__btn spec-quick-bar__btn--accent"
            onClick={() => prefill('/spec fast ')}
            title="빠른 생성 — 스펙 + 승인 + 코드 한 번에"
            disabled={isStreaming}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7 1L3 6.5h3L4.5 11 9.5 5H6.5L7 1z" fill="currentColor" />
            </svg>
            빠른 생성
          </button>

          <button
            className="spec-quick-bar__btn"
            onClick={() => prefill('/spec update ')}
            title="스펙 수정 — 현재 열린 spec.md를 AI로 수정"
            disabled={isStreaming}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 9.5h8M7.5 2.5l2 2-5 5H2.5v-2l5-5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            스펙 수정
          </button>

          <button
            className="spec-quick-bar__btn spec-quick-bar__btn--success"
            onClick={() => send('/spec approve')}
            title="승인 — 현재 열린 spec.md를 approved로 전환"
            disabled={isStreaming}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6.5l3 3 5-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            승인
          </button>

          <button
            className="spec-quick-bar__btn spec-quick-bar__btn--muted"
            onClick={() => { vscode.postMessage({ type: 'sendMessage', text: '/spec guide' }); }}
            title="스펙 작성 규칙 가이드 보기"
            disabled={isStreaming}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 5.5v3M6 3.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            가이드
          </button>
        </div>
      )}
    </div>
  );
}
