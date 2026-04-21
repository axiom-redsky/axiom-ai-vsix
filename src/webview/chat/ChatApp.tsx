import React from 'react';
import { useChat } from './hooks/useChat';
import { MessageList } from './components/MessageList';
import { InputBar } from './components/InputBar';

export function ChatApp(): React.ReactElement {
  const { messages, status, isStreaming, sendMessage, clearHistory, stopStreaming } = useChat();

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

      <MessageList messages={messages} isStreaming={isStreaming} />
      <InputBar onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
    </div>
  );
}
