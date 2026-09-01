/**
 * "이 파일에 scaffold 계약을 들이대도 되는가" — 린트(C1)와 hover(B2)가 **함께 쓰는** 판정.
 *
 * 원래 `ScaffoldLintProvider` 안에 있던 것을 hover가 같은 판정을 필요로 해 끌어냈다.
 * 두 벌로 두면 한쪽만 고쳐져 "린트는 조용한데 hover는 떠드는" 상태가 되고, 그건 사용자에게
 * 규칙이 두 개인 것처럼 보인다(계획 §RESUME의 "같은 함수를 공유" 원칙).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/** scaffold 계약을 적용할 언어. */
export const SCAFFOLD_LANGS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

/** 빌드 산출물·의존성·선언 파일 — 사람이 고칠 코드가 아니다. */
export function isExcludedPath(filePath: string): boolean {
  if (/[\\/](node_modules|dist|build|out|\.git)[\\/]/.test(filePath)) return true;
  return /\.d\.ts$/.test(filePath);
}

/**
 * 계약을 **적용받는 쪽이 아니라 구현하는 쪽**인 영역인지.
 *
 * CLAUDE.md의 구조 정의대로 `src/core`는 "업무 개발자 미작업 영역"이고, `src/shared/lib`는 shadcn 원본
 * 벤더 코드다. 여기에 계약을 들이대면 전부 오탐이 된다 — `core/hooks/use-api.ts`는 **`useApi`의 구현체**라
 * `useQuery`/`useMutation`을 직접 쓰는 게 당연하고, `core/api/api-client.ts`는 axios 그 자체다
 * (실측: 이 제외가 없으면 실 scaffold에서 raw-http 7건이 전부 코어 구현부에서 나온다).
 *
 * hover도 같은 이유로 여기서는 침묵한다: `useApi`의 정의부에서 "useApi를 쓰세요"는 오답이다.
 */
export function isFrameworkArea(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return /\/src\/(core|config|types|__stories__)\//.test(norm)
    || /\/src\/shared\/lib\//.test(norm)
    || /\/shadcn\//.test(norm);
}

/** 파일이 속한 워크스페이스 폴더가 react-app-scaffold 모양인지(행동 카드의 `scaffold-detected`와 같은 신호). */
export function isScaffoldWorkspace(filePath: string): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const root = folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return false;
  try {
    return fs.existsSync(path.join(root, 'src', 'domains'));
  } catch {
    return false;
  }
}

/** 이 문서에 scaffold 계약(린트·hover)을 적용할지. */
export function isScaffoldSourceDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') return false;
  if (!SCAFFOLD_LANGS.includes(doc.languageId)) return false;
  const p = doc.uri.fsPath;
  if (isExcludedPath(p)) return false;
  if (isFrameworkArea(p)) return false;
  return isScaffoldWorkspace(p);
}
