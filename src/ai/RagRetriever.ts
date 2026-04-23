import * as fs from 'fs';
import * as path from 'path';
import { embed } from './EmbeddingService';
import { ExtensionConfig } from '../config/ExtensionConfig';

interface Chunk {
  source: string;
  text: string;
  embedding: number[] | null;
}

/**
 * corpus 디렉터리를 청킹하고 임베딩 인덱스를 빌드한 뒤,
 * 질문과 유사한 청크를 코사인 유사도로 검색한다.
 */
export class RagRetriever {
  private _chunks: Chunk[] = [];
  private _ready = false;
  private _buildPromise: Promise<void> | null = null;

  /** .rag/ 디렉터리 하위 모든 .md 파일을 재귀 스캔해 임베딩 인덱스를 빌드한다. */
  buildIndex(corpusDir: string): Promise<void> {
    if (this._buildPromise) return this._buildPromise;
    this._buildPromise = this._doBuild(corpusDir).catch((err) => {
      // 빌드 실패 시 재시도 가능하도록 초기화
      this._buildPromise = null;
      throw err;
    });
    return this._buildPromise;
  }

  /** 인덱스 빌드가 완료되었는지 확인한다. */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * 질문과 유사한 청크를 topK 개 반환한다.
   * 인덱스가 준비되지 않았거나 청크가 없으면 빈 문자열을 반환한다.
   */
  async retrieve(query: string): Promise<string> {
    if (!this._ready || this._chunks.length === 0) return '';

    const topK = ExtensionConfig.getRagConfig().topK;
    const queryVec = await embed(query);

    const scored = this._chunks
      .filter((c): c is Chunk & { embedding: number[] } => c.embedding !== null)
      .map((c) => ({ chunk: c, score: cosineSimilarity(queryVec, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored
      .map(({ chunk }) => `## [${chunk.source}]\n\n${chunk.text}`)
      .join('\n\n---\n\n');
  }

  /** 캐시를 초기화해 다음 buildIndex 호출 시 재빌드하도록 한다. */
  reset(): void {
    this._chunks = [];
    this._ready = false;
    this._buildPromise = null;
  }

  private async _doBuild(ragDir: string): Promise<void> {
    if (!fs.existsSync(ragDir)) {
      this._ready = true;
      return;
    }

    const { chunkSize, chunkOverlap } = ExtensionConfig.getRagConfig();
    const rawChunks: Chunk[] = [];

    // .rag/ 하위 모든 .md 파일을 재귀적으로 수집 (_index.md 제외)
    const mdFiles = collectMdFiles(ragDir).filter(
      (f) => !path.basename(f).startsWith('_')
    );

    for (const absPath of mdFiles) {
      const rel = path.relative(ragDir, absPath).replace(/\\/g, '/');
      const content = fs.readFileSync(absPath, 'utf-8');
      const sections = splitByHeaders(content);
      for (const section of sections) {
        const pieces = slidingWindow(section, chunkSize, chunkOverlap);
        for (const piece of pieces) {
          rawChunks.push({ source: rel, text: piece.trim(), embedding: null });
        }
      }
    }

    // 청크별 임베딩 생성 (순차 처리 — 메모리 압박 방지)
    for (const chunk of rawChunks) {
      chunk.embedding = await embed(chunk.text);
    }

    this._chunks = rawChunks;
    this._ready = true;
  }
}

/** 디렉터리를 재귀 탐색해 .md 파일의 절대 경로 목록을 반환한다. */
function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 마크다운 헤더(#, ##, ###) 앞에서 분할한다. */
function splitByHeaders(markdown: string): string[] {
  const parts = markdown.split(/(?=^#{1,3} )/m).filter((s) => s.trim());
  return parts.length > 0 ? parts : [markdown];
}

/**
 * 텍스트가 size를 초과하면 슬라이딩 윈도우로 재분할한다.
 * size 이하면 그대로 반환한다.
 */
function slidingWindow(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  const step = Math.max(1, size - overlap);
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += step;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}
