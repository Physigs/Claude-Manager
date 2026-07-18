import { describe, it, expect } from 'vitest'
import { mergeProjects, pathToName } from './projectList'

describe('pathToName', () => {
  it('returns the last segment of a windows path', () => {
    expect(pathToName('C:\\workspaces\\Momentum')).toBe('Momentum')
  })

  it('returns the last segment of a posix-style path', () => {
    expect(pathToName('C:/workspaces/Momentum')).toBe('Momentum')
  })

  it('strips a trailing slash', () => {
    expect(pathToName('C:/workspaces/Momentum/')).toBe('Momentum')
  })
})

describe('mergeProjects', () => {
  it('merges claude.json paths with manually added paths', () => {
    const result = mergeProjects(['C:/a'], { pinned: [], hidden: [], manual: ['C:/b'] })
    expect(result.map((p) => p.path).sort()).toEqual(['C:/a', 'C:/b'])
  })

  it('excludes hidden paths', () => {
    const result = mergeProjects(['C:/a', 'C:/b'], { pinned: [], hidden: ['C:/b'], manual: [] })
    expect(result.map((p) => p.path)).toEqual(['C:/a'])
  })

  it('sorts pinned projects first, then alphabetically', () => {
    const result = mergeProjects(['C:/zeta', 'C:/alpha', 'C:/beta'], {
      pinned: ['C:/beta'],
      hidden: [],
      manual: []
    })
    expect(result.map((p) => p.name)).toEqual(['beta', 'alpha', 'zeta'])
  })

  it('deduplicates a path present in both claude.json and manual', () => {
    const result = mergeProjects(['C:/a'], { pinned: [], hidden: [], manual: ['C:/a'] })
    expect(result).toHaveLength(1)
  })

  it('marks projects as not missing by default', () => {
    const result = mergeProjects(['C:/a'], { pinned: [], hidden: [], manual: [] })
    expect(result[0].missing).toBe(false)
  })

  it('includes saved flags for a project', () => {
    const result = mergeProjects(['C:/a'], {
      pinned: [],
      hidden: [],
      manual: [],
      projectFlags: { 'C:/a': '--verbose' }
    })
    expect(result[0].flags).toBe('--verbose')
  })

  it('defaults flags to an empty string when none are saved', () => {
    const result = mergeProjects(['C:/a'], { pinned: [], hidden: [], manual: [] })
    expect(result[0].flags).toBe('')
  })
})
