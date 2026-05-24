---
name: repo-orch-triage
description: "Master controller: route a ticket to responsible repo specialists, have them deliberate, and return a single consolidated change plan with confidence aggregate, current-state baseline, ordered steps, and rollback guidance. Propose-only — no files are modified."
---

# /repo-orch-triage

Route a ticket or feature request to the responsible repo specialists and synthesize a consolidated, developer-ready change plan.

Usage: `/repo-orch-triage "Users are getting 401 errors after the recent auth refactor"`

**This command proposes only. No files are modified, no commits are made.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Step 1 — Load registry and route

Read `.repo-orchestrator/registry.json`. If not found, stop: "Registry not found. Run `/repo-orch-init` first."

Use the `routing` skill (`skills/routing/SKILL.md`) to select candidate repos. The skill returns:

- Normalized ticket keywords
- Ranked candidates with scores and reasons
- A `routingConfidence` percentage for the top candidate

Print the full routing decision block before proceeding.

If 0 candidates: stop and report "No responsible repo identified. Review the `owns` fields in `.repo-orchestrator/registry.json` or run `/repo-orch-edit <name>` to add domain keywords."

---

## Step 2 — Pre-fetch graph summaries (all paths)

Before making the single-repo vs. team decision, check every candidate for a pre-built knowledge graph. This step runs for both the single-repo shortcut and the Agent Team path.

For each candidate where `.repo-orchestrator/graphs/<name>/graph.json` exists, run the graphify detection script from Step 2 of `/repo-orch-graph` to obtain `$GRAPHIFY_PYTHON`, then query:

```powershell
& $GRAPHIFY_PYTHON -m graphify query "<routing keywords joined by space>" `
    --graph ".repo-orchestrator/graphs/<name>/graph.json" `
    --budget 1200
```

If graphify is not installed or the query fails for a repo, set `GRAPH_SUMMARY_<name>` to `null` — the specialist falls back to direct file reads. Do not abort the triage.

---

## Step 3 — Single-repo shortcut

If the routing skill returns exactly 1 candidate **or** the top candidate's `routingConfidence` ≥ 80% with a score gap ≥ 4 from the second:

- Skip the Agent Team entirely
- Spawn a single subagent using the candidate's `agentType`
- Pass the full ticket text, the ROUTING CONTEXT block, the candidate's full registry entry (all fields — the specialist needs `authContracts`, `errorContracts`, `dataContracts`, etc. for contract analysis), and `GRAPH_SUMMARY_<name>` if available
- Jump to Step 5 when the report arrives

---

## Step 3.5 — Spawn Agent Team (2–5 candidates)

For each candidate where `.repo-orchestrator/graphs/<name>/graph.json` exists:

```powershell
& $GRAPHIFY_PYTHON -m graphify query "<routing keywords joined by space>" `
    --graph ".repo-orchestrator/graphs/<name>/graph.json" `
    --budget 1200
```

Use the graphify detection logic from `/repo-orch-graph`. If graphify is not installed or fails for a repo, set `GRAPH_SUMMARY_<name>` to `null` — the specialist falls back to direct file reads.

---

For 2–5 candidates, spawn an **Agent Team** using the candidates' `agentType` values from the registry.

Pass to each specialist in their system context:

- Full ticket text
- Registry entry for their repo (all fields — specialists use `authContracts`, `errorContracts`, `dataContracts`, etc. for contract analysis)
- `GRAPH_SUMMARY_<name>` if available (pre-fetched in Step 2)
- The full ROUTING CONTEXT block (keywords, routing confidence, their score, reason selected, other candidates with agent names)
- Instruction: read startup sequence in order (graph summary → context file → per-repo skill → CLAUDE.md → selective source reads)
- Instruction: emit VERDICT first before any deep analysis
- Instruction: deliberate with named teammates over cross-repo contracts via the mailbox (max 2 rounds per pair)
- Hard rule: propose only, never modify files

Enable `permissionMode: "plan"` for all teammates.

---

## Step 4 — Collect verdicts and deliberate

After all teammates emit their VERDICT:

1. Drop any teammate with `NOT_RESPONSIBLE` and confidence ≥ 80%.

2. Compute **aggregate routing confidence** = weighted average of remaining specialists' individual confidence scores.

3. Allow remaining specialists to deliberate via the mailbox (max 2 rounds per pair).

4. Enforce the evidence standard: a "no impact" claim from a specialist must cite a file and line — vague assurances are flagged as unresolved.

5. After deliberation completes (or hits the 2-round ceiling), collect final report blocks from all remaining specialists.

---

## Step 5 — Synthesize the consolidated plan

After all specialist reports arrive, produce the triage output:

```text
═══════════════════════════════════════════════════════════════
TRIAGE REPORT
Ticket:    <full ticket text>
Generated: <ISO8601 timestamp>
═══════════════════════════════════════════════════════════════

ROUTING
  Keywords:          <normalized ticket keywords>
  Candidates:        <repo1> (score=N), <repo2> (score=N), ...
  Routing confidence: <N>% — <brief reason, e.g. "auth-service owns JWT/token keywords">

AGGREGATE CONFIDENCE: <N>%
  (weighted average of specialist verdicts; below 60% = low confidence — flag for human review)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE BASELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  (Aggregated from specialist "CURRENT STATE BASELINE" fields)
  <repo-name>: <what the code does today in the affected area>
  <repo-name>: <recent commits that provide context>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<Include each specialist's full report block here, in routing-score order>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSOLIDATED CHANGE PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execution order (deploy dependencies before dependents):

Step 1  [<repo-name>]  <change description>
        Files:      <specific files, with line ranges where known>
        Why:        <reason this change is needed>
        Depends on: None | Step N

Step 2  [<repo-name>]  <change description>
        Files:      ...
        Why:        ...
        Depends on: Step 1

...

CONTRACT CHANGES:
  <If any endpoint, event, or shared schema is changing:>
  <contract type>  <name/path>: <old → new>
  Downstream repos that must also update: <names>

RISKS:  (aggregated from all specialist reports, sorted by severity)
  [HIGH]   <risk description> — <which repo, what to watch>
  [MEDIUM] <risk description>
  [LOW]    <risk description>
  [UNRESOLVED — awaiting <teammate>]  <open item from deliberation>

ROLLBACK GUIDANCE:
  <How to detect that the change should be reverted:>
  - Signal: <metric spike / log pattern / error rate threshold>
  - Rollback step: [<repo-name>] <what to revert and how>
  - Order: <if rollback must be ordered, specify>
  (If no rollback is needed: "Changes are backward-compatible — revert by reverting the PR.")

VALIDATION:
  <Aggregated validation hints — how to test the full change end-to-end>
  - <specific test command or assertion>
  - <cross-repo integration test to run>
  - <expected behavior that confirms the fix is complete>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  PROPOSED PLAN ONLY — no files have been modified.
    Review the plan, then execute the steps manually or with your team.
    Confidence: <N>% — <high/medium/low — note if human review is advised>
═══════════════════════════════════════════════════════════════
```

### Confidence guidance for the developer

After printing the plan, add one of:

- **Confidence ≥ 80%:** "High confidence — routing and analysis are well-grounded. Proceed after code review."
- **Confidence 60–79%:** "Medium confidence — one or more areas have incomplete evidence. Review the RISKS section carefully before executing."
- **Confidence < 60%:** "Low confidence — the ticket may be ambiguous or the registry `owns` fields may need updating. Consider running `/repo-orch-deliberate` for deeper adversarial analysis, or `/repo-orch-edit` to improve routing accuracy."

---

## Step 6 — Clean up the team

After the plan is delivered, release the Agent Team. The session returns to single-agent mode.
