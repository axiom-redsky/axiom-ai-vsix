#!/usr/bin/env node
/**
 * build-corpus.mjs
 *
 * corpus/ → .rag/ 빌드 파이프라인 (외부 의존성 없음, Node.js 18+ 내장 API만 사용)
 *
 * 스테이지:
 *   1. manifest.json 로드 → 소스-타겟 매핑 파악
 *   2. corpus 파일 파싱 → frontmatter 검증 (필수 필드 누락 시 exit 1)
 *   3. Diff 동기화: 소스 파일 해시 ↔ 현재 .rag/ 타겟 비교 → 변경분만 갱신
 *   4. .rag/_index.md 재생성: 모든 .rag/ 파일의 tags 수집
 *   5. manifest.json lastBuilt + fileHash 갱신
 *   6. 출력 검증: manifest.json의 모든 ragPath가 디스크에 존재하는지 확인
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const MANIFEST_PATH = join(ROOT, 'corpus', 'manifest.json');
const RAG_DIR = join(ROOT, '.rag');
const REQUIRED_FIELDS = ['title', 'category', 'tags'];

let hasError = false;

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function log(level, msg) {
  const prefix = { info: '[info]', warn: '[warn]', error: '[error]', ok: '[ok]  ' }[level] ?? '[info]';
  console.log(`${prefix} ${msg}`);
}

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

/** YAML frontmatter 파싱 (--- ... --- 블록) */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const raw = match[1];
  const body = match[2];
  const meta = {};

  for (const line of raw.split('\n').map((l) => l.replace(/\r$/, ''))) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();

    // 배열: [a, b, c] 또는 [a, b, c] (따옴표 포함 처리)
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

  return { meta, body };
}

/** corpus 파일 frontmatter 유효성 검사 */
function validateFrontmatter(sourcePath, meta) {
  const missing = REQUIRED_FIELDS.filter((f) => !meta[f]);
  if (missing.length > 0) {
    log('error', `${sourcePath}: 필수 필드 누락 → ${missing.join(', ')}`);
    hasError = true;
    return false;
  }
  return true;
}

/** 디렉터리 재귀 생성 */
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 파일 해시 (없으면 null) */
function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  return md5(readFileSync(filePath, 'utf-8'));
}

// ─── 스테이지 1: manifest 로드 ────────────────────────────────────────────

if (!existsSync(MANIFEST_PATH)) {
  log('error', `corpus/manifest.json 을 찾을 수 없습니다: ${MANIFEST_PATH}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const entries = manifest.builtIn ?? [];

log('info', `manifest 로드 완료 → ${entries.length}개 항목`);

// ─── 스테이지 2 & 3: 파싱 + 검증 + Diff 동기화 ───────────────────────────

let built = 0;
let skipped = 0;

for (const entry of entries) {
  const srcAbs = join(ROOT, entry.sourcePath);
  const dstAbs = join(ROOT, entry.ragPath);

  if (!existsSync(srcAbs)) {
    log('warn', `소스 파일 없음, 건너뜀: ${entry.sourcePath}`);
    continue;
  }

  const srcContent = readFileSync(srcAbs, 'utf-8');
  const { meta, body } = parseFrontmatter(srcContent);

  if (!validateFrontmatter(entry.sourcePath, meta)) continue;

  // Diff: 소스 해시와 타겟 해시 비교
  const srcHash = md5(srcContent);
  const dstHash = fileHash(dstAbs);

  // manifest에 저장된 이전 빌드 해시
  const prevHash = entry.lastSourceHash;

  if (dstHash !== null && prevHash === srcHash) {
    log('ok  ', `변경 없음, 건너뜀: ${entry.ragPath}`);
    skipped++;
    continue;
  }

  // 타겟 디렉터리 생성
  ensureDir(dirname(dstAbs));

  // .rag/ 출력: frontmatter + body (frontmatter는 태그 수집을 위해 보존)
  writeFileSync(dstAbs, srcContent, 'utf-8');
  entry.lastSourceHash = srcHash;
  entry.lastBuilt = new Date().toISOString();

  log('ok  ', `빌드: ${entry.sourcePath} → ${entry.ragPath}`);
  built++;
}

if (hasError) {
  log('error', '필수 필드 오류가 있습니다. 빌드를 중단합니다.');
  process.exit(1);
}

log('info', `동기화 완료 → ${built}개 갱신, ${skipped}개 건너뜀`);

// ─── 스테이지 4: _index.md 재생성 ────────────────────────────────────────

/** .rag/ 하위 모든 .md 파일 재귀 탐색 */
function walkRag(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkRag(full, base, out);
    } else if (name.endsWith('.md')) {
      out.push({ abs: full, rel: relative(base, full).replace(/\\/g, '/') });
    }
  }
  return out;
}

const ragFiles = walkRag(RAG_DIR);

/**
 * 각 .rag/ 파일에서 frontmatter의 tags를 수집한다.
 * frontmatter 없는 파일은 파일명 기반으로 기본 태그를 생성한다.
 */
function collectTags(ragFiles) {
  const groups = [];

  for (const { abs, rel } of ragFiles) {
    const content = readFileSync(abs, 'utf-8');
    const { meta } = parseFrontmatter(content);

    let keywords;
    if (meta.tags && Array.isArray(meta.tags) && meta.tags.length > 0) {
      keywords = meta.tags.map((t) => t.toLowerCase());
    } else {
      // frontmatter 없는 기존 파일: 파일명에서 기본 키워드 추출
      const stem = rel.replace(/\.md$/, '').replace(/\//g, '-').toLowerCase();
      keywords = [stem];
    }

    groups.push({ keywords, file: rel });
  }

  return groups;
}

/**
 * 기존 _index.md의 수동 엔트리를 보존하면서 corpus-derived 파일의 새 태그를 병합한다.
 * corpus manifest에 정의된 ragPath 파일들은 auto-generated으로 대체한다.
 */
function buildIndexMd(tagGroups) {
  const managedPaths = new Set(entries.map((e) => e.ragPath.replace(/^\.rag\//, '')));

  // 기존 _index.md에서 관리 대상이 아닌 엔트리 보존
  const existingIndexPath = join(RAG_DIR, '_index.md');
  const preserved = [];

  if (existsSync(existingIndexPath)) {
    const existingContent = readFileSync(existingIndexPath, 'utf-8');
    // 섹션별 엔트리 파싱
    const entryRegex = /- keywords:\s*\[([^\]]+)\]\s*\n\s*files:\s*\[([^\]]+)\]/g;
    for (const m of existingContent.matchAll(entryRegex)) {
      const files = m[2].split(',').map((s) => s.trim());
      // 모든 파일이 관리 대상이 아닌 경우에만 보존
      if (files.every((f) => !managedPaths.has(f))) {
        preserved.push({ keywords: m[1], files: m[2] });
      }
    }
  }

  // corpus-managed 파일의 새 태그로 교체
  const managedGroups = tagGroups.filter((g) => managedPaths.has(g.file));

  // 섹션별 분류
  const sections = {
    '컴포넌트': [],
    '패턴': [],
    '구조/규칙': [],
    'React 코드 패턴': [],
    '기타': [],
  };

  for (const g of managedGroups) {
    const kw = `[${g.keywords.join(', ')}]`;
    const entry = `- keywords: ${kw}\n  files: [${g.file}]`;

    if (g.file.startsWith('components/')) {
      sections['컴포넌트'].push(entry);
    } else if (g.file.startsWith('patterns/') || g.file.startsWith('scaffold/')) {
      sections['패턴'].push(entry);
    } else if (g.file.startsWith('conventions/')) {
      sections['구조/규칙'].push(entry);
    } else if (g.file.startsWith('react/')) {
      sections['React 코드 패턴'].push(entry);
    } else {
      sections['기타'].push(entry);
    }
  }

  const lines = [
    '---',
    'version: 1.0',
    'project: react-app-scaffold',
    '---',
    '',
    '# 지식 인덱스',
    '',
  ];

  for (const [sectionName, sectionEntries] of Object.entries(sections)) {
    if (sectionEntries.length === 0) continue;
    lines.push(`## ${sectionName}`, '');
    lines.push(...sectionEntries, '');
  }

  // 보존된 기존 엔트리 추가
  if (preserved.length > 0) {
    lines.push('## 기존 항목 (수동 관리)', '');
    for (const p of preserved) {
      lines.push(`- keywords: [${p.keywords}]`);
      lines.push(`  files: [${p.files}]`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

const tagGroups = collectTags(ragFiles);
const indexContent = buildIndexMd(tagGroups);
writeFileSync(join(RAG_DIR, '_index.md'), indexContent, 'utf-8');
log('ok  ', `_index.md 재생성 완료 (${tagGroups.length}개 파일 인덱싱)`);

// ─── 스테이지 5: manifest.json 갱신 ──────────────────────────────────────

manifest.lastBuilt = new Date().toISOString();
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
log('ok  ', 'manifest.json 갱신 완료');

// ─── 스테이지 6: 출력 검증 ────────────────────────────────────────────────

let validationFailed = false;
for (const entry of entries) {
  if (!entry.lastSourceHash) continue; // 소스 없어서 스킵된 항목
  const dstAbs = join(ROOT, entry.ragPath);
  if (!existsSync(dstAbs)) {
    log('error', `출력 파일 없음: ${entry.ragPath}`);
    validationFailed = true;
  }
}

if (validationFailed) {
  log('error', '출력 검증 실패 — 일부 .rag/ 파일이 생성되지 않았습니다.');
  process.exit(1);
}

log('info', `빌드 완료 — built-in ${built}개 갱신, ${skipped}개 건너뜀`);
