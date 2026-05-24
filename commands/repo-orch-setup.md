---
name: repo-orch-setup
description: "First-time setup: runs a single prerequisite scan, shows a rich status dashboard with progress steps, installs any missing optional components, then hands off to /repo-orch-init."
---

# /repo-orch-setup

First-time setup for repo-orchestrator. Runs once from your workspace root — checks every prerequisite in one pass, shows a clean progress-tracked dashboard, installs optional components silently, then bootstraps the workspace automatically.

---

## Step 1 — Print the welcome banner

Output exactly:

```text
╔══════════════════════════════════════════════════════════════╗
║   repo-orchestrator  v0.2.4  ·  Setup & Installation         ║
╚══════════════════════════════════════════════════════════════╝

  Steps:  [1] Scan environment  [2] Install components  [3] Bootstrap
```

Then immediately print the first progress line:

```text
  ──────────────────────────────────────────────────────────────
  [1/3]  Scanning environment…
  ──────────────────────────────────────────────────────────────
       Checking Claude Code…
       Checking Agent Teams…
       Checking Node.js / npm…
       Checking Python…
       Checking graphify…
       Checking uv…
       Checking Tier-1 indexer…
       Checking Tier-2 MCP server…
       Checking workspace layout…
```

(Print all nine "Checking …" lines up front so the user sees the full checklist before the Bash call runs. They will be replaced visually by the results table in the next step.)

---

## Step 2 — Run all prerequisite checks in one Bash call

Execute the following script **as a single Bash tool call** (one permission prompt total). Capture the structured output — do not surface raw shell output to the user.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Claude Code version ──────────────────────────────────────
cc_ver=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$cc_ver" ]; then
  cc_status="MISSING"; cc_detail="not found on PATH"
elif [ "$cc_ver" = "2.1.32" ]; then
  cc_status="OK"; cc_detail="v$cc_ver"
elif printf '%s\n%s\n' "2.1.32" "$cc_ver" | sort -V -C 2>/dev/null; then
  cc_status="OK"; cc_detail="v$cc_ver"
else
  cc_status="OLD"; cc_detail="v$cc_ver (needs 2.1.32+)"
fi

# ── Agent Teams ──────────────────────────────────────────────
at_env=$(printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 2>/dev/null || echo "")
at_settings=""
if [ -f ".claude/settings.json" ]; then
  at_settings=$(grep -o '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"[[:space:]]*:[[:space:]]*"1"' .claude/settings.json 2>/dev/null || echo "")
fi
if [ "$at_env" = "1" ] || [ -n "$at_settings" ]; then
  at_status="OK"; at_detail="enabled"
else
  at_status="OPTIONAL"; at_detail="not set — multi-repo deliberation inactive"
fi

# ── Node.js ──────────────────────────────────────────────────
node_ver=$(node --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$node_ver" ]; then
  node_status="OPTIONAL"; node_detail="not installed (Tier-0 still works)"
else
  node_major=$(echo "$node_ver" | cut -d. -f1)
  if [ "$node_major" -ge 18 ]; then
    node_status="OK"; node_detail="v$node_ver"
  else
    node_status="OLD"; node_detail="v$node_ver (needs 18+ for Tier-1/2)"
  fi
fi

# ── npm ──────────────────────────────────────────────────────
if [ -n "$node_ver" ]; then
  npm_ver=$(npm --version 2>/dev/null || echo "")
  if [ -n "$npm_ver" ]; then
    npm_status="OK"; npm_detail="v$npm_ver"
  else
    npm_status="MISSING"; npm_detail="not found (required alongside Node.js)"
  fi
else
  npm_status="SKIP"; npm_detail="skipped (Node.js absent)"
fi

# ── Python ───────────────────────────────────────────────────
py_cmd=""; py_ver=""
for cmd in python3 python; do
  v=$($cmd --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  if [ -n "$v" ]; then py_cmd=$cmd; py_ver=$v; break; fi
done
if [ -z "$py_ver" ]; then
  py_status="OPTIONAL"; py_detail="not installed (graphify unavailable)"
else
  py_major=$(echo "$py_ver" | cut -d. -f1)
  py_minor=$(echo "$py_ver" | cut -d. -f2)
  if [ "$py_major" -ge 3 ] && [ "$py_minor" -ge 10 ]; then
    py_status="OK"; py_detail="v$py_ver"
  else
    py_status="OLD"; py_detail="v$py_ver (needs 3.10+ for graphify)"
  fi
fi

# ── graphify ─────────────────────────────────────────────────
gfy_ver=""
if [ -n "$py_cmd" ]; then
  gfy_ver=$($py_cmd -c "import graphifyy; print(getattr(graphifyy,'__version__','installed'))" 2>/dev/null || echo "")
fi
if [ -n "$gfy_ver" ]; then
  gfy_status="OK"; gfy_detail="v$gfy_ver — knowledge graphs ready"
elif [ -n "$py_cmd" ]; then
  gfy_status="OPTIONAL"; gfy_detail="not installed (run /repo-orch-graph after setup)"
else
  gfy_status="SKIP"; gfy_detail="skipped (Python absent)"
fi

# ── uv ───────────────────────────────────────────────────────
uv_ver=$(uv --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -n "$uv_ver" ]; then
  uv_status="OK"; uv_detail="v$uv_ver — preferred graphify installer"
else
  uv_status="OPTIONAL"; uv_detail="not installed (pip used as fallback)"
fi

# ── Tier-1 indexer ───────────────────────────────────────────
t1_built=""
if [ -f ".claude/plugins/repo-orchestrator/indexer/dist/index.js" ]; then
  t1_built="YES"
fi
if [ -n "$t1_built" ]; then
  t1_status="OK"; t1_detail="built — fast deterministic indexing active"
elif [ -n "$node_ver" ]; then
  t1_status="OPTIONAL"; t1_detail="not built (Tier-0 fallback active)"
else
  t1_status="SKIP"; t1_detail="skipped (Node.js absent)"
fi

# ── Tier-2 MCP server ────────────────────────────────────────
t2_built=""
if [ -f ".claude/plugins/repo-orchestrator/mcp/dist/server.js" ]; then
  t2_built="YES"
fi
if [ -n "$t2_built" ]; then
  t2_status="OK"; t2_detail="built — live registry tools available"
elif [ -n "$node_ver" ]; then
  t2_status="OPTIONAL"; t2_detail="not built (triage works without it)"
else
  t2_status="SKIP"; t2_detail="skipped (Node.js absent)"
fi

# ── Workspace layout ─────────────────────────────────────────
git_count=0; git_names=""
for d in */; do
  if [ -d "${d}.git" ]; then
    git_count=$((git_count + 1))
    git_names="$git_names ${d%/}"
  fi
done
git_names="${git_names# }"
if [ "$git_count" -ge 1 ]; then
  ws_status="OK"; ws_detail="$git_count repo(s): $git_names"
else
  ws_status="MISSING"; ws_detail="no git repos found as immediate subdirectories"
fi

cat <<EOF
CC_STATUS=$cc_status
CC_DETAIL=$cc_detail
AT_STATUS=$at_status
AT_DETAIL=$at_detail
NODE_STATUS=$node_status
NODE_DETAIL=$node_detail
NPM_STATUS=$npm_status
NPM_DETAIL=$npm_detail
PY_STATUS=$py_status
PY_DETAIL=$py_ver
PY_CMD=$py_cmd
GFY_STATUS=$gfy_status
GFY_DETAIL=$gfy_detail
UV_STATUS=$uv_status
UV_DETAIL=$uv_detail
T1_STATUS=$t1_status
T1_DETAIL=$t1_detail
T2_STATUS=$t2_status
T2_DETAIL=$t2_detail
WS_STATUS=$ws_status
WS_DETAIL=$ws_detail
WS_COUNT=$git_count
EOF
```

Parse each `KEY=value` line from the output into variables.

---

## Step 3 — Render the results dashboard

Replace the "Checking …" lines from Step 1 with the full results table. Map status codes to icons:

- `OK` → `✓`
- `OPTIONAL` → `○`
- `SKIP` → `─`
- `MISSING` / `OLD` → `✗`

Print:

```text
  Results
  ─────────────────────────────────────────────────────────────
  Component              Status   Detail
  ─────────────────────────────────────────────────────────────
  Claude Code            <icon>   <CC_DETAIL>
  Agent Teams            <icon>   <AT_DETAIL>
  ─────────────────────────────────────────────────────────────
  Node.js                <icon>   <NODE_DETAIL>
  npm                    <icon>   <NPM_DETAIL>
  ─────────────────────────────────────────────────────────────
  Python                 <icon>   <PY_DETAIL>
  graphify               <icon>   <GFY_DETAIL>
  uv                     <icon>   <UV_DETAIL>
  ─────────────────────────────────────────────────────────────
  Tier-1 indexer         <icon>   <T1_DETAIL>
  Tier-2 MCP server      <icon>   <T2_DETAIL>
  ─────────────────────────────────────────────────────────────
  Workspace layout       <icon>   <WS_DETAIL>
  ─────────────────────────────────────────────────────────────

  Legend:  ✓ ready   ○ optional / not set   ─ skipped   ✗ action needed

  Scan complete.
```

---

## Step 4 — Handle blockers

**If `WS_STATUS` is `MISSING`:** Stop and print:

```text
  ✗  No git repositories found in this directory.

     repo-orchestrator expects each microservice to be an immediate
     subdirectory with its own .git folder:

       my-project/         ← run /repo-orch-setup here
       ├── auth-service/   ← git repo
       ├── payments/       ← git repo
       └── notifications/  ← git repo

     Please cd into your workspace root and run /repo-orch-setup again.
```

Do not continue.

**If `CC_STATUS` is `MISSING` or `OLD`:** Note the version warning in the dashboard but do not block — Claude Code is already running.

---

## Step 5 — Install optional components

Determine which optional items need action (status is `OPTIONAL`, not `OK` or `SKIP`). If there are none, skip to Step 6.

Print:

```text
  ──────────────────────────────────────────────────────────────
  [2/3]  Installing optional components…
  ──────────────────────────────────────────────────────────────
```

For each item below that applies, print a progress line before the Bash call and a result line after, following these templates:

- Before: `⟳ (2x/4) <name> → <action>…`
- Success: `✓ (2x/4) <result message>`
- Warning: `○ (2x/4) <result message>`
- Failure: `✗ (2x/4) <result message>`

Use sub-step labels `(2a)`, `(2b)`, `(2c)`, `(2d)` in place of `(2x/4)`.

### 2a — Agent Teams settings file

If `AT_STATUS` is not `OK`:

Print: `⟳ (2a/4) Agent Teams → writing .claude/settings.json…`

Run as a single Bash call:

```bash
mkdir -p .claude
if [ -f ".claude/settings.json" ]; then
  node -e "
    const fs=require('fs');
    const p='.claude/settings.json';
    let cfg={};
    try{cfg=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){}
    cfg.env=cfg.env||{};
    cfg.env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS']='1';
    cfg.experimental=cfg.experimental||{};
    cfg.experimental.teammateMode=true;
    fs.writeFileSync(p,JSON.stringify(cfg,null,2)+'\n');
  " 2>/dev/null || python3 -c "
import json
p='.claude/settings.json'
cfg={}
try:
  with open(p) as f: cfg=json.load(f)
except: pass
cfg.setdefault('env',{})['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS']='1'
cfg.setdefault('experimental',{})['teammateMode']=True
with open(p,'w') as f: json.dump(cfg,f,indent=2); f.write('\n')
" 2>/dev/null || printf '%s\n' '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"},"experimental":{"teammateMode":true}}' > .claude/settings.json
else
  printf '%s\n' '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"},"experimental":{"teammateMode":true}}' > .claude/settings.json
fi
echo "DONE"
```

Result:

- `DONE` → `✓ (2a/4) Agent Teams enabled — restart Claude Code for this to take effect`
- anything else → `✗ (2a/4) Agent Teams — could not write .claude/settings.json (check permissions)`

### 2b — graphify

If `GFY_STATUS` is `OPTIONAL`:

Print: `⟳ (2b/4) graphify → installing via <uv / pip3 / pip>…`

Run as a single Bash call:

```bash
if command -v uv >/dev/null 2>&1; then
  uv tool install graphifyy >/dev/null 2>&1 && echo "OK:uv" || echo "FAIL"
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install --quiet graphifyy 2>/dev/null && echo "OK:pip3" || echo "FAIL"
elif command -v pip >/dev/null 2>&1; then
  pip install --quiet graphifyy 2>/dev/null && echo "OK:pip" || echo "FAIL"
else
  echo "NO_PIP"
fi
```

Result:

- `OK:*` → `✓ (2b/4) graphify installed — run /repo-orch-graph after bootstrap to build knowledge graphs`
- `FAIL` → `✗ (2b/4) graphify install failed — try manually: pip install graphifyy`
- `NO_PIP` → `○ (2b/4) graphify — no pip found; install manually: pip install graphifyy`

### 2c — Tier-1 indexer

If `T1_STATUS` is `OPTIONAL`:

Print: `⟳ (2c/4) Tier-1 indexer → building (npm install + npm run build)…`

Run as a single Bash call:

```bash
plugin_path=".claude/plugins/repo-orchestrator"
if [ -d "$plugin_path/indexer" ]; then
  cd "$plugin_path/indexer" \
    && npm install --silent 2>/dev/null \
    && npm run build --silent 2>/dev/null \
    && echo "OK" || echo "FAIL"
else
  echo "NOT_FOUND"
fi
```

Result:

- `OK` → `✓ (2c/4) Tier-1 indexer built — /repo-orch-init will use it automatically`
- `FAIL` → `✗ (2c/4) Tier-1 indexer build failed — Tier-0 prompt fallback will be used`
- `NOT_FOUND` → `○ (2c/4) Tier-1 indexer — plugin path not found; skipping`

### 2d — Tier-2 MCP server

If `T2_STATUS` is `OPTIONAL`:

Print: `⟳ (2d/4) Tier-2 MCP server → building (npm install + npm run build)…`

Run as a single Bash call:

```bash
plugin_path=".claude/plugins/repo-orchestrator"
if [ -d "$plugin_path/mcp" ]; then
  cd "$plugin_path/mcp" \
    && npm install --silent 2>/dev/null \
    && npm run build --silent 2>/dev/null \
    && echo "OK" || echo "FAIL"
else
  echo "NOT_FOUND"
fi
```

Result:

- `OK` → print:

  ```text
    ✓  (2d/4)  Tier-2 MCP server built
               To activate: add to workspace .claude/settings.json:
                 "mcpServers": {
                   "repo-orchestrator": {
                     "command": "node",
                     "args": [".claude/plugins/repo-orchestrator/mcp/dist/server.js"]
                   }
                 }
  ```

- `FAIL` → `✗ (2d/4) MCP server build failed — triage works without it`
- `NOT_FOUND` → `○ (2d/4) Tier-2 MCP server — plugin path not found; skipping`

After all sub-steps, print:

```text
  Component setup complete.
```

---

## Step 6 — Print the readiness summary

```text
  ──────────────────────────────────────────────────────────────
  Summary
  ──────────────────────────────────────────────────────────────
  Workspace     <absolute path>
  Repos found   <WS_COUNT>: <comma-separated repo names>
  Agent Teams   <enabled | not enabled — restart Claude Code after setup>
  graphify      <available — run /repo-orch-graph to build graphs | not available>
  Indexer       <Tier-1 active | Tier-0 fallback>
  MCP server    <Tier-2 active | not built>
  ──────────────────────────────────────────────────────────────
```

---

## Step 7 — Run /repo-orch-init

Print the step header, then immediately invoke `/repo-orch-init` inline (no confirmation gate):

```text
  ──────────────────────────────────────────────────────────────
  [3/3]  Bootstrapping workspace…
  ──────────────────────────────────────────────────────────────
```

`/repo-orch-init` will handle: repo discovery → indexing → context document generation → review pause → agent registration.
