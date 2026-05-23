---
name: triage
description: "Master controller: route a ticket to responsible repo specialists, have them deliberate, and return a single consolidated change plan. Propose-only — no files are modified."
---

# /triage <ticket>

Route a ticket or feature request to the responsible repo specialists and synthesise a consolidated change plan.

Usage: `/triage "Users are getting 401 errors after the recent auth refactor"`

**This command proposes only. No files are modified, no commits are made.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Step 1 — Load registry and route

Read `.repo-orchestrator/registry.json`. If not found, stop: "Registry not found. Run `/init-context` first."

Use the `routing` skill (`skills/routing/SKILL.md`) to select candidate repos. Cap at 5.

Print the routing decision (keywords extracted, candidates with scores).

If 0 candidates: stop and report "No responsible repo identified. Review the `owns` fields in `.repo-orchestrator/registry.json` or run `/sync-context`."

---

## Step 2 — Single-repo shortcut

If routing returns exactly 1 candidate with high confidence (score ≥ 4 or no other repo scored):
- Skip the Agent Team entirely.
- Spawn a single subagent using the candidate's `agentType`.
- Pass the full ticket text and instruct it to produce the standard report block.
- Jump to Step 5.

---

## Step 3 — Spawn Agent Team

For 2–5 candidates, spawn an **Agent Team** using the candidates' `agentType` values from the registry.

Set each teammate's system context to include:
- The full ticket text
- The registry entry for their repo (name, path, owns, endpoints, emits, consumes)
- Instruction to read their context file on startup
- Instruction to perform the VERDICT step first before any deep analysis
- Instruction to use the mailbox to deliberate with named teammates over cross-repo contracts
- Hard rule: propose only, never modify files

Enable `permissionMode: "plan"` for all teammates (read + delegate tools only — no write tools).

---

## Step 4 — Collect verdicts and deliberate

Wait for all teammates to emit their VERDICT line.

Drop any teammate whose verdict is `NOT_RESPONSIBLE` with confidence ≥ 80%.

Allow remaining specialists to deliberate via the mailbox over any cross-repo contracts they identified (changed endpoint shapes, event schema changes, shared DB fields, JWT claim changes).

Each specialist should acknowledge the other's concerns before finalising their report.

---

## Step 5 — Synthesise the plan

After all specialists have returned their report blocks, synthesise a single consolidated plan for the developer:

```
═══════════════════════════════════════════════════════════════
TRIAGE REPORT — <ticket summary>
Generated: <ISO8601 timestamp>
═══════════════════════════════════════════════════════════════

ROUTING
  Ticket keywords: <keywords>
  Responsible repos: <repo1>, <repo2>, ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Include each specialist's full report block here]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSOLIDATED CHANGE PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ordered steps (resolve cross-repo dependencies before dependents):

1. [repo-name] <change description>
   Files: <specific files to touch>
   Depends on: (none | step N completing first)

2. [repo-name] <change description>
   ...

CROSS-REPO CONTRACT CHANGES:
  <If any endpoint, event, or shared schema is changing, list it here with all affected repos>

RISKS:
  <Aggregated risks from all specialist reports>

VALIDATION:
  <Aggregated validation hints — how to test the complete change end-to-end>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  This is a PROPOSED PLAN only. No files have been modified.
    Review the plan, then execute the steps manually or with your team.
═══════════════════════════════════════════════════════════════
```

---

## Step 6 — Clean up the team

After the plan is delivered, release the Agent Team. The session returns to single-agent mode.
