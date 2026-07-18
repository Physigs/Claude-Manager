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
    expect(config).toEqual({ pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [] })
  })

  it('returns defaults when the file has invalid JSON', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, 'not json', 'utf-8')
    const config = await loadConfig(configPath)
    expect(config).toEqual({ pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [] })
  })

  it('defaults projectFlags and flagHistory when missing from an older config file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, JSON.stringify({ pinned: [], hidden: [], manual: [] }), 'utf-8')
    const config = await loadConfig(configPath)
    expect(config.projectFlags).toEqual({})
    expect(config.flagHistory).toEqual([])
  })

  it('two separate loadConfig calls against missing files do not share state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const a = await loadConfig(join(tempDir, 'a.json'))
    const b = await loadConfig(join(tempDir, 'b.json'))
    a.projectFlags['C:/a'] = '--verbose'
    expect(b.projectFlags).toEqual({})
  })
})

describe('saveConfig + loadConfig round trip', () => {
  it('persists and reloads the same data, creating missing parent directories', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'nested', 'config.json')
    const data = {
      pinned: ['C:/a'],
      hidden: ['C:/b'],
      manual: ['C:/c'],
      projectFlags: { 'C:/a': '--verbose' },
      flagHistory: ['--verbose']
    }
    await saveConfig(configPath, data)
    const reloaded = await loadConfig(configPath)
    expect(reloaded).toEqual(data)
  })
})
