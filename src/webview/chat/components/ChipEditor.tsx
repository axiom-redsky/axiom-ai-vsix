import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionCardSlotView } from '../../../types/messages';

/**
 * 칩 인라인 편집기 — 카드 안에서 슬롯 값을 바로 고른다(창 전환 없음).
 *
 * 계획서 §3.6의 "위저드 = 순차 질문이 아니라 칩 편집기"를 문자 그대로 구현한 조각.
 * VSCode QuickPick은 창 중앙에 떠 카드에서 시선이 멀어지므로, 후보가 적은 슬롯은 여기서 처리한다
 * (후보가 많아 검색이 필요하면 호스트가 `inline: false`로 내려보내 QuickPick에 위임).
 *
 * 세 가지 형태를 하나로 다룬다:
 *  - 후보만(enum)         → 목록 선택 전용
 *  - 후보 + 자유 입력(도메인) → 목록 + "직접 입력" 행
 *  - 자유 입력만(이름·엔드포인트) → 입력 칸 + 형식 검증
 *
 * 값 확정은 부모가 호스트로 보내고, 호스트가 검증 후 슬롯 상태를 되돌려준다
 * (진실의 원천 = 호스트. 여기서의 검증은 즉시 피드백용 사전 차단일 뿐이다).
 */

interface Props {
  slot: ActionCardSlotView;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function ChipEditor({ slot, onCommit, onCancel }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = slot.options ?? [];
  const hasOptions = options.length > 0;
  const allowCustom = !!slot.allowCustom;

  // 값이 사람 말이 아닌 후보(삽입 위치 key 등)는 라벨로 보여주고 **라벨로도 검색**된다.
  const labelOf = (opt: string): string => slot.optionLabels?.[opt] ?? opt;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q) || labelOf(o).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, slot.optionLabels]);

  // 자유 입력 값이 형식 규칙을 만족하는지(입력 중 즉시 피드백).
  const customValue = query.trim();
  const patternOk = useMemo(() => {
    if (!customValue) return false;
    if (!slot.pattern) return true;
    try {
      return new RegExp(slot.pattern).test(customValue);
    } catch {
      return true; // 규칙이 깨졌으면 막지 않는다(호스트가 최종 판단)
    }
  }, [customValue, slot.pattern]);

  // 후보에 없는 값을 직접 입력으로 확정할 수 있는 상황인지.
  const canCommitCustom =
    allowCustom && !!customValue && patternOk && !filtered.some((o) => o === customValue);

  // 키보드 이동 대상: 후보 행들 + (있으면) 직접 입력 행 하나.
  const rowCount = filtered.length + (canCommitCustom ? 1 : 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 바깥 클릭 → 닫기. mousedown으로 잡아 클릭이 다른 요소에 먹히기 전에 처리한다.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  const commitAt = (index: number) => {
    if (index < filtered.length) {
      onCommit(filtered[index]);
      return;
    }
    if (canCommitCustom) onCommit(customValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowCount > 0) commitAt(activeIndex);
      return;
    }
    if (e.key === 'ArrowDown' && rowCount > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rowCount);
      return;
    }
    if (e.key === 'ArrowUp' && rowCount > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + rowCount) % rowCount);
    }
  };

  const showHint = !!slot.patternHint && !!customValue && !patternOk;

  return (
    <div className="chip-editor" ref={rootRef}>
      <input
        ref={inputRef}
        className="chip-editor__input"
        value={query}
        placeholder={hasOptions ? `${slot.label} 검색·입력` : (slot.placeholder ?? slot.label)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
      {showHint && <div className="chip-editor__hint">{slot.patternHint}</div>}
      {rowCount > 0 && (
        <ul className="chip-editor__list" role="listbox">
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === activeIndex}
              className={`chip-editor__row${i === activeIndex ? ' chip-editor__row--active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => onCommit(opt)}
            >
              {labelOf(opt)}
            </li>
          ))}
          {canCommitCustom && (
            <li
              role="option"
              aria-selected={activeIndex === filtered.length}
              className={`chip-editor__row chip-editor__row--custom${activeIndex === filtered.length ? ' chip-editor__row--active' : ''}`}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() => onCommit(customValue)}
            >
              <span className="chip-editor__custom-mark">+</span> 직접 입력: <strong>{customValue}</strong>
            </li>
          )}
        </ul>
      )}
      {rowCount === 0 && hasOptions && (
        <div className="chip-editor__empty">일치하는 항목 없음</div>
      )}
    </div>
  );
}
