import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { TERMINAL_LABELS, type TerminalId } from './launcher'

export interface LauncherConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
  projectFlags: Record<string, string>
  flagHistory: string[]
  terminal: TerminalId
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === 'string' && value in TERMINAL_LABELS
}

export async function loadConfig(configPath: string): Promise<LauncherConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      pinned: Array.isArray(data.pinned) ? data.pinned : [],
      hidden: Array.isArray(data.hidden) ? data.hidden : [],
      manual: Array.isArray(data.manual) ? data.manual : [],
      projectFlags: isPlainObject(data.projectFlags) ? data.projectFlags : {},
      flagHistory: Array.isArray(data.flagHistory) ? data.flagHistory : [],
      terminal: isTerminalId(data.terminal) ? data.terminal : 'wt'
    }
  } catch {
    return { pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [], terminal: 'wt' }
  }
}

export async function saveConfig(configPath: string, config: LauncherConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
