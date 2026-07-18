# Per-Project Launch Flags Design

Date: 2026-07-18

## Goal

Let a user attach `claude` CLI flags (e.g. `--dangerously-skip-permissions`)
to a specific project, saved and reused every time that project is
launched, with a shared history of past flag combinations they can pick
from across any project.

## Flags UI

A "Flags" button on each project card opens a popover with:

1. **Checklist** of the most common toggle flags for interactive sessions
   (no argument required):
   - `--dangerously-skip-permissions`
   - `--continue`
   - `--resume`
   - `--verbose`
   - `--ide`
2. **Free-text field** for anything else (flags that take a value, e.g.
   `--model opus`, `--permission-mode plan`, `--add-dir ../shared`).
3. **History dropdown** listing previously-used flag strings (from any
   project), most recent first. Selecting one overwrites the current
   checkboxes/text with that saved combination.
4. **Save** button: persists the resolved flag string for this project and
   pushes it to the front of the shared history if new.

Flags not on the checklist are not validated — whatever the user types in
free text is passed through as-is (YAGNI: no per-flag validation against
the CLI reference).

## Data model

Extend `LauncherConfig` (`config.json`, already storing `pinned`/`hidden`/
`manual`) with two new fields:

```ts
interface LauncherConfig {
  pinned: string[]
  hidden: string[]
  manual: string[]
  projectFlags: Record<string, string> // projectPath -> flag string
  flagHistory: string[] // distinct flag strings, most recent first, capped at 20
}
```

- `projectFlags[path]` is the resolved flag string for a project (e.g.
  `"--dangerously-skip-permissions --continue"`), built by joining checked
  boxes and the free-text field with spaces. Absent key = no flags.
- `flagHistory` is deduplicated (exact string match) and capped at the 20
  most recent distinct entries, shared globally across all projects.
- `loadConfig` validates each field independently (existing pattern: e.g.
  `Array.isArray(data.pinned) ? data.pinned : []`). Add the same style of
  check for the two new fields so old config files without them still load
  cleanly: `projectFlags` defaults to `{}` unless `data.projectFlags` is a
  plain object; `flagHistory` defaults to `[]` unless
  `Array.isArray(data.flagHistory)`.

## Launch flow

`launchProject(projectPath, flags, spawnFn)` gains a `flags: string`
parameter. Non-empty flags are split on whitespace and appended as extra
argv entries after `claude` in both the `wt.exe` and `cmd.exe` fallback
spawn calls:

- `wt.exe -d <path> claude --dangerously-skip-permissions --continue`
- `cmd.exe /k claude --dangerously-skip-permissions --continue` (cwd set
  via the existing `cwd` option)

Whitespace-splitting is a known limitation: a flag value containing spaces
(e.g. `--system-prompt "hello world"`) won't round-trip correctly. Out of
scope for this iteration — YAGNI until someone needs it.

## IPC surface

New handlers in `src/main/index.ts`:
- `projects:getFlagHistory` → returns `flagHistory` from config.
- `projects:saveFlags` (`projectPath`, `flags`) → sets
  `projectFlags[projectPath]`, unshifts `flags` into `flagHistory` if
  non-empty and not already present (moves to front if it exists further
  back), caps history at 20, saves config, returns updated project list
  (matching the existing `updateConfig` pattern used by pin/hide/addFolder).

`projects:launch` handler changes signature to also read
`config.projectFlags[projectPath]` and pass it to `launchProject`.

`Project` type (in `projectList.ts`) gains a `flags: string` field
(resolved from `config.projectFlags[path]`, default `''`) so the renderer
can pre-populate the popover without a separate round-trip.

## Error handling

- No flags saved for a project → `flags` is `''`, launch behaves exactly
  as it does today (no behavior change for existing users).
- Empty/whitespace-only flags on save → treated as "no flags" (removes the
  `projectFlags[path]` entry rather than storing an empty string), not
  added to history.

## Out of scope

- Validating free-text flags against the real CLI flag list.
- Flags with embedded spaces / shell-style quoting.
- Per-flag arguments in the checklist (e.g. picking a resume session ID) —
  those go in free text.
