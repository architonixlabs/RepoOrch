---
name: routing
description: "Select which repo specialist agents to involve for a given ticket. Uses keyword scoring against each repo's owns, endpoints, emits, and consumes fields."
---

# Routing Skill

Use this skill when the master controller needs to select which repo specialist agents to involve for a given ticket or incident description.

## Goal

Given a ticket/incident text and the current `registry.json`, return a ranked list of candidate repos (cap at 5). Each candidate must have a confidence score and a reason.

## Step-by-step routing

### 1. Load the registry

Read `.repo-orchestrator/registry.json`. Extract the `repos` array. For each repo, the routing-relevant fields are:
- `name`
- `owns` — domain keywords
- `endpoints` — HTTP routes
- `emits` / `consumes` — event names
- `languages` / `frameworks` — for tech-specific tickets

### 2. Extract keywords from the ticket

Parse the ticket text for:
- Domain terms (e.g., "login", "token", "payment", "invoice", "notification")
- HTTP paths (e.g., `/api/auth`, `/payments/refund`)
- Event names (e.g., `user.created`, `order.placed`)
- Error messages containing service-specific strings
- Explicit service/repo names mentioned by the reporter

Normalise to lowercase. Strip common stop words (the, a, an, is, was, etc.).

### 3. Score each repo

For each repo, compute a match score:
- **Exact keyword match in `owns`:** +3 points per match
- **Partial/substring match in `owns`:** +1 point per match
- **Endpoint match** (ticket mentions a path present in `endpoints`): +4 points
- **Event match** (ticket mentions an event in `emits` or `consumes`): +3 points
- **Framework/language match** (ticket mentions a tech in `languages`/`frameworks`): +1 point
- **Explicit name mention** (ticket text contains the repo `name`): +5 points

### 4. Filter and cap

- Keep repos with score > 0.
- Sort descending by score.
- Cap at **5 candidates**.
- If only 1 candidate has score > 0, skip the Agent Team entirely and use a single subagent.
- If 0 candidates, report "No responsible repo identified. Review `registry.json` `owns` fields."

### 5. Return a routing decision

Output in this format:

```
ROUTING DECISION
================
Ticket keywords: <comma-separated extracted keywords>

Candidates (ranked):
1. <repo-name>  score=<N>  reason="<matched owns/endpoints/events>"
2. <repo-name>  score=<N>  reason="..."
...

Action: <"Spawn Agent Team with candidates 1-N" | "Use single subagent: <repo-name>" | "No candidate found">
```

### 6. Edge cases

- **New repo not in registry:** If the ticket mentions a directory that exists in the workspace but has no registry entry, note it: "Warning: `<dir>` appears in workspace but is not registered. Run `/init-context` or `/sync-context`."
- **Registry missing:** If `.repo-orchestrator/registry.json` does not exist, stop and instruct: "Registry not found. Run `/init-context` first."
- **All repos score equally:** Prefer repos whose `owns` contains the most specific (rarest) keyword match.
