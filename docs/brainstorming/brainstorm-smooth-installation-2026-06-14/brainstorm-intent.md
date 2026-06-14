---
title: Smooth Installation Experience — Intent
topic: Make the repo-orchestrator plugin installation experience very smooth — zero-friction from /plugin install to a working, bootstrapped, restart-ready state
goal: A developer installs and reaches working state with no manual build or wiring — eliminating the bootstrap paradox (rich runner not shipped built), auto-wiring optional tiers, fixing doc drift, and providing a polished install flow
status: complete
date: 2026-06-14
---

## Problem & Goal

The plugin does not work right after `/plugin install`: only source ships, while the value-add tiers (setup runner, indexer) are compiled TypeScript that need an `npm install` + `tsc` the user never runs. The goal is a path where a developer installs and reaches a working, bootstrapped, restart-ready state with no manual build or wiring — auto-wired optional tiers, no doc drift, and a polished install flow.

## Root Cause (Five Whys)

There is **no packaging boundary between authoring and distribution**. The build model was designed for development (per-package `tsc`, gitignored `dist/`) and was never reconciled with distribution to non-developers who shouldn't need a toolchain. No "ship build" exists that yields self-contained, dependency-free, install-time artifacts — so installed users get source that cannot run.

## The Breakthrough

Don't *fix* the bootstrap paradox — *eliminate* it by removing the compiled runner from the critical path. Invert primacy:

- The Claude-native, no-toolchain install path is **PRIMARY** — universal and auditable.
- The compiled runner is an **optional accelerator** that must **never gate** a working install.
- The irreducible core of install is "discover repos -> write valid `registry.json` + per-repo context" — i.e. `/repo-orch-init` alone. The registry is the one thing install MUST produce.
- Therefore **INIT is the irreducible install; SETUP is optional polish.**

Two techniques converged on this: "invert primacy" (What If: no Node) and "init is irreducible" (Irreducible Core) are one realization.

## Decided Direction

- **Invert primacy** — the Claude-native, no-toolchain wizard is the primary install path (universal + auditable); the bundled compiled runner is an optional speed-up, never on the critical path.
- **Packaging / ship build** — add a "ship build" (esbuild -> single un-minified, dependency-free bundle) for the setup runner + indexer; commit the setup bundle so it exists at install; keep MCP build-on-install (needs SDK at runtime).
- **Zero hand-editing / auto-wire MCP** — installer auto-wires MCP into `.claude/settings.json` and auto-creates `config.json` via programmatic JSON merge; the user never edits config by hand.
- **Transparency-as-feature** — the wizard prints exactly what it wrote and where, plus a one-line safety contract; ship readable (not minified) bundles with a checksum.
- **Deterministic health check + idempotent + restart-gate** — a no-LLM post-install health check; idempotent/resumable re-run; restart-gating that is skipped when Agent Teams is already active.

## Scope (MoSCoW)

| Priority | Items |
| --- | --- |
| **Must** | Invert primacy (Claude-native init core); auto-wire MCP; fix doc drift; non-blocking tier degradation; restart-gate |
| **Should** | `@clack/prompts` wizard; deterministic health check; "what I wrote" screen; tighten SessionStart detection |
| **Could** | Two-track runner; dry-run mode; reset command |
| **Won't (now)** | Telemetry; minified bundles |

## Key Insights

- **No packaging boundary** — the root cause is the missing distinction between a dev build (gitignored `dist/`, per-package `tsc`) and a ship build producing self-contained install-time artifacts.
- **Observer-effect tension** — the smoother the install, the less users scrutinize a tool that writes agents + hooks into their workspace; polish erodes propose-only vigilance, so transparency must be turned into an explicit feature ("wrote 3 agents, 1 read-only hook, never touches service code" + safety acknowledgement).
- **Convergence on "runner must never gate install"** — Irreducible Core and What-If (no Node) independently land on the same point: Claude-native init is universal and primary; the compiled runner is only an accelerator.
- **Auditability over speed** — a minified blob is unauditable in a propose-only tool; ship readable bundles + checksum, or prefer the auditable Claude-native path.
- **Readiness must not cost** — the health check must be deterministic/no-LLM; a real dry-run triage would spend tokens just to observe readiness.

## Open Questions / Next

- Confirm the esbuild ship-build pipeline and which artifacts are committed vs. release-attached (setup bundle committed; MCP build-on-install).
- Define the explicit workspace marker that tightens SessionStart detection to avoid monorepo false-positives; make the banner once-per-workspace/dismissible.
- Specify the deterministic health-check checks (files exist, registry schema-valid, agents present) and the green/red + auto-fix-hint output.
- Detail idempotent/resumable re-run semantics and the reset/uninstall command (Could-tier).
- Finalize the Agent-Teams-active detection used to skip the restart gate.
