---
name: repo-orch-deliberate
description: "Adversarial multi-repo root-cause mode: spawn all repo specialists as an Agent Team, force them to challenge each other's assumptions with evidence, and surface the true cross-repo root cause of an incident. Max 3 deliberation rounds with a tie-break rule."
---

# /repo-orch-deliberate

Run an adversarial multi-repo root-cause analysis. Use when the cause of an incident is unclear and you need specialists to challenge each other.

Usage: `/repo-orch-deliberate "Payments are failing intermittently — unknown root cause"`

**This command proposes only. No files are modified.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Difference from `/repo-orch-triage`

`/repo-orch-triage` routes to likely-responsible repos and has them deliberate over cross-repo contracts.

`/repo-orch-deliberate` is **adversarial**: it:

1. Involves ALL registered repos (not just routed candidates)
2. Requires each specialist to **challenge other hypotheses with file-and-line evidence**
3. Forces cross-examination via the mailbox before anyone submits a final report
4. Applies a **max 3 deliberation rounds** ceiling and a **tie-break rule** when consensus is not reached
5. Is intended for incidents where the surface symptom is in one repo but the root cause may be anywhere

---

## Step 1 — Load all repos

Read `.repo-orchestrator/registry.json`. Gather all repo entries.

If the registry has more than 8 repos: "Warning — deliberating across N repos will be token-intensive. Consider using `/repo-orch-triage` to narrow scope first if you have a leading hypothesis. Continue anyway? [y/N]"

---

## Step 2 — Pre-fetch graph summaries

For each registered repo, check for a pre-built knowledge summary and compose a `GRAPH_SUMMARY` block using the same logic as `/repo-orch-triage` Step 2 (read `summary.json`, extract fields relevant to the incident keywords). Pass each `GRAPH_SUMMARY_<name>` to the corresponding specialist.

---

## Step 3 — Spawn all specialists as an Agent Team

Spawn all registered repo specialists as an Agent Team. Pass to each:

- Full incident description
- Their registry entry (all fields)
- `GRAPH_SUMMARY_<name>` if available
- Instruction to run full startup sequence (graph → context file → per-repo skill → CLAUDE.md → selective source reads)
- **Adversarial mode instruction:**

  > "You are in adversarial deliberation mode. Your goal is not just to analyze your own repo but to test whether other specialists' hypotheses are consistent with the contracts you own.
  >
  > Before submitting your final report you MUST:
  > 1. Read every other specialist's initial verdict and reasoning.
  > 2. For each RESPONSIBLE or PARTIALLY_RESPONSIBLE verdict from another specialist: assess whether their proposed root cause is consistent with the shared contracts between your service and theirs.
  > 3. Send at least one mailbox challenge if you believe another specialist's hypothesis contradicts a contract you own — cite the specific contract (endpoint, event name, error code, JWT claim, env var) and the file+line that proves the inconsistency.
  > 4. If another specialist sends you a challenge, respond with evidence — a file path and line number — not assertions.
  > 5. **Even if you emit NOT_RESPONSIBLE for your own repo**, you must still act as a skeptic. Read every other specialist's hypothesis and challenge any that contradict a contract your service owns. Your value in this team is not only your own verdict — it is the cross-repo contract knowledge you hold. A hypothesis that passes unchallenged because you stayed silent is a missed root cause."

- Hard rule: propose only, never modify files

Note: read-only enforcement is provided by the specialists' `tools` allowlist (`Read, Grep, Glob, Bash`) and the PreToolUse hook defined in the specialist template. The `permissionMode: "plan"` frontmatter field has no effect on plugin-provided agents per Claude Code platform design — do not rely on it as a safety guarantee.

---

## Step 4 — Deliberation rounds (max 3)

Track deliberation rounds. Each round:

1. All specialists who have raised a challenge await a response.
2. All specialists who received a challenge must respond with evidence (file+line) or concede the point.

**Evidence standard (strictly enforced):**

- A hypothesis stands only if the specialist can cite the specific code path that produces the observed symptom.
- A challenge closes a hypothesis only if the challenger cites a contract (file+line) that is inconsistent with the proposed cause.
- Vague statements ("my service is healthy", "I don't think this is us") do not count as evidence — they are flagged as unresolved.

**Round ceiling:** After 3 rounds, if any hypothesis is still contested, apply the tie-break rule (Step 4b) rather than continuing.

**Early exit:** If all specialists reach consensus on the root cause before 3 rounds, proceed to Step 5 immediately.

**Missing specialist handling:** Before applying the tie-break rule, check whether every spawned specialist returned both an initial verdict and a final report. For any specialist that did not, add:

```text
[INCOMPLETE — repo-<name> did not return a report.
 This repo was not included in the root cause assessment.]
```

to both SPECIALISTS CONSULTED and ROOT CAUSE ASSESSMENT. Adjust the final confidence label downward by one level (High → Medium, Medium → Low) for each incomplete specialist — the root cause assessment is less certain when not all repos were heard from.

### Step 4b — Tie-break rule

If after 3 rounds two or more hypotheses remain credible and contested:

1. Select the hypothesis supported by the most recent git commit in the affected area (recency = leading indicator).
2. If recency is equal, select the hypothesis whose proposed cause would explain the broadest set of observed symptoms.
3. If still tied, report **both** as co-equal candidates and mark both `[UNRESOLVED — human decision required]`.

---

## Step 5 — Synthesize adversarial root-cause report

```text
═══════════════════════════════════════════════════════════════
DELIBERATION REPORT
Incident:  <incident text>
Generated: <ISO8601 timestamp>
Mode:      ADVERSARIAL ROOT-CAUSE  |  Rounds completed: <N>/3
═══════════════════════════════════════════════════════════════

SPECIALISTS CONSULTED: <repo1>, <repo2>, ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HYPOTHESES RAISED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  (each bullet: specialist who raised it, hypothesis, evidence cited)
  • <repo-name>: <hypothesis> — evidence: <file:line>
  • <repo-name>: <hypothesis> — evidence: <file:line>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CROSS-EXAMINATION LOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Round 1:
    <challenger> → <challenged>: <claim and contract cited>
    <challenged> response: <confirmed | refuted | conceded> — <file:line>
  Round 2: ...
  Round 3: ...

  Challenges without evidence-backed responses: <list or "None">

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<Each specialist's full report block in RESPONSIBLE-first order>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOT CAUSE ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Primary root cause:  <repo-name> — <specific description>
Confidence:          <High | Medium | Low>
Basis:               <what evidence from deliberation supports this conclusion>
Tie-break applied:   <Yes — <which rule> | No>

Alternative hypotheses still open:
  • <hypothesis>: <why not conclusively ruled out>
  • [UNRESOLVED — human decision required]: <if tie-break could not resolve>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMEDIATION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(Same ordered-step format as /repo-orch-triage consolidated plan)

Step 1  [<repo-name>]  <change description>
        Files:      <specific files>
        Why:        <reason>
        Depends on: None

...

ROLLBACK GUIDANCE:
  Signal:   <how to tell the fix made things worse>
  Rollback: [<repo-name>] <what to revert>

VALIDATION:
  <end-to-end test or assertion confirming the incident is resolved>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  PROPOSED PLAN ONLY — no files have been modified.
═══════════════════════════════════════════════════════════════
```
