import { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from '../../vscodeApi';
import type { HostToWebviewMessage, DiffLine, ContextBreakdown } from '../../../types/messages';

export interface ContextUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contextWindow: number;
}

export interface SelectionContext {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  subtype?: 'file-created' | 'file-updated' | 'file-error' | 'file-cancelled' | 'file-confirm-request' | 'patch-failed';
  diff?: DiffLine[];
  actionId?: string;
  confirmPending?: boolean;
  /** patch 실패 복구용 — patchFailed 메시지에서 발급된 ID */
  recoveryId?: string;
  /** patch 실패 시 LLM이 제시했던 search 코드 앞부분(가독성용) */
  searchPreview?: string;
  /** 사용자 선택 대기 중 여부 */
  recoveryPending?: boolean;
  /** 회복 카드 종류 — patch 매칭 실패인지 React 규칙 위반인지 구분 */
  failureKind?: 'patch-mismatch' | 'react-violation';
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('연결 중…');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [systemPromptChars, setSystemPromptChars] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<ContextBreakdown | null>(null);
  const [contextWindow, setContextWindow] = useState<number>(32_768);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  // 직전 턴이 오프라인(로컬 RAG)이었는지 — 토큰 메터를 라이브 측정 대신 "오프라인(토큰 미사용)"으로
  // 전환하는 데 쓴다. 세션 단위가 아니라 매 턴 host 신호로 갱신돼 온↔오프 깜빡임을 그대로 따라간다.
  const [isOffline, setIsOffline] = useState(false);
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
        case 'selectionContext':
          if (msg.filePath && msg.selectedText) {
            setSelectionContext({ filePath: msg.filePath, startLine: msg.startLine, endLine: msg.endLine, selectedText: msg.selectedText });
          } else {
            setSelectionContext(null);
          }
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
        case 'fileConfirmRequest':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'file-confirm-request',
              content: msg.filePath,
              diff: msg.diff,
              actionId: msg.actionId,
              confirmPending: true,
            },
          ]);
          break;
        case 'patchFailed':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'patch-failed',
              content: msg.filePath,
              recoveryId: msg.recoveryId,
              searchPreview: msg.searchPreview,
              recoveryPending: true,
              failureKind: msg.failureKind,
            },
          ]);
          break;
        case 'contextInfo':
          if (msg.offline) {
            // 오프라인 턴 — 서버가 컨텍스트를 소비하지 않으므로 누적 추정치로 막대를 차오르게 하지
            // 않는다. 직전 온라인 값은 그대로 두고(온라인 복귀 시 다음 contextInfo가 덮어씀) 표시만
            // InputBar가 "오프라인 · 토큰 미사용"으로 대체한다.
            setIsOffline(true);
            break;
          }
          setIsOffline(false);
          setSystemPromptChars(msg.systemPromptChars);
          if (msg.breakdown) setBreakdown(msg.breakdown);
          if (msg.contextWindow) setContextWindow(msg.contextWindow);
          // 새 턴 시작 시 이전 usage 측정값 초기화 (이번 턴에 새로 받기 전까지 추정치 사용)
          setUsage(null);
          break;
        case 'usage':
          setIsOffline(false);
          setUsage({
            promptTokens: msg.promptTokens,
            completionTokens: msg.completionTokens,
            totalTokens: msg.totalTokens,
            contextWindow: msg.contextWindow,
          });
          if (msg.contextWindow) setContextWindow(msg.contextWindow);
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
      // 핀(chip)으로 붙은 선택 범위를 함께 전송 — host가 라이브 에디터 selection 대신 이걸
      // 선택의 진실로 삼는다(다른 파일/패널에 포커스가 있어도 선택이 유실되지 않게).
      const selection = selectionContext
        ? {
            filePath: selectionContext.filePath,
            startLine: selectionContext.startLine,
            endLine: selectionContext.endLine,
          }
        : undefined;
      vscode.postMessage({ type: 'sendMessage', text, selection });
    },
    [isStreaming, isWaiting, selectionContext],
  );

  const clearHistory = useCallback(() => {
    streamingIdRef.current = null;
    setIsStreaming(false);
    setIsWaiting(false);
    setSystemPromptChars(0);
    setBreakdown(null);
    setUsage(null);
    setMessages([]);
    vscode.postMessage({ type: 'stopMessage' });
    vscode.postMessage({ type: 'clearHistory' });
  }, []);

  const stopStreaming = useCallback(() => {
    vscode.postMessage({ type: 'stopMessage' });
  }, []);

  const sendConfirmation = useCallback((actionId: string, approved: boolean) => {
    vscode.postMessage(
      approved
        ? { type: 'fileConfirmApprove', actionId }
        : { type: 'fileConfirmReject', actionId },
    );
    setMessages((prev) =>
      prev.map((m) => (m.actionId === actionId ? { ...m, confirmPending: false } : m)),
    );
  }, []);

  const sendPatchRecovery = useCallback((recoveryId: string, action: 'retry' | 'cancel') => {
    vscode.postMessage(
      action === 'retry'
        ? { type: 'patchRetryFull', recoveryId }
        : { type: 'patchRetryCancel', recoveryId },
    );
    setMessages((prev) =>
      prev.map((m) => (m.recoveryId === recoveryId ? { ...m, recoveryPending: false } : m)),
    );
    if (action === 'retry') setIsWaiting(true);
  }, []);

  const dismissSelection = useCallback(() => setSelectionContext(null), []);

  return {
    messages, status, isStreaming, isWaiting,
    sendMessage, clearHistory, stopStreaming, sendConfirmation, sendPatchRecovery,
    selectionContext, dismissSelection,
    systemPromptChars, breakdown, contextWindow, usage, isOffline,
  };
}
