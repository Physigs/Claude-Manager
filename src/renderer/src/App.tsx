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
