---
name: repo-orch-setup
description: "First-time setup: a no-build, zero-friction guided install — scans prerequisites, enables optional tiers, auto-wires settings (Agent Teams + MCP), then bootstraps. Works with no toolchain; the compiled runner is an optional accelerator, never required."
---

# /repo-orch-setup

Guided first-time install for repo-orchestrator. Run once from your workspace root.

**Design (read once):** this flow is **Claude-native and needs no build step** — it always works, even with no Node toolchain. Optional tiers (indexer, MCP server) *enhance* the experience but **never block** reaching a working state. The irreducible result of setup is a bootstrapped workspace via `/repo-orch-init`; everything else is progressive enhancement.

---

## Step 0 — Optional accelerator (skip if unsure)

If a compiled setup runner is *already* built at `.claude/plugins/repo-orchestrator/setup/dist/index.js`, you MAY run it for a richer task-list UI:

```bash
node .claude/plugins/repo-orchestrator/setup/dist/index.js
```

If you run it, skip to **Step 5** afterward. **If it is not present, do NOT build it just to run it — continue with the steps below.** They are the primary path and are fully sufficient. (The runner is only ever a convenience; it is never on the critical path to a working install.)

---

## Step 1 — Scan environment (one Bash call)

Execute this single Bash script. Capture the output — do not surface raw output to the user.

```bash
#!/usr/bin/env bash
set -euo pipefail

cc_ver=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$cc_ver" ]; then cc_status="MISSING"; cc_detail="not found on PATH"
elif [ "$cc_ver" = "2.1.32" ]; then cc_status="OK"; cc_detail="v$cc_ver"
elif printf '%s\n%s\n' "2.1.32" "$cc_ver" | sort -V -C 2>/dev/null; then cc_status="OK"; cc_detail="v$cc_ver"
else cc_status="OLD"; cc_detail="v$cc_ver (needs 2.1.32+)"; fi

at_env=$(printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 2>/dev/null || echo "")
at_cfg=$(grep -os '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"[[:space:]]*:[[:space:]]*"1"' .claude/settings.json 2>/dev/null || echo "")
if [ "$at_env" = "1" ] || [ -n "$at_cfg" ]; then at_status="OK"; at_detail="enabled"
else at_status="OPTIONAL"; at_detail="not set"; fi

node_ver=$(node --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
if [ -z "$node_ver" ]; then node_status="OPTIONAL"; node_detail="not installed"
elif [ "$(echo "$node_ver" | cut -d. -f1)" -ge 18 ]; then node_status="OK"; node_detail="v$node_ver"
else node_status="OLD"; node_detail="v$node_ver (needs 18+)"; fi

npm_ver=$(npm --version 2>/dev/null || echo "")
if [ -z "$node_ver" ]; then npm_status="SKIP"; npm_detail="skipped"
elif [ -n "$npm_ver" ]; then npm_status="OK"; npm_detail="v$npm_ver"
else npm_status="MISSING"; npm_detail="not found"; fi

pp=".claude/plugins/repo-orchestrator"
if [ -f "$pp/indexer/dist/index.js" ]; then t1_status="OK"; t1_detail="built"
elif [ -n "$node_ver" ]; then t1_status="OPTIONAL"; t1_detail="not built"
else t1_status="SKIP"; t1_detail="skipped"; fi

if [ -f "$pp/mcp/dist/server.js" ]; then t2_status="OK"; t2_detail="built"
elif [ -n "$node_ver" ]; then t2_status="OPTIONAL"; t2_detail="not built"
else t2_status="SKIP"; t2_detail="skipped"; fi

mcp_wired=$(grep -os '"repo-orchestrator"' .claude/settings.json 2>/dev/null || echo "")
if [ -n "$mcp_wired" ]; then mcp_status="OK"; mcp_detail="wired into settings.json"
elif [ -f "$pp/mcp/dist/server.js" ]; then mcp_status="OPTIONAL"; mcp_detail="built but not wired"
else mcp_status="SKIP"; mcp_detail="skipped"; fi

git_count=0; git_names=""
for d in */; do
  [ -d "${d}.git" ] && git_count=$((git_count+1)) && git_names="$git_names ${d%/}"
done
git_names="${git_names# }"
if [ "$git_count" -ge 1 ]; then ws_status="OK"; ws_detail="$git_count repo(s): $git_names"
else ws_status="MISSING"; ws_detail="no git repos found"; fi

cat <<EOF
CC_STATUS=$cc_status|$cc_detail
AT_STATUS=$at_status|$at_detail
NODE_STATUS=$node_status|$node_detail
NPM_STATUS=$npm_status|$npm_detail
T1_STATUS=$t1_status|$t1_detail
T2_STATUS=$t2_status|$t2_detail
MCP_STATUS=$mcp_status|$mcp_detail
WS_STATUS=$ws_status|$ws_detail
WS_COUNT=$git_count
WS_NAMES=$git_names
EOF
```

> **Windows / no-bash sessions:** if the Bash call is unavailable, perform the same checks with the tools you have (`Read`/`Glob` for file presence, your knowledge of `claude --version` / `node --version`) — the scan is informational and must not block. Mark anything you cannot determine as `OPTIONAL`.

Parse each `KEY=status|detail`. Map statuses to icons: `OK` → `✓`, `OPTIONAL` → `○`, `SKIP` → `─`, `MISSING`/`OLD` → `✗`. Print the results dashboard:

```text
  Results
  ──────────────────────────────────────────────────────────
  <icon>  Claude Code            <CC_DETAIL>
  ✓  LLM backend            Claude Code session — no API key or local model needed
  <icon>  Agent Teams            <AT_DETAIL>
  <icon>  Node.js                <NODE_DETAIL>
  <icon>  npm                    <NPM_DETAIL>
  <icon>  Tier-1 indexer         <T1_DETAIL>
  <icon>  Tier-2 MCP server      <T2_DETAIL>
  <icon>  MCP wiring             <MCP_DETAIL>
  <icon>  Workspace layout       <WS_DETAIL>
  ──────────────────────────────────────────────────────────
  Legend:  ✓ ready   ○ optional   ─ skipped   ✗ action needed
```

**Only one hard blocker:** if `WS_STATUS` is `MISSING`, stop and tell the user to `cd` into their workspace root (the directory whose immediate subdirectories are the git repos). Everything else is optional and must not block.

---

## Step 2 — Show what setup will do (transparency)

Before changing anything, state exactly what will be created or modified **in the workspace** — this is a propose-only tool, so the install earns trust rather than hiding:

```text
Setup will, given your environment:
  • create / update  .claude/settings.json   — enable Agent Teams; wire the MCP server (if built)
  • build optional tiers (indexer, MCP)       — only if Node 18+; any failure is non-fatal
  • then run  /repo-orch-init                 — discover repos → write registry + per-repo context

It will NOT modify any of your service repositories' code, and it never commits, pushes, or deletes.
```

---

## Step 3 — Install optional components (non-blocking)

For each `OPTIONAL` item, attempt it; **a failure is never fatal — report `✗ <item>: <reason>` and continue** (the Tier-0 path still works without it). Print a one-line before/after status per item.

- **(3a) Agent Teams** — ensure `.claude/settings.json` has `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"` and `experimental.teammateMode = true`. Merge into existing JSON; never clobber other keys.
- **(3b) Tier-1 indexer** — if Node 18+ and `T1_STATUS=OPTIONAL`: `cd .claude/plugins/repo-orchestrator/indexer && npm install && npm run build`.
- **(3c) Tier-2 MCP server** — if Node 18+ and `T2_STATUS=OPTIONAL`: `cd .claude/plugins/repo-orchestrator/mcp && npm install && npm run build`.
- **(3d) Wire MCP into settings.json** — if the MCP server is built (`mcp/dist/server.js` exists) and `MCP_STATUS != OK`, merge the block below into `.claude/settings.json` (preserve existing keys and other `mcpServers` entries; skip if `repo-orchestrator` is already present). **No manual JSON editing required** — this removes the old README step:

```json
{
  "mcpServers": {
    "repo-orchestrator": {
      "command": "node",
      "args": [".claude/plugins/repo-orchestrator/mcp/dist/server.js"]
    }
  }
}
```

---

## Step 4 — Restart gate (only when needed)

Look at the scan's `AT_STATUS`:

- **Already `OK`** → Agent Teams is active in this session. No restart needed — go straight to Step 5.
- **Was `OPTIONAL` and you just enabled it in 3a** → the env var takes effect only after a restart. Do NOT auto-run init in this session. Print and stop:

```text
✓ Setup complete. Agent Teams was just enabled — restart Claude Code, then run:

    /repo-orch-init

(Multi-repo deliberation needs Agent Teams active. After restart, /repo-orch-init bootstraps your workspace.)
```

Similarly, if the MCP server was just wired in 3d, note that it loads on the next session start.

---

## Step 5 — Bootstrap

Print:

```text
  ──────────────────────────────────────────────────────────────
  Bootstrapping workspace…
  ──────────────────────────────────────────────────────────────
```

Then invoke `/repo-orch-init` immediately — the irreducible core that discovers repos and writes the registry + context. (Only reach this step when Agent Teams was already active, or when the user re-runs after restarting.)
