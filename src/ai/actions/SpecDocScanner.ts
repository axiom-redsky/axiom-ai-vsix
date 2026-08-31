/**
 * SpecDocScanner — 워크스페이스에서 **API 스펙 후보 문서**(마크다운)를 모은다.
 *
 * 왜 파일명 규칙에 안 기대나: 폐쇄망 SI에서 스펙 문서의 이름·위치는 제각각이라
 * (`api-spec.md` · `인터페이스정의서.md` · `docs/backend/employees.md` …) 규칙으로 고르면 자주 빗나간다.
 * 그래서 여기서는 **후보만 모으고**, 정답 판정은 내용으로 하는 `pickSpecDoc`에 맡긴다.
 * 파일명 힌트는 정확도가 아니라 **탐색 순서**(먼저 열어볼 문서)에만 쓴다.
 *
 * node fs만 쓴다(vscode API 비의존 — CardCatalog와 같은 규약).
 * 폐쇄망·대형 모노레포에서도 안전하도록 깊이·개수·크기에 상한을 둔다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractApiPaths } from '../decompose/SectionExtractor';

export interface ISpecDoc {
  /** 워크스페이스 루트 기준 상대 경로(표시·로그용). */
  path: string;
  text: string;
}

/** 스캔 상한 — 채팅 한 턴이 파일시스템 때문에 느려지지 않게. */
const MAX_DEPTH = 3;
const MAX_FILES = 300;
const MAX_BYTES = 512 * 1024;

/** 들어가지 않을 디렉터리(빌드 산출물·의존성·VCS). 스펙이 여기 있을 일은 없다. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.turbo',
  '.vscode-test', 'media', 'target', 'vendor',
]);

/** 파일명이 스펙처럼 보이는가 — 순서 힌트일 뿐 필터가 아니다. */
function looksLikeSpec(rel: string): boolean {
  return /(api|spec|swagger|openapi|endpoint|인터페이스|명세|규격)/i.test(rel);
}

/**
 * 루트 아래 마크다운 파일을 상한 안에서 모은다. 스펙처럼 보이는 파일이 앞에 오도록 정렬 —
 * `pickSpecDoc`이 앞에서부터 내용을 검사하므로 흔한 배치에서 빨리 맞춘다.
 */
export function scanSpecDocs(root: string | null): ISpecDoc[] {
  if (!root) return [];
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 권한·경합 — 조용히 건너뛴다(스캔은 best-effort)
    }
    for (const e of entries) {
      if (found.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.') && e.name !== '.axiom') continue;
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        found.push(full);
      }
    }
  };
  walk(root, 0);

  const docs: ISpecDoc[] = [];
  const ordered = found.sort((a, b) => {
    const rank = Number(looksLikeSpec(b)) - Number(looksLikeSpec(a));
    return rank !== 0 ? rank : a.localeCompare(b);
  });
  for (const full of ordered) {
    let text: string;
    try {
      if (fs.statSync(full).size > MAX_BYTES) continue; // 거대 문서는 스펙이 아닐 가능성이 높다
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    docs.push({ path: path.relative(root, full).replace(/\\/g, '/'), text });
  }
  return docs;
}

/** API 경로처럼 보이는 접두사(`/api/…` `/v1/…`) — 문서 안 링크·파일 경로와 구분하는 1차 신호. */
const API_PREFIX_RE = /^\/(?:api|v\d+)(?:\/|$)/i;
/** 같은 줄에 HTTP 메서드가 있으면 접두사와 무관하게 엔드포인트로 인정한다(`### GET /employees`). */
const HTTP_METHOD_RE = /\b(?:GET|POST|PUT|PATCH|DELETE)\b/;

/**
 * 후보 문서들에서 API 경로 목록을 뽑는다 — `endpoint-list` 슬롯의 선택지(§4.5 스캔 계약).
 *
 * 문서 전체에 정규식을 그냥 돌리면 마크다운 링크·디렉터리 경로(`/docs/guide/x`)까지 섞여
 * 칩 드롭다운이 쓰레기로 찬다. 줄 단위로 보고 **API 접두사이거나 HTTP 메서드와 같은 줄**인
 * 경로만 남긴다(놓치면 자유 입력으로 넣으면 되지만, 오염되면 목록 자체가 못 쓰게 된다).
 */
export function listEndpoints(docs: ISpecDoc[]): string[] {
  const seen = new Set<string>();
  for (const doc of docs) {
    for (const line of doc.text.split('\n')) {
      const hasMethod = HTTP_METHOD_RE.test(line);
      for (const p of extractApiPaths(line)) {
        if (hasMethod || API_PREFIX_RE.test(p)) seen.add(p);
      }
    }
  }
  return [...seen].sort();
}
