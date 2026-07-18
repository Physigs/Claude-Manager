# Per-Project Launch Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach `claude` CLI flags to a specific project (via a checklist of common flags plus free text), saved per project and reusable from a shared history dropdown, then have those flags passed to `claude` on launch.

**Architecture:** Pure flag-string logic (building/parsing/history bookkeeping) lives in a new `src/main/flags.ts`, unit tested like the rest of `src/main`. `LauncherConfig` gains `projectFlags`/`flagHistory` fields. `launchProject` gains a `flags` parameter appended as extra argv to both the `wt.exe` and `cmd.exe` spawn paths. New IPC handlers (`projects:saveFlags`, `projects:getFlagHistory`) expose this to the renderer, where a new `FlagsPopover` component (opened per project card) lets the user toggle checkboxes, type free text, or pick a history entry.

**Tech Stack:** Existing stack only — TypeScript, Electron IPC, React, Vitest (`node` environment, `src/main/**/*.test.ts`).

## Global Constraints

- No semicolons, matching existing style in every file in this repo.
- Functions use explicit return types (`: void`, `: Promise<Project[]>`, `: JSX.Element`), matching existing style.
- Vitest is configured for `src/main/**/*.test.ts` only (see `vitest.config.ts`) — there is no renderer/React test setup in this repo, and adding one is out of scope. Renderer changes (Task 4) are verified via typecheck + manual run, not automated tests, matching the fact that `App.tsx`, `index.ts`, and `preload/index.ts` have zero existing test coverage today.
- Checklist flags (fixed, from `docs/superpowers/specs/2026-07-18-launch-flags-design.md`): `--dangerously-skip-permissions`, `--continue`, `--resume`, `--verbose`, `--ide`.
- Flag history cap: 20 distinct entries, most recent first, deduplicated by exact string match.

Spec reference: `docs/superpowers/specs/2026-07-18-launch-flags-design.md`

---

### Task 1: Config schema + flag bookkeeping logic

**Files:**
- Modify: `src/main/config.ts`
- Modify: `src/main/config.test.ts`
- Create: `src/main/flags.ts`
- Create: `src/main/flags.test.ts`

**Interfaces:**
- Produces: `LauncherConfig` interface now includes `projectFlags: Record<string, string>` and `flagHistory: string[]` — consumed by Task 2 (`projectList.ts`) and Task 3 (`index.ts`).
- Produces: `recordFlagUsage(config: LauncherConfig, projectPath: string, flags: string): void` — consumed by Task 3.
- Produces: `KNOWN_FLAGS: string[]`, `buildFlagString(checked: string[], freeText: string): string`, `parseFlagString(flags: string): { checked: string[]; freeText: string }` — consumed by Task 4 (renderer).

- [ ] **Step 1: Write the failing tests for the updated `config.ts`**

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- config.test.ts`

Expected: FAIL — `config.pinned`/etc. mismatched shape (missing `projectFlags`/`flagHistory`), since `config.ts` doesn't produce them yet.

- [ ] **Step 3: Update `src/main/config.ts`**

Replace the full contents of `src/main/config.ts` with:

```ts
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export interface LauncherConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
  projectFlags: Record<string, string>
  flagHistory: string[]
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
      flagHistory: Array.isArray(data.flagHistory) ? data.flagHistory : []
    }
  } catch {
    return { pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [] }
  }
}

export async function saveConfig(configPath: string, config: LauncherConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
```

Note: this also fixes a latent bug — the old `catch { return { ...DEFAULT_CONFIG } }` shallow-spread a module-level constant, so every "file missing/invalid" load shared the *same* array/object references across calls. The "do not share state" test in Step 1 catches this; the new catch branch returns fresh literals every call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- config.test.ts`

Expected: PASS (all tests in `config.test.ts`).

- [ ] **Step 5: Write the failing tests for `flags.ts`**

Create `src/main/flags.test.ts`:

```ts
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
  return { pinned: [], hidden: [], manual: [], projectFlags: {}, flagHistory: [] }
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- flags.test.ts`

Expected: FAIL — `Cannot find module './flags'` (file doesn't exist yet).

- [ ] **Step 7: Create `src/main/flags.ts`**

```ts
import type { LauncherConfig } from './config'

export const KNOWN_FLAGS = [
  '--dangerously-skip-permissions',
  '--continue',
  '--resume',
  '--verbose',
  '--ide'
]

export const FLAG_HISTORY_LIMIT = 20

export function recordFlagUsage(config: LauncherConfig, projectPath: string, flags: string): void {
  const trimmed = flags.trim()
  if (!trimmed) {
    delete config.projectFlags[projectPath]
    return
  }
  config.projectFlags[projectPath] = trimmed
  config.flagHistory = [trimmed, ...config.flagHistory.filter((f) => f !== trimmed)].slice(
    0,
    FLAG_HISTORY_LIMIT
  )
}

export function buildFlagString(checked: string[], freeText: string): string {
  return [...checked, freeText.trim()].filter(Boolean).join(' ')
}

export function parseFlagString(flags: string): { checked: string[]; freeText: string } {
  const tokens = flags.trim() ? flags.trim().split(/\s+/) : []
  const checked = KNOWN_FLAGS.filter((flag) => tokens.includes(flag))
  const freeText = tokens.filter((token) => !KNOWN_FLAGS.includes(token)).join(' ')
  return { checked, freeText }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- flags.test.ts`

Expected: PASS (all tests in `flags.test.ts`).

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`

Expected: All tests pass (22 existing + new ones), typecheck succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/main/config.ts src/main/config.test.ts src/main/flags.ts src/main/flags.test.ts
git commit -m "Add projectFlags/flagHistory to config and flag bookkeeping logic"
```

---

### Task 2: Wire flags into project list and launcher

**Files:**
- Modify: `src/main/projectList.ts`
- Modify: `src/main/projectList.test.ts`
- Modify: `src/main/launcher.ts`
- Modify: `src/main/launcher.test.ts`

**Interfaces:**
- Consumes: `LauncherConfig.projectFlags` (Task 1).
- Produces: `Project.flags: string` — consumed by Task 3 (`index.ts` reads `config.projectFlags` directly, not `Project.flags`) and Task 4 (renderer reads `project.flags` to pre-populate the popover).
- Produces: `launchProject(projectPath: string, flags: string, spawnFn?): Promise<LaunchResult>` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests for `projectList.ts`**

Add these two tests inside the existing `describe('mergeProjects', ...)` block in `src/main/projectList.test.ts` (after the existing tests, before the closing `})`):

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- projectList.test.ts`

Expected: FAIL — `result[0].flags` is `undefined` (property doesn't exist on `Project` yet).

- [ ] **Step 3: Update `src/main/projectList.ts`**

Replace the full contents with:

```ts
export interface Project {
  path: string
  name: string
  pinned: boolean
  missing: boolean
  flags: string
}

export interface ProjectListConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
  projectFlags?: Record<string, string>
}

export function mergeProjects(claudeJsonPaths: string[], config: ProjectListConfig): Project[] {
  const allPaths = new Set<string>([...claudeJsonPaths, ...config.manual])
  const hiddenSet = new Set(config.hidden)
  const pinnedSet = new Set(config.pinned)
  const projectFlags = config.projectFlags ?? {}

  const projects: Project[] = []
  for (const path of allPaths) {
    if (hiddenSet.has(path)) continue
    projects.push({
      path,
      name: pathToName(path),
      pinned: pinnedSet.has(path),
      missing: false,
      flags: projectFlags[path] ?? ''
    })
  }

  projects.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return projects
}

export function pathToName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || normalized
}
```

`projectFlags` is optional on `ProjectListConfig` (defaulting to `{}` inside the function) specifically so the existing test call sites that construct config objects without it don't need to change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- projectList.test.ts`

Expected: PASS (all tests in `projectList.test.ts`).

- [ ] **Step 5: Write the failing tests for `launcher.ts`**

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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- launcher.test.ts`

Expected: FAIL — TS error, `launchProject` called with 3 args but only accepts 2 (or, once `flags` is added positionally without updating the implementation, the assertions on spawn args will fail since flags aren't appended yet). Either way, red before Step 7.

- [ ] **Step 7: Update `src/main/launcher.ts`**

```ts
import { spawn } from 'child_process'

export interface LaunchResult {
  usedFallback: boolean
}

export function launchProject(
  projectPath: string,
  flags: string,
  spawnFn: typeof spawn = spawn
): Promise<LaunchResult> {
  const flagArgs = flags.trim() ? flags.trim().split(/\s+/) : []

  return new Promise((resolve) => {
    const child = spawnFn('wt.exe', ['-d', projectPath, 'claude', ...flagArgs], {
      detached: true,
      stdio: 'ignore'
    })

    child.once('error', () => {
      const fallback = spawnFn(
        'cmd.exe',
        ['/c', 'start', '""', 'cmd.exe', '/k', 'claude', ...flagArgs],
        {
          detached: true,
          stdio: 'ignore',
          cwd: projectPath
        }
      )
      fallback.once('error', () => {
        // swallow: fallback spawn failed (e.g. nonexistent cwd); nothing further to try
      })
      fallback.unref()
      resolve({ usedFallback: true })
    })

    child.once('spawn', () => {
      child.unref()
      resolve({ usedFallback: false })
    })
  })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- launcher.test.ts`

Expected: PASS (all tests in `launcher.test.ts`).

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`

Expected: All tests pass, typecheck succeeds. Note: `npm run typecheck` will still show an error at this point from `src/main/index.ts` calling `launchProject(projectPath)` with only one argument — that's expected and gets fixed in Task 3. If you want a clean typecheck before committing this task, that's fine too; it'll be fixed either way by the end of Task 3.

- [ ] **Step 10: Commit**

```bash
git add src/main/projectList.ts src/main/projectList.test.ts src/main/launcher.ts src/main/launcher.test.ts
git commit -m "Add flags field to Project and pass flags through to launchProject"
```

---

### Task 3: IPC handlers and preload bridge

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `recordFlagUsage` (Task 1), `launchProject(path, flags, spawnFn?)` (Task 2).
- Produces: IPC channels `projects:saveFlags` (path, flags) → `Project[]`, `projects:getFlagHistory` () → `string[]`, and updates `projects:launch` to no longer take flags from the renderer (it reads them from config server-side). Consumed by Task 4 via `window.api.saveFlags` / `window.api.getFlagHistory`.

No dedicated automated tests for this task — `index.ts` and `preload/index.ts` have no existing test coverage in this repo (Electron `ipcMain`/`BrowserWindow` glue isn't unit tested here today), and adding that harness is out of scope. Verified by typecheck (Step 3) and the manual run in Task 4's final step.

- [ ] **Step 1: Update `src/main/index.ts`**

Replace the full contents with:

```ts
// src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { loadConfig, saveConfig, LauncherConfig } from './config'
import { readClaudeJsonProjects } from './claudeProjects'
import { mergeProjects, Project } from './projectList'
import { launchProject } from './launcher'
import { recordFlagUsage } from './flags'

const CLAUDE_JSON_PATH = join(homedir(), '.claude.json')

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

async function buildProjectList(): Promise<Project[]> {
  const [claudeJsonPaths, config] = await Promise.all([
    readClaudeJsonProjects(CLAUDE_JSON_PATH),
    loadConfig(getConfigPath())
  ])
  const projects = mergeProjects(claudeJsonPaths, config)
  return projects.map((project) => ({
    ...project,
    missing: !existsSync(project.path)
  }))
}

async function updateConfig(mutate: (config: LauncherConfig) => void): Promise<Project[]> {
  const configPath = getConfigPath()
  const config = await loadConfig(configPath)
  mutate(config)
  await saveConfig(configPath, config)
  return buildProjectList()
}

function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('projects:list', () => buildProjectList())

  ipcMain.handle('projects:launch', async (_event, projectPath: string) => {
    const config = await loadConfig(getConfigPath())
    return launchProject(projectPath, config.projectFlags[projectPath] ?? '')
  })

  ipcMain.handle('projects:togglePin', (_event, projectPath: string) => {
    return updateConfig((config) => {
      if (config.pinned.includes(projectPath)) {
        config.pinned = config.pinned.filter((p) => p !== projectPath)
      } else {
        config.pinned = [...config.pinned, projectPath]
      }
    })
  })

  ipcMain.handle('projects:hide', (_event, projectPath: string) => {
    return updateConfig((config) => {
      if (!config.hidden.includes(projectPath)) {
        config.hidden = [...config.hidden, projectPath]
      }
    })
  })

  ipcMain.handle('projects:addFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return buildProjectList()
    }
    const folder = result.filePaths[0]
    return updateConfig((config) => {
      if (!config.manual.includes(folder)) {
        config.manual = [...config.manual, folder]
      }
      if (!config.pinned.includes(folder)) {
        config.pinned = [...config.pinned, folder]
      }
      config.hidden = config.hidden.filter((p) => p !== folder)
    })
  })

  ipcMain.handle('projects:saveFlags', (_event, projectPath: string, flags: string) => {
    return updateConfig((config) => recordFlagUsage(config, projectPath, flags))
  })

  ipcMain.handle('projects:getFlagHistory', async () => {
    const config = await loadConfig(getConfigPath())
    return config.flagHistory
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  registerIpcHandlers(win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Update `src/preload/index.ts`**

Replace the full contents with:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Project } from '../main/projectList'
import type { LaunchResult } from '../main/launcher'

const api = {
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  launchProject: (path: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('projects:launch', path),
  togglePin: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:togglePin', path),
  hideProject: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:hide', path),
  addFolder: (): Promise<Project[]> => ipcRenderer.invoke('projects:addFolder'),
  saveFlags: (path: string, flags: string): Promise<Project[]> =>
    ipcRenderer.invoke('projects:saveFlags', path, flags),
  getFlagHistory: (): Promise<string[]> => ipcRenderer.invoke('projects:getFlagHistory')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

`src/renderer/src/env.d.ts` already types `Window.api` as `Api` (`typeof api`), so the new methods are automatically available to the renderer with no further changes.

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm test && npm run typecheck`

Expected: All tests pass. Typecheck now succeeds cleanly (the Task 2 note about a transient error is resolved, since `projects:launch` now calls `launchProject` with both required arguments).

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "Add IPC handlers for saving per-project flags and reading flag history"
```

---

### Task 4: Flags popover UI

**Files:**
- Create: `src/renderer/src/FlagsPopover.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

**Interfaces:**
- Consumes: `KNOWN_FLAGS`, `buildFlagString`, `parseFlagString` (Task 1, imported cross-process the same way `App.tsx` already imports the `Project` type from `../../main/projectList`), `window.api.saveFlags` / `window.api.getFlagHistory` (Task 3), `Project.flags` (Task 2).

- [ ] **Step 1: Create `src/renderer/src/FlagsPopover.tsx`**

```tsx
import { useState } from 'react'
import type { Project } from '../../main/projectList'
import { KNOWN_FLAGS, buildFlagString, parseFlagString } from '../../main/flags'

interface FlagsPopoverProps {
  project: Project
  flagHistory: string[]
  onSave: (path: string, flags: string) => void
  onClose: () => void
}

function FlagsPopover({ project, flagHistory, onSave, onClose }: FlagsPopoverProps): JSX.Element {
  const initial = parseFlagString(project.flags)
  const [checked, setChecked] = useState<Set<string>>(new Set(initial.checked))
  const [freeText, setFreeText] = useState(initial.freeText)

  function toggleFlag(flag: string): void {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(flag)) next.delete(flag)
      else next.add(flag)
      return next
    })
  }

  function applyHistoryEntry(entry: string): void {
    const parsed = parseFlagString(entry)
    setChecked(new Set(parsed.checked))
    setFreeText(parsed.freeText)
  }

  function handleSave(): void {
    onSave(project.path, buildFlagString([...checked], freeText))
    onClose()
  }

  return (
    <div className="flags-popover">
      <div className="flags-checklist">
        {KNOWN_FLAGS.map((flag) => (
          <label key={flag} className="flags-checkbox">
            <input type="checkbox" checked={checked.has(flag)} onChange={() => toggleFlag(flag)} />
            {flag}
          </label>
        ))}
      </div>
      <input
        className="flags-freetext"
        placeholder="Other flags, e.g. --model opus"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
      />
      {flagHistory.length > 0 && (
        <select
          className="flags-history"
          value=""
          onChange={(e) => e.target.value && applyHistoryEntry(e.target.value)}
        >
          <option value="">Reuse previous…</option>
          {flagHistory.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      )}
      <div className="flags-actions">
        <button onClick={handleSave}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export default FlagsPopover
```

- [ ] **Step 2: Update `src/renderer/src/App.tsx`**

Replace the full contents with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../main/projectList'
import FlagsPopover from './FlagsPopover'

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [flagHistory, setFlagHistory] = useState<string[]>([])
  const [openFlagsFor, setOpenFlagsFor] = useState<string | null>(null)

  useEffect(() => {
    window.api.listProjects().then(setProjects)
    window.api.getFlagHistory().then(setFlagHistory)
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
    setNotice(result.usedFallback ? 'Windows Terminal not found — opened cmd.exe instead.' : null)
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

  return (
    <div className="app">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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

- [ ] **Step 3: Update `src/renderer/src/App.css`**

Replace the `.project-card` rule and add the new rules. Find:

```css
.project-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: #2a2a2a;
}
```

Replace with:

```css
.project-card {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: #2a2a2a;
}

.project-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

Then append these new rules at the end of the file:

```css

.flags-popover {
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
  background: #1e1e1e;
  border: 1px solid #444;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flags-checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flags-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.flags-freetext,
.flags-history {
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #eee;
  font-size: 12px;
}

.flags-actions {
  display: flex;
  gap: 6px;
}

.flags-actions button {
  background: #3a5a8a;
  border: none;
  color: white;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
```

- [ ] **Step 4: Run typecheck and the full test suite**

Run: `npm run typecheck && npm test`

Expected: Typecheck succeeds, all tests pass (this task adds no new automated tests, but must not break existing ones).

- [ ] **Step 5: Manual verification — run the dev app and exercise the Flags UI**

Run: `npm run dev` (leave it running)

With the app window open:
1. Click "Flags" on any project card — the popover should appear below that card's row with 5 checkboxes, a free-text input, and Save/Cancel buttons (no history dropdown yet, since none has been saved).
2. Check "--dangerously-skip-permissions" and "--continue", type `--model opus` in free text, click Save. The popover should close.
3. Click "Flags" on the same project again — the checkboxes and free text should be pre-populated with what was saved (parsed back from the persisted string).
4. Click "Flags" on a *different* project — a "Reuse previous…" dropdown should now appear listing the flag string saved in step 2. Selecting it should populate that project's checkboxes/free text to match.
5. Click the project name (not the Flags button) to launch it — confirm no console errors appear and a terminal opens (existing launch behavior, now with the saved flags appended to the `claude` invocation, visible in the terminal's command line if you inspect it).

Stop the dev server (Ctrl+C) once verified.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/FlagsPopover.tsx src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "Add Flags popover UI for per-project launch flags with history reuse"
```

---

## Verification Summary

After all four tasks: clicking "Flags" on a project card opens a popover to toggle common `claude` CLI flags, add custom ones via free text, and reuse any previously-saved combination from any project via a history dropdown. Saved flags persist in `config.json` and are appended to the `claude` invocation the next time that project is launched, for both the `wt.exe` and `cmd.exe` fallback paths.
