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
