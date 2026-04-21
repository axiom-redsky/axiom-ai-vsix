import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatApp } from './chat/ChatApp';
import './styles/webview.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<ChatApp />);
}
