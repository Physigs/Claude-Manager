import { describe, it, expect } from 'vitest'
import {
  recordFlagUsage,
  buildFlagString,
  parseFlagString,
  KNOWN_FLAGS,
  FLAG_HISTORY_LIMIT
} from './flags'
import type { LauncherConfig } from './config'

function emptyConfig(): LauncherConfig {
  return { pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [], terminal: 'wt' }
}

describe('recordFlagUsage', () => {
  it('saves the trimmed flags for the project and adds them to history', () => {
    const config = emptyConfig()
    recordFlagUsage(config, 'C:/a', '  --verbose  ')
    expect(config.projectFlags['C:/a']).toBe('--verbose')
    expect(config.flagHistory).toEqual(['--verbose'])
  })

  it('removes the project entry when flags are empty', () => {
    const config = emptyConfig()
    config.projectFlags['C:/a'] = '--verbose'
    recordFlagUsage(config, 'C:/a', '   ')
    expect(config.projectFlags['C:/a']).toBeUndefined()
  })

  it('moves a reused flag string to the front of history instead of duplicating it', () => {
    const config = emptyConfig()
    recordFlagUsage(config, 'C:/a', '--verbose')
    recordFlagUsage(config, 'C:/b', '--continue')
    recordFlagUsage(config, 'C:/c', '--verbose')
    expect(config.flagHistory).toEqual(['--verbose', '--continue'])
  })

  it('caps history at FLAG_HISTORY_LIMIT entries', () => {
    const config = emptyConfig()
    for (let i = 0; i < FLAG_HISTORY_LIMIT + 5; i++) {
      recordFlagUsage(config, `C:/p${i}`, `--flag-${i}`)
    }
    expect(config.flagHistory).toHaveLength(FLAG_HISTORY_LIMIT)
    expect(config.flagHistory[0]).toBe(`--flag-${FLAG_HISTORY_LIMIT + 4}`)
  })
})

describe('buildFlagString', () => {
  it('joins checked flags and free text with spaces', () => {
    expect(buildFlagString(['--verbose', '--continue'], '--model opus')).toBe(
      '--verbose --continue --model opus'
    )
  })

  it('omits empty free text', () => {
    expect(buildFlagString(['--verbose'], '  ')).toBe('--verbose')
  })

  it('returns an empty string when nothing is set', () => {
    expect(buildFlagString([], '')).toBe('')
  })
})

describe('parseFlagString', () => {
  it('splits known flags into checked and the rest into free text', () => {
    const result = parseFlagString('--verbose --model opus --continue')
    expect(result.checked.sort()).toEqual(['--continue', '--verbose'])
    expect(result.freeText).toBe('--model opus')
  })

  it('round-trips through buildFlagString', () => {
    const original = '--verbose --model opus'
    const parsed = parseFlagString(original)
    expect(buildFlagString(parsed.checked, parsed.freeText)).toBe(original)
  })

  it('handles an empty string', () => {
    expect(parseFlagString('')).toEqual({ checked: [], freeText: '' })
  })
})

describe('KNOWN_FLAGS', () => {
  it('includes the expected interactive-session flags', () => {
    expect(KNOWN_FLAGS).toEqual([
      '--dangerously-skip-permissions',
      '--continue',
      '--resume',
      '--verbose',
      '--ide'
    ])
  })
})
