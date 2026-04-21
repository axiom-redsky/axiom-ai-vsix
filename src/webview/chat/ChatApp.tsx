import React from 'react';
import { useChat } from './hooks/useChat';
import { StatusBar } from './components/StatusBar';
import { MessageList } from './components/MessageList';
import { InputBar } from './components/InputBar';

export function ChatApp(): React.ReactElement {
  const { messages, status, isStreaming, sendMessage, clearHistory, stopStreaming } = useChat();

  return (
    <div className="chat-app">
      <StatusBar status={status} onClear={clearHistory} />
      <MessageList messages={messages} />
      <InputBar onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
    </div>
  );
}
