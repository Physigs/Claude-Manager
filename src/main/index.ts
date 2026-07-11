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
      config.hidden = config.hidden.filter((p) => p !== folder)
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
