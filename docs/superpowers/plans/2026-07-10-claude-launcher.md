# Claude Code Project Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop app that lists the user's Claude Code projects and launches a Windows Terminal running `claude` in the selected project's folder.

**Architecture:** Electron app (main process owns Node/OS access; React renderer is pure UI, talking to main only through a `contextBridge` preload script). Project list is computed by merging `~/.claude.json`'s `projects` keys with a local `pinned`/`hidden`/`manual` config file, then launched via `wt.exe` with a `cmd.exe` fallback.

**Tech Stack:** Electron, React 18, TypeScript, Vite (via `electron-vite`), Vitest for main-process unit tests.

## Global Constraints

- Windows-only: terminal launching uses `wt.exe` with a `cmd.exe` fallback; no cross-platform support.
- Config file lives at `%APPDATA%\claude-launcher\config.json`, obtained via Electron's `app.getPath('userData')`.
- Project source is the `projects` object's keys inside `~/.claude.json`.
- No automated UI tests — this is a personal utility; UI and end-to-end behavior are verified manually (see Task 9).
- Out of scope: custom per-project display names/icons, auto-update, editing/removing manual entries beyond hiding them.

---

### Task 1: Scaffold the Electron + Vite + React + TS project

**Files:**
- Create: `C:\workspaces\claude-launcher\.gitignore`
- Create: `C:\workspaces\claude-launcher\package.json`
- Create: `C:\workspaces\claude-launcher\tsconfig.json`
- Create: `C:\workspaces\claude-launcher\tsconfig.web.json`
- Create: `C:\workspaces\claude-launcher\electron.vite.config.ts`
- Create: `C:\workspaces\claude-launcher\vitest.config.ts`
- Create: `C:\workspaces\claude-launcher\src\main\index.ts`
- Create: `C:\workspaces\claude-launcher\src\preload\index.ts`
- Create: `C:\workspaces\claude-launcher\src\renderer\index.html`
- Create: `C:\workspaces\claude-launcher\src\renderer\src\main.tsx`
- Create: `C:\workspaces\claude-launcher\src\renderer\src\App.tsx`
- Create: `C:\workspaces\claude-launcher\src\renderer\src\App.css`

**Interfaces:**
- Produces: a buildable Electron skeleton that later tasks extend. No app-specific types yet.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
out/
dist/
*.log
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "claude-launcher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite build && electron .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.web.json"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.13",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.5.4",
    "vite": "^5.3.5",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`** (main + preload)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "out",
    "types": ["node"]
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts"]
}
```

- [ ] **Step 4: Create `tsconfig.web.json`** (renderer)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/renderer/src/**/*.ts", "src/renderer/src/**/*.tsx"]
}
```

- [ ] **Step 5: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer'
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts']
  }
})
```

- [ ] **Step 7: Create `src/main/index.ts`** (minimal window, extended in Task 6)

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

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

- [ ] **Step 8: Create `src/preload/index.ts`** (minimal, extended in Task 7)

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 9: Create `src/renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Claude Launcher</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Create `src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 11: Create `src/renderer/src/App.tsx`** (placeholder, replaced in Task 8)

```tsx
export default function App(): JSX.Element {
  return <div>Claude Launcher</div>
}
```

- [ ] **Step 12: Create `src/renderer/src/App.css`**

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 13: Install dependencies**

Run: `cd C:\workspaces\claude-launcher && npm install`
Expected: installs succeed, `node_modules/` created, no errors.

- [ ] **Step 14: Verify the skeleton builds**

Run: `cd C:\workspaces\claude-launcher && npm run build`
Expected: `out/main`, `out/preload`, `out/renderer` are produced with no errors.

- [ ] **Step 15: Commit**

```bash
cd C:\workspaces\claude-launcher
git add .gitignore package.json package-lock.json tsconfig.json tsconfig.web.json electron.vite.config.ts vitest.config.ts src
git commit -m "Scaffold Electron + Vite + React + TS skeleton"
```

---

### Task 2: Config module (pinned/hidden/manual persistence)

**Files:**
- Create: `C:\workspaces\claude-launcher\src\main\config.ts`
- Create: `C:\workspaces\claude-launcher\src\main\config.test.ts`

**Interfaces:**
- Produces: `interface LauncherConfig { pinned: string[]; hidden: string[]; manual: string[] }`, `loadConfig(configPath: string): Promise<LauncherConfig>`, `saveConfig(configPath: string, config: LauncherConfig): Promise<void>`. Task 6 calls both with a path built from `app.getPath('userData')`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/config.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: FAIL — `Cannot find module './config'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/main/config.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/main/config.ts src/main/config.test.ts
git commit -m "Add launcher config load/save module"
```

---

### Task 3: Claude Code project reader (`~/.claude.json`)

**Files:**
- Create: `C:\workspaces\claude-launcher\src\main\claudeProjects.ts`
- Create: `C:\workspaces\claude-launcher\src\main\claudeProjects.test.ts`

**Interfaces:**
- Produces: `readClaudeJsonProjects(claudeJsonPath: string): Promise<string[]>`. Task 6 calls this with `join(homedir(), '.claude.json')`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/claudeProjects.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: FAIL — `Cannot find module './claudeProjects'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/claudeProjects.ts
import { readFile } from 'fs/promises'

export async function readClaudeJsonProjects(claudeJsonPath: string): Promise<string[]> {
  try {
    const raw = await readFile(claudeJsonPath, 'utf-8')
    const data = JSON.parse(raw)
    if (data && typeof data.projects === 'object' && data.projects !== null) {
      return Object.keys(data.projects)
    }
    return []
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: PASS (7 tests total: 3 from Task 2 + 4 here).

- [ ] **Step 5: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/main/claudeProjects.ts src/main/claudeProjects.test.ts
git commit -m "Add ~/.claude.json project reader"
```

---

### Task 4: Project merge/sort logic

**Files:**
- Create: `C:\workspaces\claude-launcher\src\main\projectList.ts`
- Create: `C:\workspaces\claude-launcher\src\main\projectList.test.ts`

**Interfaces:**
- Consumes: none (pure function over plain data).
- Produces: `interface Project { path: string; name: string; pinned: boolean; missing: boolean }`, `mergeProjects(claudeJsonPaths: string[], config: { pinned: string[]; hidden: string[]; manual: string[] }): Project[]`, `pathToName(path: string): string`. Task 6 consumes `mergeProjects` and decorates `missing`; Task 7/8 consume the `Project` type.

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/projectList.test.ts
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: FAIL — `Cannot find module './projectList'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/projectList.ts
export interface Project {
  path: string
  name: string
  pinned: boolean
  missing: boolean
}

export interface ProjectListConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
}

export function mergeProjects(claudeJsonPaths: string[], config: ProjectListConfig): Project[] {
  const allPaths = new Set<string>([...claudeJsonPaths, ...config.manual])
  const hiddenSet = new Set(config.hidden)
  const pinnedSet = new Set(config.pinned)

  const projects: Project[] = []
  for (const path of allPaths) {
    if (hiddenSet.has(path)) continue
    projects.push({
      path,
      name: pathToName(path),
      pinned: pinnedSet.has(path),
      missing: false
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: PASS (16 tests total: 7 from Tasks 2-3 + 9 here).

- [ ] **Step 5: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/main/projectList.ts src/main/projectList.test.ts
git commit -m "Add project merge/sort logic"
```

---

### Task 5: Launcher module (spawn Windows Terminal, fall back to cmd.exe)

**Files:**
- Create: `C:\workspaces\claude-launcher\src\main\launcher.ts`
- Create: `C:\workspaces\claude-launcher\src\main\launcher.test.ts`

**Interfaces:**
- Produces: `interface LaunchResult { usedFallback: boolean }`, `launchProject(projectPath: string, spawnFn?: typeof spawn): Promise<LaunchResult>`. Task 6 calls `launchProject(projectPath)` (default `spawnFn`); Task 8's UI reads `result.usedFallback` to show a notice.

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/launcher.test.ts
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

    const result = await launchProject('C:/workspaces/Momentum', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:/workspaces/Momentum', 'claude'],
      expect.objectContaining({ detached: true })
    )
    expect(result).toEqual({ usedFallback: false })
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

    const result = await launchProject('C:/workspaces/Momentum', spawnFn as any)

    expect(spawnFn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', 'cd /d "C:/workspaces/Momentum" && claude'],
      expect.objectContaining({ detached: true })
    )
    expect(result).toEqual({ usedFallback: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: FAIL — `Cannot find module './launcher'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/launcher.ts
import { spawn } from 'child_process'

export interface LaunchResult {
  usedFallback: boolean
}

export function launchProject(
  projectPath: string,
  spawnFn: typeof spawn = spawn
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawnFn('wt.exe', ['-d', projectPath, 'claude'], {
      detached: true,
      stdio: 'ignore'
    })

    child.once('error', () => {
      const fallback = spawnFn(
        'cmd.exe',
        ['/c', 'start', '""', 'cmd.exe', '/k', `cd /d "${projectPath}" && claude`],
        { detached: true, stdio: 'ignore' }
      )
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: PASS (18 tests total).

- [ ] **Step 5: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/main/launcher.ts src/main/launcher.test.ts
git commit -m "Add terminal launcher with cmd.exe fallback"
```

---

### Task 6: Wire up the main process (window, IPC handlers, missing-folder check)

**Files:**
- Modify: `C:\workspaces\claude-launcher\src\main\index.ts` (replace Task 1's placeholder in full)

**Interfaces:**
- Consumes: `loadConfig`, `saveConfig`, `LauncherConfig` from `./config`; `readClaudeJsonProjects` from `./claudeProjects`; `mergeProjects`, `Project` from `./projectList`; `launchProject` from `./launcher`.
- Produces: IPC channels `projects:list` → `Project[]`, `projects:launch` (arg: `string`) → `LaunchResult`, `projects:togglePin` (arg: `string`) → `Project[]`, `projects:hide` (arg: `string`) → `Project[]`, `projects:addFolder` → `Project[]`. Task 7's preload wraps these exact channel names and payload shapes.

- [ ] **Step 1: Replace `src/main/index.ts` with the full implementation**

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

  ipcMain.handle('projects:launch', (_event, projectPath: string) => {
    return launchProject(projectPath)
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
    })
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

- [ ] **Step 2: Verify types**

Run: `cd C:\workspaces\claude-launcher && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Verify unit tests still pass**

Run: `cd C:\workspaces\claude-launcher && npm test`
Expected: PASS (18 tests, unchanged — this task only adds glue code).

- [ ] **Step 4: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/main/index.ts
git commit -m "Wire up IPC handlers for project list, launch, pin, hide, add folder"
```

---

### Task 7: Preload bridge

**Files:**
- Modify: `C:\workspaces\claude-launcher\src\preload\index.ts` (replace Task 1's placeholder in full)
- Create: `C:\workspaces\claude-launcher\src\renderer\src\env.d.ts`

**Interfaces:**
- Consumes: `Project` from `../main/projectList`; `LaunchResult` from `../main/launcher`.
- Produces: `window.api.listProjects(): Promise<Project[]>`, `window.api.launchProject(path: string): Promise<LaunchResult>`, `window.api.togglePin(path: string): Promise<Project[]>`, `window.api.hideProject(path: string): Promise<Project[]>`, `window.api.addFolder(): Promise<Project[]>`. Task 8's `App.tsx` calls these directly on `window.api`.

- [ ] **Step 1: Replace `src/preload/index.ts` with the full implementation**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Project } from '../main/projectList'
import type { LaunchResult } from '../main/launcher'

const api = {
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  launchProject: (path: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('projects:launch', path),
  togglePin: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:togglePin', path),
  hideProject: (path: string): Promise<Project[]> => ipcRenderer.invoke('projects:hide', path),
  addFolder: (): Promise<Project[]> => ipcRenderer.invoke('projects:addFolder')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 2: Create `src/renderer/src/env.d.ts`**

```ts
import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 3: Verify types**

Run: `cd C:\workspaces\claude-launcher && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "Expose typed project API to the renderer via preload"
```

---

### Task 8: Renderer UI

**Files:**
- Modify: `C:\workspaces\claude-launcher\src\renderer\src\App.tsx` (replace Task 1's placeholder in full)
- Modify: `C:\workspaces\claude-launcher\src\renderer\src\App.css` (replace Task 1's placeholder in full)

**Interfaces:**
- Consumes: `window.api.listProjects/launchProject/togglePin/hideProject/addFolder` from Task 7; `Project` type from `../../main/projectList`.
- Produces: the rendered UI — no further tasks consume this module.

- [ ] **Step 1: Replace `src/renderer/src/App.tsx` with the full implementation**

```tsx
// src/renderer/src/App.tsx
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../main/projectList'

function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    window.api.listProjects().then(setProjects)
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
              <button onClick={() => handleHide(project.path)}>Hide</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
```

- [ ] **Step 2: Replace `src/renderer/src/App.css` with the full implementation**

```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #1e1e1e;
  color: #eee;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 12px;
  box-sizing: border-box;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.search {
  flex: 1;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #eee;
}

.notice {
  background: #3a2f0f;
  color: #f0c674;
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 13px;
}

.project-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.project-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: #2a2a2a;
}

.project-card:hover {
  background: #333;
}

.project-info {
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.project-name {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  font-size: 11px;
  color: #ff8080;
  border: 1px solid #ff8080;
  border-radius: 3px;
  padding: 0 4px;
}

.project-path {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.project-actions button {
  background: transparent;
  border: 1px solid #555;
  color: #ccc;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.project-actions button:hover {
  background: #444;
}

.toolbar button {
  background: #3a5a8a;
  border: none;
  color: white;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
}
```

- [ ] **Step 3: Verify types**

Run: `cd C:\workspaces\claude-launcher && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd C:\workspaces\claude-launcher
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "Build project list UI: search, launch, pin, hide, add folder"
```

---

### Task 9: Manual end-to-end verification and README

**Files:**
- Create: `C:\workspaces\claude-launcher\README.md`

**Interfaces:**
- Consumes: the fully wired app from Tasks 1–8.
- Produces: none (final verification task).

- [ ] **Step 1: Run the full automated check suite**

Run: `cd C:\workspaces\claude-launcher && npm test && npm run typecheck && npm run build`
Expected: all three succeed with no errors.

- [ ] **Step 2: Launch the app in dev mode**

Run: `cd C:\workspaces\claude-launcher && npm run dev`
Expected: a window titled "Claude Launcher" opens showing a project list that includes the entries from `~/.claude.json` (e.g. `C:/workspaces`, `C:/workspaces/Momentum`, `C:/workspaces/work/momentum`, `C:/Users/brand`), sorted alphabetically.

- [ ] **Step 3: Verify launch behavior**

Action: click one of the listed projects.
Expected: a Windows Terminal window opens, working directory set to that project's folder, running `claude`.

- [ ] **Step 4: Verify pin/hide persistence**

Action: pin one project, hide another, close the app window, then re-run `npm run dev`.
Expected: the pinned project appears first in the list; the hidden project no longer appears. Inspect `%APPDATA%\claude-launcher\config.json` and confirm it contains the matching `pinned`/`hidden` arrays.

- [ ] **Step 5: Verify "Add folder"**

Action: click "Add folder," pick a folder not already in the list (e.g. `C:\workspaces\weight-tracker`), confirm the dialog.
Expected: the folder appears in the list, pinned, and clicking it launches a terminal there as in Step 3.

- [ ] **Step 6: Verify search**

Action: type part of a project name into the search box.
Expected: the list filters to matching projects by name or path.

- [ ] **Step 7: Create `README.md`**

```markdown
# Claude Launcher

A small desktop app that lists your Claude Code projects and opens a
Windows Terminal running `claude` in whichever one you click.

## Usage

```bash
npm install
npm run dev     # run in development
npm start       # build and run the packaged app
```

Projects are auto-discovered from `~/.claude.json`. Use "Add folder" to
include a project Claude Code hasn't been run in yet. Pin, hide, and
search from the toolbar.

Config (pinned/hidden/manual projects) is stored at
`%APPDATA%\claude-launcher\config.json`.
```

- [ ] **Step 8: Commit**

```bash
cd C:\workspaces\claude-launcher
git add README.md
git commit -m "Add README with usage instructions"
```
