import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { launchProject } from './launcher'

function makeFakeChild(): EventEmitter & { unref: () => void } {
  const emitter = new EventEmitter() as EventEmitter & { unref: () => void }
  emitter.unref = vi.fn()
  return emitter
}

describe('launchProject', () => {
  it('spawns wt.exe with the project directory and claude', async () => {
    const spawnFn = vi.fn().mockImplementation(() => {
      const child = makeFakeChild()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })

    const result = await launchProject('C:/workspaces/Momentum', '', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:/workspaces/Momentum', 'claude'],
      expect.objectContaining({ detached: true })
    )
    expect(result).toEqual({ usedFallback: false })
  })

  it('appends flags as extra args to the wt.exe claude invocation', async () => {
    const spawnFn = vi.fn().mockImplementation(() => {
      const child = makeFakeChild()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })

    await launchProject(
      'C:/workspaces/Momentum',
      '--dangerously-skip-permissions --continue',
      spawnFn as any
    )

    expect(spawnFn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:/workspaces/Momentum', 'claude', '--dangerously-skip-permissions', '--continue'],
      expect.objectContaining({ detached: true })
    )
  })

  it('falls back to cmd.exe when wt.exe fails to spawn', async () => {
    const spawnFn = vi.fn().mockImplementation((command: string) => {
      const child = makeFakeChild()
      if (command === 'wt.exe') {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      } else {
        queueMicrotask(() => child.emit('spawn'))
      }
      return child
    })

    const result = await launchProject('C:/workspaces/Momentum', '', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'claude'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
    expect(result).toEqual({ usedFallback: true })
  })

  it('appends flags to the cmd.exe fallback invocation too', async () => {
    const spawnFn = vi.fn().mockImplementation((command: string) => {
      const child = makeFakeChild()
      if (command === 'wt.exe') {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      } else {
        queueMicrotask(() => child.emit('spawn'))
      }
      return child
    })

    await launchProject('C:/workspaces/Momentum', '--verbose', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'claude', '--verbose'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('does not crash when the cmd.exe fallback itself fails to spawn', async () => {
    const wtChild = makeFakeChild()
    const fallbackChild = makeFakeChild()
    const spawnFn = vi.fn().mockImplementation((command: string) => {
      if (command === 'wt.exe') {
        queueMicrotask(() => wtChild.emit('error', new Error('ENOENT')))
        return wtChild
      }
      return fallbackChild
    })

    const result = await launchProject('C:/does/not/exist', '', spawnFn as any)
    expect(result).toEqual({ usedFallback: true })

    expect(() => fallbackChild.emit('error', new Error('ENOENT'))).not.toThrow()
  })
})
