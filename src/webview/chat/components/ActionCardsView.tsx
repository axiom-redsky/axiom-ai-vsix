import React, { useState } from 'react';
import { ENVELOPE_CHOICE_KEY, RECIPE_ANCHOR_CHOICE_KEY, TARGET_FILE_CHOICE_KEY } from '../../../types/messages';
import type {
  ActionCardBindingRowView, ActionCardSlotView, ActionCardsPayload, ActionCardView,
} from '../../../types/messages';
import { ChipEditor } from './ChipEditor';

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
  /** 인라인 편집이 불가한 슬롯(후보 다수) — 호스트 QuickPick으로 위임. */
  onChip: (requestId: string, cardId: string, slotName: string) => void;
  /** 카드 안에서 고른 값 — 호스트가 검증 후 슬롯 상태를 되돌려준다. */
  onSlotSet: (requestId: string, cardId: string, slotName: string, value: string) => void;
  /** 매핑 테이블의 애매한 행에서 고른 API 필드(또는 "(컬럼 제거)"). */
  onBindingChoice: (requestId: string, cardId: string, field: string, value: string) => void;
  onExecute: (requestId: string, cardId: string) => void;
}

/** 매핑 방식 뱃지 — "그대로 두면 되는 행"과 "손대는 행"을 한눈에 구분한다. */
const HOW_BADGE: Record<ActionCardBindingRowView['how'], { text: string; cls: string } | null> = {
  exact: { text: '그대로', cls: 'exact' },
  fuzzy: { text: '이름 교체', cls: 'fuzzy' },
  choose: null,
  static: { text: '대상 아님', cls: 'static' },
};

/**
 * 매핑 테이블 = 카드 본문(§3.6 "API 바인딩 = 매핑 테이블 자체가 카드").
 * 결정론이 확신한 행은 채워진 채로, 애매한 행만 인라인 드롭다운(칩 편집기 재사용)으로 남는다.
 */
function BindingTable({
  card, requestId, disabled, onBindingChoice, onSlotSet,
}: {
  card: ActionCardView;
  requestId: string;
  disabled: boolean;
  onBindingChoice: Props['onBindingChoice'];
  onSlotSet: Props['onSlotSet'];
}): React.ReactElement | null {
  // 지금 열려 있는 행 편집기(한 번에 하나) — 키는 그 행이 읽는 필드명.
  const [editingField, setEditingField] = useState<string | null>(null);
  const binding = card.binding;
  if (!binding) return null;

  // 막혔을 때 대신 고를 수 있는 경로 — 막힘을 절벽이 아니라 계단으로(§ 카탈로그 안전망 원칙).
  const suggestions = binding.suggestions.length > 0 && binding.suggestionSlot ? (
    <div className="action-binding__suggest">
      <span className="action-binding__suggest-label">스펙에서 바인딩할 수 있는 경로:</span>
      {binding.suggestions.map((s) => (
        <button
          key={s}
          className="action-binding__suggest-chip"
          disabled={disabled}
          title={`엔드포인트를 ${s}로 바꾸고 계획을 다시 세웁니다`}
          onClick={() => onSlotSet(requestId, card.cardId, binding.suggestionSlot!, s)}
        >
          {s}
        </button>
      ))}
    </div>
  ) : null;

  // 어느 파일을 고치는지 — 요청 시점에 붙잡은 파일이며, 틀렸으면 여기서 바로 바꾼다.
  // (막힘 여부와 무관하게 항상 보여준다: "왜 테이블을 못 찾았나"의 답이 대개 이 줄에 있다.)
  const targetChip = binding.targetFileChoices.length > 0 || binding.targetFile ? (
    <div className="action-binding__envelope">
      <span className="action-binding__fields-label">대상 파일</span>
      <div className="action-chip-wrap">
        <button
          className={`action-chip${binding.targetFile ? '' : ' action-chip--empty'}${editingField === TARGET_FILE_CHOICE_KEY ? ' action-chip--editing' : ''}`}
          disabled={disabled || binding.targetFileChoices.length === 0}
          title={binding.targetFile ?? '열린 코드 파일이 없습니다'}
          onClick={() => setEditingField((cur) => (cur === TARGET_FILE_CHOICE_KEY ? null : TARGET_FILE_CHOICE_KEY))}
        >
          <span className="action-chip__value">
            {binding.targetFile ? binding.targetFile.split('/').pop() : '선택'}
          </span>
          <span className="action-chip__caret" aria-hidden>▾</span>
        </button>
        {editingField === TARGET_FILE_CHOICE_KEY && !disabled && (
          <ChipEditor
            slot={{
              name: TARGET_FILE_CHOICE_KEY,
              label: '대상 파일',
              value: binding.targetFile,
              inline: true,
              options: binding.targetFileChoices,
              allowCustom: false,
            }}
            onCommit={(value) => {
              setEditingField(null);
              onBindingChoice(requestId, card.cardId, TARGET_FILE_CHOICE_KEY, value);
            }}
            onCancel={() => setEditingField(null)}
          />
        )}
      </div>
    </div>
  ) : null;

  if (binding.blocked) {
    return (
      <div className="action-binding">
        {targetChip}
        <div className="action-binding__blocked">⚠️ {binding.blocked}</div>
        {suggestions}
      </div>
    );
  }

  const generic = binding.envelopeKey
    ? `useApi<{ ${binding.envelopeKey}: ${binding.typeName}[] }>`
    : `useApi<${binding.typeName}[]>`;
  const chooseCount = binding.rows.filter((r) => r.how === 'choose').length;

  return (
    <div className="action-binding">
      <div className="action-card__outputs-title">
        {binding.mode === 'wiring-only' ? '배선만 (응답 필드 미확인)' : '필드 매핑'}{' '}
        <code className="action-binding__generic">{generic}</code>
      </div>

      {/* 응답 필드를 그대로 보여준다 — 표 6칸에 API 3필드처럼 애초에 안 맞는 조합을
          드롭다운을 하나씩 열어봐야 알 수 있던 문제(실측)를 없앤다. */}
      {binding.apiFields.length > 0 && (
        <div className="action-binding__fields">
          <span className="action-binding__fields-label">API 응답 필드 {binding.apiFields.length}개:</span>{' '}
          <code>{binding.apiFields.join(' · ')}</code>
        </div>
      )}
      {binding.apiFields.length > 0 && chooseCount > binding.apiFields.length && (
        <div className="action-binding__pending">
          표에서 채울 칸({chooseCount})이 이 응답의 필드({binding.apiFields.length})보다 많습니다 —
          엔드포인트가 이 표와 맞는지 먼저 확인하세요.
        </div>
      )}
      {targetChip}
      {binding.notice && <div className="action-binding__notice">ℹ️ {binding.notice}</div>}

      {/* 봉투 키 선택 — 스펙이 없어 가정으로 배선할 때만. 백엔드마다 달라서 틀리면 런타임에
          조용히 빈 목록이 되므로(`data?.data`가 undefined), 코드 고치기 전에 여기서 바로 바꾼다. */}
      {binding.envelopeChoices.length > 0 && (
        <div className="action-binding__envelope">
          <span className="action-binding__fields-label">응답 봉투</span>
          <div className="action-chip-wrap">
            <button
              className={`action-chip${editingField === ENVELOPE_CHOICE_KEY ? ' action-chip--editing' : ''}`}
              disabled={disabled}
              title="응답 본문에서 목록이 담긴 키 (예: { data: [...] })"
              onClick={() => setEditingField((cur) => (cur === ENVELOPE_CHOICE_KEY ? null : ENVELOPE_CHOICE_KEY))}
            >
              <span className="action-chip__value">{binding.envelopeKey ?? '(봉투 없음)'}</span>
              <span className="action-chip__caret" aria-hidden>▾</span>
            </button>
            {editingField === ENVELOPE_CHOICE_KEY && !disabled && (
              <ChipEditor
                slot={{
                  name: ENVELOPE_CHOICE_KEY,
                  label: '응답 봉투',
                  value: binding.envelopeKey,
                  inline: true,
                  options: binding.envelopeChoices,
                  // 목록에 없는 키를 쓰는 백엔드도 있다 — 직접 입력 허용(식별자 형식만 검사).
                  allowCustom: true,
                  placeholder: '봉투 키 직접 입력',
                  pattern: '^[A-Za-z_$][\\w$]*$',
                  patternHint: '식별자 형식(예: payload)',
                }}
                onCommit={(value) => {
                  setEditingField(null);
                  onBindingChoice(requestId, card.cardId, ENVELOPE_CHOICE_KEY, value);
                }}
                onCancel={() => setEditingField(null)}
              />
            )}
          </div>
        </div>
      )}
      <table className="action-binding__table">
        <thead>
          <tr>
            <th>컬럼</th>
            <th>현재</th>
            <th>API 필드</th>
          </tr>
        </thead>
        <tbody>
          {binding.rows.map((row, i) => {
            const badge = HOW_BADGE[row.how];
            const key = row.currentField ?? `static-${i}`;
            const pseudoSlot: ActionCardSlotView = {
              name: key,
              label: row.label,
              value: row.apiField,
              inline: true,
              options: row.candidates ?? [],
              allowCustom: false,
            };
            return (
              <tr key={key} className={`action-binding__row action-binding__row--${row.how}`}>
                <td className="action-binding__label">{row.label}</td>
                <td className="action-binding__current">{row.currentField ?? '—'}</td>
                <td className="action-binding__target">
                  {row.how === 'choose' ? (
                    <div className="action-chip-wrap">
                      <button
                        className={`action-chip${row.apiField ? '' : ' action-chip--empty'}${editingField === key ? ' action-chip--editing' : ''}`}
                        disabled={disabled}
                        title={`${row.label} 컬럼이 읽을 API 필드 선택`}
                        onClick={() => setEditingField((cur) => (cur === key ? null : key))}
                      >
                        <span className="action-chip__value">{row.apiField ?? '선택'}</span>
                        <span className="action-chip__caret" aria-hidden>▾</span>
                      </button>
                      {editingField === key && !disabled && row.currentField && (
                        <ChipEditor
                          slot={pseudoSlot}
                          onCommit={(value) => {
                            setEditingField(null);
                            onBindingChoice(requestId, card.cardId, row.currentField!, value);
                          }}
                          onCancel={() => setEditingField(null)}
                        />
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="action-binding__field">{row.apiField ?? '—'}</span>
                      {badge && <span className={`action-binding__badge action-binding__badge--${badge.cls}`}>{badge.text}</span>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {binding.pendingCount > 0 && (
        <div className="action-binding__pending">
          선택 필요 {binding.pendingCount}개 — API 필드를 고르거나 `(컬럼 제거)`를 선택하세요.
        </div>
      )}
    </div>
  );
}

/**
 * 레시피 카드 본문 = **무엇을 어디에 넣는가**(A3).
 * 골격은 이미 확정돼 있으므로, 남은 판단은 "어디에"뿐 — 그 한 조각을 위치 칩으로 사람이 정한다.
 */
function RecipePlan({
  card, requestId, disabled, onBindingChoice,
}: {
  card: ActionCardView;
  requestId: string;
  disabled: boolean;
  onBindingChoice: Props['onBindingChoice'];
}): React.ReactElement | null {
  const [editingField, setEditingField] = useState<string | null>(null);
  const recipe = card.recipe;
  if (!recipe) return null;

  const chip = (
    key: string,
    label: string,
    value: string | null,
    options: string[],
    optionLabels?: Record<string, string>,
  ): React.ReactElement => (
    <div className="action-binding__envelope">
      <span className="action-binding__fields-label">{label}</span>
      <div className="action-chip-wrap">
        <button
          className={`action-chip${value ? '' : ' action-chip--empty'}${editingField === key ? ' action-chip--editing' : ''}`}
          disabled={disabled || options.length === 0}
          title={value ?? undefined}
          onClick={() => setEditingField((cur) => (cur === key ? null : key))}
        >
          <span className="action-chip__value">{value ? (optionLabels?.[value] ?? value) : '선택'}</span>
          <span className="action-chip__caret" aria-hidden>▾</span>
        </button>
        {editingField === key && !disabled && (
          <ChipEditor
            slot={{
              name: key,
              label,
              value,
              inline: true,
              options,
              allowCustom: false,
              ...(optionLabels ? { optionLabels } : {}),
            }}
            onCommit={(picked) => {
              setEditingField(null);
              onBindingChoice(requestId, card.cardId, key, picked);
            }}
            onCancel={() => setEditingField(null)}
          />
        )}
      </div>
    </div>
  );

  const targetChip = chip(
    TARGET_FILE_CHOICE_KEY,
    '대상 파일',
    recipe.targetFile ? recipe.targetFile.split('/').pop() ?? recipe.targetFile : null,
    recipe.targetFileChoices,
  );

  // 위치 칩 — 온라인에서 모델이 하던 "어디에"를 사람이 고르는 자리(§2 핵심 통찰).
  const anchorChip =
    recipe.anchorChoices.length > 0
      ? chip(
          RECIPE_ANCHOR_CHOICE_KEY,
          '삽입 위치',
          recipe.anchorKey,
          recipe.anchorChoices.map((a) => a.key),
          Object.fromEntries(recipe.anchorChoices.map((a) => [a.key, a.label])),
        )
      : null;

  // 막혔을 때도 칩은 남긴다 — 막힌 이유가 대개 "자리가 틀렸다"이고, 고칠 수단이 이 칩이다.
  if (recipe.blocked) {
    return (
      <div className="action-binding">
        {targetChip}
        {anchorChip}
        <div className="action-binding__blocked">⚠️ {recipe.blocked}</div>
      </div>
    );
  }

  const parts = [
    recipe.importCount > 0 ? `import ${recipe.importCount}건` : '',
    recipe.codeLines > 0 ? `코드 ${recipe.codeLines}줄` : '',
    recipe.jsxLines > 0 ? `화면 조각 ${recipe.jsxLines}줄` : '',
  ].filter(Boolean);

  return (
    <div className="action-binding">
      <div className="action-card__outputs-title">넣을 것: {parts.join(' · ')}</div>
      {targetChip}
      {anchorChip}
      {recipe.notice && <div className="action-binding__notice">ℹ️ {recipe.notice}</div>}
    </div>
  );
}

function PlanCard({
  card, requestId, executed, disabled, others, othersOpen, onToggleOthers,
  onChip, onSlotSet, onBindingChoice, onExecute,
}: {
  card: ActionCardView;
  requestId: string;
  executed: boolean;
  disabled: boolean;
  /** `[다른 작업 ▾]`으로 갈 수 있는 카드 수 — 0이면 버튼을 숨긴다. */
  others: number;
  othersOpen: boolean;
  onToggleOthers: () => void;
  onChip: Props['onChip'];
  onSlotSet: Props['onSlotSet'];
  onBindingChoice: Props['onBindingChoice'];
  onExecute: Props['onExecute'];
}): React.ReactElement {
  const [showCode, setShowCode] = useState(false);
  // 지금 열려 있는 인라인 편집기의 슬롯 이름(한 번에 하나만).
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
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
            <div key={s.name} className="action-chip-wrap">
              <button
                className={`action-chip${s.value ? '' : ' action-chip--empty'}${editingSlot === s.name ? ' action-chip--editing' : ''}`}
                disabled={disabled}
                title={`${s.label} 변경`}
                onClick={() => {
                  if (s.inline) setEditingSlot((cur) => (cur === s.name ? null : s.name));
                  else onChip(requestId, card.cardId, s.name);
                }}
              >
                <span className="action-chip__label">{s.label}</span>
                <span className="action-chip__value">{s.value ?? '선택'}</span>
                <span className="action-chip__caret" aria-hidden>▾</span>
              </button>
              {editingSlot === s.name && !disabled && (
                <ChipEditor
                  slot={s}
                  onCommit={(value) => {
                    setEditingSlot(null);
                    onSlotSet(requestId, card.cardId, s.name, value);
                  }}
                  onCancel={() => setEditingSlot(null)}
                />
              )}
            </div>
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

      <BindingTable
        card={card}
        requestId={requestId}
        disabled={disabled}
        onBindingChoice={onBindingChoice}
        onSlotSet={onSlotSet}
      />

      <RecipePlan
        card={card}
        requestId={requestId}
        disabled={disabled}
        onBindingChoice={onBindingChoice}
      />

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
            // 계획이 아직 완성되지 않았으면(막힘·미결정 행·미정 슬롯) 잠근다 —
            // 카드가 약속한 계획대로만 실행한다(§3.6 "미리보기 = 검증 게이트").
            disabled={
              disabled ||
              !!(card.binding && (card.binding.blocked || card.binding.pendingCount > 0)) ||
              !!(card.recipe && (card.recipe.blocked || card.recipe.pendingSlots.length > 0))
            }
            title={
              card.binding && card.binding.pendingCount > 0
                ? '애매한 컬럼을 먼저 정해주세요'
                : card.recipe && card.recipe.pendingSlots.length > 0
                  ? `먼저 정할 값: ${card.recipe.pendingSlots.join(', ')}`
                  : undefined
            }
            onClick={() => onExecute(requestId, card.cardId)}
          >
            {card.executeLabel}
          </button>
        )}
        {/* 계획이 빗나가거나 막혔을 때의 탈출구 — 카드 안에서 다른 작업으로(§3.6 장면 2). */}
        {others > 0 && !executed && (
          <button
            className="action-card__others-btn"
            disabled={disabled}
            onClick={onToggleOthers}
          >
            다른 작업 {othersOpen ? '▴' : '▾'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ActionCardsView({
  payload, executedCardId, onChip, onSlotSet, onBindingChoice, onExecute,
}: Props): React.ReactElement {
  // plan 모드면 top1이 펼쳐진 채 시작, list 모드면 전부 접힌 리스트로 시작.
  const [expandedId, setExpandedId] = useState<string | null>(
    payload.mode === 'plan' ? payload.cards[0]?.cardId ?? null : null,
  );
  const [showOthers, setShowOthers] = useState(false);
  const anyExecuted = !!executedCardId;

  // 추천 카드 + `[다른 작업 ▾]`용 카탈로그 카드. 어느 쪽을 펼치든 같은 계획 카드로 렌더된다.
  const all = [...payload.cards, ...(payload.moreCards ?? [])];
  const expanded = all.find((c) => c.cardId === expandedId) ?? null;
  // list 모드의 본문 = 추천 카드들(펼친 것 제외). 카탈로그 나머지는 항상 [다른 작업 ▾] 뒤에.
  const listRows = payload.mode === 'list' ? payload.cards.filter((c) => c.cardId !== expandedId) : [];
  const otherRows = all.filter((c) => c.cardId !== expandedId && !listRows.includes(c));

  const rowButton = (c: ActionCardView, close?: boolean): React.ReactElement => (
    <button
      key={c.cardId}
      className="action-cards__row"
      disabled={anyExecuted}
      onClick={() => { setExpandedId(c.cardId); if (close) setShowOthers(false); }}
    >
      <span className="action-cards__row-icon">{c.icon}</span>
      <span className="action-cards__row-title">{c.title}</span>
      <span className="action-cards__row-open">열기</span>
    </button>
  );

  return (
    <div className="action-cards">
      <div className="action-cards__banner">⚡ 오프라인 모드 — 이렇게 도와드릴 수 있어요</div>
      {payload.note && <div className="action-cards__note">{payload.note}</div>}

      {expanded && (
        <PlanCard
          card={expanded}
          requestId={payload.requestId}
          executed={executedCardId === expanded.cardId}
          disabled={anyExecuted}
          others={otherRows.length}
          othersOpen={showOthers}
          onToggleOthers={() => setShowOthers((v) => !v)}
          onChip={onChip}
          onSlotSet={onSlotSet}
          onBindingChoice={onBindingChoice}
          onExecute={onExecute}
        />
      )}

      {/* list 모드 본문 — 추천이 애매할 때의 컴팩트 리스트(장면 2′) */}
      {listRows.length > 0 && <div className="action-cards__list">{listRows.map((c) => rowButton(c))}</div>}

      {/* [다른 작업 ▾] 내용물. 카드가 없을 때(전부 접힘)는 토글 버튼도 여기서 낸다. */}
      {otherRows.length > 0 && (
        <div className="action-cards__others">
          {!expanded && (
            <button
              className="action-cards__others-toggle"
              disabled={anyExecuted}
              onClick={() => setShowOthers((v) => !v)}
            >
              다른 작업 {showOthers ? '▴' : '▾'}
            </button>
          )}
          {showOthers && (
            <div className="action-cards__list">{otherRows.map((c) => rowButton(c, true))}</div>
          )}
        </div>
      )}
    </div>
  );
}
