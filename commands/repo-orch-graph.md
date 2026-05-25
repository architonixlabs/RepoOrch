---
name: repo-orch-graph
description: "Build or refresh the Claude-native knowledge summary for one or all repos. Produces .repo-orchestrator/graphs/<name>/summary.json used by /triage to pre-populate specialist context, reducing token consumption. No external dependencies — runs entirely within the Claude session."
---

# /repo-orch-graph [repo]

Build (or incrementally refresh) the knowledge summary for all repos, or a single named repo.

Usage:

- `/repo-orch-graph` — build summaries for all repos in the registry
- `/repo-orch-graph auth-service` — build/refresh summary for one repo
- `/repo-orch-graph --rebuild` — force full rebuild even if summary exists

Summaries are stored in `.repo-orchestrator/graphs/<name>/` and consumed automatically by `/repo-orch-triage`.

No Python, no API key, no external tools required — this command runs entirely within the current Claude Code session.

---

## Step 1 — Check registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop:
"Registry not found. Run `/repo-orch-init` first."

If a repo name was provided, find that entry. If not found, stop:
"Repo `<name>` not found in registry. Available: `<list of names from registry>`"

---

## Step 2 — Decide full build vs. incremental

For each repo to process:

1. Determine the repo path from `registry.json` (the `path` field).
2. Set the output path: `.repo-orchestrator/graphs/<name>/summary.json`.
3. **Full build** if: `--rebuild` was passed OR `summary.json` does not exist.
4. **Incremental update** if: `summary.json` exists and `--rebuild` was not passed.
   - Run `git -C <repoPath> rev-parse HEAD` to get the current HEAD SHA.
   - Read the `generatedAt.commitSHA` field from the existing `summary.json`.
   - If the SHAs match: print `<name>  up to date — skipping.` and skip this repo.
   - If they differ: run a full build (the codebase has changed since last summary).

---

## Step 3 — Build summary (Claude-native, no external tools)

For each repo requiring a build, spawn a **subagent** with the following instructions. The subagent has read-only access to the repo's files. Pass it the repo name, repo path, and the registry entry (all fields).

---

### Subagent instructions

You are building a knowledge summary for the **`<name>`** repository at `<path>`. Your output will be saved as `.repo-orchestrator/graphs/<name>/summary.json` and used to give triage specialists a fast orientation layer before they read source files. Write accurate, specific content — specialists will rely on it.

**You must not modify any file. Read only.**

#### Reading budget

Large repos can have hundreds of files. Read strategically — do not read every file. Work through these in order and stop as soon as you have enough to fill all summary fields:

1. `README.md` or `README.*` — purpose, architecture overview, key concepts
2. Package/build manifest: `package.json`, `*.csproj`, `pom.xml`, `go.mod`, `pyproject.toml`, `Gemfile`, `Cargo.toml` — languages, frameworks, direct dependencies
3. Top-level directory listing (one level) — understand the module/layer structure
4. Entry points: `src/main.*`, `cmd/main.*`, `app.*`, `server.*`, `index.*` (max 3 files, first 100 lines each)
5. Route/controller/handler files: `*.routes.*`, `*.controller.*`, `*.handler.*`, `router.*` (max 5 files, first 80 lines each)
6. Event definitions: `*.events.*`, `events.*`, `*.pubsub.*` (max 3 files)
7. Shared schema/contract files: `*.schema.*`, `*.proto`, `*.graphql` (max 3 files)
8. Recent git log — understand what changed recently:

   ```bash
   git -C <path> log --oneline -20
   ```

#### What to produce

Build a JSON object with these fields:

```json
{
  "repo": "<name>",
  "generatedAt": {
    "timestamp": "<ISO8601>",
    "commitSHA": "<git HEAD SHA>"
  },
  "purpose": "<one sentence — what this service does>",
  "keyModules": [
    { "path": "<relative/path/to/module>", "role": "<what it does — one line>" }
  ],
  "domainConcepts": ["<concept1>", "<concept2>"],
  "criticalPaths": [
    "<short description of an important execution path, e.g. 'POST /login → auth middleware → JWT issuance'>"
  ],
  "entryPoints": [
    { "type": "<http|grpc|event|websocket|cli>", "name": "<METHOD /path or event name>", "handler": "<file:line>" }
  ],
  "crossRepoContracts": {
    "callsOut": ["<repo-name>: <what it calls>"],
    "calledBy": ["<repo-name>: <what they call>"],
    "sharedEvents": ["<event name>: <emit|consume>"],
    "sharedData": ["<table or cache key shared with other services>"]
  },
  "recentChurn": [
    { "file": "<relative path>", "commits": <N>, "summary": "<what changed — one line>" }
  ],
  "knownRisks": ["<architectural concern or known fragile area>"],
  "tokenBudgetUsed": "<estimated tokens read during this build>"
}
```

Field rules:

- `keyModules`: 3–10 entries. Only the most architecturally significant modules — not every file.
- `domainConcepts`: 5–15 short keywords a ticket author would use to describe problems in this service (e.g. `auth`, `jwt`, `sessions`).
- `criticalPaths`: 2–5 key request flows or processing pipelines. One sentence each.
- `entryPoints`: all externally-facing interfaces found. Empty array if none found.
- `crossRepoContracts`: populate from manifest imports, event files, and context file `dependsOn`/`providesTo` if available. Empty arrays are valid.
- `recentChurn`: files with 3+ commits in the last 20 log entries. These are hotspots relevant to triage.
- `knownRisks`: flag anything that would surprise a triage specialist — missing tests on a critical path, a module that does too many things, a deprecated dependency still in use.
- `tokenBudgetUsed`: rough estimate (e.g. "~3200 tokens"). Helps the user understand cost.

Write factual, evidence-based content. Every `criticalPaths` entry and `knownRisks` entry should be derivable from what you read. Do not speculate.

---

After the subagent returns, write its JSON output to `.repo-orchestrator/graphs/<name>/summary.json`.

If the subagent fails or returns malformed output: print a warning and continue with the next repo — do not abort the whole run:

```text
⚠️  Summary build failed for <name>: <error>. /repo-orch-triage will fall back to direct file reads for this repo.
```

Print progress per repo as each completes:

```text
Building summary for auth-service... done (~3200 tokens, 8 key modules, 4 critical paths)
Building summary for payments...     done (~2800 tokens, 6 key modules, 3 critical paths)
```

---

## Step 4 — Report

```text
✅ Knowledge summaries built:

  auth-service  → .repo-orchestrator/graphs/auth-service/summary.json
  payments      → .repo-orchestrator/graphs/payments/summary.json

/repo-orch-triage will now use these summaries to pre-populate specialist context.
Run /repo-orch-graph --rebuild to force a full rebuild after major refactors.

No API key or external tools required — summaries are built by Claude directly.
```
