export type TerminalId = 'wt' | 'powershell' | 'cmd' | 'gitbash' | 'wsl'

export const TERMINAL_LABELS: Record<TerminalId, string> = {
  wt: 'Windows Terminal',
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  gitbash: 'Git Bash',
  wsl: 'WSL'
}
