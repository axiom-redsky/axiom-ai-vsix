/**
 * Palette — 입력창 **위**에 뜨는 목록의 공용 표시 컴포넌트.
 *
 * 두 곳이 같은 자리를 쓴다: ① `/` 슬래시 명령 팔레트 ② 타이핑 중 행동 카드 추천(형태 B, §3.5).
 * 계획서가 "표시 컴포넌트를 공유할 것"이라고 못 박은 이유는 모양보다 **동작 예측 가능성**이다 —
 * 같은 자리에 다른 규칙의 목록이 두 벌 있으면 사용자는 Enter가 무엇을 할지 알 수 없다.
 * (그래서 InputBar는 둘을 절대 동시에 띄우지 않는다.)
 */

import React from 'react';

export interface IPaletteItem {
  key: string;
  /** 왼쪽 강조 텍스트 — 명령 구문 또는 카드 제목. */
  primary: string;
  /** 오른쪽 흐린 텍스트 — 설명 또는 매칭 근거. */
  secondary?: string;
  /** 제목 앞 아이콘(카드 이모지). */
  icon?: string;
}

interface Props {
  items: IPaletteItem[];
  /** 선택 위치. **-1이면 아무것도 선택하지 않음** — Enter가 목록이 아니라 전송으로 간다. */
  selectedIdx: number;
  onPick: (index: number) => void;
  ariaLabel: string;
  /** 목록 아래 안내 한 줄(예: "Enter = 그냥 보내기"). */
  footer?: string;
}

export function Palette({ items, selectedIdx, onPick, ariaLabel, footer }: Props): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div className="slash-palette" role="listbox" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <button
          key={item.key}
          role="option"
          aria-selected={i === selectedIdx}
          className={`slash-palette__item${i === selectedIdx ? ' slash-palette__item--active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault(); // blur 방지 — 입력 포커스를 유지한 채 고른다
            onPick(i);
          }}
        >
          {item.icon && <span className="slash-palette__icon">{item.icon}</span>}
          <span className="slash-palette__syntax">{item.primary}</span>
          {item.secondary && <span className="slash-palette__desc">{item.secondary}</span>}
        </button>
      ))}
      {footer && <div className="slash-palette__footer">{footer}</div>}
    </div>
  );
}
