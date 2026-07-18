import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { launchProject } from './launcher'

function makeFakeChild(): EventEmitter & { unref: () => void } {
  const emitter = new EventEmitter() as EventEmitter & { unref: () => void }
  emitter.unref = vi.fn()
  return emitter
}

function spawningFn(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() => {
    const child = makeFakeChild()
    queueMicrotask(() => child.emit('spawn'))
    return child
  })
}

describe('launchProject', () => {
  it('spawns wt.exe with the project directory and claude by default', async () => {
    const spawnFn = spawningFn()

    const result = await launchProject('C:/workspaces/Momentum', '', 'wt', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:/workspaces/Momentum', 'claude'],
      expect.objectContaining({ detached: true })
    )
    expect(result).toEqual({ usedFallback: false })
  })

  it('appends flags as extra args to the wt.exe claude invocation', async () => {
    const spawnFn = spawningFn()

    await launchProject(
      'C:/workspaces/Momentum',
      '--dangerously-skip-permissions --continue',
      'wt',
      spawnFn as any
    )

    expect(spawnFn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:/workspaces/Momentum', 'claude', '--dangerously-skip-permissions', '--continue'],
      expect.objectContaining({ detached: true })
    )
  })

  it('spawns Command Prompt via cmd.exe /c start when cmd is chosen', async () => {
    const spawnFn = spawningFn()

    await launchProject('C:/workspaces/Momentum', '--verbose', 'cmd', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'claude', '--verbose'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('spawns PowerShell via cmd.exe /c start when powershell is chosen', async () => {
    const spawnFn = spawningFn()

    await launchProject('C:/workspaces/Momentum', '--verbose', 'powershell', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'powershell.exe', '-NoExit', '-Command', 'claude', '--verbose'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('spawns Git Bash via cmd.exe /c start when gitbash is chosen', async () => {
    const spawnFn = spawningFn()

    await launchProject('C:/workspaces/Momentum', '--verbose', 'gitbash', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'bash.exe', '-c', 'claude --verbose; exec bash'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('spawns WSL via cmd.exe /c start when wsl is chosen', async () => {
    const spawnFn = spawningFn()

    await launchProject('C:/workspaces/Momentum', '--verbose', 'wsl', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'wsl.exe', 'bash', '-c', 'claude --verbose; exec bash'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('builds a clean bash command with no trailing space when there are no flags', async () => {
    const spawnFn = spawningFn()

    await launchProject('C:/workspaces/Momentum', '', 'gitbash', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'bash.exe', '-c', 'claude; exec bash'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
  })

  it('falls back to Command Prompt when the chosen terminal fails to spawn', async () => {
    const spawnFn = vi.fn().mockImplementation((command: string) => {
      const child = makeFakeChild()
      if (command === 'wt.exe') {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      } else {
        queueMicrotask(() => child.emit('spawn'))
      }
      return child
    })

    const result = await launchProject('C:/workspaces/Momentum', '', 'wt', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'claude'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
    expect(result).toEqual({ usedFallback: true })
  })

  it('falls back to Command Prompt when PowerShell fails to spawn', async () => {
    const spawnFn = vi.fn().mockImplementation((command: string, args: string[]) => {
      const child = makeFakeChild()
      if (command === 'cmd.exe' && args.includes('powershell.exe')) {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      } else {
        queueMicrotask(() => child.emit('spawn'))
      }
      return child
    })

    const result = await launchProject('C:/workspaces/Momentum', '', 'powershell', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'claude'],
      expect.objectContaining({ detached: true, cwd: 'C:/workspaces/Momentum' })
    )
    expect(result).toEqual({ usedFallback: true })
  })

  it('does not crash when the fallback itself fails to spawn', async () => {
    const wtChild = makeFakeChild()
    const fallbackChild = makeFakeChild()
    const spawnFn = vi.fn().mockImplementation((command: string) => {
      if (command === 'wt.exe') {
        queueMicrotask(() => wtChild.emit('error', new Error('ENOENT')))
        return wtChild
      }
      return fallbackChild
    })

    const result = await launchProject('C:/does/not/exist', '', 'wt', spawnFn as any)
    expect(result).toEqual({ usedFallback: true })

    expect(() => fallbackChild.emit('error', new Error('ENOENT'))).not.toThrow()
  })
})
