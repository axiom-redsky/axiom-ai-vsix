#!/usr/bin/env node
/**
 * validate-external-corpus.mjs
 *
 * 외부 corpus 폴더의 .md 파일 frontmatter를 검증하는 CLI 도구.
 * ExternalCorpusLoader와 동일한 검증 로직을 사용한다.
 *
 * 사용법:
 *   node scripts/validate-external-corpus.mjs /path/to/user-corpus
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const REQUIRED_FIELDS = ['title', 'category', 'tags'];

const corpusPath = process.argv[2];

if (!corpusPath) {
  console.error('사용법: node validate-external-corpus.mjs <corpus-폴더-경로>');
  process.exit(1);
}

const absPath = resolve(corpusPath);

if (!existsSync(absPath)) {
  console.error(`[error] 폴더를 찾을 수 없습니다: ${absPath}`);
  process.exit(1);
}

// ─── frontmatter 파싱 ──────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: content };

  const raw = match[1];
  const meta = {};

  for (const line of raw.split('\n').map((l) => l.replace(/\r$/, ''))) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }

    meta[key] = val;
  }

  return { meta, body: match[2] };
}

/** .md 파일 재귀 탐색 (`_`로 시작하는 파일/폴더 제외) */
function walkMd(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkMd(full, base, out);
    } else if (name.endsWith('.md')) {
      out.push({ abs: full, rel: relative(base, full).replace(/\\/g, '/') });
    }
  }
  return out;
}

// ─── 검증 ──────────────────────────────────────────────────────────────────

const files = walkMd(absPath);

if (files.length === 0) {
  console.log('[info] .md 파일이 없습니다.');
  process.exit(0);
}

let passCount = 0;
let failCount = 0;

for (const { abs, rel } of files) {
  const content = readFileSync(abs, 'utf-8');
  const { meta } = parseFrontmatter(content);

  const issues = [];

  if (!meta) {
    issues.push('frontmatter 없음 (--- 블록이 필요합니다)');
  } else {
    const missing = REQUIRED_FIELDS.filter((f) => !meta[f]);
    if (missing.length > 0) {
      issues.push(`필수 필드 누락: ${missing.join(', ')}`);
    }

    if (meta.tags !== undefined && !Array.isArray(meta.tags)) {
      issues.push('tags 필드는 배열이어야 합니다 (예: [a, b, c])');
    }

    if (meta.priority !== undefined) {
      const p = Number(meta.priority);
      if (![1, 2, 3].includes(p)) {
        issues.push('priority는 1, 2, 3 중 하나여야 합니다');
      }
    }

    const validCategories = ['component', 'pattern', 'convention', 'scaffold', 'react', 'source'];
    if (meta.category && !validCategories.includes(meta.category)) {
      issues.push(`category '${meta.category}'는 유효하지 않습니다. 유효한 값: ${validCategories.join(', ')}`);
    }
  }

  if (issues.length === 0) {
    console.log(`[PASS] ${rel}`);
    passCount++;
  } else {
    for (const issue of issues) {
      console.log(`[FAIL] ${rel} — ${issue}`);
    }
    failCount++;
  }
}

console.log('');
console.log(`검증 결과: ${passCount}개 통과, ${failCount}개 실패`);

if (failCount > 0) {
  process.exit(1);
}
