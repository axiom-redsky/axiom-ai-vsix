import { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from '../../vscodeApi';
import type { HostToWebviewMessage, DiffLine, ContextBreakdown, ActionCardsPayload } from '../../../types/messages';

export interface ContextUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contextWindow: number;
  /** 이 턴 요청의 max_tokens(출력 자리 예약). 토큰 메터 분모 계산에 사용. */
  outputReserve?: number;
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
  subtype?: 'file-created' | 'file-updated' | 'file-error' | 'file-cancelled' | 'file-confirm-request' | 'patch-failed' | 'action-cards';
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
  /** 오프라인 행동 카드(계획 카드/컴팩트 리스트) 페이로드 — subtype 'action-cards' 전용 */
  actionCards?: ActionCardsPayload;
  /** 실행 버튼을 누른 카드 id — 이중 실행 방지·"실행됨" 표시용 */
  executedCardId?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('연결 중…');
  // 처리 단계(마일스톤) 누적 — "생각 중" 인디케이터에 체크리스트로 표시한다(status 한 줄과 별개).
  // 새 턴 시작 시 비우고, 첫 토큰/완료/오류에서 정리한다(스트리밍이 시작되면 답변 자체가 피드백).
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [systemPromptChars, setSystemPromptChars] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<ContextBreakdown | null>(null);
  const [contextWindow, setContextWindow] = useState<number>(32_768);
  // 출력 자리 예약(=요청 max_tokens). 호스트가 매 턴 보고하며, 토큰 메터 분모를
  // (contextWindow − outputReserve)로 줄이는 데 쓴다. 미보고(구버전 호스트) 시 0 → 종전 동작.
  const [outputReserve, setOutputReserve] = useState<number>(0);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  // 직전 턴이 오프라인(로컬 RAG)이었는지 — 토큰 메터를 라이브 측정 대신 "오프라인(토큰 미사용)"으로
  // 전환하는 데 쓴다. 세션 단위가 아니라 매 턴 host 신호로 갱신돼 온↔오프 깜빡임을 그대로 따라간다.
  const [isOffline, setIsOffline] = useState(false);
  // 이번 턴이 온라인 지식 가이드(로컬 문서 결정론 렌더 · LLM 미호출)였는지 — isOffline과 함께
  // 메터를 비활성화하되 라벨을 "오프라인" 대신 "로컬 지식"으로 구분하는 데 쓴다(서버는 온라인).
  const [isLocalKnowledge, setIsLocalKnowledge] = useState(false);
  // 이번 턴이 "정독용"(지식·가이드 전문 렌더)인지 — true면 답변 바닥이 아니라 이번 질문을 뷰포트
  // 맨 위에 고정해 위→아래로 읽게 한다. isOffline(토큰 메터 전용)과 분리된 별도 축: 온라인 지식
  // 가이드도 켜지고, 오프라인 턴(로컬 RAG)도 켜진다. 매 턴 sendMessage에서 false로 리셋된다.
  const [pinQuestionTop, setPinQuestionTop] = useState(false);
  // 파일 피커로 첨부한 참조 파일 토큰(`@경로`) — 입력창에 append되도록 InputBar에 전달한다.
  const [attachText, setAttachText] = useState('');
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
            setProgressSteps([]);
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
          setProgressSteps([]);
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
          setProgressSteps([]);
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
        case 'progress':
          // 연속 중복 라벨은 무시하고 새 마일스톤만 누적한다.
          setProgressSteps((prev) => (prev[prev.length - 1] === msg.label ? prev : [...prev, msg.label]));
          break;
        case 'referenceAttached':
          // 같은 파일을 연속 첨부해도 effect가 다시 돌도록 매번 새 문자열로 set한다.
          if (msg.text) setAttachText(msg.text);
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
            // localKnowledge: 서버는 온라인이나 이 턴은 로컬 문서 결정론 렌더(LLM 미호출) — 메터
            // 라벨만 "로컬 지식"으로 구분한다. 순수 오프라인 턴은 이 플래그가 없어 false로 남는다.
            setIsLocalKnowledge(!!msg.localKnowledge);
            // 오프라인 턴은 로컬 지식 답변 → 정독용으로 질문을 상단 고정한다.
            setPinQuestionTop(true);
            break;
          }
          setIsOffline(false);
          setIsLocalKnowledge(false);
          setSystemPromptChars(msg.systemPromptChars);
          if (msg.breakdown) setBreakdown(msg.breakdown);
          if (msg.contextWindow) setContextWindow(msg.contextWindow);
          if (msg.outputReserve !== undefined) setOutputReserve(msg.outputReserve);
          // 새 턴 시작 시 이전 usage 측정값 초기화 (이번 턴에 새로 받기 전까지 추정치 사용)
          setUsage(null);
          break;
        case 'usage':
          setIsOffline(false);
          setIsLocalKnowledge(false);
          setUsage({
            promptTokens: msg.promptTokens,
            completionTokens: msg.completionTokens,
            totalTokens: msg.totalTokens,
            contextWindow: msg.contextWindow,
            outputReserve: msg.outputReserve,
          });
          if (msg.contextWindow) setContextWindow(msg.contextWindow);
          if (msg.outputReserve !== undefined) setOutputReserve(msg.outputReserve);
          break;
        case 'pinQuestion':
          // 온라인 지식·가이드 전문 렌더 — 정독용으로 질문을 상단 고정(토큰 메터는 건드리지 않음).
          setPinQuestionTop(true);
          break;
        case 'actionCards':
          // 오프라인 추천 카드 — 계획 카드는 위에서 읽으므로 상단 고정하지 않는다(짧은 카드).
          setIsWaiting(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              subtype: 'action-cards',
              content: '',
              actionCards: msg.payload,
            },
          ]);
          break;
        case 'actionCardSlots':
          // 칩 편집 결과 반영 — 해당 카드의 슬롯·출력 미리보기만 교체.
          setMessages((prev) =>
            prev.map((m) => {
              if (m.subtype !== 'action-cards' || m.actionCards?.requestId !== msg.requestId) return m;
              return {
                ...m,
                actionCards: {
                  ...m.actionCards,
                  cards: m.actionCards.cards.map((c) =>
                    c.cardId === msg.cardId ? { ...c, slots: msg.slots, outputs: msg.outputs } : c,
                  ),
                },
              };
            }),
          );
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming || isWaiting) return;
      // 새 턴 시작 — 정독 고정 해제(이번 턴이 지식·가이드면 host가 pinQuestion으로 다시 켠다).
      setPinQuestionTop(false);
      setProgressSteps([]);
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
    setProgressSteps([]);
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

  /** 행동 카드 칩 클릭 — 호스트가 QuickPick을 열고 actionCardSlots로 회신한다(인라인 불가 슬롯). */
  const sendCardChip = useCallback((requestId: string, cardId: string, slotName: string) => {
    vscode.postMessage({ type: 'actionCardChip', requestId, cardId, slotName });
  }, []);

  /** 카드 안에서 인라인으로 고른/입력한 값 — 호스트가 검증 후 actionCardSlots로 되돌려준다. */
  const sendCardSlot = useCallback((requestId: string, cardId: string, slotName: string, value: string) => {
    vscode.postMessage({ type: 'actionCardSlotSet', requestId, cardId, slotName, value });
  }, []);

  /** 행동 카드 실행 — 이중 클릭 방지를 위해 로컬에서 즉시 "실행됨"으로 표시한다. */
  const sendCardExecute = useCallback((requestId: string, cardId: string) => {
    vscode.postMessage({ type: 'actionCardExecute', requestId, cardId });
    setMessages((prev) =>
      prev.map((m) =>
        m.subtype === 'action-cards' && m.actionCards?.requestId === requestId
          ? { ...m, executedCardId: cardId }
          : m,
      ),
    );
  }, []);

  const dismissSelection = useCallback(() => setSelectionContext(null), []);

  /** 파일 피커를 열어 참조 파일을 첨부한다(호스트가 `@경로`를 referenceAttached로 회신). */
  const attachReference = useCallback(() => {
    vscode.postMessage({ type: 'pickReferenceFile' });
  }, []);

  /** InputBar가 attachText를 입력창에 반영한 뒤 호출 — 다음 첨부를 위해 비운다. */
  const consumeAttach = useCallback(() => setAttachText(''), []);

  return {
    messages, status, progressSteps, isStreaming, isWaiting,
    sendMessage, clearHistory, stopStreaming, sendConfirmation, sendPatchRecovery,
    sendCardChip, sendCardSlot, sendCardExecute,
    selectionContext, dismissSelection,
    systemPromptChars, breakdown, contextWindow, outputReserve, usage, isOffline, isLocalKnowledge, pinQuestionTop,
    attachReference, attachText, consumeAttach,
  };
}
