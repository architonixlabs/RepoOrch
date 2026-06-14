---
name: workspace-knowledge
description: "Answer questions about the whole workspace — which repo owns or handles something, where a feature/endpoint/event lives, or how concerns span repos. Reads registry.json as the ownership index, routes the question to the owning repo, and hands off to that repo's specialist for detail. Use for cross-repo and 'which repo…' / 'where is…' questions; for a single named repo, call that repo's specialist directly."
---

# Workspace Knowledge Skill (Master Tier)

Use this skill when a developer, architect, or designer asks a **knowledge** question about the workspace rather than a single, already-known repo — e.g. "which repo handles login?", "where does the user table get written?", "what services emit `order.created`?", "how does auth flow across repos?".

This is the **master tier** of the two-tier knowledge model:

- **Master (this skill)** holds only the *ownership index* — which repo is responsible for what — and **redirects** to the owning repo. It does not hold per-repo detail.
- **Per-repo (the `repo-<name>` specialist agent + its context file / graph)** holds the deep detail. The master hands off to it.

> Distinction from the `routing` skill: `routing` selects specialists for a **ticket/incident** in a triage flow. `workspace-knowledge` answers a **question** and returns an explanation, routing to the owning repo(s) and synthesizing — not spinning up a triage team.

This skill is **read-only and needs no API key**: it reads local `registry.json` and repo context, and delegates to existing agents.

---

## Step 1 — Load the ownership index

Read `.repo-orchestrator/registry.json`. If it does not exist, stop:
> "Registry not found. Run `/repo-orch-init` first."

The registry is the master's entire knowledge: one entry per repo with `name`, `path`, `owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`, and the contract fields. The per-repo *detail* lives in `.repo-orchestrator/context/<name>.md` and the Claude-native knowledge summary `.repo-orchestrator/graphs/<name>/summary.json` (built by `/repo-orch-graph`) — the master only indexes and redirects.

---

## Step 2 — Classify the question

- **Single-repo** — the question names a repo, or one repo is the obvious owner. → Hand off to that one specialist (Step 4).
- **Which-repo / where-is** — "which repo owns X?", "where does X live?". → Score and return the owner(s) (Step 3 → 4).
- **Cross-repo** — spans multiple services ("how does auth flow from gateway to payments?", "what breaks if I rename `userId`?"). → Resolve all involved repos and synthesize across their handoffs (Step 4, multiple).

---

## Step 3 — Resolve the owning repo(s)

Score repos against the question's key terms using the **same scoring model as the `routing` skill** (exact `owns` match +3, endpoint path match +4, event match +3, explicit repo name +5, normalized by `max(1, owns.length - 1)`). Reuse that skill's acronym/synonym expansion tables — don't reinvent them.

- Keep repos with normalized score > 0; sort descending; cap at 5.
- **Ownership is advisory, not exclusive.** A repo's self-declared `owns` is a *ranked signal*, not proof — the routing arrays are bounded (`maxItems 100`) specifically so a repo cannot keyword-stuff its way to ownership. If the top two repos are close (gap < 2), present both and say the ownership is ambiguous rather than asserting one.
- If **zero** repos match: say so plainly — "No registered repo claims this; it may be unowned, or `owns` keywords are missing (run `/repo-orch-edit`)." Do not guess an owner.

---

## Step 4 — Hand off to the owning repo's knowledge

For each resolved owner, get the detail from that repo — **prefer the cheapest source that answers the question**:

1. **The repo's context file** — `.repo-orchestrator/context/<name>.md` (frontmatter has owns/endpoints/contracts; prose has architecture). Usually enough for "which/where" questions.
2. **The repo's knowledge summary** — `.repo-orchestrator/graphs/<name>/summary.json` (built by `/repo-orch-graph`, no API key). Its `purpose`, `keyModules`, `criticalPaths`, `entryPoints`, `crossRepoContracts`, and `domainConcepts` answer most architecture / "where does X happen" questions without reading source. If it's missing, suggest `/repo-orch-graph <name>`.
3. **The repo specialist agent** — for deep questions (impact analysis, failure modes, code navigation), delegate to the `repo-<name>` agent (it reads before it answers and cites file:line). Address it by its agent name (`repo-<name>`).

The master's job is to **route and frame**, not to read another repo's source directly. Let the owning repo's specialist/context be the source of truth.

---

## Step 5 — Answer

- Lead with **which repo(s)** own the concern and **why** (the matched `owns`/`endpoints`/events — the evidence for the routing).
- Then give the answer from the owning repo's knowledge, with citations (context file fields, graph nodes, or the specialist's file:line).
- For **cross-repo** questions, name each repo's role and the contract that connects them (`providesTo`/`dependsOn`, shared events, shared tables), then synthesize the flow.
- **Never fabricate** an owner or a detail not present in the registry / context / graph. If the index is insufficient, say what's missing and which command fixes it (`/repo-orch-sync` to detect new repos, `/repo-orch-edit` to add keywords).

---

## Edge cases

- **Registry missing:** stop → "Run `/repo-orch-init` first."
- **Unregistered directory mentioned:** "`<dir>` exists in the workspace but isn't registered — run `/repo-orch-sync`."
- **Ambiguous ownership (scores tied/close):** present the candidates and their evidence; ask the user to disambiguate rather than picking one.
- **Empty `owns` on the likely owner:** "`<repo>` looks relevant but has no `owns` keywords — routing may miss it. Run `/repo-orch-edit <repo>`."
- **Stale knowledge:** if a repo's `fingerprint`/`lastIndexed` suggests drift (source changed since indexing), flag that the answer may be stale and suggest re-indexing.
