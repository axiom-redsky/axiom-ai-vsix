import * as vscode from 'vscode';
import type { ChatPanelProvider } from '../providers/ChatPanelProvider';

// extension.ts에서 openChat / clearHistory를 직접 등록하므로,
// 여기서는 추가 커맨드가 생길 경우에만 등록한다.
export function registerCommands(
  _context: vscode.ExtensionContext,
  _provider: ChatPanelProvider,
): void {
  // reserved for future commands
}
