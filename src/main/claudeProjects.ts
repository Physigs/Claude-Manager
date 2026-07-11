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
