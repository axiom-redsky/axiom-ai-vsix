import { KeywordRetriever } from './KeywordRetriever';
import { FileContextRetriever } from './FileContextRetriever';
import { RagRetriever } from './RagRetriever';
import type { ExternalCorpus } from './ExternalCorpusLoader';
import {
  formatSectionsAsDocs,
  selectByBudget,
  tokenizeQuery,
  type MdSection,
} from './SectionExtractor';

/** buildContext() 반환 타입 */
export interface RagContext {
  /** 최종 선택된 문서 내용 목록 (출처별로 그룹화된 섹션 블록) */
  docs: string[];
  /** 문서 선택에 사용된 방법 (디버깅용) */
  methods: ('keyword' | 'context' | 'embedding')[];
}

/**
 * 시스템 프롬프트에 주입할 RAG 문서 전체 글자 수 예산.
 * 6500자 ≈ 2.5K~3K 토큰. 라우팅된 핵심 패턴 문서(useApi 예시 등)가 잘리지 않을 정도로 확보한다.
 */
const RAG_CHAR_BUDGET = 6500;

/** 임베딩 검색 최대 대기 시간(ms) — 초과 시 결과 없이 진행 */
const EMBEDDING_TIMEOUT_MS = 2000;

/** 임베딩 폴백 1개 청크당 허용 글자 수 (너무 긴 청크가 예산을 독식하지 않게) */
const EMBEDDING_CHUNK_MAX_CHARS = 1200;

/**
 * 라우팅 신호 점수 보너스 — 의도가 명확히 라우팅된 섹션이
 * 단순 토큰 우연 매칭 섹션을 이기도록 강제한다.
 *
 * - 키워드 라우팅(_index.md 매칭): 쿼리 어휘 ↔ 사전 정의 키워드 일치 → +5
 * - 파일 컨텍스트(경로·import 분석): 현재 편집 중인 파일이 직접 의존 → +8 (더 강한 신호)
 */
const KEYWORD_ROUTE_BONUS = 5;
const FILE_CONTEXT_ROUTE_BONUS = 8;

/**
 * 3-레이어 하이브리드 RAG 엔진.
 *
 * 1. Method 1 (KeywordRetriever): _index.md 키워드 라우팅
 * 2. Method 3 (FileContextRetriever): 현재 파일 경로·import 분석
 * 3. Method 2 (RagRetriever): 임베딩 코사인 유사도 폴백
 *
 * 파일 전체가 아닌 **섹션 단위**로 후보를 모은 뒤,
 * 쿼리 적합도 점수와 글자 수 예산을 기반으로 상위 섹션만 선택한다.
 */
export class HybridRagEngine {
  private readonly _keywordRetriever = new KeywordRetriever();
  private readonly _fileContextRetriever = new FileContextRetriever();
  private readonly _ragRetriever = new RagRetriever();
  /** Method 3 결과 캐시: 동일 파일 반복 질문 시 .rag/ 재탐색 생략 */
  private readonly _fileContextCache = new Map<string, MdSection[]>();

  /**
   * .rag/ 디렉터리를 기준으로 각 Retriever를 초기화하고
   * 임베딩 인덱스 빌드를 백그라운드에서 시작한다.
   *
   * @param ragDir          내장 .rag/ 경로
   * @param extraDirs       사용자 지정 추가 폴더 경로 목록
   * @param extraFiles      사용자 지정 개별 파일 경로 목록
   * @param externalCorpora 외부 corpus 로드 결과 목록
   */
  initialize(
    ragDir: string,
    extraDirs: string[] = [],
    extraFiles: string[] = [],
    externalCorpora: ExternalCorpus[] = []
  ): void {
    this._keywordRetriever.initialize(ragDir);
    this._fileContextRetriever.initialize(ragDir);

    for (const corpus of externalCorpora) {
      this._keywordRetriever.mergeExternalIndex(corpus.indexEntries, corpus.ragDir);
      this._fileContextRetriever.addExternalRagDir(corpus.ragDir);
    }

    const allExtraFiles = [
      ...extraFiles,
      ...externalCorpora.flatMap((c) => c.validFiles),
    ];

    this._ragRetriever.buildIndex(ragDir, extraDirs, allExtraFiles).catch((err) => {
      console.error('[axiom-ai] RAG 임베딩 인덱스 빌드 실패:', err);
    });
  }

  /** 임베딩 인덱스를 초기화하고 다음 initialize() 시 재빌드하도록 한다. */
  invalidate(): void {
    this._ragRetriever.reset();
    this._fileContextCache.clear();
  }

  /**
   * 사용자 질문과 현재 파일 컨텍스트를 기반으로 관련 문서를 수집한다.
   *
   * 수집 순서:
   * 1. Method 1 + Method 3 병렬 실행 → 섹션 후보 수집 (중복 제거)
   * 2. 글자 수 예산이 남으면 Method 2 (임베딩) 폴백으로 보충
   * 3. 점수 + 예산 기반으로 최종 섹션 선택
   */
  async buildContext(
    userQuery: string,
    filePath: string,
    fileContent: string
  ): Promise<RagContext> {
    const methods: RagContext['methods'] = [];
    const queryTokens = tokenizeQuery(userQuery);

    // Method 1: 키워드 라우팅 → 섹션 단위로 분할 + 점수
    const kwFiles = this._keywordRetriever.matchedFiles(userQuery);
    const kwSections = this._keywordRetriever.readSections(kwFiles, queryTokens);
    if (kwSections.length > 0) methods.push('keyword');

    // Method 3: 파일 컨텍스트 분석 (캐시 활용)
    const cacheKey = `${filePath}:${fileContent.length}:${fileContent.slice(0, 80)}:${queryTokens.join(',')}`;
    let ctxSections: MdSection[];
    if (this._fileContextCache.has(cacheKey)) {
      ctxSections = this._fileContextCache.get(cacheKey)!;
    } else {
      const ctxFiles = this._fileContextRetriever.matchedFiles(filePath, fileContent);
      ctxSections = this._fileContextRetriever.readSections(ctxFiles, queryTokens);
      if (this._fileContextCache.size >= 8) {
        this._fileContextCache.delete(this._fileContextCache.keys().next().value!);
      }
      this._fileContextCache.set(cacheKey, ctxSections);
    }
    if (ctxSections.length > 0) methods.push('context');

    // 라우팅 신호 보너스 적용 — 새 객체로 복사해 캐시 안전성 보장
    // (ctxSections는 캐시에 보관되므로 in-place 수정 시 누적 가산되는 사고 방지)
    const boostedKw = kwSections.map((s) => ({ ...s, score: s.score + KEYWORD_ROUTE_BONUS }));
    const boostedCtx = ctxSections.map((s) => ({ ...s, score: s.score + FILE_CONTEXT_ROUTE_BONUS }));

    // 동일 (출처+헤더) 중복 제거 — 두 Retriever가 같은 파일을 가리킬 수 있음
    const merged = this._dedupeSections([...boostedKw, ...boostedCtx]);

    // 라우팅된 source별로 점수 최고 섹션 1개를 우선 확보
    // → useApi 예시 같은 핵심 섹션이 다른 doc의 우연 매칭에 묻혀 사라지는 사고 방지
    const { reserved, rest } = this._reserveTopPerSource(merged);
    const reservedChars = reserved.reduce((sum, s) => sum + s.length, 0);
    let selected: MdSection[];
    if (reservedChars >= RAG_CHAR_BUDGET) {
      // 예약만으로 예산 초과 → 예약 안에서 점수·길이 기준 재선택
      selected = selectByBudget(reserved, RAG_CHAR_BUDGET);
    } else {
      const extra = selectByBudget(rest, RAG_CHAR_BUDGET - reservedChars);
      selected = [...reserved, ...extra];
    }
    let usedChars = selected.reduce((sum, s) => sum + s.length, 0);

    // 예산이 충분히 남아 있으면 Method 2 (임베딩) 폴백으로 보충
    const remainingBudget = RAG_CHAR_BUDGET - usedChars;
    if (remainingBudget >= 600) {
      const embeddingResult = await Promise.race([
        this._ragRetriever.retrieve(userQuery),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), EMBEDDING_TIMEOUT_MS)),
      ]);
      if (embeddingResult) {
        const embeddingSections = this._embeddingResultToSections(embeddingResult, queryTokens);
        // 이미 선택된 섹션과 동일 (출처+헤더) 중복은 제외
        const seen = new Set(selected.map((s) => `${s.source}|${s.header}`));
        const fresh = embeddingSections.filter((s) => !seen.has(`${s.source}|${s.header}`));
        if (fresh.length > 0) {
          const extra = selectByBudget(fresh, remainingBudget);
          if (extra.length > 0) {
            selected = [...selected, ...extra];
            usedChars += extra.reduce((sum, s) => sum + s.length, 0);
            methods.push('embedding');
          }
        }
      }
    }

    return {
      docs: formatSectionsAsDocs(selected),
      methods,
    };
  }

  /**
   * 라우팅된 source별로 점수 최고 섹션 1개를 예약(reserved)으로 떼어내고,
   * 나머지(rest)를 글로벌 경쟁용으로 분리해 반환한다.
   *
   * 글로벌 selectByBudget만 쓰면 한 doc의 여러 섹션이 다른 doc의 핵심 섹션을
   * 밀어내고 예산을 독점하는 일이 생긴다. source당 1섹션을 우선 확보해
   * 라우팅된 모든 doc이 최소 1개의 대표 섹션은 컨텍스트에 들어가도록 보장한다.
   */
  private _reserveTopPerSource(sections: MdSection[]): {
    reserved: MdSection[];
    rest: MdSection[];
  } {
    const bySource = new Map<string, MdSection[]>();
    for (const s of sections) {
      const list = bySource.get(s.source) ?? [];
      list.push(s);
      bySource.set(s.source, list);
    }
    const reserved: MdSection[] = [];
    const rest: MdSection[] = [];
    for (const list of bySource.values()) {
      list.sort((a, b) => b.score - a.score);
      reserved.push(list[0]);
      rest.push(...list.slice(1));
    }
    return { reserved, rest };
  }

  /** (출처 + 헤더) 기준으로 중복 섹션을 제거한다. 더 높은 점수의 섹션을 유지한다. */
  private _dedupeSections(sections: MdSection[]): MdSection[] {
    const map = new Map<string, MdSection>();
    for (const section of sections) {
      const key = `${section.source}|${section.header}`;
      const existing = map.get(key);
      if (!existing || section.score > existing.score) {
        map.set(key, section);
      }
    }
    return [...map.values()];
  }

  /**
   * RagRetriever.retrieve() 가 반환한 '\n\n---\n\n'로 합쳐진 청크 문자열을
   * 섹션 후보로 변환한다. 각 청크는 이미 헤더 단위로 잘려 있다.
   */
  private _embeddingResultToSections(raw: string, queryTokens: string[]): MdSection[] {
    const parts = raw.split('\n\n---\n\n').filter((p) => p.trim());
    const sections: MdSection[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // 첫 줄을 source 헤더로 가정 ("## [path]")
      const firstLine = trimmed.split('\n')[0];
      const sourceMatch = firstLine.match(/^##\s+\[([^\]]+)\]/);
      const source = sourceMatch ? sourceMatch[1] : 'embedding';
      const body = sourceMatch ? trimmed.slice(firstLine.length).trim() : trimmed;
      const truncated = body.length > EMBEDDING_CHUNK_MAX_CHARS
        ? body.slice(0, EMBEDDING_CHUNK_MAX_CHARS)
        : body;

      // 임베딩 결과는 이미 의미 유사도로 선별된 청크이므로 점수 기본값을 부여한다.
      let score = 2;
      const lower = truncated.toLowerCase();
      for (const token of queryTokens) {
        if (token && lower.includes(token)) score += 1;
      }

      sections.push({
        source,
        header: '',
        body: truncated,
        length: truncated.length,
        score,
      });
    }
    return sections;
  }
}
