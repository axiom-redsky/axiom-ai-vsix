import React, { useState, useEffect, useMemo } from 'react';
import type { Message, ContextUsage } from '../hooks/useChat';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  onClear: () => void;
  systemPromptChars?: number;
  contextWindow: number;
  usage?: ContextUsage | null;
}

type BannerLevel = 'soft' | 'strong' | null;

function getBannerLevel(
  systemPromptChars: number,
  totalChars: number,
  contextWindow: number,
  usage?: ContextUsage | null,
): BannerLevel {
  // 서버가 usage를 보고하면 실측치 우선, 아니면 문자 수 추정 (1토큰 ≈ 3자)
  const measuredTokens = usage?.promptTokens ?? usage?.totalTokens;
  const estimatedTokens = measuredTokens ?? (Math.round(systemPromptChars / 3) + Math.round(totalChars / 3));
  const pct = Math.round((estimatedTokens / contextWindow) * 100);
  if (pct >= 90) return 'strong';
  if (pct >= 70) return 'soft';
  return null;
}

export function ClearWarningBanner({ messages, isStreaming, onClear, systemPromptChars = 0, contextWindow, usage }: Props): React.ReactElement | null {
  const [dismissedLevel, setDismissedLevel] = useState<BannerLevel>(null);

  const totalChars = useMemo(
    () => messages.reduce((sum, m) => sum + m.content.length, 0),
    [messages],
  );

  const level = getBannerLevel(systemPromptChars, totalChars, contextWindow, usage);

  useEffect(() => {
    if (messages.length === 0) setDismissedLevel(null);
  }, [messages.length]);

  if (!level || level === dismissedLevel) return null;

  const isSoft = level === 'soft';

  return (
    <div className={`clear-warning-banner clear-warning-banner--${level}`} role="alert">
      <span className="clear-warning-banner__icon">
        {isSoft ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5L12.5 11H1.5L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M7 5.5v3M7 10v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="clear-warning-banner__text">
        {isSoft
          ? '대화가 길어졌습니다. 초기화하면 AI 응답이 빨라집니다.'
          : '대화가 매우 길어져 응답 품질이 저하될 수 있습니다. 초기화를 권장합니다.'}
      </span>
      <button
        className="clear-warning-banner__clear-btn"
        onClick={onClear}
        disabled={isStreaming}
        title="대화 초기화"
      >
        초기화
      </button>
      <button
        className="clear-warning-banner__dismiss-btn"
        onClick={() => setDismissedLevel(level)}
        aria-label="경고 닫기"
        title="닫기"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
