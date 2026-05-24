---
name: repo-orch-graph
description: "Build or refresh the graphify knowledge graph for one or all repos. Produces .repo-orchestrator/graphs/<name>/graph.json used by /triage to pre-populate specialist context, reducing token consumption."
---

# /repo-orch-graph [repo]

Build (or incrementally refresh) the graphify knowledge graph for all repos, or a single named repo.

Usage:

- `/repo-orch-graph` — build graphs for all repos in the registry
- `/repo-orch-graph auth-service` — build/refresh graph for one repo
- `/repo-orch-graph --rebuild` — force full rebuild even if graph exists

Graphs are stored in `.repo-orchestrator/graphs/<name>/` and consumed automatically by `/repo-orch-triage`.

---

## Step 1 — Check registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop:
"Registry not found. Run `/repo-orch-init` first."

If a repo name was provided, find that entry. If not found, stop:
"Repo `<name>` not found in registry. Available: see names in registry."

---

## Step 2 — Ensure graphify is installed

Run the graphify detection script. If graphify is not installed, install it:

```powershell
$GRAPHIFY_PYTHON = $null

function Find-GraphifyPython {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        $uvDir = (uv tool dir 2>$null).Trim()
        if ($uvDir) {
            $py = Join-Path $uvDir "graphifyy\Scripts\python.exe"
            if (Test-Path $py) {
                & $py -c "import graphify" 2>$null
                if ($LASTEXITCODE -eq 0) { return $py }
            }
        }
    }
    if (Get-Command pipx -ErrorAction SilentlyContinue) {
        $venvs = (pipx environment --value PIPX_LOCAL_VENVS 2>$null).Trim()
        if ($venvs) {
            $py = Join-Path $venvs "graphifyy\Scripts\python.exe"
            if (Test-Path $py) {
                & $py -c "import graphify" 2>$null
                if ($LASTEXITCODE -eq 0) { return $py }
            }
        }
    }
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd) {
        & $pyCmd.Source -c "import graphify" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return (& $pyCmd.Source -c "import sys; print(sys.executable)").Trim()
        }
    }
    return $null
}

$GRAPHIFY_PYTHON = Find-GraphifyPython
if (-not $GRAPHIFY_PYTHON) {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        uv tool install --upgrade graphifyy -q 2>&1 | Select-Object -Last 3
    } else {
        pip install graphifyy -q 2>&1 | Select-Object -Last 3
    }
    $GRAPHIFY_PYTHON = Find-GraphifyPython
}

if (-not $GRAPHIFY_PYTHON) {
    Write-Error "graphify not found and could not be installed. Install manually: pip install graphifyy"
    exit 1
}
```

---

## Step 2.5 — Check for LLM API key

graphify needs an LLM API key to analyse source code. Run this check before attempting any build:

```powershell
$GRAPHIFY_BACKEND = $null
$GRAPHIFY_API_KEY = $null

if ($env:ANTHROPIC_API_KEY)  { $GRAPHIFY_BACKEND = "anthropic"; $GRAPHIFY_API_KEY = $env:ANTHROPIC_API_KEY }
elseif ($env:OPENAI_API_KEY) { $GRAPHIFY_BACKEND = "openai";    $GRAPHIFY_API_KEY = $env:OPENAI_API_KEY }
elseif ($env:GEMINI_API_KEY) { $GRAPHIFY_BACKEND = "gemini";    $GRAPHIFY_API_KEY = $env:GEMINI_API_KEY }
elseif ($env:DEEPSEEK_API_KEY){ $GRAPHIFY_BACKEND = "deepseek"; $GRAPHIFY_API_KEY = $env:DEEPSEEK_API_KEY }
```

If `$GRAPHIFY_BACKEND` is still `$null` after the check, stop and print:

```text
⚠️  Graph build requires an LLM API key — none found in the current shell.

  graphify calls an LLM to analyse your source code.
  Even though you are running inside Claude Code, the key is not
  automatically forwarded to child processes.

  ── Quickest fix (current session only) ──────────────────────────
  $env:ANTHROPIC_API_KEY = "sk-ant-..."      # PowerShell
  export ANTHROPIC_API_KEY="sk-ant-..."      # bash / zsh

  ── Permanent fix (persists across sessions) ─────────────────────
  Add the key to .claude/settings.json so Claude Code injects it
  into every shell it spawns:

    {
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }

  Your Anthropic key lives at: https://console.anthropic.com/settings/keys
  (OpenAI / Gemini / DeepSeek keys work too — set the matching variable above.)

  ── Re-run after setting the key ─────────────────────────────────
  /repo-orch-graph

  /repo-orch-triage will fall back to direct file reads in the meantime
  — no functionality is lost, triage just costs slightly more tokens.
```

If a key was found, continue and print a single line:

```text
  Using <GRAPHIFY_BACKEND> backend for graph build.
```

---

## Step 3 — Build graphs

For each repo to process:

1. Determine the repo path from `registry.json` (the `path` field).
2. Set the output directory: `.repo-orchestrator/graphs/<name>/`.
3. Check if `--rebuild` was passed OR if no `graph.json` exists yet → full build. Otherwise → incremental update.

**Full build:**

```powershell
New-Item -ItemType Directory -Force -Path ".repo-orchestrator/graphs/<name>" | Out-Null
$env:ANTHROPIC_API_KEY  = if ($GRAPHIFY_BACKEND -eq "anthropic")  { $GRAPHIFY_API_KEY } else { $env:ANTHROPIC_API_KEY }
$env:OPENAI_API_KEY     = if ($GRAPHIFY_BACKEND -eq "openai")     { $GRAPHIFY_API_KEY } else { $env:OPENAI_API_KEY }
$env:GEMINI_API_KEY     = if ($GRAPHIFY_BACKEND -eq "gemini")     { $GRAPHIFY_API_KEY } else { $env:GEMINI_API_KEY }
$env:DEEPSEEK_API_KEY   = if ($GRAPHIFY_BACKEND -eq "deepseek")   { $GRAPHIFY_API_KEY } else { $env:DEEPSEEK_API_KEY }
& $GRAPHIFY_PYTHON -m graphify <repoPath> `
    --output-dir ".repo-orchestrator/graphs/<name>" `
    --mode deep `
    --no-viz `
    --directed
```

**Incremental update (graph.json already exists):**

```powershell
& $GRAPHIFY_PYTHON -m graphify <repoPath> `
    --output-dir ".repo-orchestrator/graphs/<name>" `
    --update `
    --no-viz
```

Print progress per repo:

```text
Building graph for auth-service... done (N nodes, M edges)
Building graph for payments...     done (N nodes, M edges)
```

Read the node/edge counts from `graph.json` (`graph.nodes` and `graph.edges` arrays) to fill in the summary.

If graphify fails for a repo, print a warning and continue with the rest — do not abort the whole run.

If the error output contains "api key" or "authentication" (case-insensitive):

```text
⚠️  Graph build failed for <name>: API key error — <error summary>.
    The key was found in the shell but graphify could not authenticate.
    Check that the key is valid at the provider's console.
    /repo-orch-triage will fall back to direct file reads for this repo.
```

Otherwise:

```text
⚠️  Graph build failed for <name>: <error summary>. /repo-orch-triage will fall back to direct file reads for this repo.
```

---

## Step 4 — Report

```text
✅ Knowledge graphs built:

  auth-service  → .repo-orchestrator/graphs/auth-service/graph.json  (42 nodes, 67 edges)
  payments      → .repo-orchestrator/graphs/payments/graph.json       (31 nodes, 48 edges)

/repo-orch-triage will now use these graphs to pre-populate specialist context.
Run /repo-orch-graph --rebuild to force a full rebuild after major refactors.
```
