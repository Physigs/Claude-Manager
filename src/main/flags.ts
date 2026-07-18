import type { LauncherConfig } from './config'

export const KNOWN_FLAGS = [
  '--dangerously-skip-permissions',
  '--continue',
  '--resume',
  '--verbose',
  '--ide'
]

export const FLAG_HISTORY_LIMIT = 20

export function recordFlagUsage(config: LauncherConfig, projectPath: string, flags: string): void {
  const trimmed = flags.trim()
  if (!trimmed) {
    delete config.projectFlags[projectPath]
    return
  }
  config.projectFlags[projectPath] = trimmed
  config.flagHistory = [trimmed, ...config.flagHistory.filter((f) => f !== trimmed)].slice(
    0,
    FLAG_HISTORY_LIMIT
  )
}

export function buildFlagString(checked: string[], freeText: string): string {
  return [...checked, freeText.trim()].filter(Boolean).join(' ')
}

export function parseFlagString(flags: string): { checked: string[]; freeText: string } {
  const tokens = flags.trim() ? flags.trim().split(/\s+/) : []
  const checked = KNOWN_FLAGS.filter((flag) => tokens.includes(flag))
  const freeText = tokens.filter((token) => !KNOWN_FLAGS.includes(token)).join(' ')
  return { checked, freeText }
}
