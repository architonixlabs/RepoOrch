---
name: edit-context
description: "Open and guide editing of a repo's context file. Ingests frontmatter changes back into registry.json on completion."
---

# /edit-context <repo>

Open and guide editing of a specific repo's context document.

Usage: `/edit-context auth-service`

---

## Step 1 — Resolve the repo

Read `.repo-orchestrator/registry.json`. Find the entry with `name == <repo>`. If not found, list available names and stop.

Get the `contextFile` path (e.g., `.repo-orchestrator/context/auth-service.md`). If the file does not exist, stop: "Context file not found. Run `/init-context` first."

---

## Step 2 — Present the file

Read and display the current content of the context file.

Then offer guidance:

```
📄 Context file for <repo>: <contextFile>

Edit this file directly in your editor, or I can help you update specific sections.

Key fields for routing (in the YAML frontmatter):
  owns:      domain keywords — what problem areas does this repo own?
  endpoints: HTTP routes this repo exposes
  emits:     events this repo publishes
  consumes:  events this repo subscribes to

Ask me to update any section, e.g.:
  "Add 'oauth' to owns"
  "The /api/users endpoint was renamed to /api/v2/users"
  "We now consume the order.paid event"

When done editing, say "done" and I'll ingest the changes into the registry.
```

---

## Step 3 — Apply requested edits (if any)

If the user asks for specific changes, apply them to the context file:
- For frontmatter fields: parse the YAML, update the field, re-serialize.
- For prose sections: locate the heading and update the content.
- Always show the diff before writing: "I'll make these changes: [diff]. Proceed? [y/N]"

---

## Step 4 — Ingest on completion

When the user says "done" (or any affirmative indicating they're finished editing):

1. Parse the YAML frontmatter from the saved context file.
2. Update the matching fields in `.repo-orchestrator/registry.json`.
3. Set `userEdited: true` on this registry entry.
4. Validate the registry against `schemas/registry.schema.json`.
5. Save the registry.

Report: "✅ Context for `<repo>` ingested into registry. Run `/sync-context <repo>` to also refresh the agent file if owns/endpoints changed."
