import React, { useState, useRef, useEffect, useCallback } from 'react';
import { matchSlashCommands } from '../slashCommands';
import type { SlashCommand } from '../slashCommands';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  prefillText?: string;
  onPrefillConsumed?: () => void;
}

export function InputBar({ onSend, onStop, isStreaming, prefillText, onPrefillConsumed }: Props): React.ReactElement {
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

  return (
    <div className="input-bar">
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
      <p className="input-bar__hint">Enter 전송 · Shift+Enter 줄바꿈 · /명령어</p>
    </div>
  );
}
