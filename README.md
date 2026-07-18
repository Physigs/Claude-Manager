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

If Windows Terminal (`wt.exe`) isn't installed, launching falls back to
opening a `cmd.exe` window running `claude` in the project's directory.

## Getting updates

If you don't have Node.js installed, you don't need it. Grab the latest
`claude-launcher.exe` from the
[Releases page](https://github.com/Physigs/Claude-Manager/releases/latest)
and run it directly — it's a self-contained portable app. A new release is
published automatically whenever the app version is bumped. No install
step, no npm required.
