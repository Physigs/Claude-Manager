import { spawn, SpawnOptions } from 'child_process'

export type TerminalId = 'wt' | 'powershell' | 'cmd' | 'gitbash' | 'wsl'

export const TERMINAL_LABELS: Record<TerminalId, string> = {
  wt: 'Windows Terminal',
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  gitbash: 'Git Bash',
  wsl: 'WSL'
}

export interface LaunchResult {
  usedFallback: boolean
}

interface LaunchCommand {
  command: string
  args: string[]
  options: SpawnOptions
}

function buildCommand(terminal: TerminalId, projectPath: string, flagArgs: string[]): LaunchCommand {
  if (terminal === 'wt') {
    return {
      command: 'wt.exe',
      args: ['-d', projectPath, 'claude', ...flagArgs],
      options: { detached: true, stdio: 'ignore' }
    }
  }

  const options: SpawnOptions = { detached: true, stdio: 'ignore', cwd: projectPath }
  const claudeCommand = ['claude', ...flagArgs].join(' ')

  switch (terminal) {
    case 'powershell':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'powershell.exe', '-NoExit', '-Command', 'claude', ...flagArgs],
        options
      }
    case 'gitbash':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'bash.exe', '-c', `${claudeCommand}; exec bash`],
        options
      }
    case 'wsl':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'wsl.exe', 'bash', '-c', `${claudeCommand}; exec bash`],
        options
      }
    case 'cmd':
    default:
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'cmd.exe', '/k', 'claude', ...flagArgs],
        options
      }
  }
}

export function launchProject(
  projectPath: string,
  flags: string,
  terminal: TerminalId,
  spawnFn: typeof spawn = spawn
): Promise<LaunchResult> {
  const flagArgs = flags.trim() ? flags.trim().split(/\s+/) : []
  const primary = buildCommand(terminal, projectPath, flagArgs)
  const fallback = buildCommand('cmd', projectPath, flagArgs)

  return new Promise((resolve) => {
    const child = spawnFn(primary.command, primary.args, primary.options)

    child.once('error', () => {
      const fallbackChild = spawnFn(fallback.command, fallback.args, fallback.options)
      fallbackChild.once('error', () => {
        // swallow: fallback spawn failed (e.g. nonexistent cwd); nothing further to try
      })
      fallbackChild.unref()
      resolve({ usedFallback: true })
    })

    child.once('spawn', () => {
      child.unref()
      resolve({ usedFallback: false })
    })
  })
}
