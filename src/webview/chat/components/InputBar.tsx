import React, { useState, useRef, useEffect, useCallback } from 'react';
import { matchSlashCommands } from '../slashCommands';
import type { SlashCommand } from '../slashCommands';
import type { SelectionContext, ContextUsage } from '../hooks/useChat';
import type { ContextBreakdown } from '../../../types/messages';

function getContextLevel(pct: number): 'ok' | 'warn' | 'danger' {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warn';
  return 'ok';
}

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  prefillText?: string;
  onPrefillConsumed?: () => void;
  selectionContext?: SelectionContext | null;
  onDismissSelection?: () => void;
  contextTotalChars?: number;
  systemPromptChars?: number;
  contextWindow: number;
  usage?: ContextUsage | null;
  breakdown?: ContextBreakdown | null;
}

export function InputBar({ onSend, onStop, isStreaming, prefillText, onPrefillConsumed, selectionContext, onDismissSelection, contextTotalChars, systemPromptChars, contextWindow, usage, breakdown }: Props): React.ReactElement {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [value, setValue] = useState('');
  const [cmdMatches, setCmdMatches] = useState<SlashCommand[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el || el.disabled) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  useEffect(() => {
    if (!prefillText) return;
    setValue(prefillText);
    onPrefillConsumed?.();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [prefillText, onPrefillConsumed]);

  useEffect(() => {
    if (!isStreaming) {
      focusTextarea();
    }
  }, [isStreaming, focusTextarea]);

  const closePalette = useCallback(() => {
    setCmdMatches([]);
    setSelectedIdx(0);
  }, []);

  const selectCommand = useCallback((syntax: string) => {
    setValue(syntax);
    closePalette();
    focusTextarea();
  }, [closePalette, focusTextarea]);

  const submit = useCallback(() => {
    if (!value.trim() || isStreaming) return;

    // 팔레트에서 선택된 명령어가 있으면 그걸 먼저 적용
    if (cmdMatches.length > 0) {
      selectCommand(cmdMatches[selectedIdx]?.syntax ?? cmdMatches[0].syntax);
      return;
    }

    onSend(value.trim());
    setValue('');
    closePalette();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    focusTextarea();
  }, [value, isStreaming, cmdMatches, selectedIdx, onSend, closePalette, selectCommand, focusTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (cmdMatches.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + cmdMatches.length) % cmdMatches.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % cmdMatches.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        selectCommand(cmdMatches[selectedIdx]?.syntax ?? cmdMatches[0].syntax);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;

    const matches = matchSlashCommands(newValue);
    setCmdMatches(matches);
    setSelectedIdx(0);
  };

  const showPalette = cmdMatches.length > 0;

  const lineLabel = selectionContext
    ? selectionContext.startLine === selectionContext.endLine
      ? `${selectionContext.filePath}:${selectionContext.startLine}`
      : `${selectionContext.filePath}:${selectionContext.startLine}-${selectionContext.endLine}`
    : null;

  return (
    <div className="input-bar">
      {selectionContext && lineLabel && (
        <div className="input-bar__selection-badge">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 4h5M3.5 6h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
          <span className="input-bar__selection-label" title={selectionContext.selectedText}>
            {lineLabel}
          </span>
          <button
            className="input-bar__selection-dismiss"
            onClick={onDismissSelection}
            title="선택 참조 해제"
            aria-label="선택 참조 해제"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      {showPalette && (
        <div className="slash-palette" role="listbox" aria-label="명령어 목록">
          {cmdMatches.map((cmd, i) => (
            <button
              key={cmd.syntax}
              role="option"
              aria-selected={i === selectedIdx}
              className={`slash-palette__item${i === selectedIdx ? ' slash-palette__item--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // blur 방지
                selectCommand(cmd.syntax);
              }}
            >
              <span className="slash-palette__syntax">{cmd.syntax}</span>
              <span className="slash-palette__desc">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="input-bar__inner">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요… (Enter: 전송 / Shift+Enter: 줄바꿈)"
          disabled={isStreaming}
          rows={1}
          className="input-bar__textarea"
        />
        <div className="input-bar__actions">
          {isStreaming ? (
            <button
              onClick={onStop}
              className="input-bar__btn input-bar__btn--stop"
              title="응답 중단"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="1" />
              </svg>
              중단
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="input-bar__btn input-bar__btn--send"
              title="전송 (Enter)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M12 7L2 12L4.5 7L2 2L12 7Z"
                  fill="currentColor"
                />
              </svg>
              전송
            </button>
          )}
        </div>
      </div>
      <div className="input-bar__footer">
        <p className="input-bar__hint">Enter 전송 · Shift+Enter 줄바꿈 · /명령어</p>
        {contextTotalChars !== undefined && (() => {
          // 서버 보고 usage가 있으면 실측치 우선, 아니면 문자 수 추정
          const measuredTokens = usage?.promptTokens ?? usage?.totalTokens;
          const estimatedTokens = measuredTokens ?? (
            Math.round((systemPromptChars ?? 0) / 3) + Math.round(contextTotalChars / 3)
          );
          const pct = Math.min(100, Math.round((estimatedTokens / contextWindow) * 100));
          const level = getContextLevel(pct);
          const remaining = Math.max(0, contextWindow - estimatedTokens);
          const source = measuredTokens !== undefined ? '실측' : '추정';
          const hasBreakdown = breakdown && (
            breakdown.rulesChars + breakdown.fileChars + breakdown.ragChars +
            breakdown.sddChars + breakdown.domainChars
          ) > 0;
          return (
            <div className="input-bar__context-meter">
              <button
                type="button"
                className="input-bar__context-toggle"
                onClick={() => setBreakdownOpen((v) => !v)}
                title={`${source} ${estimatedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} 토큰 사용 중 — 클릭하여 상세 보기`}
                disabled={!hasBreakdown}
              >
                <div className="input-bar__context-bar">
                  <div
                    className="input-bar__context-fill"
                    data-level={level}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="input-bar__context-label">
                  {pct}% · 잔여 ~{remaining >= 1000 ? `${Math.round(remaining / 1000)}K` : remaining} 토큰
                  {hasBreakdown && (
                    <span className="input-bar__context-chevron" aria-hidden="true">
                      {breakdownOpen ? ' ▾' : ' ▸'}
                    </span>
                  )}
                </span>
              </button>
              {breakdownOpen && hasBreakdown && breakdown && (
                <ContextBreakdownPanel breakdown={breakdown} />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** 시스템 프롬프트 구성 요소별 비중을 막대로 표시한다. */
function ContextBreakdownPanel({ breakdown }: { breakdown: ContextBreakdown }): React.ReactElement {
  const rows: Array<{ label: string; chars: number; color: string }> = [
    { label: '규칙·가이드', chars: breakdown.rulesChars, color: 'var(--vscode-charts-blue, #4FC1FF)' },
    { label: '현재 파일', chars: breakdown.fileChars, color: 'var(--vscode-charts-green, #89D185)' },
    { label: 'RAG 문서', chars: breakdown.ragChars, color: 'var(--vscode-charts-orange, #E8B568)' },
    { label: 'SDD 스펙', chars: breakdown.sddChars, color: 'var(--vscode-charts-purple, #B180D7)' },
    { label: '도메인 컨텍스트', chars: breakdown.domainChars, color: 'var(--vscode-charts-yellow, #DDB100)' },
  ];
  const total = rows.reduce((sum, r) => sum + r.chars, 0);
  if (total === 0) {
    return (
      <div className="input-bar__context-breakdown" role="region" aria-label="컨텍스트 구성">
        <p style={{ opacity: 0.7, margin: 0, fontSize: '11px' }}>아직 컨텍스트가 구성되지 않았습니다.</p>
      </div>
    );
  }

  return (
    <div className="input-bar__context-breakdown" role="region" aria-label="컨텍스트 구성">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.chars / total) * 100) : 0;
        if (row.chars === 0) return null;
        return (
          <div key={row.label} className="input-bar__breakdown-row">
            <span className="input-bar__breakdown-label">{row.label}</span>
            <div className="input-bar__breakdown-bar">
              <div
                className="input-bar__breakdown-fill"
                style={{ width: `${pct}%`, background: row.color }}
              />
            </div>
            <span className="input-bar__breakdown-value">
              {row.chars.toLocaleString()}자 ({pct}%)
            </span>
          </div>
        );
      })}
      <p className="input-bar__breakdown-hint">
        💡 '현재 파일'이 크면 함수 단위 슬라이싱이, 'RAG 문서'가 크면 검색 결과가 차지하는 비중입니다.
      </p>
    </div>
  );
}
