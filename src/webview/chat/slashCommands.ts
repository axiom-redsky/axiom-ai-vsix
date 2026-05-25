export interface SlashCommand {
  syntax: string;
  description: string;
  /** local: 프론트엔드에서 직접 처리 / remote: 백엔드로 전송 */
  type: 'local' | 'remote';
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { syntax: '/clear',        description: '대화 기록을 초기화합니다',                    type: 'local'  },
  { syntax: '/spec',         description: '새 스펙을 AI로 생성합니다',                   type: 'remote' },
  { syntax: '/spec fast',    description: '스펙 생성 → 승인 → 코드 생성을 한 번에 실행', type: 'remote' },
  { syntax: '/spec update',  description: '현재 열린 spec.md를 AI로 수정합니다',         type: 'remote' },
  { syntax: '/spec approve', description: '현재 열린 spec.md를 approved 상태로 전환',    type: 'remote' },
  { syntax: '/spec guide',   description: '스펙 작성 규칙 가이드를 표시합니다',          type: 'remote' },
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
