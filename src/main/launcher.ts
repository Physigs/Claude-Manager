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
      const fallback = spawnFn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', 'claude'], {
        detached: true,
        stdio: 'ignore',
        cwd: projectPath
      })
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
