import React, { useState, useRef } from 'react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputBar({ onSend, onStop, isStreaming }: Props): React.ReactElement {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="input-bar">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="질문 입력… (Enter: 전송, Shift+Enter: 줄바꿈)"
        disabled={isStreaming}
        rows={1}
        className="input-bar__textarea"
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className="input-bar__button input-bar__button--stop"
          title="응답 중단"
        >
          ■ 중단
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="input-bar__button"
        >
          전송
        </button>
      )}
    </div>
  );
}
