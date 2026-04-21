import React from 'react';

interface Props {
  status: string;
  onClear: () => void;
}

export function StatusBar({ status, onClear }: Props): React.ReactElement {
  return (
    <div className="status-bar">
      <span className="status-bar__text">{status}</span>
      <button className="status-bar__clear" onClick={onClear} title="대화 초기화">
        초기화
      </button>
    </div>
  );
}
