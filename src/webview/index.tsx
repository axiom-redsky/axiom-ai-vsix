import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatApp } from './chat/ChatApp';
import { LauncherApp } from './launcher/LauncherApp';
import { ProjectConfigApp } from './projectConfig/ProjectConfigApp';
import { SliceProbeApp } from './sliceProbe/SliceProbeApp';
import './styles/webview.css';
import 'highlight.js/styles/vs2015.css';

const mode = (document.body as HTMLElement).dataset.mode ?? 'chat';
const rootEl = document.getElementById('root');

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    mode === 'launcher' ? <LauncherApp />
    : mode === 'project-config' ? <ProjectConfigApp />
    : mode === 'slice-probe' ? <SliceProbeApp />
    : <ChatApp />,
  );
}
