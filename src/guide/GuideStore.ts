// 가이드 저장소 파일 작업 — 시드/재시드/신규 문서 생성. vscode 무의존(fs/path만)이라 test:guide로 검증한다.
import * as fs from 'fs';
import * as path from 'path';
import { buildNewDocTemplate, slugifyTitle } from './guideUtils';

function copyDirRecursive(srcDir: string, dstDir: string, overwrite: boolean): number {
  let copied = 0;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, e.name);
    const dst = path.join(dstDir, e.name);
    if (e.isDirectory()) {
      copied += copyDirRecursive(src, dst, overwrite);
    } else if (overwrite || !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      copied += 1;
    }
  }
  return copied;
}

/**
 * 최초 시드: guideDir가 이미 존재하면 아무것도 하지 않는다(사용자 편집이 항상 이긴다).
 * 없을 때만 번들 스냅샷을 통째로 복사하고 true를 반환한다.
 */
export function seedIfMissing(bundledDir: string, guideDir: string): boolean {
  if (fs.existsSync(guideDir)) return false;
  if (!fs.existsSync(bundledDir)) return false;
  copyDirRecursive(bundledDir, guideDir, true);
  return true;
}

/**
 * 재시드(복구): missing-only = 없는 파일만 채움(수정본 보존) / overwrite = 번들로 전체 원복.
 * overwrite는 호출부에서 반드시 사용자 확인(모달)을 거친 뒤 불러야 한다.
 */
export function reseed(bundledDir: string, guideDir: string, mode: 'missing-only' | 'overwrite'): number {
  if (!fs.existsSync(bundledDir)) return 0;
  return copyDirRecursive(bundledDir, guideDir, mode === 'overwrite');
}

/** 신규 가이드 md 생성 — custom/<slug>.md (충돌 시 -2, -3 …). 생성한 파일의 절대경로를 반환. */
export function createDoc(guideDir: string, title: string): string {
  const dir = path.join(guideDir, 'custom');
  fs.mkdirSync(dir, { recursive: true });
  const slug = slugifyTitle(title);
  let file = path.join(dir, `${slug}.md`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${slug}-${n}.md`);
  fs.writeFileSync(file, buildNewDocTemplate(title), 'utf8');
  return file;
}

/** 가이드 루트 아래 모든 문서 docId 수집 — assets/·`_`접두(파일·폴더) 제외, '/' 정규화. */
export function listAllDocIds(rootDir: string): string[] {
  const ids: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('_') || e.name === 'assets') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), childRel);
      else if (e.name.endsWith('.md')) ids.push(childRel.slice(0, -3));
    }
  };
  walk(rootDir, '');
  return ids.sort();
}
