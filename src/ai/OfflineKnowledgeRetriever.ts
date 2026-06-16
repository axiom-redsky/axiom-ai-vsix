/**
 * 오프라인 지식 검색기(OfflineKnowledgeRetriever) — **오프라인 응답 전용**.
 *
 * 온라인 경로(`buildContext`)는 절대 호출하지 않는다(공유 스코어러·예산 기계 미사용).
 *
 * 설계(2단계):
 *  - **Stage 1 검색**: 키워드(정밀) + 임베딩(의미, 로컬) + 파일컨텍스트(선택) source 문서 합집합.
 *    청크를 고르지 않고 **문서를 통째로** 로드한다 → "맞는 문서, 틀린 청크" 실패 모드 소멸.
 *  - **Stage 2 렌더**: 확정 intent + 문서 `kind`로 결정론 렌더. show-code 의도면
 *    example/source 문서를 앞으로 끌어와 코드가 빠지지 않게 한다. frontmatter는 떼고 본문 통째.
 *
 * 어휘 점수 보정 상수(도입부+1·reserveTopPerSource·restFloor·maxSources·charBudget)를 쓰지 않는다.
 * 문서 수 상한(MAX_DOCS)만 둔다 — 오프라인 출력은 사람이 읽는 화면이라 예산 제약이 없다.
 *
 * vscode/fs 비의존 — source 검색·문서 로드를 모두 주입(IOfflineKnowledgeDeps)으로 받는다.
 */

import type { IntentResult } from './IntentClassifier';
import { parseKnowledgeDoc, type KnowledgeDoc, type KnowledgeKind } from './KnowledgeDoc';

/** OfflineKnowledgeRetriever가 외부 자원에 접근하기 위한 주입 의존성. */
export interface IOfflineKnowledgeDeps {
  /** 키워드 정밀 라우팅 결과 source 경로(정확 용어 매칭 보장). */
  keywordSources: (query: string) => string[];
  /** 로컬 임베딩 유사도 순 source 경로(의미 검색). 인덱스 미준비 시 빈 배열. */
  semanticSources: (query: string) => Promise<string[]>;
  /** 현재 파일 내용 기반 라우팅 source 경로(import 등). fileContent 없으면 호출부가 빈 배열. */
  fileContextSources: (fileContent: string) => string[];
  /** source 경로의 원시 마크다운을 로드(없으면 null). */
  loadDoc: (source: string) => string | null;
}

/** 한 응답에 노출할 최대 문서 수. 오프라인은 예산이 없어 recall 우선(2~3개). */
const MAX_DOCS = 3;

/**
 * 단일 문서 본문 안전 상한(자). 저자 문서는 보통 이하지만, 비정상적으로 큰 문서가
 * 화면을 독점하지 않도록 코드블록 경계에서 자르는 안전 밸브.
 */
const PER_DOC_CHAR_CAP = 8000;

/** "예제·코드·샘플 보여달라"는 show-code 의도 신호 토큰(오프라인 전용 판정). */
const SHOW_CODE_TOKENS = ['예제', 'example', '샘플', 'sample', '코드', 'code', '보여', '사용법', '사용 예'];

/** 쿼리에 show-code 의도가 있는지(코드가 곧 답인 요청). */
export function hasShowCodeIntent(query: string): boolean {
  const q = query.toLowerCase();
  return SHOW_CODE_TOKENS.some((t) => q.includes(t));
}

export class OfflineKnowledgeRetriever {
  constructor(private readonly _deps: IOfflineKnowledgeDeps) {}

  /**
   * 쿼리·intent에 맞는 scaffold 지식 문서들을 (출처 헤더 포함) 마크다운 블록 배열로 반환한다.
   * OfflineResponder가 `\n\n---\n\n`로 이어 "관련 scaffold 지식" 섹션을 만든다.
   * 매칭 문서가 없으면 빈 배열(호출부가 섹션 자체를 생략).
   */
  async retrieve(query: string, intent: IntentResult, fileContent = ''): Promise<string[]> {
    // Stage 1: 후보 source 수집 — 키워드(정밀) → 파일컨텍스트 → 임베딩(의미) 순서로 합집합.
    const keyword = this._deps.keywordSources(query);
    const fileCtx = fileContent ? this._deps.fileContextSources(fileContent) : [];
    let semantic: string[] = [];
    try {
      semantic = await this._deps.semanticSources(query);
    } catch {
      semantic = [];
    }

    const orderedSources = dedupe([...keyword, ...fileCtx, ...semantic]);
    if (orderedSources.length === 0) return [];

    // 문서 로드 + 파싱(통째)
    const docs: KnowledgeDoc[] = [];
    for (const src of orderedSources) {
      const raw = this._deps.loadDoc(src);
      if (raw) docs.push(parseKnowledgeDoc(src, raw));
    }
    if (docs.length === 0) return [];

    // Stage 1.5: intent×kind 바이어스(점수기 아닌 2버킷 안정 재정렬)
    const ranked = this._biasByIntent(docs, query);

    // Stage 2: 상위 MAX_DOCS개를 종류별 결정론 렌더
    return ranked.slice(0, MAX_DOCS).map((d) => this._render(d));
  }

  /**
   * show-code 의도면 코드가 답인 문서(example/source)를 **안정 정렬로 앞으로** 끌어온다.
   * 그 외 의도는 Stage 1 검색 순서(정밀→의미)를 그대로 존중한다. 순위는 미리 알 수 없으므로
   * 점수 합산 대신 검색 순서 + 의도 버킷이라는 설명 가능한 규칙만 쓴다.
   */
  private _biasByIntent(docs: KnowledgeDoc[], query: string): KnowledgeDoc[] {
    if (!hasShowCodeIntent(query)) return docs;
    const codeFirst = (k: KnowledgeKind): boolean => k === 'example' || k === 'source';
    const head = docs.filter((d) => codeFirst(d.kind));
    const tail = docs.filter((d) => !codeFirst(d.kind));
    return [...head, ...tail];
  }

  /**
   * 문서를 종류와 무관하게 **frontmatter를 뗀 본문 통째**로 렌더한다(출처 헤더 포함).
   * 종류는 Stage 1.5 정렬 우선순위에만 쓰고, 렌더는 "답을 자르지 않는다"는 원칙을 따른다.
   * 안전 상한을 넘는 비정상 문서만 코드블록 경계에서 자른다.
   */
  private _render(doc: KnowledgeDoc): string {
    let body = doc.body;
    if (body.length > PER_DOC_CHAR_CAP) {
      body = truncateAtCodeBoundary(body, PER_DOC_CHAR_CAP);
    }
    return `## [${doc.source}]\n\n${body}`;
  }
}

/** 첫 등장 순서를 보존하며 중복 제거. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}

/**
 * 본문을 상한 근처에서 자르되, 코드블록 한가운데서 끊기지 않게 마지막 완결 펜스 또는
 * 직전 줄바꿈 경계까지만 남긴다. 잘렸음을 알리는 표시를 덧붙인다.
 */
function truncateAtCodeBoundary(body: string, cap: number): string {
  const head = body.slice(0, cap);
  // 펜스 개수가 홀수면 코드블록 안에서 잘린 것 → 마지막 펜스 앞까지 되돌린다.
  const fenceCount = (head.match(/```/g) ?? []).length;
  let cut = head;
  if (fenceCount % 2 === 1) {
    cut = head.slice(0, head.lastIndexOf('```'));
  }
  const nl = cut.lastIndexOf('\n');
  if (nl > cap * 0.5) cut = cut.slice(0, nl);
  return `${cut.trim()}\n\n> …(문서가 길어 일부만 표시)`;
}
