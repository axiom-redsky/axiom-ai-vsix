import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage } from '../../types/messages';

export function LauncherApp(): React.ReactElement {
  const [model, setModel] = useState<string>('연결 중…');

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });

    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      if (event.data.type === 'status') {
        setModel(event.data.text);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpenChat = () => {
    vscode.postMessage({ type: 'openChat' });
  };

  const handleClearHistory = () => {
    vscode.postMessage({ type: 'clearHistory' });
  };

  return (
    <div className="launcher">
      <div className="launcher__header">
        <div className="launcher__logo">
          <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M18.164,7.931V5.085c0.769-0.359,1.262-1.13,1.266-1.978V3.04c-0.003-1.21-0.983-2.189-2.193-2.193H17.17   c-1.21,0.003-2.189,0.983-2.193,2.193v0.067c0.004,0.849,0.497,1.619,1.266,1.978v2.852c-1.083,0.166-2.103,0.614-2.957,1.301   L5.458,3.142C5.814,1.81,5.023,0.441,3.69,0.085S0.989,0.521,0.633,1.853s0.436,2.701,1.768,3.057   c0.637,0.17,1.316,0.081,1.888-0.247l7.696,5.991c-1.419,2.14-1.38,4.931,0.096,7.032l-2.342,2.342   c-0.188-0.06-0.384-0.092-0.581-0.095c-1.123,0-2.033,0.91-2.033,2.033C7.125,23.09,8.035,24,9.158,24   c1.123,0,2.033-0.91,2.033-2.033l0,0c-0.003-0.197-0.035-0.393-0.095-0.581l2.317-2.317c2.742,2.094,6.662,1.569,8.756-1.172   s1.569-6.662-1.172-8.756c-0.83-0.634-1.806-1.05-2.838-1.209 M17.2,17.308c-1.77-0.004-3.202-1.443-3.198-3.213   c0.004-1.77,1.443-3.202,3.213-3.198c1.768,0.004,3.199,1.439,3.198,3.207c0,1.77-1.435,3.205-3.205,3.205"/>
          </svg>
        </div>
        <div className="launcher__title-group">
          <h1 className="launcher__title">Axiom AI</h1>
          <p className="launcher__subtitle">Scaffold-Aware Assistant</p>
        </div>
      </div>

      <div className="launcher__model-badge">
        <span className="launcher__model-dot" />
        <span className="launcher__model-name">{model}</span>
      </div>

      <div className="launcher__actions">
        <button className="launcher__primary-btn" onClick={handleOpenChat}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M14 1H2C1.45 1 1 1.45 1 2V11C1 11.55 1.45 12 2 12H5L8 15L11 12H14C14.55 12 15 11.55 15 11V2C15 1.45 14.55 1 14 1Z"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
          새 채팅 시작
        </button>
      </div>

      <div className="launcher__section">
        <p className="launcher__section-title">사용 예시</p>
        <ul className="launcher__tips">
          <li className="launcher__tip">
            <span className="launcher__tip-icon">⌨</span>
            <span>"useApi로 GET 요청하는 코드 짜줘"</span>
          </li>
          <li className="launcher__tip">
            <span className="launcher__tip-icon">🔍</span>
            <span>"이 컴포넌트에 타입 에러가 왜 나?"</span>
          </li>
          <li className="launcher__tip">
            <span className="launcher__tip-icon">✨</span>
            <span>"scaffold 폴더 구조 설명해줘"</span>
          </li>
        </ul>
      </div>

      <div className="launcher__footer">
        <button className="launcher__footer-btn" onClick={handleClearHistory} title="현재 채팅 기록 초기화">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 4H12M5 4V2.5C5 2.22 5.22 2 5.5 2H8.5C8.78 2 9 2.22 9 2.5V4M10.5 4L10 11.5C10 11.78 9.78 12 9.5 12H4.5C4.22 12 4 11.78 4 11.5L3.5 4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          채팅 기록 초기화
        </button>
      </div>
    </div>
  );
}
