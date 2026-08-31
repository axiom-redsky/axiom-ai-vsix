import React, { useState } from 'react';
import type { ActionCardsPayload, ActionCardView } from '../../../types/messages';

/**
 * 오프라인 행동 카드 — "메뉴"가 아니라 "계획 카드"(§3.6 원칙 3가지):
 *  1. 행동 이름이 아니라 결과(파일 diff·골격)를 보여준다.
 *  2. 묻지 않고 프리필로 채워서 보여준다 — 슬롯은 인라인 칩, 틀린 칩만 고친다.
 *  3. 근거(매칭 트리거)를 보여준다.
 * 확신 높음(mode=plan) → 계획 카드 1장 + [다른 작업 ▾], 애매(mode=list) → 컴팩트 리스트.
 */

interface Props {
  payload: ActionCardsPayload;
  /** 실행 버튼을 누른 카드 id — 있으면 전체 카드 비활성 + "실행됨" 표시. */
  executedCardId?: string;
  onChip: (requestId: string, cardId: string, slotName: string) => void;
  onExecute: (requestId: string, cardId: string) => void;
}

function PlanCard({
  card, requestId, executed, disabled, onChip, onExecute,
}: {
  card: ActionCardView;
  requestId: string;
  executed: boolean;
  disabled: boolean;
  onChip: Props['onChip'];
  onExecute: Props['onExecute'];
}): React.ReactElement {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="action-card">
      <div className="action-card__header">
        <span className="action-card__icon">{card.icon}</span>
        <span className="action-card__title">{card.title}</span>
        {card.matchedTriggers.length > 0 && (
          <span className="action-card__evidence" title="이 카드가 추천된 근거(매칭된 트리거)">
            {card.matchedTriggers.map((t) => `"${t}"`).join(' · ')}
          </span>
        )}
      </div>

      {card.slots.length > 0 && (
        <div className="action-card__chips">
          {card.slots.map((s) => (
            <button
              key={s.name}
              className={`action-chip${s.value ? '' : ' action-chip--empty'}`}
              disabled={disabled}
              title={`${s.label} 변경`}
              onClick={() => onChip(requestId, card.cardId, s.name)}
            >
              <span className="action-chip__label">{s.label}</span>
              <span className="action-chip__value">{s.value ?? '선택'}</span>
              <span className="action-chip__caret" aria-hidden>▾</span>
            </button>
          ))}
        </div>
      )}

      {card.outputs.length > 0 && (
        <div className="action-card__outputs">
          <div className="action-card__outputs-title">만들어질 것:</div>
          {card.outputs.map((o, i) => (
            <div key={i} className={`action-output action-output--${o.kind}`}>
              <span className="action-output__marker">{o.kind === 'create' ? '+' : '±'}</span>
              <span className="action-output__path">{o.path}</span>
              {o.note && <span className="action-output__note">({o.note})</span>}
            </div>
          ))}
        </div>
      )}

      {card.description && <p className="action-card__desc">{card.description}</p>}

      {card.skeleton && (
        <div className="action-card__code">
          <button className="action-card__code-toggle" onClick={() => setShowCode((v) => !v)}>
            {showCode ? '▾' : '▸'} 코드 미리보기
          </button>
          {showCode && <pre className="action-card__code-pre">{card.skeleton}</pre>}
        </div>
      )}

      <div className="action-card__actions">
        {executed ? (
          <span className="action-card__executed">✓ 실행됨</span>
        ) : (
          <button
            className="action-card__execute"
            disabled={disabled}
            onClick={() => onExecute(requestId, card.cardId)}
          >
            {card.executeLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function ActionCardsView({ payload, executedCardId, onChip, onExecute }: Props): React.ReactElement {
  // plan 모드면 top1이 펼쳐진 채 시작, list 모드면 전부 접힌 리스트로 시작.
  const [expandedId, setExpandedId] = useState<string | null>(
    payload.mode === 'plan' ? payload.cards[0]?.cardId ?? null : null,
  );
  const [showOthers, setShowOthers] = useState(false);
  const anyExecuted = !!executedCardId;

  const expanded = payload.cards.find((c) => c.cardId === expandedId) ?? null;
  const others = payload.cards.filter((c) => c.cardId !== expandedId);

  return (
    <div className="action-cards">
      <div className="action-cards__banner">⚡ 오프라인 모드 — 이렇게 도와드릴 수 있어요</div>

      {expanded && (
        <PlanCard
          card={expanded}
          requestId={payload.requestId}
          executed={executedCardId === expanded.cardId}
          disabled={anyExecuted}
          onChip={onChip}
          onExecute={onExecute}
        />
      )}

      {/* 컴팩트 리스트 — list 모드의 본문이자, plan 모드의 [다른 작업 ▾] 내용물 */}
      {others.length > 0 && (payload.mode === 'list' || !expanded ? (
        <div className="action-cards__list">
          {others.map((c) => (
            <button
              key={c.cardId}
              className="action-cards__row"
              disabled={anyExecuted}
              onClick={() => setExpandedId(c.cardId)}
            >
              <span className="action-cards__row-icon">{c.icon}</span>
              <span className="action-cards__row-title">{c.title}</span>
              <span className="action-cards__row-open">열기</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="action-cards__others">
          <button
            className="action-cards__others-toggle"
            disabled={anyExecuted}
            onClick={() => setShowOthers((v) => !v)}
          >
            다른 작업 {showOthers ? '▴' : '▾'}
          </button>
          {showOthers && (
            <div className="action-cards__list">
              {others.map((c) => (
                <button
                  key={c.cardId}
                  className="action-cards__row"
                  disabled={anyExecuted}
                  onClick={() => { setExpandedId(c.cardId); setShowOthers(false); }}
                >
                  <span className="action-cards__row-icon">{c.icon}</span>
                  <span className="action-cards__row-title">{c.title}</span>
                  <span className="action-cards__row-open">열기</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
