---
name: repo-orch-sync
description: "Incremental refresh: detect repo drift via fingerprint, re-index changed repos, preserve userEdited content, ingest context frontmatter back into registry.json."
---

# /repo-orch-sync [repo]

Refresh the registry for all repos, or a single named repo.

Usage:

- `/repo-orch-sync` — refresh all repos
- `/repo-orch-sync auth-service` — refresh only the `auth-service` repo

---

## Step 1 — Load registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop: "Registry not found. Run `/repo-orch-init` first."

If a repo name was provided, find that entry. If not found, stop: "Repo `<name>` not found in registry. Available: list all names from the registry."

---

## Step 1.5 — Detect stale entries (full sync only)

Skip this step when a specific repo name was provided.

For each entry in the registry, check whether its `path` still exists on disk as a directory. If it does not:

1. Flag it as stale and print:

   ```text
   ⚠️  Stale registry entry: '<name>' — path '<path>' no longer exists.
      This repo may have been deleted or renamed.
      Remove it? [y/N]
   ```

2. If the user says Y:
   - Delete `.claude/agents/repo-<name>.md` if it exists.
   - Delete `.repo-orchestrator/context/<name>.md` if it exists.
   - Delete `.repo-orchestrator/skills/<name>.md` if it exists.
   - Delete `.repo-orchestrator/graphs/<name>/` directory if it exists.
   - Remove the entry from the registry object (do not write yet — the write happens in Step 5).

3. If the user says N: leave the entry in place and continue. It will remain stale until removed manually or re-confirmed at the next sync.

After processing all stale entries, continue with Step 2 for the remaining (non-stale) entries only.

---

## Step 2 — Detect drift

For each repo to process:

1. Compute a fresh fingerprint using the method from `skills/repo-indexing/SKILL.md`.
2. Compare to the `registry.json` entry's `fingerprint`.
3. Check if the context file (`.repo-orchestrator/context/<name>.md`) was modified after `lastIndexed` (compare file mtime to the `lastIndexed` timestamp).

**Decision:**

- If fingerprint unchanged AND context file not modified: repo is up to date — skip and report "No drift detected."
- If fingerprint changed AND context file is NOT newer than `lastIndexed`: code has changed — re-index (Step 3a only).
- If context file is newer than `lastIndexed` AND fingerprint is unchanged: user made manual edits — ingest frontmatter (Step 3b only).
- If **both** fingerprint changed AND context file is newer than `lastIndexed`: run Step 3a to re-index, then immediately run Step 3b to merge the user's manual edits on top of the re-indexed values. Set `userEdited: true` in the registry entry regardless of the outcome — the user has made intentional edits that must survive future syncs.

---

## Step 3a — Re-index changed repos

For each repo where code drift was detected:

- Run the same indexing flow as `/repo-orch-init` Step 2 (try Tier-1 indexer, fall back to `repo-indexing` skill).
- Produce new values for all structured fields.

**Before overwriting the context file:**

- If `userEdited: true` in the registry entry, diff the new indexed values against the current context frontmatter.
- If the diff is non-trivial (owns/endpoints/emits/consumes changed), show the diff and ask: "The indexed data for `<name>` has changed. Overwrite the `userEdited` context with new values? [y/N/show-diff]"
- If the user says N, preserve the existing content and set `userEdited: true`. Update only `fingerprint` and `lastIndexed`.
- If the user says Y, overwrite and set `userEdited: false`.

---

## Step 3b — Ingest manual frontmatter edits

For repos where the context file is newer than `lastIndexed`:

- Parse the YAML frontmatter from `.repo-orchestrator/context/<name>.md`.
- Update the matching fields in `registry.json` (`owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`, plus any contract fields that were edited: `authContracts`, `errorContracts`, `configContracts`, `dataContracts`, `serviceLevel`, `testContracts`).
- Set `userEdited: true` on the registry entry.
- Do NOT overwrite prose sections — only the registry JSON.

---

## Step 3c — Refresh knowledge summaries for re-indexed repos

For each repo where code drift was detected (Step 3a ran), rebuild the knowledge summary if one already exists.

Run `/repo-orch-graph <name>` for each drifted repo. The command compares the current HEAD SHA against `summary.json`'s recorded SHA and rebuilds only if the repo has changed — so it is safe to call even for unchanged repos.

If no summary exists yet for this repo, skip — full builds are `/repo-orch-graph`'s job. If the rebuild fails, skip silently — the existing summary (if any) remains usable for triage.

---

## Step 4 — Refresh agent files if needed

For each re-indexed repo, compare the new `owns` and the derived agent description to the existing agent file. If materially different (owns list changed, or description would change), regenerate `.claude/agents/repo-<name>.md` from the template using the updated values.

Also regenerate the per-repo skill file `.repo-orchestrator/skills/<name>.md` if `owns`, `endpoints`, `emits`, `authContracts`, or `errorContracts` changed — the skill encodes this domain knowledge for the specialist.

---

## Step 5 — Validate and save registry

Before writing, create a backup:

1. If `.repo-orchestrator/registry.json` exists, copy it to `.repo-orchestrator/registry.json.bak`.
2. Validate the updated registry object against `schemas/registry.schema.json`. If validation fails, do NOT write the file — report the validation error and stop. The existing `registry.json` and the `.bak` are both intact.
3. Write the validated registry to `.repo-orchestrator/registry.json`.
4. On success, delete `registry.json.bak`.

If the write is interrupted or fails, the `.bak` file remains as a recovery copy. If `registry.json` is missing or corrupt on any future read, instruct the user: "Registry is corrupt or missing. If `.repo-orchestrator/registry.json.bak` exists, copy it to `registry.json` to restore the last known good state, then run `/repo-orch-sync`."

Report:

```text
Sync complete.

  auth-service    re-indexed (code drift detected)
  payments        frontmatter ingested (user edits)
  notifications   up to date

Registry updated: .repo-orchestrator/registry.json
```
