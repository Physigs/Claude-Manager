# Terminal Choice Setting Design

Date: 2026-07-18

## Goal

Let the user pick which terminal/shell `claude` launches in — Windows
Terminal (today's default), PowerShell, Command Prompt, Git Bash, or WSL —
via a single global setting, instead of always using Windows Terminal with
a Command Prompt fallback.

## Research

Per Claude Code's own docs and current install guidance, Claude Code runs
in any terminal with no special configuration; on Windows the realistic
targets for a launcher app to spawn as a standalone process are:

- Windows Terminal (`wt.exe`)
- PowerShell (`powershell.exe`)
- Command Prompt (`cmd.exe`)
- Git Bash (`bash.exe`, from Git for Windows)
- WSL (`wsl.exe`)

Editor-integrated terminals (VS Code, Cursor, Zed, JetBrains) and
macOS/Linux-only terminals (Ghostty, Kitty, iTerm2, etc.) are out of scope
— they don't fit the "spawn a standalone process for this project" model
this app uses, and/or don't apply on Windows.

## Setting storage

Add `terminal: TerminalId` to `LauncherConfig`, where:

```ts
type TerminalId = 'wt' | 'powershell' | 'cmd' | 'gitbash' | 'wsl'
```

Defaults to `'wt'` — preserves today's behavior exactly for existing
config files (validated the same way as other fields: falls back to
`'wt'` if the stored value isn't one of the five known IDs).

## UI

A labeled `<select>` in the toolbar, next to "Add folder": "Open in:
[Windows Terminal ▾]". Changing it saves immediately via a new IPC call
(`projects:setTerminal`) — no separate save step.

## Launch commands per target

All non-`wt` targets reuse the existing technique already proven for the
`cmd.exe` fallback: set the spawn `cwd` option to `projectPath` rather
than embedding a `cd`/`Set-Location` command, avoiding nested-quoting
bugs. All are wrapped in `cmd.exe /c start ""` to get a persistent,
visible console window (the same trick the current `cmd.exe` fallback
uses and that earlier project history found necessary — spawning a
console subsystem process directly from Electron's GUI-subsystem main
process doesn't reliably produce a visible, persistent window without it).

| Target | Command (argv) | cwd |
|---|---|---|
| `wt` | `wt.exe -d <path> claude ...flags` | n/a (uses `-d`) |
| `powershell` | `cmd.exe /c start "" powershell.exe -NoExit -Command claude ...flags` | `projectPath` |
| `cmd` | `cmd.exe /c start "" cmd.exe /k claude ...flags` | `projectPath` |
| `gitbash` | `cmd.exe /c start "" bash.exe -c "claude ...flags; exec bash"` | `projectPath` |
| `wsl` | `cmd.exe /c start "" wsl.exe bash -c "claude ...flags; exec bash"` | `projectPath` |

`wt` stays a direct spawn (it's a GUI app that manages its own window, as
today). Every other target is spawned via the `cmd.exe /c start ""`
wrapper.

## Fallback behavior

If the selected terminal fails to spawn (`error` event — e.g. Git Bash or
WSL not installed), fall back to Command Prompt (`cmd`), matching today's
`wt` → `cmd` fallback behavior generalized to any chosen target. The
`LaunchResult.usedFallback` flag and the existing "Windows Terminal not
found — opened cmd.exe instead" notice continue to work unchanged (the
notice text becomes generic: "<chosen terminal> not found — opened
Command Prompt instead").

## Known limitations (out of scope for this iteration)

- **Git Bash / WSL require `claude` on `PATH` in that specific
  environment.** WSL has a separate `PATH` from Windows entirely; Git
  Bash inherits Windows `PATH` but not always identically. No
  installation-detection or pre-flight check is implemented — this
  follows the existing pattern in this codebase (`wt.exe` isn't
  pre-checked either; failure is only discovered reactively via the
  `error` spawn event).
- **WSL working directory translation.** Relying on `cwd: projectPath` for
  `wsl.exe` assumes its automatic Windows-path-to-`/mnt/c/...` translation
  for the initial shell directory (default behavior in current WSL
  versions). No manual path translation is implemented.
- Neither Git Bash nor WSL could be exercised in the development sandbox
  (neither is installed there) — implemented from documented command
  patterns, not empirically verified end-to-end.

## Out of scope

- Per-project terminal choice (this is a single global setting).
- Auto-detecting which terminals are actually installed to filter the
  dropdown.
- Editor-integrated or non-Windows terminals.
