/**
 * ActionCardController — 오프라인 행동 카드(계획 카드)의 호스트 쪽 오케스트레이터.
 *
 * 담당(Phase 1, docs/offline-action-cards-plan.md §3.6·§9):
 *  - 카탈로그 로드(내장 media/action-cards + 프로젝트 .axiom/actions) → CardMatcher 추천
 *  - 추천 세션 상태(requestId·칩 편집값) 유지
 *  - 칩 클릭 → 슬롯 소스별 QuickPick/InputBox → 슬롯 상태 재전송
 *  - 실행 버튼 → action.type별 결정론 실행 (template=기존 템플릿 페이지 생성 경로 재사용)
 *
 * ChatViewProvider와는 IActionCardHost 콜백으로만 접점 — 채팅 스트림 규약(token/done/history)은
 * 호스트가 소유하고, 여기는 카드 상태와 실행만 안다.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { loadCardsFromDir, finalizeCatalog } from '../ai/actions/CardCatalog';
import { matchCards, listApplicableCards, type ICardMatchContext } from '../ai/actions/CardMatcher';
import {
  buildBindingView, buildCardsPayload, buildOutputViews, buildSlotViews, substituteSlots,
} from '../ai/actions/CardPlanView';
import type { IBindingPlan } from '../ai/actions/OfflineApiBinding';
import type { IActionCard, ICardMatch } from '../ai/actions/types';
import { COMPONENT_PROPS_INDEX } from '../ai/contracts/generated/componentPropsIndex';
import { splitFrontmatter } from '../ai/retrieval/KnowledgeDoc';
import { PageCreationDetector } from '../ai/intent/PageCreationDetector';
import { ENVELOPE_CHOICE_KEY, TARGET_FILE_CHOICE_KEY } from '../types/messages';
import type {
  ActionCardOutputView, ActionCardSlotView, ActionCardsPayload, HostToWebviewMessage,
} from '../types/messages';

/** ChatViewProvider가 구현하는 호스트 접점. */
export interface IActionCardHost {
  post(msg: HostToWebviewMessage): void;
  /**
   * markdown 한 턴을 채팅에 렌더(token + history + done + 오프라인 상태줄).
   * pin=true면 정독용으로 질문 상단 고정(doc 카드 등 긴 문서).
   */
  renderMarkdown(md: string, pin?: boolean): void;
  /** A2 실행기 — 기존 결정론 템플릿 페이지 생성 경로(_createPageFromTemplate) 재사용. */
  createPageFromTemplate(pageName: string, domain: string): Promise<void>;
  /**
   * template 카드의 출력 미리보기를 **실행기와 같은 소스**에서 계산한다(선택).
   * 실제 출력이 워크스페이스 상태에 따라 갈리는 카드(페이지 생성 = 새 도메인이면 루트 라우터까지
   * 3개)를 정적 선언으로는 표현할 수 없어, 미리보기가 실제보다 적게 말하면 계획 카드의 검증
   * 게이트 속성이 깨진다. null이면 카드 파일의 정적 outputs를 쓴다.
   */
  previewTemplateOutputs(templateId: string, values: Record<string, string>): ActionCardOutputView[] | null;
  /**
   * 슬롯 값을 **실행이 실제로 쓸 형태**로 정규화한다(예: 페이지 이름 → PascalCase, 확장자 제거).
   * 정규화 없이 원문을 칩에 남기면 칩·미리보기·생성 파일명이 갈라진다. 쓸 수 없는 값이면 null.
   * 해당 슬롯에 정규화 규칙이 없으면 입력을 그대로 돌려준다.
   */
  normalizeTemplateSlot(templateId: string, slotName: string, raw: string): string | null;
  scanDomains(): string[];
  /**
   * 워크스페이스 스펙 문서에서 뽑은 API 경로 목록(`endpoint-list` 슬롯의 선택지, §4.5).
   * 없으면 빈 배열 — 칩은 자유 입력으로 남는다.
   */
  scanEndpoints(): string[];
  /**
   * 지금 편집 중인 **코드 파일**의 워크스페이스 상대 경로. 카드는 이 값을 세션에 붙잡아 두고
   * 이후 계획·적용에 계속 쓴다 — 매번 활성 편집기를 다시 읽으면 사용자가 스펙 문서를 열어보는
   * 것만으로 대상이 바뀌어 카드가 잠긴다(실측).
   */
  currentCodeFile(): string | null;
  /**
   * binding 카드의 계획(매핑 테이블)을 계산한다 — 현재 파일 원문과 스펙 문서가 필요하므로
   * 워크스페이스 I/O를 아는 호스트 몫이다. 지원하지 않는 id·현재 파일 없음이면 null.
   * 막힘(테이블 없음·스펙 없음)은 null이 아니라 `plan.blocked` 사유로 돌려준다 — 카드가
   * 조용히 비지 않고 "왜 못 하는지"를 말하게 하기 위해서다.
   */
  buildBindingPlan(bindingId: string, values: Record<string, string>): IBindingPlan | null;
  /**
   * 확정된 계획을 결정론 적용한다(확인 카드·파일 쓰기는 기존 경로 재사용).
   * @returns null=적용 흐름 진입 / 문자열=실패 사유(카드가 그대로 안내)
   */
  applyBinding(
    bindingId: string, values: Record<string, string>, choices: Record<string, string>,
  ): Promise<string | null>;
  workspaceRoot(): string | null;
}

interface ICardSession {
  requestId: string;
  query: string;
  /** 이 턴에 살아 있는 카드 전부(추천 + `[다른 작업 ▾]`) — 칩 편집·실행 조회 대상. */
  matches: ICardMatch[];
  /** 그중 실제로 **추천된** 카드 — 히스토리 한 줄 요약에 쓴다(카탈로그 전부를 적으면 잡음). */
  primary: ICardMatch[];
  /** cardId → slotName → 값 (프리필로 초기화, 칩 편집으로 갱신). */
  values: Map<string, Record<string, string>>;
  /** cardId → 테이블 컬럼 필드 → 사용자가 고른 API 필드(또는 REMOVE_COLUMN). binding 카드 전용. */
  choices: Map<string, Record<string, string>>;
}

/**
 * 인라인 편집으로 감당할 후보 개수 상한. 넘으면 호스트 QuickPick으로 위임한다 —
 * 많은 항목은 퍼지 검색·키보드 이동이 필요한데 그건 QuickPick이 훨씬 낫다(예: 컴포넌트 53종).
 */
const INLINE_OPTION_LIMIT = 12;

/** 도메인 이름 규칙 — 인라인 입력·QuickPick 입력·호스트 검증이 같은 규칙을 쓴다. */
const DOMAIN_PATTERN = '^[a-z][a-z0-9-]*$';
const DOMAIN_HINT = '소문자·숫자·하이픈만 (예: account)';
/** API 경로 규칙. */
const ENDPOINT_PATTERN = '^/[\\w:-]+(?:/[\\w:-]+)*$';
const ENDPOINT_HINT = '/segment/segment 형식의 경로 (예: /api/employees)';

let seq = 0;

export class ActionCardController {
  private _session: ICardSession | null = null;
  private readonly _pageNameDetector = new PageCreationDetector();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _host: IActionCardHost,
  ) {}

  // ── 카탈로그 ────────────────────────────────────────────────────────────────

  /** 내장 + 프로젝트 카드 로드(디렉터리가 작아 매 턴 로드 = 공짜 핫리로드). */
  private _loadCatalog(): IActionCard[] {
    const builtinDir = vscode.Uri.joinPath(this._extensionUri, 'media', 'action-cards').fsPath;
    const builtin = loadCardsFromDir(builtinDir, 'builtin');
    const wsRoot = this._host.workspaceRoot();
    const project = wsRoot
      ? loadCardsFromDir(path.join(wsRoot, '.axiom', 'actions'), 'project')
      : { cards: [], issues: [] };
    for (const i of [...builtin.issues, ...project.issues]) {
      if (i.severity === 'error') {
        console.warn(`[Axiom AI] 행동 카드 비활성: [${i.cardId ?? '?'}] ${i.message} (${i.sourcePath ?? ''})`);
      }
    }
    return finalizeCatalog([...builtin.cards, ...project.cards]).cards;
  }

  private _matchContext(fileOpen: boolean): ICardMatchContext {
    const wsRoot = this._host.workspaceRoot();
    return {
      fileOpen,
      scaffoldDetected: !!wsRoot && fs.existsSync(path.join(wsRoot, 'src', 'domains')),
      domains: this._host.scanDomains(),
      components: Object.keys(COMPONENT_PROPS_INDEX),
      endpoints: this._host.scanEndpoints(),
    };
  }

  // ── 추천 ────────────────────────────────────────────────────────────────────

  /**
   * 행동성 요청에 대해 추천 카드를 렌더한다. 매칭이 없으면 false — 호출부가 기존
   * 오프라인 지식 응답으로 폴백한다(카드는 보조이지 관문이 아니다).
   *
   * @param fallbackToCatalog true면 트리거 매칭이 0일 때 **카탈로그 전체를 컴팩트 리스트로**
   *   보여준다. 실패해도 "다른 파이프라인으로 이동"이 아니라 "메뉴가 뜬다"로 끝나게 하는 안전망 —
   *   말투 차이로 경로가 갈리는 체감(실측: "페이지 만들어줘" vs "화면을 만들어줘")을 없앤다.
   *   호출부가 이미 "행동 요청"이라고 판단한 지점에서만 켠다.
   */
  recommend(query: string, fileOpen: boolean, fallbackToCatalog = false): boolean {
    const cards = this._loadCatalog();
    if (cards.length === 0) return false;
    const ctx = this._matchContext(fileOpen);
    let rec = matchCards(query, cards, ctx);
    let note: string | undefined;
    if (rec.mode === 'none' || rec.matches.length === 0) {
      if (!fallbackToCatalog) return false;
      rec = listApplicableCards(query, cards, ctx);
      if (rec.mode === 'none' || rec.matches.length === 0) return false;
      note = '요청과 정확히 맞는 작업을 찾지 못했어요. 아래에서 골라주시거나, 조금 더 구체적으로 다시 말씀해주세요.';
    }

    // `[다른 작업 ▾]`의 내용물 — 지금 상황에서 할 수 있는 나머지 카드(§3.6 장면 2).
    // 매칭이 한 장뿐이어도 탈출구가 있어야 한다: 계획 카드가 빗나가거나 막혔을 때(스펙에 없는
    // 엔드포인트 등) 다시 타이핑하는 것 말고는 할 게 없으면, 그게 바로 "빗나감이 절벽"이다.
    const shown = new Set(rec.matches.map((m) => m.card.id));
    const more = listApplicableCards(query, cards, ctx).matches.filter((m) => !shown.has(m.card.id));

    const requestId = `ac-${Date.now().toString(36)}-${++seq}`;
    const values = new Map<string, Record<string, string>>();
    const all = [...rec.matches, ...more];
    // 요청 시점의 대상 파일을 **붙잡아** 둔다(이후 활성 편집기가 바뀌어도 카드는 이 파일을 본다).
    const targetFile = this._host.currentCodeFile();
    for (const m of all) {
      values.set(m.card.id, { ...m.prefill, ...(targetFile ? { [TARGET_FILE_CHOICE_KEY]: targetFile } : {}) });
    }
    // 세션엔 둘 다 담는다 — [다른 작업]에서 펼친 카드도 칩 편집·실행이 되어야 한다.
    this._session = { requestId, query, matches: all, primary: rec.matches, values, choices: new Map() };

    const payload: ActionCardsPayload = buildCardsPayload(
      requestId, query, rec.mode === 'plan' ? 'plan' : 'list', rec.matches, values,
      {
        hooks: {
          outputs: (card, v) => this._resolveOutputs(card, v),
          editor: (c, slot) => this._slotEditor(c, slot),
          binding: (card, v) => this._resolveBindingPlan(card, v),
          choices: this._session.choices,
        },
        ...(note ? { note } : {}),
        more,
      },
    );
    this._host.post({ type: 'actionCards', payload });
    return true;
  }

  /** 추천 세션의 히스토리 기록용 한 줄 요약(카드는 구조 메시지라 그대로 히스토리에 못 넣는다). */
  historySummary(): string {
    if (!this._session) return '[오프라인 추천 카드]';
    const titles = this._session.primary.map((m) => m.card.title).join(', ');
    return `[오프라인 추천 카드: ${titles}]`;
  }

  // ── 칩 편집 ─────────────────────────────────────────────────────────────────

  /** 칩 클릭 — 그 슬롯만 QuickPick/InputBox로 고치고 슬롯 상태를 재전송한다. */
  async handleChip(requestId: string, cardId: string, slotName: string): Promise<void> {
    const found = this._findCard(requestId, cardId);
    if (!found) return;
    const { card } = found;
    const slot = card.slots.find((s) => s.name === slotName);
    if (!slot) return;
    const values = this._session!.values.get(cardId) ?? {};
    const picked = await this._pickSlotValue(slot.source, slot.label, values[slotName], slot.options);
    if (picked === undefined) return; // 사용자 취소 — 상태 유지
    values[slotName] = picked;
    this._session!.values.set(cardId, values);
    this._invalidateChoices(card);
    this._postSlots(requestId, cardId, card, values);
  }

  /**
   * 슬롯이 바뀌면 그 카드의 행 선택을 버린다 — 엔드포인트가 바뀌면 후보 필드 자체가 달라지므로,
   * 낡은 선택이 남으면 "다른 API의 필드"가 조용히 실려 갈 수 있다(계획 카드 최악의 실패).
   */
  private _invalidateChoices(card: IActionCard): void {
    if (card.action.type === 'binding') this._session?.choices.delete(card.id);
  }

  /**
   * 갱신된 슬롯 + 재계산한 출력 미리보기/매핑 테이블을 웹뷰로 되돌린다
   * (인라인 칩·QuickPick·바인딩 행 선택의 공통 출구 — 카드에 보이는 것은 항상 호스트가 계산한 것).
   */
  private _postSlots(
    requestId: string, cardId: string, card: IActionCard, values: Record<string, string>,
  ): void {
    const plan = this._resolveBindingPlan(card, values);
    this._host.post({
      type: 'actionCardSlots',
      requestId,
      cardId,
      slots: buildSlotViews(card, values, (c, slot) => this._slotEditor(c, slot)),
      outputs: this._resolveOutputs(card, values) ?? buildOutputViews(card, values),
      ...(plan
        ? {
            binding: buildBindingView(
              plan,
              this._session?.choices.get(cardId) ?? {},
              card.slots.find((s) => s.source === 'endpoint-list')?.name,
            ),
          }
        : {}),
    });
  }

  /** binding 카드의 계획을 호스트에서 계산한다. 실패는 카드 없음(null)으로 접는다 — 카탈로그는 산다. */
  private _resolveBindingPlan(card: IActionCard, values: Record<string, string>): IBindingPlan | null {
    if (card.action.type !== 'binding' || !card.action.binding) return null;
    try {
      return this._host.buildBindingPlan(card.action.binding, values);
    } catch (err) {
      console.warn(`[Axiom AI] 바인딩 계획 계산 실패: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * 매핑 테이블의 한 행(애매한 컬럼)에 대한 사용자 선택을 반영한다.
   * 값 검증은 계획 재계산이 대신한다 — 후보 밖 값이면 `decorateBindingRows`가 미정으로 되돌려
   * 카드가 "아직 안 정해짐"으로 정직하게 표시한다(호스트가 진실의 원천).
   *
   * `field`가 예약키 `ENVELOPE_CHOICE_KEY`면 행이 아니라 **봉투 키 선택**이다: 이건 행 매핑이 아니라
   * 계획 자체의 입력이라 값 저장소(values)에 넣어 계획 재계산에 그대로 반영시킨다.
   */
  setBindingChoice(requestId: string, cardId: string, field: string, value: string): void {
    const found = this._findCard(requestId, cardId);
    if (!found || found.card.action.type !== 'binding') return;
    const key = field.trim();
    const picked = value.trim();
    if (!key || !picked) return;

    if (key === ENVELOPE_CHOICE_KEY || key === TARGET_FILE_CHOICE_KEY) {
      const values = this._session!.values.get(cardId) ?? {};
      values[key] = picked;
      this._session!.values.set(cardId, values);
      // 대상 파일이 바뀌면 표 자체가 달라진다 — 이전 표에 대한 행 선택은 버린다.
      if (key === TARGET_FILE_CHOICE_KEY) this._invalidateChoices(found.card);
      this._postSlots(requestId, cardId, found.card, values);
      return;
    }

    const choices = this._session!.choices.get(cardId) ?? {};
    choices[key] = picked;
    this._session!.choices.set(cardId, choices);
    this._postSlots(requestId, cardId, found.card, this._session!.values.get(cardId) ?? {});
  }

  /**
   * 슬롯의 인라인 편집 재료를 만든다 — 후보 목록·자유 입력 허용 여부·검증 규칙.
   *
   * 정책(어디서 편집할지)은 **호스트가 정하고** 웹뷰는 따르기만 한다: 후보가 적으면 카드 안에서
   * 바로(창 전환 없음, §3.6 "위저드 = 칩 편집기"), 많으면 검색이 되는 QuickPick으로 위임.
   */
  private _slotEditor(card: IActionCard, slot: IActionCard['slots'][number]): Pick<
    ActionCardSlotView, 'inline' | 'options' | 'allowCustom' | 'placeholder' | 'pattern' | 'patternHint'
  > {
    const base = this._slotEditorBase(slot);
    // 카드가 스스로 선언한 규칙이 source 기본값을 이긴다(§2-3 — 규칙은 코드가 아니라 카드 데이터).
    if (slot.pattern) {
      return { ...base, pattern: slot.pattern, ...(slot.hint ? { patternHint: slot.hint } : {}) };
    }
    void card;
    return base;
  }

  private _slotEditorBase(slot: IActionCard['slots'][number]): Pick<
    ActionCardSlotView, 'inline' | 'options' | 'allowCustom' | 'placeholder' | 'pattern' | 'patternHint'
  > {
    switch (slot.source) {
      case 'enum':
        return { inline: true, options: slot.options ?? [], allowCustom: false };
      case 'domain-list': {
        const domains = this._host.scanDomains();
        // 새 도메인 생성이 정당한 경우가 있으므로 직접 입력을 함께 허용한다.
        return domains.length <= INLINE_OPTION_LIMIT
          ? { inline: true, options: domains, allowCustom: true, placeholder: '새 도메인 이름', pattern: DOMAIN_PATTERN, patternHint: DOMAIN_HINT }
          : { inline: false };
      }
      case 'component-list': {
        const components = Object.keys(COMPONENT_PROPS_INDEX);
        // 53종 — 검색 없이는 못 고른다 → QuickPick.
        return components.length <= INLINE_OPTION_LIMIT
          ? { inline: true, options: components.sort(), allowCustom: false }
          : { inline: false };
      }
      case 'endpoint-list': {
        // 스펙 문서에서 실제로 발견된 경로를 후보로 준다(§4.5 스캔 계약). 스펙이 없거나 못 찾으면
        // 자유 입력만 — 폐쇄망에선 "스펙 문서가 아직 없음"이 흔한 정상 상태다.
        // 후보가 많으면 편집은 QuickPick에 위임하되(inline=false) **후보 목록 자체는 함께 내려보낸다**:
        // 계획 카드의 "대체 경로" 칩이 값을 되돌려 보낼 때 호스트가 그 값을 알아야 통과시킨다.
        const endpoints = this._host.scanEndpoints();
        return {
          inline: endpoints.length <= INLINE_OPTION_LIMIT,
          options: endpoints, allowCustom: true, placeholder: '/api/…',
          pattern: ENDPOINT_PATTERN, patternHint: ENDPOINT_HINT,
        };
      }
      case 'text':
      default:
        return { inline: true, options: [], allowCustom: true, placeholder: slot.label };
    }
  }

  /**
   * 카드 안 인라인 편집 결과를 반영한다. 웹뷰가 값을 만들지만 **진실의 원천은 호스트**다 —
   * 여기서 검증·정규화한 뒤 슬롯 상태를 되돌려줘야 출력 미리보기 재계산이 항상 실제와 맞는다.
   */
  setSlotValue(requestId: string, cardId: string, slotName: string, raw: string): void {
    const found = this._findCard(requestId, cardId);
    if (!found) return;
    const { card } = found;
    const slot = card.slots.find((s) => s.name === slotName);
    if (!slot) return;
    const value = raw.trim();
    if (!value) return;

    const editor = this._slotEditor(card, slot);
    const known = (editor.options ?? []).includes(value);
    if (!known) {
      if (!editor.allowCustom) return; // 후보 밖 값 거부(enum 등)
      if (editor.pattern && !new RegExp(editor.pattern).test(value)) return; // 형식 위반 거부
    }

    // 실행 시 적용될 정규화(예: 페이지 이름 → PascalCase)를 **여기서 미리 적용**해 저장한다.
    // 칩에 원문이 남으면 칩·미리보기·실제 파일명이 갈라져("employee-list" 칩 ↔ EmployeeList.tsx),
    // 앞서 고친 출력 미리보기 문제와 같은 종류의 불일치가 다시 생긴다.
    const canonical = card.action.type === 'template' && card.action.template
      ? this._host.normalizeTemplateSlot(card.action.template, slotName, value)
      : value;
    if (!canonical) return; // 정규화 불가(쓸 수 있는 이름을 못 뽑음) → 값 유지, 재입력 유도

    const values = this._session!.values.get(cardId) ?? {};
    values[slotName] = canonical;
    this._session!.values.set(cardId, values);
    this._invalidateChoices(card);
    this._postSlots(requestId, cardId, card, values);
  }

  /** 실행기 파생 미리보기(가능하면) — 실패·미지원이면 null로 정적 outputs에 양보한다. */
  private _resolveOutputs(card: IActionCard, values: Record<string, string>): ActionCardOutputView[] | null {
    if (card.action.type !== 'template' || !card.action.template) return null;
    try {
      const rows = this._host.previewTemplateOutputs(card.action.template, values);
      return rows && rows.length > 0 ? rows : null;
    } catch (err) {
      console.warn(`[Axiom AI] 출력 미리보기 파생 실패(정적 선언 사용): ${(err as Error).message}`);
      return null;
    }
  }

  /** 슬롯 소스별 단일 값 선택기. undefined = 사용자 취소. */
  private async _pickSlotValue(
    source: IActionCard['slots'][number]['source'],
    label: string,
    current: string | undefined,
    options?: string[],
  ): Promise<string | undefined> {
    switch (source) {
      case 'enum': {
        return vscode.window.showQuickPick(options ?? [], { placeHolder: `${label} 선택` });
      }
      case 'domain-list': {
        const NEW = '$(add) 새 도메인…';
        const items = [...this._host.scanDomains(), NEW];
        const picked = await vscode.window.showQuickPick(items, { placeHolder: `${label} 선택` });
        if (picked === undefined) return undefined;
        if (picked !== NEW) return picked;
        return vscode.window.showInputBox({
          prompt: '새 도메인 이름 (소문자 kebab-case)',
          validateInput: (v) => (/^[a-z][a-z0-9-]*$/.test(v) ? null : '소문자·숫자·하이픈만 (예: account)'),
        });
      }
      case 'component-list': {
        return vscode.window.showQuickPick(Object.keys(COMPONENT_PROPS_INDEX).sort(), { placeHolder: `${label} 선택` });
      }
      case 'endpoint-list': {
        const ask = (): Thenable<string | undefined> =>
          vscode.window.showInputBox({
            prompt: `${label} (API 경로)`,
            value: current ?? '',
            placeHolder: '/api/…',
            validateInput: (v) => (/^\/[\w:-]+(?:\/[\w:-]+)*$/.test(v.trim()) ? null : '/segment/segment 형식의 경로를 입력하세요'),
          });
        const endpoints = this._host.scanEndpoints();
        if (endpoints.length === 0) return ask();
        const CUSTOM = '$(edit) 직접 입력…';
        const picked = await vscode.window.showQuickPick([...endpoints, CUSTOM], {
          placeHolder: `${label} 선택 (스펙 문서에서 찾은 경로)`,
        });
        if (picked === undefined) return undefined;
        return picked === CUSTOM ? ask() : picked;
      }
      case 'text':
      default: {
        const v = await vscode.window.showInputBox({ prompt: label, value: current ?? '' });
        return v?.trim() ? v.trim() : undefined;
      }
    }
  }

  // ── 실행 ────────────────────────────────────────────────────────────────────

  /** 실행 버튼 — action.type별 결정론 실행. 여기부터 자연어 해석 0. */
  async handleExecute(requestId: string, cardId: string): Promise<void> {
    const found = this._findCard(requestId, cardId);
    if (!found) {
      this._host.renderMarkdown('> ⚠️ 이 추천 카드는 만료되었습니다. 요청을 다시 입력해주세요.');
      return;
    }
    const { card } = found;
    const values = { ...(this._session!.values.get(cardId) ?? {}) };
    switch (card.action.type) {
      case 'template':
        await this._executeTemplate(card, values);
        return;
      case 'doc':
        this._executeDoc(card);
        return;
      case 'recipe':
        this._executeRecipe(card, values);
        return;
      case 'command':
        await this._executeCommand(card);
        return;
      case 'binding':
        await this._executeBinding(card, values);
        return;
    }
  }

  /**
   * binding 실행 — 카드에 보이는 매핑 테이블 그대로 결정론 적용(모델 0회).
   * 실패는 조용히 삼키지 않고 사유를 채팅에 남긴다(카드가 약속한 계획이 왜 안 됐는지 보이게).
   */
  private async _executeBinding(card: IActionCard, values: Record<string, string>): Promise<void> {
    const bindingId = card.action.binding ?? '';
    const choices = { ...(this._session!.choices.get(card.id) ?? {}) };
    let reason: string | null;
    try {
      reason = await this._host.applyBinding(bindingId, values, choices);
    } catch (err) {
      reason = (err as Error).message;
    }
    if (reason) {
      this._host.renderMarkdown(`> ⚠️ **${card.title}** 적용을 하지 못했습니다 — ${reason}`);
    }
  }

  /** template 실행 — 부족한 슬롯만 되묻고(칩과 같은 선택기) 기존 템플릿 생성 경로로 위임. */
  private async _executeTemplate(card: IActionCard, values: Record<string, string>): Promise<void> {
    // 부족한 슬롯 수집(칩에서 이미 채웠으면 통째로 생략 — "위저드 = 칩 편집기"의 실행부)
    for (const slot of card.slots) {
      if (values[slot.name]) continue;
      if (slot.name === 'pageName') continue; // 이름은 아래 전용 InputBox(정규화 포함)로
      const picked = await this._pickSlotValue(slot.source, slot.label, undefined, slot.options);
      if (picked === undefined) return; // 취소
      values[slot.name] = picked;
    }

    let pageName = values.pageName ?? '';
    if (!pageName) {
      // 카드가 선언한 규칙을 InputBox에도 그대로 적용 — 인라인 칩과 맨땅 진입의 검증을 일치시킨다.
      const nameSlot = card.slots.find((s) => s.name === 'pageName');
      const editor = nameSlot ? this._slotEditor(card, nameSlot) : { pattern: undefined, patternHint: undefined };
      const raw = await vscode.window.showInputBox({
        prompt: '페이지 이름 (PascalCase, 예: EmployeeListPage)',
        placeHolder: 'EmployeeListPage',
        validateInput: (v) => {
          const t = v.trim();
          if (!t) return null;
          if (editor.pattern && !new RegExp(editor.pattern).test(t)) {
            return editor.patternHint ?? '이름 형식이 올바르지 않습니다.';
          }
          return null;
        },
      });
      if (raw === undefined || !raw.trim()) return;
      pageName = raw.trim();
    }
    // 정규화(기존 페이지 생성 플로우와 동일 규칙 — PascalCase·Page 접미사 보정)
    const normalized = this._pageNameDetector.normalizeName(pageName) ?? pageName;
    const domain = values.domain;
    if (!domain) return;

    // 덮어쓰기 사고 방지 — autoWrite 경로는 확인 없이 쓰므로 실행 전에 존재를 막는다.
    const wsRoot = this._host.workspaceRoot();
    const pageRel = `src/domains/${domain}/pages/${normalized}.tsx`;
    if (wsRoot && fs.existsSync(path.join(wsRoot, pageRel))) {
      this._host.renderMarkdown(
        `> ⚠️ \`${pageRel}\` 파일이 이미 있습니다. 카드의 **이름** 칩을 다른 이름으로 바꾼 뒤 다시 실행해주세요.`,
      );
      return;
    }

    await this._host.createPageFromTemplate(normalized, domain);
  }

  /**
   * doc 실행 — 지식문서를 결정론 렌더(출처 칩 헤더는 기존 오프라인 Q&A 카드 규약 재사용).
   * 워크스페이스 RAG 폴더(.axiom/knowledge 등)를 먼저 보고 없으면 번들 knowledge — RagRetriever와 동일 우선순위.
   */
  private _executeDoc(card: IActionCard): void {
    const docId = card.action.doc ?? '';
    const roots: string[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      roots.push(path.join(folder.uri.fsPath, '.axiom', 'knowledge'));
    }
    roots.push(vscode.Uri.joinPath(this._extensionUri, 'knowledge').fsPath);
    const docPath = roots.map((r) => path.join(r, `${docId}.md`)).find((p) => fs.existsSync(p));
    if (!docPath) {
      this._host.renderMarkdown(`> ⚠️ 지식문서를 찾을 수 없습니다: \`${docId}\``);
      return;
    }
    const raw = fs.readFileSync(docPath, 'utf8');
    const { body } = splitFrontmatter(raw);
    this._host.renderMarkdown(`## [${docId}.md]\n\n${body}`, true);
  }

  /** recipe 실행(Phase 1) — 골격을 안내 카드로 렌더. 자동 structural 삽입은 A3(후속). */
  private _executeRecipe(card: IActionCard, values: Record<string, string>): void {
    const skeleton = substituteSlots(card.skeleton ?? '', values);
    this._host.renderMarkdown(
      `${card.icon} **${card.title}** — 아래 골격을 현재 파일에 적용하세요.\n\n` +
      `${card.description}\n\n\`\`\`tsx\n${skeleton}\n\`\`\`\n\n` +
      `> 자동 삽입(structural apply)은 후속 단계에서 지원됩니다 — 지금은 골격을 복사해 붙여넣으세요.`,
    );
  }

  /** command 실행 — 등록된 명령이면 호출, 아직 없으면(미래 Phase 위저드) 준비 중 안내. */
  private async _executeCommand(card: IActionCard): Promise<void> {
    const command = card.action.command ?? '';
    const known = await vscode.commands.getCommands(true);
    if (!known.includes(command)) {
      this._host.renderMarkdown(
        `> 🛠 **${card.title}** 위저드는 준비 중입니다(다음 Phase). 카드 설명:\n\n${card.description}`,
      );
      return;
    }
    await vscode.commands.executeCommand(command);
  }

  // ── 맨땅 진입(자연어 없이 — 명령 팔레트) ────────────────────────────────────

  /**
   * 페이지 생성 위저드 맨땅 진입 — 순차 QuickPick(도메인→유형→이름) 후 동일 실행기.
   * 카드 경유와 실행기가 같으므로("두 입구 = 동일 실행기") 프리필 없는 카드 실행과 동일하게 처리.
   */
  async runPageWizard(): Promise<void> {
    const cards = this._loadCatalog();
    const card = cards.find((c) => c.id === 'create-page' && c.action.type === 'template');
    if (!card) {
      void vscode.window.showWarningMessage('Axiom AI: create-page 카드를 찾을 수 없습니다.');
      return;
    }
    await this._executeTemplate(card, {});
  }

  private _findCard(requestId: string, cardId: string): { card: IActionCard } | null {
    if (!this._session || this._session.requestId !== requestId) return null;
    const match = this._session.matches.find((m) => m.card.id === cardId);
    return match ? { card: match.card } : null;
  }
}
