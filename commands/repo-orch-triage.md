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

**Generate a `TRIAGE_ID`:** Produce a short deterministic session token by taking the first 8 characters of the SHA-256 of `<ticket-text>+<ISO8601-timestamp>`. Format: `triage-<8chars>` (e.g., `triage-a3f9c812`). Pass this token to every specialist in their context and require it back in their report. Use it to match reports to this session if specialists return asynchronously.

**Validate the ROUTING CONTEXT block** before passing it to any specialist. Confirm it contains:

- `Routing confidence:` line
- `Your routing score:` line
- At least one `agent: repo-` line per candidate in the Teammates section

If any field is missing, regenerate the block from the raw routing scores before proceeding.

Print the full routing decision block before proceeding.

If 0 candidates: stop and report "No responsible repo identified. Review the `owns` fields in `.repo-orchestrator/registry.json` or run `/repo-orch-edit <name>` to add domain keywords."

---

## Step 2 — Pre-fetch graph summaries (all paths)

Before making the single-repo vs. team decision, check every candidate for a pre-built knowledge graph. This step runs for **both** the single-repo shortcut and the Agent Team path — do not skip it based on candidate count.

For each candidate where `.repo-orchestrator/graphs/<name>/graph.json` exists, run the graphify detection script from Step 2 of `/repo-orch-graph` to obtain `$GRAPHIFY_PYTHON`, then query:

```powershell
& $GRAPHIFY_PYTHON -m graphify query "<routing keywords joined by space>" `
    --graph ".repo-orchestrator/graphs/<name>/graph.json" `
    --budget 1200
```

Store the result using this exact wire format so the specialist can identify their own summary unambiguously:

```text
GRAPH_SUMMARY for repo: <name>
<graphify query output>
END GRAPH_SUMMARY
```

If graphify is not installed or the query fails for a repo, omit that repo's block entirely — do not pass a null placeholder. The specialist falls back to direct file reads when no block is present. Do not abort the triage.

---

## Step 3 — Single-repo shortcut

If the routing skill returns exactly 1 candidate **or** the top candidate's `routingConfidence` ≥ 80% with a score gap ≥ 4 from the second:

- Skip the Agent Team entirely
- Spawn a single subagent using the candidate's agent name (`repo-<name>`)
- Pass the full ticket text, the ROUTING CONTEXT block, the candidate's full registry entry (all fields — the specialist needs `authContracts`, `errorContracts`, `dataContracts`, etc. for contract analysis), and `GRAPH_SUMMARY_<name>` if available

Before proceeding to Step 5, apply the **evidence standard** to the returned report: any "no impact", "not affected", or "no contract changes" claim that does not cite a specific file path and line number must be flagged as `[UNRESOLVED — evidence required]` and added to the RISKS section of the final plan. Do not silently accept unsupported claims on this path.

Then jump to Step 5.

---

## Step 3.5 — Spawn Agent Team (2–5 candidates)

**Candidate count guard:** If routing returned more than 5 candidates (should not occur given the routing skill's cap, but guard against it): trim to the top 5 by normalized score before spawning. Print: "Warning — routing returned N > 5 candidates. Trimming to top 5 by score. Consider `/repo-orch-deliberate` for full-registry coverage."

Graph summaries were already fetched in Step 2 — do not re-fetch here. Use the `GRAPH_SUMMARY_<name>` values collected above.

For 2–5 candidates, spawn an **Agent Team** using the candidates' agent names (`repo-<name>` form from the registry).

Pass to each specialist in their system context:

- Full ticket text
- Registry entry for their repo (all fields — specialists use `authContracts`, `errorContracts`, `dataContracts`, etc. for contract analysis)
- `GRAPH_SUMMARY_<name>` if available (pre-fetched in Step 2 above)
- The full ROUTING CONTEXT block (keywords, routing confidence, their score, reason selected, other candidates with agent names)
- Instruction: read startup sequence in order (graph summary → context file → per-repo skill → CLAUDE.md → selective source reads)
- Instruction: emit VERDICT first before any deep analysis
- Instruction: deliberate with named teammates over cross-repo contracts via the mailbox (max 2 rounds per pair)
- Hard rule: propose only, never modify files

Note: read-only enforcement is provided by the specialists' `tools` allowlist (`Read, Grep, Glob, Bash`) and the PreToolUse hook defined in the specialist template. The `permissionMode: "plan"` frontmatter field has no effect on plugin-provided agents per Claude Code platform design — do not rely on it as a safety guarantee.

---

## Step 4 — Collect verdicts and deliberate

After all teammates emit their VERDICT:

1. **Drop NOT_RESPONSIBLE agents:** Drop any teammate with `NOT_RESPONSIBLE` and confidence ≥ 80%. Before dropping, inspect their outgoing mailbox for any challenges they sent to remaining teammates. For each in-flight challenge from a dropped agent: the challenged specialist may discard it without responding (the agent is no longer in scope). If the challenged specialist already responded and the response is material to their own analysis, they should retain it in their DELIBERATION SUMMARY. Do not mark discarded challenges as `[UNRESOLVED]`.

2. **Compute aggregate confidence:** Weight each specialist's score by their routing confidence so borderline candidates contribute less than obvious ones:

   ```text
   weighted_score(s) = CONFIDENCE(s) × ROUTING_CONFIDENCE(s) / 100
   aggregate = sum(weighted_score) ÷ count(remaining specialists)
   ```

   If only one specialist remains, aggregate = that specialist's weighted score. If every remaining specialist is `PARTIALLY_RESPONSIBLE`, apply an additional 0.8× penalty (partial coverage is structurally less certain than full ownership).

3. **Deliberate:** Allow remaining specialists to exchange mailbox messages (max 2 rounds per pair). The master does not intervene in deliberation content — only enforces the round ceiling and the evidence standard.

4. **Enforce evidence standard:** A "no impact" claim from a specialist must cite a specific file path and line number showing their code does not depend on the changing contract. Vague assurances ("my service is healthy", "this doesn't affect us") do not close a risk — flag them as `[UNRESOLVED — evidence required]`.

5. **Collect reports — stale/missing specialist handling:** After deliberation completes (or hits the 2-round ceiling), collect final report blocks from all remaining specialists. If a specialist that was spawned (and not dropped as NOT_RESPONSIBLE) has not returned a final report block, do **not** silently omit them. Add an `[INCOMPLETE]` notice in both SPECIALIST REPORTS and in every CONSOLIDATED CHANGE PLAN step that would touch their contracts:

   ```text
   [INCOMPLETE — repo-<name> did not return a report.
    Manual review of this repo is required before executing any step that touches its contracts.]
   ```

---

## Step 5 — Synthesize the consolidated plan

Before ordering steps, run these three pre-flight checks in sequence:

**1. Dependency resolution cross-check:** For each entry in any specialist's `CROSS-REPO DEPENDENCIES`, check whether another specialist's `DELIBERATION SUMMARY` claims that dependency was resolved. If a resolution claim exists, verify it cites a file path and line number. If it does: mark the dependency resolved in the plan. If it does not: escalate to `[UNRESOLVED — evidence required]` in RISKS regardless of the deliberation claim.

**2. Conflict detection:** Identify any file path that appears in more than one specialist's `PROPOSED CHANGES`. For each conflict, add a `[CONFLICT]` notice at the relevant step:

```text
[CONFLICT — <repo-A> and <repo-B> both propose changes to <file>.
 Review both proposals and reconcile before executing. Do not apply both without coordination.]
```

**3. Partial coverage flagging:** For any plan step derived from a `PARTIALLY_RESPONSIBLE` specialist, append to its `Why:` line:

```text
[PARTIAL — specialist owns only part of this area. Review adjacent modules not covered by this report.]
```

Then produce the triage output:

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
  (simple average of specialist CONFIDENCE scores; below 60% = low confidence — flag for human review)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE BASELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  (Aggregated from specialist "CURRENT STATE BASELINE" fields)
  <repo-name>: <what the code does today in the affected area>
  <repo-name>: <recent commits that provide context>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<Each specialist's full report block, in routing-score order.
 [INCOMPLETE] notices for specialists who did not return a report.>

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
  [CONFLICT — <repo-A> and <repo-B>]  <file conflict note>
  [INCOMPLETE — <repo-name>]  <missing report note>
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
