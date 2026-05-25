---
name: repo-orch-init
description: "Bootstrap: discover all repos in the workspace, index them, generate editable context docs and specialist agents (each with a unique name and per-repo skill file), and register them with the master. Pauses for user review before writing agents."
---

# /repo-orch-init

Bootstrap the repo-orchestrator for your workspace. Run this once from your workspace root (the directory that contains your service repos as immediate subdirectories).

## What this command does

1. Discovers all repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Writes an editable context document per repo — **then stops for your review**
4. On your confirmation: generates specialist agents (each with a unique name and a per-repo skill file) and updates `registry.json`

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

If no repos are discovered, stop: "No git repositories found as immediate subdirectories of `<root>`. Check your workspace layout or switch to `mode: list` in `.repo-orchestrator/config.json`."

---

## Step 2 — Index each repo

For each discovered repo, **try the Tier-1 indexer first**:

```bash
node indexer/dist/index.js <repoPath>
```

If this command succeeds (exit code 0), parse the JSON output as `facts`. If it fails or the file does not exist, fall back to **Tier-0 indexing using the `repo-indexing` skill** (`skills/repo-indexing/SKILL.md`).

Apply the budget rule from that skill. Do not read every file. Extract: `languages`, `frameworks`, `owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`, `fingerprint`.

---

## Step 2.5 — Build knowledge summaries (optional)

After indexing all repos, build a Claude-native knowledge summary for each repo. Best-effort — if a summary build fails for any repo, continue normally.

Run `/repo-orch-graph` to build the summaries. This uses the current Claude session directly — no Python, no API key, no external tools required.

If any summary fails to build, print:

```text
⚠️  Summary build failed for <name> — skipping.
Run /repo-orch-graph after setup to retry.
```

---

## Step 3 — Write context documents

For each repo, create `.repo-orchestrator/context/<name>.md`:

- Copy the template from `schemas/context-template.md`
- Fill in all frontmatter fields with the indexed values
- Fill in all prose sections with your findings
- If a field is empty, write `[]` in frontmatter and "None identified." in the prose section

Do NOT create `.claude/agents/` files yet. Do NOT update `registry.json` yet.

---

## Step 4 — PAUSE for review (hard checkpoint)

After writing all context files, output this message and **stop**:

```text
Context files written for N repo(s):

  auth-service    -> .repo-orchestrator/context/auth-service.md
  payments        -> .repo-orchestrator/context/payments.md
  ...

Please review and edit these files now.
Pay attention to:
  - The `owns` field (routing keywords — what would a ticket author say to describe a problem here?)
  - The `endpoints`, `emits`, `consumes` fields (cross-repo contracts)
  - The `authContracts`, `errorContracts`, `dataContracts` fields (specialist analysis depth)
  - The prose sections (your specialist agents will read these to understand the service)

To open a context file: use your editor or run `/repo-orch-edit <name>`.

IMPORTANT — per-repo skill files will also be generated at:
  .repo-orchestrator/skills/auth-service.md
  .repo-orchestrator/skills/payments.md
  ...

These contain auto-detected content (critical files, code paths, test commands).
The most valuable sections — "Known gotchas" and "Conventions and banned patterns" —
cannot be automated. They encode team knowledge that lives outside the code:
migration quirks, "never mock the DB" rules, startup-time side effects, etc.

Please review and enrich the skill files before running your first triage.
The richer these files are, the more accurate your specialists will be.

When you are happy with the context files, reply "done" or "register".
```

---

## Step 5 — Register (on user confirmation)

Wait for the user to reply with "done", "register", "yes", "continue", or similar affirmative. Then:

### 5a — Derive agent display name

For each repo, derive a **friendly display name** for the specialist agent. The display name makes the agent easy to call directly by name. Rules:

- Title-case the repo name, replacing hyphens/underscores with spaces
- Append "Specialist": `auth-service` → "Auth Service Specialist", `payments` → "Payments Specialist"
- Store as `{{DISPLAY_NAME}}` for template substitution

Users can then invoke agents directly by name (e.g., `@Auth Service Specialist` or `@Payments Specialist`) without needing to remember the `repo-` prefix convention.

### 5b — Generate per-repo skill files

For each repo, create `.repo-orchestrator/skills/<name>.md`. This is the deepest layer of domain knowledge for the specialist — it encodes what a new engineer would need to know that is NOT in the source code comments.

Write the skill file with this structure:

```markdown
---
name: {{NAME}}-domain-knowledge
description: "Deep domain knowledge for the {{NAME}} repo — conventions, critical paths, known gotchas, and testing instructions for the {{DISPLAY_NAME}}."
---

# {{DISPLAY_NAME}} — Domain Knowledge

## Critical files

List the 3–5 files a new engineer working on a ticket would read first, with one-line descriptions of each.

## Known gotchas

Sharp edges that would surprise a generalist:
- <specific gotcha with file reference if applicable>

## Conventions and banned patterns

Team decisions and patterns NOT to use:
- <convention or ban with reason>

## Critical code paths

The most important execution flows — trace the main happy path through the codebase:
- <flow name>: <entry point file> → <key intermediate files> → <output/response>

## Testing

How to run tests for this service:
- Unit: <command>
- Integration: <command>
- Contract: <command if applicable>

What to test before any change touches a public contract (endpoint, event, JWT claim):
- <specific assertion or test scenario>
```

Fill in all sections with what you discovered during indexing. Write "None identified." for sections with no findings.

### 5c — Generate specialist agents

For each repo, create `.claude/agents/repo-<name>.md` from `agents/repo-specialist-template.md`:

- Replace `{{NAME}}` with the repo name (e.g., `auth-service`)
- Replace `{{DISPLAY_NAME}}` with the derived display name (e.g., `Auth Service Specialist`)
- Replace `{{PATH}}` with the repo path (e.g., `./auth-service`)
- Replace `{{OWNS_CSV}}` with the `owns` array joined by `","` (comma-space)
- Replace `{{ENDPOINTS_CSV}}` with the `endpoints` array joined by `","` (comma-space), or `"none"` if empty

Read current values from the context file frontmatter (the user may have edited them since Step 3).

### 5d — Write / update `registry.json`

For each repo, upsert the entry in `.repo-orchestrator/registry.json`. Structure per `schemas/registry.schema.json`. Set `lastIndexed` to the current ISO8601 timestamp. Set `userEdited: false`. Validate before saving.

### 5e — Ensure `.claude/settings.json` has Agent Teams enabled

Check whether `.claude/settings.json` exists. If not, offer to create it:

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

If the file exists, check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is already set. If not, offer to add it.

---

## Step 6 — Report

```text
Master now knows N repo specialist(s):

  Auth Service Specialist    (repo-auth-service)   -> .claude/agents/repo-auth-service.md
  Payments Specialist        (repo-payments)        -> .claude/agents/repo-payments.md
  ...

Per-repo skill files:
  .repo-orchestrator/skills/auth-service.md
  .repo-orchestrator/skills/payments.md
  ...

Registry updated: .repo-orchestrator/registry.json

Please restart your Claude Code session so the newly written agents are loaded.

After restarting you can:
  - Verify setup works:          /repo-orch-status
  - Call a specialist directly:  @Auth Service Specialist what does the token refresh flow look like?
  - Triage a ticket:             /repo-orch-triage "Users getting 401 after auth refactor"
  - Root-cause an incident:      /repo-orch-deliberate "Payments failing intermittently"
  - Edit a context file:         /repo-orch-edit auth-service
  - Refresh after code changes:  /repo-orch-sync

Smoke test — confirm routing works before your first real ticket:
  /repo-orch-triage "<paste a recent bug title from your backlog>"
  Expected: routing decision with ≥1 candidate and a reason string.
```
