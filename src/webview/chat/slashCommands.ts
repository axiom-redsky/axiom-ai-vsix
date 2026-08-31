export interface SlashCommand {
  syntax: string;
  description: string;
  /** local: 프론트엔드에서 직접 처리 / remote: 백엔드로 전송 */
  type: 'local' | 'remote';
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { syntax: '/clear',        description: '대화 기록을 초기화합니다',                    type: 'local'  },
];

export function matchSlashCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const query = input.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.syntax.startsWith(query));
}

export function isExactSlashCommand(input: string): SlashCommand | undefined {
  const trimmed = input.trim().toLowerCase();
  return SLASH_COMMANDS.find((cmd) => cmd.syntax === trimmed);
}
