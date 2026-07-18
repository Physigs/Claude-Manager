# CI Pipeline & Distribution Design

Date: 2026-07-17
Revised: 2026-07-17 — switched from committing the exe to `main` to
publishing it as a GitHub Release asset, to avoid bloating git history
with binaries (see "Repo size trade-off" below).

## Goal

Let people distribute and update Claude Launcher without needing
Node.js/npm or build tooling on their machine. A GitHub Actions workflow
builds a portable Windows executable and publishes it as a GitHub Release
asset whenever a new version is released.

## Packaging

- Add `electron-builder` as a devDependency.
- Configure it to produce a **portable** Windows target: a single
  self-contained `.exe`, no installer/uninstaller, no code signing (personal
  tool — an unsigned-publisher SmartScreen prompt on first run is an
  accepted trade-off).
- New npm script: `package` → `electron-vite build && electron-builder --win portable`.
- electron-builder output directory: `release/` (entirely gitignored — it's
  a CI-only build artifact directory, nothing under it is committed).

## CI Workflow

File: `.github/workflows/build-and-release.yml`.

Trigger: `push` to `main`, plus manual `workflow_dispatch`.

Steps:
1. Checkout, setup Node, `npm ci`.
2. `npm run typecheck`.
3. `npm test`.
4. If either check fails, stop — no packaging, no release.
5. **Version gate**: compare the `version` field in `package.json` between
   `HEAD` and `HEAD^`. If unchanged, the workflow ends here (fast no-op for
   ordinary pushes).
6. If the version changed: run `npm run package`, then publish
   `release/claude-launcher.exe` as a GitHub Release asset (tag `v<version>`,
   via `gh release create`) using the workflow's own `GITHUB_TOKEN`.

Release flow for the maintainer: bump `version` in `package.json`, push to
`main`, CI builds and publishes the new exe as a GitHub Release automatically.

## Repo size trade-off

A portable Electron exe is roughly 60–100MB. Git keeps every committed
blob in history forever, so committing it directly (the original design)
would bloat the repo on every version bump with no way to shrink it again
short of rewriting history. GitHub Releases are built for exactly this —
binary assets live outside the repo's git objects entirely, so the repo
stays small no matter how many versions are published. This also avoids
Git LFS, which would need `git lfs install` on anyone cloning the repo.

Trade-off: recipients no longer get the exe via a plain `git pull` — they
grab it from the Releases page instead (`.../releases/latest`).

## .gitignore changes

- `release/` is fully ignored — the exe is a CI/local build output, never
  a tracked file, whether built locally or on the runner.

## README changes

Add a "Getting updates" section pointing to
`https://github.com/Physigs/Claude-Manager/releases/latest` — download and
run `claude-launcher.exe` directly, no install step.

## Error handling

- Failed typecheck/tests → red X in GitHub Actions, no release, maintainer
  notified via GitHub's own UI/email.
- Unchanged version → workflow succeeds, packaging/release skipped.
- Re-running a version that already has a release will fail the `gh release
  create` step (tag already exists) — acceptable for now; bump the version
  again to retry.

## Out of scope

- Code signing.
- In-app auto-update (electron-updater).
- macOS/Linux builds (Windows-only tool).
- Handling re-releases of an already-published version.
