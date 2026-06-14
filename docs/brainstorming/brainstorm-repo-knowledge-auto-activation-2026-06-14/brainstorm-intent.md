---
title: Auto-Activated Repo Knowledge for RepoOrch
topic: Auto-build RepoOrch per-repo + master-level knowledge as part of each repo's skills, activated during install/setup, reusing the existing Claude session with no LLM key prompt or error
goal: Zero-friction install — orchestrator knowledge is just there and stays fresh, piggybacking on the already-authenticated Claude Code session
status: complete
date: 2026-06-14
---

# Auto-Activated Repo Knowledge for RepoOrch

## Problem / Goal

RepoOrch should make per-repo and cross-repo (master) knowledge available automatically, generated as part of each repo's skills and activated during install/setup. The build must reuse the already-authenticated Claude Code session with no LLM key prompt or error, so orchestrator knowledge is simply present from day one and stays fresh as code changes.

## Decided design

**Two-tier skill model.**

- Per-repo skill `repo-<name>-knowledge` — triggers on that repo's own domain keywords.
- Master `workspace-routing` skill — triggers on cross-repo / which-repo questions.

**Triggers and handoff.**

- A developer working in repo-A asks a repo-A question: that repo's skill keywords match and fire directly.
- A developer in repo-A asks a repo-B question: repo-A's skill trigger won't match, so the master `workspace-routing` skill fires instead and routes to repo-B.

**Query / handoff flow.**

- The master routing skill resolves the owner via the registry's `find_owning_repos`, then hands off to the owning repo's skill/graph.
- The master redirects — it does not hold repo detail. The master graph is a summary/ownership index: which repo is responsible for what. Queries hit the master first, which routes/propagates down to the relevant repo graph.

**No-API-key deterministic build.**

- Knowledge build is deterministic (AST / graphify) and requires NO API key.
- It runs in the existing session at install/setup: on install, the first knowledge graph is generated in every repo, plus a master graph at the root that links the per-repo graphs.
- Updates on change: repo graphs and the master refresh via a post-commit hook plus fingerprint drift detection.

## Scope (MoSCoW)

| Priority | Items |
| --- | --- |
| Must | Per-repo graph; master summary; both skills generated at setup; no-key build; update-on-change |
| Should | Master to repo propagation; routing-poisoning bound; graph-query-first |
| Won't (now) | Key-requiring semantic extraction |

## Key insights

- The master graph is a routing **index** (ownership), not a copy of repo detail. That is why it stays small and why queries hit it first and then propagate down.
- The per-repo skill trigger keywords **are** the master's routing keys (registry owns / endpoints / emits) — one source, two consumers. This means routing-poisoning (security concern #2) is the same surface as ownership knowledge, so it must be bounded / advisory.

## Open questions / next

- How to bound routing-poisoning given that trigger keywords double as routing keys — keep it advisory; define the exact bounding mechanism.
- Concrete shape of the registry and its `find_owning_repos` contract.
- Master to repo propagation mechanics (Should-tier): how routing cascades to the owning repo graph.
- Fingerprint-drift detection details for the post-commit update path.
- Deferred: key-requiring semantic extraction is out of scope now and would need its own design.
