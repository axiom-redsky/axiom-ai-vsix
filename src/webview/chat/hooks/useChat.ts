import { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from '../../vscodeApi';
import type { HostToWebviewMessage, DiffLine } from '../../../types/messages';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  subtype?: 'file-created' | 'file-updated' | 'file-error' | 'file-cancelled';
  diff?: DiffLine[];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('연결 중…');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const streamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });

    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'token': {
          if (!streamingIdRef.current) {
            const id = Date.now().toString();
            streamingIdRef.current = id;
            setIsWaiting(false);
            setIsStreaming(true);
            setMessages((prev) => [
              ...prev,
              { id, role: 'assistant', content: msg.content, isStreaming: true },
            ]);
          } else {
            const id = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: m.content + msg.content } : m)),
            );
          }
          break;
        }
        case 'done': {
          const id = streamingIdRef.current;
          setIsWaiting(false);
          if (id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
            );
            streamingIdRef.current = null;
            setIsStreaming(false);
          }
          break;
        }
        case 'error': {
          const id = streamingIdRef.current;
          setIsWaiting(false);
          setMessages((prev) => {
            if (id) {
              return prev.map((m) =>
                m.id === id
                  ? { ...m, content: `오류: ${msg.message}`, isError: true, isStreaming: false }
                  : m,
              );
            }
            return [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'assistant',
                content: `오류: ${msg.message}`,
                isError: true,
              },
            ];
          });
          streamingIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        case 'status':
          setStatus(msg.text);
          break;
        case 'fileCreated':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'file-created',
              content: msg.filePath,
            },
          ]);
          break;
        case 'fileUpdated':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'file-updated',
              content: msg.filePath,
              diff: msg.diff,
            },
          ]);
          break;
        case 'fileError':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'file-error',
              content: msg.message,
              isError: true,
            },
          ]);
          break;
        case 'fileCancelled':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'file-cancelled',
              content: '',
            },
          ]);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming || isWaiting) return;
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: text },
      ]);
      setIsWaiting(true);
      vscode.postMessage({ type: 'sendMessage', text });
    },
    [isStreaming, isWaiting],
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    vscode.postMessage({ type: 'clearHistory' });
  }, []);

  const stopStreaming = useCallback(() => {
    vscode.postMessage({ type: 'stopMessage' });
  }, []);

  return { messages, status, isStreaming, isWaiting, sendMessage, clearHistory, stopStreaming };
}
