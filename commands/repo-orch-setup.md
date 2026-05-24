---
name: repo-orch-setup
description: "Interactive installer: checks all prerequisites (Claude Code version, Node.js, Python, graphify), offers to install missing ones, then runs /repo-orch-init to bootstrap the workspace."
---

# /repo-orch-setup

Interactive first-time setup for repo-orchestrator. Run this once from your workspace root instead of running `/repo-orch-init` directly. It checks every prerequisite, tells you what is missing, offers to fix it, and only proceeds when the environment is ready.

---

## Phase 1 — Welcome

Print this banner:

```text
╔══════════════════════════════════════════════════════════╗
║        repo-orchestrator  v0.2.1  — Setup               ║
║     Interactive installer & prerequisite checker         ║
╚══════════════════════════════════════════════════════════╝

This wizard will:
  1. Check all prerequisites
  2. Offer to install anything that is missing
  3. Bootstrap your workspace with /repo-orch-init

Press Enter / reply "go" to begin, or "quit" to exit.
```

Wait for the user to reply before continuing.

---

## Phase 2 — Prerequisite checks

Run each check below using Bash (inspection only). Print results as you go using the format:

```text
[✓] Requirement name — details
[✗] Requirement name — what is missing
[~] Requirement name — optional, not installed
```

### Check 1 — Claude Code version

```bash
claude --version 2>/dev/null || echo "NOT_FOUND"
```

- Parse the version number (e.g., `2.1.35`).
- **Required: 2.1.32 or later.**
- If found and ≥ 2.1.32: `[✓] Claude Code v<version>`
- If found but older: `[✗] Claude Code v<version> — needs 2.1.32+ for Agent Teams`
- If not found: `[✗] Claude Code — not found on PATH`

### Check 2 — Agent Teams environment variable

```bash
printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 2>/dev/null || echo "NOT_SET"
```

Also check `.claude/settings.json` in the workspace root if it exists — look for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in the `env` block.

- If set to `"1"` in either place: `[✓] Agent Teams enabled`
- If not set: `[~] Agent Teams — not enabled (will offer to create .claude/settings.json)`

### Check 3 — Node.js

```bash
node --version 2>/dev/null || echo "NOT_FOUND"
```

- **Required: 18.0.0 or later** (for Tier-1 indexer and Tier-2 MCP server).
- If found and ≥ 18: `[✓] Node.js v<version>`
- If found but older: `[✗] Node.js v<version> — needs 18+ for Tier-1/2 features`
- If not found: `[~] Node.js — not installed (Tier-0 core features will still work)`

### Check 4 — npm

```bash
npm --version 2>/dev/null || echo "NOT_FOUND"
```

- Only relevant if Node.js is present.
- If found: `[✓] npm v<version>`
- If not found and Node.js is present: `[✗] npm — not found (required alongside Node.js)`
- If Node.js is also absent: skip this check.

### Check 5 — Python

Try each in order, stopping at the first hit:

```bash
python3 --version 2>/dev/null || python --version 2>/dev/null || echo "NOT_FOUND"
```

- **Required: 3.10 or later** for graphify.
- If found and ≥ 3.10: `[✓] Python v<version>`
- If found but older: `[~] Python v<version> — needs 3.10+ for graphify (optional)`
- If not found: `[~] Python — not installed (graphify token-saving feature unavailable)`

### Check 6 — graphify

```bash
python3 -c "import graphify; print(graphify.__version__)" 2>/dev/null \
  || python -c "import graphify; print(graphify.__version__)" 2>/dev/null \
  || echo "NOT_FOUND"
```

Also try: `python3 -m graphify --version 2>/dev/null || echo "NOT_FOUND"`

- If found: `[✓] graphify v<version> — knowledge graphs available`
- If not found and Python is present: `[~] graphify — not installed (optional, saves tokens on /repo-orch-triage)`
- If Python absent: `[~] graphify — skipped (Python not available)`

### Check 7 — uv (optional installer)

```bash
uv --version 2>/dev/null || echo "NOT_FOUND"
```

- If found: `[✓] uv v<version> — preferred installer for graphify`
- If not found: `[~] uv — not installed (will fall back to pip for graphify)`

### Check 8 — Workspace layout

List immediate subdirectories of the current directory. Count how many contain a `.git` directory.

- If ≥ 1 git repos found: `[✓] Workspace — found <N> git repo(s) as immediate subdirectories`
- If 0 found: `[✗] Workspace — no git repositories found as immediate subdirectories`
  - Add a note: "Expected layout: each microservice is a subdirectory of the current directory. Run `claude` from the parent directory that contains all your service repos."

---

## Phase 3 — Summary and blockers

After all checks, print a categorized summary:

```text
─────────────────────────────────────────
  REQUIRED (must fix before continuing)
─────────────────────────────────────────
  [list any ✗ items here, or "None — all required items pass ✓"]

─────────────────────────────────────────
  OPTIONAL (recommended but not required)
─────────────────────────────────────────
  [list any ~ items here, or "None"]
─────────────────────────────────────────
```

**If there are any ✗ (required) failures:**

Do NOT proceed to Phase 4. Instead, for each failure offer a specific fix:

### Workspace layout failure

```text
⚠️  No git repos found. Please cd into your workspace root (the directory that
    contains all your service repos) and run /repo-orch-setup again.

    Example:
      cd ~/my-project    ← contains auth-service/, payments/, etc.
      /repo-orch-setup
```

Stop here and wait for the user.

### Claude Code version failure

```text
⚠️  Please upgrade Claude Code:
      npm update -g @anthropic-ai/claude-code
    Then restart this session and run /repo-orch-setup again.
```

Stop here and wait for the user.

### Node.js failure (if Tier-1 features were requested)

Only block if the user explicitly needs Tier-1/2 features. Tier-0 (prompt-only) works without Node.js — offer to continue with Tier-0 only.

---

## Phase 4 — Offer to fix optional items

For each `[~]` item, ask the user if they want it installed. Ask all optional questions in one grouped message — do not ask one at a time.

```text
Optional enhancements available:

  A) Agent Teams (.claude/settings.json)  — enables multi-repo deliberation  [recommended]
  B) graphify                             — reduces /repo-orch-triage cost    [recommended if Python present]
  C) Tier-1 indexer (npm run build)       — faster, deterministic indexing    [optional, needs Node.js]
  D) Tier-2 MCP server (npm run build)    — live registry tools               [optional, needs Node.js]

Which would you like to set up? (e.g. "A B" or "all" or "none")
```

Wait for the user's reply.

### If A — Agent Teams

Check if `.claude/settings.json` exists:

- If it exists, read it and add `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` to the `env` block (merge carefully — do not overwrite existing keys).
- If it does not exist, create it:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "experimental": {
    "teammateMode": true
  }
}
```

Print: `[✓] Created .claude/settings.json — Agent Teams enabled`

### If B — graphify

Detect the best installer:

1. If `uv` is available: `uv tool install graphifyy`
2. Else if `pip3` is available: `pip3 install graphifyy`
3. Else if `pip` is available: `pip install graphifyy`
4. Else: print install instructions and skip

Run the detected command via Bash. If it succeeds:

```text
[✓] graphify installed — run /repo-orch-graph after setup to build knowledge graphs
```

If it fails, print the raw error and say:

```text
[✗] graphify install failed. You can try manually:
      pip install graphifyy
    Then run /repo-orch-graph once you're set up.
```

### If C — Build Tier-1 indexer

```bash
cd indexer && npm install && npm run build && cd ..
```

If it succeeds: `[✓] Tier-1 indexer built — /repo-orch-init will use it automatically`

If it fails: print the error and note that Tier-0 fallback will be used.

### If D — Build Tier-2 MCP server

```bash
cd mcp && npm install && npm run build && cd ..
```

If it succeeds:

```text
[✓] Tier-2 MCP server built

    To activate it, add this to your workspace .claude/settings.json:

      "mcpServers": {
        "repo-orchestrator": {
          "command": "node",
          "args": [".claude/plugins/repo-orchestrator/mcp/dist/server.js"]
        }
      }
```

If it fails: print the error and note that Tier-0 + Tier-1 still work.

---

## Phase 5 — Pre-flight confirmation

Print a final readiness summary before proceeding to bootstrap:

```text
─────────────────────────────────────────
  READY TO BOOTSTRAP
─────────────────────────────────────────

  Workspace:      <absolute path>
  Repos found:    <N> (<names>)
  Agent Teams:    <enabled / not enabled>
  graphify:       <available / not available>
  Tier-1 indexer: <built / not built — Tier-0 fallback>
  Tier-2 MCP:     <built / not built>

  Next: /repo-orch-init will discover your repos, index them,
  write editable context files, and pause for your review
  before generating specialist agents.

  Ready to continue? [y/N]
```

Wait for the user's reply. If "y" / "yes" / "go" / affirmative → proceed to Phase 6.

If "n" / "no" / "quit" → print "Setup paused. Run /repo-orch-setup again when ready." and stop.

---

## Phase 6 — Run /repo-orch-init

Invoke the `/repo-orch-init` command directly (do not spawn a subagent — execute it inline as part of this session). It will handle all remaining steps: repo discovery, indexing, graphify graph building (if available), context document review, and agent registration.

Before invoking, print:

```text
▶ Starting /repo-orch-init...
──────────────────────────────
```
