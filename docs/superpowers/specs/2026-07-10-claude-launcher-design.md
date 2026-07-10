# Claude Code Project Launcher — Design

Date: 2026-07-10

## Purpose

A small desktop app that lists the user's Claude Code projects and, on
click, opens a terminal running `claude` in that project's folder — replacing
manually navigating to a folder and typing `claude` each time.

## Stack

Electron + React (Vite-built renderer), TypeScript throughout.

## Architecture

Standard Electron two-process split:

- **Main process** — owns all Node/OS access: reads `~/.claude.json`,
  reads/writes local config, spawns Windows Terminal, shows the native
  folder picker.
- **Renderer (React)** — pure UI: search box, list of project cards,
  add-folder button. Talks to main only through a narrow `preload.ts`
  bridge (contextBridge, no direct Node access in the renderer).
- **Persisted config** — `%APPDATA%\claude-launcher\config.json`, storing
  three arrays:
  - `pinned`: string[] (paths)
  - `hidden`: string[] (paths)
  - `manual`: string[] (paths added via "Browse for folder" that Claude
    Code hasn't touched yet)

## Key files

| File | Responsibility |
|---|---|
| `src/main/index.ts` | Window creation, IPC wiring, spawning `wt.exe` |
| `src/main/projects.ts` | Reads `~/.claude.json` + `config.json`, merges into one sorted list |
| `src/main/preload.ts` | Exposes `listProjects()`, `launchProject()`, `togglePin()`, `hideProject()`, `addFolder()` to the renderer |
| `src/renderer/App.tsx` | Project list UI, search, pin/hide/add controls |

Project display name is the last path segment of the folder; the full path
shows as a subtitle. Sort order: pinned first, then alphabetical by name.

## Data flow

1. App launches → renderer calls `listProjects()`.
2. Main reads the `projects` object's keys from `~/.claude.json`, merges
   with `manual` paths from `config.json`, drops anything in `hidden`,
   sorts pinned-first then alphabetically, returns the list.
3. Click a project → renderer calls `launchProject(path)` → main runs
   `wt.exe -d "<path>" claude` as a detached process (app does not wait on
   it).
4. Pin/hide toggle → main updates `config.json`, returns the refreshed
   list.
5. "Add folder" → native folder picker (`dialog.showOpenDialog`) →
   selected path is appended to `manual` and auto-pinned → list refreshes.

## Error handling

- `~/.claude.json` missing or unreadable → don't crash; show only
  manually-added/pinned entries.
- `wt.exe` not found → fall back to
  `cmd.exe /k cd /d <path> && claude`, with a small inline notice that the
  fallback was used.
- A listed folder no longer exists on disk → show a "missing" badge
  instead of erroring; the user can still hide it from the list.

## Testing

Personal utility — no formal automated test suite. Manual verification:

- List matches `~/.claude.json`'s projects plus any manually added
  folders.
- Click launch → confirm a Windows Terminal window opens, cd'd correctly,
  running `claude`.
- Pin/hide/add a folder, restart the app, confirm state persisted.
- Simulate `wt.exe` being unavailable to confirm the `cmd.exe` fallback
  works.

## Out of scope (YAGNI)

- Editing/removing manually-added folders beyond hide.
- Custom display names or icons per project.
- Cross-platform support (Windows-only for now, via `wt.exe`/`cmd.exe`).
- Auto-update mechanism for the app itself.
