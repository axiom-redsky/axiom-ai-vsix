import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './types';

interface StubEntry {
  keywords: string[];
  response: string;
}

const HARD_DEFAULT = [
  '> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없습니다.',
  '',
  '서버 엔드포인트 설정을 확인하거나 잠시 후 다시 시도해주세요.',
].join('\n');

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class FallbackStubService {
  private _entries: StubEntry[] = [];
  private _defaultResponse: string = HARD_DEFAULT;
  private _bundledDir: string | null = null;
  private _userDir: string | null = null;

  constructor(bundledDir: string | null, userDir: string | null = null) {
    this._bundledDir = bundledDir;
    this._userDir = userDir;
    if (bundledDir) this._loadDir(bundledDir, false);
    if (userDir) this._loadDir(userDir, true);
  }

  /** 사용자 폴더 변경 시 hot-reload */
  reload(bundledDir: string | null, userDir: string | null): void {
    this._entries = [];
    this._defaultResponse = HARD_DEFAULT;
    this._bundledDir = bundledDir;
    this._userDir = userDir;
    if (bundledDir) this._loadDir(bundledDir, false);
    if (userDir) this._loadDir(userDir, true);
  }

  private _loadDir(dir: string, prepend: boolean): void {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    } catch {
      console.warn(`[Axiom AI] stubs 폴더를 읽을 수 없습니다: ${dir}`);
      return;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      let raw: string;
      try {
        raw = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      if (file === '_default.md') {
        const body = this._extractBody(raw);
        if (body) this._defaultResponse = body.trim();
        continue;
      }

      const entry = this._parseStubFile(raw);
      if (!entry) continue;

      if (prepend) {
        this._entries.unshift(entry);
      } else {
        this._entries.push(entry);
      }
    }
  }

  private _parseStubFile(raw: string): StubEntry | null {
    const match = raw.match(FRONTMATTER_RE);
    if (!match) return null;

    const [, frontmatter, body] = match;
    const kwMatch = frontmatter.match(/keywords:\s*\[([^\]]*)\]/);
    if (!kwMatch) return null;

    const keywords = kwMatch[1]
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) return null;

    return { keywords, response: body.trim() };
  }

  private _extractBody(raw: string): string | null {
    const match = raw.match(FRONTMATTER_RE);
    // frontmatter 없으면 전체가 body
    return match ? match[2] : raw;
  }

  /**
   * 오프라인 응답 그룹 프레이밍 템플릿(`groups/{name}.md`)을 읽는다(번들 → 사용자 폴더 우선).
   * frontmatter가 있으면 본문만 반환한다. 없으면 null(호출부가 내장 기본 템플릿으로 폴백).
   */
  loadGroupTemplate(name: string): string | null {
    const safe = name.replace(/[^a-z_]/gi, '');
    if (!safe) return null;
    // 사용자 폴더가 번들보다 우선(오버라이드)
    for (const dir of [this._userDir, this._bundledDir]) {
      if (!dir) continue;
      const filePath = path.join(dir, 'groups', `${safe}.md`);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const body = this._extractBody(raw);
        if (body && body.trim()) return body.trim();
      } catch {
        // 다음 폴더로
      }
    }
    return null;
  }

  selectStub(userText: string): string {
    const q = userText.toLowerCase();
    let bestResponse: string | null = null;
    let bestScore = 0;

    for (const entry of this._entries) {
      for (const kw of entry.keywords) {
        const parts = kw.toLowerCase().split(' ').filter(Boolean);
        if (!parts.every(p => q.includes(p))) continue;
        // 매칭된 키워드 글자 수 합산 — 길수록 더 구체적인 매칭
        const score = parts.reduce((s, p) => s + p.length, 0);
        if (score > bestScore) {
          bestScore = score;
          bestResponse = entry.response;
        }
      }
    }

    return bestResponse ?? this._defaultResponse;
  }

  async *stream(userText: string): AsyncGenerator<string> {
    const text = this.selectStub(userText);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const words = lines[i].split(' ');
      for (let j = 0; j < words.length; j++) {
        yield j === 0 ? words[j] : ' ' + words[j];
        await new Promise<void>(r => setTimeout(r, 18));
      }
      if (i < lines.length - 1) {
        yield '\n';
      }
    }
  }

  /** 메시지 배열에서 마지막 사용자 텍스트를 추출한다. */
  static extractUserText(messages: ChatMessage[]): string {
    return [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  }
}
