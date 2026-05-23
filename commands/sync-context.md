---
name: sync-context
description: "Incremental refresh: detect repo drift via fingerprint, re-index changed repos, preserve userEdited content, ingest context frontmatter back into registry.json."
---

# /sync-context [repo]

Refresh the registry for all repos, or a single named repo.

Usage:
- `/sync-context` — refresh all repos
- `/sync-context auth-service` — refresh only the `auth-service` repo

---

## Step 1 — Load registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop: "Registry not found. Run `/init-context` first."

If a repo name was provided, find that entry. If not found, stop: "Repo `<name>` not found in registry. Available: <list names>."

---

## Step 2 — Detect drift

For each repo to process:

1. Compute a fresh fingerprint using the method from `skills/repo-indexing/SKILL.md`.
2. Compare to `registry.json` entry's `fingerprint`.
3. Also check if the context file (`.repo-orchestrator/context/<name>.md`) has been modified since `lastIndexed` (compare file mtime to the `lastIndexed` timestamp).

**Decision:**
- If fingerprint unchanged AND context file not modified: repo is up to date. Skip it and report "No drift detected."
- If fingerprint changed: code has changed — re-index.
- If context file is newer than `lastIndexed`: user has made manual edits — ingest frontmatter (Step 3b).

---

## Step 3a — Re-index changed repos

For each repo where code drift was detected:
- Run the same indexing flow as `/init-context` Step 2 (try Tier-1 indexer, fall back to `repo-indexing` skill).
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
- Update the matching fields in `registry.json` (`owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`).
- Set `userEdited: true` on the registry entry.
- Do NOT overwrite prose sections — only the registry JSON.

---

## Step 4 — Refresh agent files if needed

For each re-indexed repo, compare the new `owns` and the derived agent description to the existing agent file. If materially different (owns list changed, or description would change), regenerate `.claude/agents/repo-<name>.md` from the template using the updated values.

---

## Step 5 — Validate and save registry

Validate the updated `registry.json` against `schemas/registry.schema.json`. Write it. Report:

```
Sync complete.

  auth-service    ✅ re-indexed (code drift detected)
  payments        ✅ frontmatter ingested (user edits)
  notifications   ⏭  up to date

Registry updated: .repo-orchestrator/registry.json
```
