import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../hooks/useChat';

interface Props {
  messages: Message[];
}

export function MessageList({ messages }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <div className="empty-state">
          <p>Axiom AI에게 질문하세요.</p>
          <p className="hint">예: "useApi로 GET 요청하는 코드 짜줘"</p>
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
