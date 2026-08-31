/**
 * 행동 카드(Action Card) 스키마 — 오프라인 추천 카드의 데이터 계약.
 *
 * 계획: docs/offline-action-cards-plan.md §4 (형식 확정 2026-08-28)
 * 원칙: "행동 카탈로그는 코드가 아니라 데이터" — 카드가 트리거·슬롯·행동을 스스로
 * 선언하고, 엔진(매칭→정렬→위저드→적용)은 카드 내용을 모른다.
 *
 * 파일 형식 = md + YAML frontmatter, 한 파일 = 카드 한 장(`*.card.md`).
 * frontmatter = 기계용 메타데이터(이 모듈의 타입), 본문 = 사람용 설명 + 코드 골격.
 */

/** 행동 종류 — 카드가 실행을 위임하는 결정론 실행기의 유형. */
export type TActionType = 'template' | 'recipe' | 'doc' | 'command';
export const ACTION_TYPES: readonly TActionType[] = ['template', 'recipe', 'doc', 'command'];

/**
 * 슬롯 소스 v1 — "위저드가 자동으로 채워줄 수 있는 것"의 유한 어휘 (§4 규칙 2).
 * 여길 좁게 유지해야 카드 작성 난이도가 낮다. 확장은 schemaVersion과 함께.
 *
 * 스캔 계약(무엇을 어디서 긁나):
 *  - `text`           스캔 없음. 자유 입력(InputBox). `prefillFrom: query`로 프리필 가능.
 *  - `enum`           스캔 없음. 카드가 `options:`로 선언한 고정 선택지 (예: 페이지 유형 list/form).
 *  - `domain-list`    `src/domains/*` 하위 디렉터리명 (+ 위저드가 "새 도메인" 항목 추가).
 *  - `endpoint-list`  워크스페이스 api-spec 문서에서 추출한 API 경로 목록(extractApiPaths 계열).
 *  - `component-list` ComponentPropsIndex의 컴포넌트명 목록(자동생성 인덱스).
 *
 * 스캐너 구현은 ISlotSourceProviders로 주입 — 엔진·파서는 vscode/디스크 비의존을 유지한다.
 */
export type TSlotSource = 'text' | 'enum' | 'domain-list' | 'endpoint-list' | 'component-list';
export const SLOT_SOURCES: readonly TSlotSource[] = [
  'text', 'enum', 'domain-list', 'endpoint-list', 'component-list',
];

/** 카드 노출 전제조건 v1. 미충족 카드는 매칭에서 제외된다(비활성과 다름 — 상황 필터). */
export type TPrecondition = 'file-open' | 'scaffold-detected';
export const PRECONDITIONS: readonly TPrecondition[] = ['file-open', 'scaffold-detected'];

/** 카탈로그 3계층 (§5). frontmatter가 아니라 **로더가 출처에 따라 부여**한다. */
export type TCardLayer = 'builtin' | 'project' | 'personal';

/** template 출력 항목의 종류 — 계획 카드 미리보기의 `+ 신규` / `± 수정` 행. */
export type TOutputKind = 'create' | 'modify';

/** 위저드가 수집(또는 프리필)할 슬롯 하나. */
export interface IActionCardSlot {
  /** 골격/출력 경로의 `{{name}}` 플레이스홀더와 연결되는 식별자. */
  name: string;
  /** 칩에 표시할 라벨. 미지정 시 name. */
  label: string;
  source: TSlotSource;
  /** `source: enum` 전용 — 고정 선택지. */
  options?: string[];
  /** 'query'면 사용자 문장에서 결정론 추출기로 프리필을 시도한다. */
  prefillFrom?: 'query';
  /**
   * 자유 입력 검증 정규식(source 문자열). 카드가 자기 슬롯의 규칙을 스스로 선언한다 —
   * 엔진에 슬롯별 규칙을 하드코딩하지 않기 위해(§2-3 "카탈로그는 코드가 아니라 데이터").
   * 미선언 시 source별 기본 규칙(엔드포인트 경로 형식 등)이 적용된다.
   */
  pattern?: string;
  /** 검증 실패 시 사용자에게 보여줄 안내. pattern과 짝으로 쓴다. */
  hint?: string;
}

/** template 액션이 만들/고칠 파일 하나 (계획 카드 미리보기의 원천). */
export interface ITemplateOutput {
  /** `{{slot}}` 플레이스홀더 허용. 예: `src/domains/{{domain}}/pages/{{pageName}}.tsx` */
  path: string;
  kind: TOutputKind;
  /** 부가 설명. 예: "경로 추가" */
  note?: string;
}

/** 카드가 위임하는 행동의 선언. type별로 요구 필드가 다르다(검증은 CardParser). */
export interface IActionSpec {
  type: TActionType;
  /** template: 내장 템플릿 id (예: 'page'). 실행기(Phase 1)가 해석한다. */
  template?: string;
  /** template: 출력 파일 목록 — 카드가 자기 미리보기를 스스로 제공한다 (§4 매칭 엔진). */
  outputs?: ITemplateOutput[];
  /** doc: 렌더할 지식문서 id. */
  doc?: string;
  /** command: 호출할 명령 id (VSCode command 또는 내부 위저드 id). */
  command?: string;
}

/** 파싱·검증을 통과한 카드 한 장. */
export interface IActionCard {
  schemaVersion: 1;
  /** kebab-case. 파일명(`<id>.card.md`)과 일치 강제 (§4 — 충돌 방지). */
  id: string;
  title: string;
  /** 미지정 시 '🃏'. */
  icon: string;
  /** 매칭 트리거. 한글 포함 — 매칭기는 `\b` 대신 포함/공백변형 전략을 쓴다. */
  triggers: string[];
  preconditions: TPrecondition[];
  slots: IActionCardSlot[];
  action: IActionSpec;
  /** 동점 정렬용. 클수록 우선, 기본 10. */
  priority: number;
  /** 본문 산문(코드펜스 제외) — 패널·카드에 표시. */
  description: string;
  /** recipe: 본문 첫 코드펜스 내용(슬롯 치환 후 structural apply로 삽입). */
  skeleton?: string;
  /** 로더가 부여(§5). frontmatter 필드가 아니다. */
  layer: TCardLayer;
  /** 진단·패널 표시용 원본 경로. */
  sourcePath?: string;
}

/** 카드 검증 문제 하나. error가 하나라도 있으면 그 카드만 비활성(fail-open, §4 규칙 1). */
export interface ICardIssue {
  severity: 'error' | 'warning';
  message: string;
  /** frontmatter 필드 경로 (예: 'slots[0].source'). */
  field?: string;
  cardId?: string;
  sourcePath?: string;
}

/** 파싱 결과 — error 이슈가 있으면 card=null(비활성)이지만 issues로 정체는 알 수 있다. */
export interface IParsedCard {
  card: IActionCard | null;
  issues: ICardIssue[];
}

/**
 * 슬롯 소스 스캐너 주입 계약 — VSCode 쪽이 구현하고(Phase 1), 테스트는 스텁을 넣는다.
 * 엔진은 이 인터페이스만 알며 워크스페이스 구조를 직접 긁지 않는다.
 */
export interface ISlotSourceProviders {
  /** `src/domains/*` 하위 디렉터리명. */
  listDomains(): Promise<string[]>;
  /** api-spec 문서에서 추출한 API 경로 목록. */
  listEndpoints(): Promise<string[]>;
  /** ComponentPropsIndex 컴포넌트명 목록. */
  listComponents(): Promise<string[]>;
}

// ── 매칭 엔진 출력 계약 (Phase 0 ④에서 구현, 타입은 여기 고정) ─────────────────

/**
 * 추천 표시 모드 — 확신도 게이트(top1–top2 점수 격차, §3.6)의 결과.
 *  - 'plan': 확신 높음 → 계획 카드 1장 (Enter 즉시 실행 가능)
 *  - 'list': 애매함 → 컴팩트 리스트 2~3행
 *  - 'none': 매칭 없음 → 기존 폴백(Q&A/빈손 안내)으로
 */
export type TRecommendMode = 'plan' | 'list' | 'none';

/** 카드 하나의 매칭 결과. */
export interface ICardMatch {
  card: IActionCard;
  score: number;
  /** 사용자 문장에서 실제로 맞은 트리거들 — 근거 하이라이트(§3.6 원칙 3)용. */
  matchedTriggers: string[];
  /** slot name → 프리필 값 (프리필 실패 슬롯은 키 없음). */
  prefill: Record<string, string>;
}

/** 매칭 엔진의 최종 출력 — UI(형태 A/B)가 소비한다. */
export interface IRecommendation {
  mode: TRecommendMode;
  /** 점수 내림차순 top-N (mode='plan'이면 matches[0]이 계획 카드). */
  matches: ICardMatch[];
}
