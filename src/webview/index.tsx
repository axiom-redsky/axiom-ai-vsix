import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatApp } from './chat/ChatApp';
import { LauncherApp } from './launcher/LauncherApp';
import './styles/webview.css';
import 'highlight.js/styles/vs2015.css';

const mode = (document.body as HTMLElement).dataset.mode ?? 'chat';
const rootEl = document.getElementById('root');

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    mode === 'launcher' ? <LauncherApp /> : <ChatApp />,
  );
}
