/**
 * 의도 예시 스토어 — `intents/{intent}.md`의 라벨 예시를 로드하고 임베딩을 lazy 캐시한다.
 *
 * 분류 로직(코드)과 예시 데이터(편집 가능한 md)를 분리하는 것이 이 모듈의 목적이다.
 * 오분류는 정규식 한 줄이 아니라 해당 의도 md에 **예시 한 줄을 추가**해 고친다.
 * `knowledge/` 밖(`intents/`)에 둬 RAG 인덱싱 오염을 피한다.
 *
 * 임베딩은 [embed](./EmbeddingService)로 만들며, 테스트에서는 embedFn을 주입해 결정론적으로 검증한다.
 * 모델 미존재(폐쇄망 미캐시) 등으로 임베딩이 실패하면 예시를 비워 둬, 분류기가 null을 돌려
 * 정규식 폴백으로 안전하게 떨어지게 한다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { embed as defaultEmbed } from '../retrieval/EmbeddingService';
import type { IntentKind } from './IntentClassifier';

export type EmbedFn = (text: string) => Promise<number[]>;

export interface IntentExample {
  intent: IntentKind;
  text: string;
  embedding: number[];
}

/** intents/ 폴더에서 로드할 의도 파일(파일명 = 의도). */
const INTENT_KINDS: IntentKind[] = ['create_page', 'modify_file', 'qna', 'smalltalk'];

export class IntentExampleStore {
  private _examples: IntentExample[] = [];
  private _ready = false;
  private _buildPromise: Promise<void> | null = null;
  private _dirs: string[] = [];

  constructor(
    bundledDir: string | null,
    userDir: string | null = null,
    private readonly _embed: EmbedFn = defaultEmbed,
  ) {
    this._setDirs(bundledDir, userDir);
  }

  /** 사용자 폴더 변경 시 hot-reload — 다음 ensureReady에서 재빌드. */
  reload(bundledDir: string | null, userDir: string | null): void {
    this._examples = [];
    this._ready = false;
    this._buildPromise = null;
    this._setDirs(bundledDir, userDir);
  }

  private _setDirs(bundledDir: string | null, userDir: string | null): void {
    this._dirs = [];
    if (bundledDir) this._dirs.push(bundledDir);
    if (userDir) this._dirs.push(userDir);
  }

  /**
   * 처음 호출 시 예시 파싱 + 임베딩을 1회 수행한다.
   * @returns 사용 가능한 예시가 하나라도 있으면 true(분류 가능), 아니면 false(폴백).
   */
  async ensureReady(): Promise<boolean> {
    if (this._ready) return this._examples.length > 0;
    if (!this._buildPromise) this._buildPromise = this._build();
    await this._buildPromise;
    return this._examples.length > 0;
  }

  examples(): IntentExample[] {
    return this._examples;
  }

  private async _build(): Promise<void> {
    const parsed = this._loadExamples();
    const out: IntentExample[] = [];
    try {
      for (const { intent, text } of parsed) {
        const embedding = await this._embed(text);
        out.push({ intent, text, embedding });
      }
      this._examples = out;
    } catch (err) {
      // 임베딩 불가(모델 미존재 등) → 비워 둬 분류기가 정규식으로 폴백하게 한다.
      console.warn(`[Axiom AI] 의도 예시 임베딩 실패 → 정규식 폴백: ${(err as Error).message}`);
      this._examples = [];
    }
    this._ready = true;
  }

  /** intents/*.md 의 `- 예시` 불릿을 의도별로 파싱한다(번들 → 사용자 폴더 순으로 누적). */
  private _loadExamples(): { intent: IntentKind; text: string }[] {
    const out: { intent: IntentKind; text: string }[] = [];
    const seen = new Set<string>();
    for (const dir of this._dirs) {
      for (const intent of INTENT_KINDS) {
        const filePath = path.join(dir, `${intent}.md`);
        let raw: string;
        try {
          raw = fs.readFileSync(filePath, 'utf-8');
        } catch {
          continue;
        }
        for (const line of raw.split(/\r?\n/)) {
          const m = line.match(/^\s*-\s+(.*\S)\s*$/);
          if (!m) continue;
          const text = m[1].trim();
          const key = `${intent}|${text.toLowerCase()}`;
          if (text.length < 2 || seen.has(key)) continue;
          seen.add(key);
          out.push({ intent, text });
        }
      }
    }
    return out;
  }
}
