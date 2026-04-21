import React, { useState, useRef } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: Props): React.ReactElement {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || disabled) return;
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
        disabled={disabled}
        rows={1}
        className="input-bar__textarea"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="input-bar__button"
      >
        {disabled ? '…' : '전송'}
      </button>
    </div>
  );
}
