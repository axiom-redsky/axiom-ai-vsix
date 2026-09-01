import React, { useState, useRef, useEffect, useCallback } from 'react';
import { matchSlashCommands } from '../slashCommands';
import { Palette, type IPaletteItem } from './Palette';
import { ModeMenu } from './ModeMenu';
import { CHAT_MODES, chatModeHint, nextChatMode, type ChatMode } from '../../../ai/ChatMode';
import type { SlashCommand } from '../slashCommands';
import type { SelectionContext, ContextUsage } from '../hooks/useChat';
import type { CardSuggestionsPayload, ContextBreakdown } from '../../../types/messages';
import { computeContextBudget, budgetPct } from '../contextBudget';

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
  /** 파일 피커를 열어 참조 파일을 첨부한다(호스트가 `@경로`를 appendText로 회신). */
  onAttach?: () => void;
  /** 호스트가 첨부한 `@경로` 토큰 — 입력창에 append한다(prefill과 달리 기존 입력 보존). */
  appendText?: string;
  onAppendConsumed?: () => void;
  selectionContext?: SelectionContext | null;
  onDismissSelection?: () => void;
  contextTotalChars?: number;
  systemPromptChars?: number;
  contextWindow: number;
  /** 출력 자리 예약(=요청 max_tokens). 막대 분모를 (contextWindow − outputReserve)로 줄인다. */
  outputReserve?: number;
  usage?: ContextUsage | null;
  breakdown?: ContextBreakdown | null;
  /** 직전 턴이 오프라인(로컬 RAG)이면 토큰 메터를 "오프라인 · 토큰 미사용"으로 표시한다. */
  offline?: boolean;
  /** offline 중에서도 "온라인 지식 가이드"(서버 온라인·LLM 미호출)면 라벨을 "로컬 지식"으로 구분한다. */
  localKnowledge?: boolean;
  /** 타이핑 중 추천(형태 B, §3.5) — 호스트가 계산해 내려준 목록. */
  suggestions?: CardSuggestionsPayload;
  /** 입력이 바뀌었을 때(디바운스 후) 추천을 요청한다. 빈 문자열이면 목록을 지운다. */
  onQueryChange?: (query: string) => void;
  /** 추천 목록에서 카드를 골랐다. */
  onPickSuggestion?: (cardId: string, query: string) => void;
  /** 현재 대화 모드(§4.2 — 알약에 항상 텍스트로 보인다). */
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** 모드 메뉴 구분선 아래 '⚙ 기본 모드 설정'. */
  onOpenModeSettings?: () => void;
}

export function InputBar({ onSend, onStop, isStreaming, prefillText, onPrefillConsumed, onAttach, appendText, onAppendConsumed, selectionContext, onDismissSelection, contextTotalChars, systemPromptChars, contextWindow, outputReserve, usage, breakdown, offline, localKnowledge, suggestions, onQueryChange, onPickSuggestion, mode, onModeChange, onOpenModeSettings }: Props): React.ReactElement {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [value, setValue] = useState('');
  const [cmdMatches, setCmdMatches] = useState<SlashCommand[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  /**
   * 추천 목록의 선택 위치. **-1로 시작한다** — 이 목록은 사용자가 부른 게 아니라 타이핑 중에
   * 저절로 뜬 것이라, Enter를 가로채면 평범한 메시지를 보내려던 사람이 엉뚱한 위저드로 끌려간다.
   * ↓ 를 눌러 목록에 들어온 뒤에야 Enter가 선택이 된다.
   */
  const [suggestIdx, setSuggestIdx] = useState(-1);
  /** Esc로 닫음 — 이번 입력에서는 다시 뜨지 않는다(전송·비움으로 리셋). */
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  /**
   * 모드 메뉴 열림 + 키보드 이동 위치. 팝오버가 떠 있어도 포커스는 입력창에 남으므로(§4.2.1)
   * 방향키·Enter·Esc는 여기 textarea 핸들러가 처리한다 — Palette와 같은 규칙이다.
   */
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modeIdx, setModeIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // 파일 첨부 — 호스트가 보낸 `@경로` 토큰을 입력창에 **append**한다(prefill과 달리 기존 입력 보존).
  useEffect(() => {
    if (!appendText) return;
    setValue((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${appendText} ` : `${appendText} `));
    onAppendConsumed?.();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [appendText, onAppendConsumed]);

  const closePalette = useCallback(() => {
    setCmdMatches([]);
    setSelectedIdx(0);
  }, []);

  const selectCommand = useCallback((syntax: string) => {
    setValue(syntax);
    closePalette();
    focusTextarea();
  }, [closePalette, focusTextarea]);

  /**
   * 지금 그릴 추천 목록. 호스트 응답은 **계산된 입력(query)** 을 달고 오므로, 지금 입력과 다르면
   * 버린다 — 디바운스된 응답이 늦게 도착해 엉뚱한 목록이 붙는 것을 구조로 막는다.
   * 슬래시 팔레트가 떠 있으면 양보한다(같은 자리에 목록 둘 = Enter 예측 불가).
   */
  const suggestItems =
    !suggestDismissed && cmdMatches.length === 0 && !isStreaming && !modeMenuOpen
      && suggestions && suggestions.query === value.trim() && suggestions.query.length > 0
      ? suggestions.items
      : [];

  const pickSuggestion = useCallback((index: number) => {
    const item = suggestItems[index];
    if (!item) return;
    onPickSuggestion?.(item.cardId, value.trim());
    setValue('');
    setSuggestIdx(-1);
    onQueryChange?.('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    focusTextarea();
  }, [suggestItems, onPickSuggestion, onQueryChange, value, focusTextarea]);

  const submit = useCallback(() => {
    if (!value.trim() || isStreaming) return;

    // 팔레트에서 선택된 명령어가 있으면 그걸 먼저 적용
    if (cmdMatches.length > 0) {
      selectCommand(cmdMatches[selectedIdx]?.syntax ?? cmdMatches[0].syntax);
      return;
    }

    onSend(value.trim());
    setValue('');
    setSuggestIdx(-1);
    setSuggestDismissed(false);
    onQueryChange?.('');
    closePalette();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    focusTextarea();
  }, [value, isStreaming, cmdMatches, selectedIdx, onSend, closePalette, selectCommand, focusTextarea, onQueryChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Tab = 메뉴를 열지 않고 다음 모드로 바로 순환(§4.5). 알약이 즉시 바뀌므로 "모르고 바뀜"이 없다.
    // 기본 동작(포커스 이동)을 반드시 막고, 한글 IME 조합 중에는 무시한다 — 이 코드베이스는 한국어
    // 입력이 기본이라 조합 중 단축키가 먹으면 입력이 깨진다.
    if (e.key === 'Tab' && e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      setModeMenuOpen(false);
      onModeChange(nextChatMode(mode));
      return;
    }

    // 모드 메뉴가 열려 있는 동안의 키 — 포커스는 입력창에 있으므로 여기서 처리한다(§4.2.1).
    if (modeMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModeIdx((i) => (i + 1) % CHAT_MODES.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModeIdx((i) => (i - 1 + CHAT_MODES.length) % CHAT_MODES.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onModeChange(CHAT_MODES[modeIdx].id);
        setModeMenuOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setModeMenuOpen(false);
        focusTextarea();
        return;
      }
    }

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

    // 추천 목록 — 슬래시 팔레트와 달리 **기본 선택이 없다**(위 suggestIdx 주석).
    if (suggestItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIdx((i) => Math.min(i + 1, suggestItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIdx((i) => Math.max(i - 1, -1)); // -1 = 목록에서 빠져나와 입력으로 복귀
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestDismissed(true);
        setSuggestIdx(-1);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && suggestIdx >= 0) {
        e.preventDefault();
        pickSuggestion(suggestIdx);
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

    // 타이핑 중 추천(형태 B) — 키 입력마다 부르지 않고 잠깐 멈췄을 때만 묻는다.
    setSuggestIdx(-1);
    if (!newValue.trim()) setSuggestDismissed(false); // 다 지우면 다시 뜰 수 있게
    if (onQueryChange) {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
      const q = newValue.trim();
      suggestTimer.current = setTimeout(() => onQueryChange(q.startsWith('/') ? '' : q), 140);
    }
  };

  // 모드 메뉴가 떠 있으면 슬래시 팔레트는 양보한다 — 같은 자리에 목록이 둘이면 Enter를 예측할 수 없다.
  const showPalette = cmdMatches.length > 0 && !modeMenuOpen;

  /** 메뉴를 열 때는 커서를 현재 모드 행에 둔다(바로 ↑↓로 옮길 수 있게). */
  const setModeMenuOpenAt = useCallback((next: boolean) => {
    setModeMenuOpen(next);
    if (next) setModeIdx(Math.max(0, CHAT_MODES.findIndex((m) => m.id === mode)));
  }, [mode]);

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
        <Palette
          ariaLabel="명령어 목록"
          items={cmdMatches.map((cmd): IPaletteItem => ({
            key: cmd.syntax, primary: cmd.syntax, secondary: cmd.description,
          }))}
          selectedIdx={selectedIdx}
          onPick={(i) => selectCommand(cmdMatches[i].syntax)}
        />
      )}
      {suggestItems.length > 0 && (
        <Palette
          ariaLabel="추천 작업 목록"
          items={suggestItems.map((s): IPaletteItem => ({
            key: s.cardId,
            icon: s.icon,
            primary: s.title,
            // 왜 떴는지를 그대로 — 근거 없이 뜬 것처럼 보이면 목록을 못 믿는다.
            secondary: s.matchedTriggers.length > 0 ? s.matchedTriggers.join(' · ') : undefined,
          }))}
          selectedIdx={suggestIdx}
          onPick={pickSuggestion}
          footer={suggestIdx >= 0 ? '↵ 이 작업으로 · Esc 닫기' : '↓ 로 작업 선택 · Enter = 그냥 메시지로 보내기'}
        />
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
          {!isStreaming && onAttach && (
            <button
              onClick={onAttach}
              className="input-bar__btn input-bar__btn--attach"
              title="참조 파일 첨부 (API 스펙 등 — 타입·스키마 근거)"
              aria-label="참조 파일 첨부"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10.5 5.5L6 10a1.5 1.5 0 002.12 2.12l4.6-4.6a3 3 0 00-4.24-4.24l-4.6 4.6a4.5 4.5 0 006.36 6.36L14 10"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {/* 알약은 전송 버튼 **바로 왼쪽**(§4.2 규칙 1) — 보내기 직전에 모드를 확인하게 되는 자리. */}
          <ModeMenu
            mode={mode}
            open={modeMenuOpen}
            activeIdx={modeIdx}
            onOpenChange={setModeMenuOpenAt}
            onChange={onModeChange}
            onOpenSettings={onOpenModeSettings}
            disabled={isStreaming}
          />
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
        {/* general이면 상태를 두 곳에서 말한다 — 알약 + 이 한 줄(§4.2). auto는 종전 안내 그대로. */}
        <p className={'input-bar__hint' + (chatModeHint(mode) ? ' input-bar__hint--mode' : '')}>
          {chatModeHint(mode) ?? 'Enter 전송 · Shift+Enter 줄바꿈 · /명령어'}
        </p>
        {contextTotalChars !== undefined && offline && (
          // 오프라인/로컬 지식 턴 — 로컬 문서로 답하므로 LLM 컨텍스트 윈도우를 소비하지 않는다.
          // 누적 추정 토큰을 보여주면 실재하지 않는 예산처럼 오해를 줘서, 막대를 비활성 상태로
          // 두고 라벨만 표시한다. 온라인 복귀 시 다음 contextInfo/usage가 라이브 메터를 복원한다.
          // localKnowledge=true면 서버는 온라인(연결 정상)이므로 "오프라인"이 아니라 "로컬 지식"으로 표기.
          <div
            className="input-bar__context-meter input-bar__context-meter--offline"
            title={localKnowledge
              ? '로컬 지식 응답 — 저장된 문서를 그대로 표시하며 LLM 토큰을 사용하지 않습니다. (서버 연결은 정상)'
              : '오프라인 모드 — 로컬 지식으로 답변하며 LLM 토큰을 사용하지 않습니다.'}
          >
            <div className="input-bar__context-bar">
              <div className="input-bar__context-fill" data-level="offline" style={{ width: '100%' }} />
            </div>
            <span className="input-bar__context-label">
              {localKnowledge ? '📚 로컬 지식 · 토큰 미사용' : '⚠️ 오프라인 · 토큰 미사용'}
            </span>
          </div>
        )}
        {contextTotalChars !== undefined && !offline && (() => {
          // 서버 보고 usage가 있으면 실측치 우선, 아니면 문자 수 추정
          const measuredTokens = usage?.promptTokens ?? usage?.totalTokens;
          const estimatedTokens = measuredTokens ?? (
            Math.round((systemPromptChars ?? 0) / 3) + Math.round(contextTotalChars / 3)
          );
          // 분모 = 응답 자리(max_tokens)를 남긴 실사용 가능 입력 예산. 100% = "모델이 답할 자리 없음".
          // contextWindow(=num_ctx)·outputReserve(=max_tokens) 둘 다 배포 설정에서 오므로
          // 다른 서버/모델을 붙이면 이 분모가 그 배포 값으로 자동으로 맞춰진다.
          const budget = computeContextBudget(contextWindow, usage?.outputReserve ?? outputReserve);
          const pct = budgetPct(estimatedTokens, budget);
          const level = getContextLevel(pct);
          const remaining = Math.max(0, budget.usableBudget - estimatedTokens);
          const source = measuredTokens !== undefined ? '실측' : '추정';
          const hasBreakdown = breakdown && (
            breakdown.rulesChars + breakdown.fileChars + breakdown.ragChars +
            breakdown.domainChars
          ) > 0;
          return (
            <div className="input-bar__context-meter">
              <button
                type="button"
                className="input-bar__context-toggle"
                onClick={() => setBreakdownOpen((v) => !v)}
                title={`${source} 입력 ${estimatedTokens.toLocaleString()} / 사용가능 ${budget.usableBudget.toLocaleString()} 토큰` +
                  ` (모델 창 ${budget.contextWindow.toLocaleString()} − 응답 예약 ${budget.reserve.toLocaleString()})` +
                  ` — 막대가 꽉 차면 모델이 답할 자리가 없어 초기화가 필요합니다.${hasBreakdown ? ' 클릭하여 상세 보기.' : ''}`}
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
