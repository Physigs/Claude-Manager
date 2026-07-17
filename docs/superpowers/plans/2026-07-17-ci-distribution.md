# CI Packaging & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone update Claude Launcher with a plain `git pull` by having CI build a portable Windows exe and commit it back into the repo whenever the app version is bumped.

**Architecture:** `electron-builder` packages the existing electron-vite build output (`out/`) into a single portable `.exe` at `release/claude-launcher.exe`. A GitHub Actions workflow runs on every push to `main`, always running typecheck/tests, and only packaging + committing the exe back to `main` when `package.json`'s `version` field changed in that push (to avoid bloating git history on every ordinary commit).

**Tech Stack:** electron-builder (portable Windows target), GitHub Actions (`windows-latest` runner), existing npm scripts (`typecheck`, `test`).

## Global Constraints

- Windows-only distribution target (portable `.exe`, `win.target: portable`).
- No code signing (personal tool — accepted SmartScreen prompt trade-off).
- No Git LFS — the exe must be a normal tracked file so `git pull` alone updates it.
- Fixed, non-versioned artifact path: `release/claude-launcher.exe` (stable path so instructions never go stale).
- CI must not rebuild/commit on every push — only when `package.json`'s `version` changed (repo-size trade-off from the spec).
- Bot commits must include `[skip ci]` to prevent infinite workflow-trigger loops.

Spec reference: `docs/superpowers/specs/2026-07-17-ci-distribution-design.md`

---

### Task 1: Configure electron-builder portable packaging

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Create (generated, not hand-written): `release/claude-launcher.exe` (produced by the verification step, not committed in this task)

**Interfaces:**
- Produces: npm script `package` (runs `electron-vite build && electron-builder --win portable`), which Task 2's CI workflow invokes by name.
- Produces: fixed output artifact at `release/claude-launcher.exe`, which Task 2's CI workflow commits by that exact path.

- [ ] **Step 1: Install electron-builder as a devDependency**

Run: `npm install --save-dev electron-builder`

Expected: `package.json` and `package-lock.json` both change; `devDependencies` gains an `electron-builder` entry.

- [ ] **Step 2: Add the `package` script and `build` config to `package.json`**

Edit `package.json` so the `scripts` and top-level structure look like this (add `"package"` to `scripts`, add a new top-level `"build"` key after `"scripts"`):

```json
{
  "name": "claude-launcher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite build && electron .",
    "package": "electron-vite build && electron-builder --win portable",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.web.json"
  },
  "build": {
    "appId": "dev.brichley.claudelauncher",
    "productName": "Claude Launcher",
    "files": [
      "out/**/*",
      "package.json"
    ],
    "directories": {
      "output": "release"
    },
    "win": {
      "target": "portable"
    },
    "portable": {
      "artifactName": "claude-launcher.exe"
    }
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.13",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "typescript": "^5.5.4",
    "vite": "^5.3.5",
    "vitest": "^2.0.5"
  }
}
```

Note: keep whatever exact `electron-builder` version `npm install` from Step 1 actually wrote into `devDependencies` — don't hand-edit that version number if it differs from `^24.13.3` above.

- [ ] **Step 3: Update `.gitignore` to track only the final exe under `release/`**

Edit `.gitignore` from:

```
node_modules/
out/
dist/
*.log
.superpowers/
```

to:

```
node_modules/
out/
dist/
*.log
.superpowers/
release/*
!release/claude-launcher.exe
```

- [ ] **Step 4: Add a "Getting updates" section to `README.md`**

Add this section after the existing "Usage" section (after the `wt.exe` fallback paragraph at the end of the file):

```markdown

## Getting updates

If you don't have Node.js installed, you don't need it. Just:

```bash
git pull
```

Then run `release\claude-launcher.exe` directly — it's a self-contained
portable app, rebuilt and committed automatically whenever a new version
is released. No install step, no npm required.
```

- [ ] **Step 5: Build locally to verify the packaging config works**

Run: `npm run package`

Expected: Completes without error (first run downloads Electron's portable-build tooling, so it may take a few minutes). Produces `release/claude-launcher.exe`.

- [ ] **Step 6: Verify the artifact exists and is a plausible size**

Run: `ls -la release/claude-launcher.exe` (Bash) or `Get-Item release/claude-launcher.exe | Select-Object Length` (PowerShell)

Expected: File exists, size is roughly 60–150MB (a bare Electron portable exe). If it's only a few KB, packaging silently failed — check the `npm run package` output for errors before continuing.

- [ ] **Step 7: Confirm git ignores the build scaffolding but would track the exe**

Run: `git status --short release/`

Expected: Shows `release/claude-launcher.exe` as untracked (`??`), and does **not** list `release/win-unpacked/` or any other files under `release/` — confirming the `.gitignore` negation pattern from Step 3 works.

- [ ] **Step 8: Commit the config/doc changes (not the built exe)**

```bash
git add package.json package-lock.json .gitignore README.md
git commit -m "$(cat <<'EOF'
Add electron-builder portable packaging config

Adds npm run package (portable .exe via electron-builder) and documents
the git-pull update flow. The built exe itself is produced by CI, not
committed from local builds.
EOF
)"
```

Expected: Commit succeeds; `git status` afterward shows `release/claude-launcher.exe` still untracked (it stays on disk locally but isn't part of this commit).

---

### Task 2: Add version-gated GitHub Actions build-and-commit workflow

**Files:**
- Create: `.github/workflows/build-and-release.yml`

**Interfaces:**
- Consumes: `npm run package` and the `release/claude-launcher.exe` output path from Task 1.
- Consumes: existing `npm run typecheck` and `npm test` scripts (unchanged, already present in `package.json`).

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/build-and-release.yml`:

```yaml
name: Build and Release

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Check if version changed
        id: version_check
        shell: bash
        run: |
          CURRENT=$(node -p "require('./package.json').version")
          git show HEAD^:package.json > prev-package.json 2>/dev/null || echo '{}' > prev-package.json
          PREVIOUS=$(node -p "require('./prev-package.json').version || ''")
          rm -f prev-package.json
          echo "current=$CURRENT" >> "$GITHUB_OUTPUT"
          if [ "$CURRENT" != "$PREVIOUS" ]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Package app
        if: steps.version_check.outputs.changed == 'true'
        run: npm run package

      - name: Commit built exe
        if: steps.version_check.outputs.changed == 'true'
        shell: bash
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add release/claude-launcher.exe
          git commit -m "chore: build v${{ steps.version_check.outputs.current }} [skip ci]"
          git push origin HEAD:main
```

- [ ] **Step 2: Commit and push the workflow**

```bash
git add .github/workflows/build-and-release.yml
git commit -m "Add version-gated CI workflow to build and commit portable exe"
git push
```

Expected: Push succeeds. This first push does **not** bump the version, so per the workflow's own logic it will run typecheck/test but skip packaging — that's expected and confirms the "no-op on ordinary pushes" behavior.

- [ ] **Step 3: Confirm the no-op run succeeded**

Run (public repo, no auth needed):

```bash
curl -s "https://api.github.com/repos/Physigs/Claude-Manager/actions/runs?branch=main&per_page=1"
```

Expected: JSON response where `workflow_runs[0].status` eventually becomes `"completed"` and `conclusion` is `"success"`. This may take 1-2 minutes — if `status` is still `"in_progress"` or `"queued"`, wait and re-run the same command rather than assuming failure.

- [ ] **Step 4: Bump the version to trigger a real packaging run**

Edit `package.json`, changing `"version": "0.1.0"` to `"version": "0.1.1"`.

```bash
git add package.json
git commit -m "Bump version to 0.1.1"
git push
```

- [ ] **Step 5: Confirm CI packaged and committed the exe**

Run:

```bash
curl -s "https://api.github.com/repos/Physigs/Claude-Manager/actions/runs?branch=main&per_page=1"
```

Expected: Once `conclusion` is `"success"` (packaging + electron-builder download can take several minutes on a fresh runner — poll every 30-60s rather than assuming failure early), pull locally:

```bash
git pull
git log --oneline -3
```

Expected: A new commit from `github-actions[bot]` with message `chore: build v0.1.1 [skip ci]` appears, and `release/claude-launcher.exe` now exists locally as a tracked file (`git status --short release/` shows nothing, since it's committed and matches).

- [ ] **Step 6: Confirm the bot commit didn't re-trigger the workflow**

Run:

```bash
curl -s "https://api.github.com/repos/Physigs/Claude-Manager/actions/runs?branch=main&per_page=3" 
```

Expected: The bot's `chore: build v0.1.1 [skip ci]` commit does not appear as its own workflow run — only the two runs from Steps 2 and 4 exist, confirming `[skip ci]` prevented the loop.

---

## Verification Summary

After both tasks: pushing an ordinary commit to `main` runs typecheck/tests only; bumping `version` in `package.json` and pushing causes CI to build a portable exe and commit it to `release/claude-launcher.exe` on `main`, which anyone can retrieve with `git pull` and run directly — matching the spec's "pull from git as needed, easily update" goal.
