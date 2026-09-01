/**
 * ModeMenu — 입력창 우하단 알약 + 위로 뜨는 모드 메뉴 한 벌.
 * 사양: docs/chat-mode-plan.md §4.2(캡처 대응 규칙 1~9) · §4.5(키보드·접근성).
 *
 * **Palette 재사용이 아니다**(§4.2.1): 슬래시/추천 팔레트는 한 줄 행이고 입력창 위 고정 자리인데,
 * 모드 메뉴는 ①2줄 스택 행 ②✓ 표시 ③알약 앵커 팝오버라 계약이 다르다.
 * 다만 **키보드·포커스 규칙은 Palette에서 그대로 베낀다** — onMouseDown에서 preventDefault()로
 * 입력 포커스를 유지하고, role="listbox"/"option"/aria-selected를 쓴다. 같은 화면의 두 목록이
 * 다르게 반응하면 안 된다.
 *
 * 방향키·Enter·Esc는 이 컴포넌트가 아니라 **InputBar의 textarea 키 핸들러**가 처리한다
 * (포커스가 입력창에 남아 있으므로). 여기서는 activeIdx를 받아 강조만 그린다.
 */

import React, { useEffect, useRef } from 'react';
import { CHAT_MODES, chatModeView, type ChatMode } from '../../../ai/ChatMode';

interface Props {
  mode: ChatMode;
  open: boolean;
  /** 키보드 이동 위치 — InputBar가 소유한다. 마우스만 쓸 때는 현재 모드 위치. */
  activeIdx: number;
  onOpenChange: (open: boolean) => void;
  onChange: (mode: ChatMode) => void;
  /** 구분선 아래 한 줄 — 설정 패널 바로가기(§4.2 규칙 9). 여기에 새 기능을 발명하지 말 것. */
  onOpenSettings?: () => void;
  disabled?: boolean;
}

export function ModeMenu({ mode, open, activeIdx, onOpenChange, onChange, onOpenSettings, disabled }: Props): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const view = chatModeView(mode);

  // 바깥 클릭이면 닫는다(§4.5). 입력창 클릭도 '바깥'이라 자연스럽게 닫힌다.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, onOpenChange]);

  return (
    <div className="mode-menu" ref={rootRef}>
      {open && (
        <div className="mode-menu__popover" role="listbox" aria-label="대화 모드">
          <div className="mode-menu__header">
            <span className="mode-menu__header-title">모드</span>
            {/* 단축키를 메뉴가 직접 가르친다 — 별도 도움말이 필요 없다(§4.2 규칙 4). */}
            <span className="mode-menu__keys">
              <kbd>⇧</kbd>
              <span className="mode-menu__keys-plus">+</span>
              <kbd>tab</kbd>
              <span className="mode-menu__keys-label">전환</span>
            </span>
          </div>
          {CHAT_MODES.map((m, i) => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={selected}
                className={
                  'mode-menu__row' +
                  (i === activeIdx ? ' mode-menu__row--active' : '') +
                  (selected ? ' mode-menu__row--selected' : '')
                }
                onMouseDown={(e) => {
                  e.preventDefault(); // blur 방지 — 입력 포커스를 유지한 채 고른다
                  onChange(m.id);
                  onOpenChange(false); // 고르면 즉시 적용 + 닫힘(확인 버튼 없음, §4.2 규칙 8)
                }}
              >
                <span className="mode-menu__row-icon" aria-hidden="true">{m.icon}</span>
                <span className="mode-menu__row-text">
                  <span className="mode-menu__row-title">{m.label}</span>
                  <span className="mode-menu__row-summary">{m.summary}</span>
                </span>
                {/* 선택 상태를 배경만으로 표시하지 않는다 — 테마에 따라 안 보인다(§4.2 규칙 6). */}
                <span className="mode-menu__row-check" aria-hidden="true">{selected ? '✓' : ''}</span>
              </button>
            );
          })}
          <div className="mode-menu__divider" />
          <button
            className="mode-menu__settings"
            onMouseDown={(e) => {
              e.preventDefault();
              onOpenChange(false);
              onOpenSettings?.();
            }}
          >
            <span aria-hidden="true">⚙</span> 기본 모드 설정
          </button>
        </div>
      )}
      <button
        type="button"
        className={'mode-menu__pill' + (open ? ' mode-menu__pill--open' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`대화 모드: ${view.label}`}
        title={`${view.label} — ${view.summary} (Shift+Tab으로 전환)`}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault(); // 입력 포커스 유지 — 메뉴가 열려도 타이핑이 계속된다
          onOpenChange(!open);
        }}
      >
        <span className="mode-menu__pill-icon" aria-hidden="true">{view.icon}</span>
        {/* 아이콘만 금지 — 현재 상태를 읽을 수 있어야 한다(§4.2 규칙 2). */}
        <span className="mode-menu__pill-label">{view.label}</span>
        <span className="mode-menu__pill-caret" aria-hidden="true">▾</span>
      </button>
    </div>
  );
}
