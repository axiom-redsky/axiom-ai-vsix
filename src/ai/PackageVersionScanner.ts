import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const TRACKED_LIBRARIES = [
  'dayjs',
  'zustand',
  'date-fns',
  'animejs',
  '@tanstack/react-table',
  'lodash',
  'lottie-react',
  'react-day-picker',
];

/**
 * 워크스페이스의 실제 설치 버전을 읽어 한 줄 요약 문자열로 반환한다.
 * node_modules/{lib}/package.json 우선, 없으면 package.json dependencies range로 폴백.
 * 폐쇄망 환경 — 인터넷 접근 없이 로컬 파일만 읽는다.
 */
export function scanLibraryVersions(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return '';

  const workspaceRoot = folders[0].uri.fsPath;
  const results: string[] = [];

  for (const lib of TRACKED_LIBRARIES) {
    const version = _resolveVersion(workspaceRoot, lib);
    if (version) {
      const displayName = lib.startsWith('@') ? lib.split('/').pop()! : lib;
      results.push(`${displayName}@${version}`);
    }
  }

  return results.join(' | ');
}

function _resolveVersion(workspaceRoot: string, lib: string): string | null {
  // 1순위: node_modules/{lib}/package.json (실제 설치된 정확한 버전)
  const nmPath = path.join(workspaceRoot, 'node_modules', lib, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(nmPath, 'utf8')) as { version?: string };
    if (pkg.version) return _toMajorMinor(pkg.version);
  } catch {
    // node_modules 없으면 폴백
  }

  // 2순위: 워크스페이스 package.json dependencies (버전 range)
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const range = pkg.dependencies?.[lib] ?? pkg.devDependencies?.[lib];
    if (range) return _toMajorMinor(range.replace(/^[^\d]*/, ''));
  } catch {
    // package.json도 없으면 skip
  }

  return null;
}

function _toMajorMinor(version: string): string {
  const match = version.match(/(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : version;
}
