/**
 * CardParser — `*.card.md` 원문 → IActionCard + 검증 이슈 (fail-open, §4 규칙 1).
 *
 * 검증은 로드 시점에 한다: 필수 필드 누락·모르는 action.type·스키마 위반이 있으면
 * **그 카드만 비활성**(card=null)하고 issues로 이유를 남긴다 — 잘못된 카드 하나가
 * 카탈로그 전체를 죽이면 안 된다. warning은 카드를 살려둔 채 패널에 ⚠로만 표시.
 *
 * vscode/디스크 비의존 순수 모듈 — 파일 읽기·계층 부여는 로더(카탈로그)가 한다.
 */

import { parseMiniYaml, type IYamlMap, type TYamlValue } from './MiniYaml';
import {
  ACTION_TYPES, SLOT_SOURCES, PRECONDITIONS,
  type IActionCard, type IActionCardSlot, type IActionSpec, type ICardIssue,
  type IParsedCard, type ITemplateOutput, type TActionType, type TCardLayer,
  type TPrecondition, type TSlotSource,
} from './types';

export interface IParseCardOptions {
  /** 파일명 유래 id (`<id>.card.md`) — frontmatter id와 불일치하면 error (§4 충돌 방지). */
  expectedId?: string;
  sourcePath?: string;
  /** 로더가 출처에 따라 부여 (§5). 기본 'builtin'. */
  layer?: TCardLayer;
}

const KNOWN_TOP_KEYS = new Set([
  'schemaVersion', 'id', 'title', 'icon', 'triggers', 'preconditions', 'slots', 'action', 'priority',
]);
const KNOWN_ACTION_KEYS = new Set(['type', 'template', 'outputs', 'doc', 'command', 'binding']);
const KNOWN_SLOT_KEYS = new Set(['name', 'label', 'source', 'options', 'prefillFrom', 'pattern', 'hint']);

const ID_RE = /^[a-z][a-z0-9-]*$/;
const SLOT_NAME_RE = /^[A-Za-z_][\w-]*$/;
/** 골격·출력 경로 안의 `{{slot}}` 플레이스홀더. */
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;
/** template outputs 항목: `+ 경로` | `± 경로` | `± 경로 (설명)`. */
const OUTPUT_RE = /^([+±])\s+(\S+)(?:\s+\((.+)\))?$/;

/** frontmatter(`---` 블록)와 본문을 나눈다. BOM·CRLF 허용. */
export function splitCardFrontmatter(raw: string): { fm: string; body: string } | null {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  return { fm: m[1], body: raw.slice(m[0].length) };
}

/** 본문에서 첫 코드펜스의 **내용**(펜스 줄 제외)을 뽑는다. 없으면 null. */
function firstFenceContent(body: string): string | null {
  const m = body.match(/```[^\n]*\r?\n([\s\S]*?)```/);
  return m ? m[1].replace(/\s+$/, '') : null;
}

/** 본문 산문 = 코드펜스를 제거한 나머지. `## 설명` 섹션이 있으면 그 섹션만(다음 ## 전까지). */
function extractDescription(body: string): string {
  const noFence = body.replace(/```[^\n]*\r?\n[\s\S]*?```/g, '').trim();
  const heading = noFence.match(/^##\s*설명[^\n]*\r?\n/m);
  if (heading && heading.index !== undefined) {
    const rest = noFence.slice(heading.index + heading[0].length);
    const next = rest.search(/^##\s/m);
    return (next >= 0 ? rest.slice(0, next) : rest).trim();
  }
  return noFence;
}

function asTrimmedString(v: TYamlValue | undefined): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asStringArray(v: TYamlValue | undefined): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      const s = String(item).trim();
      if (s) out.push(s);
    } else {
      return null; // 객체 항목 섞임 — 호출부가 형식 오류로 처리
    }
  }
  return out;
}

function isMap(v: TYamlValue | undefined): v is IYamlMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 원문 → 카드. error 이슈가 하나라도 있으면 card=null(그 카드만 비활성). */
export function parseActionCard(raw: string, opts: IParseCardOptions = {}): IParsedCard {
  const issues: ICardIssue[] = [];
  let cardId: string | undefined = opts.expectedId;
  const err = (message: string, field?: string) =>
    issues.push({ severity: 'error', message, field, cardId, sourcePath: opts.sourcePath });
  const warn = (message: string, field?: string) =>
    issues.push({ severity: 'warning', message, field, cardId, sourcePath: opts.sourcePath });
  const done = (card: IActionCard | null): IParsedCard => {
    for (const it of issues) it.cardId = it.cardId ?? cardId;
    return { card: issues.some((i) => i.severity === 'error') ? null : card, issues };
  };

  const split = splitCardFrontmatter(raw);
  if (!split) {
    err('카드 frontmatter(--- 블록)가 없음');
    return done(null);
  }

  const { value: fm, errors: yamlErrors } = parseMiniYaml(split.fm);
  for (const e of yamlErrors) err(`frontmatter 문법 오류: ${e}`);

  // ── 최상위 필드 ────────────────────────────────────────────────────────────
  for (const k of Object.keys(fm)) {
    if (!KNOWN_TOP_KEYS.has(k)) warn(`알 수 없는 필드 "${k}" — 무시됨(오타?)`, k);
  }

  const sv = fm.schemaVersion ?? 1;
  if (sv !== 1) err(`지원하지 않는 schemaVersion: ${JSON.stringify(sv)} (지원: 1)`, 'schemaVersion');

  const id = asTrimmedString(fm.id);
  if (!id) err('필수 필드 id 누락', 'id');
  else if (!ID_RE.test(id)) err(`id는 kebab-case여야 함 — "${id}"`, 'id');
  else {
    cardId = id;
    if (opts.expectedId && id !== opts.expectedId) {
      err(`id("${id}")가 파일명 유래 id("${opts.expectedId}")와 불일치`, 'id');
    }
  }

  const title = asTrimmedString(fm.title);
  if (!title) err('필수 필드 title 누락', 'title');

  const icon = asTrimmedString(fm.icon) ?? '🃏';

  // ── triggers ──────────────────────────────────────────────────────────────
  let triggers: string[] = [];
  if (fm.triggers === undefined) {
    err('필수 필드 triggers 누락', 'triggers');
  } else {
    const arr = asStringArray(fm.triggers);
    if (!arr || arr.length === 0) {
      err('triggers는 비어있지 않은 문자열 배열이어야 함', 'triggers');
    } else {
      const seen = new Set<string>();
      for (const t of arr) {
        const key = t.toLowerCase();
        if (seen.has(key)) warn(`카드 내 중복 트리거 "${t}" — 하나만 유지`, 'triggers');
        else {
          seen.add(key);
          triggers.push(t);
          // 한 글자 트리거는 그리디 단일어 오탐원([offline-retrieval-ranking] 교훈) — 매칭기가 무시한다.
          if (t.replace(/\s+/g, '').length < 2) {
            warn(`한 글자 트리거 "${t}"는 오탐 위험으로 매칭에서 무시됨 — 복합어로 바꾸세요`, 'triggers');
          }
        }
      }
    }
  }

  // ── preconditions ─────────────────────────────────────────────────────────
  const preconditions: TPrecondition[] = [];
  if (fm.preconditions !== undefined) {
    const arr = asStringArray(fm.preconditions);
    if (!arr) {
      err('preconditions는 문자열 배열이어야 함', 'preconditions');
    } else {
      for (const p of arr) {
        if ((PRECONDITIONS as readonly string[]).includes(p)) preconditions.push(p as TPrecondition);
        else err(`알 수 없는 precondition "${p}" (지원: ${PRECONDITIONS.join(', ')})`, 'preconditions');
      }
    }
  }

  // ── slots ─────────────────────────────────────────────────────────────────
  const slots: IActionCardSlot[] = [];
  if (fm.slots !== undefined) {
    if (!Array.isArray(fm.slots)) {
      err('slots는 리스트여야 함', 'slots');
    } else {
      const names = new Set<string>();
      fm.slots.forEach((s, idx) => {
        const f = `slots[${idx}]`;
        if (!isMap(s)) { err('슬롯 항목은 객체여야 함', f); return; }
        for (const k of Object.keys(s)) {
          if (!KNOWN_SLOT_KEYS.has(k)) warn(`알 수 없는 슬롯 필드 "${k}" — 무시됨`, `${f}.${k}`);
        }
        const name = asTrimmedString(s.name);
        if (!name || !SLOT_NAME_RE.test(name)) { err('슬롯 name 누락 또는 식별자 형식 아님', `${f}.name`); return; }
        if (names.has(name)) { err(`중복 슬롯 이름 "${name}"`, `${f}.name`); return; }
        names.add(name);
        const source = asTrimmedString(s.source);
        if (!source || !(SLOT_SOURCES as readonly string[]).includes(source)) {
          err(`슬롯 source 누락 또는 미지원 값 "${source ?? ''}" (지원: ${SLOT_SOURCES.join(', ')})`, `${f}.source`);
          return;
        }
        const slot: IActionCardSlot = {
          name,
          label: asTrimmedString(s.label) ?? name,
          source: source as TSlotSource,
        };
        const options = s.options !== undefined ? asStringArray(s.options) : undefined;
        if (source === 'enum') {
          if (!options || options.length === 0) { err(`enum 슬롯 "${name}"에 options 필요`, `${f}.options`); return; }
          slot.options = options;
        } else if (s.options !== undefined) {
          warn(`슬롯 "${name}": options는 enum 소스 전용 — 무시됨`, `${f}.options`);
        }
        if (s.prefillFrom !== undefined) {
          if (s.prefillFrom === 'query') slot.prefillFrom = 'query';
          else warn(`슬롯 "${name}": 알 수 없는 prefillFrom "${String(s.prefillFrom)}" — 프리필 생략`, `${f}.prefillFrom`);
        }
        const pattern = asTrimmedString(s.pattern);
        if (pattern) {
          // 깨진 정규식이 런타임(입력 검증)에서 터지지 않도록 로드 시점에 컴파일해 본다.
          try {
            new RegExp(pattern);
            slot.pattern = pattern;
          } catch (e) {
            err(`슬롯 "${name}"의 pattern이 올바른 정규식이 아님: ${e instanceof Error ? e.message : String(e)}`, `${f}.pattern`);
            return;
          }
        }
        const hint = asTrimmedString(s.hint);
        if (hint) slot.hint = hint;
        if (hint && !pattern) warn(`슬롯 "${name}": hint는 pattern과 함께 쓸 때만 표시됨`, `${f}.hint`);
        slots.push(slot);
      });
    }
  }

  // ── action ────────────────────────────────────────────────────────────────
  let action: IActionSpec | null = null;
  if (!isMap(fm.action)) {
    err('필수 필드 action 누락(또는 객체 아님)', 'action');
  } else {
    const a = fm.action;
    for (const k of Object.keys(a)) {
      if (!KNOWN_ACTION_KEYS.has(k)) warn(`알 수 없는 action 필드 "${k}" — 무시됨`, `action.${k}`);
    }
    const type = asTrimmedString(a.type);
    if (!type || !(ACTION_TYPES as readonly string[]).includes(type)) {
      err(`action.type 누락 또는 미지원 값 "${type ?? ''}" (지원: ${ACTION_TYPES.join(', ')})`, 'action.type');
    } else {
      action = { type: type as TActionType };
      if (a.template !== undefined) action.template = asTrimmedString(a.template) ?? undefined;
      if (a.doc !== undefined) action.doc = asTrimmedString(a.doc) ?? undefined;
      if (a.command !== undefined) action.command = asTrimmedString(a.command) ?? undefined;
      if (a.binding !== undefined) action.binding = asTrimmedString(a.binding) ?? undefined;
      if (a.outputs !== undefined) {
        const arr = asStringArray(a.outputs);
        if (!arr) {
          err('action.outputs는 문자열 배열이어야 함 (예: "+ src/.../{{name}}.tsx")', 'action.outputs');
        } else {
          const outputs: ITemplateOutput[] = [];
          arr.forEach((line, idx) => {
            const m = line.match(OUTPUT_RE);
            if (!m) {
              err(`outputs[${idx}] 형식 오류 — "+ 경로" 또는 "± 경로 (설명)" 형식이어야 함: "${line}"`, 'action.outputs');
              return;
            }
            outputs.push({ path: m[2], kind: m[1] === '+' ? 'create' : 'modify', ...(m[3] ? { note: m[3] } : {}) });
          });
          action.outputs = outputs;
        }
      }
      // type별 요구 필드
      if (type === 'doc' && !action.doc) err('doc 카드는 action.doc(문서 id) 필요', 'action.doc');
      if (type === 'command' && !action.command) err('command 카드는 action.command(명령 id) 필요', 'action.command');
      // binding 카드의 미리보기·실행은 전부 호스트가 id로 해석한다 — id가 없으면 아무 것도 못 한다.
      if (type === 'binding' && !action.binding) err('binding 카드는 action.binding(바인딩 레시피 id) 필요', 'action.binding');
      if (type === 'template' && (!action.outputs || action.outputs.length === 0)) {
        warn('template 카드에 action.outputs 없음 — 계획 카드 미리보기가 비게 됨', 'action.outputs');
      }
    }
  }

  // ── priority ──────────────────────────────────────────────────────────────
  let priority = 10;
  if (fm.priority !== undefined) {
    if (typeof fm.priority === 'number') priority = fm.priority;
    else warn(`priority는 숫자여야 함 — 기본값 10 사용`, 'priority');
  }

  // ── 본문: 설명·골격 ────────────────────────────────────────────────────────
  const description = extractDescription(split.body);
  const skeleton = firstFenceContent(split.body) ?? undefined;
  if (action?.type === 'recipe' && !skeleton) {
    err('recipe 카드는 본문에 골격 코드펜스(```)가 필요', 'body');
  }

  // ── 플레이스홀더 ↔ 슬롯 교차 검증 (카드 lint의 씨앗) ──────────────────────
  if (action) {
    const surfaces: string[] = [];
    if (action.type === 'recipe' && skeleton) surfaces.push(skeleton);
    if (action.outputs) surfaces.push(...action.outputs.map((o) => o.path));
    const used = new Set<string>();
    for (const s of surfaces) {
      for (const m of s.matchAll(PLACEHOLDER_RE)) used.add(m[1]);
    }
    const declared = new Set(slots.map((s) => s.name));
    for (const u of used) {
      if (!declared.has(u)) err(`플레이스홀더 {{${u}}}에 대응하는 슬롯 선언 없음 — 치환 불가`, 'slots');
    }
    // 미사용 슬롯 경고는 recipe만: template 슬롯은 플레이스홀더 없이 실행기가 소비할 수 있고
    // (예: 페이지 유형 enum), doc/command 슬롯은 인자로 전달된다.
    if (action.type === 'recipe') {
      for (const d of declared) {
        if (!used.has(d)) warn(`슬롯 "${d}"가 골격 어디에서도 쓰이지 않음`, 'slots');
      }
    }
  }

  if (!id || !title || !action) return done(null);

  const card: IActionCard = {
    schemaVersion: 1,
    id, title, icon, triggers, preconditions, slots, action, priority, description,
    ...(skeleton !== undefined ? { skeleton } : {}),
    layer: opts.layer ?? 'builtin',
    ...(opts.sourcePath ? { sourcePath: opts.sourcePath } : {}),
  };
  return done(card);
}

/**
 * 카탈로그 수준 트리거 충돌 검사 (§4 규칙 1의 "트리거 중복", §5 계층 정책).
 *  - 같은 계층 안의 중복 → error (나중 카드를 비활성할 근거 — 정책 적용은 로더 몫)
 *  - 다른 계층 간 중복 → warning (상위 계층이 의도적으로 덮는 경우가 정상 — 예: 프로젝트
 *    카드가 내장 카드의 트리거를 가로챔. 정렬은 계층 가중치로 해소)
 */
export function findTriggerCollisions(cards: IActionCard[]): ICardIssue[] {
  const issues: ICardIssue[] = [];
  const byTrigger = new Map<string, IActionCard[]>();
  for (const card of cards) {
    for (const t of card.triggers) {
      const key = t.toLowerCase();
      const list = byTrigger.get(key) ?? [];
      list.push(card);
      byTrigger.set(key, list);
    }
  }
  for (const [trigger, owners] of byTrigger) {
    if (owners.length < 2) continue;
    const sameLayer = new Map<string, IActionCard[]>();
    for (const c of owners) {
      const list = sameLayer.get(c.layer) ?? [];
      list.push(c);
      sameLayer.set(c.layer, list);
    }
    for (const [layer, group] of sameLayer) {
      if (group.length >= 2) {
        for (const c of group.slice(1)) {
          issues.push({
            severity: 'error', cardId: c.id, sourcePath: c.sourcePath, field: 'triggers',
            message: `트리거 "${trigger}"가 같은 계층(${layer})의 "${group[0].id}"와 충돌`,
          });
        }
      }
    }
    const layers = [...sameLayer.keys()];
    if (layers.length >= 2) {
      const ids = owners.map((c) => `${c.id}(${c.layer})`).join(', ');
      issues.push({
        severity: 'warning', field: 'triggers',
        message: `트리거 "${trigger}"가 계층 간 공유됨: ${ids} — 상위 계층이 정렬에서 우선`,
      });
    }
  }
  return issues;
}
