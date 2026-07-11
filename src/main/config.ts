import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export interface LauncherConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
}

const DEFAULT_CONFIG: LauncherConfig = { pinned: [], hidden: [], manual: [] }

export async function loadConfig(configPath: string): Promise<LauncherConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8')
    const data = JSON.parse(raw)
    return {
      pinned: Array.isArray(data.pinned) ? data.pinned : [],
      hidden: Array.isArray(data.hidden) ? data.hidden : [],
      manual: Array.isArray(data.manual) ? data.manual : []
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(configPath: string, config: LauncherConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
