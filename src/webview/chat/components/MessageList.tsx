import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MessageItem } from './MessageItem';
import { ThinkingIcon } from './ThinkingIcon';
import { FindBar } from './FindBar';
import type { Message } from '../hooks/useChat';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  isWaiting: boolean;
  status?: string;
  /** 처리 단계(마일스톤) 누적 — 첫 토큰이 오기 전 "생각 중" 인디케이터에 체크리스트로 표시한다. */
  progressSteps?: string[];
  /**
   * 정독용 턴 여부 — scaffold 지식·가이드 전문 렌더(온라인/오프라인 무관). true면 답변 바닥을
   * 쫓지 않고 이번 질문을 뷰포트 맨 위에 정렬해 위→아래로 차근차근 읽게 한다.
   */
  pinQuestionTop?: boolean;
  onConfirm?: (actionId: string, approved: boolean) => void;
  onPatchRecovery?: (recoveryId: string, action: 'retry' | 'cancel') => void;
  onCardChip?: (requestId: string, cardId: string, slotName: string) => void;
  onCardSlotSet?: (requestId: string, cardId: string, slotName: string, value: string) => void;
  onCardExecute?: (requestId: string, cardId: string) => void;
}

const BOTTOM_THRESHOLD = 100;

export function MessageList({ messages, isStreaming, isWaiting, status, progressSteps, pinQuestionTop, onConfirm, onPatchRecovery, onCardChip, onCardSlotSet, onCardExecute }: Props): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist <= BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setShowScrollBtn(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setShowScrollBtn(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    // 정독용 턴(지식·가이드 전문 렌더): 우선순위 높은 내용이 맨 위에 온다. 답변 바닥을 쫓지 말고
    // 이번 질문(마지막 user 메시지)을 뷰포트 맨 위에 정렬해, 위→아래로 차근차근 읽게 한다.
    // (답변이 도착해 아래 콘텐츠가 생긴 뒤 정렬돼야 질문이 실제로 맨 위에 오므로, 답변 토큰
    //  갱신마다 재정렬한다. 이미 상단이면 scrollIntoView는 사실상 no-op.)
    if (pinQuestionTop) {
      isNearBottomRef.current = false;
      setShowScrollBtn(false);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          const node = listRef.current?.querySelector(`[data-message-id="${messages[i].id}"]`);
          node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
      return;
    }

    if (last.role === 'user') {
      isNearBottomRef.current = true;
      setShowScrollBtn(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (isStreaming) {
      setShowScrollBtn(true);
    }
  }, [messages, isStreaming, pinQuestionTop]);

  // 스트리밍 종료 시 버튼 숨김
  useEffect(() => {
    if (!isStreaming) setShowScrollBtn(false);
  }, [isStreaming]);

  // 검색 매치 재계산 트리거 — 메시지 수 + 마지막 메시지 길이(스트리밍 중 콘텐츠 증가 반영).
  const findRevision = messages.length + (messages[messages.length - 1]?.content.length ?? 0);

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll}>
      <FindBar containerRef={listRef} revision={findRevision} />
      {messages.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" opacity="0.35">
              <path fill="currentColor" d="M18.164,7.931V5.085c0.769-0.359,1.262-1.13,1.266-1.978V3.04c-0.003-1.21-0.983-2.189-2.193-2.193H17.17   c-1.21,0.003-2.189,0.983-2.193,2.193v0.067c0.004,0.849,0.497,1.619,1.266,1.978v2.852c-1.083,0.166-2.103,0.614-2.957,1.301   L5.458,3.142C5.814,1.81,5.023,0.441,3.69,0.085S0.989,0.521,0.633,1.853s0.436,2.701,1.768,3.057   c0.637,0.17,1.316,0.081,1.888-0.247l7.696,5.991c-1.419,2.14-1.38,4.931,0.096,7.032l-2.342,2.342   c-0.188-0.06-0.384-0.092-0.581-0.095c-1.123,0-2.033,0.91-2.033,2.033C7.125,23.09,8.035,24,9.158,24   c1.123,0,2.033-0.91,2.033-2.033l0,0c-0.003-0.197-0.035-0.393-0.095-0.581l2.317-2.317c2.742,2.094,6.662,1.569,8.756-1.172   s1.569-6.662-1.172-8.756c-0.83-0.634-1.806-1.05-2.838-1.209 M17.2,17.308c-1.77-0.004-3.202-1.443-3.198-3.213   c0.004-1.77,1.443-3.202,3.213-3.198c1.768,0.004,3.199,1.439,3.198,3.207c0,1.77-1.435,3.205-3.205,3.205"/>
            </svg>
          </div>
          <p className="empty-state__title">Axiom AI에게 질문하세요</p>
          <p className="empty-state__hint">코드 작성, 버그 수정, scaffold 구조 설명 등</p>
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} onConfirm={onConfirm} onPatchRecovery={onPatchRecovery} onCardChip={onCardChip} onCardSlotSet={onCardSlotSet} onCardExecute={onCardExecute} />
      ))}
      {(isWaiting || isStreaming) && (
        <div className="typing-indicator">
          {isWaiting && progressSteps && progressSteps.length > 0 && (
            <ul className="progress-steps">
              {progressSteps.map((step, i) => (
                <li key={i} className="progress-steps__item">
                  <span className="progress-steps__check" aria-hidden="true">✓</span>
                  <span className="progress-steps__label">{step}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="typing-indicator__active">
            <ThinkingIcon size={32} />
            <span className="typing-indicator__status">
              {(isWaiting && status) ? status : '생각하는 중…'}
            </span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
      {showScrollBtn && (
        <button
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          aria-label="새 메시지로 이동"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          새 메시지
        </button>
      )}
    </div>
  );
}
