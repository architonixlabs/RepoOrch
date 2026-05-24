---
name: repo-orch-status
description: "Show at-a-glance status of the repo-orchestrator workspace: registered repos, last index timestamps, graph availability, userEdited flags, and Agent Teams enablement."
---

# /repo-orch-status

Show a concise status dashboard for the current repo-orchestrator workspace. Use this to verify setup is working, to see when repos were last indexed, and to spot repos that need attention.

---

## Step 1 — Load the registry

Read `.repo-orchestrator/registry.json`. If it does not exist, output:

```text
┌── repo-orchestrator ─────────────────────────────────────────┐
│  No registry found.                                          │
│                                                              │
│  Run /repo-orch-setup  (first time)                          │
│  Run /repo-orch-init   (skip setup wizard)                   │
└──────────────────────────────────────────────────────────────┘
```

Stop here.

---

## Step 2 — Gather supplementary facts

For each repo entry in the registry, check:

1. **Context file exists**: does `.repo-orchestrator/context/<name>.md` exist?
2. **Graph exists**: does `.repo-orchestrator/graphs/<name>/` exist and contain at least one file?
3. **Skill file exists**: does `.repo-orchestrator/skills/<name>.md` exist?
4. **Agent file exists**: does `.claude/agents/repo-<name>.md` exist?
5. **`userEdited` flag**: read from registry entry (default `false`)
6. **`lastIndexed` timestamp**: read from registry entry; format as relative time if recent (e.g., "3 days ago"), or ISO date if older than 30 days

Also check:

- **Agent Teams**: read `.claude/settings.json`; check `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"` and `experimental.teammateMode === true`
- **Tier-1 indexer**: does `.claude/plugins/repo-orchestrator/indexer/dist/index.js` exist?
- **Tier-2 MCP server**: does `.claude/plugins/repo-orchestrator/mcp/dist/server.js` exist?

---

## Step 3 — Print the dashboard

```text
═══════════════════════════════════════════════════════════════
repo-orchestrator  status
═══════════════════════════════════════════════════════════════

Infrastructure
──────────────────────────────────────────────────────────────
  <icon>  Agent Teams          <detail>
  <icon>  Tier-1 indexer       <detail>
  <icon>  Tier-2 MCP server    <detail>

Registered repos  (<N> total)
──────────────────────────────────────────────────────────────
  Repo               Last indexed      Context  Graph  Skill  Agent  Flags
  ──────────────────────────────────────────────────────────
  <name>             <relative-time>   <icon>   <icon> <icon> <icon> <flags>
  <name>             <relative-time>   <icon>   <icon> <icon> <icon> <flags>
  ...

Legend:  ✓ present   ✗ missing   ○ optional/not built
Flags:   [edited] = context file has user edits (re-sync recommended)
         [no-owns] = owns field is empty (routing will miss this repo)
         [stale] = last indexed > 7 days ago

──────────────────────────────────────────────────────────────
```

**Icon rules:**
- `✓` (green) = present / enabled
- `✗` (red) = missing or disabled and required
- `○` (dim) = missing but optional

**Flag rules:**
- `[edited]`: `userEdited: true` in the registry entry → user has manually edited context since last sync
- `[no-owns]`: `owns` array is empty or absent → routing will never select this repo
- `[stale]`: `lastIndexed` is more than 7 days before today → context may be out of date

---

## Step 4 — Print actionable recommendations

After the table, emit a recommendations block only if there are issues to fix. Skip this block entirely if everything is `✓` with no flags.

```text
Recommendations
──────────────────────────────────────────────────────────────
```

For each issue, one line:

| Condition | Recommendation |
|-----------|----------------|
| `[no-owns]` on any repo | Run `/repo-orch-edit <name>` — add domain keywords to the `owns` field so routing can select it |
| `[stale]` on any repo | Run `/repo-orch-sync` — re-index repos that have changed since last index |
| `[edited]` on any repo | Run `/repo-orch-sync` — merge your manual edits with any code changes since your last edit |
| Any repo missing Agent file | Run `/repo-orch-init` — specialist agent file was not generated |
| Any repo missing Context file | Run `/repo-orch-init` — context document was not generated |
| Agent Teams not enabled | Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.claude/settings.json` and restart Claude Code |
| Graph missing for any repo | Run `/repo-orch-graph` — build knowledge graphs to reduce triage token cost |

If no issues: print `  All repos healthy — no action needed.`

---

## Step 5 — Quick-action hint

Always print at the end:

```text
──────────────────────────────────────────────────────────────
  Triage a ticket:   /repo-orch-triage "<description>"
  Root-cause mode:   /repo-orch-deliberate "<incident>"
  Edit context:      /repo-orch-edit <repo-name>
  Re-index:          /repo-orch-sync
═══════════════════════════════════════════════════════════════
```
