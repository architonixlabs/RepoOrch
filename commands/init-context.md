---
name: init-context
description: "Bootstrap: discover all repos in the workspace, index them, generate editable context docs and specialist agents, and register them with the master. Pauses for user review before writing agents."
---

# /init-context

Bootstrap the repo-orchestrator for your workspace. Run this once from your workspace root (the directory that contains your service repos as immediate subdirectories).

## What this command does

1. Discovers all repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Writes an editable context document per repo — **then stops for your review**
4. On your confirmation: generates specialist agents and updates `registry.json`

---

## Step 1 — Discover repos

Read `.repo-orchestrator/config.json` if it exists. If it does not exist, create it with this default content:

```json
{
  "discovery": {
    "mode": "auto",
    "root": ".",
    "exclude": [".git", ".claude", ".repo-orchestrator", "node_modules"]
  }
}
```

**If `mode` is `"auto"`:**
List all immediate subdirectories of `root`. Keep the ones that contain a `.git` directory (or are listed in `.git/modules`, indicating a submodule). Remove any directory whose name appears in `exclude`.

**If `mode` is `"list"`:**
Use the `repos` array as-is. Do not scan. For any entry whose `path` starts with a URL (e.g., `https://`):
- Ask the user explicitly: "Clone `<url>` into `<local-path>`? This requires a network connection and will write to your filesystem. [y/N]"
- Do not clone without explicit confirmation.

If no repos are discovered, stop and output: "No git repositories found as immediate subdirectories of `<root>`. Check your workspace layout or switch to `mode: list` in `.repo-orchestrator/config.json`."

---

## Step 2 — Index each repo

For each discovered repo, **try the Tier-1 indexer first**:

```bash
node indexer/dist/index.js <repoPath>
```

If this command succeeds (exit code 0), parse the JSON output as `facts`. If it fails or the file does not exist, fall back to **Tier-0 indexing using the `repo-indexing` skill** — read this skill now if you have not already:
`skills/repo-indexing/SKILL.md`

Apply the budget rule from that skill. Do not read every file. Extract: `languages`, `frameworks`, `owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`, `fingerprint`.

---

## Step 2.5 — Build knowledge graphs (optional, reduces triage token cost)

After indexing all repos, attempt to build a graphify knowledge graph for each repo. This is a best-effort step — if graphify is not installed or fails, continue normally. `/triage` will fall back to direct file reads.

For each repo, run from the workspace root:

```powershell
New-Item -ItemType Directory -Force -Path ".repo-orchestrator/graphs/<name>" | Out-Null
& $GRAPHIFY_PYTHON -m graphify <repoPath> `
    --output-dir ".repo-orchestrator/graphs/<name>" `
    --mode deep `
    --no-viz `
    --directed
```

Where `$GRAPHIFY_PYTHON` is found using the same detection logic as `/graph-context`. If graphify is not installed, skip this step entirely and print:

```
ℹ️  graphify not installed — skipping knowledge graph build.
    Run /graph-context after setup to build graphs and reduce future triage token cost.
```

If graphify is installed but fails for a specific repo, print a warning for that repo and continue.

---

## Step 3 — Write context documents

For each repo, create `.repo-orchestrator/context/<name>.md`:
- Copy the template from `schemas/context-template.md`
- Fill in all frontmatter fields with the indexed values
- Fill in the prose sections (Purpose, Architecture & key modules, Public contracts, Data stores, Cross-repo dependencies, Known issues / gotchas, Glossary) with your findings
- If a field is empty (e.g., no events found), write the empty array `[]` in frontmatter and "None identified." in the prose section

Do NOT create `.claude/agents/` files yet. Do NOT update `registry.json` yet.

---

## Step 4 — PAUSE for review (hard checkpoint)

After writing all context files, output this message and **stop**. Do not proceed until the user responds.

```
✅ Context files written for N repo(s):

  • auth-service    → .repo-orchestrator/context/auth-service.md
  • payments        → .repo-orchestrator/context/payments.md
  ...

📝 Please review and edit these files now.
   Pay attention to:
   - The `owns` field (used for routing — add domain keywords a ticket author would use)
   - The `endpoints`, `emits`, `consumes` fields (cross-repo contracts)
   - The prose sections (your specialist agents will read these)

   To open a context file: use your editor or run `/edit-context <name>`.

When you are happy with the context files, reply "done" or "register" to generate the specialist agents and update the registry.
```

---

## Step 5 — Register (on user confirmation)

Wait for the user to reply with "done", "register", "yes", "continue", or similar affirmative. Then:

### 5a — Generate specialist agents

For each repo, create `.claude/agents/repo-<name>.md` from `agents/repo-specialist-template.md`:
- Replace `{{NAME}}` with the repo name
- Replace `{{PATH}}` with the repo path (e.g., `./auth-service`)
- Replace `{{OWNS_CSV}}` with the `owns` array joined by `, `
- Replace `{{ENDPOINTS_CSV}}` with the `endpoints` array joined by `, ` (or "none" if empty)

Read the current values from the context file's frontmatter (the user may have edited them).

### 5b — Write / update `registry.json`

For each repo, upsert the entry in `.repo-orchestrator/registry.json`. Structure per `schemas/registry.schema.json`. Set `lastIndexed` to the current ISO8601 timestamp. Set `userEdited: false` (the user has reviewed but this is the first write). Validate the file against `schemas/registry.schema.json` before saving.

### 5c — Ensure `.claude/settings.json` has Agent Teams enabled

Check whether `.claude/settings.json` exists. If it does not exist, offer to create it:

"May I create `.claude/settings.json` to enable Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)? This is required for the multi-repo deliberation flow. [y/N]"

If the user agrees, create:

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

If the file exists, check if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is already set. If not, offer to add it.

---

## Step 6 — Report

Output a summary:

```
🎉 Master now knows N repo agent(s):

  repo-auth-service    → .claude/agents/repo-auth-service.md
  repo-payments        → .claude/agents/repo-payments.md
  ...

Registry updated: .repo-orchestrator/registry.json

⚠️  Please restart your Claude Code session so the newly written project agents are loaded.
    Then use /triage <ticket> to route work to the appropriate specialists.
```
