---
name: deliberate
description: "Adversarial multi-repo root-cause mode: spawn all repo specialists as an Agent Team, force them to challenge each other's assumptions, and surface the true cross-repo root cause of an incident."
---

# /deliberate <incident>

Run an adversarial multi-repo root-cause analysis. Use this when the cause of an incident is unclear and you need the specialists to challenge each other.

Usage: `/deliberate "Payments are failing intermittently — unknown root cause"`

**This command proposes only. No files are modified.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Difference from `/triage`

`/triage` routes to likely-responsible repos and has them deliberate over cross-repo contracts.

`/deliberate` is **adversarial**: it:
1. Involves ALL registered repos (not just routed candidates)
2. Requires each specialist to **challenge the others' hypotheses**
3. Forces explicit cross-examination via the mailbox before anyone is allowed to submit a final report
4. Is intended for incidents where the surface symptom is in one repo but the root cause may be anywhere

---

## Step 1 — Load all repos

Read `.repo-orchestrator/registry.json`. Gather all repo entries. If the registry has more than 8 repos, warn: "Deliberating across >8 repos will be expensive. Consider using `/triage` to narrow the scope first. Continue? [y/N]"

---

## Step 2 — Spawn all specialists as an Agent Team

Spawn all registered repo specialists as an Agent Team. Pass to each:
- The full incident description
- Instruction to read their context file on startup
- **Adversarial mode instruction:** "Before finalising your verdict, you MUST challenge at least one other specialist's hypothesis via the mailbox. If another specialist's proposed root cause would have implications for your repo, name the exact implication. If their hypothesis seems wrong given what you know about the contracts between your services, say so explicitly and explain why."
- Instruction to produce the standard VERDICT + report block
- Hard rule: propose only, never modify files

---

## Step 3 — Cross-examination phase

Require at least one round of mailbox cross-examination before accepting final reports. Specifically:
- Each specialist that is RESPONSIBLE or PARTIALLY_RESPONSIBLE must send at least one mailbox message to another specialist challenging or confirming a specific hypothesis.
- No specialist may submit a final report until they have either (a) received a response from any specialist they messaged, or (b) the team has completed a full exchange round.

---

## Step 4 — Synthesise adversarial root-cause report

After all specialists have submitted their reports:

```
═══════════════════════════════════════════════════════════════
DELIBERATION REPORT — <incident summary>
Generated: <ISO8601 timestamp>
Mode: ADVERSARIAL ROOT-CAUSE
═══════════════════════════════════════════════════════════════

INCIDENT: <incident text>

SPECIALISTS CONSULTED: <repo1>, <repo2>, ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY HYPOTHESES RAISED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Bullet list of hypotheses surfaced, with the specialist who raised them]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CROSS-EXAMINATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Summary of mailbox exchanges: who challenged whom, what was confirmed/refuted]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Each specialist's full report block]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOT CAUSE ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most likely root cause: <repo-name> — <description>
Confidence: <High|Medium|Low>
Basis: <what evidence from deliberation supports this>

Alternative hypotheses still open:
  - <hypothesis>: <why not conclusively ruled out>

REMEDIATION PLAN:
  [Ordered steps, same format as /triage consolidated plan]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  This is a PROPOSED PLAN only. No files have been modified.
═══════════════════════════════════════════════════════════════
```

---
