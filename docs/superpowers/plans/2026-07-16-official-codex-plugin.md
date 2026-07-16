# Official Codex Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Agentic OS as a valid Codex plugin and Git-backed marketplace without changing the shared multi-provider runtime structure.

**Architecture:** Keep the repository root as the single plugin payload. Add Codex-specific manifest and marketplace metadata alongside the existing Claude Code metadata; both point to the same `skills/`, `docs/`, and `template/` content. Validate the package from a clean checkout before publishing a draft pull request.

**Tech Stack:** JSON manifests, Markdown skills/docs, PowerShell, Python validators bundled with Codex, Git, GitHub CLI.

## Global Constraints

- Canonical plugin name is exactly `agentic-os`.
- Published functional version is exactly `1.3.0`; do not publish a local Codex cachebuster.
- Keep `skills/agentic-os/SKILL.md` as the single skill source.
- Do not move `skills/`, `docs/`, or `template/`.
- Do not add native Gemini or other provider manifests.
- Preserve the existing local `SKILL.md` description change.
- Stage files explicitly; do not use `git add -A` in the mixed worktree.

---

### Task 1: Codex manifest and repository marketplace

**Files:**
- Modify: `.codex-plugin/plugin.json`
- Create: `.agents/plugins/marketplace.json`

**Interfaces:**
- Consumes: shared skill directory at `./skills/` and repository metadata from the approved design.
- Produces: Codex plugin identity `agentic-os@1.3.0` and a Git-backed marketplace entry whose source is the repository root.

- [ ] **Step 1: Run the preflight that demonstrates the current package is incomplete**

```powershell
$manifest = Get-Content .codex-plugin/plugin.json -Raw | ConvertFrom-Json
if ($manifest.version -ne '1.3.0') { throw "Codex version is $($manifest.version), expected 1.3.0" }
if (-not (Test-Path .agents/plugins/marketplace.json)) { throw 'Codex marketplace is missing' }
```

Expected: FAIL because the local manifest has a cachebuster and `.agents/plugins/marketplace.json` does not exist.

- [ ] **Step 2: Normalize the Codex manifest**

Set `.codex-plugin/plugin.json` to the existing validated metadata, retaining its author, repository, keywords, interface copy, prompts, category, and `"skills": "./skills/"`, while changing only the published version to:

```json
"version": "1.3.0"
```

- [ ] **Step 3: Add the repository marketplace**

Create `.agents/plugins/marketplace.json` with:

```json
{
  "name": "agentic-os",
  "interface": {
    "displayName": "Agentic OS"
  },
  "plugins": [
    {
      "name": "agentic-os",
      "source": {
        "source": "local",
        "path": "./"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

- [ ] **Step 4: Validate the Codex package**

```powershell
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" .
Get-Content .agents/plugins/marketplace.json -Raw | ConvertFrom-Json | Out-Null
$manifest = Get-Content .codex-plugin/plugin.json -Raw | ConvertFrom-Json
if ($manifest.name -ne 'agentic-os' -or $manifest.version -ne '1.3.0' -or $manifest.skills -ne './skills/') { throw 'Codex manifest mismatch' }
```

Expected: validator reports success and the PowerShell checks exit without error.

- [ ] **Step 5: Commit Codex packaging**

```powershell
git add -- .codex-plugin/plugin.json .agents/plugins/marketplace.json
git diff --cached --check
git commit -m "feat: add official Codex plugin packaging"
```

### Task 2: Claude metadata and shared skill alignment

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Preserve and commit: `skills/agentic-os/SKILL.md`

**Interfaces:**
- Consumes: Claude plugin name `agentic-os`, shared skill frontmatter, functional release `1.3.0`.
- Produces: matching Claude marketplace version and the provider-neutral skill description already present locally.

- [ ] **Step 1: Demonstrate the Claude version drift**

```powershell
$plugin = Get-Content .claude-plugin/plugin.json -Raw | ConvertFrom-Json
$market = Get-Content .claude-plugin/marketplace.json -Raw | ConvertFrom-Json
if ($market.plugins[0].version -ne $plugin.version) { throw "Claude versions differ: $($market.plugins[0].version) vs $($plugin.version)" }
```

Expected: FAIL with `1.2.0 vs 1.3.0`.

- [ ] **Step 2: Align the Claude marketplace**

Change only the plugin entry version in `.claude-plugin/marketplace.json`:

```json
"version": "1.3.0"
```

- [ ] **Step 3: Validate the shared skill and metadata**

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/agentic-os
$plugin = Get-Content .claude-plugin/plugin.json -Raw | ConvertFrom-Json
$market = Get-Content .claude-plugin/marketplace.json -Raw | ConvertFrom-Json
if ($market.plugins[0].version -ne $plugin.version) { throw 'Claude version mismatch' }
if ($market.plugins[0].source -ne './') { throw 'Claude marketplace no longer points to the shared root payload' }
```

Expected: skill validation succeeds and both assertions exit without error.

- [ ] **Step 4: Commit the aligned shared metadata**

```powershell
git add -- .claude-plugin/marketplace.json skills/agentic-os/SKILL.md
git diff --cached --check
git commit -m "chore: align universal plugin metadata"
```

### Task 3: Universal installation documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: actual Claude marketplace commands and current Codex CLI/plugin-directory behavior.
- Produces: separate, accurate installation instructions for Claude Code and Codex plus a compatibility statement for Gemini and other providers.

- [ ] **Step 1: Demonstrate missing Codex documentation**

```powershell
rg -n "Instalação.*Codex|codex plugin marketplace add|\.codex-plugin|\.agents/plugins" README.md
```

Expected: no matches for a Codex installation section or Codex packaging components.

- [ ] **Step 2: Replace the Claude-only introduction with platform-specific installation sections**

Document:

```text
Claude Code
/plugin marketplace add rasecagapito/agenticOS
/plugin install agentic-os@agentic-os

Codex
codex plugin marketplace add rasecagapito/agenticOS
Open Plugins, select Agentic OS, install it, and start a new task.
```

State that the same plugin can be used in any project after installation and that Gemini/other providers remain supported through the generated multi-provider project layer rather than native manifests.

- [ ] **Step 3: Update the repository structure list**

Add these responsibilities without moving existing entries:

```text
.codex-plugin/plugin.json — Codex plugin manifest
.agents/plugins/marketplace.json — Codex Git marketplace
.claude-plugin/ — Claude Code manifest and marketplace
skills/agentic-os/SKILL.md — shared provider-neutral skill
```

- [ ] **Step 4: Verify documentation claims against the installed CLI**

```powershell
codex plugin marketplace add --help
rg -n "Instalação.*Claude Code|Instalação.*Codex|codex plugin marketplace add rasecagapito/agenticOS|Gemini" README.md
```

Expected: CLI help accepts `owner/repo` sources and README contains all four claims.

- [ ] **Step 5: Commit documentation**

```powershell
git add -- README.md
git diff --cached --check
git commit -m "docs: add universal plugin installation"
```

### Task 4: Clean-checkout integration validation

**Files:**
- Verify only: all tracked plugin files
- Temporary: `$env:TEMP\agentic-os-plugin-verification-*`

**Interfaces:**
- Consumes: committed branch contents from Tasks 1–3.
- Produces: evidence that the published checkout, rather than only the dirty development tree, is valid and discoverable.

- [ ] **Step 1: Verify repository cleanliness and tracked packaging files**

```powershell
git status -sb
git ls-files .codex-plugin/plugin.json .agents/plugins/marketplace.json .claude-plugin/plugin.json .claude-plugin/marketplace.json skills/agentic-os/SKILL.md
```

Expected: the five package files are tracked; no intended implementation files remain uncommitted.

- [ ] **Step 2: Create an isolated clean checkout**

```powershell
$verifyRoot = Join-Path $env:TEMP ('agentic-os-plugin-verification-' + [guid]::NewGuid().ToString('N'))
$repoCopy = Join-Path $verifyRoot 'repo'
$codexHome = Join-Path $verifyRoot 'codex-home'
New-Item -ItemType Directory -Path $verifyRoot, $codexHome | Out-Null
git clone --local --no-hardlinks . $repoCopy
```

Expected: clone completes on `agent/official-codex-plugin`.

- [ ] **Step 3: Run validators against the clean checkout**

```powershell
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" $repoCopy
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" (Join-Path $repoCopy 'skills/agentic-os')
```

Expected: both validators succeed.

- [ ] **Step 4: Register the marketplace in an isolated Codex home**

```powershell
$oldCodexHome = $env:CODEX_HOME
$env:CODEX_HOME = $codexHome
codex plugin marketplace add $repoCopy
$env:CODEX_HOME = $oldCodexHome
```

Expected: Codex accepts the local marketplace root without modifying the user's real Codex configuration.

- [ ] **Step 5: Remove only the verified temporary directory**

```powershell
$resolved = (Resolve-Path -LiteralPath $verifyRoot).Path
$tempResolved = (Resolve-Path -LiteralPath $env:TEMP).Path
if (-not $resolved.StartsWith($tempResolved, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove a non-temp path' }
Remove-Item -LiteralPath $resolved -Recurse -Force
```

Expected: the isolated verification directory is removed; repository files are untouched.

### Task 5: Publish the branch as a draft pull request

**Files:**
- Verify only: Git history and complete branch diff

**Interfaces:**
- Consumes: validated commits on `agent/official-codex-plugin`.
- Produces: pushed branch and draft pull request targeting `main`.

- [ ] **Step 1: Verify GitHub tooling and authentication**

```powershell
gh --version
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
```

Expected: authenticated access to `rasecagapito/agenticOS`; default branch is `main`.

- [ ] **Step 2: Review the final scope**

```powershell
git status -sb
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: only the approved design, plan, manifests, marketplaces, shared skill description, and README are included.

- [ ] **Step 3: Push the branch**

```powershell
git push -u origin agent/official-codex-plugin
```

Expected: remote tracking branch is created.

- [ ] **Step 4: Open a draft pull request**

```powershell
$body = Join-Path $env:TEMP 'agentic-os-pr-body.md'
@'
## What changed
- adds the official Codex plugin manifest and repository marketplace
- aligns Claude Code metadata with Agentic OS 1.3.0
- documents installation for Codex and Claude Code
- preserves the shared multi-provider skill and project structure

## Validation
- official Codex plugin validator
- skill validator
- JSON and version consistency checks
- isolated clean-checkout marketplace registration
'@ | Set-Content -LiteralPath $body -Encoding utf8
gh pr create --draft --base main --head agent/official-codex-plugin --title "Add official Codex plugin packaging" --body-file $body
```

Expected: GitHub returns the draft pull request URL.
