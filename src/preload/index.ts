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
