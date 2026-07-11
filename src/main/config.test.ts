import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig, saveConfig } from './config'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('returns defaults when the file does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const config = await loadConfig(join(tempDir, 'config.json'))
    expect(config).toEqual({ pinned: [], hidden: [], manual: [] })
  })

  it('returns defaults when the file has invalid JSON', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, 'not json', 'utf-8')
    const config = await loadConfig(configPath)
    expect(config).toEqual({ pinned: [], hidden: [], manual: [] })
  })
})

describe('saveConfig + loadConfig round trip', () => {
  it('persists and reloads the same data, creating missing parent directories', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'nested', 'config.json')
    const data = { pinned: ['C:/a'], hidden: ['C:/b'], manual: ['C:/c'] }
    await saveConfig(configPath, data)
    const reloaded = await loadConfig(configPath)
    expect(reloaded).toEqual(data)
  })
})
