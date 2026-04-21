import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Message } from '../hooks/useChat';

interface Props {
  message: Message;
}

export function MessageItem({ message }: Props): React.ReactElement {
  const isUser = message.role === 'user';

  return (
    <div
      className={[
        'message',
        isUser ? 'message--user' : 'message--assistant',
        message.isError ? 'message--error' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="message__role">{isUser ? '나' : 'Axiom AI'}</div>
      <div className="message__content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content + (message.isStreaming ? '▌' : '')}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
