---
name: repo-orch-setup
description: "First-time setup: prerequisite scan, component install, workspace bootstrap. Delegates to the compiled setup runner when available."
---

# /repo-orch-setup

First-time setup for repo-orchestrator. Run once from your workspace root.

---

## Step 1 — Try the compiled setup runner

Check whether the compiled setup runner exists at `.claude/plugins/repo-orchestrator/setup/dist/index.js`.

**If it exists**, run it with a single Bash call and let it handle everything — its output is the full UI:

```bash
node .claude/plugins/repo-orchestrator/setup/dist/index.js
```

After it exits, proceed to Step 4 (run `/repo-orch-init`). Do not run Steps 2–3.

**If it does not exist**, continue with Steps 2–3 (the inline fallback).

---

## Step 2 — Print the welcome banner (fallback only)

```text
╔══════════════════════════════════════════════════════════════╗
║   repo-orchestrator  v0.2.8  ·  Setup & Installation         ║
╚══════════════════════════════════════════════════════════════╝

  Steps:  [1] Scan environment  [2] Install components  [3] Bootstrap
```

Then print the scan checklist upfront:

```text
  ──────────────────────────────────────────────────────────────
  [1/3]  Scanning environment…
  ──────────────────────────────────────────────────────────────
       Checking Claude Code…
       Checking Agent Teams…
       Checking Node.js / npm…
       Checking Tier-1 indexer…
       Checking Tier-2 MCP server…
       Checking workspace layout…
```

---

## Step 3 — Run all checks in one Bash call (fallback only)

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
WS_STATUS=$ws_status|$ws_detail
WS_COUNT=$git_count
WS_NAMES=$git_names
EOF
```

Parse each `KEY=status|detail` line. Map statuses to icons: `OK` → `✓`, `OPTIONAL` → `○`, `SKIP` → `─`, `MISSING`/`OLD` → `✗`.

Print the results dashboard:

```text
  Results
  ──────────────────────────────────────────────────────────
  Component              Detail
  ──────────────────────────────────────────────────────────
  <icon>  Claude Code            <CC_DETAIL>
  <icon>  Agent Teams            <AT_DETAIL>
  ──────────────────────────────────────────────────────────
  <icon>  Node.js                <NODE_DETAIL>
  <icon>  npm                    <NPM_DETAIL>
  ──────────────────────────────────────────────────────────
  <icon>  Tier-1 indexer         <T1_DETAIL>
  <icon>  Tier-2 MCP server      <T2_DETAIL>
  ──────────────────────────────────────────────────────────
  <icon>  Workspace layout       <WS_DETAIL>
  ──────────────────────────────────────────────────────────

  Legend:  ✓ ready   ○ optional   ─ skipped   ✗ action needed

  Scan complete.
```

If `WS_STATUS` is `MISSING`: stop and instruct the user to cd into their workspace root.

For each item with status `OPTIONAL`, install silently in one Bash call per item, printing:

- Before: `⟳ (2x/4) <name> → <action>…`
- After: `✓ / ✗ / ○ (2x/4) <result>`

Steps: (2a) Agent Teams settings file — (2b) Tier-1 indexer — (2c) Tier-2 MCP server.

Print the summary then proceed to Step 4.

---

## Step 4 — Run /repo-orch-init

Print:

```text
  ──────────────────────────────────────────────────────────────
  [3/3]  Bootstrapping workspace…
  ──────────────────────────────────────────────────────────────
```

Then invoke `/repo-orch-init` immediately — no confirmation gate.
