import { KeywordRetriever } from './KeywordRetriever';
import { FileContextRetriever } from './FileContextRetriever';
import { RagRetriever } from './RagRetriever';

/** buildContext() 반환 타입 */
export interface RagContext {
  /** 최종 선택된 문서 내용 목록 (중복 제거, 최대 MAX_DOCS) */
  docs: string[];
  /** 문서 선택에 사용된 방법 (디버깅용) */
  methods: ('keyword' | 'context' | 'embedding')[];
}

/** 프롬프트에 삽입할 최대 문서 수 */
const MAX_DOCS = 3;

/**
 * 3-레이어 하이브리드 RAG 엔진.
 *
 * 1. Method 1 (KeywordRetriever): _index.md 키워드 라우팅
 * 2. Method 3 (FileContextRetriever): 현재 파일 경로·import 분석
 * 3. Method 2 (RagRetriever): 임베딩 코사인 유사도 폴백
 *
 * Method 1 + 3 결과가 MAX_DOCS 미만이면 Method 2 폴백을 추가한다.
 */
export class HybridRagEngine {
  private readonly _keywordRetriever = new KeywordRetriever();
  private readonly _fileContextRetriever = new FileContextRetriever();
  private readonly _ragRetriever = new RagRetriever();

  /**
   * .rag/ 디렉터리를 기준으로 각 Retriever를 초기화하고
   * 임베딩 인덱스 빌드를 백그라운드에서 시작한다.
   */
  initialize(ragDir: string): void {
    this._keywordRetriever.initialize(ragDir);
    this._fileContextRetriever.initialize(ragDir);
    // 임베딩 인덱스는 비동기 빌드 (폴백용)
    this._ragRetriever.buildIndex(ragDir).catch((err) => {
      console.error('[axiom-ai] RAG 임베딩 인덱스 빌드 실패:', err);
    });
  }

  /** 임베딩 인덱스를 초기화하고 다음 initialize() 시 재빌드하도록 한다. */
  invalidate(): void {
    this._ragRetriever.reset();
  }

  /**
   * 사용자 질문과 현재 파일 컨텍스트를 기반으로 관련 문서를 수집한다.
   *
   * 수집 순서:
   * 1. Method 1 + Method 3 병렬 실행 → 중복 제거
   * 2. MAX_DOCS 미만이면 Method 2 (임베딩) 폴백으로 보충
   */
  async buildContext(
    userQuery: string,
    filePath: string,
    fileContent: string
  ): Promise<RagContext> {
    const methods: RagContext['methods'] = [];

    // Method 1: 키워드 라우팅
    const kwFiles = this._keywordRetriever.matchedFiles(userQuery);
    const kwDocs = this._keywordRetriever.readFiles(kwFiles);
    if (kwDocs.length > 0) methods.push('keyword');

    // Method 3: 파일 컨텍스트 분석
    const ctxFiles = this._fileContextRetriever.matchedFiles(filePath, fileContent);
    const ctxDocs = this._fileContextRetriever.readFiles(ctxFiles);
    if (ctxDocs.length > 0) methods.push('context');

    // 중복 제거 (동일 문서 헤더 기준)
    const combined = this._dedupe([...kwDocs, ...ctxDocs]).slice(0, MAX_DOCS);

    // Method 2 폴백: Method 1 + 3 결과가 부족할 때만 사용
    if (combined.length < MAX_DOCS) {
      const embeddingResult = await this._ragRetriever.retrieve(userQuery);
      if (embeddingResult) {
        methods.push('embedding');
        // 임베딩 결과를 빈 슬롯에 추가 (이미 추가된 doc와 중복 없이)
        const embeddingDocs = embeddingResult
          .split('\n\n---\n\n')
          .filter((d) => d.trim());
        const remaining = MAX_DOCS - combined.length;
        for (const doc of embeddingDocs.slice(0, remaining)) {
          if (!combined.some((c) => this._headerOf(c) === this._headerOf(doc))) {
            combined.push(doc);
          }
        }
      }
    }

    return { docs: combined, methods };
  }

  /** 문서 헤더(첫 줄) 기준으로 중복을 제거한다. */
  private _dedupe(docs: string[]): string[] {
    const seen = new Set<string>();
    return docs.filter((doc) => {
      const header = this._headerOf(doc);
      if (seen.has(header)) return false;
      seen.add(header);
      return true;
    });
  }

  private _headerOf(doc: string): string {
    return doc.split('\n')[0].trim();
  }
}
