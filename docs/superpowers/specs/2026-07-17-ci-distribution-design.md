# CI Pipeline & Distribution Design

Date: 2026-07-17

## Goal

Let people distribute and update Claude Launcher by simply pulling the git
repo — no Node.js/npm or build tooling required on their machine. A GitHub
Actions workflow builds a portable Windows executable and commits it back
into the repo whenever a new version is released.

## Packaging

- Add `electron-builder` as a devDependency.
- Configure it to produce a **portable** Windows target: a single
  self-contained `.exe`, no installer/uninstaller, no code signing (personal
  tool — an unsigned-publisher SmartScreen prompt on first run is an
  accepted trade-off).
- New npm script: `package` → `electron-vite build && electron-builder --win portable`.
- electron-builder output directory: `release/`.

## CI Workflow

File: `.github/workflows/build-and-release.yml`.

Trigger: `push` to `main`.

Steps:
1. Checkout, setup Node, `npm ci`.
2. `npm run typecheck`.
3. `npm test`.
4. If either check fails, stop — no packaging, no commit. The exe already
   in the repo (if any) is left untouched until a fix is pushed.
5. **Version gate**: compare the `version` field in `package.json` between
   `HEAD` and `HEAD^`. If unchanged, the workflow ends here (fast no-op for
   ordinary pushes).
6. If the version changed: run `npm run package`, then commit the resulting
   `release/claude-launcher.exe` back to `main` as the `github-actions[bot]`
   identity, with `[skip ci]` in the commit message so the write-back push
   doesn't re-trigger the workflow.

Release flow for the maintainer: bump `version` in `package.json`, push to
`main`, CI builds and commits the new exe automatically.

## Repo size trade-off

A portable Electron exe is roughly 60–100MB. Committing on every push would
bloat git history quickly, so packaging only happens on a version bump
(see the version gate above), not on every push. This was chosen over
Git LFS to keep the "just `git pull` and run" experience free of any extra
setup (LFS would require `git lfs install` on the recipient's machine).

## .gitignore changes

- Keep `release/win-unpacked/` (electron-builder's intermediate build
  scaffolding) ignored.
- Do **not** ignore `release/claude-launcher.exe` — it must be tracked so
  recipients get it via `git pull`.

## README changes

Add a "Getting updates" section: `git pull`, then run
`release\claude-launcher.exe` directly. No install step.

## Error handling

- Failed typecheck/tests → red X in GitHub Actions, no commit, maintainer
  notified via GitHub's own UI/email.
- Unchanged version → workflow succeeds, packaging skipped.
- Bot commit is scoped only to `release/claude-launcher.exe` and always
  carries `[skip ci]` to prevent infinite trigger loops.

## Out of scope

- Code signing.
- In-app auto-update (electron-updater).
- macOS/Linux builds (Windows-only tool).
