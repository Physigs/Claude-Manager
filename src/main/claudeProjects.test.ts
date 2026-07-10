import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readClaudeJsonProjects } from './claudeProjects'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('readClaudeJsonProjects', () => {
  it('returns the keys of the projects object', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const filePath = join(tempDir, '.claude.json')
    await writeFile(filePath, JSON.stringify({ projects: { 'C:/a': {}, 'C:/b': {} } }), 'utf-8')
    const result = await readClaudeJsonProjects(filePath)
    expect(result.sort()).toEqual(['C:/a', 'C:/b'])
  })

  it('returns an empty array when the file does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const result = await readClaudeJsonProjects(join(tempDir, 'missing.json'))
    expect(result).toEqual([])
  })

  it('returns an empty array when the file has invalid JSON', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const filePath = join(tempDir, '.claude.json')
    await writeFile(filePath, '{not valid', 'utf-8')
    const result = await readClaudeJsonProjects(filePath)
    expect(result).toEqual([])
  })

  it('returns an empty array when the projects field is missing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const filePath = join(tempDir, '.claude.json')
    await writeFile(filePath, JSON.stringify({ other: true }), 'utf-8')
    const result = await readClaudeJsonProjects(filePath)
    expect(result).toEqual([])
  })
})
