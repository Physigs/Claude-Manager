# Terminal Choice Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick which terminal `claude` launches in (Windows Terminal, PowerShell, Command Prompt, Git Bash, or WSL) via one global setting, with the chosen terminal used for every launch and a Command Prompt fallback if it fails to spawn.

**Architecture:** `launcher.ts` gains a `TerminalId` type, a `TERMINAL_LABELS` map, and a command-building step that produces the right argv for whichever terminal is chosen — all non-`wt` targets reuse the existing `cmd.exe /c start ""` + `cwd` technique already proven for the Command Prompt fallback. `LauncherConfig` gains a validated `terminal` field (config.ts imports the `TerminalId` vocabulary from `launcher.ts`, the same "vocabulary lives next to the logic that uses it" pattern `flags.ts`'s `KNOWN_FLAGS` already established). New IPC handlers expose get/set. The renderer gets a toolbar dropdown.

**Tech Stack:** Existing stack only — TypeScript, Electron IPC, React, Vitest.

## Global Constraints

- No semicolons, matching existing style.
- Explicit return types on all functions, matching existing style.
- No dedicated automated tests for `index.ts`/`preload/index.ts`/`App.tsx` — same established convention as the flags feature (Task 3 of `docs/superpowers/plans/2026-07-18-launch-flags.md`); verified via typecheck + manual run instead.
- Five terminal IDs, fixed: `'wt' | 'powershell' | 'cmd' | 'gitbash' | 'wsl'`. Default: `'wt'`.
- Git Bash and WSL command patterns are implemented from documented behavior, not empirically verified in this sandbox (neither tool is installed here) — flagged in the spec as a known limitation, not something this plan can close.

Spec reference: `docs/superpowers/specs/2026-07-18-terminal-choice-design.md`

---

### Task 1: Terminal-aware launch commands + config field

**Files:**
- Modify: `src/main/launcher.ts`
- Modify: `src/main/launcher.test.ts`
- Modify: `src/main/config.ts`
- Modify: `src/main/config.test.ts`

**Interfaces:**
- Produces: `TerminalId` type and `TERMINAL_LABELS: Record<TerminalId, string>` from `launcher.ts` — consumed by `config.ts` (Task 1), `index.ts` (Task 2), and `App.tsx` (Task 3).
- Produces: `launchProject(projectPath: string, flags: string, terminal: TerminalId, spawnFn?): Promise<LaunchResult>` — consumed by Task 2.
- Produces: `LauncherConfig.terminal: TerminalId` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests for `launcher.ts`**

Replace the full contents of `src/main/launcher.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- launcher.test.ts`

Expected: FAIL — TS/runtime errors, since `launchProject` doesn't yet accept a `terminal` argument in this position and only knows how to build `wt`/`cmd` commands.

- [ ] **Step 3: Update `src/main/launcher.ts`**

Replace the full contents with:

```ts
import { spawn, SpawnOptions } from 'child_process'

export type TerminalId = 'wt' | 'powershell' | 'cmd' | 'gitbash' | 'wsl'

export const TERMINAL_LABELS: Record<TerminalId, string> = {
  wt: 'Windows Terminal',
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  gitbash: 'Git Bash',
  wsl: 'WSL'
}

export interface LaunchResult {
  usedFallback: boolean
}

interface LaunchCommand {
  command: string
  args: string[]
  options: SpawnOptions
}

function buildCommand(terminal: TerminalId, projectPath: string, flagArgs: string[]): LaunchCommand {
  if (terminal === 'wt') {
    return {
      command: 'wt.exe',
      args: ['-d', projectPath, 'claude', ...flagArgs],
      options: { detached: true, stdio: 'ignore' }
    }
  }

  const options: SpawnOptions = { detached: true, stdio: 'ignore', cwd: projectPath }
  const claudeCommand = ['claude', ...flagArgs].join(' ')

  switch (terminal) {
    case 'powershell':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'powershell.exe', '-NoExit', '-Command', 'claude', ...flagArgs],
        options
      }
    case 'gitbash':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'bash.exe', '-c', `${claudeCommand}; exec bash`],
        options
      }
    case 'wsl':
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'wsl.exe', 'bash', '-c', `${claudeCommand}; exec bash`],
        options
      }
    case 'cmd':
    default:
      return {
        command: 'cmd.exe',
        args: ['/c', 'start', '""', 'cmd.exe', '/k', 'claude', ...flagArgs],
        options
      }
  }
}

export function launchProject(
  projectPath: string,
  flags: string,
  terminal: TerminalId,
  spawnFn: typeof spawn = spawn
): Promise<LaunchResult> {
  const flagArgs = flags.trim() ? flags.trim().split(/\s+/) : []
  const primary = buildCommand(terminal, projectPath, flagArgs)
  const fallback = buildCommand('cmd', projectPath, flagArgs)

  return new Promise((resolve) => {
    const child = spawnFn(primary.command, primary.args, primary.options)

    child.once('error', () => {
      const fallbackChild = spawnFn(fallback.command, fallback.args, fallback.options)
      fallbackChild.once('error', () => {
        // swallow: fallback spawn failed (e.g. nonexistent cwd); nothing further to try
      })
      fallbackChild.unref()
      resolve({ usedFallback: true })
    })

    child.once('spawn', () => {
      child.unref()
      resolve({ usedFallback: false })
    })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- launcher.test.ts`

Expected: PASS (all tests in `launcher.test.ts`).

- [ ] **Step 5: Write the failing tests for `config.ts`**

Replace the full contents of `src/main/config.test.ts` with:

```ts
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
    expect(config).toEqual({
      pinned: [],
      hidden: [],
      manual: [],
      projectFlags: {},
      flagHistory: [],
      terminal: 'wt'
    })
  })

  it('returns defaults when the file has invalid JSON', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, 'not json', 'utf-8')
    const config = await loadConfig(configPath)
    expect(config).toEqual({
      pinned: [],
      hidden: [],
      manual: [],
      projectFlags: {},
      flagHistory: [],
      terminal: 'wt'
    })
  })

  it('defaults projectFlags and flagHistory when missing from an older config file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, JSON.stringify({ pinned: [], hidden: [], manual: [] }), 'utf-8')
    const config = await loadConfig(configPath)
    expect(config.projectFlags).toEqual({})
    expect(config.flagHistory).toEqual([])
  })

  it('defaults terminal to wt when missing from an older config file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(configPath, JSON.stringify({ pinned: [], hidden: [], manual: [] }), 'utf-8')
    const config = await loadConfig(configPath)
    expect(config.terminal).toBe('wt')
  })

  it('defaults terminal to wt when the stored value is not a known terminal id', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-launcher-'))
    const configPath = join(tempDir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({ pinned: [], hidden: [], manual: [], terminal: 'not-a-real-terminal' }),
      'utf-8'
    )
    const config = await loadConfig(configPath)
    expect(config.terminal).toBe('wt')
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
      flagHistory: ['--verbose'],
      terminal: 'powershell' as const
    }
    await saveConfig(configPath, data)
    const reloaded = await loadConfig(configPath)
    expect(reloaded).toEqual(data)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- config.test.ts`

Expected: FAIL — loaded config objects are missing the `terminal` field.

- [ ] **Step 7: Update `src/main/config.ts`**

Replace the full contents with:

```ts
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
```

Note the dependency direction: `config.ts` imports the `TerminalId` vocabulary from `launcher.ts` (same pattern as `flags.ts`'s `KNOWN_FLAGS`, which `config.ts` does *not* need to know about since flag validation lives entirely in `flags.ts`). `launcher.ts` has no dependency on `config.ts`, so there's no cycle.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- config.test.ts`

Expected: PASS (all tests in `config.test.ts`).

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`

Expected: All tests pass. Typecheck will show an error from `src/main/index.ts` calling `launchProject(projectPath, ...)` with the old 2-argument signature — expected at this point, fixed in Task 2.

- [ ] **Step 10: Commit**

```bash
git add src/main/launcher.ts src/main/launcher.test.ts src/main/config.ts src/main/config.test.ts
git commit -m "Add terminal choice: launcher builds per-terminal commands, config stores the setting"
```

---

### Task 2: IPC handlers and preload bridge

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `TerminalId`, `launchProject(path, flags, terminal, spawnFn?)` (Task 1).
- Produces: IPC channels `projects:setTerminal` (terminal) → `void`, `projects:getTerminal` () → `TerminalId`. Consumed by Task 3.

No dedicated automated tests — same established convention as the flags feature's IPC task. Verified by typecheck (Step 3) and the manual run in Task 3's final step.

- [ ] **Step 1: Update `src/main/index.ts`**

Change the `import` line to also bring in `TerminalId`:

```ts
import { launchProject, TerminalId } from './launcher'
```

Change the `projects:launch` handler to pass `config.terminal`:

```ts
  ipcMain.handle('projects:launch', async (_event, projectPath: string) => {
    const config = await loadConfig(getConfigPath())
    return launchProject(projectPath, config.projectFlags[projectPath] ?? '', config.terminal)
  })
```

Add two new handlers inside `registerIpcHandlers`, after the existing `projects:getFlagHistory` handler:

```ts

  ipcMain.handle('projects:setTerminal', async (_event, terminal: TerminalId) => {
    const configPath = getConfigPath()
    const config = await loadConfig(configPath)
    config.terminal = terminal
    await saveConfig(configPath, config)
  })

  ipcMain.handle('projects:getTerminal', async () => {
    const config = await loadConfig(getConfigPath())
    return config.terminal
  })
```

- [ ] **Step 2: Update `src/preload/index.ts`**

Replace the full contents with:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Project } from '../main/projectList'
import type { LaunchResult, TerminalId } from '../main/launcher'

const api = {
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  launchProject: (path: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('projects:launch', path),
  togglePin: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:togglePin', path),
  hideProject: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:hide', path),
  addFolder: (): Promise<Project[]> => ipcRenderer.invoke('projects:addFolder'),
  saveFlags: (path: string, flags: string): Promise<Project[]> =>
    ipcRenderer.invoke('projects:saveFlags', path, flags),
  getFlagHistory: (): Promise<string[]> => ipcRenderer.invoke('projects:getFlagHistory'),
  setTerminal: (terminal: TerminalId): Promise<void> =>
    ipcRenderer.invoke('projects:setTerminal', terminal),
  getTerminal: (): Promise<TerminalId> => ipcRenderer.invoke('projects:getTerminal')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`

Expected: All tests pass, typecheck succeeds cleanly (the Task 1 transient error is resolved now that `projects:launch` passes all three required arguments).

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "Add IPC handlers for reading and setting the terminal choice"
```

---

### Task 3: Terminal picker in the toolbar

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

**Interfaces:**
- Consumes: `TERMINAL_LABELS`, `TerminalId` (Task 1, cross-boundary value import from `src/main/launcher.ts` the same way `FlagsPopover.tsx` already imports from `src/main/flags.ts`), `window.api.getTerminal` / `window.api.setTerminal` (Task 2).

- [ ] **Step 1: Update `src/renderer/src/App.tsx`**

Replace the full contents with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../main/projectList'
import { TERMINAL_LABELS, type TerminalId } from '../../main/launcher'
import FlagsPopover from './FlagsPopover'

const TERMINAL_OPTIONS = Object.entries(TERMINAL_LABELS) as [TerminalId, string][]

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [flagHistory, setFlagHistory] = useState<string[]>([])
  const [openFlagsFor, setOpenFlagsFor] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<TerminalId>('wt')

  useEffect(() => {
    window.api.listProjects().then(setProjects)
    window.api.getFlagHistory().then(setFlagHistory)
    window.api.getTerminal().then(setTerminal)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    )
  }, [projects, query])

  async function handleLaunch(path: string): Promise<void> {
    const result = await window.api.launchProject(path)
    setNotice(
      result.usedFallback
        ? `${TERMINAL_LABELS[terminal]} not found — opened Command Prompt instead.`
        : null
    )
  }

  async function handleTogglePin(path: string): Promise<void> {
    setProjects(await window.api.togglePin(path))
  }

  async function handleHide(path: string): Promise<void> {
    setProjects(await window.api.hideProject(path))
  }

  async function handleAddFolder(): Promise<void> {
    setProjects(await window.api.addFolder())
  }

  async function handleSaveFlags(path: string, flags: string): Promise<void> {
    setProjects(await window.api.saveFlags(path, flags))
    setFlagHistory(await window.api.getFlagHistory())
  }

  async function handleSetTerminal(next: TerminalId): Promise<void> {
    setTerminal(next)
    await window.api.setTerminal(next)
  }

  return (
    <div className="app">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="terminal-picker">
          Open in:
          <select
            value={terminal}
            onChange={(e) => handleSetTerminal(e.target.value as TerminalId)}
          >
            {TERMINAL_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={handleAddFolder}>Add folder</button>
      </div>
      {notice && <div className="notice">{notice}</div>}
      <ul className="project-list">
        {filtered.map((project) => (
          <li key={project.path} className="project-card">
            <div className="project-card-row">
              <div className="project-info" onClick={() => handleLaunch(project.path)}>
                <div className="project-name">
                  {project.name}
                  {project.missing && <span className="badge">missing</span>}
                </div>
                <div className="project-path">{project.path}</div>
              </div>
              <div className="project-actions">
                <button onClick={() => handleTogglePin(project.path)}>
                  {project.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() =>
                    setOpenFlagsFor(openFlagsFor === project.path ? null : project.path)
                  }
                >
                  Flags
                </button>
                <button onClick={() => handleHide(project.path)}>Hide</button>
              </div>
            </div>
            {openFlagsFor === project.path && (
              <FlagsPopover
                project={project}
                flagHistory={flagHistory}
                onSave={handleSaveFlags}
                onClose={() => setOpenFlagsFor(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
```

- [ ] **Step 2: Update `src/renderer/src/App.css`**

Append these rules at the end of the file:

```css

.terminal-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
}

.terminal-picker select {
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #eee;
}
```

- [ ] **Step 3: Run typecheck, full test suite, and build**

Run: `npm run typecheck && npm test && npm run build`

Expected: Typecheck succeeds, all tests pass, `electron-vite build` succeeds (confirms Vite can bundle the renderer's value import from `src/main/launcher.ts`, the same cross-boundary pattern already proven for `src/main/flags.ts`).

- [ ] **Step 4: Manual verification — run the built app and exercise the picker**

Launch the built app (`electron .` from the project root, or `npm start`) and confirm:
1. The toolbar shows "Open in: [Windows Terminal ▾]" next to "Add folder".
2. Changing the dropdown to another option and then clicking a project launches it via that terminal (a new console window with the right shell should appear — verify at least Command Prompt and PowerShell directly, since both are guaranteed present on any Windows machine; Git Bash/WSL only if those happen to be installed).
3. Restart the app — the dropdown should remember the last-chosen terminal (persisted in `config.json`).
4. If a chosen terminal isn't installed (e.g. WSL on a machine without it), confirm the notice "<Terminal> not found — opened Command Prompt instead." appears and Command Prompt opens anyway.

Clean up any spawned terminal/app windows afterward.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "Add terminal choice picker to the toolbar"
```

---

## Verification Summary

After all three tasks: the toolbar has an "Open in:" dropdown for Windows Terminal, PowerShell, Command Prompt, Git Bash, or WSL. The choice persists in `config.json` and is used for every project launch, with an automatic fallback to Command Prompt (and a user-facing notice) if the chosen terminal fails to spawn.
