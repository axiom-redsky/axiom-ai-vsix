/**
 * 영역 편집 "실패 자동 포집" — 플라이휠 연료(실제 실패 분포)를 마찰 0으로 코퍼스화한다.
 *
 * 설계 원칙(폐쇄망 안전):
 *  - **포집 ≠ 회수.** 이 모듈은 텔레메트리(phone-home)가 **아니다**. 네트워크를 전혀 쓰지 않고
 *    로컬 파일에 JSONL 한 줄씩 append 할 문자열만 만든다. 폐쇄망에서도 그대로 동작한다.
 *  - **회수(개발자에게 되돌리기)는 별개 문제** — 폐쇄망은 반출이 통제되므로, 반출 심사를 통과할 수 있게
 *    **redaction 모드**를 내장한다. 무엇을 남길지는 3단계로 고른다:
 *      · 'full'     : 원본 소스 그대로(개발자 자기 dogfooding 전용 — 재현 충실도 100%).
 *      · 'skeleton' : 구조(태그·prop·식별자)는 남기고 **문자열/숫자/한글 리터럴을 마스킹**
 *                     (업무 데이터·문구 제거. ⚠ 한글 라벨을 지우므로 locate 재현 충실도는 낮아짐 —
 *                      "구조적 실패"엔 유용, "텍스트 앵커 실패"엔 부분적).
 *      · 'meta'     : 소스 미포함. 쿼리·게이트·상태만 → 저민감도라 반출 쉬움.
 *                     재현은 못 해도 **"어느 실패가 자주 나나"(분포)**를 준다 = 우선순위 계기판.
 *
 * 이 모듈은 vscode/fs 를 import 하지 않는다(순수 함수) — 단위 테스트 가능. 파일 쓰기·저장 위치는
 * 호출부(provider)가 결정해 serializeCaptureLine() 결과를 append 한다.
 */

/** 반출 민감도 3단계(위 설명 참조). */
export type CaptureRedaction = 'full' | 'skeleton' | 'meta';

/** 포집 대상 결과 상태(RegionEditOutcome.status 와 동일 어휘). */
export type CaptureStatus = 'applied' | 'fallback' | 'error';

/** 코퍼스에 append 되는 한 줄(JSONL). 나중에 EvalCase 로 손쉽게 변환 가능한 필드 구성. */
export interface IRegionCaptureEntry {
  /** ISO 타임스탬프(호출부가 주입 — 순수성 유지). */
  ts: string;
  /** 안정적 식별자: 파일 basename + 쿼리 해시(중복 포집 dedupe·변환 시 fixture 키). */
  id: string;
  /** 사용자 요청 원문. */
  query: string;
  /** 파일 **basename만**(전체 경로 유출 최소화). */
  file: string;
  status: CaptureStatus;
  /** 폴백/에러 사유(게이트명 등). */
  reason?: string;
  /** classifyRegionDecline UX 분류(fallback 일 때). */
  ux?: string;
  /** 편집 영역 라인 범위(있으면). */
  region?: { start: number; end: number };
  /** 적용된 redaction 모드(반출 심사 근거). */
  redaction: CaptureRedaction;
  /** redaction 에 따른 소스(full=원본 / skeleton=마스킹 / meta=미포함). */
  source?: string;
  /** 사람이 읽는 진단 한 줄(outcome.diagnostics). */
  diagnostics?: string;
}

/** 포집 입력 — 호출부가 region 편집 직후 넘기는 원자료. */
export interface IRegionCaptureInput {
  query: string;
  filePath: string;
  source: string;
  status: CaptureStatus;
  reason?: string;
  ux?: string;
  region?: { start: number; end: number };
  diagnostics?: string;
}

/** 경로 유출 방지 — basename만(win/posix 양쪽 구분자). */
export function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** 짧고 안정적인 해시(djb2, 16진 8자리) — id·dedupe용(암호학 아님). */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * 스켈레톤화 — 구조는 남기고 **업무 데이터·문구**를 지운다. 반출용 중간 민감도.
 *  ① 문자열/템플릿 리터럴 내용 → '…'(따옴표·백틱은 유지해 구문 보존)
 *  ② 2자리 이상 숫자 → '0'(단자리·식별자 내 숫자는 유지해 구조 보존)
 *  ③ 남은 한글 런(주석·JSX 텍스트) → 'ㅁ'
 * ⚠ 한글을 지우므로 한글 앵커 기반 locate 재현엔 손실이 있다(구조 실패엔 충분).
 */
export function skeletonizeSource(src: string): string {
  return src
    // 문자열 리터럴('...' / "...") — 이스케이프 포함 최소 매칭
    .replace(/'(?:[^'\\]|\\.)*'/g, "'…'")
    .replace(/"(?:[^"\\]|\\.)*"/g, '"…"')
    // 템플릿 리터럴 — 내부 ${} 표현식은 살리고 순수 텍스트만 마스킹하기 어렵다 → 통째 '…'
    .replace(/`(?:[^`\\]|\\.)*`/g, '`…`')
    // 2자리 이상 숫자
    .replace(/\b\d{2,}\b/g, '0')
    // 남은 한글 런(리터럴 밖의 JSX 텍스트·주석)
    .replace(/[가-힣]+/g, 'ㅁ');
}

/** 입력 + redaction 모드로 코퍼스 엔트리를 조립(순수·결정론). */
export function buildCaptureEntry(
  input: IRegionCaptureInput,
  nowIso: string,
  redaction: CaptureRedaction,
): IRegionCaptureEntry {
  const file = baseName(input.filePath);
  const id = `${file.replace(/\.[jt]sx?$/, '')}-${shortHash(`${file}|${input.query}`)}`;
  const entry: IRegionCaptureEntry = {
    ts: nowIso,
    id,
    query: input.query,
    file,
    status: input.status,
    redaction,
  };
  if (input.reason) entry.reason = input.reason;
  if (input.ux) entry.ux = input.ux;
  if (input.region) entry.region = input.region;
  if (input.diagnostics) entry.diagnostics = input.diagnostics;
  if (redaction === 'full') entry.source = input.source;
  else if (redaction === 'skeleton') entry.source = skeletonizeSource(input.source);
  // 'meta' → source 미포함
  return entry;
}

/** JSONL 한 줄(append 대상). */
export function serializeCaptureLine(entry: IRegionCaptureEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/**
 * 이 상태를 포집할지 판정. 기본은 **실패(fallback/error)만** — "실패 자동 포집"의 취지.
 * captureApplied=true 면 성공(applied)도 포집(전체 분포·"적용됐지만 실은 틀림" 후분석용).
 */
export function shouldCapture(status: CaptureStatus, captureApplied: boolean): boolean {
  if (status === 'fallback' || status === 'error') return true;
  return status === 'applied' && captureApplied;
}
