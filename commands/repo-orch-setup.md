---
name: repo-orch-setup
description: "First-time setup: runs a single prerequisite scan, shows a rich status dashboard, installs any missing optional components, then hands off to /repo-orch-init."
---

# /repo-orch-setup

First-time setup for repo-orchestrator. Runs once from your workspace root — checks every prerequisite in one pass, shows you a clean status dashboard, installs optional components you choose, then bootstraps the workspace automatically.

---

## Step 1 — Print the welcome banner

Output exactly:

```text
╔══════════════════════════════════════════════════════════════╗
║   repo-orchestrator  v0.2.4  ·  Setup & Installation         ║
║   Checking your environment…                                 ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Step 2 — Run all prerequisite checks in one Bash call

Execute the following script **as a single Bash tool call** (one permission prompt, no intermediate output shown to the user). Capture the output — do not stream it.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Claude Code version ──────────────────────────────────────
cc_ver=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$cc_ver" ]; then
  cc_status="MISSING"
  cc_detail="not found on PATH"
elif printf '%s\n%s\n' "2.1.32" "$cc_ver" | sort -V -C 2>/dev/null && [ "$cc_ver" != "2.1.32" ]; then
  # cc_ver > 2.1.32
  cc_status="OK"
  cc_detail="v$cc_ver"
elif [ "$cc_ver" = "2.1.32" ]; then
  cc_status="OK"
  cc_detail="v$cc_ver"
else
  cc_status="OLD"
  cc_detail="v$cc_ver (needs 2.1.32+)"
fi

# ── Agent Teams env var / settings.json ─────────────────────
at_env=$(printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 2>/dev/null || echo "")
at_settings=""
if [ -f ".claude/settings.json" ]; then
  at_settings=$(grep -o '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"[[:space:]]*:[[:space:]]*"1"' .claude/settings.json 2>/dev/null || echo "")
fi
if [ "$at_env" = "1" ] || [ -n "$at_settings" ]; then
  at_status="OK"
  at_detail="enabled"
else
  at_status="OPTIONAL"
  at_detail="not set — multi-repo deliberation inactive"
fi

# ── Node.js ─────────────────────────────────────────────────
node_ver=$(node --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$node_ver" ]; then
  node_status="OPTIONAL"
  node_detail="not installed (Tier-0 still works)"
else
  node_major=$(echo "$node_ver" | cut -d. -f1)
  if [ "$node_major" -ge 18 ]; then
    node_status="OK"
    node_detail="v$node_ver"
  else
    node_status="OLD"
    node_detail="v$node_ver (needs 18+ for Tier-1/2)"
  fi
fi

# ── npm ──────────────────────────────────────────────────────
if [ -n "$node_ver" ]; then
  npm_ver=$(npm --version 2>/dev/null || echo "")
  if [ -n "$npm_ver" ]; then
    npm_status="OK"
    npm_detail="v$npm_ver"
  else
    npm_status="MISSING"
    npm_detail="not found (required alongside Node.js)"
  fi
else
  npm_status="SKIP"
  npm_detail="skipped (Node.js absent)"
fi

# ── Python ───────────────────────────────────────────────────
py_cmd=""
py_ver=""
for cmd in python3 python; do
  v=$($cmd --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  if [ -n "$v" ]; then py_cmd=$cmd; py_ver=$v; break; fi
done
if [ -z "$py_ver" ]; then
  py_status="OPTIONAL"
  py_detail="not installed (graphify unavailable)"
else
  py_major=$(echo "$py_ver" | cut -d. -f1)
  py_minor=$(echo "$py_ver" | cut -d. -f2)
  if [ "$py_major" -ge 3 ] && [ "$py_minor" -ge 10 ]; then
    py_status="OK"
    py_detail="v$py_ver"
  else
    py_status="OLD"
    py_detail="v$py_ver (needs 3.10+ for graphify)"
  fi
fi

# ── graphify ─────────────────────────────────────────────────
gfy_ver=""
if [ -n "$py_cmd" ]; then
  gfy_ver=$($py_cmd -c "import graphifyy; print(getattr(graphifyy,'__version__','installed'))" 2>/dev/null || echo "")
fi
if [ -n "$gfy_ver" ]; then
  gfy_status="OK"
  gfy_detail="v$gfy_ver — knowledge graphs ready"
elif [ -n "$py_cmd" ]; then
  gfy_status="OPTIONAL"
  gfy_detail="not installed (run /repo-orch-graph after setup)"
else
  gfy_status="SKIP"
  gfy_detail="skipped (Python absent)"
fi

# ── uv ───────────────────────────────────────────────────────
uv_ver=$(uv --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -n "$uv_ver" ]; then
  uv_status="OK"
  uv_detail="v$uv_ver — preferred graphify installer"
else
  uv_status="OPTIONAL"
  uv_detail="not installed (pip will be used instead)"
fi

# ── Tier-1 indexer ───────────────────────────────────────────
plugin_dir="$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "$0")")")"
t1_built=""
if [ -f "$plugin_dir/indexer/dist/index.js" ] || [ -f ".claude/plugins/repo-orchestrator/indexer/dist/index.js" ]; then
  t1_built="YES"
fi
if [ -n "$t1_built" ]; then
  t1_status="OK"
  t1_detail="built — fast deterministic indexing active"
elif [ -n "$node_ver" ]; then
  t1_status="OPTIONAL"
  t1_detail="not built (Tier-0 fallback active)"
else
  t1_status="SKIP"
  t1_detail="skipped (Node.js absent)"
fi

# ── Tier-2 MCP server ────────────────────────────────────────
t2_built=""
if [ -f "$plugin_dir/mcp/dist/server.js" ] || [ -f ".claude/plugins/repo-orchestrator/mcp/dist/server.js" ]; then
  t2_built="YES"
fi
if [ -n "$t2_built" ]; then
  t2_status="OK"
  t2_detail="built — live registry tools available"
elif [ -n "$node_ver" ]; then
  t2_status="OPTIONAL"
  t2_detail="not built (triage works without it)"
else
  t2_status="SKIP"
  t2_detail="skipped (Node.js absent)"
fi

# ── Workspace layout ─────────────────────────────────────────
git_count=0
git_names=""
for d in */; do
  if [ -d "${d}.git" ]; then
    git_count=$((git_count + 1))
    git_names="$git_names ${d%/}"
  fi
done
git_names="${git_names# }"
if [ "$git_count" -ge 1 ]; then
  ws_status="OK"
  ws_detail="$git_count repo(s): $git_names"
else
  ws_status="MISSING"
  ws_detail="no git repos found as immediate subdirectories"
fi

# ── Emit structured results ──────────────────────────────────
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

## Step 3 — Render the status dashboard

Using the parsed variables, print the following dashboard. Never show raw command output — only the formatted table below.

Map status codes to icons:

- `OK` → `✓`
- `OPTIONAL` → `○`
- `SKIP` → `─`
- `MISSING` / `OLD` → `✗`

```text
  Environment Check
  ─────────────────────────────────────────────────────────────
  Component              Status   Detail
  ─────────────────────────────────────────────────────────────
  Claude Code            <icon>   <CC_DETAIL>
  Agent Teams            <icon>   <AT_DETAIL>
  ─────────────────────────────────────────────────────────────
  Node.js                <icon>   <NODE_DETAIL>
  npm                    <icon>   <NPM_DETAIL>
  ─────────────────────────────────────────────────────────────
  Python                 <icon>   <PY_DETAIL or py_detail>
  graphify               <icon>   <GFY_DETAIL>
  uv                     <icon>   <UV_DETAIL>
  ─────────────────────────────────────────────────────────────
  Tier-1 indexer         <icon>   <T1_DETAIL>
  Tier-2 MCP server      <icon>   <T2_DETAIL>
  ─────────────────────────────────────────────────────────────
  Workspace layout       <icon>   <WS_DETAIL>
  ─────────────────────────────────────────────────────────────

  Legend:  ✓ ready   ○ optional / not set   ─ skipped   ✗ action needed
```

---

## Step 4 — Handle blockers

**If `WS_STATUS` is `MISSING`:** Stop immediately and print:

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

**If `CC_STATUS` is `MISSING` or `OLD`:** Print a warning but do not block — Claude Code is already running so the check is informational. Note in the dashboard output that Agent Teams requires v2.1.32+.

---

## Step 5 — Install optional components (no confirmation prompts)

For each optional item that is not already `OK`, check if it is installable and install it silently. Show a one-line progress indicator before each install and a one-line result after. Do not ask the user which items to install — install everything that can be installed automatically.

Print this section header first:

```text
  Installing optional components…
  ──────────────────────────────────────────────────────────────
```

### A — Agent Teams settings file

If `AT_STATUS` is not `OK`:

Run as a single Bash call (do not show output):

```bash
mkdir -p .claude
if [ -f ".claude/settings.json" ]; then
  # Merge: add env block if missing, add key if env block exists
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
import json,os
p='.claude/settings.json'
cfg={}
try:
  with open(p) as f: cfg=json.load(f)
except: pass
cfg.setdefault('env',{})['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS']='1'
cfg.setdefault('experimental',{})['teammateMode']=True
with open(p,'w') as f: json.dump(cfg,f,indent=2); f.write('\n')
" 2>/dev/null || echo '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"},"experimental":{"teammateMode":true}}' > .claude/settings.json
else
  echo '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"},"experimental":{"teammateMode":true}}' > .claude/settings.json
fi
echo "DONE"
```

Print:

- Before: `○ Agent Teams → writing .claude/settings.json…`
- After (if output is `DONE`): `✓ Agent Teams enabled — restart Claude Code for this to take effect`
- After (if failed): `✗ Agent Teams — could not write .claude/settings.json (check permissions)`

### B — graphify

If `GFY_STATUS` is `OPTIONAL` (Python is present but graphify is not installed):

Print before: `○ graphify → installing via <uv/pip3/pip>…`

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

- `OK:*` → `✓ graphify installed — run /repo-orch-graph after setup to build knowledge graphs`
- `FAIL` → `✗ graphify install failed — try: pip install graphifyy`
- `NO_PIP` → `○ graphify — no pip found; try: pip install graphifyy`

### C — Tier-1 indexer

If `T1_STATUS` is `OPTIONAL` (Node.js is present but indexer is not built):

Find the plugin directory. It will be at `.claude/plugins/repo-orchestrator/` relative to the workspace root if installed there, or use the path from which this command is running.

Print before: `○ Tier-1 indexer → building…`

Run as a single Bash call:

```bash
plugin_path=".claude/plugins/repo-orchestrator"
if [ -d "$plugin_path/indexer" ]; then
  cd "$plugin_path/indexer" && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null && echo "OK" || echo "FAIL"
else
  echo "NOT_FOUND"
fi
```

- `OK` → `✓ Tier-1 indexer built — /repo-orch-init will use it automatically`
- `FAIL` → `✗ Tier-1 indexer build failed — Tier-0 fallback will be used`
- `NOT_FOUND` → `○ Tier-1 indexer — plugin path not found; skipping`

### D — Tier-2 MCP server

If `T2_STATUS` is `OPTIONAL` (Node.js is present but MCP server is not built):

Print before: `○ Tier-2 MCP server → building…`

Run as a single Bash call:

```bash
plugin_path=".claude/plugins/repo-orchestrator"
if [ -d "$plugin_path/mcp" ]; then
  cd "$plugin_path/mcp" && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null && echo "OK" || echo "FAIL"
else
  echo "NOT_FOUND"
fi
```

- `OK` → print:

  ```text
  ✓  Tier-2 MCP server built

     Add this to your workspace .claude/settings.json under "mcpServers":
       "repo-orchestrator": {
         "command": "node",
         "args": [".claude/plugins/repo-orchestrator/mcp/dist/server.js"]
       }
  ```

- `FAIL` → `✗ MCP server build failed — triage works without it`
- `NOT_FOUND` → `○ Tier-2 MCP server — plugin path not found; skipping`

If all optional items were already `OK` or `SKIP`, omit this section entirely and skip to Step 6.

---

## Step 6 — Print the readiness summary

After installs (or if nothing needed installing), print:

```text
  ──────────────────────────────────────────────────────────────
  Ready
  ──────────────────────────────────────────────────────────────
  Workspace   <absolute path of current directory>
  Repos       <WS_COUNT> detected: <comma-separated names>
  Agent Teams <enabled / not enabled — restart Claude Code>
  graphify    <available — run /repo-orch-graph to build graphs / not available>
  Indexer     <Tier-1 active / Tier-0 fallback>

  Starting /repo-orch-init…
  ──────────────────────────────────────────────────────────────
```

---

## Step 7 — Run /repo-orch-init

Invoke `/repo-orch-init` immediately — no confirmation prompt, no "Ready to continue?" gate. It will handle: repo discovery, indexing, context document generation, review pause, and agent registration.
