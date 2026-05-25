---
name: routing
description: "Select which repo specialist agents to involve for a given ticket. Uses keyword scoring with synonym expansion, acronym normalization, and a confidence signal passed to each specialist."
---

# Routing Skill

Use this skill when the master controller needs to select which repo specialist agents to involve for a given ticket or incident description.

## Goal

Given a ticket/incident text and the current `registry.json`, return a ranked list of candidate repos (cap at 5), each with a confidence score and a reason string. Pass both the routing decision and the confidence signal to each specialist agent.

---

## Step 1 — Load the registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop: "Registry not found. Run `/repo-orch-init` first."

Extract the `repos` array. For each repo, the routing-relevant fields are:

| Field | Weight |
| --- | --- |
| `owns` | Primary routing signal — domain keywords the human-chosen routing vocabulary |
| `endpoints` | High-signal match — ticket paths map directly to code |
| `emits` / `consumes` | Event-level routing for async systems |
| `name` | Explicit repo name mentions in the ticket |
| `languages` / `frameworks` | Tech-specific fallback |
| `owner.team` | Team name mentions (e.g., "payments team", "Platform") |

---

## Step 2 — Normalize the ticket text

### 2a. Tokenize

Split on whitespace and punctuation. Lowercase everything. Remove stop words: `the a an is was were are be been being has have had do does did will would could should may might must can cannot`.

### 2b. Acronym expansion table

Expand these before scoring. If a ticket token matches a key, add the expanded form as an additional token:

| Abbreviation | Expand to |
| --- | --- |
| `auth` | authentication, authorization |
| `authn` | authentication |
| `authz` | authorization |
| `jwt` | token, auth |
| `rbac` | roles, permissions, authorization |
| `acl` | permissions, access |
| `sso` | authentication, identity |
| `idp` | identity, authentication |
| `mfa` | authentication, security |
| `2fa` | authentication, security |
| `api` | endpoint, service |
| `cdn` | cache, static, assets |
| `db` | database, persistence |
| `pg` | postgres, database |
| `k8s` | kubernetes, infra, deploy |
| `ci` | build, pipeline |
| `cd` | deploy, pipeline |
| `sla` | availability, latency |
| `ux` | frontend, ui |
| `ui` | frontend |
| `fe` | frontend |
| `be` | backend |
| `ws` | websocket |
| `grpc` | rpc, service |

### 2c. Synonym expansion table

Expand these to match `owns` vocabulary across services:

| Ticket term | Also try matching |
| --- | --- |
| login | auth, authentication, session |
| signup | registration, users, identity |
| logout | session, auth, token |
| forgot password | auth, email, reset |
| 401 | auth, token, jwt |
| 403 | authorization, rbac, permissions |
| 404 | routing, endpoint |
| 500 | error, stability |
| token | jwt, auth, session |
| checkout | payments, cart, orders |
| invoice | billing, payments, finance |
| email | notifications, messaging |
| push notification | notifications, messaging |
| webhook | events, integration |
| rate limit | throttling, quota |
| slow | latency, performance |
| memory | infrastructure, performance |
| crash | stability, error |
| deploy | infra, ci, cd |

---

## Step 3 — Score each repo

For each repo, compute a raw match score. Score every token (original + expansions):

| Match type | Points |
| --- | --- |
| Exact match: token == `owns` keyword | +3 |
| Partial match: token is substring of `owns` keyword, or vice versa | +1 |
| HTTP path match: token matches (prefix of) an `endpoints` entry | +4 |
| Event name match: token matches `emits` or `consumes` | +3 |
| Explicit repo `name` mentioned verbatim | +5 |
| Framework/language match | +1 |
| `owner.team` name match | +2 |
| Error code match (e.g., "401") found in `errorContracts.codes` | +4 |
| JWT claim name match found in `authContracts.requires` or `authContracts.issues` | +3 |
| Env var name match in `configContracts.envVars` | +2 |

**Score normalization:** Divide the raw score by `max(1, owns.length - 1)`. This dampens repos with many generic keywords without penalizing small repos that have a single highly-relevant keyword:

- 1-keyword repo → divides by 1 (no change) — a single exact match stays at full strength
- 3-keyword repo → divides by 2
- 6-keyword repo → divides by 5

This ensures a single exact `owns` match always beats additional `owns` partial matches on a keyword-rich repo. Note: non-`owns` signals (endpoints +4, explicit name +5, error codes +4) are added to the normalized `owns` score and can still push a keyword-rich repo ahead — this is intentional, since a direct endpoint match is stronger evidence than keyword overlap.

---

## Step 4 — Filter and cap

- Keep repos with normalized score > 0.
- Sort descending by normalized score.
- Cap at **5 candidates**.
- Compute routing confidence for the top candidate:

```
routingConfidence = (topScore / (topScore + secondScore + 1)) × 100  (integer percent)
```

If only 1 candidate has score > 0, routingConfidence = 100. If 0 candidates, routingConfidence = 0.

### Aggregate confidence formula (canonical definition)

This formula is used by both `/repo-orch-triage` and the master agent when synthesising specialist reports. It is defined here as the single source of truth:

```
weighted_score(s) = CONFIDENCE(s) × ROUTING_CONFIDENCE(s) / 100
aggregate = sum(weighted_score) ÷ count(remaining specialists)
```

Where:
- `CONFIDENCE(s)` is the 0–100 confidence the specialist reported in its verdict
- `ROUTING_CONFIDENCE(s)` is the routing confidence score assigned to that specialist when they were selected (from the ROUTING CONTEXT block)
- "remaining specialists" excludes any specialist dropped as NOT_RESPONSIBLE with confidence ≥ 80%
- If every remaining specialist is PARTIALLY_RESPONSIBLE, apply an additional 0.8× penalty to the aggregate

Both triage and master must use this formula. The "simple average" shorthand in the master agent's synthesis rules is superseded by this definition.

**Single-repo shortcut:** If routingConfidence ≥ 80% and only one candidate is meaningfully ahead (gap ≥ 4 points from second), pass this directly to the master for single-subagent dispatch.

**Zero candidates:** Report: "No responsible repo identified — ticket keywords did not match any `owns` fields. Check `.repo-orchestrator/registry.json` or run `/repo-orch-edit` to add keywords."

---

## Step 5 — Build the routing context block

Produce a **ROUTING CONTEXT** block that is passed verbatim to every specialist:

```text
ROUTING CONTEXT
===============
Ticket keywords (normalized): <comma-separated extracted + expanded tokens>
Routing confidence: <N>%
Your routing score: <N> (raw=<N>, normalized=<N.N>)
Reason you were selected: <matched owns / endpoints / events / name listed>

Teammates in this triage (agent name first — use it as the mailbox address):
  agent: repo-<repo2>  name: <repo2>  score=<N>  reason="..."
  agent: repo-<repo3>  name: <repo3>  score=<N>  reason="..."
```

**Mailbox addressing rule:** When sending deliberation messages, use the agent name (the `repo-<name>` form, e.g., `repo-payments`) as the mailbox address — not the human-readable repo name. The agent name is listed in the "agent:" column above.

This context block serves three purposes:
1. Tells each specialist **why** it was selected — calibrate scrutiny accordingly.
2. Tells each specialist **who else** is in the team and their **exact mailbox address**.
3. Gives each specialist the routing confidence so they know when to be skeptical of their own selection.

---

## Step 6 — Return the routing decision (for the master)

```
ROUTING DECISION
================
Ticket keywords: <comma-separated>
Routing confidence: <N>%

Candidates (ranked):
1. <repo-name>  score=<N>  reason="<matched owns/endpoints/events>"
2. <repo-name>  score=<N>  reason="..."
...

Action: <"Spawn Agent Team with candidates 1–N" | "Single subagent: <repo-name> (confidence ≥ 80%)" | "No candidate found">
```

---

## Step 7 — Edge cases

- **Unregistered directory:** If the ticket mentions a directory that exists in the workspace but has no registry entry, add: "Warning: `<dir>` appears in workspace but is not registered. Run `/repo-orch-sync` to detect new repos."
- **Registry missing:** Stop: "Registry not found. Run `/repo-orch-init` first."
- **All repos tie:** Prefer repos whose `owns` contains the most specific (rarest / shortest) keyword match.
- **No `owns` keywords set:** Warn: "`<repo>` has an empty `owns` field — routing will miss it. Run `/repo-orch-edit <repo>` to add domain keywords."
- **Ticket is very short (< 5 tokens after normalization):** In interactive mode, ask for more context before routing: "The ticket text is too brief to route confidently. What service, endpoint, or user action is affected?" In headless/programmatic mode (system prompt contains "Do not ask clarifying questions"), skip this check and proceed with best-effort routing using the available tokens — flag low confidence in the ROUTING DECISION output instead.
