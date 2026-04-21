import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatApp } from './chat/ChatApp';
import { LauncherApp } from './launcher/LauncherApp';
import './styles/webview.css';

const mode = (document.body as HTMLElement).dataset.mode ?? 'chat';
const rootEl = document.getElementById('root');

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    mode === 'launcher' ? <LauncherApp /> : <ChatApp />,
  );
}
