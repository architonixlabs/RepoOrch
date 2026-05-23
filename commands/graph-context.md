---
name: graph-context
description: "Build or refresh the graphify knowledge graph for one or all repos. Produces .repo-orchestrator/graphs/<name>/graph.json used by /triage to pre-populate specialist context, reducing token consumption."
---

# /graph-context [repo]

Build (or incrementally refresh) the graphify knowledge graph for all repos, or a single named repo.

Usage:
- `/graph-context` — build graphs for all repos in the registry
- `/graph-context auth-service` — build/refresh graph for one repo
- `/graph-context --rebuild` — force full rebuild even if graph exists

Graphs are stored in `.repo-orchestrator/graphs/<name>/` and consumed automatically by `/triage`.

---

## Step 1 — Check registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop:
"Registry not found. Run `/init-context` first."

If a repo name was provided, find that entry. If not found, stop:
"Repo `<name>` not found in registry. Available: <list names>."

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

## Step 3 — Build graphs

For each repo to process:

1. Determine the repo path from `registry.json` (the `path` field).
2. Set the output directory: `.repo-orchestrator/graphs/<name>/`.
3. Check if `--rebuild` was passed OR if no `graph.json` exists yet → full build. Otherwise → incremental update.

**Full build:**
```powershell
New-Item -ItemType Directory -Force -Path ".repo-orchestrator/graphs/<name>" | Out-Null
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
```
Building graph for auth-service... done (N nodes, M edges)
Building graph for payments...     done (N nodes, M edges)
```

Read the node/edge counts from `graph.json` (`graph.nodes` and `graph.edges` arrays) to fill in the summary.

If graphify fails for a repo, print a warning and continue with the rest — do not abort the whole run:
```
⚠️  Graph build failed for <name>: <error summary>. /triage will fall back to direct file reads for this repo.
```

---

## Step 4 — Report

```
✅ Knowledge graphs built:

  auth-service  → .repo-orchestrator/graphs/auth-service/graph.json  (42 nodes, 67 edges)
  payments      → .repo-orchestrator/graphs/payments/graph.json       (31 nodes, 48 edges)

/triage will now use these graphs to pre-populate specialist context.
Run /graph-context --rebuild to force a full rebuild after major refactors.
```
